import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { 
  EnhancedModuleInfo, 
  MethodSignature, 
  ClassInfo, 
  CodePattern,
  SymbolRelationship 
} from '../types/essential-features.js';
import { StreamingCppParser } from '../parsers/streaming-cpp-parser.js';
import { PipelineStage } from '../types/index.js';

export class EnhancedIndexer extends EventEmitter {
  private db: Database.Database;
  private parser: StreamingCppParser;
  private patternCache: Map<string, CodePattern> = new Map();
  private dbPath: string;

  constructor(dbPathOrDatabase: string | Database.Database) {
    super();
    
    if (typeof dbPathOrDatabase === 'string') {
      // Legacy mode: create our own database connection
      this.dbPath = dbPathOrDatabase;
      this.db = new Database(dbPathOrDatabase);
      this.initDatabase();
    } else {
      // New mode: use existing database (managed by UnifiedSchemaManager)
      this.db = dbPathOrDatabase;
      this.dbPath = dbPathOrDatabase.name || 'unknown';
      // Don't call initDatabase() - assume UnifiedSchemaManager has already set up the schema
    }
    
    this.parser = new StreamingCppParser({ fastMode: false });
  }

  private initDatabase(): void {
    this.db.exec(`
      -- Enhanced module index with detailed signatures
      CREATE TABLE IF NOT EXISTS enhanced_modules (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        stage TEXT NOT NULL,
        module_data TEXT NOT NULL, -- JSON blob of EnhancedModuleInfo
        file_size INTEGER NOT NULL,
        last_modified INTEGER NOT NULL,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      -- Method signatures for fast lookup
      CREATE TABLE IF NOT EXISTS method_signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_path TEXT NOT NULL,
        class_name TEXT,
        method_name TEXT NOT NULL,
        full_signature TEXT NOT NULL,
        return_type TEXT,
        parameters TEXT NOT NULL, -- JSON array
        visibility TEXT NOT NULL,
        is_virtual BOOLEAN NOT NULL,
        is_static BOOLEAN NOT NULL,
        is_const BOOLEAN NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        FOREIGN KEY (module_path) REFERENCES enhanced_modules(path)
      );

      -- Class hierarchy and relationships
      CREATE TABLE IF NOT EXISTS class_hierarchy (
        module_path TEXT NOT NULL,
        class_name TEXT NOT NULL,
        base_class TEXT,
        implements_interface TEXT,
        relationship_type TEXT NOT NULL,
        PRIMARY KEY (module_path, class_name, base_class, implements_interface)
      );

      -- Code patterns for similarity detection
      CREATE TABLE IF NOT EXISTS code_patterns (
        pattern_hash TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        category TEXT NOT NULL,
        frequency INTEGER NOT NULL,
        locations TEXT NOT NULL -- JSON array of file:line
      );

      -- Symbol relationships are managed by UnifiedSchemaManager

      -- Usage examples
      CREATE TABLE IF NOT EXISTS usage_examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        module_path TEXT NOT NULL,
        example_code TEXT NOT NULL,
        context TEXT NOT NULL,
        line INTEGER NOT NULL
      );

      -- Create indices for performance
      CREATE INDEX IF NOT EXISTS idx_method_name ON method_signatures(method_name);
      CREATE INDEX IF NOT EXISTS idx_return_type ON method_signatures(return_type);
      CREATE INDEX IF NOT EXISTS idx_class_name ON method_signatures(class_name);
      CREATE INDEX IF NOT EXISTS idx_pattern_category ON code_patterns(category);
      CREATE INDEX IF NOT EXISTS idx_symbol_from ON symbol_relationships(from_symbol);
      CREATE INDEX IF NOT EXISTS idx_symbol_to ON symbol_relationships(to_symbol);
      CREATE INDEX IF NOT EXISTS idx_usage_symbol ON usage_examples(symbol);
    `);
  }

  async indexModule(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Parse the file for enhanced information
    const moduleInfo = await this.parseEnhancedModule(filePath, content);
    
    // Store in database
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO enhanced_modules 
      (path, relative_path, stage, module_data, file_size, last_modified, hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      filePath,
      moduleInfo.relativePath,
      this.identifyStage(filePath),
      JSON.stringify(moduleInfo),
      stats.size,
      stats.mtimeMs,
      hash,
      Date.now()
    );

    // Index methods
    await this.indexMethods(filePath, moduleInfo);
    
    // Index class hierarchy
    await this.indexClassHierarchy(filePath, moduleInfo);
    
    // Extract and index patterns
    await this.indexPatterns(filePath, content);
    
    // Index relationships
    await this.indexRelationships(filePath, moduleInfo);
    
    // Extract usage examples
    await this.extractUsageExamples(filePath, content, moduleInfo);

    this.emit('module:indexed', { path: filePath, methods: moduleInfo.methods.length });
  }

