/**
 * GraphThemeManager - Theme and styling management for graph visualizations
 * 
 * Provides centralized theme management, color schemes, and visual styling
 * configurations for different graph types and visualization modes.
 */

import { GraphNode, GraphEdge } from '../../shared/types/api';
import * as d3 from 'd3';

export interface ThemeColors {
  nodes: {
    [key: string]: string;
  };
  edges: {
    [key: string]: string;
  };
  groups: {
    [key: string]: string;
  };
  highlights: {
    selected: string;
    hover: string;
    connected: string;
  };
  background: string;
  text: string;
  border: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  sizes: {
    nodeRadius: {
      min: number;
      max: number;
      default: number;
    };
    edgeWidth: {
      min: number;
      max: number;
      default: number;
    };
    fontSize: {
      min: number;
      max: number;
      default: number;
    };
  };
  opacity: {
    nodeDefault: number;
    nodeHighlighted: number;
    nodeDimmed: number;
    edgeDefault: number;
    edgeHighlighted: number;
    edgeDimmed: number;
  };
  animations: {
    transitionDuration: number;
    easingFunction: string;
  };
}

export class GraphThemeManager {
  private currentTheme: string;
  private themes: Map<string, ThemeConfig> = new Map();
  private customColorScale: d3.ScaleOrdinal<string, string> | null = null;

  constructor(initialTheme: string = 'dark') {
    this.currentTheme = initialTheme;
    this.initializeThemes();
  }

