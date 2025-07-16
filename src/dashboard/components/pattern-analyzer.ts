import { DashboardComponent, defineComponent } from './base-component.js';

interface Pattern {
  name: string;
  type: string;
  occurrences: number;
  files: string[];
  description?: string;
  severity?: 'low' | 'medium' | 'high';
}

export class PatternAnalyzer extends DashboardComponent {
  private patterns: Pattern[] = [];
  private selectedPattern: Pattern | null = null;
  private filterType: string = 'all';

  async loadData(): Promise<void> {
    try {
      const response = await this.fetchAPI('/api/patterns');
      this.patterns = response.patterns || [];
      this.render();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    }
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

    const filteredPatterns = this.filterPatterns();
    const stats = this.calculateStats();

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 30px 40px;
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
        
        .filter-bar {
          display: flex;
          gap: 10px;
          margin-bottom: 30px;
        }
        
        .filter-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #aaa;
          padding: 8px 20px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
        }
        
        .filter-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .filter-btn.active {
          background: rgba(78, 205, 196, 0.2);
          border-color: #4ecdc4;
          color: #4ecdc4;
        }
        
        .stats-row {
          display: flex;
          gap: 30px;
          margin-bottom: 30px;
        }
        
        .stat-card {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
          flex: 1;
        }
        
        .stat-value {
          font-size: 2.5rem;
          font-weight: 300;
          color: #4ecdc4;
        }
        
        .stat-label {
          color: #888;
          margin-top: 5px;
        }
        
