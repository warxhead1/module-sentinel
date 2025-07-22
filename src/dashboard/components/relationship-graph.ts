/**
 * RelationshipGraph - Refactored to use GraphVisualizationEngine
 * 
 * This component now uses the modular graph visualization engine while
 * preserving all existing functionality from the original implementation.
 */

import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';
import { GraphVisualizationEngine, GraphConfig, GraphEventCallbacks, GraphData } from '../utils/graph-viz-engine.js';
import { GraphDataProcessor, GraphFilters } from '../utils/graph-data-processor.js';
import './graph-filter-sidebar.js';

import { GraphNode, GraphEdge } from '../../shared/types/api';

export class RelationshipGraph extends DashboardComponent {
  private graphData: GraphData | null = null;
  private hierarchicalGraphData: GraphData | null = null;
  private selectedNode: string | null = null;
  private currentFilters: GraphFilters | null = null;
  
  // New modular components
  private visualizationEngine: GraphVisualizationEngine | null = null;
  private dataProcessor: GraphDataProcessor = new GraphDataProcessor();

  async loadData(): Promise<void> {
    try {
      const response = await dataService.getRelationships();
      
      // Transform raw relationship data to graph format using the processor
      this.graphData = this.dataProcessor.transformRelationshipsToGraph(response);
      
      // Create hierarchical data structure
      this.hierarchicalGraphData = this.dataProcessor.createHierarchicalGraphData(this.graphData);
      
      // Initialize visualization after data is loaded
      this.render();
      await this.initializeVisualizationEngine();
      
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
    if (this.visualizationEngine) {
      this.visualizationEngine.destroy();
    }
  }

  /**
   * Initialize the visualization engine with configuration and callbacks
   */
  private async initializeVisualizationEngine(): Promise<void> {
    if (!this.hierarchicalGraphData) {
      console.error('No graph data available for visualization');
      return;
    }

    const container = this.shadow.getElementById('relationshipGraph');
    if (!container) {
      console.error('Graph container not found');
      return;
    }

    // Configuration for the visualization engine
    const config: Partial<GraphConfig> = {
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      type: 'force-directed',
      enableZoom: true,
      enableDrag: true,
      enableAnimation: true,
      theme: 'dark',
      renderingEngine: 'svg',
      simulation: {
        strength: -300,
        linkDistance: 100,
        center: { x: (container.clientWidth || 800) / 2, y: (container.clientHeight || 600) / 2 },
        collisionRadius: 30
      },
      clustering: {
        enabled: true,
        strength: 0.1
      },
      semanticZooming: {
        enabled: true,
        thresholds: { low: 0.5, medium: 1.0, high: 2.0 }
      }
    };

    // Event callbacks for user interactions
    const callbacks: GraphEventCallbacks = {
      onNodeClick: (node: GraphNode, event: Event) => {
        if (node.type.includes('-group')) {
          this.toggleGroupExpansion(node);
        } else {
          this.selectNode(node);
        }
      },
      onNodeHover: (node: GraphNode | null, event: Event) => {
        // Hover logic is handled by the interaction handler
      },
      onEdgeClick: (edge: GraphEdge, event: Event) => {
        console.log('Edge clicked:', edge);
      },
      onEdgeHover: (edge: GraphEdge | null, event: Event) => {
        // Edge hover logic
      },
      onZoom: (transform) => {
        // Handle zoom events if needed
      },
      onSimulationTick: (nodes, edges) => {
        // Handle simulation tick if needed
      }
    };

    // Create and initialize the visualization engine
    this.visualizationEngine = new GraphVisualizationEngine(container, config, callbacks);
    
    // Load the data into the engine
    this.visualizationEngine.setData(this.hierarchicalGraphData);
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
          <div id="relationshipGraph"></div>
          
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

    return this.dataProcessor.calculateStats(this.hierarchicalGraphData);
  }

  private selectNode(node: GraphNode) {
    this.selectedNode = node.id;
    stateService.setState('selectedNodeId', node.id);

    // Update node details
    const detailsCard = this.shadow.getElementById('nodeDetailsCard');
    const details = this.shadow.getElementById('nodeDetails');
    
    if (detailsCard && details) {
      detailsCard.style.display = 'block';
      
      // Find connections
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
          const routerService = (window as any).dashboardServices?.router;
          if (routerService) {
            routerService.navigate('/impact');
          }
        });
      }
      
      const flowBtn = details.querySelector('.flow-btn');
      if (flowBtn) {
        flowBtn.addEventListener('click', () => {
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
          const clickedNode = this.hierarchicalGraphData?.nodes.find(n => n.id === nodeId);
          if (clickedNode) this.selectNode(clickedNode);
        });
      });
    }
    
    // Highlight node in the visualization
    if (this.visualizationEngine) {
      this.visualizationEngine.highlightElements([node.id]);
      this.visualizationEngine.zoomToNode(node.id, 2);
    }
  }

  private toggleGroupExpansion(groupNode: GraphNode) {
    console.log('Toggle group expansion for:', groupNode.name);
    // This functionality would need to be implemented in the visualization engine
    // For now, just log the action
  }

  /**
   * Handle filter change events
   */
  private handleFilterChange(event: CustomEvent) {
    this.currentFilters = event.detail;
    this.applyFilters();
  }

  /**
   * Apply filters to the graph data using the visualization engine
   */
  private applyFilters() {
    if (!this.hierarchicalGraphData || !this.currentFilters || !this.visualizationEngine) {
      return;
    }

    this.visualizationEngine.applyFilters(this.currentFilters);
  }

  // Public methods for controls (called from HTML buttons)
  resetZoom() {
    this.visualizationEngine?.resetZoom();
  }

  toggleForce() {
    this.visualizationEngine?.toggleSimulation();
  }

  centerGraph() {
    this.visualizationEngine?.centerGraph();
  }
}

defineComponent('relationship-graph', RelationshipGraph); 