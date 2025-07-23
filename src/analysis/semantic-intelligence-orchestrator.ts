/**
 * Semantic Intelligence Orchestrator
 * 
 * Coordinates the entire semantic intelligence pipeline:
 * 1. Context extraction from parsed symbols
 * 2. Embedding generation 
 * 3. Similarity clustering
 * 4. Insight generation
 * 5. Integration with existing parsers
 */

import { Database } from 'better-sqlite3';
import Parser from 'tree-sitter';
import { SemanticContextEngine, SemanticContext } from './semantic-context-engine.js';
import { LocalCodeEmbeddingEngine, CodeEmbedding } from './local-code-embedding.js';
import { SemanticClusteringEngine, SemanticCluster } from './semantic-clustering-engine.js';
import { SemanticInsightsGenerator, SemanticInsight } from './semantic-insights-generator.js';
import { SymbolInfo, RelationshipInfo } from '../parsers/tree-sitter/parser-types.js';

export interface SemanticIntelligenceResult {
  contexts: Map<string, SemanticContext>;
  embeddings: CodeEmbedding[];
  clusters: SemanticCluster[];
  insights: SemanticInsight[];
  stats: SemanticIntelligenceStats;
}

export interface SemanticIntelligenceStats {
  symbolsAnalyzed: number;
  contextsExtracted: number;
  embeddingsGenerated: number;
  clustersCreated: number;
  insightsGenerated: number;
  totalProcessingTimeMs: number;
  cacheHitRate: number;
}

export interface SemanticIntelligenceOptions {
  enableContextExtraction: boolean;
  enableEmbeddingGeneration: boolean;
  enableClustering: boolean;
  enableInsightGeneration: boolean;
  embeddingDimensions: number;
  clusteringOptions: any;
  insightOptions: any;
  debugMode: boolean;
  maxConcurrency: number;
}

export class SemanticIntelligenceOrchestrator {
  private db: Database;
  private contextEngine: SemanticContextEngine;
  private embeddingEngine: LocalCodeEmbeddingEngine;
  private clusteringEngine: SemanticClusteringEngine;
  private insightsGenerator: SemanticInsightsGenerator;
  private debugMode: boolean = false;

  constructor(
    db: Database,
    options: { debugMode?: boolean; embeddingDimensions?: number } = {}
  ) {
    this.db = db;
    this.debugMode = options.debugMode || false;

    // Check if database is writable
    let isReadOnly = false;
    try {
      // Test database write capability
      db.prepare('CREATE TEMP TABLE IF NOT EXISTS test_write (id INTEGER)').run();
      db.prepare('DROP TABLE IF EXISTS test_write').run();
    } catch (error) {
      console.warn('[SemanticOrchestrator] Database is read-only, semantic intelligence will run in limited mode');
      isReadOnly = true;
    }

    // Initialize engines with read-only awareness
    try {
      this.contextEngine = new SemanticContextEngine(db, { debugMode: this.debugMode });
      this.embeddingEngine = new LocalCodeEmbeddingEngine(db, { 
        dimensions: options.embeddingDimensions || 256,
        debugMode: this.debugMode 
      });
      this.clusteringEngine = new SemanticClusteringEngine(db, this.embeddingEngine, { 
        debugMode: this.debugMode 
      });
      this.insightsGenerator = new SemanticInsightsGenerator(
        db, 
        this.clusteringEngine, 
        this.embeddingEngine, 
        { debugMode: this.debugMode }
      );
      
      console.log('[SemanticOrchestrator] All semantic engines initialized successfully');
    } catch (error) {
      console.error('[SemanticOrchestrator] Failed to initialize semantic engines:', error);
      throw error;
    }
  }

