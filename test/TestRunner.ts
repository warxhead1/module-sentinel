#!/usr/bin/env tsx

import { UniversalIndexer } from "../dist/indexing/universal-indexer.js";
import { EventEmitter } from "events";
import * as path from "path";
import * as fs from "fs/promises";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { JUnitReporter, TestResult } from "./helpers/JUnitReporter";
import { DatabaseConfig } from "../dist/config/database-config.js";
import { DatabaseInitializer } from "../dist/database/database-initializer.js";
import { OptimizedTreeSitterBaseParser as TreeSitterBaseParser } from "../dist/parsers/tree-sitter/optimized-base-parser.js";

// Import only tests that work with the new architecture
import { UniversalIndexerTest } from "./unit/UniversalIndexerSimpleTest";
import { VisualizationAPITest } from "./unit/VisualizationAPITest";
import { DrizzleOrmTest } from "./unit/DrizzleOrmSimpleTest";
import { NamespaceParsingSimpleTest } from "./unit/NamespaceParsingSimpleTest";
import { RelationshipExtractionTest } from "./unit/RelationshipExtractionTest";
import { ControlFlowAnalysisTest } from "./unit/ControlFlowAnalysisTest";
import { EnhancedArchitectureTest } from "./unit/EnhancedArchitectureTest";
import { ComprehensiveSymbolExtractionTest } from "./unit/ComprehensiveSymbolExtractionTest";
import { CrossLanguageFlowTest } from "./unit/CrossLanguageFlowTest";
import { StructMemberExtractionTest } from "./unit/StructMemberExtractionTest";
import { MemberAccessTrackingTest } from "./unit/MemberAccessTrackingTest";
import { MemberAccessDeepDiveTest } from "./unit/MemberAccessDeepDiveTest";
import { ComprehensiveParserCapabilitiesTest } from "./unit/ComprehensiveParserCapabilitiesTest";
import { SemanticIntelligenceIntegrationTest } from "./unit/SemanticIntelligenceIntegrationTest";
import { ASTGenerationTest } from "./unit/ASTGenerationTest";

export class TestRunner extends EventEmitter {
  private projectPath = process.cwd();
  private dbPath: string;
  private forceRebuild: boolean;
  private testFilter?: string;
  private maxFiles?: number;
  private skipIndex: boolean;
  private junitReporter: JUnitReporter;

  constructor(options?: {
    forceRebuild?: boolean;
    testFilter?: string;
    maxFiles?: number;
    skipIndex?: boolean;
  }) {
    super();
    this.forceRebuild = options?.forceRebuild ?? false;
    this.testFilter = options?.testFilter;
    this.maxFiles = options?.maxFiles;
    this.skipIndex = options?.skipIndex ?? false;
    this.junitReporter = new JUnitReporter();

    // Set NODE_ENV to test
    process.env.NODE_ENV = "test";

    // Use centralized database configuration
    const dbConfig = DatabaseConfig.getInstance();
    this.dbPath = dbConfig.getDbPath();
    console.log(`📊 Using test database: ${this.dbPath}`);
  }

