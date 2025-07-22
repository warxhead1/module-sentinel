/**
 * Language Clusterer Module
 * 
 * Groups and clusters symbols by language, creating hierarchical
 * structures and calculating language interconnectivity metrics.
 */

import { MultiLanguageNode, CrossLanguageEdge } from './multi-language-detector.js';

export interface LanguageCluster {
  id: string;
  language: string;
  nodes: MultiLanguageNode[];
  subClusters: Map<string, LanguageCluster>;
  centroid?: { x: number; y: number };
  radius?: number;
  density?: number;
}

export interface LanguageHierarchy {
  language: string;
  totalNodes: number;
  namespaces: Map<string, NamespaceCluster>;
  modules: Map<string, ModuleCluster>;
  depth: number;
}

export interface NamespaceCluster {
  name: string;
  nodes: MultiLanguageNode[];
  subNamespaces: Map<string, NamespaceCluster>;
  imports: Set<string>;
  exports: Set<string>;
}

export interface ModuleCluster {
  path: string;
  language: string;
  nodes: MultiLanguageNode[];
  dependencies: Set<string>;
  dependents: Set<string>;
}

export interface InterconnectivityMetrics {
  languagePairs: Map<string, number>; // "lang1->lang2" -> connection count
  clusterCohesion: Map<string, number>; // language -> cohesion score
  interClusterConnections: number;
  intraClusterConnections: number;
  modularityScore: number;
}

export interface ClusteringOptions {
  minClusterSize?: number;
  maxClusterDepth?: number;
  groupByNamespace?: boolean;
  groupByModule?: boolean;
  calculateMetrics?: boolean;
}

export class LanguageClusterer {
  private clusters: Map<string, LanguageCluster> = new Map();
  private hierarchies: Map<string, LanguageHierarchy> = new Map();

  /**
   * Group symbols by language
   */
  groupSymbolsByLanguage(
    nodes: MultiLanguageNode[],
    options: ClusteringOptions = {}
  ): Map<string, LanguageCluster> {
    const {
      minClusterSize = 1,
      groupByNamespace = true,
      groupByModule = true
    } = options;

    // Clear existing clusters
    this.clusters.clear();

    // Group nodes by language
    nodes.forEach(node => {
      const language = node.language || 'unknown';
      
      if (!this.clusters.has(language)) {
        this.clusters.set(language, {
          id: `cluster_${language}`,
          language,
          nodes: [],
          subClusters: new Map()
        });
      }
      
      this.clusters.get(language)!.nodes.push(node);
    });

    // Remove small clusters if needed
    if (minClusterSize > 1) {
      Array.from(this.clusters.entries()).forEach(([lang, cluster]) => {
        if (cluster.nodes.length < minClusterSize) {
          this.clusters.delete(lang);
        }
      });
    }

    // Create sub-clusters
    this.clusters.forEach((cluster, language) => {
      if (groupByNamespace) {
        this.createNamespaceClusters(cluster);
      }
      if (groupByModule) {
        this.createModuleClusters(cluster);
      }
    });

    return this.clusters;
  }

