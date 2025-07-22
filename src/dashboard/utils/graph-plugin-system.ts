/**
 * GraphPluginSystem - Extensible plugin architecture for graph visualizations
 * 
 * Provides a flexible plugin system that allows extending the graph visualization engine
 * with custom behaviors, renderers, layouts, and interaction patterns.
 */

import { GraphNode, GraphEdge } from '../../shared/types/api';
import { GraphVisualizationEngine, GraphConfig, GraphData } from './graph-viz-engine';
import * as d3 from 'd3';

export interface PluginContext {
  engine: GraphVisualizationEngine;
  data: GraphData;
  config: GraphConfig;
  svg?: d3.Selection<any, unknown, null, undefined>;
  g?: d3.Selection<any, unknown, null, undefined>;
  simulation?: d3.Simulation<GraphNode, GraphEdge>;
}

export interface GraphPlugin {
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
  
  // Lifecycle hooks
  initialize?(context: PluginContext): void | Promise<void>;
  beforeRender?(context: PluginContext): void | Promise<void>;
  afterRender?(context: PluginContext): void | Promise<void>;
  beforeDataUpdate?(context: PluginContext, newData: GraphData): void | Promise<void>;
  afterDataUpdate?(context: PluginContext, newData: GraphData): void | Promise<void>;
  destroy?(context: PluginContext): void | Promise<void>;
  
  // Event handlers
  onNodeClick?(node: GraphNode, event: Event, context: PluginContext): void;
  onNodeHover?(node: GraphNode | null, event: Event, context: PluginContext): void;
  onEdgeClick?(edge: GraphEdge, event: Event, context: PluginContext): void;
  onEdgeHover?(edge: GraphEdge | null, event: Event, context: PluginContext): void;
  onZoom?(transform: d3.ZoomTransform, context: PluginContext): void;
  
  // Custom rendering
  customNodeRenderer?(selection: d3.Selection<any, GraphNode, any, any>, context: PluginContext): void;
  customEdgeRenderer?(selection: d3.Selection<any, GraphEdge, any, any>, context: PluginContext): void;
  
  // Layout algorithms
  customLayout?(nodes: GraphNode[], edges: GraphEdge[], config: GraphConfig): void;
  
  // Settings/configuration
  getSettings?(): PluginSettings;
  applySettings?(settings: PluginSettings): void;
}

export interface PluginSettings {
  [key: string]: any;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  dependencies?: string[];
  main: string; // Entry point for the plugin
  settings?: PluginSettings;
}

export class GraphPluginSystem {
  private plugins: Map<string, GraphPlugin> = new Map();
  private pluginContexts: Map<string, PluginContext> = new Map();
  private loadedManifests: Map<string, PluginManifest> = new Map();
  private engine: GraphVisualizationEngine;

  constructor(engine: GraphVisualizationEngine) {
    this.engine = engine;
  }

