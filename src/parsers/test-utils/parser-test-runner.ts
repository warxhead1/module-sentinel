/**
 * Parser Test Runner
 *
 * Utility for testing parsers on individual files without full indexing.
 * Helps identify common pitfalls and accuracy issues.
 */

import type { Database } from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { OptimizedTreeSitterBaseParser } from "../tree-sitter/optimized-base-parser.js";
import { TypeScriptLanguageParser } from "../adapters/typescript-language-parser.js";
import { PythonLanguageParser } from "../adapters/python-language-parser.js";
import { CppLanguageParser } from "../adapters/cpp-language-parser.js";
import {
  ParseOptions,
  SymbolInfo,
  RelationshipInfo,
} from "../tree-sitter/parser-types.js";

export interface TestCase {
  name: string;
  content: string;
  language: "typescript" | "python" | "cpp";
  expectedSymbols?: Array<{
    name: string;
    kind: string;
    qualifiedName?: string;
  }>;
  expectedRelationships?: Array<{
    type: string;
    from: string;
    to: string;
  }>;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  symbols: SymbolInfo[];
  relationships: RelationshipInfo[];
  parseTime: number;
  parsingMode: "tree-sitter" | "pattern-based";
  pitfallsDetected: string[];
}

export class ParserTestRunner {
  private db: Database;
  private drizzleDb: ReturnType<typeof drizzle>;

  constructor() {
    // Create in-memory database for testing
    this.db = new BetterSqlite3(":memory:");
    this.drizzleDb = drizzle(this.db);
    this.initializeTestDatabase();
  }

  private initializeTestDatabase(): void {
    // Create minimal schema for parser testing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT
      );
      
