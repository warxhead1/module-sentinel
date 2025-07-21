import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';

/**
 * Project selector component for switching between different projects
 */
export class ProjectSelector extends DashboardComponent {
  private projects: any[] = [];
  private languages: any[] = [];
  private selectedProjectId: number | null = null;
  private selectedLanguageId: number | null = null;
  private visibleProjectIds: Set<number> = new Set();
  private showProjectManager: boolean = false;
  private listenersSetup: boolean = false;
  private isInitialLoad: boolean = true;
  private unsubscribers: Array<() => void> = [];

  // Override connectedCallback to prevent listening to our own events
  connectedCallback() {
    // Initialize from state service
    this.projects = stateService.getState<any[]>('projects') || [];
    this.languages = stateService.getState<any[]>('languages') || [];
    this.selectedProjectId = stateService.getState<number>('selectedProjectId') || null;
    this.selectedLanguageId = stateService.getState<number>('selectedLanguageId') || null;
    const visibleIds = stateService.getState<number[]>('visibleProjectIds') || [];
    this.visibleProjectIds = new Set(visibleIds);
    
    // Subscribe to state changes
    this.unsubscribers.push(
      stateService.subscribe<any[]>('projects', (projects) => {
        this.projects = projects || [];
        this.render();
      }),
      stateService.subscribe<any[]>('languages', (languages) => {
        this.languages = languages || [];
        this.render();
      })
    );
    
    this.render();
    this.loadData().catch(error => {
      console.error(`Error loading data for ${this.tagName}:`, error);
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    });
    // Note: We don't add the selection-changed listener since we ARE the source
  }

  disconnectedCallback() {
    // Clean up all subscriptions
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }

  async loadData(): Promise<void> {
    try {
      this._loading = true;
      
      // Load projects and languages in parallel using shared data service
      const [projects, languages] = await Promise.all([
        dataService.getProjects(),
        dataService.getLanguages()
      ]);

      console.log('Loaded projects:', projects);
      console.log('Loaded languages:', languages);

      // Update state service with loaded data
      stateService.setState('projects', projects || []);
      stateService.setState('languages', languages || []);

      this.projects = projects || [];
      this.languages = languages || [];

      // Initialize visibility - all projects visible by default
      if (this.visibleProjectIds.size === 0 && this.projects.length > 0) {
        this.projects.forEach(project => {
          this.visibleProjectIds.add(project.id);
        });
        stateService.setState('visibleProjectIds', Array.from(this.visibleProjectIds));
      }

      // Set default selections if not already set
      if (!this.selectedProjectId && this.projects.length > 0) {
        // Default to the visible project with the most symbols
        const visibleProjects = this.projects.filter(p => this.visibleProjectIds.has(p.id));
        if (visibleProjects.length > 0) {
          const defaultProject = visibleProjects.reduce((prev, current) => 
            current.symbol_count > prev.symbol_count ? current : prev
          );
          this.selectedProjectId = defaultProject.id;
          stateService.setState('selectedProjectId', this.selectedProjectId);
        }
      }

      if (!this.selectedLanguageId && this.languages.length > 0) {
        // Default to the language with the most symbols
        const defaultLanguage = this.languages.reduce((prev, current) => 
          current.symbol_count > prev.symbol_count ? current : prev
        );
        this.selectedLanguageId = defaultLanguage.id;
        stateService.setState('selectedLanguageId', this.selectedLanguageId);
      }

      // Only emit selection change after initial load is complete
      if (this.isInitialLoad) {
        this.isInitialLoad = false;
        // Small delay to ensure DOM is ready
        setTimeout(() => this.emitSelectionChange(), 100);
      }
    } catch (error) {
      console.error('Failed to load projects/languages:', error);
      this._error = error instanceof Error ? error.message : String(error);
    } finally {
      this._loading = false;
      this.render();
    }
  }

