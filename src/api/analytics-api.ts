/**
 * Analytics API for Module Sentinel
 * Provides programmatic access to analytics features
 */

import type Database from 'better-sqlite3';
import { AnalyticsService } from '../services/analytics/analytics-service';

export class AnalyticsAPI {
  private analyticsService: AnalyticsService;

  constructor(private projectDatabase: Database.Database) {
    this.analyticsService = new AnalyticsService(projectDatabase);
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
          ...cluster,
          centroid_embedding: cluster.centroid_embedding ? JSON.parse(cluster.centroid_embedding) : null
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
          ...insight,
          affected_symbols: insight.affected_symbols ? JSON.parse(insight.affected_symbols) : [],
          metrics: insight.metrics ? JSON.parse(insight.metrics) : null,
          related_insights: insight.related_insights ? JSON.parse(insight.related_insights) : []
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
          ...rec,
          related_symbols: rec.related_symbols ? JSON.parse(rec.related_symbols) : []
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
          ...symbol,
          semantic_embedding: options?.includeEmbeddings && symbol.semantic_embedding 
            ? JSON.parse(symbol.semantic_embedding) 
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
   * Get code quality metrics
   */
  async getCodeQualityMetrics() {
    const issues = await this.findPotentialIssues();
    const patterns = await this.detectPatterns('global');
    
    // Calculate overall health score
    const healthScore = Math.max(0, 100 - 
      (issues.summary.antiPatternCount * 5) -
      (issues.summary.complexFunctionCount * 2) -
      (issues.summary.highDependencyCount * 3)
    );

    return {
      healthScore,
      patterns: patterns.length,
      issues: issues.summary,
      recommendations: this.generateRecommendations(healthScore, issues)
    };
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