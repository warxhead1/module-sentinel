/**
 * Project Manager - Multi-project support for Module Sentinel
 *
 * This system manages multiple projects, their configurations, and language associations.
 */

import * as fs from "fs/promises";
import * as path from "path";
import Database from "better-sqlite3";
import { EventEmitter } from "events";
import { createLogger } from "../utils/logger.js";
import { ensureDatabasePrepare } from "../utils/database-compatibility.js";
import { DrizzleDatabase, type DrizzleDb } from "../database/drizzle-db.js";
import * as schema from '../database/drizzle/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';

// Project and Language row interfaces are no longer needed
// as we're using Drizzle's type-safe schema directly

/**
 * Project configuration interface
 */
export interface ProjectConfig {
  id?: number;
  name: string;
  displayName?: string;
  description?: string;
  rootPath: string;

  // Language configurations
  languages: {
    [languageName: string]: LanguageConfig;
  };

  // Project-specific settings
  settings: {
    defaultLanguage?: string;
    scanPaths: string[];
    excludePatterns: string[];
    includePatterns: string[];

    // Semantic analysis settings
    semanticProfile?: string; // 'web-service', 'game-engine', 'library', etc.
    customTags?: string[];

    // Performance settings
    maxFileSize?: number;
    parallelism?: number;

    // Cross-language settings
    enableCrossLanguageAnalysis?: boolean;
    apiBindingDetection?: boolean;
  };

  // Metadata
  metadata?: {
    version?: string;
    author?: string;
    license?: string;
    repository?: string;
    [key: string]: any;
  };
}

/**
 * Language configuration within a project
 */
export interface LanguageConfig {
  enabled: boolean;
  isPrimary?: boolean;

  // File patterns
  extensions: string[];
  includePatterns?: string[];
  excludePatterns?: string[];

  // Parser settings
  parserOptions?: {
    enableSemanticAnalysis?: boolean;
    enablePatternDetection?: boolean;
    enableTypeInference?: boolean;
    enableCrossReferences?: boolean;
    timeout?: number;
    [key: string]: any;
  };

  // Language-specific settings
  languageOptions?: {
    [key: string]: any;
  };

  // Build integration
  buildCommands?: string[];
  outputPatterns?: string[];
}

/**
 * Project status information
 */
export interface ProjectStatus {
  id: number;
  name: string;
  isActive: boolean;
  lastIndexed?: Date;
  indexingStatus: "never" | "in_progress" | "completed" | "failed";

  // Statistics
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalRelationships: number;
    languageBreakdown: { [language: string]: number };
  };

  // Health
  health: {
    parseErrors: number;
    warningCount: number;
    confidence: number;
  };
}

/**
 * Project Manager class
 */
export class ProjectManager extends EventEmitter {
  private db: Database.Database;
  private drizzleDb: DrizzleDatabase;
  private projects: Map<string, ProjectConfig> = new Map();
  private configCache: Map<string, ProjectConfig> = new Map();
  private logger = createLogger("ProjectManager");

  constructor(dbOrPath: string | Database.Database | DrizzleDb) {
    super();
    if (typeof dbOrPath === "string") {
      // Legacy support - create database directly
      this.db = new Database(dbOrPath);
      console.warn(
        "ProjectManager: Creating database directly is deprecated. Use DatabaseInitializer instead."
      );
      this.drizzleDb = new DrizzleDatabase(this.db);
    } else if ('select' in dbOrPath && 'insert' in dbOrPath) {
      // Drizzle instance passed
      this.drizzleDb = new DrizzleDatabase(dbOrPath);
      this.db = this.drizzleDb.getRawDb();
    } else {
      // Use pre-initialized database
      this.db = ensureDatabasePrepare(dbOrPath);
      this.drizzleDb = new DrizzleDatabase(this.db);
    }
  }

