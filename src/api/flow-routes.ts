/**
 * API Routes for Enhanced Liquid Flow visualization
 * Provides REST endpoints for flow data and metrics
 */

import { IncomingMessage, ServerResponse } from 'http';
import { FlowAnalysisService } from '../services/flow-analysis.service';
import { createLogger } from '../utils/logger';
import { 
  type FlowApiResponse, 
  FlowType, 
  SymbolKind, 
  type EnhancedSymbolData,
  type DataFlowRelationship,
  type SystemFlowMetrics,
  type Bottleneck,
  type CriticalPath,
  type FlowSimulationParams,
  type Trend,
  type Optimization
} from '../types/flow-types';

const logger = createLogger('FlowRoutes');

export class FlowRoutes {
  private flowService: FlowAnalysisService;

  constructor(flowService: FlowAnalysisService) {
    this.flowService = flowService;
  }

  /**
   * Handle flow-related API requests
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse, url: string): Promise<boolean> {
    const method = req.method || 'GET';

    try {
      // Flow symbols endpoint
      if (url.startsWith('/api/flow/symbols') && method === 'GET') {
        await this.handleGetSymbols(req, res, url);
        return true;
      }

      // Flow relationships endpoint
      if (url.startsWith('/api/flow/relationships') && method === 'GET') {
        await this.handleGetRelationships(req, res, url);
        return true;
      }

      // System metrics endpoint
      if (url.startsWith('/api/flow/metrics/system') && method === 'GET') {
        await this.handleGetSystemMetrics(req, res);
        return true;
      }

      // Symbol metrics endpoint
      if (url.match(/^\/api\/flow\/metrics\/symbol\/[\w-]+$/) && method === 'GET') {
        await this.handleGetSymbolMetrics(req, res, url);
        return true;
      }

      // Bottleneck analysis endpoint
      if (url.startsWith('/api/flow/analysis/bottlenecks') && method === 'GET') {
        await this.handleGetBottlenecks(req, res);
        return true;
      }

      // Critical paths endpoint
      if (url.startsWith('/api/flow/analysis/critical-paths') && method === 'GET') {
        await this.handleGetCriticalPaths(req, res);
        return true;
      }

      // Predictions endpoint
      if (url.startsWith('/api/flow/analysis/predictions') && method === 'GET') {
        await this.handleGetPredictions(req, res);
        return true;
      }

      // Simulation parameters endpoint
      if (url.startsWith('/api/flow/simulate') && method === 'POST') {
        await this.handleSimulate(req, res);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Flow route error', error);
      this.sendError(res, 500, 'Internal server error');
      return true;
    }
  }

  /**
   * GET /api/flow/symbols
   */
  private async handleGetSymbols(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const urlParams = new URL(url, 'http://localhost').searchParams;
    const filter = urlParams.get('filter');
    const limit = parseInt(urlParams.get('limit') || '100');
    const offset = parseInt(urlParams.get('offset') || '0');

    const complete = logger.operation('getFlowSymbols', { filter, limit, offset });

    try {
      const symbols = await this.flowService.get_enhanced_symbols({
        kind: filter as SymbolKind | undefined,
        limit
      });

      // Apply pagination
      const paginated = symbols.slice(offset, offset + limit);

      const response: FlowApiResponse<{ symbols: EnhancedSymbolData[]; total: number; offset: number; limit: number }> = {
        success: true,
        data: {
          symbols: paginated,
          total: symbols.length,
          offset,
          limit
        },
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get flow symbols', error);
      this.sendError(res, 500, 'Failed to retrieve symbols');
    }
  }

  /**
   * GET /api/flow/relationships
   */
  private async handleGetRelationships(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const urlParams = new URL(url, 'http://localhost').searchParams;
    const type = urlParams.get('type') as FlowType | null;
    const includeMetrics = urlParams.get('include_metrics') === 'true';

    const complete = logger.operation('getFlowRelationships', { type, includeMetrics });

    try {
      const relationships = await this.flowService.get_flow_relationships(type || undefined);

      const response: FlowApiResponse<{ relationships: DataFlowRelationship[]; total: number; includeMetrics: boolean }> = {
        success: true,
        data: {
          relationships,
          total: relationships.length,
          includeMetrics
        },
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get flow relationships', error);
      this.sendError(res, 500, 'Failed to retrieve relationships');
    }
  }

  /**
   * GET /api/flow/metrics/system
   */
  private async handleGetSystemMetrics(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const complete = logger.operation('getSystemMetrics');

    try {
      const metrics = await this.flowService.calculate_system_metrics();

      const response: FlowApiResponse<SystemFlowMetrics> = {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get system metrics', error);
      this.sendError(res, 500, 'Failed to calculate system metrics');
    }
  }

  /**
   * GET /api/flow/metrics/symbol/{id}
   */
  private async handleGetSymbolMetrics(req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
    const matches = url.match(/^\/api\/flow\/metrics\/symbol\/([\w-]+)$/);
    const symbolId = matches?.[1];

    if (!symbolId) {
      this.sendError(res, 400, 'Invalid symbol ID');
      return;
    }

    const complete = logger.operation('getSymbolMetrics', { symbolId });

    try {
      const symbols = await this.flowService.get_enhanced_symbols();
      const symbol = symbols.find(s => s.id === symbolId);

      if (!symbol) {
        this.sendError(res, 404, 'Symbol not found');
        return;
      }

      const response: FlowApiResponse<EnhancedSymbolData> = {
        success: true,
        data: symbol,
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get symbol metrics', error);
      this.sendError(res, 500, 'Failed to retrieve symbol metrics');
    }
  }

  /**
   * GET /api/flow/analysis/bottlenecks
   */
  private async handleGetBottlenecks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const complete = logger.operation('getBottlenecks');

    try {
      const metrics = await this.flowService.calculate_system_metrics();

      const response: FlowApiResponse<{ bottlenecks: Bottleneck[]; total: number }> = {
        success: true,
        data: {
          bottlenecks: metrics.bottlenecks,
          total: metrics.bottlenecks.length
        },
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get bottlenecks', error);
      this.sendError(res, 500, 'Failed to analyze bottlenecks');
    }
  }

  /**
   * GET /api/flow/analysis/critical-paths
   */
  private async handleGetCriticalPaths(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const complete = logger.operation('getCriticalPaths');

    try {
      const metrics = await this.flowService.calculate_system_metrics();

      const response: FlowApiResponse<{ criticalPaths: CriticalPath[]; total: number }> = {
        success: true,
        data: {
          criticalPaths: metrics.criticalPaths,
          total: metrics.criticalPaths.length
        },
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get critical paths', error);
      this.sendError(res, 500, 'Failed to analyze critical paths');
    }
  }

  /**
   * GET /api/flow/analysis/predictions
   */
  private async handleGetPredictions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const complete = logger.operation('getPredictions');

    try {
      const metrics = await this.flowService.calculate_system_metrics();

      const response: FlowApiResponse<{ failureProbability: number; performanceTrend: Trend; optimizations: Optimization[] }> = {
        success: true,
        data: {
          failureProbability: metrics.failureProbability,
          performanceTrend: metrics.performanceTrend,
          optimizations: metrics.suggestedOptimizations
        },
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to get predictions', error);
      this.sendError(res, 500, 'Failed to generate predictions');
    }
  }

  /**
   * POST /api/flow/simulate
   */
  private async handleSimulate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseRequestBody(req);
    const complete = logger.operation('simulate');

    try {
      // Simulation would be handled by the visualization layer
      // This endpoint just validates parameters
      const response: FlowApiResponse<{ message: string; params: FlowSimulationParams }> = {
        success: true,
        data: {
          message: 'Simulation parameters accepted',
          params: body as FlowSimulationParams
        },
        timestamp: new Date().toISOString()
      };

      complete();
      this.sendJson(res, response);
    } catch (error) {
      logger.error('Failed to process simulation', error);
      this.sendError(res, 500, 'Failed to process simulation');
    }
  }

  // Helper methods
  private sendJson(res: ServerResponse, data: unknown): void {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    const response: FlowApiResponse<null> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };

    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(response));
  }

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }
}