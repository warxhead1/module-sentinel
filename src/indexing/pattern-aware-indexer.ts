import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { StreamingCppParser } from '../parsers/streaming-cpp-parser.js';
import { EnhancedTreeSitterParser } from '../parsers/enhanced-tree-sitter-parser.js';
import { ClangIntelligentIndexer } from './clang-intelligent-indexer.js';
import { ParallelProcessingEngine } from '../engines/parallel-engine.js';
import { Worker } from 'worker_threads';
import * as os from 'os';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';
import { EnhancedAntiPatternDetector } from '../services/enhanced-antipattern-detector.js';

/**
 * Pattern-aware indexer specifically designed for the planet_procgen codebase
 * Optimized for fast query-time access with precomputed metadata
 */
interface PatternCache {
  memCache: Map<string, any[]>;
  maxSize: number;
}

export class PatternAwareIndexer {
  private db: Database.Database;
  private clangParser: ClangIntelligentIndexer;
  private treeSitterParser: EnhancedTreeSitterParser;
  private streamingParser: StreamingCppParser;
  private parallelEngine: ParallelProcessingEngine;
  private patternCache: PatternCache;
  private semanticWorker: Worker | null = null;
  private parserStats = { clang: 0, treeSitter: 0, streaming: 0, failed: 0 };
  private antiPatternDetector: EnhancedAntiPatternDetector;
  
  constructor(private projectPath: string, private dbPath: string) {
    this.db = new Database(dbPath);
    
    // Initialize database schema through unified manager
    const schemaManager = UnifiedSchemaManager.getInstance();
    schemaManager.initializeDatabase(this.db);
    
    // Initialize hierarchical parsers - all use same database
    // TODO: Clang parser disabled temporarily - requires compilation database setup
    // this.clangParser = new ClangIntelligentIndexer(projectPath, dbPath);
    this.clangParser = null as any; // Temporary placeholder
    this.treeSitterParser = new EnhancedTreeSitterParser();
    this.streamingParser = new StreamingCppParser({ fastMode: true });
    
    this.parallelEngine = new ParallelProcessingEngine(Math.min(os.cpus().length, 8));
    this.patternCache = {
      memCache: new Map(),
      maxSize: 1000
    };
    
    // Initialize enhanced anti-pattern detector
    this.antiPatternDetector = new EnhancedAntiPatternDetector(dbPath);
  }
  
  /**
   * Index multiple files in parallel with batch processing
   */
  async indexFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    
    console.log(`\n🚀 Indexing ${filePaths.length} files in parallel...`);
    const startTime = Date.now();
    
    // Initialize semantic worker if needed
    if (!this.semanticWorker) {
      await this.initializeSemanticWorker();
    }
    
    // Process files in parallel batches
    const batchSize = Math.min(50, filePaths.length);
    const allSymbols: any[] = [];
    const failedFiles: string[] = [];
    const allValidResults: any[] = [];
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Parse files in parallel with hierarchical fallback
      const batchResults = await this.parallelEngine.processInParallel(
        batch,
        async (filePath) => {
          const relativePath = path.relative(this.projectPath, filePath);
          
          // Try hierarchical parsing: Clang -> TreeSitter -> Streaming
          const parseResult = await this.parseFileWithFallback(filePath);
          
          if (parseResult) {
            return { filePath, relativePath, parseResult: parseResult.result, parserUsed: parseResult.parser };
          } else {
            failedFiles.push(filePath);
            return null;
          }
        }
      );
      
      // Extract symbols and perform semantic analysis
      const validResults = batchResults.filter(r => r !== null);
      allValidResults.push(...validResults);
      
