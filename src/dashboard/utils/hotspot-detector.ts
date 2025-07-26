/**
 * Hotspot Detector Module
 * 
 * Identifies performance bottlenecks, hot execution paths, and
 * optimization opportunities in control flow.
 */

export interface HotspotAnalysis {
  hotPaths: HotPath[];
  bottlenecks: Bottleneck[];
  optimizationOpportunities: OptimizationOpportunity[];
}

export interface HotPath {
  id: string;
  path: string[];
  executionProbability: number;
  estimatedTime: number;
  criticalNodes: string[];
  type: 'main' | 'alternative' | 'error' | 'early-exit';
}

export interface Bottleneck {
  nodeId: string;
  type: 'cpu' | 'memory' | 'io' | 'synchronization';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metrics: {
    executionTime?: number;
    callCount?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

export interface OptimizationOpportunity {
  type: 'cache' | 'parallel' | 'algorithm' | 'refactor' | 'inline' | 'lazy';
  nodeIds: string[];
  description: string;
  potentialImprovement: number; // Percentage
  difficulty: 'easy' | 'medium' | 'hard';
  recommendation: string;
}

export class HotspotDetector {
  /**
   * Analyze control flow for hotspots and bottlenecks
   */
  analyze(
    nodes: any[],
    edges: any[],
    symbolData: any
  ): HotspotAnalysis {
    const hotPaths = this.detectHotPaths(nodes, edges);
    const bottlenecks = this.detectBottlenecks(nodes, edges, symbolData);
    const optimizationOpportunities = this.findOptimizationOpportunities(
      nodes,
      edges,
      hotPaths,
      bottlenecks
    );

    return {
      hotPaths,
      bottlenecks,
      optimizationOpportunities
    };
  }

  /**
   * Detect hot execution paths
   */
  private detectHotPaths(nodes: any[], edges: any[]): HotPath[] {
    const paths: HotPath[] = [];
    const adjacency = this.buildAdjacencyList(edges);
    
    // Find all paths from entry to exits
    const entryNode = nodes.find(n => n.type === 'entry');
    const exitNodes = nodes.filter(n => n.type === 'exit');
    
    if (!entryNode) return paths;

    // Calculate edge probabilities
    const edgeProbabilities = this.calculateEdgeProbabilities(nodes, edges);

    // Find paths to each exit
    exitNodes.forEach((exitNode, index) => {
      const pathsToExit = this.findPathsToNode(
        entryNode.id,
        exitNode.id,
        adjacency,
        5 // Max paths per exit
      );

      pathsToExit.forEach((pathNodes, pathIndex) => {
        const probability = this.calculatePathProbability(
          pathNodes,
          edgeProbabilities
        );
        
        const criticalNodes = this.identifyCriticalNodes(pathNodes, nodes);
        const estimatedTime = this.estimatePathExecutionTime(pathNodes, nodes);
        
        // Determine path type
        let pathType: HotPath['type'] = 'alternative';
        if (pathIndex === 0) pathType = 'main';
        else if (this.isErrorPath(pathNodes, nodes)) pathType = 'error';
        else if (this.isEarlyExitPath(pathNodes, nodes)) pathType = 'early-exit';

        paths.push({
          id: `path_${index}_${pathIndex}`,
          path: pathNodes,
          executionProbability: probability,
          estimatedTime,
          criticalNodes,
          type: pathType
        });
      });
    });

    // Sort by execution probability
    return paths.sort((a, b) => b.executionProbability - a.executionProbability);
  }

  /**
   * Build adjacency list from edges
   */
  private buildAdjacencyList(edges: any[]): Record<string, string[]> {
    const adjacency: Record<string, string[]> = {};
    
    edges.forEach(edge => {
      if (!adjacency[edge.from]) adjacency[edge.from] = [];
      adjacency[edge.from].push(edge.to);
    });

    return adjacency;
  }

  /**
   * Find paths between two nodes
   */
  private findPathsToNode(
    startId: string,
    endId: string,
    adjacency: Record<string, string[]>,
    maxPaths: number
  ): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (current: string, path: string[]) => {
      if (paths.length >= maxPaths) return;
      if (current === endId) {
        paths.push([...path]);
        return;
      }
      if (visited.has(current)) return;

      visited.add(current);
      const neighbors = adjacency[current] || [];
      
      neighbors.forEach(neighbor => {
        dfs(neighbor, [...path, neighbor]);
      });

      visited.delete(current);
    };

    dfs(startId, [startId]);
    return paths;
  }

  /**
   * Calculate edge execution probabilities
   */
  private calculateEdgeProbabilities(
    nodes: any[],
    edges: any[]
  ): Map<string, number> {
    const probabilities = new Map<string, number>();

    edges.forEach(edge => {
      const edgeKey = `${edge.from}->${edge.to}`;
      
      // Base probability
      let probability = 1.0;

      // Adjust based on edge type
      switch (edge.type) {
        case 'true':
          probability = 0.7; // Assume true branches are more likely
          break;
        case 'false':
          probability = 0.3;
          break;
        case 'exception':
          probability = 0.05; // Exceptions are rare
          break;
        case 'loop-back':
          probability = 0.8; // Loops typically iterate multiple times
          break;
      }

      // Adjust based on source node type
      const sourceNode = nodes.find(n => n.id === edge.from);
      if (sourceNode) {
        if (sourceNode.type === 'loop') {
          // Loop exit edges are less likely than continue
          if (edge.type !== 'loop-back') {
            probability *= 0.2;
          }
        }
      }

      probabilities.set(edgeKey, probability);
    });

    return probabilities;
  }

  /**
   * Calculate path execution probability
   */
  private calculatePathProbability(
    path: string[],
    edgeProbabilities: Map<string, number>
  ): number {
    let probability = 1.0;

    for (let i = 0; i < path.length - 1; i++) {
      const edgeKey = `${path[i]}->${path[i + 1]}`;
      const edgeProb = edgeProbabilities.get(edgeKey) || 0.5;
      probability *= edgeProb;
    }

    return Math.round(probability * 1000) / 1000;
  }

  /**
   * Identify critical nodes in a path
   */
  private identifyCriticalNodes(path: string[], nodes: any[]): string[] {
    const critical: string[] = [];

    path.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Critical node criteria
      if (
        node.type === 'loop' ||
        node.type === 'condition' ||
        (node.metrics && node.metrics.executionTime > 100) ||
        (node.metrics && node.metrics.memoryUsage > 1000000)
      ) {
        critical.push(nodeId);
      }
    });

