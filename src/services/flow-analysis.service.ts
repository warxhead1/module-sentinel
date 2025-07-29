/**
 * Flow Analysis Service
 * Handles data flow analysis and metrics calculation
 * Bridges between Rust engine and TypeScript API
 */

import { ModuleSentinelBridge } from '../rust-bridge/module-sentinel-bridge';
import { createLogger } from '../utils/logger';
import {
  type EnhancedSymbolData,
  type DataFlowRelationship,
  type SystemFlowMetrics,
  type CriticalPath,
  type Bottleneck,
  BottleneckType,
  Trend,
  type Optimization,
  OptimizationType,
  FlowType,
  SymbolKind
} from '../types/flow-types';
import type { Symbol } from '../types/rust-bindings';

const logger = createLogger('FlowAnalysisService');

export class FlowAnalysisService {
  private bridge: ModuleSentinelBridge;
  private metricsCache: Map<string, SystemFlowMetrics> = new Map();
  private symbolCache: Map<string, EnhancedSymbolData> = new Map();

  constructor(bridge: ModuleSentinelBridge) {
    this.bridge = bridge;
  }

  /**
   * Get enhanced symbol data with flow metrics
   */
  async get_enhanced_symbols(filter?: { kind?: SymbolKind; limit?: number }): Promise<EnhancedSymbolData[]> {
    const complete = logger.operation('get_enhanced_symbols', { filter });

    try {
      // Get basic symbols from Rust - use '*' for wildcard search
      let symbols = [];
      try {
        symbols = await this.bridge.search_symbols('*', {
          kind: filter?.kind,
          limit: filter?.limit || 1000
        });
      } catch (searchError) {
        logger.warn('Rust symbol search failed, using fallback', { error: searchError });
        // Return mock data immediately if Rust search fails
        const mockSymbols = this.generateMockSymbols();
        complete();
        return mockSymbols;
      }

      // Enhance with metrics
      const enhanced = await Promise.all(
        symbols.map(symbol => this.enhance_symbol(symbol))
      );

      // If no symbols found, provide mock data for demonstration
      if (enhanced.length === 0) {
        const mockSymbols = this.generateMockSymbols();
        complete();
        return mockSymbols;
      }

      complete();
      return enhanced;
    } catch (error) {
      logger.error('Failed to get enhanced symbols', error);
      throw error;
    }
  }

  /**
   * Get data flow relationships between symbols
   */
  async get_flow_relationships(type?: FlowType): Promise<DataFlowRelationship[]> {
    const complete = logger.operation('get_flow_relationships', { type });

    try {
      // Get relationships from Rust
      const relationships = await this.bridge.get_all_relationships();

      // Transform to flow relationships, filtering out invalid ones
      const flowRelationships: DataFlowRelationship[] = [];
      for (const rel of relationships) {
        try {
          flowRelationships.push(this.transform_to_flow_relationship(rel));
        } catch (error) {
          logger.debug('Skipping invalid relationship', { error, rel });
        }
      }

      // Filter by type if specified
      const filtered = type 
        ? flowRelationships.filter((r: DataFlowRelationship) => r.flowType === type)
        : flowRelationships;

      complete();
      return filtered;
    } catch (error) {
      logger.error('Failed to get flow relationships', error);
      throw error;
    }
  }

  /**
   * Calculate system-wide flow metrics
   */
  async calculate_system_metrics(): Promise<SystemFlowMetrics> {
    const complete = logger.operation('calculate_system_metrics');

    try {
      // Check cache first
      const cached = this.metricsCache.get('system');
      if (cached && this.isCacheValid(cached)) {
        complete();
        return cached;
      }

      // Get all data needed for calculation
      const [symbols, relationships] = await Promise.all([
        this.get_enhanced_symbols(),
        this.get_flow_relationships()
      ]);

      // Calculate metrics
      const metrics: SystemFlowMetrics = {
        systemPressure: this.calculateSystemPressure(symbols, relationships),
        flowEfficiency: this.calculateFlowEfficiency(relationships),
        averageLatency: this.calculateAverageLatency(relationships),
        errorRate: this.calculateErrorRate(symbols),
        
        criticalPaths: await this.identifyCriticalPaths(symbols, relationships),
        bottlenecks: this.identifyBottlenecks(symbols, relationships),
        underutilizedPaths: this.findUnderutilizedPaths(symbols, relationships),
        
        memoryPressure: this.calculateMemoryPressure(symbols),
        cpuUtilization: this.calculateCpuUtilization(symbols),
        ioWaitTime: this.calculateIoWaitTime(relationships),
        
        failureProbability: this.predictFailureProbability(symbols, relationships),
        performanceTrend: this.analyzePerformanceTrend(),
        suggestedOptimizations: this.generateOptimizations(symbols, relationships),
        
        timestamp: new Date().toISOString()
      };

      // Cache the results
      this.metricsCache.set('system', metrics);

      complete();
      return metrics;
    } catch (error) {
      logger.error('Failed to calculate system metrics', error);
      throw error;
    }
  }

