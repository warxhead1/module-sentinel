/**
 * Branch Coverage Calculator Module
 * 
 * Calculates branch coverage metrics for conditional statements,
 * identifying which branches have been executed and which remain untested.
 */

export interface BranchInfo {
  condition: string;
  targets: Array<{
    target_id: number | string;
    target_name: string;
    line_number: number;
  }>;
  coverage: number;
  executionCount?: number;
}

export interface BranchCoverage {
  total: number;
  covered: number;
  percentage: number;
  uncoveredBranches: BranchInfo[];
  partiallyCovcredBranches: BranchInfo[];
  fullyCoveredBranches: BranchInfo[];
}

export interface BranchCoverageOptions {
  nodes: any[];
  edges: any[];
  executionPaths: any[];
  branches?: BranchInfo[];
}

export class BranchCoverageCalculator {
  /**
   * Calculate branch coverage for the analyzed code
   */
  async calculateCoverage(options: BranchCoverageOptions): Promise<BranchCoverage> {
    const { nodes, edges, executionPaths, branches = [] } = options;

    // Extract branches from edges if not provided
    const allBranches = branches.length > 0 
      ? branches 
      : this.extractBranchesFromEdges(edges, nodes);

    // Calculate coverage for each branch
    const branchCoverageMap = new Map<string, Set<string | number>>();
    
    // Track which branches are covered by execution paths
    executionPaths.forEach((path: any) => {
      for (let i = 0; i < path.nodes.length - 1; i++) {
        const fromNode = path.nodes[i];
        const toNode = path.nodes[i + 1];
        const branchKey = `${fromNode}-${toNode}`;
        
        if (!branchCoverageMap.has(branchKey)) {
          branchCoverageMap.set(branchKey, new Set());
        }
        branchCoverageMap.get(branchKey)!.add(path.id);
      }
    });

    // Categorize branches
    const uncoveredBranches: BranchInfo[] = [];
    const partiallyCovcredBranches: BranchInfo[] = [];
    const fullyCoveredBranches: BranchInfo[] = [];
    
    let totalBranches = 0;
    let coveredBranches = 0;

    allBranches.forEach(branch => {
      totalBranches++;
      
      // Check coverage for all targets of this branch
      const targetsCovered = branch.targets.filter(target => {
        const branchKey = `${branch.condition}-${target.target_id}`;
        return branchCoverageMap.has(branchKey);
      }).length;

      const coveragePercentage = branch.targets.length > 0
        ? (targetsCovered / branch.targets.length) * 100
        : 0;

      branch.coverage = coveragePercentage;

      if (coveragePercentage === 0) {
        uncoveredBranches.push(branch);
      } else if (coveragePercentage === 100) {
        fullyCoveredBranches.push(branch);
        coveredBranches++;
      } else {
        partiallyCovcredBranches.push(branch);
        coveredBranches += 0.5; // Partial coverage counts as half
      }
    });

    const overallPercentage = totalBranches > 0
      ? (coveredBranches / totalBranches) * 100
      : 100;

    return {
      total: totalBranches,
      covered: Math.floor(coveredBranches),
      percentage: Math.round(overallPercentage),
      uncoveredBranches,
      partiallyCovcredBranches,
      fullyCoveredBranches
    };
  }

  /**
   * Extract branch information from edges
   */
  private extractBranchesFromEdges(edges: any[], nodes: any[]): BranchInfo[] {
    const branchMap = new Map<string, BranchInfo>();

    // Group edges by source node to find branches
    const edgesBySource = new Map<string | number, any[]>();
    edges.forEach(edge => {
      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);
    });

