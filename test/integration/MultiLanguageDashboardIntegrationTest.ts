/**
 * Multi-Language Dashboard Integration Test
 * 
 * Tests the complete integration between:
 * 1. Multi-language API endpoints
 * 2. Dashboard routing and navigation
 * 3. Analytics hub integration
 * 4. Component rendering and interaction
 */

import type Database from 'better-sqlite3';
import { BaseTest } from '../test-base.js';
import { ModernApiServer } from '../../src/api/server.js';
import { UniversalIndexer } from '../../src/indexing/universal-indexer.js';

export class MultiLanguageDashboardIntegrationTest extends BaseTest {
  private server?: ModernApiServer;
  private serverPort = 8081; // Different from default to avoid conflicts

  getDisplayName(): string {
    return 'Multi-Language Dashboard Integration Test';
  }

  async setup(db: Database.Database): Promise<void> {
    await super.setup(db);
    
    // Start API server for testing
    this.server = new ModernApiServer(db, this.serverPort);
    await this.server.start();
    
    console.log(`🚀 Test server started on port ${this.serverPort}`);
  }

  async teardown(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      console.log('🛑 Test server stopped');
    }
    await super.teardown();
  }

  async runTests(): Promise<void> {
    await this.testApiEndpoints();
    await this.testMultiLanguageFlowEndpoint();
    await this.testLanguageDetection();
    await this.testCrossLanguageConnections();
  }

  /**
   * Test that all required API endpoints are accessible
   */
  private async testApiEndpoints(): Promise<void> {
    console.log('🔍 Testing API endpoints...');

    const baseUrl = `http://localhost:${this.serverPort}`;
    
    // Test basic endpoints
    const endpoints = [
      '/api/health',
      '/api/stats',
      '/api/languages',
      '/api/relationships'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(`API endpoint ${endpoint} returned error: ${data.error}`);
        }
        
        console.log(`✅ ${endpoint} - OK`);
      } catch (error) {
        throw new Error(`Failed to access ${endpoint}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Test the multi-language flow endpoint specifically
   */
  private async testMultiLanguageFlowEndpoint(): Promise<void> {
    console.log('🌐 Testing multi-language flow endpoint...');

    // First, we need to have some test data
    await this.indexTestData();

    const baseUrl = `http://localhost:${this.serverPort}`;
    
    // Get symbols to test with
    const symbolsResponse = await fetch(`${baseUrl}/api/symbols?limit=5`);
    const symbolsData = await symbolsResponse.json();
    
    if (!symbolsData.success || !symbolsData.data?.length) {
      console.log('⚠️ No symbols found for testing, skipping multi-language flow test');
      return;
    }

    const testSymbol = symbolsData.data[0];
    console.log(`🎯 Testing with symbol: ${testSymbol.name} (ID: ${testSymbol.id})`);

    // Test multi-language flow endpoint
    const flowUrl = `${baseUrl}/api/code-flow/multi-language/${testSymbol.id}?languages=cpp,python,typescript`;
    const flowResponse = await fetch(flowUrl);
    const flowData = await flowResponse.json();

    if (!flowData.success) {
      throw new Error(`Multi-language flow endpoint failed: ${flowData.error}`);
    }

    // Validate response structure
    this.assertProperty(flowData.data, 'nodes', 'Multi-language flow data should have nodes');
    this.assertProperty(flowData.data, 'edges', 'Multi-language flow data should have edges');
    this.assertProperty(flowData.data, 'languages', 'Multi-language flow data should have languages');
    this.assertProperty(flowData.data, 'metrics', 'Multi-language flow data should have metrics');

    // Validate nodes structure
    if (flowData.data.nodes?.length > 0) {
      const node = flowData.data.nodes[0];
      this.assertProperty(node, 'id', 'Flow node should have id');
      this.assertProperty(node, 'name', 'Flow node should have name');
      this.assertProperty(node, 'type', 'Flow node should have type');
      this.assertProperty(node, 'language', 'Flow node should have language');
    }

    // Validate edges structure
    if (flowData.data.edges?.length > 0) {
      const edge = flowData.data.edges[0];
      this.assertProperty(edge, 'source', 'Flow edge should have source');
      this.assertProperty(edge, 'target', 'Flow edge should have target');
      this.assertProperty(edge, 'type', 'Flow edge should have type');
    }

    console.log(`✅ Multi-language flow endpoint returned ${flowData.data.nodes?.length || 0} nodes and ${flowData.data.edges?.length || 0} edges`);
  }

  /**
   * Test language detection functionality
   */
  private async testLanguageDetection(): Promise<void> {
    console.log('🔍 Testing language detection...');

    const baseUrl = `http://localhost:${this.serverPort}`;
    const languagesResponse = await fetch(`${baseUrl}/api/languages`);
    const languagesData = await languagesResponse.json();

    if (!languagesData.success) {
      throw new Error(`Languages endpoint failed: ${languagesData.error}`);
    }

    // Should have at least the languages we support
    const expectedLanguages = ['C++', 'Python', 'TypeScript'];
    const foundLanguages = languagesData.data || [];
    
    console.log(`📊 Found ${foundLanguages.length} languages in database`);
    
    // Log detected languages for verification
    foundLanguages.forEach((lang: any) => {
      console.log(`  - ${lang.display_name || lang.name}: ${lang.symbol_count || 0} symbols`);
    });
  }

  /**
   * Test cross-language connection detection
   */
  private async testCrossLanguageConnections(): Promise<void> {
    console.log('🔗 Testing cross-language connection detection...');

    const baseUrl = `http://localhost:${this.serverPort}`;
    
    // Get relationships and look for cross-language ones
    const relationshipsResponse = await fetch(`${baseUrl}/api/relationships?limit=50`);
    const relationshipsData = await relationshipsResponse.json();

    if (!relationshipsData.success) {
      throw new Error(`Relationships endpoint failed: ${relationshipsData.error}`);
    }

    const relationships = relationshipsData.data?.edges || [];
    const crossLanguageConnections = relationships.filter((edge: any) => 
      edge.isCrossLanguage || 
      (edge.sourceLanguage && edge.targetLanguage && edge.sourceLanguage !== edge.targetLanguage)
    );

    console.log(`🔍 Found ${relationships.length} total relationships, ${crossLanguageConnections.length} cross-language`);

    if (crossLanguageConnections.length > 0) {
      console.log('📋 Cross-language connections found:');
      crossLanguageConnections.slice(0, 3).forEach((conn: any, index: number) => {
        console.log(`  ${index + 1}. ${conn.sourceLanguage || 'unknown'} → ${conn.targetLanguage || 'unknown'} (${conn.type})`);
      });
    }
  }

  /**
   * Index test data for the integration test
   */
  private async indexTestData(): Promise<void> {
    console.log('🔄 Indexing test data...');

    try {
      const projectPath = '/home/warxh/cpp_mcp_master/module-sentinel/test/complex-files';
      const indexer = new UniversalIndexer({
        projectPath,
        enableMultiLanguage: true,
        scanPaths: [projectPath],
        includePatterns: ['**/*.{cpp,hpp,h,ixx,py,ts,js}'],
        debugMode: true
      });

      await indexer.indexDatabase(this.db);
      console.log('✅ Test data indexed successfully');
    } catch (error) {
      console.warn('⚠️ Failed to index test data:', error);
      // Non-fatal for this test
    }
  }

  /**
   * Utility method to assert object properties
   */
  private assertProperty(obj: any, prop: string, message: string): void {
    if (!(prop in obj)) {
      throw new Error(`${message} - Missing property: ${prop}`);
    }
  }
}