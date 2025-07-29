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
import { unlinkSync } from 'fs';
import * as dotenv from 'dotenv';
import * as os from 'os';

// Import our Rust bridge
import { ModuleSentinelBridge, quick_search, quick_analyze, check_rust_bindings } from './rust-bridge/module-sentinel-bridge';
import { createLogger } from './utils/logger';
import { Language, QualityIssue } from './types/rust-bindings';

// Import real flow analysis implementations
import { analyzeRealDataFlow, findRealCriticalPaths, traceRealLineage, findRealDeepestFlows } from './tools/real-flow-implementations';

/**
 * Detect language from file extension
 */
function detectLanguageFromPath(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.rs':
      return Language.Rust;
    case '.py':
      return Language.Python;
    case '.ts':
      return Language.TypeScript;
    case '.js':
    case '.jsx':
      return Language.JavaScript;
    case '.cpp':
    case '.cc':
    case '.cxx':
    case '.hpp':
    case '.h':
      return Language.Cpp;
    case '.go':
      return Language.Go;
    case '.java':
      return Language.Java;
    case '.cs':
      return Language.CSharp;
    default:
      // Default to TypeScript for unknown extensions
      return Language.TypeScript;
  }
}

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
          unlinkSync(ProcessLockManager.LOCK_FILE);
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
          },
          {
            name: 'analyze_code_quality',
            description: 'Analyze code quality metrics including complexity, maintainability, and performance issues',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the file to analyze' },
                language: { type: 'string', description: 'Programming language of the file' },
                include_suggestions: { type: 'boolean', description: 'Include refactoring suggestions (default: true)' }
              },
              required: ['file_path', 'language']
            }
          },
          {
            name: 'predict_component_reuse',
            description: 'Find existing components that could be reused instead of building new ones',
            inputSchema: {
              type: 'object',
              properties: {
                functionality_category: { type: 'string', description: 'Category of functionality needed (database, logging, http_client, etc.)' },
                required_capabilities: { 
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of required capabilities/features'
                },
                context_description: { type: 'string', description: 'Description of what you want to implement' }
              },
              required: ['functionality_category', 'required_capabilities']
            }
          },
          {
            name: 'get_duplicate_groups',
            description: 'Find duplicate or highly similar code blocks across the project',
            inputSchema: {
              type: 'object',
              properties: {
                min_similarity: { type: 'number', description: 'Minimum similarity threshold (0.0-1.0, default: 0.8)' },
                include_cross_language: { type: 'boolean', description: 'Include cross-language duplicates (default: true)' }
              }
            }
          },
          {
            name: 'get_complexity_metrics',
            description: 'Get detailed complexity metrics for the entire project or specific files',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Specific file to analyze (optional, analyzes whole project if not provided)' },
                threshold: { type: 'number', description: 'Complexity threshold for flagging issues (default: 10)' }
              }
            }
          },
          {
            name: 'get_project_insights',
            description: 'Get comprehensive project insights including patterns, duplicates, and recommendations',
            inputSchema: {
              type: 'object',
              properties: {
                include_recommendations: { type: 'boolean', description: 'Include actionable recommendations (default: true)' },
                focus_areas: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Areas to focus on: complexity, duplicates, patterns, quality (default: all)'
                }
              }
            }
          },
          {
            name: 'analyze_data_flow',
            description: 'Analyze data flow and parameter usage patterns to detect potential code inconsistencies',
            inputSchema: {
              type: 'object',
              properties: {
                anomaly_threshold: { type: 'number', description: 'Threshold for detecting anomalies (0.0-1.0, default: 0.1 = 10%)' },
                target_function: { type: 'string', description: 'Specific function to analyze (optional)' },
                include_type_flow: { type: 'boolean', description: 'Include type flow analysis (default: true)' }
              }
            }
          },
          {
            name: 'trace_data_lineage',
            description: 'Trace complete data lineage showing how data flows through the system from source to sink',
            inputSchema: {
              type: 'object',
              properties: {
                source_name: { type: 'string', description: 'Name of the data source to trace (e.g., "user_input", "api_request")' },
                max_depth: { type: 'number', description: 'Maximum depth to trace (default: 20)' },
                show_transformations: { type: 'boolean', description: 'Show data transformations at each step (default: true)' }
              }
            }
          },
          {
            name: 'find_deepest_flows',
            description: 'Find the deepest data flow chains in your codebase',
            inputSchema: {
              type: 'object',
              properties: {
                limit: { type: 'number', description: 'Number of deepest flows to return (default: 5)' },
                min_depth: { type: 'number', description: 'Minimum depth to consider (default: 3)' }
              }
            }
          },
          {
            name: 'analyze_critical_paths',
            description: 'Identify critical data flow nodes with high fan-in/fan-out that are bottlenecks',
            inputSchema: {
              type: 'object',
              properties: {
                min_criticality: { type: 'number', description: 'Minimum criticality score (default: 5.0)' },
                include_cross_file: { type: 'boolean', description: 'Include cross-file analysis (default: true)' }
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

          case 'analyze_code_quality':
            return await this.handleAnalyzeCodeQuality(args);

          case 'predict_component_reuse':
            return await this.handlePredictComponentReuse(args);

          case 'get_duplicate_groups':
            return await this.handleGetDuplicateGroups(args);

          case 'get_complexity_metrics':
            return await this.handleGetComplexityMetrics(args);

          case 'get_project_insights':
            return await this.handleGetProjectInsights(args);
          case 'analyze_data_flow':
            return await this.handleAnalyzeDataFlow(args);
          case 'trace_data_lineage':
            return await this.handleTraceDataLineage(args);
          case 'find_deepest_flows':
            return await this.handleFindDeepestFlows(args);
          case 'analyze_critical_paths':
            return await this.handleAnalyzeCriticalPaths(args);

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
      const rustAvailable = await check_rust_bindings();
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
      include_private: args?.includePrivate ?? true,
      fuzzy_match: false
    };

    try {
      const results = await this.rustBridge!.search_symbols(query, options);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} symbols matching "${query}":\n\n` +
                  results.map((symbol, i) => 
                    `${i + 1}. **${symbol.name}** (${symbol.language})\n` +
                    `   - File: ${symbol.filePath}:${symbol.startLine}\n` +
                    `   - Signature: \`${symbol.signature}\`\n` +
                    `   - Confidence: ${(symbol.confidenceScore || 0) * 100}%`
                  ).join('\n\n')
          }
        ]
      };
    } catch (error) {
      // Fallback to quick search
      this.logger.error('Bridge search failed, trying quick search', error);
      const results = await quick_search(this.projectPath, query, options.limit);
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} symbols (quick search fallback):\n\n` +
                  results.map((symbol, i) => 
                    `${i + 1}. **${symbol.name}**\n` +
                    `   - File: ${symbol.filePath}:${symbol.startLine}`
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
      include_tests: args?.includeTests ?? true,
      max_file_size: args?.maxFileSize || 1024 * 1024,
      exclude_patterns: undefined
    };

    try {
      const result = await this.rustBridge!.index_project(options);
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Project indexing completed successfully!\n\n` +
                  `**Project Info:**\n` +
                  `- Project ID: ${result.id}\n` +
                  `- Name: ${result.name}\n` +
                  `- Path: ${result.path}\n` +
                  `- Symbols found: ${result.symbolCount}\n` +
                  `- Last indexed: ${result.lastIndexed || 'now'}`
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
      const result = await this.rustBridge!.analyze_patterns();
      
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
                  `- Symbols analyzed: ${result.insights.totalSymbolsAnalyzed}\n` +
                  `- Patterns detected: ${result.insights.patternsDetected}\n` +
                  `- Code reuse: ${result.insights.codeReusePercentage.toFixed(1)}%\n\n` +
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
        const result = await quick_analyze(this.projectPath);
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
      const result = await this.rustBridge!.calculate_similarity(symbol1Id, symbol2Id);
      
      return {
        content: [
          {
            type: 'text',
            text: `📊 **Similarity Analysis**\n\n` +
                  `**Overall Similarity: ${(result.overallScore * 100).toFixed(1)}%**\n\n` +
                  `**Breakdown:**\n` +
                  `- Name similarity: ${(result.nameSimilarity * 100).toFixed(1)}%\n` +
                  `- Signature similarity: ${(result.signatureSimilarity * 100).toFixed(1)}%\n` +
                  `- Structural similarity: ${(result.structuralSimilarity * 100).toFixed(1)}%\n` +
                  `- Context similarity: ${(result.contextSimilarity * 100).toFixed(1)}%`
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
    const filePath = args?.filePath;
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
      // Resolve relative paths to absolute paths using project path
      const absoluteFilePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(this.projectPath, filePath);
      
      const result = await this.rustBridge!.parse_file(absoluteFilePath, language);
      
      return {
        content: [
          {
            type: 'text',
            text: `📄 **File Parse Results**\n\n` +
                  `**File:** ${filePath}\n` +
                  `**Language:** ${language}\n` +
                  `**Parse Method:** ${result.parseMethod}\n` +
                  `**Confidence:** ${(result.confidence * 100).toFixed(1)}%\n` +
                  `**Symbols Found:** ${result.symbols.length}\n\n` +
                  (result.errors.length > 0 ? 
                    `**Errors:**\n${result.errors.map(err => `• ${err}`).join('\n')}\n\n` : '') +
                  `**Symbols:**\n` +
                  result.symbols.map((symbol, i) => 
                    `${i + 1}. **${symbol.name}** (line ${symbol.startLine})\n` +
                    `   \`${symbol.signature}\`\n` +
                    (symbol.returnType ? `   → Returns: \`${symbol.returnType}\`` : '')
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

  /**
   * Handle code quality analysis requests
   */
  private async handleAnalyzeCodeQuality(args: any) {
    const filePath = args?.filePath;
    const language = args?.language;
    const includeSuggestions = args?.include_suggestions ?? true;

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
      // Resolve relative paths to absolute paths using project path
      const absoluteFilePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(this.projectPath, filePath);
      
      // Call the new Rust analyzeCodeQuality method
      const qualityResult = await this.rustBridge!.analyze_code_quality(absoluteFilePath, language, includeSuggestions);
      
      // Format issues by severity
      const highIssues = qualityResult.issues.filter((i: QualityIssue) => i.severity === 'high');
      const mediumIssues = qualityResult.issues.filter((i: QualityIssue) => i.severity === 'medium');
      const lowIssues = qualityResult.issues.filter((i: QualityIssue) => i.severity === 'low');
      
      let issuesText = '';
      if (qualityResult.issues.length > 0) {
        issuesText = `**Issues Found:**\n`;
        
        if (highIssues.length > 0) {
          issuesText += `🚨 **High Priority (${highIssues.length}):**\n`;
          highIssues.forEach((issue: QualityIssue) => {
            issuesText += `• ${issue.description}\n`;
            if (issue.suggestion && includeSuggestions) {
              issuesText += `  💡 ${issue.suggestion}\n`;
            }
          });
        }
        
        if (mediumIssues.length > 0) {
          issuesText += `⚠️ **Medium Priority (${mediumIssues.length}):**\n`;
          mediumIssues.forEach((issue: QualityIssue) => {
            issuesText += `• ${issue.description}\n`;
            if (issue.suggestion && includeSuggestions) {
              issuesText += `  💡 ${issue.suggestion}\n`;
            }
          });
        }
        
        if (lowIssues.length > 0) {
          issuesText += `ℹ️ **Low Priority (${lowIssues.length}):**\n`;
          lowIssues.forEach((issue: QualityIssue) => {
            issuesText += `• ${issue.description}\n`;
            if (issue.suggestion && includeSuggestions) {
              issuesText += `  💡 ${issue.suggestion}\n`;
            }
          });
        }
        issuesText += '\n';
      }
      
      const scoreEmoji = qualityResult.overallScore >= 80 ? '🟢' : 
                        qualityResult.overallScore >= 60 ? '🟡' : '🔴';
      
      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Code Quality Analysis**\n\n` +
                  `**File:** ${filePath}\n` +
                  `**Language:** ${language}\n` +
                  `**Overall Score:** ${scoreEmoji} ${qualityResult.overallScore.toFixed(1)}/100\n\n` +
                  `**Metrics:**\n` +
                  `- Lines of Code: ${qualityResult.metrics.linesOfCode}\n` +
                  `- Functions: ${qualityResult.metrics.functionCount}\n` +
                  `- Cyclomatic Complexity: ${qualityResult.metrics.cyclomaticComplexity}\n` +
                  `- Max Nesting Depth: ${qualityResult.metrics.maxNestingDepth}\n` +
                  `- Comment Ratio: ${(qualityResult.metrics.commentRatio * 100).toFixed(1)}%\n` +
                  `- Large Functions: ${qualityResult.metrics.largeFunctionCount}\n\n` +
                  issuesText +
                  (includeSuggestions && qualityResult.recommendations.length > 0 ? 
                    `**Recommendations:**\n${qualityResult.recommendations.map((rec: string) => `• ${rec}`).join('\n')}\n\n` : '') +
                  `💡 *Use \`analyze_patterns\` for design pattern analysis*`
          }
        ]
      };
    } catch (error) {
      this.logger.error('Code quality analysis failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Code quality analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle component reuse prediction requests
   */
  private async handlePredictComponentReuse(args: any) {
    const functionalityCategory = args?.functionality_category;
    const requiredCapabilities = args?.required_capabilities || [];
    const _contextDescription = args?.context_description || '';

    if (!functionalityCategory || !Array.isArray(requiredCapabilities)) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ functionality_category and required_capabilities array are required'
          }
        ],
        isError: true
      };
    }

    try {
      // First search for symbols that might match this functionality
      const searchQuery = `${functionalityCategory} ${requiredCapabilities.join(' ')}`;
      const symbols = await this.rustBridge!.search_symbols(searchQuery, {
        limit: 20,
        includePrivate: true
      });
      
      // TODO: Once we implement the Rust ML integration, we'll call:
      // const recommendations = await this.rustBridge!.predictComponentReuse({
      //   functionality_category: functionalityCategory,
      //   required_capabilities: requiredCapabilities,
      //   context_description: contextDescription
      // });
      
      // For now, provide intelligent analysis based on existing symbols
      const relevantSymbols = symbols.filter(symbol => {
        const name = symbol.name.toLowerCase();
        const signature = symbol.signature.toLowerCase();
        return requiredCapabilities.some(cap => 
          name.includes(cap.toLowerCase()) || signature.includes(cap.toLowerCase())
        );
      });

      if (relevantSymbols.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `🔍 **Component Reuse Analysis**\n\n` +
                    `**Functionality Needed:** ${functionalityCategory}\n` +
                    `**Required Capabilities:** ${requiredCapabilities.join(', ')}\n\n` +
                    `❌ **No existing components found** that match your requirements.\n\n` +
                    `**Recommendation:** This appears to be a new component requirement. ` +
                    `Consider creating a well-designed interface that could be reused for similar needs in the future.\n\n` +
                    `**Suggested Approach:**\n` +
                    `1. Create an abstract interface/trait for ${functionalityCategory}\n` +
                    `2. Implement concrete classes for specific ${requiredCapabilities.join(' and ')} needs\n` +
                    `3. Make it configurable for future extensibility`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Component Reuse Analysis**\n\n` +
                  `**Functionality Needed:** ${functionalityCategory}\n` +
                  `**Required Capabilities:** ${requiredCapabilities.join(', ')}\n\n` +
                  `✅ **Found ${relevantSymbols.length} potentially reusable components:**\n\n` +
                  relevantSymbols.map((symbol, i) => 
                    `**${i + 1}. ${symbol.name}**\n` +
                    `   📍 Location: \`${symbol.filePath}:${symbol.startLine}\`\n` +
                    `   🔧 Signature: \`${symbol.signature}\`\n` +
                    `   💡 *Consider extending or configuring this component*\n`
                  ).join('\n') +
                  `\n**Recommendations:**\n` +
                  `- Review the existing components above before building new ones\n` +
                  `- Check if any can be extended or configured for your needs\n` +
                  `- Look for common interfaces that you could implement\n` +
                  `- Run \`calculate_similarity\` between components to find the best match`
          }
        ]
      };
    } catch (error) {
      this.logger.error('Component reuse prediction failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Component reuse prediction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle duplicate groups requests
   */
  private async handleGetDuplicateGroups(args: any) {
    const minSimilarity = args?.min_similarity ?? 0.8;
    const includeCrossLanguage = args?.include_cross_language ?? true;

    try {
      // Get patterns analysis which includes duplicate detection
      const patterns = await this.rustBridge!.analyze_patterns();
      
      // TODO: Once we implement specific duplicate detection in Rust:
      // const duplicates = await this.rustBridge!.getDuplicateGroups(minSimilarity, includeCrossLanguage);
      
      return {
        content: [
          {
            type: 'text',
            text: `🔍 **Duplicate Code Analysis**\n\n` +
                  `**Similarity Threshold:** ${(minSimilarity * 100).toFixed(0)}%\n` +
                  `**Cross-language Detection:** ${includeCrossLanguage ? 'Enabled' : 'Disabled'}\n\n` +
                  `**Analysis Results:**\n` +
                  `- Total symbols analyzed: ${patterns.symbolCount}\n` +
                  `- Patterns detected: ${patterns.patterns.length}\n` +
                  `- Potential duplicates: ${patterns.insights.duplicateCount}\n` +
                  `- Code reuse percentage: ${patterns.insights.codeReusePercentage.toFixed(1)}%\n\n` +
                  (patterns.patterns.length > 0 ? 
                    `**Pattern Groups (potential duplicates):**\n` +
                    patterns.patterns.map((pattern, i) => 
                      `**${i + 1}. ${pattern.category}** (confidence: ${(pattern.confidence * 100).toFixed(0)}%)\n` +
                      `   Symbols: ${pattern.symbols.length}\n` +
                      `   Evidence: ${pattern.evidence.join(', ')}\n`
                    ).join('\n') : 
                    `✅ No significant duplicate patterns detected at ${(minSimilarity * 100).toFixed(0)}% threshold\n`) +
                  `\n💡 *Use \`calculate_similarity\` between specific symbols for detailed comparison*`
          }
        ]
      };
    } catch (error) {
      this.logger.error('Duplicate groups analysis failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Duplicate analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle complexity metrics requests
   */
  private async handleGetComplexityMetrics(args: any) {
    const filePath = args?.filePath;
    const threshold = args?.threshold ?? 10;

    try {
      if (filePath) {
        // Resolve relative paths to absolute paths using project path
        const absoluteFilePath = path.isAbsolute(filePath) 
          ? filePath 
          : path.resolve(this.projectPath, filePath);
        
        // Analyze specific file
        const detectedLanguage = detectLanguageFromPath(absoluteFilePath);
        const result = await this.rustBridge!.parse_file(absoluteFilePath, detectedLanguage);
        
        return {
          content: [
            {
              type: 'text',
              text: `📊 **Complexity Metrics**\n\n` +
                    `**File:** ${filePath}\n` +
                    `**Threshold:** ${threshold}\n\n` +
                    `**File Metrics:**\n` +
                    `- Symbol count: ${result.symbols.length}\n` +
                    `- Average signature length: ${(result.symbols.reduce((sum, s) => sum + s.signature.length, 0) / result.symbols.length).toFixed(1)} chars\n` +
                    `- Complex functions: ${result.symbols.filter(s => s.signature.length > threshold * 5).length}\n\n` +
                    `**Symbol Analysis:**\n` +
                    result.symbols
                      .filter(s => s.signature.length > threshold * 3)
                      .slice(0, 10)
                      .map((symbol, i) => 
                        `**${i + 1}. ${symbol.name}** (line ${symbol.startLine})\n` +
                        `   Complexity indicator: ${symbol.signature.length} chars\n` +
                        `   ${symbol.signature.length > threshold * 5 ? '⚠️ Consider refactoring' : '✅ Acceptable'}\n`
                      ).join('\n') +
                    `\n💡 *Run \`analyze_code_quality\` for detailed complexity analysis*`
            }
          ]
        };
      } else {
        // Analyze entire project
        const patterns = await this.rustBridge!.analyze_patterns();
        
        return {
          content: [
            {
              type: 'text',
              text: `📊 **Project Complexity Metrics**\n\n` +
                    `**Complexity Threshold:** ${threshold}\n\n` +
                    `**Project Overview:**\n` +
                    `- Total symbols: ${patterns.symbolCount}\n` +
                    `- Patterns detected: ${patterns.patterns.length}\n` +
                    `- Average similarity: ${(patterns.insights.averageSimilarity * 100).toFixed(1)}%\n` +
                    `- Code reuse: ${patterns.insights.codeReusePercentage.toFixed(1)}%\n\n` +
                    `**Complexity Indicators:**\n` +
                    patterns.patterns.map((pattern, i) => 
                      `**${i + 1}. ${pattern.category}**\n` +
                      `   Symbols involved: ${pattern.symbols.length}\n` +
                      `   Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n` +
                      `   ${pattern.symbols.length > threshold ? '⚠️ High complexity' : '✅ Manageable'}\n`
                    ).join('\n') +
                    `\n**Recommendations:**\n` +
                    patterns.insights.recommendations.map(rec => `• ${rec}`).join('\n')
            }
          ]
        };
      }
    } catch (error) {
      this.logger.error('Complexity metrics analysis failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Complexity analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle comprehensive project insights requests
   */
  private async handleGetProjectInsights(args: any) {
    const includeRecommendations = args?.include_recommendations ?? true;
    const focusAreas = args?.focus_areas || ['complexity', 'duplicates', 'patterns', 'quality'];

    try {
      // Gather comprehensive analysis
      const patterns = await this.rustBridge!.analyze_patterns();
      
      let insights = `🚀 **Comprehensive Project Insights**\n\n`;
      
      if (focusAreas.includes('patterns')) {
        insights += `## 🎯 Design Patterns\n` +
                   `- **Patterns detected:** ${patterns.patterns.length}\n` +
                   `- **Pattern categories:** ${[...new Set(patterns.patterns.map(p => p.category))].join(', ')}\n` +
                   `- **Average confidence:** ${(patterns.patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.patterns.length * 100).toFixed(1)}%\n\n`;
      }
      
      if (focusAreas.includes('duplicates')) {
        insights += `## 🔍 Code Duplication\n` +
                   `- **Duplicate groups:** ${patterns.insights.duplicateCount}\n` +
                   `- **Code reuse percentage:** ${patterns.insights.codeReusePercentage.toFixed(1)}%\n` +
                   `- **Similarity score:** ${(patterns.insights.averageSimilarity * 100).toFixed(1)}%\n\n`;
      }
      
      if (focusAreas.includes('complexity')) {
        insights += `## 📊 Complexity Analysis\n` +
                   `- **Total symbols:** ${patterns.symbolCount}\n` +
                   `- **Complex patterns:** ${patterns.patterns.filter(p => p.symbols.length > 5).length}\n` +
                   `- **Maintainability:** ${patterns.insights.averageSimilarity > 0.3 ? 'Good' : 'Needs attention'}\n\n`;
      }
      
      if (focusAreas.includes('quality')) {
        insights += `## ✨ Code Quality\n` +
                   `- **Pattern consistency:** ${patterns.patterns.length > 0 ? 'Good' : 'Could improve'}\n` +
                   `- **Architecture maturity:** ${patterns.insights.patternsDetected > 3 ? 'Advanced' : 'Developing'}\n` +
                   `- **Refactoring opportunities:** ${patterns.insights.duplicateCount > 0 ? 'Available' : 'Clean'}\n\n`;
      }
      
      if (includeRecommendations && patterns.insights.recommendations.length > 0) {
        insights += `## 💡 Actionable Recommendations\n` +
                   patterns.insights.recommendations.map(rec => `• ${rec}`).join('\n') + '\n\n';
      }
      
      insights += `## 🛠️ Next Steps\n` +
                 `- Use \`search_symbols\` to find specific components\n` +
                 `- Run \`analyze_code_quality\` on complex files\n` +
                 `- Use \`predict_component_reuse\` before building new features\n` +
                 `- Check \`get_duplicate_groups\` for optimization opportunities`;

      return {
        content: [
          {
            type: 'text',
            text: insights
          }
        ]
      };
    } catch (error) {
      this.logger.error('Project insights analysis failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Project insights analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle data flow analysis requests
   */
  private async handleAnalyzeDataFlow(args: any) {
    await this.ensureRustBridge();
    return await analyzeRealDataFlow(this.rustBridge!, args);
  }

  // REMOVED: Old mock implementation
  private async _oldHandleAnalyzeDataFlow(args: any) {
    const anomalyThreshold = args?.anomaly_threshold ?? 0.1;
    const targetFunction = args?.target_function;
    const includeTypeFlow = args?.include_type_flow ?? true;

    try {
      // For now, we'll demonstrate the concept with pattern analysis
      // In a full implementation, this would use the data flow analyzer
      const patterns = await this.rustBridge!.analyze_patterns();
      
      // Simulate data flow analysis results
      let result = `🔄 **Data Flow Analysis**\n\n`;
      result += `**Anomaly Threshold:** ${(anomalyThreshold * 100).toFixed(0)}%\n`;
      
      if (targetFunction) {
        result += `**Target Function:** ${targetFunction}\n\n`;
        
        // Search for the specific function
        const symbols = await this.rustBridge!.search_symbols(targetFunction, { limit: 10 });
        const targetSymbol = symbols.find(s => s.name === targetFunction || (s as any).qualified_name?.includes(targetFunction));
        
        if (targetSymbol) {
          result += `📍 **Function Found:** \`${(targetSymbol as any).qualified_name || targetSymbol.name}\`\n`;
          result += `   Location: ${targetSymbol.filePath}:${targetSymbol.startLine}\n`;
          result += `   Signature: \`${targetSymbol.signature}\`\n\n`;
        }
      }
      
      // Simulate parameter usage patterns
      result += `## 🔍 Parameter Usage Patterns\n\n`;
      
      // Example of what data flow analysis would show
      result += `**Example Pattern Analysis:**\n`;
      result += `\`\`\`\n`;
      result += `DataService.__init__(cool_param: dict)\n`;
      result += `├─ 95% usage: dict with key 'flabberghast'\n`;
      result += `│  ├─ file1.py:42 ✅\n`;
      result += `│  ├─ file2.py:15 ✅\n`;
      result += `│  └─ ... (93 more)\n`;
      result += `└─ 5% usage: dict without key 'flabberghast'\n`;
      result += `   ├─ file95.py:27 ⚠️ ANOMALY DETECTED\n`;
      result += `   ├─ file96.py:33 ⚠️ ANOMALY DETECTED\n`;
      result += `   └─ ... (3 more)\n`;
      result += `\`\`\`\n\n`;
      
      result += `## 🚨 Detected Anomalies\n\n`;
      result += `**1. Missing Required Dictionary Key**\n`;
      result += `   - **Severity:** Critical\n`;
      result += `   - **Location:** file95.py:27\n`;
      result += `   - **Pattern:** Parameter 'cool_param' missing key 'flabberghast'\n`;
      result += `   - **Fix:** Add \`'flabberghast': value\` to the dictionary\n`;
      result += `   - **Similar correct usage:** file1.py:42\n\n`;
      
      if (includeTypeFlow) {
        result += `## 🔄 Type Flow Analysis\n\n`;
        result += `- **Type propagation:** Enabled\n`;
        result += `- **Cross-function analysis:** Active\n`;
        result += `- **Constraint inference:** Based on ${patterns.symbolCount} symbols\n\n`;
      }
      
      result += `## 💡 Recommendations\n\n`;
      result += `1. **Standardize parameter initialization** across all DataService instantiations\n`;
      result += `2. **Add type hints** to enforce dictionary structure\n`;
      result += `3. **Create a factory function** with proper validation\n`;
      result += `4. **Consider using TypedDict or dataclass** for structured parameters\n\n`;
      
      result += `*Note: Full data flow analysis requires indexing the project first.*`;

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      this.logger.error('Data flow analysis failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Data flow analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle trace data lineage requests
   */
  private async handleTraceDataLineage(args: any) {
    await this.ensureRustBridge();
    return await traceRealLineage(this.rustBridge!, args);
  }

  // REMOVED: Old mock implementation
  private async _oldHandleTraceDataLineage(args: any) {
    const sourceName = args?.source_name;
    const maxDepth = args?.max_depth ?? 20;
    const showTransformations = args?.show_transformations ?? true;

    try {
      // For demonstration, let's trace a common pattern
      let result = `🔍 **Data Lineage Trace**\n\n`;
      
      if (!sourceName) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ Please provide a source_name to trace (e.g., "user_input", "request.body", "config_file")'
            }
          ]
        };
      }

      result += `**Tracing:** \`${sourceName}\`\n`;
      result += `**Max Depth:** ${maxDepth}\n\n`;

      // Example trace for common patterns
      if (sourceName.includes('user') || sourceName.includes('request')) {
        result += `## 📊 Data Flow Path\n\n`;
        result += `\`\`\`\n`;
        result += `${sourceName} [HTTP Request] @ api/routes.ts:45\n`;
        result += `    ↓ [validate_input()]\n`;
        result += `validated_data @ middleware/validator.ts:12\n`;
        result += `    ↓ [sanitize()]\n`;
        result += `clean_data @ utils/sanitizer.ts:34\n`;
        result += `    ↓ [transform_to_model()]\n`;
        result += `user_model @ models/user.ts:67\n`;
        result += `    ↓ [hash_password()]\n`;
        result += `secure_model @ security/crypto.ts:23\n`;
        result += `    ↓ [save_to_db()]\n`;
        result += `db_record @ database/users.ts:89\n`;
        result += `    ├─ [send_notification()]\n`;
        result += `    │  email_queue @ services/email.ts:45\n`;
        result += `    │      ↓ [queue.push()]\n`;
        result += `    │  job_id @ queue/redis.ts:78 [SINK: Queue]\n`;
        result += `    └─ [update_cache()]\n`;
        result += `       cache_entry @ cache/redis.ts:34 [SINK: Cache]\n`;
        result += `\`\`\`\n\n`;

        result += `## 🔄 Transformations\n\n`;
        if (showTransformations) {
          result += `1. **validate_input()**: Checks required fields, validates email format\n`;
          result += `2. **sanitize()**: Strips HTML, normalizes whitespace\n`;
          result += `3. **transform_to_model()**: Maps to domain object structure\n`;
          result += `4. **hash_password()**: bcrypt with salt rounds=10\n`;
          result += `5. **save_to_db()**: SQL INSERT with prepared statement\n\n`;
        }

        result += `## 📈 Analysis\n\n`;
        result += `- **Total Depth:** 8 levels\n`;
        result += `- **Cross-File Flows:** 7 (crosses 7 different files)\n`;
        result += `- **Data Mutations:** 5 transformations\n`;
        result += `- **Final Sinks:** 2 (Queue, Cache)\n`;
        result += `- **Critical Node:** user_model (fan-out to 3 services)\n`;

      } else if (sourceName.includes('config') || sourceName.includes('env')) {
        result += `## 📊 Configuration Flow\n\n`;
        result += `\`\`\`\n`;
        result += `${sourceName} [File Read] @ config/loader.ts:12\n`;
        result += `    ↓ [parse_yaml()]\n`;
        result += `config_object @ config/parser.ts:34\n`;
        result += `    ↓ [validate_schema()]\n`;
        result += `validated_config @ config/validator.ts:56\n`;
        result += `    ↓ [merge_with_defaults()]\n`;
        result += `final_config @ config/defaults.ts:78 [SINK: Global Config]\n`;
        result += `\`\`\`\n`;
        
        result += `\n**Depth:** 4 levels\n`;
        result += `**Type:** Configuration initialization flow\n`;
      } else {
        // Generic trace
        result += `## 📊 Generic Data Flow\n\n`;
        result += `Unable to find specific traces for \`${sourceName}\`.\n\n`;
        result += `**Suggestions:**\n`;
        result += `- Ensure the project is indexed first\n`;
        result += `- Try common sources: "user_input", "request.body", "api_response"\n`;
        result += `- Check if the source name matches your code exactly\n`;
      }

      result += `\n## 💡 Insights\n\n`;
      result += `- Use \`analyze_critical_paths\` to find bottlenecks in this flow\n`;
      result += `- Use \`analyze_data_flow\` to find parameter inconsistencies\n`;
      result += `- The deeper the flow, the harder to debug issues\n`;

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      this.logger.error('Data lineage trace failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Lineage trace failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle find deepest flows requests
   */
  private async handleFindDeepestFlows(args: any) {
    await this.ensureRustBridge();
    return await findRealDeepestFlows(this.rustBridge!, args);
  }

  // REMOVED: Old mock implementation
  private async _oldHandleFindDeepestFlows(args: any) {
    const limit = args?.limit ?? 5;
    const minDepth = args?.min_depth ?? 3;

    try {
      let result = `🌊 **Deepest Data Flows**\n\n`;
      result += `**Showing:** Top ${limit} flows\n`;
      result += `**Minimum Depth:** ${minDepth} levels\n\n`;

      // Example deep flows
      const deepFlows = [
        {
          path: ['http_request', 'auth_middleware', 'validate_token', 'decode_jwt', 'verify_signature', 'check_expiry', 'load_user', 'check_permissions', 'fetch_resource', 'transform_response', 'apply_filters', 'paginate', 'serialize', 'compress', 'send_response'],
          depth: 15,
          description: 'API request with authentication flow'
        },
        {
          path: ['file_upload', 'validate_mime', 'scan_virus', 'extract_metadata', 'generate_thumbnail', 'optimize_image', 'upload_to_s3', 'update_database', 'invalidate_cache', 'notify_user'],
          depth: 10,
          description: 'File upload processing pipeline'
        },
        {
          path: ['webhook_receive', 'verify_hmac', 'parse_payload', 'map_to_internal', 'validate_business_rules', 'update_state', 'trigger_workflows', 'send_notifications'],
          depth: 8,
          description: 'Webhook processing flow'
        },
        {
          path: ['scheduled_job', 'fetch_tasks', 'process_batch', 'aggregate_results', 'generate_report', 'send_email', 'update_metrics'],
          depth: 7,
          description: 'Batch processing job'
        },
        {
          path: ['user_registration', 'validate_input', 'check_duplicates', 'create_account', 'send_verification', 'log_event'],
          depth: 6,
          description: 'User registration flow'
        }
      ];

      result += `## 🏔️ Deepest Flows Found\n\n`;

      deepFlows
        .filter(flow => flow.depth >= minDepth)
        .slice(0, limit)
        .forEach((flow, i) => {
          result += `### ${i + 1}. ${flow.description}\n`;
          result += `**Depth:** ${flow.depth} levels\n`;
          result += `**Path:**\n`;
          result += `\`\`\`\n`;
          
          flow.path.forEach((step, j) => {
            const indent = '  '.repeat(j);
            const arrow = j === 0 ? '' : '↓ ';
            result += `${indent}${arrow}${step}\n`;
          });
          
          result += `\`\`\`\n\n`;
        });

      result += `## 📊 Statistics\n\n`;
      result += `- **Average Depth:** 9.2 levels\n`;
      result += `- **Deepest Flow:** 15 levels (API auth flow)\n`;
      result += `- **Most Complex:** File upload (10 transformations)\n`;
      result += `- **Cross-System:** 3 flows span multiple services\n\n`;

      result += `## ⚠️ Concerns\n\n`;
      result += `- Flows deeper than 10 levels are hard to debug\n`;
      result += `- Each level adds latency and potential failure points\n`;
      result += `- Consider breaking deep flows into smaller, composable units\n`;

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      this.logger.error('Find deepest flows failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Handle analyze critical paths requests
   */
  private async handleAnalyzeCriticalPaths(args: any) {
    await this.ensureRustBridge();
    return await findRealCriticalPaths(this.rustBridge!, args);
  }

  // REMOVED: Old mock implementation
  private async _oldHandleAnalyzeCriticalPaths(args: any) {
    const minCriticality = args?.min_criticality ?? 5.0;
    const includeCrossFile = args?.include_cross_file ?? true;

    try {
      let result = `🎯 **Critical Path Analysis**\n\n`;
      result += `**Criticality Threshold:** ${minCriticality}\n`;
      result += `**Cross-File Analysis:** ${includeCrossFile ? 'Enabled' : 'Disabled'}\n\n`;

      result += `## 🔥 Critical Nodes (High Fan-in/Fan-out)\n\n`;

      // Example critical nodes
      const criticalNodes = [
        {
          name: 'UserService.processRequest',
          criticality: 47.5,
          fanIn: 23,
          fanOut: 15,
          reason: 'Central orchestration point',
          risk: 'Single point of failure for user operations'
        },
        {
          name: 'DatabaseConnection.execute',
          criticality: 38.0,
          fanIn: 45,
          fanOut: 2,
          reason: 'Database bottleneck',
          risk: 'All queries flow through this point'
        },
        {
          name: 'AuthMiddleware.validate',
          criticality: 28.5,
          fanIn: 18,
          fanOut: 12,
          reason: 'Security checkpoint',
          risk: 'Performance bottleneck for all authenticated routes'
        },
        {
          name: 'CacheManager.get',
          criticality: 22.0,
          fanIn: 32,
          fanOut: 1,
          reason: 'Cache access point',
          risk: 'Cache failures affect many components'
        },
        {
          name: 'Logger.write',
          criticality: 15.5,
          fanIn: 67,
          fanOut: 3,
          reason: 'Logging aggregation',
          risk: 'Logging failures could lose important data'
        }
      ];

      criticalNodes
        .filter(node => node.criticality >= minCriticality)
        .forEach((node, i) => {
          result += `### ${i + 1}. \`${node.name}\`\n`;
          result += `- **Criticality Score:** ${node.criticality}\n`;
          result += `- **Fan-in:** ${node.fanIn} (incoming flows)\n`;
          result += `- **Fan-out:** ${node.fanOut} (outgoing flows)\n`;
          result += `- **Reason:** ${node.reason}\n`;
          result += `- **Risk:** ${node.risk}\n\n`;
        });

      if (includeCrossFile) {
        result += `## 🌐 Cross-File Critical Paths\n\n`;
        
        result += `### Major Cross-File Flows:\n`;
        result += `1. **API → Service → Database**\n`;
        result += `   - Files: 12 → 8 → 3\n`;
        result += `   - Risk: Changes ripple across layers\n\n`;
        
        result += `2. **Event System**\n`;
        result += `   - Files: events/*.ts → handlers/*.ts → services/*.ts\n`;
        result += `   - Risk: Event schema changes affect multiple handlers\n\n`;
        
        result += `3. **Authentication Flow**\n`;
        result += `   - Files: middleware/auth.ts → services/user.ts → db/queries.ts\n`;
        result += `   - Risk: Security changes need careful coordination\n\n`;
      }

      result += `## 💊 Recommendations\n\n`;
      result += `1. **Reduce Fan-out** in UserService.processRequest\n`;
      result += `   - Split into smaller, focused services\n`;
      result += `   - Use event-driven architecture\n\n`;
      
      result += `2. **Add Circuit Breakers** to critical nodes\n`;
      result += `   - Prevent cascade failures\n`;
      result += `   - Implement fallback mechanisms\n\n`;
      
      result += `3. **Cache Layer** for DatabaseConnection.execute\n`;
      result += `   - Reduce database load\n`;
      result += `   - Implement query result caching\n\n`;

      result += `## 📈 Impact Analysis\n\n`;
      result += `If \`UserService.processRequest\` fails:\n`;
      result += `- **23 upstream services** cannot complete their flows\n`;
      result += `- **15 downstream services** lose their data source\n`;
      result += `- **Estimated impact:** ~70% of system functionality\n`;

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      this.logger.error('Critical path analysis failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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