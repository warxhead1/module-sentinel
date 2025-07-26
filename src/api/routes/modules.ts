/**
 * Modules API routes
 */
import type { Request, Response } from '../types/express.js';
import { ModulesService } from '../services/modules.service.js';
import type { ApiResponse } from '../../shared/types/api.js';

export class ModulesRoutes {
  private modulesService: ModulesService;

  constructor(modulesService: ModulesService) {
    this.modulesService = modulesService;
  }

  /**
   * GET /api/modules
   * Get all modules organized by namespace hierarchy
   */
  async getModules(req: Request, res: Response) {
    try {
      const modules = await this.modulesService.getModulesHierarchy();
      
      const response: ApiResponse = {
        success: true,
        data: modules,
        message: `Found ${modules.length} top-level namespaces`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getModules:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get modules'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/modules/:namespace/:module
   * Get detailed information for a specific module
   */
  async getModuleDetails(req: Request, res: Response) {
    try {
      const { namespace, module } = req.params;
      
      if (!namespace || !module) {
        const response: ApiResponse = {
          success: false,
          error: 'Namespace and module name are required'
        };
        return res.status(400).json(response);
      }

      const details = await this.modulesService.getModuleDetails(
        decodeURIComponent(namespace),
        decodeURIComponent(module)
      );
      
      const response: ApiResponse = {
        success: true,
        data: details,
        message: `Found ${details.length} symbols in ${namespace}::${module}`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getModuleDetails:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get module details'
      };

      res.status(500).json(response);
    }
  }
}