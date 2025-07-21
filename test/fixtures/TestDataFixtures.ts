import { DrizzleDatabase } from '../../src/database/drizzle/db.js';
import * as schema from '../../src/database/drizzle/schema.js';

/**
 * Test Data Fixtures for Multi-Language Database Testing
 * 
 * Provides comprehensive test data for C++, Python, and TypeScript
 * symbols, relationships, and patterns to test the new ORM system.
 */
export class TestDataFixtures {
  private db: DrizzleDatabase;

  constructor(db: DrizzleDatabase) {
    this.db = db;
  }

  /**
   * Setup comprehensive test data for all tests
   */
  async setupTestData(): Promise<void> {
    await this.createSampleLanguages();
    // Additional setup will be called by individual tests
  }

  /**
   * Create sample languages
   */
  async createSampleLanguages(): Promise<schema.Language[]> {
    const languages = [
      {
        name: 'cpp',
        displayName: 'C++',
        version: '23',
        parserClass: 'CppParser',
        extensions: ['.cpp', '.hpp', '.ixx', '.cppm'],
        features: ['templates', 'modules', 'concepts', 'coroutines'],
        isEnabled: true,
        priority: 100
      },
      {
        name: 'python',
        displayName: 'Python',
        version: '3.12',
        parserClass: 'PythonParser',
        extensions: ['.py', '.pyx', '.pyi'],
        features: ['typing', 'async', 'decorators', 'metaclasses'],
        isEnabled: true,
        priority: 200
      },
      {
        name: 'typescript',
        displayName: 'TypeScript',
        version: '5.0',
        parserClass: 'TypeScriptParser',
        extensions: ['.ts', '.tsx', '.d.ts'],
        features: ['generics', 'decorators', 'modules', 'namespaces'],
        isEnabled: true,
        priority: 300
      }
    ];

    const results = [];
    for (const lang of languages) {
      results.push(await this.db.registerLanguage(lang));
    }
    return results;
  }

  /**
   * Create a sample C++ language
   */
  async createCppLanguage(): Promise<schema.Language> {
    return await this.db.registerLanguage({
      name: 'cpp',
      displayName: 'C++',
      version: '23',
      parserClass: 'CppParser',
      extensions: ['.cpp', '.hpp', '.ixx'],
      features: ['templates', 'modules', 'concepts'],
      isEnabled: true,
      priority: 100
    });
  }

  /**
   * Create a sample project
   */
  async createSampleProject(name: string): Promise<schema.Project> {
    return await this.db.createProject({
      name,
      displayName: name.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: `Test project: ${name}`,
      rootPath: `/test/projects/${name}`,
      isActive: true,
      metadata: { testProject: true, version: '1.0.0' }
    });
  }

