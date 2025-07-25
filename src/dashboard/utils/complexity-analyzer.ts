/**
 * Complexity Analyzer Module
 * 
 * Calculates various complexity metrics including cyclomatic complexity,
 * cognitive complexity, nesting depth, and other code quality indicators.
 */

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
  /**
   * Analyze complexity metrics for given control flow
   */
  analyze(input: ComplexityInput): ComplexityMetrics {
    return {
      cyclomaticComplexity: this.calculateCyclomaticComplexity(input),
      cognitiveComplexity: this.calculateCognitiveComplexity(input),
      nestingDepth: this.calculateNestingDepth(input),
      paramCount: this.calculateParameterCount(input.symbol),
      localVariables: this.estimateLocalVariables(input),
      returnPoints: this.countReturnPoints(input),
      halsteadMetrics: input.code ? this.calculateHalsteadMetrics(input.code) : undefined,
      maintainabilityIndex: this.calculateMaintainabilityIndex(input)
    };
  }

  /**
   * Calculate McCabe's cyclomatic complexity
   * Formula: M = E - N + 2P
   * Where E = edges, N = nodes, P = connected components (usually 1)
   */
  private calculateCyclomaticComplexity(input: ComplexityInput): number {
    const nodeCount = input.nodes.length;
    const edgeCount = input.edges.length;
    const connectedComponents = 1; // Assuming single function

    // Basic formula
    let complexity = edgeCount - nodeCount + (2 * connectedComponents);

    // Minimum complexity is 1
    return Math.max(1, complexity);
  }

  /**
   * Calculate cognitive complexity
   * Increments for:
   * - Conditional statements (if, switch, ternary)
   * - Loops (for, while, do-while)
   * - Nested structures (with nesting penalty)
   * - Boolean operators in conditions
   */
  private calculateCognitiveComplexity(input: ComplexityInput): number {
    let complexity = 0;
    const blockMap = new Map(input.blocks.map(b => [b.id, b]));
    const nestingLevels = new Map<number, number>();

    // Calculate nesting level for each block
    input.blocks.forEach(block => {
      let level = 0;
      let current = block;

      while (current.parent_block_id) {
        level++;
        current = blockMap.get(current.parent_block_id);
        if (!current) break;
      }

      nestingLevels.set(block.id, level);
    });

    // Add complexity based on block types
    input.blocks.forEach(block => {
      const nestingLevel = nestingLevels.get(block.id) || 0;

      switch (block.block_type) {
        case 'condition':
        case 'conditional':
          // Base increment + nesting penalty
          complexity += 1 + nestingLevel;
          
          // Additional complexity for compound conditions
          if (block.condition) {
            const booleanOps = (block.condition.match(/&&|\|\|/g) || []).length;
            complexity += booleanOps;
          }
          break;

        case 'loop':
          // Loops have higher base complexity
          complexity += 1 + nestingLevel;
          break;

        case 'switch':
          // Switch statements
          complexity += 1 + nestingLevel;
          break;

        case 'try':
        case 'catch':
          // Exception handling
          complexity += 1 + nestingLevel;
          break;
      }
    });

    // Add complexity for early returns (except the last one)
    const returnCount = input.nodes.filter(n => n.type === 'return' || n.type === 'exit').length;
    if (returnCount > 1) {
      complexity += returnCount - 1;
    }

    return complexity;
  }

  /**
   * Calculate maximum nesting depth
   */
  private calculateNestingDepth(input: ComplexityInput): number {
    let maxDepth = 0;
    const blockMap = new Map(input.blocks.map(b => [b.id, b]));

    input.blocks.forEach(block => {
      let depth = 0;
      let current = block;

      while (current.parent_block_id) {
        depth++;
        current = blockMap.get(current.parent_block_id);
        if (!current || depth > 20) break; // Prevent infinite loops
      }

      maxDepth = Math.max(maxDepth, depth);
    });

    return maxDepth;
  }

  /**
   * Count function parameters
   */
  private calculateParameterCount(symbol: any): number {
    if (!symbol.signature) return 0;

    // Extract parameters from signature
    const paramMatch = symbol.signature.match(/\((.*?)\)/);
    if (!paramMatch) return 0;

    const params = paramMatch[1].trim();
    if (!params) return 0;

    // Count parameters by splitting on commas (simplified)
    // This doesn't handle nested templates/functions perfectly
    let depth = 0;
    let paramCount = 1;

    for (const char of params) {
      if (char === '<' || char === '(') depth++;
      else if (char === '>' || char === ')') depth--;
      else if (char === ',' && depth === 0) paramCount++;
    }

    return paramCount;
  }

  /**
   * Estimate local variables (heuristic based on complexity)
   */
  private estimateLocalVariables(input: ComplexityInput): number {
    // Heuristic: more complex functions tend to have more variables
    const baseEstimate = Math.floor(input.blocks.length * 1.5);
    
    // Add variables for loops (loop counters)
    const loopCount = input.blocks.filter(b => b.block_type === 'loop').length;
    
    // Add variables for conditions (temporary values)
    const conditionCount = input.blocks.filter(b => 
      b.block_type === 'condition' || b.block_type === 'conditional'
    ).length;

    return baseEstimate + loopCount + Math.floor(conditionCount * 0.5);
  }

  /**
   * Count return points
   */
  private countReturnPoints(input: ComplexityInput): number {
    const exitNodes = input.nodes.filter(n => 
      n.type === 'exit' || n.type === 'return'
    );
    return Math.max(1, exitNodes.length);
  }

  /**
   * Calculate Halstead metrics
   */
  private calculateHalsteadMetrics(code: string): HalsteadMetrics {
    // Tokenize code (simplified)
    const operators = new Set<string>();
    const operands = new Set<string>();
    let operatorCount = 0;
    let operandCount = 0;

    // Common operators
    const operatorPatterns = [
      /\+\+/g, /--/g, /\+=/g, /-=/g, /\*=/g, /\/=/g,
      /==/g, /!=/g, /<=/g, />=/g, /&&/g, /\|\|/g,
      /\+/g, /-/g, /\*/g, /\//g, /%/g, /=/g,
      /</g, />/g, /!/g, /&/g, /\|/g, /\^/g,
      /\(/g, /\)/g, /\{/g, /\}/g, /\[/g, /\]/g,
      /\./g, /->/g, /::/g, /;/g, /,/g, /:/g, /\?/g
    ];

    // Extract operators
    operatorPatterns.forEach(pattern => {
      const matches = code.match(pattern) || [];
      matches.forEach(op => {
        operators.add(op);
        operatorCount++;
      });
    });

    // Extract operands (simplified - identifiers and literals)
    const operandPattern = /\b[a-zA-Z_]\w*\b|\b\d+\.?\d*\b|"[^"]*"|'[^']*'/g;
    const operandMatches = code.match(operandPattern) || [];
    operandMatches.forEach(operand => {
      operands.add(operand);
      operandCount++;
    });

    // Calculate metrics
    const n1 = operators.size; // Unique operators
    const n2 = operands.size;  // Unique operands
    const N1 = operatorCount;  // Total operators
    const N2 = operandCount;   // Total operands

    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length * Math.log2(vocabulary);
    const difficulty = (n1 / 2) * (N2 / n2);
    const effort = difficulty * volume;
    const time = effort / 18; // Seconds to implement
    const bugs = volume / 3000; // Estimated bugs

    return {
      vocabulary,
      length,
      volume: Math.round(volume),
      difficulty: Math.round(difficulty * 10) / 10,
      effort: Math.round(effort),
      time: Math.round(time),
      bugs: Math.round(bugs * 100) / 100
    };
  }

  /**
   * Calculate Maintainability Index
   * MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
   * Where HV = Halstead Volume, CC = Cyclomatic Complexity, LOC = Lines of Code
   */
  private calculateMaintainabilityIndex(input: ComplexityInput): number {
    const cc = this.calculateCyclomaticComplexity(input);
    
    // Estimate lines of code
    let loc = 0;
    if (input.blocks.length > 0) {
      const minLine = Math.min(...input.blocks.map(b => b.start_line));
      const maxLine = Math.max(...input.blocks.map(b => b.end_line));
      loc = maxLine - minLine + 1;
    } else {
      loc = 10; // Default estimate
    }

    // Use Halstead volume if available, otherwise estimate
    let halsteadVolume = 100; // Default
    if (input.code) {
      const halstead = this.calculateHalsteadMetrics(input.code);
      halsteadVolume = halstead.volume;
    }

    // Calculate MI
    let mi = 171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cc - 16.2 * Math.log(loc);

    // Normalize to 0-100 scale
    mi = Math.max(0, Math.min(100, mi));

    return Math.round(mi);
  }

  /**
   * Get complexity level description
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
   * Get recommendations based on metrics
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