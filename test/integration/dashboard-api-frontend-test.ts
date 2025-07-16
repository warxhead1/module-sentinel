#!/usr/bin/env tsx
/**
 * Dashboard API Frontend Simulation Test
 * 
 * Tests the API endpoints as they would be called from the frontend
 * to ensure proper error handling and response formats.
 */

import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';

interface TestResult {
  test: string;
  success: boolean;
  error?: string;
  details?: any;
}

class DashboardAPIFrontendTester {
  private dashboardProcess: ChildProcess | null = null;
  private readonly port = 8081;
  private readonly baseUrl = `http://localhost:${this.port}`;
  private results: TestResult[] = [];

  async runAllTests(): Promise<boolean> {
    console.log('Dashboard API Frontend Simulation Test\n');

    try {
      await this.startDashboard();
      await this.waitForDashboard();
      
      console.log('Testing API calls as made from frontend...\n');
      
      // Test API calls in the order the frontend makes them
      await this.testInitialPageLoad();
      await this.testNamespaceLoading();
      await this.testStatsLoading();
      await this.testRelationshipTypesLoading();
      await this.testViewSwitching();
      await this.testSearchFunctionality();
      await this.testPatternAnalysis();
      await this.testImmersiveModalAPI();
      
      // Test error scenarios
      await this.testErrorScenarios();
      
      // Print summary
      this.printTestSummary();
      
      return this.allTestsPassed();
      
    } finally {
      await this.stopDashboard();
    }
  }

