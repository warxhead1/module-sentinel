import { DashboardComponent, defineComponent } from './base-component.js';
import * as d3 from 'd3';

interface FlowMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  paramCount: number;
  localVariables: number;
  returnPoints: number;
}

interface DataFlowEdge {
  variable: string;
  from: number;
  to: number;
  type: 'read' | 'write' | 'modify';
  value?: string;
}

interface ControlFlowNode {
  id: string;
  type: 'entry' | 'exit' | 'statement' | 'condition' | 'loop' | 'return' | 'exception';
  line: number;
  code: string;
  metrics?: {
    executionTime?: number;
    callCount?: number;
    memoryUsage?: number;
  };
}

interface ControlFlowEdge {
  from: string;
  to: string;
  type: 'normal' | 'true' | 'false' | 'exception' | 'loop-back';
  probability?: number;
  label?: string;
}

interface EnhancedControlFlow {
  nodes: ControlFlowNode[];
  edges: ControlFlowEdge[];
  metrics: FlowMetrics;
  dataFlows: DataFlowEdge[];
  hotPaths: string[][];
  deadCode: number[];
  symbol: any; // Store the symbol information for navigation
  functionCalls: any[]; // Store the function call edges from API
  blocks: any[]; // Store the control flow blocks from API
  callers: any[]; // Functions that call this function
  callees: any[]; // Functions called by this function
}

interface NavigationContext {
  symbolId: number;
  symbolName: string;
  controlFlow: EnhancedControlFlow;
  position?: { x: number; y: number; scale: number };
}

export class EnhancedCodeFlow extends DashboardComponent {
  private symbolId: number | null = null;
  private controlFlow: EnhancedControlFlow | null = null;
  private viewMode: 'control' | 'data' | 'metrics' | 'hotspots' = 'control';
  private highlightedPath: string[] = [];
  private selectedVariable: string | null = null;
  private searchQuery: string = '';
  private searchResults: any[] = [];
  
  // Navigation state for multi-level function exploration
  private navigationStack: NavigationContext[] = [];
  private currentContext: NavigationContext | null = null;
  private isNavigating: boolean = false;

  async loadData(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const symbolId = params.get('symbolId');
    
    if (symbolId) {
      this.symbolId = parseInt(symbolId);
      await this.loadEnhancedFlow();
    } else {
      this.render();
    }
  }

  private async loadCallGraph() {
    try {
      if (!this.symbolId || !this.controlFlow) return;
      
      // Fetch call graph data
      const callGraphData = await this.fetchAPI(`/api/code-flow/call-graph/${this.symbolId}?depth=1&direction=both`);
      
      if (callGraphData) {
        this.controlFlow.callers = callGraphData.callers || [];
        this.controlFlow.callees = callGraphData.callees || [];
      }
    } catch (error) {
      console.error('Error loading call graph:', error);
      // Don't fail the whole component if call graph loading fails
      if (this.controlFlow) {
        this.controlFlow.callers = [];
        this.controlFlow.callees = [];
      }
    }
  }

