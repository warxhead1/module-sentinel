import { BaseTest } from '../helpers/BaseTest.js';
import { ModuleSentinelMCPServer } from '../../src/index.js';

/**
 * Comprehensive test for all MCP tools to ensure they work with the unified schema
 */
export class ToolsIntegrationTest extends BaseTest {
  protected testName = 'tools-integration';
  private mcpServer!: ModuleSentinelMCPServer;

  async setup(): Promise<void> {
    await super.setup();
    
    // Initialize MCP server with test database
    this.mcpServer = new ModuleSentinelMCPServer();
    await this.mcpServer.initialize();
  }

  async teardown(): Promise<void> {
    await super.teardown();
  }

  async run(): Promise<void> {
    console.log('📋 Test 1: Priority 1 Tools');
    await this.testPriority1Tools();

    console.log('\n📋 Test 2: Priority 2 Tools');
    await this.testPriority2Tools();

    console.log('\n📋 Test 3: Index Management Tools');
    await this.testIndexTools();

    console.log('\n📋 Test 4: Search and Query Tools');
    await this.testSearchTools();

    console.log('\n📋 Test 5: Validation Tools');
    await this.testValidationTools();
  }

  private async testPriority1Tools(): Promise<void> {
    const tools = [
      'find_implementations',
      'find_similar_code', 
      'analyze_cross_file_dependencies'
    ];

    for (const toolName of tools) {
      try {
        console.log(`  Testing ${toolName}...`);
        const result = await this.callTool(toolName, { symbol: 'test' });
        console.log(`    ✅ ${toolName} - OK`);
      } catch (error) {
        console.log(`    ❌ ${toolName} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
  }

  private async testPriority2Tools(): Promise<void> {
    const tools = [
      { name: 'get_api_surface', params: { modulePath: '/test' } },
      { name: 'analyze_impact', params: { symbol: 'test' } },
      { name: 'validate_boundaries', params: { checkType: 'all' } },
      { name: 'suggest_module', params: { functionality: 'test' } }
    ];

    for (const tool of tools) {
      try {
        console.log(`  Testing ${tool.name}...`);
        const result = await this.callTool(tool.name, tool.params);
        console.log(`    ✅ ${tool.name} - OK`);
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
  }

  private async testIndexTools(): Promise<void> {
    const tools = [
      { name: 'index_status', params: {} },
      { name: 'clear_cache', params: {} }
    ];

    for (const tool of tools) {
      try {
        console.log(`  Testing ${tool.name}...`);
        const result = await this.callTool(tool.name, tool.params);
        console.log(`    ✅ ${tool.name} - OK`);
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
  }

  private async testSearchTools(): Promise<void> {
    const tools = [
      { name: 'find_module_for_symbol', params: { symbol: 'test' } },
      { name: 'semantic_search', params: { query: 'test function' } }
    ];

    for (const tool of tools) {
      try {
        console.log(`  Testing ${tool.name}...`);
        const result = await this.callTool(tool.name, tool.params);
        console.log(`    ✅ ${tool.name} - OK`);
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
  }

  private async testValidationTools(): Promise<void> {
    const tools = [
      { name: 'get_validation_stats', params: {} }
    ];

    for (const tool of tools) {
      try {
        console.log(`  Testing ${tool.name}...`);
        const result = await this.callTool(tool.name, tool.params);
        console.log(`    ✅ ${tool.name} - OK`);
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
  }

  private async callTool(name: string, params: any): Promise<any> {
    // Simulate MCP tool call
    const request = {
      params: {
        name,
        arguments: params
      }
    };

    // Call the actual tool handler
    return await (this.mcpServer as any).handleToolCall(request);
  }
}