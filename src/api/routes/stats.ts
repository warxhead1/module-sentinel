/**
 * Statistics API routes
 */
import type { Request, Response } from '../types/express.js';
import { DatabaseService } from '../services/database.service.js';
import type { ApiResponse } from '../../shared/types/api.js';

export class StatsRoutes {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * GET /api/stats
   * Get database statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      const stats = this.dbService.getStats();
      
      const response: ApiResponse = {
        success: true,
        data: stats,
        message: 'Database statistics retrieved successfully'
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getStats:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get statistics'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/namespaces
   * Get all namespaces with symbol counts
   */
  async getNamespaces(req: Request, res: Response) {
    try {
      const projectIdsStr = req.query.project_ids as string;
      const languageIdStr = req.query.language_id as string;
      
      const languageId = languageIdStr ? parseInt(languageIdStr, 10) : undefined;
      
      // Parse project IDs from comma-separated string
      let projectIds: number[] | undefined;
      if (projectIdsStr) {
        projectIds = projectIdsStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }
      
      const namespaces = this.dbService.getNamespaces({
        projectIds,
        languageId
      });
      
      const response: ApiResponse = {
        success: true,
        data: namespaces,
        message: `Found ${namespaces.length} namespaces`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getNamespaces:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get namespaces'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/namespaces/:name/symbols
   * Get symbols for a specific namespace
   */
  async getNamespaceSymbols(req: Request, res: Response) {
    try {
      const namespace = decodeURIComponent(req.params.name);
      const limitStr = req.query.limit as string;
      const projectIdsStr = req.query.project_ids as string;
      const languageIdStr = req.query.language_id as string;
      
      const limit = limitStr ? parseInt(limitStr, 10) : 100;
      const languageId = languageIdStr ? parseInt(languageIdStr, 10) : undefined;
      
      // Parse project IDs from comma-separated string
      let projectIds: number[] | undefined;
      if (projectIdsStr) {
        projectIds = projectIdsStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }

      const symbols = this.dbService.getNamespaceSymbols(namespace, {
        projectIds,
        languageId,
        limit: Math.min(limit, 500)
      });
      
      const response: ApiResponse = {
        success: true,
        data: symbols,
        message: `Found ${symbols.length} symbols in namespace ${namespace}`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getNamespaceSymbols:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get namespace symbols'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/projects
   * Get all projects with symbol counts
   */
  async getProjects(req: Request, res: Response) {
    try {
      const projects = this.dbService.getProjects();
      
      const response: ApiResponse = {
        success: true,
        data: projects,
        message: `Found ${projects.length} active projects`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getProjects:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get projects'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/languages
   * Get all languages with symbol counts
   */
  async getLanguages(req: Request, res: Response) {
    try {
      const languages = this.dbService.getLanguages();
      
      const response: ApiResponse = {
        success: true,
        data: languages,
        message: `Found ${languages.length} supported languages`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getLanguages:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get languages'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/health
   * Health check endpoint
   */
  async getHealth(req: Request, res: Response) {
    try {
      const health = this.dbService.healthCheck();
      
      if (health.healthy) {
        const response: ApiResponse = {
          success: true,
          data: { status: 'healthy', timestamp: new Date().toISOString() },
          message: 'Service is healthy'
        };
        res.json(response);
      } else {
        const response: ApiResponse = {
          success: false,
          error: health.error,
          data: { status: 'unhealthy', timestamp: new Date().toISOString() }
        };
        res.status(503).json(response);
      }
    } catch (error) {
      console.error('Error in getHealth:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      };

      res.status(503).json(response);
    }
  }

  /**
   * POST /api/rebuild-index
   * Rebuild the database index
   */
  async rebuildIndex(req: Request, res: Response) {
    try {
      // For now, just return a placeholder response
      // In a real implementation, this would trigger index rebuilding
      const response: ApiResponse = {
        success: true,
        data: { message: 'Index rebuild triggered', timestamp: new Date().toISOString() },
        message: 'Index rebuild initiated successfully'
      };

      res.json(response);
    } catch (error) {
      console.error('Error in rebuildIndex:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rebuild index'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/patterns
   * Get pattern analysis data
   */
  async getPatterns(req: Request, res: Response) {
    try {
      // For now, return empty patterns data
      // In a real implementation, this would query pattern analysis results
      const response: ApiResponse = {
        success: true,
        data: {
          patterns: [],
          antipatterns: [],
          summary: {
            total_patterns: 0,
            total_antipatterns: 0,
            coverage: 0
          }
        },
        message: 'Pattern analysis data retrieved successfully'
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getPatterns:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get patterns'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/performance/hotspots
   * Get performance hotspots analysis
   */
  async getPerformanceHotspots(req: Request, res: Response) {
    try {
      // For now, return empty hotspots data
      // In a real implementation, this would analyze performance bottlenecks
      const response: ApiResponse = {
        success: true,
        data: {
          hotspots: [],
          summary: {
            total_hotspots: 0,
            critical_count: 0,
            warning_count: 0
          }
        },
        message: 'Performance hotspots data retrieved successfully'
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getPerformanceHotspots:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get performance hotspots'
      };

      res.status(500).json(response);
    }
  }

  /**
   * POST /api/projects/:id/index
   * Trigger indexing for a specific project
   */
  async indexProject(req: Request, res: Response) {
    try {
      const projectId = parseInt(req.params.id, 10);
      
      if (isNaN(projectId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid project ID'
        };
        return res.status(400).json(response);
      }

      // Get project details from database
      const projects = this.dbService.getProjects();
      const project = projects.find(p => p.id === projectId);
      
      if (!project) {
        const response: ApiResponse = {
          success: false,
          error: 'Project not found'
        };
        return res.status(404).json(response);
      }

      // Start indexing process
      console.log(`🔄 Starting indexing for project: ${project.name} at ${project.root_path}`);
      
      // For now, we'll simulate the indexing process
      // In a real implementation, this would:
      // 1. Spawn the universal indexer process
      // 2. Monitor progress
      // 3. Update database with results
      
      const response: ApiResponse = {
        success: true,
        data: {
          projectId,
          projectName: project.name,
          rootPath: project.root_path,
          status: 'indexing_started',
          message: 'Project indexing has been initiated',
          timestamp: new Date().toISOString()
        },
        message: `Indexing started for project "${project.display_name || project.name}"`
      };

      res.json(response);
      
      // Start async indexing process (placeholder for now)
      this.startIndexingProcess(project);
      
    } catch (error) {
      console.error('Error in indexProject:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start project indexing'
      };

      res.status(500).json(response);
    }
  }

  /**
   * Start the actual indexing process (placeholder implementation)
   */
  private async startIndexingProcess(project: any) {
    try {
      console.log(`📊 Indexing project: ${project.name}`);
      console.log(`📁 Root path: ${project.root_path}`);
      
      // This is where we would:
      // 1. Import and use the universal indexer
      // 2. Scan the project directory
      // 3. Parse and analyze files
      // 4. Store results in database
      
      // For now, just log the intent
      console.log(`✅ Indexing completed for project: ${project.name} (placeholder)`);
      
    } catch (error) {
      console.error(`❌ Indexing failed for project ${project.name}:`, error);
    }
  }
}