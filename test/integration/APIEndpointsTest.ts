import { createLogger } from "../../src/utils/logger.js";
import { DatabaseInitializer } from "../../src/database/database-initializer.js";
import { UniversalIndexer } from "../../src/indexing/universal-indexer.js";
import { ModernApiServer } from "../../src/api/server.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import * as schema from "../../src/database/drizzle/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger("APIEndpointsTest");

/**
 * Integration test for API endpoints
 */
class APIEndpointsTest {
  private serverPort = 6971; // Use different port to avoid conflicts
  private baseUrl = `http://localhost:${this.serverPort}`;
  private server: ModernApiServer;
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private indexer: UniversalIndexer;
  private testDbPath: string;
  private testProjectPath: string;

  constructor() {
    this.testDbPath = process.env.TEST_DATABASE_PATH || 
      path.join(__dirname, "..", "..", ".test-db", "api-test.db");
    this.testProjectPath = path.join(__dirname, "..", "..", "test", "fixtures", "multi-language");
  }

  async runTests(): Promise<void> {
    logger.info("Starting API Endpoints Integration Tests");

    try {
      await this.setup();
      
      // Run test suites
      await this.testHealthEndpoint();
      await this.testProjectEndpoints();
      await this.testSymbolEndpoints();
      await this.testRelationshipEndpoints();
      await this.testSearchEndpoints();
      await this.testSemanticEndpoints();
      await this.testStatsEndpoints();
      
      logger.info("✅ All API endpoint tests passed!");
    } catch (error) {
      logger.error("❌ API endpoint test failed", error);
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
    
    // Initialize indexer
    this.indexer = new UniversalIndexer(this.db, {
      projectPath: this.testProjectPath,
      projectName: "test-api-project",
      debugMode: true,
      enableSemanticAnalysis: false, // Disable for faster tests
      maxFiles: 10, // Limit files for testing
    });
    
    // Start the API server
    this.server = new ModernApiServer(this.db, this.serverPort);
    await this.server.start();
    
    logger.info(`Test server started on port ${this.serverPort}`);
    
    // Create test project and index test data
    await this.createTestData();
    
    logger.info("Test environment ready");
  }

  private async createTestData(): Promise<void> {
    // Insert a test project
    const [project] = await this.drizzleDb
      .insert(schema.projects)
      .values({
        name: "test-api-project",
        rootPath: this.testProjectPath,
        displayName: "Test API Project",
        description: "Test project for API endpoints",
        createdAt: new Date().toISOString(),
        lastIndexed: new Date().toISOString(),
      })
      .returning();
    
    logger.info(`Created test project with ID: ${project.id}`);
    
    // Create test files
    await fs.mkdir(this.testProjectPath, { recursive: true });
    
    // Create a TypeScript test file
    const testTsFile = path.join(this.testProjectPath, "api-test.ts");
    await fs.writeFile(testTsFile, `
// API Test TypeScript file
export class APITestClass {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  public async fetchData(endpoint: string): Promise<any> {
    const response = await fetch(endpoint, {
      headers: { 'Authorization': \`Bearer \${this.apiKey}\` }
    });
    return response.json();
  }
}

export interface APIResponse {
  success: boolean;
  data: any;
  error?: string;
}

export const API_VERSION = "1.0.0";
`);
    
    // Index the test project
    const result = await this.indexer.indexProject();
    if (!result.success) {
      throw new Error(`Failed to index test project: ${JSON.stringify(result.errors)}`);
    }
    logger.info(`Indexed ${result.filesIndexed} files for API tests with ${result.symbolsFound} symbols`);
  }

  private async testHealthEndpoint(): Promise<void> {
    const testName = "Health Endpoint";
    logger.info(`Running test: ${testName}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || data.data.status !== "healthy") {
        throw new Error("API reports unhealthy status");
      }

      logger.info(`✅ ${testName} passed`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testProjectEndpoints(): Promise<void> {
    const testName = "Project Endpoints";
    logger.info(`Running test: ${testName}`);

    try {
      // Test list projects
      const listResponse = await fetch(`${this.baseUrl}/api/projects`);
      if (!listResponse.ok) {
        throw new Error(`List projects failed: ${listResponse.status}`);
      }

      const projects = await listResponse.json();
      if (!projects.success || !Array.isArray(projects.data)) {
        throw new Error("Invalid projects response format");
      }

      if (projects.data.length === 0) {
        throw new Error("No projects found after creating test project");
      }

      // Test get project details
      const projectId = projects.data[0].id;
      const detailResponse = await fetch(`${this.baseUrl}/api/projects/${projectId}`);
      if (!detailResponse.ok) {
        throw new Error(`Get project details failed: ${detailResponse.status}`);
      }

      const projectDetail = await detailResponse.json();
      if (!projectDetail.success) {
        throw new Error("Failed to get project details");
      }

      logger.info(`✅ ${testName} passed`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testSymbolEndpoints(): Promise<void> {
    const testName = "Symbol Endpoints";
    logger.info(`Running test: ${testName}`);

    try {
      // Test list symbols
      const response = await fetch(`${this.baseUrl}/api/symbols?limit=10`);
      if (!response.ok) {
        throw new Error(`List symbols failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.data)) {
        throw new Error("Invalid symbols response format");
      }

      if (data.data.length === 0) {
        throw new Error("No symbols found after indexing");
      }

      // Verify we have expected symbols
      const symbolNames = data.data.map((s: any) => s.name);
      if (!symbolNames.includes("APITestClass")) {
        throw new Error(`Expected symbol 'APITestClass' not found. Found: ${symbolNames.join(", ")}`);
      }

      // Test get symbol by ID
      const symbolId = data.data[0].id;
      const detailResponse = await fetch(`${this.baseUrl}/api/symbols/${symbolId}`);
      if (!detailResponse.ok) {
        throw new Error(`Get symbol details failed: ${detailResponse.status}`);
      }

      logger.info(`✅ ${testName} passed - Found ${data.data.length} symbols`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testRelationshipEndpoints(): Promise<void> {
    const testName = "Relationship Endpoints";
    logger.info(`Running test: ${testName}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/relationships?limit=10`);
      if (!response.ok) {
        throw new Error(`List relationships failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.data)) {
        throw new Error("Invalid relationships response format");
      }

      logger.info(`✅ ${testName} passed - Found ${data.data.length} relationships`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testSearchEndpoints(): Promise<void> {
    const testName = "Search Endpoints";
    logger.info(`Running test: ${testName}`);

    try {
      // Test symbol search
      const searchResponse = await fetch(`${this.baseUrl}/api/search/symbols?query=API&limit=5`);
      if (!searchResponse.ok) {
        throw new Error(`Symbol search failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      if (!searchData.success) {
        throw new Error("Search returned unsuccessful response");
      }

      if (!Array.isArray(searchData.data)) {
        throw new Error("Search results should be an array");
      }

      // Test file search
      const fileSearchResponse = await fetch(`${this.baseUrl}/api/search/files?query=.ts&limit=5`);
      if (!fileSearchResponse.ok) {
        throw new Error(`File search failed: ${fileSearchResponse.status}`);
      }

      logger.info(`✅ ${testName} passed`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testSemanticEndpoints(): Promise<void> {
    const testName = "Semantic Endpoints";
    logger.info(`Running test: ${testName}`);

    try {
      // Test semantic insights
      const response = await fetch(`${this.baseUrl}/api/semantic/insights?limit=5`);
      if (!response.ok) {
        throw new Error(`Get semantic insights failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error("Semantic insights returned unsuccessful response");
      }

      logger.info(`✅ ${testName} passed`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async testStatsEndpoints(): Promise<void> {
    const testName = "Stats Endpoints";
    logger.info(`Running test: ${testName}`);

    try {
      // Test overview stats
      const response = await fetch(`${this.baseUrl}/api/stats/overview`);
      if (!response.ok) {
        throw new Error(`Get stats overview failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error("Stats overview returned unsuccessful response");
      }

      // Verify stats structure
      if (typeof data.data.totalProjects !== "number" || 
          typeof data.data.totalSymbols !== "number") {
        throw new Error("Invalid stats structure");
      }

      logger.info(`✅ ${testName} passed`);
    } catch (error) {
      logger.error(`❌ ${testName} failed`, error);
      throw error;
    }
  }

  private async cleanup(): Promise<void> {
    logger.info("Cleaning up test environment");
    
    // Stop the server
    if (this.server) {
      await this.server.stop();
      logger.info("Server stopped");
    }
    
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
      } catch {
        // Ignore if file doesn't exist
      }
    }
  }
}

// Run the tests
async function main() {
  const tester = new APIEndpointsTest();
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