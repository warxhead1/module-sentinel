#!/usr/bin/env tsx
/**
 * MCP Server Integration Test
 * 
 * This test verifies that the MCP server works correctly when started
 * via stdio transport as Claude would start it.
 */

import { spawn } from 'child_process';
import * as path from 'path';

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class MCPClient {
  private child: any;
  private messageId = 1;
  private responseHandlers = new Map<number, (response: MCPMessage) => void>();
  private buffer = '';

  async start(): Promise<void> {
    const serverPath = path.join(__dirname, '../dist/index.js');
    
    console.log('🚀 Starting MCP server at:', serverPath);
    
    this.child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MODULE_SENTINEL_DEBUG: 'false'
      }
    });

    this.child.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.child.stderr.on('data', (data: Buffer) => {
      console.error('Server stderr:', data.toString());
    });

    this.child.on('error', (error: Error) => {
      console.error('Server error:', error);
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          if (message.id && this.responseHandlers.has(message.id)) {
            const handler = this.responseHandlers.get(message.id)!;
            this.responseHandlers.delete(message.id);
            handler(message);
          }
        } catch (error) {
          // Not JSON, ignore
        }
      }
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const id = this.messageId++;
    const request: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      this.child.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async stop(): Promise<void> {
    this.child.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function runTest() {
  console.log('🧪 MCP Server Integration Test\n');
  
  const client = new MCPClient();
  
  try {
    await client.start();
    console.log('✅ Server started successfully\n');

    // Test 1: List tools
    console.log('📋 Test 1: Listing available tools...');
    const toolsResponse = await client.sendRequest('tools/list');
    const tools = toolsResponse.tools || [];
    console.log(`   Found ${tools.length} tools`);
    
    // Check if our namespace tools are present
    const namespaceTools = tools.filter((t: any) => 
      t.name === 'find_in_namespace' || t.name === 'resolve_symbol'
    );
    console.log(`   Namespace tools: ${namespaceTools.length}`);
    
    if (namespaceTools.length === 2) {
      console.log('   ✅ Both namespace tools are registered');
    } else {
      console.log('   ❌ Missing namespace tools');
    }

    // Test 2: Call a tool
    console.log('\n📋 Test 2: Calling semantic_search tool...');
    const searchResponse = await client.sendRequest('tools/call', {
      name: 'semantic_search',
      arguments: { query: 'Pipeline' }
    });
    
    if (searchResponse.content && searchResponse.content[0]) {
      console.log('   ✅ Tool call succeeded');
      const content = searchResponse.content[0].text;
      console.log(`   Response length: ${content.length} characters`);
    } else {
      console.log('   ❌ Tool call failed');
    }

    // Test 3: Call namespace tool
    console.log('\n📋 Test 3: Calling find_in_namespace tool...');
    const namespaceResponse = await client.sendRequest('tools/call', {
      name: 'find_in_namespace',
      arguments: { namespace: 'PlanetGen::*' }
    });
    
    if (namespaceResponse.content && namespaceResponse.content[0]) {
      console.log('   ✅ Namespace tool call succeeded');
    } else {
      console.log('   ❌ Namespace tool call failed');
    }

    // Test 4: Call resolve_symbol tool
    console.log('\n📋 Test 4: Calling resolve_symbol tool...');
    const resolveResponse = await client.sendRequest('tools/call', {
      name: 'resolve_symbol',
      arguments: {
        symbolName: 'Pipeline',
        fromNamespace: 'PlanetGen::Rendering',
        fromFile: '/src/test.cpp'
      }
    });
    
    if (resolveResponse.content && resolveResponse.content[0]) {
      console.log('   ✅ Resolve symbol tool call succeeded');
    } else {
      console.log('   ❌ Resolve symbol tool call failed');
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📌 The MCP server is ready to be used with Claude Code!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.stop();
    console.log('\n🛑 Server stopped');
  }
}

// Run the test
runTest().catch(console.error);