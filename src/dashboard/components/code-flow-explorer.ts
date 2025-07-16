import { DashboardComponent, defineComponent } from './base-component.js';

interface FlowNode {
  id: string;
  name: string;
  type: 'function' | 'class' | 'file' | 'module';
  file: string;
  line: number;
  namespace?: string;
  callCount?: number;
}

interface FlowEdge {
  source: string;
  target: string;
  type: 'calls' | 'inherits' | 'uses' | 'includes';
  weight: number;
}

interface CallStack {
  depth: number;
  function: string;
  file: string;
  line: number;
}

export class CodeFlowExplorer extends DashboardComponent {
  private flowData: { nodes: FlowNode[], edges: FlowEdge[] } | null = null;
  private selectedNode: string | null = null;
  private traceMode: 'incoming' | 'outgoing' | 'both' = 'both';
  private maxDepth: number = 3;
  private callStack: CallStack[] = [];

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

  private async loadFlowData(nodeId: string) {
    try {
      this._loading = true;
      this.render();

      const params = new URLSearchParams({
        node: nodeId,
        mode: this.traceMode,
        depth: this.maxDepth.toString()
      });

      const response = await this.fetchAPI(`/api/flow?${params}`);
      this.flowData = {
        nodes: response.nodes || [],
        edges: response.edges || []
      };
      this.selectedNode = nodeId;
      
      // Load call stack if available
      if (response.callStack) {
        this.callStack = response.callStack;
      }
      
      this._loading = false;
      this.render();
      this.initializeFlowGraph();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this._loading = false;
      this.render();
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
      </style>
      
      <div class="page-header">
        <h1>Code Flow Explorer</h1>
        <p class="subtitle">Trace function calls and dependencies through your codebase</p>
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
          ${this.flowData ? `
            <div class="flow-controls">
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
            
            <svg id="flowGraph"></svg>
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
          ${this.flowData ? `
            <div class="flow-stats">
              <div class="stat-row">
                <span class="stat-label">Nodes:</span>
                <span class="stat-value">${this.flowData.nodes.length}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Edges:</span>
                <span class="stat-value">${this.flowData.edges.length}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Max Depth:</span>
                <span class="stat-value">${this.maxDepth}</span>
              </div>
            </div>
          ` : ''}
          
          ${this.callStack.length > 0 ? `
            <h3>Call Stack</h3>
            <div class="call-stack">
              ${this.callStack.map(item => `
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
    if (!this.flowData || !window.d3) {
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
    const simulation = d3.forceSimulation(this.flowData.nodes)
      .force('link', d3.forceLink(this.flowData.edges)
        .id((d: any) => d.id)
        .distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Create links
    const link = g.append('g')
      .selectAll('path')
      .data(this.flowData.edges)
      .enter().append('path')
      .attr('class', 'flow-link')
      .attr('stroke-dasharray', (d: any) => d.type === 'calls' ? null : '5,5');

    // Create nodes
    const node = g.append('g')
      .selectAll('.flow-node')
      .data(this.flowData.nodes)
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
        nodeList.innerHTML = functions.map((func: any) => `
          <div class="node-item" data-node="${func.id}">
            <div class="node-name">${func.name}</div>
            <div class="node-file">${func.file}:${func.line}</div>
          </div>
        `).join('');
        
        // Add click handlers to new items
        nodeList.querySelectorAll('.node-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const nodeId = (e.currentTarget as HTMLElement).getAttribute('data-node');
            if (nodeId) {
              this.loadFlowData(nodeId);
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to load function list:', error);
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
}

defineComponent('code-flow-explorer', CodeFlowExplorer);