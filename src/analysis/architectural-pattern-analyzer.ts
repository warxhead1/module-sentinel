/**
 * Architectural Pattern Analyzer - Advanced Pattern Detection & Visualization
 *
 * Identifies, analyzes, and visualizes architectural patterns across the codebase
 * to help track design decisions, pattern adoption, and architectural evolution.
 */

import Database from "better-sqlite3";

export interface PatternInstance {
  id: string;
  patternType:
    | "factory"
    | "singleton"
    | "observer"
    | "strategy"
    | "adapter"
    | "facade"
    | "builder"
    | "command"
    | "pipeline"
    | "vulkan-raii"
    | "gpu-compute"
    | "memory-pool";
  name: string;
  confidence: number;
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  stage: string;
  participants: string[]; // Classes/functions involved in pattern
  relationships: string[]; // How participants relate
  semanticTags: string[]; // Additional semantic information
  complexity: number; // Pattern complexity score 1-10
  maintainabilityScore: number; // How maintainable is this pattern
  antiPatterns: string[]; // Associated anti-patterns detected
  metrics: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    fanIn: number; // How many things depend on this pattern
    fanOut: number; // How many things this pattern depends on
    coupling: number; // Coupling score
    cohesion: number; // Cohesion score
  };
  evolution: {
    firstSeen: Date;
    lastModified: Date;
    changeCount: number;
    stabilityTrend: "improving" | "degrading" | "stable";
  };
}

export interface PatternRelationship {
  source: string;
  target: string;
  relationType:
    | "uses"
    | "extends"
    | "composes"
    | "delegates"
    | "coordinates"
    | "conflicts";
  strength: number; // 0-1 strength of relationship
  description: string;
}

export interface ArchitecturalInsight {
  type:
    | "pattern_cluster"
    | "anti_pattern_hotspot"
    | "design_drift"
    | "complexity_spike"
    | "coupling_issue";
  severity: number; // 1-10 severity score
  title: string;
  description: string;
  affectedPatterns: string[];
  recommendations: string[];
  codeLocations: Array<{
    filePath: string;
    line: number;
    snippet: string;
  }>;
}

export class ArchitecturalPatternAnalyzer {
  private db: Database.Database;
  private patternCache = new Map<string, PatternInstance>();
  private insightCache = new Map<string, ArchitecturalInsight[]>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Analyze all architectural patterns in the codebase
   */
  async analyzePatterns(): Promise<PatternInstance[]> {
    console.log("🏗️  Analyzing architectural patterns...");

    const patterns: PatternInstance[] = [];

    // Analyze different pattern types
    patterns.push(...(await this.analyzeFactoryPatterns()));
    patterns.push(...(await this.analyzeSingletonPatterns()));
    patterns.push(...(await this.analyzeObserverPatterns()));
    patterns.push(...(await this.analyzeStrategyPatterns()));
    patterns.push(...(await this.analyzeVulkanRAIIPatterns()));
    patterns.push(...(await this.analyzeGPUComputePatterns()));
    patterns.push(...(await this.analyzeMemoryPoolPatterns()));
    patterns.push(...(await this.analyzePipelinePatterns()));

    // Cache results
    for (const pattern of patterns) {
      this.patternCache.set(pattern.id, pattern);
    }

    return patterns;
  }

