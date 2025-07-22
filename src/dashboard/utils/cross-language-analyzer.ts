/**
 * Cross-Language Analyzer Module
 * 
 * Analyzes cross-language boundaries, communication patterns,
 * and integration points between different programming languages.
 */

import { 
  MultiLanguageNode, 
  CrossLanguageEdge,
  LanguageFeatures 
} from './multi-language-detector.js';

export interface CrossLanguageBoundary {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  boundaryType: 'api' | 'ffi' | 'spawn' | 'socket' | 'file' | 'database';
  nodes: MultiLanguageNode[];
  edges: CrossLanguageEdge[];
  protocol?: string;
  dataFormat?: string;
}

export interface CommunicationPattern {
  pattern: string;
  languages: string[];
  frequency: number;
  examples: Array<{
    source: MultiLanguageNode;
    target: MultiLanguageNode;
    mechanism: string;
  }>;
}

export interface LanguageIntegrationMetrics {
  integrationScore: number; // 0-100
  communicationComplexity: number;
  dataTransferVolume: number;
  latencyRisk: 'low' | 'medium' | 'high';
  maintainabilityScore: number;
}

export interface CrossLanguageCallChain {
  id: string;
  startNode: MultiLanguageNode;
  endNode: MultiLanguageNode;
  chain: MultiLanguageNode[];
  languages: string[];
  totalHops: number;
  crossings: number; // Number of language boundary crossings
}

export class CrossLanguageAnalyzer {
  private boundaries: Map<string, CrossLanguageBoundary> = new Map();
  private patterns: Map<string, CommunicationPattern> = new Map();

  /**
   * Analyze cross-language function calls
   */
  async analyzeFunctionCalls(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Promise<{
    directCalls: CrossLanguageEdge[];
    indirectCalls: CrossLanguageEdge[];
    apiCalls: CrossLanguageEdge[];
    ffiCalls: CrossLanguageEdge[];
  }> {
    const directCalls: CrossLanguageEdge[] = [];
    const indirectCalls: CrossLanguageEdge[] = [];
    const apiCalls: CrossLanguageEdge[] = [];
    const ffiCalls: CrossLanguageEdge[] = [];

    // Build node map
    const nodeMap = new Map<string | number, MultiLanguageNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Analyze each edge
    edges.forEach(edge => {
      if (!edge.isCrossLanguage) return;

      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode || !targetNode) return;

      switch (edge.connectionType) {
        case 'api_call':
          apiCalls.push(edge);
          break;
        case 'ffi':
          ffiCalls.push(edge);
          directCalls.push(edge);
          break;
        case 'spawn':
          indirectCalls.push(edge);
          break;
        case 'import':
          if (this.isDirectImport(sourceNode, targetNode)) {
            directCalls.push(edge);
          } else {
            indirectCalls.push(edge);
          }
          break;
      }
    });

    return { directCalls, indirectCalls, apiCalls, ffiCalls };
  }

  /**
   * Check if import represents direct language binding
   */
  private isDirectImport(source: MultiLanguageNode, target: MultiLanguageNode): boolean {
    // Python importing C++ via pybind11
    if (source.language === 'python' && target.language === 'cpp') {
      return source.languageFeatures?.usesBindings || false;
    }

    // Node.js importing C++ via N-API
    if ((source.language === 'javascript' || source.language === 'typescript') && 
        target.language === 'cpp') {
      return source.languageFeatures?.usesBindings || false;
    }

    // Rust exposing to other languages
    if (target.language === 'rust' && target.languageFeatures?.hasFFI) {
      return true;
    }

    return false;
  }

