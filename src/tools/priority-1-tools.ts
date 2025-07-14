import { UnifiedIndexer } from '../services/unified-indexer.js';
import {
  FindImplementationsRequest,
  FindImplementationsResponse,
  DependencyPathRequest,
  DependencyPathResponse,
  SimilarCodeRequest,
  SimilarCodeResponse,
  ImplementationMatch,
  SimilarCodeMatch,
  CrossFileDependencyRequest,
  CrossFileDependencyResponse,
  CrossFileUsage,
  FileDependency,
  DownstreamImpact
} from '../types/essential-features.js';
import Database from 'better-sqlite3';
import * as path from 'path';

export class Priority1Tools {
  private indexer: UnifiedIndexer;
  private db: Database.Database;

  constructor(dbPathOrDatabase: string | Database.Database, projectPath: string = '/home/warxh/planet_procgen') {
    if (typeof dbPathOrDatabase === 'string') {
      // Legacy mode: create our own database connection
      this.db = new Database(dbPathOrDatabase);
      this.indexer = new UnifiedIndexer(projectPath, dbPathOrDatabase);
    } else {
      // New mode: use existing database
      this.db = dbPathOrDatabase;
      this.indexer = new UnifiedIndexer(projectPath, this.db.name || 'unknown');
    }
  }

  /**
   * Find existing implementations of functionality
   */
  async findImplementations(request: FindImplementationsRequest): Promise<FindImplementationsResponse> {
    const exact_matches: ImplementationMatch[] = [];
    const similar_implementations: ImplementationMatch[] = [];

    // Search for methods matching the criteria using unified indexer
    const methods = await this.indexer.findImplementations(
      request.functionality,
      request.keywords,
      request.returnType
    );

    // Categorize matches by relevance
    for (const method of methods) {
      // UnifiedIndexer returns enhanced format with both schemas
      const methodName = method.name;
      const className = method.parent_class || method.className;
      const returnType = method.return_type || method.returnType;
      const parameters = method.parameters || [];
      
      const match: ImplementationMatch = {
        module: className || 'Global',
        method: methodName,
        signature: method.signature || `${returnType || 'void'} ${methodName}(...)`,
        location: `${method.file_path}:${method.line}`,
        description: this.generateMethodDescription(method),
        score: method.score // From pattern-aware scoring
      };

      // Check if it's an exact match
      const isExact = request.keywords.every(keyword => 
        methodName.toLowerCase().includes(keyword.toLowerCase())
      );

      if (isExact && (!request.returnType || returnType.includes(request.returnType))) {
        exact_matches.push(match);
      } else {
        match.similarity = this.calculateMethodSimilarity(method, request);
        similar_implementations.push(match);
      }
    }

    // Sort similar implementations by similarity score
    similar_implementations.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    return {
      exact_matches: exact_matches.slice(0, 5),
      similar_implementations: similar_implementations.slice(0, 10)
    };
  }

  /**
   * Find the dependency path between modules
   */
  async findDependencyPath(request: DependencyPathRequest): Promise<DependencyPathResponse> {
    // Build dependency graph
    const graph = await this.buildDependencyGraph();
    
    // Find shortest path using BFS
    const path = this.findShortestPath(graph, request.from, request.to);
    
    if (!path || path.length === 0) {
      return {
        recommended_path: [],
        interfaces_needed: [],
        example_usage: 'No direct path found. Consider creating an interface or adapter.'
      };
    }

    // Identify interfaces along the path
    const interfaces = await this.identifyRequiredInterfaces(path);
    
    // Find example usage
    const example = await this.findBestExample(path);

    return {
      recommended_path: path,
      interfaces_needed: interfaces,
      example_usage: example
    };
  }

  /**
   * Find similar code patterns
   */
  async findSimilarCode(request: SimilarCodeRequest): Promise<SimilarCodeResponse> {
    const patterns = await this.indexer.findSimilarPatterns(
      request.pattern,
      request.threshold
    );

    const similar_patterns: SimilarCodeMatch[] = patterns.map(pattern => ({
      location: pattern.locations[0], // Take first occurrence
      pattern: this.describePattern(pattern),
      suggestion: this.generateSuggestion(pattern, request.context)
    }));

    return { similar_patterns };
  }

