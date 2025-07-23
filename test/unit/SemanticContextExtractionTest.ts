/**
 * Isolated test for semantic context extraction component
 * Purpose: Identify if context extraction is the source of the hang
 */

import { BaseTest } from '../BaseTest.js';
import { SymbolInfo } from '../../src/parsers/tree-sitter/parser-types.js';
import { SemanticContextExtractor } from '../../src/analysis/semantic-context-engine.js';
import Parser from 'tree-sitter';

class SemanticContextExtractionTest extends BaseTest {
  getName(): string {
    return 'Semantic Context Extraction Test';
  }

  async run(): Promise<boolean> {
    console.log('\n🧪 Testing Semantic Context Extraction Component in Isolation...');
    
    try {
      // Create a minimal test symbol
      const testSymbol: SymbolInfo = {
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

      console.log('📝 Creating test AST node...');
      
      // Create a minimal mock AST tree
      const mockAST = {
        rootNode: {
          type: 'translation_unit',
          children: [],
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 20, column: 0 },
          startIndex: 0,
          endIndex: 500,
          text: 'void testFunction(int x) { return x + 1; }'
        }
      } as Parser.Tree;

      const testContent = `
namespace TestNamespace {
  void testFunction(int x) {
    int result = x + 1;
    return result;
  }
}`;

      console.log('🔧 Initializing SemanticContextExtractor...');
      
      // Test with a 3-second timeout to see if context extraction hangs
      const contextExtractor = new SemanticContextExtractor(this.db, { debugMode: true });
      
      console.log('⏱️  Starting context extraction with 3-second timeout...');
      
      const contextPromise = contextExtractor.extractContext(
        testSymbol,
        mockAST,
        testContent,
        '/test/file.cpp'
      );
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Context extraction timeout')), 3000)
      );
      
      const startTime = Date.now();
      const result = await Promise.race([contextPromise, timeoutPromise]);
      const duration = Date.now() - startTime;
      
      console.log(`✅ Context extraction completed in ${duration}ms`);
      console.log('📊 Context result:', {
        semanticRole: result.semanticRole,
        architecturalLayer: result.architecturalLayer,
        usagePatterns: result.usagePatterns?.length || 0,
        domainConcepts: result.domainConcepts?.length || 0
      });
      
      // Verify result structure
      this.assert(result.semanticRole !== undefined, 'Context should have semantic role');
      this.assert(result.architecturalLayer !== undefined, 'Context should have architectural layer');
      this.assert(Array.isArray(result.usagePatterns), 'Context should have usage patterns array');
      this.assert(Array.isArray(result.domainConcepts), 'Context should have domain concepts array');
      
      console.log('🎯 Context extraction component is working correctly - NOT the source of hang');
      return true;
      
    } catch (error: any) {
      if (error.message === 'Context extraction timeout') {
        console.error('🚨 FOUND THE PROBLEM: Context extraction is hanging!');
        console.error('💡 The hang is in the SemanticContextExtractor component');
        return false;
      } else {
        console.error('❌ Context extraction failed with error:', error.message);
        return false;
      }
    }
  }
}

export { SemanticContextExtractionTest };