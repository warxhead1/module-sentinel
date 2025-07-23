#!/usr/bin/env tsx

/**
 * Direct parser test runner for TypeScript edge cases
 */

import { TypeScriptLanguageParser } from './dist/parsers/adapters/typescript-language-parser.js';
import { DatabaseInitializer } from './dist/database/database-initializer.js';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

async function runTest() {
  console.log('🔍 Testing TypeScript parser on edge cases...\n');

  // Create in-memory database
  const db = new Database(':memory:');
  const initializer = DatabaseInitializer.getInstance();
  await initializer.resetDatabase(':memory:');

  // Create parser
  const parser = new TypeScriptLanguageParser(db, {
    debugMode: false,
    enableSemanticAnalysis: false,
    cacheStrategy: 'minimal'
  });

  // Read edge cases file
  const code = readFileSync('test/typescript-edge-cases.ts', 'utf-8');

  try {
    await parser.initialize();
    
    console.time('Parse Time');
    const result = await parser.parseFile('typescript-edge-cases.ts', code);
    console.timeEnd('Parse Time');

    console.log('\n📊 Parse Results:');
    console.log(`- Parse Method: ${(result as any).parseMethod || 'tree-sitter'}`);
    console.log(`- Total Symbols: ${result.symbols.length}`);
    console.log(`- Total Relationships: ${result.relationships.length}`);
    
    // Check for parse errors
    const parseErrors = (result as any).parseErrors || [];
    if (parseErrors.length > 0) {
      console.log(`\n⚠️ Parse Errors: ${parseErrors.length}`);
      parseErrors.forEach((err: string) => console.log(`  - ${err}`));
    }

    // Group symbols by kind
    const symbolsByKind = new Map<string, number>();
    result.symbols.forEach(s => {
      const count = symbolsByKind.get(s.kind) || 0;
      symbolsByKind.set(s.kind, count + 1);
    });

    console.log('\n📈 Symbols by Kind:');
    Array.from(symbolsByKind.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([kind, count]) => {
        console.log(`  - ${kind}: ${count}`);
      });

    // Check for specific symbols we expect to find
    console.log('\n🔍 Checking specific edge cases:');
    
    // Arrow functions in object literals
    const arrowFunctions = result.symbols.filter(s => 
      s.name.includes('Arrow') || s.name.includes('arrow')
    );
    console.log(`\n1. Arrow functions in object literals: ${arrowFunctions.length} found`);
    arrowFunctions.forEach(f => console.log(`   - ${f.name} at line ${f.line}`));

    // Template literal types
    const templateTypes = result.symbols.filter(s => 
      s.name.includes('Template') || s.name.includes('Pattern')
    );
    console.log(`\n2. Template literal types: ${templateTypes.length} found`);
    templateTypes.forEach(t => console.log(`   - ${t.name} at line ${t.line}`));

    // Dynamic imports
    const dynamicImports = result.relationships.filter(r => 
      r.toName.includes('module') || r.fromName.includes('lazy') || r.fromName.includes('dynamic')
    );
    console.log(`\n3. Dynamic imports: ${dynamicImports.length} found`);
    dynamicImports.forEach(i => console.log(`   - ${i.fromName} imports ${i.toName}`));

    // Complex symbols
    const complexSymbols = ['objectWithArrows', 'ComplexNamespace', 'DecoratedClass', 'asyncGenerator'];
    console.log('\n4. Complex symbols:');
    complexSymbols.forEach(name => {
      const found = result.symbols.find(s => s.name === name);
      console.log(`   - ${name}: ${found ? '✅ Found' : '❌ Not found'}`);
    });

    // Cross-language relationships
    const crossLang = result.relationships.filter(r => r.crossLanguage);
    console.log(`\n5. Cross-language relationships: ${crossLang.length} found`);

  } catch (error) {
    console.error('❌ Parser error:', error);
  } finally {
    db.close();
  }
}

runTest().catch(console.error);