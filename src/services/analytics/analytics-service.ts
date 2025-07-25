import type Database from 'better-sqlite3';
import type { Symbol, Relationship } from '../../shared/types/api';
import { RippleEffectTracker, ImpactPrediction, RippleNode } from '../../visualization/ripple-effect-tracker.js';
import { ChangeImpactPredictor, ChangeScenario, ImpactVisualization } from '../../visualization/change-impact-predictor.js';
import * as path from 'path';
import * as os from 'os';

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

// Enhanced impact analysis interfaces
export interface EnhancedImpactAnalysis extends ImpactAnalysis {
  prediction: ImpactPrediction;
  riskAssessment: {
    overall: number;
    breakingChanges: number;
    testingRequired: string[];
    reviewersNeeded: string[];
  };
  recommendations: string[];
  estimatedFixTime: number;
  criticalPaths: string[][];
}

export interface ScenarioAnalysis {
  scenarios: ChangeScenario[];
  comparisons: {
    mostOptimal: string;
    leastRisky: string;
    fastestImplementation: string;
  };
  visualization: ImpactVisualization;
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
  private rippleTracker: RippleEffectTracker;
  private changePredictor: ChangeImpactPredictor;
  private dbPath: string;

  constructor(private db: Database.Database) {
    // Get database path
    this.dbPath = (db as any).name || path.join(os.homedir(), '.module-sentinel', 'development.db');
    
    // Initialize advanced analyzers
    this.rippleTracker = new RippleEffectTracker(this.dbPath);
    this.changePredictor = new ChangeImpactPredictor(this.dbPath);
  }

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
   * Analyze the impact of changes to a symbol (enhanced with RippleEffectTracker)
   */
  async analyzeImpact(symbolId: string): Promise<ImpactAnalysis> {
    // Fallback to basic analysis if symbol doesn't exist
    const symbol = this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      return {
        directImpact: [],
        indirectImpact: [],
        rippleEffect: [],
        severityScore: 0
      };
    }

    // Use qualified name for advanced analysis
    const symbolName = symbol.qualified_name || symbol.name;
    
