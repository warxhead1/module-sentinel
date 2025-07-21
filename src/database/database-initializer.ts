/**
 * Centralized Database Initializer
 * 
 * Single source of truth for database schema initialization.
 * All table creation happens through Drizzle migrations.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import { sql } from 'drizzle-orm';

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
    console.log(`🔧 Initializing database at: ${dbPath}`);
    
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    
    // Open database
    const db = new Database(dbPath);
    
    // Enable foreign keys
    db.exec('PRAGMA foreign_keys = ON');
    
    // Run migrations from unified schema
    await this.runMigrations(db);
    
    // Verify schema integrity
    await this.verifySchema(db);
    
    console.log('✅ Database initialized successfully');
    return db;
  }
  
  /**
   * Run migrations using the unified schema SQL file
   */
  private async runMigrations(db: Database.Database): Promise<void> {
    const drizzleDb = drizzle(db);
    
    try {
      // Read unified schema migration
      const migrationPath = path.join(__dirname, 'migrations', '0001_unified_schema.sql');
      const migrationSql = await fs.readFile(migrationPath, 'utf-8');
      
      // Execute migration
      console.log('📊 Running unified schema migration...');
      db.exec(migrationSql);
      
      // Mark migration as complete
      drizzleDb.run(sql`
        CREATE TABLE IF NOT EXISTS __drizzle_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL UNIQUE,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      
      drizzleDb.run(sql`
        INSERT OR IGNORE INTO __drizzle_migrations (hash) VALUES ('0001_unified_schema')
      `);
      
    } catch (error) {
      console.error('Failed to run migrations:', error);
      throw error;
    }
  }
  
  /**
   * Verify that all required tables exist
   */
  private async verifySchema(db: Database.Database): Promise<void> {
    const requiredTables = [
      'projects',
      'languages',
      'project_languages',
      'universal_symbols',
      'universal_relationships',
      'symbol_calls',
      'code_flow_paths',
      'control_flow_blocks',
      'data_flow_edges',
      'file_index',
      'detected_patterns',
      'semantic_tag_definitions',
      'symbol_semantic_tags'
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
    
    console.log('✅ Schema verification passed');
  }
  
  /**
   * Reset database to clean state (for testing)
   */
  async resetDatabase(dbPath: string): Promise<Database.Database> {
    console.log('🔄 Resetting database...');
    
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