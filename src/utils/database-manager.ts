import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;
  private retryCount = 0;
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async getDatabase(): Promise<Database.Database> {
    if (this.db && this.db.open) {
      return this.db;
    }

    return this.reconnect();
  }

  private async reconnect(): Promise<Database.Database> {
    if (this.db) {
      try {
        this.db.close();
      } catch (error) {
        console.warn('Error closing existing database connection:', error);
      }
      this.db = null;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Check if database file exists
        if (!fs.existsSync(this.dbPath)) {
          throw new Error(`Database file not found: ${this.dbPath}`);
        }

        // Check if file is readable
        fs.accessSync(this.dbPath, fs.constants.R_OK);

        // Create new database connection
        this.db = new Database(this.dbPath, { 
          readonly: true,
          timeout: 10000, // 10 second timeout
          verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
        });

        // Test the connection
        await this.testConnection();

        console.log(`✅ Database connection established: ${this.dbPath}`);
        this.retryCount = 0;
        return this.db;

      } catch (error) {
        console.error(`❌ Database connection attempt ${attempt + 1} failed:`, error);
        
        if (attempt < this.maxRetries) {
          console.log(`⏳ Retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          this.retryDelay *= 2; // Exponential backoff
        } else {
          throw new Error(`Failed to connect to database after ${this.maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    throw new Error('Unexpected error in database connection');
  }

  private async testConnection(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Test with a simple query to ensure the database is working
      const result = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").get();
      
      // Check if we have the expected tables
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('enhanced_symbols', 'symbol_relationships', 'antipatterns')
      `).all();

      if (tables.length === 0) {
        throw new Error('Database appears to be empty or using wrong schema');
      }

      console.log(`📊 Database schema validated - found ${tables.length} essential tables`);
    } catch (error) {
      throw new Error(`Database validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async executeQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const db = await this.getDatabase();
    
    try {
      const stmt = db.prepare(query);
      const result = stmt.all(...params);
      return result as T[];
    } catch (error) {
      console.error('Query execution failed:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      
      // If it's a database error, try to reconnect
      if (error instanceof Error && error.message.includes('database')) {
        console.log('🔄 Attempting to reconnect due to database error...');
        await this.reconnect();
        
        // Retry the query once
        const db = await this.getDatabase();
        const stmt = db.prepare(query);
        const result = stmt.all(...params);
        return result as T[];
      }
      
      throw error;
    }
  }

  async executeQuerySingle<T = any>(query: string, params: any[] = []): Promise<T | null> {
    const db = await this.getDatabase();
    
    try {
      const stmt = db.prepare(query);
      const result = stmt.get(...params);
      return result as T | null;
    } catch (error) {
      console.error('Query execution failed:', error);
      
      // If it's a database error, try to reconnect
      if (error instanceof Error && error.message.includes('database')) {
        console.log('🔄 Attempting to reconnect due to database error...');
        await this.reconnect();
        
        // Retry the query once
        const db = await this.getDatabase();
        const stmt = db.prepare(query);
        const result = stmt.get(...params);
        return result as T | null;
      }
      
      throw error;
    }
  }

  getConnectionInfo(): { connected: boolean; path: string; retryCount: number } {
    return {
      connected: this.db !== null && this.db.open,
      path: this.dbPath,
      retryCount: this.retryCount
    };
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
        console.log('🔒 Database connection closed');
      } catch (error) {
        console.warn('Error closing database:', error);
      }
      this.db = null;
    }
  }
}