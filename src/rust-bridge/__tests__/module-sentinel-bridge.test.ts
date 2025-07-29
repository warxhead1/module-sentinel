/**
 * Comprehensive test suite for ModuleSentinelBridge
 * Tests all NAPI bridge methods with proper setup and teardown
 */

import { describe, beforeAll, afterAll, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { ModuleSentinelBridge, quick_search as quickSearch, quick_analyze as quickAnalyze, check_rust_bindings as checkRustBindings } from '../module-sentinel-bridge';
import type { 
  Language, 
  IndexingOptions, 
  SearchOptions, 
  Symbol,
  AnalysisResult,
  SimilarityResult,
  ParseResult,
  ProjectInfo,
  UniversalRelationship,
  CodeQualityResult 
} from '../../types/rust-bindings';

describe('ModuleSentinelBridge', () => {
  let testProjectPath: string;
  let bridge: ModuleSentinelBridge;

  beforeAll(async () => {
    // Set up test project path
    testProjectPath = path.resolve(__dirname, '../../../test-project');
    
    // Ensure test project exists
    if (!fs.existsSync(testProjectPath)) {
      throw new Error(`Test project not found at ${testProjectPath}`);
    }
    
    // Create bridge instance
    bridge = new ModuleSentinelBridge(testProjectPath);
  }, 30000);

  afterAll(async () => {
    // Cleanup if needed
  });

  beforeEach(async () => {
    // Initialize bridge for each test
    await bridge.initialize();
  }, 15000);

  afterEach(() => {
    // Reset any mocks or state
    jest.clearAllMocks();
  });

  describe('Bridge Initialization', () => {
    test('should initialize successfully', async () => {
      const newBridge = new ModuleSentinelBridge(testProjectPath);
      await expect(newBridge.initialize()).resolves.not.toThrow();
    });

    test('should throw error for invalid project path', async () => {
      const invalidBridge = new ModuleSentinelBridge('/non/existent/path');
      await expect(invalidBridge.initialize()).rejects.toThrow();
    });
  });

  describe('Project Indexing', () => {
    test('should index project with default options', async () => {
      const result: ProjectInfo = await bridge.index_project();
      
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.name).toBe('main_project');
      expect(result.path).toBe(testProjectPath);
      expect(result.symbolCount).toBeGreaterThanOrEqual(0);
      expect(result.languageDistribution).toBeDefined();
    });

    test('should index project with custom options', async () => {
      const options: IndexingOptions = {
        force: true,
        languages: ['TypeScript', 'JavaScript'],
        includeTests: false,
        maxFileSize: 512 * 1024, // 512KB
        excludePatterns: ['*.test.ts', '*.spec.ts']
      };

      const result: ProjectInfo = await bridge.index_project(options);
      
      expect(result).toBeDefined();
      expect(result.symbolCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle force reindexing', async () => {
      // Index once
      await bridge.index_project({ force: false });
      
      // Force reindex
      const result = await bridge.index_project({ force: true });
      
      expect(result).toBeDefined();
      expect(result.symbolCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Symbol Search', () => {
    beforeEach(async () => {
      // Ensure project is indexed before searching
      await bridge.index_project({ force: false });
    });

    test('should search symbols with query', async () => {
      const symbols: Symbol[] = await bridge.search_symbols('function', {});
      
      expect(Array.isArray(symbols)).toBe(true);
      // May be empty if no functions in test project
      symbols.forEach(symbol => {
        expect(symbol.id).toBeDefined();
        expect(symbol.name).toBeDefined();
        expect(symbol.filePath).toBeDefined();
        expect(symbol.language).toBeDefined();
        expect(typeof symbol.startLine).toBe('number');
        expect(typeof symbol.endLine).toBe('number');
      });
    });

    test('should search symbols with options', async () => {
      const options: SearchOptions = {
        kind: 'function',
        language: 'TypeScript',
        limit: 5,
        includePrivate: false,
        fuzzyMatch: true
      };

      const symbols: Symbol[] = await bridge.search_symbols('test', options);
      
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeLessThanOrEqual(5);
    });

    test('should handle empty search results', async () => {
      const symbols: Symbol[] = await bridge.search_symbols('nonexistent_function_name_12345', {});
      
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBe(0);
    });

    test('should limit search results', async () => {
      const symbols: Symbol[] = await bridge.search_symbols('*', { limit: 3 });
      
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Pattern Analysis', () => {
    beforeEach(async () => {
      await bridge.index_project({ force: false });
    });

    test('should analyze patterns successfully', async () => {
      const result: AnalysisResult = await bridge.analyze_patterns();
      
      expect(result).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(result.insights).toBeDefined();
      expect(typeof result.insights.totalSymbolsAnalyzed).toBe('number');
      expect(typeof result.insights.patternsDetected).toBe('number');
      expect(typeof result.symbolCount).toBe('number');
      expect(Array.isArray(result.insights.recommendations)).toBe(true);
    });

    test('should provide meaningful insights', async () => {
      const result: AnalysisResult = await bridge.analyze_patterns();
      
      expect(result.insights.totalSymbolsAnalyzed).toBeGreaterThanOrEqual(0);
      expect(result.insights.patternsDetected).toBeGreaterThanOrEqual(0);
      expect(result.insights.duplicateCount).toBeGreaterThanOrEqual(0);
      expect(result.insights.averageSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.insights.codeReusePercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Similarity Calculation', () => {
    let symbols: Symbol[];

    beforeEach(async () => {
      await bridge.index_project({ force: false });
      symbols = await bridge.search_symbols('*', { limit: 10 });
    });

    test('should calculate similarity between symbols', async () => {
      if (symbols.length < 2) {
        console.warn('Not enough symbols for similarity test, skipping');
        return;
      }

      const similarity: SimilarityResult = await bridge.calculate_similarity(
        symbols[0].id,
        symbols[1].id
      );
      
      expect(similarity).toBeDefined();
      expect(typeof similarity.overallScore).toBe('number');
      expect(typeof similarity.nameSimilarity).toBe('number');
      expect(typeof similarity.signatureSimilarity).toBe('number');
      expect(typeof similarity.structuralSimilarity).toBe('number');
      expect(typeof similarity.contextSimilarity).toBe('number');
      
      // Scores should be between 0 and 1
      expect(similarity.overallScore).toBeGreaterThanOrEqual(0);
      expect(similarity.overallScore).toBeLessThanOrEqual(1);
    });

    test('should handle identical symbols', async () => {
      if (symbols.length === 0) {
        console.warn('No symbols for similarity test, skipping');
        return;
      }

      const similarity: SimilarityResult = await bridge.calculate_similarity(
        symbols[0].id,
        symbols[0].id
      );
      
      expect(similarity.overallScore).toBe(1.0);
      expect(similarity.nameSimilarity).toBe(1.0);
    });

    test('should handle non-existent symbols', async () => {
      await expect(
        bridge.calculate_similarity('nonexistent1', 'nonexistent2')
      ).rejects.toThrow();
    });
  });

  describe('File Parsing', () => {
    test('should parse TypeScript file', async () => {
      const testFile = path.join(testProjectPath, 'src/main.ts');
      
      if (!fs.existsSync(testFile)) {
        console.warn(`Test file ${testFile} not found, skipping parse test`);
        return;
      }

      const result: ParseResult = await bridge.parse_file(testFile, 'TypeScript');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.symbols)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.parseMethod).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('should parse JavaScript file', async () => {
      const testFile = path.join(testProjectPath, 'src/helper.ts'); // Treat as JS
      
      if (!fs.existsSync(testFile)) {
        console.warn(`Test file ${testFile} not found, skipping parse test`);
        return;
      }

      const result: ParseResult = await bridge.parse_file(testFile, 'JavaScript');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.symbols)).toBe(true);
    });

    test('should handle non-existent file', async () => {
      await expect(
        bridge.parse_file('/non/existent/file.ts', 'TypeScript')
      ).rejects.toThrow();
    });

    test('should handle file outside project boundary', async () => {
      await expect(
        bridge.parse_file('/etc/passwd', 'TypeScript')
      ).rejects.toThrow();
    });
  });

  describe('Code Quality Analysis', () => {
    test('should analyze code quality', async () => {
      const testFile = path.join(testProjectPath, 'src/main.ts');
      
      if (!fs.existsSync(testFile)) {
        console.warn(`Test file ${testFile} not found, skipping quality test`);
        return;
      }

      const result: CodeQualityResult = await bridge.analyze_code_quality(
        testFile, 
        'TypeScript', 
        true
      );
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(typeof result.overallScore).toBe('number');
      expect(Array.isArray(result.recommendations)).toBe(true);
      
      // Metrics validation
      expect(typeof result.metrics.cyclomaticComplexity).toBe('number');
      expect(typeof result.metrics.maxNestingDepth).toBe('number');
      expect(typeof result.metrics.functionCount).toBe('number');
      expect(typeof result.metrics.largeFunctionCount).toBe('number');
      expect(typeof result.metrics.linesOfCode).toBe('number');
      expect(typeof result.metrics.commentRatio).toBe('number');
    });

    test('should analyze code quality without suggestions', async () => {
      const testFile = path.join(testProjectPath, 'src/main.ts');
      
      if (!fs.existsSync(testFile)) {
        console.warn(`Test file ${testFile} not found, skipping quality test`);
        return;
      }

      const result: CodeQualityResult = await bridge.analyze_code_quality(
        testFile, 
        'TypeScript', 
        false
      );
      
      expect(result).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Relationship Management', () => {
    beforeEach(async () => {
      await bridge.index_project({ force: false });
    });

    test('should get all relationships', async () => {
      const relationships: UniversalRelationship[] = await bridge.get_all_relationships();
      
      expect(Array.isArray(relationships)).toBe(true);
      
      relationships.forEach(rel => {
        expect(typeof rel.projectId).toBe('number');
        expect(typeof rel.relationshipType).toBe('string');
        expect(typeof rel.confidence).toBe('number');
        expect(typeof rel.createdAt).toBe('string');
      });
    });

    test('should get symbol relationships', async () => {
      const symbols = await bridge.search_symbols('*', { limit: 1 });
      
      if (symbols.length === 0) {
        console.warn('No symbols found for relationship test, skipping');
        return;
      }

      const relationships: UniversalRelationship[] = await bridge.get_symbol_relationships(
        symbols[0].id
      );
      
      expect(Array.isArray(relationships)).toBe(true);
    });

    test('should handle non-existent symbol relationships', async () => {
      const relationships: UniversalRelationship[] = await bridge.get_symbol_relationships(
        'nonexistent_symbol'
      );
      
      expect(Array.isArray(relationships)).toBe(true);
      expect(relationships.length).toBe(0);
    });
  });

  describe('Static Methods', () => {
    test('should perform quick search', async () => {
      const symbols: Symbol[] = await quickSearch(testProjectPath, 'function', 5);
      
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeLessThanOrEqual(5);
    });

    test('should perform quick analysis', async () => {
      const result: AnalysisResult = await quickAnalyze(testProjectPath);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(result.insights).toBeDefined();
      expect(typeof result.symbolCount).toBe('number');
    });

    test('should handle invalid path in quick search', async () => {
      await expect(
        quickSearch('/non/existent/path', 'test', 5)
      ).rejects.toThrow();
    });

    test('should handle invalid path in quick analysis', async () => {
      await expect(
        quickAnalyze('/non/existent/path')
      ).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle bridge not initialized', async () => {
      const uninitializedBridge = new ModuleSentinelBridge(testProjectPath);
      
      await expect(
        uninitializedBridge.search_symbols('test', {})
      ).rejects.toThrow();
    });

    test('should provide meaningful error messages', async () => {
      try {
        await bridge.parse_file('/non/existent/file.ts', 'TypeScript');
        fail('Expected error to be thrown');
      } catch (error) {
        // Check that it's an error object with a message
        expect(error).toBeDefined();
        expect(typeof error).toBe('object');
        expect(error).toHaveProperty('message');
        expect((error as any).message).toBeTruthy();
        expect(typeof (error as any).message).toBe('string');
      }
    });
  });

  describe('Performance', () => {
    test('should complete indexing within reasonable time', async () => {
      const start = Date.now();
      await bridge.index_project({ force: true });
      const duration = Date.now() - start;
      
      // Should complete within 30 seconds for small test project
      expect(duration).toBeLessThan(30000);
    });

    test('should complete search within reasonable time', async () => {
      await bridge.index_project({ force: false });
      
      const start = Date.now();
      await bridge.search_symbols('*', { limit: 100 });
      const duration = Date.now() - start;
      
      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});