/**
 * GraphInteractionHandler - User interaction management for graph visualizations
 * 
 * Handles drag, zoom, click, hover, and keyboard interactions for graph elements.
 * Provides a unified interface for different interaction patterns and gestures.
 */

import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '../../shared/types/api';
import { GraphConfig, GraphEventCallbacks } from './graph-viz-engine';

export interface InteractionState {
  isDragging: boolean;
  isZooming: boolean;
  selectedNodes: Set<string>;
  hoveredNode: string | null;
  hoveredEdge: string | null;
  lastClickTime: number;
  multiSelectMode: boolean;
  panningEnabled: boolean;
}

export interface GestureConfig {
  enableDoubleClick: boolean;
  enableRightClick: boolean;
  enableMultiSelect: boolean;
  enableKeyboardShortcuts: boolean;
  doubleClickDelay: number;
  hoverDelay: number;
  longPressDelay: number;
}

export class GraphInteractionHandler {
  private config: GraphConfig;
  private callbacks: GraphEventCallbacks;
  private gestureConfig: GestureConfig;
  private state: InteractionState;
  
  // Interaction behaviors
  private dragBehavior: d3.DragBehavior<any, GraphNode, any> | null = null;
  private tooltipTimer: NodeJS.Timeout | null = null;
  private doubleClickTimer: NodeJS.Timeout | null = null;
  private longPressTimer: NodeJS.Timeout | null = null;

  // Event listeners for cleanup
  private eventListeners: Array<{ element: Element; event: string; handler: EventListener }> = [];

  constructor(config: GraphConfig, callbacks: GraphEventCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    
    // Default gesture configuration
    this.gestureConfig = {
      enableDoubleClick: true,
      enableRightClick: true,
      enableMultiSelect: true,
      enableKeyboardShortcuts: true,
      doubleClickDelay: 300,
      hoverDelay: 500,
      longPressDelay: 800
    };

    // Initialize interaction state
    this.state = {
      isDragging: false,
      isZooming: false,
      selectedNodes: new Set(),
      hoveredNode: null,
      hoveredEdge: null,
      lastClickTime: 0,
      multiSelectMode: false,
      panningEnabled: true
    };

    this.setupKeyboardListeners();
  }

  /**
   * Create drag behavior for nodes
   */
  public getDragBehavior(simulation: d3.Simulation<GraphNode, GraphEdge> | null): d3.DragBehavior<any, GraphNode, any> {
    if (!this.config.enableDrag || this.dragBehavior) {
      return this.dragBehavior || d3.drag<any, GraphNode>();
    }

    this.dragBehavior = d3.drag<any, GraphNode>()
      .on('start', (event: d3.D3DragEvent<any, GraphNode, any>, d: GraphNode) => {
        this.handleDragStart(event, d, simulation);
      })
      .on('drag', (event: d3.D3DragEvent<any, GraphNode, any>, d: GraphNode) => {
        this.handleDrag(event, d);
      })
      .on('end', (event: d3.D3DragEvent<any, GraphNode, any>, d: GraphNode) => {
        this.handleDragEnd(event, d, simulation);
      });

    return this.dragBehavior;
  }

  /**
   * Handle drag start
   */
  private handleDragStart(event: d3.D3DragEvent<any, GraphNode, any>, node: GraphNode, simulation: d3.Simulation<GraphNode, GraphEdge> | null): void {
    this.state.isDragging = true;
    
    // Prevent click event from firing after drag
    event.sourceEvent.stopPropagation();
    
    // Restart simulation if not active
    if (simulation && !event.active) {
      simulation.alphaTarget(0.3).restart();
    }
    
    // Fix node position
    node.fx = node.x;
    node.fy = node.y;
    
    // Visual feedback
    this.addNodeDragClass(event.subject);
    
    // Trigger callback
    this.callbacks.onNodeHover?.(node, event.sourceEvent);
  }

