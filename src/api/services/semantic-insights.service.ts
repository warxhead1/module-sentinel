/**
 * Semantic Insights Service
 * 
 * Provides access to semantic intelligence data from the database
 */

import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { 
  semanticInsights, 
  insightRecommendations,
  semanticClusters,
  clusterMembership,
  universalSymbols
} from '../../database/drizzle/schema.js';
import { SemanticInsightsGenerator } from '../../analysis/semantic-insights-generator.js';
import { SemanticOrchestrator } from '../../analysis/semantic-orchestrator.js';
import { SemanticClusteringEngine } from '../../analysis/semantic-clustering-engine.js';
import { LocalCodeEmbeddingEngine } from '../../analysis/local-code-embedding.js';

export class SemanticInsightsService {
  private db: Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private insightsGenerator: SemanticInsightsGenerator;
  private orchestrator: SemanticOrchestrator;

  constructor(db: Database) {
    this.db = db;
    this.drizzleDb = drizzle(db);
    this.orchestrator = new SemanticOrchestrator(db);
    
    // Create required dependencies for insights generator
    const embeddingEngine = new LocalCodeEmbeddingEngine(db);
    const clusteringEngine = new SemanticClusteringEngine(
      db,
      embeddingEngine,
      { debugMode: false }
    );
    
    // Create insights generator with all required dependencies
    this.insightsGenerator = new SemanticInsightsGenerator(
      db,
      clusteringEngine,
      embeddingEngine,
      { debugMode: false }
    );
  }

  /**
   * Get insights with filtering
   */
  async getInsights(filters: any = {}): Promise<any[]> {
    try {
      let query = this.drizzleDb
        .select({
          id: semanticInsights.id,
          type: semanticInsights.insightType,
          category: semanticInsights.category,
          severity: semanticInsights.severity,
          confidence: semanticInsights.confidence,
          priority: semanticInsights.priority,
          title: semanticInsights.title,
          description: semanticInsights.description,
          affectedSymbols: semanticInsights.affectedSymbols,
          clusterId: semanticInsights.clusterId,
          metrics: semanticInsights.metrics,
          reasoning: semanticInsights.reasoning,
          detectedAt: semanticInsights.detectedAt,
          status: semanticInsights.status,
          userFeedback: semanticInsights.userFeedback
        })
        .from(semanticInsights);

      // Apply filters
      const conditions = [];
      
      if (filters.type) {
        conditions.push(eq(semanticInsights.insightType, filters.type));
      }
      if (filters.category) {
        conditions.push(eq(semanticInsights.category, filters.category));
      }
      if (filters.severity) {
        conditions.push(eq(semanticInsights.severity, filters.severity));
      }
      if (filters.status) {
        conditions.push(eq(semanticInsights.status, filters.status));
      }

      const baseQuery = conditions.length > 0 
        ? this.drizzleDb
            .select({
              id: semanticInsights.id,
              type: semanticInsights.insightType,
              category: semanticInsights.category,
              severity: semanticInsights.severity,
              confidence: semanticInsights.confidence,
              priority: semanticInsights.priority,
              title: semanticInsights.title,
              description: semanticInsights.description,
              affectedSymbols: semanticInsights.affectedSymbols,
              clusterId: semanticInsights.clusterId,
              metrics: semanticInsights.metrics,
              reasoning: semanticInsights.reasoning,
              detectedAt: semanticInsights.detectedAt,
              status: semanticInsights.status,
              userFeedback: semanticInsights.userFeedback
            })
            .from(semanticInsights)
            .where(and(...conditions))
        : query;

      const results = await baseQuery
        .orderBy(desc(semanticInsights.priority), desc(semanticInsights.confidence))
        .limit(filters.limit || 50)
        .all();

      // Transform results
      return results.map(row => ({
        ...row,
        affectedSymbols: JSON.parse(row.affectedSymbols || '[]'),
        metrics: JSON.parse(row.metrics || '{}'),
        detectedAt: row.detectedAt instanceof Date ? row.detectedAt.getTime() : row.detectedAt
      }));

    } catch (error) {
      console.error('Error fetching insights:', error);
      return [];
    }
  }