  /**
   * Register a plugin
   */
  public registerPlugin(plugin: GraphPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin ${plugin.name} is already registered`);
      return;
    }

    // Check dependencies
    if (plugin.dependencies) {
      const missingDeps = plugin.dependencies.filter(dep => !this.plugins.has(dep));
      if (missingDeps.length > 0) {
        throw new Error(`Plugin ${plugin.name} has missing dependencies: ${missingDeps.join(', ')}`);
      }
    }

    this.plugins.set(plugin.name, plugin);
    console.log(`Plugin ${plugin.name} v${plugin.version} registered successfully`);
  }

  /**
   * Unregister a plugin
   */
  public unregisterPlugin(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      console.warn(`Plugin ${name} is not registered`);
      return;
    }

    // Check if other plugins depend on this one
    const dependents = Array.from(this.plugins.values())
      .filter(p => p.dependencies?.includes(name));
    
    if (dependents.length > 0) {
      throw new Error(`Cannot unregister plugin ${name}. It is required by: ${dependents.map(p => p.name).join(', ')}`);
    }

    // Destroy plugin
    const context = this.pluginContexts.get(name);
    if (context && plugin.destroy) {
      plugin.destroy(context);
    }

    this.plugins.delete(name);
    this.pluginContexts.delete(name);
    this.loadedManifests.delete(name);
    
    console.log(`Plugin ${name} unregistered successfully`);
  }

  /**
   * Initialize all plugins
   */
  public async initializePlugins(context: Omit<PluginContext, 'engine'>): Promise<void> {
    const fullContext: PluginContext = { engine: this.engine, ...context };

    for (const [name, plugin] of this.plugins) {
      try {
        this.pluginContexts.set(name, fullContext);
        
        if (plugin.initialize) {
          await plugin.initialize(fullContext);
        }
        
        console.log(`Plugin ${name} initialized successfully`);
      } catch (error) {
        console.error(`Failed to initialize plugin ${name}:`, error);
      }
    }
  }

  /**
   * Execute before render hooks
   */
  public async executeBeforeRenderHooks(context: PluginContext): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.beforeRender) {
          await plugin.beforeRender(context);
        }
      } catch (error) {
        console.error(`Plugin ${name} beforeRender hook failed:`, error);
      }
    }
  }

  /**
   * Execute after render hooks
   */
  public async executeAfterRenderHooks(context: PluginContext): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.afterRender) {
          await plugin.afterRender(context);
        }
      } catch (error) {
        console.error(`Plugin ${name} afterRender hook failed:`, error);
      }
    }
  }

  /**
   * Execute data update hooks
   */
  public async executeDataUpdateHooks(context: PluginContext, newData: GraphData, phase: 'before' | 'after'): Promise<void> {
    const hookName = phase === 'before' ? 'beforeDataUpdate' : 'afterDataUpdate';
    
    for (const [name, plugin] of this.plugins) {
      try {
        const hook = plugin[hookName];
        if (hook) {
          await hook(context, newData);
        }
      } catch (error) {
        console.error(`Plugin ${name} ${hookName} hook failed:`, error);
      }
    }
  }

  /**
   * Execute event handlers
   */
  public executeNodeClickHandlers(node: GraphNode, event: Event, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onNodeClick) {
          plugin.onNodeClick(node, event, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} node click handler failed:`, error);
      }
    }
  }

  public executeNodeHoverHandlers(node: GraphNode | null, event: Event, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onNodeHover) {
          plugin.onNodeHover(node, event, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} node hover handler failed:`, error);
      }
    }
  }

  public executeEdgeClickHandlers(edge: GraphEdge, event: Event, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onEdgeClick) {
          plugin.onEdgeClick(edge, event, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} edge click handler failed:`, error);
      }
    }
  }

  public executeEdgeHoverHandlers(edge: GraphEdge | null, event: Event, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onEdgeHover) {
          plugin.onEdgeHover(edge, event, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} edge hover handler failed:`, error);
      }
    }
  }

  public executeZoomHandlers(transform: d3.ZoomTransform, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onZoom) {
          plugin.onZoom(transform, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} zoom handler failed:`, error);
      }
    }
  }

  /**
   * Execute custom renderers
   */
  public executeCustomNodeRenderers(selection: d3.Selection<any, GraphNode, any, any>, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.customNodeRenderer) {
          plugin.customNodeRenderer(selection, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} custom node renderer failed:`, error);
      }
    }
  }

  public executeCustomEdgeRenderers(selection: d3.Selection<any, GraphEdge, any, any>, context: PluginContext): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.customEdgeRenderer) {
          plugin.customEdgeRenderer(selection, context);
        }
      } catch (error) {
        console.error(`Plugin ${name} custom edge renderer failed:`, error);
      }
    }
  }

  /**
   * Execute custom layouts
   */
  public executeCustomLayouts(nodes: GraphNode[], edges: GraphEdge[], config: GraphConfig): void {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.customLayout) {
          plugin.customLayout(nodes, edges, config);
        }
      } catch (error) {
        console.error(`Plugin ${name} custom layout failed:`, error);
      }
    }
  }

  /**
   * Load plugin from manifest
   */
  public async loadPlugin(manifest: PluginManifest): Promise<void> {
    try {
      // Dynamic import of the plugin module
      const module = await import(manifest.main);
      const PluginClass = module.default || module[manifest.name];
      
      if (!PluginClass) {
        throw new Error(`Plugin class not found in ${manifest.main}`);
      }
      
      // Create plugin instance
      const plugin: GraphPlugin = new PluginClass();
      
      // Validate plugin structure
      if (!plugin.name || !plugin.version) {
        throw new Error('Plugin must have name and version properties');
      }
      
      // Store manifest
      this.loadedManifests.set(plugin.name, manifest);
      
      // Register plugin
      this.registerPlugin(plugin);
      
    } catch (error) {
      console.error(`Failed to load plugin from ${manifest.main}:`, error);
      throw error;
    }
  }

  /**
   * Get registered plugin
   */
  public getPlugin(name: string): GraphPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   */
  public getPlugins(): GraphPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin names
   */
  public getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin settings
   */
  public getPluginSettings(name: string): PluginSettings | undefined {
    const plugin = this.plugins.get(name);
    return plugin?.getSettings?.();
  }

  /**
   * Apply plugin settings
   */
  public applyPluginSettings(name: string, settings: PluginSettings): void {
    const plugin = this.plugins.get(name);
    if (plugin?.applySettings) {
      plugin.applySettings(settings);
    }
  }

  /**
   * Check if plugin is loaded
   */
  public isPluginLoaded(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get plugin dependency graph
   */
  public getDependencyGraph(): { [plugin: string]: string[] } {
    const graph: { [plugin: string]: string[] } = {};
    
    for (const [name, plugin] of this.plugins) {
      graph[name] = plugin.dependencies || [];
    }
    
    return graph;
  }

  /**
   * Validate plugin dependencies
   */
  public validateDependencies(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [name, plugin] of this.plugins) {
      if (plugin.dependencies) {
        const missingDeps = plugin.dependencies.filter(dep => !this.plugins.has(dep));
        if (missingDeps.length > 0) {
          errors.push(`Plugin ${name} has missing dependencies: ${missingDeps.join(', ')}`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Destroy all plugins
   */
  public async destroyAllPlugins(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      const context = this.pluginContexts.get(name);
      if (context && plugin.destroy) {
        try {
          await plugin.destroy(context);
        } catch (error) {
          console.error(`Failed to destroy plugin ${name}:`, error);
        }
      }
    }
    
    this.plugins.clear();
    this.pluginContexts.clear();
    this.loadedManifests.clear();
  }
}

/**
 * Base plugin class that other plugins can extend
 */
export abstract class BaseGraphPlugin implements GraphPlugin {
  abstract name: string;
  abstract version: string;
  abstract description: string;
  
  dependencies?: string[];
  
  // Default implementations - can be overridden
  initialize?(context: PluginContext): void | Promise<void>;
  beforeRender?(context: PluginContext): void | Promise<void>;
  afterRender?(context: PluginContext): void | Promise<void>;
  beforeDataUpdate?(context: PluginContext, newData: GraphData): void | Promise<void>;
  afterDataUpdate?(context: PluginContext, newData: GraphData): void | Promise<void>;
  destroy?(context: PluginContext): void | Promise<void>;
  
  onNodeClick?(node: GraphNode, event: Event, context: PluginContext): void;
  onNodeHover?(node: GraphNode | null, event: Event, context: PluginContext): void;
  onEdgeClick?(edge: GraphEdge, event: Event, context: PluginContext): void;
  onEdgeHover?(edge: GraphEdge | null, event: Event, context: PluginContext): void;
  onZoom?(transform: d3.ZoomTransform, context: PluginContext): void;
  
  customNodeRenderer?(selection: d3.Selection<any, GraphNode, any, any>, context: PluginContext): void;
  customEdgeRenderer?(selection: d3.Selection<any, GraphEdge, any, any>, context: PluginContext): void;
  customLayout?(nodes: GraphNode[], edges: GraphEdge[], config: GraphConfig): void;
  
  getSettings?(): PluginSettings;
  applySettings?(settings: PluginSettings): void;
}

// Example plugin implementations

/**
 * Mini-map plugin for graph navigation
 */
export class MiniMapPlugin extends BaseGraphPlugin {
  name = 'minimap';
  version = '1.0.0';
  description = 'Provides a mini-map for graph navigation';

  private miniMapContainer: HTMLElement | null = null;
  private miniMapSvg: d3.Selection<any, unknown, null, undefined> | null = null;

  async initialize(context: PluginContext): Promise<void> {
    this.createMiniMap(context);
  }

  private createMiniMap(context: PluginContext): void {
    // Create mini-map container
    this.miniMapContainer = document.createElement('div');
    this.miniMapContainer.id = 'graph-minimap';
    this.miniMapContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      width: 200px;
      height: 150px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #555;
      border-radius: 4px;
      z-index: 1000;
    `;
    
    // Add to container
    const mainContainer = context.engine.getState().data.nodes.length > 0 
      ? document.querySelector('#relationshipGraph')?.parentElement 
      : null;
    
    if (mainContainer) {
      mainContainer.appendChild(this.miniMapContainer);
      
      // Create mini-map SVG
      this.miniMapSvg = d3.select(this.miniMapContainer)
        .append('svg')
        .attr('width', 200)
        .attr('height', 150);
    }
  }

  afterRender(context: PluginContext): void {
    this.updateMiniMap(context);
  }

  private updateMiniMap(context: PluginContext): void {
    if (!this.miniMapSvg) return;
    
    const data = context.data;
    // Simplified mini-map rendering
    this.miniMapSvg.selectAll('*').remove();
    
    // Draw simplified nodes
    this.miniMapSvg.selectAll('.mini-node')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('class', 'mini-node')
      .attr('cx', d => (d.x || 0) * 0.2)
      .attr('cy', d => (d.y || 0) * 0.15)
      .attr('r', 2)
      .attr('fill', '#4ecdc4');
  }

  destroy(context: PluginContext): void {
    if (this.miniMapContainer) {
      this.miniMapContainer.remove();
    }
  }
}