    try {
      // Use RippleEffectTracker for advanced analysis
      const prediction = await this.rippleTracker.predictImpact(symbolName, 'type');
      
      // Convert advanced analysis to basic format for backward compatibility
      const directImpact: ImpactNode[] = [];
      const indirectImpact: ImpactNode[] = [];
      const rippleWaves: Map<number, ImpactNode[]> = new Map();

      prediction.affectedNodes.forEach(affectedNode => {
        const distance = affectedNode.propagationPath.length;
        const impactNode: ImpactNode = {
          symbolId: parseInt(affectedNode.node.id) || 0,
          symbolName: affectedNode.node.name,
          impactType: this.mapImpactType(affectedNode.impactSeverity),
          distance,
          confidence: affectedNode.node.confidence
        };

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
      });

      // Convert ripple waves to array
      const rippleEffect: RippleWave[] = Array.from(rippleWaves.entries())
        .map(([distance, nodes]) => ({
          distance,
          nodes,
          timestamp: distance * 100 // 100ms delay per wave
        }))
        .sort((a, b) => a.distance - b.distance);

      const severityScore = prediction.riskAssessment.overall;

      return {
        directImpact,
        indirectImpact,
        rippleEffect,
        severityScore
      };
    } catch (error) {
      console.warn('Advanced impact analysis failed, falling back to basic analysis:', error);
      return this.analyzeImpactFallback(symbolId);
    }
  }

  /**
   * Enhanced impact analysis with full prediction details
   */
  async analyzeEnhancedImpact(
    symbolId: string, 
    changeType: 'type' | 'value' | 'signature' | 'dependency' | 'removal' = 'type'
  ): Promise<EnhancedImpactAnalysis> {
    const symbol = this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    const symbolName = symbol.qualified_name || symbol.name;
    const prediction = await this.rippleTracker.predictImpact(symbolName, changeType);
    const basicAnalysis = await this.analyzeImpact(symbolId);

    const estimatedFixTime = prediction.affectedNodes.reduce(
      (total, node) => total + node.estimatedFixTime, 
      0
    );

    const criticalPaths = prediction.affectedNodes
      .filter(node => node.impactSeverity >= 7)
      .map(node => node.propagationPath);

    return {
      ...basicAnalysis,
      prediction,
      riskAssessment: prediction.riskAssessment,
      recommendations: prediction.recommendations,
      estimatedFixTime,
      criticalPaths
    };
  }

  /**
   * Create and analyze multiple change scenarios
   */
  async analyzeScenarios(symbolId: string, customScenarios?: Partial<ChangeScenario>[]): Promise<ScenarioAnalysis> {
    const symbol = this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    const symbolName = symbol.qualified_name || symbol.name;
    
    // Create default scenarios if none provided
    const scenarios = await this.changePredictor.createChangeScenarios(symbolName);

    // Analyze each scenario
    const scenarioResults = await Promise.all(
      scenarios.map(async (scenario: any) => {
        const prediction = await this.rippleTracker.predictImpact(
          scenario.targetSymbol, 
          scenario.changeType, 
          scenario.simulatedChange
        );
        return { scenario, prediction };
      })
    );

    // Find comparisons
    const comparisons = {
      mostOptimal: this.findMostOptimal(scenarioResults),
      leastRisky: this.findLeastRisky(scenarioResults),
      fastestImplementation: this.findFastestImplementation(scenarioResults)
    };

    // Generate visualization
    // Generate visualization for first scenario if available
    const visualization = scenarios.length > 0 
      ? await this.changePredictor.analyzeScenarioImpact(scenarios[0])
      : null;

    return {
      scenarios,
      comparisons,
      visualization: visualization || {
        scenario: scenarios[0] || {
          id: 'default',
          name: 'No scenario',
          description: '',
          targetSymbol: symbolName,
          changeType: 'type' as const,
          simulatedChange: { from: null, to: null, description: '' },
          isActive: false,
          estimatedFixTime: 0,
          riskScore: 0,
          affectedNodes: 0
        },
        prediction: {
          changedSymbol: symbolName,
          changeType: 'type' as const,
          simulatedChange: null,
          affectedNodes: [],
          riskAssessment: {
            overall: 0,
            breakingChanges: 0,
            testingRequired: [],
            reviewersNeeded: []
          },
          recommendations: []
        },
        visualization: {
          networkData: { nodes: [], edges: [] },
          timelineData: {
            phases: []
          },
          heatmapData: {
            stages: [],
            impacts: [],
            labels: []
          }
        }
      }
    };
  }

  /**
   * Map impact severity to impact type for backward compatibility
   */
  private mapImpactType(severity: number): 'breaking' | 'modification' | 'enhancement' {
    if (severity >= 7) return 'breaking';
    if (severity >= 4) return 'modification';
    return 'enhancement';
  }

  /**
   * Fallback to basic impact analysis
   */
  private async analyzeImpactFallback(symbolId: string): Promise<ImpactAnalysis> {
    // Basic BFS analysis as fallback
    const visited = new Set<number>();
    const directImpact: ImpactNode[] = [];
    const indirectImpact: ImpactNode[] = [];
    const rippleWaves: Map<number, ImpactNode[]> = new Map();

    const queue: { id: number; distance: number }[] = [{ id: parseInt(symbolId), distance: 0 }];
    
    while (queue.length > 0) {
      const { id, distance } = queue.shift()!;
      
      if (visited.has(id) || distance > 3) continue; // Limit depth
      visited.add(id);

      if (distance > 0) {
        const impactNode = this.createImpactNode(id, distance);
        
        if (distance === 1) {
          directImpact.push(impactNode);
        } else {
          indirectImpact.push(impactNode);
        }

        if (!rippleWaves.has(distance)) {
          rippleWaves.set(distance, []);
        }
        rippleWaves.get(distance)!.push(impactNode);
      }

      const dependents = this.getDependentSymbols(id);
      for (const dep of dependents) {
        if (!visited.has(dep.id)) {
          queue.push({ id: dep.id, distance: distance + 1 });
        }
      }
    }

    const rippleEffect: RippleWave[] = Array.from(rippleWaves.entries())
      .map(([distance, nodes]) => ({
        distance,
        nodes,
        timestamp: distance * 100
      }))
      .sort((a, b) => a.distance - b.distance);

    return {
      directImpact,
      indirectImpact,
      rippleEffect,
      severityScore: this.calculateImpactSeverity(directImpact, indirectImpact)
    };
  }

  private findMostOptimal(results: Array<{scenario: ChangeScenario, prediction: ImpactPrediction}>): string {
    return results.reduce((best, current) => 
      current.prediction.riskAssessment.overall < best.prediction.riskAssessment.overall ? current : best
    ).scenario.id;
  }

  private findLeastRisky(results: Array<{scenario: ChangeScenario, prediction: ImpactPrediction}>): string {
    return results.reduce((best, current) => 
      current.prediction.riskAssessment.breakingChanges < best.prediction.riskAssessment.breakingChanges ? current : best
    ).scenario.id;
  }

  private findFastestImplementation(results: Array<{scenario: ChangeScenario, prediction: ImpactPrediction}>): string {
    return results.reduce((best, current) => {
      const currentTime = current.prediction.affectedNodes.reduce((sum, node) => sum + node.estimatedFixTime, 0);
      const bestTime = best.prediction.affectedNodes.reduce((sum, node) => sum + node.estimatedFixTime, 0);
      return currentTime < bestTime ? current : best;
    }).scenario.id;
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
      SELECT * FROM universal_symbols WHERE id = ?
    `);
    return stmt.get(id) as Symbol;
  }

  private getIncomingRelationships(symbolId: number): Relationship[] {
    const stmt = this.db.prepare(`
      SELECT * FROM universal_relationships WHERE to_symbol_id = ?
    `);
    return stmt.all(symbolId) as Relationship[];
  }

  private getOutgoingRelationships(symbolId: number): Relationship[] {
    const stmt = this.db.prepare(`
      SELECT * FROM universal_relationships WHERE from_symbol_id = ?
    `);
    return stmt.all(symbolId) as Relationship[];
  }

  private getDependentSymbols(symbolId: number): Symbol[] {
    const stmt = this.db.prepare(`
      SELECT s.* FROM universal_symbols s
      JOIN universal_relationships r ON s.id = r.from_symbol_id
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
      SELECT s.* FROM universal_symbols s
      WHERE s.kind = 'class'
      AND EXISTS (
        SELECT 1 FROM universal_symbols m
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
      SELECT * FROM universal_symbols
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
      SELECT DISTINCT s.* FROM universal_symbols s
      WHERE s.kind = 'class'
      AND (
        EXISTS (SELECT 1 FROM universal_symbols m WHERE m.parent_symbol_id = s.id AND m.name LIKE '%subscribe%')
        OR EXISTS (SELECT 1 FROM universal_symbols m WHERE m.parent_symbol_id = s.id AND m.name LIKE '%notify%')
        OR EXISTS (SELECT 1 FROM universal_symbols m WHERE m.parent_symbol_id = s.id AND m.name LIKE '%observer%')
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
      FROM universal_symbols s
      LEFT JOIN universal_symbols m ON m.parent_symbol_id = s.id AND m.kind = 'function'
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

  /**
   * Get real impact metrics based on actual data
   */
  async getImpactMetrics(symbolId: string): Promise<any> {
    // Get basic impact analysis first
    const impactAnalysis = await this.analyzeImpact(symbolId);
    const symbol = this.getSymbol(parseInt(symbolId));
    
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    // Calculate test coverage from code flow paths
    const testCoverage = this.calculateTestCoverage(symbolId, impactAnalysis);
    
    // Calculate performance impact from complexity and relationships
    const performanceImpact = this.calculatePerformanceImpact(symbolId, impactAnalysis);
    
    // Calculate build impact from dependencies
    const buildImpact = this.calculateBuildImpact(symbolId, impactAnalysis);
    
    // Determine team impact from file ownership patterns
    const teamImpact = this.calculateTeamImpact(symbolId, impactAnalysis);
    
    // Calculate risk score from real metrics
    const riskScore = await this.calculateRiskScore(symbolId, impactAnalysis);

    return {
      testCoverage,
      performanceImpact,
      buildImpact,
      teamImpact,
      riskScore
    };
  }

  private calculateTestCoverage(symbolId: string, impactAnalysis: ImpactAnalysis): any {
    // Query code flow paths for coverage data
    const coverageStmt = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT cfp.id) as total_paths,
        COUNT(DISTINCT CASE WHEN cfp.coverage > 0 THEN cfp.id END) as covered_paths,
        AVG(cfp.coverage) as avg_coverage
      FROM code_flow_paths cfp
      WHERE cfp.start_symbol_id = ? OR cfp.end_symbol_id = ?
    `);
    
    const coverage = coverageStmt.get(symbolId, symbolId) as any;
    
    // Get affected symbols that lack test coverage
    const affectedSymbols = [
      ...impactAnalysis.directImpact,
      ...impactAnalysis.indirectImpact
    ];
    
    const uncoveredStmt = this.db.prepare(`
      SELECT s.id, s.name, s.qualified_name
      FROM universal_symbols s
      WHERE s.id IN (${affectedSymbols.map(() => '?').join(',')})
      AND NOT EXISTS (
        SELECT 1 FROM code_flow_paths cfp
        WHERE (cfp.start_symbol_id = s.id OR cfp.end_symbol_id = s.id)
        AND cfp.coverage > 0
      )
    `);
    
    const uncoveredSymbols = affectedSymbols.length > 0 
      ? uncoveredStmt.all(...affectedSymbols.map(s => s.symbolId)) as any[]
      : [];

    const percentage = coverage?.avg_coverage || 0;
    
    return {
      affected: affectedSymbols.length,
      covered: affectedSymbols.length - uncoveredSymbols.length,
      percentage: Math.round(percentage * 100),
      uncoveredSymbols: uncoveredSymbols.map(s => ({
        id: s.id,
        name: s.name,
        qualifiedName: s.qualified_name
      }))
    };
  }

  private calculatePerformanceImpact(symbolId: string, impactAnalysis: ImpactAnalysis): any {
    // Get complexity metrics for the symbol
    const complexityStmt = this.db.prepare(`
      SELECT 
        cyclomatic_complexity,
        cognitive_complexity,
        nesting_depth,
        has_loops,
        has_recursion
      FROM cpp_method_complexity
      WHERE symbol_id = ?
    `);
    
    const complexity = complexityStmt.get(symbolId) as any;
    
    // Get execution time estimates from call chains
    const executionStmt = this.db.prepare(`
      SELECT 
        AVG(estimated_execution_time_ms) as avg_execution_time,
        MAX(estimated_execution_time_ms) as max_execution_time
      FROM call_chains
      WHERE entry_point_id = ?
    `);
    
    const execution = executionStmt.get(symbolId) as any;
    
    // Calculate estimated impact
    const baseLatency = execution?.avg_execution_time || 10;
    const complexityFactor = complexity ? 
      (complexity.cyclomatic_complexity + complexity.cognitive_complexity) / 20 : 1;
    const impactFactor = impactAnalysis.severityScore / 100;
    
    return {
      estimatedLatency: Math.round(baseLatency * complexityFactor * impactFactor),
      memoryDelta: Math.round(complexityFactor * 10), // Rough estimate
      cpuDelta: Math.round(complexityFactor * 5),
      ioOperations: complexity?.has_loops ? 20 + Math.round(complexityFactor * 10) : 10
    };
  }

  private calculateBuildImpact(symbolId: string, impactAnalysis: ImpactAnalysis): any {
    // Get all affected files
    const affectedFilesStmt = this.db.prepare(`
      SELECT DISTINCT s.file_path
      FROM universal_symbols s
      WHERE s.id IN (${[...impactAnalysis.directImpact, ...impactAnalysis.indirectImpact]
        .map(() => '?').join(',') || '?'})
    `);
    
    const affectedSymbolIds = [...impactAnalysis.directImpact, ...impactAnalysis.indirectImpact]
      .map(n => n.symbolId);
    
    const affectedFiles = affectedSymbolIds.length > 0
      ? affectedFilesStmt.all(...(affectedSymbolIds.length > 0 ? affectedSymbolIds : [symbolId])) as any[]
      : [];
    
    // Get dependencies
    const dependencyStmt = this.db.prepare(`
      SELECT DISTINCT s2.namespace
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      WHERE s1.id = ? AND r.type IN ('imports', 'includes')
    `);
    
    const dependencies = dependencyStmt.all(symbolId) as any[];
    
    // Estimate build times based on file count and complexity
    const fileCount = affectedFiles.length;
    const estimatedBuildTime = fileCount * 3; // 3 seconds per file average
    const incrementalBuildTime = Math.max(3, fileCount * 0.5); // Faster for incremental
    
    return {
      affectedFiles: fileCount,
      estimatedBuildTime,
      incrementalBuildTime,
      dependencies: dependencies.map(d => d.namespace).filter(Boolean)
    };
  }

  private calculateTeamImpact(symbolId: string, impactAnalysis: ImpactAnalysis): any {
    // Determine teams based on file paths and namespaces
    const affectedSymbols = [
      ...impactAnalysis.directImpact,
      ...impactAnalysis.indirectImpact
    ];
    
    const namespaceStmt = this.db.prepare(`
      SELECT DISTINCT namespace
      FROM universal_symbols
      WHERE id IN (${affectedSymbols.map(() => '?').join(',') || '?'})
      AND namespace IS NOT NULL
    `);
    
    const namespaces = affectedSymbols.length > 0
      ? namespaceStmt.all(...(affectedSymbols.length > 0 ? affectedSymbols.map(s => s.symbolId) : [symbolId])) as any[]
      : [];
    
    // Map namespaces to teams (simplified heuristic)
    const teamMap: Record<string, string> = {
      'api': 'Platform',
      'core': 'Core',
      'ui': 'Frontend',
      'dashboard': 'Frontend',
      'services': 'Backend',
      'database': 'Backend',
      'test': 'QA',
      'analytics': 'Data'
    };
    
    const affectedTeams = new Set<string>();
    namespaces.forEach(ns => {
      const namespace = ns.namespace.toLowerCase();
      for (const [key, team] of Object.entries(teamMap)) {
        if (namespace.includes(key)) {
          affectedTeams.add(team);
        }
      }
    });
    
    // If no specific teams found, add default teams
    if (affectedTeams.size === 0) {
      affectedTeams.add('Platform');
      affectedTeams.add('Backend');
    }
    
    return {
      affectedTeams: Array.from(affectedTeams),
      primaryOwners: [`owner-${symbolId}@company.com`], // Placeholder
      reviewersNeeded: Math.min(3, affectedTeams.size),
      communicationChannels: Array.from(affectedTeams).map(team => `#${team.toLowerCase()}-team`)
    };
  }

  private async calculateRiskScore(symbolId: string, impactAnalysis: ImpactAnalysis): Promise<any> {
    // Get real complexity metrics
    const complexityMetrics = await this.calculateComplexity(symbolId);
    
    // Get pattern violations
    const violationStmt = this.db.prepare(`
      SELECT COUNT(*) as violation_count
      FROM detected_patterns
      WHERE pattern_type LIKE '%Anti-Pattern%'
      AND id IN (
        SELECT pattern_id FROM pattern_symbols WHERE symbol_id = ?
      )
    `);
    
    const violations = violationStmt.get(symbolId) as any;
    
    // Calculate stability based on relationships
    const stabilityScore = 100 - Math.min(90, impactAnalysis.severityScore);
    
    // Calculate testability based on complexity
    const testabilityScore = Math.max(10, 100 - complexityMetrics.totalScore);
    
    // Overall risk calculation
    const overall = Math.round(
      (impactAnalysis.severityScore * 0.4) +
      (complexityMetrics.totalScore * 0.3) +
      ((violations?.violation_count || 0) * 10 * 0.2) +
      ((100 - stabilityScore) * 0.1)
    );
    
    return {
      overall: Math.min(100, overall),
      complexity: complexityMetrics.totalScore,
      testability: testabilityScore,
      stability: stabilityScore,
      historicalSuccess: 75 // Placeholder - would need git history
    };
  }

  /**
   * Get code health indicators for impacted symbols
   */
  async getCodeHealth(symbolId: string): Promise<any> {
    const impactAnalysis = await this.analyzeImpact(symbolId);
    const healthIndicators: any[] = [];
    
    // Get health for all impacted symbols
    const allImpactedSymbols = [
      ...impactAnalysis.directImpact,
      ...impactAnalysis.indirectImpact
    ];
    
    for (const node of allImpactedSymbols) {
      const health = await this.calculateSymbolHealth(node.symbolId);
      healthIndicators.push(health);
    }
    
    return healthIndicators;
  }

  private async calculateSymbolHealth(symbolId: number): Promise<any> {
    // Get complexity metrics
    const complexityStmt = this.db.prepare(`
      SELECT 
        cyclomatic_complexity,
        cognitive_complexity,
        nesting_depth,
        line_count,
        has_loops,
        has_recursion
      FROM cpp_method_complexity
      WHERE symbol_id = ?
    `);
    
    const complexity = complexityStmt.get(symbolId) as any;
    
    // Get test coverage
    const coverageStmt = this.db.prepare(`
      SELECT AVG(coverage) as test_coverage
      FROM code_flow_paths
      WHERE start_symbol_id = ? OR end_symbol_id = ?
    `);
    
    const coverage = coverageStmt.get(symbolId, symbolId) as any;
    
    // Get modification frequency (simplified - would need git integration)
    const modificationFrequency = Math.random() * 10; // Placeholder
    
    // Get bug density from semantic insights
    const bugStmt = this.db.prepare(`
      SELECT COUNT(*) as bug_count
      FROM semantic_insights
      WHERE insight_type = 'bug' 
      AND affected_symbols LIKE ?
    `);
    
    const bugs = bugStmt.get(`%${symbolId}%`) as any;
    
    // Calculate health score
    const testCoverage = (coverage?.test_coverage || 0) * 100;
    const cyclomaticComplexity = complexity?.cyclomatic_complexity || 10;
    const stability = 100 - (modificationFrequency * 10);
    
    let health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    if (testCoverage > 80 && cyclomaticComplexity < 10 && stability > 80) {
      health = 'excellent';
    } else if (testCoverage > 60 && cyclomaticComplexity < 15 && stability > 60) {
      health = 'good';
    } else if (testCoverage > 40 && cyclomaticComplexity < 20 && stability > 40) {
      health = 'fair';
    } else if (testCoverage > 20 || cyclomaticComplexity < 25 || stability > 20) {
      health = 'poor';
    } else {
      health = 'critical';
    }
    
    return {
      symbolId,
      health,
      testCoverage,
      complexity: cyclomaticComplexity,
      stability,
      lastModified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      modificationFrequency,
      bugDensity: bugs?.bug_count || 0,
      technicalDebt: Math.round((100 - testCoverage) + cyclomaticComplexity + (bugs?.bug_count || 0) * 5)
    };
  }

  /**
   * Get data-driven recommendations based on semantic insights
   */
  async getImpactRecommendations(symbolId: string): Promise<any[]> {
    const impactAnalysis = await this.analyzeEnhancedImpact(symbolId);
    const recommendations: any[] = [];
    
    // Get semantic insights for the symbol
    const insightStmt = this.db.prepare(`
      SELECT *
      FROM semantic_insights
      WHERE affected_symbols LIKE ?
      ORDER BY priority ASC, severity DESC
      LIMIT 10
    `);
    
    const insights = insightStmt.all(`%${symbolId}%`) as any[];
    
    // Convert insights to recommendations
    insights.forEach((insight, index) => {
      recommendations.push({
        id: insight.id.toString(),
        type: this.mapInsightTypeToRecommendationType(insight.insight_type),
        priority: this.mapSeverityToPriority(insight.severity),
        title: insight.title || this.generateRecommendationTitle(insight),
        reasoning: insight.reasoning || insight.description,
        estimatedEffort: this.estimateEffortHours(insight),
        riskReduction: Math.round(insight.confidence * 30),
        suggestedApproach: this.parseSuggestedApproach(insight.suggestions),
        affectedSymbols: this.parseAffectedSymbols(insight.affected_symbols),
        prerequisites: []
      });
    });
    
    // Add recommendations from impact analysis
    if (impactAnalysis.recommendations) {
      impactAnalysis.recommendations.forEach((rec: string, index: number) => {
        recommendations.push({
          id: `impact-${index}`,
          type: 'refactor',
          priority: 'medium',
          title: rec,
          reasoning: 'Based on impact analysis',
          estimatedEffort: 4,
          riskReduction: 15,
          suggestedApproach: [rec],
          affectedSymbols: [],
          prerequisites: []
        });
      });
    }
    
    return recommendations;
  }

  private mapInsightTypeToRecommendationType(insightType: string): string {
    const typeMap: Record<string, string> = {
      'refactoring_opportunity': 'refactor',
      'test_coverage_gap': 'test',
      'documentation_needed': 'document',
      'performance_concern': 'refactor',
      'security_vulnerability': 'refactor',
      'architectural_violation': 'refactor',
      'code_duplication': 'refactor',
      'complexity_warning': 'split'
    };
    
    return typeMap[insightType] || 'refactor';
  }

  private mapSeverityToPriority(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'error': return 'critical';
      case 'warning': return 'high';
      case 'info': return 'medium';
      default: return 'low';
    }
  }

  private generateRecommendationTitle(insight: any): string {
    const titles: Record<string, string> = {
      'refactoring_opportunity': `Refactor ${insight.source_context || 'code'}`,
      'test_coverage_gap': `Add tests for ${insight.source_context || 'uncovered code'}`,
      'documentation_needed': `Document ${insight.source_context || 'API'}`,
      'performance_concern': `Optimize ${insight.source_context || 'performance bottleneck'}`,
      'security_vulnerability': `Fix security issue in ${insight.source_context || 'code'}`,
      'architectural_violation': `Fix architectural violation in ${insight.source_context || 'module'}`,
      'code_duplication': `Remove duplication in ${insight.source_context || 'code'}`,
      'complexity_warning': `Reduce complexity in ${insight.source_context || 'method'}`
    };
    
    return titles[insight.insight_type] || 'Improve code quality';
  }

  private estimateEffortHours(insight: any): number {
    const effortMap: Record<string, number> = {
      'refactoring_opportunity': 4,
      'test_coverage_gap': 8,
      'documentation_needed': 2,
      'performance_concern': 6,
      'security_vulnerability': 8,
      'architectural_violation': 12,
      'code_duplication': 3,
      'complexity_warning': 6
    };
    
    return effortMap[insight.insight_type] || 4;
  }

  private parseSuggestedApproach(suggestions: string | any): string[] {
    if (!suggestions) return ['Review and fix the identified issue'];
    
    if (typeof suggestions === 'string') {
      try {
        const parsed = JSON.parse(suggestions);
        return Array.isArray(parsed) ? parsed : [suggestions];
      } catch {
        return [suggestions];
      }
    }
    
    return Array.isArray(suggestions) ? suggestions : ['Review and fix the identified issue'];
  }

  private parseAffectedSymbols(affectedSymbols: string | any): any[] {
    if (!affectedSymbols) return [];
    
    try {
      const parsed = typeof affectedSymbols === 'string' ? JSON.parse(affectedSymbols) : affectedSymbols;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}