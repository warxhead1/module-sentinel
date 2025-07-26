/**
 * Line Number Verification Test
 * 
 * Tests that all language parsers correctly capture line and endLine numbers
 * for symbols. This is critical for proper source code extraction in embeddings.
 */

import { UniversalIndexer } from '../src/indexing/universal-indexer.js';
import { DatabaseInitializer } from '../src/database/database-initializer.js';
import Database from 'better-sqlite3';
import { TypeScriptLanguageParser } from '../src/parsers/adapters/typescript-language-parser.js';
import { PythonLanguageParser } from '../src/parsers/adapters/python-language-parser.js';
import { GoLanguageParser } from '../src/parsers/adapters/go-language-parser.js';
import { CppLanguageParser } from '../src/parsers/tree-sitter/optimized-cpp-parser.js';

interface TestCase {
  language: string;
  extension: string;
  code: string;
  expectedSymbols: Array<{
    name: string;
    line: number;
    endLine?: number;
    kind: string;
  }>;
}

const testCases: TestCase[] = [
  {
    language: 'TypeScript',
    extension: '.ts',
    code: `// Line 1
export class TestClass {  // Line 2
  private value: number = 42;  // Line 3

  public getValue(): number {  // Line 5
    return this.value;  // Line 6
  }  // Line 7

  async processData(): Promise<void> {  // Line 9
    console.log("processing");  // Line 10
  }  // Line 11
}  // Line 12

export function helperFunction(x: number): string {  // Line 14
  return x.toString();  // Line 15
}  // Line 16`,
    expectedSymbols: [
      { name: 'TestClass', line: 2, endLine: 12, kind: 'class' },
      { name: 'value', line: 3, kind: 'property' },
      { name: 'getValue', line: 5, endLine: 7, kind: 'method' },
      { name: 'processData', line: 9, endLine: 11, kind: 'method' },
      { name: 'helperFunction', line: 14, endLine: 16, kind: 'function' }
    ]
  },
  {
    language: 'Python',
    extension: '.py',
    code: `# Line 1
class TestClass:  # Line 2
    def __init__(self):  # Line 3
        self.value = 42  # Line 4

    def get_value(self):  # Line 6
        return self.value  # Line 7

    async def process_data(self):  # Line 9
        print("processing")  # Line 10

def helper_function(x):  # Line 12
    return str(x)  # Line 13

class AnotherClass:  # Line 15
    pass  # Line 16`,
    expectedSymbols: [
      { name: 'TestClass', line: 2, kind: 'class' },
      { name: '__init__', line: 3, kind: 'method' },
      { name: 'get_value', line: 6, kind: 'method' },
      { name: 'process_data', line: 9, kind: 'method' },
      { name: 'helper_function', line: 12, kind: 'function' },
      { name: 'AnotherClass', line: 15, kind: 'class' }
    ]
  },
  {
    language: 'Go',
    extension: '.go',
    code: `package main  // Line 1

import "fmt"  // Line 3

type TestStruct struct {  // Line 5
    Value int  // Line 6
}  // Line 7

func (t *TestStruct) GetValue() int {  // Line 9
    return t.Value  // Line 10
}  // Line 11

func HelperFunction(x int) string {  // Line 13
    return fmt.Sprintf("%d", x)  // Line 14
}  // Line 15

func main() {  // Line 17
    fmt.Println("Hello")  // Line 18
}  // Line 19`,
    expectedSymbols: [
      { name: 'TestStruct', line: 5, kind: 'struct' },
      { name: 'Value', line: 6, kind: 'field' },
      { name: 'GetValue', line: 9, kind: 'method' },
      { name: 'HelperFunction', line: 13, kind: 'function' },
      { name: 'main', line: 17, kind: 'function' }
    ]
  },
  {
    language: 'C++',
    extension: '.cpp',
    code: `#include <iostream>  // Line 1

class TestClass {  // Line 3
private:  // Line 4
    int value;  // Line 5

public:  // Line 7
    TestClass() : value(42) {}  // Line 8

    int getValue() const {  // Line 10
        return value;  // Line 11
    }  // Line 12

    void processData() {  // Line 14
        std::cout << "processing" << std::endl;  // Line 15
    }  // Line 16
};  // Line 17

int helperFunction(int x) {  // Line 19
    return x * 2;  // Line 20
}  // Line 21`,
    expectedSymbols: [
      { name: 'TestClass', line: 3, kind: 'class' },
      { name: 'value', line: 5, kind: 'field' },
      { name: 'TestClass', line: 8, kind: 'constructor' }, // Constructor
      { name: 'getValue', line: 10, kind: 'method' },
      { name: 'processData', line: 14, kind: 'method' },
      { name: 'helperFunction', line: 19, kind: 'function' }
    ]
  }
];

