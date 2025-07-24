import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';

/**
 * Graph Filter Sidebar Component
 * Provides interactive controls for filtering the relationship graph
 */
export class GraphFilterSidebar extends DashboardComponent {
  private filters = {
    nodeTypes: new Set<string>(['all']),
    edgeTypes: new Set<string>(['all']),
    languages: new Set<string>(['all']),
    namespaces: new Set<string>(['all']),
    metrics: {
      minLoc: 0,
      maxLoc: 10000,
      minComplexity: 0,
      maxComplexity: 100
    },
    showCrossLanguage: true,
    showGroupNodes: true,
    densityThreshold: 50 // Hide nodes with more than X connections
  };

  private availableFilters = {
    nodeTypes: ['class', 'function', 'namespace', 'module', 'variable', 'enum'],
    edgeTypes: ['calls', 'inherits', 'uses', 'includes', 'spawns', 'imports'],
    languages: ['cpp', 'python', 'typescript', 'javascript']
  };

  async loadData(): Promise<void> {
    try {
      // Load available namespaces and languages from the API
      const [namespaces, languages] = await Promise.all([
        dataService.getNamespaces(),
        dataService.getLanguages()
      ]);

      if (namespaces && namespaces.length > 0) {
        this.availableFilters.nodeTypes = [...new Set(namespaces.flatMap(ns => 
          ns.kinds ? ns.kinds.split(',') : []
        ))].filter(Boolean);
      }

      if (languages && languages.length > 0) {
        this.availableFilters.languages = languages.map(l => l.name);
      }

      this.render();
    } catch (error) {
      // Ignore abort errors - they're expected when navigating away
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to load filter options:', error);
      this.render();
    }
  }

