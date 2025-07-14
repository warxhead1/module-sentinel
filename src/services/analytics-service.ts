import Database from 'better-sqlite3';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';
import { SymbolGraphService } from './symbol-graph-service.js';
import { PipelineStage } from '../types/index.js';
import * as path from 'path';

interface CodeQualityScore {
  overall: number;
  complexity: number;
  maintainability: number;
  testability: number;
  documentation: number;
  confidence: number;
  details: {
    totalSymbols: number;
    highConfidenceSymbols: number;
    antipatternCount: number;
    duplicateCodeRatio: number;
    averageComplexity: number;
  };
}

interface TechnicalDebtAssessment {
  totalDebtScore: number;
  debtByCategory: {
    antipatterns: number;
    complexity: number;
    duplication: number;
    poorParsing: number;
    lackOfDocumentation: number;
  };
  criticalIssues: Array<{
    type: string;
    location: string;
    severity: string;
    estimatedEffort: number;
    suggestion: string;
  }>;
  estimatedRefactoringHours: number;
}

interface ParserCoverageAnalysis {
  overallCoverage: number;
  filesCovered: number;
  totalFiles: number;
  parserBreakdown: {
    clang: { files: number; symbols: number; avgConfidence: number };
    treeSitter: { files: number; symbols: number; avgConfidence: number };
    streaming: { files: number; symbols: number; avgConfidence: number };
  };
  poorlyParsedFiles: Array<{
    path: string;
    bestConfidence: number;
    bestParser: string;
    issues: string[];
  }>;
  recommendations: string[];
}

interface ModuleCouplingMetrics {
  modules: Array<{
    path: string;
    cohesion: number;
    coupling: number;
    afferentCoupling: number;  // dependencies on this module
    efferentCoupling: number;  // dependencies from this module
    instability: number;       // efferent / (efferent + afferent)
    abstractness: number;      // abstract types / total types
    mainSequenceDistance: number; // distance from ideal line
  }>;
  averageCoupling: number;
  highCouplingModules: string[];
  recommendations: Array<{
    module: string;
    issue: string;
    suggestion: string;
  }>;
}

interface PipelineHealthScore {
  stages: Record<PipelineStage, {
    health: number;
    moduleCount: number;
    avgQuality: number;
    avgComplexity: number;
    criticalIssues: number;
    antipatterns: number;
  }>;
  overallHealth: number;
  bottlenecks: Array<{
    stage: PipelineStage;
    issue: string;
    impact: string;
    suggestion: string;
  }>;
}

interface SymbolRelationshipAnalysis {
  graphComplexity: number;
  architecturalHealth: number;
  moduleInterconnectedness: number;
  criticalComponents: Array<{
    name: string;
    type: string;
    importance: number;
    riskLevel: 'low' | 'medium' | 'high';
    reason: string;
  }>;
  dependencyCycles: Array<{
    modules: string[];
    severity: number;
    suggestion: string;
  }>;
  recommendations: Array<{
    type: string;
    target: string;
    suggestion: string;
    impact: string;
  }>;
}

interface DuplicationAnalysis {
  overallDuplication: number;
  duplicateHotspots: Array<{
    file: string;
    duplicateCount: number;
    totalTokens: number;
    avgSimilarity: number;
  }>;
  duplicateCategories: {
    exact: number;
    renamed: number;
    modified: number;
    semantic: number;
  };
  impactAssessment: {
    maintenanceOverhead: number;
    bugPropagationRisk: number;
    refactoringPotential: number;
  };
  recommendations: Array<{
    files: string[];
    duplicateType: string;
    suggestion: string;
    estimatedEffort: number;
  }>;
}

interface AnalyticsCache {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
}

export class AnalyticsService {
  private db: Database.Database;
  private schemaManager: UnifiedSchemaManager;
  private symbolGraphService: SymbolGraphService;
  private cache: Map<string, AnalyticsCache> = new Map();
  private readonly MIN_CONFIDENCE = 0.7;
  private readonly CACHE_TTL = 300000; // 5 minutes default

  constructor(dbPathOrDatabase: string | Database.Database) {
    if (typeof dbPathOrDatabase === 'string') {
      // Legacy mode: create our own database connection
      this.db = new Database(dbPathOrDatabase);
      this.symbolGraphService = new SymbolGraphService(dbPathOrDatabase);
      this.schemaManager = UnifiedSchemaManager.getInstance();
      this.schemaManager.initializeDatabase(this.db);
      this.initializeAnalyticsTables();
    } else {
      // New mode: use existing database (schema already initialized)
      this.db = dbPathOrDatabase;
      this.symbolGraphService = new SymbolGraphService(this.db.name || 'unknown');
      this.schemaManager = UnifiedSchemaManager.getInstance();
      // Don't call initializeDatabase() - assume it's already done
      // Don't call initializeAnalyticsTables() - UnifiedSchemaManager handles this
    }
  }

  private initializeAnalyticsTables(): void {
    // Tables are created by UnifiedSchemaManager, just add analytics triggers
    this.db.exec(`
      -- Triggers to maintain analytics tables
      CREATE TRIGGER IF NOT EXISTS update_symbol_quality
      AFTER INSERT ON enhanced_symbols
      BEGIN
        INSERT OR REPLACE INTO analytics_symbol_quality (
          file_path,
          total_symbols,
          high_confidence_symbols,
          avg_confidence,
          avg_complexity
        )
        SELECT 
          file_path,
          COUNT(*) as total_symbols,
          SUM(CASE WHEN parser_confidence > 0.7 THEN 1 ELSE 0 END) as high_confidence_symbols,
          AVG(parser_confidence) as avg_confidence,
          AVG(complexity) as avg_complexity
        FROM enhanced_symbols
        WHERE file_path = NEW.file_path
        GROUP BY file_path;
      END;
    `);
  }

  /**
   * Calculate comprehensive code quality score
   */
  async calculateCodeQualityScore(
    scope: 'file' | 'module' | 'stage' | 'project',
    target?: string
  ): Promise<CodeQualityScore> {
    const cacheKey = `quality_${scope}_${target || 'all'}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    let whereClause = 'WHERE parser_confidence > ?';
    const params: any[] = [this.MIN_CONFIDENCE];
    
    if (scope === 'file' && target) {
      whereClause += ' AND file_path = ?';
      params.push(target);
    } else if (scope === 'module' && target) {
      whereClause += ' AND file_path LIKE ?';
      params.push(`${target}%`);
    } else if (scope === 'stage' && target) {
      whereClause += ' AND pipeline_stage = ?';
      params.push(target);
    }

    // Get symbol statistics
    const symbolStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_symbols,
        SUM(CASE WHEN parser_confidence > ${this.MIN_CONFIDENCE} THEN 1 ELSE 0 END) as high_confidence_symbols,
        AVG(complexity) as avg_complexity,
        AVG(parser_confidence) as avg_confidence
      FROM enhanced_symbols
      ${whereClause}
    `).get(...params) as any;

