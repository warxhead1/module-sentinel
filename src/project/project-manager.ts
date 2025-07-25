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

/**
 * Database row interface for projects table
 */
interface ProjectRow {
  id: number;
  name: string;
  display_name: string;
  description: string;
  root_path: string;
  metadata: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/**
 * Database row interface for languages table
 */
interface LanguageRow {
  id: number;
  name: string;
  is_active: number;
  updated_at: string;
  total_symbols: number;
  total_files: number;
  count?: number;
}

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
  private projects: Map<string, ProjectConfig> = new Map();
  private configCache: Map<string, ProjectConfig> = new Map();
  private logger = createLogger("ProjectManager");

  constructor(dbOrPath: string | Database.Database) {
    super();
    if (typeof dbOrPath === "string") {
      // Legacy support - create database directly
      this.db = new Database(dbOrPath);
      console.warn(
        "ProjectManager: Creating database directly is deprecated. Use DatabaseInitializer instead."
      );
    } else {
      // Use pre-initialized database, ensure it has prepare method
      this.db = ensureDatabasePrepare(dbOrPath);
    }
  }

  /**
   * Create a new project
   */
  async createProject(config: ProjectConfig): Promise<number> {
    // Validate configuration
    await this.validateProjectConfig(config);

    // Check if project already exists
    const existing = this.db
      .prepare("SELECT id FROM projects WHERE name = ?")
      .get(config.name);
    if (existing) {
      throw new Error(`Project '${config.name}' already exists`);
    }

    // Insert project
    const insertProject = this.db.prepare(`
      INSERT INTO projects (name, display_name, description, root_path, config_path, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const configPath = path.join(
      config.rootPath,
      ".module-sentinel",
      "project.json"
    );
    const result = insertProject.run(
      config.name,
      config.displayName || config.name,
      config.description || "",
      config.rootPath,
      configPath,
      JSON.stringify(config.metadata || {})
    );

    const projectId = result.lastInsertRowid as number;

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
    const existingProject = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as ProjectRow | undefined;
    if (!existingProject) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Update project record
    const updateProject = this.db.prepare(`
      UPDATE projects 
      SET display_name = ?, description = ?, root_path = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    updateProject.run(
      config.displayName || existingProject.display_name,
      config.description || existingProject.description,
      config.rootPath || existingProject.root_path,
      JSON.stringify(
        config.metadata || JSON.parse(existingProject.metadata || "{}")
      ),
      projectId
    );

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
    const project = this.db
      .prepare("SELECT name FROM projects WHERE id = ?")
      .get(projectId) as { name: string } | undefined;
    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Delete project (CASCADE will handle related tables)
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);

    // Clear cache
    this.configCache.delete(project.name);

    this.emit("project:deleted", { projectId, name: project.name });
  }

