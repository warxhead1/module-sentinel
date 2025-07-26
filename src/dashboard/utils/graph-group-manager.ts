/**
 * Graph Group Manager
 * Handles group expansion/collapse functionality for hierarchical graphs
 */

import { GraphNode, GraphEdge } from '../../shared/types/api';

export interface GroupState {
  expandedGroups: Set<string>;
  collapsedNodes: Set<string>;
}

export class GraphGroupManager {
  private expandedGroups: Set<string> = new Set();
  private nodeGroupMap: Map<string, string> = new Map();
  
  /**
   * Initialize group states
   */
  public initializeGroups(nodes: GraphNode[]): void {
    // Build node-to-group mapping
    nodes.forEach(node => {
      if (node.namespace) {
        this.nodeGroupMap.set(node.id, `namespace-group-${node.namespace}`);
      } else if (node.moduleId) {
        this.nodeGroupMap.set(node.id, node.moduleId);
      }
      
      // Initially expand all groups
      if (node.type?.includes('-group')) {
        this.expandedGroups.add(node.id);
        node.isExpanded = true;
      }
    });
  }
  
  /**
   * Toggle group expansion state
   */
  public toggleGroup(groupId: string): boolean {
    if (this.expandedGroups.has(groupId)) {
      this.expandedGroups.delete(groupId);
      return false; // collapsed
    } else {
      this.expandedGroups.add(groupId);
      return true; // expanded
    }
  }
  
  /**
   * Check if a node should be visible based on group expansion state
   */
  public isNodeVisible(node: GraphNode): boolean {
    // Group nodes are always visible
    if (node.type?.includes('-group')) {
      return true;
    }
    
    // Check if node's parent group is expanded
    const parentGroupId = this.nodeGroupMap.get(node.id);
    if (parentGroupId) {
      return this.expandedGroups.has(parentGroupId);
    }
    
    // Nodes without groups are always visible
    return true;
  }
  
  /**
   * Filter nodes and edges based on group expansion state
   */
  public filterByGroupExpansion(nodes: GraphNode[], edges: GraphEdge[]): {
    visibleNodes: GraphNode[];
    visibleEdges: GraphEdge[];
  } {
    const visibleNodeIds = new Set<string>();
    
    // Filter nodes
    const visibleNodes = nodes.filter(node => {
      const isVisible = this.isNodeVisible(node);
      if (isVisible) {
        visibleNodeIds.add(node.id);
      }
      return isVisible;
    });
    
    // Filter edges - only show edges where both nodes are visible
    const visibleEdges = edges.filter(edge => {
      return visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
    });
    
    return { visibleNodes, visibleEdges };
  }
  
  /**
   * Get visual indicator for group node (expanded/collapsed icon)
   */
  public getGroupIcon(isExpanded: boolean): string {
    return isExpanded ? '▼' : '▶';
  }
  
  /**
   * Update node appearance based on group state
   */
  public updateGroupNodeAppearance(node: GraphNode, selection: any): void {
    if (!node.type?.includes('-group')) return;
    
    const isExpanded = this.expandedGroups.has(node.id);
    
    // Add expansion indicator
    selection.selectAll('.group-indicator').remove();
    selection.append('text')
      .attr('class', 'group-indicator')
      .attr('x', -20)
      .attr('y', 5)
      .style('font-size', '12px')
      .style('fill', '#4ecdc4')
      .text(this.getGroupIcon(isExpanded));
  }
}