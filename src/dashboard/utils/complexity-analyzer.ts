/**
 * Dashboard Complexity Analyzer Module
 * 
 * Dashboard-specific wrapper for the consolidated CodeMetricsAnalyzer.
 * Provides backward compatibility while eliminating code duplication.
 */

// Browser-compatible complexity analyzer - removed server-side dependencies

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
  constructor() {
    // Browser-compatible implementation
  }

  /**
   * Analyze complexity metrics for given control flow
   * Browser-compatible implementation
   */
  analyze(input: ComplexityInput): ComplexityMetrics {
    // Calculate metrics directly in browser
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(input);
    const cognitiveComplexity = this.calculateCognitiveComplexity(input);
    const nestingDepth = this.calculateNestingDepth(input);
    const paramCount = this.calculateParamCount(input);
    const localVariables = this.estimateLocalVariables(input);
    const returnPoints = this.countReturnPoints(input);
    const halsteadMetrics = this.calculateHalsteadMetrics(input);
    const maintainabilityIndex = this.calculateMaintainabilityIndex({
      cyclomaticComplexity,
      halsteadMetrics,
      linesOfCode: input.nodes.length
    });

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      nestingDepth,
      paramCount,
      localVariables,
      returnPoints,
      halsteadMetrics,
      maintainabilityIndex
    };
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateCyclomaticComplexity(input: ComplexityInput): number {
    // M = E - N + 2P (where P = 1 for connected components)
    const edges = input.edges.length;
    const nodes = input.nodes.length;
    return Math.max(1, edges - nodes + 2);
  }

  /**
   * Calculate cognitive complexity
   */
  private calculateCognitiveComplexity(input: ComplexityInput): number {
    let complexity = 0;
    let nestingLevel = 0;

    input.blocks.forEach(block => {
      if (block.block_type === 'condition' || block.block_type === 'conditional') {
        complexity += 1 + nestingLevel;
      } else if (block.block_type === 'loop') {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
    });

    return complexity;
  }

  /**
   * Calculate nesting depth
   */
  private calculateNestingDepth(input: ComplexityInput): number {
    let maxDepth = 0;
    let currentDepth = 0;

    input.blocks.forEach(block => {
      if (block.block_type === 'loop' || block.block_type === 'condition') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      }
    });

    return maxDepth;
  }

  /**
   * Calculate parameter count
   */
  private calculateParamCount(input: ComplexityInput): number {
    if (input.symbol && input.symbol.signature) {
      const paramMatch = input.symbol.signature.match(/\(([^)]*)\)/);
      if (paramMatch && paramMatch[1]) {
        const params = paramMatch[1].split(',').filter((p: string) => p.trim());
        return params.length;
      }
    }
    return 0;
  }

  /**
   * Calculate Halstead metrics
   */
  private calculateHalsteadMetrics(input: ComplexityInput): HalsteadMetrics {
    // Simplified Halstead calculation for browser
    const operators = input.edges.length;
    const operands = input.nodes.length;
    const uniqueOperators = Math.ceil(operators * 0.7);
    const uniqueOperands = Math.ceil(operands * 0.6);

    const vocabulary = uniqueOperators + uniqueOperands;
    const length = operators + operands;
    const volume = length * Math.log2(vocabulary);
    const difficulty = (uniqueOperators / 2) * (operands / uniqueOperands);
    const effort = volume * difficulty;
    const time = effort / 18;
    const bugs = volume / 3000;

    return {
      vocabulary,
      length,
      volume,
      difficulty,
      effort,
      time,
      bugs
    };
  }

  /**
   * Calculate maintainability index
   */
  private calculateMaintainabilityIndex(metrics: {
    cyclomaticComplexity: number;
    halsteadMetrics: HalsteadMetrics;
    linesOfCode: number;
  }): number {
    const { cyclomaticComplexity, halsteadMetrics, linesOfCode } = metrics;
    
    // Simplified maintainability index calculation
    const mi = 171 - 
      5.2 * Math.log(halsteadMetrics.volume) -
      0.23 * cyclomaticComplexity -
      16.2 * Math.log(linesOfCode);

    return Math.max(0, Math.min(100, mi));
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