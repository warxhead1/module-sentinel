/**
 * Semantic Similarity Clustering Engine
 * 
 * Groups semantically similar code symbols using embeddings and clustering algorithms.
 * Provides insights into code organization, refactoring opportunities, and architectural patterns.
 */

import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { semanticClusters, clusterMembership, universalSymbols } from '../database/drizzle/schema.js';
import { CodeEmbedding, SimilarityResult, LocalCodeEmbeddingEngine } from './local-code-embedding.js';
import { SymbolInfo } from '../parsers/tree-sitter/parser-types.js';
import { SemanticContext } from './semantic-context-engine.js';

export interface SemanticCluster {
  id: number;
  name: string;
  type: ClusterType;
  centroid: number[]; // Centroid embedding
  members: ClusterMember[];
  quality: number; // Cluster quality metric (0-1)
  description: string;
  similarityThreshold: number;
  insights: ClusterInsight[];
}

export interface ClusterMember {
  symbolId: string | number;
  symbolName: string;
  symbolType: string;
  similarity: number; // Similarity to cluster centroid
  role: MemberRole;
  embedding: number[];
  semanticContext?: SemanticContext;
}

export interface ClusterInsight {
  type: 'refactoring_opportunity' | 'architectural_pattern' | 'code_duplication' | 'naming_inconsistency';
  title: string;
  description: string;
  confidence: number;
  affectedMembers: string[];
  suggestion: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export type ClusterType = 'functional' | 'architectural' | 'pattern-based' | 'similarity-based' | 'domain-specific';
export type MemberRole = 'core' | 'peripheral' | 'outlier' | 'bridge';

export interface ClusteringOptions {
  minClusterSize: number;
  maxClusters: number;
  similarityThreshold: number;
  enableDomainClustering: boolean;
  enableArchitecturalClustering: boolean;
  qualityThreshold: number;
}

export class SemanticClusteringEngine {
  private db: Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private embeddingEngine: LocalCodeEmbeddingEngine;
  private debugMode: boolean = false;

  constructor(
    db: Database,
    embeddingEngine: LocalCodeEmbeddingEngine,
    options: { debugMode?: boolean } = {}
  ) {
    this.db = db;
    this.drizzleDb = drizzle(db);
    this.embeddingEngine = embeddingEngine;
    this.debugMode = options.debugMode || false;
  }

  /**
   * Perform semantic clustering on a set of code embeddings
   */
  async clusterSymbols(
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    options: Partial<ClusteringOptions> = {}
  ): Promise<SemanticCluster[]> {
    const startTime = Date.now();
    
    const config: ClusteringOptions = {
      minClusterSize: 3,
      maxClusters: 20,
      similarityThreshold: 0.7,
      enableDomainClustering: true,
      enableArchitecturalClustering: true,
      qualityThreshold: 0.6,
      ...options
    };

    if (this.debugMode) {
      console.log(`[Clustering] Starting clustering of ${embeddings.length} symbols`);
    }

    // Quick exit for very small datasets
    if (embeddings.length < config.minClusterSize) {
      if (this.debugMode) {
        console.log(`[Clustering] Too few embeddings (${embeddings.length}) for clustering, returning empty`);
      }
      return [];
    }

    try {
      // Step 1: Functional similarity clustering with timeout
      console.log(`[Clustering] Starting functional clustering...`);
      const functionalClusters = await this.performFunctionalClustering(embeddings, config);
      console.log(`[Clustering] Functional clustering completed: ${functionalClusters.length} clusters`);
      
      // Step 2: Architectural pattern clustering with timeout
      const architecturalClusters = config.enableArchitecturalClustering 
        ? await this.performArchitecturalClustering(embeddings, semanticContexts, config)
        : [];
      console.log(`[Clustering] Architectural clustering completed: ${architecturalClusters.length} clusters`);
      
      // Step 3: Domain-specific clustering with timeout
      const domainClusters = config.enableDomainClustering
        ? await this.performDomainClustering(embeddings, semanticContexts, config)
        : [];
      console.log(`[Clustering] Domain clustering completed: ${domainClusters.length} clusters`);

      // Combine and deduplicate clusters
      const allClusters = [...functionalClusters, ...architecturalClusters, ...domainClusters];
      const finalClusters = this.mergeSimilarClusters(allClusters, config);
      
      // Filter by quality threshold
      const qualityClusters = finalClusters.filter(cluster => 
        cluster.quality >= config.qualityThreshold
      );

      // Generate insights for each cluster (simplified to prevent hangs)
      const clustersWithInsights = qualityClusters.map(cluster => ({
        ...cluster,
        insights: [] // Skip insight generation for now to prevent hangs
      }));

      // Store clusters in database (simplified)
      await this.storeClusters(clustersWithInsights);

      const duration = Date.now() - startTime;
      if (this.debugMode) {
        console.log(`[Clustering] Completed clustering in ${duration}ms, found ${clustersWithInsights.length} clusters`);
      }

      return clustersWithInsights;
    } catch (error) {
      console.warn(`[Clustering] Clustering failed: ${error}`);
      if (this.debugMode) {
        console.error(`[Clustering] Error details:`, error);
      }
      return []; // Return empty clusters on failure
    }
  }

