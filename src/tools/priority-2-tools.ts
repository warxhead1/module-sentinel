import Database from 'better-sqlite3';
import * as path from 'path';
import { CleanUnifiedSchemaManager } from '../database/clean-unified-schema.js';
import {
  ApiSurfaceRequest,
  ApiSurfaceResponse,
  UsageExampleRequest,
  UsageExampleResponse,
  ImpactAnalysisRequest,
  ImpactAnalysisResponse,
  MethodInfo,
  ApiMemberInfo,
  UsageExample
} from '../types/essential-features.js';

export class Priority2Tools {
  private db: Database.Database;

  constructor(dbPathOrDatabase: string | Database.Database) {
    if (typeof dbPathOrDatabase === 'string') {
      // Legacy mode: create our own database connection
      this.db = new Database(dbPathOrDatabase);
      // Initialize unified schema
      const schemaManager = CleanUnifiedSchemaManager.getInstance();
      schemaManager.initializeDatabase(this.db);
    } else {
      // New mode: use existing database (schema already initialized)
      this.db = dbPathOrDatabase;
    }
  }

  /**
   * Get the API surface of a module
   */
  async getApiSurface(request: ApiSurfaceRequest): Promise<ApiSurfaceResponse> {
    // Get all public methods/functions from enhanced_symbols
    const methods = this.db.prepare(`
      SELECT 
        s.id,
        s.name, 
        s.signature, 
        s.return_type, 
        s.parent_class, 
        s.namespace, 
        s.file_path, 
        s.kind,
        s.qualified_name
      FROM enhanced_symbols s
      WHERE s.file_path LIKE ? 
        AND s.kind IN ('function', 'method')
        AND s.parser_confidence > 0.5
      ORDER BY s.parent_class, s.name
    `).all(`%${request.module}%`) as Array<any>;

    // Get usage counts for each method
    const methodsWithUsage = methods.map((m: any) => {
      const usageCount = this.db.prepare(`
        SELECT COUNT(DISTINCT sr.from_symbol_id) as usage_count
        FROM symbol_relationships sr
        WHERE sr.to_symbol_id = ?
          AND sr.relationship_type IN ('calls', 'uses')
      `).get(m.id) as any;
      
      return {
        ...m,
        usage_count: usageCount?.usage_count || 0
      };
    });

    const public_methods: MethodInfo[] = methodsWithUsage.map((m: any) => ({
      name: m.name,
      params: this.parseSignatureParams(m.signature || ''),
      returns: m.return_type || 'void',
      description: this.generateMethodDescription(m),
      usage_count: m.usage_count
    }));

    // Get class information from class_hierarchies view (compatibility)
    const classInfo = this.db.prepare(`
      SELECT DISTINCT class_name, base_class, implements_interface 
      FROM class_hierarchies 
      WHERE file_path LIKE ?
    `).all(request.module) as Array<{ class_name: string; base_class: string | null; implements_interface: string | null }>;

    const interfaces = [...new Set(
      classInfo
        .filter((c: any) => c.implements_interface)
        .map((c: any) => c.implements_interface)
    )];

    // Get dependencies by aggregating symbol relationships
    const deps = this.db.prepare(`
      SELECT DISTINCT 
        to_s.file_path as to_file,
        sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
      JOIN enhanced_symbols to_s ON sr.to_symbol_id = to_s.id
      WHERE from_s.file_path LIKE ?
        AND to_s.file_path NOT LIKE ?
    `).all(`%${request.module}%`, `%${request.module}%`) as Array<{ to_file: string; relationship_type: string }>;

    const required = [...new Set(deps
      .filter((d: any) => d.relationship_type === 'uses' || d.relationship_type === 'calls')
      .map((d: any) => path.basename(d.to_file, path.extname(d.to_file))))];

    const optional = [...new Set(deps
      .filter((d: any) => d.relationship_type === 'inherits' || d.relationship_type === 'implements')
      .map((d: any) => path.basename(d.to_file, path.extname(d.to_file))))];
      
    // Remove duplicates between required and optional
    const optionalFiltered = optional.filter(dep => !required.includes(dep));

    // Get all exported symbols (classes, structs, enums, variables, etc.)
    const allExports = this.db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.qualified_name,
        s.kind,
        s.signature,
        s.file_path,
        s.parent_class,
        s.namespace,
        s.semantic_tags
      FROM enhanced_symbols s
      WHERE s.file_path LIKE ?
        AND s.parser_confidence > 0.5
        AND s.kind IN ('class', 'struct', 'enum', 'variable', 'typedef', 'namespace')
      ORDER BY s.kind, s.name
    `).all(`%${request.module}%`) as Array<any>;

    // Get usage counts and import locations for each export
    const exports = allExports.map((symbol: any) => {
      // Get all places where this symbol is used
      const usages = this.db.prepare(`
        SELECT 
          from_s.file_path,
          from_s.name as from_symbol,
          sr.relationship_type
        FROM symbol_relationships sr
        JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
        WHERE sr.to_symbol_id = ?
          AND sr.relationship_type IN ('uses', 'calls', 'inherits', 'implements', 'instance_of', 'imports')
      `).all(symbol.id) as any[];
      
      // Group by file to show where it's imported
      const importedBy = [...new Set(usages.map((u: any) => u.file_path))];
      
      return {
        name: symbol.name,
        qualified_name: symbol.qualified_name,
        kind: symbol.kind,
        usage_count: usages.length,
        imported_by: importedBy,
        import_count: importedBy.length
      };
    });

    // Get public members (member variables) with usage counts
    const memberVariables = this.db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.qualified_name,
        s.kind,
        s.signature,
        s.parent_class
      FROM enhanced_symbols s
      WHERE s.file_path LIKE ?
        AND s.kind = 'variable'
        AND s.parent_class IS NOT NULL
        AND s.parser_confidence > 0.5
      ORDER BY s.parent_class, s.name
    `).all(`%${request.module}%`) as Array<any>;

