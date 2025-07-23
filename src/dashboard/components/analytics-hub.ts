import { DashboardComponent, defineComponent } from './base-component.js';
import * as d3 from 'd3';

/**
 * 🧠 Analytics Hub - Advanced Data Visualization & Intelligence Dashboard
 * 
 * Features:
 * - Interactive relationship graphs with D3.js
 * - Dependency flow diagrams
 * - Symbol distribution charts
 * - Code complexity heatmaps
 * - Language usage analytics
 * - Pattern detection insights
 * - Architecture topology maps
 */
export class AnalyticsHub extends DashboardComponent {
  private activeTab: string = 'relationships';
  private chartData: any = {};
  private d3Available: boolean = false;

  // Navigation cards for different analysis tools (using correct routes)
  private navigationCards = [
    {
      id: 'relationships',
      title: 'Relationship Graph',
      icon: '🕸️',
      description: 'Interactive symbol dependencies and connections',
      route: '/relationships',
      category: 'analysis',
      status: 'available'
    },
    {
      id: 'code-flow',
      title: 'Code Flow Explorer',
      icon: '🌊',
      description: 'Execution paths and control flow analysis',
      route: '/code-flow',
      category: 'analysis',
      status: 'available'
    },
    {
      id: 'enhanced-flow',
      title: 'Enhanced Code Flow',
      icon: '⚡',
      description: 'Advanced control flow with runtime context',
      route: '/enhanced-flow',
      category: 'analysis',
      status: 'available'
    },
    {
      id: 'impact',
      title: 'Impact Analysis',
      icon: '💥',
      description: 'Change impact and ripple effect visualization',
      route: '/impact',
      category: 'analysis',
      status: 'available'
    },
    {
      id: 'multi-language',
      title: 'Multi-Language Flow',
      icon: '🌍',
      description: 'Cross-language interactions and boundaries',
      route: '/multi-language-flow',
      category: 'analysis',
      status: 'available'
    },
    {
      id: 'patterns',
      title: 'Pattern Analyzer',
      icon: '🧩',
      description: 'Design patterns and anti-pattern detection',
      route: '/patterns',
      category: 'intelligence',
      status: 'available'
    },
    {
      id: 'namespace',
      title: 'Namespace Explorer',
      icon: '🗂️',
      description: 'Namespace structure and organization',
      route: '/namespaces',
      category: 'structure',
      status: 'available'
    },
    {
      id: 'insights',
      title: 'Code Insights',
      icon: '💡',
      description: 'Intelligent code recommendations and insights',
      route: '/insights',
      category: 'intelligence',
      status: 'available'
    },
    {
      id: 'performance',
      title: 'Performance Hotspots',
      icon: '🔥',
      description: 'Performance bottlenecks and optimization opportunities',
      route: '/performance',
      category: 'analysis',
      status: 'available'
    },
    {
      id: 'search',
      title: 'Search Interface',
      icon: '🔍',
      description: 'Advanced code search and symbol lookup',
      route: '/search',
      category: 'structure',
      status: 'available'
    }
  ];

  async loadData(): Promise<void> {
    try {
      // Load overview statistics only (no complex visualizations)
      await Promise.allSettled([
        this.loadOverviewStats(),
        this.loadRecentActivity()
      ]);

    } catch (error) {
      console.error('Failed to load analytics overview:', error);
    }
  }

  private async loadOverviewStats(): Promise<void> {
    try {
      const stats = await this.fetchAPI('/api/stats');
      this.chartData.overview = {
        totalSymbols: stats?.total_symbols || 0,
        totalFiles: stats?.total_files || 0,
        namespaces: Object.keys(stats?.kindBreakdown || {}).length,
        languages: stats?.languages?.length || 0,
        complexity: stats?.avg_complexity || 0,
        patterns: stats?.patterns_detected || 0
      };
    } catch (error) {
      console.warn('Failed to load overview stats:', error);
      this.chartData.overview = {
        totalSymbols: 0,
        totalFiles: 0,
        namespaces: 0,
        languages: 0,
        complexity: 0,
        patterns: 0
      };
    }
  }

  private async loadRecentActivity(): Promise<void> {
    try {
      // Mock recent activity for now
      this.chartData.recentActivity = [
        { type: 'analysis', component: 'Relationship Graph', time: '2 minutes ago', icon: '🕸️' },
        { type: 'pattern', component: 'Pattern Analyzer', time: '15 minutes ago', icon: '🧩' },
        { type: 'flow', component: 'Code Flow Explorer', time: '1 hour ago', icon: '🌊' },
        { type: 'impact', component: 'Impact Analysis', time: '2 hours ago', icon: '💥' }
      ];
    } catch (error) {
      console.warn('Failed to load recent activity:', error);
      this.chartData.recentActivity = [];
    }
  }