      INSERT OR IGNORE INTO languages (id, name, display_name) VALUES 
        (1, 'cpp', 'C++'),
        (2, 'typescript', 'TypeScript'),
        (3, 'python', 'Python');
    `);
  }

  /**
   * Test a single file with a parser
   */
  async testFile(
    filePath: string,
    options?: ParseOptions
  ): Promise<TestResult> {
    const content = fs.readFileSync(filePath, "utf-8");
    const language = this.detectLanguage(filePath);

    return this.testContent(
      content,
      language,
      path.basename(filePath),
      options
    );
  }

  /**
   * Test content directly without file
   */
  async testContent(
    content: string,
    language: "typescript" | "python" | "cpp",
    testName: string = "inline-test",
    options?: ParseOptions
  ): Promise<TestResult> {
    const startTime = Date.now();
    const result: TestResult = {
      testName,
      passed: true,
      errors: [],
      warnings: [],
      symbols: [],
      relationships: [],
      parseTime: 0,
      parsingMode: "tree-sitter",
      pitfallsDetected: [],
    };

    try {
      const parser = await this.createParser(language, options);
      await parser.initialize();

      const parseResult = await parser.parseFile(
        `test.${this.getExtension(language)}`,
        content
      );

      result.symbols = parseResult.symbols;
      result.relationships = parseResult.relationships;
      result.parseTime = Date.now() - startTime;

      // Detect common pitfalls
      this.detectPitfalls(result, content, language);

      // Check if pattern-based fallback was used
      if (parseResult.stats?.patternBasedFallback) {
        result.parsingMode = "pattern-based";
        result.warnings.push("Parser fell back to pattern-based extraction");
      }
    } catch (error) {
      result.passed = false;
      result.errors.push(
        error instanceof Error ? error.message : String(error)
      );
    }

    return result;
  }

  /**
   * Run multiple test cases
   */
  async runTestCases(
    testCases: TestCase[]
  ): Promise<Record<string, TestResult>> {
    const results: Record<string, TestResult> = {};

    for (const testCase of testCases) {
      const result = await this.testContent(
        testCase.content,
        testCase.language,
        testCase.name
      );

      // Validate expectations if provided
      if (testCase.expectedSymbols) {
        this.validateSymbols(result, testCase.expectedSymbols);
      }

      if (testCase.expectedRelationships) {
        this.validateRelationships(result, testCase.expectedRelationships);
      }

      results[testCase.name] = result;
    }

    return results;
  }

  /**
   * Detect common parser pitfalls
   */
  private detectPitfalls(
    result: TestResult,
    content: string,
    language: string
  ): void {
    const lines = content.split("\n");

    // 1. Missing symbols in nested contexts
    if (language === "typescript" || language === "cpp") {
      const nestedClasses = content.match(/class\s+\w+\s*{[^}]*class\s+\w+/gs);
      if (
        nestedClasses &&
        result.symbols.filter((s) => s.kind === "class").length < 2
      ) {
        result.pitfallsDetected.push(
          "NESTED_CLASS_MISSING: Parser may miss nested class definitions"
        );
      }
    }

    // 2. Arrow functions not detected (TypeScript)
    if (language === "typescript") {
      const arrowFunctions = content.match(
        /const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/g
      );
      const detectedArrowFuncs = result.symbols.filter(
        (s) => s.kind === "function" && s.languageFeatures?.isArrowFunction
      );

      if (arrowFunctions && detectedArrowFuncs.length < arrowFunctions.length) {
        result.pitfallsDetected.push(
          "ARROW_FUNCTION_MISSING: Some arrow functions not detected"
        );
      }
    }

    // 3. Template functions not detected (C++)
    if (language === "cpp") {
      const templateFuncs = content.match(
        /template\s*<[^>]+>\s*(?:class|typename|auto|[^{]+)\s+\w+\s*\(/g
      );
      const detectedTemplates = result.symbols.filter(
        (s) => s.signature?.includes("template") || s.name.includes("<")
      );

      if (templateFuncs && detectedTemplates.length === 0) {
        result.pitfallsDetected.push(
          "TEMPLATE_MISSING: Template functions/classes not detected"
        );
      }
    }

    // 4. Cross-language calls not detected
    const spawnPatterns = /\b(spawn|exec|execFile|fork)\s*\(/g;
    const pythonCalls = /\.py['"`]/g;

    if (content.match(spawnPatterns) || content.match(pythonCalls)) {
      const crossLangRels = result.relationships.filter((r) => r.crossLanguage);
      if (crossLangRels.length === 0) {
        result.pitfallsDetected.push(
          "CROSS_LANGUAGE_MISSING: Cross-language calls not detected"
        );
      }
    }

    // 5. Field access relationships missing
    const fieldAccess = content.match(/\b\w+\.\w+\s*=/g);
    const fieldReads = content.match(/=\s*\w+\.\w+/g);
    const fieldRelationships = result.relationships.filter(
      (r) =>
        r.relationshipType === "reads_field" ||
        r.relationshipType === "writes_field"
    );

    if ((fieldAccess || fieldReads) && fieldRelationships.length === 0) {
      result.pitfallsDetected.push(
        "FIELD_ACCESS_MISSING: Field read/write relationships not detected"
      );
    }

    // 6. Missing function signatures
    const functionsWithoutSignatures = result.symbols.filter(
      (s) => (s.kind === "function" || s.kind === "method") && !s.signature
    );

    if (functionsWithoutSignatures.length > 0) {
      result.pitfallsDetected.push(
        `SIGNATURE_MISSING: ${functionsWithoutSignatures.length} functions without signatures`
      );
    }

    // 7. Performance issues with large functions
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s*(def|function|void|int|auto)\s+\w+/)) {
        // Find function end
        let braceCount = 0;
        let functionLines = 0;
        for (let j = i; j < lines.length && j < i + 1000; j++) {
          if (lines[j].includes("{")) braceCount++;
          if (lines[j].includes("}")) braceCount--;
          functionLines++;
          if (braceCount === 0 && functionLines > 1) break;
        }

        if (functionLines > 100) {
          result.warnings.push(
            `Large function detected (${functionLines} lines) - may impact parser performance`
          );
        }
      }
    }

    // 8. Unicode or special characters
    if (content.match(/[^\x00-\x7F]/)) {
      result.warnings.push(
        "File contains non-ASCII characters - may affect parsing accuracy"
      );
    }
  }

  /**
   * Validate expected symbols were found
   */
  private validateSymbols(
    result: TestResult,
    expected: Array<{ name: string; kind: string; qualifiedName?: string }>
  ): void {
    for (const exp of expected) {
      const found = result.symbols.find(
        (s) =>
          s.name === exp.name &&
          s.kind === exp.kind &&
          (!exp.qualifiedName || s.qualifiedName === exp.qualifiedName)
      );

      if (!found) {
        result.errors.push(`Missing expected symbol: ${exp.kind} ${exp.name}`);
        result.passed = false;
      }
    }
  }

  /**
   * Validate expected relationships were found
   */
  private validateRelationships(
    result: TestResult,
    expected: Array<{ type: string; from: string; to: string }>
  ): void {
    for (const exp of expected) {
      const found = result.relationships.find(
        (r) =>
          r.relationshipType === exp.type &&
          r.fromName.includes(exp.from) &&
          r.toName.includes(exp.to)
      );

      if (!found) {
        result.errors.push(
          `Missing expected relationship: ${exp.from} -[${exp.type}]-> ${exp.to}`
        );
        result.passed = false;
      }
    }
  }

  /**
   * Create parser instance
   */
  private async createParser(
    language: string,
    options?: ParseOptions
  ): Promise<OptimizedTreeSitterBaseParser> {
    const defaultOptions: ParseOptions = {
      debugMode: true,
      projectId: 1,
      enableSemanticAnalysis: false, // Disable for faster testing
      ...options,
    };

    switch (language) {
      case "typescript":
        return new TypeScriptLanguageParser(this.db, defaultOptions);
      case "python":
        return new PythonLanguageParser(this.db, defaultOptions);
      case "cpp":
        // Note: C++ parser has different constructor signature
        const cppParser = new CppLanguageParser({
          language: "cpp",
          version: "1.0.0",
        });
        await cppParser.initialize(this.db);
        return cppParser as any;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): "typescript" | "python" | "cpp" {
    const ext = path.extname(filePath).toLowerCase();

    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) return "typescript";
    if ([".py", ".pyw"].includes(ext)) return "python";
    if (
      [".cpp", ".cc", ".cxx", ".hpp", ".h", ".hxx", ".ixx", ".c"].includes(ext)
    )
      return "cpp";

    throw new Error(`Cannot detect language for extension: ${ext}`);
  }

  /**
   * Get file extension for language
   */
  private getExtension(language: string): string {
    switch (language) {
      case "typescript":
        return "ts";
      case "python":
        return "py";
      case "cpp":
        return "cpp";
      default:
        return "txt";
    }
  }

  /**
   * Print test results
   */
  printResults(results: Record<string, TestResult>): void {
    console.log("\n🔍 Parser Test Results\n");

    let totalPassed = 0;
    let totalFailed = 0;

    for (const [name, result] of Object.entries(results)) {
      if (result.pitfallsDetected.length > 0) {
        for (const pitfall of result.pitfallsDetected) {
        }
      }

      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
        }
      }

      if (result.errors.length > 0) {
        for (const error of result.errors) {
        }
      }

      console.log("");

      if (result.passed) totalPassed++;
      else totalFailed++;
    }
  }
}