  render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--border-radius);
          padding: 20px;
          height: 100%;
          overflow-y: auto;
          backdrop-filter: blur(20px);
        }

        h3 {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--primary-accent);
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .filter-section {
          margin-bottom: 25px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(147, 112, 219, 0.2);
        }

        .filter-section:last-child {
          border-bottom: none;
        }

        .filter-section h4 {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .filter-item {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .filter-item:hover {
          transform: translateX(3px);
        }

        .filter-item input[type="checkbox"] {
          appearance: none;
          width: 16px;
          height: 16px;
          border: 2px solid var(--primary-accent);
          border-radius: 3px;
          background: transparent;
          cursor: pointer;
          position: relative;
          transition: var(--transition-smooth);
        }

        .filter-item input[type="checkbox"]:checked {
          background: var(--primary-accent);
        }

        .filter-item input[type="checkbox"]:checked::after {
          content: '✓';
          position: absolute;
          top: -2px;
          left: 2px;
          color: var(--primary-bg);
          font-size: 12px;
          font-weight: bold;
        }

        .filter-item label {
          cursor: pointer;
          font-size: 0.9rem;
          color: var(--text-secondary);
          user-select: none;
          flex: 1;
        }

        .filter-count {
          font-size: 0.8rem;
          color: var(--text-muted);
          background: rgba(147, 112, 219, 0.2);
          padding: 2px 6px;
          border-radius: 10px;
        }

        .range-filter {
          margin-top: 10px;
        }

        .range-filter label {
          display: block;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }

        .range-slider {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .range-slider input[type="range"] {
          flex: 1;
          appearance: none;
          height: 4px;
          background: rgba(147, 112, 219, 0.3);
          border-radius: 2px;
          outline: none;
        }

        .range-slider input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          background: var(--primary-accent);
          border-radius: 50%;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .range-slider input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 10px var(--primary-accent);
        }

        .range-value {
          font-size: 0.85rem;
          color: var(--primary-accent);
          min-width: 45px;
          text-align: right;
        }

        .toggle-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(147, 112, 219, 0.3);
          transition: var(--transition-smooth);
          border-radius: 24px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: var(--text-primary);
          transition: var(--transition-smooth);
          border-radius: 50%;
        }

        .toggle-switch input:checked + .toggle-slider {
          background: var(--primary-accent);
        }

        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(20px);
        }

        .reset-button {
          width: 100%;
          padding: 10px;
          margin-top: 20px;
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          color: var(--primary-accent);
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: var(--transition-smooth);
        }

        .reset-button:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateY(-1px);
        }

        .density-info {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 5px;
        }
      </style>

      <h3>🎛️ Graph Filters</h3>

      ${this._loading ? this.renderLoading() : this._error ? this.renderError() : this.renderFilters()}
    `;
  }

  private renderFilters(): string {
    return `
      <!-- Node Type Filters -->
      <div class="filter-section">
        <h4>Node Types</h4>
        <div class="filter-group">
          <div class="filter-item">
            <input type="checkbox" id="filter-all-nodes" 
              ${this.filters.nodeTypes.has('all') ? 'checked' : ''}>
            <label for="filter-all-nodes">All Types</label>
          </div>
          ${this.availableFilters.nodeTypes.map(type => `
            <div class="filter-item">
              <input type="checkbox" id="filter-node-${type}" 
                data-filter-type="nodeType" data-filter-value="${type}"
                ${this.filters.nodeTypes.has(type) || this.filters.nodeTypes.has('all') ? 'checked' : ''}>
              <label for="filter-node-${type}">${this.capitalize(type)}</label>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Edge Type Filters -->
      <div class="filter-section">
        <h4>Edge Types</h4>
        <div class="filter-group">
          <div class="filter-item">
            <input type="checkbox" id="filter-all-edges" 
              ${this.filters.edgeTypes.has('all') ? 'checked' : ''}>
            <label for="filter-all-edges">All Types</label>
          </div>
          ${this.availableFilters.edgeTypes.map(type => `
            <div class="filter-item">
              <input type="checkbox" id="filter-edge-${type}" 
                data-filter-type="edgeType" data-filter-value="${type}"
                ${this.filters.edgeTypes.has(type) || this.filters.edgeTypes.has('all') ? 'checked' : ''}>
              <label for="filter-edge-${type}">${this.capitalize(type)}</label>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Language Filters -->
      <div class="filter-section">
        <h4>Languages</h4>
        <div class="filter-group">
          <div class="filter-item">
            <input type="checkbox" id="filter-all-languages" 
              ${this.filters.languages.has('all') ? 'checked' : ''}>
            <label for="filter-all-languages">All Languages</label>
          </div>
          ${this.availableFilters.languages.map(lang => `
            <div class="filter-item">
              <input type="checkbox" id="filter-lang-${lang}" 
                data-filter-type="language" data-filter-value="${lang}"
                ${this.filters.languages.has(lang) || this.filters.languages.has('all') ? 'checked' : ''}>
              <label for="filter-lang-${lang}">${this.getLanguageDisplayName(lang)}</label>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Metric Range Filters -->
      <div class="filter-section">
        <h4>Code Metrics</h4>
        
        <div class="range-filter">
          <label>Lines of Code (${this.filters.metrics.minLoc} - ${this.filters.metrics.maxLoc})</label>
          <div class="range-slider">
            <input type="range" id="filter-loc-min" min="0" max="10000" 
              value="${this.filters.metrics.minLoc}" step="10">
            <span class="range-value">${this.filters.metrics.minLoc}</span>
          </div>
          <div class="range-slider">
            <input type="range" id="filter-loc-max" min="0" max="10000" 
              value="${this.filters.metrics.maxLoc}" step="10">
            <span class="range-value">${this.filters.metrics.maxLoc}</span>
          </div>
        </div>

        <div class="range-filter">
          <label>Complexity (${this.filters.metrics.minComplexity} - ${this.filters.metrics.maxComplexity})</label>
          <div class="range-slider">
            <input type="range" id="filter-complexity-min" min="0" max="100" 
              value="${this.filters.metrics.minComplexity}">
            <span class="range-value">${this.filters.metrics.minComplexity}</span>
          </div>
          <div class="range-slider">
            <input type="range" id="filter-complexity-max" min="0" max="100" 
              value="${this.filters.metrics.maxComplexity}">
            <span class="range-value">${this.filters.metrics.maxComplexity}</span>
          </div>
        </div>
      </div>

      <!-- Toggle Options -->
      <div class="filter-section">
        <h4>Display Options</h4>
        
        <div class="toggle-section">
          <label for="toggle-cross-language">Show Cross-Language</label>
          <div class="toggle-switch">
            <input type="checkbox" id="toggle-cross-language" 
              ${this.filters.showCrossLanguage ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </div>
        </div>

        <div class="toggle-section">
          <label for="toggle-group-nodes">Show Group Nodes</label>
          <div class="toggle-switch">
            <input type="checkbox" id="toggle-group-nodes" 
              ${this.filters.showGroupNodes ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </div>
        </div>

        <div class="range-filter">
          <label>Density Threshold</label>
          <div class="range-slider">
            <input type="range" id="filter-density" min="10" max="200" 
              value="${this.filters.densityThreshold}">
            <span class="range-value">${this.filters.densityThreshold}</span>
          </div>
          <div class="density-info">Hide nodes with more than ${this.filters.densityThreshold} connections</div>
        </div>
      </div>

      <button class="reset-button" onclick="this.getRootNode().host.resetFilters()">
        Reset All Filters
      </button>
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    this.attachEventListeners();
  }

  private attachEventListeners() {
    // Debounce filter changes to avoid excessive updates
    let filterTimeout: any;
    const applyFilters = () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        this.emitFilterChange();
      }, 300);
    };

    // Checkbox listeners
    this.shadow.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.type === 'checkbox') {
        const filterType = target.dataset.filterType;
        const filterValue = target.dataset.filterValue;

        if (target.id === 'filter-all-nodes') {
          this.handleAllToggle('nodeTypes', target.checked);
        } else if (target.id === 'filter-all-edges') {
          this.handleAllToggle('edgeTypes', target.checked);
        } else if (target.id === 'filter-all-languages') {
          this.handleAllToggle('languages', target.checked);
        } else if (filterType && filterValue) {
          this.handleFilterToggle(filterType, filterValue, target.checked);
        } else if (target.id === 'toggle-cross-language') {
          this.filters.showCrossLanguage = target.checked;
        } else if (target.id === 'toggle-group-nodes') {
          this.filters.showGroupNodes = target.checked;
        }
        
        applyFilters();
      }
    });

    // Range slider listeners
    this.shadow.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.type === 'range') {
        const value = parseInt(target.value);
        const valueDisplay = target.nextElementSibling as HTMLElement;
        if (valueDisplay) {
          valueDisplay.textContent = value.toString();
        }

        switch (target.id) {
          case 'filter-loc-min':
            this.filters.metrics.minLoc = value;
            break;
          case 'filter-loc-max':
            this.filters.metrics.maxLoc = value;
            break;
          case 'filter-complexity-min':
            this.filters.metrics.minComplexity = value;
            break;
          case 'filter-complexity-max':
            this.filters.metrics.maxComplexity = value;
            break;
          case 'filter-density':
            this.filters.densityThreshold = value;
            const densityInfo = this.shadow.querySelector('.density-info');
            if (densityInfo) {
              densityInfo.textContent = `Hide nodes with more than ${value} connections`;
            }
            break;
        }

        applyFilters();
      }
    });
  }

  private handleAllToggle(filterCategory: 'nodeTypes' | 'edgeTypes' | 'languages', checked: boolean) {
    if (checked) {
      this.filters[filterCategory].clear();
      this.filters[filterCategory].add('all');
    } else {
      this.filters[filterCategory].clear();
    }
    this.render();
  }

  private handleFilterToggle(filterType: string, value: string, checked: boolean) {
    let category: 'nodeTypes' | 'edgeTypes' | 'languages' | null = null;
    
    switch (filterType) {
      case 'nodeType':
        category = 'nodeTypes';
        break;
      case 'edgeType':
        category = 'edgeTypes';
        break;
      case 'language':
        category = 'languages';
        break;
    }

    if (category) {
      if (checked) {
        this.filters[category].delete('all');
        this.filters[category].add(value);
      } else {
        this.filters[category].delete(value);
        if (this.filters[category].size === 0) {
          this.filters[category].add('all');
        }
      }
    }
  }

  private emitFilterChange() {
    const filterState = {
      nodeTypes: Array.from(this.filters.nodeTypes),
      edgeTypes: Array.from(this.filters.edgeTypes),
      languages: Array.from(this.filters.languages),
      namespaces: Array.from(this.filters.namespaces),
      metrics: { ...this.filters.metrics },
      showCrossLanguage: this.filters.showCrossLanguage,
      showGroupNodes: this.filters.showGroupNodes,
      densityThreshold: this.filters.densityThreshold
    };

    // Emit custom event
    this.dispatchEvent(new CustomEvent('filter-changed', {
      detail: filterState,
      bubbles: true,
      composed: true
    }));

    // Also update state service for cross-component communication
    stateService.setState('graphFilters', filterState);
  }

  resetFilters() {
    this.filters = {
      nodeTypes: new Set(['all']),
      edgeTypes: new Set(['all']),
      languages: new Set(['all']),
      namespaces: new Set(['all']),
      metrics: {
        minLoc: 0,
        maxLoc: 10000,
        minComplexity: 0,
        maxComplexity: 100
      },
      showCrossLanguage: true,
      showGroupNodes: true,
      densityThreshold: 50
    };
    
    this.render();
    this.attachEventListeners();
    this.emitFilterChange();
  }

  private capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private getLanguageDisplayName(lang: string): string {
    if (!lang) return 'Unknown';
    const displayNames: Record<string, string> = {
      cpp: 'C++',
      python: 'Python',
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      rust: 'Rust',
      go: 'Go',
      java: 'Java'
    };
    return displayNames[lang] || this.capitalize(lang);
  }
}

defineComponent('graph-filter-sidebar', GraphFilterSidebar);