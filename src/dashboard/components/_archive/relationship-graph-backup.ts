import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js'; // Import stateService
import * as d3 from 'd3';
import './graph-filter-sidebar.js'; // Import the filter sidebar

import { GraphNode, GraphEdge } from '../../shared/types/api';

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphFilters {
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

export class RelationshipGraph extends DashboardComponent {
  private graphData: GraphData | null = null;
  private hierarchicalGraphData: GraphData | null = null; // New: Stores hierarchical data
  private filteredGraphData: GraphData | null = null; // Filtered version of the graph
  private selectedNode: string | null = null;
  private simulation: any = null;
  private currentFilters: GraphFilters | null = null;
  private _zoom: any = null;

  async loadData(): Promise<void> {
    try {
      const response = await dataService.getRelationships();
      
      // Transform raw relationship data to graph format
      this.graphData = this.transformRelationshipsToGraph(response);

      this.hierarchicalGraphData = this.createHierarchicalGraphData(this.graphData);
      
      // Apply any existing filters
      this.applyFilters();
      
      this.render();
      await this.initializeGraph();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    
    // Listen for filter changes
    this.addEventListener('filter-changed', ((event: CustomEvent) => {
      this.handleFilterChange(event);
    }) as EventListener);
    
    // Subscribe to filter state changes
    stateService.subscribe('graphFilters', (filters: GraphFilters) => {
      this.currentFilters = filters;
      this.applyFilters();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.simulation) {
      this.simulation.stop();
    }
  }

  /**
   * Wait for D3.js to be available
   */
  private async waitForD3(): Promise<void> {
    // If D3 is already available, return immediately
    if (window.d3) {
      return;
    }

    // Wait up to 5 seconds for D3 to load
    const maxAttempts = 50;
    const delay = 100; // 100ms between checks

    for (let i = 0; i < maxAttempts; i++) {
      if (window.d3) {
        console.log('✅ D3.js is now available');
        return;
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    console.warn('⚠️ D3.js not loaded after waiting, attempting to load it...');
    
    // If D3 still isn't available, try to load it
    await this.loadD3();
  }

  /**
   * Load D3.js dynamically
   */
  private async loadD3(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.d3) {
        resolve();
        return;
      }

      const existingScript = document.querySelector('script[src*="d3.min.js"]');
      if (existingScript) {
        // Script tag exists but D3 might not be ready yet
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => reject(new Error('Failed to load D3.js')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
      script.onload = () => {
        console.log('✅ D3.js loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load D3.js');
        reject(new Error('Failed to load D3.js'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Transform raw relationship data from API to graph nodes/edges format
   */
  private transformRelationshipsToGraph(relationships: any[]): GraphData {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // Extract unique symbols as nodes
    relationships.forEach(rel => {
      // Create source node if not exists
      if (!nodes.has(rel.from_symbol_id.toString())) {
        nodes.set(rel.from_symbol_id.toString(), {
          id: rel.from_symbol_id.toString(),
          name: rel.from_name || 'Unknown',
          type: rel.from_kind || 'unknown',
          namespace: rel.from_namespace,
          language: this.detectLanguageFromSymbol(rel),
          size: 10, // Default size
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0
          }
        });
      }

      // Create target node if not exists  
      if (!nodes.has(rel.to_symbol_id.toString())) {
        nodes.set(rel.to_symbol_id.toString(), {
          id: rel.to_symbol_id.toString(),
          name: rel.to_name || 'Unknown',
          type: rel.to_kind || 'unknown',
          namespace: rel.to_namespace,
          language: this.detectLanguageFromSymbol(rel, 'to'),
          size: 10, // Default size
          metrics: {
            loc: 0,
            callCount: 0,
            crossLanguageCalls: 0
          }
        });
      }

      // Create edge
      const metadata = rel.metadata ? JSON.parse(rel.metadata) : {};
      edges.push({
        source: rel.from_symbol_id.toString(),
        target: rel.to_symbol_id.toString(),
        type: rel.type,
        weight: rel.confidence || 1,
        confidence: rel.confidence || 1,
        isCrossLanguage: metadata.crossLanguage || false,
        details: `${rel.type}: ${rel.from_name} → ${rel.to_name}`
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  /**
   * Detect language from symbol data
   */
  private detectLanguageFromSymbol(rel: any, prefix: 'from' | 'to' = 'from'): string {
    const qualifiedName = prefix === 'from' ? rel.from_qualified_name : rel.to_qualified_name;
    
    // C++ typically has :: namespace separators
    if (qualifiedName?.includes('::')) {
      return 'cpp';
    }
    
    // Python typically has . separators and .py files
    if (qualifiedName?.includes('.') && !qualifiedName?.includes('::')) {
      return 'python';
    }
    
    // TypeScript/JavaScript detection could be more sophisticated
    // For now, default to cpp since most of our data is C++
    return 'cpp';
  }

  // Enhanced: Function to create hierarchical graph data with multi-language support
  private createHierarchicalGraphData(data: GraphData): GraphData {
    const newNodes: GraphNode[] = [...data.nodes];
    const newEdges: GraphEdge[] = [...data.edges];
    const moduleMap = new Map<string, GraphNode>();
    const namespaceMap = new Map<string, GraphNode>();
    const languageMap = new Map<string, GraphNode>();

    // First pass: detect languages and enhance nodes
    data.nodes.forEach(node => {
      // Detect language if not already set
      if (!node.language) {
        node.language = this.detectLanguageFromNode(node);
      }

      // Create language group nodes
      if (node.language && !languageMap.has(node.language)) {
        const languageNode: GraphNode = {
          id: `language-group-${node.language}`,
          name: this.getLanguageDisplayName(node.language),
          type: 'language-group',
          language: node.language,
          size: 0, // Will aggregate later
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

      // Create module group nodes (within language groups)
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

      // Create namespace group nodes (within modules or language groups)
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

    // Second pass: process edges for cross-language detection
    data.edges.forEach(edge => {
      const sourceNode = newNodes.find(n => n.id === edge.source);
      const targetNode = newNodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        // Enhance edge with cross-language information
        edge.isCrossLanguage = sourceNode.language !== targetNode.language;
        edge.sourceLanguage = sourceNode.language;
        edge.targetLanguage = targetNode.language;
        
        // Generate enhanced details
        if (!edge.details) {
          edge.details = this.generateEdgeDetails(edge, sourceNode, targetNode);
        }
        
        // Update metrics for cross-language calls
        if (edge.isCrossLanguage && sourceNode.metrics) {
          sourceNode.metrics.crossLanguageCalls = (sourceNode.metrics.crossLanguageCalls || 0) + 1;
        }
      }
    });

    // Third pass: Enhanced metrics aggregation
    newNodes.forEach(node => {
      if (node.type === 'language-group' || node.type === 'module-group' || node.type === 'namespace-group') {
        // Find all child nodes
        const childNodes = newNodes.filter(n => n.parentGroupId === node.id);
        
        // Initialize metrics if not present
        if (!node.metrics) {
          node.metrics = { loc: 0, callCount: 0, crossLanguageCalls: 0, childCount: 0 };
        }
        
        // Aggregate metrics from direct children
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
        
        // Calculate size based on aggregated metrics
        node.size = Math.max(20, Math.min(80, 
          20 + Math.sqrt(node.metrics.loc || 0) * 0.5 + 
          (node.metrics.childCount || 0) * 2
        ));
      }
    });

    // Create aggregated edges between group nodes
    const groupEdges = this.createGroupEdges(newNodes, newEdges);
    
    // For now, we keep original edges. In later tasks, we might aggregate or create new edges between group nodes.
    return { nodes: newNodes, edges: [...newEdges, ...groupEdges] };
  }

  render() {
    if (this._loading) {
      this.shadow.innerHTML = this.renderLoading();
      return;
    }

    if (this._error) {
      this.shadow.innerHTML = this.renderError();
      return;
    }

    const stats = this.calculateStats();

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 32px 48px;
          height: 100vh;
          box-sizing: border-box;
          width: 100%;
        }
        
        .page-header {
          margin-bottom: 32px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--card-border);
          position: relative;
        }
        
        .page-header::before {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 80px;
          height: 2px;
          background: linear-gradient(90deg, var(--primary-accent), var(--secondary-accent));
        }
        
        h1 {
          font-size: 2.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--primary-accent), var(--secondary-accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
        }
        
        .subtitle {
          font-size: 1.125rem;
          color: var(--text-secondary);
          font-weight: 400;
          letter-spacing: 0.01em;
        }
        
        .graph-container {
          display: grid;
          grid-template-columns: 280px 1fr 300px;
          gap: 20px;
          height: calc(100vh - 200px);
        }
        
        .graph-canvas {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius);
          backdrop-filter: blur(20px);
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow-soft);
        }
        
        #relationshipGraph {
          width: 100%;
          height: 100%;
        }
        
        .graph-controls {
          position: absolute;
          top: 20px;
          left: 20px;
          display: flex;
          gap: 10px;
          z-index: 10;
        }
        
        .control-btn {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid rgba(78, 205, 196, 0.5);
          color: #4ecdc4;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
        }
        
        .control-btn:hover {
          background: rgba(78, 205, 196, 0.3);
          transform: translateY(-1px);
        }
        
        .graph-sidebar {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .card {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        
        .stat-item {
          text-align: center;
        }
        
        .stat-value {
          font-size: 2rem;
          font-weight: 300;
          color: #4ecdc4;
        }
        
        .stat-label {
          font-size: 0.9rem;
          color: #888;
          margin-top: 5px;
        }
        
        .node-details {
          max-height: 400px;
          overflow-y: auto;
        }
        
        .node-info {
          margin-bottom: 20px;
        }
        
        .node-name {
          font-size: 1.3rem;
          color: #4ecdc4;
          margin-bottom: 5px;
        }
        
        .node-type {
          color: #888;
          font-size: 0.9rem;
        }
        
        .connections-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .connection-item {
          background: rgba(255, 255, 255, 0.05);
          padding: 10px;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .connection-item:hover {
          background: rgba(78, 205, 196, 0.1);
          transform: translateX(5px);
        }
        
        .node-actions {
          display: flex;
          gap: 10px;
          margin: 15px 0;
        }
        
        .action-btn {
          flex: 1;
          padding: 8px 12px;
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          color: var(--primary-accent);
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        
        .action-btn:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(147, 112, 219, 0.3);
        }
        
        .action-btn:active {
          transform: translateY(0);
        }
        
        .connection-name {
          color: #4ecdc4;
          font-size: 0.9rem;
        }
        
        .connection-type {
          color: #666;
          font-size: 0.8rem;
        }
        
        /* D3 styles */
        .node {
          cursor: pointer;
        }
        
        .node circle {
          stroke: #fff;
          stroke-width: 1.5px;
        }
        
        .node text {
          font-size: 12px;
          fill: #e0e0e0;
          text-anchor: middle;
          pointer-events: none;
        }
        
        .link {
          fill: none;
          stroke: #666;
          stroke-width: 1.5px;
          opacity: 0.6;
        }
        
        .link.highlighted {
          stroke: #4ecdc4;
          stroke-width: 3px;
          opacity: 1;
        }
        
        .node.highlighted circle {
          stroke: #4ecdc4;
          stroke-width: 3px;
        }
        
        .legend {
          position: absolute;
          bottom: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.8);
          padding: 15px;
          border-radius: 8px;
          font-size: 12px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        }
        
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .graph-tooltip {
          position: absolute;
          background: rgba(0, 0, 0, 0.9);
          color: #fff;
          padding: 8px;
          border-radius: 4px;
          font-size: 12px;
          pointer-events: none; /* Important for not interfering with graph interactions */
          opacity: 0;
          transition: opacity 0.2s ease-in-out;
          z-index: 1000;
        }
      </style>
      
      <div class="page-header">
        <h1>Code Relationships</h1>
        <p class="subtitle">Interactive visualization of code dependencies and connections</p>
      </div>
      
      <div class="graph-container">
        <!-- Filter Sidebar -->
        <graph-filter-sidebar></graph-filter-sidebar>
        
        <!-- Main Graph Canvas -->
        <div class="graph-canvas">
          <div class="graph-controls">
            <button class="control-btn" onclick="this.getRootNode().host.resetZoom()">Reset Zoom</button>
            <button class="control-btn" onclick="this.getRootNode().host.toggleForce()">Toggle Force</button>
            <button class="control-btn" onclick="this.getRootNode().host.centerGraph()">Center</button>
          </div>
          <svg id="relationshipGraph"></svg>
          
          <div class="legend">
            <div class="legend-item">
              <div class="legend-color" style="background: #4ecdc4;"></div>
              <span>Class/Struct</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #ff6b6b;"></div>
              <span>Function</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #51cf66;"></div>
              <span>Namespace</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #6a0572;"></div>
              <span>Module Group</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #8d0572;"></div>
              <span>Namespace Group</span>
            </div>
          </div>
          <div id="graph-tooltip" class="graph-tooltip"></div>
        </div>
        
        <!-- Stats Sidebar -->
        <div class="graph-sidebar">
          <div class="card">
            <h3>Graph Statistics</h3>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-value">${stats.nodeCount}</div>
                <div class="stat-label">Nodes</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">${stats.edgeCount}</div>
                <div class="stat-label">Edges</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">${stats.components}</div>
                <div class="stat-label">Components</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">${stats.avgDegree.toFixed(1)}</div>
                <div class="stat-label">Avg Degree</div>
              </div>
            </div>
          </div>
          
          <div class="card" id="nodeDetailsCard" style="display: ${this.selectedNode ? 'block' : 'none'};">
            <h3>Node Details</h3>
            <div class="node-details" id="nodeDetails">
              <!-- Node details will be populated here -->
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private calculateStats(): any {
    if (!this.hierarchicalGraphData) {
      return { nodeCount: 0, edgeCount: 0, components: 0, avgDegree: 0 };
    }

    const nodeCount = this.hierarchicalGraphData.nodes.length;
    const edgeCount = this.hierarchicalGraphData.edges.length;
    
    // Calculate connected components
    const components = this.calculateConnectedComponents();
    
    // Calculate average degree
    const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

    return { nodeCount, edgeCount, components, avgDegree };
  }

  private calculateConnectedComponents(): number {
    if (!this.hierarchicalGraphData || this.hierarchicalGraphData.nodes.length === 0) return 0;

    const visited = new Set<string>();
    let components = 0;

    const adjacencyList = new Map<string, string[]>();
    this.hierarchicalGraphData.nodes.forEach(node => adjacencyList.set(node.id, []));
    this.hierarchicalGraphData.edges.forEach(edge => {
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

    this.hierarchicalGraphData.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        components++;
        dfs(node.id);
      }
    });

    return components;
  }

  private async initializeGraph() {
    if (!this.hierarchicalGraphData) {
      console.error('No graph data available');
      return;
    }

    // Use filtered data if available, otherwise use hierarchical data
    const graphData = this.filteredGraphData || this.hierarchicalGraphData;

    // Wait for D3.js to be available
    await this.waitForD3();
    
    if (!window.d3) {
      console.error('D3.js failed to load');
      return;
    }

    const container = this.shadow.getElementById('relationshipGraph');
    if (!container) return;

    // Ensure container has dimensions
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    
    if (width === 0 || height === 0) {
      console.warn('Container has no dimensions, using defaults');
    }

    // Clear existing graph
    const d3 = window.d3;
    d3.select(container).selectAll('*').remove();

    const svg = d3.select(container)
      .attr('width', width)
      .attr('height', height);

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
        this._zoom = event.transform;
        // Update label visibility based on zoom level
        this.updateLabelVisibility(event.transform.k);
      });

    svg.call(zoom);

    const g = svg.append('g');
    (this as any)._g = g; // Store reference for later use
    (this as any)._zoomBehavior = zoom; // Store zoom behavior for later use

    // Initialize node positions to prevent NaN errors
    if (graphData && graphData.nodes) {
      graphData.nodes.forEach((node, i) => {
        if (node.x === undefined || isNaN(node.x)) {
          // Place nodes in a circle initially
          const angle = (i / graphData.nodes.length) * 2 * Math.PI;
          const radius = Math.min(width, height) * 0.3;
          node.x = width / 2 + radius * Math.cos(angle);
          node.y = height / 2 + radius * Math.sin(angle);
        }
      });
    }

    // Create force simulation
    this.simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.edges)
        .id((d: any) => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // New: Force to cluster nodes within their parent groups  
    this.simulation.force('group', this.forceCluster());

    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.edges)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-dasharray', (d: any) => d.type === 'uses' ? '5,5' : null)
      .style('stroke-width', (d: any) => d.weight ? d.weight * 1.5 : 1.5) // Use weight for stroke width
      .style('opacity', (d: any) => {
        // Dim links connected to group nodes or less important types
        if (d.source.type.includes('-group') || d.target.type.includes('-group')) return 0.3; // Dim links to/from groups
        if (d.type === 'uses') return 0.4; // Dim 'uses' links slightly
        return 0.6; // Default opacity
      })
      .on('mouseover', (event: any, d: any) => {
        const tooltip = this.shadow.getElementById('graph-tooltip');
        if (tooltip && d.details) {
          tooltip.style.opacity = '1';
          tooltip.style.left = `${event.pageX + 10}px`;
          tooltip.style.top = `${event.pageY + 10}px`;
          tooltip.innerHTML = `<strong>Type:</strong> ${d.type}<br><strong>Details:</strong> ${d.details}`;
        }
      })
      .on('mouseout', () => {
        const tooltip = this.shadow.getElementById('graph-tooltip');
        if (tooltip) {
          tooltip.style.opacity = '0';
        }
      });

    // Create nodes
    const node = g.append('g')
      .selectAll('.node')
      .data(graphData.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .style('opacity', (d: any) => {
        // Dim group nodes slightly to emphasize internal structure
        if (d.type === 'module-group' || d.type === 'namespace-group') return 0.8; // Slightly dim group nodes
        return 1; // Full opacity for regular nodes
      })
      .call(d3.drag()
        .on('start', this.dragstarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragended.bind(this)));

    // Add circles to nodes with enhanced visual hierarchy
    node.append('circle')
      .attr('r', (d: any) => {
        if (d.type === 'language-group') {
          return Math.max(30, Math.min(70, 30 + Math.sqrt(d.metrics?.childCount || 1) * 5));
        }
        if (d.type === 'module-group') {
          return Math.max(25, Math.min(50, 25 + Math.sqrt(d.metrics?.childCount || 1) * 4));
        }
        if (d.type === 'namespace-group') {
          return Math.max(20, Math.min(40, 20 + Math.sqrt(d.metrics?.childCount || 1) * 3));
        }
        // Use metrics for sizing if available, fallback to existing size or default
        const sizeMetric = d.metrics?.loc || d.metrics?.cyclomaticComplexity || d.size || 10;
        return Math.max(5, Math.min(25, Math.sqrt(sizeMetric) * 2));
      })
      .attr('fill', (d: any) => {
        if (d.type === 'language-group') return '#8b0a8c';
        if (d.type === 'module-group') return '#6a0572';
        if (d.type === 'namespace-group') return '#8d0572';
        return this.getNodeColor(d.type);
      })
      .attr('stroke', (d: any) => {
        // Add stroke for group nodes
        if (d.type.includes('-group')) {
          return 'rgba(147, 112, 219, 0.8)';
        }
        return 'none';
      })
      .attr('stroke-width', (d: any) => {
        if (d.type === 'language-group') return 3;
        if (d.type === 'module-group') return 2;
        if (d.type === 'namespace-group') return 1.5;
        return 0;
      })
      .attr('stroke-dasharray', (d: any) => {
        if (d.type === 'language-group') return '5,5';
        if (d.type === 'module-group') return '3,3';
        return 'none';
      })
      .style('filter', (d: any) => {
        // Add glow effect for group nodes
        if (d.type === 'language-group') {
          return 'drop-shadow(0 0 12px rgba(139, 10, 140, 0.6))';
        }
        if (d.type.includes('-group')) {
          return 'drop-shadow(0 0 8px rgba(147, 112, 219, 0.4))';
        }
        return 'none';
      });

    // Add labels to nodes with enhanced semantic zooming
    node.append('text')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('font-size', (d: any) => {
        const currentScale = this._zoom?.k || 1;
        // Different base sizes for different node types
        let baseSize = 8;
        if (d.type === 'language-group') baseSize = 14;
        else if (d.type === 'module-group') baseSize = 12;
        else if (d.type === 'namespace-group') baseSize = 10;
        
        const scaledSize = baseSize + Math.log(d.size || 1) * 0.5;
        return `${Math.min(18, scaledSize * Math.sqrt(currentScale))}px`;
      })
      .style('opacity', (d: any) => {
        const currentScale = this._zoom?.k || 1;
        // Progressive disclosure based on node type and zoom level
        if (d.type === 'language-group') return 1; // Always visible
        if (d.type === 'module-group') return Math.min(1, currentScale * 0.8);
        if (d.type === 'namespace-group') return Math.min(1, currentScale * 0.6);
        return Math.min(1, Math.max(0, (currentScale - 0.5) * 2)); // Regular nodes fade in as you zoom
      })
      .style('font-weight', (d: any) => d.type.includes('-group') ? 'bold' : 'normal')
      .style('text-shadow', (d: any) => 
        d.type.includes('-group') ? '0 0 4px rgba(0,0,0,0.8)' : 'none'
      );

    // Placeholder for badges (Task 2.3 - future implementation)
    // node.append('image') or node.append('text') for badges

    // Add click handler for nodes
    node.on('click', (event: any, d: any) => {
      if (d.type === 'language-group' || d.type === 'module-group' || d.type === 'namespace-group') {
        this.toggleGroupExpansion(d);
      } else {
        this.selectNode(d);
      }
    });

    // Update positions on simulation tick
    this.simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x || 0)
        .attr('y1', (d: any) => d.source.y || 0)
        .attr('x2', (d: any) => d.target.x || 0)
        .attr('y2', (d: any) => d.target.y || 0);

      node
        .attr('transform', (d: any) => {
          const x = d.x || 0;
          const y = d.y || 0;
          return `translate(${x},${y})`;
        });
    });

    // Store references for later use
    (this as any)._svg = svg;
    (this as any)._g = g;
    (this as any)._zoomBehavior = zoom;
  }

  // Enhanced: Function to toggle group expansion with smooth animations
  private toggleGroupExpansion(groupNode: GraphNode) {
    const d3 = window.d3;
    const g = (this as any)._g;

    // Get all nodes and links from the current simulation
    let currentNodes = this.simulation.nodes();
    let currentLinks = this.simulation.force('link').links();

    // Find all nodes belonging to this group
    const childNodes = this.hierarchicalGraphData?.nodes.filter(n => n.parentGroupId === groupNode.id) || [];
    const childLinks = this.hierarchicalGraphData?.edges.filter(e => 
      (childNodes.some(n => n.id === e.source) && childNodes.some(n => n.id === e.target)) ||
      (childNodes.some(n => n.id === e.source) && e.target === groupNode.id) ||
      (childNodes.some(n => n.id === e.target) && e.source === groupNode.id)
    ) || [];

    if (groupNode.isExpanded) { // Collapse the group
      groupNode.isExpanded = false;

      // Animate child nodes collapsing into parent
      const childSelection = g.selectAll('.node')
        .filter((d: any) => childNodes.some(n => n.id === d.id));

      // First, move children to parent position with animation
      const parentX = groupNode.x || 0;
      const parentY = groupNode.y || 0;
      
      childSelection
        .transition()
        .duration(400)
        .ease(d3.easeCubicInOut)
        .attr('transform', `translate(${parentX},${parentY})`)
        .style('opacity', 0)
        .on('end', () => {
          // After animation, update simulation
          currentNodes = currentNodes.filter((n: any) => n.parentGroupId !== groupNode.id);
          currentLinks = currentLinks.filter((l: any) => 
            !(childNodes.some(n => n.id === l.source.id) && childNodes.some(n => n.id === l.target.id))
          );

          // Update links connected to the group node
          currentLinks.forEach((l: any) => {
            if (childNodes.some(n => n.id === l.source.id)) l.source = groupNode;
            if (childNodes.some(n => n.id === l.target.id)) l.target = groupNode;
          });

          // Update simulation
          this.updateSimulation(currentNodes, currentLinks);
        });

    } else { // Expand the group
      groupNode.isExpanded = true;

      // Position child nodes at parent location initially
      childNodes.forEach(child => {
        child.x = (groupNode.x || 0) + (Math.random() - 0.5) * 20;
        child.y = (groupNode.y || 0) + (Math.random() - 0.5) * 20;
        child.vx = 0;
        child.vy = 0;
      });

      // Add child nodes back to simulation
      currentNodes = [...currentNodes, ...childNodes];

      // Re-add internal links and update links connected to the group node
      currentLinks = [...currentLinks, ...childLinks];
      currentLinks.forEach((l: any) => {
        if (l.source.id === groupNode.id && childNodes.some(n => n.id === l.target.id)) l.source = l.target;
        if (l.target.id === groupNode.id && childNodes.some(n => n.id === l.source.id)) l.target = l.source;
      });

      // Update simulation with explosion effect
      this.updateSimulation(currentNodes, currentLinks, true);
    }
  }

  // New: Custom force for clustering
  private forceCluster() {
    let nodes: any[];
    const strength = 0.1; // Adjust strength as needed

    function force(alpha: number) {
      const centroids = new Map<string, { x: number, y: number, count: number }>();

      // Calculate centroid for each group
      nodes.forEach(node => {
        if (node.parentGroupId) {
          let centroid = centroids.get(node.parentGroupId);
          if (!centroid) {
            centroid = { x: 0, y: 0, count: 0 };
            centroids.set(node.parentGroupId, centroid);
          }
          centroid.x += node.x;
          centroid.y += node.y;
          centroid.count++;
        }
      });

      centroids.forEach(centroid => {
        centroid.x /= centroid.count;
        centroid.y /= centroid.count;
      });

      // Apply force towards centroid
      nodes.forEach(node => {
        if (node.parentGroupId) {
          const centroid = centroids.get(node.parentGroupId);
          if (centroid) {
            node.vx -= (node.x - centroid.x) * alpha * strength;
            node.vy -= (node.y - centroid.y) * alpha * strength;
          }
        }
      });
    }

    force.initialize = (_: any[]) => nodes = _;

    return force;
  }

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      'class': '#4ecdc4',
      'struct': '#4ecdc4',
      'function': '#ff6b6b',
      'namespace': '#51cf66',
      'variable': '#ffd93d',
      'enum': '#6c5ce7',
      'language-group': '#8b0a8c',
      'module-group': '#6a0572',
      'namespace-group': '#8d0572'
    };
    return colors[type] || '#888';
  }

  // Update label visibility based on zoom level for semantic zooming
  private updateLabelVisibility(scale: number) {
    const g = (this as any)._g;
    if (!g) return;

    g.selectAll('.node text')
      .style('opacity', (d: any) => {
        // Progressive disclosure based on node type and zoom level
        if (d.type === 'language-group') return 1;
        if (d.type === 'module-group') return Math.min(1, scale * 0.8);
        if (d.type === 'namespace-group') return Math.min(1, scale * 0.6);
        return Math.min(1, Math.max(0, (scale - 0.5) * 2));
      })
      .style('font-size', (d: any) => {
        let baseSize = 8;
        if (d.type === 'language-group') baseSize = 14;
        else if (d.type === 'module-group') baseSize = 12;
        else if (d.type === 'namespace-group') baseSize = 10;
        
        const scaledSize = baseSize + Math.log(d.size || 1) * 0.5;
        return `${Math.min(18, scaledSize * Math.sqrt(scale))}px`;
      });
  }

  private selectNode(node: GraphNode) {
    this.selectedNode = node.id;
    stateService.setState('selectedNodeId', node.id); // Publish selected node ID

    // Update node details
    const detailsCard = this.shadow.getElementById('nodeDetailsCard');
    const details = this.shadow.getElementById('nodeDetails');
    
    if (detailsCard && details) {
      detailsCard.style.display = 'block';
      
      // Find connections using hierarchicalGraphData
      const connections = this.hierarchicalGraphData?.edges.filter(
        e => e.source === node.id || e.target === node.id
      ) || [];
      
      details.innerHTML = `
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          <div class="node-type">${node.type}${node.namespace ? ` • ${node.namespace}` : ''}</div>
        </div>
        
        <div class="node-actions">
          <button class="action-btn impact-btn" data-node-id="${node.id}">
            🌊 Analyze Impact
          </button>
          <button class="action-btn flow-btn" data-node-id="${node.id}">
            🔄 View Code Flow
          </button>
        </div>
        
        <h4>Connections (${connections.length})</h4>
        <div class="connections-list">
          ${connections.map(conn => {
            const otherNodeId = conn.source === node.id ? conn.target : conn.source;
            const otherNode = this.hierarchicalGraphData?.nodes.find(n => n.id === otherNodeId);
            return otherNode ? `
              <div class="connection-item" data-node="${otherNode.id}">
                <span class="connection-name">${otherNode.name}</span>
                <span class="connection-type">${conn.type}</span>
              </div>
            ` : '';
          }).join('')}
        </div>
      `;
      
      // Add click handlers for action buttons
      const impactBtn = details.querySelector('.impact-btn');
      if (impactBtn) {
        impactBtn.addEventListener('click', () => {
          // Navigate to impact visualization
          const routerService = (window as any).dashboardServices?.router;
          if (routerService) {
            routerService.navigate('/impact');
          }
        });
      }
      
      const flowBtn = details.querySelector('.flow-btn');
      if (flowBtn) {
        flowBtn.addEventListener('click', () => {
          // Navigate to code flow
          const routerService = (window as any).dashboardServices?.router;
          if (routerService) {
            routerService.navigate('/code-flow');
          }
        });
      }
      
      // Add click handlers for connections
      details.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const nodeId = (e.currentTarget as HTMLElement).getAttribute('data-node');
          const node = this.hierarchicalGraphData?.nodes.find(n => n.id === nodeId);
          if (node) this.selectNode(node);
        });
      });
    }
    
    // Highlight node and connections in graph with smooth transitions
    this.highlightNode(node.id);

    // Center and zoom to the selected node
    if ((this as any)._svg && (this as any)._g && (this as any)._zoom && node.x !== undefined && node.y !== undefined) {
      const d3 = window.d3;
      const graphContainer = this.shadow.getElementById('relationshipGraph');
      if (graphContainer) {
        const transform = d3.zoomIdentity
          .translate(graphContainer.clientWidth / 2, graphContainer.clientHeight / 2)
          .scale(2) // Zoom in to 2x
          .translate(-node.x, -node.y);

        d3.select((this as any)._svg)
          .transition()
          .duration(750)
          .call((this as any)._zoom.transform, 
            transform);
      }
    }
  }

  private highlightNode(nodeId: string) {
    if (!window.d3) return;
    
    const d3 = window.d3;
    const g = (this as any)._g;
    
    // Reset all highlights
    g.selectAll('.node')
      .classed('highlighted', false);
    g.selectAll('.link')
      .classed('highlighted', false);
    
    // Highlight selected node
    g.selectAll('.node')
      .filter((d: any) => d.id === nodeId)
      .classed('highlighted', true);
    
    // Highlight connected links
    g.selectAll('.link')
      .filter((d: any) => {
        const sourceId = typeof d.source === 'string' ? d.source : (d.source as any)?.id;
        const targetId = typeof d.target === 'string' ? d.target : (d.target as any)?.id;
        return sourceId === nodeId || targetId === nodeId;
      })
      .classed('highlighted', true);

    // Apply transitions to opacity changes
    g.selectAll('.node')
      .transition().duration(200)
      .style('opacity', (d: any) => {
        if (d.id === nodeId) return 1; // Selected node fully visible
        
        // Check if node is connected to selected node
        const isConnected = this.hierarchicalGraphData?.edges.some(e => {
          const sourceId = typeof e.source === 'string' ? e.source : (e.source as any)?.id;
          const targetId = typeof e.target === 'string' ? e.target : (e.target as any)?.id;
          return (sourceId === nodeId && targetId === d.id) || (targetId === nodeId && sourceId === d.id);
        });
        
        return isConnected ? 1 : 0.2; // Connected nodes visible, others dimmed
      });

    g.selectAll('.link')
      .transition().duration(200)
      .style('opacity', (d: any) => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source?.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target?.id;
        return (sourceId === nodeId || targetId === nodeId) ? 1 : 0.1; // Connected links visible, others dimmed
      });
  }

  // D3 drag handlers
  private dragstarted(event: any, d: any) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: any, d: any) {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragended(event: any, d: any) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Public methods for controls
  resetZoom() {
    if ((this as any)._svg && (this as any)._zoomBehavior) {
      const d3 = window.d3;
      d3.select((this as any)._svg)
        .transition()
        .duration(750)
        .call((this as any)._zoomBehavior.transform, d3.zoomIdentity);
    }
  }

  toggleForce() {
    if (this.simulation) {
      if (this.simulation.alpha() > 0) {
        this.simulation.stop();
      } else {
        this.simulation.alpha(1).restart();
      }
    }
  }

  centerGraph() {
    if ((this as any)._svg && (this as any)._g && (this as any)._zoomBehavior) {
      const svg = (this as any)._svg.node();
      const g = (this as any)._g;
      
      // Get the bounding box of all content
      const bounds = g.node().getBBox();
      
      // Check if bounds are valid
      if (isNaN(bounds.x) || isNaN(bounds.y) || isNaN(bounds.width) || isNaN(bounds.height) || 
          bounds.width === 0 || bounds.height === 0) {
        console.warn('Invalid bounds for centering graph');
        return;
      }
      
      const fullWidth = svg.clientWidth;
      const fullHeight = svg.clientHeight;
      const width = bounds.width;
      const height = bounds.height;
      const midX = bounds.x + width / 2;
      const midY = bounds.y + height / 2;
      
      const scale = Math.min(fullWidth / width, fullHeight / height) * 0.8;
      const translateX = fullWidth / 2 - scale * midX;
      const translateY = fullHeight / 2 - scale * midY;
      
      const d3 = window.d3;
      const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
      
      d3.select((this as any)._svg)
        .transition()
        .duration(750)
        .call((this as any)._zoomBehavior.transform, transform);
    }
  }

  /**
   * Handle filter change events
   */
  private handleFilterChange(event: CustomEvent) {
    this.currentFilters = event.detail;
    this.applyFilters();
  }

  /**
   * Apply filters to the graph data
   */
  private applyFilters() {
    if (!this.hierarchicalGraphData || !this.currentFilters) {
      this.filteredGraphData = this.hierarchicalGraphData;
      return;
    }

    const filters = this.currentFilters;
    
    // Filter nodes
    const filteredNodes = this.hierarchicalGraphData.nodes.filter(node => {
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
      const nodeEdgeCount = this.hierarchicalGraphData!.edges.filter(e => 
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
    const filteredEdges = this.hierarchicalGraphData.edges.filter(edge => {
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

    this.filteredGraphData = {
      nodes: filteredNodes,
      edges: filteredEdges
    };

    // Re-initialize the graph with filtered data
    if (this.simulation) {
      this.updateGraphWithFilteredData();
    }
  }

  /**
   * Update the graph visualization with filtered data
   */
  private async updateGraphWithFilteredData() {
    if (!this.filteredGraphData || !window.d3) return;

    const d3 = window.d3;
    const g = (this as any)._g;
    
    if (!g) return;

    // Update simulation with filtered data
    this.simulation.nodes(this.filteredGraphData.nodes);
    this.simulation.force('link').links(this.filteredGraphData.edges);

    // Update nodes
    const nodeSelection = g.selectAll('.node')
      .data(this.filteredGraphData.nodes, (d: any) => d.id);

    // Remove filtered out nodes
    nodeSelection.exit()
      .transition().duration(500)
      .style('opacity', 0)
      .remove();

    // Update links
    const linkSelection = g.selectAll('.link')
      .data(this.filteredGraphData.edges, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);

    // Remove filtered out links
    linkSelection.exit()
      .transition().duration(500)
      .style('opacity', 0)
      .remove();

    // Restart simulation
    this.simulation.alpha(0.3).restart();
  }


  // Helper methods for multi-language support
  private detectLanguageFromNode(node: GraphNode): string {
    // First check if language is already set
    if (node.language) {
      return node.language;
    }

    // Try to detect from file path if available
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
      };
      return languageMap[ext || ''] || 'unknown';
    }

    // Default fallback
    return 'unknown';
  }

  private getLanguageDisplayName(language: string): string {
    const displayNames: Record<string, string> = {
      'cpp': 'C++',
      'python': 'Python',
      'typescript': 'TypeScript',
      'javascript': 'JavaScript',
      'rust': 'Rust',
      'go': 'Go',
      'java': 'Java',
      'kotlin': 'Kotlin',
      'unknown': 'Unknown'
    };
    return displayNames[language] || language.charAt(0).toUpperCase() + language.slice(1);
  }

  private generateEdgeDetails(edge: GraphEdge, source?: GraphNode, target?: GraphNode): string {
    if (!source || !target) {
      return edge.type;
    }
    
    // Handle cross-language edges
    if (edge.isCrossLanguage && source.language && target.language) {
      const connectionType = this.getConnectionType(edge, source, target);
      return `${this.getLanguageDisplayName(source.language)} ${connectionType} ${this.getLanguageDisplayName(target.language)}: ${source.name} → ${target.name}`;
    }
    
    // Standard edge details
    const baseDetail = `${edge.type}: ${source.name} → ${target.name}`;
    
    // Add additional context based on edge type
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

  private getConnectionType(edge: GraphEdge, source: GraphNode, _target: GraphNode): string {
    // Determine the type of cross-language connection
    if (edge.spawnType) {
      return edge.spawnType;
    }
    
    if (source.languageFeatures?.spawn || source.languageFeatures?.spawnsPython) {
      return 'spawns';
    }
    
    switch (edge.type) {
      case 'calls':
        return 'calls';
      case 'imports':
        return 'imports';
      case 'spawns':
        return 'spawns';
      default:
        return edge.type;
    }
  }

  private formatModuleName(moduleId: string): string {
    // Extract meaningful name from module path
    const parts = moduleId.split('/');
    return parts[parts.length - 1] || moduleId;
  }

  // Update simulation with new nodes and links
  private updateSimulation(nodes: any[], links: any[], explode: boolean = false) {
    const d3 = window.d3;
    const g = (this as any)._g;

    // Update simulation data
    this.simulation.nodes(nodes);
    this.simulation.force('link').links(links);

    // Re-render nodes
    const nodeSelection = g.selectAll('.node')
      .data(nodes, (d: any) => d.id);

    // Exit selection - remove old nodes
    nodeSelection.exit()
      .transition()
      .duration(400)
      .style('opacity', 0)
      .remove();

    // Enter selection - add new nodes
    const newNodes = nodeSelection.enter().append('g')
      .attr('class', (d: any) => `node node-${d.type}`)
      .style('opacity', 0)
      .call(d3.drag()
        .on('start', this.dragstarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragended.bind(this)));

    // Add visual elements to new nodes
    this.styleNewNodes(newNodes);

    // Animate new nodes appearing
    newNodes
      .transition()
      .duration(600)
      .style('opacity', (d: any) => {
        if (d.type === 'language-group') return 0.6;
        if (d.type === 'module-group') return 0.7;
        if (d.type === 'namespace-group') return 0.8;
        return 1;
      });

    // Re-render links
    const linkSelection = g.selectAll('.link')
      .data(links, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);

    linkSelection.exit()
      .transition()
      .duration(300)
      .style('opacity', 0)
      .remove();

    const newLinks = linkSelection.enter()
      .insert('line', '.node')
      .attr('class', 'link')
      .style('opacity', 0);

    newLinks
      .transition()
      .duration(500)
      .style('opacity', (d: any) => {
        if (d.type === 'aggregated') return 0.3;
        if (d.isCrossLanguage) return 0.7;
        return 0.5;
      });

    // Apply explosion force if expanding
    if (explode) {
      this.simulation.force('explosion', d3.forceRadial(100, g.attr('width') / 2, g.attr('height') / 2)
        .strength((d: any) => d.parentGroupId === nodes[nodes.length - 1].parentGroupId ? 0.8 : 0));
      
      setTimeout(() => {
        this.simulation.force('explosion', null);
      }, 300);
    }

    // Restart simulation
    this.simulation.alpha(1).restart();
  }

  // Style new nodes with all visual attributes
  private styleNewNodes(selection: any) {
    // Add circles
    selection.append('circle')
      .attr('r', (d: any) => {
        if (d.type === 'language-group') {
          return Math.max(30, Math.min(70, 30 + Math.sqrt(d.metrics?.childCount || 1) * 5));
        }
        if (d.type === 'module-group') {
          return Math.max(25, Math.min(50, 25 + Math.sqrt(d.metrics?.childCount || 1) * 4));
        }
        if (d.type === 'namespace-group') {
          return Math.max(20, Math.min(40, 20 + Math.sqrt(d.metrics?.childCount || 1) * 3));
        }
        const sizeMetric = d.metrics?.loc || d.metrics?.cyclomaticComplexity || d.size || 10;
        return Math.max(5, Math.min(25, Math.sqrt(sizeMetric) * 2));
      })
      .attr('fill', (d: any) => this.getNodeColor(d.type))
      .attr('stroke', (d: any) => d.type.includes('-group') ? 'rgba(147, 112, 219, 0.8)' : 'none')
      .attr('stroke-width', (d: any) => {
        if (d.type === 'language-group') return 3;
        if (d.type === 'module-group') return 2;
        if (d.type === 'namespace-group') return 1.5;
        return 0;
      })
      .attr('stroke-dasharray', (d: any) => {
        if (d.type === 'language-group') return '5,5';
        if (d.type === 'module-group') return '3,3';
        return 'none';
      })
      .style('filter', (d: any) => {
        if (d.type === 'language-group') {
          return 'drop-shadow(0 0 12px rgba(139, 10, 140, 0.6))';
        }
        if (d.type.includes('-group')) {
          return 'drop-shadow(0 0 8px rgba(147, 112, 219, 0.4))';
        }
        return 'none';
      });

    // Add labels
    selection.append('text')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('font-size', (d: any) => {
        const currentScale = this._zoom?.k || 1;
        let baseSize = 8;
        if (d.type === 'language-group') baseSize = 14;
        else if (d.type === 'module-group') baseSize = 12;
        else if (d.type === 'namespace-group') baseSize = 10;
        
        const scaledSize = baseSize + Math.log(d.size || 1) * 0.5;
        return `${Math.min(18, scaledSize * Math.sqrt(currentScale))}px`;
      })
      .style('opacity', (d: any) => {
        const currentScale = this._zoom?.k || 1;
        if (d.type === 'language-group') return 1;
        if (d.type === 'module-group') return Math.min(1, currentScale * 0.8);
        if (d.type === 'namespace-group') return Math.min(1, currentScale * 0.6);
        return Math.min(1, Math.max(0, (currentScale - 0.5) * 2));
      })
      .style('font-weight', (d: any) => d.type.includes('-group') ? 'bold' : 'normal')
      .style('text-shadow', (d: any) => 
        d.type.includes('-group') ? '0 0 4px rgba(0,0,0,0.8)' : 'none'
      );

    // Add click handlers
    selection.on('click', (event: any, d: any) => {
      if (d.type === 'language-group' || d.type === 'module-group' || d.type === 'namespace-group') {
        this.toggleGroupExpansion(d);
      } else {
        this.selectNode(d);
      }
    });
  }

  private formatNamespaceName(namespace: string): string {
    // Extract last component of namespace
    const parts = namespace.split('::');
    return parts[parts.length - 1] || namespace;
  }

  private createGroupEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
    const groupEdges: GraphEdge[] = [];
    const edgeMap = new Map<string, { count: number; types: Set<string> }>();

    // Aggregate edges between groups
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

    // Create aggregated edges
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
}

// Extend window interface for D3
declare global {
  interface Window {
    d3: any;
  }
}

defineComponent('relationship-graph', RelationshipGraph);