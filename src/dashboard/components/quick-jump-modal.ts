import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { debounce } from '../utils/performance.js';
import { navigationContext } from '../utils/navigation-context.js';

interface QuickJumpItem {
  type: 'symbol' | 'file' | 'component' | 'recent';
  title: string;
  subtitle?: string;
  icon: string;
  action: () => void;
  keywords?: string[];
}

/**
 * Quick Jump Modal - Ctrl+K command palette
 */
export class QuickJumpModal extends DashboardComponent {
  private static instance: QuickJumpModal | null = null;
  private isOpen = false;
  private searchQuery = '';
  private items: QuickJumpItem[] = [];
  private filteredItems: QuickJumpItem[] = [];
  private selectedIndex = 0;
  
  constructor() {
    super();
    
    // Register keyboard shortcut
    window.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
  }
  
  static getInstance(): QuickJumpModal {
    if (!QuickJumpModal.instance) {
      QuickJumpModal.instance = new QuickJumpModal();
      document.body.appendChild(QuickJumpModal.instance);
    }
    return QuickJumpModal.instance;
  }
  
  async loadData(): Promise<void> {
    // Load available items
    await this.loadQuickJumpItems();
  }
  
  private async loadQuickJumpItems() {
    this.items = [];
    
    // Add component navigation items
    this.items.push(...this.getComponentItems());
    
    // Add recent navigation history
    this.items.push(...this.getRecentItems());
    
    // Add analysis tools
    this.items.push(...this.getAnalysisTools());
    
    // Initially show all items
    this.filteredItems = [...this.items];
  }
  
  private getComponentItems(): QuickJumpItem[] {
    return [
      {
        type: 'component',
        title: 'Overview',
        subtitle: 'Dashboard home',
        icon: '📊',
        action: () => this.navigateTo('/'),
        keywords: ['home', 'dashboard', 'overview']
      },
      {
        type: 'component',
        title: 'Relationships',
        subtitle: 'Dependency graph',
        icon: '🕸️',
        action: () => this.navigateTo('/relationships'),
        keywords: ['graph', 'dependencies', 'connections']
      },
      {
        type: 'component',
        title: 'Code Flow',
        subtitle: 'Control flow analysis',
        icon: '🌊',
        action: () => this.navigateTo('/code-flow'),
        keywords: ['flow', 'execution', 'control']
      },
      {
        type: 'component',
        title: 'Impact Analysis',
        subtitle: 'Change impact visualization',
        icon: '💥',
        action: () => this.navigateTo('/impact'),
        keywords: ['impact', 'changes', 'effects']
      },
      {
        type: 'component',
        title: 'Performance',
        subtitle: 'Performance hotspots',
        icon: '🔥',
        action: () => this.navigateTo('/performance'),
        keywords: ['performance', 'hotspots', 'optimization']
      },
      {
        type: 'component',
        title: 'Patterns',
        subtitle: 'Pattern analysis',
        icon: '🧩',
        action: () => this.navigateTo('/patterns'),
        keywords: ['patterns', 'anti-patterns', 'architecture']
      },
      {
        type: 'component',
        title: 'Multi-Language',
        subtitle: 'Cross-language analysis',
        icon: '🌍',
        action: () => this.navigateTo('/multi-language-flow'),
        keywords: ['language', 'cross-language', 'multi']
      }
    ];
  }
  
  private getRecentItems(): QuickJumpItem[] {
    const history = navigationContext.getHistory().slice(0, 5);
    
    return history.map(context => ({
      type: 'recent' as const,
      title: this.formatContextTitle(context),
      subtitle: `Recent • ${this.formatTimestamp(context.timestamp)}`,
      icon: '🕐',
      action: () => {
        navigationContext.setContext(context);
        window.location.hash = context.sourceRoute;
      },
      keywords: ['recent', 'history']
    }));
  }
  
  private getAnalysisTools(): QuickJumpItem[] {
    return [
      {
        type: 'symbol',
        title: 'Search Symbols',
        subtitle: 'Find symbols by name',
        icon: '🔍',
        action: () => this.showSymbolSearch(),
        keywords: ['search', 'find', 'symbol', 'function', 'class']
      },
      {
        type: 'file',
        title: 'Go to File',
        subtitle: 'Jump to a file',
        icon: '📄',
        action: () => this.showFileSearch(),
        keywords: ['file', 'open', 'goto']
      }
    ];
  }
  
  private formatContextTitle(context: any): string {
    if (context.selectedSymbol) {
      return `${context.selectedSymbol.name} in ${context.sourceComponent}`;
    }
    if (context.selectedFile) {
      const fileName = context.selectedFile.path.split('/').pop();
      return `${fileName} in ${context.sourceComponent}`;
    }
    return context.sourceComponent || 'Unknown';
  }
  