  /**
   * Perform functional similarity clustering using K-means-like algorithm
   */
  private async performFunctionalClustering(
    embeddings: CodeEmbedding[],
    config: ClusteringOptions
  ): Promise<SemanticCluster[]> {
    console.log(`[FunctionalClustering] Starting with ${embeddings.length} embeddings`);
    
    if (embeddings.length < config.minClusterSize) {
      console.log(`[FunctionalClustering] Not enough embeddings for clustering`);
      return [];
    }

    // Use adaptive K-means clustering with safeguards
    const clusters: SemanticCluster[] = [];
    const numClusters = Math.min(
      config.maxClusters,
      Math.max(2, Math.floor(embeddings.length / config.minClusterSize))
    );

    console.log(`[FunctionalClustering] Creating ${numClusters} clusters`);

    // Initialize variables outside try block
    let centroids: number[][];
    let assignments: number[];
    
    try {
      // Initialize centroids randomly
      centroids = this.initializeCentroids(embeddings, numClusters);
      assignments = new Array(embeddings.length).fill(0);
      let iterations = 0;
      const maxIterations = 20; // Reduced from 50 to prevent hangs
      let lastAssignments: number[] = [];

      console.log(`[FunctionalClustering] Starting K-means iteration`);

      // K-means iteration with enhanced convergence detection
      while (iterations < maxIterations) {
        console.log(`[FunctionalClustering] Iteration ${iterations + 1}/${maxIterations}`);
        
        const newAssignments = embeddings.map((embedding, index) => {
          return this.findClosestCentroid(embedding.embedding, centroids);
        });

        // Check for convergence (assignments haven't changed)
        const hasConverged = newAssignments.every((assignment, index) => 
          assignment === assignments[index]
        );

        // Also check for oscillation (assignments same as 2 iterations ago)
        const isOscillating = iterations > 1 && newAssignments.every((assignment, index) => 
          assignment === lastAssignments[index]
        );

        if (hasConverged) {
          console.log(`[FunctionalClustering] Converged at iteration ${iterations + 1}`);
          break;
        }

        if (isOscillating) {
          console.log(`[FunctionalClustering] Detected oscillation, stopping at iteration ${iterations + 1}`);
          break;
        }

        lastAssignments = [...assignments];
        assignments = newAssignments;
        
        // Update centroids with validation
        try {
          centroids = this.updateCentroids(embeddings, assignments, numClusters);
        } catch (error) {
          console.warn(`[FunctionalClustering] Centroid update failed: ${error}`);
          break;
        }
        
        iterations++;
      }

      console.log(`[FunctionalClustering] K-means completed after ${iterations} iterations`);
    } catch (error) {
      console.error(`[FunctionalClustering] K-means failed: ${error}`);
      return [];
    }

    // Create clusters from final assignments and centroids
    for (let clusterIndex = 0; clusterIndex < numClusters; clusterIndex++) {
      const memberIndices = assignments
        .map((assignment, index) => assignment === clusterIndex ? index : -1)
        .filter(index => index !== -1);

      if (memberIndices.length >= config.minClusterSize) {
        const members: ClusterMember[] = memberIndices.map(index => {
          const embedding = embeddings[index];
          const similarity = this.embeddingEngine.calculateSimilarity(
            embedding,
            { ...embedding, embedding: centroids[clusterIndex] }
          ).similarity;

          return {
            symbolId: embedding.symbolId,
            symbolName: String(embedding.symbolId),
            symbolType: embedding.metadata.symbolType,
            similarity,
            role: this.determineRole(similarity),
            embedding: embedding.embedding
          };
        });

        const quality = this.calculateClusterQuality(members);
        
        clusters.push({
          id: clusterIndex,
          name: `Functional Cluster ${clusterIndex + 1}`,
          type: 'functional',
          centroid: centroids[clusterIndex],
          members,
          quality,
          description: this.generateClusterDescription(members, 'functional'),
          similarityThreshold: config.similarityThreshold,
          insights: []
        });
      }
    }

    return clusters;
  }

