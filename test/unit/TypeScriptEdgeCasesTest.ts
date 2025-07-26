import { BaseTest } from '../helpers/BaseTest.js';
import { TypeScriptLanguageParser } from '../../dist/parsers/adapters/typescript-language-parser.js';
import { UniversalSymbolKind } from '../../dist/parsers/language-parser-interface.js';
import { TestResult } from '../helpers/JUnitReporter.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

export class TypeScriptEdgeCasesTest extends BaseTest {
  constructor(db: Database.Database) {
    super('TypeScriptEdgeCasesTest', db);
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    // Read the edge cases file
    const edgeCasesPath = join(process.cwd(), 'test', 'typescript-edge-cases.ts');
    const edgeCasesCode = readFileSync(edgeCasesPath, 'utf-8');

    // Test individual edge cases
    results.push(await this.runTest('Arrow Functions in Object Literals', 
      () => this.testArrowFunctionsInObjectLiterals()));
    
    results.push(await this.runTest('Template Literal Types', 
      () => this.testTemplateLiteralTypes()));
    
    results.push(await this.runTest('Dynamic Imports', 
      () => this.testDynamicImports()));
    
    results.push(await this.runTest('Complex Destructuring', 
      () => this.testComplexDestructuring()));
    
    results.push(await this.runTest('Full Edge Cases File', 
      () => this.testFullEdgeCasesFile(edgeCasesCode)));
    
    return results;
  }

  private async testArrowFunctionsInObjectLiterals(): Promise<void> {
    this.log('Testing arrow functions in object literals...');

    const code = `
const objectWithArrows = {
  simpleArrow: () => 42,
  asyncArrow: async () => await fetch('/api'),
  genericArrow: <T>(x: T): T => x,
  nestedObject: {
    deepArrow: (x: number) => x * 2,
    veryDeep: {
      tripleNested: () => 'deep'
    }
  },
  returnsObject: () => ({ x: 1, y: 2 }),
  destructuredArrow: ({ x, y }: { x: number; y: number }) => x + y,
  arrowArray: [
    () => 1,
    () => 2,
    (x: number) => x
  ]
};
    `;

    const parser = new TypeScriptLanguageParser(this.db, {
      debugMode: false,
      enableSemanticAnalysis: false
    });
    
    await parser.initialize();
    const result = await parser.parseFile('test-arrows.ts', code);

    // Check for the object itself
    const objectSymbol = result.symbols.find(s => s.name === 'objectWithArrows');
    this.assert(objectSymbol !== undefined, 'Should find objectWithArrows constant');

    // Check for arrow functions - these are often missed
    const arrowFunctions = result.symbols.filter(s => 
      s.name.includes('Arrow') || 
      s.name === 'tripleNested' || 
      s.name === 'returnsObject' ||
      s.name === 'destructuredArrow'
    );

    this.log(`Found ${arrowFunctions.length} arrow functions`);
    arrowFunctions.forEach(f => {
      this.log(`  - ${f.name} at line ${f.line}`);
    });

    // These might be missed by current parser
    this.assertAtLeast(arrowFunctions.length, 3, 
      'Should find at least some arrow functions in object literal');

    // Check parse method
    const parseMethod = (result as any).parseMethod;
    if (parseMethod === 'pattern-fallback') {
      this.warn('Parser fell back to pattern-based extraction for arrow functions');
    }
  }

  private async testTemplateLiteralTypes(): Promise<void> {
    this.log('Testing template literal types...');

    const code = `
type Color = 'red' | 'blue' | 'green';
type Size = 'small' | 'medium' | 'large';
type TemplateLiteralType = \`\${Color}-\${Size}\`;
type ComplexTemplate = \`prefix-\${string}-\${number}-suffix\`;
type URLPattern = \`/api/\${string}/v\${number}\`;

const templateFunc = <T extends string>(prefix: T) => {
  return \`result-\${prefix}\` as const;
};
    `;

    const parser = new TypeScriptLanguageParser(this.db, {
      debugMode: false,
      enableSemanticAnalysis: false
    });
    
    await parser.initialize();
    const result = await parser.parseFile('test-templates.ts', code);

    // Check for type aliases
    const typeAliases = result.symbols.filter(s => s.kind === UniversalSymbolKind.TypeAlias);
    this.log(`Found ${typeAliases.length} type aliases`);
    typeAliases.forEach(t => {
      this.log(`  - ${t.name} at line ${t.line}`);
    });

    this.assertAtLeast(typeAliases.length, 5, 'Should find all template literal type aliases');

    // Check for the template function
    const templateFuncSymbol = result.symbols.find(s => s.name === 'templateFunc');
    this.assert(templateFuncSymbol !== undefined, 'Should find templateFunc');
  }

