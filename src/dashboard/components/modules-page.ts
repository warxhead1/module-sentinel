import { DashboardComponent, defineComponent } from './base-component.js';
import './module-browser.js';

/**
 * Full-featured modules page with browser and details panel
 */
export class ModulesPage extends DashboardComponent {
  async loadData(): Promise<void> {
    // No initial data to load - components handle their own data
  }

  render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100vh;
          padding: 32px 48px;
          box-sizing: border-box;
          overflow: hidden;
        }
        
        .page-header {
          margin-bottom: 32px;
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
        
        .content-wrapper {
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 24px;
          height: calc(100vh - 200px);
          overflow: hidden;
        }
        
        .browser-panel {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius);
          overflow: hidden;
          backdrop-filter: blur(20px);
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
        }
        
        .browser-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--card-border);
          background: rgba(255, 255, 255, 0.02);
        }
        
        .browser-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        
        .browser-subtitle {
          font-size: 0.875rem;
          color: var(--text-muted);
        }
        
        .browser-content {
          flex: 1;
          overflow: hidden;
        }
        
        module-browser {
          width: 100%;
          height: 100%;
          display: block;
        }
        
        .details-panel {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius);
          overflow: hidden;
          backdrop-filter: blur(20px);
          transition: var(--transition-smooth);
          display: flex;
          flex-direction: column;
        }
        
        .details-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--card-border);
          background: rgba(255, 255, 255, 0.02);
        }
        
        .details-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        
        .details-subtitle {
          font-size: 0.875rem;
          color: var(--text-muted);
        }
        
        .details-content {
          flex: 1;
          overflow: hidden;
        }
        
        class-details-panel {
          width: 100%;
          height: 100%;
          display: block;
        }
        
        .action-bar {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }
        
        .action-button {
          padding: 8px 16px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 6px;
          color: var(--text-primary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition-smooth);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .action-button:hover {
          background: rgba(100, 255, 218, 0.1);
          border-color: rgba(100, 255, 218, 0.3);
          transform: translateY(-2px);
          box-shadow: var(--shadow-soft);
        }
        
        .action-icon {
          font-size: 1rem;
        }
        
        /* Responsive design */
        @media (max-width: 1200px) {
          .content-wrapper {
            grid-template-columns: 360px 1fr;
          }
        }
        
        @media (max-width: 768px) {
          :host {
            padding: 20px;
          }
          
          .content-wrapper {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }
        }
      </style>
      
      <div class="page-header">
        <h1>Module Explorer</h1>
        <p class="subtitle">Navigate and explore your project's module hierarchy</p>
        
        <div class="action-bar">
          <button class="action-button" id="expandAllBtn">
            <span class="action-icon">📂</span>
            <span>Expand All</span>
          </button>
          <button class="action-button" id="collapseAllBtn">
            <span class="action-icon">📁</span>
            <span>Collapse All</span>
          </button>
          <button class="action-button" id="visualizeBtn">
            <span class="action-icon">📊</span>
            <span>Visualize Hierarchy</span>
          </button>
          <button class="action-button" id="exportBtn">
            <span class="action-icon">💾</span>
            <span>Export Structure</span>
          </button>
        </div>
      </div>
      
      <div class="content-wrapper">
        <div class="browser-panel">
          <div class="browser-header">
            <h2 class="browser-title">Module Browser</h2>
            <p class="browser-subtitle">Click on classes to view details</p>
          </div>
          <div class="browser-content">
            <module-browser id="moduleBrowser"></module-browser>
          </div>
        </div>
        
        <div class="details-panel">
          <div class="details-header">
            <h2 class="details-title">Class Details</h2>
            <p class="details-subtitle">Symbol information and relationships</p>
          </div>
          <div class="details-content">
            <class-details-panel id="classDetails"></class-details-panel>
          </div>
        </div>
      </div>
    `;

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for file selection events from the module browser
    const moduleBrowser = this.shadow.getElementById('moduleBrowser');
    const classDetails = this.shadow.getElementById('classDetails') as any;

    if (moduleBrowser) {
      moduleBrowser.addEventListener('symbol-selected', (event: any) => {
        const { qualifiedName } = event.detail;
        if (classDetails && classDetails.showSymbol) {
          classDetails.showSymbol(qualifiedName);
        }
      });
    }

    // Action button handlers
    const expandAllBtn = this.shadow.getElementById('expandAllBtn');
    const collapseAllBtn = this.shadow.getElementById('collapseAllBtn');
    const visualizeBtn = this.shadow.getElementById('visualizeBtn');
    const exportBtn = this.shadow.getElementById('exportBtn');

    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        // TODO: Implement expand all functionality
        console.log('Expand all modules');
      });
    }

    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        // TODO: Implement collapse all functionality
        console.log('Collapse all modules');
      });
    }

    if (visualizeBtn) {
      visualizeBtn.addEventListener('click', () => {
        // TODO: Navigate to visualization view
        console.log('Visualize module hierarchy');
        // window.location.href = '/modules/visualize';
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        // TODO: Implement export functionality
        console.log('Export module structure');
        this.exportModuleStructure();
      });
    }
  }

  private async exportModuleStructure() {
    try {
      const response = await fetch('/api/modules');
      if (!response.ok) throw new Error('Failed to fetch module data');
      
      const data = await response.json();
      const jsonData = JSON.stringify(data, null, 2);
      
      // Create download link
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'module-structure.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }
}

defineComponent('modules-page', ModulesPage);