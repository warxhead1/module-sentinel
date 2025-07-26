/**
 * Enhanced Node Tooltip System
 * 
 * Provides rich, informative tooltips for graph nodes with detailed symbol information,
 * signatures, complexity metrics, and contextual details.
 */

import { GraphNode } from '../../shared/types/api';

export interface TooltipConfig {
  showSignature: boolean;
  showMetrics: boolean;
  showSemanticTags: boolean;
  showLanguageFeatures: boolean;
  showConfidence: boolean;
  showPatterns: boolean;
  showPerformance: boolean;
}

export class EnhancedNodeTooltip {
  private static instance: EnhancedNodeTooltip;
  private tooltipElement: HTMLElement | null = null;
  private config: TooltipConfig;

  private constructor() {
    this.config = {
      showSignature: true,
      showMetrics: true,
      showSemanticTags: true,
      showLanguageFeatures: true,
      showConfidence: true,
      showPatterns: true,
      showPerformance: true
    };
    this.createTooltipElement();
  }

  static getInstance(): EnhancedNodeTooltip {
    if (!EnhancedNodeTooltip.instance) {
      EnhancedNodeTooltip.instance = new EnhancedNodeTooltip();
    }
    return EnhancedNodeTooltip.instance;
  }

  /**
   * Create the tooltip DOM element
   */
  private createTooltipElement(): void {
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'enhanced-node-tooltip';
    this.tooltipElement.style.cssText = `
      display: none;
      position: absolute;
      background: rgba(0, 0, 0, 0.95);
      border: 1px solid rgba(78, 205, 196, 0.5);
      border-radius: 8px;
      padding: 16px;
      max-width: 400px;
      min-width: 250px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      color: #ffffff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(20px);
      z-index: 10000;
      pointer-events: none;
      word-wrap: break-word;
      line-height: 1.4;
    `;
    document.body.appendChild(this.tooltipElement);
  }

  /**
   * Show tooltip for a node
   */
  public show(node: GraphNode, event: MouseEvent): void {
    if (!this.tooltipElement) return;

    const content = this.generateTooltipContent(node);
    this.tooltipElement.innerHTML = content;
    this.tooltipElement.style.display = 'block';

    this.positionTooltip(event);
  }

  /**
   * Hide tooltip
   */
  public hide(): void {
    if (this.tooltipElement) {
      this.tooltipElement.style.display = 'none';
    }
  }

  /**
   * Update tooltip position
   */
  public updatePosition(event: MouseEvent): void {
    this.positionTooltip(event);
  }

