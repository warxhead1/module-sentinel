#!/usr/bin/env tsx
/**
 * Simple test for Python async function detection
 */

import Database from 'better-sqlite3';
import { PythonLanguageParser } from './dist/parsers/adapters/python-language-parser.js';
import * as fs from 'fs';

async function testPythonAsync() {
  console.log('🧪 Testing Python Async Function Detection\n');
  
  // Create in-memory database
  const db = new Database(':memory:');
  
  // Create minimal schema - use the same as migration 0001
  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL
    );
    
    CREATE TABLE languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      file_extensions TEXT NOT NULL
    );
    
    INSERT INTO projects (id, name, path) VALUES (1, 'test', '.');
    INSERT INTO languages (id, name, file_extensions) VALUES (1, 'python', '.py,.pyi,.pyx');
    
    CREATE TABLE universal_symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      qualified_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line INTEGER NOT NULL,
      column INTEGER NOT NULL,
      end_line INTEGER,
      end_column INTEGER,
      return_type TEXT,
      signature TEXT,
      visibility TEXT,
      namespace TEXT,
      parent_symbol_id INTEGER,
      is_exported INTEGER DEFAULT 0,
      is_async INTEGER DEFAULT 0,
      is_abstract INTEGER DEFAULT 0,
      language_features TEXT,
      semantic_tags TEXT,
      confidence REAL DEFAULT 1.0,
      is_definition INTEGER DEFAULT 1,
      complexity INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE universal_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_symbol_id INTEGER,
      to_symbol_id INTEGER,
      type TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      is_cross_language INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    
    CREATE TABLE control_flow_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol_id INTEGER NOT NULL,
      project_id INTEGER,
      block_type TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      parent_block_id INTEGER,
      condition TEXT,
      loop_type TEXT,
      complexity INTEGER DEFAULT 1
    );
    
    CREATE TABLE symbol_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_symbol_id INTEGER NOT NULL,
      callee_symbol_id INTEGER,
      callee_name TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      column_number INTEGER,
      is_resolved INTEGER DEFAULT 0,
      confidence REAL DEFAULT 1.0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  // Create parser
  const parser = new PythonLanguageParser(db, {
    projectPath: '.',
    debugMode: true
  });
  
  // Test content
  const testContent = `
async def generate_terrain_async(
    generator: TerrainGenerator, 
    points: List[tuple[float, float]]
) -> List[TerrainPoint]:
    """Asynchronously generate terrain for multiple points."""
    tasks = []
    return await asyncio.gather(*tasks)

def sync_function():
    """A regular synchronous function."""
    return 42
`;
  
  // Initialize parser
  await parser.initialize();
  
  // Parse
  console.log('Parsing test content...');
  const result = await parser.parseFile('test.py', testContent);
  
  console.log(`\nFound ${result.symbols.length} symbols:`);
  for (const symbol of result.symbols) {
    console.log(`  - ${symbol.name}: isAsync=${symbol.isAsync}, kind=${symbol.kind}`);
  }
  
  // Query from database
  console.log('\nQuerying from database:');
  const rows = db.prepare('SELECT name, is_async FROM universal_symbols').all();
  for (const row of rows) {
    console.log(`  - ${row.name}: is_async=${row.is_async}`);
  }
  
  db.close();
  console.log('\n✅ Test complete!');
}

testPythonAsync().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});