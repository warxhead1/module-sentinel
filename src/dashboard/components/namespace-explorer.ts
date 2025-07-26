import { DashboardComponent, defineComponent } from './base-component.js';
import { showSymbolSelector } from './symbol-selector-modal.js';
import { stateService } from '../services/state.service.js';

export class NamespaceExplorer extends DashboardComponent {
  private namespaceTree: any = {};
  private selectedNamespace: string | null = null;
  private namespaceDetails: any = null;
  private selectedSymbol: any = null;

  async loadData(): Promise<void> {
    try {
      // Check if a symbol is selected from state
      const selectedSymbolId = stateService.getState('selectedNodeId');
      const storedSymbol = stateService.getState('selectedSymbol');
      
      if (storedSymbol && !this.selectedSymbol) {
        this.selectedSymbol = storedSymbol;
      }
      
      const response = await this.fetchAPI('/api/namespaces');
      this.namespaceTree = response.tree || {};
      
      // Check if there's a namespace in the URL
      const params = new URLSearchParams(window.location.search);
      const ns = params.get('ns');
      if (ns) {
        await this.selectNamespace(ns);
      }
      
      this.render();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  async selectNamespace(namespace: string) {
    try {
      this.selectedNamespace = namespace;
      let url = `/api/namespace-details?ns=${encodeURIComponent(namespace)}`;
      
      // If a symbol is selected, include it to get related namespace info
      if (this.selectedSymbol) {
        url += `&symbol_id=${this.selectedSymbol.id}`;
      }
      
      const response = await this.fetchAPI(url);
      this.namespaceDetails = response;
      this.render();
    } catch (error) {
      console.error('Failed to load namespace details:', error);
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
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .header-content {
          flex: 1;
        }
        
        .symbol-selector-btn {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid #4ecdc4;
          color: #4ecdc4;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .symbol-selector-btn:hover {
          background: rgba(78, 205, 196, 0.3);
          transform: translateY(-1px);
        }
        
        .selected-symbol {
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          padding: 8px 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ccc;
        }
        
        .clear-symbol {
          cursor: pointer;
          color: #888;
          transition: color 0.2s ease;
        }
        
        .clear-symbol:hover {
          color: #ff6b6b;
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
        
        .namespace-layout {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 30px;
          height: calc(100vh - 200px);
        }
        
        .namespace-sidebar {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 20px;
          overflow-y: auto;
        }
        
        .namespace-main {
          overflow-y: auto;
        }
        
        .tree-node {
          margin-left: 20px;
          margin-top: 5px;
        }
        
        .tree-node-header {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s ease;
        }
        
        .tree-node-header:hover {
          background: rgba(78, 205, 196, 0.1);
        }
        
        .tree-node-header.selected {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid #4ecdc4;
        }
        
        .tree-icon {
          margin-right: 8px;
          transition: transform 0.2s;
          color: #4ecdc4;
        }
        
        .tree-icon.expanded {
          transform: rotate(90deg);
        }
        
        .tree-label {
          flex: 1;
          font-size: 14px;
        }
        
        .tree-count {
          font-size: 12px;
          color: #888;
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 8px;
          border-radius: 12px;
        }
        
        .namespace-details {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 30px;
          min-height: 100%;
        }
        
        .namespace-stats {
          display: flex;
          gap: 30px;
          margin-bottom: 30px;
          color: #888;
        }
        
        .symbol-section {
          margin-bottom: 30px;
        }
        
        .symbol-section h3 {
          margin-bottom: 15px;
          color: #4ecdc4;
        }
        
        .symbol-list {
          display: grid;
          gap: 10px;
        }
        
        .symbol-item {
          background: rgba(0, 0, 0, 0.3);
          padding: 15px;
          border-radius: 8px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 15px;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .symbol-item:hover {
          background: rgba(78, 205, 196, 0.1);
          transform: translateX(5px);
        }
        
        .symbol-icon {
          width: 35px;
          height: 35px;
          background: rgba(78, 205, 196, 0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        
        .symbol-info {
          overflow: hidden;
        }
        
        .symbol-name {
          font-weight: 600;
          color: #4ecdc4;
          margin-bottom: 4px;
        }
        
        .symbol-signature {
          font-size: 12px;
          color: #888;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: 'Fira Code', monospace;
        }
        
        .symbol-location {
          font-size: 12px;
          color: #666;
          white-space: nowrap;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px;
          color: #888;
        }
      </style>
      
      <div class="page-header">
        <div class="header-content">
          <h1>Namespace Explorer</h1>
          <p class="subtitle">Browse and analyze code organization by namespace</p>
        </div>
        <button class="symbol-selector-btn" onclick="this.getRootNode().host.openSymbolSelector()">
          🔍 Select Symbol
        </button>
      </div>
      
      ${this.selectedSymbol ? `
        <div class="selected-symbol">
          <span>Exploring namespace of: <strong>${this.selectedSymbol.name}</strong></span>
          <span class="clear-symbol" onclick="this.getRootNode().host.clearSymbolSelection()">✕</span>
        </div>
      ` : ''}
      
      <div class="namespace-layout">
        <div class="namespace-sidebar">
          <h3>Namespace Hierarchy</h3>
          <div id="namespaceTree">
            ${this.renderTree(this.namespaceTree)}
          </div>
        </div>
        
        <div class="namespace-main">
          <div class="namespace-details">
            ${this.renderDetails()}
          </div>
        </div>
      </div>
    `;

    // Add event listeners after rendering
    this.attachTreeListeners();
  }

  private renderTree(tree: any, level: number = 0): string {
    if (!tree || Object.keys(tree).length === 0) {
      return '<div class="empty-state">No namespaces found</div>';
    }

    return Object.entries(tree).map(([name, data]: [string, any]) => {
      const hasChildren = data.children && Object.keys(data.children).length > 0;
      const isSelected = this.selectedNamespace === data.fullPath;
      
      return `
        <div class="tree-node" style="margin-left: ${level * 20}px">
          <div class="tree-node-header ${isSelected ? 'selected' : ''}" 
               data-namespace="${data.fullPath}"
               data-has-children="${hasChildren}">
            <span class="tree-icon">${hasChildren ? '▶' : '◆'}</span>
            <span class="tree-label">${name}</span>
            <span class="tree-count">${data.symbolCount || 0}</span>
          </div>
          ${hasChildren ? `
            <div class="tree-children" style="display: none;">
              ${this.renderTree(data.children, level + 1)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  private renderDetails(): string {
    if (!this.namespaceDetails) {
      return `
        <div class="empty-state">
          <h2>Select a namespace to explore</h2>
          <p>Click on any namespace in the tree to view its contents.</p>
        </div>
      `;
    }

    const symbolsByType: Record<string, any[]> = {};
    this.namespaceDetails.symbols.forEach((symbol: any) => {
      if (!symbolsByType[symbol.kind]) {
        symbolsByType[symbol.kind] = [];
      }
      symbolsByType[symbol.kind].push(symbol);
    });

    return `
      <h2>${this.namespaceDetails.namespace}</h2>
      <div class="namespace-stats">
        <span>Total Symbols: ${this.namespaceDetails.symbols.length}</span>
        <span>Files: ${this.namespaceDetails.fileCount || 0}</span>
      </div>
      
      ${Object.entries(symbolsByType).map(([type, symbols]) => `
        <div class="symbol-section">
          <h3>${type}s (${symbols.length})</h3>
          <div class="symbol-list">
            ${symbols.map((symbol: any) => `
              <div class="symbol-item" data-symbol="${symbol.name}">
                <div class="symbol-icon">${this.getSymbolIcon(symbol.kind)}</div>
                <div class="symbol-info">
                  <div class="symbol-name">${symbol.name}</div>
                  ${symbol.signature ? `<div class="symbol-signature">${symbol.signature}</div>` : ''}
                </div>
                <div class="symbol-location">${symbol.file}:${symbol.line}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;
  }

  private getSymbolIcon(kind: string): string {
    const icons: Record<string, string> = {
      'class': '🏛️',
      'function': '⚡',
      'namespace': '📦',
      'variable': '📌',
      'enum': '🎯',
      'typedef': '🏷️',
      'struct': '🔷'
    };
    return icons[kind] || '•';
  }

  private openSymbolSelector() {
    showSymbolSelector({
      title: 'Select Symbol to Explore',
      onSelect: (symbol) => {
        this.selectedSymbol = symbol;
        stateService.setState('selectedNodeId', symbol.id);
        stateService.setState('selectedSymbol', symbol);
        
        // Auto-select the namespace of the selected symbol
        if (symbol.namespace) {
          this.selectNamespace(symbol.namespace);
        } else {
          this.loadData();
        }
      },
      onCancel: () => {
        // User cancelled, no action needed
      }
    });
  }

  private clearSymbolSelection() {
    this.selectedSymbol = null;
    stateService.setState('selectedNodeId', null);
    stateService.setState('selectedSymbol', null);
    this.loadData();
  }

  private attachTreeListeners() {
    // Tree node click handlers
    this.shadow.querySelectorAll('.tree-node-header').forEach(header => {
      header.addEventListener('click', async (e) => {
        const namespace = header.getAttribute('data-namespace');
        const hasChildren = header.getAttribute('data-has-children') === 'true';
        
        if (namespace) {
          await this.selectNamespace(namespace);
        }
        
        // Toggle children if any
        if (hasChildren) {
          const icon = header.querySelector('.tree-icon');
          const children = header.nextElementSibling as HTMLElement;
          if (children && icon) {
            const isExpanded = children.style.display !== 'none';
            children.style.display = isExpanded ? 'none' : 'block';
            icon.classList.toggle('expanded', !isExpanded);
          }
        }
      });
    });

    // Symbol click handlers
    this.shadow.querySelectorAll('.symbol-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const symbol = item.getAttribute('data-symbol');
        this.emit('symbol-selected', { symbol });
      });
    });
  }
}

defineComponent('namespace-explorer', NamespaceExplorer);