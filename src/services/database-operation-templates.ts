/**
 * DatabaseOperationTemplates
 *
 * Reusable database operation patterns to eliminate code duplication.
 * Provides templated operations for common database tasks like batch inserts,
 * symbol lookups, and relationship processing.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql, and } from "drizzle-orm";
import {
  universalSymbols,
  universalRelationships,
  fileIndex,
  controlFlowBlocks,
  symbolCalls,
} from "../database/drizzle/schema.js";
import { SymbolInfo } from "../parsers/tree-sitter/parser-types.js";
import { createLogger } from "../utils/logger.js";

export interface DatabaseOperationConfig {
  batchSize?: number;
  enableConflictResolution?: boolean;
  timeoutMs?: number;
}

export interface SymbolRecord {
  projectId: number;
  languageId: number;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;
  returnType?: string;
  visibility?: string;
  complexity?: number;
  semanticTags?: string[];
  isDefinition?: boolean;
  isExported?: boolean;
  isAsync?: boolean;
  namespace?: string;
  parentScope?: string;
  confidence?: number;
  languageFeatures?: Record<string, any>;
}

export interface RelationshipRecord {
  projectId: number;
  fromSymbolId: number;
  toSymbolId: number;
  type: string;
  confidence: number;
  contextLine?: number;
  contextSnippet?: string;
  metadata?: string;
}

export class DatabaseOperationTemplates {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private logger = createLogger("DatabaseOperationTemplates");
  private config: Required<DatabaseOperationConfig>;

  constructor(
    db: Database,
    config: DatabaseOperationConfig = {}
  ) {
    this.rawDb = db;
    this.db = drizzle(db);
    this.config = {
      batchSize: config.batchSize || 1000,
      enableConflictResolution: config.enableConflictResolution ?? true,
      timeoutMs: config.timeoutMs || 30000,
    };
  }

  /**
   * Generic batch insert operation with conflict resolution
   */
  private async batchInsert<T>(
    table: any,
    records: T[],
    operationName: string
  ): Promise<void> {
    if (records.length === 0) return;

    const complete = this.logger.operation(operationName, {
      recordCount: records.length,
      batchSize: this.config.batchSize,
    });

    try {
      for (let i = 0; i < records.length; i += this.config.batchSize) {
        const batch = records.slice(i, i + this.config.batchSize);
        
        if (this.config.enableConflictResolution) {
          await this.db.insert(table).values(batch).onConflictDoNothing();
        } else {
          await this.db.insert(table).values(batch);
        }

        this.logger.debug(`Processed batch ${Math.floor(i / this.config.batchSize) + 1}`, {
          processed: Math.min(i + this.config.batchSize, records.length),
          total: records.length,
        });
      }

      complete();
    } catch (error) {
      this.logger.error(`Batch insert failed for ${operationName}`, error, {
        recordCount: records.length,
      });
      throw error;
    }
  }

  /**
   * Batch insert symbols with automatic record conversion
   */
  async batchInsertSymbols(
    symbols: Array<{ symbol: SymbolInfo; projectId: number; languageId: number; filePath: string }>
  ): Promise<void> {
    const symbolRecords: SymbolRecord[] = symbols.map(({ symbol, projectId, languageId, filePath }) => ({
      projectId,
      languageId,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      kind: symbol.kind,
      filePath,
      line: symbol.line,
      column: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
      signature: symbol.signature,
      returnType: symbol.returnType,
      visibility: symbol.visibility,
      complexity: symbol.complexity || 1,
      semanticTags: symbol.semanticTags || [],
      isDefinition: symbol.isDefinition || false,
      isExported: symbol.isExported || false,
      isAsync: symbol.isAsync || false,
      namespace: symbol.namespace,
      parentScope: symbol.parentScope,
      confidence: symbol.confidence || 1.0,
      languageFeatures: symbol.languageFeatures || undefined,
    }));

    await this.batchInsert(universalSymbols, symbolRecords, "batchInsertSymbols");
  }

  /**
   * Batch insert relationships
   */
  async batchInsertRelationships(relationships: RelationshipRecord[]): Promise<void> {
    await this.batchInsert(universalRelationships, relationships, "batchInsertRelationships");
  }

  /**
   * Build comprehensive symbol mapping for a project
   */
  async buildSymbolMapping(projectId: number): Promise<{
    byName: Map<string, number>;
    byQualifiedName: Map<string, number>;
    byFilePath: Map<string, number>;
    byKind: Map<string, number[]>;
    allSymbols: Array<{
      id: number;
      name: string;
      qualifiedName: string;
      filePath: string;
      kind: string;
      isExported: boolean | null;
    }>;
  }> {
    const complete = this.logger.operation("buildSymbolMapping", { projectId });

    try {
      const symbols = await this.db
        .select({
          id: universalSymbols.id,
          name: universalSymbols.name,
          qualifiedName: universalSymbols.qualifiedName,
          filePath: universalSymbols.filePath,
          kind: universalSymbols.kind,
          isExported: universalSymbols.isExported,
        })
        .from(universalSymbols)
        .where(eq(universalSymbols.projectId, projectId));

      const byName = new Map<string, number>();
      const byQualifiedName = new Map<string, number>();
      const byFilePath = new Map<string, number>();
      const byKind = new Map<string, number[]>();

      for (const symbol of symbols) {
        // Build primary mappings
        byName.set(symbol.name, symbol.id);
        
        if (symbol.qualifiedName && symbol.qualifiedName !== symbol.name) {
          byQualifiedName.set(symbol.qualifiedName, symbol.id);
        }

        // File path mapping for file symbols
        if (symbol.kind === "file") {
          byFilePath.set(symbol.filePath, symbol.id);
        }

        // Kind-based grouping
        const kindList = byKind.get(symbol.kind) || [];
        kindList.push(symbol.id);
        byKind.set(symbol.kind, kindList);
      }

      this.logger.debug("Symbol mapping built", {
        totalSymbols: symbols.length,
        nameEntries: byName.size,
        qualifiedNameEntries: byQualifiedName.size,
        filePathEntries: byFilePath.size,
        kindCategories: byKind.size,
      });

      complete();
      return {
        byName,
        byQualifiedName,
        byFilePath,
        byKind,
        allSymbols: symbols,
      };
    } catch (error) {
      this.logger.error("Failed to build symbol mapping", error, { projectId });
      throw error;
    }
  }

  /**
   * Check if symbols exist for given criteria
   */
  async checkSymbolsExist(
    projectId: number,
    criteria: Array<{ name?: string; qualifiedName?: string; filePath?: string; kind?: string }>
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const criterion of criteria) {
      const key = JSON.stringify(criterion);
      
      const conditions = [eq(universalSymbols.projectId, projectId)];
      
      if (criterion.name) {
        conditions.push(eq(universalSymbols.name, criterion.name));
      }
      if (criterion.qualifiedName) {
        conditions.push(eq(universalSymbols.qualifiedName, criterion.qualifiedName));
      }
      if (criterion.filePath) {
        conditions.push(eq(universalSymbols.filePath, criterion.filePath));
      }
      if (criterion.kind) {
        conditions.push(eq(universalSymbols.kind, criterion.kind));
      }

      const existing = await this.db
        .select({ id: universalSymbols.id })
        .from(universalSymbols)
        .where(and(...conditions))
        .limit(1);

      results.set(key, existing.length > 0);
    }

    return results;
  }

  /**
   * Create virtual symbols (modules, files, etc.) if they don't exist
   */
  async ensureVirtualSymbols(
    projectId: number,
    languageId: number,
    symbols: Array<{
      name: string;
      qualifiedName: string;
      kind: string;
      filePath: string;
      isExternal?: boolean;
      semanticTags?: string[];
    }>
  ): Promise<void> {
    if (symbols.length === 0) return;

    const complete = this.logger.operation("ensureVirtualSymbols", {
      count: symbols.length,
      projectId,
    });

    try {
      // Check which symbols already exist
      const existingChecks = symbols.map(s => ({
        name: s.name,
        kind: s.kind,
      }));
      
      const existingMap = await this.checkSymbolsExist(projectId, existingChecks);
      
      // Filter out existing symbols
      const newSymbols = symbols.filter(s => {
        const key = JSON.stringify({ name: s.name, kind: s.kind });
        return !existingMap.get(key);
      });

      if (newSymbols.length === 0) {
        this.logger.debug("All virtual symbols already exist");
        complete();
        return;
      }

      // Create records for new symbols
      const symbolRecords: SymbolRecord[] = newSymbols.map(s => ({
        projectId,
        languageId,
        name: s.name,
        qualifiedName: s.qualifiedName,
        kind: s.kind,
        filePath: s.filePath,
        line: 0,
        column: 0,
        isExported: s.isExternal ?? true,
        confidence: 1.0,
        semanticTags: s.semanticTags || (s.isExternal ? ["external", "dependency"] : ["internal", "module"]),
      }));

      await this.batchInsert(universalSymbols, symbolRecords, "ensureVirtualSymbols");
      
      this.logger.debug(`Created ${newSymbols.length} virtual symbols`);
      complete();
    } catch (error) {
      this.logger.error("Failed to ensure virtual symbols", error, { projectId });
      throw error;
    }
  }

  /**
   * Build file mapping for relationship processing
   */
  async buildFileMapping(projectId: number): Promise<Map<string, number>> {
    const complete = this.logger.operation("buildFileMapping", { projectId });

    try {
      const files = await this.db
        .select({
          id: fileIndex.id,
          filePath: fileIndex.filePath,
        })
        .from(fileIndex)
        .where(eq(fileIndex.projectId, projectId));

      const fileMap = new Map<string, number>();
      
      for (const file of files) {
        fileMap.set(file.filePath, file.id);
        
        // Also map base names for convenience
        const baseName = file.filePath.split("/").pop() || file.filePath;
        if (!fileMap.has(baseName)) {
          fileMap.set(baseName, file.id);
        }
      }

      this.logger.debug(`Built file mapping with ${fileMap.size} entries`);
      complete();
      return fileMap;
    } catch (error) {
      this.logger.error("Failed to build file mapping", error, { projectId });
      throw error;
    }
  }

  /**
   * Optimized field symbol lookup by name
   */
  async buildFieldSymbolIndex(projectId: number): Promise<Map<string, number[]>> {
    const complete = this.logger.operation("buildFieldSymbolIndex", { projectId });

    try {
      const fieldSymbols = await this.db
        .select({
          id: universalSymbols.id,
          name: universalSymbols.name,
        })
        .from(universalSymbols)
        .where(
          and(
            eq(universalSymbols.projectId, projectId),
            eq(universalSymbols.kind, "field")
          )
        );

      const fieldIndex = new Map<string, number[]>();
      
      for (const field of fieldSymbols) {
        const existing = fieldIndex.get(field.name) || [];
        existing.push(field.id);
        fieldIndex.set(field.name, existing);
      }

      this.logger.debug(`Built field index with ${fieldIndex.size} field names`);
      complete();
      return fieldIndex;
    } catch (error) {
      this.logger.error("Failed to build field symbol index", error, { projectId });
      throw error;
    }
  }

  /**
   * Delete relationships by project (for cleanup/rebuild scenarios)
   */
  async deleteRelationshipsByProject(projectId: number): Promise<number> {
    const complete = this.logger.operation("deleteRelationshipsByProject", { projectId });

    try {
      const result = await this.db
        .delete(universalRelationships)
        .where(eq(universalRelationships.projectId, projectId));

      this.logger.debug(`Deleted relationships for project ${projectId}`);
      complete();
      return result.changes || 0;
    } catch (error) {
      this.logger.error("Failed to delete relationships", error, { projectId });
      throw error;
    }
  }

  /**
   * Get database statistics for monitoring
   */
  async getDatabaseStats(projectId?: number): Promise<{
    symbols: number;
    relationships: number;
    files: number;
    controlFlowBlocks: number;
    symbolCalls: number;
  }> {
    const whereClause = projectId ? eq(universalSymbols.projectId, projectId) : undefined;

    const [symbolCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(universalSymbols)
      .where(whereClause);

    const [relationshipCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(universalRelationships)
      .where(projectId ? eq(universalRelationships.projectId, projectId) : undefined);

    const [fileCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(fileIndex)
      .where(projectId ? eq(fileIndex.projectId, projectId) : undefined);

    const [controlFlowCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(controlFlowBlocks)
      .where(projectId ? eq(controlFlowBlocks.projectId, projectId) : undefined);

    const [callCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(symbolCalls)
      .where(projectId ? eq(symbolCalls.projectId, projectId) : undefined);

    return {
      symbols: symbolCount.count,
      relationships: relationshipCount.count,
      files: fileCount.count,
      controlFlowBlocks: controlFlowCount.count,
      symbolCalls: callCount.count,
    };
  }
}

/**
 * Factory function to create database operation templates
 */
export function createDatabaseOperationTemplates(
  db: Database,
  config?: DatabaseOperationConfig
): DatabaseOperationTemplates {
  return new DatabaseOperationTemplates(db, config);
}