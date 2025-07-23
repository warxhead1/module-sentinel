/**
 * Semantic Data Persister
 * 
 * Efficiently persists all rich semantic intelligence data back to the database
 * after semantic analysis is complete. This ensures that all generated insights,
 * embeddings, clusters, and relationships are stored for future analysis.
 */

import { Database } from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql, eq, and } from 'drizzle-orm';
import { SemanticIntelligenceResult, SemanticIntelligenceStats } from './semantic-intelligence-orchestrator.js';
import { SemanticContext } from './semantic-context-engine.js';
import { CodeEmbedding } from './local-code-embedding.js';
import { SemanticCluster } from './semantic-clustering-engine.js';
import { SemanticInsight } from './semantic-insights-generator.js';
import { 
  universalSymbols,
  semanticClusters,
  clusterMembership,
  semanticInsights,
  insightRecommendations,
  semanticRelationships,
  codeEmbeddings
} from '../database/drizzle/schema.js';

export interface SemanticPersistenceStats {
  symbolsUpdated: number;
  embeddingsStored: number;
  clustersStored: number;
  clusterMembershipsStored: number;
  insightsStored: number;
  recommendationsStored: number;
  relationshipsStored: number;
  processingTimeMs: number;
  errors: string[];
}

export interface SemanticPersistenceOptions {
  projectId: number;
  debugMode?: boolean;
  batchSize?: number;
  enableTransactions?: boolean;
  skipExistingData?: boolean;
}

export class SemanticDataPersister {
  private db: BetterSQLite3Database;
  private options: SemanticPersistenceOptions;
  private errors: string[] = [];

  constructor(database: Database, options: SemanticPersistenceOptions) {
    this.db = drizzle(database);
    this.options = {
      debugMode: false,
      batchSize: 100,
      enableTransactions: false,
      skipExistingData: false,
      ...options
    };
  }

  /**
   * Main entry point - persist all semantic intelligence data
   */
  async persistSemanticIntelligence(
    result: SemanticIntelligenceResult,
    symbolIdMapping: Map<string, number>
  ): Promise<SemanticPersistenceStats> {
    const startTime = Date.now();
    this.errors = [];

    const stats: SemanticPersistenceStats = {
      symbolsUpdated: 0,
      embeddingsStored: 0,
      clustersStored: 0,
      clusterMembershipsStored: 0,
      insightsStored: 0,
      recommendationsStored: 0,
      relationshipsStored: 0,
      processingTimeMs: 0,
      errors: []
    };

    try {
      this.debug("Starting semantic data persistence...");

      await this.persistAllData(result, symbolIdMapping, stats, this.db);

      stats.processingTimeMs = Date.now() - startTime;
      stats.errors = [...this.errors];

      this.debug(`Semantic persistence completed in ${stats.processingTimeMs}ms`);
      this.logStats(stats);

    } catch (error) {
      this.errors.push(`Transaction failed: ${error}`);
      console.error("Semantic data persistence failed:", error);
      stats.errors = [...this.errors];
      stats.processingTimeMs = Date.now() - startTime;
    }

    return stats;
  }

  /**
   * Persist all semantic data types
   */
  private async persistAllData(
    result: SemanticIntelligenceResult,
    symbolIdMapping: Map<string, number>,
    stats: SemanticPersistenceStats,
    dbHandle: any
  ): Promise<void> {
    // 1. Update universal_symbols with semantic context data
    if (result.contexts && result.contexts.size > 0) {
      stats.symbolsUpdated += await this.persistSemanticContexts(
        result.contexts, 
        symbolIdMapping, 
        dbHandle
      );
    }

    // 2. Store code embeddings
    if (result.embeddings && result.embeddings.length > 0) {
      stats.embeddingsStored += await this.persistCodeEmbeddings(
        result.embeddings,
        symbolIdMapping,
        dbHandle
      );
    }

    // 3. Store semantic clusters and memberships
    if (result.clusters && result.clusters.length > 0) {
      const clusterResults = await this.persistSemanticClusters(
        result.clusters,
        symbolIdMapping,
        dbHandle
      );
      stats.clustersStored += clusterResults.clustersStored;
      stats.clusterMembershipsStored += clusterResults.membershipsStored;
    }

    // 4. Store semantic insights and recommendations
    if (result.insights && result.insights.length > 0) {
      const insightResults = await this.persistSemanticInsights(
        result.insights,
        symbolIdMapping,
        dbHandle
      );
      stats.insightsStored += insightResults.insightsStored;
      stats.recommendationsStored += insightResults.recommendationsStored;
    }

    // 5. Store inferred semantic relationships
    stats.relationshipsStored += await this.persistSemanticRelationships(
      result.contexts,
      result.embeddings,
      symbolIdMapping,
      dbHandle
    );
  }