  /**
   * Process symbols through the complete semantic intelligence pipeline
   */
  async processSymbols(
    symbols: SymbolInfo[],
    relationships: RelationshipInfo[],
    ast: Parser.Tree,
    sourceCode: string,
    filePath: string,
    options: Partial<SemanticIntelligenceOptions> = {}
  ): Promise<SemanticIntelligenceResult> {
    const startTime = Date.now();
    
    const config: SemanticIntelligenceOptions = {
      enableContextExtraction: true,
      enableEmbeddingGeneration: true,
      enableClustering: true,
      enableInsightGeneration: true,
      embeddingDimensions: 256,
      clusteringOptions: {},
      insightOptions: {},
      debugMode: this.debugMode,
      maxConcurrency: 4,
      ...options
    };

    // Add overall timeout to prevent entire semantic processing from hanging
    const semanticProcessingTimeout = 5000; // 5 second timeout for entire semantic processing
    
    return Promise.race([
      this.processSymbolsInternal(symbols, relationships, ast, sourceCode, filePath, config),
      new Promise<SemanticIntelligenceResult>((_, reject) => 
        setTimeout(() => reject(new Error(`Semantic processing timeout after ${semanticProcessingTimeout}ms`)), semanticProcessingTimeout)
      )
    ]);
  }

