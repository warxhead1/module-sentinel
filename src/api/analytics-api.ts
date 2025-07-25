/**
 * Analytics API for Module Sentinel
 * Provides programmatic access to analytics features
 */

import type Database from 'better-sqlite3';
import { AnalyticsService } from '../services/analytics/analytics-service';
import { CodeMetricsAnalyzer } from '../analysis/code-metrics-analyzer.js';

export class AnalyticsAPI {
  private analyticsService: AnalyticsService;
  private metricsAnalyzer: CodeMetricsAnalyzer;

  constructor(private projectDatabase: Database.Database) {
    this.analyticsService = new AnalyticsService(projectDatabase);
    this.metricsAnalyzer = new CodeMetricsAnalyzer();
  }

  /**
   * Analyze data flow through a symbol
   */
  async analyzeDataFlow(symbolId: string) {
    return this.analyticsService.analyzeDataFlow(symbolId);
  }

  /**
   * Analyze the impact of changes to a symbol
   */
  async analyzeImpact(symbolId: string) {
    return this.analyticsService.analyzeImpact(symbolId);
  }

  /**
   * Detect architectural and design patterns
   */
  async detectPatterns(scope: 'module' | 'global' = 'global') {
    return this.analyticsService.detectPatterns(scope);
  }

  /**
   * Simulate execution paths through the code
   */
  async simulateExecution(entryPoint: string) {
    return this.analyticsService.simulateExecution(entryPoint);
  }

  /**
   * Calculate advanced complexity metrics
   */
  async calculateComplexity(symbolId: string) {
    return this.analyticsService.calculateComplexity(symbolId);
  }

  // ============= SEMANTIC INTELLIGENCE API ROUTES =============
  
