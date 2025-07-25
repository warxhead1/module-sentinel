/**
 * Navigation Tree Builder Module
 * 
 * Builds hierarchical navigation structures for control flow visualization
 * and interactive exploration of code paths.
 */

export interface NavigationNode {
  id: string;
  name: string;
  type: string;
  line: number;
  children: NavigationNode[];
  parent?: NavigationNode;
  metadata?: {
    symbolId?: number;
    functionName?: string;
    complexity?: number;
    callCount?: number;
  };
}

export interface NavigationContext {
  symbolId: number;
  symbolName: string;
  controlFlow: any;
  position?: {
    x: number;
    y: number;
    scale: number;
  };
  timestamp?: number;
}

export interface NavigationPath {
  nodes: NavigationNode[];
  edges: Array<{
    from: string;
    to: string;
    type: string;
  }>;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  icon?: string;
  type: 'root' | 'function' | 'block' | 'current';
  navigationContext?: NavigationContext;
}

export class NavigationTreeBuilder {
  private navigationStack: NavigationContext[] = [];
  private currentContext: NavigationContext | null = null;
  private maxStackSize: number = 50;

  /**
   * Build navigation tree from control flow nodes and edges
   */
  buildTree(nodes: any[], edges: any[]): NavigationNode {
    const nodeMap = new Map<string, NavigationNode>();
    
    // Create navigation nodes
    nodes.forEach(node => {
      nodeMap.set(node.id, {
        id: node.id,
        name: this.getNodeName(node),
        type: node.type,
        line: node.line,
        children: [],
        metadata: {
          complexity: node.complexity,
          callCount: node.metrics?.callCount
        }
      });
    });

    // Build parent-child relationships
    const childrenMap = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!childrenMap.has(edge.from)) {
        childrenMap.set(edge.from, []);
      }
      childrenMap.get(edge.from)!.push(edge.to);
    });

    // Connect nodes
    childrenMap.forEach((children, parentId) => {
      const parentNode = nodeMap.get(parentId);
      if (parentNode) {
        children.forEach(childId => {
          const childNode = nodeMap.get(childId);
          if (childNode) {
            parentNode.children.push(childNode);
            childNode.parent = parentNode;
          }
        });
      }
    });

    // Find root (entry node)
    const root = nodeMap.get('entry') || nodes[0];
    return root;
  }

  /**
   * Generate human-readable name for a node
   */
  private getNodeName(node: any): string {
    switch (node.type) {
      case 'entry':
        return 'Function Entry';
      case 'exit':
        return 'Function Exit';
      case 'condition':
      case 'conditional':
        return node.code || 'Conditional Branch';
      case 'loop':
        return node.code || 'Loop';
      case 'switch':
        return node.code || 'Switch Statement';
      case 'statement':
        return node.code || `Statement (L${node.line})`;
      default:
        return node.code || `Block (L${node.line})`;
    }
  }

  /**
   * Build breadcrumb trail for current navigation state
   */
  buildBreadcrumbs(): BreadcrumbItem[] {
    const breadcrumbs: BreadcrumbItem[] = [];

    // Add navigation stack items
    this.navigationStack.forEach((context, index) => {
      breadcrumbs.push({
        id: `nav-${index}`,
        label: context.symbolName,
        icon: '🔗',
        type: index === 0 ? 'root' : 'function',
        navigationContext: context
      });
    });

    // Add current context
    if (this.currentContext) {
      breadcrumbs.push({
        id: 'current',
        label: this.currentContext.symbolName,
        icon: '📍',
        type: 'current',
        navigationContext: this.currentContext
      });
    }

    return breadcrumbs;
  }

  /**
   * Navigate to a new function/symbol
   */
  navigateTo(context: NavigationContext): void {
    // Save current context to stack
    if (this.currentContext) {
      this.navigationStack.push(this.currentContext);
      
      // Limit stack size
      if (this.navigationStack.length > this.maxStackSize) {
        this.navigationStack.shift();
      }
    }

    // Set new current context
    this.currentContext = {
      ...context,
      timestamp: Date.now()
    };
  }

  /**
   * Navigate back to previous context
   */
  navigateBack(steps: number = 1): NavigationContext | null {
    if (this.navigationStack.length === 0) return null;

    // Pop contexts from stack
    let targetContext: NavigationContext | null = null;
    for (let i = 0; i < steps && this.navigationStack.length > 0; i++) {
      targetContext = this.navigationStack.pop()!;
    }

    if (targetContext) {
      this.currentContext = targetContext;
    }

    return targetContext;
  }

  /**
   * Navigate to specific index in navigation stack
   */
  navigateToIndex(index: number): NavigationContext | null {
    if (index < 0 || index >= this.navigationStack.length) return null;

    const targetContext = this.navigationStack[index];
    this.navigationStack = this.navigationStack.slice(0, index);
    this.currentContext = targetContext;

    return targetContext;
  }

  /**
   * Navigate to root (first item in stack)
   */
  navigateHome(): NavigationContext | null {
    if (this.navigationStack.length === 0) return null;

    const rootContext = this.navigationStack[0];
    this.navigationStack = [];
    this.currentContext = rootContext;

    return rootContext;
  }

  /**
   * Clear navigation state
   */
  clearNavigation(): void {
    this.navigationStack = [];
    this.currentContext = null;
  }

  /**
   * Get current navigation state
   */
  getNavigationState(): {
    stack: NavigationContext[];
    current: NavigationContext | null;
  } {
    return {
      stack: [...this.navigationStack],
      current: this.currentContext
    };
  }

  /**
   * Find all possible navigation targets from a node
   */
  findNavigationTargets(
    node: any,
    functionCalls: any[]
  ): Array<{
    name: string;
    symbolId?: number;
    type: 'function' | 'method' | 'class';
  }> {
    const targets: Array<{
      name: string;
      symbolId?: number;
      type: 'function' | 'method' | 'class';
    }> = [];

    // Find function calls from this node's line range
    const startLine = node.line;
    const endLine = node.endLine || node.line;

    functionCalls.forEach(call => {
      const callLine = call.from_line || call.line_number || call.line;
      if (callLine >= startLine && callLine <= endLine) {
        const targetName = call.to_symbol || call.target_function || call.functionName;
        if (targetName) {
          targets.push({
            name: targetName,
            symbolId: call.to_symbol_id,
            type: call.call_type || 'function'
          });
        }
      }
    });

    // Remove duplicates
    const uniqueTargets = targets.filter((target, index, self) =>
      index === self.findIndex(t => t.name === target.name)
    );

    return uniqueTargets;
  }

  /**
   * Build path from one node to another
   */
  findPath(
    fromId: string,
    toId: string,
    edges: any[]
  ): string[] | null {
    const adjacency: Record<string, string[]> = {};

    // Build adjacency list
    edges.forEach(edge => {
      if (!adjacency[edge.from]) adjacency[edge.from] = [];
      adjacency[edge.from].push(edge.to);
    });

    // BFS to find shortest path
    const queue: Array<{ node: string; path: string[] }> = [
      { node: fromId, path: [fromId] }
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === toId) return path;
      if (visited.has(node)) continue;

      visited.add(node);

      const neighbors = adjacency[node] || [];
      neighbors.forEach(neighbor => {
        queue.push({
          node: neighbor,
          path: [...path, neighbor]
        });
      });
    }

    return null;
  }

  /**
   * Get all paths from entry to exit nodes
   */
  findAllPaths(
    nodes: any[],
    edges: any[],
    maxPaths: number = 10
  ): NavigationPath[] {
    const paths: NavigationPath[] = [];
    const entryNode = nodes.find(n => n.type === 'entry');
    const exitNodes = nodes.filter(n => n.type === 'exit');

    if (!entryNode || exitNodes.length === 0) return paths;

    // Build adjacency list
    const adjacency: Record<string, string[]> = {};
    edges.forEach(edge => {
      if (!adjacency[edge.from]) adjacency[edge.from] = [];
      adjacency[edge.from].push(edge.to);
    });

    // DFS to find all paths
    const findPaths = (
      current: string,
      target: string,
      visited: Set<string>,
      path: string[]
    ): string[][] => {
      if (current === target) return [path];
      if (visited.has(current)) return [];

      visited.add(current);
      const allPaths: string[][] = [];

      const neighbors = adjacency[current] || [];
      for (const neighbor of neighbors) {
        const subPaths = findPaths(
          neighbor,
          target,
          new Set(visited),
          [...path, neighbor]
        );
        allPaths.push(...subPaths);

        if (allPaths.length >= maxPaths) break;
      }

      return allPaths;
    };

    // Find paths to each exit
    exitNodes.forEach(exitNode => {
      const pathsToExit = findPaths(
        entryNode.id,
        exitNode.id,
        new Set(),
        [entryNode.id]
      );

      pathsToExit.slice(0, maxPaths).forEach(pathNodes => {
        const pathEdges: Array<{ from: string; to: string; type: string }> = [];
        
        for (let i = 0; i < pathNodes.length - 1; i++) {
          const edge = edges.find(
            e => e.from === pathNodes[i] && e.to === pathNodes[i + 1]
          );
          if (edge) {
            pathEdges.push({
              from: edge.from,
              to: edge.to,
              type: edge.type
            });
          }
        }

        paths.push({
          nodes: pathNodes.map(id => nodes.find(n => n.id === id)!),
          edges: pathEdges
        });
      });
    });

    return paths.slice(0, maxPaths);
  }

  /**
   * Calculate path complexity
   */
  calculatePathComplexity(path: NavigationPath): number {
    let complexity = 0;

    path.nodes.forEach(node => {
      switch (node.type) {
        case 'condition':
        case 'conditional':
          complexity += 2;
          break;
        case 'loop':
          complexity += 3;
          break;
        case 'switch':
          complexity += 2;
          break;
        case 'exception':
          complexity += 2;
          break;
        default:
          complexity += 1;
      }
    });

    // Add complexity for edges
    path.edges.forEach(edge => {
      if (edge.type === 'exception') {
        complexity += 1;
      }
    });

    return complexity;
  }
}