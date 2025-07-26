/**
 * RelationshipGraph - Refactored to use GraphVisualizationEngine
 *
 * This component now uses the modular graph visualization engine while
 * preserving all existing functionality from the original implementation.
 */

import { DashboardComponent, defineComponent } from "./base-component.js";
import { dataService } from "../services/data.service.js";
import { stateService } from "../services/state.service.js";
import {
  GraphVisualizationEngine,
  GraphConfig,
  GraphEventCallbacks,
  GraphData,
} from "../utils/graph-viz-engine.js";
import {
  GraphDataProcessor,
  GraphFilters,
} from "../utils/graph-data-processor.js";
import "./graph-filter-sidebar.js";
import { MultiLanguageDetector } from "../utils/multi-language-detector.js";
import { SymbolSelectorModal } from "./symbol-selector-modal.js";
import "./navigation-actions.js";
import { GraphInitializationHelper } from "./graph-initialization-fix.js";
import { GraphGroupManager } from "../utils/graph-group-manager.js";
import { enhancedNodeTooltip } from "./enhanced-node-tooltip.js";
import { PatternNodeCategorizer } from "../services/pattern-node-categorizer.js";
import { PatternLegend, PatternFilter } from "./pattern-legend.js";
import {
  PatternFilterPanel,
  AdvancedPatternFilter,
} from "./pattern-filter-panel.js";

import { GraphNode, GraphEdge } from "../../shared/types/api";

export class RelationshipGraph extends DashboardComponent {
  private graphData: GraphData | null = null;
  private hierarchicalGraphData: GraphData | null = null;
  private selectedNode: string | null = null;
  private currentFilters: GraphFilters | null = null;

  // New modular components
  private visualizationEngine: GraphVisualizationEngine | null = null;
  private dataProcessor: GraphDataProcessor = new GraphDataProcessor();
  private groupManager: GraphGroupManager = new GraphGroupManager();

  // Language support
  private languageDetector: MultiLanguageDetector = new MultiLanguageDetector();
  private symbolSelector: SymbolSelectorModal | null = null;
  private languageStats: Map<string, number> = new Map();
  private crossLanguageEdges: Set<string> = new Set();

  // Group expansion state
  private expandedGroups: Set<string> = new Set();

  // Pattern-based categorization components
  private patternCategorizer: PatternNodeCategorizer =
    new PatternNodeCategorizer();
  private patternLegend: PatternLegend | null = null;
  private patternFilterPanel: PatternFilterPanel | null = null;
  private currentPatternFilters: AdvancedPatternFilter | null = null;