  /**
   * Get insights for a specific symbol
   */
  async getInsightsForSymbol(symbolId: number): Promise<any[]> {
    try {
      const results = await this.drizzleDb
        .select()
        .from(semanticInsights)
        .where(sql`json_extract(${semanticInsights.affectedSymbols}, '$') LIKE '%${symbolId}%'`)
        .orderBy(desc(semanticInsights.priority))
        .limit(20);

      return results.map(row => ({
        ...row,
        affectedSymbols: JSON.parse(row.affectedSymbols || '[]'),
        metrics: JSON.parse(row.metrics || '{}')
      }));

    } catch (error) {
      console.error('Error fetching symbol insights:', error);
      return [];
    }
  }

  /**
   * Get semantic clusters
   */
  async getClusters(filters: any = {}): Promise<any[]> {
    try {
      let query = this.drizzleDb
        .select({
          id: semanticClusters.id,
          name: semanticClusters.clusterName,
          type: semanticClusters.clusterType,
          quality: semanticClusters.quality,
          symbolCount: semanticClusters.symbolCount,
          similarityThreshold: semanticClusters.similarityThreshold,
          description: semanticClusters.description,
          createdAt: semanticClusters.createdAt
        })
        .from(semanticClusters);

      const conditions = [];
      
      if (filters.type) {
        conditions.push(eq(semanticClusters.clusterType, filters.type));
      }
      if (filters.minQuality) {
        conditions.push(sql`${semanticClusters.quality} >= ${filters.minQuality}`);
      }

      const baseQuery = conditions.length > 0 
        ? this.drizzleDb
            .select({
              id: semanticClusters.id,
              name: semanticClusters.clusterName,
              type: semanticClusters.clusterType,
              quality: semanticClusters.quality,
              symbolCount: semanticClusters.symbolCount,
              similarityThreshold: semanticClusters.similarityThreshold,
              description: semanticClusters.description,
              createdAt: semanticClusters.createdAt
            })
            .from(semanticClusters)
            .where(and(...conditions))
        : query;

      return await baseQuery
        .orderBy(desc(semanticClusters.quality), desc(semanticClusters.symbolCount))
        .limit(filters.limit || 50)
        .all();

    } catch (error) {
      console.error('Error fetching clusters:', error);
      return [];
    }
  }

  /**
   * Get cluster details with members
   */
  async getClusterDetails(clusterId: number): Promise<any> {
    try {
      // Get cluster info
      const [cluster] = await this.drizzleDb
        .select()
        .from(semanticClusters)
        .where(eq(semanticClusters.id, clusterId))
        .limit(1);

      if (!cluster) {
        return null;
      }

      // Get cluster members
      const members = await this.drizzleDb
        .select({
          symbolId: clusterMembership.symbolId,
          similarity: clusterMembership.similarity,
          role: clusterMembership.role,
          symbolName: universalSymbols.name,
          symbolType: universalSymbols.kind,
          filePath: universalSymbols.filePath,
          line: universalSymbols.line
        })
        .from(clusterMembership)
        .innerJoin(universalSymbols, eq(clusterMembership.symbolId, universalSymbols.id))
        .where(eq(clusterMembership.clusterId, clusterId))
        .orderBy(desc(clusterMembership.similarity));

      return {
        ...cluster,
        centroidEmbedding: cluster.centroidEmbedding ? 
          JSON.parse(cluster.centroidEmbedding.toString()) : null,
        members
      };

    } catch (error) {
      console.error('Error fetching cluster details:', error);
      return null;
    }
  }

  /**
   * Get recommendations for an insight
   */
  async getRecommendations(insightId: number): Promise<any[]> {
    try {
      const results = await this.drizzleDb
        .select()
        .from(insightRecommendations)
        .where(eq(insightRecommendations.insightId, insightId))
        .orderBy(insightRecommendations.priority);

      return results.map(row => ({
        ...row,
        relatedSymbols: JSON.parse(row.relatedSymbols || '[]')
      }));

    } catch (error) {
      console.error('Error fetching recommendations:', error);
      return [];
    }
  }

