import type { Request, Response } from '../types/express';
import { AnalyticsService } from '../../services/analytics/analytics-service';
import type Database from 'better-sqlite3';

export class AnalyticsRoutes {
  private analyticsService: AnalyticsService;

  constructor(db: Database.Database) {
    this.analyticsService = new AnalyticsService(db);
  }

  async getDataFlow(req: Request, res: Response) {
    try {
      const { symbolId } = req.params;
      const analysis = await this.analyticsService.analyzeDataFlow(symbolId);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Data flow analysis error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    }
  }

  async getImpactAnalysis(req: Request, res: Response) {
    try {
      const { symbolId } = req.params;
      const analysis = await this.analyticsService.analyzeImpact(symbolId);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Impact analysis error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    }
  }

  async getPatterns(req: Request, res: Response) {
    try {
      const { scope = 'global' } = req.query;
      const patterns = await this.analyticsService.detectPatterns(scope as 'module' | 'global');
      
      res.json({
        success: true,
        data: patterns
      });
    } catch (error) {
      console.error('Pattern detection error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Pattern detection failed'
      });
    }
  }

  async getExecutionSimulation(req: Request, res: Response) {
    try {
      const { entryPoint } = req.params;
      const trace = await this.analyticsService.simulateExecution(entryPoint);
      
      res.json({
        success: true,
        data: trace
      });
    } catch (error) {
      console.error('Execution simulation error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Simulation failed'
      });
    }
  }

  async getComplexityMetrics(req: Request, res: Response) {
    try {
      const { symbolId } = req.params;
      const metrics = await this.analyticsService.calculateComplexity(symbolId);
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Complexity calculation error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Calculation failed'
      });
    }
  }

  async getBulkImpactAnalysis(req: Request, res: Response) {
    try {
      const { symbolIds } = req.body;
      
      if (!Array.isArray(symbolIds)) {
        return res.status(400).json({
          success: false,
          error: 'symbolIds must be an array'
        });
      }
      
      const results = await Promise.all(
        symbolIds.map((id: any) => this.analyticsService.analyzeImpact(id.toString()))
      );
      
      // Merge impacts
      const mergedImpact = {
        totalSeverity: results.reduce((sum: number, r: any) => sum + r.severityScore, 0),
        affectedSymbols: new Set<number>(),
        rippleWaves: new Map<number, any[]>()
      };
      
      results.forEach((result: any) => {
        result.directImpact.forEach((node: any) => mergedImpact.affectedSymbols.add(node.symbolId));
        result.indirectImpact.forEach((node: any) => mergedImpact.affectedSymbols.add(node.symbolId));
        
        result.rippleEffect.forEach((wave: any) => {
          if (!mergedImpact.rippleWaves.has(wave.distance)) {
            mergedImpact.rippleWaves.set(wave.distance, []);
          }
          mergedImpact.rippleWaves.get(wave.distance)!.push(...wave.nodes);
        });
      });
      
      res.json({
        success: true,
        data: {
          totalSeverity: mergedImpact.totalSeverity,
          affectedCount: mergedImpact.affectedSymbols.size,
          rippleEffect: Array.from(mergedImpact.rippleWaves.entries())
            .map(([distance, nodes]) => ({ distance, nodes, timestamp: distance * 100 }))
            .sort((a, b) => a.distance - b.distance)
        }
      });
    } catch (error) {
      console.error('Bulk impact analysis error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    }
  }
}
