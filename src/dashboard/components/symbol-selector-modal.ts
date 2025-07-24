import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';
import { debounce } from '../utils/performance.js';

interface Symbol {
  id: number;
  name: string;
  qualified_name: string;
  kind: string;
  namespace: string;
  file_path: string;
  language_id?: number;
}

interface SymbolSelectorOptions {
  title?: string;
  filter?: (symbol: Symbol) => boolean;
  onSelect: (symbol: Symbol) => void;
  onCancel?: () => void;
}

/**
 * Global Symbol Selector Modal
 * A beautiful, responsive modal for selecting symbols across the application
 */
export class SymbolSelectorModal extends DashboardComponent {
  private static instance: SymbolSelectorModal | null = null;
  private options: SymbolSelectorOptions | null = null;
  private searchResults: Symbol[] = [];
  private recentSymbols: Symbol[] = [];
  private selectedIndex: number = 0;
  
  constructor() {
    super();
    // Load recent symbols from state
    this.recentSymbols = stateService.getState('recentSymbols') || [];
  }

  static getInstance(): SymbolSelectorModal {
    if (!SymbolSelectorModal.instance) {
      SymbolSelectorModal.instance = new SymbolSelectorModal();
      document.body.appendChild(SymbolSelectorModal.instance);
    }
    return SymbolSelectorModal.instance;
  }

  async loadData(): Promise<void> {
    // Data is loaded on demand during search
  }

  show(options: SymbolSelectorOptions) {
    this.options = options;
    this.searchResults = [];
    this.selectedIndex = 0;
    this.render();
    
    // Show modal with animation
    requestAnimationFrame(() => {
      const modal = this.shadow.querySelector('.modal');
      const backdrop = this.shadow.querySelector('.backdrop');
      if (modal && backdrop) {
        backdrop.classList.add('visible');
        modal.classList.add('visible');
      }
      
      // Focus search input
      const searchInput = this.shadow.querySelector('input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    });
  }

  hide() {
    const modal = this.shadow.querySelector('.modal');
    const backdrop = this.shadow.querySelector('.backdrop');
    
    if (modal && backdrop) {
      modal.classList.remove('visible');
      backdrop.classList.remove('visible');
      
      // Clean up after animation
      setTimeout(() => {
        this.options = null;
        this.searchResults = [];
        this.render();
      }, 300);
    }
  }

  render() {
    if (!this.options) {
      this.shadow.innerHTML = '';
      return;
    }

    const title = this.options.title || 'Select Symbol';
    
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 9999;
          pointer-events: none;
        }

        .backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: all;
        }

        .backdrop.visible {
          opacity: 1;
        }

        .modal {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.9);
          width: 90%;
          max-width: 800px;
          max-height: 80vh;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          opacity: 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: all;
          display: flex;
          flex-direction: column;
        }

        .modal.visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }

        .header {
          padding: 24px;
          border-bottom: 1px solid var(--card-border);
        }

