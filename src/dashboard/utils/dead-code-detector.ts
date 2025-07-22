/**
 * Dead Code Detector Module
 * 
 * Identifies unreachable and unused code sections, helping developers
 * clean up their codebase and improve maintainability.
 */

export interface DeadCodeAnalysis {
  deadNodes: string[];
  unreachablePaths: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
  unusedFunctions: Array<{
    id: string | number;
    name: string;
    file: string;
    line: number;
    lastModified?: Date;
    potentiallyDead: boolean;
  }>;
  deadCodeMetrics: {
    totalLines: number;
    deadLines: number;
    percentage: number;
  };
}

export interface DeadCodeDetectionOptions {
  nodes: any[];
  edges: any[];
  executionPaths: any[];
  entryPoints: (string | number)[];
  includeTests?: boolean;
  ageThreshold?: number; // Days since last modification
}

export class DeadCodeDetector {
  /**
   * Detect dead code in the analyzed codebase
   */
  async detectDeadCode(options: DeadCodeDetectionOptions): Promise<DeadCodeAnalysis> {
    const {
      nodes,
      edges,
      executionPaths,
      entryPoints,
      includeTests = false,
      ageThreshold = 90
    } = options;

    // Find reachable nodes from entry points
    const reachableNodes = this.findReachableNodes(nodes, edges, entryPoints);

    // Identify dead nodes (unreachable from any entry point)
    const deadNodes = nodes
      .filter(node => !reachableNodes.has(String(node.id)))
      .map(node => String(node.id));

    // Find unreachable paths
    const unreachablePaths = this.findUnreachablePaths(edges, reachableNodes);

    // Detect unused functions
    const unusedFunctions = this.detectUnusedFunctions(
      nodes,
      edges,
      reachableNodes,
      ageThreshold,
      includeTests
    );

    // Calculate metrics
    const deadCodeMetrics = this.calculateDeadCodeMetrics(nodes, deadNodes);

    return {
      deadNodes,
      unreachablePaths,
      unusedFunctions,
      deadCodeMetrics
    };
  }

