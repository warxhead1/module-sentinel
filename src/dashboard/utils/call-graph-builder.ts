/**
 * Call Graph Builder Module
 * 
 * Constructs hierarchical call graphs showing function relationships,
 * call chains, and dependency structures in the codebase.
 */

export interface CallGraphNode {
  id: string | number;
  name: string;
  type: 'function' | 'class' | 'module' | 'file';
  file: string;
  line: number;
  depth: number;
  children: CallGraphNode[];
  metadata?: {
    callCount?: number;
    isRecursive?: boolean;
    isVirtual?: boolean;
    isAsync?: boolean;
    parameters?: string[];
    returnType?: string;
  };
}

export interface CallGraphEdge {
  from: string | number;
  to: string | number;
  type: 'direct' | 'indirect' | 'virtual' | 'callback' | 'async';
  callCount: number;
  metadata?: {
    condition?: string;
    isConditional?: boolean;
    callSites?: number[];
  };
}

export interface CallGraph {
  root: CallGraphNode;
  nodes: Map<string | number, CallGraphNode>;
  edges: CallGraphEdge[];
  layers: CallGraphNode[][];
  metrics: {
    maxDepth: number;
    totalNodes: number;
    totalEdges: number;
    recursiveCalls: number;
    crossFileCalls: number;
  };
}

export interface CallGraphOptions {
  nodes: any[];
  edges: any[];
  maxDepth?: number;
  direction?: 'incoming' | 'outgoing' | 'both';
  includeIndirect?: boolean;
  groupByFile?: boolean;
}

export class CallGraphBuilder {
  /**
   * Build a hierarchical call graph
   */
  async buildCallGraph(options: CallGraphOptions): Promise<CallGraph> {
    const {
      nodes,
      edges,
      maxDepth = 5,
      direction = 'outgoing',
      includeIndirect = true,
      groupByFile = false
    } = options;

    // Find root nodes (entry points)
    const rootNodes = this.findRootNodes(nodes, edges, direction);
    
    // Build graph from each root
    const graphNodes = new Map<string | number, CallGraphNode>();
    const processedEdges: CallGraphEdge[] = [];
    
    // Create virtual root if multiple entry points
    const root = rootNodes.length === 1 
      ? this.buildGraphFromNode(rootNodes[0], nodes, edges, direction, maxDepth, graphNodes, processedEdges)
      : this.createVirtualRoot(rootNodes, nodes, edges, direction, maxDepth, graphNodes, processedEdges);

    // Build layers for visualization
    const layers = this.buildLayers(root);

    // Calculate metrics
    const metrics = this.calculateMetrics(graphNodes, processedEdges, layers);

    // Group by file if requested
    if (groupByFile) {
      this.groupNodesByFile(root);
    }

    return {
      root,
      nodes: graphNodes,
      edges: processedEdges,
      layers,
      metrics
    };
  }

  /**
   * Find root nodes (entry points)
   */
  private findRootNodes(
    nodes: any[],
    edges: any[],
    direction: 'incoming' | 'outgoing' | 'both'
  ): any[] {
    if (direction === 'incoming') {
      // Nodes with no incoming edges
      const hasIncoming = new Set(edges.map(e => String(e.target)));
      return nodes.filter(n => !hasIncoming.has(String(n.id)));
    } else {
      // Nodes with no outgoing edges (for incoming) or main/entry functions
      const entryNodes = nodes.filter(n => 
        n.name === 'main' || 
        n.name === 'Main' ||
        n.isEntryPoint ||
        n.type === 'module'
      );
      
      if (entryNodes.length > 0) return entryNodes;
      
      // Fallback: nodes with the most outgoing edges
      const outgoingCounts = new Map<string, number>();
      edges.forEach(e => {
        const source = String(e.source);
        outgoingCounts.set(source, (outgoingCounts.get(source) || 0) + 1);
      });
      
      const sortedNodes = nodes.sort((a, b) => 
        (outgoingCounts.get(String(b.id)) || 0) - (outgoingCounts.get(String(a.id)) || 0)
      );
      
      return sortedNodes.slice(0, 1);
    }
  }

