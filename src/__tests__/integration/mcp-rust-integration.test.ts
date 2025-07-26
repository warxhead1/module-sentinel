/**
 * Integration tests for MCP server with real Rust bindings
 * These tests are skipped if Rust bindings are not available
 */

import { ModuleSentinelMCPServer } from '../../index';
import { checkRustBindings } from '../../rust-bridge/module-sentinel-bridge';
import * as fs from 'fs/promises';
import * as path from 'path';

// Skip these tests if Rust bindings are not available
const describeIfRustBindings = checkRustBindings() ? describe : describe.skip;

describeIfRustBindings('MCP Server - Rust Integration', () => {
  let server: ModuleSentinelMCPServer;
  const testProjectPath = path.join(__dirname, '../../../test-fixtures');
  
  beforeAll(async () => {
    // Create test project structure
    await fs.mkdir(testProjectPath, { recursive: true });
    await fs.writeFile(
      path.join(testProjectPath, 'test.ts'),
      `export function testFunction() {
        return "Hello, World!";
      }
      
      export class TestClass {
        constructor(private name: string) {}
        
        getName(): string {
          return this.name;
        }
      }`
    );
  });
  
  afterAll(async () => {
    // Clean up test files
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });
  
  beforeEach(() => {
    process.env.MODULE_SENTINEL_PROJECT_PATH = testProjectPath;
    server = new ModuleSentinelMCPServer();
  });
  
  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });
  
  it('should index project and find symbols', async () => {
    await server.start();
    
    // Index the test project
    const indexResult = await server['handleIndexProject']({
      include_patterns: ['**/*.ts'],
      exclude_patterns: ['node_modules/**']
    });
    
    expect(indexResult.files_processed).toBeGreaterThan(0);
    expect(indexResult.symbols_found).toBeGreaterThan(0);
    
    // Search for symbols
    const searchResult = await server['handleSearchSymbols']({
      query: 'test',
      limit: 10
    });
    
    expect(searchResult.symbols).toBeDefined();
    expect(searchResult.symbols.length).toBeGreaterThan(0);
    expect(searchResult.symbols.some(s => s.name === 'testFunction')).toBe(true);
    expect(searchResult.symbols.some(s => s.name === 'TestClass')).toBe(true);
  });
  
  it('should analyze patterns in code', async () => {
    await server.start();
    
    // First index the project
    await server['handleIndexProject']({});
    
    // Analyze patterns
    const patternsResult = await server['handleAnalyzePatterns']({});
    
    expect(patternsResult.patterns).toBeDefined();
    expect(Array.isArray(patternsResult.patterns)).toBe(true);
  });
  
  it('should calculate similarity between symbols', async () => {
    await server.start();
    
    // Index first
    await server['handleIndexProject']({});
    
    // Find two symbols to compare
    const searchResult = await server['handleSearchSymbols']({ query: 'test' });
    
    if (searchResult.symbols.length >= 2) {
      const similarityResult = await server['handleCalculateSimilarity']({
        symbol1: searchResult.symbols[0].name,
        symbol2: searchResult.symbols[1].name
      });
      
      expect(similarityResult.score).toBeDefined();
      expect(similarityResult.score).toBeGreaterThanOrEqual(0);
      expect(similarityResult.score).toBeLessThanOrEqual(1);
    }
  });
  
  it('should parse individual files', async () => {
    await server.start();
    
    const parseResult = await server['handleParseFile']({
      file_path: path.join(testProjectPath, 'test.ts')
    });
    
    expect(parseResult.symbols).toBeDefined();
    expect(parseResult.symbols.length).toBeGreaterThan(0);
    expect(parseResult.parse_time_ms).toBeDefined();
  });
});

describe('MCP Server - Fallback Behavior', () => {
  let server: ModuleSentinelMCPServer;
  const testProjectPath = path.join(__dirname, '../../../test-fixtures-fallback');
  
  beforeAll(async () => {
    // Create test files
    await fs.mkdir(testProjectPath, { recursive: true });
    await fs.writeFile(
      path.join(testProjectPath, 'fallback.ts'),
      `function fallbackTest() { return true; }`
    );
  });
  
  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });
  
  beforeEach(() => {
    process.env.MODULE_SENTINEL_PROJECT_PATH = testProjectPath;
    
    // Force Rust bridge to fail
    jest.doMock('../../rust-bridge/module-sentinel-bridge', () => ({
      ModuleSentinelBridge: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockRejectedValue(new Error('Forced failure'))
      })),
      quickSearch: require('../../rust-bridge/module-sentinel-bridge').quickSearch,
      quickAnalyze: require('../../rust-bridge/module-sentinel-bridge').quickAnalyze,
      checkRustBindings: () => false
    }));
    
    server = new ModuleSentinelMCPServer();
  });
  
  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    jest.resetModules();
  });
  
  it('should fall back to quickSearch when Rust bridge fails', async () => {
    await server.start();
    
    const result = await server['handleSearchSymbols']({
      query: 'fallback',
      limit: 10
    });
    
    expect(result.symbols).toBeDefined();
    // Should find the fallbackTest function
    expect(result.symbols.some(s => s.name === 'fallbackTest')).toBe(true);
  });
});