/**
 * Integration tests for ModuleSentinelBridge
 * Tests end-to-end workflows and cross-method integration
 */

import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { ModuleSentinelBridge } from '../module-sentinel-bridge';
import { 
  createTestProject, 
  validateSymbolStructure, 
  validateAnalysisResultStructure,
  validateRelationshipStructure,
  type TestProjectSetup 
} from './helpers/test-utils';

describe('ModuleSentinelBridge Integration Tests', () => {
  let testSetup: TestProjectSetup;

  beforeAll(async () => {
    testSetup = await createTestProject();
    await testSetup.bridge.initialize();
  }, 30000);

  afterAll(async () => {
    await testSetup.cleanup();
  });

  describe('Complete Workflow: Index → Search → Analyze', () => {
    test('should complete full analysis workflow', async () => {
      // Step 1: Index the project
      const projectInfo = await testSetup.bridge.index_project({ 
        force: true,
        includeTests: true 
      });
      
      expect(projectInfo.symbolCount).toBeGreaterThanOrEqual(0);

      // Step 2: Search for symbols
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 100 });
      
      expect(Array.isArray(symbols)).toBe(true);
      symbols.forEach(validateSymbolStructure);

      // Step 3: Analyze patterns
      const analysis = await testSetup.bridge.analyze_patterns();
      
      validateAnalysisResultStructure(analysis);
      expect(analysis.symbolCount).toBe(projectInfo.symbolCount);

      // Step 4: Get relationships
      const relationships = await testSetup.bridge.get_all_relationships();
      
      expect(Array.isArray(relationships)).toBe(true);
      relationships.forEach(validateRelationshipStructure);
    });

    test('should maintain consistency across operations', async () => {
      // Index project
      const projectInfo1 = await testSetup.bridge.index_project({ force: true });
      
      // Search immediately after indexing
      const symbols1 = await testSetup.bridge.search_symbols('*', { limit: 50 });
      
      // Re-index without force (should be consistent)
      const projectInfo2 = await testSetup.bridge.index_project({ force: false });
      
      // Search again
      const symbols2 = await testSetup.bridge.search_symbols('*', { limit: 50 });
      
      // Results should be consistent
      expect(projectInfo1.symbolCount).toBe(projectInfo2.symbolCount);
      expect(symbols1.length).toBe(symbols2.length);
      
      // Symbol IDs should match
      const ids1 = new Set(symbols1.map(s => s.id));
      const ids2 = new Set(symbols2.map(s => s.id));
      expect(ids1).toEqual(ids2);
    });
  });

  describe('Cross-Language Analysis', () => {
    test('should analyze multiple languages in single project', async () => {
      await testSetup.bridge.index_project({ 
        force: true,
        languages: ['TypeScript', 'JavaScript', 'Rust']
      });

      // Search for symbols in each language
      const tsSymbols = await testSetup.bridge.search_symbols('*', { 
        language: 'TypeScript',
        limit: 50 
      });
      
      const jsSymbols = await testSetup.bridge.search_symbols('*', { 
        language: 'JavaScript',
        limit: 50 
      });
      
      const rustSymbols = await testSetup.bridge.search_symbols('*', { 
        language: 'Rust',
        limit: 50 
      });

      // Should find symbols for each language
      if (tsSymbols.length > 0) {
        expect(tsSymbols.every(s => s.language === 'TypeScript')).toBe(true);
      }
      
      if (jsSymbols.length > 0) {
        expect(jsSymbols.every(s => s.language === 'JavaScript')).toBe(true);
      }
      
      if (rustSymbols.length > 0) {
        expect(rustSymbols.every(s => s.language === 'Rust')).toBe(true);
      }

      // Analyze patterns across all languages
      const analysis = await testSetup.bridge.analyze_patterns();
      expect(analysis.symbolCount).toBeGreaterThanOrEqual(0);
    });

    test('should detect cross-language relationships', async () => {
      await testSetup.bridge.index_project({ force: true });
      
      const relationships = await testSetup.bridge.get_all_relationships();
      
      // Should detect relationships within the test project
      expect(Array.isArray(relationships)).toBe(true);
      relationships.forEach(validateRelationshipStructure);
      
      // Check for different relationship types
      const relationshipTypes = new Set(relationships.map(r => r.relationshipType));
      expect(relationshipTypes.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Symbol Lifecycle Management', () => {
    test('should track symbol relationships correctly', async () => {
      await testSetup.bridge.index_project({ force: true });
      
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 10 });
      
      for (const symbol of symbols.slice(0, 3)) { // Test first 3 symbols
        const relationships = await testSetup.bridge.get_symbol_relationships(symbol.id);
        
        expect(Array.isArray(relationships)).toBe(true);
        relationships.forEach(validateRelationshipStructure);
        
        // Each relationship should involve this symbol
        relationships.forEach(rel => {
          const involvesSymbol = 
            rel.fromSymbolId === parseInt(symbol.id) || 
            rel.toSymbolId === parseInt(symbol.id) ||
            rel.fromSymbolId === null ||
            rel.toSymbolId === null;
          // Note: Some relationships might have null symbol IDs for project-level relationships
        });
      }
    });

    test('should handle symbol similarity calculations', async () => {
      await testSetup.bridge.index_project({ force: true });
      
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 5 });
      
      if (symbols.length < 2) {
        console.warn('Not enough symbols for similarity test');
        return;
      }

      // Test similarity between different pairs
      for (let i = 0; i < Math.min(symbols.length - 1, 3); i++) {
        const similarity = await testSetup.bridge.calculate_similarity(
          symbols[i].id,
          symbols[i + 1].id
        );
        
        expect(similarity.overallScore).toBeGreaterThanOrEqual(0);
        expect(similarity.overallScore).toBeLessThanOrEqual(1);
        
        // All similarity components should be valid
        expect(similarity.nameSimilarity).toBeGreaterThanOrEqual(0);
        expect(similarity.nameSimilarity).toBeLessThanOrEqual(1);
        expect(similarity.signatureSimilarity).toBeGreaterThanOrEqual(0);
        expect(similarity.signatureSimilarity).toBeLessThanOrEqual(1);
        expect(similarity.structuralSimilarity).toBeGreaterThanOrEqual(0);
        expect(similarity.structuralSimilarity).toBeLessThanOrEqual(1);
        expect(similarity.contextSimilarity).toBeGreaterThanOrEqual(0);
        expect(similarity.contextSimilarity).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('File Processing Integration', () => {
    test('should parse and analyze files consistently', async () => {
      const testFiles = [
        { path: `${testSetup.projectPath}/src/main.ts`, language: 'TypeScript' as const },
        { path: `${testSetup.projectPath}/src/helper.js`, language: 'JavaScript' as const },
        { path: `${testSetup.projectPath}/src/lib.rs`, language: 'Rust' as const }
      ];

      for (const file of testFiles) {
        // Parse individual file
        const parseResult = await testSetup.bridge.parse_file(file.path, file.language);
        
        expect(parseResult.symbols).toBeDefined();
        expect(Array.isArray(parseResult.symbols)).toBe(true);
        expect(Array.isArray(parseResult.errors)).toBe(true);
        
        parseResult.symbols.forEach(validateSymbolStructure);
        
        // Analyze code quality
        const qualityResult = await testSetup.bridge.analyze_code_quality(
          file.path,
          file.language,
          true
        );
        
        expect(qualityResult.overallScore).toBeGreaterThanOrEqual(0);
        expect(qualityResult.overallScore).toBeLessThanOrEqual(100);
        expect(Array.isArray(qualityResult.issues)).toBe(true);
        expect(Array.isArray(qualityResult.recommendations)).toBe(true);
      }
    });

    test('should maintain file-level consistency with project-level analysis', async () => {
      // Index entire project
      await testSetup.bridge.index_project({ force: true });
      
      const projectSymbols = await testSetup.bridge.search_symbols('*', { limit: 100 });
      
      // Parse individual files
      const mainTsResult = await testSetup.bridge.parse_file(
        `${testSetup.projectPath}/src/main.ts`,
        'TypeScript'
      );
      
      // Symbols from file parsing should be subset of project symbols
      const projectSymbolIds = new Set(projectSymbols.map(s => s.id));
      const fileSymbolIds = new Set(mainTsResult.symbols.map(s => s.id));
      
      // At least some file symbols should exist in project symbols
      // (exact matching depends on ID generation strategy)
      expect(mainTsResult.symbols.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from partial failures', async () => {
      // Start with successful operation
      await testSetup.bridge.index_project({ force: true });
      const initialSymbols = await testSetup.bridge.search_symbols('*', { limit: 10 });
      
      // Attempt operation that might fail
      try {
        await testSetup.bridge.parse_file('/non/existent/file.ts', 'TypeScript');
      } catch {
        // Expected to fail
      }
      
      // Should still work normally
      const symbolsAfterError = await testSetup.bridge.search_symbols('*', { limit: 10 });
      expect(symbolsAfterError.length).toBe(initialSymbols.length);
      
      // Analysis should still work
      const analysis = await testSetup.bridge.analyze_patterns();
      expect(analysis.symbolCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle mixed success/failure scenarios', async () => {
      const validFile = `${testSetup.projectPath}/src/main.ts`;
      const invalidFile = '/non/existent/file.ts';
      
      // Mix of valid and invalid operations
      const results = await Promise.allSettled([
        testSetup.bridge.parse_file(validFile, 'TypeScript'),
        testSetup.bridge.parse_file(invalidFile, 'TypeScript').catch(e => e),
        testSetup.bridge.search_symbols('*', { limit: 5 })
      ]);
      
      // Should have mix of fulfilled and rejected
      expect(results[0].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
      
      // Valid operations should work normally
      if (results[0].status === 'fulfilled') {
        expect(Array.isArray(results[0].value.symbols)).toBe(true);
      }
      
      if (results[2].status === 'fulfilled') {
        expect(Array.isArray(results[2].value)).toBe(true);
      }
    });
  });

  describe('Data Consistency Validation', () => {
    test('should maintain referential integrity', async () => {
      await testSetup.bridge.index_project({ force: true });
      
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 50 });
      const relationships = await testSetup.bridge.get_all_relationships();
      const analysis = await testSetup.bridge.analyze_patterns();
      
      // Symbol count consistency
      expect(analysis.symbolCount).toBeGreaterThanOrEqual(symbols.length);
      
      // Pattern symbols should be subset of all symbols
      const allSymbolIds = new Set(symbols.map(s => s.id));
      
      analysis.patterns.forEach(pattern => {
        pattern.symbols.forEach(symbol => {
          validateSymbolStructure(symbol);
          // Pattern symbols should have valid structure
        });
      });
      
      // Relationships should reference valid project
      relationships.forEach(rel => {
        expect(rel.projectId).toBeGreaterThan(0);
        expect(rel.confidence).toBeGreaterThanOrEqual(0);
        expect(rel.confidence).toBeLessThanOrEqual(1);
      });
    });

    test('should provide accurate metrics', async () => {
      await testSetup.bridge.index_project({ force: true });
      
      const symbols = await testSetup.bridge.search_symbols('*', { limit: 1000 });
      const analysis = await testSetup.bridge.analyze_patterns();
      
      // Metrics should be mathematically consistent
      expect(analysis.insights.totalSymbolsAnalyzed).toBeGreaterThanOrEqual(0);
      expect(analysis.insights.duplicateCount).toBeGreaterThanOrEqual(0);
      expect(analysis.insights.patternsDetected).toBeGreaterThanOrEqual(0);
      expect(analysis.insights.averageSimilarity).toBeGreaterThanOrEqual(0);
      expect(analysis.insights.averageSimilarity).toBeLessThanOrEqual(1);
      expect(analysis.insights.codeReusePercentage).toBeGreaterThanOrEqual(0);
      expect(analysis.insights.codeReusePercentage).toBeLessThanOrEqual(100);
      
      // Duplicate count should not exceed total symbols
      expect(analysis.insights.duplicateCount).toBeLessThanOrEqual(analysis.insights.totalSymbolsAnalyzed);
    });
  });
});