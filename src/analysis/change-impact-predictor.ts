/**
 * Change Impact Prediction Visualization
 *
 * Advanced visualization system for predicting and displaying the ripple effects
 * of code changes across the architectural landscape. Integrates with the
 * ripple effect tracker to provide interactive impact analysis.
 */

import { DrizzleDatabase } from "../database/drizzle-db.js";
import {
  RippleEffectTracker,
  ImpactPrediction,
} from "./ripple-effect-tracker.js";

export interface ChangeScenario {
  id: string;
  name: string;
  description: string;
  targetSymbol: string;
  changeType: "type" | "value" | "signature" | "dependency" | "removal";
  simulatedChange: {
    from: any;
    to: any;
    description: string;
  };
  probability: number; // 0-1 likelihood this change will happen
  businessImpact: "low" | "medium" | "high" | "critical";
  timeframe: "immediate" | "short-term" | "medium-term" | "long-term";
}

export interface ImpactVisualization {
  scenario: ChangeScenario;
  prediction: ImpactPrediction;
  visualization: {
    networkData: {
      nodes: Array<{
        id: string;
        label: string;
        level: number;
        impact: number;
        type: string;
        stage: string;
        position: { x: number; y: number };
      }>;
      edges: Array<{
        source: string;
        target: string;
        impact: number;
        type: string;
      }>;
    };
    heatmapData: {
      stages: string[];
      impacts: number[][];
      labels: string[];
    };
    timelineData: {
      phases: Array<{
        name: string;
        duration: number;
        tasks: string[];
        risk: number;
      }>;
    };
  };
}

export interface ComparisonAnalysis {
  scenarios: ChangeScenario[];
  comparisons: Array<{
    scenario1: string;
    scenario2: string;
    riskDifference: number;
    timelineDifference: number;
    complexityDifference: number;
    recommendation: string;
  }>;
  optimalPath: {
    scenarioId: string;
    reasoning: string;
    prerequisites: string[];
    mitigationStrategies: string[];
  };
}

export class ChangeImpactPredictor {
  private drizzleDb: DrizzleDatabase;
  private rippleTracker: RippleEffectTracker;
  private predictionCache = new Map<string, ImpactPrediction>();

  constructor(drizzleDb: DrizzleDatabase) {
    this.drizzleDb = drizzleDb;
    this.rippleTracker = new RippleEffectTracker(drizzleDb);
  }

  /**
   * Create and analyze multiple change scenarios
   */
  async createChangeScenarios(targetSymbol: string): Promise<ChangeScenario[]> {
    // Get symbol details to understand what kinds of changes are possible
    const symbol = await this.getSymbolDetails(targetSymbol);
    if (!symbol) {
      throw new Error(`Symbol ${targetSymbol} not found`);
    }

    const scenarios: ChangeScenario[] = [];

    // Generate type change scenarios
    if (symbol.type === "struct" || symbol.type === "class") {
      scenarios.push({
        id: `type_scale_${symbol.name}`,
        name: "Scale Value Type Change",
        description: `Change scale value from int to float in ${symbol.name}`,
        targetSymbol,
        changeType: "type",
        simulatedChange: {
          from: "int scale = 55",
          to: "float scale = 0.75f",
          description: "Converting integer scale to float for more precision",
        },
        probability: 0.7,
        businessImpact: "medium",
        timeframe: "short-term",
      });

      scenarios.push({
        id: `member_addition_${symbol.name}`,
        name: "Add New Member Variable",
        description: `Add new member variable to ${symbol.name}`,
        targetSymbol,
        changeType: "signature",
        simulatedChange: {
          from: "existing members",
          to: "existing + new member",
          description: "Adding new configuration parameter",
        },
        probability: 0.5,
        businessImpact: "low",
        timeframe: "medium-term",
      });
    }

    // Generate function signature scenarios
    if (symbol.type === "function" || symbol.type === "method") {
      scenarios.push({
        id: `signature_${symbol.name}`,
        name: "Function Signature Change",
        description: `Modify function signature of ${symbol.name}`,
        targetSymbol,
        changeType: "signature",
        simulatedChange: {
          from: "current parameters",
          to: "additional optional parameter",
          description: "Adding optional parameter for enhanced functionality",
        },
        probability: 0.6,
        businessImpact: "medium",
        timeframe: "short-term",
      });
    }

    // Generate removal scenarios
    scenarios.push({
      id: `deprecation_${symbol.name}`,
      name: "Symbol Deprecation",
      description: `Deprecate and eventually remove ${symbol.name}`,
      targetSymbol,
      changeType: "removal",
      simulatedChange: {
        from: "active symbol",
        to: "deprecated -> removed",
        description: "Phased removal due to architectural evolution",
      },
      probability: 0.3,
      businessImpact: "high",
      timeframe: "long-term",
    });

    // Generate dependency change scenarios
    scenarios.push({
      id: `dependency_${symbol.name}`,
      name: "Dependency Refactoring",
      description: `Refactor dependencies of ${symbol.name}`,
      targetSymbol,
      changeType: "dependency",
      simulatedChange: {
        from: "current dependencies",
        to: "optimized dependencies",
        description: "Reducing coupling and improving modularity",
      },
      probability: 0.4,
      businessImpact: "medium",
      timeframe: "medium-term",
    });

    return scenarios;
  }

