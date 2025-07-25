/**
 * Control Flow Analysis Engine
 * 
 * A sophisticated engine for analyzing control flow, complexity, and data flow
 * in code across multiple languages. Provides deep insights into function
 * structure, execution paths, and architectural patterns.
 */

import { ComplexityAnalyzer, ComplexityMetrics } from './complexity-analyzer.js';
import { NavigationTreeBuilder, NavigationContext } from './navigation-tree-builder.js';
import { HotspotDetector, HotspotAnalysis } from './hotspot-detector.js';
import { DataFlowTracker, DataFlowAnalysis } from './data-flow-tracker.js';

export interface ControlFlowNode {
  id: string;
  type: 'entry' | 'exit' | 'statement' | 'condition' | 'loop' | 'return' | 'exception' | 'switch';
  line: number;
  endLine?: number;
  code: string;
  metrics?: {
    executionTime?: number;
    callCount?: number;
    memoryUsage?: number;
  };
  children?: string[];
}

export interface ControlFlowEdge {
  from: string;
  to: string;
  type: 'normal' | 'true' | 'false' | 'exception' | 'loop-back';
  probability?: number;
  label?: string;
}

export interface FunctionCall {
  from_line?: number;
  line_number?: number;
  lineNumber?: number;
  line?: number;
  to_symbol?: string;
  target_function?: string;
  functionName?: string;
  calleeName?: string;
  call_info?: {
    call_count: number;
  };
}

export interface ControlFlowBlock {
  id: number;
  block_type: string;
  start_line: number;
  end_line: number;
  condition?: string;
  parent_block_id?: number;
}

export interface SymbolInfo {
  id: number;
  name: string;
  qualified_name?: string;
  signature?: string | null;
  kind: string;
  file: string;
  line: number;
  call_info?: {
    call_count: number;
  };
}

export interface ControlFlowAnalysis {
  nodes: ControlFlowNode[];
  edges: ControlFlowEdge[];
  metrics: ComplexityMetrics;
  dataFlows: DataFlowAnalysis;
  hotspots: HotspotAnalysis;
  symbol: SymbolInfo;
  functionCalls: FunctionCall[];
  blocks: ControlFlowBlock[];
  callers: SymbolInfo[];
  callees: SymbolInfo[];
  deadCode: number[];
  hotPaths: string[][];
}

export interface AnalysisOptions {
  includeDataFlow?: boolean;
  maxDepth?: number;
  detectHotspots?: boolean;
  language?: 'cpp' | 'python' | 'typescript' | 'javascript' | 'java' | 'rust' | 'go';
  performanceMetrics?: boolean;
  callGraphDepth?: number;
}

export class ControlFlowEngine {
  private complexityAnalyzer: ComplexityAnalyzer;
  private navigationBuilder: NavigationTreeBuilder;
  private hotspotDetector: HotspotDetector;
  private dataFlowTracker: DataFlowTracker;

  constructor() {
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.navigationBuilder = new NavigationTreeBuilder();
    this.hotspotDetector = new HotspotDetector();
    this.dataFlowTracker = new DataFlowTracker();
  }

  /**
   * Analyze control flow for a given symbol/function
   */
  async analyzeSymbol(
    symbolData: any,
    options: AnalysisOptions = {}
  ): Promise<ControlFlowAnalysis> {
    const {
      includeDataFlow = true,
      detectHotspots = true,
      language = 'cpp'
    } = options;

    // Transform raw data into control flow structures
    const { nodes, edges } = this.buildControlFlowGraph(symbolData);

    // Calculate complexity metrics
    const metrics = this.complexityAnalyzer.analyze({
      nodes,
      edges,
      blocks: symbolData.blocks || [],
      symbol: symbolData.symbol
    });

    // Build navigation tree
    const navigationTree = this.navigationBuilder.buildTree(nodes, edges);

    // Detect hotspots and performance bottlenecks
    let hotspots: HotspotAnalysis = {
      hotPaths: [],
      bottlenecks: [],
      optimizationOpportunities: []
    };
    if (detectHotspots) {
      hotspots = this.hotspotDetector.analyze(nodes, edges, symbolData);
    }

    // Track data flow through the function
    let dataFlows: DataFlowAnalysis = { flows: [], variables: new Map() };
    if (includeDataFlow) {
      dataFlows = this.dataFlowTracker.analyze(nodes, edges, symbolData);
    }

    // Find dead code
    const deadCode = this.findDeadCode(nodes, edges);

    // Extract hot execution paths
    const hotPaths = this.findHotPaths(nodes, edges);

    return {
      nodes,
      edges,
      metrics,
      dataFlows,
      hotspots,
      symbol: symbolData.symbol,
      functionCalls: symbolData.edges || [],
      blocks: symbolData.blocks || [],
      callers: [],
      callees: [],
      deadCode,
      hotPaths
    };
  }

