/**
 * Navigation Context Management
 * Handles context preservation and passing between components during navigation
 */

export interface NavigationContext {
  // Source information
  sourceComponent: string;
  sourceRoute: string;
  timestamp: number;
  
  // Selected entities
  selectedSymbol?: {
    id: number;
    name: string;
    qualified_name: string;
    kind: string;
    namespace?: string;
    file_path?: string;
    language?: string;
  };
  
  selectedFile?: {
    path: string;
    language?: string;
    module?: string;
  };
  
  selectedNamespace?: {
    name: string;
    fullPath: string;
    symbolCount?: number;
  };
  
  // Analysis context
  analysisType?: 'code-flow' | 'impact' | 'performance' | 'patterns' | 'relationships';
  filters?: Record<string, any>;
  viewState?: Record<string, any>;
  
  // Additional data
  metadata?: Record<string, any>;
}

export interface NavigationTarget {
  route: string;
  component: string;
  title: string;
  icon: string;
  description?: string;
}

export class NavigationContextManager {
  private static instance: NavigationContextManager;
  private currentContext: NavigationContext | null = null;
  private contextHistory: NavigationContext[] = [];
  private maxHistorySize = 50;
  
  private constructor() {}
  
  static getInstance(): NavigationContextManager {
    if (!NavigationContextManager.instance) {
      NavigationContextManager.instance = new NavigationContextManager();
    }
    return NavigationContextManager.instance;
  }
  
  /**
   * Create a new navigation context
   */
  createContext(sourceComponent: string, sourceRoute: string): NavigationContext {
    return {
      sourceComponent,
      sourceRoute,
      timestamp: Date.now()
    };
  }
  
  /**
   * Set the current navigation context
   */
  setContext(context: NavigationContext): void {
    if (this.currentContext) {
      this.addToHistory(this.currentContext);
    }
    this.currentContext = context;
  }
  
  /**
   * Get the current navigation context
   */
  getContext(): NavigationContext | null {
    return this.currentContext;
  }
  
  /**
   * Update the current context with new data
   */
  updateContext(updates: Partial<NavigationContext>): void {
    if (this.currentContext) {
      this.currentContext = {
        ...this.currentContext,
        ...updates
      };
    }
  }
  
  /**
   * Add context to history
   */
  private addToHistory(context: NavigationContext): void {
    this.contextHistory.unshift(context);
    if (this.contextHistory.length > this.maxHistorySize) {
      this.contextHistory = this.contextHistory.slice(0, this.maxHistorySize);
    }
  }
  
  /**
   * Get navigation history
   */
  getHistory(): NavigationContext[] {
    return [...this.contextHistory];
  }
  
  /**
   * Get previous context
   */
  getPreviousContext(): NavigationContext | null {
    return this.contextHistory[0] || null;
  }
  
  /**
   * Clear navigation history
   */
  clearHistory(): void {
    this.contextHistory = [];
  }
  
