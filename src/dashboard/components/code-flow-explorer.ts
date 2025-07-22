import { DashboardComponent, defineComponent } from './base-component.js';
import * as d3 from 'd3';
import { ExecutionAnalyzer, ExecutionAnalysisResult } from '../utils/execution-analyzer.js';
import { SymbolSelectorModal } from './symbol-selector-modal.js';

interface FlowNode {
  id: string | number;
  name: string;
  type: 'function' | 'class' | 'file' | 'module';
  file: string;
  line: number;
  namespace?: string;
  callCount?: number;
  complexity?: number;
  isBranch?: boolean;
  isUnused?: boolean;
}

interface FlowEdge {
  source: string | number;
  target: string | number;
  type: 'calls' | 'inherits' | 'uses' | 'includes' | 'conditional';
  weight: number;
  condition?: string;
  isConditional?: boolean;
}

interface CallStack {
  depth: number;
  function: string;
  file: string;
  line: number;
}

interface ExecutionPath {
  id: number;
  nodes: number[];
  conditions: string[];
  isComplete: boolean;
  isCyclic: boolean;
  coverage: number;
}

interface BranchInfo {
  condition: string;
  targets: Array<{
    target_id: number;
    target_name: string;
    line_number: number;
  }>;
  coverage: number;
}

export class CodeFlowExplorer extends DashboardComponent {
  private executionAnalyzer: ExecutionAnalyzer;
  private analysisResult: ExecutionAnalysisResult | null = null;
  private selectedNode: string | number | null = null;
  private selectedSymbol: any = null;
  private traceMode: 'incoming' | 'outgoing' | 'both' = 'both';
  private maxDepth: number = 3;
  private viewMode: 'graph' | 'paths' | 'branches' | 'unused' = 'graph';
  private symbolSelector: SymbolSelectorModal | null = null;

  constructor() {
    super();
    this.executionAnalyzer = new ExecutionAnalyzer();
  }

  async loadData(): Promise<void> {
    // Check if there's a starting point in the URL
    const params = new URLSearchParams(window.location.search);
    const startNode = params.get('node');
    
    if (startNode) {
      await this.loadFlowData(startNode);
    } else {
      this.render();
    }
  }

  private async loadFlowData(nodeId: string | number) {
    try {
      this._loading = true;
      this.updateLoadingState();

      // Load multiple data sources in parallel
      const [callGraphResponse, branchResponse, pathsResponse] = await Promise.all([
        this.fetchAPI(`/api/code-flow/call-graph/${nodeId}?depth=${this.maxDepth}&direction=${this.traceMode}`),
        this.fetchAPI(`/api/code-flow/branches/${nodeId}`).catch(() => null),
        this.fetchAPI(`/api/code-flow/execution-paths?startId=${nodeId}&maxPaths=20`).catch(() => null)
      ]);

      if (!callGraphResponse.success) {
        throw new Error(callGraphResponse.error || 'Failed to load call graph');
      }

      // Data is now processed by ExecutionAnalyzer
      this.selectedNode = nodeId;
      
      this._loading = false;
      this.render();
      // Wait for DOM to be ready before initializing graph
      setTimeout(() => {
        if (this.viewMode === 'graph') {
          this.initializeFlowGraph();
        } else if (this.viewMode === 'paths') {
          this.initializePathsView();
        }
      }, 0);
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this._loading = false;
      this.render();
    }
  }

  // Removed - functionality moved to ExecutionAnalyzer
  
  private updateLoadingState() {
    // Update only the flow canvas area to show loading state
    const flowCanvas = this.shadow.querySelector('.flow-canvas');
    if (flowCanvas) {
      flowCanvas.innerHTML = `
        <div class="empty-state">
          <div>
            <h2>Loading...</h2>
            <p>Analyzing code flow relationships</p>
          </div>
        </div>
      `;
    }
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

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 30px 40px;
          height: 100vh;
        }
        