    // Get antipattern count
    let antipatternQuery = 'SELECT COUNT(DISTINCT a.id) as count FROM antipatterns a';
    let antipatternParams: any[] = [];
    
    if (scope === 'file' && target) {
      antipatternQuery += ' WHERE a.file_path = ?';
      antipatternParams = [target];
    } else if (scope === 'module' && target) {
      antipatternQuery += ' WHERE a.file_path LIKE ?';
      antipatternParams = [`${target}%`];
    } else if (scope === 'stage' && target) {
      antipatternQuery += ' JOIN enhanced_symbols s ON a.file_path = s.file_path WHERE s.pipeline_stage = ?';
      antipatternParams = [target];
    }
    
    const antipatternCount = this.db.prepare(antipatternQuery).get(...antipatternParams) as any;

    // Get duplication metrics
    let duplicationQuery = `
      SELECT 
        COUNT(*) as duplicate_count,
        AVG(similarity_score) as avg_similarity
      FROM code_duplicates
      WHERE similarity_score > 0.8`;
    let duplicationParams: any[] = [];
    
    if (scope === 'file' && target) {
      duplicationQuery += ' AND (file1_path = ? OR file2_path = ?)';
      duplicationParams = [target, target];
    } else if (scope === 'module' && target) {
      duplicationQuery += ' AND (file1_path LIKE ? OR file2_path LIKE ?)';
      duplicationParams = [`${target}%`, `${target}%`];
    }
    
    const duplicationStats = this.db.prepare(duplicationQuery).get(...duplicationParams) as any;

    // Calculate scores
    const complexityScore = Math.max(0, 100 - (symbolStats.avg_complexity || 0) * 2);
    const maintainabilityScore = 100 * (symbolStats.high_confidence_symbols / Math.max(1, symbolStats.total_symbols));
    const testabilityScore = Math.max(0, 100 - antipatternCount.count * 5);
    const documentationScore = symbolStats.avg_confidence * 100;

    const duplicateRatio = duplicationStats.duplicate_count / Math.max(1, symbolStats.total_symbols);
    const overallScore = (
      complexityScore * 0.25 +
      maintainabilityScore * 0.25 +
      testabilityScore * 0.25 +
      documentationScore * 0.25
    ) * (1 - duplicateRatio * 0.5);