  /**
   * Create a new project
   */
  async createProject(config: ProjectConfig): Promise<number> {
    // Validate configuration
    await this.validateProjectConfig(config);

    // Check if project already exists
    const existing = await this.drizzleDb.instance
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.name, config.name))
      .get();
    if (existing) {
      throw new Error(`Project '${config.name}' already exists`);
    }

    // Insert project
    
    const result = await this.drizzleDb.instance
      .insert(schema.projects)
      .values({
        name: config.name,
        displayName: config.displayName || config.name,
        description: config.description || "",
        rootPath: config.rootPath,
        metadata: config.metadata || {},
        isActive: true
      })
      .returning({ id: schema.projects.id });

    const projectId = result[0].id;

    // Configure languages
    await this.configureProjectLanguages(projectId, config.languages);

    // Save configuration to file
    await this.saveProjectConfig(projectId, config);

    // Cache the configuration
    this.configCache.set(config.name, { ...config, id: projectId });

    this.emit("project:created", { projectId, name: config.name });

    return projectId;
  }

  /**
   * Update an existing project
   */
  async updateProject(
    projectId: number,
    config: Partial<ProjectConfig>
  ): Promise<void> {
    const existingProject = await this.drizzleDb.instance
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!existingProject) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Update project record
    await this.drizzleDb.instance
      .update(schema.projects)
      .set({
        displayName: config.displayName || existingProject.displayName,
        description: config.description || existingProject.description,
        rootPath: config.rootPath || existingProject.rootPath,
        metadata: config.metadata || existingProject.metadata || {},
        updatedAt: new Date().toISOString()
      })
      .where(eq(schema.projects.id, projectId));

    // Update languages if provided
    if (config.languages) {
      await this.configureProjectLanguages(projectId, config.languages);
    }

    // Update configuration file
    const fullConfig = await this.getProjectConfig(projectId);
    await this.saveProjectConfig(projectId, fullConfig);

    // Clear cache
    this.configCache.delete(existingProject.name);

    this.emit("project:updated", { projectId, name: existingProject.name });
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: number): Promise<void> {
    const project = await this.drizzleDb.instance
      .select({ name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Delete project (CASCADE will handle related tables)
    await this.drizzleDb.instance
      .delete(schema.projects)
      .where(eq(schema.projects.id, projectId));

    // Clear cache
    this.configCache.delete(project.name);

    this.emit("project:deleted", { projectId, name: project.name });
  }

  /**
   * Get project configuration
   */
  async getProjectConfig(projectId: number): Promise<ProjectConfig> {
    const project = await this.drizzleDb.instance
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Get languages
    const languages = await this.drizzleDb.instance
      .select({
        name: schema.languages.name,
        display_name: schema.languages.displayName,
        config: schema.projectLanguages.config,
        is_primary: schema.projectLanguages.isPrimary
      })
      .from(schema.projectLanguages)
      .innerJoin(schema.languages, eq(schema.projectLanguages.languageId, schema.languages.id))
      .where(eq(schema.projectLanguages.projectId, projectId));

    const languageConfigs: { [key: string]: LanguageConfig } = {};
    for (const lang of languages) {
      languageConfigs[lang.name] = {
        enabled: true,
        isPrimary: !!lang.is_primary,
        extensions: [], // Will be populated from language definition
        ...(lang.config || {}),
      };
    }

    return {
      id: project.id,
      name: project.name,
      displayName: project.displayName || undefined,
      description: project.description || undefined,
      rootPath: project.rootPath,
      languages: languageConfigs,
      settings: {
        scanPaths: [project.rootPath],
        excludePatterns: [],
        includePatterns: [],
      },
      metadata: project.metadata || {},
    };
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<ProjectConfig[]> {
    const projects = await this.drizzleDb.instance
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.isActive, true))
      .orderBy(asc(schema.projects.name));

    const configs: ProjectConfig[] = [];
    for (const project of projects) {
      try {
        const config = await this.getProjectConfig(project.id);
        configs.push(config);
      } catch (error) {
        console.warn(
          `Failed to load project ${project.id}:`,
          error
        );
      }
    }

    return configs;
  }

  /**
   * Get project by name
   */
  async getProjectByName(name: string): Promise<ProjectConfig | null> {
    const project = await this.drizzleDb.instance
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.name, name))
      .get();
    if (!project) {
      return null;
    }

    return this.getProjectConfig(project.id);
  }

  /**
   * Get project status
   */
  async getProjectStatus(projectId: number): Promise<ProjectStatus> {
    const project = await this.drizzleDb.instance
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Get statistics using Drizzle
    const stats = await this.drizzleDb.instance
      .select({
        total_symbols: sql<number>`COUNT(*)`,
        total_files: sql<number>`COUNT(DISTINCT ${schema.universalSymbols.filePath})`
      })
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.projectId, projectId))
      .get() || { total_symbols: 0, total_files: 0 };

    const relationships = await this.drizzleDb.instance
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.universalRelationships)
      .where(eq(schema.universalRelationships.projectId, projectId))
      .get() || { count: 0 };

    // Get language breakdown
    const languageBreakdown = await this.drizzleDb.instance
      .select({
        name: schema.languages.name,
        count: sql<number>`COUNT(${schema.universalSymbols.id})`
      })
      .from(schema.languages)
      .leftJoin(
        schema.universalSymbols,
        and(
          eq(schema.languages.id, schema.universalSymbols.languageId),
          eq(schema.universalSymbols.projectId, projectId)
        )
      )
      .groupBy(schema.languages.name);

    const breakdown: { [key: string]: number } = {};
    for (const lang of languageBreakdown) {
      breakdown[lang.name] = lang.count || 0;
    }

    return {
      id: project.id,
      name: project.name,
      isActive: project.isActive ?? true,
      lastIndexed: project.updatedAt
        ? new Date(project.updatedAt)
        : undefined,
      indexingStatus:
        stats.total_symbols > 0
          ? "completed"
          : "never",
      stats: {
        totalFiles: stats.total_files,
        totalSymbols: stats.total_symbols,
        totalRelationships: relationships.count,
        languageBreakdown: breakdown,
      },
      health: {
        parseErrors: 0, // TODO: Get from error logs
        warningCount: 0, // TODO: Get from warning logs
        confidence: 0.85, // TODO: Calculate based on actual data
      },
    };
  }

  /**
   * Register a new language
   */
  async registerLanguage(
    name: string,
    displayName: string,
    parserClass: string,
    extensions: string[],
    features: string[] = [],
    _version: string = "1.0.0"
  ): Promise<number> {
    const result = await this.drizzleDb.instance
      .insert(schema.languages)
      .values({
        name,
        displayName,
        parserClass,
        extensions,
        features,
        version: _version,
      })
      .onConflictDoUpdate({
        target: schema.languages.name,
        set: {
          displayName,
          extensions
        }
      })
      .returning({ id: schema.languages.id });

    this.emit("language:registered", {
      name,
      displayName,
      extensions,
      features,
    });

    return result[0].id;
  }

  /**
   * Get all registered languages
   */
  async getRegisteredLanguages(): Promise<any[]> {
    return await this.drizzleDb.instance
      .select()
      .from(schema.languages)
      .orderBy(asc(schema.languages.name));
  }

  /**
   * Load project from configuration file
   */
  async loadProjectFromConfig(configPath: string): Promise<ProjectConfig> {
    const configData = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configData) as ProjectConfig;

    // Validate and normalize paths
    const configDir = path.dirname(configPath);
    if (!path.isAbsolute(config.rootPath)) {
      config.rootPath = path.resolve(configDir, config.rootPath);
    }

    return config;
  }

  /**
   * Save project configuration to file
   */
  private async saveProjectConfig(
    projectId: number,
    config: ProjectConfig
  ): Promise<void> {
    const project = await this.drizzleDb.instance
      .select({ config_path: sql<string>`config_path` })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();
    if (!project?.config_path) {
      return;
    }

    // Ensure directory exists
    const configDir = path.dirname(project.config_path);
    await fs.mkdir(configDir, { recursive: true });

    // Save configuration
    await fs.writeFile(
      project.config_path,
      JSON.stringify(config, null, 2)
    );
  }

  /**
   * Configure languages for a project
   */
  private async configureProjectLanguages(
    projectId: number,
    languages: { [key: string]: LanguageConfig }
  ): Promise<void> {
    // Clear existing language configurations
    await this.drizzleDb.instance
      .delete(schema.projectLanguages)
      .where(eq(schema.projectLanguages.projectId, projectId));

    // Insert new configurations
    for (const [languageName, config] of Object.entries(languages)) {
      if (!config.enabled) continue;

      // Get language ID
      const language = await this.drizzleDb.instance
        .select({ id: schema.languages.id })
        .from(schema.languages)
        .where(eq(schema.languages.name, languageName))
        .get();
      if (!language) {
        console.warn(`Language '${languageName}' not registered`);
        continue;
      }

      await this.drizzleDb.instance
        .insert(schema.projectLanguages)
        .values({
          projectId,
          languageId: language.id,
          config: config,
          isPrimary: config.isPrimary || false
        });
    }
  }

  /**
   * Validate project configuration
   */
  private async validateProjectConfig(config: ProjectConfig): Promise<void> {
    // Check required fields
    if (!config.name || !config.rootPath) {
      throw new Error("Project name and rootPath are required");
    }

    // Check if root path exists
    try {
      const stats = await fs.stat(config.rootPath);
      if (!stats.isDirectory()) {
        throw new Error(`Root path '${config.rootPath}' is not a directory`);
      }
    } catch (error) {
      this.logger.error("Failed to access project root path", error, {
        rootPath: config.rootPath,
        projectName: config.name
      });
      throw new Error(
        `Root path '${config.rootPath}' does not exist or is not accessible`
      );
    }

    // Validate languages
    for (const [languageName, langConfig] of Object.entries(
      config.languages || {}
    )) {
      if (!langConfig.enabled) continue;

      const language = await this.drizzleDb.instance
        .select({ id: schema.languages.id })
        .from(schema.languages)
        .where(eq(schema.languages.name, languageName))
        .get();
      if (!language) {
        throw new Error(`Language '${languageName}' is not registered`);
      }
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
