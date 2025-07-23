/**
 * GraphVisualizationEngine - Core D3.js graph visualization engine
 * 
 * This class provides a reusable, extensible foundation for D3.js-based graph visualizations
 * with support for various graph types, interactions, and rendering engines.
 */

import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '../../shared/types/api';
import { GraphDataProcessor } from './graph-data-processor';
import { GraphThemeManager } from './graph-theme-manager';
import { GraphInteractionHandler } from './graph-interaction-handler';
import { GraphAnimationController } from './graph-animation-controller';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphConfig {
  width: number;
  height: number;
  type: 'force-directed' | 'hierarchical' | 'circular' | 'tree';
  enableZoom: boolean;
  enableDrag: boolean;
  enableAnimation: boolean;
  theme: string;
  renderingEngine: 'svg' | 'canvas' | 'webgl';
  simulation?: {
    strength: number;
    linkDistance: number;
    center: { x: number; y: number };
    collisionRadius: number;
  };
  clustering?: {
    enabled: boolean;
    strength: number;
  };
  semanticZooming?: {
    enabled: boolean;
    thresholds: { low: number; medium: number; high: number };
  };
}

export interface GraphEventCallbacks {
  onNodeClick?: (node: GraphNode, event: Event) => void;
  onNodeHover?: (node: GraphNode | null, event: Event) => void;
  onEdgeClick?: (edge: GraphEdge, event: Event) => void;
  onEdgeHover?: (edge: GraphEdge | null, event: Event) => void;
  onZoom?: (transform: d3.ZoomTransform) => void;
  onSimulationTick?: (nodes: GraphNode[], edges: GraphEdge[]) => void;
}

export class GraphVisualizationEngine {
  private container: HTMLElement | SVGElement;
  private config: GraphConfig;
  private data: GraphData;
  private callbacks: GraphEventCallbacks;

  // D3 components
  private svg: d3.Selection<any, unknown, null, undefined> | null = null;
  private g: d3.Selection<any, unknown, null, undefined> | null = null;
  private simulation: d3.Simulation<GraphNode, GraphEdge> | null = null;
  private zoom: d3.ZoomBehavior<any, any> | null = null;

  // Helper modules
  private dataProcessor: GraphDataProcessor;
  private themeManager: GraphThemeManager;
  private interactionHandler: GraphInteractionHandler;
  private animationController: GraphAnimationController;

  // Current state
  private currentTransform: d3.ZoomTransform;
  private selectedNodes: Set<string> = new Set();
  private highlightedNodes: Set<string> = new Set();
  private filteredData: GraphData | null = null;

  constructor(
    container: HTMLElement | SVGElement,
    config: Partial<GraphConfig> = {},
    callbacks: GraphEventCallbacks = {}
  ) {
    this.container = container;
    this.config = this.mergeConfig(config);
    this.callbacks = callbacks;
    this.currentTransform = d3.zoomIdentity;

    // Initialize helper modules
    this.dataProcessor = new GraphDataProcessor();
    this.themeManager = new GraphThemeManager(this.config.theme);
    this.interactionHandler = new GraphInteractionHandler(this.config, callbacks);
    this.animationController = new GraphAnimationController(this.config);

    this.data = { nodes: [], edges: [] };
    this.initializeEngine();
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(userConfig: Partial<GraphConfig>): GraphConfig {
    const defaultConfig: GraphConfig = {
      width: 800,
      height: 600,
      type: 'force-directed',
      enableZoom: true,
      enableDrag: true,
      enableAnimation: true,
      theme: 'dark',
      renderingEngine: 'svg',
      simulation: {
        strength: -300,
        linkDistance: 100,
        center: { x: 400, y: 300 },
        collisionRadius: 30
      },
      clustering: {
        enabled: false,
        strength: 0.1
      },
      semanticZooming: {
        enabled: true,
        thresholds: { low: 0.5, medium: 1.0, high: 2.0 }
      }
    };

    return { ...defaultConfig, ...userConfig };
  }

  /**
   * Initialize the visualization engine
   */
  private async initializeEngine(): Promise<void> {
    // Wait for D3 to be available
    await this.waitForD3();

    // Clear existing content
    d3.select(this.container).selectAll('*').remove();

    // Initialize based on rendering engine
    switch (this.config.renderingEngine) {
      case 'svg':
        this.initializeSVGEngine();
        break;
      case 'canvas':
        this.initializeCanvasEngine();
        break;
      case 'webgl':
        this.initializeWebGLEngine();
        break;
    }
  }

  /**
   * Initialize SVG-based rendering
   */
  private initializeSVGEngine(): void {
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.config.width)
      .attr('height', this.config.height);

    // Setup zoom if enabled
    if (this.config.enableZoom) {
      this.zoom = d3.zoom<any, unknown>()
        .scaleExtent([0.1, 10])
        .on('zoom', (event: d3.D3ZoomEvent<any, unknown>) => {
          this.currentTransform = event.transform;
          this.g?.attr('transform', event.transform.toString());
          
          // Update semantic zooming
          if (this.config.semanticZooming?.enabled) {
            this.updateSemanticZooming(event.transform.k);
          }
          
          // Trigger callback
          this.callbacks.onZoom?.(event.transform);
        });

      this.svg.call(this.zoom);
    }

    // Create main group for graph elements
    this.g = this.svg.append('g').attr('class', 'graph-container');
  }