  /**
   * Update universal_symbols with semantic context data
   */
  private async persistSemanticContexts(
    contexts: Map<string, SemanticContext>,
    symbolIdMapping: Map<string, number>,
    dbHandle: any
  ): Promise<number> {
    let updated = 0;

    try {
      this.debug(`Updating ${contexts.size} symbols with semantic context data...`);

      for (const [symbolKey, context] of contexts) {
        const symbolId = symbolIdMapping.get(symbolKey);
        if (!symbolId) {
          this.errors.push(`No symbol ID found for key: ${symbolKey}`);
          
          // Debug: Show available keys for troubleshooting
          console.log(`[SemanticDataPersister] Context key not found: ${symbolKey}`);
          console.log(`[SemanticDataPersister] Available keys (sample):`);
          let count = 0;
          for (const [key] of symbolIdMapping) {
            if (count++ < 5) {
              console.log(`  - ${key}`);
            } else break;
          }
          continue;
        }

        try {
          // Calculate readability score from quality indicators
          const readabilityScore = this.calculateReadabilityScore(context);
          
          // Determine architectural role
          const architecturalRole = this.mapSemanticRoleToArchitecturalRole(context.semanticRole);

          // Build complexity metrics JSON
          const complexityMetrics = JSON.stringify({
            cognitiveComplexity: context.complexityMetrics.cognitiveComplexity || 0,
            cyclomaticComplexity: context.complexityMetrics.cyclomaticComplexity || 0,
            nestingDepth: context.complexityMetrics.nestingDepth || 0,
            parameterCount: context.complexityMetrics.parameterCount || 0,
            lineCount: context.complexityMetrics.lineCount || 0,
            branchCount: context.complexityMetrics.branchCount || 0,
            dependencyCount: context.complexityMetrics.dependencyCount || 0,
            fanIn: context.complexityMetrics.fanIn || 0,
            fanOut: context.complexityMetrics.fanOut || 0,
            readabilityFactors: context.qualityIndicators.map(qi => ({
              type: qi.type,
              name: qi.name,
              severity: qi.severity,
              description: qi.description,
              confidence: qi.confidence
            }))
          });

          // Generate semantic similarity hash for quick lookups
          const semanticSimilarityHash = this.generateSemanticHash(context);

          // Update the symbol record
          await dbHandle
            .update(universalSymbols)
            .set({
              readabilityScore,
              architecturalRole,
              complexityMetrics,
              semanticSimilarityHash,
              updatedAt: new Date()
            })
            .where(eq(universalSymbols.id, symbolId));

          updated++;

        } catch (error) {
          this.errors.push(`Failed to update symbol ${symbolId}: ${error}`);
        }
      }

    } catch (error) {
      this.errors.push(`Failed to persist semantic contexts: ${error}`);
    }

    this.debug(`Updated ${updated} symbols with semantic context data`);
    return updated;
  }

