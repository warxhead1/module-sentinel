import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import { ProjectVisualizer } from '../visualization/project-visualizer.js';
import { CallFlowVisualizer } from '../visualization/call-flow-visualizer.js';

/**
 * On-demand visualization API server
 * Generates visualizations dynamically based on URL parameters
 */
export class VisualizationAPI {
  private server: http.Server;
  private dbPath: string;

  constructor(dbPath: string = 'module-sentinel.db', port: number = 8080) {
    this.dbPath = dbPath;
    
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
      console.log(`🎨 Visualization API server running on http://localhost:${port}`);
      console.log('Available endpoints:');
      console.log('  GET /project-treemap.svg - Project overview treemap');
      console.log('  GET /project-architecture.html - Interactive architecture');
      console.log('  GET /dependency-matrix.html - Module dependency matrix');
      console.log('  GET /call-flow/<symbol>.html - Call flow for specific symbol');
      console.log('  GET /call-flow-list.html - List of available symbols for call flow');
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
          await this.serveIndex(res);
          break;
          
        case pathname === '/project-treemap.svg':
          await this.serveTreemap(res, parsedUrl.query);
          break;
          
        case pathname === '/project-architecture.html':
          await this.serveArchitecture(res);
          break;
          
        case pathname === '/dependency-matrix.html':
          await this.serveDependencyMatrix(res);
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

        case pathname.startsWith('/api/table/'):
          const tableName = pathname.replace('/api/table/', '');
          await this.serveTableDataAPI(res, tableName, parsedUrl.query);
          break;

        case pathname === '/browse-database.html':
          await this.serveBrowseDatabase(res);
          break;
          
        default:
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
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
            <a href="/project-architecture.html" class="btn">Interactive Architecture</a>
        </div>
        
        <div class="card">
            <h3>🔗 Dependencies</h3>
            <div class="description">Module-to-module dependency relationships</div>
            <a href="/dependency-matrix.html" class="btn">Dependency Matrix</a>
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
            <a href="/browse-database.html" class="btn">Browse Database</a>
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
        s.qualified_name,
        s.kind,
        s.parent_class,
        s.file_path,
        COUNT(sr.from_symbol_id) as outgoing_relationships
      FROM enhanced_symbols s
      LEFT JOIN symbol_relationships sr ON s.id = sr.from_symbol_id
      ${whereClause}
      GROUP BY s.qualified_name
      ORDER BY outgoing_relationships DESC
      LIMIT ?
    `).all(...params, limit);
    
    db.close();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      symbols,
      meta: {
        count: symbols.length,
        limit,
        search,
        generated_at: new Date().toISOString()
      }
    }, null, 2));
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

  public close() {
    this.server.close();
  }

  public shutdown(): Promise<void> {
    return new Promise((resolve, reject) => {
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