/**
 * Semantic Insights Generation Framework
 * 
 * Analyzes semantic clusters, embeddings, and code patterns to generate actionable insights
 * about code quality, refactoring opportunities, architectural improvements, and technical debt.
 */

import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc, asc } from 'drizzle-orm';
import { 
  semanticClusters, 
  clusterMembership, 
  universalSymbols,
  semanticInsights,
  insightRecommendations 
} from '../database/drizzle/schema.js';
import { SemanticCluster, ClusterInsight, SemanticClusteringEngine } from './semantic-clustering-engine.js';
import { CodeEmbedding, LocalCodeEmbeddingEngine } from './local-code-embedding.js';
import { SemanticContext } from './semantic-context-engine.js';
import { SymbolInfo } from '../parsers/tree-sitter/parser-types.js';

export interface SemanticInsight {
  id?: number;
  type: InsightType;
  category: InsightCategory;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  confidence: number; // 0-1
  priority: 'low' | 'medium' | 'high' | 'critical';
  affectedSymbols: string[];
  clusterId?: number;
  recommendations: InsightRecommendation[];
  metrics: InsightMetrics;
  detectedAt: number; // timestamp
  reasoning: string; // AI-like explanation of why this insight was generated
}

export interface InsightRecommendation {
  id?: number;
  action: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  priority: number; // 1-10
  exampleCode?: string;
  relatedSymbols: string[];
}

export interface InsightMetrics {
  complexityReduction?: number;
  maintainabilityImprovement?: number;
  performanceImpact?: number;
  testabilityImprovement?: number;
  readabilityScore?: number;
  technicalDebtReduction?: number;
  architecturalImprovement?: number;
}

export type InsightType = 
  | 'code_duplication' 
  | 'refactoring_opportunity' 
  | 'architectural_violation'
  | 'performance_issue'
  | 'maintainability_concern'
  | 'testing_gap'
  | 'naming_inconsistency'
  | 'complexity_hotspot'
  | 'dependency_issue'
  | 'pattern_violation'
  | 'technical_debt'
  | 'quality_improvement';

export type InsightCategory = 
  | 'architecture' 
  | 'performance' 
  | 'maintainability' 
  | 'quality' 
  | 'testing' 
  | 'security'
  | 'best_practices';

export interface InsightGenerationOptions {
  enableArchitecturalAnalysis: boolean;
  enablePerformanceAnalysis: boolean;
  enableQualityAnalysis: boolean;
  enablePatternAnalysis: boolean;
  minConfidenceThreshold: number;
  maxInsightsPerCategory: number;
  priorityBoostFactors: Partial<Record<InsightType, number>>;
}

export class SemanticInsightsGenerator {
  private db: Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private clusteringEngine: SemanticClusteringEngine;
  private embeddingEngine: LocalCodeEmbeddingEngine;
  private debugMode: boolean = false;

  // Insight analyzers
  private architecturalAnalyzer: ArchitecturalInsightAnalyzer;
  private performanceAnalyzer: PerformanceInsightAnalyzer;
  private qualityAnalyzer: QualityInsightAnalyzer;
  private patternAnalyzer: PatternInsightAnalyzer;

  constructor(
    db: Database,
    clusteringEngine: SemanticClusteringEngine,
    embeddingEngine: LocalCodeEmbeddingEngine,
    options: { debugMode?: boolean } = {}
  ) {
    this.db = db;
    this.drizzleDb = drizzle(db);
    this.clusteringEngine = clusteringEngine;
    this.embeddingEngine = embeddingEngine;
    this.debugMode = options.debugMode || false;

    // Initialize analyzers
    this.architecturalAnalyzer = new ArchitecturalInsightAnalyzer();
    this.performanceAnalyzer = new PerformanceInsightAnalyzer();
    this.qualityAnalyzer = new QualityInsightAnalyzer();
    this.patternAnalyzer = new PatternInsightAnalyzer();
  }

