/**
 * AST Generation Test
 * 
 * Targeted test to identify and fix null AST issues in tree-sitter parsing.
 * This test checks specific files that are known to have parsing issues.
 */

import Database from 'better-sqlite3';
import { TestResult } from '../helpers/JUnitReporter.js';
import { OptimizedCppTreeSitterParser } from '../../src/parsers/tree-sitter/optimized-cpp-parser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ASTGenerationTest {
  private parser: OptimizedCppTreeSitterParser;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async setup(): Promise<void> {
    
    // Initialize the C++ parser
    this.parser = new OptimizedCppTreeSitterParser(this.db, {
      debugMode: true,
      enableSemanticAnalysis: false, // Focus on AST generation only
      projectId: 1,
      languageId: 1
    });
    
    await this.parser.initialize();
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    await this.setup();
    console.log('\n🔍 Testing AST Generation for specific problematic files...');
    
    // Test files that are known to have issues
    const testFiles = [
      '/home/warxh/planet_procgen/src/rendering/RenderingTypes.ixx',
      '/home/warxh/planet_procgen/src/core/CoreTypes.ixx',
      '/home/warxh/planet_procgen/src/terrain/TerrainTypes.ixx'
    ];

    let successCount = 0;
    let failureCount = 0;
    const failedFiles: string[] = [];

    for (const filePath of testFiles) {
      try {
        console.log(`\n📁 Testing file: ${path.basename(filePath)}`);
        
        // Check if file exists
        const fileExists = await this.fileExists(filePath);
        if (!fileExists) {
          console.log(`  ⚠️  File does not exist: ${filePath}`);
          continue;
        }

        // Read file content
        const content = await fs.readFile(filePath, 'utf-8');
        console.log(`  📄 File size: ${content.length} characters, ${content.split('\n').length} lines`);

        // Test tree-sitter parsing directly
        const parseResult = await this.testTreeSitterParsing(filePath, content);
        
        if (parseResult.success) {
          console.log(`  ✅ AST generation successful`);
          console.log(`  📊 Symbols found: ${parseResult.symbolCount}`);
          console.log(`  🌳 AST tree: ${parseResult.hasValidTree ? 'Valid' : 'Invalid'}`);
          successCount++;
        } else {
          console.log(`  ❌ AST generation failed: ${parseResult.error}`);
          failedFiles.push(filePath);
          failureCount++;
        }

      } catch (error) {
        console.log(`  💥 Test error for ${path.basename(filePath)}: ${error}`);
        failedFiles.push(filePath);
        failureCount++;
      }
    }

    // Summary
    console.log(`\n📈 AST Generation Test Results:`);
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed: ${failureCount}`);
    
    if (failedFiles.length > 0) {
      console.log(`  💥 Failed files:`);
      failedFiles.forEach(file => console.log(`    - ${path.basename(file)}`));
    }

    // Additional diagnostics
    await this.runDiagnostics();
    
    // Return test results
    results.push({
      name: 'ASTGenerationTest',
      status: failureCount === 0 ? 'passed' : 'failed',
      message: `${successCount} passed, ${failureCount} failed`,
      duration: 0
    });
    
    return results;
  }

  private async testTreeSitterParsing(filePath: string, content: string): Promise<{
    success: boolean;
    symbolCount: number;
    hasValidTree: boolean;
    error?: string;
  }> {
    try {
      // Test the parser directly
      const result = await this.parser.parseFile(filePath, content);
      
      // Check if we got symbols
      const symbolCount = result.symbols?.length || 0;
      
      // Check if we have a valid tree (this is the key issue we're testing)
      let hasValidTree = false;
      
      // Try to access tree-sitter directly to see what's happening
      const parser = (this.parser as any).parser;
      if (parser) {
        try {
          const tree = parser.parse(content);
          hasValidTree = tree !== null && tree !== undefined;
          
          if (tree) {
            console.log(`    🌳 Tree root node type: ${tree.rootNode?.type || 'undefined'}`);
            console.log(`    🌳 Tree root children: ${tree.rootNode?.childCount || 0}`);
          } else {
            console.log(`    ❌ Parser returned null/undefined tree`);
          }
        } catch (parseError) {
          console.log(`    💥 Direct parsing error: ${parseError}`);
        }
      } else {
        console.log(`    ❌ Parser is null/undefined`);
      }

      return {
        success: symbolCount > 0,
        symbolCount,
        hasValidTree,
        error: symbolCount === 0 ? 'No symbols extracted' : undefined
      };
      
    } catch (error) {
      return {
        success: false,
        symbolCount: 0,
        hasValidTree: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async runDiagnostics(): Promise<void> {
    console.log(`\n🔧 Running diagnostics...`);
    
    // Check tree-sitter-cpp installation
    try {
      const cppLanguage = require('tree-sitter-cpp');
      console.log(`  ✅ tree-sitter-cpp module loaded successfully`);
      console.log(`  📦 Module type: ${typeof cppLanguage}`);
      console.log(`  🏗️  Module constructor: ${typeof cppLanguage === 'function' ? 'Function' : 'Other'}`);
    } catch (error) {
      console.log(`  ❌ tree-sitter-cpp loading failed: ${error}`);
    }

    // Check parser initialization - safely access private property
    try {
      const useTreeSitter = (this.parser as any).useTreeSitter;
      console.log(`  🌳 Tree-sitter enabled: ${useTreeSitter}`);
    } catch (error) {
      console.log(`  🌳 Tree-sitter status: Cannot access private property (parser likely working) - ${error}`);
    }
    
    // Check if parser instance exists
    const parser = (this.parser as any).parser;
    console.log(`  🔧 Parser instance: ${parser ? 'Present' : 'Missing'}`);
    
    if (parser) {
      try {
        // Test with simple C++ content
        const simpleContent = `
namespace Test {
  class SimpleClass {
    int value;
  };
}`;
        
        console.log(`  🧪 Testing simple C++ content...`);
        const tree = parser.parse(simpleContent);
        
        if (tree) {
          console.log(`    ✅ Simple content parsed successfully`);
          console.log(`    🌳 Root node type: ${tree.rootNode.type}`);
          console.log(`    👶 Child count: ${tree.rootNode.childCount}`);
        } else {
          console.log(`    ❌ Simple content parsing returned null`);
        }
      } catch (error) {
        console.log(`    💥 Simple content parsing error: ${error}`);
      }
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}