        .title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--primary-accent);
          margin: 0;
        }

        .search-section {
          padding: 20px 24px;
          border-bottom: 1px solid var(--card-border);
        }

        .search-input {
          width: 100%;
          padding: 12px 16px 12px 48px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 1rem;
          transition: all 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary-accent);
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 3px rgba(147, 112, 219, 0.1);
        }

        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 1.2rem;
          opacity: 0.6;
        }

        .search-wrapper {
          position: relative;
        }

        .content {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .section {
          padding: 20px 24px;
        }

        .section-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 12px 0;
        }

        .symbol-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .symbol-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .symbol-item:hover {
          background: rgba(147, 112, 219, 0.1);
          border-color: var(--primary-accent);
          transform: translateX(4px);
        }

        .symbol-item.selected {
          background: rgba(147, 112, 219, 0.2);
          border-color: var(--primary-accent);
          box-shadow: 0 0 0 3px rgba(147, 112, 219, 0.1);
        }

        .symbol-icon {
          font-size: 1.2rem;
          margin-right: 12px;
          opacity: 0.8;
        }

        .symbol-info {
          flex: 1;
          min-width: 0;
        }

        .symbol-name {
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .symbol-details {
          font-size: 0.85rem;
          color: var(--text-muted);
          display: flex;
          gap: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .symbol-namespace {
          color: #4ecdc4;
        }

        .symbol-kind {
          color: #ff6b6b;
        }

        .symbol-path {
          opacity: 0.6;
        }

        .empty-state {
          text-align: center;
          padding: 60px 24px;
          color: var(--text-muted);
        }

        .empty-state-icon {
          font-size: 3rem;
          opacity: 0.3;
          margin-bottom: 16px;
        }

        .footer {
          padding: 16px 24px;
          border-top: 1px solid var(--card-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .shortcuts {
          display: flex;
          gap: 16px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .shortcut {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .key {
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid var(--card-border);
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.8rem;
        }

        .actions {
          display: flex;
          gap: 12px;
        }

        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid var(--card-border);
          background: transparent;
          color: var(--text-primary);
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-1px);
        }

        .btn-primary {
          background: var(--primary-accent);
          border-color: var(--primary-accent);
          color: var(--primary-bg);
        }

        .btn-primary:hover {
          background: var(--primary-accent-hover);
          box-shadow: 0 4px 12px rgba(147, 112, 219, 0.3);
        }

        /* Loading state */
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          color: var(--text-muted);
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--card-border);
          border-top-color: var(--primary-accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 12px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>

      <div class="backdrop" onclick="this.getRootNode().host.handleCancel()"></div>
      <div class="modal">
        <div class="header">
          <h2 class="title">${title}</h2>
        </div>

        <div class="search-section">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input 
              type="text" 
              class="search-input" 
              placeholder="Search symbols by name, namespace, or file..."
              oninput="this.getRootNode().host.handleSearch(this.value)"
              onkeydown="this.getRootNode().host.handleKeyDown(event)"
            />
          </div>
        </div>

        <div class="content">
          ${this._loading ? this.renderLoading() : this.renderSymbols()}
        </div>

        <div class="footer">
          <div class="shortcuts">
            <div class="shortcut">
              <span class="key">↑↓</span>
              <span>Navigate</span>
            </div>
            <div class="shortcut">
              <span class="key">Enter</span>
              <span>Select</span>
            </div>
            <div class="shortcut">
              <span class="key">Esc</span>
              <span>Cancel</span>
            </div>
          </div>
          <div class="actions">
            <button class="btn" onclick="this.getRootNode().host.handleCancel()">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;
  }

  protected renderLoading(): string {
    return `
      <div class="loading">
        <div class="spinner"></div>
        <span>Searching...</span>
      </div>
    `;
  }

  private renderSymbols(): string {
    const hasSearchResults = this.searchResults.length > 0;
    const hasRecentSymbols = this.recentSymbols.length > 0 && !this._loading;

    if (!hasSearchResults && !hasRecentSymbols) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>Start typing to search for symbols</p>
        </div>
      `;
    }

    let html = '';

    if (hasSearchResults) {
      html += `
        <div class="section">
          <h3 class="section-title">Search Results</h3>
          <div class="symbol-list">
            ${this.searchResults.map((symbol, index) => this.renderSymbolItem(symbol, index)).join('')}
          </div>
        </div>
      `;
    }

    if (hasRecentSymbols && !hasSearchResults) {
      html += `
        <div class="section">
          <h3 class="section-title">Recent Symbols</h3>
          <div class="symbol-list">
            ${this.recentSymbols.slice(0, 5).map((symbol, index) => 
              this.renderSymbolItem(symbol, hasSearchResults ? index + this.searchResults.length : index)
            ).join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  private renderSymbolItem(symbol: Symbol, index: number): string {
    const icon = this.getSymbolIcon(symbol.kind);
    const isSelected = index === this.selectedIndex;
    
    return `
      <div class="symbol-item ${isSelected ? 'selected' : ''}" 
           data-index="${index}"
           onclick="this.getRootNode().host.selectSymbol(${index})">
        <span class="symbol-icon">${icon}</span>
        <div class="symbol-info">
          <div class="symbol-name">${symbol.name}</div>
          <div class="symbol-details">
            <span class="symbol-namespace">${symbol.namespace || 'global'}</span>
            <span class="symbol-kind">${symbol.kind}</span>
            <span class="symbol-path">${this.formatPath(symbol.file_path)}</span>
          </div>
        </div>
      </div>
    `;
  }

  private getSymbolIcon(kind: string): string {
    const icons: Record<string, string> = {
      'class': '🏛️',
      'function': '⚡',
      'method': '🔧',
      'variable': '📦',
      'namespace': '📁',
      'interface': '🔌',
      'enum': '🎯',
      'struct': '🏗️',
      'module': '📦',
      'typedef': '🏷️'
    };
    return icons[kind] || '📄';
  }

  private formatPath(path: string): string {
    const parts = path.split('/');
    if (parts.length > 3) {
      return `.../${parts.slice(-2).join('/')}`;
    }
    return path;
  }

  private debouncedSearch = debounce(async (query: string) => {
    if (!query.trim()) {
      this.searchResults = [];
      this.selectedIndex = 0;
      this._loading = false;
      this.updateContent();
      return;
    }

    this._loading = true;
    this.updateContent();

    try {
      const response = await dataService.fetch(`/api/symbols?q=${encodeURIComponent(query)}&limit=20`);
      
      if (response.success && response.data) {
        this.searchResults = response.data;
        
        // Apply custom filter if provided
        if (this.options?.filter) {
          this.searchResults = this.searchResults.filter(this.options.filter);
        }
        
        this.selectedIndex = 0;
      }
    } catch (error) {
      // Don't log aborted requests as errors
      if (error instanceof Error && error.name === 'AbortError') {
        this._loading = false;
        return;
      }
      
      console.error('Symbol search failed:', error);
      this.searchResults = [];
    }

    this._loading = false;
    this.updateContent();
  }, 300);

  handleSearch(value: string) {
    this.debouncedSearch(value);
  }

  private updateContent() {
    const contentDiv = this.shadow.querySelector('.content');
    if (!contentDiv) return;

    // Only update the content area, not the entire modal
    contentDiv.innerHTML = this._loading ? this.renderLoading() : this.renderSymbols();
  }

  handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.confirmSelection();
        break;
      case 'Escape':
        event.preventDefault();
        this.handleCancel();
        break;
    }
  }

  private moveSelection(delta: number) {
    const totalItems = this.searchResults.length + 
      (this.searchResults.length === 0 ? Math.min(this.recentSymbols.length, 5) : 0);
    
    if (totalItems === 0) return;

    this.selectedIndex = Math.max(0, Math.min(totalItems - 1, this.selectedIndex + delta));
    
    // Update UI
    const items = this.shadow.querySelectorAll('.symbol-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });

    // Scroll selected item into view
    const selectedItem = items[this.selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  selectSymbol(index: number) {
    this.selectedIndex = index;
    this.confirmSelection();
  }

  private confirmSelection() {
    let selectedSymbol: Symbol | undefined;
    
    if (this.searchResults.length > 0) {
      selectedSymbol = this.searchResults[this.selectedIndex];
    } else if (this.recentSymbols.length > 0) {
      selectedSymbol = this.recentSymbols[this.selectedIndex];
    }

    if (selectedSymbol && this.options?.onSelect) {
      // Update recent symbols
      this.updateRecentSymbols(selectedSymbol);
      
      // Call callback
      this.options.onSelect(selectedSymbol);
      
      // Close modal
      this.hide();
    }
  }

  private updateRecentSymbols(symbol: Symbol) {
    // Remove if already in list
    this.recentSymbols = this.recentSymbols.filter(s => s.id !== symbol.id);
    
    // Add to front
    this.recentSymbols.unshift(symbol);
    
    // Keep only last 10
    this.recentSymbols = this.recentSymbols.slice(0, 10);
    
    // Save to state
    stateService.setState('recentSymbols', this.recentSymbols);
  }

  handleCancel() {
    if (this.options?.onCancel) {
      this.options.onCancel();
    }
    this.hide();
  }
}

// Define custom element
defineComponent('symbol-selector-modal', SymbolSelectorModal);

// Export singleton instance getter
export function showSymbolSelector(options: SymbolSelectorOptions) {
  const modal = SymbolSelectorModal.getInstance();
  modal.show(options);
}