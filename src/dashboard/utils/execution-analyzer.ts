/**
 * Execution Analysis Engine
 * 
 * A specialized engine for analyzing runtime execution behavior, code coverage,
 * and dead code detection. Focuses on dynamic aspects of code execution rather
 * than static structure analysis.
 */

import { PathTracer, ExecutionPath } from './path-tracer.js';
import { BranchCoverageCalculator, BranchCoverage } from './branch-coverage-calculator.js';
import { DeadCodeDetector, DeadCodeAnalysis } from './dead-code-detector.js';
import { FlowStatisticsGenerator, FlowStatistics } from './flow-statistics-generator.js';
import { CallGraphBuilder, CallGraph } from './call-graph-builder.js';

export interface ExecutionNode {
  id: string | number;
  name: string;
  type: 'function' | 'class' | 'file' | 'module';
  file: string;
  line: number;
  namespace?: string;
  callCount?: number;
  complexity?: number;
  isBranch?: boolean;
  isUnused?: boolean;
  executionTime?: number;
  coverage?: number;
}

export interface ExecutionEdge {
  source: string | number;
  target: string | number;
  type: 'calls' | 'inherits' | 'uses' | 'includes' | 'conditional';
  weight: number;
  condition?: string;
  isConditional?: boolean;
  executionCount?: number;
  averageTime?: number;
}

export interface ExecutionAnalysisOptions {
  maxDepth?: number;
  includeUnused?: boolean;
  calculateCoverage?: boolean;
  traceMode?: 'incoming' | 'outgoing' | 'both';
  performanceMetrics?: boolean;
  entryPoints?: (string | number)[];
  coverageThreshold?: number;
}

export interface ExecutionAnalysisResult {
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  executionPaths: ExecutionPath[];
  branchCoverage: BranchCoverage;
  deadCode: DeadCodeAnalysis;
  statistics: FlowStatistics;
  callGraph: CallGraph;
  unusedSymbols: ExecutionNode[];
  hotPaths: ExecutionPath[];
  coverageReport: {
    overall: number;
    byFile: Map<string, number>;
    byFunction: Map<string, number>;
  };
}

export class ExecutionAnalyzer {
  private pathTracer: PathTracer;
  private branchCalculator: BranchCoverageCalculator;
  private deadCodeDetector: DeadCodeDetector;
  private statisticsGenerator: FlowStatisticsGenerator;
  private callGraphBuilder: CallGraphBuilder;

  constructor() {
    this.pathTracer = new PathTracer();
    this.branchCalculator = new BranchCoverageCalculator();
    this.deadCodeDetector = new DeadCodeDetector();
    this.statisticsGenerator = new FlowStatisticsGenerator();
    this.callGraphBuilder = new CallGraphBuilder();
  }

  /**
   * Analyze execution behavior for a given entry point
   */
  async analyzeExecution(
    entryData: any,
    options: ExecutionAnalysisOptions = {}
  ): Promise<ExecutionAnalysisResult> {
    const {
      maxDepth = 3,
      includeUnused = true,
      calculateCoverage = true,
      traceMode = 'both',
      performanceMetrics = false,
      coverageThreshold = 80
    } = options;

    // Build execution graph from entry data
    const { nodes, edges } = this.buildExecutionGraph(entryData, traceMode);

    // Trace execution paths through the code
    const executionPaths = await this.pathTracer.tracePaths({
      nodes,
      edges,
      entryPoint: entryData.target?.id || entryData.id,
      maxDepth,
      includeConditionals: true
    });

    // Calculate branch coverage
    const branchCoverage = calculateCoverage
      ? await this.branchCalculator.calculateCoverage({
          nodes,
          edges,
          executionPaths,
          branches: entryData.branchAnalysis?.branches || []
        })
      : { total: 0, covered: 0, percentage: 0, uncoveredBranches: [], partiallyCovcredBranches: [], fullyCoveredBranches: [] };

    // Detect dead code
    const deadCode = includeUnused
      ? await this.deadCodeDetector.detectDeadCode({
          nodes,
          edges,
          executionPaths,
          entryPoints: options.entryPoints || [entryData.target?.id || entryData.id]
        })
      : { deadNodes: [], unreachablePaths: [], unusedFunctions: [], deadCodeMetrics: { totalLines: 0, deadLines: 0, percentage: 0 } };

    // Build call graph
    const callGraph = await this.callGraphBuilder.buildCallGraph({
      nodes,
      edges,
      maxDepth,
      direction: traceMode
    });

    // Generate flow statistics
    const statistics = await this.statisticsGenerator.generateStatistics({
      nodes,
      edges,
      executionPaths,
      branchCoverage,
      deadCode,
      performanceMetrics
    });

    // Find unused symbols
    const unusedSymbols = this.findUnusedSymbols(nodes, edges, deadCode);

    // Identify hot execution paths
    const hotPaths = this.identifyHotPaths(executionPaths, statistics);

    // Generate coverage report
    const coverageReport = this.generateCoverageReport(
      nodes,
      executionPaths,
      branchCoverage
    );

    return {
      nodes,
      edges,
      executionPaths,
      branchCoverage,
      deadCode,
      statistics,
      callGraph,
      unusedSymbols,
      hotPaths,
      coverageReport
    };
  }