  /**
   * Create hierarchical language structures
   */
  createLanguageHierarchy(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Map<string, LanguageHierarchy> {
    this.hierarchies.clear();

    // Group nodes by language
    const languageGroups = new Map<string, MultiLanguageNode[]>();
    nodes.forEach(node => {
      const lang = node.language || 'unknown';
      if (!languageGroups.has(lang)) {
        languageGroups.set(lang, []);
      }
      languageGroups.get(lang)!.push(node);
    });

    // Build hierarchy for each language
    languageGroups.forEach((langNodes, language) => {
      const hierarchy: LanguageHierarchy = {
        language,
        totalNodes: langNodes.length,
        namespaces: this.buildNamespaceHierarchy(langNodes),
        modules: this.buildModuleHierarchy(langNodes),
        depth: 0
      };

      // Calculate depth
      hierarchy.depth = this.calculateHierarchyDepth(hierarchy.namespaces);
      
      this.hierarchies.set(language, hierarchy);
    });

    // Connect cross-language dependencies
    this.connectCrossLanguageDependencies(edges);

    return this.hierarchies;
  }

  /**
   * Build namespace hierarchy for a language
   */
  private buildNamespaceHierarchy(nodes: MultiLanguageNode[]): Map<string, NamespaceCluster> {
    const namespaces = new Map<string, NamespaceCluster>();

    nodes.forEach(node => {
      const namespacePath = this.extractNamespace(node);
      const parts = namespacePath.split('::').filter(p => p.length > 0);
      
      let currentMap = namespaces;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}::${part}` : part;
        
        if (!currentMap.has(part)) {
          currentMap.set(part, {
            name: part,
            nodes: [],
            subNamespaces: new Map(),
            imports: new Set(),
            exports: new Set()
          });
        }

        const namespace = currentMap.get(part)!;
        
        // Add node to leaf namespace
        if (index === parts.length - 1) {
          namespace.nodes.push(node);
          
          // Track exports
          if (node.kind === 'function' || node.kind === 'class') {
            namespace.exports.add(node.name);
          }
        }

        currentMap = namespace.subNamespaces;
      });
    });

    return namespaces;
  }

  /**
   * Build module hierarchy for a language
   */
  private buildModuleHierarchy(nodes: MultiLanguageNode[]): Map<string, ModuleCluster> {
    const modules = new Map<string, ModuleCluster>();

    nodes.forEach(node => {
      if (!node.file_path) return;

      const modulePath = this.extractModulePath(node.file_path);
      
      if (!modules.has(modulePath)) {
        modules.set(modulePath, {
          path: modulePath,
          language: node.language,
          nodes: [],
          dependencies: new Set(),
          dependents: new Set()
        });
      }

      modules.get(modulePath)!.nodes.push(node);
    });

    return modules;
  }

  /**
   * Extract namespace from node
   */
  private extractNamespace(node: MultiLanguageNode): string {
    if (node.qualified_name) {
      // Extract namespace from qualified name
      const parts = node.qualified_name.split('::');
      parts.pop(); // Remove the symbol name
      return parts.join('::') || 'global';
    }
    
    // Fallback to simple heuristics
    if (node.kind === 'namespace') {
      return node.name;
    }
    
    return 'global';
  }

  /**
   * Extract module path from file path
   */
  private extractModulePath(filePath: string): string {
    // Remove file name to get directory
    const parts = filePath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }

  /**
   * Calculate hierarchy depth
   */
  private calculateHierarchyDepth(
    namespaces: Map<string, NamespaceCluster>,
    currentDepth: number = 0
  ): number {
    if (namespaces.size === 0) return currentDepth;

    let maxDepth = currentDepth;
    
    namespaces.forEach(namespace => {
      const depth = this.calculateHierarchyDepth(
        namespace.subNamespaces,
        currentDepth + 1
      );
      maxDepth = Math.max(maxDepth, depth);
    });

    return maxDepth;
  }

  /**
   * Connect cross-language dependencies
   */
  private connectCrossLanguageDependencies(edges: CrossLanguageEdge[]): void {
    edges.forEach(edge => {
      if (!edge.isCrossLanguage) return;

      // Find source and target modules
      this.hierarchies.forEach(hierarchy => {
        hierarchy.modules.forEach(module => {
          const hasSource = module.nodes.some(n => n.id === edge.source);
          const hasTarget = module.nodes.some(n => n.id === edge.target);

          if (hasSource) {
            // Find target module in other languages
            this.hierarchies.forEach(targetHierarchy => {
              if (targetHierarchy === hierarchy) return;
              
              targetHierarchy.modules.forEach(targetModule => {
                if (targetModule.nodes.some(n => n.id === edge.target)) {
                  module.dependencies.add(`${targetHierarchy.language}:${targetModule.path}`);
                  targetModule.dependents.add(`${hierarchy.language}:${module.path}`);
                }
              });
            });
          }
        });
      });
    });
  }

  /**
   * Create namespace-based sub-clusters
   */
  private createNamespaceClusters(cluster: LanguageCluster): void {
    const namespaceGroups = new Map<string, MultiLanguageNode[]>();

    cluster.nodes.forEach(node => {
      const namespace = this.extractNamespace(node);
      if (!namespaceGroups.has(namespace)) {
        namespaceGroups.set(namespace, []);
      }
      namespaceGroups.get(namespace)!.push(node);
    });

    namespaceGroups.forEach((nodes, namespace) => {
      if (nodes.length > 0) {
        cluster.subClusters.set(namespace, {
          id: `${cluster.id}_ns_${namespace}`,
          language: cluster.language,
          nodes,
          subClusters: new Map()
        });
      }
    });
  }

  /**
   * Create module-based sub-clusters
   */
  private createModuleClusters(cluster: LanguageCluster): void {
    const moduleGroups = new Map<string, MultiLanguageNode[]>();

    cluster.nodes.forEach(node => {
      if (node.file_path) {
        const module = this.extractModulePath(node.file_path);
        if (!moduleGroups.has(module)) {
          moduleGroups.set(module, []);
        }
        moduleGroups.get(module)!.push(node);
      }
    });

    moduleGroups.forEach((nodes, module) => {
      if (nodes.length > 0) {
        const subClusterId = `module_${module.replace(/\//g, '_')}`;
        cluster.subClusters.set(subClusterId, {
          id: `${cluster.id}_${subClusterId}`,
          language: cluster.language,
          nodes,
          subClusters: new Map()
        });
      }
    });
  }

  /**
   * Calculate language interconnectivity metrics
   */
  calculateInterconnectivityMetrics(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): InterconnectivityMetrics {
    const languagePairs = new Map<string, number>();
    const clusterCohesion = new Map<string, number>();
    let interClusterConnections = 0;
    let intraClusterConnections = 0;

    // Build node to language map
    const nodeLanguageMap = new Map<string | number, string>();
    nodes.forEach(node => {
      nodeLanguageMap.set(node.id, node.language);
    });

    // Count connections
    edges.forEach(edge => {
      const sourceLang = nodeLanguageMap.get(edge.source);
      const targetLang = nodeLanguageMap.get(edge.target);

      if (!sourceLang || !targetLang) return;

      if (sourceLang === targetLang) {
        intraClusterConnections++;
        clusterCohesion.set(sourceLang, (clusterCohesion.get(sourceLang) || 0) + 1);
      } else {
        interClusterConnections++;
        const pairKey = `${sourceLang}->${targetLang}`;
        languagePairs.set(pairKey, (languagePairs.get(pairKey) || 0) + 1);
      }
    });

    // Calculate cohesion scores (normalized)
    const languageCounts = new Map<string, number>();
    nodes.forEach(node => {
      const lang = node.language;
      languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
    });

    clusterCohesion.forEach((connections, language) => {
      const nodeCount = languageCounts.get(language) || 1;
      const maxPossible = (nodeCount * (nodeCount - 1)) / 2;
      const cohesionScore = maxPossible > 0 ? (connections / maxPossible) * 100 : 0;
      clusterCohesion.set(language, Math.round(cohesionScore));
    });

    // Calculate modularity score
    const totalConnections = interClusterConnections + intraClusterConnections;
    const modularityScore = totalConnections > 0
      ? (intraClusterConnections / totalConnections) * 100
      : 0;

    return {
      languagePairs,
      clusterCohesion,
      interClusterConnections,
      intraClusterConnections,
      modularityScore: Math.round(modularityScore)
    };
  }

  /**
   * Generate cluster layout positions
   */
  generateClusterLayout(
    clusters: Map<string, LanguageCluster>,
    width: number,
    height: number
  ): void {
    const clusterArray = Array.from(clusters.values());
    const count = clusterArray.length;

    if (count === 0) return;

    // Arrange clusters in a circle
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    clusterArray.forEach((cluster, index) => {
      const angle = (index / count) * 2 * Math.PI;
      cluster.centroid = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };

      // Calculate cluster radius based on node count
      cluster.radius = Math.sqrt(cluster.nodes.length) * 10 + 20;
      
      // Calculate density
      const area = Math.PI * cluster.radius * cluster.radius;
      cluster.density = cluster.nodes.length / area;
    });
  }

