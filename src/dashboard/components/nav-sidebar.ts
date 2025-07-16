import { DashboardComponent, defineComponent } from './base-component.js';

/**
 * Sidebar navigation component
 */
export class NavSidebar extends DashboardComponent {
  private navItems = [
    { path: '/', icon: '📊', title: 'Overview' },
    { path: '/code-flow', icon: '🌊', title: 'Code Flow' },
    { path: '/relationships', icon: '🕸️', title: 'Relationships' },
    { path: '/patterns', icon: '🏗️', title: 'Patterns' },
    { path: '/performance', icon: '🔥', title: 'Performance' },
    { path: '/namespaces', icon: '📦', title: 'Namespaces' },
    { path: '/search', icon: '🔍', title: 'Search' }
  ];

  async loadData(): Promise<void> {
    // No data to load for navigation
  }

  render() {
    const currentPath = window.location.pathname;
    
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
          background: linear-gradient(135deg, var(--primary-accent), var(--secondary-accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 12px 0;
          letter-spacing: -0.5px;
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
      
      <ul class="nav-menu">
        ${this.navItems.map(item => `
          <li>
            <a href="${item.path}" class="nav-link ${currentPath === item.path ? 'active' : ''}">
              <span class="nav-icon">${item.icon}</span>
              <span class="nav-title">${item.title}</span>
            </a>
          </li>
        `).join('')}
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