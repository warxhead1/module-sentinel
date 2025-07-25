/**
 * Cross-Language Detection Utility
 * 
 * Enhanced detection of cross-language calls beyond basic spawn/exec patterns.
 * Supports REST APIs, gRPC, FFI, embedded scripts, and more.
 */

import { RelationshipInfo } from '../tree-sitter/parser-types.js';
import { UniversalRelationshipType } from '../language-parser-interface.js';
import { ServiceDiscoveryDetector } from './service-discovery-detector.js';

export interface CrossLanguageCallInfo {
  type: 'subprocess' | 'rest-api' | 'grpc' | 'ffi' | 'embedded' | 'ipc' | 'websocket' | 'env-var' | 'config' | 'direct' | 'service-mesh';
  targetLanguage?: string;
  targetEndpoint?: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export class CrossLanguageDetector {
  // Subprocess patterns for different languages
  private static readonly SUBPROCESS_PATTERNS: Record<string, RegExp[]> = {
    // Node.js/TypeScript
    typescript: [
      /\b(spawn|exec|execFile|fork)\s*\(\s*['"`]([^'"`]+)['"`]/,
      /child_process\.(spawn|exec|execFile|fork)\s*\(/,
      /\bnew\s+Worker\s*\(\s*['"`]([^'"`]+\.(?:py|rb|java|go|rs))['"`]/,
      /worker_threads\.Worker\s*\(\s*['"`]([^'"`]+)['"`]/,
      // Template literal support
      /\b(spawn|exec|execFile|fork)\s*\(\s*`([^`]+)`/
    ],
    // Python subprocess calls
    python: [
      /subprocess\.(run|call|Popen)\s*\(\s*\[?\s*['"`]([^'"`]+)['"`]/,
      /os\.system\s*\(\s*['"`]([^'"`]+)['"`]/,
      /os\.popen\s*\(\s*['"`]([^'"`]+)['"`]/,
      // Async subprocess
      /asyncio\.create_subprocess_exec\s*\(\s*['"`]([^'"`]+)['"`]/
    ],
    // C++ system calls
    cpp: [
      /\bsystem\s*\(\s*"([^"]+)"/,
      /\bpopen\s*\(\s*"([^"]+)"/,
      /\bexecv[pe]?\s*\(\s*"([^"]+)"/,
      // Modern C++ process APIs
      /CreateProcess\s*\([^,]*,\s*"([^"]+)"/,
      /posix_spawn\s*\([^,]*,\s*"([^"]+)"/
    ],
    // Go subprocess calls
    go: [
      /exec\.Command\s*\(\s*"([^"]+)"/,
      /cmd\s*:=\s*exec\.Command\s*\(\s*"([^"]+)"/
    ]
  };

  // REST API patterns
  private static readonly REST_API_PATTERNS = [
    // JavaScript/TypeScript HTTP client libraries
    /\b(axios|fetch|request|http)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/,
    // Fix https.request pattern
    /\bhttps?\.(get|post|put|delete|patch|request)\s*\(\s*['"`]([^'"`]+)['"`]/,
    /\bfetch\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/,
    // Express route definitions (server-side)
    /\b(app|router)\.(get|post|put|delete|patch|use)\s*\(\s*['"`](\/[^'"`]+)['"`]/,
    // FastAPI/Django patterns
    /@(app|api)\.(get|post|put|delete|patch)\s*\(\s*['"`](\/[^'"`]+)['"`]/,
    // Python HTTP clients
    /requests\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/,
    /urllib\.request\.urlopen\s*\(\s*['"`]([^'"`]+)['"`]/,
    /aiohttp\.ClientSession\(\)\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/,
    // Go HTTP clients
    /http\.(Get|Post|Put|Delete)\s*\(\s*"([^"]+)"/,
    /client\.(Get|Post|Put|Delete)\s*\(\s*"([^"]+)"/,
    // C++ HTTP libraries
    /curl_easy_setopt\s*\([^,]+,\s*CURLOPT_URL,\s*"([^"]+)"/,
    /httplib::Client\s+\w+\s*\(\s*"([^"]+)"/
  ];

  // gRPC patterns with better capture groups
  private static readonly GRPC_PATTERNS = [
    // Go gRPC client creation: pb.NewCartServiceClient(conn)
    /\w+\.New(\w+)Client\s*\(/,
    // Python gRPC stub creation: demo_pb2_grpc.ProductCatalogServiceStub(channel)
    /\w+\.(\w+)Stub\s*\(/,
    // Java gRPC: AdServiceGrpc.newBlockingStub(channel)
    /(\w+)Grpc\.(newBlockingStub|newStub|newFutureStub)\s*\(/,
    // C# gRPC service implementation: CartService.CartServiceBase
    /(\w+)Service\.(\w+)ServiceBase/,
    // Generic gRPC client creation
    /new\s+(\w+)Client\s*\(/,
    // Proto imports
    /import\s+.*\s+from\s+['"`]([^'"`]+\.proto)['"`]/,
    /require\s*\(\s*['"`]([^'"`]+\.proto)['"`]\s*\)/,
    // Client method calls
    /(\w+Client)\.(\w+)\s*\(/,
    /(\w+Stub)\.(\w+)\s*\(/,
    // C++ gRPC
    /(\w+)::NewStub\s*\(/
  ];

  // FFI (Foreign Function Interface) patterns
  private static readonly FFI_PATTERNS = [
    // Node.js FFI
    /require\s*\(\s*['"`]ffi-napi['"`]\s*\)/,
    /ffi\.Library\s*\(\s*['"`]([^'"`]+\.(dll|so|dylib))['"`]/,
    // Python ctypes
    /ctypes\.CDLL\s*\(\s*['"`]([^'"`]+)['"`]/,
    /ctypes\.windll\.(\w+)/,
    // Enhanced Python windll access
    /windll\.(\w+)\.(\w+)/,
    // Rust FFI
    /#\[link\(name\s*=\s*"([^"]+)"/,
    /extern\s+"C"\s*{/,
    // C/C++ function declarations within extern blocks
    /extern\s+"C"\s*\{[^}]*?(\w+)\s*\(/
  ];

  // WebSocket patterns
  private static readonly WEBSOCKET_PATTERNS = [
    /new\s+WebSocket\s*\(\s*['"`](wss?:\/\/[^'"`]+)['"`]/,
    /\bio\.connect\s*\(\s*['"`]([^'"`]+)['"`]/,
    /socket\.emit\s*\(\s*['"`]([^'"`]+)['"`]/,
    // Server-side socket handlers
    /io\.on\s*\(\s*['"`]([^'"`]+)['"`]/,
    /socket\.on\s*\(\s*['"`]([^'"`]+)['"`]/
  ];

  // Language file extensions
  private static readonly LANGUAGE_EXTENSIONS: Record<string, string> = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.c': 'c',
    '.rs': 'rust',
    '.go': 'go',
    '.rb': 'ruby',
    '.php': 'php',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.m': 'matlab',
    '.jl': 'julia'
  };

  /**
   * Detect cross-language calls in a line of code
   */
  static detectCrossLanguageCalls(
    line: string,
    lineNumber: number,
    sourceLanguage: string,
    filePath: string
  ): Array<CrossLanguageCallInfo & { relationship: Partial<RelationshipInfo> }> {
    const results: Array<CrossLanguageCallInfo & { relationship: Partial<RelationshipInfo> }> = [];

    // Skip comments and empty lines
    const trimmedLine = line.trim();
    if (!trimmedLine || 
        trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('#') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*') ||
        trimmedLine.startsWith('--')) {
      return results;
    }

    // 1. Check subprocess patterns
    const subprocessInfo = this.detectSubprocessCall(line, sourceLanguage);
    if (subprocessInfo) {
      results.push({
        ...subprocessInfo,
        relationship: {
          fromName: filePath,
          toName: subprocessInfo.targetEndpoint || 'subprocess',
          relationshipType: UniversalRelationshipType.Spawns,
          confidence: subprocessInfo.confidence,
          crossLanguage: true,
          lineNumber,
          metadata: subprocessInfo.metadata
        }
      });
    }

    // 2. Check REST API patterns
    const restApiInfo = this.detectRestApiCall(line);
    if (restApiInfo) {
      results.push({
        ...restApiInfo,
        relationship: {
          fromName: filePath,
          toName: restApiInfo.targetEndpoint || 'rest-api',
          relationshipType: UniversalRelationshipType.Invokes,
          confidence: restApiInfo.confidence,
          crossLanguage: true,
          lineNumber,
          metadata: { ...restApiInfo.metadata, protocol: 'http' }
        }
      });
    }

    // 3. Check gRPC patterns
    const grpcInfo = this.detectGrpcCall(line);
    if (grpcInfo) {
      results.push({
        ...grpcInfo,
        relationship: {
          fromName: filePath,
          toName: grpcInfo.targetEndpoint || 'grpc-service',
          relationshipType: UniversalRelationshipType.Invokes,
          confidence: grpcInfo.confidence,
          crossLanguage: true,
          lineNumber,
          metadata: { ...grpcInfo.metadata, protocol: 'grpc' }
        }
      });
    }

    // 4. Check FFI patterns
    const ffiInfo = this.detectFfiCall(line);
    if (ffiInfo) {
      results.push({
        ...ffiInfo,
        relationship: {
          fromName: filePath,
          toName: ffiInfo.targetEndpoint || 'native-library',
          relationshipType: UniversalRelationshipType.BindsTo,
          confidence: ffiInfo.confidence,
          crossLanguage: true,
          lineNumber,
          metadata: { ...ffiInfo.metadata, type: 'ffi' }
        }
      });
    }

    // 5. Check WebSocket patterns
    const wsInfo = this.detectWebSocketCall(line);
    if (wsInfo) {
      results.push({
        ...wsInfo,
        relationship: {
          fromName: filePath,
          toName: wsInfo.targetEndpoint || 'websocket-server',
          relationshipType: UniversalRelationshipType.Communicates,
          confidence: wsInfo.confidence,
          crossLanguage: true,
          lineNumber,
          metadata: { ...wsInfo.metadata, protocol: 'websocket' }
        }
      });
    }

    // 6. Check service discovery patterns (environment variables, config)
    const serviceDiscoveryResults = ServiceDiscoveryDetector.detectServiceDiscovery(
      line,
      lineNumber,
      sourceLanguage,
      filePath
    );
    results.push(...serviceDiscoveryResults);

    return results;
  }

  private static detectSubprocessCall(line: string, sourceLanguage: string): CrossLanguageCallInfo | null {
    const patterns = this.SUBPROCESS_PATTERNS[sourceLanguage] || [];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const command = match[2] || match[1];
        const targetLanguage = this.detectLanguageFromCommand(command);
        
        return {
          type: 'subprocess',
          targetLanguage,
          targetEndpoint: command,
          confidence: targetLanguage ? 0.9 : 0.7,
          metadata: {
            command,
            method: match[1]
          }
        };
      }
    }

    // Generic subprocess detection
    if (line.includes('.py') || line.includes('python')) {
      const pythonMatch = line.match(/(['"`])([^'"`]*\.py)\1/);
      if (pythonMatch) {
        return {
          type: 'subprocess',
          targetLanguage: 'python',
          targetEndpoint: pythonMatch[2],
          confidence: 0.8,
          metadata: { script: pythonMatch[2] }
        };
      }
    }

    return null;
  }

  private static detectRestApiCall(line: string): CrossLanguageCallInfo | null {
    for (const pattern of this.REST_API_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const endpoint = match[3] || match[2] || match[1];
        const method = match[2] || match[1] || 'unknown';
        
        return {
          type: 'rest-api',
          targetEndpoint: endpoint,
          confidence: 0.8,
          metadata: {
            httpMethod: method.toUpperCase(),
            endpoint
          }
        };
      }
    }

    return null;
  }

  private static detectGrpcCall(line: string): CrossLanguageCallInfo | null {
    for (const pattern of this.GRPC_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        // Extract service name from different patterns
        let serviceName = match[1];
        
        // For patterns that might have different capture groups
        if (!serviceName && match[2]) {
          serviceName = match[2];
        }
        
        // Clean up service name (remove 'Service' suffix if present for consistency)
        if (serviceName && serviceName.endsWith('Service')) {
          serviceName = serviceName.slice(0, -7);
        }
        
        return {
          type: 'grpc',
          targetEndpoint: serviceName || 'unknown-grpc-service',
          confidence: 0.85,
          metadata: {
            service: serviceName,
            fullMatch: match[0]
          }
        };
      }
    }

    return null;
  }

  private static detectFfiCall(line: string): CrossLanguageCallInfo | null {
    for (const pattern of this.FFI_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const library = match[1] || 'native-library';
        
        return {
          type: 'ffi',
          targetEndpoint: library,
          confidence: 0.9,
          metadata: {
            library,
            bindingType: 'ffi'
          }
        };
      }
    }

    return null;
  }

  private static detectWebSocketCall(line: string): CrossLanguageCallInfo | null {
    for (const pattern of this.WEBSOCKET_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        return {
          type: 'websocket',
          targetEndpoint: match[1],
          confidence: 0.8,
          metadata: {
            url: match[1]
          }
        };
      }
    }

    return null;
  }

  private static detectLanguageFromCommand(command: string): string | undefined {
    // Check file extension
    for (const [ext, lang] of Object.entries(this.LANGUAGE_EXTENSIONS)) {
      if (command.includes(ext)) {
        return lang;
      }
    }

    // Check common interpreters
    if (command.includes('python') || command.includes('py')) return 'python';
    if (command.includes('node') || command.includes('npm')) return 'javascript';
    if (command.includes('java')) return 'java';
    if (command.includes('ruby') || command.includes('rb')) return 'ruby';
    if (command.includes('php')) return 'php';
    if (command.includes('go run')) return 'go';
    if (command.includes('cargo') || command.includes('rustc')) return 'rust';

    return undefined;
  }

  /**
   * Enhanced detection for embedded code (e.g., SQL in strings, JS in HTML)
   */
  static detectEmbeddedCode(content: string, sourceLanguage: string): Array<{
    language: string;
    startLine: number;
    endLine: number;
    code: string;
  }> {
    const embedded: Array<{ language: string; startLine: number; endLine: number; code: string }> = [];

    // SQL detection in strings
    const sqlPattern = /(['"`])\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+.*?\1/gis;
    let sqlMatch;
    while ((sqlMatch = sqlPattern.exec(content)) !== null) {
      const lines = content.substring(0, sqlMatch.index).split('\n');
      embedded.push({
        language: 'sql',
        startLine: lines.length,
        endLine: lines.length + sqlMatch[0].split('\n').length - 1,
        code: sqlMatch[0]
      });
    }

    // JavaScript in HTML
    if (sourceLanguage === 'html') {
      const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let scriptMatch;
      while ((scriptMatch = scriptPattern.exec(content)) !== null) {
        const lines = content.substring(0, scriptMatch.index).split('\n');
        embedded.push({
          language: 'javascript',
          startLine: lines.length,
          endLine: lines.length + scriptMatch[0].split('\n').length - 1,
          code: scriptMatch[1]
        });
      }
    }

    return embedded;
  }
}