/**
 * Test utilities and helpers for Rust bridge testing
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModuleSentinelBridge } from '../../module-sentinel-bridge';
import { testFiles } from '../fixtures';
import type { Language } from '../../../types/rust-bindings';

export interface TestProjectSetup {
  projectPath: string;
  bridge: ModuleSentinelBridge;
  cleanup: () => Promise<void>;
}

/**
 * Creates a temporary test project with sample files
 */
export async function createTestProject(): Promise<TestProjectSetup> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'module-sentinel-test-'));
  const srcDir = path.join(tempDir, 'src');
  
  // Create directory structure
  await fs.promises.mkdir(srcDir, { recursive: true });
  
  // Write test files
  await fs.promises.writeFile(
    path.join(srcDir, 'main.ts'),
    testFiles.typescript
  );
  
  await fs.promises.writeFile(
    path.join(srcDir, 'helper.js'),
    testFiles.javascript
  );
  
  await fs.promises.writeFile(
    path.join(srcDir, 'lib.rs'),
    testFiles.rust
  );
  
  // Create package.json for the test project
  const packageJson = {
    name: 'test-project',
    version: '1.0.0',
    main: 'src/main.ts',
    scripts: {
      test: 'echo "test"'
    }
  };
  
  await fs.promises.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  const bridge = new ModuleSentinelBridge(tempDir);
  
  const cleanup = async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test project: ${error}`);
    }
  };
  
  return {
    projectPath: tempDir,
    bridge,
    cleanup
  };
}

/**
 * Waits for a condition to be true with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }
    await sleep(intervalMs);
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates that a result matches expected structure
 */
export function validateSymbolStructure(symbol: any): void {
  expect(symbol).toBeDefined();
  expect(typeof symbol.id).toBe('string');
  expect(typeof symbol.name).toBe('string');
  expect(typeof symbol.signature).toBe('string');
  expect(typeof symbol.language).toBe('string');
  expect(typeof symbol.filePath).toBe('string');
  expect(typeof symbol.startLine).toBe('number');
  expect(typeof symbol.endLine).toBe('number');
  expect(typeof symbol.normalizedName).toBe('string');
  
  if (symbol.returnType !== null && symbol.returnType !== undefined) {
    expect(typeof symbol.returnType).toBe('string');
  }
  
  if (symbol.confidenceScore !== null) {
    expect(typeof symbol.confidenceScore).toBe('number');
    expect(symbol.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(symbol.confidenceScore).toBeLessThanOrEqual(1);
  }
  
  expect(Array.isArray(symbol.similarSymbols)).toBe(true);
}

/**
 * Validates relationship structure
 */
export function validateRelationshipStructure(relationship: any): void {
  expect(relationship).toBeDefined();
  expect(typeof relationship.projectId).toBe('number');
  expect(typeof relationship.relationshipType).toBe('string');
  expect(typeof relationship.confidence).toBe('number');
  expect(typeof relationship.createdAt).toBe('string');
  
  expect(relationship.confidence).toBeGreaterThanOrEqual(0);
  expect(relationship.confidence).toBeLessThanOrEqual(1);
  
  if (relationship.id !== null) {
    expect(typeof relationship.id).toBe('number');
  }
  
  if (relationship.fromSymbolId !== null) {
    expect(typeof relationship.fromSymbolId).toBe('number');
  }
  
  if (relationship.toSymbolId !== null) {
    expect(typeof relationship.toSymbolId).toBe('number');
  }
  
  if (relationship.contextLine !== null) {
    expect(typeof relationship.contextLine).toBe('number');
  }
  
  if (relationship.contextColumn !== null) {
    expect(typeof relationship.contextColumn).toBe('number');
  }
  
  if (relationship.contextSnippet !== null) {
    expect(typeof relationship.contextSnippet).toBe('string');
  }
  
  if (relationship.metadata !== null) {
    expect(typeof relationship.metadata).toBe('string');
  }
}

/**
 * Validates analysis result structure
 */
export function validateAnalysisResultStructure(result: any): void {
  expect(result).toBeDefined();
  expect(Array.isArray(result.patterns)).toBe(true);
  expect(result.insights).toBeDefined();
  expect(typeof result.symbolCount).toBe('number');
  
  // Validate insights
  const insights = result.insights;
  expect(typeof insights.totalSymbolsAnalyzed).toBe('number');
  expect(typeof insights.duplicateCount).toBe('number');
  expect(typeof insights.patternsDetected).toBe('number');
  expect(typeof insights.averageSimilarity).toBe('number');
  expect(typeof insights.codeReusePercentage).toBe('number');
  expect(Array.isArray(insights.recommendations)).toBe(true);
  
  // Validate patterns
  result.patterns.forEach((pattern: any) => {
    expect(typeof pattern.category).toBe('string');
    expect(Array.isArray(pattern.symbols)).toBe(true);
    expect(typeof pattern.confidence).toBe('number');
    expect(Array.isArray(pattern.evidence)).toBe(true);
    
    pattern.symbols.forEach(validateSymbolStructure);
  });
}

/**
 * Validates code quality result structure
 */
export function validateCodeQualityResultStructure(result: any): void {
  expect(result).toBeDefined();
  expect(Array.isArray(result.issues)).toBe(true);
  expect(result.metrics).toBeDefined();
  expect(typeof result.overallScore).toBe('number');
  expect(Array.isArray(result.recommendations)).toBe(true);
  
  // Validate metrics
  const metrics = result.metrics;
  expect(typeof metrics.cyclomaticComplexity).toBe('number');
  expect(typeof metrics.maxNestingDepth).toBe('number');
  expect(typeof metrics.functionCount).toBe('number');
  expect(typeof metrics.largeFunctionCount).toBe('number');
  expect(typeof metrics.linesOfCode).toBe('number');
  expect(typeof metrics.commentRatio).toBe('number');
  
  // Validate issues
  result.issues.forEach((issue: any) => {
    expect(typeof issue.description).toBe('string');
    expect(typeof issue.category).toBe('string');
    expect(typeof issue.severity).toBe('string');
    expect(['low', 'medium', 'high']).toContain(issue.severity);
    
    if (issue.suggestion !== null) {
      expect(typeof issue.suggestion).toBe('string');
    }
  });
}

/**
 * Validates parse result structure
 */
export function validateParseResultStructure(result: any): void {
  expect(result).toBeDefined();
  expect(Array.isArray(result.symbols)).toBe(true);
  expect(Array.isArray(result.errors)).toBe(true);
  expect(typeof result.parseMethod).toBe('string');
  expect(typeof result.confidence).toBe('number');
  
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  
  result.symbols.forEach(validateSymbolStructure);
  
  result.errors.forEach((error: any) => {
    expect(typeof error).toBe('string');
  });
}

/**
 * Validates similarity result structure
 */
export function validateSimilarityResultStructure(result: any): void {
  expect(result).toBeDefined();
  expect(typeof result.overallScore).toBe('number');
  expect(typeof result.nameSimilarity).toBe('number');
  expect(typeof result.signatureSimilarity).toBe('number');
  expect(typeof result.structuralSimilarity).toBe('number');
  expect(typeof result.contextSimilarity).toBe('number');
  
  // All scores should be between 0 and 1
  const scores = [
    result.overallScore,
    result.nameSimilarity,
    result.signatureSimilarity,
    result.structuralSimilarity,
    result.contextSimilarity
  ];
  
  scores.forEach(score => {
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
}

/**
 * Validates project info structure
 */
export function validateProjectInfoStructure(info: any): void {
  expect(info).toBeDefined();
  expect(typeof info.id).toBe('number');
  expect(typeof info.name).toBe('string');
  expect(typeof info.path).toBe('string');
  expect(typeof info.symbolCount).toBe('number');
  expect(typeof info.languageDistribution).toBe('object');
  
  if (info.lastIndexed !== null) {
    expect(typeof info.lastIndexed).toBe('string');
  }
  
  // Validate language distribution
  Object.entries(info.languageDistribution).forEach(([language, count]) => {
    expect(typeof language).toBe('string');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
}

/**
 * Checks if current environment supports Rust bindings
 */
export function checkRustBindingsAvailable(): boolean {
  try {
    const bindingPath = path.resolve(__dirname, '../../../../module-sentinel-rust.node');
    return fs.existsSync(bindingPath);
  } catch {
    return false;
  }
}

/**
 * Skips test if Rust bindings are not available
 */
export function skipIfRustBindingsUnavailable(): void {
  if (!checkRustBindingsAvailable()) {
    console.warn('Rust bindings not available, skipping test');
    return;
  }
}

/**
 * Performance measurement helper
 */
export async function measurePerformance<T>(
  operation: () => Promise<T>,
  name: string = 'operation'
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await operation();
  const duration = Date.now() - start;
  
  console.log(`${name} completed in ${duration}ms`);
  
  return { result, duration };
}

/**
 * Memory usage helper for performance tests
 */
export function getMemoryUsage(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}

/**
 * Language detection helper
 */
export function detectLanguageFromExtension(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.ts':
      return 'TypeScript';
    case '.js':
      return 'JavaScript';
    case '.rs':
      return 'Rust';
    case '.py':
      return 'Python';
    case '.cpp':
    case '.cc':
    case '.cxx':
      return 'Cpp';
    case '.java':
      return 'Java';
    case '.go':
      return 'Go';
    case '.cs':
      return 'CSharp';
    default:
      return 'TypeScript'; // Default fallback
  }
}