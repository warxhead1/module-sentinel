/**
 * Module Browser Component
 * 
 * A hierarchical tree view for browsing code modules/namespaces
 * Works across different languages (namespaces for C++, mosdules for Python, packages for Java)
 */

export class ModuleBrowser extends HTMLElement {
  private shadow: ShadowRoot;
  private moduleData: any = null;
  private expandedNodes = new Set<string>();
  private selectedFile: string | null = null;
  private isCompactMode = false;
  private boundSelectionHandler: (e: any) => void;
  private loadingTimeout: any = null;
  private isLoading = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    // Store bound function reference for proper cleanup with debouncing
    this.boundSelectionHandler = (e: any) => {
      // Debounce to prevent spam requests
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
      }
      if (this.isLoading) {
        return; // Skip if already loading
      }
      this.loadingTimeout = setTimeout(() => {
        this.loadModuleData();
      }, 500); // 500ms debounce
    };
  }

  connectedCallback() {
    this.isCompactMode = this.hasAttribute('compact');
    this.render();
    this.loadModuleData();
    this.setupEventListeners();
    
    // Listen for project selection changes
    document.addEventListener('selection-changed', this.boundSelectionHandler);
  }

  disconnectedCallback() {
    // Cleanup event listener and timeout
    document.removeEventListener('selection-changed', this.boundSelectionHandler);
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
    }
  }

  static get observedAttributes() {
    return ['compact'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'compact') {
      this.isCompactMode = newValue !== null;
      this.render();
    }
  }

  private async loadModuleData() {
    if (this.isLoading) {
      console.log('ModuleBrowser: Already loading, skipping request');
      return;
    }
    
    this.isLoading = true;
    
    try {
      // Get current project and language filters from global state
      const projectId = (window as any).selectedProjectId;
      const languageId = (window as any).selectedLanguageId;
      const visibleProjectIds = (window as any).visibleProjectIds || [];
      
      // Build query parameters
      const params = new URLSearchParams();
      
      // Use visible project IDs if available, otherwise fall back to selected project
      if (visibleProjectIds.length > 0) {
        params.set('project_ids', visibleProjectIds.join(','));
      } else if (projectId) {
        params.set('project_ids', projectId.toString());
      }
      
      if (languageId) {
        params.set('language_id', languageId.toString());
      }
      
      const url = `/api/modules${params.toString() ? `?${params.toString()}` : ''}`;
      console.log('ModuleBrowser: Loading modules from', url);
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load modules');
      
      const result = await response.json();
      if (result.success && result.data) {
        this.moduleData = result.data;
        this.renderModuleTree();
      } else {
        throw new Error(result.error || 'Invalid response format');
      }
    } catch (error) {
      console.error('Error loading module data:', error);
      this.renderError('Failed to load module hierarchy');
    } finally {
      this.isLoading = false;
    }
  }

  private render() {
    const styles = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          overflow: auto;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #e0e0e0;
          background: #0d1117;
          border-radius: 8px;
        }

        :host([compact]) {
          max-height: 400px;
        }

        .module-tree {
          padding: ${this.isCompactMode ? '12px' : '20px'};
        }

        .tree-node {
          margin: 2px 0;
        }

        .node-content {
          display: flex;
          align-items: center;
          padding: 6px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          gap: 8px;
        }

        .node-content:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .node-content.selected {
          background: rgba(88, 166, 255, 0.2);
          border: 1px solid #58a6ff;
        }

        .expand-icon {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
          color: #666;
        }

        .expand-icon.expanded {
          transform: rotate(90deg);
        }

        .node-icon {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .namespace-icon {
          color: #58a6ff;
        }

        .class-icon, .file-icon {
          color: #ffa657;
        }

        .node-label {
          flex: 1;
          font-size: ${this.isCompactMode ? '13px' : '14px'};
          font-weight: 500;
        }

        .node-badge {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.1);
          color: #999;
        }

        .children {
          margin-left: 24px;
          display: none;
        }

        .children.expanded {
          display: block;
        }

        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: #666;
        }

        .error {
          padding: 20px;
          text-align: center;
          color: #ff6b6b;
        }

        .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: #666;
        }

        .search-box {
          margin-bottom: 16px;
          position: relative;
        }

        .search-input {
          width: 100%;
          padding: 8px 12px 8px 36px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: #58a6ff;
          background: rgba(255, 255, 255, 0.08);
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
        }
      </style>
    `;

    const loading = `
      <div class="loading">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2" opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
          </path>
        </svg>
      </div>
    `;

    this.shadow.innerHTML = `
      ${styles}
      <div class="module-tree">
        ${!this.isCompactMode ? `
          <div class="search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
            <input type="text" class="search-input" placeholder="Search modules and classes..." />
          </div>
        ` : ''}
        <div class="tree-container">
          ${loading}
        </div>
      </div>
    `;

    // Add search functionality
    if (!this.isCompactMode) {
      const searchInput = this.shadow.querySelector('.search-input') as HTMLInputElement;
      searchInput?.addEventListener('input', (e) => this.handleSearch((e.target as HTMLInputElement).value));
    }
  }

  private renderModuleTree() {
    const container = this.shadow.querySelector('.tree-container');
    if (!container) return;

    if (!this.moduleData || this.moduleData.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No modules found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.moduleData.map((rootSymbol: any) => this.renderSymbolNode(rootSymbol)).join('');
  }

  private renderSymbolNode(symbol: any, path: string = ''): string {
    const nodePath = path ? `${path}::${symbol.name}` : symbol.name;
    const hasChildren = symbol.children && symbol.children.length > 0;
    const hasMembers = symbol.members && (symbol.members.methods.length > 0 || symbol.members.fields.length > 0 || symbol.members.types.length > 0);
    const hasImports = symbol.imports && symbol.imports.length > 0;
    const hasFiles = symbol.files && symbol.files.length > 0;
    const isExpandable = hasChildren || hasMembers || hasImports;
    const isExpanded = this.expandedNodes.has(nodePath);

    const icon = this.getIconForSymbol(symbol.kind);
    const isSelectable = ['class', 'struct', 'enum'].includes(symbol.kind);
    const isSelected = isSelectable && this.selectedFile === symbol.qualifiedName;

    // Build file info string
    let fileInfo = '';
    if (hasFiles) {
      const ixxFile = symbol.files.find((f: any) => f.type === 'interface');
      const cppFile = symbol.files.find((f: any) => f.type === 'implementation');
      if (ixxFile && cppFile) {
        fileInfo = ' <span style="color: #666; font-size: 11px;">[.ixx/.cpp]</span>';
      } else if (ixxFile) {
        fileInfo = ' <span style="color: #666; font-size: 11px;">[.ixx]</span>';
      } else if (cppFile) {
        fileInfo = ' <span style="color: #666; font-size: 11px;">[.cpp]</span>';
      }
    }

    // Build badge text
    let badgeText = '';
    if (hasMembers) {
      const counts = [];
      if (symbol.members.methods.length > 0) counts.push(`${symbol.members.methods.length} methods`);
      if (symbol.members.fields.length > 0) counts.push(`${symbol.members.fields.length} fields`);
      if (symbol.members.types.length > 0) counts.push(`${symbol.members.types.length} types`);
      badgeText = counts.join(', ');
    } else if (hasChildren) {
      badgeText = `${symbol.children.length} items`;
    }

    let html = `
      <div class="tree-node" data-path="${nodePath}">
        <div class="node-content ${isSelected ? 'selected' : ''}" data-type="${symbol.kind}" data-path="${nodePath}" data-qualified-name="${symbol.qualifiedName || nodePath}">
          ${isExpandable ? `
            <span class="expand-icon ${isExpanded ? 'expanded' : ''}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </span>
          ` : '<span style="width: 16px;"></span>'}
          <span class="node-icon" style="color: ${this.getColorForSymbol(symbol.kind)};">${icon}</span>
          <span class="node-label">${symbol.name}${fileInfo}</span>
          ${symbol.visibility ? `<span style="color: #999; font-size: 11px; margin-left: 4px;">${symbol.visibility}</span>` : ''}
          ${symbol.isVulkanType ? `<span style="color: #f39c12; font-size: 11px; margin-left: 4px;">[Vulkan]</span>` : ''}
          ${badgeText ? `<span class="node-badge">${badgeText}</span>` : ''}
        </div>
        ${isExpandable && isExpanded ? `
          <div class="children expanded">
            ${hasImports ? this.renderImports(symbol.imports) : ''}
            ${hasMembers ? this.renderMembers(symbol.members, nodePath) : ''}
            ${hasChildren ? symbol.children.map((child: any) => this.renderSymbolNode(child, nodePath)).join('') : ''}
          </div>
        ` : ''}
      </div>
    `;

    return html;
  }

  private renderImports(imports: string[]): string {
    return `
      <div class="import-section">
        <div class="section-header" style="color: #666; font-size: 12px; padding: 4px 8px 4px 24px; font-style: italic;">
          Imports/Includes (${imports.length})
        </div>
        ${imports.slice(0, 10).map(imp => `
          <div class="import-item" style="padding: 2px 8px 2px 40px; font-size: 12px; color: #999;">
            <span style="color: #666;">→</span> ${imp}
          </div>
        `).join('')}
        ${imports.length > 10 ? `
          <div style="padding: 2px 8px 2px 40px; font-size: 12px; color: #666; font-style: italic;">
            ... and ${imports.length - 10} more
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderMembers(members: any, parentPath: string): string {
    let html = '';
    
    if (members.methods.length > 0) {
      html += `
        <div class="member-section">
          <div class="section-header" style="color: #b392f0; font-size: 12px; padding: 4px 8px 4px 24px; font-weight: 600;">
            Methods (${members.methods.length})
          </div>
          ${members.methods.slice(0, 10).map((method: any) => `
            <div class="member-item" style="padding: 2px 8px 2px 40px; font-size: 12px;">
              <span style="color: #b392f0;">ƒ</span> 
              <span style="color: #e0e0e0;">${method.name}</span>
              ${method.signature ? `<span style="color: #666;">${this.truncateSignature(method.signature)}</span>` : ''}
              ${method.visibility !== 'public' ? `<span style="color: #999; font-size: 10px; margin-left: 4px;">[${method.visibility}]</span>` : ''}
            </div>
          `).join('')}
          ${members.methods.length > 10 ? `
            <div style="padding: 2px 8px 2px 40px; font-size: 12px; color: #666; font-style: italic;">
              ... and ${members.methods.length - 10} more
            </div>
          ` : ''}
        </div>
      `;
    }
    
    if (members.fields.length > 0) {
      html += `
        <div class="member-section">
          <div class="section-header" style="color: #3ddc84; font-size: 12px; padding: 4px 8px 4px 24px; font-weight: 600;">
            Fields (${members.fields.length})
          </div>
          ${members.fields.slice(0, 10).map((field: any) => `
            <div class="member-item" style="padding: 2px 8px 2px 40px; font-size: 12px;">
              <span style="color: #3ddc84;">■</span> 
              <span style="color: #e0e0e0;">${field.name}</span>
              ${field.returnType ? `<span style="color: #666;">: ${field.returnType}</span>` : ''}
              ${field.visibility !== 'public' ? `<span style="color: #999; font-size: 10px; margin-left: 4px;">[${field.visibility}]</span>` : ''}
            </div>
          `).join('')}
          ${members.fields.length > 10 ? `
            <div style="padding: 2px 8px 2px 40px; font-size: 12px; color: #666; font-style: italic;">
              ... and ${members.fields.length - 10} more
            </div>
          ` : ''}
        </div>
      `;
    }

    if (members.types.length > 0) {
      html += `
        <div class="member-section">
          <div class="section-header" style="color: #ffa657; font-size: 12px; padding: 4px 8px 4px 24px; font-weight: 600;">
            Nested Types (${members.types.length})
          </div>
          ${members.types.map((type: any) => `
            <div class="member-item" style="padding: 2px 8px 2px 40px; font-size: 12px;">
              <span style="color: #ffa657;">◆</span> 
              <span style="color: #e0e0e0;">${type.name}</span>
              <span style="color: #666; font-size: 10px; margin-left: 4px;">[${type.kind}]</span>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    return html;
  }

  private truncateSignature(signature: string): string {
    if (signature.length <= 50) return signature;
    return signature.substring(0, 47) + '...';
  }

  private getIconForSymbol(kind: string): string {
    switch (kind) {
      case 'namespace':
        return '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M2 5a1 1 0 0 1 1-1h4a1 1 0 0 1 .8.4l1.2 1.6h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>';
      case 'class':
      case 'struct':
        return '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M4 3h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v2h10V5H4zm0 4v4h10V9H4z"/></svg>';
      case 'enum':
        return '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M4 4h10v2H4V4zm0 4h10v2H4V8zm0 4h10v2H4v-2z"/></svg>';
      case 'function':
      case 'method':
        return '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M4 4h10v2H4V4zm0 4h10v2H4V8zm0 4h10v2H4v-2z"/></svg>';
      default:
        return '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><path d="M10 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-6-6z"/><path d="M10 2v4a2 2 0 0 0 2 2h4" opacity="0.5"/></svg>';
    }
  }

  private getColorForSymbol(kind: string): string {
    switch (kind) {
      case 'namespace': return '#58a6ff';
      case 'class':
      case 'struct': return '#ffa657';
      case 'enum': return '#3ddc84';
      case 'function':
      case 'method': return '#b392f0';
      default: return '#e0e0e0';
    }
  }

  private renderError(message: string) {
    const container = this.shadow.querySelector('.tree-container');
    if (container) {
      container.innerHTML = `<div class="error">${message}</div>`;
    }
  }

  private handleSearch(query: string) {
    // TODO: Implement search functionality
    console.log('Search:', query);
  }

  private setupEventListeners() {
    // Add event delegation for tree interactions
    this.shadow.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.node-content') as HTMLElement;
      if (!target) return;

      const type = target.dataset.type;
      const path = target.dataset.path;
      const qualifiedName = target.dataset.qualifiedName;

      if (path && target.querySelector('.expand-icon')) {
        // Toggle expand/collapse
        if (this.expandedNodes.has(path)) {
          this.expandedNodes.delete(path);
        } else {
          this.expandedNodes.add(path);
        }
        this.renderModuleTree();
      } else if ([ 'class', 'struct', 'enum' ].includes(type!)) {
        // Select file and emit event
        this.selectedFile = qualifiedName || null;
        this.renderModuleTree();

        // Emit custom event for file selection
        this.dispatchEvent(new CustomEvent('symbol-selected', {
          detail: { qualifiedName },
          bubbles: true,
          composed: true
        }));
      }
    });
  }
}

// Register the custom element
customElements.define('module-browser', ModuleBrowser);