  // Helper methods

  private generateMethodDescription(method: any): string {
    // Handle unified format from UnifiedIndexer
    const returnType = method.return_type || method.returnType || 'void';
    const methodName = method.name;
    const className = method.parent_class || method.className;
    const signature = method.signature;
    
    // If we have a full signature, use it
    if (signature && signature !== `${methodName}(...)`) {
      return signature;
    }
    
    // Build description from available data
    const classPrefix = className ? `${className}::` : '';
    const semanticTags = method.semantic_tags ? JSON.parse(method.semantic_tags) : [];
    const tagSuffix = semanticTags.length > 0 ? ` [${semanticTags.join(', ')}]` : '';
    
    return `${returnType} ${classPrefix}${methodName}(...)${tagSuffix}`;
  }

  private calculateMethodSimilarity(method: any, request: FindImplementationsRequest): number {
    // Use existing score from pattern-aware indexer if available
    if (method.score !== undefined) {
      return method.score;
    }
    
    let similarity = 0;
    const methodName = method.name;
    const returnType = method.return_type || method.returnType;

    // Name similarity
    const nameSimilarity = request.keywords.filter(k => 
      methodName.toLowerCase().includes(k.toLowerCase())
    ).length / request.keywords.length;
    similarity += nameSimilarity * 0.5;

    // Return type similarity
    if (request.returnType && returnType && returnType.includes(request.returnType)) {
      similarity += 0.3;
    }

    // Semantic tags similarity
    if (method.semantic_tags) {
      const tags = JSON.parse(method.semantic_tags);
      const tagMatches = request.keywords.filter(k => 
        tags.some((tag: string) => tag.toLowerCase().includes(k.toLowerCase()))
      ).length;
      similarity += (tagMatches / request.keywords.length) * 0.2;
    }

    return Math.min(similarity, 1.0);
  }

  private async buildDependencyGraph(): Promise<Map<string, Set<string>>> {
    const graph = new Map<string, Set<string>>();

    // Query all module dependencies by joining with enhanced_symbols
    const dependencies = this.db.prepare(`
      SELECT from_symbols.file_path as from_module, to_symbols.file_path as to_module 
      FROM symbol_relationships sr
      LEFT JOIN enhanced_symbols from_symbols ON sr.from_symbol_id = from_symbols.id
      LEFT JOIN enhanced_symbols to_symbols ON sr.to_symbol_id = to_symbols.id
      WHERE sr.relationship_type IN ('uses', 'calls', 'inherits', 'implements')
        AND from_symbols.file_path IS NOT NULL
        AND to_symbols.file_path IS NOT NULL
      GROUP BY from_symbols.file_path, to_symbols.file_path
    `).all() as Array<{ from_module: string; to_module: string }>;

    for (const dep of dependencies) {
      if (!graph.has(dep.from_module)) {
        graph.set(dep.from_module, new Set());
      }
      graph.get(dep.from_module)!.add(dep.to_module);
    }

    return graph;
  }

  private findShortestPath(
    graph: Map<string, Set<string>>, 
    from: string, 
    to: string
  ): string[] {
    const queue: string[][] = [[from]];
    const visited = new Set<string>([from]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (current === to) {
        return path;
      }

      const neighbors = graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return [];
  }

  private async identifyRequiredInterfaces(path: string[]): Promise<string[]> {
    const interfaces = new Set<string>();

    // For each step in the path, check what interfaces are needed
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      const relationships = this.db.prepare(`
        SELECT DISTINCT to_symbols.name as to_symbol 
        FROM symbol_relationships sr
        LEFT JOIN enhanced_symbols from_symbols ON sr.from_symbol_id = from_symbols.id
        LEFT JOIN enhanced_symbols to_symbols ON sr.to_symbol_id = to_symbols.id
        WHERE from_symbols.file_path = ? AND to_symbols.file_path = ? AND sr.relationship_type = 'implements'
      `).all(from, to) as Array<{ to_symbol: string }>;

      relationships.forEach(rel => interfaces.add(rel.to_symbol));
    }

    return Array.from(interfaces);
  }