  private async processSymbolsInternal(
    symbols: SymbolInfo[],
    relationships: RelationshipInfo[],
    ast: Parser.Tree,
    sourceCode: string,
    filePath: string,
    config: SemanticIntelligenceOptions
  ): Promise<SemanticIntelligenceResult> {
    const startTime = Date.now();
    
    if (this.debugMode) {
      console.log(`[SemanticOrchestrator] Processing ${symbols.length} symbols from ${filePath}`);
    }

    const stats: SemanticIntelligenceStats = {
      symbolsAnalyzed: symbols.length,
      contextsExtracted: 0,
      embeddingsGenerated: 0,
      clustersCreated: 0,
      insightsGenerated: 0,
      totalProcessingTimeMs: 0,
      cacheHitRate: 0
    };

    // Step 1: Extract semantic contexts
    const contexts = new Map<string, SemanticContext>();
    if (config.enableContextExtraction) {
      const contextStartTime = Date.now();
      
      try {
        for (const symbol of symbols) {
          try {
            const context = await this.contextEngine.extractSemanticContext(
              symbol, ast, sourceCode, relationships
            );
            contexts.set(symbol.qualifiedName, context);
            stats.contextsExtracted++;
          } catch (error) {
            console.warn(`[SemanticOrchestrator] Context extraction failed for ${symbol.name}:`, error);
            // Continue with other symbols
          }
        }
      } catch (error) {
        console.error(`[SemanticOrchestrator] Context extraction loop failed:`, error);
        // Continue with partial results
      }
      
      if (this.debugMode) {
        console.log(`[SemanticOrchestrator] Extracted ${stats.contextsExtracted} contexts in ${Date.now() - contextStartTime}ms`);
      }
    }

    // Step 2: Generate embeddings with timeout
    const embeddings: CodeEmbedding[] = [];
    if (config.enableEmbeddingGeneration && symbols.length > 0) {
      const embeddingStartTime = Date.now();
      
      // Prepare batch data
      const batchData = symbols.map(symbol => ({
        symbol,
        ast,
        sourceCode,
        semanticContext: contexts.get(symbol.qualifiedName),
        relationships: relationships.filter(r => 
          r.fromName === symbol.qualifiedName || r.toName === symbol.qualifiedName
        )
      }));

      try {
        console.log(`[SemanticOrchestrator] Attempting to generate embeddings for ${batchData.length} symbols`);
        
        // Add timeout for embedding generation
        const embeddingPromise = this.embeddingEngine.generateBatchEmbeddings(batchData);
        const embeddingTimeout = 15000; // 15 second timeout for embedding generation
        
        const batchEmbeddings = await Promise.race([
          embeddingPromise,
          new Promise<CodeEmbedding[]>((_, reject) => 
            setTimeout(() => reject(new Error(`Embedding generation timeout after ${embeddingTimeout}ms`)), embeddingTimeout)
          )
        ]);
        
        embeddings.push(...batchEmbeddings);
        stats.embeddingsGenerated = batchEmbeddings.length;
        
        console.log(`[SemanticOrchestrator] Generated ${stats.embeddingsGenerated} embeddings in ${Date.now() - embeddingStartTime}ms`);
      } catch (error) {
        console.warn('[SemanticOrchestrator] Embedding generation failed or timed out:', error);
        if (this.debugMode) {
          console.error('[SemanticOrchestrator] Error stack:', error instanceof Error ? error.stack : String(error));
        }
        // Continue without embeddings
      }
    }

    // Step 3: Perform clustering with timeout
    const clusters: SemanticCluster[] = [];
    if (config.enableClustering && embeddings.length > 2) {
      const clusteringStartTime = Date.now();
      
      try {
        // Add timeout for clustering
        const clusteringPromise = this.clusteringEngine.clusterSymbols(
          embeddings, 
          contexts, 
          config.clusteringOptions
        );
        const clusteringTimeout = 10000; // 10 second timeout for clustering
        
        const clusterResults = await Promise.race([
          clusteringPromise,
          new Promise<SemanticCluster[]>((_, reject) => 
            setTimeout(() => reject(new Error(`Clustering timeout after ${clusteringTimeout}ms`)), clusteringTimeout)
          )
        ]);
        
        clusters.push(...clusterResults);
        stats.clustersCreated = clusterResults.length;
        
        if (this.debugMode) {
          console.log(`[SemanticOrchestrator] Created ${stats.clustersCreated} clusters in ${Date.now() - clusteringStartTime}ms`);
        }
      } catch (error) {
        console.warn('[SemanticOrchestrator] Clustering failed or timed out:', error);
        if (this.debugMode) {
          console.error('[SemanticOrchestrator] Clustering error:', error);
        }
        // Continue without clustering
      }
    }

    console.log(`[DEBUG] Moving to Step 4: Insights (enabled=${config.enableInsightGeneration}, clusters=${clusters.length})`);

    // Step 4: Generate insights with timeout
    const insights: SemanticInsight[] = [];
    if (config.enableInsightGeneration && clusters.length > 0) {
      const insightStartTime = Date.now();
      
      try {
        // Add timeout for insight generation
        const insightPromise = this.insightsGenerator.generateInsights(
          clusters,
          embeddings,
          contexts,
          symbols,
          config.insightOptions
        );
        const insightTimeout = 8000; // 8 second timeout for insight generation
        
        const insightResults = await Promise.race([
          insightPromise,
          new Promise<SemanticInsight[]>((_, reject) => 
            setTimeout(() => reject(new Error(`Insight generation timeout after ${insightTimeout}ms`)), insightTimeout)
          )
        ]);
        
        insights.push(...insightResults);
        stats.insightsGenerated = insightResults.length;
        
        if (this.debugMode) {
          console.log(`[SemanticOrchestrator] Generated ${stats.insightsGenerated} insights in ${Date.now() - insightStartTime}ms`);
        }
      } catch (error) {
        console.warn('[SemanticOrchestrator] Insight generation failed or timed out:', error);
        if (this.debugMode) {
          console.error('[SemanticOrchestrator] Insight generation error:', error);
        }
        // Continue without insights
      }
    }

    console.log(`[DEBUG] All processing steps completed, calculating final stats...`);

    stats.totalProcessingTimeMs = Date.now() - startTime;
    
    console.log(`[DEBUG] Stats calculated, totalProcessingTimeMs=${stats.totalProcessingTimeMs}`);

    if (this.debugMode) {
      console.log(`[SemanticOrchestrator] Complete pipeline finished in ${stats.totalProcessingTimeMs}ms`);
      console.log(`  - Contexts: ${stats.contextsExtracted}/${symbols.length}`);
      console.log(`  - Embeddings: ${stats.embeddingsGenerated}`);
      console.log(`  - Clusters: ${stats.clustersCreated}`);
      console.log(`  - Insights: ${stats.insightsGenerated}`);
    }

    console.log(`[DEBUG] About to return semantic intelligence results...`);

    return {
      contexts,
      embeddings,
      clusters,
      insights,
      stats
    };
  }