  /**
   * Create sample symbols for testing
   */
  async createSampleSymbols(projectId: number, languageId: number): Promise<schema.UniversalSymbol[]> {
    const symbols = [
      {
        projectId,
        languageId,
        name: 'calculateTerrain',
        qualifiedName: 'PlanetGen::TerrainSystem::calculateTerrain',
        kind: 'function',
        filePath: '/test/projects/terrain_system.cpp',
        line: 45,
        column: 0,
        signature: 'float calculateTerrain(float x, float y, const TerrainParams& params)',
        returnType: 'float',
        namespace: 'PlanetGen::TerrainSystem',
        isExported: true,
        isAsync: false,
        isAbstract: false,
        visibility: 'public',
        semanticTags: ['terrain', 'calculation', 'gpu-optimized'],
        languageFeatures: {
          isTemplate: false,
          isVirtual: false,
          isStatic: false,
          usesModernCpp: true
        }
      },
      {
        projectId,
        languageId,
        name: 'TerrainRenderer',
        qualifiedName: 'PlanetGen::Rendering::TerrainRenderer',
        kind: 'class',
        filePath: '/test/projects/terrain_renderer.hpp',
        line: 25,
        column: 0,
        signature: 'class TerrainRenderer',
        returnType: null,
        namespace: 'PlanetGen::Rendering',
        isExported: true,
        isAsync: false,
        isAbstract: false,
        visibility: 'public',
        semanticTags: ['renderer', 'vulkan', 'graphics'],
        languageFeatures: {
          isTemplate: false,
          isVirtual: false,
          isStatic: false,
          usesModernCpp: true
        }
      },
      {
        projectId,
        languageId,
        name: 'calculateNoise',
        qualifiedName: 'PlanetGen::NoiseSystem::calculateNoise',
        kind: 'function',
        filePath: '/test/projects/noise_system.cpp',
        line: 120,
        column: 0,
        signature: 'float calculateNoise(float x, float y, int octaves)',
        returnType: 'float',
        namespace: 'PlanetGen::NoiseSystem',
        isExported: true,
        isAsync: false,
        isAbstract: false,
        visibility: 'public',
        semanticTags: ['noise', 'generation', 'procedural'],
        languageFeatures: {
          isTemplate: false,
          isVirtual: false,
          isStatic: false,
          usesModernCpp: true
        }
      }
    ];

    return await this.db.insertSymbols(symbols);
  }

  /**
   * Create sample relationships between symbols
   */
  async createSampleRelationships(projectId: number, symbols: schema.UniversalSymbol[]): Promise<schema.UniversalRelationship[]> {
    const relationships = [
      {
        projectId,
        fromSymbolId: symbols[0].id, // calculateTerrain
        toSymbolId: symbols[1].id,   // TerrainRenderer
        type: 'calls',
        confidence: 0.95,
        contextLine: 67,
        contextSnippet: 'renderer.renderTerrain(terrainData)',
        metadata: { callType: 'direct', frequency: 'per_frame' }
      },
      {
        projectId,
        fromSymbolId: symbols[0].id, // calculateTerrain
        toSymbolId: symbols[2].id,   // calculateNoise
        type: 'calls',
        confidence: 0.90,
        contextLine: 52,
        contextSnippet: 'float noise = calculateNoise(x, y, 6)',
        metadata: { callType: 'direct', frequency: 'high' }
      }
    ];

    return await this.db.insertRelationships(relationships);
  }

  /**
   * Create sample C++ features for symbols
   */
  async createSampleCppFeatures(symbols: schema.UniversalSymbol[]): Promise<void> {
    const cppFeatures = [
      {
        symbolId: symbols[0].id, // calculateTerrain
        isTemplate: true,
        isVirtual: false,
        isStatic: false,
        isConst: false,
        isConstexpr: false,
        isNoexcept: true,
        parentClass: null,
        mangledName: '_ZN9PlanetGen13TerrainSystem16calculateTerrainEffRKNS_13TerrainParamsE',
        usr: 'c:@N@PlanetGen@N@TerrainSystem@F@calculateTerrain#f#f#&1$@N@PlanetGen@S@TerrainParams#',
        isVulkanType: false,
        isStdType: false,
        isPlanetgenType: true,
        usesModernCpp: true,
        usesSmartPointers: false,
        returnsVectorFloat: true,
        usesGpuCompute: true,
        hasCpuFallback: true
      },
      {
        symbolId: symbols[1].id, // TerrainRenderer
        isTemplate: false,
        isVirtual: false,
        isStatic: false,
        isConst: false,
        isConstexpr: false,
        isNoexcept: false,
        parentClass: 'Renderer',
        mangledName: '_ZN9PlanetGen9Rendering15TerrainRendererE',
        usr: 'c:@N@PlanetGen@N@Rendering@C@TerrainRenderer',
        isVulkanType: true,
        isStdType: false,
        isPlanetgenType: true,
        usesModernCpp: true,
        usesSmartPointers: true,
        returnsVectorFloat: false,
        usesGpuCompute: true,
        hasCpuFallback: false
      }
    ];

    for (const feature of cppFeatures) {
      await this.db.getDb().insert(schema.cppFeatures).values(feature);
    }
  }