  private async loadEnhancedFlow() {
    try {
      this._loading = true;
      this.render();

      // Load control flow with enhanced metrics
      const data = await this.fetchAPI(`/api/code-flow/control-flow/${this.symbolId}?includeDataFlow=true`);
      
      // fetchAPI already unwraps the response.data, so we get the data directly
      if (!data) {
        throw new Error('No control flow data received');
      }

      // Transform the response into our enhanced format
      this.controlFlow = this.transformControlFlow(data);
      
      // Load caller/callee information
      await this.loadCallGraph();
      
      this._loading = false;
      this.render();
      
      // Initialize visualization after DOM is ready
      setTimeout(async () => {
        if (this.viewMode === 'control') {
          await this.initializeControlFlowGraph();
        } else if (this.viewMode === 'data') {
          this.initializeDataFlowGraph();
        }
      }, 0);
    } catch (error) {
      console.error('Control flow loading error:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      this._error = `Control flow error: ${error instanceof Error ? error.message : String(error)}`;
      this._loading = false;
      this.render();
    }
  }

  private transformControlFlow(data: any): EnhancedControlFlow {
    console.log('Transforming control flow data:', data);
    
    try {
      // Calculate complexity metrics
      console.log('Calculating metrics...');
      const metrics: FlowMetrics = {
        cyclomaticComplexity: this.calculateCyclomaticComplexity(data),
        cognitiveComplexity: this.calculateCognitiveComplexity(data),
        nestingDepth: this.calculateNestingDepth(data),
        paramCount: data.symbol.signature?.match(/\(/g)?.length || 0,
        localVariables: this.countLocalVariables(data),
        returnPoints: data.exit_points?.length || 1
      };
      console.log('Calculated metrics:', metrics);

      // Build control flow nodes and edges
      console.log('Building nodes and edges...');
      const nodes: ControlFlowNode[] = [];
      const edges: ControlFlowEdge[] = [];
    
    // Entry node
    nodes.push({
      id: 'entry',
      type: 'entry',
      line: data.entry_point,
      code: `${data.symbol.name}(${this.extractParameters(data.symbol.signature)})`
    });

    // Process blocks
    data.blocks?.forEach((block: any) => {
      const nodeId = `block_${block.id}`;
      nodes.push({
        id: nodeId,
        type: this.mapBlockType(block.block_type),
        line: block.start_line,
        code: block.condition || `Lines ${block.start_line}-${block.end_line}`
      });

      // Add edges based on block relationships
      if (block.parent_block_id) {
        edges.push({
          from: `block_${block.parent_block_id}`,
          to: nodeId,
          type: 'normal'
        });
      } else {
        edges.push({
          from: 'entry',
          to: nodeId,
          type: 'normal'
        });
      }
    });

    // If no blocks, create a simple flow from entry to exit
    if (!data.blocks || data.blocks.length === 0) {
      // Add a statement node representing the function body
      nodes.push({
        id: 'function_body',
        type: 'statement',
        line: data.entry_point,
        code: `Function body (${data.symbol.name})`
      });
      
      edges.push({
        from: 'entry',
        to: 'function_body',
        type: 'normal'
      });
    }

      // Exit nodes
      console.log('Adding exit nodes...');
      data.exit_points?.forEach((exitLine: number, index: number) => {
        const exitId = `exit_${index}`;
        nodes.push({
          id: exitId,
          type: 'exit',
          line: exitLine,
          code: 'return'
        });
        
        // Connect function body to exit if no blocks
        if (!data.blocks || data.blocks.length === 0) {
          edges.push({
            from: 'function_body',
            to: exitId,
            type: 'normal'
          });
        }
      });

      // Analyze hot paths and dead code
      console.log('Analyzing paths...');
      const hotPaths = this.findHotPaths(nodes, edges);
      const deadCode = this.findDeadCode(nodes, edges);

      console.log('Returning transformed data with', nodes.length, 'nodes and', edges.length, 'edges');
      return {
        nodes,
        edges,
        metrics,
        dataFlows: [],
        hotPaths,
        deadCode,
        symbol: data.symbol, // Include symbol information for navigation
        functionCalls: data.edges || [], // Store function call edges from API
        blocks: data.blocks || [], // Store control flow blocks from API
        callers: [], // Will be populated from call graph API
        callees: [] // Will be populated from call graph API
      };
    } catch (error) {
      console.error('Error in transformControlFlow:', error);
      throw new Error(`Transform failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private calculateCyclomaticComplexity(data: any): number {
    // McCabe's cyclomatic complexity: E - N + 2P
    // E = edges, N = nodes, P = connected components (usually 1)
    const nodeCount = (data.blocks?.length || 0) + 2; // +2 for entry and exit
    const edgeCount = data.edges?.length || nodeCount - 1;
    return edgeCount - nodeCount + 2;
  }

  private calculateCognitiveComplexity(data: any): number {
    let complexity = 0;
    let nestingLevel = 0;
    
    data.blocks?.forEach((block: any) => {
      if (block.block_type === 'condition') {
        complexity += 1 + nestingLevel;
      } else if (block.block_type === 'loop') {
        complexity += 1 + nestingLevel;
      }
      
      if (block.parent_block_id) {
        nestingLevel++;
      }
    });
    
    return complexity;
  }

  private calculateNestingDepth(data: any): number {
    let maxDepth = 0;
    const blockMap = new Map(data.blocks?.map((b: any) => [b.id, b]) || []);
    
    data.blocks?.forEach((block: any) => {
      let depth = 0;
      let current = block;
      
      while (current.parent_block_id) {
        depth++;
        current = blockMap.get(current.parent_block_id);
        if (!current) break;
      }
      
      maxDepth = Math.max(maxDepth, depth);
    });
    
    return maxDepth;
  }

  private countLocalVariables(data: any): number {
    // This would require parsing the actual code
    // For now, return an estimate based on complexity
    return Math.floor(data.blocks?.length * 1.5 || 0);
  }

  private extractParameters(signature: string | null): string {
    if (!signature) return '';
    const match = signature.match(/\((.*?)\)/);
    return match ? match[1] : '';
  }

  private mapBlockType(blockType: string): ControlFlowNode['type'] {
    const mapping: Record<string, ControlFlowNode['type']> = {
      'entry': 'entry',
      'exit': 'exit',
      'conditional': 'condition',
      'condition': 'condition',
      'loop': 'loop',
      'try': 'exception',
      'catch': 'exception',
      'return': 'return'
    };
    return mapping[blockType] || 'statement';
  }

  private findHotPaths(nodes: ControlFlowNode[], edges: ControlFlowEdge[]): string[][] {
    // Find paths with highest execution probability
    const paths: string[][] = [];
    const visited = new Set<string>();
    
    const dfs = (nodeId: string, path: string[]) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      
      path.push(nodeId);
      
      if (node.type === 'exit') {
        paths.push([...path]);
      } else {
        const outgoing = edges.filter(e => e.from === nodeId);
        outgoing.forEach(edge => {
          dfs(edge.to, path);
        });
      }
      
      path.pop();
      visited.delete(nodeId);
    };
    
    dfs('entry', []);
    
    // Sort by length (shorter paths are often hotter)
    return paths.sort((a, b) => a.length - b.length).slice(0, 5);
  }

  private findDeadCode(nodes: ControlFlowNode[], edges: ControlFlowEdge[]): number[] {
    // Find unreachable nodes
    const reachable = new Set<string>();
    const queue = ['entry'];
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (reachable.has(nodeId)) continue;
      
      reachable.add(nodeId);
      
      const outgoing = edges.filter(e => e.from === nodeId);
      outgoing.forEach(edge => {
        if (!reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      });
    }
    
    // Return line numbers of unreachable nodes
    return nodes
      .filter(n => !reachable.has(n.id))
      .map(n => n.line);
  }

  private renderBreadcrumbs(): string {
    // Always show breadcrumbs if we have control flow data, even if no navigation stack
    if (this.navigationStack.length === 0 && !this.currentContext && !this.controlFlow) {
      return '';
    }

    const breadcrumbItems = [];
    
    // Add navigation stack items
    this.navigationStack.forEach((context, index) => {
      breadcrumbItems.push(`
        <span class="breadcrumb-item" data-nav-index="${index}">
          <span class="breadcrumb-icon">🔗</span>
          ${context.symbolName}
        </span>
      `);
    });

    // Add current context or current function if no context
    if (this.currentContext) {
      breadcrumbItems.push(`
        <span class="breadcrumb-item current">
          <span class="breadcrumb-icon">📍</span>
          ${this.currentContext.symbolName}
        </span>
      `);
    } else if (this.controlFlow && this.controlFlow.symbol) {
      // Show current function even without navigation context
      breadcrumbItems.push(`
        <span class="breadcrumb-item current">
          <span class="breadcrumb-icon">📍</span>
          ${this.controlFlow.symbol.name || this.controlFlow.symbol.qualified_name || 'Current Function'}
        </span>
      `);
    }

    return `
      <div class="navigation-breadcrumbs">
        <div class="breadcrumb-header">
          <div class="nav-controls">
            ${this.navigationStack.length > 0 ? `
              <button class="nav-button back-button" data-nav-back title="Go back one step">
                <span>⬅️</span>
                Back
              </button>
            ` : this.controlFlow ? `
              <button class="nav-button search-button" data-nav-search title="Return to function search">
                <span>🔍</span>
                Search
              </button>
            ` : ''}
            <span class="breadcrumb-title">🧭 Navigation Path</span>
            ${this.navigationStack.length > 0 ? `
              <button class="nav-button home-button" data-nav-home title="Return to starting function">
                <span>🏠</span>
                Home
              </button>
            ` : ''}
          </div>
        </div>
        <div class="breadcrumb-trail">
          ${breadcrumbItems.join('<span class="breadcrumb-separator">→</span>')}
        </div>
      </div>
      ${this.renderCallRelationships()}
    `;
  }

  private renderCallRelationships(): string {
    if (!this.controlFlow || (!this.controlFlow.callers?.length && !this.controlFlow.callees?.length)) {
      return '';
    }

    const callers = this.controlFlow.callers || [];
    const callees = this.controlFlow.callees || [];

    return `
      <div class="call-relationships">
        <div class="relationship-header">
          <span class="relationship-title">🔗 Function Relationships</span>
        </div>
        <div class="relationship-sections">
          ${callers.length > 0 ? `
            <div class="relationship-section">
              <h4 class="section-title">
                <span class="section-icon">⬆️</span>
                Called by (${callers.length})
              </h4>
              <div class="relationship-list">
                ${callers.slice(0, 5).map(caller => `
                  <button class="relationship-item caller-item" data-action="navigate" data-symbol-id="${caller.id}">
                    <span class="relationship-name">${caller.name}</span>
                    <span class="relationship-meta">${caller.kind} • ${caller.call_info?.call_count || 1} calls</span>
                  </button>
                `).join('')}
                ${callers.length > 5 ? `
                  <button class="show-more-btn" data-action="show-callers">
                    +${callers.length - 5} more callers
                  </button>
                ` : ''}
              </div>
            </div>
          ` : ''}
          
          ${callees.length > 0 ? `
            <div class="relationship-section">
              <h4 class="section-title">
                <span class="section-icon">⬇️</span>
                Calls (${callees.length})
              </h4>
              <div class="relationship-list">
                ${callees.slice(0, 5).map(callee => `
                  <button class="relationship-item callee-item" data-action="navigate" data-symbol-id="${callee.id}">
                    <span class="relationship-name">${callee.name}</span>
                    <span class="relationship-meta">${callee.kind} • ${callee.call_info?.call_count || 1} calls</span>
                  </button>
                `).join('')}
                ${callees.length > 5 ? `
                  <button class="show-more-btn" data-action="show-callees">
                    +${callees.length - 5} more callees
                  </button>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderSymbolSelector(): string {
    return `
      <div class="symbol-selector">
        ${this.renderBreadcrumbs()}
        <div class="selector-header">
          <h2>Select a Function to Analyze</h2>
          <p>Search for functions, methods, or classes to analyze their control flow</p>
        </div>
        
        <div class="search-container">
          <div class="search-box">
            <input 
              type="text" 
              class="search-input" 
              placeholder="Search for functions..."
              value="${this.searchQuery}"
              id="symbolSearch"
            />
            <span class="search-icon">🔍</span>
          </div>
        </div>
        
        <div class="search-results-container">
          ${this.searchResults.length > 0 ? `
            <div class="search-results">
              ${this.searchResults.map(result => `
                <div class="result-item" data-symbol-id="${result.id}">
                  <div class="result-name">${result.name || result.qualified_name}</div>
                  <div class="result-details">
                    <span class="result-type">${result.kind}</span>
                    <span class="result-location">${result.file}:${result.line}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : this.searchQuery.length > 0 ? `
            <div class="search-results">
              <div class="no-results">No functions found matching "${this.searchQuery}"</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private async searchSymbols(query: string) {
    if (query.length < 2) {
      this.searchResults = [];
      this.updateSearchResults();
      return;
    }

    try {
      const response = await this.fetchAPI(`/api/search?q=${encodeURIComponent(query)}&type=function&limit=20`);
      this.searchResults = response.results || [];
      this.updateSearchResults();
    } catch (error) {
      console.error('Search failed:', error);
      this.searchResults = [];
      this.updateSearchResults();
    }
  }

  private updateSearchResults() {
    // Only update the search results container, not the entire component
    const searchContainer = this.shadow.querySelector('.search-results-container');
    if (!searchContainer) return;

    if (this.searchResults.length > 0) {
      searchContainer.innerHTML = `
        <div class="search-results">
          ${this.searchResults.map(result => `
            <div class="result-item" data-symbol-id="${result.id}">
              <div class="result-name">${result.name || result.qualified_name}</div>
              <div class="result-details">
                <span class="result-type">${result.kind}</span>
                <span class="result-location">${result.file}:${result.line}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (this.searchQuery.length > 0) {
      searchContainer.innerHTML = `
        <div class="search-results">
          <div class="no-results">No functions found matching "${this.searchQuery}"</div>
        </div>
      `;
    } else {
      searchContainer.innerHTML = '';
    }

    // Re-attach click events to the new result items
    this.attachSearchResultEvents();
    
    // Re-attach breadcrumb events in case they changed
    this.attachBreadcrumbEvents();
  }

  private attachSearchResultEvents() {
    // Search result clicks
    this.shadow.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const symbolId = (e.currentTarget as HTMLElement).getAttribute('data-symbol-id');
        if (symbolId) {
          this.symbolId = parseInt(symbolId);
          this.loadEnhancedFlow();
        }
      });
    });
  }

  private attachBreadcrumbEvents() {
    // Breadcrumb item clicks (navigate to specific function in stack)
    this.shadow.querySelectorAll('.breadcrumb-item[data-nav-index]').forEach(item => {
      item.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-nav-index') || '0');
        this.navigateBack(index);
      });
    });

    // Back button click (navigate back one step)
    const backButton = this.shadow.querySelector('[data-nav-back]');
    if (backButton) {
      backButton.addEventListener('click', () => {
        this.navigateBack();
      });
    }

    // Home button click (navigate to root)
    const homeButton = this.shadow.querySelector('[data-nav-home]');
    if (homeButton) {
      homeButton.addEventListener('click', () => {
        this.navigateHome();
      });
    }

    // Search button click (return to search)
    const searchButton = this.shadow.querySelector('[data-nav-search]');
    if (searchButton) {
      searchButton.addEventListener('click', () => {
        this.returnToSearch();
      });
    }
  }

  private attachRelationshipEvents() {
    // Caller/callee navigation clicks
    this.shadow.querySelectorAll('.relationship-item[data-action="navigate"]').forEach(item => {
      item.addEventListener('click', async (e) => {
        const symbolId = (e.currentTarget as HTMLElement).getAttribute('data-symbol-id');
        if (symbolId) {
          await this.navigateToSymbolById(parseInt(symbolId));
        }
      });
    });

    // Show more buttons for expanded lists
    this.shadow.querySelectorAll('[data-action="show-callers"], [data-action="show-callees"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
        if (action === 'show-callers') {
          this.showAllCallers();
        } else if (action === 'show-callees') {
          this.showAllCallees();
        }
      });
    });
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

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 30px 40px;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .page-header {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        h1 {
          font-size: 2.2rem;
          font-weight: 300;
          color: #fff;
          margin: 0 0 8px 0;
        }
        
        .subtitle {
          font-size: 1.1rem;
          color: #aaa;
          font-weight: 300;
        }
        
        .flow-container {
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 20px;
          height: calc(100vh - 200px);
        }
        
        .flow-main {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          position: relative;
          overflow: hidden;
        }
        
        .flow-sidebar {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .sidebar-panel {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
          overflow-y: auto;
        }
        
        .view-tabs {
          display: flex;
          gap: 10px;
          padding: 15px;
          background: rgba(0, 0, 0, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .tab-btn {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid rgba(78, 205, 196, 0.5);
          color: #4ecdc4;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
        }
        
        .tab-btn:hover {
          background: rgba(78, 205, 196, 0.3);
        }
        
        .tab-btn.active {
          background: rgba(78, 205, 196, 0.4);
          border-color: #4ecdc4;
        }
        
        .graph-container {
          width: 100%;
          height: calc(100% - 60px);
          position: relative;
        }
        
        #flowGraph {
          width: 100%;
          height: 100%;
        }
        
        /* Metrics Panel */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }
        
        .metric-card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 15px;
          text-align: center;
        }
        
        .metric-value {
          font-size: 2rem;
          font-weight: 600;
          color: #4ecdc4;
          margin-bottom: 5px;
        }
        
        .metric-label {
          font-size: 0.9rem;
          color: #888;
        }
        
        .metric-card.warning .metric-value {
          color: #feca57;
        }
        
        .metric-card.danger .metric-value {
          color: #ff6b6b;
        }
        
        /* Complexity Gauge */
        .complexity-gauge {
          position: relative;
          height: 120px;
          margin: 20px 0;
        }
        
        .gauge-arc {
          stroke-width: 15;
          fill: none;
          stroke-linecap: round;
        }
        
        .gauge-background {
          stroke: rgba(255, 255, 255, 0.1);
        }
        
        .gauge-fill {
          stroke: url(#complexityGradient);
          transition: stroke-dashoffset 0.5s ease;
        }
        
        .gauge-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        
        .gauge-value {
          font-size: 2.5rem;
          font-weight: 600;
          color: #fff;
        }
        
        .gauge-label {
          font-size: 0.9rem;
          color: #888;
        }
        
        /* Hot Paths */
        .hot-paths {
          margin-top: 20px;
        }
        
        .path-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .path-item:hover {
          background: rgba(78, 205, 196, 0.1);
          transform: translateX(5px);
        }
        
        .path-item.highlighted {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid #4ecdc4;
        }
        
        .path-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 5px;
        }
        
        .path-name {
          font-weight: 500;
          color: #e0e0e0;
        }
        
        .path-heat {
          display: flex;
          gap: 2px;
        }
        
        .heat-bar {
          width: 4px;
          height: 16px;
          background: rgba(255, 107, 107, 0.3);
          border-radius: 2px;
        }
        
        .heat-bar.active {
          background: #ff6b6b;
        }
        
        .path-nodes {
          font-size: 0.85rem;
          color: #888;
          font-family: 'Fira Code', monospace;
        }
        
        /* Dead Code Alert */
        .dead-code-alert {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.3);
          border-radius: 8px;
          padding: 15px;
          margin-top: 20px;
        }
        
        .alert-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .alert-icon {
          font-size: 1.5rem;
        }
        
        .alert-title {
          font-weight: 500;
          color: #ff6b6b;
        }
        
        .dead-code-lines {
          font-family: 'Fira Code', monospace;
          font-size: 0.85rem;
          color: #e0e0e0;
        }
        
        /* Control Flow Graph Styles */
        .control-node {
          cursor: pointer;
        }
        
        .control-node rect {
          stroke: #fff;
          stroke-width: 2px;
        }
        
        .control-node.entry rect {
          fill: #06ffa5;
          rx: 20;
        }
        
        .control-node.exit rect {
          fill: #ff6b6b;
          rx: 20;
        }
        
        .control-node.condition rect {
          fill: #feca57;
          transform: rotate(45deg);
        }
        
        .control-node.loop rect {
          fill: #4ecdc4;
          rx: 10;
        }
        
        .control-node.statement rect {
          fill: #778ca3;
        }
        
        .control-node text {
          fill: #000;
          font-size: 12px;
          font-weight: 500;
          text-anchor: middle;
          pointer-events: none;
        }
        
        .control-edge {
          fill: none;
          stroke: #666;
          stroke-width: 2px;
          marker-end: url(#arrowhead);
        }
        
        .control-edge.true {
          stroke: #06ffa5;
        }
        
        .control-edge.false {
          stroke: #ff6b6b;
        }
        
        .control-edge.highlighted {
          stroke: #4ecdc4;
          stroke-width: 3px;
        }
        
        .edge-label {
          fill: #aaa;
          font-size: 10px;
          text-anchor: middle;
        }
        
        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: #888;
        }
        
        /* Symbol Selector Styles */
        .symbol-selector {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 40px;
        }
        
        .selector-header {
          text-align: center;
          margin-bottom: 40px;
        }
        
        .selector-header h2 {
          font-size: 2rem;
          font-weight: 300;
          color: #fff;
          margin: 0 0 10px 0;
        }
        
        .selector-header p {
          color: #888;
          font-size: 1.1rem;
        }
        
        /* Navigation Breadcrumbs Styles */
        .navigation-breadcrumbs {
          width: 100%;
          max-width: 800px;
          margin-bottom: 30px;
          background: linear-gradient(135deg, rgba(100, 255, 218, 0.05), rgba(78, 205, 196, 0.03));
          border: 1px solid rgba(100, 255, 218, 0.2);
          border-radius: 12px;
          padding: 20px;
          backdrop-filter: blur(10px);
        }
        
        .breadcrumb-header {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .nav-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          justify-content: space-between;
        }
        
        .nav-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          background: linear-gradient(135deg, rgba(100, 255, 218, 0.1), rgba(78, 205, 196, 0.05));
          color: var(--primary-accent);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(5px);
          border: 1px solid rgba(100, 255, 218, 0.2);
        }
        
        .nav-button:hover {
          background: linear-gradient(135deg, rgba(100, 255, 218, 0.2), rgba(78, 205, 196, 0.1));
          border-color: rgba(100, 255, 218, 0.4);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(100, 255, 218, 0.15);
        }
        
        .nav-button:active {
          transform: translateY(0);
        }
        
        .nav-button span {
          font-size: 1rem;
        }
        
        .back-button {
          background: linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.05)) !important;
          border-color: rgba(255, 193, 7, 0.2) !important;
          color: #ffc107 !important;
        }
        
        .back-button:hover {
          background: linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 152, 0, 0.1)) !important;
          border-color: rgba(255, 193, 7, 0.4) !important;
          box-shadow: 0 4px 12px rgba(255, 193, 7, 0.15) !important;
        }
        
        .home-button {
          background: linear-gradient(135deg, rgba(255, 107, 107, 0.1), rgba(238, 90, 82, 0.05)) !important;
          border-color: rgba(255, 107, 107, 0.2) !important;
          color: #ff6b6b !important;
        }

        .home-button:hover {
          background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(238, 90, 82, 0.1)) !important;
          border-color: rgba(255, 107, 107, 0.4) !important;
          box-shadow: 0 4px 12px rgba(255, 107, 107, 0.15) !important;
        }
        
        .search-button {
          background: linear-gradient(135deg, rgba(156, 39, 176, 0.1), rgba(103, 58, 183, 0.05)) !important;
          border-color: rgba(156, 39, 176, 0.2) !important;
          color: #9c27b0 !important;
        }

        .search-button:hover {
          background: linear-gradient(135deg, rgba(156, 39, 176, 0.2), rgba(103, 58, 183, 0.1)) !important;
          border-color: rgba(156, 39, 176, 0.4) !important;
          box-shadow: 0 4px 12px rgba(156, 39, 176, 0.15) !important;
        }
        
        .breadcrumb-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--primary-accent);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .breadcrumb-home {
          background: linear-gradient(135deg, #ff6b6b, #ee5a52);
          border: none;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.3s ease;
          font-weight: 500;
        }
        
        .breadcrumb-home:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
        }
        
        .breadcrumb-trail {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        
        .breadcrumb-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
          border: 1px solid rgba(100, 255, 218, 0.1);
        }
        
        .breadcrumb-item:hover {
          background: rgba(100, 255, 218, 0.1);
          transform: translateY(-1px);
          border-color: rgba(100, 255, 218, 0.3);
        }
        
        .breadcrumb-item.current {
          background: linear-gradient(135deg, var(--primary-accent), var(--secondary-accent));
          color: #000;
          font-weight: 600;
          cursor: default;
          border-color: var(--primary-accent);
        }
        
        .breadcrumb-item.current:hover {
          transform: none;
        }
        
        .breadcrumb-separator {
          color: var(--primary-accent);
          font-size: 1.2rem;
          font-weight: bold;
        }
        
        .breadcrumb-icon {
          font-size: 1.1rem;
        }
        
        /* Navigation Menu Styles */
        .navigation-menu {
          position: absolute;
          background: linear-gradient(135deg, rgba(20, 20, 40, 0.95), rgba(30, 30, 50, 0.95));
          border: 1px solid rgba(100, 255, 218, 0.3);
          border-radius: 8px;
          padding: 8px 0;
          z-index: 1000;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          min-width: 180px;
        }
        
        .nav-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.9rem;
          color: #e0e0e0;
        }
        
        .nav-option:hover {
          background: rgba(100, 255, 218, 0.1);
          color: var(--primary-accent);
        }
        
        .nav-option.dive-in:hover {
          background: linear-gradient(90deg, rgba(100, 255, 218, 0.1), rgba(78, 205, 196, 0.05));
        }
        
        .nav-icon {
          font-size: 1.1rem;
          width: 16px;
          text-align: center;
          flex-shrink: 0;
        }
        
        .nav-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .nav-content strong {
          color: inherit;
          font-weight: 600;
        }
        
        .nav-content small {
          opacity: 0.7;
          font-size: 0.8rem;
          color: #b0b0b0;
        }
        
        .search-container {
          width: 100%;
          max-width: 600px;
          margin-bottom: 30px;
        }
        
        .search-box {
          position: relative;
          width: 100%;
        }
        
        .search-input {
          width: 100%;
          padding: 16px 50px 16px 20px;
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(78, 205, 196, 0.3);
          border-radius: 10px;
          color: #fff;
          font-size: 1.1rem;
          outline: none;
          transition: all 0.3s ease;
        }
        
        .search-input:focus {
          border-color: #4ecdc4;
          background: rgba(0, 0, 0, 0.7);
          box-shadow: 0 0 20px rgba(78, 205, 196, 0.3);
        }
        
        .search-input::placeholder {
          color: #666;
        }
        
        .search-icon {
          position: absolute;
          right: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #4ecdc4;
          font-size: 1.4rem;
        }
        
        .search-results {
          width: 100%;
          max-width: 600px;
          max-height: 400px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .result-item {
          padding: 15px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .result-item:hover {
          background: rgba(78, 205, 196, 0.1);
          transform: translateX(5px);
        }
        
        .result-item:last-child {
          border-bottom: none;
        }
        
        .result-name {
          font-size: 1.1rem;
          color: #4ecdc4;
          font-weight: 500;
          margin-bottom: 5px;
        }
        
        .result-details {
          display: flex;
          gap: 20px;
          font-size: 0.9rem;
          color: #888;
        }
        
        .result-type {
          color: #feca57;
        }
        
        .result-location {
          font-family: 'Fira Code', monospace;
        }
        
        .no-results {
          text-align: center;
          padding: 40px;
          color: #666;
        }
        
        /* Call relationships styles */
        .call-relationships {
          margin-top: 20px;
          padding: 15px;
          background: linear-gradient(135deg, rgba(100, 255, 218, 0.05), rgba(78, 205, 196, 0.03));
          border: 1px solid rgba(100, 255, 218, 0.2);
          border-radius: 10px;
          backdrop-filter: blur(5px);
        }
        
        .relationship-header {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .relationship-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--primary-accent);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .relationship-sections {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .relationship-section {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 12px 0;
          font-size: 0.9rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
        
        .section-icon {
          font-size: 1rem;
        }
        
        .relationship-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .relationship-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 12px;
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.2);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          font-size: 0.85rem;
        }
        
        .relationship-item:hover {
          background: rgba(78, 205, 196, 0.2);
          border-color: rgba(78, 205, 196, 0.4);
          transform: translateX(3px);
        }
        
        .relationship-name {
          color: var(--primary-accent);
          font-weight: 500;
          font-size: 0.9rem;
        }
        
        .relationship-meta {
          color: var(--text-secondary);
          font-size: 0.75rem;
          opacity: 0.8;
        }
        
        .show-more-btn {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.8rem;
          text-align: center;
          transition: all 0.2s ease;
        }
        
        .show-more-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
      </style>
      
      <div class="page-header">
        <h1>Enhanced Code Flow Analysis</h1>
        <p class="subtitle">Deep insights into control flow, complexity, and execution patterns</p>
      </div>
      
      <div class="flow-container">
        <div class="flow-main">
          ${this.controlFlow ? `
            ${this.renderBreadcrumbs()}
            <div class="view-tabs">
              <button class="tab-btn ${this.viewMode === 'control' ? 'active' : ''}" 
                      data-view="control">Control Flow</button>
              <button class="tab-btn ${this.viewMode === 'data' ? 'active' : ''}" 
                      data-view="data">Data Flow</button>
              <button class="tab-btn ${this.viewMode === 'metrics' ? 'active' : ''}" 
                      data-view="metrics">Metrics View</button>
              <button class="tab-btn ${this.viewMode === 'hotspots' ? 'active' : ''}" 
                      data-view="hotspots">Hotspots</button>
            </div>
            
            <div class="graph-container">
              ${this.renderViewContent()}
            </div>
          ` : this.renderSymbolSelector()}
        </div>
        
        <div class="flow-sidebar">
          ${this.controlFlow ? this.renderSidebarContent() : ''}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderViewContent(): string {
    switch (this.viewMode) {
      case 'control':
        return '<svg id="flowGraph"></svg>';
      case 'data':
        return this.renderDataFlowView();
      case 'metrics':
        return this.renderMetricsView();
      case 'hotspots':
        return this.renderHotspotsView();
      default:
        return '<div class="empty-state">Select a view mode</div>';
    }
  }

  private renderSidebarContent(): string {
    if (!this.controlFlow) return '';

    const { metrics, hotPaths, deadCode } = this.controlFlow;

    return `
      <div class="sidebar-panel">
        <h3>Complexity Metrics</h3>
        ${this.renderComplexityGauge(metrics.cyclomaticComplexity)}
        
        <div class="metrics-grid">
          <div class="metric-card ${metrics.cognitiveComplexity > 15 ? 'warning' : ''}">
            <div class="metric-value">${metrics.cognitiveComplexity}</div>
            <div class="metric-label">Cognitive Complexity</div>
          </div>
          <div class="metric-card ${metrics.nestingDepth > 4 ? 'danger' : ''}">
            <div class="metric-value">${metrics.nestingDepth}</div>
            <div class="metric-label">Max Nesting</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${metrics.returnPoints}</div>
            <div class="metric-label">Return Points</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${metrics.paramCount}</div>
            <div class="metric-label">Parameters</div>
          </div>
        </div>
      </div>
      
      <div class="sidebar-panel">
        <h3>Execution Hot Paths</h3>
        <div class="hot-paths">
          ${hotPaths.slice(0, 3).map((path, index) => `
            <div class="path-item" data-path="${path.join(',')}" data-index="${index}">
              <div class="path-header">
                <span class="path-name">Path ${index + 1}</span>
                <div class="path-heat">
                  ${Array(5).fill(0).map((_, i) => `
                    <div class="heat-bar ${i < (5 - index) ? 'active' : ''}"></div>
                  `).join('')}
                </div>
              </div>
              <div class="path-nodes">${this.formatPath(path)}</div>
            </div>
          `).join('')}
        </div>
        
        ${deadCode.length > 0 ? `
          <div class="dead-code-alert">
            <div class="alert-header">
              <span class="alert-icon">⚠️</span>
              <span class="alert-title">Unreachable Code Detected</span>
            </div>
            <div class="dead-code-lines">
              Lines: ${deadCode.join(', ')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderComplexityGauge(complexity: number): string {
    const maxComplexity = 50;
    const percentage = Math.min(complexity / maxComplexity, 1);
    const angle = percentage * 180;
    const radius = 50;
    
    return `
      <div class="complexity-gauge">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="complexityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#06ffa5;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#feca57;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#ff6b6b;stop-opacity:1" />
            </linearGradient>
          </defs>
          
          <path class="gauge-arc gauge-background"
                d="M 20 90 A ${radius} ${radius} 0 0 1 100 90"
                style="transform: translate(10px, 10px);" />
          
          <path class="gauge-arc gauge-fill"
                d="M 20 90 A ${radius} ${radius} 0 0 1 100 90"
                style="transform: translate(10px, 10px); stroke-dasharray: ${angle} 180; stroke-dashoffset: 0;" />
        </svg>
        
        <div class="gauge-text">
          <div class="gauge-value">${complexity}</div>
          <div class="gauge-label">Cyclomatic</div>
        </div>
      </div>
    `;
  }

  private formatPath(path: string[]): string {
    return path.map(nodeId => {
      if (nodeId === 'entry') return 'START';
      if (nodeId.startsWith('exit')) return 'END';
      if (nodeId.startsWith('block_')) return `B${nodeId.slice(6)}`;
      return nodeId;
    }).join(' → ');
  }

  private renderDataFlowView(): string {
    return `
      <div style="padding: 20px; color: #888; text-align: center;">
        <h3>Data Flow Analysis</h3>
        <p>Track variable usage and modifications through the function</p>
        <p style="margin-top: 20px;">Coming soon...</p>
      </div>
    `;
  }

  private renderMetricsView(): string {
    return `
      <div style="padding: 20px; color: #888; text-align: center;">
        <h3>Detailed Metrics</h3>
        <p>Performance profiling and execution statistics</p>
        <p style="margin-top: 20px;">Coming soon...</p>
      </div>
    `;
  }

  private renderHotspotsView(): string {
    return `
      <div style="padding: 20px; color: #888; text-align: center;">
        <h3>Performance Hotspots</h3>
        <p>Identify bottlenecks and optimization opportunities</p>
        <p style="margin-top: 20px;">Coming soon...</p>
      </div>
    `;
  }

  private async initializeControlFlowGraph() {
    if (!this.controlFlow) {
      console.error('No control flow data available');
      return;
    }

    const container = this.shadow.getElementById('flowGraph');
    if (!container) {
      console.error('flowGraph container not found');
      return;
    }

    console.log('🎨 Initializing D3.js control flow graph with', this.controlFlow.nodes.length, 'nodes and', this.controlFlow.edges.length, 'edges');

    const { nodes, edges } = this.controlFlow;
    
    // Cast d3 to any to avoid TypeScript issues
    const d3Local = d3 as any;
    
    // Clear previous graph
    d3Local.select(container).selectAll('*').remove();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const svg = d3Local.select(container)
      .attr('width', width)
      .attr('height', height);

    // Add CSS animations for pizzazz
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.9; }
        50% { transform: scale(1.05); opacity: 1; }
      }
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes dash {
        to { stroke-dashoffset: -10; }
      }
      .node-hover {
        cursor: pointer;
        filter: brightness(1.2) !important;
      }
      .flow-edge-animated {
        stroke-dasharray: 5,5;
        animation: dash 2s linear infinite;
      }
    `;
    this.shadow.appendChild(style);

    // Define arrow markers
    const defs = svg.append('defs');
    
    // Create different arrow colors for different edge types
    const arrowColors = {
      'normal': '#64ffda',
      'true': '#4caf50', 
      'false': '#f44336',
      'exception': '#ff5722',
      'loop-back': '#2196f3'
    };

    Object.entries(arrowColors).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrowhead-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    });

    const g = svg.append('g');

    // Build hierarchical structure with edge type information
    const hierarchy = this.buildHierarchyWithEdgeData(nodes, edges);
    
    // Create tree layout for structured control flow
    const treeLayout = d3Local.tree()
      .size([width - 100, height - 100])
      .separation((a: any, b: any) => {
        return a.parent === b.parent ? 1 : 2;
      });
    
    const root = d3Local.hierarchy(hierarchy);
    const treeData = treeLayout(root);

    // Create zoom behavior
    const zoom = d3Local.zoom()
      .scaleExtent([0.1, 3])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Draw edges with proper edge type information
    g.selectAll('.control-edge')
      .data(treeData.links())
      .enter().append('path')
      .attr('class', (d: any) => `control-edge edge-${d.target.data.edgeTypeFromParent || 'normal'}`)
      .attr('stroke', (d: any) => arrowColors[d.target.data.edgeTypeFromParent as keyof typeof arrowColors] || arrowColors.normal)
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('marker-end', (d: any) => `url(#arrowhead-${d.target.data.edgeTypeFromParent || 'normal'})`)
      .attr('d', d3Local.linkVertical()
        .x((d: any) => d.x)
        .y((d: any) => d.y));

    // Draw nodes
    const node = g.selectAll('.control-node')
      .data(treeData.descendants())
      .enter().append('g')
      .attr('class', (d: any) => `control-node node-${d.data.type}`)
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    // Add shapes based on node type
    node.each(function(this: SVGGElement, d: any) {
      const nodeG = d3Local.select(this);
      const nodeType = d.data.type; // Access type from hierarchy data
      
      // Enhanced visualization with pizzazz
      const nodeId = `node-${d.data.id}`;
      
      // Add subtle animation and hover effects
      nodeG.on('mouseenter', function(this: SVGGElement) {
        d3Local.select(this).classed('node-hover', true);
      }).on('mouseleave', function(this: SVGGElement) {
        d3Local.select(this).classed('node-hover', false);
      });
      
      switch (nodeType) {
        case 'entry':
          // Animated pulsing green circle
          nodeG.append('circle')
            .attr('r', 25)
            .attr('fill', '#4caf50')
            .attr('stroke', '#2e7d32')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(76, 175, 80, 0.6))')
            .style('animation', 'pulse 2s ease-in-out infinite');
          
          // Add play icon
          nodeG.append('path')
            .attr('d', 'M -8,-10 L -8,10 L 8,0 Z')
            .attr('fill', 'white');
          break;
          
        case 'exit':
          // Red circle with glow
          nodeG.append('circle')
            .attr('r', 25)
            .attr('fill', '#f44336')
            .attr('stroke', '#c62828')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(244, 67, 54, 0.6))');
            
          // Add stop icon
          nodeG.append('rect')
            .attr('x', -8)
            .attr('y', -8)
            .attr('width', 16)
            .attr('height', 16)
            .attr('fill', 'white');
          break;
          
        case 'condition':
        case 'conditional':
          // Diamond shape with gradient
          const condGradient = defs.append('linearGradient')
            .attr('id', `cond-gradient-${nodeId}`)
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '100%').attr('y2', '100%');
          condGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#ffb74d');
          condGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#ff6f00');
            
          nodeG.append('polygon')
            .attr('points', '0,-25 25,0 0,25 -25,0')
            .attr('fill', `url(#cond-gradient-${nodeId})`)
            .attr('stroke', '#e65100')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(255, 152, 0, 0.6))')
            .style('transform-origin', 'center');
            
          // Add question mark
          nodeG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.4em')
            .attr('fill', 'white')
            .attr('font-size', '18px')
            .attr('font-weight', 'bold')
            .text('?');
          break;
          
        case 'loop':
          // Rounded rectangle with animated border
          const loopGradient = defs.append('linearGradient')
            .attr('id', `loop-gradient-${nodeId}`)
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');
          loopGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#64b5f6');
          loopGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#1565c0');
            
          nodeG.append('rect')
            .attr('x', -35)
            .attr('y', -20)
            .attr('width', 70)
            .attr('height', 40)
            .attr('rx', 20)
            .attr('fill', `url(#loop-gradient-${nodeId})`)
            .attr('stroke', '#0d47a1')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(33, 150, 243, 0.6))');
            
          // Add rotating arrow
          const loopIcon = nodeG.append('g')
            .style('animation', 'rotate 3s linear infinite');
          loopIcon.append('path')
            .attr('d', 'M 0,-12 A 12,12 0 1,1 -12,0')
            .attr('fill', 'none')
            .attr('stroke', 'white')
            .attr('stroke-width', 3);
          loopIcon.append('polygon')
            .attr('points', '-12,-3 -12,3 -18,0')
            .attr('fill', 'white');
          break;
          
        case 'switch':
          // Hexagon for switch statements
          const switchGradient = defs.append('linearGradient')
            .attr('id', `switch-gradient-${nodeId}`);
          switchGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#ce93d8');
          switchGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#6a1b9a');
            
          nodeG.append('polygon')
            .attr('points', '-30,-17 -30,17 0,34 30,17 30,-17 0,-34')
            .attr('fill', `url(#switch-gradient-${nodeId})`)
            .attr('stroke', '#4a148c')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(156, 39, 176, 0.6))');
            
          // Add branch icon
          nodeG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.3em')
            .attr('fill', 'white')
            .attr('font-size', '16px')
            .text('⇌');
          break;
          
        default:
          // Default block with teal gradient
          const defaultGradient = defs.append('linearGradient')
            .attr('id', `default-gradient-${nodeId}`);
          defaultGradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#4db6ac');
          defaultGradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#00796b');
            
          nodeG.append('rect')
            .attr('x', -30)
            .attr('y', -20)
            .attr('width', 60)
            .attr('height', 40)
            .attr('rx', 8)
            .attr('fill', `url(#default-gradient-${nodeId})`)
            .attr('stroke', '#004d40')
            .attr('stroke-width', 2)
            .style('filter', 'drop-shadow(0 0 3px rgba(77, 182, 172, 0.5))');
      }
    });

    // Add enhanced labels with better information
    node.each(function(this: SVGGElement, d: any) {
      const nodeData = d.data;
      const nodeG = d3Local.select(this);
      
      // Skip labels for nodes with icons
      if (nodeData.type === 'entry' || nodeData.type === 'exit' || 
          nodeData.type === 'condition' || nodeData.type === 'conditional' ||
          nodeData.type === 'switch') {
        return;
      }
      
      // For loops, show the loop type and condition
      if (nodeData.type === 'loop') {
        // Access the component's controlFlow through the class instance
        const component = document.querySelector('enhanced-code-flow') as any;
        const loopInfo = component?.controlFlow?.loops?.find((l: any) => 
          nodeData.line >= l.bodyStart && nodeData.line <= l.bodyEnd
        );
        
        nodeG.append('text')
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('font-size', '11px')
          .attr('font-weight', 'bold')
          .text(loopInfo?.loopType?.toUpperCase() || 'LOOP');
          
        // Add condition as tooltip
        if (nodeData.code && nodeData.code.length > 0) {
          nodeG.append('title')
            .text(`Condition: ${nodeData.code}`);
        }
      } else {
        // For other blocks, show line range
        nodeG.append('text')
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('font-size', '10px')
          .text(`L${nodeData.line}`);
      }
    });
    
    // Add tooltips with full information
    node.append('title')
      .text((d: any) => {
        const nodeData = d.data;
        let tooltip = `Type: ${nodeData.type}\n`;
        tooltip += `Lines: ${nodeData.line}`;
        if (nodeData.endLine && nodeData.endLine !== nodeData.line) {
          tooltip += `-${nodeData.endLine}`;
        }
        if (nodeData.code) {
          tooltip += `\nCode: ${nodeData.code}`;
        }
        if (nodeData.complexity) {
          tooltip += `\nComplexity: ${nodeData.complexity}`;
        }
        return tooltip;
      });

    // Add interaction
    node.on('click', async (event: any, d: any) => {
      const nodeData = d.data;
      console.log('Node clicked:', nodeData);
      console.log('Control flow data:', this.controlFlow);
      
      // Check if this is a function call node that we can navigate into
      const canNavigate = await this.canNavigateToNode(nodeData);
      console.log('Can navigate:', canNavigate, 'for node:', nodeData.id, 'line:', nodeData.line);
      
      if (canNavigate) {
        // Show navigation options
        this.showNavigationOptions(event, nodeData);
      } else {
        // Regular path highlighting
        this.highlightPath(nodeData.id);
      }
    });

    // Center the graph
    const bounds = g.node()!.getBBox();
    const fullWidth = width;
    const fullHeight = height;
    const boundsWidth = bounds.width;
    const boundsHeight = bounds.height;
    const midX = bounds.x + boundsWidth / 2;
    const midY = bounds.y + boundsHeight / 2;
    const scale = 0.8 * Math.min(fullWidth / boundsWidth, fullHeight / boundsHeight);
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    svg.call(zoom.transform, d3Local.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }

  private buildHierarchyWithEdgeData(nodes: ControlFlowNode[], edges: ControlFlowEdge[]): any {
    // Build adjacency list with edge type information
    const children: Record<string, Array<{nodeId: string, edgeType: string}>> = {};
    edges.forEach(edge => {
      if (!children[edge.from]) children[edge.from] = [];
      children[edge.from].push({nodeId: edge.to, edgeType: edge.type});
    });

    // Track visited nodes to handle cycles
    const visited = new Set<string>();

    // Build tree structure starting from entry, preserving edge types
    const buildTree = (nodeId: string, edgeTypeFromParent?: string): any => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node || visited.has(nodeId)) {
        return node ? { ...node, edgeTypeFromParent, children: [] } : null;
      }

      visited.add(nodeId);
      
      const nodeChildren = children[nodeId] || [];
      
      return {
        ...node,
        edgeTypeFromParent: edgeTypeFromParent || 'normal',
        children: nodeChildren
          .map(child => buildTree(child.nodeId, child.edgeType))
          .filter(Boolean)
      };
    };

    // Start from entry node
    const entryNode = nodes.find(n => n.type === 'entry');
    if (!entryNode) {
      console.warn('No entry node found, using first node');
      return nodes.length > 0 ? buildTree(nodes[0].id) : null;
    }

    return buildTree(entryNode.id);
  }

  private highlightPath(nodeId: string) {
    // Find path from entry to this node
    const path = this.findPath('entry', nodeId);
    if (path) {
      this.highlightedPath = path;
      // Update visual highlighting
      this.updatePathHighlight();
    }
  }

  private findPath(start: string, end: string): string[] | null {
    if (!this.controlFlow) return null;
    
    const { edges } = this.controlFlow;
    const adjacency: Record<string, string[]> = {};
    
    edges.forEach(edge => {
      if (!adjacency[edge.from]) adjacency[edge.from] = [];
      adjacency[edge.from].push(edge.to);
    });

    // BFS to find path
    const queue: Array<{ node: string, path: string[] }> = [{ node: start, path: [start] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      
      if (node === end) return path;
      if (visited.has(node)) continue;
      
      visited.add(node);
      
      const neighbors = adjacency[node] || [];
      neighbors.forEach(neighbor => {
        queue.push({ node: neighbor, path: [...path, neighbor] });
      });
    }

    return null;
  }

  private updatePathHighlight() {
    const d3Local = d3 as any;
    
    // Reset all highlights
    d3Local.selectAll('.control-edge').classed('highlighted', false);
    d3Local.selectAll('.control-node').classed('highlighted', false);
    
    // Highlight path
    this.highlightedPath.forEach((nodeId, index) => {
      // Highlight node
      d3Local.selectAll('.control-node')
        .filter((d: any) => d.data.id === nodeId)
        .classed('highlighted', true);
      
      // Highlight edge to next node
      if (index < this.highlightedPath.length - 1) {
        const nextNodeId = this.highlightedPath[index + 1];
        d3Local.selectAll('.control-edge')
          .filter((d: any) => 
            d.source.data.id === nodeId && d.target.data.id === nextNodeId
          )
          .classed('highlighted', true);
      }
    });
  }

  private initializeDataFlowGraph() {
    // TODO: Implement data flow visualization
  }

  private attachEventListeners() {
    // Search input with focus preservation
    const searchInput = this.shadow.getElementById('symbolSearch') as HTMLInputElement;
    if (searchInput) {
      // Restore the search query value and cursor position if input was recreated
      if (this.searchQuery && searchInput.value !== this.searchQuery) {
        searchInput.value = this.searchQuery;
      }
      
      searchInput.addEventListener('input', async (e) => {
        const target = e.target as HTMLInputElement;
        const cursorPosition = target.selectionStart;
        this.searchQuery = target.value;
        
        await this.searchSymbols(this.searchQuery);
        
        // Restore cursor position after search updates
        setTimeout(() => {
          const newInput = this.shadow.getElementById('symbolSearch') as HTMLInputElement;
          if (newInput && cursorPosition !== null) {
            newInput.focus();
            newInput.setSelectionRange(cursorPosition, cursorPosition);
          }
        }, 0);
      });
    }

    // Initial search result events
    this.attachSearchResultEvents();

    // Breadcrumb navigation events
    this.attachBreadcrumbEvents();
    
    // Caller/callee relationship navigation events
    this.attachRelationshipEvents();

    // View mode tabs
    this.shadow.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = (e.target as HTMLElement).getAttribute('data-view');
        if (view) {
          this.viewMode = view as any;
          this.render();
          
          setTimeout(() => {
            if (this.viewMode === 'control' && this.controlFlow) {
              this.initializeControlFlowGraph();
            } else if (this.viewMode === 'data' && this.controlFlow) {
              this.initializeDataFlowGraph();
            }
          }, 0);
        }
      });
    });

    // Hot path highlighting
    this.shadow.querySelectorAll('.path-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const pathStr = (e.currentTarget as HTMLElement).getAttribute('data-path');
        if (pathStr) {
          this.highlightedPath = pathStr.split(',');
          this.updatePathHighlight();
          
          // Update visual selection
          this.shadow.querySelectorAll('.path-item').forEach(p => {
            p.classList.remove('highlighted');
          });
          (e.currentTarget as HTMLElement).classList.add('highlighted');
        }
      });
    });
  }

  // Navigation methods for click-to-dive functionality
  private async canNavigateToNode(nodeData: any): Promise<boolean> {
    // Check if this node has function calls that can be navigated to
    if (nodeData.type === 'entry' || nodeData.type === 'exit') {
      return false;
    }
    
    // Check if there are function calls from this line
    const functionCalls = this.getFunctionCallsFromLine(nodeData.line, nodeData);
    return functionCalls.length > 0;
  }

  private getFunctionCallsFromLine(line: number, nodeData?: any): string[] {
    if (!this.controlFlow || !this.controlFlow.functionCalls) {
      console.log('No control flow or function calls data');
      return [];
    }
    
    console.log('Looking for function calls from line:', line);
    console.log('Function calls available:', this.controlFlow.functionCalls);
    console.log('All blocks:', this.controlFlow.blocks);
    
    // For function_body nodes, we want to show ALL function calls in the function
    if (nodeData && nodeData.id === 'function_body') {
      console.log('Function body node - showing all function calls');
      const calls = this.controlFlow.functionCalls
        .map((call: any) => call.to_symbol || call.target_function || call.functionName || call.calleeName)
        .filter(Boolean);
      console.log('All function calls in function:', calls);
      return calls;
    }
    
    // If this is a control flow block, find the block info to get the range
    let startLine = line;
    let endLine = line;
    
    if (nodeData && this.controlFlow.blocks) {
      const block = this.controlFlow.blocks.find((b: any) => b.start_line === line);
      if (block && block.end_line) {
        startLine = block.start_line;
        endLine = block.end_line;
        console.log('Found block range:', startLine, '-', endLine);
      }
    }
    
    // Find function calls within the line range of this block
    // Try different property names that might exist in the function call data
    const calls = this.controlFlow.functionCalls
      .filter((call: any) => {
        const callLine = call.from_line || call.line_number || call.lineNumber || call.line;
        return callLine >= startLine && callLine <= endLine;
      })
      .map((call: any) => call.to_symbol || call.target_function || call.functionName || call.calleeName)
      .filter(Boolean);
    
    console.log('Found function calls:', calls);
    
    return calls;
  }

  private showNavigationOptions(event: any, nodeData: any) {
    // Create a floating navigation menu
    const existingMenu = this.shadow.querySelector('.navigation-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Get function calls from this line
    const functionCalls = this.getFunctionCallsFromLine(nodeData.line, nodeData);
    
    const menu = document.createElement('div');
    menu.className = 'navigation-menu';
    
    // Build menu items for each function call
    let menuHTML = '';
    
    if (functionCalls.length > 0) {
      functionCalls.forEach((funcName) => {
        menuHTML += `
          <div class="nav-option dive-in" data-action="dive" data-function="${funcName}">
            <span class="nav-icon">🔍</span>
            <div class="nav-content">
              <strong>Dive into ${funcName}</strong>
              <small>Navigate to function implementation</small>
            </div>
          </div>
        `;
      });
    }
    
    // Always add highlight option
    menuHTML += `
      <div class="nav-option highlight" data-action="highlight">
        <span class="nav-icon">✨</span>
        Highlight path
      </div>
    `;
    
    menu.innerHTML = menuHTML;

    // Position the menu near the click
    const rect = this.shadow.querySelector('#flowGraph')?.getBoundingClientRect();
    if (rect) {
      menu.style.left = `${event.layerX + 10}px`;
      menu.style.top = `${event.layerY + 10}px`;
    }

    // Add to shadow DOM
    this.shadow.appendChild(menu);

    // Add event listeners for all dive options
    menu.querySelectorAll('[data-action="dive"]').forEach(option => {
      option.addEventListener('click', async (e) => {
        const functionName = (e.target as HTMLElement).closest('[data-function]')?.getAttribute('data-function');
        if (functionName) {
          await this.navigateToFunction(nodeData, functionName);
        }
        menu.remove();
      });
    });

    menu.querySelector('[data-action="highlight"]')?.addEventListener('click', () => {
      this.highlightPath(nodeData.id);
      menu.remove();
    });

    // Remove menu when clicking elsewhere
    setTimeout(() => {
      const removeOnClick = (e: Event) => {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('click', removeOnClick);
        }
      };
      document.addEventListener('click', removeOnClick);
    }, 100);
  }

  private async navigateToFunction(nodeData: any, targetFunction?: string) {
    if (this.isNavigating) return;
    this.isNavigating = true;

    try {
      let functionName = targetFunction;
      
      // If no target function specified, try to extract from code
      if (!functionName) {
        const functionCallPattern = /(\w+)\s*\(/;
        const match = nodeData.code?.match(functionCallPattern);
        if (!match) return;
        functionName = match[1];
      }
      
      // Search for the function
      if (!functionName) return;
      const response = await this.fetchAPI(`/api/search?q=${encodeURIComponent(functionName)}&type=function&limit=1`);
      if (!response.results || response.results.length === 0) {
        console.error('Function not found:', functionName);
        return;
      }

      const targetSymbol = response.results[0];

      // Save current context to navigation stack
      if (this.currentContext) {
        this.navigationStack.push(this.currentContext);
      } else if (this.symbolId && this.controlFlow) {
        // Create context for current function if not already set
        this.navigationStack.push({
          symbolId: this.symbolId,
          symbolName: this.controlFlow.symbol.name || `Symbol ${this.symbolId}`,
          controlFlow: this.controlFlow
        });
      }

      // Navigate to the new function
      this.symbolId = targetSymbol.id;
      await this.loadEnhancedFlow();

      // Update current context
      if (this.controlFlow) {
        this.currentContext = {
          symbolId: targetSymbol.id,
          symbolName: targetSymbol.name || targetSymbol.qualified_name,
          controlFlow: this.controlFlow
        };
      }

    } catch (error) {
      console.error('Navigation failed:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  private navigateBack(targetIndex?: number) {
    if (this.navigationStack.length === 0) return;

    let targetContext: NavigationContext;
    
    if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < this.navigationStack.length) {
      // Navigate to specific index
      targetContext = this.navigationStack[targetIndex];
      this.navigationStack = this.navigationStack.slice(0, targetIndex);
    } else {
      // Navigate to previous function
      targetContext = this.navigationStack.pop()!;
    }

    // Restore the context
    this.symbolId = targetContext.symbolId;
    this.controlFlow = targetContext.controlFlow;
    this.currentContext = targetContext;
    
    // Re-render
    this.render();
    
    // Re-initialize the visualization
    setTimeout(() => {
      if (this.viewMode === 'control') {
        this.initializeControlFlowGraph();
      }
    }, 0);
  }

  private navigateHome() {
    if (this.navigationStack.length === 0) return;

    // Get the root context
    const rootContext = this.navigationStack[0];
    
    // Clear the navigation stack
    this.navigationStack = [];
    this.currentContext = rootContext;
    
    // Restore the root context
    this.symbolId = rootContext.symbolId;
    this.controlFlow = rootContext.controlFlow;
    
    // Re-render
    this.render();
    
    // Re-initialize the visualization
    setTimeout(() => {
      if (this.viewMode === 'control') {
        this.initializeControlFlowGraph();
      }
    }, 0);
  }

  private returnToSearch() {
    // Clear all navigation state and return to search mode
    this.navigationStack = [];
    this.currentContext = null;
    this.symbolId = null;
    this.controlFlow = null;
    this.searchQuery = '';
    this.searchResults = [];
    
    // Update URL to remove symbolId parameter
    const url = new URL(window.location.href);
    url.searchParams.delete('symbolId');
    window.history.pushState({}, '', url.toString());
    
    // Re-render to show search interface
    this.render();
  }

  private async navigateToSymbolById(symbolId: number) {
    if (this.isNavigating) return;
    this.isNavigating = true;

    try {
      // Save current context to navigation stack
      if (this.currentContext) {
        this.navigationStack.push(this.currentContext);
      } else if (this.symbolId && this.controlFlow) {
        // Create context for current function if not already set
        this.navigationStack.push({
          symbolId: this.symbolId,
          symbolName: this.controlFlow.symbol.name || `Symbol ${this.symbolId}`,
          controlFlow: this.controlFlow
        });
      }

      // Navigate to the new function
      this.symbolId = symbolId;
      await this.loadEnhancedFlow();

      // Update current context
      if (this.controlFlow) {
        this.currentContext = {
          symbolId: symbolId,
          symbolName: this.controlFlow.symbol.name || this.controlFlow.symbol.qualified_name || `Symbol ${symbolId}`,
          controlFlow: this.controlFlow
        };
      }

    } catch (error) {
      console.error('Navigation to symbol failed:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  private showAllCallers() {
    if (!this.controlFlow || !this.controlFlow.callers) return;
    
    // Create a modal or expanded view showing all callers
    // For now, just log them - this could be enhanced with a modal
    console.log('All callers:', this.controlFlow.callers);
    
    // TODO: Implement modal view for all callers
    alert(`All callers (${this.controlFlow.callers.length}):\n${this.controlFlow.callers.map(c => c.name).join('\n')}`);
  }

  private showAllCallees() {
    if (!this.controlFlow || !this.controlFlow.callees) return;
    
    // Create a modal or expanded view showing all callees
    // For now, just log them - this could be enhanced with a modal
    console.log('All callees:', this.controlFlow.callees);
    
    // TODO: Implement modal view for all callees
    alert(`All callees (${this.controlFlow.callees.length}):\n${this.controlFlow.callees.map(c => c.name).join('\n')}`);
  }
}

defineComponent('enhanced-code-flow', EnhancedCodeFlow);