  /**
   * Build execution graph from API response data
   */
  private buildExecutionGraph(
    data: any,
    traceMode: 'incoming' | 'outgoing' | 'both'
  ): { nodes: ExecutionNode[], edges: ExecutionEdge[] } {
    const nodes: ExecutionNode[] = [];
    const edges: ExecutionEdge[] = [];
    const nodeMap = new Map<number | string, ExecutionNode>();

    // Add target node
    if (data.target) {
      const targetNode: ExecutionNode = {
        id: data.target.id,
        name: data.target.name,
        type: data.target.kind as any,
        file: data.target.file_path,
        line: data.target.line_start,
        callCount: data.metrics?.incoming_calls || 0,
        complexity: data.metrics?.complexity,
        coverage: data.metrics?.coverage
      };
      nodes.push(targetNode);
      nodeMap.set(data.target.id, targetNode);
    }

    // Process callers (incoming)
    if ((traceMode === 'incoming' || traceMode === 'both') && data.callers) {
      data.callers.forEach((caller: any) => {
        if (!nodeMap.has(caller.id)) {
          const node: ExecutionNode = {
            id: caller.id,
            name: caller.name,
            type: caller.kind as any,
            file: caller.file_path,
            line: caller.line_start,
            callCount: caller.call_info?.call_count
          };
          nodes.push(node);
          nodeMap.set(caller.id, node);
        }

        edges.push({
          source: caller.id,
          target: data.target.id,
          type: caller.call_info?.call_type || 'calls',
          weight: caller.call_info?.call_count || 1,
          condition: caller.call_info?.condition,
          isConditional: caller.call_info?.is_conditional,
          executionCount: caller.call_info?.execution_count
        });
      });
    }

    // Process callees (outgoing)
    if ((traceMode === 'outgoing' || traceMode === 'both') && data.callees) {
      data.callees.forEach((callee: any) => {
        if (!nodeMap.has(callee.id)) {
          const node: ExecutionNode = {
            id: callee.id,
            name: callee.name,
            type: callee.kind as any,
            file: callee.file_path,
            line: callee.line_start,
            isBranch: callee.call_info?.is_conditional,
            callCount: callee.call_info?.call_count
          };
          nodes.push(node);
          nodeMap.set(callee.id, node);
        }

        edges.push({
          source: data.target.id,
          target: callee.id,
          type: callee.call_info?.call_type || 'calls',
          weight: callee.call_info?.call_count || 1,
          condition: callee.call_info?.condition,
          isConditional: callee.call_info?.is_conditional,
          executionCount: callee.call_info?.execution_count
        });
      });
    }

    return { nodes, edges };
  }

  /**
   * Find unused symbols based on dead code analysis
   */
  private findUnusedSymbols(
    nodes: ExecutionNode[],
    edges: ExecutionEdge[],
    deadCode: DeadCodeAnalysis
  ): ExecutionNode[] {
    const unusedNodeIds = new Set(deadCode.deadNodes);
    const referencedNodes = new Set<string | number>();

    // Mark all nodes that have incoming edges as referenced
    edges.forEach(edge => {
      referencedNodes.add(edge.target);
    });

    // Find nodes that are neither referenced nor reachable
    return nodes.filter(node => {
      const isUnused = unusedNodeIds.has(String(node.id)) || 
                      !referencedNodes.has(node.id);
      if (isUnused) {
        node.isUnused = true;
      }
      return isUnused;
    });
  }

