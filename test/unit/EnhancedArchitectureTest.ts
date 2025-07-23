/**
 * Enhanced Architecture Test
 * Tests the new universal parsing architecture and multi-language support
 */

import Database from 'better-sqlite3';
import { TestResult } from '../helpers/JUnitReporter';
// import { CppUniversalParser } from '../../dist/parsers/languages/cpp-universal-parser.js';
// import { UniversalPatternEngine } from '../../dist/parsers/universal-pattern-engine.js';
// import { CrossLanguageAnalyzer } from '../../dist/parsers/cross-language-analyzer.js';

export class EnhancedArchitectureTest {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test 1: Verify C++ parser preserves existing capabilities
    results.push(await this.testCppParserIntegration());
    
    // Test 2: Test universal pattern engine
    results.push(await this.testUniversalPatternEngine());
    
    // Test 3: Test cross-language analyzer setup
    results.push(await this.testCrossLanguageAnalyzer());
    
    // Test 4: Test multi-language architecture readiness
    results.push(await this.testMultiLanguageReadiness());
    
    return results;
  }
  
  private async testCppParserIntegration(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Create test C++ content with advanced features
      const testContent = `
#define LOG_INFO(msg) std::cout << "[INFO] " << msg << std::endl

export module PlanetGen::Rendering;

namespace PlanetGen::Rendering {
    template<typename T>
    class VulkanRenderer {
    private:
        std::unique_ptr<T> device;
        
    public:
        VulkanRenderer() noexcept = default;
        
        template<typename U>
        auto render(const U& object) -> decltype(object.draw()) {
            LOG_INFO("Rendering object");
            return object.draw();
        }
        
        virtual ~VulkanRenderer() = default;
    };
    
    class TerrainRenderer : public VulkanRenderer<Device> {
        void renderTerrain() override;
    };
}
`;

      const parser = new CppUniversalParser();
      
      // Initialize with database (crucial for macro expansion)
      parser.initializeWithDatabase(this.db, 1, 1);
      
      // Parse the content
      const symbols = await parser.parseSymbols('/tmp/test-enhanced.ixx', testContent);
      const relationships = await parser.parseRelationships('/tmp/test-enhanced.ixx', symbols);
      
      // Validate sophisticated features are preserved
      if (symbols.length === 0) {
        throw new Error('Should parse symbols');
      }
      
      if (relationships.length === 0) {
        throw new Error('Should find relationships');
      }
      
      // Check for specific advanced features
      const hasNamespace = symbols.some(s => s.namespace?.includes('PlanetGen::Rendering'));
      const hasTemplate = symbols.some(s => s.semanticTags?.includes('template') || s.semanticTags?.includes('generic'));
      const hasModule = symbols.some(s => s.kind === 'module');
      const hasInheritance = relationships.some(r => r.type === 'inherits' || r.type === 'extends');
      
      if (!hasNamespace) {
        throw new Error('Should preserve namespace parsing');
      }
      
      if (!hasTemplate) {
        throw new Error('Should preserve template detection');
      }
      
      if (!hasModule) {
        throw new Error('Should preserve module parsing');
      }
      
      if (!hasInheritance) {
        throw new Error('Should preserve inheritance detection');
      }
      
      return {
        name: 'testCppParserIntegration',
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: 'testCppParserIntegration',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testUniversalPatternEngine(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const patternEngine = new UniversalPatternEngine();
      
      // Create test symbols that should trigger patterns
      const testSymbols = [
        {
          name: 'VulkanRendererFactory',
          qualifiedName: 'PlanetGen::VulkanRendererFactory',
          kind: 'class' as any,
          filePath: '/test/factory.cpp',
          line: 10,
          column: 1,
          semanticTags: ['class', 'factory'],
          confidence: 0.9
        },
        {
          name: 'TerrainRenderer',
          qualifiedName: 'PlanetGen::TerrainRenderer',
          kind: 'class' as any,
          filePath: '/test/renderer.cpp',
          line: 20,
          column: 1,
          semanticTags: ['class'],
          confidence: 0.9
        }
      ];
      
      const testRelationships = [
        {
          fromSymbolId: 'PlanetGen::VulkanRendererFactory',
          toSymbolId: 'PlanetGen::TerrainRenderer',
          type: 'uses' as any,
          confidence: 0.8
        }
      ];
      
      const patterns = await patternEngine.detectPatterns(testSymbols, testRelationships, 'cpp');
      
      // Pattern engine should run without errors (even if no patterns detected)
      if (patterns === null || patterns === undefined) {
        throw new Error('Pattern engine should return an array');
      }
      
      return {
        name: 'testUniversalPatternEngine',
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: 'testUniversalPatternEngine',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testCrossLanguageAnalyzer(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const crossAnalyzer = new CrossLanguageAnalyzer();
      
      // Test with minimal symbol sets
      const symbolsByLanguage = new Map();
      symbolsByLanguage.set('cpp', [
        {
          name: 'ApiHandler',
          qualifiedName: 'Backend::ApiHandler',
          kind: 'class' as any,
          filePath: '/backend/api.cpp',
          line: 10,
          column: 1,
          semanticTags: ['class', 'api'],
          confidence: 0.9
        }
      ]);
      
      const relationshipsByLanguage = new Map();
      relationshipsByLanguage.set('cpp', []);
      
      const crossRelationships = await crossAnalyzer.analyzeCrossLanguageRelationships(
        symbolsByLanguage,
        relationshipsByLanguage
      );
      
      // Cross-language analyzer should run without errors
      if (crossRelationships === null || crossRelationships === undefined) {
        throw new Error('Cross-language analyzer should return an array');
      }
      
      return {
        name: 'testCrossLanguageAnalyzer',
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: 'testCrossLanguageAnalyzer',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testMultiLanguageReadiness(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Test that we can instantiate parsers for different languages
      const languageParsers = [];
      
      try {
        // C++ parser
        const cppParser = new CppUniversalParser();
        if (cppParser.language !== 'cpp') {
          throw new Error('C++ parser should identify as cpp');
        }
        
        if (!cppParser.supportedExtensions.includes('.cpp')) {
          throw new Error('C++ parser should support .cpp');
        }
        
        languageParsers.push('cpp');
      } catch (error) {
        throw new Error(`C++ parser failed: ${error}`);
      }
      
      try {
        // Try to import other parsers (may not be fully implemented yet)
        const { PythonUniversalParser } = await import('../../dist/parsers/languages/python-universal-parser.js');
        const pythonParser = new PythonUniversalParser();
        if (pythonParser.language === 'python') {
          languageParsers.push('python');
        }
      } catch (error) {
        // Python parser not yet fully integrated - this is expected
      }
      
      try {
        const { TypeScriptUniversalParser } = await import('../../dist/parsers/languages/typescript-universal-parser.js');
        const tsParser = new TypeScriptUniversalParser();
        if (tsParser.language === 'typescript') {
          languageParsers.push('typescript');
        }
      } catch (error) {
        // TypeScript parser not yet fully integrated - this is expected
      }
      
      if (languageParsers.length === 0) {
        throw new Error('At least one language parser should be available');
      }
      
      return {
        name: 'testMultiLanguageReadiness',
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: 'testMultiLanguageReadiness',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}