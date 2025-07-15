import { ClangAstParser } from './clang-ast-parser.js';
import { EnhancedTreeSitterParser } from './enhanced-tree-sitter-parser.js';
import { GrammarAwareParser } from './grammar-aware-parser.js';
import { DatabaseAwareTreeSitterParser } from './database-aware-tree-sitter.js';
import { StreamingCppParser } from './streaming-cpp-parser.js';
import { EnhancedModuleInfo, MethodSignature, ClassInfo } from '../types/essential-features.js';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';
import { setupFileWatchingWithReindexing } from '../hooks/file-watcher.js';
import { KnowledgeBase } from '../services/knowledge-base.js'; // Import KnowledgeBase
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as crypto from 'crypto';
import { Worker } from 'worker_threads';
import * as os from 'os';

/**
 * Hybrid C++ Parser that combines multiple parsing strategies
 * 
 * Strategy:
 * 1. Try Clang AST for most accurate parsing (if available)
 * 2. Fall back to enhanced Tree-sitter for good performance
 * 3. Use streaming parser for very large files
 * 4. Merge results for best accuracy
 */
export class HybridCppParser {
  private clangParser?: ClangAstParser;
  private treeSitterParser: EnhancedTreeSitterParser;
  private grammarAwareParser: GrammarAwareParser;
  private dbAwareTreeSitterParser?: DatabaseAwareTreeSitterParser;
  private streamingParser: StreamingCppParser;
  private hasClang: boolean = false;
  private preservationDb?: Database.Database;
  private schemaManager: UnifiedSchemaManager;
  private knowledgeBase: KnowledgeBase; // New member
  private projectPath?: string;
  private workerPool: Worker[] = [];
  private workerQueue: Array<{ resolve: Function; reject: Function; filePath: string }> = [];
  private workerStatus = new Map<Worker, boolean>(); // true = busy, false = idle
  private maxWorkers = Math.min(os.cpus().length - 1, 8); // Leave one CPU for main thread
  private debugMode: boolean = false;
  
  constructor(debugMode: boolean = false, private enableFileWatching: boolean = true) {
    this.debugMode = debugMode || process.env.MODULE_SENTINEL_DEBUG === 'true';
    this.treeSitterParser = new EnhancedTreeSitterParser();
    this.grammarAwareParser = new GrammarAwareParser();
    this.streamingParser = new StreamingCppParser();
    this.schemaManager = UnifiedSchemaManager.getInstance();
    this.knowledgeBase = new KnowledgeBase(''); // Initialize with placeholder path
  }
  
  async initialize(projectPath: string): Promise<void> {
    // Initialize KnowledgeBase with projectPath
    this.knowledgeBase = new KnowledgeBase(projectPath);
    await this.knowledgeBase.initialize();
    this.projectPath = projectPath;

    // Initialize tree-sitter parsers (always available)
    await this.treeSitterParser.initialize();
    await this.grammarAwareParser.initialize();
    
    // Use shared database instead of creating a separate one
    const preservationDbPath = path.join(process.cwd(), 'module-sentinel.db'); // Use shared database
    await fs.mkdir(path.dirname(preservationDbPath), { recursive: true });
    this.preservationDb = new Database(preservationDbPath);
    this.schemaManager.initializeDatabase(this.preservationDb);
    
    // Initialize database-aware tree-sitter parser if we have a database
    if (this.preservationDb) {
      this.dbAwareTreeSitterParser = new DatabaseAwareTreeSitterParser(projectPath, preservationDbPath);
      await this.dbAwareTreeSitterParser.initialize();
    }
    
    // DISABLED: Clang is available but contributes 0 symbols and causes performance issues
    // Force clang to be unavailable
    if (false) { // try {
      const { exec } = await import('child_process');
      
      // Try clang++-19 first
      let clangPath = 'clang++-19';
      try {
        await new Promise((resolve, reject) => {
          exec('clang++-19 --version', (error) => {
            if (error) reject(error);
            else resolve(true);
          });
        });
      } catch {
        // Fall back to default clang++
        clangPath = 'clang++';
        await new Promise((resolve, reject) => {
          exec('clang++ --version', (error) => {
            if (error) reject(error);
            else resolve(true);
          });
        });
      }
      
      // this.clangParser = new ClangAstParser(clangPath);
      // await this.clangParser.detectIncludePaths(projectPath);
      // this.hasClang = true;
      // if (this.debugMode) console.log(`Clang AST parser available (${clangPath} with lightweight mode)`);
    } // catch {
      if (this.debugMode) console.log('🚀 Clang disabled - using enhanced Tree-sitter and Grammar-aware parsers');
    // }

    // Start progressive background re-indexing (only if file watching is enabled)
    if (this.enableFileWatching) {
      this.startProgressiveReindexing(projectPath);
      
      // Set up file save hooks for immediate re-indexing
      this.setupFileSaveHooks(projectPath);
    } else if (this.debugMode) {
      console.log('📋 File watching disabled - skipping progressive re-indexing and file save hooks');
    }
    
    // Initialize worker pool for parallel parsing
    await this.initializeWorkerPool();
  }

