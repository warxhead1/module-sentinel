/**
 * Performance tests for ModuleSentinelBridge
 * Tests performance characteristics and memory usage
 */

import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { ModuleSentinelBridge } from '../module-sentinel-bridge';
import { createTestProject, measurePerformance, getMemoryUsage, type TestProjectSetup } from './helpers/test-utils';

describe('ModuleSentinelBridge Performance Tests', () => {
  let testSetup: TestProjectSetup;

  beforeAll(async () => {
    testSetup = await createTestProject();
    await testSetup.bridge.initialize();
  }, 30000);

  afterAll(async () => {
    await testSetup.cleanup();
  });

  beforeEach(async () => {
    // Ensure fresh state for each test
    await testSetup.bridge.index_project({ force: true });
  }, 15000);

  describe('Indexing Performance', () => {
    test('should index project within performance threshold', async () => {
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.index_project({ force: true }),
        'Project indexing'
      );

      // Should complete within 10 seconds for small test project
      expect(duration).toBeLessThan(10000);
    });

    test('should handle incremental indexing efficiently', async () => {
      // Initial index
      await testSetup.bridge.index_project({ force: true });

      // Incremental index (should be faster)
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.index_project({ force: false }),
        'Incremental indexing'
      );

      // Incremental should be very fast
      expect(duration).toBeLessThan(2000);
    });

    test('should track memory usage during indexing', async () => {
      const beforeMemory = getMemoryUsage();
      
      await testSetup.bridge.index_project({ force: true });
      
      const afterMemory = getMemoryUsage();
      
      // Memory increase should be reasonable (less than 100MB)
      const memoryIncrease = afterMemory.heapUsed - beforeMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Search Performance', () => {
    test('should search symbols within performance threshold', async () => {
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.search_symbols('function', { limit: 100 }),
        'Symbol search'
      );

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    test('should handle large result sets efficiently', async () => {
      const { result, duration } = await measurePerformance(
        async () => await testSetup.bridge.search_symbols('*', { limit: 1000 }),
        'Large symbol search'
      );

      // Should handle large searches reasonably fast
      expect(duration).toBeLessThan(5000);
      expect(Array.isArray(result)).toBe(true);
    });

    test('should scale linearly with result count', async () => {
      const smallSearch = await measurePerformance(
        async () => await testSetup.bridge.search_symbols('*', { limit: 10 }),
        'Small search'
      );

      const largeSearch = await measurePerformance(
        async () => await testSetup.bridge.search_symbols('*', { limit: 100 }),
        'Large search'
      );

      // Large search shouldn't be more than 10x slower than small search
      const ratio = largeSearch.duration / smallSearch.duration;
      expect(ratio).toBeLessThan(10);
    });
  });

  describe('Analysis Performance', () => {
    test('should analyze patterns within performance threshold', async () => {
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.analyze_patterns(),
        'Pattern analysis'
      );

      // Should complete within 15 seconds
      expect(duration).toBeLessThan(15000);
    });

    test('should calculate similarity efficiently', async () => {
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 2 });
      
      if (symbols.length < 2) {
        console.warn('Not enough symbols for similarity performance test');
        return;
      }

      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.calculate_similarity(symbols[0].id, symbols[1].id),
        'Similarity calculation'
      );

      // Should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });

    test('should analyze code quality efficiently', async () => {
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.analyze_code_quality(
          `${testSetup.projectPath}/src/main.ts`,
          'TypeScript',
          true
        ),
        'Code quality analysis'
      );

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('File Parsing Performance', () => {
    test('should parse files within performance threshold', async () => {
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.parse_file(
          `${testSetup.projectPath}/src/main.ts`,
          'TypeScript'
        ),
        'File parsing'
      );

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    test('should handle multiple file types efficiently', async () => {
      const files = [
        { path: `${testSetup.projectPath}/src/main.ts`, language: 'TypeScript' as const },
        { path: `${testSetup.projectPath}/src/helper.js`, language: 'JavaScript' as const },
        { path: `${testSetup.projectPath}/src/lib.rs`, language: 'Rust' as const }
      ];

      for (const file of files) {
        const { duration } = await measurePerformance(
          async () => await testSetup.bridge.parse_file(file.path, file.language),
          `Parsing ${file.language} file`
        );

        expect(duration).toBeLessThan(3000);
      }
    });
  });

  describe('Relationship Performance', () => {
    test('should retrieve all relationships efficiently', async () => {
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.get_all_relationships(),
        'Get all relationships'
      );

      // Should complete within 3 seconds
      expect(duration).toBeLessThan(3000);
    });

    test('should retrieve symbol relationships efficiently', async () => {
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 1 });
      
      if (symbols.length === 0) {
        console.warn('No symbols for relationship performance test');
        return;
      }

      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.get_symbol_relationships(symbols[0].id),
        'Get symbol relationships'
      );

      // Should complete within 1 second
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent searches efficiently', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        measurePerformance(
          async () => await testSetup.bridge.search_symbols(`test${i}`, { limit: 10 }),
          `Concurrent search ${i}`
        )
      );

      const results = await Promise.all(promises);
      
      // All searches should complete
      expect(results).toHaveLength(5);
      
      // No search should take more than 5 seconds
      results.forEach(({ duration }) => {
        expect(duration).toBeLessThan(5000);
      });
    });

    test('should handle concurrent parsing efficiently', async () => {
      const files = [
        `${testSetup.projectPath}/src/main.ts`,
        `${testSetup.projectPath}/src/helper.js`,
        `${testSetup.projectPath}/src/lib.rs`
      ];

      const languages = ['TypeScript', 'JavaScript', 'Rust'] as const;

      const promises = files.map((file, i) =>
        measurePerformance(
          async () => await testSetup.bridge.parse_file(file, languages[i]),
          `Concurrent parse ${i}`
        )
      );

      const results = await Promise.all(promises);
      
      // All parses should complete
      expect(results).toHaveLength(3);
      
      // No parse should take more than 5 seconds
      results.forEach(({ duration }) => {
        expect(duration).toBeLessThan(5000);
      });
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory during repeated operations', async () => {
      const initialMemory = getMemoryUsage();
      
      // Perform multiple operations
      for (let i = 0; i < 10; i++) {
        await testSetup.bridge.search_symbols('*', { limit: 50 });
        await testSetup.bridge.analyze_patterns();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = getMemoryUsage();
      
      // Memory increase should be reasonable
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    });

    test('should handle large datasets efficiently', async () => {
      const beforeMemory = getMemoryUsage();
      
      // Search for many symbols
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 1000 });
      
      const afterMemory = getMemoryUsage();
      
      // Memory per symbol should be reasonable
      if (symbols.length > 0) {
        const memoryPerSymbol = (afterMemory.heapUsed - beforeMemory.heapUsed) / symbols.length;
        expect(memoryPerSymbol).toBeLessThan(10 * 1024); // Less than 10KB per symbol
      }
    });
  });

  describe('Error Handling Performance', () => {
    test('should handle errors efficiently', async () => {
      const { duration } = await measurePerformance(
        async () => {
          try {
            await testSetup.bridge.parse_file('/non/existent/file.ts', 'TypeScript');
          } catch {
            // Expected to fail
          }
        },
        'Error handling'
      );

      // Error handling should be fast
      expect(duration).toBeLessThan(1000);
    });

    test('should recover from errors gracefully', async () => {
      // Cause an error
      try {
        await testSetup.bridge.parse_file('/non/existent/file.ts', 'TypeScript');
      } catch {
        // Expected
      }

      // Should still work normally after error
      const { duration } = await measurePerformance(
        async () => await testSetup.bridge.search_symbols('*', { limit: 10 }),
        'Recovery after error'
      );

      expect(duration).toBeLessThan(2000);
    });
  });
});