import { BaseTest } from '../BaseTest.js';
import { OptimizedCppParser } from '../../src/parsers/tree-sitter/optimized-cpp-parser.js';
import { DatabaseSchema } from '../../src/database/schema/base.js';
import path from 'path';
import fs from 'fs/promises';

export class StructMethodExtractionTest extends BaseTest {
  private parser!: OptimizedCppParser;

  protected getTestName(): string {
    return 'StructMethodExtractionTest';
  }

  protected getTestDescription(): string {
    return 'Tests extraction of methods inside structs and classes';
  }

  protected async setup(): Promise<void> {
    this.parser = new OptimizedCppParser({
      maxFileSize: 1024 * 1024,
      timeout: 30000,
      enableDebug: true
    });
  }

  protected async runTest(): Promise<void> {
    // Test parsing struct with methods
    const testFile = path.join(process.cwd(), 'test/fixtures/struct-with-methods.cpp');
    const content = await fs.readFile(testFile, 'utf-8');
    
    this.log('Parsing struct-with-methods.cpp...');
    const result = await this.parser.parse(content, testFile);
    
    // Check symbols
    this.log(`\nFound ${result.symbols.length} symbols:`);
    for (const symbol of result.symbols) {
      this.log(`  ${symbol.kind}: ${symbol.qualifiedName}${symbol.signature ? ` - ${symbol.signature}` : ''}`);
    }
    
    // Verify struct extraction
    const resourceDesc = result.symbols.find(s => s.name === 'ResourceDesc' && s.kind === 'struct');
    this.assert(resourceDesc !== undefined, 'Should find ResourceDesc struct');
    
    // Verify field extraction
    const widthField = result.symbols.find(s => s.name === 'width' && s.kind === 'variable');
    const heightField = result.symbols.find(s => s.name === 'height' && s.kind === 'variable');
    this.assert(widthField !== undefined, 'Should find width field');
    this.assert(heightField !== undefined, 'Should find height field');
    
    // Verify method extraction
    const toGenericMethod = result.symbols.find(s => s.name === 'ToGeneric' && s.kind === 'method');
    this.assert(toGenericMethod !== undefined, 'Should find ToGeneric method');
    this.assert(toGenericMethod?.qualifiedName?.includes('ResourceDesc'), 
                `ToGeneric should be qualified with ResourceDesc, got: ${toGenericMethod?.qualifiedName}`);
    
    const getAreaMethod = result.symbols.find(s => s.name === 'GetArea' && s.kind === 'method');
    this.assert(getAreaMethod !== undefined, 'Should find GetArea method');
    this.assert(getAreaMethod?.signature?.includes('const'), 
                `GetArea should have const in signature, got: ${getAreaMethod?.signature}`);
    
    const createDefaultMethod = result.symbols.find(s => s.name === 'CreateDefault' && s.kind === 'method');
    this.assert(createDefaultMethod !== undefined, 'Should find CreateDefault method');
    
    // Verify class method extraction
    const processMethod = result.symbols.find(s => s.name === 'Process' && s.kind === 'method');
    this.assert(processMethod !== undefined, 'Should find Process method');
    this.assert(processMethod?.qualifiedName?.includes('ImageProcessor'), 
                `Process should be qualified with ImageProcessor, got: ${processMethod?.qualifiedName}`);
    
    // Summary
    const methods = result.symbols.filter(s => s.kind === 'method');
    const structs = result.symbols.filter(s => s.kind === 'struct');
    const classes = result.symbols.filter(s => s.kind === 'class');
    const fields = result.symbols.filter(s => s.kind === 'variable');
    
    this.log(`\nSummary:`);
    this.log(`  Structs: ${structs.length}`);
    this.log(`  Classes: ${classes.length}`);
    this.log(`  Methods: ${methods.length}`);
    this.log(`  Fields: ${fields.length}`);
    
    this.assert(methods.length === 4, `Expected 4 methods, found ${methods.length}`);
  }

  protected async cleanup(): Promise<void> {
    // No cleanup needed
  }
}