  /**
   * Handle drag
   */
  private handleDrag(event: d3.D3DragEvent<any, GraphNode, any>, node: GraphNode): void {
    // Update node position
    node.fx = event.x;
    node.fy = event.y;
  }

  /**
   * Handle drag end
   */
  private handleDragEnd(event: d3.D3DragEvent<any, GraphNode, any>, node: GraphNode, simulation: d3.Simulation<GraphNode, GraphEdge> | null): void {
    this.state.isDragging = false;
    
    // Stop simulation target
    if (simulation && !event.active) {
      simulation.alphaTarget(0);
    }
    
    // Release node position (or keep it fixed based on settings)
    if (!this.state.multiSelectMode) {
      node.fx = null;
      node.fy = null;
    }
    
    // Remove visual feedback
    this.removeNodeDragClass(event.subject);
    
    // Clear hover state if dragging
    setTimeout(() => {
      if (!this.state.isDragging) {
        this.callbacks.onNodeHover?.(null, event.sourceEvent);
      }
    }, 100);
  }

  /**
   * Handle node clicks with support for double-click and multi-select
   */
  public handleNodeClick(event: Event, node: GraphNode): void {
    event.stopPropagation();
    
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - this.state.lastClickTime;
    this.state.lastClickTime = currentTime;

    // Check for double-click
    if (this.gestureConfig.enableDoubleClick && timeSinceLastClick < this.gestureConfig.doubleClickDelay) {
      this.handleNodeDoubleClick(event, node);
      return;
    }

    // Handle single click after delay (to distinguish from double-click)
    if (this.doubleClickTimer) {
      clearTimeout(this.doubleClickTimer);
    }
    
    this.doubleClickTimer = setTimeout(() => {
      this.handleNodeSingleClick(event, node);
    }, this.gestureConfig.doubleClickDelay);
  }

  /**
   * Handle single node click
   */
  private handleNodeSingleClick(event: Event, node: GraphNode): void {
    // Multi-select handling
    if (this.state.multiSelectMode || (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) {
      this.toggleNodeSelection(node.id);
    } else {
      this.clearSelection();
      this.selectNode(node.id);
    }
    
    // Trigger callback
    this.callbacks.onNodeClick?.(node, event);
  }

  /**
   * Handle double node click
   */
  private handleNodeDoubleClick(event: Event, node: GraphNode): void {
    // Default double-click behavior: expand/collapse groups or focus node
    if (node.type.includes('-group')) {
      // Group expansion logic would go here
      console.log('Double-clicked group node:', node.name);
    } else {
      // Focus on node (zoom to fit)
      console.log('Double-clicked regular node:', node.name);
    }
    
    // Custom double-click callback could be added if needed
  }

  /**
   * Handle node hover with delay and tooltip management
   */
  public handleNodeHover(event: Event, node: GraphNode | null): void {
    // Clear existing tooltip timer
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }

    if (node) {
      this.state.hoveredNode = node.id;
      
      // Show tooltip after delay
      this.tooltipTimer = setTimeout(() => {
        this.showTooltip(event, node);
      }, this.gestureConfig.hoverDelay);
      
      // Apply hover styling immediately
      this.addNodeHoverClass(node);
      
    } else {
      this.state.hoveredNode = null;
      this.removeAllHoverClasses();
      this.hideTooltip();
    }
    
    // Trigger callback
    this.callbacks.onNodeHover?.(node, event);
  }

  /**
   * Handle edge interactions
   */
  public handleEdgeClick(event: Event, edge: GraphEdge): void {
    event.stopPropagation();
    this.callbacks.onEdgeClick?.(edge, event);
  }

  public handleEdgeHover(event: Event, edge: GraphEdge | null): void {
    if (edge) {
      this.state.hoveredEdge = edge.source + '-' + edge.target;
      this.addEdgeHoverClass(edge);
    } else {
      this.state.hoveredEdge = null;
      this.removeAllEdgeHoverClasses();
    }
    
    this.callbacks.onEdgeHover?.(edge, event);
  }

