import type Database from 'better-sqlite3';
import type { Symbol, Relationship } from '../../shared/types/api';
import { RippleEffectTracker, ImpactPrediction, RippleNode } from '../../analysis/ripple-effect-tracker.js';
import { ChangeImpactPredictor, ChangeScenario, ImpactVisualization } from '../../analysis/change-impact-predictor.js';
import { DrizzleDatabase, type DrizzleDb } from '../../database/drizzle-db.js';
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
  private drizzleDb: DrizzleDatabase;

  constructor(database: Database.Database | DrizzleDb) {
    // Create DrizzleDatabase wrapper
    this.drizzleDb = new DrizzleDatabase(database);
    
    // Get database path
    const rawDb = this.drizzleDb.getRawDb();
    this.dbPath = (rawDb as any).name || path.join(os.homedir(), '.module-sentinel', 'development.db');
    
    // Initialize advanced analyzers
    this.rippleTracker = new RippleEffectTracker(this.drizzleDb);
    this.changePredictor = new ChangeImpactPredictor(this.drizzleDb);
  }

  /**
   * Analyze data flow through a symbol
   */
  async analyzeDataFlow(symbolId: string): Promise<DataFlowNode> {
    // Get symbol details
    const symbol = await this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    // Get all relationships involving this symbol
    const incomingRels = await this.getIncomingRelationships(parseInt(symbolId));
    const outgoingRels = await this.getOutgoingRelationships(parseInt(symbolId));

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
    const symbol = await this.getSymbol(parseInt(symbolId));
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
    const symbol = await this.getSymbol(parseInt(symbolId));
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
    const symbol = await this.getSymbol(parseInt(symbolId));
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
        const impactNode = await this.createImpactNode(id, distance);
        
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

      const dependents = await this.getDependentSymbols(id);
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
    patterns.push(...await this.detectSingletonPattern());

    // Detect Factory pattern
    patterns.push(...await this.detectFactoryPattern());

    // Detect Observer pattern
    patterns.push(...await this.detectObserverPattern());

    // Detect anti-patterns
    patterns.push(...await this.detectAntiPatterns());

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
    const simulatedPaths = await this.generateExecutionPaths(parseInt(entryPoint), 10);

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
        const deps = await this.getDependentSymbols(nodeId);
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
    const symbol = await this.getSymbol(parseInt(symbolId));
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }

    const cyclomatic = symbol.complexity || 1;
    const cognitive = this.calculateCognitiveComplexity(symbol);
    const dataFlow = await this.calculateDataFlowComplexity(parseInt(symbolId));
    const architectural = await this.calculateArchitecturalComplexity(parseInt(symbolId));

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

  private async getSymbol(id: number): Promise<Symbol | null> {
    const symbol = await this.drizzleDb.getSymbol(id);
    if (!symbol) return null;
    return {
      id: symbol.id,
      name: symbol.name,
      qualified_name: symbol.qualifiedName || '',
      kind: symbol.kind,
      file_path: symbol.filePath,
      line: symbol.line,
      column: symbol.column,
      end_line: symbol.endLine,
      end_column: symbol.endColumn,
      return_type: symbol.returnType,
      signature: symbol.signature,
      visibility: symbol.visibility,
      namespace: symbol.namespace,
      parent_symbol_id: symbol.parentSymbolId,
      is_exported: symbol.isExported || false,
      is_async: symbol.isAsync || false,
      is_abstract: symbol.isAbstract || false,
      language_features: symbol.languageFeatures,
      semantic_tags: symbol.semanticTags,
      confidence: symbol.confidence || 1.0,
      created_at: symbol.createdAt || new Date().toISOString(),
      updated_at: symbol.updatedAt,
      language_id: symbol.languageId || 0,
      project_id: symbol.projectId || 0
    } as Symbol;
  }

  private async getIncomingRelationships(symbolId: number): Promise<Relationship[]> {
    const relationships = await this.drizzleDb.getIncomingRelationships(symbolId);
    return relationships.map(rel => ({
      id: rel.id,
      project_id: rel.projectId || 0,
      from_symbol_id: rel.fromSymbolId || 0,
      to_symbol_id: rel.toSymbolId || 0,
      type: rel.type,
      confidence: rel.confidence,
      context_line: rel.contextLine,
      context_column: rel.contextColumn,
      context_snippet: rel.contextSnippet,
      metadata: rel.metadata || undefined,
      created_at: rel.createdAt || new Date().toISOString()
    }));
  }

  private async getOutgoingRelationships(symbolId: number): Promise<Relationship[]> {
    const relationships = await this.drizzleDb.getOutgoingRelationships(symbolId);
    return relationships.map(rel => ({
      id: rel.id,
      project_id: rel.projectId || 0,
      from_symbol_id: rel.fromSymbolId || 0,
      to_symbol_id: rel.toSymbolId || 0,
      type: rel.type,
      confidence: rel.confidence,
      context_line: rel.contextLine,
      context_column: rel.contextColumn,
      context_snippet: rel.contextSnippet,
      metadata: rel.metadata || undefined,
      created_at: rel.createdAt || new Date().toISOString()
    }));
  }

  private async getDependentSymbols(symbolId: number): Promise<Symbol[]> {
    const symbols = await this.drizzleDb.getDependentSymbols(symbolId);
    return symbols.map(symbol => ({
      id: symbol.id,
      name: symbol.name,
      qualified_name: symbol.qualified_name || '',
      kind: symbol.kind,
      namespace: symbol.namespace || '',
      file_path: symbol.file_path,
      line: symbol.line,
      column: symbol.column,
      visibility: symbol.visibility || undefined,
      signature: symbol.signature || undefined,
      return_type: symbol.return_type || undefined,
      is_exported: symbol.is_exported ?? false,
      language_id: symbol.language_id,
      project_id: symbol.project_id
    }));
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

  private async createImpactNode(symbolId: number, distance: number): Promise<ImpactNode> {
    const symbol = await this.getSymbol(symbolId);
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

  private async detectSingletonPattern(): Promise<PatternAnalysis[]> {
    // Use DrizzleDatabase method
    const candidates = await this.drizzleDb.findSingletonPatterns();
    
    return candidates.map(symbol => ({
      patternType: 'Singleton',
      confidence: 0.8,
      nodes: [symbol.id],
      description: `${symbol.name} appears to implement the Singleton pattern`
    }));
  }

  private async detectFactoryPattern(): Promise<PatternAnalysis[]> {
    // Use DrizzleDatabase method
    const candidates = await this.drizzleDb.findFactoryPatterns();
    
    return candidates.map(symbol => ({
      patternType: 'Factory',
      confidence: 0.7,
      nodes: [symbol.id],
      description: `${symbol.name} appears to implement the Factory pattern`
    }));
  }

  private async detectObserverPattern(): Promise<PatternAnalysis[]> {
    // Use DrizzleDatabase method
    const candidates = await this.drizzleDb.findObserverPatterns();
    
    return candidates.map(symbol => ({
      patternType: 'Observer',
      confidence: 0.75,
      nodes: [symbol.id],
      description: `${symbol.name} appears to implement the Observer pattern`
    }));
  }

  private async detectAntiPatterns(): Promise<PatternAnalysis[]> {
    const patterns: PatternAnalysis[] = [];

    // God Class - classes with too many methods
    const godClasses = await this.drizzleDb.findGodClasses(20);
    
    patterns.push(...godClasses.map(symbol => ({
      patternType: 'God Class Anti-Pattern',
      confidence: 0.9,
      nodes: [symbol.id],
      description: `${symbol.name} has ${symbol.method_count} methods - consider breaking it down`,
      recommendation: 'Split into smaller, focused classes following Single Responsibility Principle'
    })));

    return patterns;
  }

  private async generateExecutionPaths(entryPoint: number, count: number): Promise<ExecutionPath[]> {
    const paths: ExecutionPath[] = [];
    
    for (let i = 0; i < count; i++) {
      const path = await this.tracePath(entryPoint, new Set(), []);
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

  private async tracePath(current: number, visited: Set<number>, path: number[]): Promise<number[]> {
    if (visited.has(current) || path.length > 20) {
      return path;
    }

    visited.add(current);
    path.push(current);

    const outgoing = await this.getOutgoingRelationships(current);
    if (outgoing.length === 0) {
      return path;
    }

    // Randomly pick a path
    const next = outgoing[Math.floor(Math.random() * outgoing.length)];
    return await this.tracePath(next.to_symbol_id, visited, path);
  }

  private calculateCognitiveComplexity(symbol: Symbol): number {
    // Use consolidated CodeMetricsAnalyzer instead of simplified calculation
    try {
      const { CodeMetricsAnalyzer } = require('../../analysis/code-metrics-analyzer.js');
      const analyzer = new CodeMetricsAnalyzer();
      
      const input = {
        symbol: {
          name: symbol.name,
          kind: symbol.kind,
          signature: symbol.signature
        },
        language: 'typescript', // Default for analytics service
        maxLines: 100
      };
      
      const metrics = analyzer.analyzeComplexity(input);
      return metrics.cognitiveComplexity;
    } catch (error) {
      // Fallback to simple calculation if consolidated analyzer fails
      let complexity = 1;
      if (symbol.depth) complexity += symbol.depth;
      if (symbol.name.includes('if') || symbol.name.includes('switch')) complexity += 2;
      return complexity;
    }
  }

  private async calculateDataFlowComplexity(symbolId: number): Promise<number> {
    const incoming = await this.getIncomingRelationships(symbolId);
    const outgoing = await this.getOutgoingRelationships(symbolId);
    
    return incoming.length + outgoing.length;
  }

  private async calculateArchitecturalComplexity(symbolId: number): Promise<number> {
    const dependencies = await this.getDependentSymbols(symbolId);
    const incoming = await this.getIncomingRelationships(symbolId);
    
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

  private async calculateTestCoverage(symbolId: string, impactAnalysis: ImpactAnalysis): Promise<any> {
    // Query code flow paths for coverage data using DrizzleDatabase
    const coverage = await this.drizzleDb.getCodeFlowCoverage(symbolId);
    
    // Get affected symbols that lack test coverage
    const affectedSymbols = [
      ...impactAnalysis.directImpact,
      ...impactAnalysis.indirectImpact
    ];
    
    const affectedSymbolIds = affectedSymbols.map(s => s.symbolId);
    const uncoveredSymbols = await this.drizzleDb.findUncoveredSymbols(affectedSymbolIds);

    const percentage = coverage?.avgCoverage || 0;
    
    return {
      affected: affectedSymbols.length,
      covered: affectedSymbols.length - uncoveredSymbols.length,
      percentage: Math.round(percentage * 100),
      uncoveredSymbols: uncoveredSymbols.map(s => ({
        id: s.id,
        name: s.name,
        qualifiedName: s.qualifiedName
      }))
    };
  }

  private async calculatePerformanceImpact(symbolId: string, impactAnalysis: ImpactAnalysis): Promise<any> {
    // Get complexity metrics for the symbol using DrizzleDatabase
    const complexity = await this.drizzleDb.getMethodComplexity(symbolId);
    
    // Get execution time estimates from call chains
    const execution = await this.drizzleDb.getExecutionTimeEstimates(symbolId);
    
    // Calculate estimated impact
    const baseLatency = execution?.avgExecutionTime || 10;
    const complexityFactor = complexity ? 
      ((complexity.cyclomaticComplexity || 0) + (complexity.cognitiveComplexity || 0)) / 20 : 1;
    const impactFactor = impactAnalysis.severityScore / 100;
    
    return {
      estimatedLatency: Math.round(baseLatency * complexityFactor * impactFactor),
      memoryDelta: Math.round(complexityFactor * 10), // Rough estimate
      cpuDelta: Math.round(complexityFactor * 5),
      ioOperations: complexity?.hasLoops ? 20 + Math.round(complexityFactor * 10) : 10
    };
  }

  private async calculateBuildImpact(symbolId: string, impactAnalysis: ImpactAnalysis): Promise<any> {
    // Get all affected files
    const affectedSymbolIds = [...impactAnalysis.directImpact, ...impactAnalysis.indirectImpact]
      .map(n => n.symbolId);
    
    const affectedFiles = await this.drizzleDb.getDistinctFilePaths(
      affectedSymbolIds.length > 0 ? affectedSymbolIds : [parseInt(symbolId)]
    );
    
    // Get dependencies
    const dependencies = await this.drizzleDb.getImportDependencies(symbolId);
    
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

  private async calculateTeamImpact(symbolId: string, impactAnalysis: ImpactAnalysis): Promise<any> {
    // Determine teams based on file paths and namespaces
    const affectedSymbols = [
      ...impactAnalysis.directImpact,
      ...impactAnalysis.indirectImpact
    ];
    
    const affectedSymbolIds = affectedSymbols.map(s => s.symbolId);
    const namespaces = await this.drizzleDb.getDistinctNamespaces(
      affectedSymbolIds.length > 0 ? affectedSymbolIds : [parseInt(symbolId)]
    );
    
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
      if (ns.namespace) {
        const namespace = ns.namespace.toLowerCase();
        for (const [key, team] of Object.entries(teamMap)) {
          if (namespace.includes(key)) {
            affectedTeams.add(team);
          }
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
    
    // Get pattern violations using DrizzleDatabase
    const violationCount = await this.drizzleDb.getAntiPatternViolations(symbolId);
    
    // Calculate stability based on relationships
    const stabilityScore = 100 - Math.min(90, impactAnalysis.severityScore);
    
    // Calculate testability based on complexity
    const testabilityScore = Math.max(10, 100 - complexityMetrics.totalScore);
    
    // Overall risk calculation
    const overall = Math.round(
      (impactAnalysis.severityScore * 0.4) +
      (complexityMetrics.totalScore * 0.3) +
      (violationCount * 10 * 0.2) +
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
    // Get complexity metrics using DrizzleDatabase
    const complexity = await this.drizzleDb.getMethodComplexity(symbolId.toString());
    
    // Get test coverage
    const coverage = await this.drizzleDb.getSymbolTestCoverage(symbolId.toString());
    
    // Get modification frequency (simplified - would need git integration)
    const modificationFrequency = Math.random() * 10; // Placeholder
    
    // Get bug density from semantic insights
    const bugCount = await this.drizzleDb.getBugCount(symbolId.toString());
    
    // Calculate health score
    const testCoverage = (coverage?.testCoverage || 0) * 100;
    const cyclomaticComplexity = complexity?.cyclomaticComplexity || 10;
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
      bugDensity: bugCount,
      technicalDebt: Math.round((100 - testCoverage) + cyclomaticComplexity + bugCount * 5)
    };
  }

  /**
   * Get data-driven recommendations based on semantic insights
   */
  async getImpactRecommendations(symbolId: string): Promise<any[]> {
    const impactAnalysis = await this.analyzeEnhancedImpact(symbolId);
    const recommendations: any[] = [];
    
    // Get semantic insights for the symbol using DrizzleDatabase
    const insights = await this.drizzleDb.getSemanticInsights(symbolId, 10);
    
    // Convert insights to recommendations
    insights.forEach((insight, index) => {
      recommendations.push({
        id: insight.id.toString(),
        type: this.mapInsightTypeToRecommendationType(insight.insightType),
        priority: this.mapSeverityToPriority(insight.severity),
        title: insight.title || this.generateRecommendationTitle(insight),
        reasoning: insight.reasoning || insight.description,
        estimatedEffort: this.estimateEffortHours(insight),
        riskReduction: Math.round(insight.confidence * 30),
        suggestedApproach: this.parseSuggestedApproach(insight.reasoning), // Use reasoning as suggestions fallback
        affectedSymbols: this.parseAffectedSymbols(insight.affectedSymbols),
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
      'refactoring_opportunity': `Refactor ${insight.sourceContext || 'code'}`,
      'test_coverage_gap': `Add tests for ${insight.sourceContext || 'uncovered code'}`,
      'documentation_needed': `Document ${insight.sourceContext || 'API'}`,
      'performance_concern': `Optimize ${insight.sourceContext || 'performance bottleneck'}`,
      'security_vulnerability': `Fix security issue in ${insight.sourceContext || 'code'}`,
      'architectural_violation': `Fix architectural violation in ${insight.sourceContext || 'module'}`,
      'code_duplication': `Remove duplication in ${insight.sourceContext || 'code'}`,
      'complexity_warning': `Reduce complexity in ${insight.sourceContext || 'method'}`
    };
    
    return titles[insight.insightType] || 'Improve code quality';
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
    
    return effortMap[insight.insightType] || 4;
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