  /**
   * Identify shared data structures and protocols
   */
  async identifySharedDataStructures(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Promise<{
    sharedTypes: Map<string, Set<string>>; // type -> languages using it
    protocols: Map<string, CrossLanguageBoundary>;
    serialization: Map<string, string[]>; // format -> examples
  }> {
    const sharedTypes = new Map<string, Set<string>>();
    const protocols = new Map<string, CrossLanguageBoundary>();
    const serialization = new Map<string, string[]>();

    // Analyze node names and connections for patterns
    const typePatterns = [
      { pattern: /proto|protobuf/i, format: 'protobuf' },
      { pattern: /json/i, format: 'json' },
      { pattern: /xml/i, format: 'xml' },
      { pattern: /thrift/i, format: 'thrift' },
      { pattern: /avro/i, format: 'avro' },
      { pattern: /msgpack/i, format: 'msgpack' },
      { pattern: /grpc/i, format: 'grpc' },
      { pattern: /graphql/i, format: 'graphql' }
    ];

    nodes.forEach(node => {
      // Check for serialization format hints
      typePatterns.forEach(({ pattern, format }) => {
        if (pattern.test(node.name) || 
            (node.file_path && pattern.test(node.file_path))) {
          if (!serialization.has(format)) {
            serialization.set(format, []);
          }
          serialization.get(format)!.push(node.name);

          // Track which languages use this format
          if (!sharedTypes.has(format)) {
            sharedTypes.set(format, new Set());
          }
          sharedTypes.get(format)!.add(node.language);
        }
      });

      // Check for common type patterns
      const commonTypes = ['User', 'Config', 'Request', 'Response', 'Message', 'Event'];
      commonTypes.forEach(type => {
        if (node.name.includes(type)) {
          if (!sharedTypes.has(type)) {
            sharedTypes.set(type, new Set());
          }
          sharedTypes.get(type)!.add(node.language);
        }
      });
    });

    // Identify protocol boundaries
    const boundaryGroups = this.groupBoundaries(nodes, edges);
    boundaryGroups.forEach((boundary, key) => {
      if (boundary.edges.length > 3) { // Significant boundary
        protocols.set(key, boundary);
      }
    });

    return { sharedTypes, protocols, serialization };
  }

  /**
   * Track process communication patterns
   */
  async trackProcessCommunication(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Promise<{
    spawnChains: Map<string, MultiLanguageNode[]>;
    ipcMechanisms: Set<string>;
    processTree: any;
  }> {
    const spawnChains = new Map<string, MultiLanguageNode[]>();
    const ipcMechanisms = new Set<string>();
    const processTree: any = { name: 'root', children: [] };

    // Build spawn chains
    const spawnEdges = edges.filter(e => e.connectionType === 'spawn');
    const visited = new Set<string>();

    spawnEdges.forEach(edge => {
      const sourceId = String(edge.source);
      if (!visited.has(sourceId)) {
        const chain = this.buildSpawnChain(sourceId, nodes, edges);
        if (chain.length > 1) {
          spawnChains.set(`chain_${spawnChains.size}`, chain);
        }
        chain.forEach(node => visited.add(String(node.id)));
      }
    });

    // Detect IPC mechanisms
    nodes.forEach(node => {
      const name = node.name.toLowerCase();
      const possibleIPC = [
        'socket', 'pipe', 'queue', 'redis', 'rabbitmq', 
        'kafka', 'grpc', 'rest', 'http', 'websocket',
        'sharedmemory', 'mmap', 'dbus', 'com', 'rpc'
      ];

      possibleIPC.forEach(ipc => {
        if (name.includes(ipc) || 
            (node.file_path && node.file_path.toLowerCase().includes(ipc))) {
          ipcMechanisms.add(ipc);
        }
      });
    });

    // Build process tree
    this.buildProcessTree(processTree, nodes, spawnEdges);

    return { spawnChains, ipcMechanisms, processTree };
  }

  /**
   * Build spawn chain from a starting node
   */
  private buildSpawnChain(
    startId: string,
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): MultiLanguageNode[] {
    const chain: MultiLanguageNode[] = [];
    const nodeMap = new Map<string, MultiLanguageNode>();
    nodes.forEach(node => nodeMap.set(String(node.id), node));

    const visited = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;

      visited.add(currentId);
      const currentNode = nodeMap.get(currentId);
      if (currentNode) {
        chain.push(currentNode);

        // Find spawn edges from this node
        edges.forEach(edge => {
          if (String(edge.source) === currentId && 
              edge.connectionType === 'spawn') {
            queue.push(String(edge.target));
          }
        });
      }
    }

    return chain;
  }

  /**
   * Build process tree visualization data
   */
  private buildProcessTree(
    tree: any,
    nodes: MultiLanguageNode[],
    spawnEdges: CrossLanguageEdge[]
  ): void {
    const nodeMap = new Map<string, MultiLanguageNode>();
    nodes.forEach(node => nodeMap.set(String(node.id), node));

    const childMap = new Map<string, string[]>();
    spawnEdges.forEach(edge => {
      const sourceId = String(edge.source);
      const targetId = String(edge.target);
      
      if (!childMap.has(sourceId)) {
        childMap.set(sourceId, []);
      }
      childMap.get(sourceId)!.push(targetId);
    });

    // Find root processes (no incoming spawn edges)
    const targets = new Set(spawnEdges.map(e => String(e.target)));
    const roots = nodes.filter(node => 
      !targets.has(String(node.id)) && 
      childMap.has(String(node.id))
    );

    // Build tree from each root
    roots.forEach(root => {
      const rootNode = {
        name: root.name,
        language: root.language,
        children: []
      };
      this.addChildrenToTree(rootNode, String(root.id), childMap, nodeMap);
      tree.children.push(rootNode);
    });
  }

  /**
   * Recursively add children to process tree
   */
  private addChildrenToTree(
    parentNode: any,
    parentId: string,
    childMap: Map<string, string[]>,
    nodeMap: Map<string, MultiLanguageNode>
  ): void {
    const children = childMap.get(parentId) || [];
    children.forEach(childId => {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        const treeNode = {
          name: childNode.name,
          language: childNode.language,
          children: []
        };
        parentNode.children.push(treeNode);
        this.addChildrenToTree(treeNode, childId, childMap, nodeMap);
      }
    });
  }

