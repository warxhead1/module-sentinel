import { DashboardComponent, defineComponent } from './base-component.js';
import * as d3 from 'd3';
import { ControlFlowEngine, ControlFlowAnalysis, ControlFlowNode, ControlFlowEdge } from '../utils/control-flow-engine.js';
import { ComplexityAnalyzer } from '../utils/complexity-analyzer.js';
import { NavigationTreeBuilder, NavigationContext } from '../utils/navigation-tree-builder.js';
import { SymbolSelectorModal } from './symbol-selector-modal.js';

/**
 * Enhanced Code Flow Analysis Component
 * 
 * This component provides deep insights into control flow, complexity,
 * and execution patterns using the modular control flow engine.
 */
export class EnhancedCodeFlow extends DashboardComponent {
  private symbolId: number | null = null;
  private controlFlow: ControlFlowAnalysis | null = null;
  private viewMode: 'control' | 'data' | 'metrics' | 'hotspots' = 'control';
  private highlightedPath: string[] = [];
  private selectedVariable: string | null = null;
  private isNavigating: boolean = false;
  
  // Engine instances
  private flowEngine: ControlFlowEngine;
  private complexityAnalyzer: ComplexityAnalyzer;
  private navigationBuilder: NavigationTreeBuilder;
  
  // Symbol selector modal
  private symbolSelector: SymbolSelectorModal;
  
  constructor() {
    super();
    
    // Initialize engines
    this.flowEngine = new ControlFlowEngine();
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.navigationBuilder = new NavigationTreeBuilder();
    
    // Get symbol selector instance
    this.symbolSelector = SymbolSelectorModal.getInstance();
  }

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
      
      if (!data) {
        throw new Error('No control flow data received');
      }

