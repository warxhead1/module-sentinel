import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';
import Database from 'better-sqlite3';
import * as path from 'path';

export class IntegrationHealthTool {
  private schemaManager: UnifiedSchemaManager;

  constructor() {
    this.schemaManager = UnifiedSchemaManager.getInstance();
  }

  /**
   * Generate and display comprehensive integration health report
   */
  async generateHealthReport(projectPath: string): Promise<void> {
    const dbPath = path.join(projectPath, '.module-sentinel', 'preservation.db');
    const db = new Database(dbPath, { readonly: true });

    try {
      const report = this.schemaManager.getIntegrationHealthReport(db);
      
      console.log('\n🏥 MODULE SENTINEL INTEGRATION HEALTH REPORT\n');
      console.log('=' .repeat(60));

      // Parser Metrics
      console.log('\n📊 PARSER QUALITY METRICS:');
      console.log('-'.repeat(40));
      report.parserMetrics.forEach((metric: any) => {
        const successRate = metric.files_attempted > 0 
          ? (metric.files_succeeded / metric.files_attempted * 100).toFixed(1)
          : '0.0';
        console.log(`\n${metric.parser.toUpperCase()}:`);
        console.log(`  Files attempted: ${metric.files_attempted}`);
        console.log(`  Files succeeded: ${metric.files_succeeded} (${successRate}%)`);
        console.log(`  Total symbols: ${metric.total_symbols}`);
        console.log(`  Best parser for: ${metric.best_parser_count} files`);
      });

      // Analytics Metrics
      console.log('\n\n📈 ANALYTICS INTEGRATION:');
      console.log('-'.repeat(40));
      console.log(`Duplicates found: ${report.analyticsMetrics.duplicatesFound}`);
      console.log(`Anti-patterns detected: ${report.analyticsMetrics.antiPatternsDetected}`);
      console.log(`  - SOLID violations: ${report.analyticsMetrics.solidViolations}`);
      console.log(`  - Factory violations: ${report.analyticsMetrics.factoryViolations}`);

      // File Type Coverage
      console.log('\n\n📁 FILE TYPE COVERAGE:');
      console.log('-'.repeat(40));
      Object.entries(report.analyticsMetrics.fileTypeCoverage).forEach(([type, count]) => {
        console.log(`${type}: ${count} files`);
      });

      // Semantic Coverage
      console.log('\n\n🧠 SEMANTIC COVERAGE BY PARSER:');
      console.log('-'.repeat(40));
      report.semanticCoverage.forEach((coverage: any) => {
        console.log(`\n${coverage.parser_used || 'unknown'}:`);
        console.log(`  Total symbols: ${coverage.total_symbols}`);
        console.log(`  Tagged symbols: ${coverage.tagged_symbols}`);
        console.log(`  Coverage: ${coverage.coverage_percentage.toFixed(1)}%`);
      });

      // High Confidence Symbols
      console.log('\n\n🎯 SYMBOL CONFIDENCE:');
      console.log('-'.repeat(40));
      console.log(`High confidence symbols: ${report.highConfidencePercentage.toFixed(1)}%`);

      // Re-indexing Stats
      console.log('\n\n🔄 RE-INDEXING STATUS:');
      console.log('-'.repeat(40));
      console.log(`Total files: ${report.reindexingStats.totalFiles}`);
      console.log(`Successfully parsed: ${report.reindexingStats.successfullyParsed}`);
      console.log(`Needs re-indexing: ${report.reindexingStats.needsReindexing}`);
      console.log(`Average confidence: ${report.reindexingStats.averageConfidence.toFixed(2)}`);

      // Recommendations
      if (report.recommendations.length > 0) {
        console.log('\n\n💡 RECOMMENDATIONS:');
        console.log('-'.repeat(40));
        report.recommendations.forEach((rec: string, index: number) => {
          console.log(`${index + 1}. ${rec}`);
        });
      }

      // Summary
      console.log('\n\n📋 SUMMARY:');
      console.log('-'.repeat(40));
      const overallHealth = this.calculateOverallHealth(report);
      console.log(`Overall health score: ${overallHealth.toFixed(1)}%`);
      console.log(`Status: ${this.getHealthStatus(overallHealth)}`);

      console.log('\n' + '='.repeat(60) + '\n');

    } finally {
      db.close();
    }
  }

  /**
   * Calculate overall health score
   */
  private calculateOverallHealth(report: any): number {
    let score = 0;
    let factors = 0;

    // Parser success rate (25%)
    const clangMetric = report.parserMetrics.find((m: any) => m.parser === 'clang');
    if (clangMetric && clangMetric.files_attempted > 0) {
      score += (clangMetric.files_succeeded / clangMetric.files_attempted) * 25;
      factors += 25;
    } else {
      // No Clang = max 75% health
      factors += 25;
    }

    // High confidence symbols (25%)
    score += Math.min(report.highConfidencePercentage, 100) * 0.25;
    factors += 25;

    // Semantic coverage (25%)
    const avgSemanticCoverage = report.semanticCoverage.reduce((sum: number, c: any) => 
      sum + c.coverage_percentage, 0) / Math.max(report.semanticCoverage.length, 1);
    score += Math.min(avgSemanticCoverage, 100) * 0.25;
    factors += 25;

    // Analytics detection (25%)
    const hasAnalytics = report.analyticsMetrics.antiPatternsDetected > 0 || 
                        report.analyticsMetrics.duplicatesFound > 0;
    score += hasAnalytics ? 25 : 0;
    factors += 25;

    return (score / factors) * 100;
  }

  /**
   * Get health status description
   */
  private getHealthStatus(score: number): string {
    if (score >= 90) return '🟢 Excellent';
    if (score >= 70) return '🟡 Good';
    if (score >= 50) return '🟠 Fair';
    return '🔴 Needs Improvement';
  }
}

// Export for CLI usage
export async function runHealthReport(projectPath?: string): Promise<void> {
  const tool = new IntegrationHealthTool();
  const targetPath = projectPath || process.cwd();
  
  await tool.generateHealthReport(targetPath);
}