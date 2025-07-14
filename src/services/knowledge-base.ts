import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

export class KnowledgeBase {
  private db?: Database.Database;
  private dbPath: string;

  constructor(projectPath: string) {
    this.dbPath = path.join(projectPath, '.module-sentinel', 'knowledge.db');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.createSchema();
  }

  private createSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        location TEXT,
        confidence REAL,
        details TEXT,
        UNIQUE(file_path, type, name, location)
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL,
        UNIQUE(file_path, source, target, type)
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        file_path TEXT PRIMARY KEY,
        hash TEXT NOT NULL
      );
    `);
  }

  async storePatterns(filePath: string, patterns: any[]): Promise<void> {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO patterns (file_path, type, name, location, confidence, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const pattern of patterns) {
      stmt.run(
        filePath,
        pattern.type,
        pattern.name,
        JSON.stringify(pattern.location),
        pattern.confidence,
        JSON.stringify(pattern.details)
      );
    }
  }

  async storeRelationships(filePath: string, relationships: any[]): Promise<void> {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO relationships (file_path, source, target, type, confidence)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const rel of relationships) {
      stmt.run(
        filePath,
        rel.source,
        rel.target,
        rel.type,
        rel.confidence
      );
    }
  }

  async getPatterns(filePath?: string, type?: string): Promise<any[]> {
    if (!this.db) return [];
    let query = 'SELECT * FROM patterns';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filePath) {
      conditions.push('file_path = ?');
      params.push(filePath);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    return this.db.prepare(query).all(...params);
  }

  async getRelationships(filePath?: string, source?: string, target?: string, type?: string): Promise<any[]> {
    if (!this.db) return [];
    let query = 'SELECT * FROM relationships';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filePath) {
      conditions.push('file_path = ?');
      params.push(filePath);
    }
    if (source) {
      conditions.push('source = ?');
      params.push(source);
    }
    if (target) {
      conditions.push('target = ?');
      params.push(target);
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    return this.db.prepare(query).all(...params);
  }

  async getFileHash(filePath: string): Promise<string | null> {
    if (!this.db) return null;
    const result = this.db.prepare('SELECT hash FROM file_hashes WHERE file_path = ?').get(filePath) as { hash: string } | undefined;
    return result ? result.hash : null;
  }

  async updateFileHash(filePath: string, hash: string): Promise<void> {
    if (!this.db) return;
    this.db.prepare('INSERT OR REPLACE INTO file_hashes (file_path, hash) VALUES (?, ?)').run(filePath, hash);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}
