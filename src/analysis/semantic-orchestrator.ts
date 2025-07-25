/**
 * Semantic Orchestrator
 * 
 * Main coordination engine for semantic analysis. Replaces the complex logic in
 * semantic-context-engine.ts with a clean orchestrator that uses specialized analyzers.
 * Provides the same interface while eliminating code duplication and improving maintainability.
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import { Logger, createLogger } from "../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../utils/memory-monitor.js";
import { SymbolInfo, RelationshipInfo } from "../parsers/tree-sitter/parser-types.js";
import { UniversalSymbol } from "../types/universal-types.js";
import { CodeMetricsAnalyzer, MetricsInput, ComplexityMetrics } from "./code-metrics-analyzer.js";
import { SemanticIntelligenceResult } from "./semantic-data-persister.js";
import { PatternRecognitionEngine, PatternAnalysisInput, PatternAnalysisResult } from "./pattern-recognition-engine.js";
import { LocalCodeEmbeddingEngine, CodeEmbedding } from "./local-code-embedding.js";
import { SemanticClusteringEngine, SemanticCluster } from "./semantic-clustering-engine.js";
import { SemanticInsightsGenerator, SemanticInsight } from "./semantic-insights-generator.js";

// Re-export types for backward compatibility
export {
  SemanticRole,
  UsagePattern,
  UsageExample,
  ArchitecturalLayer,
  ModuleRole,
  ComponentType,
  QualityIndicator,
  AlgorithmicPattern,
  SemanticRelationship,
  PerformanceCharacteristics,
  ReadabilityMetrics,
  RefactoringOpportunity
} from "./pattern-recognition-engine.js";

export { ComplexityMetrics } from "./code-metrics-analyzer.js";

/**
 * Comprehensive semantic context for a symbol
 * Combines complexity metrics with pattern analysis results
 */
export interface SemanticContext {
  // Core identification
  symbolId: number | string;
  
  // Pattern analysis results
  semanticRole: PatternAnalysisResult['semanticRole'];
  usagePatterns: PatternAnalysisResult['usagePatterns'];
  architecturalLayer: PatternAnalysisResult['architecturalLayer'];
  moduleRole: PatternAnalysisResult['moduleRole'];
  componentType: PatternAnalysisResult['componentType'];
  qualityIndicators: PatternAnalysisResult['qualityIndicators'];
  algorithmicPatterns: PatternAnalysisResult['algorithmicPatterns'];
  semanticRelationships: PatternAnalysisResult['semanticRelationships'];
  performanceCharacteristics: PatternAnalysisResult['performanceCharacteristics'];
  readabilityMetrics: PatternAnalysisResult['readabilityMetrics'];
  refactoringOpportunities: PatternAnalysisResult['refactoringOpportunities'];
  
  // Complexity metrics
  complexityMetrics: ComplexityMetrics;
  
  // Derived metrics
  dependencyStrength: number;
  cohesionScore: number;
  changeFrequency: number;
  maintenanceRisk: "low" | "medium" | "high" | "critical";
}

export interface SemanticAnalysisOptions {
  debugMode?: boolean;
  enableTimeout?: boolean;
  maxAnalysisTime?: number;
  language?: string;
  filePath?: string;
  embeddingDimensions?: number;
}

export class SemanticOrchestrator {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private metricsAnalyzer: CodeMetricsAnalyzer;
  private patternEngine: PatternRecognitionEngine;
  private embeddingEngine: LocalCodeEmbeddingEngine;
  private clusteringEngine: SemanticClusteringEngine;
  private insightsGenerator: SemanticInsightsGenerator;
  private db?: Database;

  constructor(db?: Database, _options: SemanticAnalysisOptions = {}) {
    this.logger = createLogger('SemanticOrchestrator');
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.db = db;
    
    // Initialize specialized analyzers
    this.metricsAnalyzer = new CodeMetricsAnalyzer();
    this.patternEngine = new PatternRecognitionEngine(db);
    this.embeddingEngine = new LocalCodeEmbeddingEngine(db!);
    this.clusteringEngine = new SemanticClusteringEngine(db!, this.embeddingEngine);
    this.insightsGenerator = new SemanticInsightsGenerator(db!, this.clusteringEngine, this.embeddingEngine);
  }

