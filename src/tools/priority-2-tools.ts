import Database from 'better-sqlite3';
import * as path from 'path';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';
import {
  ApiSurfaceRequest,
  ApiSurfaceResponse,
  UsageExampleRequest,
  UsageExampleResponse,
  ImpactAnalysisRequest,
  ImpactAnalysisResponse,
  MethodInfo,
  UsageExample
} from '../types/essential-features.js';

export class Priority2Tools {
  private db: Database.Database;

  constructor(dbPathOrDatabase: string | Database.Database) {
    if (typeof dbPathOrDatabase === 'string') {
      // Legacy mode: create our own database connection
      this.db = new Database(dbPathOrDatabase);
      // Initialize unified schema
      const schemaManager = UnifiedSchemaManager.getInstance();
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
      SELECT name, signature, return_type, parent_class, namespace, file_path, kind
      FROM enhanced_symbols 
      WHERE file_path LIKE ? 
        AND kind IN ('function', 'method')
        AND parser_confidence > 0.5
      ORDER BY parent_class, name
    `).all(`%${request.module}%`) as Array<any>;

    const public_methods: MethodInfo[] = methods.map((m: any) => ({
      name: m.name,
      params: this.parseSignatureParams(m.signature || ''),
      returns: m.return_type || 'void',
      description: this.generateMethodDescription(m)
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

    // Get public members (simplified - would need enhanced parser)
    const public_members: any[] = [];

    return {
      public_methods,
      public_members,
      interfaces,
      dependencies: {
        required: required,
        optional: optionalFiltered
      }
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

  close(): void {
    this.db.close();
  }
}