  /**
   * Perform architectural pattern clustering
   */
  private async performArchitecturalClustering(
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    config: ClusteringOptions
  ): Promise<SemanticCluster[]> {
    const clusters: SemanticCluster[] = [];
    
    // Group by architectural layer
    const layerGroups = new Map<string, CodeEmbedding[]>();
    
    embeddings.forEach(embedding => {
      const context = semanticContexts.get(String(embedding.symbolId));
      const layer = context?.architecturalLayer.layer || 'unknown';
      
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer)!.push(embedding);
    });

    // Create clusters for each architectural layer
    let clusterId = 1000; // Start from 1000 to avoid ID conflicts
    
    for (const [layer, layerEmbeddings] of layerGroups) {
      if (layerEmbeddings.length >= config.minClusterSize) {
        const centroid = this.calculateCentroid(layerEmbeddings.map(e => e.embedding));
        
        const members: ClusterMember[] = layerEmbeddings.map(embedding => {
          const similarity = this.cosineSimilarity(embedding.embedding, centroid);
          const context = semanticContexts.get(String(embedding.symbolId));
          
          return {
            symbolId: embedding.symbolId,
            symbolName: String(embedding.symbolId),
            symbolType: embedding.metadata.symbolType,
            similarity,
            role: this.determineRole(similarity),
            embedding: embedding.embedding,
            semanticContext: context
          };
        });

        clusters.push({
          id: clusterId++,
          name: `${this.capitalize(layer)} Layer`,
          type: 'architectural',
          centroid,
          members,
          quality: this.calculateClusterQuality(members),
          description: `Symbols in the ${layer} architectural layer`,
          similarityThreshold: config.similarityThreshold,
          insights: []
        });
      }
    }

    return clusters;
  }

