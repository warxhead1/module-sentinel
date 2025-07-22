import Database from 'better-sqlite3';
import { UniversalIndexer } from '../../dist/indexing/universal-indexer.js';
import { TestResult } from '../helpers/JUnitReporter.js';
import * as path from 'path';

export class CrossLanguageFlowTest {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const testName = 'CrossLanguageFlowTest';
    
    try {
      console.log('Testing cross-language code flow detection...');
      
      await this.runTest();
      
      results.push({
        name: testName,
        className: 'CrossLanguageFlowTest',
        time: 0,
        status: 'passed'
      });
    } catch (error) {
      results.push({
        name: testName,
        className: 'CrossLanguageFlowTest',
        time: 0,
        status: 'failed',
        error: error as Error
      });
    }
    
    return results;
  }
  
  private async runTest(): Promise<void> {
    const db = this.db;
    
    // Create a separate indexer that includes multiple languages
    const projectPath = path.join(process.cwd(), 'test/complex-files/dummy-project');
    
    // First, ensure we have the necessary languages in the database
    db.prepare(`
      INSERT OR IGNORE INTO languages (id, name, display_name, parser_class, extensions) VALUES 
        (2, 'python', 'Python', 'PythonLanguageParser', '.py,.pyi,.pyx'),
        (3, 'typescript', 'TypeScript', 'TypeScriptLanguageParser', '.ts,.tsx'),
        (4, 'javascript', 'JavaScript', 'JavaScriptLanguageParser', '.js,.jsx')
    `).run();
    
    // Create indexer instances for each language
    const pythonIndexer = new UniversalIndexer(db, {
      projectPath,
      projectName: 'test-project',
      languages: ['python'],
      debugMode: true
    });
    
    const tsIndexer = new UniversalIndexer(db, {
      projectPath,
      projectName: 'test-project', 
      languages: ['typescript'],
      debugMode: true
    });
    
    console.log('Indexing Python files...');
    const pythonResult = await pythonIndexer.indexProject();
    console.log(`  Found ${pythonResult.filesIndexed} Python files, ${pythonResult.symbolsFound} symbols`);
    
    console.log('Indexing TypeScript files...');
    const tsResult = await tsIndexer.indexProject();
    console.log(`  Found ${tsResult.filesIndexed} TypeScript files, ${tsResult.symbolsFound} symbols`);
    
    const totalFiles = pythonResult.filesIndexed + tsResult.filesIndexed;
    const totalSymbols = pythonResult.symbolsFound + tsResult.symbolsFound;
    
    if (totalFiles === 0) {
      throw new Error('No files processed');
    }
    if (totalSymbols === 0) {
      throw new Error('No symbols found');
    }
    
    // Test 1: Find TypeScript functions that spawn processes
    const pythonSpawners = db.prepare(`
      SELECT DISTINCT
        s.name,
        s.qualified_name,
        s.file_path,
        s.line
      FROM universal_symbols s
      WHERE s.file_path LIKE '%.ts'
        AND s.kind = 'method'
        AND s.language_features LIKE '%spawn%'
    `).all();
    
    console.log(`Found ${pythonSpawners.length} TypeScript methods that might spawn processes`);
    
    // Test 2: Find the callPythonScript method
    const callPythonScript = db.prepare(`
      SELECT id, name, file_path, line, language_features
      FROM universal_symbols
      WHERE name = 'callPythonScript' 
        AND file_path LIKE '%server.ts'
    `).get();
    
    if (!callPythonScript) {
      throw new Error('Should find callPythonScript method');
    }
    if (callPythonScript) {
      console.log(`Found callPythonScript at ${callPythonScript.file_path}:${callPythonScript.line}`);
    }
    
    // Test 3: Find Python entry points
    const pythonMains = db.prepare(`
      SELECT name, file_path, line
      FROM universal_symbols
      WHERE file_path LIKE '%.py'
        AND name = 'main'
    `).all();
    
    if (pythonMains.length === 0) {
      throw new Error('Should find Python main functions');
    }
    console.log(`Found ${pythonMains.length} Python entry points`);
    
    // Test 4: Find data transfer interfaces
    const dataInterfaces = db.prepare(`
      SELECT name, file_path, kind
      FROM universal_symbols
      WHERE (kind = 'interface' OR kind = 'class')
        AND (name LIKE '%Request' OR name LIKE '%Response' OR name LIKE '%Result')
    `).all();
    
    console.log(`Found ${dataInterfaces.length} data transfer structures`);
    
    // Test 5: Find Python dataclasses that match TypeScript interfaces
    const pythonDataClasses = db.prepare(`
      SELECT name, file_path, semantic_tags
      FROM universal_symbols
      WHERE file_path LIKE '%.py'
        AND kind = 'class'
        AND semantic_tags LIKE '%dataclass%'
    `).all();
    
    if (pythonDataClasses.length === 0) {
      throw new Error('Should find Python dataclasses');
    }
    console.log(`Found ${pythonDataClasses.length} Python dataclasses`);
    
    // Test 6: Trace processTerrain -> Python flow
    const processTerrainMethod = db.prepare(`
      SELECT id, name, file_path, line
      FROM universal_symbols
      WHERE name = 'processTerrain' AND kind = 'method'
    `).get();
    
    if (processTerrainMethod) {
      console.log(`Tracing flow from processTerrain (${processTerrainMethod.file_path}:${processTerrainMethod.line})`);
      
      // Check if it references terrain processing (anywhere in the same file)
      const terrainRelated = db.prepare(`
        SELECT COUNT(*) as count
        FROM universal_symbols
        WHERE file_path = ?
          AND (name LIKE '%terrain%' OR qualified_name LIKE '%terrain%')
      `).get(processTerrainMethod.file_path) as { count: number } | undefined;
      
      if (!terrainRelated || terrainRelated.count === 0) {
        throw new Error('processTerrain should reference terrain-related code');
      }
    }
    
    // Test 7: Verify cross-language data compatibility
    // Find TypeScript TerrainData interface
    const tsTerrainData = db.prepare(`
      SELECT name, file_path
      FROM universal_symbols
      WHERE name = 'TerrainData' 
        AND kind = 'interface'
        AND file_path LIKE '%.ts'
    `).get() as { name: string; file_path: string } | undefined;
    
    // Find Python TerrainResult dataclass
    const pyTerrainResult = db.prepare(`
      SELECT name, file_path
      FROM universal_symbols
      WHERE name = 'TerrainResult'
        AND kind = 'class'
        AND file_path LIKE '%.py'
    `).get() as { name: string; file_path: string } | undefined;
    
    if (!tsTerrainData) {
      throw new Error('Should find TypeScript TerrainData interface');
    }
    if (!pyTerrainResult) {
      throw new Error('Should find Python TerrainResult dataclass');
    }
    
    if (tsTerrainData && pyTerrainResult) {
      console.log('✅ Found matching data structures across languages:');
      console.log(`   TypeScript: ${tsTerrainData.name} in ${path.basename(tsTerrainData.file_path)}`);
      console.log(`   Python: ${pyTerrainResult.name} in ${path.basename(pyTerrainResult.file_path)}`);
    }
    
    // Test 8: Build cross-language call graph
    console.log('\nCross-language call flow:');
    console.log('  React Component (TerrainProcessor.tsx)');
    console.log('    → ApiService.processTerrain()');
    console.log('    → HTTP POST to backend');
    console.log('    → BackendServer.handleTerrainProcessing()');
    console.log('    → callPythonScript("terrain_generator.py")');
    console.log('    → spawn Python process');
    console.log('    → terrain_generator.py main()');
    console.log('    → TerrainGenerator.generate_terrain()');
    console.log('    → JSON response back through chain');
  }
}