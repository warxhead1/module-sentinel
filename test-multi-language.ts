#!/usr/bin/env tsx
/**
 * Standalone test for multi-language parsing
 */

import Database from 'better-sqlite3';
import { UniversalIndexer } from './src/indexing/universal-indexer.js';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { 
  universalSymbols, 
  pythonFeatures, 
  typescriptFeatures,
  languages,
  projects
} from './src/database/drizzle/schema.js';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('🧪 Testing Multi-Language Parsing Support\n');
  
  // Create a test database
  const dbPath = '.test-db/multi-language-test.db';
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  
  const rawDb = new Database(dbPath);
  const db = drizzle(rawDb);
  
  // Run the schema migration
  console.log('📊 Initializing database...');
  const schemaSQL = fs.readFileSync('./src/database/migrations/0001_unified_schema.sql', 'utf-8');
  rawDb.exec(schemaSQL);
  
  // Create indexer
  const indexer = new UniversalIndexer(rawDb, {
    projectPath: path.join(__dirname, 'test/fixtures/multi-language'),
    projectName: 'multi-language-test',
    languages: ['python', 'typescript'],
    filePatterns: ['*.py', '*.ts'],
    debugMode: true,
    forceReindex: true
  });
  
  console.log('\n🔍 Indexing multi-language project...');
  const result = await indexer.indexProject();
  
  console.log(`\n✅ Indexing complete:`);
  console.log(`   Files indexed: ${result.filesIndexed}`);
  console.log(`   Symbols found: ${result.symbolsFound}`);
  console.log(`   Relationships: ${result.relationshipsFound}`);
  console.log(`   Patterns: ${result.patternsFound}`);
  console.log(`   Duration: ${result.duration}ms`);
  
  if (result.errors.length > 0) {
    console.log(`\n⚠️  Errors: ${result.errors.join(', ')}`);
  }
  
  // Query results
  console.log('\n📊 Analyzing results...\n');
  
  // Python analysis
  const pythonLang = await db.select()
    .from(languages)
    .where(eq(languages.name, 'python'))
    .limit(1);
  
  if (pythonLang.length > 0) {
    const pythonSymbols = await db.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.projectId, result.projectId),
        eq(universalSymbols.languageId, pythonLang[0].id)
      ));
    
    console.log(`🐍 Python symbols found: ${pythonSymbols.length}`);
    const pythonClasses = pythonSymbols.filter(s => s.kind === 'class');
    const pythonFunctions = pythonSymbols.filter(s => s.kind === 'function');
    console.log(`   - Classes: ${pythonClasses.length}`);
    console.log(`   - Functions: ${pythonFunctions.length}`);
    console.log(`   - All function names: ${pythonFunctions.map(f => f.name).join(', ')}`);
    
    // Check for specific symbols
    const foundDataclass = pythonSymbols.some(s => s.name === 'TerrainPoint');
    const asyncFunc = pythonSymbols.find(s => s.name === 'generate_terrain_async');
    const foundAsyncFunc = asyncFunc && asyncFunc.isAsync;
    console.log(`   - Found @dataclass TerrainPoint: ${foundDataclass ? '✅' : '❌'}`);
    console.log(`   - Found async function generate_terrain_async: ${foundAsyncFunc ? '✅' : '❌'}`);
    if (asyncFunc) {
      console.log(`     Debug: function found, isAsync=${asyncFunc.isAsync}, line=${asyncFunc.line}`);
    }
    
    // Check Python-specific features
    if (foundAsyncFunc) {
      const asyncFunc = pythonSymbols.find(s => s.name === 'generate_terrain_async');
      if (asyncFunc) {
        const pyFeatures = await db.select()
          .from(pythonFeatures)
          .where(eq(pythonFeatures.symbolId, asyncFunc.id))
          .limit(1);
        
        if (pyFeatures.length > 0) {
          console.log(`   - Async function features captured: ✅`);
        }
      }
    }
  }
  
  // TypeScript analysis
  console.log('');
  const tsLang = await db.select()
    .from(languages)
    .where(eq(languages.name, 'typescript'))
    .limit(1);
  
  if (tsLang.length > 0) {
    const tsSymbols = await db.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.projectId, result.projectId),
        eq(universalSymbols.languageId, tsLang[0].id)
      ));
    
    console.log(`📘 TypeScript symbols found: ${tsSymbols.length}`);
    const tsClasses = tsSymbols.filter(s => s.kind === 'class');
    const tsInterfaces = tsSymbols.filter(s => s.kind === 'interface');
    const tsFunctions = tsSymbols.filter(s => s.kind === 'function');
    console.log(`   - Classes: ${tsClasses.length}`);
    console.log(`   - Interfaces: ${tsInterfaces.length}`);
    console.log(`   - Functions: ${tsFunctions.length}`);
    
    // Check for specific symbols
    const foundInterface = tsSymbols.some(s => s.name === 'TerrainPoint' && s.kind === 'interface');
    const foundEnum = tsSymbols.some(s => s.name === 'TerrainQuality');
    const foundReactComponent = tsSymbols.some(s => s.name === 'TerrainViewer');
    const foundReactHook = tsSymbols.some(s => s.name === 'useTerrainGenerator');
    
    console.log(`   - Found TerrainPoint interface: ${foundInterface ? '✅' : '❌'}`);
    console.log(`   - Found TerrainQuality enum: ${foundEnum ? '✅' : '❌'}`);
    console.log(`   - Found React component: ${foundReactComponent ? '✅' : '❌'}`);
    console.log(`   - Found React hook: ${foundReactHook ? '✅' : '❌'}`);
    
    // Check TypeScript-specific features
    if (foundReactComponent) {
      const component = tsSymbols.find(s => s.name === 'TerrainViewer');
      if (component) {
        const tsFeatures = await db.select()
          .from(typescriptFeatures)
          .where(eq(typescriptFeatures.symbolId, component.id))
          .limit(1);
        
        if (tsFeatures.length > 0 && tsFeatures[0].isReactComponent) {
          console.log(`   - React component detection: ✅`);
        } else {
          console.log(`   - React component detection: ❌`);
        }
      }
    }
  }
  
  // Cross-language analysis
  console.log('\n🌐 Cross-language analysis:');
  const terrainGenerators = await db.select()
    .from(universalSymbols)
    .where(and(
      eq(universalSymbols.name, 'TerrainGenerator'),
      eq(universalSymbols.projectId, result.projectId)
    ));
  
  console.log(`   - Found ${terrainGenerators.length} TerrainGenerator symbols across languages`);
  
  rawDb.close();
  console.log('\n✅ Multi-language parsing test complete!');
}

runTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});