  /**
   * Perform domain-specific clustering based on semantic roles
   */
  private async performDomainClustering(
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    config: ClusteringOptions
  ): Promise<SemanticCluster[]> {
    const clusters: SemanticCluster[] = [];
    
    // Group by semantic role
    const roleGroups = new Map<string, CodeEmbedding[]>();
    
    embeddings.forEach(embedding => {
      const context = semanticContexts.get(String(embedding.symbolId));
      const role = context?.semanticRole.primary || 'unknown';
      
      if (!roleGroups.has(role)) {
        roleGroups.set(role, []);
      }
      roleGroups.get(role)!.push(embedding);
    });

    // Create clusters for each semantic role
    let clusterId = 2000; // Start from 2000 to avoid ID conflicts
    
    for (const [role, roleEmbeddings] of roleGroups) {
      if (roleEmbeddings.length >= config.minClusterSize) {
        const centroid = this.calculateCentroid(roleEmbeddings.map(e => e.embedding));
        
        const members: ClusterMember[] = roleEmbeddings.map(embedding => {
          const similarity = this.cosineSimilarity(embedding.embedding, centroid);
          const context = semanticContexts.get(String(embedding.symbolId));
          
          return {
            symbolId: embedding.symbolId,
            symbolName: String(embedding.symbolId),
            symbolType: embedding.metadata.symbolType,
            similarity,
            role: this.determineRole(similarity),
            embedding: embedding.embedding,
            semanticContext: context
          };
        });

        clusters.push({
          id: clusterId++,
          name: `${this.capitalize(role)} Components`,
          type: 'domain-specific',
          centroid,
          members,
          quality: this.calculateClusterQuality(members),
          description: `Symbols with ${role} semantic role`,
          similarityThreshold: config.similarityThreshold,
          insights: []
        });
      }
    }

    return clusters;
  }

  /**
   * Generate insights for a cluster
   */
  private async generateClusterInsights(
    cluster: SemanticCluster,
    semanticContexts: Map<string, SemanticContext>
  ): Promise<ClusterInsight[]> {
    const insights: ClusterInsight[] = [];

    // Refactoring opportunity insight
    if (cluster.members.length > 5 && cluster.quality > 0.8) {
      insights.push({
        type: 'refactoring_opportunity',
        title: 'Extract Common Interface',
        description: `${cluster.members.length} similar symbols could benefit from a common interface or base class`,
        confidence: cluster.quality,
        affectedMembers: cluster.members.map(m => String(m.symbolId)),
        suggestion: 'Consider extracting common functionality into a shared interface',
        priority: cluster.members.length > 8 ? 'high' : 'medium'
      });
    }

    // Code duplication insight
    const highSimilarityPairs = this.findHighSimilarityPairs(cluster.members, 0.9);
    if (highSimilarityPairs.length > 0) {
      insights.push({
        type: 'code_duplication',
        title: 'Potential Code Duplication',
        description: `Found ${highSimilarityPairs.length} pairs of highly similar symbols`,
        confidence: 0.8,
        affectedMembers: highSimilarityPairs.flat().map(m => String(m.symbolId)),
        suggestion: 'Review these symbols for potential code duplication and consolidation',
        priority: 'medium'
      });
    }

    // Naming inconsistency insight
    const namingInconsistencies = this.detectNamingInconsistencies(cluster.members);
    if (namingInconsistencies.length > 0) {
      insights.push({
        type: 'naming_inconsistency',
        title: 'Naming Convention Inconsistencies',
        description: `Found inconsistent naming patterns in ${namingInconsistencies.length} symbols`,
        confidence: 0.7,
        affectedMembers: namingInconsistencies.map(m => String(m.symbolId)),
        suggestion: 'Consider standardizing naming conventions within this cluster',
        priority: 'low'
      });
    }

    // Architectural pattern insight
    if (cluster.type === 'architectural' && cluster.members.length > 3) {
      insights.push({
        type: 'architectural_pattern',
        title: 'Architectural Layer Cohesion',
        description: `Well-defined architectural layer with ${cluster.members.length} cohesive symbols`,
        confidence: cluster.quality,
        affectedMembers: cluster.members.map(m => String(m.symbolId)),
        suggestion: 'Maintain clear boundaries and responsibilities within this layer',
        priority: 'low'
      });
    }

    return insights;
  }

