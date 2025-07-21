#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool 
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';

// Import our new components
import { UniversalIndexer } from './indexing/universal-indexer.js';
import { Priority1Tools } from './tools/priority-1-tools.js';
import { ModernApiServer } from './api/server.js';
import { SecureConfigManager } from './utils/secure-config.js';
import { DatabaseConfig, getDatabasePath } from './config/database-config.js';
// Parser registry not needed for current implementation

export class ModuleSentinelMCPServer {
  private server: Server;
  private db: Database.Database;
  private dbPath: string;
  private universalIndexer?: UniversalIndexer;
  private priority1Tools: Priority1Tools;
  private visualizationAPI?: ModernApiServer;

  constructor(options?: { skipAutoIndex?: boolean }) {
    const skipAutoIndex = options?.skipAutoIndex ?? false;
    
    // Load environment variables
    dotenv.config();
    
    // Get configuration
    const secureConfig = SecureConfigManager.getConfig();
    const projectPath = secureConfig.projectPath || 
                        process.env.MODULE_SENTINEL_PROJECT_PATH || 
                        '/home/warxh/planet_procgen';
    
    // Get database path from centralized config
    const dbConfig = DatabaseConfig.getInstance();
    this.dbPath = dbConfig.getDbPath();

    // Initialize database
    this.db = new Database(this.dbPath);
    console.error(`[MCP Server] Using database at: ${this.dbPath}`);
    console.error(`[MCP Server] Environment: ${dbConfig.getEnv()}`);
    
    // Universal indexer will be created when needed with proper options
    
    // Initialize tools
    this.priority1Tools = new Priority1Tools(this.db);
    
    // Initialize visualization API
    const visualizationPort = parseInt(process.env.VISUALIZATION_PORT || '7071');
    this.visualizationAPI = new ModernApiServer(this.db, visualizationPort);
    
    // Auto-index if not skipped
    if (!skipAutoIndex) {
      this.performInitialIndex(projectPath).catch(console.error);
    }
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'module-sentinel',
        version: '3.0.0',
        capabilities: {
          tools: {},
          resources: {
            read: true
          }
        }
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupHandlers();
  }

  private async performInitialIndex(projectPath: string): Promise<void> {
    console.error('[MCP Server] Starting initial indexing...');
    
    try {
      // Create indexer with options
      this.universalIndexer = new UniversalIndexer(this.db, {
        projectPath,
        projectName: 'planet_procgen',
        languages: ['cpp'],
        debugMode: process.env.MODULE_SENTINEL_DEBUG === 'true'
      });
      
      // Index the project
      const result = await this.universalIndexer.indexProject();
      
      console.error(`[MCP Server] Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`);
      
      // Log database health
      const stats = this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM universal_symbols) as symbols,
          (SELECT COUNT(*) FROM file_index) as files,
          (SELECT COUNT(*) FROM projects) as projects
      `).get() as any;
      
      console.error('[MCP Server] Database stats:', stats);
      
    } catch (error) {
      console.error('[MCP Server] Initial indexing failed:', error);
    }
  }



  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'find_implementations',
          description: 'Find implementations of a specific functionality',
          inputSchema: {
            type: 'object',
            properties: {
              functionality: { type: 'string', description: 'Description of the functionality' },
              keywords: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Keywords to search for'
              },
              returnType: { type: 'string', description: 'Expected return type (optional)' }
            },
            required: ['functionality', 'keywords']
          }
        },
        {
          name: 'find_similar_code',
          description: 'Find similar code patterns',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Code pattern to search for' },
              context: { type: 'string', description: 'Context or module to search within' },
              threshold: { 
                type: 'number', 
                description: 'Similarity threshold (0-1)', 
                default: 0.7 
              }
            },
            required: ['pattern', 'context']
          }
        },
        {
          name: 'rebuild_index',
          description: 'Rebuild the code index',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { 
                type: 'string', 
                description: 'Path to project (optional, uses default if not provided)' 
              },
              force: { 
                type: 'boolean', 
                description: 'Force full rebuild', 
                default: false 
              }
            }
          }
        },
        {
          name: 'search_symbols',
          description: 'Search for symbols by name or pattern',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              kind: { 
                type: 'string', 
                description: 'Symbol kind filter (class, function, etc)',
                enum: ['class', 'function', 'method', 'namespace', 'module', 'all']
              },
              limit: { type: 'number', default: 20 }
            },
            required: ['query']
          }
        }
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'find_implementations':
            return this.handleFindImplementations(args);
            
          case 'find_similar_code':
            return this.handleFindSimilarCode(args);
            
          case 'rebuild_index':
            return this.handleRebuildIndex(args);
            
          case 'search_symbols':
            return this.handleSearchSymbols(args);
            
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    });

    // Handle resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: [] };
    });

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async () => {
      throw new Error('No readable resources available');
    });
  }

  private async handleFindImplementations(args: any) {
    const results = await this.priority1Tools.findImplementations({
      functionality: args.functionality,
      keywords: args.keywords,
      returnType: args.returnType
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  private async handleFindSimilarCode(args: any) {
    const results = await this.priority1Tools.findSimilarCode({
      pattern: args.pattern,
      context: args.context,
      threshold: args.threshold || 0.7
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  private async handleRebuildIndex(args: any) {
    const projectPath = args.projectPath || 
                       SecureConfigManager.getConfig().projectPath || 
                       process.env.MODULE_SENTINEL_PROJECT_PATH || 
                       '/home/warxh/planet_procgen';

    console.error(`[MCP Server] Rebuilding index for: ${projectPath}`);
    
    // Create new indexer for rebuild
    this.universalIndexer = new UniversalIndexer(this.db, {
      projectPath,
      projectName: 'planet_procgen',
      languages: ['cpp'],
      forceReindex: args.force,
      debugMode: process.env.MODULE_SENTINEL_DEBUG === 'true'
    });
    
    // Re-index
    const result = await this.universalIndexer.indexProject();

    return {
      content: [{
        type: 'text',
        text: `Index rebuilt successfully. Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols.`
      }]
    };
  }

  private async handleSearchSymbols(args: any) {
    const query = args.query;
    const kind = args.kind || 'all';
    const limit = args.limit || 20;
    
    let sql = `
      SELECT name, qualified_name, kind, file_path, line, signature
      FROM universal_symbols
      WHERE name LIKE ? OR qualified_name LIKE ?
    `;
    
    if (kind !== 'all') {
      sql += ` AND kind = ?`;
    }
    
    sql += ` LIMIT ?`;
    
    const searchPattern = `%${query}%`;
    const params = kind === 'all' 
      ? [searchPattern, searchPattern, limit]
      : [searchPattern, searchPattern, kind, limit];
    
    const results = this.db.prepare(sql).all(...params);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }


  async run(): Promise<void> {
    console.error('[MCP Server] Starting Module Sentinel MCP Server v3.0...');
    
    // Start visualization API
    if (this.visualizationAPI) {
      await this.visualizationAPI.start();
      console.error('[MCP Server] Visualization API started');
    }
    
    // Run MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP Server] MCP Server started');
  }

  async stop(): Promise<void> {
    console.error('[MCP Server] Shutting down...');
    
    if (this.visualizationAPI) {
      await this.visualizationAPI.stop();
    }
    
    this.db.close();
    console.error('[MCP Server] Shutdown complete');
  }
}

// Main entry point
if (require.main === module) {
  const server = new ModuleSentinelMCPServer();
  
  server.run().catch(console.error);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}