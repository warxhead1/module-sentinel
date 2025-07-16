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
import { Priority1Tools } from './tools/priority-1-tools.js';
import { Priority2Tools } from './tools/priority-2-tools.js';
import { UnifiedSearch } from './tools/unified-search.js';
import { PatternAwareIndexer } from './indexing/pattern-aware-indexer.js';
import { CleanUnifiedSchemaManager } from './database/clean-unified-schema.js';
import { FileWatcher } from './services/file-watcher.js';
import { ThoughtSignaturePreserver } from './engines/thought-signature.js';
import { ClaudeValidationTool } from './tools/claude-validation-tool.js';
import { VisualizationAPI } from './api/visualization-api.js';
import { SecureConfigManager } from './utils/secure-config.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';

export class ModuleSentinelMCPServer {
  private server: Server;
  private priority1Tools: Priority1Tools;
  private priority2Tools: Priority2Tools;
  private unifiedSearch: UnifiedSearch;
  private patternAwareIndexer!: PatternAwareIndexer;
  private dbPath: string;
  private db: Database.Database;
  private schemaManager: CleanUnifiedSchemaManager;
  private fileWatcher!: FileWatcher;
  private thoughtSignaturePreserver: ThoughtSignaturePreserver;
  private claudeValidationTool?: ClaudeValidationTool;
  private visualizationAPI?: VisualizationAPI;
  private enableFileWatcher: boolean;