        .patterns-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }
        
        .pattern-card {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 1px solid transparent;
        }
        
        .pattern-card:hover {
          background: rgba(78, 205, 196, 0.05);
          border-color: rgba(78, 205, 196, 0.3);
          transform: translateY(-2px);
        }
        
        .pattern-card.selected {
          background: rgba(78, 205, 196, 0.1);
          border-color: #4ecdc4;
        }
        
        .pattern-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 10px;
        }
        
        .pattern-name {
          font-size: 1.2rem;
          color: #4ecdc4;
          font-weight: 500;
        }
        
        .pattern-type {
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.8rem;
          color: #aaa;
        }
        
        .pattern-type.architectural {
          background: rgba(78, 205, 196, 0.2);
          color: #4ecdc4;
        }
        
        .pattern-type.anti-pattern {
          background: rgba(255, 107, 107, 0.2);
          color: #ff6b6b;
        }
        
        .pattern-type.performance {
          background: rgba(255, 217, 61, 0.2);
          color: #ffd93d;
        }
        
        .pattern-description {
          color: #aaa;
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 15px;
        }
        
        .pattern-stats {
          display: flex;
          gap: 20px;
          font-size: 0.9rem;
          color: #888;
        }
        
        .severity {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 5px;
        }
        
        .severity.low { background: #51cf66; }
        .severity.medium { background: #ffd93d; }
        .severity.high { background: #ff6b6b; }
        
        .pattern-details {
          position: fixed;
          top: 0;
          right: -400px;
          width: 400px;
          height: 100vh;
          background: rgba(0, 0, 0, 0.95);
          box-shadow: -5px 0 20px rgba(0, 0, 0, 0.5);
          transition: right 0.3s ease;
          overflow-y: auto;
          z-index: 100;
        }
        
        .pattern-details.open {
          right: 0;
        }
        
        .details-header {
          padding: 30px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .details-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: none;
          border: none;
          color: #888;
          font-size: 24px;
          cursor: pointer;
          transition: color 0.2s ease;
        }
        
        .details-close:hover {
          color: #fff;
        }
        
        .details-content {
          padding: 30px;
        }
        
        .file-list {
          max-height: 300px;
          overflow-y: auto;
        }
        
        .file-item {
          padding: 8px 0;
          color: #4ecdc4;
          font-size: 0.9rem;
          cursor: pointer;
          transition: color 0.2s ease;
        }
        
        .file-item:hover {
          color: #44a08d;
          text-decoration: underline;
        }
      </style>
      
      <div class="page-header">
        <h1>Pattern Analysis</h1>
        <p class="subtitle">Architectural patterns and anti-patterns detected in your codebase</p>
      </div>
      
      <div class="filter-bar">
        <button class="filter-btn ${this.filterType === 'all' ? 'active' : ''}" 
                data-filter="all">All Patterns</button>
        <button class="filter-btn ${this.filterType === 'architectural' ? 'active' : ''}" 
                data-filter="architectural">Architectural</button>
        <button class="filter-btn ${this.filterType === 'anti-pattern' ? 'active' : ''}" 
                data-filter="anti-pattern">Anti-patterns</button>
        <button class="filter-btn ${this.filterType === 'performance' ? 'active' : ''}" 
                data-filter="performance">Performance</button>
      </div>
      
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">Total Patterns</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.antiPatterns}</div>
          <div class="stat-label">Anti-patterns</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.highSeverity}</div>
          <div class="stat-label">High Severity</div>
        </div>
      </div>
      
      <div class="patterns-grid">
        ${filteredPatterns.map(pattern => `
          <div class="pattern-card ${this.selectedPattern?.name === pattern.name ? 'selected' : ''}" 
               data-pattern="${pattern.name}">
            <div class="pattern-header">
              <div class="pattern-name">${pattern.name}</div>
              <div class="pattern-type ${pattern.type}">${pattern.type.replace('-', ' ')}</div>
            </div>
            ${pattern.description ? `
              <div class="pattern-description">${pattern.description}</div>
            ` : ''}
            <div class="pattern-stats">
              <span>${pattern.occurrences} occurrences</span>
              <span>${pattern.files.length} files</span>
              ${pattern.severity ? `
                <span><span class="severity ${pattern.severity}"></span>${pattern.severity}</span>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="pattern-details ${this.selectedPattern ? 'open' : ''}" id="patternDetails">
        ${this.selectedPattern ? this.renderPatternDetails() : ''}
      </div>
    `;

    // Add event listeners
    this.attachEventListeners();
  }

  private filterPatterns(): Pattern[] {
    if (this.filterType === 'all') {
      return this.patterns;
    }
    return this.patterns.filter(p => p.type === this.filterType);
  }

  private calculateStats() {
    return {
      total: this.patterns.length,
      antiPatterns: this.patterns.filter(p => p.type === 'anti-pattern').length,
      highSeverity: this.patterns.filter(p => p.severity === 'high').length
    };
  }

  private renderPatternDetails(): string {
    if (!this.selectedPattern) return '';

    return `
      <div class="details-header">
        <button class="details-close" id="closeDetails">✕</button>
        <h2>${this.selectedPattern.name}</h2>
        <div class="pattern-type ${this.selectedPattern.type}">
          ${this.selectedPattern.type.replace('-', ' ')}
        </div>
      </div>
      
      <div class="details-content">
        ${this.selectedPattern.description ? `
          <div style="margin-bottom: 30px;">
            <h3>Description</h3>
            <p style="color: #aaa; line-height: 1.6;">
              ${this.selectedPattern.description}
            </p>
          </div>
        ` : ''}
        
        <div style="margin-bottom: 30px;">
          <h3>Statistics</h3>
          <div style="display: flex; gap: 20px; margin-top: 10px;">
            <div>
              <div style="font-size: 2rem; color: #4ecdc4;">
                ${this.selectedPattern.occurrences}
              </div>
              <div style="color: #888; font-size: 0.9rem;">Occurrences</div>
            </div>
            ${this.selectedPattern.severity ? `
              <div>
                <div style="font-size: 2rem; color: #4ecdc4;">
                  ${this.selectedPattern.severity}
                </div>
                <div style="color: #888; font-size: 0.9rem;">Severity</div>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div>
          <h3>Affected Files (${this.selectedPattern.files.length})</h3>
          <div class="file-list">
            ${this.selectedPattern.files.map(file => `
              <div class="file-item" data-file="${file}">${file}</div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners() {
    // Filter buttons
    this.shadow.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = (e.target as HTMLElement).getAttribute('data-filter');
        if (filter) {
          this.filterType = filter;
          this.render();
        }
      });
    });

    // Pattern cards
    this.shadow.querySelectorAll('.pattern-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const patternName = (e.currentTarget as HTMLElement).getAttribute('data-pattern');
        const pattern = this.patterns.find(p => p.name === patternName);
        if (pattern) {
          this.selectedPattern = pattern;
          this.render();
        }
      });
    });

    // Close details button
    const closeBtn = this.shadow.getElementById('closeDetails');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.selectedPattern = null;
        this.render();
      });
    }

    // File links
    this.shadow.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const file = (e.target as HTMLElement).getAttribute('data-file');
        this.emit('file-selected', { file });
      });
    });
  }
}

defineComponent('pattern-analyzer', PatternAnalyzer);