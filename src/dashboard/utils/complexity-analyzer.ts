/**
 * Dashboard Complexity Analyzer Module
 * 
 * Dashboard-specific wrapper for the consolidated CodeMetricsAnalyzer.
 * Provides backward compatibility while eliminating code duplication.
 */

import { CodeMetricsAnalyzer, MetricsInput, ComplexityMetrics as CoreComplexityMetrics } from '../../analysis/code-metrics-analyzer.js';

// Dashboard-specific interface for backward compatibility
export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  paramCount: number;
  localVariables: number;
  returnPoints: number;
  halsteadMetrics?: HalsteadMetrics;
  maintainabilityIndex?: number;
}

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  volume: number;
  difficulty: number;
  effort: number;
  time: number;
  bugs: number;
}

export interface ComplexityInput {
  nodes: any[];
  edges: any[];
  blocks: any[];
  symbol: any;
  code?: string;
}

export class ComplexityAnalyzer {
  private coreAnalyzer: CodeMetricsAnalyzer;

  constructor() {
    this.coreAnalyzer = new CodeMetricsAnalyzer();
  }

  /**
   * Analyze complexity metrics for given control flow
   * Now uses the consolidated CodeMetricsAnalyzer
   */
  analyze(input: ComplexityInput): ComplexityMetrics {
    // Prepare input for the consolidated analyzer
    const metricsInput: MetricsInput = {
      nodes: input.nodes,
      edges: input.edges,
      blocks: input.blocks,
      symbol: input.symbol,
      source: input.code,
      language: 'typescript' // Dashboard typically analyzes TypeScript/JavaScript
    };

    // Use consolidated analyzer
    const coreMetrics = this.coreAnalyzer.analyzeComplexity(metricsInput);

    // Transform to dashboard-compatible format
    return this.transformToDashboardFormat(coreMetrics, input);
  }

  /**
   * Transform core metrics to dashboard-compatible format
   */
  private transformToDashboardFormat(coreMetrics: CoreComplexityMetrics, input: ComplexityInput): ComplexityMetrics {
    return {
      cyclomaticComplexity: coreMetrics.cyclomaticComplexity,
      cognitiveComplexity: coreMetrics.cognitiveComplexity,
      nestingDepth: coreMetrics.nestingDepth,
      paramCount: coreMetrics.parameterCount,
      localVariables: coreMetrics.localVariables || this.estimateLocalVariables(input),
      returnPoints: coreMetrics.returnPoints || this.countReturnPoints(input),
      halsteadMetrics: {
        vocabulary: coreMetrics.halstead.vocabulary,
        length: coreMetrics.halstead.length,
        volume: Math.round(coreMetrics.halstead.volume),
        difficulty: Math.round(coreMetrics.halstead.difficulty * 10) / 10,
        effort: Math.round(coreMetrics.halstead.effort),
        time: Math.round(coreMetrics.halstead.timeToImplement),
        bugs: Math.round(coreMetrics.halstead.bugs * 100) / 100
      },
      maintainabilityIndex: Math.round(coreMetrics.maintainabilityIndex)
    };
  }

  // Legacy methods for backward compatibility - simplified since core logic is in consolidated analyzer

  /**
   * Estimate local variables (fallback method)
   */
  private estimateLocalVariables(input: ComplexityInput): number {
    // Simplified heuristic for backward compatibility
    const baseEstimate = Math.floor(input.blocks.length * 1.5);
    const loopCount = input.blocks.filter(b => b.block_type === 'loop').length;
    const conditionCount = input.blocks.filter(b => 
      b.block_type === 'condition' || b.block_type === 'conditional'
    ).length;

    return baseEstimate + loopCount + Math.floor(conditionCount * 0.5);
  }

  /**
   * Count return points (fallback method)
   */
  private countReturnPoints(input: ComplexityInput): number {
    const exitNodes = input.nodes.filter(n => 
      n.type === 'exit' || n.type === 'return'
    );
    return Math.max(1, exitNodes.length);
  }

  /**
   * Get complexity level description (preserved for dashboard compatibility)
   */
  getComplexityLevel(metrics: ComplexityMetrics): {
    level: 'low' | 'medium' | 'high' | 'very-high';
    color: string;
    description: string;
  } {
    const cc = metrics.cyclomaticComplexity;

    if (cc <= 10) {
      return {
        level: 'low',
        color: '#4caf50',
        description: 'Simple, well-structured code'
      };
    } else if (cc <= 20) {
      return {
        level: 'medium',
        color: '#ff9800',
        description: 'Moderate complexity, consider refactoring'
      };
    } else if (cc <= 50) {
      return {
        level: 'high',
        color: '#f44336',
        description: 'High complexity, refactoring recommended'
      };
    } else {
      return {
        level: 'very-high',
        color: '#b71c1c',
        description: 'Very high complexity, refactoring strongly recommended'
      };
    }
  }

  /**
   * Get recommendations based on metrics (preserved for dashboard compatibility)
   */
  getRecommendations(metrics: ComplexityMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.cyclomaticComplexity > 10) {
      recommendations.push('Consider breaking down this function into smaller, more focused functions');
    }

    if (metrics.nestingDepth > 4) {
      recommendations.push('Deep nesting detected. Consider using early returns or extracting nested logic');
    }

    if (metrics.paramCount > 5) {
      recommendations.push('High parameter count. Consider using a parameter object or builder pattern');
    }

    if (metrics.returnPoints > 5) {
      recommendations.push('Multiple return points detected. Consider consolidating exit points');
    }

    if (metrics.cognitiveComplexity > 15) {
      recommendations.push('High cognitive complexity. Simplify conditional logic and reduce nesting');
    }

    if (metrics.maintainabilityIndex && metrics.maintainabilityIndex < 50) {
      recommendations.push('Low maintainability index. This code may be difficult to maintain');
    }

    return recommendations;
  }
}