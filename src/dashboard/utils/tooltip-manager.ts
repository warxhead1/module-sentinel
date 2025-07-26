/**
 * TooltipManager - Rich HTML tooltip system for the dashboard
 * Supports HTML content, positioning, animations, and smart placement
 */

export interface TooltipOptions {
  content: string | HTMLElement;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  delay?: number;
  maxWidth?: number;
  className?: string;
  interactive?: boolean;
  html?: boolean;
  offset?: { x: number; y: number };
}

export class TooltipManager {
  private static instance: TooltipManager;
  private tooltip: HTMLElement | null = null;
  private currentTarget: HTMLElement | null = null;
  private showTimeout: number | null = null;
  private hideTimeout: number | null = null;
  private isInteractive: boolean = false;

  private constructor() {
    this.createTooltip();
    this.setupGlobalListeners();
  }

  static getInstance(): TooltipManager {
    if (!TooltipManager.instance) {
      TooltipManager.instance = new TooltipManager();
    }
    return TooltipManager.instance;
  }

  /**
   * Create the tooltip element
   */
  private createTooltip(): void {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip-container';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      max-width: 400px;
      background: rgba(30, 30, 40, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(186, 85, 211, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      line-height: 1.4;
      color: #e4e4e7;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    `;
    document.body.appendChild(this.tooltip);
  }

  /**
   * Setup global event listeners
   */
  private setupGlobalListeners(): void {
    // Hide tooltip when scrolling
    window.addEventListener('scroll', () => this.hide(), true);
    
    // Hide tooltip when pressing Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  /**
   * Bind tooltip to an element
   */
  bind(element: HTMLElement, options: TooltipOptions): void {
    const showTooltip = () => {
      if (this.showTimeout) clearTimeout(this.showTimeout);
      this.showTimeout = window.setTimeout(() => {
        this.show(element, options);
      }, options.delay || 200);
    };

    const hideTooltip = () => {
      if (this.showTimeout) {
        clearTimeout(this.showTimeout);
        this.showTimeout = null;
      }
      if (!this.isInteractive || !options.interactive) {
        this.scheduleHide();
      }
    };

    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('focus', showTooltip);
    element.addEventListener('blur', hideTooltip);
    
    // Store tooltip data on element
    (element as any)._tooltipOptions = options;
  }

  /**
   * Show tooltip for an element
   */
  private show(element: HTMLElement, options: TooltipOptions): void {
    if (!this.tooltip) return;

    this.currentTarget = element;
    this.isInteractive = options.interactive || false;

    // Set content
    if (options.html === false || typeof options.content === 'string') {
      this.tooltip.textContent = options.content as string;
    } else if (options.content instanceof HTMLElement) {
      this.tooltip.innerHTML = '';
      this.tooltip.appendChild(options.content);
    } else {
      this.tooltip.innerHTML = options.content as string;
    }

    // Apply custom class if provided
    if (options.className) {
      this.tooltip.className = `tooltip-container ${options.className}`;
    }

    // Set max width
    if (options.maxWidth) {
      this.tooltip.style.maxWidth = `${options.maxWidth}px`;
    }

    // Set interactive mode
    if (options.interactive) {
      this.tooltip.style.pointerEvents = 'auto';
      this.tooltip.addEventListener('mouseenter', () => {
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
      });
      this.tooltip.addEventListener('mouseleave', () => {
        this.scheduleHide();
      });
    } else {
      this.tooltip.style.pointerEvents = 'none';
    }

    // Position tooltip
    this.position(element, options.placement || 'auto', options.offset);

    // Show tooltip
    this.tooltip.style.opacity = '1';
  }

  /**
   * Hide tooltip
   */
  hide(): void {
    if (!this.tooltip) return;
    
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    
    this.tooltip.style.opacity = '0';
    this.currentTarget = null;
    this.isInteractive = false;
  }

  /**
   * Schedule tooltip hide with delay
   */
  private scheduleHide(): void {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = window.setTimeout(() => this.hide(), 100);
  }

  /**
   * Position tooltip relative to element
   */
  private position(
    element: HTMLElement,
    placement: string,
    offset?: { x: number; y: number }
  ): void {
    if (!this.tooltip) return;

    const rect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const offsetX = offset?.x || 0;
    const offsetY = offset?.y || 8;

    let top = 0;
    let left = 0;

    // Auto placement - find best position
    if (placement === 'auto') {
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceLeft = rect.left;
      const spaceRight = window.innerWidth - rect.right;

      if (spaceBelow >= tooltipRect.height + offsetY) {
        placement = 'bottom';
      } else if (spaceAbove >= tooltipRect.height + offsetY) {
        placement = 'top';
      } else if (spaceRight >= tooltipRect.width + offsetX) {
        placement = 'right';
      } else if (spaceLeft >= tooltipRect.width + offsetX) {
        placement = 'left';
      } else {
        placement = 'bottom'; // Default fallback
      }
    }

    // Calculate position based on placement
    switch (placement) {
      case 'top':
        top = rect.top - tooltipRect.height - offsetY;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + offsetY;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.left - tooltipRect.width - offsetX;
        break;
      case 'right':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.right + offsetX;
        break;
    }

    // Ensure tooltip stays within viewport
    const margin = 10;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  /**
   * Create a rich HTML tooltip content
   */
  static createRichContent(options: {
    title?: string;
    description?: string;
    stats?: Array<{ label: string; value: string | number; color?: string }>;
    actions?: Array<{ label: string; icon?: string }>;
    image?: string;
  }): HTMLElement {
    const container = document.createElement('div');
    container.className = 'tooltip-rich-content';

    if (options.title) {
      const title = document.createElement('div');
      title.className = 'tooltip-title';
      title.textContent = options.title;
      title.style.cssText = `
        font-weight: 600;
        margin-bottom: 8px;
        color: #ba55d3;
      `;
      container.appendChild(title);
    }

    if (options.description) {
      const desc = document.createElement('div');
      desc.className = 'tooltip-description';
      desc.textContent = options.description;
      desc.style.cssText = `
        margin-bottom: 8px;
        opacity: 0.9;
      `;
      container.appendChild(desc);
    }

    if (options.stats && options.stats.length > 0) {
      const statsContainer = document.createElement('div');
      statsContainer.className = 'tooltip-stats';
      statsContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-top: 8px;
      `;

      options.stats.forEach(stat => {
        const statItem = document.createElement('div');
        statItem.className = 'tooltip-stat';
        statItem.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;
        
        const label = document.createElement('span');
        label.textContent = stat.label;
        label.style.opacity = '0.7';
        
        const value = document.createElement('span');
        value.textContent = stat.value.toString();
        value.style.fontWeight = '600';
        if (stat.color) value.style.color = stat.color;
        
        statItem.appendChild(label);
        statItem.appendChild(value);
        statsContainer.appendChild(statItem);
      });

      container.appendChild(statsContainer);
    }

    if (options.actions && options.actions.length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'tooltip-actions';
      actionsContainer.style.cssText = `
        display: flex;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      `;

      options.actions.forEach(action => {
        const actionBtn = document.createElement('span');
        actionBtn.className = 'tooltip-action';
        actionBtn.textContent = `${action.icon || '→'} ${action.label}`;
        actionBtn.style.cssText = `
          font-size: 12px;
          opacity: 0.7;
        `;
        actionsContainer.appendChild(actionBtn);
      });

      container.appendChild(actionsContainer);
    }

    return container;
  }

  /**
   * Remove tooltip binding from element
   */
  unbind(element: HTMLElement): void {
    // Remove event listeners (would need to store references for proper cleanup)
    delete (element as any)._tooltipOptions;
  }
}

// Export singleton instance
export const tooltipManager = TooltipManager.getInstance();