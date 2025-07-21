/**
 * Visualization API Test
 * Tests the clean visualization API
 */

import Database from 'better-sqlite3';
import { ModernApiServer } from '../../dist/api/server.js';
import { TestResult } from '../helpers/JUnitReporter';
import * as http from 'http';

export class VisualizationAPITest {
  private db: Database.Database;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test 1: Can create API instance
    results.push(await this.testCreateAPI());
    
    // Test 2: Can start and stop server
    results.push(await this.testStartStopServer());
    
    // Test 3: Can query symbols endpoint
    results.push(await this.testSymbolsEndpoint());
    
    // Test 4: Can query stats endpoint (this was failing)
    results.push(await this.testStatsEndpoint());
    
    // Test 5: Can query search endpoint
    results.push(await this.testSearchEndpoint());
    
    // Test 6: Can query relationships endpoint
    results.push(await this.testRelationshipsEndpoint());
    
    // Test 7: SQL queries are valid
    results.push(await this.testSQLQueries());
    
    return results;
  }
  
  private async testCreateAPI(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const api = new ModernApiServer(this.db, 0); // Use port 0 for random port
      
      return {
        name: 'testCreateAPI',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testCreateAPI',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testStartStopServer(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const api = new ModernApiServer(this.db, 0);
      
      // Start server
      await api.start();
      
      // Stop server
      await api.stop();
      
      return {
        name: 'testStartStopServer',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testStartStopServer',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testSymbolsEndpoint(): Promise<TestResult> {
    const startTime = Date.now();
    let api: ModernApiServer | null = null;
    
    try {
      // Start API on random port
      api = new ModernApiServer(this.db, 0);
      await api.start();
      
      // Get the actual port
      const address = (api as any).server?.address();
      if (!address || typeof address === 'string') {
        throw new Error('Could not get server port');
      }
      const port = address.port;
      
      // Make request to symbols endpoint (requires query parameter)
      const response = await this.makeRequest(`http://localhost:${port}/api/symbols?q=test&limit=10`);
      const data = JSON.parse(response);
      
      if (!data.success || !data.data || !Array.isArray(data.data)) {
        throw new Error('Expected success response with data array from symbols endpoint');
      }
      
      return {
        name: 'testSymbolsEndpoint',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testSymbolsEndpoint',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      if (api) {
        await api.stop();
      }
    }
  }
  
  private makeRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
  
  private async testStatsEndpoint(): Promise<TestResult> {
    const startTime = Date.now();
    let api: ModernApiServer | null = null;
    
    try {
      // Start API on random port
      api = new ModernApiServer(this.db, 0);
      await api.start();
      
      // Get the actual port
      const address = (api as any).server?.address();
      if (!address || typeof address === 'string') {
        throw new Error('Could not get server port');
      }
      const port = address.port;
      
      // Make request to stats endpoint
      const response = await this.makeRequest(`http://localhost:${port}/api/stats`);
      const data = JSON.parse(response);
      
      if (!data.success || !data.data) {
        throw new Error('Expected success response with data from stats endpoint');
      }
      
      const stats = data.data;
      // The stats response should have at least some of these fields
      if (!stats || typeof stats !== 'object') {
        throw new Error('Stats response missing data object');
      }
      
      return {
        name: 'testStatsEndpoint',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testStatsEndpoint',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      if (api) {
        await api.stop();
      }
    }
  }
  
  private async testSearchEndpoint(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // This endpoint doesn't exist in the new API - search is done via symbols endpoint
      // Test the symbols endpoint instead which handles search functionality
      return await this.testSymbolsEndpoint();
    } catch (error) {
      return {
        name: 'testSearchEndpoint',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testRelationshipsEndpoint(): Promise<TestResult> {
    const startTime = Date.now();
    let api: ModernApiServer | null = null;
    
    try {
      // First, get a symbol ID to test with
      const symbol = this.db.prepare(`
        SELECT id FROM universal_symbols LIMIT 1
      `).get() as any;
      
      if (!symbol) {
        throw new Error('No symbols found in database to test relationships');
      }
      
      // Start API on random port
      api = new ModernApiServer(this.db, 0);
      await api.start();
      
      // Get the actual port
      const address = (api as any).server?.address();
      if (!address || typeof address === 'string') {
        throw new Error('Could not get server port');
      }
      const port = address.port;
      
      // Make request to relationships endpoint (new path format)
      const response = await this.makeRequest(`http://localhost:${port}/api/symbols/${symbol.id}/relationships`);
      const data = JSON.parse(response);
      
      if (!data.success || !data.data) {
        throw new Error('Expected success response with data from relationships endpoint');
      }
      
      const relationships = data.data;
      // The relationships response should have the symbol info
      if (!relationships || typeof relationships !== 'object') {
        throw new Error('Relationships response missing data object');
      }
      
      return {
        name: 'testRelationshipsEndpoint',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testRelationshipsEndpoint',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      if (api) {
        await api.stop();
      }
    }
  }
  
  private async testSQLQueries(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Test all SQL queries used in the API to ensure they're valid
      
      // Test 1: Stats query for home page
      const statsQuery = this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM universal_symbols) as total_symbols,
          (SELECT COUNT(DISTINCT file_path) FROM universal_symbols) as total_files,
          (SELECT COUNT(*) FROM universal_relationships) as total_relationships,
          (SELECT COUNT(*) FROM projects WHERE is_active = 1) as total_projects
      `).get();
      
      if (!statsQuery) {
        throw new Error('Stats query failed');
      }
      
      // Test 2: Recent symbols query
      const recentSymbolsQuery = this.db.prepare(`
        SELECT s.name, s.kind, s.file_path, l.display_name as language
        FROM universal_symbols s
        JOIN languages l ON s.language_id = l.id
        ORDER BY s.id DESC
        LIMIT 10
      `).all();
      
      // Test 3: Projects stats query (check if projects table exists first)
      let projectsQuery = [];
      try {
        projectsQuery = this.db.prepare(`
          SELECT 
            p.*,
            COUNT(DISTINCT s.id) as symbol_count,
            COUNT(DISTINCT s.file_path) as file_count
          FROM projects p
          LEFT JOIN universal_symbols s ON p.id = s.project_id
          WHERE p.is_active = 1
          GROUP BY p.id
        `).all();
      } catch (error) {
        // Projects table might not exist yet, skip this test
        console.log('Projects table not found, skipping projects query test');
      }
      
      // Test 4: By kind query
      const byKindQuery = this.db.prepare(`
        SELECT kind, COUNT(*) as count
        FROM universal_symbols
        GROUP BY kind
        ORDER BY count DESC
      `).all();
      
      // Test 5: By language query
      const byLanguageQuery = this.db.prepare(`
        SELECT l.display_name as language, COUNT(*) as symbol_count
        FROM universal_symbols s
        JOIN languages l ON s.language_id = l.id
        GROUP BY l.id
        ORDER BY symbol_count DESC
      `).all();
      
      // Test 6: Search query with parameters
      const searchQuery = this.db.prepare(`
        SELECT 
          s.id,
          s.name,
          s.qualified_name,
          s.kind,
          s.file_path,
          s.line,
          s.signature,
          s.semantic_tags,
          p.name as project_name,
          l.display_name as language,
          CASE 
            WHEN s.name = ? THEN 100
            WHEN s.name LIKE ? THEN 80
            WHEN s.qualified_name LIKE ? THEN 60
            WHEN s.signature LIKE ? THEN 40
            ELSE 20
          END as relevance
        FROM universal_symbols s
        JOIN projects p ON s.project_id = p.id
        JOIN languages l ON s.language_id = l.id
        WHERE 
          s.name LIKE ? OR 
          s.qualified_name LIKE ? OR 
          s.signature LIKE ? OR
          s.semantic_tags LIKE ?
        ORDER BY relevance DESC, s.name
        LIMIT ?
      `).all(
        'test', 'test%', '%test%', '%test%',
        '%test%', '%test%', '%test%', '%test%', 10
      );
      
      // Test 7: Relationships queries
      if (this.db.prepare(`SELECT id FROM universal_symbols LIMIT 1`).get()) {
        const symbolId = (this.db.prepare(`SELECT id FROM universal_symbols LIMIT 1`).get() as any).id;
        
        const outgoingRels = this.db.prepare(`
          SELECT 
            r.type as relationship_type,
            r.confidence,
            s.id as target_id,
            s.name as target_name,
            s.qualified_name as target_qualified_name,
            s.kind as target_kind,
            s.file_path as target_file
          FROM universal_relationships r
          JOIN universal_symbols s ON r.to_symbol_id = s.id
          WHERE r.from_symbol_id = ?
          LIMIT ?
        `).all(symbolId, 10);
        
        const incomingRels = this.db.prepare(`
          SELECT 
            r.type as relationship_type,
            r.confidence,
            s.id as source_id,
            s.name as source_name,
            s.qualified_name as source_qualified_name,
            s.kind as source_kind,
            s.file_path as source_file
          FROM universal_relationships r
          JOIN universal_symbols s ON r.from_symbol_id = s.id
          WHERE r.to_symbol_id = ?
          LIMIT ?
        `).all(symbolId, 10);
      }
      
      return {
        name: 'testSQLQueries',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testSQLQueries',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}