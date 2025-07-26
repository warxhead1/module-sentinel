/**
 * Drizzle Database Wrapper
 * 
 * Provides a clean interface for database operations using Drizzle ORM
 * instead of raw SQL queries. This eliminates the db.prepare antipattern.
 */

import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, inArray, sql as drizzleSql, sql, desc, asc, isNotNull, isNull, gt } from 'drizzle-orm';
import Database from 'better-sqlite3';
import * as schema from './drizzle/schema.js';
import { createLogger } from '../utils/logger.js';

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export class DrizzleDatabase {
  private db: DrizzleDb;
  private logger = createLogger('DrizzleDatabase');
  
  constructor(database: Database.Database | DrizzleDb) {
    // If it's already a Drizzle instance, use it directly
    if ('select' in database && 'insert' in database) {
      this.db = database as DrizzleDb;
    } else {
      // Wrap raw database in Drizzle
      this.db = drizzle(database as Database.Database, { schema });
    }
  }

  /**
   * Get the underlying Drizzle database instance
   */
  get instance(): DrizzleDb {
    return this.db;
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const symbolCount = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(schema.universalSymbols)
      .get();

    const namespaceCount = await this.db
      .select({ count: drizzleSql<number>`count(distinct ${schema.universalSymbols.namespace})` })
      .from(schema.universalSymbols)
      .where(
        and(
          isNotNull(schema.universalSymbols.namespace),
          drizzleSql`${schema.universalSymbols.namespace} != ''`,
          drizzleSql`${schema.universalSymbols.namespace} != 'null'`
        )
      )
      .get();

    const kindBreakdown = await this.db
      .select({
        kind: schema.universalSymbols.kind,
        count: drizzleSql<number>`count(*)`
      })
      .from(schema.universalSymbols)
      .groupBy(schema.universalSymbols.kind)
      .orderBy(desc(drizzleSql`count(*)`));

    let languageBreakdown: Array<{ language: string; count: number }> = [];
    try {
      languageBreakdown = await this.db
        .select({
          language: drizzleSql<string>`COALESCE(${schema.languages.name}, 'unknown')`,
          count: drizzleSql<number>`count(*)`
        })
        .from(schema.universalSymbols)
        .leftJoin(schema.languages, eq(schema.universalSymbols.languageId, schema.languages.id))
        .groupBy(schema.languages.name)
        .orderBy(desc(drizzleSql`count(*)`));
    } catch {
      this.logger.warn('Failed to load language breakdown');
      // Fallback to language_id if languages table doesn't exist
      languageBreakdown = await this.db
        .select({
          language: drizzleSql<string>`'lang_' || COALESCE(${schema.universalSymbols.languageId}, 0)`,
          count: drizzleSql<number>`count(*)`
        })
        .from(schema.universalSymbols)
        .groupBy(schema.universalSymbols.languageId)
        .orderBy(desc(drizzleSql`count(*)`));
    }

    return {
      symbolCount: symbolCount?.count || 0,
      namespaceCount: namespaceCount?.count || 0,
      kindBreakdown: Object.fromEntries(kindBreakdown.map(k => [k.kind, k.count])),
      languageBreakdown: Object.fromEntries(languageBreakdown.map(l => [l.language, l.count]))
    };
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
    const { kind, namespace, qualifiedName = false, projectIds, languageId, limit = 50, offset = 0 } = options;

    const conditions = [];

    if (query && query.trim()) {
      if (qualifiedName) {
        // Exact match on qualified_name for file-level symbol queries
        conditions.push(eq(schema.universalSymbols.qualifiedName, query));
      } else {
        // Fuzzy search on name and qualified_name
        conditions.push(
          drizzleSql`${schema.universalSymbols.name} LIKE ${`%${query}%`} OR ${schema.universalSymbols.qualifiedName} LIKE ${`%${query}%`}`
        );
      }
    }

    if (kind) {
      conditions.push(eq(schema.universalSymbols.kind, kind));
    }

    if (namespace) {
      conditions.push(eq(schema.universalSymbols.namespace, namespace));
    }

    if (projectIds && projectIds.length > 0) {
      conditions.push(inArray(schema.universalSymbols.projectId, projectIds));
    }

    if (languageId) {
      conditions.push(eq(schema.universalSymbols.languageId, languageId));
    }

    const queryBuilder = this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        qualified_name: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        namespace: schema.universalSymbols.namespace,
        file_path: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        column: schema.universalSymbols.column,
        visibility: schema.universalSymbols.visibility,
        signature: schema.universalSymbols.signature,
        return_type: schema.universalSymbols.returnType,
        is_exported: schema.universalSymbols.isExported,
        language_id: schema.universalSymbols.languageId,
        project_id: schema.universalSymbols.projectId
      })
      .from(schema.universalSymbols)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.universalSymbols.name))
      .limit(limit)
      .offset(offset);

    return await queryBuilder;
  }

  /**
   * Get symbol by ID
   */
  async getSymbol(id: number) {
    return await this.db
      .select()
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.id, id))
      .get();
  }

  /**
   * Get symbol relationships
   */
  async getSymbolRelationships(symbolId: number, direction: 'incoming' | 'outgoing' | 'both' = 'both') {
    // For now, return simpler query without joins until we fix aliasing
    const conditions = [];

    if (direction === 'incoming') {
      conditions.push(eq(schema.universalRelationships.toSymbolId, symbolId));
    } else if (direction === 'outgoing') {
      conditions.push(eq(schema.universalRelationships.fromSymbolId, symbolId));
    } else {
      // both
      conditions.push(
        drizzleSql`${schema.universalRelationships.toSymbolId} = ${symbolId} OR ${schema.universalRelationships.fromSymbolId} = ${symbolId}`
      );
    }

    const relationships = await this.db
      .select()
      .from(schema.universalRelationships)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Manually fetch symbol details for each relationship
    const enrichedRelationships = await Promise.all(
      relationships.map(async (rel) => {
        const fromSymbol = await this.getSymbol(rel.fromSymbolId || 0);
        const toSymbol = await this.getSymbol(rel.toSymbolId || 0);
        
        const fromLang = fromSymbol?.languageId 
          ? await this.db.select().from(schema.languages).where(eq(schema.languages.id, fromSymbol.languageId)).get()
          : null;
        
        const toLang = toSymbol?.languageId
          ? await this.db.select().from(schema.languages).where(eq(schema.languages.id, toSymbol.languageId)).get()
          : null;

        return {
          ...rel,
          from_symbol_id: rel.fromSymbolId || 0,
          to_symbol_id: rel.toSymbolId || 0,
          from_name: fromSymbol?.name || '',
          from_qualified_name: fromSymbol?.qualifiedName || '',
          from_kind: fromSymbol?.kind || '',
          from_namespace: fromSymbol?.namespace || '',
          from_language: fromLang?.name || '',
          to_name: toSymbol?.name || '',
          to_qualified_name: toSymbol?.qualifiedName || '',
          to_kind: toSymbol?.kind || '',
          to_namespace: toSymbol?.namespace || '',
          to_language: toLang?.name || ''
        };
      })
    );

    return enrichedRelationships;
  }

  /**
   * Get namespaces with symbol counts
   */
  async getNamespaces(options: {
    projectIds?: number[];
    languageId?: number;
  } = {}) {
    const { projectIds, languageId } = options;

    const queryBuilder = this.db
      .select({
        namespace: schema.universalSymbols.namespace,
        symbol_count: drizzleSql<number>`count(*)`,
        kind_count: drizzleSql<number>`count(distinct ${schema.universalSymbols.kind})`,
        kinds: drizzleSql<string>`group_concat(distinct ${schema.universalSymbols.kind})`
      })
      .from(schema.universalSymbols);

    const conditions = [
      isNotNull(schema.universalSymbols.namespace),
      drizzleSql`${schema.universalSymbols.namespace} != ''`,
      drizzleSql`${schema.universalSymbols.namespace} != 'null'`
    ];

    if (projectIds && projectIds.length > 0) {
      conditions.push(inArray(schema.universalSymbols.projectId, projectIds));
    }

    if (languageId) {
      conditions.push(eq(schema.universalSymbols.languageId, languageId));
    }

    return await queryBuilder
      .where(and(...conditions))
      .groupBy(schema.universalSymbols.namespace)
      .orderBy(desc(drizzleSql`count(*)`));
  }

  /**
   * Get all projects with symbol counts
   */
  async getProjects() {
    try {
      const results = await this.db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          display_name: schema.projects.displayName,
          description: schema.projects.description,
          root_path: schema.projects.rootPath,
          metadata: schema.projects.metadata,
          is_active: schema.projects.isActive,
          created_at: schema.projects.createdAt,
          symbol_count: drizzleSql<number>`count(${schema.universalSymbols.id})`
        })
        .from(schema.projects)
        .leftJoin(schema.universalSymbols, eq(schema.projects.id, schema.universalSymbols.projectId))
        .where(eq(schema.projects.isActive, true))
        .groupBy(
          schema.projects.id,
          schema.projects.name,
          schema.projects.displayName,
          schema.projects.description,
          schema.projects.rootPath,
          schema.projects.metadata,
          schema.projects.isActive,
          schema.projects.createdAt
        )
        .orderBy(asc(schema.projects.name));
      
      // Convert boolean is_active to number and ensure non-null values
      return results.map(p => ({
        id: p.id,
        name: p.name,
        display_name: p.display_name,
        description: p.description,
        root_path: p.root_path,
        metadata: p.metadata || {},
        is_active: p.is_active ? 1 : 0,
        created_at: p.created_at || new Date().toISOString(),
        symbol_count: p.symbol_count
      }));
    } catch {
      this.logger.warn('Projects table not found, returning empty array');
      return [];
    }
  }

  /**
   * Get languages with symbol counts
   */
  async getLanguages() {
    try {
      const results = await this.db
        .select({
          id: schema.languages.id,
          name: schema.languages.name,
          display_name: schema.languages.displayName,
          file_extensions: schema.languages.extensions,
          symbol_count: drizzleSql<number>`count(${schema.universalSymbols.id})`
        })
        .from(schema.languages)
        .leftJoin(schema.universalSymbols, eq(schema.languages.id, schema.universalSymbols.languageId))
        .groupBy(
          schema.languages.id,
          schema.languages.name,
          schema.languages.displayName,
          schema.languages.extensions
        )
        .orderBy(asc(schema.languages.name));
      
      // Convert array to string for compatibility
      return results.map(l => ({
        id: l.id,
        name: l.name,
        display_name: l.display_name,
        file_extensions: l.file_extensions ? l.file_extensions.join(',') : null,
        symbol_count: l.symbol_count
      }));
    } catch {
      this.logger.warn('Languages table not found, returning empty array');
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(schema.universalSymbols)
        .get();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get incoming relationships for a symbol
   */
  async getIncomingRelationships(symbolId: number) {
    return await this.db
      .select()
      .from(schema.universalRelationships)
      .where(eq(schema.universalRelationships.toSymbolId, symbolId));
  }

  /**
   * Get outgoing relationships for a symbol
   */
  async getOutgoingRelationships(symbolId: number) {
    return await this.db
      .select()
      .from(schema.universalRelationships)
      .where(eq(schema.universalRelationships.fromSymbolId, symbolId));
  }

  /**
   * Get dependent symbols
   */
  async getDependentSymbols(symbolId: number) {
    return await this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        qualified_name: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        namespace: schema.universalSymbols.namespace,
        file_path: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        column: schema.universalSymbols.column,
        visibility: schema.universalSymbols.visibility,
        signature: schema.universalSymbols.signature,
        return_type: schema.universalSymbols.returnType,
        is_exported: schema.universalSymbols.isExported,
        language_id: schema.universalSymbols.languageId,
        project_id: schema.universalSymbols.projectId
      })
      .from(schema.universalSymbols)
      .innerJoin(
        schema.universalRelationships,
        eq(schema.universalSymbols.id, schema.universalRelationships.fromSymbolId)
      )
      .where(eq(schema.universalRelationships.toSymbolId, symbolId));
  }

  /**
   * Get comprehensive database statistics (basic format)
   */
  async getComprehensiveDbStats() {
    const totalSymbols = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(schema.universalSymbols)
      .get();

    const totalRelationships = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(schema.universalRelationships)
      .get();

    const symbolsByKind = await this.db
      .select({
        kind: schema.universalSymbols.kind,
        count: drizzleSql<number>`count(*)`
      })
      .from(schema.universalSymbols)
      .groupBy(schema.universalSymbols.kind);

    const avgComplexity = await this.db
      .select({ avg: drizzleSql<number>`avg(${schema.cppMethodComplexity.cyclomaticComplexity})` })
      .from(schema.cppMethodComplexity)
      .get();

    const highComplexityCount = await this.db
      .select({ count: drizzleSql<number>`count(*)` })
      .from(schema.cppMethodComplexity)
      .where(drizzleSql`${schema.cppMethodComplexity.cyclomaticComplexity} > 10`)
      .get();

    return {
      totalSymbols: totalSymbols?.count || 0,
      totalRelationships: totalRelationships?.count || 0,
      symbolsByKind: Object.fromEntries(symbolsByKind.map(s => [s.kind, s.count])),
      avgComplexity: avgComplexity?.avg || 0,
      highComplexityCount: highComplexityCount?.count || 0
    };
  }

  /**
   * Get detailed metrics for anti-pattern detection (used by CodeMetricsAnalyzer)
   */
  async getMetricsForAntiPatterns(): Promise<{
    symbols: Array<{
      id: number;
      name: string;
      kind: string;
      cyclomaticComplexity?: number;
      fanIn?: number;
      fanOut?: number;
      linesOfCode?: number;
      parameterCount?: number;
      semantic_tags?: string;
    }>;
    relationships: Array<{
      sourceSymbolId: number;
      targetSymbolId: number;
      relationshipType: string;
    }>;
  }> {
    // Get symbols with complexity metrics
    const symbolsWithMetrics = await this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        kind: schema.universalSymbols.kind,
        semantic_tags: schema.universalSymbols.semanticTags,
        // Join with cpp method complexity
        cyclomaticComplexity: schema.cppMethodComplexity.cyclomaticComplexity,
        linesOfCode: schema.cppMethodComplexity.lineCount,
        parameterCount: schema.cppMethodComplexity.parameterCount
      })
      .from(schema.universalSymbols)
      .leftJoin(
        schema.cppMethodComplexity,
        eq(schema.universalSymbols.id, schema.cppMethodComplexity.symbolId)
      )
      .where(drizzleSql`${schema.universalSymbols.confidence} > 0.5`)
      .orderBy(
        desc(schema.cppMethodComplexity.cyclomaticComplexity)
      );

    // Calculate fan-in and fan-out for each symbol
    const symbolsWithFanMetrics = await Promise.all(
      symbolsWithMetrics.map(async (symbol) => {
        const fanIn = await this.db
          .select({ count: drizzleSql<number>`count(*)` })
          .from(schema.universalRelationships)
          .where(eq(schema.universalRelationships.toSymbolId, symbol.id))
          .get();

        const fanOut = await this.db
          .select({ count: drizzleSql<number>`count(*)` })
          .from(schema.universalRelationships)
          .where(eq(schema.universalRelationships.fromSymbolId, symbol.id))
          .get();

        return {
          id: symbol.id,
          name: symbol.name,
          kind: symbol.kind,
          cyclomaticComplexity: symbol.cyclomaticComplexity ?? undefined,
          fanIn: fanIn?.count || 0,
          fanOut: fanOut?.count || 0,
          linesOfCode: symbol.linesOfCode ?? undefined,
          parameterCount: symbol.parameterCount ?? undefined,
          semantic_tags: symbol.semantic_tags ? JSON.stringify(symbol.semantic_tags) : undefined
        };
      })
    );

    // Get relationships
    const relationships = await this.db
      .select({
        sourceSymbolId: schema.universalRelationships.fromSymbolId,
        targetSymbolId: schema.universalRelationships.toSymbolId,
        relationshipType: schema.universalRelationships.type
      })
      .from(schema.universalRelationships)
      .where(
        drizzleSql`${schema.universalRelationships.type} IN ('depends_on', 'calls', 'inherits_from', 'uses', 'inherits')`
      );

    return {
      symbols: symbolsWithFanMetrics,
      relationships: relationships.map(r => ({
        sourceSymbolId: r.sourceSymbolId || 0,
        targetSymbolId: r.targetSymbolId || 0,
        relationshipType: r.relationshipType
      }))
    };
  }

  /**
   * Get all relationships for graph visualization
   */
  async getAllRelationships(limit: number = 100) {
    // Get basic relationships first
    const relationships = await this.db
      .select()
      .from(schema.universalRelationships)
      .orderBy(desc(schema.universalRelationships.confidence))
      .limit(limit);

    // Enrich with symbol details
    const enrichedRelationships = await Promise.all(
      relationships.map(async (rel) => {
        const fromSymbol = await this.getSymbol(rel.fromSymbolId || 0);
        const toSymbol = await this.getSymbol(rel.toSymbolId || 0);
        
        const fromLang = fromSymbol?.languageId 
          ? await this.db.select().from(schema.languages).where(eq(schema.languages.id, fromSymbol.languageId)).get()
          : null;
        
        const toLang = toSymbol?.languageId
          ? await this.db.select().from(schema.languages).where(eq(schema.languages.id, toSymbol.languageId)).get()
          : null;

        return {
          // Core relationship fields
          id: rel.id,
          project_id: rel.projectId,
          from_symbol_id: rel.fromSymbolId,
          to_symbol_id: rel.toSymbolId,
          type: rel.type,
          confidence: rel.confidence,
          context_line: rel.contextLine,
          context_column: rel.contextColumn,
          context_snippet: rel.contextSnippet,
          metadata: rel.metadata,
          created_at: rel.createdAt,
          // Source symbol rich data
          from_name: fromSymbol?.name || '',
          from_qualified_name: fromSymbol?.qualifiedName || '',
          from_kind: fromSymbol?.kind || '',
          from_namespace: fromSymbol?.namespace || '',
          from_file_path: fromSymbol?.filePath || '',
          from_line: fromSymbol?.line || 0,
          from_column: fromSymbol?.column || 0,
          from_end_line: fromSymbol?.endLine,
          from_end_column: fromSymbol?.endColumn,
          from_signature: fromSymbol?.signature,
          from_return_type: fromSymbol?.returnType,
          from_visibility: fromSymbol?.visibility,
          from_is_exported: fromSymbol?.isExported || false,
          from_is_async: fromSymbol?.isAsync || false,
          from_is_abstract: fromSymbol?.isAbstract || false,
          from_language_features: fromSymbol?.languageFeatures ? JSON.stringify(fromSymbol.languageFeatures) : undefined,
          from_semantic_tags: fromSymbol?.semanticTags ? JSON.stringify(fromSymbol.semanticTags) : undefined,
          from_confidence: fromSymbol?.confidence || 1,
          from_language: fromLang?.name || '',
          // Target symbol rich data
          to_name: toSymbol?.name || '',
          to_qualified_name: toSymbol?.qualifiedName || '',
          to_kind: toSymbol?.kind || '',
          to_namespace: toSymbol?.namespace || '',
          to_file_path: toSymbol?.filePath || '',
          to_line: toSymbol?.line || 0,
          to_column: toSymbol?.column || 0,
          to_end_line: toSymbol?.endLine,
          to_end_column: toSymbol?.endColumn,
          to_signature: toSymbol?.signature,
          to_return_type: toSymbol?.returnType,
          to_visibility: toSymbol?.visibility,
          to_is_exported: toSymbol?.isExported || false,
          to_is_async: toSymbol?.isAsync || false,
          to_is_abstract: toSymbol?.isAbstract || false,
          to_language_features: toSymbol?.languageFeatures ? JSON.stringify(toSymbol.languageFeatures) : undefined,
          to_semantic_tags: toSymbol?.semanticTags ? JSON.stringify(toSymbol.semanticTags) : undefined,
          to_confidence: toSymbol?.confidence || 1,
          to_language: toLang?.name || ''
        };
      })
    );

    return enrichedRelationships;
  }

  /**
   * Execute a custom query (for backward compatibility - should be migrated)
   */
  async executeQuery(_query: any): Promise<any[]> {
    // This method is deprecated and should not be used
    // Only here for backward compatibility
    return [];
  }

  /**
   * Get raw database instance (for gradual migration)
   */
  getRawDb(): Database.Database {
    // Access the internal client from Drizzle
    return (this.db as any).session.client;
  }

  /**
   * Get the Drizzle instance (for tools that expect DrizzleDb type)
   */
  getDrizzle(): DrizzleDb {
    return this.db;
  }

  // ============================================================================
  // SEMANTIC TAG OPERATIONS
  // ============================================================================

  /**
   * Get semantic tag by name
   */
  async getSemanticTagByName(name: string) {
    return this.db
      .select()
      .from(schema.semanticTagDefinitions)
      .where(
        and(
          eq(schema.semanticTagDefinitions.name, name),
          eq(schema.semanticTagDefinitions.isActive, true)
        )
      )
      .get();
  }

  /**
   * Check if semantic tag exists
   */
  async semanticTagExists(name: string): Promise<boolean> {
    const result = this.db
      .select({ id: schema.semanticTagDefinitions.id })
      .from(schema.semanticTagDefinitions)
      .where(eq(schema.semanticTagDefinitions.name, name))
      .get();
    return !!result;
  }

  /**
   * Get semantic tag by ID
   */
  async getSemanticTagById(id: number) {
    return this.db
      .select()
      .from(schema.semanticTagDefinitions)
      .where(eq(schema.semanticTagDefinitions.id, id))
      .get();
  }

  /**
   * Insert semantic tag definition
   */
  async insertSemanticTag(tag: {
    name: string;
    displayName: string;
    description?: string;
    category: string;
    isUniversal?: boolean;
    applicableLanguages?: string[];
    parentTagId?: number | null;
    validationRules?: any;
    color?: string | null;
    icon?: string | null;
    isActive?: boolean;
  }) {
    const result = await this.db
      .insert(schema.semanticTagDefinitions)
      .values({
        name: tag.name,
        displayName: tag.displayName,
        description: tag.description,
        category: tag.category,
        isUniversal: tag.isUniversal ?? true,
        applicableLanguages: tag.applicableLanguages,
        parentTagId: tag.parentTagId,
        validationRules: tag.validationRules,
        color: tag.color,
        icon: tag.icon,
        isActive: tag.isActive ?? true
      })
      .returning({ id: schema.semanticTagDefinitions.id });
    
    return result[0]?.id;
  }

  /**
   * Update semantic tag definition
   */
  async updateSemanticTag(tagId: number, updates: Partial<{
    displayName?: string;
    description?: string;
    category?: string;
    isUniversal?: boolean;
    applicableLanguages?: string[];
    parentTagId?: number | null;
    validationRules?: any;
    color?: string | null;
    icon?: string | null;
    isActive?: boolean;
  }>) {
    const updateValues: any = {};
    
    if (updates.displayName !== undefined) updateValues.displayName = updates.displayName;
    if (updates.description !== undefined) updateValues.description = updates.description;
    if (updates.category !== undefined) updateValues.category = updates.category;
    if (updates.isUniversal !== undefined) updateValues.isUniversal = updates.isUniversal;
    if (updates.applicableLanguages !== undefined) updateValues.applicableLanguages = updates.applicableLanguages;
    if (updates.parentTagId !== undefined) updateValues.parentTagId = updates.parentTagId;
    if (updates.validationRules !== undefined) updateValues.validationRules = updates.validationRules;
    if (updates.color !== undefined) updateValues.color = updates.color;
    if (updates.icon !== undefined) updateValues.icon = updates.icon;
    if (updates.isActive !== undefined) updateValues.isActive = updates.isActive;
    
    if (Object.keys(updateValues).length > 0) {
      await this.db
        .update(schema.semanticTagDefinitions)
        .set(updateValues)
        .where(eq(schema.semanticTagDefinitions.id, tagId));
    }
  }

  /**
   * Delete semantic tag
   */
  async deleteSemanticTag(tagId: number) {
    const tag = this.db
      .select({ name: schema.semanticTagDefinitions.name })
      .from(schema.semanticTagDefinitions)
      .where(eq(schema.semanticTagDefinitions.id, tagId))
      .get();
    
    if (!tag) {
      throw new Error(`Tag with id ${tagId} not found`);
    }
    
    await this.db
      .delete(schema.semanticTagDefinitions)
      .where(eq(schema.semanticTagDefinitions.id, tagId));
    
    return tag.name;
  }

  /**
   * Get semantic tags by category
   */
  async getSemanticTagsByCategory(category: string) {
    return await this.db
      .select()
      .from(schema.semanticTagDefinitions)
      .where(
        and(
          eq(schema.semanticTagDefinitions.category, category),
          eq(schema.semanticTagDefinitions.isActive, true)
        )
      )
      .orderBy(asc(schema.semanticTagDefinitions.name));
  }

  /**
   * Get all semantic tags
   */
  async getAllSemanticTags() {
    return await this.db
      .select()
      .from(schema.semanticTagDefinitions)
      .where(eq(schema.semanticTagDefinitions.isActive, true))
      .orderBy(
        asc(schema.semanticTagDefinitions.category),
        asc(schema.semanticTagDefinitions.name)
      );
  }

  /**
   * Get semantic tags for language
   */
  async getSemanticTagsForLanguage(language: string) {
    return await this.db
      .select()
      .from(schema.semanticTagDefinitions)
      .where(
        and(
          eq(schema.semanticTagDefinitions.isActive, true),
          drizzleSql`(${schema.semanticTagDefinitions.isUniversal} = 1 OR ${schema.semanticTagDefinitions.applicableLanguages} LIKE ${`%"${language}"%`})`
        )
      )
      .orderBy(
        asc(schema.semanticTagDefinitions.category),
        asc(schema.semanticTagDefinitions.name)
      );
  }

  /**
   * Assign semantic tag to symbol
   */
  async assignSemanticTag(assignment: {
    symbolId: string;
    tagId: number;
    confidence?: number;
    autoDetected?: boolean;
    detectorName?: string | null;
    context?: Record<string, any> | null;
  }) {
    await this.db
      .insert(schema.symbolSemanticTags)
      .values({
        symbolId: parseInt(assignment.symbolId),
        tagId: assignment.tagId,
        confidence: assignment.confidence ?? 1.0,
        autoDetected: assignment.autoDetected ?? false,
        detectorName: assignment.detectorName,
        context: assignment.context
      })
      .onConflictDoUpdate({
        target: [schema.symbolSemanticTags.symbolId, schema.symbolSemanticTags.tagId],
        set: {
          confidence: assignment.confidence ?? 1.0,
          autoDetected: assignment.autoDetected ?? false,
          detectorName: assignment.detectorName,
          context: assignment.context,
          createdAt: drizzleSql`CURRENT_TIMESTAMP`
        }
      });
  }

  /**
   * Remove semantic tag from symbol
   */
  async removeSemanticTag(symbolId: string, tagId: number) {
    await this.db
      .delete(schema.symbolSemanticTags)
      .where(
        and(
          eq(schema.symbolSemanticTags.symbolId, parseInt(symbolId)),
          eq(schema.symbolSemanticTags.tagId, tagId)
        )
      );
  }

  /**
   * Get symbol semantic tags
   */
  async getSymbolSemanticTags(symbolId: string) {
    return await this.db
      .select({
        symbolId: schema.symbolSemanticTags.symbolId,
        tagId: schema.symbolSemanticTags.tagId,
        tagName: schema.semanticTagDefinitions.name,
        confidence: schema.symbolSemanticTags.confidence,
        autoDetected: schema.symbolSemanticTags.autoDetected,
        detectorName: schema.symbolSemanticTags.detectorName,
        context: schema.symbolSemanticTags.context,
        createdAt: schema.symbolSemanticTags.createdAt
      })
      .from(schema.symbolSemanticTags)
      .innerJoin(
        schema.semanticTagDefinitions,
        eq(schema.symbolSemanticTags.tagId, schema.semanticTagDefinitions.id)
      )
      .where(eq(schema.symbolSemanticTags.symbolId, parseInt(symbolId)))
      .orderBy(
        desc(schema.symbolSemanticTags.confidence),
        asc(schema.semanticTagDefinitions.name)
      );
  }

  // ============================================================================
  // ANALYTICS OPERATIONS
  // ============================================================================

  /**
   * Find singleton pattern candidates
   */
  async findSingletonPatterns() {
    const classes = await this.db
      .select()
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.kind, 'class'));

    // Filter classes that have getInstance methods
    const candidates = [];
    for (const cls of classes) {
      const methods = await this.db
        .select()
        .from(schema.universalSymbols)
        .where(
          and(
            eq(schema.universalSymbols.parentSymbolId, cls.id),
            drizzleSql`${schema.universalSymbols.name} LIKE '%getInstance%'`
          )
        );
      
      if (methods.length > 0) {
        candidates.push(cls);
      }
    }
    
    return candidates;
  }

  /**
   * Find factory pattern candidates
   */
  async findFactoryPatterns() {
    return await this.db
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          drizzleSql`(${schema.universalSymbols.name} LIKE '%Factory%' OR ${schema.universalSymbols.name} LIKE '%create%')`,
          inArray(schema.universalSymbols.kind, ['class', 'function'])
        )
      );
  }

  /**
   * Find observer pattern candidates
   */
  async findObserverPatterns() {
    const classes = await this.db
      .select()
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.kind, 'class'));

    // Filter classes that have subscribe/notify/observer methods
    const candidates = [];
    for (const cls of classes) {
      const methods = await this.db
        .select()
        .from(schema.universalSymbols)
        .where(
          and(
            eq(schema.universalSymbols.parentSymbolId, cls.id),
            drizzleSql`(
              ${schema.universalSymbols.name} LIKE '%subscribe%' OR 
              ${schema.universalSymbols.name} LIKE '%notify%' OR 
              ${schema.universalSymbols.name} LIKE '%observer%'
            )`
          )
        );
      
      if (methods.length > 0) {
        candidates.push(cls);
      }
    }
    
    return candidates;
  }

  /**
   * Find god classes (anti-pattern)
   */
  async findGodClasses(methodThreshold: number = 20) {
    // First get all classes
    const classes = await this.db
      .select()
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.kind, 'class'));

    // Then count methods for each class
    const results = [];
    for (const cls of classes) {
      const methods = await this.db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(schema.universalSymbols)
        .where(
          and(
            eq(schema.universalSymbols.parentSymbolId, cls.id),
            eq(schema.universalSymbols.kind, 'function')
          )
        )
        .get();
      
      const methodCount = methods?.count || 0;
      if (methodCount > methodThreshold) {
        results.push({
          ...cls,
          method_count: methodCount
        });
      }
    }

    return results;
  }

  /**
   * Get code flow paths for coverage
   */
  async getCodeFlowCoverage(symbolId: string) {
    return this.db
      .select({
        totalPaths: drizzleSql<number>`COUNT(DISTINCT ${schema.codeFlowPaths.id})`,
        coveredPaths: drizzleSql<number>`COUNT(DISTINCT CASE WHEN ${schema.codeFlowPaths.coverage} > 0 THEN ${schema.codeFlowPaths.id} END)`,
        avgCoverage: drizzleSql<number>`AVG(${schema.codeFlowPaths.coverage})`
      })
      .from(schema.codeFlowPaths)
      .where(
        drizzleSql`${schema.codeFlowPaths.startSymbolId} = ${symbolId} OR ${schema.codeFlowPaths.endSymbolId} = ${symbolId}`
      )
      .get();
  }

  /**
   * Find uncovered symbols
   */
  async findUncoveredSymbols(symbolIds: number[]) {
    if (symbolIds.length === 0) return [];

    return await this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        qualifiedName: schema.universalSymbols.qualifiedName
      })
      .from(schema.universalSymbols)
      .where(
        and(
          inArray(schema.universalSymbols.id, symbolIds),
          drizzleSql`NOT EXISTS (
            SELECT 1 FROM ${schema.codeFlowPaths}
            WHERE (${schema.codeFlowPaths.startSymbolId} = ${schema.universalSymbols.id} 
                   OR ${schema.codeFlowPaths.endSymbolId} = ${schema.universalSymbols.id})
            AND ${schema.codeFlowPaths.coverage} > 0
          )`
        )
      );
  }

  /**
   * Get method complexity metrics
   */
  async getMethodComplexity(symbolId: string) {
    return this.db
      .select()
      .from(schema.cppMethodComplexity)
      .where(eq(schema.cppMethodComplexity.symbolId, parseInt(symbolId)))
      .get();
  }

  /**
   * Get execution time estimates
   */
  async getExecutionTimeEstimates(symbolId: string) {
    return this.db
      .select({
        avgExecutionTime: drizzleSql<number>`AVG(${schema.callChains.estimatedExecutionTimeMs})`,
        maxExecutionTime: drizzleSql<number>`MAX(${schema.callChains.estimatedExecutionTimeMs})`
      })
      .from(schema.callChains)
      .where(eq(schema.callChains.entryPointId, parseInt(symbolId)))
      .get();
  }

  /**
   * Get distinct file paths for symbols
   */
  async getDistinctFilePaths(symbolIds: number[]) {
    if (symbolIds.length === 0) return [];

    return await this.db
      .selectDistinct({ filePath: schema.universalSymbols.filePath })
      .from(schema.universalSymbols)
      .where(inArray(schema.universalSymbols.id, symbolIds));
  }

  /**
   * Get import dependencies
   */
  async getImportDependencies(symbolId: string) {
    return await this.db
      .selectDistinct({ namespace: schema.universalSymbols.namespace })
      .from(schema.universalRelationships)
      .innerJoin(
        schema.universalSymbols,
        eq(schema.universalRelationships.toSymbolId, schema.universalSymbols.id)
      )
      .where(
        and(
          eq(schema.universalRelationships.fromSymbolId, parseInt(symbolId)),
          inArray(schema.universalRelationships.type, ['imports', 'includes'])
        )
      );
  }

  /**
   * Get distinct namespaces for symbols
   */
  async getDistinctNamespaces(symbolIds: number[]) {
    if (symbolIds.length === 0) return [];

    return await this.db
      .selectDistinct({ namespace: schema.universalSymbols.namespace })
      .from(schema.universalSymbols)
      .where(
        and(
          inArray(schema.universalSymbols.id, symbolIds),
          isNotNull(schema.universalSymbols.namespace)
        )
      );
  }

  /**
   * Get anti-pattern violations
   */
  async getAntiPatternViolations(symbolId: string) {
    const patternCount = await this.db
      .select({ violationCount: drizzleSql<number>`count(*)` })
      .from(schema.detectedPatterns)
      .innerJoin(
        schema.patternSymbols,
        eq(schema.detectedPatterns.id, schema.patternSymbols.patternId)
      )
      .where(
        and(
          drizzleSql`${schema.detectedPatterns.patternType} LIKE '%Anti-Pattern%'`,
          eq(schema.patternSymbols.symbolId, parseInt(symbolId))
        )
      )
      .get();

    return patternCount?.violationCount || 0;
  }

  /**
   * Get semantic insights
   */
  async getSemanticInsights(symbolId: string, limit: number = 10) {
    return await this.db
      .select()
      .from(schema.semanticInsights)
      .where(drizzleSql`${schema.semanticInsights.affectedSymbols} LIKE ${`%${symbolId}%`}`)
      .orderBy(
        asc(schema.semanticInsights.priority),
        desc(schema.semanticInsights.severity)
      )
      .limit(limit);
  }

  /**
   * Get symbol test coverage
   */
  async getSymbolTestCoverage(symbolId: string) {
    return this.db
      .select({ testCoverage: drizzleSql<number>`AVG(${schema.codeFlowPaths.coverage})` })
      .from(schema.codeFlowPaths)
      .where(
        drizzleSql`${schema.codeFlowPaths.startSymbolId} = ${symbolId} OR ${schema.codeFlowPaths.endSymbolId} = ${symbolId}`
      )
      .get();
  }

  /**
   * Get bug count for symbol
   */
  async getBugCount(symbolId: string) {
    const result = this.db
      .select({ bugCount: drizzleSql<number>`count(*)` })
      .from(schema.semanticInsights)
      .where(
        and(
          eq(schema.semanticInsights.insightType, 'bug'),
          drizzleSql`${schema.semanticInsights.affectedSymbols} LIKE ${`%${symbolId}%`}`
        )
      )
      .get();

    return result?.bugCount || 0;
  }

  // ============================================================================
  // RELATIONSHIP ENRICHMENT OPERATIONS
  // ============================================================================

  /**
   * Get all symbols with qualified names for indexing
   */
  async getSymbolsForIndexing() {
    return await this.db
      .select({
        id: schema.universalSymbols.id,
        qualifiedName: schema.universalSymbols.qualifiedName,
        name: schema.universalSymbols.name,
        signature: schema.universalSymbols.signature,
        filePath: schema.universalSymbols.filePath
      })
      .from(schema.universalSymbols)
      .where(isNotNull(schema.universalSymbols.qualifiedName));
  }

  /**
   * Get unresolved relationships
   */
  async getUnresolvedRelationships() {
    // Since the schema doesn't have toName, we'll return relationships where toSymbolId is null
    return await this.db
      .select({
        id: schema.universalRelationships.id,
        fromSymbolId: schema.universalRelationships.fromSymbolId,
        toSymbolId: schema.universalRelationships.toSymbolId,
        type: schema.universalRelationships.type
      })
      .from(schema.universalRelationships)
      .where(isNull(schema.universalRelationships.toSymbolId));
  }

  /**
   * Update relationship with resolved symbol ID
   */
  async updateRelationshipToSymbolId(relationshipId: number, toSymbolId: number) {
    await this.db
      .update(schema.universalRelationships)
      .set({ toSymbolId })
      .where(eq(schema.universalRelationships.id, relationshipId));
  }

  /**
   * Find function entry points (not called by others)
   */
  async findFunctionEntryPoints() {
    // Get all functions/methods that are NOT targets of 'calls' relationships
    const calledFunctions = this.db
      .select({ id: schema.universalRelationships.toSymbolId })
      .from(schema.universalRelationships)
      .where(
        and(
          eq(schema.universalRelationships.type, 'calls'),
          isNotNull(schema.universalRelationships.toSymbolId)
        )
      );

    return await this.db
      .select({
        id: schema.universalSymbols.id,
        qualifiedName: schema.universalSymbols.qualifiedName
      })
      .from(schema.universalSymbols)
      .where(
        and(
          inArray(schema.universalSymbols.kind, ['function', 'method']),
          drizzleSql`${schema.universalSymbols.id} NOT IN (${calledFunctions})`
        )
      );
  }

  /**
   * Insert call chain
   */
  async insertCallChain(entryPointId: number, maxDepth: number, totalNodes: number) {
    const result = await this.db
      .insert(schema.callChains)
      .values({
        entryPointId,
        chainDepth: maxDepth,
        totalFunctions: totalNodes
      })
      .returning({ id: schema.callChains.id });
    
    return result[0]?.id;
  }

  /**
   * Insert call chain step
   */
  async insertCallChainStep(chainId: number, stepNumber: number, calleeId: number, callerId: number) {
    await this.db
      .insert(schema.callChainSteps)
      .values({
        chainId,
        stepNumber,
        callerId,
        calleeId
      });
  }

  /**
   * Get functions called by a symbol
   */
  async getFunctionsCalled(symbolId: number) {
    return await this.db
      .select({ toSymbolId: schema.universalRelationships.toSymbolId })
      .from(schema.universalRelationships)
      .where(
        and(
          eq(schema.universalRelationships.fromSymbolId, symbolId),
          eq(schema.universalRelationships.type, 'calls'),
          isNotNull(schema.universalRelationships.toSymbolId)
        )
      );
  }

  /**
   * Find GPU compute functions
   */
  async findGPUFunctions() {
    return this.db
      .select({
        id: schema.universalSymbols.id,
        qualifiedName: schema.universalSymbols.qualifiedName,
        signature: schema.universalSymbols.signature
      })
      .from(schema.universalSymbols)
      .leftJoin(schema.cppFeatures, eq(schema.cppFeatures.symbolId, schema.universalSymbols.id))
      .where(
        drizzleSql`
          ${schema.cppFeatures.usesGpuCompute} = 1
          OR ${schema.universalSymbols.signature} LIKE '%kernel%'
          OR ${schema.universalSymbols.signature} LIKE '%dispatch%'
          OR ${schema.universalSymbols.signature} LIKE '%compute%'
          OR ${schema.universalSymbols.signature} LIKE '%gpu%'
          OR ${schema.universalSymbols.signature} LIKE '%GPU%'
        `
      );
  }

  /**
   * Get callers of a specific symbol
   */
  async getCallersOfSymbol(symbolId: number) {
    return await this.db
      .select({
        fromSymbolId: schema.universalRelationships.fromSymbolId
      })
      .from(schema.universalRelationships)
      .where(
        and(
          eq(schema.universalRelationships.toSymbolId, symbolId),
          eq(schema.universalRelationships.type, 'calls')
        )
      );
  }

  /**
   * Get symbol execution info
   */
  async getSymbolExecutionInfo(symbolId: number) {
    // Get GPU compute info from cpp_features table
    return this.db
      .select({
        usesGpuCompute: schema.cppFeatures.usesGpuCompute
      })
      .from(schema.universalSymbols)
      .leftJoin(schema.cppFeatures, eq(schema.cppFeatures.symbolId, schema.universalSymbols.id))
      .where(eq(schema.universalSymbols.id, symbolId))
      .get();
  }

  /**
   * Insert GPU dispatch relationship
   */
  async insertGPUDispatchRelationship(fromSymbolId: number, toSymbolId: number, contextSnippet?: string) {
    await this.db
      .insert(schema.universalRelationships)
      .values({
        projectId: 1, // Default project ID
        fromSymbolId,
        toSymbolId,
        type: 'dispatches_to_gpu',
        contextSnippet: contextSnippet || null,
        confidence: 1.0
      });
  }

  /**
   * Get functions with signatures for data flow analysis
   */
  async getFunctionsWithSignatures(projectId: number) {
    return this.db
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.projectId, projectId),
          or(
            eq(schema.universalSymbols.kind, "function"),
            eq(schema.universalSymbols.kind, "method")
          ),
          sql`${schema.universalSymbols.signature} IS NOT NULL`
        )
      );
  }

  /**
   * Get call relationships for data flow analysis
   */
  async getCallRelationships(projectId: number) {
    return this.db
      .select()
      .from(schema.universalRelationships)
      .where(
        and(
          eq(schema.universalRelationships.projectId, projectId),
          eq(schema.universalRelationships.type, "calls")
        )
      );
  }

  /**
   * Insert data flow relationship
   */
  async insertDataFlowRelationship(params: {
    projectId: number;
    fromSymbolId: number;
    toSymbolId: number;
    type: string;
    confidence: number;
    contextSnippet: string;
  }) {
    await this.db.insert(schema.universalRelationships).values(params);
  }

  /**
   * Get classes and structs for virtual override analysis
   */
  async getClassesAndStructs(projectId: number) {
    return this.db
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.projectId, projectId),
          or(
            eq(schema.universalSymbols.kind, "class"),
            eq(schema.universalSymbols.kind, "struct")
          )
        )
      );
  }

  /**
   * Get class methods for virtual override analysis
   */
  async getClassMethods(projectId: number) {
    return this.db
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.projectId, projectId),
          eq(schema.universalSymbols.kind, "method"),
          sql`${schema.universalSymbols.parentSymbolId} IS NOT NULL`
        )
      );
  }

  /**
   * Get inheritance relationships for a class
   */
  async getInheritanceRelationships(projectId: number, classId: number) {
    return this.db
      .select()
      .from(schema.universalRelationships)
      .where(
        and(
          eq(schema.universalRelationships.projectId, projectId),
          eq(schema.universalRelationships.fromSymbolId, classId),
          eq(schema.universalRelationships.type, "inherits")
        )
      );
  }

  /**
   * Get file symbols for module organization (C++ specific)
   */
  async getFileSymbolsForModules() {
    return this.db
      .select({
        file_path: schema.universalSymbols.filePath,
        namespace: schema.universalSymbols.namespace,
        symbol_count: sql<number>`COUNT(*)`,
        file_type: sql<string>`
          CASE 
            WHEN ${schema.universalSymbols.filePath} LIKE '%.ixx' THEN 'interface'
            WHEN ${schema.universalSymbols.filePath} LIKE '%.cpp' THEN 'implementation'
            ELSE 'other'
          END
        `,
        symbol_kinds: sql<string>`GROUP_CONCAT(DISTINCT ${schema.universalSymbols.kind})`
      })
      .from(schema.universalSymbols)
      .where(
        and(
          or(
            sql`${schema.universalSymbols.filePath} LIKE '%.ixx'`,
            sql`${schema.universalSymbols.filePath} LIKE '%.cpp'`
          ),
          sql`${schema.universalSymbols.namespace} IS NOT NULL AND ${schema.universalSymbols.namespace} != '' AND ${schema.universalSymbols.namespace} != 'null'`
        )
      )
      .groupBy(schema.universalSymbols.filePath, schema.universalSymbols.namespace)
      .orderBy(schema.universalSymbols.namespace, schema.universalSymbols.filePath);
  }

  /**
   * Get module imports for C++ files
   */
  async getModuleImports() {
    return this.db
      .select({
        from_file: schema.universalSymbols.filePath,
        imported_name: sql<string>`s2.name`,
        imported_qualified_name: sql<string>`s2.qualified_name`,
        imported_namespace: sql<string>`s2.namespace`
      })
      .from(schema.universalRelationships)
      .innerJoin(
        schema.universalSymbols,
        eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
      )
      .innerJoin(
        sql`universal_symbols s2`,
        sql`${schema.universalRelationships.toSymbolId} = s2.id`
      )
      .where(
        and(
          inArray(schema.universalRelationships.type, ['imports', 'includes', 'uses']),
          or(
            sql`${schema.universalSymbols.filePath} LIKE '%.ixx'`,
            sql`${schema.universalSymbols.filePath} LIKE '%.cpp'`
          )
        )
      );
  }

  /**
   * Get top-level symbols for modules
   */
  async getTopLevelSymbolsForModules() {
    return this.db
      .select({
        file_path: schema.universalSymbols.filePath,
        name: schema.universalSymbols.name,
        qualified_name: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        return_type: schema.universalSymbols.returnType,
        signature: schema.universalSymbols.signature,
        visibility: schema.universalSymbols.visibility,
        namespace: schema.universalSymbols.namespace
      })
      .from(schema.universalSymbols)
      .where(
        and(
          or(
            sql`${schema.universalSymbols.filePath} LIKE '%.ixx'`,
            sql`${schema.universalSymbols.filePath} LIKE '%.cpp'`
          ),
          isNull(schema.universalSymbols.parentSymbolId),
          inArray(schema.universalSymbols.kind, ['class', 'struct', 'enum', 'interface', 'function', 'namespace']),
          sql`${schema.universalSymbols.namespace} IS NOT NULL AND ${schema.universalSymbols.namespace} != '' AND ${schema.universalSymbols.namespace} != 'null'`
        )
      )
      .orderBy(schema.universalSymbols.filePath, schema.universalSymbols.kind, schema.universalSymbols.name);
  }

  /**
   * Get module details by namespace and file pattern
   */
  async getModuleDetailsByNamespace(namespace: string, filePattern: string) {
    return this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        qualified_name: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        namespace: schema.universalSymbols.namespace,
        file_path: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        column: schema.universalSymbols.column,
        visibility: schema.universalSymbols.visibility,
        signature: schema.universalSymbols.signature,
        return_type: schema.universalSymbols.returnType,
        is_exported: schema.universalSymbols.isExported,
        language_id: schema.universalSymbols.languageId,
        project_id: schema.universalSymbols.projectId
      })
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.namespace, namespace),
          sql`${schema.universalSymbols.filePath} LIKE ${filePattern}`
        )
      )
      .orderBy(schema.universalSymbols.kind, schema.universalSymbols.name);
  }

  // API bindings methods
  async insertApiBinding(binding: {
    projectId: number;
    sourceSymbolId?: string | null;
    targetSymbolId?: string | null;
    sourceLanguage: string;
    targetLanguage: string;
    bindingType: string;
    protocol?: string | null;
    endpoint?: string | null;
    typeMapping: any;
    serializationFormat?: string | null;
    schemaDefinition?: string | null;
    confidence: number;
    detectorName: string;
    detectionReason: string;
    metadata?: any | null;
  }) {
    const result = await this.db
      .insert(schema.apiBindings)
      .values({
        projectId: binding.projectId,
        sourceSymbolId: binding.sourceSymbolId,
        targetSymbolId: binding.targetSymbolId,
        sourceLanguage: binding.sourceLanguage,
        targetLanguage: binding.targetLanguage,
        bindingType: binding.bindingType,
        protocol: binding.protocol,
        endpoint: binding.endpoint,
        typeMapping: JSON.stringify(binding.typeMapping),
        serializationFormat: binding.serializationFormat,
        schemaDefinition: binding.schemaDefinition,
        confidence: binding.confidence,
        detectorName: binding.detectorName,
        detectionReason: binding.detectionReason,
        metadata: binding.metadata ? JSON.stringify(binding.metadata) : null,
      })
      .returning({ id: schema.apiBindings.id });
    
    return result[0]?.id || 0;
  }

  async getApiBindings(projectId: number, bindingType?: string) {
    const baseQuery = this.db
      .select()
      .from(schema.apiBindings)
      .where(eq(schema.apiBindings.projectId, projectId))
      .$dynamic();

    if (bindingType) {
      return baseQuery
        .where(
          and(
            eq(schema.apiBindings.projectId, projectId),
            eq(schema.apiBindings.bindingType, bindingType)
          )
        )
        .orderBy(desc(schema.apiBindings.createdAt));
    }

    return baseQuery.orderBy(desc(schema.apiBindings.createdAt));
  }

  async getCrossLanguageDependencies(projectId: number) {
    return this.db
      .select()
      .from(schema.crossLanguageDeps)
      .where(eq(schema.crossLanguageDeps.projectId, projectId))
      .orderBy(desc(schema.crossLanguageDeps.createdAt));
  }

  // Methods for ripple-effect-tracker.ts
  async getRippleRelationships() {
    return this.db
      .select({
        sourceSymbol: sql<string | null>`${schema.universalSymbols.qualifiedName}`,
        targetSymbol: sql<string | null>`to_symbols.qualified_name`,
        type: schema.universalRelationships.type,
        confidence: schema.universalRelationships.confidence,
      })
      .from(schema.universalRelationships)
      .leftJoin(
        schema.universalSymbols,
        eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
      )
      .leftJoin(
        sql`${schema.universalSymbols} as to_symbols`,
        sql`${schema.universalRelationships.toSymbolId} = to_symbols.id`
      )
      .where(
        and(
          gt(schema.universalRelationships.confidence, 0.7),
          isNotNull(schema.universalSymbols.qualifiedName),
          sql`to_symbols.qualified_name IS NOT NULL`
        )
      );
  }

  async getSymbolForRipple(symbolName: string) {
    return this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        qualifiedName: schema.universalSymbols.qualifiedName,
        filePath: schema.universalSymbols.filePath,
        kind: schema.universalSymbols.kind,
        confidence: schema.universalSymbols.confidence,
        semanticTags: schema.universalSymbols.semanticTags,
        line: schema.universalSymbols.line,
        column: schema.universalSymbols.column,
        languageFeatures: schema.universalSymbols.languageFeatures,
        namespace: schema.universalSymbols.namespace,
      })
      .from(schema.universalSymbols)
      .where(
        or(
          eq(schema.universalSymbols.qualifiedName, symbolName),
          eq(schema.universalSymbols.name, symbolName)
        )
      )
      .orderBy(desc(schema.universalSymbols.confidence))
      .limit(1)
      .get();
  }

  async getSymbolUsageCount(symbolId: number) {
    return this.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.universalRelationships)
      .where(eq(schema.universalRelationships.toSymbolId, symbolId))
      .get();
  }

  // Method for change-impact-predictor.ts
  async getSymbolDetailsForImpact(symbolName: string) {
    return this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        qualifiedName: schema.universalSymbols.qualifiedName,
        filePath: schema.universalSymbols.filePath,
        kind: schema.universalSymbols.kind,
        confidence: schema.universalSymbols.confidence,
        semanticTags: schema.universalSymbols.semanticTags,
      })
      .from(schema.universalSymbols)
      .where(
        or(
          eq(schema.universalSymbols.qualifiedName, symbolName),
          eq(schema.universalSymbols.name, symbolName)
        )
      )
      .orderBy(desc(schema.universalSymbols.confidence))
      .limit(1)
      .get();
  }

  close() {
    // Drizzle doesn't need explicit close
  }
}

/**
 * Helper function to get Drizzle database from any database instance
 */
export function getDrizzleDb(database: Database.Database | DrizzleDb): DrizzleDb {
  if ('select' in database && 'insert' in database) {
    return database as DrizzleDb;
  }
  return drizzle(database as Database.Database, { schema });
}