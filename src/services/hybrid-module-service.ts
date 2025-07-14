import { PatternAwareIndexer } from '../indexing/pattern-aware-indexer.js';
import { ModuleIndexer } from './module-indexer.js';
import { 
  FindImplementationsRequest,
  FindImplementationsResponse,
  ImplementationMatch
} from '../types/essential-features.js';
import * as path from 'path';
import Database from 'better-sqlite3';

/**
 * Hybrid module service that uses pattern-aware indexing with fallback
 * Optimized for fast query-time performance
 */
export class HybridModuleService {
  private patternIndexer: PatternAwareIndexer;
  private fallbackIndexer: ModuleIndexer | null = null;
  private enhancedDb: Database.Database;
  private projectPath: string;
  
  constructor(projectPath: string, enhancedDbPath: string, fallbackDbPath?: string) {
    this.projectPath = projectPath;
    const debugMode = process.env.MODULE_SENTINEL_DEBUG === 'true';
    this.patternIndexer = new PatternAwareIndexer(projectPath, enhancedDbPath, debugMode);
    this.enhancedDb = new Database(enhancedDbPath);
    
    // Initialize fallback indexer if needed
    if (fallbackDbPath) {
      this.fallbackIndexer = new ModuleIndexer({
        projectPath,
        scanPaths: ['src', 'include'],
        filePatterns: ['**/*.cpp', '**/*.ixx', '**/*.cxx'],
        dbPath: fallbackDbPath
      });
    }
  }
  
  async initialize(): Promise<void> {
    // Check if pattern DB has data
    const result = this.enhancedDb.prepare(
      'SELECT COUNT(*) as count FROM enhanced_symbols'
    ).get() as { count: number } | undefined;
    const symbolCount = result?.count || 0;
    
    if (symbolCount === 0 && this.fallbackIndexer) {
      console.log('⚠️  Pattern-aware index empty, building from simple index...');
      await this.buildFromFallback();
    }
  }
  
