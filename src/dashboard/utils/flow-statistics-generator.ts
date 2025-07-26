/**
 * Flow Statistics Generator Module
 * 
 * Generates comprehensive statistics about code execution flow,
 * including performance metrics, complexity analysis, and flow patterns.
 */

export interface FlowStatistics {
  totalNodes: number;
  totalEdges: number;
  totalPaths: number;
  averagePathLength: number;
  maxPathLength: number;
  cyclomaticComplexity: number;
  branchingFactor: number;
  coverageStats: {
    overall: number;
    byType: Map<string, number>;
    uncoveredNodes: number;
  };
  performanceStats?: {
    averageExecutionTime: number;
    totalExecutionTime: number;
    bottlenecks: Array<{
      nodeId: string | number;
      executionTime: number;
      callCount: number;
    }>;
  };
  flowPatterns: {
    linearFlows: number;
    branchingFlows: number;
    cyclicFlows: number;
    deadEnds: number;
  };
  complexityDistribution: Map<string, number>;
}

export interface StatisticsGenerationOptions {
  nodes: any[];
  edges: any[];
  executionPaths: any[];
  branchCoverage: any;
  deadCode: any;
  performanceMetrics?: boolean;
}

export class FlowStatisticsGenerator {
  /**
   * Generate comprehensive flow statistics
   */
  async generateStatistics(options: StatisticsGenerationOptions): Promise<FlowStatistics> {
    const {
      nodes,
      edges,
      executionPaths,
      branchCoverage,
      deadCode,
      performanceMetrics = false
    } = options;

    // Basic statistics
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const totalPaths = executionPaths.length;

    // Path statistics
    const pathStats = this.calculatePathStatistics(executionPaths);

    // Complexity metrics
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(nodes, edges);
    const branchingFactor = this.calculateBranchingFactor(nodes, edges);

    // Coverage statistics
    const coverageStats = this.calculateCoverageStatistics(
      nodes,
      executionPaths,
      branchCoverage,
      deadCode
    );

    // Performance statistics (if enabled)
    const performanceStats = performanceMetrics
      ? this.calculatePerformanceStatistics(nodes, edges, executionPaths)
      : undefined;

    // Flow patterns
    const flowPatterns = this.analyzeFlowPatterns(executionPaths, edges);

    // Complexity distribution
    const complexityDistribution = this.calculateComplexityDistribution(nodes);

    return {
      totalNodes,
      totalEdges,
      totalPaths,
      averagePathLength: pathStats.averageLength,
      maxPathLength: pathStats.maxLength,
      cyclomaticComplexity,
      branchingFactor,
      coverageStats,
      performanceStats,
      flowPatterns,
      complexityDistribution
    };
  }