  /**
   * Build graph from a single node
   */
  private buildGraphFromNode(
    nodeData: any,
    allNodes: any[],
    allEdges: any[],
    direction: 'incoming' | 'outgoing' | 'both',
    maxDepth: number,
    graphNodes: Map<string | number, CallGraphNode>,
    processedEdges: CallGraphEdge[],
    currentDepth: number = 0,
    visited: Set<string> = new Set()
  ): CallGraphNode {
    const nodeId = String(nodeData.id);
    
    // Check if already processed
    if (graphNodes.has(nodeId)) {
      return graphNodes.get(nodeId)!;
    }

    // Check for cycles
    if (visited.has(nodeId)) {
      return {
        id: nodeData.id,
        name: nodeData.name + ' (recursive)',
        type: nodeData.type,
        file: nodeData.file,
        line: nodeData.line,
        depth: currentDepth,
        children: [],
        metadata: { isRecursive: true }
      };
    }

    visited.add(nodeId);

    // Create node
    const graphNode: CallGraphNode = {
      id: nodeData.id,
      name: nodeData.name,
      type: nodeData.type,
      file: nodeData.file,
      line: nodeData.line,
      depth: currentDepth,
      children: [],
      metadata: {
        callCount: nodeData.callCount,
        isAsync: nodeData.isAsync,
        parameters: nodeData.parameters,
        returnType: nodeData.returnType
      }
    };

    graphNodes.set(nodeId, graphNode);

    // Stop at max depth
    if (currentDepth >= maxDepth) {
      return graphNode;
    }

    // Find connected nodes
    const connectedEdges = this.findConnectedEdges(nodeData.id, allEdges, direction);
    
    connectedEdges.forEach(edge => {
      const targetId = direction === 'incoming' ? edge.source : edge.target;
      const targetNode = allNodes.find(n => n.id === targetId);
      
      if (targetNode) {
        const childNode = this.buildGraphFromNode(
          targetNode,
          allNodes,
          allEdges,
          direction,
          maxDepth,
          graphNodes,
          processedEdges,
          currentDepth + 1,
          new Set(visited)
        );
        
        graphNode.children.push(childNode);
        
        // Add edge
        processedEdges.push({
          from: edge.source,
          to: edge.target,
          type: this.determineEdgeType(edge),
          callCount: edge.weight || 1,
          metadata: {
            condition: edge.condition,
            isConditional: edge.isConditional
          }
        });
      }
    });

    visited.delete(nodeId);
    return graphNode;
  }

  /**
   * Create virtual root for multiple entry points
   */
  private createVirtualRoot(
    rootNodes: any[],
    allNodes: any[],
    allEdges: any[],
    direction: 'incoming' | 'outgoing' | 'both',
    maxDepth: number,
    graphNodes: Map<string | number, CallGraphNode>,
    processedEdges: CallGraphEdge[]
  ): CallGraphNode {
    const virtualRoot: CallGraphNode = {
      id: 'virtual_root',
      name: 'Entry Points',
      type: 'module',
      file: '',
      line: 0,
      depth: 0,
      children: []
    };

    rootNodes.forEach(rootNode => {
      const child = this.buildGraphFromNode(
        rootNode,
        allNodes,
        allEdges,
        direction,
        maxDepth,
        graphNodes,
        processedEdges,
        1
      );
      virtualRoot.children.push(child);
    });

    graphNodes.set('virtual_root', virtualRoot);
    return virtualRoot;
  }

  /**
   * Find edges connected to a node
   */
  private findConnectedEdges(
    nodeId: string | number,
    edges: any[],
    direction: 'incoming' | 'outgoing' | 'both'
  ): any[] {
    if (direction === 'incoming') {
      return edges.filter(e => e.target === nodeId);
    } else if (direction === 'outgoing') {
      return edges.filter(e => e.source === nodeId);
    } else {
      return edges.filter(e => e.source === nodeId || e.target === nodeId);
    }
  }

  /**
   * Determine edge type from edge data
   */
  private determineEdgeType(edge: any): CallGraphEdge['type'] {
    if (edge.type === 'virtual' || edge.isVirtual) return 'virtual';
    if (edge.type === 'callback' || edge.isCallback) return 'callback';
    if (edge.type === 'async' || edge.isAsync) return 'async';
    if (edge.isIndirect) return 'indirect';
    return 'direct';
  }

  /**
   * Build layers for hierarchical visualization
   */
  private buildLayers(root: CallGraphNode): CallGraphNode[][] {
    const layers: CallGraphNode[][] = [];
    const queue: { node: CallGraphNode; depth: number }[] = [{ node: root, depth: 0 }];
    
    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      
      if (!layers[depth]) {
        layers[depth] = [];
      }
      
      layers[depth].push(node);
      
      node.children.forEach(child => {
        queue.push({ node: child, depth: depth + 1 });
      });
    }
    
