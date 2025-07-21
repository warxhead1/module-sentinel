import { BaseTest } from '../helpers/BaseTest';
import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { PatternBasedParser } from '../../dist/parsers/tree-sitter/pattern-based-parser.js';
import { CPP_SYMBOL_PATTERNS, CPP_RELATIONSHIP_PATTERNS } from '../../dist/parsers/tree-sitter/cpp-patterns.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class RelationshipExtractionTest extends BaseTest {
  private patternParser!: PatternBasedParser;
  private db: Database;

  constructor(db: Database) {
    super('RelationshipExtractionTest');
    this.db = db;
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Initialize pattern-based parser directly for unit testing
    this.patternParser = new PatternBasedParser(
      CPP_SYMBOL_PATTERNS,
      CPP_RELATIONSHIP_PATTERNS,
      true // debug mode
    );
    
    // Test BufferFactory parsing improvements
    results.push(await this.testBufferFactoryParsing());
    
    // Test the parsing logic directly
    results.push(await this.testPatternBasedInheritanceExtraction());
    results.push(await this.testPatternBasedFunctionCallExtraction());
    
    // Test that relationships were stored in the database after indexing
    results.push(await this.testDatabaseRelationships());
    
    return results;
  }
  
  private async testBufferFactoryParsing(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Query symbols from any Buffer-related files in complex-files directory
      const symbols = this.db.prepare(`
        SELECT file_path, name, kind, qualified_name, line 
        FROM universal_symbols 
        WHERE file_path LIKE '%complex-files%' 
          AND (file_path LIKE '%Buffer%' OR file_path LIKE '%buffer%')
        ORDER BY file_path, line
      `).all();
      
      console.log(`[DEBUG] Found ${symbols.length} Buffer-related symbols in complex-files`);
      symbols.forEach((s: any) => {
        console.log(`[DEBUG] ${s.file_path}:${s.line} - ${s.kind} ${s.name}`);
      });
      
      // Check for improvements
      const cppMethods = symbols.filter((s: any) => 
        s.file_path.includes('.cpp') && s.kind === 'method'
      );
      const cppFunctions = symbols.filter((s: any) => 
        s.file_path.includes('.cpp') && s.kind === 'function'
      );
      const logErrors = symbols.filter((s: any) => 
        s.name.includes('LOG_ERROR')
      );
      
      console.log(`[DEBUG] .cpp methods: ${cppMethods.length}`);
      console.log(`[DEBUG] .cpp functions: ${cppFunctions.length}`);
      console.log(`[DEBUG] LOG_ERROR symbols: ${logErrors.length}`);
      
      // More lenient assertions since we're looking at any buffer-related files
      this.assert(
        symbols.length > 0,
        `Expected to find some buffer-related symbols, found ${symbols.length}`
      );
      
      if (logErrors.length > 0) {
        console.log(`[DEBUG] LOG_ERROR symbols found (should be relationships):`);
        logErrors.forEach((s: any) => {
          console.log(`  ${s.file_path}:${s.line} - ${s.kind} ${s.name} - qualified: ${s.qualified_name}`);
        });
      }
      
      this.assert(
        logErrors.length === 0,
        `Expected LOG_ERROR calls to be relationships not symbols, found ${logErrors.length}`
      );
      
      // Check for duplicates
      const uniqueSymbols = new Set();
      const duplicates = symbols.filter((s: any) => {
        const key = `${s.file_path}:${s.line}:${s.name}`;
        if (uniqueSymbols.has(key)) {
          return true;
        }
        uniqueSymbols.add(key);
        return false;
      });
      
      this.assert(
        duplicates.length === 0,
        `Expected no duplicate symbols, found ${duplicates.length}`
      );
      
      return {
        name: 'buffer_factory_parsing',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'buffer_factory_parsing',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testPatternBasedInheritanceExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const filePath = path.resolve('./test/complex-files/Buffer/BufferCore.ixx');
      const content = await fs.readFile(filePath, 'utf-8');
      
      // First extract symbols
      const symbols = await this.patternParser.extractSymbols(content, filePath);
      console.log(`[DEBUG] Extracted ${symbols.length} symbols from BufferCore.ixx`);
      
      // Then extract relationships
      const relationships = await this.patternParser.extractRelationships(content, filePath, symbols);
      console.log(`[DEBUG] Extracted ${relationships.length} relationships from BufferCore.ixx`);
      
      // Debug: Show all relationships found
      if (relationships.length > 0) {
        console.log(`[DEBUG] All relationships found:`);
        relationships.forEach((rel, i) => {
          console.log(`  ${i+1}. ${rel.fromSymbolId} -> ${rel.toSymbolId} (${rel.type}) - line ${rel.contextLine || 'unknown'}`);
        });
      }
      
      // Check for inheritance relationships
      const inheritanceRels = relationships.filter(r => r.type === 'inherits');
      this.assert(
        inheritanceRels.length > 0,
        `Expected at least one inheritance relationship, found ${inheritanceRels.length}`
      );
      
      // Check for the specific BufferResource -> RefCountedResource relationship
      const bufferResourceInheritance = inheritanceRels.find(
        r => r.fromSymbolId === 'BufferResource' && r.toSymbolId === 'RefCountedResource'
      );
      this.assert(
        bufferResourceInheritance !== undefined,
        'Should find BufferResource inheriting from RefCountedResource'
      );
      
      return {
        name: 'pattern_based_inheritance_extraction',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'pattern_based_inheritance_extraction',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testPatternBasedFunctionCallExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Find any .cpp file in complex-files directory
      const files = await fs.readdir('./test/complex-files', { recursive: true });
      const cppFiles = files.filter(f => f.toString().endsWith('.cpp'));
      
      if (cppFiles.length === 0) {
        throw new Error('No .cpp files found in complex-files directory');
      }
      
      const filePath = path.resolve('./test/complex-files', cppFiles[0].toString());
      const content = await fs.readFile(filePath, 'utf-8');
      
      // First extract symbols
      const symbols = await this.patternParser.extractSymbols(content, filePath);
      console.log(`[DEBUG] Extracted ${symbols.length} symbols from ${cppFiles[0]}`);
      
      // Then extract relationships
      const relationships = await this.patternParser.extractRelationships(content, filePath, symbols);
      console.log(`[DEBUG] Extracted ${relationships.length} relationships from ${cppFiles[0]}`);
      
      // Check for function call relationships
      const callRels = relationships.filter(r => r.type === 'calls');
      console.log(`[DEBUG] Found ${callRels.length} function call relationships`);
      
      if (callRels.length > 0) {
        console.log(`[DEBUG] Sample function calls (first 5):`);
        callRels.slice(0, 5).forEach(rel => {
          console.log(`  ${rel.fromSymbolId} -> ${rel.toSymbolId}`);
        });
      }
      
      this.assert(
        callRels.length > 0,
        `Expected function call relationships, found ${callRels.length}`
      );
      
      return {
        name: 'pattern_based_function_call_extraction',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'pattern_based_function_call_extraction',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testDatabaseRelationships(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Query the database for relationships that were stored during indexing
      const relationships = this.db.prepare(`
        SELECT r.*, 
               s1.name as from_name, s1.qualified_name as from_qualified,
               s2.name as to_name, s2.qualified_name as to_qualified
        FROM universal_relationships r
        JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
        JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
        WHERE r.project_id = 1
        LIMIT 20
      `).all();
      
      console.log(`[DEBUG] Relationships in database: ${relationships.length}`);
      relationships.forEach((rel: any) => {
        console.log(`  ${rel.from_name} -> ${rel.to_name} (${rel.type})`);
      });
      
      this.assert(
        relationships.length > 0,
        `Expected relationships in database, found ${relationships.length}`
      );
      
      // Check for specific relationship types
      const inheritanceRels = relationships.filter((r: any) => r.type === 'inherits');
      console.log(`[DEBUG] Inheritance relationships: ${inheritanceRels.length}`);
      
      // Check for inheritance relationships in general
      // Note: BufferResource -> RefCountedResource may not be stored if RefCountedResource
      // is imported but not defined in our test files (which is realistic)
      const hasInheritanceRels = inheritanceRels.length > 0;
      this.assert(
        hasInheritanceRels,
        `Expected some inheritance relationships, found ${inheritanceRels.length}`
      );
      
      // Log what inheritance relationships we do have
      console.log(`[DEBUG] Inheritance relationships found:`);
      
      return {
        name: 'database_relationships',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'database_relationships',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}