  /**
   * Setup comprehensive test data for complex queries
   */
  async setupComprehensiveTestData(projectId: number, languageId: number): Promise<void> {
    // Create symbols
    const symbols = await this.createSampleSymbols(projectId, languageId);
    
    // Add a main function for entry point testing
    const mainFunction = await this.db.insertSymbols([{
      projectId,
      languageId,
      name: 'main',
      qualifiedName: 'main',
      kind: 'function',
      filePath: '/test/projects/main.cpp',
      line: 10,
      column: 0,
      signature: 'int main(int argc, char* argv[])',
      returnType: 'int',
      namespace: '',
      isExported: true,
      isAsync: false,
      isAbstract: false,
      visibility: 'public',
      semanticTags: ['entry-point'],
      languageFeatures: {}
    }]);

    // Create relationships
    await this.createSampleRelationships(projectId, symbols);
    
    // Create C++ features
    await this.createSampleCppFeatures(symbols);
    
    // Create method complexity data
    await this.createSampleMethodComplexity(symbols);
    
    // Create memory patterns
    await this.createSampleMemoryPatterns(symbols);
    
    // Create Vulkan patterns
    await this.createSampleVulkanPatterns(symbols);
    
    // Create patterns
    await this.createSamplePatterns(projectId, symbols);
  }

  /**
   * Create sample method complexity data
   */
  async createSampleMethodComplexity(symbols: schema.UniversalSymbol[]): Promise<void> {
    const complexityData = [
      {
        symbolId: symbols[0].id, // calculateTerrain
        cyclomaticComplexity: 8,
        cognitiveComplexity: 12,
        nestingDepth: 3,
        parameterCount: 3,
        localVariableCount: 8,
        lineCount: 45,
        hasLoops: true,
        hasRecursion: false,
        hasDynamicAllocation: false,
        hasExceptionHandling: false,
        readabilityScore: 0.75,
        testabilityScore: 0.80
      }
    ];

    for (const complexity of complexityData) {
      await this.db.getDb().insert(schema.cppMethodComplexity).values(complexity);
    }
  }

  /**
   * Create sample memory patterns
   */
  async createSampleMemoryPatterns(symbols: schema.UniversalSymbol[]): Promise<void> {
    const memoryPatterns = [
      {
        symbolId: symbols[0].id,
        patternType: 'allocation',
        allocationMethod: 'heap',
        memorySizeEstimate: 1024,
        isCacheFriendly: true,
        hasAlignmentOptimization: true,
        usesRaii: true,
        potentialLeak: false,
        potentialDoubleFree: false,
        potentialUseAfterFree: false,
        sourceLocation: 'terrain_system.cpp:52',
        evidence: 'std::make_unique<TerrainData>()',
        confidence: 0.90
      }
    ];

    for (const pattern of memoryPatterns) {
      await this.db.getDb().insert(schema.cppMemoryPatterns).values(pattern);
    }
  }

  /**
   * Create sample Vulkan patterns
   */
  async createSampleVulkanPatterns(symbols: schema.UniversalSymbol[]): Promise<void> {
    const vulkanPatterns = [
      {
        symbolId: symbols[1].id, // TerrainRenderer
        operationType: 'pipeline',
        vulkanObjectType: 'VkGraphicsPipeline',
        resourceLifetime: 'persistent',
        sharingMode: 'exclusive',
        isGpuHeavy: true,
        estimatedGpuMemoryMb: 64,
        synchronizationRequired: true,
        followsVulkanBestPractices: true,
        potentialPerformanceIssue: null,
        pipelineStage: 'FinalRendering',
        confidence: 0.95
      }
    ];

    for (const pattern of vulkanPatterns) {
      await this.db.getDb().insert(schema.cppVulkanPatterns).values(pattern);
    }
  }

