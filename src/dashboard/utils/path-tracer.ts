/**
 * Path Tracer Module
 * 
 * Traces execution paths through code, identifying all possible routes
 * from entry points to exits, including conditional branches and loops.
 */

export interface ExecutionPath {
  id: number;
  nodes: (string | number)[];
  conditions: string[];
  isComplete: boolean;
  isCyclic: boolean;
  coverage: number;
  executionCount?: number;
  averageTime?: number;
  totalTime?: number;
}

export interface PathTracingOptions {
  nodes: any[];
  edges: any[];
  entryPoint: string | number;
  maxDepth?: number;
  includeConditionals?: boolean;
  detectCycles?: boolean;
  maxPaths?: number;
}

export interface PathNode {
  id: string | number;
  visited: boolean;
  depth: number;
  conditions: string[];
}

export class PathTracer {
  private pathIdCounter = 0;

  /**
   * Trace all execution paths from an entry point
   */
  async tracePaths(options: PathTracingOptions): Promise<ExecutionPath[]> {
    const {
      nodes,
      edges,
      entryPoint,
      maxDepth = 10,
      includeConditionals = true,
      detectCycles = true,
      maxPaths = 100
    } = options;

    const paths: ExecutionPath[] = [];
    const visited = new Map<string | number, number>();

    // Build adjacency list
    const adjacencyList = this.buildAdjacencyList(edges);

    // DFS to find all paths
    this.dfs(
      entryPoint,
      [],
      [],
      visited,
      adjacencyList,
      nodes,
      edges,
      paths,
      maxDepth,
      includeConditionals,
      detectCycles,
      maxPaths
    );

    // Calculate coverage for each path
    paths.forEach(path => {
      path.coverage = this.calculatePathCoverage(path, nodes);
    });

    return paths;
  }

  /**
   * Depth-first search to find all paths
   */
  private dfs(
    nodeId: string | number,
    currentPath: (string | number)[],
    currentConditions: string[],
    visited: Map<string | number, number>,
    adjacencyList: Map<string | number, any[]>,
    nodes: any[],
    edges: any[],
    paths: ExecutionPath[],
    maxDepth: number,
    includeConditionals: boolean,
    detectCycles: boolean,
    maxPaths: number
  ): void {
    // Stop if we've found enough paths
    if (paths.length >= maxPaths) return;

    // Check for max depth
    if (currentPath.length >= maxDepth) {
      this.addPath(paths, currentPath, currentConditions, false, false);
      return;
    }

    // Check for cycles
    const visitCount = visited.get(nodeId) || 0;
    if (detectCycles && visitCount > 0) {
      this.addPath(paths, [...currentPath, nodeId], currentConditions, true, true);
      return;
    }

    // Mark as visited
    visited.set(nodeId, visitCount + 1);
    currentPath.push(nodeId);

    // Get outgoing edges
    const outgoingEdges = adjacencyList.get(nodeId) || [];

    // If no outgoing edges, this is a terminal node
    if (outgoingEdges.length === 0) {
      this.addPath(paths, [...currentPath], [...currentConditions], true, false);
    } else {
      // Explore each outgoing edge
      for (const edge of outgoingEdges) {
        const newConditions = [...currentConditions];
        
        // Add condition if this is a conditional edge
        if (includeConditionals && edge.condition) {
          newConditions.push(edge.condition);
        }

        this.dfs(
          edge.target,
          currentPath,
          newConditions,
          visited,
          adjacencyList,
          nodes,
          edges,
          paths,
          maxDepth,
          includeConditionals,
          detectCycles,
          maxPaths
        );
      }
    }

    // Backtrack
    currentPath.pop();
    visited.set(nodeId, visitCount);
  }

  /**
   * Add a path to the results
   */
  private addPath(
    paths: ExecutionPath[],
    nodes: (string | number)[],
    conditions: string[],
    isComplete: boolean,
    isCyclic: boolean
  ): void {
    paths.push({
      id: this.pathIdCounter++,
      nodes: [...nodes],
      conditions: [...conditions],
      isComplete,
      isCyclic,
      coverage: 0 // Will be calculated later
    });
  }

  /**
   * Build adjacency list from edges
   */
  private buildAdjacencyList(edges: any[]): Map<string | number, any[]> {
    const adjacencyList = new Map<string | number, any[]>();

    edges.forEach(edge => {
      if (!adjacencyList.has(edge.source)) {
        adjacencyList.set(edge.source, []);
      }
      adjacencyList.get(edge.source)!.push(edge);
    });

    return adjacencyList;
  }

  /**
   * Calculate coverage percentage for a path
   */
  private calculatePathCoverage(path: ExecutionPath, nodes: any[]): number {
    if (path.nodes.length === 0) return 0;

    let coveredNodes = 0;
    path.nodes.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node && node.coverage > 0) {
        coveredNodes++;
      }
    });

    return Math.round((coveredNodes / path.nodes.length) * 100);
  }

  /**
   * Find critical paths (paths that must be executed)
   */
  findCriticalPaths(paths: ExecutionPath[]): ExecutionPath[] {
    // Critical paths are complete, non-cyclic paths with high coverage
    return paths.filter(path => 
      path.isComplete && 
      !path.isCyclic && 
      path.coverage >= 80
    );
  }

  /**
   * Find redundant paths (similar execution patterns)
   */
  findRedundantPaths(paths: ExecutionPath[]): Map<number, number[]> {
    const redundantGroups = new Map<number, number[]>();
    
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const similarity = this.calculatePathSimilarity(paths[i], paths[j]);
        if (similarity > 0.8) {
          if (!redundantGroups.has(i)) {
            redundantGroups.set(i, [i]);
          }
          redundantGroups.get(i)!.push(j);
        }
      }
    }

    return redundantGroups;
  }

  /**
   * Calculate similarity between two paths
   */
  private calculatePathSimilarity(path1: ExecutionPath, path2: ExecutionPath): number {
    const set1 = new Set(path1.nodes.map(String));
    const set2 = new Set(path2.nodes.map(String));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Merge execution statistics into paths
   */
  mergeExecutionStatistics(
    paths: ExecutionPath[],
    executionData: Map<string | number, { count: number; time: number }>
  ): void {
    paths.forEach(path => {
      let totalCount = 0;
      let totalTime = 0;
      let nodeCount = 0;

      path.nodes.forEach(nodeId => {
        const stats = executionData.get(nodeId);
        if (stats) {
          totalCount += stats.count;
          totalTime += stats.time;
          nodeCount++;
        }
      });

      if (nodeCount > 0) {
        path.executionCount = Math.round(totalCount / nodeCount);
        path.totalTime = totalTime;
        path.averageTime = totalTime / nodeCount;
      }
    });
  }
}