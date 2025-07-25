/**
 * Refactored Optimized C++ Tree-Sitter Parser
 *
 * Modular, multithreaded C++ parser using specialized helper classes
 * for symbol extraction, relationship analysis, control flow, and complexity analysis.
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import { Logger, createLogger } from "../../utils/logger.js";
import {
  MemoryMonitor,
  getGlobalMemoryMonitor,
} from "../../utils/memory-monitor.js";

import { OptimizedTreeSitterBaseParser } from "./optimized-base-parser.js";
import { VisitorHandlers } from "../unified-ast-visitor.js";
import {
  SymbolInfo,
  RelationshipInfo,
  PatternInfo,
  ParseResult,
  ParseOptions,
} from "./parser-types.js";
import { SymbolResolutionCache } from "../../analysis/symbol-resolution-cache.js";

// Import our new helper classes
import { CppAstUtils } from "./cpp/cpp-ast-utils.js";
import { CppSymbolHandlers } from "./cpp/cpp-symbol-handlers.js";
import { CppRelationshipHandlers } from "./cpp/cpp-relationship-handlers.js";
import { CppPatternAnalyzer } from "./cpp/cpp-pattern-analyzer.js";
import { CppControlFlowAnalyzer } from "./cpp/cpp-control-flow-analyzer.js";
import {
  CppComplexityAnalyzer,
  FileComplexityMetrics,
} from "./cpp/cpp-complexity-analyzer.js";
import { CppWorkerPool, WorkerPoolOptions } from "./cpp/cpp-worker-pool.js";
import {
  CppVisitorContext,
  CppParseResult,
  CppParsingOptions,
  CppSymbolKind,
} from "./cpp/cpp-types.js";

export interface RefactoredParserOptions extends ParseOptions {
  // C++ specific options
  cppOptions?: CppParsingOptions;

  // Worker pool options
  enableMultithreading?: boolean;
  workerPoolOptions?: WorkerPoolOptions;

  // Analysis options
  enableComplexityAnalysis?: boolean;
  enableControlFlowAnalysis?: boolean;
  enablePatternDetection?: boolean;

  // Performance options
  memoryThreshold?: number;
  batchSize?: number;
}

export class RefactoredOptimizedCppTreeSitterParser extends OptimizedTreeSitterBaseParser {
  protected logger: Logger;
  protected memoryMonitor: MemoryMonitor;

  // Helper classes
  private astUtils: CppAstUtils;
  private symbolHandlers: CppSymbolHandlers;
  private relationshipHandlers: CppRelationshipHandlers;
  private patternAnalyzer: CppPatternAnalyzer;
  private controlFlowAnalyzer: CppControlFlowAnalyzer;
  private complexityAnalyzer: CppComplexityAnalyzer;
  private workerPool?: CppWorkerPool;

  // Cache and state
  private static symbolCache = new SymbolResolutionCache(50000);
  private cppLanguage?: Parser.Language;
  private useTreeSitter: boolean = false;
  protected options: RefactoredParserOptions;

  constructor(db: Database, options: RefactoredParserOptions) {
    super(db, options);

    this.logger = createLogger("RefactoredCppParser");
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.options = options;

    // Initialize helper classes
    this.astUtils = new CppAstUtils();
    this.symbolHandlers = new CppSymbolHandlers();
    this.relationshipHandlers = new CppRelationshipHandlers();
    this.patternAnalyzer = new CppPatternAnalyzer();
    this.controlFlowAnalyzer = new CppControlFlowAnalyzer();
    this.complexityAnalyzer = new CppComplexityAnalyzer();

    this.logger.info("Refactored C++ parser initialized", {
      enableMultithreading: options.enableMultithreading,
      enableComplexityAnalysis: options.enableComplexityAnalysis,
      enableControlFlowAnalysis: options.enableControlFlowAnalysis,
    });
  }

  async initialize(): Promise<void> {
    const checkpoint = this.memoryMonitor.createCheckpoint("initializeParser");

    try {
      this.logger.info("Initializing C++ parser components");

      // Initialize tree-sitter language
      await this.initializeTreeSitter();

      // Initialize worker pool if multithreading is enabled
      if (this.options.enableMultithreading) {
        await this.initializeWorkerPool();
      }

      this.logger.info("Parser initialization completed", {
        useTreeSitter: this.useTreeSitter,
        hasWorkerPool: !!this.workerPool,
      });
    } catch (error) {
      this.logger.error("Parser initialization failed", error);
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Parse a single C++ file
   */
  async parseFile(filePath: string, content: string): Promise<ParseResult> {
    const checkpoint = this.memoryMonitor.createCheckpoint("parseFile");
    const startTime = Date.now();

    try {
      this.logger.info("Parsing C++ file", {
        file: filePath,
        size: content.length,
        useTreeSitter: this.useTreeSitter,
      });

      // Check cache first
      const cached = this.getCachedParse(filePath);
      if (cached) {
        this.logger.debug("Cache hit for file", { file: filePath });
        await this.storeParsedData(filePath, cached);
        return cached as ParseResult;
      }

      let result: CppParseResult;

      // Use worker pool for large files if available
      if (
        this.workerPool &&
        content.length > (this.options.batchSize || 50000)
      ) {
        result = await this.parseWithWorkerPool(filePath, content);
      } else {
        result = await this.parseDirectly(filePath, content);
      }

      // Enhance result with additional analysis if enabled
      const enhancedResult = await this.enhanceParseResult(
        result,
        filePath,
        content
      );

      // Convert to legacy format for compatibility
      const legacyResult = this.convertToLegacyResult(enhancedResult);

      // Cache and store
      this.setCachedParse(filePath, legacyResult);
      await this.storeParsedData(filePath, legacyResult);

      const duration = Date.now() - startTime;
      this.logger.info("File parsing completed", {
        file: filePath,
        duration,
        symbols: enhancedResult.symbols.length,
        relationships: enhancedResult.relationships.length,
        useTreeSitter: this.useTreeSitter,
      });

      return legacyResult;
    } catch (error) {
      this.logger.error("File parsing failed", error, { file: filePath });
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Parse multiple files concurrently
   */
  async parseFiles(
    files: Array<{ filePath: string; content: string }>
  ): Promise<Map<string, ParseResult | Error>> {
    const checkpoint = this.memoryMonitor.createCheckpoint("parseFiles");

    try {
      this.logger.info("Parsing multiple C++ files", { count: files.length });

      if (this.workerPool) {
        // Use worker pool for concurrent processing
        return await this.parseFilesWithWorkerPool(files);
      } else {
        // Process sequentially
        return await this.parseFilesSequentially(files);
      }
    } catch (error) {
      this.logger.error("Multiple file parsing failed", error);
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Shutdown the parser and cleanup resources
   */
  async shutdown(): Promise<void> {
    this.logger.info("Shutting down C++ parser");

    try {
      if (this.workerPool) {
        await this.workerPool.shutdown();
      }

      this.logger.info("Parser shutdown completed");
    } catch (error) {
      this.logger.error("Parser shutdown failed", error);
    }
  }

  // Core parsing methods

  private async parseDirectly(
    filePath: string,
    content: string
  ): Promise<CppParseResult> {
    if (this.useTreeSitter) {
      return await this.parseWithTreeSitter(filePath, content);
    } else {
      return await this.parseWithPatterns(filePath, content);
    }
  }

  private async parseWithTreeSitter(
    filePath: string,
    content: string
  ): Promise<CppParseResult> {
    const checkpoint = this.memoryMonitor.createCheckpoint(
      "parseWithTreeSitter"
    );

    try {
      this.logger.debug("Using tree-sitter parsing", { file: filePath });

      const tree = this.parser.parse(content);
      if (!tree) {
        throw new Error("Parser returned null tree");
      }

      if (tree.rootNode.hasError) {
        this.logger.warn(
          "Tree has parsing errors, continuing with symbol extraction",
          {
            file: filePath,
          }
        );
      }

      // Create C++ visitor context
      const context: CppVisitorContext = this.createCppContext(
        filePath,
        content
      );

      // Use visitor to traverse the AST
      const result = await this.visitor.traverseWithContext(tree, context);

      // Convert to CppParseResult format
      return this.convertVisitorResultToCppResult(result, context);
    } catch (error) {
      this.logger.warn(
        "Tree-sitter parsing failed, falling back to patterns",
        error,
        {
          file: filePath,
        }
      );
      return await this.parseWithPatterns(filePath, content);
    } finally {
      checkpoint.complete();
    }
  }

  private async parseWithPatterns(
    filePath: string,
    content: string
  ): Promise<CppParseResult> {
    const checkpoint = this.memoryMonitor.createCheckpoint("parseWithPatterns");

    try {
      this.logger.debug("Using pattern-based parsing", { file: filePath });

      const context = this.createCppContext(filePath, content);
      return await this.patternAnalyzer.analyzeCode(content, filePath, context);
    } catch (error) {
      this.logger.error("Pattern-based parsing failed", error, {
        file: filePath,
      });
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  private async parseWithWorkerPool(
    filePath: string,
    content: string
  ): Promise<CppParseResult> {
    if (!this.workerPool) {
      throw new Error("Worker pool not initialized");
    }

    this.logger.debug("Using worker pool for parsing", { file: filePath });

    return await this.workerPool.processFile(
      filePath,
      content,
      this.options.cppOptions || {},
      0 // Default priority
    );
  }

  // Enhancement methods

  private async enhanceParseResult(
    result: CppParseResult,
    filePath: string,
    content: string
  ): Promise<CppParseResult> {
    const checkpoint =
      this.memoryMonitor.createCheckpoint("enhanceParseResult");

    try {
      const enhancedResult = { ...result };

      // Control flow analysis
      if (this.options.enableControlFlowAnalysis) {
        enhancedResult.controlFlowData = await this.analyzeControlFlow(
          result,
          content
        );
      }

      // Complexity analysis
      if (this.options.enableComplexityAnalysis) {
        const complexityMetrics = await this.analyzeComplexity(
          result,
          filePath,
          content
        );
        // Add complexity metrics to metadata
        enhancedResult.cppMetadata = {
          namespaces: enhancedResult.cppMetadata?.namespaces || [],
          templates: enhancedResult.cppMetadata?.templates || [],
          modules: enhancedResult.cppMetadata?.modules,
          concepts: enhancedResult.cppMetadata?.concepts,
          includes: enhancedResult.cppMetadata?.includes || [],
          // Add complexity data
          complexityMetrics: complexityMetrics,
        } as any;
      }

      // Additional pattern detection
      if (this.options.enablePatternDetection) {
        const additionalPatterns = await this.detectAdditionalPatterns(result);
        enhancedResult.patterns.push(...additionalPatterns);
      }

      return enhancedResult;
    } catch (error) {
      this.logger.error("Result enhancement failed", error, { file: filePath });
      return result; // Return original result if enhancement fails
    } finally {
      checkpoint.complete();
    }
  }

  private async analyzeControlFlow(
    result: CppParseResult,
    content: string
  ): Promise<{ blocks: any[]; calls: any[] }> {
    const controlFlowData: { blocks: any[]; calls: any[] } = { blocks: [], calls: [] };

    try {
      const functions = result.symbols.filter(
        (s) =>
          s.kind === CppSymbolKind.FUNCTION ||
          s.kind === CppSymbolKind.METHOD ||
          s.kind === CppSymbolKind.CONSTRUCTOR ||
          s.kind === CppSymbolKind.DESTRUCTOR
      );

      for (const func of functions) {
        if (func.complexity && func.complexity >= 2) {
          // Create a temporary symbol object for the unified analyzer
          // Since symbols aren't stored in DB yet, we use a fake ID

          // Store the symbol temporarily in DB for analysis  
          const insertResult = (this.db as Database)
            .prepare(
              `
            INSERT INTO universal_symbols (name, qualified_name, kind, file_path, line, column, end_line, end_column, project_id, language_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
          `
            )
            .run(
              func.name,
              func.qualifiedName || func.name,
              func.kind,
              func.filePath,
              func.line,
              func.column || 1,
              func.endLine || func.line,
              func.endColumn || func.column || 1
            );

          const symbolId = insertResult.lastInsertRowid as number;

          try {
            // Use the unified control flow analyzer with the temporary DB symbol
            // Create a mock function node for the C++ analyzer
            const mockFunctionNode = {
              type: 'function_definition',
              startPosition: { row: func.line - 1, column: 0 },
              endPosition: { row: (func.endLine || func.line) - 1, column: 0 },
              children: [],
              childCount: 0,
              text: func.name
            } as any;
            
            // Create a temporary context for the analyzer
            const analysisContext = this.createCppContext(func.filePath || "", content);
            
            const analysisResult = await this.controlFlowAnalyzer.analyzeFunction(
              mockFunctionNode,
              func,
              analysisContext
            );

            controlFlowData.blocks.push(...analysisResult.blocks.map(b => ({ ...b })));
            controlFlowData.calls.push(...analysisResult.calls.map(c => ({ ...c })));
          } finally {
            // Clean up the temporary symbol
            (this.db as Database)
              .prepare("DELETE FROM universal_symbols WHERE id = ?")
              .run(symbolId);
          }
        }
      }
    } catch (error) {
      this.logger.error("Control flow analysis failed", error);
    }

    return controlFlowData;
  }

  private async analyzeComplexity(
    result: CppParseResult,
    filePath: string,
    content: string
  ): Promise<FileComplexityMetrics> {
    try {
      return await this.complexityAnalyzer.analyzeFileComplexity(
        filePath,
        content,
        result.symbols
      );
    } catch (error) {
      this.logger.error("Complexity analysis failed", error, {
        file: filePath,
      });
      throw error;
    }
  }

  private async detectAdditionalPatterns(
    result: CppParseResult
  ): Promise<PatternInfo[]> {
    const patterns: PatternInfo[] = [];

    try {
      // Detect RAII patterns
      const raiiClasses = result.symbols.filter(
        (s) => s.kind === CppSymbolKind.CLASS && s.languageFeatures?.isRAII
      );

      for (const cls of raiiClasses) {
        patterns.push({
          patternType: "raii",
          patternName: "Resource Acquisition Is Initialization",
          confidence: 0.8,
          details: { className: cls.qualifiedName },
        });
      }

      // Detect Singleton patterns
      const singletonCandidates = result.symbols.filter(
        (s) =>
          s.kind === CppSymbolKind.CLASS &&
          result.symbols.some(
            (constructor) =>
              constructor.kind === CppSymbolKind.CONSTRUCTOR &&
              constructor.parentScope === s.qualifiedName &&
              constructor.visibility === "private"
          )
      );

      for (const singleton of singletonCandidates) {
        patterns.push({
          patternType: "singleton",
          patternName: "Singleton Pattern",
          confidence: 0.7,
          details: { className: singleton.qualifiedName },
        });
      }
    } catch (error) {
      this.logger.error("Additional pattern detection failed", error);
    }

    return patterns;
  }

  // Worker pool methods

  private async parseFilesWithWorkerPool(
    files: Array<{ filePath: string; content: string }>
  ): Promise<Map<string, ParseResult | Error>> {
    if (!this.workerPool) {
      throw new Error("Worker pool not initialized");
    }

    const workItems = files.map((file) => ({
      filePath: file.filePath,
      content: file.content,
      options: this.options.cppOptions,
      priority: 0,
    }));

    const results = await this.workerPool.processFiles(workItems);
    const convertedResults = new Map<string, ParseResult | Error>();

    for (const [filePath, result] of results) {
      if (result instanceof Error) {
        convertedResults.set(filePath, result);
      } else {
        convertedResults.set(filePath, this.convertToLegacyResult(result));
      }
    }

    return convertedResults;
  }

  private async parseFilesSequentially(
    files: Array<{ filePath: string; content: string }>
  ): Promise<Map<string, ParseResult | Error>> {
    const results = new Map<string, ParseResult | Error>();

    for (const file of files) {
      try {
        const result = await this.parseFile(file.filePath, file.content);
        results.set(file.filePath, result);
      } catch (error) {
        results.set(file.filePath, error as Error);
      }
    }

    return results;
  }

  // Initialization methods

  private async initializeTreeSitter(): Promise<void> {
    try {
      let cppLanguage;
      try {
        cppLanguage = require("tree-sitter-cpp");
      } catch (e1: any) {
        try {
          const module = await import("tree-sitter-cpp");
          cppLanguage = module.default || module;
        } catch (e2: any) {
          throw new Error(
            `All import strategies failed: ${e1.message}, ${e2.message}`
          );
        }
      }

      if (cppLanguage && this.parser) {
        this.parser.setLanguage(cppLanguage);
        this.useTreeSitter = true;
        this.logger.info("Successfully loaded tree-sitter-cpp");
        return;
      } else {
        throw new Error("Language or parser is null after loading");
      }
    } catch (error) {
      this.logger.warn(
        "Failed to load tree-sitter-cpp, using pattern-based parsing",
        error
      );
      this.useTreeSitter = false;
    }
  }

  private async initializeWorkerPool(): Promise<void> {
    if (!this.options.enableMultithreading) {
      return;
    }

    try {
      this.workerPool = new CppWorkerPool(this.options.workerPoolOptions);
      await this.workerPool.initialize();

      this.logger.info("Worker pool initialized", {
        maxWorkers: this.workerPool.getStats().totalWorkers,
      });
    } catch (error) {
      this.logger.error("Worker pool initialization failed", error);
      // Continue without worker pool
      this.workerPool = undefined;
    }
  }

  // Visitor methods (delegates to helper classes)

  protected createVisitorHandlers(): VisitorHandlers {
    return {
      // Symbol handlers
      onClass: (node, ctx) =>
        this.symbolHandlers.handleClass(node, ctx as CppVisitorContext),
      onFunction: (node, ctx) =>
        this.symbolHandlers.handleFunction(node, ctx as CppVisitorContext),
      onNamespace: (node, ctx) =>
        this.symbolHandlers.handleNamespace(node, ctx as CppVisitorContext),
      onVariable: (node, ctx) =>
        this.symbolHandlers.handleVariable(node, ctx as CppVisitorContext),
      onEnum: (node, ctx) =>
        this.symbolHandlers.handleEnum(node, ctx as CppVisitorContext),
      onTypedef: (node, ctx) =>
        this.symbolHandlers.handleTypedef(node, ctx as CppVisitorContext),

      // Relationship handlers
      onCall: (node, ctx) => {
        const relationships = this.relationshipHandlers.handleCall(node, ctx as CppVisitorContext);
        if (relationships && relationships.length > 0) {
          // Add all relationships to context and return the first one
          relationships.slice(1).forEach((rel) => ctx.relationships.push(rel));
          return relationships[0];
        }
        return null;
      },
      onInheritance: (node, ctx) =>
        this.relationshipHandlers.handleInheritance(
          node,
          ctx as CppVisitorContext
        ),
      onImport: (node, ctx) => {
        const relationships = this.relationshipHandlers.handleImport(node, ctx as CppVisitorContext);
        if (relationships && relationships.length > 0) {
          // Add all relationships to context and return the first one
          relationships.slice(1).forEach((rel) => ctx.relationships.push(rel));
          return relationships[0];
        }
        return null;
      },
      onDeclaration: (node, ctx) => {
        const relationships = this.relationshipHandlers.handleDeclaration(
          node,
          ctx as CppVisitorContext
        );
        if (relationships.length > 0) {
          // Add all relationships to context and return the first one
          relationships.slice(1).forEach((rel) => ctx.relationships.push(rel));
          return relationships[0];
        }
        return null;
      },
      onTypeReference: (node, ctx) => {
        const relationships = this.relationshipHandlers.handleTypeReference(
          node,
          ctx as CppVisitorContext
        );
        if (relationships.length > 0) {
          // Add all relationships to context and return the first one
          relationships.slice(1).forEach((rel) => ctx.relationships.push(rel));
          return relationships[0];
        }
        return null;
      },

      // Pattern handlers - integrated into other handlers
      onPattern: () => null,
      onTemplate: () => null,

      // Scope handlers - handled by the visitor automatically
      onEnterScope: () => {},
      onExitScope: () => {},
    };
  }

  protected getNodeTypeMap(): Map<string, keyof VisitorHandlers> {
    return new Map([
      // Classes and structs
      ["class_specifier", "onClass"],
      ["struct_specifier", "onClass"],

      // Functions - Only function_definition exists in tree-sitter-cpp
      ["function_definition", "onFunction"],

      // Namespaces
      ["namespace_definition", "onNamespace"],

      // Variables and fields
      ["field_declaration", "onVariable"],
      ["parameter_declaration", "onVariable"],
      ["declaration", "onVariable"],

      // Type definitions
      ["enum_specifier", "onEnum"],
      ["type_definition", "onTypedef"],
      ["alias_declaration", "onTypedef"],

      // Relationships
      ["call_expression", "onCall"],
      ["base_class_clause", "onInheritance"],
      ["preproc_include", "onImport"],
      ["type_identifier", "onTypeReference"],
      ["qualified_identifier", "onTypeReference"],

      // Patterns
      ["template_declaration", "onTemplate"],
      ["lambda_expression", "onPattern"],
    ]);
  }

  // Helper methods

  private createCppContext(
    filePath: string,
    content: string
  ): CppVisitorContext {
    return {
      filePath,
      content,
      symbols: new Map(),
      relationships: [],
      patterns: [],
      controlFlowData: { blocks: [], calls: [] },
      scopeStack: [],
      stats: {
        nodesVisited: 0,
        symbolsExtracted: 0,
        complexityChecks: 0,
        controlFlowAnalyzed: 0,
      },
      templateDepth: 0,
      insideExportBlock: false,
      currentAccessLevel: "public",
      usingDeclarations: new Map(),
      resolutionContext: {
        currentFile: filePath,
        currentNamespace: undefined,
        importedNamespaces: new Set(),
        typeAliases: new Map(),
      },
      accessLevels: new Map(),
    };
  }

  private convertVisitorResultToCppResult(
    result: any,
    context: CppVisitorContext
  ): CppParseResult {
    return {
      symbols: Array.from(context.symbols.values()),
      relationships: context.relationships,
      patterns: context.patterns,
      controlFlowData: context.controlFlowData,
      stats: context.stats,
    };
  }

  private convertToLegacyResult(cppResult: CppParseResult): ParseResult {
    return {
      symbols: cppResult.symbols,
      relationships: cppResult.relationships,
      patterns: cppResult.patterns,
      controlFlowData: cppResult.controlFlowData,
      stats: cppResult.stats,
    };
  }


  /**
   * Pattern-based extraction fallback for large files
   */
  protected async performPatternBasedExtraction(
    content: string,
    filePath: string
  ): Promise<{
    symbols: SymbolInfo[];
    relationships: RelationshipInfo[];
    patterns: PatternInfo[];  
    controlFlowData: { blocks: any[]; calls: any[] };
    stats: any;
  }> {
    const context = this.createCppContext(filePath, content);
    return await this.patternAnalyzer.analyzeCode(content, filePath, context);
  }

  // Statistics and monitoring
  getParserStats() {
    const baseStats = {
      useTreeSitter: this.useTreeSitter,
      cacheSize:
        RefactoredOptimizedCppTreeSitterParser.symbolCache.getStatistics().size,
    };

    if (this.workerPool) {
      return {
        ...baseStats,
        workerPool: this.workerPool.getStats(),
      };
    }

    return baseStats;
  }
}