  /**
   * Create sample patterns
   */
  async createSamplePatterns(projectId: number, symbols: schema.UniversalSymbol[]): Promise<void> {
    const patterns = [
      {
        projectId,
        patternType: 'factory',
        patternName: 'TerrainFactory',
        description: 'Factory pattern for creating terrain objects',
        confidence: 0.85,
        severity: 'info',
        detectorName: 'FactoryPatternDetector',
        detectorVersion: '1.0',
        suggestions: ['Consider using dependency injection']
      }
    ];

    for (const pattern of patterns) {
      const insertedPattern = await this.db.insertPattern(pattern);
      await this.db.associateSymbolsWithPattern(
        insertedPattern.id,
        [symbols[0].id, symbols[1].id],
        ['factory', 'product']
      );
    }
  }

  /**
   * Generate bulk symbols for performance testing
   */
  generateBulkSymbols(projectId: number, languageId: number, count: number): schema.NewUniversalSymbol[] {
    const symbols: schema.NewUniversalSymbol[] = [];
    
    for (let i = 0; i < count; i++) {
      symbols.push({
        projectId,
        languageId,
        name: `function_${i}`,
        qualifiedName: `TestNamespace::function_${i}`,
        kind: 'function',
        filePath: `/test/projects/generated_${Math.floor(i / 100)}.cpp`,
        line: (i % 100) + 10,
        column: 0,
        signature: `void function_${i}(int param_${i})`,
        returnType: 'void',
        namespace: 'TestNamespace',
        isExported: i % 2 === 0,
        isAsync: false,
        isAbstract: false,
        visibility: 'public',
        semanticTags: [`tag_${i % 10}`],
        languageFeatures: {
          isTemplate: i % 5 === 0,
          isVirtual: i % 7 === 0,
          isStatic: i % 3 === 0
        }
      });
    }
    
    return symbols;
  }

  /**
   * Generate bulk relationships for performance testing
   */
  generateBulkRelationships(projectId: number, symbols: schema.UniversalSymbol[], count: number): schema.NewUniversalRelationship[] {
    const relationships: schema.NewUniversalRelationship[] = [];
    
    for (let i = 0; i < count; i++) {
      const fromSymbol = symbols[i % symbols.length];
      const toSymbol = symbols[(i + 1) % symbols.length];
      
      relationships.push({
        projectId,
        fromSymbolId: fromSymbol.id,
        toSymbolId: toSymbol.id,
        type: i % 2 === 0 ? 'calls' : 'uses',
        confidence: 0.8 + (Math.random() * 0.2),
        contextLine: 10 + (i % 50),
        contextSnippet: `context_${i}`,
        metadata: { generated: true, index: i }
      });
    }
    
    return relationships;
  }

  /**
   * Setup large test dataset for performance testing
   */
  async setupLargeTestDataset(projectId: number, languageId: number): Promise<void> {
    // Create 1000 symbols
    const symbols = this.generateBulkSymbols(projectId, languageId, 1000);
    await this.db.bulkInsertSymbols(symbols, { batchSize: 100 });
    
    // Get inserted symbols
    const insertedSymbols = await this.db.getSymbolsByProject(projectId, { limit: 1000 });
    
    // Create 2000 relationships
    const relationships = this.generateBulkRelationships(projectId, insertedSymbols, 2000);
    await this.db.bulkInsertRelationships(relationships, { batchSize: 200 });
    
    // Create some C++ features
    const cppFeatures = insertedSymbols.slice(0, 100).map(symbol => ({
      symbolId: symbol.id,
      isTemplate: Math.random() > 0.5,
      isVirtual: Math.random() > 0.7,
      isStatic: Math.random() > 0.6,
      isConst: Math.random() > 0.4,
      usesModernCpp: Math.random() > 0.3,
      isPlanetgenType: Math.random() > 0.8,
      isVulkanType: Math.random() > 0.9
    }));
    
    for (const feature of cppFeatures) {
      await this.db.getDb().insert(schema.cppFeatures).values(feature);
    }
  }