  async run(): Promise<void> {
    console.log("🚀 Module Sentinel Test Suite (Clean Architecture)\n");

    try {
      // Use centralized database initializer
      const dbInitializer = DatabaseInitializer.getInstance();
      const db = await dbInitializer.resetDatabase(this.dbPath);

      // Build test index (unless skipped)
      if (!this.skipIndex) {
        console.log("🔨 Building test index...");
        await this.buildTestIndex(db);
      } else {
        console.log("⏭️  Skipping test index build (--skip-index flag set)");
      }

      // Run tests
      console.log("🧪 Running tests...\n");
      const results = await this.runTests(db);

      // Generate report
      for (const result of results) {
        this.junitReporter.addTestResult(result);
      }
      await this.junitReporter.writeReport("test-results.xml");

      // Summary
      const totalTests = results.length;
      const passedTests = results.filter((r) => r.status === "passed").length;
      const failedTests = results.filter((r) => r.status === "failed").length;
      const skippedTests = results.filter((r) => r.status === "skipped").length;

      console.log("\n📊 Test Summary:");
      console.log(`   Total: ${totalTests}`);
      console.log(`   ✅ Passed: ${passedTests}`);
      console.log(`   ❌ Failed: ${failedTests}`);
      console.log(`   ⏭️  Skipped: ${skippedTests}`);

      // Show detailed failure information
      const failedResults = results.filter((r) => r.status === "failed");
      if (failedResults.length > 0) {
        console.log("\n❌ Failed Tests:");
        failedResults.forEach((result) => {
          console.log(
            `   • ${result.name}: ${result.error?.message || "Unknown error"}`
          );
        });
      }

      // Don't close the database immediately - let tests finish
      await new Promise((resolve) => setTimeout(resolve, 100));
      db.close();

      // Keep the database for dashboard use
      console.log(`📊 Database saved for dashboard use: ${this.dbPath}`);

      if (failedTests > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error("Fatal error in test runner:", error);
      process.exit(1);
    }
  }

  private async buildTestIndex(db: Database): Promise<void> {
    const testDataPath = path.join(this.projectPath, "test/complex-files");

    const indexer = new UniversalIndexer(db, {
      projectPath: testDataPath,
      projectName: "test-project",
      languages: ["cpp", "python", "typescript", "javascript"],
      debugMode: false,
      enableSemanticAnalysis: true, // Enable control flow for all tests
      maxFiles: this.maxFiles,
    });

    const result = await indexer.indexProject();
    console.log(
      `✅ Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`
    );

    // Log parser timing statistics
    TreeSitterBaseParser.logPerformanceSummary();
  }

  private async runTests(db: Database): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Define test classes to run (order matters - DrizzleOrmTest first to verify schema)
    const testClasses = [
      { name: "ASTGenerationTest", class: ASTGenerationTest }, // Run first to diagnose AST issues
      { name: "DrizzleOrmTest", class: DrizzleOrmTest },
      {
        name: "ComprehensiveSymbolExtractionTest",
        class: ComprehensiveSymbolExtractionTest,
      },
      { name: "NamespaceParsingSimpleTest", class: NamespaceParsingSimpleTest },
      { name: "UniversalIndexerTest", class: UniversalIndexerTest },
      { name: "RelationshipExtractionTest", class: RelationshipExtractionTest },
      { name: "VisualizationAPITest", class: VisualizationAPITest },
      { name: "ControlFlowAnalysisTest", class: ControlFlowAnalysisTest },
      { name: "EnhancedArchitectureTest", class: EnhancedArchitectureTest },
      { name: "CrossLanguageFlowTest", class: CrossLanguageFlowTest },
      { name: "StructMemberExtractionTest", class: StructMemberExtractionTest },
      { name: "MemberAccessTrackingTest", class: MemberAccessTrackingTest },
      { name: "MemberAccessDeepDiveTest", class: MemberAccessDeepDiveTest },
      {
        name: "ComprehensiveParserCapabilitiesTest",
        class: ComprehensiveParserCapabilitiesTest,
      },
      {
        name: "SemanticIntelligenceIntegrationTest", 
        class: SemanticIntelligenceIntegrationTest,
      },
    ];

    for (const testDef of testClasses) {
      // Check if test matches filter
      if (
        this.testFilter &&
        !testDef.name.toLowerCase().includes(this.testFilter.toLowerCase())
      ) {
        continue;
      }

      console.log(`\n🧪 Running ${testDef.name}...`);

      try {
        const testInstance = new testDef.class(db);
        const testResults = await testInstance.run();

        results.push(
          ...testResults.map((r) => ({
            ...r,
            className: testDef.name,
          }))
        );

        // Summary for this test class
        const passed = testResults.filter((r) => r.status === "passed").length;
        const failed = testResults.filter((r) => r.status === "failed").length;
        console.log(`   ${testDef.name}: ${passed} passed, ${failed} failed`);

        // Show failed test details for debugging
        const failedTests = testResults.filter((r) => r.status === "failed");
        for (const failedTest of failedTests) {
          console.log(
            `   ❌ ${failedTest.name}: ${
              failedTest.error?.message || "Unknown error"
            }`
          );
        }
      } catch (error) {
        console.error(`   ❌ Failed to run ${testDef.name}:`, error);
        results.push({
          name: testDef.name,
          className: testDef.name,
          status: "failed",
          time: 0,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
  }
}

// Main entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--rebuild" || args[i] === "-r") {
      options.forceRebuild = true;
    } else if (args[i] === "--filter" || args[i] === "-f") {
      options.testFilter = args[++i];
    } else if (args[i] === "--max-files" || args[i] === "-m") {
      options.maxFiles = parseInt(args[++i], 10);
    } else if (args[i] === "--skip-index" || args[i] === "-s") {
      options.skipIndex = true;
    }
  }

  const runner = new TestRunner(options);
  runner.run().catch(console.error);
}
