import { Priority1Tools } from './priority-1-tools.js';
import { Priority2Tools } from './priority-2-tools.js';
import {
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  ImplementationMatch,
  UsageExample
} from '../types/essential-features.js';
import { SemanticAnalyzer } from '../services/semantic-analyzer.js';
import Database from 'better-sqlite3';

export class UnifiedSearch {
  private priority1Tools: Priority1Tools;
  private priority2Tools: Priority2Tools;
  private semanticAnalyzer: SemanticAnalyzer;
  private db: Database.Database;

  constructor(dbPathOrDatabase: string | Database.Database) {
    if (typeof dbPathOrDatabase === 'string') {
      // Legacy mode: create our own database connection
      this.priority1Tools = new Priority1Tools(dbPathOrDatabase);
      this.priority2Tools = new Priority2Tools(dbPathOrDatabase);
      this.db = new Database(dbPathOrDatabase);
    } else {
      // New mode: use existing database
      this.priority1Tools = new Priority1Tools(dbPathOrDatabase);
      this.priority2Tools = new Priority2Tools(dbPathOrDatabase);
      this.db = dbPathOrDatabase;
    }
    this.semanticAnalyzer = new SemanticAnalyzer();
  }

  /**
   * Unified search interface that understands natural language queries
   */
  async search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    // Parse the query to understand intent
    const queryAnalysis = await this.semanticAnalyzer.analyzeQuery(request.query);
    const intent = request.intent || queryAnalysis.intent;

    // Extract keywords and concepts
    const keywords = queryAnalysis.keywords;
    const concepts = queryAnalysis.concepts;

    let response: UnifiedSearchResponse = {
      existing_solutions: [],
      integration_path: [],
      examples: [],
      warnings: []
    };

    switch (intent) {
      case 'implementation':
        response = await this.handleImplementationSearch(
          keywords, 
          concepts, 
          request.context
        );
        break;

      case 'usage':
        response = await this.handleUsageSearch(
          keywords, 
          concepts, 
          request.context
        );
        break;

      case 'debug':
        response = await this.handleDebugSearch(
          keywords, 
          concepts, 
          request.context
        );
        break;

      case 'extend':
        response = await this.handleExtensionSearch(
          keywords, 
          concepts, 
          request.context
        );
        break;

      default:
        // Generic search combining multiple approaches
        response = await this.handleGenericSearch(
          keywords, 
          concepts, 
          request.context
        );
    }

    // Add contextual warnings
    response.warnings = await this.generateWarnings(
      response.existing_solutions,
      request.context
    );

