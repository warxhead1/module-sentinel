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
import { AnalyticsService } from './services/analytics-service.js';
import { UnifiedSchemaManager } from './database/unified-schema-manager.js';
import { FileWatcher } from './services/file-watcher.js';
import { ThoughtSignaturePreserver } from './engines/thought-signature.js';
import { ClaudeValidationTool } from './tools/claude-validation-tool.js';
import { VisualizationAPI } from './api/visualization-api.js';
import { SecureConfigManager } from './utils/secure-config.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';

class ModuleSentinelMCPServer {
  private server: Server;
  private priority1Tools: Priority1Tools;
  private priority2Tools: Priority2Tools;
  private unifiedSearch: UnifiedSearch;
  private patternAwareIndexer: PatternAwareIndexer;
  private analyticsService: AnalyticsService;
  private dbPath: string;
  private db: Database.Database;
  private schemaManager: UnifiedSchemaManager;
  private fileWatcher: FileWatcher;
  private thoughtSignaturePreserver: ThoughtSignaturePreserver;
  private claudeValidationTool?: ClaudeValidationTool;
  private visualizationAPI?: VisualizationAPI;

  constructor() {
    // Load environment variables (for backwards compatibility)
    dotenv.config();
    
    // Get configuration from secure location
    const secureConfig = SecureConfigManager.getConfig();
    
    // Use secure config, then environment variables, then defaults
    const projectPath = secureConfig.projectPath || 
                        process.env.MODULE_SENTINEL_PROJECT_PATH || 
                        '/home/warxh/planet_procgen';
    
    const dbDir = secureConfig.dbPath ? path.dirname(secureConfig.dbPath) :
                  process.env.MODULE_SENTINEL_DB_PATH || 
                  path.join(process.env.HOME || '/tmp', '.module-sentinel');
    
    this.dbPath = secureConfig.dbPath || path.resolve(dbDir, 'module-sentinel.db');
    
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
    this.schemaManager = UnifiedSchemaManager.getInstance();
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
    this.patternAwareIndexer = new PatternAwareIndexer(projectPath, this.dbPath, debugMode);
    this.analyticsService = new AnalyticsService(this.db);
    
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
    
    // Initialize file watcher
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
    
    // Auto-index on startup, then start file watcher
    this.autoIndex();

    // Start the visualization server
    this.visualizationAPI = new VisualizationAPI(this.dbPath, 8081);
  }

  private async autoIndex(): Promise<void> {
    try {
      // Check if index exists and has content
      const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any;
      
      if (symbolCount.count === 0) {
        console.error('Building initial index...');
        await this.handleRebuildIndex({ projectPath: '/home/warxh/planet_procgen' });
        console.error('Index built successfully');
      } else {
        console.error(`Index already exists with ${symbolCount.count} symbols`);
      }
      
      // Start file watcher after index is ready
      console.error('Starting file watcher...');
      await this.fileWatcher.start();
      console.error('File watcher started - monitoring for changes');
    } catch (error) {
      console.error('Auto-indexing failed:', error);
    }
  }

  private setupTools(): void {
    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
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
            
            case 'generate_visualization':
              return await this.handleGenerateVisualization(request.params.arguments);
            
            // Claude Validation Tools
            case 'validate_claude_code':
              return await this.handleValidateClaudeCode(request.params.arguments);
            case 'validate_code_snippet':
              return await this.handleValidateCodeSnippet(request.params.arguments);
            case 'get_validation_stats':
              return await this.handleGetValidationStats(request.params.arguments);
            
            // Agent Feedback Tools
            case 'record_agent_feedback':
              return await this.handleRecordAgentFeedback(request.params.arguments);
            case 'record_context_gap':
              return await this.handleRecordContextGap(request.params.arguments);
            case 'get_enhanced_context':
              return await this.handleGetEnhancedContext(request.params.arguments);
            case 'analyze_feedback_patterns':
              return await this.handleAnalyzeFeedbackPatterns(request.params.arguments);
            case 'get_feedback_stats':
              return await this.handleGetFeedbackStats(request.params.arguments);
              
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
            description: 'Rebuild the code index',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: {
                  type: 'string',
                  description: 'Path to the project to index'
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
            const indexStats = await this.analyticsService.getIndexStats();
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(indexStats, null, 2)
              }]
            };
            
          case 'module-sentinel://parser-metrics':
            const parserMetrics = this.schemaManager.getParserQualityMetrics(this.db);
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(parserMetrics, null, 2)
              }]
            };
            
          case 'module-sentinel://analytics-report':
            const analyticsReport = this.schemaManager.getIntegrationHealthReport(this.db);
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(analyticsReport, null, 2)
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
      projectPath: z.string()
    }).parse(args);
    
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
    
    const uniqueFiles = [...new Set(allFiles)].sort();
    const fullPaths = uniqueFiles.map(f => path.join(params.projectPath, f));
    
    // Index in batches
    const batchSize = 50;
    let totalIndexed = 0;
    
    for (let i = 0; i < fullPaths.length; i += batchSize) {
      const batch = fullPaths.slice(i, i + batchSize);
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
        await this.patternAwareIndexer.indexFiles(existingPaths);
        totalIndexed += existingPaths.length;
      }
    }
    
    const symbolCount = this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any;
    
    return {
      content: [{ type: 'text', text: `Index rebuilt: ${symbolCount.count} symbols from ${totalIndexed} files` }]
    };
  }

  private async handleIndexStatus() {
    const stats = await this.analyticsService.getIndexStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }]
    };
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

  async start(): Promise<void> {
    // Ensure database directory exists
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Module Sentinel MCP Server started');
  }

  async shutdown(): Promise<void> {
    // Stop file watcher before shutting down
    this.fileWatcher.stop();
    console.error('File watcher stopped');

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

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});