  /**
   * Extract comprehensive semantic context for a symbol
   * Main entry point that replaces semantic-context-engine.extractSemanticContext()
   */
  async extractSemanticContext(
    symbol: SymbolInfo | UniversalSymbol,
    ast: Parser.Tree,
    sourceCode: string,
    relationships: RelationshipInfo[],
    options: SemanticAnalysisOptions = {}
  ): Promise<SemanticContext> {
    const checkpoint = this.memoryMonitor.createCheckpoint('extractSemanticContext');
    const startTime = Date.now();
    
    try {
      this.logger.debug('Starting semantic context extraction', {
        symbolName: symbol.name,
        symbolKind: symbol.kind,
        hasAst: !!ast,
        relationshipCount: relationships.length,
        language: options.language
      });

      // Prepare inputs for analyzers
      const metricsInput = this.prepareMetricsInput(symbol, sourceCode, options);
      const patternInput = this.preparePatternInput(symbol, sourceCode, ast, relationships, options);

      // Run analysis in parallel with global timeout
      const maxTime = options.maxAnalysisTime || 5000; // 5 second default
      const analysisPromise = this.runParallelAnalysis(metricsInput, patternInput);
      
      const analysisResult = options.enableTimeout !== false 
        ? await this.withGlobalTimeout(analysisPromise, maxTime)
        : await analysisPromise;

      // Calculate derived metrics
      const dependencyStrength = this.calculateDependencyStrength(relationships);
      const cohesionScore = this.calculateCohesionScore(symbol, analysisResult.patterns.semanticRelationships);
      const changeFrequency = await this.calculateChangeFrequency(symbol);
      const maintenanceRisk = this.assessMaintenanceRisk(
        analysisResult.patterns.qualityIndicators,
        analysisResult.metrics
      );

      const context: SemanticContext = {
        symbolId: (symbol as any).id || symbol.name,
        
        // Pattern analysis results
        semanticRole: analysisResult.patterns.semanticRole,
        usagePatterns: analysisResult.patterns.usagePatterns,
        architecturalLayer: analysisResult.patterns.architecturalLayer,
        moduleRole: analysisResult.patterns.moduleRole,
        componentType: analysisResult.patterns.componentType,
        qualityIndicators: analysisResult.patterns.qualityIndicators,
        algorithmicPatterns: analysisResult.patterns.algorithmicPatterns,
        semanticRelationships: analysisResult.patterns.semanticRelationships,
        performanceCharacteristics: analysisResult.patterns.performanceCharacteristics,
        readabilityMetrics: analysisResult.patterns.readabilityMetrics,
        refactoringOpportunities: analysisResult.patterns.refactoringOpportunities,
        
        // Complexity metrics
        complexityMetrics: analysisResult.metrics,
        
        // Derived metrics
        dependencyStrength,
        cohesionScore,
        changeFrequency,
        maintenanceRisk
      };

      const duration = Date.now() - startTime;
      this.logger.debug('Semantic context extraction completed', {
        symbolName: symbol.name,
        duration: `${duration}ms`,
        riskLevel: context.complexityMetrics.riskLevel,
        semanticRole: context.semanticRole.primary,
        maintenanceRisk
      });

      return context;

    } catch (error) {
      this.logger.error('Semantic context extraction failed', error, {
        symbolName: symbol.name,
        symbolKind: symbol.kind
      });
      
      // Return safe default context
      return this.createDefaultContext(symbol);
      
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Run complexity and pattern analysis in parallel
   */
  private async runParallelAnalysis(
    metricsInput: MetricsInput,
    patternInput: PatternAnalysisInput
  ): Promise<{ metrics: ComplexityMetrics; patterns: PatternAnalysisResult }> {
    
    // Run both analyzers in parallel for maximum efficiency
    const [metricsResult, patternsResult] = await Promise.allSettled([
      this.metricsAnalyzer.analyzeComplexity(metricsInput),
      this.patternEngine.analyzePatterns(patternInput)
    ]);

    // Extract results with graceful fallbacks
    const metrics = metricsResult.status === 'fulfilled' 
      ? metricsResult.value 
      : this.createDefaultMetrics();
      
    const patterns = patternsResult.status === 'fulfilled'
      ? patternsResult.value
      : this.createDefaultPatterns();

    return { metrics, patterns };
  }

  /**
   * Prepare input for complexity metrics analyzer
   */
  private prepareMetricsInput(
    symbol: SymbolInfo | UniversalSymbol,
    sourceCode: string,
    options: SemanticAnalysisOptions
  ): MetricsInput {
    // Extract symbol-specific source code if possible
    let symbolSource = sourceCode;
    const lines = sourceCode.split('\n');
    
    if (symbol.line && symbol.endLine) {
      const startLine = Math.max(0, symbol.line - 1);
      const endLine = Math.min(lines.length, symbol.endLine);
      symbolSource = lines.slice(startLine, endLine).join('\n');
    }

    return {
      source: symbolSource,
      lines: symbolSource.split('\n'),
      symbol: {
        name: symbol.name,
        kind: symbol.kind,
        signature: symbol.signature,
        returnType: symbol.returnType,
        line: symbol.line,
        endLine: symbol.endLine
      },
      language: options.language,
      maxLines: 500, // Reasonable limit for performance
      enableTimeout: options.enableTimeout !== false
    };
  }

  /**
   * Prepare input for pattern recognition engine
   */
  private preparePatternInput(
    symbol: SymbolInfo | UniversalSymbol,
    sourceCode: string,
    ast: Parser.Tree,
    relationships: RelationshipInfo[],
    options: SemanticAnalysisOptions
  ): PatternAnalysisInput {
    return {
      symbol,
      sourceCode,
      ast,
      relationships,
      filePath: options.filePath
    };
  }

  /**
   * Apply global timeout to analysis
   */
  private async withGlobalTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Semantic analysis timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      )
    ]);
  }

  /**
   * Calculate dependency strength based on relationships
   */
  private calculateDependencyStrength(relationships: RelationshipInfo[]): number {
    if (relationships.length === 0) return 0.1;
    
    // Weight different relationship types
    const weights = {
      'inherits': 0.9,
      'implements': 0.8,
      'calls': 0.6,
      'uses': 0.5,
      'includes': 0.4,
      'creates': 0.7
    };
    
    const totalWeight = relationships.reduce((sum, rel) => {
      return sum + (weights[rel.relationshipType as keyof typeof weights] || 0.3);
    }, 0);
    
    return Math.min(1.0, totalWeight / Math.max(relationships.length, 1));
  }

  /**
   * Calculate cohesion score based on semantic relationships
   */
  private calculateCohesionScore(
    symbol: SymbolInfo | UniversalSymbol,
    semanticRelationships: PatternAnalysisResult['semanticRelationships']
  ): number {
    if (semanticRelationships.length === 0) return 0.5;
    
    // Average semantic similarity of relationships
    const avgSimilarity = semanticRelationships.reduce((sum, rel) => {
      return sum + rel.semanticSimilarity;
    }, 0) / semanticRelationships.length;
    
    return avgSimilarity;
  }

  /**
   * Calculate change frequency (placeholder - would integrate with VCS)
   */
  private async calculateChangeFrequency(_symbol: SymbolInfo | UniversalSymbol): Promise<number> {
    // Placeholder implementation
    // In a real system, this would analyze git history or other VCS data
    return 0.3;
  }

  /**
   * Assess maintenance risk based on quality and complexity
   */
  private assessMaintenanceRisk(
    qualityIndicators: PatternAnalysisResult['qualityIndicators'],
    complexityMetrics: ComplexityMetrics
  ): "low" | "medium" | "high" | "critical" {
    
    // Use the risk level from complexity metrics as base
    let riskScore = 0;
    
    switch (complexityMetrics.riskLevel) {
      case 'critical': riskScore = 4; break;
      case 'high': riskScore = 3; break;
      case 'medium': riskScore = 2; break;
      case 'low': riskScore = 1; break;
    }
    
    // Adjust based on quality indicators
    const criticalIssues = qualityIndicators.filter(qi => qi.severity === 'critical').length;
    const errorIssues = qualityIndicators.filter(qi => qi.severity === 'error').length;
    
    riskScore += criticalIssues * 2 + errorIssues;
    
    // Map back to risk level
    if (riskScore >= 6) return "critical";
    if (riskScore >= 4) return "high";
    if (riskScore >= 2) return "medium";
    return "low";
  }

  /**
   * Create default context for error cases
   */
  private createDefaultContext(symbol: SymbolInfo | UniversalSymbol): SemanticContext {
    return {
      symbolId: (symbol as any).id || symbol.name,
      semanticRole: { primary: "utility", confidence: 0.1 },
      usagePatterns: [],
      architecturalLayer: { layer: "unknown", confidence: 0.1 },
      moduleRole: { role: "utility", importance: "utility", publicInterface: false },
      componentType: { type: "helper", confidence: 0.1 },
      qualityIndicators: [],
      algorithmicPatterns: [],
      semanticRelationships: [],
      performanceCharacteristics: {
        executionMode: "balanced",
        scalability: "unknown",
        resourceUsage: { memory: "unknown", cpu: "unknown", io: "unknown" },
        parallelizable: false,
        cacheable: false
      },
      readabilityMetrics: {
        namingQuality: 0.5,
        commentQuality: 0.5,
        structureClarity: 0.5,
        overallReadability: 0.5,
        improvementSuggestions: []
      },
      refactoringOpportunities: [],
      complexityMetrics: this.createDefaultMetrics(),
      dependencyStrength: 0.1,
      cohesionScore: 0.5,
      changeFrequency: 0.3,
      maintenanceRisk: "medium"
    };
  }

  /**
   * Create default complexity metrics
   */
  private createDefaultMetrics(): ComplexityMetrics {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      nestingDepth: 0,
      parameterCount: 0,
      lineCount: 0,
      logicalLineCount: 0,
      commentLineCount: 0,
      blankLineCount: 0,
      branchCount: 0,
      halstead: {
        operators: 0, operands: 0, distinctOperators: 0, distinctOperands: 0,
        vocabulary: 0, length: 0, volume: 0, difficulty: 0, effort: 0,
        timeToImplement: 0, bugs: 0
      },
      maintainabilityIndex: 50,
      riskLevel: 'low',
      riskFactors: [],
      performanceHints: {
        hasExpensiveOperations: false,
        hasRecursion: false,
        hasDeepNesting: false,
        hasLongParameterList: false,
        hasComplexConditions: false
      }
    };
  }

  /**
   * Create default pattern analysis result
   */
  private createDefaultPatterns(): PatternAnalysisResult {
    return {
      semanticRole: { primary: "utility", confidence: 0.1 },
      usagePatterns: [],
      architecturalLayer: { layer: "unknown", confidence: 0.1 },
      moduleRole: { role: "utility", importance: "utility", publicInterface: false },
      componentType: { type: "helper", confidence: 0.1 },
      qualityIndicators: [],
      algorithmicPatterns: [],
      semanticRelationships: [],
      performanceCharacteristics: {
        executionMode: "balanced",
        scalability: "unknown",
        resourceUsage: { memory: "unknown", cpu: "unknown", io: "unknown" },
        parallelizable: false,
        cacheable: false
      },
      readabilityMetrics: {
        namingQuality: 0.5,
        commentQuality: 0.5,
        structureClarity: 0.5,
        overallReadability: 0.5,
        improvementSuggestions: []
      },
      refactoringOpportunities: []
    };
  }

  /**
   * Analyze multiple symbols in batch (optimization for large files)
   */
  async extractSemanticContextBatch(
    symbols: (SymbolInfo | UniversalSymbol)[],
    ast: Parser.Tree,
    sourceCode: string,
    allRelationships: RelationshipInfo[],
    options: SemanticAnalysisOptions = {}
  ): Promise<Map<string, SemanticContext>> {
    const results = new Map<string, SemanticContext>();
    const checkpoint = this.memoryMonitor.createCheckpoint('extractSemanticContextBatch');
    
    try {
      this.logger.info('Starting batch semantic analysis', { symbolCount: symbols.length });
      
      // Process symbols in parallel batches to avoid overwhelming the system
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < symbols.length; i += batchSize) {
        batches.push(symbols.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (symbol) => {
          const symbolRelationships = allRelationships.filter(rel =>
            rel.fromName === symbol.name || rel.toName === symbol.name
          );
          
          const context = await this.extractSemanticContext(
            symbol, ast, sourceCode, symbolRelationships, options
          );
          
          return [symbol.name, context] as [string, SemanticContext];
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [name, context] = result.value;
            results.set(name, context);
          }
        });
      }
      
      this.logger.info('Batch semantic analysis completed', {
        requested: symbols.length,
        completed: results.size
      });
      
      return results;
      
    } catch (error) {
      this.logger.error('Batch semantic analysis failed', error);
      return results;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Process symbols with semantic analysis
   */
  async processSymbols(
    symbols: SymbolInfo[],
    relationships: RelationshipInfo[],
    tree: any,
    content: string,
    filePath: string,
    options: {
      enableContextExtraction?: boolean;
      enableEmbeddingGeneration?: boolean;
      enableClustering?: boolean;
      enableInsightGeneration?: boolean;
      debugMode?: boolean;
    }
  ): Promise<SemanticIntelligenceResult> {
    this.logger.debug('Processing symbols with semantic analysis', {
      symbolCount: symbols.length,
      relationshipCount: relationships.length,
      filePath,
      options
    });

    const startTime = Date.now();
    const errors: string[] = [];
    
    // Use the existing batch analysis method to get contexts
    const contexts = await this.extractSemanticContextBatch(symbols, tree, content, relationships, { 
      ...options,
      filePath,
      debugMode: options.debugMode 
    });

    const embeddings: CodeEmbedding[] = [];
    const clusters: SemanticCluster[] = [];
    const insights: SemanticInsight[] = [];

    try {
      // Generate embeddings if enabled
      if (options.enableEmbeddingGeneration && symbols.length > 0) {
        this.logger.debug('Generating embeddings for symbols', { symbolCount: symbols.length });
        
        for (const symbol of symbols) {
          try {
            const context = contexts.get(symbol.name);
            const embedding = await this.embeddingEngine.generateEmbedding(
              symbol,
              tree,
              content,
              context,
              relationships.filter(r => r.fromName === symbol.name || r.toName === symbol.name)
            );
            embeddings.push(embedding);
          } catch (error) {
            errors.push(`Failed to generate embedding for ${symbol.name}: ${error}`);
          }
        }
      }

      // Generate clusters if enabled and we have embeddings
      if (options.enableClustering && embeddings.length > 0) {
        this.logger.debug('Generating semantic clusters', { embeddingCount: embeddings.length });
        
        try {
          // Pass contexts as Map for clustering
          const generatedClusters = await this.clusteringEngine.clusterSymbols(embeddings, contexts);
          clusters.push(...generatedClusters);
        } catch (error) {
          errors.push(`Failed to generate clusters: ${error}`);
        }
      }

      // Generate insights if enabled and we have clusters
      if (options.enableInsightGeneration && (clusters.length > 0 || contexts.size > 0)) {
        this.logger.debug('Generating semantic insights', { 
          clusterCount: clusters.length, 
          contextCount: contexts.size 
        });
        
        try {
          const generatedInsights = await this.insightsGenerator.generateInsights(
            clusters,
            embeddings,
            contexts,
            symbols
          );
          insights.push(...generatedInsights);
        } catch (error) {
          errors.push(`Failed to generate insights: ${error}`);
        }
      }

    } catch (error) {
      errors.push(`Semantic processing failed: ${error}`);
    }

    const processingTime = Date.now() - startTime;

    // Return properly structured result with actual stats
    return {
      contexts,
      embeddings,
      clusters,
      insights,
      stats: {
        symbolsAnalyzed: symbols.length,
        contextsExtracted: contexts.size,
        embeddingsGenerated: embeddings.length,
        clustersCreated: clusters.length,
        insightsGenerated: insights.length,
        processingTimeMs: processingTime,
        errors
      }
    };
  }

  /**
   * Process multiple files with semantic analysis
   */
  async processMultipleFiles(
    fileData: Array<{
      symbols: SymbolInfo[];
      relationships: RelationshipInfo[];
      ast: Parser.Tree;
      sourceCode: string;
      filePath: string;
    }>,
    options: {
      enableContextExtraction?: boolean;
      enableEmbeddingGeneration?: boolean;
      enableClustering?: boolean;
      enableInsightGeneration?: boolean;
      debugMode?: boolean;
    }
  ): Promise<SemanticIntelligenceResult> {
    this.logger.debug('Processing multiple files with semantic analysis', {
      fileCount: fileData.length,
      options
    });

    const allContexts = new Map<string, SemanticContext>();
    let totalSymbolsAnalyzed = 0;
    
    // Process each file separately using existing batch processing
    for (const file of fileData) {
      const fileResults = await this.extractSemanticContextBatch(
        file.symbols,
        file.ast,
        file.sourceCode,
        file.relationships,
        {
          ...options,
          filePath: file.filePath,
          debugMode: options.debugMode
        }
      );
      
      // Merge results into single map with file-prefixed keys
      for (const [symbolKey, context] of fileResults) {
        const uniqueKey = `${file.filePath}:${symbolKey}`;
        allContexts.set(uniqueKey, context);
        totalSymbolsAnalyzed++;
      }
    }
    
    // Return properly structured result
    return {
      contexts: allContexts,
      embeddings: [], // TODO: Extract embeddings if needed
      clusters: [], // TODO: Extract clusters if needed  
      insights: [], // TODO: Extract insights if needed
      stats: {
        symbolsAnalyzed: totalSymbolsAnalyzed,
        contextsExtracted: allContexts.size,
        embeddingsGenerated: 0,
        clustersCreated: 0,
        insightsGenerated: 0,
        processingTimeMs: 0, // TODO: Calculate actual time
        errors: [] // No errors for now, could be populated with actual errors if needed
      }
    };
  }

  /**
   * Clear internal caches and reset state
   */
  clearCaches(): void {
    this.logger.debug('Clearing semantic orchestrator caches');
    // Add cache clearing logic here if there are any internal caches
    // For now, this is a no-op method to satisfy the interface
  }
}