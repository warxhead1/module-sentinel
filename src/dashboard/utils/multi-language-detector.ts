/**
 * Multi-Language Detector Module
 * 
 * Core language detection and classification engine for analyzing
 * cross-language relationships in code repositories.
 */

export interface LanguageInfo {
  language: string;
  confidence: number;
  fileExtension?: string;
  frameworkHints?: string[];
}

export interface LanguageFeatures {
  spawn?: boolean;
  spawnsPython?: boolean;
  spawnsNode?: boolean;
  isAsync?: boolean;
  hasFFI?: boolean; // Foreign Function Interface
  usesBindings?: boolean;
  hasAPI?: boolean;
}

export interface MultiLanguageNode {
  id: string | number;
  name: string;
  qualified_name?: string;
  kind: string;
  language: string;
  file_path?: string;
  isEntry?: boolean;
  isExit?: boolean;
  languageGroup?: string;
  languageFeatures?: LanguageFeatures;
}

export interface CrossLanguageEdge {
  source: string | number;
  target: string | number;
  type: string;
  isCrossLanguage?: boolean;
  connectionType?: 'spawn' | 'import' | 'api_call' | 'data_transfer' | 'ffi';
  confidence?: number;
}

export interface LanguageDetectionOptions {
  includeFrameworkHints?: boolean;
  detectLanguageFeatures?: boolean;
  analyzeImports?: boolean;
}

export class MultiLanguageDetector {
  private static readonly LANGUAGE_EXTENSIONS = new Map<string, string>([
    // C/C++
    ['.cpp', 'cpp'],
    ['.cc', 'cpp'],
    ['.cxx', 'cpp'],
    ['.c++', 'cpp'],
    ['.c', 'c'],
    ['.h', 'cpp'], // Headers usually C++
    ['.hpp', 'cpp'],
    ['.hxx', 'cpp'],
    ['.h++', 'cpp'],
    ['.ixx', 'cpp'], // C++20 modules
    
    // Python
    ['.py', 'python'],
    ['.pyw', 'python'],
    ['.pyx', 'python'], // Cython
    ['.pyi', 'python'], // Type stubs
    
    // JavaScript/TypeScript
    ['.js', 'javascript'],
    ['.jsx', 'javascript'],
    ['.mjs', 'javascript'],
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.d.ts', 'typescript'],
    
    // Other languages
    ['.rs', 'rust'],
    ['.go', 'go'],
    ['.java', 'java'],
    ['.kt', 'kotlin'],
    ['.swift', 'swift'],
    ['.rb', 'ruby'],
    ['.php', 'php'],
    ['.cs', 'csharp'],
    ['.sh', 'shell'],
    ['.bash', 'shell'],
    ['.ps1', 'powershell'],
    ['.lua', 'lua'],
    ['.r', 'r'],
    ['.R', 'r'],
    ['.m', 'matlab'],
    ['.jl', 'julia']
  ]);

  private static readonly SPAWN_PATTERNS = new Map<string, string[]>([
    ['python', ['subprocess', 'os.system', 'os.exec', 'Popen', 'run', 'call', 'check_output']],
    ['javascript', ['child_process', 'spawn', 'exec', 'execFile', 'fork', 'execSync']],
    ['typescript', ['child_process', 'spawn', 'exec', 'execFile', 'fork', 'execSync']],
    ['cpp', ['system', 'exec', 'fork', 'CreateProcess', 'ShellExecute', 'popen']],
    ['rust', ['Command', 'process::Command', 'std::process']],
    ['go', ['exec.Command', 'os/exec', 'cmd.Run', 'cmd.Start']],
    ['java', ['ProcessBuilder', 'Runtime.exec', 'Process']],
    ['shell', ['exec', 'eval', 'source', '.', 'bash', 'sh']]
  ]);

  private static readonly FFI_PATTERNS = new Map<string, string[]>([
    ['python', ['ctypes', 'cffi', 'pybind11', 'cython', 'swig']],
    ['javascript', ['node-ffi', 'ffi-napi', 'ref-napi', 'node-addon-api']],
    ['rust', ['extern "C"', 'libc', 'bindgen', '#[no_mangle]']],
    ['cpp', ['extern "C"', 'dlopen', 'LoadLibrary', 'GetProcAddress']],
    ['go', ['import "C"', 'cgo', '//export']],
    ['java', ['JNI', 'native', 'System.loadLibrary', 'JNA']]
  ]);

  private static readonly API_PATTERNS = new Map<string, string[]>([
    ['python', ['flask', 'fastapi', 'django', 'aiohttp', 'tornado', 'bottle']],
    ['javascript', ['express', 'koa', 'fastify', 'hapi', 'restify']],
    ['typescript', ['express', 'koa', 'fastify', 'nest', '@nestjs']],
    ['java', ['spring', '@RestController', '@RequestMapping', 'JAX-RS']],
    ['go', ['gin', 'echo', 'fiber', 'gorilla/mux', 'chi']],
    ['rust', ['actix-web', 'rocket', 'warp', 'tide', 'axum']]
  ]);