  /**
   * Process multiple files through the semantic intelligence pipeline
   */
  async processMultipleFiles(
    fileData: Array<{
      symbols: SymbolInfo[];
      relationships: RelationshipInfo[];
      ast: Parser.Tree;
      sourceCode: string;
      filePath: string;
    }>,
    options: Partial<SemanticIntelligenceOptions> = {}
  ): Promise<SemanticIntelligenceResult> {
    const startTime = Date.now();
    
    if (this.debugMode) {
      console.log(`[SemanticOrchestrator] Processing ${fileData.length} files`);
    }

    // Process each file and collect results
    const allContexts = new Map<string, SemanticContext>();
    const allEmbeddings: CodeEmbedding[] = [];
    const allSymbols: SymbolInfo[] = [];
    let totalStats: SemanticIntelligenceStats = {
      symbolsAnalyzed: 0,
      contextsExtracted: 0,
      embeddingsGenerated: 0,
      clustersCreated: 0,
      insightsGenerated: 0,
      totalProcessingTimeMs: 0,
      cacheHitRate: 0
    };

    // Process files in batches to control memory usage
    const batchSize = Math.min(options.maxConcurrency || 4, fileData.length);
    
    for (let i = 0; i < fileData.length; i += batchSize) {
      const batch = fileData.slice(i, i + batchSize);
      
      const batchPromises = batch.map(file => 
        this.processSymbols(
          file.symbols,
          file.relationships,
          file.ast,
          file.sourceCode,
          file.filePath,
          { ...options, enableClustering: false, enableInsightGeneration: false }
        )
      );

      const batchResults = await Promise.all(batchPromises);
      
      // Aggregate results
      for (const result of batchResults) {
        // Merge contexts
        for (const [key, context] of result.contexts) {
          allContexts.set(key, context);
        }
        
        allEmbeddings.push(...result.embeddings);
        totalStats.symbolsAnalyzed += result.stats.symbolsAnalyzed;
        totalStats.contextsExtracted += result.stats.contextsExtracted;
        totalStats.embeddingsGenerated += result.stats.embeddingsGenerated;
      }
    }

    // Collect all symbols
    for (const file of fileData) {
      allSymbols.push(...file.symbols);
    }

    // Now perform clustering and insight generation on the aggregated data
    const clusters: SemanticCluster[] = [];
    const insights: SemanticInsight[] = [];

    if (options.enableClustering !== false && allEmbeddings.length > 2) {
      const clusterResults = await this.clusteringEngine.clusterSymbols(
        allEmbeddings,
        allContexts,
        options.clusteringOptions || {}
      );
      clusters.push(...clusterResults);
      totalStats.clustersCreated = clusterResults.length;
    }

    if (options.enableInsightGeneration !== false && clusters.length > 0) {
      const insightResults = await this.insightsGenerator.generateInsights(
        clusters,
        allEmbeddings,
        allContexts,
        allSymbols,
        options.insightOptions || {}
      );
      insights.push(...insightResults);
      totalStats.insightsGenerated = insightResults.length;
    }

    totalStats.totalProcessingTimeMs = Date.now() - startTime;

    if (this.debugMode) {
      console.log(`[SemanticOrchestrator] Multi-file processing completed in ${totalStats.totalProcessingTimeMs}ms`);
    }

    return {
      contexts: allContexts,
      embeddings: allEmbeddings,
      clusters,
      insights,
      stats: totalStats
    };
  }

  /**
   * Get existing insights from database
   */
  async getStoredInsights(filters: any = {}): Promise<SemanticInsight[]> {
    return this.insightsGenerator.getStoredInsights(filters);
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.embeddingEngine.clearCache();
    // Add other cache clearing as needed
  }

  /**
   * Get statistics about the semantic intelligence system
   */
  getSystemStats(): any {
    return {
      // Could include cache statistics, database stats, etc.
      timestamp: Date.now()
    };
  }
}