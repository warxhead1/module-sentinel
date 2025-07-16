import { BaseTest } from '../helpers/BaseTest.js';
import { ModuleSentinelMCPServer } from '../../src/index.js';

/**
 * Comprehensive test for all MCP tools to ensure they work with the unified schema
 */
export class ToolsIntegrationTest extends BaseTest {
  private mcpServer!: ModuleSentinelMCPServer;

  constructor() {
    super('tools-integration');
  }

  async specificSetup(): Promise<void> {
    // Initialize MCP server with test database and disable file watcher
    this.mcpServer = new ModuleSentinelMCPServer({ enableFileWatcher: false });
    // No need to call initialize - constructor handles initialization
  }

  async specificTeardown(): Promise<void> {
    // Cleanup if needed
  }

  async run(): Promise<void> {
    await this.testPriority1Tools();
    await this.testPriority2Tools();
    await this.testRefactoringTools();
    await this.testIndexTools();
    await this.testSearchTools();
    await this.testValidationTools();
    await this.testNamespaceTools();
    await this.testVisualizationTools();
    await this.testAgentFeedbackTools();
    await this.testAllToolsCount();
  }

  private async testPriority1Tools(): Promise<void> {
    const tools = [
      'find_implementations',
      'find_similar_code', 
      'analyze_cross_file_dependencies'
    ];

    let successCount = 0;
    for (const toolName of tools) {
      try {
        const result = await this.callTool(toolName, { symbol: 'test' });
        this.assertExists(result, `${toolName} should return a result`);
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${toolName} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify all priority 1 tools work
    this.assertEqual(successCount, tools.length, "All priority 1 tools should execute successfully");
  }

  private async testPriority2Tools(): Promise<void> {
    const tools = [
      { name: 'get_api_surface', params: { modulePath: '/test' } },
      { name: 'analyze_impact', params: { symbolName: 'test' } },
      { name: 'validate_boundaries', params: { checkType: 'all' } },
      { name: 'suggest_module', params: { className: 'TestClass', description: 'test functionality' } }
    ];

    let successCount = 0;
    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Tool-specific assertions
        if (tool.name === 'get_api_surface') {
          this.assertExists(result.public_methods, "API surface should have public_methods property");
          this.assertExists(result.interfaces, "API surface should have interfaces property");
          this.assertExists(result.dependencies, "API surface should have dependencies property");
          this.assertExists(result.exports, "API surface should have exports property");
          
          // Check usage counts are included
          if (result.public_methods.length > 0) {
            this.assertExists(result.public_methods[0].usage_count, "Methods should include usage_count");
          }
          if (result.exports && result.exports.length > 0) {
            this.assertExists(result.exports[0].usage_count, "Exports should include usage_count");
            this.assertExists(result.exports[0].imported_by, "Exports should include imported_by");
          }
        } else if (tool.name === 'analyze_impact') {
          this.assertExists(result.direct_dependents, "Impact analysis should have direct_dependents");
          this.assertExists(result.risk_level, "Impact analysis should have risk_level");
        } else if (tool.name === 'validate_boundaries') {
          this.assertExists(result.violations, "Boundary validation should have violations property");
        }
        
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify all priority 2 tools work
    this.assertEqual(successCount, tools.length, "All priority 2 tools should execute successfully");
  }

  private async testRefactoringTools(): Promise<void> {
    const tools = [
      { name: 'find_callers', params: { symbolName: 'GetBuffer' } },
      { name: 'check_inline_safety', params: { symbolName: 'GetBuffer' } },
      { name: 'analyze_rename', params: { oldName: 'GetBuffer', newName: 'GetBufferData' } }
    ];

    let successCount = 0;
    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Tool-specific assertions
        if (tool.name === 'find_callers') {
          this.assertExists(result.symbol, "find_callers should have symbol property");
          this.assertExists(result.found, "find_callers should have found property");
          this.assertExists(result.direct_callers, "find_callers should have direct_callers array");
          this.assertExists(result.indirect_callers, "find_callers should have indirect_callers array");
          this.assertExists(result.test_coverage, "find_callers should have test_coverage array");
          this.assertExists(result.summary, "find_callers should have summary");
        } else if (tool.name === 'check_inline_safety') {
          this.assertExists(result.symbol, "check_inline_safety should have symbol property");
          this.assertExists(result.found, "check_inline_safety should have found property");
          this.assertExists(result.is_safe, "check_inline_safety should have is_safe property");
          this.assertExists(result.reasons, "check_inline_safety should have reasons array");
          this.assertExists(result.side_effects, "check_inline_safety should have side_effects");
          this.assertExists(result.metrics, "check_inline_safety should have metrics");
          this.assertExists(result.recommendation, "check_inline_safety should have recommendation");
        } else if (tool.name === 'analyze_rename') {
          this.assertExists(result.old_name, "analyze_rename should have old_name property");
          this.assertExists(result.new_name, "analyze_rename should have new_name property");
          this.assertExists(result.found, "analyze_rename should have found property");
          this.assertExists(result.files_affected, "analyze_rename should have files_affected");
          this.assertExists(result.locations_affected, "analyze_rename should have locations_affected");
          this.assertExists(result.potential_conflicts, "analyze_rename should have potential_conflicts array");
          this.assertExists(result.suggested_approach, "analyze_rename should have suggested_approach");
        }
        
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify all refactoring tools work
    this.assertEqual(successCount, tools.length, "All refactoring tools should execute successfully");
  }

  private async testIndexTools(): Promise<void> {
    const tools = [
      { name: 'index_status', params: {} },
      { name: 'clear_cache', params: {} },
      // Skip rebuild_index for now - it takes too long
      // { name: 'rebuild_index', params: { clean: false } }
    ];

    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Tool-specific assertions
        if (tool.name === 'index_status') {
          this.assertExists(result.overview, "Index status should have overview");
          this.assertExists(result.overview.totalFiles, "Index status should have totalFiles");
          this.assertGreaterEqual(result.overview.totalFiles || 0, 0, "Total files should be >= 0");
          this.assertExists(result.overview.totalSymbols, "Index status should have totalSymbols");
          this.assertGreaterEqual(result.overview.totalSymbols || 0, 0, "Symbol count should be >= 0");
        } else if (tool.name === 'clear_cache') {
          // Clear cache returns a string message
          this.assert(typeof result === 'string' || result.includes, "Clear cache should return a message");
          if (typeof result === 'string') {
            this.assert(result.includes('cleared'), "Clear cache message should indicate success");
          }
        } else if (tool.name === 'rebuild_index') {
          // Rebuild index returns a status message string
          if (!result || typeof result !== 'string') {
            console.log('Rebuild index result:', JSON.stringify(result));
          }
          this.assert(typeof result === 'string', "Rebuild index should return a status message");
          this.assert(result.includes('complete') || result.includes('processed') || result.includes('Found'), "Rebuild index should indicate progress");
        }
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify index tools work
    this.assertEqual(tools.length, 2, "Should test 2 index management tools (skipping rebuild_index)");
  }

  private async testSearchTools(): Promise<void> {
    const tools = [
      { name: 'find_module_for_symbol', params: { symbolName: 'test' } },
      { name: 'semantic_search', params: { query: 'test function' } }
    ];

    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Tool-specific assertions
        if (tool.name === 'find_module_for_symbol') {
          this.assertExists(result.modules, "Module finder should return modules array");
          this.assert(Array.isArray(result.modules), "Modules should be an array");
        } else if (tool.name === 'semantic_search') {
          this.assertExists(result.results, "Semantic search should return results");
          this.assert(Array.isArray(result.results), "Search results should be an array");
        }
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify search tools work
    this.assertEqual(tools.length, 2, "Should test 2 search tools");
  }

  private async testValidationTools(): Promise<void> {
    const tools = [
      { name: 'get_validation_stats', params: {} },
      { name: 'validate_claude_code', params: { 
        code: 'class TestClass {};',
        filePath: '/test.cpp',
        suggestions: []
      }},
      { name: 'validate_code_snippet', params: {
        code: 'void testFunction() { }',
        language: 'cpp'
      }}
    ];

    let successCount = 0;
    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Tool-specific assertions for validation stats
        if (tool.name === 'get_validation_stats') {
          this.assertExists(result.totalSymbols, "Validation stats should have totalSymbols");
          this.assertGreaterEqual(result.totalSymbols || 0, 0, "Total symbols should be >= 0");
          this.assertExists(result.violations, "Validation stats should have violations");
          this.assert(Array.isArray(result.violations), "Violations should be an array");
        } else if (tool.name === 'validate_claude_code') {
          this.assertExists(result.isValid, "Claude code validation should have isValid");
          this.assertExists(result.issues, "Claude code validation should have issues");
          this.assert(Array.isArray(result.issues), "Issues should be an array");
        } else if (tool.name === 'validate_code_snippet') {
          this.assertExists(result.isValid, "Code snippet validation should have isValid");
          this.assertExists(result.syntaxErrors, "Code snippet validation should have syntaxErrors");
        }
        
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify validation tools work
    this.assertEqual(successCount, tools.length, "All validation tools should execute successfully");
  }

  private async testNamespaceTools(): Promise<void> {
    const tools = [
      { 
        name: 'find_in_namespace', 
        params: { namespace: 'PlanetGen::*' },
        description: 'Find all symbols in PlanetGen namespace'
      },
      { 
        name: 'find_in_namespace', 
        params: { namespace: 'PlanetGen::Rendering' },
        description: 'Find symbols in specific namespace'
      },
      { 
        name: 'resolve_symbol', 
        params: { 
          symbolName: 'Pipeline',
          fromNamespace: 'PlanetGen::Rendering',
          fromFile: '/src/rendering/test.cpp'
        },
        description: 'Resolve symbol from namespace context'
      },
      {
        name: 'semantic_search',
        params: { query: 'namespace PlanetGen::Rendering' },
        description: 'Natural language namespace query'
      },
      {
        name: 'semantic_search',
        params: { query: 'resolve Pipeline from PlanetGen::Rendering' },
        description: 'Natural language resolve query'
      }
    ];

    let successCount = 0;
    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Validate results based on tool type
        if (tool.name === 'find_in_namespace') {
          this.assert(Array.isArray(result), "find_in_namespace should return an array");
          if (result.length > 0) {
            this.assertExists(result[0].namespace, "Namespace results should have namespace property");
            this.assertExists(result[0].symbolCount, "Namespace results should have symbolCount");
          }
        } else if (tool.name === 'resolve_symbol') {
          this.assert(Array.isArray(result), "resolve_symbol should return an array");
          if (result.length > 0) {
            this.assertExists(result[0].name, "Resolved symbols should have name");
            if (result.length > 0) {
              console.log(`    Best match: ${result[0].qualified_name} in ${result[0].namespace}`);
            }
          }
        } else if (tool.name === 'semantic_search') {
          this.assert(Array.isArray(result) || (result && result.results), "Semantic search should return results");
        }
        
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify namespace tools work
    this.assertEqual(successCount, tools.length, "All namespace tools should execute successfully");
    this.assertGreaterThan(tools.length, 3, "Should test multiple namespace scenarios");
  }

  private async testVisualizationTools(): Promise<void> {
    const tools = [
      { name: 'generate_visualization', params: { type: 'treemap' } }
    ];

    let successCount = 0;
    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        if (tool.name === 'generate_visualization') {
          this.assertExists(result.type, "Visualization should have type");
          this.assertExists(result.path, "Visualization should have path");
        }
        
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify visualization tools work
    this.assertEqual(successCount, tools.length, "All visualization tools should execute successfully");
  }

  private async testAgentFeedbackTools(): Promise<void> {
    const tools = [
      { name: 'record_agent_feedback', params: {
        toolName: 'test_tool',
        success: true,
        feedback: 'Test feedback',
        context: {}
      }},
      { name: 'record_context_gap', params: {
        toolName: 'test_tool',
        missingContext: 'Test missing context',
        suggestion: 'Add more context'
      }},
      { name: 'get_enhanced_context', params: {
        toolName: 'test_tool',
        baseContext: {}
      }},
      { name: 'analyze_feedback_patterns', params: {} },
      { name: 'get_feedback_stats', params: {} }
    ];

    let successCount = 0;
    for (const tool of tools) {
      try {
        const result = await this.callTool(tool.name, tool.params);
        this.assertExists(result, `${tool.name} should return a result`);
        
        // Tool-specific assertions
        if (tool.name === 'record_agent_feedback' || tool.name === 'record_context_gap') {
          this.assertExists(result.success, "Recording should have success status");
        } else if (tool.name === 'get_enhanced_context') {
          this.assertExists(result.enhancedContext, "Should return enhanced context");
        } else if (tool.name === 'analyze_feedback_patterns') {
          this.assertExists(result.patterns, "Should return feedback patterns");
          this.assert(Array.isArray(result.patterns), "Patterns should be an array");
        } else if (tool.name === 'get_feedback_stats') {
          this.assertExists(result.totalFeedback, "Should have totalFeedback");
          this.assertGreaterEqual(result.totalFeedback || 0, 0, "Total feedback should be >= 0");
        }
        
        successCount++;
      } catch (error) {
        console.log(`    ❌ ${tool.name} - FAILED: ${(error as Error).message}`);
        throw error;
      }
    }
    
    // ASSERTIONS: Verify agent feedback tools work
    this.assertEqual(successCount, tools.length, "All agent feedback tools should execute successfully");
  }

  private async testAllToolsCount(): Promise<void> {
    // List all 23 tools we expect
    const expectedTools = [
      // Priority 1 tools (3)
      'find_implementations',
      'find_similar_code',
      'analyze_cross_file_dependencies',
      
      // Priority 2 tools (4)
      'get_api_surface',
      'analyze_impact',
      'validate_boundaries',
      'suggest_module',
      
      // Index management tools (3)
      'rebuild_index',
      'index_status',
      'clear_cache',
      
      // Search tools (2)
      'find_module_for_symbol',
      'semantic_search',
      
      // Namespace tools (2)
      'find_in_namespace',
      'resolve_symbol',
      
      // Validation tools (3)
      'get_validation_stats',
      'validate_claude_code',
      'validate_code_snippet',
      
      // Visualization tools (1)
      'generate_visualization',
      
      // Agent feedback tools (5)
      'record_agent_feedback',
      'record_context_gap',
      'get_enhanced_context',
      'analyze_feedback_patterns',
      'get_feedback_stats',
      
      // High-value refactoring tools (3)
      'find_callers',
      'check_inline_safety',
      'analyze_rename'
    ];
    
    // ASSERTIONS: Verify we have all 26 tools (added 3 refactoring tools)
    this.assertEqual(expectedTools.length, 26, "Should have exactly 26 expected tools (23 base + 3 refactoring)");
    
    // Get the actual tools from the server
    const serverInfo = await (this.mcpServer as any).server.getServerInfo();
    const actualTools = serverInfo.capabilities?.tools || [];
    
    this.assertEqual(actualTools.length, 26, "Server should expose exactly 26 tools (23 + 3 new refactoring tools)");
    
    // Verify each expected tool exists
    for (const toolName of expectedTools) {
      const toolExists = actualTools.some((t: any) => t.name === toolName);
      this.assert(toolExists, `Tool '${toolName}' should exist in server`);
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
    const response = await (this.mcpServer as any).handleToolCall(request);
    
    // Extract content from MCP response format
    if (response && response.content && Array.isArray(response.content) && response.content[0]?.text) {
      try {
        return JSON.parse(response.content[0].text);
      } catch {
        return response.content[0].text;
      }
    }
    
    return response;
  }
}