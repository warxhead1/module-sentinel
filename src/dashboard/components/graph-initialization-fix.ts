/**
 * Graph Initialization Fix
 * Ensures graphs render properly even with async data loading
 */

export class GraphInitializationHelper {
  static async ensureContainerReady(
    container: HTMLElement, 
    maxAttempts: number = 10
  ): Promise<{ width: number; height: number }> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      // Force layout calculation
      container.style.display = 'block';
      container.style.minHeight = '500px';
      
      const rect = container.getBoundingClientRect();
      const width = rect.width || container.offsetWidth;
      const height = rect.height || container.offsetHeight;
      
      if (width > 0 && height > 0) {
        return { width, height };
      }
      
      // Wait a frame and try again
      await new Promise(resolve => requestAnimationFrame(resolve));
      attempts++;
    }
    
    // Fallback dimensions
    console.warn('Container dimensions not available, using defaults');
    return { width: 800, height: 600 };
  }
  
  static createLoadingPlaceholder(container: HTMLElement): void {
    container.innerHTML = `
      <div class="graph-loading-state" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 500px;
        color: var(--text-muted);
      ">
        <div class="loading-icon" style="
          font-size: 4rem;
          margin-bottom: 20px;
          animation: pulse-glow 2s ease-in-out infinite;
        ">⟳</div>
        <p>Analyzing code relationships...</p>
        <div class="loading-particles" style="
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        ">
          ${Array.from({ length: 20 }, (_, i) => `
            <div class="particle" style="
              left: ${Math.random() * 100}%;
              animation-delay: ${i * 0.5}s;
            "></div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  static handleEmptyData(container: HTMLElement, componentName: string): void {
    container.innerHTML = `
      <div class="empty-state" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 500px;
        text-align: center;
        padding: 40px;
      ">
        <div class="empty-icon" style="
          font-size: 5rem;
          margin-bottom: 24px;
          opacity: 0.5;
        ">🔍</div>
        <h3 style="
          font-size: 1.5rem;
          color: var(--primary-accent);
          margin: 0 0 12px 0;
        ">No Data Found</h3>
        <p style="
          color: var(--text-muted);
          max-width: 400px;
          margin: 0 0 24px 0;
        ">
          ${componentName === 'relationships' 
            ? 'No code relationships detected. Try running the indexer first.'
            : 'No data available for visualization.'}
        </p>
        <button class="refresh-btn" style="
          background: var(--primary-accent);
          color: var(--primary-bg);
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
        " onclick="window.location.reload()">
          Refresh Data
        </button>
      </div>
    `;
  }
}