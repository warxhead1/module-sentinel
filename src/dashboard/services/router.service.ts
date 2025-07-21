/**
 * Router Service for Module Sentinel Dashboard
 * Handles client-side routing with proper SPA navigation
 */

export interface Route {
  path: string;
  component: string;
  title?: string;
  guard?: () => boolean | Promise<boolean>;
}

export class RouterService {
  private routes: Route[] = [];
  private currentPath: string = '';
  private outlet: HTMLElement | null = null;
  private isNavigating = false;

  constructor() {
    // Listen for browser navigation
    window.addEventListener('popstate', () => this.handleRoute());
    
    // Listen for custom navigation events
    window.addEventListener('navigate', (e: any) => {
      const path = e.detail?.path;
      if (path) this.navigate(path);
    });
    
    // Intercept link clicks
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
   * Set routes configuration
   */
  setRoutes(routes: Route[]) {
    this.routes = routes;
  }

  /**
   * Set the router outlet element
   */
  setOutlet(element: HTMLElement) {
    this.outlet = element;
    // Handle initial route when outlet is set
    this.handleRoute();
  }

  /**
   * Navigate to a path
   */
  async navigate(path: string, options: { replace?: boolean; state?: any } = {}) {
    if (this.isNavigating || path === this.currentPath) {
      return;
    }

    this.isNavigating = true;

    try {
      // Find matching route
      const route = this.findRoute(path);
      if (!route) {
        console.warn(`No route found for path: ${path}`);
        this.isNavigating = false;
        return;
      }

      // Check route guard
      if (route.guard) {
        const allowed = await route.guard();
        if (!allowed) {
          this.isNavigating = false;
          return;
        }
      }

      // Update browser history
      if (options.replace) {
        window.history.replaceState(options.state || {}, '', path);
      } else {
        window.history.pushState(options.state || {}, '', path);
      }

      // Update current path
      this.currentPath = path;

      // Render component
      await this.renderComponent(route);

      // Update document title
      if (route.title) {
        document.title = `${route.title} - Module Sentinel`;
      }

      // Update active nav
      this.updateActiveNav(path);

      // Emit navigation event
      window.dispatchEvent(new CustomEvent('navigation', {
        detail: { path, route, component: route.component }
      }));

    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Handle route change (from popstate or initial load)
   */
  async handleRoute() {
    const path = window.location.pathname;
    await this.navigate(path, { replace: true });
  }

  /**
   * Find route for path
   */
  private findRoute(path: string): Route | null {
    return this.routes.find(route => {
      // Exact match
      if (route.path === path) return true;
      
      // Parameterized routes (basic support)
      if (route.path.includes(':')) {
        const routeParts = route.path.split('/');
        const pathParts = path.split('/');
        
        if (routeParts.length !== pathParts.length) return false;
        
        return routeParts.every((part, i) => 
          part.startsWith(':') || part === pathParts[i]
        );
      }
      
      return false;
    }) || null;
  }

  /**
   * Render component in outlet
   */
  private async renderComponent(route: Route) {
    if (!this.outlet) {
      console.error('Router outlet not set');
      return;
    }

    try {
      // Add transition class
      this.outlet.classList.add('route-transitioning');

      // Clear current content with fade out
      if (this.outlet.firstElementChild) {
        this.outlet.firstElementChild.classList.add('route-exit');
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Clear outlet
      this.outlet.innerHTML = '';

      // Create and append new component
      const element = document.createElement(route.component);
      
      // Add route data to element
      (element as any).routeData = {
        path: this.currentPath,
        params: this.extractParams(route.path, this.currentPath)
      };

      // Add entrance animation
      element.classList.add('route-enter');
      this.outlet.appendChild(element);

      // Remove transition classes
      requestAnimationFrame(() => {
        element.classList.remove('route-enter');
        this.outlet?.classList.remove('route-transitioning');
      });

    } catch (error) {
      console.error('Error rendering component:', error);
      
      // Show error component
      this.outlet.innerHTML = `
        <div style="
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
        ">
          <h2>Component Load Error</h2>
          <p>Failed to load component: ${route.component}</p>
          <button onclick="window.location.reload()" style="
            margin-top: 20px;
            padding: 10px 20px;
            background: var(--primary-accent);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">Reload Page</button>
        </div>
      `;
    }
  }

  /**
   * Extract parameters from route
   */
  private extractParams(routePath: string, actualPath: string): Record<string, string> {
    const params: Record<string, string> = {};
    
    if (!routePath.includes(':')) return params;
    
    const routeParts = routePath.split('/');
    const pathParts = actualPath.split('/');
    
    routeParts.forEach((part, i) => {
      if (part.startsWith(':')) {
        const paramName = part.substring(1);
        params[paramName] = pathParts[i] || '';
      }
    });
    
    return params;
  }

  /**
   * Update active navigation item
   */
  private updateActiveNav(path: string) {
    // Update nav items in sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
      const linkPath = link.getAttribute('href');
      if (linkPath === path) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update nav items in shadow DOM components
    document.querySelectorAll('nav-sidebar').forEach(sidebar => {
      if ((sidebar as any).updateActiveRoute) {
        (sidebar as any).updateActiveRoute(path);
      }
    });
  }

  /**
   * Go back in history
   */
  back() {
    window.history.back();
  }

  /**
   * Go forward in history
   */
  forward() {
    window.history.forward();
  }

  /**
   * Get current path
   */
  getCurrentPath(): string {
    return this.currentPath;
  }

  /**
   * Get current route
   */
  getCurrentRoute(): Route | null {
    return this.findRoute(this.currentPath);
  }

  /**
   * Check if path is current
   */
  isCurrentPath(path: string): boolean {
    return this.currentPath === path;
  }

  /**
   * Generate URL with parameters
   */
  generateUrl(path: string, params?: Record<string, string>): string {
    let url = path;
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url = url.replace(`:${key}`, encodeURIComponent(value));
      });
    }
    
    return url;
  }
}