  /**
   * Initialize built-in themes
   */
  private initializeThemes(): void {
    // Dark theme (default)
    this.themes.set('dark', {
      colors: {
        nodes: {
          'class': '#4ecdc4',
          'struct': '#4ecdc4',
          'function': '#ff6b6b',
          'namespace': '#51cf66',
          'variable': '#ffd93d',
          'enum': '#6c5ce7',
          'interface': '#fd79a8',
          'module': '#74b9ff',
          'unknown': '#888888',
          'language-group': '#8b0a8c',
          'module-group': '#6a0572',
          'namespace-group': '#8d0572'
        },
        edges: {
          'calls': '#4ecdc4',
          'inherits': '#ff6b6b',
          'uses': '#51cf66',
          'includes': '#ffd93d',
          'spawns': '#6c5ce7',
          'imports': '#fd79a8',
          'aggregated': '#9b59b6',
          'default': '#666666'
        },
        groups: {
          'language-group': '#8b0a8c',
          'module-group': '#6a0572',
          'namespace-group': '#8d0572',
          'cluster': '#9b59b6'
        },
        highlights: {
          selected: '#4ecdc4',
          hover: '#ff6b6b',
          connected: '#51cf66'
        },
        background: '#1a1a2e',
        text: '#e0e0e0',
        border: 'rgba(78, 205, 196, 0.5)'
      },
      sizes: {
        nodeRadius: { min: 5, max: 70, default: 15 },
        edgeWidth: { min: 1, max: 10, default: 2 },
        fontSize: { min: 8, max: 18, default: 12 }
      },
      opacity: {
        nodeDefault: 1.0,
        nodeHighlighted: 1.0,
        nodeDimmed: 0.2,
        edgeDefault: 0.6,
        edgeHighlighted: 1.0,
        edgeDimmed: 0.1
      },
      animations: {
        transitionDuration: 300,
        easingFunction: 'ease-cubic-out'
      }
    });

    // Light theme
    this.themes.set('light', {
      colors: {
        nodes: {
          'class': '#2196f3',
          'struct': '#2196f3',
          'function': '#f44336',
          'namespace': '#4caf50',
          'variable': '#ff9800',
          'enum': '#9c27b0',
          'interface': '#e91e63',
          'module': '#03a9f4',
          'unknown': '#666666',
          'language-group': '#7b1fa2',
          'module-group': '#5e35b1',
          'namespace-group': '#673ab7'
        },
        edges: {
          'calls': '#2196f3',
          'inherits': '#f44336',
          'uses': '#4caf50',
          'includes': '#ff9800',
          'spawns': '#9c27b0',
          'imports': '#e91e63',
          'aggregated': '#795548',
          'default': '#999999'
        },
        groups: {
          'language-group': '#7b1fa2',
          'module-group': '#5e35b1',
          'namespace-group': '#673ab7',
          'cluster': '#795548'
        },
        highlights: {
          selected: '#2196f3',
          hover: '#f44336',
          connected: '#4caf50'
        },
        background: '#fafafa',
        text: '#333333',
        border: 'rgba(33, 150, 243, 0.5)'
      },
      sizes: {
        nodeRadius: { min: 5, max: 70, default: 15 },
        edgeWidth: { min: 1, max: 10, default: 2 },
        fontSize: { min: 8, max: 18, default: 12 }
      },
      opacity: {
        nodeDefault: 1.0,
        nodeHighlighted: 1.0,
        nodeDimmed: 0.3,
        edgeDefault: 0.7,
        edgeHighlighted: 1.0,
        edgeDimmed: 0.15
      },
      animations: {
        transitionDuration: 300,
        easingFunction: 'ease-cubic-out'
      }
    });

    // High contrast theme
    this.themes.set('high-contrast', {
      colors: {
        nodes: {
          'class': '#00ffff',
          'struct': '#00ffff',
          'function': '#ff0000',
          'namespace': '#00ff00',
          'variable': '#ffff00',
          'enum': '#ff00ff',
          'interface': '#ff8000',
          'module': '#8080ff',
          'unknown': '#ffffff',
          'language-group': '#ff00ff',
          'module-group': '#ff8000',
          'namespace-group': '#8080ff'
        },
        edges: {
          'calls': '#00ffff',
          'inherits': '#ff0000',
          'uses': '#00ff00',
          'includes': '#ffff00',
          'spawns': '#ff00ff',
          'imports': '#ff8000',
          'aggregated': '#8080ff',
          'default': '#ffffff'
        },
        groups: {
          'language-group': '#ff00ff',
          'module-group': '#ff8000',
          'namespace-group': '#8080ff',
          'cluster': '#ffffff'
        },
        highlights: {
          selected: '#ffffff',
          hover: '#ffff00',
          connected: '#00ff00'
        },
        background: '#000000',
        text: '#ffffff',
        border: '#ffffff'
      },
      sizes: {
        nodeRadius: { min: 8, max: 80, default: 20 },
        edgeWidth: { min: 2, max: 12, default: 3 },
        fontSize: { min: 10, max: 20, default: 14 }
      },
      opacity: {
        nodeDefault: 1.0,
        nodeHighlighted: 1.0,
        nodeDimmed: 0.4,
        edgeDefault: 0.8,
        edgeHighlighted: 1.0,
        edgeDimmed: 0.2
      },
      animations: {
        transitionDuration: 200,
        easingFunction: 'ease-linear'
      }
    });

    // Colorblind-friendly theme
    this.themes.set('colorblind-friendly', {
      colors: {
        nodes: {
          'class': '#0173b2',
          'struct': '#0173b2',
          'function': '#de8f05',
          'namespace': '#029e73',
          'variable': '#cc78bc',
          'enum': '#ca9161',
          'interface': '#fbafe4',
          'module': '#949494',
          'unknown': '#ece133',
          'language-group': '#56b4e9',
          'module-group': '#e69f00',
          'namespace-group': '#009e73'
        },
        edges: {
          'calls': '#0173b2',
          'inherits': '#de8f05',
          'uses': '#029e73',
          'includes': '#cc78bc',
          'spawns': '#ca9161',
          'imports': '#fbafe4',
          'aggregated': '#949494',
          'default': '#999999'
        },
        groups: {
          'language-group': '#56b4e9',
          'module-group': '#e69f00',
          'namespace-group': '#009e73',
          'cluster': '#949494'
        },
        highlights: {
          selected: '#0173b2',
          hover: '#de8f05',
          connected: '#029e73'
        },
        background: '#f0f0f0',
        text: '#000000',
        border: 'rgba(1, 115, 178, 0.5)'
      },
      sizes: {
        nodeRadius: { min: 5, max: 70, default: 15 },
        edgeWidth: { min: 1, max: 10, default: 2 },
        fontSize: { min: 8, max: 18, default: 12 }
      },
      opacity: {
        nodeDefault: 1.0,
        nodeHighlighted: 1.0,
        nodeDimmed: 0.3,
        edgeDefault: 0.7,
        edgeHighlighted: 1.0,
        edgeDimmed: 0.15
      },
      animations: {
        transitionDuration: 300,
        easingFunction: 'ease-cubic-out'
      }
    });
  }

