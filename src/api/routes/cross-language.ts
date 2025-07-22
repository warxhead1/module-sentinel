/**
 * Cross-Language Analysis API Routes
 * Dedicated endpoints for multi-language flow analysis
 */
import type { Request, Response } from '../types/express.js';
import { DatabaseService } from '../services/database.service.js';
import type { ApiResponse } from '../../shared/types/api.js';

export class CrossLanguageRoutes {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * GET /api/cross-language/symbols
   * Get symbols that participate in cross-language relationships
   */
  async getCrossLanguageSymbols(req: Request, res: Response) {
    try {
      const source_language = req.query.source_language as string;
      const target_language = req.query.target_language as string;
      const relationship_type = req.query.relationship_type as string;
      
      const sql = `
        SELECT DISTINCT 
          s.id, s.name, s.qualified_name, s.kind, s.namespace,
          s.file_path, s.line, s.column, s.visibility, s.signature,
          s.return_type, s.is_exported, s.language_id, s.project_id,
          l.name as language_name,
          COUNT(r.id) as cross_language_relationship_count
        FROM universal_symbols s
        INNER JOIN universal_relationships r ON (s.id = r.from_symbol_id OR s.id = r.to_symbol_id)
        LEFT JOIN languages l ON s.language_id = l.id
        WHERE JSON_EXTRACT(r.metadata, '$.crossLanguage') = true
        ${source_language ? `AND l.name = ?` : ''}
        ${relationship_type ? `AND r.type = ?` : ''}
        GROUP BY s.id
        ORDER BY cross_language_relationship_count DESC, s.name ASC
      `;
      
      const params: string[] = [];
      if (source_language) params.push(source_language);
      if (relationship_type) params.push(relationship_type);
      
      const symbols = this.dbService.executeQuery(sql, params);
      
      const response: ApiResponse = {
        success: true,
        data: symbols,
        message: `Found ${symbols.length} symbols with cross-language relationships`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getCrossLanguageSymbols:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cross-language symbols'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/cross-language/relationships
   * Get cross-language relationships with full symbol details
   */
  async getCrossLanguageRelationships(req: Request, res: Response) {
    try {
      const { source_language, target_language, limit = 100 } = req.query;
      
      const sql = `
        SELECT 
          r.*,
          s1.name as from_name, s1.qualified_name as from_qualified_name,
          s1.kind as from_kind, s1.namespace as from_namespace,
          s1.file_path as from_file_path, s1.line as from_line,
          l1.name as from_language,
          s2.name as to_name, s2.qualified_name as to_qualified_name,
          s2.kind as to_kind, s2.namespace as to_namespace,
          s2.file_path as to_file_path, s2.line as to_line,
          l2.name as to_language
        FROM universal_relationships r
        INNER JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
        LEFT JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
        LEFT JOIN languages l1 ON s1.language_id = l1.id
        LEFT JOIN languages l2 ON s2.language_id = l2.id
        WHERE (
          JSON_EXTRACT(r.metadata, '$.crossLanguage') = true
          OR l1.name != l2.name
        )
        ${source_language ? `AND l1.name = ?` : ''}
        ${target_language ? `AND l2.name = ?` : ''}
        ORDER BY r.confidence DESC, r.id DESC
        LIMIT ?
      `;
      
      const params: any[] = [];
      if (source_language) params.push(source_language);
      if (target_language) params.push(target_language);
      params.push(parseInt(String(limit), 10));
      
      const relationships = this.dbService.executeQuery(sql, params);
      
      const response: ApiResponse = {
        success: true,
        data: relationships,
        message: `Found ${relationships.length} cross-language relationships`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getCrossLanguageRelationships:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cross-language relationships'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/cross-language/entry-points
   * Get symbols that are likely entry points for cross-language analysis
   */
  async getCrossLanguageEntryPoints(req: Request, res: Response) {
    try {
      const sql = `
        SELECT DISTINCT 
          s.id, s.name, s.qualified_name, s.kind, s.namespace,
          s.file_path, s.line, s.column, s.language_id,
          l.name as language_name,
          COUNT(r_out.id) as outgoing_cross_language_calls,
          COUNT(r_in.id) as incoming_cross_language_calls
        FROM universal_symbols s
        LEFT JOIN languages l ON s.language_id = l.id
        LEFT JOIN universal_relationships r_out ON (
          s.id = r_out.from_symbol_id 
          AND JSON_EXTRACT(r_out.metadata, '$.crossLanguage') = 'true'
        )
        LEFT JOIN universal_relationships r_in ON (
          s.id = r_in.to_symbol_id 
          AND JSON_EXTRACT(r_in.metadata, '$.crossLanguage') = 'true'
        )
        WHERE (
          -- Functions/methods that spawn processes
          JSON_EXTRACT(s.language_features, '$.spawn') IS NOT NULL
          OR JSON_EXTRACT(s.language_features, '$.spawnsPython') = 'true'
          -- Entry point functions (main, exported functions)
          OR (s.name IN ('main', '__main__') AND s.kind = 'function')
          OR (s.is_exported = 1 AND s.kind IN ('function', 'method', 'class'))
          -- Has cross-language relationships
          OR r_out.id IS NOT NULL 
          OR r_in.id IS NOT NULL
        )
        GROUP BY s.id
        HAVING (outgoing_cross_language_calls > 0 OR incoming_cross_language_calls > 0)
        ORDER BY 
          outgoing_cross_language_calls + incoming_cross_language_calls DESC,
          s.name ASC
      `;
      
      const entryPoints = this.dbService.executeQuery(sql);
      
      const response: ApiResponse = {
        success: true,
        data: entryPoints,
        message: `Found ${entryPoints.length} cross-language entry points`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getCrossLanguageEntryPoints:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cross-language entry points'
      };

      res.status(500).json(response);
    }
  }

  /**
   * GET /api/cross-language/languages
   * Get languages that participate in cross-language relationships
   */
  async getCrossLanguageLanguages(req: Request, res: Response) {
    try {
      const sql = `
        SELECT 
          l.name as language,
          COUNT(DISTINCT s.id) as symbols_with_cross_language_relationships,
          COUNT(DISTINCT r.id) as total_cross_language_relationships
        FROM languages l
        INNER JOIN universal_symbols s ON l.id = s.language_id
        INNER JOIN universal_relationships r ON (s.id = r.from_symbol_id OR s.id = r.to_symbol_id)
        WHERE JSON_EXTRACT(r.metadata, '$.crossLanguage') = true
        GROUP BY l.id, l.name
        ORDER BY total_cross_language_relationships DESC
      `;
      
      const languages = this.dbService.executeQuery(sql);
      
      const response: ApiResponse = {
        success: true,
        data: languages,
        message: `Found ${languages.length} languages with cross-language relationships`
      };

      res.json(response);
    } catch (error) {
      console.error('Error in getCrossLanguageLanguages:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cross-language languages'
      };

      res.status(500).json(response);
    }
  }
}