/**
 * Graph metrics plugin for real-time analysis
 */
export class GraphMetricsPlugin extends BaseGraphPlugin {
  name = 'metrics';
  version = '1.0.0';
  description = 'Displays real-time graph metrics and analytics';

  private metricsPanel: HTMLElement | null = null;

  async initialize(context: PluginContext): Promise<void> {
    this.createMetricsPanel();
  }

  private createMetricsPanel(): void {
    this.metricsPanel = document.createElement('div');
    this.metricsPanel.id = 'graph-metrics';
    this.metricsPanel.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      min-width: 150px;
    `;
    
    const mainContainer = document.querySelector('#relationshipGraph')?.parentElement;
    if (mainContainer) {
      mainContainer.appendChild(this.metricsPanel);
    }
  }

  afterRender(context: PluginContext): void {
    this.updateMetrics(context);
  }

  afterDataUpdate(context: PluginContext, newData: GraphData): void {
    this.updateMetrics(context);
  }

  private updateMetrics(context: PluginContext): void {
    if (!this.metricsPanel) return;
    
    const data = context.data;
    const nodeCount = data.nodes.length;
    const edgeCount = data.edges.length;
    const density = nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0;
    
    this.metricsPanel.innerHTML = `
      <div><strong>Graph Metrics</strong></div>
      <div>Nodes: ${nodeCount}</div>
      <div>Edges: ${edgeCount}</div>
      <div>Density: ${density.toFixed(3)}</div>
      <div>Avg Degree: ${nodeCount > 0 ? (2 * edgeCount / nodeCount).toFixed(1) : '0'}</div>
    `;
  }

  destroy(context: PluginContext): void {
    if (this.metricsPanel) {
      this.metricsPanel.remove();
    }
  }
}