  /**
   * Generate comprehensive semantic insights from clusters and embeddings
   */
  async generateInsights(
    clusters: SemanticCluster[],
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    symbols: SymbolInfo[],
    options: Partial<InsightGenerationOptions> = {}
  ): Promise<SemanticInsight[]> {
    const startTime = Date.now();
    
    const config: InsightGenerationOptions = {
      enableArchitecturalAnalysis: true,
      enablePerformanceAnalysis: true,
      enableQualityAnalysis: true,
      enablePatternAnalysis: true,
      minConfidenceThreshold: 0.6,
      maxInsightsPerCategory: 10,
      priorityBoostFactors: {},
      ...options
    };

    if (this.debugMode) {
      console.log(`[Insights] Generating insights from ${clusters.length} clusters and ${embeddings.length} embeddings`);
    }

    const insights: SemanticInsight[] = [];

    // 1. Architectural insights from cluster analysis
    if (config.enableArchitecturalAnalysis) {
      const archInsights = await this.architecturalAnalyzer.analyze(
        clusters, embeddings, semanticContexts, symbols
      );
      insights.push(...archInsights);
    }

    // 2. Performance insights from embedding similarity and complexity
    if (config.enablePerformanceAnalysis) {
      const perfInsights = await this.performanceAnalyzer.analyze(
        clusters, embeddings, semanticContexts, symbols
      );
      insights.push(...perfInsights);
    }

    // 3. Code quality insights from semantic analysis
    if (config.enableQualityAnalysis) {
      const qualityInsights = await this.qualityAnalyzer.analyze(
        clusters, embeddings, semanticContexts, symbols
      );
      insights.push(...qualityInsights);
    }

    // 4. Pattern-based insights
    if (config.enablePatternAnalysis) {
      const patternInsights = await this.patternAnalyzer.analyze(
        clusters, embeddings, semanticContexts, symbols
      );
      insights.push(...patternInsights);
    }

    // Filter by confidence and limit per category
    const filteredInsights = this.filterAndRankInsights(insights, config);

    // Store insights in database
    await this.storeInsights(filteredInsights);

    const duration = Date.now() - startTime;
    if (this.debugMode) {
      console.log(`[Insights] Generated ${filteredInsights.length} insights in ${duration}ms`);
    }

    return filteredInsights;
  }

  /**
   * Get stored insights from database with optional filtering
   */
  async getStoredInsights(filters: {
    type?: InsightType;
    category?: InsightCategory;
    severity?: string;
    minConfidence?: number;
    limit?: number;
  } = {}): Promise<SemanticInsight[]> {
    try {
      // Simple query without complex filtering for now
      const results = await this.drizzleDb
        .select()
        .from(semanticInsights)
        .limit(filters.limit || 50);

      // Convert to SemanticInsight objects
      return results.map(row => ({
        id: row.id,
        type: row.insightType as InsightType,
        category: row.category as InsightCategory,
        title: row.title,
        description: row.description,
        severity: row.severity as any,
        confidence: row.confidence,
        priority: row.priority as any,
        affectedSymbols: JSON.parse(row.affectedSymbols || '[]'),
        clusterId: row.clusterId || undefined,
        recommendations: [], // Load separately if needed
        metrics: JSON.parse(row.metrics || '{}'),
        detectedAt: typeof row.detectedAt === 'number' ? row.detectedAt : Date.now(),
        reasoning: row.reasoning || ''
      }));

    } catch (error) {
      if (this.debugMode) {
        console.error('[Insights] Error loading stored insights:', error);
      }
      return [];
    }
  }

  /**
   * Get recommendations for a specific insight
   */
  async getInsightRecommendations(insightId: number): Promise<InsightRecommendation[]> {
    try {
      const results = await this.drizzleDb
        .select()
        .from(insightRecommendations)
        .where(eq(insightRecommendations.insightId, insightId))
        .orderBy(asc(insightRecommendations.priority));

      return results.map(row => ({
        id: row.id,
        action: row.action,
        description: row.description,
        effort: row.effort as any,
        impact: row.impact as any,
        priority: row.priority,
        exampleCode: row.exampleCode || undefined,
        relatedSymbols: JSON.parse(row.relatedSymbols || '[]')
      }));

    } catch (error) {
      if (this.debugMode) {
        console.error('[Insights] Error loading recommendations:', error);
      }
      return [];
    }
  }

  /**
   * Store insights in database
   */
  private async storeInsights(insights: SemanticInsight[]): Promise<void> {
    for (const insight of insights) {
      try {
        // Insert insight
        const [insertedInsight] = await this.drizzleDb
          .insert(semanticInsights)
          .values({
            projectId: 1, // Default project ID
            insightType: insight.type,
            category: insight.category,
            title: insight.title,
            description: insight.description,
            severity: insight.severity,
            confidence: insight.confidence,
            priority: insight.priority,
            affectedSymbols: JSON.stringify(insight.affectedSymbols),
            clusterId: insight.clusterId,
            metrics: JSON.stringify(insight.metrics),
            reasoning: insight.reasoning
          })
          .returning();

        // Insert recommendations
        for (const rec of insight.recommendations) {
          await this.drizzleDb
            .insert(insightRecommendations)
            .values({
              insightId: insertedInsight.id,
              action: rec.action,
              description: rec.description,
              effort: rec.effort,
              impact: rec.impact,
              priority: rec.priority,
              exampleCode: rec.exampleCode,
              relatedSymbols: JSON.stringify(rec.relatedSymbols)
            });
        }

      } catch (error) {
        if (this.debugMode) {
          console.error(`[Insights] Failed to store insight ${insight.title}:`, error);
        }
      }
    }
  }

