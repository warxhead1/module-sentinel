import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();
import { 
  ModuleInfo, 
  ImportSuggestion, 
  CodeContext, 
  DependencyGraph, 
  ArchitecturalDecision,
  ModuleChangeEvent,
  PipelineStage
} from './types/index';
import { ParallelProcessingEngine } from './engines/parallel-engine';
import { ThoughtSignaturePreserver } from './engines/thought-signature';
import { UnifiedCppParser } from './parsers/unified-cpp-parser';
import { ModuleIndexer } from './services/module-indexer';
import { GeminiTool } from './tools/gemini-tool';
// import { KnowledgeBase } from './services/knowledge-base'; // Removed - unused service

export class ModuleSentinel {
  private moduleCache: Map<string, ModuleInfo> = new Map();
  private parallelEngine: ParallelProcessingEngine;
  private consciousness?: ThoughtSignaturePreserver;
  private mcpServer?: Server;
  private unifiedParser!: UnifiedCppParser;
  private indexer?: ModuleIndexer;
  private geminiTool: GeminiTool; // New member
  // private knowledgeBase: KnowledgeBase; // Removed - replaced with direct DB queries
  private watchHandles: Map<string, any> = new Map();
  private config: any;

  constructor() {
    this.parallelEngine = new ParallelProcessingEngine();
    // ThoughtSignaturePreserver will be initialized later when we have a database
    this.unifiedParser = new UnifiedCppParser({
      enableModuleAnalysis: true,
      enableSemanticAnalysis: true,
      enableTypeAnalysis: true,
      debugMode: process.env.MODULE_SENTINEL_DEBUG === 'true'
    });
    // Initialize geminiTool with env var if available, otherwise empty string
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.geminiTool = new GeminiTool(apiKey); 
    // KnowledgeBase removed - using direct DB queries instead
  }

