import { HybridCppParser } from '../src/parsers/hybrid-cpp-parser';
import { EnhancedModuleInfo } from '../src/types/essential-features';
import * as fs from 'fs';
import * as path from 'path';

// Simple deep diff function for comparison
function deepDiff(obj1: any, obj2: any, path: string[] = []): string[] {
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

  for (const key of keys) {
    const newPath = [...path, key];
    const val1 = obj1[key];
    const val2 = obj2[key];

    if (typeof val1 !== typeof val2) {
      diffs.push(`${newPath.join('.')}: Type mismatch (${typeof val1} vs ${typeof val2})`);
      continue;
    }

    if (typeof val1 === 'object' && val1 !== null && val2 !== null) {
      diffs.push(...deepDiff(val1, val2, newPath));
    } else if (val1 !== val2) {
      diffs.push(`${newPath.join('.')}: Value mismatch ('${val1}' vs '${val2}')`);
    }
  }
  return diffs;
}

async function compareParsers(filePath: string, projectPath: string) {
  console.log(`🔬 Analyzing file: ${filePath}`);
  console.log(`==================================================`);

  const parser = new HybridCppParser();
  await parser.initialize(projectPath);

  let clangResult: EnhancedModuleInfo | null = null;
  let treeSitterResult: EnhancedModuleInfo | null = null;
  let streamingResult: EnhancedModuleInfo | null = null;

  // --- Run Parsers ---
  try {
    clangResult = await parser.parseWithParser(filePath, 'clang');
    console.log('Clang AST Parser: Success');
  } catch (e: any) {
    console.log(` Clang AST Parser: Failed (${e.message})`);
  }

  try {
    treeSitterResult = await parser.parseWithParser(filePath, 'tree-sitter');
    console.log('Enhanced Tree-sitter Parser: Success');
  } catch (e: any) {
    console.log(` Enhanced Tree-sitter Parser: Failed (${e.message})`);
  }

  try {
    streamingResult = await parser.parseWithParser(filePath, 'streaming');
    console.log('Streaming Parser: Success');
  } catch (e: any) {
    console.log(` Streaming Parser: Failed (${e.message})`);
  }

  console.log(`
📊 Comparison Report`);
  console.log(`--------------------------------------------------`);

  // --- Generate Report ---
  const report = {
    Clang: clangResult ? { classes: clangResult.classes.length, methods: clangResult.methods.length, imports: clangResult.imports.length, patterns: clangResult.patterns.length } : 'Failed',
    TreeSitter: treeSitterResult ? { classes: treeSitterResult.classes.length, methods: treeSitterResult.methods.length, imports: treeSitterResult.imports.length, patterns: treeSitterResult.patterns.length } : 'Failed',
    Streaming: streamingResult ? { classes: streamingResult.classes.length, methods: streamingResult.methods.length, imports: streamingResult.imports.length, patterns: streamingResult.patterns.length } : 'Failed',
  };

  console.table(report);

  // --- Detailed Diff --- 
  if (clangResult && treeSitterResult) {
    console.log('\n🔍 Detailed Diff (Clang vs. Tree-sitter):');
    const differences = deepDiff(clangResult, treeSitterResult);
    if (differences.length === 0) {
      console.log('✔️ No differences found.');
    } else {
      differences.forEach(d => console.log(`  - ${d}`));
    }
  }

  console.log(`\n==================================================`);
}

// --- Entry Point ---
const projectRoot = path.resolve(process.cwd(), '..'); // Assuming test is run from module-sentinel
const fileToAnalyze = process.argv[2];

if (!fileToAnalyze) {
  console.error('Error: Please provide the absolute path to a C++ file to analyze.');
  console.error('Usage: ts-node test/compare-parsers.ts /path/to/your/file.cpp');
  process.exit(1);
}

if (!fs.existsSync(fileToAnalyze)) {
  console.error(`Error: File not found at ${fileToAnalyze}`);
  process.exit(1);
}

compareParsers(fileToAnalyze, projectRoot).catch(console.error);
