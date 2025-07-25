/**
 * Semantic Intelligence Integration Test
 * 
 * Tests the integration of semantic intelligence into the universal indexer
 * with ACTUAL assertions and expectations.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { UniversalIndexer } from '../../dist/indexing/universal-indexer.js';
import { 
  semanticInsights, 
  semanticClusters, 
  universalSymbols,
  projects,
  languages,
  clusterMembership
} from '../../dist/database/schema/universal.js';
import { eq, and, desc } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TestResult } from '../helpers/JUnitReporter';

export class SemanticIntelligenceIntegrationTest {
  private db: Database.Database;
  private drizzle: ReturnType<typeof drizzle>;
  private testProjectPath: string;
  private tempDir: string;
  private testFiles: Map<string, string> = new Map();

  constructor(db: Database.Database) {
    this.db = db;
    this.drizzle = drizzle(db);
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    try {
      await this.setup();
      
      // Run all test methods
      const testMethods = [
        { name: 'Index with semantic analysis enabled', fn: () => this.testSemanticAnalysisEnabled() },
        { name: 'Verify insights are generated', fn: () => this.testInsightsGeneration() },
        { name: 'Verify clusters are created', fn: () => this.testClusterCreation() },
        { name: 'Verify insight quality and relevance', fn: () => this.testInsightQuality() },
        { name: 'Test with semantic analysis disabled', fn: () => this.testSemanticAnalysisDisabled() },
      ];
      
      for (const test of testMethods) {
        const startTime = Date.now();
        try {
          await test.fn();
          results.push({
            name: test.name,
            status: 'passed',
            time: Date.now() - startTime
          });
        } catch (error) {
          results.push({
            name: test.name,
            status: 'failed',
            time: Date.now() - startTime,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }
      
    } finally {
      await this.cleanup();
    }
    
    return results;
  }
  
  private assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
  
  private assertEquals(actual: any, expected: any, message: string): void {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }
  
  private assertGreaterThan(actual: number, expected: number, message: string): void {
    if (actual <= expected) {
      throw new Error(`${message}: expected > ${expected}, got ${actual}`);
    }
  }
  
  private assertExists(value: any, message: string): void {
    if (value === null || value === undefined) {
      throw new Error(`${message}: value is null or undefined`);
    }
  }
  
  private assertInArray<T>(value: T, array: T[], message: string): void {
    if (!array.includes(value)) {
      throw new Error(`${message}: ${value} not found in [${array.join(', ')}]`);
    }
  }
  
  private assertIsNumber(value: any, message: string): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`${message}: expected number, got ${typeof value}`);
    }
  }
  
  private assertIsString(value: any, message: string): void {
    if (typeof value !== 'string') {
      throw new Error(`${message}: expected string, got ${typeof value}`);
    }
  }
  
  private assertIsArray(value: any, message: string): void {
    if (!Array.isArray(value)) {
      throw new Error(`${message}: expected array, got ${typeof value}`);
    }
  }
  
  private assertInRange(value: number, min: number, max: number, message: string): void {
    if (value < min || value > max) {
      throw new Error(`${message}: expected ${min} <= value <= ${max}, got ${value}`);
    }
  }

  private async setup(): Promise<void> {
    // Create a temporary directory
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-test-'));
    
    // Create a temporary test project directory
    this.testProjectPath = path.join(this.tempDir, 'test-semantic-project');
    await fs.mkdir(this.testProjectPath, { recursive: true });
    
    // Create test files with known patterns and issues
    this.createTestFiles();
    await this.writeTestFiles();
  }

  private createTestFiles(): void {
    // File 1: A class with code duplication
    this.testFiles.set('duplicate_handler.cpp', `
#include <string>
#include <vector>

class EventHandler {
public:
  void handleMouseClick(int x, int y) {
    // Validate coordinates
    if (x < 0 || x > 1920) return;
    if (y < 0 || y > 1080) return;
    
    // Process event
    std::string eventType = "mouse_click";
    logEvent(eventType, x, y);
    updateUI(x, y);
  }
  
  void handleMouseMove(int x, int y) {
    // Validate coordinates - DUPLICATE CODE!
    if (x < 0 || x > 1920) return;
    if (y < 0 || y > 1080) return;
    
    // Process event - SIMILAR PATTERN!
    std::string eventType = "mouse_move";
    logEvent(eventType, x, y);
    updateUI(x, y);
  }
  
  void handleTouchEvent(int x, int y) {
    // Validate coordinates - MORE DUPLICATION!
    if (x < 0 || x > 1920) return;
    if (y < 0 || y > 1080) return;
    
    // Process event - SAME PATTERN AGAIN!
    std::string eventType = "touch";
    logEvent(eventType, x, y);
    updateUI(x, y);
  }
  
private:
  void logEvent(const std::string& type, int x, int y);
  void updateUI(int x, int y);
};
`);

    // File 2: A class with performance issues
    this.testFiles.set('performance_issue.cpp', `
#include <vector>
#include <algorithm>

class DataProcessor {
public:
  // Inefficient nested loops - O(n²) complexity
  std::vector<int> findDuplicates(const std::vector<int>& data) {
    std::vector<int> duplicates;
    
    for (size_t i = 0; i < data.size(); ++i) {
      for (size_t j = i + 1; j < data.size(); ++j) {
        if (data[i] == data[j]) {
          duplicates.push_back(data[i]);
        }
      }
    }
    
    return duplicates;
  }
  
  // String concatenation in loop - performance issue
  std::string buildReport(const std::vector<std::string>& items) {
    std::string result = "";
    for (const auto& item : items) {
      result = result + item + ", ";  // Inefficient!
    }
    return result;
  }
  
  // Unnecessary repeated calculations
  double calculateAverage(const std::vector<double>& values) {
    double sum = 0;
    for (const auto& val : values) {
      sum += val;
    }
    
    // Called multiple times unnecessarily
    return sum / values.size();
  }
};
`);

    // File 3: A class with architectural issues
    this.testFiles.set('god_class.cpp', `
#include <string>
#include <vector>
#include <map>

// God class anti-pattern - too many responsibilities
class ApplicationManager {
public:
  // Database operations
  void connectToDatabase() { /* ... */ }
  void executeQuery(const std::string& sql) { /* ... */ }
  void closeDatabase() { /* ... */ }
  
  // File operations
  void readFile(const std::string& path) { /* ... */ }
  void writeFile(const std::string& path, const std::string& content) { /* ... */ }
  void deleteFile(const std::string& path) { /* ... */ }
  
  // Network operations
  void sendHttpRequest(const std::string& url) { /* ... */ }
  void downloadFile(const std::string& url) { /* ... */ }
  void uploadFile(const std::string& url, const std::string& file) { /* ... */ }
  
  // UI operations
  void showDialog(const std::string& message) { /* ... */ }
  void updateProgressBar(int percent) { /* ... */ }
  void refreshUI() { /* ... */ }
  
  // Business logic
  void processOrder(int orderId) { /* ... */ }
  void calculateTax(double amount) { /* ... */ }
  void generateReport() { /* ... */ }
  
