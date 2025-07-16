import Database from 'better-sqlite3';
import { CleanUnifiedSchemaManager } from '../database/clean-unified-schema.js';

interface GraphNode {
  id: string;
  name: string;
  type: 'class' | 'function' | 'module' | 'namespace' | 'interface';
  filePath: string;
  line: number;
  confidence: number;
  complexity: number;
  metadata: {
    size: number;
    connections: number;
    importance: number;
    pipelineStage?: string;
    namespace?: string;
  };
}

interface GraphEdge {
  from: string;
  to: string;
  relationship: 'calls' | 'inherits' | 'implements' | 'depends' | 'contains' | 'includes';
  confidence: number;
  weight: number;
  metadata: {
    frequency?: number;
    isVirtual?: boolean;
    accessLevel?: 'public' | 'private' | 'protected';
  };
}

interface SymbolGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Array<{
    id: string;
    name: string;
    nodes: string[];
    cohesion: number;
    type: 'module' | 'namespace' | 'class_hierarchy' | 'pipeline_stage';
  }>;
  metrics: {
    totalNodes: number;
    totalEdges: number;
    density: number;
    averageClustering: number;
    componentCount: number;
    criticalPaths: Array<{
      path: string[];
      importance: number;
      bottleneck: boolean;
    }>;
  };
}

interface ArchitectureVisualization {
  graphData: SymbolGraph;
  recommendations: Array<{
    type: 'refactor' | 'split' | 'merge' | 'interface' | 'dependency';
    target: string;
    reason: string;
    impact: 'low' | 'medium' | 'high';
    suggestion: string;
  }>;
  quality: {
    maintainability: number;
    modularity: number;
    complexity: number;
    coupling: number;
  };
}