  /**
   * Set current theme
   */
  public setTheme(themeName: string): void {
    if (this.themes.has(themeName)) {
      this.currentTheme = themeName;
    } else {
      console.warn(`Theme "${themeName}" not found, using default theme`);
    }
  }

  /**
   * Get current theme configuration
   */
  public getCurrentTheme(): ThemeConfig {
    return this.themes.get(this.currentTheme) || this.themes.get('dark')!;
  }

  /**
   * Add custom theme
   */
  public addCustomTheme(name: string, theme: ThemeConfig): void {
    this.themes.set(name, theme);
  }

  /**
   * Get available theme names
   */
  public getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  /**
   * Node styling methods
   */
  public getNodeColor(node: GraphNode): string {
    const theme = this.getCurrentTheme();
    let baseColor = theme.colors.nodes[node.type] || theme.colors.nodes.unknown;
    
    // Adjust color based on confidence level
    if (node.confidence !== undefined && node.confidence < 0.8) {
      // Desaturate low confidence nodes
      const hsl = d3.hsl(baseColor);
      hsl.s *= node.confidence; // Reduce saturation
      baseColor = hsl.toString();
    }
    
    // Special colors for specific features
    if (node.languageFeatures?.isAsync) {
      // Add slight purple tint for async functions
      const rgb = d3.rgb(baseColor);
      rgb.b = Math.min(255, rgb.b + 30);
      baseColor = rgb.toString();
    }
    
    if (node.languageFeatures?.isExported) {
      // Slightly brighter for exported symbols
      const hsl = d3.hsl(baseColor);
      hsl.l = Math.min(1, hsl.l * 1.1);
      baseColor = hsl.toString();
    }
    
    return baseColor;
  }

  public getNodeRadius(node: GraphNode): number {
    const theme = this.getCurrentTheme();
    
    // Use different sizing logic for different node types
    if (node.type === 'language-group') {
      return Math.max(30, Math.min(70, 30 + Math.sqrt(node.metrics?.childCount || 1) * 5));
    }
    if (node.type === 'module-group') {
      return Math.max(25, Math.min(50, 25 + Math.sqrt(node.metrics?.childCount || 1) * 4));
    }
    if (node.type === 'namespace-group') {
      return Math.max(20, Math.min(40, 20 + Math.sqrt(node.metrics?.childCount || 1) * 3));
    }
    
    // Enhanced sizing based on multiple factors
    let baseSize = theme.sizes.nodeRadius.default;
    
    // Factor in complexity metrics
    const complexity = node.metrics?.cyclomaticComplexity || 0;
    const loc = node.metrics?.loc || 0;
    const callCount = node.metrics?.callCount || 0;
    
    // Combine metrics for sizing
    const complexityFactor = Math.sqrt(complexity) * 1.5;
    const locFactor = Math.sqrt(loc) * 0.8;
    const callFactor = Math.sqrt(callCount) * 0.5;
    
    baseSize += complexityFactor + locFactor + callFactor;
    
    // Adjust for confidence (low confidence = smaller)
    if (node.confidence !== undefined) {
      baseSize *= Math.max(0.6, node.confidence);
    }
    
    // Special sizing for specific symbol features
    if (node.signature) {
      // Larger nodes for complex signatures
      const paramCount = (node.signature.match(/,/g) || []).length + 1;
      baseSize += Math.min(paramCount * 0.3, 3);
    }
    
    if (node.languageFeatures?.isTemplate) {
      baseSize += 2; // Template symbols slightly larger
    }
    
    return Math.max(theme.sizes.nodeRadius.min, Math.min(theme.sizes.nodeRadius.max, Math.round(baseSize)));
  }

