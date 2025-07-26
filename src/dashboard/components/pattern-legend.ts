/**
 * PatternLegend Component
 * 
 * Interactive legend displaying detected patterns, their families, health status,
 * and providing filtering capabilities for the relationship graph.
 */

import { GraphNode } from '../../shared/types/api.js';
import { GraphThemeManager } from '../utils/graph-theme-manager.js';
import { PatternNodeCategorizer, PatternDefinition } from '../services/pattern-node-categorizer.js';

export interface PatternLegendConfig {
  showStatistics: boolean;
  showHealthIndicators: boolean;
  showPatternIcons: boolean;
  collapsible: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface PatternFilter {
  families: Set<string>;
  patterns: Set<string>;
  healthLevels: Set<string>;
  roles: Set<string>;
}

export class PatternLegend {
  private container: HTMLElement;
  private themeManager: GraphThemeManager;
  private categorizer: PatternNodeCategorizer;
  private config: PatternLegendConfig;
  private currentNodes: GraphNode[] = [];
  private activeFilters: PatternFilter;
  private onFilterChangeCallback?: (filters: PatternFilter) => void;

  constructor(
    container: HTMLElement,
    themeManager: GraphThemeManager,
    categorizer: PatternNodeCategorizer,
    config: Partial<PatternLegendConfig> = {}
  ) {
    this.container = container;
    this.themeManager = themeManager;
    this.categorizer = categorizer;
    
    // Default configuration
    this.config = {
      showStatistics: true,
      showHealthIndicators: true,
      showPatternIcons: true,
      collapsible: true,
      position: 'top-right',
      ...config
    };

    // Initialize filters (everything enabled by default)
    this.activeFilters = {
      families: new Set(),
      patterns: new Set(),
      healthLevels: new Set(),
      roles: new Set()
    };

    this.initialize();
  }

  /**
   * Initialize the legend component
   */
  private initialize(): void {
    this.createLegendStructure();
    this.setupEventListeners();
  }

  /**
   * Update legend with new node data
   */
  public updateNodes(nodes: GraphNode[]): void {
    this.currentNodes = nodes;
    this.refreshContent();
  }

  /**
   * Set callback for filter changes
   */
  public onFilterChange(callback: (filters: PatternFilter) => void): void {
    this.onFilterChangeCallback = callback;
  }

  /**
   * Create the basic legend structure
   */
  private createLegendStructure(): void {
    const legendElement = document.createElement('div');
    legendElement.className = `pattern-legend pattern-legend--${this.config.position}`;
    legendElement.innerHTML = `
      <div class="pattern-legend__header">
        <h3 class="pattern-legend__title">
          <span class="pattern-legend__icon">🎨</span>
          Pattern Analysis
        </h3>
        ${this.config.collapsible ? '<button class="pattern-legend__toggle" aria-label="Toggle legend">▼</button>' : ''}
      </div>
      <div class="pattern-legend__content">
        <div class="pattern-legend__statistics"></div>
        <div class="pattern-legend__families"></div>
        <div class="pattern-legend__health"></div>
        <div class="pattern-legend__controls">
          <button class="pattern-legend__clear-filters">Clear Filters</button>
          <button class="pattern-legend__reset-view">Reset View</button>
        </div>
      </div>
    `;

    this.container.appendChild(legendElement);
    this.applyStyles();
  }

  /**
   * Refresh legend content with current nodes
   */
  private refreshContent(): void {
    if (this.currentNodes.length === 0) {
      this.showEmptyState();
      return;
    }

    this.updateStatistics();
    this.updatePatternFamilies();
    this.updateHealthIndicators();
  }