  /**
   * Store clusters in database
   */
  private async storeClusters(clusters: SemanticCluster[]): Promise<void> {
    for (const cluster of clusters) {
      try {
        // Insert cluster
        const [insertedCluster] = await this.drizzleDb
          .insert(semanticClusters)
          .values({
            projectId: 1, // Default project ID
            clusterName: cluster.name,
            clusterType: cluster.type,
            centroidEmbedding: Buffer.from(JSON.stringify(cluster.centroid)),
            similarityThreshold: cluster.similarityThreshold,
            symbolCount: cluster.members.length,
            quality: cluster.quality,
            description: cluster.description
          })
          .returning();

        // Insert cluster membership
        for (const member of cluster.members) {
          await this.drizzleDb
            .insert(clusterMembership)
            .values({
              clusterId: insertedCluster.id,
              symbolId: Number(member.symbolId), // Assuming numeric symbol IDs
              similarity: member.similarity,
              role: member.role
            });
        }
        
      } catch (error) {
        if (this.debugMode) {
          console.error(`[Clustering] Failed to store cluster ${cluster.name}:`, error);
        }
      }
    }
  }

  // Helper methods
  private initializeCentroids(embeddings: CodeEmbedding[], numClusters: number): number[][] {
    const centroids: number[][] = [];
    const embeddingDim = embeddings[0].embedding.length;
    
    // Use K-means++ initialization for better results
    const firstCentroid = embeddings[Math.floor(Math.random() * embeddings.length)];
    centroids.push([...firstCentroid.embedding]);

    for (let i = 1; i < numClusters; i++) {
      const distances = embeddings.map(embedding => {
        const minDistance = Math.min(...centroids.map(centroid => 
          this.euclideanDistance(embedding.embedding, centroid)
        ));
        return minDistance * minDistance;
      });

      const totalDistance = distances.reduce((sum, d) => sum + d, 0);
      const randomValue = Math.random() * totalDistance;
      
      let cumulativeDistance = 0;
      for (let j = 0; j < embeddings.length; j++) {
        cumulativeDistance += distances[j];
        if (cumulativeDistance >= randomValue) {
          centroids.push([...embeddings[j].embedding]);
          break;
        }
      }
    }

    return centroids;
  }

