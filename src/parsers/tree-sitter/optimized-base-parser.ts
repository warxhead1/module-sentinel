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

import Parser from 'tree-sitter';
import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../database/drizzle/db.js';
import { 
  universalSymbols, 
  controlFlowBlocks,
  symbolCalls
} from '../../database/drizzle/schema.js';
import { UnifiedASTVisitor } from '../unified-ast-visitor.js';
import { VisitorHandlers } from '../unified-ast-visitor.js';
import { SymbolInfo, RelationshipInfo, PatternInfo, ParseOptions, ParseResult } from './parser-types.js';
import { SemanticIntelligenceOrchestrator, SemanticIntelligenceResult } from '../../analysis/semantic-intelligence-orchestrator.js';

export abstract class OptimizedTreeSitterBaseParser {
  protected parser: Parser;
  protected db: Database;
  protected drizzleDb: ReturnType<typeof drizzle>;
  protected visitor: UnifiedASTVisitor;
  protected options: ParseOptions;
  protected debugMode: boolean = false;
  protected semanticOrchestrator: SemanticIntelligenceOrchestrator;
  
  // Parser instance pool for reuse
  private static parserPool = new Map<string, Parser>();
  
  // Cache for parsed files (with TTL)
  private static parseCache = new Map<string, {
    symbols: SymbolInfo[];
    relationships: RelationshipInfo[];
    patterns: PatternInfo[];
    controlFlowData: any;
    timestamp: number;
  }>();
  
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  constructor(db: Database, options: ParseOptions) {
    this.db = db;
    this.drizzleDb = drizzle(db);
    this.options = options;
    this.debugMode = options.debugMode || false;
    
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
    
    // Initialize semantic intelligence orchestrator
    this.semanticOrchestrator = new SemanticIntelligenceOrchestrator(db, {
      debugMode: this.debugMode,
      embeddingDimensions: 256
    });
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
    
    // Check cache first
    const cached = this.getCachedParse(filePath);
    if (cached) {
      this.debug(`Cache hit for ${filePath}`);
      await this.storeParsedData(filePath, cached);
      return cached as ParseResult;
    }
    
    let result;
    let tree: Parser.Tree | undefined;
    
    // Always try tree-sitter first (it's faster and more accurate)
    try {
      this.debug(`Parsing AST for ${filePath}...`);
      tree = this.parser.parse(content);
      this.debug(`Traversing AST for ${filePath}...`);
      result = await this.visitor.traverse(tree, filePath, content);
      this.debug(`AST traversal completed for ${filePath}`);
      
      // If tree-sitter found very few symbols, supplement with pattern-based analysis
      if (result.symbols.length < 3 && content.length > 1000) {
        this.debug(`Tree-sitter found only ${result.symbols.length} symbols, supplementing with patterns`);
        const patternResult = await this.performPatternBasedExtraction(content, filePath);
        
        // Merge results if pattern-based found significantly more symbols
        if (patternResult.symbols.length > result.symbols.length * 2) {
          this.debug(`Pattern parser found ${patternResult.symbols.length} symbols vs tree-sitter's ${result.symbols.length}, using pattern results`);
          result = patternResult;
        }
      }
    } catch (error) {
      this.debug(`Tree-sitter parsing failed, falling back to patterns: ${error}`);
      result = await this.performPatternBasedExtraction(content, filePath);
    }
    
    // Apply semantic intelligence if enabled and we have both symbols AND a valid AST
    // Only process semantic intelligence when tree-sitter parsing succeeded
    if (this.options.enableSemanticAnalysis && tree && result.symbols.length > 0) {
      try {
        this.debug(`Starting semantic analysis with tree-sitter AST and ${result.symbols.length} symbols`);
        
        const semanticResult = await this.semanticOrchestrator.processSymbols(
          result.symbols,
          result.relationships,
          tree!, // Pass valid tree from tree-sitter parsing
          content,
          filePath,
          {
            enableContextExtraction: true,
            enableEmbeddingGeneration: true,
            enableClustering: true,
            enableInsightGeneration: true,
            debugMode: this.debugMode
          }
        );
        
        // Enhance the result with semantic intelligence data
        (result as any).semanticIntelligence = semanticResult;
        
        this.debug(`Semantic analysis completed: ${semanticResult.stats.contextsExtracted} contexts, ${semanticResult.stats.embeddingsGenerated} embeddings, ${semanticResult.stats.clustersCreated} clusters, ${semanticResult.stats.insightsGenerated} insights`);
        
      } catch (error) {
        this.debug(`Semantic analysis failed: ${error}`);
        // Continue without semantic analysis
      }
    }
    
    // Cache the result
    this.setCachedParse(filePath, result);
    
    // Store in database - NOT NEEDED, UniversalIndexer handles this
    // await this.storeParsedData(filePath, result);
    
    const duration = Date.now() - startTime;
    this.debug(`Parsed ${filePath} in ${duration}ms`);
    
    // Return the result
    return result as ParseResult;
  }
  
