import { DashboardComponent, defineComponent } from './base-component.js';
import './project-selector.js';

interface NavItem {
  path: string;
  icon: string;
  title: string;
  isSection?: boolean;
}

/**
 * Sidebar navigation component
 */
export class NavSidebar extends DashboardComponent {
  private navItems: NavItem[] = [
    { path: '/', icon: '📊', title: 'Overview' },
    { path: '/projects', icon: '🏗️', title: 'Projects' },
    { path: '/modules', icon: '🗂️', title: 'Modules' },
    { path: '/namespaces', icon: '📦', title: 'Namespaces' },
    { path: '/search', icon: '🔍', title: 'Search' },
    { 
      path: '', 
      icon: '🔬', 
      title: 'Analysis', 
      isSection: true 
    },
    { path: '/analytics', icon: '🧠', title: 'Analytics Hub' },
    { path: '/insights', icon: '💡', title: 'Insights' },
    { path: '/patterns', icon: '🧩', title: 'Patterns' },
    { path: '/performance', icon: '🔥', title: 'Performance' },
    { 
      path: '', 
      icon: '🌐', 
      title: 'Visualization', 
      isSection: true 
    },
    { path: '/relationships', icon: '🕸️', title: 'Relationships' },
    { path: '/impact', icon: '💥', title: 'Impact Analysis' },
    { path: '/code-flow', icon: '🌊', title: 'Code Flow' },
    { path: '/multi-language-flow', icon: '🌍', title: 'Multi-Language Explorer' },
    { path: '/enhanced-flow', icon: '🎯', title: 'Enhanced Flow' }
  ];

  async loadData(): Promise<void> {
    // No data to load for navigation
  }

  connectedCallback() {
    // Don't call super.connectedCallback() to avoid listening to selection-changed events
    this.render();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Handle navigation clicks
    this.shadow.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('.nav-link');
      if (link && link instanceof HTMLAnchorElement) {
        e.preventDefault();
        const path = link.getAttribute('href');
        if (path && !link.classList.contains('section-header')) {
          // Use hash navigation
          window.location.hash = path;
          
          // Dispatch navigation event for router
          window.dispatchEvent(new CustomEvent('navigate', {
            detail: { path }
          }));
          
          // Re-render to update active state
          this.render();
        }
      }
    });
    
    // Listen for hash changes to update active state
    window.addEventListener('hashchange', () => {
      this.render();
    });
  }

  render() {
    const currentPath = window.location.hash.replace('#', '') || '/';
    
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          width: 279px; /* 280px - 1px border */
          min-width: 279px;
          max-width: 279px;
          height: 100vh;
          background: linear-gradient(180deg, 
            rgba(255, 255, 255, 0.05) 0%, 
            rgba(255, 255, 255, 0.02) 100%);
          backdrop-filter: blur(20px);
          border-right: 1px solid var(--card-border);
          overflow-y: auto;
          overflow-x: hidden;
          box-shadow: var(--shadow-medium);
          position: relative;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        
        .logo {
          text-align: center;
          padding: 40px 24px;
          border-bottom: 1px solid var(--card-border);
          position: relative;
        }
        
        .logo::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 2px;
          background: linear-gradient(90deg, 
            transparent, 
            var(--primary-accent), 
            transparent);
        }
        
        .logo h1 {
          font-size: 2rem;
          font-weight: 700;
          background: linear-gradient(to right, #e6e6fa, #dda0dd, #ba55d3);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
          animation: glow 3s ease-in-out infinite alternate;
        }
        
        .subtitle {
          font-size: 0.875rem;
          color: var(--text-muted);
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        
        .nav-menu {
          list-style: none;
          padding: 24px 0;
          margin: 0;
        }
        
        .nav-link {
          display: flex;
          align-items: center;
          padding: 16px 24px;
          margin: 2px 12px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: var(--transition-smooth);
          border-radius: var(--border-radius);
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        
        .nav-link::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          width: 3px;
          background: var(--primary-accent);
          transform: scaleY(0);
          transition: var(--transition-smooth);
        }
        
        .nav-link:hover {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--text-primary);
          transform: translateX(4px);
          box-shadow: var(--shadow-soft);
        }
        
        .nav-link:hover::before {
          transform: scaleY(1);
        }
        
        .nav-link.active {
          background: rgba(100, 255, 218, 0.1);
          border: 1px solid rgba(100, 255, 218, 0.2);
          color: var(--primary-accent);
          transform: translateX(8px);
          box-shadow: var(--shadow-soft), 0 0 20px rgba(100, 255, 218, 0.1);
        }
        
        .nav-link.active::before {
          transform: scaleY(1);
        }
        
        .nav-icon {
          font-size: 1.25rem;
          margin-right: 16px;
          width: 24px;
          text-align: center;
          transition: var(--transition-smooth);
        }
        
        .nav-link:hover .nav-icon,
        .nav-link.active .nav-icon {
          transform: scale(1.1);
        }
        
        .nav-title {
          font-weight: 500;
          font-size: 0.95rem;
          letter-spacing: 0.01em;
        }
        
        .section-header {
          padding: 16px 24px 8px 24px;
          margin: 16px 12px 8px 12px;
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-bottom: 1px solid var(--card-border);
          background: none !important;
          cursor: default;
        }
        
        .section-header:hover {
          transform: none !important;
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        .section-header .nav-icon {
          opacity: 0.7;
        }
        
        .status {
          padding: 24px;
          border-top: 1px solid var(--card-border);
          margin-top: auto;
          background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.02), 
            rgba(255, 255, 255, 0.01));
        }
        
        .status-indicator {
          display: flex;
          align-items: center;
          font-size: 0.875rem;
          color: var(--text-muted);
          padding: 12px 16px;
          border-radius: var(--border-radius);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          backdrop-filter: blur(10px);
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--primary-accent);
          margin-right: 12px;
          animation: pulse 2s infinite;
          box-shadow: 0 0 10px rgba(100, 255, 218, 0.5);
        }
        
        @keyframes pulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.6;
            transform: scale(1.1);
          }
        }
      </style>
      
      <div class="logo">
        <h1>Module Sentinel</h1>
        <div class="subtitle">Code Intelligence</div>
      </div>
      
      <project-selector></project-selector>
      
      <ul class="nav-menu">
        ${this.navItems.map(item => {
          if (item.isSection) {
            return `
              <li>
                <div class="nav-link section-header">
                  <span class="nav-icon">${item.icon}</span>
                  <span class="nav-title">${item.title}</span>
                </div>
              </li>
            `;
          } else {
            return `
              <li>
                <a href="${item.path}" class="nav-link ${currentPath === item.path ? 'active' : ''}">
                  <span class="nav-icon">${item.icon}</span>
                  <span class="nav-title">${item.title}</span>
                </a>
              </li>
            `;
          }
        }).join('')}
      </ul>
      
      <div class="status">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>System Online</span>
        </div>
      </div>
    `;
  }
}

defineComponent('nav-sidebar', NavSidebar);