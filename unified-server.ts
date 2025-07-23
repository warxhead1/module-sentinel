#!/usr/bin/env tsx

/**
 * Unified Server - Serves both API and Dashboard on the same port
 * Perfect for Docker deployments
 */

import Database from "better-sqlite3";
import { ModernApiServer } from "./dist/api/server.js";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import * as http from "http";
import * as url from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DatabaseConfig, getDatabasePath } from "./dist/config/database-config.js";
import { DatabaseInitializer } from "./dist/database/database-initializer.js";

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || "6969");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Get database path from centralized config
const dbConfig = DatabaseConfig.getInstance();
const DB_PATH = dbConfig.getDbPath();

// Log configuration on startup
console.log("🚀 Starting Module Sentinel Unified Server...");
dbConfig.logConfig();

class UnifiedServer {
  private db: Database.Database;
  private apiServer: ModernApiServer;
  private viteServer: any;
  private server: http.Server;

  private constructor(db: Database.Database) {
    this.db = db;

    // Check database has data
    try {
      // Try to get symbol count, but don't fail if table doesn't exist
      const symbolCount = this.db
        .prepare("SELECT COUNT(*) as count FROM universal_symbols")
        .get() as { count: number };
      console.log(`📈 Database contains ${symbolCount.count} symbols`);

      if (symbolCount.count === 0) {
        console.log("⚠️  Database is empty. Run tests to populate it:");
        console.log("   npm test");
      }
    } catch (error) {
      // If universal_symbols doesn't exist, check for languages table instead
      try {
        const languageCount = this.db
          .prepare("SELECT COUNT(*) as count FROM languages")
          .get() as { count: number };
        console.log(`📈 Database contains ${languageCount.count} languages`);
        console.log("⚠️  No symbols table found. Database is partially initialized.");
      } catch (langError) {
        console.error(
          "❌ Database schema error. Please run rebuild script:"
        );
        console.error("   npx tsx scripts/rebuild-db.ts --clean");
        process.exit(1);
      }
    }

    // Initialize API server (but don't start it yet)
    this.apiServer = new ModernApiServer(this.db, 0); // Use 0 to not bind to a port

    // Create unified HTTP server
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * Run database migrations to ensure all tables exist
   */
  private runMigrations(): void {
    try {
      console.log('🔄 Running database migrations...');
      
      // Check if migrations metadata table exists
      const metadataExists = this.checkMigrationMetadata();
      
      if (!metadataExists) {
        console.log('📋 No migration metadata found, checking existing tables...');
        if (this.hasExistingTables()) {
          console.log('✅ Tables already exist, marking migrations as complete');
          this.createMigrationMetadata();
          return;
        }
      }
      
      // Create drizzle instance for migrations
      const drizzleDb = drizzle(this.db);
      
      // Path to migrations
      const migrationsPath = path.join(process.cwd(), 'src/database/drizzle/migrations');
      
      if (!fs.existsSync(migrationsPath)) {
        console.log('⚠️  No migrations folder found, creating tables manually...');
        this.createTablesManually();
        return;
      }
      
      // Run migrations
      migrate(drizzleDb, { migrationsFolder: migrationsPath });
      console.log('✅ Database migrations completed');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      console.log('⚠️  Attempting to create tables manually...');
      this.createTablesManually();
    }
  }

  /**
   * Check if migration metadata table exists
   */
  private checkMigrationMetadata(): boolean {
    try {
      const result = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get();
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * Check if main tables already exist
   */
  private hasExistingTables(): boolean {
    try {
      const tables = ['projects', 'languages', 'universal_symbols', 'file_index'];
      for (const table of tables) {
        const result = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).get();
        if (!result) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create migration metadata to mark migrations as complete
   */
  private createMigrationMetadata(): void {
    try {
      // Create the drizzle migrations table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS __drizzle_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          created_at INTEGER
        )
      `);
      
      // Mark the migration as applied (using the hash from the existing migration)
      const migrationHash = 'sad_the_executioner'; // From the migration filename
      this.db.prepare(`
        INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) 
        VALUES (?, ?)
      `).run(migrationHash, Date.now());
      
      console.log('📋 Migration metadata created');
    } catch (error) {
      console.warn('Warning creating migration metadata:', error);
    }
  }

  /**
   * Create essential tables manually if migrations fail
   */
  private createTablesManually(): void {
    try {
      console.log('🔄 Creating tables manually...');
      
      // Read and execute the migration SQL directly
      const migrationFile = path.join(process.cwd(), 'src/database/drizzle/migrations/0000_sad_the_executioner.sql');
      
      if (fs.existsSync(migrationFile)) {
        const sql = fs.readFileSync(migrationFile, 'utf-8');
        
        // Split on statement breaks and execute each statement
        const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s);
        
        for (const statement of statements) {
          if (statement && !statement.startsWith('--')) {
            try {
              this.db.exec(statement);
            } catch (err: any) {
              // Ignore table already exists errors
              if (!err.message.includes('already exists')) {
                console.warn('Warning executing statement:', err.message);
              }
            }
          }
        }
        
        console.log('✅ Tables created manually');
      } else {
        console.error('❌ Migration file not found');
      }
    } catch (error) {
      console.error('❌ Failed to create tables manually:', error);
    }
  }

  async start() {
    // In development, use Vite dev server
    if (!IS_PRODUCTION) {
      const { createServer } = await import("vite");
      
      // Create WebSocket server for HMR on a specific port
      const hmrPort = 6970;
      
      this.viteServer = await createServer({
        configFile: "./vite.config.ts",
        server: {
          middlewareMode: true,
          hmr: {
            port: hmrPort,
            host: 'localhost'
          }
        },
        optimizeDeps: {
          include: [] // Prevent excessive re-bundling
        }
      });
      
      console.log(`🔄 HMR WebSocket server configured on ws://localhost:${hmrPort}`);
    } else {
      // In production, build the dashboard first
      console.log("📦 Building dashboard for production...");
      await execAsync("npm run build:dashboard");
      console.log("✅ Dashboard built successfully");
    }

    // Start the unified server
    this.server.listen(PORT, () => {
      console.log(`✅ Unified server started successfully!`);
      console.log(`🌐 Open your browser to: http://localhost:${PORT}`);
      console.log(`📊 API endpoints available at:`);
      console.log(`   - http://localhost:${PORT}/api/symbols`);
      console.log(`   - http://localhost:${PORT}/api/modules`);
      console.log(`   - http://localhost:${PORT}/api/relationships`);
      console.log(`   - http://localhost:${PORT}/api/stats`);
      console.log(`   - http://localhost:${PORT}/api/health`);
      if (!IS_PRODUCTION) {
        console.log(`🔄 Development mode (HMR disabled for stability)`);
      }
      console.log(`\n⏹️  Press Ctrl+C to stop the server`);
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const parsedUrl = url.parse(req.url || "", true);
    const pathname = parsedUrl.pathname || "/";

    // Handle API requests
    if (pathname.startsWith("/api/")) {
      // Use the API server's request handler
      const handler = (this.apiServer as any).handleRequest.bind(
        this.apiServer
      );
      await handler(req, res);
      return;
    }

    // In development, use Vite
    if (!IS_PRODUCTION && this.viteServer) {
      // Let Vite handle all non-API requests
      this.viteServer.middlewares(req, res, () => {
        // Vite didn't handle it, serve index.html for SPA routing
        const indexPath = path.join(process.cwd(), "src/dashboard/index.html");
        if (fs.existsSync(indexPath)) {
          res.setHeader("Content-Type", "text/html");
          const html = fs.readFileSync(indexPath, "utf-8");
          this.viteServer
            .transformIndexHtml(pathname, html)
            .then((transformed: string) => {
              res.end(transformed);
            });
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });
      return;
    }

    // In production, serve static files
    const dashboardDir = path.join(process.cwd(), "dashboard", "dist");

    // Default to index.html for SPA routing
    let filePath: string;
    if (pathname === "/" || !path.extname(pathname)) {
      filePath = path.join(dashboardDir, "index.html");
    } else {
      filePath = path.join(dashboardDir, pathname.substring(1));
    }

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const contentType = this.getContentType(ext);

        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      } else {
        // For SPA routing, serve index.html for unknown routes
        const indexPath = path.join(dashboardDir, "index.html");
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(content);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
      }
    } catch (error) {
      console.error("Static file error:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal server error");
    }
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    return types[ext] || "application/octet-stream";
  }

  async stop() {
    console.log("\n🛑 Shutting down unified server...");

    if (this.viteServer) {
      await this.viteServer.close();
    }

    this.server.close();
    this.db.close();
  }
  
  static async create(db: Database.Database): Promise<UnifiedServer> {
    return new UnifiedServer(db);
  }
}

// Start the server
async function main() {
  // Initialize database using centralized initializer
  const dbInitializer = DatabaseInitializer.getInstance();
  const db = await dbInitializer.initializeDatabase(DB_PATH);
  
  const server = await UnifiedServer.create(db);

  try {
    await server.start();
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