  /**
   * Store parsed data in database with batch operations
   */
  protected async storeParsedData(filePath: string, data: any): Promise<void> {
    console.log(`[DEBUG] storeParsedData called for ${filePath} - SKIPPING DB WRITES`);
    const { symbols, relationships, patterns, controlFlowData } = data;
    
    console.log(`[DEBUG] Extracted data properties: symbols=${symbols?.length || 0}, relationships=${relationships?.length || 0}`);
    this.debug(`Storing data for ${filePath}: ${symbols?.length || 0} symbols, ${relationships?.length || 0} relationships`);
    
    // IMPORTANT: Parser should NOT write to database directly
    // The UniversalIndexer is responsible for all database operations
    // This prevents transaction conflicts and maintains clean architecture
    console.log(`[DEBUG] Parser database writes disabled - returning without DB operations`);
    return;
    
    try {
      // Get project ID (assuming it's set in options or environment)
      const projectId = this.options.projectId || 1;
      const languageId = this.options.languageId || 1; // Get language ID from options
      
      // Batch insert symbols
      if (symbols && symbols.length > 0) {
        const symbolRecords = symbols.map((symbol: SymbolInfo) => ({
          projectId,
          languageId,
          name: symbol.name,
          qualifiedName: symbol.qualifiedName,
          kind: symbol.kind,
          filePath,
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
        
        // Use onConflictDoNothing to handle duplicate symbols
        this.debug(`Inserting ${symbolRecords.length} symbols for ${filePath}...`);
        await this.drizzleDb.insert(universalSymbols)
          .values(symbolRecords)
          .onConflictDoNothing();
        this.debug(`Symbol insertion completed for ${filePath}`);
        
        // Parent resolution will be done after symbol map is populated below
      }
      
      // Get symbol IDs for relationships and control flow
      const symbolMap = new Map<string, number>();
      if (symbols.length > 0) {
        const insertedSymbols = await this.drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.filePath, filePath));
        
        for (const sym of insertedSymbols) {
          symbolMap.set(sym.qualifiedName, sym.id);
        }
      }
      
      // NOTE: Relationships are stored by UniversalIndexer after all symbols are parsed
      // Individual parsers only collect relationship info, they don't store them
      // This prevents cross-language relationship resolution issues
      
      // Store control flow data
      if (controlFlowData && controlFlowData.blocks && controlFlowData.blocks.length > 0) {
        const blockRecords = controlFlowData.blocks.map((block: any) => {
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
        }).filter(Boolean);
        
        if (blockRecords.length > 0) {
          await this.drizzleDb.insert(controlFlowBlocks)
            .values(blockRecords);
        }
      }
      
      // Store function calls
      if (controlFlowData && controlFlowData.calls && controlFlowData.calls.length > 0) {
        const callRecords = controlFlowData.calls.map((call: any) => {
          const callerId = symbolMap.get(call.callerName);
          if (!callerId) return null;
          
          // Try to resolve the callee ID from the symbol map
          const calleeId = call.calleeName ? symbolMap.get(call.calleeName) : null;
          
          return {
            callerId,
            calleeId,
            projectId: this.options.projectId || 1,
            targetFunction: call.targetFunction || call.calleeName || call.functionName || call.target,
            lineNumber: call.lineNumber,
            columnNumber: call.columnNumber,
            callType: call.callType || 'direct',
            condition: call.condition || null,
            isConditional: call.isConditional ? 1 : 0,
            isRecursive: call.isRecursive ? 1 : 0
          };
        }).filter(Boolean);
        
        if (callRecords.length > 0) {
          await this.drizzleDb.insert(symbolCalls)
            .values(callRecords);
        }
      }
      
      // Store patterns - skip for now as universalPatterns table doesn't exist
      // TODO: Add pattern storage when table is created
      
      this.db.exec('COMMIT');
      this.debug(`Successfully stored data for ${filePath}`);
    } catch (error: any) {
      this.db.exec('ROLLBACK');
      this.debug(`Failed to store data for ${filePath}: ${error}`);
      console.error(`Database error storing ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Get cached parse result if available
   */
  protected getCachedParse(filePath: string): any | null {
    const cached = OptimizedTreeSitterBaseParser.parseCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < OptimizedTreeSitterBaseParser.CACHE_TTL) {
      return cached;
    }
    return null;
  }
  
  /**
   * Cache parse result
   */
  protected setCachedParse(filePath: string, data: any): void {
    OptimizedTreeSitterBaseParser.parseCache.set(filePath, {
      ...data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (OptimizedTreeSitterBaseParser.parseCache.size > 100) {
      const oldestKey = Array.from(OptimizedTreeSitterBaseParser.parseCache.keys())[0];
      OptimizedTreeSitterBaseParser.parseCache.delete(oldestKey);
    }
  }
  
  /**
   * Debug logging
   */
  protected debug(message: string): void {
    if (this.debugMode) {
      console.log(`[${this.constructor.name}] ${message}`);
    }
  }
  
  /**
   * Clear all caches
   */
  static clearAllCaches(): void {
    OptimizedTreeSitterBaseParser.parseCache.clear();
    console.log('🧹 Cleared parser caches');
  }
  
  /**
   * Log performance summary
   */
  static logPerformanceSummary(): void {
    const cacheSize = OptimizedTreeSitterBaseParser.parseCache.size;
    console.log(`\n📊 Parser Performance Summary:`);
    console.log(`   Cache entries: ${cacheSize}`);
    console.log(`   Parser instances: ${OptimizedTreeSitterBaseParser.parserPool.size}`);
  }
}