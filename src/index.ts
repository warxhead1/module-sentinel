#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool 
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';
import * as os from 'os';

// TODO: Import Rust bindings via NAPI-RS
// import { searchSymbols, indexProject, getSymbolRelationships } from './module-sentinel-rust.node';

/**
 * Simple process lock manager to prevent multiple instances
 */
class ProcessLockManager {
  private static readonly LOCK_FILE = path.join(os.tmpdir(), 'module-sentinel-mcp.pid');
  
  static async acquireLock(): Promise<boolean> {
    try {
      // Check if lock file exists
      const lockContent = await fs.readFile(ProcessLockManager.LOCK_FILE, 'utf8').catch(() => null);
      
      if (lockContent) {
        const existingPid = parseInt(lockContent.trim());
        
        // Check if process is still running
        try {
          process.kill(existingPid, 0); // Signal 0 just checks if process exists
          // Silently terminate existing process
          
          // Send SIGTERM to existing process
          process.kill(existingPid, 'SIGTERM');
          
          // Wait a bit for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if it's still running, force kill if needed
          try {
            process.kill(existingPid, 0);
            // Force kill if still running
            process.kill(existingPid, 'SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch {
            // Process terminated successfully
          }
        } catch {
          // Process doesn't exist, remove stale lock file
          await fs.unlink(ProcessLockManager.LOCK_FILE).catch(() => {});
        }
      }
      
      // Create new lock file
      await fs.writeFile(ProcessLockManager.LOCK_FILE, process.pid.toString());
      
      // Set up cleanup on exit
      const cleanup = () => {
        try {
          require('fs').unlinkSync(ProcessLockManager.LOCK_FILE);
        } catch {
          // Ignore cleanup errors
        }
      };
      
      process.on('exit', cleanup);
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      process.on('SIGUSR1', cleanup);
      process.on('SIGUSR2', cleanup);
      
      return true;
    } catch {
      // Failed to acquire lock - silent in MCP mode
      return false;
    }
  }
}

export class ModuleSentinelMCPServer {
  private server: Server;
  private projectPath: string;

  constructor() {
    // Load environment variables
    dotenv.config();
    
    // Acquire process lock to prevent multiple instances
    ProcessLockManager.acquireLock().catch(() => {});
    
    // Get configuration from environment
    this.projectPath = process.env.MODULE_SENTINEL_PROJECT_PATH || 
                       process.cwd();
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'module-sentinel',
        version: '3.0.0',
        capabilities: {
          tools: {
            list: true
          }
        }
      },
      {
        capabilities: {
          tools: {
            call: true
          }
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_symbols',
            description: 'Search for symbols in the codebase',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                kind: { type: 'string', description: 'Symbol kind filter (optional)' },
                limit: { type: 'number', description: 'Maximum results (default: 20)' }
              },
              required: ['query']
            }
          },
          {
            name: 'index_project',
            description: 'Index the project for analysis',
            inputSchema: {
              type: 'object',
              properties: {
                force: { type: 'boolean', description: 'Force re-indexing' },
                languages: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Languages to index (default: all supported)'
                }
              }
            }
          }
        ] as Tool[]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_symbols':
            // TODO: Call Rust function via NAPI
            // const results = await searchSymbols(args?.query || '', { kind: args?.kind, limit: args?.limit || 20 });
            return {
              content: [
                {
                  type: 'text',
                  text: `TODO: Implement search_symbols via NAPI-RS. Query: ${args?.query || 'N/A'}`
                }
              ]
            };

          case 'index_project':
            // TODO: Call Rust function via NAPI
            // const indexResult = await indexProject(this.projectPath, { force: args?.force, languages: args?.languages });
            return {
              content: [
                {
                  type: 'text',
                  text: `TODO: Implement index_project via NAPI-RS. Project: ${this.projectPath}`
                }
              ]
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start MCP server if run directly
if (require.main === module) {
  const server = new ModuleSentinelMCPServer();
  server.run().catch(console.error);
}