  /**
   * Analyze impact for a specific scenario
   */
  async analyzeScenarioImpact(
    scenario: ChangeScenario
  ): Promise<ImpactVisualization> {
    // Get or calculate impact prediction
    let prediction = this.predictionCache.get(scenario.id);
    if (!prediction) {
      prediction = await this.rippleTracker.predictImpact(
        scenario.targetSymbol,
        scenario.changeType,
        scenario.simulatedChange
      );
      this.predictionCache.set(scenario.id, prediction);
    }

    // Generate visualization data
    const visualization = await this.generateVisualizationData(
      scenario,
      prediction
    );

    return {
      scenario,
      prediction,
      visualization,
    };
  }

  /**
   * Compare multiple scenarios and find optimal implementation path
   */
  async compareScenarios(
    scenarios: ChangeScenario[]
  ): Promise<ComparisonAnalysis> {
    const comparisons: ComparisonAnalysis["comparisons"] = [];

    // Analyze each scenario
    const scenarioAnalyses = await Promise.all(
      scenarios.map((scenario) => this.analyzeScenarioImpact(scenario))
    );

    // Generate pairwise comparisons
    for (let i = 0; i < scenarios.length; i++) {
      for (let j = i + 1; j < scenarios.length; j++) {
        const analysis1 = scenarioAnalyses[i];
        const analysis2 = scenarioAnalyses[j];

        const riskDiff =
          analysis2.prediction.riskAssessment.overall -
          analysis1.prediction.riskAssessment.overall;
        const timeDiff =
          this.calculateTotalTime(analysis2.prediction) -
          this.calculateTotalTime(analysis1.prediction);
        const complexityDiff =
          this.calculateComplexity(analysis2.prediction) -
          this.calculateComplexity(analysis1.prediction);

        comparisons.push({
          scenario1: scenarios[i].id,
          scenario2: scenarios[j].id,
          riskDifference: riskDiff,
          timelineDifference: timeDiff,
          complexityDifference: complexityDiff,
          recommendation: this.generateComparisonRecommendation(
            riskDiff,
            timeDiff,
            complexityDiff
          ),
        });
      }
    }

    // Find optimal path
    const optimalPath = this.findOptimalPath(scenarios, scenarioAnalyses);

    return {
      scenarios,
      comparisons,
      optimalPath,
    };
  }

  private async getSymbolDetails(symbolName: string): Promise<any> {
    const symbol = await this.drizzleDb.getSymbolDetailsForImpact(symbolName);
    if (symbol) {
      return {
        id: symbol.id,
        name: symbol.name,
        qualified_name: symbol.qualifiedName,
        file_path: symbol.filePath,
        type: symbol.kind,
        pipeline_stage: "analysis", // Universal symbols don't have pipeline_stage
        semantic_tags: symbol.semanticTags,
        confidence: symbol.confidence
      };
    }
    return null;
  }