  /**
   * Analyze language bridge mechanisms
   */
  async analyzeLanguageBridges(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Promise<{
    bridges: Map<string, {
      type: string;
      sourceLanguage: string;
      targetLanguage: string;
      examples: MultiLanguageNode[];
    }>;
    complexity: Map<string, number>;
  }> {
    const bridges = new Map<string, {
      type: string;
      sourceLanguage: string;
      targetLanguage: string;
      examples: MultiLanguageNode[];
    }>();

    const complexity = new Map<string, number>();

    // Common bridge patterns
    const bridgePatterns = [
      { pattern: /swig/i, type: 'SWIG' },
      { pattern: /pybind/i, type: 'pybind11' },
      { pattern: /boost.*python/i, type: 'Boost.Python' },
      { pattern: /cython/i, type: 'Cython' },
      { pattern: /jni/i, type: 'JNI' },
      { pattern: /napi|node.*api/i, type: 'N-API' },
      { pattern: /wasm/i, type: 'WebAssembly' },
      { pattern: /grpc/i, type: 'gRPC' },
      { pattern: /thrift/i, type: 'Thrift' },
      { pattern: /com|dcom/i, type: 'COM' }
    ];

    // Analyze nodes for bridge patterns
    nodes.forEach(node => {
      bridgePatterns.forEach(({ pattern, type }) => {
        if (pattern.test(node.name) || 
            (node.file_path && pattern.test(node.file_path))) {
          const key = `${type}_${node.language}`;
          
          if (!bridges.has(key)) {
            bridges.set(key, {
              type,
              sourceLanguage: node.language,
              targetLanguage: 'multiple', // Will be refined
              examples: []
            });
          }
          
          bridges.get(key)!.examples.push(node);
        }
      });
    });

    // Calculate complexity for each language pair
    const languagePairs = new Map<string, number>();
    
    edges.forEach(edge => {
      if (edge.isCrossLanguage) {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        
        if (source && target) {
          const pairKey = `${source.language}->${target.language}`;
          languagePairs.set(pairKey, (languagePairs.get(pairKey) || 0) + 1);
        }
      }
    });

    // Calculate complexity score
    languagePairs.forEach((count, pair) => {
      // Base complexity on number of connections and bridge types
      let score = count * 10;
      
      // Add complexity for certain language pairs
      if (pair.includes('cpp') && pair.includes('python')) score *= 1.5;
      if (pair.includes('java') && pair.includes('cpp')) score *= 2;
      if (pair.includes('rust') && pair.includes('javascript')) score *= 1.3;
      
      complexity.set(pair, Math.round(score));
    });

    return { bridges, complexity };
  }

  /**
   * Group boundaries by type and languages
   */
  private groupBoundaries(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Map<string, CrossLanguageBoundary> {
    const boundaries = new Map<string, CrossLanguageBoundary>();

    edges.forEach(edge => {
      if (!edge.isCrossLanguage) return;

      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);

      if (!source || !target) return;

      const key = `${source.language}_${target.language}_${edge.connectionType}`;
      
      if (!boundaries.has(key)) {
        boundaries.set(key, {
          id: key,
          sourceLanguage: source.language,
          targetLanguage: target.language,
          boundaryType: this.determineBoundaryType(edge.connectionType),
          nodes: [],
          edges: []
        });
      }

      const boundary = boundaries.get(key)!;
      if (!boundary.nodes.find(n => n.id === source.id)) {
        boundary.nodes.push(source);
      }
      if (!boundary.nodes.find(n => n.id === target.id)) {
        boundary.nodes.push(target);
      }
      boundary.edges.push(edge);
    });

    return boundaries;
  }

  /**
   * Determine boundary type from connection type
   */
  private determineBoundaryType(
    connectionType?: CrossLanguageEdge['connectionType']
  ): CrossLanguageBoundary['boundaryType'] {
    switch (connectionType) {
      case 'api_call': return 'api';
      case 'ffi': return 'ffi';
      case 'spawn': return 'spawn';
      case 'import': return 'ffi';
      default: return 'file';
    }
  }

  /**
   * Calculate integration metrics
   */
  calculateIntegrationMetrics(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[],
    boundaries: Map<string, CrossLanguageBoundary>
  ): LanguageIntegrationMetrics {
    const crossLanguageEdges = edges.filter(e => e.isCrossLanguage);
    const totalEdges = edges.length;
    
    // Integration score (0-100)
    const integrationRatio = crossLanguageEdges.length / totalEdges;
    const boundaryCount = boundaries.size;
    const integrationScore = Math.min(100, integrationRatio * 50 + boundaryCount * 5);

    // Communication complexity
    const uniquePatterns = new Set(crossLanguageEdges.map(e => e.connectionType));
    const communicationComplexity = uniquePatterns.size * 20 + crossLanguageEdges.length;

    // Data transfer volume estimate
    const apiCalls = crossLanguageEdges.filter(e => e.connectionType === 'api_call').length;
    const dataTransferVolume = apiCalls * 100 + crossLanguageEdges.length * 10;

    // Latency risk
    let latencyRisk: 'low' | 'medium' | 'high' = 'low';
    if (apiCalls > 20 || boundaries.size > 10) latencyRisk = 'high';
    else if (apiCalls > 10 || boundaries.size > 5) latencyRisk = 'medium';

    // Maintainability score
    const avgConnectionsPerBoundary = crossLanguageEdges.length / Math.max(1, boundaries.size);
    const maintainabilityScore = Math.max(0, 100 - avgConnectionsPerBoundary * 5);

    return {
      integrationScore: Math.round(integrationScore),
      communicationComplexity: Math.round(communicationComplexity),
      dataTransferVolume: Math.round(dataTransferVolume),
      latencyRisk,
      maintainabilityScore: Math.round(maintainabilityScore)
    };
  }

  /**
   * Find cross-language call chains
   */
  findCallChains(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[],
    maxDepth: number = 10
  ): CrossLanguageCallChain[] {
    const chains: CrossLanguageCallChain[] = [];
    const nodeMap = new Map<string, MultiLanguageNode>();
    nodes.forEach(node => nodeMap.set(String(node.id), node));

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    edges.forEach(edge => {
      const sourceId = String(edge.source);
      if (!adjacency.has(sourceId)) {
        adjacency.set(sourceId, []);
      }
      adjacency.get(sourceId)!.push(String(edge.target));
    });

    // Find chains starting from each node
    nodes.forEach(startNode => {
      const visited = new Set<string>();
      const currentChain: MultiLanguageNode[] = [startNode];
      const languages = new Set([startNode.language]);

      this.dfsChains(
        String(startNode.id),
        currentChain,
        languages,
        visited,
        adjacency,
        nodeMap,
        chains,
        maxDepth
      );
    });

    // Filter for significant cross-language chains
    return chains.filter(chain => chain.crossings > 0 && chain.totalHops > 2);
  }

  /**
   * DFS helper for finding call chains
   */
  private dfsChains(
    currentId: string,
    currentChain: MultiLanguageNode[],
    languages: Set<string>,
    visited: Set<string>,
    adjacency: Map<string, string[]>,
    nodeMap: Map<string, MultiLanguageNode>,
    chains: CrossLanguageCallChain[],
    maxDepth: number
  ): void {
    if (currentChain.length >= maxDepth) return;

    visited.add(currentId);

    const neighbors = adjacency.get(currentId) || [];
    neighbors.forEach(neighborId => {
      if (!visited.has(neighborId)) {
        const neighborNode = nodeMap.get(neighborId);
        if (neighborNode) {
          const newLanguages = new Set(languages);
          newLanguages.add(neighborNode.language);
          
          const newChain = [...currentChain, neighborNode];
          
          // Save chain if it crosses language boundaries
          if (newLanguages.size > languages.size) {
            chains.push({
              id: `chain_${chains.length}`,
              startNode: currentChain[0],
              endNode: neighborNode,
              chain: newChain,
              languages: Array.from(newLanguages),
              totalHops: newChain.length - 1,
              crossings: newLanguages.size - 1
            });
          }

          // Continue DFS
          this.dfsChains(
            neighborId,
            newChain,
            newLanguages,
            new Set(visited),
            adjacency,
            nodeMap,
            chains,
            maxDepth
          );
        }
      }
    });
  }
}