    const public_members: ApiMemberInfo[] = memberVariables.map((m: any) => {
      const usageCount = this.db.prepare(`
        SELECT COUNT(DISTINCT sr.from_symbol_id) as usage_count
        FROM symbol_relationships sr
        WHERE sr.to_symbol_id = ?
          AND sr.relationship_type IN ('uses', 'reads', 'writes')
      `).get(m.id) as any;
      
      return {
        name: m.name,
        parent_class: m.parent_class,
        qualified_name: m.qualified_name,
        usage_count: usageCount?.usage_count || 0
      };
    });

    return {
      public_methods,
      public_members,
      interfaces,
      dependencies: {
        required: required,
        optional: optionalFiltered
      },
      exports: exports.filter(e => e.usage_count > 0 || e.kind === 'class' || e.kind === 'struct')
    };
  }

  /**
   * Find usage examples for a class or method
   */
  async findUsageExamples(request: UsageExampleRequest): Promise<UsageExampleResponse> {
    let query = `
      SELECT * FROM usage_examples 
      WHERE symbol = ?
    `;
    const params: any[] = [request.class];

    if (request.method) {
      query += ` OR symbol = ?`;
      params.push(`${request.class}::${request.method}`);
    }

    query += ` ORDER BY line LIMIT 10`;

    const examples = this.db.prepare(query).all(...params) as Array<{
      module_path: string;
      line: number;
      example_code: string;
      context: string;
    }>;

    const formattedExamples: UsageExample[] = examples.map((ex: any) => ({
      location: `${ex.module_path}:${ex.line}`,
      code: ex.example_code,
      context: ex.context
    }));

    return { examples: formattedExamples };
  }

  /**
   * Analyze the impact of changes to a module
   */
  async analyzeImpact(request: ImpactAnalysisRequest): Promise<ImpactAnalysisResponse> {
    // Get symbols in the requested module first
    const moduleSymbols = this.db.prepare(`
      SELECT id, name, qualified_name, file_path
      FROM enhanced_symbols 
      WHERE file_path LIKE ? OR qualified_name LIKE ?
    `).all(`%${request.module}%`, `%${request.module}%`);
    
    if (moduleSymbols.length === 0) {
      return {
        direct_dependents: [],
        indirect_dependents: [],
        test_files: [],
        risk_level: 'low',
        suggestion: `Module '${request.module}' not found in codebase`
      };
    }
    
    const moduleSymbolIds = moduleSymbols.map((s: any) => s.id);
    
    // Get direct dependents using symbol relationships
    const directDepsQuery = this.db.prepare(`
      SELECT DISTINCT 
        from_s.file_path as from_file,
        from_s.name as from_symbol,
        sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
      JOIN enhanced_symbols to_s ON sr.to_symbol_id = to_s.id
      WHERE to_s.id IN (${moduleSymbolIds.map(() => '?').join(',')})
        AND sr.relationship_type IN ('uses', 'calls', 'inherits', 'implements', 'member_of')
    `);
    
    const directDepsRaw = directDepsQuery.all(...moduleSymbolIds);
    const directDeps = [...new Set(directDepsRaw.map((d: any) => d.from_file))];

    // Get indirect dependents (2 levels deep)
    const indirectDeps = new Set<string>();
    for (const direct of directDeps) {
      // Find symbols in the direct dependent file
      const directFileSymbols = this.db.prepare(`
        SELECT id FROM enhanced_symbols WHERE file_path = ?
      `).all(direct);
      
      if (directFileSymbols.length > 0) {
        const directSymbolIds = directFileSymbols.map((s: any) => s.id);
        const secondLevel = this.db.prepare(`
          SELECT DISTINCT from_s.file_path
          FROM symbol_relationships sr
          JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
          WHERE sr.to_symbol_id IN (${directSymbolIds.map(() => '?').join(',')})
            AND from_s.file_path != ?
        `).all(...directSymbolIds, direct);

        secondLevel.forEach((d: any) => {
          if (d.file_path && d.file_path !== request.module) {
            indirectDeps.add(d.file_path);
          }
        });
      }
    }

    // Find test files
    const testFiles = [...directDeps, ...indirectDeps]
      .filter(f => f.includes('test') || f.includes('Test'))
      .filter(f => !f.includes('node_modules'));

    // Calculate risk level
    const risk_level = this.calculateRiskLevel(
      directDeps.length,
      indirectDeps.size,
      request.change_type
    );

    // Generate suggestion
    const suggestion = this.generateImpactSuggestion(
      request.change_type,
      risk_level,
      directDeps.length
    );

    return {
      direct_dependents: directDeps,
      indirect_dependents: Array.from(indirectDeps),
      test_files: testFiles,
      risk_level,
      suggestion
    };
  }

  // Helper methods
  
  private parseSignatureParams(signature: string): string[] {
    if (!signature) return [];
    
    // Extract parameters from signature like "func(type1 param1, type2 param2)"
    const match = signature.match(/\(([^)]*)\)/);
    if (!match || !match[1].trim()) return [];
    
    return match[1].split(',').map(param => param.trim()).filter(p => p);
  }

  private generateMethodDescription(method: any): string {
    let desc = `${method.kind || 'method'} `;
    
    if (method.parent_class) {
      desc += `${method.parent_class}::`;
    }
    
    desc += method.name;
    
    if (method.signature) {
      desc += ` - ${method.signature}`;
    }
    
    return desc;
  }

  private calculateRiskLevel(
    directCount: number,
    indirectCount: number,
    changeType: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    const totalImpact = directCount + (indirectCount * 0.5);

    if (changeType === 'removal') {
      if (totalImpact > 20) return 'critical';
      if (totalImpact > 10) return 'high';
      if (totalImpact > 5) return 'medium';
      return 'low';
    }

    if (changeType === 'interface_modification') {
      // Interface modifications are higher risk due to contract changes
      if (directCount === 0) return 'low'; // No implementers/users
      if (totalImpact > 10) return 'critical';
      if (totalImpact > 5) return 'high';
      if (totalImpact > 2) return 'medium';
      return 'low';
    }

    // For other changes
    if (totalImpact > 25) return 'high';
    if (totalImpact > 10) return 'medium';
    return 'low';
  }

  private generateImpactSuggestion(
    changeType: string,
    riskLevel: string,
    directCount: number
  ): string {
    const suggestions: Record<string, Record<string, string>> = {
      interface_modification: {
        critical: 'Consider adding a compatibility layer or versioning the interface',
        high: 'Add default implementations to maintain backward compatibility',
        medium: 'Document the changes clearly and update dependent modules',
        low: 'Safe to proceed with standard change management'
      },
      removal: {
        critical: 'Do not remove - too many dependencies. Consider deprecation first',
        high: 'Create migration guide before removal',
        medium: 'Notify dependent module owners before removal',
        low: 'Safe to remove after updating dependents'
      },
      method_change: {
        critical: 'Consider method overloading instead of modification',
        high: 'Add compatibility overload with the old signature',
        medium: 'Update call sites and documentation',
        low: 'Safe to modify with minimal impact'
      },
      rename: {
        critical: 'Use deprecated alias for the old name',
        high: 'Provide forwarding from old to new name',
        medium: 'Update all references in dependent modules',
        low: 'Simple rename is safe'
      }
    };

    return suggestions[changeType]?.[riskLevel] || 
           `Review the ${directCount} direct dependencies before proceeding`;
  }

  /**
   * Validate architectural boundaries and detect violations
   */
  async validateBoundaries(checkType: string = 'all'): Promise<any> {
    const violations = [];
    
    if (checkType === 'all' || checkType === 'layer') {
      // Check layer violations (e.g., rendering shouldn't depend on noise generation)
      const layerViolations = this.db.prepare(`
        SELECT DISTINCT
          from_s.file_path as from_file,
          to_s.file_path as to_file,
          sr.relationship_type
        FROM symbol_relationships sr
        JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
        JOIN enhanced_symbols to_s ON sr.to_symbol_id = to_s.id
        WHERE sr.relationship_type IN ('uses', 'calls')
          AND from_s.pipeline_stage = 'FinalRendering'
          AND to_s.pipeline_stage = 'NoiseGeneration'
      `).all() as any[];
      
      violations.push(...layerViolations.map(v => ({
        type: 'layer_violation',
        from: v.from_file,
        to: v.to_file,
        severity: 'high',
        message: 'Rendering layer should not depend on noise generation layer'
      })));
    }
    
    if (checkType === 'all' || checkType === 'module') {
      // Check module boundary violations by joining with enhanced_symbols to get module info
      const moduleViolations = this.db.prepare(`
        SELECT COUNT(*) as cross_module_calls, 
               from_symbols.file_path as from_module, 
               to_symbols.file_path as to_module
        FROM symbol_relationships sr
        LEFT JOIN enhanced_symbols from_symbols ON sr.from_symbol_id = from_symbols.id
        LEFT JOIN enhanced_symbols to_symbols ON sr.to_symbol_id = to_symbols.id
        WHERE sr.relationship_type IN ('uses', 'calls')
          AND from_symbols.file_path != to_symbols.file_path
          AND from_symbols.file_path IS NOT NULL
          AND to_symbols.file_path IS NOT NULL
        GROUP BY from_symbols.file_path, to_symbols.file_path
        HAVING cross_module_calls > 10
      `).all() as any[];
      
      violations.push(...moduleViolations.map(v => ({
        type: 'excessive_coupling',
        from: v.from_module,
        to: v.to_module,
        severity: 'medium',
        message: `Excessive coupling: ${v.cross_module_calls} cross-module calls`
      })));
    }
    
    return {
      violations,
      summary: {
        total_violations: violations.length,
        high_severity: violations.filter(v => v.severity === 'high').length,
        medium_severity: violations.filter(v => v.severity === 'medium').length,
        low_severity: violations.filter(v => v.severity === 'low').length
      },
      recommendations: this.generateBoundaryRecommendations(violations)
    };
  }

  /**
   * Suggest the best module for a new class or functionality
   */
  async suggestModule(className: string, description: string): Promise<any> {
    // Extract keywords from class name and description
    const keywords = [
      ...className.split(/(?=[A-Z])|_/).filter(k => k.length > 0),
      ...description.toLowerCase().split(/\s+/).filter(k => k.length > 3)
    ];
    
    // Find modules with similar functionality
    const similarModules = this.db.prepare(`
      SELECT DISTINCT
        m.path as module_path,
        m.relative_path,
        COUNT(DISTINCT s.name) as matching_symbols,
        AVG(s.parser_confidence) as avg_confidence
      FROM modules m
      JOIN enhanced_symbols s ON s.file_path LIKE m.path || '%'
      WHERE ${keywords.map(() => 's.name LIKE ?').join(' OR ')}
      GROUP BY m.path
      ORDER BY matching_symbols DESC, avg_confidence DESC
      LIMIT 5
    `).all(...keywords.map(k => `%${k}%`)) as any[];
    
    // Analyze cohesion with potential modules
    const suggestions = [];
    
    for (const module of similarModules) {
      const cohesionScore = this.calculateCohesionScore(className, module.module_path);
      
      suggestions.push({
        module: module.relative_path,
        score: (module.matching_symbols * 0.5 + cohesionScore * 0.5) / 10,
        reason: `Found ${module.matching_symbols} similar symbols`,
        existing_classes: await this.getModuleClasses(module.module_path)
      });
    }
    
    // Sort by score
    suggestions.sort((a, b) => b.score - a.score);
    
    // Determine if a new module is needed
    const bestScore = suggestions[0]?.score || 0;
    const recommendNewModule = bestScore < 0.3;
    
    return {
      recommended: recommendNewModule ? 
        { 
          type: 'new_module',
          path: this.suggestNewModulePath(className, description),
          reason: 'No existing module matches the functionality well'
        } : 
        {
          type: 'existing_module',
          path: suggestions[0].module,
          reason: suggestions[0].reason
        },
      alternatives: suggestions.slice(0, 3),
      analysis: {
        keyword_matches: keywords,
        cohesion_analysis: `Based on ${similarModules.length} similar modules`
      }
    };
  }
  
  // Helper methods for the new functionality
  
  private generateBoundaryRecommendations(violations: any[]): string[] {
    const recommendations = [];
    
    const layerViolations = violations.filter(v => v.type === 'layer_violation');
    if (layerViolations.length > 0) {
      recommendations.push('Consider introducing interfaces to decouple layers');
      recommendations.push('Use dependency injection to reverse dependencies');
    }
    
    const couplingViolations = violations.filter(v => v.type === 'excessive_coupling');
    if (couplingViolations.length > 0) {
      recommendations.push('Extract common functionality into shared modules');
      recommendations.push('Consider using the facade pattern to reduce coupling');
    }
    
    return recommendations;
  }
  
  private calculateCohesionScore(className: string, modulePath: string): number {
    // Simplified cohesion calculation
    const moduleClasses = this.db.prepare(`
      SELECT COUNT(DISTINCT name) as count
      FROM enhanced_symbols
      WHERE file_path LIKE ? || '%'
        AND kind IN ('class', 'struct')
        AND parser_confidence > 0.5
    `).get(modulePath) as any;
    
    // Lower score for modules with many classes (less cohesive)
    return Math.max(0, 1 - (moduleClasses.count / 20));
  }
  
  private async getModuleClasses(modulePath: string): Promise<string[]> {
    const classes = this.db.prepare(`
      SELECT DISTINCT name
      FROM enhanced_symbols
      WHERE file_path LIKE ? || '%'
        AND kind IN ('class', 'struct')
        AND parser_confidence > 0.5
      LIMIT 5
    `).all(modulePath) as any[];
    
    return classes.map(c => c.name);
  }
  
  private suggestNewModulePath(className: string, description: string): string {
    // Extract the main concept from the class name
    const concept = className.replace(/([A-Z])/g, ' $1').trim().split(' ')[0];
    
    // Determine pipeline stage based on keywords
    let stage = 'Core';
    if (description.includes('render') || description.includes('draw')) {
      stage = 'Rendering';
    } else if (description.includes('noise') || description.includes('generation')) {
      stage = 'NoiseGeneration';
    } else if (description.includes('terrain') || description.includes('height')) {
      stage = 'TerrainFormation';
    }
    
    return `src/${stage}/${concept}`;
  }

  /**
   * Find all callers of a given symbol
   */
  async findCallers(symbolName: string): Promise<any> {
    // First find the symbol
    const targetSymbols = this.db.prepare(`
      SELECT id, name, qualified_name, kind, file_path, line
      FROM enhanced_symbols
      WHERE name = ? OR qualified_name = ? OR qualified_name LIKE ?
    `).all(symbolName, symbolName, `%::${symbolName}`) as any[];
    
    if (targetSymbols.length === 0) {
      return {
        symbol: symbolName,
        found: false,
        direct_callers: [],
        indirect_callers: [],
        test_coverage: [],
        summary: {
          total_direct_callers: 0,
          total_indirect_callers: 0,
          test_count: 0,
          is_tested: false
        }
      };
    }
    
    // Get the most likely match (prefer exact qualified name match)
    const targetSymbol = targetSymbols.find(s => s.qualified_name === symbolName) || targetSymbols[0];
    
    // Find direct callers
    const directCallers = this.db.prepare(`
      SELECT DISTINCT
        from_s.name as caller_name,
        from_s.qualified_name as caller_qualified_name,
        from_s.file_path,
        from_s.line,
        from_s.kind,
        sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
      WHERE sr.to_symbol_id = ?
        AND sr.relationship_type IN ('calls', 'uses')
      ORDER BY from_s.file_path, from_s.line
    `).all(targetSymbol.id) as any[];
    
    // Find indirect callers (who calls the direct callers)
    const indirectCallers = [];
    const seenCallers = new Set<string>();
    
    for (const directCaller of directCallers) {
      const callersOfCaller = this.db.prepare(`
        SELECT DISTINCT
          from_s.name as caller_name,
          from_s.qualified_name as caller_qualified_name,
          from_s.file_path,
          from_s.line,
          from_s.kind
        FROM symbol_relationships sr
        JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
        JOIN enhanced_symbols to_s ON sr.to_symbol_id = to_s.id
        WHERE to_s.qualified_name = ?
          AND sr.relationship_type IN ('calls', 'uses')
          AND from_s.qualified_name != ?
        LIMIT 10
      `).all(directCaller.caller_qualified_name, targetSymbol.qualified_name) as any[];
      
      for (const indirect of callersOfCaller) {
        const key = `${indirect.caller_qualified_name}:${indirect.file_path}:${indirect.line}`;
        if (!seenCallers.has(key)) {
          seenCallers.add(key);
          indirectCallers.push({
            ...indirect,
            via: directCaller.caller_qualified_name
          });
        }
      }
    }
    
    // Find test coverage
    const testCoverage = directCallers
      .filter(c => c.file_path.includes('test') || c.file_path.includes('Test'))
      .map(c => ({
        test_name: c.caller_name,
        test_file: c.file_path,
        test_line: c.line
      }));
    
    return {
      symbol: targetSymbol.qualified_name,
      found: true,
      location: `${targetSymbol.file_path}:${targetSymbol.line}`,
      direct_callers: directCallers.map(c => ({
        name: c.caller_qualified_name,
        location: `${c.file_path}:${c.line}`,
        type: c.kind,
        relationship: c.relationship_type
      })),
      indirect_callers: indirectCallers.slice(0, 20).map(c => ({
        name: c.caller_qualified_name,
        location: `${c.file_path}:${c.line}`,
        type: c.kind,
        via: c.via
      })),
      test_coverage: testCoverage,
      summary: {
        total_direct_callers: directCallers.length,
        total_indirect_callers: indirectCallers.length,
        test_count: testCoverage.length,
        is_tested: testCoverage.length > 0
      }
    };
  }

  /**
   * Check if it's safe to inline a function/method
   */
  async checkInlineSafety(symbolName: string): Promise<any> {
    // Find the symbol
    const symbol = this.db.prepare(`
      SELECT id, name, qualified_name, kind, signature, complexity, file_path, line
      FROM enhanced_symbols
      WHERE (name = ? OR qualified_name = ?) AND kind IN ('function', 'method')
      LIMIT 1
    `).get(symbolName, symbolName) as any;
    
    if (!symbol) {
      return {
        symbol: symbolName,
        found: false,
        is_safe: false,
        reasons: ['Symbol not found']
      };
    }
    
    // Get callers count
    const callerCount = this.db.prepare(`
      SELECT COUNT(DISTINCT from_symbol_id) as count
      FROM symbol_relationships
      WHERE to_symbol_id = ? AND relationship_type = 'calls'
    `).get(symbol.id) as any;
    
    // Check for side effects (calls to other functions)
    const callsOut = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM symbol_relationships
      WHERE from_symbol_id = ? AND relationship_type = 'calls'
    `).get(symbol.id) as any;
    
    // Check if it's virtual or overridden
    const isVirtual = symbol.signature?.includes('virtual') || false;
    
    // Check if it's recursive
    const isRecursive = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM symbol_relationships
      WHERE from_symbol_id = ? AND to_symbol_id = ? AND relationship_type = 'calls'
    `).get(symbol.id, symbol.id) as any;
    
    const reasons = [];
    const warnings = [];
    let isSafe = true;
    
    // Safety checks
    if (callerCount.count === 0) {
      warnings.push('Function is not called anywhere - consider removing instead');
    } else if (callerCount.count === 1) {
      reasons.push('Single call site - ideal for inlining');
    } else if (callerCount.count > 10) {
      isSafe = false;
      reasons.push(`Called from ${callerCount.count} locations - too many to inline efficiently`);
    }
    
    if (symbol.complexity > 10) {
      isSafe = false;
      reasons.push(`High complexity (${symbol.complexity}) - would make calling code harder to understand`);
    }
    
    if (isVirtual) {
      isSafe = false;
      reasons.push('Virtual function - cannot be inlined due to polymorphism');
    }
    
    if (isRecursive.count > 0) {
      isSafe = false;
      reasons.push('Recursive function - cannot be inlined');
    }
    
    if (callsOut.count > 5) {
      warnings.push(`Makes ${callsOut.count} function calls - consider the increased code size`);
    }
    
    // Get all call sites for preview
    const callSites = this.db.prepare(`
      SELECT 
        from_s.qualified_name as caller,
        from_s.file_path,
        from_s.line
      FROM symbol_relationships sr
      JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
      WHERE sr.to_symbol_id = ? AND sr.relationship_type = 'calls'
      LIMIT 10
    `).all(symbol.id) as any[];
    
    return {
      symbol: symbol.qualified_name,
      found: true,
      is_safe: isSafe,
      reasons: reasons,
      warnings: warnings,
      side_effects: {
        makes_calls: callsOut.count > 0,
        call_count: callsOut.count,
        is_recursive: isRecursive.count > 0,
        is_virtual: isVirtual
      },
      metrics: {
        complexity: symbol.complexity || 0,
        call_sites: callerCount.count,
        size_estimate: symbol.signature?.length || 0
      },
      call_sites: callSites.map(cs => ({
        caller: cs.caller,
        location: `${cs.file_path}:${cs.line}`
      })),
      recommendation: isSafe ? 
        (callerCount.count === 1 ? 'RECOMMENDED: Single call site makes this ideal for inlining' :
         callerCount.count <= 3 ? 'SAFE: Low number of call sites' :
         'PROCEED WITH CAUTION: Multiple call sites will increase code size') :
        'NOT RECOMMENDED: ' + reasons.filter(r => r.includes('cannot') || r.includes('too many')).join('; ')
    };
  }

  /**
   * Analyze the impact of renaming a symbol
   */
  async analyzeRename(oldName: string, newName: string): Promise<any> {
    // Find all symbols matching the old name
    const symbols = this.db.prepare(`
      SELECT id, name, qualified_name, kind, file_path, line, parent_class
      FROM enhanced_symbols
      WHERE name = ? OR qualified_name = ? OR qualified_name LIKE ?
    `).all(oldName, oldName, `%::${oldName}`) as any[];
    
    if (symbols.length === 0) {
      return {
        old_name: oldName,
        new_name: newName,
        found: false,
        files_affected: 0,
        locations_affected: 0,
        potential_conflicts: [],
        suggested_approach: 'Symbol not found - no rename needed'
      };
    }
    
    // Check for naming conflicts with new name
    const conflicts = this.db.prepare(`
      SELECT name, qualified_name, kind, file_path
      FROM enhanced_symbols
      WHERE name = ? OR qualified_name = ? OR qualified_name LIKE ?
    `).all(newName, newName, `%::${newName}`) as any[];
    
    // Get all references to the symbols
    const allReferences = new Set<string>();
    const fileSet = new Set<string>();
    
    for (const symbol of symbols) {
      // Add definition location
      allReferences.add(`${symbol.file_path}:${symbol.line}`);
      fileSet.add(symbol.file_path);
      
      // Find all places that reference this symbol
      const references = this.db.prepare(`
        SELECT DISTINCT
          from_s.file_path,
          from_s.line
        FROM symbol_relationships sr
        JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
        WHERE sr.to_symbol_id = ?
      `).all(symbol.id) as any[];
      
      for (const ref of references) {
        allReferences.add(`${ref.file_path}:${ref.line}`);
        fileSet.add(ref.file_path);
      }
    }
    
    // Categorize the rename complexity
    let complexity = 'SIMPLE';
    let approach = 'Direct find and replace';
    
    if (symbols.some(s => s.kind === 'class' || s.kind === 'struct')) {
      complexity = 'MODERATE';
      approach = 'Update class/struct definitions and all usages';
    }
    
    if (symbols.some(s => s.parent_class)) {
      complexity = 'COMPLEX';
      approach = 'Member rename - ensure all class instances are updated';
    }
    
    if (conflicts.length > 0) {
      complexity = 'HIGH_RISK';
      approach = 'Name conflict detected - consider namespacing or different name';
    }
    
    // Check if it affects public API
    const affectsAPI = symbols.some(s => 
      s.file_path.includes('.h') || 
      s.file_path.includes('.hpp') ||
      s.file_path.includes('.ixx')
    );
    
    return {
      old_name: oldName,
      new_name: newName,
      found: true,
      files_affected: fileSet.size,
      locations_affected: allReferences.size,
      complexity: complexity,
      affects_public_api: affectsAPI,
      potential_conflicts: conflicts.map(c => ({
        name: c.qualified_name,
        kind: c.kind,
        file: c.file_path,
        severity: c.kind === symbols[0]?.kind ? 'HIGH' : 'MEDIUM'
      })),
      symbol_types: [...new Set(symbols.map(s => s.kind))],
      suggested_approach: approach,
      warnings: [
        ...(affectsAPI ? ['Affects public API - external users may be impacted'] : []),
        ...(conflicts.length > 0 ? [`Name '${newName}' already exists in ${conflicts.length} places`] : []),
        ...(fileSet.size > 20 ? ['Large number of files affected - consider incremental approach'] : [])
      ],
      affected_files: Array.from(fileSet).slice(0, 20).sort(),
      refactoring_steps: [
        'Update all declarations',
        'Update all references',
        ...(affectsAPI ? ['Update documentation', 'Notify API consumers'] : []),
        'Run tests to verify',
        'Update any string references in configs/comments'
      ]
    };
  }

  close(): void {
    this.db.close();
  }
}