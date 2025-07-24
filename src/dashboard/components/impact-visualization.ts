import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { stateService } from '../services/state.service.js';
import { showSymbolSelector } from './symbol-selector-modal.js';
import { MultiLanguageDetector } from '../utils/multi-language-detector.js';
import { iconRegistry } from '../utils/icon-registry.js';
import { tooltipManager, TooltipManager } from '../utils/tooltip-manager.js';
import { MicroChartRenderer } from '../utils/micro-chart-renderer.js';
import type { ImpactMetrics, ImpactTimeline, ImpactRecommendation, CodeHealthIndicator } from '../types/dashboard.types.js';
import * as d3 from 'd3';

interface ImpactNode {
  symbolId: number;
  symbolName: string;
  impactType: 'breaking' | 'modification' | 'enhancement';
  distance: number;
  confidence: number;
  language?: string;
  filePath?: string;
  isCrossLanguage?: boolean;
}

interface RippleWave {
  distance: number;
  nodes: ImpactNode[];
  timestamp: number;
}

interface ImpactAnalysis {
  directImpact: ImpactNode[];
  indirectImpact: ImpactNode[];
  rippleEffect: RippleWave[];
  severityScore: number;
  crossLanguageImpact?: {
    totalNodes: number;
    languages: string[];
    severityMultiplier: number;
  };
}

/**
 * Impact Visualization Component
 * Shows the seismic/ripple effect of code changes
 */
export class ImpactVisualization extends DashboardComponent {
  private svg: any;
  private g: any;
  private simulation: any;
  private currentSymbolId: string | null = null;
  private impactData: ImpactAnalysis | null = null;
  private animationTimer: any = null;
  private languageDetector: MultiLanguageDetector = new MultiLanguageDetector();
  private sourceLanguage: string = 'unknown';
  private impactMetrics: ImpactMetrics | null = null;
  private timeline: ImpactTimeline | null = null;
  private recommendations: ImpactRecommendation[] = [];
  private codeHealthMap: Map<number, CodeHealthIndicator> = new Map();
  private showTimeline: boolean = false;

