import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';

/**
 * Project manager component for adding and managing projects
 */
export class ProjectManager extends DashboardComponent {
  private projects: any[] = [];
  private showAddForm: boolean = false;
  private unsubscribers: Array<() => void> = [];

  connectedCallback() {
    // Initialize from state if available
    const existingProjects = stateService.getState<any[]>('projects');
    if (existingProjects) {
      this.projects = existingProjects;
    }
    
    // Subscribe to project changes
    this.unsubscribers.push(
      stateService.subscribe<any[]>('projects', (projects) => {
        this.projects = projects || [];
        this.render();
      })
    );
    
    // Call parent implementation
    super.connectedCallback();
  }

  disconnectedCallback() {
    // Clean up subscriptions
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    
    // Call parent implementation
    super.disconnectedCallback();
  }

  async loadData(): Promise<void> {
    try {
      // Use shared data service
      const projects = await dataService.getProjects();
      this.projects = projects || [];
      
      // Update state service
      stateService.setState('projects', this.projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      this._error = error instanceof Error ? error.message : String(error);
    }
  }

  render(): void {
    this.shadow.innerHTML = `
      <style>${this.styles()}</style>
      <div class="project-manager">
        <div class="manager-header">
          <h2>Project Management</h2>
          <button type="button" class="add-project-btn" ${this.showAddForm ? 'style="display: none;"' : ''}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
            </svg>
            Add Project
          </button>
        </div>

        ${this.showAddForm ? this.renderAddForm() : ''}

        <div class="projects-list">
          ${this.projects.length === 0 ? `
            <div class="empty-state">
              <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" class="empty-icon">
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 1 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 0 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8z"/>
              </svg>
              <p>No projects found</p>
              <p class="empty-subtitle">Add a project to get started with code analysis</p>
            </div>
          ` : this.projects.map(project => this.renderProject(project)).join('')}
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private renderAddForm(): string {
    return `
      <div class="add-form">
        <div class="form-header">
          <h3>Add New Project</h3>
          <button type="button" class="cancel-btn">Cancel</button>
        </div>
        
        <form class="project-form">
          <div class="form-group">
            <label>Project Name</label>
            <input type="text" name="name" placeholder="my-awesome-project" required>
            <div class="help-text">Unique identifier for the project (lowercase, no spaces)</div>
          </div>

          <div class="form-group">
            <label>Display Name</label>
            <input type="text" name="displayName" placeholder="My Awesome Project">
            <div class="help-text">Human-readable name for the project</div>
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea name="description" placeholder="Brief description of the project..." rows="3"></textarea>
          </div>

          <div class="form-group">
            <label>Root Path</label>
            <div class="path-input-container">
              <input type="text" name="rootPath" placeholder="/path/to/project/root" required>
              <button type="button" class="browse-btn" title="Browse for folder">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.75 1a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h2.5a.75.75 0 0 0 .75-.75V2.75h8.25a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75h-12a.75.75 0 0 1-.75-.75v-8.5c0-.414.336-.75.75-.75z"/>
                  <path d="M6 4.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v.75a.25.25 0 0 1-.25.25h-3.5a.25.25 0 0 1-.25-.25z"/>
                </svg>
              </button>
            </div>
            <div class="help-text">Absolute path to the project's root directory</div>
            <div class="file-browser" style="display: none;"></div>
          </div>

          <div class="form-group">
            <label>Supported Languages</label>
            <div class="select-all-container">
              <label class="checkbox-label select-all-label">
                <input type="checkbox" id="select-all-languages">
                <span><strong>Select All</strong></span>
              </label>
            </div>
            <div class="language-checkboxes">
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="cpp" checked>
                <span>C++ (.cpp, .ixx, .h)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="python">
                <span>Python (.py)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="typescript">
                <span>TypeScript (.ts, .tsx)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="javascript">
                <span>JavaScript (.js, .jsx)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="go">
                <span>Go (.go)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="java">
                <span>Java (.java)</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" name="languages" value="csharp">
                <span>C# (.cs)</span>
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="cancel-btn">Cancel</button>
            <button type="submit" class="submit-btn">Create Project</button>
          </div>
        </form>
      </div>
    `;
  }

  private renderProject(project: any): string {
    const lastUpdated = new Date(project.created_at).toLocaleDateString();
    const additionalPaths = project.metadata?.additionalPaths || [];
    const languages = project.metadata?.languages || [];
    
    return `
      <div class="project-card" data-project-id="${project.id}">
        <div class="project-header">
          <div class="project-info">
            <h3 class="project-name">${project.display_name || project.name}</h3>
            <div class="project-meta">
              <span class="project-path" title="${project.root_path}">${project.root_path}</span>
              ${additionalPaths.length > 0 ? 
                `<span class="project-additional-paths" title="${additionalPaths.join('\n')}">+${additionalPaths.length} paths</span>` : 
                ''}
              <span class="project-symbols">${project.symbol_count} symbols</span>
              ${languages.length > 0 ? 
                `<span class="project-languages" title="${languages.join(', ')}">${languages.join(', ')}</span>` : 
                ''}
            </div>
          </div>
          <div class="project-actions">
            <button type="button" class="action-btn scan-btn" title="Scan project">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A3.488 3.488 0 0 1 8 4.5a3.487 3.487 0 0 1 2.927 1.073l1.204-1.204A5.487 5.487 0 0 0 8 2.5zm-6.131 3.869a5.487 5.487 0 0 0 0 7.262l1.204-1.204a3.487 3.487 0 0 1 0-4.854L1.869 6.369zm12.262 0l-1.204 1.204a3.487 3.487 0 0 1 0 4.854l1.204 1.204a5.487 5.487 0 0 0 0-7.262zM8 13.5a3.487 3.487 0 0 1-2.927-1.073L3.869 13.631A5.487 5.487 0 0 0 8 15.5a5.487 5.487 0 0 0 4.131-1.869l-1.204-1.204A3.487 3.487 0 0 1 8 13.5z"/>
                <circle cx="8" cy="8" r="1.5"/>
              </svg>
            </button>
            <button type="button" class="action-btn edit-btn" title="Edit project">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="m13.498.795.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796a1.5 1.5 0 0 1 1.998-.001zm-.644.766a.5.5 0 0 0-.707 0L1.95 11.756l-.764 3.057 3.057-.764L14.44 3.854a.5.5 0 0 0 0-.708l-1.585-1.585z"/>
              </svg>
            </button>
            <button type="button" class="action-btn delete-btn" title="Delete project">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
            </button>
          </div>
        </div>
        
        ${project.description ? `
          <div class="project-description">${project.description}</div>
        ` : ''}
        
        <div class="project-footer">
          <span class="project-date">Created ${lastUpdated}</span>
          <div class="project-languages">
            ${this.renderLanguageBadges(project)}
          </div>
        </div>
      </div>
    `;
  }

  private renderLanguageBadges(project: any): string {
    // Get languages from project metadata or detected languages
    const languages = project.languages || project.detectedLanguages || ['cpp', 'python', 'typescript', 'javascript', 'go', 'java']; // multi-language fallback
    
    const languageNames: Record<string, string> = {
      cpp: 'C++',
      python: 'Python', 
      typescript: 'TypeScript',
      javascript: 'JavaScript',
      go: 'Go',
      java: 'Java',
      csharp: 'C#'
    };

    return languages
      .map((lang: string) => {
        const displayName = languageNames[lang] || lang;
        return `<span class="language-badge ${lang}">${displayName}</span>`;
      })
      .join('');
  }

  private setupEventListeners(): void {
    // Add project button
    const addBtn = this.shadow.querySelector('.add-project-btn');
    addBtn?.addEventListener('click', () => {
      this.showAddForm = true;
      this.render();
    });

    // Cancel buttons
    this.shadow.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showAddForm = false;
        this.render();
      });
    });

    // File browser button
    const browseBtn = this.shadow.querySelector('.browse-btn');
    browseBtn?.addEventListener('click', () => {
      this.toggleFileBrowser();
    });

    // Form submission
    const form = this.shadow.querySelector('.project-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit(e.target as HTMLFormElement);
    });

    // Select all languages functionality
    const selectAllCheckbox = this.shadow.querySelector('#select-all-languages') as HTMLInputElement;
    const languageCheckboxes = this.shadow.querySelectorAll('input[name="languages"]') as NodeListOf<HTMLInputElement>;
    
    selectAllCheckbox?.addEventListener('change', () => {
      languageCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
      });
    });

    // Update select all state when individual checkboxes change
    languageCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const allChecked = Array.from(languageCheckboxes).every(cb => cb.checked);
        const noneChecked = Array.from(languageCheckboxes).every(cb => !cb.checked);
        
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = !allChecked && !noneChecked;
      });
    });

    // Initialize select all state based on current checkboxes
    if (selectAllCheckbox && languageCheckboxes.length > 0) {
      const allChecked = Array.from(languageCheckboxes).every(cb => cb.checked);
      const noneChecked = Array.from(languageCheckboxes).every(cb => !cb.checked);
      
      selectAllCheckbox.checked = allChecked;
      selectAllCheckbox.indeterminate = !allChecked && !noneChecked;
    }

    // Project action buttons
    this.shadow.querySelectorAll('.scan-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const projectCard = (e.target as HTMLElement).closest('.project-card');
        const projectId = projectCard?.getAttribute('data-project-id');
        if (projectId) {
          this.handleScanProject(parseInt(projectId));
        }
      });
    });

    this.shadow.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const projectCard = (e.target as HTMLElement).closest('.project-card');
        const projectId = projectCard?.getAttribute('data-project-id');
        if (projectId) {
          this.handleEditProject(parseInt(projectId));
        }
      });
    });

    this.shadow.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const projectCard = (e.target as HTMLElement).closest('.project-card');
        const projectId = projectCard?.getAttribute('data-project-id');
        if (projectId) {
          this.handleDeleteProject(parseInt(projectId));
        }
      });
    });
  }

  private async handleFormSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const selectedLanguages = Array.from(formData.getAll('languages'));

    const projectData = {
      name: formData.get('name') as string,
      displayName: formData.get('displayName') as string,
      description: formData.get('description') as string,
      rootPath: formData.get('rootPath') as string,
      languages: selectedLanguages
    };

    // Basic validation
    if (!projectData.name || !projectData.rootPath) {
      alert('Project name and root path are required');
      return;
    }

    try {
      console.log('Creating project:', projectData);
      
      // Call the real project creation API
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Project created successfully:', result.data);
        alert(`✅ Project "${projectData.displayName || projectData.name}" created successfully!`);
        
        this.showAddForm = false;
        await this.loadData();
        this.render();
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
      
    } catch (error) {
      console.error('Failed to create project:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`❌ Failed to create project:\n\n${errorMessage}`);
    }
  }

  private async handleScanProject(projectId: number): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    const projectName = project?.display_name || project?.name || `Project ${projectId}`;
    
    try {
      // Show loading state
      const scanBtn = this.shadow.querySelector(`[data-project-id="${projectId}"] .scan-btn`) as HTMLButtonElement;
      if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="animation: spin 1s linear infinite;">
            <path d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A3.488 3.488 0 0 1 8 4.5a3.487 3.487 0 0 1 2.927 1.073l1.204-1.204A5.487 5.487 0 0 0 8 2.5z"/>
          </svg>
        `;
      }

      console.log('🔍 Detecting languages and starting indexing for project:', projectId);
      
      // First detect languages
      const detectResponse = await fetch(`/api/projects/${projectId}/detect-languages`);
      let detectedLanguages = ['cpp']; // fallback
      let languageInfo = '';
      
      if (detectResponse.ok) {
        const detectResult = await detectResponse.json();
        if (detectResult.success && detectResult.data.languages.length > 0) {
          detectedLanguages = detectResult.data.languages.map((lang: any) => lang.name);
          const languageDetails = detectResult.data.languages
            .map((lang: any) => `${lang.displayName} (${lang.fileCount} files)`)
            .join(', ');
          languageInfo = `\nDetected languages: ${languageDetails}\n`;
          console.log('📋 Detected languages:', detectResult.data.languages);
        }
      }
      
      // Show confirmation with detected languages
      const confirmMessage = `🔍 Ready to index "${projectName}"!\n\n` +
        `Root path: ${project?.root_path}\n` +
        languageInfo +
        `\nThis will scan and analyze all ${detectedLanguages.join(', ')} files in the project.\n\n` +
        `Continue with indexing?`;
      
      if (!confirm(confirmMessage)) {
        return; // User cancelled
      }
      
      // Call the indexing API with detected languages
      const response = await fetch(`/api/projects/${projectId}/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          languages: detectedLanguages,
          debugMode: true,
          enableSemanticAnalysis: true,
          enablePatternDetection: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Real indexing started successfully:', result.data);
        
        // Show success message with job ID
        const jobId = result.data.jobId;
        const languages = result.data.detectedLanguages || detectedLanguages;
        const message = `✅ Real indexing started for "${projectName}"!\n\n` +
          `Job ID: ${jobId}\n` +
          `Root path: ${result.data.rootPath}\n` +
          `Languages: ${languages.join(', ')}\n` +
          `Status: ${result.data.status}\n\n` +
          `The universal indexer is now parsing your project files.\n` +
          `Check the server console for detailed progress.`;
        
        alert(message);

        // Optional: Start polling for job status
        this.pollJobStatus(jobId, projectName);
        
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
      
    } catch (error) {
      console.error('❌ Failed to start indexing:', error);
      alert(`❌ Failed to start indexing for "${projectName}":\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Restore button state
      const scanBtn = this.shadow.querySelector(`[data-project-id="${projectId}"] .scan-btn`) as HTMLButtonElement;
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A3.488 3.488 0 0 1 8 4.5a3.487 3.487 0 0 1 2.927 1.073l1.204-1.204A5.487 5.487 0 0 0 8 2.5zm-6.131 3.869a5.487 5.487 0 0 0 0 7.262l1.204-1.204a3.487 3.487 0 0 1 0-4.854L1.869 6.369zm12.262 0l-1.204 1.204a3.487 3.487 0 0 1 0 4.854l1.204 1.204a5.487 5.487 0 0 0 0-7.262zM8 13.5a3.487 3.487 0 0 1-2.927-1.073L3.869 13.631A5.487 5.487 0 0 0 8 15.5a5.487 5.487 0 0 0 4.131-1.869l-1.204-1.204A3.487 3.487 0 0 1 8 13.5z"/>
            <circle cx="8" cy="8" r="1.5"/>
          </svg>
        `;
      }
    }
  }

  /**
   * Poll job status for progress updates
   */
  private async pollJobStatus(jobId: string, projectName: string, maxPolls: number = 30): Promise<void> {
    let polls = 0;
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/indexing/jobs/${jobId}`);
        if (!response.ok) return;
        
        const result = await response.json();
        if (!result.success) return;
        
        const job = result.data;
        console.log(`📊 Job ${jobId} status: ${job.status}`, job.progress);
        
        if (job.status === 'completed') {
          console.log(`✅ Indexing completed for ${projectName}:`, job.result);
          alert(`✅ Indexing completed for "${projectName}"!\n\n` +
            `Files indexed: ${job.result.filesIndexed}\n` +
            `Symbols found: ${job.result.symbolsFound}\n` +
            `Relationships: ${job.result.relationshipsFound}\n` +
            `Duration: ${Math.round(job.result.duration / 1000)}s\n\n` +
            `You can now explore the indexed data in the dashboard.`);
          return;
        }
        
        if (job.status === 'failed') {
          console.error(`❌ Indexing failed for ${projectName}:`, job.error);
          alert(`❌ Indexing failed for "${projectName}":\n\n${job.error}`);
          return;
        }
        
        // Continue polling if still running
        if (job.status === 'running' && polls < maxPolls) {
          polls++;
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
        
      } catch (error) {
        console.error('Failed to poll job status:', error);
      }
    };
    
