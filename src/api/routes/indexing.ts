/**
 * Indexing Routes
 * 
 * Provides endpoints for managing and monitoring the indexing process
 */

import type { Request, Response } from '../types/express.js';
import type { IndexingService } from '../services/indexing.service.js';
import { IndexerLogger } from '../../utils/indexer-logger.js';

export class IndexingRoutes {
  constructor(private indexingService: IndexingService) {}

  /**
   * Get current indexing status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const jobs = this.indexingService.getAllJobs();
      
      // Get active jobs
      const activeJobs = jobs.filter(job => job.status === 'running');
      const queuedJobs = jobs.filter(job => job.status === 'queued');
      const completedJobs = jobs.filter(job => job.status === 'completed');
      const failedJobs = jobs.filter(job => job.status === 'failed');
      
      // Calculate overall stats
      const totalSymbols = completedJobs.reduce((sum, job) => 
        sum + (job.result?.symbolsFound || 0), 0);
      const totalFiles = completedJobs.reduce((sum, job) => 
        sum + (job.result?.filesIndexed || 0), 0);
      
      res.json({
        success: true,
        data: {
          status: activeJobs.length > 0 ? 'indexing' : 'idle',
          activeJobs: activeJobs.length,
          queuedJobs: queuedJobs.length,
          completedJobs: completedJobs.length,
          failedJobs: failedJobs.length,
          totalJobs: jobs.length,
          currentJob: activeJobs[0] || null,
          stats: {
            totalSymbols,
            totalFiles,
            avgSymbolsPerFile: totalFiles > 0 ? Math.round(totalSymbols / totalFiles) : 0
          },
          recentJobs: jobs.slice(0, 5).map(job => ({
            id: job.id,
            projectName: job.projectName,
            status: job.status,
            progress: job.progress,
            error: job.error,
            startTime: new Date(job.startTime).toISOString(),
            endTime: job.endTime ? new Date(job.endTime).toISOString() : null,
            duration: job.endTime ? job.endTime - job.startTime : null
          }))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get indexing status'
      });
    }
  }

  /**
   * Get detailed job information
   */
  async getJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = this.indexingService.getJob(jobId);
      
      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found'
        });
        return;
      }
      
      res.json({
        success: true,
        data: job
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job details'
      });
    }
  }

  /**
   * Get indexer logs
   */
  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const lines = parseInt(req.query.lines as string) || 100;
      const logs = await IndexerLogger.tailLog(lines);
      
      res.json({
        success: true,
        data: {
          logFile: IndexerLogger.getLatestLogFile(),
          lines: logs,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get logs'
      });
    }
  }

  /**
   * Cancel a running job
   */
  async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const cancelled = await this.indexingService.cancelJob(jobId);
      
      if (!cancelled) {
        res.status(404).json({
          success: false,
          error: 'Job not found or not running'
        });
        return;
      }
      
      res.json({
        success: true,
        message: 'Job cancelled successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel job'
      });
    }
  }

  /**
   * Start indexing for a project
   */
  async startIndexing(req: Request, res: Response): Promise<void> {
    try {
      const { projectId, force } = req.body;
      
      if (!projectId) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required'
        });
        return;
      }
      
      // Get project details from database
      const projectService = new (await import('../services/project.service.js')).ProjectService(
        (this.indexingService as any).db
      );
      const projectResult = await projectService.getProject(projectId);
      
      if (!projectResult.success || !projectResult.data) {
        res.status(404).json({
          success: false,
          error: 'Project not found'
        });
        return;
      }
      
      const project = projectResult.data;
      const jobId = await this.indexingService.indexProject(
        projectId,
        project.name,
        project.root_path,
        {
          forceReindex: force || false,
          enableSemanticAnalysis: true,
          enablePatternDetection: true
        }
      );
      
      res.json({
        success: true,
        data: {
          jobId,
          message: 'Indexing started'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start indexing'
      });
    }
  }
}