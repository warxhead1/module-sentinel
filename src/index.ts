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
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';
import * as os from 'os';

// Import our new components
import { UniversalIndexer } from './indexing/universal-indexer.js';
import { Priority1Tools } from './tools/priority-1-tools.js';
import { SecureConfigManager } from './utils/secure-config.js';
import { DatabaseConfig } from './config/database-config.js';
import { DrizzleDatabase } from './database/drizzle-db.js';
import { DatabaseService } from './api/services/database.service.js';
// Parser registry not needed for current implementation

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
          } catch {
            // Process already terminated
          }
        } catch {
          // Process doesn't exist, remove stale lock file
          await fs.unlink(ProcessLockManager.LOCK_FILE).catch(() => {});
        }
      }
      
      // Create new lock file with current PID
      await fs.writeFile(ProcessLockManager.LOCK_FILE, process.pid.toString());
      // Lock acquired with current PID
      
      // Clean up lock file on exit
      const cleanup = async () => {
        try {
          await fs.unlink(ProcessLockManager.LOCK_FILE);
          // Lock released
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
    } catch (error) {
      // Failed to acquire lock - silent in MCP mode
      return false;
    }
  }
}

export class ModuleSentinelMCPServer {
  private server: Server;
  private db: Database.Database;
  private dbPath: string;
  private universalIndexer?: UniversalIndexer;
  private priority1Tools: Priority1Tools;
  private drizzleDb: DrizzleDatabase;
  private dbService: DatabaseService;
  // MCP server doesn't need visualization API - dashboard runs separately

  constructor(options?: { skipAutoIndex?: boolean }) {
    const skipAutoIndex = options?.skipAutoIndex ?? false;
    
    // Load environment variables
    dotenv.config();
    
    // Acquire process lock to prevent multiple instances
    ProcessLockManager.acquireLock().catch(() => {});
    
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
    
    // Initialize Drizzle wrapper and database service
    this.drizzleDb = new DrizzleDatabase(this.db);
    this.dbService = new DatabaseService(this.db);
    
    // No console output in MCP mode - all communication via stdio
    
    // Universal indexer will be created when needed with proper options
    
    // Initialize tools with raw database for embedding support
    this.priority1Tools = new Priority1Tools(this.drizzleDb.getDrizzle(), this.db);
    
    // MCP server doesn't need to start dashboard - it runs separately on port 6969
    
    // Skip auto-indexing for MCP server to avoid blocking stdio
    // Users can manually trigger indexing via rebuild_index tool
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'module-sentinel',
        version: '3.0.0',
        capabilities: {
          tools: {
            // List all available tools
            list: true
          },
          resources: {
            read: true
          }
        }
      },
      {
        capabilities: {
          tools: {
            // Client can call tools
            call: true
          },
          resources: {}
        }
      }
    );

    this.setupHandlers();
  }

  private async startBackgroundServices(projectPath: string): Promise<void> {
    console.error('[MCP Server] Starting background services...');
    
    try {
      // The dashboard runs separately on port 6969 - MCP server doesn't need to start it
      console.error('[MCP Server] Dashboard runs independently on port 6969');
      
      // Start indexing in background (can take time)
      console.error('[MCP Server] About to start initial indexing in background...');
      this.performInitialIndex(projectPath)
        .then(() => {
          console.error('[MCP Server] Initial indexing completed successfully');
        })
        .catch((error) => {
          console.error('[MCP Server] Initial indexing failed:', error);
        });
      
      console.error('[MCP Server] Background services startup completed (indexing continues in background)');
    } catch (error) {
      console.error('[MCP Server] Error in startBackgroundServices:', error);
    }
  }

  private async performInitialIndex(projectPath: string): Promise<void> {
    console.error('[MCP Server] Starting initial indexing...');
    
    try {
      // Get configuration from secure config manager
      const secureConfig = SecureConfigManager.getConfig();
      const projectName = secureConfig.projectName || 'module-sentinel';
      const languages = secureConfig.languages || ['typescript', 'javascript', 'cpp', 'python'];
      const debugMode = secureConfig.debugMode || process.env.MODULE_SENTINEL_DEBUG === 'true';
      
      console.error(`[MCP Server] Project: ${projectName}, Path: ${projectPath}`);
      console.error(`[MCP Server] Languages: ${languages.join(', ')}`);
      
      // Create indexer with dynamic options from config
      this.universalIndexer = new UniversalIndexer(this.db, {
        projectPath,
        projectName,
        languages,
        debugMode,
        useWorkerThreads: true // Enable worker threads for MCP server
      });
      
      // Index the project
      const result = await this.universalIndexer.indexProject();
      
      console.error(`[MCP Server] Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`);
      
      // Log database health using our API service
      const stats = await this.dbService.getStats();
      
      console.error('[MCP Server] Database stats:', {
        symbols: stats.symbolCount,
        files: stats.symbolCount, // Approximation since we don't track file count separately
        projects: 1 // Single project for now
      });
      
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
    const secureConfig = SecureConfigManager.getConfig();
    const projectPath = args.projectPath || 
                       secureConfig.projectPath || 
                       process.env.MODULE_SENTINEL_PROJECT_PATH || 
                       '/workspace';

    const projectName = secureConfig.projectName || 'module-sentinel';
    const languages = secureConfig.languages || ['typescript', 'javascript', 'cpp', 'python'];
    const debugMode = secureConfig.debugMode || process.env.MODULE_SENTINEL_DEBUG === 'true';

    console.error(`[MCP Server] Rebuilding index for: ${projectPath}`);
    console.error(`[MCP Server] Project: ${projectName}, Languages: ${languages.join(', ')}`);
    
    // Create new indexer for rebuild
    this.universalIndexer = new UniversalIndexer(this.db, {
      projectPath,
      projectName,
      languages,
      forceReindex: args.force,
      debugMode,
      useWorkerThreads: true // Enable worker threads for MCP server
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
    
    // Use our existing database service instead of raw SQL
    const results = await this.dbService.searchSymbols(query, {
      kind: kind === 'all' ? undefined : kind,
      limit
    });
    
    // Transform to match expected format
    const formattedResults = results.map(symbol => ({
      name: symbol.name,
      qualified_name: symbol.qualified_name,
      kind: symbol.kind,
      file_path: symbol.file_path,
      line: symbol.line,
      signature: symbol.signature
    }));
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(formattedResults, null, 2)
      }]
    };
  }


  async run(): Promise<void> {
    console.error('[MCP Server] Starting Module Sentinel MCP Server v3.0...');
    
    // Background services already started in constructor, just connect MCP protocol
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP Server] MCP Server protocol connected');
  }

  async stop(): Promise<void> {
    console.error('[MCP Server] Shutting down...');
    
    // Dashboard runs separately, no need to stop it here
    
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