  /**
   * Initialize Canvas-based rendering (placeholder for future implementation)
   */
  private initializeCanvasEngine(): void {
    d3.select(this.container)
      .append('canvas')
      .attr('width', this.config.width)
      .attr('height', this.config.height);

    console.log('Canvas rendering engine initialized (placeholder)');
    // TODO: Implement canvas rendering
  }

  /**
   * Initialize WebGL-based rendering (placeholder for future implementation)
   */
  private initializeWebGLEngine(): void {
    d3.select(this.container)
      .append('canvas')
      .attr('width', this.config.width)
      .attr('height', this.config.height);

    console.log('WebGL rendering engine initialized (placeholder)');
    // TODO: Implement WebGL rendering using three.js or similar
  }

  /**
   * Wait for D3.js to be available
   */
  private async waitForD3(): Promise<void> {
    if (window.d3) return;

    const maxAttempts = 50;
    const delay = 100;

    for (let i = 0; i < maxAttempts; i++) {
      if (window.d3) {
        console.log('✅ D3.js is now available');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw new Error('D3.js failed to load within timeout period');
  }

  /**
   * Load and render graph data
   */
  public setData(data: GraphData): void {
    this.data = this.dataProcessor.processGraphData(data);
    this.filteredData = null; // Reset filters
    this.render();
  }

  /**
   * Apply filters to the graph data
   */
  public applyFilters(filters: any): void {
    this.filteredData = this.dataProcessor.filterGraphData(this.data, filters);
    this.render();
  }

  /**
   * Main render function
   */
  public render(): void {
    if (!this.g || !this.data.nodes.length) return;

    const graphData = this.filteredData || this.data;
    
    // Initialize node positions if needed
    this.dataProcessor.initializeNodePositions(graphData.nodes, this.config.width, this.config.height);

    // Setup simulation
    this.setupSimulation(graphData);

    // Render nodes and edges
    this.renderEdges(graphData.edges);
    this.renderNodes(graphData.nodes);

    // Apply theme
    this.themeManager.applyTheme(this.g);
  }

  /**
   * Setup force simulation
   */
  private setupSimulation(data: GraphData): void {
    if (this.simulation) {
      this.simulation.stop();
    }

    if (this.config.type !== 'force-directed') return;

    this.simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(data.edges)
        .id(d => d.id)
        .distance(this.config.simulation?.linkDistance || 100))
      .force('charge', d3.forceManyBody()
        .strength(this.config.simulation?.strength || -300))
      .force('center', d3.forceCenter(
        this.config.simulation?.center.x || this.config.width / 2,
        this.config.simulation?.center.y || this.config.height / 2
      ))
      .force('collision', d3.forceCollide()
        .radius(this.config.simulation?.collisionRadius || 30));

    // Add clustering force if enabled
    if (this.config.clustering?.enabled) {
      this.simulation.force('cluster', this.createClusteringForce());
    }

    // Update positions on tick
    this.simulation.on('tick', () => {
      this.updatePositions();
      this.callbacks.onSimulationTick?.(data.nodes, data.edges);
    });
  }

  /**
   * Create clustering force for grouping nodes
   */
  private createClusteringForce(): (alpha: number) => void {
    let nodes: GraphNode[];
    const strength = this.config.clustering?.strength || 0.1;

    function force(alpha: number) {
      const centroids = new Map<string, { x: number; y: number; count: number }>();

      // Calculate centroid for each group
      nodes.forEach(node => {
        if (node.parentGroupId) {
          let centroid = centroids.get(node.parentGroupId);
          if (!centroid) {
            centroid = { x: 0, y: 0, count: 0 };
            centroids.set(node.parentGroupId, centroid);
          }
          centroid.x += node.x || 0;
          centroid.y += node.y || 0;
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
          if (centroid && node.vx !== undefined && node.vy !== undefined) {
            node.vx -= ((node.x || 0) - centroid.x) * alpha * strength;
            node.vy -= ((node.y || 0) - centroid.y) * alpha * strength;
          }
        }
      });
    }

    force.initialize = (_nodes: GraphNode[]) => nodes = _nodes;
    return force;
  }

  /**
   * Render graph edges
   */
  private renderEdges(edges: GraphEdge[]): void {
    if (!this.g) return;

    const linkSelection = this.g.selectAll('.link')
      .data(edges, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);

    // Remove old edges
    linkSelection.exit()
      .transition()
      .duration(this.animationController.getTransitionDuration())
      .style('opacity', 0)
      .remove();

    // Add new edges
    const newLinks = linkSelection.enter()
      .append('line')
      .attr('class', 'link')
      .style('opacity', 0);

    // Style all edges
    linkSelection.merge(newLinks as any)
      .attr('stroke', (d: any) => this.themeManager.getEdgeColor(d))
      .attr('stroke-width', (d: any) => this.themeManager.getEdgeWidth(d))
      .attr('stroke-dasharray', (d: any) => this.themeManager.getEdgeDashArray(d))
      .style('opacity', (d: any) => this.themeManager.getEdgeOpacity(d))
      .on('mouseover', (event: Event, d: GraphEdge) => {
        this.callbacks.onEdgeHover?.(d, event);
      })
      .on('mouseout', (event: Event) => {
        this.callbacks.onEdgeHover?.(null, event);
      })
      .on('click', (event: Event, d: GraphEdge) => {
        this.callbacks.onEdgeClick?.(d, event);
      });

    // Animate new edges
    newLinks.transition()
      .duration(this.animationController.getTransitionDuration())
      .style('opacity', (d: any) => this.themeManager.getEdgeOpacity(d));
  }

  /**
   * Render graph nodes
   */
  private renderNodes(nodes: GraphNode[]): void {
    if (!this.g) return;

    const nodeSelection = this.g.selectAll('.node')
      .data(nodes, (d: any) => d.id);

    // Remove old nodes
    nodeSelection.exit()
      .transition()
      .duration(this.animationController.getTransitionDuration())
      .style('opacity', 0)
      .remove();

    // Add new nodes
    const newNodes = nodeSelection.enter()
      .append('g')
      .attr('class', 'node')
      .attr('data-node-id', (d: GraphNode) => d.id)
      .style('opacity', 0);

    // Add visual elements to new nodes
    this.styleNodes(newNodes);

    // Apply interactions
    if (this.config.enableDrag) {
      newNodes.call(this.interactionHandler.getDragBehavior(this.simulation));
    }

    newNodes
      .on('click', (event: Event, d: GraphNode) => {
        this.callbacks.onNodeClick?.(d, event);
      })
      .on('mouseover', (event: Event, d: GraphNode) => {
        this.callbacks.onNodeHover?.(d, event);
      })
      .on('mouseout', (event: Event) => {
        this.callbacks.onNodeHover?.(null, event);
      });

    // Animate new nodes
    newNodes.transition()
      .duration(this.animationController.getTransitionDuration())
      .style('opacity', 1);

    // Update all nodes with pattern styling
    nodeSelection.merge(newNodes as any)
      .select('circle')
      .attr('fill', (d: any) => {
        const patternStyling = d.patternStyling;
        return patternStyling ? patternStyling.color : this.themeManager.getNodeColor(d);
      })
      .attr('r', (d: any) => {
        const baseRadius = this.themeManager.getNodeRadius(d);
        const patternStyling = d.patternStyling;
        return patternStyling ? baseRadius * patternStyling.sizeMultiplier : baseRadius;
      })
      .attr('stroke', (d: any) => {
        const patternStyling = d.patternStyling;
        if (patternStyling && patternStyling.border.color !== 'none') {
          return patternStyling.border.color;
        }
        return this.themeManager.getNodeStroke(d);
      })
      .attr('stroke-width', (d: any) => {
        const patternStyling = d.patternStyling;
        if (patternStyling && patternStyling.border.width > 0) {
          return patternStyling.border.width;
        }
        return this.themeManager.getNodeStrokeWidth(d);
      })
      .attr('stroke-dasharray', (d: any) => {
        const patternStyling = d.patternStyling;
        if (patternStyling && patternStyling.border.style === 'dashed') {
          return '5,5';
        } else if (patternStyling && patternStyling.border.style === 'dotted') {
          return '2,2';
        }
        return null;
      })
      .style('filter', (d: any) => {
        const patternStyling = d.patternStyling;
        return patternStyling ? patternStyling.effect : this.themeManager.getNodeFilter(d);
      });
  }

  /**
   * Style node elements
   */
  private styleNodes(selection: d3.Selection<any, GraphNode, any, any>): void {
    // Add circles with pattern-based styling
    selection.append('circle')
      .attr('r', (d: GraphNode) => {
        const baseRadius = this.themeManager.getNodeRadius(d);
        const patternStyling = (d as any).patternStyling;
        return patternStyling ? baseRadius * patternStyling.sizeMultiplier : baseRadius;
      })
      .attr('fill', (d: GraphNode) => {
        const patternStyling = (d as any).patternStyling;
        return patternStyling ? patternStyling.color : this.themeManager.getNodeColor(d);
      })
      .attr('stroke', (d: GraphNode) => {
        const patternStyling = (d as any).patternStyling;
        if (patternStyling && patternStyling.border.color !== 'none') {
          return patternStyling.border.color;
        }
        return this.themeManager.getNodeStroke(d);
      })
      .attr('stroke-width', (d: GraphNode) => {
        const patternStyling = (d as any).patternStyling;
        if (patternStyling && patternStyling.border.width > 0) {
          return patternStyling.border.width;
        }
        return this.themeManager.getNodeStrokeWidth(d);
      })
      .attr('stroke-dasharray', (d: GraphNode) => {
        const patternStyling = (d as any).patternStyling;
        if (patternStyling && patternStyling.border.style === 'dashed') {
          return '5,5';
        } else if (patternStyling && patternStyling.border.style === 'dotted') {
          return '2,2';
        }
        return null;
      })
      .style('filter', (d: GraphNode) => {
        const patternStyling = (d as any).patternStyling;
        return patternStyling ? patternStyling.effect : this.themeManager.getNodeFilter(d);
      });

    // Add expansion indicator for group nodes
    selection.filter((d: GraphNode) => d.type?.includes('-group'))
      .append('text')
      .attr('class', 'expansion-indicator')
      .attr('x', -25)
      .attr('y', 5)
      .attr('fill', '#4ecdc4')
      .attr('font-size', '14px')
      .text((d: GraphNode) => d.isExpanded ? '▼' : '▶');
    
    // Add pattern icons for nodes with patterns
    selection.filter((d: GraphNode) => (d as any).patternStyling?.icon)
      .append('text')
      .attr('class', 'pattern-icon')
      .attr('x', 0)
      .attr('y', -15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .text((d: GraphNode) => (d as any).patternStyling?.icon || '')
      .style('pointer-events', 'none')
      .style('opacity', 0.8);
    
    // Add labels
    selection.append('text')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .text((d: GraphNode) => d.name)
      .style('font-size', (d: GraphNode) => this.themeManager.getNodeFontSize(d, this.currentTransform.k))
      .style('opacity', (d: GraphNode) => this.themeManager.getNodeLabelOpacity(d, this.currentTransform.k))
      .style('font-weight', (d: GraphNode) => this.themeManager.getNodeFontWeight(d))
      .style('text-shadow', (d: GraphNode) => this.themeManager.getNodeTextShadow(d))
      .style('pointer-events', 'none');
  }

  /**
   * Update positions on simulation tick
   */
  private updatePositions(): void {
    if (!this.g) return;

    this.g.selectAll('.link')
      .attr('x1', (d: any) => d.source.x || 0)
      .attr('y1', (d: any) => d.source.y || 0)
      .attr('x2', (d: any) => d.target.x || 0)
      .attr('y2', (d: any) => d.target.y || 0);

    this.g.selectAll('.node')
      .attr('transform', (d: any) => `translate(${d.x || 0},${d.y || 0})`);
  }

  /**
   * Update semantic zooming based on scale
   */
  private updateSemanticZooming(scale: number): void {
    if (!this.g || !this.config.semanticZooming?.enabled) return;

    this.g.selectAll('.node text')
      .style('opacity', (d: any) => this.themeManager.getNodeLabelOpacity(d, scale))
      .style('font-size', (d: any) => this.themeManager.getNodeFontSize(d, scale));
  }

  /**
   * Highlight nodes and edges
   */
  public highlightElements(nodeIds: string[], edgeIds: string[] = []): void {
    this.highlightedNodes = new Set(nodeIds);
    
    if (!this.g) return;

    // Update node highlighting
    this.g.selectAll('.node')
      .classed('highlighted', (d: any) => this.highlightedNodes.has(d.id))
      .style('opacity', (d: any) => {
        if (this.highlightedNodes.size === 0) return 1;
        return this.highlightedNodes.has(d.id) ? 1 : 0.2;
      });

    // Update edge highlighting
    this.g.selectAll('.link')
      .classed('highlighted', (d: any) => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source?.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target?.id;
        return this.highlightedNodes.has(sourceId) || this.highlightedNodes.has(targetId);
      })
      .style('opacity', (d: any) => {
        if (this.highlightedNodes.size === 0) return this.themeManager.getEdgeOpacity(d);
        const sourceId = typeof d.source === 'string' ? d.source : d.source?.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target?.id;
        return (this.highlightedNodes.has(sourceId) || this.highlightedNodes.has(targetId)) ? 1 : 0.1;
      });
  }

  /**
   * Clear all highlighting
   */
  public clearHighlights(): void {
    this.highlightedNodes.clear();
    
    if (!this.g) return;

    this.g.selectAll('.node')
      .classed('highlighted', false)
      .style('opacity', 1);

    this.g.selectAll('.link')
      .classed('highlighted', false)
      .style('opacity', (d: any) => this.themeManager.getEdgeOpacity(d));
  }

  /**
   * Transform controls
   */
  public resetZoom(): void {
    if (this.svg && this.zoom) {
      this.svg.transition()
        .duration(750)
        .call(this.zoom.transform, d3.zoomIdentity);
    }
  }

  public centerGraph(): void {
    if (!this.svg || !this.g || !this.zoom) return;

    try {
      const bounds = (this.g.node() as any).getBBox();
      if (isNaN(bounds.x) || isNaN(bounds.y) || bounds.width === 0 || bounds.height === 0) {
        return;
      }

      const fullWidth = this.config.width;
      const fullHeight = this.config.height;
      const width = bounds.width;
      const height = bounds.height;
      const midX = bounds.x + width / 2;
      const midY = bounds.y + height / 2;

      const scale = Math.min(fullWidth / width, fullHeight / height) * 0.8;
      const translateX = fullWidth / 2 - scale * midX;
      const translateY = fullHeight / 2 - scale * midY;

      const transform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);

      this.svg.transition()
        .duration(750)
        .call(this.zoom.transform, transform);
    } catch (error) {
      console.warn('Could not center graph:', error);
    }
  }

