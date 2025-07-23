/**
 * Minimal standalone test to isolate semantic intelligence hang
 * Bypasses the entire test framework and indexing process
 */

import { LocalCodeEmbeddingEngine } from './dist/analysis/local-code-embedding.js';
import Database from 'better-sqlite3';

console.log('🧪 Starting minimal semantic intelligence test...');

// Create temporary in-memory database
const db = new Database(':memory:');

// Create minimal test symbol
const testSymbol = {
  name: 'testFunction',
  qualifiedName: 'TestNamespace::testFunction',
  kind: 'function',
  filePath: '/test/file.cpp',
  line: 10,
  column: 1,
  signature: 'void testFunction(int x)',
  returnType: 'void',
  complexity: 2,
  confidence: 1.0,
  isDefinition: true,
  isExported: false,
  isAsync: false,
  semanticTags: ['function']
};

console.log('📝 Creating minimal test AST...');

// Create minimal mock AST
const mockAST = {
  rootNode: {
    type: 'translation_unit',
    children: [],
    childCount: 0,
    child: () => null,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 20, column: 0 },
    startIndex: 0,
    endIndex: 500
  }
};

const testContent = `
namespace TestNamespace {
  void testFunction(int x) {
    int result = x + 1;
    return result;
  }
}`;

console.log('🔧 Initializing LocalCodeEmbeddingEngine...');

const embeddingEngine = new LocalCodeEmbeddingEngine(db, { 
  dimensions: 256,
  debugMode: true 
});

console.log('⏱️  Starting embedding generation with 5-second timeout...');

const embeddingPromise = embeddingEngine.generateEmbedding(
  testSymbol,
  mockAST,
  testContent,
  undefined, // no semantic context
  [] // no relationships
);

const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Embedding generation timeout')), 5000)
);

try {
  const startTime = Date.now();
  const result = await Promise.race([embeddingPromise, timeoutPromise]);
  const duration = Date.now() - startTime;
  
  console.log(`✅ Embedding generation completed in ${duration}ms`);
  console.log('📊 Embedding result:', {
    symbolId: result.symbolId,
    dimensions: result.dimensions,
    version: result.version,
    algorithm: result.metadata.algorithm
  });
  
  console.log('🎯 Embedding generation component is working correctly');
  process.exit(0);
  
} catch (error) {
  if (error.message === 'Embedding generation timeout') {
    console.error('🚨 FOUND THE PROBLEM: Embedding generation is hanging!');
    console.error('💡 The hang is in the LocalCodeEmbeddingEngine component');
  } else {
    console.error('❌ Embedding generation failed with error:', error.message);
    console.error('📚 Stack trace:', error.stack);
  }
  
  process.exit(1);
}