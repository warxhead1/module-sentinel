import { BaseTest } from '../helpers/BaseTest';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';

export class APIEndpointsTest extends BaseTest {
  private dashboardProcess: ChildProcess | null = null;
  private readonly port = 8081;
  private readonly baseUrl = `http://localhost:${this.port}`;

  constructor() {
    super('api-endpoints');
  }

  async specificSetup(): Promise<void> {
    await this.startDashboard();
    await this.waitForDashboard();
  }

  async specificTeardown(): Promise<void> {
    if (this.dashboardProcess) {
      this.dashboardProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async run(): Promise<void> {
    await this.testStatsEndpoint();
    await this.testPatternsEndpoint();
    await this.testNamespacesEndpoint();
    await this.testSearchEndpoint();
    await this.testSymbolsEndpoint();
    await this.testRelationshipEndpoints();
    await this.testPerformanceAnalysisEndpoint();
  }

  private async startDashboard(): Promise<void> {
    const serverPath = path.join(__dirname, '../../start-enhanced-dashboard.ts');
    this.dashboardProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development' }
    });

    this.dashboardProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('DeprecationWarning')) {
        console.error('Dashboard error:', msg);
      }
    });
  }

  private async waitForDashboard(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      try {
        await this.makeRequest('/api/stats');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Dashboard failed to start within 30 seconds');
  }

  private async makeRequest(endpoint: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const req = http.get(`${this.baseUrl}${endpoint}`, (res) => {
        let data = '';
        
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            resolve({ data: parsed, responseTime });
          } catch (error) {
            reject(new Error(`Invalid JSON: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  private async testStatsEndpoint(): Promise<void> {
    const { data, responseTime } = await this.makeRequest('/api/stats');
    
    // ASSERTIONS: Verify stats endpoint returns valid data
    this.assertExists(data.totalSymbols, "Stats should have totalSymbols");
    this.assertExists(data.totalFiles, "Stats should have totalFiles");
    this.assertExists(data.totalRelationships, "Stats should have totalRelationships");
    this.assertExists(data.semanticCoverage, "Stats should have semanticCoverage");
    
    this.assertGreaterThan(data.totalSymbols, 100, "Should have >100 symbols indexed");
    this.assertGreaterThan(data.totalFiles, 5, "Should have >5 files analyzed");
    this.assertGreaterEqual(data.totalRelationships, 0, "Relationships should be >= 0");
    this.assert(data.semanticCoverage.includes('%'), "Semantic coverage should include %");
    
    this.assertLessThan(responseTime, 1000, "Stats endpoint should respond in <1s");
  }

  private async testPatternsEndpoint(): Promise<void> {
    const { data, responseTime } = await this.makeRequest('/api/patterns');
    
    // ASSERTIONS: Verify patterns endpoint structure
    this.assertExists(data.goodPatterns, "Should have goodPatterns array");
    this.assert(Array.isArray(data.goodPatterns), "goodPatterns should be an array");
    this.assertExists(data.antiPatterns, "Should have antiPatterns array");
    this.assert(Array.isArray(data.antiPatterns), "antiPatterns should be an array");
    
    // Verify pattern structure if any exist
    if (data.goodPatterns.length > 0) {
      const pattern = data.goodPatterns[0];
      this.assertExists(pattern.name, "Pattern should have name");
      this.assertExists(pattern.count, "Pattern should have count");
      this.assertGreaterThan(pattern.count, 0, "Pattern count should be >0");
    }
    
    this.assertLessThan(responseTime, 1000, "Patterns endpoint should respond in <1s");
  }

  private async testNamespacesEndpoint(): Promise<void> {
    const { data, responseTime } = await this.makeRequest('/api/namespaces');
    
    // ASSERTIONS: Verify namespaces endpoint
    this.assertExists(data.tree, "Should have namespace tree");
    this.assertExists(data.total, "Should have total count");
    this.assertGreaterEqual(data.total, 0, "Total namespaces should be >= 0");
    
    // Verify tree structure
    if (data.tree && Object.keys(data.tree).length > 0) {
      const firstNamespace = Object.values(data.tree)[0] as any;
      this.assertExists(firstNamespace.symbolCount, "Namespace node should have symbolCount");
      this.assertExists(firstNamespace.name, "Namespace node should have name");
      this.assertExists(firstNamespace.fullPath, "Namespace node should have fullPath");
      this.assertExists(firstNamespace.children, "Namespace node should have children");
      this.assertGreaterEqual(firstNamespace.symbolCount, 0, "Symbol count should be >= 0");
    }
    
    this.assertLessThan(responseTime, 1000, "Namespaces endpoint should respond in <1s");
  }

  private async testSearchEndpoint(): Promise<void> {
    const { data, responseTime } = await this.makeRequest('/api/search?q=BindPipeline&type=all');
    
    // ASSERTIONS: Verify search endpoint
    this.assertExists(data.results, "Search should return results");
    this.assert(Array.isArray(data.results), "Results should be an array");
    this.assertExists(data.total, "Search should have total count");
    this.assertGreaterEqual(data.total, 0, "Total results should be >= 0");
    
    // Verify result structure if any exist
    if (data.results.length > 0) {
      const result = data.results[0];
      this.assertExists(result.name, "Search result should have name");
      this.assertExists(result.kind, "Search result should have kind");
      this.assertExists(result.file_path, "Search result should have file_path");
    }
    
    this.assertLessThan(responseTime, 2000, "Search endpoint should respond in <2s");
  }

  private async testSymbolsEndpoint(): Promise<void> {
    const { data, responseTime } = await this.makeRequest('/api/symbols?limit=10');
    
    // ASSERTIONS: Verify symbols endpoint
    this.assert(Array.isArray(data), "Symbols endpoint should return an array");
    this.assertGreaterEqual(data.length, 0, "Should return >= 0 symbols");
    this.assertLessThan(data.length, 11, "Should respect limit parameter");
    
    // Verify symbol structure if any exist
    if (data.length > 0) {
      const symbol = data[0];
      this.assertExists(symbol.id, "Symbol should have id");
      this.assertExists(symbol.name, "Symbol should have name");
      this.assertExists(symbol.kind, "Symbol should have kind");
      this.assertExists(symbol.file_path, "Symbol should have file_path");
    }
    
    this.assertLessThan(responseTime, 1000, "Symbols endpoint should respond in <1s");
  }

  private async testRelationshipEndpoints(): Promise<void> {
    // Test relationship types endpoint
    const { data: types, responseTime: typesTime } = await this.makeRequest('/api/relationships/types');
    
    this.assert(Array.isArray(types), "Relationship types should be an array");
    this.assertGreaterThan(types.length, 0, "Should have at least one relationship type");
    this.assertLessThan(typesTime, 500, "Types endpoint should respond in <500ms");
    
    // Test relationship graph endpoint
    const { data: graph, responseTime: graphTime } = await this.makeRequest('/api/relationships/graph?symbolId=1');
    
    this.assertExists(graph.nodes, "Graph should have nodes");
    this.assertExists(graph.edges, "Graph should have edges");
    this.assert(Array.isArray(graph.nodes), "Nodes should be an array");
    this.assert(Array.isArray(graph.edges), "Edges should be an array");
    this.assertLessThan(graphTime, 2000, "Graph endpoint should respond in <2s");
  }

  private async testPerformanceAnalysisEndpoint(): Promise<void> {
    const { data, responseTime } = await this.makeRequest('/api/performance/analysis');
    
    // ASSERTIONS: Verify performance analysis endpoint
    this.assertExists(data.patterns, "Should have patterns");
    this.assert(Array.isArray(data.patterns), "Patterns should be an array");
    
    // Check pattern categories
    const categories = ['gpu_intensive', 'cpu_bottlenecks', 'memory_issues', 'io_operations'];
    for (const category of categories) {
      this.assertExists(data.patterns.find((p: any) => p.category === category), 
        `Should have ${category} pattern category`);
    }
    
    this.assertLessThan(responseTime, 3000, "Performance analysis should complete in <3s");
  }
}