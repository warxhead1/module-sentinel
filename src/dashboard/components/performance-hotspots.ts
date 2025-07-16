import { DashboardComponent, defineComponent } from './base-component.js';

interface Hotspot {
  id: string;
  name: string;
  file: string;
  line: number;
  type: 'cpu' | 'memory' | 'io' | 'complexity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  details: {
    cyclomatic?: number;
    loopDepth?: number;
    callCount?: number;
    allocations?: number;
    [key: string]: any;
  };
}

export class PerformanceHotspots extends DashboardComponent {
  private hotspots: Hotspot[] = [];
  private selectedHotspot: Hotspot | null = null;
  private filterType: string = 'all';
  private sortBy: 'severity' | 'score' | 'file' = 'severity';

  async loadData(): Promise<void> {
    try {
      const response = await this.fetchAPI('/api/performance/hotspots');
      this.hotspots = response.hotspots || [];
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

    const filteredHotspots = this.filterAndSortHotspots();

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
        
        .controls-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }
        
        .filter-group {
          display: flex;
          gap: 10px;
        }
        
        .filter-btn, .sort-select {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #aaa;
          padding: 8px 20px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
        }
        
        .filter-btn:hover, .sort-select:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .filter-btn.active {
          background: rgba(78, 205, 196, 0.2);
          border-color: #4ecdc4;
          color: #4ecdc4;
        }
        
        .sort-select {
          background: rgba(0, 0, 0, 0.3);
          padding: 8px 15px;
          outline: none;
        }
        
        .hotspots-grid {
          display: grid;
          gap: 20px;
        }
        
        .hotspot-card {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 25px;
          cursor: pointer;
          transition: all 0.3s ease;
          border-left: 4px solid transparent;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 20px;
          align-items: center;
        }
        
        .hotspot-card.severity-critical {
          border-left-color: #ff4757;
        }
        
        .hotspot-card.severity-high {
          border-left-color: #ff6b6b;
        }
        
        .hotspot-card.severity-medium {
          border-left-color: #ffd93d;
        }
        
        .hotspot-card.severity-low {
          border-left-color: #51cf66;
        }
        
        .hotspot-card:hover {
          background: rgba(78, 205, 196, 0.05);
          transform: translateX(5px);
        }
        
        .hotspot-info {
          display: grid;
          gap: 10px;
        }
        
        .hotspot-name {
          font-size: 1.2rem;
          color: #4ecdc4;
          font-weight: 500;
        }
        
        .hotspot-location {
          color: #888;
          font-size: 0.9rem;
          font-family: 'Fira Code', monospace;
        }
        
        .hotspot-details {
          display: flex;
          gap: 20px;
          margin-top: 10px;
        }
        
        .detail-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #aaa;
          font-size: 0.9rem;
        }
        
        .type-badge {
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.8rem;
          color: #aaa;
        }
        