  /**
   * Filter and rank insights based on configuration
   */
  private filterAndRankInsights(
    insights: SemanticInsight[], 
    config: InsightGenerationOptions
  ): SemanticInsight[] {
    // Filter by confidence threshold
    const filtered = insights.filter(insight => 
      insight.confidence >= config.minConfidenceThreshold
    );

    // Apply priority boosts
    const boosted = filtered.map(insight => {
      const boostFactor = config.priorityBoostFactors[insight.type] || 1;
      return {
        ...insight,
        confidence: Math.min(1, insight.confidence * boostFactor)
      };
    });

    // Group by category and limit
    const categorized = new Map<InsightCategory, SemanticInsight[]>();
    
    for (const insight of boosted) {
      if (!categorized.has(insight.category)) {
        categorized.set(insight.category, []);
      }
      categorized.get(insight.category)!.push(insight);
    }

    // Sort and limit each category
    const final: SemanticInsight[] = [];
    
    for (const [category, categoryInsights] of categorized) {
      const sorted = categoryInsights
        .sort((a, b) => {
          // Priority ranking
          const priorityValues = { critical: 4, high: 3, medium: 2, low: 1 };
          const priorityDiff = priorityValues[b.priority] - priorityValues[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          
          // Confidence ranking
          return b.confidence - a.confidence;
        })
        .slice(0, config.maxInsightsPerCategory);
      
      final.push(...sorted);
    }

    return final;
  }
}

// Specialized insight analyzers
class ArchitecturalInsightAnalyzer {
  async analyze(
    clusters: SemanticCluster[],
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    symbols: SymbolInfo[]
  ): Promise<SemanticInsight[]> {
    const insights: SemanticInsight[] = [];

    // 1. Layer boundary violations
    const layerViolations = this.detectLayerViolations(clusters, semanticContexts);
    insights.push(...layerViolations);

    // 2. Circular dependencies
    const circularDeps = this.detectCircularDependencies(symbols, semanticContexts);
    insights.push(...circularDeps);

    // 3. God classes/functions
    const godClasses = this.detectGodObjects(symbols, semanticContexts);
    insights.push(...godClasses);

    // 4. Large clusters (fallback insight)
    const largeClusters = this.detectLargeClusters(clusters);
    insights.push(...largeClusters);

    return insights;
  }