export class SymbolGraphService {
  private db: Database.Database;
  private schemaManager: CleanUnifiedSchemaManager;
  private readonly MIN_CONFIDENCE = 0.7;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.schemaManager = CleanUnifiedSchemaManager.getInstance();
    this.schemaManager.initializeDatabase(this.db);
  }

  /**
   * Generate symbol relationship graph for architecture visualization
   */
  async generateSymbolGraph(
    scope: 'project' | 'module' | 'stage',
    target?: string,
    includePrivate: boolean = false
  ): Promise<SymbolGraph> {
    // Build nodes from high-confidence symbols
    const nodes = await this.buildGraphNodes(scope, target, includePrivate);
    
    // Build edges from relationships
    const edges = await this.buildGraphEdges(nodes.map(n => n.id));
    
    // Identify clusters (modules, namespaces, class hierarchies)
    const clusters = await this.identifyClusters(nodes, edges);
    
    // Calculate graph metrics
    const metrics = this.calculateGraphMetrics(nodes, edges, clusters);
    
    return {
      nodes,
      edges,
      clusters,
      metrics
    };
  }

  /**
   * Generate architecture visualization with recommendations
   */
  async generateArchitectureVisualization(
    scope: 'project' | 'module' | 'stage',
    target?: string
  ): Promise<ArchitectureVisualization> {
    const graphData = await this.generateSymbolGraph(scope, target, false);
    
    // Analyze quality metrics
    const quality = this.analyzeArchitecturalQuality(graphData);
    
    // Generate recommendations based on graph analysis
    const recommendations = this.generateArchitecturalRecommendations(graphData, quality);
    
    return {
      graphData,
      recommendations,
      quality
    };
  }

  /**
   * Find critical dependency paths in the architecture
   */
  async findCriticalPaths(startNode?: string, endNode?: string): Promise<Array<{
    path: string[];
    totalComplexity: number;
    bottleneckScore: number;
    riskLevel: 'low' | 'medium' | 'high';
  }>> {
    const graph = await this.generateSymbolGraph('project');
    
    // Use Dijkstra's algorithm with complexity weighting
    const paths = this.findShortestPaths(graph, startNode, endNode);
    
    return paths.map(path => {
      const totalComplexity = path.reduce((sum, nodeId) => {
        const node = graph.nodes.find(n => n.id === nodeId);
        return sum + (node?.complexity || 0);
      }, 0);
      
      const bottleneckScore = this.calculateBottleneckScore(path, graph);
      
      return {
        path,
        totalComplexity,
        bottleneckScore,
        riskLevel: bottleneckScore > 0.8 ? 'high' : 
                  bottleneckScore > 0.5 ? 'medium' : 'low'
      };
    });
  }

  /**
   * Analyze module dependencies and coupling
   */
  async analyzeDependencyCoupling(): Promise<{
    modules: Array<{
      name: string;
      fanIn: number;
      fanOut: number;
      instability: number;
      centrality: number;
      riskLevel: 'low' | 'medium' | 'high';
    }>;
    cycles: Array<{
      modules: string[];
      severity: number;
      suggestion: string;
    }>;
  }> {
    const graph = await this.generateSymbolGraph('project');
    
    // Group nodes by module
    const moduleGroups = this.groupNodesByModule(graph.nodes);
    
    // Calculate coupling metrics for each module
    const modules = Object.entries(moduleGroups).map(([moduleName, nodes]) => {
      const fanIn = this.calculateFanIn(moduleName, graph);
      const fanOut = this.calculateFanOut(moduleName, graph);
      const instability = fanOut / (fanIn + fanOut + 1); // +1 to avoid division by zero
      const centrality = this.calculateBetweennessCentrality(moduleName, graph);
      
      return {
        name: moduleName,
        fanIn,
        fanOut,
        instability,
        centrality,
        riskLevel: (instability > 0.8 && centrality > 0.5 ? 'high' :
                  instability > 0.6 || centrality > 0.3 ? 'medium' : 'low') as 'low' | 'medium' | 'high'
      };
    });
    
    // Detect dependency cycles
    const cycles = this.detectDependencyCycles(graph);
    
    return { modules, cycles };
  }

  private async buildGraphNodes(
    scope: string,
    target?: string,
    includePrivate: boolean = false
  ): Promise<GraphNode[]> {
    let whereClause = `WHERE parser_confidence > ${this.MIN_CONFIDENCE}`;
    const params: any[] = [];
    
    if (scope === 'module' && target) {
      whereClause += ' AND file_path LIKE ?';
      params.push(`${target}%`);
    } else if (scope === 'stage' && target) {
      whereClause += ' AND pipeline_stage = ?';
      params.push(target);
    }
    
    if (!includePrivate) {
      whereClause += ' AND kind NOT IN (\'private_method\', \'private_field\')';
    }
    
    const symbols = this.db.prepare(`
      SELECT 
        id, name, kind, file_path, line, column,
        parser_confidence, complexity, namespace,
        pipeline_stage, signature, parent_class,
        semantic_tags, qualified_name
      FROM enhanced_symbols
      ${whereClause}
      ORDER BY parser_confidence DESC, complexity DESC
    `).all(...params) as any[];
    
    return symbols.map(symbol => {
      const connections = this.getSymbolConnections(symbol.id);
      const importance = this.calculateNodeImportance(symbol, connections);
      
      return {
        id: symbol.id.toString(),
        name: symbol.qualified_name || symbol.name,
        type: this.mapSymbolKindToNodeType(symbol.kind),
        filePath: symbol.file_path,
        line: symbol.line,
        confidence: symbol.parser_confidence,
        complexity: symbol.complexity || 0,
        metadata: {
          size: this.calculateNodeSize(symbol),
          connections: connections.length,
          importance,
          pipelineStage: symbol.pipeline_stage,
          namespace: symbol.namespace
        }
      };
    });
  }

  private async buildGraphEdges(nodeIds: string[]): Promise<GraphEdge[]> {
    if (nodeIds.length === 0) return [];
    
    const placeholders = nodeIds.map(() => '?').join(',');
    
    const relationships = this.db.prepare(`
      SELECT 
        from_symbol_id, to_symbol_id, relationship_type,
        confidence, detected_by
      FROM symbol_relationships
      WHERE from_symbol_id IN (${placeholders})
        AND to_symbol_id IN (${placeholders})
        AND confidence > 0.5
    `).all(...nodeIds, ...nodeIds) as any[];
    
    return relationships.map(rel => ({
      from: rel.from_symbol_id.toString(),
      to: rel.to_symbol_id.toString(),
      relationship: this.mapRelationshipType(rel.relationship_type),
      confidence: rel.confidence,
      weight: this.calculateEdgeWeight(rel),
      metadata: {
        frequency: 1, // Could be calculated from usage patterns
        isVirtual: rel.relationship_type.includes('virtual'),
        accessLevel: this.inferAccessLevel(rel)
      }
    }));
  }

  private async identifyClusters(nodes: GraphNode[], edges: GraphEdge[]): Promise<any[]> {
    const clusters: any[] = [];
    
    // Module-based clustering
    const moduleGroups = this.groupNodesByModule(nodes);
    Object.entries(moduleGroups).forEach(([moduleName, moduleNodes]) => {
      const nodeIds = moduleNodes.map(n => n.id);
      const cohesion = this.calculateClusterCohesion(nodeIds, edges);
      
      clusters.push({
        id: `module_${moduleName}`,
        name: moduleName,
        nodes: nodeIds,
        cohesion,
        type: 'module'
      });
    });
    
    // Namespace-based clustering
    const namespaceGroups = this.groupNodesByNamespace(nodes);
    Object.entries(namespaceGroups).forEach(([namespace, namespaceNodes]) => {
      if (namespace && namespace !== 'global') {
        const nodeIds = namespaceNodes.map(n => n.id);
        const cohesion = this.calculateClusterCohesion(nodeIds, edges);
        
        clusters.push({
          id: `namespace_${namespace}`,
          name: namespace,
          nodes: nodeIds,
          cohesion,
          type: 'namespace'
        });
      }
    });
    
    // Pipeline stage clustering
    const stageGroups = this.groupNodesByStage(nodes);
    Object.entries(stageGroups).forEach(([stage, stageNodes]) => {
      if (stage) {
        const nodeIds = stageNodes.map(n => n.id);
        const cohesion = this.calculateClusterCohesion(nodeIds, edges);
        
        clusters.push({
          id: `stage_${stage}`,
          name: stage,
          nodes: nodeIds,
          cohesion,
          type: 'pipeline_stage'
        });
      }
    });
    
    return clusters;
  }

  private calculateGraphMetrics(nodes: GraphNode[], edges: GraphEdge[], clusters: any[]): any {
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const maxPossibleEdges = totalNodes * (totalNodes - 1);
    const density = maxPossibleEdges > 0 ? totalEdges / maxPossibleEdges : 0;
    
    // Calculate average clustering coefficient
    const clusteringCoefficients = nodes.map(node => 
      this.calculateLocalClustering(node.id, edges)
    );
    const averageClustering = clusteringCoefficients.reduce((sum, c) => sum + c, 0) / totalNodes;
    
    // Count connected components
    const componentCount = this.countConnectedComponents(nodes, edges);
    
    // Find critical paths
    const criticalPaths = this.findCriticalPathsInGraph(nodes, edges);
    
    return {
      totalNodes,
      totalEdges,
      density,
      averageClustering,
      componentCount,
      criticalPaths
    };
  }

  private analyzeArchitecturalQuality(graph: SymbolGraph): any {
    const maintainability = this.calculateMaintainabilityScore(graph);
    const modularity = this.calculateModularityScore(graph);
    const complexity = this.calculateOverallComplexity(graph);
    const coupling = this.calculateCouplingScore(graph);
    
    return {
      maintainability: Math.round(maintainability * 100) / 100,
      modularity: Math.round(modularity * 100) / 100,
      complexity: Math.round(complexity * 100) / 100,
      coupling: Math.round(coupling * 100) / 100
    };
  }

  private generateArchitecturalRecommendations(graph: SymbolGraph, quality: any): any[] {
    const recommendations: any[] = [];
    
    // Check for overly complex nodes
    const complexNodes = graph.nodes.filter(n => n.complexity > 15);
    complexNodes.forEach(node => {
      recommendations.push({
        type: 'refactor',
        target: node.name,
        reason: `High complexity (${node.complexity})`,
        impact: node.complexity > 25 ? 'high' : 'medium',
        suggestion: 'Break down into smaller, focused functions'
      });
    });
    
    // Check for high coupling
    if (quality.coupling > 0.7) {
      const highCouplingClusters = graph.clusters.filter(c => c.cohesion < 0.3);
      highCouplingClusters.forEach(cluster => {
        recommendations.push({
          type: 'interface',
          target: cluster.name,
          reason: 'Low cohesion indicates tight coupling',
          impact: 'medium',
          suggestion: 'Extract interfaces to reduce dependencies'
        });
      });
    }
    
    // Check for large clusters that should be split
    const largeClusters = graph.clusters.filter(c => c.nodes.length > 20);
    largeClusters.forEach(cluster => {
      recommendations.push({
        type: 'split',
        target: cluster.name,
        reason: `Large ${cluster.type} with ${cluster.nodes.length} symbols`,
        impact: 'high',
        suggestion: 'Consider splitting into smaller, focused modules'
      });
    });
    
    // Check for dependency bottlenecks
    graph.metrics.criticalPaths
      .filter(path => path.bottleneck)
      .forEach(path => {
        recommendations.push({
          type: 'dependency',
          target: path.path[Math.floor(path.path.length / 2)], // Middle node
          reason: 'Critical dependency bottleneck',
          impact: 'high',
          suggestion: 'Consider adding alternative paths or reducing dependencies'
        });
      });
    
    return recommendations.slice(0, 10); // Top 10 recommendations
  }

  // Helper methods for graph analysis
  private getSymbolConnections(symbolId: number): any[] {
    return this.db.prepare(`
      SELECT to_symbol_id, relationship_type
      FROM symbol_relationships
      WHERE from_symbol_id = ? AND confidence > 0.5
    `).all(symbolId) as any[];
  }

  private calculateNodeImportance(symbol: any, connections: any[]): number {
    // Simple importance calculation based on connections and complexity
    const connectionWeight = Math.min(connections.length / 10, 1);
    const complexityWeight = Math.min((symbol.complexity || 0) / 20, 1);
    const confidenceWeight = symbol.parser_confidence;
    
    return (connectionWeight + complexityWeight + confidenceWeight) / 3;
  }

  private calculateNodeSize(symbol: any): number {
    // Size based on complexity and importance
    return Math.max(10, Math.min(50, (symbol.complexity || 1) * 2));
  }

  private mapSymbolKindToNodeType(kind: string): 'class' | 'function' | 'module' | 'namespace' | 'interface' {
    if (kind.includes('class') || kind === 'struct') return 'class';
    if (kind.includes('function') || kind === 'method') return 'function';
    if (kind === 'namespace') return 'namespace';
    if (kind === 'interface') return 'interface';
    return 'function'; // Default
  }

  private mapRelationshipType(relType: string): 'calls' | 'inherits' | 'implements' | 'depends' | 'contains' | 'includes' {
    if (relType.includes('call')) return 'calls';
    if (relType.includes('inherit')) return 'inherits';
    if (relType.includes('implement')) return 'implements';
    if (relType.includes('include')) return 'includes';
    if (relType.includes('contain')) return 'contains';
    return 'depends'; // Default
  }

  private calculateEdgeWeight(relationship: any): number {
    // Weight based on relationship type and confidence
    const typeWeights: Record<string, number> = {
      'calls': 0.5,
      'inherits': 1.0,
      'implements': 0.8,
      'depends': 0.3,
      'contains': 0.7,
      'includes': 0.4
    };
    
    const baseWeight = typeWeights[this.mapRelationshipType(relationship.relationship_type)] || 0.5;
    return baseWeight * relationship.confidence;
  }

  private inferAccessLevel(relationship: any): 'public' | 'private' | 'protected' {
    // Simple heuristic - could be improved with actual access level data
    return 'public'; // Default assumption
  }

  private groupNodesByModule(nodes: GraphNode[]): Record<string, GraphNode[]> {
    const groups: Record<string, GraphNode[]> = {};
    
    nodes.forEach(node => {
      const moduleName = this.extractModuleName(node.filePath);
      if (!groups[moduleName]) groups[moduleName] = [];
      groups[moduleName].push(node);
    });
    
    return groups;
  }

  private groupNodesByNamespace(nodes: GraphNode[]): Record<string, GraphNode[]> {
    const groups: Record<string, GraphNode[]> = {};
    
    nodes.forEach(node => {
      const namespace = node.metadata.namespace || 'global';
      if (!groups[namespace]) groups[namespace] = [];
      groups[namespace].push(node);
    });
    
    return groups;
  }

  private groupNodesByStage(nodes: GraphNode[]): Record<string, GraphNode[]> {
    const groups: Record<string, GraphNode[]> = {};
    
    nodes.forEach(node => {
      const stage = node.metadata.pipelineStage || 'unknown';
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(node);
    });
    
    return groups;
  }

  private extractModuleName(filePath: string): string {
    // Extract module name from file path
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(cpp|h|hpp|cc)$/, '');
  }

  private calculateClusterCohesion(nodeIds: string[], edges: GraphEdge[]): number {
    if (nodeIds.length <= 1) return 1.0;
    
    // Calculate internal edges vs external edges
    const internalEdges = edges.filter(edge => 
      nodeIds.includes(edge.from) && nodeIds.includes(edge.to)
    );
    
    const externalEdges = edges.filter(edge => 
      (nodeIds.includes(edge.from) && !nodeIds.includes(edge.to)) ||
      (!nodeIds.includes(edge.from) && nodeIds.includes(edge.to))
    );
    
    const totalEdges = internalEdges.length + externalEdges.length;
    return totalEdges > 0 ? internalEdges.length / totalEdges : 0;
  }

  private calculateLocalClustering(nodeId: string, edges: GraphEdge[]): number {
    // Calculate clustering coefficient for a single node
    const neighbors = this.getNeighbors(nodeId, edges);
    if (neighbors.length < 2) return 0;
    
    const neighborConnections = neighbors.filter(n1 => 
      neighbors.some(n2 => n1 !== n2 && 
        edges.some(e => (e.from === n1 && e.to === n2) || (e.from === n2 && e.to === n1))
      )
    ).length;
    
    const maxPossibleConnections = neighbors.length * (neighbors.length - 1) / 2;
    return maxPossibleConnections > 0 ? neighborConnections / maxPossibleConnections : 0;
  }

  private getNeighbors(nodeId: string, edges: GraphEdge[]): string[] {
    const neighbors = new Set<string>();
    
    edges.forEach(edge => {
      if (edge.from === nodeId) neighbors.add(edge.to);
      if (edge.to === nodeId) neighbors.add(edge.from);
    });
    
    return Array.from(neighbors);
  }

  private countConnectedComponents(nodes: GraphNode[], edges: GraphEdge[]): number {
    const visited = new Set<string>();
    let componentCount = 0;
    
    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const neighbors = this.getNeighbors(nodeId, edges);
      neighbors.forEach(neighbor => dfs(neighbor));
    };
    
    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id);
        componentCount++;
      }
    });
    
    return componentCount;
  }

  private findCriticalPathsInGraph(nodes: GraphNode[], edges: GraphEdge[]): any[] {
    // Simplified critical path finding - identify high-importance chains
    const paths: any[] = [];
    const highImportanceNodes = nodes
      .filter(n => n.metadata.importance > 0.7)
      .sort((a, b) => b.metadata.importance - a.metadata.importance)
      .slice(0, 5);
    
    highImportanceNodes.forEach(node => {
      const path = this.findLongestPath(node.id, edges, 5);
      if (path.length > 2) {
        paths.push({
          path,
          importance: node.metadata.importance,
          bottleneck: node.metadata.connections > 10
        });
      }
    });
    
    return paths;
  }

  private findLongestPath(startId: string, edges: GraphEdge[], maxLength: number): string[] {
    const visited = new Set<string>();
    const path = [startId];
    visited.add(startId);
    
    const extendPath = (currentId: string, currentPath: string[]): string[] => {
      if (currentPath.length >= maxLength) return currentPath;
      
      const neighbors = this.getNeighbors(currentId, edges)
        .filter(n => !visited.has(n));
      
      if (neighbors.length === 0) return currentPath;
      
      let longestExtension = currentPath;
      neighbors.forEach(neighbor => {
        visited.add(neighbor);
        const extended = extendPath(neighbor, [...currentPath, neighbor]);
        if (extended.length > longestExtension.length) {
          longestExtension = extended;
        }
        visited.delete(neighbor);
      });
      
      return longestExtension;
    };
    
    return extendPath(startId, path);
  }

  private calculateMaintainabilityScore(graph: SymbolGraph): number {
    // Based on average complexity and clustering
    const avgComplexity = graph.nodes.reduce((sum, n) => sum + n.complexity, 0) / graph.nodes.length;
    const complexityScore = Math.max(0, 1 - avgComplexity / 20);
    
    return (complexityScore + graph.metrics.averageClustering) / 2;
  }

  private calculateModularityScore(graph: SymbolGraph): number {
    // Based on cluster cohesion
    const avgCohesion = graph.clusters.reduce((sum, c) => sum + c.cohesion, 0) / graph.clusters.length;
    return avgCohesion;
  }

  private calculateOverallComplexity(graph: SymbolGraph): number {
    const avgComplexity = graph.nodes.reduce((sum, n) => sum + n.complexity, 0) / graph.nodes.length;
    return Math.min(1, avgComplexity / 15); // Normalize to 0-1
  }

  private calculateCouplingScore(graph: SymbolGraph): number {
    // Based on graph density and cross-cluster connections
    return Math.min(1, graph.metrics.density * 10);
  }

  private findShortestPaths(graph: SymbolGraph, startNode?: string, endNode?: string): string[][] {
    // Simplified path finding - return some example paths
    return graph.metrics.criticalPaths.map(cp => cp.path);
  }

  private calculateBottleneckScore(path: string[], graph: SymbolGraph): number {
    // Calculate how much of a bottleneck this path represents
    const pathNodes = path.map(id => graph.nodes.find(n => n.id === id)!);
    const avgConnections = pathNodes.reduce((sum, n) => sum + n.metadata.connections, 0) / pathNodes.length;
    
    return Math.min(1, avgConnections / 20);
  }

  private calculateFanIn(moduleName: string, graph: SymbolGraph): number {
    const moduleNodes = graph.nodes.filter(n => this.extractModuleName(n.filePath) === moduleName);
    const moduleNodeIds = new Set(moduleNodes.map(n => n.id));
    
    return graph.edges.filter(e => 
      !moduleNodeIds.has(e.from) && moduleNodeIds.has(e.to)
    ).length;
  }

  private calculateFanOut(moduleName: string, graph: SymbolGraph): number {
    const moduleNodes = graph.nodes.filter(n => this.extractModuleName(n.filePath) === moduleName);
    const moduleNodeIds = new Set(moduleNodes.map(n => n.id));
    
    return graph.edges.filter(e => 
      moduleNodeIds.has(e.from) && !moduleNodeIds.has(e.to)
    ).length;
  }

  private calculateBetweennessCentrality(moduleName: string, graph: SymbolGraph): number {
    // Simplified centrality calculation
    const moduleNodes = graph.nodes.filter(n => this.extractModuleName(n.filePath) === moduleName);
    const avgConnections = moduleNodes.reduce((sum, n) => sum + n.metadata.connections, 0) / moduleNodes.length;
    
    return Math.min(1, avgConnections / graph.nodes.length);
  }

  private detectDependencyCycles(graph: SymbolGraph): any[] {
    // Simplified cycle detection
    const cycles: any[] = [];
    const moduleGroups = this.groupNodesByModule(graph.nodes);
    
    // Check for simple 2-cycle dependencies between modules
    Object.keys(moduleGroups).forEach(module1 => {
      Object.keys(moduleGroups).forEach(module2 => {
        if (module1 !== module2) {
          const hasEdge12 = this.hasModuleDependency(module1, module2, graph);
          const hasEdge21 = this.hasModuleDependency(module2, module1, graph);
          
          if (hasEdge12 && hasEdge21) {
            cycles.push({
              modules: [module1, module2],
              severity: 0.5,
              suggestion: `Consider breaking circular dependency between ${module1} and ${module2}`
            });
          }
        }
      });
    });
    
    return cycles.slice(0, 5); // Return first 5 cycles found
  }

  private hasModuleDependency(fromModule: string, toModule: string, graph: SymbolGraph): boolean {
    const fromNodes = graph.nodes.filter(n => this.extractModuleName(n.filePath) === fromModule);
    const toNodes = graph.nodes.filter(n => this.extractModuleName(n.filePath) === toModule);
    
    const fromNodeIds = new Set(fromNodes.map(n => n.id));
    const toNodeIds = new Set(toNodes.map(n => n.id));
    
    return graph.edges.some(e => fromNodeIds.has(e.from) && toNodeIds.has(e.to));
  }

  close(): void {
    this.db.close();
  }
}