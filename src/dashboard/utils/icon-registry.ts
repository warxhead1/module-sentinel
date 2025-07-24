/**
 * IconRegistry - Centralized icon management for the dashboard
 * Supports both Unicode symbols and inline SVG icons
 */

export interface IconDefinition {
  type: 'unicode' | 'svg';
  content: string;
  size?: number;
  color?: string;
  description?: string;
}

export class IconRegistry {
  private static instance: IconRegistry;
  private icons: Map<string, IconDefinition> = new Map();

  private constructor() {
    this.registerDefaultIcons();
  }

  static getInstance(): IconRegistry {
    if (!IconRegistry.instance) {
      IconRegistry.instance = new IconRegistry();
    }
    return IconRegistry.instance;
  }

  /**
   * Register default icons used throughout the dashboard
   */
  private registerDefaultIcons(): void {
    // Search and analysis icons
    this.register('search', { type: 'unicode', content: '🔍', description: 'Search' });
    this.register('analyze', { type: 'unicode', content: '📊', description: 'Analyze' });
    this.register('hotspots', { type: 'unicode', content: '🔥', description: 'Hotspots' });
    this.register('tags', { type: 'unicode', content: '🏷️', description: 'Tags' });
    
    // Project management icons
    this.register('add', { type: 'unicode', content: '➕', description: 'Add new' });
    this.register('sync', { type: 'unicode', content: '🔄', description: 'Sync' });
    this.register('recent', { type: 'unicode', content: '⚡', description: 'Recent' });
    this.register('stats', { type: 'unicode', content: '📈', description: 'Statistics' });
    
    // Language and code icons
    this.register('cross-ref', { type: 'unicode', content: '🌐', description: 'Cross references' });
    this.register('patterns', { type: 'unicode', content: '🧩', description: 'Patterns' });
    this.register('focus', { type: 'unicode', content: '🎯', description: 'Focus' });
    this.register('report', { type: 'unicode', content: '📋', description: 'Report' });
    
    // Navigation icons
    this.register('expand', { type: 'unicode', content: '▶', description: 'Expand' });
    this.register('collapse', { type: 'unicode', content: '▼', description: 'Collapse' });
    this.register('info', { type: 'unicode', content: 'ℹ️', description: 'Information' });
    this.register('settings', { type: 'unicode', content: '⚙️', description: 'Settings' });
    
    // Status indicators
    this.register('success', { type: 'unicode', content: '✅', description: 'Success' });
    this.register('warning', { type: 'unicode', content: '⚠️', description: 'Warning' });
    this.register('error', { type: 'unicode', content: '❌', description: 'Error' });
    this.register('loading', { type: 'unicode', content: '⏳', description: 'Loading' });
    
    // Trend indicators
    this.register('trend-up', { type: 'unicode', content: '↑', description: 'Trending up', color: '#4ade80' });
    this.register('trend-down', { type: 'unicode', content: '↓', description: 'Trending down', color: '#f87171' });
    this.register('trend-stable', { type: 'unicode', content: '→', description: 'Stable', color: '#94a3b8' });
    
    // SVG icons for more complex visuals
    this.register('graph', {
      type: 'svg',
      content: `<svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="19" r="2"/>
        <circle cx="12" cy="5" r="2"/>
        <circle cx="19" cy="12" r="2"/>
        <path d="M6.5 17.5l4-10m2 2l4 4" stroke="currentColor" stroke-width="2" fill="none"/>
      </svg>`,
      description: 'Graph visualization'
    });
    
    this.register('layers', {
      type: 'svg',
      content: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
        <path d="M12 6L4 10v7c0 3.85 2.67 7.46 6.26 8.35.24-.11.49-.23.74-.35 3.59-.89 6-4.5 6-8V10l-5-4z" opacity="0.5"/>
      </svg>`,
      description: 'Layers'
    });
    
    this.register('code-flow', {
      type: 'svg',
      content: `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 2v6h6V2h7v20h-7v-6H9v6H2V2h7zm0 8v4h6v-4H9z"/>
      </svg>`,
      description: 'Code flow'
    });
  }

  /**
   * Register a new icon
   */
  register(name: string, definition: IconDefinition): void {
    this.icons.set(name, definition);
  }

  /**
   * Get an icon definition
   */
  get(name: string): IconDefinition | undefined {
    return this.icons.get(name);
  }

  /**
   * Render an icon as HTML element
   */
  render(name: string, options?: {
    size?: number;
    color?: string;
    className?: string;
    title?: string;
  }): HTMLElement {
    const icon = this.get(name);
    if (!icon) {
      console.warn(`Icon "${name}" not found in registry`);
      return this.renderFallback(name, options);
    }

    const element = document.createElement('span');
    element.className = `icon icon-${name} ${options?.className || ''}`;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', options?.title || icon.description || name);
    
    if (options?.title) {
      element.title = options.title;
    }

    const size = options?.size || icon.size || 16;
    const color = options?.color || icon.color || 'currentColor';

    if (icon.type === 'unicode') {
      element.textContent = icon.content;
      element.style.fontSize = `${size}px`;
      element.style.color = color;
      element.style.display = 'inline-block';
      element.style.lineHeight = '1';
    } else if (icon.type === 'svg') {
      element.innerHTML = icon.content;
      const svg = element.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', size.toString());
        svg.setAttribute('height', size.toString());
        svg.style.color = color;
      }
    }

    return element;
  }

  /**
   * Render fallback icon for missing icons
   */
  private renderFallback(name: string, options?: any): HTMLElement {
    const element = document.createElement('span');
    element.className = `icon icon-fallback ${options?.className || ''}`;
    element.textContent = '❓';
    element.title = `Missing icon: ${name}`;
    element.style.fontSize = `${options?.size || 16}px`;
    element.style.color = options?.color || '#666';
    return element;
  }

  /**
   * Get all registered icon names
   */
  getIconNames(): string[] {
    return Array.from(this.icons.keys());
  }

  /**
   * Create an icon button with click handler
   */
  createIconButton(name: string, options: {
    onClick: () => void;
    tooltip?: string;
    size?: number;
    className?: string;
    badge?: number;
  }): HTMLElement {
    const button = document.createElement('button');
    button.className = `icon-button ${options.className || ''}`;
    button.setAttribute('type', 'button');
    
    const icon = this.render(name, {
      size: options.size,
      title: options.tooltip
    });
    button.appendChild(icon);
    
    if (options.badge !== undefined && options.badge > 0) {
      const badge = document.createElement('span');
      badge.className = 'icon-badge';
      badge.textContent = options.badge > 99 ? '99+' : options.badge.toString();
      button.appendChild(badge);
    }
    
    button.addEventListener('click', options.onClick);
    
    return button;
  }
}

// Export singleton instance
export const iconRegistry = IconRegistry.getInstance();