  /**
   * Build control flow graph from raw symbol data
   */
  private buildControlFlowGraph(data: any): { nodes: ControlFlowNode[], edges: ControlFlowEdge[] } {
    const nodes: ControlFlowNode[] = [];
    const edges: ControlFlowEdge[] = [];

    // Entry node
    nodes.push({
      id: 'entry',
      type: 'entry',
      line: data.entry_point || data.symbol.line,
      code: `${data.symbol.name}(${this.extractParameters(data.symbol.signature)})`
    });

    // Process blocks
    if (data.blocks && data.blocks.length > 0) {
      data.blocks.forEach((block: ControlFlowBlock) => {
        const nodeId = `block_${block.id}`;
        nodes.push({
          id: nodeId,
          type: this.mapBlockType(block.block_type),
          line: block.start_line,
          endLine: block.end_line,
          code: block.condition || `Lines ${block.start_line}-${block.end_line}`
        });

        // Add edges based on block relationships
        if (block.parent_block_id) {
          edges.push({
            from: `block_${block.parent_block_id}`,
            to: nodeId,
            type: 'normal'
          });
        } else {
          edges.push({
            from: 'entry',
            to: nodeId,
            type: 'normal'
          });
        }
      });
    } else {
      // Simple function body
      nodes.push({
        id: 'function_body',
        type: 'statement',
        line: data.entry_point || data.symbol.line,
        code: `Function body (${data.symbol.name})`
      });

      edges.push({
        from: 'entry',
        to: 'function_body',
        type: 'normal'
      });
    }

    // Exit nodes
    if (data.exit_points) {
      data.exit_points.forEach((exitLine: number, index: number) => {
        const exitId = `exit_${index}`;
        nodes.push({
          id: exitId,
          type: 'exit',
          line: exitLine,
          code: 'return'
        });

        // Connect to exit
        if (!data.blocks || data.blocks.length === 0) {
          edges.push({
            from: 'function_body',
            to: exitId,
            type: 'normal'
          });
        }
      });
    }

    // Add conditional edges
    this.addConditionalEdges(nodes, edges, data);

    return { nodes, edges };
  }

  /**
   * Add conditional edges for if/else, loops, etc.
   */
  private addConditionalEdges(
    nodes: ControlFlowNode[],
    edges: ControlFlowEdge[],
    data: any
  ): void {
    // Process conditional blocks
    nodes.forEach(node => {
      if (node.type === 'condition') {
        // Find true and false branches
        const trueEdge = edges.find(e => e.from === node.id && e.type === 'normal');
        if (trueEdge) {
          trueEdge.type = 'true';
          trueEdge.label = 'true';
        }

        // Add false branch if missing
        const falseTarget = this.findFalseBranchTarget(node, nodes, edges);
        if (falseTarget) {
          edges.push({
            from: node.id,
            to: falseTarget,
            type: 'false',
            label: 'false'
          });
        }
      } else if (node.type === 'loop') {
        // Add loop-back edge
        const loopBackTarget = this.findLoopBackTarget(node, nodes, edges);
        if (loopBackTarget) {
          edges.push({
            from: node.id,
            to: loopBackTarget,
            type: 'loop-back',
            label: 'continue'
          });
        }
      }
    });
  }

  /**
   * Find target for false branch of condition
   */
  private findFalseBranchTarget(
    conditionNode: ControlFlowNode,
    nodes: ControlFlowNode[],
    edges: ControlFlowEdge[]
  ): string | null {
    // Logic to find false branch target
    // This would be enhanced with actual AST analysis
    return null;
  }

  /**
   * Find loop-back target for loops
   */
  private findLoopBackTarget(
    loopNode: ControlFlowNode,
    nodes: ControlFlowNode[],
    edges: ControlFlowEdge[]
  ): string | null {
    // Logic to find loop-back target
    return loopNode.id; // Simplified: loop back to itself
  }

  /**
   * Map block types to node types
   */
  private mapBlockType(blockType: string): ControlFlowNode['type'] {
    const mapping: Record<string, ControlFlowNode['type']> = {
      'entry': 'entry',
      'exit': 'exit',
      'conditional': 'condition',
      'condition': 'condition',
      'loop': 'loop',
      'try': 'exception',
      'catch': 'exception',
      'return': 'return',
      'switch': 'switch'
    };
    return mapping[blockType] || 'statement';
  }

