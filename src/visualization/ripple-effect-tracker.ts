/**
 * Ripple Effect Tracker - Advanced Impact Analysis Visualization
 *
 * Tracks downstream effects of code changes and visualizes dependency ripples
 * across the codebase to predict architectural impact and guide development.
 */

import Database from "better-sqlite3";
import * as path from "path";

export interface RippleNode {
  id: string;
  name: string;
  type: "struct" | "class" | "function" | "variable" | "enum" | "typedef";
  filePath: string;
  stage: string;
  impactLevel: number; // 0-10 scale of change impact
  changeType: "type" | "value" | "signature" | "dependency" | "removal";
  confidence: number; // Parser confidence for this symbol
  usageCount: number; // How many places reference this
  criticalityScore: number; // How critical this symbol is to the system
  dependencies: string[]; // What this depends on
  dependents: string[]; // What depends on this
  semanticTags: string[]; // GPU, factory, vulkan, etc.
  location: {
    line: number;
    column: number;
  };
  metrics: {
    complexity: number;
    testCoverage?: number;
    maintainabilityIndex?: number;
  };
}

export interface RippleEdge {
  source: string;
  target: string;
  relationshipType: "calls" | "uses" | "inherits" | "contains" | "modifies";
  impactWeight: number; // How much change in source affects target
  propagationDelay: number; // How quickly changes propagate
  breakingChangeProbability: number; // Likelihood this change breaks things
  isDirectDependency: boolean;
  confidenceScore: number;
}

export interface ImpactPrediction {
  changedSymbol: string;
  changeType: "type" | "value" | "signature" | "dependency" | "removal";
  simulatedChange: any; // The hypothetical change being analyzed
  affectedNodes: {
    node: RippleNode;
    impactSeverity: number; // 0-10 scale
    propagationPath: string[];
    requiredActions: string[];
    estimatedFixTime: number; // Minutes
  }[];
  riskAssessment: {
    overall: number; // 0-10 risk score
    breakingChanges: number; // Number of likely breaking changes
    testingRequired: string[];
    reviewersNeeded: string[];
  };
  recommendations: string[];
}

