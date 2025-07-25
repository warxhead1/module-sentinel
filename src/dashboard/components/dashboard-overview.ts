import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';
import { iconRegistry } from '../utils/icon-registry.js';
import { tooltipManager, TooltipManager } from '../utils/tooltip-manager.js';
import { MicroChartRenderer } from '../utils/micro-chart-renderer.js';
import type { MetricData, QuickAction, InsightCard } from '../types/dashboard.types.js';

/**
 * Dashboard overview component
 */
export class DashboardOverview extends DashboardComponent {
  private stats: any = null;
  private namespaceData: any[] = [];
  private unsubscribers: Array<() => void> = [];
  private metricsHistory: Map<string, number[]> = new Map();
  private insights: InsightCard[] = [];
  private graphPreviewData: any = null;

  connectedCallback() {
    // Subscribe to state changes for project/language counts
    this.unsubscribers.push(
      stateService.subscribe('projects', () => {
        this.render();
      }),
      stateService.subscribe('languages', () => {
        this.render();
      })
    );
    
    // Initialize rendering
    this.render();
    
    // Load data
    this.loadData().catch(error => {
      console.error(`Error loading data for ${this.tagName}:`, error);
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    });
  }

  disconnectedCallback() {
    // Clean up subscriptions
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    
    // Call parent implementation
    super.disconnectedCallback();
  }

  async loadData(): Promise<void> {
    try {
      this._loading = true;
      this.render();
      
      // First ensure projects and languages are loaded
      const [projects, languages] = await Promise.all([
        dataService.getProjects(),
        dataService.getLanguages()
      ]);
      
      // Update state if not already set
      if (!stateService.getState('projects')) {
        stateService.setState('projects', projects || []);
      }
      if (!stateService.getState('languages')) {
        stateService.setState('languages', languages || []);
      }
      
      // Get current filters from state service
      const projectId = stateService.getState<number>('selectedProjectId');
      const languageId = stateService.getState<number>('selectedLanguageId');
      const visibleProjectIds = stateService.getState<number[]>('visibleProjectIds') || [];
      
      // Build query parameters for namespace filtering
      const params: { projectIds?: number[]; languageId?: number } = {};
      
      // Use visible project IDs if available, otherwise fall back to selected project
      if (visibleProjectIds.length > 0) {
        params.projectIds = visibleProjectIds;
      } else if (projectId) {
        params.projectIds = [projectId];
      }
      
      if (languageId) {
        params.languageId = languageId;
      }
      
      // Load stats and namespaces using shared data service
      const [stats, nsResponse] = await Promise.all([
        dataService.getStats(),
        dataService.getNamespaces(params)
      ]);
      
      this.stats = stats;
      if (nsResponse && Array.isArray(nsResponse)) {
        // Use the array response directly
        this.namespaceData = nsResponse
          .sort((a: any, b: any) => b.symbol_count - a.symbol_count)
          .slice(0, 10);
      }
      
      // Load additional enhanced data
      await this.loadInsights();
      
      this._loading = false;
      this.render();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this._loading = false;
      this.render();
    }
  }

  private flattenNamespaceTree(tree: any, result: any[] = []): any[] {
    Object.values(tree).forEach((node: any) => {
      if (node.fullPath && node.symbolCount > 0) {
        result.push({
          namespace: node.fullPath,
          count: node.symbolCount
        });
      }
      if (node.children) {
        this.flattenNamespaceTree(node.children, result);
      }
    });
    return result;
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
          padding: 32px 48px;
          min-height: 100vh;
          box-sizing: border-box;
          width: 100%;
        }
        
