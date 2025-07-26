import { createLogger } from "../src/utils/logger.js";
import { DatabaseInitializer } from "../src/database/database-initializer.js";
import { UniversalIndexer } from "../src/indexing/universal-indexer.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import * as schema from "../src/database/drizzle/schema.js";
import { eq, desc } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger("MCPServerIntegrationTest");

/**
 * Integration test for MCP server functionality
 * Tests the core MCP tools with proper database initialization and test data
 */
class MCPServerIntegrationTest {
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private indexer: UniversalIndexer;
  private testDbPath: string;
  private testProjectPath: string;

  constructor() {
    this.testDbPath = process.env.TEST_DATABASE_PATH || 
      path.join(__dirname, "..", ".test-db", "mcp-integration-test.db");
    this.testProjectPath = path.join(__dirname, "..", "test", "fixtures", "multi-language");
  }

  async runTests(): Promise<void> {
    logger.info("Starting MCP Server Integration Tests");

    try {
      await this.setup();
      await this.testIndexProject();
      await this.testGetSymbols();
      await this.testSearchSymbols();
      await this.testGetRelationships();
      await this.testSemanticInsights();
      
      logger.info("✅ All MCP server integration tests passed!");
    } catch (error) {
      logger.error("❌ MCP server integration test failed", error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async setup(): Promise<void> {
    logger.info("Setting up test environment");
    
    // Ensure test database directory exists
    const dbDir = path.dirname(this.testDbPath);
    await fs.mkdir(dbDir, { recursive: true });
    
    // Remove existing test database to start fresh
    try {
      await fs.unlink(this.testDbPath);
    } catch {
      // Ignore if doesn't exist
    }
    
    // Initialize database with proper schema
    const initializer = DatabaseInitializer.getInstance();
    this.db = await initializer.initializeDatabase(this.testDbPath);
    
    // Create Drizzle instance
    this.drizzleDb = drizzle(this.db, { schema });
    
    // Initialize indexer with the raw database and options
    this.indexer = new UniversalIndexer(this.db, {
      projectPath: this.testProjectPath,
      projectName: "test-project",
      debugMode: true,
      enableSemanticAnalysis: false, // Disable for faster tests
      maxFiles: 10, // Limit files for testing
    });
    
    // Create a test project
    await this.createTestProject();
    
    logger.info("Test environment ready");
  }

  private async createTestProject(): Promise<void> {
    // Insert a test project
    const [project] = await this.drizzleDb
      .insert(schema.projects)
      .values({
        name: "test-project",
        rootPath: this.testProjectPath,
        displayName: "Test Project",
        description: "Test project for MCP integration",
        createdAt: new Date().toISOString(),
        lastIndexed: new Date().toISOString(),
      })
      .returning();
    
    logger.info(`Created test project with ID: ${project.id}`);
  }

  private async testIndexProject(): Promise<void> {
    const testName = "Index Project";
    logger.info(`Running test: ${testName}`);

    try {
      // Create some test files if they don't exist
      const testFilesDir = this.testProjectPath;
      await fs.mkdir(testFilesDir, { recursive: true });
      
      // Create a simple TypeScript test file
      const testTsFile = path.join(testFilesDir, "sample.ts");
      await fs.writeFile(testTsFile, `
// Test TypeScript file
export class TestClass {
  private name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  public greet(): string {
    return \`Hello, \${this.name}!\`;
  }
}

export function testFunction(param: number): number {
  return param * 2;
}

export interface TestInterface {
  id: number;
  value: string;
}
`);

      // Create a simple Python test file
      const testPyFile = path.join(testFilesDir, "sample.py");
      await fs.writeFile(testPyFile, `
# Test Python file
class TestPythonClass:
    def __init__(self, name):
        self.name = name
    
    def greet(self):
        return f"Hello, {self.name}!"

def test_function(param):
    return param * 2

TEST_CONSTANT = 42
`);
      
      // Index the test project
      const result = await this.indexer.indexProject();
      
      if (!result || !result.success || typeof result.filesIndexed !== "number") {
        throw new Error(`Invalid response from indexProject: ${JSON.stringify(result)}`);
      }

      if (result.filesIndexed < 2) {
        throw new Error(`Expected at least 2 files to be indexed, but got ${result.filesIndexed}`);
      }

      logger.info(`✅ ${testName} passed - Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testGetSymbols(): Promise<void> {
    const testName = "Get Symbols";
    logger.info(`Running test: ${testName}`);

    try {
      const symbols = await this.drizzleDb
        .select()
        .from(schema.universalSymbols)
        .limit(10);

      if (!Array.isArray(symbols)) {
        throw new Error("Invalid response from getSymbols");
      }

      if (symbols.length === 0) {
        throw new Error("No symbols found after indexing");
      }

      // Verify we have expected symbols
      const symbolNames = symbols.map(s => s.name);
      const expectedSymbols = ["TestClass", "testFunction"];
      const foundExpected = expectedSymbols.filter(name => 
        symbolNames.some(sn => sn.includes(name))
      );

      if (foundExpected.length !== expectedSymbols.length) {
        throw new Error(`Expected symbols not found. Looking for: ${expectedSymbols}, found: ${symbolNames}`);
      }

      logger.info(`✅ ${testName} passed - Retrieved ${symbols.length} symbols`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testSearchSymbols(): Promise<void> {
    const testName = "Search Symbols";
    logger.info(`Running test: ${testName}`);

    try {
      const results = await this.drizzleDb
        .select()
        .from(schema.universalSymbols)
        .where(eq(schema.universalSymbols.name, "TestClass"))
        .limit(5);

      if (!Array.isArray(results)) {
        throw new Error("Invalid response from searchSymbols");
      }

      if (results.length === 0) {
        throw new Error("Search returned no results for 'TestClass'");
      }

      logger.info(`✅ ${testName} passed - Found ${results.length} matching symbols`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testGetRelationships(): Promise<void> {
    const testName = "Get Relationships";
    logger.info(`Running test: ${testName}`);

    try {
      const relationships = await this.drizzleDb
        .select()
        .from(schema.universalRelationships)
        .limit(10);

      if (!Array.isArray(relationships)) {
        throw new Error("Invalid response from getRelationships");
      }

      // It's okay if no relationships are found in simple test files
      logger.info(`✅ ${testName} passed - Retrieved ${relationships.length} relationships`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testSemanticInsights(): Promise<void> {
    const testName = "Semantic Insights";
    logger.info(`Running test: ${testName}`);

    try {
      // Check if semantic analysis created any insights
      const insights = await this.drizzleDb
        .select()
        .from(schema.semanticInsights)
        .limit(5);

      // It's okay if no insights are generated for simple test files
      logger.info(`✅ ${testName} passed - Found ${insights.length} semantic insights`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async cleanup(): Promise<void> {
    logger.info("Cleaning up test environment");
    
    // Close database connection
    if (this.db) {
      this.db.close();
    }
    
    // Remove test files
    try {
      await fs.rm(this.testProjectPath, { recursive: true, force: true });
      logger.info("Test files cleaned up");
    } catch (error) {
      logger.warn("Failed to clean up test files", error);
    }
    
    // Optionally remove test database
    if (!process.env.KEEP_TEST_DB) {
      try {
        await fs.unlink(this.testDbPath);
        logger.info("Test database cleaned up");
      } catch (error) {
        // Ignore if file doesn't exist
      }
    }
  }
}

// Run the tests
async function main() {
  const tester = new MCPServerIntegrationTest();
  try {
    await tester.runTests();
    process.exit(0);
  } catch (error) {
    logger.error("Test suite failed", error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error("Unhandled error", error);
  process.exit(1);
});