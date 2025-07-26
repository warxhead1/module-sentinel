/**
 * Optimized Base Parser for Tree-Sitter
 *
 * Foundation for all language-specific parsers with optimizations:
 * 1. Parser instance pooling to avoid recreation overhead
 * 2. Unified AST visitor pattern for single-pass extraction
 * 3. Selective control flow analysis based on complexity
 * 4. Batch database operations
 * 5. Pattern-based fallback for large files
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { UnifiedASTVisitor } from "../unified-ast-visitor.js";
import { VisitorHandlers } from "../unified-ast-visitor.js";
import {
  SymbolInfo,
  RelationshipInfo,
  PatternInfo,
  ParseOptions,
  ParseResult,
} from "./parser-types.js";
import { SemanticOrchestrator } from "../../analysis/semantic-orchestrator.js";
import { MemoryMonitor, MemoryCheckpoint } from "../../utils/memory-monitor.js";
import { createLogger } from "../../utils/logger.js";

export abstract class OptimizedTreeSitterBaseParser {
  protected parser: Parser;
  protected db: Database;
  protected drizzleDb: ReturnType<typeof drizzle>;
  protected visitor: UnifiedASTVisitor;
  protected options: ParseOptions;
  protected debugMode: boolean = false;
  protected semanticOrchestrator?: SemanticOrchestrator;
  protected memoryMonitor: MemoryMonitor;
  protected logger = createLogger('OptimizedTreeSitterBaseParser');

  // Parser instance pool for reuse
  private static parserPool = new Map<string, Parser>();

  // Cache for parsed files (with TTL)
  private static parseCache = new Map<
    string,
    {
      symbols: SymbolInfo[];
      relationships: RelationshipInfo[];
      patterns: PatternInfo[];
      controlFlowData: any;
      timestamp: number;
      fileHash?: string;
    }
  >();

  // Dynamic cache TTL based on strategy
  private getCacheTTL(): number {
    switch (this.options.cacheStrategy) {
      case "aggressive":
        return 30 * 60 * 1000; // 30 minutes
      case "minimal":
        return 60 * 1000; // 1 minute
      default:
        return 5 * 60 * 1000; // 5 minutes (moderate)
    }
  }

  constructor(db: Database, options: ParseOptions) {
    this.db = db;
    this.drizzleDb = drizzle(db);
    this.options = options;
    this.debugMode = options.debugMode || false;
    
    // Initialize memory monitor with custom thresholds for parsers
    this.memoryMonitor = new MemoryMonitor({
      warningPercent: 60,
      criticalPercent: 80,
      maxHeapMB: 1536 // 1.5GB for parser operations
    });

    // Get or create parser instance
    const parserKey = this.constructor.name;
    let parser = OptimizedTreeSitterBaseParser.parserPool.get(parserKey);
    if (!parser) {
      parser = new Parser();
      OptimizedTreeSitterBaseParser.parserPool.set(parserKey, parser);
    }
    this.parser = parser;

    // Create visitor with handlers
    this.visitor = new UnifiedASTVisitor(
      this.createVisitorHandlers(),
      this.getNodeTypeMap()
    );

    // Initialize semantic intelligence orchestrator only if enabled
    if (this.options.enableSemanticAnalysis) {
      this.semanticOrchestrator = new SemanticOrchestrator(db, {
        debugMode: this.debugMode,
        embeddingDimensions: 256,
      });
    }
  }

  /**
   * Initialize the parser with language grammar
   */
  abstract initialize(): Promise<void>;

  /**
   * Create visitor handlers for this language
   */
  protected abstract createVisitorHandlers(): VisitorHandlers;

  /**
   * Map node types to visitor handler methods
   */
  protected abstract getNodeTypeMap(): Map<string, keyof VisitorHandlers>;

  /**
   * Pattern-based extraction fallback for large files
   */
  protected abstract performPatternBasedExtraction(
    content: string,
    filePath: string
  ): Promise<{
    symbols: SymbolInfo[];
    relationships: RelationshipInfo[];
    patterns: PatternInfo[];
    controlFlowData: { blocks: any[]; calls: any[] };
    stats: any;
  }>;

  /**
   * Main parsing method with caching and optimizations
   */
  async parseFile(filePath: string, content: string): Promise<ParseResult> {
    const startTime = Date.now();
    
    // Create memory checkpoint for this file
    const memoryCheckpoint = this.memoryMonitor.createCheckpoint(`parse:${filePath}`);
    
    // Check memory before processing
    const memStats = this.memoryMonitor.checkMemory();
    if (memStats.percentUsed > 80) {
      this.logger.warn('High memory usage before parsing', {
        file: filePath,
        memoryPercent: memStats.percentUsed
      });
    }

    // Check cache first
    const cached = this.getCachedParse(filePath);
    if (cached) {
      this.debug(`Cache hit for ${filePath}`);
      await this.storeParsedData(filePath, cached);
      // Complete the memory checkpoint even for cached results
      memoryCheckpoint.complete();
      return cached as ParseResult;
    }

    let result;
    let tree: Parser.Tree | undefined;
    let parseMethod: "tree-sitter" | "pattern-fallback" | "pattern-supplement" =
      "tree-sitter";
    const parseErrors: string[] = [];

    // Always try tree-sitter first (it's faster and more accurate)
    try {
      this.debug(`Parsing AST for ${filePath}...`);

      // Check if parser is properly initialized
      if (!this.parser || !this.parser.getLanguage()) {
        throw new Error(
          "Parser not properly initialized - missing language grammar"
        );
      }

      tree = this.parser.parse(content);

      // Validate tree parsing
      if (!tree || tree.rootNode.hasError) {
        const errorCount = this.countTreeErrors(tree?.rootNode);
        parseErrors.push(`Tree contains ${errorCount} syntax errors`);
        console.warn(
          `⚠️ Tree-sitter parsing detected ${errorCount} syntax errors in ${filePath}`
        );
      }

      this.debug(`Traversing AST for ${filePath}...`);
      result = await this.visitor.traverse(tree, filePath, content);
      this.debug(
        `AST traversal completed for ${filePath} - found ${result.symbols.length} symbols`
      );

      // If tree-sitter found very few symbols, supplement with pattern-based analysis
      if (result.symbols.length < 3 && content.length > 1000) {
        parseErrors.push(
          `Only found ${result.symbols.length} symbols for ${content.length} bytes of content`
        );
        console.warn(
          `⚠️ Tree-sitter found only ${result.symbols.length} symbols in ${filePath}, supplementing with patterns`
        );

        const patternResult = await this.performPatternBasedExtraction(
          content,
          filePath
        );

        // Merge results if pattern-based found significantly more symbols
        if (patternResult.symbols.length > result.symbols.length * 2) {
          console.warn(
            `⚠️ Pattern parser found ${patternResult.symbols.length} symbols vs tree-sitter's ${result.symbols.length}, using pattern results for ${filePath}`
          );
          result = patternResult;
          tree = undefined; // Clear tree since we're using pattern results that don't match AST
          parseMethod = "pattern-supplement";
          parseErrors.push(
            `Pattern extraction found ${patternResult.symbols.length} symbols vs tree-sitter's ${result.symbols.length}`
          );
        }
      }
    } catch (error) {
      parseMethod = "pattern-fallback";
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      parseErrors.push(`Tree-sitter parsing failed: ${errorMessage}`);
      console.error(
        `❌ Tree-sitter parsing failed for ${filePath}, falling back to patterns:`,
        error
      );

      result = await this.performPatternBasedExtraction(content, filePath);
      tree = undefined; // Clear tree since pattern extraction doesn't use AST
    }

    // Add parse metadata to result
    (result as any).parseMethod = parseMethod;
    (result as any).parseErrors = parseErrors;

    // Apply semantic intelligence if enabled and we have both symbols AND a valid AST
    // Only process semantic intelligence when tree-sitter parsing succeeded
    if (
      this.options.enableSemanticAnalysis &&
      this.semanticOrchestrator &&
      tree &&
      result.symbols.length > 0
    ) {
      try {
        this.debug(
          `Starting semantic analysis with tree-sitter AST and ${result.symbols.length} symbols`
        );

        // Add timeout for semantic analysis
        const semanticTimeout = this.options.semanticAnalysisTimeout || 10000; // 10 seconds default
        const semanticPromise = this.semanticOrchestrator.processSymbols(
          result.symbols,
          result.relationships,
          tree!, // Pass valid tree from tree-sitter parsing
          content,
          filePath,
          {
            enableContextExtraction: true,
            enableEmbeddingGeneration: true, // Enable embeddings
            enableClustering: true, // Enable clustering
            enableInsightGeneration: true, // Enable insights
            debugMode: this.debugMode,
          }
        );

        const semanticResult = await Promise.race([
          semanticPromise,
          new Promise<any>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Semantic analysis timeout after ${semanticTimeout}ms`
                  )
                ),
              semanticTimeout
            )
          ),
        ]);

        // Enhance the result with semantic intelligence data
        (result as any).semanticIntelligence = semanticResult;

        this.debug(
          `Semantic analysis completed: ${semanticResult.stats.contextsExtracted} contexts, ${semanticResult.stats.embeddingsGenerated} embeddings, ${semanticResult.stats.clustersCreated} clusters, ${semanticResult.stats.insightsGenerated} insights`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        parseErrors.push(`Semantic analysis failed: ${errorMsg}`);
        this.logger.warn('Semantic analysis failed', {
          file: filePath,
          error: errorMsg
        });
        // Continue without semantic analysis
      }
    }

    // Clean up the tree to free memory
    // Note: tree-sitter trees are garbage collected automatically
    tree = undefined;

    // Cache the result
    this.setCachedParse(filePath, result);

    // Store in database - NOT NEEDED, UniversalIndexer handles this
    // await this.storeParsedData(filePath, result);

    const duration = Date.now() - startTime;
    this.debug(`Parsed ${filePath} in ${duration}ms`);
    
    // Complete memory checkpoint
    const memoryUsage = memoryCheckpoint.complete();
    
    // If file used significant memory, suggest clearing cache
    if (memoryUsage.memoryDelta > 100 * 1024 * 1024) { // 100MB
      this.logger.warn('Large file parsed - consider memory optimization', {
        file: filePath,
        memoryUsed: `${(memoryUsage.memoryDelta / 1024 / 1024).toFixed(2)} MB`,
        parseTime: duration
      });
      
      // Clear old cache entries if memory is high
      const currentMemory = this.memoryMonitor.checkMemory();
      if (currentMemory.percentUsed > 70) {
        this.clearOldCacheEntries();
      }
    }

    // Return the result
    return result as ParseResult;
  }

  /**
   * Store parsed data in database with batch operations
   */
  protected async storeParsedData(
    _filePath: string,
    _data: any
  ): Promise<void> {
    // IMPORTANT: Parser should NOT write to database directly
    // The UniversalIndexer is responsible for all database operations
    // This prevents transaction conflicts and maintains clean architecture
    // All database operations are handled by UniversalIndexer.storeSymbols()
  }

  /**
   * Get cached parse result if available
   */
  protected getCachedParse(filePath: string): any | null {
    // Disable cache during indexing to save memory
    if (this.options.cacheStrategy === 'minimal' || process.env.NODE_ENV === 'test') {
      return null;
    }
    
    const cached = OptimizedTreeSitterBaseParser.parseCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.getCacheTTL()) {
      return cached;
    }
    // Remove expired entry
    if (cached) {
      OptimizedTreeSitterBaseParser.parseCache.delete(filePath);
    }
    return null;
  }

  /**
   * Clear old cache entries to free memory
   */
  protected clearOldCacheEntries(): void {
    const cache = OptimizedTreeSitterBaseParser.parseCache;
    const now = Date.now();
    const ttl = this.getCacheTTL();
    let cleared = 0;
    
    for (const [path, entry] of cache.entries()) {
      if (now - entry.timestamp > ttl) {
        cache.delete(path);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      this.logger.info('Cleared old cache entries', { count: cleared });
    }
  }

  /**
   * Cache parse result
   */
  protected setCachedParse(filePath: string, data: any): void {
    // Calculate cache size limit based on strategy
    const maxCacheSize =
      this.options.cacheStrategy === "aggressive"
        ? 500
        : this.options.cacheStrategy === "minimal"
        ? 20
        : 100;

    OptimizedTreeSitterBaseParser.parseCache.set(filePath, {
      ...data,
      timestamp: Date.now(),
    });

    // Limit cache size with LRU eviction
    if (OptimizedTreeSitterBaseParser.parseCache.size > maxCacheSize) {
      // Find and remove oldest entries (10% of cache)
      const entriesToRemove = Math.ceil(maxCacheSize * 0.1);
      const entries = Array.from(
        OptimizedTreeSitterBaseParser.parseCache.entries()
      )
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entriesToRemove);

      for (const [key] of entries) {
        OptimizedTreeSitterBaseParser.parseCache.delete(key);
      }
    }
  }

  /**
   * Count syntax errors in the tree
   */
  protected countTreeErrors(node: Parser.SyntaxNode | undefined): number {
    if (!node) return 0;

    let errorCount = 0;
    const traverse = (n: Parser.SyntaxNode) => {
      if (n.type === "ERROR" || n.isMissing) {
        errorCount++;
      }
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) traverse(child);
      }
    };

    traverse(node);
    return errorCount;
  }

  /**
   * Debug logging
   */
  protected debug(message: string): void {}

  /**
   * Clear all caches
   */
  static clearAllCaches(): void {
    OptimizedTreeSitterBaseParser.parseCache.clear();
    console.log("🧹 Cleared parser caches");
  }

  /**
   * Log performance summary
   */
  static logPerformanceSummary(): void {
    const cacheSize = OptimizedTreeSitterBaseParser.parseCache.size;

    console.log(
      `   Parser instances: ${OptimizedTreeSitterBaseParser.parserPool.size}`
    );
  }
}