  /**
   * Update statistics section
   */
  private updateStatistics(): void {
    const statsContainer = this.container.querySelector('.pattern-legend__statistics') as HTMLElement;
    if (!statsContainer || !this.config.showStatistics) return;

    const stats = this.themeManager.getPatternStatistics(this.currentNodes);
    
    statsContainer.innerHTML = `
      <div class="pattern-statistics">
        <div class="pattern-statistics__overview">
          <span class="pattern-statistics__total">${stats.totalPatterns}</span>
          <span class="pattern-statistics__label">Patterns Detected</span>
        </div>
        <div class="pattern-statistics__top-patterns">
          <h4>Most Common:</h4>
          ${stats.topPatterns.map(pattern => `
            <div class="pattern-statistics__pattern">
              <span class="pattern-statistics__pattern-name">${pattern.name}</span>
              <span class="pattern-statistics__pattern-count">${pattern.count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Update pattern families section
   */
  private updatePatternFamilies(): void {
    const familiesContainer = this.container.querySelector('.pattern-legend__families') as HTMLElement;
    if (!familiesContainer) return;

    const stats = this.themeManager.getPatternStatistics(this.currentNodes);
    const families = this.categorizer.getPatternFamilies();

    familiesContainer.innerHTML = `
      <div class="pattern-families">
        <h4>Pattern Families:</h4>
        ${families.map(family => {
          const count = stats.patternsByFamily[family] || 0;
          const isActive = this.activeFilters.families.size === 0 || this.activeFilters.families.has(family);
          const patterns = this.categorizer.getPatternsByFamily(family);
          
          return `
            <div class="pattern-family ${isActive ? 'pattern-family--active' : 'pattern-family--inactive'}">
              <div class="pattern-family__header" data-family="${family}">
                <div class="pattern-family__color" style="background-color: ${this.getFamilyColor(family)}"></div>
                <span class="pattern-family__name">${this.capitalize(family)}</span>
                <span class="pattern-family__count">${count}</span>
                <button class="pattern-family__toggle">▼</button>
              </div>
              <div class="pattern-family__patterns">
                ${patterns.map(pattern => {
                  const patternCount = this.currentNodes.filter(node => 
                    node.patterns?.primaryPattern?.name === pattern.name
                  ).length;
                  const isPatternActive = this.activeFilters.patterns.size === 0 || this.activeFilters.patterns.has(pattern.name);
                  
                  return `
                    <div class="pattern-item ${isPatternActive ? 'pattern-item--active' : 'pattern-item--inactive'}" 
                         data-pattern="${pattern.name}">
                      ${this.config.showPatternIcons ? `<span class="pattern-item__icon">${this.getPatternIcon(pattern.name)}</span>` : ''}
                      <span class="pattern-item__name">${pattern.name}</span>
                      <span class="pattern-item__count">${patternCount}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * Update health indicators section
   */
  private updateHealthIndicators(): void {
    const healthContainer = this.container.querySelector('.pattern-legend__health') as HTMLElement;
    if (!healthContainer || !this.config.showHealthIndicators) return;

    const stats = this.themeManager.getPatternStatistics(this.currentNodes);
    const healthLevels = ['healthy', 'warning', 'problematic', 'anti-pattern'];

    healthContainer.innerHTML = `
      <div class="pattern-health">
        <h4>Pattern Health:</h4>
        <div class="pattern-health__indicators">
          ${healthLevels.map(health => {
            const count = stats.healthDistribution[health] || 0;
            const isActive = this.activeFilters.healthLevels.size === 0 || this.activeFilters.healthLevels.has(health);
            
            return `
              <div class="health-indicator ${isActive ? 'health-indicator--active' : 'health-indicator--inactive'}" 
                   data-health="${health}">
                <div class="health-indicator__visual">
                  <div class="health-indicator__border" style="${this.getHealthBorderStyle(health)}"></div>
                  <span class="health-indicator__icon">${this.getHealthIcon(health)}</span>
                </div>
                <div class="health-indicator__info">
                  <span class="health-indicator__name">${this.capitalize(health.replace('-', ' '))}</span>
                  <span class="health-indicator__count">${count}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners for interactive elements
   */
  private setupEventListeners(): void {
    this.container.addEventListener('click', this.handleClick.bind(this));
  }

  /**
   * Handle click events on legend elements
   */
  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Toggle legend collapse
    if (target.classList.contains('pattern-legend__toggle')) {
      this.toggleLegend();
      return;
    }

    // Clear filters
    if (target.classList.contains('pattern-legend__clear-filters')) {
      this.clearFilters();
      return;
    }

    // Reset view
    if (target.classList.contains('pattern-legend__reset-view')) {
      this.resetView();
      return;
    }

    // Toggle pattern family
    if (target.closest('.pattern-family__header')) {
      const family = target.closest('.pattern-family__header')?.getAttribute('data-family');
      if (family) {
        this.toggleFamilyFilter(family);
      }
      return;
    }

    // Toggle specific pattern
    if (target.closest('.pattern-item')) {
      const pattern = target.closest('.pattern-item')?.getAttribute('data-pattern');
      if (pattern) {
        this.togglePatternFilter(pattern);
      }
      return;
    }

    // Toggle health level
    if (target.closest('.health-indicator')) {
      const health = target.closest('.health-indicator')?.getAttribute('data-health');
      if (health) {
        this.toggleHealthFilter(health);
      }
      return;
    }
  }

  /**
   * Toggle legend visibility
   */
  private toggleLegend(): void {
    const content = this.container.querySelector('.pattern-legend__content') as HTMLElement;
    const toggle = this.container.querySelector('.pattern-legend__toggle') as HTMLElement;
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      toggle.textContent = '▼';
    } else {
      content.style.display = 'none';
      toggle.textContent = '▶';
    }
  }

  /**
   * Toggle family filter
   */
  private toggleFamilyFilter(family: string): void {
    if (this.activeFilters.families.has(family)) {
      this.activeFilters.families.delete(family);
    } else {
      this.activeFilters.families.add(family);
    }
    
    this.refreshContent();
    this.notifyFilterChange();
  }

  /**
   * Toggle pattern filter
   */
  private togglePatternFilter(pattern: string): void {
    if (this.activeFilters.patterns.has(pattern)) {
      this.activeFilters.patterns.delete(pattern);
    } else {
      this.activeFilters.patterns.add(pattern);
    }
    
    this.refreshContent();
    this.notifyFilterChange();
  }

  /**
   * Toggle health filter
   */
  private toggleHealthFilter(health: string): void {
    if (this.activeFilters.healthLevels.has(health)) {
      this.activeFilters.healthLevels.delete(health);
    } else {
      this.activeFilters.healthLevels.add(health);
    }
    
    this.refreshContent();
    this.notifyFilterChange();
  }

  /**
   * Clear all filters
   */
  private clearFilters(): void {
    this.activeFilters.families.clear();
    this.activeFilters.patterns.clear();
    this.activeFilters.healthLevels.clear();
    this.activeFilters.roles.clear();
    
    this.refreshContent();
    this.notifyFilterChange();
  }

  /**
   * Reset view to default state
   */
  private resetView(): void {
    this.clearFilters();
    // Additional reset logic can be added here
  }

  /**
   * Notify callback about filter changes
   */
  private notifyFilterChange(): void {
    if (this.onFilterChangeCallback) {
      this.onFilterChangeCallback(this.activeFilters);
    }
  }

  /**
   * Check if a node matches current filters
   */
  public nodeMatchesFilters(node: GraphNode): boolean {
    const primaryPattern = node.patterns?.primaryPattern;
    if (!primaryPattern) {
      return this.activeFilters.families.size === 0 && 
             this.activeFilters.patterns.size === 0 && 
             this.activeFilters.healthLevels.size === 0;
    }

    // Check family filter
    if (this.activeFilters.families.size > 0 && !this.activeFilters.families.has(primaryPattern.family)) {
      return false;
    }

    // Check pattern filter
    if (this.activeFilters.patterns.size > 0 && !this.activeFilters.patterns.has(primaryPattern.name)) {
      return false;
    }

    // Check health filter
    if (this.activeFilters.healthLevels.size > 0 && !this.activeFilters.healthLevels.has(primaryPattern.health)) {
      return false;
    }

    // Check role filter
    if (this.activeFilters.roles.size > 0 && !this.activeFilters.roles.has(primaryPattern.role)) {
      return false;
    }

    return true;
  }

  /**
   * Show empty state when no patterns detected
   */
  private showEmptyState(): void {
    const content = this.container.querySelector('.pattern-legend__content') as HTMLElement;
    if (content) {
      content.innerHTML = `
        <div class="pattern-legend__empty">
          <span class="pattern-legend__empty-icon">🔍</span>
          <p>No patterns detected yet.</p>
          <p>Run pattern analysis to see results.</p>
        </div>
      `;
    }
  }

  /**
   * Helper methods
   */
  private getFamilyColor(family: string): string {
    const colors = {
      'creational': '#ff7675',
      'structural': '#74b9ff',
      'behavioral': '#a29bfe',
      'architectural': '#00b894',
      'concurrency': '#fd79a8'
    };
    return colors[family as keyof typeof colors] || '#888888';
  }

  private getPatternIcon(patternName: string): string {
    return this.themeManager.getPatternIcon({ patterns: { primaryPattern: { name: patternName } } } as GraphNode) || '🔍';
  }

  private getHealthIcon(health: string): string {
    const icons = {
      'healthy': '✅',
      'warning': '⚠️',
      'problematic': '❌',
      'anti-pattern': '🚫'
    };
    return icons[health as keyof typeof icons] || '❓';
  }

  private getHealthBorderStyle(health: string): string {
    const border = this.themeManager.getPatternBorder({
      patterns: { primaryPattern: { health } }
    } as GraphNode);
    
    return `border: ${border.width}px ${border.style} ${border.color};`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Apply CSS styles to the legend
   */
  private applyStyles(): void {
    const styleId = 'pattern-legend-styles';
    if (document.getElementById(styleId)) return;

    const styles = `
      <style id="${styleId}">
        .pattern-legend {
          position: fixed;
          background: rgba(26, 26, 46, 0.95);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          padding: 16px;
          min-width: 280px;
          max-width: 400px;
          max-height: 80vh;
          overflow-y: auto;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px;
          color: #e0e0e0;
          backdrop-filter: blur(10px);
        }

        .pattern-legend--top-left { top: 20px; left: 20px; }
        .pattern-legend--top-right { top: 20px; right: 20px; }
        .pattern-legend--bottom-left { bottom: 20px; left: 20px; }
        .pattern-legend--bottom-right { bottom: 20px; right: 20px; }

        .pattern-legend__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(78, 205, 196, 0.2);
        }

        .pattern-legend__title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pattern-legend__toggle {
          background: none;
          border: none;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 12px;
          padding: 4px;
        }

        .pattern-statistics {
          margin-bottom: 16px;
        }

        .pattern-statistics__overview {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .pattern-statistics__total {
          font-size: 18px;
          font-weight: bold;
          color: #4ecdc4;
        }

        .pattern-statistics__top-patterns h4 {
          margin: 8px 0 4px 0;
          font-size: 11px;
          color: #999;
        }

        .pattern-statistics__pattern {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 10px;
        }

        .pattern-family {
          margin-bottom: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .pattern-family__header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.05);
        }

        .pattern-family__header:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .pattern-family__color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .pattern-family__name {
          flex-grow: 1;
          font-weight: 500;
        }

        .pattern-family__count {
          font-size: 10px;
          background: rgba(78, 205, 196, 0.2);
          padding: 2px 6px;
          border-radius: 10px;
        }

        .pattern-family__patterns {
          padding: 4px 8px 8px 28px;
        }

        .pattern-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 0;
          cursor: pointer;
          font-size: 10px;
        }

        .pattern-item:hover {
          background: rgba(255, 255, 255, 0.05);
          margin: 0 -4px;
          padding: 4px 4px;
          border-radius: 2px;
        }

        .pattern-item--inactive {
          opacity: 0.5;
        }

        .pattern-item__icon {
          font-size: 10px;
        }

        .pattern-item__name {
          flex-grow: 1;
        }

        .pattern-item__count {
          font-size: 9px;
          color: #999;
        }

        .pattern-health h4 {
          margin: 12px 0 8px 0;
          font-size: 11px;
          color: #999;
        }

        .health-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          cursor: pointer;
          border-radius: 4px;
          margin-bottom: 4px;
        }

        .health-indicator:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .health-indicator--inactive {
          opacity: 0.5;
        }

        .health-indicator__visual {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .health-indicator__border {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .health-indicator__info {
          display: flex;
          justify-content: space-between;
          flex-grow: 1;
        }

        .health-indicator__name {
          font-size: 10px;
        }

        .health-indicator__count {
          font-size: 9px;
          color: #999;
        }

        .pattern-legend__controls {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid rgba(78, 205, 196, 0.2);
          display: flex;
          gap: 8px;
        }

        .pattern-legend__controls button {
          flex: 1;
          padding: 6px 12px;
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .pattern-legend__controls button:hover {
          background: rgba(78, 205, 196, 0.2);
        }

        .pattern-legend__empty {
          text-align: center;
          padding: 20px;
          color: #999;
        }

        .pattern-legend__empty-icon {
          font-size: 24px;
          display: block;
          margin-bottom: 8px;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
}