  private async startDashboard(): Promise<void> {
    console.log('Starting dashboard server...');
    
    const serverPath = path.join(__dirname, '../../start-enhanced-dashboard.ts');
    this.dashboardProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    });

    this.dashboardProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Module Sentinel Dashboard Ready!')) {
        console.log('✓ Dashboard server started');
      }
    });

    this.dashboardProcess.stderr?.on('data', (data) => {
      const stderr = data.toString();
      if (!stderr.includes('DeprecationWarning')) {
        console.error('Dashboard stderr:', stderr);
      }
    });
  }

  private async waitForDashboard(): Promise<void> {
    console.log('Waiting for dashboard to be ready...');
    
    for (let i = 0; i < 30; i++) {
      try {
        const response = await this.makeRequest('/api/stats');
        if (response.data) {
          console.log('✓ Dashboard is ready');
          return;
        }
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Dashboard failed to start within 30 seconds');
  }

  private async stopDashboard(): Promise<void> {
    if (this.dashboardProcess) {
      console.log('\nStopping dashboard server...');
      this.dashboardProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  private async makeRequest(endpoint: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const req = http.get(`${this.baseUrl}${endpoint}`, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          
          try {
            // Check if it's JSON
            if (res.headers['content-type']?.includes('application/json')) {
              const parsed = JSON.parse(data);
              resolve({ data: parsed, responseTime, status: res.statusCode });
            } else {
              resolve({ data, responseTime, status: res.statusCode });
            }
          } catch (error) {
            // Return raw data if not JSON
            resolve({ data, responseTime, status: res.statusCode });
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

  private async testInitialPageLoad(): Promise<void> {
    try {
      // Test loading the main dashboard HTML
      const response = await this.makeRequest('/dashboard/unified-dashboard.html');
      
      if (response.status !== 200) {
        throw new Error(`Dashboard HTML returned ${response.status}`);
      }
      
      // Check if HTML contains expected elements
      const html = response.data;
      if (!html.includes('dashboard-container')) {
        throw new Error('Dashboard HTML missing essential elements');
      }
      
      // Test favicon to prevent 404
      const faviconResponse = await this.makeRequest('/favicon.ico');
      if (faviconResponse.status !== 200) {
        throw new Error(`Favicon returned ${faviconResponse.status}`);
      }
      
      this.results.push({
        test: 'Initial page load',
        success: true,
        details: 'Dashboard HTML and favicon load successfully'
      });
      
      console.log('✓ Initial page load - Dashboard HTML loads correctly');
      
    } catch (error) {
      this.results.push({
        test: 'Initial page load',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Initial page load failed:', error);
    }
  }

  private async testStatsLoading(): Promise<void> {
    try {
      // This is called by loadStats() in the frontend
      const response = await this.makeRequest('/api/stats');
      
      if (response.status !== 200) {
        throw new Error(`Stats API returned ${response.status}`);
      }
      
      const stats = response.data;
      
      // Validate the response matches what frontend expects
      if (typeof stats.totalSymbols !== 'number') {
        throw new Error('Stats missing totalSymbols');
      }
      if (typeof stats.totalFiles !== 'number') {
        throw new Error('Stats missing totalFiles');
      }
      if (typeof stats.totalRelationships !== 'number') {
        throw new Error('Stats missing totalRelationships');
      }
      if (!stats.semanticCoverage || !stats.semanticCoverage.includes('%')) {
        throw new Error('Stats missing or invalid semanticCoverage');
      }
      
      this.results.push({
        test: 'Stats loading',
        success: true,
        details: `Loaded stats: ${stats.totalSymbols} symbols, ${stats.totalFiles} files`
      });
      
      console.log('✓ Stats loading - API returns valid stats data');
      
    } catch (error) {
      this.results.push({
        test: 'Stats loading',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Stats loading failed:', error);
    }
  }

  private async testNamespaceLoading(): Promise<void> {
    try {
      // This is called in the namespace loading IIFE
      const response = await this.makeRequest('/api/namespaces');
      
      if (response.status !== 200) {
        throw new Error(`Namespaces API returned ${response.status}`);
      }
      
      const data = response.data;
      
      // Validate the response structure
      if (!data.tree || typeof data.tree !== 'object') {
        throw new Error('Namespaces response missing tree structure');
      }
      
      // The frontend expects to flatten the tree
      const flattenNamespaceTree = (tree: any, result: any[] = []): any[] => {
        Object.values(tree).forEach((node: any) => {
          if (node.fullPath && node.symbolCount > 0) {
            result.push({
              namespace: node.fullPath,
              count: node.symbolCount
            });
          }
          if (node.children) {
            flattenNamespaceTree(node.children, result);
          }
        });
        return result;
      };
      
      const namespaceData = flattenNamespaceTree(data.tree);
      
      if (namespaceData.length === 0) {
        throw new Error('No namespaces found in tree');
      }
      
      this.results.push({
        test: 'Namespace loading',
        success: true,
        details: `Loaded ${namespaceData.length} namespaces`
      });
      
      console.log('✓ Namespace loading - API returns valid namespace tree');
      
    } catch (error) {
      this.results.push({
        test: 'Namespace loading',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Namespace loading failed:', error);
    }
  }

  private async testRelationshipTypesLoading(): Promise<void> {
    try {
      // This is called for the relationship chart
      const response = await this.makeRequest('/api/relationship-types');
      
      if (response.status !== 200) {
        throw new Error(`Relationship types API returned ${response.status}`);
      }
      
      const types = response.data;
      
      if (!Array.isArray(types)) {
        throw new Error('Relationship types should be an array');
      }
      
      // Frontend expects each item to have type and count
      types.forEach((item, index) => {
        if (!item.type || typeof item.count !== 'number') {
          throw new Error(`Invalid relationship type at index ${index}`);
        }
      });
      
      this.results.push({
        test: 'Relationship types loading',
        success: true,
        details: `Loaded ${types.length} relationship types`
      });
      
      console.log('✓ Relationship types loading - API returns valid data');
      
    } catch (error) {
      this.results.push({
        test: 'Relationship types loading',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Relationship types loading failed:', error);
    }
  }

  private async testViewSwitching(): Promise<void> {
    try {
      // Test loading different view data
      
      // Code flow view
      const flowResponse = await this.makeRequest('/api/trace-flow?symbol=main&depth=3');
      if (flowResponse.status !== 200 || !flowResponse.data.nodes || !flowResponse.data.edges) {
        throw new Error('Code flow API failed');
      }
      
      // Patterns view
      const patternsResponse = await this.makeRequest('/api/patterns');
      if (patternsResponse.status !== 200 || !patternsResponse.data.goodPatterns || !patternsResponse.data.antiPatterns) {
        throw new Error('Patterns API failed');
      }
      
      // Performance view
      const perfResponse = await this.makeRequest('/api/performance-analysis');
      if (perfResponse.status !== 200) {
        throw new Error('Performance API failed');
      }
      
      this.results.push({
        test: 'View switching APIs',
        success: true,
        details: 'All view APIs respond correctly'
      });
      
      console.log('✓ View switching - All view APIs work correctly');
      
    } catch (error) {
      this.results.push({
        test: 'View switching APIs',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ View switching failed:', error);
    }
  }

  private async testSearchFunctionality(): Promise<void> {
    try {
      // Test search as called from frontend
      const response = await this.makeRequest('/api/search?q=Pipeline');
      
      if (response.status !== 200) {
        throw new Error(`Search API returned ${response.status}`);
      }
      
      const results = response.data;
      
      if (!Array.isArray(results)) {
        throw new Error('Search should return an array');
      }
      
      // If there are results, validate structure
      if (results.length > 0) {
        const required = ['id', 'name', 'type', 'file', 'line'];
        const missing = required.filter(field => !(field in results[0]));
        
        if (missing.length > 0) {
          throw new Error(`Search results missing fields: ${missing.join(', ')}`);
        }
      }
      
      this.results.push({
        test: 'Search functionality',
        success: true,
        details: `Search returned ${results.length} results`
      });
      
      console.log('✓ Search functionality - API returns valid results');
      
    } catch (error) {
      this.results.push({
        test: 'Search functionality',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Search functionality failed:', error);
    }
  }

  private async testPatternAnalysis(): Promise<void> {
    try {
      const response = await this.makeRequest('/api/patterns');
      
      if (response.status !== 200) {
        throw new Error(`Patterns API returned ${response.status}`);
      }
      
      const data = response.data;
      
      // Frontend expects these structures
      if (!Array.isArray(data.goodPatterns)) {
        throw new Error('goodPatterns should be an array');
      }
      
      if (!Array.isArray(data.antiPatterns)) {
        throw new Error('antiPatterns should be an array');
      }
      
      if (data.suggestions && !Array.isArray(data.suggestions)) {
        throw new Error('suggestions should be an array');
      }
      
      // Validate pattern structure if any exist
      if (data.goodPatterns.length > 0) {
        const pattern = data.goodPatterns[0];
        if (!pattern.name || typeof pattern.count !== 'number') {
          throw new Error('Invalid good pattern structure');
        }
      }
      
      this.results.push({
        test: 'Pattern analysis',
        success: true,
        details: `${data.goodPatterns.length} good, ${data.antiPatterns.length} anti-patterns`
      });
      
      console.log('✓ Pattern analysis - API returns valid pattern data');
      
    } catch (error) {
      this.results.push({
        test: 'Pattern analysis',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Pattern analysis failed:', error);
    }
  }

  private async testImmersiveModalAPI(): Promise<void> {
    try {
      // Test the trace-flow endpoint as called by immersive modal
      const testSymbols = [
        'namespace-PlanetGen--Rendering',
        'namespaces-overview',
        'Pipeline'
      ];
      
      for (const symbol of testSymbols) {
        const response = await this.makeRequest(`/api/trace-flow?symbol=${encodeURIComponent(symbol)}&depth=3`);
        
        if (response.status !== 200) {
          throw new Error(`Trace flow API returned ${response.status} for symbol: ${symbol}`);
        }
        
        const data = response.data;
        
        // Validate the response structure that immersive modal expects
        if (!data.nodes || !Array.isArray(data.nodes)) {
          throw new Error(`Trace flow missing nodes array for symbol: ${symbol}`);
        }
        
        if (!data.edges || !Array.isArray(data.edges)) {
          throw new Error(`Trace flow missing edges array for symbol: ${symbol}`);
        }
      }
      
      this.results.push({
        test: 'Immersive modal API',
        success: true,
        details: 'Trace flow API works for namespace symbols'
      });
      
      console.log('✓ Immersive modal API - Trace flow works correctly');
      
    } catch (error) {
      this.results.push({
        test: 'Immersive modal API',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Immersive modal API failed:', error);
    }
  }

  private async testErrorScenarios(): Promise<void> {
    try {
      // Test 404 handling
      const notFoundResponse = await this.makeRequest('/api/nonexistent');
      if (notFoundResponse.status !== 404) {
        throw new Error('404 handling not working');
      }
      
      // Test malformed query
      const badQueryResponse = await this.makeRequest('/api/search?q=');
      // Should still return 200 with empty results
      if (badQueryResponse.status !== 200) {
        throw new Error('Empty query handling failed');
      }
      
      this.results.push({
        test: 'Error scenarios',
        success: true,
        details: 'Error handling works correctly'
      });
      
      console.log('✓ Error scenarios - Errors handled gracefully');
      
    } catch (error) {
      this.results.push({
        test: 'Error scenarios',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Error scenarios failed:', error);
    }
  }

  private printTestSummary(): void {
    console.log('\nAPI Frontend Simulation Summary\n');
    console.log('='.repeat(60));
    
    const successful = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const successRate = ((successful / total) * 100).toFixed(1);
    
    console.log(`Overall Success Rate: ${successful}/${total} (${successRate}%)\n`);
    
    this.results.forEach(result => {
      const status = result.success ? '✓' : '✗';
      const details = result.success ? result.details : result.error;
      
      console.log(`${status} ${result.test.padEnd(30)} ${details || ''}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (successful === total) {
      console.log('All API frontend tests passed!');
    } else {
      console.log(`${total - successful} test(s) failed`);
      
      // Provide debugging hints
      console.log('\nDebugging hints:');
      console.log('- Check if the database has been properly indexed');
      console.log('- Ensure semantic_connections table exists');
      console.log('- Verify the server is using the correct database path');
    }
  }

  private allTestsPassed(): boolean {
    return this.results.every(result => result.success);
  }
}

// Run the test
async function runAPIFrontendTests(): Promise<void> {
  const tester = new DashboardAPIFrontendTester();
  
  try {
    const success = await tester.runAllTests();
    
    if (!success) {
      console.log('\n❌ API frontend tests failed');
      process.exit(1);
    }
    
    console.log('\n✅ API frontend tests passed');
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Test runner failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAPIFrontendTests().catch(console.error);
}

export { DashboardAPIFrontendTester };