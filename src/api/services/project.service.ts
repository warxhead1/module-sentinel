/**
 * Project Service for Module Sentinel API
 *
 * Handles CRUD operations for projects
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";

// Import schema
import { projects } from "../../database/drizzle/schema.js";

export interface CreateProjectData {
  name: string;
  displayName?: string;
  description?: string;
  rootPath: string;
  additionalPaths?: string[]; // Support multiple paths
  languages?: string[];
}

export interface UpdateProjectData {
  name?: string;
  displayName?: string;
  description?: string;
  rootPath?: string;
  additionalPaths?: string[]; // Support multiple paths
  languages?: string[];
  isActive?: boolean;
}

export class ProjectService {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database.Database;

  constructor(database: Database.Database) {
    this.rawDb = database;
    this.db = drizzle(database);
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData): Promise<any> {
    // Validate project data
    await this.validateProjectData(data);

    // Check if project with same name or path already exists
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.name, data.name))
      .limit(1);

    if (existing.length > 0) {
      throw new Error(`Project with name "${data.name}" already exists`);
    }

    const existingPath = await this.db
      .select()
      .from(projects)
      .where(eq(projects.rootPath, data.rootPath))
      .limit(1);

    if (existingPath.length > 0) {
      throw new Error(`Project with path "${data.rootPath}" already exists`);
    }

    // Create project record
    const metadata: any = {};
    if (data.additionalPaths && data.additionalPaths.length > 0) {
      metadata.additionalPaths = data.additionalPaths;
    }
    if (data.languages && data.languages.length > 0) {
      metadata.languages = data.languages;
    }

    const result = await this.db
      .insert(projects)
      .values({
        name: data.name,
        displayName: data.displayName || null,
        description: data.description || null,
        rootPath: data.rootPath,
        isActive: true,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .returning();

    return result[0];
  }

  /**
   * Update an existing project
   */
  async updateProject(
    projectId: number,
    data: UpdateProjectData
  ): Promise<any> {
    // Check if project exists
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existing.length === 0) {
      throw new Error("Project not found");
    }

    // Validate update data
    if (data.rootPath) {
      await this.validateProjectPath(data.rootPath);
    }

    if (data.name) {
      // Check if another project has this name
      const nameConflict = await this.db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.name, data.name),
            eq(projects.id, projectId) // Exclude current project
          )
        )
        .limit(1);

      if (nameConflict.length > 0) {
        throw new Error(
          `Another project with name "${data.name}" already exists`
        );
      }
    }

    if (data.rootPath) {
      // Check if another project has this path
      const pathConflict = await this.db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.rootPath, data.rootPath),
            eq(projects.id, projectId) // Exclude current project
          )
        )
        .limit(1);

      if (pathConflict.length > 0) {
        throw new Error(
          `Another project with path "${data.rootPath}" already exists`
        );
      }
    }

    // Get existing metadata
    const existingProject = existing[0];
    const existingMetadata = existingProject.metadata || {};

    // Update metadata if needed
    const newMetadata = { ...existingMetadata };
    if (data.additionalPaths !== undefined) {
      if (data.additionalPaths.length > 0) {
        newMetadata.additionalPaths = data.additionalPaths;
      } else {
        delete newMetadata.additionalPaths;
      }
    }
    if (data.languages !== undefined) {
      if (data.languages.length > 0) {
        newMetadata.languages = data.languages;
      } else {
        delete newMetadata.languages;
      }
    }

    // Update project
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.displayName !== undefined)
      updateData.displayName = data.displayName;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.rootPath !== undefined) updateData.rootPath = data.rootPath;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Only update metadata if there were changes
    if (data.additionalPaths !== undefined || data.languages !== undefined) {
      updateData.metadata =
        Object.keys(newMetadata).length > 0 ? newMetadata : null;
    }

    const result = await this.db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId))
      .returning();

    return result[0];
  }

  /**
   * Delete a project (soft delete - mark as inactive, hard delete - remove all data)
   */
  async deleteProject(
    projectId: number,
    hardDelete: boolean = false
  ): Promise<boolean> {
    // Check if project exists
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existing.length === 0) {
      throw new Error("Project not found");
    }

    const project = existing[0];

    if (hardDelete) {
      try {
        // Enable foreign keys to ensure CASCADE works
        this.rawDb.prepare("PRAGMA foreign_keys = ON").run();

        // Get counts for logging before deletion
        const symbolCount = (await this.rawDb
          .prepare(
            "SELECT COUNT(*) as count FROM universal_symbols WHERE project_id = ?"
          )
          .get(projectId)) as { count: number };
        const relationshipCount = (await this.rawDb
          .prepare(
            "SELECT COUNT(*) as count FROM universal_relationships WHERE project_id = ?"
          )
          .get(projectId)) as { count: number };
        const fileCount = (await this.rawDb
          .prepare(
            "SELECT COUNT(*) as count FROM file_index WHERE project_id = ?"
          )
          .get(projectId)) as { count: number };
        const patternCount = (await this.rawDb
          .prepare(
            "SELECT COUNT(*) as count FROM detected_patterns WHERE project_id = ?"
          )
          .get(projectId)) as { count: number };

        // Simple approach: just delete the project and let CASCADE handle everything
        // If CASCADE is set up correctly, this should delete everything
        try {
          await this.db.delete(projects).where(eq(projects.id, projectId));
        } catch (cascadeError: any) {
          // If CASCADE fails, we need to handle it manually

          console.error(`   Error: ${cascadeError.message}`);

          // Manual deletion in correct order to handle foreign key constraints
          const deletions = [
            // Clear self-references first
            "UPDATE universal_symbols SET parent_symbol_id = NULL WHERE project_id = ?",

            // Delete in dependency order
            "DELETE FROM cluster_membership WHERE cluster_id IN (SELECT id FROM semantic_clusters WHERE project_id = ?)",
            "DELETE FROM insight_recommendations WHERE insight_id IN (SELECT id FROM semantic_insights WHERE project_id = ?)",
            "DELETE FROM code_embeddings WHERE symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM symbol_semantic_tags WHERE symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM control_flow_blocks WHERE symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM symbol_calls WHERE caller_id IN (SELECT id FROM universal_symbols WHERE project_id = ?) OR callee_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM data_flow_edges WHERE source_symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?) OR target_symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM semantic_relationships WHERE from_symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?) OR to_symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM cross_language_bindings WHERE from_symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?) OR to_symbol_id IN (SELECT id FROM universal_symbols WHERE project_id = ?)",
            "DELETE FROM universal_relationships WHERE project_id = ?",
            "DELETE FROM semantic_clusters WHERE project_id = ?",
            "DELETE FROM semantic_insights WHERE project_id = ?",
            "DELETE FROM code_flow_paths WHERE project_id = ?",
            "DELETE FROM universal_symbols WHERE project_id = ?",
            "DELETE FROM detected_patterns WHERE project_id = ?",
            "DELETE FROM file_index WHERE project_id = ?",
            "DELETE FROM project_languages WHERE project_id = ?",
          ];

          for (const sql of deletions) {
            try {
              const paramCount = (sql.match(/\?/g) || []).length;
              const params = Array(paramCount).fill(projectId);
              const result = this.rawDb.prepare(sql).run(...params);
              if (result.changes > 0) {
                const tableName = sql.includes("UPDATE")
                  ? "universal_symbols (cleared parent refs)"
                  : sql.match(/DELETE FROM (\w+)/)?.[1] || "unknown";
              }
            } catch (e: any) {}
          }

          // Try to delete project again
          await this.db.delete(projects).where(eq(projects.id, projectId));
        }
      } catch (error) {
        console.error(
          `❌ Error during hard delete of project "${project.name}":`,
          error
        );
        throw error;
      }
    } else {
      // Soft delete - mark as inactive
      await this.db
        .update(projects)
        .set({
          isActive: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(projects.id, projectId));
    }

    return true;
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: number): Promise<any> {
    const result = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (result.length === 0) {
      throw new Error("Project not found");
    }

    return result[0];
  }

  /**
   * Get all projects with optional filtering
   */
  async getProjects(includeInactive: boolean = false): Promise<any[]> {
    if (includeInactive) {
      return await this.db.select().from(projects).orderBy(projects.name);
    } else {
      return await this.db
        .select()
        .from(projects)
        .where(eq(projects.isActive, true))
        .orderBy(projects.name);
    }
  }

  /**
   * Validate project data
   */
  private async validateProjectData(data: CreateProjectData): Promise<void> {
    // Validate required fields
    if (!data.name || !data.name.trim()) {
      throw new Error("Project name is required");
    }

    if (!data.rootPath || !data.rootPath.trim()) {
      throw new Error("Project root path is required");
    }

    // Validate name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(data.name)) {
      throw new Error(
        "Project name can only contain letters, numbers, hyphens, and underscores"
      );
    }

    // Validate path exists and is accessible
    await this.validateProjectPath(data.rootPath);
  }

  /**
   * Validate project path exists and is accessible
   */
  private async validateProjectPath(projectPath: string): Promise<void> {
    try {
      const resolved = path.resolve(projectPath);
      const stats = await fs.stat(resolved);

      if (!stats.isDirectory()) {
        throw new Error("Project path must be a directory");
      }

      // Try to access the directory
      await fs.access(resolved, fs.constants.R_OK);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("no such file")) {
          throw new Error(`Project path does not exist: ${projectPath}`);
        } else if (error.message.includes("permission denied")) {
          throw new Error(
            `No permission to access project path: ${projectPath}`
          );
        } else if (error.message.includes("directory")) {
          throw error; // Re-throw directory validation errors
        }
      }
      throw new Error(`Invalid project path: ${projectPath}`);
    }
  }

  /**
   * Check if project path contains indexable files
   */
  async validateProjectHasFiles(
    projectPath: string
  ): Promise<{ hasFiles: boolean; fileCount: number; languages: string[] }> {
    const { LanguageDetectionService } = await import(
      "./language-detection.service.js"
    );

    try {
      const languages = await LanguageDetectionService.quickDetectLanguages(
        projectPath
      );

      // Count files in supported languages
      let fileCount = 0;
      // This is a simplified count - in reality we'd use the detection service
      // For now, just indicate if languages were detected
      const hasFiles = languages.length > 0;

      return {
        hasFiles,
        fileCount: hasFiles ? 1 : 0, // Placeholder
        languages,
      };
    } catch (error) {
      return {
        hasFiles: false,
        fileCount: 0,
        languages: [],
      };
    }
  }
}