  /**
   * Ultra-fast implementation finder using precomputed metadata
   */
  async findImplementations(request: FindImplementationsRequest): Promise<FindImplementationsResponse> {
    const startTime = Date.now();
    
    // Extract execution mode and pipeline stage from request
    const { executionMode, pipelineStage } = this.inferContextFromRequest(request);
    
    // Use pattern-aware indexer for fast lookup
    const results = await this.patternIndexer.findImplementationsFast({
      keywords: this.expandKeywords(request.keywords),
      returnType: request.returnType,
      executionMode,
      pipelineStage
    });
    
    // Convert to response format with scoring
    const scored = results.map(symbol => ({
      symbol,
      score: this.calculateRelevanceScore(symbol, request)
    })).sort((a, b) => b.score - a.score);
    
    // Separate exact and similar matches
    const exact_matches: ImplementationMatch[] = [];
    const similar_implementations: ImplementationMatch[] = [];
    
    for (const { symbol, score } of scored) {
      const match: ImplementationMatch = {
        module: symbol.parent_class || symbol.namespace || 'Global',
        method: symbol.name,
        signature: symbol.signature || '',
        location: `${symbol.file_path}:${symbol.line}`,
        description: this.buildDescription(symbol),
        score: score / 100, // Normalize to 0-1
        usage_count: await this.getUsageCount(symbol.id),
        complexity: await this.estimateComplexity(symbol),
        last_modified: 0 // Would need file stat
      };
      
      if (score >= 80) {
        exact_matches.push(match);
      } else if (score >= 50) {
        similar_implementations.push(match);
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`⚡ Query completed in ${elapsed}ms`);
    
    return { exact_matches, similar_implementations };
  }
  
  /**
   * Find GPU implementation for a given function
   */
  async findGpuImplementation(functionName: string): Promise<ImplementationMatch | null> {
    const gpuImpls = await this.patternIndexer.findGpuImplementations(functionName);
    
    if (gpuImpls.length === 0) return null;
    
    const best = gpuImpls[0];
    return {
      module: best.parent_class || best.namespace || 'Global',
      method: best.name,
      signature: best.signature || '',
      location: `${best.file_path}:${best.line}`,
      description: `GPU implementation of ${functionName}`
    };
  }
  
  /**
   * Find implementations by pattern (cached for speed)
   */
  async findByPattern(pattern: string): Promise<ImplementationMatch[]> {
    const results = await this.patternIndexer.findByPattern(pattern);
    
    return results.map(symbol => ({
      module: symbol.parent_class || symbol.namespace || 'Global',
      method: symbol.name,
      signature: symbol.signature || '',
      location: `${symbol.file_path}:${symbol.line}`,
      description: this.buildDescription(symbol)
    }));
  }
  
  /**
   * Semantic search with natural language understanding
   */
  async semanticSearch(query: string, context?: { filePath?: string, stage?: string }): Promise<FindImplementationsResponse> {
    // Extract intent from query
    const intent = this.analyzeQueryIntent(query);
    
    // Build structured request
    const request: FindImplementationsRequest = {
      functionality: query,
      keywords: intent.keywords,
      returnType: intent.inferredReturnType
    };
    
    // Add context filters
    const executionMode = intent.wantsGpu ? 'gpu' : undefined;
    const pipelineStage = context?.stage || intent.inferredStage;
    
    // Use fast implementation finder
    const results = await this.findImplementations(request);
    
    // Apply additional semantic filters if needed
    if (intent.constraints.length > 0) {
      results.exact_matches = this.applyConstraints(results.exact_matches, intent.constraints);
      results.similar_implementations = this.applyConstraints(results.similar_implementations, intent.constraints);
    }
    
    return results;
  }
  
  /**
   * Infer context from request
   */
  private inferContextFromRequest(request: FindImplementationsRequest): {
    executionMode?: string,
    pipelineStage?: string
  } {
    const keywords = request.keywords.join(' ').toLowerCase();
    
    let executionMode: string | undefined;
    if (keywords.includes('gpu')) executionMode = 'gpu';
    else if (keywords.includes('cpu')) executionMode = 'cpu';
    
    let pipelineStage: string | undefined;
    if (keywords.includes('heightmap') || keywords.includes('noise')) {
      pipelineStage = 'terrain_formation';
    } else if (keywords.includes('render')) {
      pipelineStage = 'rendering';
    }
    
    return { executionMode, pipelineStage };
  }
  
  /**
   * Expand keywords with synonyms and related terms
   */
  private expandKeywords(keywords: string[]): string[] {
    const expanded = [...keywords];
    
    const synonyms: Record<string, string[]> = {
      'generate': ['create', 'produce', 'build'],
      'heightmap': ['height', 'elevation', 'terrain'],
      'noise': ['perlin', 'simplex', 'fractal'],
      'gpu': ['vulkan', 'compute', 'shader'],
      'async': ['future', 'promise', 'concurrent']
    };
    
    for (const keyword of keywords) {
      const lower = keyword.toLowerCase();
      if (synonyms[lower]) {
        expanded.push(...synonyms[lower]);
      }
    }
    
    return [...new Set(expanded)];
  }
  
  /**
   * Calculate relevance score for a symbol
   */
  private calculateRelevanceScore(symbol: any, request: FindImplementationsRequest): number {
    let score = 0;
    
    // Keyword matching in semantic tags
    const tags = JSON.parse(symbol.semantic_tags || '[]');
    for (const keyword of request.keywords) {
      if (tags.includes(keyword.toLowerCase())) score += 20;
      if (symbol.name.toLowerCase().includes(keyword.toLowerCase())) score += 30;
    }
    
    // Return type match
    if (request.returnType) {
      if (symbol.return_type === request.returnType) score += 40;
      else if (symbol.returns_vector_float && request.returnType === 'std::vector<float>') score += 40;
    }
    
    // Boost for common patterns
    if (symbol.is_factory) score += 10;
    if (symbol.is_generator) score += 10;
    if (symbol.uses_gpu_compute) score += 5;
    
    return Math.min(score, 100);
  }
  
  /**
   * Build human-readable description
   */
  private buildDescription(symbol: any): string {
    const parts: string[] = [];
    
    if (symbol.execution_mode && symbol.execution_mode !== 'unknown') {
      parts.push(`[${symbol.execution_mode.toUpperCase()}]`);
    }
    
    if (symbol.is_async) parts.push('[ASYNC]');
    if (symbol.pipeline_stage && symbol.pipeline_stage !== 'unknown') {
      parts.push(`[${symbol.pipeline_stage}]`);
    }
    
    parts.push(symbol.signature || `${symbol.kind} ${symbol.name}`);
    
    return parts.join(' ');
  }
  
  /**
   * Get usage count (would need reference tracking)
   */
  private async getUsageCount(symbolId: number): Promise<number> {
    // Simplified - would need proper reference counting
    return Math.floor(Math.random() * 50);
  }
  
  /**
   * Estimate complexity
   */
  private async estimateComplexity(symbol: any): Promise<number> {
    // Simplified heuristic
    let complexity = 10;
    if (symbol.is_template) complexity += 5;
    if (symbol.uses_gpu_compute) complexity += 10;
    const tags = JSON.parse(symbol.semantic_tags || '[]');
    complexity += tags.length * 2;
    return complexity;
  }
  
  /**
   * Analyze natural language query
   */
  private analyzeQueryIntent(query: string): {
    keywords: string[],
    inferredReturnType?: string,
    inferredStage?: string,
    wantsGpu: boolean,
    constraints: string[]
  } {
    const lower = query.toLowerCase();
    const keywords: string[] = [];
    const constraints: string[] = [];
    
    // Extract keywords
    const actionWords = ['generate', 'create', 'calculate', 'compute', 'build', 'process'];
    const domainWords = ['heightmap', 'terrain', 'noise', 'mesh', 'texture', 'water'];
    
    for (const word of actionWords) {
      if (lower.includes(word)) keywords.push(word);
    }
    for (const word of domainWords) {
      if (lower.includes(word)) keywords.push(word);
    }
    
    // Infer return type
    let inferredReturnType: string | undefined;
    if (lower.includes('heightmap') || lower.includes('elevation')) {
      inferredReturnType = 'std::vector<float>';
    } else if (lower.includes('mesh')) {
      inferredReturnType = 'Mesh';
    }
    
    // Detect GPU preference
    const wantsGpu = lower.includes('gpu') || lower.includes('accelerat');
    
    // Extract constraints
    if (lower.includes('thread-safe') || lower.includes('concurrent')) {
      constraints.push('thread-safe');
    }
    if (lower.includes('no alloc') || lower.includes('stack')) {
      constraints.push('no-allocation');
    }
    
    return { keywords, inferredReturnType, wantsGpu, constraints };
  }
  
  /**
   * Apply constraints to results
   */
  private applyConstraints(matches: ImplementationMatch[], constraints: string[]): ImplementationMatch[] {
    // Simplified constraint checking
    return matches.filter(match => {
      for (const constraint of constraints) {
        if (constraint === 'thread-safe' && !match.description?.includes('mutex')) {
          return false;
        }
        if (constraint === 'no-allocation' && match.signature?.includes('new')) {
          return false;
        }
      }
      return true;
    });
  }
  
  /**
   * Build pattern index from fallback DB
   */
  private async buildFromFallback(): Promise<void> {
    if (!this.fallbackIndexer) return;
    
    console.log('📊 Building pattern-aware index from simple index...');
    
    // This would convert simple index data to pattern-aware format
    // For now, we'll skip the implementation
    console.log('⚠️  Fallback conversion not yet implemented');
  }
  
  close(): void {
    this.patternIndexer.close();
    this.enhancedDb.close();
  }
}