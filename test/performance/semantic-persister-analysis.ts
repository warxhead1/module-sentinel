/**
 * Performance Analysis Test for SemanticDataPersister
 * 
 * This test analyzes the performance characteristics and behavior
 * of the SemanticDataPersister to identify bottlenecks and optimize
 * relationship generation.
 */

import { BaseTest } from '../helpers/BaseTest.js';
import { TestResult } from '../helpers/JUnitReporter.js';
import Database from 'better-sqlite3';
import { SemanticDataPersister } from '../../src/analysis/semantic-data-persister.js';
import { LocalCodeEmbeddingEngine } from '../../src/analysis/local-code-embedding.js';
import { PatternRecognitionEngine } from '../../src/analysis/pattern-recognition-engine.js';
import { performance } from 'perf_hooks';
import { MemoryMonitor, checkMemory } from '../../src/utils/memory-monitor.js';

interface PerformanceMetrics {
  operationName: string;
  duration: number;
  symbolCount: number;
  relationshipCount: number;
  memoryUsed: number;
  throughput: number;
}

export class SemanticPersisterAnalysisTest extends BaseTest {
  private persister!: SemanticDataPersister;
  private embeddingEngine!: LocalCodeEmbeddingEngine;
  private patternEngine!: PatternRecognitionEngine;
  private metrics: PerformanceMetrics[] = [];

  constructor(db: Database) {
    super('SemanticPersisterAnalysisTest', db);
  }

  async setup(): Promise<void> {
    await super.setup();
    
    // Initialize dependencies
    this.embeddingEngine = new LocalCodeEmbeddingEngine(this.db);
    this.patternEngine = new PatternRecognitionEngine(this.db);
    
    // Initialize the persister
    this.persister = new SemanticDataPersister(
      this.db,
      this.embeddingEngine,
      this.patternEngine,
      { debugMode: false }
    );
    
    this.logger.info('SemanticDataPersister initialized for performance analysis');
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test 1: Analyze small batch performance
    results.push(await this.analyzeSmallBatchPerformance());
    
    // Test 2: Analyze large batch performance
    results.push(await this.analyzeLargeBatchPerformance());
    
    // Test 3: Analyze relationship generation patterns
    results.push(await this.analyzeRelationshipGeneration());
    
    // Test 4: Memory usage analysis
    results.push(await this.analyzeMemoryUsage());
    
    // Generate performance report
    this.generatePerformanceReport();
    
    return results;
  }

