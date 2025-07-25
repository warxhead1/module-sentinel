/**
 * Database service for Module Sentinel API
 */
import Database from 'better-sqlite3';
import type { Symbol, Relationship } from '../../shared/types/api.js';
import { ensureDatabasePrepare } from "../../utils/database-compatibility.js";

export class DatabaseService {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = ensureDatabasePrepare(database);
  }

  /**
   * Get database statistics
   */
  getStats() {
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM universal_symbols').get() as { count: number };
    const namespaceCount = this.db.prepare("SELECT COUNT(DISTINCT namespace) as count FROM universal_symbols WHERE namespace IS NOT NULL AND namespace != '' AND namespace != 'null'").get() as { count: number };
    
    const kindBreakdown = this.db.prepare(`
      SELECT kind, COUNT(*) as count 
      FROM universal_symbols 
      GROUP BY kind 
      ORDER BY count DESC
    `).all() as Array<{ kind: string; count: number }>;
    
    let languageBreakdown: Array<{ language: string; count: number }> = [];
    try {
      languageBreakdown = this.db.prepare(`
        SELECT COALESCE(l.name, 'unknown') as language, COUNT(*) as count
        FROM universal_symbols s
        LEFT JOIN languages l ON s.language_id = l.id
        GROUP BY l.name
        ORDER BY count DESC
      `).all() as Array<{ language: string; count: number }>;
    } catch (error) {
      console.warn('Failed to load language breakdown:', error);
      // Fallback to language_id if languages table doesn't exist
      languageBreakdown = this.db.prepare(`
        SELECT 'lang_' || COALESCE(language_id, 0) as language, COUNT(*) as count
        FROM universal_symbols
        GROUP BY language_id
        ORDER BY count DESC
      `).all() as Array<{ language: string; count: number }>;
    }

    return {
      symbolCount: symbolCount.count,
      namespaceCount: namespaceCount.count,
      kindBreakdown: Object.fromEntries(kindBreakdown.map(k => [k.kind, k.count])),
      languageBreakdown: Object.fromEntries(languageBreakdown.map(l => [l.language, l.count]))
    };
  }

  /**
   * Search symbols with filters
   */
  searchSymbols(query: string, options: {
    kind?: string;
    namespace?: string;
    qualifiedName?: boolean;
    projectIds?: number[];
    languageId?: number;
    limit?: number;
    offset?: number;
  } = {}) {
    const { kind, namespace, qualifiedName = false, projectIds, languageId, limit = 50, offset = 0 } = options;
    
    let sql = `
      SELECT 
        s.id, s.name, s.qualified_name, s.kind, s.namespace,
        s.file_path, s.line, s.column, s.visibility, s.signature,
        s.return_type, s.is_exported, s.language_id, s.project_id
      FROM universal_symbols s
    `;
    
    const params: any[] = [];
    
    // Add WHERE clause only if we have search criteria
    let whereAdded = false;
    
    if (query && query.trim()) {
      if (qualifiedName) {
        // Exact match on qualified_name for file-level symbol queries
        sql += ' WHERE s.qualified_name = ?';
        params.push(query);
      } else {
        // Fuzzy search on name and qualified_name
        sql += ' WHERE (s.name LIKE ? OR s.qualified_name LIKE ?)';
        params.push(`%${query}%`, `%${query}%`);
      }
      whereAdded = true;
    }
    
    if (kind) {
      sql += ' AND s.kind = ?';
      params.push(kind);
    }
    
    if (namespace) {
      sql += ' AND s.namespace = ?';
      params.push(namespace);
    }
    
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      sql += ` AND s.project_id IN (${placeholders})`;
      params.push(...projectIds);
    }
    
    if (languageId) {
      sql += ' AND s.language_id = ?';
      params.push(languageId);
    }
    
    sql += ' ORDER BY s.name LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return this.db.prepare(sql).all(...params) as Symbol[];
  }

  /**
   * Get symbol relationships
   */
  getSymbolRelationships(symbolId: number, direction: 'incoming' | 'outgoing' | 'both' = 'both') {
    let sql = `
      SELECT r.*, 
        s1.name as from_name, s1.qualified_name as from_qualified_name,
        s1.kind as from_kind, s1.namespace as from_namespace,
        l1.name as from_language,
        s2.name as to_name, s2.qualified_name as to_qualified_name,
        s2.kind as to_kind, s2.namespace as to_namespace,
        l2.name as to_language
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      LEFT JOIN languages l1 ON s1.language_id = l1.id
      LEFT JOIN languages l2 ON s2.language_id = l2.id
      WHERE 1=1
    `;
    
    const params: number[] = [];
    
    if (direction === 'incoming' || direction === 'both') {
      sql += ' AND (r.to_symbol_id = ?';
      params.push(symbolId);
      
      if (direction === 'both') {
        sql += ' OR r.from_symbol_id = ?)';
        params.push(symbolId);
      } else {
        sql += ')';
      }
    } else if (direction === 'outgoing') {
      sql += ' AND r.from_symbol_id = ?';
      params.push(symbolId);
    }
    
    return this.db.prepare(sql).all(...params) as Array<Relationship & {
      from_name: string;
      from_qualified_name: string;
      from_kind: string;
      from_namespace: string;
      from_language: string;
      to_name: string;
      to_qualified_name: string;
      to_kind: string;
      to_namespace: string;
      to_language: string;
    }>;
  }

  /**
   * Get namespaces with symbol counts
   */
  getNamespaces(options: {
    projectIds?: number[];
    languageId?: number;
  } = {}) {
    const { projectIds, languageId } = options;
    
    let sql = `
      SELECT 
        namespace,
        COUNT(*) as symbol_count,
        COUNT(DISTINCT kind) as kind_count,
        GROUP_CONCAT(DISTINCT kind) as kinds
      FROM universal_symbols 
      WHERE namespace IS NOT NULL AND namespace != '' AND namespace != 'null'
    `;
    
    const params: any[] = [];
    
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      sql += ` AND project_id IN (${placeholders})`;
      params.push(...projectIds);
    }
    
    if (languageId) {
      sql += ' AND language_id = ?';
      params.push(languageId);
    }
    
    sql += `
      GROUP BY namespace 
      ORDER BY symbol_count DESC
    `;
    
    return this.db.prepare(sql).all(...params) as Array<{
      namespace: string;
      symbol_count: number;
      kind_count: number;
      kinds: string;
    }>;
  }

  /**
   * Get symbols for a specific namespace
   */
  getNamespaceSymbols(namespace: string, options: {
    projectIds?: number[];
    languageId?: number;
    limit?: number;
  } = {}) {
    const { projectIds, languageId, limit = 100 } = options;
    
    let sql = `
      SELECT 
        s.id, s.name, s.qualified_name, s.kind, s.namespace,
        s.file_path, s.line, s.column, s.visibility, s.signature,
        s.return_type, s.is_exported, s.language_id, s.project_id
      FROM universal_symbols s
      WHERE s.namespace = ?
    `;
    
    const params: any[] = [namespace];
    
    if (projectIds && projectIds.length > 0) {
      const placeholders = projectIds.map(() => '?').join(',');
      sql += ` AND s.project_id IN (${placeholders})`;
      params.push(...projectIds);
    }
    
    if (languageId) {
      sql += ' AND s.language_id = ?';
      params.push(languageId);
    }
    
    sql += `
      ORDER BY s.kind, s.name
      LIMIT ?
    `;
    params.push(limit);
    
    return this.db.prepare(sql).all(...params) as Symbol[];
  }

  /**
   * Get all symbols for a specific file/module
   */
  getFileSymbols(qualifiedName: string) {
    // First, find all files that contain this qualified name
    const files = this.db.prepare(`
      SELECT DISTINCT file_path
      FROM universal_symbols
      WHERE qualified_name = ? OR qualified_name LIKE ?
    `).all(qualifiedName, `${qualifiedName}::%`) as Array<{ file_path: string }>;
    
    if (files.length === 0) {
      return [];
    }
    
    // Get all symbols from those files
    const placeholders = files.map(() => '?').join(',');
    const symbols = this.db.prepare(`
      SELECT 
        s.id, s.name, s.qualified_name, s.kind, s.namespace,
        s.file_path, s.line, s.column, s.visibility, s.signature,
        s.return_type, s.is_exported, s.language_id, s.project_id,
        s.parent_symbol_id
      FROM universal_symbols s
      WHERE s.file_path IN (${placeholders})
      ORDER BY s.file_path, s.line, s.column
    `).all(...files.map(f => f.file_path));
    
    return symbols;
  }

  /**
   * Get all projects with symbol counts
   */
  getProjects() {
    try {
      return this.db.prepare(`
        SELECT 
          p.id,
          p.name,
          p.display_name,
          p.description,
          p.root_path,
          p.metadata,
          p.is_active,
          p.created_at,
          COUNT(s.id) as symbol_count
        FROM projects p
        LEFT JOIN universal_symbols s ON p.id = s.project_id
        WHERE p.is_active = 1
        GROUP BY p.id, p.name, p.display_name, p.description, p.root_path, p.metadata, p.is_active, p.created_at
        ORDER BY p.name
      `).all() as Array<{
        id: number;
        name: string;
        display_name: string | null;
        description: string | null;
        root_path: string;
        metadata: any;
        is_active: number;
        created_at: string;
        symbol_count: number;
      }>;
    } catch (error) {
      console.warn('Projects table not found, returning empty array');
      return [];
    }
  }

  /**
   * Get languages with symbol counts
   */
  getLanguages() {
    try {
      return this.db.prepare(`
        SELECT 
          l.id,
          l.name,
          l.display_name,
          l.extensions as file_extensions,
          COUNT(s.id) as symbol_count
        FROM languages l
        LEFT JOIN universal_symbols s ON l.id = s.language_id
        GROUP BY l.id, l.name, l.display_name, l.extensions
        ORDER BY l.name
      `).all() as Array<{
        id: number;
        name: string;
        display_name: string | null;
        file_extensions: string | null;
        symbol_count: number;
      }>;
    } catch (error) {
      console.warn('Languages table not found, returning empty array');
      return [];
    }
  }

  /**
   * Get all relationships for graph visualization
   */
  getAllRelationships(limit: number = 100) {
    const sql = `
      SELECT r.*, 
        -- Source symbol rich data
        s1.name as from_name, 
        s1.qualified_name as from_qualified_name,
        s1.kind as from_kind, 
        s1.namespace as from_namespace,
        s1.file_path as from_file_path,
        s1.line as from_line,
        s1.column as from_column,
        s1.end_line as from_end_line,
        s1.end_column as from_end_column,
        s1.signature as from_signature,
        s1.return_type as from_return_type,
        s1.visibility as from_visibility,
        s1.is_exported as from_is_exported,
        s1.is_async as from_is_async,
        s1.is_abstract as from_is_abstract,
        s1.language_features as from_language_features,
        s1.semantic_tags as from_semantic_tags,
        s1.confidence as from_confidence,
        l1.name as from_language,
        -- Target symbol rich data
        s2.name as to_name, 
        s2.qualified_name as to_qualified_name,
        s2.kind as to_kind, 
        s2.namespace as to_namespace,
        s2.file_path as to_file_path,
        s2.line as to_line,
        s2.column as to_column,
        s2.end_line as to_end_line,
        s2.end_column as to_end_column,
        s2.signature as to_signature,
        s2.return_type as to_return_type,
        s2.visibility as to_visibility,
        s2.is_exported as to_is_exported,
        s2.is_async as to_is_async,
        s2.is_abstract as to_is_abstract,
        s2.language_features as to_language_features,
        s2.semantic_tags as to_semantic_tags,
        s2.confidence as to_confidence,
        l2.name as to_language
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      LEFT JOIN languages l1 ON s1.language_id = l1.id
      LEFT JOIN languages l2 ON s2.language_id = l2.id
      ORDER BY r.confidence DESC
      LIMIT ?
    `;
    
    return this.db.prepare(sql).all(limit) as Array<Relationship & {
      // Basic relationship info
      from_name: string;
      from_qualified_name: string;
      from_kind: string;
      from_namespace: string;
      to_name: string;
      to_qualified_name: string;
      to_kind: string;
      to_namespace: string;
      // Rich source symbol data
      from_file_path: string;
      from_line: number;
      from_column: number;
      from_end_line?: number;
      from_end_column?: number;
      from_signature?: string;
      from_return_type?: string;
      from_visibility?: string;
      from_is_exported: boolean;
      from_is_async: boolean;
      from_is_abstract: boolean;
      from_language_features?: string; // JSON
      from_semantic_tags?: string; // JSON
      from_confidence: number;
      from_language: string;
      // Rich target symbol data
      to_file_path: string;
      to_line: number;
      to_column: number;
      to_end_line?: number;
      to_end_column?: number;
      to_signature?: string;
      to_return_type?: string;
      to_visibility?: string;
      to_is_exported: boolean;
      to_is_async: boolean;
      to_is_abstract: boolean;
      to_language_features?: string; // JSON
      to_semantic_tags?: string; // JSON
      to_confidence: number;
      to_language: string;
    }>;
  }

  /**
   * Execute a custom SQL query (for specialized routes)
   */
  executeQuery(sql: string, params: any[] = []): any[] {
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Check if database is healthy
   */
  healthCheck(): { healthy: boolean; error?: string } {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM universal_symbols').get() as { count: number };
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get the database file path
   */
  getDatabasePath(): string {
    // Access the database path through the name property of better-sqlite3
    return (this.db as any).name || '';
  }
}