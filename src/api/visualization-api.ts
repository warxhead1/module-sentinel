import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import { ProjectVisualizer } from '../visualization/project-visualizer.js';
import { CallFlowVisualizer } from '../visualization/call-flow-visualizer.js';
// Removed ComprehensiveDashboardBuilder import
import { DatabaseManager } from '../utils/database-manager.js';

/**
 * On-demand visualization API server
 * Generates visualizations dynamically based on URL parameters
 */
export class VisualizationAPI {
  private server: http.Server;
  private dbPath: string;
  private port: number;
  // Removed dashboardBuilder property
  private databaseManager: DatabaseManager;

  constructor(dbPath: string = 'module-sentinel.db', port: number = 8080) {
    this.dbPath = dbPath;
    this.port = port;
    this.databaseManager = new DatabaseManager(dbPath);
    // Dashboard is now served as pre-built SPA
    
    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        console.error('Request error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[VisualizationAPI] Port ${port} is already in use. Not starting a new visualization server.`);
      } else {
        console.error(`[VisualizationAPI] An unexpected error occurred:`, err);
      }
    });

    this.server.listen(port, () => {
      console.log(`🎨 Dashboard server running on http://localhost:${port}`);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    // CORS headers for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (true) {
        case pathname === '/':
          // Serve the new SPA dashboard directly
          const dashboardPath = path.join(process.cwd(), 'dashboard', 'dist', 'index.html');
          await this.serveStaticFile(dashboardPath, res);
          break;
          
        case pathname === '/app.js':
          // Serve the main SPA JS file
          const appJsPath = path.join(process.cwd(), 'dashboard', 'dist', 'app.js');
          await this.serveStaticFile(appJsPath, res);
          break;
          
        case pathname.startsWith('/components/'):
          // Serve SPA component JS files
          const componentPath = path.join(process.cwd(), 'dashboard', 'dist', pathname);
          await this.serveStaticFile(componentPath, res);
          break;
          
        case pathname === '/favicon.ico':
          // Serve favicon from dashboard
          const faviconPath = path.join(process.cwd(), 'dashboard', 'favicon.ico');
          await this.serveStaticFile(faviconPath, res);
          break;
          
        case pathname === '/project-treemap.svg':
          await this.serveTreemap(res, parsedUrl.query);
          break;
          
        case pathname === '/project-architecture.html':
          // Redirect to new SPA
          res.writeHead(302, { 'Location': '/patterns' });
          res.end();
          break;
          
        case pathname === '/dependency-matrix.html':
          // Redirect to new SPA
          res.writeHead(302, { 'Location': '/relationships' });
          res.end();
          break;
          
        case pathname.startsWith('/call-flow/'):
          const symbol = pathname.replace('/call-flow/', '').replace('.html', '');
          await this.serveCallFlow(res, symbol);
          break;
          
        case pathname === '/call-flow-list.html':
          await this.serveCallFlowList(res);
          break;
          
        case pathname === '/api/symbols':
          await this.serveSymbolsAPI(res, parsedUrl.query);
          break;

        case pathname === '/api/tables':
          await this.serveTablesAPI(res);
          break;

        case pathname === '/api/stats':
          await this.serveStatsAPI(res);
          break;
        case pathname === '/api/rebuild-index':
          await this.serveRebuildIndexAPI(req, res);
          break;

        case pathname.startsWith('/api/table/'):
          const tableName = pathname.replace('/api/table/', '');
          await this.serveTableDataAPI(res, tableName, parsedUrl.query);
          break;

        case pathname === '/browse-database.html':
          // Redirect to new SPA
          res.writeHead(302, { 'Location': '/search' });
          res.end();
          break;
          
        case pathname === '/build-dashboards':
          await this.buildSPADashboard(res);
          break;
          
        case pathname === '/code-flow-explorer.html':
          await this.serveCodeFlowExplorer(res);
          break;
          
        case pathname === '/relationship-graph.html':
          await this.serveRelationshipGraph(res);
          break;
          
        case pathname === '/pattern-analyzer.html':
          await this.servePatternAnalyzer(res);
          break;
          
        case pathname === '/performance-hotspots.html':
          await this.servePerformanceHotspots(res);
          break;
          
        case pathname === '/namespace-explorer.html':
          await this.serveNamespaceExplorer(res);
          break;
          
        case pathname === '/search-interface.html':
          await this.serveSearchInterface(res);
          break;
          
        case pathname === '/main-dashboard' || pathname === '/dashboard':
          // Alternative route to main dashboard
          res.writeHead(302, { 'Location': '/dashboard/dist/index.html' });
          res.end();
          break;
          
        case pathname === '/start-dashboard-api':
          await this.startDashboardAPI(res);
          break;
          
        case pathname === '/api/trace-flow':
          await this.handleTraceFlow(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/relationship-graph':
          await this.handleRelationshipGraph(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/patterns':
          await this.handlePatterns(res);
          break;
          
        case pathname === '/api/performance-analysis':
          await this.handlePerformanceAnalysis(res);
          break;
          
        case pathname === '/api/relationship-types':
          await this.handleRelationshipTypes(res);
          break;
          
        case pathname === '/api/namespaces':
          await this.handleNamespaces(res);
          break;
          
        case pathname === '/api/namespace-details':
          await this.handleNamespaceDetails(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/search':
          await this.handleSearch(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/relationships/types':
          await this.handleRelationshipTypes(res);
          break;
          
        case pathname === '/api/relationships/graph':
          await this.handleRelationshipGraph(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/relationships':
          await this.handleRelationshipGraph(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/flow':
          await this.handleFlowData(parsedUrl.query as any, res);
          break;
          
        case pathname === '/api/performance/hotspots':
          await this.handlePerformanceHotspots(res);
          break;
          
        case pathname === '/api/performance/analysis':
          await this.handlePerformanceAnalysis(res);
          break;
          
        default:
          // Check if it's a static file from dashboard directory
          if (pathname.startsWith('/dashboard/')) {
            await this.serveDashboardFile(pathname, res);
          } else if (pathname.match(/^\/(namespaces|relationships|patterns|performance|search|code-flow)($|\/)/)) {
            // Serve SPA for client-side routes
            const dashboardPath = path.join(process.cwd(), 'dashboard', 'dist', 'index.html');
            await this.serveStaticFile(dashboardPath, res);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          }
      }
    } catch (error) {
      console.error('Handler error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async serveIndex(res: http.ServerResponse) {
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Planet ProcGen - Live Visualizations</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #0a0a0a; color: #e0e0e0; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .card h3 { margin-top: 0; color: #4a9eff; }
        .btn { display: inline-block; padding: 10px 20px; background: #4a9eff; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
        .btn:hover { background: #357abd; }
        .description { color: #aaa; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 Planet ProcGen - Live Visualizations</h1>
        <p>Generate visualizations on-demand from the current codebase state.</p>
        
        <div class="card">
            <h3>📊 Project Overview</h3>
            <div class="description">High-level view of the entire project structure</div>
            <a href="/project-treemap.svg" class="btn">Treemap (SVG)</a>
            <a href="/patterns" class="btn">Interactive Architecture</a>
        </div>
        
        <div class="card">
            <h3>🔗 Dependencies</h3>
            <div class="description">Module-to-module dependency relationships</div>
            <a href="/relationships" class="btn">Dependency Matrix</a>
        </div>
        
        <div class="card">
            <h3>🌊 Call Flow Analysis</h3>
            <div class="description">Trace execution paths from specific symbols</div>
            <a href="/call-flow-list.html" class="btn">Browse Available Symbols</a>
            <a href="/call-flow/VisualFeedbackApplication::Initialize.html" class="btn">Visual Feedback App Flow</a>
        </div>
        
        <div class="card">
            <h3>🔧 API Endpoints & Database</h3>
            <div class="description">Programmatic access to visualization data and direct database browsing.</div>
            <a href="/api/symbols?limit=100" class="btn">Symbols API</a>
            <a href="/search" class="btn">Browse Database</a>
        </div>
    </div>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
  }

  private async serveTreemap(res: http.ServerResponse, query: any) {
    console.log('🎨 Generating treemap on-demand...');
    const visualizer = new ProjectVisualizer(this.dbPath);
    
    const width = parseInt(query.width as string) || 1400;
    const height = parseInt(query.height as string) || 900;
    
    const svg = await visualizer.generateTreemapSVG(width, height);
    visualizer.close();
    
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(svg);
  }

  private async serveArchitecture(res: http.ServerResponse) {
    console.log('🏗️ Generating interactive architecture on-demand...');
    const visualizer = new ProjectVisualizer(this.dbPath);
    const html = await visualizer.generateInteractiveHTML();
    visualizer.close();
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
  }

  private async serveDependencyMatrix(res: http.ServerResponse) {
    console.log('📋 Generating dependency matrix on-demand...');
    const visualizer = new ProjectVisualizer(this.dbPath);
    const matrix = await visualizer.generateDependencyMatrix();
    visualizer.close();
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Module Dependency Matrix - Planet ProcGen</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #0a0a0a; color: #e0e0e0; }
        h1 { color: #4a9eff; }
        table { margin: 20px 0; }
        .back-link { color: #4a9eff; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <a href="/" class="back-link">← Back to Visualizations</a>
    <h1>Planet ProcGen - Module Dependency Matrix</h1>
    <p>Generated at: ${new Date().toISOString()}</p>
    <p>Darker red indicates more dependencies between modules.</p>
    ${matrix}
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
  }

  private async serveCallFlow(res: http.ServerResponse, symbol: string) {
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Symbol parameter required');
      return;
    }

    console.log(`🌊 Generating call flow for ${symbol} on-demand...`);
    const visualizer = new CallFlowVisualizer(this.dbPath);
    
    try {
      const html = await visualizer.generateCallFlowHTML(decodeURIComponent(symbol));
      visualizer.close();
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (error) {
      visualizer.close();
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Symbol '${symbol}' not found: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async serveCallFlowList(res: http.ServerResponse) {
    console.log('📝 Generating symbol list...');
    
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath);
    
    const symbols = db.prepare(`
      SELECT DISTINCT
        s.qualified_name,
        s.name,
        s.kind,
        s.parent_class,
        s.file_path,
        COUNT(sr.from_symbol_id) as outgoing_relationships
      FROM enhanced_symbols s
      LEFT JOIN symbol_relationships sr ON s.id = sr.from_symbol_id
      WHERE s.kind IN ('function', 'method', 'constructor')
        AND s.qualified_name IS NOT NULL
        AND s.qualified_name != ''
      GROUP BY s.qualified_name
      HAVING outgoing_relationships > 0
      ORDER BY outgoing_relationships DESC, s.qualified_name
      LIMIT 100
    `).all();
    
    db.close();

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Available Symbols - Call Flow Analysis</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #0a0a0a; color: #e0e0e0; }
        .container { max-width: 1000px; margin: 0 auto; }
        .symbol-list { display: grid; gap: 10px; }
        .symbol-item { background: #1a1a1a; border: 1px solid #333; border-radius: 5px; padding: 15px; }
        .symbol-name { color: #4a9eff; font-weight: bold; margin-bottom: 5px; }
        .symbol-meta { color: #888; font-size: 0.9em; }
        .symbol-link { color: #4a9eff; text-decoration: none; }
        .symbol-link:hover { text-decoration: underline; }
        .back-link { color: #4a9eff; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
        .relationships { color: #66ff66; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Visualizations</a>
        <h1>📝 Available Symbols for Call Flow Analysis</h1>
        <p>Symbols with outgoing relationships, sorted by complexity</p>
        
        <div class="symbol-list">
            ${symbols.map((s: any) => `
                <div class="symbol-item">
                    <div class="symbol-name">
                        <a href="/call-flow/${encodeURIComponent(s.qualified_name)}.html" class="symbol-link">
                            ${s.qualified_name}
                        </a>
                    </div>
                    <div class="symbol-meta">
                        ${s.kind} • ${s.parent_class || 'global'} • <span class="relationships">${s.outgoing_relationships} relationships</span>
                    </div>
                    <div class="symbol-meta" style="color: #666;">
                        ${s.file_path.split('/').pop()}
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
  }

  private async serveSymbolsAPI(res: http.ServerResponse, query: any) {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath);
    
    const limit = parseInt(query.limit as string) || 50;
    const search = query.search as string || '';
    
    let whereClause = "WHERE s.qualified_name IS NOT NULL";
    const params: any[] = [];
    
    if (search) {
      whereClause += " AND s.qualified_name LIKE ?";
      params.push(`%${search}%`);
    }
    
    const symbols = db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.qualified_name,
        s.kind,
        s.parent_class,
        s.file_path,
        COUNT(sr.from_symbol_id) as outgoing_relationships
      FROM enhanced_symbols s
      LEFT JOIN symbol_relationships sr ON s.id = sr.from_symbol_id
      ${whereClause}
      GROUP BY s.id, s.qualified_name
      ORDER BY outgoing_relationships DESC
      LIMIT ?
    `).all(...params, limit);
    
    db.close();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(symbols));
  }

  private async serveTablesAPI(res: http.ServerResponse) {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath, { readonly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tables));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } finally {
      db.close();
    }
  }

  private async serveStatsAPI(res: http.ServerResponse) {
    try {
      const db = await this.databaseManager.getDatabase();
      
      // Get total symbols
      const totalSymbols = db.prepare(`SELECT COUNT(*) as count FROM enhanced_symbols`).get() as any;
      
      // Get total files
      const totalFiles = db.prepare(`SELECT COUNT(DISTINCT file_path) as count FROM enhanced_symbols`).get() as any;
      
      // Get total relationships
      const totalRelationships = db.prepare(`SELECT COUNT(*) as count FROM symbol_relationships`).get() as any;
      
      // Get semantic coverage (symbols with non-empty semantic_tags)
      const semanticCoverage = db.prepare(`
        SELECT 
          COUNT(CASE WHEN semantic_tags IS NOT NULL AND semantic_tags != '[]' THEN 1 END) as tagged,
          COUNT(*) as total
        FROM enhanced_symbols
      `).get() as any;

      const coverage = semanticCoverage.total > 0 
        ? (semanticCoverage.tagged / semanticCoverage.total * 100).toFixed(1)
        : '0.0';

      const stats = {
        totalSymbols: totalSymbols.count || 0,
        totalFiles: totalFiles.count || 0,
        totalRelationships: totalRelationships.count || 0,
        semanticCoverage: `${coverage}%`
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (error) {
      console.error('Error getting stats:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get statistics' }));
    }
  }

  private async serveTableDataAPI(res: http.ServerResponse, tableName: string, query: any) {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath, { readonly: true });
    try {
      // Sanitize table name
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name);
      if (!tables.includes(tableName)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Table not found' }));
        return;
      }

      const page = parseInt(query.page as string) || 1;
      const limit = parseInt(query.limit as string) || 100;
      const offset = (page - 1) * limit;

      const data = db.prepare(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`).all(limit, offset);
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
      const total = countResult.count;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tableName,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } finally {
      db.close();
    }
  }

  private async serveBrowseDatabase(res: http.ServerResponse) {
    try {
      const fs = require('fs/promises');
      const html = await fs.readFile(path.join(__dirname, '../../visualizations/browse-database.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(html);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  private async serveRebuildIndexAPI(req: http.IncomingMessage, res: http.ServerResponse) {
    // Only allow POST requests for rebuild
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }

    try {
      // Get request body to check for project path
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          let projectPath = process.env.PROJECT_PATH || process.env.MODULE_SENTINEL_PROJECT_PATH || '/home/warxh/planet_procgen'; // Use env var or default
          
          // Parse request body if provided
          if (body) {
            try {
              const requestData = JSON.parse(body);
              if (requestData.projectPath) {
                projectPath = requestData.projectPath;
              }
            } catch (e) {
              // Ignore JSON parse errors, use default
            }
          }

          // Import PatternAwareIndexer
          const { PatternAwareIndexer } = await import('../indexing/pattern-aware-indexer.js');
          
          res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
          
          // Send initial response
          res.write(JSON.stringify({ 
            status: 'started', 
            message: `Starting index rebuild for: ${projectPath}` 
          }));
          
          console.log(`🔧 API: Starting index rebuild for project: ${projectPath}`);
          
          // Create indexer and rebuild
          const indexer = new PatternAwareIndexer(projectPath, this.dbPath, true, false);
          
          // Find all C++ files to index
          const { glob } = await import('glob');
          const patterns = [
            'src/**/*.cpp', 'src/**/*.cxx', 'src/**/*.cc',
            'include/**/*.ixx', 'include/**/*.hpp', 'include/**/*.h',
            '**/*.ixx', '**/*.cpp', '**/*.hpp', '**/*.h'
          ];
          
          const allFiles: string[] = [];
          for (const pattern of patterns) {
            const files = await glob(pattern, { cwd: projectPath, absolute: true });
            allFiles.push(...files.filter(f => !f.includes('node_modules') && !f.includes('.git')));
          }
          
          // Remove duplicates
          const uniqueFiles = [...new Set(allFiles)];
          
          const startTime = Date.now();
          await indexer.indexFiles(uniqueFiles);
          const duration = Date.now() - startTime;
          
          // Send completion response
          const completionResponse = {
            status: 'completed',
            message: `Index rebuild completed successfully in ${duration}ms`,
            projectPath: projectPath,
            dbPath: this.dbPath,
            duration: duration,
            timestamp: new Date().toISOString()
          };
          
          res.write('\n' + JSON.stringify(completionResponse));
          res.end();
          
          console.log(`✅ API: Index rebuild completed in ${duration}ms`);
          
        } catch (error) {
          console.error('Index rebuild failed:', error);
          
          const errorResponse = {
            status: 'error',
            message: `Index rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: new Date().toISOString()
          };
          
          res.write('\n' + JSON.stringify(errorResponse));
          res.end();
        }
      });
      
    } catch (error) {
      console.error('Rebuild API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error',
        message: `API error: ${error instanceof Error ? error.message : String(error)}` 
      }));
    }
  }

  private async buildSPADashboard(res: http.ServerResponse) {
    try {
      const { execSync } = require('child_process');
      
      // Run the build script quietly
      execSync('npm run build:dashboard', {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'SPA dashboard built successfully',
        url: '/dashboard/dist/index.html',
        components: [
          'dashboard-overview',
          'namespace-explorer',
          'relationship-graph',
          'pattern-analyzer',
          'performance-hotspots',
          'search-interface',
          'code-flow-explorer'
        ]
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  private async serveCodeFlowExplorer(res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), 'dashboard', 'code-flow-explorer.html');
    await this.serveStaticFile(filePath, res);
  }

  private async serveRelationshipGraph(res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), 'dashboard', 'relationship-graph.html');
    await this.serveStaticFile(filePath, res);
  }

  private async servePatternAnalyzer(res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), 'dashboard', 'pattern-analyzer.html');
    await this.serveStaticFile(filePath, res);
  }

  private async servePerformanceHotspots(res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), 'dashboard', 'performance-hotspots.html');
    await this.serveStaticFile(filePath, res);
  }

  private async serveNamespaceExplorer(res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), 'dashboard', 'namespace-explorer.html');
    await this.serveStaticFile(filePath, res);
  }

  private async serveSearchInterface(res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), 'dashboard', 'search-interface.html');
    await this.serveStaticFile(filePath, res);
  }

  private async startDashboardAPI(res: http.ServerResponse) {
    // Dashboard API is now integrated into main server
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Dashboard API integrated into main server',
      url: `http://localhost:${this.port || 8080}`
    }));
  }

  private async serveDashboardFile(pathname: string, res: http.ServerResponse) {
    const filePath = path.join(process.cwd(), pathname);
    await this.serveStaticFile(filePath, res);
  }

  private async serveStaticFile(filePath: string, res: http.ServerResponse) {
    try {
      const fs = require('fs/promises');
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      
      const contentTypes: { [key: string]: string } = {
        '.html': 'text/html; charset=UTF-8',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg'
      };
      
      const contentType = contentTypes[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    }
  }

  // Integrated Dashboard API methods
  private async handleTraceFlow(query: any, res: http.ServerResponse) {
    try {
      const symbol = query.symbol || '';
      const depth = parseInt(query.depth) || 5;
      
      const nodes: any[] = [];
      const edges: any[] = [];
      const visited = new Set<string>();
      
      // Find the symbol
      const symbolData = await this.databaseManager.executeQuerySingle(`
        SELECT id, name, qualified_name, file_path, line 
        FROM enhanced_symbols 
        WHERE name = ? OR qualified_name = ?
        LIMIT 1
      `, [symbol, symbol]);
      
      if (!symbolData) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          nodes: [], 
          edges: [], 
          maxDepth: depth,
          entryPoint: symbol,
          message: `Symbol '${symbol}' not found in the database`
        }));
        return;
      }
      
      // Add entry node
      const entryId = `${symbolData.id}`;
      nodes.push({
        id: entryId,
        label: symbolData.name,
        title: `${symbolData.qualified_name}\n${symbolData.file_path}:${symbolData.line}`,
        type: 'entry',
        level: 0
      });
      visited.add(entryId);
      
      // Trace callers (who calls this function)
      const callers = await this.databaseManager.executeQuery(`
        SELECT DISTINCT 
          es.id, es.name, es.qualified_name, es.file_path, es.line,
          sr.relationship_type
        FROM symbol_relationships sr
        JOIN enhanced_symbols es ON es.id = sr.from_symbol_id
        WHERE sr.to_symbol_id = ? AND sr.relationship_type = 'calls'
        LIMIT 20
      `, [symbolData.id]);
      
      callers.forEach((caller: any) => {
        const callerId = `${caller.id}`;
        if (!visited.has(callerId)) {
          nodes.push({
            id: callerId,
            label: caller.name,
            title: `${caller.qualified_name}\n${caller.file_path}:${caller.line}`,
            type: 'function',
            level: -1
          });
          visited.add(callerId);
        }
        
        edges.push({
          from: callerId,
          to: entryId,
          label: 'calls',
          title: `${caller.name} calls ${symbolData.name}`
        });
      });
      
      // Trace callees (what this function calls)
      const callees = await this.databaseManager.executeQuery(`
        SELECT DISTINCT 
          es.id, es.name, es.qualified_name, es.file_path, es.line,
          sr.relationship_type
        FROM symbol_relationships sr
        JOIN enhanced_symbols es ON es.id = sr.to_symbol_id
        WHERE sr.from_symbol_id = ? AND sr.relationship_type = 'calls'
        LIMIT 20
      `, [symbolData.id]);
      
      callees.forEach((callee: any) => {
        const calleeId = `${callee.id}`;
        if (!visited.has(calleeId)) {
          nodes.push({
            id: calleeId,
            label: callee.name,
            title: `${callee.qualified_name}\n${callee.file_path}:${callee.line}`,
            type: callee.file_path.includes('std::') ? 'external' : 'function',
            level: 1
          });
          visited.add(calleeId);
        }
        
        edges.push({
          from: entryId,
          to: calleeId,
          label: 'calls',
          title: `${symbolData.name} calls ${callee.name}`
        });
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        nodes,
        edges,
        maxDepth: depth,
        entryPoint: symbolData.name
      }));
    } catch (error) {
      console.error('Trace flow error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to trace code flow - database may be offline'
      }));
    }
  }

  private async handleRelationshipGraph(query: any, res: http.ServerResponse) {
    try {
      const type = query.type || 'all';
      const limit = parseInt(query.limit) || 500;
      
      // Get nodes (symbols with relationships) - using unified schema
      const nodes = await this.databaseManager.executeQuery(`
        SELECT DISTINCT 
          es.id, es.name, es.kind as type, es.file_path as file,
          COUNT(DISTINCT sr1.id) + COUNT(DISTINCT sr2.id) as connections
        FROM enhanced_symbols es
        LEFT JOIN symbol_relationships sr1 ON es.id = sr1.from_symbol_id
        LEFT JOIN symbol_relationships sr2 ON es.id = sr2.to_symbol_id
        WHERE es.id IN (
          SELECT from_symbol_id FROM symbol_relationships
          UNION
          SELECT to_symbol_id FROM symbol_relationships
        )
        GROUP BY es.id
        HAVING connections > 0
        ORDER BY connections DESC
        LIMIT ?
      `, [limit]);
      
      if (nodes.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ nodes: [], edges: [] }));
        return;
      }
      
      // Get edges based on filter
      const nodeIds = nodes.map(n => n.id);
      const placeholders = nodeIds.map(() => '?').join(',');
      
      let edgeQuery = `
        SELECT 
          sr.from_symbol_id as source,
          sr.to_symbol_id as target,
          sr.relationship_type as type,
          COUNT(*) as weight
        FROM symbol_relationships sr
        WHERE sr.from_symbol_id IN (${placeholders})
          AND sr.to_symbol_id IN (${placeholders})
      `;
      
      const params = [...nodeIds, ...nodeIds];
      
      if (type !== 'all') {
        edgeQuery += ` AND sr.relationship_type = ?`;
        params.push(type);
      }
      
      edgeQuery += ` GROUP BY sr.from_symbol_id, sr.to_symbol_id, sr.relationship_type`;
      
      const edges = await this.databaseManager.executeQuery(edgeQuery, params);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodes, edges }));
    } catch (error) {
      console.error('Relationship graph error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load relationship graph - database may be offline'
      }));
    }
  }

  private async handleRelationshipTypes(res: http.ServerResponse) {
    try {
      const relationshipTypes = await this.databaseManager.executeQuery(`
        SELECT relationship_type as type, COUNT(*) as count
        FROM symbol_relationships
        WHERE relationship_type IS NOT NULL
        GROUP BY relationship_type
        ORDER BY count DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(relationshipTypes));
    } catch (error) {
      console.error('Relationship types error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load relationship types - database may be offline'
      }));
    }
  }

  private async handlePatterns(res: http.ServerResponse) {
    try {
      // Get pattern distribution using unified schema
      const distribution = await this.databaseManager.executeQuery(`
        SELECT pattern_name, COUNT(*) as count
        FROM antipattern_stats
        GROUP BY pattern_name
      `);
      
      // Get good patterns (from semantic tags)
      const goodPatterns = await this.databaseManager.executeQuery(`
        SELECT 
          value as name,
          COUNT(*) as count
        FROM (
          SELECT json_each.value
          FROM enhanced_symbols, json_each(semantic_tags)
          WHERE semantic_tags IS NOT NULL 
            AND semantic_tags != '[]'
            AND semantic_tags != ''
        )
        WHERE value LIKE '%factory%' 
           OR value LIKE '%singleton%'
           OR value LIKE '%observer%'
           OR value LIKE '%builder%'
        GROUP BY value
        ORDER BY count DESC
      `);
      
      // Get anti-patterns from our actual tables
      const antiPatterns = await this.databaseManager.executeQuery(`
        SELECT 
          pattern_name as name,
          'code_quality' as category,
          'medium' as severity,
          detection_count as count,
          confidence_avg as confidence
        FROM antipattern_stats
        ORDER BY detection_count DESC
      `);
      
      // Generate improvement suggestions
      const suggestions = this.generateImprovementSuggestions(antiPatterns);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        distribution: Object.fromEntries(distribution.map(d => [d.pattern_name, d.count])),
        goodPatterns,
        antiPatterns,
        suggestions
      }));
    } catch (error) {
      console.error('Pattern analysis error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to analyze patterns - database may be offline'
      }));
    }
  }
  
  private generateImprovementSuggestions(antiPatterns: any[]): any[] {
    const suggestions = [];
    
    // Check for naming issues
    const namingIssues = antiPatterns.find(ap => ap.name === 'anti_pattern_poor_naming');
    if (namingIssues && namingIssues.count > 10) {
      suggestions.push({
        title: 'Improve Naming Conventions',
        description: `Found ${namingIssues.count} instances of poor naming. Consider establishing clear naming guidelines.`,
        priority: 'high',
        effort: 'medium'
      });
    }
    
    // Check for long signatures
    const longSigs = antiPatterns.find(ap => ap.name === 'anti_pattern_long_signature');
    if (longSigs && longSigs.count > 5) {
      suggestions.push({
        title: 'Refactor Long Function Signatures',
        description: `${longSigs.count} functions have too many parameters. Consider using parameter objects or builder pattern.`,
        priority: 'medium',
        effort: 'high'
      });
    }
    
    // Check for SOLID violations
    const solidViolations = antiPatterns.filter(ap => ap.name.includes('solid_violation'));
    if (solidViolations.length > 0) {
      const totalViolations = solidViolations.reduce((sum, v) => sum + v.count, 0);
      suggestions.push({
        title: 'Address SOLID Principle Violations',
        description: `Found ${totalViolations} SOLID principle violations. Focus on single responsibility and dependency inversion.`,
        priority: 'high',
        effort: 'high'
      });
    }
    
    return suggestions;
  }

  private async handlePerformanceAnalysis(res: http.ServerResponse) {
    try {
      // Get complexity metrics using unified schema
      const functions = await this.databaseManager.executeQuery(`
        SELECT 
          es.name, es.file_path as file, es.line, es.complexity,
          COUNT(DISTINCT sr.id) as calls
        FROM enhanced_symbols es
        LEFT JOIN symbol_relationships sr ON sr.from_symbol_id = es.id
        WHERE es.kind IN ('function', 'method') AND es.complexity > 0
        GROUP BY es.id
        ORDER BY es.complexity DESC
        LIMIT 100
      `);
      
      if (functions.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          patterns: [
            { category: 'gpu_intensive', functions: [], count: 0 },
            { category: 'cpu_bottlenecks', functions: [], count: 0 },
            { category: 'memory_issues', functions: [], count: 0 },
            { category: 'io_operations', functions: [], count: 0 }
          ],
          metrics: {
            avgComplexity: 0,
            highComplexityCount: 0,
            optimizationPotential: 0
          }
        }));
        return;
      }
      
      const avgComplexity = functions.reduce((sum, f) => sum + f.complexity, 0) / functions.length || 0;
      const highComplexityCount = functions.filter(f => f.complexity > 15).length;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        patterns: [
          {
            category: 'gpu_intensive',
            functions: functions.filter(f => f.file.includes('GPU') || f.file.includes('Vulkan')),
            count: functions.filter(f => f.file.includes('GPU') || f.file.includes('Vulkan')).length
          },
          {
            category: 'cpu_bottlenecks',
            functions: functions.filter(f => f.complexity > 15),
            count: highComplexityCount
          },
          {
            category: 'memory_issues',
            functions: [],
            count: 0
          },
          {
            category: 'io_operations',
            functions: functions.filter(f => f.file.includes('IO') || f.file.includes('File')),
            count: functions.filter(f => f.file.includes('IO') || f.file.includes('File')).length
          }
        ],
        metrics: {
          avgComplexity: Math.round(avgComplexity * 100) / 100,
          highComplexityCount,
          optimizationPotential: Math.round((highComplexityCount / functions.length) * 100)
        }
      }));
    } catch (error) {
      console.error('Performance analysis error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to analyze performance - database may be offline'
      }));
    }
  }

  private async handleNamespaces(res: http.ServerResponse) {
    try {
      const namespaces = await this.databaseManager.executeQuery(`
        SELECT namespace, COUNT(*) as symbolCount
        FROM enhanced_symbols
        WHERE namespace != '' AND namespace IS NOT NULL
        GROUP BY namespace
        ORDER BY namespace
      `);
      
      // Build a tree structure from namespace data
      const tree: any = {};
      
      namespaces.forEach((ns: any) => {
        if (!ns.namespace) return;
        
        const parts = ns.namespace.split('::');
        let current = tree;
        let currentPath = '';
        
        parts.forEach((part: any, index: number) => {
          currentPath += (currentPath ? '::' : '') + part;
          
          if (!current[part]) {
            current[part] = {
              name: part,
              fullPath: currentPath,
              symbolCount: 0,
              children: {}
            };
          }
          
          if (index === parts.length - 1) {
            current[part].symbolCount = ns.symbolCount;
          }
          
          current = current[part].children;
        });
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tree, total: namespaces.length }));
    } catch (error) {
      console.error('Namespace analysis error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load namespaces - database may be offline'
      }));
    }
  }

  private async handleNamespaceDetails(query: any, res: http.ServerResponse) {
    try {
      const namespace = query.ns || '';
      
      const symbols = await this.databaseManager.executeQuery(`
        SELECT name, qualified_name, kind, file_path as file, line, signature
        FROM enhanced_symbols
        WHERE namespace = ?
        ORDER BY kind, name
      `, [namespace]);
      
      // Get unique file count for this namespace
      const fileCount = await this.databaseManager.executeQuerySingle(`
        SELECT COUNT(DISTINCT file_path) as count
        FROM enhanced_symbols
        WHERE namespace = ?
      `, [namespace]);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        namespace, 
        symbols, 
        fileCount: fileCount?.count || 0 
      }));
    } catch (error) {
      console.error('Namespace details error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load namespace details - database may be offline'
      }));
    }
  }

  private async handleSearch(query: any, res: http.ServerResponse) {
    const Database = require('better-sqlite3');
    const db = new Database(this.dbPath, { readonly: true });
    
    try {
      const searchQuery = query.q || '';
      const typeFilter = query.type || '';
      const sortBy = query.sort || 'relevance';
      
      // Build search query
      let sql = `
        SELECT 
          id, name, qualified_name, kind as type, file_path as file, 
          line, signature, semantic_tags as tags
        FROM enhanced_symbols
        WHERE (
          name LIKE ? OR 
          qualified_name LIKE ? OR 
          signature LIKE ?
        )
      `;
      
      const params: any[] = [
        `%${searchQuery}%`,
        `%${searchQuery}%`,
        `%${searchQuery}%`
      ];
      
      if (typeFilter) {
        sql += ` AND kind = ?`;
        params.push(typeFilter);
      }
      
      sql += ` ORDER BY name LIMIT 50`;
      
      const results = db.prepare(sql).all(...params) as any[];
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        results: results,
        total: results.length
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } finally {
      db.close();
    }
  }

  private async handleFlowData(query: any, res: http.ServerResponse) {
    try {
      const nodeId = query.node || '';
      const mode = query.mode || 'both';
      const depth = parseInt(query.depth) || 3;
      
      if (!nodeId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Node parameter required' }));
        return;
      }
      
      const nodes: any[] = [];
      const edges: any[] = [];
      
      // Find the starting node
      const startNode = await this.databaseManager.executeQuerySingle(`
        SELECT id, name, qualified_name, kind, file_path, line
        FROM enhanced_symbols
        WHERE id = ? OR name = ? OR qualified_name = ?
        LIMIT 1
      `, [nodeId, nodeId, nodeId]);
      
      if (!startNode) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Node not found' }));
        return;
      }
      
      // Add the starting node
      nodes.push({
        id: startNode.id,
        name: startNode.name,
        type: startNode.kind,
        file: startNode.file_path,
        line: startNode.line
      });
      
      // Get related nodes based on mode
      if (mode === 'incoming' || mode === 'both') {
        const incoming = await this.databaseManager.executeQuery(`
          SELECT DISTINCT es.id, es.name, es.kind, es.file_path, es.line
          FROM symbol_relationships sr
          JOIN enhanced_symbols es ON es.id = sr.from_symbol_id
          WHERE sr.to_symbol_id = ?
          LIMIT 20
        `, [startNode.id]);
        
        incoming.forEach((node: any) => {
          if (!nodes.find(n => n.id === node.id)) {
            nodes.push({
              id: node.id,
              name: node.name,
              type: node.kind,
              file: node.file_path,
              line: node.line
            });
          }
          
          edges.push({
            source: node.id,
            target: startNode.id,
            type: 'calls'
          });
        });
      }
      
      if (mode === 'outgoing' || mode === 'both') {
        const outgoing = await this.databaseManager.executeQuery(`
          SELECT DISTINCT es.id, es.name, es.kind, es.file_path, es.line
          FROM symbol_relationships sr
          JOIN enhanced_symbols es ON es.id = sr.to_symbol_id
          WHERE sr.from_symbol_id = ?
          LIMIT 20
        `, [startNode.id]);
        
        outgoing.forEach((node: any) => {
          if (!nodes.find(n => n.id === node.id)) {
            nodes.push({
              id: node.id,
              name: node.name,
              type: node.kind,
              file: node.file_path,
              line: node.line
            });
          }
          
          edges.push({
            source: startNode.id,
            target: node.id,
            type: 'calls'
          });
        });
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodes, edges }));
    } catch (error) {
      console.error('Flow data error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  private async handlePerformanceHotspots(res: http.ServerResponse) {
    try {
      const hotspots = await this.databaseManager.executeQuery(`
        SELECT 
          es.id,
          es.name,
          es.file_path as file,
          es.line,
          'complexity' as type,
          CASE 
            WHEN es.complexity > 20 THEN 'critical'
            WHEN es.complexity > 15 THEN 'high'
            WHEN es.complexity > 10 THEN 'medium'
            ELSE 'low'
          END as severity,
          es.complexity as score,
          json_object(
            'cyclomatic', es.complexity,
            'callCount', COALESCE(call_counts.call_count, 0)
          ) as details
        FROM enhanced_symbols es
        LEFT JOIN (
          SELECT from_symbol_id, COUNT(*) as call_count
          FROM symbol_relationships
          WHERE relationship_type = 'calls'
          GROUP BY from_symbol_id
        ) call_counts ON call_counts.from_symbol_id = es.id
        WHERE es.kind IN ('function', 'method') 
          AND es.complexity > 5
        ORDER BY es.complexity DESC
        LIMIT 100
      `);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        hotspots: hotspots.map((h: any) => ({
          ...h,
          details: JSON.parse(h.details || '{}')
        }))
      }));
    } catch (error) {
      console.error('Performance hotspots error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  public close() {
    this.server.close();
  }

  public shutdown(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close database manager
      if (this.databaseManager) {
        this.databaseManager.close();
      }
      
      
      // Close main server
      this.server.close((err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }
}

// CLI entry point
if (require.main === module) {
  const dbPath = process.argv[2] || 'module-sentinel.db';
  const port = parseInt(process.argv[3]) || 8080;
  
  console.log(`Starting visualization API server...`);
  console.log(`Database: ${dbPath}`);
  console.log(`Port: ${port}`);
  
  new VisualizationAPI(dbPath, port);
}