  /**
   * Find closely related language clusters
   */
  findRelatedClusters(
    clusters: Map<string, LanguageCluster>,
    edges: CrossLanguageEdge[],
    threshold: number = 5
  ): Map<string, Set<string>> {
    const relatedClusters = new Map<string, Set<string>>();

    // Count connections between clusters
    const connectionCounts = new Map<string, number>();
    
    edges.forEach(edge => {
      if (!edge.isCrossLanguage) return;

      // Find source and target clusters
      let sourceCluster: string | null = null;
      let targetCluster: string | null = null;

      clusters.forEach((cluster, language) => {
        if (cluster.nodes.some(n => n.id === edge.source)) {
          sourceCluster = language;
        }
        if (cluster.nodes.some(n => n.id === edge.target)) {
          targetCluster = language;
        }
      });

      if (sourceCluster && targetCluster && sourceCluster !== targetCluster) {
        const key = [sourceCluster, targetCluster].sort().join('-');
        connectionCounts.set(key, (connectionCounts.get(key) || 0) + 1);
      }
    });

    // Build related clusters based on threshold
    connectionCounts.forEach((count, key) => {
      if (count >= threshold) {
        const [lang1, lang2] = key.split('-');
        
        if (!relatedClusters.has(lang1)) {
          relatedClusters.set(lang1, new Set());
        }
        if (!relatedClusters.has(lang2)) {
          relatedClusters.set(lang2, new Set());
        }
        
        relatedClusters.get(lang1)!.add(lang2);
        relatedClusters.get(lang2)!.add(lang1);
      }
    });

    return relatedClusters;
  }

  /**
   * Generate cluster statistics report
   */
  generateClusterReport(
    clusters: Map<string, LanguageCluster>,
    metrics: InterconnectivityMetrics
  ): string {
    const lines: string[] = [
      '# Language Cluster Report',
      '',
      '## Language Distribution'
    ];

    // Language statistics
    clusters.forEach((cluster, language) => {
      lines.push(`- **${language}**: ${cluster.nodes.length} nodes`);
      if (cluster.subClusters.size > 0) {
        lines.push(`  - Sub-clusters: ${cluster.subClusters.size}`);
      }
    });

    lines.push('');
    lines.push('## Interconnectivity Metrics');
    lines.push(`- Inter-cluster connections: ${metrics.interClusterConnections}`);
    lines.push(`- Intra-cluster connections: ${metrics.intraClusterConnections}`);
    lines.push(`- Modularity score: ${metrics.modularityScore}%`);
    lines.push('');
    lines.push('## Language Pairs');

    // Top language pairs
    const sortedPairs = Array.from(metrics.languagePairs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedPairs.forEach(([pair, count]) => {
      lines.push(`- ${pair}: ${count} connections`);
    });

    lines.push('');
    lines.push('## Cluster Cohesion');

    metrics.clusterCohesion.forEach((score, language) => {
      lines.push(`- ${language}: ${score}%`);
    });

    return lines.join('\n');
  }
}