  /**
   * Start progressive background re-indexing system
   */
  private startProgressiveReindexing(projectPath: string): void {
    if (!this.preservationDb) return;

    this.schemaManager.scheduleProgressiveReindexing(
      this.preservationDb,
      projectPath,
      async (filePath: string) => {
        if (this.debugMode) console.log(`🔄 Background re-parsing ${filePath}`);
        
        // Check if file actually changed
        const changed = await this.schemaManager.hasFileChanged(this.preservationDb!, filePath);
        if (!changed) {
          if (this.debugMode) console.log(`⏭️  Skipping ${filePath} - no changes detected`);
          return;
        }
        
        // Re-parse the file with current strategy
        try {
          const result = await this.parseFile(filePath);
          if (this.debugMode) console.log(`Re-parsed ${filePath}: ${result.methods.length} methods, ${result.classes.length} classes`);
          // Store patterns and relationships in KnowledgeBase
          await this.knowledgeBase.storePatterns(filePath, result.patterns);
          await this.knowledgeBase.storeRelationships(filePath, result.relationships);
        } catch (error: unknown) {
          console.error(` Re-parsing failed for ${filePath}:`, error instanceof Error ? error.message : error);
          throw error;
        }
      }
    );

    if (this.debugMode) console.log('📋 Progressive re-indexing system started');
  }

  /**
   * Stop progressive re-indexing (cleanup)
   */
  stopProgressiveReindexing(): void {
    if (this.preservationDb) {
      this.schemaManager.stopProgressiveReindexing(this.preservationDb);
    }
    this.knowledgeBase.close(); // Close KnowledgeBase connection
    
    // Close database-aware tree-sitter parser if it exists
    if (this.dbAwareTreeSitterParser) {
      this.dbAwareTreeSitterParser.close();
    }
    
    // Terminate worker pool
    this.terminateWorkerPool();
  }

  /**
   * Get re-indexing statistics
   */
  getReindexingStats(): any {
    if (!this.preservationDb) return null;
    return this.schemaManager.getReindexingStats(this.preservationDb);
  }

  /**
   * Set up file save hooks for immediate re-indexing on file changes
   */
  private setupFileSaveHooks(projectPath: string): void {
    setupFileWatchingWithReindexing(projectPath, async (filePath: string) => {
      if (this.debugMode) console.log(`💾 File save detected: ${filePath}`);
      
      // Immediate re-parse on file save
      try {
        const result = await this.parseFile(filePath);
        if (this.debugMode) console.log(`⚡ Hot re-parsed ${filePath}: ${result.methods.length} methods, ${result.classes.length} classes`);
        // Store patterns and relationships in KnowledgeBase
        await this.knowledgeBase.storePatterns(filePath, result.patterns);
        await this.knowledgeBase.storeRelationships(filePath, result.relationships);
      } catch (error: unknown) {
        console.error(` Hot re-parsing failed for ${filePath}:`, error instanceof Error ? error.message : error);
      }
    });

    if (this.debugMode) console.log('💾 File save hooks enabled for immediate re-indexing');
  }
  
  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    const stats = await fs.stat(filePath);
    
    // For very large files, use two-pass approach: streaming + background deep analysis
    if (stats.size > 500 * 1024) { // 500KB
      if (this.debugMode) console.log(`Using two-pass approach for large file: ${filePath} (${Math.round(stats.size / 1024)}KB)`);
      return this.parseWithTwoPass(filePath);
    }
    
