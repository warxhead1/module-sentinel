/**
 * Modern Module Sentinel API Server
 * Replaces the monolithic visualization-api.ts with a clean, modular structure
 */
import * as http from "http";
import * as url from "url";
import * as path from "path";
import * as fs from "fs";
import type Database from "better-sqlite3";

// Services
import { DatabaseService } from "./services/database.service.js";
import { ModulesService } from "./services/modules.service.js";
import { IndexingService } from "./services/indexing.service.js";
import { LanguageDetectionService } from "./services/language-detection.service.js";
import { ProjectService } from "./services/project.service.js";

// Routes
import { ModulesRoutes } from "./routes/modules.js";
import { SymbolsRoutes } from "./routes/symbols.js";
import { StatsRoutes } from "./routes/stats.js";
import { CodeFlowRoutes } from "./routes/code-flow.js";
import { SearchRoutes } from "./routes/search.js";
import { CrossLanguageRoutes } from "./routes/cross-language.js";
import { AnalyticsRoutes } from "./routes/analytics.js";
import { SemanticInsightsRoutes } from "./routes/semantic-insights.js";

// Types
import type { Request, Response } from "./types/express.js";
import type { ApiResponse } from "../shared/types/api.js";

export class ModernApiServer {
  private server: http.Server;
  private db: Database.Database;
  private port: number;

  // Request throttling
  private requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private readonly MAX_REQUESTS_PER_SECOND = 20; // Increased for initial loads

  // Services
  private dbService: DatabaseService;
  private modulesService: ModulesService;
  private indexingService: IndexingService;
  private projectService: ProjectService;

  // Routes
  private modulesRoutes: ModulesRoutes;
  private symbolsRoutes: SymbolsRoutes;
  private statsRoutes: StatsRoutes;
  private codeFlowRoutes: CodeFlowRoutes;
  private searchRoutes: SearchRoutes;
  private crossLanguageRoutes: CrossLanguageRoutes;
  private analyticsRoutes: AnalyticsRoutes;
  private semanticInsightsRoutes: SemanticInsightsRoutes;

