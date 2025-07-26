/**
 * Unit tests for Flow API Routes
 */

import { IncomingMessage, ServerResponse } from 'http';
import { FlowRoutes } from '../flow-routes';
import { FlowAnalysisService } from '../../services/flow-analysis.service';
import type { 
  EnhancedSymbolData, 
  DataFlowRelationship, 
  SystemFlowMetrics
} from '../../types/flow-types';
import {
  FlowType,
  SymbolKind,
  Trend,
  BottleneckType
} from '../../types/flow-types';

// Mock the FlowAnalysisService
jest.mock('../../services/flow-analysis.service');

describe('FlowRoutes', () => {
  let routes: FlowRoutes;
  let mockService: jest.Mocked<FlowAnalysisService>;
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let responseData: any;
  let responseStatus: number;

  beforeEach(() => {
    // Create mock service
    mockService = new FlowAnalysisService(null as any) as jest.Mocked<FlowAnalysisService>;
    routes = new FlowRoutes(mockService);

    // Reset response data
    responseData = null;
    responseStatus = 200;

    // Mock request
    mockReq = {
      method: 'GET',
      url: '/',
      on: jest.fn()
    };

    // Mock response
    mockRes = {
      writeHead: jest.fn((status: number) => {
        responseStatus = status;
      }),
      end: jest.fn((data: string) => {
        responseData = JSON.parse(data);
      }),
      write: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/flow/symbols', () => {
    const mockSymbols: EnhancedSymbolData[] = [
      {
        id: 'sym1',
        name: 'TestFunction',
        kind: SymbolKind.Function,
        filePath: '/test.ts',
        lineRange: [1, 10],
        cyclomaticComplexity: 5,
        cognitiveComplexity: 3,
        linesOfCode: 10,
        nestingDepth: 2,
        changeFrequency: 2.5,
        lastModified: '2024-01-01',
        authorCount: 3,
        bugFrequency: 0.5,
        documentationScore: 0.8,
        codeSmellCount: 1,
        technicalDebtScore: 15
      }
    ];

    it('should return enhanced symbols', async () => {
      mockService.getEnhancedSymbols.mockResolvedValue(mockSymbols);

      // Execute
      const handled = await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/symbols'
      );

      // Assert
      expect(handled).toBe(true);
      expect(responseStatus).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.data.symbols).toEqual(mockSymbols);
      expect(responseData.data.total).toBe(1);
    });

    it('should handle filter parameters', async () => {
      mockService.getEnhancedSymbols.mockResolvedValue(mockSymbols);

      // Execute with filter
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/symbols?filter=function&limit=50&offset=10'
      );

      // Assert service called with correct params
      expect(mockService.getEnhancedSymbols).toHaveBeenCalledWith({
        kind: 'function',
        limit: 50
      });
    });

    it('should handle errors gracefully', async () => {
      mockService.getEnhancedSymbols.mockRejectedValue(new Error('Test error'));

      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/symbols'
      );

      // Assert error response
      expect(responseStatus).toBe(500);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Failed to retrieve symbols');
    });
  });

  describe('GET /api/flow/relationships', () => {
    const mockRelationships: DataFlowRelationship[] = [
      {
        sourceId: 'sym1',
        targetId: 'sym2',
        flowType: FlowType.DataFlow,
        dataVolume: 75,
        frequency: 10,
        reliability: 0.95,
        isCriticalPath: true,
        alternativePaths: [],
        bottleneckScore: 5,
        transformsData: false,
        dataTypes: ['string'],
        validationRules: []
      }
    ];

    it('should return flow relationships', async () => {
      mockService.getFlowRelationships.mockResolvedValue(mockRelationships);

      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/relationships'
      );

      // Assert
      expect(responseData.success).toBe(true);
      expect(responseData.data.relationships).toEqual(mockRelationships);
      expect(responseData.data.total).toBe(1);
    });

    it('should filter by flow type', async () => {
      mockService.getFlowRelationships.mockResolvedValue(mockRelationships);

      // Execute with type filter
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/relationships?type=asyncMessage'
      );

      // Assert service called with correct type
      expect(mockService.getFlowRelationships).toHaveBeenCalledWith('asyncMessage');
    });
  });

  describe('GET /api/flow/metrics/system', () => {
    const mockMetrics: SystemFlowMetrics = {
      systemPressure: 65.5,
      flowEfficiency: 0.85,
      averageLatency: 125,
      errorRate: 0.02,
      criticalPaths: [],
      bottlenecks: [],
      underutilizedPaths: [],
      memoryPressure: 45,
      cpuUtilization: 0.7,
      ioWaitTime: 0.15,
      failureProbability: 0.1,
      performanceTrend: Trend.Stable,
      suggestedOptimizations: []
    };

    it('should return system metrics', async () => {
      mockService.calculateSystemMetrics.mockResolvedValue(mockMetrics);

      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/metrics/system'
      );

      // Assert
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(mockMetrics);
      expect(responseData.timestamp).toBeDefined();
    });
  });

  describe('GET /api/flow/metrics/symbol/{id}', () => {
    const mockSymbol: EnhancedSymbolData = {
      id: 'sym123',
      name: 'TestSymbol',
      kind: SymbolKind.Class,
      filePath: '/test.ts',
      lineRange: [1, 100],
      cyclomaticComplexity: 15,
      cognitiveComplexity: 10,
      linesOfCode: 100,
      nestingDepth: 3,
      changeFrequency: 5,
      lastModified: '2024-01-01',
      authorCount: 2,
      bugFrequency: 1,
      documentationScore: 0.6,
      codeSmellCount: 3,
      technicalDebtScore: 25
    };

    it('should return specific symbol metrics', async () => {
      mockService.getEnhancedSymbols.mockResolvedValue([mockSymbol]);

      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/metrics/symbol/sym123'
      );

      // Assert
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(mockSymbol);
    });

    it('should return 404 for non-existent symbol', async () => {
      mockService.getEnhancedSymbols.mockResolvedValue([]);

      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/metrics/symbol/nonexistent'
      );

      // Assert
      expect(responseStatus).toBe(404);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Symbol not found');
    });

    it('should handle invalid symbol ID format', async () => {
      // Execute with invalid URL
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/metrics/symbol/'
      );

      // Should not match the route
      expect(responseData).toBeNull();
    });
  });

  describe('GET /api/flow/analysis/bottlenecks', () => {
    it('should return bottleneck analysis', async () => {
      const mockMetrics: SystemFlowMetrics = {
        systemPressure: 70,
        flowEfficiency: 0.8,
        averageLatency: 150,
        errorRate: 0.05,
        criticalPaths: [],
        bottlenecks: [
          {
            symbolId: 'sym1',
            severity: 85,
            type: BottleneckType.CPU,
            impact: 'High CPU usage',
            suggestedFix: 'Optimize algorithm'
          }
        ],
        underutilizedPaths: [],
        memoryPressure: 50,
        cpuUtilization: 0.9,
        ioWaitTime: 0.1,
        failureProbability: 0.15,
        performanceTrend: Trend.Degrading,
        suggestedOptimizations: []
      };

      mockService.calculateSystemMetrics.mockResolvedValue(mockMetrics);

      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/analysis/bottlenecks'
      );

      // Assert
      expect(responseData.success).toBe(true);
      expect(responseData.data.bottlenecks).toEqual(mockMetrics.bottlenecks);
      expect(responseData.data.total).toBe(1);
    });
  });

  describe('POST /api/flow/simulate', () => {
    beforeEach(() => {
      mockReq.method = 'POST';
      
      // Mock request body parsing
      (mockReq as any).on = jest.fn((event: string, callback: Function) => {
        if (event === 'data') {
          callback(JSON.stringify({ particleCount: 1000, viscosity: 0.5 }));
        } else if (event === 'end') {
          callback();
        }
      });
    });

    it('should accept simulation parameters', async () => {
      // Execute
      await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/simulate'
      );

      // Assert
      expect(responseData.success).toBe(true);
      expect(responseData.data.message).toBe('Simulation parameters accepted');
      expect(responseData.data.params).toEqual({
        particleCount: 1000,
        viscosity: 0.5
      });
    });
  });

  describe('route matching', () => {
    it('should return false for non-flow routes', async () => {
      const handled = await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/other/endpoint'
      );

      expect(handled).toBe(false);
      expect(responseData).toBeNull();
    });

    it('should handle route errors gracefully', async () => {
      // Force an error by making service throw
      mockService.calculateSystemMetrics.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Execute
      const handled = await routes.handleRequest(
        mockReq as IncomingMessage,
        mockRes as ServerResponse,
        '/api/flow/metrics/system'
      );

      // Assert
      expect(handled).toBe(true);
      expect(responseStatus).toBe(500);
      expect(responseData.success).toBe(false);
    });
  });
});