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

// Import our Rust bridge
import { ModuleSentinelBridge, quickSearch, quickAnalyze, checkRustBindings } from './rust-bridge/module-sentinel-bridge';
import { createLogger } from './utils/logger';

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
  private rustBridge: ModuleSentinelBridge | null = null;
  private logger = createLogger('MCPServer');

  constructor() {
    // Load environment variables
    dotenv.config();
    
    // Acquire process lock to prevent multiple instances
    ProcessLockManager.acquireLock().catch(() => {});
    
    // Get configuration from environment
    this.projectPath = process.env.MODULE_SENTINEL_PROJECT_PATH || 
                       process.cwd();
    
    // Initialize Rust bridge
    this.rustBridge = new ModuleSentinelBridge(this.projectPath);
    
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
            description: 'Search for symbols in the codebase using Rust-powered analysis',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                kind: { type: 'string', description: 'Symbol kind filter (optional)' },
                language: { type: 'string', description: 'Language filter (optional)' },
                limit: { type: 'number', description: 'Maximum results (default: 20)' },
                include_private: { type: 'boolean', description: 'Include private symbols (default: true)' }
              },
              required: ['query']
            }
          },
          {
            name: 'index_project',
            description: 'Index the project for analysis using Rust tree-sitter parsers',
            inputSchema: {
              type: 'object',
              properties: {
                force: { type: 'boolean', description: 'Force re-indexing' },
                languages: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Languages to index (Rust, TypeScript, Python, etc.)'
                },
                include_tests: { type: 'boolean', description: 'Include test files (default: true)' },
                max_file_size: { type: 'number', description: 'Maximum file size in bytes (default: 1MB)' }
              }
            }
          },
          {
            name: 'analyze_patterns',
            description: 'Analyze code patterns and design patterns in the project',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'calculate_similarity',
            description: 'Calculate similarity between two symbols',
            inputSchema: {
              type: 'object',
              properties: {
                symbol1_id: { type: 'string', description: 'First symbol ID' },
                symbol2_id: { type: 'string', description: 'Second symbol ID' }
              },
              required: ['symbol1_id', 'symbol2_id']
            }
          },
          {
            name: 'parse_file',
            description: 'Parse a single file and extract symbols',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the file to parse' },
                language: { type: 'string', description: 'Programming language of the file' }
              },
              required: ['file_path', 'language']
            }
          }
        ] as Tool[]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Ensure Rust bridge is initialized
        await this.ensureRustBridge();

        switch (name) {
          case 'search_symbols':
            return await this.handleSearchSymbols(args);

          case 'index_project':
            return await this.handleIndexProject(args);

          case 'analyze_patterns':
            return await this.handleAnalyzePatterns();

          case 'calculate_similarity':
            return await this.handleCalculateSimilarity(args);

          case 'parse_file':
            return await this.handleParseFile(args);

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

  /**
   * Ensure the Rust bridge is initialized
   */
  private async ensureRustBridge(): Promise<void> {
    if (!this.rustBridge) {
      throw new Error('Rust bridge not available');
    }

    try {
      const bridgeInfo = this.rustBridge.getProjectInfo();
      if (!bridgeInfo.initialized) {
        this.logger.info('Initializing Rust bridge...');
        await this.rustBridge.initialize();
      }
    } catch (error) {
      this.logger.error('Failed to initialize Rust bridge', error);
      
      // Fall back to quick functions if bridge initialization fails
      const rustAvailable = await checkRustBindings();
      if (!rustAvailable) {
        throw new Error('Rust NAPI bindings not available. Run "npm run build:rust" to compile the Rust bindings.');
      }
      throw error;
    }
  }

  /**
   * Handle symbol search requests
   */
  private async handleSearchSymbols(args: any) {
    const query = args?.query || '';
    const options = {
      kind: args?.kind,
      language: args?.language,
      limit: args?.limit || 20,
      include_private: args?.include_private ?? true,
      fuzzy_match: false
    };

    try {
      const results = await this.rustBridge!.searchSymbols(query, options);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} symbols matching "${query}":\n\n` +
                  results.map((symbol, i) => 
                    `${i + 1}. **${symbol.name}** (${symbol.language})\n` +
                    `   - File: ${symbol.file_path}:${symbol.start_line}\n` +
                    `   - Signature: \`${symbol.signature}\`\n` +
                    `   - Confidence: ${(symbol.confidence_score || 0) * 100}%`
                  ).join('\n\n')
          }
        ]
      };
    } catch (error) {
      // Fallback to quick search
      this.logger.error('Bridge search failed, trying quick search', error);
      const results = await quickSearch(this.projectPath, query, options.limit);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} symbols (quick search fallback):\n\n` +
                  results.map((symbol, i) => 
                    `${i + 1}. **${symbol.name}**\n` +
                    `   - File: ${symbol.file_path}:${symbol.start_line}`
                  ).join('\n\n')
          }
        ]
      };
    }
  }

  /**
   * Handle project indexing requests
   */
  private async handleIndexProject(args: any) {
    const options = {
      force: args?.force || false,
      languages: args?.languages,
      include_tests: args?.include_tests ?? true,
      max_file_size: args?.max_file_size || 1024 * 1024,
      exclude_patterns: undefined
    };

    try {
      const result = await this.rustBridge!.indexProject(options);
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Project indexing completed successfully!\n\n` +
                  `**Project Info:**\n` +
                  `- Project ID: ${result.id}\n` +
                  `- Name: ${result.name}\n` +
                  `- Path: ${result.path}\n` +
                  `- Symbols found: ${result.symbol_count}\n` +
                  `- Last indexed: ${result.last_indexed || 'now'}`
          }
        ]
      };
    } catch (error) {
      this.logger.error('Project indexing failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Project indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                  `Please ensure:\n` +
                  `1. The project path exists: ${this.projectPath}\n` +
                  `2. You have read permissions\n` +
                  `3. Rust bindings are compiled: run "npm run build:rust"`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle pattern analysis requests
   */
  private async handleAnalyzePatterns() {
    try {
      const result = await this.rustBridge!.analyzePatterns();
      
      const patternSummary = result.patterns.length > 0 
        ? result.patterns.map(pattern => 
            `**${pattern.category}** (${(pattern.confidence * 100).toFixed(1)}% confidence)\n` +
            `- Found in ${pattern.symbols.length} symbols\n` +
            `- Evidence: ${pattern.evidence.join(', ')}`
          ).join('\n\n')
        : 'No significant patterns detected.';

      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Pattern Analysis Results**\n\n` +
                  `**Summary:**\n` +
                  `- Symbols analyzed: ${result.insights.total_symbols_analyzed}\n` +
                  `- Patterns detected: ${result.insights.patterns_detected}\n` +
                  `- Code reuse: ${result.insights.code_reuse_percentage.toFixed(1)}%\n\n` +
                  `**Detected Patterns:**\n${patternSummary}\n\n` +
                  `**Recommendations:**\n` +
                  result.insights.recommendations.map(rec => `• ${rec}`).join('\n')
          }
        ]
      };
    } catch (error) {
      // Fallback to quick analysis
      this.logger.error('Bridge pattern analysis failed, trying quick analysis', error);
      try {
        const result = await quickAnalyze(this.projectPath);
        return {
          content: [
            {
              type: 'text',
              text: `🔍 **Quick Pattern Analysis**\n\n` +
                    `${result.insights.recommendations.join('\n')}`
            }
          ]
        };
      } catch (fallbackError) {
        this.logger.error('Quick analysis also failed', fallbackError);
        return {
          content: [
            {
              type: 'text',
              text: `❌ Pattern analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }
    }
  }

  /**
   * Handle similarity calculation requests
   */
  private async handleCalculateSimilarity(args: any) {
    const symbol1Id = args?.symbol1_id;
    const symbol2Id = args?.symbol2_id;

    if (!symbol1Id || !symbol2Id) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Both symbol1_id and symbol2_id are required'
          }
        ],
        isError: true
      };
    }

    try {
      const result = await this.rustBridge!.calculateSimilarity(symbol1Id, symbol2Id);
      
      return {
        content: [
          {
            type: 'text',
            text: `📊 **Similarity Analysis**\n\n` +
                  `**Overall Similarity: ${(result.overall_score * 100).toFixed(1)}%**\n\n` +
                  `**Breakdown:**\n` +
                  `- Name similarity: ${(result.name_similarity * 100).toFixed(1)}%\n` +
                  `- Signature similarity: ${(result.signature_similarity * 100).toFixed(1)}%\n` +
                  `- Structural similarity: ${(result.structural_similarity * 100).toFixed(1)}%\n` +
                  `- Context similarity: ${(result.context_similarity * 100).toFixed(1)}%`
          }
        ]
      };
    } catch (error) {
      this.logger.error('Similarity calculation failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Similarity calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle file parsing requests
   */
  private async handleParseFile(args: any) {
    const filePath = args?.file_path;
    const language = args?.language;

    if (!filePath || !language) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Both file_path and language are required'
          }
        ],
        isError: true
      };
    }

    try {
      const result = await this.rustBridge!.parseFile(filePath, language);
      
      return {
        content: [
          {
            type: 'text',
            text: `📄 **File Parse Results**\n\n` +
                  `**File:** ${filePath}\n` +
                  `**Language:** ${language}\n` +
                  `**Parse Method:** ${result.parse_method}\n` +
                  `**Confidence:** ${(result.confidence * 100).toFixed(1)}%\n` +
                  `**Symbols Found:** ${result.symbols.length}\n\n` +
                  (result.errors.length > 0 ? 
                    `**Errors:**\n${result.errors.map(err => `• ${err}`).join('\n')}\n\n` : '') +
                  `**Symbols:**\n` +
                  result.symbols.map((symbol, i) => 
                    `${i + 1}. **${symbol.name}** (line ${symbol.start_line})\n` +
                    `   \`${symbol.signature}\``
                  ).join('\n')
          }
        ]
      };
    } catch (error) {
      this.logger.error('File parsing failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ File parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
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