  private async findBestExample(path: string[]): Promise<string> {
    // Find usage examples for the modules in the path
    const examples = this.db.prepare(`
      SELECT example_code, context 
      FROM usage_examples 
      WHERE module_path IN (${path.map(() => '?').join(',')})
      LIMIT 1
    `).get(...path) as { example_code: string; context: string } | undefined;

    if (examples) {
      return `${examples.context}\n\nCode:\n${examples.example_code}`;
    }

    return `See ${path[0]} for integration pattern`;
  }

  private describePattern(pattern: any): string {
    switch (pattern.category) {
      case 'loop':
        return '2D loop for grid processing';
      case 'conditional':
        return 'Conditional logic pattern';
      case 'initialization':
        return 'Object initialization pattern';
      default:
        return pattern.pattern;
    }
  }

  private generateSuggestion(pattern: any, context: string): string {
    const frequency = pattern.frequency;
    
    if (frequency > 5) {
      return `This pattern appears ${frequency} times. Consider extracting to a utility function.`;
    }

    if (pattern.category === 'loop' && context.includes('noise')) {
      return 'Use existing BatchNoiseGenerator::SampleGrid() for better performance';
    }

    return `Pattern found in ${pattern.locations.length} locations. Consider reusing existing implementation.`;
  }

  /**
   * Analyze cross-file dependencies and usage patterns
   * 
   * WHEN TO USE:
   * - Understanding downstream impact before modifying a function/class
   * - Finding all files that depend on a specific symbol
   * - Analyzing file-to-file dependency relationships  
   * - Impact analysis for refactoring or bug fixes
   * 
   * WHAT DATA TO EXPECT:
   * - Exact usage locations with line numbers and source code
   * - Cross-file call patterns (qualified vs simple calls)
   * - File dependency maps showing which files depend on which
   * - Downstream impact analysis for change planning
   */
  async analyzeCrossFileDependencies(request: CrossFileDependencyRequest): Promise<CrossFileDependencyResponse> {
    const { symbolName, filePath, analysisType, includeUsageDetails = true } = request;
    
    let response: CrossFileDependencyResponse = {
      analysisType,
      requestedSymbol: symbolName,
      requestedFile: filePath,
      summary: ''
    };
    
    try {
      switch (analysisType) {
        case 'symbol':
          if (!symbolName) {
            throw new Error('symbolName is required for symbol analysis');
          }
          response = await this.analyzeSymbolDependencies(symbolName, includeUsageDetails);
          break;
          
        case 'file':
          if (!filePath) {
            throw new Error('filePath is required for file analysis');
          }
          response = await this.analyzeFileDependencies(filePath, includeUsageDetails);
          break;
          
        case 'downstream_impact':
          if (!symbolName) {
            throw new Error('symbolName is required for downstream impact analysis');
          }
          response = await this.analyzeDownstreamImpact(symbolName);
          break;
          
        case 'file_dependencies':
          response = await this.analyzeOverallFileDependencies();
          break;
          
        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }
      
      return response;
    } catch (error) {
      return {
        analysisType,
        requestedSymbol: symbolName,
        requestedFile: filePath,
        summary: `Error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Analyze dependencies for a specific symbol
   */
  private async analyzeSymbolDependencies(symbolName: string, includeDetails: boolean): Promise<CrossFileDependencyResponse> {
    // Find all cross-file usages of this symbol
    const usages = this.db.prepare(`
      SELECT 
        s1.name as from_symbol,
        s1.file_path as from_file,
        s2.name as to_symbol,
        s2.file_path as to_file,
        sr.relationship_type,
        sr.usage_pattern,
        sr.confidence,
        sr.source_text,
        sr.line_number
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s2.name = ? 
        AND sr.detected_by = 'cross-file-analyzer'
        AND s1.file_path != s2.file_path
      ORDER BY sr.confidence DESC, s1.file_path
    `).all(symbolName) as any[];
    
    const symbolUsages: CrossFileUsage[] = usages.map(usage => ({
      fromSymbol: usage.from_symbol,
      fromFile: usage.from_file,
      fromLine: usage.line_number || 0,
      toSymbol: usage.to_symbol,
      toFile: usage.to_file,
      relationshipType: usage.relationship_type,
      usagePattern: usage.usage_pattern,
      confidence: usage.confidence,
      sourceText: usage.source_text || ''
    }));
    
    // Calculate downstream impact
    const affectedFiles = [...new Set(symbolUsages.map(u => u.fromFile))];
    const directCallers = [...new Set(symbolUsages.map(u => u.fromSymbol))];
    const usagesByFile: { [file: string]: number } = {};
    
    symbolUsages.forEach(usage => {
      const fileName = path.basename(usage.fromFile);
      usagesByFile[fileName] = (usagesByFile[fileName] || 0) + 1;
    });
    
    const downstreamImpact: DownstreamImpact = {
      symbol: symbolName,
      totalUsages: symbolUsages.length,
      affectedFiles: affectedFiles.map(f => path.basename(f)),
      directCallers,
      usagesByFile,
      criticalUsages: symbolUsages.filter(u => u.confidence >= 0.8)
    };
    
    let summary = `Found ${symbolUsages.length} cross-file usages of '${symbolName}' across ${affectedFiles.length} files.`;
    if (downstreamImpact.criticalUsages.length > 0) {
      summary += ` ${downstreamImpact.criticalUsages.length} are high-confidence usages.`;
    }
    
    return {
      analysisType: 'symbol',
      requestedSymbol: symbolName,
      symbolUsages: includeDetails ? symbolUsages : undefined,
      downstreamImpact,
      summary
    };
  }

  /**
   * Analyze dependencies for a specific file
   */
  private async analyzeFileDependencies(filePath: string, includeDetails: boolean): Promise<CrossFileDependencyResponse> {
    // Find what this file depends on
    const dependsOn = this.db.prepare(`
      SELECT DISTINCT
        s2.file_path as dependency_file,
        COUNT(*) as usage_count,
        GROUP_CONCAT(DISTINCT sr.relationship_type) as relationship_types
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.file_path = ?
        AND sr.detected_by = 'cross-file-analyzer'
        AND s1.file_path != s2.file_path
      GROUP BY s2.file_path
      ORDER BY usage_count DESC
    `).all(filePath) as any[];
    
    // Find what depends on this file
    const usedBy = this.db.prepare(`
      SELECT DISTINCT
        s1.file_path as dependent_file,
        COUNT(*) as usage_count,
        GROUP_CONCAT(DISTINCT sr.relationship_type) as relationship_types
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s2.file_path = ?
        AND sr.detected_by = 'cross-file-analyzer'
        AND s1.file_path != s2.file_path
      GROUP BY s1.file_path
      ORDER BY usage_count DESC
    `).all(filePath) as any[];
    
    const dependsOnFiles = dependsOn.map(dep => path.basename(dep.dependency_file));
    const usedByFiles = usedBy.map(dep => path.basename(dep.dependent_file));
    
    let summary = `File '${path.basename(filePath)}' depends on ${dependsOnFiles.length} files and is used by ${usedByFiles.length} files.`;
    
    return {
      analysisType: 'file',
      requestedFile: filePath,
      dependsOnFiles,
      usedByFiles,
      summary
    };
  }

  /**
   * Analyze downstream impact for a symbol (comprehensive)
   */
  private async analyzeDownstreamImpact(symbolName: string): Promise<CrossFileDependencyResponse> {
    // Get all relationships involving this symbol
    const allRelationships = this.db.prepare(`
      SELECT 
        s1.name as from_symbol,
        s1.file_path as from_file,
        s1.parent_class as from_class,
        s2.name as to_symbol,
        s2.file_path as to_file,
        s2.parent_class as to_class,
        sr.relationship_type,
        sr.usage_pattern,
        sr.confidence,
        sr.source_text,
        sr.line_number
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE (s1.name = ? OR s2.name = ?)
        AND sr.detected_by = 'cross-file-analyzer'
      ORDER BY sr.confidence DESC
    `).all(symbolName, symbolName) as any[];
    
    // Separate incoming vs outgoing relationships
    const incomingUsages = allRelationships.filter(rel => rel.to_symbol === symbolName);
    const outgoingUsages = allRelationships.filter(rel => rel.from_symbol === symbolName);
    
    const affectedFiles = [...new Set([
      ...incomingUsages.map(u => u.from_file),
      ...outgoingUsages.map(u => u.to_file)
    ])];
    
    const directCallers = [...new Set(incomingUsages.map(u => u.from_symbol))];
    const directCallees = [...new Set(outgoingUsages.map(u => u.to_symbol))];
    
    const downstreamImpact: DownstreamImpact = {
      symbol: symbolName,
      totalUsages: incomingUsages.length,
      affectedFiles: affectedFiles.map(f => path.basename(f)),
      directCallers,
      usagesByFile: {},
      criticalUsages: incomingUsages.filter(u => u.confidence >= 0.8).map(u => ({
        fromSymbol: u.from_symbol,
        fromFile: u.from_file,
        fromLine: u.line_number || 0,
        toSymbol: u.to_symbol,
        toFile: u.to_file,
        relationshipType: u.relationship_type,
        usagePattern: u.usage_pattern,
        confidence: u.confidence,
        sourceText: u.source_text || ''
      }))
    };
    
    // Count usages by file
    incomingUsages.forEach(usage => {
      const fileName = path.basename(usage.from_file);
      downstreamImpact.usagesByFile[fileName] = (downstreamImpact.usagesByFile[fileName] || 0) + 1;
    });
    
    let summary = `Symbol '${symbolName}' has ${incomingUsages.length} incoming usages and ${outgoingUsages.length} outgoing dependencies across ${affectedFiles.length} files.`;
    summary += ` Direct callers: ${directCallers.length}, Direct callees: ${directCallees.length}.`;
    
    return {
      analysisType: 'downstream_impact',
      requestedSymbol: symbolName,
      downstreamImpact,
      summary
    };
  }

  /**
   * Analyze overall file dependency patterns
   */
  private async analyzeOverallFileDependencies(): Promise<CrossFileDependencyResponse> {
    // Get file-to-file dependency summary
    const fileDeps = this.db.prepare(`
      SELECT 
        s1.file_path as dependent_file,
        s2.file_path as dependency_file,
        COUNT(*) as usage_count,
        GROUP_CONCAT(DISTINCT sr.relationship_type) as relationship_types,
        AVG(sr.confidence) as avg_confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.detected_by = 'cross-file-analyzer'
        AND s1.file_path != s2.file_path
      GROUP BY s1.file_path, s2.file_path
      ORDER BY usage_count DESC
    `).all() as any[];
    
    const fileDependencies: FileDependency[] = fileDeps.map(dep => ({
      dependentFile: path.basename(dep.dependent_file),
      dependencyFile: path.basename(dep.dependency_file),
      usageCount: dep.usage_count,
      relationshipTypes: dep.relationship_types.split(','),
      usages: [] // Detailed usages not included in overview
    }));
    
    // Get usage pattern summary
    const patternSummary = this.db.prepare(`
      SELECT usage_pattern, COUNT(*) as count
      FROM symbol_relationships 
      WHERE detected_by = 'cross-file-analyzer'
      GROUP BY usage_pattern
      ORDER BY count DESC
    `).all() as any[];
    
    const usagePatternSummary: { [pattern: string]: number } = {};
    let totalRelationships = 0;
    
    patternSummary.forEach(p => {
      usagePatternSummary[p.usage_pattern] = p.count;
      totalRelationships += p.count;
    });
    
    const summary = `Found ${totalRelationships} cross-file relationships across ${fileDependencies.length} file pairs. Top patterns: ${Object.keys(usagePatternSummary).slice(0, 3).join(', ')}.`;
    
    return {
      analysisType: 'file_dependencies',
      fileDependencies,
      totalCrossFileRelationships: totalRelationships,
      usagePatternSummary,
      summary
    };
  }

  close(): void {
    this.indexer.close();
    this.db.close();
  }
}