private:
  // Too many member variables for different concerns
  std::string dbConnection;
  std::map<std::string, std::string> cache;
  std::vector<std::string> pendingRequests;
  int uiState;
  double taxRate;
};
`);
  }

  private async writeTestFiles(): Promise<void> {
    for (const [filename, content] of this.testFiles) {
      await fs.writeFile(path.join(this.testProjectPath, filename), content);
    }
  }


  private async testSemanticAnalysisEnabled(): Promise<void> {
    console.log('  Testing: Index project with semantic analysis enabled');

    const indexer = new UniversalIndexer(this.db, {
      projectPath: this.testProjectPath,
      projectName: 'test-semantic-project',
      languages: ['cpp'],
      enableSemanticAnalysis: true,
      enablePatternDetection: true,
      debugMode: false
    });

    const result = await indexer.indexProject();

    // Assert indexing succeeded
    if (!result.success) {
      console.error('    Indexing errors:', result.errors);
    }
    this.assert(result.success === true, `Indexing should succeed. Errors: ${result.errors.join(', ')}`);
    this.assertEquals(result.filesIndexed, 3, 'Should index 3 files');
    this.assertGreaterThan(result.symbolsFound, 0, 'Should find symbols');
    this.assertEquals(result.errors.length, 0, 'Should have no errors');

    console.log('    ✓ Project indexed successfully with semantic analysis');
  }

  private async testInsightsGeneration(): Promise<void> {
    console.log('  Testing: Verify semantic insights are generated');

    // Get project ID
    const [project] = await this.drizzle
      .select()
      .from(projects)
      .where(eq(projects.name, 'test-semantic-project'))
      .limit(1);

    this.assertExists(project, 'Project should exist');

    // Query insights
    const insights = await this.drizzle
      .select()
      .from(semanticInsights)
      .orderBy(desc(semanticInsights.priority));

    // Assert insights were generated
    this.assertGreaterThan(insights.length, 0, 'Should generate insights');
    
    // Check for specific insight types we expect
    const insightTypes = insights.map(i => i.insightType);
    const categories = insights.map(i => i.category);
    
    // We should detect code duplication
    const duplicationInsights = insights.filter(i => 
      i.title.toLowerCase().includes('duplicat') ||
      i.description.toLowerCase().includes('duplicat')
    );
    this.assertGreaterThan(duplicationInsights.length, 0, 'Should detect code duplication');
    
    // We should detect performance issues
    const performanceInsights = insights.filter(i => 
      i.category === 'performance' ||
      i.title.toLowerCase().includes('performance') ||
      i.description.toLowerCase().includes('inefficient')
    );
    this.assertGreaterThan(performanceInsights.length, 0, 'Should detect performance issues');
    
    // We should detect the god class
    const architectureInsights = insights.filter(i => 
      i.category === 'architecture' ||
      i.title.toLowerCase().includes('god class') ||
      i.title.toLowerCase().includes('responsibilities')
    );
    this.assertGreaterThan(architectureInsights.length, 0, 'Should detect god class anti-pattern');

    // Verify insight structure
    for (const insight of insights) {
      this.assertIsNumber(insight.id, 'Insight ID should be a number');
      this.assertIsString(insight.insightType, 'Insight type should be a string');
      this.assertIsString(insight.category, 'Category should be a string');
      this.assertInArray(insight.severity, ['low', 'medium', 'high', 'critical'], 'Invalid severity');
      this.assertIsNumber(insight.confidence, 'Confidence should be a number');
      this.assertInRange(insight.confidence, 0, 1, 'Confidence should be between 0 and 1');
      this.assertIsString(insight.title, 'Title should be a string');
      this.assertIsString(insight.description, 'Description should be a string');
      this.assertIsString(insight.affectedSymbols, 'Affected symbols should be a JSON string');
      
      // Parse and check affected symbols
      const affectedSymbols = JSON.parse(insight.affectedSymbols);
      this.assertIsArray(affectedSymbols, 'Affected symbols should be an array');
    }

    console.log(`    ✓ Generated ${insights.length} insights with proper structure`);
  }

  private async testClusterCreation(): Promise<void> {
    console.log('  Testing: Verify semantic clusters are created');

    // Query clusters
    const clusters = await this.drizzle
      .select()
      .from(semanticClusters)
      .orderBy(desc(semanticClusters.quality));

    // Assert clusters were created
    this.assertGreaterThan(clusters.length, 0, 'Should create clusters');

    // We should have a cluster for the duplicate event handlers
    const similarMethodCluster = clusters.find(c => 
      c.clusterName.includes('Event') || 
      c.clusterName.includes('Handler') ||
      c.clusterType === 'similar_implementation'
    );
    this.assertExists(similarMethodCluster, 'Should have cluster for similar event handlers');

    // Verify cluster structure
    for (const cluster of clusters) {
      this.assertIsNumber(cluster.id, 'Cluster ID should be a number');
      this.assertIsString(cluster.clusterName, 'Cluster name should be a string');
      this.assertIsString(cluster.clusterType, 'Cluster type should be a string');
      this.assertIsNumber(cluster.quality, 'Cluster quality should be a number');
      this.assertInRange(cluster.quality, 0, 1, 'Cluster quality should be between 0 and 1');
      this.assertIsNumber(cluster.symbolCount, 'Symbol count should be a number');
      this.assertGreaterThan(cluster.symbolCount, 0, 'Cluster should have symbols');
      this.assertIsNumber(cluster.similarityThreshold, 'Similarity threshold should be a number');
      
      // Check cluster members
      const members = await this.drizzle
        .select()
        .from(clusterMembership)
        .where(eq(clusterMembership.clusterId, cluster.id));
      
      this.assertEquals(members.length, cluster.symbolCount, 'Member count should match symbol count');
      
      // Each member should have valid data
      for (const member of members) {
        this.assertIsNumber(member.symbolId, 'Member symbol ID should be a number');
        this.assertIsNumber(member.similarity, 'Member similarity should be a number');
        this.assertInRange(member.similarity, 0, 1, 'Member similarity should be between 0 and 1');
        this.assertInArray(member.role, ['primary', 'member'], 'Invalid member role');
      }
    }

    console.log(`    ✓ Created ${clusters.length} semantic clusters with valid members`);
  }

  private async testInsightQuality(): Promise<void> {
    console.log('  Testing: Verify insight quality and relevance');

    const insights = await this.drizzle
      .select()
      .from(semanticInsights)
      .orderBy(desc(semanticInsights.confidence));

    // Check high-confidence insights
    const highConfidenceInsights = insights.filter(i => i.confidence >= 0.8);
    this.assertGreaterThan(highConfidenceInsights.length, 0, 'Should have high-confidence insights');

    // Verify specific expected insights
    
    // 1. Should detect the coordinate validation duplication
    const coordinateValidationInsight = insights.find(i => 
      i.description.toLowerCase().includes('coordinate') ||
      i.description.toLowerCase().includes('validation') ||
      i.description.toLowerCase().includes('x < 0 || x > 1920')
    );
    this.assertExists(coordinateValidationInsight, 'Should detect coordinate validation duplication');
    if (coordinateValidationInsight) {
      this.assertInArray(coordinateValidationInsight.severity, ['medium', 'high'], 'Duplication severity should be medium or high');
      const affected = JSON.parse(coordinateValidationInsight.affectedSymbols);
      this.assert(affected.length >= 2, 'Should affect multiple methods');
    }

    // 2. Should detect the O(n²) complexity issue
    const complexityInsight = insights.find(i => 
      i.description.toLowerCase().includes('nested loop') ||
      i.description.toLowerCase().includes('o(n') ||
      i.description.toLowerCase().includes('findduplicates')
    );
    this.assertExists(complexityInsight, 'Should detect O(n²) complexity issue');
    if (complexityInsight) {
      this.assertEquals(complexityInsight.category, 'performance', 'Complexity issue should be in performance category');
      this.assertInArray(complexityInsight.severity, ['high', 'critical'], 'Complexity issue severity should be high or critical');
    }

    // 3. Should detect the god class anti-pattern
    const godClassInsight = insights.find(i => 
      i.description.toLowerCase().includes('applicationmanager') ||
      i.description.toLowerCase().includes('too many responsibilities') ||
      i.description.toLowerCase().includes('god class')
    );
    this.assertExists(godClassInsight, 'Should detect god class anti-pattern');
    if (godClassInsight) {
      this.assertEquals(godClassInsight.category, 'architecture', 'God class should be in architecture category');
      this.assertInArray(godClassInsight.severity, ['high', 'critical'], 'God class severity should be high or critical');
    }

    console.log('    ✓ Insights demonstrate high quality and relevance to code issues');
  }

  private async testSemanticAnalysisDisabled(): Promise<void> {
    console.log('  Testing: Verify semantic analysis can be disabled');

    // Create a new test project
    const disabledProjectPath = path.join(this.tempDir, 'test-disabled-project');
    await fs.mkdir(disabledProjectPath, { recursive: true });
    
    // Copy one test file
    await fs.copyFile(
      path.join(this.testProjectPath, 'god_class.cpp'),
      path.join(disabledProjectPath, 'god_class.cpp')
    );

    const indexer = new UniversalIndexer(this.db, {
      projectPath: disabledProjectPath,
      projectName: 'test-disabled-project',
      languages: ['cpp'],
      enableSemanticAnalysis: false, // Disabled!
      enablePatternDetection: false,
      debugMode: false
    });

    const result = await indexer.indexProject();

    // Assert indexing still works
    this.assert(result.success === true, 'Indexing should succeed even with semantic analysis disabled');
    this.assertEquals(result.filesIndexed, 1, 'Should index 1 file');
    this.assertGreaterThan(result.symbolsFound, 0, 'Should still find symbols');

    // Get project ID
    const [project] = await this.drizzle
      .select()
      .from(projects)
      .where(eq(projects.name, 'test-disabled-project'))
      .limit(1);

    // Query insights - should be none for this project
    const insights = await this.drizzle
      .select()
      .from(semanticInsights)
      .where(eq(semanticInsights.projectId, project.id));

    this.assertEquals(insights.length, 0, 'Should generate no insights when semantic analysis is disabled');

    console.log('    ✓ Semantic analysis can be properly disabled');
  }

  private async cleanup(): Promise<void> {
    // Clean up test files
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    }
  }
}