  public getNodeStroke(node: GraphNode): string {
    const theme = this.getCurrentTheme();
    
    if (node.type.includes('-group')) {
      return theme.colors.border;
    }
    
    return 'none';
  }

  public getNodeStrokeWidth(node: GraphNode): number {
    if (node.type === 'language-group') return 3;
    if (node.type === 'module-group') return 2;
    if (node.type === 'namespace-group') return 1.5;
    return 0;
  }

  public getNodeFilter(node: GraphNode): string {
    if (node.type === 'language-group') {
      return 'drop-shadow(0 0 12px rgba(139, 10, 140, 0.6))';
    }
    if (node.type.includes('-group')) {
      return 'drop-shadow(0 0 8px rgba(147, 112, 219, 0.4))';
    }
    
    // Enhanced filtering based on node properties
    if (node.confidence !== undefined && node.confidence < 0.5) {
      // Low confidence nodes get a subtle red glow
      return 'drop-shadow(0 0 4px rgba(255, 100, 100, 0.3))';
    }
    
    if (node.languageFeatures?.isAsync) {
      // Async functions get a purple glow
      return 'drop-shadow(0 0 4px rgba(138, 43, 226, 0.4))';
    }
    
    if (node.languageFeatures?.isExported) {
      // Exported symbols get a subtle green glow
      return 'drop-shadow(0 0 3px rgba(78, 205, 196, 0.3))';
    }
    
    if (node.metrics?.cyclomaticComplexity && node.metrics.cyclomaticComplexity > 10) {
      // High complexity nodes get an orange glow
      return 'drop-shadow(0 0 4px rgba(255, 165, 0, 0.4))';
    }
    
    return 'none';
  }

  public getNodeFontSize(node: GraphNode, zoomLevel: number = 1): string {
    const theme = this.getCurrentTheme();
    let baseSize = theme.sizes.fontSize.default;
    
    if (node.type === 'language-group') baseSize = 14;
    else if (node.type === 'module-group') baseSize = 12;
    else if (node.type === 'namespace-group') baseSize = 10;
    else baseSize = 8;
    
    const scaledSize = baseSize + Math.log(node.size || 1) * 0.5;
    return `${Math.min(theme.sizes.fontSize.max, scaledSize * Math.sqrt(zoomLevel))}px`;
  }

  public getNodeLabelOpacity(node: GraphNode, zoomLevel: number = 1): number {
    // Progressive disclosure based on node type and zoom level
    if (node.type === 'language-group') return 1;
    if (node.type === 'module-group') return Math.min(1, zoomLevel * 0.8);
    if (node.type === 'namespace-group') return Math.min(1, zoomLevel * 0.6);
    return Math.min(1, Math.max(0, (zoomLevel - 0.5) * 2));
  }

  public getNodeFontWeight(node: GraphNode): string {
    return node.type.includes('-group') ? 'bold' : 'normal';
  }

  public getNodeTextShadow(node: GraphNode): string {
    return node.type.includes('-group') ? '0 0 4px rgba(0,0,0,0.8)' : 'none';
  }

  /**
   * Edge styling methods
   */
  public getEdgeColor(edge: GraphEdge): string {
    const theme = this.getCurrentTheme();
    
    // Special handling for cross-language edges
    if (edge.isCrossLanguage) {
      return theme.colors.highlights.connected;
    }
    
    return theme.colors.edges[edge.type] || theme.colors.edges.default;
  }

  public getEdgeWidth(edge: GraphEdge): number {
    const theme = this.getCurrentTheme();
    const weight = edge.weight || 1;
    return Math.max(theme.sizes.edgeWidth.min, Math.min(theme.sizes.edgeWidth.max, weight * theme.sizes.edgeWidth.default));
  }

  public getEdgeOpacity(edge: GraphEdge): number {
    const theme = this.getCurrentTheme();
    
    // Dim links connected to group nodes or less important types
    if (edge.type === 'aggregated') return 0.3;
    if (edge.type === 'uses') return 0.4;
    if (edge.isCrossLanguage) return 0.7;
    
    return theme.opacity.edgeDefault;
  }