    return layers;
  }

  /**
   * Calculate call graph metrics
   */
  private calculateMetrics(
    nodes: Map<string | number, CallGraphNode>,
    edges: CallGraphEdge[],
    layers: CallGraphNode[][]
  ): CallGraph['metrics'] {
    let recursiveCalls = 0;
    let crossFileCalls = 0;
    
    // Count recursive calls
    nodes.forEach(node => {
      if (node.metadata?.isRecursive) {
        recursiveCalls++;
      }
    });
    
    // Count cross-file calls
    edges.forEach(edge => {
      const fromNode = nodes.get(edge.from);
      const toNode = nodes.get(edge.to);
      if (fromNode && toNode && fromNode.file !== toNode.file) {
        crossFileCalls++;
      }
    });
    
    return {
      maxDepth: layers.length,
      totalNodes: nodes.size,
      totalEdges: edges.length,
      recursiveCalls,
      crossFileCalls
    };
  }

  /**
   * Group nodes by file for cleaner visualization
   */
  private groupNodesByFile(root: CallGraphNode): void {
    const fileGroups = new Map<string, CallGraphNode[]>();
    
    // Collect nodes by file
    const collectByFile = (node: CallGraphNode) => {
      if (!fileGroups.has(node.file)) {
        fileGroups.set(node.file, []);
      }
      fileGroups.get(node.file)!.push(node);
      node.children.forEach(collectByFile);
    };
    
    collectByFile(root);
    
    // Create file group nodes
    // This is a simplified version - in practice, you'd restructure the tree
  }

  /**
   * Find call chains between two functions
   */
  findCallChains(
    fromId: string | number,
    toId: string | number,
    callGraph: CallGraph,
    maxChains: number = 10
  ): string[][] {
    const chains: string[][] = [];
    const visited = new Set<string>();
    
    const dfs = (currentId: string | number, path: string[]) => {
      if (chains.length >= maxChains) return;
      
      if (currentId === toId) {
        chains.push([...path, String(currentId)]);
        return;
      }
      
      if (visited.has(String(currentId))) return;
      visited.add(String(currentId));
      
      const node = callGraph.nodes.get(currentId);
      if (node) {
        path.push(String(currentId));
        node.children.forEach(child => {
          dfs(child.id, path);
        });
        path.pop();
      }
      
      visited.delete(String(currentId));
    };
    
    dfs(fromId, []);
    return chains;
  }

  /**
   * Calculate call graph complexity
   */
  calculateComplexity(callGraph: CallGraph): {
    fanIn: Map<string | number, number>;
    fanOut: Map<string | number, number>;
    coupling: number;
  } {
    const fanIn = new Map<string | number, number>();
    const fanOut = new Map<string | number, number>();
    
    // Calculate fan-in and fan-out
    callGraph.edges.forEach(edge => {
      fanOut.set(edge.from, (fanOut.get(edge.from) || 0) + 1);
      fanIn.set(edge.to, (fanIn.get(edge.to) || 0) + 1);
    });
    
    // Calculate coupling (average fan-in + fan-out)
    let totalConnections = 0;
    callGraph.nodes.forEach((node, id) => {
      totalConnections += (fanIn.get(id) || 0) + (fanOut.get(id) || 0);
    });
    
    const coupling = callGraph.nodes.size > 0
      ? totalConnections / callGraph.nodes.size
      : 0;
    
    return { fanIn, fanOut, coupling };
  }

  /**
   * Export call graph to various formats
   */
  exportCallGraph(callGraph: CallGraph, format: 'dot' | 'json' | 'mermaid'): string {
    switch (format) {
      case 'dot':
        return this.exportToDot(callGraph);
      case 'mermaid':
        return this.exportToMermaid(callGraph);
      case 'json':
      default:
        return JSON.stringify({
          root: callGraph.root,
          edges: callGraph.edges,
          metrics: callGraph.metrics
        }, null, 2);
    }
  }

  /**
   * Export to Graphviz DOT format
   */
  private exportToDot(callGraph: CallGraph): string {
    const lines = ['digraph CallGraph {'];
    
    // Add nodes
    callGraph.nodes.forEach((node, id) => {
      const label = `${node.name}\\n${node.file}:${node.line}`;
      lines.push(`  "${id}" [label="${label}"];`);
    });
    
    // Add edges
    callGraph.edges.forEach(edge => {
      const label = edge.metadata?.condition || '';
      lines.push(`  "${edge.from}" -> "${edge.to}" [label="${label}"];`);
    });
    
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Export to Mermaid format
   */
  private exportToMermaid(callGraph: CallGraph): string {
    const lines = ['graph TD'];
    
    // Add nodes
    callGraph.nodes.forEach((node, id) => {
      lines.push(`  ${id}["${node.name}"]`);
    });
    
    // Add edges
    callGraph.edges.forEach(edge => {
      lines.push(`  ${edge.from} --> ${edge.to}`);
    });
    
    return lines.join('\n');
  }
}