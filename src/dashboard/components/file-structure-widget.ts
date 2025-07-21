import { DashboardComponent, defineComponent } from './base-component.js';

/**
 * File structure widget for dashboard overview
 */
export class FileStructureWidget extends DashboardComponent {
  private fileStats: any = null;

  async loadData(): Promise<void> {
    try {
      const modules = await this.fetchAPI('/api/modules');
      if (modules && modules.length > 0) {
        // Flatten the module hierarchy to get all files
        const allFiles = this.flattenModules(modules);
        // Calculate file statistics
        this.fileStats = this.calculateFileStats(allFiles);
      }
    } catch (error) {
      console.error('Failed to load file structure data:', error);
    }
  }

  private flattenModules(modules: any[]): any[] {
    const files: any[] = [];
    
    const processNode = (node: any) => {
      if (node.files) {
        files.push(...node.files);
      }
      if (node.children) {
        node.children.forEach(processNode);
      }
    };
    
    modules.forEach(processNode);
    return files;
  }

  private calculateFileStats(files: any[]): any {
    const stats = {
      totalFiles: 0,
      ixxFiles: 0,
      cppFiles: 0,
      namespaces: new Set<string>(),
      largestFile: { path: '', size: 0 }
    };

    files.forEach(file => {
      stats.totalFiles++;
      if (file.path && file.path.endsWith('.ixx')) {
        stats.ixxFiles++;
      } else if (file.path && file.path.endsWith('.cpp')) {
        stats.cppFiles++;
      }
      
      if (file.namespace) {
        stats.namespaces.add(file.namespace);
      }
      
      // Track file with most symbols
      const symbolCount = file.symbolCount || 0;
      if (symbolCount > stats.largestFile.size) {
        stats.largestFile = {
          path: file.path || 'Unknown',
          size: symbolCount
        };
      }
    });

    return {
      ...stats,
      namespaceCount: stats.namespaces.size
    };
  }

  render(): void {
    const content = this.renderContent();
    const styles = this.styles();
    
    this.shadow.innerHTML = `
      <style>${styles}</style>
      ${content}
    `;
  }

  private renderContent(): string {
    if (!this.fileStats) {
      return `
        <div class="card loading">
          <h3>File Structure</h3>
          <div class="loading-spinner"></div>
        </div>
      `;
    }

    return `
      <div class="card">
        <h3>File Structure</h3>
        <div class="stats-grid">
          <div class="stat">
            <div class="stat-value">${this.fileStats.totalFiles}</div>
            <div class="stat-label">Total Files</div>
          </div>
          <div class="stat">
            <div class="stat-value">${this.fileStats.ixxFiles}</div>
            <div class="stat-label">Module Interfaces (.ixx)</div>
          </div>
          <div class="stat">
            <div class="stat-value">${this.fileStats.cppFiles}</div>
            <div class="stat-label">Implementations (.cpp)</div>
          </div>
          <div class="stat">
            <div class="stat-value">${this.fileStats.namespaceCount}</div>
            <div class="stat-label">Namespaces</div>
          </div>
        </div>
      </div>
    `;
  }

  styles(): string {
    return `
      .card {
        background: var(--card-bg);
        border-radius: var(--border-radius);
        padding: 20px;
        margin-bottom: 20px;
        border: 1px solid var(--card-border);
        box-shadow: var(--shadow-soft);
      }

      .card h3 {
        margin-bottom: 15px;
        color: var(--vampire-purple);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
      }

      .stat {
        text-align: center;
        padding: 10px;
        background: rgba(147, 112, 219, 0.1);
        border-radius: 8px;
      }

      .stat-value {
        font-size: 24px;
        font-weight: 600;
        color: var(--primary-accent);
      }

      .stat-label {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 5px;
      }

      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 150px;
      }

      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(147, 112, 219, 0.1);
        border-top-color: var(--primary-accent);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-top: 15px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
  }
}

// Register the component
defineComponent('file-structure-widget', FileStructureWidget);