  public getEdgeDashArray(edge: GraphEdge): string | null {
    switch (edge.type) {
      case 'uses':
      case 'includes':
        return '5,5';
      case 'aggregated':
        return '3,3';
      default:
        return null;
    }
  }

  /**
   * Apply theme to the entire graph container
   */
  public applyTheme(container: d3.Selection<any, unknown, null, undefined>): void {
    const theme = this.getCurrentTheme();
    
    // Apply background color if needed (for canvas rendering)
    container.style('background-color', theme.colors.background);
    
    // Apply default text styles
    container.selectAll('text')
      .style('fill', theme.colors.text)
      .style('font-family', '"Segoe UI", system-ui, sans-serif');
  }

  /**
   * Get theme-specific CSS variables for integration with stylesheets
   */
  public getThemeCSS(): string {
    const theme = this.getCurrentTheme();
    
    return `
      :root {
        --graph-bg-color: ${theme.colors.background};
        --graph-text-color: ${theme.colors.text};
        --graph-border-color: ${theme.colors.border};
        --graph-highlight-color: ${theme.colors.highlights.selected};
        --graph-hover-color: ${theme.colors.highlights.hover};
        --graph-connected-color: ${theme.colors.highlights.connected};
        --graph-node-class-color: ${theme.colors.nodes.class};
        --graph-node-function-color: ${theme.colors.nodes.function};
        --graph-node-namespace-color: ${theme.colors.nodes.namespace};
        --graph-edge-default-color: ${theme.colors.edges.default};
        --graph-transition-duration: ${theme.animations.transitionDuration}ms;
      }
    `;
  }

  /**
   * Create color scale for categorical data
   */
  public createColorScale(categories: string[]): d3.ScaleOrdinal<string, string> {
    const theme = this.getCurrentTheme();
    const colors = Object.values(theme.colors.nodes);
    
    this.customColorScale = d3.scaleOrdinal<string, string>()
      .domain(categories)
      .range(colors);
    
    return this.customColorScale;
  }

  /**
   * Get color from custom scale
   */
  public getColorFromScale(category: string): string {
    if (this.customColorScale) {
      return this.customColorScale(category);
    }
    
    const theme = this.getCurrentTheme();
    return theme.colors.nodes.unknown;
  }

  /**
   * Interpolate colors for gradients
   */
  public createColorGradient(startColor: string, endColor: string, steps: number = 10): string[] {
    const interpolator = d3.interpolate(startColor, endColor);
    const gradient: string[] = [];
    
    for (let i = 0; i <= steps; i++) {
      gradient.push(interpolator(i / steps));
    }
    
    return gradient;
  }

  /**
   * Generate accessible color combinations
   */
  public getAccessibleColorPair(backgroundColor: string): { text: string; border: string } {
    // Simple heuristic for accessibility
    const rgb = d3.color(backgroundColor)?.rgb();
    if (!rgb) return { text: '#000000', border: '#cccccc' };
    
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    
    return {
      text: brightness > 128 ? '#000000' : '#ffffff',
      border: brightness > 128 ? '#666666' : '#cccccc'
    };
  }

  /**
   * Get semantic colors based on metrics
   */
  public getMetricColor(value: number, min: number, max: number, colorScheme: 'sequential' | 'diverging' = 'sequential'): string {
    const normalized = (value - min) / (max - min);
    
    if (colorScheme === 'sequential') {
      // Green (low) to Red (high)
      return d3.interpolateRdYlGn(1 - normalized);
    } else {
      // Diverging color scheme
      return d3.interpolateRdBu(normalized);
    }
  }

  /**
   * Update theme configuration partially
   */
  public updateThemeConfig(updates: Partial<ThemeConfig>): void {
    const currentTheme = this.getCurrentTheme();
    const updatedTheme = this.deepMerge(currentTheme, updates);
    this.themes.set(this.currentTheme, updatedTheme);
  }

  /**
   * Deep merge utility for theme updates
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Pattern-based styling methods
   */

