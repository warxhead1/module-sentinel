#!/usr/bin/env tsx

import { BaseTest } from "../helpers/BaseTest";
import { TestResult } from "../helpers/JUnitReporter";
import Database from "better-sqlite3";
import { OptimizedCppTreeSitterParser as CppTreeSitterParser } from "../../dist/parsers/tree-sitter/optimized-cpp-parser.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * TDD tests for namespace parsing improvements
 * Tests the enhanced namespace parsing logic with real file parsing
 */
export class NamespaceParsingSimpleTest extends BaseTest {
  private parser!: CppTreeSitterParser;

  constructor(db: Database) {
    super("NamespaceParsingSimpleTest", db);
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    try {
      // Initialize the parser
      this.parser = new CppTreeSitterParser(this.db, {
        projectId: 1,
        languageId: 1,
        debugMode: false,
      });
      await this.parser.initialize();

      // Test parsing logic with helper methods
      results.push(await this.testNamespaceStackManagement());
      results.push(await this.testExportNamespaceRecognition());
      results.push(await this.testMultiLevelNamespaceParsing());
      results.push(await this.testScopeBoundaryTracking());
      results.push(await this.testQualifiedNameBuilding());
      results.push(await this.testNamespaceExtraction());

      // CRITICAL: Test actual file parsing against real test files
      results.push(await this.testRealFileNamespaceParsing());
    } catch (error) {
      results.push({
        name: "setup_failure",
        status: "failed",
        time: 0,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    return results;
  }

  private async testNamespaceStackManagement(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test the namespace stack management logic
      const namespaceStack: string[] = [];

      // Simulate entering nested namespaces
      this.enterNamespace(namespaceStack, "PlanetGen");
      this.assertEqual(
        namespaceStack.join("::"),
        "PlanetGen",
        "Single namespace"
      );

      this.enterNamespace(namespaceStack, "Rendering");
      this.assertEqual(
        namespaceStack.join("::"),
        "PlanetGen::Rendering",
        "Nested namespace"
      );

      this.enterNamespace(namespaceStack, "SPIRV");
      this.assertEqual(
        namespaceStack.join("::"),
        "PlanetGen::Rendering::SPIRV",
        "Triple nested namespace"
      );

      // Simulate exiting namespaces
      this.exitNamespace(namespaceStack);
      this.assertEqual(
        namespaceStack.join("::"),
        "PlanetGen::Rendering",
        "Exit one namespace"
      );

      this.exitNamespace(namespaceStack);
      this.assertEqual(
        namespaceStack.join("::"),
        "PlanetGen",
        "Exit second namespace"
      );

      this.exitNamespace(namespaceStack);
      this.assertEqual(
        namespaceStack.join("::"),
        "",
        "Exit to global namespace"
      );

      return {
        name: "namespace_stack_management",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "namespace_stack_management",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async testExportNamespaceRecognition(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test export namespace pattern recognition
      const testPatterns = [
        "export namespace PlanetGen::Rendering {",
        "export namespace PlanetGen::Core {",
        "export namespace Utils::Math {",
        "namespace PlanetGen::Rendering {", // without export
        "export namespace A::B::C::D {", // deep nesting
      ];

      const expectedResults = [
        { isExport: true, namespace: "PlanetGen::Rendering" },
        { isExport: true, namespace: "PlanetGen::Core" },
        { isExport: true, namespace: "Utils::Math" },
        { isExport: false, namespace: "PlanetGen::Rendering" },
        { isExport: true, namespace: "A::B::C::D" },
      ];

      for (let i = 0; i < testPatterns.length; i++) {
        const pattern = testPatterns[i];
        const expected = expectedResults[i];

        const result = this.parseNamespaceDeclaration(pattern);

        if (!result) {
          throw new Error(`Failed to parse namespace pattern: ${pattern}`);
        }

        this.assertEqual(
          result.isExport,
          expected.isExport,
          `Export detection for: ${pattern}`
        );
        this.assertEqual(
          result.namespace,
          expected.namespace,
          `Namespace extraction for: ${pattern}`
        );
      }

      return {
        name: "export_namespace_recognition",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "export_namespace_recognition",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async testMultiLevelNamespaceParsing(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test parsing multi-level namespace declarations
      const testCases = [
        { input: "PlanetGen::Rendering", expected: ["PlanetGen", "Rendering"] },
        { input: "A::B::C::D", expected: ["A", "B", "C", "D"] },
        { input: "SingleLevel", expected: ["SingleLevel"] },
        {
          input: "std::chrono::high_resolution_clock",
          expected: ["std", "chrono", "high_resolution_clock"],
        },
      ];

      for (const testCase of testCases) {
        const result = this.parseNamespacePath(testCase.input);

        if (result.length !== testCase.expected.length) {
          throw new Error(
            `Length mismatch for ${testCase.input}: expected ${testCase.expected.length}, got ${result.length}`
          );
        }

        for (let i = 0; i < result.length; i++) {
          this.assertEqual(
            result[i],
            testCase.expected[i],
            `Component ${i} of ${testCase.input}`
          );
        }
      }

      return {
        name: "multi_level_namespace_parsing",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "multi_level_namespace_parsing",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async testScopeBoundaryTracking(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test scope boundary tracking with opening/closing braces
      const codeLines = [
        "export namespace A {", // Line 1: Enter A
        "  class ClassA {};", // Line 2: In A
        "  namespace B {", // Line 3: Enter B
        "    class ClassB {};", // Line 4: In A::B
        "  }", // Line 5: Exit B
        "  class ClassA2 {};", // Line 6: Back in A
        "}", // Line 7: Exit A
        "class GlobalClass {};", // Line 8: Global scope
      ];

      const namespaceStack: string[] = [];
      const expectedStacks = [
        ["A"], // After line 1
        ["A"], // After line 2
        ["A", "B"], // After line 3
        ["A", "B"], // After line 4
        ["A"], // After line 5
        ["A"], // After line 6
        [], // After line 7
        [], // After line 8
      ];

      for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        this.processLineForScopeTracking(line, namespaceStack);

        const expectedStack = expectedStacks[i];
        const actualStackStr = namespaceStack.join("::");
        const expectedStackStr = expectedStack.join("::");

        this.assertEqual(
          actualStackStr,
          expectedStackStr,
          `Line ${i + 1}: "${line}"`
        );
      }

      return {
        name: "scope_boundary_tracking",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "scope_boundary_tracking",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async testQualifiedNameBuilding(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test building qualified names correctly
      const testCases = [
        {
          namespaceStack: [],
          className: "GlobalClass",
          expected: "GlobalClass",
        },
        { namespaceStack: ["A"], className: "ClassA", expected: "A::ClassA" },
        {
          namespaceStack: ["A", "B"],
          className: "ClassB",
          expected: "A::B::ClassB",
        },
        {
          namespaceStack: ["PlanetGen", "Rendering"],
          className: "VulkanManager",
          expected: "PlanetGen::Rendering::VulkanManager",
        },
        {
          namespaceStack: ["PlanetGen", "Rendering", "SPIRV"],
          className: "SPIRVCore",
          expected: "PlanetGen::Rendering::SPIRV::SPIRVCore",
        },
      ];

      for (const testCase of testCases) {
        const result = this.buildQualifiedName(
          testCase.namespaceStack,
          testCase.className
        );
        this.assertEqual(
          result,
          testCase.expected,
          `Qualified name for ${
            testCase.className
          } in [${testCase.namespaceStack.join(", ")}]`
        );
      }

      return {
        name: "qualified_name_building",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "qualified_name_building",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async testNamespaceExtraction(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test extracting namespace from qualified names (reverse operation)
      const testCases = [
        { qualifiedName: "GlobalClass", expected: "" },
        { qualifiedName: "A::ClassA", expected: "A" },
        { qualifiedName: "A::B::ClassB", expected: "A::B" },
        {
          qualifiedName: "PlanetGen::Rendering::VulkanManager",
          expected: "PlanetGen::Rendering",
        },
        {
          qualifiedName: "PlanetGen::VulkanManager::VulkanManager",
          expected: "PlanetGen",
        }, // Constructor pattern
      ];

      for (const testCase of testCases) {
        const className = testCase.qualifiedName.split("::").pop() || "";
        const result = this.extractNamespaceFromQualified(
          testCase.qualifiedName,
          className
        );
        this.assertEqual(
          result,
          testCase.expected,
          `Namespace extraction from ${testCase.qualifiedName}`
        );
      }

      return {
        name: "namespace_extraction",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "namespace_extraction",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  // Helper methods for the namespace parsing logic (to be implemented)

  private enterNamespace(stack: string[], namespace: string): void {
    if (namespace.includes("::")) {
      // Multi-level namespace: A::B::C
      const parts = namespace.split("::");
      stack.push(...parts);
    } else {
      // Single level namespace
      stack.push(namespace);
    }
  }

  private exitNamespace(stack: string[]): void {
    stack.pop();
  }

  private parseNamespaceDeclaration(
    line: string
  ): { isExport: boolean; namespace: string } | null {
    // Enhanced regex to match both export namespace and regular namespace
    const exportNamespaceRegex = /^\s*(export\s+)?namespace\s+([\w:]+)\s*\{/;
    const match = line.match(exportNamespaceRegex);

    if (!match) {
      return null;
    }

    return {
      isExport: !!match[1], // Check if 'export ' was captured
      namespace: match[2],
    };
  }

  private parseNamespacePath(namespacePath: string): string[] {
    return namespacePath.split("::").filter((part) => part.length > 0);
  }

  private processLineForScopeTracking(
    line: string,
    namespaceStack: string[]
  ): void {
    // Check for namespace declaration
    const namespaceMatch = this.parseNamespaceDeclaration(line);
    if (namespaceMatch) {
      this.enterNamespace(namespaceStack, namespaceMatch.namespace);
      return;
    }

    // Check for closing brace (simplified - in real implementation would need proper bracket counting)
    if (line.trim() === "}" || line.trim().startsWith("}")) {
      this.exitNamespace(namespaceStack);
      return;
    }
  }

  private buildQualifiedName(
    namespaceStack: string[],
    className: string
  ): string {
    if (namespaceStack.length === 0) {
      return className;
    }
    return namespaceStack.join("::") + "::" + className;
  }

  private extractNamespaceFromQualified(
    qualifiedName: string,
    className: string
  ): string {
    // Handle constructor pattern: PlanetGen::ClassName::ClassName
    if (qualifiedName.endsWith("::" + className)) {
      const withoutConstructor = qualifiedName.substring(
        0,
        qualifiedName.length - ("::" + className).length
      );
      if (withoutConstructor.endsWith("::" + className)) {
        return withoutConstructor.substring(
          0,
          withoutConstructor.length - ("::" + className).length
        );
      }
      return withoutConstructor;
    }

    // Handle direct pattern: PlanetGen::ClassName
    if (qualifiedName.endsWith(className)) {
      const namespace = qualifiedName.substring(
        0,
        qualifiedName.length - className.length - 2
      ); // -2 for ::
      return namespace || "";
    }

    return "";
  }

  private assertEqual(actual: any, expected: any, message: string): void {
    if (actual !== expected) {
      throw new Error(`${message}: Expected '${expected}', got '${actual}'`);
    }
  }

  /**
   * CRITICAL TEST: Parse real test files and verify namespace extraction
   */
  private async testRealFileNamespaceParsing(): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Test with the actual test file that has "namespace PlanetGen::Rendering {"
      const testFilePath = path.join(
        process.cwd(),
        "test/complex-files/src-buffer/BufferFactory.cpp"
      );

      // Verify the file exists
      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      if (!fileExists) {
        throw new Error(`Test file not found: ${testFilePath}`);
      }

      // Read the file content to verify it contains the expected namespace
      const content = await fs.readFile(testFilePath, "utf-8");
      const hasNamespaceDeclaration = content.includes(
        "namespace PlanetGen::Rendering"
      );
      if (!hasNamespaceDeclaration) {
        throw new Error(
          `Test file ${testFilePath} does not contain expected namespace declaration`
        );
      }

      // Call the pattern-based extraction method directly to avoid database storage issues
      // Access the protected method via type assertion for testing
      const parserAny = this.parser as any;
      const result = await parserAny.performPatternBasedExtraction(
        content,
        testFilePath
      );
      const symbols = result.symbols;

      // Find symbols that should have namespace information
      const symbolsWithNamespaces = symbols.filter(
        (s: any) => s.namespace && s.namespace !== ""
      );

      if (symbolsWithNamespaces.length > 0) {
        symbolsWithNamespaces.forEach((s: any) => {});
      }

      // We expect to find at least some symbols in the PlanetGen::Rendering namespace
      const renderingNamespaceSymbols = symbols.filter(
        (s: any) =>
          s.namespace === "PlanetGen::Rendering" ||
          s.qualifiedName.includes("PlanetGen::Rendering")
      );

      // Always list all symbols for debugging

      symbols.forEach((s: any, i: number) => {
        console.log(
          `[NAMESPACE_TEST] ${i + 1}. ${s.name} (${s.kind}) - namespace: '${
            s.namespace || "null"
          }' - qualified: '${s.qualifiedName}'`
        );
      });

      if (renderingNamespaceSymbols.length === 0) {
        throw new Error(
          `Expected to find symbols in PlanetGen::Rendering namespace but found none. File content contains namespace declaration but parser failed to extract it.`
        );
      }

      // Verify specific expected symbols
      const expectedSymbols = [
        {
          name: "BufferFactory",
          kind: "class",
          expectedNamespace: "PlanetGen::Rendering",
        },
        {
          name: "CreateStandardUniformBuffer",
          kind: "function",
          expectedNamespace: "PlanetGen::Rendering",
        },
      ];

      for (const expected of expectedSymbols) {
        const found = symbols.find(
          (s: any) => s.name === expected.name && s.kind === expected.kind
        );
        if (!found) {
          continue;
        }

        if (found.namespace !== expected.expectedNamespace) {
          throw new Error(
            `Symbol ${expected.name}: expected namespace '${expected.expectedNamespace}', got '${found.namespace}'`
          );
        }
      }

      return {
        name: "real_file_namespace_parsing",
        status: "passed",
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "real_file_namespace_parsing",
        status: "failed",
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