  /**
   * Handle right-click context menu
   */
  public handleRightClick(event: MouseEvent, node?: GraphNode, edge?: GraphEdge): void {
    if (!this.gestureConfig.enableRightClick) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // Show context menu
    this.showContextMenu(event, node, edge);
  }

  /**
   * Handle long press for touch devices
   */
  private handleLongPress(event: Event, node: GraphNode): void {
    // Clear existing timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    
    this.longPressTimer = setTimeout(() => {
      // Treat long press as right-click
      this.handleRightClick(event as MouseEvent, node);
    }, this.gestureConfig.longPressDelay);
  }

  /**
   * Node selection management
   */
  private selectNode(nodeId: string): void {
    this.state.selectedNodes.add(nodeId);
    this.addNodeSelectedClass(nodeId);
  }

  private toggleNodeSelection(nodeId: string): void {
    if (this.state.selectedNodes.has(nodeId)) {
      this.state.selectedNodes.delete(nodeId);
      this.removeNodeSelectedClass(nodeId);
    } else {
      this.selectNode(nodeId);
    }
  }

  private clearSelection(): void {
    this.state.selectedNodes.forEach(nodeId => {
      this.removeNodeSelectedClass(nodeId);
    });
    this.state.selectedNodes.clear();
  }

  /**
   * Visual feedback methods
   */
  private addNodeDragClass(node: GraphNode): void {
    this.addNodeClass(node.id, 'dragging');
  }

  private removeNodeDragClass(node: GraphNode): void {
    this.removeNodeClass(node.id, 'dragging');
  }

  private addNodeHoverClass(node: GraphNode): void {
    this.addNodeClass(node.id, 'hovered');
  }

  private addNodeSelectedClass(nodeId: string): void {
    this.addNodeClass(nodeId, 'selected');
  }

  private removeNodeSelectedClass(nodeId: string): void {
    this.removeNodeClass(nodeId, 'selected');
  }

  private removeAllHoverClasses(): void {
    document.querySelectorAll('.node.hovered').forEach(el => {
      el.classList.remove('hovered');
    });
  }

  private addEdgeHoverClass(edge: GraphEdge): void {
    this.addEdgeClass(edge, 'hovered');
  }

  private removeAllEdgeHoverClasses(): void {
    document.querySelectorAll('.link.hovered').forEach(el => {
      el.classList.remove('hovered');
    });
  }

  /**
   * Utility methods for adding/removing classes
   */
  private addNodeClass(nodeId: string, className: string): void {
    const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
    nodeElement?.classList.add(className);
  }

  private removeNodeClass(nodeId: string, className: string): void {
    const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
    nodeElement?.classList.remove(className);
  }

  private addEdgeClass(edge: GraphEdge, className: string): void {
    const edgeElement = document.querySelector(`[data-edge-id="${edge.source}-${edge.target}"]`);
    edgeElement?.classList.add(className);
  }

  /**
   * Tooltip management
   */
  private showTooltip(event: Event, node: GraphNode): void {
    const mouseEvent = event as MouseEvent;
    const tooltip = this.getOrCreateTooltip();
    
    // Position and show tooltip
    tooltip.style.left = `${mouseEvent.pageX + 10}px`;
    tooltip.style.top = `${mouseEvent.pageY + 10}px`;
    tooltip.style.opacity = '1';
    tooltip.style.pointerEvents = 'none';
    
    // Set tooltip content
    tooltip.innerHTML = this.generateTooltipContent(node);
  }

  private hideTooltip(): void {
    const tooltip = document.getElementById('graph-tooltip');
    if (tooltip) {
      tooltip.style.opacity = '0';
    }
  }