  private async parseEnhancedModule(filePath: string, content: string): Promise<EnhancedModuleInfo> {
    // This would use an enhanced C++ parser to extract detailed information
    // For now, we'll create a placeholder structure
    const basicSymbols = await this.parser.parseFile(filePath);
    
    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods: [], // Would be populated by enhanced parser
      classes: [], // Would be populated by enhanced parser
      interfaces: [], // Would be populated by enhanced parser
      relationships: [],
      patterns: [],
      imports: Array.from(basicSymbols.includes).map((inc: string) => ({
        module: inc,
        symbols: [],
        isSystem: inc.startsWith('<'),
        location: { line: 0, column: 0 }
      })),
      exports: Array.from(basicSymbols.exports).map(exp => ({
        symbol: exp,
        type: 'function' as const,
        location: { line: 0, column: 0 }
      }))
    };
  }

  private async indexMethods(modulePath: string, moduleInfo: EnhancedModuleInfo): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO method_signatures 
      (module_path, class_name, method_name, full_signature, return_type, 
       parameters, visibility, is_virtual, is_static, is_const, line, column)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const method of moduleInfo.methods) {
      stmt.run(
        modulePath,
        method.className || null,
        method.name,
        this.buildFullSignature(method),
        method.returnType,
        JSON.stringify(method.parameters),
        method.visibility,
        method.isVirtual ? 1 : 0,
        method.isStatic ? 1 : 0,
        method.isConst ? 1 : 0,
        method.location.line,
        method.location.column
      );
    }
  }

  private buildFullSignature(method: MethodSignature): string {
    const params = method.parameters
      .map(p => `${p.isConst ? 'const ' : ''}${p.type}${p.isReference ? '&' : ''}${p.isPointer ? '*' : ''} ${p.name}`)
      .join(', ');
    
    return `${method.returnType} ${method.name}(${params})${method.isConst ? ' const' : ''}`;
  }

  private async indexClassHierarchy(modulePath: string, moduleInfo: EnhancedModuleInfo): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO class_hierarchy 
      (module_path, class_name, base_class, implements_interface, relationship_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const classInfo of moduleInfo.classes) {
      // Index base classes
      for (const baseClass of classInfo.baseClasses) {
        stmt.run(modulePath, classInfo.name, baseClass, null, 'inherits');
      }
      
      // Index interfaces
      for (const iface of classInfo.interfaces) {
        stmt.run(modulePath, classInfo.name, null, iface, 'implements');
      }
    }
  }

  private async indexPatterns(filePath: string, content: string): Promise<void> {
    const patterns = this.extractPatterns(content);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_patterns 
      (pattern_hash, pattern, category, frequency, locations)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const pattern of patterns) {
      const existing = this.patternCache.get(pattern.hash);
      
      if (existing) {
        existing.frequency++;
        existing.locations.push(`${filePath}:${pattern.locations[0]}`);
        
        stmt.run(
          pattern.hash,
          pattern.pattern,
          pattern.category,
          existing.frequency,
          JSON.stringify(existing.locations)
        );
      } else {
        this.patternCache.set(pattern.hash, pattern);
        
        stmt.run(
          pattern.hash,
          pattern.pattern,
          pattern.category,
          1,
          JSON.stringify([`${filePath}:${pattern.locations[0]}`])
        );
      }
    }
  }

  private extractPatterns(content: string): CodePattern[] {
    const patterns: CodePattern[] = [];
    const lines = content.split('\n');
    
    // Extract loop patterns
    const loopRegex = /for\s*\([^)]+\)\s*{/g;
    let match;
    while ((match = loopRegex.exec(content)) !== null) {
      const pattern = this.normalizePattern(match[0]);
      const hash = crypto.createHash('md5').update(pattern).digest('hex');
      const line = content.substring(0, match.index).split('\n').length;
      
      patterns.push({
        pattern,
        hash,
        frequency: 1,
        locations: [line.toString()],
        category: 'loop'
      });
    }
    
    // More pattern extraction would be implemented here
    
    return patterns;
  }

  private normalizePattern(pattern: string): string {
    // Normalize variable names and whitespace
    return pattern
      .replace(/\b[a-zA-Z_]\w*\b/g, 'VAR')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async indexRelationships(modulePath: string, moduleInfo: EnhancedModuleInfo): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO symbol_relationships 
      (from_symbol, from_module, to_symbol, to_module, relationship_type, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const rel of moduleInfo.relationships) {
      stmt.run(
        rel.from,
        modulePath,
        rel.to,
        modulePath, // Would be resolved to actual module
        rel.type,
        rel.confidence
      );
    }
  }

  private async extractUsageExamples(
    filePath: string, 
    content: string, 
    moduleInfo: EnhancedModuleInfo
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO usage_examples 
      (symbol, module_path, example_code, context, line)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Extract usage examples from the code
    // This is a simplified version - real implementation would be more sophisticated
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for instantiations and method calls
      const instantiationRegex = /(\w+)\s+(\w+)\s*[({]/;
      const match = line.match(instantiationRegex);
      
      if (match) {
        const [, className, varName] = match;
        
        // Extract context (3 lines before and after)
        const contextStart = Math.max(0, i - 3);
        const contextEnd = Math.min(lines.length - 1, i + 3);
        const context = lines.slice(contextStart, contextEnd + 1).join('\n');
        
        stmt.run(
          className,
          filePath,
          context,
          `Instantiation of ${className}`,
          i + 1
        );
      }
    }
  }

  private identifyStage(filePath: string): PipelineStage {
    const normalized = filePath.toLowerCase();
    
    if (normalized.includes('noise')) return PipelineStage.NoiseGeneration;
    if (normalized.includes('terrain')) return PipelineStage.TerrainFormation;
    if (normalized.includes('atmosphere')) return PipelineStage.AtmosphericDynamics;
    if (normalized.includes('geological')) return PipelineStage.GeologicalProcesses;
    if (normalized.includes('ecosystem')) return PipelineStage.EcosystemSimulation;
    if (normalized.includes('weather')) return PipelineStage.WeatherSystems;
    if (normalized.includes('render')) return PipelineStage.FinalRendering;
    
    return PipelineStage.NoiseGeneration;
  }

  // Query methods for the new tools
  async findImplementations(
    functionality: string, 
    keywords: string[], 
    returnType?: string
  ): Promise<MethodSignature[]> {
    let query = `
      SELECT * FROM method_signatures 
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    // Add keyword search
    if (keywords.length > 0) {
      query += ` AND (${keywords.map(() => 'method_name LIKE ?').join(' OR ')})`;
      params.push(...keywords.map(k => `%${k}%`));
    }
    
    // Add return type filter
    if (returnType) {
      query += ` AND return_type LIKE ?`;
      params.push(`%${returnType}%`);
    }
    
    const stmt = this.db.prepare(query);
    const results = stmt.all(...params);
    
    return results.map((row: any) => ({
      name: row.method_name,
      className: row.class_name,
      parameters: JSON.parse(row.parameters),
      returnType: row.return_type,
      visibility: row.visibility,
      isVirtual: row.is_virtual === 1,
      isStatic: row.is_static === 1,
      isConst: row.is_const === 1,
      location: { line: row.line, column: row.column }
    }));
  }

  async findSimilarPatterns(pattern: string, threshold: number): Promise<CodePattern[]> {
    const normalizedPattern = this.normalizePattern(pattern);
    const patternHash = crypto.createHash('md5').update(normalizedPattern).digest('hex');
    
    // First check for exact match
    const exactMatch = this.db.prepare(
      'SELECT * FROM code_patterns WHERE pattern_hash = ?'
    ).get(patternHash) as any;
    
    if (exactMatch) {
      return [{
        pattern: exactMatch.pattern,
        hash: exactMatch.pattern_hash,
        frequency: exactMatch.frequency,
        locations: JSON.parse(exactMatch.locations),
        category: exactMatch.category
      }];
    }
    
    // Find similar patterns (simplified - real implementation would use better similarity metrics)
    const allPatterns = this.db.prepare(
      'SELECT * FROM code_patterns WHERE category = ?'
    ).all(this.categorizePattern(pattern));
    
    return allPatterns
      .map((p: any) => ({
        pattern: p.pattern,
        hash: p.pattern_hash,
        frequency: p.frequency,
        locations: JSON.parse(p.locations),
        category: p.category
      }))
      .filter((p: CodePattern) => this.calculateSimilarity(p.pattern, normalizedPattern) >= threshold);
  }

  private categorizePattern(pattern: string): string {
    if (pattern.includes('for') || pattern.includes('while')) return 'loop';
    if (pattern.includes('if') || pattern.includes('switch')) return 'conditional';
    if (pattern.includes('=') && !pattern.includes('==')) return 'initialization';
    return 'other';
  }

  private calculateSimilarity(pattern1: string, pattern2: string): number {
    // Simplified similarity calculation
    const tokens1 = pattern1.split(' ');
    const tokens2 = pattern2.split(' ');
    
    const commonTokens = tokens1.filter(t => tokens2.includes(t)).length;
    const totalTokens = Math.max(tokens1.length, tokens2.length);
    
    return commonTokens / totalTokens;
  }

  /**
   * Index an entire project directory
   */
  async indexProject(projectPath: string): Promise<{ filesProcessed: number; symbolsIndexed: number }> {
    const startTime = Date.now();
    let filesProcessed = 0;
    let symbolsIndexed = 0;
    
    this.emit('indexing:start', { projectPath });
    
    try {
      // Get all C++ files in the project
      const files = await this.findCppFiles(projectPath);
      const totalFiles = files.length;
      
      this.emit('indexing:progress', { 
        phase: 'discovery', 
        filesFound: totalFiles 
      });
      
      // Process files in batches
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        // Process batch in parallel
        await Promise.all(batch.map(async (file) => {
          try {
            await this.indexModule(file);
            filesProcessed++;
            
            // Count symbols indexed
            const symbolCount = this.db.prepare(`
              SELECT COUNT(*) as count 
              FROM enhanced_symbols 
              WHERE file_path = ?
            `).get(file) as any;
            
            symbolsIndexed += symbolCount.count || 0;
            
            this.emit('file:indexed', { 
              file, 
              progress: filesProcessed / totalFiles 
            });
          } catch (error) {
            this.emit('file:error', { 
              file, 
              error: error instanceof Error ? error.message : String(error) 
            });
          }
        }));
        
        // Emit progress
        this.emit('indexing:progress', {
          phase: 'indexing',
          filesProcessed,
          totalFiles,
          percentage: Math.round((filesProcessed / totalFiles) * 100)
        });
      }
      
      // Update module dependencies
      await this.updateModuleDependencies();
      
      // Calculate metrics
      await this.calculateProjectMetrics();
      
      const duration = Date.now() - startTime;
      this.emit('indexing:complete', {
        filesProcessed,
        symbolsIndexed,
        duration
      });
      
      return { filesProcessed, symbolsIndexed };
    } catch (error) {
      this.emit('indexing:error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
  
  private async findCppFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    
    async function scanDirectory(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip common non-source directories
          if (!['node_modules', '.git', 'build', 'dist', 'bin', 'obj'].includes(entry.name)) {
            await scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          // Check for C++ file extensions
          const ext = path.extname(entry.name).toLowerCase();
          if (['.cpp', '.cc', '.cxx', '.c++', '.hpp', '.h', '.hh', '.hxx', '.h++'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    await scanDirectory(projectPath);
    return files;
  }
  
  private async updateModuleDependencies(): Promise<void> {
    // Update module-level dependencies based on symbol relationships
    const modules = this.db.prepare(`
      SELECT DISTINCT path FROM modules
    `).all() as any[];
    
    for (const module of modules) {
      const dependencies = this.db.prepare(`
        SELECT DISTINCT to_module
        FROM symbol_relationships sr
        JOIN enhanced_symbols s ON sr.from_symbol_id = s.id
        WHERE s.file_path LIKE ? || '%'
          AND to_module != ?
      `).all(module.path, module.path) as any[];
      
      const depList = dependencies.map(d => d.to_module).filter(Boolean);
      
      this.db.prepare(`
        UPDATE modules 
        SET dependencies = ?
        WHERE path = ?
      `).run(JSON.stringify(depList), module.path);
    }
  }
  
  private async calculateProjectMetrics(): Promise<void> {
    // Calculate and store project-wide metrics
    const metrics = {
      totalFiles: this.db.prepare('SELECT COUNT(*) as count FROM enhanced_modules').get() as any,
      totalSymbols: this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any,
      totalRelationships: this.db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as any,
      avgComplexity: this.db.prepare('SELECT AVG(complexity) as avg FROM enhanced_symbols WHERE complexity IS NOT NULL').get() as any,
      timestamp: Date.now()
    };
    
    // Store metrics in a dedicated table or emit them
    this.emit('metrics:calculated', metrics);
  }

  close(): void {
    this.db.close();
  }
}