  /**
   * Position tooltip relative to mouse
   */
  private positionTooltip(event: MouseEvent): void {
    if (!this.tooltipElement) return;

    const tooltip = this.tooltipElement;
    const margin = 15;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get tooltip dimensions
    const rect = tooltip.getBoundingClientRect();
    const tooltipWidth = rect.width;
    const tooltipHeight = rect.height;

    let left = event.clientX + margin;
    let top = event.clientY + margin;

    // Adjust if tooltip would go off-screen
    if (left + tooltipWidth > viewportWidth) {
      left = event.clientX - tooltipWidth - margin;
    }
    if (top + tooltipHeight > viewportHeight) {
      top = event.clientY - tooltipHeight - margin;
    }

    // Ensure tooltip stays within viewport
    left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - tooltipHeight - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  /**
   * Generate rich tooltip content
   */
  private generateTooltipContent(node: GraphNode): string {
    const sections: string[] = [];

    // Header section with name and type
    sections.push(this.renderHeader(node));

    // Signature section
    if (this.config.showSignature && node.signature) {
      sections.push(this.renderSignature(node));
    }

    // Location information
    sections.push(this.renderLocation(node));

    // Language features
    if (this.config.showLanguageFeatures && node.languageFeatures) {
      sections.push(this.renderLanguageFeatures(node));
    }

    // Metrics section
    if (this.config.showMetrics && node.metrics) {
      sections.push(this.renderMetrics(node));
    }

    // Semantic tags
    if (this.config.showSemanticTags && node.semanticTags?.length) {
      sections.push(this.renderSemanticTags(node));
    }

    // Patterns section
    if (this.config.showPatterns && node.patterns) {
      sections.push(this.renderPatterns(node));
    }

    // Performance characteristics
    if (this.config.showPerformance && node.performance) {
      sections.push(this.renderPerformance(node));
    }

    // Confidence indicator
    if (this.config.showConfidence && node.confidence !== undefined) {
      sections.push(this.renderConfidence(node));
    }

    return sections.join('<div style="margin: 8px 0; border-top: 1px solid rgba(78, 205, 196, 0.2);"></div>');
  }

  /**
   * Render tooltip header
   */
  private renderHeader(node: GraphNode): string {
    const languageBadge = node.language ? 
      `<span style="background: ${this.getLanguageColor(node.language)}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">${node.language.toUpperCase()}</span>` : '';
    
    const typeColor = this.getTypeColor(node.type);
    
    return `
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <div>
          <div style="font-size: 14px; font-weight: bold; color: #4ecdc4;">
            ${this.escapeHtml(node.name)}${languageBadge}
          </div>
          <div style="font-size: 11px; color: ${typeColor}; margin-top: 2px;">
            ${node.type}${node.namespace ? ` • ${node.namespace}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render function/method signature
   */
  private renderSignature(node: GraphNode): string {
    if (!node.signature) return '';

    return `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">SIGNATURE</div>
        <div style="background: rgba(78, 205, 196, 0.1); padding: 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 11px; color: #e0e0e0; word-break: break-all;">
          ${this.highlightSignature(node.signature)}
        </div>
        ${node.returnType ? `<div style="font-size: 10px; color: #ffd93d; margin-top: 4px;">Returns: ${node.returnType}</div>` : ''}
      </div>
    `;
  }

  /**
   * Render location information
   */
  private renderLocation(node: GraphNode): string {
    const parts: string[] = [];
    
    if (node.filePath) {
      const fileName = node.filePath.split('/').pop() || node.filePath;
      parts.push(`📁 ${fileName}`);
    }
    
    if (node.line !== undefined) {
      parts.push(`📍 Line ${node.line}${node.column !== undefined ? `:${node.column}` : ''}`);
    }
    
    if (node.qualifiedName && node.qualifiedName !== node.name) {
      parts.push(`🔗 ${node.qualifiedName}`);
    }

    return parts.length > 0 ? `
      <div style="font-size: 10px; color: #aaa;">
        ${parts.join(' • ')}
      </div>
    ` : '';
  }

  /**
   * Render language-specific features
   */
  private renderLanguageFeatures(node: GraphNode): string {
    if (!node.languageFeatures) return '';

    const features: string[] = [];
    const lf = node.languageFeatures;

    if (lf.isAsync) features.push('⚡ Async');
    if (lf.isExported) features.push('📤 Exported');
    if (lf.isAbstract) features.push('🔮 Abstract');
    if (lf.isStatic) features.push('📌 Static');
    if (lf.isTemplate) features.push('📐 Template');
    if (lf.isVirtual) features.push('🔄 Virtual');
    if (lf.isInline) features.push('⚡ Inline');
    if (lf.hasCoroutineKeywords) features.push('🧵 Coroutine');
    if (lf.executionMode) features.push(`🖥️ ${lf.executionMode.toUpperCase()}`);

    return features.length > 0 ? `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">FEATURES</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${features.map(f => `<span style="background: rgba(147, 112, 219, 0.3); padding: 1px 4px; border-radius: 2px; font-size: 9px;">${f}</span>`).join('')}
        </div>
      </div>
    ` : '';
  }

  /**
   * Render metrics
   */
  private renderMetrics(node: GraphNode): string {
    if (!node.metrics) return '';

    const metrics: Array<{label: string, value: number | string, color: string}> = [];
    const m = node.metrics;

    if (m.cyclomaticComplexity !== undefined && m.cyclomaticComplexity > 0) {
      const complexityColor = m.cyclomaticComplexity > 10 ? '#ff6b6b' : 
                             m.cyclomaticComplexity > 5 ? '#ffd93d' : '#51cf66';
      metrics.push({label: 'Complexity', value: m.cyclomaticComplexity, color: complexityColor});
    }

    if (m.loc !== undefined && m.loc > 0) {
      metrics.push({label: 'LOC', value: m.loc, color: '#74b9ff'});
    }

    if (m.callCount !== undefined && m.callCount > 0) {
      metrics.push({label: 'Calls', value: m.callCount, color: '#4ecdc4'});
    }

    if (m.crossLanguageCalls !== undefined && m.crossLanguageCalls > 0) {
      metrics.push({label: 'Cross-Lang', value: m.crossLanguageCalls, color: '#feca57'});
    }

    if (m.parameterCount !== undefined && m.parameterCount > 0) {
      metrics.push({label: 'Params', value: m.parameterCount, color: '#fd79a8'});
    }

    if (m.nestingDepth !== undefined && m.nestingDepth > 0) {
      const depthColor = m.nestingDepth > 4 ? '#ff6b6b' : '#6c5ce7';
      metrics.push({label: 'Nesting', value: m.nestingDepth, color: depthColor});
    }

    return metrics.length > 0 ? `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">METRICS</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px;">
          ${metrics.map(m => `
            <div style="text-align: center; background: rgba(255, 255, 255, 0.05); padding: 4px; border-radius: 3px;">
              <div style="color: ${m.color}; font-weight: bold; font-size: 11px;">${m.value}</div>
              <div style="color: #888; font-size: 9px;">${m.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';
  }

  /**
   * Render semantic tags
   */
  private renderSemanticTags(node: GraphNode): string {
    if (!node.semanticTags?.length) return '';

    return `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">SEMANTIC TAGS</div>
        <div style="display: flex; flex-wrap: wrap; gap: 3px;">
          ${node.semanticTags.map(tag => 
            `<span style="background: rgba(78, 205, 196, 0.2); color: #4ecdc4; padding: 1px 4px; border-radius: 2px; font-size: 9px;">#${tag}</span>`
          ).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render detected patterns
   */
  private renderPatterns(node: GraphNode): string {
    if (!node.patterns) return '';

    const sections: string[] = [];
    const p = node.patterns;

    if (p.detectedPatterns?.length) {
      sections.push(`
        <div>🎯 <strong>Patterns:</strong> ${p.detectedPatterns.join(', ')}</div>
      `);
    }

    if (p.antiPatterns?.length) {
      sections.push(`
        <div style="color: #ff6b6b;">⚠️ <strong>Anti-patterns:</strong> ${p.antiPatterns.join(', ')}</div>
      `);
    }

    if (p.architecturalRole) {
      sections.push(`
        <div>🏗️ <strong>Role:</strong> ${p.architecturalRole}</div>
      `);
    }

    if (p.codeSmells?.length) {
      sections.push(`
        <div style="color: #ffd93d;">👃 <strong>Code Smells:</strong> ${p.codeSmells.join(', ')}</div>
      `);
    }

    return sections.length > 0 ? `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">PATTERNS</div>
        <div style="font-size: 10px; line-height: 1.3;">
          ${sections.join('')}
        </div>
      </div>
    ` : '';
  }

  /**
   * Render performance characteristics
   */
  private renderPerformance(node: GraphNode): string {
    if (!node.performance) return '';

    const perf = node.performance;
    const indicators: string[] = [];

    if (perf.estimatedComplexity && perf.estimatedComplexity !== 'unknown') {
      const complexityColor = perf.estimatedComplexity === 'O(1)' ? '#51cf66' :
                             perf.estimatedComplexity === 'O(log n)' ? '#4ecdc4' :
                             perf.estimatedComplexity === 'O(n)' ? '#ffd93d' : '#ff6b6b';
      indicators.push(`<span style="color: ${complexityColor};">⏱️ ${perf.estimatedComplexity}</span>`);
    }

    if (perf.memoryUsage && perf.memoryUsage !== 'unknown') {
      const memColor = perf.memoryUsage === 'low' ? '#51cf66' :
                      perf.memoryUsage === 'medium' ? '#ffd93d' : '#ff6b6b';
      indicators.push(`<span style="color: ${memColor};">💾 ${perf.memoryUsage}</span>`);
    }

    if (perf.isHotPath) indicators.push('<span style="color: #ff6b6b;">🔥 Hot Path</span>');
    if (perf.hasAsyncOperations) indicators.push('<span style="color: #6c5ce7;">⚡ Async Ops</span>');
    if (perf.hasFileIO) indicators.push('<span style="color: #74b9ff;">📄 File I/O</span>');
    if (perf.hasNetworkCalls) indicators.push('<span style="color: #fd79a8;">🌐 Network</span>');

    return indicators.length > 0 ? `
      <div>
        <div style="font-size: 10px; color: #888; margin-bottom: 4px;">PERFORMANCE</div>
        <div style="font-size: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
          ${indicators.join('')}
        </div>
      </div>
    ` : '';
  }

  /**
   * Render confidence indicator
   */
  private renderConfidence(node: GraphNode): string {
    if (node.confidence === undefined) return '';

    const confidence = Math.round(node.confidence * 100);
    const confidenceColor = confidence >= 80 ? '#51cf66' :
                           confidence >= 60 ? '#ffd93d' : '#ff6b6b';
    
    return `
      <div style="font-size: 10px; color: #888; text-align: center; margin-top: 4px;">
        <span style="color: ${confidenceColor};">🎯 ${confidence}% confidence</span>
      </div>
    `;
  }

  /**
   * Highlight syntax in signatures
   */
  private highlightSignature(signature: string): string {
    return signature
      .replace(/\b(const|static|virtual|inline|async|export)\b/g, '<span style="color: #6c5ce7;">$1</span>')
      .replace(/\b(int|float|double|bool|string|void|auto)\b/g, '<span style="color: #ffd93d;">$1</span>')
      .replace(/[(){}[\]]/g, '<span style="color: #4ecdc4;">$&</span>')
      .replace(/[,;]/g, '<span style="color: #888;">$&</span>');
  }

  /**
   * Get language-specific color
   */
  private getLanguageColor(language: string): string {
    const colors: Record<string, string> = {
      cpp: '#0055cc',
      python: '#3776ab',
      typescript: '#007acc',
      javascript: '#f7df1e',
      rust: '#ce422b',
      go: '#00add8',
      java: '#ed8b00'
    };
    return colors[language] || '#666';
  }

  /**
   * Get type-specific color
   */
  private getTypeColor(type: string): string {
    const colors: Record<string, string> = {
      class: '#4ecdc4',
      struct: '#4ecdc4',
      function: '#ff6b6b',
      method: '#ff6b6b',
      namespace: '#51cf66',
      variable: '#ffd93d',
      enum: '#6c5ce7'
    };
    return colors[type] || '#888';
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<TooltipConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): TooltipConfig {
    return { ...this.config };
  }

  /**
   * Destroy tooltip
   */
  public destroy(): void {
    if (this.tooltipElement) {
      document.body.removeChild(this.tooltipElement);
      this.tooltipElement = null;
    }
  }
}

// Export singleton instance
export const enhancedNodeTooltip = EnhancedNodeTooltip.getInstance();