  /**
   * Store code embeddings in the code_embeddings table
   */
  private async persistCodeEmbeddings(
    embeddings: CodeEmbedding[],
    symbolIdMapping: Map<string, number>,
    dbHandle: any
  ): Promise<number> {
    let stored = 0;

    try {
      this.debug(`Storing ${embeddings.length} code embeddings...`);

      for (const embedding of embeddings) {
        // The embedding.symbolId should now be in consistent format from the embedding engine
        const lookupKey = String(embedding.symbolId);
        const symbolId = symbolIdMapping.get(lookupKey);
        if (!symbolId) {
          this.errors.push(`No symbol ID found for embedding: ${embedding.symbolId}`);
          if (this.options.debugMode && symbolIdMapping.size > 0) {
            // Debug: show what keys are available
            const availableKeys = Array.from(symbolIdMapping.keys()).filter(k => k.includes(embedding.metadata?.symbolType || 'unknown')).slice(0, 3);
            this.debug(`Looking for key: ${lookupKey}, similar available keys: ${availableKeys.join(', ')}`);
          }
          
          // Debug: Show available keys for troubleshooting
          console.log(`[SemanticDataPersister] Embedding key not found: ${embedding.symbolId}`);
          console.log(`[SemanticDataPersister] Available embedding keys (sample):`);
          let count = 0;
          for (const [key] of symbolIdMapping) {
            if (count++ < 5) {
              console.log(`  - ${key}`);
            } else break;
          }
          continue;
        }

        try {
          // Convert embedding vector to Buffer for storage
          const embeddingBuffer = Buffer.from(JSON.stringify(embedding.embedding));

          // Determine embedding type from metadata
          const embeddingType = this.determineEmbeddingType(embedding.metadata);

          // Insert or update embedding using raw SQL
          await dbHandle.run(sql`
            INSERT OR REPLACE INTO code_embeddings (
              symbol_id, embedding_type, embedding, dimensions, model_version, created_at, updated_at
            ) VALUES (
              ${symbolId}, ${embeddingType}, ${embeddingBuffer}, ${embedding.dimensions}, 
              ${embedding.version}, ${new Date()}, ${new Date()}
            )
          `);

          // Also store embedding in universal_symbols table
          const embeddingBase64 = Buffer.from(JSON.stringify(embedding.embedding)).toString('base64');
          await dbHandle
            .update(universalSymbols)
            .set({
              semanticEmbedding: embeddingBase64,
              updatedAt: new Date()
            })
            .where(eq(universalSymbols.id, symbolId));

          stored++;

        } catch (error) {
          this.errors.push(`Failed to store embedding for symbol ${symbolId}: ${error}`);
        }
      }

    } catch (error) {
      this.errors.push(`Failed to persist code embeddings: ${error}`);
    }

    this.debug(`Stored ${stored} code embeddings`);
    return stored;
  }

