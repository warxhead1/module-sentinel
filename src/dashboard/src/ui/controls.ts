/**
 * Dashboard Controls
 * UI controls for visualization modes and settings
 */

export class Controls {
  private dashboard: any;
  
  constructor(dashboard: any) {
    this.dashboard = dashboard;
    this.initControls();
  }
  
  private initControls(): void {
    // Mode buttons
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = (e.target as HTMLElement).dataset.mode as 'graph' | 'flow' | 'hybrid';
        if (mode) {
          this.dashboard.setVisualizationMode(mode);
          this.updateModeButtons(mode);
        }
      });
    });
    
    // Data layer buttons
    const layerButtons = document.querySelectorAll('.layer-btn');
    layerButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const layer = (e.target as HTMLElement).dataset.layer as 'symbols' | 'patterns' | 'quality';
        if (layer) {
          this.dashboard.setDataLayer(layer);
          this.updateLayerButtons(layer);
        }
      });
    });
    
    // Quality slider
    const qualitySlider = document.getElementById('quality-slider') as HTMLInputElement;
    if (qualitySlider) {
      qualitySlider.addEventListener('change', (e) => {
        const quality = (e.target as HTMLInputElement).value;
        console.info(`Quality level set to: ${quality}`);
        // TODO: Update render quality
      });
    }
  }
  
  private updateModeButtons(activeMode: string): void {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === activeMode);
    });
  }
  
  private updateLayerButtons(activeLayer: string): void {
    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-layer') === activeLayer);
    });
  }
}