/**
 * GraphAnimationController - Animation and transition management for graph visualizations
 * 
 * Provides smooth transitions, easing functions, and coordinated animations
 * for graph elements during layout changes, data updates, and interactions.
 */

import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '../../shared/types/api';
import { GraphConfig } from './graph-viz-engine';

export interface AnimationConfig {
  duration: {
    short: number;
    medium: number;
    long: number;
  };
  easing: {
    [key: string]: (t: number) => number;
  };
  staggerDelay: number;
  enableAnimations: boolean;
}

export interface AnimationSequence {
  name: string;
  steps: AnimationStep[];
  parallel?: boolean;
  onComplete?: () => void;
}

export interface AnimationStep {
  target: 'nodes' | 'edges' | 'groups' | 'layout';
  properties: string[];
  duration: number;
  delay?: number;
  easing?: string;
  filter?: (d: any) => boolean;
  values?: { [property: string]: any };
}

export class GraphAnimationController {
  private config: GraphConfig;
  private animationConfig: AnimationConfig;
  private activeAnimations: Map<string, d3.Transition<any, any, any, any>> = new Map();
  private animationQueue: AnimationSequence[] = [];
  private isProcessingQueue: boolean = false;

  constructor(config: GraphConfig) {
    this.config = config;
    
    // Initialize with default config first
    this.animationConfig = {
      duration: { short: 200, medium: 500, long: 1000 },
      easing: {},
      staggerDelay: 50,
      enableAnimations: true
    };
    
    this.initializeAnimationConfig();
  }

  /**
   * Initialize animation configuration with defaults and D3 easing functions
   */
  private initializeAnimationConfig(): void {
    this.animationConfig = {
      duration: {
        short: 200,
        medium: 500,
        long: 1000
      },
      easing: {
        'ease-linear': d3.easeLinear,
        'ease-quad': d3.easeQuad,
        'ease-cubic': d3.easeCubic,
        'ease-sin': d3.easeSin,
        'ease-exp': d3.easeExp,
        'ease-circle': d3.easeCircle,
        'ease-back': d3.easeBack,
        'ease-bounce': d3.easeBounce,
        'ease-elastic': d3.easeElastic,
        'ease-poly': d3.easePoly,
        'ease-cubic-out': d3.easeCubicOut,
        'ease-cubic-in-out': d3.easeCubicInOut,
        'ease-back-out': d3.easeBackOut,
        'ease-back-in-out': d3.easeBackInOut
      },
      staggerDelay: 50,
      enableAnimations: this.config.enableAnimation !== false
    };
  }

  /**
   * Get transition duration based on type
   */
  public getTransitionDuration(type: 'short' | 'medium' | 'long' = 'medium'): number {
    if (!this.animationConfig.enableAnimations) return 0;
    return this.animationConfig.duration[type];
  }

  /**
   * Get easing function by name
   */
  public getEasingFunction(name: string): ((t: number) => number) {
    return this.animationConfig.easing[name] || d3.easeCubicOut;
  }

  /**
   * Animate node entrance
   */
  public animateNodeEntrance(
    selection: d3.Selection<any, GraphNode, any, any>,
    duration: number = this.animationConfig.duration.medium
  ): d3.Transition<any, GraphNode, any, any> {
    if (!this.animationConfig.enableAnimations) {
      return selection.transition().duration(0);
    }

    // Start from invisible and small
    selection
      .style('opacity', 0)
      .attr('transform', (d: GraphNode) => `translate(${d.x || 0},${d.y || 0}) scale(0.1)`);

    const transition = selection
      .transition()
      .duration(duration)
      .ease(this.getEasingFunction('ease-back-out'))
      .delay((d: GraphNode, i: number) => i * this.animationConfig.staggerDelay)
      .style('opacity', 1)
      .attr('transform', (d: GraphNode) => `translate(${d.x || 0},${d.y || 0}) scale(1)`);

    this.activeAnimations.set('node-entrance', transition);
    return transition;
  }

  /**
   * Animate node exit
   */
  public animateNodeExit(
    selection: d3.Selection<any, GraphNode, any, any>,
    duration: number = this.animationConfig.duration.medium
  ): d3.Transition<any, GraphNode, any, any> {
    if (!this.animationConfig.enableAnimations) {
      selection.remove();
      return selection.transition().duration(0);
    }

    const transition = selection
      .transition()
      .duration(duration)
      .ease(this.getEasingFunction('ease-cubic-in'))
      .style('opacity', 0)
      .attr('transform', (d: GraphNode) => `translate(${d.x || 0},${d.y || 0}) scale(0.1)`)
      .remove();

    this.activeAnimations.set('node-exit', transition);
    return transition;
  }