    const result: CodeQualityScore = {
      overall: Math.round(overallScore),
      complexity: Math.round(complexityScore),
      maintainability: Math.round(maintainabilityScore),
      testability: Math.round(testabilityScore),
      documentation: Math.round(documentationScore),
      confidence: symbolStats.avg_confidence || 0,
      details: {
        totalSymbols: symbolStats.total_symbols || 0,
        highConfidenceSymbols: symbolStats.high_confidence_symbols || 0,
        antipatternCount: antipatternCount.count || 0,
        duplicateCodeRatio: duplicateRatio,
        averageComplexity: symbolStats.avg_complexity || 0
      }
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Assess technical debt across the codebase
   */
  async assessTechnicalDebt(scope: 'file' | 'module' | 'project', target?: string): Promise<TechnicalDebtAssessment> {
    const cacheKey = `debt_${scope}_${target || 'all'}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Get antipatterns with severity
    let antipatternsQuery = `
      SELECT pattern_name, severity, file_path, line_start, suggestion, confidence
      FROM antipatterns
      WHERE confidence > 0.5`;
    let antipatternsParams: any[] = [];
    
    if (scope === 'file' && target) {
      antipatternsQuery += ' AND file_path = ?';
      antipatternsParams = [target];
    } else if (scope === 'module' && target) {
      antipatternsQuery += ' AND file_path LIKE ?';
      antipatternsParams = [`${target}%`];
    }
    
    antipatternsQuery += `
      ORDER BY 
        CASE severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END`;
    
    const antipatterns = this.db.prepare(antipatternsQuery).all(...antipatternsParams) as any[];

    // Get complexity issues
    let complexityQuery = `
      SELECT name, file_path, line, complexity, parser_confidence
      FROM enhanced_symbols
      WHERE complexity > 10 AND parser_confidence > ${this.MIN_CONFIDENCE}`;
    let complexityParams: any[] = [];
    
    if (scope === 'file' && target) {
      complexityQuery += ' AND file_path = ?';
      complexityParams = [target];
    } else if (scope === 'module' && target) {
      complexityQuery += ' AND file_path LIKE ?';
      complexityParams = [`${target}%`];
    }
    
    complexityQuery += ' ORDER BY complexity DESC';
    
    const complexityIssues = this.db.prepare(complexityQuery).all(...complexityParams) as any[];

    // Get duplication issues
    let duplicationIssuesQuery = `
      SELECT 
        file1_path, file1_start, file1_end,
        file2_path, file2_start, file2_end,
        similarity_score, token_count
      FROM code_duplicates
      WHERE similarity_score > 0.8`;
    let duplicationIssuesParams: any[] = [];
    
    if (scope === 'file' && target) {
      duplicationIssuesQuery += ' AND (file1_path = ? OR file2_path = ?)';
      duplicationIssuesParams = [target, target];
    } else if (scope === 'module' && target) {
      duplicationIssuesQuery += ' AND (file1_path LIKE ? OR file2_path LIKE ?)';
      duplicationIssuesParams = [`${target}%`, `${target}%`];
    }
    
    duplicationIssuesQuery += ' ORDER BY token_count DESC';
    
    const duplicationIssues = this.db.prepare(duplicationIssuesQuery).all(...duplicationIssuesParams) as any[];

    // Get poor parsing coverage
    let poorParsingQuery = `
      SELECT path, best_confidence, best_parser
      FROM indexed_files
      WHERE best_confidence < ${this.MIN_CONFIDENCE}`;
    let poorParsingParams: any[] = [];
    
    if (scope === 'file' && target) {
      poorParsingQuery += ' AND path = ?';
      poorParsingParams = [target];
    } else if (scope === 'module' && target) {
      poorParsingQuery += ' AND path LIKE ?';
      poorParsingParams = [`${target}%`];
    }
    
    const poorParsingFiles = this.db.prepare(poorParsingQuery).all(...poorParsingParams) as any[];

    // Calculate debt scores
    const antipatternDebt = antipatterns.reduce((sum, ap) => {
      const severityScore = ap.severity === 'critical' ? 10 : 
                           ap.severity === 'high' ? 5 : 
                           ap.severity === 'medium' ? 2 : 1;
      return sum + severityScore;
    }, 0);

    const complexityDebt = complexityIssues.reduce((sum, issue) => 
      sum + Math.max(0, (issue.complexity - 10) * 0.5), 0
    );

    const duplicationDebt = duplicationIssues.reduce((sum, dup) => 
      sum + (dup.token_count / 100), 0
    );

    const poorParsingDebt = poorParsingFiles.length * 3;

    // Create critical issues list
    const criticalIssues = [
      ...antipatterns.filter(ap => ap.severity === 'critical' || ap.severity === 'high').map(ap => ({
        type: 'antipattern',
        location: `${ap.file_path}:${ap.line_start}`,
        severity: ap.severity,
        estimatedEffort: ap.severity === 'critical' ? 4 : 2,
        suggestion: ap.suggestion || 'Refactor to remove antipattern'
      })),
      ...complexityIssues.slice(0, 5).map(issue => ({
        type: 'complexity',
        location: `${issue.file_path}:${issue.line}`,
        severity: issue.complexity > 20 ? 'high' : 'medium',
        estimatedEffort: Math.ceil(issue.complexity / 10),
        suggestion: `Refactor ${issue.name} to reduce complexity from ${issue.complexity}`
      })),
      ...duplicationIssues.slice(0, 3).map(dup => ({
        type: 'duplication',
        location: `${dup.file1_path}:${dup.file1_start}-${dup.file1_end}`,
        severity: 'medium',
        estimatedEffort: Math.ceil(dup.token_count / 50),
        suggestion: `Extract duplicated code (${dup.token_count} tokens) into shared function`
      }))
    ];

    const totalDebt = antipatternDebt + complexityDebt + duplicationDebt + poorParsingDebt;
    const estimatedHours = Math.ceil(totalDebt / 5); // Rough estimate

    const result: TechnicalDebtAssessment = {
      totalDebtScore: Math.round(totalDebt),
      debtByCategory: {
        antipatterns: Math.round(antipatternDebt),
        complexity: Math.round(complexityDebt),
        duplication: Math.round(duplicationDebt),
        poorParsing: Math.round(poorParsingDebt),
        lackOfDocumentation: 0 // Could be calculated from symbol signatures
      },
      criticalIssues,
      estimatedRefactoringHours: estimatedHours
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Analyze parser coverage across the codebase
   */
  async analyzeParserCoverage(): Promise<ParserCoverageAnalysis> {
    const cacheKey = 'parser_coverage_analysis';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Get overall file statistics
    const fileStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_files,
        SUM(CASE WHEN best_confidence > ${this.MIN_CONFIDENCE} THEN 1 ELSE 0 END) as well_parsed,
        AVG(best_confidence) as avg_confidence
      FROM indexed_files
    `).get() as any;

    // Get parser-specific statistics
    const parserStats = {
      clang: this.db.prepare(`
        SELECT 
          COUNT(DISTINCT path) as files,
          SUM(clang_symbols) as symbols,
          AVG(CASE WHEN clang_success = 1 THEN best_confidence ELSE 0 END) as avg_confidence
        FROM indexed_files
        WHERE clang_attempted = 1
      `).get() as any,
      treeSitter: this.db.prepare(`
        SELECT 
          COUNT(DISTINCT path) as files,
          SUM(treesitter_symbols) as symbols,
          AVG(CASE WHEN treesitter_success = 1 THEN best_confidence ELSE 0 END) as avg_confidence
        FROM indexed_files
        WHERE treesitter_attempted = 1
      `).get() as any,
      streaming: this.db.prepare(`
        SELECT 
          COUNT(DISTINCT path) as files,
          SUM(streaming_symbols) as symbols,
          AVG(CASE WHEN streaming_success = 1 THEN best_confidence ELSE 0 END) as avg_confidence
        FROM indexed_files
        WHERE streaming_attempted = 1
      `).get() as any
    };

    // Get poorly parsed files
    const poorlyParsed = this.db.prepare(`
      SELECT 
        path, 
        best_confidence, 
        best_parser,
        clang_error,
        treesitter_error,
        streaming_error
      FROM indexed_files
      WHERE best_confidence < ${this.MIN_CONFIDENCE}
      ORDER BY best_confidence ASC
      LIMIT 20
    `).all() as any[];

    const poorlyParsedFiles = poorlyParsed.map(file => {
      const issues = [];
      if (file.clang_error) issues.push(`Clang: ${file.clang_error}`);
      if (file.treesitter_error) issues.push(`TreeSitter: ${file.treesitter_error}`);
      if (file.streaming_error) issues.push(`Streaming: ${file.streaming_error}`);
      
      return {
        path: file.path,
        bestConfidence: file.best_confidence,
        bestParser: file.best_parser || 'none',
        issues
      };
    });

    // Generate recommendations
    const recommendations = [];
    
    if (fileStats.avg_confidence < 0.8) {
      recommendations.push('Overall parser confidence is low. Consider updating parser configurations.');
    }
    
    if (parserStats.clang.avg_confidence < 0.7 && parserStats.clang.files > 0) {
      recommendations.push('Clang parser has low confidence. Check compile_commands.json and include paths.');
    }
    
    if (poorlyParsedFiles.length > fileStats.total_files * 0.1) {
      recommendations.push('More than 10% of files are poorly parsed. Review file encodings and C++ standards.');
    }

    const coverage = fileStats.well_parsed / fileStats.total_files;

    const result: ParserCoverageAnalysis = {
      overallCoverage: coverage,
      filesCovered: fileStats.well_parsed,
      totalFiles: fileStats.total_files,
      parserBreakdown: {
        clang: {
          files: parserStats.clang.files || 0,
          symbols: parserStats.clang.symbols || 0,
          avgConfidence: parserStats.clang.avg_confidence || 0
        },
        treeSitter: {
          files: parserStats.treeSitter.files || 0,
          symbols: parserStats.treeSitter.symbols || 0,
          avgConfidence: parserStats.treeSitter.avg_confidence || 0
        },
        streaming: {
          files: parserStats.streaming.files || 0,
          symbols: parserStats.streaming.symbols || 0,
          avgConfidence: parserStats.streaming.avg_confidence || 0
        }
      },
      poorlyParsedFiles,
      recommendations
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Calculate module coupling and cohesion metrics
   */
  async analyzeModuleCoupling(): Promise<ModuleCouplingMetrics> {
    const cacheKey = 'module_coupling_metrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // First, update module metrics
    await this.updateModuleMetrics();

    // Get all module metrics
    const modules = this.db.prepare(`
      SELECT 
        module_path,
        cohesion_score,
        coupling_score,
        afferent_coupling,
        efferent_coupling,
        instability,
        abstractness,
        main_sequence_distance
      FROM analytics_module_metrics
      ORDER BY coupling_score DESC
    `).all() as any[];

    const moduleMetrics = modules.map(m => ({
      path: m.module_path,
      cohesion: m.cohesion_score || 0,
      coupling: m.coupling_score || 0,
      afferentCoupling: m.afferent_coupling || 0,
      efferentCoupling: m.efferent_coupling || 0,
      instability: m.instability || 0,
      abstractness: m.abstractness || 0,
      mainSequenceDistance: m.main_sequence_distance || 0
    }));

    // Calculate averages
    const avgCoupling = moduleMetrics.reduce((sum, m) => sum + m.coupling, 0) / Math.max(1, moduleMetrics.length);
    
    // Identify high coupling modules (coupling > average * 1.5)
    const highCouplingThreshold = avgCoupling * 1.5;
    const highCouplingModules = moduleMetrics
      .filter(m => m.coupling > highCouplingThreshold)
      .map(m => m.path);

    // Generate recommendations
    const recommendations = moduleMetrics
      .filter(m => m.coupling > highCouplingThreshold || m.mainSequenceDistance > 0.5)
      .map(m => {
        const issues = [];
        const suggestions = [];

        if (m.coupling > highCouplingThreshold) {
          issues.push('High coupling');
          suggestions.push('Consider introducing interfaces or dependency injection');
        }

        if (m.cohesion < 0.5) {
          issues.push('Low cohesion');
          suggestions.push('Group related functionality together');
        }

        if (m.instability > 0.8 && m.abstractness < 0.2) {
          issues.push('Highly unstable concrete module');
          suggestions.push('Extract interfaces or abstract base classes');
        }

        if (m.mainSequenceDistance > 0.5) {
          issues.push('Far from main sequence');
          suggestions.push('Balance abstractness and stability');
        }

        return {
          module: m.path,
          issue: issues.join(', '),
          suggestion: suggestions.join('. ')
        };
      })
      .slice(0, 10); // Top 10 recommendations

    const result: ModuleCouplingMetrics = {
      modules: moduleMetrics,
      averageCoupling: avgCoupling,
      highCouplingModules,
      recommendations
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Calculate pipeline stage health scores
   */
  async analyzePipelineHealth(): Promise<PipelineHealthScore> {
    const cacheKey = 'pipeline_health_score';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const stages: Record<PipelineStage, any> = {} as any;
    const allStages = Object.values(PipelineStage);

    // Analyze each pipeline stage
    for (const stage of allStages) {
      const stageStats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT m.path) as module_count,
          AVG(m.complexity_score) as avg_complexity,
          COUNT(DISTINCT a.id) as antipattern_count,
          COUNT(CASE WHEN a.severity IN ('critical', 'high') THEN 1 END) as critical_issues
        FROM modules m
        LEFT JOIN antipatterns a ON a.file_path LIKE m.path || '%'
        WHERE m.pipeline_stage = ?
        GROUP BY m.pipeline_stage
      `).get(stage) as any;

      const qualityScore = await this.calculateCodeQualityScore('stage', stage);

      stages[stage] = {
        health: qualityScore.overall,
        moduleCount: stageStats?.module_count || 0,
        avgQuality: qualityScore.overall,
        avgComplexity: stageStats?.avg_complexity || 0,
        criticalIssues: stageStats?.critical_issues || 0,
        antipatterns: stageStats?.antipattern_count || 0
      };
    }

    // Calculate overall health
    const stageHealthValues = Object.values(stages).map(s => s.health);
    const overallHealth = stageHealthValues.reduce((sum, h) => sum + h, 0) / stageHealthValues.length;

    // Identify bottlenecks
    const bottlenecks = [];
    
    for (const [stageName, stageData] of Object.entries(stages)) {
      if (stageData.health < 70) {
        bottlenecks.push({
          stage: stageName as PipelineStage,
          issue: `Low health score: ${stageData.health}`,
          impact: 'May cause performance issues or bugs in pipeline',
          suggestion: 'Review and refactor modules in this stage'
        });
      }

      if (stageData.criticalIssues > 0) {
        bottlenecks.push({
          stage: stageName as PipelineStage,
          issue: `${stageData.criticalIssues} critical issues found`,
          impact: 'High risk of failures or incorrect behavior',
          suggestion: 'Address critical antipatterns and complexity issues immediately'
        });
      }

      if (stageData.avgComplexity > 15) {
        bottlenecks.push({
          stage: stageName as PipelineStage,
          issue: `High average complexity: ${stageData.avgComplexity}`,
          impact: 'Difficult to maintain and debug',
          suggestion: 'Break down complex functions into smaller units'
        });
      }
    }

    const result: PipelineHealthScore = {
      stages: stages as any,
      overallHealth,
      bottlenecks
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Update module metrics (helper method)
   */
  private async updateModuleMetrics(): Promise<void> {
    const modules = this.db.prepare(`
      SELECT path, relative_path, pipeline_stage, dependencies, imports, exports
      FROM modules
    `).all() as any[];

    for (const module of modules) {
      // Calculate afferent coupling (modules that depend on this one)
      const afferent = this.db.prepare(`
        SELECT COUNT(DISTINCT m2.path) as count
        FROM modules m2
        WHERE m2.dependencies LIKE '%' || ? || '%'
        AND m2.path != ?
      `).get(module.relative_path, module.path) as any;

      // Calculate efferent coupling (modules this one depends on)
      const dependencies = JSON.parse(module.dependencies || '[]');
      const efferent = dependencies.length;

      // Calculate abstractness (interfaces and abstract classes / total types)
      const abstractTypes = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM enhanced_symbols
        WHERE file_path LIKE ? || '%'
        AND kind IN ('interface', 'abstract_class', 'pure_virtual')
        AND parser_confidence > ${this.MIN_CONFIDENCE}
      `).get(module.path) as any;

      const totalTypes = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM enhanced_symbols
        WHERE file_path LIKE ? || '%'
        AND kind IN ('class', 'struct', 'interface', 'abstract_class')
        AND parser_confidence > ${this.MIN_CONFIDENCE}
      `).get(module.path) as any;

      const abstractness = totalTypes.count > 0 ? abstractTypes.count / totalTypes.count : 0;

      // Calculate instability I = Ce / (Ca + Ce)
      const totalCoupling = afferent.count + efferent;
      const instability = totalCoupling > 0 ? efferent / totalCoupling : 0;

      // Calculate main sequence distance |A + I - 1|
      const mainSequenceDistance = Math.abs(abstractness + instability - 1);

      // Calculate cohesion (simplified: ratio of internal connections to total connections)
      const internalConnections = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM symbol_relationships sr
        JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
        JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
        WHERE s1.file_path LIKE ? || '%'
        AND s2.file_path LIKE ? || '%'
      `).get(module.path, module.path) as any;

      const totalConnections = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM symbol_relationships sr
        JOIN enhanced_symbols s ON sr.from_symbol_id = s.id
        WHERE s.file_path LIKE ? || '%'
      `).get(module.path) as any;

      const cohesion = totalConnections.count > 0 ? internalConnections.count / totalConnections.count : 1;

      // Update metrics
      this.db.prepare(`
        INSERT OR REPLACE INTO analytics_module_metrics (
          module_path, cohesion_score, coupling_score,
          afferent_coupling, efferent_coupling,
          instability, abstractness, main_sequence_distance,
          health_score, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `).run(
        module.path,
        cohesion,
        (afferent.count + efferent) / 10, // Normalized coupling score
        afferent.count,
        efferent,
        instability,
        abstractness,
        mainSequenceDistance,
        (1 - mainSequenceDistance) * 100 // Simple health score
      );
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(format: 'json' | 'csv', includeRawData: boolean = false): Promise<string> {
    const analytics = {
      timestamp: new Date().toISOString(),
      summary: {
        codeQuality: await this.calculateCodeQualityScore('project'),
        technicalDebt: await this.assessTechnicalDebt('project'),
        parserCoverage: await this.analyzeParserCoverage(),
        moduleCoupling: await this.analyzeModuleCoupling(),
        pipelineHealth: await this.analyzePipelineHealth()
      }
    };

    if (includeRawData) {
      // Add raw data for detailed analysis
      (analytics as any).rawData = {
        symbols: this.db.prepare(`
          SELECT * FROM enhanced_symbols 
          WHERE parser_confidence > ${this.MIN_CONFIDENCE}
          LIMIT 1000
        `).all(),
        antipatterns: this.db.prepare(`
          SELECT * FROM antipatterns 
          ORDER BY severity, confidence DESC
          LIMIT 100
        `).all(),
        modules: this.db.prepare(`
          SELECT * FROM modules
        `).all()
      };
    }

    if (format === 'json') {
      return JSON.stringify(analytics, null, 2);
    } else {
      // CSV format - flatten the summary data
      const rows = [
        ['Metric', 'Value'],
        ['Overall Code Quality', analytics.summary.codeQuality.overall],
        ['Technical Debt Score', analytics.summary.technicalDebt.totalDebtScore],
        ['Parser Coverage', Math.round(analytics.summary.parserCoverage.overallCoverage * 100) + '%'],
        ['Average Module Coupling', analytics.summary.moduleCoupling.averageCoupling.toFixed(2)],
        ['Pipeline Health', analytics.summary.pipelineHealth.overallHealth.toFixed(1)]
      ];

      return rows.map(row => row.join(',')).join('\n');
    }
  }

  /**
   * Cache management
   */
  private getCached(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.value;
    }
    
    // Also check database cache for persistence
    const dbCached = this.db.prepare(`
      SELECT cache_value FROM analytics_cache
      WHERE cache_key = ? AND expires_at > strftime('%s', 'now')
    `).get(key) as any;
    
    if (dbCached) {
      const value = JSON.parse(dbCached.cache_value);
      this.cache.set(key, { key, value, timestamp: Date.now(), ttl: this.CACHE_TTL });
      return value;
    }
    
    return null;
  }

  private setCached(key: string, value: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, { key, value, timestamp: Date.now(), ttl });
    
    // Also persist to database
    const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(ttl / 1000);
    this.db.prepare(`
      INSERT OR REPLACE INTO analytics_cache (cache_key, cache_value, created_at, expires_at)
      VALUES (?, ?, strftime('%s', 'now'), ?)
    `).run(key, JSON.stringify(value), expiresAt);
  }

  /**
   * Analyze symbol relationships and architecture
   */
  async analyzeSymbolRelationships(scope: 'project' | 'module' | 'stage', target?: string): Promise<SymbolRelationshipAnalysis> {
    const cacheKey = `symbol_relationships_${scope}_${target || 'all'}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Generate architecture visualization
    const archViz = await this.symbolGraphService.generateArchitectureVisualization(scope, target);
    
    // Analyze dependency coupling
    const coupling = await this.symbolGraphService.analyzeDependencyCoupling();
    
    // Find critical paths
    const criticalPaths = await this.symbolGraphService.findCriticalPaths();
    
    // Calculate graph complexity metrics
    const graph = archViz.graphData;
    const graphComplexity = Math.min(1, graph.metrics.density * graph.metrics.totalNodes / 100);
    
    // Calculate architectural health
    const architecturalHealth = (
      archViz.quality.maintainability +
      archViz.quality.modularity +
      (1 - archViz.quality.coupling) +
      (1 - archViz.quality.complexity)
    ) / 4;
    
    // Calculate module interconnectedness
    const moduleInterconnectedness = coupling.modules.reduce((sum, m) => 
      sum + (m.fanIn + m.fanOut), 0
    ) / Math.max(1, coupling.modules.length);
    
    // Identify critical components
    const criticalComponents = graph.nodes
      .filter(n => n.metadata.importance > 0.7)
      .map(node => ({
        name: node.name,
        type: node.type,
        importance: node.metadata.importance,
        riskLevel: node.complexity > 20 ? 'high' as const :
                  node.complexity > 10 ? 'medium' as const : 'low' as const,
        reason: `High importance (${node.metadata.importance.toFixed(2)}) with ${node.metadata.connections} connections`
      }))
      .slice(0, 10);

    const result: SymbolRelationshipAnalysis = {
      graphComplexity,
      architecturalHealth,
      moduleInterconnectedness: moduleInterconnectedness / 10, // Normalize
      criticalComponents,
      dependencyCycles: coupling.cycles,
      recommendations: archViz.recommendations.map(rec => ({
        type: rec.type,
        target: rec.target,
        suggestion: rec.suggestion,
        impact: rec.impact
      }))
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Analyze code duplication impact
   */
  async analyzeDuplicationImpact(): Promise<DuplicationAnalysis> {
    const cacheKey = 'duplication_analysis';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Get duplication statistics
    const duplicateStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_duplicates,
        AVG(similarity_score) as avg_similarity,
        SUM(token_count) as total_tokens
      FROM code_duplicates
      WHERE similarity_score > 0.8
    `).get() as any;

    // Get duplication by type
    const typeStats = this.db.prepare(`
      SELECT 
        duplicate_type,
        COUNT(*) as count,
        AVG(similarity_score) as avg_similarity
      FROM code_duplicates
      WHERE similarity_score > 0.8
      GROUP BY duplicate_type
    `).all() as any[];

    // Get hotspot files
    const hotspots = this.db.prepare(`
      SELECT 
        file1_path as file,
        COUNT(*) as duplicate_count,
        SUM(token_count) as total_tokens,
        AVG(similarity_score) as avg_similarity
      FROM code_duplicates
      WHERE similarity_score > 0.8
      GROUP BY file1_path
      UNION
      SELECT 
        file2_path as file,
        COUNT(*) as duplicate_count,
        SUM(token_count) as total_tokens,
        AVG(similarity_score) as avg_similarity
      FROM code_duplicates
      WHERE similarity_score > 0.8
      GROUP BY file2_path
      ORDER BY duplicate_count DESC
      LIMIT 10
    `).all() as any[];

    // Calculate categories
    const categories = {
      exact: typeStats.find(t => t.duplicate_type === 1)?.count || 0,
      renamed: typeStats.find(t => t.duplicate_type === 2)?.count || 0,
      modified: typeStats.find(t => t.duplicate_type === 3)?.count || 0,
      semantic: typeStats.find(t => t.duplicate_type === 4)?.count || 0
    };

    // Calculate impact metrics
    const totalSymbols = this.db.prepare(`
      SELECT COUNT(*) as count FROM enhanced_symbols
      WHERE parser_confidence > ${this.MIN_CONFIDENCE}
    `).get() as any;

    const overallDuplication = duplicateStats.total_duplicates / Math.max(1, totalSymbols.count);
    
    const impactAssessment = {
      maintenanceOverhead: Math.min(1, overallDuplication * 2),
      bugPropagationRisk: Math.min(1, duplicateStats.avg_similarity * overallDuplication),
      refactoringPotential: Math.min(1, duplicateStats.total_tokens / 10000)
    };

    // Generate recommendations
    const recommendations = hotspots
      .filter(h => h.duplicate_count > 2)
      .slice(0, 5)
      .map(hotspot => ({
        files: [hotspot.file],
        duplicateType: hotspot.avg_similarity > 0.95 ? 'exact' : 'similar',
        suggestion: `Extract ${hotspot.duplicate_count} duplicate blocks into shared functions`,
        estimatedEffort: Math.ceil(hotspot.total_tokens / 100)
      }));

    const result: DuplicationAnalysis = {
      overallDuplication,
      duplicateHotspots: hotspots.map(h => ({
        file: h.file,
        duplicateCount: h.duplicate_count,
        totalTokens: h.total_tokens,
        avgSimilarity: h.avg_similarity
      })),
      duplicateCategories: categories,
      impactAssessment,
      recommendations
    };

    this.setCached(cacheKey, result);
    return result;
  }

  /**
   * Generate comprehensive analytics dashboard data
   */
  async generateDashboardMetrics(): Promise<{
    summary: {
      overallHealth: number;
      codeQuality: number;
      technicalDebt: number;
      testCoverage: number;
    };
    trends: {
      qualityTrend: 'improving' | 'stable' | 'declining';
      debtTrend: 'improving' | 'stable' | 'declining';
      complexityTrend: 'improving' | 'stable' | 'declining';
    };
    alerts: Array<{
      type: 'critical' | 'warning' | 'info';
      message: string;
      component: string;
      action: string;
    }>;
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      category: string;
      title: string;
      description: string;
      estimatedImpact: string;
    }>;
  }> {
    const cacheKey = 'dashboard_metrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    // Get overall metrics
    const codeQuality = await this.calculateCodeQualityScore('project');
    const technicalDebt = await this.assessTechnicalDebt('project');
    const symbolRelationships = await this.analyzeSymbolRelationships('project');
    const duplicationAnalysis = await this.analyzeDuplicationImpact();
    const pipelineHealth = await this.analyzePipelineHealth();

    // Calculate summary scores
    const overallHealth = (
      codeQuality.overall +
      (100 - Math.min(100, technicalDebt.totalDebtScore)) +
      symbolRelationships.architecturalHealth * 100 +
      pipelineHealth.overallHealth
    ) / 4;

    const summary = {
      overallHealth: Math.round(overallHealth),
      codeQuality: codeQuality.overall,
      technicalDebt: Math.min(100, technicalDebt.totalDebtScore),
      testCoverage: 0 // Could be calculated if test data is available
    };

    // Simple trend analysis (would need historical data for real trends)
    const trends = {
      qualityTrend: codeQuality.overall > 75 ? 'improving' as const : 
                   codeQuality.overall > 50 ? 'stable' as const : 'declining' as const,
      debtTrend: technicalDebt.totalDebtScore < 20 ? 'improving' as const :
                technicalDebt.totalDebtScore < 50 ? 'stable' as const : 'declining' as const,
      complexityTrend: codeQuality.details.averageComplexity < 10 ? 'improving' as const :
                      codeQuality.details.averageComplexity < 15 ? 'stable' as const : 'declining' as const
    };

    // Generate alerts
    const alerts = [];
    
    if (technicalDebt.criticalIssues.length > 0) {
      alerts.push({
        type: 'critical' as const,
        message: `${technicalDebt.criticalIssues.length} critical issues found`,
        component: 'Technical Debt',
        action: 'Review and address critical antipatterns immediately'
      });
    }
    
    if (symbolRelationships.dependencyCycles.length > 0) {
      alerts.push({
        type: 'warning' as const,
        message: `${symbolRelationships.dependencyCycles.length} dependency cycles detected`,
        component: 'Architecture',
        action: 'Break circular dependencies between modules'
      });
    }
    
    if (duplicationAnalysis.overallDuplication > 0.1) {
      alerts.push({
        type: 'warning' as const,
        message: `High code duplication (${Math.round(duplicationAnalysis.overallDuplication * 100)}%)`,
        component: 'Code Quality',
        action: 'Refactor duplicate code into shared functions'
      });
    }

    // Compile top recommendations
    const recommendations = [
      ...technicalDebt.criticalIssues.slice(0, 3).map(issue => ({
        priority: 'high' as const,
        category: 'Technical Debt',
        title: `Fix ${issue.type} in ${issue.location}`,
        description: issue.suggestion,
        estimatedImpact: `${issue.estimatedEffort} hours`
      })),
      ...symbolRelationships.recommendations.slice(0, 3).map(rec => ({
        priority: rec.impact === 'high' ? 'high' as const : 'medium' as const,
        category: 'Architecture',
        title: `${rec.type} recommendation for ${rec.target}`,
        description: rec.suggestion,
        estimatedImpact: rec.impact
      })),
      ...duplicationAnalysis.recommendations.slice(0, 2).map(rec => ({
        priority: 'medium' as const,
        category: 'Code Quality',
        title: `Reduce duplication in ${rec.files[0]}`,
        description: rec.suggestion,
        estimatedImpact: `${rec.estimatedEffort} hours`
      }))
    ].slice(0, 8);

    const result = {
      summary,
      trends,
      alerts,
      recommendations
    };

    this.setCached(cacheKey, result, this.CACHE_TTL / 2); // Shorter cache for dashboard
    return result;
  }

  /**
   * Clear analytics cache
   */
  clearCache(): void {
    this.cache.clear();
    this.db.prepare('DELETE FROM analytics_cache').run();
  }

  /**
   * Get current index statistics
   */
  async getIndexStats(): Promise<{
    overview: {
      totalFiles: number;
      totalSymbols: number;
      totalRelationships: number;
      lastUpdated: string;
      databaseSize: number;
    };
    byParser: {
      clang: { files: number; symbols: number; successRate: number };
      treeSitter: { files: number; symbols: number; successRate: number };
      streaming: { files: number; symbols: number; successRate: number };
    };
    byStage: Record<string, {
      files: number;
      symbols: number;
      avgComplexity: number;
      avgConfidence: number;
    }>;
    quality: {
      highConfidenceSymbols: number;
      lowConfidenceFiles: number;
      avgParserConfidence: number;
      coverage: number;
    };
  }> {
    const cacheKey = 'index_stats';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    // Get overall statistics
    const overview = {
      totalFiles: (this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM enhanced_symbols').get() as any).count || 0,
      totalSymbols: (this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count || 0,
      totalRelationships: (this.db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as any).count || 0,
      lastUpdated: new Date().toISOString(),
      databaseSize: 0 // Would need filesystem access to get actual size
    };
    
    // Get parser statistics - use actual symbol data, fall back to indexed_files
    const getParserStats = (parserName: string) => {
      // First try to get from enhanced_symbols (more accurate)
      const symbolStats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT file_path) as files,
          COUNT(*) as symbols,
          AVG(parser_confidence) as successRate
        FROM enhanced_symbols 
        WHERE parser_used = ?
      `).get(parserName) as any;
      
      // If no symbols found, fall back to indexed_files
      if (!symbolStats.symbols) {
        // Map parser names to column names
        const columnPrefix = parserName === 'tree-sitter' ? 'treesitter' : parserName;
        const fileStats = this.db.prepare(`
          SELECT 
            COUNT(CASE WHEN ${columnPrefix}_attempted = 1 THEN 1 END) as files,
            SUM(${columnPrefix}_symbols) as symbols,
            AVG(CASE WHEN ${columnPrefix}_attempted = 1 THEN ${columnPrefix}_success ELSE NULL END) as successRate
          FROM indexed_files
        `).get() as any;
        return fileStats;
      }
      
      return symbolStats;
    };

    const byParser = {
      clang: getParserStats('clang'),
      treeSitter: getParserStats('tree-sitter'),
      streaming: getParserStats('streaming')
    };
    
    // Format parser stats
    const formattedByParser = {
      clang: {
        files: byParser.clang.files || 0,
        symbols: byParser.clang.symbols || 0,
        successRate: byParser.clang.successRate || 0
      },
      treeSitter: {
        files: byParser.treeSitter.files || 0,
        symbols: byParser.treeSitter.symbols || 0,
        successRate: byParser.treeSitter.successRate || 0
      },
      streaming: {
        files: byParser.streaming.files || 0,
        symbols: byParser.streaming.symbols || 0,
        successRate: byParser.streaming.successRate || 0
      }
    };
    
    // Get statistics by pipeline stage
    const stageStats = this.db.prepare(`
      SELECT 
        pipeline_stage,
        COUNT(DISTINCT file_path) as files,
        COUNT(*) as symbols,
        AVG(complexity) as avgComplexity,
        AVG(parser_confidence) as avgConfidence
      FROM enhanced_symbols
      WHERE pipeline_stage IS NOT NULL
      GROUP BY pipeline_stage
    `).all() as any[];
    
    const byStage: Record<string, any> = {};
    stageStats.forEach(stat => {
      byStage[stat.pipeline_stage] = {
        files: stat.files,
        symbols: stat.symbols,
        avgComplexity: stat.avgComplexity || 0,
        avgConfidence: stat.avgConfidence || 0
      };
    });
    
    // Get quality metrics
    const qualityStats = this.db.prepare(`
      SELECT 
        COUNT(CASE WHEN parser_confidence > ${this.MIN_CONFIDENCE} THEN 1 END) as highConfidence,
        AVG(parser_confidence) as avgConfidence
      FROM enhanced_symbols
    `).get() as any;
    
    const lowConfidenceFiles = (this.db.prepare(`
      SELECT COUNT(*) as count
      FROM indexed_files
      WHERE best_confidence < ${this.MIN_CONFIDENCE}
    `).get() as any).count || 0;
    
    const coverage = overview.totalFiles > 0 ? 
      (overview.totalFiles - lowConfidenceFiles) / overview.totalFiles : 0;
    
    const quality = {
      highConfidenceSymbols: qualityStats.highConfidence || 0,
      lowConfidenceFiles,
      avgParserConfidence: qualityStats.avgConfidence || 0,
      coverage
    };
    
    const result = {
      overview,
      byParser: formattedByParser,
      byStage,
      quality
    };
    
    this.setCached(cacheKey, result, this.CACHE_TTL / 4); // Shorter cache for stats
    return result;
  }

  /**
   * Generate enhanced analytics leveraging our rich semantic data
   */
  async generateEnhancedAnalytics(filePath?: string): Promise<void> {
    console.log('🔬 Generating enhanced analytics from semantic data...');
    
    const fileFilter = filePath ? 'WHERE file_path = ?' : '';
    const params = filePath ? [filePath] : [];
    
    // Update symbol quality analytics with our rich type data
    const symbolMetrics = this.db.prepare(`
      SELECT 
        file_path,
        COUNT(*) as total_symbols,
        COUNT(CASE WHEN parser_confidence > 0.8 THEN 1 END) as high_confidence_symbols,
        AVG(parser_confidence) as avg_confidence,
        AVG(complexity) as avg_complexity,
        
        -- Enhanced type analytics
        COUNT(CASE WHEN is_vulkan_type = 1 THEN 1 END) as vulkan_type_count,
        COUNT(CASE WHEN is_std_type = 1 THEN 1 END) as std_type_count,
        COUNT(CASE WHEN is_planetgen_type = 1 THEN 1 END) as planetgen_type_count,
        COUNT(CASE WHEN is_enum_class = 1 THEN 1 END) as enum_class_count,
        COUNT(CASE WHEN is_exported = 1 THEN 1 END) as exported_symbol_count,
        COUNT(CASE WHEN is_constructor = 1 THEN 1 END) as constructor_count,
        COUNT(CASE WHEN is_destructor = 1 THEN 1 END) as destructor_count,
        COUNT(CASE WHEN is_operator = 1 THEN 1 END) as operator_overload_count,
        COUNT(CASE WHEN is_template = 1 THEN 1 END) as template_count
      FROM enhanced_symbols 
      ${fileFilter}
      GROUP BY file_path
    `).all(...params) as any[];
    
    for (const metrics of symbolMetrics) {
      // Calculate enhanced scores
      const typeSafetyScore = this.calculateTypeSafetyScore(metrics);
      const apiDesignScore = this.calculateApiDesignScore(metrics);
      const namespaceOrgScore = this.calculateNamespaceOrganizationScore(metrics.file_path);
      const moduleCoheScore = this.calculateModuleCohesionScore(metrics.file_path);
      
      // Get semantic connections for this file
      const semanticConnections = this.db.prepare(`
        SELECT COUNT(*) as connection_count
        FROM semantic_connections sc
        JOIN enhanced_symbols es1 ON sc.symbol_id = es1.id
        WHERE es1.file_path = ?
      `).get(metrics.file_path) as any;
      
      // Update analytics_symbol_quality table
      this.db.prepare(`
        INSERT OR REPLACE INTO analytics_symbol_quality (
          file_path, total_symbols, high_confidence_symbols, avg_confidence, avg_complexity,
          vulkan_type_count, std_type_count, planetgen_type_count, enum_class_count,
          exported_symbol_count, constructor_destructor_pairs, operator_overload_count,
          semantic_connection_count, type_safety_score, api_design_score,
          namespace_organization_score, module_cohesion_score, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `).run(
        metrics.file_path, metrics.total_symbols, metrics.high_confidence_symbols,
        metrics.avg_confidence, metrics.avg_complexity, metrics.vulkan_type_count,
        metrics.std_type_count, metrics.planetgen_type_count, metrics.enum_class_count,
        metrics.exported_symbol_count, Math.min(metrics.constructor_count, metrics.destructor_count),
        metrics.operator_overload_count, semanticConnections?.connection_count || 0,
        typeSafetyScore, apiDesignScore, namespaceOrgScore, moduleCoheScore
      );
    }
    
    console.log(`✅ Enhanced analytics generated for ${symbolMetrics.length} files`);
  }
  
  private calculateTypeSafetyScore(metrics: any): number {
    const total = metrics.total_symbols || 1;
    const enumClassRatio = metrics.enum_class_count / total;
    const strongTypeRatio = (metrics.planetgen_type_count + metrics.std_type_count) / total;
    const templateUsage = metrics.template_count / total;
    
    return Math.min(1.0, (enumClassRatio * 0.3 + strongTypeRatio * 0.5 + templateUsage * 0.2));
  }
  
  private calculateApiDesignScore(metrics: any): number {
    const total = metrics.total_symbols || 1;
    const exportRatio = Math.min(1.0, metrics.exported_symbol_count / (total * 0.3));
    const operatorRatio = Math.min(1.0, metrics.operator_overload_count / (total * 0.1));
    const raiiScore = Math.min(1.0, Math.min(metrics.constructor_count, metrics.destructor_count) / (total * 0.1));
    
    return (exportRatio * 0.4 + operatorRatio * 0.3 + raiiScore * 0.3);
  }
  
  private calculateNamespaceOrganizationScore(filePath: string): number {
    const namespaceStats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT namespace) as namespace_count,
        COUNT(*) as total_symbols,
        COUNT(CASE WHEN namespace IS NOT NULL AND namespace != '' THEN 1 END) as namespaced_symbols
      FROM enhanced_symbols 
      WHERE file_path = ?
    `).get(filePath) as any;
    
    if (!namespaceStats || namespaceStats.total_symbols === 0) return 0;
    
    const namespacedRatio = namespaceStats.namespaced_symbols / namespaceStats.total_symbols;
    const namespaceComplexity = Math.min(1.0, namespaceStats.namespace_count / 5);
    
    return namespacedRatio * 0.7 + (1 - namespaceComplexity) * 0.3;
  }
  
  private calculateModuleCohesionScore(filePath: string): number {
    const cohesionStats = this.db.prepare(`
      SELECT 
        COUNT(CASE WHEN es2.file_path = es1.file_path THEN 1 END) as internal_connections,
        COUNT(CASE WHEN es2.file_path != es1.file_path THEN 1 END) as external_connections
      FROM semantic_connections sc
      JOIN enhanced_symbols es1 ON sc.symbol_id = es1.id
      JOIN enhanced_symbols es2 ON sc.connected_id = es2.id
      WHERE es1.file_path = ?
    `).get(filePath) as any;
    
    const totalConnections = (cohesionStats?.internal_connections || 0) + (cohesionStats?.external_connections || 0);
    if (totalConnections === 0) return 0.5;
    
    return (cohesionStats.internal_connections || 0) / totalConnections;
  }

  close(): void {
    this.symbolGraphService.close();
    this.db.close();
  }
}