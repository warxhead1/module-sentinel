import { DashboardComponent, defineComponent } from './base-component.js';

/**
 * Class details panel component
 * Shows detailed information about a selected class
 */
export class ClassDetailsPanel extends DashboardComponent {
  private selectedClass: any = null;

  async loadData(): Promise<void> {
    // Data is loaded when a class is selected
  }

  /**
   * Show details for a specific symbol/file by qualified name
   */
  async showSymbol(qualifiedName: string): Promise<void> {
    try {
      // First, get all symbols in this file/module using the new file symbols endpoint
      const response = await fetch(`/api/symbols/file/${encodeURIComponent(qualifiedName)}`);
      if (!response.ok) throw new Error('Failed to load file symbols');
      
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to load symbols');
      
      const symbols = result.data;
      
      if (!symbols || symbols.length === 0) {
        this.selectedClass = null;
        this.render();
        return;
      }
      
      // Group symbols by type and deduplicate
      const fileData = this.processFileSymbols(symbols, qualifiedName);
      this.selectedClass = fileData;
      
      // Load relationships for main class/struct if found
      const mainSymbol = symbols.find((s: any) => 
        s.qualified_name === qualifiedName && 
        ['class', 'struct', 'interface'].includes(s.kind)
      );
      
      if (mainSymbol) {
        try {
          const relationships = await this.fetchAPI(`/api/relationships?symbol_id=${mainSymbol.id}`);
          this.selectedClass.relationships = relationships;
        } catch (error) {
          console.error('Failed to load relationships:', error);
        }
      }
      
      this.render();
    } catch (error) {
      console.error('Failed to load symbol details:', error);
      this.selectedClass = null;
      this.render();
    }
  }
  
  /**
   * Show details for a specific class (legacy method)
   */
  async showClass(classData: any): Promise<void> {
    if (classData.qualified_name) {
      await this.showSymbol(classData.qualified_name);
    } else {
      this.selectedClass = classData;
      this.render();
    }
  }
  
