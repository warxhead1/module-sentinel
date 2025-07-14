import { ClangIntelligentIndexer } from '../indexing/clang-intelligent-indexer.js';
import { 
  FindImplementationsRequest,
  FindImplementationsResponse,
  ImplementationMatch
} from '../types/essential-features.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * High-level service that uses intelligent indexing for instant results
 */
export class IntelligentModuleService {
  private indexer: ClangIntelligentIndexer;
  private projectPath: string;
  
  constructor(projectPath: string, dbPath: string) {
    this.projectPath = projectPath;
    this.indexer = new ClangIntelligentIndexer(projectPath, dbPath);
  }
  
  async initialize(): Promise<void> {
    await this.indexer.loadCompilationDatabase();
    
    // Set up file watchers for incremental updates
    this.setupFileWatchers();
  }
  
  /**
   * Index C++ files in the project
   */
  async indexProject(patterns: string[] = ['**/*.cpp', '**/*.cxx', '**/*.cc', '**/*.ixx']): Promise<void> {
    console.log('🔍 Starting intelligent indexing of C++ files...');
    console.log(`📂 Project path: ${this.projectPath}`);
    
    const { glob } = await import('glob');
    const files: string[] = [];
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, { 
        cwd: this.projectPath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/build/**', '**/cmake-build-*/**', '**/third_party/**']
      });
      files.push(...matches);
    }
    
    console.log(`📁 Found ${files.length} C++ files to index`);
    
    // Check if database already has recent data
    const result = this.indexer.db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number } | undefined;
    const fileCount = result?.count || 0;
    if (fileCount > 0) {
      console.log(`Database already contains ${fileCount} symbols`);
      return;
    }
    
    // Index files in batches
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => 
        this.indexer.indexFile(file).catch(err => {
          console.error(` Failed to index ${file}:`, err.message);
        })
      ));
      console.log(`📊 Progress: ${Math.min(i + batchSize, files.length)}/${files.length} files indexed`);
    }
    
    const finalResult = this.indexer.db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number } | undefined;
    const finalCount = finalResult?.count || 0;
    console.log(`Indexing complete! Total symbols: ${finalCount}`);
  }
  
  /**
   * Find implementations - returns in milliseconds from index
   */
  async findImplementations(request: FindImplementationsRequest): Promise<FindImplementationsResponse> {
    const exact_matches: ImplementationMatch[] = [];
    const similar_implementations: ImplementationMatch[] = [];
    
    // Enhanced multi-keyword search with scoring
    const allSymbols = new Map<string, { symbol: any, score: number }>();
    
    // Search for each keyword and accumulate results
    for (const keyword of request.keywords) {
      const symbols = await this.indexer.db.prepare(`
        SELECT s.*, 
               CASE 
                 WHEN LOWER(s.name) = LOWER(?) THEN 100
                 WHEN LOWER(s.name) LIKE LOWER(?) THEN 80
                 WHEN LOWER(s.name) LIKE LOWER(?) THEN 60
                 WHEN LOWER(s.signature) LIKE LOWER(?) THEN 40
                 ELSE 20
               END as match_score
        FROM symbols s
        WHERE (LOWER(s.name) LIKE LOWER(?) 
               OR LOWER(s.signature) LIKE LOWER(?)
               OR LOWER(s.parent_symbol) LIKE LOWER(?))
        AND s.kind IN ('function', 'method')
        ORDER BY match_score DESC, s.is_definition DESC
      `).all(
        keyword,                    // exact match
        keyword,                    // starts with
        `%${keyword}%`,            // contains
        `%${keyword}%`,            // in signature
        `%${keyword}%`,            // in name
        `%${keyword}%`,            // in signature
        `%${keyword}%`             // in parent
      );
      
      // Accumulate scores for symbols
      for (const symbol of symbols as any[]) {
        const key = symbol.usr || `${symbol.file_path}:${symbol.line}`;
        const existing = allSymbols.get(key);
        if (existing) {
          existing.score += symbol.match_score;
        } else {
          allSymbols.set(key, { symbol, score: symbol.match_score });
        }
      }
    }
    
    // Sort by total score
    const sortedSymbols = Array.from(allSymbols.values())
      .sort((a, b) => b.score - a.score);
    
    // Apply filters and categorize
    for (const { symbol, score } of sortedSymbols) {
      // Check return type if specified
      if (request.returnType && !this.matchesReturnType(symbol.return_type, request.returnType)) {
        continue;
      }
      
      // Get additional context
      const context = await this.getSymbolEnhancedContext(symbol);
      
      const match: ImplementationMatch = {
        module: symbol.parent_symbol || 'Global',
        method: symbol.name,
        signature: symbol.signature || '',
        location: `${symbol.file_path}:${symbol.line}`,
        description: `${symbol.visibility} ${symbol.signature}`,
        score: score / (request.keywords.length * 100), // Normalize score
        usage_count: context.usageCount,
        complexity: context.complexity,
        last_modified: context.lastModified
      };
      
      // Determine if exact match based on score threshold
      const isExact = score >= (request.keywords.length * 60); // 60% match per keyword
      
      if (isExact && symbol.is_definition) {
        exact_matches.push(match);
      } else {
        similar_implementations.push(match);
      }
    }
    
    // Limit results for performance
    return { 
      exact_matches: exact_matches.slice(0, 20),
      similar_implementations: similar_implementations.slice(0, 30)
    };
  }
  
  /**
   * Enhanced return type matching with C++ semantics
   */
  private matchesReturnType(actualType: string | null, requestedType: string): boolean {
    if (!actualType) return false;
    
    // Normalize types for comparison
    const normalize = (type: string) => type
      .replace(/\s+/g, ' ')
      .replace(/std::/g, '')
      .replace(/const\s+/g, '')
      .replace(/\s*&/g, '&')
      .replace(/\s*\*/g, '*')
      .trim();
    
    const normalized = normalize(actualType);
    const requested = normalize(requestedType);
    
    // Exact match
    if (normalized === requested) return true;
    
    // Check if it's a container of the requested type
    if (normalized.includes(`<${requested}>`) || 
        normalized.includes(`<${requested},`)) {
      return true;
    }
    
    // Check for typedef/using aliases
    // This would need more sophisticated type resolution
    
    return false;
  }
  
  /**
   * Get enhanced context for a symbol including usage patterns
   */
  private async getSymbolEnhancedContext(symbol: any): Promise<any> {
    // Count references
    const usageResult = this.indexer.db.prepare(`
      SELECT COUNT(*) as count FROM "references" WHERE to_symbol = ?
    `).get(symbol.usr) as { count: number } | undefined;
    const usageCount = usageResult?.count || 0;
    
    // Calculate complexity based on method size
    const complexity = await this.calculateComplexity(symbol);
    
    // Get last modification time from file
    let lastModified = 0;
    try {
      const stats = await fs.stat(symbol.file_path);
      lastModified = stats.mtime.getTime();
    } catch (e) {
      // File might not exist
    }
    
    return { usageCount, complexity, lastModified };
  }
  
  /**
   * Calculate method complexity heuristically
   */
  private async calculateComplexity(symbol: any): Promise<number> {
    if (!symbol.is_definition) return 0;
    
    // Get all symbols defined within this function
    const innerSymbols = this.indexer.db.prepare(`
      SELECT COUNT(*) as count FROM symbols 
      WHERE file_path = ? AND line > ? AND line < ?
      AND kind IN ('variable', 'call')
    `).get(
      symbol.file_path,
      symbol.line,
      symbol.line + 200 // Assume max 200 lines per function
    ) as { count: number } | undefined;
    
    return innerSymbols?.count || 0;
  }
  
  /**
   * Get semantic understanding of a symbol with enhanced context
   */
  async getSymbolContext(symbolName: string, contextPath?: string): Promise<SymbolContext> {
    // Enhanced symbol search with context awareness
    let symbols = await this.findSymbolWithContext(symbolName, contextPath);
    
    if (symbols.length === 0) {
      throw new Error(`Symbol ${symbolName} not found`);
    }
    
    // Pick the most relevant symbol based on context
    const symbol = await this.selectBestSymbol(symbols, contextPath);
    
    // Get all references to understand usage
    const references = await this.indexer.findReferences(symbol.usr!);
    
    // Get call graph to understand relationships
    const callGraph = await this.indexer.getCallGraph(symbol.usr!);
    
    // Get inheritance hierarchy if it's a class
    const hierarchy = symbol.kind === 'class' 
      ? await this.indexer.getClassHierarchy(symbol.usr!)
      : [];
    
    // Analyze semantic patterns
    const semanticInfo = await this.analyzeSemanticPatterns(symbol, references);
    
    // Get related symbols (methods in same class, related functions)
    const relatedSymbols = await this.findRelatedSymbols(symbol);
    
    return {
      symbol,
      references,
      callGraph,
      hierarchy,
      usageCount: references.length,
      isVirtual: callGraph.some(c => c.isVirtualCall),
      dependencies: this.extractDependencies(references),
      semanticInfo,
      relatedSymbols,
      usagePatterns: await this.analyzeUsagePatterns(references),
      commonCombinations: await this.findCommonCombinations(symbol)
    };
  }
  
  /**
   * Find symbol with context awareness
   */
  private async findSymbolWithContext(name: string, contextPath?: string): Promise<any[]> {
    // First try exact match
    let symbols = await this.indexer.db.prepare(`
      SELECT s.*, 
             CASE 
               WHEN s.file_path = ? THEN 1000
               WHEN s.file_path LIKE ? THEN 500
               WHEN s.file_path LIKE ? THEN 200
               ELSE 0
             END as context_score
      FROM symbols s
      WHERE s.name = ? OR s.name LIKE ?
      ORDER BY context_score DESC, s.is_definition DESC
    `).all(
      contextPath || '',
      contextPath ? `${path.dirname(contextPath)}%` : '%',
      contextPath ? `${path.dirname(path.dirname(contextPath))}%` : '%',
      name,
      `%::${name}`
    );
    
    // If no exact match, try fuzzy search
    if (symbols.length === 0) {
      symbols = await this.indexer.db.prepare(`
        SELECT s.* FROM symbols s
        WHERE LOWER(s.name) LIKE LOWER(?)
        ORDER BY LENGTH(s.name), s.is_definition DESC
        LIMIT 10
      `).all(`%${name}%`);
    }
    
    return symbols;
  }
  
  /**
   * Select the most contextually relevant symbol
   */
  private async selectBestSymbol(symbols: any[], contextPath?: string): Promise<any> {
    if (symbols.length === 1) return symbols[0];
    
    // Score each symbol based on various factors
    const scored = await Promise.all(symbols.map(async symbol => {
      let score = 0;
      
      // Prefer definitions over declarations
      if (symbol.is_definition) score += 100;
      
      // Prefer symbols in the same file or nearby files
      if (contextPath) {
        if (symbol.file_path === contextPath) score += 500;
        else if (path.dirname(symbol.file_path) === path.dirname(contextPath)) score += 200;
      }
      
      // Prefer frequently used symbols
      const usageResult = this.indexer.db.prepare(
        'SELECT COUNT(*) as count FROM "references" WHERE to_symbol = ?'
      ).get(symbol.usr) as { count: number } | undefined;
      const usageCount = usageResult?.count || 0;
      score += Math.min(usageCount * 10, 200);
      
      // Prefer public symbols
      if (symbol.visibility === 'public') score += 50;
      
      return { symbol, score };
    }));
    
    // Return highest scoring symbol
    scored.sort((a, b) => b.score - a.score);
    return scored[0].symbol;
  }
  
  /**
   * Analyze semantic patterns in symbol usage
   */
  private async analyzeSemanticPatterns(symbol: any, references: any[]): Promise<any> {
    const patterns = {
      isFactory: false,
      isBuilder: false,
      isSingleton: false,
      isUtility: false,
      isDataStructure: false,
      isAlgorithm: false,
      isInterface: false,
      role: 'unknown'
    };
    
    const name = symbol.name.toLowerCase();
    const signature = (symbol.signature || '').toLowerCase();
    
    // Pattern detection based on naming conventions
    if (name.includes('create') || name.includes('make') || name.includes('factory')) {
      patterns.isFactory = true;
      patterns.role = 'factory';
    } else if (name.includes('build')) {
      patterns.isBuilder = true;
      patterns.role = 'builder';
    } else if (name.includes('getinstance') || name.includes('singleton')) {
      patterns.isSingleton = true;
      patterns.role = 'singleton';
    } else if (symbol.kind === 'class' && symbol.name.startsWith('I') && /^I[A-Z]/.test(symbol.name)) {
      patterns.isInterface = true;
      patterns.role = 'interface';
    } else if (name.includes('util') || name.includes('helper')) {
      patterns.isUtility = true;
      patterns.role = 'utility';
    } else if (name.includes('sort') || name.includes('search') || name.includes('find')) {
      patterns.isAlgorithm = true;
      patterns.role = 'algorithm';
    } else if (name.includes('list') || name.includes('map') || name.includes('vector') || 
               name.includes('queue') || name.includes('stack')) {
      patterns.isDataStructure = true;
      patterns.role = 'data_structure';
    }
    
    // Analyze return type patterns
    if (symbol.return_type) {
      if (symbol.return_type.includes('unique_ptr') || symbol.return_type.includes('shared_ptr')) {
        patterns.isFactory = true;
      }
    }
    
    return patterns;
  }
  
  /**
   * Find symbols commonly used together
   */
  private async findCommonCombinations(symbol: any): Promise<string[]> {
    // Find files where this symbol is used
    const usageFiles = await this.indexer.db.prepare(`
      SELECT DISTINCT file_path FROM "references" WHERE to_symbol = ?
    `).all(symbol.usr);
    
    if (usageFiles.length === 0) return [];
    
    // Find other symbols frequently used in the same files
    const commonSymbols = await this.indexer.db.prepare(`
      SELECT s.name, COUNT(DISTINCT r.file_path) as co_occurrence_count
      FROM "references" r
      JOIN symbols s ON r.to_symbol = s.usr
      WHERE r.file_path IN (${usageFiles.map(() => '?').join(',')})
      AND s.usr != ?
      AND s.kind IN ('function', 'method', 'class')
      GROUP BY s.usr
      HAVING co_occurrence_count > 1
      ORDER BY co_occurrence_count DESC
      LIMIT 10
    `).all(...usageFiles.map((f: any) => f.file_path), symbol.usr);
    
    return commonSymbols.map((s: any) => s.name);
  }
  
  /**
   * Analyze how a symbol is typically used
   */
  private async analyzeUsagePatterns(references: any[]): Promise<any> {
    const patterns = {
      totalUsages: references.length,
      usageByFile: new Map<string, number>(),
      usageByKind: new Map<string, number>(),
      mostCommonContext: '',
      isFrequentlyUsed: false,
      isTestCode: false,
      isExampleCode: false
    };
    
    // Count usage by file and detect patterns
    for (const ref of references) {
      // Count by file
      const count = patterns.usageByFile.get(ref.filePath) || 0;
      patterns.usageByFile.set(ref.filePath, count + 1);
      
      // Count by kind
      const kindCount = patterns.usageByKind.get(ref.kind) || 0;
      patterns.usageByKind.set(ref.kind, kindCount + 1);
      
      // Detect test/example code
      if (ref.filePath.includes('test') || ref.filePath.includes('Test')) {
        patterns.isTestCode = true;
      }
      if (ref.filePath.includes('example') || ref.filePath.includes('Example')) {
        patterns.isExampleCode = true;
      }
    }
    
    patterns.isFrequentlyUsed = references.length > 10;
    
    return patterns;
  }
  
  /**
   * Find related symbols (e.g., other methods in the same class)
   */
  private async findRelatedSymbols(symbol: any): Promise<any[]> {
    if (!symbol.parent_symbol) return [];
    
    return this.indexer.db.prepare(`
      SELECT name, kind, signature, visibility
      FROM symbols
      WHERE parent_symbol = ? AND usr != ?
      AND kind IN ('method', 'function')
      ORDER BY name
      LIMIT 20
    `).all(symbol.parent_symbol, symbol.usr);
  }
  
  /**
   * Enhanced find implementations with stage-aware filtering
   */
  async findImplementationsWithStage(request: FindImplementationsRequest & { stage?: string }): Promise<FindImplementationsResponse> {
    // Get base results
    const baseResults = await this.findImplementations(request);
    
    // If no stage specified, return base results
    if (!request.stage) return baseResults;
    
    // Apply stage filtering
    const stageFilteredExact = await this.filterByStage(baseResults.exact_matches, request.stage);
    const stageFilteredSimilar = await this.filterByStage(baseResults.similar_implementations, request.stage);
    
    return {
      exact_matches: stageFilteredExact,
      similar_implementations: stageFilteredSimilar
    };
  }
  
  /**
   * Filter implementations by pipeline stage
   */
  private async filterByStage(matches: ImplementationMatch[], stage: string): Promise<ImplementationMatch[]> {
    const stagePatterns: Record<string, { include: string[], exclude: string[] }> = {
      terrain_formation: {
        include: ['Generation', 'Terrain', 'Heightmap', 'Noise', 'Math'],
        exclude: ['Rendering', 'GUI', 'Network']
      },
      feature_placement: {
        include: ['Features', 'Placement', 'Distribution', 'Biome'],
        exclude: ['Rendering', 'GUI']
      },
      rendering: {
        include: ['Rendering', 'Vulkan', 'Pipeline', 'Shader', 'GPU'],
        exclude: ['Generation', 'Network']
      },
      gui: {
        include: ['GUI', 'UI', 'Widget', 'View'],
        exclude: ['Generation', 'Rendering/Vulkan']
      },
      orchestration: {
        include: ['Orchestrat', 'Manager', 'Controller', 'System'],
        exclude: []
      }
    };
    
    const patterns = stagePatterns[stage] || { include: [], exclude: [] };
    
    return matches.filter(match => {
      const filePath = match.location.split(':')[0];
      
      // Check include patterns
      const includesMatch = patterns.include.length === 0 || 
        patterns.include.some(pattern => filePath.includes(pattern));
      
      // Check exclude patterns
      const excludesMatch = patterns.exclude.some(pattern => filePath.includes(pattern));
      
      return includesMatch && !excludesMatch;
    });
  }
  
  /**
   * Find implementations with semantic understanding
   */
  async findSemanticImplementations(request: {
    intent: string;
    context?: string;
    constraints?: string[];
  }): Promise<FindImplementationsResponse> {
    // Parse intent to extract keywords
    const keywords = this.extractSemanticKeywords(request.intent);
    
    // Infer return type from intent
    const returnType = this.inferReturnType(request.intent);
    
    // Find implementations
    const results = await this.findImplementations({
      functionality: request.intent,
      keywords,
      returnType
    });
    
    // Apply semantic filtering based on constraints
    if (request.constraints && request.constraints.length > 0) {
      results.exact_matches = await this.applySemanticConstraints(
        results.exact_matches, 
        request.constraints
      );
      results.similar_implementations = await this.applySemanticConstraints(
        results.similar_implementations,
        request.constraints
      );
    }
    
    return results;
  }
  
  /**
   * Extract keywords from natural language intent
   */
  private extractSemanticKeywords(intent: string): string[] {
    const keywords: string[] = [];
    
    // Common programming action words
    const actionWords = ['generate', 'create', 'build', 'calculate', 'compute', 
                        'render', 'draw', 'update', 'process', 'handle', 'manage',
                        'get', 'set', 'find', 'search', 'load', 'save'];
    
    // Domain-specific words
    const domainWords = ['terrain', 'heightmap', 'noise', 'mesh', 'texture',
                        'vertex', 'fragment', 'shader', 'pipeline', 'buffer',
                        'gpu', 'cpu', 'vulkan', 'opengl'];
    
    const words = intent.toLowerCase().split(/\s+/);
    
    // Extract action words
    for (const word of words) {
      if (actionWords.some(action => word.includes(action))) {
        keywords.push(word);
      }
      if (domainWords.some(domain => word.includes(domain))) {
        keywords.push(word);
      }
    }
    
    // Extract camelCase/PascalCase words
    const camelCaseWords = intent.match(/[A-Z][a-z]+|[a-z]+/g) || [];
    keywords.push(...camelCaseWords.map(w => w.toLowerCase()));
    
    // Remove duplicates
    return [...new Set(keywords)];
  }
  
  /**
   * Infer return type from intent
   */
  private inferReturnType(intent: string): string | undefined {
    const typePatterns = [
      { pattern: /vector|array|list/i, type: 'std::vector' },
      { pattern: /float\s*array|height\s*data/i, type: 'std::vector<float>' },
      { pattern: /mesh|geometry/i, type: 'Mesh' },
      { pattern: /texture/i, type: 'Texture' },
      { pattern: /bool|boolean|check|is|has/i, type: 'bool' },
      { pattern: /count|number|size/i, type: 'int' },
      { pattern: /position|point|coordinate/i, type: 'Vector3' }
    ];
    
    for (const { pattern, type } of typePatterns) {
      if (pattern.test(intent)) {
        return type;
      }
    }
    
    return undefined;
  }
  
  /**
   * Apply semantic constraints to filter results
   */
  private async applySemanticConstraints(
    matches: ImplementationMatch[], 
    constraints: string[]
  ): Promise<ImplementationMatch[]> {
    const filtered: ImplementationMatch[] = [];
    
    for (const match of matches) {
      let satisfiesConstraints = true;
      
      for (const constraint of constraints) {
        if (constraint.includes('thread-safe')) {
          // Check if method uses synchronization
          const hasSynchronization = match.signature.includes('mutex') ||
                                   match.signature.includes('atomic') ||
                                   match.description?.includes('thread');
          if (!hasSynchronization) {
            satisfiesConstraints = false;
            break;
          }
        }
        
        if (constraint.includes('gpu')) {
          // Check if it's GPU-related
          const isGPU = match.location.includes('GPU') ||
                       match.location.includes('Vulkan') ||
                       match.location.includes('Compute');
          if (!isGPU) {
            satisfiesConstraints = false;
            break;
          }
        }
        
        if (constraint.includes('no-allocation')) {
          // Check signature doesn't return heap-allocated objects
          const hasAllocation = match.signature.includes('new') ||
                              match.signature.includes('make_unique') ||
                              match.signature.includes('make_shared');
          if (hasAllocation) {
            satisfiesConstraints = false;
            break;
          }
        }
      }
      
      if (satisfiesConstraints) {
        filtered.push(match);
      }
    }
    
    return filtered;
  }
  
  /**
   * Intelligent code completion
   */
  async getCompletions(filePath: string, line: number, column: number): Promise<Completion[]> {
    // This would integrate with clangd for real-time completions
    // For now, we can provide context-aware suggestions from our index
    
    const completions: Completion[] = [];
    
    // Get symbols in current file
    const fileSymbols = await this.indexer.db.prepare(`
      SELECT * FROM symbols 
      WHERE file_path = ? AND line < ?
      ORDER BY line DESC
      LIMIT 20
    `).all(filePath, line);
    
    // Get frequently used symbols in this context
    const contextSymbols = await this.getContextualSymbols(filePath);
    
    return completions;
  }
  
  /**
   * Find code smells and anti-patterns
   */
  async findAntiPatterns(): Promise<AntiPattern[]> {
    const antiPatterns: AntiPattern[] = [];
    
    // Find functions that are too long
    const longFunctions = await this.indexer.db.prepare(`
      SELECT s1.*, 
             (SELECT line FROM symbols s2 
              WHERE s2.file_path = s1.file_path 
              AND s2.line > s1.line 
              ORDER BY s2.line 
              LIMIT 1) - s1.line as length
      FROM symbols s1
      WHERE s1.kind = 'function' AND s1.is_definition = 1
      HAVING length > 100
    `).all();
    
    for (const func of longFunctions as any[]) {
      antiPatterns.push({
        type: 'long-function',
        location: `${func.file_path}:${func.line}`,
        message: `Function ${func.name} is ${func.length} lines long`,
        severity: func.length > 200 ? 'high' : 'medium'
      });
    }
    
    // Find circular dependencies
    const circularDeps = await this.findCircularDependencies();
    
    // Find unused symbols
    const unusedSymbols = await this.indexer.db.prepare(`
      SELECT * FROM symbols s
      WHERE s.is_definition = 1
      AND NOT EXISTS (
        SELECT 1 FROM "references" r 
        WHERE r.to_symbol = s.usr
      )
      AND s.visibility = 'public'
    `).all();
    
    return antiPatterns;
  }
  
  private extractDependencies(references: any[]): string[] {
    const deps = new Set<string>();
    references.forEach(ref => {
      deps.add(ref.filePath);
    });
    return Array.from(deps);
  }
  
  private async findCircularDependencies(): Promise<string[][]> {
    // Build include graph and find cycles
    const includes = await this.indexer.db.prepare(`
      SELECT file_path, included_path FROM includes
    `).all();
    
    // Use DFS to find cycles
    const cycles: string[][] = [];
    // ... cycle detection logic
    
    return cycles;
  }
  
  private async getContextualSymbols(filePath: string): Promise<any[]> {
    // Get symbols that are frequently used together
    return this.indexer.db.prepare(`
      SELECT s.*, COUNT(*) as usage_count
      FROM symbols s
      JOIN "references" r ON s.usr = r.to_symbol
      WHERE r.file_path = ?
      GROUP BY s.usr
      ORDER BY usage_count DESC
      LIMIT 20
    `).all(filePath);
  }
  
  private setupFileWatchers(): void {
    // Set up file system watchers for incremental updates
    // This would use chokidar or similar
    
    // On file change:
    // 1. Check if it's a source file
    // 2. Run incremental indexing
    // 3. Update dependent files
  }
  
  /**
   * Get instant architectural insights
   */
  async getArchitecturalInsights(): Promise<ArchitecturalInsights> {
    // Layering violations
    const layeringViolations = await this.indexer.db.prepare(`
      SELECT i1.file_path, i1.included_path
      FROM includes i1
      WHERE 
        i1.file_path LIKE '%/ui/%' AND i1.included_path LIKE '%/database/%'
        OR i1.file_path LIKE '%/database/%' AND i1.included_path LIKE '%/ui/%'
    `).all();
    
    // God classes (too many methods)
    const godClasses = await this.indexer.db.prepare(`
      SELECT parent_symbol, COUNT(*) as method_count
      FROM symbols
      WHERE kind = 'method' AND parent_symbol IS NOT NULL
      GROUP BY parent_symbol
      HAVING method_count > 50
    `).all();
    
    // Interface segregation violations
    const fatInterfaces = await this.indexer.db.prepare(`
      SELECT s.name, COUNT(*) as method_count
      FROM symbols s
      WHERE s.kind = 'class' 
      AND s.name LIKE 'I%'
      AND EXISTS (
        SELECT 1 FROM symbols s2 
        WHERE s2.parent_symbol = s.name 
        AND s2.kind = 'method'
      )
      GROUP BY s.name
      HAVING method_count > 10
    `).all();
    
    return {
      layeringViolations,
      godClasses,
      fatInterfaces,
      metrics: {
        totalSymbols: await this.getTotalSymbols(),
        averageMethodsPerClass: await this.getAverageMethodsPerClass(),
        mostUsedSymbols: await this.getMostUsedSymbols()
      }
    };
  }
  
  private async getTotalSymbols(): Promise<number> {
    const result = this.indexer.db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number } | undefined;
    return result?.count || 0;
  }
  
  private async getAverageMethodsPerClass(): Promise<number> {
    const result = this.indexer.db.prepare(`
      SELECT AVG(method_count) as avg FROM (
        SELECT COUNT(*) as method_count
        FROM symbols
        WHERE kind = 'method'
        GROUP BY parent_symbol
      )
    `).get() as { avg: number } | undefined;
    return result?.avg || 0;
  }
  
  private async getMostUsedSymbols(): Promise<any[]> {
    return this.indexer.db.prepare(`
      SELECT s.name, s.kind, COUNT(r.to_symbol) as usage_count
      FROM symbols s
      JOIN "references" r ON s.usr = r.to_symbol
      GROUP BY s.usr
      ORDER BY usage_count DESC
      LIMIT 10
    `).all();
  }
}

// Type definitions
interface SymbolContext {
  symbol: any;
  references: any[];
  callGraph: any[];
  hierarchy: any[];
  usageCount: number;
  isVirtual: boolean;
  dependencies: string[];
  semanticInfo?: any;
  relatedSymbols?: any[];
  usagePatterns?: any;
  commonCombinations?: any[];
}

interface Completion {
  label: string;
  kind: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

interface AntiPattern {
  type: string;
  location: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

interface ArchitecturalInsights {
  layeringViolations: any[];
  godClasses: any[];
  fatInterfaces: any[];
  metrics: {
    totalSymbols: number;
    averageMethodsPerClass: number;
    mostUsedSymbols: any[];
  };
}

// Usage for agents:
/*
const service = new IntelligentModuleService('/project', '.index.db');
await service.initialize();

// Instant results - no file reading!
const impls = await service.findImplementations({
  functionality: 'heightmap generation',
  keywords: ['generate', 'heightmap'],
  returnType: 'std::vector<float>'
});

// Rich context for understanding
const context = await service.getSymbolContext('GPUModularHeightmapGenerator');
console.log(`Used ${context.usageCount} times`);
console.log(`Dependencies: ${context.dependencies.join(', ')}`);

// Find problems
const antiPatterns = await service.findAntiPatterns();
const insights = await service.getArchitecturalInsights();
*/