    return critical;
  }

  /**
   * Estimate path execution time
   */
  private estimatePathExecutionTime(path: string[], nodes: any[]): number {
    let totalTime = 0;

    path.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Use actual metrics if available
      if (node.metrics && node.metrics.executionTime) {
        totalTime += node.metrics.executionTime;
      } else {
        // Estimate based on node type
        switch (node.type) {
          case 'loop':
            totalTime += 50; // Loops are expensive
            break;
          case 'condition':
            totalTime += 5;
            break;
          case 'statement':
            totalTime += 1;
            break;
          default:
            totalTime += 2;
        }
      }
    });

    return totalTime;
  }

  /**
   * Check if path is an error handling path
   */
  private isErrorPath(path: string[], nodes: any[]): boolean {
    return path.some(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return node && (node.type === 'exception' || node.code?.includes('throw'));
    });
  }

  /**
   * Check if path is an early exit
   */
  private isEarlyExitPath(path: string[], nodes: any[]): boolean {
    if (path.length < 3) return false;
    
    const exitNode = nodes.find(n => n.id === path[path.length - 1]);
    return exitNode?.type === 'exit' && path.length < 5;
  }

  /**
   * Detect performance bottlenecks
   */
  private detectBottlenecks(
    nodes: any[],
    edges: any[],
    symbolData: any
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    nodes.forEach(node => {
      // Check for loop bottlenecks
      if (node.type === 'loop') {
        const loopComplexity = this.analyzeLoopComplexity(node, nodes, edges);
        if (loopComplexity.isBottleneck) {
          bottlenecks.push({
            nodeId: node.id,
            type: 'cpu',
            severity: loopComplexity.severity,
            description: `Potentially expensive loop at line ${node.line}`,
            metrics: {
              executionTime: loopComplexity.estimatedTime,
              callCount: loopComplexity.estimatedIterations
            }
          });
        }
      }

      // Check for I/O operations
      if (this.detectIOOperation(node)) {
        bottlenecks.push({
          nodeId: node.id,
          type: 'io',
          severity: 'medium',
          description: `I/O operation detected at line ${node.line}`,
          metrics: {}
        });
      }

      // Check for synchronization
      if (this.detectSynchronization(node)) {
        bottlenecks.push({
          nodeId: node.id,
          type: 'synchronization',
          severity: 'high',
          description: `Synchronization point at line ${node.line}`,
          metrics: {}
        });
      }

      // Check for memory intensive operations
      if (this.detectMemoryIntensive(node)) {
        bottlenecks.push({
          nodeId: node.id,
          type: 'memory',
          severity: 'medium',
          description: `Memory intensive operation at line ${node.line}`,
          metrics: {
            memoryUsage: 1000000 // Estimated
          }
        });
      }
    });

    return bottlenecks;
  }

  /**
   * Analyze loop complexity
   */
  private analyzeLoopComplexity(
    loopNode: any,
    nodes: any[],
    edges: any[]
  ): {
    isBottleneck: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    estimatedIterations: number;
    estimatedTime: number;
  } {
    // Count nodes inside loop
    const loopBodySize = this.countLoopBodyNodes(loopNode, nodes, edges);
    
    // Estimate iterations (heuristic)
    let estimatedIterations = 10; // Default
    if (loopNode.code) {
      if (loopNode.code.includes('size()') || loopNode.code.includes('length')) {
        estimatedIterations = 100; // Collection iteration
      } else if (loopNode.code.includes('while')) {
        estimatedIterations = 50; // Unknown condition
      }
    }

    // Check for nested loops
    const hasNestedLoops = this.hasNestedLoops(loopNode, nodes, edges);
    if (hasNestedLoops) {
      estimatedIterations *= 10; // Quadratic or worse
    }

    const estimatedTime = loopBodySize * estimatedIterations;
    
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (estimatedTime > 10000) severity = 'critical';
    else if (estimatedTime > 1000) severity = 'high';
    else if (estimatedTime > 100) severity = 'medium';

    return {
      isBottleneck: severity !== 'low',
      severity,
      estimatedIterations,
      estimatedTime
    };
  }

  /**
   * Count nodes inside a loop body
   */
  private countLoopBodyNodes(
    loopNode: any,
    nodes: any[],
    edges: any[]
  ): number {
    // Simplified: count nodes within line range
    const loopStart = loopNode.line;
    const loopEnd = loopNode.endLine || loopNode.line + 10;
    
    return nodes.filter(n => 
      n.line >= loopStart && n.line <= loopEnd && n.id !== loopNode.id
    ).length;
  }

  /**
   * Check for nested loops
   */
  private hasNestedLoops(
    loopNode: any,
    nodes: any[],
    edges: any[]
  ): boolean {
    const loopStart = loopNode.line;
    const loopEnd = loopNode.endLine || loopNode.line + 10;
    
    return nodes.some(n => 
      n.type === 'loop' &&
      n.id !== loopNode.id &&
      n.line > loopStart &&
      n.line < loopEnd
    );
  }

  /**
   * Detect I/O operations
   */
  private detectIOOperation(node: any): boolean {
    if (!node.code) return false;
    
    const ioPatterns = [
      'read', 'write', 'open', 'close',
      'cout', 'cin', 'printf', 'scanf',
      'fstream', 'ifstream', 'ofstream',
      'socket', 'recv', 'send',
      'database', 'query', 'fetch'
    ];

    return ioPatterns.some(pattern => 
      node.code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Detect synchronization primitives
   */
  private detectSynchronization(node: any): boolean {
    if (!node.code) return false;
    
    const syncPatterns = [
      'mutex', 'lock', 'unlock', 'lock_guard',
      'condition_variable', 'wait', 'notify',
      'atomic', 'thread', 'async', 'future',
      'semaphore', 'barrier', 'synchronized'
    ];

    return syncPatterns.some(pattern => 
      node.code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Detect memory intensive operations
   */
  private detectMemoryIntensive(node: any): boolean {
    if (!node.code) return false;
    
    const memoryPatterns = [
      'new', 'malloc', 'calloc', 'realloc',
      'vector', 'push_back', 'resize',
      'map', 'unordered_map', 'set',
      'string', 'substr', 'append',
      'copy', 'clone', 'duplicate'
    ];

    return memoryPatterns.some(pattern => 
      node.code.toLowerCase().includes(pattern)
    );
  }

  /**
   * Find optimization opportunities
   */
  private findOptimizationOpportunities(
    nodes: any[],
    edges: any[],
    hotPaths: HotPath[],
    bottlenecks: Bottleneck[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Check for caching opportunities
    this.findCachingOpportunities(nodes, hotPaths).forEach(opp => 
      opportunities.push(opp)
    );

    // Check for parallelization opportunities
    this.findParallelizationOpportunities(nodes, edges).forEach(opp =>
      opportunities.push(opp)
    );

    // Check for algorithm improvements
    this.findAlgorithmImprovements(nodes, bottlenecks).forEach(opp =>
      opportunities.push(opp)
    );

    // Check for refactoring opportunities
    this.findRefactoringOpportunities(nodes, edges).forEach(opp =>
      opportunities.push(opp)
    );

    return opportunities;
  }

  /**
   * Find caching opportunities
   */
  private findCachingOpportunities(
    nodes: any[],
    hotPaths: HotPath[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Look for repeated computations in hot paths
    hotPaths.forEach(hotPath => {
      const pathNodes = nodes.filter(n => hotPath.path.includes(n.id));
      
      pathNodes.forEach(node => {
        if (
          node.code &&
          (node.code.includes('calculate') ||
           node.code.includes('compute') ||
           node.code.includes('get'))
        ) {
          opportunities.push({
            type: 'cache',
            nodeIds: [node.id],
            description: `Consider caching result of ${node.code}`,
            potentialImprovement: 30,
            difficulty: 'easy',
            recommendation: 'Add memoization or result caching'
          });
        }
      });
    });

    return opportunities;
  }

  /**
   * Find parallelization opportunities
   */
  private findParallelizationOpportunities(
    nodes: any[],
    edges: any[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Look for independent loops
    nodes.filter(n => n.type === 'loop').forEach(loopNode => {
      if (this.isParallelizable(loopNode, nodes, edges)) {
        opportunities.push({
          type: 'parallel',
          nodeIds: [loopNode.id],
          description: `Loop at line ${loopNode.line} can be parallelized`,
          potentialImprovement: 50,
          difficulty: 'medium',
          recommendation: 'Use parallel algorithms or threading'
        });
      }
    });

    return opportunities;
  }

  /**
   * Check if loop can be parallelized
   */
  private isParallelizable(
    loopNode: any,
    nodes: any[],
    edges: any[]
  ): boolean {
    // Simple heuristic: check for data dependencies
    if (!loopNode.code) return false;
    
    const noDependencies = !loopNode.code.includes('previous') &&
                          !loopNode.code.includes('last') &&
                          !loopNode.code.includes('accumulate');
    
    return noDependencies;
  }

  /**
   * Find algorithm improvement opportunities
   */
  private findAlgorithmImprovements(
    nodes: any[],
    bottlenecks: Bottleneck[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    bottlenecks.forEach(bottleneck => {
      const node = nodes.find(n => n.id === bottleneck.nodeId);
      if (!node) return;

      // Check for inefficient algorithms
      if (node.code) {
        if (node.code.includes('bubble') || node.code.includes('O(n^2)')) {
          opportunities.push({
            type: 'algorithm',
            nodeIds: [node.id],
            description: 'Inefficient algorithm detected',
            potentialImprovement: 70,
            difficulty: 'medium',
            recommendation: 'Consider using more efficient sorting/searching algorithms'
          });
        }

        if (node.code.includes('find') && node.code.includes('vector')) {
          opportunities.push({
            type: 'algorithm',
            nodeIds: [node.id],
            description: 'Linear search in vector',
            potentialImprovement: 40,
            difficulty: 'easy',
            recommendation: 'Consider using std::set or std::unordered_set for faster lookups'
          });
        }
      }
    });

    return opportunities;
  }

  /**
   * Find refactoring opportunities
   */
  private findRefactoringOpportunities(
    nodes: any[],
    edges: any[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Look for complex functions
    if (nodes.length > 50) {
      opportunities.push({
        type: 'refactor',
        nodeIds: nodes.map(n => n.id),
        description: 'Function is too complex',
        potentialImprovement: 20,
        difficulty: 'hard',
        recommendation: 'Break down into smaller, focused functions'
      });
    }

    // Look for deep nesting
    const deeplyNested = nodes.filter(n => {
      const depth = this.calculateNodeDepth(n, nodes, edges);
      return depth > 4;
    });

    if (deeplyNested.length > 0) {
      opportunities.push({
        type: 'refactor',
        nodeIds: deeplyNested.map(n => n.id),
        description: 'Deep nesting detected',
        potentialImprovement: 15,
        difficulty: 'medium',
        recommendation: 'Use early returns or extract nested logic'
      });
    }

    return opportunities;
  }

  /**
   * Calculate node nesting depth
   */
  private calculateNodeDepth(
    node: any,
    nodes: any[],
    edges: any[]
  ): number {
    // Simplified: use line indentation as proxy for depth
    // In real implementation, would traverse the control flow graph
    return 0;
  }
}