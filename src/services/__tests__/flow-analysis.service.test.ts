/**
 * Unit tests for Flow Analysis Service
 */

import { FlowAnalysisService } from '../flow-analysis.service';
import { ModuleSentinelBridge } from '../../rust-bridge/module-sentinel-bridge';
import type {
  EnhancedSymbolData,
  DataFlowRelationship,
  SystemFlowMetrics
} from '../../types/flow-types';
import {
  FlowType,
  SymbolKind,
  BottleneckType,
  Trend
} from '../../types/flow-types';
import type { Symbol, UniversalRelationship } from '../../types/rust-bindings';

// Mock the ModuleSentinelBridge
jest.mock('../../rust-bridge/module-sentinel-bridge');

describe('FlowAnalysisService', () => {
  let service: FlowAnalysisService;
  let mockBridge: jest.Mocked<ModuleSentinelBridge>;

  beforeEach(() => {
    // Create mock bridge
    mockBridge = new ModuleSentinelBridge('test-project') as jest.Mocked<ModuleSentinelBridge>;
    service = new FlowAnalysisService(mockBridge);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEnhancedSymbols', () => {
    it('should enhance basic symbols with metrics', async () => {
      // Mock data
      const mockSymbols: Symbol[] = [
        {
          id: 'sym1',
          name: 'testFunction',
          signature: 'function testFunction()',
          language: 'TypeScript' as any,
          file_path: '/test/file.ts',
          start_line: 10,
          end_line: 20,
          normalized_name: 'testfunction',
          similar_symbols: []
        }
      ];

      mockBridge.searchSymbols.mockResolvedValue(mockSymbols);

      // Execute
      const result = await service.getEnhancedSymbols();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'sym1',
        name: 'testFunction',
        kind: SymbolKind.Function,
        filePath: '/test/file.ts',
        lineRange: [10, 20],
        linesOfCode: 11
      });

      // Check that metrics are generated
      expect(result[0].cyclomaticComplexity).toBeGreaterThan(0);
      expect(result[0].cognitiveComplexity).toBeGreaterThan(0);
      expect(result[0].documentationScore).toBeLessThanOrEqual(1);
    });

    it('should filter symbols by kind', async () => {
      const mockSymbols: Symbol[] = [
        {
          id: 'sym1',
          name: 'TestClass',
          signature: 'class TestClass',
          language: 'TypeScript' as any,
          file_path: '/test/file.ts',
          start_line: 1,
          end_line: 50,
          normalized_name: 'testclass',
          similar_symbols: []
        }
      ];

      mockBridge.searchSymbols.mockResolvedValue(mockSymbols);

      // Execute with filter
      const result = await service.getEnhancedSymbols({ 
        kind: SymbolKind.Class,
        limit: 10 
      });

      // Assert
      expect(mockBridge.searchSymbols).toHaveBeenCalledWith('*', {
        kind: SymbolKind.Class,
        limit: 10
      });
      expect(result[0].kind).toBe(SymbolKind.Class);
    });
  });

  describe('getFlowRelationships', () => {
    it('should transform universal relationships to flow relationships', async () => {
      // Mock data
      const mockRelationships: UniversalRelationship[] = [
        {
          id: 1,
          project_id: 1,
          from_symbol_id: 10,
          to_symbol_id: 20,
          relationship_type: 'calls',
          strength: 0.9,
          confidence: 0.8,
          is_inferred: false,
          created_at: '2024-01-01'
        }
      ];

      mockBridge.getSymbolRelationships.mockResolvedValue(mockRelationships);

      // Execute
      const result = await service.getFlowRelationships();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sourceId: '10',
        targetId: '20',
        flowType: FlowType.DataFlow,
        dataVolume: 90, // strength * 100
        frequency: 8,   // confidence * 10
        reliability: 0.8,
        isCriticalPath: true, // strength > 0.8
        bottleneckScore: expect.closeTo(20, 0) // (1 - confidence) * 100
      });
    });

    it('should filter relationships by flow type', async () => {
      const mockRelationships: UniversalRelationship[] = [
        {
          id: 1,
          project_id: 1,
          from_symbol_id: 10,
          to_symbol_id: 20,
          relationship_type: 'async_calls',
          strength: 0.7,
          confidence: 0.9,
          is_inferred: false,
          created_at: '2024-01-01'
        },
        {
          id: 2,
          project_id: 1,
          from_symbol_id: 30,
          to_symbol_id: 40,
          relationship_type: 'network_request',
          strength: 0.6,
          confidence: 0.85,
          is_inferred: false,
          created_at: '2024-01-01'
        }
      ];

      mockBridge.getSymbolRelationships.mockResolvedValue(mockRelationships);

      // Execute
      const result = await service.getFlowRelationships(FlowType.AsyncMessage);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].flowType).toBe(FlowType.AsyncMessage);
    });
  });

  describe('calculateSystemMetrics', () => {
    beforeEach(() => {
      // Mock enhanced symbols
      const mockSymbols: Symbol[] = [
        {
          id: 'sym1',
          name: 'complexFunction',
          signature: 'function',
          language: 'TypeScript' as any,
          file_path: '/test/file.ts',
          start_line: 1,
          end_line: 100,
          normalized_name: 'complexfunction',
          similar_symbols: []
        },
        {
          id: 'sym2',
          name: 'simpleFunction',
          signature: 'function',
          language: 'TypeScript' as any,
          file_path: '/test/file2.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'simplefunction',
          similar_symbols: []
        }
      ];

      const mockRelationships: UniversalRelationship[] = [
        {
          id: 1,
          project_id: 1,
          from_symbol_id: 1,
          to_symbol_id: 2,
          relationship_type: 'calls',
          strength: 0.9,
          confidence: 0.95,
          is_inferred: false,
          created_at: '2024-01-01'
        }
      ];

      mockBridge.searchSymbols.mockResolvedValue(mockSymbols);
      mockBridge.getSymbolRelationships.mockResolvedValue(mockRelationships);
    });

    it('should calculate comprehensive system metrics', async () => {
      // Execute
      const result = await service.calculateSystemMetrics();

      // Assert structure
      expect(result).toHaveProperty('systemPressure');
      expect(result).toHaveProperty('flowEfficiency');
      expect(result).toHaveProperty('averageLatency');
      expect(result).toHaveProperty('errorRate');
      expect(result).toHaveProperty('criticalPaths');
      expect(result).toHaveProperty('bottlenecks');
      expect(result).toHaveProperty('underutilizedPaths');
      expect(result).toHaveProperty('memoryPressure');
      expect(result).toHaveProperty('cpuUtilization');
      expect(result).toHaveProperty('ioWaitTime');
      expect(result).toHaveProperty('failureProbability');
      expect(result).toHaveProperty('performanceTrend');
      expect(result).toHaveProperty('suggestedOptimizations');

      // Assert ranges
      expect(result.systemPressure).toBeGreaterThanOrEqual(0);
      expect(result.systemPressure).toBeLessThanOrEqual(100);
      expect(result.flowEfficiency).toBeGreaterThanOrEqual(0);
      expect(result.flowEfficiency).toBeLessThanOrEqual(1);
      expect(result.errorRate).toBeGreaterThanOrEqual(0);
      expect(result.errorRate).toBeLessThanOrEqual(1);
    });

    it('should identify bottlenecks based on flow patterns', async () => {
      // Mock symbols designed to trigger bottleneck detection
      const mockSymbols: Symbol[] = [
        {
          id: '1',
          name: 'InputSource1',
          signature: 'function InputSource1()',
          language: 'TypeScript' as any,
          file_path: '/input1.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'inputsource1',
          similar_symbols: []
        },
        {
          id: '2',
          name: 'BottleneckFunction',
          signature: 'function BottleneckFunction()',
          language: 'TypeScript' as any,
          file_path: '/bottleneck.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'bottleneckfunction',
          similar_symbols: []
        },
        {
          id: '3',
          name: 'InputSource2',
          signature: 'function InputSource2()',
          language: 'TypeScript' as any,
          file_path: '/input2.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'inputsource2',
          similar_symbols: []
        },
        {
          id: '4',
          name: 'InputSource3',
          signature: 'function InputSource3()',
          language: 'TypeScript' as any,
          file_path: '/input3.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'inputsource3',
          similar_symbols: []
        },
        {
          id: '5',
          name: 'InputSource4',
          signature: 'function InputSource4()',
          language: 'TypeScript' as any,
          file_path: '/input4.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'inputsource4',
          similar_symbols: []
        }
      ];
      
      // Create bottleneck: multiple inputs to symbol 2, but no outputs
      // This creates the condition: outgoingFlows.length / incomingFlows.length < 0.5 AND incomingFlows.length > 3
      const mockRelationships: UniversalRelationship[] = [
        {
          id: 1,
          project_id: 1,
          from_symbol_id: 1,
          to_symbol_id: 2,
          relationship_type: 'calls',
          strength: 0.9,
          confidence: 0.9,
          is_inferred: false,
          created_at: '2024-01-01'
        },
        {
          id: 2,
          project_id: 1,
          from_symbol_id: 3,
          to_symbol_id: 2,
          relationship_type: 'calls',
          strength: 0.8,
          confidence: 0.9,
          is_inferred: false,
          created_at: '2024-01-01'
        },
        {
          id: 3,
          project_id: 1,
          from_symbol_id: 4,
          to_symbol_id: 2,
          relationship_type: 'calls',
          strength: 0.7,
          confidence: 0.9,
          is_inferred: false,
          created_at: '2024-01-01'
        },
        {
          id: 4,
          project_id: 1,
          from_symbol_id: 5,
          to_symbol_id: 2,
          relationship_type: 'calls',
          strength: 0.6,
          confidence: 0.9,
          is_inferred: false,
          created_at: '2024-01-01'
        }
        // Note: No outgoing relationships from symbol 2 = bottleneck!
      ];

      mockBridge.searchSymbols.mockResolvedValue(mockSymbols);
      mockBridge.getSymbolRelationships.mockResolvedValue(mockRelationships);

      // Execute
      const result = await service.calculateSystemMetrics();

      // Assert bottlenecks detected
      expect(result.bottlenecks.length).toBeGreaterThan(0);
      // Look for any bottleneck since detection logic may vary
      const bottleneck = result.bottlenecks[0];
      expect(bottleneck).toBeDefined();
      expect(bottleneck?.type).toBeDefined();
      expect(bottleneck?.severity).toBeGreaterThan(0);
    });

    it('should generate optimization suggestions', async () => {
      // Execute
      const result = await service.calculateSystemMetrics();

      // Assert optimizations
      expect(result.suggestedOptimizations).toBeDefined();
      expect(Array.isArray(result.suggestedOptimizations)).toBe(true);
      
      if (result.suggestedOptimizations.length > 0) {
        const optimization = result.suggestedOptimizations[0];
        expect(optimization).toHaveProperty('type');
        expect(optimization).toHaveProperty('symbolId');
        expect(optimization).toHaveProperty('description');
        expect(optimization).toHaveProperty('estimatedImprovement');
        expect(optimization).toHaveProperty('complexity');
      }
    });
  });

  describe('identifyCriticalPaths', () => {
    it('should trace critical paths through the system', async () => {
      const mockSymbols: Symbol[] = [
        { id: 'start', name: 'startFunction', signature: 'function', language: 'TypeScript' as any, file_path: '/start.ts', start_line: 1, end_line: 10, normalized_name: 'start', similar_symbols: [] },
        { id: 'middle', name: 'middleFunction', signature: 'function', language: 'TypeScript' as any, file_path: '/middle.ts', start_line: 1, end_line: 20, normalized_name: 'middle', similar_symbols: [] },
        { id: 'end', name: 'endFunction', signature: 'function', language: 'TypeScript' as any, file_path: '/end.ts', start_line: 1, end_line: 15, normalized_name: 'end', similar_symbols: [] }
      ];

      const mockRelationships: UniversalRelationship[] = [
        { id: 1, project_id: 1, from_symbol_id: 1, to_symbol_id: 2, relationship_type: 'calls', strength: 0.9, confidence: 0.9, is_inferred: false, created_at: '2024-01-01' },
        { id: 2, project_id: 1, from_symbol_id: 2, to_symbol_id: 3, relationship_type: 'calls', strength: 0.8, confidence: 0.8, is_inferred: false, created_at: '2024-01-01' }
      ];

      mockBridge.searchSymbols.mockResolvedValue(mockSymbols);
      mockBridge.getSymbolRelationships.mockResolvedValue(mockRelationships);

      // Get enhanced data
      const enhancedSymbols = await service.getEnhancedSymbols();
      const flowRelationships = await service.getFlowRelationships();

      // Execute
      const paths = await service.identifyCriticalPaths(enhancedSymbols, flowRelationships);

      // Assert
      expect(paths).toBeDefined();
      expect(Array.isArray(paths)).toBe(true);
      
      // Critical paths should be sorted by importance
      if (paths.length > 1) {
        expect(paths[0].importance).toBeGreaterThanOrEqual(paths[1].importance);
      }
    });
  });

  describe('cache behavior', () => {
    it('should cache system metrics for performance', async () => {
      // Setup mocks for consistent returns
      const mockSymbols: Symbol[] = [
        {
          id: 'cache-sym1',
          name: 'CacheTest',
          signature: 'function CacheTest()',
          language: 'TypeScript' as any,
          file_path: '/cache.ts',
          start_line: 1,
          end_line: 10,
          normalized_name: 'cachetest',
          similar_symbols: []
        }
      ];
      
      const mockRelationships: UniversalRelationship[] = [
        {
          id: 1,
          project_id: 1,
          from_symbol_id: 1,
          to_symbol_id: 2,
          relationship_type: 'calls',
          strength: 0.8,
          confidence: 0.9,
          is_inferred: false,
          created_at: '2024-01-01'
        }
      ];
      
      mockBridge.searchSymbols.mockResolvedValue(mockSymbols);
      mockBridge.getSymbolRelationships.mockResolvedValue(mockRelationships);
      
      // First call
      const metrics1 = await service.calculateSystemMetrics();
      
      // Second call should use cache
      const metrics2 = await service.calculateSystemMetrics();
      
      // Should return same timestamp (indicating cache hit)
      expect(metrics1.timestamp).toBe(metrics2.timestamp);
      
      // Bridge should only be called once for each data type
      expect(mockBridge.searchSymbols).toHaveBeenCalledTimes(1);
      expect(mockBridge.getSymbolRelationships).toHaveBeenCalledTimes(1);
    });
  });
});