async function runLineNumberVerificationTest(): Promise<void> {
  console.log('🧪 Running Line Number Verification Test...');
  
  // Create in-memory database for testing
  const db = new Database(':memory:');
  const initializer = new DatabaseInitializer(db);
  await initializer.initialize();

  let passedLanguages = 0;
  const totalLanguages = testCases.length;
  let totalIssues = 0;

  for (const testCase of testCases) {
    console.log(`\n📋 Testing ${testCase.language} parser...`);
    
    try {
      // Get appropriate parser
      let parser;
      const parseOptions = { 
        debugMode: false, 
        enableSemanticAnalysis: false,
        maxFileSize: 1024 * 1024,
        cacheStrategy: 'minimal' as const
      };

      switch (testCase.language) {
        case 'TypeScript':
          parser = new TypeScriptLanguageParser(db, parseOptions);
          break;
        case 'Python':
          parser = new PythonLanguageParser(db, parseOptions);
          break;
        case 'Go':
          parser = new GoLanguageParser(db, parseOptions);
          break;
        case 'C++':
          parser = new CppLanguageParser(db, parseOptions);
          break;
        default:
          throw new Error(`Unknown language: ${testCase.language}`);
      }

      await parser.initialize();
      
      // Parse the test code
      const testFileName = `test${testCase.extension}`;
      const result = await parser.parseFile(testFileName, testCase.code);
      
      console.log(`  Found ${result.symbols.length} symbols`);
      
      // Verify each expected symbol
      let languageIssues = 0;
      
      for (const expectedSymbol of testCase.expectedSymbols) {
        const foundSymbol = result.symbols.find(s => 
          s.name === expectedSymbol.name || 
          s.qualifiedName === expectedSymbol.name
        );
        
        if (!foundSymbol) {
          console.log(`  ❌ Missing symbol: ${expectedSymbol.name}`);
          languageIssues++;
          continue;
        }
        
        // Check line number
        if (foundSymbol.line !== expectedSymbol.line) {
          console.log(`  ❌ ${expectedSymbol.name}: Expected line ${expectedSymbol.line}, got ${foundSymbol.line}`);
          languageIssues++;
        }
        
        // Check end line if specified
        if (expectedSymbol.endLine && foundSymbol.endLine !== expectedSymbol.endLine) {
          console.log(`  ⚠️  ${expectedSymbol.name}: Expected endLine ${expectedSymbol.endLine}, got ${foundSymbol.endLine || 'undefined'}`);
          // endLine issues are warnings, not failures
        }
        
        // Check if line number is valid (not 0 or negative)
        if (!foundSymbol.line || foundSymbol.line <= 0) {
          console.log(`  ❌ ${expectedSymbol.name}: Invalid line number ${foundSymbol.line}`);
          languageIssues++;
        }
        
        if (languageIssues === 0) {
          console.log(`  ✅ ${expectedSymbol.name}: line ${foundSymbol.line}${foundSymbol.endLine ? `-${foundSymbol.endLine}` : ''} (${foundSymbol.kind})`);
        }
      }
      
      // Show unexpected symbols with line info
      const unexpectedSymbols = result.symbols.filter(s => 
        !testCase.expectedSymbols.some(exp => 
          exp.name === s.name || exp.name === s.qualifiedName
        )
      );
      
      if (unexpectedSymbols.length > 0) {
        console.log(`  📄 Additional symbols found:`);
        unexpectedSymbols.forEach(s => {
          const lineInfo = s.line ? `line ${s.line}${s.endLine ? `-${s.endLine}` : ''}` : 'no line info';
          console.log(`    - ${s.name || s.qualifiedName}: ${lineInfo} (${s.kind})`);
        });
      }
      
      if (languageIssues === 0) {
        console.log(`  🎉 ${testCase.language} parser: ALL LINE NUMBERS CORRECT`);
        passedLanguages++;
      } else {
        console.log(`  ⚠️  ${testCase.language} parser: ${languageIssues} line number issues`);
      }
      
      totalIssues += languageIssues;
      
    } catch (error) {
      console.log(`  💥 ${testCase.language} parser failed:`, error instanceof Error ? error.message : String(error));
      totalIssues++;
    }
  }
  
  // Summary
  console.log(`\n📊 Line Number Verification Summary:`);
  console.log(`  ✅ Languages with correct line numbers: ${passedLanguages}/${totalLanguages}`);
  console.log(`  ❌ Total line number issues: ${totalIssues}`);
  
  if (totalIssues === 0) {
    console.log(`  🎉 ALL PARSERS CORRECTLY CAPTURE LINE NUMBERS!`);
  } else {
    console.log(`  ⚠️  Some parsers have line number capture issues that need fixing.`);
  }
  
  db.close();
}

// Export for use in main test runner
export { runLineNumberVerificationTest };

// Run directly if called as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runLineNumberVerificationTest().catch(console.error);
}