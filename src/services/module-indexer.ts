import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import Database from 'better-sqlite3';
import { UnifiedCppParser } from '../parsers/unified-cpp-parser';
import { ModuleSymbols } from '../types/essential-features';
import { PipelineStage } from '../types/index';
import { EventEmitter } from 'events';

export interface IndexOptions {
  projectPath: string;
  scanPaths: string[];
  filePatterns: string[];
  dbPath?: string;
  parallel?: boolean;
  maxConcurrent?: number;
}

export interface ModuleIndex {
  path: string;
  relativePath: string;
  stage: PipelineStage;
  symbols: ModuleSymbols;
  fileSize: number;
  lastModified: number;
  hash: string;
}

export class ModuleIndexer extends EventEmitter {
  private db: Database.Database | null = null;
  private dbPath: string;
  private parser: UnifiedCppParser;
  private options: IndexOptions;
  private indexCache: Map<string, ModuleIndex> = new Map();

  constructor(options: IndexOptions) {
    super();
    this.options = options;
    this.parser = new UnifiedCppParser({
      enableModuleAnalysis: true,
      enableSemanticAnalysis: true,
      enableTypeAnalysis: true,
      debugMode: false,
      projectPath: options.projectPath
    });
    this.dbPath = options.dbPath || path.join(process.cwd(), '.module-sentinel', 'index.db');
    
    // Don't create database connection in constructor - use lazy initialization
  }
  
  private getDatabase(): Database.Database {
    // Lazy initialization with intelligent connection management
    if (!this.db || !this.db.open) {
      // Create or recreate the database connection
      this.db = new Database(this.dbPath);
      this.initDatabase();
    }
    return this.db;
  }