  /**
   * Create multi-language test data
   */
  async createMultiLanguageTestData(): Promise<{
    projects: schema.Project[];
    languages: schema.Language[];
    symbols: { [key: string]: schema.UniversalSymbol[] };
  }> {
    const languages = await this.createSampleLanguages();
    const projects = [
      await this.createSampleProject('multi-lang-cpp'),
      await this.createSampleProject('multi-lang-python'),
      await this.createSampleProject('multi-lang-typescript')
    ];

    const symbols: { [key: string]: schema.UniversalSymbol[] } = {};

    // C++ symbols
    symbols.cpp = await this.createCppSymbols(projects[0].id, languages[0].id);
    
    // Python symbols
    symbols.python = await this.createPythonSymbols(projects[1].id, languages[1].id);
    
    // TypeScript symbols
    symbols.typescript = await this.createTypeScriptSymbols(projects[2].id, languages[2].id);

    return { projects, languages, symbols };
  }

  /**
   * Create C++ specific symbols
   */
  private async createCppSymbols(projectId: number, languageId: number): Promise<schema.UniversalSymbol[]> {
    const symbols = [
      {
        projectId,
        languageId,
        name: 'processData',
        qualifiedName: 'DataProcessor::processData',
        kind: 'function',
        filePath: '/cpp/data_processor.cpp',
        line: 25,
        column: 0,
        signature: 'template<typename T> void processData(const std::vector<T>& data)',
        returnType: 'void',
        namespace: 'DataProcessor',
        isExported: true,
        isAsync: false,
        isAbstract: false,
        visibility: 'public',
        semanticTags: ['template', 'data-processing'],
        languageFeatures: {
          isTemplate: true,
          templateParams: ['T'],
          isVirtual: false,
          isStatic: false,
          usesModernCpp: true,
          usesSmartPointers: true
        }
      }
    ];

    return await this.db.insertSymbols(symbols);
  }

  /**
   * Create Python specific symbols
   */
  private async createPythonSymbols(projectId: number, languageId: number): Promise<schema.UniversalSymbol[]> {
    const symbols = [
      {
        projectId,
        languageId,
        name: 'process_data',
        qualifiedName: 'data_processor.process_data',
        kind: 'function',
        filePath: '/python/data_processor.py',
        line: 15,
        column: 0,
        signature: 'async def process_data(data: List[Any]) -> None',
        returnType: 'None',
        namespace: 'data_processor',
        isExported: true,
        isAsync: true,
        isAbstract: false,
        visibility: 'public',
        semanticTags: ['async', 'data-processing'],
        languageFeatures: {
          isAsync: true,
          hasTypeHints: true,
          isGenerator: false,
          isCoroutine: true,
          decorators: ['@dataclass']
        }
      }
    ];

    return await this.db.insertSymbols(symbols);
  }

  /**
   * Create TypeScript specific symbols
   */
  private async createTypeScriptSymbols(projectId: number, languageId: number): Promise<schema.UniversalSymbol[]> {
    const symbols = [
      {
        projectId,
        languageId,
        name: 'processData',
        qualifiedName: 'DataProcessor.processData',
        kind: 'function',
        filePath: '/typescript/data-processor.ts',
        line: 20,
        column: 0,
        signature: 'async function processData<T>(data: T[]): Promise<void>',
        returnType: 'Promise<void>',
        namespace: 'DataProcessor',
        isExported: true,
        isAsync: true,
        isAbstract: false,
        visibility: 'public',
        semanticTags: ['generic', 'async', 'data-processing'],
        languageFeatures: {
          isAsync: true,
          hasGenerics: true,
          genericParams: ['T'],
          isOptional: false,
          exportType: 'named'
        }
      }
    ];

    return await this.db.insertSymbols(symbols);
  }
}