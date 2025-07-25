/**
 * Module Sentinel Dashboard v2.0
 * Modern SPA entry point with Vite integration
 */

// Import services
import { ApiService } from './services/api.service';
import { RouterService } from './services/router.service';
import { StateService } from './services/state.service';

// Import components
import './components/nav-sidebar';
import './components/dashboard-overview';
import './components/project-manager';
import './components/modules-page';
import './components/namespace-explorer';
import './components/analytics-hub';
import './components/insights-dashboard';
import './components/relationship-graph';
import './components/pattern-analyzer';
import './components/performance-hotspots';
import './components/search-interface';
import './components/code-flow-explorer';
import './components/enhanced-code-flow';
import './components/multi-language-flow-explorer';
import './components/impact-visualization';
import './components/symbol-selector-modal';
import './components/not-found';

class DashboardApp {
  private apiService: ApiService;
  private routerService: RouterService;
  private stateService: StateService;

  constructor() {
    // Initialize services
    this.apiService = new ApiService('/api');
    this.stateService = new StateService();
    this.routerService = new RouterService();

    // Make services globally available
    (window as any).dashboardServices = {
      api: this.apiService,
      state: this.stateService,
      router: this.routerService
    };
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Module Sentinel Dashboard v2.0...');

      // Check API health
      const health = await this.apiService.checkHealth();
      if (!health.success) {
        throw new Error(`API health check failed: ${health.error}`);
      }

      // Load initial data
      await this.loadInitialData();

      // Setup router
      this.setupRouter();

      // Setup global error handling
      this.setupErrorHandling();

      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts();

      // Hide loading screen and show app
      this.showApp();

      console.log('✅ Dashboard initialized successfully!');
    } catch (error) {
      console.error('❌ Dashboard initialization failed:', error);
      this.showError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Load initial data from API
   */
  private async loadInitialData() {
    try {
      // Load stats
      const stats = await this.apiService.getStats();
      if (stats.success && stats.data) {
        this.stateService.setState('stats', stats.data);
      }

      // Load namespaces
      const namespaces = await this.apiService.getNamespaces();
      if (namespaces.success && namespaces.data) {
        this.stateService.setState('namespaces', namespaces.data);
      }
    } catch (error) {
      console.warn('Failed to load initial data:', error);
      // Non-fatal, continue initialization
    }
  }

  /**
   * Setup router
   */
  private setupRouter() {
    const routes = [
      { path: '/', component: 'dashboard-overview' },
      { path: '/projects', component: 'project-manager' },
      { path: '/modules', component: 'modules-page' },
      { path: '/namespaces', component: 'namespace-explorer' },
      { path: '/analytics', component: 'analytics-hub' },
      { path: '/insights', component: 'insights-dashboard' },
      { path: '/relationships', component: 'relationship-graph' },
      { path: '/patterns', component: 'pattern-analyzer' },
      { path: '/performance', component: 'performance-hotspots' },
      { path: '/search', component: 'search-interface' },
      { path: '/code-flow', component: 'code-flow-explorer' },
      { path: '/enhanced-flow', component: 'enhanced-code-flow' },
      { path: '/multi-language-flow', component: 'multi-language-flow-explorer' },
      { path: '/impact', component: 'impact-visualization' }
    ];

    this.routerService.setRoutes(routes);
    
    const outlet = document.querySelector('router-outlet');
    if (outlet) {
      this.routerService.setOutlet(outlet as HTMLElement);
      // Initial route is now handled in setOutlet
    } else {
      console.error('Router outlet not found!');
    }
  }

  /**
   * Setup global error handling
   */
  private setupErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.stateService.setState('lastError', {
        message: event.error?.message || 'Unknown error',
        timestamp: Date.now()
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.stateService.setState('lastError', {
        message: event.reason?.message || 'Promise rejection',
        timestamp: Date.now()
      });
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.routerService.navigate('/search');
      }

      // Ctrl/Cmd + / for help
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        // TODO: Show help modal
        console.log('Help shortcut triggered');
      }
    });
  }

  /**
   * Show the app and hide loading screen
   */
  private showApp() {
    const loading = document.getElementById('loading');
    const app = document.getElementById('app');

    if (loading) {
      loading.style.display = 'none';
    }

    if (app) {
      app.style.display = 'flex';
    }
  }

  /**
   * Show error screen
   */
  private showError(message: string) {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.innerHTML = `
        <div class="loading-content">
          <h2 style="color: #ff6b6b; margin-bottom: 20px;">Failed to load dashboard</h2>
          <p style="color: #c9c9dd; margin-bottom: 10px;">Please refresh the page or check your connection.</p>
          <p style="color: #999; font-size: 0.9rem; font-family: monospace;">${message}</p>
          <button onclick="window.location.reload()" style="
            margin-top: 20px;
            padding: 10px 20px;
            background: var(--primary-accent);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Retry</button>
        </div>
      `;
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    const app = new DashboardApp();
    await app.initialize();
  });
} else {
  const app = new DashboardApp();
  app.initialize();
}