  /**
   * Animate edge entrance
   */
  public animateEdgeEntrance(
    selection: d3.Selection<any, GraphEdge, any, any>,
    duration: number = this.animationConfig.duration.medium
  ): d3.Transition<any, GraphEdge, any, any> {
    if (!this.animationConfig.enableAnimations) {
      return selection.transition().duration(0);
    }

    // Start from zero stroke-width
    selection.attr('stroke-width', 0).style('opacity', 0);

    const transition = selection
      .transition()
      .duration(duration)
      .ease(this.getEasingFunction('ease-cubic-out'))
      .delay((d: GraphEdge, i: number) => i * (this.animationConfig.staggerDelay / 2))
      .attr('stroke-width', (d: GraphEdge) => this.calculateEdgeWidth(d))
      .style('opacity', (d: GraphEdge) => this.calculateEdgeOpacity(d));

    this.activeAnimations.set('edge-entrance', transition);
    return transition;
  }

  /**
   * Animate edge exit
   */
  public animateEdgeExit(
    selection: d3.Selection<any, GraphEdge, any, any>,
    duration: number = this.animationConfig.duration.short
  ): d3.Transition<any, GraphEdge, any, any> {
    if (!this.animationConfig.enableAnimations) {
      selection.remove();
      return selection.transition().duration(0);
    }

    const transition = selection
      .transition()
      .duration(duration)
      .ease(this.getEasingFunction('ease-cubic-in'))
      .attr('stroke-width', 0)
      .style('opacity', 0)
      .remove();

    this.activeAnimations.set('edge-exit', transition);
    return transition;
  }