  public zoomToNode(nodeId: string, scale: number = 2): void {
    const node = this.data.nodes.find(n => n.id === nodeId);
    if (!node || !this.svg || !this.zoom || node.x === undefined || node.y === undefined) return;

    const transform = d3.zoomIdentity
      .translate(this.config.width / 2, this.config.height / 2)
      .scale(scale)
      .translate(-node.x, -node.y);

    this.svg.transition()
      .duration(750)
      .call(this.zoom.transform, transform);
  }

  /**
   * Simulation controls
   */
  public startSimulation(): void {
    this.simulation?.alpha(1).restart();
  }

  public stopSimulation(): void {
    this.simulation?.stop();
  }

  public toggleSimulation(): void {
    if (this.simulation) {
      if (this.simulation.alpha() > 0) {
        this.stopSimulation();
      } else {
        this.startSimulation();
      }
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<GraphConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.themeManager.setTheme(this.config.theme);
    this.render();
  }

  /**
   * Get current state
   */
  public getState() {
    return {
      data: this.data,
      filteredData: this.filteredData,
      config: this.config,
      selectedNodes: Array.from(this.selectedNodes),
      highlightedNodes: Array.from(this.highlightedNodes),
      transform: this.currentTransform,
      isSimulationRunning: this.simulation ? this.simulation.alpha() > 0 : false
    };
  }

  /**
   * Get the theme manager instance
   */
  public getThemeManager(): GraphThemeManager {
    return this.themeManager;
  }

  /**
   * Update data and re-render
   */
  public updateData(data: GraphData): void {
    this.setData(data);
    this.render();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.simulation?.stop();
    d3.select(this.container).selectAll('*').remove();
    this.selectedNodes.clear();
    this.highlightedNodes.clear();
  }
}

// Extend window interface for D3
declare global {
  interface Window {
    d3: any;
  }
}