  render(): void {
    if (this._loading && (this.projects.length === 0 && this.languages.length === 0)) {
      this.shadow.innerHTML = `
        <style>${this.styles()}</style>
        <div class="project-selector loading">
          <div class="loading-spinner"></div>
        </div>
      `;
      return;
    }

    const visibleProjects = this.projects.filter(p => this.visibleProjectIds.has(p.id));

    this.shadow.innerHTML = `
      <style>${this.styles()}</style>
      <div class="project-selector">
        <div class="selector-header">
          <div class="selector-title">
            <svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 1 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 0 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8zM5 12.25v3.25a.25.25 0 0 0 .4.2l1.45-1.087a.25.25 0 0 1 .3 0L8.6 15.7a.25.25 0 0 0 .4-.2v-3.25a.25.25 0 0 0-.25-.25h-3.5a.25.25 0 0 0-.25.25z"/>
            </svg>
            Project Filter
          </div>
          <button class="manage-btn" title="Manage project visibility">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"/>
            </svg>
          </button>
        </div>

        ${this.showProjectManager ? this.renderProjectManager() : ''}

        <div class="selector-section">
          <label class="selector-label">Active Project</label>
          <select class="project-select" ${visibleProjects.length === 0 ? 'disabled' : ''}>
            ${visibleProjects.length === 0 ? 
              '<option>No projects visible</option>' :
              visibleProjects.map(project => `
                <option value="${project.id}" ${project.id === this.selectedProjectId ? 'selected' : ''}>
                  ${project.display_name || project.name} (${project.symbol_count} symbols)
                </option>
              `).join('')
            }
          </select>
        </div>

        <div class="selector-section">
          <label class="selector-label">
            <svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16h-8.5A1.75 1.75 0 0 1 4 14.25V1.75zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 10 4.25V1.5H5.75zm6.75.062V4.25c0 .138.112.25.25.25h2.688a.252.252 0 0 0-.011-.013L12.513 1.573a.252.252 0 0 0-.013-.011z"/>
            </svg>
            Language
          </label>
          <select class="language-select" ${this.languages.length === 0 ? 'disabled' : ''}>
            ${this.languages.length === 0 ? 
              '<option>No languages available</option>' :
              this.languages.map(language => `
                <option value="${language.id}" ${language.id === this.selectedLanguageId ? 'selected' : ''}>
                  ${language.display_name || language.name} (${language.symbol_count} symbols)
                </option>
              `).join('')
            }
          </select>
        </div>

        <div class="filter-summary">
          <span class="summary-text">
            ${this.getFilterSummary()}
          </span>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private renderProjectManager(): string {
    return `
      <div class="project-manager">
        <div class="manager-header">
          <h4>Project Visibility</h4>
          <div class="manager-actions">
            <button class="action-btn show-all">Show All</button>
            <button class="action-btn hide-all">Hide All</button>
          </div>
        </div>
        <div class="project-list">
          ${this.projects.map(project => `
            <label class="project-toggle">
              <input type="checkbox" 
                     class="project-checkbox" 
                     data-project-id="${project.id}"
                     ${this.visibleProjectIds.has(project.id) ? 'checked' : ''}>
              <div class="project-info">
                <span class="project-name">${project.display_name || project.name}</span>
                <span class="project-stats">${project.symbol_count} symbols</span>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  private getFilterSummary(): string {
    const visibleCount = this.visibleProjectIds.size;
    const totalCount = this.projects.length;
    const selectedProject = this.projects.find(p => p.id === this.selectedProjectId);
    const selectedLanguage = this.languages.find(l => l.id === this.selectedLanguageId);

    // Handle loading state
    if (this._loading) {
      return 'Loading projects...';
    }
    
    // Handle no projects
    if (totalCount === 0) {
      return 'No projects available';
    }

    if (!selectedProject || !selectedLanguage) {
      return `${visibleCount}/${totalCount} projects visible`;
    }

    return `${selectedLanguage.display_name || selectedLanguage.name} in ${selectedProject.display_name || selectedProject.name} (${visibleCount}/${totalCount} projects)`;
  }

  private setupEventListeners(): void {
    // Prevent duplicate event listeners
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    const projectSelect = this.shadow.querySelector('.project-select') as HTMLSelectElement;
    const languageSelect = this.shadow.querySelector('.language-select') as HTMLSelectElement;

    projectSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.selectedProjectId = parseInt(target.value);
      this.emitSelectionChange();
      this.render(); // Re-render to update summary
    });

    languageSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.selectedLanguageId = parseInt(target.value);
      this.emitSelectionChange();
      this.render(); // Re-render to update summary
    });

    // Manage button
    const manageBtn = this.shadow.querySelector('.manage-btn');
    manageBtn?.addEventListener('click', () => {
      this.showProjectManager = !this.showProjectManager;
      this.render();
    });

    // Show/Hide all buttons
    const showAllBtn = this.shadow.querySelector('.show-all');
    const hideAllBtn = this.shadow.querySelector('.hide-all');

    showAllBtn?.addEventListener('click', () => {
      this.projects.forEach(project => {
        this.visibleProjectIds.add(project.id);
      });
      this.render();
      this.emitSelectionChange();
    });

    hideAllBtn?.addEventListener('click', () => {
      this.visibleProjectIds.clear();
      // Keep at least one project visible
      if (this.projects.length > 0) {
        this.visibleProjectIds.add(this.projects[0].id);
        this.selectedProjectId = this.projects[0].id;
      }
      this.render();
      this.emitSelectionChange();
    });

    // Project checkboxes
    this.shadow.querySelectorAll('.project-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const projectId = parseInt(target.getAttribute('data-project-id') || '0');
        
        if (target.checked) {
          this.visibleProjectIds.add(projectId);
        } else {
          this.visibleProjectIds.delete(projectId);
          
          // If the currently selected project is hidden, switch to the first visible one
          if (projectId === this.selectedProjectId) {
            const visibleProjects = this.projects.filter(p => this.visibleProjectIds.has(p.id));
            if (visibleProjects.length > 0) {
              this.selectedProjectId = visibleProjects[0].id;
            }
          }
        }
        
        this.render();
        this.emitSelectionChange();
      });
    });
  }

  private emitSelectionChange(): void {
    // Only emit if we have valid selections
    if (!this.selectedProjectId || !this.selectedLanguageId) {
      return;
    }
    
    // Update state service
    stateService.setState('selectedProjectId', this.selectedProjectId);
    stateService.setState('selectedLanguageId', this.selectedLanguageId);
    stateService.setState('visibleProjectIds', Array.from(this.visibleProjectIds));

    const selectedProject = this.projects.find(p => p.id === this.selectedProjectId);
    const selectedLanguage = this.languages.find(l => l.id === this.selectedLanguageId);

    // Emit custom event for other components to listen to
    this.dispatchEvent(new CustomEvent('selection-changed', {
      detail: {
        projectId: this.selectedProjectId,
        languageId: this.selectedLanguageId,
        project: selectedProject,
        language: selectedLanguage,
        visibleProjectIds: Array.from(this.visibleProjectIds)
      },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Get current selection
   */
  getSelection() {
    return {
      projectId: this.selectedProjectId,
      languageId: this.selectedLanguageId,
      project: this.projects.find(p => p.id === this.selectedProjectId),
      language: this.languages.find(l => l.id === this.selectedLanguageId),
      visibleProjectIds: Array.from(this.visibleProjectIds)
    };
  }

  styles(): string {
    return `
      .project-selector {
        background: rgba(35, 35, 65, 0.6);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
        border: 1px solid rgba(147, 112, 219, 0.2);
        backdrop-filter: blur(10px);
      }

      .selector-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .selector-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .manage-btn {
        padding: 4px 8px;
        background: rgba(147, 112, 219, 0.1);
        border: 1px solid rgba(147, 112, 219, 0.3);
        border-radius: 4px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: var(--transition-smooth);
      }

      .manage-btn:hover {
        background: rgba(147, 112, 219, 0.2);
        color: var(--primary-accent);
      }

      .project-manager {
        background: rgba(147, 112, 219, 0.05);
        border: 1px solid rgba(147, 112, 219, 0.2);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
      }

      .manager-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      .manager-header h4 {
        margin: 0;
        font-size: 12px;
        color: var(--text-primary);
        font-weight: 600;
      }

      .manager-actions {
        display: flex;
        gap: 6px;
      }

      .action-btn {
        padding: 3px 8px;
        font-size: 10px;
        background: rgba(147, 112, 219, 0.1);
        border: 1px solid rgba(147, 112, 219, 0.3);
        border-radius: 3px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: var(--transition-smooth);
      }

      .action-btn:hover {
        background: rgba(147, 112, 219, 0.2);
        color: var(--primary-accent);
      }

      .project-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 150px;
        overflow-y: auto;
      }

      .project-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: var(--transition-smooth);
      }

      .project-toggle:hover {
        background: rgba(147, 112, 219, 0.1);
      }

      .project-checkbox {
        margin: 0;
        cursor: pointer;
      }

      .project-info {
        display: flex;
        flex-direction: column;
        flex: 1;
      }

      .project-name {
        font-size: 12px;
        color: var(--text-primary);
        font-weight: 500;
      }

      .project-stats {
        font-size: 10px;
        color: var(--text-muted);
      }

      .project-selector.loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 120px;
      }

