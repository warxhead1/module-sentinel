import type Database from 'better-sqlite3';
import { CodeFlowService } from '../services/code-flow.service.js';
import type { Request, Response } from '../types/express.js';
import type { ApiResponse } from '../../shared/types/api.js';

export class CodeFlowRoutes {
  private codeFlowService: CodeFlowService;

  constructor(database: Database.Database) {
    this.codeFlowService = new CodeFlowService(database);
  }

  /**
   * Get call graph for a specific symbol
   * GET /api/code-flow/call-graph/:symbolId
   */
  async getCallGraph(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.symbolId, 10);
      const { depth = 1, direction = 'both' } = req.query;

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      const callGraph = await this.codeFlowService.getCallGraph(symbolId, {
        depth: parseInt(String(depth), 10) || 1,
        direction: direction as 'incoming' | 'outgoing' | 'both'
      });

      const response: ApiResponse = {
        success: true,
        data: callGraph
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching call graph:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch call graph'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get execution paths between symbols
   * GET /api/code-flow/execution-paths
   */
  async getExecutionPaths(req: Request, res: Response) {
    try {
      const { startId, endId, maxPaths = 10 } = req.query;

      if (!startId) {
        const response: ApiResponse = {
          success: false,
          error: 'Start symbol ID is required'
        };
        return res.status(400).json(response);
      }

      const startSymbolId = parseInt(String(startId), 10);
      const endSymbolId = endId ? parseInt(String(endId), 10) : undefined;

      if (isNaN(startSymbolId) || (endId && isNaN(endSymbolId!))) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      const paths = await this.codeFlowService.getExecutionPaths(startSymbolId, {
        endSymbolId,
        maxPaths: parseInt(String(maxPaths), 10) || 10,
        includeIncomplete: req.query.includeIncomplete === 'true'
      });

      const response: ApiResponse = {
        success: true,
        data: {
          start_symbol_id: startSymbolId,
          end_symbol_id: endSymbolId,
          paths,
          total_paths: paths.length
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching execution paths:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch execution paths'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get branch analysis for a symbol
   * GET /api/code-flow/branches/:symbolId
   */
  async getBranchAnalysis(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.symbolId, 10);

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      const branchAnalysis = await this.codeFlowService.getBranchAnalysis(symbolId);

      const response: ApiResponse = {
        success: true,
        data: branchAnalysis
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching branch analysis:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch branch analysis'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get unused code paths
   * GET /api/code-flow/unused-paths
   */
  async getUnusedPaths(req: Request, res: Response) {
    try {
      const { projectId, threshold = 0 } = req.query;

      const unusedPaths = await this.codeFlowService.findUnusedPaths({
        projectId: projectId ? parseInt(String(projectId), 10) : undefined,
        threshold: parseInt(String(threshold), 10) || 0
      });

      const response: ApiResponse = {
        success: true,
        data: unusedPaths
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching unused paths:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch unused paths'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get control flow graph for a function
   * GET /api/code-flow/control-flow/:symbolId
   */
  async getControlFlow(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.symbolId, 10);
      const { includeDataFlow = false } = req.query;

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      const controlFlow = await this.codeFlowService.getControlFlow(symbolId, {
        includeDataFlow: includeDataFlow === 'true'
      });

      const response: ApiResponse = {
        success: true,
        data: controlFlow
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching control flow:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch control flow'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get aggregated flow metrics
   * GET /api/code-flow/metrics
   */
  async getFlowMetrics(req: Request, res: Response) {
    try {
      const { projectId } = req.query;

      const metrics = await this.codeFlowService.getFlowMetrics(
        projectId ? parseInt(String(projectId), 10) : undefined
      );

      const response: ApiResponse = {
        success: true,
        data: metrics
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching flow metrics:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch flow metrics'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get complexity metrics for a symbol
   * GET /api/code-flow/complexity/:symbolId
   */
  async getComplexityMetrics(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.symbolId, 10);

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      const complexity = await this.codeFlowService.analyzeComplexity(symbolId);

      const response: ApiResponse = {
        success: true,
        data: complexity
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching complexity metrics:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch complexity metrics'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get execution hotspots
   * GET /api/code-flow/hotspots
   */
  async getHotspots(req: Request, res: Response) {
    try {
      const { projectId, limit = 20, minCalls = 10 } = req.query;

      if (!projectId) {
        const response: ApiResponse = {
          success: false,
          error: 'Project ID is required'
        };
        return res.status(400).json(response);
      }

      const hotspots = await this.codeFlowService.getExecutionHotspots(
        parseInt(String(projectId), 10),
        {
          limit: parseInt(String(limit), 10),
          minCalls: parseInt(String(minCalls), 10)
        }
      );

      const response: ApiResponse = {
        success: true,
        data: hotspots
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching hotspots:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch hotspots'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Get multi-language flow data for a specific symbol
   * GET /api/code-flow/multi-language/:symbolId
   */
  async getMultiLanguageFlow(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.symbolId, 10);
      const { languages = 'cpp,python,typescript' } = req.query;

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      const languageList = String(languages).split(',');

      // Get the call graph with extended depth for multi-language analysis
      const callGraph = await this.codeFlowService.getCallGraph(symbolId, {
        depth: 3,
        direction: 'both',
        includeTransitive: true
      });

      // Transform the call graph data into multi-language flow format
      const nodes = [];
      const edges = [];

      // Add the target symbol as main node
      nodes.push({
        id: `symbol-${callGraph.target.id}`,
        name: callGraph.target.name,
        type: callGraph.target.kind,
        namespace: callGraph.target.namespace,
        file_path: callGraph.target.filePath,
        language: this.detectLanguageFromPath(callGraph.target.filePath),
        languageFeatures: {
          isAsync: callGraph.target.isAsync,
          isExported: callGraph.target.isExported,
          visibility: callGraph.target.visibility
        },
        metrics: {
          incoming_calls: callGraph.metrics.incoming_calls,
          outgoing_calls: callGraph.metrics.outgoing_calls
        }
      });

      // Add caller nodes
      for (const caller of callGraph.callers) {
        const language = this.detectLanguageFromPath(caller.file_path);
        if (languageList.includes(language)) {
          nodes.push({
            id: `symbol-${caller.id}`,
            name: caller.name,
            type: caller.kind,
            namespace: '', // CallGraphNode doesn't have namespace field
            file_path: caller.file_path,
            language,
            languageFeatures: {
              isAsync: false, // CallGraphNode doesn't have async info
              isExported: false, // CallGraphNode doesn't have export info
              visibility: 'public', // CallGraphNode doesn't have visibility info
              spawn: this.detectSpawnType(caller),
              spawnsPython: this.detectPythonSpawn(caller)
            }
          });

          // Add edge from caller to target
          edges.push({
            source: `symbol-${caller.id}`,
            target: `symbol-${callGraph.target.id}`,
            type: caller.call_info.call_type,
            isCrossLanguage: language !== this.detectLanguageFromPath(callGraph.target.filePath),
            sourceLanguage: language,
            targetLanguage: this.detectLanguageFromPath(callGraph.target.filePath),
            details: `${caller.name} ${caller.call_info.call_type} ${callGraph.target.name}`
          });
        }
      }

      // Add callee nodes
      for (const callee of callGraph.callees) {
        const language = this.detectLanguageFromPath(callee.file_path);
        if (languageList.includes(language)) {
          nodes.push({
            id: `symbol-${callee.id}`,
            name: callee.name,
            type: callee.kind,
            namespace: '', // CallGraphNode doesn't have namespace field
            file_path: callee.file_path,
            language,
            languageFeatures: {
              isAsync: false, // CallGraphNode doesn't have async info
              isExported: false, // CallGraphNode doesn't have export info
              visibility: 'public', // CallGraphNode doesn't have visibility info
              spawn: this.detectSpawnType(callee),
              spawnsPython: this.detectPythonSpawn(callee)
            }
          });

          // Add edge from target to callee
          edges.push({
            source: `symbol-${callGraph.target.id}`,
            target: `symbol-${callee.id}`,
            type: callee.call_info.call_type,
            isCrossLanguage: this.detectLanguageFromPath(callGraph.target.filePath) !== language,
            sourceLanguage: this.detectLanguageFromPath(callGraph.target.filePath),
            targetLanguage: language,
            details: `${callGraph.target.name} ${callee.call_info.call_type} ${callee.name}`
          });
        }
      }

      const response: ApiResponse = {
        success: true,
        data: {
          nodes,
          edges,
          languages: languageList,
          center_symbol_id: symbolId,
          metrics: {
            total_nodes: nodes.length,
            total_edges: edges.length,
            cross_language_edges: edges.filter(e => e.isCrossLanguage).length,
            languages_involved: [...new Set(nodes.map(n => n.language))]
          }
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching multi-language flow:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch multi-language flow'
      };
      res.status(500).json(response);
    }
  }

  /**
   * Analyze a specific function for code flow insights
   * GET /api/code-flow/analyze/:symbolId
   */
  async analyzeFunction(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.symbolId, 10);

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      // Combine multiple analyses for comprehensive insights
      const [callGraph, branches, controlFlow] = await Promise.all([
        this.codeFlowService.getCallGraph(symbolId, { depth: 2 }),
        this.codeFlowService.getBranchAnalysis(symbolId),
        this.codeFlowService.getControlFlow(symbolId)
      ]);

      const response: ApiResponse = {
        success: true,
        data: {
          symbol_id: symbolId,
          call_graph: callGraph,
          branch_analysis: branches,
          control_flow: controlFlow,
          insights: {
            complexity: branches.total_branches * 2 + callGraph.callees.length,
            test_coverage_recommendation: branches.unused_branches.length > 0 
              ? `Add tests for ${branches.unused_branches.length} uncovered branches`
              : 'All branches appear to be covered',
            refactoring_suggestion: callGraph.callees.length > 10 
              ? 'Consider breaking this function into smaller functions'
              : null
          }
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error analyzing function:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze function'
      };
      res.status(500).json(response);
    }
  }

  // Helper methods for multi-language support
  private detectLanguageFromPath(filePath: string): string {
    if (!filePath) return 'unknown';
    
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'cpp': 'cpp', 'hpp': 'cpp', 'cc': 'cpp', 'h': 'cpp', 'cxx': 'cpp', 'hxx': 'cpp', 'ixx': 'cpp',
      'py': 'python', 'pyi': 'python', 'pyx': 'python',
      'ts': 'typescript', 'tsx': 'typescript',
      'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript',
      'rs': 'rust',
      'go': 'go',
      'java': 'java', 'kt': 'kotlin',
    };
    return languageMap[ext || ''] || 'unknown';
  }

  private detectSpawnType(symbol: any): string | undefined {
    // Check if the symbol contains process spawning patterns
    const name = symbol.name?.toLowerCase() || '';
    const signature = symbol.signature?.toLowerCase() || '';
    
    if (name.includes('spawn') || name.includes('exec') || name.includes('system')) {
      return 'process';
    }
    
    if (signature.includes('subprocess') || signature.includes('exec') || signature.includes('spawn')) {
      return 'process';
    }
    
    return undefined;
  }

  private detectPythonSpawn(symbol: any): boolean {
    // Check if this symbol specifically spawns Python processes
    const name = symbol.name?.toLowerCase() || '';
    const signature = symbol.signature?.toLowerCase() || '';
    
    return name.includes('python') || 
           signature.includes('python') || 
           signature.includes('.py');
  }
}