  constructor(database: Database.Database, port: number = 8080) {
    this.db = database;
    this.port = port;

    // Initialize services
    this.dbService = new DatabaseService(database);
    this.modulesService = new ModulesService(database);
    this.indexingService = new IndexingService(database, {
      debugMode: process.env.NODE_ENV === "development",
      maxConcurrentJobs: 2,
      enableProgressTracking: true,
    });
    this.projectService = new ProjectService(database);

    // Initialize routes
    this.modulesRoutes = new ModulesRoutes(this.modulesService);
    this.symbolsRoutes = new SymbolsRoutes(this.dbService);
    this.statsRoutes = new StatsRoutes(this.dbService);
    this.codeFlowRoutes = new CodeFlowRoutes(database);
    this.searchRoutes = new SearchRoutes(database);
    this.crossLanguageRoutes = new CrossLanguageRoutes(this.dbService);
    this.analyticsRoutes = new AnalyticsRoutes(database);
    this.semanticInsightsRoutes = new SemanticInsightsRoutes(database);

    // Create HTTP server
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on("error", (error) => {
        console.error("Server error:", error);
        reject(error);
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("📡 API Server stopped");
        resolve();
      });
    });
  }

  /**
   * Parse request body
   */
  private async parseRequestBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          if (
            body &&
            req.headers["content-type"]?.includes("application/json")
          ) {
            resolve(JSON.parse(body));
          } else {
            resolve({});
          }
        } catch (error) {
          reject(new Error("Invalid JSON in request body"));
        }
      });

      req.on("error", reject);
    });
  }

  /**
   * Main request handler
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    // Enable CORS
    this.setCorsHeaders(res);

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const parsedUrl = url.parse(req.url || "", true);
      const pathname = parsedUrl.pathname || "/";

      // Create our request/response wrappers
      const request = this.createRequest(req, parsedUrl);
      const response = this.createResponse(res);

      // Route handling
      if (pathname.startsWith("/api/")) {
        await this.handleApiRequest(pathname, request, response, req);
      } else {
        // Serve static files (dashboard)
        await this.handleStaticRequest(pathname, response);
      }
    } catch (error) {
      console.error("Request handling error:", error);
      this.sendErrorResponse(res, 500, "Internal server error");
    }
  }

  /**
   * Handle API requests
   */
  private async handleApiRequest(
    pathname: string,
    req: Request,
    res: Response,
    rawReq?: http.IncomingMessage
  ) {
    // Emergency throttling to prevent spam
    const clientKey = String(
      req.headers["x-forwarded-for"] || req.headers["user-agent"] || "unknown"
    );
    const now = Date.now();

    if (!this.requestCounts.has(clientKey)) {
      this.requestCounts.set(clientKey, { count: 0, resetTime: now + 1000 });
    }

    const clientData = this.requestCounts.get(clientKey)!;
    if (now > clientData.resetTime) {
      clientData.count = 0;
      clientData.resetTime = now + 1000;
    }

    clientData.count++;
    if (clientData.count > this.MAX_REQUESTS_PER_SECOND) {
      console.warn(
        `Rate limiting client: ${clientKey} (${clientData.count} requests/sec)`
      );
      this.sendErrorResponse(res, 429, "Too many requests - rate limited");
      return;
    }

    // Remove /api prefix
    const apiPath = pathname.substring(4);

    try {
      // Route to appropriate handler
      if (apiPath === "/modules" && req.method === "GET") {
        await this.modulesRoutes.getModules(req, res);
      } else if (apiPath.startsWith("/modules/") && req.method === "GET") {
        // Parse namespace and module from path
        const pathParts = apiPath.split("/").slice(2); // Remove empty string and 'modules'
        if (pathParts.length >= 2) {
          req.params.namespace = pathParts[0];
          req.params.module = pathParts[1];
          await this.modulesRoutes.getModuleDetails(req, res);
        } else {
          this.sendErrorResponse(res, 400, "Invalid module path");
        }
      } else if (apiPath === "/symbols" && req.method === "GET") {
        await this.symbolsRoutes.searchSymbols(req, res);
      } else if (
        apiPath.match(/^\/symbols\/file\/.+$/) &&
        req.method === "GET"
      ) {
        const qualifiedName = decodeURIComponent(
          apiPath.split("/").slice(3).join("/")
        );
        req.params.qualifiedName = qualifiedName;
        await this.symbolsRoutes.getFileSymbols(req, res);
      } else if (
        apiPath.match(/^\/symbols\/\d+\/relationships$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[2];
        req.params.id = symbolId;
        await this.symbolsRoutes.getSymbolRelationships(req, res);
      } else if (apiPath === "/stats" && req.method === "GET") {
        await this.statsRoutes.getStats(req, res);
      } else if (apiPath === "/namespaces" && req.method === "GET") {
        await this.statsRoutes.getNamespaces(req, res);
      } else if (
        apiPath.match(/^\/namespaces\/[^\/]+\/symbols$/) &&
        req.method === "GET"
      ) {
        const namespaceName = apiPath.split("/")[2];
        req.params.name = namespaceName;
        await this.statsRoutes.getNamespaceSymbols(req, res);
      } else if (apiPath === "/projects" && req.method === "GET") {
        await this.statsRoutes.getProjects(req, res);
      } else if (apiPath === "/languages" && req.method === "GET") {
        await this.statsRoutes.getLanguages(req, res);
      } else if (apiPath === "/health" && req.method === "GET") {
        await this.statsRoutes.getHealth(req, res);
      } else if (apiPath === "/relationships" && req.method === "GET") {
        await this.symbolsRoutes.getAllRelationships(req, res);
      } else if (apiPath === "/files/browse" && req.method === "GET") {
        await this.handleFileBrowse(req, res);
      }
      // Cross-language analysis routes
      else if (apiPath === "/cross-language/symbols" && req.method === "GET") {
        await this.crossLanguageRoutes.getCrossLanguageSymbols(req, res);
      } else if (
        apiPath === "/cross-language/relationships" &&
        req.method === "GET"
      ) {
        await this.crossLanguageRoutes.getCrossLanguageRelationships(req, res);
      } else if (
        apiPath === "/cross-language/entry-points" &&
        req.method === "GET"
      ) {
        await this.crossLanguageRoutes.getCrossLanguageEntryPoints(req, res);
      } else if (
        apiPath === "/cross-language/languages" &&
        req.method === "GET"
      ) {
        await this.crossLanguageRoutes.getCrossLanguageLanguages(req, res);
      }
      // Analytics routes
      else if (
        apiPath.match(/^\/analytics\/data-flow\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.analyticsRoutes.getDataFlow(req, res);
      } else if (
        apiPath.match(/^\/analytics\/impact\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.analyticsRoutes.getImpactAnalysis(req, res);
      } else if (apiPath === "/analytics/patterns" && req.method === "GET") {
        await this.analyticsRoutes.getPatterns(req, res);
      } else if (
        apiPath.match(/^\/analytics\/execution\/\d+$/) &&
        req.method === "GET"
      ) {
        const entryPoint = apiPath.split("/")[3];
        req.params.entryPoint = entryPoint;
        await this.analyticsRoutes.getExecutionSimulation(req, res);
      } else if (
        apiPath.match(/^\/analytics\/complexity\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.analyticsRoutes.getComplexityMetrics(req, res);
      } else if (
        apiPath === "/analytics/bulk-impact" &&
        req.method === "POST"
      ) {
        if (rawReq) {
          req.body = await this.parseRequestBody(rawReq);
        }
        await this.analyticsRoutes.getBulkImpactAnalysis(req, res);
      }
      // Semantic insights routes
      else if (apiPath === "/semantic/insights" && req.method === "GET") {
        await this.semanticInsightsRoutes.getInsights(req, res);
      } else if (
        apiPath.match(/^\/semantic\/insights\/symbol\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[4];
        await this.semanticInsightsRoutes.getSymbolInsights(req, res, symbolId);
      } else if (apiPath === "/semantic/clusters" && req.method === "GET") {
        await this.semanticInsightsRoutes.getClusters(req, res);
      } else if (
        apiPath.match(/^\/semantic\/clusters\/\d+$/) &&
        req.method === "GET"
      ) {
        const clusterId = apiPath.split("/")[3];
        await this.semanticInsightsRoutes.getClusterDetails(
          req,
          res,
          clusterId
        );
      } else if (apiPath === "/semantic/metrics" && req.method === "GET") {
        await this.semanticInsightsRoutes.getMetrics(req, res);
      } else if (
        apiPath.match(/^\/semantic\/insights\/\d+\/recommendations$/) &&
        req.method === "GET"
      ) {
        const insightId = apiPath.split("/")[3];
        await this.semanticInsightsRoutes.getRecommendations(
          req,
          res,
          insightId
        );
      } else if (
        apiPath.match(/^\/semantic\/insights\/\d+\/feedback$/) &&
        req.method === "POST"
      ) {
        const insightId = apiPath.split("/")[3];
        if (rawReq) {
          req.body = await this.parseRequestBody(rawReq);
        }
        await this.semanticInsightsRoutes.submitFeedback(req, res, insightId);
      } else if (apiPath === "/semantic/analyze" && req.method === "POST") {
        if (rawReq) {
          req.body = await this.parseRequestBody(rawReq);
        }
        await this.semanticInsightsRoutes.analyzeFiles(req, res);
      } else if (apiPath === "/rebuild-index" && req.method === "POST") {
        await this.statsRoutes.rebuildIndex(req, res);
      } else if (apiPath === "/patterns" && req.method === "GET") {
        await this.statsRoutes.getPatterns(req, res);
      } else if (apiPath === "/performance/hotspots" && req.method === "GET") {
        await this.statsRoutes.getPerformanceHotspots(req, res);
      } else if (
        apiPath.match(/^\/projects\/\d+\/index$/) &&
        req.method === "POST"
      ) {
        const projectId = apiPath.split("/")[2];
        req.params.id = projectId;
        if (rawReq) {
          req.body = await this.parseRequestBody(rawReq);
        }
        await this.handleIndexProject(req, res);
      } else if (
        apiPath.match(/^\/indexing\/jobs\/[\w-]+$/) &&
        req.method === "GET"
      ) {
        const jobId = apiPath.split("/")[3];
        req.params.jobId = jobId;
        await this.handleGetIndexingJob(req, res);
      } else if (apiPath === "/indexing/jobs" && req.method === "GET") {
        await this.handleGetIndexingJobs(req, res);
      } else if (
        apiPath.match(/^\/projects\/\d+\/detect-languages$/) &&
        req.method === "GET"
      ) {
        const projectId = apiPath.split("/")[2];
        req.params.id = projectId;
        await this.handleDetectProjectLanguages(req, res);
      } else if (apiPath === "/projects" && req.method === "POST") {
        await this.handleCreateProject(req, res, rawReq);
      } else if (apiPath.match(/^\/projects\/\d+$/) && req.method === "PUT") {
        const projectId = apiPath.split("/")[2];
        req.params.id = projectId;
        await this.handleUpdateProject(req, res, rawReq);
      } else if (
        apiPath.match(/^\/projects\/\d+$/) &&
        req.method === "DELETE"
      ) {
        const projectId = apiPath.split("/")[2];
        req.params.id = projectId;
        await this.handleDeleteProject(req, res);
      } else if (apiPath.match(/^\/projects\/\d+$/) && req.method === "GET") {
        const projectId = apiPath.split("/")[2];
        req.params.id = projectId;
        await this.handleGetProject(req, res);
      }
      // Code Flow API endpoints
      else if (
        apiPath.match(/^\/code-flow\/call-graph\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.codeFlowRoutes.getCallGraph(req, res);
      } else if (
        apiPath === "/code-flow/execution-paths" &&
        req.method === "GET"
      ) {
        await this.codeFlowRoutes.getExecutionPaths(req, res);
      } else if (
        apiPath.match(/^\/code-flow\/branches\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.codeFlowRoutes.getBranchAnalysis(req, res);
      } else if (
        apiPath === "/code-flow/unused-paths" &&
        req.method === "GET"
      ) {
        await this.codeFlowRoutes.getUnusedPaths(req, res);
      } else if (
        apiPath.match(/^\/code-flow\/control-flow\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.codeFlowRoutes.getControlFlow(req, res);
      } else if (apiPath === "/code-flow/metrics" && req.method === "GET") {
        await this.codeFlowRoutes.getFlowMetrics(req, res);
      } else if (
        apiPath.match(/^\/code-flow\/analyze\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.codeFlowRoutes.analyzeFunction(req, res);
      } else if (
        apiPath.match(/^\/code-flow\/complexity\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.codeFlowRoutes.getComplexityMetrics(req, res);
      } else if (apiPath === "/code-flow/hotspots" && req.method === "GET") {
        await this.codeFlowRoutes.getHotspots(req, res);
      } else if (
        apiPath.match(/^\/code-flow\/multi-language\/\d+$/) &&
        req.method === "GET"
      ) {
        const symbolId = apiPath.split("/")[3];
        req.params.symbolId = symbolId;
        await this.codeFlowRoutes.getMultiLanguageFlow(req, res);
      } else if (apiPath === "/search" && req.method === "GET") {
        await this.searchRoutes.search(req, res);
      } else {
        this.sendErrorResponse(res, 404, `API endpoint not found: ${apiPath}`);
      }
    } catch (error) {
      console.error("API request error:", error);
      this.sendErrorResponse(res, 500, "API request failed");
    }
  }

  /**
   * Handle static file requests (dashboard files)
   */
  private async handleStaticRequest(pathname: string, res: Response) {
    // Serve dashboard files
    const dashboardDir = path.join(process.cwd(), "dashboard");

    // Default to index.html for SPA routing
    let filePath: string;
    if (pathname === "/" || !path.extname(pathname)) {
      filePath = path.join(dashboardDir, "spa", "index.html");
    } else {
      filePath = path.join(dashboardDir, pathname.substring(1));
    }

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const contentType = this.getContentType(ext);

        res.writeHead(200, { "Content-Type": contentType });
        res.end(content.toString());
      } else {
        // For SPA routing, serve index.html for unknown routes
        const indexPath = path.join(dashboardDir, "spa", "index.html");
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(content.toString());
        } else {
          this.sendErrorResponse(res, 404, "Page not found");
        }
      }
    } catch (error) {
      console.error("Static file error:", error);
      this.sendErrorResponse(res, 500, "Failed to serve file");
    }
  }

  /**
   * Set CORS headers
   */
  private setCorsHeaders(res: http.ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  /**
   * Create request wrapper
   */
  private createRequest(
    req: http.IncomingMessage,
    parsedUrl: url.UrlWithParsedQuery
  ): Request {
    return {
      params: {},
      query: parsedUrl.query as Record<string, string>,
      headers: req.headers as Record<string, string>,
      method: req.method || "GET",
      url: req.url || "/",
    };
  }

  /**
   * Create response wrapper
   */
  private createResponse(res: http.ServerResponse): Response {
    return {
      writeHead: (statusCode: number, headers?: Record<string, string>) => {
        res.writeHead(statusCode, headers);
      },
      write: (chunk: string) => {
        res.write(chunk);
      },
      end: (data?: string) => {
        res.end(data);
      },
      json: (data: any) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data, null, 2));
      },
      status: (code: number) => {
        res.statusCode = code;
        return this.createResponse(res); // Return self for chaining
      },
    };
  }

  /**
   * Handle file browsing API requests
   */
  private async handleFileBrowse(req: Request, res: Response): Promise<void> {
    try {
      const path = req.query.path as string;
      if (!path) {
        res.status(400).json({
          success: false,
          error: "Path parameter is required",
        });
        return;
      }

      // Security check - prevent directory traversal
      const fs = require("fs");
      const nodePath = require("path");

      const resolvedPath = nodePath.resolve(path);
      if (
        !resolvedPath.startsWith("/home") &&
        !resolvedPath.startsWith("/Users")
      ) {
        res.status(403).json({
          success: false,
          error: "Access denied - path must be within home directory",
        });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({
          success: false,
          error: "Directory not found",
        });
        return;
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        res.status(400).json({
          success: false,
          error: "Path is not a directory",
        });
        return;
      }

      const items = fs
        .readdirSync(resolvedPath)
        .map((name: string) => {
          const itemPath = nodePath.join(resolvedPath, name);
          try {
            const itemStat = fs.statSync(itemPath);
            return {
              name,
              path: itemPath,
              isDirectory: itemStat.isDirectory(),
              isFile: itemStat.isFile(),
              size: itemStat.size,
              modified: itemStat.mtime,
            };
          } catch (error) {
            // Skip items we can't read
            return null;
          }
        })
        .filter((item: any) => item !== null)
        .sort((a: any, b: any) => {
          // Directories first, then alphabetical
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      res.json({
        success: true,
        data: items,
        message: `Found ${items.length} items in ${resolvedPath}`,
      });
    } catch (error) {
      console.error("File browse error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to browse directory",
      });
    }
  }

  /**
   * Send error response
   */
  private sendErrorResponse(
    res: http.ServerResponse | Response,
    statusCode: number,
    message: string
  ) {
    const response: ApiResponse = {
      success: false,
      error: message,
    };

    if ("json" in res) {
      res.status(statusCode).json(response);
    } else {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response, null, 2));
    }
  }

  /**
   * Handle project indexing
   */
  private async handleIndexProject(req: Request, res: Response) {
    try {
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId)) {
        const response: ApiResponse = {
          success: false,
          error: "Invalid project ID",
        };
        return res.status(400).json(response);
      }

      // Get project details from database
      const projects = this.dbService.getProjects();
      const project = projects.find((p) => p.id === projectId);

      if (!project) {
        const response: ApiResponse = {
          success: false,
          error: "Project not found",
        };
        return res.status(404).json(response);
      }

      // Parse request body for indexing options
      let indexingOptions: any = {};
      if (
        req.headers["content-type"]?.includes("application/json") &&
        req.body
      ) {
        try {
          indexingOptions = req.body;
          console.log("📝 Received indexing options:", indexingOptions);
        } catch (error) {
          console.warn("Failed to parse indexing options:", error);
        }
      }

      // Detect project languages automatically

      let detectedLanguages: string[];

      try {
        // Quick detection for responsiveness
        detectedLanguages = await LanguageDetectionService.quickDetectLanguages(
          project.root_path
        );

        if (detectedLanguages.length === 0) {
          detectedLanguages = ["cpp", "python", "typescript", "javascript", "go", "java"]; // Multi-language fallback
        }
      } catch (error) {
        console.warn("Language detection failed, falling back to multi-language:", error);
        detectedLanguages = ["cpp", "python", "typescript", "javascript", "go", "java"];
      }

      // Use languages from request if provided, otherwise use detected languages
      const languagesToIndex = indexingOptions.languages || detectedLanguages;

      // Get additional paths from project metadata
      const additionalPaths = project.metadata?.additionalPaths || [];
      if (additionalPaths.length > 0) {
      }

      // Start indexing with selected languages
      const jobId = await this.indexingService.indexProject(
        projectId,
        project.display_name || project.name,
        project.root_path,
        {
          ...indexingOptions, // Spread first to allow overrides
          languages: languagesToIndex,
          additionalPaths, // Pass additional paths
          debugMode:
            indexingOptions.debugMode ?? process.env.NODE_ENV === "development",
          enableSemanticAnalysis:
            indexingOptions.enableSemanticAnalysis ?? true,
          enablePatternDetection:
            indexingOptions.enablePatternDetection ?? true,
          parallelism: indexingOptions.parallelism || 4,
        }
      );

      const response: ApiResponse = {
        success: true,
        data: {
          jobId,
          projectId,
          projectName: project.display_name || project.name,
          rootPath: project.root_path,
          detectedLanguages: languagesToIndex, // Use the actual languages being indexed
          status: "queued",
          message: "Indexing job started",
          timestamp: new Date().toISOString(),
        },
        message: `Indexing started for project "${
          project.display_name || project.name
        }"`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleIndexProject:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start project indexing",
      };

      res.status(500).json(response);
    }
  }

  /**
   * Get indexing job status
   */
  private async handleGetIndexingJob(req: Request, res: Response) {
    try {
      const jobId = req.params.jobId;
      const job = this.indexingService.getJob(jobId);

      if (!job) {
        const response: ApiResponse = {
          success: false,
          error: "Indexing job not found",
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: job,
        message: `Indexing job ${jobId} status retrieved`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleGetIndexingJob:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get indexing job",
      };

      res.status(500).json(response);
    }
  }

  /**
   * Get all indexing jobs
   */
  private async handleGetIndexingJobs(req: Request, res: Response) {
    try {
      const jobs = this.indexingService.getAllJobs();
      const stats = this.indexingService.getStats();

      const response: ApiResponse = {
        success: true,
        data: {
          jobs,
          stats,
        },
        message: `Retrieved ${jobs.length} indexing jobs`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleGetIndexingJobs:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get indexing jobs",
      };

      res.status(500).json(response);
    }
  }

  /**
   * Detect project languages
   */
  private async handleDetectProjectLanguages(req: Request, res: Response) {
    try {
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId)) {
        const response: ApiResponse = {
          success: false,
          error: "Invalid project ID",
        };
        return res.status(400).json(response);
      }

      // Get project details from database
      const projects = this.dbService.getProjects();
      const project = projects.find((p) => p.id === projectId);

      if (!project) {
        const response: ApiResponse = {
          success: false,
          error: "Project not found",
        };
        return res.status(404).json(response);
      }

      // Perform detailed language detection

      const languageProfile =
        await LanguageDetectionService.detectProjectLanguages(
          project.root_path,
          [], // Use default exclude patterns
          500 // Limit file sampling for performance
        );

      const response: ApiResponse = {
        success: true,
        data: {
          projectId,
          projectName: project.display_name || project.name,
          ...languageProfile,
          supportedLanguages: LanguageDetectionService.getSupportedLanguages(),
        },
        message: `Detected ${languageProfile.languages.length} languages in project`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleDetectProjectLanguages:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to detect project languages",
      };

      res.status(500).json(response);
    }
  }

  /**
   * Create a new project
   */
  private async handleCreateProject(
    req: Request,
    res: Response,
    rawReq?: http.IncomingMessage
  ) {
    try {
      const body = await this.parseRequestBody(rawReq!);

      if (!body.name || !body.rootPath) {
        const response: ApiResponse = {
          success: false,
          error: "Name and rootPath are required",
        };
        return res.status(400).json(response);
      }

      const project = await this.projectService.createProject({
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        rootPath: body.rootPath,
        additionalPaths: body.additionalPaths,
        languages: body.languages,
      });

      const response: ApiResponse = {
        success: true,
        data: project,
        message: `Project "${project.name}" created successfully`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleCreateProject:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create project",
      };

      res.status(400).json(response);
    }
  }

  /**
   * Update an existing project
   */
  private async handleUpdateProject(
    req: Request,
    res: Response,
    rawReq?: http.IncomingMessage
  ) {
    try {
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId)) {
        const response: ApiResponse = {
          success: false,
          error: "Invalid project ID",
        };
        return res.status(400).json(response);
      }

      const body = await this.parseRequestBody(rawReq!);

      const project = await this.projectService.updateProject(projectId, {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        rootPath: body.rootPath,
        additionalPaths: body.additionalPaths,
        languages: body.languages,
        isActive: body.isActive,
      });

      const response: ApiResponse = {
        success: true,
        data: project,
        message: `Project "${project.name}" updated successfully`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleUpdateProject:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update project",
      };

      const statusCode =
        error instanceof Error && error.message === "Project not found"
          ? 404
          : 400;
      res.status(statusCode).json(response);
    }
  }

  /**
   * Delete a project
   */
  private async handleDeleteProject(req: Request, res: Response) {
    try {
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId)) {
        const response: ApiResponse = {
          success: false,
          error: "Invalid project ID",
        };
        return res.status(400).json(response);
      }

      const hardDelete = req.query.hard === "true";

      await this.projectService.deleteProject(projectId, hardDelete);

      const response: ApiResponse = {
        success: true,
        data: { projectId, deleted: true, hardDelete },
        message: hardDelete
          ? "Project permanently deleted"
          : "Project deactivated",
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleDeleteProject:", error);

      const response: ApiResponse = {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete project",
      };

      const statusCode =
        error instanceof Error && error.message === "Project not found"
          ? 404
          : 400;
      res.status(statusCode).json(response);
    }
  }

  /**
   * Get a single project
   */
  private async handleGetProject(req: Request, res: Response) {
    try {
      const projectId = parseInt(req.params.id, 10);

      if (isNaN(projectId)) {
        const response: ApiResponse = {
          success: false,
          error: "Invalid project ID",
        };
        return res.status(400).json(response);
      }

      const project = await this.projectService.getProject(projectId);

      const response: ApiResponse = {
        success: true,
        data: project,
        message: `Project "${project.name}" retrieved successfully`,
      };

      res.json(response);
    } catch (error) {
      console.error("Error in handleGetProject:", error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get project",
      };

      const statusCode =
        error instanceof Error && error.message === "Project not found"
          ? 404
          : 500;
      res.status(statusCode).json(response);
    }
  }

  /**
   * Get content type for file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    return types[ext] || "application/octet-stream";
  }
}
