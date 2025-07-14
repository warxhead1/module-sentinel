import { BaseTest } from '../helpers/BaseTest.js';
import { Priority1Tools } from '../../src/tools/priority-1-tools.js';
import { Priority2Tools } from '../../src/tools/priority-2-tools.js';
import { AnalyticsService } from '../../src/services/analytics-service.js';
import Database from 'better-sqlite3';

/**
 * Simple direct test of tool functionality without full MCP server
 */
export class SimpleToolTest extends BaseTest {
  protected testName = 'simple-tool-test';
  // Use production database for testing
  protected dbPath = 'module-sentinel.db';

  constructor() {
    super('simple-tool-test');
  }

  async specificSetup(): Promise<void> {
    // No setup needed - use production DB
  }

  async specificTeardown(): Promise<void> {
    // No teardown needed - don't modify production DB
  }

  async run(): Promise<void> {
    console.log('📋 Test 1: Database Schema Compatibility');
    await this.testSchemaCompatibility();

    console.log('\n📋 Test 2: Priority 1 Tools');
    await this.testPriority1Tools();

    console.log('\n📋 Test 3: Priority 2 Tools');  
    await this.testPriority2Tools();

    console.log('\n📋 Test 4: Analytics Service');
    await this.testAnalyticsService();
  }

  private async testSchemaCompatibility(): Promise<void> {
    try {
      const db = new Database(this.dbPath);
      
      // Test that expected tables exist
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      const tableNames = tables.map(t => t.name);
      
      console.log(`  Found ${tableNames.length} tables in database`);
      
      const requiredTables = ['enhanced_symbols', 'symbol_relationships', 'indexed_files'];
      for (const table of requiredTables) {
        if (tableNames.includes(table)) {
          console.log(`    ✅ ${table} - OK`);
        } else {
          console.log(`    ❌ ${table} - MISSING`);
          throw new Error(`Required table ${table} is missing`);
        }
      }

      // Test schema compatibility
      const symbolCount = db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols").get() as any;
      console.log(`    📊 ${symbolCount.count} symbols in enhanced_symbols`);

      const relCount = db.prepare("SELECT COUNT(*) as count FROM symbol_relationships").get() as any;
      console.log(`    🔗 ${relCount.count} relationships in symbol_relationships`);

      db.close();
    } catch (error) {
      console.log(`    ❌ Schema test failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async testPriority1Tools(): Promise<void> {
    try {
      const db = new Database(this.dbPath);
      const tools = new Priority1Tools(db);
      
      // Test find_implementations with a symbol that might exist
      console.log('  Testing find_implementations...');
      const result1 = await tools.findImplementations({
        functionality: 'VulkanResourceManager',
        keywords: ['Vulkan', 'Resource', 'Manager'],
        returnType: undefined
      });
      console.log(`    ✅ find_implementations returned ${result1.exact_matches?.length || 0} exact + ${result1.similar_implementations?.length || 0} similar results`);
      
      // Test find_similar_code
      console.log('  Testing find_similar_code...');
      const result2 = await tools.findSimilarCode({
        pattern: 'createBuffer',
        threshold: 0.7,
        context: 'buffer creation'
      });
      console.log(`    ✅ find_similar_code returned ${result2.similar_patterns?.length || 0} results`);
      
      // Test analyze_cross_file_dependencies  
      console.log('  Testing analyze_cross_file_dependencies...');
      const result3 = await tools.analyzeCrossFileDependencies({
        symbolName: 'VulkanResourceManager',
        analysisType: 'symbol',
        includeUsageDetails: true
      });
      console.log(`    ✅ analyze_cross_file_dependencies returned analysis for ${result3.requestedSymbol}`);
      
      db.close();
    } catch (error) {
      console.log(`    ❌ Priority1Tools failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async testPriority2Tools(): Promise<void> {
    try {
      const db = new Database(this.dbPath);  
      const tools = new Priority2Tools(db);
      
      // Test validate_boundaries
      console.log('  Testing validate_boundaries...');
      const result1 = await tools.validateBoundaries({ checkType: 'all' });
      console.log(`    ✅ validate_boundaries returned ${result1.violations?.length || 0} violations`);
      
      // Test get_api_surface
      console.log('  Testing get_api_surface...');
      const result2 = await tools.getApiSurface({ modulePath: '/test' });
      console.log(`    ✅ get_api_surface completed`);
      
      db.close();
    } catch (error) {
      console.log(`    ❌ Priority2Tools failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private async testAnalyticsService(): Promise<void> {
    try {
      const db = new Database(this.dbPath);
      const analytics = new AnalyticsService(db);
      
      // Test getIndexStats (this was failing before)
      console.log('  Testing getIndexStats...');
      const stats = await analytics.getIndexStats();
      console.log(`    ✅ getIndexStats returned ${stats.overview.totalSymbols} total symbols`);
      console.log(`    📊 Parser breakdown: clang=${stats.byParser.clang.symbols}, treeSitter=${stats.byParser.treeSitter.symbols}, streaming=${stats.byParser.streaming.symbols}`);
      
      db.close();
    } catch (error) {
      console.log(`    ❌ AnalyticsService failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  const test = new SimpleToolTest();
  test.execute().catch(console.error);
}