  /**
   * Extract function parameters from signature
   */
  private extractParameters(signature: string | null): string {
    if (!signature) return '';
    const match = signature.match(/\((.*?)\)/);
    return match ? match[1] : '';
  }

  /**
   * Find unreachable (dead) code
   */
  private findDeadCode(nodes: ControlFlowNode[], edges: ControlFlowEdge[]): number[] {
    const reachable = new Set<string>();
    const queue = ['entry'];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;

      reachable.add(nodeId);

      const outgoing = edges.filter(e => e.from === nodeId);
      outgoing.forEach(edge => {
        if (!reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      });
    }

    // Return line numbers of unreachable nodes
    return nodes
      .filter(n => !reachable.has(n.id))
      .map(n => n.line);
  }

  /**
   * Find hot execution paths
   */
  private findHotPaths(nodes: ControlFlowNode[], edges: ControlFlowEdge[]): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (nodeId: string, path: string[]) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      path.push(nodeId);

      if (node.type === 'exit') {
        paths.push([...path]);
      } else {
        const outgoing = edges.filter(e => e.from === nodeId);
        outgoing.forEach(edge => {
          dfs(edge.to, path);
        });
      }

      path.pop();
      visited.delete(nodeId);
    };

    dfs('entry', []);

    // Sort by length (shorter paths are often hotter)
    return paths.sort((a, b) => a.length - b.length).slice(0, 5);
  }

  /**
   * Get function calls from a specific line or block
   */
  getFunctionCallsFromLine(
    line: number,
    controlFlow: ControlFlowAnalysis,
    nodeData?: ControlFlowNode
  ): string[] {
    // For function_body nodes, return all function calls
    if (nodeData && nodeData.id === 'function_body') {
      return controlFlow.functionCalls
        .map(call => call.to_symbol || call.target_function || call.functionName || call.calleeName)
        .filter(Boolean) as string[];
    }

    // Find block range for the line
    let startLine = line;
    let endLine = line;

    if (nodeData && controlFlow.blocks) {
      const block = controlFlow.blocks.find(b => b.start_line === line);
      if (block) {
        startLine = block.start_line;
        endLine = block.end_line;
      }
    }

    // Find function calls within range
    return controlFlow.functionCalls
      .filter(call => {
        const callLine = call.from_line || call.line_number || call.lineNumber || call.line;
        return callLine !== undefined && callLine >= startLine && callLine <= endLine;
      })
      .map(call => call.to_symbol || call.target_function || call.functionName || call.calleeName)
      .filter(Boolean) as string[];
  }

  /**
   * Check if navigation is possible to a node
   */
  canNavigateToNode(node: ControlFlowNode, controlFlow: ControlFlowAnalysis): boolean {
    if (node.type === 'entry' || node.type === 'exit') {
      return false;
    }

    const functionCalls = this.getFunctionCallsFromLine(node.line, controlFlow, node);
    return functionCalls.length > 0;
  }

  /**
   * Build hierarchical structure for visualization
   */
  buildHierarchy(nodes: ControlFlowNode[], edges: ControlFlowEdge[]): any {
    // Build adjacency list with edge type information
    const children: Record<string, Array<{nodeId: string, edgeType: string}>> = {};
    edges.forEach(edge => {
      if (!children[edge.from]) children[edge.from] = [];
      children[edge.from].push({nodeId: edge.to, edgeType: edge.type});
    });

    // Track visited nodes to handle cycles
    const visited = new Set<string>();

    // Build tree structure starting from entry
    const buildTree = (nodeId: string, edgeTypeFromParent?: string): any => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node || visited.has(nodeId)) {
        return node ? { ...node, edgeTypeFromParent, children: [] } : null;
      }

      visited.add(nodeId);
      
      const nodeChildren = children[nodeId] || [];
      
      return {
        ...node,
        edgeTypeFromParent: edgeTypeFromParent || 'normal',
        children: nodeChildren
          .map(child => buildTree(child.nodeId, child.edgeType))
          .filter(Boolean)
      };
    };

    // Start from entry node
    const entryNode = nodes.find(n => n.type === 'entry');
    if (!entryNode) {
      console.warn('No entry node found, using first node');
      return nodes.length > 0 ? buildTree(nodes[0].id) : null;
    }

    return buildTree(entryNode.id);
  }
}