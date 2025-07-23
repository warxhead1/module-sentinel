/**
 * Semantic Insights Routes
 * 
 * API routes for accessing semantic intelligence data
 */

import type Database from 'better-sqlite3';
import { SemanticInsightsService } from '../services/semantic-insights.service.js';
import type { Request, Response } from '../types/express.js';
import type { ApiResponse } from '../../shared/types/api.js';

export class SemanticInsightsRoutes {
  private insightsService: SemanticInsightsService;

  constructor(db: Database.Database) {
    this.insightsService = new SemanticInsightsService(db);
  }

  /**
   * GET /api/semantic/insights
   * Get semantic insights with filtering
   */
  async getInsights(req: Request, res: Response): Promise<void> {
    try {
      const insights = await this.insightsService.getInsights(req.query);
      
      const response: ApiResponse = {
        success: true,
        data: { insights },
        message: 'Insights retrieved successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching insights:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch semantic insights'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/semantic/insights/symbol/:symbolId
   * Get insights for a specific symbol
   */
  async getSymbolInsights(req: Request, res: Response, symbolId: string): Promise<void> {
    try {
      const insights = await this.insightsService.getInsightsForSymbol(parseInt(symbolId));
      
      const response: ApiResponse = {
        success: true,
        data: { insights },
        message: 'Symbol insights retrieved successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching symbol insights:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch symbol insights'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/semantic/clusters
   * Get semantic clusters
   */
  async getClusters(req: Request, res: Response): Promise<void> {
    try {
      const clusters = await this.insightsService.getClusters(req.query);
      
      const response: ApiResponse = {
        success: true,
        data: { clusters },
        message: 'Clusters retrieved successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching clusters:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch semantic clusters'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/semantic/clusters/:clusterId
   * Get cluster details
   */
  async getClusterDetails(req: Request, res: Response, clusterId: string): Promise<void> {
    try {
      const cluster = await this.insightsService.getClusterDetails(parseInt(clusterId));
      
      if (!cluster) {
        const response: ApiResponse = {
          success: false,
          error: 'Cluster not found'
        };
        res.status(404).json(response);
        return;
      }
      
      const response: ApiResponse = {
        success: true,
        data: { cluster },
        message: 'Cluster details retrieved successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching cluster details:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch cluster details'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/semantic/metrics
   * Get quality metrics
   */
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await this.insightsService.getQualityMetrics();
      
      const response: ApiResponse = {
        success: true,
        data: { metrics },
        message: 'Metrics retrieved successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch quality metrics'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * GET /api/semantic/insights/:insightId/recommendations
   * Get recommendations for an insight
   */
  async getRecommendations(req: Request, res: Response, insightId: string): Promise<void> {
    try {
      const recommendations = await this.insightsService.getRecommendations(parseInt(insightId));
      
      const response: ApiResponse = {
        success: true,
        data: { recommendations },
        message: 'Recommendations retrieved successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch recommendations'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * POST /api/semantic/insights/:insightId/feedback
   * Submit feedback for an insight
   */
  async submitFeedback(req: Request, res: Response, insightId: string): Promise<void> {
    try {
      const { feedback, comment } = req.body;
      
      if (![-1, 0, 1].includes(feedback)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid feedback value. Must be -1, 0, or 1'
        };
        res.status(400).json(response);
        return;
      }
      
      await this.insightsService.submitFeedback(parseInt(insightId), feedback, comment);
      
      const response: ApiResponse = {
        success: true,
        message: 'Feedback submitted successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit feedback'
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * POST /api/semantic/analyze
   * Trigger semantic analysis
   */
  async analyzeFiles(req: Request, res: Response): Promise<void> {
    try {
      const { filePaths, options } = req.body;
      
      if (!filePaths || !Array.isArray(filePaths)) {
        const response: ApiResponse = {
          success: false,
          error: 'filePaths must be an array'
        };
        res.status(400).json(response);
        return;
      }
      
      const result = await this.insightsService.analyzeFiles(filePaths, options);
      
      const response: ApiResponse = {
        success: true,
        data: { result },
        message: 'Analysis triggered successfully'
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error triggering analysis:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger semantic analysis'
      };
      
      res.status(500).json(response);
    }
  }
}