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
  universalRelationships,
  controlFlowBlocks,
  symbolCalls
} from '../../database/drizzle/schema.js';
import { UnifiedASTVisitor } from '../unified-ast-visitor.js';
import { VisitorHandlers } from '../unified-ast-visitor.js';
import { SymbolInfo, RelationshipInfo, PatternInfo, ParseOptions, ParseResult } from './parser-types.js';

export abstract class OptimizedTreeSitterBaseParser {
  protected parser: Parser;
  protected db: Database;
  protected drizzleDb: ReturnType<typeof drizzle>;
  protected visitor: UnifiedASTVisitor;
  protected options: ParseOptions;
  protected debugMode: boolean = false;
  
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
    
    // Use pattern-based parsing for large files
    if (content.length > 50 * 1024) { // 50KB threshold
      this.debug(`Using pattern-based parsing for large file: ${filePath}`);
      result = await this.performPatternBasedExtraction(content, filePath);
    } else {
      // Use tree-sitter for smaller files
      try {
        const tree = this.parser.parse(content);
        result = await this.visitor.traverse(tree, filePath, content);
      } catch (error) {
        this.debug(`Tree-sitter parsing failed, falling back to patterns: ${error}`);
        result = await this.performPatternBasedExtraction(content, filePath);
      }
    }
    
    // Cache the result
    this.setCachedParse(filePath, result);
    
    // Store in database
    await this.storeParsedData(filePath, result);
    
    const duration = Date.now() - startTime;
    this.debug(`Parsed ${filePath} in ${duration}ms`);
    
    // Return the result
    return result as ParseResult;
  }
  
  /**
   * Store parsed data in database with batch operations
   */
  protected async storeParsedData(filePath: string, data: any): Promise<void> {
    const { symbols, relationships, patterns, controlFlowData } = data;
    
    this.debug(`Storing data for ${filePath}: ${symbols?.length || 0} symbols, ${relationships?.length || 0} relationships`);
    
    // Start transaction for consistency
    this.db.exec('BEGIN');
    
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
        
        // Just insert symbols - no unique constraint exists for conflict resolution
        await this.drizzleDb.insert(universalSymbols)
          .values(symbolRecords);
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
      
      // Batch insert relationships
      if (relationships && relationships.length > 0) {
        const relationshipRecords = relationships.map((rel: RelationshipInfo) => ({
          projectId,
          fromSymbolId: symbolMap.get(rel.fromName) || null,
          toSymbolId: symbolMap.get(rel.toName) || null,
          type: rel.relationshipType, // Schema expects 'type' not 'relationshipType'
          confidence: rel.confidence || 1.0,
          contextLine: rel.lineNumber,
          contextColumn: rel.columnNumber || null,
          metadata: JSON.stringify({
            fromName: rel.fromName,
            toName: rel.toName,
            filePath,
            crossLanguage: rel.crossLanguage
          })
        }));
        
        await this.drizzleDb.insert(universalRelationships)
          .values(relationshipRecords);
      }
      
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
    } catch (error) {
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