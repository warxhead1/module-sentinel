/**
 * Example: How to Test Parsers on Individual Files
 * 
 * This script demonstrates testing parsers without full indexing
 */

import Database from 'better-sqlite3';
import { TypeScriptLanguageParser } from './src/parsers/adapters/typescript-language-parser.js';
import { PythonLanguageParser } from './src/parsers/adapters/python-language-parser.js';
import { ParseOptions } from './src/parsers/tree-sitter/parser-types.js';

async function testTypeScriptParser() {
  console.log('\n🔍 Testing TypeScript Parser\n');
  
  // Create minimal in-memory database
  const db = new Database(':memory:');
  
  // Initialize minimal schema
  db.exec(`
    CREATE TABLE languages (
      id INTEGER PRIMARY KEY,
      name TEXT,
      display_name TEXT
    );
    INSERT INTO languages VALUES (1, 'typescript', 'TypeScript');
  `);
  
  // Create parser with debug mode
  const options: ParseOptions = {
    debugMode: true,
    projectId: 1,
    enableSemanticAnalysis: false // Disable for faster testing
  };
  
  const parser = new TypeScriptLanguageParser(db, options);
  await parser.initialize();
  
  // Test Case 1: Arrow Functions
  console.log('📋 Test Case 1: Arrow Functions');
  const arrowFuncCode = `
export const processData = async (data: string[]): Promise<void> => {
  console.log('Processing...');
};

const filterItems = <T>(items: T[]) => items.filter(x => Boolean(x));

export const Component: React.FC = ({ children }) => <div>{children}</div>;
`;
  
  const result1 = await parser.parseFile('test1.ts', arrowFuncCode);
  console.log(`   Symbols found: ${result1.symbols.length}`);
  result1.symbols.forEach(s => {
    console.log(`   - ${s.kind} ${s.name} ${s.isAsync ? '(async)' : ''}`);
  });
  
  // Test Case 2: Complex Types
  console.log('\n📋 Test Case 2: Complex Types');
  const complexTypeCode = `
interface User<T extends BaseUser> {
  id: string;
  data: T;
  process(): Promise<T>;
}

type ConditionalType<T> = T extends string ? boolean : number;

class DataProcessor<T, U> implements Processor<T> {
  async process(input: T): Promise<U> {
    return this.transform(input);
  }
}
`;
  
  const result2 = await parser.parseFile('test2.ts', complexTypeCode);
  console.log(`   Symbols found: ${result2.symbols.length}`);
  result2.symbols.forEach(s => {
    console.log(`   - ${s.kind} ${s.name}`);
  });
  
  // Test Case 3: Cross-Language Calls
  console.log('\n📋 Test Case 3: Cross-Language Detection');
  const crossLangCode = `
import { spawn } from 'child_process';

export function runPythonAnalysis(dataFile: string) {
  const pythonScript = spawn('python3', ['analyze_data.py', dataFile]);
  
  pythonScript.stdout.on('data', (data) => {
    console.log(\`Python output: \${data}\`);
  });
}

export async function executeMLModel() {
  return await fetch('/api/python/ml-predict', {
    method: 'POST',
    body: JSON.stringify({ model: 'sentiment.py' })
  });
}
`;
  
  const result3 = await parser.parseFile('test3.ts', crossLangCode);
  console.log(`   Relationships found: ${result3.relationships.length}`);
  const crossLangRels = result3.relationships.filter(r => r.crossLanguage);
  console.log(`   Cross-language relationships: ${crossLangRels.length}`);
  crossLangRels.forEach(r => {
    console.log(`   - ${r.fromName} -> ${r.toName} (${r.relationshipType})`);
  });
  
  // Check for pitfalls
  console.log('\n⚠️  Potential Issues Detected:');
  
  // Check for missing arrow functions
  const arrowMatches = arrowFuncCode.match(/=>/g)?.length || 0;
  const arrowFuncsFound = result1.symbols.filter(s => 
    s.languageFeatures?.isArrowFunction
  ).length;
  
  if (arrowMatches > arrowFuncsFound) {
    console.log(`   - Arrow function detection: Expected ${arrowMatches}, found ${arrowFuncsFound}`);
  }
  
  // Check for missing signatures
  const funcsWithoutSigs = [...result1.symbols, ...result2.symbols, ...result3.symbols]
    .filter(s => (s.kind === 'function' || s.kind === 'method') && !s.signature);
  
  if (funcsWithoutSigs.length > 0) {
    console.log(`   - Missing signatures: ${funcsWithoutSigs.map(f => f.name).join(', ')}`);
  }
  
  db.close();
}

async function testPythonParser() {
  console.log('\n🔍 Testing Python Parser\n');
  
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE languages (
      id INTEGER PRIMARY KEY,
      name TEXT,
      display_name TEXT
    );
    INSERT INTO languages VALUES (2, 'python', 'Python');
  `);
  
  const parser = new PythonLanguageParser(db, { debugMode: true, projectId: 1 });
  await parser.initialize();
  
  // Test async generators and decorators
  const pythonCode = `
from typing import AsyncGenerator, List
import asyncio

@dataclass
class DataPoint:
    value: float
    timestamp: int

async def fetch_data_stream(urls: List[str]) -> AsyncGenerator[DataPoint, None]:
    """Fetch data from multiple URLs as an async stream."""
    for url in urls:
        data = await fetch_url(url)
        yield DataPoint(value=data['value'], timestamp=data['time'])

class DataProcessor:
    def __init__(self):
        self._cache = {}
    
    @property
    def cache_size(self) -> int:
        return len(self._cache)
    
    @lru_cache(maxsize=128)
    async def process(self, data: DataPoint) -> float:
        return data.value * 2.0
`;
  
  const result = await parser.parseFile('test.py', pythonCode);
  
  console.log(`   Symbols found: ${result.symbols.length}`);
  result.symbols.forEach(s => {
    const features = s.languageFeatures || {};
    const tags = [];
    if (s.isAsync) tags.push('async');
    if (features.isGenerator) tags.push('generator');
    if (features.decorators?.length) tags.push(`decorators: ${features.decorators.join(', ')}`);
    
    console.log(`   - ${s.kind} ${s.name} ${tags.length ? `(${tags.join(', ')})` : ''}`);
  });
  
  db.close();
}

// Run tests
async function main() {
  try {
    await testTypeScriptParser();
    await testPythonParser();
    
    console.log('\n✅ Parser testing complete!');
    console.log('\n💡 Tips for testing your own files:');
    console.log('   1. Use in-memory database for isolated testing');
    console.log('   2. Enable debugMode to see parser decisions');
    console.log('   3. Check both symbols and relationships');
    console.log('   4. Look for missing signatures and metadata');
    console.log('   5. Test edge cases like templates, async, decorators');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}