  /**
   * Get semantic embeddings for symbols
   */
  async getSemanticEmbeddings(filters?: {
    symbolIds?: string[];
    kinds?: string[];
    namespaces?: string[];
    limit?: number;
  }) {
    try {
      // This will be implemented when semantic intelligence is ready
      const query = `
        SELECT 
          us.id,
          us.name,
          us.qualified_name,
          us.kind,
          us.namespace,
          us.semantic_embedding,
          us.readability_score,
          us.architectural_role,
          us.complexity_metrics
        FROM universal_symbols us
        WHERE us.semantic_embedding IS NOT NULL
        ${filters?.symbolIds ? `AND us.id IN (${filters.symbolIds.map(id => `'${id}'`).join(',')})` : ''}
        ${filters?.kinds ? `AND us.kind IN (${filters.kinds.map(k => `'${k}'`).join(',')})` : ''}
        ${filters?.namespaces ? `AND us.namespace IN (${filters.namespaces.map(ns => `'${ns}'`).join(',')})` : ''}
        ORDER BY us.readability_score DESC
        ${filters?.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100'}
      `;
      
      const symbols = this.projectDatabase.prepare(query).all();
      
      return {
        success: true,
        data: symbols.map(symbol => ({
          ...(symbol as any),
          semantic_embedding: (symbol as any).semantic_embedding ? JSON.parse((symbol as any).semantic_embedding) : null,
          complexity_metrics: (symbol as any).complexity_metrics ? JSON.parse((symbol as any).complexity_metrics) : null
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting semantic embeddings'
      };
    }
  }

  /**
   * Get semantic clusters
   */
  async getSemanticClusters(options?: {
    clusterType?: 'functional' | 'architectural' | 'pattern-based';
    minQuality?: number;
    limit?: number;
  }) {
    try {
      const query = `
        SELECT 
          sc.*,
          COUNT(cm.symbol_id) as member_count
        FROM semantic_clusters sc
        LEFT JOIN cluster_membership cm ON sc.id = cm.cluster_id
        WHERE 1=1
        ${options?.clusterType ? `AND sc.cluster_type = '${options.clusterType}'` : ''}
        ${options?.minQuality ? `AND sc.quality >= ${options.minQuality}` : ''}
        GROUP BY sc.id
        ORDER BY sc.quality DESC, member_count DESC
        ${options?.limit ? `LIMIT ${options.limit}` : 'LIMIT 50'}
      `;
      
      const clusters = this.projectDatabase.prepare(query).all();
      
      return {
        success: true,
        data: clusters.map(cluster => ({
          ...(cluster as any),
          centroid_embedding: (cluster as any).centroid_embedding ? JSON.parse((cluster as any).centroid_embedding) : null
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting semantic clusters'
      };
    }
  }

  /**
   * Get semantic insights and recommendations
   */
  async getSemanticInsights(filters?: {
    insightType?: string[];
    severity?: ('info' | 'warning' | 'error' | 'critical')[];
    category?: string[];
    status?: ('active' | 'resolved' | 'dismissed' | 'false_positive')[];
    minConfidence?: number;
    limit?: number;
  }) {
    try {
      const query = `
        SELECT 
          si.*,
          COUNT(ir.id) as recommendation_count
        FROM semantic_insights si
        LEFT JOIN insight_recommendations ir ON si.id = ir.insight_id
        WHERE 1=1
        ${filters?.insightType ? `AND si.insight_type IN (${filters.insightType.map(t => `'${t}'`).join(',')})` : ''}
        ${filters?.severity ? `AND si.severity IN (${filters.severity.map(s => `'${s}'`).join(',')})` : ''}
        ${filters?.category ? `AND si.category IN (${filters.category.map(c => `'${c}'`).join(',')})` : ''}
        ${filters?.status ? `AND si.status IN (${filters.status.map(s => `'${s}'`).join(',')})` : ''}
        ${filters?.minConfidence ? `AND si.confidence >= ${filters.minConfidence}` : ''}
        GROUP BY si.id
        ORDER BY 
          CASE si.priority 
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3 
            WHEN 'medium' THEN 2
            ELSE 1 
          END DESC,
          si.confidence DESC
        ${filters?.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100'}
      `;
      
      const insights = this.projectDatabase.prepare(query).all();
      
      return {
        success: true,
        data: insights.map(insight => ({
          ...(insight as any),
          affected_symbols: (insight as any).affected_symbols ? JSON.parse((insight as any).affected_symbols) : [],
          metrics: (insight as any).metrics ? JSON.parse((insight as any).metrics) : null,
          related_insights: (insight as any).related_insights ? JSON.parse((insight as any).related_insights) : []
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting semantic insights'
      };
    }
  }

  /**
   * Get recommendations for a specific insight
   */
  async getInsightRecommendations(insightId: string) {
    try {
      const query = `
        SELECT ir.*, si.title as insight_title
        FROM insight_recommendations ir
        JOIN semantic_insights si ON ir.insight_id = si.id
        WHERE ir.insight_id = ?
        ORDER BY ir.priority DESC
      `;
      
      const recommendations = this.projectDatabase.prepare(query).all(insightId);
      
      return {
        success: true,
        data: recommendations.map(rec => ({
          ...(rec as any),
          related_symbols: (rec as any).related_symbols ? JSON.parse((rec as any).related_symbols) : []
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting recommendations'
      };
    }
  }

  /**
   * Find semantically similar symbols
   */
  async findSimilarSymbols(symbolId: string, options?: {
    similarityThreshold?: number;
    limit?: number;
    includeEmbeddings?: boolean;
  }) {
    try {
      // This will use embedding similarity when semantic intelligence is ready
      // For now, return based on semantic relationships
      const query = `
        SELECT 
          us.id,
          us.name,
          us.qualified_name,
          us.kind,
          us.namespace,
          us.architectural_role,
          sr.strength,
          sr.semantic_type,
          sr.confidence
          ${options?.includeEmbeddings ? ', us.semantic_embedding' : ''}
        FROM semantic_relationships sr
        JOIN universal_symbols us ON sr.to_symbol_id = us.id
        WHERE sr.from_symbol_id = ? 
        AND sr.strength >= ?
        ORDER BY sr.strength DESC, sr.confidence DESC
        ${options?.limit ? `LIMIT ${options.limit}` : 'LIMIT 20'}
      `;
      
      const similarSymbols = this.projectDatabase.prepare(query).all(
        symbolId, 
        options?.similarityThreshold || 0.7
      );
      
      return {
        success: true,
        data: similarSymbols.map(symbol => ({
          ...(symbol as any),
          semantic_embedding: options?.includeEmbeddings && (symbol as any).semantic_embedding 
            ? JSON.parse((symbol as any).semantic_embedding) 
            : undefined
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error finding similar symbols'
      };
    }
  }

  /**
   * Get semantic analysis statistics
   */
  async getSemanticStats() {
    try {
      const stats = {
        totalSymbolsWithEmbeddings: this.projectDatabase.prepare(`
          SELECT COUNT(*) as count FROM universal_symbols WHERE semantic_embedding IS NOT NULL
        `).get(),
        totalClusters: this.projectDatabase.prepare(`
          SELECT COUNT(*) as count FROM semantic_clusters
        `).get(),
        totalInsights: this.projectDatabase.prepare(`
          SELECT COUNT(*) as count FROM semantic_insights WHERE status = 'active'
        `).get(),
        insightsByCategory: this.projectDatabase.prepare(`
          SELECT category, COUNT(*) as count 
          FROM semantic_insights 
          WHERE status = 'active'
          GROUP BY category
        `).all(),
        insightsBySeverity: this.projectDatabase.prepare(`
          SELECT severity, COUNT(*) as count 
          FROM semantic_insights 
          WHERE status = 'active'
          GROUP BY severity
        `).all(),
        clustersByType: this.projectDatabase.prepare(`
          SELECT cluster_type, COUNT(*) as count 
          FROM semantic_clusters 
          GROUP BY cluster_type
        `).all()
      };
      
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting semantic stats'
      };
    }
  }

  /**
   * Get all available analytics for a symbol
   */
  async getSymbolAnalytics(symbolId: string) {
    const [dataFlow, impact, complexity] = await Promise.all([
      this.analyzeDataFlow(symbolId),
      this.analyzeImpact(symbolId),
      this.calculateComplexity(symbolId)
    ]);

    return {
      symbolId,
      dataFlow,
      impact,
      complexity,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Find potential bugs and issues
   */
  async findPotentialIssues() {
    // Detect anti-patterns
    const patterns = await this.detectPatterns('global');
    const antiPatterns = patterns.filter(p => p.patternType.includes('Anti-pattern'));

    // Find high complexity functions
    const stmt = this.projectDatabase.prepare(`
      SELECT id, name, qualified_name, complexity
      FROM symbols
      WHERE kind = 'function' AND complexity > 10
      ORDER BY complexity DESC
      LIMIT 20
    `);
    const complexFunctions = stmt.all();

    // Find functions with many dependencies
    const depsStmt = this.projectDatabase.prepare(`
      SELECT s.id, s.name, COUNT(DISTINCT r.to_symbol_id) as dep_count
      FROM symbols s
      JOIN relationships r ON r.from_symbol_id = s.id
      WHERE s.kind = 'function'
      GROUP BY s.id
      HAVING dep_count > 15
      ORDER BY dep_count DESC
      LIMIT 20
    `);
    const highDependencyFunctions = depsStmt.all();

    return {
      antiPatterns,
      complexFunctions,
      highDependencyFunctions,
      summary: {
        antiPatternCount: antiPatterns.length,
        complexFunctionCount: complexFunctions.length,
        highDependencyCount: highDependencyFunctions.length
      }
    };
  }

  /**
   * Get code quality metrics using shared utility
   */
  async getCodeQualityMetrics() {
    const issues = await this.findPotentialIssues();
    const patterns = await this.detectPatterns('global');
    
    // Get database quality statistics
    const dbStats = await this.getQualityStats();
    
    // Use shared metrics analyzer for quality calculations
    const qualityMetrics = this.metricsAnalyzer.calculateQualityMetrics(dbStats);
    
    // Get advanced anti-pattern detection
    const antiPatterns = await this.getAdvancedAntiPatterns();
    
    return {
      healthScore: qualityMetrics.codeHealth,
      confidence: qualityMetrics.confidence,
      coverage: qualityMetrics.coverage,
      maintainabilityIndex: qualityMetrics.maintainabilityIndex,
      technicalDebt: qualityMetrics.technicalDebt,
      patterns: patterns.length,
      issues: issues.summary,
      antiPatterns: {
        total: antiPatterns.length,
        bySeverity: this.groupBySeverity(antiPatterns),
        byType: this.groupByType(antiPatterns),
        details: antiPatterns.slice(0, 10) // Limit for performance
      },
      recommendations: this.generateAdvancedRecommendations(qualityMetrics.codeHealth, issues, antiPatterns)
    };
  }

  /**
   * Get advanced anti-patterns using database metrics
   * API endpoint: /api/analytics/anti-patterns
   */
  async getAdvancedAntiPatterns(options: {
    severity?: 'low' | 'medium' | 'high' | 'critical';
    type?: string;
    limit?: number;
    includeMetrics?: boolean;
  } = {}) {
    try {
      // Get comprehensive database statistics
      const dbStats = await this.metricsAnalyzer.getComprehensiveDbStats(this.projectDatabase);
      
      // Detect anti-patterns using metrics
      let antiPatterns = this.metricsAnalyzer.detectAntiPatternsFromMetrics(dbStats);
      
      // Apply filters
      if (options.severity) {
        antiPatterns = antiPatterns.filter(ap => ap.severity === options.severity);
      }
      
      if (options.type) {
        antiPatterns = antiPatterns.filter(ap => ap.type === options.type);
      }
      
      // Apply limit
      if (options.limit) {
        antiPatterns = antiPatterns.slice(0, options.limit);
      }
      
      // Optionally exclude metrics for lighter response
      if (!options.includeMetrics) {
        antiPatterns = antiPatterns.map(ap => ({
          ...ap,
          metrics: {} // Clear metrics for API response
        }));
      }
      
      return antiPatterns;
    } catch (error) {
      console.error('Failed to get advanced anti-patterns:', error);
      return [];
    }
  }

  /**
   * Get anti-patterns for a specific symbol
   * API endpoint: /api/analytics/symbol/{id}/anti-patterns
   */
  async getSymbolAntiPatterns(symbolId: number) {
    const allAntiPatterns = await this.getAdvancedAntiPatterns({ includeMetrics: true });
    return allAntiPatterns.filter(ap => ap.symbolId === symbolId);
  }

  /**
   * Get anti-pattern summary statistics
   * API endpoint: /api/analytics/anti-patterns/summary
   */
  async getAntiPatternSummary() {
    const antiPatterns = await this.getAdvancedAntiPatterns();
    
    const summary = {
      total: antiPatterns.length,
      bySeverity: this.groupBySeverity(antiPatterns),
      byType: this.groupByType(antiPatterns),
      mostProblematic: antiPatterns
        .filter(ap => ap.severity === 'critical' || ap.severity === 'high')
        .slice(0, 5)
        .map(ap => ({
          symbolName: ap.symbolName,
          type: ap.type,
          severity: ap.severity,
          description: ap.description
        })),
      recommendations: this.generateAntiPatternRecommendations(antiPatterns)
    };
    
    return summary;
  }

  /**
   * Get quality statistics from database
   */
  private async getQualityStats() {
    try {
      // Direct database queries since getProjectStats might not exist
      const avgConfidenceResult = this.projectDatabase.prepare(`
        SELECT AVG(confidence) as avgConfidence 
        FROM universal_symbols 
        WHERE confidence > 0
      `).get() as any;

      const totalFilesResult = this.projectDatabase.prepare(`
        SELECT COUNT(DISTINCT file_path) as totalFiles 
        FROM universal_symbols
      `).get() as any;

      const symbolCountResult = this.projectDatabase.prepare(`
        SELECT COUNT(*) as symbolCount 
        FROM universal_symbols
      `).get() as any;

      return {
        avgConfidence: avgConfidenceResult?.avgConfidence || 0.8,
        totalFiles: totalFilesResult?.totalFiles || 1,
        symbolCount: symbolCountResult?.symbolCount || 0,
        testCoverage: 70, // Simulated for now
      };
    } catch (error) {
      console.warn('Failed to get quality stats from database:', error);
      // Fallback to basic stats
      return {
        avgConfidence: 0.8,
        totalFiles: 1,
        symbolCount: 0,
        testCoverage: 70,
      };
    }
  }

  /**
   * Group anti-patterns by severity
   */
  private groupBySeverity(antiPatterns: any[]): Record<string, number> {
    return antiPatterns.reduce((acc, ap) => {
      acc[ap.severity] = (acc[ap.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Group anti-patterns by type
   */
  private groupByType(antiPatterns: any[]): Record<string, number> {
    return antiPatterns.reduce((acc, ap) => {
      acc[ap.type] = (acc[ap.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Generate advanced recommendations based on anti-patterns
   */
  private generateAdvancedRecommendations(healthScore: number, issues: any, antiPatterns: any[]): string[] {
    const recommendations: string[] = [];

    // Basic health recommendations
    if (healthScore < 70) {
      recommendations.push('Consider refactoring high-complexity functions');
    }

    if (issues.summary.antiPatternCount > 5) {
      recommendations.push('Address identified anti-patterns to improve maintainability');
    }

    // Anti-pattern specific recommendations
    const criticalAntiPatterns = antiPatterns.filter(ap => ap.severity === 'critical');
    if (criticalAntiPatterns.length > 0) {
      recommendations.push(`Address ${criticalAntiPatterns.length} critical anti-patterns immediately`);
    }

    const godClasses = antiPatterns.filter(ap => ap.type === 'god-class');
    if (godClasses.length > 0) {
      recommendations.push(`Break down ${godClasses.length} overly complex classes using Single Responsibility Principle`);
    }

    const circularDeps = antiPatterns.filter(ap => ap.type === 'circular-dependency');
    if (circularDeps.length > 0) {
      recommendations.push(`Resolve ${circularDeps.length} circular dependencies to improve modularity`);
    }

    const deadCode = antiPatterns.filter(ap => ap.type === 'dead-code');
    if (deadCode.length > 0) {
      recommendations.push(`Remove ${deadCode.length} unused code segments to reduce maintenance burden`);
    }

    const longParamLists = antiPatterns.filter(ap => ap.type === 'long-parameter-list');
    if (longParamLists.length > 0) {
      recommendations.push(`Refactor ${longParamLists.length} functions with too many parameters using Parameter Object pattern`);
    }

    return recommendations;
  }

  /**
   * Generate anti-pattern specific recommendations
   */
  private generateAntiPatternRecommendations(antiPatterns: any[]): string[] {
    const recommendations: string[] = [];
    const byType = this.groupByType(antiPatterns);

    Object.entries(byType).forEach(([type, count]) => {
      switch (type) {
        case 'god-class':
          recommendations.push(`Split ${count} god classes into smaller, focused classes`);
          break;
        case 'circular-dependency':
          recommendations.push(`Break ${count} circular dependencies by introducing interfaces or dependency injection`);
          break;
        case 'dead-code':
          recommendations.push(`Remove ${count} unused code segments to improve codebase cleanliness`);
          break;
        case 'feature-envy':
          recommendations.push(`Move ${count} methods closer to the data they use most`);
          break;
        case 'shotgun-surgery':
          recommendations.push(`Consolidate logic for ${count} widely-used components to reduce change impact`);
          break;
        case 'long-parameter-list':
          recommendations.push(`Use parameter objects or builder patterns for ${count} functions with many parameters`);
          break;
      }
    });

    return recommendations;
  }

  private generateRecommendations(healthScore: number, issues: any): string[] {
    const recommendations: string[] = [];

    if (healthScore < 70) {
      recommendations.push('Consider refactoring high-complexity functions');
    }

    if (issues.summary.antiPatternCount > 5) {
      recommendations.push('Address identified anti-patterns to improve maintainability');
    }

    if (issues.summary.highDependencyCount > 10) {
      recommendations.push('Reduce coupling between functions to improve modularity');
    }

    return recommendations;
  }
}