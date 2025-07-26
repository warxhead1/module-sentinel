/**
 * Database service for Module Sentinel API
 */
import Database from 'better-sqlite3';
import type { Symbol, Relationship } from '../../shared/types/api.js';
import { DrizzleDatabase, DrizzleDb } from '../../database/drizzle-db.js';

export class DatabaseService {
  private drizzleDb: DrizzleDatabase;

  constructor(database: Database.Database | DrizzleDb) {
    this.drizzleDb = new DrizzleDatabase(database);
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return await this.drizzleDb.getStats();
  }

  /**
   * Search symbols with filters
   */
  async searchSymbols(query: string, options: {
    kind?: string;
    namespace?: string;
    qualifiedName?: boolean;
    projectIds?: number[];
    languageId?: number;
    limit?: number;
    offset?: number;
  } = {}) {
    return await this.drizzleDb.searchSymbols(query, options);
  }

  /**
   * Get symbol relationships
   */
  async getSymbolRelationships(symbolId: number, direction: 'incoming' | 'outgoing' | 'both' = 'both') {
    return await this.drizzleDb.getSymbolRelationships(symbolId, direction);
  }

  /**
   * Get namespaces with symbol counts
   */
  async getNamespaces(options: {
    projectIds?: number[];
    languageId?: number;
  } = {}) {
    return await this.drizzleDb.getNamespaces(options);
  }

  /**
   * Get symbols for a specific namespace
   */
  async getNamespaceSymbols(namespace: string, options: {
    projectIds?: number[];
    languageId?: number;
    limit?: number;
  } = {}) {
    const results = await this.drizzleDb.searchSymbols('', {
      namespace,
      projectIds: options.projectIds,
      languageId: options.languageId,
      limit: options.limit || 100
    });
    return results;
  }

  /**
   * Get all symbols for a specific file/module
   */
  async getFileSymbols(qualifiedName: string) {
    // Use the search functionality to find symbols with this qualified name
    const symbols = await this.drizzleDb.searchSymbols(qualifiedName, {
      qualifiedName: true,
      limit: 1000 // Higher limit for file symbols
    });
    
    if (symbols.length === 0) {
      // Try partial match
      const partialMatches = await this.drizzleDb.searchSymbols(qualifiedName, {
        qualifiedName: false,
        limit: 1000
      });
      return partialMatches;
    }
    
    // Get all symbols from the same files
    const filePaths = [...new Set(symbols.map(s => s.file_path))];
    const fileSymbols = [];
    
    for (const filePath of filePaths) {
      const results = await this.drizzleDb.searchSymbols('', {
        limit: 1000
      });
      // Filter by file path
      fileSymbols.push(...results.filter(s => s.file_path === filePath));
    }
    
    return fileSymbols;
  }

  /**
   * Get all projects with symbol counts
   */
  async getProjects() {
    return await this.drizzleDb.getProjects();
  }

  /**
   * Get languages with symbol counts
   */
  async getLanguages() {
    return await this.drizzleDb.getLanguages();
  }

  /**
   * Get all relationships for graph visualization
   */
  async getAllRelationships(limit: number = 100) {
    return await this.drizzleDb.getAllRelationships(limit);
  }

  /**
   * Execute a custom SQL query (for specialized routes)
   * 
   * APPROVED EXCEPTION: Generic query executor for dynamic/specialized queries
   * This method exists to support legacy routes and dynamic queries that cannot
   * be pre-defined in DrizzleDatabase. It should be gradually deprecated as
   * we add more specific methods to DrizzleDatabase.
   * 
   * TODO: Identify all callers of this method and create specific DrizzleDatabase
   * methods for each use case, then remove this method entirely.
   */
  async executeQuery(sql: string, params: any[] = []): Promise<any[]> {
    // This method should be gradually deprecated
    // For now, use the raw database from drizzle
    const rawDb = this.drizzleDb.getRawDb();
    return rawDb.prepare(sql).all(...params);
  }

  /**
   * Check if database is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    return await this.drizzleDb.healthCheck();
  }

  /**
   * Get the database file path
   */
  getDatabasePath(): string {
    // Access the database path through the raw db instance
    const rawDb = this.drizzleDb.getRawDb();
    return (rawDb as any).name || '';
  }
}