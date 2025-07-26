/**
 * PatternFilterPanel Component
 * 
 * Advanced filtering panel for pattern-based node categorization.
 * Provides multi-level filtering by pattern type, family, role, health, and quality metrics.
 */

import { GraphNode } from '../../shared/types/api.js';
import { PatternNodeCategorizer } from '../services/pattern-node-categorizer.js';
import { PatternFilter } from './pattern-legend.js';

export interface PatternFilterPanelConfig {
  showAdvancedFilters: boolean;
  showMetricFilters: boolean;
  showSearchBox: boolean;
  collapsible: boolean;
  position: 'left' | 'right' | 'bottom';
}

export interface AdvancedPatternFilter extends PatternFilter {
  // Metric-based filters
  minPatternStrength: number;
  maxPatternComplexity: number;
  refactoringPriorities: Set<string>;
  evolutionStages: Set<string>;
  
  // Advanced search
  searchQuery: string;
  searchInNames: boolean;
  searchInSignatures: boolean;
  searchInTags: boolean;
}

export class PatternFilterPanel {
  private container: HTMLElement;
  private categorizer: PatternNodeCategorizer;
  private config: PatternFilterPanelConfig;
  private currentNodes: GraphNode[] = [];
  private activeFilters: AdvancedPatternFilter;
  private onFilterChangeCallback?: (filters: AdvancedPatternFilter) => void;
  private searchTimeout?: number;

  constructor(
    container: HTMLElement,
    categorizer: PatternNodeCategorizer,
    config: Partial<PatternFilterPanelConfig> = {}
  ) {
    this.container = container;
    this.categorizer = categorizer;
    
    // Default configuration
    this.config = {
      showAdvancedFilters: true,
      showMetricFilters: true,
      showSearchBox: true,
      collapsible: true,
      position: 'left',
      ...config
    };

    // Initialize filters
    this.activeFilters = {
      families: new Set(),
      patterns: new Set(),
      healthLevels: new Set(),
      roles: new Set(),
      minPatternStrength: 0,
      maxPatternComplexity: 100,
      refactoringPriorities: new Set(),
      evolutionStages: new Set(),
      searchQuery: '',
      searchInNames: true,
      searchInSignatures: true,
      searchInTags: true
    };

    this.initialize();
  }

  /**
   * Initialize the filter panel
   */
  private initialize(): void {
    this.createPanelStructure();
    this.setupEventListeners();
  }

  /**
   * Update panel with new node data
   */
  public updateNodes(nodes: GraphNode[]): void {
    this.currentNodes = nodes;
    this.refreshFilters();
  }

  /**
   * Set callback for filter changes
   */
  public onFilterChange(callback: (filters: AdvancedPatternFilter) => void): void {
    this.onFilterChangeCallback = callback;
  }

  /**
   * Create the panel structure
   */
  private createPanelStructure(): void {
    const panelElement = document.createElement('div');
    panelElement.className = `pattern-filter-panel pattern-filter-panel--${this.config.position}`;
    
    panelElement.innerHTML = `
      <div class="pattern-filter-panel__header">
        <h3 class="pattern-filter-panel__title">
          <span class="pattern-filter-panel__icon">🔍</span>
          Pattern Filters
        </h3>
        ${this.config.collapsible ? '<button class="pattern-filter-panel__toggle" aria-label="Toggle panel">▼</button>' : ''}
      </div>
      
      <div class="pattern-filter-panel__content">
        ${this.config.showSearchBox ? this.createSearchSection() : ''}
        
        <div class="pattern-filter-section">
          <h4>Pattern Families</h4>
          <div class="pattern-filter-families"></div>
        </div>
        
        <div class="pattern-filter-section">
          <h4>Health Status</h4>
          <div class="pattern-filter-health"></div>
        </div>
        
        <div class="pattern-filter-section">
          <h4>Pattern Roles</h4>
          <div class="pattern-filter-roles"></div>
        </div>
        
        ${this.config.showMetricFilters ? this.createMetricSection() : ''}
        ${this.config.showAdvancedFilters ? this.createAdvancedSection() : ''}
        
        <div class="pattern-filter-panel__actions">
          <button class="pattern-filter-panel__clear">Clear All</button>
          <button class="pattern-filter-panel__apply">Apply Filters</button>
        </div>
      </div>
    `;

    this.container.appendChild(panelElement);
    this.applyStyles();
  }

