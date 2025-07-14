import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { StreamingCppParser } from '../parsers/streaming-cpp-parser.js';
import { PatternAwareIndexer } from '../indexing/pattern-aware-indexer.js';

/**
 * Unified indexer that combines PatternAwareIndexer's advanced semantic analysis
 * with EnhancedIndexer's relational structure for comprehensive C++ code analysis
 */
export class UnifiedIndexer extends EventEmitter {
  private db: Database.Database;
  private patternIndexer: PatternAwareIndexer;
  private parser: StreamingCppParser;

  constructor(private projectPath: string, private dbPath: string) {
    super();
    this.db = new Database(dbPath);
    this.patternIndexer = new PatternAwareIndexer(projectPath, dbPath);
    this.parser = new StreamingCppParser({ fastMode: false });
    this.initUnifiedSchema();
  }

  private initUnifiedSchema(): void {
    // The PatternAwareIndexer already creates its advanced schema
    // Now we add compatibility tables for EnhancedIndexer queries
    this.db.exec(`
      -- Enhanced module info (compatible with EnhancedIndexer)
      CREATE TABLE IF NOT EXISTS enhanced_modules (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        stage TEXT NOT NULL,
        module_data TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        last_modified INTEGER NOT NULL,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      -- Method signatures view combining enhanced_symbols data
      CREATE VIEW IF NOT EXISTS method_signatures AS
      SELECT 
        id,
        file_path as module_path,
        parent_class as class_name,
        name as method_name,
        signature as full_signature,
        return_type,
        '[]' as parameters, -- TODO: Extract from signature
        'public' as visibility, -- Default, could be enhanced
        0 as is_virtual,
        0 as is_static,
        0 as is_const,
        line,
        0 as column
      FROM enhanced_symbols 
      WHERE kind IN ('function', 'method');

      -- Symbol relationships bridge table
      CREATE TABLE IF NOT EXISTS symbol_relationships (
        from_symbol TEXT NOT NULL,
        from_module TEXT NOT NULL,
        to_symbol TEXT NOT NULL,
        to_module TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY (from_symbol, from_module, to_symbol, to_module)
      );

      -- Usage examples linked to symbols
      CREATE TABLE IF NOT EXISTS usage_examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        module_path TEXT NOT NULL,
        example_code TEXT NOT NULL,
        context TEXT NOT NULL,
        line INTEGER NOT NULL
      );
    `);
  }

  /**
   * Index a file using both pattern-aware and relational approaches
   */
  async indexFile(filePath: string): Promise<void> {
    // Use PatternAwareIndexer for advanced semantic analysis
    await this.patternIndexer.indexFile(filePath);
    
    // Add enhanced module metadata
    await this.indexModuleMetadata(filePath);
    
    // Extract symbol relationships
    await this.extractSymbolRelationships(filePath);
    
    this.emit('fileIndexed', filePath);
  }

  private async indexModuleMetadata(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(this.projectPath, filePath);
    
    // Determine pipeline stage
    const stage = this.detectPipelineStage(relativePath);
    
    // Create hash
    const crypto = await import('crypto');
    const hash = crypto.createHash('md5').update(content).digest('hex');
    
    // Parse module for enhanced info
    const parseResult = await this.parser.parseFile(filePath);
    
    const moduleData = {
      exports: Array.from(parseResult.exports),
      imports: Array.from(parseResult.imports),
      classes: Array.from(parseResult.classes),
      functions: Array.from(parseResult.functions),
      namespaces: Array.from(parseResult.namespaces),
      includes: Array.from(parseResult.includes),
      stage,
      symbolCount: parseResult.functions.size + parseResult.classes.size
    };

    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO enhanced_modules 
      (path, relative_path, stage, module_data, file_size, last_modified, hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      filePath,
      relativePath,
      stage,
      JSON.stringify(moduleData),
      stats.size,
      stats.mtimeMs,
      hash,
      Date.now()
    );
  }

