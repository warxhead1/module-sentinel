/**
 * IndexerDatabaseManager
 * 
 * Handles database operations, project setup, and cleanup for the Universal Indexer.
 * This includes project creation, language setup, statistics calculation, and data cleanup.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import {
  projects,
  languages,
  universalSymbols,
  universalRelationships,
  detectedPatterns,
  projectLanguages,
  fileIndex,
  controlFlowBlocks,
  symbolCalls
} from "../database/drizzle/schema.js";
import { createLogger } from "../utils/logger.js";

export class IndexerDatabaseManager {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private logger = createLogger('IndexerDatabaseManager');

  constructor(db: Database) {
    this.rawDb = db;
    this.db = drizzle(db);
  }

  /**
   * Ensure project exists in database
   */
  async ensureProject(projectName: string, projectPath: string): Promise<number> {
    // First check by name to avoid conflicts
    const existingByName = await this.db
      .select()
      .from(projects)
      .where(eq(projects.name, projectName))
      .limit(1);

    if (existingByName.length > 0) {
      // Update project path if needed
      await this.db
        .update(projects)
        .set({
          rootPath: projectPath,
          updatedAt: new Date().toISOString(),
          isActive: true,
        })
        .where(eq(projects.id, existingByName[0].id));

      return existingByName[0].id;
    }

    // Check by path
    const existingByPath = await this.db
      .select()
      .from(projects)
      .where(eq(projects.rootPath, projectPath))
      .limit(1);

    if (existingByPath.length > 0) {
      // Update project name
      await this.db
        .update(projects)
        .set({
          name: projectName,
          updatedAt: new Date().toISOString(),
          isActive: true,
        })
        .where(eq(projects.id, existingByPath[0].id));

      return existingByPath[0].id;
    }

    // Create new project
    const result = await this.db
      .insert(projects)
      .values({
        name: projectName,
        rootPath: projectPath,
        description: `Indexed by Universal Indexer`,
        isActive: true,
      })
      .returning({ id: projects.id });

    return result[0].id;
  }

  /**
   * Ensure languages exist and return mapping
   */
  async ensureLanguages(
    languageList: string[],
    getLanguageDisplayName: (lang: string) => string,
    getParserClass: (lang: string) => string,
    getLanguageExtensions: (lang: string) => string[]
  ): Promise<Map<string, number>> {
    const languageMap = new Map<string, number>();

    for (const lang of languageList) {
      const existing = await this.db
        .select()
        .from(languages)
        .where(eq(languages.name, lang))
        .limit(1);

      if (existing.length > 0) {
        languageMap.set(lang, existing[0].id);
      } else {
        // Insert new language
        const result = await this.db
          .insert(languages)
          .values({
            name: lang,
            displayName: getLanguageDisplayName(lang),
            parserClass: getParserClass(lang),
            extensions: getLanguageExtensions(lang),
            isEnabled: true,
          })
          .returning({ id: languages.id });

        languageMap.set(lang, result[0].id);
      }
    }

    return languageMap;
  }

  /**
   * Calculate index statistics
   */
  async calculateIndexStats(projectId: number): Promise<{
    symbols: number;
    relationships: number;
    patterns: number;
    avgConfidence: number;
  }> {
    const symbolCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(universalSymbols)
      .where(eq(universalSymbols.projectId, projectId));

    const relationshipCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(universalRelationships)
      .where(eq(universalRelationships.projectId, projectId));

    const patternCount = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(detectedPatterns)
      .where(eq(detectedPatterns.projectId, projectId));

    const avgConfidence = await this.db
      .select({ avg: sql<number>`avg(confidence)` })
      .from(universalSymbols)
      .where(eq(universalSymbols.projectId, projectId));

    return {
      symbols: symbolCount[0]?.count || 0,
      relationships: relationshipCount[0]?.count || 0,
      patterns: patternCount[0]?.count || 0,
      avgConfidence: avgConfidence[0]?.avg || 0,
    };
  }

  /**
   * Clean all data for a specific project (Full Rebuild preparation)
   */
  async cleanProjectData(projectId: number): Promise<void> {
    this.logger.info(`Cleaning all data for project ${projectId}...`);
    
    try {
      // Delete in proper order to respect foreign key constraints
      
      // 1. Delete relationships first (they reference symbols)
      await this.db
        .delete(universalRelationships)
        .where(eq(universalRelationships.projectId, projectId));
      
      // 2. Delete control flow and call data (they reference symbols)
      await this.db
        .delete(controlFlowBlocks)
        .where(eq(controlFlowBlocks.projectId, projectId));
      
      await this.db
        .delete(symbolCalls)
        .where(eq(symbolCalls.projectId, projectId));
      
      // 3. Delete patterns (they reference project)
      await this.db
        .delete(detectedPatterns)
        .where(eq(detectedPatterns.projectId, projectId));
      
      // 4. Delete symbols (they reference project and language)
      await this.db
        .delete(universalSymbols)
        .where(eq(universalSymbols.projectId, projectId));
      
      // 5. Delete file index entries
      await this.db
        .delete(fileIndex)
        .where(eq(fileIndex.projectId, projectId));
      
      // 6. Delete project-language associations
      await this.db
        .delete(projectLanguages)
        .where(eq(projectLanguages.projectId, projectId));
      
      this.logger.info(`Successfully cleaned all data for project ${projectId}`);
    } catch (error) {
      const errorMsg = `Failed to clean project data: ${error}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }
}