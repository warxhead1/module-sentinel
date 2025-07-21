import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js'; // Import dataService
import { stateService } from '../services/state.service.js';

import { GraphNode, GraphEdge } from '../../shared/types/api';

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class RelationshipGraph extends DashboardComponent {
  private graphData: GraphData | null = null;
  private hierarchicalGraphData: GraphData | null = null; // New: Stores hierarchical data
  private selectedNode: string | null = null;
  private simulation: any = null;

  async loadData(): Promise<void> {
    try {
      const response = await dataService.getRelationships(); // Use dataService.getRelationships()
      
      // Convert to consistent format
      this.graphData = {
        nodes: response.nodes || [],
        edges: response.edges || []
      };

      this.hierarchicalGraphData = this.createHierarchicalGraphData(this.graphData); // New: Transform data
      
      this.render();
      this.initializeGraph();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  // New: Function to create hierarchical graph data
  private createHierarchicalGraphData(data: GraphData): GraphData {
    const newNodes: GraphNode[] = [...data.nodes];
    const newEdges: GraphEdge[] = [...data.edges];
    const moduleMap = new Map<string, GraphNode>();
    const namespaceMap = new Map<string, GraphNode>();

    data.nodes.forEach(node => {
      // Create module group nodes
      if (node.moduleId && !moduleMap.has(node.moduleId)) {
        const moduleNode: GraphNode = {
          id: `module-group-${node.moduleId}`,
          name: node.moduleId.split('/').pop() || node.moduleId, // Use last part of path as name
          type: 'module-group',
          size: 0, // Will aggregate later
        };
        newNodes.push(moduleNode);
        moduleMap.set(node.moduleId, moduleNode);
      }

      // Create namespace group nodes
      if (node.namespace && !namespaceMap.has(node.namespace)) {
        const namespaceNode: GraphNode = {
          id: `namespace-group-${node.namespace}`,
          name: node.namespace.split('::').pop() || node.namespace, // Use last part of namespace as name
          type: 'namespace-group',
          size: 0, // Will aggregate later
        };
        newNodes.push(namespaceNode);
        namespaceMap.set(node.namespace, namespaceNode);
      }

      // Assign parentGroupId to nodes
      if (node.moduleId) {
        node.parentGroupId = moduleMap.get(node.moduleId)?.id; // Link to module group
      } else if (node.namespace) {
        node.parentGroupId = namespaceMap.get(node.namespace)?.id; // Link to namespace group
      }
    });

    // Aggregate sizes for group nodes (simple sum for now)
    newNodes.forEach(node => {
      if (node.type === 'module-group' || node.type === 'namespace-group') {
        node.size = data.nodes.filter(n => 
          (node.type === 'module-group' && n.moduleId === node.id.replace('module-group-', '')) ||
          (node.type === 'namespace-group' && n.namespace === node.id.replace('namespace-group-', ''))
        ).reduce((sum, n) => sum + (n.size || 1), 0);
      }
    });

    // For now, we keep original edges. In later tasks, we might aggregate or create new edges between group nodes.
    return { nodes: newNodes, edges: newEdges };
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
          <div id="graph-tooltip" class="graph-tooltip"></div> <!-- New: Tooltip element -->
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

  private initializeGraph() {
    if (!this.hierarchicalGraphData || !window.d3) {
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
        // Update label visibility based on zoom level
        node.selectAll('text')
          .style('opacity', (d: any) => {
            const currentScale = event.transform.k;
            return currentScale > 0.5 ? 1 : 0;
          });
      });

    svg.call(zoom);

    const g = svg.append('g');

    // Create force simulation
    this.simulation = d3.forceSimulation(this.hierarchicalGraphData.nodes)
      .force('link', d3.forceLink(this.hierarchicalGraphData.edges)
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
      .data(this.hierarchicalGraphData.edges)
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
    // Create nodes
    const node = g.append('g')
      .selectAll('.node')
      .data(this.hierarchicalGraphData.nodes)
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

    // Add circles to nodes
    node.append('circle')
      .attr('r', (d: any) => {
        if (d.type === 'module-group' || d.type === 'namespace-group') {
          return Math.max(20, Math.min(60, Math.sqrt(d.size || 100) * 2)); // Larger for groups
        }
        // Use metrics for sizing if available, fallback to existing size or default
        const sizeMetric = d.metrics?.loc || d.metrics?.cyclomaticComplexity || d.size || 10;
        return Math.max(5, Math.min(25, Math.sqrt(sizeMetric) * 2));
      })
      .attr('fill', (d: any) => {
        if (d.type === 'module-group') return '#6a0572'; // Distinct color for module groups
        if (d.type === 'namespace-group') return '#8d0572'; // Distinct color for namespace groups
        return this.getNodeColor(d.type);
      });

    // Add labels to nodes
    node.append('text')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('font-size', (d: any) => {
        // Semantic zooming for labels: larger font for larger nodes or at higher zoom levels
        const currentScale = (this as any)._zoom?.transform().k || 1;
        const baseSize = 8; // Minimum font size
        const scaledSize = baseSize + Math.log(d.size || 1) * 0.5; // Scale with node size
        return `${Math.min(14, scaledSize * Math.sqrt(currentScale))}px`;
      })
      .style('opacity', (d: any) => {
        // Hide labels at very low zoom levels
        const currentScale = (this as any)._zoom?.transform().k || 1;
        return currentScale > 0.5 ? 1 : 0;
      });

    // Placeholder for badges (Task 2.3 - future implementation)
    // node.append('image') or node.append('text') for badges

    // Add click handler for nodes
    node.on('click', (event: any, d: any) => {
      if (d.type === 'module-group' || d.type === 'namespace-group') {
        this.toggleGroupExpansion(d);
      } else {
        this.selectNode(d);
      }
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

    // New: Function to toggle group expansion
  private toggleGroupExpansion(groupNode: GraphNode) {
    const d3 = window.d3;
    const g = (this as any)._g;

    // Get all nodes and links from the current simulation
    let currentNodes = this.simulation.nodes();
    let currentLinks = this.simulation.force('link').links();

    // Find all nodes belonging to this group
    const childNodes = this.hierarchicalGraphData?.nodes.filter(n => n.parentGroupId === groupNode.id) || [];
    const childLinks = this.hierarchicalGraphData?.edges.filter(e => {
      const sourceId = typeof e.source === 'string' ? e.source : (e.source as any)?.id;
      const targetId = typeof e.target === 'string' ? e.target : (e.target as any)?.id;
      return (childNodes.some(n => n.id === sourceId) && childNodes.some(n => n.id === targetId)) ||
             (childNodes.some(n => n.id === sourceId) && targetId === groupNode.id) ||
             (childNodes.some(n => n.id === targetId) && sourceId === groupNode.id);
    }) || [];

    if (groupNode.isExpanded) { // Collapse the group
      groupNode.isExpanded = false;

      // Remove child nodes and their internal links from the simulation
      currentNodes = currentNodes.filter((n: any) => n.parentGroupId !== groupNode.id);
      currentLinks = currentLinks.filter((l: any) => 
        !(childNodes.some(n => n.id === l.source.id) && childNodes.some(n => n.id === l.target.id))
      );

      // Update links connected to the group node
      currentLinks.forEach((l: any) => {
        if (childNodes.some(n => n.id === l.source.id)) l.source = groupNode;
        if (childNodes.some(n => n.id === l.target.id)) l.target = groupNode;
      });

    } else { // Expand the group
      groupNode.isExpanded = true;

      // Add child nodes back to simulation
      currentNodes = [...currentNodes, ...childNodes];

      // Re-add internal links and update links connected to the group node
      currentLinks = [...currentLinks, ...childLinks];
      currentLinks.forEach((l: any) => {
        if (l.source.id === groupNode.id && childNodes.some(n => n.id === l.target.id)) l.source = l.target; // Simplified: link from group to child becomes child to child
        if (l.target.id === groupNode.id && childNodes.some(n => n.id === l.source.id)) l.target = l.source; // Simplified
      });
    }

    // Update simulation with new nodes and links
    this.simulation.nodes(currentNodes);
    this.simulation.force('link').links(currentLinks);

    // Re-render nodes
    const nodeSelection = g.selectAll('.node')
      .data(this.simulation.nodes(), (d: any) => d.id);

    nodeSelection.exit()
      .transition().duration(500)
      .style('opacity', 0)
      .attr('transform', (d: any) => {
        const parent = this.hierarchicalGraphData?.nodes.find(n => n.id === d.parentGroupId);
        return parent ? `translate(${parent.x},${parent.y})` : `translate(${d.x},${d.y})`;
      })
      .remove();

    const newNodeEnter = nodeSelection.enter().append('g')
      .attr('class', 'node')
      .style('opacity', 0) // Start invisible for transition
      .attr('transform', (d: any) => {
        const parent = this.hierarchicalGraphData?.nodes.find(n => n.id === d.parentGroupId);
        return parent ? `translate(${parent.x},${parent.y})` : `translate(${d.x},${d.y})`;
      })
      .call(d3.drag()
        .on('start', this.dragstarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragended.bind(this)));

    newNodeEnter.append('circle')
      .attr('r', (d: any) => {
        if (d.type === 'module-group' || d.type === 'namespace-group') {
          return Math.max(20, Math.min(60, Math.sqrt(d.size || 100) * 2));
        }
        const sizeMetric = d.metrics?.loc || d.metrics?.cyclomaticComplexity || d.size || 10;
        return Math.max(5, Math.min(25, Math.sqrt(sizeMetric) * 2));
      })
      .attr('fill', (d: any) => {
        if (d.type === 'module-group') return '#6a0572';
        if (d.type === 'namespace-group') return '#8d0572';
        return this.getNodeColor(d.type);
      });

    newNodeEnter.append('text')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('font-size', (d: any) => {
        const currentScale = (this as any)._zoom?.transform().k || 1;
        const baseSize = 8;
        const scaledSize = baseSize + Math.log(d.size || 1) * 0.5;
        return `${Math.min(14, scaledSize * Math.sqrt(currentScale))}px`;
      })
      .style('opacity', (d: any) => {
        const currentScale = (this as any)._zoom?.transform().k || 1;
        return currentScale > 0.5 ? 1 : 0;
      });

    newNodeEnter.on('click', (event: any, d: any) => {
      if (d.type === 'module-group' || d.type === 'namespace-group') {
        this.toggleGroupExpansion(d);
      } else {
        this.selectNode(d);
      }
    });

    newNodeEnter.transition().duration(500).style('opacity', (d: any) => {
      if (d.type === 'module-group' || d.type === 'namespace-group') return 0.8;
      return 1;
    });

    // Re-render links
    const linkSelection = g.selectAll('.link')
      .data(this.simulation.force('link').links(), (d: any) => `${d.source.id}-${d.target.id}`);

    linkSelection.exit()
      .transition().duration(500)
      .style('opacity', 0)
      .remove();

    linkSelection.enter().append('line')
      .attr('class', 'link')
      .attr('stroke-dasharray', (d: any) => d.type === 'uses' ? '5,5' : null)
      .style('stroke-width', (d: any) => d.weight ? d.weight * 1.5 : 1.5)
      .style('opacity', 0) // Start invisible for transition
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

    linkSelection.transition().duration(500).style('opacity', (d: any) => {
      if (d.source.type.includes('-group') || d.target.type.includes('-group')) return 0.3;
      if (d.type === 'uses') return 0.4;
      return 0.6;
    });

    // Restart simulation to apply changes
    this.simulation.alpha(1).restart();
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
      'enum': '#6c5ce7'
    };
    return colors[type] || '#888';
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
    
    // Reset all highlights with transition
    g.selectAll('.node')
      .transition().duration(200)
      .classed('highlighted', false)
      .style('opacity', 1); // Reset opacity
    g.selectAll('.link')
      .transition().duration(200)
      .classed('highlighted', false)
      .style('opacity', 0.6); // Reset opacity
    
    // Highlight selected node with transition
    g.selectAll('.node')
      .filter((d: any) => d.id === nodeId)
      .transition().duration(200)
      .classed('highlighted', true)
      .style('opacity', 1); // Ensure selected node is fully visible
    
    // Highlight connected links with transition
    g.selectAll('.link')
      .filter((d: any) => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source?.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target?.id;
        return sourceId === nodeId || targetId === nodeId;
      })
      .transition().duration(200)
      .classed('highlighted', true)
      .style('opacity', 1); // Ensure connected links are fully visible

    // Dim non-connected nodes and links
    g.selectAll('.node')
      .filter((d: any) => {
        if (d.id === nodeId) return false;
        return !this.hierarchicalGraphData?.edges.some(e => {
          const sourceId = typeof e.source === 'string' ? e.source : (e.source as any)?.id;
          const targetId = typeof e.target === 'string' ? e.target : (e.target as any)?.id;
          return (sourceId === nodeId && targetId === d.id) || (targetId === nodeId && sourceId === d.id);
        });
      })
      .transition().duration(200)
      .style('opacity', 0.2); // Dim non-connected nodes

    g.selectAll('.link')
      .filter((d: any) => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source?.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target?.id;
        return sourceId !== nodeId && targetId !== nodeId;
      })
      .transition().duration(200)
      .style('opacity', 0.1); // Dim non-connected links
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