  /**
   * Store semantic clusters and their memberships
   */
  private async persistSemanticClusters(
    clusters: SemanticCluster[],
    symbolIdMapping: Map<string, number>,
    dbHandle: any
  ): Promise<{ clustersStored: number; membershipsStored: number }> {
    let clustersStored = 0;
    let membershipsStored = 0;

    try {
      this.debug(`Storing ${clusters.length} semantic clusters...`);

      for (const cluster of clusters) {
        try {
          // Store cluster centroid as base64
          const centroidEmbedding = Buffer.from(JSON.stringify(cluster.centroid)).toString('base64');

          // Insert cluster
          const clusterResult = await dbHandle
            .insert(semanticClusters)
            .values({
              projectId: this.options.projectId,
              clusterName: cluster.name,
              clusterType: cluster.type,
              centroidEmbedding,
              similarityThreshold: cluster.similarityThreshold,
              symbolCount: cluster.members.length,
              quality: cluster.quality,
              description: cluster.description,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning({ id: semanticClusters.id });

          const clusterId = clusterResult[0]?.id;
          if (!clusterId) {
            this.errors.push(`Failed to get cluster ID for cluster: ${cluster.name}`);
            continue;
          }

          clustersStored++;

          // Store cluster memberships
          for (const member of cluster.members) {
            const symbolId = symbolIdMapping.get(String(member.symbolId));
            if (!symbolId) {
              this.errors.push(`No symbol ID found for cluster member: ${member.symbolId}`);
              
              // Debug: Show available keys for troubleshooting
              if (this.options.debugMode) {
                console.log(`[SemanticDataPersister] Cluster member key not found: ${member.symbolId}`);
              }
              continue;
            }

            try {
              const result = await dbHandle
                .insert(clusterMembership)
                .values({
                  clusterId,
                  symbolId,
                  similarity: member.similarity,
                  role: member.role || 'member',
                  assignedAt: new Date()
                })
                .returning({ id: clusterMembership.id });

              if (result.length > 0) {
                membershipsStored++;
              }

            } catch (error: any) {
              this.errors.push(`Failed to store cluster membership for symbol ${symbolId}: ${error}`);
            }
          }

        } catch (error) {
          this.errors.push(`Failed to store cluster ${cluster.name}: ${error}`);
        }
      }

    } catch (error) {
      this.errors.push(`Failed to persist semantic clusters: ${error}`);
    }

    this.debug(`Stored ${clustersStored} clusters and ${membershipsStored} memberships`);
    return { clustersStored, membershipsStored };
  }

  /**
   * Store semantic insights and their recommendations
   */
  private async persistSemanticInsights(
    insights: SemanticInsight[],
    symbolIdMapping: Map<string, number>,
    dbHandle: any
  ): Promise<{ insightsStored: number; recommendationsStored: number }> {
    let insightsStored = 0;
    let recommendationsStored = 0;

    try {
      this.debug(`Storing ${insights.length} semantic insights...`);

      for (const insight of insights) {
        try {
          // Map affected symbol keys to actual IDs
          const affectedSymbolIds = insight.affectedSymbols
            .map(symbolKey => symbolIdMapping.get(symbolKey))
            .filter(id => id !== undefined);

          if (affectedSymbolIds.length === 0) {
            this.errors.push(`No valid symbol IDs found for insight: ${insight.title}`);
            continue;
          }

          // Insert insight
          const insightResult = await dbHandle
            .insert(semanticInsights)
            .values({
              projectId: this.options.projectId,
              insightType: insight.type,
              category: insight.category,
              severity: insight.severity,
              confidence: insight.confidence,
              priority: insight.priority,
              title: insight.title,
              description: insight.description,
              affectedSymbols: JSON.stringify(affectedSymbolIds),
              clusterId: insight.clusterId,
              metrics: JSON.stringify(insight.metrics),
              reasoning: insight.reasoning,
              detectedAt: new Date(insight.detectedAt),
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning({ id: semanticInsights.id });

          const insightId = insightResult[0]?.id;
          if (!insightId) {
            this.errors.push(`Failed to get insight ID for insight: ${insight.title}`);
            continue;
          }

          insightsStored++;

          // Store recommendations
          for (const [index, recommendation] of insight.recommendations.entries()) {
            try {
              const relatedSymbolIds = recommendation.relatedSymbols
                ?.map(symbolKey => symbolIdMapping.get(symbolKey))
                .filter(id => id !== undefined) || [];

              await dbHandle
                .insert(insightRecommendations)
                .values({
                  insightId,
                  action: recommendation.action,
                  description: recommendation.description,
                  effort: recommendation.effort,
                  impact: recommendation.impact,
                  priority: index + 1,
                  exampleCode: recommendation.exampleCode || null,
                  relatedSymbols: JSON.stringify(relatedSymbolIds),
                  createdAt: new Date()
                });

              recommendationsStored++;

            } catch (error) {
              this.errors.push(`Failed to store recommendation for insight ${insightId}: ${error}`);
            }
          }

        } catch (error) {
          this.errors.push(`Failed to store insight ${insight.title}: ${error}`);
        }
      }

    } catch (error) {
      this.errors.push(`Failed to persist semantic insights: ${error}`);
    }

    this.debug(`Stored ${insightsStored} insights and ${recommendationsStored} recommendations`);
    return { insightsStored, recommendationsStored };
  }

  /**
   * Store inferred semantic relationships
   */
  private async persistSemanticRelationships(
    contexts: Map<string, SemanticContext>,
    embeddings: CodeEmbedding[],
    symbolIdMapping: Map<string, number>,
    dbHandle: any
  ): Promise<number> {
    let stored = 0;

    try {
      this.debug("Inferring and storing semantic relationships...");

      // Create embedding similarity relationships
      const relationships = this.inferSemanticRelationships(embeddings, symbolIdMapping);

      for (const relationship of relationships) {
        try {
          const result = await dbHandle
            .insert(semanticRelationships)
            .values({
              projectId: this.options.projectId,
              fromSymbolId: relationship.fromSymbolId,
              toSymbolId: relationship.toSymbolId,
              semanticType: relationship.semanticType,
              strength: relationship.strength,
              evidence: JSON.stringify({
                confidence: relationship.confidence,
                context: relationship.context,
                inferenceMethod: relationship.inferenceMethod
              })
            })
            .returning({ id: semanticRelationships.id });

          if (result.length > 0) {
            stored++;
          }

        } catch (error) {
          this.errors.push(`Failed to store semantic relationship: ${error}`);
        }
      }

    } catch (error) {
      this.errors.push(`Failed to persist semantic relationships: ${error}`);
    }

    this.debug(`Stored ${stored} semantic relationships`);
    return stored;
  }

  /**
   * Helper methods for data transformation
   */
  private calculateReadabilityScore(context: SemanticContext): number {
    // Calculate readability based on quality indicators
    const qualityFactors = context.qualityIndicators.map(qi => {
      switch (qi.severity) {
        case 'critical': return 0.2;
        case 'error': return 0.4;
        case 'warning': return 0.6;
        case 'info': return 0.8;
        default: return 1.0;
      }
    });

    const avgQuality = qualityFactors.length > 0 
      ? qualityFactors.reduce((sum, val) => sum + val, 0) / qualityFactors.length
      : 0.8;

    // Factor in complexity metrics
    const complexityScore = Math.max(0, 1 - (context.complexityMetrics.cognitiveComplexity || 0) / 20);
    
    return Math.round((avgQuality * 0.6 + complexityScore * 0.4) * 100) / 100;
  }

  private mapSemanticRoleToArchitecturalRole(semanticRole: any): string {
    const roleMapping: Record<string, string> = {
      'data_processor': 'data',
      'behavior_controller': 'behavior', 
      'control_flow': 'control',
      'interface_provider': 'interface',
      'utility_function': 'utility',
      'configuration': 'configuration'
    };

    return roleMapping[semanticRole] || 'utility';
  }

  private generateSemanticHash(context: SemanticContext): string {
    // Generate a hash based on semantic features for quick similarity lookups
    const features = [
      context.semanticRole,
      context.architecturalLayer,
      context.moduleRole,
      context.componentType,
      ...context.usagePatterns.map(p => p.pattern)
    ].join('|');

    return Buffer.from(features).toString('base64').slice(0, 16);
  }

  private determineEmbeddingType(metadata: any): string {
    if (metadata.embeddingType) {
      return metadata.embeddingType;
    }

    // Infer type from metadata
    if (metadata.semanticRole && metadata.structuralFeatures) {
      return 'combined';
    } else if (metadata.semanticRole) {
      return 'semantic';
    } else {
      return 'structural';
    }
  }

  private inferSemanticRelationships(
    embeddings: CodeEmbedding[],
    symbolIdMapping: Map<string, number>
  ): Array<{
    fromSymbolId: number;
    toSymbolId: number;
    semanticType: string;
    strength: number;
    confidence: number;
    context: any;
    inferenceMethod: string;
  }> {
    const relationships = [];
    const processedPairs = new Set<string>();
    const similarityThreshold = 0.8;

    // Calculate pairwise similarities with deduplication
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const embeddingA = embeddings[i];
        const embeddingB = embeddings[j];

        const fromSymbolId = symbolIdMapping.get(String(embeddingA.symbolId));
        const toSymbolId = symbolIdMapping.get(String(embeddingB.symbolId));

        if (!fromSymbolId || !toSymbolId) {
          // Skip silently for semantic relationships - this is expected for some symbols
          continue;
        }

        // Create consistent pair key to prevent duplicates
        const pairKey = `${Math.min(fromSymbolId, toSymbolId)}-${Math.max(fromSymbolId, toSymbolId)}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const similarity = this.cosineSimilarity(embeddingA.embedding, embeddingB.embedding);

        if (similarity >= similarityThreshold) {
          relationships.push({
            fromSymbolId: Math.min(fromSymbolId, toSymbolId), // Consistent ordering
            toSymbolId: Math.max(fromSymbolId, toSymbolId),
            semanticType: 'semantic_similarity',
            strength: similarity,
            confidence: Math.min(0.9, similarity * 1.1),
            context: {
              similarity,
              embeddingDimensions: embeddingA.dimensions,
              threshold: similarityThreshold
            },
            inferenceMethod: 'embedding_similarity'
          });
        }
      }
    }

    this.debug(`Generated ${relationships.length} unique semantic relationships from ${embeddings.length} embeddings`);
    return relationships;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private debug(message: string): void {
    if (this.options.debugMode) {
      console.log(`[SemanticDataPersister] ${message}`);
    }
  }

  private logStats(stats: SemanticPersistenceStats): void {
    console.log(`📊 Semantic Persistence Stats:`);
    console.log(`  - Symbols updated: ${stats.symbolsUpdated}`);
    console.log(`  - Embeddings stored: ${stats.embeddingsStored}`);
    console.log(`  - Clusters stored: ${stats.clustersStored}`);
    console.log(`  - Cluster memberships: ${stats.clusterMembershipsStored}`);
    console.log(`  - Insights stored: ${stats.insightsStored}`);
    console.log(`  - Recommendations stored: ${stats.recommendationsStored}`);
    console.log(`  - Relationships stored: ${stats.relationshipsStored}`);
    console.log(`  - Processing time: ${stats.processingTimeMs}ms`);

    if (stats.errors.length > 0) {
      console.log(`  - Errors: ${stats.errors.length}`);
      if (this.options.debugMode) {
        stats.errors.forEach(error => console.log(`    * ${error}`));
      }
    }
  }
}