  private async testDynamicImports(): Promise<void> {
    this.log('Testing dynamic imports...');

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

    const parser = new TypeScriptLanguageParser(this.db, {
      debugMode: false,
      enableSemanticAnalysis: false
    });
    
    await parser.initialize();
    const result = await parser.parseFile('test-imports.ts', code);

    // Check for functions
    const functions = result.symbols.filter(s => s.kind === UniversalSymbolKind.Function);
    this.assertEqual(functions.length, 3, 'Should find all three functions');

    // Check for import relationships
    const importRelationships = result.relationships.filter(r => 
      r.toName.includes('module') && 
      (r.relationshipType === 'imports' || r.relationshipType === 'uses')
    );
    
    this.log(`Found ${importRelationships.length} dynamic import relationships`);
    importRelationships.forEach(r => {
      this.log(`  - ${r.fromName} imports ${r.toName}`);
    });

    this.assertAtLeast(importRelationships.length, 2, 
      'Should detect at least some dynamic imports');
  }

  private async testComplexDestructuring(): Promise<void> {
    this.log('Testing complex destructuring...');

    const code = `
const { 
  prop1,
  prop2: renamedProp,
  nested: { 
    deep,
    deeper: { deepest }
  },
  ...rest
} = someObject;

const [first, second, ...remaining] = someArray;

function complexParams({
  x,
  y: { z, w: [a, b, ...c] },
  ...others
}: ComplexType) {
  return { x, z, a, b, c, others };
}
    `;

    const parser = new TypeScriptLanguageParser(this.db, {
      debugMode: false,
      enableSemanticAnalysis: false
    });
    
    await parser.initialize();
    const result = await parser.parseFile('test-destructuring.ts', code);

    // Check for variables from destructuring
    const variables = result.symbols.filter(s => s.kind === UniversalSymbolKind.Variable);
    this.log(`Found ${variables.length} variables from destructuring`);
    variables.forEach(v => {
      this.log(`  - ${v.name} at line ${v.line}`);
    });

    // Check for the function
    const complexParamsFunc = result.symbols.find(s => s.name === 'complexParams');
    this.assert(complexParamsFunc !== undefined, 'Should find complexParams function');

    // The parser might miss deeply nested destructured variables
    const expectedVars = ['prop1', 'renamedProp', 'deep', 'deepest', 'rest', 'first', 'second', 'remaining'];
    const foundVarNames = variables.map(v => v.name);
    
    let foundCount = 0;
    expectedVars.forEach(expected => {
      if (foundVarNames.includes(expected)) {
        foundCount++;
      } else {
        this.warn(`Missing destructured variable: ${expected}`);
      }
    });

    this.assertAtLeast(foundCount, 4, 
      'Should find at least half of the destructured variables');
  }

  private async testFullEdgeCasesFile(code: string): Promise<void> {
    this.log('Testing full edge cases file...');

    const parser = new TypeScriptLanguageParser(this.db, {
      debugMode: false,
      enableSemanticAnalysis: false,
      cacheStrategy: 'minimal'
    });
    
    await parser.initialize();
    const result = await parser.parseFile('typescript-edge-cases.ts', code);

    this.log('Overall Results:');
    this.log(`- Parse Method: ${(result as any).parseMethod || 'tree-sitter'}`);
    this.log(`- Total Symbols: ${result.symbols.length}`);
    this.log(`- Total Relationships: ${result.relationships.length}`);

    // Group symbols by kind
    const symbolsByKind = new Map<string, number>();
    result.symbols.forEach(s => {
      const count = symbolsByKind.get(s.kind) || 0;
      symbolsByKind.set(s.kind, count + 1);
    });

    this.log('Symbols by Kind:');
    Array.from(symbolsByKind.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([kind, count]) => {
        this.log(`  - ${kind}: ${count}`);
      });

    // Check for specific expected symbols
    const expectedSymbols = [
      'objectWithArrows',
      'TemplateLiteralType',
      'lazyModule',
      'complexParams',
      'DecoratedClass',
      'asyncGenerator',
      'isString',
      'ComplexNamespace',
      'AbstractBase',
      'overloaded'
    ];

    this.log('Checking for expected symbols:');
    const foundSymbols = result.symbols.map(s => s.name);
    let missingCount = 0;
    expectedSymbols.forEach(expected => {
      if (foundSymbols.includes(expected)) {
        this.success(`${expected}`);
      } else {
        this.error(`${expected} (missing)`);
        missingCount++;
      }
    });

    this.assert(missingCount < expectedSymbols.length / 2, 
      'Should find at least half of expected symbols');

    // Check for parse errors
    const parseErrors = (result as any).parseErrors || [];
    if (parseErrors.length > 0) {
      this.warn('Parse Errors:');
      parseErrors.forEach((err: string) => this.warn(`- ${err}`));
    }

    // Check cross-language detection
    const crossLangRelationships = result.relationships.filter(r => r.crossLanguage);
    this.log(`Cross-language relationships: ${crossLangRelationships.length}`);

    // Summary
    const accuracy = ((expectedSymbols.length - missingCount) / expectedSymbols.length) * 100;
    this.log(`Test Accuracy: ${accuracy.toFixed(1)}%`);
    
    this.assert(accuracy >= 50, 'Parser should achieve at least 50% accuracy on edge cases');
  }
}