import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

export class TestDatabaseManager {
  private databases: Map<string, Database.Database> = new Map();
  private basePath: string;

  constructor(basePath: string = '.test-db') {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (e) {
      // Directory might already exist
    }
  }

  getDatabase(name: string): Database.Database {
    const existing = this.databases.get(name);
    if (existing && existing.open) {
      return existing;
    }

    // Create new database connection
    const dbPath = path.join(this.basePath, `${name}.db`);
    const db = new Database(dbPath);
    this.databases.set(name, db);
    return db;
  }

  async cleanDatabase(name: string): Promise<void> {
    const db = this.databases.get(name);
    if (db && db.open) {
      db.close();
    }
    
    const dbPath = path.join(this.basePath, `${name}.db`);
    try {
      await fs.unlink(dbPath);
    } catch (e) {
      // File might not exist
    }
    
    this.databases.delete(name);
  }

  async cleanAll(): Promise<void> {
    // Close all databases
    for (const [name, db] of this.databases.entries()) {
      if (db && db.open) {
        db.close();
      }
    }
    this.databases.clear();

    // Remove all database files
    try {
      const files = await fs.readdir(this.basePath);
      for (const file of files) {
        if (file.endsWith('.db')) {
          await fs.unlink(path.join(this.basePath, file));
        }
      }
    } catch (e) {
      // Directory might not exist
    }
  }

  closeAll(): void {
    for (const [name, db] of this.databases.entries()) {
      if (db && db.open) {
        db.close();
      }
    }
  }
}