    // Find nodes with multiple outgoing edges (branches)
    edgesBySource.forEach((outgoingEdges, sourceId) => {
      if (outgoingEdges.length > 1) {
        const sourceNode = nodes.find(n => n.id === sourceId);
        if (!sourceNode) return;

        // Check if edges have conditions (conditional branches)
        const conditionalEdges = outgoingEdges.filter(e => e.isConditional || e.type === 'true' || e.type === 'false');
        
        if (conditionalEdges.length > 0) {
          const condition = conditionalEdges[0].condition || `Branch at ${sourceNode.name || sourceId}`;
          
          const targets = outgoingEdges.map(edge => {
            const targetNode = nodes.find(n => n.id === edge.target);
            return {
              target_id: edge.target,
              target_name: targetNode?.name || String(edge.target),
              line_number: targetNode?.line || 0
            };
          });

          branchMap.set(condition, {
            condition,
            targets,
            coverage: 0
          });
        }
      }
    });

    return Array.from(branchMap.values());
  }

  /**
   * Generate branch coverage report
   */
  generateReport(coverage: BranchCoverage): string {
    const lines: string[] = [
      '# Branch Coverage Report',
      '',
      `Total Branches: ${coverage.total}`,
      `Covered Branches: ${coverage.covered}`,
      `Coverage Percentage: ${coverage.percentage}%`,
      '',
    ];

    if (coverage.uncoveredBranches.length > 0) {
      lines.push('## Uncovered Branches');
      coverage.uncoveredBranches.forEach(branch => {
        lines.push(`- ${branch.condition}`);
        branch.targets.forEach(target => {
          lines.push(`  → ${target.target_name} (line ${target.line_number})`);
        });
      });
      lines.push('');
    }

    if (coverage.partiallyCovcredBranches.length > 0) {
      lines.push('## Partially Covered Branches');
      coverage.partiallyCovcredBranches.forEach(branch => {
        lines.push(`- ${branch.condition} (${branch.coverage}% covered)`);
        branch.targets.forEach(target => {
          lines.push(`  → ${target.target_name} (line ${target.line_number})`);
        });
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Find critical uncovered branches (high-risk)
   */
  findCriticalUncoveredBranches(
    coverage: BranchCoverage,
    riskFactors: Map<string, number>
  ): BranchInfo[] {
    return coverage.uncoveredBranches.filter(branch => {
      // Check if any target has high risk factor
      return branch.targets.some(target => {
        const risk = riskFactors.get(target.target_name) || 0;
        return risk > 0.7;
      });
    });
  }

  /**
   * Calculate branch complexity score
   */
  calculateBranchComplexity(branch: BranchInfo): number {
    // More targets = higher complexity
    let complexity = branch.targets.length;

    // Complex conditions increase complexity
    if (branch.condition.includes('&&') || branch.condition.includes('||')) {
      complexity *= 1.5;
    }

    // Nested conditions increase complexity
    if (branch.condition.includes('(') && branch.condition.includes(')')) {
      complexity *= 1.2;
    }

    return complexity;
  }

  /**
   * Suggest test cases for uncovered branches
   */
  suggestTestCases(uncoveredBranches: BranchInfo[]): Map<string, string[]> {
    const suggestions = new Map<string, string[]>();

    uncoveredBranches.forEach(branch => {
      const testCases: string[] = [];

      // Analyze condition to suggest test values
      if (branch.condition.includes('==')) {
        testCases.push('Test with equal values');
        testCases.push('Test with different values');
      } else if (branch.condition.includes('>')) {
        testCases.push('Test with value greater than threshold');
        testCases.push('Test with value equal to threshold');
        testCases.push('Test with value less than threshold');
      } else if (branch.condition.includes('null') || branch.condition.includes('nullptr')) {
        testCases.push('Test with null/nullptr value');
        testCases.push('Test with valid pointer/reference');
      } else if (branch.condition.includes('empty()')) {
        testCases.push('Test with empty container');
        testCases.push('Test with non-empty container');
      }

      if (testCases.length === 0) {
        testCases.push('Add test case to cover this branch condition');
      }

      suggestions.set(branch.condition, testCases);
    });

    return suggestions;
  }
}