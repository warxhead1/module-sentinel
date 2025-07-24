/**
 * Database class for multi-language Module Sentinel
 * Provides unified interface to SQLite database with Drizzle ORM
 */

import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq, and, or, like, desc, asc, count, sql, inArray } from "drizzle-orm";
import * as schema from "./schema";
import {
  projects,
  languages,
  universalSymbols,
  universalRelationships,
  detectedPatterns,
  patternCache,
  cppFeatures,
  cppMethodComplexity,
  projectLanguages,
  patternSymbols,
  type Project,
  type NewProject,
  type Language,
  type NewLanguage,
  type UniversalSymbol,
  type NewUniversalSymbol,
  type UniversalRelationship,
  type NewUniversalRelationship,
  type DetectedPattern,
  type NewDetectedPattern,
} from "./schema";
import * as fs from "fs";
import * as path from "path";

/**
 * Configuration for database connections
 */
export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  busyTimeout?: number;
  enableLogging?: boolean;
}

/**
 * Main database class for Module Sentinel multi-language analys
 *
 */
export class DrizzleDatabase {
  private sqlite: Database.Database;
  private db: BetterSQLite3Database<typeof schema>;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      busyTimeout: 30000,
      enableLogging: false,
      ...config,
    };

    // Ensure directory exists
    const dir = path.dirname(this.config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.sqlite = new Database(this.config.path);
    this.db = drizzle(this.sqlite, { schema });

    this.initializeDatabase();
  }

  /**
   * Initialize database with optimizations
   */
  private initializeDatabase(): void {
    if (this.config.enableWAL) {
      this.sqlite.pragma("journal_mode = WAL");
    }

    if (this.config.enableForeignKeys) {
      this.sqlite.pragma("foreign_keys = ON");
    }

    if (this.config.busyTimeout) {
      this.sqlite.pragma(`busy_timeout = ${this.config.busyTimeout}`);
    }

    // Performance optimizations
    this.sqlite.pragma("synchronous = NORMAL");
    this.sqlite.pragma("temp_store = memory");
    this.sqlite.pragma("mmap_size = 268435456"); // 256MB
  }

  /**
   * Get underlying better-sqlite3 instance
   */
  getDb(): Database.Database {
    return this.sqlite;
  }

  /**
   * Get underlying better-sqlite3 instance (legacy compatibility)
   */
  getSqlite(): Database.Database {
    return this.sqlite;
  }

  /**
   * Check if database has old schema (legacy compatibility)
   */
  async hasOldSchema(): Promise<boolean> {
    try {
      const tables = this.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='enhanced_symbols'"
        )
        .all();
      return tables.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Run migrations
   */
  async runMigrations(migrationsPath: string): Promise<void> {
    await migrate(this.db, { migrationsFolder: migrationsPath });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.sqlite.close();
  }

  // ============================================================================
  // PROJECT OPERATIONS
  // ============================================================================

  /**
   * Create a new project
   */
  async createProject(project: NewProject): Promise<Project> {
    const [newProject] = await this.db
      .insert(projects)
      .values(project)
      .returning();
    return newProject;
  }

  /**
   * Get project by ID
   */
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return project;
  }

  /**
   * Get project by name
   */
  async getProjectByName(name: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.name, name))
      .limit(1);
    return project;
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<Project[]> {
    return await this.db.select().from(projects).orderBy(asc(projects.name));
  }

  /**
   * Update project
   */
  async updateProject(id: number, updates: Partial<Project>): Promise<Project> {
    const [updated] = await this.db
      .update(projects)
      .set({ ...updates, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  // ============================================================================
  // LANGUAGE OPERATIONS
  // ============================================================================

  /**
   * Register a new language
   */
  async registerLanguage(language: NewLanguage): Promise<Language> {
    const [newLanguage] = await this.db
      .insert(languages)
      .values(language)
      .returning();
    return newLanguage;
  }

  /**
   * Get all languages
   */
  async getAllLanguages(): Promise<Language[]> {
    return await this.db
      .select()
      .from(languages)
      .orderBy(asc(languages.priority), asc(languages.name));
  }

  /**
   * Get enabled languages
   */
  async getEnabledLanguages(): Promise<Language[]> {
    return await this.db
      .select()
      .from(languages)
      .where(eq(languages.isEnabled, true))
      .orderBy(asc(languages.priority), asc(languages.name));
  }

  // ============================================================================
  // SYMBOL OPERATIONS
  // ============================================================================

  /**
   * Insert symbols in batch
   */
  async insertSymbols(
    symbols: NewUniversalSymbol[]
  ): Promise<UniversalSymbol[]> {
    if (symbols.length === 0) return [];
    return await this.db.insert(universalSymbols).values(symbols).returning();
  }

  /**
   * Get symbols by project with filters
   */
  async getSymbolsByProject(
    projectId: number,
    options?: {
      language?: string;
      kind?: string;
      namespace?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<UniversalSymbol[]> {
    const conditions = [eq(universalSymbols.projectId, projectId)];

    if (options?.language) {
      const [lang] = await this.db
        .select()
        .from(languages)
        .where(eq(languages.name, options.language))
        .limit(1);
      if (lang) {
        conditions.push(eq(universalSymbols.languageId, lang.id));
      }
    }

    if (options?.kind) {
      conditions.push(eq(universalSymbols.kind, options.kind));
    }

    if (options?.namespace) {
      conditions.push(eq(universalSymbols.namespace, options.namespace));
    }

    return await this.db
      .select()
      .from(universalSymbols)
      .where(and(...conditions))
      .orderBy(asc(universalSymbols.name))
      .limit(options?.limit || 1000)
      .offset(options?.offset || 0);
  }

  /**
   * Find similar symbols (Priority1Tools pattern)
   */
  async findSimilarSymbols(
    query: string,
    options?: {
      projectId?: number;
      language?: string;
      kind?: string;
      limit?: number;
    }
  ): Promise<UniversalSymbol[]> {
    const conditions = [
      or(
        like(universalSymbols.name, `%${query}%`),
        like(universalSymbols.qualifiedName, `%${query}%`),
        like(universalSymbols.signature, `%${query}%`)
      ),
    ];

    if (options?.projectId) {
      conditions.push(eq(universalSymbols.projectId, options.projectId));
    }

    if (options?.language) {
      const [lang] = await this.db
        .select()
        .from(languages)
        .where(eq(languages.name, options.language))
        .limit(1);
      if (lang) {
        conditions.push(eq(universalSymbols.languageId, lang.id));
      }
    }

    if (options?.kind) {
      conditions.push(eq(universalSymbols.kind, options.kind));
    }

    return await this.db
      .select()
      .from(universalSymbols)
      .where(and(...conditions))
      .orderBy(asc(universalSymbols.name))
      .limit(options?.limit || 50);
  }

  /**
   * Get symbol by qualified name
   */
  async getSymbolByQualifiedName(
    qualifiedName: string,
    projectId?: number
  ): Promise<UniversalSymbol | undefined> {
    const conditions = [eq(universalSymbols.qualifiedName, qualifiedName)];

    if (projectId) {
      conditions.push(eq(universalSymbols.projectId, projectId));
    }

    const [symbol] = await this.db
      .select()
      .from(universalSymbols)
      .where(and(...conditions))
      .limit(1);
    return symbol;
  }

  // ============================================================================
  // RELATIONSHIP OPERATIONS
  // ============================================================================

  /**
   * Insert relationships in batch
   */
  async insertRelationships(
    relationships: NewUniversalRelationship[]
  ): Promise<UniversalRelationship[]> {
    if (relationships.length === 0) return [];
    return await this.db
      .insert(universalRelationships)
      .values(relationships)
      .returning();
  }

  /**
   * Get relationships for symbol
   */
  async getRelationshipsForSymbol(
    symbolId: number,
    direction: "incoming" | "outgoing" | "both" = "both"
  ): Promise<UniversalRelationship[]> {
    const conditions = [];

    if (direction === "incoming" || direction === "both") {
      conditions.push(eq(universalRelationships.toSymbolId, symbolId));
    }

    if (direction === "outgoing" || direction === "both") {
      conditions.push(eq(universalRelationships.fromSymbolId, symbolId));
    }

    return await this.db
      .select()
      .from(universalRelationships)
      .where(or(...conditions));
  }

  /**
   * Get relationships by type
   */
  async getRelationshipsByType(
    projectId: number,
    type: string,
    limit?: number
  ): Promise<UniversalRelationship[]> {
    return await this.db
      .select()
      .from(universalRelationships)
      .where(
        and(
          eq(universalRelationships.projectId, projectId),
          eq(universalRelationships.type, type)
        )
      )
      .limit(limit || 100);
  }

  // ============================================================================
  // PATTERN OPERATIONS
  // ============================================================================

  /**
   * Insert detected pattern
   */
  async insertPattern(pattern: NewDetectedPattern): Promise<DetectedPattern> {
    const [newPattern] = await this.db
      .insert(detectedPatterns)
      .values(pattern)
      .returning();
    return newPattern;
  }

  /**
   * Get patterns by project
   */
  async getPatternsByProject(projectId: number): Promise<DetectedPattern[]> {
    return await this.db
      .select()
      .from(detectedPatterns)
      .where(eq(detectedPatterns.projectId, projectId))
      .orderBy(desc(detectedPatterns.confidence));
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Execute raw SQL
   */
  async executeRaw(query: string, params?: any[]): Promise<any> {
    return this.sqlite.prepare(query).all(params);
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    projectCount: number;
    symbolCount: number;
    relationshipCount: number;
    patternCount: number;
  }> {
    const [projectCount] = await this.db
      .select({ count: count() })
      .from(projects);
    const [symbolCount] = await this.db
      .select({ count: count() })
      .from(universalSymbols);
    const [relationshipCount] = await this.db
      .select({ count: count() })
      .from(universalRelationships);
    const [patternCount] = await this.db
      .select({ count: count() })
      .from(detectedPatterns);

    return {
      projectCount: projectCount.count,
      symbolCount: symbolCount.count,
      relationshipCount: relationshipCount.count,
      patternCount: patternCount.count,
    };
  }

  /**
   * Get project statistics (legacy compatibility)
   */
  async getProjectStats(projectId: number): Promise<{
    symbolCount: number;
    relationshipCount: number;
    patternCount: number;
  }> {
    const [symbolCount] = await this.db
      .select({ count: count() })
      .from(universalSymbols)
      .where(eq(universalSymbols.projectId, projectId));
    const [relationshipCount] = await this.db
      .select({ count: count() })
      .from(universalRelationships)
      .where(eq(universalRelationships.projectId, projectId));
    const [patternCount] = await this.db
      .select({ count: count() })
      .from(detectedPatterns)
      .where(eq(detectedPatterns.projectId, projectId));

    return {
      symbolCount: symbolCount.count,
      relationshipCount: relationshipCount.count,
      patternCount: patternCount.count,
    };
  }

  /**
   * Delete symbols by file path (legacy compatibility)
   */
  async deleteSymbolsByFile(
    filePath: string,
    projectId: number
  ): Promise<void> {
    await this.db
      .delete(universalSymbols)
      .where(
        and(
          eq(universalSymbols.filePath, filePath),
          eq(universalSymbols.projectId, projectId)
        )
      );
  }

  /**
   * Associate language with project (legacy compatibility)
   */
  async associateLanguageWithProject(
    projectId: number,
    languageId: number
  ): Promise<void> {
    await this.db
      .insert(projectLanguages)
      .values({
        projectId,
        languageId,
      })
      .onConflictDoNothing();
  }
}

export default DrizzleDatabase;

/**
 * Create database instance with default configuration
 */
export function createDatabase(path: string): DrizzleDatabase {
  return new DrizzleDatabase({ path });
}