    // Try Clang first if available (now with automatic lightweight mode)
    if (this.hasClang && this.clangParser) {
      const parseStartTime = Date.now();
      try {
        const result = await this.clangParser.parseFile(filePath);
        
        // Enhance with tree-sitter pattern detection and relationships
        const treeSitterResult = await this.treeSitterParser.parseFile(filePath);
        result.patterns = treeSitterResult.patterns;
        result.relationships = treeSitterResult.relationships;
        
        // Store successful parse for preservation
        await this.storeParseData(filePath, result, 'clang');
        
        // Store patterns and relationships in KnowledgeBase
        await this.knowledgeBase.storePatterns(filePath, result.patterns);
        await this.knowledgeBase.storeRelationships(filePath, result.relationships);
        
        // Track parser metrics in unified database
        if (this.preservationDb) {
          const parseEndTime = Date.now();
          this.schemaManager.storeParserMetrics(this.preservationDb, 'clang', filePath, {
            symbolsDetected: result.methods.length + result.classes.length,
            confidence: 1.0, // Clang has highest confidence
            semanticCoverage: this.calculateSemanticCoverage(result),
            parseTimeMs: parseEndTime - parseStartTime,
            success: true
          });
        }

        return result;
      } catch (error: unknown) {
        if (this.debugMode) console.log(`Clang parsing failed for ${filePath}: ${error instanceof Error ? error.message : error}`);
        
        // Track failed parsing attempt
        if (this.preservationDb) {
          this.schemaManager.storeParserMetrics(this.preservationDb, 'clang', filePath, {
            symbolsDetected: 0,
            confidence: 0,
            semanticCoverage: 0,
            parseTimeMs: Date.now() - parseStartTime,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        // Check if we have previous successful parse data to preserve
        const preservedData = await this.getPreservedParseData(filePath);
        if (preservedData) {
          if (this.debugMode) console.log(`Using preserved data for ${filePath} from previous successful parse`);
          
          // Enhance preserved data with fresh tree-sitter patterns and relationships
          try {
            const treeSitterResult = await this.treeSitterParser.parseFile(filePath);
            preservedData.patterns = treeSitterResult.patterns;
            preservedData.relationships = treeSitterResult.relationships;
            return preservedData;
          } catch (tsError) {
            if (this.debugMode) console.log(`Tree-sitter also failed, returning preserved data as-is`);
            return preservedData;
          }
        }
        
        if (this.debugMode) console.log(`No preserved data available, falling back to tree-sitter`);
      }
    }
    
    // Fall back to tree-sitter (prefer grammar-aware > database-aware > regular)
    const treeSitterStartTime = Date.now();
    try {
      let result: EnhancedModuleInfo;
      let parserType = 'tree-sitter';
      
      // Intelligent parser selection based on file characteristics
      const shouldUseGrammarAware = this.shouldUseGrammarAwareParser(filePath, stats);
      
      if (shouldUseGrammarAware) {
        try {
          if (this.debugMode) console.log(`Using grammar-aware parser for ${filePath}`);
          const grammarStartTime = Date.now();
          result = await this.grammarAwareParser.parseFile(filePath);
          parserType = 'grammar-aware-tree-sitter';
          if (this.debugMode) console.log(`Grammar-aware parsing took ${Date.now() - grammarStartTime}ms`);
        } catch (grammarError) {
          if (this.debugMode) console.log(`Grammar-aware parser failed, trying database-aware: ${grammarError}`);
          result = await this.fallbackToFasterParser(filePath);
          parserType = 'fallback-tree-sitter';
        }
      } else {
        if (this.debugMode) console.log(`Using fast parser for ${filePath} (${this.getFileSkipReason(filePath, stats)})`);
        result = await this.fallbackToFasterParser(filePath);
        parserType = 'fast-tree-sitter';
      }
      
      // Store tree-sitter result for preservation (lower confidence)
      await this.storeParseData(filePath, result, parserType);
      
      // Store patterns and relationships in KnowledgeBase
      await this.knowledgeBase.storePatterns(filePath, result.patterns);
      await this.knowledgeBase.storeRelationships(filePath, result.relationships);
      
      // Track parser metrics
      if (this.preservationDb) {
        const confidence = parserType === 'grammar-aware-tree-sitter' ? 0.95 : 
                          parserType === 'db-aware-tree-sitter' ? 0.85 : 0.8;
        this.schemaManager.storeParserMetrics(this.preservationDb, 'treesitter', filePath, {
          symbolsDetected: result.methods.length + result.classes.length,
          confidence: confidence,
          semanticCoverage: this.calculateSemanticCoverage(result),
          parseTimeMs: Date.now() - treeSitterStartTime,
          success: true
        });
      }

      return result;
    } catch (error: unknown) {
      if (this.debugMode) console.log(`Tree-sitter parsing failed for ${filePath}: ${error instanceof Error ? error.message : error}`);
      
      // Track failed tree-sitter attempt
      if (this.preservationDb) {
        this.schemaManager.storeParserMetrics(this.preservationDb, 'treesitter', filePath, {
          symbolsDetected: 0,
          confidence: 0,
          semanticCoverage: 0,
          parseTimeMs: Date.now() - treeSitterStartTime,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // If tree-sitter fails due to file size, fall back to streaming parser
      if (error instanceof Error && error.message.includes('File too large for tree-sitter')) {
        if (this.debugMode) console.log(`Falling back to streaming parser for large file: ${filePath}`);
        return this.parseWithStreaming(filePath);
      }
      
      throw error;
    }
  }
  
  /**
   * Two-pass approach for large files: streaming first, then background deep analysis
   */
  private async parseWithTwoPass(filePath: string): Promise<EnhancedModuleInfo> {
    // Pass 1: Quick streaming parse for immediate results
    const streamingResult = await this.parseWithStreaming(filePath);
    
    // Pass 2: Schedule background deep analysis if file is critical
    if (this.isCriticalFile(filePath)) {
      // Don't await - run in background
      this.scheduleDeepAnalysis(filePath, streamingResult);
    }
    
    // Return immediate streaming results
    return streamingResult;
  }

  private async parseWithStreaming(filePath: string): Promise<EnhancedModuleInfo> {
    const symbols = await this.streamingParser.parseFile(filePath);
    
    // Convert streaming parser results to enhanced format
    const result: EnhancedModuleInfo = {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods: [],  // Streaming parser doesn't extract detailed methods
      classes: Array.from(symbols.classes).map(c => ({
        name: c,
        namespace: undefined,
        baseClasses: [],
        interfaces: [],
        methods: [],
        members: [],
        isTemplate: false,
        location: { line: 0, column: 0 }
      })),
      interfaces: [],
      relationships: [],
      patterns: [],
      imports: Array.from(symbols.includes).map(inc => ({
        module: inc,
        symbols: [],
        isSystem: inc.startsWith('<'),
        location: { line: 0, column: 0 }
      })),
      exports: Array.from(symbols.exports).map(exp => ({
        symbol: exp,
        type: 'function' as const,
        location: { line: 0, column: 0 }
      }))
    };

    // Store streaming result for preservation (very low confidence)
    await this.storeParseData(filePath, result, 'streaming');
    
    // Store patterns and relationships in KnowledgeBase
    await this.knowledgeBase.storePatterns(filePath, result.patterns);
    await this.knowledgeBase.storeRelationships(filePath, result.relationships);

    return result;
  }

  /**
   * Determine if a file is critical enough to warrant deep analysis
   */
  private isCriticalFile(filePath: string): boolean {
    const criticalPatterns = [
      /\.(h|hpp|hxx)$/i,  // Header files are often critical
      /\.(ixx|cppm)$/i,   // Module interface files
      /\/include\//i,     // Files in include directories
      /core|main|engine|api|interface/i  // Files with critical keywords
    ];
    
    return criticalPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Schedule background deep analysis for large critical files
   */
  private async scheduleDeepAnalysis(filePath: string, streamingResult: EnhancedModuleInfo): Promise<void> {
    // Run deep analysis in background without blocking
    setTimeout(async () => {
      try {
        if (this.debugMode) console.log(`🔍 Starting background deep analysis for ${filePath}`);
        
        let deepResult: EnhancedModuleInfo | null = null;
        
        // Try Tree-sitter first (faster than Clang for large files)
        try {
          deepResult = await this.treeSitterParser.parseFile(filePath);
          if (deepResult) {
            await this.storeParseData(filePath, deepResult, 'tree-sitter-deep');
            // Store patterns and relationships in KnowledgeBase
            await this.knowledgeBase.storePatterns(filePath, deepResult.patterns);
            await this.knowledgeBase.storeRelationships(filePath, deepResult.relationships);
          }
          if (this.debugMode) console.log(`Tree-sitter deep analysis completed for ${filePath}`);
        } catch (tsError: unknown) {
          if (this.debugMode) console.log(`Tree-sitter deep analysis failed for ${filePath}: ${tsError instanceof Error ? tsError.message : tsError}`);
        }
        
        // Try Clang if available and Tree-sitter provided good results
        if (this.hasClang && this.clangParser && deepResult && deepResult.methods.length > 0) {
          try {
            const clangResult = await this.clangParser.parseFile(filePath);
            await this.storeParseData(filePath, clangResult, 'clang-deep');
            // Store patterns and relationships in KnowledgeBase
            await this.knowledgeBase.storePatterns(filePath, clangResult.patterns);
            await this.knowledgeBase.storeRelationships(filePath, clangResult.relationships);
            if (this.debugMode) console.log(`Clang deep analysis completed for ${filePath}`);
          } catch (clangError: unknown) {
            if (this.debugMode) console.log(`Clang deep analysis failed for ${filePath}: ${clangError instanceof Error ? clangError.message : clangError}`);
          }
        }
        
      } catch (error) {
        console.error(`Background deep analysis failed for ${filePath}:`, error);
      }
    }, 100); // Small delay to not block the main parsing
  }
  
  /**
   * Parse with specific parser for testing/comparison
   */
  async parseWithParser(
    filePath: string, 
    parser: 'clang' | 'tree-sitter' | 'streaming'
  ): Promise<EnhancedModuleInfo> {
    switch (parser) {
      case 'clang':
        if (!this.clangParser) throw new Error('Clang parser not available');
        const clangResult = await this.clangParser.parseFile(filePath);
        await this.knowledgeBase.storePatterns(filePath, clangResult.patterns);
        await this.knowledgeBase.storeRelationships(filePath, clangResult.relationships);
        return clangResult;
        
      case 'tree-sitter':
        const treeSitterResult = await this.treeSitterParser.parseFile(filePath);
        await this.knowledgeBase.storePatterns(filePath, treeSitterResult.patterns);
        await this.knowledgeBase.storeRelationships(filePath, treeSitterResult.relationships);
        return treeSitterResult;
        
      case 'streaming':
        const streamingResult = await this.parseWithStreaming(filePath);
        await this.knowledgeBase.storePatterns(filePath, streamingResult.patterns);
        await this.knowledgeBase.storeRelationships(filePath, streamingResult.relationships);
        return streamingResult;
    }
  }
  
  /**
   * Merge results from multiple parsers for best accuracy
   */
  async parseWithAllParsers(filePath: string): Promise<EnhancedModuleInfo> {
    const results: EnhancedModuleInfo[] = [];
    
    // Get results from all available parsers
    try {
      const treeSitterResult = await this.treeSitterParser.parseFile(filePath);
      results.push(treeSitterResult);
      await this.knowledgeBase.storePatterns(filePath, treeSitterResult.patterns);
      await this.knowledgeBase.storeRelationships(filePath, treeSitterResult.relationships);
    } catch (e) {
      console.error('Tree-sitter failed:', e);
    }
    
    if (this.hasClang && this.clangParser) {
      try {
        const clangResult = await this.clangParser.parseFile(filePath);
        results.push(clangResult);
        await this.knowledgeBase.storePatterns(filePath, clangResult.patterns);
        await this.knowledgeBase.storeRelationships(filePath, clangResult.relationships);
      } catch (e) {
        console.error('Clang failed:', e);
      }
    }
    
    // Merge results
    return this.mergeResults(results);
  }
  
  private mergeResults(results: EnhancedModuleInfo[]): EnhancedModuleInfo {
    if (results.length === 0) {
      throw new Error('All parsers failed');
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    // Prefer Clang results for accuracy, but merge patterns from tree-sitter
    const primary = results.find(r => r.methods.length > 0) || results[0];
    
    // Merge unique patterns
    const allPatterns = new Map<string, any>();
    results.forEach(r => {
      r.patterns.forEach(p => {
        allPatterns.set(p.hash, p);
      });
    });
    
    primary.patterns = Array.from(allPatterns.values());
    
    return primary;
  }

  /**
   * Get preserved parse data from database if available
   */
  private async getPreservedParseData(filePath: string): Promise<EnhancedModuleInfo | null> {
    if (!this.preservationDb) return null;

    try {
      // Get file hash to check if file changed
      const content = await fs.readFile(filePath, 'utf-8');
      const currentHash = crypto.createHash('sha256').update(content).digest('hex');

      // Check if we have preserved data for this file
      const fileRecord = this.preservationDb.prepare(`
        SELECT * FROM indexed_files 
        WHERE path = ? AND clang_success = 1 AND hash = ?
      `).get(filePath, currentHash) as any;

      if (!fileRecord) return null;

      // Get preserved symbols
      const symbols = this.preservationDb.prepare(`
        SELECT * FROM enhanced_symbols 
        WHERE file_path = ? AND parser_used = 'clang'
        ORDER BY parser_confidence DESC
      `).all(filePath) as any[];

      if (symbols.length === 0) return null;

      // Reconstruct EnhancedModuleInfo from preserved data
      const classes: ClassInfo[] = [];
      const methods: MethodSignature[] = [];
      const functions: MethodSignature[] = [];

      symbols.forEach(symbol => {
        if (symbol.kind === 'class') {
          classes.push({
            name: symbol.name,
            namespace: symbol.namespace,
            baseClasses: [],
            interfaces: [],
            methods: [],
            members: [],
            isTemplate: symbol.is_template === 1,
            templateParams: symbol.template_params ? JSON.parse(symbol.template_params) : undefined,
            location: { line: symbol.line, column: symbol.column }
          });
        } else if (symbol.kind === 'method' || symbol.kind === 'function') {
          const methodInfo: MethodSignature = {
            name: symbol.name,
            className: symbol.parent_class,
            parameters: [],
            returnType: symbol.return_type || 'void',
            visibility: 'public' as const,
            isVirtual: false,
            isStatic: false,
            isConst: false,
            location: { line: symbol.line, column: symbol.column }
          };

          if (symbol.parent_class) {
            methods.push(methodInfo);
          } else {
            functions.push(methodInfo);
          }
        }
      });

      return {
        path: filePath,
        relativePath: path.relative(process.cwd(), filePath),
        methods: [...methods, ...functions],
        classes,
        interfaces: [],
        relationships: [],
        patterns: [], // Will be filled with fresh tree-sitter patterns
        imports: [],
        exports: []
      };

    } catch (error) {
      console.error(`Error retrieving preserved data for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Store successful parse results for future preservation
   */
  private async storeParseData(filePath: string, result: EnhancedModuleInfo, parser: string): Promise<void> {
    if (!this.preservationDb) return;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileHash = crypto.createHash('sha256').update(content).digest('hex');
      const timestamp = Math.floor(Date.now() / 1000);

      // Update file tracking with proper success flags
      const symbolCount = result.methods.length + result.classes.length;
      const confidence = parser.includes('clang') ? 1.0 : 
                        parser.includes('grammar-aware') ? 0.95 :
                        parser.includes('tree-sitter') ? 0.8 : 0.6;
      
      this.preservationDb.prepare(`
        INSERT OR REPLACE INTO indexed_files (
          path, relative_path, hash, last_indexed,
          clang_success, treesitter_success, streaming_success,
          clang_symbols, treesitter_symbols, streaming_symbols,
          best_parser, best_confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        filePath,
        result.relativePath,
        fileHash,
        timestamp,
        parser.includes('clang') ? 1 : 0,
        parser.includes('tree-sitter') ? 1 : 0,
        parser.includes('streaming') ? 1 : 0,
        parser.includes('clang') ? symbolCount : 0,
        parser.includes('tree-sitter') ? symbolCount : 0,
        parser.includes('streaming') ? symbolCount : 0,
        parser.replace('-deep', ''),
        confidence
      );

      // Store symbols for preservation
      
      result.classes.forEach(cls => {
        this.schemaManager.mergeParserResult(this.preservationDb!, {
          name: cls.name,
          qualified_name: cls.namespace ? `${cls.namespace}::${cls.name}` : cls.name,
          kind: cls.isEnum ? (cls.isEnumClass ? 'enum_class' : 'enum') : 'class',
          file_path: filePath,
          line: cls.location?.line || 0,
          column: cls.location?.column || 0,
          namespace: cls.namespace,
          is_template: cls.isTemplate,
          template_params: cls.templateParams,
          // Enhanced: Store enum information
          is_enum: cls.isEnum || false,
          is_enum_class: cls.isEnumClass || false,
          enum_values: cls.enumValues
        }, parser, confidence);
      });

      result.methods.forEach(method => {
        this.schemaManager.mergeParserResult(this.preservationDb!, {
          name: method.name,
          qualified_name: method.qualifiedName || (method.className ? `${method.className}::${method.name}` : method.name),
          kind: method.className ? 'method' : 'function',
          file_path: filePath,
          line: method.location?.line || 0,
          column: method.location?.column || 0,
          return_type: method.returnType,
          parent_class: method.className,
          signature: this.buildMethodSignature(method),
          // Enhanced: Store namespace and export information
          namespace: method.namespace,
          is_exported: method.isExported || false
        }, parser, confidence);
      });

    } catch (error) {
      console.error(`Error storing parse data for ${filePath}:`, error);
    }
  }

  private buildMethodSignature(method: MethodSignature): string {
    const params = method.parameters?.map(p => p.type).join(', ') || '';
    return `${method.returnType} ${method.name}(${params})`;
  }

  /**
   * Calculate semantic coverage for parser result
   */
  private calculateSemanticCoverage(result: EnhancedModuleInfo): number {
    const totalSymbols = result.methods.length + result.classes.length;
    if (totalSymbols === 0) return 0;

    let coveredSymbols = 0;

    // Check methods for semantic information
    result.methods.forEach(method => {
      if (method.returnType && method.returnType !== 'void' && method.returnType !== 'unknown') {
        coveredSymbols++;
      } else if (method.parameters && method.parameters.length > 0) {
        coveredSymbols++;
      } else if (method.className) {
        coveredSymbols++;
      }
    });

    // Check classes for semantic information
    result.classes.forEach(cls => {
      if (cls.baseClasses && cls.baseClasses.length > 0) {
        coveredSymbols++;
      } else if (cls.namespace) {
        coveredSymbols++;
      } else if (cls.methods && cls.methods.length > 0) {
        coveredSymbols++;
      } else if (cls.members && cls.members.length > 0) {
        coveredSymbols++;
      }
    });

    // Add pattern coverage
    if (result.patterns && result.patterns.length > 0) {
      coveredSymbols += Math.min(result.patterns.length, totalSymbols * 0.2); // Up to 20% bonus for patterns
    }

    return Math.min(coveredSymbols / totalSymbols, 1.0);
  }

  /**
   * Intelligent parser selection based on file characteristics
   */
  private shouldUseGrammarAwareParser(filePath: string, stats: any): boolean {
    // Always use grammar-aware for critical C++20/23 module files
    if (filePath.endsWith('.ixx') || filePath.endsWith('.cppm')) {
      return true;
    }
    
    // Skip grammar-aware for very large files (> 100KB) unless they're critical
    if (stats.size > 100 * 1024) {
      const isCritical = this.isCriticalFile(filePath);
      if (!isCritical) {
        return false;
      }
    }
    
    // Skip grammar-aware for known problematic files
    const fileName = path.basename(filePath);
    const skipPatterns = [
      /stb_.*\.h$/,           // stb libraries are usually large and simple
      /.*Test\.cpp$/,         // Test files often don't need deep analysis
      /.*test.*\.cpp$/i,      // Test files
      /.*example.*\.cpp$/i,   // Example files
      /.*demo.*\.cpp$/i,      // Demo files
      /third[_-]party/i,      // Third party code
      /vendor/i,              // Vendor code
      /external/i             // External dependencies
    ];
    
    if (skipPatterns.some(pattern => pattern.test(fileName) || pattern.test(filePath))) {
      return false;
    }
    
    // Use grammar-aware for files likely to have rich type information
    const richTypePatterns = [
      /Vulkan/i,
      /Rendering/i,
      /Pipeline/i,
      /Factory/i,
      /Manager/i,
      /Core/i,
      /Application/i,        // FIX: Add Application files
      /Feedback/i,           // FIX: Add Feedback files  
      /Orchestrat/i,         // FIX: Add Orchestrator files
      /Generator/i,          // FIX: Add Generator files
      /Types\.ixx$/,
      /Types\.h$/
    ];
    
    if (richTypePatterns.some(pattern => pattern.test(filePath))) {
      return true;
    }
    
    // Default to fast parser for most files
    return false;
  }
  
  private getFileSkipReason(filePath: string, stats: any): string {
    if (stats.size > 100 * 1024) return 'large file';
    const fileName = path.basename(filePath);
    if (/stb_.*\.h$/.test(fileName)) return 'stb library';
    if (/test/i.test(fileName)) return 'test file';
    if (/third[_-]party|vendor|external/i.test(filePath)) return 'third party';
    return 'low priority';
  }
  
  private async fallbackToFasterParser(filePath: string): Promise<EnhancedModuleInfo> {
    // Try database-aware parser first if available
    if (this.dbAwareTreeSitterParser) {
      try {
        return await this.dbAwareTreeSitterParser.parseFile(filePath);
      } catch (dbError) {
        if (this.debugMode) console.log(`Database-aware parser failed, using regular tree-sitter: ${dbError}`);
      }
    }
    
    // Fall back to regular tree-sitter
    return await this.treeSitterParser.parseFile(filePath);
  }
  
  /**
   * Initialize worker pool for parallel parsing
   */
  private async initializeWorkerPool(): Promise<void> {
    if (this.debugMode) console.log(`🚀 Initializing worker pool with ${this.maxWorkers} workers`);
    
    for (let i = 0; i < this.maxWorkers; i++) {
      await this.createWorker();
    }
  }
  
  /**
   * Create a new worker and add it to the pool
   */
  private async createWorker(): Promise<void> {
    const workerPath = path.join(__dirname, 'parse-worker.js');
    if (this.debugMode) console.log(`Creating worker with path: ${workerPath}`);
    
    // Check if worker file exists
    try {
      await fs.access(workerPath);
    } catch (error) {
      console.error(`Worker file not found at ${workerPath}`);
      throw new Error(`Worker file not found: ${workerPath}`);
    }
    
    const worker = new Worker(workerPath);
    
    worker.on('message', (result) => {
      this.handleWorkerResult(worker, result);
    });
    
    worker.on('error', (error) => {
      console.error('Worker error:', error);
      this.handleWorkerError(worker, error);
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker exited with code ${code}`);
      }
      this.removeWorkerFromPool(worker);
    });
    
    this.workerPool.push(worker);
    this.workerStatus.set(worker, false); // Initially idle
  }
  
  /**
   * Handle result from worker
   */
  private handleWorkerResult(worker: Worker, result: any): void {
    if (this.debugMode) console.log(`Worker result received:`, result.success ? 'success' : 'failure', result.filePath);
    
    // Mark worker as idle
    this.workerStatus.set(worker, false);
    
    // Find the pending request for this worker
    const request = (worker as any).currentRequest;
    if (request) {
      delete (worker as any).currentRequest;
      
      if (result.success) {
        request.resolve(result.result);
      } else {
        request.reject(new Error(result.error));
      }
    }
    
    // Process next item in queue if available
    this.processWorkerQueue();
  }
  
  /**
   * Handle worker error
   */
  private handleWorkerError(worker: Worker, error: Error): void {
    console.error(`Worker error:`, error);
    
    // Mark worker as idle
    this.workerStatus.set(worker, false);
    
    // Find and reject the pending request
    const request = (worker as any).currentRequest;
    if (request) {
      delete (worker as any).currentRequest;
      request.reject(error);
    }
    
    // Replace the failed worker
    this.removeWorkerFromPool(worker);
    this.createWorker();
    
    // Process next item in queue
    this.processWorkerQueue();
  }
  
  /**
   * Remove worker from pool
   */
  private removeWorkerFromPool(worker: Worker): void {
    const index = this.workerPool.indexOf(worker);
    if (index !== -1) {
      this.workerPool.splice(index, 1);
    }
    this.workerStatus.delete(worker);
  }
  
  /**
   * Process worker queue
   */
  private processWorkerQueue(): void {
    const activeCount = Array.from(this.workerStatus.values()).filter(busy => busy).length;
    if (this.debugMode) console.log(`Processing worker queue: ${this.workerQueue.length} items, ${activeCount}/${this.maxWorkers} active workers`);
    
    while (this.workerQueue.length > 0) {
      // Find an idle worker
      const availableWorker = this.workerPool.find(w => !this.workerStatus.get(w));
      
      if (!availableWorker) {
        if (this.debugMode) console.log('No available workers, waiting...');
        break;
      }
      
      const request = this.workerQueue.shift();
      if (!request) break;
      
      // Mark worker as busy and attach request to it
      this.workerStatus.set(availableWorker, true);
      (availableWorker as any).currentRequest = request;
      
      if (this.debugMode) console.log(`Sending file to worker: ${request.filePath}`);
      
      // Get file stats for intelligent parser selection
      fs.stat(request.filePath).then(stats => {
        // Send work to the worker
        availableWorker.postMessage({
          filePath: request.filePath,
          useGrammarAware: this.shouldUseGrammarAwareParser(request.filePath, stats),
          projectPath: this.projectPath
        });
      }).catch(err => {
        console.error(`Failed to stat file ${request.filePath}:`, err);
        // Still try to parse even if stat fails
        availableWorker.postMessage({
          filePath: request.filePath,
          useGrammarAware: false, // Default to faster parser if stat fails
          projectPath: this.projectPath
        });
      });
    }
  }
  
  /**
   * Parse file using worker pool
   */
  private async parseFileWithWorker(filePath: string): Promise<EnhancedModuleInfo> {
    return new Promise((resolve, reject) => {
      this.workerQueue.push({ resolve, reject, filePath });
      this.processWorkerQueue();
    });
  }
  
  /**
   * Parse multiple files in parallel using worker pool
   */
  async parseFilesInParallel(filePaths: string[]): Promise<Map<string, EnhancedModuleInfo>> {
    if (this.debugMode) console.log(`📦 Parsing ${filePaths.length} files in parallel using worker pool`);
    const startTime = Date.now();
    
    const results = new Map<string, EnhancedModuleInfo>();
    const parsePromises: Promise<void>[] = [];
    
    for (const filePath of filePaths) {
      const promise = this.parseFileWithWorker(filePath)
        .then(result => {
          results.set(filePath, result);
          
          // Store in database and knowledge base
          return this.storeParseData(filePath, result, 'worker-pool').then(() => {
            return this.knowledgeBase.storePatterns(filePath, result.patterns);
          }).then(() => {
            return this.knowledgeBase.storeRelationships(filePath, result.relationships);
          });
        })
        .catch(error => {
          console.error(`Failed to parse ${filePath}:`, error);
          // Don't throw, just log the error so other files can continue
        });
      
      parsePromises.push(promise);
    }
    
    await Promise.all(parsePromises);
    
    const duration = Date.now() - startTime;
    const avgTime = Math.round(duration / filePaths.length);
    if (this.debugMode) console.log(`✅ Parsed ${results.size}/${filePaths.length} files in ${duration}ms (avg ${avgTime}ms/file)`);
    
    return results;
  }
  
  /**
   * Terminate worker pool
   */
  private terminateWorkerPool(): void {
    if (this.debugMode) console.log('🛑 Terminating worker pool');
    
    for (const worker of this.workerPool) {
      worker.terminate();
    }
    
    this.workerPool = [];
    this.workerStatus.clear();
    
    // Reject any pending requests
    for (const request of this.workerQueue) {
      request.reject(new Error('Worker pool terminated'));
    }
    this.workerQueue = [];
  }
}

// Usage example:
/*
const parser = new HybridCppParser();
await parser.initialize('/path/to/project');

// Parse with best available parser
const moduleInfo = await parser.parseFile('/path/to/file.cpp');

// Or parse with specific parser
const clangResult = await parser.parseWithParser('/path/to/file.cpp', 'clang');
const treeSitterResult = await parser.parseWithParser('/path/to/file.cpp', 'tree-sitter');

// Or get merged results from all parsers
const mergedResult = await parser.parseWithAllParsers('/path/to/file.cpp');
*/