  private getOrCreateTooltip(): HTMLElement {
    let tooltip = document.getElementById('graph-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'graph-tooltip';
      tooltip.className = 'graph-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: #fff;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease-in-out;
        z-index: 1000;
        max-width: 200px;
      `;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  private generateTooltipContent(node: GraphNode): string {
    const metrics = node.metrics;
    let content = `<strong>${node.name}</strong><br>`;
    content += `Type: ${node.type}<br>`;
    
    if (node.namespace) {
      content += `Namespace: ${node.namespace}<br>`;
    }
    
    if (node.language) {
      content += `Language: ${node.language}<br>`;
    }
    
    if (metrics) {
      if (metrics.loc) content += `LOC: ${metrics.loc}<br>`;
      if (metrics.callCount) content += `Calls: ${metrics.callCount}<br>`;
      if (metrics.crossLanguageCalls) content += `Cross-lang calls: ${metrics.crossLanguageCalls}<br>`;
    }
    
    return content;
  }

  /**
   * Context menu management
   */
  private showContextMenu(event: MouseEvent, node?: GraphNode, edge?: GraphEdge): void {
    // Remove existing context menu
    this.hideContextMenu();
    
    const contextMenu = document.createElement('div');
    contextMenu.id = 'graph-context-menu';
    contextMenu.className = 'graph-context-menu';
    contextMenu.style.cssText = `
      position: fixed;
      left: ${event.clientX}px;
      top: ${event.clientY}px;
      background: #2d2d2d;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 4px 0;
      z-index: 2000;
      min-width: 150px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    `;
    
    // Add menu items
    if (node) {
      this.addContextMenuItem(contextMenu, 'Focus Node', () => {
        console.log('Focus node:', node.name);
        this.hideContextMenu();
      });
      
      this.addContextMenuItem(contextMenu, 'Hide Node', () => {
        console.log('Hide node:', node.name);
        this.hideContextMenu();
      });
      
      if (node.type.includes('-group')) {
        this.addContextMenuItem(contextMenu, 'Expand Group', () => {
          console.log('Expand group:', node.name);
          this.hideContextMenu();
        });
      }
    }
    
    if (edge) {
      this.addContextMenuItem(contextMenu, 'Highlight Path', () => {
        console.log('Highlight path:', edge);
        this.hideContextMenu();
      });
    }
    
    document.body.appendChild(contextMenu);
    
    // Hide menu when clicking elsewhere
    const hideHandler = (e: Event) => {
      if (!contextMenu.contains(e.target as Node)) {
        this.hideContextMenu();
        document.removeEventListener('click', hideHandler);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', hideHandler);
    }, 0);
  }

  private addContextMenuItem(menu: HTMLElement, text: string, callback: () => void): void {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = text;
    item.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      color: #fff;
      font-size: 12px;
    `;
    
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = '#4ecdc4';
    });
    
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'transparent';
    });
    
    item.addEventListener('click', callback);
    menu.appendChild(item);
  }

  private hideContextMenu(): void {
    const existingMenu = document.getElementById('graph-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
  }

  /**
   * Keyboard shortcut handling
   */
  private setupKeyboardListeners(): void {
    if (!this.gestureConfig.enableKeyboardShortcuts) return;
    
    const keydownHandler = (event: KeyboardEvent) => {
      // Toggle multi-select mode
      if (event.key === 'Shift') {
        this.state.multiSelectMode = true;
      }
      
      // Clear selection on Escape
      if (event.key === 'Escape') {
        this.clearSelection();
        this.hideContextMenu();
        this.hideTooltip();
      }
      
      // Select all on Ctrl+A
      if (event.ctrlKey && event.key === 'a') {
        event.preventDefault();
        // Logic to select all nodes would go here
      }
      
      // Delete selected nodes on Delete key
      if (event.key === 'Delete' && this.state.selectedNodes.size > 0) {
        console.log('Delete selected nodes:', Array.from(this.state.selectedNodes));
      }
    };
    
    const keyupHandler = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        this.state.multiSelectMode = false;
      }
    };
    
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    
    // Store for cleanup
    this.eventListeners.push(
      { element: document as any, event: 'keydown', handler: keydownHandler as EventListener },
      { element: document as any, event: 'keyup', handler: keyupHandler as EventListener }
    );
  }

  /**
   * Touch interaction support
   */
  public setupTouchInteractions(element: HTMLElement): void {
    let touchStartTime: number;
    let touchStart: { x: number; y: number } | null = null;
    
    const touchStartHandler = (event: TouchEvent) => {
      touchStartTime = Date.now();
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
      
      // Start long press detection
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
      }
      
      this.longPressTimer = setTimeout(() => {
        // Trigger long press action
        const target = event.target as Element;
        const nodeData = d3.select(target).datum() as GraphNode;
        if (nodeData) {
          this.handleLongPress(event, nodeData);
        }
      }, this.gestureConfig.longPressDelay);
    };
    
    const touchEndHandler = (event: TouchEvent) => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - touchStartTime;
      
      // If it was a quick tap, treat as click
      if (touchDuration < 200 && touchStart) {
        const touch = event.changedTouches[0];
        const distance = Math.sqrt(
          Math.pow(touch.clientX - touchStart.x, 2) +
          Math.pow(touch.clientY - touchStart.y, 2)
        );
        
        // If finger didn't move much, it's a tap
        if (distance < 10) {
          const target = event.target as Element;
          const nodeData = d3.select(target).datum() as GraphNode;
          if (nodeData) {
            this.handleNodeClick(event, nodeData);
          }
        }
      }
      
      touchStart = null;
    };
    
    const touchMoveHandler = (event: TouchEvent) => {
      // Cancel long press if finger moves too much
      if (touchStart) {
        const touch = event.touches[0];
        const distance = Math.sqrt(
          Math.pow(touch.clientX - touchStart.x, 2) +
          Math.pow(touch.clientY - touchStart.y, 2)
        );
        
        if (distance > 10 && this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }
    };
    
    element.addEventListener('touchstart', touchStartHandler, { passive: false });
    element.addEventListener('touchend', touchEndHandler, { passive: false });
    element.addEventListener('touchmove', touchMoveHandler, { passive: false });
    
    // Store for cleanup
    this.eventListeners.push(
      { element, event: 'touchstart', handler: touchStartHandler as EventListener },
      { element, event: 'touchend', handler: touchEndHandler as EventListener },
      { element, event: 'touchmove', handler: touchMoveHandler as EventListener }
    );
  }

  /**
   * Update gesture configuration
   */
  public updateGestureConfig(updates: Partial<GestureConfig>): void {
    this.gestureConfig = { ...this.gestureConfig, ...updates };
  }

  /**
   * Get current interaction state
   */
  public getState(): InteractionState {
    return { ...this.state };
  }

  /**
   * Get selected nodes
   */
  public getSelectedNodes(): string[] {
    return Array.from(this.state.selectedNodes);
  }

  /**
   * Programmatically select nodes
   */
  public selectNodes(nodeIds: string[]): void {
    this.clearSelection();
    nodeIds.forEach(id => this.selectNode(id));
  }

  /**
   * Enable/disable interactions
   */
  public setInteractionEnabled(type: 'drag' | 'zoom' | 'click' | 'hover', enabled: boolean): void {
    switch (type) {
      case 'drag':
        this.config.enableDrag = enabled;
        break;
      case 'zoom':
        this.config.enableZoom = enabled;
        break;
      // Additional interaction types can be handled here
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // Clear timers
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
    }
    if (this.doubleClickTimer) {
      clearTimeout(this.doubleClickTimer);
    }
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    
    // Remove event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
    
    // Remove DOM elements
    this.hideTooltip();
    this.hideContextMenu();
    
    // Clear state
    this.clearSelection();
  }
}