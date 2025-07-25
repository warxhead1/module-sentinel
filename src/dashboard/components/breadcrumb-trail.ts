import { DashboardComponent, defineComponent } from './base-component.js';
import { navigationContext, NavigationContext } from '../utils/navigation-context.js';
import { stateService } from '../services/state.service.js';

/**
 * Breadcrumb Trail Component
 * Shows navigation history and allows quick backtracking
 */
export class BreadcrumbTrail extends DashboardComponent {
  private history: NavigationContext[] = [];
  private currentLocation: string = '';
  
  async loadData(): Promise<void> {
    // No data to load
  }
  
  connectedCallback() {
    super.connectedCallback();
    
    // Listen for navigation events
    window.addEventListener('navigation', this.handleNavigation.bind(this));
    window.addEventListener('hashchange', this.updateBreadcrumbs.bind(this));
    
    // Initial update
    this.updateBreadcrumbs();
  }
  
  disconnectedCallback() {
    window.removeEventListener('navigation', this.handleNavigation.bind(this));
    window.removeEventListener('hashchange', this.updateBreadcrumbs.bind(this));
  }
  
  private handleNavigation(event: any) {
    this.updateBreadcrumbs();
  }
  
  private updateBreadcrumbs() {
    // Get navigation history
    this.history = navigationContext.getHistory().slice(0, 5); // Show last 5 items
    
    // Get current location
    const currentRoute = window.location.hash.replace('#', '') || '/';
    const currentComponent = this.getComponentNameFromRoute(currentRoute);
    this.currentLocation = this.formatLocationName(currentComponent);
    
    // Get current context
    const currentContext = navigationContext.getContext();
    if (currentContext) {
      const contextDisplay = this.getContextDisplay(currentContext);
      if (contextDisplay) {
        this.currentLocation += ` › ${contextDisplay}`;
      }
    }
    
    this.render();
  }
  
  private getComponentNameFromRoute(route: string): string {
    const routeMap: Record<string, string> = {
      '/': 'Overview',
      '/projects': 'Projects',
      '/modules': 'Modules',
      '/namespaces': 'Namespaces',
      '/search': 'Search',
      '/analytics': 'Analytics Hub',
      '/insights': 'Insights',
      '/patterns': 'Patterns',
      '/performance': 'Performance',
      '/relationships': 'Relationships',
      '/impact': 'Impact Analysis',
      '/code-flow': 'Code Flow',
      '/multi-language-flow': 'Multi-Language',
    };
    
    const basePath = route.split('?')[0];
    return routeMap[basePath] || 'Unknown';
  }
  
  private formatLocationName(name: string): string {
    return name.replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  private getContextDisplay(context: NavigationContext): string {
    if (context.selectedSymbol) {
      return context.selectedSymbol.name;
    }
    if (context.selectedFile) {
      return context.selectedFile.path.split('/').pop() || context.selectedFile.path;
    }
    if (context.selectedNamespace) {
      return context.selectedNamespace.name;
    }
    return '';
  }
  
  render() {
    const hasHistory = this.history.length > 0;
    
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
        }
        
        .breadcrumb-trail {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 0;
          font-size: 14px;
          color: #888;
          flex-wrap: wrap;
        }
        
        .breadcrumb-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .breadcrumb-link {
          color: #4ecdc4;
          text-decoration: none;
          transition: all 0.2s ease;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .breadcrumb-link:hover {
          background: rgba(78, 205, 196, 0.1);
          color: #5fe6dc;
        }
        
        .breadcrumb-separator {
          color: #555;
          font-size: 12px;
        }
        
        .current-location {
          color: #ccc;
          font-weight: 500;
        }
        
        .home-link {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #4ecdc4;
          text-decoration: none;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        
        .home-link:hover {
          background: rgba(78, 205, 196, 0.1);
          color: #5fe6dc;
        }
        
        .home-icon {
          font-size: 16px;
        }
        
        .context-badge {
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          color: #4ecdc4;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          margin-left: 8px;
        }
        
        @media (max-width: 768px) {
          .breadcrumb-trail {
            font-size: 12px;
          }
          
          .breadcrumb-separator {
            font-size: 10px;
          }
        }
      </style>
      
      <div class="breadcrumb-trail">
        <a href="#/" class="home-link" onclick="event.preventDefault(); window.location.hash = '/';">
          <span class="home-icon">🏠</span>
          <span>Home</span>
        </a>
        
        ${hasHistory ? this.renderHistory() : ''}
        
        ${hasHistory ? '<span class="breadcrumb-separator">›</span>' : ''}
        
        <span class="current-location">${this.currentLocation}</span>
      </div>
    `;
  }
  
  private renderHistory(): string {
    return this.history.map((context, index) => {
      const locationName = this.formatLocationName(context.sourceComponent);
      const contextDisplay = this.getContextDisplay(context);
      
      return `
        <span class="breadcrumb-separator">›</span>
        <div class="breadcrumb-item">
          <a class="breadcrumb-link" 
             onclick="this.getRootNode().host.navigateToHistory(${index})"
             title="Go back to ${locationName}">
            ${locationName}
            ${contextDisplay ? `<span class="context-badge">${contextDisplay}</span>` : ''}
          </a>
        </div>
      `;
    }).join('');
  }
  
  private navigateToHistory(index: number) {
    const context = this.history[index];
    if (!context) return;
    
    // Restore context
    navigationContext.setContext(context);
    
    // Navigate back
    window.location.hash = context.sourceRoute;
  }
}

defineComponent('breadcrumb-trail', BreadcrumbTrail);