      // Transform the response using our engine
      this.controlFlow = await this.flowEngine.analyzeSymbol(data, {
        includeDataFlow: true,
        detectHotspots: true,
        language: 'cpp'
      });
      
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
      this._error = `Control flow error: ${error instanceof Error ? error.message : String(error)}`;
      this._loading = false;
      this.render();
    }
  }

  private renderBreadcrumbs(): string {
    const breadcrumbs = this.navigationBuilder.buildBreadcrumbs();
    
    // Always show breadcrumbs if we have control flow data
    if (breadcrumbs.length === 0 && !this.controlFlow) {
      return '';
    }

    const breadcrumbItems = breadcrumbs.map((item, index) => `
      <span class="breadcrumb-item ${item.type === 'current' ? 'current' : ''}" 
            ${item.type !== 'current' ? `data-nav-index="${index}"` : ''}>
        <span class="breadcrumb-icon">${item.icon || '📍'}</span>
        ${item.label}
      </span>
    `);

    // Add current function if no navigation context
    if (breadcrumbs.length === 0 && this.controlFlow && this.controlFlow.symbol) {
      breadcrumbItems.push(`
        <span class="breadcrumb-item current">
          <span class="breadcrumb-icon">📍</span>
          ${this.controlFlow.symbol.name || this.controlFlow.symbol.qualified_name || 'Current Function'}
        </span>
      `);
    }

    const hasNavigation = breadcrumbs.length > 0;

    return `
      <div class="navigation-breadcrumbs">
        <div class="breadcrumb-header">
          <div class="nav-controls">
            ${hasNavigation ? `
              <button class="nav-button back-button" data-nav-back title="Go back one step">
                <span>⬅️</span>
                Back
              </button>
            ` : ''}
            <button class="nav-button search-button" data-nav-search title="Open symbol search">
              <span>🔍</span>
              Search
            </button>
            <span class="breadcrumb-title">🧭 Navigation Path</span>
            ${hasNavigation ? `
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

  private showSymbolSelector() {
    this.symbolSelector.show({
      title: 'Select a Function to Analyze',
      filter: (symbol) => symbol.kind === 'function' || symbol.kind === 'method',
      onSelect: async (symbol) => {
        // Save current state if needed
        if (this.symbolId && this.controlFlow) {
          this.navigationBuilder.navigateTo({
            symbolId: this.symbolId,
            symbolName: this.controlFlow.symbol.name || `Symbol ${this.symbolId}`,
            controlFlow: this.controlFlow
          });
        }

        // Navigate to selected symbol
        this.symbolId = symbol.id;
        
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('symbolId', symbol.id.toString());
        window.history.pushState({}, '', url.toString());
        
        await this.loadEnhancedFlow();
      },
      onCancel: () => {
        // Do nothing
      }
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
        
        /* Navigation Breadcrumbs Styles */
        .navigation-breadcrumbs {
          background: linear-gradient(135deg, rgba(100, 255, 218, 0.05), rgba(78, 205, 196, 0.03));
          border: 1px solid rgba(100, 255, 218, 0.2);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
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
          color: var(--primary-accent, #4ecdc4);
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
        
        .breadcrumb-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--primary-accent, #4ecdc4);
          display: flex;
          align-items: center;
          gap: 8px;
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
          background: linear-gradient(135deg, #4ecdc4, #44a39a);
          color: #000;
          font-weight: 600;
          cursor: default;
          border-color: #4ecdc4;
        }
        
        .breadcrumb-separator {
          color: #4ecdc4;
          font-size: 1.2rem;
          font-weight: bold;
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
          color: #4ecdc4;
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
          color: #ccc;
          font-weight: 500;
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
          color: #4ecdc4;
          font-weight: 500;
          font-size: 0.9rem;
        }
        
        .relationship-meta {
          color: #888;
          font-size: 0.75rem;
          opacity: 0.8;
        }
        
        /* Other existing styles... */
      </style>
      
      <div class="page-header">
        <h1>Enhanced Code Flow Analysis</h1>
        <p class="subtitle">Deep insights into control flow, complexity, and execution patterns</p>
      </div>
      
      <div class="flow-container">
        <div class="flow-main">
          ${this.renderBreadcrumbs()}
          ${this.controlFlow ? `
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
          ` : ''}
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
    const complexityLevel = this.complexityAnalyzer.getComplexityLevel(metrics);
    const recommendations = this.complexityAnalyzer.getRecommendations(metrics);

    return `
      <div class="sidebar-panel">
        <h3>Complexity Metrics</h3>
        ${this.renderComplexityGauge(metrics.cyclomaticComplexity, complexityLevel)}
        
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
        
        ${recommendations.length > 0 ? `
          <div class="recommendations">
            <h4>Recommendations</h4>
            <ul>
              ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
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

  private renderComplexityGauge(complexity: number, level: any): string {
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
          <div class="gauge-level" style="color: ${level.color}">${level.description}</div>
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
    if (!this.controlFlow || !this.controlFlow.dataFlows) {
      return `
        <div style="padding: 20px; color: #888; text-align: center;">
          <h3>Data Flow Analysis</h3>
          <p>No data flow information available</p>
        </div>
      `;
    }

    const { variables, flows, taintAnalysis } = this.controlFlow.dataFlows;

    return `
      <div style="padding: 20px;">
        <h3>Data Flow Analysis</h3>
        <div class="data-flow-content">
          <h4>Variables (${variables.size})</h4>
          <div class="variables-list">
            ${Array.from(variables.values()).map(varInfo => `
              <div class="variable-card">
                <strong>${varInfo.name}</strong>
                <span class="var-scope">${varInfo.scope}</span>
                ${varInfo.isModified ? '<span class="var-modified">Modified</span>' : ''}
                ${varInfo.isReturned ? '<span class="var-returned">Returned</span>' : ''}
              </div>
            `).join('')}
          </div>
          
          ${taintAnalysis ? `
            <h4>Taint Analysis</h4>
            <div class="taint-analysis">
              ${taintAnalysis.flows.map(flow => `
                <div class="taint-flow ${flow.isSanitized ? 'sanitized' : 'unsanitized'}">
                  ${flow.from.variable} (${flow.from.type}) → ${flow.to.variable} (${flow.to.type})
                  ${flow.isSanitized ? '✓ Sanitized' : '⚠️ Unsanitized'}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderMetricsView(): string {
    if (!this.controlFlow) return '';

    const { metrics } = this.controlFlow;

    return `
      <div style="padding: 20px;">
        <h3>Detailed Metrics</h3>
        ${metrics.halsteadMetrics ? `
          <div class="halstead-metrics">
            <h4>Halstead Metrics</h4>
            <ul>
              <li>Vocabulary: ${metrics.halsteadMetrics.vocabulary}</li>
              <li>Length: ${metrics.halsteadMetrics.length}</li>
              <li>Volume: ${metrics.halsteadMetrics.volume}</li>
              <li>Difficulty: ${metrics.halsteadMetrics.difficulty}</li>
              <li>Effort: ${metrics.halsteadMetrics.effort}</li>
              <li>Time to implement: ${Math.round(metrics.halsteadMetrics.time / 60)} minutes</li>
              <li>Estimated bugs: ${metrics.halsteadMetrics.bugs}</li>
            </ul>
          </div>
        ` : ''}
        
        ${metrics.maintainabilityIndex !== undefined ? `
          <div class="maintainability">
            <h4>Maintainability Index: ${metrics.maintainabilityIndex}</h4>
            <div class="mi-bar" style="width: ${metrics.maintainabilityIndex}%"></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderHotspotsView(): string {
    if (!this.controlFlow || !this.controlFlow.hotspots) {
      return `
        <div style="padding: 20px; color: #888; text-align: center;">
          <h3>Performance Hotspots</h3>
          <p>No hotspot analysis available</p>
        </div>
      `;
    }

    const { hotPaths, bottlenecks, optimizationOpportunities } = this.controlFlow.hotspots;

    return `
      <div style="padding: 20px;">
        <h3>Performance Hotspots</h3>
        
        ${bottlenecks.length > 0 ? `
          <h4>Bottlenecks</h4>
          <div class="bottlenecks-list">
            ${bottlenecks.map(bottleneck => `
              <div class="bottleneck-card ${bottleneck.severity}">
                <strong>${bottleneck.description}</strong>
                <span class="bottleneck-type">${bottleneck.type}</span>
                <span class="bottleneck-severity">${bottleneck.severity}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${optimizationOpportunities.length > 0 ? `
          <h4>Optimization Opportunities</h4>
          <div class="optimizations-list">
            ${optimizationOpportunities.map(opp => `
              <div class="optimization-card">
                <strong>${opp.description}</strong>
                <p>${opp.recommendation}</p>
                <div class="opt-meta">
                  <span class="opt-improvement">+${opp.potentialImprovement}%</span>
                  <span class="opt-difficulty">${opp.difficulty}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
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

    // Build hierarchical structure
    const hierarchy = this.flowEngine.buildHierarchy(nodes, edges);
    
    // Create tree layout
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

    // Draw edges
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
    this.drawNodeShapes(node, defs);

    // Add interaction
    node.on('click', async (event: any, d: any) => {
      const nodeData = d.data;
      
      // Check if this is a function call node that we can navigate into
      const canNavigate = this.flowEngine.canNavigateToNode(nodeData, this.controlFlow!);
      
      if (canNavigate) {
        this.showNavigationOptions(event, nodeData);
      } else {
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

  private drawNodeShapes(node: any, defs: any) {
    const d3Local = d3 as any;
    
    node.each(function(this: SVGGElement, d: any) {
      const nodeG = d3Local.select(this);
      const nodeType = d.data.type;
      const nodeId = `node-${d.data.id}`;
      
      switch (nodeType) {
        case 'entry':
          nodeG.append('circle')
            .attr('r', 25)
            .attr('fill', '#4caf50')
            .attr('stroke', '#2e7d32')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(76, 175, 80, 0.6))');
          
          nodeG.append('path')
            .attr('d', 'M -8,-10 L -8,10 L 8,0 Z')
            .attr('fill', 'white');
          break;
          
        case 'exit':
          nodeG.append('circle')
            .attr('r', 25)
            .attr('fill', '#f44336')
            .attr('stroke', '#c62828')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(244, 67, 54, 0.6))');
            
          nodeG.append('rect')
            .attr('x', -8)
            .attr('y', -8)
            .attr('width', 16)
            .attr('height', 16)
            .attr('fill', 'white');
          break;
          
        case 'condition':
        case 'conditional':
          nodeG.append('polygon')
            .attr('points', '0,-25 25,0 0,25 -25,0')
            .attr('fill', '#ffb74d')
            .attr('stroke', '#e65100')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(255, 152, 0, 0.6))');
            
          nodeG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.4em')
            .attr('fill', 'white')
            .attr('font-size', '18px')
            .attr('font-weight', 'bold')
            .text('?');
          break;
          
        case 'loop':
          nodeG.append('rect')
            .attr('x', -35)
            .attr('y', -20)
            .attr('width', 70)
            .attr('height', 40)
            .attr('rx', 20)
            .attr('fill', '#64b5f6')
            .attr('stroke', '#0d47a1')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 5px rgba(33, 150, 243, 0.6))');
            
          nodeG.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', 'white')
            .attr('font-size', '11px')
            .attr('font-weight', 'bold')
            .text('LOOP');
          break;
          
        default:
          nodeG.append('rect')
            .attr('x', -30)
            .attr('y', -20)
            .attr('width', 60)
            .attr('height', 40)
            .attr('rx', 8)
            .attr('fill', '#4db6ac')
            .attr('stroke', '#004d40')
            .attr('stroke-width', 2)
            .style('filter', 'drop-shadow(0 0 3px rgba(77, 182, 172, 0.5))');
            
          nodeG.append('text')
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .attr('font-size', '10px')
            .text(`L${d.data.line}`);
      }
      
      // Add tooltip
      nodeG.append('title')
        .text(() => {
          let tooltip = `Type: ${nodeType}\n`;
          tooltip += `Lines: ${d.data.line}`;
          if (d.data.endLine && d.data.endLine !== d.data.line) {
            tooltip += `-${d.data.endLine}`;
          }
          if (d.data.code) {
            tooltip += `\nCode: ${d.data.code}`;
          }
          return tooltip;
        });
    });
  }

  private initializeDataFlowGraph() {
    // TODO: Implement data flow visualization
  }

  private highlightPath(nodeId: string) {
    // Find path from entry to this node
    const path = this.findPath('entry', nodeId);
    if (path) {
      this.highlightedPath = path;
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
      d3Local.selectAll('.control-node')
        .filter((d: any) => d.data.id === nodeId)
        .classed('highlighted', true);
      
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

  private showNavigationOptions(event: any, nodeData: any) {
    const existingMenu = this.shadow.querySelector('.navigation-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    const functionCalls = this.flowEngine.getFunctionCallsFromLine(
      nodeData.line,
      this.controlFlow!,
      nodeData
    );
    
    const menu = document.createElement('div');
    menu.className = 'navigation-menu';
    
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
    
    menuHTML += `
      <div class="nav-option highlight" data-action="highlight">
        <span class="nav-icon">✨</span>
        Highlight path
      </div>
    `;
    
    menu.innerHTML = menuHTML;

    const rect = this.shadow.querySelector('#flowGraph')?.getBoundingClientRect();
    if (rect) {
      menu.style.left = `${event.layerX + 10}px`;
      menu.style.top = `${event.layerY + 10}px`;
    }

    this.shadow.appendChild(menu);

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
      
      if (!functionName) {
        const functionCallPattern = /(\w+)\s*\(/;
        const match = nodeData.code?.match(functionCallPattern);
        if (!match) return;
        functionName = match[1];
      }
      
      if (!functionName) return;
      const response = await this.fetchAPI(`/api/search?q=${encodeURIComponent(functionName)}&type=function&limit=1`);
      if (!response.results || response.results.length === 0) {
        console.error('Function not found:', functionName);
        return;
      }

      const targetSymbol = response.results[0];

      // Save current state
      if (this.symbolId && this.controlFlow) {
        this.navigationBuilder.navigateTo({
          symbolId: this.symbolId,
          symbolName: this.controlFlow.symbol.name || `Symbol ${this.symbolId}`,
          controlFlow: this.controlFlow
        });
      }

      // Navigate to the new function
      this.symbolId = targetSymbol.id;
      await this.loadEnhancedFlow();

      // Update navigation context
      if (this.controlFlow) {
        this.navigationBuilder.navigateTo({
          symbolId: targetSymbol.id,
          symbolName: targetSymbol.name || targetSymbol.qualified_name,
          controlFlow: this.controlFlow
        });
      }

    } catch (error) {
      console.error('Navigation failed:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  private navigateBack(targetIndex?: number) {
    let targetContext: NavigationContext | null = null;
    
    if (targetIndex !== undefined) {
      targetContext = this.navigationBuilder.navigateToIndex(targetIndex);
    } else {
      targetContext = this.navigationBuilder.navigateBack();
    }

    if (!targetContext) return;

    this.symbolId = targetContext.symbolId;
    this.controlFlow = targetContext.controlFlow;
    
    this.render();
    
    setTimeout(() => {
      if (this.viewMode === 'control') {
        this.initializeControlFlowGraph();
      }
    }, 0);
  }

  private navigateHome() {
    const rootContext = this.navigationBuilder.navigateHome();
    if (!rootContext) return;
    
    this.symbolId = rootContext.symbolId;
    this.controlFlow = rootContext.controlFlow;
    
    this.render();
    
    setTimeout(() => {
      if (this.viewMode === 'control') {
        this.initializeControlFlowGraph();
      }
    }, 0);
  }

  private returnToSearch() {
    this.navigationBuilder.clearNavigation();
    this.symbolId = null;
    this.controlFlow = null;
    
    const url = new URL(window.location.href);
    url.searchParams.delete('symbolId');
    window.history.pushState({}, '', url.toString());
    
    this.showSymbolSelector();
  }

  private async navigateToSymbolById(symbolId: number) {
    if (this.isNavigating) return;
    this.isNavigating = true;

    try {
      // Save current state
      if (this.symbolId && this.controlFlow) {
        this.navigationBuilder.navigateTo({
          symbolId: this.symbolId,
          symbolName: this.controlFlow.symbol.name || `Symbol ${this.symbolId}`,
          controlFlow: this.controlFlow
        });
      }

      this.symbolId = symbolId;
      await this.loadEnhancedFlow();

      if (this.controlFlow) {
        this.navigationBuilder.navigateTo({
          symbolId: symbolId,
          symbolName: this.controlFlow.symbol.name || this.controlFlow.symbol.qualified_name || `Symbol ${symbolId}`,
          controlFlow: this.controlFlow
        });
      }

    } catch (error) {
      console.error('Navigation to symbol failed:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  private showAllCallers() {
    if (!this.controlFlow || !this.controlFlow.callers) return;
    
    // TODO: Implement modal view for all callers
    console.log('All callers:', this.controlFlow.callers);
  }

  private showAllCallees() {
    if (!this.controlFlow || !this.controlFlow.callees) return;
    
    // TODO: Implement modal view for all callees
    console.log('All callees:', this.controlFlow.callees);
  }

  private attachEventListeners() {
    // Breadcrumb navigation
    this.shadow.querySelectorAll('.breadcrumb-item[data-nav-index]').forEach(item => {
      item.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-nav-index') || '0');
        this.navigateBack(index);
      });
    });

    const backButton = this.shadow.querySelector('[data-nav-back]');
    if (backButton) {
      backButton.addEventListener('click', () => {
        this.navigateBack();
      });
    }

    const homeButton = this.shadow.querySelector('[data-nav-home]');
    if (homeButton) {
      homeButton.addEventListener('click', () => {
        this.navigateHome();
      });
    }

    const searchButton = this.shadow.querySelector('[data-nav-search]');
    if (searchButton) {
      searchButton.addEventListener('click', () => {
        this.returnToSearch();
      });
    }

    // Caller/callee navigation
    this.shadow.querySelectorAll('.relationship-item[data-action="navigate"]').forEach(item => {
      item.addEventListener('click', async (e) => {
        const symbolId = (e.currentTarget as HTMLElement).getAttribute('data-symbol-id');
        if (symbolId) {
          await this.navigateToSymbolById(parseInt(symbolId));
        }
      });
    });

    // Show more buttons
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
}

defineComponent('enhanced-code-flow', EnhancedCodeFlow);