  async loadData(): Promise<void> {
    try {
      console.log("🔄 Loading relationship data...");
      const response = await dataService.getRelationships();

      console.log("📊 Raw response:", response);

      // Check if response has data
      if (!response || (Array.isArray(response) && response.length === 0)) {
        console.warn("⚠️ No relationship data received");
        this._error = "No relationship data available";
        this.render();
        return;
      }

      // Transform raw relationship data to graph format using the processor
      this.graphData =
        this.dataProcessor.transformRelationshipsToGraph(response);
      console.log("🔄 Transformed graph data:", this.graphData);

      // Add language detection to graph data
      this.enhanceGraphDataWithLanguages(this.graphData);

      // Apply pattern categorization to nodes
      this.applyPatternCategorization(this.graphData);

      // Create hierarchical data structure
      this.hierarchicalGraphData =
        this.dataProcessor.createHierarchicalGraphData(this.graphData);
      console.log("📊 Hierarchical data:", {
        nodes: this.hierarchicalGraphData?.nodes?.length || 0,
        edges: this.hierarchicalGraphData?.edges?.length || 0,
      });

      // Initialize group manager with nodes
      this.groupManager.initializeGroups(this.hierarchicalGraphData.nodes);

      // Initialize all groups as expanded (done by group manager)
      this.hierarchicalGraphData?.nodes.forEach((node) => {
        if (node.type?.includes("-group")) {
          this.expandedGroups.add(node.id);
          node.isExpanded = true;
        }
      });

      // Calculate language statistics
      this.calculateLanguageStatistics();

      // Initialize visualization after data is loaded
      this._loading = false;
      this.render();

      // Wait for render to complete before initializing visualization
      await new Promise((resolve) => setTimeout(resolve, 0));
      await this.initializeVisualizationEngine();

      // Initialize pattern components after visualization engine
      this.initializePatternComponents();
    } catch (error) {
      console.error("❌ Error loading relationship data:", error);
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  connectedCallback() {
    super.connectedCallback();

    // Listen for filter changes
    this.addEventListener("filter-changed", ((event: CustomEvent) => {
      this.handleFilterChange(event);
    }) as EventListener);

    // Subscribe to filter state changes
    stateService.subscribe("graphFilters", (filters: GraphFilters) => {
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
    // Try multiple times to find the container
    let container = this.shadow.getElementById("relationshipGraph");
    let attempts = 0;

    while (!container && attempts < 5) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      container = this.shadow.getElementById("relationshipGraph");
      attempts++;
    }

    if (!container) {
      console.error("Graph container not found after multiple attempts");
      // Try querySelector as fallback
      container = this.shadow.querySelector(
        "#relationshipGraph"
      ) as HTMLElement;
      if (!container) {
        console.error("Graph container still not found with querySelector");
        return;
      }
    }

    console.log("✅ Found graph container:", container);

    // Show loading state while preparing
    GraphInitializationHelper.createLoadingPlaceholder(container);

    if (
      !this.hierarchicalGraphData ||
      !this.hierarchicalGraphData.nodes.length
    ) {
      console.warn("No graph data available for visualization");
      GraphInitializationHelper.handleEmptyData(container, "relationships");
      return;
    }

    console.log("📊 Graph data ready:", {
      nodes: this.hierarchicalGraphData.nodes.length,
      edges: this.hierarchicalGraphData.edges.length,
    });

    // Ensure container has dimensions
    const dimensions = await GraphInitializationHelper.ensureContainerReady(
      container
    );

    // Configuration for the visualization engine
    const config: Partial<GraphConfig> = {
      width: dimensions.width,
      height: dimensions.height,
      type: "force-directed",
      enableZoom: true,
      enableDrag: true,
      enableAnimation: true,
      theme: "dark",
      renderingEngine: "svg",
      simulation: {
        strength: -300,
        linkDistance: 100,
        center: {
          x: (container.clientWidth || 800) / 2,
          y: (container.clientHeight || 600) / 2,
        },
        collisionRadius: 30,
      },
      clustering: {
        enabled: true,
        strength: 0.1,
      },
      semanticZooming: {
        enabled: true,
        thresholds: { 
          overview: 0.3,
          structure: 0.7, 
          detail: 1.5,
          inspection: 2.5
        },
        progressiveDisclosure: {
          hideImportsExports: true,
          hidePrivateMembers: true,
          hideParameters: true,
          hideMetrics: true
        }
      },
    };

    // Event callbacks for user interactions
    const callbacks: GraphEventCallbacks = {
      onNodeClick: (node: GraphNode, event: Event) => {
        if (node.type.includes("-group")) {
          this.toggleGroupExpansion(node);
        } else {
          this.selectNode(node);
        }
      },
      onNodeHover: (node: GraphNode | null, event: Event) => {
        // Enhanced hover with tooltips and highlighting
        if (node && event instanceof MouseEvent) {
          // Show enhanced tooltip
          enhancedNodeTooltip.show(node, event);
          // Highlight cross-language connections
          this.highlightCrossLanguageConnections(node);
        } else {
          // Hide tooltip and clear highlights
          enhancedNodeTooltip.hide();
          this.clearLanguageHighlights();
        }
      },
      onEdgeClick: (edge: GraphEdge, event: Event) => {
        console.log("Edge clicked:", edge);
        if ((edge as any).isCrossLanguage) {
          console.log(
            `Cross-language connection: ${(edge as any).sourceLanguage} → ${
              (edge as any).targetLanguage
            }`
          );
        }
      },
      onEdgeHover: (edge: GraphEdge | null, event: Event) => {
        // Edge hover logic
      },
      onZoom: (transform) => {
        // Handle zoom events if needed
      },
      onSimulationTick: (nodes, edges) => {
        // Handle simulation tick if needed
      },
    };

    // Create and initialize the visualization engine
    this.visualizationEngine = new GraphVisualizationEngine(
      container,
      config,
      callbacks
    );

    // Load the data into the engine
    this.visualizationEngine.setData(this.hierarchicalGraphData);

    // Force initial render and start simulation - this ensures nodes appear immediately
    setTimeout(() => {
      console.log("🎯 Starting force simulation...");
      if (this.visualizationEngine) {
        // Start the force simulation
        this.visualizationEngine.startSimulation();

        // Also trigger a render to ensure everything is displayed
        this.visualizationEngine.render();
      }
    }, 100);
  }

  render() {
    console.log(
      "🎨 Rendering relationship graph, loading:",
      this._loading,
      "error:",
      this._error
    );

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
          position: relative;
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
        
        /* Language badge styles */
        .language-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 600;
          margin-right: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          vertical-align: middle;
        }
        
        .lang-cpp { background: #0055cc; color: white; }
        .lang-python { background: #3776ab; color: white; }
        .lang-typescript { background: #007acc; color: white; }
        .lang-javascript { background: #f7df1e; color: black; }
        .lang-rust { background: #ce422b; color: white; }
        .lang-go { background: #00add8; color: white; }
        .lang-java { background: #ed8b00; color: white; }
        .lang-unknown { background: #666; color: white; }
        
        /* Cross-language highlighting */
        .cross-language-edge {
          stroke: #feca57 !important;
          stroke-width: 3px !important;
          opacity: 0.9 !important;
        }
        
        .cross-language-node {
          stroke: #feca57 !important;
          stroke-width: 2px !important;
        }
        
        /* Language statistics */
        .language-stats {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius);
          padding: 16px;
          margin-bottom: 20px;
        }
        
        .language-stats h4 {
          margin: 0 0 12px 0;
          color: var(--text-primary);
          font-size: 1rem;
        }
        
        .language-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .language-item:last-child {
          border-bottom: none;
        }
        
        .language-count {
          color: var(--primary-accent);
          font-weight: 600;
        }
      </style>
      
      <div class="page-header">
        <h1>Code Relationships</h1>
        <p class="subtitle">Interactive visualization of code dependencies and connections</p>
      </div>
      
      <navigation-actions></navigation-actions>
      
      <div class="graph-container">
        <!-- Filter Sidebar -->
        <graph-filter-sidebar></graph-filter-sidebar>
        
        <!-- Main Graph Canvas -->
        <div class="graph-canvas">
          <div class="graph-controls">
            <button class="control-btn" onclick="this.getRootNode().host.openSymbolSelector()">🔍 Find Symbol</button>
            <button class="control-btn" onclick="this.getRootNode().host.resetZoom()">Reset Zoom</button>
            <button class="control-btn" onclick="this.getRootNode().host.toggleForce()">Toggle Force</button>
            <button class="control-btn" onclick="this.getRootNode().host.centerGraph()">Center</button>
            <select class="control-btn" onchange="this.getRootNode().host.changeLayout(this.value)" style="padding: 8px;">
              <option value="force-directed">🌐 Force</option>
              <option value="hierarchical">📊 Hierarchical</option>
              <option value="circular">⭕ Circular</option>
              <option value="tree">🌳 Tree</option>
            </select>
          </div>
          <div id="relationshipGraph"></div>
          
          <!-- Pattern Legend Container -->
          <div id="pattern-legend-container"></div>
          
          <!-- Pattern Filter Panel Container -->
          <div id="pattern-filter-container"></div>
          
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
          
          ${this.renderLanguageStatistics()}
          
          <div class="card" id="nodeDetailsCard" style="display: ${
            this.selectedNode ? "block" : "none"
          };">
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
    stateService.setState("selectedNodeId", node.id);

    // Update state with full symbol information
    stateService.setState("selectedSymbol", {
      id: parseInt(node.id),
      name: node.name,
      qualified_name: node.name,
      kind: node.type || "unknown",
      namespace: node.namespace,
      file_path: undefined,
      language: node.language,
    });

    // Update node details
    const detailsCard = this.shadow.getElementById("nodeDetailsCard");
    const details = this.shadow.getElementById("nodeDetails");

    if (detailsCard && details) {
      detailsCard.style.display = "block";

      // Find connections
      const connections =
        this.hierarchicalGraphData?.edges.filter(
          (e) => e.source === node.id || e.target === node.id
        ) || [];

      details.innerHTML = `
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          <div class="node-type">${node.type}${
        node.namespace ? ` • ${node.namespace}` : ""
      }</div>
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
          ${connections
            .map((conn) => {
              const otherNodeId =
                conn.source === node.id ? conn.target : conn.source;
              const otherNode = this.hierarchicalGraphData?.nodes.find(
                (n) => n.id === otherNodeId
              );
              return otherNode
                ? `
              <div class="connection-item" data-node="${otherNode.id}">
                <span class="connection-name">${otherNode.name}</span>
                <span class="connection-type">${conn.type}</span>
              </div>
            `
                : "";
            })
            .join("")}
        </div>
      `;

      // Add click handlers for action buttons
      const impactBtn = details.querySelector(".impact-btn");
      if (impactBtn) {
        impactBtn.addEventListener("click", () => {
          const routerService = (window as any).dashboardServices?.router;
          if (routerService) {
            routerService.navigate("/impact");
          }
        });
      }

      const flowBtn = details.querySelector(".flow-btn");
      if (flowBtn) {
        flowBtn.addEventListener("click", () => {
          const routerService = (window as any).dashboardServices?.router;
          if (routerService) {
            routerService.navigate("/code-flow");
          }
        });
      }

      // Add click handlers for connections
      details.querySelectorAll(".connection-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          const nodeId = (e.currentTarget as HTMLElement).getAttribute(
            "data-node"
          );
          const clickedNode = this.hierarchicalGraphData?.nodes.find(
            (n) => n.id === nodeId
          );
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
    console.log(
      "Toggle group expansion for:",
      groupNode.name,
      "type:",
      groupNode.type
    );

    // Toggle the expansion state
    const isExpanded = this.groupManager.toggleGroup(groupNode.id);
    groupNode.isExpanded = isExpanded;

    // Update the visualization with filtered data
    if (this.visualizationEngine && this.hierarchicalGraphData) {
      // Use the group manager to filter nodes and edges
      const { visibleNodes, visibleEdges } =
        this.groupManager.filterByGroupExpansion(
          this.hierarchicalGraphData.nodes,
          this.hierarchicalGraphData.edges
        );

      // Create filtered data
      const filteredData: GraphData = {
        nodes: visibleNodes,
        edges: visibleEdges,
      };

      // Update the visualization with filtered data
      this.visualizationEngine.setData(filteredData);

      // Update group node appearance to show expansion state
      setTimeout(() => {
        const svg = this.shadow.querySelector("#relationshipGraph svg");
        if (svg) {
          const groupNodeElement = svg.querySelector(
            `[data-node-id="${groupNode.id}"]`
          );
          if (groupNodeElement) {
            this.updateGroupNodeVisual(groupNodeElement, isExpanded);
          }
        }

        // Restart simulation to reorganize
        this.visualizationEngine?.startSimulation();
      }, 100);
    }
  }

  private updateGroupNodeVisual(element: Element, isExpanded: boolean) {
    // Add visual indicator for expansion state
    const indicator = isExpanded ? "▼" : "▶";

    // Try to update existing text or add new one
    let textElement = element.querySelector(".expansion-indicator");
    if (!textElement) {
      textElement = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      textElement.setAttribute("class", "expansion-indicator");
      textElement.setAttribute("x", "-25");
      textElement.setAttribute("y", "5");
      textElement.setAttribute("fill", "#4ecdc4");
      textElement.setAttribute("font-size", "14px");
      element.appendChild(textElement);
    }
    textElement.textContent = indicator;
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
    if (
      !this.hierarchicalGraphData ||
      !this.currentFilters ||
      !this.visualizationEngine
    ) {
      return;
    }

    this.visualizationEngine.applyFilters(this.currentFilters);
  }

  // Language enhancement methods
  private enhanceGraphDataWithLanguages(graphData: GraphData): void {
    // Add language information to nodes
    graphData.nodes.forEach((node) => {
      // Only detect language if it's not already set
      if (!(node as any).language) {
        const language = this.detectLanguageFromNode(node);
        (node as any).language = language;
      }
      (node as any).languageBadge = this.renderLanguageBadge((node as any).language);
    });

    // Detect cross-language edges
    graphData.edges.forEach((edge) => {
      const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
      const targetNode = graphData.nodes.find((n) => n.id === edge.target);

      if (sourceNode && targetNode) {
        const sourceLanguage = (sourceNode as any).language;
        const targetLanguage = (targetNode as any).language;
        const isCrossLanguage = sourceLanguage !== targetLanguage;

        (edge as any).isCrossLanguage = isCrossLanguage;
        (edge as any).sourceLanguage = sourceLanguage;
        (edge as any).targetLanguage = targetLanguage;

        if (isCrossLanguage) {
          this.crossLanguageEdges.add(`${edge.source}-${edge.target}`);
        }
      }
    });
  }

  private calculateLanguageStatistics(): void {
    this.languageStats.clear();

    if (!this.hierarchicalGraphData) return;

    this.hierarchicalGraphData.nodes.forEach((node) => {
      const language = (node as any).language || "unknown";
      this.languageStats.set(
        language,
        (this.languageStats.get(language) || 0) + 1
      );
    });
  }

  private detectLanguageFromNode(node: GraphNode): string {
    // Try to detect from file_path first
    if ((node as any).file_path) {
      return this.languageDetector.detectLanguageFromPath(
        (node as any).file_path
      );
    }

    // Try to detect from file property
    if ((node as any).file) {
      return this.languageDetector.detectLanguageFromPath((node as any).file);
    }

    // Fall back to type-based detection
    if (node.type === "module" && node.name) {
      if (node.name.endsWith(".py")) return "python";
      if (node.name.endsWith(".ts")) return "typescript";
      if (node.name.endsWith(".js")) return "javascript";
      if (node.name.endsWith(".cpp") || node.name.endsWith(".hpp"))
        return "cpp";
    }

    return "unknown";
  }

  private renderLanguageBadge(language: string): string {
    if (!language || language === "unknown") return "";
    return `<span class="language-badge lang-${language}">${language
      .substring(0, 3)
      .toUpperCase()}</span>`;
  }

  private getLanguageColor(language: string): string {
    const colors: Record<string, string> = {
      cpp: "#0055cc",
      python: "#3776ab",
      typescript: "#007acc",
      javascript: "#f7df1e",
      rust: "#ce422b",
      go: "#00add8",
      java: "#ed8b00",
      unknown: "#666",
    };
    return colors[language] || "#666";
  }

  private renderLanguageStatistics(): string {
    if (this.languageStats.size === 0) {
      return "";
    }

    const totalNodes = Array.from(this.languageStats.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const crossLanguageConnections = this.crossLanguageEdges.size;

    return `
      <div class="card">
        <h3>Language Distribution</h3>
        <div class="language-stats">
          ${Array.from(this.languageStats.entries())
            .sort(([, a], [, b]) => b - a)
            .map(
              ([language, count]) => `
              <div class="language-item">
                <div style="display: flex; align-items: center;">
                  ${this.renderLanguageBadge(language)}
                  <span>${language}</span>
                </div>
                <span class="language-count">${count} (${(
                (count / totalNodes) *
                100
              ).toFixed(1)}%)</span>
              </div>
            `
            )
            .join("")}
        </div>
        
        <div class="stats-grid" style="margin-top: 16px;">
          <div class="stat-item">
            <div class="stat-value">${this.languageStats.size}</div>
            <div class="stat-label">Languages</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${crossLanguageConnections}</div>
            <div class="stat-label">Cross-Language</div>
          </div>
        </div>
      </div>
    `;
  }

  // Symbol selector integration
  private initializeSymbolSelector(): void {
    if (!this.symbolSelector) {
      this.symbolSelector = SymbolSelectorModal.getInstance();
    }
  }

  public openSymbolSelector(): void {
    this.initializeSymbolSelector();
    if (this.symbolSelector) {
      this.symbolSelector.show({
        title: "Select Symbol for Relationship Analysis",
        onSelect: (symbol) => {
          if (symbol && symbol.id) {
            // Center the graph on the selected symbol
            this.selectNodeById(symbol.id.toString());
          }
        },
      });
    }
  }

  private selectNodeById(nodeId: string): void {
    const node = this.hierarchicalGraphData?.nodes.find((n) => n.id === nodeId);
    if (node) {
      this.selectNode(node);
      // Zoom to the selected node
      this.visualizationEngine?.zoomToNode(nodeId, 2);
    }
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

  changeLayout(layoutType: 'force-directed' | 'hierarchical' | 'circular' | 'tree') {
    if (!this.visualizationEngine || !this.hierarchicalGraphData) return;
    
    // Update the engine's config with new layout type
    this.visualizationEngine.updateConfig({ type: layoutType });
    
    // Restart the visualization with the new layout
    this.visualizationEngine.startSimulation();
  }

  // Language-aware highlighting methods
  private highlightCrossLanguageConnections(node: GraphNode): void {
    if (!this.hierarchicalGraphData || !this.visualizationEngine) return;

    const nodeLanguage = (node as any).language;
    if (!nodeLanguage) return;

    // Find all edges connected to this node
    const connectedEdges = this.hierarchicalGraphData.edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id
    );

    // Highlight cross-language edges
    const crossLanguageEdgeIds: string[] = [];
    const crossLanguageNodeIds: string[] = [];

    connectedEdges.forEach((edge) => {
      if ((edge as any).isCrossLanguage) {
        crossLanguageEdgeIds.push(`edge-${edge.source}-${edge.target}`);

        // Highlight the connected node
        const otherNodeId = edge.source === node.id ? edge.target : edge.source;
        crossLanguageNodeIds.push(otherNodeId);
      }
    });

    // Apply highlighting through D3.js
    const svg = this.shadow.querySelector("#relationshipGraph svg");
    if (svg) {
      // Highlight cross-language edges
      crossLanguageEdgeIds.forEach((edgeId) => {
        const edgeElement = svg.querySelector(`[data-edge-id="${edgeId}"]`);
        if (edgeElement) {
          edgeElement.classList.add("cross-language-edge");
        }
      });

      // Highlight cross-language nodes
      crossLanguageNodeIds.forEach((nodeId) => {
        const nodeElement = svg.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeElement) {
          nodeElement.classList.add("cross-language-node");
        }
      });
    }
  }

  private clearLanguageHighlights(): void {
    const svg = this.shadow.querySelector("#relationshipGraph svg");
    if (svg) {
      // Remove cross-language highlighting classes
      svg.querySelectorAll(".cross-language-edge").forEach((element) => {
        element.classList.remove("cross-language-edge");
      });

      svg.querySelectorAll(".cross-language-node").forEach((element) => {
        element.classList.remove("cross-language-node");
      });
    }
  }

  /**
   * Apply pattern categorization to graph nodes
   */
  private applyPatternCategorization(graphData: GraphData): void {
    console.log("🎨 Applying pattern categorization to nodes...");

    if (!graphData.nodes) return;

    let categorizedCount = 0;
    graphData.nodes.forEach((node) => {
      const classification = this.patternCategorizer.categorizeNode(node);
      if (classification) {
        // Merge pattern classification into node
        if (!node.patterns) {
          node.patterns = {};
        }

        node.patterns.primaryPattern = classification.primaryPattern;
        node.patterns.secondaryPatterns = classification.secondaryPatterns;
        node.patterns.patternMetrics = classification.patternMetrics;

        categorizedCount++;
      }
    });
  }

  /**
   * Initialize pattern components (legend and filter panel)
   */
  private initializePatternComponents(): void {
    console.log("🎨 Initializing pattern components...");

    // Initialize pattern legend
    const legendContainer = this.shadow.getElementById(
      "pattern-legend-container"
    );
    if (legendContainer && this.hierarchicalGraphData) {
      this.patternLegend = new PatternLegend(
        legendContainer,
        this.visualizationEngine?.getThemeManager()!,
        this.patternCategorizer,
        {
          showStatistics: true,
          showHealthIndicators: true,
          showPatternIcons: true,
          collapsible: true,
          position: "top-right",
        }
      );

      // Update legend with current nodes
      this.patternLegend.updateNodes(this.hierarchicalGraphData.nodes);

      // Set up filter change callback
      this.patternLegend.onFilterChange((filters: PatternFilter) => {
        this.handlePatternFilterChange(filters);
      });
    }

    // Initialize pattern filter panel
    const filterContainer = this.shadow.getElementById(
      "pattern-filter-container"
    );
    if (filterContainer && this.hierarchicalGraphData) {
      this.patternFilterPanel = new PatternFilterPanel(
        filterContainer,
        this.patternCategorizer,
        {
          showAdvancedFilters: true,
          showMetricFilters: true,
          showSearchBox: true,
          collapsible: true,
          position: "left",
        }
      );

      // Update filter panel with current nodes
      this.patternFilterPanel.updateNodes(this.hierarchicalGraphData.nodes);

      // Set up filter change callback
      this.patternFilterPanel.onFilterChange(
        (filters: AdvancedPatternFilter) => {
          this.handleAdvancedPatternFilterChange(filters);
        }
      );
    }

    console.log("✅ Pattern components initialized successfully");
  }

  /**
   * Handle pattern filter changes from the legend
   */
  private handlePatternFilterChange(filters: PatternFilter): void {
    console.log("🔍 Pattern filter changed:", filters);

    if (!this.hierarchicalGraphData || !this.visualizationEngine) return;

    // Filter nodes based on pattern criteria
    const filteredNodes = this.hierarchicalGraphData.nodes.filter((node) => {
      return this.patternLegend?.nodeMatchesFilters(node) ?? true;
    });

    // Update visualization with filtered nodes
    this.applyNodeFiltering(filteredNodes);
  }

  /**
   * Handle advanced pattern filter changes from the filter panel
   */
  private handleAdvancedPatternFilterChange(
    filters: AdvancedPatternFilter
  ): void {
    console.log("🔍 Advanced pattern filter changed:", filters);

    this.currentPatternFilters = filters;

    if (!this.hierarchicalGraphData || !this.visualizationEngine) return;

    // Filter nodes based on advanced pattern criteria
    const filteredNodes = this.hierarchicalGraphData.nodes.filter((node) => {
      const legendMatch = this.patternLegend?.nodeMatchesFilters(node) ?? true;
      const panelMatch =
        this.patternFilterPanel?.nodeMatchesFilters(node) ?? true;
      return legendMatch && panelMatch;
    });

    // Update visualization with filtered nodes
    this.applyNodeFiltering(filteredNodes);
  }

  /**
   * Apply node filtering to the visualization
   */
  private applyNodeFiltering(filteredNodes: GraphNode[]): void {
    if (!this.visualizationEngine || !this.hierarchicalGraphData) return;

    // Create set of visible node IDs for fast lookup
    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));

    // Filter edges to only show those between visible nodes
    const filteredEdges = this.hierarchicalGraphData.edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    // Update visualization with filtered data
    const filteredData: GraphData = {
      nodes: filteredNodes,
      edges: filteredEdges,
    };

    // Apply pattern-based styling to filtered nodes
    this.applyPatternStyling(filteredNodes);

    // Update the visualization engine with filtered data
    this.visualizationEngine.updateData(filteredData);
  }

  /**
   * Apply pattern-based styling to nodes
   */
  private applyPatternStyling(nodes: GraphNode[]): void {
    if (!this.visualizationEngine) return;

    const themeManager = this.visualizationEngine.getThemeManager();

    nodes.forEach((node) => {
      if (node.patterns?.primaryPattern) {
        // Apply pattern-based color
        const patternColor = themeManager.getPatternColor(node);

        // Apply pattern-based size multiplier
        const sizeMultiplier = themeManager.getPatternSizeMultiplier(node);

        // Apply pattern-based effects
        const patternEffect = themeManager.getPatternEffect(node);

        // Apply pattern-based border
        const patternBorder = themeManager.getPatternBorder(node);

        // Store pattern styling in node for visualization engine
        (node as any).patternStyling = {
          color: patternColor,
          sizeMultiplier,
          effect: patternEffect,
          border: patternBorder,
          shape: themeManager.getPatternShape(node),
          icon: themeManager.getPatternIcon(node),
        };
      }
    });
  }
}

defineComponent("relationship-graph", RelationshipGraph);
