/**
 * GraphDataProcessor - Utility class for graph data transformation and operations
 * 
 * Handles data processing, transformation, filtering, and validation for graph visualizations.
 */

import { GraphNode, GraphEdge } from '../../shared/types/api';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilters {
  nodeTypes: string[];
  edgeTypes: string[];
  languages: string[];
  namespaces: string[];
  metrics: {
    minLoc: number;
    maxLoc: number;
    minComplexity: number;
    maxComplexity: number;
  };
  showCrossLanguage: boolean;
  showGroupNodes: boolean;
  densityThreshold: number;
}

export class GraphDataProcessor {
  /**
   * Process raw graph data and prepare it for visualization
   */
  public processGraphData(rawData: GraphData): GraphData {
    const processedNodes = this.processNodes(rawData.nodes);
    const hierarchicalNodes = this.createClassContainerNodes(processedNodes);
    const processedEdges = this.processEdges(rawData.edges, hierarchicalNodes);
    
    return {
      nodes: hierarchicalNodes,
      edges: processedEdges
    };
  }

  /**
   * Process individual nodes
   */
  private processNodes(nodes: GraphNode[]): GraphNode[] {
    return nodes.map(node => ({
      ...node,
      // Ensure required properties exist
      size: node.size || this.calculateNodeSize(node),
      language: node.language || this.detectLanguage(node),
      metrics: node.metrics || this.initializeMetrics(),
      // Initialize position if not set
      x: node.x,
      y: node.y,
      vx: node.vx || 0,
      vy: node.vy || 0,
      fx: node.fx,
      fy: node.fy
    }));
  }