  /**
   * Identify hot execution paths based on statistics
   */
  private identifyHotPaths(
    executionPaths: ExecutionPath[],
    statistics: FlowStatistics
  ): ExecutionPath[] {
    // Sort paths by execution frequency and coverage
    return executionPaths
      .filter(path => (path.executionCount || 0) > 0)
      .sort((a, b) => {
        const scoreA = ((a.executionCount || 0) as number) * (a.coverage || 0);
        const scoreB = ((b.executionCount || 0) as number) * (b.coverage || 0);
        return scoreB - scoreA;
      })
      .slice(0, 5); // Top 5 hot paths
  }

  /**
   * Generate comprehensive coverage report
   */
  private generateCoverageReport(
    nodes: ExecutionNode[],
    executionPaths: ExecutionPath[],
    branchCoverage: BranchCoverage
  ): ExecutionAnalysisResult['coverageReport'] {
    const byFile = new Map<string, number>();
    const byFunction = new Map<string, number>();

    // Calculate coverage by file
    const fileNodes = new Map<string, ExecutionNode[]>();
    nodes.forEach(node => {
      const file = node.file;
      if (!fileNodes.has(file)) {
        fileNodes.set(file, []);
      }
      fileNodes.get(file)!.push(node);
    });

    // Calculate coverage metrics
    fileNodes.forEach((fileNodeList, file) => {
      const coveredNodes = fileNodeList.filter(n => n.coverage && n.coverage > 0);
      const coverage = fileNodeList.length > 0
        ? (coveredNodes.length / fileNodeList.length) * 100
        : 0;
      byFile.set(file, coverage);
    });

    // Calculate coverage by function
    nodes
      .filter(n => n.type === 'function')
      .forEach(node => {
        byFunction.set(node.name, node.coverage || 0);
      });

    // Overall coverage
    const overall = branchCoverage.percentage || 0;

    return { overall, byFile, byFunction };
  }

  /**
   * Analyze a specific execution path in detail
   */
  async analyzePathDetails(
    pathId: number,
    executionData: ExecutionAnalysisResult
  ): Promise<{
    path: ExecutionPath;
    bottlenecks: ExecutionNode[];
    optimizationSuggestions: string[];
  }> {
    const path = executionData.executionPaths.find(p => p.id === pathId);
    if (!path) {
      throw new Error(`Path ${pathId} not found`);
    }

    // Find bottlenecks in the path
    const bottlenecks = this.findBottlenecks(path, executionData.nodes);

    // Generate optimization suggestions
    const optimizationSuggestions = this.generateOptimizationSuggestions(
      path,
      bottlenecks,
      executionData.statistics
    );

    return { path, bottlenecks, optimizationSuggestions };
  }

  /**
   * Find performance bottlenecks in an execution path
   */
  private findBottlenecks(
    path: ExecutionPath,
    nodes: ExecutionNode[]
  ): ExecutionNode[] {
    const pathNodes = path.nodes
      .map(nodeId => nodes.find(n => n.id === nodeId))
      .filter(Boolean) as ExecutionNode[];

    // Find nodes with high execution time or call count
    return pathNodes.filter(node => {
      const hasHighExecutionTime = node.executionTime && node.executionTime > 100;
      const hasHighCallCount = node.callCount && node.callCount > 1000;
      const hasHighComplexity = node.complexity && node.complexity > 10;
      
      return hasHighExecutionTime || hasHighCallCount || hasHighComplexity;
    });
  }

  /**
   * Generate optimization suggestions based on analysis
   */
  private generateOptimizationSuggestions(
    path: ExecutionPath,
    bottlenecks: ExecutionNode[],
    statistics: FlowStatistics
  ): string[] {
    const suggestions: string[] = [];

    // Check for cyclic paths
    if (path.isCyclic) {
      suggestions.push('Consider optimizing cyclic dependencies in this execution path');
    }

    // Check for low coverage
    if (path.coverage && path.coverage < 50) {
      suggestions.push('This path has low test coverage - consider adding tests');
    }

    // Check bottlenecks
    bottlenecks.forEach(node => {
      if (node.executionTime && node.executionTime > 100) {
        suggestions.push(`Function ${node.name} has high execution time (${node.executionTime}ms)`);
      }
      if (node.complexity && node.complexity > 10) {
        suggestions.push(`Function ${node.name} has high complexity (${node.complexity}) - consider refactoring`);
      }
    });

    return suggestions;
  }
}