export class RippleEffectTracker {
  private db: Database.Database;
  private impactCache = new Map<string, ImpactPrediction>();
  private dependencyGraph = new Map<string, Set<string>>();
  private reverseDependencyGraph = new Map<string, Set<string>>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeGraphs();
  }

  private initializeGraphs(): void {
    // Build dependency graphs for fast impact calculation
    try {
      const relationships = this.db
        .prepare(
          `
        SELECT 
          s1.qualified_name as source_symbol,
          s2.qualified_name as target_symbol,
          sr.type,
          sr.confidence
        FROM universal_relationships sr
        JOIN universal_symbols s1 ON sr.from_symbol_id = s1.id
        JOIN universal_symbols s2 ON sr.to_symbol_id = s2.id
        WHERE sr.confidence > 0.7
      `
        )
        .all() as any[];

      for (const rel of relationships) {
        // Forward dependencies
        if (!this.dependencyGraph.has(rel.source_symbol)) {
          this.dependencyGraph.set(rel.source_symbol, new Set());
        }
        this.dependencyGraph.get(rel.source_symbol)!.add(rel.target_symbol);

        // Reverse dependencies
        if (!this.reverseDependencyGraph.has(rel.target_symbol)) {
          this.reverseDependencyGraph.set(rel.target_symbol, new Set());
        }
        this.reverseDependencyGraph
          .get(rel.target_symbol)!
          .add(rel.source_symbol);
      }
    } catch (error) {
      console.warn("Could not initialize dependency graphs:", error);
    }
  }

  /**
   * Predict the impact of changing a symbol (type, value, signature, etc.)
   */
  async predictImpact(
    symbolName: string,
    changeType: "type" | "value" | "signature" | "dependency" | "removal",
    simulatedChange?: any
  ): Promise<ImpactPrediction> {
    const cacheKey = `${symbolName}:${changeType}`;
    if (this.impactCache.has(cacheKey)) {
      return this.impactCache.get(cacheKey)!;
    }

    // Get the symbol being changed
    const symbol = await this.getSymbolDetails(symbolName);
    if (!symbol) {
      // Return a basic prediction for unknown symbols
      return {
        changedSymbol: symbolName,
        changeType,
        simulatedChange,
        affectedNodes: [],
        riskAssessment: {
          overall: 5,
          breakingChanges: 0,
          testingRequired: ["Basic validation"],
          reviewersNeeded: ["Code reviewer"],
        },
        recommendations: ["Verify symbol exists", "Check for typos"],
      };
    }

    // Find all affected nodes through BFS traversal
    const affectedNodes = await this.findAffectedNodes(symbol, changeType);

    // Calculate risk assessment
    const riskAssessment = this.calculateRiskAssessment(affectedNodes);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      symbol,
      changeType,
      affectedNodes
    );

    const prediction: ImpactPrediction = {
      changedSymbol: symbolName,
      changeType,
      simulatedChange,
      affectedNodes,
      riskAssessment,
      recommendations,
    };

    this.impactCache.set(cacheKey, prediction);
    return prediction;
  }

  private async getSymbolDetails(
    symbolName: string
  ): Promise<RippleNode | null> {
    try {
      const symbol = this.db
        .prepare(
          `
        SELECT 
          id,
          name,
          qualified_name,
          file_path,
          kind,
          confidence,
          semantic_tags,
          line,
          column,
          language_features,
          namespace
        FROM universal_symbols
        WHERE qualified_name = ? OR name = ?
        ORDER BY confidence DESC
        LIMIT 1
      `
        )
        .get(symbolName, symbolName) as any;

      if (!symbol) return null;

      // Get usage count
      const usageCount = this.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM universal_relationships sr
        WHERE sr.to_symbol_id = ?
      `
        )
        .get(symbol.id) as any;

      // Get dependencies
      const dependencies =
        this.dependencyGraph.get(symbol.qualified_name) || new Set();
      const dependents =
        this.reverseDependencyGraph.get(symbol.qualified_name) || new Set();

      return {
        id: symbol.qualified_name,
        name: symbol.name,
        type: symbol.kind as any,
        filePath: symbol.file_path,
        stage: "analysis", // Universal symbols don't have pipeline_stage
        impactLevel: this.calculateImpactLevel(symbol),
        changeType: "type", // Will be updated based on analysis
        confidence: symbol.confidence || 0.5,
        usageCount: usageCount?.count || 0,
        criticalityScore: this.calculateCriticalityScore(
          symbol,
          usageCount?.count || 0
        ),
        dependencies: Array.from(dependencies),
        dependents: Array.from(dependents),
        semanticTags: Array.isArray(symbol.semantic_tags)
          ? symbol.semantic_tags
          : (symbol.semantic_tags ? [symbol.semantic_tags] : []),
        location: {
          line: symbol.line || 0,
          column: symbol.column || 0,
        },
        metrics: {
          complexity: this.calculateComplexity(symbol),
          testCoverage: this.estimateTestCoverage(symbol),
          maintainabilityIndex: this.calculateMaintainabilityIndex(symbol),
        },
      };
    } catch (error) {
      console.warn("Error getting symbol details:", error);
      return null;
    }
  }

  private async findAffectedNodes(
    sourceSymbol: RippleNode,
    changeType: string
  ): Promise<ImpactPrediction["affectedNodes"]> {
    const affected: ImpactPrediction["affectedNodes"] = [];
    const visited = new Set<string>();
    const queue: Array<{ node: RippleNode; depth: number; path: string[] }> =
      [];

    queue.push({ node: sourceSymbol, depth: 0, path: [] });

    while (queue.length > 0) {
      const { node, depth, path } = queue.shift()!;

      if (visited.has(node.id) || depth > 6) continue; // Limit depth to prevent infinite loops
      visited.add(node.id);

      if (depth > 0) {
        // Don't include the source symbol itself
        const impactSeverity = this.calculateImpactSeverity(
          node,
          changeType,
          depth
        );
        const requiredActions = this.determineRequiredActions(node, changeType);
        const estimatedFixTime = this.estimateFixTime(
          node,
          changeType,
          impactSeverity
        );

        affected.push({
          node,
          impactSeverity,
          propagationPath: [...path, node.id],
          requiredActions,
          estimatedFixTime,
        });
      }

      // Add dependents to queue
      for (const dependentId of node.dependents) {
        if (!visited.has(dependentId)) {
          const dependentNode = await this.getSymbolDetails(dependentId);
          if (dependentNode) {
            queue.push({
              node: dependentNode,
              depth: depth + 1,
              path: [...path, node.id],
            });
          }
        }
      }
    }

    return affected.sort((a, b) => b.impactSeverity - a.impactSeverity);
  }

  private calculateImpactLevel(symbol: any): number {
    let impact = 0;

    // Higher impact for core system symbols
    if (
      symbol.semantic_tags?.includes("core") ||
      symbol.semantic_tags?.includes("vulkan") ||
      symbol.semantic_tags?.includes("gpu")
    ) {
      impact += 3;
    }

    // Higher impact for factory patterns
    if (symbol.semantic_tags?.includes("factory")) {
      impact += 2;
    }

    // Higher impact based on pipeline stage
    const criticalStages = ["rendering", "terrain_formation", "orchestration"];
    if (criticalStages.includes(symbol.pipeline_stage)) {
      impact += 2;
    }

    // Higher impact for template types
    if (symbol.template_info) {
      impact += 1;
    }

    return Math.min(impact, 10);
  }

  private calculateCriticalityScore(symbol: any, usageCount: number): number {
    let score = 0;

    // Usage-based criticality
    score += Math.min(usageCount * 0.1, 5);

    // Semantic tag based criticality
    if (symbol.semantic_tags?.includes("core")) score += 3;
    if (symbol.semantic_tags?.includes("vulkan")) score += 2;
    if (symbol.semantic_tags?.includes("gpu")) score += 2;
    if (symbol.semantic_tags?.includes("factory")) score += 1;

    // Pipeline stage criticality
    const criticalStages = ["rendering", "terrain_formation", "orchestration"];
    if (criticalStages.includes(symbol.pipeline_stage)) score += 2;

    // File-based criticality (headers are more critical)
    if (
      symbol.file_path?.includes("include/") ||
      symbol.file_path?.endsWith(".ixx")
    ) {
      score += 1;
    }

    return Math.min(score, 10);
  }

  private calculateComplexity(symbol: any): number {
    let complexity = 1;

    // Template complexity
    if (symbol.template_info) {
      complexity += 2;
    }

    // Namespace nesting
    if (symbol.namespace_info) {
      complexity += symbol.namespace_info.split("::").length * 0.5;
    }

    // Semantic complexity
    if (symbol.semantic_tags?.includes("gpu")) complexity += 1;
    if (symbol.semantic_tags?.includes("vulkan")) complexity += 1;

    return Math.min(complexity, 10);
  }

  private estimateTestCoverage(symbol: any): number {
    // This is a heuristic - in reality you'd integrate with actual test coverage data
    let coverage = 0.5; // Default 50%

    // Core systems typically have better test coverage
    if (symbol.semantic_tags?.includes("core")) coverage += 0.2;
    if (symbol.semantic_tags?.includes("test")) coverage += 0.3;

    // GPU/Vulkan code is often harder to test
    if (symbol.semantic_tags?.includes("gpu")) coverage -= 0.1;
    if (symbol.semantic_tags?.includes("vulkan")) coverage -= 0.1;

    return Math.max(0, Math.min(coverage, 1));
  }

  private calculateMaintainabilityIndex(symbol: any): number {
    // Microsoft's maintainability index formula (simplified)
    let index = 100;

    // Reduce for complexity
    index -= this.calculateComplexity(symbol) * 5;

    // Reduce for low confidence
    index -= (1 - (symbol.confidence || 0.8)) * 20;

    // Increase for good semantic tags
    if (symbol.semantic_tags?.includes("well-documented")) index += 10;
    if (symbol.semantic_tags?.includes("tested")) index += 10;

    return Math.max(0, Math.min(index, 100));
  }

  private calculateImpactSeverity(
    node: RippleNode,
    changeType: string,
    depth: number
  ): number {
    let severity = 10 - depth; // Closer nodes have higher impact

    // Adjust based on change type
    switch (changeType) {
      case "type":
        severity += 3; // Type changes are very impactful
        break;
      case "signature":
        severity += 2; // Signature changes break interfaces
        break;
      case "removal":
        severity += 4; // Removal is most impactful
        break;
      case "value":
        severity += 1; // Value changes might be less impactful
        break;
    }

    // Adjust based on node characteristics
    severity += node.criticalityScore * 0.5;
    severity += node.usageCount * 0.1;

    return Math.max(0, Math.min(severity, 10));
  }

  private determineRequiredActions(
    node: RippleNode,
    changeType: string
  ): string[] {
    const actions: string[] = [];

    switch (changeType) {
      case "type":
        actions.push("Update type declarations");
        actions.push("Review template instantiations");
        actions.push("Update documentation");
        break;
      case "signature":
        actions.push("Update function calls");
        actions.push("Review parameter passing");
        actions.push("Update unit tests");
        break;
      case "removal":
        actions.push("Find replacement implementation");
        actions.push("Update all references");
        actions.push("Remove dependent code");
        break;
      case "value":
        actions.push("Review value usage");
        actions.push("Update related calculations");
        break;
    }

    // Add stage-specific actions
    if (node.stage === "rendering") {
      actions.push("Test rendering pipeline");
      actions.push("Verify GPU compatibility");
    }

    if (node.semanticTags.includes("vulkan")) {
      actions.push("Validate Vulkan specifications");
      actions.push("Test on multiple GPUs");
    }

    return actions;
  }

  private estimateFixTime(
    node: RippleNode,
    changeType: string,
    severity: number
  ): number {
    let baseTime = 15; // 15 minutes base

    // Adjust for severity
    baseTime *= severity / 10 + 0.5;

    // Adjust for complexity
    baseTime *= node.metrics.complexity / 5;

    // Adjust for change type
    switch (changeType) {
      case "removal":
        baseTime *= 2;
        break;
      case "signature":
        baseTime *= 1.5;
        break;
      case "type":
        baseTime *= 1.3;
        break;
    }

    // Adjust for semantic tags
    if (node.semanticTags.includes("vulkan")) baseTime *= 1.4;
    if (node.semanticTags.includes("gpu")) baseTime *= 1.3;
    if (node.semanticTags.includes("factory")) baseTime *= 1.2;

    return Math.round(baseTime);
  }

  private calculateRiskAssessment(
    affectedNodes: ImpactPrediction["affectedNodes"]
  ): ImpactPrediction["riskAssessment"] {
    const high = affectedNodes.filter((n) => n.impactSeverity >= 7).length;
    const medium = affectedNodes.filter(
      (n) => n.impactSeverity >= 4 && n.impactSeverity < 7
    ).length;
    const low = affectedNodes.filter((n) => n.impactSeverity < 4).length;

    const overall = Math.min(10, high * 2 + medium * 1 + low * 0.5);
    const breakingChanges = high + Math.floor(medium / 2);

    const testingRequired = [
      ...new Set(
        affectedNodes.flatMap((n) =>
          n.requiredActions.filter((a) => a.includes("test"))
        )
      ),
    ];

    const reviewersNeeded = this.determineReviewersNeeded(affectedNodes);

    return {
      overall,
      breakingChanges,
      testingRequired,
      reviewersNeeded,
    };
  }

  private determineReviewersNeeded(
    affectedNodes: ImpactPrediction["affectedNodes"]
  ): string[] {
    const reviewers = new Set<string>();

    // Stage-based reviewers
    const stages = new Set(affectedNodes.map((n) => n.node.stage));
    for (const stage of stages) {
      switch (stage) {
        case "rendering":
          reviewers.add("Graphics Engineer");
          break;
        case "terrain_formation":
          reviewers.add("Terrain Specialist");
          break;
        case "vulkan":
          reviewers.add("Vulkan Expert");
          break;
        case "orchestration":
          reviewers.add("System Architect");
          break;
      }
    }

    // Semantic tag-based reviewers
    const allTags = new Set(affectedNodes.flatMap((n) => n.node.semanticTags));
    if (allTags.has("gpu")) reviewers.add("GPU Engineer");
    if (allTags.has("vulkan")) reviewers.add("Vulkan Expert");
    if (allTags.has("factory")) reviewers.add("Design Pattern Expert");

    return Array.from(reviewers);
  }

  private generateRecommendations(
    symbol: RippleNode,
    changeType: string,
    affectedNodes: ImpactPrediction["affectedNodes"]
  ): string[] {
    const recommendations: string[] = [];

    // General recommendations
    recommendations.push("Run comprehensive test suite before merge");
    recommendations.push("Update documentation to reflect changes");

    // Risk-based recommendations
    const highImpactNodes = affectedNodes.filter((n) => n.impactSeverity >= 7);
    if (highImpactNodes.length > 0) {
      recommendations.push("Consider feature flag for gradual rollout");
      recommendations.push("Plan for potential rollback strategy");
    }

    // Change type specific recommendations
    if (changeType === "type") {
      recommendations.push("Review all template instantiations");
      recommendations.push("Check for potential ABI compatibility issues");
    }

    if (changeType === "signature") {
      recommendations.push("Consider deprecation period for old signature");
      recommendations.push("Update all API documentation");
    }

    if (changeType === "removal") {
      recommendations.push("Ensure migration path exists for all users");
      recommendations.push("Consider keeping stub implementation temporarily");
    }

    // Semantic tag specific recommendations
    if (symbol.semanticTags.includes("vulkan")) {
      recommendations.push("Test on multiple GPU vendors");
      recommendations.push("Verify Vulkan specification compliance");
    }

    if (symbol.semanticTags.includes("gpu")) {
      recommendations.push("Profile GPU performance impact");
      recommendations.push("Test on different GPU architectures");
    }

    // Performance recommendations
    const totalFixTime = affectedNodes.reduce(
      (sum, n) => sum + n.estimatedFixTime,
      0
    );
    if (totalFixTime > 120) {
      // 2 hours
      recommendations.push("Consider splitting change into smaller parts");
      recommendations.push("Coordinate with team for parallel fix efforts");
    }

    return recommendations;
  }

  /**
   * Clear the impact cache
   */
  clearCache(): void {
    this.impactCache.clear();
  }

  close(): void {
    this.db.close();
  }
}