  /**
   * Get suggested navigation targets based on current context
   */
  getSuggestedTargets(context: NavigationContext): NavigationTarget[] {
    const targets: NavigationTarget[] = [];
    
    if (context.selectedSymbol) {
      // Symbol-based navigation options
      targets.push({
        route: '/code-flow',
        component: 'enhanced-code-flow',
        title: 'View Code Flow',
        icon: '🌊',
        description: 'Analyze control flow and execution paths'
      });
      
      targets.push({
        route: '/impact',
        component: 'impact-visualization',
        title: 'Analyze Impact',
        icon: '💥',
        description: 'See what this symbol affects'
      });
      
      targets.push({
        route: '/relationships',
        component: 'relationship-graph',
        title: 'Show Relationships',
        icon: '🕸️',
        description: 'Visualize dependencies and connections'
      });
      
      targets.push({
        route: '/performance',
        component: 'performance-hotspots',
        title: 'Check Performance',
        icon: '🔥',
        description: 'Find performance bottlenecks'
      });
    }
    
    if (context.selectedFile) {
      // File-based navigation options
      targets.push({
        route: '/patterns',
        component: 'pattern-analyzer',
        title: 'Find Patterns',
        icon: '🧩',
        description: 'Detect patterns and anti-patterns'
      });
      
      targets.push({
        route: '/namespaces',
        component: 'namespace-explorer',
        title: 'Explore Namespace',
        icon: '📦',
        description: 'Browse namespace hierarchy'
      });
    }
    
    if (context.selectedNamespace) {
      // Namespace-based navigation options
      targets.push({
        route: '/relationships',
        component: 'relationship-graph',
        title: 'View Dependencies',
        icon: '🕸️',
        description: 'See namespace relationships'
      });
    }
    
    // Always available targets
    targets.push({
      route: '/multi-language-flow',
      component: 'multi-language-flow-explorer',
      title: 'Cross-Language Analysis',
      icon: '🌍',
      description: 'Analyze cross-language interactions'
    });
    
    targets.push({
      route: '/insights',
      component: 'insights-dashboard',
      title: 'Get Insights',
      icon: '💡',
      description: 'AI-powered code analysis'
    });
    
    return targets;
  }
  
  /**
   * Build navigation URL with context
   */
  buildNavigationUrl(target: NavigationTarget, context: NavigationContext): string {
    const params = new URLSearchParams();
    
    // Add context data as query parameters
    if (context.selectedSymbol) {
      params.set('symbol_id', context.selectedSymbol.id.toString());
      params.set('symbol_name', context.selectedSymbol.name);
    }
    
    if (context.selectedFile) {
      params.set('file', context.selectedFile.path);
    }
    
    if (context.selectedNamespace) {
      params.set('namespace', context.selectedNamespace.fullPath);
    }
    
    if (context.sourceComponent) {
      params.set('from', context.sourceComponent);
    }
    
    const queryString = params.toString();
    return queryString ? `${target.route}?${queryString}` : target.route;
  }
  
  /**
   * Extract context from URL parameters
   */
  extractContextFromUrl(url: string): Partial<NavigationContext> {
    const urlObj = new URL(url, window.location.origin);
    const params = urlObj.searchParams;
    const context: Partial<NavigationContext> = {};
    
    // Extract symbol information
    const symbolId = params.get('symbol_id');
    const symbolName = params.get('symbol_name');
    if (symbolId && symbolName) {
      context.selectedSymbol = {
        id: parseInt(symbolId, 10),
        name: symbolName,
        qualified_name: params.get('symbol_qname') || symbolName,
        kind: params.get('symbol_kind') || 'unknown'
      };
    }
    
    // Extract file information
    const filePath = params.get('file');
    if (filePath) {
      context.selectedFile = {
        path: filePath,
        language: params.get('file_lang') || undefined
      };
    }
    
    // Extract namespace information
    const namespace = params.get('namespace');
    if (namespace) {
      context.selectedNamespace = {
        name: namespace.split('.').pop() || namespace,
        fullPath: namespace
      };
    }
    
    // Extract source component
    const from = params.get('from');
    if (from) {
      context.sourceComponent = from;
    }
    
    return context;
  }
  
  /**
   * Format context for display
   */
  formatContextDisplay(context: NavigationContext): string {
    const parts: string[] = [];
    
    if (context.selectedSymbol) {
      parts.push(`Symbol: ${context.selectedSymbol.name}`);
    }
    
    if (context.selectedFile) {
      const fileName = context.selectedFile.path.split('/').pop();
      parts.push(`File: ${fileName}`);
    }
    
    if (context.selectedNamespace) {
      parts.push(`Namespace: ${context.selectedNamespace.name}`);
    }
    
    return parts.join(' • ') || 'No context';
  }
}

// Export singleton instance
export const navigationContext = NavigationContextManager.getInstance();