/**
 * Simple Universal Indexer Test
 * Tests basic functionality of the universal indexer
 */

import Database from 'better-sqlite3';
import { UniversalIndexer } from '../../dist/indexing/universal-indexer.js';
import { TestResult } from '../helpers/JUnitReporter';
import * as path from 'path';

export class UniversalIndexerTest {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test 1: Can create indexer
    results.push(await this.testCreateIndexer());
    
    // Test 2: Can index a simple project
    results.push(await this.testIndexProject());
    
    // Test 3: Can find indexed symbols
    results.push(await this.testFindSymbols());
    
    return results;
  }
  
  private async testCreateIndexer(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const indexer = new UniversalIndexer(this.db, {
        projectPath: process.cwd(),
        projectName: 'test',
        languages: ['cpp']
      });
      
      // Verify indexer was created successfully
      this.assert(indexer !== null, 'Indexer should be created successfully');
      this.assert(typeof indexer.index === 'function', 'Indexer should have index method');
      
      return {
        name: 'testCreateIndexer',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testCreateIndexer',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testIndexProject(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const testPath = path.join(process.cwd(), 'test/complex-files/cpp');
      const indexer = new UniversalIndexer(this.db, {
        projectPath: testPath,
        projectName: 'test-cpp',
        languages: ['cpp'],
        filePatterns: ['**/*.cpp', '**/*.hpp', '**/*.h'],
        enableSemanticAnalysis: false,  // Disable for testing
        maxFiles: 10  // Limit to 10 files for faster testing
      });
      
      const result = await indexer.indexProject();
      
      if (!result.success) {
        console.error('Indexing failed with errors:', result.errors);
        throw new Error(`Indexing failed: ${result.errors.join(', ')}`);
      }
      
      if (result.filesIndexed === 0) {
        throw new Error('No files were indexed');
      }
      
      return {
        name: 'testIndexProject',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testIndexProject',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testFindSymbols(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // First, check total symbols
      const totalSymbols = this.db.prepare(`
        SELECT COUNT(*) as count FROM universal_symbols
      `).get() as { count: number };
      
      console.log(`  Total symbols in database: ${totalSymbols.count}`);
      
      // Check symbols by type
      const symbolsByType = this.db.prepare(`
        SELECT kind, COUNT(*) as count 
        FROM universal_symbols 
        GROUP BY kind
        ORDER BY count DESC
      `).all() as Array<{ kind: string; count: number }>;
      
      console.log(`  Symbol types: ${symbolsByType.map(s => `${s.kind}=${s.count}`).join(', ')}`);
      
      if (totalSymbols.count === 0) {
        // Debug: check if files were indexed
        const filesIndexed = this.db.prepare(`
          SELECT COUNT(*) as count FROM file_index WHERE is_indexed = 1
        `).get() as { count: number };
        
        console.log(`  Files indexed: ${filesIndexed.count}`);
        
        throw new Error(`No symbols found in database. Total files indexed: ${filesIndexed.count}`);
      }
      
      // Query for specific symbol types
      const symbols = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM universal_symbols 
        WHERE kind IN ('class', 'function', 'method', 'namespace', 'module')
      `).get() as { count: number };
      
      if (symbols.count === 0) {
        throw new Error('No meaningful symbols (class/function/method/namespace/module) found');
      }
      
      return {
        name: 'testFindSymbols',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testFindSymbols',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}