  private async extractSymbolRelationships(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(this.projectPath, filePath);
    
    // Extract includes and create relationships
    const includePattern = /#include\s*[<"]([^>"]+)[>"]/g;
    let match;
    
    while ((match = includePattern.exec(content)) !== null) {
      const includedFile = match[1];
      
      // Try to resolve the include to a module in our project
      const resolvedPath = await this.resolveInclude(includedFile);
      if (resolvedPath) {
        this.insertRelationship(
          relativePath, relativePath,
          includedFile, resolvedPath,
          'includes', 1.0
        );
      }
    }

    // Extract function calls and create relationships
    const functionCallPattern = /(\w+)\s*\(/g;
    while ((match = functionCallPattern.exec(content)) !== null) {
      const functionName = match[1];
      
      // Skip language keywords and common patterns
      if (!['if', 'for', 'while', 'switch', 'return', 'sizeof'].includes(functionName)) {
        // Look up the function in our symbol database
        const symbol = this.db.prepare(`
          SELECT file_path FROM enhanced_symbols 
          WHERE name = ? AND kind = 'function'
          LIMIT 1
        `).get(functionName);
        
        if (symbol) {
          this.insertRelationship(
            'unknown', relativePath,
            functionName, path.relative(this.projectPath, (symbol as any).file_path),
            'calls', 0.7
          );
        }
      }
    }
  }

  private insertRelationship(
    fromSymbol: string, fromModule: string,
    toSymbol: string, toModule: string,
    relationshipType: string, confidence: number
  ): void {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO symbol_relationships 
      (from_symbol, from_module, to_symbol, to_module, relationship_type, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    insertStmt.run(fromSymbol, fromModule, toSymbol, toModule, relationshipType, confidence);
  }

  private async resolveInclude(includePath: string): Promise<string | null> {
    // Try different resolution strategies
    const candidates = [
      path.join(this.projectPath, 'include', includePath),
      path.join(this.projectPath, 'src', includePath),
      path.join(this.projectPath, includePath)
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return path.relative(this.projectPath, candidate);
      } catch {
        continue;
      }
    }

    return null;
  }

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
   * Find implementations using the unified approach
   * Combines pattern-aware fast queries with relational lookups
   */
  async findImplementations(
    functionality: string,
    keywords: string[],
    returnType?: string
  ): Promise<any[]> {
    // Use PatternAwareIndexer for fast semantic search
    const fastResults = await this.patternIndexer.findImplementationsFast({
      keywords,
      returnType,
      executionMode: undefined,
      pipelineStage: undefined
    });

    // Enhance results with relational data
    const enhancedResults = [];
    for (const result of fastResults) {
      // Get additional metadata from enhanced_modules
      const moduleInfo = this.db.prepare(`
        SELECT stage, module_data FROM enhanced_modules 
        WHERE path = ?
      `).get(result.file_path);

      enhancedResults.push({
        ...result,
        stage: (moduleInfo as any)?.stage,
        moduleContext: moduleInfo ? JSON.parse((moduleInfo as any).module_data) : null,
        // Add compatibility fields for EnhancedIndexer consumers
        name: result.name,
        className: result.parent_class,
        returnType: result.return_type,
        location: {
          line: result.line,
          file: result.file_path
        }
      });
    }

    return enhancedResults;
  }

  /**
   * Build architecture map using unified data
   */
  async buildArchitectureMap(): Promise<any> {
    // Get modules by stage
    const modulesByStage = this.db.prepare(`
      SELECT stage, COUNT(*) as count, GROUP_CONCAT(relative_path) as modules
      FROM enhanced_modules
      GROUP BY stage
    `).all();

    // Get symbol relationships for dependency graph
    const relationships = this.db.prepare(`
      SELECT from_module, to_module, relationship_type, COUNT(*) as strength
      FROM symbol_relationships
      GROUP BY from_module, to_module, relationship_type
    `).all();

    return {
      stages: modulesByStage,
      dependencies: relationships,
      totalModules: (this.db.prepare('SELECT COUNT(*) as count FROM enhanced_modules').get() as { count: number } | undefined)?.count || 0,
      totalSymbols: (this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as { count: number } | undefined)?.count || 0
    };
  }

  /**
   * Find similar patterns in the codebase
   */
  async findSimilarPatterns(pattern: string, threshold: number = 0.7): Promise<any[]> {
    // Use pattern-aware indexer's pattern matching
    const patternResults = await this.patternIndexer.findByPattern(pattern);
    
    // If no direct pattern match, do text-based similarity search
    if (patternResults.length === 0) {
      return this.findTextBasedPatterns(pattern, threshold);
    }
    
    return patternResults.map(result => ({
      pattern: pattern,
      frequency: 1,
      category: 'code_pattern',
      locations: [`${result.file_path}:${result.line}`],
      confidence: threshold
    }));
  }

  private async findTextBasedPatterns(pattern: string, threshold: number): Promise<any[]> {
    // Enhanced text-based pattern matching as fallback
    const results: any[] = [];
    
    // Get all symbols that might contain similar patterns with better scoring
    const symbols = this.db.prepare(`
      SELECT name, file_path, line, signature, qualified_name, kind
      FROM enhanced_symbols 
      WHERE (name LIKE ? OR signature LIKE ? OR qualified_name LIKE ?)
      AND kind IN ('function', 'method', 'class', 'struct')
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN name LIKE ? THEN 2
          WHEN signature LIKE ? THEN 3
          ELSE 4
        END
      LIMIT 20
    `).all(
      `%${pattern}%`, `%${pattern}%`, `%${pattern}%`,
      pattern, `${pattern}%`, `%${pattern}%`
    );

    for (const symbol of symbols as any[]) {
      // Calculate confidence based on match quality
      let confidence = threshold;
      if (symbol.name === pattern) {
        confidence = 1.0;
      } else if (symbol.name.includes(pattern)) {
        confidence = Math.min(0.9, threshold + 0.2);
      } else if (symbol.signature && symbol.signature.includes(pattern)) {
        confidence = Math.min(0.8, threshold + 0.1);
      }

      results.push({
        pattern: symbol.signature || symbol.name,
        frequency: 1,
        category: 'similar_code',
        locations: [`${symbol.file_path}:${symbol.line}`],
        confidence: confidence,
        match_type: symbol.kind
      });
    }

    return results;
  }

  /**
   * Get usage examples for a symbol
   */
  async getUsageExamples(symbolName: string): Promise<any[]> {
    return this.db.prepare(`
      SELECT * FROM usage_examples 
      WHERE symbol = ?
      ORDER BY id DESC
      LIMIT 5
    `).all(symbolName);
  }

  close(): void {
    this.patternIndexer.close();
    this.db.close();
  }
}