  async loadData(): Promise<void> {
    // Get selected symbol from state
    const selectedSymbolId = stateService.getState('selectedNodeId');
    
    if (!selectedSymbolId) {
      // Instead of showing error, show symbol selector
      this._error = null;
      this.render();
      return;
    }

    if (selectedSymbolId === this.currentSymbolId && this.impactData) {
      // Already loaded
      return;
    }

    try {
      this._loading = true;
      this.render();

      const response = await dataService.fetch(`/analytics/impact/${selectedSymbolId}`);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to load impact analysis');
      }

      this.impactData = response.data;
      this.currentSymbolId = selectedSymbolId as string;
      
      // Enhance impact data with language information
      this.enhanceImpactDataWithLanguages();
      
      // Load additional metrics and recommendations
      await this.loadEnhancedMetrics();
      
      this._loading = false;
      this.render();
      
      // Initialize visualization after render
      setTimeout(() => {
        this.initializeVisualization();
        this.setupEnhancedInteractions();
      }, 100);
    } catch (error) {
      // Don't show error for aborted requests (user switched tabs quickly)
      if (error instanceof Error && error.name === 'AbortError') {
        this._loading = false;
        return;
      }
      
      this._error = error instanceof Error ? error.message : 'Failed to load impact data';
      this._loading = false;
      this.render();
    }
  }

  render() {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          background: var(--card-bg);
          border-radius: var(--border-radius);
          padding: 20px;
          box-sizing: border-box;
        }

        .container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .header {
          margin-bottom: 20px;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .change-symbol-btn {
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          color: var(--primary-accent);
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .change-symbol-btn:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateY(-1px);
        }

        h3 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--primary-accent);
          margin: 0 0 10px 0;
        }

        .severity-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
          margin-left: 10px;
        }

        .severity-low {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
          border: 1px solid #4caf50;
        }

        .severity-medium {
          background: rgba(255, 152, 0, 0.2);
          color: #ff9800;
          border: 1px solid #ff9800;
        }

        .severity-high {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
          border: 1px solid #f44336;
        }

        .visualization-container {
          flex: 1;
          position: relative;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          overflow: hidden;
        }

        #impactSvg {
          width: 100%;
          height: 100%;
        }

        .controls {
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          gap: 10px;
        }

        .control-btn {
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          color: var(--primary-accent);
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: var(--transition-smooth);
        }

        .control-btn:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateY(-1px);
        }

        .control-btn.active {
          background: var(--primary-accent);
          color: var(--primary-bg);
        }

        .legend {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 15px;
          backdrop-filter: blur(10px);
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .legend-item:last-child {
          margin-bottom: 0;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        /* Empty state */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 40px;
        }

        .empty-icon {
          font-size: 4rem;
          margin-bottom: 20px;
          opacity: 0.5;
        }

        .empty-state h3 {
          font-size: 1.5rem;
          color: var(--primary-accent);
          margin: 0 0 10px 0;
        }

        .empty-state p {
          color: var(--text-muted);
          max-width: 400px;
          margin: 0 0 30px 0;
        }

        .select-symbol-btn {
          background: var(--primary-accent);
          color: var(--primary-bg);
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .select-symbol-btn:hover {
          background: var(--primary-accent-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(147, 112, 219, 0.3);
        }

        /* Node styles */
        .impact-node {
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .impact-node:hover {
          filter: brightness(1.3);
        }

        .node-label {
          pointer-events: none;
          font-size: 10px;
          fill: var(--text-secondary);
          text-anchor: middle;
        }

        /* Ripple animation */
        @keyframes ripple {
          0% {
            r: 0;
            opacity: 1;
          }
          100% {
            r: 500;
            opacity: 0;
          }
        }

        .ripple-wave {
          fill: none;
          stroke: var(--primary-accent);
          stroke-width: 2;
          opacity: 0;
          pointer-events: none;
        }

        .stats {
          margin-top: 15px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 300;
          color: var(--primary-accent);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 2px;
        }

        /* Language badge styles */
        .language-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 600;
          margin-left: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          vertical-align: middle;
        }

        .lang-cpp { background: #0055cc; color: white; }
        .lang-python { background: #3776ab; color: white; }
        .lang-typescript { background: #007acc; color: white; }
        .lang-javascript { background: #f7df1e; color: black; }
        .lang-rust { background: #ce422b; color: white; }
        .lang-go { background: #00add8; color: white; }
        .lang-java { background: #ed8b00; color: white; }
        .lang-unknown { background: #666; color: white; }

        /* Cross-language indicators */
        .cross-language-warning {
          background: rgba(254, 202, 87, 0.2);
          border: 1px solid #feca57;
          color: #feca57;
          padding: 8px 12px;
          border-radius: 6px;
          margin: 10px 0;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cross-language-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 10px;
        }

        .cross-language-node {
          stroke: #feca57 !important;
          stroke-width: 3px !important;
        }

        .language-impact-legend {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .legend-item.cross-language {
          background: rgba(254, 202, 87, 0.1);
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid rgba(254, 202, 87, 0.3);
        }
      </style>

      <div class="container">
        <div class="header">
          <div class="header-top">
            <h3>
              Impact Analysis
              ${this.sourceLanguage !== 'unknown' ? this.renderLanguageBadge(this.sourceLanguage) : ''}
              ${this.impactData ? this.renderSeverityBadge(this.impactData.severityScore) : ''}
            </h3>
            ${this.currentSymbolId ? `
              <button class="change-symbol-btn" onclick="this.getRootNode().host.openSymbolSelector()">
                Change Symbol
              </button>
            ` : ''}
          </div>
          ${this.impactData ? this.renderStats() : ''}
          ${this.impactData?.crossLanguageImpact ? this.renderCrossLanguageWarning() : ''}
        </div>

        ${this.impactMetrics ? this.renderImpactMetrics() : ''}
        ${this.recommendations.length > 0 ? this.renderRecommendations() : ''}

        <div class="visualization-container">
          ${this._loading ? this.renderLoading() : ''}
          ${this._error ? this.renderError() : ''}
          ${!this._loading && !this._error && !this.impactData ? this.renderEmptyState() : ''}
          ${!this._loading && !this._error && this.impactData ? `
            <svg id="impactSvg"></svg>
            
            <div class="controls">
              <button class="control-btn active" onclick="this.getRootNode().host.toggleAnimation()">
                Animate
              </button>
              <button class="control-btn" onclick="this.getRootNode().host.resetView()">
                Reset View
              </button>
            </div>

            <div class="legend">
              <div class="legend-item">
                <div class="legend-color" style="background: #ff4444;"></div>
                <span>Breaking Change</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #ffaa44;"></div>
                <span>Modification</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #44ff44;"></div>
                <span>Enhancement</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #4444ff;"></div>
                <span>Source Symbol</span>
              </div>
              ${this.impactData?.crossLanguageImpact ? `
                <div class="language-impact-legend">
                  <div class="legend-item cross-language">
                    <div class="legend-color" style="background: #feca57; border: 2px solid #feca57;"></div>
                    <span>Cross-Language Impact</span>
                  </div>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <h3>Select a Symbol to Analyze Impact</h3>
        <p>Choose a function, class, or variable to see how changes would ripple through your codebase</p>
        <button class="select-symbol-btn" onclick="this.getRootNode().host.openSymbolSelector()">
          Select Symbol
        </button>
      </div>
    `;
  }

  openSymbolSelector() {
    showSymbolSelector({
      title: 'Select Symbol for Impact Analysis',
      filter: (symbol) => {
        // Filter to only show functions and classes for impact analysis
        return ['function', 'class', 'method', 'variable'].includes(symbol.kind);
      },
      onSelect: async (symbol) => {
        // Set the selected symbol in state
        stateService.setState('selectedNodeId', symbol.id.toString());
        
        // Reload data
        await this.loadData();
      }
    });
  }

  private renderSeverityBadge(score: number): string {
    const level = score > 70 ? 'high' : score > 30 ? 'medium' : 'low';
    const label = level.charAt(0).toUpperCase() + level.slice(1);
    
    return `<span class="severity-badge severity-${level}">Severity: ${label} (${score})</span>`;
  }

  private renderLanguageBadge(language: string): string {
    if (!language || language === 'unknown') return '';
    const displayName = language === 'cpp' ? 'C++' : language.charAt(0).toUpperCase() + language.slice(1);
    return `<span class="language-badge lang-${language}">${displayName}</span>`;
  }

  private renderCrossLanguageWarning(): string {
    if (!this.impactData?.crossLanguageImpact) return '';

    const { totalNodes, languages, severityMultiplier } = this.impactData.crossLanguageImpact;
    
    return `
      <div class="cross-language-warning">
        <span>⚠️</span>
        <div>
          <strong>Cross-Language Impact Detected</strong>
          <div class="cross-language-stats">
            <div class="stat-item">
              <div class="stat-value">${totalNodes}</div>
              <div class="stat-label">Cross-Language Nodes</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${languages.length}</div>
              <div class="stat-label">Languages Affected</div>
            </div>
          </div>
          <div style="margin-top: 8px; font-size: 0.8rem;">
            Languages: ${languages.map(lang => this.renderLanguageBadge(lang)).join(' ')}
            <br>Severity multiplier: ${severityMultiplier.toFixed(1)}x
          </div>
        </div>
      </div>
    `;
  }

  private renderStats(): string {
    if (!this.impactData) return '';

    const totalImpacted = this.impactData.directImpact.length + this.impactData.indirectImpact.length;
    const maxDistance = Math.max(...this.impactData.rippleEffect.map(w => w.distance), 0);
    const crossLanguageNodes = this.impactData.crossLanguageImpact?.totalNodes || 0;

    return `
      <div class="stats">
        <div class="stat-item">
          <div class="stat-value">${this.impactData.directImpact.length}</div>
          <div class="stat-label">Direct Impact</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${totalImpacted}</div>
          <div class="stat-label">Total Affected</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${maxDistance}</div>
          <div class="stat-label">Max Distance</div>
        </div>
        ${crossLanguageNodes > 0 ? `
          <div class="stat-item">
            <div class="stat-value" style="color: #feca57;">${crossLanguageNodes}</div>
            <div class="stat-label">Cross-Language</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderImpactMetrics(): string {
    if (!this.impactMetrics) return '';

    const metrics = this.impactMetrics;
    const coverageClass = metrics.testCoverage.percentage < 50 ? 'metric-bad' : 
                         metrics.testCoverage.percentage < 80 ? 'metric-warning' : 'metric-good';
    
    return `
      <div class="impact-metrics-grid">
        <div class="metric-card enhanced" data-metric="coverage">
          <div class="metric-header">
            <span class="metric-icon">${iconRegistry.render('hotspots', { size: 24 }).outerHTML}</span>
            <h4>Test Coverage Impact</h4>
          </div>
          <div class="metric-content">
            <div class="metric-main-value ${coverageClass}">
              ${metrics.testCoverage.percentage}%
            </div>
            <div class="metric-subtitle">${metrics.testCoverage.covered} of ${metrics.testCoverage.affected} symbols covered</div>
            <div class="metric-chart">
              ${MicroChartRenderer.renderPieChart([
                { value: metrics.testCoverage.covered, label: 'Covered' },
                { value: metrics.testCoverage.affected - metrics.testCoverage.covered, label: 'Uncovered' }
              ], { size: 60, donut: true }).outerHTML}
            </div>
          </div>
        </div>

        <div class="metric-card enhanced" data-metric="performance">
          <div class="metric-header">
            <span class="metric-icon">⚡</span>
            <h4>Performance Impact</h4>
          </div>
          <div class="metric-content">
            <div class="metric-stats-grid">
              <div class="metric-stat">
                <span class="stat-label">Latency</span>
                <span class="stat-value metric-warning">+${metrics.performanceImpact.estimatedLatency}ms</span>
              </div>
              <div class="metric-stat">
                <span class="stat-label">Memory</span>
                <span class="stat-value metric-warning">+${metrics.performanceImpact.memoryDelta}%</span>
              </div>
              <div class="metric-stat">
                <span class="stat-label">CPU</span>
                <span class="stat-value">+${metrics.performanceImpact.cpuDelta}%</span>
              </div>
            </div>
          </div>
        </div>

        <div class="metric-card enhanced" data-metric="build">
          <div class="metric-header">
            <span class="metric-icon">🔨</span>
            <h4>Build Impact</h4>
          </div>
          <div class="metric-content">
            <div class="metric-main-value">${metrics.buildImpact.estimatedBuildTime}s</div>
            <div class="metric-subtitle">Estimated build time</div>
            <div class="metric-details">
              <span class="detail-item">${metrics.buildImpact.affectedFiles} files</span>
              <span class="detail-item">${metrics.buildImpact.incrementalBuildTime}s incremental</span>
            </div>
          </div>
        </div>

        <div class="metric-card enhanced" data-metric="team">
          <div class="metric-header">
            <span class="metric-icon">👥</span>
            <h4>Team Impact</h4>
          </div>
          <div class="metric-content">
            <div class="metric-main-value">${metrics.teamImpact.affectedTeams.length}</div>
            <div class="metric-subtitle">Teams affected</div>
            <div class="team-list">
              ${metrics.teamImpact.affectedTeams.map(team => 
                `<span class="team-badge">${team}</span>`
              ).join('')}
            </div>
          </div>
        </div>

        <div class="metric-card enhanced risk-score" data-metric="risk">
          <div class="metric-header">
            <span class="metric-icon">⚠️</span>
            <h4>Risk Score</h4>
          </div>
          <div class="metric-content">
            <div class="risk-gauge">
              <div class="risk-value ${metrics.riskScore.overall > 70 ? 'high-risk' : 
                                      metrics.riskScore.overall > 40 ? 'medium-risk' : 'low-risk'}">
                ${metrics.riskScore.overall}
              </div>
              <div class="risk-factors">
                <div class="factor">Complexity: ${metrics.riskScore.complexity}</div>
                <div class="factor">Testability: ${metrics.riskScore.testability}</div>
                <div class="factor">Stability: ${metrics.riskScore.stability}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .impact-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin: 20px 0;
        }
        
        .metric-card.enhanced {
          background: rgba(35, 35, 65, 0.9);
          border: 1px solid rgba(147, 112, 219, 0.3);
          border-radius: 12px;
          padding: 20px;
          backdrop-filter: blur(20px);
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .metric-card.enhanced:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 32px rgba(147, 112, 219, 0.3);
          border-color: rgba(147, 112, 219, 0.5);
        }
        
        .metric-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .metric-header h4 {
          margin: 0;
          font-size: 1rem;
          color: var(--text-primary);
        }
        
        .metric-icon {
          font-size: 24px;
        }
        
        .metric-main-value {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 8px;
        }
        
        .metric-good { color: #4ade80; }
        .metric-warning { color: #f59e0b; }
        .metric-bad { color: #ef4444; }
        
        .metric-subtitle {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin-bottom: 12px;
        }
        
        .metric-stats-grid {
          display: grid;
          gap: 12px;
        }
        
        .metric-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .stat-label {
          color: var(--text-muted);
          font-size: 0.875rem;
        }
        
        .stat-value {
          font-weight: 600;
          font-size: 1.125rem;
        }
        
        .team-badge {
          display: inline-block;
          padding: 4px 12px;
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid rgba(147, 112, 219, 0.5);
          border-radius: 20px;
          font-size: 0.875rem;
          margin: 4px;
        }
        
        .risk-gauge {
          text-align: center;
        }
        
        .risk-value {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 16px;
        }
        
        .high-risk { color: #ef4444; }
        .medium-risk { color: #f59e0b; }
        .low-risk { color: #4ade80; }
        
        .risk-factors {
          display: grid;
          gap: 8px;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        
        .metric-chart {
          display: flex;
          justify-content: center;
          margin-top: 12px;
        }
        
        .metric-details {
          display: flex;
          gap: 16px;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
      </style>
    `;
  }

  private renderRecommendations(): string {
    return `
      <div class="recommendations-section">
        <h3>🎯 Recommendations</h3>
        <div class="recommendations-grid">
          ${this.recommendations.map(rec => `
            <div class="recommendation-card ${rec.priority}">
              <div class="rec-header">
                <span class="rec-type">${this.getRecommendationIcon(rec.type)}</span>
                <span class="rec-priority ${rec.priority}">${rec.priority}</span>
              </div>
              <h4>${rec.title}</h4>
              <p class="rec-reasoning">${rec.reasoning}</p>
              <div class="rec-metrics">
                <span class="metric-item">
                  <span class="metric-label">Effort:</span>
                  <span class="metric-value">${rec.estimatedEffort}h</span>
                </span>
                <span class="metric-item">
                  <span class="metric-label">Risk ↓</span>
                  <span class="metric-value">${rec.riskReduction}%</span>
                </span>
              </div>
              <button class="recommendation-action" data-recommendation-id="${rec.id}">
                View Details →
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <style>
        .recommendations-section {
          margin: 24px 0;
        }
        
        .recommendations-section h3 {
          font-size: 1.25rem;
          margin-bottom: 16px;
          color: var(--primary-accent);
        }
        
        .recommendations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        
        .recommendation-card {
          background: rgba(35, 35, 65, 0.7);
          border: 1px solid rgba(147, 112, 219, 0.3);
          border-radius: 8px;
          padding: 16px;
          transition: all 0.2s ease;
        }
        
        .recommendation-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(147, 112, 219, 0.2);
        }
        
        .rec-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .rec-type {
          font-size: 20px;
        }
        
        .rec-priority {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        
        .rec-priority.critical {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid #ef4444;
        }
        
        .rec-priority.high {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
          border: 1px solid #f59e0b;
        }
        
        .rec-priority.medium {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          border: 1px solid #3b82f6;
        }
        
        .recommendation-card h4 {
          margin: 0 0 8px 0;
          font-size: 1rem;
          color: var(--text-primary);
        }
        
        .rec-reasoning {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin: 0 0 12px 0;
          line-height: 1.4;
        }
        
        .rec-metrics {
          display: flex;
          gap: 16px;
          margin-bottom: 12px;
          font-size: 0.875rem;
        }
        
        .metric-label {
          color: var(--text-muted);
          margin-right: 4px;
        }
        
        .metric-value {
          font-weight: 600;
          color: var(--primary-accent);
        }
        
        .recommendation-action {
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid rgba(147, 112, 219, 0.5);
          color: var(--primary-accent);
          padding: 6px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.875rem;
        }
        
        .recommendation-action:hover {
          background: rgba(147, 112, 219, 0.3);
          transform: translateX(2px);
        }
      </style>
    `;
  }

  private getRecommendationIcon(type: string): string {
    const icons: Record<string, string> = {
      test: '🧪',
      refactor: '🔧',
      document: '📝',
      defer: '⏸️',
      split: '✂️',
      abstract: '🔷'
    };
    return icons[type] || '💡';
  }

  // Load enhanced metrics and recommendations
  private async loadEnhancedMetrics(): Promise<void> {
    if (!this.impactData || !this.currentSymbolId) return;

    // Generate mock metrics for demonstration
    // In production, these would come from API endpoints
    this.impactMetrics = this.generateImpactMetrics();
    this.timeline = this.generateTimeline();
    this.recommendations = this.generateRecommendations();
    this.loadCodeHealth();
  }

  private generateImpactMetrics(): ImpactMetrics {
    const totalImpacted = (this.impactData?.directImpact.length || 0) + 
                         (this.impactData?.indirectImpact.length || 0);
    
    return {
      testCoverage: {
        affected: totalImpacted,
        covered: Math.floor(totalImpacted * 0.45),
        percentage: 45,
        uncoveredSymbols: []
      },
      performanceImpact: {
        estimatedLatency: 120,
        memoryDelta: 15,
        cpuDelta: 8,
        ioOperations: 23
      },
      buildImpact: {
        affectedFiles: Math.floor(totalImpacted * 0.7),
        estimatedBuildTime: 45,
        incrementalBuildTime: 12,
        dependencies: ['auth-service', 'payment-processor', 'user-api']
      },
      teamImpact: {
        affectedTeams: ['Platform', 'Backend', 'QA'],
        primaryOwners: ['john.doe@company.com', 'jane.smith@company.com'],
        reviewersNeeded: 3,
        communicationChannels: ['#platform-team', '#backend-dev']
      },
      riskScore: {
        overall: this.impactData?.severityScore || 50,
        complexity: 72,
        testability: 45,
        stability: 68,
        historicalSuccess: 82
      }
    };
  }

  private generateTimeline(): ImpactTimeline {
    const allImpacted = [...(this.impactData?.directImpact || []), ...(this.impactData?.indirectImpact || [])];
    
    return {
      immediateImpact: allImpacted.filter(n => n.distance <= 1).map(n => ({ id: n.symbolId } as any)),
      shortTermImpact: allImpacted.filter(n => n.distance === 2).map(n => ({ id: n.symbolId } as any)),
      mediumTermImpact: allImpacted.filter(n => n.distance === 3).map(n => ({ id: n.symbolId } as any)),
      longTermImpact: allImpacted.filter(n => n.distance > 3).map(n => ({ id: n.symbolId } as any)),
      estimatedPropagationTime: 48, // hours
      criticalPath: allImpacted.slice(0, 5).map(n => ({ id: n.symbolId } as any))
    };
  }

  private generateRecommendations(): ImpactRecommendation[] {
    return [
      {
        id: '1',
        type: 'test',
        priority: 'critical',
        title: 'Add Unit Tests to PaymentService',
        reasoning: 'PaymentService has 0% test coverage but is critical to the change path',
        estimatedEffort: 8,
        riskReduction: 35,
        suggestedApproach: [
          'Create unit tests for payment validation',
          'Add integration tests with mock payment gateway',
          'Test error handling scenarios'
        ],
        affectedSymbols: [],
        prerequisites: []
      },
      {
        id: '2',
        type: 'refactor',
        priority: 'high',
        title: 'Split authenticate() Method',
        reasoning: 'Method has cyclomatic complexity of 23, making it hard to test and maintain',
        estimatedEffort: 4,
        riskReduction: 20,
        suggestedApproach: [
          'Extract token validation to separate method',
          'Move user lookup to repository pattern',
          'Separate authorization from authentication'
        ],
        affectedSymbols: [],
        prerequisites: ['Add integration tests first']
      },
      {
        id: '3',
        type: 'document',
        priority: 'medium',
        title: 'Document API Contract Changes',
        reasoning: '3 external teams consume this API and need migration guidance',
        estimatedEffort: 2,
        riskReduction: 15,
        suggestedApproach: [
          'Update OpenAPI specification',
          'Create migration guide with examples',
          'Schedule sync with consumer teams'
        ],
        affectedSymbols: [],
        prerequisites: []
      }
    ];
  }

  private loadCodeHealth(): void {
    // Generate mock code health indicators
    const allNodes = [...(this.impactData?.directImpact || []), ...(this.impactData?.indirectImpact || [])];
    
    allNodes.forEach(node => {
      const health = this.calculateNodeHealth(node);
      this.codeHealthMap.set(node.symbolId, health);
    });
  }

  private calculateNodeHealth(node: ImpactNode): CodeHealthIndicator {
    const testCoverage = Math.random() * 100;
    const complexity = Math.random() * 30;
    const stability = Math.random() * 100;
    
    let health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    if (testCoverage > 80 && complexity < 10 && stability > 80) {
      health = 'excellent';
    } else if (testCoverage > 60 && complexity < 15 && stability > 60) {
      health = 'good';
    } else if (testCoverage > 40 && complexity < 20 && stability > 40) {
      health = 'fair';
    } else if (testCoverage > 20 || complexity < 25 || stability > 20) {
      health = 'poor';
    } else {
      health = 'critical';
    }
    
    return {
      symbolId: node.symbolId,
      health,
      testCoverage,
      complexity,
      stability,
      lastModified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      modificationFrequency: Math.random() * 10,
      bugDensity: Math.random() * 5,
      technicalDebt: Math.random() * 100
    };
  }

  // Language enhancement methods
  private enhanceImpactDataWithLanguages(): void {
    if (!this.impactData) return;

    // Detect source language (assuming we have source file info)
    this.sourceLanguage = 'cpp'; // Default, should be detected from selected symbol

    // Enhance direct impact nodes
    this.impactData.directImpact.forEach(node => {
      if (node.filePath && !node.language) {
        node.language = this.languageDetector.detectLanguageFromPath(node.filePath);
      }
      if (node.language) {
        node.isCrossLanguage = node.language !== this.sourceLanguage;
      }
    });

    // Enhance indirect impact nodes
    this.impactData.indirectImpact.forEach(node => {
      if (node.filePath && !node.language) {
        node.language = this.languageDetector.detectLanguageFromPath(node.filePath);
      }
      if (node.language) {
        node.isCrossLanguage = node.language !== this.sourceLanguage;
      }
    });

    // Calculate cross-language impact statistics
    this.calculateCrossLanguageImpact();
  }

  private calculateCrossLanguageImpact(): void {
    if (!this.impactData) return;

    const allNodes = [...this.impactData.directImpact, ...this.impactData.indirectImpact];
    const crossLanguageNodes = allNodes.filter(node => node.isCrossLanguage);
    
    if (crossLanguageNodes.length > 0) {
      const languagesSet = new Set(
        crossLanguageNodes
          .map(node => node.language)
          .filter((lang): lang is string => Boolean(lang))
      );
      const languages = Array.from(languagesSet);
      
      // Calculate severity multiplier based on cross-language complexity
      const languageCount = languages.length;
      const crossLanguageRatio = crossLanguageNodes.length / allNodes.length;
      const severityMultiplier = 1 + (languageCount * 0.3) + (crossLanguageRatio * 0.5);

      this.impactData.crossLanguageImpact = {
        totalNodes: crossLanguageNodes.length,
        languages,
        severityMultiplier
      };

      // Apply severity multiplier to overall score
      this.impactData.severityScore = Math.min(100, this.impactData.severityScore * severityMultiplier);
    }
  }

  private async initializeVisualization() {
    if (!this.impactData) return;

    const svg = d3.select(this.shadow.getElementById('impactSvg'));
    const container = this.shadow.querySelector('.visualization-container');
    
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);

    // Clear previous content
    svg.selectAll('*').remove();

    // Create main group
    this.g = svg.append('g');

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    // Prepare nodes for visualization
    const nodes = this.prepareNodes();
    const links = this.prepareLinks(nodes);

    // Create force simulation
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = this.g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#666')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1);

    // Create nodes
    const node = this.g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'impact-node')
      .call(d3.drag()
        .on('start', this.dragStarted.bind(this))
        .on('drag', this.dragged.bind(this))
        .on('end', this.dragEnded.bind(this)));

    // Add circles
    node.append('circle')
      .attr('r', (d: any) => this.getNodeRadius(d))
      .attr('fill', (d: any) => this.getNodeColor(d))
      .attr('stroke', (d: any) => {
        if (d.distance === 0) return '#fff';
        if (d.isCrossLanguage) return '#feca57';
        return 'none';
      })
      .attr('stroke-width', (d: any) => {
        if (d.distance === 0) return 2;
        if (d.isCrossLanguage) return 3;
        return 0;
      })
      .attr('class', (d: any) => d.isCrossLanguage ? 'cross-language-node' : '');

    // Add labels
    node.append('text')
      .attr('class', 'node-label')
      .attr('dy', '.35em')
      .text((d: any) => d.name)
      .style('opacity', (d: any) => d.distance <= 1 ? 1 : 0.7);

    // Update positions on tick
    this.simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Start ripple animation
    this.startRippleAnimation();
  }

  private prepareNodes(): any[] {
    if (!this.impactData) return [];

    const nodes: any[] = [];
    const nodeMap = new Map();

    // Add source node
    nodes.push({
      id: this.currentSymbolId,
      name: 'Source',
      distance: 0,
      impactType: 'source',
      language: this.sourceLanguage,
      isCrossLanguage: false,
      x: 0,
      y: 0
    });

    // Add impacted nodes
    [...this.impactData.directImpact, ...this.impactData.indirectImpact].forEach(node => {
      if (!nodeMap.has(node.symbolId)) {
        nodeMap.set(node.symbolId, true);
        nodes.push({
          id: node.symbolId.toString(),
          name: node.symbolName,
          distance: node.distance,
          impactType: node.impactType,
          confidence: node.confidence,
          language: node.language || 'unknown',
          isCrossLanguage: node.isCrossLanguage || false
        });
      }
    });

    return nodes;
  }

  private prepareLinks(nodes: any[]): any[] {
    const links: any[] = [];
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Create links based on distance
    nodes.forEach(node => {
      if (node.distance > 0) {
        // Find potential parent nodes (one distance closer)
        const potentialParents = nodes.filter(n => n.distance === node.distance - 1);
        
        if (potentialParents.length > 0) {
          // Link to the closest parent (simplified)
          links.push({
            source: potentialParents[0].id,
            target: node.id
          });
        }
      }
    });

    return links;
  }

  private getNodeRadius(node: any): number {
    if (node.distance === 0) return 20;
    if (node.distance === 1) return 15;
    return Math.max(8, 15 - node.distance * 2);
  }

  private getNodeColor(node: any): string {
    if (node.distance === 0) return '#4444ff';
    
    // If it's a cross-language node, modify the color to indicate this
    let baseColor: string;
    switch (node.impactType) {
      case 'breaking': baseColor = '#ff4444'; break;
      case 'modification': baseColor = '#ffaa44'; break;
      case 'enhancement': baseColor = '#44ff44'; break;
      default: baseColor = '#888888';
    }

    // For cross-language nodes, blend with warning color
    if (node.isCrossLanguage) {
      return this.blendColors(baseColor, '#feca57', 0.3);
    }

    return baseColor;
  }

  private blendColors(color1: string, color2: string, ratio: number): string {
    // Simple color blending for cross-language indication
    // This is a simplified implementation - could be enhanced
    return color1; // For now, just return base color, stroke handles cross-language
  }

  private startRippleAnimation() {
    if (!this.impactData) return;

    let waveIndex = 0;

    const animateWave = () => {
      if (waveIndex >= this.impactData!.rippleEffect.length) {
        waveIndex = 0; // Loop
      }

      const wave = this.impactData!.rippleEffect[waveIndex];
      
      // Create ripple circle
      const centerNode = this.simulation.nodes().find((n: any) => n.distance === 0);
      
      if (centerNode) {
        const ripple = this.g.append('circle')
          .attr('class', 'ripple-wave')
          .attr('cx', centerNode.x)
          .attr('cy', centerNode.y)
          .attr('r', 0)
          .style('opacity', 1);

        ripple.transition()
          .duration(2000)
          .attr('r', wave.distance * 100)
          .style('opacity', 0)
          .remove();
      }

      // Highlight nodes at this distance
      this.g.selectAll('.impact-node')
        .filter((d: any) => d.distance === wave.distance)
        .select('circle')
        .transition()
        .duration(300)
        .attr('r', (d: any) => this.getNodeRadius(d) * 1.5)
        .transition()
        .duration(300)
        .attr('r', (d: any) => this.getNodeRadius(d));

      waveIndex++;
    };

    // Start animation
    animateWave();
    this.animationTimer = setInterval(animateWave, 2500);
  }

  toggleAnimation() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
      
      const btn = this.shadow.querySelector('.control-btn');
      if (btn) {
        btn.classList.remove('active');
        btn.textContent = 'Animate';
      }
    } else {
      this.startRippleAnimation();
      
      const btn = this.shadow.querySelector('.control-btn');
      if (btn) {
        btn.classList.add('active');
        btn.textContent = 'Stop';
      }
    }
  }

  resetView() {
    if (!this.svg) return;

    const container = this.shadow.querySelector('.visualization-container');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    d3.select(this.svg)
      .transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity);
  }

  private dragStarted(event: any, d: any) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: any, d: any) {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragEnded(event: any, d: any) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  private setupEnhancedInteractions(): void {
    // Setup metric card interactions
    this.setupMetricCardTooltips();
    
    // Setup timeline toggle
    const timelineToggle = this.shadow.querySelector('#timeline-toggle');
    if (timelineToggle) {
      timelineToggle.addEventListener('click', () => {
        this.showTimeline = !this.showTimeline;
        this.render();
        setTimeout(() => {
          this.initializeVisualization();
          this.setupEnhancedInteractions();
        }, 100);
      });
    }
    
    // Setup recommendation actions
    this.shadow.querySelectorAll('.recommendation-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const recommendationId = (e.currentTarget as HTMLElement).getAttribute('data-recommendation-id');
        const recommendation = this.recommendations.find(r => r.id === recommendationId);
        if (recommendation) {
          console.log('Executing recommendation:', recommendation.title);
          // In production, this would trigger actual actions
        }
      });
    });
  }

  private setupMetricCardTooltips(): void {
    // Test Coverage Card
    const coverageCard = this.shadow.querySelector('[data-metric="coverage"]');
    if (coverageCard && this.impactMetrics) {
      tooltipManager.bind(coverageCard as HTMLElement, {
        content: TooltipManager.createRichContent({
          title: 'Test Coverage Impact',
          description: 'Symbols affected by this change and their test coverage status',
          stats: [
            { label: 'Covered', value: this.impactMetrics.testCoverage.covered, color: '#4ade80' },
            { label: 'Uncovered', value: this.impactMetrics.testCoverage.affected - this.impactMetrics.testCoverage.covered, color: '#f87171' },
            { label: 'Critical Uncovered', value: '8', color: '#dc2626' }
          ],
          actions: [
            { label: 'View Uncovered Symbols', icon: '→' },
            { label: 'Generate Test Plan', icon: '📝' }
          ]
        }),
        placement: 'auto',
        interactive: true,
        maxWidth: 350
      });
    }

    // Performance Card
    const perfCard = this.shadow.querySelector('[data-metric="performance"]');
    if (perfCard && this.impactMetrics) {
      tooltipManager.bind(perfCard as HTMLElement, {
        content: TooltipManager.createRichContent({
          title: 'Performance Impact',
          description: 'Estimated performance changes from this modification',
          stats: [
            { label: 'Latency', value: `+${this.impactMetrics.performanceImpact.estimatedLatency}ms`, color: '#f59e0b' },
            { label: 'Memory', value: `+${this.impactMetrics.performanceImpact.memoryDelta}%`, color: '#8b5cf6' },
            { label: 'CPU', value: `+${this.impactMetrics.performanceImpact.cpuDelta}%`, color: '#3b82f6' },
            { label: 'I/O Ops', value: `${this.impactMetrics.performanceImpact.ioOperations}`, color: '#6366f1' }
          ]
        }),
        placement: 'auto',
        interactive: true,
        maxWidth: 350
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    
    // Clean up animation timer
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
    }
  }
}

defineComponent('impact-visualization', ImpactVisualization);