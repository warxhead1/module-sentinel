import { DashboardComponent, defineComponent } from './base-component.js';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  namespace?: string;
  size?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class RelationshipGraph extends DashboardComponent {
  private graphData: GraphData | null = null;
  private selectedNode: string | null = null;
  private simulation: any = null;

  async loadData(): Promise<void> {
    try {
      const response = await this.fetchAPI('/api/relationships');
      
      // Convert to consistent format
      this.graphData = {
        nodes: response.nodes || [],
        edges: response.edges || []
      };
      
      this.render();
      this.initializeGraph();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
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
          grid-template-columns: 1fr 350px;
          gap: 30px;
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
      </style>
      
      <div class="page-header">
        <h1>Code Relationships</h1>
        <p class="subtitle">Interactive visualization of code dependencies and connections</p>
      </div>
      
      <div class="graph-container">
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
          </div>
        </div>
        
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
    if (!this.graphData) {
      return { nodeCount: 0, edgeCount: 0, components: 0, avgDegree: 0 };
    }

    const nodeCount = this.graphData.nodes.length;
    const edgeCount = this.graphData.edges.length;
    
    // Calculate connected components
    const components = this.calculateConnectedComponents();
    
    // Calculate average degree
    const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;

    return { nodeCount, edgeCount, components, avgDegree };
  }

  private calculateConnectedComponents(): number {
    if (!this.graphData || this.graphData.nodes.length === 0) return 0;

    const visited = new Set<string>();
    let components = 0;

    const adjacencyList = new Map<string, string[]>();
    this.graphData.nodes.forEach(node => adjacencyList.set(node.id, []));
    this.graphData.edges.forEach(edge => {
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

    this.graphData.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        components++;
        dfs(node.id);
      }
    });

    return components;
  }

  private initializeGraph() {
    if (!this.graphData || !window.d3) {
      console.error('D3.js not loaded or no graph data');
      return;
    }

    const container = this.shadow.getElementById('relationshipGraph');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

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
      });

    svg.call(zoom);

    const g = svg.append('g');

    // Create force simulation
    this.simulation = d3.forceSimulation(this.graphData.nodes)
      .force('link', d3.forceLink(this.graphData.edges)
        .id((d: any) => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(this.graphData.edges)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-dasharray', (d: any) => d.type === 'uses' ? '5,5' : null);

    // Create nodes
    const node = g.append('g')
      .selectAll('.node')
      .data(this.graphData.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', this.dragstarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragended.bind(this)));

    // Add circles to nodes
    node.append('circle')
      .attr('r', (d: any) => Math.max(10, Math.min(30, Math.sqrt(d.size || 10) * 3)))
      .attr('fill', (d: any) => this.getNodeColor(d.type));

    // Add labels to nodes
    node.append('text')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('font-size', '10px');

    // Add click handler for nodes
    node.on('click', (event: any, d: any) => {
      this.selectNode(d);
    });

    // Update positions on simulation tick
    this.simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Store references for later use
    (this as any)._svg = svg;
    (this as any)._g = g;
    (this as any)._zoom = zoom;
  }

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      'class': '#4ecdc4',
      'struct': '#4ecdc4',
      'function': '#ff6b6b',
      'namespace': '#51cf66',
      'variable': '#ffd93d',
      'enum': '#6c5ce7'
    };
    return colors[type] || '#888';
  }

  private selectNode(node: GraphNode) {
    this.selectedNode = node.id;
    
    // Update node details
    const detailsCard = this.shadow.getElementById('nodeDetailsCard');
    const details = this.shadow.getElementById('nodeDetails');
    
    if (detailsCard && details) {
      detailsCard.style.display = 'block';
      
      // Find connections
      const connections = this.graphData?.edges.filter(
        e => e.source === node.id || e.target === node.id
      ) || [];
      
      details.innerHTML = `
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          <div class="node-type">${node.type}${node.namespace ? ` • ${node.namespace}` : ''}</div>
        </div>
        
        <h4>Connections (${connections.length})</h4>
        <div class="connections-list">
          ${connections.map(conn => {
            const otherNodeId = conn.source === node.id ? conn.target : conn.source;
            const otherNode = this.graphData?.nodes.find(n => n.id === otherNodeId);
            return otherNode ? `
              <div class="connection-item" data-node="${otherNode.id}">
                <span class="connection-name">${otherNode.name}</span>
                <span class="connection-type">${conn.type}</span>
              </div>
            ` : '';
          }).join('')}
        </div>
      `;
      
      // Add click handlers for connections
      details.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const nodeId = (e.currentTarget as HTMLElement).getAttribute('data-node');
          const node = this.graphData?.nodes.find(n => n.id === nodeId);
          if (node) this.selectNode(node);
        });
      });
    }
    
    // Highlight node and connections in graph
    this.highlightNode(node.id);
  }

  private highlightNode(nodeId: string) {
    if (!window.d3) return;
    
    const d3 = window.d3;
    const g = (this as any)._g;
    
    // Reset all highlights
    g.selectAll('.node').classed('highlighted', false);
    g.selectAll('.link').classed('highlighted', false);
    
    // Highlight selected node
    g.selectAll('.node')
      .filter((d: any) => d.id === nodeId)
      .classed('highlighted', true);
    
    // Highlight connected links
    g.selectAll('.link')
      .filter((d: any) => d.source.id === nodeId || d.target.id === nodeId)
      .classed('highlighted', true);
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
    if ((this as any)._svg && (this as any)._zoom) {
      const d3 = window.d3;
      d3.select((this as any)._svg)
        .transition()
        .duration(750)
        .call((this as any)._zoom.transform, d3.zoomIdentity);
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

  // Clean up when component is removed
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.simulation) {
      this.simulation.stop();
    }
  }
}

// Extend window interface for D3
declare global {
  interface Window {
    d3: any;
  }
}

defineComponent('relationship-graph', RelationshipGraph);