/**
 * Database Adapter Interface
 * 
 * Provides a clean abstraction layer for different database backends.
 * This allows switching between legacy SQLite, new multi-project schema,
 * or future database systems without changing test logic.
 */

import { Database } from 'better-sqlite3';

export interface SymbolData {
  id?: number;
  name: string;
  qualified_name?: string;
  kind: string;
  file_path: string;
  line: number;
  column?: number;
  signature?: string;
  return_type?: string;
  namespace?: string;
  confidence?: number;
  parser_used?: string;
  semantic_tags?: string[];
  is_exported?: boolean;
  is_template?: boolean;
  complexity?: number;
}

export interface RelationshipData {
  id?: number;
  from_symbol: string;
  to_symbol: string;
  relationship_type: string;
  file_path: string;
  confidence?: number;
}

export interface PatternData {
  id?: number;
  pattern_type: string;
  symbol_name: string;
  file_path: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface DatabaseStats {
  totalSymbols: number;
  totalFiles: number;
  totalRelationships: number;
  totalPatterns: number;
  parserBreakdown: Record<string, number>;
  confidenceAverage: number;
}

/**
 * Abstract base class for database adapters
 */
export abstract class DatabaseAdapter {
  protected db: Database;
  
  constructor(db: Database) {
    this.db = db;
  }
  
  // Symbol operations
  abstract insertSymbol(symbol: SymbolData): Promise<number>;
  abstract getSymbols(filter?: Partial<SymbolData>): Promise<SymbolData[]>;
  abstract getSymbolsByFile(filePath: string): Promise<SymbolData[]>;
  abstract deleteSymbolsByFile(filePath: string): Promise<void>;
  
  // Relationship operations
  abstract insertRelationship(relationship: RelationshipData): Promise<number>;
  abstract getRelationships(filter?: Partial<RelationshipData>): Promise<RelationshipData[]>;
  abstract deleteRelationshipsByFile(filePath: string): Promise<void>;
  
  // Pattern operations
  abstract insertPattern(pattern: PatternData): Promise<number>;
  abstract getPatterns(filter?: Partial<PatternData>): Promise<PatternData[]>;
  abstract deletePatternsByFile(filePath: string): Promise<void>;
  
  // Statistics
  abstract getStats(): Promise<DatabaseStats>;
  
  // Schema management
  abstract initializeSchema(): Promise<void>;
  abstract clearAll(): Promise<void>;
  
  // Utility
  abstract close(): void;
}

/**
 * Legacy SQLite adapter for current enhanced_symbols schema
 */
export class LegacyDatabaseAdapter extends DatabaseAdapter {
  
  async initializeSchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS enhanced_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        qualified_name TEXT,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER DEFAULT 0,
        signature TEXT,
        return_type TEXT,
        parent_scope TEXT,
        namespace TEXT,
        semantic_tags TEXT DEFAULT '[]',
        related_symbols TEXT DEFAULT '[]',
        complexity INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.0,
        parser_confidence REAL DEFAULT 0.0,
        is_definition BOOLEAN DEFAULT 0,
        is_exported BOOLEAN DEFAULT 0,
        is_async BOOLEAN DEFAULT 0,
        is_generated BOOLEAN DEFAULT 0,
        execution_mode TEXT,
        pipeline_stage TEXT,
        parser_used TEXT DEFAULT 'unified',
        parse_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        body_hash TEXT
      );
      
