import { DashboardComponent, defineComponent } from './base-component.js';
import { navigationContext, NavigationContext, NavigationTarget } from '../utils/navigation-context.js';
import { stateService } from '../services/state.service.js';

/**
 * Navigation Actions Component
 * Provides contextual navigation buttons based on current selection
 */
export class NavigationActions extends DashboardComponent {
  private context: NavigationContext | null = null;
  private targets: NavigationTarget[] = [];
  private expanded = false;
  
  async loadData(): Promise<void> {
    // No data to load
  }
  
  connectedCallback() {
    super.connectedCallback();
    
    // Listen for context changes
    this.subscribeToContextChanges();
  }
  
  private subscribeToContextChanges() {
    // Listen for symbol selection changes
    stateService.subscribe('selectedSymbol', (symbol) => {
      if (symbol) {
        this.updateContextAndRender();
      }
    });
    
    // Listen for navigation context updates
    stateService.subscribe('navigationContext', () => {
      this.updateContextAndRender();
    });
  }
  
  private updateContextAndRender() {
    // Get current component info from parent
    const root = this.getRootNode() as ShadowRoot;
    const parentComponent = root?.host as any;
    if (!parentComponent) return;
    
    const componentName = parentComponent.tagName?.toLowerCase() || 'unknown';
    const currentRoute = window.location.hash.replace('#', '') || '/';
    
    // Create or update context
    this.context = navigationContext.createContext(componentName, currentRoute);
    
    // Add current selections to context
    const selectedSymbol = stateService.getState<any>('selectedSymbol');
    if (selectedSymbol && selectedSymbol.id && selectedSymbol.name && selectedSymbol.qualified_name && selectedSymbol.kind) {
      this.context.selectedSymbol = selectedSymbol;
    }
    
    const selectedFile = stateService.getState<any>('selectedFile');
    if (selectedFile && selectedFile.path) {
      this.context.selectedFile = selectedFile;
    }
    
    const selectedNamespace = stateService.getState<any>('selectedNamespace');
    if (selectedNamespace && selectedNamespace.name && selectedNamespace.fullPath) {
      this.context.selectedNamespace = selectedNamespace;
    }
    
    // Get suggested navigation targets
    this.targets = navigationContext.getSuggestedTargets(this.context);
    
    // Filter out current component
    this.targets = this.targets.filter(t => t.component !== componentName);
    
    this.render();
  }
  
  render() {
    const hasContext = this.context && (
      this.context.selectedSymbol || 
      this.context.selectedFile || 
      this.context.selectedNamespace
    );
    
    if (!hasContext || this.targets.length === 0) {
      this.shadow.innerHTML = '';
      return;
    }
    
    // Show top 3 actions by default, all when expanded
    const visibleTargets = this.expanded ? this.targets : this.targets.slice(0, 3);
    const hasMore = !this.expanded && this.targets.length > 3;
    
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
        }
        
        .navigation-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 0;
          flex-wrap: wrap;
        }
        
        .action-button {
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          color: #4ecdc4;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          position: relative;
        }
        
        .action-button:hover {
          background: rgba(78, 205, 196, 0.2);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(78, 205, 196, 0.2);
        }
        
        .action-button:active {
          transform: translateY(0);
        }
        
        .action-icon {
          font-size: 16px;
        }
        
        .action-label {
          font-weight: 500;
        }
        
        .action-tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.9);
          color: #fff;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          margin-bottom: 8px;
          z-index: 1000;
        }
        
        .action-tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: rgba(0, 0, 0, 0.9);
        }
        
        .action-button:hover .action-tooltip {
          opacity: 1;
        }
        
        .more-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #888;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .more-button:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #aaa;
        }
        
        .divider {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 8px;
        }
        
        .context-label {
          color: #666;
          font-size: 12px;
          margin-right: 8px;
        }
        
        @media (max-width: 768px) {
          .navigation-actions {
            justify-content: flex-start;
          }
          
          .action-button {
            padding: 6px 12px;
            font-size: 12px;
          }
          
          .action-icon {
            font-size: 14px;
          }
        }
      </style>
      
      <div class="navigation-actions">
        ${this.renderContextLabel()}
        ${visibleTargets.map(target => this.renderActionButton(target)).join('')}
        ${hasMore ? `
          <button class="more-button" onclick="this.getRootNode().host.toggleExpanded()">
            <span>${this.expanded ? 'Less' : 'More'}</span>
            <span style="font-size: 10px;">${this.expanded ? '▴' : '▾'}</span>
          </button>
        ` : ''}
      </div>
    `;
  }
  
  private renderContextLabel(): string {
    if (!this.context) return '';
    
    let label = '';
    if (this.context.selectedSymbol) {
      label = `${this.context.selectedSymbol.name}:`;
    } else if (this.context.selectedFile) {
      const fileName = this.context.selectedFile.path.split('/').pop();
      label = `${fileName}:`;
    } else if (this.context.selectedNamespace) {
      label = `${this.context.selectedNamespace.name}:`;
    }
    
    return label ? `<span class="context-label">${label}</span>` : '';
  }
  
  private renderActionButton(target: NavigationTarget): string {
    return `
      <button class="action-button" onclick="this.getRootNode().host.navigate('${target.route}', '${target.component}')">
        <span class="action-icon">${target.icon}</span>
        <span class="action-label">${target.title}</span>
        ${target.description ? `
          <div class="action-tooltip">${target.description}</div>
        ` : ''}
      </button>
    `;
  }
  
  private toggleExpanded() {
    this.expanded = !this.expanded;
    this.render();
  }
  
  private navigate(route: string, component: string) {
    if (!this.context) return;
    
    // Find the target
    const target = this.targets.find(t => t.route === route && t.component === component);
    if (!target) return;
    
    // Save current context
    navigationContext.setContext(this.context);
    
    // Build navigation URL with context
    const url = navigationContext.buildNavigationUrl(target, this.context);
    
    // Navigate
    window.location.hash = url;
    
    // Emit navigation event
    this.emit('navigation', {
      from: this.context.sourceComponent,
      to: target.component,
      context: this.context
    });
  }
}

defineComponent('navigation-actions', NavigationActions);