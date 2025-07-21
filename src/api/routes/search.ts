import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { universalSymbols } from '../../database/drizzle/schema.js';
import { like, and, eq, sql } from 'drizzle-orm';
import type { Request, Response } from '../types/express.js';
import type { ApiResponse } from '../../shared/types/api.js';

export class SearchRoutes {
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;

  constructor(database: Database.Database) {
    this.db = database;
    this.drizzleDb = drizzle(database);
  }

  /**
   * Search for symbols
   * GET /api/search
   */
  async search(req: Request, res: Response) {
    try {
      const { q: query, type, projectId, limit = 50 } = req.query;

      if (!query || typeof query !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: 'Query parameter is required'
        };
        return res.status(400).json(response);
      }

      // Build conditions
      const conditions = [];
      
      // Search in name and qualified_name
      conditions.push(
        sql`${universalSymbols.name} LIKE ${`%${query}%`} OR ${universalSymbols.qualifiedName} LIKE ${`%${query}%`}`
      );

      // Filter by type if specified
      if (type && typeof type === 'string') {
        conditions.push(eq(universalSymbols.kind, type));
      }

      // Filter by project if specified
      if (projectId && typeof projectId === 'string') {
        conditions.push(eq(universalSymbols.projectId, parseInt(projectId, 10)));
      }

      // Execute search
      const results = await this.drizzleDb.select({
        id: universalSymbols.id,
        name: universalSymbols.name,
        qualified_name: universalSymbols.qualifiedName,
        kind: universalSymbols.kind,
        file: universalSymbols.filePath,
        line: universalSymbols.line,
        namespace: universalSymbols.namespace,
        signature: universalSymbols.signature
      })
      .from(universalSymbols)
      .where(and(...conditions))
      .limit(parseInt(String(limit), 10));

      const response: ApiResponse = {
        success: true,
        data: {
          query,
          results,
          count: results.length
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Search error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed'
      };
      res.status(500).json(response);
    }
  }
}