  /**
   * Calculate path-related statistics
   */
  private calculatePathStatistics(executionPaths: any[]): {
    averageLength: number;
    maxLength: number;
  } {
    if (executionPaths.length === 0) {
      return { averageLength: 0, maxLength: 0 };
    }

    const lengths = executionPaths.map(path => path.nodes.length);
    const totalLength = lengths.reduce((sum, len) => sum + len, 0);
    const averageLength = totalLength / executionPaths.length;
    const maxLength = Math.max(...lengths);

    return {
      averageLength: Math.round(averageLength * 10) / 10,
      maxLength
    };
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateCyclomaticComplexity(nodes: any[], edges: any[]): number {
    // McCabe's cyclomatic complexity: M = E - N + 2P
    // E = edges, N = nodes, P = connected components (usually 1)
    const connectedComponents = this.countConnectedComponents(nodes, edges);
    return edges.length - nodes.length + 2 * connectedComponents;
  }

  /**
   * Count connected components in the graph
   */
  private countConnectedComponents(nodes: any[], edges: any[]): number {
    const adjacencyList = new Map<string, string[]>();
    const visited = new Set<string>();
    
    // Build adjacency list
    edges.forEach(edge => {
      const source = String(edge.source);
      const target = String(edge.target);
      
      if (!adjacencyList.has(source)) adjacencyList.set(source, []);
      if (!adjacencyList.has(target)) adjacencyList.set(target, []);
      
      adjacencyList.get(source)!.push(target);
      adjacencyList.get(target)!.push(source);
    });

    // DFS to count components
    let components = 0;
    nodes.forEach(node => {
      const nodeId = String(node.id);
      if (!visited.has(nodeId)) {
        components++;
        this.dfs(nodeId, adjacencyList, visited);
      }
    });

    return components;
  }

  /**
   * DFS helper for connected components
   */
  private dfs(nodeId: string, adjacencyList: Map<string, string[]>, visited: Set<string>): void {
    visited.add(nodeId);
    const neighbors = adjacencyList.get(nodeId) || [];
    neighbors.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        this.dfs(neighbor, adjacencyList, visited);
      }
    });
  }

  /**
   * Calculate average branching factor
   */
  private calculateBranchingFactor(nodes: any[], edges: any[]): number {
    const outDegrees = new Map<string, number>();
    
    edges.forEach(edge => {
      const source = String(edge.source);
      outDegrees.set(source, (outDegrees.get(source) || 0) + 1);
    });

    const branchingNodes = Array.from(outDegrees.values()).filter(degree => degree > 1);
    if (branchingNodes.length === 0) return 0;

    const totalBranches = branchingNodes.reduce((sum, degree) => sum + degree, 0);
    return Math.round((totalBranches / branchingNodes.length) * 100) / 100;
  }

  /**
   * Calculate coverage statistics
   */
  private calculateCoverageStatistics(
    nodes: any[],
    executionPaths: any[],
    branchCoverage: any,
    deadCode: any
  ): FlowStatistics['coverageStats'] {
    // Nodes covered by at least one execution path
    const coveredNodes = new Set<string>();
    executionPaths.forEach(path => {
      path.nodes.forEach((nodeId: any) => coveredNodes.add(String(nodeId)));
    });

    const totalCoveredNodes = coveredNodes.size;
    const uncoveredNodes = nodes.length - totalCoveredNodes;
    const overall = nodes.length > 0 ? (totalCoveredNodes / nodes.length) * 100 : 0;

    // Coverage by node type
    const byType = new Map<string, number>();
    const typeGroups = new Map<string, { total: number; covered: number }>();

    nodes.forEach(node => {
      const type = node.type || 'unknown';
      if (!typeGroups.has(type)) {
        typeGroups.set(type, { total: 0, covered: 0 });
      }
      
      const group = typeGroups.get(type)!;
      group.total++;
      if (coveredNodes.has(String(node.id))) {
        group.covered++;
      }
    });

    typeGroups.forEach((group, type) => {
      const coverage = group.total > 0 ? (group.covered / group.total) * 100 : 0;
      byType.set(type, Math.round(coverage));
    });

    return {
      overall: Math.round(overall),
      byType,
      uncoveredNodes
    };
  }

  /**
   * Calculate performance statistics
   */
  private calculatePerformanceStatistics(
    nodes: any[],
    edges: any[],
    executionPaths: any[]
  ): FlowStatistics['performanceStats'] {
    let totalExecutionTime = 0;
    let executionCount = 0;
    const bottlenecks: Array<{
      nodeId: string | number;
      executionTime: number;
      callCount: number;
    }> = [];

    nodes.forEach(node => {
      if (node.executionTime) {
        totalExecutionTime += node.executionTime;
        executionCount++;

        // Identify bottlenecks (nodes with high execution time)
        if (node.executionTime > 100 || (node.callCount && node.callCount > 1000)) {
          bottlenecks.push({
            nodeId: node.id,
            executionTime: node.executionTime,
            callCount: node.callCount || 0
          });
        }
      }
    });

    const averageExecutionTime = executionCount > 0
      ? totalExecutionTime / executionCount
      : 0;

    // Sort bottlenecks by impact (execution time * call count)
    bottlenecks.sort((a: any, b: any) => {
      const impactA = a.executionTime * (a.callCount || 1);
      const impactB = b.executionTime * (b.callCount || 1);
      return impactB - impactA;
    });

    return {
      averageExecutionTime: Math.round(averageExecutionTime * 100) / 100,
      totalExecutionTime,
      bottlenecks: bottlenecks.slice(0, 10) // Top 10 bottlenecks
    };
  }

  /**
   * Analyze flow patterns in execution paths
   */
  private analyzeFlowPatterns(
    executionPaths: any[],
    edges: any[]
  ): FlowStatistics['flowPatterns'] {
    let linearFlows = 0;
    let branchingFlows = 0;
    let cyclicFlows = 0;
    let deadEnds = 0;

    executionPaths.forEach(path => {
      if (path.isCyclic) {
        cyclicFlows++;
      } else if (path.conditions && path.conditions.length > 0) {
        branchingFlows++;
      } else if (!path.isComplete) {
        deadEnds++;
      } else {
        linearFlows++;
      }
    });

    return {
      linearFlows,
      branchingFlows,
      cyclicFlows,
      deadEnds
    };
  }

  /**
   * Calculate complexity distribution
   */
  private calculateComplexityDistribution(nodes: any[]): Map<string, number> {
    const distribution = new Map<string, number>();
    const ranges = [
      { label: 'Low (1-5)', min: 1, max: 5 },
      { label: 'Medium (6-10)', min: 6, max: 10 },
      { label: 'High (11-20)', min: 11, max: 20 },
      { label: 'Very High (>20)', min: 21, max: Infinity }
    ];

    ranges.forEach(range => distribution.set(range.label, 0));

    nodes.forEach(node => {
      if (node.complexity) {
        const range = ranges.find(r => node.complexity >= r.min && node.complexity <= r.max);
        if (range) {
          distribution.set(range.label, distribution.get(range.label)! + 1);
        }
      }
    });

    return distribution;
  }

  /**
   * Generate summary report
   */
  generateSummaryReport(stats: FlowStatistics): string {
    const lines: string[] = [
      '# Flow Statistics Summary',
      '',
      '## Overview',
      `- Total Nodes: ${stats.totalNodes}`,
      `- Total Edges: ${stats.totalEdges}`,
      `- Total Execution Paths: ${stats.totalPaths}`,
      `- Average Path Length: ${stats.averagePathLength}`,
      `- Cyclomatic Complexity: ${stats.cyclomaticComplexity}`,
      '',
      '## Coverage',
      `- Overall Coverage: ${stats.coverageStats.overall}%`,
      `- Uncovered Nodes: ${stats.coverageStats.uncoveredNodes}`,
      '',
      '## Flow Patterns',
      `- Linear Flows: ${stats.flowPatterns.linearFlows}`,
      `- Branching Flows: ${stats.flowPatterns.branchingFlows}`,
      `- Cyclic Flows: ${stats.flowPatterns.cyclicFlows}`,
      `- Dead Ends: ${stats.flowPatterns.deadEnds}`,
      ''
    ];

    if (stats.performanceStats) {
      lines.push('## Performance');
      lines.push(`- Average Execution Time: ${stats.performanceStats.averageExecutionTime}ms`);
      lines.push(`- Total Execution Time: ${stats.performanceStats.totalExecutionTime}ms`);
      if (stats.performanceStats && stats.performanceStats.bottlenecks && stats.performanceStats.bottlenecks.length > 0) {
        lines.push('- Top Bottlenecks:');
        stats.performanceStats.bottlenecks.slice(0, 3).forEach(bottleneck => {
          lines.push(`  - Node ${bottleneck.nodeId}: ${bottleneck.executionTime}ms (${bottleneck.callCount} calls)`);
        });
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Compare statistics between different analyses
   */
  compareStatistics(current: FlowStatistics, previous: FlowStatistics): {
    improvements: string[];
    regressions: string[];
    unchanged: string[];
  } {
    const improvements: string[] = [];
    const regressions: string[] = [];
    const unchanged: string[] = [];

    // Compare coverage
    const coverageDiff = current.coverageStats.overall - previous.coverageStats.overall;
    if (coverageDiff > 0) {
      improvements.push(`Coverage improved by ${coverageDiff.toFixed(1)}%`);
    } else if (coverageDiff < 0) {
      regressions.push(`Coverage decreased by ${Math.abs(coverageDiff).toFixed(1)}%`);
    } else {
      unchanged.push('Coverage remains the same');
    }

    // Compare complexity
    const complexityDiff = current.cyclomaticComplexity - previous.cyclomaticComplexity;
    if (complexityDiff < 0) {
      improvements.push(`Complexity reduced by ${Math.abs(complexityDiff)}`);
    } else if (complexityDiff > 0) {
      regressions.push(`Complexity increased by ${complexityDiff}`);
    }

    // Compare dead ends
    const deadEndDiff = current.flowPatterns.deadEnds - previous.flowPatterns.deadEnds;
    if (deadEndDiff < 0) {
      improvements.push(`Dead ends reduced by ${Math.abs(deadEndDiff)}`);
    } else if (deadEndDiff > 0) {
      regressions.push(`Dead ends increased by ${deadEndDiff}`);
    }

    return { improvements, regressions, unchanged };
  }
}