  /**
   * Get project configuration
   */
  async getProjectConfig(projectId: number): Promise<ProjectConfig> {
    const project = this.db
      .prepare(
        `
      SELECT * FROM projects WHERE id = ?
    `
      )
      .get(projectId) as ProjectRow | undefined;

    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Get languages
    const languages = this.db
      .prepare(
        `
      SELECT l.name, l.display_name, pl.config, pl.is_primary
      FROM project_languages pl
      JOIN languages l ON pl.language_id = l.id
      WHERE pl.project_id = ?
    `
      )
      .all(projectId) as Array<{
      name: string;
      display_name: string;
      config: string | null;
      is_primary: number;
    }>;

    const languageConfigs: { [key: string]: LanguageConfig } = {};
    for (const lang of languages) {
      languageConfigs[lang.name] = {
        enabled: true,
        isPrimary: !!lang.is_primary,
        extensions: [], // Will be populated from language definition
        ...(lang.config ? JSON.parse(lang.config) : {}),
      };
    }

    return {
      id: project.id,
      name: project.name,
      displayName: project.display_name,
      description: project.description,
      rootPath: project.root_path,
      languages: languageConfigs,
      settings: {
        scanPaths: [project.root_path],
        excludePatterns: [],
        includePatterns: [],
      },
      metadata: project.metadata ? JSON.parse(project.metadata) : {},
    };
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<ProjectConfig[]> {
    const projects = this.db
      .prepare(
        `
      SELECT id FROM projects WHERE is_active = 1 ORDER BY name
    `
      )
      .all();

    const configs: ProjectConfig[] = [];
    for (const project of projects) {
      try {
        const config = await this.getProjectConfig(
          (project as { id: number }).id
        );
        configs.push(config);
      } catch (error) {
        console.warn(
          `Failed to load project ${(project as { id: number }).id}:`,
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
    const project = this.db
      .prepare("SELECT id FROM projects WHERE name = ?")
      .get(name);
    if (!project) {
      return null;
    }

    return this.getProjectConfig((project as { id: number }).id);
  }

  /**
   * Get project status
   */
  async getProjectStatus(projectId: number): Promise<ProjectStatus> {
    const project = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    // Get statistics (assuming universal_symbols table exists)
    const stats = this.db
      .prepare(
        `
      SELECT 
        COUNT(*) as total_symbols,
        COUNT(DISTINCT file_path) as total_files
      FROM universal_symbols 
      WHERE project_id = ?
    `
      )
      .get(projectId) || { total_symbols: 0, total_files: 0 };

    const relationships = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM universal_relationships
      WHERE project_id = ?
    `
      )
      .get(projectId) || { count: 0 };

    // Get language breakdown
    const languageBreakdown = this.db
      .prepare(
        `
      SELECT l.name, COUNT(s.id) as count
      FROM languages l
      LEFT JOIN universal_symbols s ON l.id = s.language_id AND s.project_id = ?
      GROUP BY l.name
    `
      )
      .all(projectId);

    const breakdown: { [key: string]: number } = {};
    for (const lang of languageBreakdown) {
      breakdown[(lang as LanguageRow).name] = (lang as LanguageRow).count || 0;
    }

    return {
      id: (project as ProjectRow).id,
      name: (project as ProjectRow).name,
      isActive: !!(project as ProjectRow).is_active,
      lastIndexed: (project as ProjectRow).updated_at
        ? new Date((project as ProjectRow).updated_at)
        : undefined,
      indexingStatus:
        (stats as { total_symbols: number; total_files: number })
          .total_symbols > 0
          ? "completed"
          : "never",
      stats: {
        totalFiles: (stats as { total_symbols: number; total_files: number })
          .total_files,
        totalSymbols: (stats as { total_symbols: number; total_files: number })
          .total_symbols,
        totalRelationships: (relationships as { count: number }).count,
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
    version: string = "1.0.0"
  ): Promise<number> {
    const insertLanguage = this.db.prepare(`
      INSERT OR REPLACE INTO languages (name, display_name, version, parser_class, extensions, features)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertLanguage.run(
      name,
      displayName,
      version,
      parserClass,
      JSON.stringify(extensions),
      JSON.stringify(features)
    );

    this.emit("language:registered", {
      name,
      displayName,
      extensions,
      features,
    });

    return result.lastInsertRowid as number;
  }

  /**
   * Get all registered languages
   */
  getRegisteredLanguages(): any[] {
    return this.db
      .prepare(
        `
      SELECT * FROM languages WHERE is_enabled = 1 ORDER BY priority, name
    `
      )
      .all();
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
    const project = this.db
      .prepare("SELECT config_path FROM projects WHERE id = ?")
      .get(projectId);
    if (!(project as { config_path?: string })?.config_path) {
      return;
    }

    // Ensure directory exists
    const configDir = path.dirname(
      (project as { config_path: string }).config_path
    );
    await fs.mkdir(configDir, { recursive: true });

    // Save configuration
    await fs.writeFile(
      (project as { config_path: string }).config_path,
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
    this.db
      .prepare("DELETE FROM project_languages WHERE project_id = ?")
      .run(projectId);

    // Insert new configurations
    const insertLanguageConfig = this.db.prepare(`
      INSERT INTO project_languages (project_id, language_id, config, is_primary)
      VALUES (?, ?, ?, ?)
    `);

    for (const [languageName, config] of Object.entries(languages)) {
      if (!config.enabled) continue;

      // Get language ID
      const language = this.db
        .prepare("SELECT id FROM languages WHERE name = ?")
        .get(languageName);
      if (!language) {
        console.warn(`Language '${languageName}' not registered`);
        continue;
      }

      insertLanguageConfig.run(
        projectId,
        (language as { id: number }).id,
        JSON.stringify(config),
        config.isPrimary || false
      );
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

      const language = this.db
        .prepare("SELECT id FROM languages WHERE name = ?")
        .get(languageName);
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