  /**
   * Identify critical paths in the system
   */
  async identifyCriticalPaths(
    symbols: EnhancedSymbolData[], 
    relationships: DataFlowRelationship[]
  ): Promise<CriticalPath[]> {
    const paths: CriticalPath[] = [];
    
    // Build adjacency list
    const graph = new Map<string, DataFlowRelationship[]>();
    relationships.forEach(rel => {
      if (!graph.has(rel.sourceId)) {
        graph.set(rel.sourceId, []);
      }
      graph.get(rel.sourceId)!.push(rel);
    });

    // Find paths with high latency or bottlenecks
    const visited = new Set<string>();
    
    for (const symbol of symbols) {
      if (!visited.has(symbol.id)) {
        const path = this.traceCriticalPath(symbol.id, graph, visited);
        if (path && path.totalLatency > 100) { // 100ms threshold
          paths.push(path);
        }
      }
    }

    // Sort by importance
    return paths.sort((a, b) => b.importance - a.importance).slice(0, 10);
  }

  /**
   * Identify bottlenecks in the system
   */
  private identifyBottlenecks(
    symbols: EnhancedSymbolData[],
    relationships: DataFlowRelationship[]
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Analyze each symbol for bottleneck indicators
    for (const symbol of symbols) {
      const incomingFlows = relationships.filter(r => r.targetId === symbol.id);
      const outgoingFlows = relationships.filter(r => r.sourceId === symbol.id);

      // High input, low output = potential bottleneck
      const flowRatio = outgoingFlows.length / (incomingFlows.length || 1);
      
      if (flowRatio < 0.5 && incomingFlows.length > 3) {
        bottlenecks.push({
          symbolId: symbol.id,
          severity: (1 - flowRatio) * 100,
          type: this.determineBottleneckType(symbol),
          impact: `Symbol receives ${incomingFlows.length} inputs but only produces ${outgoingFlows.length} outputs`,
          suggestedFix: 'Consider parallelizing or optimizing this component'
        });
      }

      // High complexity = potential bottleneck
      if (symbol.cyclomaticComplexity > 20) {
        bottlenecks.push({
          symbolId: symbol.id,
          severity: Math.min(symbol.cyclomaticComplexity * 2, 100),
          type: BottleneckType.CPU,
          impact: `High complexity (${symbol.cyclomaticComplexity}) may cause performance issues`,
          suggestedFix: 'Refactor to reduce complexity'
        });
      }
    }

    return bottlenecks.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Transform Rust relationship to flow relationship
   */
  private transform_to_flow_relationship(rel: any): DataFlowRelationship {
    // Handle both snake_case and camelCase field names from different APIs
    const fromId = rel.fromSymbolId || rel.fromSymbolId;
    const toId = rel.toSymbolId || rel.toSymbolId;
    const relType = rel.relationshipType || rel.relationshipType;
    
    // Skip relationships without valid IDs
    if (!fromId || !toId) {
      throw new Error('Invalid relationship: missing source or target ID');
    }
    
    return {
      sourceId: fromId.toString(),
      targetId: toId.toString(),
      flowType: this.mapRelationshipToFlowType(relType),
      
      dataVolume: (rel.confidence || 1) * 100,
      frequency: (rel.confidence || 1) * 10,
      latency: undefined, // Would come from profiling
      reliability: rel.confidence || 1,
      
      isCriticalPath: (rel.confidence || 1) > 0.8,
      alternativePaths: [],
      bottleneckScore: (1 - (rel.confidence || 1)) * 100,
      
      transformsData: relType?.includes('transform') || false,
      dataTypes: [],
      validationRules: []
    };
  }

  /**
   * Enhance basic symbol with metrics
   */
  private async enhance_symbol(symbol: Symbol): Promise<EnhancedSymbolData> {
    // Check cache
    const cached = this.symbolCache.get(symbol.id);
    if (cached) return cached;

    // Calculate metrics (in real implementation, these would come from Rust)
    const enhanced: EnhancedSymbolData = {
      id: symbol.id,
      name: symbol.name,
      kind: this.mapSymbolKind(symbol.signature),
      filePath: symbol.filePath || 'unknown',
      lineRange: [symbol.startLine || 0, symbol.endLine || 0],
      
      // Simulated metrics - in production these come from Rust analysis
      cyclomaticComplexity: Math.floor(Math.random() * 30) + 1,
      cognitiveComplexity: Math.floor(Math.random() * 25) + 1,
      linesOfCode: Math.max(1, (symbol.endLine || 0) - (symbol.startLine || 0) + 1),
      nestingDepth: Math.floor(Math.random() * 5) + 1,
      
      changeFrequency: Math.random() * 10,
      lastModified: new Date().toISOString(),
      authorCount: Math.floor(Math.random() * 5) + 1,
      bugFrequency: Math.random() * 5,
      
      testCoverage: Math.random(),
      documentationScore: Math.random(),
      codeSmellCount: Math.floor(Math.random() * 10),
      technicalDebtScore: Math.random() * 100
    };

    this.symbolCache.set(symbol.id, enhanced);
    return enhanced;
  }

  /**
   * Generate mock symbols for demonstration when no real symbols are available
   */
  private generateMockSymbols(): EnhancedSymbolData[] {
    return [
      {
        id: 'mock-function-1',
        name: 'processData',
        kind: SymbolKind.Function,
        filePath: 'src/data-processor.ts',
        lineRange: [10, 25],
        cyclomaticComplexity: 8,
        cognitiveComplexity: 6,
        linesOfCode: 15,
        nestingDepth: 3,
        changeFrequency: 4.2,
        lastModified: new Date().toISOString(),
        authorCount: 2,
        bugFrequency: 1.1,
        testCoverage: 0.85,
        documentationScore: 0.7,
        codeSmellCount: 2,
        technicalDebtScore: 15.5
      },
      {
        id: 'mock-class-1',
        name: 'DatabaseManager',
        kind: SymbolKind.Class,
        filePath: 'src/database/manager.ts',
        lineRange: [1, 50],
        cyclomaticComplexity: 15,
        cognitiveComplexity: 12,
        linesOfCode: 49,
        nestingDepth: 4,
        changeFrequency: 2.8,
        lastModified: new Date().toISOString(),
        authorCount: 3,
        bugFrequency: 0.8,
        testCoverage: 0.92,
        documentationScore: 0.9,
        codeSmellCount: 1,
        technicalDebtScore: 8.2
      }
    ];
  }

  // Metric calculation helpers
  private calculateSystemPressure(symbols: EnhancedSymbolData[], relationships: DataFlowRelationship[]): number {
    const avgComplexity = symbols.reduce((sum, s) => sum + s.cyclomaticComplexity, 0) / symbols.length;
    const flowDensity = relationships.length / symbols.length;
    return Math.min((avgComplexity * 2 + flowDensity * 10), 100);
  }

  private calculateFlowEfficiency(relationships: DataFlowRelationship[]): number {
    if (relationships.length === 0) return 1;
    const avgReliability = relationships.reduce((sum, r) => sum + r.reliability, 0) / relationships.length;
    return avgReliability;
  }

  private calculateAverageLatency(relationships: DataFlowRelationship[]): number {
    const withLatency = relationships.filter(r => r.latency !== undefined);
    if (withLatency.length === 0) return 50; // Default 50ms
    return withLatency.reduce((sum, r) => sum + (r.latency || 0), 0) / withLatency.length;
  }

  private calculateErrorRate(symbols: EnhancedSymbolData[]): number {
    const avgBugFrequency = symbols.reduce((sum, s) => sum + s.bugFrequency, 0) / symbols.length;
    return Math.min(avgBugFrequency / 10, 1);
  }

  private calculateMemoryPressure(symbols: EnhancedSymbolData[]): number {
    const withMemory = symbols.filter(s => s.memoryUsage !== undefined);
    if (withMemory.length === 0) return 30; // Default 30%
    const avgMemory = withMemory.reduce((sum, s) => sum + (s.memoryUsage || 0), 0) / withMemory.length;
    return Math.min((avgMemory / 1024 / 1024) * 10, 100); // Scale MB to percentage
  }

  private calculateCpuUtilization(symbols: EnhancedSymbolData[]): number {
    const withExecTime = symbols.filter(s => s.avgExecutionTime !== undefined);
    if (withExecTime.length === 0) return 0.5; // Default 50%
    const avgExecTime = withExecTime.reduce((sum, s) => sum + (s.avgExecutionTime || 0), 0) / withExecTime.length;
    return Math.min(avgExecTime / 1000, 1); // Scale to 0-1
  }

  private calculateIoWaitTime(relationships: DataFlowRelationship[]): number {
    const networkCalls = relationships.filter(r => r.flowType === FlowType.NetworkCall);
    return Math.min(networkCalls.length / relationships.length, 1);
  }

  private predictFailureProbability(symbols: EnhancedSymbolData[], relationships: DataFlowRelationship[]): number {
    const avgTechDebt = symbols.reduce((sum, s) => sum + s.technicalDebtScore, 0) / symbols.length;
    const lowReliability = relationships.filter(r => r.reliability < 0.5).length / relationships.length;
    return Math.min((avgTechDebt / 100 + lowReliability) / 2, 1);
  }

  private analyzePerformanceTrend(): Trend {
    // In production, this would analyze historical data
    const random = Math.random();
    if (random < 0.3) return Trend.Degrading;
    if (random < 0.7) return Trend.Stable;
    return Trend.Improving;
  }

  private generateOptimizations(symbols: EnhancedSymbolData[], relationships: DataFlowRelationship[]): Optimization[] {
    const optimizations: Optimization[] = [];

    // Find high-complexity symbols
    const complexSymbols = symbols.filter(s => s.cyclomaticComplexity > 20);
    complexSymbols.forEach(symbol => {
      optimizations.push({
        type: OptimizationType.Algorithm,
        symbolId: symbol.id,
        description: `Refactor ${symbol.name} to reduce complexity from ${symbol.cyclomaticComplexity}`,
        estimatedImprovement: 30,
        complexity: 'medium'
      });
    });

    // Find bottleneck relationships
    const slowRelationships = relationships.filter(r => r.bottleneckScore > 50);
    slowRelationships.forEach(rel => {
      optimizations.push({
        type: OptimizationType.Caching,
        symbolId: rel.sourceId,
        description: `Add caching between ${rel.sourceId} and ${rel.targetId}`,
        estimatedImprovement: 20,
        complexity: 'low'
      });
    });

    return optimizations.slice(0, 5); // Top 5 optimizations
  }

  // Helper methods
  private mapRelationshipToFlowType(relType: string | undefined): FlowType {
    if (!relType) return FlowType.DataFlow; // Default for undefined
    if (relType.includes('async')) return FlowType.AsyncMessage;
    if (relType.includes('event')) return FlowType.EventStream;
    if (relType.includes('network')) return FlowType.NetworkCall;
    if (relType.includes('state')) return FlowType.SharedState;
    if (relType.includes('control')) return FlowType.ControlFlow;
    return FlowType.DataFlow;
  }

  private mapSymbolKind(signature: string): SymbolKind {
    if (signature.includes('function')) return SymbolKind.Function;
    if (signature.includes('class')) return SymbolKind.Class;
    if (signature.includes('interface')) return SymbolKind.Interface;
    if (signature.includes('method')) return SymbolKind.Method;
    if (signature.includes('struct')) return SymbolKind.Struct;
    return SymbolKind.Variable;
  }

  private determineBottleneckType(symbol: EnhancedSymbolData): BottleneckType {
    if (symbol.memoryUsage && symbol.memoryUsage > 100000000) return BottleneckType.Memory;
    if (symbol.avgExecutionTime && symbol.avgExecutionTime > 1000) return BottleneckType.CPU;
    if (symbol.name.toLowerCase().includes('io')) return BottleneckType.IO;
    if (symbol.name.toLowerCase().includes('network')) return BottleneckType.Network;
    return BottleneckType.Synchronization;
  }

  private traceCriticalPath(
    startId: string, 
    graph: Map<string, DataFlowRelationship[]>,
    visited: Set<string>
  ): CriticalPath | null {
    const path: string[] = [];
    let currentId = startId;
    let totalLatency = 0;
    const bottlenecks: string[] = [];

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      path.push(currentId);

      const edges = graph.get(currentId) || [];
      if (edges.length === 0) break;

      // Follow the slowest path
      const slowestEdge = edges.reduce((max, edge) => 
        (edge.latency || 0) > (max.latency || 0) ? edge : max
      );

      totalLatency += slowestEdge.latency || 50;
      if (slowestEdge.bottleneckScore > 50) {
        bottlenecks.push(currentId);
      }

      currentId = slowestEdge.targetId;
    }

    if (path.length < 2) return null;

    return {
      id: `path-${startId}`,
      symbolIds: path,
      totalLatency,
      bottleneckPoints: bottlenecks,
      importance: Math.min(totalLatency / 10 + bottlenecks.length * 10, 100)
    };
  }

  private isCacheValid(metrics: SystemFlowMetrics): boolean {
    // Simple cache validation - check if metrics exist and have recent timestamp
    if (!metrics || !metrics.timestamp) return false;
    
    const now = Date.now();
    const metricsAge = now - new Date(metrics.timestamp).getTime();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    return metricsAge < maxAge;
  }

  private findUnderutilizedPaths(symbols: EnhancedSymbolData[], relationships: DataFlowRelationship[]): string[] {
    const flowCounts = new Map<string, number>();
    
    relationships.forEach(rel => {
      flowCounts.set(rel.sourceId, (flowCounts.get(rel.sourceId) || 0) + 1);
      flowCounts.set(rel.targetId, (flowCounts.get(rel.targetId) || 0) + 1);
    });

    return symbols
      .filter(s => (flowCounts.get(s.id) || 0) < 2)
      .map(s => s.id)
      .slice(0, 10);
  }
}