/**
 * Centralized Database Configuration
 * Single source of truth for all database paths based on NODE_ENV
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class DatabaseConfig {
  private static instance: DatabaseConfig;
  private dbPath: string;
  private dbDir: string;
  private env: string;

  private constructor() {
    // Simple: Check NODE_ENV
    this.env = process.env.NODE_ENV || 'development';
    
    // Simple: Use PROD_DB or DEV_DB based on NODE_ENV
    if (this.env === 'production') {
      this.dbPath = process.env.PROD_DB || path.join(os.homedir(), '.module-sentinel', 'production.db');
    } else {
      // Everything else (dev, test, whatever) uses DEV_DB
      this.dbPath = process.env.DEV_DB || path.join(os.homedir(), '.module-sentinel', 'development.db');
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
      exists: fs.existsSync(this.dbPath)
    };
  }

  /**
   * Ensure the database directory exists
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
      console.log(`📁 Created database directory: ${this.dbDir}`);
    }
  }

  /**
   * Log the current configuration
   */
  logConfig(): void {
    console.log('🗄️  Database Configuration:');
    console.log(`   Environment: ${this.env}`);
    console.log(`   Database Path: ${this.dbPath}`);
    console.log(`   Database Exists: ${fs.existsSync(this.dbPath)}`);
    console.log(`   Directory: ${this.dbDir}`);
  }

  /**
   * Clean up database (for testing or reset)
   */
  async cleanDatabase(): Promise<void> {
    if (fs.existsSync(this.dbPath)) {
      // Create backup first
      const backupPath = `${this.dbPath}.backup.${Date.now()}`;
      fs.copyFileSync(this.dbPath, backupPath);
      console.log(`📦 Created backup: ${backupPath}`);
      
      // Remove the database
      fs.unlinkSync(this.dbPath);
      console.log(`🗑️  Removed database: ${this.dbPath}`);
    }
  }
}

// Export a convenience function
export function getDatabasePath(): string {
  return DatabaseConfig.getInstance().getDbPath();
}

// Export environment check functions
export function isDevelopment(): boolean {
  return DatabaseConfig.getInstance().getEnv() === 'development';
}

export function isProduction(): boolean {
  return DatabaseConfig.getInstance().getEnv() === 'production';
}

export function isTest(): boolean {
  return DatabaseConfig.getInstance().getEnv() === 'test';
}