  private detectLayerViolations(
    clusters: SemanticCluster[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    const insights: SemanticInsight[] = [];
    
    // Find architectural layer clusters
    const layerClusters = clusters.filter(c => c.type === 'architectural');
    
    for (const cluster of layerClusters) {
      const violations = cluster.members.filter(member => {
        const context = semanticContexts.get(String(member.symbolId));
        if (!context) return false;
        
        // Check if member's layer matches cluster's expected layer
        const expectedLayer = cluster.name.toLowerCase().replace(' layer', '');
        const actualLayer = context.architecturalLayer.layer;
        
        return actualLayer !== expectedLayer;
      });

      if (violations.length > 0) {
        insights.push({
          type: 'architectural_violation',
          category: 'architecture',
          title: `Layer Boundary Violation in ${cluster.name}`,
          description: `${violations.length} symbols are placed in wrong architectural layer`,
          severity: 'warning',
          confidence: 0.8,
          priority: 'medium',
          affectedSymbols: violations.map(v => String(v.symbolId)),
          clusterId: cluster.id,
          recommendations: [{
            action: 'Move symbols to correct layer',
            description: 'Relocate misplaced symbols to maintain clean architecture',
            effort: 'medium',
            impact: 'high',
            priority: 7,
            relatedSymbols: violations.map(v => String(v.symbolId))
          }],
          metrics: {
            maintainabilityImprovement: 0.3,
            architecturalImprovement: 0.4
          },
          detectedAt: Date.now(),
          reasoning: 'Detected symbols that don\'t follow expected architectural layer boundaries, which can lead to coupling and maintenance issues'
        });
      }
    }

    return insights;
  }

  private detectCircularDependencies(
    symbols: SymbolInfo[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    // Simplified circular dependency detection
    // In a real implementation, this would build a dependency graph
    return [];
  }

  private detectLargeClusters(clusters: SemanticCluster[]): SemanticInsight[] {
    const insights: SemanticInsight[] = [];
    
    // Find clusters with many symbols - could indicate architectural issues
    const largeClusters = clusters.filter(c => c.members.length > 20);
    
    for (const cluster of largeClusters) {
      insights.push({
        type: 'architectural_violation',
        category: 'architecture',
        title: `Large ${cluster.type} cluster detected: ${cluster.name}`,
        description: `Cluster contains ${cluster.members.length} symbols, which may indicate poor separation of concerns`,
        severity: 'warning',
        confidence: 0.7,
        priority: 'medium',
        affectedSymbols: cluster.members.map(m => String(m.symbolId)),
        clusterId: cluster.id,
        recommendations: [{
          action: 'Split cluster into focused components',
          description: 'Consider breaking this large grouping into smaller, more focused modules',
          effort: 'high',
          impact: 'medium',
          priority: 6,
          relatedSymbols: cluster.members.map(m => String(m.symbolId))
        }],
        metrics: {
          maintainabilityImprovement: 0.2,
          architecturalImprovement: 0.3
        },
        detectedAt: Date.now(),
        reasoning: `Large clusters with ${cluster.members.length} symbols may indicate insufficient architectural boundaries or god objects`
      });
    }

    return insights;
  }

  private detectGodObjects(
    symbols: SymbolInfo[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    const insights: SemanticInsight[] = [];
    
    const godThreshold = 15; // High complexity threshold
    
    const godObjects = symbols.filter(symbol => {
      // Use symbol complexity directly, fallback to 1 if undefined
      const complexity = symbol.complexity || 1;
      return complexity > godThreshold;
    });

    for (const godObject of godObjects) {
      insights.push({
        type: 'complexity_hotspot',
        category: 'architecture',
        title: `God Object Detected: ${godObject.name}`,
        description: `Symbol has excessive complexity (${godObject.complexity}), violating single responsibility principle`,
        severity: 'error',
        confidence: 0.9,
        priority: 'high',
        affectedSymbols: [godObject.qualifiedName],
        recommendations: [{
          action: 'Refactor into smaller components',
          description: 'Break down the complex object into focused, single-responsibility components',
          effort: 'high',
          impact: 'high',
          priority: 8,
          relatedSymbols: [godObject.qualifiedName]
        }],
        metrics: {
          complexityReduction: 0.6,
          maintainabilityImprovement: 0.5,
          testabilityImprovement: 0.4
        },
        detectedAt: Date.now(),
        reasoning: 'High complexity indicates violation of single responsibility principle, making code harder to maintain and test'
      });
    }

    return insights;
  }
}

class PerformanceInsightAnalyzer {
  async analyze(
    clusters: SemanticCluster[],
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    symbols: SymbolInfo[]
  ): Promise<SemanticInsight[]> {
    const insights: SemanticInsight[] = [];

    // 1. Performance hotspots
    const hotspots = this.detectPerformanceHotspots(symbols, semanticContexts);
    insights.push(...hotspots);

    // 2. Inefficient patterns
    const inefficiencies = this.detectInefficiencies(clusters, semanticContexts);
    insights.push(...inefficiencies);

    return insights;
  }

  private detectPerformanceHotspots(
    symbols: SymbolInfo[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    const insights: SemanticInsight[] = [];
    
    // Look for functions with high complexity that might be performance bottlenecks
    const hotspots = symbols.filter(symbol => {
      const context = semanticContexts.get(symbol.qualifiedName);
      return symbol.complexity > 10 && 
             context?.semanticRole.primary === 'behavior' &&
             (symbol.name.toLowerCase().includes('process') ||
              symbol.name.toLowerCase().includes('calculate') ||
              symbol.name.toLowerCase().includes('compute'));
    });

    for (const hotspot of hotspots) {
      insights.push({
        type: 'performance_issue',
        category: 'performance',
        title: `Performance Hotspot: ${hotspot.name}`,
        description: `High-complexity function likely to be a performance bottleneck`,
        severity: 'warning',
        confidence: 0.7,
        priority: 'medium',
        affectedSymbols: [hotspot.qualifiedName],
        recommendations: [{
          action: 'Profile and optimize',
          description: 'Measure performance and optimize critical paths',
          effort: 'medium',
          impact: 'high',
          priority: 6,
          relatedSymbols: [hotspot.qualifiedName]
        }],
        metrics: {
          performanceImpact: 0.4
        },
        detectedAt: Date.now(),
        reasoning: 'High complexity combined with behavioral role suggests potential performance bottleneck'
      });
    }

    return insights;
  }

  private detectInefficiencies(
    clusters: SemanticCluster[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    // Placeholder for inefficiency detection
    return [];
  }
}

class QualityInsightAnalyzer {
  async analyze(
    clusters: SemanticCluster[],
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    symbols: SymbolInfo[]
  ): Promise<SemanticInsight[]> {
    const insights: SemanticInsight[] = [];

    // 1. Code duplication from high-similarity clusters
    const duplications = this.detectCodeDuplication(clusters);
    insights.push(...duplications);

    // 2. Naming inconsistencies
    const namingIssues = this.detectNamingInconsistencies(clusters);
    insights.push(...namingIssues);

    return insights;
  }

  private detectCodeDuplication(clusters: SemanticCluster[]): SemanticInsight[] {
    const insights: SemanticInsight[] = [];
    
    const highSimilarityClusters = clusters.filter(c => 
      c.quality > 0.9 && c.members.length >= 3
    );

    for (const cluster of highSimilarityClusters) {
      insights.push({
        type: 'code_duplication',
        category: 'quality',
        title: `Code Duplication in ${cluster.name}`,
        description: `${cluster.members.length} highly similar symbols suggest code duplication`,
        severity: 'warning',
        confidence: cluster.quality,
        priority: 'medium',
        affectedSymbols: cluster.members.map(m => String(m.symbolId)),
        clusterId: cluster.id,
        recommendations: [{
          action: 'Extract common functionality',
          description: 'Create shared utility or base class to eliminate duplication',
          effort: 'medium',
          impact: 'medium',
          priority: 5,
          relatedSymbols: cluster.members.map(m => String(m.symbolId))
        }],
        metrics: {
          maintainabilityImprovement: 0.3,
          technicalDebtReduction: 0.4
        },
        detectedAt: Date.now(),
        reasoning: 'High similarity between multiple symbols indicates potential code duplication that should be refactored'
      });
    }

    return insights;
  }

  private detectNamingInconsistencies(clusters: SemanticCluster[]): SemanticInsight[] {
    const insights: SemanticInsight[] = [];
    
    for (const cluster of clusters) {
      const namingInsight = cluster.insights.find(i => i.type === 'naming_inconsistency');
      if (namingInsight) {
        insights.push({
          type: 'naming_inconsistency',
          category: 'quality',
          title: namingInsight.title,
          description: namingInsight.description,
          severity: 'info',
          confidence: namingInsight.confidence,
          priority: 'low',
          affectedSymbols: namingInsight.affectedMembers,
          clusterId: cluster.id,
          recommendations: [{
            action: 'Standardize naming conventions',
            description: 'Apply consistent naming patterns across related symbols',
            effort: 'low',
            impact: 'low',
            priority: 3,
            relatedSymbols: namingInsight.affectedMembers
          }],
          metrics: {
            readabilityScore: 0.2
          },
          detectedAt: Date.now(),
          reasoning: 'Inconsistent naming patterns reduce code readability and maintainability'
        });
      }
    }

    return insights;
  }
}

class PatternInsightAnalyzer {
  async analyze(
    clusters: SemanticCluster[],
    embeddings: CodeEmbedding[],
    semanticContexts: Map<string, SemanticContext>,
    symbols: SymbolInfo[]
  ): Promise<SemanticInsight[]> {
    const insights: SemanticInsight[] = [];

    // 1. Anti-pattern detection
    const antiPatterns = this.detectAntiPatterns(symbols, semanticContexts);
    insights.push(...antiPatterns);

    // 2. Missing design patterns
    const missingPatterns = this.detectMissingPatterns(clusters, semanticContexts);
    insights.push(...missingPatterns);

    return insights;
  }

  private detectAntiPatterns(
    symbols: SymbolInfo[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    // Placeholder for anti-pattern detection
    return [];
  }

  private detectMissingPatterns(
    clusters: SemanticCluster[],
    semanticContexts: Map<string, SemanticContext>
  ): SemanticInsight[] {
    // Placeholder for missing pattern detection
    return [];
  }
}