/**
 * Insight Panels
 * Display symbol details, patterns, and quality metrics
 */

import type { Symbol, PatternDetectionResult } from '../types/rust-bindings.js';

export class InsightPanels {
  private panelElement: HTMLElement | null;
  private dashboard: any;
  
  constructor(dashboard: any) {
    this.dashboard = dashboard;
    this.panelElement = document.getElementById('insight-panel');
  }
  
  showSymbolDetails(symbol: Symbol): void {
    if (!this.panelElement) return;
    
    // Get related symbols from live data manager
    const relatedSymbols = this.dashboard.liveDataManager?.getRelatedSymbols(symbol.id) || [];
    
    const html = `
      <div class="symbol-details">
        <h3>${symbol.name}</h3>
        <div class="detail-row">
          <span class="label">Type:</span>
          <span class="value">${symbol.signature}</span>
        </div>
        <div class="detail-row">
          <span class="label">Language:</span>
          <span class="value">${symbol.language}</span>
        </div>
        <div class="detail-row">
          <span class="label">File:</span>
          <span class="value">${symbol.filePath}</span>
        </div>
        <div class="detail-row">
          <span class="label">Lines:</span>
          <span class="value">${symbol.startLine} - ${symbol.endLine}</span>
        </div>
        ${symbol.confidenceScore ? `
          <div class="detail-row">
            <span class="label">Confidence:</span>
            <span class="value">${(symbol.confidenceScore * 100).toFixed(1)}%</span>
          </div>
        ` : ''}
        ${relatedSymbols.length > 0 ? `
          <div class="related-symbols">
            <h4>Related Symbols (${relatedSymbols.length})</h4>
            <ul class="related-list">
              ${relatedSymbols.slice(0, 5).map((rel: Symbol) => 
                `<li class="clickable" data-symbol-id="${rel.id}">${rel.name} (${rel.language})</li>`
              ).join('')}
              ${relatedSymbols.length > 5 ? `<li class="more">...and ${relatedSymbols.length - 5} more</li>` : ''}
            </ul>
          </div>
        ` : ''}
        <div class="actions">
          <button onclick="window.dashboard?.selectRelatedSymbols('${symbol.id}')">Show All Relations</button>
          ${this.dashboard.state.mode !== 'flow' ? 
            `<button onclick="window.dashboard?.setVisualizationMode('flow')">View Data Flow</button>` : ''
          }
        </div>
      </div>
    `;
    
    this.panelElement.innerHTML = html;
    this.panelElement.classList.add('active');
    
    // Add click handlers for related symbols
    this.panelElement.querySelectorAll('.clickable').forEach(el => {
      el.addEventListener('click', (e) => {
        const symbolId = (e.target as HTMLElement).dataset.symbolId;
        if (symbolId) {
          const relSymbol = this.dashboard.liveDataManager?.getSymbolById(symbolId);
          if (relSymbol) {
            this.dashboard.selectSymbol(relSymbol);
          }
        }
      });
    });
  }
  
  showPatternDetails(pattern: PatternDetectionResult): void {
    if (!this.panelElement) return;
    
    const html = `
      <div class="pattern-details">
        <h3>${pattern.category}</h3>
        <div class="detail-row">
          <span class="label">Confidence:</span>
          <span class="value">${(pattern.confidence * 100).toFixed(1)}%</span>
        </div>
        <div class="detail-row">
          <span class="label">Symbols:</span>
          <span class="value">${pattern.symbols.length}</span>
        </div>
        <h4>Evidence:</h4>
        <ul class="evidence-list">
          ${pattern.evidence.map((ev: string) => `<li>${ev}</li>`).join('')}
        </ul>
      </div>
    `;
    
    this.panelElement.innerHTML = html;
    this.panelElement.classList.add('active');
  }
  
  clear(): void {
    if (!this.panelElement) return;
    
    this.panelElement.innerHTML = '';
    this.panelElement.classList.remove('active');
  }
  
  toggle(): void {
    if (!this.panelElement) return;
    
    this.panelElement.classList.toggle('hidden');
  }
  
  updateForDataLayer(): void {
    if (!this.panelElement || this.dashboard.state.selectedSymbol) return;
    
    const layer = this.dashboard.state.dataLayer;
    let content = '';
    
    switch (layer) {
      case 'symbols': {
        const symbolCount = this.dashboard.stats?.symbolCount || 0;
        content = `
          <div class="layer-info">
            <h3>Symbol View</h3>
            <p>Showing all ${symbolCount} symbols in the codebase</p>
            <ul>
              <li>Node size represents code complexity</li>
              <li>Colors indicate programming language</li>
              <li>Lines show relationships between symbols</li>
            </ul>
          </div>
        `;
        break;
      }
        
      case 'patterns':
        content = `
          <div class="layer-info">
            <h3>Pattern Detection</h3>
            <p>Highlighting design patterns and code structures</p>
            <ul>
              <li>Green: Well-structured patterns</li>
              <li>Yellow: Potential improvements</li>
              <li>Red: Anti-patterns detected</li>
            </ul>
          </div>
        `;
        break;
        
      case 'quality':
        content = `
          <div class="layer-info">
            <h3>Code Quality</h3>
            <p>Analyzing code health and maintainability</p>
            <ul>
              <li>Opacity shows confidence level</li>
              <li>Larger nodes may need refactoring</li>
              <li>Dimmed symbols have quality issues</li>
            </ul>
          </div>
        `;
        break;
    }
    
    this.panelElement.innerHTML = content;
    this.panelElement.classList.add('active');
  }
}