      .loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid rgba(147, 112, 219, 0.1);
        border-top-color: var(--primary-accent);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .selector-section {
        margin-bottom: 12px;
      }

      .selector-section:last-of-type {
        margin-bottom: 16px;
      }

      .selector-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .icon {
        color: var(--primary-accent);
      }

      .project-select, .language-select {
        width: 100%;
        padding: 8px 12px;
        background: rgba(147, 112, 219, 0.05);
        border: 1px solid rgba(147, 112, 219, 0.2);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: var(--transition-smooth);
        outline: none;
      }

      .project-select:hover, .language-select:hover {
        background: rgba(147, 112, 219, 0.1);
        border-color: rgba(147, 112, 219, 0.4);
      }

      .project-select:focus, .language-select:focus {
        background: rgba(147, 112, 219, 0.1);
        border-color: var(--primary-accent);
        box-shadow: 0 0 0 2px rgba(147, 112, 219, 0.2);
      }

      .project-select:disabled, .language-select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: rgba(100, 100, 100, 0.1);
      }

      .project-select option, .language-select option {
        background: var(--secondary-bg);
        color: var(--text-primary);
        padding: 8px;
      }

      .filter-summary {
        padding: 10px 12px;
        background: rgba(147, 112, 219, 0.1);
        border-radius: 6px;
        border-left: 3px solid var(--primary-accent);
      }

      .summary-text {
        font-size: 12px;
        color: var(--text-secondary);
        font-style: italic;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .project-selector {
          padding: 12px;
          margin-bottom: 16px;
        }

        .selector-label {
          font-size: 11px;
        }

        .project-select, .language-select {
          font-size: 12px;
          padding: 6px 10px;
        }
      }
    `;
  }
}

// Register the component
defineComponent('project-selector', ProjectSelector);