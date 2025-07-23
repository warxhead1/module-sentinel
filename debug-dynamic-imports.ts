#!/usr/bin/env tsx

/**
 * Debug script to understand why dynamic imports test finds 6 functions instead of 3
 */

import { TypeScriptLanguageParser } from './dist/parsers/adapters/typescript-language-parser.js';
import { DatabaseInitializer } from './dist/database/database-initializer.js';
import Database from 'better-sqlite3';
import { UniversalSymbolKind } from './dist/parsers/language-parser-interface.js';

async function debugDynamicImports() {
  console.log('🔍 Debugging Dynamic Imports Test...\n');

  // Create in-memory database
  const db = new Database(':memory:');
  const initializer = DatabaseInitializer.getInstance();
  await initializer.resetDatabase(':memory:');

  // Create parser
  const parser = new TypeScriptLanguageParser(db, {
    debugMode: true, // Enable debug mode
    enableSemanticAnalysis: false
  });

  const code = `
const lazyModule = () => import('./module');
const conditionalImport = async (condition: boolean) => {
  if (condition) {
    const { someExport } = await import('./conditional-module');
    return someExport;
  }
  return import('./default-module');
};
const dynamicPath = (moduleName: string) => import(\`./modules/\${moduleName}\`);
  `;

  try {
    await parser.initialize();
    console.time('Parse Time');
    const result = await parser.parseFile('test-imports.ts', code);
    console.timeEnd('Parse Time');

    console.log('\n📊 Parse Results:');
    console.log(`- Total Symbols: ${result.symbols.length}`);
    console.log(`- Total Relationships: ${result.relationships.length}`);

    // Analyze ALL symbols by kind
    const symbolsByKind = new Map<string, any[]>();
    result.symbols.forEach(s => {
      if (!symbolsByKind.has(s.kind)) {
        symbolsByKind.set(s.kind, []);
      }
      symbolsByKind.get(s.kind)!.push(s);
    });

    console.log('\n📈 All Symbols by Kind:');
    Array.from(symbolsByKind.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([kind, symbols]) => {
        console.log(`\n  ${kind}: ${symbols.length} found`);
        symbols.forEach((s, i) => {
          console.log(`    ${i + 1}. "${s.name}" at line ${s.line}:${s.column}`);
          console.log(`       qualifiedName: "${s.qualifiedName}"`);
          console.log(`       signature: "${s.signature || 'none'}"`);
          if (s.languageFeatures) {
            console.log(`       features: ${JSON.stringify(s.languageFeatures, null, 8)}`);
          }
        });
      });

    // Focus on functions specifically
    const functions = result.symbols.filter(s => s.kind === UniversalSymbolKind.Function);
    console.log(`\n🎯 FUNCTIONS ANALYSIS (Expected: 3, Found: ${functions.length})`);
    
    functions.forEach((f, i) => {
      console.log(`\n  Function ${i + 1}: "${f.name}"`);
      console.log(`    - Line: ${f.line}:${f.column}`);
      console.log(`    - Qualified: "${f.qualifiedName}"`);
      console.log(`    - Signature: "${f.signature || 'none'}"`);
      console.log(`    - isArrowFunction: ${f.languageFeatures?.isArrowFunction || false}`);
      console.log(`    - isObjectProperty: ${f.languageFeatures?.isObjectProperty || false}`);
      console.log(`    - isAsync: ${f.isAsync}`);
    });

    // Check for import relationships
    const importRelationships = result.relationships.filter(r => 
      r.relationshipType === 'imports' || r.toName.includes('module')
    );
    
    console.log(`\n🔗 Import Relationships (${importRelationships.length} found):`);
    importRelationships.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.fromName} --[${r.relationshipType}]--> ${r.toName}`);
      console.log(`     metadata: ${JSON.stringify(r.metadata, null, 8)}`);
    });

    // SAFEGUARD: Detect potential issues
    console.log('\n🛡️ SAFEGUARD ANALYSIS:');
    
    // Issue 1: Duplicate symbols
    const nameCount = new Map<string, number>();
    functions.forEach(f => {
      const count = nameCount.get(f.name) || 0;
      nameCount.set(f.name, count + 1);
    });
    
    const duplicates = Array.from(nameCount.entries()).filter(([name, count]) => count > 1);
    if (duplicates.length > 0) {
      console.log(`  ⚠️ DUPLICATE FUNCTIONS DETECTED:`);
      duplicates.forEach(([name, count]) => {
        console.log(`    - "${name}" appears ${count} times`);
      });
    }
    
    // Issue 2: Functions with same qualified name
    const qualifiedNameCount = new Map<string, number>();
    functions.forEach(f => {
      const count = qualifiedNameCount.get(f.qualifiedName) || 0;
      qualifiedNameCount.set(f.qualifiedName, count + 1);
    });
    
    const qualifiedDuplicates = Array.from(qualifiedNameCount.entries()).filter(([name, count]) => count > 1);
    if (qualifiedDuplicates.length > 0) {
      console.log(`  ⚠️ DUPLICATE QUALIFIED NAMES DETECTED:`);
      qualifiedDuplicates.forEach(([name, count]) => {
        console.log(`    - "${name}" appears ${count} times`);
      });
    }
    
    // Issue 3: Functions detected multiple times due to different handlers
    console.log(`  ℹ️ Expected Functions:`);
    console.log(`    1. lazyModule (arrow function)`);
    console.log(`    2. conditionalImport (async function)`);
    console.log(`    3. dynamicPath (arrow function)`);
    
    const expectedNames = ['lazyModule', 'conditionalImport', 'dynamicPath'];
    expectedNames.forEach(name => {
      const matches = functions.filter(f => f.name === name);
      if (matches.length === 0) {
        console.log(`    ❌ Missing: ${name}`);
      } else if (matches.length === 1) {
        console.log(`    ✅ Found: ${name}`);
      } else {
        console.log(`    ⚠️ Duplicate: ${name} (${matches.length} times)`);
      }
    });

  } catch (error) {
    console.error('❌ Parser error:', error);
  } finally {
    db.close();
  }
}

debugDynamicImports().catch(console.error);