  async initialize(options?: { skipAutoIndex?: boolean }): Promise<void> {
    await this.parallelEngine.initialize();
    // await this.consciousness.initialize();
    // CppAstAnalyzer removed - was unused and redundant with EnhancedTreeSitterParser
    
    // Load configuration if available
    try {
      const configPath = path.join(process.cwd(), 'module-sentinel.config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      this.config = JSON.parse(configData);

      // Pass API key to GeminiTool (prefer env var over config)
      const apiKey = process.env.GEMINI_API_KEY || this.config.geminiApiKey;
      if (apiKey) {
        this.geminiTool = new GeminiTool(apiKey);
      } else {
        console.warn('⚠️  Gemini API Key not found. Set GEMINI_API_KEY env var or add geminiApiKey to config.');
      }
      
      // Initialize indexer with config
      const projectPath = process.env.CPP_PROJECT_PATH || this.config.projectPath;
      if (!projectPath) {
        throw new Error("CPP_PROJECT_PATH environment variable or projectPath in module-sentinel.config.json must be set.");
      }
      this.indexer = new ModuleIndexer({
        projectPath: projectPath,
        scanPaths: this.config.scanPaths,
        filePatterns: [...this.config.filePatterns.source, ...this.config.filePatterns.header],
        parallel: true,
        maxConcurrent: 10
      });
      
      // Don't test database connection immediately - let it initialize lazily
      console.log('Module indexer initialized with lazy database connection');
      
      // KnowledgeBase initialization removed - using indexer DB directly
      
      // Set up indexer event handlers
      this.indexer.on('indexing:skipped', (data) => {
        console.error(`Index is up to date (${data.reason})`);
      });
      
      this.indexer.on('indexing:start', () => {
        console.error('Building module index...');
      });
      
      this.indexer.on('indexing:complete', async (data) => {
        if (this.indexer) {
          const stats = await this.indexer.getStats();
          console.error(`Indexed ${stats.totalModules} modules (updated ${data.updated} files)`);
        }
      });
      
      // Build index only if needed and not skipped
      if (!options?.skipAutoIndex) {
        await this.indexer.buildIndex();
      }
    } catch (error) {
      console.error('No configuration file found, using defaults');
    }
  }

  // New MCP tool for Gemini interaction
  async queryGemini(prompt: string, context?: CodeContext): Promise<string> {
    return this.geminiTool.callGemini(prompt, context);
  }

  async queryPatterns(filePath?: string, type?: string): Promise<any[]> {
    if (!this.indexer) {
      throw new Error('Indexer not initialized');
    }
    
    // Query patterns from the database
    const db = (this.indexer as any).db;
    let query = 'SELECT * FROM detected_patterns WHERE 1=1';
    const params: any[] = [];
    
    if (filePath) {
      query += ' AND symbol_id IN (SELECT id FROM enhanced_symbols WHERE file_path = ?)';
      params.push(filePath);
    }
    
    if (type) {
      query += ' AND pattern_type = ?';
      params.push(type);
    }
    
    try {
      return db.prepare(query).all(...params);
    } catch (error) {
      console.error('Error querying patterns:', error);
      return [];
    }
  }

  async queryRelationships(filePath?: string, source?: string, target?: string, type?: string): Promise<any[]> {
    if (!this.indexer) {
      throw new Error('Indexer not initialized');
    }
    
    // Query relationships from the database
    const db = (this.indexer as any).db;
    let query = 'SELECT * FROM symbol_relationships WHERE 1=1';
    const params: any[] = [];
    
    if (filePath) {
      query += ' AND (from_symbol_id IN (SELECT id FROM enhanced_symbols WHERE file_path = ?) OR to_symbol_id IN (SELECT id FROM enhanced_symbols WHERE file_path = ?))';
      params.push(filePath, filePath);
    }
    
    if (source) {
      query += ' AND from_name = ?';
      params.push(source);
    }
    
    if (target) {
      query += ' AND to_name = ?';
      params.push(target);
    }
    
    if (type) {
      query += ' AND relationship_type = ?';
      params.push(type);
    }
    
    try {
      return db.prepare(query).all(...params);
    } catch (error) {
      console.error('Error querying relationships:', error);
      return [];
    }
  }

  async analyzeModule(moduleFile: string): Promise<ModuleInfo> {
    // FAIL FAST: Check if indexer database is available
    if (this.indexer) {
      try {
        await this.indexer.getStats();
      } catch (dbError) {
        // If database error, it might have been closed - no need to fail the entire analysis
        // The indexer will recreate the connection if needed
        console.warn(`Database connection issue detected, will recreate if needed: ${dbError}`);
      }
    }

    const cached = this.moduleCache.get(moduleFile);
    if (cached && await this.isCacheValid(cached)) {
      return cached;
    }

    const startTime = Date.now();
    
    try {
      // Use streaming parser for large files
      const symbols = await this.unifiedParser.parseFile(moduleFile);
      const stage = this.identifyPipelineStage(moduleFile);

      const moduleInfo: ModuleInfo = {
        path: moduleFile,
        exports: symbols.exports?.map(e => typeof e === 'string' ? e : e.symbol) || [],
        imports: symbols.imports?.map(i => typeof i === 'string' ? i : i.module) || [],
        stage,
        dependencies: symbols.relationships?.map(r => r.to) || [],
        performanceProfile: {
          parseTime: Date.now() - startTime,
          memoryUsage: process.memoryUsage().heapUsed,
          cacheHitRate: this.calculateCacheHitRate(),
          lastUpdated: Date.now()
        }
      };

      this.moduleCache.set(moduleFile, moduleInfo);
      
      this.consciousness?.recordDecision({
        type: 'import',
        module: moduleFile,
        decision: `Analyzed module with ${moduleInfo.exports.length} exports and ${moduleInfo.imports.length} imports`,
        reasoning: `Module belongs to ${stage} stage of the pipeline`,
        timestamp: Date.now(),
        impact: moduleInfo.dependencies
      });

      return moduleInfo;
    } catch (error) {
      if (error instanceof Error && error.message.includes('database connection is not open')) {
        throw new Error(`CRITICAL DATABASE ERROR - Module analysis failed for ${moduleFile}: Database connection is not open. This indicates a fundamental initialization failure that must be fixed immediately. Original error: ${error.message}`);
      }
      throw new Error(`Failed to analyze module ${moduleFile}: ${error}`);
    }
  }

  async suggestImports(context: CodeContext): Promise<ImportSuggestion[]> {
    const suggestions: ImportSuggestion[] = [];
    const symbols = context.symbols || [];
    
    if (this.indexer) {
      // Use indexer for fast symbol lookup
      for (const symbol of symbols) {
        const matches = await this.indexer.findSymbol(symbol);
        
        for (const match of matches) {
          const confidence = this.calculateSymbolConfidence(symbol, match.type, context);
          suggestions.push({
            module: match.path,
            symbol: symbol,
            confidence,
            reasoning: `${match.type} ${symbol} found in ${path.basename(match.path)}`
          });
        }
      }
    } else {
      // Fallback to cache-based search
      const modules = await this.parallelEngine.processInParallel(
        Array.from(this.moduleCache.values()),
        async (module) => {
          const relevance = this.calculateRelevance(module, context, symbols);
          if (relevance > 0.3) {
            return { module, relevance };
          }
          return null;
        }
      );

      for (const result of modules) {
        if (!result) continue;
        
        const { module, relevance } = result;
        
        for (const exportedSymbol of module.exports) {
          if (symbols.some(s => this.symbolMatches(s, exportedSymbol))) {
            suggestions.push({
              module: module.path,
              symbol: exportedSymbol,
              confidence: relevance,
              reasoning: `Symbol ${exportedSymbol} exported from ${module.stage} stage module`
            });
          }
        }
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions.slice(0, 10);
  }

  async mapArchitecture(): Promise<DependencyGraph> {
    const nodes = new Map<string, ModuleInfo>();
    const edges = new Map<string, Set<string>>();
    const layers = new Map<PipelineStage, string[]>();
    
    for (const [path, module] of this.moduleCache) {
      nodes.set(path, module);
      
      if (!edges.has(path)) {
        edges.set(path, new Set());
      }
      
      for (const dep of module.dependencies) {
        edges.get(path)!.add(dep);
      }
      
      const stageModules = layers.get(module.stage) || [];
      stageModules.push(path);
      layers.set(module.stage, stageModules);
    }

    const cycles = this.detectCycles(edges);

    return { nodes, edges, cycles, layers };
  }

  preserveArchitecturalInsight(decision: ArchitecturalDecision): void {
    this.consciousness?.recordDecision(decision);
  }

  async watchForChanges(watchPath: string): Promise<void> {
    const watcher = fs.watch(watchPath, { recursive: true });
    
    for await (const event of watcher) {
      if (event.filename?.endsWith('.cpp') || event.filename?.endsWith('.hpp')) {
        const fullPath = path.join(watchPath, event.filename);
        this.onModuleChanged({
          path: fullPath,
          type: event.eventType === 'rename' ? 'created' : 'modified',
          timestamp: Date.now()
        });
      }
    }
  }

  async onModuleChanged(event: ModuleChangeEvent): Promise<void> {
    this.moduleCache.delete(event.path);
    
    if (event.type !== 'deleted') {
      try {
        await this.analyzeModule(event.path);
      } catch (error) {
        console.error(`Failed to reanalyze ${event.path}:`, error);
      }
    }
    
    this.consciousness?.recordDecision({
      type: 'refactor',
      module: event.path,
      decision: `Module ${event.type}`,
      reasoning: 'File system change detected',
      timestamp: event.timestamp,
      impact: []
    });
  }

  private identifyPipelineStage(filePath: string): PipelineStage {
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

  private async isCacheValid(cached: ModuleInfo): Promise<boolean> {
    if (!cached.performanceProfile) return false;
    
    const age = Date.now() - cached.performanceProfile.lastUpdated;
    return age < 300000; // 5 minutes
  }

  private calculateCacheHitRate(): number {
    return 0.95; // Placeholder
  }

  private calculateRelevance(module: ModuleInfo, context: CodeContext, symbols: string[]): number {
    let relevance = 0;
    
    const contextStage = this.identifyPipelineStage(context.filePath || '');
    if (module.stage === contextStage) relevance += 0.3;
    
    const sharedSymbols = symbols.filter(s => 
      module.exports.some(e => this.symbolMatches(s, e))
    );
    relevance += sharedSymbols.length * 0.1;

    // New: Incorporate cursor position and surrounding code
    if (context.cursorPosition && context.content) {
      const lines = context.content.split('\n');
      const currentLine = lines[context.cursorPosition.line - 1];
      if (currentLine && module.path.includes(currentLine)) { // Simple check
        relevance += 0.2;
      }
    }

    if (context.surroundingCode) {
      // Example: If surrounding code mentions 'texture', boost texture-related modules
      if (context.surroundingCode.toLowerCase().includes('texture') && module.path.toLowerCase().includes('texture')) {
        relevance += 0.15;
      }
    }

    if (context.activeTaskDescription) {
      // Example: If task is about 'Vulkan', boost Vulkan-related modules
      if (context.activeTaskDescription.toLowerCase().includes('vulkan') && module.path.toLowerCase().includes('vulkan')) {
        relevance += 0.2;
      }
    }
    
    return Math.min(relevance, 1.0);
  }

  private symbolMatches(requested: string, exported: string): boolean {
    return exported.toLowerCase().includes(requested.toLowerCase());
  }

  private calculateSymbolConfidence(symbol: string, type: string, context: CodeContext): number {
    let confidence = 0.5;
    
    // Higher confidence for exact matches
    if (context.content && context.content.includes(symbol)) {
      confidence += 0.2;
    }
    
    // Adjust by symbol type
    if (type === 'class') confidence += 0.2;
    if (type === 'function') confidence += 0.1;
    
    // Adjust by context stage
    const contextStage = this.identifyPipelineStage(context.filePath || '');
    const moduleStage = this.identifyPipelineStage(context.filePath || '');
    if (contextStage === moduleStage) confidence += 0.1;

    // New: Incorporate cursor position and surrounding code
    if (context.cursorPosition && context.content) {
      const lines = context.content.split('\n');
      const currentLine = lines[context.cursorPosition.line - 1];
      if (currentLine && currentLine.includes(symbol)) {
        confidence += 0.1;
      }
    }

    if (context.surroundingCode) {
      if (context.surroundingCode.toLowerCase().includes(symbol.toLowerCase())) {
        confidence += 0.1;
      }
    }

    if (context.activeTaskDescription) {
      if (context.activeTaskDescription.toLowerCase().includes(symbol.toLowerCase())) {
        confidence += 0.15;
      }
    }
    
    return Math.min(confidence, 1.0);
  }

  private detectCycles(edges: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const neighbors = edges.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart));
          }
        }
      }
      
      recursionStack.delete(node);
    };
    
    for (const node of edges.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
    
    return cycles;
  }

  async rebuildIndex(force: boolean = false): Promise<void> {
    if (!this.indexer) {
      throw new Error('Indexer not initialized');
    }
    
    await this.indexer.buildIndex(force);
  }

  async getIndexStatus(): Promise<any> {
    if (!this.indexer) {
      return { status: 'not_initialized' };
    }
    
    const stats = await this.indexer.getStats();
    const age = this.indexer.getIndexAge();
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    
    return {
      status: 'active',
      totalModules: stats.totalModules,
      totalSize: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
      averageSize: `${(stats.averageSize / 1024).toFixed(2)} KB`,
      indexAge: ageDays > 0 ? `${ageDays} days` : `${ageHours} hours`,
      lastUpdate: new Date(Date.now() - age).toISOString(),
      byStage: stats.byStage
    };
  }

  async shutdown(): Promise<void> {
    await this.parallelEngine.shutdown();
    await this.consciousness?.shutdown();
    
    if (this.indexer) {
      this.indexer.close();
    }
    
    for (const handle of this.watchHandles.values()) {
      clearInterval(handle);
    }
  }
}