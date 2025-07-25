import { BaseTest } from '../helpers/BaseTest.js';
import { UniversalIndexer } from '../../src/indexing/universal-indexer.js';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { 
  universalSymbols, 
  pythonFeatures, 
  typescriptFeatures,
  languages
  // projects
} from '../../src/database/drizzle/schema.js';
import * as path from 'path';

export class MultiLanguageParsingTest extends BaseTest {
  private indexer?: UniversalIndexer;
  private drizzleDb: any;
  
  constructor(db: Database.Database) {
    super('Multi-Language Parsing Test', db);
  }

  async runTests(): Promise<void> {
    await this.testPythonParsing();
    await this.testTypeScriptParsing();
    await this.testLanguageSpecificFeatures();
    await this.testCrossLanguageSupport();
  }

  async setUp(): Promise<void> {
    // Get database instance
    const rawDb = this.testDb.getDatabase();
    this.db = drizzle(rawDb);
    
    // Create indexer for test fixtures
    this.indexer = new UniversalIndexer(rawDb, {
      projectPath: path.join(__dirname, '../fixtures/multi-language'),
      projectName: 'multi-language-test',
      languages: ['python', 'typescript'],
      filePatterns: ['*.py', '*.ts'],
      debugMode: true,
      forceReindex: true
    });
  }

  private async testPythonParsing(): Promise<void> {
    this.startTest('Python file parsing');
    
    // Index the Python sample file
    const result = await this.indexer!.indexProject();
    
    this.assert(result.success, 'Indexing should succeed');
    this.assert(result.filesIndexed > 0, 'Should index at least one file');
    
    // Query Python symbols
    const pythonLang = await this.db.select()
      .from(languages)
      .where(eq(languages.name, 'python'))
      .limit(1);
    
    const pythonSymbols = await this.db.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.projectId, result.projectId),
        eq(universalSymbols.languageId, pythonLang[0].id)
      ));
    
    // Verify key Python symbols were extracted
    const symbolNames = pythonSymbols.map(s => s.name);
    this.assert(symbolNames.includes('TerrainPoint'), 'Should find TerrainPoint dataclass');
    this.assert(symbolNames.includes('TerrainGenerator'), 'Should find TerrainGenerator class');
    this.assert(symbolNames.includes('generate_terrain_async'), 'Should find async function');
    this.assert(symbolNames.includes('create_generator'), 'Should find factory function');
    
    // Check Python-specific features
    const terrainGenSymbol = pythonSymbols.find(s => s.name === 'TerrainGenerator');
    if (terrainGenSymbol) {
      const features = await this.db.select()
        .from(pythonFeatures)
        .where(eq(pythonFeatures.symbolId, terrainGenSymbol.id))
        .limit(1);
      
      if (features.length > 0) {
        this.assert(features[0].baseClasses?.includes('ABC'), 'Should detect ABC base class');
      }
    }
    
    this.endTest();
  }

  private async testTypeScriptParsing(): Promise<void> {
    this.startTest('TypeScript file parsing');
    
    // Query TypeScript symbols
    const tsLang = await this.db.select()
      .from(languages)
      .where(eq(languages.name, 'typescript'))
      .limit(1);
    
    const tsSymbols = await this.db.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.languageId, tsLang[0].id));
    
    // Verify key TypeScript symbols
    const symbolNames = tsSymbols.map(s => s.name);
    this.assert(symbolNames.includes('TerrainPoint'), 'Should find TerrainPoint interface');
    this.assert(symbolNames.includes('TerrainGenerator'), 'Should find TerrainGenerator class');
    this.assert(symbolNames.includes('TerrainQuality'), 'Should find TerrainQuality enum');
    this.assert(symbolNames.includes('TerrainViewer'), 'Should find React component');
    this.assert(symbolNames.includes('useTerrainGenerator'), 'Should find React hook');
    
    this.endTest();
  }

  private async testLanguageSpecificFeatures(): Promise<void> {
    this.startTest('Language-specific feature extraction');
    
    // Test Python features
    const asyncFunc = await this.db.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.name, 'generate_terrain_async'))
      .limit(1);
    
    if (asyncFunc.length > 0) {
      this.assert(asyncFunc[0].isAsync, 'Should detect async function');
      
      const pyFeatures = await this.db.select()
        .from(pythonFeatures)
        .where(eq(pythonFeatures.symbolId, asyncFunc[0].id))
        .limit(1);
      
      if (pyFeatures.length > 0) {
        this.assert(pyFeatures[0].isCoroutine || asyncFunc[0].isAsync, 
          'Should detect coroutine/async nature');
      }
    }
    
    // Test TypeScript features
    const reactComponent = await this.db.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.name, 'TerrainViewer'))
      .limit(1);
    
    if (reactComponent.length > 0) {
      const tsFeatures = await this.db.select()
        .from(typescriptFeatures)
        .where(eq(typescriptFeatures.symbolId, reactComponent[0].id))
        .limit(1);
      
      if (tsFeatures.length > 0) {
        this.assert(tsFeatures[0].isReactComponent, 'Should detect React component');
      }
    }
    
    // Test React hook detection
    const reactHook = await this.db.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.name, 'useTerrainGenerator'))
      .limit(1);
    
    if (reactHook.length > 0) {
      const tsFeatures = await this.db.select()
        .from(typescriptFeatures)
        .where(eq(typescriptFeatures.symbolId, reactHook[0].id))
        .limit(1);
      
      if (tsFeatures.length > 0) {
        this.assert(tsFeatures[0].isReactHook, 'Should detect React hook');
      }
    }
    
    this.endTest();
  }

  private async testCrossLanguageSupport(): Promise<void> {
    this.startTest('Cross-language support verification');
    
    // Both languages should have a TerrainGenerator class
    const terrainGenerators = await this.db.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.name, 'TerrainGenerator'));
    
    this.assert(terrainGenerators.length >= 2, 
      'Should find TerrainGenerator in multiple languages');
    
    // Check that both are classes
    const classSymbols = terrainGenerators.filter(s => s.kind === 'class');
    this.assert(classSymbols.length >= 2, 
      'Both TerrainGenerators should be identified as classes');
    
    // Verify language features are stored separately
    const pythonGen = terrainGenerators.find(s => {
      const lang = this.db.select()
        .from(languages)
        .where(eq(languages.id, s.languageId))
        .limit(1);
      return lang[0]?.name === 'python';
    });
    
    const tsGen = terrainGenerators.find(s => {
      const lang = this.db.select()
        .from(languages)  
        .where(eq(languages.id, s.languageId))
        .limit(1);
      return lang[0]?.name === 'typescript';
    });
    
    this.assert(pythonGen && tsGen, 'Should have both Python and TypeScript versions');
    this.assert(pythonGen!.id !== tsGen!.id, 'Should have different symbol IDs');
    
    this.endTest();
  }
  
  private assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
}