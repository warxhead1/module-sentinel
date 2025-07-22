/**
 * Analytics API for Module Sentinel
 * Provides programmatic access to analytics features
 */

import type Database from 'better-sqlite3';
import { AnalyticsService } from '../services/analytics/analytics-service';

export class AnalyticsAPI {
  private analyticsService: AnalyticsService;

  constructor(private projectDatabase: Database.Database) {
    this.analyticsService = new AnalyticsService(projectDatabase);
  }

  /**
   * Analyze data flow through a symbol
   */
  async analyzeDataFlow(symbolId: string) {
    return this.analyticsService.analyzeDataFlow(symbolId);
  }

  /**
   * Analyze the impact of changes to a symbol
   */
  async analyzeImpact(symbolId: string) {
    return this.analyticsService.analyzeImpact(symbolId);
  }

  /**
   * Detect architectural and design patterns
   */
  async detectPatterns(scope: 'module' | 'global' = 'global') {
    return this.analyticsService.detectPatterns(scope);
  }

  /**
   * Simulate execution paths through the code
   */
  async simulateExecution(entryPoint: string) {
    return this.analyticsService.simulateExecution(entryPoint);
  }

  /**
   * Calculate advanced complexity metrics
   */
  async calculateComplexity(symbolId: string) {
    return this.analyticsService.calculateComplexity(symbolId);
  }

  /**
   * Get all available analytics for a symbol
   */
  async getSymbolAnalytics(symbolId: string) {
    const [dataFlow, impact, complexity] = await Promise.all([
      this.analyzeDataFlow(symbolId),
      this.analyzeImpact(symbolId),
      this.calculateComplexity(symbolId)
    ]);

    return {
      symbolId,
      dataFlow,
      impact,
      complexity,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Find potential bugs and issues
   */
  async findPotentialIssues() {
    // Detect anti-patterns
    const patterns = await this.detectPatterns('global');
    const antiPatterns = patterns.filter(p => p.patternType.includes('Anti-pattern'));

    // Find high complexity functions
    const stmt = this.projectDatabase.prepare(`
      SELECT id, name, qualified_name, complexity
      FROM symbols
      WHERE kind = 'function' AND complexity > 10
      ORDER BY complexity DESC
      LIMIT 20
    `);
    const complexFunctions = stmt.all();

    // Find functions with many dependencies
    const depsStmt = this.projectDatabase.prepare(`
      SELECT s.id, s.name, COUNT(DISTINCT r.to_symbol_id) as dep_count
      FROM symbols s
      JOIN relationships r ON r.from_symbol_id = s.id
      WHERE s.kind = 'function'
      GROUP BY s.id
      HAVING dep_count > 15
      ORDER BY dep_count DESC
      LIMIT 20
    `);
    const highDependencyFunctions = depsStmt.all();

    return {
      antiPatterns,
      complexFunctions,
      highDependencyFunctions,
      summary: {
        antiPatternCount: antiPatterns.length,
        complexFunctionCount: complexFunctions.length,
        highDependencyCount: highDependencyFunctions.length
      }
    };
  }

  /**
   * Get code quality metrics
   */
  async getCodeQualityMetrics() {
    const issues = await this.findPotentialIssues();
    const patterns = await this.detectPatterns('global');
    
    // Calculate overall health score
    const healthScore = Math.max(0, 100 - 
      (issues.summary.antiPatternCount * 5) -
      (issues.summary.complexFunctionCount * 2) -
      (issues.summary.highDependencyCount * 3)
    );

    return {
      healthScore,
      patterns: patterns.length,
      issues: issues.summary,
      recommendations: this.generateRecommendations(healthScore, issues)
    };
  }

  private generateRecommendations(healthScore: number, issues: any): string[] {
    const recommendations: string[] = [];

    if (healthScore < 70) {
      recommendations.push('Consider refactoring high-complexity functions');
    }

    if (issues.summary.antiPatternCount > 5) {
      recommendations.push('Address identified anti-patterns to improve maintainability');
    }

    if (issues.summary.highDependencyCount > 10) {
      recommendations.push('Reduce coupling between functions to improve modularity');
    }

    return recommendations;
  }
}