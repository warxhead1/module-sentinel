import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';

/**
 * Dashboard overview component
 */
export class DashboardOverview extends DashboardComponent {
  private stats: any = null;
  private namespaceData: any[] = [];
  private unsubscribers: Array<() => void> = [];

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
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
          margin-bottom: 40px;
        }
        
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
        
        .metric-card::before {
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
        
        .metric-card:hover {
          transform: translateY(-4px);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(100, 255, 218, 0.2);
          box-shadow: var(--shadow-medium), 0 0 40px rgba(100, 255, 218, 0.1);
        }
        
        .metric-card:hover::before {
          opacity: 1;
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
      
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${this.stats?.symbolCount?.toLocaleString() || '0'}</div>
          <div class="metric-label">Total Symbols</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${this.stats?.namespaceCount?.toLocaleString() || '0'}</div>
          <div class="metric-label">Namespaces</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${this.getProjectCount()}</div>
          <div class="metric-label">Active Projects</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${this.getLanguageCount()}</div>
          <div class="metric-label">Languages</div>
        </div>
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

    // Initialize charts if data is loaded
    if (this.stats) {
      this.initializeCharts();
    }
  }

  private async handleReindex(fullRebuild: boolean = false) {
    const btnId = fullRebuild ? 'fullRebuildBtn' : 'reindexBtn';
    const btn = this.shadow.getElementById(btnId);
    
    if (!btn) return;

    // Disable button and show loading state
    btn.classList.add('loading');
    btn.setAttribute('disabled', 'true');
    const originalText = btn.textContent;
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
                btn.textContent = fullRebuild ? `🗑️ ${data.message}` : `🔄 ${data.message}`;
              }
            } catch {
              // Not JSON, ignore
            }
          }
        }
      }

      // Success
      btn.textContent = fullRebuild ? '✅ Rebuild Complete' : '✅ Re-index Complete';
      btn.classList.remove('loading');
      
      // Refresh the page data after a short delay
      setTimeout(() => {
        btn.textContent = originalText;
        btn.removeAttribute('disabled');
        btn.classList.remove('loading');
        this.loadData(); // Reload dashboard data
      }, 2000);

    } catch (error) {
      console.error('Re-index failed:', error);
      btn.textContent = fullRebuild ? '❌ Rebuild Failed' : '❌ Re-index Failed';
      btn.classList.remove('loading');
      
      // Reset button after delay
      setTimeout(() => {
        btn.textContent = originalText;
        btn.removeAttribute('disabled');
        btn.classList.remove('loading');
      }, 3000);
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
}

defineComponent('dashboard-overview', DashboardOverview);