  render(): void {
    this.shadow.innerHTML = `
      <style>${this.styles()}</style>
      <div class="analytics-hub">
        <div class="hub-header">
          <div class="header-content">
            <h1 class="hub-title">
              <span class="brain-icon">🧠</span>
              Analytics Hub
              <span class="subtitle">Code Intelligence Dashboard</span>
            </h1>
            <div class="stats-overview">
              ${this.renderOverviewStats()}
            </div>
          </div>
        </div>

        <div class="dashboard-container">
          ${this.renderNavigationCards()}
          ${this.renderRecentActivity()}
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private renderOverviewStats(): string {
    const stats = this.chartData.overview || {};
    
    return `
      <div class="stat-card">
        <div class="stat-value">${stats.totalSymbols || 0}</div>
        <div class="stat-label">Total Symbols</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalFiles || 0}</div>
        <div class="stat-label">Files Analyzed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.languages || 0}</div>
        <div class="stat-label">Languages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.patterns || 0}</div>
        <div class="stat-label">Patterns Found</div>
      </div>
    `;
  }

  private renderNavigationCards(): string {
    const cardsByCategory = this.groupCardsByCategory();
    
    return `
      <div class="navigation-section">
        <h2 class="section-title">🚀 Analysis Tools</h2>
        <div class="navigation-grid">
          ${Object.entries(cardsByCategory).map(([category, cards]) => `
            <div class="category-section">
              <h3 class="category-title">${this.getCategoryIcon(category)} ${this.getCategoryTitle(category)}</h3>
              <div class="cards-grid">
                ${(cards as any[]).map(card => `
                  <div class="nav-card" data-route="${card.route}">
                    <div class="card-icon">${card.icon}</div>
                    <div class="card-content">
                      <h4 class="card-title">${card.title}</h4>
                      <p class="card-description">${card.description}</p>
                    </div>
                    <div class="card-status ${card.status}">
                      ${card.status === 'available' ? '✅' : '🚧'}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderRecentActivity(): string {
    const activity = this.chartData.recentActivity || [];
    
    return `
      <div class="activity-section">
        <h2 class="section-title">⏱️ Recent Activity</h2>
        <div class="activity-list">
          ${activity.length > 0 ? activity.map((item: any) => `
            <div class="activity-item">
              <div class="activity-icon">${item.icon}</div>
              <div class="activity-content">
                <div class="activity-title">${item.component}</div>
                <div class="activity-time">${item.time}</div>
              </div>
              <div class="activity-type ${item.type}">
                ${item.type.charAt(0).toUpperCase() + item.type.slice(1)}
              </div>
            </div>
          `).join('') : `
            <div class="no-activity">
              <div class="no-activity-icon">📊</div>
              <div class="no-activity-text">No recent analysis activity</div>
              <div class="no-activity-subtitle">Start exploring your codebase using the tools above</div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  private groupCardsByCategory(): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    this.navigationCards.forEach(card => {
      if (!grouped[card.category]) {
        grouped[card.category] = [];
      }
      grouped[card.category].push(card);
    });
    
    return grouped;
  }

  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'analysis': '🔍',
      'intelligence': '🧠',
      'structure': '🏗️'
    };
    return icons[category] || '📊';
  }

  private getCategoryTitle(category: string): string {
    const titles: Record<string, string> = {
      'analysis': 'Code Analysis',
      'intelligence': 'AI Intelligence', 
      'structure': 'Structure & Navigation'
    };
    return titles[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  private setupEventListeners(): void {
    // Navigation card click listeners
    this.shadow.querySelectorAll('.nav-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const route = target.getAttribute('data-route');
        if (route) {
          this.navigateToRoute(route);
        }
      });
    });
  }

  private navigateToRoute(route: string): void {
    // Remove leading slash for hash navigation
    const hashRoute = route.startsWith('/') ? route.substring(1) : route;
    
    // Try to use router if available, otherwise fallback to hash navigation
    const router = (window as any).dashboardServices?.router;
    if (router) {
      router.navigate(route);
    } else {
      window.location.hash = `#/${hashRoute}`;
    }
    
    console.log(`🚀 Navigating to: ${route}`);
  }






  styles(): string {
    return `
      .analytics-hub {
        padding: 0;
        height: 100vh;
        overflow: auto;
        display: flex;
        flex-direction: column;
        background: linear-gradient(135deg, 
          rgba(147, 112, 219, 0.02) 0%, 
          rgba(186, 85, 211, 0.01) 50%,
          rgba(221, 160, 221, 0.02) 100%);
      }

      .hub-header {
        background: linear-gradient(135deg, 
          rgba(147, 112, 219, 0.1) 0%, 
          rgba(186, 85, 211, 0.05) 100%);
        border-bottom: 1px solid var(--card-border);
        padding: 24px 32px;
        backdrop-filter: blur(10px);
      }

      .header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 1400px;
        margin: 0 auto;
      }

      .hub-title {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(45deg, #9370db, #ba55d3, #dda0dd);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
        position: relative;
      }

      .brain-icon {
        font-size: 3rem;
        animation: pulse 2s infinite ease-in-out;
        filter: drop-shadow(0 0 10px rgba(147, 112, 219, 0.5));
      }

      .subtitle {
        font-size: 1rem;
        color: var(--text-muted);
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-left: 8px;
      }

      .stats-overview {
        display: flex;
        gap: 20px;
      }

      .stat-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 16px 20px;
        text-align: center;
        min-width: 100px;
        transition: var(--transition-smooth);
      }

      .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
        background: rgba(147, 112, 219, 0.1);
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--primary-accent);
        display: block;
        line-height: 1;
      }

      .stat-label {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .dashboard-container {
        flex: 1;
        overflow: auto;
        padding: 32px;
        background: var(--bg-primary);
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 32px;
        max-width: 1400px;
        margin: 0 auto;
        width: 100%;
      }

      .navigation-section {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        padding: 24px;
        box-shadow: var(--shadow-medium);
      }

      .activity-section {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        padding: 24px;
        box-shadow: var(--shadow-medium);
        height: fit-content;
      }

      .section-title {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 24px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .navigation-grid {
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .category-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .category-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--primary-accent);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(147, 112, 219, 0.2);
      }

      .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }

      .nav-card {
        background: var(--bg-secondary);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: flex-start;
        gap: 16px;
        position: relative;
        overflow: hidden;
        background-image: linear-gradient(
          135deg,
          rgba(147, 112, 219, 0.05) 0%,
          rgba(78, 205, 196, 0.05) 100%
        );
        background-size: 200% 200%;
      }

      .nav-card:hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow: 
          0 10px 30px rgba(147, 112, 219, 0.3),
          0 0 40px rgba(78, 205, 196, 0.1);
        border-color: var(--primary-accent);
        background: rgba(147, 112, 219, 0.08);
        animation: gradient-shift 3s ease infinite;
      }

      .nav-card:active {
        transform: translateY(-2px) scale(1.01);
      }

      .card-icon {
        font-size: 2.5rem;
        min-width: 50px;
        text-align: center;
        filter: drop-shadow(0 0 8px rgba(147, 112, 219, 0.4));
      }

      .card-content {
        flex: 1;
      }

      .card-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 8px 0;
      }

      .card-description {
        font-size: 0.9rem;
        color: var(--text-secondary);
        line-height: 1.4;
        margin: 0;
      }

      .card-status {
        position: absolute;
        top: 12px;
        right: 12px;
        font-size: 1.2rem;
        filter: hue-rotate(20deg) brightness(0.8);
        opacity: 0.9;
      }

      .card-status.available {
        color: #4ecdc4;
      }

      /* Activity Section Styles */
      .activity-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .activity-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: var(--bg-secondary);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        transition: var(--transition-smooth);
      }

      .activity-item:hover {
        background: rgba(147, 112, 219, 0.05);
        border-color: var(--primary-accent);
      }

      .activity-icon {
        font-size: 1.8rem;
        min-width: 40px;
        text-align: center;
        filter: drop-shadow(0 0 6px rgba(147, 112, 219, 0.3));
      }

      .activity-content {
        flex: 1;
      }

      .activity-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 4px;
      }

      .activity-time {
        font-size: 0.8rem;
        color: var(--text-muted);
      }

      .activity-type {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .activity-type.analysis {
        background: rgba(147, 112, 219, 0.2);
        color: var(--primary-accent);
      }

      .activity-type.pattern {
        background: rgba(255, 193, 7, 0.2);
        color: #ff9800;
      }

      .activity-type.flow {
        background: rgba(33, 150, 243, 0.2);
        color: #2196f3;
      }

      .activity-type.impact {
        background: rgba(244, 67, 54, 0.2);
        color: #f44336;
      }

      .no-activity {
        text-align: center;
        padding: 32px 16px;
        color: var(--text-muted);
      }

      .no-activity-icon {
        font-size: 3rem;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .no-activity-text {
        font-size: 1.1rem;
        font-weight: 500;
        margin-bottom: 8px;
      }

      .no-activity-subtitle {
        font-size: 0.9rem;
        opacity: 0.8;
      }



      @keyframes pulse {
        0%, 100% { 
          transform: scale(1);
          filter: drop-shadow(0 0 10px rgba(147, 112, 219, 0.5));
        }
        50% { 
          transform: scale(1.05);
          filter: drop-shadow(0 0 20px rgba(147, 112, 219, 0.8));
        }
      }

      /* Responsive design */
      @media (max-width: 1200px) {
        .dashboard-container {
          grid-template-columns: 1fr;
          gap: 24px;
        }
        
        .header-content {
          flex-direction: column;
          gap: 20px;
          text-align: center;
        }
        
        .stats-overview {
          justify-content: center;
        }

        .cards-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .hub-header {
          padding: 16px 20px;
        }
        
        .dashboard-container {
          padding: 16px;
          gap: 16px;
        }
        
        .navigation-section,
        .activity-section {
          padding: 16px;
        }
        
        .section-title {
          font-size: 1.3rem;
        }

        .nav-card {
          padding: 16px;
        }

        .card-icon {
          font-size: 2rem;
          min-width: 40px;
        }

        .stats-overview {
          flex-wrap: wrap;
          gap: 12px;
        }

        .stat-card {
          min-width: 80px;
        }
      }
    `;
  }
}

defineComponent('analytics-hub', AnalyticsHub);