  /**
   * Get quality metrics across the codebase
   */
  async getQualityMetrics(): Promise<any> {
    try {
      // Get insight statistics
      const insightStats = await this.drizzleDb
        .select({
          category: semanticInsights.category,
          severity: semanticInsights.severity,
          count: sql<number>`count(*)`,
          avgConfidence: sql<number>`avg(${semanticInsights.confidence})`
        })
        .from(semanticInsights)
        .where(eq(semanticInsights.status, 'active'))
        .groupBy(semanticInsights.category, semanticInsights.severity);

      // Get cluster statistics
      const clusterStats = await this.drizzleDb
        .select({
          type: semanticClusters.clusterType,
          count: sql<number>`count(*)`,
          avgQuality: sql<number>`avg(${semanticClusters.quality})`,
          totalSymbols: sql<number>`sum(${semanticClusters.symbolCount})`
        })
        .from(semanticClusters)
        .groupBy(semanticClusters.clusterType);

      // Calculate overall metrics
      const overallMetrics = {
        totalInsights: insightStats.reduce((sum, s) => sum + Number(s.count), 0),
        criticalIssues: insightStats.filter(s => s.severity === 'critical').reduce((sum, s) => sum + Number(s.count), 0),
        totalClusters: clusterStats.reduce((sum, s) => sum + Number(s.count), 0),
        avgClusterQuality: clusterStats.reduce((sum, s) => sum + Number(s.avgQuality), 0) / clusterStats.length || 0,
        insightsByCategory: {} as Record<string, number>,
        insightsBySeverity: {} as Record<string, number>,
        clustersByType: {} as Record<string, any>
      };

      // Group insights by category and severity
      insightStats.forEach(stat => {
        if (!overallMetrics.insightsByCategory[stat.category]) {
          overallMetrics.insightsByCategory[stat.category] = 0;
        }
        if (!overallMetrics.insightsBySeverity[stat.severity]) {
          overallMetrics.insightsBySeverity[stat.severity] = 0;
        }
        overallMetrics.insightsByCategory[stat.category] += Number(stat.count);
        overallMetrics.insightsBySeverity[stat.severity] += Number(stat.count);
      });

      // Group clusters by type
      clusterStats.forEach(stat => {
        overallMetrics.clustersByType[stat.type] = {
          count: Number(stat.count),
          avgQuality: Number(stat.avgQuality),
          totalSymbols: Number(stat.totalSymbols)
        };
      });

      return overallMetrics;

    } catch (error) {
      console.error('Error calculating quality metrics:', error);
      return {
        totalInsights: 0,
        criticalIssues: 0,
        totalClusters: 0,
        avgClusterQuality: 0,
        insightsByCategory: {},
        insightsBySeverity: {},
        clustersByType: {}
      };
    }
  }

  /**
   * Submit user feedback for an insight
   */
  async submitFeedback(insightId: number, feedback: -1 | 0 | 1, comment?: string): Promise<void> {
    try {
      await this.drizzleDb
        .update(semanticInsights)
        .set({
          userFeedback: feedback,
          feedbackComment: comment,
          feedbackTimestamp: new Date(),
          updatedAt: new Date()
        })
        .where(eq(semanticInsights.id, insightId));

    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  /**
   * Trigger semantic analysis for specific files
   */
  async analyzeFiles(filePaths: string[], options: any = {}): Promise<any> {
    try {
      // This would typically:
      // 1. Load the files and parse them
      // 2. Run semantic analysis
      // 3. Store results in database
      // 4. Return summary
      
      // For now, return a placeholder
      return {
        filesAnalyzed: filePaths.length,
        insightsGenerated: 0,
        clustersCreated: 0,
        message: 'Analysis queued for processing'
      };

    } catch (error) {
      console.error('Error analyzing files:', error);
      throw error;
    }
  }
}