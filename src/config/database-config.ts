/**
 * Centralized Database Configuration
 * Single source of truth for all database paths based on NODE_ENV
 */
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export class DatabaseConfig {
  private static instance: DatabaseConfig;
  private dbPath: string;
  private dbDir: string;
  private env: string;

  private constructor() {
    // Simple: Check NODE_ENV
    this.env = process.env.NODE_ENV || "development";

    // Use separate databases for each environment
    if (this.env === "production") {
      this.dbPath =
        process.env.PROD_DB ||
        path.join(os.homedir(), ".module-sentinel", "production.db");
    } else if (this.env === "test") {
      // Test environment gets its own isolated database
      this.dbPath =
        process.env.TEST_DB ||
        path.join(os.homedir(), ".module-sentinel", "test", "test.db");
    } else {
      // Development environment
      this.dbPath =
        process.env.DEV_DB ||
        path.join(os.homedir(), ".module-sentinel", "development.db");
    }

    this.dbDir = path.dirname(this.dbPath);

    // Ensure directory exists
    this.ensureDirectoryExists();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DatabaseConfig {
    if (!DatabaseConfig.instance) {
      DatabaseConfig.instance = new DatabaseConfig();
    }
    return DatabaseConfig.instance;
  }

  /**
   * Get the database path for the current environment
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Get the database directory
   */
  getDbDir(): string {
    return this.dbDir;
  }

  /**
   * Get the current environment
   */
  getEnv(): string {
    return this.env;
  }

  /**
   * Get all database paths (for debugging)
   */
  getAllPaths(): { env: string; path: string; exists: boolean } {
    return {
      env: this.env,
      path: this.dbPath,
      exists: fs.existsSync(this.dbPath),
    };
  }

  /**
   * Ensure the database directory exists
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
  }

  /**
   * Log the current configuration
   */
  logConfig(): void {
    console.log("🗄️  Database Configuration:");
  }

  /**
   * Clean up database (for testing or reset)
   */
  async cleanDatabase(): Promise<void> {
    if (fs.existsSync(this.dbPath)) {
      // Create backup first
      const backupPath = `${this.dbPath}.backup.${Date.now()}`;
      fs.copyFileSync(this.dbPath, backupPath);

      // Remove the database
      fs.unlinkSync(this.dbPath);
    }
  }
}

// Export a convenience function
export function getDatabasePath(): string {
  return DatabaseConfig.getInstance().getDbPath();
}

// Export environment check functions
export function isDevelopment(): boolean {
  return DatabaseConfig.getInstance().getEnv() === "development";
}

export function isProduction(): boolean {
  return DatabaseConfig.getInstance().getEnv() === "production";
}

export function isTest(): boolean {
  return DatabaseConfig.getInstance().getEnv() === "test";
}