        .type-badge.cpu { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
        .type-badge.memory { background: rgba(108, 92, 231, 0.2); color: #6c5ce7; }
        .type-badge.io { background: rgba(81, 207, 102, 0.2); color: #51cf66; }
        .type-badge.complexity { background: rgba(255, 217, 61, 0.2); color: #ffd93d; }
        
        .hotspot-score {
          text-align: center;
        }
        
        .score-value {
          font-size: 2rem;
          font-weight: 300;
          color: #4ecdc4;
        }
        
        .score-label {
          color: #888;
          font-size: 0.8rem;
          margin-top: 5px;
        }
        
        .severity-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: uppercase;
          margin-top: 10px;
        }
        
        .severity-badge.critical {
          background: rgba(255, 71, 87, 0.2);
          color: #ff4757;
        }
        
        .severity-badge.high {
          background: rgba(255, 107, 107, 0.2);
          color: #ff6b6b;
        }
        
        .severity-badge.medium {
          background: rgba(255, 217, 61, 0.2);
          color: #ffd93d;
        }
        
        .severity-badge.low {
          background: rgba(81, 207, 102, 0.2);
          color: #51cf66;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px;
          color: #888;
        }
        
        .optimization-tips {
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 10px;
          padding: 20px;
          margin-top: 30px;
        }
        
        .optimization-tips h3 {
          color: #4ecdc4;
          margin-bottom: 15px;
        }
        
        .tip-list {
          display: grid;
          gap: 10px;
        }
        
        .tip-item {
          display: flex;
          align-items: start;
          gap: 10px;
          color: #aaa;
          line-height: 1.5;
        }
        
        .tip-icon {
          color: #4ecdc4;
          flex-shrink: 0;
        }
      </style>
      
      <div class="page-header">
        <h1>Performance Hotspots</h1>
        <p class="subtitle">Identify and optimize performance bottlenecks in your code</p>
      </div>
      
      <div class="controls-bar">
        <div class="filter-group">
          <button class="filter-btn ${this.filterType === 'all' ? 'active' : ''}" 
                  data-filter="all">All Types</button>
          <button class="filter-btn ${this.filterType === 'cpu' ? 'active' : ''}" 
                  data-filter="cpu">CPU</button>
          <button class="filter-btn ${this.filterType === 'memory' ? 'active' : ''}" 
                  data-filter="memory">Memory</button>
          <button class="filter-btn ${this.filterType === 'io' ? 'active' : ''}" 
                  data-filter="io">I/O</button>
          <button class="filter-btn ${this.filterType === 'complexity' ? 'active' : ''}" 
                  data-filter="complexity">Complexity</button>
        </div>
        
        <select class="sort-select" id="sortSelect">
          <option value="severity" ${this.sortBy === 'severity' ? 'selected' : ''}>Sort by Severity</option>
          <option value="score" ${this.sortBy === 'score' ? 'selected' : ''}>Sort by Score</option>
          <option value="file" ${this.sortBy === 'file' ? 'selected' : ''}>Sort by File</option>
        </select>
      </div>
      
      ${filteredHotspots.length > 0 ? `
        <div class="hotspots-grid">
          ${filteredHotspots.map(hotspot => `
            <div class="hotspot-card severity-${hotspot.severity}" 
                 data-hotspot="${hotspot.id}">
              <div class="hotspot-info">
                <div class="hotspot-name">${hotspot.name}</div>
                <div class="hotspot-location">${hotspot.file}:${hotspot.line}</div>
                <div class="hotspot-details">
                  <span class="type-badge ${hotspot.type}">${hotspot.type}</span>
                  ${this.renderHotspotDetails(hotspot)}
                </div>
              </div>
              
              <div class="hotspot-score">
                <div class="score-value">${hotspot.score}</div>
                <div class="score-label">Impact Score</div>
                <div class="severity-badge ${hotspot.severity}">${hotspot.severity}</div>
              </div>
            </div>
          `).join('')}
        </div>
        
        ${this.renderOptimizationTips(filteredHotspots)}
      ` : `
        <div class="empty-state">
          <h2>No performance hotspots detected</h2>
          <p>Your code is performing well! Keep up the good work.</p>
        </div>
      `}
    `;

    // Add event listeners
    this.attachEventListeners();
  }

  private filterAndSortHotspots(): Hotspot[] {
    let filtered = this.hotspots;
    
    // Apply filter
    if (this.filterType !== 'all') {
      filtered = filtered.filter(h => h.type === this.filterType);
    }
    
    // Apply sort
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    
    return filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'severity':
          return severityOrder[a.severity] - severityOrder[b.severity];
        case 'score':
          return b.score - a.score;
        case 'file':
          return a.file.localeCompare(b.file);
        default:
          return 0;
      }
    });
  }

  private renderHotspotDetails(hotspot: Hotspot): string {
    const details = [];
    
    if (hotspot.details.cyclomatic) {
      details.push(`<div class="detail-item">
        <span>🔄</span>
        <span>Complexity: ${hotspot.details.cyclomatic}</span>
      </div>`);
    }
    
    if (hotspot.details.loopDepth) {
      details.push(`<div class="detail-item">
        <span>🔁</span>
        <span>Loop depth: ${hotspot.details.loopDepth}</span>
      </div>`);
    }
    
    if (hotspot.details.allocations) {
      details.push(`<div class="detail-item">
        <span>💾</span>
        <span>${hotspot.details.allocations} allocations</span>
      </div>`);
    }
    
    if (hotspot.details.callCount) {
      details.push(`<div class="detail-item">
        <span>📞</span>
        <span>${hotspot.details.callCount} calls</span>
      </div>`);
    }
    
    return details.join('');
  }

  private renderOptimizationTips(hotspots: Hotspot[]): string {
    // Generate tips based on the types of hotspots found
    const tips = [];
    
    const hasCpuHotspots = hotspots.some(h => h.type === 'cpu');
    const hasMemoryHotspots = hotspots.some(h => h.type === 'memory');
    const hasComplexityHotspots = hotspots.some(h => h.type === 'complexity');
    
    if (hasCpuHotspots) {
      tips.push('Consider optimizing algorithms in CPU-intensive functions');
      tips.push('Look for opportunities to parallelize computations');
    }
    
    if (hasMemoryHotspots) {
      tips.push('Review memory allocation patterns and consider object pooling');
      tips.push('Check for memory leaks and unnecessary object creation');
    }
    
    if (hasComplexityHotspots) {
      tips.push('Refactor complex functions into smaller, more focused ones');
      tips.push('Consider simplifying deeply nested control structures');
    }
    
    if (tips.length === 0) return '';
    
    return `
      <div class="optimization-tips">
        <h3>Optimization Suggestions</h3>
        <div class="tip-list">
          ${tips.map(tip => `
            <div class="tip-item">
              <span class="tip-icon">💡</span>
              <span>${tip}</span>
            </div>
          `).join('')}
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

    // Sort select
    const sortSelect = this.shadow.getElementById('sortSelect') as HTMLSelectElement;
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = (e.target as HTMLSelectElement).value as any;
        this.render();
      });
    }

    // Hotspot cards
    this.shadow.querySelectorAll('.hotspot-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const hotspotId = (e.currentTarget as HTMLElement).getAttribute('data-hotspot');
        const hotspot = this.hotspots.find(h => h.id === hotspotId);
        if (hotspot) {
          this.emit('hotspot-selected', { 
            file: hotspot.file, 
            line: hotspot.line,
            name: hotspot.name 
          });
        }
      });
    });
  }
}

defineComponent('performance-hotspots', PerformanceHotspots);