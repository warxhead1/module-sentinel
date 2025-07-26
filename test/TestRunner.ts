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
import { createLogger, Logger, flushErrorSummary } from "../dist/utils/logger.js";

// Import only tests that work with the new architecture
import { DrizzleOrmTest } from "./unit/DrizzleOrmSimpleTest";
import { NamespaceParsingSimpleTest } from "./unit/NamespaceParsingSimpleTest";
import { RelationshipExtractionTest } from "./unit/RelationshipExtractionTest";
import { ControlFlowAnalysisTest } from "./unit/ControlFlowAnalysisTest";
// import { EnhancedArchitectureTest } from "./unit/EnhancedArchitectureTest"; // Disabled test
import { MemberAccessTrackingTest } from "./unit/MemberAccessTrackingTest";
import { MemberAccessDeepDiveTest } from "./unit/MemberAccessDeepDiveTest";
import { ASTGenerationTest } from "./unit/ASTGenerationTest";
import { ComprehensiveAPITest } from "./unit/ComprehensiveAPITest";
import { TypeScriptEdgeCasesTest } from "./unit/TypeScriptEdgeCasesTest";
import { CppParserIssuesTest } from "./unit/CppParserIssuesTest";
// import { ParentChildRelationshipTest } from "./unit/ParentChildRelationshipTest"; // Disabled test

export class TestRunner extends EventEmitter {
  private projectPath = process.cwd();
  private dbPath: string;
  private forceRebuild: boolean;
  private testFilter?: string;
  private maxFiles?: number;
  private skipIndex: boolean;
  private enableSemanticAnalysis: boolean;
  private junitReporter: JUnitReporter;
  private logger: Logger;

  constructor(options?: {
    forceRebuild?: boolean;
    testFilter?: string;
    maxFiles?: number;
    skipIndex?: boolean;
    enableSemanticAnalysis?: boolean;
  }) {
    super();
    this.forceRebuild = options?.forceRebuild ?? false;
    this.testFilter = options?.testFilter;
    this.maxFiles = options?.maxFiles;
    this.skipIndex = options?.skipIndex ?? false;
    this.enableSemanticAnalysis = options?.enableSemanticAnalysis ?? false;
    this.junitReporter = new JUnitReporter();

    // Set NODE_ENV to test
    process.env.NODE_ENV = "test";

    // Use centralized database configuration
    const dbConfig = DatabaseConfig.getInstance();
    this.dbPath = dbConfig.getDbPath();
    this.logger = createLogger('TestRunner');
    this.logger.info('Using test database', { dbPath: this.dbPath });
  }

  async run(): Promise<void> {
    this.logger.info('Module Sentinel Test Suite (Clean Architecture)');

    try {
      // Use centralized database initializer
      const dbInitializer = DatabaseInitializer.getInstance();
      const db = this.forceRebuild 
        ? await dbInitializer.resetDatabase(this.dbPath)
        : await dbInitializer.initializeDatabase(this.dbPath);
      
      if (this.forceRebuild) {
        this.logger.info('Database reset completed', { rebuild: true });
      } else {
        this.logger.info('Using existing database', { rebuild: false });
      }

      // Build test index (unless skipped)
      if (!this.skipIndex) {
        this.logger.info('Building test index...');
        if (!this.enableSemanticAnalysis) {
          this.logger.info('Semantic analysis disabled for faster testing', { semantic: false });
        }
        await this.buildTestIndex(db);
      } else {
        this.logger.info('Skipping test index build', { skipIndex: true });
      }

      // Run tests
      this.logger.info('Running tests...');
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

      this.logger.info('Test Summary', {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        skipped: skippedTests
      });

      // Flush any accumulated error summaries
      flushErrorSummary();

      // Show detailed failure information
      const failedResults = results.filter((r) => r.status === "failed");
      if (failedResults.length > 0) {
        this.logger.error('Failed Tests:', undefined, { count: failedResults.length });
        failedResults.forEach((result) => {
          this.logger.error(`Test failed: ${result.name}`, result.error, {
            test: result.name,
            duration: result.time
          });
        });
      }

      // Don't close the database immediately - let tests finish
      await new Promise((resolve) => setTimeout(resolve, 100));
      db.close();

      // Keep the database for dashboard use
      this.logger.info('Database saved for dashboard use', { dbPath: this.dbPath });

      if (failedTests > 0) {
        process.exit(1);
      }
    } catch (error) {
      this.logger.fatal('Fatal error in test runner', error);
      process.exit(1);
    }
  }

  private async buildTestIndex(db: Database.Database): Promise<void> {
    const testDataPath = path.join(this.projectPath, "test/complex-files");

    const indexer = new UniversalIndexer(db, {
      projectPath: testDataPath,
      projectName: "test-project",
      languages: ["cpp", "python", "typescript", "javascript"],
      debugMode: false,
      enableSemanticAnalysis: this.enableSemanticAnalysis, // Can be enabled with --semantic flag
      maxFiles: this.maxFiles,
    });

    const result = await indexer.indexProject();
    console.log(
      `✅ Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`
    );

    // Log parser timing statistics
    TreeSitterBaseParser.logPerformanceSummary();
  }

  private async runTests(db: Database.Database): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Define test classes to run (order matters - DrizzleOrmTest first to verify schema)
    const testClasses = [
      { name: "ASTGenerationTest", class: ASTGenerationTest }, // Run first to diagnose AST issues
      { name: "DrizzleOrmTest", class: DrizzleOrmTest },
      { name: "NamespaceParsingSimpleTest", class: NamespaceParsingSimpleTest },
      { name: "RelationshipExtractionTest", class: RelationshipExtractionTest },
      { name: "ComprehensiveAPITest", class: ComprehensiveAPITest },
      { name: "ControlFlowAnalysisTest", class: ControlFlowAnalysisTest },
      // { name: "EnhancedArchitectureTest", class: EnhancedArchitectureTest }, // Disabled: uses deprecated architecture
      { name: "MemberAccessTrackingTest", class: MemberAccessTrackingTest },
      { name: "MemberAccessDeepDiveTest", class: MemberAccessDeepDiveTest },
      {
        name: "TypeScriptEdgeCasesTest",
        class: TypeScriptEdgeCasesTest,
      },
      {
        name: "CppParserIssuesTest",
        class: CppParserIssuesTest,
      },
      // {
      //   name: "ParentChildRelationshipTest",
      //   class: ParentChildRelationshipTest,
      // }, // Disabled: Complex parent-child resolution test
    ];

    for (const testDef of testClasses) {
      // Check if test matches filter
      if (
        this.testFilter &&
        !testDef.name.toLowerCase().includes(this.testFilter.toLowerCase())
      ) {
        continue;
      }

      this.logger.info(`Running ${testDef.name}...`, { test: testDef.name });

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
        this.logger.info(`Test results for ${testDef.name}`, { 
          test: testDef.name,
          passed,
          failed
        });

        // Show failed test details for debugging
        const failedTests = testResults.filter((r) => r.status === "failed");
        for (const failedTest of failedTests) {
          this.logger.error(`Test failed: ${failedTest.name}`, failedTest.error, {
            test: failedTest.name,
            class: testDef.name
          });
        }
      } catch (error) {
        this.logger.error(`Failed to run test class`, error, { testClass: testDef.name });
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
    } else if (args[i] === "--semantic" || args[i] === "--enable-semantic") {
      options.enableSemanticAnalysis = true;
    }
  }

  const runner = new TestRunner(options);
  runner.run().catch((error) => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}