      CREATE TABLE IF NOT EXISTS symbol_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_symbol TEXT NOT NULL,
        to_symbol TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER,
        confidence REAL DEFAULT 0.0,
        metadata TEXT DEFAULT '{}'
      );
      
      CREATE TABLE IF NOT EXISTS antipatterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER,
        confidence REAL DEFAULT 0.0,
        severity TEXT DEFAULT 'medium',
        description TEXT,
        metadata TEXT DEFAULT '{}'
      );
      
      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON enhanced_symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON enhanced_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON enhanced_symbols(kind);
      CREATE INDEX IF NOT EXISTS idx_rel_from ON symbol_relationships(from_symbol);
      CREATE INDEX IF NOT EXISTS idx_rel_to ON symbol_relationships(to_symbol);
    `);
  }
  
  async insertSymbol(symbol: SymbolData): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO enhanced_symbols (
        name, qualified_name, kind, file_path, line, column, signature, 
        return_type, namespace, semantic_tags, confidence, parser_used,
        is_exported, complexity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      symbol.name,
      symbol.qualified_name || null,
      symbol.kind,
      symbol.file_path,
      symbol.line,
      symbol.column || 0,
      symbol.signature || null,
      symbol.return_type || null,
      symbol.namespace || null,
      JSON.stringify(symbol.semantic_tags || []),
      symbol.confidence || 0.0,
      symbol.parser_used || 'unknown',
      symbol.is_exported ? 1 : 0,
      symbol.complexity || 0
    );
    
    return result.lastInsertRowid as number;
  }
  
  async getSymbols(filter?: Partial<SymbolData>): Promise<SymbolData[]> {
    let query = 'SELECT * FROM enhanced_symbols';
    const params: any[] = [];
    
    if (filter) {
      const conditions: string[] = [];
      
      if (filter.name) {
        conditions.push('name = ?');
        params.push(filter.name);
      }
      if (filter.kind) {
        conditions.push('kind = ?');
        params.push(filter.kind);
      }
      if (filter.file_path) {
        conditions.push('file_path = ?');
        params.push(filter.file_path);
      }
      if (filter.parser_used) {
        conditions.push('parser_used = ?');
        params.push(filter.parser_used);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      qualified_name: row.qualified_name,
      kind: row.kind,
      file_path: row.file_path,
      line: row.line,
      column: row.column,
      signature: row.signature,
      return_type: row.return_type,
      namespace: row.namespace,
      confidence: row.confidence,
      parser_used: row.parser_used,
      semantic_tags: row.semantic_tags ? JSON.parse(row.semantic_tags) : [],
      is_exported: row.is_exported === 1,
      is_template: row.semantic_tags?.includes('template') || false,
      complexity: row.complexity
    }));
  }
  
  async getSymbolsByFile(filePath: string): Promise<SymbolData[]> {
    return this.getSymbols({ file_path: filePath });
  }
  
  async deleteSymbolsByFile(filePath: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM enhanced_symbols WHERE file_path = ?');
    stmt.run(filePath);
  }
  
  async insertRelationship(relationship: RelationshipData): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO symbol_relationships (
        from_symbol, to_symbol, relationship_type, file_path, confidence
      ) VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      relationship.from_symbol,
      relationship.to_symbol,
      relationship.relationship_type,
      relationship.file_path,
      relationship.confidence || 0.0
    );
    
    return result.lastInsertRowid as number;
  }
  
  async getRelationships(filter?: Partial<RelationshipData>): Promise<RelationshipData[]> {
    let query = 'SELECT * FROM symbol_relationships';
    const params: any[] = [];
    
    if (filter) {
      const conditions: string[] = [];
      
      if (filter.from_symbol) {
        conditions.push('from_symbol = ?');
        params.push(filter.from_symbol);
      }
      if (filter.to_symbol) {
        conditions.push('to_symbol = ?');
        params.push(filter.to_symbol);
      }
      if (filter.relationship_type) {
        conditions.push('relationship_type = ?');
        params.push(filter.relationship_type);
      }
      if (filter.file_path) {
        conditions.push('file_path = ?');
        params.push(filter.file_path);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      from_symbol: row.from_symbol,
      to_symbol: row.to_symbol,
      relationship_type: row.relationship_type,
      file_path: row.file_path,
      confidence: row.confidence
    }));
  }
  
  async deleteRelationshipsByFile(filePath: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM symbol_relationships WHERE file_path = ?');
    stmt.run(filePath);
  }
  
  async insertPattern(pattern: PatternData): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO antipatterns (
        pattern_type, symbol_name, file_path, confidence, metadata
      ) VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      pattern.pattern_type,
      pattern.symbol_name,
      pattern.file_path,
      pattern.confidence || 0.0,
      JSON.stringify(pattern.metadata || {})
    );
    
    return result.lastInsertRowid as number;
  }
  
  async getPatterns(filter?: Partial<PatternData>): Promise<PatternData[]> {
    let query = 'SELECT * FROM antipatterns';
    const params: any[] = [];
    
    if (filter) {
      const conditions: string[] = [];
      
      if (filter.pattern_type) {
        conditions.push('pattern_type = ?');
        params.push(filter.pattern_type);
      }
      if (filter.symbol_name) {
        conditions.push('symbol_name = ?');
        params.push(filter.symbol_name);
      }
      if (filter.file_path) {
        conditions.push('file_path = ?');
        params.push(filter.file_path);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      pattern_type: row.pattern_type,
      symbol_name: row.symbol_name,
      file_path: row.file_path,
      confidence: row.confidence,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }
  
  async deletePatternsByFile(filePath: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM antipatterns WHERE file_path = ?');
    stmt.run(filePath);
  }
  
  async getStats(): Promise<DatabaseStats> {
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as { count: number };
    const fileCount = this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM enhanced_symbols').get() as { count: number };
    const relCount = this.db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as { count: number };
    const patternCount = this.db.prepare('SELECT COUNT(*) as count FROM antipatterns').get() as { count: number };
    
    const parserBreakdown = this.db.prepare(`
      SELECT parser_used, COUNT(*) as count 
      FROM enhanced_symbols 
      GROUP BY parser_used
    `).all() as { parser_used: string; count: number }[];
    
    const avgConfidence = this.db.prepare(`
      SELECT AVG(confidence) as avg 
      FROM enhanced_symbols 
      WHERE confidence > 0
    `).get() as { avg: number };
    
    const breakdown: Record<string, number> = {};
    parserBreakdown.forEach(row => {
      breakdown[row.parser_used] = row.count;
    });
    
    return {
      totalSymbols: symbolCount.count,
      totalFiles: fileCount.count,
      totalRelationships: relCount.count,
      totalPatterns: patternCount.count,
      parserBreakdown: breakdown,
      confidenceAverage: avgConfidence.avg || 0
    };
  }
  
  async clearAll(): Promise<void> {
    this.db.exec(`
      DELETE FROM enhanced_symbols;
      DELETE FROM symbol_relationships;
      DELETE FROM antipatterns;
    `);
  }
  
  close(): void {
    this.db.close();
  }
}

/**
 * New multi-project/language database adapter
 */
export class MultiProjectDatabaseAdapter extends DatabaseAdapter {
  
  async initializeSchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        language TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_indexed TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS universal_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        language_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER DEFAULT 0,
        signature TEXT,
        return_type TEXT,
        parent_scope TEXT,
        namespace TEXT,
        semantic_tags TEXT DEFAULT '[]',
        related_symbols TEXT DEFAULT '[]',
        complexity INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.0,
        parser_confidence REAL DEFAULT 0.0,
        is_definition BOOLEAN DEFAULT 0,
        is_exported BOOLEAN DEFAULT 0,
        is_async BOOLEAN DEFAULT 0,
        is_generated BOOLEAN DEFAULT 0,
        execution_mode TEXT,
        pipeline_stage TEXT,
        parser_used TEXT DEFAULT 'tree-sitter',
        parse_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        body_hash TEXT,
        FOREIGN KEY (project_id) REFERENCES projects (id)
      );
      
      CREATE TABLE IF NOT EXISTS universal_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        from_symbol_id INTEGER NOT NULL,
        to_symbol_id INTEGER NOT NULL,
        relationship_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER,
        confidence REAL DEFAULT 0.0,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects (id),
        FOREIGN KEY (from_symbol_id) REFERENCES universal_symbols (id),
        FOREIGN KEY (to_symbol_id) REFERENCES universal_symbols (id)
      );
      
      CREATE TABLE IF NOT EXISTS universal_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        pattern_type TEXT NOT NULL,
        symbol_id INTEGER,
        file_path TEXT NOT NULL,
        line INTEGER,
        confidence REAL DEFAULT 0.0,
        severity TEXT DEFAULT 'medium',
        description TEXT,
        metadata TEXT DEFAULT '{}',
        FOREIGN KEY (project_id) REFERENCES projects (id),
        FOREIGN KEY (symbol_id) REFERENCES universal_symbols (id)
      );
      
      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_universal_symbols_project ON universal_symbols(project_id);
      CREATE INDEX IF NOT EXISTS idx_universal_symbols_file ON universal_symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_universal_symbols_name ON universal_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_universal_relationships_project ON universal_relationships(project_id);
      CREATE INDEX IF NOT EXISTS idx_universal_patterns_project ON universal_patterns(project_id);
    `);
    
    // Ensure default project exists
    const defaultProject = this.db.prepare(`
      INSERT OR IGNORE INTO projects (id, name, path, language) 
      VALUES (1, 'default', '/workspace', 'cpp')
    `);
    defaultProject.run();
  }
  
  // Implementation for new schema follows same pattern as legacy adapter
  // but uses the universal_* tables and project_id foreign keys
  
  async insertSymbol(symbol: SymbolData): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO universal_symbols (
        project_id, language_id, name, qualified_name, kind, file_path, line, column, 
        signature, return_type, namespace, semantic_tags, confidence, parser_used,
        is_exported, complexity
      ) VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      symbol.name,
      symbol.qualified_name || null,
      symbol.kind,
      symbol.file_path,
      symbol.line,
      symbol.column || 0,
      symbol.signature || null,
      symbol.return_type || null,
      symbol.namespace || null,
      JSON.stringify(symbol.semantic_tags || []),
      symbol.confidence || 0.0,
      symbol.parser_used || 'unknown',
      symbol.is_exported ? 1 : 0,
      symbol.complexity || 0
    );
    
    return result.lastInsertRowid as number;
  }
  
  async getSymbols(filter?: Partial<SymbolData>): Promise<SymbolData[]> {
    // Similar implementation using universal_symbols table
    let query = 'SELECT * FROM universal_symbols WHERE project_id = 1';
    const params: any[] = [];
    
    if (filter) {
      if (filter.name) {
        query += ' AND name = ?';
        params.push(filter.name);
      }
      if (filter.kind) {
        query += ' AND kind = ?';
        params.push(filter.kind);
      }
      if (filter.file_path) {
        query += ' AND file_path = ?';
        params.push(filter.file_path);
      }
      if (filter.parser_used) {
        query += ' AND parser_used = ?';
        params.push(filter.parser_used);
      }
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      qualified_name: row.qualified_name,
      kind: row.kind,
      file_path: row.file_path,
      line: row.line,
      column: row.column,
      signature: row.signature,
      return_type: row.return_type,
      namespace: row.namespace,
      confidence: row.confidence,
      parser_used: row.parser_used,
      semantic_tags: row.semantic_tags ? JSON.parse(row.semantic_tags) : [],
      is_exported: row.is_exported === 1,
      is_template: row.semantic_tags?.includes('template') || false,
      complexity: row.complexity
    }));
  }
  
  // Stub implementations for other methods - would follow similar pattern
  async getSymbolsByFile(filePath: string): Promise<SymbolData[]> { return this.getSymbols({ file_path: filePath }); }
  async deleteSymbolsByFile(filePath: string): Promise<void> { 
    this.db.prepare('DELETE FROM universal_symbols WHERE file_path = ? AND project_id = 1').run(filePath);
  }
  async insertRelationship(relationship: RelationshipData): Promise<number> { return 0; }
  async getRelationships(filter?: Partial<RelationshipData>): Promise<RelationshipData[]> { return []; }
  async deleteRelationshipsByFile(filePath: string): Promise<void> { }
  async insertPattern(pattern: PatternData): Promise<number> { return 0; }
  async getPatterns(filter?: Partial<PatternData>): Promise<PatternData[]> { return []; }
  async deletePatternsByFile(filePath: string): Promise<void> { }
  
  async getStats(): Promise<DatabaseStats> {
    // Similar to legacy but queries universal_symbols with project_id = 1
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM universal_symbols WHERE project_id = 1').get() as { count: number };
    const fileCount = this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM universal_symbols WHERE project_id = 1').get() as { count: number };
    
    return {
      totalSymbols: symbolCount.count,
      totalFiles: fileCount.count,
      totalRelationships: 0,
      totalPatterns: 0,
      parserBreakdown: {},
      confidenceAverage: 0
    };
  }
  
  async clearAll(): Promise<void> {
    this.db.exec('DELETE FROM universal_symbols WHERE project_id = 1');
  }
  
  close(): void {
    this.db.close();
  }
}

/**
 * Factory for creating database adapters
 */
export class DatabaseAdapterFactory {
  static create(type: 'legacy' | 'multiproject', db: Database): DatabaseAdapter {
    switch (type) {
      case 'legacy':
        return new LegacyDatabaseAdapter(db);
      case 'multiproject':
        return new MultiProjectDatabaseAdapter(db);
      default:
        throw new Error(`Unknown database adapter type: ${type}`);
    }
  }
}