  private async analyzeSmallBatchPerformance(): Promise<TestResult> {
    const testName = 'small_batch_performance';
    const startTime = performance.now();
    
    try {
      // Create test symbols
      const testSymbols = this.createTestSymbols(10);
      const memStart = process.memoryUsage().heapUsed;
      
      // Measure persisting performance
      const persistStart = performance.now();
      const result = await this.persister.persistSemanticData(1, testSymbols);
      const persistDuration = performance.now() - persistStart;
      
      const memEnd = process.memoryUsage().heapUsed;
      const memoryUsed = memEnd - memStart;
      
      // Record metrics
      this.metrics.push({
        operationName: 'small_batch',
        duration: persistDuration,
        symbolCount: testSymbols.length,
        relationshipCount: result.relationshipsStored || 0,
        memoryUsed: memoryUsed / 1024 / 1024, // MB
        throughput: testSymbols.length / (persistDuration / 1000) // symbols/sec
      });
      
      // Assertions
      this.assert(result.success, 'Small batch persistence should succeed');
      this.assert(
        persistDuration < 1000, 
        `Small batch should complete in under 1s, took ${persistDuration.toFixed(2)}ms`
      );
      
      this.logger.info(`Small batch processed ${testSymbols.length} symbols in ${persistDuration.toFixed(2)}ms`);
      
      return {
        name: testName,
        status: 'passed',
        time: performance.now() - startTime
      };
    } catch (error) {
      this.logger.error('Small batch performance test failed', error);
      return {
        name: testName,
        status: 'failed',
        time: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async analyzeLargeBatchPerformance(): Promise<TestResult> {
    const testName = 'large_batch_performance';
    const startTime = performance.now();
    
    try {
      // Create larger test set
      const testSymbols = this.createTestSymbols(100);
      const memStart = process.memoryUsage().heapUsed;
      
      // Measure persisting performance
      const persistStart = performance.now();
      const result = await this.persister.persistSemanticData(1, testSymbols);
      const persistDuration = performance.now() - persistStart;
      
      const memEnd = process.memoryUsage().heapUsed;
      const memoryUsed = memEnd - memStart;
      
      // Record metrics
      this.metrics.push({
        operationName: 'large_batch',
        duration: persistDuration,
        symbolCount: testSymbols.length,
        relationshipCount: result.relationshipsStored || 0,
        memoryUsed: memoryUsed / 1024 / 1024, // MB
        throughput: testSymbols.length / (persistDuration / 1000) // symbols/sec
      });
      
      // Calculate relationship ratio
      const relationshipRatio = (result.relationshipsStored || 0) / testSymbols.length;
      
      // Assertions
      this.assert(result.success, 'Large batch persistence should succeed');
      this.assert(
        relationshipRatio < 100, 
        `Relationship explosion detected: ${relationshipRatio.toFixed(2)} relationships per symbol`
      );
      
      this.logger.info(
        `Large batch: ${testSymbols.length} symbols → ${result.relationshipsStored} relationships ` +
        `(${relationshipRatio.toFixed(2)}x ratio)`
      );
      
      return {
        name: testName,
        status: 'passed',
        time: performance.now() - startTime
      };
    } catch (error) {
      this.logger.error('Large batch performance test failed', error);
      return {
        name: testName,
        status: 'failed',
        time: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async analyzeRelationshipGeneration(): Promise<TestResult> {
    const testName = 'relationship_generation_analysis';
    const startTime = performance.now();
    
    try {
      // Create symbols with known relationships
      const classSymbol = this.createSymbol(1, 'TestClass', 'class');
      const methodSymbol = this.createSymbol(2, 'testMethod', 'method');
      const calledFunction = this.createSymbol(3, 'helperFunction', 'function');
      
      // Add relationships
      methodSymbol.relationships = [{
        fromName: 'testMethod',
        toName: 'helperFunction',
        relationshipType: 'calls',
        confidence: 0.9,
        crossLanguage: false
      }];
      
      const testSymbols = [classSymbol, methodSymbol, calledFunction];
      
      // Persist and analyze
      const result = await this.persister.persistSemanticData(1, testSymbols);
      
      // Verify relationship handling
      this.assert(
        result.relationshipsStored !== undefined && result.relationshipsStored > 0,
        'Should store at least the explicit relationship'
      );
      
      // Check for reasonable similarity relationships
      const maxExpectedRelationships = (testSymbols.length * (testSymbols.length - 1)) / 2;
      this.assert(
        result.relationshipsStored <= maxExpectedRelationships,
        `Should not exceed theoretical maximum of ${maxExpectedRelationships} relationships`
      );
      
      this.logger.info(
        `Relationship analysis: ${testSymbols.length} symbols generated ${result.relationshipsStored} relationships`
      );
      
      return {
        name: testName,
        status: 'passed',
        time: performance.now() - startTime
      };
    } catch (error) {
      this.logger.error('Relationship generation analysis failed', error);
      return {
        name: testName,
        status: 'failed',
        time: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async analyzeMemoryUsage(): Promise<TestResult> {
    const testName = 'memory_usage_analysis';
    const startTime = performance.now();
    
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Use MemoryMonitor for better tracking
      const memoryMonitor = new MemoryMonitor({
        warningPercent: 70,
        criticalPercent: 85,
        maxHeapMB: 2048
      });
      
      const initialMemory = checkMemory();
      const symbolCounts = [10, 50, 100, 200];
      const memoryGrowth: number[] = [];
      const memorySnapshots: Array<{
        count: number;
        beforeMB: number;
        afterMB: number;
        growthMB: number;
        percentUsed: number;
      }> = [];
      
      this.logger.info('Initial memory state', {
        heapUsed: `${initialMemory.heapUsedMB.toFixed(2)} MB`,
        percentUsed: `${initialMemory.percentUsed.toFixed(1)}%`
      });
      
      for (const count of symbolCounts) {
        const symbols = this.createTestSymbols(count);
        
        // Create checkpoint for this operation
        const checkpoint = memoryMonitor.createCheckpoint(`persist_${count}_symbols`);
        
        const memBefore = checkMemory();
        await this.persister.persist(1, symbols);
        const memAfter = checkMemory();
        
        const { duration, memoryDelta } = checkpoint.complete();
        const growth = memAfter.heapUsedMB - memBefore.heapUsedMB;
        memoryGrowth.push(growth);
        
        memorySnapshots.push({
          count,
          beforeMB: memBefore.heapUsedMB,
          afterMB: memAfter.heapUsedMB,
          growthMB: growth,
          percentUsed: memAfter.percentUsed
        });
        
        this.logger.debug(`${count} symbols memory impact`, {
          growth: `${growth.toFixed(2)} MB`,
          delta: `${(memoryDelta / 1024 / 1024).toFixed(2)} MB`,
          duration: Math.round(duration),
          percentUsed: `${memAfter.percentUsed.toFixed(1)}%`
        });
      }
      
      // Calculate memory efficiency metrics
      const totalGrowth = memorySnapshots[memorySnapshots.length - 1].afterMB - initialMemory.heapUsedMB;
      const avgGrowthPerSymbol = totalGrowth / symbolCounts[symbolCounts.length - 1];
      const avgGrowthRate = memoryGrowth[memoryGrowth.length - 1] / memoryGrowth[0];
      
      this.logger.info('Memory usage summary', {
        totalGrowth: `${totalGrowth.toFixed(2)} MB`,
        avgPerSymbol: `${(avgGrowthPerSymbol * 1024).toFixed(2)} KB/symbol`,
        growthRate: `${avgGrowthRate.toFixed(2)}x`
      });
      
      // Check for linear memory growth
      this.assert(
        avgGrowthRate < 50,
        `Memory growth should be reasonable, but grew ${avgGrowthRate.toFixed(2)}x`
      );
      
      // Check final memory usage
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      this.assert(
        finalMemory.percentUsed < 80,
        `Memory usage should stay below 80%, but reached ${finalMemory.percentUsed.toFixed(1)}%`
      );
      
      return {
        name: testName,
        status: 'passed',
        time: performance.now() - startTime
      };
    } catch (error) {
      this.logger.error('Memory usage analysis failed', error);
      return {
        name: testName,
        status: 'failed',
        time: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private createTestSymbols(count: number): any[] {
    const symbols: any[] = [];
    for (let i = 0; i < count; i++) {
      symbols.push(this.createSymbol(i, `symbol_${i}`, i % 2 === 0 ? 'class' : 'function'));
    }
    return symbols;
  }

  private createSymbol(id: number, name: string, kind: string): any {
    return {
      id,
      projectId: 1,
      name,
      qualifiedName: `test::${name}`,
      kind,
      filePath: '/test/file.cpp',
      line: id * 10,
      column: 1,
      signature: kind === 'function' ? '()' : undefined,
      visibility: 'public',
      complexity: 1,
      semanticTags: [],
      confidence: 1.0,
      relationships: []
    };
  }

  private generatePerformanceReport(): void {
    if (this.metrics.length === 0) return;
    
    this.logger.info('\n=== Performance Analysis Report ===');
    
    // Summary statistics
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const totalSymbols = this.metrics.reduce((sum, m) => sum + m.symbolCount, 0);
    const totalRelationships = this.metrics.reduce((sum, m) => sum + m.relationshipCount, 0);
    
    this.logger.info(`Total operations: ${this.metrics.length}`);
    this.logger.info(`Total time: ${totalDuration.toFixed(2)}ms`);
    this.logger.info(`Total symbols processed: ${totalSymbols}`);
    this.logger.info(`Total relationships created: ${totalRelationships}`);
    this.logger.info(`Average relationship ratio: ${(totalRelationships / totalSymbols).toFixed(2)}`);
    
    // Detailed metrics
    this.logger.info('\nDetailed Metrics:');
    this.metrics.forEach(metric => {
      this.logger.info(
        `  ${metric.operationName}: ${metric.duration.toFixed(2)}ms, ` +
        `${metric.throughput.toFixed(2)} symbols/sec, ` +
        `${metric.memoryUsed.toFixed(2)} MB`
      );
    });
  }
}