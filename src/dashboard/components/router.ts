/**
 * Client-side router for the dashboard SPA
 */
export class DashboardRouter {
  private routes: Map<string, string> = new Map();
  private currentPath: string = '/';
  private outlet: HTMLElement | null = null;

  constructor() {
    // Define routes
    this.routes.set('/', 'dashboard-overview');
    this.routes.set('/projects', 'project-manager');
    this.routes.set('/modules', 'modules-page');
    this.routes.set('/namespaces', 'namespace-explorer');
    this.routes.set('/analytics', 'analytics-hub');
    this.routes.set('/insights', 'insights-dashboard');
    this.routes.set('/patterns', 'pattern-analyzer');
    this.routes.set('/performance', 'performance-hotspots');
    this.routes.set('/search', 'search-interface');
    this.routes.set('/code-flow', 'code-flow-explorer');
    this.routes.set('/enhanced-flow', 'enhanced-code-flow');

    // Listen for browser navigation
    window.addEventListener('popstate', () => this.handleRoute());
    
    // Listen for custom navigation events (from shadow DOM components)
    window.addEventListener('navigate', (e: any) => {
      const path = e.detail?.path;
      if (path) this.navigate(path);
    });
    
    // Intercept link clicks (for non-shadow DOM links)
    document.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('a[href^="/"]');
      if (link && link instanceof HTMLAnchorElement) {
        e.preventDefault();
        const path = link.getAttribute('href');
        if (path) this.navigate(path);
      }
    });
  }

  /**
   * Set the router outlet element
   */
  setOutlet(element: HTMLElement) {
    this.outlet = element;
    // Handle initial route
    this.handleRoute();
  }

  /**
   * Navigate to a path
   */
  navigate(path: string) {
    if (path !== this.currentPath) {
      window.history.pushState({}, '', path);
      this.handleRoute();
    }
  }

  /**
   * Handle route change
   */
  private handleRoute() {
    const path = window.location.pathname;
    const component = this.routes.get(path) || 'not-found';
    
    if (this.outlet) {
      // Clear current content
      this.outlet.innerHTML = '';
      
      // Create and append new component
      const element = document.createElement(component);
      this.outlet.appendChild(element);
      
      // Update active nav item
      this.updateActiveNav(path);
      
      this.currentPath = path;
      
      // Emit navigation event
      window.dispatchEvent(new CustomEvent('navigation', {
        detail: { path, component }
      }));
    }
  }

  /**
   * Update active navigation item
   */
  private updateActiveNav(path: string) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const linkPath = link.getAttribute('href');
      if (linkPath === path) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /**
   * Get current path
   */
  getCurrentPath(): string {
    return this.currentPath;
  }
}

// Create singleton instance
export const router = new DashboardRouter();