  constructor(options?: { enableFileWatcher?: boolean, skipAutoIndex?: boolean }) {
    this.enableFileWatcher = options?.enableFileWatcher ?? true;
    const skipAutoIndex = options?.skipAutoIndex ?? false;
    // Load environment variables (for backwards compatibility)
    dotenv.config();
    
    // Get configuration from secure location
    const secureConfig = SecureConfigManager.getConfig();
    
    // Use secure config, then environment variables, then defaults
    const projectPath = secureConfig.projectPath || 
                        process.env.MODULE_SENTINEL_PROJECT_PATH || 
                        '/home/warxh/planet_procgen';
    
    this.dbPath = secureConfig.dbPath || 
                  process.env.DATABASE_PATH || 
                  process.env.MODULE_SENTINEL_DB_PATH || 
                  path.join(process.env.HOME || '/tmp', '.module-sentinel', 'module-sentinel.db');
    
    // Ensure database directory exists
    const dbDirPath = path.dirname(this.dbPath);
    if (!require('fs').existsSync(dbDirPath)) {
      require('fs').mkdirSync(dbDirPath, { recursive: true });
    }
    
    // Log the database path for debugging
    console.error(`[MCP Server] Using database: ${this.dbPath}`);
    console.error(`[MCP Server] Database exists: ${require('fs').existsSync(this.dbPath)}`);
    
    // Initialize database and schema manager first
    this.db = new Database(this.dbPath);
    this.schemaManager = CleanUnifiedSchemaManager.getInstance();
    
    // Always initialize the schema (safe to call multiple times)
    this.schemaManager.initializeDatabase(this.db);
    
    // Log database health for debugging
    try {
      const symbolCount = this.db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols").get() as { count: number };
      console.error(`[MCP Server] Database contains ${symbolCount.count} symbols`);
    } catch (error) {
      console.error(`[MCP Server] Database health check failed:`, error);
    }
    
    // Pass the unified database connection to all services
    this.priority1Tools = new Priority1Tools(this.db);
    this.priority2Tools = new Priority2Tools(this.db);
    this.unifiedSearch = new UnifiedSearch(this.db);
    const debugMode = process.env.MODULE_SENTINEL_DEBUG === 'true';
    
    // Only create PatternAwareIndexer if not skipping auto-index (to avoid conflicts with explicit rebuilds)
    if (!skipAutoIndex) {
      this.patternAwareIndexer = new PatternAwareIndexer(projectPath, this.dbPath, debugMode, true, this.db);
    }
    // this.analyticsService = new AnalyticsService(this.db); // Removed - functionality covered by PatternAwareIndexer
    
    // Initialize ThoughtSignaturePreserver with the shared database
    this.thoughtSignaturePreserver = new ThoughtSignaturePreserver(this.db);
    
    // Initialize Claude validation tool from secure config
    const geminiApiKey = SecureConfigManager.getGeminiApiKey();
    if (geminiApiKey) {
      this.claudeValidationTool = new ClaudeValidationTool(this.db, geminiApiKey);
      console.error('[MCP Server] Claude validation tool initialized with Gemini integration');
    } else {
      console.error('[MCP Server] Gemini API key not configured - Claude validation features disabled');
      console.error('[MCP Server] To set up securely: module-sentinel-config set-api-key <your-key>');
      console.error(`[MCP Server] Config location: ${SecureConfigManager.getConfigPath()}`);
    }
    
    // Initialize file watcher (only if we have a PatternAwareIndexer)
    if (this.patternAwareIndexer) {
      this.fileWatcher = new FileWatcher({
        paths: [projectPath],
        filePatterns: ['*.cpp', '*.hpp', '*.h', '*.ixx', '*.cc', '*.cxx'],
        indexer: this.patternAwareIndexer,
        debounceMs: 1000,
        batchUpdates: true
      });
      
      // Set up file watcher event handlers
      this.fileWatcher.on('indexed', (event) => {
        console.error(`[FileWatcher] File ${event.action}: ${event.path}`);
      });
      
      this.fileWatcher.on('batch:complete', (event) => {
        console.error(`[FileWatcher] Batch indexed ${event.count} files`);
      });
      
      this.fileWatcher.on('error', (event) => {
        console.error(`[FileWatcher] Error watching ${event.path}:`, event.error);
      });
    }
    
    this.server = new Server(
      {
        name: 'module-sentinel',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupTools();
    
    // Auto-index on startup, then start file watcher if enabled (unless explicitly skipped)
    if (!skipAutoIndex) {
      this.autoIndex();
    }

    // Start the visualization server
    this.visualizationAPI = new VisualizationAPI(this.dbPath, 8081);
  }

  private async autoIndex(): Promise<void> {
    try {
      // Ensure database connection is valid
      this.ensureDbConnection();
      
      // Check if index exists and has content
      const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any;
      
      if (symbolCount.count === 0) {
        console.error('Building initial index...');
        await this.handleRebuildIndex({ projectPath: process.env.PROJECT_PATH || '/home/warxh/planet_procgen' });
        console.error('Index built successfully');
      } else {
        console.error(`Index already exists with ${symbolCount.count} symbols`);
      }
      
      // Start file watcher after index is ready if enabled
      if (this.enableFileWatcher) {
        console.error('Starting file watcher...');
        await this.fileWatcher.start();
        console.error('File watcher started - monitoring for changes');
      }
    } catch (error) {
      console.error('Auto-indexing failed:', error);
    }
  }

  // Ensure schema exists (safe to call multiple times)
  private ensureSchemaExists(): void {
    try {
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('enhanced_symbols', 'symbol_relationships')
      `).all();
      
      if (tables.length < 2) {
        console.error('[MCP Server] Initializing database schema...');
        this.schemaManager.initializeDatabase(this.db);
        console.error('[MCP Server] Database schema initialized');
      }
    } catch (error) {
      console.error('[MCP Server] Schema check failed, reinitializing:', error);
      this.schemaManager.initializeDatabase(this.db);
    }
  }

  // Sort files by parsing priority: .ixx first, then headers, then implementations
  private sortFilesByPriority(filePaths: string[]): string[] {
    const moduleFiles: string[] = [];
    const headerFiles: string[] = [];
    const implementationFiles: string[] = [];
    
    for (const filePath of filePaths) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.ixx') {
        moduleFiles.push(filePath);
      } else if (ext === '.h' || ext === '.hpp') {
        headerFiles.push(filePath);
      } else {
        implementationFiles.push(filePath);
      }
    }
    
    // Sort each category alphabetically for consistent ordering
    moduleFiles.sort();
    headerFiles.sort();
    implementationFiles.sort();
    
    // Return in priority order: modules first, headers second, implementations last
    return [...moduleFiles, ...headerFiles, ...implementationFiles];
  }

  // Ensure database connection is valid and reconnect if needed
  private ensureDbConnection(): void {
    try {
      // Simple test query to check if connection is valid
      this.db.prepare('SELECT 1').get();
    } catch (error) {
      console.error('[MCP Server] Database connection lost, reconnecting...');
      this.db = new Database(this.dbPath);
      this.ensureSchemaExists();
    }
  }

  // Public method for testing tool calls
  public async handleToolCall(request: { params: { name: string; arguments?: any } }): Promise<any> {
    return await this.processToolRequest(request);
  }

  private async processToolRequest(request: { params: { name: string; arguments?: any } }): Promise<any> {
    try {
      switch (request.params.name) {
        // Priority 1 Tools
        case 'find_implementations':
          return await this.handleFindImplementations(request.params.arguments);
        case 'find_similar_code':
          return await this.handleFindSimilarCode(request.params.arguments);
        case 'analyze_cross_file_dependencies':
          return await this.handleAnalyzeCrossFileDependencies(request.params.arguments);
        
        // Priority 2 Tools  
        case 'get_api_surface':
          return await this.handleGetApiSurface(request.params.arguments);
        case 'analyze_impact':
          return await this.handleAnalyzeImpact(request.params.arguments);
        case 'validate_boundaries':
          return await this.handleValidateBoundaries(request.params.arguments);
        case 'suggest_module':
          return await this.handleSuggestModule(request.params.arguments);
        
        // Unified Search
        case 'find_module_for_symbol':
          return await this.handleFindModuleForSymbol(request.params.arguments);
        case 'semantic_search':
          return await this.handleSemanticSearch(request.params.arguments);
        
        // Index Management
        case 'rebuild_index':
          return await this.handleRebuildIndex(request.params.arguments);
        case 'index_status':
          return await this.handleIndexStatus();
        case 'clear_cache':
          return await this.handleClearCache();
        
        // Namespace Tools
        case 'find_in_namespace':
          return await this.handleFindInNamespace(request.params.arguments);
        case 'resolve_symbol':
          return await this.handleResolveSymbol(request.params.arguments);
        
        case 'generate_visualization':
          return await this.handleGenerateVisualization(request.params.arguments);
        
        // Claude Validation Tools
        case 'validate_claude_code':
          return await this.handleValidateClaudeCode(request.params.arguments);
        case 'validate_code_snippet':
          return await this.handleValidateCodeSnippet(request.params.arguments);
        case 'get_validation_stats':
          return await this.handleGetValidationStats(request.params.arguments);
        
        // Thought Signature Tools
        case 'get_enhanced_context':
          return await this.handleGetEnhancedContext(request.params.arguments);
        case 'analyze_feedback_patterns':
          return await this.handleAnalyzeFeedbackPatterns(request.params.arguments);
        case 'get_feedback_stats':
          return await this.handleGetFeedbackStats(request.params.arguments);
        
        // High-value refactoring tools
        case 'find_callers':
          return await this.handleFindCallers(request.params.arguments);
        case 'check_inline_safety':
          return await this.handleCheckInlineSafety(request.params.arguments);
        case 'analyze_rename':
          return await this.handleAnalyzeRename(request.params.arguments);
          
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
            isError: true
          };
      }
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error executing ${request.params.name}: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private setupTools(): void {
    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => this.processToolRequest(request)
    );

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Priority 1 Tools
          {
            name: 'find_implementations',
            description: 'Find all implementations of a given interface or base class',
            inputSchema: {
              type: 'object',
              properties: {
                interfaceName: {
                  type: 'string',
                  description: 'Name of the interface or base class'
                }
              },
              required: ['interfaceName']
            }
          },
          {
            name: 'find_similar_code',
            description: 'Find code similar to a given snippet or pattern',
            inputSchema: {
              type: 'object',
              properties: {
                codeSnippet: {
                  type: 'string',
                  description: 'Code snippet to find similar code for'
                },
                threshold: {
                  type: 'number',
                  description: 'Similarity threshold (0-1)',
                  default: 0.7
                }
              },
              required: ['codeSnippet']
            }
          },
          {
            name: 'analyze_cross_file_dependencies',
            description: 'Analyze cross-file dependencies and usage patterns. Use this to understand downstream impact before modifying code, find all files that depend on a symbol, or analyze file-to-file relationships.',
            inputSchema: {
              type: 'object',
              properties: {
                analysisType: {
                  type: 'string',
                  enum: ['symbol', 'file', 'downstream_impact', 'file_dependencies'],
                  description: 'Type of analysis: symbol (find usages of a symbol), file (analyze file dependencies), downstream_impact (comprehensive impact analysis), file_dependencies (overall dependency overview)'
                },
                symbolName: {
                  type: 'string',
                  description: 'Name of symbol to analyze (required for symbol and downstream_impact types)'
                },
                filePath: {
                  type: 'string',
                  description: 'File path to analyze (required for file type)'
                },
                includeUsageDetails: {
                  type: 'boolean',
                  description: 'Include detailed usage information with line numbers and source code',
                  default: true
                }
              },
              required: ['analysisType']
            }
          },
          
          // Priority 2 Tools
          {
            name: 'get_api_surface',
            description: 'Get the public API surface of a module',
            inputSchema: {
              type: 'object',
              properties: {
                modulePath: {
                  type: 'string',
                  description: 'Path to the module file'
                }
              },
              required: ['modulePath']
            }
          },
          {
            name: 'analyze_impact',
            description: 'Analyze the impact of changes to a symbol',
            inputSchema: {
              type: 'object',
              properties: {
                symbolName: {
                  type: 'string',
                  description: 'Name of the symbol to analyze'
                }
              },
              required: ['symbolName']
            }
          },
          {
            name: 'validate_boundaries',
            description: 'Validate architectural boundaries and detect violations',
            inputSchema: {
              type: 'object',
              properties: {
                checkType: {
                  type: 'string',
                  description: 'Type of boundary check (layer, module, all)',
                  default: 'all'
                }
              }
            }
          },
          {
            name: 'suggest_module',
            description: 'Suggest the best module for a new class or functionality',
            inputSchema: {
              type: 'object',
              properties: {
                className: {
                  type: 'string',
                  description: 'Name of the new class'
                },
                description: {
                  type: 'string',
                  description: 'Description of the functionality'
                }
              },
              required: ['className', 'description']
            }
          },
          
          // Unified Search Tools
          {
            name: 'find_module_for_symbol',
            description: 'Find which module contains a specific symbol',
            inputSchema: {
              type: 'object',
              properties: {
                symbolName: {
                  type: 'string',
                  description: 'Name of the symbol to find'
                }
              },
              required: ['symbolName']
            }
          },
          {
            name: 'semantic_search',
            description: 'Search code using natural language queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query'
                }
              },
              required: ['query']
            }
          },
          
          // Index Management
          {
            name: 'rebuild_index',
            description: 'Rebuild the code index with optional clean schema rebuild',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: {
                  type: 'string',
                  description: 'Path to the project to index'
                },
                cleanRebuild: {
                  type: 'boolean',
                  description: 'Force clean rebuild of schema and all data',
                  default: false
                }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'index_status',
            description: 'Get the current status of the code index',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'clear_cache',
            description: 'Clear pattern search cache for fresh searches',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'find_in_namespace',
            description: 'Find all symbols in a namespace or namespace pattern (e.g., "PlanetGen::Rendering" or "PlanetGen::*")',
            inputSchema: {
              type: 'object',
              properties: {
                namespace: {
                  type: 'string',
                  description: 'Namespace or pattern to search (supports * wildcards)'
                }
              },
              required: ['namespace']
            }
          },
          {
            name: 'resolve_symbol',
            description: 'Resolve a symbol name from a given namespace context using C++ lookup rules',
            inputSchema: {
              type: 'object',
              properties: {
                symbolName: {
                  type: 'string',
                  description: 'Symbol name to resolve'
                },
                fromNamespace: {
                  type: 'string',
                  description: 'Namespace context to resolve from'
                },
                fromFile: {
                  type: 'string',
                  description: 'File path to check for imports'
                }
              },
              required: ['symbolName', 'fromNamespace', 'fromFile']
            }
          },
          {
            name: 'generate_visualization',
            description: 'Generate project architecture visualizations (SVG treemap, interactive HTML, dependency matrix)',
            inputSchema: {
              type: 'object',
              properties: {
                outputDir: {
                  type: 'string',
                  description: 'Output directory for visualizations',
                  default: './visualizations'
                },
                includeInteractive: {
                  type: 'boolean',
                  description: 'Generate interactive HTML visualization',
                  default: true
                }
              }
            }
          },
          
          // Claude Validation Tools
          {
            name: 'validate_claude_code',
            description: 'Validate Claude\'s code suggestions against the semantic database to detect hallucinations and architectural issues',
            inputSchema: {
              type: 'object',
              properties: {
                userPrompt: {
                  type: 'string',
                  description: 'The original user prompt/request'
                },
                claudeResponse: {
                  type: 'string',
                  description: 'Claude\'s full response including code'
                },
                filePath: {
                  type: 'string',
                  description: 'Target file path for the code'
                },
                sessionId: {
                  type: 'string',
                  description: 'Session identifier for tracking'
                },
                extractedCode: {
                  type: 'string',
                  description: 'Any existing code context'
                }
              },
              required: ['userPrompt', 'claudeResponse']
            }
          },
          {
            name: 'validate_code_snippet',
            description: 'Validate a C++ code snippet against the codebase for hallucinations and semantic issues',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'The C++ code snippet to validate'
                },
                userPrompt: {
                  type: 'string',
                  description: 'Context about what the code should do'
                },
                filePath: {
                  type: 'string',
                  description: 'Target file path'
                },
                sessionId: {
                  type: 'string',
                  description: 'Session identifier'
                }
              },
              required: ['code']
            }
          },
          {
            name: 'get_validation_stats',
            description: 'Get validation statistics and trends for Claude code suggestions',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Get stats for specific session'
                }
              }
            }
          },
          
          // Agent Feedback Tools
          {
            name: 'record_agent_feedback',
            description: 'Record feedback from agents about tool failures, missing context, or successes',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Current agent session ID'
                },
                agentName: {
                  type: 'string',
                  description: 'Name of the agent providing feedback'
                },
                feedbackType: {
                  type: 'string',
                  enum: ['tool_failure', 'missing_context', 'success', 'clarification_needed'],
                  description: 'Type of feedback'
                },
                toolName: {
                  type: 'string',
                  description: 'Name of tool (if feedback is about a tool)'
                },
                toolParams: {
                  type: 'object',
                  description: 'Parameters used with the tool'
                },
                expectedOutcome: {
                  type: 'string',
                  description: 'What the agent expected to happen'
                },
                actualOutcome: {
                  type: 'string',
                  description: 'What actually happened'
                },
                errorMessage: {
                  type: 'string',
                  description: 'Error message if any'
                },
                resolution: {
                  type: 'string',
                  description: 'How the issue was resolved'
                }
              },
              required: ['sessionId', 'agentName', 'feedbackType']
            }
          },
          {
            name: 'record_context_gap',
            description: 'Record when an agent identifies missing context that would have been helpful',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Current agent session ID'
                },
                missingContextType: {
                  type: 'string',
                  enum: ['symbol_info', 'file_relationship', 'architectural_pattern', 'dependency', 'usage_example'],
                  description: 'Type of missing context'
                },
                description: {
                  type: 'string',
                  description: 'Description of what context was missing'
                },
                requestedByAgent: {
                  type: 'string',
                  description: 'Name of agent that identified the gap'
                },
                contextQuery: {
                  type: 'string',
                  description: 'What the agent was trying to find'
                }
              },
              required: ['sessionId', 'missingContextType', 'description', 'requestedByAgent']
            }
          },
          {
            name: 'get_enhanced_context',
            description: 'Get enhanced context based on historical patterns and feedback',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Current agent session ID'
                },
                contextType: {
                  type: 'string',
                  description: 'Type of context needed'
                }
              },
              required: ['sessionId', 'contextType']
            }
          },
          {
            name: 'analyze_feedback_patterns',
            description: 'Analyze patterns in agent feedback to identify improvement opportunities',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Analyze patterns for specific session (optional)'
                }
              }
            }
          },
          {
            name: 'get_feedback_stats',
            description: 'Get statistics and metrics about agent feedback and improvements',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'Get stats for specific session (optional)'
                }
              }
            }
          },
          
          // High-value refactoring tools
          {
            name: 'find_callers',
            description: 'Find all direct and indirect callers of a symbol with test coverage information',
            inputSchema: {
              type: 'object',
              properties: {
                symbolName: {
                  type: 'string',
                  description: 'Name of the symbol (function/method/class) to find callers for'
                }
              },
              required: ['symbolName']
            }
          },
          {
            name: 'check_inline_safety',
            description: 'Check if a function can be safely inlined, analyzing side effects and usage patterns',
            inputSchema: {
              type: 'object',
              properties: {
                symbolName: {
                  type: 'string',
                  description: 'Name of the function/method to check for inline safety'
                }
              },
              required: ['symbolName']
            }
          },
          {
            name: 'analyze_rename',
            description: 'Analyze the impact of renaming a symbol including conflicts and affected files',
            inputSchema: {
              type: 'object',
              properties: {
                oldName: {
                  type: 'string',
                  description: 'Current name of the symbol'
                },
                newName: {
                  type: 'string',
                  description: 'Proposed new name for the symbol'
                }
              },
              required: ['oldName', 'newName']
            }
          }
        ]
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'module-sentinel://project-index',
            name: 'Project Code Index',
            description: 'Searchable index of all project symbols and modules',
            mimeType: 'application/json'
          },
          {
            uri: 'module-sentinel://parser-metrics',
            name: 'Parser Quality Metrics',
            description: 'Statistics about parsing quality and confidence scores',
            mimeType: 'application/json'
          },
          {
            uri: 'module-sentinel://analytics-report',
            name: 'Code Analytics Report',
            description: 'Comprehensive code quality and architectural analysis',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      try {
        switch (uri) {
          case 'module-sentinel://project-index':
            const indexStats = await this.getIndexStats();
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(indexStats, null, 2)
              }]
            };
            
          case 'module-sentinel://parser-metrics':
            // TODO: Re-implement with CleanUnifiedSchemaManager when needed
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ status: 'Not available - using clean schema' }, null, 2)
              }]
            };
            
          case 'module-sentinel://analytics-report':
            // TODO: Re-implement with CleanUnifiedSchemaManager when needed
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ status: 'Not available - using clean schema' }, null, 2)
              }]
            };
            
          default:
            return {
              contents: [],
              isError: true
            };
        }
      } catch (error) {
        return {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    });
  }

  // Priority 1 Tool Handlers
  private async handleFindImplementations(args: any) {
    const params = z.object({
      interfaceName: z.string()
    }).parse(args);
    
    // Create request object for findImplementations
    const request = {
      functionality: params.interfaceName,
      keywords: params.interfaceName.split(/(?=[A-Z])|_/).filter(k => k.length > 0), // Split camelCase/snake_case
      returnType: undefined
    };
    
    const results = await this.priority1Tools.findImplementations(request);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  async handleFindSimilarCode(args: any) {
    const params = z.object({
      codeSnippet: z.string(),
      threshold: z.number().min(0).max(1).default(0.7)
    }).parse(args);
    
    // Create request object for findSimilarCode
    const request = {
      pattern: params.codeSnippet,
      context: 'general',
      threshold: params.threshold
    };
    
    const results = await this.priority1Tools.findSimilarCode(request);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  private async handleAnalyzeCrossFileDependencies(args: any) {
    const params = z.object({
      analysisType: z.enum(['symbol', 'file', 'downstream_impact', 'file_dependencies']),
      symbolName: z.string().optional(),
      filePath: z.string().optional(),
      includeUsageDetails: z.boolean().default(true)
    }).parse(args);
    
    // Create request object for analyzeCrossFileDependencies
    const request = {
      symbolName: params.symbolName,
      filePath: params.filePath,
      analysisType: params.analysisType,
      includeUsageDetails: params.includeUsageDetails
    };
    
    const results = await this.priority1Tools.analyzeCrossFileDependencies(request);
    
    // Format the response with clear headings for better readability
    let formattedResponse = `Cross-File Dependency Analysis Results\n`;
    formattedResponse += `========================================\n\n`;
    formattedResponse += `Analysis Type: ${results.analysisType}\n`;
    
    if (results.requestedSymbol) {
      formattedResponse += `Symbol: ${results.requestedSymbol}\n`;
    }
    if (results.requestedFile) {
      formattedResponse += `File: ${results.requestedFile}\n`;
    }
    
    formattedResponse += `\nSummary: ${results.summary}\n\n`;
    
    // Add specific results based on analysis type
    if (results.symbolUsages && results.symbolUsages.length > 0) {
      formattedResponse += `Cross-File Usages:\n`;
      formattedResponse += `------------------\n`;
      results.symbolUsages.forEach((usage, index) => {
        formattedResponse += `${index + 1}. ${usage.fromSymbol} in ${path.basename(usage.fromFile)} (line ${usage.fromLine})\n`;
        formattedResponse += `   Pattern: ${usage.usagePattern}, Confidence: ${usage.confidence.toFixed(2)}\n`;
        if (usage.sourceText && usage.sourceText.trim()) {
          formattedResponse += `   Code: ${usage.sourceText.trim()}\n`;
        }
        formattedResponse += `\n`;
      });
    }
    
    if (results.downstreamImpact) {
      const impact = results.downstreamImpact;
      formattedResponse += `Downstream Impact Analysis:\n`;
      formattedResponse += `---------------------------\n`;
      formattedResponse += `Total Usages: ${impact.totalUsages}\n`;
      formattedResponse += `Affected Files: ${impact.affectedFiles.join(', ')}\n`;
      formattedResponse += `Direct Callers: ${impact.directCallers.join(', ')}\n`;
      
      if (Object.keys(impact.usagesByFile).length > 0) {
        formattedResponse += `\nUsages by File:\n`;
        Object.entries(impact.usagesByFile).forEach(([file, count]) => {
          formattedResponse += `  - ${file}: ${count} usages\n`;
        });
      }
      
      if (impact.criticalUsages.length > 0) {
        formattedResponse += `\nHigh-Confidence Usages: ${impact.criticalUsages.length}\n`;
      }
      formattedResponse += `\n`;
    }
    
    if (results.fileDependencies && results.fileDependencies.length > 0) {
      formattedResponse += `File Dependencies:\n`;
      formattedResponse += `-----------------\n`;
      results.fileDependencies.slice(0, 10).forEach(dep => {
        formattedResponse += `${dep.dependentFile} → ${dep.dependencyFile} (${dep.usageCount} usages: ${dep.relationshipTypes.join(', ')})\n`;
      });
      if (results.fileDependencies.length > 10) {
        formattedResponse += `... and ${results.fileDependencies.length - 10} more dependencies\n`;
      }
      formattedResponse += `\n`;
    }
    
    if (results.dependsOnFiles && results.dependsOnFiles.length > 0) {
      formattedResponse += `Dependencies: ${results.dependsOnFiles.join(', ')}\n`;
    }
    
    if (results.usedByFiles && results.usedByFiles.length > 0) {
      formattedResponse += `Used By: ${results.usedByFiles.join(', ')}\n`;
    }
    
    if (results.usagePatternSummary) {
      formattedResponse += `\nUsage Pattern Summary:\n`;
      formattedResponse += `---------------------\n`;
      Object.entries(results.usagePatternSummary).forEach(([pattern, count]) => {
        formattedResponse += `${pattern}: ${count}\n`;
      });
    }
    
    return {
      content: [{ type: 'text', text: formattedResponse }]
    };
  }

  // Priority 2 Tool Handlers
  private async handleGetApiSurface(args: any) {
    const params = z.object({
      modulePath: z.string()
    }).parse(args);
    
    // Create request object for getApiSurface
    const request = {
      module: params.modulePath,
      include_inherited: true
    };
    
    const results = await this.priority2Tools.getApiSurface(request);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  private async handleAnalyzeImpact(args: any) {
    const params = z.object({
      symbolName: z.string()
    }).parse(args);
    
    // Create request object for analyzeImpact
    const request = {
      module: params.symbolName,
      change_type: 'method_change' as const
    };
    
    const results = await this.priority2Tools.analyzeImpact(request);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  private async handleValidateBoundaries(args: any) {
    const params = z.object({
      checkType: z.string().default('all')
    }).parse(args);
    
    const results = await this.priority2Tools.validateBoundaries(params.checkType);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  private async handleSuggestModule(args: any) {
    const params = z.object({
      className: z.string(),
      description: z.string()
    }).parse(args);
    
    const results = await this.priority2Tools.suggestModule(params.className, params.description);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  // Unified Search Handlers
  private async handleFindModuleForSymbol(args: any) {
    const params = z.object({
      symbolName: z.string()
    }).parse(args);
    
    const results = await this.unifiedSearch.findModuleForSymbol(params.symbolName);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  private async handleSemanticSearch(args: any) {
    const params = z.object({
      query: z.string()
    }).parse(args);
    
    const results = await this.unifiedSearch.semanticSearch(params.query);
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
    };
  }

  // Index Management Handlers
  private async handleRebuildIndex(args: any) {
    const params = z.object({
      projectPath: z.string(),
      cleanRebuild: z.boolean().default(false)
    }).parse(args);
    
    let statusMessage = '';
    
    // If clean rebuild is requested, just clear the data
    if (params.cleanRebuild) {
      statusMessage += '🔄 Performing clean rebuild - clearing data...\n';
      
      // Drop all tables and recreate them
      this.schemaManager.initializeDatabase(this.db);
      statusMessage += '✅ Database cleared and schema reinitialized\n';
    }
    
    // Create PatternAwareIndexer if it doesn't exist
    if (!this.patternAwareIndexer) {
      const debugMode = process.env.MODULE_SENTINEL_DEBUG === 'true';
      this.patternAwareIndexer = new PatternAwareIndexer(params.projectPath, this.dbPath, debugMode, false, this.db);
    }
    
    // Use PatternAwareIndexer which creates the enhanced_symbols table
    const { glob } = await import('glob');
    const patterns = [
      'src/**/*.cpp', 'src/**/*.cxx', 'src/**/*.cc',
      'include/**/*.ixx', 'include/**/*.hpp', 'include/**/*.h'
    ];
    
    const allFiles: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: params.projectPath });
      allFiles.push(...files);
    }
    
    const uniqueFiles = [...new Set(allFiles)];
    const fullPaths = uniqueFiles.map(f => path.join(params.projectPath, f));
    
    // Split into three lists by priority
    const ixxFiles = fullPaths.filter(f => f.endsWith('.ixx'));
    const headerFiles = fullPaths.filter(f => f.endsWith('.h') || f.endsWith('.hpp'));
    const cppFiles = fullPaths.filter(f => f.endsWith('.cpp') || f.endsWith('.cc') || f.endsWith('.cxx'));
    
    statusMessage += `🔍 Found ${uniqueFiles.length} files to index\n`;
    statusMessage += `📁 Project path: ${params.projectPath}\n\n`;
    
    // Process each list in batches of 50
    const batchSize = 50;
    let totalIndexed = 0;
    const startTime = Date.now();
    
    const fileLists = [
      { files: ixxFiles, name: 'Module interfaces (.ixx)' },
      { files: headerFiles, name: 'Headers (.h/.hpp)' },
      { files: cppFiles, name: 'Implementations' }
    ];
    
    for (const fileList of fileLists) {
      if (fileList.files.length === 0) continue;
      
      statusMessage += `🔄 Processing ${fileList.name}: ${fileList.files.length} files\n`;
      
      for (let i = 0; i < fileList.files.length; i += batchSize) {
        const batch = fileList.files.slice(i, i + batchSize);
        const existingPaths = [];
        
        for (const fullPath of batch) {
          try {
            await fs.access(fullPath);
            existingPaths.push(fullPath);
          } catch {
            // File doesn't exist, skip
          }
        }
        
        if (existingPaths.length > 0) {
          statusMessage += `📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fileList.files.length / batchSize)}: ${existingPaths.length} files\n`;
          try {
            await this.patternAwareIndexer.indexFiles(existingPaths);
          } catch (error) {
            statusMessage += `⚠️ Batch indexing failed: ${(error as Error).message}\n`;
            console.error('Batch indexing error:', error);
          }
          totalIndexed += existingPaths.length;
        }
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    // Get final statistics
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any;
    const relationshipCount = this.db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as any;
    const fileCount = this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM enhanced_symbols').get() as any;
    
    statusMessage += `\n✨ Index rebuild complete!\n`;
    statusMessage += `📊 Results:\n`;
    statusMessage += `  - Files processed: ${totalIndexed}\n`;
    statusMessage += `  - Symbols indexed: ${symbolCount.count}\n`;
    statusMessage += `  - Relationships stored: ${relationshipCount.count}\n`;
    statusMessage += `  - Unique files: ${fileCount.count}\n`;
    statusMessage += `  - Time elapsed: ${elapsed}ms\n`;
    
    if (params.cleanRebuild) {
      statusMessage += `\n🔄 Clean rebuild successfully completed with fresh schema\n`;
    }
    
    return {
      content: [{ type: 'text', text: statusMessage }]
    };
  }

  private async handleIndexStatus() {
    const stats = await this.getIndexStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }]
    };
  }

  private async getIndexStats() {
    // Simple index statistics using database directly
    try {
      const overview = {
        totalFiles: (this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM enhanced_symbols').get() as any).count || 0,
        totalSymbols: (this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count || 0,
        totalRelationships: (this.db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as any).count || 0,
        lastUpdated: new Date().toISOString()
      };
      
      // Get parser statistics
      const parserStats = this.db.prepare(`
        SELECT parser_used, COUNT(*) as count, AVG(parser_confidence) as avg_confidence
        FROM enhanced_symbols
        GROUP BY parser_used
      `).all() as any[];
      
      // Get stage statistics
      const stageStats = this.db.prepare(`
        SELECT pipeline_stage, COUNT(*) as count
        FROM enhanced_symbols
        WHERE pipeline_stage IS NOT NULL
        GROUP BY pipeline_stage
      `).all() as any[];
      
      return {
        overview,
        parserStats,
        stageStats
      };
    } catch (error) {
      console.error('Error getting index stats:', error);
      return { error: 'Failed to get index statistics' };
    }
  }

  private async handleClearCache() {
    try {
      this.patternAwareIndexer.clearPatternCache();
      return {
        content: [{ type: 'text', text: 'Pattern cache cleared successfully' }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error clearing cache: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  private async handleFindInNamespace(args: any) {
    const params = z.object({
      namespace: z.string()
    }).parse(args);
    
    try {
      const results = await this.priority1Tools.findInNamespace(params.namespace);
      
      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No symbols found in namespace: ${params.namespace}` }]
        };
      }
      
      let output = `Found symbols in namespace pattern "${params.namespace}":\n\n`;
      
      for (const nsGroup of results) {
        output += `📦 ${nsGroup.namespace} (${nsGroup.symbolCount} symbols)\n`;
        output += '─'.repeat(50) + '\n';
        
        // Group by kind
        const byKind = new Map<string, any[]>();
        for (const symbol of nsGroup.symbols) {
          if (!byKind.has(symbol.kind)) {
            byKind.set(symbol.kind, []);
          }
          byKind.get(symbol.kind)!.push(symbol);
        }
        
        for (const [kind, symbols] of byKind) {
          output += `\n${kind}s:\n`;
          for (const sym of symbols) {
            output += `  • ${sym.name}`;
            if (sym.return_type) output += ` → ${sym.return_type}`;
            output += `\n    ${sym.file_path}:${sym.line}\n`;
          }
        }
        output += '\n';
      }
      
      return {
        content: [{ type: 'text', text: output }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error searching namespace: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  private async handleResolveSymbol(args: any) {
    const params = z.object({
      symbolName: z.string(),
      fromNamespace: z.string(),
      fromFile: z.string()
    }).parse(args);
    
    try {
      const results = await this.priority1Tools.resolveSymbol(
        params.symbolName,
        params.fromNamespace,
        params.fromFile
      );
      
      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `Symbol "${params.symbolName}" not found from namespace "${params.fromNamespace}"` }]
        };
      }
      
      let output = `Symbol resolution for "${params.symbolName}" from namespace "${params.fromNamespace}":\n\n`;
      
      for (const result of results) {
        output += `${result.priority === 1 ? '✅' : '📍'} ${result.qualified_name}\n`;
        output += `  Namespace: ${result.namespace || 'global'}\n`;
        output += `  Context: ${result.resolution_context}\n`;
        output += `  Location: ${result.file_path}:${result.line}\n`;
        if (result.signature) {
          output += `  Signature: ${result.signature}\n`;
        }
        output += '\n';
      }
      
      return {
        content: [{ type: 'text', text: output }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error resolving symbol: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true
      };
    }
  }

  private async handleGenerateVisualization(args: any) {
    const params = z.object({
      outputDir: z.string().default('./visualizations'),
      includeInteractive: z.boolean().default(true)
    }).parse(args);
    
    try {
      // Lazy import to avoid loading visualization code unless needed
      const { ProjectVisualizer } = await import('./visualization/project-visualizer.js');
      const { CallFlowVisualizer } = await import('./visualization/call-flow-visualizer.js');
      const visualizer = new ProjectVisualizer(this.dbPath);
      const callFlowViz = new CallFlowVisualizer(this.dbPath);
      
      // Create output directory
      await fs.mkdir(params.outputDir, { recursive: true });
      
      let generatedFiles: string[] = [];
      
      // Generate SVG treemap
      const svg = await visualizer.generateTreemapSVG(1400, 900);
      const svgPath = path.join(params.outputDir, 'project-treemap.svg');
      await fs.writeFile(svgPath, svg);
      generatedFiles.push(svgPath);
      
      if (params.includeInteractive) {
        // Generate interactive HTML
        const html = await visualizer.generateInteractiveHTML();
        const htmlPath = path.join(params.outputDir, 'project-architecture.html');
        await fs.writeFile(htmlPath, html);
        generatedFiles.push(htmlPath);
        
        // Generate dependency matrix
        const matrix = await visualizer.generateDependencyMatrix();
        const matrixHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Module Dependency Matrix</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        table { margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Planet ProcGen - Module Dependency Matrix</h1>
    <p>Darker red indicates more dependencies between modules.</p>
    ${matrix}
</body>
</html>`;
        const matrixPath = path.join(params.outputDir, 'dependency-matrix.html');
        await fs.writeFile(matrixPath, matrixHtml);
        generatedFiles.push(matrixPath);
      }
      
      visualizer.close();
      
      // Also generate call flow for VisualFeedbackApplication
      try {
        const callFlowHtml = await callFlowViz.generateCallFlowHTML('VisualFeedbackApplication');
        const callFlowPath = path.join(params.outputDir, 'call-flow-visualfeedbackapplication.html');
        await fs.writeFile(callFlowPath, callFlowHtml);
        generatedFiles.push(callFlowPath);
        callFlowViz.close();
      } catch (callFlowError) {
        // Continue even if call flow fails
        console.error('Call flow generation failed:', callFlowError);
      }
      
      return {
        content: [{ 
          type: 'text', 
          text: `Visualizations generated successfully!\n\nFiles created:\n${generatedFiles.map(f => `- ${f}`).join('\n')}\n\nOpen project-architecture.html or call-flow-visualfeedbackapplication.html in a browser for interactive views.` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error generating visualizations: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  // Claude Validation Handler Methods
  private async handleValidateClaudeCode(args: any) {
    if (!this.claudeValidationTool) {
      return {
        content: [{ 
          type: 'text', 
          text: 'Claude validation not available - GEMINI_API_KEY not configured' 
        }],
        isError: true
      };
    }

    try {
      const result = await this.claudeValidationTool.handleToolCall('validate_claude_code', args);
      
      return {
        content: [{ 
          type: 'text', 
          text: result.success ? 
            `✅ Code validation complete!\n\n${'report' in result ? result.report : 'No detailed report available'}` :
            `❌ Validation failed: ${result.error}`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error validating Claude code: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleValidateCodeSnippet(args: any) {
    if (!this.claudeValidationTool) {
      return {
        content: [{ 
          type: 'text', 
          text: 'Claude validation not available - GEMINI_API_KEY not configured' 
        }],
        isError: true
      };
    }

    try {
      const result = await this.claudeValidationTool.handleToolCall('validate_code_snippet', args);
      
      return {
        content: [{ 
          type: 'text', 
          text: result.success ? 
            `✅ Code snippet validation complete!\n\n${'report' in result ? result.report : 'No detailed report available'}` :
            `❌ Validation failed: ${result.error}`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error validating code snippet: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleGetValidationStats(args: any) {
    if (!this.claudeValidationTool) {
      return {
        content: [{ 
          type: 'text', 
          text: 'Claude validation not available - GEMINI_API_KEY not configured' 
        }],
        isError: true
      };
    }

    try {
      const result = await this.claudeValidationTool.handleToolCall('get_validation_stats', args);
      
      if (!result.success) {
        return {
          content: [{ 
            type: 'text', 
            text: `❌ Failed to get validation stats: ${result.error}` 
          }],
          isError: true
        };
      }

      const stats = ('statistics' in result) ? result.statistics : {};
      const summary = ('summary' in result) ? result.summary : null;
      
      let report = `📊 **Claude Validation Statistics**\n\n`;
      report += `🔍 **Summary:**\n`;
      report += `- Total Validations: ${summary?.totalValidations || 0}\n`;
      report += `- Approval Rate: ${summary?.approvalRate || '0%'}\n`;
      report += `- Average Confidence: ${summary?.averageConfidence || '0%'}\n\n`;
      
      if (summary?.topHallucinations && Array.isArray(summary.topHallucinations) && summary.topHallucinations.length > 0) {
        report += `🚨 **Most Common Hallucinations:**\n`;
        summary.topHallucinations.slice(0, 5).forEach((h: any, i: number) => {
          report += `${i + 1}. ${h.type}: \`${h.item}\` (${h.count} times)\n`;
        });
        report += '\n';
      }

      if ('sessionValidation' in result && result.sessionValidation) {
        const session = result.sessionValidation;
        report += `🎯 **Current Session:**\n`;
        report += `- Valid: ${session.isValid ? '✅' : '❌'}\n`;
        report += `- Confidence: ${(session.confidence * 100).toFixed(1)}%\n`;
        report += `- Recommendation: ${session.recommendation.toUpperCase()}\n`;
        if (session.hallucinations && session.hallucinations.length > 0) {
          report += `- Hallucinations: ${session.hallucinations.length}\n`;
        }
      }
      
      return {
        content: [{ 
          type: 'text', 
          text: report
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error getting validation stats: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  // Agent Feedback Handler Methods
  private async handleRecordAgentFeedback(args: any) {
    const params = z.object({
      sessionId: z.string(),
      agentName: z.string(),
      feedbackType: z.enum(['tool_failure', 'missing_context', 'success', 'clarification_needed']),
      toolName: z.string().optional(),
      toolParams: z.any().optional(),
      expectedOutcome: z.string().optional(),
      actualOutcome: z.string().optional(),
      errorMessage: z.string().optional(),
      resolution: z.string().optional()
    }).parse(args);

    try {
      await this.thoughtSignaturePreserver.recordAgentFeedback(params);
      return {
        content: [{ 
          type: 'text', 
          text: `✅ Agent feedback recorded successfully for ${params.feedbackType}${params.toolName ? ` with tool ${params.toolName}` : ''}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error recording agent feedback: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleRecordContextGap(args: any) {
    const params = z.object({
      sessionId: z.string(),
      missingContextType: z.enum(['symbol_info', 'file_relationship', 'architectural_pattern', 'dependency', 'usage_example']),
      description: z.string(),
      requestedByAgent: z.string(),
      contextQuery: z.string().optional()
    }).parse(args);

    try {
      const gapId = await this.thoughtSignaturePreserver.recordContextGap(params);
      return {
        content: [{ 
          type: 'text', 
          text: `✅ Context gap recorded (ID: ${gapId}). Type: ${params.missingContextType}\nDescription: ${params.description}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error recording context gap: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleGetEnhancedContext(args: any) {
    const params = z.object({
      sessionId: z.string(),
      contextType: z.string()
    }).parse(args);

    try {
      const enhancedContext = await this.thoughtSignaturePreserver.getEnhancedContext(
        params.sessionId,
        params.contextType
      );
      
      return {
        content: [{ 
          type: 'text', 
          text: JSON.stringify(enhancedContext, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error getting enhanced context: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleAnalyzeFeedbackPatterns(args: any) {
    const params = z.object({
      sessionId: z.string().optional()
    }).parse(args);

    try {
      const analysis = await this.thoughtSignaturePreserver.analyzePatterns(params.sessionId);
      
      let report = `📊 **Feedback Pattern Analysis**\n\n`;
      
      if (analysis.toolFailures.length > 0) {
        report += `🔧 **Tool Failures:**\n`;
        analysis.toolFailures.slice(0, 5).forEach((tf: any) => {
          report += `- ${tf.tool_name}: ${tf.failure_count} failures (avg confidence: ${(tf.avg_confidence * 100).toFixed(1)}%)\n`;
        });
        report += '\n';
      }
      
      if (analysis.contextGaps.length > 0) {
        report += `🔍 **Context Gaps:**\n`;
        analysis.contextGaps.slice(0, 5).forEach((cg: any) => {
          report += `- ${cg.missing_context_type}: ${cg.gap_count} occurrences (${cg.resolution_status})\n`;
        });
        report += '\n';
      }
      
      if (analysis.recommendations.length > 0) {
        report += `💡 **Recommendations:**\n`;
        analysis.recommendations.forEach((rec: string) => {
          report += `- ${rec}\n`;
        });
        report += '\n';
      }
      
      report += `📈 **Improvement Metrics:**\n`;
      Object.entries(analysis.improvementMetrics).forEach(([period, metrics]: [string, any]) => {
        report += `- ${period}: Success rate ${metrics.successRate.toFixed(1)}%, Resolution rate ${metrics.resolutionRate.toFixed(1)}%\n`;
      });
      
      return {
        content: [{ type: 'text', text: report }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error analyzing feedback patterns: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleGetFeedbackStats(args: any) {
    const params = z.object({
      sessionId: z.string().optional()
    }).parse(args);

    try {
      const stats = await this.thoughtSignaturePreserver.getFeedbackStats(params.sessionId);
      
      let report = `📊 **Agent Feedback Statistics**\n\n`;
      report += `📝 **Total Feedback:** ${stats.totalFeedback}\n\n`;
      
      if (Object.keys(stats.feedbackByType).length > 0) {
        report += `**Feedback by Type:**\n`;
        Object.entries(stats.feedbackByType).forEach(([type, count]) => {
          report += `- ${type}: ${count}\n`;
        });
        report += '\n';
      }
      
      report += `**Context Gap Stats:**\n`;
      report += `- Total: ${stats.contextGapStats.total}\n`;
      report += `- Resolved: ${stats.contextGapStats.resolved}\n`;
      report += `- Pending: ${stats.contextGapStats.pending}\n`;
      report += `- Avg Resolution Time: ${(stats.contextGapStats.avgResolutionTime / 1000).toFixed(1)}s\n\n`;
      
      report += `**Learning Pattern Stats:**\n`;
      report += `- Total Patterns: ${stats.learningPatternStats.total}\n`;
      report += `- Avg Success Rate: ${(stats.learningPatternStats.avgSuccessRate * 100).toFixed(1)}%\n\n`;
      
      if (stats.topTools.length > 0) {
        report += `**Top Tools:**\n`;
        stats.topTools.forEach((tool: any) => {
          const successRate = tool.usage_count > 0 ? (tool.success_count / tool.usage_count * 100).toFixed(1) : '0.0';
          report += `- ${tool.tool_name}: ${tool.usage_count} uses (${successRate}% success)\n`;
        });
      }
      
      return {
        content: [{ type: 'text', text: report }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error getting feedback stats: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  // High-value refactoring tool handlers
  private async handleFindCallers(args: any) {
    const params = z.object({
      symbolName: z.string()
    }).parse(args);

    try {
      const results = await this.priority2Tools.findCallers(params.symbolName);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error finding callers: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleCheckInlineSafety(args: any) {
    const params = z.object({
      symbolName: z.string()
    }).parse(args);

    try {
      const results = await this.priority2Tools.checkInlineSafety(params.symbolName);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error checking inline safety: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  private async handleAnalyzeRename(args: any) {
    const params = z.object({
      oldName: z.string(),
      newName: z.string()
    }).parse(args);

    try {
      const results = await this.priority2Tools.analyzeRename(params.oldName, params.newName);
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: 'text', 
          text: `Error analyzing rename: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }

  async start(): Promise<void> {
    // Ensure database directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Module Sentinel MCP Server started');
  }

  async shutdown(): Promise<void> {
    // Stop file watcher before shutting down
    if (this.fileWatcher) {
      this.fileWatcher.stop();
      console.error('File watcher stopped');
    }

    if (this.visualizationAPI) {
      await this.visualizationAPI.shutdown();
      console.error('Visualization API server stopped');
    }
    
    // Close database and server
    this.db.close();
    await this.server.close();
  }
}

// Main entry point
async function main() {
  // Check if running in test environment or script environment
  const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                            process.argv.some(arg => arg.includes('test')) ||
                            process.argv.some(arg => arg.includes('TestRunner')) ||
                            process.argv.some(arg => arg.includes('run-tests'));
  
  const isScriptEnvironment = process.env.MODULE_SENTINEL_SCRIPT_MODE === 'true';
  
  if (isTestEnvironment) {
    console.log('🧪 Test environment detected - MCP server will not auto-start');
    return;
  }
  
  if (isScriptEnvironment) {
    console.log('📜 Script environment detected - MCP server will not auto-start');
    return;
  }
  
  const server = new ModuleSentinelMCPServer();
  
  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.error('\nShutting down Module Sentinel...');
    await server.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down Module Sentinel...');
    await server.shutdown();
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start Module Sentinel:', error);
    process.exit(1);
  }
}

// Only start if not in test environment
if (!module.parent) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}