  /**
   * Animate group expansion
   */
  public animateGroupExpansion(
    groupNode: GraphNode,
    childNodes: GraphNode[],
    duration: number = this.animationConfig.duration.long
  ): Promise<void> {
    if (!this.animationConfig.enableAnimations) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const groupX = groupNode.x || 0;
      const groupY = groupNode.y || 0;

      // Phase 1: Scale up group node
      const groupSelection = d3.select(`[data-node-id="${groupNode.id}"]`);
      groupSelection
        .transition()
        .duration(duration / 3)
        .ease(this.getEasingFunction('ease-back-out'))
        .attr('transform', `translate(${groupX},${groupY}) scale(1.2)`)
        .transition()
        .duration(duration / 3)
        .attr('transform', `translate(${groupX},${groupY}) scale(1)`);

      // Phase 2: Animate children spreading out
      setTimeout(() => {
        childNodes.forEach((child, i) => {
          // Position children in a circle around the group
          const angle = (i / childNodes.length) * 2 * Math.PI;
          const radius = 100;
          const targetX = groupX + radius * Math.cos(angle);
          const targetY = groupY + radius * Math.sin(angle);

          // Start children at group center
          const childSelection = d3.select(`[data-node-id="${child.id}"]`);
          childSelection
            .style('opacity', 0)
            .attr('transform', `translate(${groupX},${groupY}) scale(0.1)`);

          // Animate to final position
          childSelection
            .transition()
            .duration(duration * 2/3)
            .delay(i * this.animationConfig.staggerDelay)
            .ease(this.getEasingFunction('ease-cubic-out'))
            .style('opacity', 1)
            .attr('transform', `translate(${targetX},${targetY}) scale(1)`);
        });

        setTimeout(resolve, duration);
      }, duration / 3);
    });
  }

  /**
   * Animate group collapse
   */
  public animateGroupCollapse(
    groupNode: GraphNode,
    childNodes: GraphNode[],
    duration: number = this.animationConfig.duration.medium
  ): Promise<void> {
    if (!this.animationConfig.enableAnimations) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const groupX = groupNode.x || 0;
      const groupY = groupNode.y || 0;

      // Animate children collapsing into parent
      childNodes.forEach((child, i) => {
        const childSelection = d3.select(`[data-node-id="${child.id}"]`);
        childSelection
          .transition()
          .duration(duration)
          .delay(i * (this.animationConfig.staggerDelay / 2))
          .ease(this.getEasingFunction('ease-cubic-in'))
          .attr('transform', `translate(${groupX},${groupY}) scale(0.1)`)
          .style('opacity', 0);
      });

      setTimeout(resolve, duration + childNodes.length * this.animationConfig.staggerDelay);
    });
  }

  /**
   * Animate layout change
   */
  public animateLayoutChange(
    nodeSelection: d3.Selection<any, GraphNode, any, any>,
    _linkSelection: d3.Selection<any, GraphEdge, any, any>,
    duration: number = this.animationConfig.duration.long
  ): Promise<void> {
    if (!this.animationConfig.enableAnimations) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      // Animate nodes to new positions
      const nodeTransition = nodeSelection
        .transition()
        .duration(duration)
        .ease(this.getEasingFunction('ease-cubic-in-out'))
        .attr('transform', (d: GraphNode) => `translate(${d.x || 0},${d.y || 0})`);

      // Animate links to follow nodes
      _linkSelection
        .transition()
        .duration(duration)
        .ease(this.getEasingFunction('ease-cubic-in-out'))
        .attr('x1', (d: any) => d.source.x || 0)
        .attr('y1', (d: any) => d.source.y || 0)
        .attr('x2', (d: any) => d.target.x || 0)
        .attr('y2', (d: any) => d.target.y || 0);

      // Resolve after animation duration
      setTimeout(resolve, duration);

      this.activeAnimations.set('layout-change-nodes', nodeTransition);
    });
  }

  /**
   * Animate zoom and pan to specific position
   */
  public animateZoomTo(
    svg: d3.Selection<any, unknown, null, undefined>,
    zoomBehavior: d3.ZoomBehavior<any, any>,
    transform: d3.ZoomTransform,
    duration: number = this.animationConfig.duration.medium
  ): Promise<void> {
    if (!this.animationConfig.enableAnimations) {
      svg.call(zoomBehavior.transform, transform);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      svg
        .transition()
        .duration(duration)
        .ease(this.getEasingFunction('ease-cubic-in-out'))
        .call(zoomBehavior.transform, transform);
        
      // Simulate completion after animation duration
      setTimeout(resolve, duration);
    });
  }

  /**
   * Animate highlighting effect
   */
  public animateHighlight(
    selection: d3.Selection<any, any, any, any>,
    highlightColor: string,
    duration: number = this.animationConfig.duration.short
  ): d3.Transition<any, any, any, any> {
    if (!this.animationConfig.enableAnimations) {
      return selection.transition().duration(0);
    }

    const transition = selection
      .transition()
      .duration(duration / 2)
      .ease(this.getEasingFunction('ease-quad'))
      .style('stroke', highlightColor)
      .style('stroke-width', '4px')
      .transition()
      .duration(duration / 2)
      .style('stroke', null)
      .style('stroke-width', null);

    this.activeAnimations.set('highlight', transition);
    return transition;
  }

  /**
   * Animate force simulation start
   */
  public animateSimulationStart(
    simulation: d3.Simulation<GraphNode, GraphEdge>,
    nodeSelection: d3.Selection<any, GraphNode, any, any>,
    linkSelection: d3.Selection<any, GraphEdge, any, any>
  ): void {
    if (!this.animationConfig.enableAnimations) {
      return;
    }

    // Add subtle pulsing effect during simulation
    nodeSelection
      .transition()
      .duration(this.animationConfig.duration.long)
      .ease(this.getEasingFunction('ease-sin'))
      .style('opacity', 0.7)
      .transition()
      .duration(this.animationConfig.duration.long)
      .style('opacity', 1);

    // Stop pulsing when simulation ends
    simulation.on('end', () => {
      nodeSelection.style('opacity', 1);
    });
  }

  /**
   * Animate data update with morphing effect
   */
  public animateDataUpdate(
    oldSelection: d3.Selection<any, any, any, any>,
    newSelection: d3.Selection<any, any, any, any>,
    duration: number = this.animationConfig.duration.medium
  ): Promise<void> {
    if (!this.animationConfig.enableAnimations) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      // Phase out old elements
      oldSelection
        .transition()
        .duration(duration / 2)
        .ease(this.getEasingFunction('ease-cubic-in'))
        .style('opacity', 0)
        .remove();

      // Phase in new elements
      setTimeout(() => {
        newSelection
          .style('opacity', 0)
          .transition()
          .duration(duration / 2)
          .ease(this.getEasingFunction('ease-cubic-out'))
          .style('opacity', 1)
          .on('end', resolve);
      }, duration / 2);
    });
  }

  /**
   * Create staggered animation sequence
   */
  public createStaggeredAnimation(
    selection: d3.Selection<any, any, any, any>,
    property: string,
    values: any[],
    duration: number = this.animationConfig.duration.medium,
    staggerDelay?: number
  ): d3.Transition<any, any, any, any> {
    if (!this.animationConfig.enableAnimations) {
      return selection.transition().duration(0);
    }

    const delay = staggerDelay || this.animationConfig.staggerDelay;

    return selection
      .transition()
      .duration(duration)
      .delay((_d: any, i: number) => i * delay)
      .ease(this.getEasingFunction('ease-cubic-out'))
      .attr(property, (_d: any, i: number) => values[i] || values[0]);
  }

  /**
   * Execute animation sequence
   */
  public async executeSequence(sequence: AnimationSequence): Promise<void> {
    this.animationQueue.push(sequence);
    
    if (!this.isProcessingQueue) {
      await this.processAnimationQueue();
    }
  }

  /**
   * Process animation queue
   */
  private async processAnimationQueue(): Promise<void> {
    this.isProcessingQueue = true;

    while (this.animationQueue.length > 0) {
      const sequence = this.animationQueue.shift()!;
      
      if (sequence.parallel) {
        // Execute all steps in parallel
        const promises = sequence.steps.map(step => this.executeAnimationStep(step));
        await Promise.all(promises);
      } else {
        // Execute steps sequentially
        for (const step of sequence.steps) {
          await this.executeAnimationStep(step);
        }
      }
      
      sequence.onComplete?.();
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute individual animation step
   */
  private async executeAnimationStep(step: AnimationStep): Promise<void> {
    return new Promise((resolve) => {
      // Implementation would depend on the specific step target and properties
      // This is a simplified example
      setTimeout(resolve, step.duration + (step.delay || 0));
    });
  }

  /**
   * Stop all active animations
   */
  public stopAllAnimations(): void {
    // Note: transition.interrupt() would go here for D3 v7
    // For now, just clear the map
    this.activeAnimations.clear();
    this.animationQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Stop specific animation
   */
  public stopAnimation(name: string): void {
    const transition = this.activeAnimations.get(name);
    if (transition) {
      // Note: transition.interrupt() would go here for D3 v7
      this.activeAnimations.delete(name);
    }
  }

  /**
   * Update animation configuration
   */
  public updateConfig(updates: Partial<AnimationConfig>): void {
    this.animationConfig = { ...this.animationConfig, ...updates };
  }

  /**
   * Enable or disable animations globally
   */
  public setAnimationsEnabled(enabled: boolean): void {
    this.animationConfig.enableAnimations = enabled;
    
    if (!enabled) {
      this.stopAllAnimations();
    }
  }

  /**
   * Utility methods for calculating animation values
   */
  private calculateEdgeWidth(edge: GraphEdge): number {
    return Math.max(1, (edge.weight || 1) * 2);
  }

  private calculateEdgeOpacity(edge: GraphEdge): number {
    if (edge.type === 'aggregated') return 0.3;
    if (edge.type === 'uses') return 0.4;
    if (edge.isCrossLanguage) return 0.7;
    return 0.6;
  }

  /**
   * Get animation state
   */
  public getAnimationState() {
    return {
      activeAnimations: Array.from(this.activeAnimations.keys()),
      queueLength: this.animationQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      animationsEnabled: this.animationConfig.enableAnimations
    };
  }

  /**
   * Create custom easing function
   */
  public addCustomEasing(name: string, easingFunction: (t: number) => number): void {
    this.animationConfig.easing[name] = easingFunction;
  }

  /**
   * Create spring animation
   */
  public createSpringAnimation(
    selection: d3.Selection<any, any, any, any>,
    property: string,
    targetValue: any,
    stiffness: number = 0.5,
    damping: number = 0.8
  ): void {
    // Simplified spring animation implementation
    const startTime = performance.now();
    const startValue = parseFloat(selection.style(property)) || 0;
    const targetVal = parseFloat(targetValue) || 0;

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000; // Convert to seconds
      
      // Simple spring physics calculation
      const displacement = targetVal - startValue;
      const springForce = stiffness * displacement;
      const dampingForce = damping * (targetVal - parseFloat(selection.style(property)));
      
      const currentValue = startValue + displacement * (1 - Math.exp(-elapsed * (springForce + dampingForce)));
      
      selection.style(property, currentValue);
      
      // Continue animation if not close enough to target
      if (Math.abs(currentValue - targetVal) > 0.01) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}