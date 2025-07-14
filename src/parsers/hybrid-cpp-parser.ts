import { ClangAstParser } from './clang-ast-parser.js';
import { EnhancedTreeSitterParser } from './enhanced-tree-sitter-parser.js';
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
  private dbAwareTreeSitterParser?: DatabaseAwareTreeSitterParser;
  private streamingParser: StreamingCppParser;
  private hasClang: boolean = false;
  private preservationDb?: Database.Database;
  private schemaManager: UnifiedSchemaManager;
  private knowledgeBase: KnowledgeBase; // New member
  private projectPath?: string;
  
  constructor() {
    this.treeSitterParser = new EnhancedTreeSitterParser();
    this.streamingParser = new StreamingCppParser();
    this.schemaManager = UnifiedSchemaManager.getInstance();
    this.knowledgeBase = new KnowledgeBase(''); // Initialize with placeholder path
  }
  
  async initialize(projectPath: string): Promise<void> {
    // Initialize KnowledgeBase with projectPath
    this.knowledgeBase = new KnowledgeBase(projectPath);
    await this.knowledgeBase.initialize();
    this.projectPath = projectPath;

    // Initialize tree-sitter (always available)
    await this.treeSitterParser.initialize();
    
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
    
    // Check if clang is available (prefer clang++-19 for better C++23 module support)
    try {
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
      
      this.clangParser = new ClangAstParser(clangPath);
      await this.clangParser.detectIncludePaths(projectPath);
      this.hasClang = true;
      console.log(`Clang AST parser available (${clangPath} with lightweight mode)`);
    } catch {
      console.log('⚠️  Clang not available, using tree-sitter only');
    }

    // Start progressive background re-indexing
    this.startProgressiveReindexing(projectPath);
    
    // Set up file save hooks for immediate re-indexing
    this.setupFileSaveHooks(projectPath);
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
        console.log(`🔄 Background re-parsing ${filePath}`);
        
        // Check if file actually changed
        const changed = await this.schemaManager.hasFileChanged(this.preservationDb!, filePath);
        if (!changed) {
          console.log(`⏭️  Skipping ${filePath} - no changes detected`);
          return;
        }
        
        // Re-parse the file with current strategy
        try {
          const result = await this.parseFile(filePath);
          console.log(`Re-parsed ${filePath}: ${result.methods.length} methods, ${result.classes.length} classes`);
          // Store patterns and relationships in KnowledgeBase
          await this.knowledgeBase.storePatterns(filePath, result.patterns);
          await this.knowledgeBase.storeRelationships(filePath, result.relationships);
        } catch (error: unknown) {
          console.error(` Re-parsing failed for ${filePath}:`, error instanceof Error ? error.message : error);
          throw error;
        }
      }
    );

    console.log('📋 Progressive re-indexing system started');
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
      console.log(`💾 File save detected: ${filePath}`);
      
      // Immediate re-parse on file save
      try {
        const result = await this.parseFile(filePath);
        console.log(`⚡ Hot re-parsed ${filePath}: ${result.methods.length} methods, ${result.classes.length} classes`);
        // Store patterns and relationships in KnowledgeBase
        await this.knowledgeBase.storePatterns(filePath, result.patterns);
        await this.knowledgeBase.storeRelationships(filePath, result.relationships);
      } catch (error: unknown) {
        console.error(` Hot re-parsing failed for ${filePath}:`, error instanceof Error ? error.message : error);
      }
    });

    console.log('💾 File save hooks enabled for immediate re-indexing');
  }
  
  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    const stats = await fs.stat(filePath);
    
    // For very large files, use two-pass approach: streaming + background deep analysis
    if (stats.size > 500 * 1024) { // 500KB
      console.log(`Using two-pass approach for large file: ${filePath} (${Math.round(stats.size / 1024)}KB)`);
      return this.parseWithTwoPass(filePath);
    }
    
    // Try Clang first if available (now with automatic lightweight mode)
    if (this.hasClang && this.clangParser) {
      const parseStartTime = Date.now();
      try {
        const result = await this.clangParser.parseFile(filePath);
        
        // Enhance with tree-sitter pattern detection
        const treeSitterResult = await this.treeSitterParser.parseFile(filePath);
        result.patterns = treeSitterResult.patterns;
        
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
        console.log(`Clang parsing failed for ${filePath}: ${error instanceof Error ? error.message : error}`);
        
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
          console.log(`Using preserved data for ${filePath} from previous successful parse`);
          
          // Enhance preserved data with fresh tree-sitter patterns
          try {
            const treeSitterResult = await this.treeSitterParser.parseFile(filePath);
            preservedData.patterns = treeSitterResult.patterns;
            return preservedData;
          } catch (tsError) {
            console.log(`Tree-sitter also failed, returning preserved data as-is`);
            return preservedData;
          }
        }
        
        console.log(`No preserved data available, falling back to tree-sitter`);
      }
    }
    
    // Fall back to tree-sitter (prefer database-aware if available)
    const treeSitterStartTime = Date.now();
    try {
      let result: EnhancedModuleInfo;
      let parserType = 'tree-sitter';
      
      // Try database-aware parser first if available
      if (this.dbAwareTreeSitterParser) {
        try {
          console.log(`Using database-aware tree-sitter for ${filePath}`);
          result = await this.dbAwareTreeSitterParser.parseFile(filePath);
          parserType = 'db-aware-tree-sitter';
        } catch (dbError) {
          console.log(`Database-aware parser failed, falling back to regular tree-sitter: ${dbError}`);
          result = await this.treeSitterParser.parseFile(filePath);
        }
      } else {
        result = await this.treeSitterParser.parseFile(filePath);
      }
      
      // Store tree-sitter result for preservation (lower confidence)
      await this.storeParseData(filePath, result, parserType);
      
      // Store patterns and relationships in KnowledgeBase
      await this.knowledgeBase.storePatterns(filePath, result.patterns);
      await this.knowledgeBase.storeRelationships(filePath, result.relationships);
      
      // Track parser metrics
      if (this.preservationDb) {
        this.schemaManager.storeParserMetrics(this.preservationDb, 'treesitter', filePath, {
          symbolsDetected: result.methods.length + result.classes.length,
          confidence: parserType === 'db-aware-tree-sitter' ? 0.85 : 0.8,
          semanticCoverage: this.calculateSemanticCoverage(result),
          parseTimeMs: Date.now() - treeSitterStartTime,
          success: true
        });
      }

      return result;
    } catch (error: unknown) {
      console.log(`Tree-sitter parsing failed for ${filePath}: ${error instanceof Error ? error.message : error}`);
      
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
        console.log(`Falling back to streaming parser for large file: ${filePath}`);
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
        console.log(`🔍 Starting background deep analysis for ${filePath}`);
        
        let deepResult: EnhancedModuleInfo | null = null;
        
        // Try Tree-sitter first (faster than Clang for large files)
        try {
          deepResult = await this.treeSitterParser.parseFile(filePath);
          await this.storeParseData(filePath, deepResult, 'tree-sitter-deep');
          // Store patterns and relationships in KnowledgeBase
          await this.knowledgeBase.storePatterns(filePath, deepResult.patterns);
          await this.knowledgeBase.storeRelationships(filePath, deepResult.relationships);
          console.log(`Tree-sitter deep analysis completed for ${filePath}`);
        } catch (tsError: unknown) {
          console.log(`Tree-sitter deep analysis failed for ${filePath}: ${tsError instanceof Error ? tsError.message : tsError}`);
        }
        
        // Try Clang if available and Tree-sitter provided good results
        if (this.hasClang && this.clangParser && deepResult && deepResult.methods.length > 0) {
          try {
            const clangResult = await this.clangParser.parseFile(filePath);
            await this.storeParseData(filePath, clangResult, 'clang-deep');
            // Store patterns and relationships in KnowledgeBase
            await this.knowledgeBase.storePatterns(filePath, clangResult.patterns);
            await this.knowledgeBase.storeRelationships(filePath, clangResult.relationships);
            console.log(`Clang deep analysis completed for ${filePath}`);
          } catch (clangError: unknown) {
            console.log(`Clang deep analysis failed for ${filePath}: ${clangError instanceof Error ? clangError.message : clangError}`);
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
      const confidence = parser.includes('clang') ? 1.0 : parser.includes('tree-sitter') ? 0.8 : 0.6;
      
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
          kind: 'class',
          file_path: filePath,
          line: cls.location?.line || 0,
          column: cls.location?.column || 0,
          namespace: cls.namespace,
          is_template: cls.isTemplate,
          template_params: cls.templateParams
        }, parser, confidence);
      });

      result.methods.forEach(method => {
        this.schemaManager.mergeParserResult(this.preservationDb!, {
          name: method.name,
          qualified_name: method.className ? `${method.className}::${method.name}` : method.name,
          kind: method.className ? 'method' : 'function',
          file_path: filePath,
          line: method.location?.line || 0,
          column: method.location?.column || 0,
          return_type: method.returnType,
          parent_class: method.className,
          signature: this.buildMethodSignature(method)
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