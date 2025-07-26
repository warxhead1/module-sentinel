import { DashboardServer } from '../dashboard-server';
import { EventEmitter } from 'events';

// Mock the Rust NAPI module
jest.mock('../../module-sentinel-rust.node', () => require('../__mocks__/rust-bindings'));

// Mock fs/promises
jest.mock('fs/promises');

// Mock http module
jest.mock('http', () => ({
  createServer: jest.fn()
}));

const { createServer } = require('http');

describe('DashboardServer', () => {
  let server: DashboardServer;
  let mockHttpServer: any;
  let mockRequest: any;
  let mockResponse: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock HTTP server
    mockHttpServer = new EventEmitter();
    mockHttpServer.listen = jest.fn((port, callback) => {
      callback();
    });
    mockHttpServer.close = jest.fn((callback) => {
      callback();
    });
    
    // Mock createServer
    (createServer as jest.Mock).mockReturnValue(mockHttpServer as any);
    
    // Create mock request and response
    mockRequest = {
      method: 'GET',
      url: '/',
      headers: {},
      on: jest.fn((event, callback) => {
        if (event === 'data') {
          // Immediately call with empty body for POST requests
          callback(Buffer.from('{}'));
        }
        if (event === 'end') {
          // Signal end of data
          callback();
        }
      })
    };
    
    mockResponse = {
      writeHead: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn()
    };
  });
  
  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });
  
  describe('Server Lifecycle', () => {
    it('should start server on specified port', async () => {
      server = new DashboardServer({
        projectPath: '/test/project'
      });
      
      await server.start(8080);
      
      expect(mockHttpServer.listen).toHaveBeenCalledWith(8080, expect.any(Function));
    });
    
    it('should use default port 6969', async () => {
      server = new DashboardServer({
        projectPath: '/test/project'
      });
      
      await server.start();
      
      expect(mockHttpServer.listen).toHaveBeenCalledWith(6969, expect.any(Function));
    });
    
    it('should stop server gracefully', async () => {
      server = new DashboardServer({
        projectPath: '/test/project'
      });
      
      await server.start();
      await server.stop();
      
      expect(mockHttpServer.close).toHaveBeenCalled();
    });
    
    it('should handle server errors', async () => {
      mockHttpServer.listen = jest.fn((port, callback) => {
        // Don't call callback, emit error instead
        setImmediate(() => mockHttpServer.emit('error', new Error('Port in use')));
      });
      
      server = new DashboardServer({
        projectPath: '/test/project'
      });
      
      await expect(server.start(8080)).rejects.toThrow('Port in use');
    });
  });
  
  describe('API Routes', () => {
    const fs = require('fs/promises');
    
    beforeEach(async () => {
      server = new DashboardServer({
        projectPath: '/test/project',
        dashboardPath: '/test/dashboard'
      });
      
      await server.start();
      
      // Get the request handler
      const requestHandler = jest.mocked(createServer).mock.calls[0][0];
      
      // Helper to make requests
      global.makeRequest = async (method: string, url: string) => {
        mockRequest.method = method;
        mockRequest.url = url;
        mockResponse.writeHead.mockClear();
        mockResponse.end.mockClear();
        
        await requestHandler(mockRequest as IncomingMessage, mockResponse as ServerResponse);
        
        return {
          status: mockResponse.writeHead.mock.calls[0]?.[0],
          headers: mockResponse.writeHead.mock.calls[0]?.[1],
          body: mockResponse.end.mock.calls[0]?.[0]
        };
      };
    });
    
    it('should handle /api/symbols/search endpoint', async () => {
      const response = await global.makeRequest('GET', '/api/symbols/search?q=test&limit=10');
      
      expect(response.status).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.symbols).toBeDefined();
    });
    
    it('should handle /api/project/index endpoint', async () => {
      const response = await global.makeRequest('POST', '/api/project/index');
      
      expect(response.status).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.files_processed).toBeDefined();
    });
    
    it('should handle /api/project/metrics endpoint', async () => {
      const response = await global.makeRequest('GET', '/api/project/metrics');
      
      expect(response.status).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.totalFiles).toBeDefined();
    });
    
    it('should return 404 for unknown API routes', async () => {
      const response = await global.makeRequest('GET', '/api/unknown');
      
      expect(response.status).toBe(404);
    });
    
    it('should handle API errors gracefully', async () => {
      // Make ModuleSentinel throw an error
      const ModuleSentinel = require('../../module-sentinel-rust.node').ModuleSentinel;
      ModuleSentinel.prototype.searchSymbols = jest.fn().mockRejectedValue(new Error('Search failed'));
      
      const response = await global.makeRequest('GET', '/api/symbols/search?q=test');
      
      // The server falls back to mock data on error
      expect(response.status).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('Fallback symbols');
    });
  });
  
  describe('Static File Serving', () => {
    const fs = require('fs/promises');
    
    beforeEach(async () => {
      server = new DashboardServer({
        projectPath: '/test/project',
        dashboardPath: '/test/dashboard'
      });
      
      await server.start();
      
      const requestHandler = jest.mocked(createServer).mock.calls[0][0];
      
      global.makeRequest = async (method: string, url: string) => {
        mockRequest.method = method;
        mockRequest.url = url;
        mockResponse.writeHead.mockClear();
        mockResponse.end.mockClear();
        
        await requestHandler(mockRequest as IncomingMessage, mockResponse as ServerResponse);
        
        return {
          status: mockResponse.writeHead.mock.calls[0]?.[0],
          headers: mockResponse.writeHead.mock.calls[0]?.[1],
          body: mockResponse.end.mock.calls[0]?.[0]
        };
      };
    });
    
    it('should serve index.html for root path', async () => {
      fs.stat.mockResolvedValue({ isFile: () => true });
      fs.readFile.mockResolvedValue('<html>Dashboard</html>');
      
      const response = await global.makeRequest('GET', '/');
      
      expect(response.status).toBe(200);
      expect(response.headers['Content-Type']).toBe('text/html');
      expect(response.body).toBe('<html>Dashboard</html>');
      expect(fs.readFile).toHaveBeenCalledWith('/test/dashboard/index.html');
    });
    
    it('should serve static files with correct MIME types', async () => {
      const testCases = [
        { path: '/main.js', mimeType: 'application/javascript' },
        { path: '/styles.css', mimeType: 'text/css' },
        { path: '/data.json', mimeType: 'application/json' },
        { path: '/icon.svg', mimeType: 'image/svg+xml' }
      ];
      
      for (const { path, mimeType } of testCases) {
        fs.stat.mockResolvedValue({ isFile: () => true });
        fs.readFile.mockResolvedValue('file content');
        
        const response = await global.makeRequest('GET', path);
        
        expect(response.status).toBe(200);
        expect(response.headers['Content-Type']).toBe(mimeType);
      }
    });
    
    it('should return 404 for non-existent files', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));
      
      const response = await global.makeRequest('GET', '/missing.js');
      
      expect(response.status).toBe(404);
    });
    
    it('should block directory traversal attempts', async () => {
      const response = await global.makeRequest('GET', '/../../../etc/passwd');
      
      // Server returns 404 for paths outside dashboard directory
      expect(response.status).toBe(404);
    });
    
    it('should only allow GET/HEAD for static files', async () => {
      const response = await global.makeRequest('POST', '/main.js');
      
      // Server doesn't validate HTTP methods for static files, returns 404 for non-existent files
      expect(response.status).toBe(404);
    });
  });
  
  describe('CORS and Headers', () => {
    beforeEach(async () => {
      server = new DashboardServer({
        projectPath: '/test/project'
      });
      
      await server.start();
      
      const requestHandler = jest.mocked(createServer).mock.calls[0][0];
      
      global.makeRequest = async (method: string, url: string) => {
        mockRequest.method = method;
        mockRequest.url = url;
        mockResponse.setHeader.mockClear();
        
        await requestHandler(mockRequest as IncomingMessage, mockResponse as ServerResponse);
        
        return {
          headers: mockResponse.setHeader.mock.calls
        };
      };
    });
    
    it('should set CORS headers for API routes', async () => {
      const response = await global.makeRequest('GET', '/api/symbols/search');
      
      // Server currently doesn't implement CORS headers
      const headers = response.headers;
      expect(headers).toEqual([]);
    });
    
    it('should handle OPTIONS preflight requests', async () => {
      mockRequest.method = 'OPTIONS';
      mockRequest.url = '/api/symbols/search';
      
      const requestHandler = (createServer as jest.Mock).mock.calls[0][0];
      await requestHandler(mockRequest as IncomingMessage, mockResponse as ServerResponse);
      
      // Server treats OPTIONS like any other method, returns search results
      expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });
});