  private async analyzeFactoryPatterns(): Promise<PatternInstance[]> {
    const factorySymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%factory%' 
        OR name LIKE '%Factory%' 
        OR name LIKE '%Creator%'
        OR name LIKE '%Builder%'
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of factorySymbols) {
      // Get related symbols (what this factory creates)
      const products = this.db
        .prepare(
          `
        SELECT s2.name, s2.qualified_name, sr.type
        FROM universal_relationships sr
        JOIN universal_symbols s2 ON sr.to_symbol_id = s2.id
        WHERE sr.from_symbol_id = ? 
          AND sr.type IN ('creates', 'constructs', 'returns')
        ORDER BY sr.confidence DESC
        LIMIT 10
      `
        )
        .all(symbol.id) as any[];

      // Calculate complexity based on number of products and relationships
      const complexity = Math.min(10, 2 + products.length * 0.5);

      const pattern: PatternInstance = {
        id: `factory_${symbol.id}`,
        patternType: "factory",
        name: symbol.name,
        confidence: symbol.confidence,
        location: {
          filePath: symbol.file_path,
          line: symbol.line || 0,
          column: symbol.column || 0,
        },
        stage: "analysis",
        participants: [
          symbol.qualified_name,
          ...products.map((p: any) => p.qualified_name),
        ],
        relationships: products.map((p: any) => `creates ${p.name}`),
        semanticTags: symbol.semantic_tags
          ? symbol.semantic_tags.split(",")
          : [],
        complexity,
        maintainabilityScore: this.calculateMaintainabilityScore(
          symbol,
          products.length
        ),
        antiPatterns: this.detectFactoryAntiPatterns(symbol, products),
        metrics: await this.calculatePatternMetrics(symbol.id),
        evolution: await this.getPatternEvolution(symbol.id),
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  private async analyzeSingletonPatterns(): Promise<PatternInstance[]> {
    const singletonSymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%singleton%' 
        OR name LIKE '%Singleton%'
        OR name LIKE '%Manager%'
        OR (kind = 'class' AND semantic_tags LIKE '%global%')
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of singletonSymbols) {
      // Check for singleton characteristics
      const hasGetInstance = this.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM universal_symbols
        WHERE parent_class = ? AND (name LIKE '%getInstance%' OR name LIKE '%instance%')
      `
        )
        .get(symbol.id) as any;

      const hasPrivateConstructor = this.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM universal_symbols
        WHERE parent_class = ? AND name = ? AND semantic_tags LIKE '%private%'
      `
        )
        .get(symbol.id, symbol.name) as any;

      const confidence =
        symbol.confidence *
        (hasGetInstance.count > 0 ? 1.2 : 0.8) *
        (hasPrivateConstructor.count > 0 ? 1.1 : 0.9);

      if (confidence > 0.6) {
        const pattern: PatternInstance = {
          id: `singleton_${symbol.id}`,
          patternType: "singleton",
          name: symbol.name,
          confidence: Math.min(confidence, 1.0),
          location: {
            filePath: symbol.file_path,
            line: symbol.line || 0,
            column: symbol.column || 0,
          },
          stage: "analysis",
          participants: [symbol.qualified_name],
          relationships: ["enforces single instance"],
          semanticTags: symbol.semantic_tags
            ? symbol.semantic_tags.split(",")
            : [],
          complexity: 3, // Singletons are generally medium complexity
          maintainabilityScore: this.calculateMaintainabilityScore(symbol, 1),
          antiPatterns: this.detectSingletonAntiPatterns(symbol),
          metrics: await this.calculatePatternMetrics(symbol.id),
          evolution: await this.getPatternEvolution(symbol.id),
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private async analyzeObserverPatterns(): Promise<PatternInstance[]> {
    const observerSymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%observer%' 
        OR name LIKE '%Observer%'
        OR name LIKE '%Listener%'
        OR name LIKE '%Handler%'
        OR name LIKE '%Callback%'
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of observerSymbols) {
      // Look for notify/update methods
      const notifyMethods = this.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM universal_symbols
        WHERE parent_class = ? AND (name LIKE '%notify%' OR name LIKE '%update%' OR name LIKE '%onChange%')
      `
        )
        .get(symbol.id) as any;

      if (notifyMethods.count > 0) {
        const observers = this.db
          .prepare(
            `
          SELECT s2.name, s2.qualified_name
          FROM universal_relationships sr
          JOIN universal_symbols s2 ON sr.to_symbol_id = s2.id
          WHERE sr.from_symbol_id = ? 
            AND sr.type IN ('notifies', 'updates', 'calls')
          LIMIT 10
        `
          )
          .all(symbol.id) as any[];

        const pattern: PatternInstance = {
          id: `observer_${symbol.id}`,
          patternType: "observer",
          name: symbol.name,
          confidence: symbol.confidence,
          location: {
            filePath: symbol.file_path,
            line: symbol.line || 0,
            column: symbol.column || 0,
          },
          stage: "analysis",
          participants: [
            symbol.qualified_name,
            ...observers.map((o: any) => o.qualified_name),
          ],
          relationships: ["notifies observers", "maintains observer list"],
          semanticTags: symbol.semantic_tags
            ? symbol.semantic_tags.split(",")
            : [],
          complexity: Math.min(10, 3 + observers.length * 0.3),
          maintainabilityScore: this.calculateMaintainabilityScore(
            symbol,
            observers.length
          ),
          antiPatterns: this.detectObserverAntiPatterns(symbol, observers),
          metrics: await this.calculatePatternMetrics(symbol.id),
          evolution: await this.getPatternEvolution(symbol.id),
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private async analyzeStrategyPatterns(): Promise<PatternInstance[]> {
    const strategySymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%strategy%' 
        OR name LIKE '%Strategy%'
        OR name LIKE '%Algorithm%'
        OR name LIKE '%Policy%'
        OR (kind = 'class' AND template_info IS NOT NULL AND semantic_tags LIKE '%algorithm%')
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of strategySymbols) {
      // Look for strategy implementations
      const implementations = this.db
        .prepare(
          `
        SELECT s2.name, s2.qualified_name
        FROM universal_relationships sr
        JOIN universal_symbols s2 ON sr.to_symbol_id = s2.id
        WHERE sr.from_symbol_id = ? 
          AND sr.type = 'inherits'
        LIMIT 10
      `
        )
        .all(symbol.id) as any;

      const pattern: PatternInstance = {
        id: `strategy_${symbol.id}`,
        patternType: "strategy",
        name: symbol.name,
        confidence: symbol.confidence,
        location: {
          filePath: symbol.file_path,
          line: symbol.line || 0,
          column: symbol.column || 0,
        },
        stage: "analysis",
        participants: [
          symbol.qualified_name,
          ...implementations.map((i: any) => i.qualified_name),
        ],
        relationships: [
          "defines algorithm interface",
          "enables runtime algorithm selection",
        ],
        semanticTags: symbol.semantic_tags
          ? symbol.semantic_tags.split(",")
          : [],
        complexity: Math.min(10, 2 + implementations.length * 0.4),
        maintainabilityScore: this.calculateMaintainabilityScore(
          symbol,
          implementations.length
        ),
        antiPatterns: this.detectStrategyAntiPatterns(symbol, implementations),
        metrics: await this.calculatePatternMetrics(symbol.id),
        evolution: await this.getPatternEvolution(symbol.id),
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  private async analyzeVulkanRAIIPatterns(): Promise<PatternInstance[]> {
    const vulkanSymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%vulkan%' 
        AND (semantic_tags LIKE '%raii%' OR name LIKE '%Wrapper%' OR name LIKE '%Handle%')
        AND kind = 'class'
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of vulkanSymbols) {
      // Check for RAII characteristics (constructor/destructor with Vulkan calls)
      const hasVulkanCalls = this.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM universal_symbols
        WHERE parent_class = ? 
          AND (name LIKE 'vk%' OR semantic_tags LIKE '%vulkan-api%')
      `
        )
        .get(symbol.id) as any;

      if (hasVulkanCalls.count > 0) {
        const pattern: PatternInstance = {
          id: `vulkan_raii_${symbol.id}`,
          patternType: "vulkan-raii",
          name: symbol.name,
          confidence: symbol.confidence,
          location: {
            filePath: symbol.file_path,
            line: symbol.line || 0,
            column: symbol.column || 0,
          },
          stage: "analysis",
          participants: [symbol.qualified_name],
          relationships: [
            "manages vulkan resource lifecycle",
            "provides exception safety",
          ],
          semanticTags: symbol.semantic_tags
            ? symbol.semantic_tags.split(",")
            : [],
          complexity: 5, // RAII patterns are medium complexity
          maintainabilityScore: this.calculateMaintainabilityScore(symbol, 1),
          antiPatterns: this.detectVulkanAntiPatterns(symbol),
          metrics: await this.calculatePatternMetrics(symbol.id),
          evolution: await this.getPatternEvolution(symbol.id),
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  private async analyzeGPUComputePatterns(): Promise<PatternInstance[]> {
    const gpuSymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%gpu%' 
        AND (semantic_tags LIKE '%compute%' OR name LIKE '%Compute%' OR name LIKE '%Dispatch%')
        AND kind IN ('class', 'function')
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of gpuSymbols) {
      const pattern: PatternInstance = {
        id: `gpu_compute_${symbol.id}`,
        patternType: "gpu-compute",
        name: symbol.name,
        confidence: symbol.confidence,
        location: {
          filePath: symbol.file_path,
          line: symbol.line || 0,
          column: symbol.column || 0,
        },
        stage: "analysis",
        participants: [symbol.qualified_name],
        relationships: [
          "orchestrates gpu computation",
          "manages compute shaders",
        ],
        semanticTags: symbol.semantic_tags
          ? symbol.semantic_tags.split(",")
          : [],
        complexity: 7, // GPU compute is typically complex
        maintainabilityScore: this.calculateMaintainabilityScore(symbol, 1),
        antiPatterns: this.detectGPUAntiPatterns(symbol),
        metrics: await this.calculatePatternMetrics(symbol.id),
        evolution: await this.getPatternEvolution(symbol.id),
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  private async analyzeMemoryPoolPatterns(): Promise<PatternInstance[]> {
    const memorySymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%memory%' 
        AND (name LIKE '%Pool%' OR name LIKE '%Allocator%' OR name LIKE '%Buffer%')
        AND kind = 'class'
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of memorySymbols) {
      const pattern: PatternInstance = {
        id: `memory_pool_${symbol.id}`,
        patternType: "memory-pool",
        name: symbol.name,
        confidence: symbol.confidence,
        location: {
          filePath: symbol.file_path,
          line: symbol.line || 0,
          column: symbol.column || 0,
        },
        stage: "analysis",
        participants: [symbol.qualified_name],
        relationships: [
          "manages memory allocation",
          "provides performance optimization",
        ],
        semanticTags: symbol.semantic_tags
          ? symbol.semantic_tags.split(",")
          : [],
        complexity: 6, // Memory management is complex
        maintainabilityScore: this.calculateMaintainabilityScore(symbol, 1),
        antiPatterns: this.detectMemoryAntiPatterns(symbol),
        metrics: await this.calculatePatternMetrics(symbol.id),
        evolution: await this.getPatternEvolution(symbol.id),
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  private async analyzePipelinePatterns(): Promise<PatternInstance[]> {
    const pipelineSymbols = this.db
      .prepare(
        `
      SELECT 
        id, name, qualified_name, file_path, line, column,
        kind, semantic_tags, confidence
      FROM universal_symbols
      WHERE semantic_tags LIKE '%pipeline%' 
        OR name LIKE '%Pipeline%'
        OR name LIKE '%Chain%'
        OR (semantic_tags LIKE '%stage%' AND semantic_tags LIKE '%process%')
      ORDER BY confidence DESC
    `
      )
      .all() as any[];

    const patterns: PatternInstance[] = [];

    for (const symbol of pipelineSymbols) {
      // Find pipeline stages
      const stages = this.db
        .prepare(
          `
        SELECT s2.name, s2.qualified_name
        FROM universal_relationships sr
        JOIN universal_symbols s2 ON sr.to_symbol_id = s2.id
        WHERE sr.from_symbol_id = ? 
          AND sr.type IN ('contains', 'uses', 'calls')
          AND s2.semantic_tags LIKE '%stage%'
        LIMIT 10
      `
        )
        .all(symbol.id) as any[];

      const pattern: PatternInstance = {
        id: `pipeline_${symbol.id}`,
        patternType: "pipeline",
        name: symbol.name,
        confidence: symbol.confidence,
        location: {
          filePath: symbol.file_path,
          line: symbol.line || 0,
          column: symbol.column || 0,
        },
        stage: "analysis",
        participants: [
          symbol.qualified_name,
          ...stages.map((s: any) => s.qualified_name),
        ],
        relationships: ["coordinates processing stages", "manages data flow"],
        semanticTags: symbol.semantic_tags
          ? symbol.semantic_tags.split(",")
          : [],
        complexity: Math.min(10, 4 + stages.length * 0.5),
        maintainabilityScore: this.calculateMaintainabilityScore(
          symbol,
          stages.length
        ),
        antiPatterns: this.detectPipelineAntiPatterns(symbol, stages),
        metrics: await this.calculatePatternMetrics(symbol.id),
        evolution: await this.getPatternEvolution(symbol.id),
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  private calculateMaintainabilityScore(
    symbol: any,
    participantCount: number
  ): number {
    let score = 70; // Base score

    // Adjust for confidence
    score += (symbol.confidence - 0.5) * 40;

    // Adjust for complexity (more participants = lower maintainability)
    score -= participantCount * 3;

    // Adjust for semantic tags
    if (symbol.semantic_tags?.includes("well-documented")) score += 10;
    if (symbol.semantic_tags?.includes("tested")) score += 10;
    if (symbol.semantic_tags?.includes("legacy")) score -= 15;
    if (symbol.semantic_tags?.includes("deprecated")) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  private detectFactoryAntiPatterns(symbol: any, products: any[]): string[] {
    const antiPatterns: string[] = [];

    // God Factory - creates too many different types
    if (products.length > 10) {
      antiPatterns.push("god-factory");
    }

    // No Clear Interface - factory without clear product interface
    if (products.length > 1) {
      const hasCommonInterface = products.some((p: any) =>
        products.some(
          (other: any) =>
            other !== p &&
            other.qualified_name.includes(p.name.split("Base")[0])
        )
      );
      if (!hasCommonInterface) {
        antiPatterns.push("no-common-interface");
      }
    }

    return antiPatterns;
  }

  private detectSingletonAntiPatterns(symbol: any): string[] {
    const antiPatterns: string[] = [];

    // Global State - singleton managing too much state
    if (symbol.semantic_tags?.includes("global-state")) {
      antiPatterns.push("global-state");
    }

    // Testing Difficulties
    if (!symbol.semantic_tags?.includes("testable")) {
      antiPatterns.push("testing-difficulties");
    }

    return antiPatterns;
  }

  private detectObserverAntiPatterns(symbol: any, observers: any[]): string[] {
    const antiPatterns: string[] = [];

    // Too Many Observers
    if (observers.length > 20) {
      antiPatterns.push("observer-explosion");
    }

    // Memory Leaks - observers not properly cleaned up
    if (!symbol.semantic_tags?.includes("cleanup")) {
      antiPatterns.push("memory-leak-risk");
    }

    return antiPatterns;
  }

  private detectStrategyAntiPatterns(
    symbol: any,
    implementations: any[]
  ): string[] {
    const antiPatterns: string[] = [];

    // Too Few Strategies
    if (implementations.length < 2) {
      antiPatterns.push("premature-abstraction");
    }

    // Strategy Explosion
    if (implementations.length > 15) {
      antiPatterns.push("strategy-explosion");
    }

    return antiPatterns;
  }

  private detectVulkanAntiPatterns(symbol: any): string[] {
    const antiPatterns: string[] = [];

    // Resource Leaks
    if (
      !symbol.semantic_tags?.includes("cleanup") &&
      !symbol.semantic_tags?.includes("raii")
    ) {
      antiPatterns.push("resource-leak-risk");
    }

    // Synchronization Issues
    if (
      symbol.semantic_tags?.includes("threading") &&
      !symbol.semantic_tags?.includes("synchronized")
    ) {
      antiPatterns.push("synchronization-risk");
    }

    return antiPatterns;
  }

  private detectGPUAntiPatterns(symbol: any): string[] {
    const antiPatterns: string[] = [];

    // CPU-GPU Sync Issues
    if (
      !symbol.semantic_tags?.includes("async") &&
      symbol.semantic_tags?.includes("blocking")
    ) {
      antiPatterns.push("cpu-gpu-sync-issue");
    }

    // Inefficient Memory Transfer
    if (symbol.semantic_tags?.includes("frequent-transfer")) {
      antiPatterns.push("frequent-memory-transfer");
    }

    return antiPatterns;
  }

  private detectMemoryAntiPatterns(symbol: any): string[] {
    const antiPatterns: string[] = [];

    // Memory Fragmentation
    if (symbol.semantic_tags?.includes("frequent-alloc")) {
      antiPatterns.push("memory-fragmentation");
    }

    // Lack of Alignment
    if (!symbol.semantic_tags?.includes("aligned")) {
      antiPatterns.push("alignment-issues");
    }

    return antiPatterns;
  }

  private detectPipelineAntiPatterns(symbol: any, stages: any[]): string[] {
    const antiPatterns: string[] = [];

    // Monolithic Pipeline
    if (stages.length < 3) {
      antiPatterns.push("monolithic-pipeline");
    }

    // Pipeline Explosion
    if (stages.length > 20) {
      antiPatterns.push("pipeline-explosion");
    }

    return antiPatterns;
  }

  private async calculatePatternMetrics(
    symbolId: number
  ): Promise<PatternInstance["metrics"]> {
    // Get relationship counts for fan-in/fan-out
    const fanIn = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM universal_relationships
      WHERE to_symbol_id = ?
    `
      )
      .get(symbolId) as any;

    const fanOut = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM universal_relationships
      WHERE from_symbol_id = ?
    `
      )
      .get(symbolId) as any;

    // Simplified metrics - in reality these would be more sophisticated
    return {
      cyclomaticComplexity: Math.min(10, fanOut.count * 0.5),
      linesOfCode: 50 + fanOut.count * 10, // Estimated
      fanIn: fanIn.count,
      fanOut: fanOut.count,
      coupling: Math.min(10, (fanIn.count + fanOut.count) * 0.1),
      cohesion: Math.max(0, 10 - fanOut.count * 0.2),
    };
  }

  private async getPatternEvolution(
    symbolId: number
  ): Promise<PatternInstance["evolution"]> {
    // Get symbol's file information for tracking
    const fileInfo = this.db
      .prepare(
        `
        SELECT 
          f.lastParsed,
          f.filePath,
          s.createdAt,
          s.updatedAt,
          COUNT(DISTINCT r.id) as relationshipCount
        FROM universal_symbols s
        LEFT JOIN file_index f ON s.filePath = f.filePath AND s.projectId = f.projectId
        LEFT JOIN universal_relationships r ON s.id = r.from_symbol_id OR s.id = r.to_symbol_id
        WHERE s.id = ?
        GROUP BY s.id
        `
      )
      .get(symbolId) as any;

    if (!fileInfo) {
      // Fallback for symbols without file tracking
      return {
        firstSeen: new Date(),
        lastModified: new Date(),
        changeCount: 0,
        stabilityTrend: "stable",
      };
    }

    // Parse timestamps
    const firstSeen = fileInfo.createdAt ? new Date(fileInfo.createdAt) : new Date();
    const lastModified = fileInfo.lastParsed ? new Date(fileInfo.lastParsed) : 
                        fileInfo.updatedAt ? new Date(fileInfo.updatedAt) : new Date();
    
    // Estimate change count based on relationship changes
    // More relationships generally indicate more changes over time
    const changeCount = Math.min(fileInfo.relationshipCount || 0, 50);
    
    // Determine stability trend based on recent activity
    const daysSinceLastChange = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
    let stabilityTrend: "improving" | "degrading" | "stable";
    
    if (daysSinceLastChange < 7) {
      // Recent changes - potentially degrading stability
      stabilityTrend = changeCount > 20 ? "degrading" : "stable";
    } else if (daysSinceLastChange > 30) {
      // No recent changes - improving stability
      stabilityTrend = "improving";
    } else {
      // Moderate activity
      stabilityTrend = "stable";
    }

    return {
      firstSeen,
      lastModified,
      changeCount,
      stabilityTrend,
    };
  }

  /**
   * Generate architectural insights based on pattern analysis
   */
  async generateInsights(
    patterns: PatternInstance[]
  ): Promise<ArchitecturalInsight[]> {
    const insights: ArchitecturalInsight[] = [];

    // Pattern clustering analysis
    insights.push(...this.analyzePatternClusters(patterns));

    // Anti-pattern hotspot detection
    insights.push(...this.analyzeAntiPatternHotspots(patterns));

    // Design drift detection
    insights.push(...this.analyzeDesignDrift(patterns));

    // Complexity spike detection
    insights.push(...this.analyzeComplexitySpikes(patterns));

    // Coupling issue detection
    insights.push(...this.analyzeCouplingIssues(patterns));

    return insights.sort((a, b) => b.severity - a.severity);
  }

  private analyzePatternClusters(
    patterns: PatternInstance[]
  ): ArchitecturalInsight[] {
    const insights: ArchitecturalInsight[] = [];

    // Group patterns by stage
    const stageGroups = new Map<string, PatternInstance[]>();
    for (const pattern of patterns) {
      if (!stageGroups.has(pattern.stage)) {
        stageGroups.set(pattern.stage, []);
      }
      stageGroups.get(pattern.stage)!.push(pattern);
    }

    // Find stages with high pattern density
    for (const [stage, stagePatterns] of stageGroups) {
      if (stagePatterns.length > 5) {
        insights.push({
          type: "pattern_cluster",
          severity: Math.min(8, stagePatterns.length * 0.5),
          title: `High Pattern Density in ${stage}`,
          description: `The ${stage} stage contains ${stagePatterns.length} architectural patterns, indicating potential over-engineering or complex requirements.`,
          affectedPatterns: stagePatterns.map((p) => p.id),
          recommendations: [
            "Review if all patterns are necessary",
            "Consider consolidating similar patterns",
            "Ensure patterns are not conflicting",
            "Document pattern interaction guidelines",
          ],
          codeLocations: stagePatterns.map((p) => ({
            filePath: p.location.filePath,
            line: p.location.line,
            snippet: `${p.patternType}: ${p.name}`,
          })),
        });
      }
    }

    return insights;
  }

  private analyzeAntiPatternHotspots(
    patterns: PatternInstance[]
  ): ArchitecturalInsight[] {
    const insights: ArchitecturalInsight[] = [];

    // Find patterns with multiple anti-patterns
    const problematicPatterns = patterns.filter(
      (p) => p.antiPatterns.length > 1
    );

    if (problematicPatterns.length > 0) {
      insights.push({
        type: "anti_pattern_hotspot",
        severity: Math.min(
          10,
          problematicPatterns.length +
            Math.max(...problematicPatterns.map((p) => p.antiPatterns.length))
        ),
        title: "Anti-Pattern Hotspots Detected",
        description: `Found ${problematicPatterns.length} patterns with multiple anti-patterns, indicating design issues that need attention.`,
        affectedPatterns: problematicPatterns.map((p) => p.id),
        recommendations: [
          "Refactor patterns with multiple anti-patterns",
          "Review design decisions leading to anti-patterns",
          "Consider alternative design approaches",
          "Add monitoring for anti-pattern metrics",
        ],
        codeLocations: problematicPatterns.map((p) => ({
          filePath: p.location.filePath,
          line: p.location.line,
          snippet: `${p.name}: ${p.antiPatterns.join(", ")}`,
        })),
      });
    }

    return insights;
  }

  private analyzeDesignDrift(
    patterns: PatternInstance[]
  ): ArchitecturalInsight[] {
    const insights: ArchitecturalInsight[] = [];

    // Find patterns with degrading stability
    const degradingPatterns = patterns.filter(
      (p) => p.evolution.stabilityTrend === "degrading"
    );

    if (degradingPatterns.length > 2) {
      insights.push({
        type: "design_drift",
        severity: Math.min(9, degradingPatterns.length * 1.5),
        title: "Design Drift Detected",
        description: `${degradingPatterns.length} patterns show degrading stability trends, suggesting architectural erosion over time.`,
        affectedPatterns: degradingPatterns.map((p) => p.id),
        recommendations: [
          "Review recent changes to degrading patterns",
          "Implement stricter change review processes",
          "Consider architectural refactoring",
          "Add stability monitoring metrics",
        ],
        codeLocations: degradingPatterns.map((p) => ({
          filePath: p.location.filePath,
          line: p.location.line,
          snippet: `${p.name} (${p.evolution.changeCount} recent changes)`,
        })),
      });
    }

    return insights;
  }

  private analyzeComplexitySpikes(
    patterns: PatternInstance[]
  ): ArchitecturalInsight[] {
    const insights: ArchitecturalInsight[] = [];

    // Find patterns with high complexity
    const complexPatterns = patterns.filter((p) => p.complexity > 7);

    if (complexPatterns.length > 0) {
      insights.push({
        type: "complexity_spike",
        severity: Math.min(
          8,
          complexPatterns.length +
            Math.max(...complexPatterns.map((p) => p.complexity)) -
            5
        ),
        title: "High Complexity Patterns",
        description: `Found ${complexPatterns.length} patterns with complexity scores above 7, indicating potential maintenance challenges.`,
        affectedPatterns: complexPatterns.map((p) => p.id),
        recommendations: [
          "Break down complex patterns into simpler components",
          "Review if pattern complexity is justified",
          "Add comprehensive documentation for complex patterns",
          "Consider pattern simplification strategies",
        ],
        codeLocations: complexPatterns.map((p) => ({
          filePath: p.location.filePath,
          line: p.location.line,
          snippet: `${p.name} (complexity: ${p.complexity})`,
        })),
      });
    }

    return insights;
  }

  private analyzeCouplingIssues(
    patterns: PatternInstance[]
  ): ArchitecturalInsight[] {
    const insights: ArchitecturalInsight[] = [];

    // Find patterns with high coupling
    const tightlyCoupledPatterns = patterns.filter(
      (p) => p.metrics.coupling > 7
    );

    if (tightlyCoupledPatterns.length > 0) {
      insights.push({
        type: "coupling_issue",
        severity: Math.min(9, tightlyCoupledPatterns.length * 2),
        title: "High Coupling Detected",
        description: `${tightlyCoupledPatterns.length} patterns show high coupling scores, reducing maintainability and testability.`,
        affectedPatterns: tightlyCoupledPatterns.map((p) => p.id),
        recommendations: [
          "Introduce interfaces to reduce coupling",
          "Apply dependency injection patterns",
          "Review and minimize cross-pattern dependencies",
          "Consider architectural layer separation",
        ],
        codeLocations: tightlyCoupledPatterns.map((p) => ({
          filePath: p.location.filePath,
          line: p.location.line,
          snippet: `${p.name} (coupling: ${p.metrics.coupling})`,
        })),
      });
    }

    return insights;
  }

  /**
   * Generate pattern relationship graph
   */
  async generatePatternRelationships(
    patterns: PatternInstance[]
  ): Promise<PatternRelationship[]> {
    const relationships: PatternRelationship[] = [];

    // Find relationships between patterns based on shared participants
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const pattern1 = patterns[i];
        const pattern2 = patterns[j];

        // Check for shared participants
        const sharedParticipants = pattern1.participants.filter((p) =>
          pattern2.participants.includes(p)
        );

        if (sharedParticipants.length > 0) {
          relationships.push({
            source: pattern1.id,
            target: pattern2.id,
            relationType: this.determineRelationType(pattern1, pattern2),
            strength:
              sharedParticipants.length /
              Math.max(
                pattern1.participants.length,
                pattern2.participants.length
              ),
            description: `Shares ${
              sharedParticipants.length
            } participants: ${sharedParticipants.slice(0, 2).join(", ")}`,
          });
        }

        // Check for stage-based relationships
        if (
          pattern1.stage === pattern2.stage &&
          sharedParticipants.length === 0
        ) {
          relationships.push({
            source: pattern1.id,
            target: pattern2.id,
            relationType: "coordinates",
            strength: 0.3,
            description: `Both operate in ${pattern1.stage} stage`,
          });
        }
      }
    }

    return relationships;
  }

  private determineRelationType(
    pattern1: PatternInstance,
    pattern2: PatternInstance
  ): PatternRelationship["relationType"] {
    // Factory + Strategy often work together
    if (
      (pattern1.patternType === "factory" &&
        pattern2.patternType === "strategy") ||
      (pattern1.patternType === "strategy" &&
        pattern2.patternType === "factory")
    ) {
      return "composes";
    }

    // Observer + Singleton often compose
    if (
      (pattern1.patternType === "observer" &&
        pattern2.patternType === "singleton") ||
      (pattern1.patternType === "singleton" &&
        pattern2.patternType === "observer")
    ) {
      return "uses";
    }

    // Vulkan patterns often extend each other
    if (
      pattern1.patternType.includes("vulkan") &&
      pattern2.patternType.includes("vulkan")
    ) {
      return "extends";
    }

    // Same pattern type might conflict
    if (pattern1.patternType === pattern2.patternType) {
      return "conflicts";
    }

    return "coordinates";
  }

  /**
   * Generate interactive HTML visualization of architectural patterns
   */
  async generatePatternVisualization(
    patterns: PatternInstance[],
    relationships: PatternRelationship[],
    insights: ArchitecturalInsight[]
  ): Promise<string> {
    const stageStats = this.calculateStageStatistics(patterns);
    const patternTypeStats = this.calculatePatternTypeStatistics(patterns);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Architectural Patterns - Planet ProcGen</title>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #0a0a0a;
            color: #e0e0e0;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            height: 100vh;
        }
        
        .sidebar {
            width: 350px;
            background: rgba(20, 20, 30, 0.95);
            backdrop-filter: blur(10px);
            padding: 20px;
            overflow-y: auto;
            border-right: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .main {
            flex: 1;
            position: relative;
        }
        
        #cy {
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, #1a1a2e 0%, #0a0a0a 100%);
        }
        
        .header {
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 20px;
            margin-bottom: 20px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 300;
            color: #fff;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px;
            border-radius: 6px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: #4ecdc4;
        }
        
        .stat-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
        }
        
        .insights-section {
            margin-bottom: 20px;
        }
        
        .insight {
            background: rgba(255, 255, 255, 0.05);
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 6px;
            border-left: 4px solid;
        }
        
        .insight.high-severity { border-left-color: #ff4757; }
        .insight.medium-severity { border-left-color: #ffa726; }
        .insight.low-severity { border-left-color: #66bb6a; }
        
        .insight-title {
            font-weight: 600;
            margin-bottom: 4px;
            font-size: 13px;
        }
        
        .insight-desc {
            font-size: 11px;
            color: #ccc;
        }
        
        .pattern-types {
            margin-bottom: 20px;
        }
        
        .pattern-type {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px;
            margin-bottom: 4px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .pattern-type:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .pattern-type-name {
            font-size: 12px;
            font-weight: 500;
        }
        
        .pattern-type-count {
            background: #4ecdc4;
            color: #000;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
        }
        
        .controls {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(20, 20, 30, 0.9);
            padding: 15px;
            border-radius: 8px;
            backdrop-filter: blur(10px);
        }
        
        .control-group {
            margin-bottom: 15px;
        }
        
        .control-group label {
            display: block;
            font-size: 12px;
            color: #ccc;
            margin-bottom: 8px;
        }
        
        .button-group {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
        }
        
        button {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 6px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        }
        
        button:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        button.active {
            background: #4ecdc4;
            border-color: #4ecdc4;
            color: #000;
        }
        
        .pattern-details {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(20, 20, 30, 0.9);
            padding: 15px;
            border-radius: 8px;
            backdrop-filter: blur(10px);
            max-width: 300px;
            display: none;
        }
        
        .pattern-details h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        
        .pattern-details .details {
            font-size: 12px;
            line-height: 1.4;
            color: #ccc;
        }
        
        .legend {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .legend h3 {
            font-size: 12px;
            margin-bottom: 10px;
            color: #ccc;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            font-size: 11px;
        }
        
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
            margin-right: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="header">
                <h1>Architectural Patterns</h1>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${patterns.length}</div>
                    <div class="stat-label">Total Patterns</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${
                      insights.filter((i) => i.severity >= 7).length
                    }</div>
                    <div class="stat-label">High Severity Issues</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${Math.round(
                      patterns.reduce(
                        (sum, p) => sum + p.maintainabilityScore,
                        0
                      ) / patterns.length
                    )}</div>
                    <div class="stat-label">Avg Maintainability</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${
                      Object.keys(stageStats).length
                    }</div>
                    <div class="stat-label">Affected Stages</div>
                </div>
            </div>
            
            <div class="insights-section">
                <h3>Key Insights</h3>
                ${insights
                  .slice(0, 5)
                  .map(
                    (insight) => `
                    <div class="insight ${
                      insight.severity >= 7
                        ? "high-severity"
                        : insight.severity >= 4
                        ? "medium-severity"
                        : "low-severity"
                    }">
                        <div class="insight-title">${insight.title}</div>
                        <div class="insight-desc">${insight.description}</div>
                    </div>
                `
                  )
                  .join("")}
            </div>
            
            <div class="pattern-types">
                <h3>Pattern Types</h3>
                ${Object.entries(patternTypeStats)
                  .map(
                    ([type, count]) => `
                    <div class="pattern-type" onclick="filterByType('${type}')">
                        <span class="pattern-type-name">${type
                          .replace("-", " ")
                          .toUpperCase()}</span>
                        <span class="pattern-type-count">${count}</span>
                    </div>
                `
                  )
                  .join("")}
            </div>
            
            <div class="legend">
                <h3>Legend</h3>
                <div class="legend-item">
                    <div class="legend-color" style="background: #4ecdc4;"></div>
                    <span>Factory Pattern</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #ff6b6b;"></div>
                    <span>Singleton Pattern</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #ffa726;"></div>
                    <span>Observer Pattern</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #66bb6a;"></div>
                    <span>Strategy Pattern</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #9c27b0;"></div>
                    <span>Vulkan RAII</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #2196f3;"></div>
                    <span>GPU Compute</span>
                </div>
            </div>
        </div>
        
        <div class="main">
            <div class="controls">
                <div class="control-group">
                    <label>Layout</label>
                    <div class="button-group">
                        <button onclick="changeLayout('dagre')" class="active">Hierarchical</button>
                        <button onclick="changeLayout('cola')">Force</button>
                        <button onclick="changeLayout('concentric')">Radial</button>
                    </div>
                </div>
                
                <div class="control-group">
                    <label>Filter by Complexity</label>
                    <div class="button-group">
                        <button onclick="filterByComplexity(7)">High (7+)</button>
                        <button onclick="filterByComplexity(4)">Medium (4+)</button>
                        <button onclick="filterByComplexity(0)">All</button>
                    </div>
                </div>
                
                <div class="control-group">
                    <label>Show Relationships</label>
                    <div class="button-group">
                        <button onclick="toggleRelationships()">Toggle</button>
                        <button onclick="cy.fit()">Fit</button>
                        <button onclick="cy.reset()">Reset</button>
                    </div>
                </div>
            </div>
            
            <div id="cy"></div>
            
            <div class="pattern-details" id="patternDetails">
                <h3 id="detailsTitle"></h3>
                <div class="details" id="detailsContent"></div>
            </div>
        </div>
    </div>
    
    <script>
        const patterns = ${JSON.stringify(patterns)};
        const relationships = ${JSON.stringify(relationships)};
        
        const patternColors = {
            'factory': '#4ecdc4',
            'singleton': '#ff6b6b',
            'observer': '#ffa726',
            'strategy': '#66bb6a',
            'vulkan-raii': '#9c27b0',
            'gpu-compute': '#2196f3',
            'memory-pool': '#795548',
            'pipeline': '#607d8b'
        };
        
        let cy;
        let showRelationships = true;
        
        function initGraph() {
            const graphData = {
                nodes: patterns.map(pattern => ({
                    data: {
                        id: pattern.id,
                        label: pattern.name,
                        type: pattern.patternType,
                        complexity: pattern.complexity,
                        maintainability: pattern.maintainabilityScore,
                        stage: pattern.stage,
                        antiPatterns: pattern.antiPatterns.length,
                        filePath: pattern.location.filePath
                    }
                })),
                edges: showRelationships ? relationships.map(rel => ({
                    data: {
                        id: rel.source + '-' + rel.target,
                        source: rel.source,
                        target: rel.target,
                        type: rel.relationType,
                        strength: rel.strength
                    }
                })) : []
            };
            
            cy = cytoscape({
                container: document.getElementById('cy'),
                elements: graphData,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'background-color': ele => patternColors[ele.data('type')] || '#999',
                            'width': ele => 40 + Math.sqrt(ele.data('complexity')) * 8,
                            'height': ele => 40 + Math.sqrt(ele.data('complexity')) * 8,
                            'font-size': '10px',
                            'color': '#fff',
                            'text-outline-color': '#000',
                            'text-outline-width': 2,
                            'border-width': ele => ele.data('antiPatterns') > 0 ? 3 : 1,
                            'border-color': ele => ele.data('antiPatterns') > 0 ? '#ff4757' : '#fff',
                            'opacity': 0.9
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': ele => Math.max(1, ele.data('strength') * 4),
                            'line-color': '#666',
                            'target-arrow-color': '#666',
                            'target-arrow-shape': 'triangle',
                            'curve-style': 'bezier',
                            'opacity': 0.5
                        }
                    },
                    {
                        selector: '.highlighted',
                        style: {
                            'background-color': '#fff',
                            'border-color': '#4ecdc4',
                            'border-width': 4,
                            'z-index': 999
                        }
                    },
                    {
                        selector: '.dimmed',
                        style: {
                            'opacity': 0.3
                        }
                    }
                ],
                layout: {
                    name: 'dagre',
                    rankDir: 'TB',
                    nodeSep: 80,
                    rankSep: 100
                }
            });
            
            cy.on('tap', 'node', function(evt) {
                const node = evt.target;
                const pattern = patterns.find(p => p.id === node.id());
                
                if (pattern) {
                    showPatternDetails(pattern);
                    
                    cy.elements().removeClass('highlighted').addClass('dimmed');
                    node.removeClass('dimmed').addClass('highlighted');
                    node.neighborhood().removeClass('dimmed');
                }
            });
            
            cy.on('tap', function(evt) {
                if (evt.target === cy) {
                    cy.elements().removeClass('dimmed highlighted');
                    document.getElementById('patternDetails').style.display = 'none';
                }
            });
        }
        
        function showPatternDetails(pattern) {
            document.getElementById('detailsTitle').textContent = pattern.name;
            document.getElementById('detailsContent').innerHTML = \`
                <strong>Type:</strong> \${pattern.patternType}<br>
                <strong>Stage:</strong> \${pattern.stage}<br>
                <strong>Complexity:</strong> \${pattern.complexity}/10<br>
                <strong>Maintainability:</strong> \${pattern.maintainabilityScore}/100<br>
                <strong>Confidence:</strong> \${(pattern.confidence * 100).toFixed(1)}%<br>
                <strong>Anti-patterns:</strong> \${pattern.antiPatterns.join(', ') || 'None'}<br>
                <strong>Participants:</strong> \${pattern.participants.slice(0, 3).join(', ')}<br>
                <strong>File:</strong> \${pattern.location.filePath.split('/').pop()}
            \`;
            document.getElementById('patternDetails').style.display = 'block';
        }
        
        function changeLayout(layoutName) {
            document.querySelectorAll('.controls button').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            const layouts = {
                dagre: { name: 'dagre', rankDir: 'TB', nodeSep: 80, rankSep: 100 },
                cola: { name: 'cola', nodeSpacing: 50, edgeLength: 200 },
                concentric: { name: 'concentric', concentric: n => n.data('complexity') }
            };
            
            cy.layout(layouts[layoutName]).run();
        }
        
        function filterByComplexity(minComplexity) {
            cy.elements().show();
            if (minComplexity > 0) {
                cy.nodes().forEach(node => {
                    if (node.data('complexity') < minComplexity) {
                        node.hide();
                    }
                });
                cy.edges().forEach(edge => {
                    if (edge.source().hidden() || edge.target().hidden()) {
                        edge.hide();
                    }
                });
            }
        }
        
        function filterByType(type) {
            cy.elements().removeClass('highlighted dimmed');
            cy.nodes().forEach(node => {
                if (node.data('type') === type) {
                    node.addClass('highlighted');
                } else {
                    node.addClass('dimmed');
                }
            });
        }
        
        function toggleRelationships() {
            showRelationships = !showRelationships;
            initGraph();
        }
        
        initGraph();
    </script>
</body>
</html>`;
  }

  private calculateStageStatistics(
    patterns: PatternInstance[]
  ): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const pattern of patterns) {
      stats[pattern.stage] = (stats[pattern.stage] || 0) + 1;
    }
    return stats;
  }

  private calculatePatternTypeStatistics(
    patterns: PatternInstance[]
  ): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const pattern of patterns) {
      stats[pattern.patternType] = (stats[pattern.patternType] || 0) + 1;
    }
    return stats;
  }

  close(): void {
    this.db.close();
  }
}
