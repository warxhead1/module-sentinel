import { DashboardComponent, defineComponent } from './base-component.js';

interface SearchResult {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  score: number;
  context?: string;
  signature?: string;
  namespace?: string;
}

export class SearchInterface extends DashboardComponent {
  private searchQuery: string = '';
  private searchResults: SearchResult[] = [];
  private searchType: 'all' | 'function' | 'class' | 'variable' = 'all';
  private isSearching: boolean = false;
  private selectedResult: SearchResult | null = null;

  async loadData(): Promise<void> {
    // Check if there's a query in the URL
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query) {
      this.searchQuery = query;
      await this.performSearch();
    } else {
      this.render();
    }
  }

  private async performSearch() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.render();
      return;
    }

    this.isSearching = true;
    this.render();

    try {
      const params = new URLSearchParams({
        q: this.searchQuery,
        type: this.searchType
      });
      
      const response = await this.fetchAPI(`/api/search?${params}`);
      this.searchResults = response.results || [];
      this.isSearching = false;
      this.render();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.isSearching = false;
      this.render();
    }
  }

  render() {
    if (this._loading) {
      this.shadow.innerHTML = this.renderLoading();
      return;
    }

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 30px 40px;
          min-height: 100vh;
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
        
        .search-container {
          max-width: 800px;
          margin: 0 auto 40px;
        }
        
        .search-box {
          position: relative;
          margin-bottom: 20px;
        }
        
        .search-input {
          width: 100%;
          padding: 16px 50px 16px 20px;
          font-size: 1.1rem;
          background: rgba(0, 0, 0, 0.3);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 30px;
          color: #fff;
          outline: none;
          transition: all 0.3s ease;
        }
        
        .search-input:focus {
          border-color: #4ecdc4;
          background: rgba(0, 0, 0, 0.5);
        }
        
        .search-icon {
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          color: #4ecdc4;
          font-size: 20px;
          pointer-events: none;
        }
        
        .search-filters {
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        
        .filter-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #aaa;
          padding: 6px 16px;
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
        
        .results-container {
          max-width: 1000px;
          margin: 0 auto;
        }
        
        .results-info {
          margin-bottom: 20px;
          color: #888;
        }
        
        .searching {
          text-align: center;
          padding: 40px;
          color: #4ecdc4;
        }
        
        .search-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(78, 205, 196, 0.2);
          border-top-color: #4ecdc4;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .result-card {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 15px;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 1px solid transparent;
        }
        
        .result-card:hover {
          background: rgba(78, 205, 196, 0.05);
          border-color: rgba(78, 205, 196, 0.3);
          transform: translateX(5px);
        }
        
        .result-card.selected {
          background: rgba(78, 205, 196, 0.1);
          border-color: #4ecdc4;
        }
        
        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 10px;
        }
        
        .result-name {
          font-size: 1.2rem;
          color: #4ecdc4;
          font-weight: 500;
        }
        
        .result-type {
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.8rem;
          color: #aaa;
        }
        
        .result-type.function { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
        .result-type.class { background: rgba(78, 205, 196, 0.2); color: #4ecdc4; }
        .result-type.variable { background: rgba(255, 217, 61, 0.2); color: #ffd93d; }
        .result-type.namespace { background: rgba(81, 207, 102, 0.2); color: #51cf66; }
        
        .result-location {
          color: #888;
          font-size: 0.9rem;
          margin-bottom: 10px;
          font-family: 'Fira Code', monospace;
        }
        
        .result-signature {
          background: rgba(0, 0, 0, 0.3);
          padding: 10px;
          border-radius: 6px;
          font-family: 'Fira Code', monospace;
          font-size: 0.9rem;
          color: #e0e0e0;
          overflow-x: auto;
          margin-bottom: 10px;
        }
        
        .result-context {
          color: #aaa;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        
        .result-context mark {
          background: rgba(78, 205, 196, 0.3);
          color: #fff;
          padding: 2px 4px;
          border-radius: 3px;
        }
        
        .result-score {
          position: absolute;
          top: 20px;
          right: 20px;
          font-size: 0.8rem;
          color: #666;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px;
          color: #888;
        }
        
        .quick-search {
          background: rgba(78, 205, 196, 0.05);
          border: 1px solid rgba(78, 205, 196, 0.2);
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 30px;
        }
        
        .quick-search h3 {
          color: #4ecdc4;
          margin-bottom: 15px;
        }
        
        .quick-links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        
        .quick-link {
          background: rgba(0, 0, 0, 0.3);
          padding: 8px 16px;
          border-radius: 20px;
          color: #4ecdc4;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.9rem;
        }
        
        .quick-link:hover {
          background: rgba(78, 205, 196, 0.2);
          transform: translateY(-1px);
        }
      </style>
      
      <div class="page-header">
        <h1>Code Search</h1>
        <p class="subtitle">Find symbols, functions, and patterns across your codebase</p>
      </div>
      
      <div class="search-container">
        <div class="search-box">
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search for functions, classes, variables..."
            value="${this.searchQuery}"
            id="searchInput"
          />
          <span class="search-icon">🔍</span>
        </div>
        
        <div class="search-filters">
          <button class="filter-btn ${this.searchType === 'all' ? 'active' : ''}" 
                  data-type="all">All</button>
          <button class="filter-btn ${this.searchType === 'function' ? 'active' : ''}" 
                  data-type="function">Functions</button>
          <button class="filter-btn ${this.searchType === 'class' ? 'active' : ''}" 
                  data-type="class">Classes</button>
          <button class="filter-btn ${this.searchType === 'variable' ? 'active' : ''}" 
                  data-type="variable">Variables</button>
        </div>
      </div>
      
      <div class="results-container">
        ${!this.searchQuery && !this.isSearching ? `
          <div class="quick-search">
            <h3>Quick Searches</h3>
            <div class="quick-links">
              <span class="quick-link" data-search="TODO">TODOs</span>
              <span class="quick-link" data-search="FIXME">FIXMEs</span>
              <span class="quick-link" data-search="deprecated">Deprecated</span>
              <span class="quick-link" data-search="test">Tests</span>
              <span class="quick-link" data-search="error">Error handling</span>
              <span class="quick-link" data-search="async">Async functions</span>
            </div>
          </div>
        ` : ''}
        
        ${this.isSearching ? `
          <div class="searching">
            <div class="search-spinner"></div>
            <p>Searching...</p>
          </div>
        ` : ''}
        
        ${!this.isSearching && this.searchQuery && this.searchResults.length > 0 ? `
          <div class="results-info">
            Found ${this.searchResults.length} results for "${this.searchQuery}"
          </div>
          
          ${this.searchResults.map(result => `
            <div class="result-card ${this.selectedResult?.id === result.id ? 'selected' : ''}" 
                 data-result="${result.id}">
              <div class="result-header">
                <div class="result-name">${result.name}</div>
                <div class="result-type ${result.type}">${result.type}</div>
              </div>
              
              <div class="result-location">
                ${result.file}:${result.line}
                ${result.namespace ? ` • ${result.namespace}` : ''}
              </div>
              
              ${result.signature ? `
                <div class="result-signature">${result.signature}</div>
              ` : ''}
              
              ${result.context ? `
                <div class="result-context">${this.highlightMatch(result.context)}</div>
              ` : ''}
            </div>
          `).join('')}
        ` : ''}
        
        ${!this.isSearching && this.searchQuery && this.searchResults.length === 0 ? `
          <div class="empty-state">
            <h2>No results found</h2>
            <p>Try a different search term or filter</p>
          </div>
        ` : ''}
        
        ${this._error ? `
          <div class="empty-state">
            <h2>Search error</h2>
            <p>${this._error}</p>
          </div>
        ` : ''}
      </div>
    `;

    // Add event listeners
    this.attachEventListeners();
  }

  private highlightMatch(text: string): string {
    if (!this.searchQuery) return text;
    
    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private attachEventListeners() {
    // Search input
    const searchInput = this.shadow.getElementById('searchInput') as HTMLInputElement;
    if (searchInput) {
      let debounceTimer: any;
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.performSearch();
        }, 300);
      });
      
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(debounceTimer);
          this.performSearch();
        }
      });
    }

    // Filter buttons
    this.shadow.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = (e.target as HTMLElement).getAttribute('data-type');
        if (type) {
          this.searchType = type as any;
          if (this.searchQuery) {
            this.performSearch();
          } else {
            this.render();
          }
        }
      });
    });

    // Quick search links
    this.shadow.querySelectorAll('.quick-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const search = (e.target as HTMLElement).getAttribute('data-search');
        if (search) {
          this.searchQuery = search;
          this.performSearch();
        }
      });
    });

    // Result cards
    this.shadow.querySelectorAll('.result-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const resultId = (e.currentTarget as HTMLElement).getAttribute('data-result');
        const result = this.searchResults.find(r => r.id === resultId);
        if (result) {
          this.selectedResult = result;
          this.emit('result-selected', { 
            file: result.file, 
            line: result.line,
            name: result.name 
          });
          this.render();
        }
      });
    });
  }
}

defineComponent('search-interface', SearchInterface);