        .page-header {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        h1 {
          font-size: 2.2rem;
          font-weight: 300;
          color: #fff;
          margin: 0 0 8px 0;
        }
        
        .subtitle {
          font-size: 1.1rem;
          color: #aaa;
          font-weight: 300;
        }
        
        .flow-container {
          display: grid;
          grid-template-columns: 300px 1fr 300px;
          gap: 20px;
          height: calc(100vh - 200px);
        }
        
        .flow-sidebar {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
          overflow-y: auto;
        }
        
        .flow-canvas {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          position: relative;
          overflow: hidden;
        }
        
        #flowGraph {
          width: 100%;
          height: 100%;
        }
        
        .flow-controls {
          position: absolute;
          top: 15px;
          left: 15px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 10;
        }
        
        .control-group {
          background: rgba(0, 0, 0, 0.8);
          border-radius: 8px;
          padding: 10px;
        }
        
        .control-label {
          color: #aaa;
          font-size: 0.8rem;
          margin-bottom: 5px;
        }
        
        .control-buttons {
          display: flex;
          gap: 5px;
        }
        
        .control-btn {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid rgba(78, 205, 196, 0.5);
          color: #4ecdc4;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
        }
        
        .control-btn:hover {
          background: rgba(78, 205, 196, 0.3);
        }
        
        .control-btn.active {
          background: rgba(78, 205, 196, 0.4);
          border-color: #4ecdc4;
        }
        
        .depth-slider {
          width: 100px;
          margin: 5px 0;
        }
        
        .node-search {
          width: 100%;
          padding: 10px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          outline: none;
          margin-bottom: 15px;
        }
        
        .node-search:focus {
          border-color: #4ecdc4;
        }
        
        .node-list {
          max-height: 300px;
          overflow-y: auto;
        }
        
