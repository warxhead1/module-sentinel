/**
 * Base class for all dashboard components
 * Provides common functionality for Web Components
 */
export abstract class DashboardComponent extends HTMLElement {
  protected shadow: ShadowRoot;
  protected _data: any = null;
  protected _loading: boolean = false;
  protected _error: string | null = null;
  private boundHandleSelectionChange: () => Promise<void>;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.addBaseStyles();
    // Store bound function reference for proper cleanup
    this.boundHandleSelectionChange = this.handleSelectionChange.bind(this);
  }

  connectedCallback() {
    this.render();
    this.loadData().catch(error => {
      // Ignore abort errors - they're expected when navigating away
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error(`Error loading data for ${this.tagName}:`, error);
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    });
    
    // Listen for project selection changes (but not for project-selector or nav-sidebar to avoid loops)
    const tagName = this.tagName.toLowerCase();
    if (tagName !== 'project-selector' && tagName !== 'nav-sidebar') {
      document.addEventListener('selection-changed', this.boundHandleSelectionChange);
    }
  }
  
  private async handleSelectionChange() {
    // Debounce rapid selection changes
    if (this._loading) return;
    
    // Prevent recursive calls from project-selector
    if (this.tagName.toLowerCase() === 'project-selector') return;
    
    this._loading = true;
    this.render();
    
    try {
      await this.loadData();
    } catch (error) {
      console.error(`Error reloading data for ${this.tagName}:`, error);
      this._error = error instanceof Error ? error.message : String(error);
    } finally {
      this._loading = false;
      this.render();
    }
  }

  disconnectedCallback() {
    // Cleanup event listeners using the same bound function reference
    const tagName = this.tagName.toLowerCase();
    if (tagName !== 'project-selector' && tagName !== 'nav-sidebar') {
      document.removeEventListener('selection-changed', this.boundHandleSelectionChange);
    }
  }

  /**
   * Load data for the component
   */
  abstract loadData(): Promise<void>;

  /**
   * Render the component
   */
  abstract render(): void;

  /**
   * Add base styles that all components share
   */
  protected addBaseStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #ffffff;
        --primary-accent: #64ffda;
        --secondary-accent: #4ecdc4;
        --card-bg: rgba(255, 255, 255, 0.03);
        --card-border: rgba(255, 255, 255, 0.08);
        --text-primary: #ffffff;
        --text-secondary: #b0bec5;
        --text-muted: #546e7a;
        --border-radius: 12px;
        --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        --shadow-soft: 0 4px 20px rgba(0, 0, 0, 0.15);
        --shadow-medium: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      
      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
        font-size: 1.1rem;
        color: var(--primary-accent);
        flex-direction: column;
        gap: 20px;
      }
      
      .loading::before {
        content: '';
        width: 40px;
        height: 40px;
        border: 3px solid rgba(100, 255, 218, 0.1);
        border-top-color: var(--primary-accent);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      .error {
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.1), rgba(244, 67, 54, 0.05));
        border: 1px solid rgba(244, 67, 54, 0.3);
        color: #ef5350;
        padding: 24px;
        border-radius: var(--border-radius);
        margin: 20px 0;
        backdrop-filter: blur(10px);
        box-shadow: var(--shadow-soft);
      }
      
      .card {
        background: var(--card-bg);
        border-radius: var(--border-radius);
        padding: 28px;
        border: 1px solid var(--card-border);
        backdrop-filter: blur(20px);
        transition: var(--transition-smooth);
        box-shadow: var(--shadow-soft);
        position: relative;
        overflow: hidden;
      }
      
      .card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, 
          transparent, 
          var(--primary-accent), 
          transparent);
        opacity: 0;
        transition: var(--transition-smooth);
      }
      
      .card:hover {
        transform: translateY(-4px);
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(100, 255, 218, 0.2);
        box-shadow: var(--shadow-medium), 0 0 40px rgba(100, 255, 218, 0.1);
      }
      
      .card:hover::before {
        opacity: 1;
      }
      
      h1, h2, h3, h4 {
        color: var(--primary-accent);
        margin-top: 0;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      
      h1 { font-size: 2.5rem; }
      h2 { font-size: 1.875rem; }
      h3 { font-size: 1.5rem; }
      h4 { font-size: 1.25rem; }
      
      .metric-value {
        font-size: 3rem;
        font-weight: 700;
        background: linear-gradient(135deg, var(--primary-accent), var(--secondary-accent));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 8px;
        line-height: 1;
        letter-spacing: -0.05em;
      }
      
      .metric-label {
        font-size: 0.875rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 500;
      }
      
      /* Enhanced scrollbar for shadow DOM */
      ::-webkit-scrollbar {
        width: 6px;
      }
      
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      
      ::-webkit-scrollbar-thumb {
        background: linear-gradient(to bottom, var(--primary-accent), var(--secondary-accent));
        border-radius: 3px;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background: var(--primary-accent);
      }
      
      /* Selection styling */
      ::selection {
        background: rgba(100, 255, 218, 0.2);
        color: var(--text-primary);
      }
      
      /* Focus states */
      *:focus {
        outline: 2px solid var(--primary-accent);
        outline-offset: 2px;
      }
      
      /* Smooth transitions for all interactive elements */
      button, a, input, select, textarea {
        transition: var(--transition-smooth);
      }
    `;
    this.shadow.appendChild(style);
  }

  /**
   * Helper to fetch data from API
   */
  protected async fetchAPI(endpoint: string): Promise<any> {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      const result = await response.json();
      
      // Handle API response format
      if (result.success && result.data !== undefined) {
        return result.data;
      } else if (result.error) {
        throw new Error(result.error);
      }
      
      // Fallback for legacy endpoints
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Show loading state
   */
  protected renderLoading(): string {
    return '<div class="loading">Loading...</div>';
  }

  /**
   * Show error state
   */
  protected renderError(): string {
    return `<div class="error">Error: ${this._error}</div>`;
  }

  /**
   * Dispatch custom event
   */
  protected emit(eventName: string, detail: any = null) {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Update component data and re-render
   */
  protected updateData(data: any) {
    this._data = data;
    this.render();
  }
}

/**
 * Register a component with error handling
 */
export function defineComponent(name: string, componentClass: CustomElementConstructor) {
  if (!customElements.get(name)) {
    customElements.define(name, componentClass);
  }
}