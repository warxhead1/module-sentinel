import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join } from 'path';

// TODO: Import Rust bindings via NAPI-RS
// import { searchSymbols, indexProject, getSymbolRelationships } from './module-sentinel-rust.node';

/**
 * Minimal dashboard server using built-in Node.js HTTP
 * Serves static files + API routes via NAPI-RS to Rust
 * Zero dependencies, maximum performance
 */
export class DashboardServer {
  private server: ReturnType<typeof createServer>;
  private dashboardPath: string;
  private projectPath: string;

  constructor(options: {
    projectPath: string;
    dashboardPath?: string;
    port?: number;
    debugMode?: boolean;
  }) {
    this.projectPath = options.projectPath;
    this.dashboardPath = options.dashboardPath || join(__dirname, 'dashboard');
    
    // Create HTTP server
    this.server = createServer(this.handleRequest.bind(this));
  }

  /**
   * Start the dashboard server
   */
  async start(port: number = 6969): Promise<void> {
    // Start HTTP server
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        console.log(`🚀 Dashboard server running at http://localhost:${port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    
    try {
      // API routes - call Rust via NAPI-RS
      if (url.startsWith('/api/')) {
        await this.handleApiRequest(req, res);
        return;
      }

      // Static files
      await this.handleStaticFile(req, res);
      
    } catch (error) {
      console.error('Request error:', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Handle API requests - call Rust functions via NAPI-RS
   */
  private async handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '';
    const method = req.method || 'GET';

    // Parse request body for POST requests
    let body: any = {};
    if (method === 'POST') {
      body = await this.parseRequestBody(req);
    }

    try {
      if (url.startsWith('/api/symbols/search')) {
        const urlParams = new URL(url, 'http://localhost').searchParams;
        const query = urlParams.get('q') || '';
        const _kind = urlParams.get('kind') || undefined;
        const _limit = parseInt(urlParams.get('limit') || '20');
        
        // TODO: Replace with actual NAPI call
        // const result = await searchSymbols(query, { kind, limit });
        const result = {
          symbols: [],
          total: 0,
          message: `TODO: Search for "${query}" via NAPI-RS`
        };
        
        this.sendJson(res, { success: true, data: result });
        
      } else if (url.startsWith('/api/project/index')) {
        const _force = body.force || false;
        const _languages = body.languages || ['cpp', 'python', 'typescript', 'javascript'];
        
        // TODO: Replace with actual NAPI call
        // const result = await indexProject(this.projectPath, { force, languages });
        const result = {
          indexed: 0,
          message: `TODO: Index project "${this.projectPath}" via NAPI-RS`
        };
        
        this.sendJson(res, { success: true, data: result });
        
      } else {
        this.sendError(res, 404, 'API endpoint not found');
        return;
      }

    } catch (error) {
      console.error('API error:', error);
      this.sendJson(res, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }

  /**
   * Handle static file requests
   */
  private async handleStaticFile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let filePath = req.url || '/';
    
    // Default to index.html for SPA routing
    if (filePath === '/' || !extname(filePath)) {
      filePath = '/index.html';
    }

    const fullPath = join(this.dashboardPath, filePath);

    try {
      // Check if file exists
      await stat(fullPath);
      
      // Read and serve file
      const content = await readFile(fullPath);
      const contentType = this.getContentType(extname(filePath));
      
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length
      });
      res.end(content);
      
    } catch {
      // File not found - serve index.html for SPA routing
      if (filePath !== '/index.html') {
        req.url = '/';
        await this.handleStaticFile(req, res);
      } else {
        this.sendError(res, 404, 'File not found');
      }
    }
  }

  /**
   * Parse request body for POST requests
   */
  private async parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve(parsed);
        } catch {
          reject(new Error('Invalid JSON in request body'));
        }
      });
      
      req.on('error', reject);
    });
  }

  /**
   * Get content type for file extensions
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject'
    };
    
    return types[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, data: any, statusCode: number = 200): void {
    const json = JSON.stringify(data);
    
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json)
    });
    res.end(json);
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(message)
    });
    res.end(message);
  }
}

// CLI entry point for standalone dashboard server
if (require.main === module) {
  const projectPath = process.argv[2] || process.cwd();
  const port = parseInt(process.argv[3]) || 6969;
  
  const dashboardServer = new DashboardServer({
    projectPath,
    debugMode: process.env.NODE_ENV === 'development'
  });

  // Start server
  dashboardServer.start(port).catch(console.error);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down dashboard server...');
    await dashboardServer.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}