// Example test cases demonstrating common pitfalls
export const COMMON_PITFALL_TESTS: TestCase[] = [
  {
    name: "typescript-arrow-functions",
    language: "typescript",
    content: `
export const processData = async (data: string[]): Promise<void> => {
  console.log('Processing...');
};

const filterItems = (items: any[]) => items.filter(x => x.active);

export const Component: React.FC<Props> = ({ children }) => {
  return <div>{children}</div>;
};
`,
    expectedSymbols: [
      { name: "processData", kind: "function" },
      { name: "filterItems", kind: "function" },
      { name: "Component", kind: "function" },
    ],
  },

  {
    name: "cpp-templates",
    language: "cpp",
    content: `
template<typename T>
class Vector {
public:
    void push_back(const T& value);
};

template<typename T, typename U>
auto add(T a, U b) -> decltype(a + b) {
    return a + b;
}

template<>
class Vector<bool> {
    // Specialized implementation
};
`,
    expectedSymbols: [
      { name: "Vector", kind: "class" },
      { name: "push_back", kind: "method" },
      { name: "add", kind: "function" },
    ],
  },

  {
    name: "python-async-generators",
    language: "python",
    content: `
async def fetch_data(urls):
    for url in urls:
        data = await fetch(url)
        yield data

class DataProcessor:
    async def process_stream(self):
        async for item in fetch_data(self.urls):
            self.handle(item)
    
    @property
    def status(self):
        return self._status
`,
    expectedSymbols: [
      { name: "fetch_data", kind: "function" },
      { name: "DataProcessor", kind: "class" },
      { name: "process_stream", kind: "method" },
      { name: "status", kind: "method" },
    ],
  },

  {
    name: "cross-language-calls",
    language: "typescript",
    content: `
import { spawn } from 'child_process';

export function runPythonScript(scriptPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [scriptPath, '--json']);
    
    pythonProcess.on('exit', (code) => {
      if (code === 0) resolve('Success');
      else reject(new Error('Python script failed'));
    });
  });
}

export async function analyzeData() {
  const result = await runPythonScript('./analysis.py');
  return JSON.parse(result);
}
`,
    expectedRelationships: [
      { type: "calls", from: "runPythonScript", to: "spawn" },
      { type: "spawns", from: "runPythonScript", to: "./analysis.py" },
    ],
  },
];