        .node-item {
          padding: 8px 0;
          cursor: pointer;
          transition: color 0.2s ease;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .node-item:hover {
          color: #4ecdc4;
        }
        
        .node-item.selected {
          color: #4ecdc4;
          font-weight: 500;
        }
        
        .node-name {
          color: #e0e0e0;
          font-size: 0.9rem;
        }
        
        .node-file {
          color: #888;
          font-size: 0.8rem;
          font-family: 'Fira Code', monospace;
        }
        
        .call-stack {
          margin-bottom: 20px;
        }
        
        .stack-item {
          background: rgba(255, 255, 255, 0.05);
          padding: 8px;
          margin: 5px 0;
          border-radius: 4px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .stack-item:hover {
          background: rgba(78, 205, 196, 0.1);
        }
        
        .stack-depth {
          color: #4ecdc4;
          margin-right: 8px;
        }
        
        .stack-function {
          color: #e0e0e0;
        }
        
        .stack-location {
          color: #888;
          font-family: 'Fira Code', monospace;
        }
        
        .flow-stats {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .stat-row {
          display: flex;
          justify-content: space-between;
          margin: 5px 0;
          font-size: 0.9rem;
        }
        
        .stat-label {
          color: #aaa;
        }
        
        .stat-value {
          color: #4ecdc4;
        }
        
        /* D3 Flow Graph Styles */
        .flow-node {
          cursor: pointer;
        }
        
        .flow-node circle {
          stroke: #fff;
          stroke-width: 2px;
        }
        
        .flow-node text {
          font-size: 10px;
          fill: #e0e0e0;
          text-anchor: middle;
          pointer-events: none;
        }
        
        .flow-link {
          fill: none;
          stroke: #666;
          stroke-width: 2px;
          opacity: 0.6;
          marker-end: url(#arrowhead);
        }
        
        .flow-link.highlighted {
          stroke: #4ecdc4;
          stroke-width: 3px;
          opacity: 1;
        }
        
        .flow-node.highlighted circle {
          stroke: #4ecdc4;
          stroke-width: 3px;
        }
        
        .flow-node.root circle {
          stroke: #ff6b6b;
          stroke-width: 3px;
        }
        
        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: #888;
        }

        /* Execution Paths View */
        .paths-view {
          padding: 20px;
          height: 100%;
          overflow-y: auto;
        }

        .paths-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .paths-header h3 {
          margin: 0 0 5px 0;
          color: #e0e0e0;
        }

        .paths-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .path-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 15px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .path-item.cyclic {
          border-color: #feca57;
        }

        .path-item.incomplete {
          border-color: #ff6b6b;
        }

        .path-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .path-number {
          font-weight: 600;
          color: #4ecdc4;
        }

        .path-badges {
          display: flex;
          gap: 8px;
        }

        .badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .badge.cyclic {
          background: rgba(254, 202, 87, 0.2);
          color: #feca57;
        }

        .badge.incomplete {
          background: rgba(255, 107, 107, 0.2);
          color: #ff6b6b;
        }

        .badge.coverage {
          background: rgba(6, 255, 165, 0.2);
          color: #06ffa5;
        }

        .path-flow {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .path-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: transform 0.2s ease;
        }

        .path-node:hover {
          transform: translateX(5px);
        }

        .node-id {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid #4ecdc4;
          padding: 8px 16px;
          border-radius: 6px;
          font-family: 'Fira Code', monospace;
          color: #4ecdc4;
        }

        .path-condition {
          margin-top: 5px;
          padding: 5px 10px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .condition-label {
          color: #feca57;
          font-weight: 600;
          margin-right: 5px;
        }

        .condition-text {
          color: #e0e0e0;
          font-family: 'Fira Code', monospace;
        }

        .path-arrow {
          color: #666;
          font-size: 1.2rem;
          margin: 5px 0;
        }

        /* Branch Analysis View */
        .branches-view {
          padding: 20px;
          height: 100%;
          overflow-y: auto;
        }

        .branches-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .branch-stats {
          display: flex;
          gap: 30px;
          margin-top: 15px;
        }

        .branches-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .branch-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 15px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .branch-item.unused {
          border-color: #ff6b6b;
          background: rgba(255, 107, 107, 0.05);
        }

        .branch-condition {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .condition-icon {
          font-size: 1.2rem;
        }

        .branch-condition code {
          background: rgba(0, 0, 0, 0.3);
          padding: 4px 8px;
          border-radius: 4px;
          color: #e0e0e0;
        }

        .branch-targets {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-left: 30px;
          margin-bottom: 10px;
        }

        .branch-target {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
        }

        .target-arrow {
          color: #4ecdc4;
        }

        .target-name {
          color: #e0e0e0;
          font-weight: 500;
        }

        .target-line {
          color: #888;
          font-size: 0.85rem;
        }

        .branch-coverage {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .coverage-bar {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .coverage-fill {
          height: 100%;
          background: linear-gradient(90deg, #06ffa5, #4ecdc4);
          transition: width 0.3s ease;
        }

        .coverage-text {
          font-size: 0.85rem;
          color: #888;
          min-width: 80px;
        }

        /* Unused Code View */
        .unused-view {
          padding: 20px;
          height: 100%;
          overflow-y: auto;
        }

        .unused-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .unused-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .unused-item {
          background: rgba(255, 107, 107, 0.05);
          border: 1px solid rgba(255, 107, 107, 0.2);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
        }

        .unused-item:hover {
          background: rgba(255, 107, 107, 0.1);
          transform: translateX(5px);
        }

        .unused-name {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .function-icon {
          color: #ff6b6b;
          font-size: 1.2rem;
        }

        .unused-location {
          flex: 1;
          text-align: center;
        }

        .unused-location code {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.85rem;
          color: #aaa;
        }

        .action-btn {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid #4ecdc4;
          color: #4ecdc4;
          padding: 5px 15px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: rgba(78, 205, 196, 0.3);
        }
      </style>
      
      <div class="page-header">
        <h1>Code Flow Explorer</h1>
        <p class="subtitle">Analyze execution paths, branches, and code flow through your codebase</p>
      </div>
      
      <div class="flow-container">
        <div class="flow-sidebar">
          <h3>Search Functions</h3>
          <input 
            type="text" 
            class="node-search" 
            placeholder="Search for functions..."
            id="nodeSearch"
          />
          
          <div class="node-list" id="nodeList">
            <!-- Function list will be populated here -->
          </div>
        </div>
        
        <div class="flow-canvas">
          ${this.analysisResult ? `
            <div class="flow-controls">
              <div class="control-group">
                <div class="control-label">View Mode</div>
                <div class="control-buttons">
                  <button class="control-btn ${this.viewMode === 'graph' ? 'active' : ''}" 
                          data-view="graph">Call Graph</button>
                  <button class="control-btn ${this.viewMode === 'paths' ? 'active' : ''}" 
                          data-view="paths">Execution Paths</button>
                  <button class="control-btn ${this.viewMode === 'branches' ? 'active' : ''}" 
                          data-view="branches">Branches</button>
                  <button class="control-btn ${this.viewMode === 'unused' ? 'active' : ''}" 
                          data-view="unused">Unused Code</button>
                </div>
              </div>
              
              ${this.viewMode === 'graph' ? `
                <div class="control-group">
                  <div class="control-label">Trace Mode</div>
                  <div class="control-buttons">
                    <button class="control-btn ${this.traceMode === 'incoming' ? 'active' : ''}" 
                            data-mode="incoming">Incoming</button>
                    <button class="control-btn ${this.traceMode === 'outgoing' ? 'active' : ''}" 
                            data-mode="outgoing">Outgoing</button>
                    <button class="control-btn ${this.traceMode === 'both' ? 'active' : ''}" 
                            data-mode="both">Both</button>
                  </div>
                </div>
              ` : ''}
              
              <div class="control-group">
                <div class="control-label">Max Depth: ${this.maxDepth}</div>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  value="${this.maxDepth}"
                  class="depth-slider"
                  id="depthSlider"
                />
              </div>
              
              <div class="control-group">
                <button class="control-btn" onclick="this.getRootNode().host.resetZoom()">Reset Zoom</button>
                <button class="control-btn" onclick="this.getRootNode().host.centerGraph()">Center</button>
              </div>
            </div>
            
            ${this.renderViewContent()}
          ` : `
            <div class="empty-state">
              <div>
                <h2>Select a function to trace</h2>
                <p>Choose a function from the sidebar to explore its call flow</p>
              </div>
            </div>
          `}
        </div>
        
        <div class="flow-sidebar">
          ${this.analysisResult ? `
            <div class="flow-stats">
              <div class="stat-row">
                <span class="stat-label">Nodes:</span>
                <span class="stat-value">${this.analysisResult.nodes.length}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Edges:</span>
                <span class="stat-value">${this.analysisResult.edges.length}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Max Depth:</span>
                <span class="stat-value">${this.maxDepth}</span>
              </div>
            </div>
          ` : ''}
          
          ${false ? `
            <h3>Call Stack</h3>
            <div class="call-stack">
              ${[].map((item: any) => `
                <div class="stack-item" data-file="${item.file}" data-line="${item.line}">
                  <span class="stack-depth">${item.depth}.</span>
                  <div class="stack-function">${item.function}</div>
                  <div class="stack-location">${item.file}:${item.line}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Add event listeners
    this.attachEventListeners();
  }

  private initializeFlowGraph() {
    if (!this.analysisResult || !window.d3) {
      console.error('D3.js not loaded or no flow data');
      return;
    }

    const container = this.shadow.getElementById('flowGraph');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const d3 = window.d3;
    d3.select(container).selectAll('*').remove();

    const svg = d3.select(container)
      .attr('width', width)
      .attr('height', height);

    // Define arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 13)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#666')
      .style('stroke', 'none');

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const g = svg.append('g');

    // Create force simulation
    const simulation = d3.forceSimulation(this.analysisResult.nodes)
      .force('link', d3.forceLink(this.analysisResult.edges)
        .id((d: any) => d.id)
        .distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Create links
    const link = g.append('g')
      .selectAll('path')
      .data(this.analysisResult.edges)
      .enter().append('path')
      .attr('class', 'flow-link')
      .attr('stroke-dasharray', (d: any) => d.type === 'calls' ? null : '5,5');

    // Create nodes
    const node = g.append('g')
      .selectAll('.flow-node')
      .data(this.analysisResult.nodes)
      .enter().append('g')
      .attr('class', (d: any) => `flow-node ${d.id === this.selectedNode ? 'root' : ''}`)
      .call(d3.drag()
        .on('start', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event: any, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Add circles to nodes
    node.append('circle')
      .attr('r', (d: any) => Math.max(15, Math.min(35, Math.sqrt(d.callCount || 1) * 5)))
      .attr('fill', (d: any) => this.getNodeColor(d.type));

    // Add labels to nodes
    node.append('text')
      .attr('dy', '.35em')
      .text((d: any) => d.name.length > 15 ? d.name.substring(0, 12) + '...' : d.name)
      .style('font-size', '10px');

    // Add click handler for nodes
    node.on('click', (event: any, d: any) => {
      this.loadFlowData(d.id);
    });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link.attr('d', (d: any) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Store references
    (this as any)._svg = svg;
    (this as any)._g = g;
    (this as any)._zoom = zoom;
  }

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      'function': '#ff6b6b',
      'class': '#4ecdc4',
      'file': '#51cf66',
      'module': '#ffd93d'
    };
    return colors[type] || '#888';
  }

  private renderViewContent(): string {
    switch (this.viewMode) {
      case 'graph':
        return '<svg id="flowGraph"></svg>';
      
      case 'paths':
        return this.renderExecutionPaths();
      
      case 'branches':
        return this.renderBranchAnalysis();
      
      case 'unused':
        return this.renderUnusedCode();
      
      default:
        return '<div class="empty-state">Select a view mode</div>';
    }
  }

  private renderExecutionPaths(): string {
    if (!this.analysisResult || !this.analysisResult.executionPaths.length) {
      return `
        <div class="paths-view">
          <div class="empty-state">
            <h3>No execution paths found</h3>
            <p>Select a function to analyze its execution paths</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="paths-view">
        <div class="paths-header">
          <h3>Execution Paths from ${this.selectedSymbol?.name || 'Unknown'}</h3>
          <p>${this.analysisResult.executionPaths.length} paths found</p>
        </div>
        <div class="paths-list">
          ${this.analysisResult.executionPaths.map((path: any, index: number) => `
            <div class="path-item ${path.isCyclic ? 'cyclic' : ''} ${!path.isComplete ? 'incomplete' : ''}">
              <div class="path-header">
                <span class="path-number">Path ${index + 1}</span>
                <div class="path-badges">
                  ${path.isCyclic ? '<span class="badge cyclic">Cyclic</span>' : ''}
                  ${!path.isComplete ? '<span class="badge incomplete">Incomplete</span>' : ''}
                  ${path.coverage > 0 ? `<span class="badge coverage">Coverage: ${path.coverage}%</span>` : ''}
                </div>
              </div>
              <div class="path-flow">
                ${this.renderPathNodes(path.nodes, path.conditions)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderPathNodes(nodeIds: number[], conditions: string[]): string {
    // This would ideally fetch node details, but for now show IDs
    return nodeIds.map((nodeId, index) => `
      <div class="path-node">
        <div class="node-id">${nodeId}</div>
        ${conditions[index] ? `
          <div class="path-condition">
            <span class="condition-label">if</span>
            <span class="condition-text">${conditions[index]}</span>
          </div>
        ` : ''}
        ${index < nodeIds.length - 1 ? '<div class="path-arrow">↓</div>' : ''}
      </div>
    `).join('');
  }

  private renderBranchAnalysis(): string {
    if (!this.analysisResult || !this.analysisResult.branchCoverage) {
      return `
        <div class="branches-view">
          <div class="empty-state">
            <h3>No branch analysis available</h3>
            <p>Select a function to analyze its conditional branches</p>
          </div>
        </div>
      `;
    }

    const branchCoverage = this.analysisResult.branchCoverage;
    const branches = [
      ...branchCoverage.fullyCoveredBranches,
      ...branchCoverage.partiallyCovcredBranches,
      ...branchCoverage.uncoveredBranches
    ];

    return `
      <div class="branches-view">
        <div class="branches-header">
          <h3>Branch Analysis for ${this.selectedSymbol?.name || 'Unknown'}</h3>
          <div class="branch-stats">
            <div class="stat">
              <span class="stat-value">${branchCoverage.total}</span>
              <span class="stat-label">Total Branches</span>
            </div>
            <div class="stat">
              <span class="stat-value">${branchCoverage.covered}</span>
              <span class="stat-label">Covered</span>
            </div>
            <div class="stat">
              <span class="stat-value">${branchCoverage.uncoveredBranches.length}</span>
              <span class="stat-label">Unused</span>
            </div>
          </div>
        </div>
        <div class="branches-list">
          ${branches.map((branch: any) => `
            <div class="branch-item ${branch.coverage === 0 ? 'unused' : ''}">
              <div class="branch-condition">
                <span class="condition-icon">🔀</span>
                <code>${branch.condition}</code>
              </div>
              <div class="branch-targets">
                ${branch.targets.map((target: any) => `
                  <div class="branch-target">
                    <span class="target-arrow">→</span>
                    <span class="target-name">${target.target_name}</span>
                    <span class="target-line">line ${target.line_number}</span>
                  </div>
                `).join('')}
              </div>
              <div class="branch-coverage">
                <div class="coverage-bar">
                  <div class="coverage-fill" style="width: ${branch.coverage}%"></div>
                </div>
                <span class="coverage-text">${branch.coverage.toFixed(1)}% coverage</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderUnusedCode(): string {
    if (!this.analysisResult || !this.analysisResult.unusedSymbols.length) {
      return `
        <div class="unused-view">
          <div class="empty-state">
            <h3>No unused code detected</h3>
            <p>All functions appear to be referenced in the codebase</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="unused-view">
        <div class="unused-header">
          <h3>Unused Code Detection</h3>
          <p>${this.analysisResult.unusedSymbols.length} potentially unused functions found</p>
        </div>
        <div class="unused-list">
          ${this.analysisResult.unusedSymbols.map((symbol: any) => `
            <div class="unused-item" data-symbol-id="${symbol.id}">
              <div class="unused-name">
                <span class="function-icon">ƒ</span>
                <strong>${symbol.name}</strong>
              </div>
              <div class="unused-location">
                <code>${symbol.file_path}:${symbol.line_start}</code>
              </div>
              <div class="unused-actions">
                <button class="action-btn" onclick="this.getRootNode().host.analyzeUnused(${symbol.id})">
                  Analyze
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private initializePathsView() {
    // Add interactivity to paths view
    this.shadow.querySelectorAll('.path-node').forEach(node => {
      node.addEventListener('click', (e) => {
        const nodeId = (e.currentTarget as HTMLElement).querySelector('.node-id')?.textContent;
        if (nodeId) {
          this.loadFlowData(parseInt(nodeId));
        }
      });
    });
  }

  // Removed - functionality moved to ExecutionAnalyzer

  private async analyzeUnused(symbolId: number) {
    // Navigate to the symbol or show detailed analysis
    await this.loadFlowData(symbolId);
  }

  private initializeSymbolSelector() {
    if (!this.symbolSelector) {
      this.symbolSelector = new SymbolSelectorModal();
    }
  }

  // Public method to open symbol selector
  openSymbolSelector() {
    this.initializeSymbolSelector();
    if (this.symbolSelector) {
      if (!this.symbolSelector.parentElement) {
        document.body.appendChild(this.symbolSelector);
      }
      this.symbolSelector.show({
        title: 'Select Function to Analyze',
        onSelect: (symbol) => {
          if (symbol && symbol.id) {
            this.loadFlowData(symbol.id);
          }
        }
      });
    }
  }

  private attachEventListeners() {
    // Search input for functions
    const searchInput = this.shadow.getElementById('nodeSearch') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', async (e) => {
        const query = (e.target as HTMLInputElement).value;
        if (query.length > 2) {
          await this.loadFunctionList(query);
        }
      });
    }

    // View mode buttons
    this.shadow.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = (e.target as HTMLElement).getAttribute('data-view');
        if (view) {
          this.viewMode = view as any;
          this.render();
          
          // Initialize view-specific features
          setTimeout(() => {
            if (this.viewMode === 'graph' && this.analysisResult) {
              this.initializeFlowGraph();
            } else if (this.viewMode === 'paths') {
              this.initializePathsView();
            }
          }, 0);
        }
      });
    });

    // Trace mode buttons
    this.shadow.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = (e.target as HTMLElement).getAttribute('data-mode');
        if (mode && this.selectedNode) {
          this.traceMode = mode as any;
          this.loadFlowData(this.selectedNode);
        }
      });
    });

    // Depth slider
    const depthSlider = this.shadow.getElementById('depthSlider') as HTMLInputElement;
    if (depthSlider) {
      depthSlider.addEventListener('change', (e) => {
        this.maxDepth = parseInt((e.target as HTMLInputElement).value);
        if (this.selectedNode) {
          this.loadFlowData(this.selectedNode);
        }
      });
    }

    // Call stack items
    this.shadow.querySelectorAll('.stack-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const file = (e.currentTarget as HTMLElement).getAttribute('data-file');
        const line = (e.currentTarget as HTMLElement).getAttribute('data-line');
        this.emit('location-selected', { file, line: parseInt(line || '0') });
      });
    });
  }

  private async loadFunctionList(query: string) {
    try {
      const response = await this.fetchAPI(`/api/search?q=${encodeURIComponent(query)}&type=function`);
      const functions = response.results || [];
      
      const nodeList = this.shadow.getElementById('nodeList');
      if (nodeList) {
        if (functions.length === 0) {
          nodeList.innerHTML = `
            <div style="color: #888; text-align: center; padding: 20px;">
              No functions found matching "${query}"
            </div>
          `;
          return;
        }
        
        nodeList.innerHTML = functions.map((func: any) => `
          <div class="node-item" data-node="${func.id}" data-name="${func.name || func.qualified_name}">
            <div class="node-name">${func.name || func.qualified_name}</div>
            <div class="node-file">${func.file}:${func.line}</div>
          </div>
        `).join('');
        
        // Add click handlers to new items
        nodeList.querySelectorAll('.node-item').forEach(item => {
          item.addEventListener('click', async (e) => {
            e.preventDefault();
            const nodeId = (e.currentTarget as HTMLElement).getAttribute('data-node');
            const nodeName = (e.currentTarget as HTMLElement).getAttribute('data-name');
            if (nodeId || nodeName) {
              // Use name if ID fails
              await this.loadFlowData(nodeId || nodeName || '');
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to load function list:', error);
      const nodeList = this.shadow.getElementById('nodeList');
      if (nodeList) {
        nodeList.innerHTML = `
          <div style="color: #ff6b6b; text-align: center; padding: 20px;">
            Error loading functions: ${error instanceof Error ? error.message : 'Unknown error'}
          </div>
        `;
      }
    }
  }

  // Public methods for controls
  resetZoom() {
    if ((this as any)._svg && (this as any)._zoom) {
      const d3 = window.d3;
      d3.select((this as any)._svg)
        .transition()
        .duration(750)
        .call((this as any)._zoom.transform, d3.zoomIdentity);
    }
  }

  centerGraph() {
    if ((this as any)._svg && (this as any)._g) {
      const svg = (this as any)._svg.node();
      const bounds = (this as any)._g.node().getBBox();
      const fullWidth = svg.clientWidth;
      const fullHeight = svg.clientHeight;
      const width = bounds.width;
      const height = bounds.height;
      const midX = bounds.x + width / 2;
      const midY = bounds.y + height / 2;
      
      const scale = Math.min(fullWidth / width, fullHeight / height) * 0.8;
      const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];
      
      const d3 = window.d3;
      d3.select((this as any)._svg)
        .transition()
        .duration(750)
        .call((this as any)._zoom.transform, 
          d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }
  }

  // Removed - functionality moved to ExecutionAnalyzer
}

defineComponent('code-flow-explorer', CodeFlowExplorer);