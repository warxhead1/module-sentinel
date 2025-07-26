/**
 * IndexerSemanticProcessor
 *
 * Handles semantic analysis and intelligence processing for the Universal Indexer.
 * This includes cross-file reference resolution, architectural pattern detection,
 * complexity metrics calculation, and semantic intelligence orchestration.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import { universalSymbols } from "../database/drizzle/schema.js";
import { SemanticOrchestrator } from "../analysis/semantic-orchestrator.js";
import { SemanticDataPersister } from "../analysis/semantic-data-persister.js";
import { ParseResult } from "../parsers/tree-sitter/parser-types.js";
import { createLogger } from "../utils/logger.js";
import { 
  inferDataFlow, 
  discoverVirtualOverrides,
  resolveSymbolReferences,
  buildCallChains
} from "../analysis/relationship-enrichment.js";

export class IndexerSemanticProcessor {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private semanticOrchestrator: SemanticOrchestrator;
  private logger = createLogger("IndexerSemanticProcessor");
  private options: any = {};
  private errors: string[] = [];

  constructor(
    db: Database,
    semanticOrchestrator: SemanticOrchestrator
  ) {
    this.rawDb = db;
    this.db = drizzle(db);
    this.semanticOrchestrator = semanticOrchestrator;
  }

  /**
   * Perform semantic analysis across all files
   */
  async performSemanticAnalysis(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>,
    options?: { enableSemanticAnalysis?: boolean; debugMode?: boolean }
  ): Promise<void> {
    // Store options for use in other methods
    this.options = options || {};

    // Resolve cross-file symbol references
    this.debug("Resolving symbol references...");
    await resolveSymbolReferences(this.db);

    // Build call chains for better relationship understanding
    this.debug("Building call chains...");
    await buildCallChains(this.db);

    // Infer data flow relationships
    this.debug("Inferring data flow relationships...");
    await inferDataFlow(this.db, projectId);

    // Discover virtual override relationships
    this.debug("Discovering virtual overrides...");
    await discoverVirtualOverrides(this.db, projectId);

    // Process semantic intelligence data from parsing
    if (this.options.enableSemanticAnalysis) {
      await this.processSemanticIntelligence(projectId, parseResults);
    }

    // Detect architectural patterns
    await this.detectArchitecturalPatterns(projectId);

    // Calculate complexity metrics
    await this.calculateComplexityMetrics(projectId);
  }

  /**
   * Process semantic intelligence data
   */
  private async processSemanticIntelligence(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>
  ): Promise<void> {
    try {
      this.debug("Processing semantic intelligence data...");

      // Collect files with semantic intelligence data
      const filesWithSemanticData = parseResults.filter(
        (r) => r.semanticIntelligence
      );

      if (filesWithSemanticData.length === 0) {
        this.debug("No semantic intelligence data to process");
        return;
      }

      this.debug(
        `Processing semantic data for ${filesWithSemanticData.length} files`
      );

      // Transform data for orchestrator
      const fileData = filesWithSemanticData.map((result) => ({
        symbols: result.symbols || [],
        relationships: result.relationships || [],
        ast: result.semanticIntelligence!.ast,
        sourceCode: result.semanticIntelligence!.sourceCode || "",
        filePath: result.filePath,
      }));

      // Process through semantic intelligence pipeline
      const startTime = Date.now();
      const results = await this.semanticOrchestrator.processMultipleFiles(
        fileData,
        {
          enableContextExtraction: true,
          enableEmbeddingGeneration: true,
          enableClustering: true,
          enableInsightGeneration: true,
          debugMode: this.options.debugMode,
        }
      );

      const duration = Date.now() - startTime;
      this.debug(`Semantic intelligence processing completed in ${duration}ms`);

      // Log results
      if (results.stats) {
        this.debug(`Analyzed ${results.stats.symbolsAnalyzed} symbols`);
        this.debug(`Generated ${results.stats.embeddingsGenerated} embeddings`);
        this.debug(`Created ${results.stats.clustersCreated} clusters`);
        this.debug(`Generated ${results.stats.insightsGenerated} insights`);
      }

      // Create symbol ID mapping for persistence
      const symbolIdMapping = await this.createSymbolIdMapping(
        projectId,
        fileData
      );

      // Persist all semantic intelligence data to database
      if (results) {
        this.debug("Persisting semantic intelligence data to database...");
        const persister = new SemanticDataPersister(this.rawDb, {
          projectId,
          debugMode: this.options.debugMode,
          batchSize: 100,
          enableTransactions: true,
        });

        const persistenceStats = await persister.persistSemanticIntelligence(
          results,
          symbolIdMapping
        );

        // Log persistence stats
        this.debug(`Semantic data persistence completed:`);
        this.debug(`  - Symbols updated: ${persistenceStats.symbolsUpdated}`);
        this.debug(
          `  - Embeddings stored: ${persistenceStats.embeddingsStored}`
        );
        this.debug(`  - Clusters stored: ${persistenceStats.clustersStored}`);
        this.debug(`  - Insights stored: ${persistenceStats.insightsStored}`);
        this.debug(
          `  - Relationships stored: ${persistenceStats.relationshipsStored}`
        );
        this.debug(
          `  - Processing time: ${persistenceStats.processingTimeMs}ms`
        );

        if (persistenceStats.errors.length > 0) {
          this.debug(`  - Errors: ${persistenceStats.errors.length}`);
          this.errors.push(...persistenceStats.errors);
        }
      }
    } catch (error) {
      this.errors.push(`Semantic intelligence processing failed: ${error}`);
      console.error("Error in processSemanticIntelligence:", error);
    }
  }


  /**
   * Detect architectural patterns across the codebase
   */
  private async detectArchitecturalPatterns(_projectId: number): Promise<void> {
    // TODO: Implement cross-file pattern detection
    // Examples: MVC, Factory clusters, Pipeline stages
    this.debug("Architectural pattern detection not yet implemented");
  }

  /**
   * Calculate complexity metrics
   * PLACEHOLDER - Move calculateComplexityMetrics method here
   */
  async calculateComplexityMetrics(_projectId: number): Promise<void> {
    // PLACEHOLDER: Move the calculateComplexityMetrics method from universal-indexer.ts here
    this.debug("Complexity metrics calculation not yet implemented");
  }

  /**
   * Create symbol ID mapping for semantic data persistence
   */
  private async createSymbolIdMapping(
    projectId: number,
    fileData: Array<{ symbols: any[]; filePath: string }>
  ): Promise<Map<string, number>> {
    const symbolIdMapping = new Map<string, number>();
    
    // Query existing symbols from database to get their IDs
    
    for (const file of fileData) {
      for (const symbol of file.symbols) {
        const dbSymbols = await this.db
          .select()
          .from(universalSymbols)
          .where(
            and(
              eq(universalSymbols.projectId, projectId),
              eq(universalSymbols.name, symbol.name),
              eq(universalSymbols.filePath, file.filePath)
            )
          );
          
        if (dbSymbols.length > 0) {
          const key = `${file.filePath}:${symbol.name}:${symbol.kind}`;
          symbolIdMapping.set(key, (dbSymbols[0] as any).id);
        }
      }
    }
    
    return symbolIdMapping;
  }

  /**
   * Debug logging helper
   */
  private debug(message: string, ...args: any[]): void {
    if (this.options.debugMode) {
      this.logger.debug(message, ...args);
    }
  }
}
