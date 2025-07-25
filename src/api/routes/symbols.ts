/**
 * Symbols API routes
 */
import type { Request, Response } from '../types/express.js';
import { DatabaseService } from '../services/database.service.js';
import type { ApiResponse, PaginatedResponse, SearchQuery } from '../../shared/types/api.js';

export class SymbolsRoutes {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * GET /api/symbols
   * Search symbols with optional filters
   */
  async searchSymbols(req: Request, res: Response) {
    try {
      const query = req.query.q as string || '';
      const qualifiedName = req.query.qualified_name as string;
      const kind = req.query.kind as string;
      const namespace = req.query.namespace as string;
      const projectIdsStr = req.query.project_ids as string;
      const languageIdStr = req.query.language_id as string;
      const limitStr = req.query.limit as string;
      const offsetStr = req.query.offset as string;
      
      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
      const languageId = languageIdStr ? parseInt(languageIdStr, 10) : undefined;
      
      // Parse project IDs from comma-separated string
      let projectIds: number[] | undefined;
      if (projectIdsStr) {
        projectIds = projectIdsStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }

      // Allow search by qualified_name OR query, or list all if no search specified
      const searchQuery = qualifiedName || query;

      const symbols = this.dbService.searchSymbols(searchQuery, {
        kind,
        namespace,
        qualifiedName: !!qualifiedName, // Flag to indicate exact qualified_name search
        projectIds,
        languageId,
        limit: Math.min(limit, 200), // Cap at 200
        offset
      });

      const response: PaginatedResponse<typeof symbols[0]> = {
        success: true,
        data: symbols,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total: symbols.length, // Note: This is not the true total, just current page size
          hasNext: symbols.length === limit,
          hasPrev: offset > 0
        },
        message: `Found ${symbols.length} symbols matching "${query}"`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in searchSymbols:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search symbols'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/symbols/file/:qualifiedName
   * Get all symbols in a file/module by qualified name
   */
  async getFileSymbols(req: Request, res: Response) {
    try {
      const qualifiedName = decodeURIComponent(req.params.qualifiedName);
      
      if (!qualifiedName) {
        const response: ApiResponse = {
          success: false,
          error: 'Qualified name is required'
        };
        return res.status(400).json(response);
      }

      const symbols = this.dbService.getFileSymbols(qualifiedName);

      const response: ApiResponse = {
        success: true,
        data: symbols,
        message: `Found ${symbols.length} symbols for ${qualifiedName}`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getFileSymbols:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get file symbols'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/symbols/:id/relationships
   * Get relationships for a specific symbol
   */
  async getSymbolRelationships(req: Request, res: Response) {
    try {
      const symbolId = parseInt(req.params.id, 10);
      const direction = (req.query.direction as string) || 'both';

      if (isNaN(symbolId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid symbol ID'
        };
        return res.status(400).json(response);
      }

      if (!['incoming', 'outgoing', 'both'].includes(direction)) {
        const response: ApiResponse = {
          success: false,
          error: 'Direction must be one of: incoming, outgoing, both'
        };
        return res.status(400).json(response);
      }

      const relationships = this.dbService.getSymbolRelationships(
        symbolId, 
        direction as 'incoming' | 'outgoing' | 'both'
      );

      const response: ApiResponse = {
        success: true,
        data: relationships,
        message: `Found ${relationships.length} relationships for symbol ${symbolId}`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getSymbolRelationships:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get symbol relationships'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/relationships
   * Get all relationships for visualization
   */
  async getAllRelationships(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const symbolId = req.query.symbol_id ? parseInt(req.query.symbol_id as string) : undefined;
      
      let relationships;
      if (symbolId) {
        // Get relationships for specific symbol
        relationships = this.dbService.getSymbolRelationships(symbolId, 'both');
      } else {
        // Get all relationships (for graph visualization)
        relationships = this.dbService.getAllRelationships(limit);
      }

      const response: ApiResponse = {
        success: true,
        data: relationships,
        message: `Found ${relationships.length} relationships`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getAllRelationships:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get relationships'
      };

      res.status(500).json(response);
    }
  }
}