        .page-header {
          margin-bottom: 40px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--card-border);
          position: relative;
        }
        
        .page-header::before {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 80px;
          height: 2px;
          background: linear-gradient(90deg, var(--primary-accent), var(--secondary-accent));
        }
        
        h1 {
          font-size: 2.75rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--primary-accent), var(--secondary-accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 12px 0;
          letter-spacing: -1px;
        }
        
        .subtitle {
          font-size: 1.125rem;
          color: var(--text-secondary);
          font-weight: 400;
          letter-spacing: 0.01em;
        }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          margin-bottom: 40px;
        }
        
        /* Enhanced metric card styles */
        .metric-card.enhanced {
          background: rgba(35, 35, 65, 0.9);
          border-radius: var(--border-radius);
          padding: 20px;
          border: 1px solid rgba(147, 112, 219, 0.3);
          backdrop-filter: blur(20px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .metric-card.enhanced::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, 
            transparent, 
            var(--primary-accent), 
            transparent);
          opacity: 0;
          transition: var(--transition-smooth);
        }
        
        .metric-card.enhanced:hover {
          transform: translateY(-6px) scale(1.02);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(186, 85, 211, 0.5);
          box-shadow: 0 12px 48px rgba(186, 85, 211, 0.3), 0 0 80px rgba(186, 85, 211, 0.1);
        }
        
        .metric-card.enhanced:hover::before {
          opacity: 1;
        }
        
        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .metric-icon {
          font-size: 24px;
        }
        
        .quick-actions {
          display: flex;
          gap: 8px;
        }
        
        .quick-action-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          backdrop-filter: blur(10px);
        }
        
        .quick-action-btn:hover {
          background: rgba(186, 85, 211, 0.2);
          border-color: rgba(186, 85, 211, 0.5);
          color: var(--primary-accent);
          transform: scale(1.1);
        }
        
        .metric-value-container {
          display: flex;
          align-items: baseline;
          gap: 12px;
          justify-content: center;
        }
        
        .metric-value {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
        }
        
        .metric-trend {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.875rem;
          font-weight: 600;
        }
        
        .trend-icon {
          font-size: 16px;
        }
        
        .metric-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
          font-weight: 500;
          text-align: center;
        }
        
        .metric-sparkline {
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 8px 0;
        }
        
        .metric-footer {
          text-align: center;
          margin-top: auto;
        }
        
        .metric-details-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        
        .metric-card.enhanced:hover .metric-details-hint {
          opacity: 1;
        }
        
        /* Insight carousel styles */
        .insight-carousel {
          background: rgba(35, 35, 65, 0.9);
          border-radius: var(--border-radius);
          padding: 24px;
          border: 1px solid rgba(147, 112, 219, 0.3);
          backdrop-filter: blur(20px);
          margin-bottom: 32px;
        }
        
        .carousel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .carousel-header h3 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--primary-accent);
        }
        
        .carousel-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .carousel-prev, .carousel-next {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid var(--card-border);
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .carousel-prev:hover, .carousel-next:hover {
          background: rgba(186, 85, 211, 0.2);
          border-color: rgba(186, 85, 211, 0.5);
        }
        
        .carousel-indicator {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        
        .carousel-content {
          position: relative;
          height: 120px;
          overflow: hidden;
        }
        
        .insight-card {
          position: absolute;
          width: 100%;
          display: none;
          grid-template-columns: auto 1fr auto;
          gap: 16px;
          align-items: center;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px solid transparent;
          transition: all 0.3s ease;
        }
        
        .insight-card.active {
          display: grid;
        }
        
        .insight-severity {
          font-size: 24px;
        }
        
        .insight-body h4 {
          margin: 0 0 8px 0;
          font-size: 1rem;
          color: var(--text-primary);
        }
        
        .insight-body p {
          margin: 0 0 12px 0;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        
        .insight-action {
          background: rgba(186, 85, 211, 0.2);
          border: 1px solid rgba(186, 85, 211, 0.5);
          color: var(--primary-accent);
          padding: 6px 16px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.875rem;
          font-weight: 500;
        }
        
        .insight-action:hover {
          background: rgba(186, 85, 211, 0.3);
          transform: translateX(4px);
        }
        
        .insight-metrics {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        
        /* Keep existing metric card style for fallback */
        .metric-card {
          background: rgba(35, 35, 65, 0.9);
          border-radius: var(--border-radius);
          padding: 32px 24px;
          border: 1px solid rgba(147, 112, 219, 0.3);
          backdrop-filter: blur(20px);
          transition: var(--transition-smooth);
          position: relative;
          overflow: hidden;
          text-align: center;
        }
        
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
          gap: 32px;
        }
        
        .chart-container {
          position: relative;
          height: 320px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .namespace-list {
          max-height: 420px;
          overflow-y: auto;
          padding-right: 8px;
        }
        
        .namespace-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          margin: 8px 0;
          border-radius: var(--border-radius);
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid transparent;
          transition: var(--transition-smooth);
        }
        
        .namespace-item:hover {
          background: var(--card-bg);
          border-color: var(--card-border);
          transform: translateX(4px);
        }
        
        .namespace-name {
          color: var(--primary-accent);
          cursor: pointer;
          transition: var(--transition-smooth);
          font-weight: 500;
          font-size: 0.95rem;
        }
        
        .namespace-name:hover {
          color: var(--secondary-accent);
          text-shadow: 0 0 10px rgba(100, 255, 218, 0.3);
        }
        
        .namespace-count {
          color: var(--text-muted);
          font-size: 0.875rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 4px 12px;
          border-radius: 20px;
          border: 1px solid var(--card-border);
        }
        
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          margin-top: 24px;
        }
        
        .action-btn {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          padding: 20px 16px;
          border-radius: var(--border-radius);
          text-align: center;
          cursor: pointer;
          transition: var(--transition-smooth);
          color: var(--text-primary);
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          backdrop-filter: blur(10px);
          position: relative;
          overflow: hidden;
        }
        
        .action-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, 
            transparent, 
            var(--primary-accent), 
            transparent);
          opacity: 0;
          transition: var(--transition-smooth);
        }
        
        .action-btn:hover {
          background: rgba(100, 255, 218, 0.1);
          border-color: rgba(100, 255, 218, 0.2);
          transform: translateY(-4px);
          box-shadow: var(--shadow-soft), 0 0 20px rgba(100, 255, 218, 0.1);
        }
        
        .action-btn:hover::before {
          opacity: 1;
        }
        
        .action-icon {
          font-size: 1.5rem;
          margin-bottom: 4px;
        }
        
        .action-text {
          font-size: 0.875rem;
          font-weight: 500;
          letter-spacing: 0.05em;
        }
        
        .admin-section {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--card-border);
        }
        
        .admin-actions {
          display: flex;
          gap: 16px;
          margin-top: 16px;
        }
        
        .admin-btn {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          padding: 12px 20px;
          border-radius: var(--border-radius);
          cursor: pointer;
          transition: var(--transition-smooth);
          color: var(--text-primary);
          font-size: 0.875rem;
          font-weight: 500;
          backdrop-filter: blur(10px);
          position: relative;
          overflow: hidden;
          min-width: 140px;
        }
        
        .admin-btn.danger {
          border-color: rgba(244, 67, 54, 0.3);
          color: #ef5350;
        }
        
        .admin-btn.primary {
          border-color: rgba(100, 255, 218, 0.3);
          color: var(--primary-accent);
        }
        
        .admin-btn:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-soft);
        }
        
        .admin-btn.danger:hover {
          background: rgba(244, 67, 54, 0.1);
          border-color: rgba(244, 67, 54, 0.5);
        }
        
        .admin-btn.primary:hover {
          background: rgba(100, 255, 218, 0.1);
          border-color: rgba(100, 255, 218, 0.5);
        }
        
        .admin-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        
        .admin-btn.loading {
          color: var(--text-muted);
        }
        
        .admin-btn.loading::after {
          content: '';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 12px;
          height: 12px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      </style>
      
      <div class="page-header">
        <h1>Project Overview</h1>
        <p class="subtitle">Real-time architectural metrics and system health</p>
      </div>
      
      ${this.renderInsightCarousel()}
      
      <div class="metrics-grid" id="enhanced-metrics">
        <!-- Enhanced metrics will be rendered here -->
      </div>
      
      <div class="dashboard-grid">
        <div class="card">
          <h2>Pipeline Stages</h2>
          <div class="chart-container">
            <canvas id="pipelineChart"></canvas>
          </div>
        </div>
        
        <div class="card">
          <h2>Module Browser</h2>
          <module-browser compact></module-browser>
        </div>
        
        <div class="card" style="grid-column: span 2;">
          <file-structure-widget></file-structure-widget>
        </div>
        
        <div class="card">
          <h2>Quick Actions</h2>
          <div class="quick-actions">
            <a href="/search" class="action-btn">
              <span class="action-icon">🔍</span>
              <span class="action-text">Search Code</span>
            </a>
            <a href="/code-flow" class="action-btn">
              <span class="action-icon">🌊</span>
              <span class="action-text">Trace Flow</span>
            </a>
            <a href="/patterns" class="action-btn">
              <span class="action-icon">🏗️</span>
              <span class="action-text">View Patterns</span>
            </a>
            <a href="/performance" class="action-btn">
              <span class="action-icon">🔥</span>
              <span class="action-text">Hotspots</span>
            </a>
          </div>
        </div>
        
        <div class="card">
          <div class="admin-section">
            <h3>Database Management</h3>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 8px 0 0 0;">
              Re-index the codebase to update symbol analysis and relationships
            </p>
            <div class="admin-actions">
              <button class="admin-btn primary" id="reindexBtn">
                🔄 Re-index Database
              </button>
              <button class="admin-btn danger" id="fullRebuildBtn">
                🗑️ Full Rebuild
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add click handlers for namespaces
    this.shadow.querySelectorAll('.namespace-name').forEach(el => {
      el.addEventListener('click', (e) => {
        const namespace = (e.target as HTMLElement).getAttribute('data-namespace');
        this.emit('namespace-selected', { namespace });
        // Navigate to namespace view
        window.location.href = `/namespaces?ns=${encodeURIComponent(namespace || '')}`;
      });
    });

    // Add click handlers for admin buttons
    const reindexBtn = this.shadow.getElementById('reindexBtn');
    const fullRebuildBtn = this.shadow.getElementById('fullRebuildBtn');

    if (reindexBtn) {
      reindexBtn.addEventListener('click', () => this.handleReindex(false));
    }

    if (fullRebuildBtn) {
      fullRebuildBtn.addEventListener('click', () => this.handleReindex(true));
    }

    // Initialize enhanced metrics
    this.initializeEnhancedMetrics();
    
    // Initialize charts if data is loaded
    if (this.stats) {
      this.initializeCharts();
    }
  }
  
  private async initializeEnhancedMetrics(): Promise<void> {
    const metricsContainer = this.shadow.getElementById('enhanced-metrics');
    if (!metricsContainer) return;
    
    try {
      const metrics = await this.loadMetricsWithHistory();
      metricsContainer.innerHTML = metrics.map(metric => this.createEnhancedMetricCard(metric)).join('');
      
      // Set up tooltips
      this.setupMetricTooltips();
      
      // Set up quick action handlers
      this.setupQuickActionHandlers();
      
      // Set up carousel controls
      this.setupCarouselControls();
      
      // Set up insight action handlers
      this.setupInsightHandlers();
    } catch (error) {
      console.error('Failed to initialize enhanced metrics:', error);
    }
  }
  
  private setupQuickActionHandlers(): void {
    this.shadow.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
        // Action handlers are defined in the metric data
      });
    });
  }
  
  private setupCarouselControls(): void {
    const prevBtn = this.shadow.querySelector('.carousel-prev');
    const nextBtn = this.shadow.querySelector('.carousel-next');
    const indicator = this.shadow.querySelector('.carousel-indicator');
    
    if (!prevBtn || !nextBtn || !indicator) return;
    
    let currentIndex = 0;
    
    const updateCarousel = () => {
      this.shadow.querySelectorAll('.insight-card').forEach((card, index) => {
        card.classList.toggle('active', index === currentIndex);
      });
      indicator.textContent = `${currentIndex + 1} / ${this.insights.length}`;
    };
    
    prevBtn.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + this.insights.length) % this.insights.length;
      updateCarousel();
    });
    
    nextBtn.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % this.insights.length;
      updateCarousel();
    });
  }
  
  private setupInsightHandlers(): void {
    this.shadow.querySelectorAll('.insight-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const insightId = (e.currentTarget as HTMLElement).getAttribute('data-insight-id');
        const insight = this.insights.find(i => i.id === insightId);
        if (insight?.suggestedAction) {
          insight.suggestedAction.action();
        }
      });
    });
  }

  private async handleReindex(fullRebuild: boolean = false) {
    const btnId = fullRebuild ? 'fullRebuildBtn' : 'reindexBtn';
    const btn = this.shadow.getElementById(btnId);
    
    if (!btn) return;

    // Disable button and show loading state
    btn.classList.add('loading');
    btn.setAttribute('disabled', 'true');
    const originalText = btn.textContent;
    
    // Create progress indicator
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--border-radius);
      padding: 20px;
      max-width: 400px;
      z-index: 10000;
      box-shadow: var(--shadow-large);
    `;
    
    const progressTitle = document.createElement('div');
    progressTitle.style.cssText = `
      color: var(--primary-accent);
      font-weight: 600;
      margin-bottom: 10px;
    `;
    progressTitle.textContent = fullRebuild ? '🗑️ Full Rebuild Progress' : '🔄 Re-index Progress';
    
    const progressText = document.createElement('div');
    progressText.style.cssText = `
      color: var(--text-primary);
      font-size: 0.9rem;
      line-height: 1.4;
      margin-bottom: 10px;
    `;
    
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    `;
    
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      background: var(--primary-accent);
      width: 0%;
      transition: width 0.3s ease;
    `;
    
    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressTitle);
    progressContainer.appendChild(progressText);
    progressContainer.appendChild(progressBar);
    document.body.appendChild(progressContainer);
    
    btn.textContent = fullRebuild ? '🗑️ Rebuilding...' : '🔄 Re-indexing...';

    try {
      const payload = fullRebuild ? { cleanRebuild: true } : {};
      
      const response = await fetch('/api/rebuild-index', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        result += chunk;
        
        // Try to parse each chunk as JSON for progress updates
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.message) {
                // Update button text (shortened for button)
                const shortMessage = data.message.length > 30 
                  ? data.message.substring(0, 27) + '...'
                  : data.message;
                btn.textContent = fullRebuild ? `🗑️ ${shortMessage}` : `🔄 ${shortMessage}`;
                
                // Update progress indicator
                progressText.textContent = data.message;
                
                // Update progress bar if percentage data is available
                if (data.data && data.data.percentage) {
                  progressFill.style.width = `${data.data.percentage}%`;
                }
              }
            } catch {
              // Not JSON, ignore
            }
          }
        }
      }

      // Success
      btn.textContent = fullRebuild ? '✅ Rebuild Complete' : '✅ Re-index Complete';
      progressText.textContent = '✅ Process completed successfully!';
      progressFill.style.width = '100%';
      btn.classList.remove('loading');
      
      // Remove progress indicator and refresh data after delay
      setTimeout(() => {
        document.body.removeChild(progressContainer);
        btn.textContent = originalText;
        btn.removeAttribute('disabled');
        btn.classList.remove('loading');
        this.loadData(); // Reload dashboard data
      }, 3000);

    } catch (error) {
      console.error('Re-index failed:', error);
      btn.textContent = fullRebuild ? '❌ Rebuild Failed' : '❌ Re-index Failed';
      progressText.textContent = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      progressFill.style.background = '#ff4757';
      btn.classList.remove('loading');
      
      // Reset button and remove progress indicator after delay
      setTimeout(() => {
        document.body.removeChild(progressContainer);
        btn.textContent = originalText;
        btn.removeAttribute('disabled');
        btn.classList.remove('loading');
      }, 5000);
    }
  }

  private initializeCharts() {
    // TODO: Initialize Chart.js charts
    // This would be done after the component is rendered
  }

  private getProjectCount(): string {
    const projects = stateService.getState<any[]>('projects') || [];
    return projects.length.toString();
  }

  private getLanguageCount(): string {
    const languages = stateService.getState<any[]>('languages') || [];
    return languages.length.toString();
  }

  private createEnhancedMetricCard(metric: MetricData): string {
    const trendIcon = metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→';
    const trendColor = metric.trend === 'up' ? '#4ade80' : metric.trend === 'down' ? '#f87171' : '#94a3b8';
    
    return `
      <div class="metric-card enhanced" data-metric-id="${metric.id}">
        <div class="metric-header">
          <span class="metric-icon">${metric.icon || '📊'}</span>
          <div class="quick-actions">
            ${metric.actions?.map(action => `
              <button class="quick-action-btn" data-action="${action.id}" title="${action.tooltip}">
                ${iconRegistry.get(action.icon)?.content || action.icon}
              </button>
            `).join('') || ''}
          </div>
        </div>
        
        <div class="metric-value-container">
          <div class="metric-value" style="color: ${metric.color || 'var(--primary-accent)'}">
            ${metric.value.toLocaleString()}${metric.unit || ''}
          </div>
          ${metric.previousValue !== undefined ? `
            <div class="metric-trend" style="color: ${trendColor}">
              <span class="trend-icon">${trendIcon}</span>
              <span class="trend-value">${metric.trendPercentage ? `${metric.trendPercentage.toFixed(1)}%` : ''}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="metric-label">${metric.label}</div>
        
        ${metric.sparklineData ? `
          <div class="metric-sparkline">
            ${this.renderSparkline(metric.sparklineData)}
          </div>
        ` : ''}
        
        <div class="metric-footer">
          <span class="metric-details-hint">Click for details</span>
        </div>
      </div>
    `;
  }

  private renderSparkline(data: number[]): string {
    const svg = MicroChartRenderer.renderSparkline(data, {
      width: 180,
      height: 40,
      color: '#ba55d3',
      showArea: true,
      smooth: true
    });
    return svg.outerHTML;
  }

  private async loadMetricsWithHistory(): Promise<MetricData[]> {
    // Generate sample historical data for demonstration
    const generateHistory = (current: number, length: number = 7): number[] => {
      const history = [];
      for (let i = 0; i < length; i++) {
        const variance = 0.1; // 10% variance
        const value = current * (1 + (Math.random() - 0.5) * variance);
        history.push(Math.round(value));
      }
      return history;
    };

    const symbolCount = this.stats?.symbolCount || 0;
    const namespaceCount = this.stats?.namespaceCount || 0;
    const projectCount = parseInt(this.getProjectCount());
    const languageCount = parseInt(this.getLanguageCount());

    const metrics: MetricData[] = [
      {
        id: 'symbols',
        label: 'Total Symbols',
        value: symbolCount,
        previousValue: symbolCount * 0.95,
        icon: '🔤',
        color: '#ba55d3',
        sparklineData: generateHistory(symbolCount),
        trend: 'up',
        trendPercentage: 5.2,
        actions: [
          { id: 'search', icon: 'search', tooltip: 'Search symbols', action: () => { window.location.href = '/search'; } },
          { id: 'analyze', icon: 'analyze', tooltip: 'Analyze symbols', action: () => { window.location.href = '/analytics'; } },
          { id: 'hotspots', icon: 'hotspots', tooltip: 'View hotspots', action: () => { window.location.href = '/performance'; } }
        ]
      },
      {
        id: 'namespaces',
        label: 'Namespaces',
        value: namespaceCount,
        previousValue: namespaceCount * 0.98,
        icon: '📦',
        color: '#9370db',
        sparklineData: generateHistory(namespaceCount),
        trend: 'stable',
        trendPercentage: 2.1,
        actions: [
          { id: 'browse', icon: 'layers', tooltip: 'Browse namespaces', action: () => { window.location.href = '/namespaces'; } },
          { id: 'graph', icon: 'graph', tooltip: 'View graph', action: () => { window.location.href = '/relationships'; } }
        ]
      },
      {
        id: 'projects',
        label: 'Active Projects',
        value: projectCount,
        icon: '🏗️',
        color: '#64ffda',
        sparklineData: generateHistory(projectCount, 5),
        trend: 'stable',
        actions: [
          { id: 'add', icon: 'add', tooltip: 'Add project', action: () => { window.location.href = '/projects'; } },
          { id: 'recent', icon: 'recent', tooltip: 'Recent projects', action: () => {} }
        ]
      },
      {
        id: 'languages',
        label: 'Languages',
        value: languageCount,
        icon: '🌐',
        color: '#4ade80',
        sparklineData: generateHistory(languageCount, 5),
        trend: 'up',
        trendPercentage: 12.5,
        actions: [
          { id: 'cross-ref', icon: 'cross-ref', tooltip: 'Cross-language refs', action: () => { window.location.href = '/multi-language'; } },
          { id: 'patterns', icon: 'patterns', tooltip: 'Language patterns', action: () => { window.location.href = '/patterns'; } }
        ]
      }
    ];

    return metrics;
  }

  private setupMetricTooltips(): void {
    this.shadow.querySelectorAll('.metric-card.enhanced').forEach(card => {
      const metricId = card.getAttribute('data-metric-id');
      if (!metricId) return;

      tooltipManager.bind(card as HTMLElement, {
        content: TooltipManager.createRichContent({
          title: 'Symbol Statistics',
          description: 'Detailed breakdown of symbols in your codebase',
          stats: [
            { label: 'Functions', value: '2,431', color: '#ba55d3' },
            { label: 'Classes', value: '892', color: '#9370db' },
            { label: 'Interfaces', value: '234', color: '#8b008b' },
            { label: 'Variables', value: '1,203', color: '#4b0082' }
          ],
          actions: [
            { label: 'View Details', icon: '→' },
            { label: 'Export Report', icon: '📄' }
          ]
        }),
        placement: 'auto',
        interactive: true,
        html: true,
        maxWidth: 350
      });
    });
  }

  private async loadInsights(): Promise<void> {
    // Mock insights for demonstration
    this.insights = [
      {
        id: '1',
        severity: 'warning',
        category: 'Performance',
        title: 'High Cyclomatic Complexity',
        message: 'Found 23 functions with complexity > 15',
        affectedSymbols: [],
        suggestedAction: {
          label: 'Review Functions',
          action: () => { window.location.href = '/performance?filter=complexity'; }
        },
        metrics: {
          impact: 75,
          confidence: 90,
          occurrences: 23
        },
        timestamp: new Date()
      },
      {
        id: '2',
        severity: 'info',
        category: 'Architecture',
        title: 'Singleton Pattern Detected',
        message: '5 classes implement singleton pattern',
        affectedSymbols: [],
        metrics: {
          impact: 30,
          confidence: 95,
          occurrences: 5
        },
        timestamp: new Date()
      }
    ];
  }

  private renderInsightCarousel(): string {
    if (this.insights.length === 0) return '';

    return `
      <div class="insight-carousel">
        <div class="carousel-header">
          <h3>💡 Smart Insights</h3>
          <div class="carousel-controls">
            <button class="carousel-prev">‹</button>
            <span class="carousel-indicator">1 / ${this.insights.length}</span>
            <button class="carousel-next">›</button>
          </div>
        </div>
        <div class="carousel-content">
          ${this.insights.map((insight, index) => `
            <div class="insight-card ${index === 0 ? 'active' : ''}" data-index="${index}">
              <div class="insight-severity ${insight.severity}">
                ${insight.severity === 'critical' ? '🔴' : insight.severity === 'warning' ? '🟡' : '🔵'}
              </div>
              <div class="insight-body">
                <h4>${insight.title}</h4>
                <p>${insight.message}</p>
                ${insight.suggestedAction ? `
                  <button class="insight-action" data-insight-id="${insight.id}">
                    ${insight.suggestedAction.label} →
                  </button>
                ` : ''}
              </div>
              <div class="insight-metrics">
                <span title="Impact">🎯 ${insight.metrics?.impact}%</span>
                <span title="Confidence">📊 ${insight.metrics?.confidence}%</span>
                <span title="Occurrences">📍 ${insight.metrics?.occurrences}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

defineComponent('dashboard-overview', DashboardOverview);