  private async generateVisualizationData(
    scenario: ChangeScenario,
    prediction: ImpactPrediction
  ): Promise<ImpactVisualization["visualization"]> {
    // Generate network data for node-link visualization
    const networkData = this.generateNetworkData(prediction);

    // Generate heatmap data for stage impact visualization
    const heatmapData = this.generateHeatmapData(prediction);

    // Generate timeline data for implementation planning
    const timelineData = this.generateTimelineData(prediction);

    return {
      networkData,
      heatmapData,
      timelineData,
    };
  }

  /**
   * Map RippleNode type to string for visualization
   */
  private mapNodeTypeToString(nodeType: any): string {
    // Handle the case where nodeType might be from RippleNode union type
    if (typeof nodeType === 'string') {
      return nodeType;
    }
    
    // Default fallback
    return 'function';
  }

  private generateNetworkData(
    prediction: ImpactPrediction
  ): ImpactVisualization["visualization"]["networkData"] {
    // Use the exact type expected by the return interface
    const nodes: Array<{
      id: string;
      label: string;
      level: number;
      impact: number;
      type: string;
      stage: string;
      position: { x: number; y: number };
    }> = [];
    const edges: any[] = [];

    // Add source node
    nodes.push({
      id: prediction.changedSymbol,
      label:
        prediction.changedSymbol.split("::").pop() || prediction.changedSymbol,
      level: 0,
      impact: 10,
      type: "source",
      stage: "origin",
      position: { x: 0, y: 0 },
    });

    // Add affected nodes with layout positions
    const maxLevel = Math.max(
      0,
      ...prediction.affectedNodes.map((n: any) => n.propagationPath.length)
    );

    // Group nodes by level for better circular layout
    const nodesByLevel = new Map<number, any[]>();
    prediction.affectedNodes.forEach((node: any) => {
      const level = node.propagationPath.length;
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, []);
      }
      nodesByLevel.get(level)!.push(node);
    });

    prediction.affectedNodes.forEach((affectedNode: any, globalIndex: number) => {
      const level = affectedNode.propagationPath.length;
      const nodesAtLevel = nodesByLevel.get(level)!;
      const indexAtLevel = nodesAtLevel.indexOf(affectedNode);
      
      // Distribute nodes evenly around the circle at each level
      // Add a small rotation offset based on global index to create a spiral effect
      const spiralOffset = (globalIndex * 0.1) % (2 * Math.PI);
      const angle = (indexAtLevel / nodesAtLevel.length) * 2 * Math.PI + spiralOffset;
      
      // Scale radius based on max level to ensure good spacing
      const baseRadius = 150;
      const radiusIncrement = maxLevel > 0 ? Math.min(100, 400 / maxLevel) : 100;
      // Add small radius variation based on global index to prevent exact overlaps
      const radiusVariation = (globalIndex % 3) * 5;
      const radius = baseRadius + level * radiusIncrement + radiusVariation;

      nodes.push({
        id: affectedNode.node.id,
        label: affectedNode.node.name,
        level,
        impact: affectedNode.impactSeverity,
        type: this.mapNodeTypeToString(affectedNode.node.type) || "function",
        stage: affectedNode.node.stage,
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        },
      });

      // Add edge from previous node in propagation path
      const sourceId =
        affectedNode.propagationPath.length > 1
          ? affectedNode.propagationPath[
              affectedNode.propagationPath.length - 2
            ]
          : prediction.changedSymbol;

      edges.push({
        source: sourceId,
        target: affectedNode.node.id,
        impact: affectedNode.impactSeverity,
        type: "propagation",
      });
    });

    return { nodes, edges };
  }

  private generateHeatmapData(
    prediction: ImpactPrediction
  ): ImpactVisualization["visualization"]["heatmapData"] {
    // Group affected nodes by stage
    const stageGroups = new Map<string, number[]>();

    for (const affectedNode of prediction.affectedNodes) {
      const stage = affectedNode.node.stage;
      if (!stageGroups.has(stage)) {
        stageGroups.set(stage, []);
      }
      stageGroups.get(stage)!.push(affectedNode.impactSeverity);
    }

    const stages = Array.from(stageGroups.keys()).sort();
    const impacts: number[][] = [];
    const labels: string[] = [];

    // Create impact matrix
    stages.forEach((stage) => {
      const stageImpacts = stageGroups.get(stage) || [];
      const avgImpact =
        stageImpacts.reduce((sum, impact) => sum + impact, 0) /
        stageImpacts.length;
      const maxImpact = Math.max(...stageImpacts);
      const nodeCount = stageImpacts.length;

      impacts.push([avgImpact, maxImpact, nodeCount]);
      labels.push(`${stage} (${nodeCount} nodes)`);
    });

    return {
      stages,
      impacts,
      labels,
    };
  }

  private generateTimelineData(
    prediction: ImpactPrediction
  ): ImpactVisualization["visualization"]["timelineData"] {
    // Group tasks by estimated time ranges
    const phases = [
      {
        name: "Immediate Actions",
        duration: 0,
        tasks: [] as string[],
        risk: 0,
      },
      {
        name: "Short-term (1-7 days)",
        duration: 0,
        tasks: [] as string[],
        risk: 0,
      },
      {
        name: "Medium-term (1-4 weeks)",
        duration: 0,
        tasks: [] as string[],
        risk: 0,
      },
      {
        name: "Long-term (1+ months)",
        duration: 0,
        tasks: [] as string[],
        risk: 0,
      },
    ];

    // Categorize affected nodes by fix time
    for (const affectedNode of prediction.affectedNodes) {
      const fixTime = affectedNode.estimatedFixTime;
      const taskDesc = `Fix ${affectedNode.node.name} (${fixTime}min)`;

      if (fixTime <= 30) {
        phases[0].tasks.push(taskDesc);
        phases[0].duration += fixTime;
        phases[0].risk += affectedNode.impactSeverity * 0.1;
      } else if (fixTime <= 240) {
        // 4 hours
        phases[1].tasks.push(taskDesc);
        phases[1].duration += fixTime;
        phases[1].risk += affectedNode.impactSeverity * 0.1;
      } else if (fixTime <= 2400) {
        // 40 hours
        phases[2].tasks.push(taskDesc);
        phases[2].duration += fixTime;
        phases[2].risk += affectedNode.impactSeverity * 0.1;
      } else {
        phases[3].tasks.push(taskDesc);
        phases[3].duration += fixTime;
        phases[3].risk += affectedNode.impactSeverity * 0.1;
      }
    }

    // Add general recommendations to each phase
    phases[0].tasks.unshift(
      "Review change requirements",
      "Prepare development environment"
    );
    phases[1].tasks.push("Run comprehensive tests", "Update documentation");
    phases[2].tasks.push("Performance testing", "Integration testing");
    phases[3].tasks.push("User acceptance testing", "Gradual rollout");

    return { phases };
  }

  private calculateTotalTime(prediction: ImpactPrediction): number {
    return prediction.affectedNodes.reduce(
      (sum: number, node: any) => sum + node.estimatedFixTime,
      0
    );
  }

  private calculateComplexity(prediction: ImpactPrediction): number {
    const uniqueStages = new Set(
      prediction.affectedNodes.map((n: any) => n.node.stage)
    ).size;
    const avgImpact =
      prediction.affectedNodes.reduce(
        (sum: number, n: any) => sum + n.impactSeverity,
        0
      ) / prediction.affectedNodes.length;
    const pathComplexity = Math.max(
      ...prediction.affectedNodes.map((n: any) => n.propagationPath.length)
    );

    return uniqueStages + avgImpact + pathComplexity;
  }

  private generateComparisonRecommendation(
    riskDiff: number,
    timeDiff: number,
    complexityDiff: number
  ): string {
    if (riskDiff > 2) {
      return "Second scenario has significantly higher risk";
    } else if (riskDiff < -2) {
      return "First scenario has significantly higher risk";
    } else if (timeDiff > 120) {
      // 2 hours
      return "Second scenario requires significantly more time";
    } else if (timeDiff < -120) {
      return "First scenario requires significantly more time";
    } else if (complexityDiff > 3) {
      return "Second scenario is significantly more complex";
    } else if (complexityDiff < -3) {
      return "First scenario is significantly more complex";
    } else {
      return "Scenarios have similar impact profiles";
    }
  }

  private findOptimalPath(
    scenarios: ChangeScenario[],
    analyses: ImpactVisualization[]
  ): ComparisonAnalysis["optimalPath"] {
    // Score scenarios based on risk, time, and business impact
    const scoredScenarios = scenarios.map((scenario, index) => {
      const analysis = analyses[index];
      const risk = analysis.prediction.riskAssessment.overall;
      const time = this.calculateTotalTime(analysis.prediction);
      const complexity = this.calculateComplexity(analysis.prediction);

      // Lower is better for risk, time, and complexity
      let score = 10 - risk + (1000 - time) / 100 + (20 - complexity);

      // Adjust for business impact
      switch (scenario.businessImpact) {
        case "critical":
          score += 5;
          break;
        case "high":
          score += 3;
          break;
        case "medium":
          score += 1;
          break;
        case "low":
          score -= 1;
          break;
      }

      // Adjust for timeframe urgency
      switch (scenario.timeframe) {
        case "immediate":
          score += 4;
          break;
        case "short-term":
          score += 2;
          break;
        case "medium-term":
          score += 0;
          break;
        case "long-term":
          score -= 2;
          break;
      }

      return { scenario, analysis, score };
    });

    // Find highest scoring scenario
    const optimal = scoredScenarios.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    return {
      scenarioId: optimal.scenario.id,
      reasoning:
        `Selected based on optimal balance of risk (${optimal.analysis.prediction.riskAssessment.overall.toFixed(
          1
        )}), ` +
        `time (${this.calculateTotalTime(
          optimal.analysis.prediction
        )}min), and business impact (${optimal.scenario.businessImpact})`,
      prerequisites: [
        "Complete thorough impact analysis",
        "Ensure comprehensive test coverage",
        "Plan rollback strategy",
        "Coordinate with affected teams",
      ],
      mitigationStrategies: optimal.analysis.prediction.recommendations,
    };
  }

  /**
   * Generate interactive HTML visualization for impact prediction
   */
  async generateImpactVisualizationHTML(
    analysis: ImpactVisualization
  ): Promise<string> {
    const { scenario, prediction, visualization } = analysis;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Impact Prediction: ${scenario.name}</title>
    <script src="https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #0a0a0a;
            color: #e0e0e0;
        }
        
        .container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto 1fr 1fr;
            height: 100vh;
            gap: 20px;
            padding: 20px;
        }
        
        .header {
            grid-column: 1 / -1;
            background: rgba(20, 20, 30, 0.9);
            padding: 20px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
        }
        
        .header h1 {
            margin: 0;
            font-size: 24px;
            color: #fff;
        }
        
        .header .subtitle {
            color: #888;
            margin-top: 5px;
        }
        
        .scenario-info {
            background: rgba(255, 255, 255, 0.05);
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
        }
        
        .network-view {
            background: rgba(20, 20, 30, 0.9);
            border-radius: 10px;
            backdrop-filter: blur(10px);
            position: relative;
            overflow: hidden;
        }
        
        .timeline-view {
            background: rgba(20, 20, 30, 0.9);
            border-radius: 10px;
            backdrop-filter: blur(10px);
            padding: 20px;
            overflow-y: auto;
        }
        
        .heatmap-view {
            background: rgba(20, 20, 30, 0.9);
            border-radius: 10px;
            backdrop-filter: blur(10px);
            padding: 20px;
        }
        
        .metrics-view {
            background: rgba(20, 20, 30, 0.9);
            border-radius: 10px;
            backdrop-filter: blur(10px);
            padding: 20px;
        }
        
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #4ecdc4;
        }
        
        .metric-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 10px;
        }
        
        .metric-value {
            font-size: 24px;
            font-weight: 600;
            color: #fff;
        }
        
        .metric-label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
        }
        
        .timeline-phase {
            background: rgba(255, 255, 255, 0.05);
            border-left: 4px solid #4ecdc4;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 0 8px 8px 0;
        }
        
        .phase-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .phase-name {
            font-weight: 600;
            color: #fff;
        }
        
        .phase-duration {
            background: #4ecdc4;
            color: #000;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .task-list {
            list-style: none;
            padding: 0;
        }
        
        .task-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 8px;
            margin-bottom: 4px;
            border-radius: 4px;
            font-size: 13px;
        }
        
        .risk-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .risk-low { background: #66bb6a; }
        .risk-medium { background: #ffa726; }
        .risk-high { background: #ff6b6b; }
        
        .heatmap-cell {
            fill: #333;
            stroke: #555;
            stroke-width: 1;
        }
        
        .heatmap-text {
            fill: #fff;
            font-size: 10px;
            text-anchor: middle;
        }
        
        #networkGraph {
            width: 100%;
            height: 100%;
        }
        
        .controls {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 6px;
        }
        
        .controls button {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 5px;
            font-size: 12px;
        }
        
        .controls button:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Change Impact Prediction</h1>
            <div class="subtitle">${scenario.description}</div>
            
            <div class="scenario-info">
                <strong>Change Type:</strong> ${scenario.changeType} • 
                <strong>Business Impact:</strong> ${scenario.businessImpact} • 
                <strong>Timeframe:</strong> ${scenario.timeframe} • 
                <strong>Probability:</strong> ${(
                  scenario.probability * 100
                ).toFixed(0)}%
                <br><br>
                <strong>Simulated Change:</strong> ${
                  scenario.simulatedChange.description
                }
            </div>
        </div>
        
        <div class="network-view">
            <div class="controls">
                <button onclick="cy.fit()">Fit View</button>
                <button onclick="cy.reset()">Reset</button>
                <button onclick="toggleHighImpact()">High Impact Only</button>
            </div>
            <div id="networkGraph"></div>
        </div>
        
        <div class="timeline-view">
            <div class="section-title">Implementation Timeline</div>
            ${visualization.timelineData.phases
              .map(
                (phase) => `
                <div class="timeline-phase">
                    <div class="phase-header">
                        <span class="phase-name">${phase.name}</span>
                        <span class="phase-duration">${Math.round(
                          phase.duration / 60
                        )}h</span>
                    </div>
                    <ul class="task-list">
                        ${phase.tasks
                          .slice(0, 5)
                          .map(
                            (task) => `
                            <li class="task-item">
                                <span class="risk-indicator ${
                                  phase.risk > 5
                                    ? "risk-high"
                                    : phase.risk > 2
                                    ? "risk-medium"
                                    : "risk-low"
                                }"></span>
                                ${task}
                            </li>
                        `
                          )
                          .join("")}
                    </ul>
                </div>
            `
              )
              .join("")}
        </div>
        
        <div class="heatmap-view">
            <div class="section-title">Stage Impact Heatmap</div>
            <svg id="heatmap" width="100%" height="300"></svg>
        </div>
        
        <div class="metrics-view">
            <div class="section-title">Impact Metrics</div>
            
            <div class="metric-card">
                <div class="metric-value">${prediction.riskAssessment.overall.toFixed(
                  1
                )}/10</div>
                <div class="metric-label">Overall Risk Score</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${
                  prediction.affectedNodes.length
                }</div>
                <div class="metric-label">Affected Components</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${Math.round(
                  prediction.affectedNodes.reduce(
                    (sum: number, n: any) => sum + n.estimatedFixTime,
                    0
                  ) / 60
                )}</div>
                <div class="metric-label">Estimated Hours</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${
                  prediction.riskAssessment.breakingChanges
                }</div>
                <div class="metric-label">Breaking Changes</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value">${
                  prediction.riskAssessment.reviewersNeeded.length
                }</div>
                <div class="metric-label">Reviewers Needed</div>
            </div>
        </div>
    </div>
    
    <script>
        // Network graph
        const networkData = ${JSON.stringify(visualization.networkData)};
        let cy;
        
        function initNetworkGraph() {
            cy = cytoscape({
                container: document.getElementById('networkGraph'),
                elements: [
                    ...networkData.nodes.map(node => ({
                        data: { 
                            id: node.id, 
                            label: node.label,
                            impact: node.impact,
                            level: node.level,
                            type: node.type,
                            stage: node.stage
                        },
                        position: { x: node.position.x + 400, y: node.position.y + 300 }
                    })),
                    ...networkData.edges.map(edge => ({
                        data: { 
                            id: edge.source + '-' + edge.target,
                            source: edge.source, 
                            target: edge.target,
                            impact: edge.impact
                        }
                    }))
                ],
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'background-color': ele => {
                                if (ele.data('type') === 'source') return '#ff4757';
                                const impact = ele.data('impact');
                                if (impact >= 8) return '#ff6b6b';
                                if (impact >= 6) return '#ffa726';
                                if (impact >= 4) return '#66bb6a';
                                return '#42a5f5';
                            },
                            'width': ele => 30 + Math.sqrt(ele.data('impact')) * 6,
                            'height': ele => 30 + Math.sqrt(ele.data('impact')) * 6,
                            'font-size': '10px',
                            'color': '#fff',
                            'text-outline-color': '#000',
                            'text-outline-width': 2,
                            'border-width': 2,
                            'border-color': '#fff'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': ele => Math.max(1, ele.data('impact') / 2),
                            'line-color': ele => {
                                const impact = ele.data('impact');
                                if (impact >= 8) return '#ff6b6b';
                                if (impact >= 6) return '#ffa726';
                                return '#66bb6a';
                            },
                            'target-arrow-color': ele => {
                                const impact = ele.data('impact');
                                if (impact >= 8) return '#ff6b6b';
                                if (impact >= 6) return '#ffa726';
                                return '#66bb6a';
                            },
                            'target-arrow-shape': 'triangle',
                            'curve-style': 'bezier',
                            'opacity': 0.7
                        }
                    },
                    {
                        selector: '.highlighted',
                        style: {
                            'background-color': '#4ecdc4',
                            'border-color': '#4ecdc4',
                            'border-width': 4
                        }
                    },
                    {
                        selector: '.dimmed',
                        style: {
                            'opacity': 0.3
                        }
                    }
                ],
                layout: {
                    name: 'preset'
                }
            });
            
            cy.on('tap', 'node', function(evt) {
                const node = evt.target;
                cy.elements().removeClass('highlighted').addClass('dimmed');
                node.removeClass('dimmed').addClass('highlighted');
                node.neighborhood().removeClass('dimmed');
            });
            
            cy.on('tap', function(evt) {
                if (evt.target === cy) {
                    cy.elements().removeClass('dimmed highlighted');
                }
            });
        }
        
        function toggleHighImpact() {
            const highImpactNodes = cy.nodes().filter(node => node.data('impact') >= 7);
            const lowImpactNodes = cy.nodes().filter(node => node.data('impact') < 7);
            
            if (lowImpactNodes.hidden().length > 0) {
                cy.elements().show();
            } else {
                lowImpactNodes.hide();
                cy.edges().forEach(edge => {
                    if (edge.source().hidden() || edge.target().hidden()) {
                        edge.hide();
                    }
                });
            }
        }
        
        // Heatmap
        function initHeatmap() {
            const heatmapData = ${JSON.stringify(visualization.heatmapData)};
            const svg = d3.select('#heatmap');
            const width = 400;
            const height = 250;
            
            svg.attr('viewBox', \`0 0 \${width} \${height}\`);
            
            const cellWidth = width / heatmapData.impacts[0].length;
            const cellHeight = height / heatmapData.stages.length;
            
            // Color scale
            const maxImpact = d3.max(heatmapData.impacts.flat());
            const colorScale = d3.scaleSequential(d3.interpolateReds)
                .domain([0, maxImpact]);
            
            // Draw cells
            heatmapData.stages.forEach((stage, i) => {
                heatmapData.impacts[i].forEach((impact, j) => {
                    svg.append('rect')
                        .attr('class', 'heatmap-cell')
                        .attr('x', j * cellWidth)
                        .attr('y', i * cellHeight)
                        .attr('width', cellWidth)
                        .attr('height', cellHeight)
                        .attr('fill', colorScale(impact));
                    
                    svg.append('text')
                        .attr('class', 'heatmap-text')
                        .attr('x', j * cellWidth + cellWidth / 2)
                        .attr('y', i * cellHeight + cellHeight / 2 + 3)
                        .text(impact.toFixed(1));
                });
            });
            
            // Add labels
            heatmapData.stages.forEach((stage, i) => {
                svg.append('text')
                    .attr('x', -5)
                    .attr('y', i * cellHeight + cellHeight / 2 + 3)
                    .attr('text-anchor', 'end')
                    .attr('fill', '#ccc')
                    .attr('font-size', '10px')
                    .text(stage);
            });
        }
        
        // Initialize visualizations
        initNetworkGraph();
        initHeatmap();
    </script>
</body>
</html>`;
  }

  /**
   * Generate scenario comparison HTML
   */
  async generateComparisonHTML(
    comparison: ComparisonAnalysis
  ): Promise<string> {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Change Scenario Comparison</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #0a0a0a;
            color: #e0e0e0;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .header h1 {
            color: #4ecdc4;
            margin-bottom: 10px;
        }
        
        .optimal-path {
            background: rgba(78, 205, 196, 0.1);
            border: 2px solid #4ecdc4;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
        }
        
        .comparison-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .scenario-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .chart-container {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
        }
        
        .metric {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 4px;
        }
        
        .optimal-indicator {
            display: inline-block;
            background: #4ecdc4;
            color: #000;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Change Scenario Comparison</h1>
        <p>Comprehensive analysis of implementation options and their impacts</p>
    </div>
    
    <div class="optimal-path">
        <h2>🎯 Recommended Path</h2>
        <p><strong>Scenario:</strong> ${comparison.optimalPath.scenarioId}</p>
        <p><strong>Reasoning:</strong> ${comparison.optimalPath.reasoning}</p>
        <h3>Prerequisites:</h3>
        <ul>
            ${comparison.optimalPath.prerequisites
              .map((req) => `<li>${req}</li>`)
              .join("")}
        </ul>
        <h3>Mitigation Strategies:</h3>
        <ul>
            ${comparison.optimalPath.mitigationStrategies
              .map((strategy) => `<li>${strategy}</li>`)
              .join("")}
        </ul>
    </div>
    
    <div class="chart-container">
        <h3>Risk vs Time Comparison</h3>
        <canvas id="comparisonChart" width="400" height="200"></canvas>
    </div>
    
    <div class="comparison-grid">
        ${comparison.scenarios
          .map(
            (scenario) => `
            <div class="scenario-card">
                <h3>${scenario.name} ${
              scenario.id === comparison.optimalPath.scenarioId
                ? '<span class="optimal-indicator">OPTIMAL</span>'
                : ""
            }</h3>
                <p>${scenario.description}</p>
                
                <div class="metric">
                    <span>Business Impact:</span>
                    <span>${scenario.businessImpact}</span>
                </div>
                <div class="metric">
                    <span>Timeframe:</span>
                    <span>${scenario.timeframe}</span>
                </div>
                <div class="metric">
                    <span>Probability:</span>
                    <span>${(scenario.probability * 100).toFixed(0)}%</span>
                </div>
                
                <h4>Change Details:</h4>
                <p><strong>From:</strong> ${scenario.simulatedChange.from}</p>
                <p><strong>To:</strong> ${scenario.simulatedChange.to}</p>
            </div>
        `
          )
          .join("")}
    </div>
    
    <script>
        const ctx = document.getElementById('comparisonChart').getContext('2d');
        
        // Simplified chart data - in reality would be calculated from predictions
        const chartData = {
            datasets: [{
                label: 'Scenarios',
                data: ${JSON.stringify(
                  comparison.scenarios.map((scenario, _index) => ({
                    x: Math.random() * 10, // Risk score
                    y: Math.random() * 500, // Time estimate
                    label: scenario.name,
                  }))
                )},
                backgroundColor: 'rgba(78, 205, 196, 0.7)',
                borderColor: '#4ecdc4',
                borderWidth: 2
            }]
        };
        
        new Chart(ctx, {
            type: 'scatter',
            data: chartData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e0e0'
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Risk Score',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Implementation Time (minutes)',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#e0e0e0' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }

  close(): void {
    this.rippleTracker.close();
    this.drizzleDb.close();
  }
}