  /**
   * Find all nodes reachable from entry points
   */
  private findReachableNodes(
    nodes: any[],
    edges: any[],
    entryPoints: (string | number)[]
  ): Set<string> {
    const reachable = new Set<string>();
    const queue = entryPoints.map(String);
    
    // Build adjacency list
    const adjacencyList = new Map<string, string[]>();
    edges.forEach(edge => {
      const source = String(edge.source);
      const target = String(edge.target);
      if (!adjacencyList.has(source)) {
        adjacencyList.set(source, []);
      }
      adjacencyList.get(source)!.push(target);
    });

    // BFS to find all reachable nodes
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;

      reachable.add(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      neighbors.forEach(neighbor => {
        if (!reachable.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }

    return reachable;
  }

  /**
   * Find unreachable paths in the code
   */
  private findUnreachablePaths(
    edges: any[],
    reachableNodes: Set<string>
  ): DeadCodeAnalysis['unreachablePaths'] {
    const unreachablePaths: DeadCodeAnalysis['unreachablePaths'] = [];

    edges.forEach(edge => {
      const source = String(edge.source);
      const target = String(edge.target);

      if (!reachableNodes.has(source) || !reachableNodes.has(target)) {
        let reason = 'Unknown';
        
        if (!reachableNodes.has(source)) {
          reason = 'Source node is unreachable';
        } else if (!reachableNodes.has(target)) {
          reason = 'Target node is unreachable';
        }

        // Check for specific patterns
        if (edge.condition && edge.condition.includes('false')) {
          reason = 'Condition is always false';
        } else if (edge.type === 'exception' && !edge.canThrow) {
          reason = 'Exception path but no exceptions can be thrown';
        }

        unreachablePaths.push({ from: source, to: target, reason });
      }
    });

    return unreachablePaths;
  }

  /**
   * Detect unused functions
   */
  private detectUnusedFunctions(
    nodes: any[],
    edges: any[],
    reachableNodes: Set<string>,
    ageThreshold: number,
    includeTests: boolean
  ): DeadCodeAnalysis['unusedFunctions'] {
    const unusedFunctions: DeadCodeAnalysis['unusedFunctions'] = [];

    // Find functions with no incoming edges
    const hasIncomingEdge = new Set<string>();
    edges.forEach(edge => {
      hasIncomingEdge.add(String(edge.target));
    });

    nodes
      .filter(node => node.type === 'function')
      .forEach(node => {
        const nodeId = String(node.id);
        const isUnreachable = !reachableNodes.has(nodeId);
        const hasNoCallers = !hasIncomingEdge.has(nodeId);
        
        // Skip test functions if not including tests
        if (!includeTests && (node.name.includes('test') || node.name.includes('Test'))) {
          return;
        }

        // Skip main/entry functions
        if (node.name === 'main' || node.name === 'Main' || node.isEntryPoint) {
          return;
        }

        if (isUnreachable || hasNoCallers) {
          unusedFunctions.push({
            id: node.id,
            name: node.name,
            file: node.file,
            line: node.line,
            lastModified: node.lastModified,
            potentiallyDead: isUnreachable && hasNoCallers
          });
        }
      });

    return unusedFunctions;
  }

  /**
   * Calculate dead code metrics
   */
  private calculateDeadCodeMetrics(
    nodes: any[],
    deadNodes: string[]
  ): DeadCodeAnalysis['deadCodeMetrics'] {
    let totalLines = 0;
    let deadLines = 0;

    nodes.forEach(node => {
      const nodeLines = (node.endLine || node.line) - node.line + 1;
      totalLines += nodeLines;

      if (deadNodes.includes(String(node.id))) {
        deadLines += nodeLines;
      }
    });

    const percentage = totalLines > 0 ? (deadLines / totalLines) * 100 : 0;

    return {
      totalLines,
      deadLines,
      percentage: Math.round(percentage * 10) / 10
    };
  }

  /**
   * Find candidate functions for removal
   */
  findRemovalCandidates(
    deadCodeAnalysis: DeadCodeAnalysis,
    safetyThreshold: number = 0.8
  ): DeadCodeAnalysis['unusedFunctions'] {
    return deadCodeAnalysis.unusedFunctions.filter(func => {
      // High confidence dead code
      if (func.potentiallyDead) {
        return true;
      }

      // Old unused code
      if (func.lastModified) {
        const daysSinceModified = 
          (Date.now() - func.lastModified.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceModified > 180) {
          return true;
        }
      }

      // Functions with specific patterns
      if (func.name.includes('deprecated') || 
          func.name.includes('Deprecated') ||
          func.name.includes('legacy') ||
          func.name.includes('Legacy')) {
        return true;
      }

      return false;
    });
  }

  /**
   * Generate dead code report
   */
  generateReport(analysis: DeadCodeAnalysis): string {
    const lines: string[] = [
      '# Dead Code Analysis Report',
      '',
      `Total Lines: ${analysis.deadCodeMetrics.totalLines}`,
      `Dead Lines: ${analysis.deadCodeMetrics.deadLines}`,
      `Dead Code Percentage: ${analysis.deadCodeMetrics.percentage}%`,
      '',
    ];

    if (analysis.unusedFunctions.length > 0) {
      lines.push('## Unused Functions');
      analysis.unusedFunctions.forEach(func => {
        lines.push(`- ${func.name} (${func.file}:${func.line})`);
        if (func.potentiallyDead) {
          lines.push('  ⚠️ Potentially dead - no callers and unreachable');
        }
      });
      lines.push('');
    }

    if (analysis.unreachablePaths.length > 0) {
      lines.push('## Unreachable Paths');
      analysis.unreachablePaths.forEach(path => {
        lines.push(`- ${path.from} → ${path.to}: ${path.reason}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Check if removing dead code is safe
   */
  isSafeToRemove(
    nodeId: string | number,
    analysis: DeadCodeAnalysis,
    codebaseContext: any
  ): { safe: boolean; reason?: string } {
    // Check if it's in dead nodes
    if (!analysis.deadNodes.includes(String(nodeId))) {
      return { safe: false, reason: 'Node is not identified as dead code' };
    }

    // Check for external references (exports, public API)
    if (codebaseContext.exports?.includes(nodeId)) {
      return { safe: false, reason: 'Node is exported/part of public API' };
    }

    // Check for reflection usage
    if (codebaseContext.reflectionTargets?.includes(nodeId)) {
      return { safe: false, reason: 'Node may be accessed via reflection' };
    }

    // Check for configuration references
    if (codebaseContext.configReferences?.includes(nodeId)) {
      return { safe: false, reason: 'Node is referenced in configuration' };
    }

    return { safe: true };
  }
}