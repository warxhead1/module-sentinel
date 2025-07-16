/**
 * Immersive Modal System
 * Creates beautiful, interactive modals with spider-web connections
 * for exploring code relationships and data flow
 */

interface ModalConfig {
  id: string;
  title: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  data: any;
}

export class ImmersiveModalSystem {
  private modalContainer!: HTMLElement;
  private overlay!: HTMLElement;
  private activeConnections: any[] = [];
  private d3: any; // Will be injected from window.d3

  constructor() {
    this.createModalStructure();
    this.attachEventListeners();
  }

  private createModalStructure(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'immersive-overlay';
    this.overlay.innerHTML = `
      <div class="immersive-bg-effect"></div>
      <canvas id="connectionCanvas"></canvas>
    `;
    
    // Create modal container
    this.modalContainer = document.createElement('div');
    this.modalContainer.className = 'immersive-modal-container';
    
    // Add to body
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.modalContainer);
  }

  private attachEventListeners(): void {
    // Close on overlay click
    this.overlay.addEventListener('click', (e: Event) => {
      if (e.target === this.overlay || (e.target as HTMLElement).classList.contains('immersive-bg-effect')) {
        this.closeAll();
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeAll();
      }
    });
  }

  public async openSymbolModal(symbolData: any, triggerElement: HTMLElement): Promise<void> {
    // Show overlay with animation
    this.overlay.classList.add('active');
    
    // Get trigger position
    const rect = triggerElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create main modal
    const modal = this.createModal({
      id: `symbol-${symbolData.id}`,
      title: symbolData.name,
      type: 'symbol',
      x: centerX - 250,
      y: centerY - 200,
      width: 500,
      height: 400,
      content: this.generateSymbolContent(symbolData),
      data: symbolData
    });
    
    // Animate in
    this.animateModalIn(modal, centerX, centerY);
    
    // Load relationships
    const relationships = await this.loadRelationships(symbolData.id);
    
    // Create spider web connections
    this.createSpiderWeb(modal, relationships);
  }

  private createModal(config: ModalConfig): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'immersive-modal';
    modal.id = config.id;
    modal.style.left = `${config.x}px`;
    modal.style.top = `${config.y}px`;
    modal.style.width = `${config.width}px`;
    modal.style.height = `${config.height}px`;
    
    modal.innerHTML = `
      <div class="modal-glow"></div>
      <div class="modal-header">
        <h3>${config.title}</h3>
        <span class="modal-type">${config.type}</span>
        <button class="modal-close" onclick="immersiveModal.closeModal('${config.id}')">×</button>
      </div>
      <div class="modal-body">
        ${config.content}
      </div>
      <div class="modal-footer">
        <div class="modal-actions">
          <button class="action-btn explore" onclick="immersiveModal.exploreConnections('${config.id}')">
            <span class="action-icon">🕸️</span> Explore Connections
          </button>
          <button class="action-btn trace" onclick="immersiveModal.traceFlow('${config.id}')">
            <span class="action-icon">🌊</span> Trace Flow
          </button>
          <button class="action-btn details" onclick="immersiveModal.showDetails('${config.id}')">
            <span class="action-icon">📊</span> Details
          </button>
        </div>
      </div>
    `;
    
    // Make draggable
    this.makeDraggable(modal);
    
    // Store data
    modal.dataset.symbolData = JSON.stringify(config.data);
    
    this.modalContainer.appendChild(modal);
    return modal;
  }

  private generateSymbolContent(symbol: any): string {
    return `
      <div class="symbol-info">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Type</span>
            <span class="info-value">${symbol.kind || 'Unknown'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Namespace</span>
            <span class="info-value">${symbol.namespace || 'Global'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">File</span>
            <span class="info-value">${symbol.file_path?.split('/').pop() || 'Unknown'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Line</span>
            <span class="info-value">${symbol.line || 'N/A'}</span>
          </div>
        </div>
        
        ${symbol.signature ? `
          <div class="signature-section">
            <h4>Signature</h4>
            <pre class="signature-code">${this.escapeHtml(symbol.signature)}</pre>
          </div>
        ` : ''}
        
        ${symbol.complexity ? `
          <div class="complexity-indicator">
            <span class="complexity-label">Complexity</span>
            <div class="complexity-bar">
              <div class="complexity-fill" style="width: ${Math.min(symbol.complexity * 5, 100)}%"></div>
            </div>
            <span class="complexity-value">${symbol.complexity}</span>
          </div>
        ` : ''}
        
        <div class="tags-section">
          ${(symbol.semantic_tags || []).map((tag: string) => 
            `<span class="semantic-tag">${tag}</span>`
          ).join('')}
        </div>
      </div>
    `;
  }

  private async loadRelationships(symbolId: string): Promise<any> {
    try {
      const response = await fetch(`/api/trace-flow?symbol=${symbolId}&depth=3`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to load relationships:', error);
      return { nodes: [], edges: [] };
    }
  }

  private createSpiderWeb(centralModal: HTMLElement, relationships: any): void {
    const canvas = document.getElementById('connectionCanvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Clear previous connections
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Get central position
    const centralRect = centralModal.getBoundingClientRect();
    const centerX = centralRect.left + centralRect.width / 2;
    const centerY = centralRect.top + centralRect.height / 2;
    
    // Create satellite modals for relationships
    const nodes = relationships.nodes || [];
    const edges = relationships.edges || [];
    
    // Position satellites in a circle
    const radius = 300;
    const angleStep = (2 * Math.PI) / Math.max(nodes.length - 1, 1);
    
    nodes.forEach((node: any, index: number) => {
      if (node.id === relationships.entryPoint) return; // Skip central node
      
      const angle = index * angleStep;
      const x = centerX + radius * Math.cos(angle) - 150;
      const y = centerY + radius * Math.sin(angle) - 100;
      
      // Create satellite modal
      const satelliteModal = this.createModal({
        id: `satellite-${node.id}`,
        title: node.label,
        type: node.type,
        x: x,
        y: y,
        width: 300,
        height: 200,
        content: this.generateSatelliteContent(node),
        data: node
      });
      
      satelliteModal.classList.add('satellite-modal');
      
      // Draw connection
      this.drawConnection(ctx, centerX, centerY, x + 150, y + 100, node.type);
      
      // Animate in with delay
      setTimeout(() => {
        satelliteModal.classList.add('animate-in');
      }, index * 100);
    });
    
    // Draw flow indicators
    this.animateFlowIndicators(ctx, edges);
  }

  private generateSatelliteContent(node: any): string {
    return `
      <div class="satellite-info">
        <p class="satellite-title">${node.title || node.label}</p>
        <div class="satellite-meta">
          <span class="meta-item">Level: ${node.level || 0}</span>
          <span class="meta-item">Type: ${node.type}</span>
        </div>
      </div>
    `;
  }

  private drawConnection(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, type: string): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    
    // Create curved path
    const cp1x = x1 + (x2 - x1) / 3;
    const cp1y = y1 - 50;
    const cp2x = x1 + 2 * (x2 - x1) / 3;
    const cp2y = y2 - 50;
    
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    
    // Style based on type
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    if (type === 'calls') {
      gradient.addColorStop(0, 'rgba(78, 205, 196, 0.8)');
      gradient.addColorStop(1, 'rgba(78, 205, 196, 0.2)');
    } else if (type === 'imports') {
      gradient.addColorStop(0, 'rgba(255, 107, 107, 0.8)');
      gradient.addColorStop(1, 'rgba(255, 107, 107, 0.2)');
    } else {
      gradient.addColorStop(0, 'rgba(255, 165, 2, 0.8)');
      gradient.addColorStop(1, 'rgba(255, 165, 2, 0.2)');
    }
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add arrow
    this.drawArrow(ctx, x2, y2, Math.atan2(y2 - cp2y, x2 - cp2x));
  }

  private drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
    const headLength = 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - headLength * Math.cos(angle - Math.PI / 6), y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x, y);
    ctx.lineTo(x - headLength * Math.cos(angle + Math.PI / 6), y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  private animateFlowIndicators(ctx: CanvasRenderingContext2D, edges: any[]): void {
    // Animate particles along connections
    const particles: any[] = [];
    
    edges.forEach((edge: any) => {
      particles.push({
        from: edge.from,
        to: edge.to,
        progress: 0,
        speed: 0.02 + Math.random() * 0.02
      });
    });
    
    // Animation loop would go here
  }

  private animateModalIn(modal: HTMLElement, fromX: number, fromY: number): void {
    modal.style.transform = `scale(0) translate(${fromX}px, ${fromY}px)`;
    modal.style.opacity = '0';
    
    requestAnimationFrame(() => {
      modal.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      modal.style.transform = 'scale(1) translate(0, 0)';
      modal.style.opacity = '1';
    });
  }

  private makeDraggable(modal: HTMLElement): void {
    const header = modal.querySelector('.modal-header') as HTMLElement;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let modalX = 0;
    let modalY = 0;
    
    header.addEventListener('mousedown', (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      modalX = modal.offsetLeft;
      modalY = modal.offsetTop;
      modal.style.zIndex = '1000';
    });
    
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      modal.style.left = `${modalX + dx}px`;
      modal.style.top = `${modalY + dy}px`;
      
      // Redraw connections
      this.updateConnections();
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
      modal.style.zIndex = '';
    });
  }

  private updateConnections(): void {
    // Redraw canvas connections when modals move
    const canvas = document.getElementById('connectionCanvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw all active connections
    // Implementation would track and redraw connections
  }

  public exploreConnections(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const data = JSON.parse(modal.dataset.symbolData || '{}');
    
    // Load deeper connections
    this.loadDeepConnections(data.id);
  }

  private async loadDeepConnections(symbolId: string): Promise<void> {
    // Load and display deeper relationship data
    console.log('Loading deep connections for', symbolId);
  }

  public traceFlow(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Create flow visualization
    this.createFlowVisualization(modal);
  }

  private createFlowVisualization(modal: HTMLElement): void {
    // Create animated flow paths
    console.log('Creating flow visualization');
  }

  public showDetails(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Expand modal with detailed information
    modal.classList.add('expanded');
  }

  public closeModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.style.transition = 'all 0.3s ease';
    modal.style.transform = 'scale(0)';
    modal.style.opacity = '0';
    
    setTimeout(() => {
      modal.remove();
      
      // Check if any modals left
      if (this.modalContainer.children.length === 0) {
        this.closeAll();
      }
    }, 300);
  }

  public closeAll(): void {
    this.overlay.classList.remove('active');
    this.modalContainer.innerHTML = '';
    
    // Clear canvas
    const canvas = document.getElementById('connectionCanvas') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Make ImmersiveModalSystem available globally for browser use
if (typeof window !== 'undefined') {
  (window as any).ImmersiveModalSystem = ImmersiveModalSystem;
}

// Global instance
declare global {
  interface Window {
    immersiveModal: ImmersiveModalSystem;
    ImmersiveModalSystem: typeof ImmersiveModalSystem;
  }
}