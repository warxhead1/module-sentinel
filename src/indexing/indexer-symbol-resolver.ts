/**
 * IndexerSymbolResolver
 *
 * Handles symbol resolution, relationship processing, and cross-language target resolution
 * for the Universal Indexer. This includes creating symbol mappings, resolving call targets,
 * and processing relationships between symbols.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, sql as _sql } from "drizzle-orm";
import * as path from "path";
import {
  universalSymbols,
  fileIndex,
  controlFlowBlocks,
  symbolCalls,
} from "../database/drizzle/schema.js";
import {
  RelationshipInfo,
  SymbolInfo,
  ParseResult,
} from "../parsers/tree-sitter/parser-types.js";
import { createLogger } from "../utils/logger.js";
import { getLanguageDetectionService } from "../services/language-detection-service.js";
import { getSymbolKeyGenerator } from "../services/symbol-key-generator.js";
import { createDatabaseOperationTemplates } from "../services/database-operation-templates.js";
import { createCallResolutionOrchestrator } from "../services/call-resolution-strategies.js";
import { createBatchProcessor } from "../services/batch-operation-utilities.js";

export class IndexerSymbolResolver {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private logger = createLogger("IndexerSymbolResolver");
  private errors: string[] = [];
  private languageService = getLanguageDetectionService();
  private keyGenerator = getSymbolKeyGenerator();
  private dbTemplates: ReturnType<typeof createDatabaseOperationTemplates>;
  private callResolver = createCallResolutionOrchestrator();
  private batchProcessor = createBatchProcessor();

  constructor(db: Database) {
    this.rawDb = db;
    this.db = drizzle(db);
    this.dbTemplates = createDatabaseOperationTemplates(this.rawDb);
  }

  private debug(message: string): void {
    this.logger.debug(message);
  }

  private getLanguageForExtension(ext: string): string | null {
    return this.languageService.getLanguageForExtension(ext);
  }

  /**
   * Create mapping from symbol keys to database IDs using unified key generation
   */
  private async createSymbolIdMapping(
    projectId: number,
    _fileData: Array<{ symbols: any[]; filePath: string }>
  ): Promise<Map<string, number>> {
    const complete = this.logger.operation("createSymbolIdMapping", {
      projectId,
    });

    try {
      // Use database templates for optimized symbol retrieval
      const symbolMapping = await this.dbTemplates.buildSymbolMapping(
        projectId
      );

      // Build comprehensive key mapping using symbol key generator
      const symbolIdMapping = new Map<string, number>();

      for (const symbol of symbolMapping.allSymbols) {
        // Convert database row to SymbolInfo for key generation
        const symbolInfo: SymbolInfo = {
          name: symbol.name,
          qualifiedName: symbol.qualifiedName || symbol.name,
          filePath: symbol.filePath,
          line: 0, // Database doesn't store line/column for this mapping
          column: 0,
          kind: symbol.kind as any,
          semanticTags: [],
          complexity: 1,
          confidence: 1.0,
          isDefinition: false,
          isExported: symbol.isExported || false,
          isAsync: false,
        };

        // Generate all possible keys for comprehensive mapping
        const allKeys = this.keyGenerator.generateAllKeys(
          symbolInfo,
          symbol.filePath
        );

        for (const [_strategy, key] of allKeys) {
          if (!symbolIdMapping.has(key)) {
            symbolIdMapping.set(key, symbol.id);
          }
        }

        // Also add direct name and qualified name mappings
        symbolIdMapping.set(symbol.name, symbol.id);
        if (symbol.qualifiedName && symbol.qualifiedName !== symbol.name) {
          symbolIdMapping.set(symbol.qualifiedName, symbol.id);
        }
      }

      this.logger.debug(
        `Created comprehensive symbol ID mapping with ${symbolIdMapping.size} entries`
      );

      complete();
      return symbolIdMapping;
    } catch (error) {
      this.logger.error("Failed to create symbol ID mapping", error, {
        projectId,
      });
      this.errors.push(`Symbol ID mapping failed: ${error}`);
      return new Map();
    }
  }

  /**
   * Enhanced call resolution using modular strategy pattern
   */
  private resolveCallTarget(
    relationship: RelationshipInfo,
    symbolMap: Map<string, number>,
    allSymbols: Array<{
      id: number;
      name: string;
      qualifiedName: string;
      filePath: string;
      kind: string;
      isExported: boolean | null;
    }>
  ): number | undefined {
    const result = this.callResolver.resolveCallTarget(
      relationship,
      symbolMap,
      allSymbols
    );

    if (result) {
      this.logger.debug(`Call resolved by ${result.strategy}`, {
        from: relationship.fromName,
        to: relationship.toName,
        confidence: result.confidence,
        reason: result.reason,
      });
      return result.symbolId;
    }

    this.logger.debug(
      `Could not resolve call: ${relationship.fromName} -> ${relationship.toName}`
    );
    return undefined;
  }

  /**
   * Resolve cross-language service targets using call resolution orchestrator
   */
  private resolveCrossLanguageTarget(
    relationship: RelationshipInfo,
    symbolMap: Map<string, number>,
    allSymbols: Array<{
      id: number;
      name: string;
      qualifiedName: string;
      filePath: string;
      kind: string;
      isExported: boolean | null;
    }>
  ): number | undefined {
    // Mark as cross-language to trigger appropriate strategies
    const crossLangRelationship = { ...relationship, crossLanguage: true };
    return this.resolveCallTarget(crossLangRelationship, symbolMap, allSymbols);
  }

  /**
   * Create file-level symbols for all indexed files using database templates
   */
  private async createFileSymbols(
    projectId: number,
    files: Array<{ id: number; filePath: string }>,
    languageMap: Map<string, number>
  ): Promise<void> {
    if (files.length === 0) return;

    const complete = this.logger.operation("createFileSymbols", {
      projectId,
      fileCount: files.length,
    });

    try {
      // Group files by language for efficient batch processing
      const filesByLanguage = new Map<number, any[]>();

      files.forEach((file) => {
        const fileName = path.basename(file.filePath);
        const fileExt = path.extname(file.filePath);
        const fileLanguage = this.getLanguageForExtension(fileExt);
        const fileLanguageId =
          fileLanguage && languageMap.has(fileLanguage)
            ? languageMap.get(fileLanguage)!
            : 1; // Default to first language if no match

        const fileSymbol = {
          name: fileName,
          qualifiedName: file.filePath,
          kind: "file",
          filePath: file.filePath,
          isExternal: false,
          semanticTags: ["file"],
        };

        if (!filesByLanguage.has(fileLanguageId)) {
          filesByLanguage.set(fileLanguageId, []);
        }
        filesByLanguage.get(fileLanguageId)!.push(fileSymbol);
      });

      // Process each language group
      for (const [languageId, fileSymbols] of filesByLanguage) {
        await this.dbTemplates.ensureVirtualSymbols(
          projectId,
          languageId,
          fileSymbols
        );
      }

      this.logger.debug(`Created file symbols for ${files.length} files`);
      complete();
    } catch (error) {
      this.logger.error("Failed to create file symbols", error, { projectId });
      throw error;
    }
  }

  /**
   * Create virtual symbols for imported modules using database templates
   */
  private async createModuleSymbols(
    projectId: number,
    moduleNames: Set<string>,
    languageMap: Map<string, number>,
    currentLanguageId: number
  ): Promise<void> {
    if (moduleNames.size === 0) return;

    const complete = this.logger.operation("createModuleSymbols", {
      projectId,
      moduleCount: moduleNames.size,
    });

    try {
      // Prepare module symbols for batch creation
      const moduleSymbols = Array.from(moduleNames).map((moduleName) => {
        const isExternal =
          !moduleName.startsWith("./") &&
          !moduleName.startsWith("../") &&
          !moduleName.startsWith("/");
        const kind = isExternal ? "external_module" : "module";

        return {
          name: moduleName,
          qualifiedName: moduleName,
          kind,
          filePath: isExternal ? `<external>/${moduleName}` : moduleName,
          isExternal,
          semanticTags: isExternal
            ? ["external", "dependency"]
            : ["internal", "module"],
        };
      });

      // Use database templates to ensure virtual symbols exist
      await this.dbTemplates.ensureVirtualSymbols(
        projectId,
        currentLanguageId,
        moduleSymbols
      );

      this.logger.debug(
        `Created virtual symbols for ${moduleNames.size} modules`
      );
      complete();
    } catch (error) {
      this.logger.error("Failed to create module symbols", error, {
        projectId,
      });
      throw error;
    }
  }

  /**
   * Resolve and store relationships after all symbols are indexed
   */
  async resolveAndStoreRelationships(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>,
    languageMap: Map<string, number>
  ): Promise<void> {
    this.debug("Resolving and storing relationships...");

    // Collect all relationships from parse results
    const allRelationships: Array<{
      relationship: RelationshipInfo;
      filePath: string;
    }> = [];

    // Collect all imported modules to create virtual symbols
    // Map of language -> Set of module names
    const importedModulesByLanguage = new Map<string, Set<string>>();

    for (const result of parseResults) {
      // Determine the language of this file
      const fileExt = path.extname(result.filePath);
      const fileLanguage = this.getLanguageForExtension(fileExt);

      if (result.relationships && result.relationships.length > 0) {
        this.debug(
          `Found ${result.relationships.length} relationships in ${result.filePath}`
        );
        for (const rel of result.relationships) {
          if (
            rel.relationshipType === "writes_field" ||
            rel.relationshipType === "reads_field"
          ) {
            this.debug(
              `  Field relationship: ${rel.fromName} ${rel.relationshipType} ${rel.toName}`
            );
          }
          allRelationships.push({
            relationship: rel,
            filePath: result.filePath || "",
          });

          // Collect imported module names per language
          if (rel.relationshipType === "imports" && fileLanguage) {
            if (!importedModulesByLanguage.has(fileLanguage)) {
              importedModulesByLanguage.set(fileLanguage, new Set<string>());
            }
            importedModulesByLanguage.get(fileLanguage)!.add(rel.toName);
          }
        }
      }
    }

    if (allRelationships.length === 0) {
      this.debug("No relationships to store");
      return;
    }

    this.debug(`Found ${allRelationships.length} relationships to resolve`);

    // Create virtual symbols for imported modules per language
    for (const [language, moduleNames] of importedModulesByLanguage) {
      const languageId = languageMap.get(language);
      if (languageId) {
        await this.createModuleSymbols(
          projectId,
          moduleNames,
          languageMap,
          languageId
        );
      }
    }

    // Now that all symbols are stored, resolve relationships using database templates
    const complete = this.logger.operation("buildRelationshipMappings", {
      projectId,
    });

    try {
      // Use database templates for optimized data retrieval
      const symbolMapping = await this.dbTemplates.buildSymbolMapping(
        projectId
      );
      const fileMapping = await this.dbTemplates.buildFileMapping(projectId);
      const fieldIndex = await this.dbTemplates.buildFieldSymbolIndex(
        projectId
      );

      // Get files for this project
      const filesInDb = await this.db
        .select({
          id: fileIndex.id,
          filePath: fileIndex.filePath,
        })
        .from(fileIndex)
        .where(eq(fileIndex.projectId, projectId));

      // Consolidate all mappings for relationship resolution
      const symbolMap = new Map([
        ...symbolMapping.byName,
        ...symbolMapping.byQualifiedName,
        ...symbolMapping.byFilePath,
      ]);
      const fileMap = fileMapping;
      const fieldSymbolsByName = fieldIndex;

      this.logger.debug("Optimized mappings built", {
        symbolEntries: symbolMap.size,
        fileEntries: fileMap.size,
        fieldCategories: fieldSymbolsByName.size,
      });

      // Create file-level symbols for all indexed files
      await this.createFileSymbols(projectId, filesInDb, languageMap);

      // Rebuild symbol map after creating module and file symbols
      const allSymbols = await this.db
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

      // Clear and rebuild symbol map
      symbolMap.clear();
      allSymbols.forEach((sym) => {
        symbolMap.set(sym.name, sym.id);
        if (sym.qualifiedName && sym.qualifiedName !== sym.name) {
          symbolMap.set(sym.qualifiedName, sym.id);
        }

        // Map file paths to their file symbols
        if (sym.kind === "file") {
          symbolMap.set(sym.filePath, sym.id);
        }
      });

      // Separate import relationships from other relationships
      const importRelationships: typeof allRelationships = [];
      const symbolRelationships: typeof allRelationships = [];

      allRelationships.forEach((rel) => {
        if (rel.relationship.relationshipType === "imports") {
          importRelationships.push(rel);
        } else {
          symbolRelationships.push(rel);
        }
      });

      // Process import relationships (file-to-module relationships)
      const processedImports = new Set<string>();
      const importRecords: any[] = [];

      for (const { relationship, filePath } of importRelationships) {
        // Get the file symbol for the importing file
        const fromFileSymbolId =
          symbolMap.get(filePath) || symbolMap.get(relationship.fromName);

        if (!fromFileSymbolId) {
          // Could not find file symbol (debug spam reduced)
          continue;
        }

        // Get the module symbol
        const toModuleSymbolId = symbolMap.get(relationship.toName);

        if (!toModuleSymbolId) {
          // Could not find module symbol (debug spam reduced)
          continue;
        }

        const key = `${fromFileSymbolId}-${toModuleSymbolId}-imports`;
        if (!processedImports.has(key)) {
          processedImports.add(key);
          importRecords.push({
            projectId,
            fromSymbolId: fromFileSymbolId,
            toSymbolId: toModuleSymbolId,
            type: "imports",
            confidence: 1.0,
            contextLine: relationship.lineNumber || null,
            contextSnippet: relationship.sourceContext || null,
            metadata: JSON.stringify({
              moduleSpecifier: relationship.toName,
              fromFile: filePath,
              sourceText: relationship.sourceText,
            }),
          });
        }
      }

      // Batch insert import relationships using database templates
      if (importRecords.length > 0) {
        try {
          await this.dbTemplates.batchInsertRelationships(importRecords);
          this.logger.debug(
            `Stored ${importRecords.length} import relationships`
          );
        } catch (error) {
          this.logger.error("Failed to store import relationships", error);
          this.errors.push(`Failed to store import relationships: ${error}`);
        }
      }

      // Process symbol-to-symbol relationships with optimized resolution
      const processedSymbolRels = new Set<string>();
      const relationshipRecords: any[] = [];

      // Process relationships in batches for efficiency
      for (const { relationship, filePath: _filePath } of symbolRelationships) {
        const fromId = symbolMap.get(relationship.fromName);
        if (!fromId) continue;

        let toId = symbolMap.get(relationship.toName);

        // Optimized field resolution using database templates
        if (
          !toId &&
          (relationship.relationshipType === "reads_field" ||
            relationship.relationshipType === "writes_field" ||
            relationship.relationshipType === "initializes_field")
        ) {
          let memberName = relationship.toName;
          if (memberName.includes(".")) {
            memberName = memberName.split(".").pop() || memberName;
          }

          // Use pre-built field index for efficient lookup
          const fieldIds = fieldSymbolsByName.get(memberName);
          if (fieldIds && fieldIds.length > 0) {
            // Use first match - could be enhanced with context-based selection
            toId = fieldIds[0];
          }
        }

        // Call resolution using modular strategies
        if (!toId && relationship.relationshipType === "calls") {
          toId = this.resolveCallTarget(
            relationship,
            symbolMap,
            symbolMapping.allSymbols
          );
        }

        // Cross-language service resolution
        if (!toId && relationship.crossLanguage === true) {
          toId = this.resolveCrossLanguageTarget(
            relationship,
            symbolMap,
            symbolMapping.allSymbols
          );
        }

        if (fromId && toId) {
          const key = `${fromId}-${toId}-${relationship.relationshipType}`;
          if (!processedSymbolRels.has(key)) {
            processedSymbolRels.add(key);
            relationshipRecords.push({
              projectId,
              fromSymbolId: fromId,
              toSymbolId: toId,
              type: relationship.relationshipType,
              confidence: relationship.confidence || 1.0,
              contextLine: relationship.lineNumber || null,
              contextSnippet: relationship.sourceContext || null,
              metadata:
                relationship.usagePattern ||
                relationship.sourceText ||
                relationship.crossLanguage ||
                relationship.bridgeType
                  ? JSON.stringify({
                      usagePattern: relationship.usagePattern,
                      sourceText: relationship.sourceText,
                      crossLanguage: relationship.crossLanguage,
                      bridgeType: relationship.bridgeType,
                    })
                  : null,
            });
          }
        }
      }

      // Batch insert relationships using database templates
      if (relationshipRecords.length > 0) {
        try {
          await this.dbTemplates.batchInsertRelationships(relationshipRecords);
          this.logger.debug(
            `Stored ${relationshipRecords.length} relationships using optimized batching`
          );
        } catch (error) {
          this.logger.error("Failed to store relationships", error);
          this.errors.push(`Failed to store relationships: ${error}`);
        }
      }

      const totalResolved = processedImports.size + relationshipRecords.length;
      this.debug(
        `Relationship resolution complete: ${totalResolved}/${allRelationships.length} resolved`
      );

      complete();
    } catch (error) {
      this.logger.error("Failed to resolve relationships", error);
      this.errors.push(`Failed to resolve relationships: ${error}`);
      throw error;
    }
  }

  /**
   * Store symbols from parse results
   */
  async storeSymbols(
    projectId: number,
    languageMap: Map<string, number>,
    parseResults: Array<ParseResult & { filePath: string }>,
    getLanguageForExtension: (ext: string) => string | null,
    errors: string[]
  ): Promise<void> {
    const startTime = Date.now();
    this.logger.debug("Storing symbols from parse results...");

    let totalSymbols = 0;
    const _totalPatterns = 0;
    let totalControlFlow = 0;

    // Process each file's symbols
    for (let i = 0; i < parseResults.length; i++) {
      const result = parseResults[i];
      if (!result.symbols || result.symbols.length === 0) continue;

      const fileExtension = path.extname(result.filePath);
      const detectedLanguage = getLanguageForExtension(fileExtension);

      if (!detectedLanguage) {
        errors.push(`No parser found for file extension: ${result.filePath}`);
        continue;
      }

      const languageId = languageMap.get(detectedLanguage);

      if (!languageId) {
        errors.push(
          `No language ID for language "${detectedLanguage}" for file: ${result.filePath}`
        );
        continue;
      }

      try {
        // Batch insert symbols
        const symbolRecords = result.symbols.map((symbol: SymbolInfo) => ({
          projectId,
          languageId,
          name: symbol.name,
          qualifiedName: symbol.qualifiedName,
          kind: symbol.kind,
          filePath: result.filePath,
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
          isAbstract: false, // Not part of SymbolInfo type
          namespace: symbol.namespace,
          parentScope: symbol.parentScope,
          confidence: symbol.confidence || 1.0,
          languageFeatures: symbol.languageFeatures || null,
        }));

        if (symbolRecords.length > 0) {
          await this.db
            .insert(universalSymbols)
            .values(symbolRecords)
            .onConflictDoNothing();
          totalSymbols += symbolRecords.length;

          this.logger.debug(
            `Stored ${symbolRecords.length} symbols from ${result.filePath}`
          );
        }

        // Skip pattern storage for now - pattern detection is a separate concern
        // TODO: Implement pattern storage when pattern detection is needed

        // Store control flow data if any
        if (result.controlFlowData) {
          // Get symbol IDs for control flow blocks
          const symbolMap = new Map<string, number>();

          const insertedSymbols = await this.db
            .select()
            .from(universalSymbols)
            .where(eq(universalSymbols.filePath, result.filePath));

          for (const sym of insertedSymbols) {
            symbolMap.set(sym.name, sym.id);
          }

          // Store control flow blocks
          if (
            result.controlFlowData.blocks &&
            result.controlFlowData.blocks.length > 0
          ) {
            const blockRecords = result.controlFlowData.blocks
              .map((block: any) => {
                const symbolId = symbolMap.get(block.symbolName);
                if (!symbolId) return null;

                return {
                  symbolId,
                  projectId,
                  blockType: block.blockType,
                  startLine: block.startLine,
                  endLine: block.endLine,
                  condition: block.condition,
                  loopType: block.loopType,
                  complexity: block.complexity || 1,
                };
              })
              .filter(Boolean);

            if (blockRecords.length > 0) {
              await this.db
                .insert(controlFlowBlocks)
                .values(blockRecords as any);
              totalControlFlow += blockRecords.length;
            }
          }
        }
      } catch (error) {
        this.logger.error("Failed to store symbols", error, {
          projectId,
          file: result.filePath,
        });
        errors.push(
          `Failed to store symbols from ${result.filePath}: ${error}`
        );
      }
    }

    // Process control flow data using batch utilities
    await this.processControlFlowData(projectId, parseResults, errors);

    this.logger.debug(`Symbol storage complete`, {
      totalSymbols,
      totalControlFlow,
      duration: Date.now() - startTime,
    });
  }

  /**
   * Process control flow data using batch processing
   */
  private async processControlFlowData(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>,
    errors: string[]
  ): Promise<void> {
    const complete = this.logger.operation("processControlFlowData", {
      projectId,
    });

    try {
      let totalControlFlow = 0;
      let totalCalls = 0;

      for (const result of parseResults) {
        if (!result.controlFlowData) continue;

        // Build symbol mapping for this file
        const symbolMapping = await this.dbTemplates.buildSymbolMapping(
          projectId
        );
        const fileSymbols = symbolMapping.allSymbols.filter(
          (s) => s.filePath === result.filePath
        );
        const symbolMap = new Map<string, number>();

        for (const sym of fileSymbols) {
          symbolMap.set(sym.name, sym.id);
        }

        // Process control flow blocks
        if (result.controlFlowData.blocks?.length > 0) {
          const blockRecords = result.controlFlowData.blocks
            .map((block: any) => {
              const symbolId = symbolMap.get(block.symbolName);
              if (!symbolId) return null;

              return {
                symbolId,
                projectId,
                blockType: block.blockType,
                startLine: block.startLine,
                endLine: block.endLine,
                condition: block.condition,
                loopType: block.loopType,
                complexity: block.complexity || 1,
              };
            })
            .filter(Boolean);

          if (blockRecords.length > 0) {
            await this.db.insert(controlFlowBlocks).values(blockRecords as any);
            totalControlFlow += blockRecords.length;
          }
        }

        // Process function calls
        if (result.controlFlowData.calls?.length > 0) {
          const callRecords = result.controlFlowData.calls
            .map((call: any) => {
              const callerId = symbolMap.get(call.callerName);
              if (!callerId) return null;

              const calleeId = call.calleeName
                ? symbolMap.get(call.calleeName)
                : null;

              return {
                callerId,
                calleeId,
                projectId,
                targetFunction:
                  call.targetFunction ||
                  call.calleeName ||
                  call.functionName ||
                  call.target,
                lineNumber: call.lineNumber,
                columnNumber: call.columnNumber,
                callType: call.callType || "direct",
                condition: call.condition || null,
                isConditional: call.isConditional ? 1 : 0,
                isRecursive: call.isRecursive ? 1 : 0,
              };
            })
            .filter(Boolean);

          if (callRecords.length > 0) {
            await this.db.insert(symbolCalls).values(callRecords as any);
            totalCalls += callRecords.length;
          }
        }
      }

      this.logger.debug("Processed control flow data", {
        controlFlowBlocks: totalControlFlow,
        functionCalls: totalCalls,
      });

      complete();
    } catch (error) {
      this.logger.error("Failed to process control flow data", error, {
        projectId,
      });
      errors.push(`Failed to process control flow data: ${error}`);
    }
  }
}