      for (const result of validResults) {
        try {
          const symbols = await this.extractSymbolsWithWorker(
            result.parseResult,
            result.filePath,
            result.relativePath,
            result.parserUsed
          );
          allSymbols.push(...symbols);
        } catch (error) {
          console.warn(`  ⚠️  Symbol extraction error in ${path.basename(result.filePath)}`);
          failedFiles.push(result.filePath);
        }
      }
    }
    
    // Batch insert all symbols and extract comprehensive module information
    if (allSymbols.length > 0) {
      await this.storeSymbolsBatch(allSymbols);
      
      // Extract and store module information from parse results
      await this.extractAndStoreModuleInformation(allValidResults);
      
      // Run enhanced anti-pattern detection on all processed files
      await this.runAntiPatternDetection(allValidResults);
      
      // Build semantic connections
      await this.buildSemanticConnections(allSymbols);
      
      // Build cross-file dependency map for all processed files
      await this.buildCrossFileDependencyMap(allValidResults);
    }
    
    const elapsed = Date.now() - startTime;
    const successCount = filePaths.length - failedFiles.length;
    console.log(`Indexed ${allSymbols.length} symbols from ${successCount}/${filePaths.length} files in ${elapsed}ms`);
    
    if (failedFiles.length > 0) {
      console.log(`  ⚠️  ${failedFiles.length} files could not be indexed (likely due to compilation errors)`);
    }
  }
  
  /**
   * Index a single file (for compatibility and incremental updates)
   */
  async indexFile(filePath: string): Promise<void> {
    await this.indexFiles([filePath]);
  }
  
  /**
   * Update a file incrementally
   */
  async updateFile(filePath: string): Promise<void> {
    // Remove old symbols in a transaction
    const deleteTransaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM enhanced_symbols WHERE file_path = ?').run(filePath);
      this.db.prepare('DELETE FROM semantic_connections WHERE symbol_id IN (SELECT id FROM enhanced_symbols WHERE file_path = ?)').run(filePath);
    });
    deleteTransaction();
    
    // Index the updated file
    await this.indexFile(filePath);
    
    // Invalidate pattern cache entries that might include this file
    this.invalidatePatternCache();
  }
  
  /**
   * Remove a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM enhanced_symbols WHERE file_path = ?').run(filePath);
      this.db.prepare('DELETE FROM semantic_connections WHERE symbol_id IN (SELECT id FROM enhanced_symbols WHERE file_path = ?)').run(filePath);
    });
    transaction();
    
    this.invalidatePatternCache();
  }
  
  /**
   * Store symbols in batch using a transaction
   */
  private async storeSymbolsBatch(symbols: any[]): Promise<void> {
    if (symbols.length === 0) return;
    
    // Smart conflict resolution: only insert if higher confidence or new symbol
    const insertStmt = this.db.prepare(`
      INSERT INTO enhanced_symbols (
        name, qualified_name, kind, file_path, line, column, signature, return_type,
        parent_class, namespace, mangled_name, is_definition, is_template, template_params, usr,
        execution_mode, is_async, is_factory, is_generator, pipeline_stage, 
        returns_vector_float, uses_gpu_compute, has_cpu_fallback,
        semantic_tags, related_symbols, parser_used, parser_confidence, parse_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name, file_path, line, kind) DO UPDATE SET
        qualified_name = CASE 
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
            OR (excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL)
          THEN excluded.qualified_name 
          ELSE enhanced_symbols.qualified_name 
        END,
        signature = CASE 
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
            OR (excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL)
          THEN excluded.signature 
          ELSE enhanced_symbols.signature 
        END,
        return_type = CASE 
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
            OR (excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL)
          THEN excluded.return_type 
          ELSE enhanced_symbols.return_type 
        END,
        parent_class = CASE 
          WHEN excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL
          THEN excluded.parent_class
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
          THEN excluded.parent_class 
          ELSE enhanced_symbols.parent_class 
        END,
        namespace = CASE 
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
            OR (excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL)
          THEN excluded.namespace 
          ELSE enhanced_symbols.namespace 
        END,
        mangled_name = CASE WHEN excluded.mangled_name IS NOT NULL THEN excluded.mangled_name ELSE enhanced_symbols.mangled_name END,
        usr = CASE WHEN excluded.usr IS NOT NULL THEN excluded.usr ELSE enhanced_symbols.usr END,
        parser_used = CASE 
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
            OR (excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL)
          THEN excluded.parser_used 
          ELSE enhanced_symbols.parser_used 
        END,
        parser_confidence = CASE 
          WHEN excluded.parser_confidence > enhanced_symbols.parser_confidence 
            OR (excluded.parent_class IS NOT NULL AND enhanced_symbols.parent_class IS NULL)
          THEN excluded.parser_confidence 
          ELSE enhanced_symbols.parser_confidence 
        END,
        parse_timestamp = excluded.parse_timestamp
    `);
    
    const transaction = this.db.transaction((symbols: any[]) => {
      for (const symbol of symbols) {
        if (!symbol.name) continue;
        
        try {
          insertStmt.run(
            symbol.name,
            symbol.qualifiedName,
            symbol.kind,
            symbol.filePath,
            symbol.line,
            symbol.column || 0,
            symbol.signature,
            symbol.returnType,
            symbol.parentClass,
            symbol.namespace,
            symbol.mangledName || null,
            symbol.isDefinition ? 1 : 0,
            symbol.isTemplate ? 1 : 0,
            symbol.templateParams ? JSON.stringify(symbol.templateParams) : null,
            symbol.usr || null,
            symbol.executionMode,
            symbol.isAsync ? 1 : 0,
            symbol.isFactory ? 1 : 0,
            symbol.isGenerator ? 1 : 0,
            symbol.pipelineStage,
            symbol.returnsVectorFloat ? 1 : 0,
            symbol.usesGpuCompute ? 1 : 0,
            symbol.hasCpuFallback ? 1 : 0,
            JSON.stringify(symbol.semanticTags),
            JSON.stringify(symbol.relatedSymbols || []),
            symbol.parserUsed || 'streaming',
            symbol.parserConfidence || 0.6,
            Date.now()
          );
        } catch (e) {
          console.error(`Failed to insert symbol ${symbol.name}: ${(e as Error).message}`);
        }
      }
    });
    
    transaction(symbols);
    
    // Clean up duplicate symbols with same qualified name but different lines
    await this.cleanupDuplicateSymbols();
    
    // After storing symbols, extract and store enhanced method signatures and class hierarchies
    await this.extractMethodSignatures(symbols);
    await this.extractClassHierarchies(symbols);
  }
  
  /**
   * Clean up duplicate symbols with the same qualified name but different line numbers
   * Keep the one with highest confidence or most complete information
   */
  private async cleanupDuplicateSymbols(): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Find duplicate symbols by qualified name and file path
      const duplicates = this.db.prepare(`
        SELECT qualified_name, file_path, kind, COUNT(*) as count
        FROM enhanced_symbols 
        WHERE qualified_name IS NOT NULL AND qualified_name != ''
        GROUP BY qualified_name, file_path, kind 
        HAVING COUNT(*) > 1
      `).all();
      
      for (const duplicate of duplicates as any[]) {
        // Get all instances of this duplicate
        const instances = this.db.prepare(`
          SELECT id, name, line, parent_class, parser_confidence, parser_used
          FROM enhanced_symbols 
          WHERE qualified_name = ? AND file_path = ? AND kind = ?
          ORDER BY 
            CASE WHEN parent_class IS NOT NULL THEN 1 ELSE 0 END DESC,
            parser_confidence DESC,
            id ASC
        `).all(duplicate.qualified_name, duplicate.file_path, duplicate.kind);
        
        if (instances.length > 1) {
          const keepInstance = instances[0] as any;
          const removeIds = instances.slice(1).map((inst: any) => inst.id);
          
          // Delete duplicate instances, keeping the best one
          for (const removeId of removeIds) {
            this.db.prepare('DELETE FROM enhanced_symbols WHERE id = ?').run(removeId);
            this.db.prepare('DELETE FROM symbol_relationships WHERE from_symbol_id = ? OR to_symbol_id = ?').run(removeId, removeId);
          }
        }
      }
    });
    
    transaction();
  }
  
  /**
   * Extract enhanced method signatures and store in class_hierarchies table
   */
  private async extractMethodSignatures(symbols: any[]): Promise<void> {
    const methodSymbols = symbols.filter(s => 
      s.kind === 'method' || s.kind === 'function' || s.kind === 'constructor'
    );
    
    if (methodSymbols.length === 0) return;
    
    // For methods, store additional details in symbol_relationships table to link to classes
    const relationshipStmt = this.db.prepare(`
      INSERT OR IGNORE INTO symbol_relationships (
        from_symbol_id, to_symbol_id, relationship_type, confidence, detected_by
      ) VALUES (
        (SELECT id FROM enhanced_symbols WHERE name = ? AND file_path = ? AND line = ?),
        (SELECT id FROM enhanced_symbols WHERE name = ? AND file_path = ? AND kind = 'class'),
        'member_of', 0.9, 'pattern-aware-indexer'
      )
    `);
    
    const transaction = this.db.transaction(() => {
      for (const method of methodSymbols) {
        if (method.parentClass) {
          try {
            relationshipStmt.run(
              method.name,
              method.filePath,
              method.line,
              method.parentClass,
              method.filePath
            );
          } catch (e) {
            // Relationship might already exist or parent class not found
          }
        }
      }
    });
    
    transaction();
  }
  
  /**
   * Extract class hierarchies and store in class_hierarchies table
   */
  private async extractClassHierarchies(symbols: any[]): Promise<void> {
    const classSymbols = symbols.filter(s => s.kind === 'class' || s.kind === 'struct');
    
    if (classSymbols.length === 0) return;
    
    const hierarchyStmt = this.db.prepare(`
      INSERT OR IGNORE INTO class_hierarchies (
        class_name, class_usr, file_path, base_class, base_usr, 
        inheritance_type, implements_interface, interface_usr,
        detected_by, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pattern-aware-indexer', 0.8)
    `);
    
    const transaction = this.db.transaction(() => {
      for (const classSymbol of classSymbols) {
        // Extract inheritance from signature or semantic analysis
        const inheritsFrom = this.extractInheritanceInfo(classSymbol);
        
        for (const inheritance of inheritsFrom) {
          try {
            hierarchyStmt.run(
              classSymbol.name,
              classSymbol.usr || null,
              classSymbol.filePath,
              inheritance.baseClass || null,
              inheritance.baseUsr || null,
              inheritance.inheritanceType || 'public',
              inheritance.interface || null,
              inheritance.interfaceUsr || null
            );
          } catch (e) {
            // Might be duplicate
          }
        }
      }
    });
    
    transaction();
  }
  
  /**
   * Extract inheritance information from class symbol
   */
  private extractInheritanceInfo(classSymbol: any): Array<{
    baseClass?: string;
    baseUsr?: string;
    inheritanceType?: string;
    interface?: string;
    interfaceUsr?: string;
  }> {
    const inheritances: any[] = [];
    
    // Check signature for inheritance patterns
    if (classSymbol.signature) {
      // Match patterns like "class Foo : public Bar", "class Foo : Bar", etc.
      const inheritancePattern = /:\s*(public|private|protected)?\s*([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)/g;
      let match;
      
      while ((match = inheritancePattern.exec(classSymbol.signature)) !== null) {
        const inheritanceType = match[1] || 'public';
        const baseClass = match[2];
        
        inheritances.push({
          baseClass,
          inheritanceType,
          baseUsr: null // Would need USR resolution for this
        });
      }
    }
    
    // If no inheritance found in signature, check if it's an interface-like class
    if (inheritances.length === 0 && classSymbol.name && 
        (classSymbol.name.startsWith('I') || classSymbol.name.endsWith('Interface'))) {
      // This might be an interface - we could mark it differently
      // For now, we'll skip adding anything
    }
    
    return inheritances;
  }
  
  /**
   * Parse file with hierarchical fallback strategy
   */
  private async parseFileWithFallback(filePath: string): Promise<{ result: any; parser: string; confidence: number } | null> {
    // Try Clang parser first (highest accuracy)
    try {
      await this.treeSitterParser.initialize(); // Ensure it's initialized
      await this.clangParser.indexFile(filePath);
      
      // Get symbols from clang indexer - use their schema
      const symbols = this.clangParser.db.prepare('SELECT * FROM symbols WHERE file_path = ?').all(filePath);
      if (symbols && symbols.length > 0) {
        this.parserStats.clang++;
        // Convert Clang symbols to our unified format with full metadata
        const convertedSymbols = (symbols as any[]).map(s => ({
          name: s.name,
          qualifiedName: s.qualified_name || s.name,
          kind: s.kind,
          filePath: s.file_path,
          line: s.line,
          column: s.column || 0,
          signature: s.signature,
          returnType: s.return_type,
          parentClass: s.parent_class,
          namespace: s.namespace,
          mangledName: s.mangled_name,
          isDefinition: s.is_definition,
          isTemplate: s.is_template,
          templateParams: s.template_params ? JSON.parse(s.template_params) : null,
          usr: s.usr
        }));
        
        return { result: { functions: convertedSymbols, classes: [], methods: convertedSymbols }, parser: 'clang', confidence: 0.95 };
      }
    } catch (error) {
      // Clang failed, continue to next parser
    }

    // Try Tree-sitter parser (good accuracy, more reliable)
    try {
      const result = await this.treeSitterParser.parseFile(filePath);
      if (result && this.hasValidSymbols(result)) {
        this.parserStats.treeSitter++;
        return { result, parser: 'tree-sitter', confidence: 0.8 };
      }
    } catch (error) {
      // Tree-sitter failed, continue to fallback
    }

    // Fallback to streaming parser (basic but reliable)
    try {
      const result = await this.streamingParser.parseFile(filePath);
      if (result && this.hasValidSymbols(result)) {
        this.parserStats.streaming++;
        return { result, parser: 'streaming', confidence: 0.6 };
      }
    } catch (error) {
      // All parsers failed
    }

    this.parserStats.failed++;
    return null;
  }

  /**
   * Check if parse result has valid symbols
   */
  private hasValidSymbols(parseResult: any): boolean {
    if (!parseResult) return false;
    
    // Check for symbols in different formats
    const hasSymbols = 
      (parseResult.functions && (parseResult.functions.length > 0 || parseResult.functions.size > 0)) ||
      (parseResult.methods && parseResult.methods.length > 0) ||
      (parseResult.classes && (parseResult.classes.length > 0 || parseResult.classes.size > 0)) ||
      (parseResult.exports && (parseResult.exports.length > 0 || parseResult.exports.size > 0));
    
    return hasSymbols;
  }

  /**
   * Get parser statistics
   */
  getParserStats() {
    return { ...this.parserStats };
  }

  /**
   * Analyze symbol conflicts and inconsistencies across parsers
   */
  getSymbolConflicts() {
    const conflicts = this.db.prepare(`
      SELECT 
        name, file_path, line, kind,
        COUNT(*) as parser_count,
        GROUP_CONCAT(parser_used || ':' || parser_confidence) as parsers,
        MAX(parser_confidence) as best_confidence,
        MIN(parser_confidence) as worst_confidence
      FROM (
        SELECT name, file_path, line, kind, parser_used, parser_confidence
        FROM enhanced_symbols 
        GROUP BY name, file_path, line, kind, parser_used
      )
      GROUP BY name, file_path, line, kind
      HAVING parser_count > 1
      ORDER BY (best_confidence - worst_confidence) DESC
    `).all();

    return conflicts;
  }

  /**
   * Get data quality report showing parser effectiveness
   */
  getDataQualityReport() {
    const report = this.db.prepare(`
      SELECT 
        parser_used,
        COUNT(*) as symbol_count,
        AVG(parser_confidence) as avg_confidence,
        COUNT(DISTINCT file_path) as files_parsed,
        COUNT(CASE WHEN mangled_name IS NOT NULL THEN 1 END) as with_mangled_names,
        COUNT(CASE WHEN usr IS NOT NULL THEN 1 END) as with_usr,
        COUNT(CASE WHEN signature IS NOT NULL THEN 1 END) as with_signatures
      FROM enhanced_symbols 
      GROUP BY parser_used
      ORDER BY avg_confidence DESC
    `).all();

    return report;
  }

  /**
   * Calculate real confidence score based on extracted data quality
   */
  private calculateRealConfidence(symbol: any, parserUsed: string): number {
    let baseConfidence = 0.5;
    let qualityScore = 0;
    let maxQualityPoints = 0;

    // Base confidence by parser capability
    switch (parserUsed) {
      case 'clang': 
        baseConfidence = 0.85; // High base but we'll verify with actual extraction
        break;
      case 'tree-sitter': 
        baseConfidence = 0.7; // Medium base
        break;
      case 'streaming': 
        baseConfidence = 0.5; // Low base
        break;
      default: 
        baseConfidence = 0.3;
    }

    // Quality scoring based on actual extracted information
    
    // 1. Signature quality (up to 0.3 points)
    maxQualityPoints += 0.3;
    if (symbol.signature) {
      if (symbol.signature.includes('(') && symbol.signature.includes(')')) {
        qualityScore += 0.2; // Has parameter list
        if (symbol.signature.includes(',') || symbol.signature.includes('void')) {
          qualityScore += 0.05; // Has parameters or explicit void
        }
        if (symbol.signature.includes('const') || symbol.signature.includes('noexcept')) {
          qualityScore += 0.05; // Has qualifiers
        }
      } else {
        qualityScore += 0.1; // Basic signature
      }
    }

    // 2. Return type information (up to 0.2 points)
    maxQualityPoints += 0.2;
    if (symbol.returnType) {
      qualityScore += 0.15;
      if (symbol.returnType.includes('::') || symbol.returnType.includes('<')) {
        qualityScore += 0.05; // Complex type (namespace or template)
      }
    }

    // 3. Class/namespace context (up to 0.2 points)
    maxQualityPoints += 0.2;
    if (symbol.parentClass) {
      qualityScore += 0.1;
      if (symbol.namespace) {
        qualityScore += 0.1; // Has both class and namespace context
      }
    } else if (symbol.namespace) {
      qualityScore += 0.05; // Has namespace context
    }

    // 4. Symbol kind specificity (up to 0.1 points)
    maxQualityPoints += 0.1;
    if (symbol.kind === 'method' || symbol.kind === 'constructor' || symbol.kind === 'destructor') {
      qualityScore += 0.1; // Specific method types
    } else if (symbol.kind === 'function' || symbol.kind === 'class') {
      qualityScore += 0.05; // General types
    }

    // 5. Additional semantic information (up to 0.2 points)
    maxQualityPoints += 0.2;
    if (symbol.semanticTags && symbol.semanticTags.length > 0) {
      qualityScore += 0.1;
      if (symbol.semanticTags.length > 3) {
        qualityScore += 0.05; // Rich semantic analysis
      }
    }
    if (symbol.executionMode && symbol.executionMode !== 'unknown') {
      qualityScore += 0.05; // Execution mode detected
    }

    // Normalize quality score to 0-1 range
    const normalizedQuality = Math.min(qualityScore / maxQualityPoints, 1.0);

    // Combine base confidence with quality score
    const finalConfidence = baseConfidence + (normalizedQuality * (1.0 - baseConfidence));
    
    return Math.min(Math.max(finalConfidence, 0.1), 0.99); // Clamp between 0.1 and 0.99
  }

  /**
   * Get confidence score for parser type (legacy method for compatibility)
   */
  private getParserConfidence(parserUsed: string): number {
    // This is now just a fallback - real confidence is calculated per symbol
    switch (parserUsed) {
      case 'clang': return 0.85;
      case 'tree-sitter': return 0.7;
      case 'streaming': return 0.5;
      default: return 0.3;
    }
  }

  /**
   * Initialize the semantic analysis worker
   */
  private async initializeSemanticWorker(): Promise<void> {
    try {
      const workerPath = path.join(__dirname, '../workers/semantic-analysis-worker.js');
      // Check if worker file exists
      const fs = await import('fs/promises');
      await fs.access(workerPath);
      this.semanticWorker = new Worker(workerPath);
    } catch (error) {
      console.warn('Semantic worker not available, falling back to synchronous analysis');
      this.semanticWorker = null;
    }
  }
  
  /**
   * Extract symbols with worker-based semantic analysis
   */
  private async extractSymbolsWithWorker(parseResult: any, filePath: string, relativePath: string, parserUsed?: string): Promise<any[]> {
    const symbols = await this.extractSymbols(parseResult, filePath, relativePath, parserUsed);
    
    // Brief logging for empty files
    if (symbols.length === 0) {
      console.warn(`  ⚠️  ${path.basename(filePath)}: 0 symbols`);
    }
    
    if (!this.semanticWorker || symbols.length === 0) {
      return symbols;
    }
    
    // Perform semantic analysis in worker with timeout
    return new Promise((resolve, reject) => {
      let isResolved = false;
      
      const cleanup = () => {
        if (this.semanticWorker) {
          this.semanticWorker.off('message', messageHandler);
          this.semanticWorker.off('error', errorHandler);
        }
      };
      
      const messageHandler = (analyzed: any) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        
        // Check if we got an error response
        if (analyzed && analyzed.error) {
          console.error('Semantic worker error:', analyzed.error);
          resolve(symbols); // Fallback to unanalyzed symbols
        } else {
          resolve(analyzed);
        }
      };
      
      const errorHandler = (error: Error) => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.error('Semantic worker error:', error);
        resolve(symbols); // Fallback to unanalyzed symbols
      };
      
      const timeoutHandler = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        console.warn('Semantic worker timeout - falling back to unanalyzed symbols');
        resolve(symbols);
      }, 5000); // 5 second timeout
      
      this.semanticWorker!.on('message', messageHandler);
      this.semanticWorker!.on('error', errorHandler);
      this.semanticWorker!.postMessage({ symbols, relativePath });
    });
  }
  
  /**
   * Invalidate pattern cache
   */
  private invalidatePatternCache(): void {
    this.patternCache.memCache.clear();
    this.db.prepare('DELETE FROM pattern_cache').run();
  }
  
  /**
   * Extract and classify symbols with pattern recognition
   */
  private async extractSymbols(parseResult: any, filePath: string, relativePath: string, parserUsed: string = 'streaming'): Promise<any[]> {
    const symbols: any[] = [];
    
    // Minimal debug logging for specific files if needed
    const fileName = path.basename(filePath);
    
    // Determine pipeline stage from path
    const pipelineStage = this.detectPipelineStage(relativePath);
    
    // Handle StreamingCppParser format (Sets of strings)
    if ((parseResult as any).functions instanceof Set) {
      // Convert Set<string> to array of function objects
      const functionNames = Array.from((parseResult as any).functions);
      
      // Debug output removed - parent class extraction is working
      
      for (const funcName of functionNames) {
        const funcNameStr = funcName as string;
        // Improved classification and analysis
        const isMethod = funcNameStr.includes('::');
        const parentClass = isMethod ? funcNameStr.split('::')[0] : undefined;
        const methodName = isMethod ? funcNameStr.split('::').pop() : funcNameStr;
        const kind = this.classifySymbolKind(funcNameStr, isMethod);
        const complexity = this.estimateComplexity(funcNameStr);
        
        const symbol = {
          name: methodName || funcNameStr,
          qualifiedName: funcNameStr,
          kind: kind,
          filePath,
          line: 0, // StreamingCppParser doesn't provide line numbers
          signature: funcNameStr + '(...)', // Basic signature
          returnType: undefined,
          parentClass: parentClass,
          namespace: Array.from((parseResult as any).namespaces || [])[0],
          
          // Add complexity estimation
          complexity: complexity,
          
          // Pattern detection based on name
          executionMode: this.detectExecutionModeFromName(funcNameStr, relativePath),
          isAsync: funcNameStr.toLowerCase().includes('async'),
          isFactory: this.isFactoryMethodName(funcNameStr),
          isGenerator: this.isGeneratorMethodName(funcNameStr),
          pipelineStage,
          
          // Performance hints
          returnsVectorFloat: funcNameStr.toLowerCase().includes('heightmap') || funcNameStr.toLowerCase().includes('generate'),
          usesGpuCompute: this.usesGpuComputeFromName(funcNameStr, relativePath),
          hasCpuFallback: false,
          
          // Semantic analysis
          semanticTags: this.extractSemanticTagsFromName(funcNameStr, relativePath),
          relatedSymbols: [],
          
          // Parser metadata
          parserUsed,
          parserConfidence: 0 // Will be calculated after symbol is built
        };
        
        symbols.push(symbol);
      }
      
      // Process classes from Set
      if ((parseResult as any).classes instanceof Set) {
        const classNames = Array.from((parseResult as any).classes);
        for (const className of classNames) {
          const classNameStr = className as string;
          const symbol = {
            name: classNameStr,
            qualifiedName: classNameStr,
            kind: 'class',
            filePath,
            line: 0,
            signature: null,
            returnType: null,
            parentClass: null,
            namespace: Array.from((parseResult as any).namespaces || [])[0],
            executionMode: this.detectClassExecutionModeFromName(classNameStr, relativePath),
            isAsync: false,
            isFactory: classNameStr.includes('Factory'),
            isGenerator: classNameStr.includes('Generator'),
            pipelineStage,
            returnsVectorFloat: false,
            usesGpuCompute: classNameStr.includes('GPU') || classNameStr.includes('Vulkan'),
            hasCpuFallback: false,
            semanticTags: this.extractClassSemanticTagsFromName(classNameStr, relativePath),
            relatedSymbols: [],
            
            // Parser metadata
            parserUsed,
            parserConfidence: 0 // Will be calculated after symbol is built
          };
          
          symbols.push(symbol);
        }
      }
      
      // Process exports from Set (for C++20 modules in .ixx files)
      if ((parseResult as any).exports instanceof Set) {
        const exports = Array.from((parseResult as any).exports);
        for (const exportItem of exports) {
          const exportStr = exportItem as string;
          
          // Skip module declarations (handled separately)
          if (exportStr.startsWith('module:')) continue;
          
          // Determine the kind of export
          let kind = 'export';
          let name = exportStr;
          let qualifiedName = exportStr;
          
          // Check if it's a namespace export
          if (exportStr.includes('::')) {
            const parts = exportStr.split('::');
            name = parts[parts.length - 1];
            qualifiedName = exportStr;
            kind = 'namespace_export';
          }
          
          // Check if it's a constant/variable export (common in physics constants)
          if (exportStr.includes('constexpr') || exportStr.includes('const')) {
            kind = 'constant';
            // Extract the actual constant name
            const match = exportStr.match(/(?:constexpr|const)\s+\w+\s+(\w+)/);
            if (match) {
              name = match[1];
            }
          }
          
          const symbol = {
            name: name,
            qualifiedName: qualifiedName,
            kind: kind,
            filePath,
            line: 0, // StreamingCppParser doesn't provide line numbers
            signature: exportStr,
            returnType: null,
            parentClass: null,
            namespace: Array.from((parseResult as any).namespaces || [])[0],
            
            // Pattern detection
            executionMode: 'sync',
            isAsync: false,
            isFactory: false,
            isGenerator: false,
            pipelineStage,
            
            // Performance hints
            returnsVectorFloat: false,
            usesGpuCompute: false,
            hasCpuFallback: false,
            
            // Semantic tags
            semanticTags: ['export', 'module'],
            relatedSymbols: [],
            
            // Parser metadata
            parserUsed,
            parserConfidence: 0 // Will be calculated after symbol is built
          };
          
          symbols.push(symbol);
        }
      }
      
      // Calculate real confidence for all symbols
      symbols.forEach(symbol => {
        symbol.parserConfidence = this.calculateRealConfidence(symbol, parserUsed);
      });
      
      return symbols;
    }
    
    // Check if parseResult is null or empty
    if (!parseResult || (typeof parseResult === 'object' && Object.keys(parseResult).length === 0)) {
      // Empty parse result - file likely has no symbols
      return symbols;
    }
    
    // Original code for object-based format
    // Process functions (handle both 'functions' and 'methods' keys)
    const functions = parseResult.functions || parseResult.methods || [];
    
    // Debug output removed - parent class extraction is working
    
    // Process functions with async class context extraction
    for (const func of functions) {
      // Improved classification for tree-sitter symbols
      const isMethod = !!func.className;
      const kind = this.classifySymbolKind(func.name, isMethod);
      const complexity = this.estimateComplexityFromSignature(func.signature || func.name);
      
      // Extract parent class from signature if not detected by parser
      let parentClass = func.className;
      let qualifiedName = this.buildQualifiedName(func);
      
      // If no className, try to extract from source code at the line number
      if (!parentClass && func.location?.line) {
        const extractedContext = await this.extractClassContextFromSource(filePath, func.location.line, func.name);
        if (extractedContext.parentClass) {
          parentClass = extractedContext.parentClass;
          qualifiedName = `${parentClass}::${func.name}`;
        }
      }
      
      const symbol = {
        name: func.name,
        qualifiedName: qualifiedName,
        kind: kind,
        filePath,
        line: func.location?.line || 0,
        signature: this.buildEnhancedSignature(func),
        returnType: func.returnType,
        parentClass: parentClass,
        namespace: func.namespace,
        
        // Add complexity calculation
        complexity: complexity,
        
        // Pattern detection
        executionMode: this.detectExecutionMode(func, relativePath),
        isAsync: func.signature?.includes('future<') || false,
        isFactory: this.isFactoryMethod(func),
        isGenerator: this.isGeneratorMethod(func),
        pipelineStage,
        
        // Performance hints
        returnsVectorFloat: func.returnType === 'std::vector<float>',
        usesGpuCompute: this.usesGpuCompute(func, relativePath),
        hasCpuFallback: this.hasCpuFallback(func),
        
        // Semantic analysis
        semanticTags: this.extractSemanticTags(func, relativePath),
        relatedSymbols: [],
        
        // Parser metadata
        parserUsed,
        parserConfidence: 0 // Will be calculated after symbol is built
      };
      
      symbols.push(symbol);
    }
    
    // Process classes
    for (const cls of parseResult.classes || []) {
      const symbol = {
        name: cls.name,
        qualifiedName: this.buildQualifiedName(cls),
        kind: 'class',
        filePath,
        line: cls.location?.line || 0,
        signature: this.buildClassSignature(cls),
        returnType: null,
        parentClass: null,
        namespace: cls.namespace,
        executionMode: this.detectClassExecutionMode(cls, relativePath),
        isAsync: false,
        isFactory: (cls.name || '').includes('Factory'),
        isGenerator: (cls.name || '').includes('Generator'),
        pipelineStage,
        returnsVectorFloat: false,
        usesGpuCompute: (cls.name || '').includes('GPU') || (cls.name || '').includes('Vulkan'),
        hasCpuFallback: false,
        semanticTags: this.extractClassSemanticTags(cls, relativePath),
        relatedSymbols: [],
        
        // Parser metadata
        parserUsed,
        parserConfidence: 0 // Will be calculated after symbol is built
      };
      
      symbols.push(symbol);
    }
    
    // Calculate real confidence for all symbols
    symbols.forEach(symbol => {
      symbol.parserConfidence = this.calculateRealConfidence(symbol, parserUsed);
    });
    
    // Extract comprehensive relationships from the parse data
    this.extractFileRelationships(symbols, parseResult, filePath);
    
    return symbols;
  }
  
  /**
   * Detect execution mode from function and context
   */
  private detectExecutionMode(func: any, relativePath: string): string {
    const name = (func.name || '').toLowerCase();
    const path = relativePath.toLowerCase();
    
    if (name.includes('gpu') || path.includes('gpu')) return 'gpu';
    if (name.includes('cpu')) return 'cpu';
    if (path.includes('vulkan') || path.includes('compute')) return 'gpu';
    if (func.parameters?.some((p: any) => p.type?.includes('GPUMode'))) return 'auto';
    
    return 'cpu'; // default
  }
  
  /**
   * Detect pipeline stage from file path
   */
  private detectPipelineStage(relativePath: string): string {
    const path = relativePath.toLowerCase();
    
    if (path.includes('generation/heightmap') || path.includes('generation/noise')) {
      return 'terrain_formation';
    }
    if (path.includes('generation/feature') || path.includes('generation/biome')) {
      return 'feature_placement';
    }
    if (path.includes('rendering')) {
      return 'rendering';
    }
    if (path.includes('physics')) {
      return 'physics_processing';
    }
    if (path.includes('gui')) {
      return 'gui';
    }
    if (path.includes('orchestrat')) {
      return 'orchestration';
    }
    
    return 'unknown';
  }
  
  /**
   * Check if function is a factory method
   */
  private isFactoryMethod(func: any): boolean {
    const name = (func.name || '').toLowerCase();
    return name.startsWith('create') || 
           name.startsWith('make') || 
           name.includes('factory') ||
           (func.isStatic && func.returnType?.includes('unique_ptr'));
  }
  
  /**
   * Check if function is a generator
   */
  private isGeneratorMethod(func: any): boolean {
    const name = (func.name || '').toLowerCase();
    return name.includes('generate') || 
           name.includes('build') ||
           name.includes('produce');
  }
  
  /**
   * Check if function uses GPU compute
   */
  private usesGpuCompute(func: any, relativePath: string): boolean {
    return (func.name || '').includes('GPU') ||
           relativePath.includes('Vulkan') ||
           relativePath.includes('Compute') ||
           func.parameters?.some((p: any) => 
             p.type?.includes('VkCommandBuffer') || 
             p.type?.includes('GPUBuffer')
           );
  }
  
  /**
   * Check if function has CPU fallback
   */
  private hasCpuFallback(func: any): boolean {
    // This would need more sophisticated analysis
    return func.parameters?.some((p: any) => p.type?.includes('GPUMode'));
  }
  
  /**
   * Extract semantic tags for a function
   */
  private extractSemanticTags(func: any, relativePath: string): string[] {
    const tags: string[] = [];
    const name = (func.name || '').toLowerCase();
    const signature = func.signature || '';
    
    // Action tags
    if (name.includes('generate')) tags.push('generator');
    if (name.includes('create')) tags.push('factory');
    if (name.includes('compute')) tags.push('compute');
    if (name.includes('render')) tags.push('render');
    if (name.includes('update')) tags.push('updater');
    if (name.includes('process')) tags.push('processor');
    if (name.includes('initialize') || name.includes('init')) tags.push('initializer');
    if (name.includes('cleanup') || name.includes('shutdown')) tags.push('destructor');
    if (name.includes('release') || name.includes('destroy')) tags.push('destructor');
    if (name.includes('bind')) tags.push('binder');
    if (name.includes('get') && name.length <= 6) tags.push('getter');
    if (name.includes('set') && name.length <= 6) tags.push('setter');
    
    // Resource management patterns
    if (name.includes('add') && name.includes('reference')) tags.push('ref_counting');
    if (name.includes('remove') && name.includes('reference')) tags.push('ref_counting');
    if (name.includes('pool')) tags.push('pool_management');
    if (name.includes('handle')) tags.push('handle_management');
    if (name.includes('register')) tags.push('registry');
    if (name.includes('unregister')) tags.push('registry');
    
    // Vulkan API patterns
    if (name.startsWith('vk')) {
      tags.push('vulkan_api');
      // Flag direct Vulkan API usage as potential anti-pattern
      if (relativePath.includes('ResourceManager') || relativePath.includes('Manager')) {
        tags.push('anti_pattern_direct_api');
        tags.push('solid_violation');
      }
    }
    if (name.includes('command') && name.includes('buffer')) tags.push('command_buffer');
    if (name.includes('semaphore')) tags.push('synchronization');
    if (name.includes('fence')) tags.push('synchronization');
    if (name.includes('queue')) tags.push('queue_management');
    if (name.includes('memory')) tags.push('memory_management');
    if (name.includes('pipeline')) tags.push('pipeline');
    if (name.includes('layout')) tags.push('layout');
    if (name.includes('descriptor')) tags.push('descriptor');
    if (name.includes('buffer')) tags.push('buffer');
    if (name.includes('image')) tags.push('image');
    if (name.includes('texture')) tags.push('texture');
    if (name.includes('swapchain') || name.includes('swap_chain')) tags.push('swapchain');
    
    // Threading patterns
    if (signature.includes('std::lock_guard') || signature.includes('std::mutex')) tags.push('thread_safe');
    if (signature.includes('std::thread') || name.includes('thread')) tags.push('threading');
    
    // C++ patterns
    if (signature.includes('std::unique_ptr') || signature.includes('std::shared_ptr')) tags.push('smart_pointer');
    if (signature.includes('std::vector') || signature.includes('std::array')) tags.push('container');
    if (signature.includes('std::map') || signature.includes('std::unordered_map')) tags.push('map');
    if (func.isTemplate || signature.includes('template')) tags.push('template');
    if (func.isVirtual || signature.includes('virtual')) tags.push('virtual');
    if (func.isStatic || signature.includes('static')) tags.push('static');
    if (signature.includes('const')) tags.push('const');
    
    // Domain tags
    if (name.includes('heightmap') || name.includes('height')) tags.push('heightmap');
    if (name.includes('noise')) tags.push('noise');
    if (name.includes('terrain')) tags.push('terrain');
    if (name.includes('mesh')) tags.push('mesh');
    if (name.includes('water')) tags.push('water');
    if (name.includes('erosion')) tags.push('erosion');
    if (name.includes('gpu')) tags.push('gpu');
    if (name.includes('vulkan')) tags.push('vulkan');
    
    // Performance patterns
    if (name.includes('async') || signature.includes('async')) tags.push('async');
    if (name.includes('parallel')) tags.push('parallel');
    if (name.includes('batch')) tags.push('batch');
    if (name.includes('stream')) tags.push('streaming');
    
    // Error handling patterns
    if (signature.includes('try') || signature.includes('catch')) tags.push('exception_handling');
    if (name.includes('validate')) tags.push('validation');
    if (name.includes('check')) tags.push('validation');
    
    // Data structure patterns
    if (name.includes('vector') || signature.includes('vector')) tags.push('vector_operation');
    if (name.includes('map') || signature.includes('map')) tags.push('map_operation');
    if (name.includes('queue') || signature.includes('queue')) tags.push('queue_operation');
    if (name.includes('stack') || signature.includes('stack')) tags.push('stack_operation');
    
    // Mathematical operations
    if (name.includes('normalize')) tags.push('normalization');
    if (name.includes('dot') || name.includes('cross')) tags.push('vector_math');
    if (name.includes('matrix') || name.includes('transform')) tags.push('matrix_operation');
    if (name.includes('lerp') || name.includes('interpolate')) tags.push('interpolation');
    
    // Shader/GPU patterns
    if (name.includes('shader')) tags.push('shader');
    if (name.includes('uniform')) tags.push('uniform');
    if (name.includes('ssbo') || name.includes('storage')) tags.push('storage_buffer');
    if (name.includes('dispatch')) tags.push('compute_dispatch');
    
    // Synchronization patterns
    if (name.includes('barrier')) tags.push('barrier');
    if (name.includes('wait') || name.includes('signal')) tags.push('synchronization');
    if (signature.includes('atomic')) tags.push('atomic_operation');
    
    // Module/Architecture patterns
    if (relativePath.includes('Factory')) tags.push('factory_class');
    if (relativePath.includes('Manager')) tags.push('manager_class');
    if (relativePath.includes('Base')) tags.push('base_class');
    if (relativePath.includes('Interface')) tags.push('interface');
    
    // Anti-pattern detection
    this.detectAntiPatterns(name, signature, relativePath, tags);
    
    return [...new Set(tags)];
  }
  
  /**
   * Extract semantic tags for a class
   */
  private extractClassSemanticTags(cls: any, relativePath: string): string[] {
    const tags: string[] = [];
    const name = (cls.name || '').toLowerCase();
    
    if (name.includes('generator')) tags.push('generator');
    if (name.includes('factory')) tags.push('factory');
    if (name.includes('manager')) tags.push('manager');
    if (name.includes('processor')) tags.push('processor');
    if (name.includes('orchestrator')) tags.push('orchestrator');
    
    if (cls.baseClasses?.length > 0) tags.push('derived');
    if (cls.name && cls.name.startsWith('I') && /^I[A-Z]/.test(cls.name)) tags.push('interface');
    
    return [...new Set(tags)];
  }
  
  /**
   * Detect class execution mode
   */
  private detectClassExecutionMode(cls: any, relativePath: string): string {
    if ((cls.name || '').includes('GPU')) return 'gpu';
    if ((cls.name || '').includes('CPU')) return 'cpu';
    if (relativePath.includes('Vulkan')) return 'gpu';
    return 'unknown';
  }
  
  /**
   * Build qualified name for symbol
   */
  private buildQualifiedName(symbol: any): string {
    const parts = [];
    if (symbol.namespace) parts.push(symbol.namespace);
    if (symbol.className) parts.push(symbol.className);
    parts.push(symbol.name);
    return parts.join('::');
  }
  
  /**
   * Name-based detection methods for StreamingCppParser compatibility
   */
  private detectExecutionModeFromName(name: string, relativePath: string): string {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('gpu')) return 'gpu';
    if (lowerName.includes('cpu')) return 'cpu';
    if (relativePath.toLowerCase().includes('vulkan')) return 'gpu';
    return 'cpu';
  }
  
  private isFactoryMethodName(name: string): boolean {
    const lowerName = name.toLowerCase();
    return lowerName.startsWith('create') || 
           lowerName.startsWith('make') || 
           lowerName.includes('factory');
  }
  
  private isGeneratorMethodName(name: string): boolean {
    const lowerName = name.toLowerCase();
    return lowerName.includes('generate') || 
           lowerName.includes('build') ||
           lowerName.includes('produce');
  }
  
  private usesGpuComputeFromName(name: string, relativePath: string): boolean {
    return name.includes('GPU') ||
           name.includes('Vulkan') ||
           relativePath.includes('Vulkan') ||
           relativePath.includes('GPU');
  }
  
  private extractSemanticTagsFromName(name: string, relativePath: string): string[] {
    const tags: string[] = [];
    const lowerName = name.toLowerCase();
    
    // Action tags
    if (lowerName.includes('generate')) tags.push('generator');
    if (lowerName.includes('create')) tags.push('factory');
    if (lowerName.includes('process')) tags.push('processor');
    if (lowerName.includes('compute')) tags.push('compute');
    if (lowerName.includes('initialize') || lowerName.includes('init')) tags.push('initializer');
    if (lowerName.includes('cleanup') || lowerName.includes('shutdown')) tags.push('destructor');
    if (lowerName.includes('release') || lowerName.includes('destroy')) tags.push('destructor');
    if (lowerName.includes('bind')) tags.push('binder');
    if (lowerName.includes('get') && lowerName.length <= 10) tags.push('getter');
    if (lowerName.includes('set') && lowerName.length <= 10) tags.push('setter');
    
    // Resource management patterns
    if (lowerName.includes('add') && lowerName.includes('reference')) tags.push('ref_counting');
    if (lowerName.includes('remove') && lowerName.includes('reference')) tags.push('ref_counting');
    if (lowerName.includes('pool')) tags.push('pool_management');
    if (lowerName.includes('handle')) tags.push('handle_management');
    if (lowerName.includes('register')) tags.push('registry');
    if (lowerName.includes('unregister')) tags.push('registry');
    
    // Vulkan API patterns
    if (lowerName.startsWith('vk')) {
      tags.push('vulkan_api');
      // Flag direct Vulkan API usage as potential anti-pattern
      if (relativePath.includes('ResourceManager') || relativePath.includes('Manager')) {
        tags.push('anti_pattern_direct_api');
        tags.push('solid_violation');
      }
    }
    if (lowerName.includes('command') && lowerName.includes('buffer')) tags.push('command_buffer');
    if (lowerName.includes('semaphore')) tags.push('synchronization');
    if (lowerName.includes('fence')) tags.push('synchronization');
    if (lowerName.includes('queue')) tags.push('queue_management');
    if (lowerName.includes('memory')) tags.push('memory_management');
    if (lowerName.includes('pipeline')) tags.push('pipeline');
    if (lowerName.includes('layout')) tags.push('layout');
    if (lowerName.includes('descriptor')) tags.push('descriptor');
    if (lowerName.includes('buffer')) tags.push('buffer');
    if (lowerName.includes('image')) tags.push('image');
    if (lowerName.includes('texture')) tags.push('texture');
    if (lowerName.includes('swapchain') || lowerName.includes('swap_chain')) tags.push('swapchain');
    
    // Domain tags
    if (lowerName.includes('heightmap')) tags.push('heightmap');
    if (lowerName.includes('noise')) tags.push('noise');
    if (lowerName.includes('terrain')) tags.push('terrain');
    if (lowerName.includes('vulkan')) tags.push('vulkan');
    if (lowerName.includes('render')) tags.push('render');
    if (lowerName.includes('gpu')) tags.push('gpu');
    
    // Additional patterns for better coverage
    if (lowerName.includes('thread')) tags.push('threading');
    if (lowerName.includes('async')) tags.push('async');
    if (lowerName.includes('sync')) tags.push('synchronization');
    if (lowerName.includes('lock')) tags.push('locking');
    if (lowerName.includes('mutex')) tags.push('mutex');
    if (lowerName.includes('atomic')) tags.push('atomic');
    if (lowerName.includes('cache')) tags.push('caching');
    if (lowerName.includes('optimize')) tags.push('optimization');
    if (lowerName.includes('validate')) tags.push('validation');
    if (lowerName.includes('error')) tags.push('error_handling');
    if (lowerName.includes('exception')) tags.push('exception');
    if (lowerName.includes('debug')) tags.push('debugging');
    if (lowerName.includes('log')) tags.push('logging');
    if (lowerName.includes('trace')) tags.push('tracing');
    if (lowerName.includes('profile')) tags.push('profiling');
    if (lowerName.includes('measure')) tags.push('measurement');
    if (lowerName.includes('benchmark')) tags.push('benchmarking');
    if (lowerName.includes('copy')) tags.push('copy_operation');
    if (lowerName.includes('move')) tags.push('move_operation');
    if (lowerName.includes('transform')) tags.push('transformation');
    if (lowerName.includes('convert')) tags.push('conversion');
    if (lowerName.includes('serialize')) tags.push('serialization');
    if (lowerName.includes('deserialize')) tags.push('deserialization');
    
    // Architecture patterns from path
    if (relativePath.includes('Factory')) tags.push('factory_class');
    if (relativePath.includes('Manager')) tags.push('manager_class');
    if (relativePath.includes('Base')) tags.push('base_class');
    if (relativePath.includes('Core')) tags.push('core_component');
    if (relativePath.includes('Util')) tags.push('utility');
    if (relativePath.includes('Helper')) tags.push('helper');
    if (relativePath.includes('Test')) tags.push('test_code');
    
    // Apply anti-pattern detection for name-based extraction too
    this.detectAntiPatterns(name, '', relativePath, tags);
    
    return [...new Set(tags)];
  }
  
  private detectClassExecutionModeFromName(name: string, relativePath: string): string {
    if (name.includes('GPU')) return 'gpu';
    if (name.includes('CPU')) return 'cpu';
    if (name.includes('Vulkan')) return 'gpu';
    return 'unknown';
  }
  
  private extractClassSemanticTagsFromName(name: string, relativePath: string): string[] {
    const tags: string[] = [];
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('generator')) tags.push('generator');
    if (lowerName.includes('factory')) tags.push('factory');
    if (lowerName.includes('manager')) tags.push('manager');
    if (lowerName.includes('vulkan')) tags.push('vulkan');
    
    return [...new Set(tags)];
  }
  
  /**
   * Build semantic connections between symbols
   */
  private async buildSemanticConnections(symbols: any[]): Promise<void> {
    const insertConn = this.db.prepare(`
      INSERT OR IGNORE INTO semantic_connections 
      (symbol_id, connected_id, connection_type, confidence)
      VALUES (?, ?, ?, ?)
    `);
    
    // Find GPU/CPU pairs
    for (const symbol of symbols) {
      if (symbol.executionMode === 'gpu') {
        // Look for CPU counterpart
        const cpuName = symbol.name.replace(/GPU/g, '').replace(/gpu/g, '');
        
        // Get symbol ID if not present
        if (!symbol.id) {
          const dbSymbol = this.db.prepare(`
            SELECT id FROM enhanced_symbols 
            WHERE name = ? AND file_path = ?
          `).get(symbol.name, symbol.filePath) as any;
          if (dbSymbol) symbol.id = dbSymbol.id;
        }
        
        if (symbol.id) {
          const cpuSymbol = this.db.prepare(`
            SELECT id FROM enhanced_symbols 
            WHERE name = ? AND execution_mode = 'cpu'
            AND pipeline_stage = ?
          `).get(cpuName, symbol.pipelineStage) as any;
          
          if (cpuSymbol) {
            insertConn.run(symbol.id, cpuSymbol.id, 'gpu_cpu_pair', 0.9);
          }
        }
      }
    }
    
    // Find factory-product relationships
    for (const symbol of symbols) {
      if (symbol.isFactory && symbol.returnType) {
        // Extract the type being created
        const match = symbol.returnType.match(/(?:unique_ptr|shared_ptr)<(.+?)>/);
        if (match) {
          const productType = match[1].trim();
          const product = this.db.prepare(`
            SELECT id FROM enhanced_symbols 
            WHERE name = ? AND kind = 'class'
          `).get(productType) as any;
          
          if (product) {
            insertConn.run(symbol.id, product.id, 'factory_product', 0.95);
          }
        }
      }
    }
  }
  
  /**
   * Fast query methods for agent tools
   */
  
  async findImplementationsFast(request: {
    keywords: string[],
    returnType?: string,
    executionMode?: string,
    pipelineStage?: string
  }): Promise<any[]> {
    let query = `
      SELECT * FROM enhanced_symbols 
      WHERE kind IN ('function', 'method')
    `;
    const params: any[] = [];
    
    // Enhanced keyword search using semantic tags and names
    if (request.keywords.length > 0) {
      const conditions = [];
      for (const keyword of request.keywords) {
        conditions.push(`(semantic_tags LIKE ? OR name LIKE ? OR signature LIKE ?)`);
        params.push(`%"${keyword}"%`, `%${keyword}%`, `%${keyword}%`);
      }
      query += ` AND (${conditions.join(' OR ')})`;
    }
    
    // Return type filter with optimization
    if (request.returnType) {
      if (request.returnType === 'std::vector<float>') {
        query += ` AND returns_vector_float = 1`;
      } else {
        query += ` AND return_type = ?`;
        params.push(request.returnType);
      }
    }
    
    // Execution mode filter
    if (request.executionMode) {
      query += ` AND execution_mode = ?`;
      params.push(request.executionMode);
    }
    
    // Pipeline stage filter
    if (request.pipelineStage) {
      query += ` AND pipeline_stage = ?`;
      params.push(request.pipelineStage);
    }
    
    query += ` ORDER BY line DESC LIMIT 50`;
    
    return this.db.prepare(query).all(...params);
  }
  
  async findGpuImplementations(baseFunction: string): Promise<any[]> {
    // Use semantic connections for fast lookup
    return this.db.prepare(`
      SELECT es.* FROM enhanced_symbols es
      JOIN semantic_connections sc ON es.id = sc.connected_id
      WHERE sc.symbol_id = (
        SELECT id FROM enhanced_symbols WHERE name = ? LIMIT 1
      )
      AND sc.connection_type = 'gpu_cpu_pair'
      AND es.execution_mode = 'gpu'
    `).all(baseFunction);
  }
  
  async findByPattern(pattern: string): Promise<any[]> {
    // Check memory cache first
    if (this.patternCache.memCache.has(pattern)) {
      return this.patternCache.memCache.get(pattern)!;
    }
    
    // Check database cache
    const cached = this.db.prepare(`
      SELECT symbol_ids FROM pattern_cache 
      WHERE pattern_name = ? 
      AND last_updated > ?
    `).get(pattern, Date.now() - 3600000) as any; // 1 hour cache
    
    if (cached) {
      const ids = JSON.parse(cached.symbol_ids);
      const results = this.db.prepare(`
        SELECT * FROM enhanced_symbols 
        WHERE id IN (${ids.map(() => '?').join(',')})
      `).all(...ids);
      
      // Store in memory cache
      this.updateMemoryCache(pattern, results);
      return results;
    }
    
    // Compute pattern match
    const results = await this.computePatternMatch(pattern);
    
    // Cache results in database
    if (results.length > 0) {
      this.db.prepare(`
        INSERT OR REPLACE INTO pattern_cache (pattern_name, symbol_ids, last_updated)
        VALUES (?, ?, ?)
      `).run(pattern, JSON.stringify(results.map(r => r.id)), Date.now());
    }
    
    // Store in memory cache
    this.updateMemoryCache(pattern, results);
    
    return results;
  }
  
  private updateMemoryCache(pattern: string, results: any[]): void {
    // LRU cache implementation
    if (this.patternCache.memCache.size >= this.patternCache.maxSize) {
      // Remove oldest entry
      const firstKey = this.patternCache.memCache.keys().next().value;
      if (firstKey !== undefined) {
        this.patternCache.memCache.delete(firstKey);
      }
    }
    this.patternCache.memCache.set(pattern, results);
  }
  
  // Clear pattern cache for fresh searches
  clearPatternCache(): void {
    this.patternCache.memCache.clear();
    this.db.prepare(`DELETE FROM pattern_cache`).run();
  }
  
  private async computePatternMatch(pattern: string): Promise<any[]> {
    // Pattern matching logic based on common queries
    if (pattern === 'gpu_heightmap_generators') {
      return this.db.prepare(`
        SELECT * FROM enhanced_symbols
        WHERE execution_mode = 'gpu'
        AND semantic_tags LIKE '%heightmap%'
        AND semantic_tags LIKE '%generator%'
        AND kind = 'function'
      `).all();
    }
    
    if (pattern === 'factory_methods') {
      return this.db.prepare(`
        SELECT * FROM enhanced_symbols
        WHERE is_factory = 1
        AND kind = 'function'
      `).all();
    }
    
    if (pattern === 'async_functions') {
      return this.db.prepare(`
        SELECT * FROM enhanced_symbols
        WHERE is_async = 1
        AND kind = 'function'
      `).all();
    }
    
    if (pattern === 'gpu_cpu_pairs') {
      return this.db.prepare(`
        SELECT es1.*, es2.name as cpu_counterpart
        FROM enhanced_symbols es1
        JOIN semantic_connections sc ON es1.id = sc.symbol_id
        JOIN enhanced_symbols es2 ON sc.connected_id = es2.id
        WHERE sc.connection_type = 'gpu_cpu_pair'
      `).all();
    }
    
    // Vulkan function pattern matching
    if (pattern.startsWith('vk') || pattern.includes('Create') || pattern.includes('Pipeline')) {
      return this.db.prepare(`
        SELECT * FROM enhanced_symbols
        WHERE (name LIKE ? OR signature LIKE ? OR qualified_name LIKE ?)
        AND kind IN ('function', 'method')
        ORDER BY 
          CASE 
            WHEN name = ? THEN 1
            WHEN name LIKE ? THEN 2
            WHEN signature LIKE ? THEN 3
            ELSE 4
          END
        LIMIT 50
      `).all(
        `%${pattern}%`, `%${pattern}%`, `%${pattern}%`,
        pattern, `${pattern}%`, `%${pattern}%`
      );
    }
    
    // Generic pattern search in name and tags with better scoring
    return this.db.prepare(`
      SELECT * FROM enhanced_symbols
      WHERE (name LIKE ? OR signature LIKE ? OR semantic_tags LIKE ?)
      AND kind IN ('function', 'method', 'class', 'struct')
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN name LIKE ? THEN 2
          WHEN signature LIKE ? THEN 3
          ELSE 4
        END
      LIMIT 100
    `).all(
      `%${pattern}%`, `%${pattern}%`, `%"${pattern}"%`,
      pattern, `${pattern}%`, `%${pattern}%`
    );
  }
  
  async query(options: {
    tags?: string[];
    executionMode?: string;
    pipelineStage?: string;
    isFactory?: boolean;
    kind?: string;
    limit?: number;
  }): Promise<any[]> {
    // Build cache key
    const cacheKey = JSON.stringify(options);
    if (this.patternCache.memCache.has(cacheKey)) {
      return this.patternCache.memCache.get(cacheKey)!;
    }
    
    // Build query
    const conditions = [];
    const params = [];
    
    if (options.tags && options.tags.length > 0) {
      conditions.push(`(
        ${options.tags.map(() => 'semantic_tags LIKE ?').join(' OR ')}
      )`);
      params.push(...options.tags.map(tag => `%"${tag}"%`));
    }
    
    if (options.executionMode) {
      conditions.push('execution_mode = ?');
      params.push(options.executionMode);
    }
    
    if (options.pipelineStage) {
      conditions.push('pipeline_stage = ?');
      params.push(options.pipelineStage);
    }
    
    if (options.isFactory !== undefined) {
      conditions.push('is_factory = ?');
      params.push(options.isFactory ? 1 : 0);
    }
    
    if (options.kind) {
      conditions.push('kind = ?');
      params.push(options.kind);
    }
    
    let query = 'SELECT * FROM enhanced_symbols';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY line DESC';
    if (options.limit) {
      query += ' LIMIT ' + options.limit;
    }
    
    const results = this.db.prepare(query).all(...params);
    
    // Cache results
    this.updateMemoryCache(cacheKey, results);
    
    return results;
  }
  
  /**
   * Detect anti-patterns and architectural violations
   */
  private detectAntiPatterns(name: string, signature: string, relativePath: string, tags: string[]): void {
    const lowerName = name.toLowerCase();
    const lowerPath = relativePath.toLowerCase();
    
    // SOLID Violations
    
    // Single Responsibility Principle violations
    if (lowerPath.includes('manager')) {
      // Managers doing low-level work
      if (lowerName.startsWith('vk') || lowerName.includes('malloc') || lowerName.includes('new ')) {
        tags.push('anti_pattern_srp_violation');
        tags.push('should_delegate');
      }
      
      // Managers handling multiple domains
      if ((lowerName.includes('command') && lowerName.includes('buffer')) && 
          (lowerName.includes('pipeline') || lowerName.includes('memory'))) {
        tags.push('anti_pattern_god_object');
      }
    }
    
    // Dependency Inversion Principle violations
    if (lowerPath.includes('resourcemanager') && lowerName.startsWith('vk')) {
      tags.push('anti_pattern_dip_violation');
      tags.push('should_use_interface');
      
      // Suggest which manager should handle this
      if (lowerName.includes('commandpool') || lowerName.includes('commandbuffer')) {
        tags.push('should_use_command_buffer_manager');
      } else if (lowerName.includes('pipeline')) {
        tags.push('should_use_pipeline_manager');
      } else if (lowerName.includes('memory') || lowerName.includes('buffer') || lowerName.includes('image')) {
        tags.push('should_use_buffer_manager');
      } else if (lowerName.includes('semaphore') || lowerName.includes('fence')) {
        tags.push('should_use_sync_manager');
      }
    }
    
    // Open/Closed Principle violations
    if (lowerName.includes('switch') && signature.includes('enum')) {
      tags.push('anti_pattern_ocp_violation');
      tags.push('consider_polymorphism');
    }
    
    // Factory Pattern Violations
    
    // Direct object creation outside factories
    if (lowerName.includes('create') && !lowerName.includes('factory')) {
      // Check for complex object creation that should use factories
      if (lowerName.includes('pipeline') || lowerName.includes('descriptor') || 
          lowerName.includes('buffer') || lowerName.includes('texture')) {
        
        // If it's not in a factory or builder, flag it
        if (!lowerPath.includes('factory') && !lowerPath.includes('builder') && 
            !lowerPath.includes('manager')) {
          tags.push('consider_factory_pattern');
          tags.push('complex_object_creation');
        }
      }
    }
    
    // God Object anti-pattern - classes that create too many different types
    if (lowerName.includes('create') && lowerPath.includes('base')) {
      tags.push('potential_god_object');
      tags.push('delegate_creation_responsibility');
    }
    
    // Memory Management Anti-patterns
    if (lowerName.includes('malloc') || lowerName.includes('free') || 
        (lowerName.includes('new') && !lowerName.includes('unique') && !lowerName.includes('shared'))) {
      tags.push('anti_pattern_raw_memory');
      tags.push('use_smart_pointers');
    }
    
    // Threading Anti-patterns
    if (lowerName.includes('thread') && !signature.includes('std::')) {
      tags.push('anti_pattern_raw_thread');
      tags.push('use_std_thread');
    }
    
    // Resource Management Anti-patterns
    if ((lowerName.includes('create') && !lowerName.includes('destroy')) ||
        (lowerName.includes('alloc') && !lowerName.includes('free'))) {
      tags.push('potential_memory_leak');
      tags.push('check_raii_pattern');
    }
    
    // Performance Anti-patterns
    if (lowerName.includes('get') && signature.includes('std::vector') && signature.includes('&')) {
      tags.push('potential_performance_issue');
      tags.push('consider_const_ref');
    }
    
    // Vulkan-specific anti-patterns
    if (lowerPath.includes('vulkan')) {
      // Direct API usage in high-level managers
      if (lowerName.startsWith('vk') && (lowerPath.includes('manager') || lowerPath.includes('orchestrat'))) {
        tags.push('anti_pattern_abstraction_leak');
        tags.push('encapsulate_vulkan_api');
      }
      
      // Pipeline Factory Pattern Violations
      if (lowerName.includes('vkcreatepipeline') || lowerName.includes('vkcreategraphicspipeline') || 
          lowerName.includes('vkcreatecomputepipeline')) {
        
        // Check if it's outside of proper factory locations
        if (!lowerPath.includes('pipelinefactory') && !lowerPath.includes('pipelinebuilder')) {
          tags.push('anti_pattern_pipeline_factory_violation');
          tags.push('should_use_pipeline_factory');
          tags.push('factory_pattern_violation');
          
          // Specific recommendations based on pipeline type
          if (lowerName.includes('compute')) {
            tags.push('use_pipeline_factory_create_compute');
          } else if (lowerName.includes('graphics')) {
            tags.push('use_pipeline_factory_create_graphics');
          }
          
          // Flag specific modules that should delegate
          if (lowerPath.includes('compute') && !lowerPath.includes('builder')) {
            tags.push('compute_module_should_delegate');
          }
          if (lowerPath.includes('base') || lowerPath.includes('core')) {
            tags.push('base_module_abstraction_violation');
          }
        }
      }
      
      // Pipeline Layout Creation Violations
      if (lowerName.includes('vkcreatepipelinelayout')) {
        if (!lowerPath.includes('pipelinefactory') && !lowerPath.includes('pipelinebuilder') && 
            !lowerPath.includes('descriptormanager')) {
          tags.push('anti_pattern_layout_creation_violation');
          tags.push('should_use_descriptor_manager');
          tags.push('pipeline_layout_anti_pattern');
        }
      }
      
      // Direct Descriptor Set Layout Creation
      if (lowerName.includes('vkcreatedescriptorsetlayout')) {
        if (!lowerPath.includes('descriptormanager') && !lowerPath.includes('descriptorlayoutbuilder')) {
          tags.push('anti_pattern_descriptor_layout_violation');
          tags.push('should_use_descriptor_layout_builder');
        }
      }
      
      // Missing error checking
      if (lowerName.startsWith('vk') && !signature.includes('VkResult') && !lowerName.includes('get')) {
        tags.push('potential_missing_error_check');
      }
      
      // Resource cleanup patterns
      if (lowerName.includes('destroy') && !lowerName.includes('cleanup')) {
        tags.push('verify_cleanup_order');
      }
    }
    
    // Code Quality Issues
    
    // Naming conventions
    if (lowerName.length > 30) {
      tags.push('code_smell_long_name');
    }
    
    if (lowerName.includes('temp') || lowerName.includes('tmp') || lowerName.includes('hack')) {
      tags.push('code_smell_temporary_code');
    }
    
    // Function complexity indicators
    if (signature.includes('&&') && signature.split('&&').length > 3) {
      tags.push('code_smell_complex_condition');
    }
    
    // Architecture-specific recommendations
    if (lowerPath.includes('generation') && (lowerName.includes('vulkan') || lowerName.includes('render'))) {
      tags.push('architectural_violation_layer_mixing');
      tags.push('move_to_rendering_layer');
    }
    
    if (lowerPath.includes('rendering') && (lowerName.includes('generate') || lowerName.includes('noise'))) {
      tags.push('architectural_violation_layer_mixing');
      tags.push('move_to_generation_layer');
    }
  }

  /**
   * Run enhanced anti-pattern detection on indexed files
   */
  private async runAntiPatternDetection(validResults: any[]): Promise<void> {
    console.log(`🔍 Running enhanced anti-pattern detection on ${validResults.length} files...`);
    
    let totalDetections = 0;
    const startTime = Date.now();
    
    // Re-enabled: File-based anti-pattern detection with timeout protection and chunking
    try {
      const fileBasedDetections = await Promise.race([
        this.detectFileBasedAntiPatternsWithTimeout(validResults),
        new Promise<number>((_, reject) => 
          setTimeout(() => reject(new Error('File-based detection timeout')), 30000) // 30 second total timeout
        )
      ]);
      totalDetections += fileBasedDetections;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === 'File-based detection timeout') {
        console.log(`  ⚠️  File-based detection timed out after 30 seconds, skipping`);
      } else {
        console.log(`  ⚠️  File-based detection failed: ${errorMessage}`);
      }
    }
    
    // Also run AST-based detection using symbols we already have
    totalDetections += await this.detectASTAntiPatterns();
    
    // Add simple naming convention anti-patterns that should definitely detect something
    totalDetections += await this.detectSimpleAntiPatterns();
    
    const elapsed = Date.now() - startTime;
    console.log(`  Detected ${totalDetections} anti-patterns in ${validResults.length} files (${elapsed}ms)`);
  }

  /**
   * Detect file-based anti-patterns with timeout protection and chunking
   */
  private async detectFileBasedAntiPatternsWithTimeout(validResults: any[]): Promise<number> {
    console.log(`  🔍 Running file-based anti-pattern detection on ${validResults.length} files...`);
    
    let totalDetections = 0;
    const BATCH_SIZE = 5; // Process 5 files at a time
    const FILE_TIMEOUT = 10000; // 10 seconds per file
    
    for (let i = 0; i < validResults.length; i += BATCH_SIZE) {
      const batch = validResults.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (result) => {
        let timeoutId: NodeJS.Timeout;
        
        try {
          return await Promise.race([
            this.analyzeFileForAntiPatterns(result),
            new Promise<number>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('File analysis timeout')), FILE_TIMEOUT);
            })
          ]);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage === 'File analysis timeout') {
            console.log(`  ⚠️  Timeout analyzing ${path.basename(result.filePath)}`);
          } else {
            console.log(`  ⚠️  Error analyzing ${path.basename(result.filePath)}: ${errorMessage}`);
          }
          return 0;
        } finally {
          // Always clear the timeout
          if (timeoutId!) clearTimeout(timeoutId);
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      totalDetections += batchResults.reduce((sum, count) => sum + count, 0);
      
      // Small delay between batches to prevent overwhelming the system
      if (i + BATCH_SIZE < validResults.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`  📁 File-based detection completed: ${totalDetections} patterns found`);
    return totalDetections;
  }

  /**
   * Analyze a single file for anti-patterns with timeout protection
   */
  private async analyzeFileForAntiPatterns(result: any): Promise<number> {
    try {
      // Read file content for anti-pattern analysis
      const content = await fs.readFile(result.filePath, 'utf-8');
      
      // Skip very large files that might cause regex issues
      if (content.length > 200000) { // Increased to 200KB limit
        console.log(`  ⚠️  Skipping large file: ${path.basename(result.filePath)} (${Math.round(content.length/1024)}KB)`);
        return 0;
      }
      
      // Skip files with potential problematic content that could cause regex hangs
      if (this.hasProblematicContent(content)) {
        console.log(`  ⚠️  Skipping file with problematic content: ${path.basename(result.filePath)}`);
        return 0;
      }
      
      // Run simple file-based anti-pattern detection (safer than regex-heavy enhanced detector)
      const report = await this.simplifiedFileAnalysis(result.filePath, content);
      
      if (report.totalDetections > 0) {
        // Update semantic tags for symbols in this file with detected anti-patterns
        await this.updateSymbolsWithAntiPatterns(result.filePath, report);
        return report.totalDetections;
      }
      
      return 0;
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Simplified file analysis that's safe and fast
   */
  private async simplifiedFileAnalysis(filePath: string, content: string): Promise<any> {
    const detections: any[] = [];
    const lines = content.split('\n');
    
    // Simple string-based checks (no complex regex)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const lineNumber = i + 1;
      
      // Memory management issues
      if (line.includes('new ') && !line.includes('unique_ptr') && !line.includes('shared_ptr')) {
        detections.push({
          patternName: 'raw_pointer_usage',
          line: lineNumber,
          severity: 'medium',
          description: 'Potential raw pointer usage'
        });
      }
      
      // C-style memory management
      if (line.includes('malloc(') || line.includes('free(') || line.includes('calloc(')) {
        detections.push({
          patternName: 'c_style_memory',
          line: lineNumber,
          severity: 'high',
          description: 'C-style memory management'
        });
      }
      
      // Long parameter lists (>5 parameters)
      const paramMatches = line.match(/\([^)]*,.*?,.*?,.*?,.*?,/);
      if (paramMatches) {
        detections.push({
          patternName: 'long_parameter_list',
          line: lineNumber,
          severity: 'low',
          description: 'Long parameter list'
        });
      }
      
      // God class indicators (very long classes)
      if (line.includes('class ') && content.length > 50000) {
        detections.push({
          patternName: 'god_class_candidate',
          line: lineNumber,
          severity: 'medium',
          description: 'Potentially oversized class'
        });
      }
      
      // Missing const correctness
      if (line.includes('get') && line.includes('()') && !line.includes('const')) {
        detections.push({
          patternName: 'missing_const',
          line: lineNumber,
          severity: 'low',
          description: 'Getter method should be const'
        });
      }
    }
    
    return {
      totalDetections: detections.length,
      detections,
      fileAnalysis: {
        complexity: detections.length > 10 ? 'high' : detections.length > 5 ? 'medium' : 'low',
        maintainability: detections.length > 15 ? 'poor' : detections.length > 5 ? 'fair' : 'good'
      }
    };
  }

  /**
   * Check if file content has patterns that could cause regex hangs
   */
  private hasProblematicContent(content: string): boolean {
    // Check for extremely long lines that could cause regex issues
    const lines = content.split('\n');
    const maxLineLength = Math.max(...lines.map(line => line.length));
    if (maxLineLength > 10000) return true;
    
    // Check for excessive repetitive patterns
    const repetitivePatterns = [
      /(.{10,})\1{10,}/, // Same 10+ char sequence repeated 10+ times
      /\/\*[\s\S]{50000,}\*\//, // Very large comment blocks
      /\/{20,}/, // Long comment lines
      /#{50,}/, // Long preprocessor lines
      /\s{1000,}/, // Excessive whitespace
    ];
    
    for (const pattern of repetitivePatterns) {
      if (pattern.test(content)) return true;
    }
    
    return false;
  }

  /**
   * Safely analyze file with timeout and error handling
   */
  private async safeAnalyzeFile(filePath: string, content: string): Promise<any> {
    let timeoutId: NodeJS.Timeout;
    
    try {
      // Create a promise that wraps the analysis with timeout
      return await Promise.race([
        this.antiPatternDetector.analyzeFile(filePath, content),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Analysis timeout')), 8000); // 8 second timeout per file
        })
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === 'Analysis timeout') {
        console.log(`    ⏱️  Analysis timeout for ${path.basename(filePath)}`);
      } else {
        console.log(`    ❌ Analysis error for ${path.basename(filePath)}: ${errorMessage}`);
      }
      
      // Return empty report on error
      return {
        totalDetections: 0,
        detections: [],
        fileAnalysis: {
          complexity: 'unknown',
          maintainability: 'unknown'
        }
      };
    } finally {
      // Always clear the timeout
      if (timeoutId!) clearTimeout(timeoutId);
    }
  }

  /**
   * Update symbols with anti-pattern information
   */
  private async updateSymbolsWithAntiPatterns(filePath: string, report: any): Promise<void> {
    // Add anti-pattern tags to semantic_tags for symbols in affected lines
    for (const detection of report.detections) {
      const antiPatternTag = `anti_pattern_${detection.patternName.toLowerCase().replace(/\s+/g, '_')}`;
      
      // Update symbols near the detection line
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          ?
        )
        WHERE file_path = ? 
        AND line BETWEEN ? AND ?
        AND semantic_tags NOT LIKE '%' || ? || '%'
      `).run(
        antiPatternTag,
        filePath,
        Math.max(1, detection.lineNumber - 2),
        detection.lineNumber + 2,
        antiPatternTag
      );
    }
  }

  /**
   * Detect anti-patterns using AST data already in the database
   */
  private async detectASTAntiPatterns(): Promise<number> {
    let detectionCount = 0;
    
    // God Object detection - classes with too many methods (lowered threshold)
    const godObjects = this.db.prepare(`
      SELECT 
        file_path,
        parent_class,
        COUNT(*) as method_count,
        AVG(complexity) as avg_complexity
      FROM enhanced_symbols 
      WHERE kind = 'method' AND parent_class IS NOT NULL
      GROUP BY file_path, parent_class
      HAVING method_count > 8  -- Classes with more than 8 methods
    `).all() as any[];

    for (const god of godObjects) {
      // Add anti-pattern tag to all methods in this class
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'anti_pattern_god_object'
        )
        WHERE file_path = ? AND parent_class = ?
        AND semantic_tags NOT LIKE '%anti_pattern_god_object%'
      `).run(god.file_path, god.parent_class);
      
      detectionCount++;
    }

    // Complex methods detection (lowered threshold)
    const complexMethods = this.db.prepare(`
      SELECT file_path, name, complexity, line
      FROM enhanced_symbols 
      WHERE kind = 'method' AND complexity > 5
    `).all() as any[];

    for (const method of complexMethods) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'anti_pattern_complex_method'
        )
        WHERE id = (
          SELECT id FROM enhanced_symbols 
          WHERE file_path = ? AND name = ? AND line = ?
          LIMIT 1
        )
        AND semantic_tags NOT LIKE '%anti_pattern_complex_method%'
      `).run(method.file_path, method.name, method.line);
      
      detectionCount++;
    }

    // Long parameter lists detection (lowered threshold)
    const longParamMethods = this.db.prepare(`
      SELECT file_path, name, signature, line
      FROM enhanced_symbols 
      WHERE kind = 'method' 
      AND signature IS NOT NULL
      AND (length(signature) - length(replace(signature, ',', ''))) > 3  -- More than 3 parameters
    `).all() as any[];

    for (const method of longParamMethods) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'anti_pattern_long_parameter_list'
        )
        WHERE file_path = ? AND name = ? AND line = ?
        AND semantic_tags NOT LIKE '%anti_pattern_long_parameter_list%'
      `).run(method.file_path, method.name, method.line);
      
      detectionCount++;
    }

    return detectionCount;
  }

  /**
   * Classify symbol kind based on name patterns
   */
  private classifySymbolKind(name: string, isMethod: boolean): string {
    const lowerName = name.toLowerCase();
    
    // Constructors
    if (isMethod && name.includes('::') && name.split('::')[1] === name.split('::')[0]) {
      return 'constructor';
    }
    
    // Destructors
    if (lowerName.includes('~') || lowerName.includes('destructor')) {
      return 'destructor';
    }
    
    // Operators
    if (lowerName.includes('operator')) {
      return 'operator';
    }
    
    // Methods vs functions
    if (isMethod) {
      return 'method';
    }
    
    return 'function';
  }

  /**
   * Estimate complexity based on function name patterns
   */
  private estimateComplexity(name: string): number {
    let complexity = 1; // Base complexity
    const lowerName = name.toLowerCase();
    
    // Heuristics based on common patterns
    if (lowerName.includes('if') || lowerName.includes('when') || lowerName.includes('check')) {
      complexity += 1;
    }
    
    if (lowerName.includes('loop') || lowerName.includes('iterate') || lowerName.includes('foreach')) {
      complexity += 2;
    }
    
    if (lowerName.includes('switch') || lowerName.includes('case')) {
      complexity += 2;
    }
    
    if (lowerName.includes('recursive') || lowerName.includes('recurse')) {
      complexity += 3;
    }
    
    if (lowerName.includes('complex') || lowerName.includes('advanced')) {
      complexity += 2;
    }
    
    // Template or generic functions tend to be more complex
    if (name.includes('<') || name.includes('template')) {
      complexity += 1;
    }
    
    // GPU/Vulkan functions tend to be complex
    if (lowerName.includes('vulkan') || lowerName.includes('gpu') || lowerName.includes('compute')) {
      complexity += 2;
    }
    
    // Factory and manager patterns often have complex logic
    if (lowerName.includes('factory') || lowerName.includes('manager') || lowerName.includes('orchestrator')) {
      complexity += 1;
    }
    
    return Math.min(complexity, 15); // Cap at 15
  }

  /**
   * Estimate complexity from function signature and patterns
   */
  private estimateComplexityFromSignature(signature: string): number {
    let complexity = this.estimateComplexity(signature); // Base estimation from name
    
    if (!signature) return complexity;
    
    // Count parameters (each parameter adds complexity)
    const paramCount = (signature.match(/,/g) || []).length + (signature.includes('(') ? 1 : 0);
    if (paramCount > 3) {
      complexity += Math.floor(paramCount / 2);
    }
    
    // Template functions are more complex
    if (signature.includes('<') && signature.includes('>')) {
      complexity += 2;
    }
    
    // Pointer parameters add complexity
    const pointerCount = (signature.match(/\*/g) || []).length;
    complexity += pointerCount;
    
    // Reference parameters add some complexity
    const refCount = (signature.match(/&/g) || []).length;
    complexity += Math.floor(refCount / 2);
    
    // Complex return types
    if (signature.includes('std::') || signature.includes('::')) {
      complexity += 1;
    }
    
    return Math.min(complexity, 20); // Higher cap for signature-based estimation
  }

  /**
   * Detect simple anti-patterns that should easily find violations
   */
  private async detectSimpleAntiPatterns(): Promise<number> {
    let detectionCount = 0;
    
    // Naming convention violations - functions/classes with poor names
    const poorNames = this.db.prepare(`
      SELECT file_path, name, qualified_name, kind
      FROM enhanced_symbols 
      WHERE (
        name LIKE '%temp%' OR 
        name LIKE '%tmp%' OR 
        name LIKE '%test%' OR 
        name LIKE '%hack%' OR
        name LIKE '%Manager%Manager%' OR
        name LIKE '%Data%' OR
        LENGTH(name) > 25
      )
      AND kind != 'class'  -- Classes might legitimately have descriptive names
    `).all() as any[];

    for (const symbol of poorNames) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'anti_pattern_poor_naming'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%anti_pattern_poor_naming%'
      `).run(symbol.file_path, symbol.name);
      
      detectionCount++;
    }

    // Functions with "Manager" in the name (potential God Object pattern)
    const managerFunctions = this.db.prepare(`
      SELECT file_path, name
      FROM enhanced_symbols 
      WHERE name LIKE '%Manager%' AND kind = 'function'
    `).all() as any[];

    for (const func of managerFunctions) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'anti_pattern_manager_function'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%anti_pattern_manager_function%'
      `).run(func.file_path, func.name);
      
      detectionCount++;
    }

    // Functions with excessive parameters (signature-based)
    const longSignatures = this.db.prepare(`
      SELECT file_path, name, signature
      FROM enhanced_symbols 
      WHERE signature IS NOT NULL 
      AND LENGTH(signature) > 100  -- Very long signatures
    `).all() as any[];

    for (const func of longSignatures) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'anti_pattern_long_signature'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%anti_pattern_long_signature%'
      `).run(func.file_path, func.name);
      
      detectionCount++;
    }

    // SOLID Principle Violations Detection
    detectionCount += await this.detectSOLIDViolations();
    
    // Factory Pattern Violations Detection  
    detectionCount += await this.detectFactoryPatternViolations();

    console.log(`  🔍 Simple anti-pattern detection found ${detectionCount} violations`);
    return detectionCount;
  }

  /**
   * Detect SOLID principle violations
   */
  private async detectSOLIDViolations(): Promise<number> {
    let detectionCount = 0;
    
    // 1. Single Responsibility Principle (SRP) violations
    // Classes with multiple responsibilities (indicated by diverse method names)
    const srpViolations = this.db.prepare(`
      SELECT 
        file_path,
        parent_class,
        COUNT(*) as method_count,
        COUNT(DISTINCT 
          CASE 
            WHEN name LIKE '%Get%' OR name LIKE '%Set%' THEN 'accessor'
            WHEN name LIKE '%Create%' OR name LIKE '%Make%' OR name LIKE '%Build%' THEN 'creator'
            WHEN name LIKE '%Process%' OR name LIKE '%Execute%' OR name LIKE '%Run%' THEN 'processor'
            WHEN name LIKE '%Validate%' OR name LIKE '%Check%' OR name LIKE '%Verify%' THEN 'validator'
            WHEN name LIKE '%Save%' OR name LIKE '%Store%' OR name LIKE '%Load%' THEN 'storage'
            WHEN name LIKE '%Render%' OR name LIKE '%Draw%' OR name LIKE '%Display%' THEN 'renderer'
            WHEN name LIKE '%Manager%' OR name LIKE '%Handle%' THEN 'manager'
            ELSE 'other'
          END
        ) as responsibility_count
      FROM enhanced_symbols 
      WHERE kind = 'function' AND parent_class IS NOT NULL
      GROUP BY file_path, parent_class
      HAVING method_count > 5 AND responsibility_count > 3  -- Multiple responsibilities
    `).all() as any[];

    for (const violation of srpViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'solid_violation_srp'
        )
        WHERE parent_class = ?
        AND semantic_tags NOT LIKE '%solid_violation_srp%'
      `).run(violation.parent_class);
      
      detectionCount++;
    }

    // 2. Open/Closed Principle (OCP) violations
    // Functions that modify existing behavior instead of extending (heuristic)
    const ocpViolations = this.db.prepare(`
      SELECT file_path, name
      FROM enhanced_symbols 
      WHERE (
        name LIKE '%Modify%' OR 
        name LIKE '%Change%' OR 
        name LIKE '%Alter%' OR
        name LIKE '%Edit%' OR
        name LIKE '%Update%'
      ) 
      AND kind = 'function'
      AND name NOT LIKE '%Config%'  -- Configuration updates are often legitimate
    `).all() as any[];

    for (const violation of ocpViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'solid_violation_ocp'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%solid_violation_ocp%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    // 3. Dependency Inversion Principle (DIP) violations
    // Concrete dependencies instead of abstractions (heuristic: concrete class names)
    const dipViolations = this.db.prepare(`
      SELECT file_path, name, signature
      FROM enhanced_symbols 
      WHERE signature IS NOT NULL
      AND (
        signature LIKE '%VulkanDevice%' OR
        signature LIKE '%ConcreteFactory%' OR
        signature LIKE '%SpecificManager%' OR
        signature LIKE '%DirectRenderer%' OR
        signature LIKE '%HardcodedGenerator%'
      )
      AND kind = 'function'
    `).all() as any[];

    for (const violation of dipViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'solid_violation_dip'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%solid_violation_dip%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    console.log(`  📋 SOLID violations detected: ${detectionCount}`);
    return detectionCount;
  }

  /**
   * Detect Factory pattern violations
   */
  private async detectFactoryPatternViolations(): Promise<number> {
    let detectionCount = 0;
    
    // 1. Simple violation: functions with creation patterns that bypass factory pattern
    // Look for functions that contain manager/direct creation anti-patterns
    const simpleFactoryViolations = this.db.prepare(`
      SELECT file_path, name, qualified_name
      FROM enhanced_symbols 
      WHERE (
        (qualified_name LIKE '%Manager%::%' AND name LIKE '%Create%') OR
        (name LIKE '%DirectCreate%') OR
        (name LIKE '%HardcodedCreate%') OR
        (name LIKE '%ManualCreate%') OR
        (qualified_name LIKE '%Renderer%::%' AND name LIKE '%Create%') OR
        (qualified_name LIKE '%Processor%::%' AND name LIKE '%Create%')
      )
      AND kind = 'function'
      AND qualified_name NOT LIKE '%Factory%'
    `).all() as any[];

    for (const violation of simpleFactoryViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'factory_pattern_violation_direct_creation'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%factory_pattern_violation%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    // 2. Direct instantiation violations (simple case)
    // Functions that directly instantiate without abstraction
    const directInstantiationViolations = this.db.prepare(`
      SELECT file_path, name, signature
      FROM enhanced_symbols 
      WHERE (
        name LIKE '%new%' OR
        name LIKE '%Instantiate%' OR
        name LIKE '%DirectCreate%'
      )
      AND kind = 'function'
      AND qualified_name NOT LIKE '%Factory%'
    `).all() as any[];

    for (const violation of directInstantiationViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'factory_pattern_violation_direct_instantiation'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%factory_pattern_violation%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    // 3. Missing factory for complex object creation
    // Vulkan/GPU objects that should use factories
    const missingFactoryViolations = this.db.prepare(`
      SELECT file_path, name
      FROM enhanced_symbols 
      WHERE (
        name LIKE '%Pipeline%' OR
        name LIKE '%Buffer%' OR
        name LIKE '%Texture%' OR
        name LIKE '%Shader%' OR
        name LIKE '%RenderPass%'
      )
      AND (
        name LIKE '%Create%' OR
        name LIKE '%Init%' OR
        name LIKE '%Setup%'
      )
      AND kind = 'function'
      AND parent_class NOT LIKE '%Factory%'
      AND semantic_tags NOT LIKE '%factory%'
    `).all() as any[];

    for (const violation of missingFactoryViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'factory_pattern_violation_missing_factory'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%factory_pattern_violation%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    // 3. Inconsistent factory usage
    // Projects that have some factories but bypass them
    const factoryBypassViolations = this.db.prepare(`
      SELECT file_path, name
      FROM enhanced_symbols s1
      WHERE s1.name LIKE '%Create%'
      AND s1.kind = 'function'
      AND s1.parent_class NOT LIKE '%Factory%'
      AND EXISTS (
        SELECT 1 FROM enhanced_symbols s2 
        WHERE s2.parent_class LIKE '%Factory%'
        AND s2.name LIKE '%Create%'
      )
      AND s1.semantic_tags NOT LIKE '%factory%'
    `).all() as any[];

    for (const violation of factoryBypassViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'factory_pattern_violation_bypass'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%factory_pattern_violation%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    // 4. Simple factory bypass violations  
    // Functions with factory-bypass patterns in their names
    const factoryBypassSimple = this.db.prepare(`
      SELECT file_path, name
      FROM enhanced_symbols 
      WHERE (
        name LIKE '%BypassFactory%' OR
        name LIKE '%SkipFactory%' OR
        name LIKE '%DirectNew%' OR
        name LIKE '%ManualNew%' OR
        (name LIKE '%Create%' AND name LIKE '%Direct%')
      )
      AND kind = 'function'
    `).all() as any[];

    for (const violation of factoryBypassSimple) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'factory_pattern_violation_bypass'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%factory_pattern_violation%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    // 5. Creation functions that should use factory pattern but don't
    // Look for creation functions without proper factory pattern usage
    const basicFactoryViolations = this.db.prepare(`
      SELECT file_path, name
      FROM enhanced_symbols 
      WHERE (
        (name LIKE 'GetOrCreate%' AND semantic_tags NOT LIKE '%factory-pattern%') OR
        (name LIKE 'Recreate%' AND semantic_tags NOT LIKE '%factory-pattern%') OR  
        (name LIKE '%CreateBuffer%' AND semantic_tags NOT LIKE '%factory-pattern%') OR
        (name LIKE '%CreateTexture%' AND semantic_tags NOT LIKE '%factory-pattern%') OR
        (name LIKE '%CreateMesh%' AND semantic_tags NOT LIKE '%factory-pattern%')
      )
      AND kind = 'function'
      AND qualified_name NOT LIKE '%Factory%'
      LIMIT 50  -- Reasonable limit
    `).all() as any[];

    for (const violation of basicFactoryViolations) {
      this.db.prepare(`
        UPDATE enhanced_symbols 
        SET semantic_tags = json_insert(
          semantic_tags, 
          '$[#]', 
          'factory_pattern_violation_basic'
        )
        WHERE file_path = ? AND name = ?
        AND semantic_tags NOT LIKE '%factory_pattern_violation%'
      `).run(violation.file_path, violation.name);
      
      detectionCount++;
    }

    console.log(`  🏭 Factory pattern violations detected: ${detectionCount}`);
    return detectionCount;
  }

  /**
   * Build enhanced method signature with parameter details
   */
  private buildEnhancedSignature(func: any): string {
    if (func.signature) {
      return func.signature;
    }
    
    // Try to build from available information
    let signature = func.name;
    
    if (func.parameters && Array.isArray(func.parameters)) {
      const paramStrings = func.parameters.map((param: any) => {
        if (typeof param === 'string') {
          return param;
        }
        
        let paramStr = '';
        if (param.isConst) paramStr += 'const ';
        paramStr += param.type || 'auto';
        if (param.isReference) paramStr += '&';
        if (param.isPointer) paramStr += '*';
        if (param.name) paramStr += ' ' + param.name;
        
        return paramStr;
      });
      
      signature += `(${paramStrings.join(', ')})`;
    } else {
      signature += '(...)';
    }
    
    if (func.isConst) signature += ' const';
    if (func.isNoexcept) signature += ' noexcept';
    
    return signature;
  }

  /**
   * Build class signature with inheritance information
   */
  private buildClassSignature(cls: any): string {
    let signature = `class ${cls.name}`;
    
    // Add inheritance information if available
    if (cls.baseClasses && Array.isArray(cls.baseClasses) && cls.baseClasses.length > 0) {
      const inheritances = cls.baseClasses.map((base: any) => {
        if (typeof base === 'string') {
          return `public ${base}`;
        }
        
        const access = base.access || 'public';
        const baseName = base.name || base.type || base;
        return `${access} ${baseName}`;
      });
      
      signature += ` : ${inheritances.join(', ')}`;
    } else if (cls.inheritance) {
      // Alternative format
      signature += ` : ${cls.inheritance}`;
    }
    
    return signature;
  }

  /**
   * Extract and store module information from parse results
   */
  private async extractAndStoreModuleInformation(validResults: any[]): Promise<void> {
    if (validResults.length === 0) return;

    const moduleInsert = this.db.prepare(`
      INSERT OR REPLACE INTO modules (
        path, relative_path, module_name, pipeline_stage,
        exports, imports, dependencies,
        parse_success, last_analyzed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((results: any[]) => {
      for (const result of results) {
        try {
          const parseResult = result.parseResult;
          const filePath = result.filePath;
          const relativePath = result.relativePath;
          
          // Extract module name from file path or parse result
          let moduleName = this.extractModuleName(filePath, parseResult);
          
          // Determine pipeline stage
          const pipelineStage = this.detectPipelineStage(relativePath);
          
          // Extract exports, imports, and dependencies from parse result
          const exports = this.extractExportsFromParseResult(parseResult);
          const imports = this.extractImportsFromParseResult(parseResult);
          const dependencies = this.extractDependenciesFromParseResult(parseResult);
          
          moduleInsert.run(
            filePath,
            relativePath,
            moduleName,
            pipelineStage,
            JSON.stringify(exports),
            JSON.stringify(imports),
            JSON.stringify(dependencies),
            1, // parse_success
            Date.now()
          );
        } catch (error) {
          console.warn(`Failed to extract module info for ${result.filePath}:`, error);
        }
      }
    });

    transaction(validResults);
  }

  /**
   * Extract module name from file path and parse result
   */
  private extractModuleName(filePath: string, parseResult: any): string {
    // Try to get module name from parse result first
    if (parseResult && parseResult.moduleDeclaration) {
      return parseResult.moduleDeclaration;
    }
    
    // Extract from exports (C++23 modules)
    if (parseResult && parseResult.exports) {
      const exportsArray = Array.from(parseResult.exports);
      const moduleExport = exportsArray.find((exp: any) => 
        typeof exp === 'string' && (exp.startsWith('module ') || exp.includes('export module'))
      ) as string;
      if (moduleExport) {
        const match = moduleExport.match(/(?:export\s+)?module\s+(\w+(?:::\w+)*)/);
        if (match) return match[1];
      }
    }
    
    // Fallback to file name
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Convert common patterns
    if (fileName.includes('Pipeline')) return fileName.replace(/([A-Z])/g, ' $1').trim();
    if (fileName.includes('Manager')) return fileName.replace(/([A-Z])/g, ' $1').trim();
    if (fileName.includes('Vulkan')) return fileName.replace(/([A-Z])/g, ' $1').trim();
    
    return fileName;
  }

  /**
   * Extract exports from parse result
   */
  private extractExportsFromParseResult(parseResult: any): string[] {
    if (!parseResult) return [];
    
    if (parseResult.exports instanceof Set) {
      return Array.from(parseResult.exports);
    } else if (Array.isArray(parseResult.exports)) {
      return parseResult.exports;
    }
    
    return [];
  }

  /**
   * Extract imports from parse result
   */
  private extractImportsFromParseResult(parseResult: any): string[] {
    if (!parseResult) return [];
    
    if (parseResult.imports instanceof Set) {
      return Array.from(parseResult.imports);
    } else if (Array.isArray(parseResult.imports)) {
      return parseResult.imports;
    }
    
    return [];
  }

  /**
   * Extract dependencies from parse result
   */
  private extractDependenciesFromParseResult(parseResult: any): string[] {
    if (!parseResult) return [];
    
    const deps: string[] = [];
    
    // Add imports as dependencies
    if (parseResult.imports) {
      const imports = parseResult.imports instanceof Set ? 
        Array.from(parseResult.imports) : parseResult.imports;
      deps.push(...imports);
    }
    
    // Add includes as dependencies
    if (parseResult.includes) {
      const includes = parseResult.includes instanceof Set ? 
        Array.from(parseResult.includes) : parseResult.includes;
      deps.push(...includes);
    }
    
    // Add dependencies if explicitly provided
    if (parseResult.dependencies) {
      const dependencies = parseResult.dependencies instanceof Set ? 
        Array.from(parseResult.dependencies) : parseResult.dependencies;
      deps.push(...dependencies);
    }
    
    return [...new Set(deps)]; // Remove duplicates
  }

  /**
   * Extract comprehensive relationships from parse data and symbols
   */
  private extractFileRelationships(symbols: any[], parseResult: any, filePath: string): void {
    // Store relationships to be inserted later
    const relationships: any[] = [];
    
    // 1. Extract include/import dependencies
    this.extractIncludeRelationships(relationships, parseResult, filePath);
    
    // 2. Extract inheritance relationships
    this.extractInheritanceRelationships(relationships, symbols, parseResult);
    
    // 3. Extract function call relationships from signatures and names
    this.extractCallRelationships(relationships, symbols);
    
    // 4. Extract usage relationships from symbol names and contexts
    this.extractUsageRelationships(relationships, symbols, parseResult);
    
    // 5. Store all relationships in batch
    if (relationships.length > 0) {
      this.storeRelationshipsBatch(relationships);
    }
  }

  /**
   * Extract include and import relationships
   */
  private extractIncludeRelationships(relationships: any[], parseResult: any, filePath: string): void {
    // Extract includes
    if (parseResult && parseResult.includes) {
      const includes = parseResult.includes instanceof Set ? 
        Array.from(parseResult.includes) : parseResult.includes;
      
      for (const include of includes) {
        relationships.push({
          fromSymbol: path.basename(filePath),
          fromFile: filePath,
          toSymbol: include,
          toFile: null, // Will be resolved later
          relationshipType: 'includes',
          confidence: 0.9
        });
      }
    }
    
    // Extract imports (C++23 modules)
    if (parseResult && parseResult.imports) {
      const imports = parseResult.imports instanceof Set ? 
        Array.from(parseResult.imports) : parseResult.imports;
      
      for (const importItem of imports) {
        relationships.push({
          fromSymbol: path.basename(filePath),
          fromFile: filePath,
          toSymbol: importItem,
          toFile: null,
          relationshipType: 'imports',
          confidence: 0.9
        });
      }
    }
  }

  /**
   * Extract inheritance relationships from class symbols
   */
  private extractInheritanceRelationships(relationships: any[], symbols: any[], parseResult: any): void {
    for (const symbol of symbols) {
      if (symbol.kind === 'class' || symbol.kind === 'struct') {
        // Look for inheritance patterns in the name or signature
        const signature = symbol.signature || symbol.qualifiedName || '';
        
        // Common inheritance patterns: "class A : public B", "class A : B"
        const inheritanceMatch = signature.match(/:\s*(?:public|private|protected)?\s*(\w+(?:::\w+)*)/);
        if (inheritanceMatch) {
          const baseClass = inheritanceMatch[1];
          relationships.push({
            fromSymbol: symbol.name,
            fromFile: symbol.filePath,
            toSymbol: baseClass,
            toFile: null,
            relationshipType: 'inherits',
            confidence: 0.8
          });
        }
      }
    }
  }

  /**
   * Extract function call relationships from function signatures and names
   */
  private extractCallRelationships(relationships: any[], symbols: any[]): void {
    // Create a lookup map for efficient symbol finding
    const symbolMap = new Map<string, any[]>();
    for (const symbol of symbols) {
      if (!symbolMap.has(symbol.name)) {
        symbolMap.set(symbol.name, []);
      }
      symbolMap.get(symbol.name)!.push(symbol);
    }

    for (const symbol of symbols) {
      if (symbol.kind === 'function' || symbol.kind === 'method') {
        const name = symbol.name || '';
        const signature = symbol.signature || '';
        const parentClass = symbol.parentClass;
        
        // Pattern 1: Same-class method calls (high confidence)
        if (parentClass) {
          for (const other of symbols) {
            if (other !== symbol && other.parentClass === parentClass && 
                other.kind === 'method' && this.likelyCallsMethod(name, other.name)) {
              relationships.push({
                fromSymbol: symbol.name,
                fromFile: symbol.filePath,
                toSymbol: other.name,
                toFile: other.filePath,
                relationshipType: 'calls',
                confidence: 0.8
              });
            }
          }
        }

        // Pattern 2: Process/Handler method chains  
        if (name.includes('Process') || name.includes('Handle') || name.includes('Execute')) {
          const methodPattern = this.extractMethodPattern(name);
          for (const other of symbols) {
            if (other !== symbol && other.name && 
                this.isRelatedProcessMethod(methodPattern, other.name)) {
              relationships.push({
                fromSymbol: symbol.name,
                fromFile: symbol.filePath,
                toSymbol: other.name,
                toFile: other.filePath,
                relationshipType: 'calls',
                confidence: 0.7
              });
            }
          }
        }

        // Pattern 3: Factory/Creator pattern calls
        if (name.startsWith('Create') || name.includes('Factory') || name.includes('Builder')) {
          const targetType = this.extractTargetType(name);
          for (const other of symbols) {
            if (other !== symbol && other.name && 
                (other.name.includes(targetType) || this.isConstructorLike(other.name, targetType))) {
              relationships.push({
                fromSymbol: symbol.name,
                fromFile: symbol.filePath,
                toSymbol: other.name,
                toFile: other.filePath,
                relationshipType: 'calls',
                confidence: 0.6
              });
            }
          }
        }

        // Pattern 4: Vulkan API wrapper calls (specific to this codebase)
        if (name.startsWith('vk') && signature.includes('(')) {
          // Find wrapper functions that likely call this Vulkan API
          const apiName = name.substring(2); // Remove 'vk' prefix
          for (const other of symbols) {
            if (other !== symbol && other.name && 
                (other.name.toLowerCase().includes(apiName.toLowerCase()) ||
                 (other.parentClass && other.parentClass.includes('Vulkan')))) {
              relationships.push({
                fromSymbol: other.name,
                fromFile: other.filePath,
                toSymbol: symbol.name,
                toFile: symbol.filePath,
                relationshipType: 'calls',
                confidence: 0.5
              });
            }
          }
        }

        // Pattern 5: Manager/Service pattern - managers call their managed components
        if (name.includes('Manager') || name.includes('Service')) {
          const managedType = this.extractManagedType(name, parentClass);
          for (const other of symbols) {
            if (other !== symbol && other.name && 
                this.isManagedByPattern(managedType, other.name, other.parentClass)) {
              relationships.push({
                fromSymbol: symbol.name,
                fromFile: symbol.filePath,
                toSymbol: other.name,
                toFile: other.filePath,
                relationshipType: 'manages',
                confidence: 0.7
              });
            }
          }
        }
      }
    }
  }

  /**
   * Check if one method likely calls another based on naming patterns
   */
  private likelyCallsMethod(callerName: string, targetName: string): boolean {
    // ProcessTerrainUnified likely calls ProcessTerrain
    if (callerName.includes('Unified') && targetName === callerName.replace('Unified', '')) {
      return true;
    }
    
    // InitializeXXX likely calls CreateXXX
    if (callerName.startsWith('Initialize') && targetName.startsWith('Create')) {
      const callerSuffix = callerName.replace('Initialize', '');
      const targetSuffix = targetName.replace('Create', '');
      return callerSuffix === targetSuffix;
    }

    // SetupXXX likely calls ConfigureXXX
    if (callerName.startsWith('Setup') && targetName.startsWith('Configure')) {
      return callerName.substring(5) === targetName.substring(9);
    }

    return false;
  }

  /**
   * Extract method pattern for process chains
   */
  private extractMethodPattern(methodName: string): string {
    const patterns = ['Process', 'Handle', 'Execute', 'Run', 'Perform'];
    for (const pattern of patterns) {
      if (methodName.includes(pattern)) {
        return methodName.replace(pattern, '').replace(/Unified$/, '');
      }
    }
    return methodName;
  }

  /**
   * Check if two process methods are related
   */
  private isRelatedProcessMethod(pattern: string, targetName: string): boolean {
    if (!pattern) return false;
    
    // Terrain, Water, Physics processing chains
    const domainPatterns = ['Terrain', 'Water', 'Physics', 'Noise', 'Pipeline'];
    for (const domain of domainPatterns) {
      if (pattern.includes(domain) && targetName.includes(domain)) {
        return true;
      }
    }
    
    return targetName.includes(pattern);
  }

  /**
   * Extract target type from factory/creator method names
   */
  private extractTargetType(methodName: string): string {
    const prefixes = ['Create', 'Build', 'Make', 'Generate', 'Factory'];
    for (const prefix of prefixes) {
      if (methodName.startsWith(prefix)) {
        return methodName.substring(prefix.length);
      }
    }
    return methodName;
  }

  /**
   * Check if method is constructor-like for a given type
   */
  private isConstructorLike(methodName: string, targetType: string): boolean {
    return methodName === targetType || 
           methodName.endsWith(targetType) ||
           methodName.includes(`${targetType}Impl`) ||
           methodName.includes(`${targetType}Base`);
  }

  /**
   * Extract managed type from manager/service names
   */
  private extractManagedType(methodName: string, parentClass?: string): string {
    if (parentClass) {
      const managedTypes = ['Pipeline', 'Buffer', 'Texture', 'Shader', 'Descriptor'];
      for (const type of managedTypes) {
        if (parentClass.includes(type)) {
          return type;
        }
      }
    }
    
    return methodName.replace(/Manager|Service/g, '');
  }

  /**
   * Check if a symbol is managed by a manager pattern
   */
  private isManagedByPattern(managedType: string, symbolName: string, symbolParentClass?: string): boolean {
    if (!managedType) return false;
    
    // Direct type match
    if (symbolName.includes(managedType) || symbolParentClass?.includes(managedType)) {
      return true;
    }
    
    // Domain-specific patterns
    const domainMappings: Record<string, string[]> = {
      'Pipeline': ['Create', 'Build', 'Configure', 'Bind'],
      'Buffer': ['Allocate', 'Map', 'Update', 'Copy'],
      'Texture': ['Load', 'Generate', 'Bind', 'Sample'],
      'Shader': ['Compile', 'Load', 'Reflect', 'Bind']
    };
    
    const actions = domainMappings[managedType] || [];
    return actions.some(action => symbolName.startsWith(action));
  }

  /**
   * Extract usage relationships from symbol names and contexts
   */
  private extractUsageRelationships(relationships: any[], symbols: any[], parseResult: any): void {
    for (const symbol of symbols) {
      // Pattern 1: Variables/types used in function signatures
      if (symbol.signature) {
        for (const other of symbols) {
          if (other !== symbol && other.name && 
              symbol.signature.includes(other.name)) {
            relationships.push({
              fromSymbol: symbol.name,
              fromFile: symbol.filePath,
              toSymbol: other.name,
              toFile: other.filePath,
              relationshipType: 'uses',
              confidence: 0.8
            });
          }
        }
      }
      
      // Pattern 2: Namespace usage
      if (symbol.namespace) {
        for (const other of symbols) {
          if (other !== symbol && other.name && 
              other.namespace === symbol.namespace && other.kind !== symbol.kind) {
            relationships.push({
              fromSymbol: symbol.name,
              fromFile: symbol.filePath,
              toSymbol: other.name,
              toFile: other.filePath,
              relationshipType: 'shares_namespace',
              confidence: 0.4
            });
          }
        }
      }
      
      // Pattern 3: Class member relationships
      if (symbol.parentClass) {
        for (const other of symbols) {
          if (other !== symbol && other.name === symbol.parentClass) {
            relationships.push({
              fromSymbol: symbol.name,
              fromFile: symbol.filePath,
              toSymbol: other.name,
              toFile: other.filePath,
              relationshipType: 'member_of',
              confidence: 0.9
            });
          }
        }
      }
    }
  }

  /**
   * Store relationships in the database
   */
  private storeRelationshipsBatch(relationships: any[]): void {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO symbol_relationships (
        from_symbol_id, to_symbol_id, relationship_type, confidence, detected_by
      ) 
      SELECT 
        (SELECT id FROM enhanced_symbols WHERE name = ? AND file_path = ? LIMIT 1),
        (SELECT id FROM enhanced_symbols WHERE name = ? LIMIT 1),
        ?, ?, 'pattern_aware_indexer'
      WHERE EXISTS (SELECT 1 FROM enhanced_symbols WHERE name = ? AND file_path = ?)
        AND EXISTS (SELECT 1 FROM enhanced_symbols WHERE name = ?)
    `);

    const transaction = this.db.transaction((rels: any[]) => {
      for (const rel of rels) {
        try {
          insertStmt.run(
            rel.fromSymbol, rel.fromFile,
            rel.toSymbol,
            rel.relationshipType, rel.confidence,
            rel.fromSymbol, rel.fromFile,
            rel.toSymbol
          );
        } catch (error) {
          // Silently ignore relationship insertion errors
        }
      }
    });

    transaction(relationships);
  }

  /**
   * Extract class context from source code at a specific line
   * This is used when the tree-sitter parser fails to detect class context
   */
  private async extractClassContextFromSource(filePath: string, lineNumber: number, functionName: string): Promise<{
    parentClass?: string;
    namespace?: string;
  }> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      
      if (lineNumber <= 0 || lineNumber > lines.length) {
        return {};
      }
      
      // Get the actual line (1-based to 0-based conversion)
      const targetLine = lines[lineNumber - 1];
      
      // Look for qualified function definition pattern: ClassName::FunctionName
      const qualifiedMatch = targetLine.match(/(\w+)::(\w+)\s*\(/);
      if (qualifiedMatch && qualifiedMatch[2] === functionName) {
        return {
          parentClass: qualifiedMatch[1]
        };
      }
      
      // If not found in the target line, look backwards for class definition
      // This handles cases where the function definition spans multiple lines
      for (let i = Math.max(0, lineNumber - 50); i < lineNumber; i++) {
        const line = lines[i];
        
        // Look for class definition
        const classMatch = line.match(/class\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+\w+)?/);
        if (classMatch) {
          const className = classMatch[1];
          
          // Verify this class contains our function by looking ahead
          for (let j = i + 1; j < Math.min(lines.length, lineNumber + 10); j++) {
            const forwardLine = lines[j];
            if (forwardLine.includes(`${className}::${functionName}`) || 
                (j === lineNumber - 1 && forwardLine.includes(functionName))) {
              return {
                parentClass: className
              };
            }
          }
        }
      }
      
      return {};
    } catch (error) {
      console.warn(`Failed to extract class context from ${filePath}:${lineNumber}: ${error}`);
      return {};
    }
  }

  /**
   * Build comprehensive cross-file dependency map
   * Analyzes actual usage patterns across files, not just includes
   */
  private async buildCrossFileDependencyMap(fileResults: any[]): Promise<void> {
    console.log(`  🔗 Building cross-file dependency analysis for ${fileResults.length} files...`);
    
    const startTime = Date.now();
    const dependencies: any[] = [];
    
    // Get all symbols grouped by file for efficient lookup
    const symbolsByFile = new Map<string, any[]>();
    const allSymbols = this.db.prepare(`
      SELECT id, name, qualified_name, parent_class, kind, file_path, signature, line
      FROM enhanced_symbols 
      WHERE file_path IS NOT NULL
    `).all();
    
    // Group symbols by file
    for (const symbol of allSymbols as any[]) {
      if (!symbolsByFile.has(symbol.file_path)) {
        symbolsByFile.set(symbol.file_path, []);
      }
      symbolsByFile.get(symbol.file_path)!.push(symbol);
    }
    
    // Create lookup maps for efficient cross-file analysis
    const symbolByQualifiedName = new Map<string, any>();
    const symbolBySimpleName = new Map<string, any[]>();
    
    for (const symbol of allSymbols as any[]) {
      if (symbol.qualified_name) {
        symbolByQualifiedName.set(symbol.qualified_name, symbol);
      }
      
      if (!symbolBySimpleName.has(symbol.name)) {
        symbolBySimpleName.set(symbol.name, []);
      }
      symbolBySimpleName.get(symbol.name)!.push(symbol);
    }
    
    // Analyze each file for cross-file dependencies
    for (const fileResult of fileResults) {
      const filePath = fileResult.filePath;
      const fileSymbols = symbolsByFile.get(filePath) || [];
      
      // Read the source file to analyze actual usage
      try {
        const sourceContent = await fs.readFile(filePath, 'utf-8');
        const crossFileDeps = await this.analyzeCrossFileUsage(
          filePath, 
          sourceContent, 
          fileSymbols, 
          symbolByQualifiedName, 
          symbolBySimpleName
        );
        
        dependencies.push(...crossFileDeps);
      } catch (error) {
        console.warn(`  ⚠️  Failed to analyze cross-file dependencies for ${filePath}: ${error}`);
      }
    }
    
    // Store cross-file dependencies
    if (dependencies.length > 0) {
      await this.storeCrossFileDependencies(dependencies);
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`  🔗 Cross-file analysis complete: ${dependencies.length} dependencies found in ${elapsed}ms`);
  }

  /**
   * Analyze actual cross-file usage patterns in source code
   */
  private async analyzeCrossFileUsage(
    filePath: string,
    sourceContent: string,
    fileSymbols: any[],
    symbolByQualifiedName: Map<string, any>,
    symbolBySimpleName: Map<string, any[]>
  ): Promise<any[]> {
    const dependencies: any[] = [];
    const lines = sourceContent.split('\n');
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;
      
      // 1. Detect qualified function calls (Class::Method calls)
      const qualifiedCalls = line.match(/(\w+::[\w\d_]+)\s*\(/g);
      if (qualifiedCalls) {
        for (const call of qualifiedCalls) {
          const qualifiedName = call.replace(/\s*\($/, '');
          const targetSymbol = symbolByQualifiedName.get(qualifiedName);
          
          if (targetSymbol && targetSymbol.file_path !== filePath) {
            // Find the calling context (which function in this file is making the call)
            const callingContext = this.findCallingContext(lines, lineIndex, fileSymbols);
            
            dependencies.push({
              fromFile: filePath,
              fromSymbol: callingContext?.name || '[global]',
              fromSymbolId: callingContext?.id || null,
              toFile: targetSymbol.file_path,
              toSymbol: targetSymbol.name,
              toSymbolId: targetSymbol.id,
              relationshipType: 'calls',
              usagePattern: 'qualified_call',
              lineNumber: lineNumber,
              confidence: 0.95,
              sourceText: line.trim()
            });
          }
        }
      }
      
      // 2. Detect simple function calls that might be cross-file
      const simpleCalls = line.match(/\b(\w+)\s*\(/g);
      if (simpleCalls) {
        for (const call of simpleCalls) {
          const functionName = call.replace(/\s*\($/, '');
          
          // Skip common language constructs
          if (['if', 'for', 'while', 'switch', 'sizeof', 'return'].includes(functionName)) {
            continue;
          }
          
          const candidates = symbolBySimpleName.get(functionName) || [];
          const crossFileCandidates = candidates.filter(s => s.file_path !== filePath);
          
          if (crossFileCandidates.length > 0) {
            // Prefer functions from included files or related modules
            const bestCandidate = this.selectBestCrossFileCandidate(
              crossFileCandidates, 
              filePath, 
              sourceContent
            );
            
            if (bestCandidate) {
              const callingContext = this.findCallingContext(lines, lineIndex, fileSymbols);
              
              dependencies.push({
                fromFile: filePath,
                fromSymbol: callingContext?.name || '[global]',
                fromSymbolId: callingContext?.id || null,
                toFile: bestCandidate.file_path,
                toSymbol: bestCandidate.name,
                toSymbolId: bestCandidate.id,
                relationshipType: 'calls',
                usagePattern: 'simple_call',
                lineNumber: lineNumber,
                confidence: 0.7,
                sourceText: line.trim()
              });
            }
          }
        }
      }
      
      // 3. Detect type usage (variable declarations, parameters)
      const typeUsage = line.match(/\b(\w+)\s+\w+\s*[;=\(]/g);
      if (typeUsage) {
        for (const usage of typeUsage) {
          const typeName = usage.split(/\s+/)[0];
          const candidates = symbolBySimpleName.get(typeName) || [];
          const crossFileTypes = candidates.filter(s => 
            s.file_path !== filePath && 
            (s.kind === 'class' || s.kind === 'struct' || s.kind === 'enum')
          );
          
          if (crossFileTypes.length > 0) {
            const bestType = this.selectBestCrossFileCandidate(crossFileTypes, filePath, sourceContent);
            
            if (bestType) {
              const callingContext = this.findCallingContext(lines, lineIndex, fileSymbols);
              
              dependencies.push({
                fromFile: filePath,
                fromSymbol: callingContext?.name || '[global]',
                fromSymbolId: callingContext?.id || null,
                toFile: bestType.file_path,
                toSymbol: bestType.name,
                toSymbolId: bestType.id,
                relationshipType: 'uses',
                usagePattern: 'type_usage',
                lineNumber: lineNumber,
                confidence: 0.8,
                sourceText: line.trim()
              });
            }
          }
        }
      }
    }
    
    return dependencies;
  }

  /**
   * Find which function/method context a line belongs to
   */
  private findCallingContext(lines: string[], currentLineIndex: number, fileSymbols: any[]): any | null {
    const currentLineNumber = currentLineIndex + 1; // Convert 0-based index to 1-based line number
    
    // Filter to only functions and methods
    const functionSymbols = fileSymbols.filter(s => s.kind === 'function' || s.kind === 'method');
    
    // Sort by line number to ensure we process them in order
    functionSymbols.sort((a, b) => (a.line || 0) - (b.line || 0));
    
    // Find the function that contains this line
    // We'll use a heuristic: the function with the highest line number that's still before our current line
    let bestMatch: any | null = null;
    
    for (const symbol of functionSymbols) {
      if (symbol.line && symbol.line <= currentLineNumber) {
        // This function starts before our current line
        // Check if there's a reasonable chance this line is within this function
        // We'll use a heuristic based on typical function size
        
        // If we have the next function, check if our line is before it
        const nextFunctionIndex = functionSymbols.indexOf(symbol) + 1;
        if (nextFunctionIndex < functionSymbols.length) {
          const nextFunction = functionSymbols[nextFunctionIndex];
          if (nextFunction.line && currentLineNumber < nextFunction.line) {
            // Our line is between this function and the next one, so it likely belongs to this function
            bestMatch = symbol;
          }
        } else {
          // This is the last function in the file, so if our line is after it, it might belong to it
          // Use a reasonable heuristic for max function size (e.g., 500 lines)
          if (currentLineNumber - symbol.line < 500) {
            bestMatch = symbol;
          }
        }
      }
    }
    
    // If we found a match, do a final verification by checking if the function definition
    // actually appears in the code around the supposed start line
    if (bestMatch && bestMatch.line > 0) {
      const functionStartLine = bestMatch.line - 1; // Convert to 0-based index
      if (functionStartLine < lines.length) {
        // Check a few lines around the supposed start for the function signature
        const searchStart = Math.max(0, functionStartLine - 2);
        const searchEnd = Math.min(lines.length - 1, functionStartLine + 2);
        
        for (let i = searchStart; i <= searchEnd; i++) {
          const line = lines[i];
          if (line.includes(bestMatch.name) && line.includes('(')) {
            // Verify it's likely a function definition, not a call
            const beforeName = line.substring(0, line.indexOf(bestMatch.name));
            if (!beforeName.includes('.') && !beforeName.includes('->') && !beforeName.includes('::')) {
              return bestMatch;
            }
          }
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Select the best candidate for cross-file dependency based on context
   */
  private selectBestCrossFileCandidate(candidates: any[], filePath: string, sourceContent: string): any | null {
    if (candidates.length === 1) {
      return candidates[0];
    }
    
    // Score candidates based on various factors
    const scored = candidates.map(candidate => {
      let score = 0;
      
      // 1. Prefer candidates from files that are included
      const candidateFileName = path.basename(candidate.file_path, path.extname(candidate.file_path));
      if (sourceContent.includes(candidateFileName)) {
        score += 30;
      }
      
      // 2. Prefer candidates from same module/directory hierarchy
      const fileParts = filePath.split('/');
      const candidateParts = candidate.file_path.split('/');
      const commonDepth = this.getCommonPathDepth(fileParts, candidateParts);
      score += commonDepth * 5;
      
      // 3. Prefer classes over functions for ambiguous names
      if (candidate.kind === 'class' || candidate.kind === 'struct') {
        score += 10;
      }
      
      // 4. Prefer symbols with parent class (methods) over global functions
      if (candidate.parent_class) {
        score += 5;
      }
      
      return { candidate, score };
    });
    
    // Return highest scoring candidate
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].candidate : null;
  }

  /**
   * Get common path depth between two file paths
   */
  private getCommonPathDepth(path1: string[], path2: string[]): number {
    let depth = 0;
    const minLength = Math.min(path1.length, path2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (path1[i] === path2[i]) {
        depth++;
      } else {
        break;
      }
    }
    
    return depth;
  }

  /**
   * Store cross-file dependencies in the database
   */
  private async storeCrossFileDependencies(dependencies: any[]): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO symbol_relationships (
        from_symbol_id, to_symbol_id, relationship_type, confidence, 
        detected_by, usage_pattern, source_text, line_number
      ) VALUES (?, ?, ?, ?, 'cross-file-analyzer', ?, ?, ?)
    `);
    
    const transaction = this.db.transaction(() => {
      for (const dep of dependencies) {
        try {
          insertStmt.run(
            dep.fromSymbolId,
            dep.toSymbolId,
            dep.relationshipType,
            dep.confidence,
            dep.usagePattern,
            dep.sourceText,
            dep.lineNumber
          );
        } catch (error) {
          // Ignore conflicts and foreign key errors
        }
      }
    });
    
    transaction();
  }

  close(): void {
    if (this.semanticWorker) {
      this.semanticWorker.terminate();
      this.semanticWorker = null;
    }
    this.parallelEngine.shutdown();
    this.antiPatternDetector.close();
    
    // Stop any background re-indexing from UnifiedSchemaManager
    const schemaManager = UnifiedSchemaManager.getInstance();
    schemaManager.stopProgressiveReindexing(this.db);
    
    this.db.close();
  }
}