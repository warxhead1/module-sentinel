import type Database from 'better-sqlite3';
import type { Symbol, Relationship } from '../../shared/types/api';

export interface DataFlowNode {
  symbolId: number;
  symbolName: string;
  dataType?: string;
  mutations: DataMutation[];
  inputs: DataFlowEdge[];
  outputs: DataFlowEdge[];
}

export interface DataFlowEdge {
  from: number;
  to: number;
  dataType?: string;
  transformations: string[];
  confidence: number;
}

export interface DataMutation {
  location: string;
  type: 'assignment' | 'modification' | 'deletion';
  description: string;
}

export interface ImpactAnalysis {
  directImpact: ImpactNode[];
  indirectImpact: ImpactNode[];
  rippleEffect: RippleWave[];
  severityScore: number;
}

export interface ImpactNode {
  symbolId: number;
  symbolName: string;
  impactType: 'breaking' | 'modification' | 'enhancement';
  distance: number; // How many hops from source
  confidence: number;
}

export interface RippleWave {
  distance: number;
  nodes: ImpactNode[];
  timestamp: number; // For animation
}

export interface PatternAnalysis {
  patternType: string;
  confidence: number;
  nodes: number[];
  description: string;
  recommendation?: string;
}

export interface ExecutionTrace {
  entryPoint: number;
  paths: ExecutionPath[];
  hotspots: HotSpot[];
  bottlenecks: Bottleneck[];
}

export interface ExecutionPath {
  nodes: number[];
  frequency: number;
  averageTime?: number;
  dataFlow: DataFlowEdge[];
}

export interface HotSpot {
  symbolId: number;
  callCount: number;
  totalTime?: number;
  callers: number[];
}

export interface Bottleneck {
  symbolId: number;
  waitTime?: number;
  blockingCalls: number[];
  severity: 'low' | 'medium' | 'high';
}

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  dataFlowComplexity: number;
  architecturalComplexity: number;
  totalScore: number;
  breakdown: {
    metric: string;
    value: number;
    description: string;
  }[];
}

export class AnalyticsService {
  constructor(private db: Database.Database) {}

  /**
   * Analyze data flow through a symbol
   */
  async analyzeDataFlow(symbolId: string): Promise<DataFlowNode> {
    // Get symbol details
    const symbol = this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    // Get all relationships involving this symbol
    const incomingRels = this.getIncomingRelationships(parseInt(symbolId));
    const outgoingRels = this.getOutgoingRelationships(parseInt(symbolId));

    // Build data flow node
    const node: DataFlowNode = {
      symbolId: symbol.id,
      symbolName: symbol.name,
      dataType: this.inferDataType(symbol),
      mutations: this.detectMutations(symbol),
      inputs: incomingRels.map(rel => this.buildDataFlowEdge(rel, 'incoming')),
      outputs: outgoingRels.map(rel => this.buildDataFlowEdge(rel, 'outgoing'))
    };

    return node;
  }

  /**
   * Analyze the impact of changes to a symbol
   */
  async analyzeImpact(symbolId: string): Promise<ImpactAnalysis> {
    const visited = new Set<number>();
    const directImpact: ImpactNode[] = [];
    const indirectImpact: ImpactNode[] = [];
    const rippleWaves: Map<number, ImpactNode[]> = new Map();

    // BFS to find all impacted nodes
    const queue: { id: number; distance: number }[] = [{ id: parseInt(symbolId), distance: 0 }];
    
    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      
      if (visited.has(id)) continue;
      visited.add(id);

      if (distance > 0) {
        const impactNode = this.createImpactNode(id, distance);
        
        if (distance === 1) {
          directImpact.push(impactNode);
        } else {
          indirectImpact.push(impactNode);
        }

        // Group by distance for ripple effect
        if (!rippleWaves.has(distance)) {
          rippleWaves.set(distance, []);
        }
        rippleWaves.get(distance)!.push(impactNode);
      }

      // Get all symbols that depend on this one
      const dependents = this.getDependentSymbols(id);
      for (const dep of dependents) {
        if (!visited.has(dep.id)) {
          queue.push({ id: dep.id, distance: distance + 1 });
        }
      }
    }