  private initDatabase(): void {
    if (!this.db) return; // Safety check
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS module_index (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        stage TEXT NOT NULL,
        exports TEXT NOT NULL,
        imports TEXT NOT NULL,
        dependencies TEXT NOT NULL,
        namespaces TEXT NOT NULL,
        classes TEXT NOT NULL,
        functions TEXT NOT NULL,
        includes TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        last_modified INTEGER NOT NULL,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stage ON module_index(stage);
      CREATE INDEX IF NOT EXISTS idx_classes ON module_index(classes);
      CREATE INDEX IF NOT EXISTS idx_functions ON module_index(functions);
      CREATE INDEX IF NOT EXISTS idx_last_modified ON module_index(last_modified);

      CREATE TABLE IF NOT EXISTS symbol_lookup (
        symbol TEXT NOT NULL,
        module_path TEXT NOT NULL,
        symbol_type TEXT NOT NULL,
        PRIMARY KEY (symbol, module_path)
      );

      CREATE INDEX IF NOT EXISTS idx_symbol ON symbol_lookup(symbol);

      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Initialize metadata if not exists
    const metaStmt = this.getDatabase().prepare('INSERT OR IGNORE INTO index_metadata (key, value) VALUES (?, ?)');
    metaStmt.run('version', '1.0');
    metaStmt.run('last_full_index', '0');
    metaStmt.run('total_indexed', '0');
  }

  async needsIndexing(): Promise<boolean> {
    // Check if index exists and is recent
    const lastIndex = this.getMetadata('last_full_index');
    if (!lastIndex || lastIndex === '0') return true;
    
    const lastIndexTime = parseInt(lastIndex);
    const daysSinceIndex = (Date.now() - lastIndexTime) / (1000 * 60 * 60 * 24);
    
    // Force reindex if older than 7 days
    if (daysSinceIndex > 7) return true;
    
    // Check if any files are newer than last index
    const files = await this.findSourceFiles();
    const newerFiles = await Promise.all(
      files.slice(0, 10).map(async (file) => {
        const stats = await fs.stat(file);
        return stats.mtimeMs > lastIndexTime;
      })
    );
    
    return newerFiles.some(isNewer => isNewer);
  }

  async buildIndex(force: boolean = false): Promise<void> {
    // Check if we need to index
    if (!force) {
      const needsIndex = await this.needsIndexing();
      if (!needsIndex) {
        this.emit('indexing:skipped', { reason: 'Index is up to date' });
        return;
      }
    }

    this.emit('indexing:start', { paths: this.options.scanPaths });

    const files = await this.findSourceFiles();
    const total = files.length;
    let processed = 0;
    let updated = 0;

    this.emit('indexing:found', { total });

    // Process files in batches
    const batchSize = this.options.maxConcurrent || 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (filePath) => {
        try {
          const shouldIndex = force || await this.shouldReindex(filePath);
          if (shouldIndex) {
            await this.indexFile(filePath);
            updated++;
          }
          processed++;
          this.emit('indexing:progress', { processed, total });
        } catch (error) {
          this.emit('indexing:error', { filePath, error });
        }
      }));
    }

    // Build symbol lookup table
    await this.buildSymbolLookup();

    // Update metadata
    this.setMetadata('last_full_index', Date.now().toString());
    this.setMetadata('total_indexed', total.toString());

    this.emit('indexing:complete', { processed, updated });
  }

  private async findSourceFiles(): Promise<string[]> {
    const files: string[] = [];
    
    for (const scanPath of this.options.scanPaths) {
      for (const pattern of this.options.filePatterns) {
        const matches = await glob(pattern, {
          cwd: scanPath,
          absolute: true,
          ignore: ['**/node_modules/**', '**/build/**', '**/external/**']
        });
        files.push(...matches);
      }
    }

    return [...new Set(files)]; // Remove duplicates
  }

  private async shouldReindex(filePath: string): Promise<boolean> {
    const stats = await fs.stat(filePath);
    const existing = this.getFromCache(filePath);
    
    if (!existing) return true;
    
    return stats.mtimeMs > existing.lastModified;
  }

  private async indexFile(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const symbols = await this.parser.parseFile(filePath);
    const relativePath = path.relative(this.options.projectPath, filePath);
    const stage = this.identifyStage(filePath);
    
    const moduleIndex: ModuleIndex = {
      path: filePath,
      relativePath,
      stage,
      symbols: {
        filePath: filePath,
        exports: new Set(symbols.exports?.map(e => typeof e === 'string' ? e : e.symbol) || []),
        imports: new Set(symbols.imports?.map(i => typeof i === 'string' ? i : i.module) || []),
        functions: new Set(symbols.functions?.map(f => typeof f === 'string' ? f : f.name) || []),
        classes: new Set(symbols.classes?.map(c => typeof c === 'string' ? c : c.name) || []),
        namespaces: new Set(symbols.namespaces?.map(n => typeof n === 'string' ? n : n.name) || []),
        includes: new Set(symbols.includes || []),
        confidence: typeof symbols.confidence === 'number' ? symbols.confidence : symbols.confidence?.overall || 0.8,
        moduleInfo: symbols.moduleInfo ? {
          isModule: symbols.moduleInfo.isModule,
          moduleName: symbols.moduleInfo.moduleName || undefined,
          importedModules: symbols.moduleInfo.importedModules || []
        } : undefined
      },
      fileSize: stats.size,
      lastModified: stats.mtimeMs,
      hash: await this.calculateFileHash(filePath)
    };

    this.saveToDatabase(moduleIndex);
    this.indexCache.set(filePath, moduleIndex);
  }

  private saveToDatabase(index: ModuleIndex): void {
    const stmt = this.getDatabase().prepare(`
      INSERT OR REPLACE INTO module_index 
      (path, relative_path, stage, exports, imports, dependencies, 
       namespaces, classes, functions, includes, file_size, 
       last_modified, hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      index.path,
      index.relativePath,
      index.stage,
      JSON.stringify(Array.from(index.symbols.exports)),
      JSON.stringify(Array.from(index.symbols.imports)),
      JSON.stringify(Array.from(index.symbols.relationships?.map(r => r.to) || [])),
      JSON.stringify(Array.from(index.symbols.namespaces)),
      JSON.stringify(Array.from(index.symbols.classes)),
      JSON.stringify(Array.from(index.symbols.functions)),
      JSON.stringify(Array.from(index.symbols.includes || [])),
      index.fileSize,
      index.lastModified,
      index.hash,
      Date.now()
    );
  }

  private async buildSymbolLookup(): Promise<void> {
    // Clear existing lookup
    this.getDatabase().prepare('DELETE FROM symbol_lookup').run();

    const insertStmt = this.getDatabase().prepare(`
      INSERT OR IGNORE INTO symbol_lookup (symbol, module_path, symbol_type)
      VALUES (?, ?, ?)
    `);

    const modules = this.getDatabase().prepare('SELECT path, classes, functions, namespaces FROM module_index').all() as any[];

    for (const module of modules) {
      const classes = JSON.parse(module.classes);
      const functions = JSON.parse(module.functions);
      const namespaces = JSON.parse(module.namespaces);

      classes.forEach((symbol: string) => insertStmt.run(symbol, module.path, 'class'));
      functions.forEach((symbol: string) => insertStmt.run(symbol, module.path, 'function'));
      namespaces.forEach((symbol: string) => insertStmt.run(symbol, module.path, 'namespace'));
    }
  }

  async findSymbol(symbol: string): Promise<Array<{ path: string; type: string }>> {
    const stmt = this.getDatabase().prepare(`
      SELECT module_path as path, symbol_type as type 
      FROM symbol_lookup 
      WHERE symbol = ?
    `);

    return stmt.all(symbol) as any[];
  }

  async findImportsForSymbols(symbols: string[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();

    for (const symbol of symbols) {
      const modules = await this.findSymbol(symbol);
      results.set(symbol, modules.map(m => m.path));
    }

    return results;
  }

  async getModulesByStage(stage: PipelineStage): Promise<ModuleIndex[]> {
    const stmt = this.getDatabase().prepare(`
      SELECT * FROM module_index WHERE stage = ?
    `);

    const rows = stmt.all(stage) as any[];
    return rows.map(row => this.rowToModuleIndex(row));
  }

  async getDependencyGraph(): Promise<Map<string, Set<string>>> {
    const graph = new Map<string, Set<string>>();
    
    const modules = this.getDatabase().prepare('SELECT path, includes FROM module_index').all() as any[];
    
    for (const module of modules) {
      const includes = JSON.parse(module.includes);
      const deps = new Set<string>();
      
      // Map includes to actual module paths
      for (const include of includes) {
        const depModules = await this.findModuleByInclude(include);
        depModules.forEach(dep => deps.add(dep));
      }
      
      graph.set(module.path, deps);
    }

    return graph;
  }

  private async findModuleByInclude(include: string): Promise<string[]> {
    // Simple heuristic: match by filename
    const basename = path.basename(include, path.extname(include));
    
    const stmt = this.getDatabase().prepare(`
      SELECT path FROM module_index 
      WHERE relative_path LIKE ?
    `);

    const results = stmt.all(`%${basename}%`) as any[];
    return results.map(r => r.path);
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
    
    // More specific patterns
    if (normalized.includes('vulkan')) return PipelineStage.FinalRendering;
    if (normalized.includes('compute')) return PipelineStage.NoiseGeneration;
    if (normalized.includes('mesh')) return PipelineStage.TerrainFormation;
    if (normalized.includes('heightmap')) return PipelineStage.TerrainFormation;
    
    return PipelineStage.NoiseGeneration; // Default
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const stats = await fs.stat(filePath);
    // Simple hash based on size and mtime - good enough for change detection
    return `${stats.size}-${stats.mtimeMs}`;
  }

  private getFromCache(filePath: string): ModuleIndex | null {
    const cached = this.indexCache.get(filePath);
    if (cached) return cached;

    const stmt = this.getDatabase().prepare('SELECT * FROM module_index WHERE path = ?');
    const row = stmt.get(filePath) as any;
    
    if (row) {
      const index = this.rowToModuleIndex(row);
      this.indexCache.set(filePath, index);
      return index;
    }

    return null;
  }

  private rowToModuleIndex(row: any): ModuleIndex {
    return {
      path: row.path,
      relativePath: row.relative_path,
      stage: row.stage,
      symbols: {
        exports: new Set(JSON.parse(row.exports)),
        imports: new Set(JSON.parse(row.imports)),
        dependencies: new Set(JSON.parse(row.dependencies)),
        namespaces: new Set(JSON.parse(row.namespaces)),
        classes: new Set(JSON.parse(row.classes)),
        functions: new Set(JSON.parse(row.functions)),
        includes: new Set(JSON.parse(row.includes)),
        filePath: row.path,
        confidence: 0.8
      },
      fileSize: row.file_size,
      lastModified: row.last_modified,
      hash: row.hash
    };
  }

  async getStats(): Promise<any> {
    const total = this.getDatabase().prepare('SELECT COUNT(*) as count FROM module_index').get() as any;
    const byStage = this.getDatabase().prepare('SELECT stage, COUNT(*) as count FROM module_index GROUP BY stage').all() as any[];
    const totalSize = this.getDatabase().prepare('SELECT SUM(file_size) as size FROM module_index').get() as any;
    const avgSize = this.getDatabase().prepare('SELECT AVG(file_size) as size FROM module_index').get() as any;
    const largestFiles = this.getDatabase().prepare('SELECT path, file_size FROM module_index ORDER BY file_size DESC LIMIT 10').all() as any[];

    return {
      totalModules: total.count,
      byStage: byStage.reduce((acc, row) => ({ ...acc, [row.stage]: row.count }), {}),
      totalSize: totalSize.size,
      averageSize: avgSize.size,
      largestFiles: largestFiles.map((f: any) => ({ path: f.path, size: f.file_size }))
    };
  }

  private getMetadata(key: string): string | null {
    const stmt = this.getDatabase().prepare('SELECT value FROM index_metadata WHERE key = ?');
    const result = stmt.get(key) as any;
    return result ? result.value : null;
  }

  private setMetadata(key: string, value: string): void {
    const stmt = this.getDatabase().prepare('INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  async updateFile(filePath: string): Promise<void> {
    await this.indexFile(filePath);
    await this.buildSymbolLookup();
  }

  async removeFile(filePath: string): Promise<void> {
    this.getDatabase().prepare('DELETE FROM module_index WHERE path = ?').run(filePath);
    this.indexCache.delete(filePath);
    await this.buildSymbolLookup();
  }

  getIndexAge(): number {
    const lastIndex = this.getMetadata('last_full_index');
    if (!lastIndex || lastIndex === '0') return Infinity;
    return Date.now() - parseInt(lastIndex);
  }

  close(): void {
    if (this.db && this.db.open) {
      this.db.close();
      this.db = null; // Clear the reference so it can be recreated if needed
    }
  }
}