  /**
   * Create search section HTML
   */
  private createSearchSection(): string {
    return `
      <div class="pattern-filter-section pattern-filter-search">
        <h4>Search Patterns</h4>
        <div class="pattern-search-box">
          <input type="text" 
                 class="pattern-search-input" 
                 placeholder="Search patterns, names, signatures..."
                 value="${this.activeFilters.searchQuery}">
          <button class="pattern-search-clear">✕</button>
        </div>
        <div class="pattern-search-options">
          <label class="pattern-search-option">
            <input type="checkbox" ${this.activeFilters.searchInNames ? 'checked' : ''} data-search-type="names">
            <span>Node Names</span>
          </label>
          <label class="pattern-search-option">
            <input type="checkbox" ${this.activeFilters.searchInSignatures ? 'checked' : ''} data-search-type="signatures">
            <span>Signatures</span>
          </label>
          <label class="pattern-search-option">
            <input type="checkbox" ${this.activeFilters.searchInTags ? 'checked' : ''} data-search-type="tags">
            <span>Semantic Tags</span>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * Create metric filters section HTML
   */
  private createMetricSection(): string {
    return `
      <div class="pattern-filter-section pattern-filter-metrics">
        <h4>Pattern Metrics</h4>
        
        <div class="pattern-metric-filter">
          <label>Pattern Strength (${this.activeFilters.minPatternStrength}%+)</label>
          <input type="range" 
                 class="pattern-strength-slider" 
                 min="0" max="100" step="5"
                 value="${this.activeFilters.minPatternStrength}">
        </div>
        
        <div class="pattern-metric-filter">
          <label>Max Pattern Complexity (${this.activeFilters.maxPatternComplexity})</label>
          <input type="range" 
                 class="pattern-complexity-slider" 
                 min="0" max="100" step="5"
                 value="${this.activeFilters.maxPatternComplexity}">
        </div>
        
        <div class="pattern-metric-filter">
          <label>Refactoring Priority</label>
          <div class="pattern-priority-options">
            ${['none', 'low', 'medium', 'high', 'critical'].map(priority => `
              <label class="pattern-priority-option">
                <input type="checkbox" 
                       data-priority="${priority}" 
                       ${this.activeFilters.refactoringPriorities.has(priority) ? 'checked' : ''}>
                <span>${this.capitalize(priority)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create advanced filters section HTML
   */
  private createAdvancedSection(): string {
    return `
      <div class="pattern-filter-section pattern-filter-advanced">
        <h4>Evolution Stage</h4>
        <div class="pattern-evolution-options">
          ${['emerging', 'stable', 'mature', 'degrading', 'legacy'].map(stage => `
            <label class="pattern-evolution-option">
              <input type="checkbox" 
                     data-evolution="${stage}" 
                     ${this.activeFilters.evolutionStages.has(stage) ? 'checked' : ''}>
              <span>${this.capitalize(stage)}</span>
            </label>
          `).join('')}
        </div>
        
        <div class="pattern-filter-presets">
          <h5>Quick Presets</h5>
          <button class="pattern-preset" data-preset="healthy">Healthy Patterns</button>
          <button class="pattern-preset" data-preset="problematic">Needs Attention</button>
          <button class="pattern-preset" data-preset="architectural">Architectural</button>
          <button class="pattern-preset" data-preset="anti-patterns">Anti-patterns</button>
        </div>
      </div>
    `;
  }

  /**
   * Refresh filter options based on current nodes
   */
  private refreshFilters(): void {
    this.refreshFamilyFilters();
    this.refreshHealthFilters();
    this.refreshRoleFilters();
  }

  /**
   * Refresh pattern family filters
   */
  private refreshFamilyFilters(): void {
    const container = this.container.querySelector('.pattern-filter-families') as HTMLElement;
    if (!container) return;

    const families = this.categorizer.getPatternFamilies();
    const familyCounts = this.getFamilyCounts();

    container.innerHTML = families.map(family => {
      const count = familyCounts[family] || 0;
      const isActive = this.activeFilters.families.has(family);
      
      return `
        <label class="pattern-family-filter ${isActive ? 'pattern-family-filter--active' : ''}">
          <input type="checkbox" 
                 data-family="${family}" 
                 ${isActive ? 'checked' : ''}>
          <span class="pattern-family-filter__color" style="background-color: ${this.getFamilyColor(family)}"></span>
          <span class="pattern-family-filter__name">${this.capitalize(family)}</span>
          <span class="pattern-family-filter__count">${count}</span>
        </label>
      `;
    }).join('');
  }

  /**
   * Refresh health status filters
   */
  private refreshHealthFilters(): void {
    const container = this.container.querySelector('.pattern-filter-health') as HTMLElement;
    if (!container) return;

    const healthLevels = ['healthy', 'warning', 'problematic', 'anti-pattern'];
    const healthCounts = this.getHealthCounts();

    container.innerHTML = healthLevels.map(health => {
      const count = healthCounts[health] || 0;
      const isActive = this.activeFilters.healthLevels.has(health);
      
      return `
        <label class="pattern-health-filter ${isActive ? 'pattern-health-filter--active' : ''}">
          <input type="checkbox" 
                 data-health="${health}" 
                 ${isActive ? 'checked' : ''}>
          <span class="pattern-health-filter__icon">${this.getHealthIcon(health)}</span>
          <span class="pattern-health-filter__name">${this.capitalize(health.replace('-', ' '))}</span>
          <span class="pattern-health-filter__count">${count}</span>
        </label>
      `;
    }).join('');
  }

  /**
   * Refresh role filters
   */
  private refreshRoleFilters(): void {
    const container = this.container.querySelector('.pattern-filter-roles') as HTMLElement;
    if (!container) return;

    const roles = this.getRoleList();
    const roleCounts = this.getRoleCounts();

    container.innerHTML = roles.map(role => {
      const count = roleCounts[role] || 0;
      const isActive = this.activeFilters.roles.has(role);
      
      return `
        <label class="pattern-role-filter ${isActive ? 'pattern-role-filter--active' : ''}">
          <input type="checkbox" 
                 data-role="${role}" 
                 ${isActive ? 'checked' : ''}>
          <span class="pattern-role-filter__name">${this.capitalize(role)}</span>
          <span class="pattern-role-filter__count">${count}</span>
        </label>
      `;
    }).join('');
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.container.addEventListener('click', this.handleClick.bind(this));
    this.container.addEventListener('change', this.handleChange.bind(this));
    this.container.addEventListener('input', this.handleInput.bind(this));
  }

  /**
   * Handle click events
   */
  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Toggle panel
    if (target.classList.contains('pattern-filter-panel__toggle')) {
      this.togglePanel();
      return;
    }

    // Clear all filters
    if (target.classList.contains('pattern-filter-panel__clear')) {
      this.clearAllFilters();
      return;
    }

    // Apply filters
    if (target.classList.contains('pattern-filter-panel__apply')) {
      this.applyFilters();
      return;
    }

    // Clear search
    if (target.classList.contains('pattern-search-clear')) {
      this.clearSearch();
      return;
    }

    // Apply preset
    if (target.classList.contains('pattern-preset')) {
      const preset = target.getAttribute('data-preset');
      if (preset) {
        this.applyPreset(preset);
      }
      return;
    }
  }

  /**
   * Handle checkbox/input changes
   */
  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    
    // Family filter change
    if (target.hasAttribute('data-family')) {
      this.toggleFamilyFilter(target.getAttribute('data-family')!, target.checked);
    }
    
    // Health filter change
    else if (target.hasAttribute('data-health')) {
      this.toggleHealthFilter(target.getAttribute('data-health')!, target.checked);
    }
    
    // Role filter change
    else if (target.hasAttribute('data-role')) {
      this.toggleRoleFilter(target.getAttribute('data-role')!, target.checked);
    }
    
    // Priority filter change
    else if (target.hasAttribute('data-priority')) {
      this.togglePriorityFilter(target.getAttribute('data-priority')!, target.checked);
    }
    
    // Evolution filter change
    else if (target.hasAttribute('data-evolution')) {
      this.toggleEvolutionFilter(target.getAttribute('data-evolution')!, target.checked);
    }
    
    // Search options change
    else if (target.hasAttribute('data-search-type')) {
      this.toggleSearchOption(target.getAttribute('data-search-type')!, target.checked);
    }
  }

  /**
   * Handle input events (sliders, search)
   */
  private handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    
    // Pattern strength slider
    if (target.classList.contains('pattern-strength-slider')) {
      this.activeFilters.minPatternStrength = parseInt(target.value);
      this.updateSliderLabel('Pattern Strength', `${target.value}%+`);
      this.notifyFilterChange();
    }
    
    // Pattern complexity slider
    else if (target.classList.contains('pattern-complexity-slider')) {
      this.activeFilters.maxPatternComplexity = parseInt(target.value);
      this.updateSliderLabel('Max Pattern Complexity', target.value);
      this.notifyFilterChange();
    }
    
    // Search input
    else if (target.classList.contains('pattern-search-input')) {
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }
      
      this.searchTimeout = window.setTimeout(() => {
        this.activeFilters.searchQuery = target.value;
        this.notifyFilterChange();
      }, 300); // Debounce search
    }
  }

  /**
   * Filter toggle methods
   */
  private toggleFamilyFilter(family: string, enabled: boolean): void {
    if (enabled) {
      this.activeFilters.families.add(family);
    } else {
      this.activeFilters.families.delete(family);
    }
    this.notifyFilterChange();
  }

  private toggleHealthFilter(health: string, enabled: boolean): void {
    if (enabled) {
      this.activeFilters.healthLevels.add(health);
    } else {
      this.activeFilters.healthLevels.delete(health);
    }
    this.notifyFilterChange();
  }

  private toggleRoleFilter(role: string, enabled: boolean): void {
    if (enabled) {
      this.activeFilters.roles.add(role);
    } else {
      this.activeFilters.roles.delete(role);
    }
    this.notifyFilterChange();
  }

  private togglePriorityFilter(priority: string, enabled: boolean): void {
    if (enabled) {
      this.activeFilters.refactoringPriorities.add(priority);
    } else {
      this.activeFilters.refactoringPriorities.delete(priority);
    }
    this.notifyFilterChange();
  }

  private toggleEvolutionFilter(evolution: string, enabled: boolean): void {
    if (enabled) {
      this.activeFilters.evolutionStages.add(evolution);
    } else {
      this.activeFilters.evolutionStages.delete(evolution);
    }
    this.notifyFilterChange();
  }

  private toggleSearchOption(searchType: string, enabled: boolean): void {
    switch (searchType) {
      case 'names':
        this.activeFilters.searchInNames = enabled;
        break;
      case 'signatures':
        this.activeFilters.searchInSignatures = enabled;
        break;
      case 'tags':
        this.activeFilters.searchInTags = enabled;
        break;
    }
    this.notifyFilterChange();
  }

  /**
   * Utility methods
   */
  private togglePanel(): void {
    const content = this.container.querySelector('.pattern-filter-panel__content') as HTMLElement;
    const toggle = this.container.querySelector('.pattern-filter-panel__toggle') as HTMLElement;
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      toggle.textContent = '▼';
    } else {
      content.style.display = 'none';
      toggle.textContent = '▶';
    }
  }

  private clearAllFilters(): void {
    this.activeFilters.families.clear();
    this.activeFilters.patterns.clear();
    this.activeFilters.healthLevels.clear();
    this.activeFilters.roles.clear();
    this.activeFilters.refactoringPriorities.clear();
    this.activeFilters.evolutionStages.clear();
    this.activeFilters.minPatternStrength = 0;
    this.activeFilters.maxPatternComplexity = 100;
    this.activeFilters.searchQuery = '';
    
    this.refreshFilters();
    this.notifyFilterChange();
  }

  private clearSearch(): void {
    this.activeFilters.searchQuery = '';
    const searchInput = this.container.querySelector('.pattern-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = '';
    }
    this.notifyFilterChange();
  }

  private applyFilters(): void {
    this.notifyFilterChange();
  }

  private applyPreset(preset: string): void {
    this.clearAllFilters();
    
    switch (preset) {
      case 'healthy':
        this.activeFilters.healthLevels.add('healthy');
        break;
      case 'problematic':
        this.activeFilters.healthLevels.add('warning');
        this.activeFilters.healthLevels.add('problematic');
        this.activeFilters.healthLevels.add('anti-pattern');
        break;
      case 'architectural':
        this.activeFilters.families.add('architectural');
        break;
      case 'anti-patterns':
        this.activeFilters.healthLevels.add('anti-pattern');
        break;
    }
    
    this.refreshFilters();
    this.notifyFilterChange();
  }

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
    const patternMetrics = node.patterns?.patternMetrics;
    
    // Pattern strength filter
    if (primaryPattern && primaryPattern.strength < this.activeFilters.minPatternStrength) {
      return false;
    }
    
    // Pattern complexity filter
    if (patternMetrics && patternMetrics.patternComplexity && 
        patternMetrics.patternComplexity > this.activeFilters.maxPatternComplexity) {
      return false;
    }
    
    // Refactoring priority filter
    if (this.activeFilters.refactoringPriorities.size > 0 && patternMetrics) {
      if (!patternMetrics.refactoringPriority || 
          !this.activeFilters.refactoringPriorities.has(patternMetrics.refactoringPriority)) {
        return false;
      }
    }
    
    // Evolution stage filter
    if (this.activeFilters.evolutionStages.size > 0 && patternMetrics) {
      if (!patternMetrics.evolutionStage || 
          !this.activeFilters.evolutionStages.has(patternMetrics.evolutionStage)) {
        return false;
      }
    }
    
    // Search query filter
    if (this.activeFilters.searchQuery) {
      const query = this.activeFilters.searchQuery.toLowerCase();
      let hasMatch = false;
      
      if (this.activeFilters.searchInNames && node.name.toLowerCase().includes(query)) {
        hasMatch = true;
      }
      
      if (this.activeFilters.searchInSignatures && node.signature && 
          node.signature.toLowerCase().includes(query)) {
        hasMatch = true;
      }
      
      if (this.activeFilters.searchInTags && node.semanticTags) {
        hasMatch = node.semanticTags.some(tag => tag.toLowerCase().includes(query));
      }
      
      if (!hasMatch) {
        return false;
      }
    }
    
    // Use base pattern filters from PatternLegend
    return this.baseNodeMatchesFilters(node);
  }

  private baseNodeMatchesFilters(node: GraphNode): boolean {
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
   * Helper methods for data aggregation
   */
  private getFamilyCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.currentNodes.forEach(node => {
      const family = node.patterns?.primaryPattern?.family;
      if (family) {
        counts[family] = (counts[family] || 0) + 1;
      }
    });
    return counts;
  }

  private getHealthCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.currentNodes.forEach(node => {
      const health = node.patterns?.primaryPattern?.health;
      if (health) {
        counts[health] = (counts[health] || 0) + 1;
      }
    });
    return counts;
  }

  private getRoleCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.currentNodes.forEach(node => {
      const role = node.patterns?.primaryPattern?.role;
      if (role) {
        counts[role] = (counts[role] || 0) + 1;
      }
    });
    return counts;
  }

  private getRoleList(): string[] {
    const roles = new Set<string>();
    this.currentNodes.forEach(node => {
      const role = node.patterns?.primaryPattern?.role;
      if (role) {
        roles.add(role);
      }
    });
    return Array.from(roles).sort();
  }

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

  private getHealthIcon(health: string): string {
    const icons = {
      'healthy': '✅',
      'warning': '⚠️',
      'problematic': '❌',
      'anti-pattern': '🚫'
    };
    return icons[health as keyof typeof icons] || '❓';
  }

  private updateSliderLabel(labelPrefix: string, value: string): void {
    const label = this.container.querySelector(`label:contains("${labelPrefix}")`) as HTMLElement;
    if (label) {
      label.textContent = `${labelPrefix} (${value})`;
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Apply CSS styles
   */
  private applyStyles(): void {
    const styleId = 'pattern-filter-panel-styles';
    if (document.getElementById(styleId)) return;

    const styles = `
      <style id="${styleId}">
        .pattern-filter-panel {
          position: fixed;
          background: rgba(26, 26, 46, 0.95);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          padding: 16px;
          width: 320px;
          max-height: 80vh;
          overflow-y: auto;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px;
          color: #e0e0e0;
          backdrop-filter: blur(10px);
        }

        .pattern-filter-panel--left { top: 20px; left: 20px; }
        .pattern-filter-panel--right { top: 20px; right: 20px; }
        .pattern-filter-panel--bottom { bottom: 20px; left: 50%; transform: translateX(-50%); }

        .pattern-filter-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(78, 205, 196, 0.2);
        }

        .pattern-filter-panel__title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pattern-filter-section {
          margin-bottom: 20px;
        }

        .pattern-filter-section h4 {
          margin: 0 0 8px 0;
          font-size: 11px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pattern-search-box {
          position: relative;
          margin-bottom: 8px;
        }

        .pattern-search-input {
          width: 100%;
          padding: 8px 30px 8px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 11px;
        }

        .pattern-search-clear {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          font-size: 10px;
        }

        .pattern-search-options {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pattern-search-option {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          cursor: pointer;
        }

        .pattern-family-filter,
        .pattern-health-filter,
        .pattern-role-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          cursor: pointer;
          border-radius: 4px;
          margin-bottom: 4px;
        }

        .pattern-family-filter:hover,
        .pattern-health-filter:hover,
        .pattern-role-filter:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .pattern-family-filter--active,
        .pattern-health-filter--active,
        .pattern-role-filter--active {
          background: rgba(78, 205, 196, 0.1);
        }

        .pattern-family-filter__color {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .pattern-family-filter__name,
        .pattern-health-filter__name,
        .pattern-role-filter__name {
          flex-grow: 1;
          font-size: 10px;
        }

        .pattern-family-filter__count,
        .pattern-health-filter__count,
        .pattern-role-filter__count {
          font-size: 9px;
          color: #999;
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 6px;
          border-radius: 8px;
        }

        .pattern-metric-filter {
          margin-bottom: 12px;
        }

        .pattern-metric-filter label {
          display: block;
          margin-bottom: 4px;
          font-size: 10px;
          color: #ccc;
        }

        .pattern-strength-slider,
        .pattern-complexity-slider {
          width: 100%;
          margin-bottom: 4px;
        }

        .pattern-priority-options,
        .pattern-evolution-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pattern-priority-option,
        .pattern-evolution-option {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          cursor: pointer;
        }

        .pattern-filter-presets {
          margin-top: 12px;
        }

        .pattern-filter-presets h5 {
          margin: 0 0 8px 0;
          font-size: 10px;
          color: #999;
        }

        .pattern-preset {
          display: block;
          width: 100%;
          padding: 6px;
          margin-bottom: 4px;
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.2);
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 10px;
          cursor: pointer;
          text-align: left;
        }

        .pattern-preset:hover {
          background: rgba(78, 205, 196, 0.2);
        }

        .pattern-filter-panel__actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid rgba(78, 205, 196, 0.2);
        }

        .pattern-filter-panel__actions button {
          flex: 1;
          padding: 8px 12px;
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 11px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .pattern-filter-panel__actions button:hover {
          background: rgba(78, 205, 196, 0.2);
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
}