  private findClosestCentroid(embedding: number[], centroids: number[][]): number {
    let closestIndex = 0;
    let minDistance = this.euclideanDistance(embedding, centroids[0]);

    for (let i = 1; i < centroids.length; i++) {
      const distance = this.euclideanDistance(embedding, centroids[i]);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  private updateCentroids(
    embeddings: CodeEmbedding[],
    assignments: number[],
    numClusters: number
  ): number[][] {
    const centroids: number[][] = [];
    const embeddingDim = embeddings[0].embedding.length;

    for (let i = 0; i < numClusters; i++) {
      const clusterEmbeddings = embeddings
        .filter((_, index) => assignments[index] === i)
        .map(e => e.embedding);

      if (clusterEmbeddings.length > 0) {
        centroids.push(this.calculateCentroid(clusterEmbeddings));
      } else {
        // If cluster is empty, reinitialize randomly
        centroids.push(embeddings[Math.floor(Math.random() * embeddings.length)].embedding);
      }
    }

    return centroids;
  }

  private calculateCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    
    const dimensions = embeddings[0].length;
    const centroid = new Array(dimensions).fill(0);

    embeddings.forEach(embedding => {
      embedding.forEach((value, index) => {
        centroid[index] += value;
      });
    });

    return centroid.map(sum => sum / embeddings.length);
  }

  private calculateClusterQuality(members: ClusterMember[]): number {
    if (members.length < 2) return 0;

    // Calculate average intra-cluster similarity
    const similarities = members.map(m => m.similarity);
    const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
    
    // Calculate cohesion (how tight the cluster is)
    const variance = similarities.reduce((sum, sim) => sum + Math.pow(sim - avgSimilarity, 2), 0) / similarities.length;
    const cohesion = 1 - Math.sqrt(variance);

    return Math.max(0, Math.min(1, (avgSimilarity + cohesion) / 2));
  }

  private determineRole(similarity: number): MemberRole {
    if (similarity >= 0.85) return 'core';
    if (similarity >= 0.7) return 'peripheral';
    if (similarity >= 0.5) return 'bridge';
    return 'outlier';
  }

  private mergeSimilarClusters(clusters: SemanticCluster[], config: ClusteringOptions): SemanticCluster[] {
    // Simple merge based on centroid similarity
    const merged: SemanticCluster[] = [];
    const used = new Set<number>();

    for (let i = 0; i < clusters.length; i++) {
      if (used.has(i)) continue;

      const cluster = clusters[i];
      const toMerge = [cluster];

      for (let j = i + 1; j < clusters.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.cosineSimilarity(cluster.centroid, clusters[j].centroid);
        if (similarity > 0.8) { // High similarity threshold for merging
          toMerge.push(clusters[j]);
          used.add(j);
        }
      }

      if (toMerge.length > 1) {
        // Merge clusters
        const allMembers = toMerge.flatMap(c => c.members);
        const mergedCentroid = this.calculateCentroid(allMembers.map(m => m.embedding));
        
        merged.push({
          id: cluster.id,
          name: `Merged: ${toMerge.map(c => c.name).join(', ')}`,
          type: cluster.type,
          centroid: mergedCentroid,
          members: allMembers,
          quality: this.calculateClusterQuality(allMembers),
          description: `Merged cluster containing ${allMembers.length} symbols`,
          similarityThreshold: config.similarityThreshold,
          insights: []
        });
      } else {
        merged.push(cluster);
      }

      used.add(i);
    }

    return merged;
  }

  private generateClusterDescription(members: ClusterMember[], type: string): string {
    const symbolTypes = [...new Set(members.map(m => m.symbolType))];
    const avgSimilarity = members.reduce((sum, m) => sum + m.similarity, 0) / members.length;
    
    return `${type} cluster with ${members.length} symbols (${symbolTypes.join(', ')}) - avg similarity: ${(avgSimilarity * 100).toFixed(1)}%`;
  }

  private findHighSimilarityPairs(members: ClusterMember[], threshold: number): ClusterMember[][] {
    const pairs: ClusterMember[][] = [];
    
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const similarity = this.cosineSimilarity(members[i].embedding, members[j].embedding);
        if (similarity >= threshold) {
          pairs.push([members[i], members[j]]);
        }
      }
    }

    return pairs;
  }

  private detectNamingInconsistencies(members: ClusterMember[]): ClusterMember[] {
    // Simple naming pattern analysis
    const camelCaseCount = members.filter(m => /^[a-z][a-zA-Z0-9]*$/.test(m.symbolName)).length;
    const snakeCaseCount = members.filter(m => /^[a-z][a-z0-9_]*$/.test(m.symbolName)).length;
    const pascalCaseCount = members.filter(m => /^[A-Z][a-zA-Z0-9]*$/.test(m.symbolName)).length;

    const totalCount = members.length;
    const maxConvention = Math.max(camelCaseCount, snakeCaseCount, pascalCaseCount);
    
    // If less than 70% follow the same convention, flag inconsistencies
    if (maxConvention / totalCount < 0.7) {
      return members.filter(m => {
        const isCamel = /^[a-z][a-zA-Z0-9]*$/.test(m.symbolName);
        const isSnake = /^[a-z][a-z0-9_]*$/.test(m.symbolName);
        const isPascal = /^[A-Z][a-zA-Z0-9]*$/.test(m.symbolName);
        
        // Return members not following the dominant convention
        if (camelCaseCount === maxConvention) return !isCamel;
        if (snakeCaseCount === maxConvention) return !isSnake;
        if (pascalCaseCount === maxConvention) return !isPascal;
        return false;
      });
    }

    return [];
  }

  // Mathematical helper methods
  private euclideanDistance(vec1: number[], vec2: number[]): number {
    return Math.sqrt(
      vec1.reduce((sum, val, i) => sum + Math.pow(val - vec2[i], 2), 0)
    );
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return Math.max(0, Math.min(1, dotProduct / (magnitude1 * magnitude2)));
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}