    // Convert ripple waves to array
    const rippleEffect: RippleWave[] = Array.from(rippleWaves.entries())
      .map(([distance, nodes]) => ({
        distance,
        nodes,
        timestamp: distance * 100 // 100ms delay per wave
      }))
      .sort((a, b) => a.distance - b.distance);

    const severityScore = this.calculateImpactSeverity(directImpact, indirectImpact);

    return {
      directImpact,
      indirectImpact,
      rippleEffect,
      severityScore
    };
  }

  /**
   * Detect architectural and design patterns
   */
  async detectPatterns(scope: 'module' | 'global' = 'global'): Promise<PatternAnalysis[]> {
    const patterns: PatternAnalysis[] = [];

    // Detect Singleton pattern
    patterns.push(...this.detectSingletonPattern());

    // Detect Factory pattern
    patterns.push(...this.detectFactoryPattern());

    // Detect Observer pattern
    patterns.push(...this.detectObserverPattern());

    // Detect anti-patterns
    patterns.push(...this.detectAntiPatterns());

    return patterns;
  }

  /**
   * Simulate execution paths through the code
   */
  async simulateExecution(entryPoint: string): Promise<ExecutionTrace> {
    const paths: ExecutionPath[] = [];
    const hotspots = new Map<number, HotSpot>();
    const bottlenecks: Bottleneck[] = [];

    // Simulate multiple execution paths
    const simulatedPaths = this.generateExecutionPaths(parseInt(entryPoint), 10);

    for (const path of simulatedPaths) {
      // Track hotspots
      for (const nodeId of path.nodes) {
        if (!hotspots.has(nodeId)) {
          hotspots.set(nodeId, {
            symbolId: nodeId,
            callCount: 0,
            callers: []
          });
        }
        
        const hotspot = hotspots.get(nodeId)!;
        hotspot.callCount++;
      }

      paths.push(path);
    }

    // Identify bottlenecks
    for (const [nodeId, hotspot] of hotspots) {
      if (hotspot.callCount > 5) {
        const deps = this.getDependentSymbols(nodeId);
        if (deps.length > 10) {
          bottlenecks.push({
            symbolId: nodeId,
            blockingCalls: deps.map(d => d.id),
            severity: hotspot.callCount > 20 ? 'high' : 'medium'
          });
        }
      }
    }

    return {
      entryPoint: parseInt(entryPoint),
      paths,
      hotspots: Array.from(hotspots.values()),
      bottlenecks
    };
  }

  /**
   * Calculate advanced complexity metrics
   */
  async calculateComplexity(symbolId: string): Promise<ComplexityMetrics> {
    const symbol = this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    const cyclomatic = symbol.complexity || 1;
    const cognitive = this.calculateCognitiveComplexity(symbol);
    const dataFlow = this.calculateDataFlowComplexity(parseInt(symbolId));
    const architectural = this.calculateArchitecturalComplexity(parseInt(symbolId));

    const totalScore = (cyclomatic * 0.25) + (cognitive * 0.25) + 
                      (dataFlow * 0.25) + (architectural * 0.25);

    return {
      cyclomaticComplexity: cyclomatic,
      cognitiveComplexity: cognitive,
      dataFlowComplexity: dataFlow,
      architecturalComplexity: architectural,
      totalScore,
      breakdown: [
        {
          metric: 'Cyclomatic Complexity',
          value: cyclomatic,
          description: 'Number of independent paths through the code'
        },
        {
          metric: 'Cognitive Complexity',
          value: cognitive,
          description: 'How difficult the code is to understand'
        },
        {
          metric: 'Data Flow Complexity',
          value: dataFlow,
          description: 'Complexity of data transformations and mutations'
        },
        {
          metric: 'Architectural Complexity',
          value: architectural,
          description: 'Coupling and cohesion metrics'
        }
      ]
    };
  }

  // Helper methods

  private getSymbol(id: number): Symbol | null {
    const stmt = this.db.prepare(`
      SELECT * FROM symbols WHERE id = ?
    `);
    return stmt.get(id) as Symbol;
  }

  private getIncomingRelationships(symbolId: number): Relationship[] {
    const stmt = this.db.prepare(`
      SELECT * FROM relationships WHERE to_symbol_id = ?
    `);
    return stmt.all(symbolId) as Relationship[];
  }

  private getOutgoingRelationships(symbolId: number): Relationship[] {
    const stmt = this.db.prepare(`
      SELECT * FROM relationships WHERE from_symbol_id = ?
    `);
    return stmt.all(symbolId) as Relationship[];
  }

  private getDependentSymbols(symbolId: number): Symbol[] {
    const stmt = this.db.prepare(`
      SELECT s.* FROM symbols s
      JOIN relationships r ON s.id = r.from_symbol_id
      WHERE r.to_symbol_id = ?
    `);
    return stmt.all(symbolId) as Symbol[];
  }

  private inferDataType(symbol: Symbol): string | undefined {
    // Simple inference based on symbol type and name
    if (symbol.return_type) return symbol.return_type;
    if (symbol.name.includes('count') || symbol.name.includes('num')) return 'number';
    if (symbol.name.includes('name') || symbol.name.includes('str')) return 'string';
    if (symbol.name.includes('is') || symbol.name.includes('has')) return 'boolean';
    return undefined;
  }

  private detectMutations(symbol: Symbol): DataMutation[] {
    // This would require more sophisticated analysis
    // For now, return placeholder data
    return [];
  }

  private buildDataFlowEdge(rel: Relationship, direction: 'incoming' | 'outgoing'): DataFlowEdge {
    return {
      from: rel.from_symbol_id,
      to: rel.to_symbol_id,
      dataType: this.inferDataTypeFromRelationship(rel),
      transformations: this.detectTransformations(rel),
      confidence: rel.confidence || 0.8
    };
  }

  private inferDataTypeFromRelationship(rel: Relationship): string | undefined {
    // Placeholder - would need more context
    return undefined;
  }

  private detectTransformations(rel: Relationship): string[] {
    // Placeholder - would need code analysis
    return [];
  }

  private createImpactNode(symbolId: number, distance: number): ImpactNode {
    const symbol = this.getSymbol(symbolId);
    return {
      symbolId,
      symbolName: symbol?.name || 'Unknown',
      impactType: distance === 1 ? 'breaking' : 'modification',
      distance,
      confidence: Math.max(0.3, 1 - (distance * 0.1))
    };
  }

  private calculateImpactSeverity(direct: ImpactNode[], indirect: ImpactNode[]): number {
    const directScore = direct.reduce((sum, node) => {
      return sum + (node.impactType === 'breaking' ? 10 : 5);
    }, 0);

    const indirectScore = indirect.reduce((sum, node) => {
      return sum + (node.impactType === 'breaking' ? 3 : 1);
    }, 0);

    return Math.min(100, directScore + indirectScore);
  }

  private detectSingletonPattern(): PatternAnalysis[] {
    // Look for classes with private constructors and getInstance methods
    const stmt = this.db.prepare(`
      SELECT s.* FROM symbols s
      WHERE s.kind = 'class'
      AND EXISTS (
        SELECT 1 FROM symbols m
        WHERE m.parent_symbol_id = s.id
        AND m.name LIKE '%getInstance%'
      )
    `);
    
    const candidates = stmt.all() as Symbol[];
    
    return candidates.map(symbol => ({
      patternType: 'Singleton',
      confidence: 0.8,
      nodes: [symbol.id],
      description: `${symbol.name} appears to implement the Singleton pattern`
    }));
  }

  private detectFactoryPattern(): PatternAnalysis[] {
    // Look for classes/functions with 'create' or 'factory' in the name
    const stmt = this.db.prepare(`
      SELECT * FROM symbols
      WHERE (name LIKE '%Factory%' OR name LIKE '%create%')
      AND kind IN ('class', 'function')
    `);
    
    const candidates = stmt.all() as Symbol[];
    
    return candidates.map(symbol => ({
      patternType: 'Factory',
      confidence: 0.7,
      nodes: [symbol.id],
      description: `${symbol.name} appears to implement the Factory pattern`
    }));
  }

  private detectObserverPattern(): PatternAnalysis[] {
    // Look for subscribe/notify patterns
    const stmt = this.db.prepare(`
      SELECT DISTINCT s.* FROM symbols s
      WHERE s.kind = 'class'
      AND (
        EXISTS (SELECT 1 FROM symbols m WHERE m.parent_symbol_id = s.id AND m.name LIKE '%subscribe%')
        OR EXISTS (SELECT 1 FROM symbols m WHERE m.parent_symbol_id = s.id AND m.name LIKE '%notify%')
        OR EXISTS (SELECT 1 FROM symbols m WHERE m.parent_symbol_id = s.id AND m.name LIKE '%observer%')
      )
    `);
    
    const candidates = stmt.all() as Symbol[];
    
    return candidates.map(symbol => ({
      patternType: 'Observer',
      confidence: 0.75,
      nodes: [symbol.id],
      description: `${symbol.name} appears to implement the Observer pattern`
    }));
  }

  private detectAntiPatterns(): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];

    // God Class - classes with too many methods
    const godClassStmt = this.db.prepare(`
      SELECT s.*, COUNT(m.id) as method_count
      FROM symbols s
      LEFT JOIN symbols m ON m.parent_symbol_id = s.id AND m.kind = 'function'
      WHERE s.kind = 'class'
      GROUP BY s.id
      HAVING method_count > 20
    `);

    const godClasses = godClassStmt.all() as any[];
    
    patterns.push(...godClasses.map(symbol => ({
      patternType: 'God Class Anti-Pattern',
      confidence: 0.9,
      nodes: [symbol.id],
      description: `${symbol.name} has ${symbol.method_count} methods - consider breaking it down`,
      recommendation: 'Split into smaller, focused classes following Single Responsibility Principle'
    })));

    return patterns;
  }

  private generateExecutionPaths(entryPoint: number, count: number): ExecutionPath[] {
    const paths: ExecutionPath[] = [];
    
    for (let i = 0; i < count; i++) {
      const path = this.tracePath(entryPoint, new Set(), []);
      if (path.length > 0) {
        paths.push({
          nodes: path,
          frequency: Math.random() * 100,
          dataFlow: []
        });
      }
    }
    
    return paths;
  }

  private tracePath(current: number, visited: Set<number>, path: number[]): number[] {
    if (visited.has(current) || path.length > 20) {
      return path;
    }

    visited.add(current);
    path.push(current);

    const outgoing = this.getOutgoingRelationships(current);
    if (outgoing.length === 0) {
      return path;
    }

    // Randomly pick a path
    const next = outgoing[Math.floor(Math.random() * outgoing.length)];
    return this.tracePath(next.to_symbol_id, visited, path);
  }

  private calculateCognitiveComplexity(symbol: Symbol): number {
    // Simplified calculation
    let complexity = 1;
    
    // Add for nesting
    if (symbol.depth) complexity += symbol.depth;
    
    // Add for conditionals in name (heuristic)
    if (symbol.name.includes('if') || symbol.name.includes('switch')) complexity += 2;
    
    return complexity;
  }

  private calculateDataFlowComplexity(symbolId: number): number {
    const incoming = this.getIncomingRelationships(symbolId);
    const outgoing = this.getOutgoingRelationships(symbolId);
    
    return incoming.length + outgoing.length;
  }

  private calculateArchitecturalComplexity(symbolId: number): number {
    const dependencies = this.getDependentSymbols(symbolId);
    const incoming = this.getIncomingRelationships(symbolId);
    
    // Fan-out and fan-in
    return dependencies.length + incoming.length;
  }
}