  /**
   * Detect language from file path
   */
  detectLanguageFromPath(filePath: string): string {
    if (!filePath) return 'unknown';
    
    const pathLower = filePath.toLowerCase();
    
    // Check each extension
    for (const [ext, lang] of this.LANGUAGE_EXTENSIONS) {
      if (pathLower.endsWith(ext)) {
        return lang;
      }
    }
    
    // Special cases
    if (pathLower.includes('makefile') || pathLower === 'makefile') return 'make';
    if (pathLower.endsWith('.yml') || pathLower.endsWith('.yaml')) return 'yaml';
    if (pathLower.endsWith('.json')) return 'json';
    if (pathLower.endsWith('.xml')) return 'xml';
    if (pathLower.endsWith('.md')) return 'markdown';
    
    return 'unknown';
  }

  /**
   * Detect language features from code content
   */
  async detectLanguageFeatures(
    node: MultiLanguageNode,
    codeContent?: string
  ): Promise<LanguageFeatures> {
    const features: LanguageFeatures = {};
    
    if (!codeContent) return features;
    
    const language = node.language;
    
    // Check for spawn patterns
    const spawnPatterns = MultiLanguageDetector.SPAWN_PATTERNS.get(language);
    if (spawnPatterns) {
      features.spawn = spawnPatterns.some(pattern => 
        codeContent.includes(pattern)
      );
      
      // Check what language is being spawned
      if (features.spawn) {
        if (codeContent.includes('python') || codeContent.includes('.py')) {
          features.spawnsPython = true;
        }
        if (codeContent.includes('node') || codeContent.includes('.js')) {
          features.spawnsNode = true;
        }
      }
    }
    
    // Check for FFI patterns
    const ffiPatterns = MultiLanguageDetector.FFI_PATTERNS.get(language);
    if (ffiPatterns) {
      features.hasFFI = ffiPatterns.some(pattern => 
        codeContent.includes(pattern)
      );
    }
    
    // Check for API patterns
    const apiPatterns = MultiLanguageDetector.API_PATTERNS.get(language);
    if (apiPatterns) {
      features.hasAPI = apiPatterns.some(pattern => 
        codeContent.includes(pattern)
      );
    }
    
    // Check for async patterns
    features.isAsync = this.detectAsyncPatterns(language, codeContent);
    
    // Check for language bindings
    features.usesBindings = this.detectBindingPatterns(language, codeContent);
    
    return features;
  }

  /**
   * Detect async patterns in code
   */
  private detectAsyncPatterns(language: string, content: string): boolean {
    const asyncPatterns: Record<string, string[]> = {
      python: ['async ', 'await ', 'asyncio', 'async def'],
      javascript: ['async ', 'await ', 'Promise', '.then(', '.catch('],
      typescript: ['async ', 'await ', 'Promise<', 'Observable', 'rxjs'],
      rust: ['async ', '.await', 'tokio', 'async fn'],
      cpp: ['std::async', 'std::future', 'std::promise', 'co_await'],
      go: ['go ', 'chan ', 'goroutine', '<-'],
      java: ['CompletableFuture', 'Future<', 'async', '@Async']
    };
    
    const patterns = asyncPatterns[language];
    if (!patterns) return false;
    
    return patterns.some(pattern => content.includes(pattern));
  }

  /**
   * Detect language binding patterns
   */
  private detectBindingPatterns(language: string, content: string): boolean {
    const bindingPatterns: Record<string, string[]> = {
      python: ['import ctypes', 'from ctypes', 'cython', 'pybind11'],
      javascript: ['require("bindings")', 'node-gyp', '.node'],
      rust: ['#[wasm_bindgen]', 'wasm-bindgen', 'neon'],
      cpp: ['BOOST_PYTHON', 'pybind11', 'v8::', 'napi_'],
      go: ['//export', 'import "C"'],
      java: ['native ', 'System.loadLibrary']
    };
    
    const patterns = bindingPatterns[language];
    if (!patterns) return false;
    
    return patterns.some(pattern => content.includes(pattern));
  }

  /**
   * Determine connection type between nodes
   */
  determineConnectionType(
    edge: any,
    sourceNode: MultiLanguageNode,
    targetNode: MultiLanguageNode
  ): CrossLanguageEdge['connectionType'] {
    // Check if languages are different
    if (sourceNode.language !== targetNode.language) {
      // Check for spawn
      if (sourceNode.languageFeatures?.spawn) {
        return 'spawn';
      }
      
      // Check for FFI
      if (sourceNode.languageFeatures?.hasFFI || 
          targetNode.languageFeatures?.hasFFI) {
        return 'ffi';
      }
      
      // Check for API calls
      if (sourceNode.languageFeatures?.hasAPI || 
          targetNode.languageFeatures?.hasAPI) {
        return 'api_call';
      }
      
      // Check edge type
      if (edge.type === 'imports' || edge.type === 'uses') {
        return 'import';
      }
      
      if (edge.type === 'calls') {
        return 'api_call';
      }
    }
    
    return 'data_transfer';
  }