  /**
   * Get pattern-family based color scheme
   */
  public getPatternColor(node: GraphNode): string {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return this.getNodeColor(node); // Fallback to normal node color
    }

    const theme = this.getCurrentTheme();
    
    // Color families for different pattern types
    const patternColors = {
      'creational': {
        'healthy': '#ff7675',      // Warm red for creational patterns
        'warning': '#fdcb6e',      // Yellow for warnings
        'problematic': '#d63031',  // Dark red for problems
        'anti-pattern': '#2d3436'  // Dark gray for anti-patterns
      },
      'structural': {
        'healthy': '#74b9ff',      // Cool blue for structural patterns
        'warning': '#0984e3',      // Darker blue for warnings
        'problematic': '#0756a3',  // Navy blue for problems
        'anti-pattern': '#2d3436'
      },
      'behavioral': {
        'healthy': '#a29bfe',      // Purple for behavioral patterns
        'warning': '#6c5ce7',      // Darker purple for warnings
        'problematic': '#5f3dc4',  // Deep purple for problems
        'anti-pattern': '#2d3436'
      },
      'architectural': {
        'healthy': '#00b894',      // Green for architectural patterns
        'warning': '#00a085',      // Darker green for warnings
        'problematic': '#006b52',  // Deep green for problems
        'anti-pattern': '#2d3436'
      },
      'concurrency': {
        'healthy': '#fd79a8',      // Pink for concurrency patterns
        'warning': '#e84393',      // Darker pink for warnings
        'problematic': '#d63384',  // Deep pink for problems
        'anti-pattern': '#2d3436'
      }
    };

    const familyColors = patternColors[primaryPattern.family];
    if (!familyColors) {
      return this.getNodeColor(node); // Fallback
    }

    const baseColor = familyColors[primaryPattern.health];
    
    // Adjust based on pattern strength
    if (primaryPattern.strength < 60) {
      const hsl = d3.hsl(baseColor);
      hsl.s *= (primaryPattern.strength / 100); // Reduce saturation for low strength
      return hsl.toString();
    }