    return response;
  }

  private async handleImplementationSearch(
    keywords: string[],
    concepts: any,
    context?: any
  ): Promise<UnifiedSearchResponse> {
    // Find existing implementations
    const implementations = await this.priority1Tools.findImplementations({
      functionality: concepts.functionality || keywords.join(' '),
      keywords,
      returnType: concepts.returnType
    });

    // Convert to unified format
    const existing_solutions = [
      ...implementations.exact_matches,
      ...implementations.similar_implementations
    ];

    // Find best integration path if context is provided
    let integration_path: string[] = [];
    if (context?.current_file && existing_solutions.length > 0) {
      const pathResult = await this.priority1Tools.findDependencyPath({
        from: context.current_file,
        to: existing_solutions[0].module,
        stage: context.stage
      });
      integration_path = pathResult.recommended_path;
    }

    // Find usage examples
    const examples: UsageExample[] = [];
    for (const solution of existing_solutions.slice(0, 3)) {
      const exampleResult = await this.priority2Tools.findUsageExamples({
        class: solution.module,
        method: solution.method
      });
      examples.push(...exampleResult.examples);
    }

    // Generate approach recommendation
    const recommended_approach = this.generateApproachRecommendation(
      existing_solutions,
      integration_path,
      concepts
    );

    return {
      existing_solutions,
      recommended_approach,
      integration_path,
      examples,
      warnings: []
    };
  }

  private async handleUsageSearch(
    keywords: string[],
    concepts: any,
    context?: any
  ): Promise<UnifiedSearchResponse> {
    // Focus on finding usage examples
    const primaryKeyword = keywords[0] || concepts.className;
    
    const exampleResult = await this.priority2Tools.findUsageExamples({
      class: primaryKeyword,
      method: concepts.methodName
    });

    // Get API surface for better understanding
    const apiResult = await this.priority2Tools.getApiSurface({
      module: context?.current_file || primaryKeyword,
      include_inherited: true
    });

    // Find related implementations
    const implementations = await this.priority1Tools.findImplementations({
      functionality: 'usage',
      keywords: [primaryKeyword],
      returnType: undefined
    });

    return {
      existing_solutions: implementations.exact_matches,
      recommended_approach: {
        description: `Usage examples for ${primaryKeyword}`,
        steps: [
          `Review the ${exampleResult.examples.length} usage examples found`,
          `Check the API surface for available methods`,
          `Follow the established patterns in the codebase`
        ]
      },
      integration_path: [],
      examples: exampleResult.examples,
      warnings: []
    };
  }

  private async handleDebugSearch(
    keywords: string[],
    concepts: any,
    context?: any
  ): Promise<UnifiedSearchResponse> {
    // Find similar code patterns that might have the same issue
    const patternResult = await this.priority1Tools.findSimilarCode({
      pattern: keywords.join(' '),
      context: 'debug',
      threshold: 0.6
    });

    // Analyze impact to understand the scope
    const impactResult = await this.priority2Tools.analyzeImpact({
      module: context?.current_file || keywords[0],
      change_type: 'method_change'
    });

    // Find implementations that might help solve the issue
    const implementations = await this.priority1Tools.findImplementations({
      functionality: concepts.problemType || 'error handling',
      keywords: keywords,
      returnType: undefined
    });

    return {
      existing_solutions: implementations.similar_implementations,
      recommended_approach: {
        description: 'Debug approach',
        steps: [
          `Check ${patternResult.similar_patterns.length} similar patterns for solutions`,
          `Review impact on ${impactResult.direct_dependents.length} dependent modules`,
          `Consider existing error handling patterns`
        ]
      },
      integration_path: [],
      examples: [],
      warnings: this.generateDebugWarnings(impactResult)
    };
  }

  private async handleExtensionSearch(
    keywords: string[],
    concepts: any,
    context?: any
  ): Promise<UnifiedSearchResponse> {
    // Get current API surface
    const apiResult = await this.priority2Tools.getApiSurface({
      module: context?.current_file || keywords[0],
      include_inherited: true
    });

    // Find similar implementations to extend from
    const implementations = await this.priority1Tools.findImplementations({
      functionality: concepts.extensionType || 'base implementation',
      keywords,
      returnType: undefined
    });

    // Analyze impact of extension
    const impactResult = await this.priority2Tools.analyzeImpact({
      module: context?.current_file || keywords[0],
      change_type: 'interface_modification'
    });

    // Find extension patterns
    const examples = await this.findExtensionExamples(
      apiResult.interfaces,
      keywords
    );

    return {
      existing_solutions: implementations.exact_matches,
      recommended_approach: {
        description: 'Extension approach',
        steps: [
          `Implement required interfaces: ${apiResult.interfaces.join(', ')}`,
          `Follow existing extension patterns`,
          `Ensure compatibility with ${impactResult.direct_dependents.length} dependents`
        ]
      },
      integration_path: [],
      examples,
      warnings: [impactResult.suggestion || '']
    };
  }

  private async handleGenericSearch(
    keywords: string[],
    concepts: any,
    context?: any
  ): Promise<UnifiedSearchResponse> {
    // Combine multiple search strategies
    const implementations = await this.priority1Tools.findImplementations({
      functionality: keywords.join(' '),
      keywords,
      returnType: concepts.returnType
    });

    const examples = await this.priority2Tools.findUsageExamples({
      class: keywords[0],
      method: keywords[1]
    });

    const integration_path = context?.current_file && implementations.exact_matches.length > 0
      ? (await this.priority1Tools.findDependencyPath({
          from: context.current_file,
          to: implementations.exact_matches[0].module,
          stage: context.stage
        })).recommended_path
      : [];

    return {
      existing_solutions: [
        ...implementations.exact_matches,
        ...implementations.similar_implementations.slice(0, 5)
      ],
      recommended_approach: {
        description: 'Search results',
        steps: [
          `Found ${implementations.exact_matches.length} exact matches`,
          `Found ${implementations.similar_implementations.length} similar implementations`,
          `Review examples and choose the best approach`
        ]
      },
      integration_path,
      examples: examples.examples,
      warnings: []
    };
  }

  private generateApproachRecommendation(
    solutions: ImplementationMatch[],
    integrationPath: string[],
    concepts: any
  ): any {
    if (solutions.length === 0) {
      return {
        description: 'No existing implementation found',
        steps: [
          'Consider implementing the functionality',
          'Follow the project\'s architectural patterns',
          'Add appropriate tests'
        ]
      };
    }

    const bestMatch = solutions[0];
    return {
      description: `Use existing ${bestMatch.module}::${bestMatch.method}`,
      steps: [
        `Import ${bestMatch.module}`,
        integrationPath.length > 0 
          ? `Follow path: ${integrationPath.join(' → ')}`
          : 'Direct usage is possible',
        'Adapt the implementation to your specific needs'
      ]
    };
  }

  private async findExtensionExamples(
    interfaces: string[],
    keywords: string[]
  ): Promise<UsageExample[]> {
    const examples: UsageExample[] = [];
    
    for (const iface of interfaces) {
      const result = await this.priority2Tools.findUsageExamples({
        class: iface
      });
      examples.push(...result.examples);
    }

    return examples;
  }

  private async generateWarnings(
    solutions: ImplementationMatch[],
    context?: any
  ): Promise<string[]> {
    const warnings: string[] = [];

    // Check for deprecated modules
    const deprecatedModules = solutions.filter(s => 
      s.module.toLowerCase().includes('v1') ||
      s.module.toLowerCase().includes('old') ||
      s.module.toLowerCase().includes('deprecated')
    );

    if (deprecatedModules.length > 0) {
      warnings.push(`Don't use ${deprecatedModules[0].module} - it appears to be deprecated`);
    }

    // Check for architecture violations
    if (context?.stage) {
      const wrongStage = solutions.filter(s => 
        !this.isCorrectStage(s.location, context.stage)
      );
      
      if (wrongStage.length > 0) {
        warnings.push(`${wrongStage[0].module} belongs to a different pipeline stage`);
      }
    }

    return warnings;
  }

  private generateDebugWarnings(impact: any): string[] {
    const warnings: string[] = [];

    if (impact.risk_level === 'critical' || impact.risk_level === 'high') {
      warnings.push(`High risk change affecting ${impact.direct_dependents.length} modules`);
    }

    if (impact.test_files.length === 0) {
      warnings.push('No test files found - consider adding tests before debugging');
    }

    return warnings;
  }

  private isCorrectStage(location: string, expectedStage: string): boolean {
    // Simplified stage checking
    const stageKeywords: Record<string, string[]> = {
      noise_generation: ['noise', 'perlin', 'simplex'],
      terrain_formation: ['terrain', 'heightmap', 'elevation'],
      atmospheric_dynamics: ['atmosphere', 'air', 'pressure'],
      geological_processes: ['geological', 'rock', 'mineral'],
      ecosystem_simulation: ['ecosystem', 'biome', 'vegetation'],
      weather_systems: ['weather', 'cloud', 'precipitation'],
      final_rendering: ['render', 'draw', 'display']
    };

    const keywords = stageKeywords[expectedStage] || [];
    return keywords.some(k => location.toLowerCase().includes(k));
  }

  /**
   * Find which module contains a specific symbol
   */
  async findModuleForSymbol(symbolName: string): Promise<any> {
    console.log(`[DEBUG] Searching for symbol: ${symbolName}`);
    
    // Search for the symbol in the database with better matching
    const symbols = this.db.prepare(`
      SELECT DISTINCT
        s.name,
        s.qualified_name,
        s.file_path,
        s.line,
        s.kind,
        s.parent_class,
        s.namespace,
        s.pipeline_stage,
        s.signature
      FROM enhanced_symbols s
      WHERE (s.name = ? OR s.name LIKE ? OR s.qualified_name LIKE ? OR s.signature LIKE ?)
      ORDER BY 
        CASE 
          WHEN s.name = ? THEN 1
          WHEN s.name LIKE ? THEN 2
          WHEN s.qualified_name LIKE ? THEN 3
          ELSE 4
        END,
        s.parser_confidence DESC
      LIMIT 10
    `).all(
      symbolName, `%${symbolName}%`, `%${symbolName}%`, `%${symbolName}%`,
      symbolName, `${symbolName}%`, `%${symbolName}%`
    ) as any[];
    
    console.log(`[DEBUG] Found ${symbols.length} symbols:`, symbols);
    
    if (symbols.length === 0) {
      return {
        found: false,
        message: `Symbol '${symbolName}' not found in codebase`,
        suggestions: await this.getSimilarSymbols(symbolName)
      };
    }
    
    // Group by module
    const moduleMap = new Map<string, any[]>();
    symbols.forEach(symbol => {
      const module = symbol.module_path || symbol.file_path;
      if (!moduleMap.has(module)) {
        moduleMap.set(module, []);
      }
      moduleMap.get(module)!.push(symbol);
    });
    
    // Format results
    const results = Array.from(moduleMap.entries()).map(([module, syms]) => ({
      module,
      symbols: syms.map(s => ({
        name: s.qualified_name || s.name,
        kind: s.kind,
        location: `${s.file_path}:${s.line || 0}`
      })),
      stage: syms[0].pipeline_stage || 'unknown'
    }));
    
    return {
      found: true,
      primaryModule: results[0].module,
      allOccurrences: results,
      totalOccurrences: symbols.length
    };
  }
  
  /**
   * Search code using natural language queries
   */
  async semanticSearch(query: string): Promise<any> {
    // Use the existing search method with auto-detected intent
    const searchRequest: UnifiedSearchRequest = {
      query,
      intent: undefined, // Let semantic analyzer determine intent
      context: undefined // No context for semantic search
    };
    
    const searchResults = await this.search(searchRequest);
    
    // Format for semantic search response
    return {
      query,
      intent: searchResults.recommended_approach?.description || 'general search',
      results: {
        implementations: searchResults.existing_solutions.map(s => ({
          title: `${s.module}::${s.method}`,
          description: s.description,
          location: s.location,
          score: s.score || s.similarity || 0
        })),
        examples: searchResults.examples.map(e => ({
          code: e.code,
          location: e.location,
          context: e.context
        })),
        relatedConcepts: await this.extractRelatedConcepts(query)
      },
      suggestions: searchResults.warnings && searchResults.warnings.length > 0 ? searchResults.warnings : [
        'Try adding more specific keywords',
        'Include technical terms related to your search',
        'Specify the component or module you\'re interested in'
      ]
    };
  }
  
  // Helper methods
  
  private async getSimilarSymbols(symbolName: string): Promise<string[]> {
    // Find symbols with similar names
    const similar = this.db.prepare(`
      SELECT DISTINCT name
      FROM enhanced_symbols
      WHERE name LIKE ? AND parser_confidence > 0.7
      LIMIT 5
    `).all(`%${symbolName.slice(0, -1)}%`) as any[];
    
    return similar.map(s => s.name);
  }
  
  private async extractRelatedConcepts(query: string): Promise<string[]> {
    // Extract technical concepts from the query
    const concepts: string[] = [];
    
    // Common programming concepts
    const conceptPatterns = [
      { pattern: /render|draw|display/i, concept: 'rendering' },
      { pattern: /noise|perlin|simplex/i, concept: 'noise generation' },
      { pattern: /terrain|height|elevation/i, concept: 'terrain formation' },
      { pattern: /pattern|template|factory/i, concept: 'design patterns' },
      { pattern: /async|thread|parallel/i, concept: 'concurrency' },
      { pattern: /test|spec|mock/i, concept: 'testing' }
    ];
    
    conceptPatterns.forEach(({ pattern, concept }) => {
      if (pattern.test(query)) {
        concepts.push(concept);
      }
    });
    
    return concepts;
  }

  close(): void {
    this.priority1Tools.close();
    this.priority2Tools.close();
    this.db.close();
  }
}