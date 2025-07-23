/**
 * Universal Language-Agnostic Indexer
 *
 * This indexer orchestrates the parsing of multiple languages using
 * tree-sitter parsers and stores results in the universal schema.
 * It replaces the old pattern-aware indexer for the new system.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, or, inArray, sql, isNull } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { Worker } from "worker_threads";
import { EventEmitter } from "events";
import * as crypto from "crypto";

// Import schema
import {
  projects,
  languages,
  fileIndex,
  universalSymbols,
  universalRelationships,
  detectedPatterns,
  projectLanguages,
} from "../database/schema/universal.js";

// Import code flow tables from drizzle schema
import {
  controlFlowBlocks,
  symbolCalls,
} from "../database/drizzle/schema.js";

// Import optimized parsers
import { OptimizedTreeSitterBaseParser as TreeSitterBaseParser } from "../parsers/tree-sitter/optimized-base-parser.js";
import {
  ParseOptions,
  ParseResult,
  RelationshipInfo,
  SymbolInfo,
  PatternInfo,
} from "../parsers/tree-sitter/parser-types.js";
import { OptimizedCppTreeSitterParser as CppTreeSitterParser } from "../parsers/tree-sitter/optimized-cpp-parser.js";

// Import new semantic analysis functions
import {
  inferDataFlow,
  discoverVirtualOverrides,
} from "../analysis/relationship-enrichment.js";

// Import semantic intelligence components
import { SemanticIntelligenceOrchestrator } from "../analysis/semantic-intelligence-orchestrator.js";
import { SemanticDataPersister } from "../analysis/semantic-data-persister.js";

export interface IndexOptions {
  projectPath: string;
  projectName?: string;
  languages?: string[];
  filePatterns?: string[];
  excludePatterns?: string[];
  parallelism?: number;
  debugMode?: boolean;
  forceReindex?: boolean;
  enableSemanticAnalysis?: boolean;
  enablePatternDetection?: boolean;
  maxFiles?: number;
  progressCallback?: (progress: IndexProgress) => void;
}

export interface IndexProgress {
  phase:
    | "discovery"
    | "parsing"
    | "relationships"
    | "analysis"
    | "storing"
    | "complete";
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  errors: number;
  startTime: number;
  estimatedTimeRemaining?: number;
}

export interface IndexResult {
  success: boolean;
  projectId: number;
  filesIndexed: number;
  symbolsFound: number;
  relationshipsFound: number;
  patternsFound: number;
  errors: string[];
  duration: number;
  confidence: number;
}

interface LanguageParser {
  language: string;
  extensions: string[];
  parser: new (db: Database, options: ParseOptions) => TreeSitterBaseParser;
}

export class UniversalIndexer extends EventEmitter {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private options: Required<IndexOptions>;
  private parsers: Map<string, LanguageParser> = new Map();
  private progress: IndexProgress;
  private errors: string[] = [];
  private semanticOrchestrator: SemanticIntelligenceOrchestrator;

  constructor(db: Database, options: IndexOptions) {
    super();
    this.rawDb = db;
    this.db = drizzle(db);

    this.options = {
      projectPath: options.projectPath,
      projectName: options.projectName || path.basename(options.projectPath),
      languages: options.languages || [
        "cpp",
        "python",
        "typescript",
        "javascript",
      ],
      filePatterns: options.filePatterns || [],
      excludePatterns: options.excludePatterns || [
        "node_modules/**",
        "dist/**",
        "build/**",
        ".git/**",
      ],
      parallelism: options.parallelism || 4,
      debugMode: options.debugMode || false,
      forceReindex: options.forceReindex || false,
      enableSemanticAnalysis: options.enableSemanticAnalysis ?? true,
      enablePatternDetection: options.enablePatternDetection ?? true,
      maxFiles: options.maxFiles || 0,
      progressCallback: options.progressCallback || (() => {}),
    };

    this.progress = {
      phase: "discovery",
      totalFiles: 0,
      processedFiles: 0,
      errors: 0,
      startTime: Date.now(),
    };

    this.registerParsers();
    
    // Initialize semantic intelligence orchestrator
    this.semanticOrchestrator = new SemanticIntelligenceOrchestrator(this.rawDb, {
      debugMode: this.options.debugMode,
      embeddingDimensions: 256
    });
  }

  /**
   * Register language parsers
   */
  private registerParsers(): void {
    // Register C++ parser
    this.parsers.set("cpp", {
      language: "cpp",
      extensions: [
        ".cpp",
        ".hpp",
        ".h",
        ".cc",
        ".cxx",
        ".hxx",
        ".ixx",
        ".cppm",
      ],
      parser: CppTreeSitterParser,
    });

    // Register Python parser - dynamic import to avoid circular dependencies
    this.parsers.set("python", {
      language: "python",
      extensions: [".py", ".pyi", ".pyx"],
      parser: require("../parsers/adapters/python-language-parser.js")
        .PythonLanguageParser,
    });

    // Register TypeScript parser
    this.parsers.set("typescript", {
      language: "typescript",
      extensions: [".ts", ".tsx"],
      parser: require("../parsers/adapters/typescript-language-parser.js")
        .TypeScriptLanguageParser,
    });

    // Register JavaScript parser (uses TypeScript parser with JS mode)
    this.parsers.set("javascript", {
      language: "javascript",
      extensions: [".js", ".jsx", ".mjs", ".cjs"],
      parser: require("../parsers/adapters/typescript-language-parser.js")
        .TypeScriptLanguageParser,
    });
  }

  /**
   * Index a project
   */
  async indexProject(): Promise<IndexResult> {
    const startTime = Date.now();

    try {
      // Phase 1: Project setup
      const projectId = await this.ensureProject();
      const languageMap = await this.ensureLanguages();

      // Phase 2: File discovery
      this.updateProgress("discovery");
      const files = await this.discoverFiles();
      this.progress.totalFiles = files.length;

      if (files.length === 0) {
        return this.createResult(
          projectId,
          startTime,
          false,
          "No files found to index"
        );
      }

      this.debug(`Discovered ${files.length} files to index`);

      // Phase 3: Parallel parsing
      this.updateProgress("parsing");
      const parseResults = await this.parseFilesInParallel(
        files,
        projectId,
        languageMap
      );

      // Phase 3.5: Store symbols from parse results
      this.updateProgress("storing");
      await this.storeSymbols(projectId, languageMap, parseResults);

      // Phase 4: Resolve and store relationships
      this.updateProgress("relationships");
      await this.resolveAndStoreRelationships(projectId, parseResults);

      // Phase 5: Semantic analysis
      if (this.options.enableSemanticAnalysis) {
        this.updateProgress("analysis");
        await this.performSemanticAnalysis(projectId, parseResults);
      }

      // Phase 6: Complete
      this.updateProgress("complete");

      // Calculate totals
      const stats = await this.calculateIndexStats(projectId);

      return {
        success: true,
        projectId,
        filesIndexed: parseResults.length,
        symbolsFound: stats.symbols,
        relationshipsFound: stats.relationships,
        patternsFound: stats.patterns,
        errors: this.errors,
        duration: Date.now() - startTime,
        confidence: stats.avgConfidence,
      };
    } catch (error) {
      this.debug(`Indexing failed: ${error}`);
      return this.createResult(0, startTime, false, String(error));
    }
  }

  /**
   * Ensure project exists in database
   */
  private async ensureProject(): Promise<number> {
    // First check by name to avoid conflicts
    const existingByName = await this.db
      .select()
      .from(projects)
      .where(eq(projects.name, this.options.projectName))
      .limit(1);

    if (existingByName.length > 0) {
      // Update project path if needed
      await this.db
        .update(projects)
        .set({
          rootPath: this.options.projectPath,
          updatedAt: new Date(),
          isActive: true,
        })
        .where(eq(projects.id, existingByName[0].id));

      return existingByName[0].id;
    }

    // Check by path
    const existingByPath = await this.db
      .select()
      .from(projects)
      .where(eq(projects.rootPath, this.options.projectPath))
      .limit(1);

    if (existingByPath.length > 0) {
      // Update project name
      await this.db
        .update(projects)
        .set({
          name: this.options.projectName,
          updatedAt: new Date(),
          isActive: true,
        })
        .where(eq(projects.id, existingByPath[0].id));

      return existingByPath[0].id;
    }

    // Create new project
    const result = await this.db
      .insert(projects)
      .values({
        name: this.options.projectName,
        rootPath: this.options.projectPath,
        description: `Indexed by Universal Indexer`,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      })
      .returning({ id: projects.id });

    return result[0].id;
  }

  /**
   * Ensure languages exist and return mapping
   */
  private async ensureLanguages(): Promise<Map<string, number>> {
    const languageMap = new Map<string, number>();

    for (const lang of this.options.languages) {
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
            displayName: this.getLanguageDisplayName(lang),
            parserClass: this.getParserClass(lang),
            extensions: JSON.stringify(this.getLanguageExtensions(lang)),
            isEnabled: true,
          })
          .returning({ id: languages.id });

        languageMap.set(lang, result[0].id);
      }
    }

    return languageMap;
  }

  /**
   * Discover files to index
   */
  private async discoverFiles(): Promise<string[]> {
    const files: string[] = [];
    const extensions = this.getTargetExtensions();

    this.debug(`Target extensions: ${extensions.join(", ")}`);
    this.debug(`Project path: ${this.options.projectPath}`);

    // Build glob patterns
    const patterns =
      this.options.filePatterns.length > 0
        ? this.options.filePatterns
        : extensions.map((ext) => `**/*${ext}`);

    this.debug(`Glob patterns: ${patterns.join(", ")}`);

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.options.projectPath,
        absolute: true,
        ignore: this.options.excludePatterns,
      });

      this.debug(`Pattern ${pattern} found ${matches.length} files`);
      files.push(...matches);
    }

    // Filter by language extensions
    const extensionSet = new Set(extensions);
    const filteredFiles = files.filter((file) => {
      const ext = path.extname(file);
      return extensionSet.has(ext);
    });

    // Apply maxFiles limit if specified  
    if (this.options.maxFiles && this.options.maxFiles > 0) {
      return filteredFiles.slice(0, this.options.maxFiles);
    }

    return filteredFiles;
  }

  /**
   * Filter files to only those that have changed since last parsing
   */
  private async filterChangedFiles(
    files: string[],
    projectId: number
  ): Promise<string[]> {
    // Get existing file index for this project
    const existingFiles = await this.db
      .select({
        filePath: fileIndex.filePath,
        fileHash: fileIndex.fileHash,
        lastParsed: fileIndex.lastParsed,
      })
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    const existingFileMap = new Map(
      existingFiles.map(f => [f.filePath, f])
    );

    const changedFiles: string[] = [];

    // Check each file for changes
    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        const content = await fs.readFile(file, 'utf-8');
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');

        const existingFile = existingFileMap.get(file);

        if (!existingFile) {
          // New file - needs parsing
          changedFiles.push(file);
        } else if (existingFile.fileHash !== currentHash) {
          // File content changed - needs reparsing
          changedFiles.push(file);
        } else if (!existingFile.lastParsed) {
          // File exists but was never successfully parsed
          changedFiles.push(file);
        }
        // If hash matches and file was parsed, skip it (incremental optimization)
      } catch (error) {
        // If we can't read the file, include it for parsing (it might be deleted/moved)
        changedFiles.push(file);
      }
    }

    return changedFiles;
  }

  /**
   * Parse files in parallel using worker threads
   */
  private async parseFilesInParallel(
    files: string[],
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<Array<ParseResult & { filePath: string }>> {
    // SCALE 2: Incremental parsing - filter files that need reparsing
    const filesToParse = await this.filterChangedFiles(files, projectId);
    
    if (filesToParse.length < files.length) {
      console.log(`📈 Incremental parsing: Processing ${filesToParse.length}/${files.length} changed files`);
    }

    const results: Array<ParseResult & { filePath: string }> = [];
    const chunks = this.chunkArray(
      filesToParse,
      Math.ceil(filesToParse.length / this.options.parallelism)
    );

    // Process chunks in parallel
    const promises = chunks.map((chunk) =>
      this.parseFileChunk(chunk, projectId, languageMap)
    );
    const chunkResults = await Promise.all(promises);

    // Flatten results
    for (const chunkResult of chunkResults) {
      results.push(...chunkResult);
    }

    return results;
  }

  /**
   * Parse a chunk of files
   */
  private async parseFileChunk(
    files: string[],
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<Array<ParseResult & { filePath: string }>> {
    // Process files within the chunk in parallel for maximum concurrency
    const parsePromises = files.map(async (file) => {
      try {
        const result = await this.parseFile(file, projectId, languageMap);
        this.progress.processedFiles++;
        this.updateProgress("parsing", file);
        return { ...result, filePath: file };
      } catch (error) {
        this.errors.push(`Failed to parse ${file}: ${error}`);
        this.progress.errors++;
        return null;
      }
    });

    const results = await Promise.all(parsePromises);
    
    // Filter out failed parses (null results)
    return results.filter((result): result is ParseResult & { filePath: string } => 
      result !== null
    );
  }

  /**
   * Parse a single file
   */
  private async parseFile(
    filePath: string,
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<ParseResult> {
    // Determine language from extension
    const ext = path.extname(filePath);
    const language = this.getLanguageForExtension(ext);

    if (!language) {
      throw new Error(`No parser for extension: ${ext}`);
    }

    const languageId = languageMap.get(language);
    if (!languageId) {
      throw new Error(`Language not initialized: ${language}`);
    }

    // Get parser class
    const parserInfo = this.parsers.get(language);
    if (!parserInfo) {
      throw new Error(`No parser registered for language: ${language}`);
    }

    // Create parser instance
    const parseOptions: ParseOptions = {
      projectId,
      languageId,
      debugMode: this.options.debugMode,
      enablePatternDetection: this.options.enablePatternDetection,
      enableSemanticAnalysis: this.options.enableSemanticAnalysis,
    };

    const parser = new parserInfo.parser(this.rawDb, parseOptions);
    await parser.initialize();

    // Read file content
    const content = await fs.readFile(filePath, "utf-8");

    // Record file in file_index
    const { fileIndex } = await import("../database/schema/universal.js");
    const fileStats = await fs.stat(filePath);
    const startParse = Date.now();

    // Parse file
    const result = await parser.parseFile(filePath, content);

    // Update file index with results
    await this.db
      .insert(fileIndex)
      .values({
        projectId,
        languageId,
        filePath,
        fileSize: fileStats.size,
        lastParsed: new Date(),
        parseDuration: Date.now() - startParse,
        parserVersion: "1.0.0",
        symbolCount: result.symbols?.length || 0,
        relationshipCount: result.relationships?.length || 0,
        patternCount: result.patterns?.length || 0,
        isIndexed: true,
        hasErrors: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [fileIndex.projectId, fileIndex.filePath],
        set: {
          fileSize: fileStats.size,
          lastParsed: new Date(),
          parseDuration: Date.now() - startParse,
          symbolCount: result.symbols?.length || 0,
          relationshipCount: result.relationships?.length || 0,
          patternCount: result.patterns?.length || 0,
          isIndexed: true,
          hasErrors: false,
          updatedAt: new Date(),
        },
      });

    return result;
  }

  /**
   * Perform semantic analysis across all files
   */
  private async performSemanticAnalysis(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>
  ): Promise<void> {
    // Resolve cross-file references
    // TODO: Implement cross-file reference resolution
    // await this.resolveCrossFileReferences(projectId);

    // Infer data flow relationships
    await inferDataFlow(this.db, projectId);

    // Discover virtual override relationships
    await discoverVirtualOverrides(this.db, projectId);
    
    // Process semantic intelligence data from parsing
    if (this.options.enableSemanticAnalysis) {
      await this.processSemanticIntelligence(projectId, parseResults);
    }

    // Detect architectural patterns
    await this.detectArchitecturalPatterns(projectId);

    // Calculate complexity metrics
    await this.calculateComplexityMetrics(projectId);
  }

  /**
   * Resolve cross-file symbol references
   */
  private async resolveCrossFileReferences(projectId: number): Promise<void> {
    // TODO: Implement proper cross-file reference resolution
    // This requires more sophisticated symbol resolution logic
    return;
  }

  /**
   * Detect architectural patterns across the codebase
   */
  private async detectArchitecturalPatterns(projectId: number): Promise<void> {
    // TODO: Implement cross-file pattern detection
    // Examples: MVC, Factory clusters, Pipeline stages
    this.debug("Architectural pattern detection not yet implemented");
  }

  /**
   * Calculate complexity metrics
   */
  private async calculateComplexityMetrics(projectId: number): Promise<void> {
    // TODO: Calculate module-level complexity
    // Examples: Coupling, cohesion, cyclomatic complexity aggregates
    this.debug("Complexity metrics calculation not yet implemented");
  }

  /**
   * Process semantic intelligence data
   */
  private async processSemanticIntelligence(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>
  ): Promise<void> {
    try {
      this.debug("Processing semantic intelligence data...");
      
      // Collect files with semantic intelligence data
      const filesWithSemanticData = parseResults.filter(r => r.semanticIntelligence);
      
      if (filesWithSemanticData.length === 0) {
        this.debug("No semantic intelligence data to process");
        return;
      }
      
      this.debug(`Processing semantic data for ${filesWithSemanticData.length} files`);
      
      // Transform data for orchestrator
      const fileData = filesWithSemanticData.map(result => ({
        symbols: result.symbols || [],
        relationships: result.relationships || [],
        ast: result.semanticIntelligence!.ast,
        sourceCode: result.semanticIntelligence!.sourceCode || '',
        filePath: result.filePath
      }));
      
      // Process through semantic intelligence pipeline
      const startTime = Date.now();
      const results = await this.semanticOrchestrator.processMultipleFiles(fileData, {
        enableContextExtraction: true,
        enableEmbeddingGeneration: true,
        enableClustering: true,
        enableInsightGeneration: true,
        debugMode: this.options.debugMode
      });
      
      const duration = Date.now() - startTime;
      this.debug(`Semantic intelligence processing completed in ${duration}ms`);
      
      // Log results
      if (results.stats) {
        this.debug(`Analyzed ${results.stats.symbolsAnalyzed} symbols`);
        this.debug(`Generated ${results.stats.embeddingsGenerated} embeddings`);
        this.debug(`Created ${results.stats.clustersCreated} clusters`);
        this.debug(`Generated ${results.stats.insightsGenerated} insights`);
      }
      
      // Create symbol ID mapping for persistence
      const symbolIdMapping = await this.createSymbolIdMapping(projectId, fileData);
      
      // Persist all semantic intelligence data to database
      if (results) {
        this.debug("Persisting semantic intelligence data to database...");
        const persister = new SemanticDataPersister(this.rawDb, {
          projectId,
          debugMode: this.options.debugMode,
          batchSize: 100,
          enableTransactions: true
        });
        
        const persistenceStats = await persister.persistSemanticIntelligence(results, symbolIdMapping);
        
        // Log persistence stats
        this.debug(`Semantic data persistence completed:`);
        this.debug(`  - Symbols updated: ${persistenceStats.symbolsUpdated}`);
        this.debug(`  - Embeddings stored: ${persistenceStats.embeddingsStored}`);
        this.debug(`  - Clusters stored: ${persistenceStats.clustersStored}`);
        this.debug(`  - Insights stored: ${persistenceStats.insightsStored}`);
        this.debug(`  - Relationships stored: ${persistenceStats.relationshipsStored}`);
        this.debug(`  - Processing time: ${persistenceStats.processingTimeMs}ms`);
        
        if (persistenceStats.errors.length > 0) {
          this.debug(`  - Errors: ${persistenceStats.errors.length}`);
          this.errors.push(...persistenceStats.errors);
        }
      }
      
    } catch (error) {
      this.errors.push(`Semantic intelligence processing failed: ${error}`);
      console.error("Error in processSemanticIntelligence:", error);
    }
  }

  /**
   * Create mapping from symbol keys to database IDs
   */
  private async createSymbolIdMapping(
    projectId: number,
    fileData: Array<{ symbols: any[], filePath: string }>
  ): Promise<Map<string, number>> {
    const symbolIdMapping = new Map<string, number>();
    
    try {
      // Get all symbols for this project from database
      const symbolsInDb = await this.db
        .select({
          id: universalSymbols.id,
          name: universalSymbols.name,
          qualifiedName: universalSymbols.qualifiedName,
          filePath: universalSymbols.filePath,
          kind: universalSymbols.kind,
          line: universalSymbols.line,
          column: universalSymbols.column
        })
        .from(universalSymbols)
        .where(eq(universalSymbols.projectId, projectId));

      // Create mapping strategies for symbol resolution
      for (const symbol of symbolsInDb) {
        // Strategy 1: Qualified name (most precise)
        if (symbol.qualifiedName) {
          symbolIdMapping.set(symbol.qualifiedName, symbol.id);
        }
        
        // Strategy 2: Name + file path (good precision)
        const fileKey = `${symbol.name}@${symbol.filePath}`;
        symbolIdMapping.set(fileKey, symbol.id);
        
        // Strategy 3: Name + line + column (precise for position-based matching)
        const positionKey = `${symbol.name}:${symbol.line}:${symbol.column}@${symbol.filePath}`;
        symbolIdMapping.set(positionKey, symbol.id);
        
        // Strategy 4: Basic name (fallback, may have conflicts)
        if (!symbolIdMapping.has(symbol.name)) {
          symbolIdMapping.set(symbol.name, symbol.id);
        }
        
        // Strategy 5: For semantic analysis, create keys that match what the orchestrator uses
        for (const fileInfo of fileData) {
          if (fileInfo.filePath === symbol.filePath) {
            // Look for matching symbols in the parse data
            const matchingSymbol = fileInfo.symbols.find(s => 
              s.name === symbol.name && 
              s.line === symbol.line && 
              s.column === symbol.column
            );
            
            if (matchingSymbol) {
              // Create semantic analysis compatible keys
              const semanticKey = `${symbol.filePath}:${symbol.name}:${symbol.line}:${symbol.column}`;
              symbolIdMapping.set(semanticKey, symbol.id);
              
              // Also map by symbol index if available
              const symbolIndex = fileInfo.symbols.indexOf(matchingSymbol);
              if (symbolIndex >= 0) {
                const indexKey = `${symbol.filePath}:symbol:${symbolIndex}`;
                symbolIdMapping.set(indexKey, symbol.id);
              }
            }
          }
        }
      }
      
      this.debug(`Created symbol ID mapping with ${symbolIdMapping.size} entries`);
      
    } catch (error) {
      this.debug(`Failed to create symbol ID mapping: ${error}`);
      this.errors.push(`Symbol ID mapping failed: ${error}`);
    }
    
    return symbolIdMapping;
  }

  /**
   * Calculate index statistics
   */
  private async calculateIndexStats(projectId: number): Promise<{
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
   * Helper methods
   */

  private getTargetExtensions(): string[] {
    const extensions: string[] = [];

    for (const [_, parser] of this.parsers) {
      if (this.options.languages.includes(parser.language)) {
        extensions.push(...parser.extensions);
      }
    }

    return extensions;
  }

  private getLanguageForExtension(ext: string): string | null {
    for (const [lang, parser] of this.parsers) {
      if (parser.extensions.includes(ext)) {
        return lang;
      }
    }
    return null;
  }

  private getLanguageDisplayName(lang: string): string {
    const displayNames: Record<string, string> = {
      cpp: "C++",
      python: "Python",
      typescript: "TypeScript",
      javascript: "JavaScript",
    };

    return displayNames[lang] || lang;
  }

  private getParserClass(lang: string): string {
    const parserClasses: Record<string, string> = {
      cpp: "CppTreeSitterParser",
      python: "PythonTreeSitterParser",
      typescript: "TypeScriptTreeSitterParser",
      javascript: "JavaScriptTreeSitterParser",
    };

    return parserClasses[lang] || "UnknownParser";
  }

  private getLanguageExtensions(lang: string): string[] {
    const extensionMap: Record<string, string[]> = {
      cpp: [".cpp", ".hpp", ".ixx", ".cxx", ".hxx"],
      python: [".py", ".pyx", ".pyi"],
      typescript: [".ts", ".tsx"],
      javascript: [".js", ".jsx"],
    };

    return extensionMap[lang] || [];
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }

    return chunks;
  }

  private updateProgress(
    phase: IndexProgress["phase"],
    currentFile?: string
  ): void {
    this.progress.phase = phase;
    this.progress.currentFile = currentFile;

    // Calculate estimated time remaining
    if (this.progress.processedFiles > 0 && this.progress.totalFiles > 0) {
      const elapsed = Date.now() - this.progress.startTime;
      const perFile = elapsed / this.progress.processedFiles;
      const remaining = this.progress.totalFiles - this.progress.processedFiles;
      this.progress.estimatedTimeRemaining = perFile * remaining;
    }

    // Emit progress event
    this.emit("progress", this.progress);

    // Call callback if provided
    if (this.options.progressCallback) {
      this.options.progressCallback(this.progress);
    }
  }

  /**
   * Store symbols from parse results
   */
  private async storeSymbols(
    projectId: number,
    languageMap: Map<string, number>,
    parseResults: Array<ParseResult & { filePath: string }>
  ): Promise<void> {
    const startTime = Date.now();
    this.debug("Storing symbols from parse results...");
    
    let totalSymbols = 0;
    let totalPatterns = 0;
    let totalControlFlow = 0;
    
    // Process each file's symbols
    for (const result of parseResults) {
      if (!result.symbols || result.symbols.length === 0) continue;
      
      const languageId = languageMap.get(
        this.getLanguageForExtension(path.extname(result.filePath)) || ""
      );
      
      if (!languageId) {
        this.errors.push(`No language ID for file: ${result.filePath}`);
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
          complexity: symbol.complexity || 1,
          semanticTags: JSON.stringify(symbol.semanticTags || []),
          isDefinition: symbol.isDefinition ? 1 : 0,
          isExported: symbol.isExported ? 1 : 0,
          isAsync: symbol.isAsync ? 1 : 0,
          isAbstract: 0, // Not part of SymbolInfo type
          namespace: symbol.namespace,
          parentScope: symbol.parentScope,
          confidence: symbol.confidence || 1.0,
          languageFeatures: symbol.languageFeatures ? JSON.stringify(symbol.languageFeatures) : null
        }));
        
        if (symbolRecords.length > 0) {
          await this.db.insert(universalSymbols)
            .values(symbolRecords)
            .onConflictDoNothing();
          totalSymbols += symbolRecords.length;
          this.debug(`Stored ${symbolRecords.length} symbols from ${result.filePath}`);
        }
        
        // Skip pattern storage for now - pattern detection is a separate concern
        // TODO: Implement pattern storage when pattern detection is needed
        
        // Store control flow data if any
        if (result.controlFlowData) {
          // Get symbol IDs for control flow blocks
          const symbolMap = new Map<string, number>();
          const insertedSymbols = await this.db.select()
            .from(universalSymbols)
            .where(eq(universalSymbols.filePath, result.filePath));
          
          for (const sym of insertedSymbols) {
            symbolMap.set(sym.name, sym.id);
          }
          
          // Store control flow blocks
          if (result.controlFlowData.blocks && result.controlFlowData.blocks.length > 0) {
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
                  complexity: block.complexity || 1
                };
              })
              .filter(Boolean);
            
            if (blockRecords.length > 0) {
              await this.db.insert(controlFlowBlocks)
                .values(blockRecords as any);
              totalControlFlow += blockRecords.length;
            }
          }
          
          // Store function calls
          if (result.controlFlowData.calls && result.controlFlowData.calls.length > 0) {
            const callRecords = result.controlFlowData.calls
              .map((call: any) => {
                const callerId = symbolMap.get(call.callerName);
                if (!callerId) return null;
                
                // Try to resolve the callee ID from the symbol map
                const calleeId = call.calleeName ? symbolMap.get(call.calleeName) : null;
                
                return {
                  callerId,
                  calleeId,
                  projectId,
                  targetFunction: call.targetFunction || call.calleeName || call.functionName || call.target,
                  lineNumber: call.lineNumber,
                  columnNumber: call.columnNumber,
                  callType: call.callType || 'direct',
                  condition: call.condition || null,
                  isConditional: call.isConditional ? 1 : 0,
                  isRecursive: call.isRecursive ? 1 : 0
                };
              })
              .filter(Boolean);
            
            if (callRecords.length > 0) {
              await this.db.insert(symbolCalls)
                .values(callRecords as any);
            }
          }
        }
        
      } catch (error) {
        this.errors.push(`Failed to store symbols from ${result.filePath}: ${error}`);
        console.error(`Error storing symbols from ${result.filePath}:`, error);
      }
    }
    
    const duration = Date.now() - startTime;
    this.debug(`Symbol storage completed in ${duration}ms: ${totalSymbols} symbols, ${totalPatterns} patterns, ${totalControlFlow} control flow blocks`);
  }

  /**
   * Resolve and store relationships after all symbols are indexed
   */
  private async resolveAndStoreRelationships(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>
  ): Promise<void> {
    this.debug("Resolving and storing relationships...");

    // Collect all relationships from parse results
    const allRelationships: Array<{
      relationship: RelationshipInfo;
      filePath: string;
    }> = [];

    // Collect all imported modules to create virtual symbols
    const importedModules = new Set<string>();

    for (const result of parseResults) {
      if (result.relationships && result.relationships.length > 0) {
        this.debug(
          `Found ${result.relationships.length} relationships in ${result.filePath}`
        );
        for (const rel of result.relationships) {
          if (rel.relationshipType === 'writes_field' || rel.relationshipType === 'reads_field') {
            this.debug(`  Field relationship: ${rel.fromName} ${rel.relationshipType} ${rel.toName}`);
          }
          allRelationships.push({
            relationship: rel,
            filePath: result.filePath || "",
          });

          // Collect imported module names
          if (rel.relationshipType === "imports") {
            importedModules.add(rel.toName);
          }
        }
      }
    }

    if (allRelationships.length === 0) {
      this.debug("No relationships to store");
      return;
    }

    this.debug(`Found ${allRelationships.length} relationships to resolve`);

    // Create virtual symbols for imported modules
    await this.createModuleSymbols(projectId, importedModules);

    // Now that all symbols are stored, resolve relationships
    const { universalSymbols, universalRelationships, fileIndex } =
      await import("../database/schema/universal.js");

    // Fetch ALL symbols from database for cross-language resolution
    const symbolMap = new Map<string, number>();
    const fileMap = new Map<string, number>();

    const symbolsInDb = await this.db
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

    // Fetch all files for file-based relationships (imports/exports)
    const filesInDb = await this.db
      .select({
        id: fileIndex.id,
        filePath: fileIndex.filePath,
      })
      .from(fileIndex)
      .where(eq(fileIndex.projectId, projectId));

    // Build file map
    filesInDb.forEach((file) => {
      fileMap.set(file.filePath, file.id);
      // Also map relative paths and base names
      const baseName = path.basename(file.filePath);
      if (!fileMap.has(baseName)) {
        fileMap.set(baseName, file.id);
      }
    });

    // Build comprehensive symbol map for cross-language resolution
    symbolsInDb.forEach((sym) => {
      // Basic name mappings
      symbolMap.set(sym.name, sym.id);
      if (sym.qualifiedName && sym.qualifiedName !== sym.name) {
        symbolMap.set(sym.qualifiedName, sym.id);
      }

      // File-based mapping for cross-language resolution
      if (sym.filePath) {
        const fileName = path.basename(sym.filePath);

        // For Python files, create multiple mapping strategies
        if (fileName.endsWith(".py")) {
          const baseName = path.basename(fileName, ".py");

          // Strategy 1: Direct filename mapping (terrain_generator.py -> filename)
          if (!symbolMap.has(fileName)) {
            symbolMap.set(fileName, sym.id);
            // Mapped first symbol for file (debug spam reduced)
          }

          // Strategy 2: Prefer classes over functions for filename mapping
          if (sym.kind === "class") {
            symbolMap.set(fileName, sym.id);
            // Mapped class override for file (debug spam reduced)

            // Strategy 3: Python naming convention (snake_case -> PascalCase)
            const expectedClassName = baseName
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join("");

            if (sym.name === expectedClassName) {
              symbolMap.set(fileName, sym.id);
              // Mapped naming convention match (debug spam reduced)
            }
          }

          // Strategy 4: Exported symbols get priority
          if (
            sym.isExported &&
            (sym.kind === "class" || sym.kind === "function")
          ) {
            symbolMap.set(fileName, sym.id);
            // Mapped exported symbol priority (debug spam reduced)
          }
        }

        // For TypeScript/JavaScript files
        if (
          fileName.endsWith(".ts") ||
          fileName.endsWith(".js") ||
          fileName.endsWith(".tsx") ||
          fileName.endsWith(".jsx")
        ) {
          // Prefer exported classes and functions
          if (
            sym.isExported &&
            (sym.kind === "class" || sym.kind === "function")
          ) {
            symbolMap.set(fileName, sym.id);
            // Mapped exported symbol (debug spam reduced)
          } else if (!symbolMap.has(fileName)) {
            // Fallback to any symbol in the file
            symbolMap.set(fileName, sym.id);
            // Mapped fallback symbol (debug spam reduced)
          }
        }
      }
    });

    // Debug summary (reduced spam)
    this.debug(`Symbol mapping complete: ${symbolMap.size} symbol entries, ${fileMap.size} file entries`);

    // Create file-level symbols for all indexed files
    await this.createFileSymbols(projectId, filesInDb);

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
        // Resolved import relationship (debug spam reduced)

        try {
          await this.db.insert(universalRelationships).values({
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
        } catch (error: any) {
          if (error.message?.includes("UNIQUE constraint failed")) {
            // Skipping duplicate import (debug spam reduced)
          } else {
            this.errors.push(
              `Failed to store import relationship: ${error.message}`
            );
          }
        }
      }
    }

    // Process symbol-to-symbol relationships
    const processedSymbolRels = new Set<string>();
    const relationshipRecords = symbolRelationships
      .filter(({ relationship }) => {
        const fromId = symbolMap.get(relationship.fromName);
        let toId = symbolMap.get(relationship.toName);

        // Special handling for field relationships
        if (
          !toId &&
          (relationship.relationshipType === "reads_field" ||
            relationship.relationshipType === "writes_field" ||
            relationship.relationshipType === "initializes_field")
        ) {
          // Try to find the field symbol by looking for qualified name patterns
          // relationship.toName contains something like "generic.type"
          let memberName = relationship.toName;
          
          // If toName contains a dot, extract just the field name
          if (memberName.includes('.')) {
            memberName = memberName.split('.').pop() || memberName;
          }

          // Look for field symbols with this name
          for (const [key, id] of symbolMap.entries()) {
            if (key.endsWith(`::${memberName}`) || key === memberName) {
              // Found a potential match - verify it's a field
              const symbol = allSymbols.find((s) => s.id === id);
              if (symbol && symbol.kind === "field") {
                toId = id;
                this.debug(`  Resolved field ${relationship.toName} -> ${key} (ID: ${id})`);
                break;
              }
            }
          }
        }

        // Enhanced call resolution with context awareness
        if (
          !toId &&
          relationship.relationshipType === "calls"
        ) {
          toId = this.resolveCallTarget(relationship, symbolMap, allSymbols);
        }

        if (fromId && toId) {
          const key = `${fromId}-${toId}-${relationship.relationshipType}`;
          if (processedSymbolRels.has(key)) {
            return false;
          }
          processedSymbolRels.add(key);
          return true;
        }

        return false;
      })
      .map(({ relationship }) => {
        const fromId = symbolMap.get(relationship.fromName)!;
        let toId = symbolMap.get(relationship.toName);

        // For field relationships, we need to resolve the field name
        if (
          !toId &&
          (relationship.relationshipType === "reads_field" ||
            relationship.relationshipType === "writes_field" ||
            relationship.relationshipType === "initializes_field")
        ) {
          // Handle both "fieldName" and "object.fieldName" formats
          let memberName = relationship.toName;
          
          // If toName contains a dot, extract just the field name
          if (memberName.includes('.')) {
            memberName = memberName.split('.').pop() || memberName;
          }

          // Look for field symbols with this name
          for (const [key, id] of symbolMap.entries()) {
            if (key.endsWith(`::${memberName}`) || key === memberName) {
              // Found a potential match - verify it's a field
              const symbol = allSymbols.find((s) => s.id === id);
              if (symbol && symbol.kind === "field") {
                toId = id;
                break;
              }
            }
          }
        }

        // Enhanced call resolution  
        if (
          !toId &&
          relationship.relationshipType === "calls"
        ) {
          toId = this.resolveCallTarget(relationship, symbolMap, allSymbols);
        }

        return {
          projectId,
          fromSymbolId: fromId,
          toSymbolId: toId!,
          type: relationship.relationshipType,
          confidence: relationship.confidence,
          contextLine: relationship.lineNumber || null,
          contextSnippet: relationship.sourceContext || null,
          metadata: JSON.stringify({
            usagePattern: relationship.usagePattern,
            sourceText: relationship.sourceText,
            crossLanguage: relationship.crossLanguage,
            bridgeType: relationship.bridgeType,
          }),
        };
      });

    if (relationshipRecords.length > 0) {
      try {
        // Insert in batches to handle duplicates better
        for (const record of relationshipRecords) {
          try {
            await this.db.insert(universalRelationships).values(record);
          } catch (error: any) {
            if (error.message?.includes("UNIQUE constraint failed")) {
              this.debug(
                `Skipping duplicate relationship: ${record.fromSymbolId} -> ${record.toSymbolId}`
              );
            } else {
              throw error;
            }
          }
        }
        // Successfully stored symbol relationships (debug spam reduced)
      } catch (error) {
        // Failed to store relationships (debug spam reduced)
        this.errors.push(`Failed to store relationships: ${error}`);
      }
    }

    const totalResolved = processedImports.size + relationshipRecords.length;
    this.debug(`Relationship resolution complete: ${totalResolved}/${allRelationships.length} resolved`);
  }

  private createResult(
    projectId: number,
    startTime: number,
    success: boolean,
    error?: string
  ): IndexResult {
    if (error) {
      this.errors.push(error);
    }

    return {
      success,
      projectId,
      filesIndexed: 0,
      symbolsFound: 0,
      relationshipsFound: 0,
      patternsFound: 0,
      errors: this.errors,
      duration: Date.now() - startTime,
      confidence: 0,
    };
  }

  /**
   * Create file-level symbols for all indexed files
   */
  private async createFileSymbols(
    projectId: number,
    files: Array<{ id: number; filePath: string }>
  ): Promise<void> {
    if (files.length === 0) return;

    this.debug(`Creating file symbols for ${files.length} files`);
    const { universalSymbols } = await import(
      "../database/schema/universal.js"
    );

    for (const file of files) {
      // Check if file symbol already exists
      const existing = await this.db
        .select()
        .from(universalSymbols)
        .where(
          sql`${universalSymbols.projectId} = ${projectId} 
               AND ${universalSymbols.filePath} = ${file.filePath} 
               AND ${universalSymbols.kind} = 'file'`
        )
        .limit(1);

      if (existing.length === 0) {
        try {
          const fileName = path.basename(file.filePath);
          await this.db.insert(universalSymbols).values({
            projectId,
            languageId: 1, // Will be updated based on file extension
            name: fileName,
            qualifiedName: file.filePath,
            kind: "file",
            filePath: file.filePath,
            line: 0,
            column: 0,
            visibility: "public",
            isExported: false,
            confidence: 1.0,
            semanticTags: JSON.stringify(["file"]),
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Created file symbol (debug spam reduced)
        } catch (error) {
          // Failed to create file symbol (debug spam reduced)
        }
      }
    }
  }

  /**
   * Create virtual symbols for imported modules
   */
  private async createModuleSymbols(
    projectId: number,
    moduleNames: Set<string>
  ): Promise<void> {
    if (moduleNames.size === 0) return;

    this.debug(`Creating virtual symbols for ${moduleNames.size} modules`);
    const { universalSymbols } = await import(
      "../database/schema/universal.js"
    );

    for (const moduleName of moduleNames) {
      // Determine if it's an external or internal module
      const isExternal =
        !moduleName.startsWith("./") &&
        !moduleName.startsWith("../") &&
        !moduleName.startsWith("/");
      const kind = isExternal ? "external_module" : "module";

      // Check if module symbol already exists
      const existing = await this.db
        .select()
        .from(universalSymbols)
        .where(
          sql`${universalSymbols.projectId} = ${projectId} 
               AND ${universalSymbols.name} = ${moduleName} 
               AND ${universalSymbols.kind} = ${kind}`
        )
        .limit(1);

      if (existing.length === 0) {
        // Create virtual symbol for the module
        try {
          await this.db.insert(universalSymbols).values({
            projectId,
            languageId: 1, // Default to first language - modules are cross-language
            name: moduleName,
            qualifiedName: moduleName,
            kind,
            filePath: isExternal ? `<external>/${moduleName}` : moduleName,
            line: 0,
            column: 0,
            visibility: "public",
            isExported: true,
            confidence: 1.0,
            semanticTags: JSON.stringify(
              isExternal ? ["external", "dependency"] : ["internal", "module"]
            ),
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          this.debug(`Created ${kind} symbol for: ${moduleName}`);
        } catch (error) {
          // Failed to create module symbol (debug spam reduced)
        }
      }
    }
  }

  /**
   * Enhanced call resolution with multiple strategies and context awareness
   */
  private resolveCallTarget(
    relationship: RelationshipInfo,
    symbolMap: Map<string, number>,
    allSymbols: Array<{ id: number; name: string; qualifiedName: string; filePath: string; kind: string; isExported: boolean }>
  ): number | undefined {
    const targetName = relationship.toName;
    const fromName = relationship.fromName;
    
    // Extract context information from the caller
    const callerParts = fromName.split('::');
    const callerNamespace = callerParts.length > 1 ? callerParts.slice(0, -1).join('::') : undefined;
    const callerClass = callerParts.length > 1 ? callerParts[callerParts.length - 2] : undefined;
    
    this.debug(`Resolving call: ${fromName} -> ${targetName}`);
    
    // Strategy 1: Exact qualified name match (highest priority)
    let toId = symbolMap.get(targetName);
    if (toId) {
      const symbol = allSymbols.find(s => s.id === toId);
      if (symbol && (symbol.kind === 'function' || symbol.kind === 'method')) {
        this.debug(`  ✓ Exact match: ${targetName}`);
        return toId;
      }
    }
    
    // Strategy 2: Same class method call (methodA calling methodB in same class)
    if (callerClass && !targetName.includes('::')) {
      const sameClassMethod = `${callerNamespace}::${targetName}`;
      toId = symbolMap.get(sameClassMethod);
      if (toId) {
        const symbol = allSymbols.find(s => s.id === toId);
        if (symbol && symbol.kind === 'method') {
          this.debug(`  ✓ Same class method: ${sameClassMethod}`);
          return toId;
        }
      }
    }
    
    // Strategy 3: Same namespace function call
    if (callerNamespace && !targetName.includes('::')) {
      const sameNamespaceFunc = `${callerNamespace}::${targetName}`;
      toId = symbolMap.get(sameNamespaceFunc);
      if (toId) {
        const symbol = allSymbols.find(s => s.id === toId);
        if (symbol && (symbol.kind === 'function' || symbol.kind === 'method')) {
          this.debug(`  ✓ Same namespace: ${sameNamespaceFunc}`);
          return toId;
        }
      }
    }
    
    // Strategy 4: Standard library and common functions (std::, printf, etc.)
    if (targetName.startsWith('std::') || ['printf', 'malloc', 'free', 'exit'].includes(targetName)) {
      // Create or find standard library symbol
      for (const [key, id] of symbolMap.entries()) {
        if (key === targetName) {
          this.debug(`  ✓ Standard library: ${targetName}`);
          return id;
        }
      }
    }
    
    // Strategy 5: Global function search (any function with this name)
    const candidates: Array<{id: number, symbol: typeof allSymbols[0], score: number}> = [];
    
    for (const [key, id] of symbolMap.entries()) {
      const symbol = allSymbols.find(s => s.id === id);
      if (!symbol || (symbol.kind !== 'function' && symbol.kind !== 'method')) continue;
      
      let score = 0;
      
      // Exact name match at end of qualified name
      if (key.endsWith(`::${targetName}`) || key === targetName) {
        score += 100;
        
        // Note: File path scoring removed since RelationshipInfo doesn't include filePath
        // This could be enhanced by passing filePath context through the relationship resolution
        
        // Prefer exported functions for cross-file calls
        if (symbol.isExported) {
          score += 30;
        }
        
        // Prefer functions over methods for unqualified calls
        if (symbol.kind === 'function' && !targetName.includes('::')) {
          score += 20;
        }
        
        // Prefer methods over functions for qualified calls
        if (symbol.kind === 'method' && targetName.includes('::')) {
          score += 20;
        }
        
        candidates.push({ id, symbol, score });
      }
    }
    
    // Sort by score and return best match
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      this.debug(`  ✓ Best match: ${best.symbol.qualifiedName} (score: ${best.score})`);
      return best.id;
    }
    
    // Strategy 6: Fuzzy matching for common patterns
    const fuzzyPatterns = [
      // Constructor calls (ClassName() -> ClassName::ClassName)
      () => {
        if (callerClass && targetName === callerClass) {
          const constructor = `${callerNamespace}::${targetName}`;
          const id = symbolMap.get(constructor);
          if (id) {
            this.debug(`  ✓ Constructor: ${constructor}`);
            return id;
          }
        }
        return undefined;
      },
      
      // Method calls with implicit this (methodName -> this->methodName)
      () => {
        if (callerClass && !targetName.includes('::')) {
          const implicitThis = `${callerNamespace}::${targetName}`;
          const id = symbolMap.get(implicitThis);
          if (id) {
            const symbol = allSymbols.find(s => s.id === id);
            if (symbol && symbol.kind === 'method') {
              this.debug(`  ✓ Implicit this: ${implicitThis}`);
              return id;
            }
          }
        }
        return undefined;
      }
    ];
    
    for (const pattern of fuzzyPatterns) {
      const result = pattern();
      if (result) return result;
    }
    
    this.debug(`  ✗ Could not resolve: ${targetName}`);
    return undefined;
  }

  private debug(message: string, ...args: any[]): void {
    if (this.options.debugMode) {
      console.log(`[UniversalIndexer] ${message}`, ...args);
    }
  }
}