  private processFileSymbols(symbols: any[], qualifiedName: string): any {
    // Find the main symbol (class/struct/interface)
    const mainSymbol = symbols.find(s => 
      s.qualified_name === qualifiedName && 
      ['class', 'struct', 'interface', 'enum'].includes(s.kind)
    ) || symbols[0];
    
    // Get unique file paths
    const files = [...new Set(symbols.map(s => s.file_path))];
    
    // Separate symbols by type
    const methods = symbols.filter(s => 
      s.kind === 'method' || s.kind === 'function'
    ).reduce((unique: any[], method: any) => {
      // Deduplicate by name + signature
      const key = `${method.name}:${method.signature || ''}`;
      if (!unique.some(m => `${m.name}:${m.signature || ''}` === key)) {
        unique.push(method);
      }
      return unique;
    }, []);
    
    const fields = symbols.filter(s => 
      s.kind === 'field' || s.kind === 'variable'
    ).reduce((unique: any[], field: any) => {
      // Deduplicate by name
      if (!unique.some(f => f.name === field.name)) {
        unique.push(field);
      }
      return unique;
    }, []);
    
    const nestedTypes = symbols.filter(s => 
      ['class', 'struct', 'enum', 'typedef'].includes(s.kind) &&
      s.qualified_name !== qualifiedName
    );
    
    const constructors = methods.filter(m => 
      m.name === mainSymbol.name || m.name.includes('ctor')
    );
    
    const publicMethods = methods.filter(m => 
      m.visibility === 'public' && !constructors.includes(m)
    );
    
    const privateMethods = methods.filter(m => 
      m.visibility !== 'public' && !constructors.includes(m)
    );
    
    return {
      name: mainSymbol.name,
      namespace: mainSymbol.namespace,
      file_path: files.join(', '),
      kind: mainSymbol.kind,
      visibility: mainSymbol.visibility,
      is_exported: mainSymbol.is_exported,
      constructors,
      publicMethods,
      privateMethods,
      fields,
      nestedTypes,
      files,
      totalSymbols: symbols.length
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
    if (!this.selectedClass) {
      return `
        <div class="details-panel empty">
          <div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" width="48" height="48">
              <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            <p>Select a class to view details</p>
          </div>
        </div>
      `;
    }

    const { 
      name, 
      namespace: ns, 
      file_path, 
      kind, 
      visibility,
      is_exported,
      constructors = [],
      publicMethods = [], 
      privateMethods = [],
      fields = [], 
      nestedTypes = [],
      files = [],
      totalSymbols = 0,
      relationships = {} 
    } = this.selectedClass;

    return `
      <div class="details-panel">
        <div class="details-header">
          <div>
            <h2>${name}</h2>
            <div class="header-badges">
              <span class="kind-badge ${kind}">${kind}</span>
              ${visibility ? `<span class="visibility-badge">${visibility}</span>` : ''}
              ${is_exported ? `<span class="export-badge">exported</span>` : ''}
            </div>
          </div>
          <div class="quick-actions">
            <button class="action-btn" title="View relationships">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a2 2 0 100 4 2 2 0 000-4zM6 3a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0zM8 11a2 2 0 100 4 2 2 0 000-4zm-2 2a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z"/>
                <path d="M8 5v6m-2-4l4 4m0-4l-4 4" stroke="currentColor" stroke-width="1.5" fill="none"/>
              </svg>
            </button>
            <button class="action-btn" title="View code flow">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm6 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V9z"/>
                <path d="M5 7v2.5a.5.5 0 00.5.5H9" stroke="currentColor" stroke-width="1.5" fill="none"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="details-meta">
          <div class="meta-item">
            <span class="meta-label">Namespace:</span>
            <span class="meta-value">${ns || 'Global'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Files:</span>
            <span class="meta-value" title="${files.join(', ')}">${files.length} file${files.length > 1 ? 's' : ''}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Total Symbols:</span>
            <span class="meta-value">${totalSymbols}</span>
          </div>
        </div>

        ${constructors.length > 0 ? `
          <div class="details-section">
            <h3>Constructors</h3>
            <ul class="method-list">
              ${constructors.map((ctor: any) => `
                <li class="method-item constructor">
                  <span class="method-signature">${this.formatMethodSignature(ctor)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        ${publicMethods.length > 0 ? `
          <div class="details-section">
            <h3>Public Methods (${publicMethods.length})</h3>
            <ul class="method-list">
              ${publicMethods.slice(0, 15).map((method: any) => `
                <li class="method-item">
                  <span class="method-signature">${this.formatMethodSignature(method)}</span>
                  <button class="inline-action" title="View usages">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <circle cx="6" cy="6" r="1.5"/>
                      <path d="M6 1v2m0 6v2m5-5H9m-6 0H1" stroke="currentColor" stroke-width="1"/>
                    </svg>
                  </button>
                </li>
              `).join('')}
              ${publicMethods.length > 15 ? `
                <li class="more-indicator">...and ${publicMethods.length - 15} more</li>
              ` : ''}
            </ul>
          </div>
        ` : ''}

        ${fields.length > 0 ? `
          <div class="details-section">
            <h3>Fields (${fields.length})</h3>
            <ul class="field-list">
              ${fields.slice(0, 10).map((field: any) => `
                <li class="field-item">
                  <span class="field-name">${field.name}</span>
                  ${field.return_type ? `<span class="field-type">: ${field.return_type}</span>` : ''}
                  ${field.visibility && field.visibility !== 'public' ? `<span class="visibility-indicator">[${field.visibility}]</span>` : ''}
                </li>
              `).join('')}
              ${fields.length > 10 ? `
                <li class="more-indicator">...and ${fields.length - 10} more</li>
              ` : ''}
            </ul>
          </div>
        ` : ''}

        ${privateMethods.length > 0 ? `
          <details class="details-section collapsible">
            <summary>Private Methods (${privateMethods.length})</summary>
            <ul class="method-list">
              ${privateMethods.slice(0, 10).map((method: any) => `
                <li class="method-item private">
                  <span class="method-signature">${this.formatMethodSignature(method)}</span>
                </li>
              `).join('')}
              ${privateMethods.length > 10 ? `
                <li class="more-indicator">...and ${privateMethods.length - 10} more</li>
              ` : ''}
            </ul>
          </details>
        ` : ''}

        ${nestedTypes.length > 0 ? `
          <div class="details-section">
            <h3>Nested Types</h3>
            <ul class="nested-type-list">
              ${nestedTypes.map((type: any) => `
                <li class="nested-type-item">
                  <span class="type-kind">${type.kind}</span>
                  <span class="type-name">${type.name}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        ${relationships && Object.keys(relationships).length > 0 ? `
          <div class="details-section">
            <h3>Relationships</h3>
            <div class="relationship-summary">
              <div class="rel-stat">
                <span class="rel-count">${relationships.inherits?.length || 0}</span>
                <span class="rel-label">Inherits</span>
              </div>
              <div class="rel-stat">
                <span class="rel-count">${relationships.uses?.length || 0}</span>
                <span class="rel-label">Uses</span>
              </div>
              <div class="rel-stat">
                <span class="rel-count">${relationships.usedBy?.length || 0}</span>
                <span class="rel-label">Used By</span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private getFileName(path: string): string {
    return path.split('/').pop() || path;
  }
  
  private formatMethodSignature(method: any): string {
    const params = method.signature ? 
      method.signature.replace(/^[^(]*/, '').replace(/\s+/g, ' ').trim() : 
      '()';
    
    const returnType = method.return_type ? ` → ${method.return_type}` : '';
    return `${method.name}${params}${returnType}`;
  }

  styles(): string {
    return `
      .details-panel {
        height: 100%;
        padding: 24px;
        overflow-y: auto;
        background: var(--secondary-bg);
      }

      .details-panel.empty {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .empty-state {
        text-align: center;
        color: var(--text-muted);
      }

      .empty-icon {
        margin-bottom: 10px;
        opacity: 0.3;
      }

      .details-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 24px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--card-border);
      }

      .details-header h2 {
        margin: 0 0 8px 0;
        color: var(--vampire-purple);
        font-size: 24px;
        font-weight: 600;
      }

      .header-badges {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }

      .kind-badge, .visibility-badge, .export-badge {
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
      }

      .kind-badge {
        background: rgba(147, 112, 219, 0.15);
        color: var(--primary-accent);
      }

      .kind-badge.struct {
        background: rgba(255, 166, 87, 0.15);
        color: #ffa657;
      }

      .kind-badge.enum {
        background: rgba(61, 220, 132, 0.15);
        color: #3ddc84;
      }

      .visibility-badge {
        background: rgba(100, 255, 218, 0.1);
        color: #64ffda;
      }

      .export-badge {
        background: rgba(255, 215, 0, 0.1);
        color: #ffd700;
      }

      .quick-actions {
        display: flex;
        gap: 8px;
      }

      .action-btn {
        padding: 8px;
        border: 1px solid var(--card-border);
        background: rgba(147, 112, 219, 0.05);
        border-radius: 6px;
        cursor: pointer;
        transition: var(--transition-smooth);
        color: var(--text-secondary);
      }

      .action-btn:hover {
        background: rgba(147, 112, 219, 0.15);
        border-color: var(--primary-accent);
        transform: translateY(-1px);
      }

      .details-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-bottom: 28px;
        padding: 16px;
        background: rgba(147, 112, 219, 0.05);
        border-radius: 8px;
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .meta-label {
        font-size: 12px;
        color: var(--text-muted);
        font-weight: 500;
      }

      .meta-value {
        color: var(--text-primary);
        font-family: monospace;
        font-size: 13px;
      }

      .details-section {
        margin-bottom: 28px;
      }

      .details-section h3 {
        margin-bottom: 12px;
        color: var(--text-primary);
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .details-section.collapsible summary {
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 12px;
        user-select: none;
      }

      .details-section.collapsible summary:hover {
        color: var(--primary-accent);
      }

      .method-list, .field-list, .nested-type-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .method-item, .field-item {
        padding: 10px 14px;
        margin-bottom: 6px;
        background: rgba(35, 35, 65, 0.4);
        border: 1px solid transparent;
        border-radius: 6px;
        font-size: 13px;
        font-family: 'Fira Code', monospace;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: var(--transition-smooth);
      }

      .method-item:hover, .field-item:hover {
        background: rgba(147, 112, 219, 0.08);
        border-color: rgba(147, 112, 219, 0.3);
      }

      .method-item.constructor {
        border-left: 3px solid #ffd700;
      }

      .method-item.private {
        opacity: 0.7;
      }

      .method-signature {
        color: var(--vampire-pink);
        flex: 1;
      }

      .field-name {
        color: #3ddc84;
        font-weight: 500;
      }

      .field-type {
        color: var(--text-muted);
        font-size: 12px;
      }

      .visibility-indicator {
        font-size: 10px;
        color: var(--text-muted);
        background: rgba(100, 100, 100, 0.2);
        padding: 2px 6px;
        border-radius: 3px;
      }

      .inline-action {
        padding: 4px;
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--text-muted);
        transition: var(--transition-smooth);
        opacity: 0;
      }

      .method-item:hover .inline-action {
        opacity: 1;
      }

      .inline-action:hover {
        color: var(--primary-accent);
      }

      .more-indicator {
        padding: 8px 14px;
        color: var(--text-muted);
        font-style: italic;
        font-size: 12px;
        text-align: center;
      }

      .nested-type-item {
        display: flex;
        gap: 12px;
        padding: 8px 14px;
        margin-bottom: 4px;
        background: rgba(255, 166, 87, 0.05);
        border-radius: 6px;
        align-items: center;
      }

      .type-kind {
        font-size: 11px;
        padding: 2px 8px;
        background: rgba(255, 166, 87, 0.2);
        color: #ffa657;
        border-radius: 3px;
        font-weight: 500;
      }

      .type-name {
        color: var(--text-primary);
        font-family: monospace;
      }

      .relationship-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
      }

      .rel-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px;
        background: rgba(147, 112, 219, 0.05);
        border-radius: 8px;
        border: 1px solid transparent;
        transition: var(--transition-smooth);
        cursor: pointer;
      }

      .rel-stat:hover {
        background: rgba(147, 112, 219, 0.1);
        border-color: var(--primary-accent);
        transform: translateY(-2px);
      }

      .rel-count {
        font-size: 24px;
        font-weight: 600;
        color: var(--primary-accent);
      }

      .rel-label {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 4px;
      }

      /* Scrollbar styling */
      ::-webkit-scrollbar {
        width: 6px;
      }

      ::-webkit-scrollbar-track {
        background: transparent;
      }

      ::-webkit-scrollbar-thumb {
        background: rgba(147, 112, 219, 0.3);
        border-radius: 3px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: rgba(147, 112, 219, 0.5);
      }
    `;
  }

  connectedCallback(): void {
    super.connectedCallback();
    
    // Listen for class selection events
    window.addEventListener('class-selected', this.handleClassSelected.bind(this));
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('class-selected', this.handleClassSelected.bind(this));
  }

  private handleClassSelected(event: any): void {
    this.showClass(event.detail);
  }
}

// Register the component
defineComponent('class-details-panel', ClassDetailsPanel);