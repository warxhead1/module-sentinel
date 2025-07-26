/**
 * Universal Language-Agnostic Indexer (Refactored)
 *
 * This indexer orchestrates the parsing of multiple languages using
 * tree-sitter parsers and stores results in the universal schema.
 * It has been refactored into logical helper classes for maintainability.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";
import { EventEmitter } from "events";
import { Worker } from "worker_threads";

// Import schema
import {
  projects,
} from "../database/drizzle/schema.js";

// Import optimized parsers
import { OptimizedTreeSitterBaseParser as TreeSitterBaseParser } from "../parsers/tree-sitter/optimized-base-parser.js";
import {
  ParseOptions,
  ParseResult,
} from "../parsers/tree-sitter/parser-types.js";
import { OptimizedCppTreeSitterParser as CppTreeSitterParser } from "../parsers/tree-sitter/optimized-cpp-parser.js";

// Import new semantic analysis functions (used by semantic processor)

// Import semantic intelligence components
import { SemanticOrchestrator } from "../analysis/semantic-orchestrator.js";

// Import helper classes
import { IndexerSymbolResolver } from "./indexer-symbol-resolver.js";
import { IndexerFileDiscovery } from "./indexer-file-discovery.js";
import { IndexerSemanticProcessor } from "./indexer-semantic-processor.js";
import { IndexerDatabaseManager } from "./indexer-database-manager.js";
import { IndexerLogger } from "../utils/indexer-logger.js";

export interface IndexOptions {
  projectPath: string;
  projectName?: string;
  additionalPaths?: string[]; // Support multiple paths
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
  useWorkerThreads?: boolean; // New option for worker threads
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
  private parserInstances: Map<string, TreeSitterBaseParser> = new Map(); // Pooled parser instances
  private progress: IndexProgress;
  private errors: string[] = [];
  private semanticOrchestrator: SemanticOrchestrator;

  // Helper classes
  private symbolResolver: IndexerSymbolResolver;
  private fileDiscovery: IndexerFileDiscovery;
  private semanticProcessor: IndexerSemanticProcessor;
  private databaseManager: IndexerDatabaseManager;
  private logger: IndexerLogger;

  constructor(db: Database, options: IndexOptions) {
    super();
    this.rawDb = db;
    this.db = drizzle(db);

    this.options = {
      projectPath: options.projectPath,
      projectName: options.projectName || path.basename(options.projectPath),
      additionalPaths: options.additionalPaths || [],
      languages: options.languages || [
        "cpp",
        "python",
        "typescript",
        "javascript",
        "go",
        "java",
        "csharp",
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
      enableSemanticAnalysis: options.enableSemanticAnalysis ?? true, // Enabled by default
      enablePatternDetection: options.enablePatternDetection ?? true,
      maxFiles: options.maxFiles || 0,
      progressCallback: options.progressCallback || (() => {}),
      useWorkerThreads: options.useWorkerThreads ?? false, // Default to false for backward compatibility
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
    this.semanticOrchestrator = new SemanticOrchestrator(
      this.rawDb,
      {
        debugMode: this.options.debugMode,
        embeddingDimensions: 256,
      }
    );

    // Initialize helper classes
    this.symbolResolver = new IndexerSymbolResolver(this.rawDb);
    this.fileDiscovery = new IndexerFileDiscovery(this.rawDb, this.parsers);
    this.semanticProcessor = new IndexerSemanticProcessor(this.rawDb, this.semanticOrchestrator);
    this.databaseManager = new IndexerDatabaseManager(this.rawDb);
    
    // Initialize logger
    this.logger = new IndexerLogger(true);
    this.logger.info('Universal Indexer initialized', {
      projectPath: this.options.projectPath,
      languages: this.options.languages,
      parallelism: this.options.parallelism,
      enableSemanticAnalysis: this.options.enableSemanticAnalysis
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

    this.parsers.set("go", {
      language: "go",
      extensions: [".go"],
      parser: require("../parsers/adapters/go-language-parser.js")
        .GoLanguageParser,
    });

    // Register Java parser
    this.parsers.set("java", {
      language: "java",
      extensions: [".java"],
      parser: require("../parsers/adapters/java-language-parser.js")
        .JavaLanguageParser,
    });

    // Register C# parser
    this.parsers.set("csharp", {
      language: "csharp",
      extensions: [".cs"],
      parser: require("../parsers/adapters/csharp-language-parser.js")
        .CSharpLanguageParser,
    });
  }

  /**
   * Index a single file - useful for testing and precision analysis
   */
  async indexFile(
    projectId: number,
    filePath: string
  ): Promise<ParseResult | null> {
    try {
      // Ensure project exists - use drizzle for consistency
      const [project] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      // Get language mappings
      const languageMap = await this.databaseManager.ensureLanguages(
        this.options.languages,
        this.fileDiscovery.getLanguageDisplayName.bind(this.fileDiscovery),
        this.fileDiscovery.getParserClass.bind(this.fileDiscovery),
        this.fileDiscovery.getLanguageExtensions.bind(this.fileDiscovery)
      );

      // Determine file language and parser
      const language = this.fileDiscovery.detectLanguage(filePath);
      if (!language) {
        this.debug(`No parser available for file: ${filePath}`);
        return null;
      }

      const parser = this.parsers.get(language);
      if (!parser) {
        this.debug(`No parser found for language: ${language}`);
        return null;
      }

      // Parse the file
      this.debug(`Parsing single file: ${filePath} (${language})`);
      const parseResult = await this.parseFile(
        filePath,
        projectId,
        languageMap
      );

      // Store results if parsing succeeded
      if (parseResult && parseResult.symbols.length > 0) {
        // Add filePath to parseResult for storage methods
        const parseResultWithPath: ParseResult & { filePath: string } = {
          ...parseResult,
          filePath,
        };
        await this.symbolResolver.storeSymbols(
          projectId, 
          languageMap, 
          [parseResultWithPath],
          this.fileDiscovery.getLanguageForExtension.bind(this.fileDiscovery),
          this.errors
        );
        await this.symbolResolver.resolveAndStoreRelationships(
          projectId, 
          [parseResultWithPath], 
          languageMap
        );
      }

      return parseResult;
    } catch (error) {
      this.debug(`Error indexing file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Index a project
   */
  async indexProject(): Promise<IndexResult> {
    const startTime = Date.now();

    try {
      // Phase 1: Project setup
      const projectId = await this.databaseManager.ensureProject(
        this.options.projectName,
        this.options.projectPath
      );
      const languageMap = await this.databaseManager.ensureLanguages(
        this.options.languages,
        this.fileDiscovery.getLanguageDisplayName.bind(this.fileDiscovery),
        this.fileDiscovery.getParserClass.bind(this.fileDiscovery),
        this.fileDiscovery.getLanguageExtensions.bind(this.fileDiscovery)
      );

      // Phase 2: File discovery
      this.updateProgress("discovery");
      this.logger.info('Starting file discovery', { 
        projectPath: this.options.projectPath,
        excludePatterns: this.options.excludePatterns 
      });
      
      const files = await this.fileDiscovery.discoverFiles(this.options);
      this.progress.totalFiles = files.length;
      
      this.logger.info('File discovery completed', { 
        totalFiles: files.length,
        firstFiles: files.slice(0, 5).map(f => path.basename(f))
      });

      if (files.length === 0) {
        this.logger.warn('No files found to index');
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
      await this.symbolResolver.storeSymbols(
        projectId, 
        languageMap, 
        parseResults,
        this.fileDiscovery.getLanguageForExtension.bind(this.fileDiscovery),
        this.errors
      );

      // Phase 4: Resolve and store relationships
      this.updateProgress("relationships");
      await this.symbolResolver.resolveAndStoreRelationships(
        projectId, 
        parseResults, 
        languageMap
      );

      // Phase 5: Semantic analysis
      if (this.options.enableSemanticAnalysis) {
        this.updateProgress("analysis");
        await this.semanticProcessor.performSemanticAnalysis(
          projectId, 
          parseResults,
          {
            enableSemanticAnalysis: this.options.enableSemanticAnalysis,
            debugMode: this.options.debugMode
          }
        );
      }

      // Phase 6: Complete
      this.updateProgress("complete");

      // Calculate totals
      const stats = await this.databaseManager.calculateIndexStats(projectId);

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
   * Parse files in parallel using worker threads
   */
  private async parseFilesInParallel(
    files: string[],
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<Array<ParseResult & { filePath: string }>> {
    // Check memory pressure and adjust parallelism
    const { checkMemory } = await import("../utils/memory-monitor.js");
    const memStats = checkMemory();
    let effectiveParallelism = this.options.parallelism;
    
    if (memStats.percentUsed > 80) {
      effectiveParallelism = Math.max(1, Math.floor(this.options.parallelism / 2));
      this.logger.warn('Reducing parallelism due to memory pressure', {
        originalParallelism: this.options.parallelism,
        effectiveParallelism,
        memoryPercent: memStats.percentUsed.toFixed(2)
      });
    }
    // SCALE 2: Incremental parsing - filter files that need reparsing
    const filesToParse = await this.fileDiscovery.filterChangedFiles(files, projectId);

    if (filesToParse.length < files.length) {
      console.log(
        `📈 Incremental parsing: Processing ${filesToParse.length}/${files.length} changed files`
      );
    }

    const results: Array<ParseResult & { filePath: string }> = [];
    
    // Calculate optimal chunk size (aim for smaller chunks to avoid blocking)
    const optimalChunkSize = Math.max(1, Math.ceil(filesToParse.length / (effectiveParallelism * 2)));
    const chunks = this.chunkArray(filesToParse, optimalChunkSize);
    
    this.logger.info('Chunking strategy', {
      totalFiles: filesToParse.length,
      parallelism: effectiveParallelism,
      chunkSize: optimalChunkSize,
      numberOfChunks: chunks.length,
      chunksizes: chunks.map(c => c.length),
      memoryPercent: memStats.percentUsed.toFixed(2)
    });

    // Process chunks with limited concurrency based on memory pressure
    const maxConcurrentChunks = memStats.percentUsed > 80 ? 2 : effectiveParallelism;
    const chunkResults: Array<ParseResult & { filePath: string }>[] = [];
    
    // Process chunks in batches to limit concurrency
    for (let i = 0; i < chunks.length; i += maxConcurrentChunks) {
      const batch = chunks.slice(i, i + maxConcurrentChunks);
      const batchPromises = batch.map((chunk, index) =>
        this.parseFileChunk(chunk, projectId, languageMap)
          .catch(error => {
            this.logger.error(`Chunk ${i + index} failed`, error, { chunkSize: chunk.length });
            return []; // Return empty array on chunk failure to continue with other chunks
          })
      );
      const batchResults = await Promise.all(batchPromises);
      chunkResults.push(...batchResults);
      
      // Add small delay between batches to prevent CPU overload
      if (i + maxConcurrentChunks < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

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
    const results: Array<ParseResult & { filePath: string }> = [];
    
    this.logger.info(`Starting chunk with ${files.length} files`, {
      firstFile: files[0] ? path.basename(files[0]) : 'none',
      lastFile: files[files.length - 1] ? path.basename(files[files.length - 1]) : 'none'
    });
    
    // Process files sequentially with event loop yielding
    for (const file of files) {
      try {
        // Yield to event loop periodically to prevent blocking
        await new Promise(resolve => setImmediate(resolve));
        
        this.logger.info(`Parsing file ${this.progress.processedFiles + 1}/${this.progress.totalFiles}`, {
          file: path.basename(file),
          fullPath: file
        });
        
        const result = await this.parseFile(file, projectId, languageMap);
        this.progress.processedFiles++;
        this.updateProgress("parsing", file);
        
        if (result) {
          results.push({ ...result, filePath: file });
          this.logger.info(`File parsed successfully`, {
            file: path.basename(file),
            symbols: result.symbols.length,
            relationships: result.relationships.length
          });
        } else {
          this.logger.warn(`File parsing returned no result`, { file });
        }
      } catch (error) {
        this.errors.push(`Failed to parse ${file}: ${error}`);
        this.progress.errors++;
        this.logger.error(`Failed to parse file`, error, { file });
      }
    }
    
    this.logger.info(`Chunk completed`, {
      filesProcessed: results.length,
      errors: this.errors.length
    });

    return results;
  }

  /**
   * Parse a file using worker thread
   */
  private async parseFileWithWorker(
    filePath: string,
    content: string,
    language: string,
    projectId: number,
    languageId: number
  ): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'workers', 'indexing-worker.js');
      const worker = new Worker(workerPath);

      // Set timeout for worker
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Worker timeout parsing ${filePath}`));
      }, 30000); // 30 second timeout per file

      worker.on('message', (result: any) => {
        clearTimeout(timeout);
        worker.terminate();
        
        if (result.success) {
          resolve(result.result);
        } else {
          reject(new Error(result.error));
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(error);
      });

      // Send parse request to worker
      worker.postMessage({
        type: 'parse',
        filePath,
        content,
        language,
        projectId,
        languageId,
        options: {
          debugMode: this.options.debugMode,
          enablePatternDetection: this.options.enablePatternDetection,
        }
      });
    });
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
    const language = this.fileDiscovery.getLanguageForExtension(ext);

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

    // Get or create pooled parser instance
    const parserKey = `${language}-${languageId}`;
    let parser = this.parserInstances.get(parserKey);

    if (!parser) {
      // Create parser instance only once per language
      const parseOptions: ParseOptions = {
        projectId,
        languageId,
        debugMode: this.options.debugMode,
        enablePatternDetection: this.options.enablePatternDetection,
        enableSemanticAnalysis: this.options.enableSemanticAnalysis,
      };

      parser = new parserInfo.parser(this.rawDb, parseOptions);
      await parser.initialize();
      this.parserInstances.set(parserKey, parser);
    }

    // Read file content
    const content = await fs.readFile(filePath, "utf-8");

    // Record file in file_index
    const { fileIndex } = await import("../database/drizzle/schema.js");
    const fileStats = await fs.stat(filePath);
    const startParse = Date.now();

    // Parse file - use worker thread if enabled
    let result: ParseResult;
    if (this.options.useWorkerThreads) {
      try {
        result = await this.parseFileWithWorker(filePath, content, language, projectId, languageId);
      } catch (workerError) {
        this.debug(`Worker failed for ${filePath}, falling back to main thread: ${workerError}`);
        // Fallback to main thread parsing
        result = await parser.parseFile(filePath, content);
      }
    } else {
      result = await parser.parseFile(filePath, content);
    }

    // Update file index with results
    await this.db
      .insert(fileIndex)
      .values({
        projectId,
        languageId,
        filePath,
        fileSize: fileStats.size,
        lastParsed: new Date().toISOString(),
        parseDuration: Date.now() - startParse,
        parserVersion: "1.0.0",
        symbolCount: result.symbols?.length || 0,
        relationshipCount: result.relationships?.length || 0,
        patternCount: result.patterns?.length || 0,
        isIndexed: true,
        hasErrors: false,
      })
      .onConflictDoUpdate({
        target: [fileIndex.projectId, fileIndex.filePath],
        set: {
          fileSize: fileStats.size,
          lastParsed: new Date().toISOString(),
          parseDuration: Date.now() - startParse,
          symbolCount: result.symbols?.length || 0,
          relationshipCount: result.relationships?.length || 0,
          patternCount: result.patterns?.length || 0,
          isIndexed: true,
          hasErrors: false,
        },
      });

    return result;
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

  private debug(_message: string, ..._args: any[]): void {
    if (this.options.debugMode) {
      // Debug output would go here
    }
  }

  /**
   * Clean all data for a specific project (Full Rebuild preparation)
   */
  public async cleanProjectData(projectId: number): Promise<void> {
    return this.databaseManager.cleanProjectData(projectId);
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear parser instances
    this.parserInstances.clear();

    // Clear semantic orchestrator caches
    if (this.semanticOrchestrator) {
      this.semanticOrchestrator.clearCaches();
    }
    
    // Close logger
    if (this.logger) {
      this.logger.info('Indexer shutting down');
      this.logger.close();
    }
  }
}