import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';
import { showSymbolSelector } from './symbol-selector-modal.js';
import * as d3 from 'd3';

interface ImpactNode {
  symbolId: number;
  symbolName: string;
  impactType: 'breaking' | 'modification' | 'enhancement';
  distance: number;
  confidence: number;
}

interface RippleWave {
  distance: number;
  nodes: ImpactNode[];
  timestamp: number;
}

interface ImpactAnalysis {
  directImpact: ImpactNode[];
  indirectImpact: ImpactNode[];
  rippleEffect: RippleWave[];
  severityScore: number;
}

/**
 * Impact Visualization Component
 * Shows the seismic/ripple effect of code changes
 */
export class ImpactVisualization extends DashboardComponent {
  private svg: any;
  private g: any;
  private simulation: any;
  private currentSymbolId: string | null = null;
  private impactData: ImpactAnalysis | null = null;
  private animationTimer: any = null;

  async loadData(): Promise<void> {
    // Get selected symbol from state
    const selectedSymbolId = stateService.getState('selectedNodeId');
    
    if (!selectedSymbolId) {
      // Instead of showing error, show symbol selector
      this._error = null;
      this.render();
      return;
    }

    if (selectedSymbolId === this.currentSymbolId && this.impactData) {
      // Already loaded
      return;
    }

    try {
      this._loading = true;
      this.render();

      const response = await dataService.fetch(`/analytics/impact/${selectedSymbolId}`);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to load impact analysis');
      }

      this.impactData = response.data;
      this.currentSymbolId = selectedSymbolId as string;
      
      this._loading = false;
      this.render();
      
      // Initialize visualization after render
      setTimeout(() => this.initializeVisualization(), 100);
    } catch (error) {
      this._error = error instanceof Error ? error.message : 'Failed to load impact data';
      this._loading = false;
      this.render();
    }
  }

  render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          background: var(--card-bg);
          border-radius: var(--border-radius);
          padding: 20px;
          box-sizing: border-box;
        }

        .container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .header {
          margin-bottom: 20px;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .change-symbol-btn {
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          color: var(--primary-accent);
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .change-symbol-btn:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateY(-1px);
        }

        h3 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--primary-accent);
          margin: 0 0 10px 0;
        }

        .severity-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
          margin-left: 10px;
        }

        .severity-low {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
          border: 1px solid #4caf50;
        }

        .severity-medium {
          background: rgba(255, 152, 0, 0.2);
          color: #ff9800;
          border: 1px solid #ff9800;
        }

        .severity-high {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
          border: 1px solid #f44336;
        }

        .visualization-container {
          flex: 1;
          position: relative;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          overflow: hidden;
        }

        #impactSvg {
          width: 100%;
          height: 100%;
        }

        .controls {
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          gap: 10px;
        }

        .control-btn {
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          color: var(--primary-accent);
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: var(--transition-smooth);
        }

        .control-btn:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateY(-1px);
        }

        .control-btn.active {
          background: var(--primary-accent);
          color: var(--primary-bg);
        }

        .legend {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 15px;
          backdrop-filter: blur(10px);
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .legend-item:last-child {
          margin-bottom: 0;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        /* Empty state */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 40px;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 20px;
          opacity: 0.5;
        }

        .empty-state h3 {
          font-size: 1.5rem;
          color: var(--primary-accent);
          margin: 0 0 10px 0;
        }

        .empty-state p {
          color: var(--text-muted);
          max-width: 400px;
          margin: 0 0 30px 0;
        }

        .select-symbol-btn {
          background: var(--primary-accent);
          color: var(--primary-bg);
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .select-symbol-btn:hover {
          background: var(--primary-accent-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(147, 112, 219, 0.3);
        }

        /* Node styles */
        .impact-node {
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .impact-node:hover {
          filter: brightness(1.3);
        }

        .node-label {
          pointer-events: none;
          font-size: 10px;
          fill: var(--text-secondary);
          text-anchor: middle;
        }

        /* Ripple animation */
        @keyframes ripple {
          0% {
            r: 0;
            opacity: 1;
          }
          100% {
            r: 500;
            opacity: 0;
          }
        }

        .ripple-wave {
          fill: none;
          stroke: var(--primary-accent);
          stroke-width: 2;
          opacity: 0;
          pointer-events: none;
        }

        .stats {
          margin-top: 15px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 300;
          color: var(--primary-accent);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
      </style>

      <div class="container">
        <div class="header">
          <div class="header-top">
            <h3>
              Impact Analysis
              ${this.impactData ? this.renderSeverityBadge(this.impactData.severityScore) : ''}
            </h3>
            ${this.currentSymbolId ? `
              <button class="change-symbol-btn" onclick="this.getRootNode().host.openSymbolSelector()">
                Change Symbol
              </button>
            ` : ''}
          </div>
          ${this.impactData ? this.renderStats() : ''}
        </div>

        <div class="visualization-container">
          ${this._loading ? this.renderLoading() : ''}
          ${this._error ? this.renderError() : ''}
          ${!this._loading && !this._error && !this.impactData ? this.renderEmptyState() : ''}
          ${!this._loading && !this._error && this.impactData ? `
            <svg id="impactSvg"></svg>
            
            <div class="controls">
              <button class="control-btn active" onclick="this.getRootNode().host.toggleAnimation()">
                Animate
              </button>
              <button class="control-btn" onclick="this.getRootNode().host.resetView()">
                Reset View
              </button>
            </div>

            <div class="legend">
              <div class="legend-item">
                <div class="legend-color" style="background: #ff4444;"></div>
                <span>Breaking Change</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #ffaa44;"></div>
                <span>Modification</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #44ff44;"></div>
                <span>Enhancement</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #4444ff;"></div>
                <span>Source Symbol</span>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <h3>Select a Symbol to Analyze Impact</h3>
        <p>Choose a function, class, or variable to see how changes would ripple through your codebase</p>
        <button class="select-symbol-btn" onclick="this.getRootNode().host.openSymbolSelector()">
          Select Symbol
        </button>
      </div>
    `;
  }

  openSymbolSelector() {
    showSymbolSelector({
      title: 'Select Symbol for Impact Analysis',
      filter: (symbol) => {
        // Filter to only show functions and classes for impact analysis
        return ['function', 'class', 'method', 'variable'].includes(symbol.kind);
      },
      onSelect: async (symbol) => {
        // Set the selected symbol in state
        stateService.setState('selectedNodeId', symbol.id.toString());
        
        // Reload data
        await this.loadData();
      }
    });
  }

  private renderSeverityBadge(score: number): string {
    const level = score > 70 ? 'high' : score > 30 ? 'medium' : 'low';
    const label = level.charAt(0).toUpperCase() + level.slice(1);
    
    return `<span class="severity-badge severity-${level}">Severity: ${label} (${score})</span>`;
  }

  private renderStats(): string {
    if (!this.impactData) return '';

    const totalImpacted = this.impactData.directImpact.length + this.impactData.indirectImpact.length;
    const maxDistance = Math.max(...this.impactData.rippleEffect.map(w => w.distance), 0);

    return `
      <div class="stats">
        <div class="stat-item">
          <div class="stat-value">${this.impactData.directImpact.length}</div>
          <div class="stat-label">Direct Impact</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${totalImpacted}</div>
          <div class="stat-label">Total Affected</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${maxDistance}</div>
          <div class="stat-label">Max Distance</div>
        </div>
      </div>
    `;
  }

  private async initializeVisualization() {
    if (!this.impactData) return;

    const svg = d3.select(this.shadow.getElementById('impactSvg'));
    const container = this.shadow.querySelector('.visualization-container');
    
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);

    // Clear previous content
    svg.selectAll('*').remove();

    // Create main group
    this.g = svg.append('g');

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Prepare nodes for visualization
    const nodes = this.prepareNodes();
    const links = this.prepareLinks(nodes);

    // Create force simulation
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = this.g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#666')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1);

    // Create nodes
    const node = this.g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'impact-node')
      .call(d3.drag()
        .on('start', this.dragStarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragEnded.bind(this)));

    // Add circles
    node.append('circle')
      .attr('r', (d: any) => this.getNodeRadius(d))
      .attr('fill', (d: any) => this.getNodeColor(d))
      .attr('stroke', (d: any) => d.distance === 0 ? '#fff' : 'none')
      .attr('stroke-width', 2);

    // Add labels
    node.append('text')
      .attr('class', 'node-label')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('opacity', (d: any) => d.distance <= 1 ? 1 : 0.7);

    // Update positions on tick
    this.simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Start ripple animation
    this.startRippleAnimation();
  }

  private prepareNodes(): any[] {
    if (!this.impactData) return [];

    const nodes: any[] = [];
    const nodeMap = new Map();

    // Add source node
    nodes.push({
      id: this.currentSymbolId,
      name: 'Source',
      distance: 0,
      impactType: 'source',
      x: 0,
      y: 0
    });

    // Add impacted nodes
    [...this.impactData.directImpact, ...this.impactData.indirectImpact].forEach(node => {
      if (!nodeMap.has(node.symbolId)) {
        nodeMap.set(node.symbolId, true);
        nodes.push({
          id: node.symbolId.toString(),
          name: node.symbolName,
          distance: node.distance,
          impactType: node.impactType,
          confidence: node.confidence
        });
      }
    });

    return nodes;
  }

  private prepareLinks(nodes: any[]): any[] {
    const links: any[] = [];
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Create links based on distance
    nodes.forEach(node => {
      if (node.distance > 0) {
        // Find potential parent nodes (one distance closer)
        const potentialParents = nodes.filter(n => n.distance === node.distance - 1);
        
        if (potentialParents.length > 0) {
          // Link to the closest parent (simplified)
          links.push({
            source: potentialParents[0].id,
            target: node.id
          });
        }
      }
    });

    return links;
  }

  private getNodeRadius(node: any): number {
    if (node.distance === 0) return 20;
    if (node.distance === 1) return 15;
    return Math.max(8, 15 - node.distance * 2);
  }

  private getNodeColor(node: any): string {
    if (node.distance === 0) return '#4444ff';
    
    switch (node.impactType) {
      case 'breaking': return '#ff4444';
      case 'modification': return '#ffaa44';
      case 'enhancement': return '#44ff44';
      default: return '#888888';
    }
  }

  private startRippleAnimation() {
    if (!this.impactData) return;

    let waveIndex = 0;

    const animateWave = () => {
      if (waveIndex >= this.impactData!.rippleEffect.length) {
        waveIndex = 0; // Loop
      }

      const wave = this.impactData!.rippleEffect[waveIndex];
      
      // Create ripple circle
      const centerNode = this.simulation.nodes().find((n: any) => n.distance === 0);
      
      if (centerNode) {
        const ripple = this.g.append('circle')
          .attr('class', 'ripple-wave')
          .attr('cx', centerNode.x)
          .attr('cy', centerNode.y)
          .attr('r', 0)
          .style('opacity', 1);

        ripple.transition()
          .duration(2000)
          .attr('r', wave.distance * 100)
          .style('opacity', 0)
          .remove();
      }

      // Highlight nodes at this distance
      this.g.selectAll('.impact-node')
        .filter((d: any) => d.distance === wave.distance)
        .select('circle')
        .transition()
        .duration(300)
        .attr('r', (d: any) => this.getNodeRadius(d) * 1.5)
        .transition()
        .duration(300)
        .attr('r', (d: any) => this.getNodeRadius(d));

      waveIndex++;
    };

    // Start animation
    animateWave();
    this.animationTimer = setInterval(animateWave, 2500);
  }

  toggleAnimation() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
      
      const btn = this.shadow.querySelector('.control-btn');
      if (btn) {
        btn.classList.remove('active');
        btn.textContent = 'Animate';
      }
    } else {
      this.startRippleAnimation();
      
      const btn = this.shadow.querySelector('.control-btn');
      if (btn) {
        btn.classList.add('active');
        btn.textContent = 'Stop';
      }
    }
  }

  resetView() {
    if (!this.svg) return;

    const container = this.shadow.querySelector('.visualization-container');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    d3.select(this.svg)
      .transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity);
  }

  private dragStarted(event: any, d: any) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: any, d: any) {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragEnded(event: any, d: any) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    // Clean up animation timer
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
    }
  }
}

defineComponent('impact-visualization', ImpactVisualization);