  /**
   * Analyze cross-language connections
   */
  analyzeCrossLanguageConnections(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): {
    connections: CrossLanguageEdge[];
    statistics: Map<string, number>;
  } {
    const connections: CrossLanguageEdge[] = [];
    const statistics = new Map<string, number>();
    
    // Build node map for quick lookup
    const nodeMap = new Map<string | number, MultiLanguageNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));
    
    // Process each edge
    edges.forEach(edge => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      
      if (sourceNode && targetNode) {
        // Check if cross-language
        if (sourceNode.language !== targetNode.language) {
          const connectionType = this.determineConnectionType(
            edge, sourceNode, targetNode
          );
          
          connections.push({
            ...edge,
            isCrossLanguage: true,
            connectionType
          });
          
          // Update statistics
          const key = `${sourceNode.language}->${targetNode.language}`;
          statistics.set(key, (statistics.get(key) || 0) + 1);
        }
      }
    });
    
    return { connections, statistics };
  }

  /**
   * Group nodes by language
   */
  groupNodesByLanguage(nodes: MultiLanguageNode[]): Map<string, MultiLanguageNode[]> {
    const groups = new Map<string, MultiLanguageNode[]>();
    
    nodes.forEach(node => {
      const language = node.language || 'unknown';
      if (!groups.has(language)) {
        groups.set(language, []);
      }
      groups.get(language)!.push(node);
    });
    
    return groups;
  }

  /**
   * Calculate language diversity metrics
   */
  calculateLanguageDiversity(nodes: MultiLanguageNode[]): {
    totalLanguages: number;
    languageDistribution: Map<string, number>;
    dominantLanguage: string;
    diversityScore: number;
  } {
    const languageCounts = new Map<string, number>();
    
    // Count nodes per language
    nodes.forEach(node => {
      const lang = node.language || 'unknown';
      languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
    });
    
    // Find dominant language
    let dominantLanguage = 'unknown';
    let maxCount = 0;
    
    languageCounts.forEach((count, lang) => {
      if (count > maxCount) {
        maxCount = count;
        dominantLanguage = lang;
      }
    });
    
    // Calculate diversity score (Shannon entropy)
    const total = nodes.length;
    let diversityScore = 0;
    
    languageCounts.forEach(count => {
      const proportion = count / total;
      if (proportion > 0) {
        diversityScore -= proportion * Math.log2(proportion);
      }
    });
    
    return {
      totalLanguages: languageCounts.size,
      languageDistribution: languageCounts,
      dominantLanguage,
      diversityScore: Math.round(diversityScore * 100) / 100
    };
  }

  /**
   * Detect entry and exit points for language boundaries
   */
  detectLanguageBoundaries(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): {
    entryPoints: MultiLanguageNode[];
    exitPoints: MultiLanguageNode[];
    bridges: MultiLanguageNode[];
  } {
    const entryPoints: MultiLanguageNode[] = [];
    const exitPoints: MultiLanguageNode[] = [];
    const bridges: MultiLanguageNode[] = [];
    
    // Calculate in/out degrees per language
    const inDegrees = new Map<string, Map<string, number>>();
    const outDegrees = new Map<string, Map<string, number>>();
    
    nodes.forEach(node => {
      const nodeId = String(node.id);
      const lang = node.language;
      
      if (!inDegrees.has(nodeId)) {
        inDegrees.set(nodeId, new Map());
      }
      if (!outDegrees.has(nodeId)) {
        outDegrees.set(nodeId, new Map());
      }
    });
    
    // Process edges
    edges.forEach(edge => {
      const sourceId = String(edge.source);
      const targetId = String(edge.target);
      
      const sourceNode = nodes.find(n => String(n.id) === sourceId);
      const targetNode = nodes.find(n => String(n.id) === targetId);
      
      if (sourceNode && targetNode && edge.isCrossLanguage) {
        // Track cross-language connections
        const outMap = outDegrees.get(sourceId)!;
        outMap.set(targetNode.language, (outMap.get(targetNode.language) || 0) + 1);
        
        const inMap = inDegrees.get(targetId)!;
        inMap.set(sourceNode.language, (inMap.get(sourceNode.language) || 0) + 1);
      }
    });
    
    // Identify entry/exit points and bridges
    nodes.forEach(node => {
      const nodeId = String(node.id);
      const inMap = inDegrees.get(nodeId)!;
      const outMap = outDegrees.get(nodeId)!;
      
      const hasIncoming = inMap.size > 0;
      const hasOutgoing = outMap.size > 0;
      
      if (hasIncoming && !hasOutgoing) {
        node.isEntry = true;
        entryPoints.push(node);
      } else if (!hasIncoming && hasOutgoing) {
        node.isExit = true;
        exitPoints.push(node);
      } else if (hasIncoming && hasOutgoing) {
        bridges.push(node);
      }
    });
    
    return { entryPoints, exitPoints, bridges };
  }
}