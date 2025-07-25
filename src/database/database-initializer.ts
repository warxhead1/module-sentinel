/**
 * Centralized Database Initializer
 *
 * Single source of truth for database schema initialization.
 * All table creation happens through Drizzle migrations.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as path from "path";
import * as fs from "fs/promises";
import { sql } from "drizzle-orm";

export class DatabaseInitializer {
  private static instance: DatabaseInitializer;

  private constructor() {}

  static getInstance(): DatabaseInitializer {
    if (!DatabaseInitializer.instance) {
      DatabaseInitializer.instance = new DatabaseInitializer();
    }
    return DatabaseInitializer.instance;
  }

  /**
   * Initialize database with unified schema
   * This is the ONLY place where database schema is created
   */
  async initializeDatabase(dbPath: string): Promise<Database.Database> {
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // Open database
    const db = new Database(dbPath);

    // Enable foreign keys - MUST be done before any operations
    db.exec("PRAGMA foreign_keys = ON");

    // Run migrations from unified schema
    await this.runMigrations(db);

    // Verify schema integrity
    await this.verifySchema(db);

    console.log("✅ Database initialized successfully");
    return db;
  }

  /**
   * Run migrations using the SQL files in migrations folder
   */
  private async runMigrations(db: Database.Database): Promise<void> {
    const drizzleDb = drizzle(db);

    try {
      // Create migrations tracking table
      drizzleDb.run(sql`
        CREATE TABLE IF NOT EXISTS __drizzle_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL UNIQUE,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Check if we have old Drizzle hash-based migrations
      const hasOldMigration = drizzleDb.get(sql`
        SELECT 1 FROM __drizzle_migrations 
        WHERE length(hash) > 20 AND hash NOT LIKE '%_%'
      `);

      // If we have the old hash-based migration, consider the base schema as applied
      if (hasOldMigration) {
        // Mark our first migration as applied since Drizzle already created the base schema
        const firstMigration = '0001_unified_schema';
        const hasFirstMigration = drizzleDb.get(sql`
          SELECT 1 FROM __drizzle_migrations WHERE hash = ${firstMigration}
        `);
        
        if (!hasFirstMigration) {
          drizzleDb.run(sql`
            INSERT INTO __drizzle_migrations (hash) VALUES (${firstMigration})
          `);
        }
      }

      // Get list of migration files
      const migrationsDir = path.join(__dirname, "migrations");
      const files = await fs.readdir(migrationsDir);
      const migrationFiles = files.filter((f) => f.endsWith(".sql")).sort(); // Ensure migrations run in order

      // Run each migration if not already applied
      for (const file of migrationFiles) {
        const migrationName = file.replace(".sql", "");

        // Check if migration already applied
        const existing = drizzleDb.get(sql`
          SELECT 1 FROM __drizzle_migrations WHERE hash = ${migrationName}
        `);

        if (!existing) {
          const migrationPath = path.join(migrationsDir, file);
          const migrationSql = await fs.readFile(migrationPath, "utf-8");

          console.log(`🔄 Running migration: ${migrationName}`);

          // Execute migration
          db.exec(migrationSql);

          // Mark as complete
          drizzleDb.run(sql`
            INSERT INTO __drizzle_migrations (hash) VALUES (${migrationName})
          `);
          
          console.log(`✅ Migration completed: ${migrationName}`);
        }
      }
    } catch (error) {
      console.error("Failed to run migrations:", error);
      throw error;
    }
  }

  /**
   * Verify that all required tables exist
   */
  private async verifySchema(db: Database.Database): Promise<void> {
    const requiredTables = [
      "projects",
      "languages",
      "project_languages",
      "universal_symbols",
      "universal_relationships",
      "symbol_calls",
      "code_flow_paths",
      "control_flow_blocks",
      "data_flow_edges",
      "file_index",
      "detected_patterns",
      "semantic_tag_definitions",
      "symbol_semantic_tags",
      // Semantic intelligence tables
      "semantic_clusters",
      "cluster_membership",
      "semantic_insights",
      "insight_recommendations",
      "code_embeddings",
      "semantic_relationships",
    ];

    const drizzleDb = drizzle(db);

    for (const table of requiredTables) {
      const result = drizzleDb.get(sql`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=${table}
      `);

      if (!result) {
        throw new Error(`Required table '${table}' not found in database`);
      }
    }

    console.log("✅ Schema verification passed");
  }

  /**
   * Reset database to clean state (for testing)
   */
  async resetDatabase(dbPath: string): Promise<Database.Database> {
    console.log("🔄 Resetting database...");

    // Remove existing database
    try {
      await fs.unlink(dbPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    // Initialize fresh database
    return this.initializeDatabase(dbPath);
  }

  /**
   * Check if database needs migration
   */
  async needsMigration(db: Database.Database): Promise<boolean> {
    const drizzleDb = drizzle(db);

    try {
      const result = drizzleDb.get(sql`
        SELECT hash FROM __drizzle_migrations 
        WHERE hash = '0001_unified_schema'
      `);

      return !result;
    } catch {
      // Migration table doesn't exist
      return true;
    }
  }
}
