/**
 * AI Helper Panel
 * Provides contextual suggestions and insights
 */

import type { Symbol } from '../types/rust-bindings.js';

export class AIHelper {
  private helperElement: HTMLElement | null;
  private dashboard: any;
  
  constructor(dashboard: any) {
    this.dashboard = dashboard;
    this.helperElement = document.getElementById('ai-helper');
  }
  
  updateSuggestions(symbol: Symbol): void {
    if (!this.helperElement) return;
    
    // Generate contextual suggestions based on symbol
    const suggestions = this.generateSuggestions(symbol);
    
    const html = `
      <div class="ai-suggestions">
        <h4>AI Insights</h4>
        <ul class="suggestion-list">
          ${suggestions.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    `;
    
    this.helperElement.innerHTML = html;
  }
  
  private generateSuggestions(symbol: Symbol): string[] {
    const suggestions: string[] = [];
    
    // Analyze symbol characteristics
    const lineCount = symbol.endLine - symbol.startLine;
    
    if (lineCount > 100) {
      suggestions.push('Consider breaking this into smaller functions');
    }
    
    if (symbol.confidenceScore && symbol.confidenceScore < 0.7) {
      suggestions.push('Low confidence parsing - check for syntax issues');
    }
    
    if (symbol.similarSymbols.length > 3) {
      suggestions.push(`Found ${symbol.similarSymbols.length} similar symbols - potential duplication`);
    }
    
    // Language-specific suggestions
    switch (symbol.language) {
      case 'Rust':
        if (symbol.signature.includes('unsafe')) {
          suggestions.push('Unsafe code detected - ensure proper safety documentation');
        }
        break;
      case 'TypeScript':
        if (symbol.signature.includes('any')) {
          suggestions.push('Consider using more specific types instead of "any"');
        }
        break;
    }
    
    // Mode-specific suggestions based on dashboard state
    const state = this.dashboard.state;
    if (state) {
      switch (state.mode) {
        case 'graph':
          suggestions.push('Click connected nodes to explore relationships');
          break;
        case 'flow':
          suggestions.push('Watch data flow between this symbol and its dependencies');
          break;
        case 'hybrid':
          suggestions.push('Both graph structure and data flow are visible');
          break;
      }
      
      // Data layer specific insights
      if (state.dataLayer === 'quality' && symbol.confidenceScore && symbol.confidenceScore < 0.9) {
        suggestions.push('This symbol has quality issues - check the quality panel for details');
      }
    }
    
    return suggestions;
  }
  
  clear(): void {
    if (!this.helperElement) return;
    this.helperElement.innerHTML = '';
  }
  
  // Called when dashboard state changes
  onDashboardStateChange(): void {
    // Update suggestions if a symbol is selected
    if (this.dashboard.state.selectedSymbol) {
      this.updateSuggestions(this.dashboard.state.selectedSymbol);
    } else {
      // Show general tips when no symbol is selected
      this.showGeneralTips();
    }
  }
  
  private showGeneralTips(): void {
    if (!this.helperElement) return;
    
    const state = this.dashboard.state;
    const tips: string[] = [];
    
    switch (state.mode) {
      case 'graph':
        tips.push('Click on any node to see symbol details');
        tips.push('Scroll to zoom in/out of the graph');
        tips.push('Drag to pan around the visualization');
        break;
      case 'flow':
        tips.push('Particles show data flow between symbols');
        tips.push('Brighter flows indicate stronger relationships');
        tips.push('Click a flow source to trace dependencies');
        break;
      case 'hybrid':
        tips.push('Combined view shows structure and dynamics');
        tips.push('Use layer buttons to filter by data type');
        break;
    }
    
    const html = `
      <div class="ai-suggestions">
        <h4>Tips</h4>
        <ul class="suggestion-list">
          ${tips.map(t => `<li>${t}</li>`).join('')}
        </ul>
      </div>
    `;
    
    this.helperElement.innerHTML = html;
  }
}