    // Start polling after a short delay
    setTimeout(poll, 1000);
  }

  /**
   * Handle project editing
   */
  private async handleEditProject(projectId: number): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) {
      alert('Project not found');
      return;
    }

    // For now, use a simple prompt-based editing
    // In a full implementation, you'd create a proper form dialog
    const newName = prompt('Project Name:', project.name);
    if (newName === null) return; // User cancelled

    const newDisplayName = prompt('Display Name:', project.display_name || '');
    if (newDisplayName === null) return;

    const newDescription = prompt('Description:', project.description || '');
    if (newDescription === null) return;

    const newRootPath = prompt('Root Path:', project.root_path);
    if (newRootPath === null) return;

    // Handle additional paths
    const existingAdditionalPaths = project.metadata?.additionalPaths || [];
    const additionalPathsStr = prompt(
      'Additional Paths (comma-separated):\n' +
      'These paths will also be indexed along with the main root path.',
      existingAdditionalPaths.join(', ')
    );
    if (additionalPathsStr === null) return;

    // Handle languages
    const existingLanguages = project.metadata?.languages || [];
    const languagesStr = prompt(
      'Languages to index (comma-separated):\n' +
      'Available: cpp, python, typescript, javascript, go, java, csharp',
      existingLanguages.join(', ')
    );
    if (languagesStr === null) return;

    try {
      const additionalPaths = additionalPathsStr
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      const languages = languagesStr
        .split(',')
        .map(l => l.trim().toLowerCase())
        .filter(l => l.length > 0);

      const updateData = {
        name: newName || project.name,
        displayName: newDisplayName || project.display_name,
        description: newDescription || project.description,
        rootPath: newRootPath || project.root_path,
        additionalPaths,
        languages,
        isActive: true
      };

      console.log('Updating project:', updateData);
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Project updated successfully:', result.data);
        alert(`✅ Project "${result.data.name}" updated successfully!`);
        
        await this.loadData();
        this.render();
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
      
    } catch (error) {
      console.error('Failed to update project:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`❌ Failed to update project:\n\n${errorMessage}`);
    }
  }

  /**
   * Handle project deletion
   */
  private async handleDeleteProject(projectId: number): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) {
      alert('Project not found');
      return;
    }

    const projectName = project.display_name || project.name;
    
    // Confirmation dialog
    const confirmMessage = `⚠️ Delete Project "${projectName}"?\n\n` +
      `🗑️ This will PERMANENTLY delete the project and ALL associated data:\n` +
      `   • All indexed symbols and relationships\n` +
      `   • All detected patterns\n` +
      `   • All file index data\n\n` +
      `⚠️ This action cannot be undone!\n\n` +
      `Continue with permanent deletion?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    // In development, default to hard delete to allow re-creating projects
    const hardDelete = true; // Hard delete in development for easier testing
    
    try {
      console.log('Deleting project:', projectId, hardDelete ? '(hard delete)' : '(soft delete)');
      
      const url = `/api/projects/${projectId}${hardDelete ? '?hard=true' : ''}`;
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Project deleted successfully:', result.data);
        const action = hardDelete ? 'permanently deleted' : 'deactivated';
        alert(`✅ Project "${projectName}" ${action} successfully!`);
        
        await this.loadData();
        this.render();
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
      
    } catch (error) {
      console.error('Failed to delete project:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`❌ Failed to delete project:\n\n${errorMessage}`);
    }
  }

  /**
   * Toggle file browser visibility and load directories
   */
  private async toggleFileBrowser(): Promise<void> {
    const fileBrowser = this.shadow.querySelector('.file-browser') as HTMLElement;
    const isVisible = fileBrowser.style.display !== 'none';
    
    if (isVisible) {
      fileBrowser.style.display = 'none';
    } else {
      fileBrowser.style.display = 'block';
      await this.loadDirectoryTree('/home'); // Start from user home
    }
  }

  /**
   * Load directory tree for browsing
   */
  private async loadDirectoryTree(path: string = '/'): Promise<void> {
    try {
      const response = await fetch(`/api/files/browse?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`Failed to browse directory: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to browse directory');
      }
      
      this.renderDirectoryTree(result.data, path);
    } catch (error) {
      console.error('Failed to load directory:', error);
      const fileBrowser = this.shadow.querySelector('.file-browser') as HTMLElement;
      fileBrowser.innerHTML = `
        <div class="browser-error">
          <p>❌ Failed to browse directories</p>
          <p class="error-detail">${error instanceof Error ? error.message : String(error)}</p>
          <button type="button" class="retry-btn" onclick="this.closest('project-manager').loadDirectoryTree('/')">Retry</button>
        </div>
      `;
    }
  }

  /**
   * Render directory tree in the browser
   */
  private renderDirectoryTree(items: any[], currentPath: string): void {
    const fileBrowser = this.shadow.querySelector('.file-browser') as HTMLElement;
    
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    
    fileBrowser.innerHTML = `
      <div class="directory-browser">
        <div class="browser-header">
          <div class="current-path">📁 ${currentPath}</div>
          ${currentPath !== '/' ? `
            <button type="button" class="up-btn" data-path="${parentPath}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM4.646 5.646a.5.5 0 0 1 .708 0L8 8.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/>
              </svg>
              Up
            </button>
          ` : ''}
        </div>
        <div class="directory-list">
          ${items.filter(item => item.isDirectory).map(item => `
            <div class="directory-item" data-path="${item.path}">
              <span class="dir-icon">📁</span>
              <span class="dir-name">${item.name}</span>
              <button type="button" class="select-btn" data-path="${item.path}">Select</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Add event listeners for navigation
    fileBrowser.querySelectorAll('.directory-item .dir-name, .directory-item .dir-icon').forEach(el => {
      el.addEventListener('click', (e) => {
        const path = (e.target as HTMLElement).closest('.directory-item')?.getAttribute('data-path');
        if (path) {
          this.loadDirectoryTree(path);
        }
      });
    });

    // Add event listeners for selection
    fileBrowser.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const path = (e.target as HTMLElement).getAttribute('data-path');
        if (path) {
          this.selectDirectory(path);
        }
      });
    });

    // Add up button listener
    const upBtn = fileBrowser.querySelector('.up-btn');
    upBtn?.addEventListener('click', (e) => {
      const path = (e.target as HTMLElement).getAttribute('data-path');
      if (path) {
        this.loadDirectoryTree(path);
      }
    });
  }

  /**
   * Select a directory and populate the path input
   */
  private selectDirectory(path: string): void {
    const pathInput = this.shadow.querySelector('input[name="rootPath"]') as HTMLInputElement;
    if (pathInput) {
      pathInput.value = path;
    }
    
    // Hide the file browser
    const fileBrowser = this.shadow.querySelector('.file-browser') as HTMLElement;
    fileBrowser.style.display = 'none';
  }

  styles(): string {
    return `
      .project-manager {
        padding: 24px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .manager-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 32px;
      }

      .manager-header h2 {
        margin: 0;
        color: var(--vampire-purple);
        font-size: 24px;
        font-weight: 600;
      }

      .add-project-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        background: var(--primary-accent);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        transition: var(--transition-smooth);
      }

      .add-project-btn:hover {
        background: var(--secondary-accent);
        transform: translateY(-1px);
      }

      .add-form {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 32px;
      }

      .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .form-header h3 {
        margin: 0;
        color: var(--text-primary);
      }

      .form-group {
        margin-bottom: 20px;
      }

      .form-group label {
        display: block;
        margin-bottom: 6px;
        color: var(--text-secondary);
        font-weight: 500;
        font-size: 14px;
      }

      .form-group input,
      .form-group textarea {
        width: 100%;
        padding: 12px 16px;
        background: rgba(147, 112, 219, 0.05);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        color: var(--text-primary);
        font-family: inherit;
        font-size: 14px;
        transition: var(--transition-smooth);
      }

      .form-group input:focus,
      .form-group textarea:focus {
        outline: none;
        border-color: var(--primary-accent);
        background: rgba(147, 112, 219, 0.1);
      }

      .help-text {
        margin-top: 4px;
        font-size: 12px;
        color: var(--text-muted);
      }

      .select-all-container {
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-color);
      }

      .select-all-label {
        font-weight: 600;
        color: var(--primary-accent);
      }

      .language-checkboxes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-top: 8px;
      }

      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
      }

      .checkbox-label input[type="checkbox"] {
        width: auto;
        margin: 0;
      }

      .path-input-container {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .path-input-container input {
        flex: 1;
      }

      .browse-btn {
        padding: 12px;
        background: rgba(147, 112, 219, 0.1);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: var(--transition-smooth);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .browse-btn:hover {
        background: rgba(147, 112, 219, 0.2);
        color: var(--primary-accent);
      }

      .file-browser {
        margin-top: 12px;
        border: 1px solid var(--card-border);
        border-radius: 8px;
        background: var(--card-bg);
        max-height: 300px;
        overflow: hidden;
      }

      .directory-browser {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .browser-header {
        padding: 12px;
        border-bottom: 1px solid var(--card-border);
        background: rgba(147, 112, 219, 0.05);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .current-path {
        font-family: monospace;
        font-size: 12px;
        color: var(--text-secondary);
      }

      .up-btn {
        padding: 4px 8px;
        background: transparent;
        border: 1px solid var(--card-border);
        border-radius: 4px;
        cursor: pointer;
        color: var(--text-secondary);
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .up-btn:hover {
        background: rgba(147, 112, 219, 0.1);
      }

      .directory-list {
        padding: 8px;
        max-height: 200px;
        overflow-y: auto;
      }

      .directory-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: var(--transition-smooth);
      }

      .directory-item:hover {
        background: rgba(147, 112, 219, 0.1);
      }

      .dir-icon {
        font-size: 14px;
      }

      .dir-name {
        flex: 1;
        font-family: monospace;
        font-size: 12px;
        color: var(--text-primary);
      }

      .select-btn {
        padding: 4px 8px;
        background: var(--primary-accent);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: var(--transition-smooth);
      }

      .select-btn:hover {
        background: var(--secondary-accent);
      }

      .browser-error {
        padding: 16px;
        text-align: center;
        color: var(--text-muted);
      }

      .error-detail {
        font-size: 12px;
        color: var(--text-muted);
        margin: 8px 0;
      }

      .retry-btn {
        padding: 6px 12px;
        background: var(--primary-accent);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }

      .form-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
      }

      .cancel-btn,
      .submit-btn {
        padding: 10px 20px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-weight: 500;
        transition: var(--transition-smooth);
      }

      .cancel-btn {
        background: transparent;
        color: var(--text-muted);
        border: 1px solid var(--card-border);
      }

      .cancel-btn:hover {
        background: rgba(147, 112, 219, 0.1);
        color: var(--text-secondary);
      }

      .submit-btn {
        background: var(--primary-accent);
        color: white;
      }

      .submit-btn:hover {
        background: var(--secondary-accent);
      }

      .projects-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
        gap: 24px;
      }

      .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 60px 20px;
        color: var(--text-muted);
      }

      .empty-icon {
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .empty-subtitle {
        margin-top: 8px;
        font-size: 14px;
      }

      .project-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 20px;
        transition: var(--transition-smooth);
      }

      .project-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
      }

      .project-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }

      .project-name {
        margin: 0 0 8px 0;
        color: var(--vampire-purple);
        font-size: 18px;
        font-weight: 600;
      }

      .project-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
      }

      .project-path {
        font-family: monospace;
        font-size: 12px;
        color: var(--text-muted);
      }

      .project-symbols {
        font-size: 12px;
        color: var(--primary-accent);
        font-weight: 500;
      }

      .project-additional-paths {
        font-size: 11px;
        color: var(--success-color);
        background: rgba(0, 230, 118, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        cursor: help;
      }

      .project-languages {
        font-size: 11px;
        color: var(--info-color);
        background: rgba(33, 150, 243, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        cursor: help;
        font-family: monospace;
      }

      .project-actions {
        display: flex;
        gap: 8px;
      }

      .action-btn {
        padding: 8px;
        background: rgba(147, 112, 219, 0.1);
        border: 1px solid var(--card-border);
        border-radius: 6px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: var(--transition-smooth);
      }

      .action-btn:hover {
        background: rgba(147, 112, 219, 0.2);
        color: var(--primary-accent);
      }

      .edit-btn:hover {
        background: rgba(33, 150, 243, 0.2);
        color: #2196f3;
      }

      .delete-btn:hover {
        background: rgba(244, 67, 54, 0.2);
        color: #f44336;
      }

      .project-description {
        margin: 12px 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.4;
      }

      .project-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--card-border);
      }

      .project-date {
        font-size: 12px;
        color: var(--text-muted);
      }

      .project-languages {
        display: flex;
        gap: 6px;
      }

      .language-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
      }

      .language-badge.cpp {
        background: rgba(255, 166, 87, 0.2);
        color: #ffa657;
      }

      .language-badge.python {
        background: rgba(55, 118, 171, 0.2);
        color: #3776ab;
      }

      .language-badge.typescript {
        background: rgba(49, 120, 198, 0.2);
        color: #3178c6;
      }

      .language-badge.javascript {
        background: rgba(240, 219, 79, 0.2);
        color: #f0db4f;
      }

      .language-badge.go {
        background: rgba(0, 173, 181, 0.2);
        color: #00add8;
      }

      .language-badge.java {
        background: rgba(237, 117, 21, 0.2);
        color: #ed7515;
      }

      .language-badge.csharp {
        background: rgba(147, 112, 219, 0.2);
        color: #9370db;
      }

      /* Animations */
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .action-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Add more language badge styles as needed */
    `;
  }
}

// Register the component
defineComponent('project-manager', ProjectManager);