    return baseColor;
  }

  /**
   * Get pattern-specific node shape
   */
  public getPatternShape(node: GraphNode): string {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return 'circle'; // Default shape
    }

    // Shape mapping based on pattern role
    const roleShapes = {
      'creator': 'square',      // Creators are squares
      'consumer': 'circle',     // Consumers are circles
      'coordinator': 'diamond', // Coordinators are diamonds
      'observer': 'triangle',   // Observers are triangles
      'mediator': 'hexagon',    // Mediators are hexagons
      'subject': 'pentagon'     // Subjects are pentagons
    };

    return roleShapes[primaryPattern.role] || 'circle';
  }

  /**
   * Get pattern health indicator border style
   */
  public getPatternBorder(node: GraphNode): { color: string; width: number; style: string } {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return { color: 'none', width: 0, style: 'solid' };
    }

    const theme = this.getCurrentTheme();
    
    const healthStyles = {
      'healthy': { color: '#00b894', width: 2, style: 'solid' },
      'warning': { color: '#fdcb6e', width: 2, style: 'dashed' },
      'problematic': { color: '#d63031', width: 3, style: 'dotted' },
      'anti-pattern': { color: '#2d3436', width: 4, style: 'double' }
    };

    return healthStyles[primaryPattern.health] || { color: theme.colors.border, width: 1, style: 'solid' };
  }

  /**
   * Get pattern-specific visual effects (shadows, glows)
   */
  public getPatternEffect(node: GraphNode): string {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return this.getNodeFilter(node); // Fallback to normal effects
    }

    // Effects based on pattern family and health
    const familyEffects = {
      'creational': 'drop-shadow(0 0 6px rgba(255, 118, 117, 0.6))',
      'structural': 'drop-shadow(0 0 6px rgba(116, 185, 255, 0.6))',
      'behavioral': 'drop-shadow(0 0 6px rgba(162, 155, 254, 0.6))',
      'architectural': 'drop-shadow(0 0 6px rgba(0, 184, 148, 0.6))',
      'concurrency': 'drop-shadow(0 0 6px rgba(253, 121, 168, 0.6))'
    };

    const baseEffect = familyEffects[primaryPattern.family] || 'none';

    // Enhance effect for problematic patterns
    if (primaryPattern.health === 'anti-pattern') {
      return 'drop-shadow(0 0 8px rgba(214, 48, 49, 0.8))';
    } else if (primaryPattern.health === 'problematic') {
      return 'drop-shadow(0 0 6px rgba(214, 48, 49, 0.5))';
    }

    return baseEffect;
  }

  /**
   * Get pattern strength visualization (size multiplier)
   */
  public getPatternSizeMultiplier(node: GraphNode): number {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return 1.0;
    }

    // Scale size based on pattern strength (80-120% of normal size)
    const strengthMultiplier = 0.8 + (primaryPattern.strength / 100) * 0.4;
    
    // Larger size for important architectural roles
    const roleMultipliers = {
      'coordinator': 1.2,
      'mediator': 1.15,
      'creator': 1.1,
      'subject': 1.05,
      'observer': 1.0,
      'consumer': 0.95
    };

    const roleMultiplier = roleMultipliers[primaryPattern.role] || 1.0;
    
    return strengthMultiplier * roleMultiplier;
  }

  /**
   * Get pattern-specific icon or badge symbol
   */
  public getPatternIcon(node: GraphNode): string | null {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return null;
    }

    // Unicode symbols for different patterns
    const patternIcons = {
      'Factory': '🏭',
      'Singleton': '1️⃣',
      'Builder': '🔨',
      'Observer': '👁️',
      'Command': '⚡',
      'State': '🔄',
      'Decorator': '🎨',
      'Adapter': '🔌',
      'MVC': '🏗️',
      'Repository': '📦',
      'Producer-Consumer': '🏃‍♂️➡️🏃‍♀️'
    };

    return (patternIcons as any)[primaryPattern.name] || '🔍';
  }

  /**
   * Get pattern-specific tooltip color scheme
   */
  public getPatternTooltipTheme(node: GraphNode): { background: string; border: string; text: string } {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      const theme = this.getCurrentTheme();
      return {
        background: theme.colors.background,
        border: theme.colors.border,
        text: theme.colors.text
      };
    }

    // Theme colors based on pattern family
    const familyThemes = {
      'creational': { background: '#fff5f5', border: '#ff7675', text: '#2d3436' },
      'structural': { background: '#f0f8ff', border: '#74b9ff', text: '#2d3436' },
      'behavioral': { background: '#f8f7ff', border: '#a29bfe', text: '#2d3436' },
      'architectural': { background: '#f0fff4', border: '#00b894', text: '#2d3436' },
      'concurrency': { background: '#fff0f6', border: '#fd79a8', text: '#2d3436' }
    };

    return familyThemes[primaryPattern.family] || {
      background: '#ffffff',
      border: '#cccccc',
      text: '#333333'
    };
  }

  /**
   * Get aggregated pattern statistics for the current graph
   */
  public getPatternStatistics(nodes: GraphNode[]): {
    totalPatterns: number;
    patternsByFamily: Record<string, number>;
    healthDistribution: Record<string, number>;
    topPatterns: Array<{ name: string; count: number }>;
  } {
    const patternsByFamily: Record<string, number> = {};
    const healthDistribution: Record<string, number> = {};
    const patternCounts: Record<string, number> = {};

    let totalPatterns = 0;

    for (const node of nodes) {
      const primaryPattern = node.patterns?.primaryPattern;
      if (primaryPattern) {
        totalPatterns++;
        
        // Count by family
        patternsByFamily[primaryPattern.family] = (patternsByFamily[primaryPattern.family] || 0) + 1;
        
        // Count by health
        healthDistribution[primaryPattern.health] = (healthDistribution[primaryPattern.health] || 0) + 1;
        
        // Count by pattern name
        patternCounts[primaryPattern.name] = (patternCounts[primaryPattern.name] || 0) + 1;
      }
    }

    // Get top 5 most common patterns
    const topPatterns = Object.entries(patternCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      totalPatterns,
      patternsByFamily,
      healthDistribution,
      topPatterns
    };
  }
}