  private formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }
  
  private handleGlobalKeyDown(event: KeyboardEvent) {
    // Ctrl+K or Cmd+K
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.toggle();
    }
    
    // Escape to close
    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      this.close();
    }
  }
  
  show() {
    this.isOpen = true;
    this.searchQuery = '';
    this.selectedIndex = 0;
    this.loadData().then(() => {
      this.render();
      
      // Focus search input
      setTimeout(() => {
        const input = this.shadow.querySelector('input') as HTMLInputElement;
        if (input) input.focus();
      }, 50);
    });
  }
  
  close() {
    this.isOpen = false;
    this.render();
  }
  
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.show();
    }
  }
  
  render() {
    if (!this.isOpen) {
      this.shadow.innerHTML = '';
      return;
    }
    
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
          pointer-events: none;
        }
        
        .backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
          pointer-events: all;
          animation: fadeIn 0.2s ease;
        }
        
        .modal {
          position: absolute;
          top: 100px;
          left: 50%;
          transform: translateX(-50%);
          width: 90%;
          max-width: 600px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          pointer-events: all;
          animation: slideIn 0.2s ease;
          overflow: hidden;
        }
        
        .search-header {
          padding: 20px;
          border-bottom: 1px solid var(--card-border);
        }
        
        .search-input {
          width: 100%;
          padding: 12px 16px 12px 48px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 16px;
          transition: all 0.2s ease;
        }
        
        .search-input:focus {
          outline: none;
          border-color: var(--primary-accent);
          background: rgba(255, 255, 255, 0.08);
        }
        
        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 20px;
          opacity: 0.6;
        }
        
        .search-wrapper {
          position: relative;
        }
        
        .results {
          max-height: 400px;
          overflow-y: auto;
          padding: 8px;
        }
        
        .result-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          margin: 4px 0;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .result-item:hover,
        .result-item.selected {
          background: rgba(78, 205, 196, 0.1);
          border-color: rgba(78, 205, 196, 0.3);
          transform: translateX(4px);
        }
        
        .result-item.selected {
          box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.2);
        }
        
        .result-icon {
          font-size: 24px;
          margin-right: 16px;
          opacity: 0.8;
        }
        
        .result-content {
          flex: 1;
          min-width: 0;
        }
        
        .result-title {
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 2px;
        }
        
        .result-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .result-type {
          font-size: 0.75rem;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-muted);
        }
        
        .shortcuts {
          padding: 12px 20px;
          border-top: 1px solid var(--card-border);
          display: flex;
          gap: 20px;
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
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
      </style>
      
      <div class="backdrop" onclick="this.getRootNode().host.close()"></div>
      <div class="modal">
        <div class="search-header">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input 
              type="text" 
              class="search-input" 
              placeholder="Search components, symbols, or files..."
              value="${this.searchQuery}"
              oninput="this.getRootNode().host.handleSearch(this.value)"
              onkeydown="this.getRootNode().host.handleKeyDown(event)"
            />
          </div>
        </div>
        
        <div class="results">
          ${this.renderResults()}
        </div>
        
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
            <span>Close</span>
          </div>
        </div>
      </div>
    `;
  }
  
  private renderResults(): string {
    if (this.filteredItems.length === 0) {
      return `
        <div class="empty-state">
          <p>No results found for "${this.searchQuery}"</p>
        </div>
      `;
    }
    
    return this.filteredItems.map((item, index) => `
      <div class="result-item ${index === this.selectedIndex ? 'selected' : ''}"
           onclick="this.getRootNode().host.selectItem(${index})">
        <span class="result-icon">${item.icon}</span>
        <div class="result-content">
          <div class="result-title">${this.highlightMatch(item.title)}</div>
          ${item.subtitle ? `<div class="result-subtitle">${item.subtitle}</div>` : ''}
        </div>
        <span class="result-type">${item.type}</span>
      </div>
    `).join('');
  }
  
  private highlightMatch(text: string): string {
    if (!this.searchQuery) return text;
    
    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }
  
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  private debouncedSearch = debounce((query: string) => {
    this.filterItems(query);
  }, 200);
  
  private handleSearch(value: string) {
    this.searchQuery = value;
    this.selectedIndex = 0;
    this.debouncedSearch(value);
  }
  
  private filterItems(query: string) {
    if (!query.trim()) {
      this.filteredItems = [...this.items];
    } else {
      const lowerQuery = query.toLowerCase();
      this.filteredItems = this.items.filter(item => {
        // Check title
        if (item.title.toLowerCase().includes(lowerQuery)) return true;
        
        // Check subtitle
        if (item.subtitle && item.subtitle.toLowerCase().includes(lowerQuery)) return true;
        
        // Check keywords
        if (item.keywords) {
          return item.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery));
        }
        
        return false;
      });
    }
    
    this.render();
  }
  
  private handleKeyDown(event: KeyboardEvent) {
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
        this.close();
        break;
    }
  }
  
  private moveSelection(delta: number) {
    const newIndex = Math.max(0, Math.min(this.filteredItems.length - 1, this.selectedIndex + delta));
    if (newIndex !== this.selectedIndex) {
      this.selectedIndex = newIndex;
      this.updateSelection();
    }
  }
  
  private updateSelection() {
    const items = this.shadow.querySelectorAll('.result-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });
    
    // Scroll selected item into view
    const selectedItem = items[this.selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  
  private selectItem(index: number) {
    this.selectedIndex = index;
    this.confirmSelection();
  }
  
  private confirmSelection() {
    const selectedItem = this.filteredItems[this.selectedIndex];
    if (selectedItem) {
      selectedItem.action();
      this.close();
    }
  }
  
  private navigateTo(path: string) {
    window.location.hash = path;
  }
  
  private showSymbolSearch() {
    // Close quick jump
    this.close();
    
    // Show symbol selector modal
    import('./symbol-selector-modal.js').then(module => {
      module.showSymbolSelector({
        title: 'Search Symbols',
        onSelect: (symbol) => {
          // Navigate to relationships view with selected symbol
          window.location.hash = `/relationships?symbol_id=${symbol.id}`;
        }
      });
    });
  }
  
  private showFileSearch() {
    // For now, just navigate to search
    this.navigateTo('/search');
  }
}

// Define custom element
defineComponent('quick-jump-modal', QuickJumpModal);

// Export function to show modal
export function showQuickJump() {
  const modal = QuickJumpModal.getInstance();
  modal.show();
}