  /**
   * Process individual edges
   */
  private processEdges(edges: GraphEdge[], nodes: GraphNode[]): GraphEdge[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    return edges
      .filter(edge => {
        // Ensure both source and target nodes exist
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);
        return sourceNode && targetNode;
      })
      .map(edge => {
        const sourceNode = nodeMap.get(edge.source)!;
        const targetNode = nodeMap.get(edge.target)!;
        
        return {
          ...edge,
          // Enhance edge with additional metadata
          isCrossLanguage: edge.isCrossLanguage || this.isCrossLanguageEdge(sourceNode, targetNode),
          sourceLanguage: sourceNode.language,
          targetLanguage: targetNode.language,
          weight: edge.weight || 1,
          confidence: edge.confidence || 1
        };
      });
  }

  /**
   * Calculate node size based on metrics
   */
  private calculateNodeSize(node: GraphNode): number {
    if (node.type === 'language-group') {
      return Math.max(30, Math.min(70, 30 + Math.sqrt(node.metrics?.childCount || 1) * 5));
    }
    if (node.type === 'module-group') {
      return Math.max(25, Math.min(50, 25 + Math.sqrt(node.metrics?.childCount || 1) * 4));
    }
    if (node.type === 'namespace-group') {
      return Math.max(20, Math.min(40, 20 + Math.sqrt(node.metrics?.childCount || 1) * 3));
    }
    
    const sizeMetric = node.metrics?.loc || node.metrics?.cyclomaticComplexity || 10;
    return Math.max(5, Math.min(25, Math.sqrt(sizeMetric) * 2));
  }

  /**
   * Detect language from node properties
   */
  private detectLanguage(node: GraphNode): string {
    if (node.language) return node.language;
    
    // Try to detect from file path
    const filePath = (node as any).file_path || (node as any).filePath;
    if (filePath) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const languageMap: Record<string, string> = {
        'cpp': 'cpp', 'hpp': 'cpp', 'cc': 'cpp', 'h': 'cpp', 'cxx': 'cpp', 'hxx': 'cpp', 'ixx': 'cpp',
        'py': 'python', 'pyi': 'python', 'pyx': 'python',
        'ts': 'typescript', 'tsx': 'typescript',
        'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript',
        'rs': 'rust',
        'go': 'go',
        'java': 'java', 'kt': 'kotlin',
        'cs': 'csharp',
      };
      return languageMap[ext || ''] || 'unknown';
    }

    // Try to detect from namespace patterns
    if (node.namespace?.includes('::')) {
      return 'cpp';
    }
    if (node.namespace?.includes('.') && !node.namespace?.includes('::')) {
      return 'python';
    }
    
    return 'unknown';
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics() {
    return {
      loc: 0,
      callCount: 0,
      crossLanguageCalls: 0
    };
  }

  /**
   * Check if edge connects nodes of different languages
   */
  private isCrossLanguageEdge(sourceNode: GraphNode, targetNode: GraphNode): boolean {
    return sourceNode.language !== targetNode.language;
  }

  /**
   * Initialize node positions in a circular layout
   */
  public initializeNodePositions(nodes: GraphNode[], width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    nodes.forEach((node, i) => {
      if (node.x === undefined || node.y === undefined || isNaN(node.x) || isNaN(node.y)) {
        const angle = (i / nodes.length) * 2 * Math.PI;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      }
      
      // Initialize velocities if not set
      if (node.vx === undefined) node.vx = 0;
      if (node.vy === undefined) node.vy = 0;
    });
  }

  /**
   * Create hierarchical graph data with language, module, and namespace groupings
   */
  public createHierarchicalGraphData(data: GraphData): GraphData {
    const newNodes: GraphNode[] = [...data.nodes];
    const newEdges: GraphEdge[] = [...data.edges];
    const moduleMap = new Map<string, GraphNode>();
    const namespaceMap = new Map<string, GraphNode>();
    const languageMap = new Map<string, GraphNode>();

    // First pass: create group nodes
    newNodes.forEach(node => {
      // Ensure language is detected
      if (!node.language) {
        node.language = this.detectLanguage(node);
      }

      // Create language group nodes
      if (node.language && !languageMap.has(node.language)) {
        const languageNode: GraphNode = {
          id: `language-group-${node.language}`,
          name: this.getLanguageDisplayName(node.language),
          type: 'language-group',
          language: node.language,
          size: 0,
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0,
            childCount: 0
          },
          isExpanded: false,
          x: undefined,
          y: undefined
        };
        newNodes.push(languageNode);
        languageMap.set(node.language, languageNode);
      }

      // Create module group nodes
      if (node.moduleId && !moduleMap.has(node.moduleId)) {
        const moduleNode: GraphNode = {
          id: `module-group-${node.moduleId}`,
          name: this.formatModuleName(node.moduleId),
          type: 'module-group',
          language: node.language,
          moduleId: node.moduleId,
          parentGroupId: node.language ? `language-group-${node.language}` : undefined,
          size: 0,
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0,
            childCount: 0
          },
          isExpanded: false,
          x: undefined,
          y: undefined
        };
        newNodes.push(moduleNode);
        moduleMap.set(node.moduleId, moduleNode);
      }

      // Create namespace group nodes
      const namespaceKey = `${node.language || 'unknown'}::${node.namespace || 'global'}`;
      if (node.namespace && !namespaceMap.has(namespaceKey)) {
        const namespaceNode: GraphNode = {
          id: `namespace-group-${namespaceKey}`,
          name: this.formatNamespaceName(node.namespace),
          type: 'namespace-group',
          language: node.language,
          namespace: node.namespace,
          parentGroupId: node.moduleId 
            ? `module-group-${node.moduleId}` 
            : (node.language ? `language-group-${node.language}` : undefined),
          size: 0,
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0,
            childCount: 0
          },
          isExpanded: false,
          x: undefined,
          y: undefined
        };
        newNodes.push(namespaceNode);
        namespaceMap.set(namespaceKey, namespaceNode);
      }

      // Assign parentGroupId to nodes (most specific first)
      const namespaceKey2 = `${node.language || 'unknown'}::${node.namespace || 'global'}`;
      if (node.namespace && namespaceMap.has(namespaceKey2)) {
        node.parentGroupId = namespaceMap.get(namespaceKey2)?.id;
      } else if (node.moduleId) {
        node.parentGroupId = moduleMap.get(node.moduleId)?.id;
      } else if (node.language) {
        node.parentGroupId = languageMap.get(node.language)?.id;
      }
    });

    // Second pass: enhance edges with cross-language information
    data.edges.forEach(edge => {
      const sourceNode = newNodes.find(n => n.id === edge.source);
      const targetNode = newNodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        edge.isCrossLanguage = sourceNode.language !== targetNode.language;
        edge.sourceLanguage = sourceNode.language;
        edge.targetLanguage = targetNode.language;
        
        if (!edge.details) {
          edge.details = this.generateEdgeDetails(edge, sourceNode, targetNode);
        }
        
        if (edge.isCrossLanguage && sourceNode.metrics) {
          sourceNode.metrics.crossLanguageCalls = (sourceNode.metrics.crossLanguageCalls || 0) + 1;
        }
      }
    });

    // Third pass: aggregate metrics for group nodes
    newNodes.forEach(node => {
      if (node.type === 'language-group' || node.type === 'module-group' || node.type === 'namespace-group') {
        const childNodes = newNodes.filter(n => n.parentGroupId === node.id);
        
        if (!node.metrics) {
          node.metrics = { loc: 0, callCount: 0, crossLanguageCalls: 0, childCount: 0 };
        }
        
        childNodes.forEach(child => {
          if (child.metrics && node.metrics) {
            node.metrics.loc = (node.metrics.loc || 0) + (child.metrics.loc || 0);
            node.metrics.callCount = (node.metrics.callCount || 0) + (child.metrics.callCount || 0);
            node.metrics.crossLanguageCalls = (node.metrics.crossLanguageCalls || 0) + (child.metrics.crossLanguageCalls || 0);
          }
          if (node.metrics) {
            node.metrics.childCount = (node.metrics.childCount || 0) + 1;
          }
        });
        
        node.size = Math.max(20, Math.min(80, 
          20 + Math.sqrt(node.metrics.loc || 0) * 0.5 + 
          (node.metrics.childCount || 0) * 2
        ));
      }
    });

    // Create aggregated edges between group nodes
    const groupEdges = this.createGroupEdges(newNodes, newEdges);
    
    return { nodes: newNodes, edges: [...newEdges, ...groupEdges] };
  }

  /**
   * Create class container nodes that group methods and properties
   */
  private createClassContainerNodes(nodes: GraphNode[]): GraphNode[] {
    const containerNodes: GraphNode[] = [];
    const processedNodes: Set<string> = new Set();
    const classContainerMap = new Map<string, GraphNode>();

    // Group nodes by their parent class
    const classMemberMap = new Map<string, GraphNode[]>();
    
    nodes.forEach(node => {
      if (node.type === 'class' || node.type === 'interface' || node.type === 'struct') {
        // This is a class-like container
        if (!classMemberMap.has(node.id)) {
          classMemberMap.set(node.id, []);
        }
        
        // Create enhanced class container
        const containerNode: GraphNode = {
          ...node,
          type: `${node.type}-container`,
          isExpanded: true, // Default to expanded
          containerType: 'class',
          childNodes: [],
          aggregatedMethods: [],
          metrics: {
            ...node.metrics,
            childCount: 0,
            methodCount: 0,
            propertyCount: 0
          }
        };
        classContainerMap.set(node.id, containerNode);
      } else if (node.parentSymbolId) {
        // This is a member of a class
        const parentId = node.parentSymbolId.toString();
        if (!classMemberMap.has(parentId)) {
          classMemberMap.set(parentId, []);
        }
        classMemberMap.get(parentId)!.push(node);
      } else if (this.couldBelongToClass(node)) {
        // Try to infer class membership from qualified names and patterns
        const inferredParentId = this.inferClassParent(node, nodes);
        if (inferredParentId) {
          if (!classMemberMap.has(inferredParentId)) {
            classMemberMap.set(inferredParentId, []);
          }
          classMemberMap.get(inferredParentId)!.push(node);
        }
      }
    });

    // Process each class and its members
    classMemberMap.forEach((members, classId) => {
      const classContainer = classContainerMap.get(classId);
      if (!classContainer) {
        // No class container found, add individual nodes
        members.forEach(member => {
          if (!processedNodes.has(member.id)) {
            containerNodes.push(member);
            processedNodes.add(member.id);
          }
        });
        return;
      }

      // Separate methods from properties
      const methods = members.filter(m => m.type === 'method' || m.type === 'function');
      const properties = members.filter(m => m.type === 'property' || m.type === 'field' || m.type === 'variable');
      const others = members.filter(m => !methods.includes(m) && !properties.includes(m));

      // Classify methods by complexity for aggregation
      const simpleMethods = methods.filter(m => this.isSimpleMethod(m));
      const complexMethods = methods.filter(m => !this.isSimpleMethod(m));

      // Update container metrics
      classContainer.metrics!.childCount = members.length;
      classContainer.metrics!.methodCount = methods.length;
      classContainer.metrics!.propertyCount = properties.length;

      // Add simple methods as aggregated badges
      classContainer.aggregatedMethods = simpleMethods.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        visibility: m.visibility,
        metrics: m.metrics,
        isPublic: m.visibility === 'public',
        complexity: m.metrics?.cyclomaticComplexity || 1
      }));

      // Add complex methods and properties as expandable child nodes
      classContainer.childNodes = [...complexMethods, ...properties, ...others].map(child => ({
        ...child,
        parentContainerId: classContainer.id,
        isVisible: classContainer.isExpanded
      }));

      // Mark all members as processed
      members.forEach(member => processedNodes.add(member.id));
      
      containerNodes.push(classContainer);
      processedNodes.add(classContainer.id);
    });

    // Add remaining nodes that weren't part of any class
    nodes.forEach(node => {
      if (!processedNodes.has(node.id)) {
        containerNodes.push(node);
      }
    });

    return containerNodes;
  }

  /**
   * Determine if a method should be aggregated (shown as badge) vs expanded (shown as node)
   */
  private isSimpleMethod(node: GraphNode): boolean {
    const loc = node.metrics?.loc || 0;
    const complexity = node.metrics?.cyclomaticComplexity || 1;
    const callCount = node.metrics?.callCount || 0;
    
    // Aggregate simple methods: small, low complexity, private/protected
    return (
      loc < 15 && 
      complexity <= 3 && 
      callCount < 10 && 
      (node.visibility === 'private' || node.visibility === 'protected')
    );
  }

  /**
   * Check if a node could belong to a class based on its properties
   */
  private couldBelongToClass(node: GraphNode): boolean {
    const hasMethodType = (node.type === 'method' || node.type === 'function' || node.type === 'property' || node.type === 'field');
    const hasQualifiedName = !!(node.qualifiedName?.includes('::') || node.qualifiedName?.includes('.'));
    const hasNamespace = !!node.namespace;
    
    return hasMethodType && hasQualifiedName && hasNamespace;
  }

  /**
   * Try to infer which class a node belongs to based on patterns
   */
  private inferClassParent(node: GraphNode, allNodes: GraphNode[]): string | null {
    if (!node.qualifiedName) return null;

    // For C++ style: "ClassName::methodName" or "Namespace::ClassName::methodName"
    if (node.qualifiedName.includes('::')) {
      const parts = node.qualifiedName.split('::');
      if (parts.length >= 2) {
        // Try to find a class with a matching qualified name pattern
        const potentialClassName = parts[parts.length - 2]; // Second to last part
        const potentialClassQualifiedName = parts.slice(0, -1).join('::');
        
        const parentClass = allNodes.find(n => 
          n.type === 'class' && 
          (n.name === potentialClassName || n.qualifiedName === potentialClassQualifiedName)
        );
        
        if (parentClass) {
          return parentClass.id;
        }
      }
    }

    // For other languages: "Class.method" patterns
    if (node.qualifiedName.includes('.')) {
      const parts = node.qualifiedName.split('.');
      if (parts.length >= 2) {
        const potentialClassName = parts[parts.length - 2];
        const parentClass = allNodes.find(n => 
          n.type === 'class' && n.name === potentialClassName
        );
        
        if (parentClass) {
          return parentClass.id;
        }
      }
    }

    return null;
  }

  /**
   * Filter graph data based on provided filters
   */
  public filterGraphData(data: GraphData, filters: GraphFilters): GraphData {
    // Filter nodes
    const filteredNodes = data.nodes.filter(node => {
      // Filter by node type
      if (!filters.nodeTypes.includes('all') && !filters.nodeTypes.includes(node.type)) {
        return false;
      }

      // Filter by language
      if (!filters.languages.includes('all') && node.language && !filters.languages.includes(node.language)) {
        return false;
      }

      // Filter by metrics
      if (node.metrics) {
        const loc = node.metrics.loc || 0;
        const complexity = node.metrics.cyclomaticComplexity || 0;
        
        if (loc < filters.metrics.minLoc || loc > filters.metrics.maxLoc) {
          return false;
        }
        
        if (complexity < filters.metrics.minComplexity || complexity > filters.metrics.maxComplexity) {
          return false;
        }
      }

      // Filter group nodes
      if (!filters.showGroupNodes && (node.type === 'module-group' || node.type === 'namespace-group')) {
        return false;
      }

      // Filter by density threshold
      const nodeEdgeCount = data.edges.filter(e => 
        e.source === node.id || e.target === node.id
      ).length;
      
      if (nodeEdgeCount > filters.densityThreshold) {
        return false;
      }

      return true;
    });

    // Get filtered node IDs for edge filtering
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

    // Filter edges
    const filteredEdges = data.edges.filter(edge => {
      // Both nodes must be in filtered set
      if (!filteredNodeIds.has(edge.source) || !filteredNodeIds.has(edge.target)) {
        return false;
      }

      // Filter by edge type
      if (!filters.edgeTypes.includes('all') && !filters.edgeTypes.includes(edge.type)) {
        return false;
      }

      // Filter cross-language edges
      if (!filters.showCrossLanguage && edge.isCrossLanguage) {
        return false;
      }

      return true;
    });

    return {
      nodes: filteredNodes,
      edges: filteredEdges
    };
  }

  /**
   * Transform raw relationship data from API to graph format
   */
  public transformRelationshipsToGraph(relationships: any[]): GraphData {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // Extract unique symbols as nodes with rich data
    relationships.forEach(rel => {
      // Create source node if not exists
      if (!nodes.has(rel.from_symbol_id.toString())) {
        // Debug language data
        if (!rel.from_language) {
          console.warn('🔍 Missing from_language for symbol:', rel.from_name, 'file:', rel.from_file_path);
        }
        
        const sourceNode: GraphNode = {
          id: rel.from_symbol_id.toString(),
          name: rel.from_name || 'Unknown',
          type: rel.from_kind || 'unknown',
          qualifiedName: rel.from_qualified_name,
          namespace: rel.from_namespace,
          filePath: rel.from_file_path,
          line: rel.from_line,
          column: rel.from_column,
          endLine: rel.from_end_line,
          endColumn: rel.from_end_column,
          signature: rel.from_signature,
          returnType: rel.from_return_type,
          visibility: rel.from_visibility,
          confidence: rel.from_confidence,
          language: rel.from_language || this.detectLanguageFromSymbol(rel),
          languageFeatures: rel.from_language_features ? JSON.parse(rel.from_language_features) : {
            isAsync: rel.from_is_async,
            isExported: rel.from_is_exported,
            isAbstract: rel.from_is_abstract
          },
          semanticTags: rel.from_semantic_tags ? JSON.parse(rel.from_semantic_tags) : [],
          size: this.calculateEnhancedNodeSize(rel, 'from'),
          metrics: {
            loc: 0, // TODO: Extract from semantic analysis if available
            callCount: 0,
            crossLanguageCalls: 0,
            cyclomaticComplexity: 0 // TODO: Extract from pattern detection
          }
        };
        nodes.set(rel.from_symbol_id.toString(), sourceNode);
      }

      // Create target node if not exists  
      if (!nodes.has(rel.to_symbol_id.toString())) {
        // Debug language data
        if (!rel.to_language) {
          console.warn('🔍 Missing to_language for symbol:', rel.to_name, 'file:', rel.to_file_path);
        }
        
        const targetNode: GraphNode = {
          id: rel.to_symbol_id.toString(),
          name: rel.to_name || 'Unknown',
          type: rel.to_kind || 'unknown',
          qualifiedName: rel.to_qualified_name,
          namespace: rel.to_namespace,
          filePath: rel.to_file_path,
          line: rel.to_line,
          column: rel.to_column,
          endLine: rel.to_end_line,
          endColumn: rel.to_end_column,
          signature: rel.to_signature,
          returnType: rel.to_return_type,
          visibility: rel.to_visibility,
          confidence: rel.to_confidence,
          language: rel.to_language || this.detectLanguageFromSymbol(rel, 'to'),
          languageFeatures: rel.to_language_features ? JSON.parse(rel.to_language_features) : {
            isAsync: rel.to_is_async,
            isExported: rel.to_is_exported,
            isAbstract: rel.to_is_abstract
          },
          semanticTags: rel.to_semantic_tags ? JSON.parse(rel.to_semantic_tags) : [],
          size: this.calculateEnhancedNodeSize(rel, 'to'),
          metrics: {
            loc: 0, // TODO: Extract from semantic analysis if available
            callCount: 0,
            crossLanguageCalls: 0,
            cyclomaticComplexity: 0 // TODO: Extract from pattern detection
          }
        };
        nodes.set(rel.to_symbol_id.toString(), targetNode);
      }

      // Create enhanced edge with rich relationship data
      const metadata = rel.metadata ? JSON.parse(rel.metadata) : {};
      const isCrossLanguage = rel.from_language !== rel.to_language;
      
      edges.push({
        source: rel.from_symbol_id.toString(),
        target: rel.to_symbol_id.toString(),
        type: rel.type,
        weight: rel.confidence || 1,
        confidence: rel.confidence || 1,
        contextLine: rel.context_line,
        contextColumn: rel.context_column,
        contextSnippet: rel.context_snippet,
        isCrossLanguage,
        sourceLanguage: rel.from_language,
        targetLanguage: rel.to_language,
        metadata,
        details: this.generateEnhancedEdgeDetails(rel, isCrossLanguage)
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  /**
   * Calculate enhanced node size based on rich symbol data
   */
  private calculateEnhancedNodeSize(rel: any, prefix: 'from' | 'to' = 'from'): number {
    const signature = prefix === 'from' ? rel.from_signature : rel.to_signature;
    const kind = prefix === 'from' ? rel.from_kind : rel.to_kind;
    const confidence = prefix === 'from' ? rel.from_confidence : rel.to_confidence;
    
    // Base size by symbol type
    let baseSize = 8;
    switch (kind) {
      case 'class':
      case 'struct':
        baseSize = 15;
        break;
      case 'function':
      case 'method':
        baseSize = 10;
        break;
      case 'namespace':
        baseSize = 20;
        break;
      case 'variable':
      case 'field':
        baseSize = 6;
        break;
    }
    
    // Adjust by signature complexity (parameter count)
    if (signature) {
      const paramCount = (signature.match(/,/g) || []).length + 1;
      baseSize += Math.min(paramCount * 0.5, 5);
    }
    
    // Adjust by confidence (low confidence = smaller, less prominent)
    const confidenceMultiplier = Math.max(0.6, confidence || 1);
    
    return Math.round(baseSize * confidenceMultiplier);
  }
  
  /**
   * Generate enhanced edge details with rich context
   */
  private generateEnhancedEdgeDetails(rel: any, isCrossLanguage: boolean): string {
    const baseDetail = `${rel.type}: ${rel.from_name} → ${rel.to_name}`;
    
    if (isCrossLanguage && rel.from_language && rel.to_language) {
      const fromLang = this.getLanguageDisplayName(rel.from_language);
      const toLang = this.getLanguageDisplayName(rel.to_language);
      return `Cross-language ${rel.type}: ${fromLang} → ${toLang}`;
    }
    
    if (rel.context_snippet) {
      return `${baseDetail} | Context: ${rel.context_snippet.substring(0, 50)}...`;
    }
    
    if (rel.from_signature && rel.type === 'calls') {
      return `Function call: ${rel.from_signature} → ${rel.to_name}`;
    }
    
    return baseDetail;
  }

  /**
   * Detect language from symbol data
   */
  private detectLanguageFromSymbol(rel: any, prefix: 'from' | 'to' = 'from'): string {
    const qualifiedName = prefix === 'from' ? rel.from_qualified_name : rel.to_qualified_name;
    const filePath = prefix === 'from' ? rel.from_file_path : rel.to_file_path;
    const symbolName = prefix === 'from' ? rel.from_name : rel.to_name;
    
    // First try to detect from file extension
    if (filePath) {
      if (filePath.endsWith('.go')) return 'go';
      if (filePath.endsWith('.java')) return 'java';
      if (filePath.endsWith('.cs')) return 'csharp';
      if (filePath.endsWith('.py') || filePath.endsWith('.pyi')) return 'python';
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
      if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs')) return 'javascript';
      if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.cxx') || 
          filePath.endsWith('.ixx') || filePath.endsWith('.h') || filePath.endsWith('.hpp')) return 'cpp';
    }
    
    // Fallback to qualified name patterns
    if (qualifiedName?.includes('::')) {
      return 'cpp';
    }
    
    if (qualifiedName?.includes('.') && !qualifiedName?.includes('::')) {
      // Could be Java, C#, or Python - check for common patterns
      if (qualifiedName.match(/^[a-z]+(\.[a-z][a-zA-Z]*)*\.[A-Z]/)) {
        return 'java'; // Java package naming convention
      }
      return 'python';
    }
    
    // Debug: log when we can't detect language
    console.warn('🔍 Could not detect language for symbol:', symbolName, 'file:', filePath, 'qualified:', qualifiedName);
    return 'unknown'; // Don't default to cpp, be explicit about unknown
  }

  /**
   * Generate enhanced edge details
   */
  private generateEdgeDetails(edge: GraphEdge, source?: GraphNode, target?: GraphNode): string {
    if (!source || !target) {
      return edge.type;
    }
    
    if (edge.isCrossLanguage && source.language && target.language) {
      return `${this.getLanguageDisplayName(source.language)} → ${this.getLanguageDisplayName(target.language)}: ${source.name} → ${target.name}`;
    }
    
    const baseDetail = `${edge.type}: ${source.name} → ${target.name}`;
    
    switch (edge.type) {
      case 'calls':
        return `${baseDetail} (function call)`;
      case 'inherits':
        return `${baseDetail} (inheritance)`;
      case 'uses':
        return `${baseDetail} (dependency)`;
      case 'includes':
        return `${baseDetail} (file include)`;
      case 'spawns':
        return `${baseDetail} (process spawn)`;
      case 'imports':
        return `${baseDetail} (module import)`;
      default:
        return baseDetail;
    }
  }

  /**
   * Create aggregated edges between group nodes
   */
  private createGroupEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
    const groupEdges: GraphEdge[] = [];
    const edgeMap = new Map<string, { count: number; types: Set<string> }>();

    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (sourceNode?.parentGroupId && targetNode?.parentGroupId && 
          sourceNode.parentGroupId !== targetNode.parentGroupId) {
        const key = `${sourceNode.parentGroupId}->${targetNode.parentGroupId}`;
        
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { count: 0, types: new Set() });
        }
        
        const edgeInfo = edgeMap.get(key)!;
        edgeInfo.count++;
        edgeInfo.types.add(edge.type);
      }
    });

    edgeMap.forEach((info, key) => {
      const [source, target] = key.split('->');
      groupEdges.push({
        source,
        target,
        type: 'aggregated',
        weight: Math.min(5, info.count / 2),
        details: `${info.count} connections (${Array.from(info.types).join(', ')})`
      });
    });

    return groupEdges;
  }

  /**
   * Helper methods for formatting names
   */
  private getLanguageDisplayName(language: string): string {
    const displayNames: Record<string, string> = {
      'cpp': 'C++',
      'python': 'Python',
      'typescript': 'TypeScript',
      'javascript': 'JavaScript',
      'rust': 'Rust',
      'go': 'Go',
      'java': 'Java',
      'csharp': 'C#',
      'kotlin': 'Kotlin',
      'unknown': 'Unknown'
    };
    return displayNames[language] || language.charAt(0).toUpperCase() + language.slice(1);
  }

  private formatModuleName(moduleId: string): string {
    const parts = moduleId.split('/');
    return parts[parts.length - 1] || moduleId;
  }

  private formatNamespaceName(namespace: string): string {
    const parts = namespace.split('::');
    return parts[parts.length - 1] || namespace;
  }

  /**
   * Calculate connected components
   */
  public calculateConnectedComponents(data: GraphData): number {
    if (data.nodes.length === 0) return 0;

    const visited = new Set<string>();
    let components = 0;

    const adjacencyList = new Map<string, string[]>();
    data.nodes.forEach(node => adjacencyList.set(node.id, []));
    data.edges.forEach(edge => {
      adjacencyList.get(edge.source)?.push(edge.target);
      adjacencyList.get(edge.target)?.push(edge.source);
    });

    const dfs = (nodeId: string) => {
      visited.add(nodeId);
      const neighbors = adjacencyList.get(nodeId) || [];
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        }
      });
    };

    data.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        components++;
        dfs(node.id);
      }
    });

    return components;
  }

  /**
   * Calculate graph statistics
   */
  public calculateStats(data: GraphData) {
    const nodeCount = data.nodes.length;
    const edgeCount = data.edges.length;
    const components = this.calculateConnectedComponents(data);
    const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

    return { nodeCount, edgeCount, components, avgDegree };
  }
}