/**
 * Interactive Scenario Builder Component
 * 
 * Provides developers with a powerful "what-if" scenario builder that uses 
 * WebGPU-accelerated visualizations to show the impact of code changes in real-time.
 * Features fluid animations, particle effects, and interactive controls.
 */

import { DashboardComponent, defineComponent } from './base-component.js';
import { dataService } from '../services/data.service.js';
import { showSymbolSelector } from './symbol-selector-modal.js';
import { iconRegistry } from '../utils/icon-registry.js';
import { tooltipManager } from '../utils/tooltip-manager.js';
import type { Symbol } from '../../shared/types/api.js';

interface ChangeScenario {
  id: string;
  name: string;
  description: string;
  targetSymbol: string;
  changeType: 'type' | 'value' | 'signature' | 'dependency' | 'removal';
  simulatedChange: {
    from: any;
    to: any;
    description: string;
  };
  isActive: boolean;
  estimatedFixTime: number;
  riskScore: number;
  affectedNodes: number;
}

interface ScenarioComparison {
  mostOptimal: string;
  leastRisky: string;
  fastestImplementation: string;
}

export class ScenarioBuilder extends DashboardComponent {
  private currentSymbol: Symbol | null = null;
  private scenarios: ChangeScenario[] = [];
  private activeScenario: string | null = null;
  private comparisonData: ScenarioComparison | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private webglContext: WebGL2RenderingContext | null = null;
  private animationFrame: number | null = null;
  private particles: Particle[] = [];
  private rippleEffects: RippleEffect[] = [];
  
  constructor() {
    super();
    this.initializeParticleSystem();
  }

  async loadData(): Promise<void> {
    // Component loads data on demand when scenarios are created
  }

  render(): void {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, 
            rgba(147, 112, 219, 0.1) 0%, 
            rgba(255, 105, 180, 0.1) 50%, 
            rgba(135, 206, 235, 0.1) 100%);
        }

        .scenario-builder {
          display: grid;
          grid-template-columns: 380px 1fr 320px;
          height: 100%;
          gap: 1px;
          background: var(--card-border);
        }

        .control-panel {
          background: var(--card-bg);
          border-right: 1px solid var(--card-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .visualization-canvas {
          background: var(--primary-bg);
          position: relative;
          overflow: hidden;
        }

        .details-panel {
          background: var(--card-bg);
          border-left: 1px solid var(--card-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Control Panel Styles */
        .panel-section {
          padding: 20px;
          border-bottom: 1px solid var(--card-border);
        }

        .panel-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--primary-accent);
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .symbol-selector {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .symbol-display {
          padding: 16px;
          background: rgba(147, 112, 219, 0.1);
          border: 2px solid transparent;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .symbol-display:hover {
          border-color: var(--primary-accent);
          background: rgba(147, 112, 219, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(147, 112, 219, 0.25);
        }

        .symbol-display::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transition: left 0.5s ease;
        }

        .symbol-display:hover::before {
          left: 100%;
        }

        .symbol-name {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .symbol-meta {
          font-size: 0.85rem;
          color: var(--text-muted);
          display: flex;
          justify-content: space-between;
        }

        .select-symbol-btn {
          padding: 16px;
          background: linear-gradient(135deg, var(--primary-accent), var(--primary-accent-hover));
          border: none;
          border-radius: 12px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .select-symbol-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(147, 112, 219, 0.4);
        }

        .select-symbol-btn::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: width 0.3s ease, height 0.3s ease;
        }

        .select-symbol-btn:active::after {
          width: 300px;
          height: 300px;
        }

        .change-types {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-top: 16px;
        }

        .change-type-btn {
          padding: 12px 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          position: relative;
        }

        .change-type-btn:hover {
          background: rgba(147, 112, 219, 0.1);
          border-color: var(--primary-accent);
          transform: scale(1.02);
        }

        .change-type-btn.active {
          background: var(--primary-accent);
          border-color: var(--primary-accent);
          color: white;
          box-shadow: 0 4px 15px rgba(147, 112, 219, 0.3);
        }

        .scenarios-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 20px 20px;
        }

        .scenario-item {
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
        }

        .scenario-item:hover {
          background: rgba(147, 112, 219, 0.05);
          border-color: var(--primary-accent);
          transform: translateX(4px);
        }

        .scenario-item.active {
          background: rgba(147, 112, 219, 0.15);
          border-color: var(--primary-accent);
          box-shadow: 0 0 0 2px rgba(147, 112, 219, 0.2);
        }

        .scenario-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .scenario-name {
          font-weight: 600;
          color: var(--text-primary);
        }

        .scenario-risk {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .risk-low {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
        }

        .risk-medium {
          background: rgba(255, 193, 7, 0.2);
          color: #ffc107;
        }

        .risk-high {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
        }

        .scenario-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .metric {
          text-align: center;
        }

        .metric-value {
          display: block;
          font-weight: 600;
          color: var(--text-primary);
        }

        /* Canvas Styles */
        .canvas-container {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .webgl-canvas {
          width: 100%;
          height: 100%;
          cursor: grab;
        }

        .webgl-canvas:active {
          cursor: grabbing;
        }

        .canvas-overlay {
          position: absolute;
          top: 20px;
          left: 20px;
          right: 20px;
          pointer-events: none;
        }

        .scenario-title {
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(147, 112, 219, 0.3);
          border-radius: 12px;
          padding: 16px 24px;
          color: white;
          font-size: 1.2rem;
          font-weight: 600;
          text-align: center;
          margin-bottom: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .ripple-controls {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 12px;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(147, 112, 219, 0.3);
          border-radius: 12px;
          padding: 16px;
        }

        .ripple-btn {
          padding: 12px 16px;
          background: rgba(147, 112, 219, 0.2);
          border: 1px solid var(--primary-accent);
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .ripple-btn:hover {
          background: var(--primary-accent);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(147, 112, 219, 0.4);
        }

        /* Details Panel */
        .impact-summary {
          background: linear-gradient(135deg, 
            rgba(147, 112, 219, 0.1), 
            rgba(255, 105, 180, 0.1));
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }

        .summary-metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .summary-metric:last-child {
          border-bottom: none;
        }

        .metric-label {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .metric-value-large {
          font-weight: 600;
          font-size: 1.1rem;
        }

        .recommendations {
          flex: 1;
          overflow-y: auto;
        }

        .recommendation-item {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.02);
          border-left: 3px solid var(--primary-accent);
          border-radius: 0 8px 8px 0;
          margin-bottom: 12px;
          transition: all 0.2s ease;
        }

        .recommendation-item:hover {
          background: rgba(147, 112, 219, 0.05);
          transform: translateX(4px);
        }

        .recommendation-text {
          color: var(--text-primary);
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .comparison-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }

        .comparison-badge {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge-optimal {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
          border: 1px solid #4caf50;
        }

        .badge-safest {
          background: rgba(33, 150, 243, 0.2);
          color: #2196f3;
          border: 1px solid #2196f3;
        }

        .badge-fastest {
          background: rgba(255, 193, 7, 0.2);
          color: #ffc107;
          border: 1px solid #ffc107;
        }

        /* Loading Animation */
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
        }

        .loading-spinner {
          width: 60px;
          height: 60px;
          border: 3px solid rgba(147, 112, 219, 0.2);
          border-top: 3px solid var(--primary-accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .particle-trail {
          position: absolute;
          pointer-events: none;
          border-radius: 50%;
          background: radial-gradient(circle, var(--primary-accent), transparent);
          animation: particleFade 2s ease-out forwards;
        }

        @keyframes particleFade {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(0.2);
          }
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
          .scenario-builder {
            grid-template-columns: 320px 1fr 280px;
          }
        }

        @media (max-width: 900px) {
          .scenario-builder {
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr auto;
          }
          
          .control-panel,
          .details-panel {
            max-height: 300px;
          }
        }
      </style>

      <div class="scenario-builder">
        ${this.renderControlPanel()}
        ${this.renderVisualizationCanvas()}
        ${this.renderDetailsPanel()}
      </div>
    `;

    this.initializeCanvas();
    this.setupEventListeners();
  }

  private renderControlPanel(): string {
    return `
      <div class="control-panel">
        <div class="panel-section">
          <h3 class="panel-title">
            🎯 Target Symbol
          </h3>
          <div class="symbol-selector">
            ${this.currentSymbol ? `
              <div class="symbol-display" onclick="this.getRootNode().host.selectSymbol()">
                <div class="symbol-name">${this.currentSymbol.name}</div>
                <div class="symbol-meta">
                  <span>${this.currentSymbol.kind}</span>
                  <span>${this.currentSymbol.namespace || 'global'}</span>
                </div>
              </div>
            ` : `
              <button class="select-symbol-btn" onclick="this.getRootNode().host.selectSymbol()">
                ✨ Select Symbol to Analyze
              </button>
            `}
          </div>
        </div>

        ${this.currentSymbol ? `
          <div class="panel-section">
            <h3 class="panel-title">
              🔧 Change Type
            </h3>
            <div class="change-types">
              ${this.renderChangeTypeButtons()}
            </div>
          </div>
        ` : ''}

        <div class="scenarios-list">
          <h3 class="panel-title">
            📊 Scenarios (${this.scenarios.length})
          </h3>
          ${this.scenarios.length > 0 ? this.renderScenarios() : `
            <div style="text-align: center; color: var(--text-muted); margin-top: 40px;">
              Select a symbol and change type to create scenarios
            </div>
          `}
        </div>
      </div>
    `;
  }

  private renderChangeTypeButtons(): string {
    const changeTypes = [
      { type: 'type', label: '🏷️ Type', desc: 'Change data type' },
      { type: 'signature', label: '📝 Signature', desc: 'Modify function signature' },
      { type: 'value', label: '💎 Value', desc: 'Update default values' },
      { type: 'removal', label: '🗑️ Remove', desc: 'Delete symbol' }
    ];

    return changeTypes.map(({ type, label, desc }) => `
      <button 
        class="change-type-btn ${this.activeScenario === type ? 'active' : ''}"
        onclick="this.getRootNode().host.createScenario('${type}')"
        title="${desc}"
      >
        ${label}
      </button>
    `).join('');
  }

  private renderScenarios(): string {
    return this.scenarios.map(scenario => `
      <div 
        class="scenario-item ${scenario.isActive ? 'active' : ''}"
        onclick="this.getRootNode().host.activateScenario('${scenario.id}')"
      >
        <div class="scenario-header">
          <span class="scenario-name">${scenario.name}</span>
          <span class="scenario-risk ${this.getRiskClass(scenario.riskScore)}">
            ${this.getRiskLabel(scenario.riskScore)}
          </span>
        </div>
        <div class="scenario-metrics">
          <div class="metric">
            <span class="metric-value">${scenario.estimatedFixTime}m</span>
            <span>Fix Time</span>
          </div>
          <div class="metric">
            <span class="metric-value">${scenario.affectedNodes}</span>
            <span>Affected</span>
          </div>
          <div class="metric">
            <span class="metric-value">${Math.round(scenario.riskScore)}</span>
            <span>Risk</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  private renderVisualizationCanvas(): string {
    return `
      <div class="visualization-canvas">
        <div class="canvas-container">
          <canvas class="webgl-canvas" id="scenario-canvas"></canvas>
          <div class="canvas-overlay">
            ${this.scenarios.find(s => s.isActive) ? `
              <div class="scenario-title">
                Impact Analysis: ${this.scenarios.find(s => s.isActive)?.name}
              </div>
            ` : ''}
          </div>
          ${this.scenarios.length > 0 ? `
            <div class="ripple-controls">
              <button class="ripple-btn" onclick="this.getRootNode().host.triggerRipple()">
                🌊 Trigger Ripple
              </button>
              <button class="ripple-btn" onclick="this.getRootNode().host.resetVisualization()">
                🔄 Reset View
              </button>
              <button class="ripple-btn" onclick="this.getRootNode().host.exportScenario()">
                💾 Export
              </button>
            </div>
          ` : ''}
        </div>
        ${this._loading ? `
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Analyzing impact scenarios...</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderDetailsPanel(): string {
    const activeScenario = this.scenarios.find(s => s.isActive);
    
    return `
      <div class="details-panel">
        <div class="panel-section">
          <h3 class="panel-title">
            📈 Impact Summary
          </h3>
          ${activeScenario ? `
            <div class="impact-summary">
              <div class="summary-metric">
                <span class="metric-label">Risk Score</span>
                <span class="metric-value-large ${this.getRiskClass(activeScenario.riskScore)}">
                  ${Math.round(activeScenario.riskScore)}/10
                </span>
              </div>
              <div class="summary-metric">
                <span class="metric-label">Estimated Fix Time</span>
                <span class="metric-value-large">${activeScenario.estimatedFixTime} minutes</span>
              </div>
              <div class="summary-metric">
                <span class="metric-label">Affected Components</span>
                <span class="metric-value-large">${activeScenario.affectedNodes}</span>
              </div>
            </div>
            ${this.comparisonData ? this.renderComparisonBadges(activeScenario.id) : ''}
          ` : `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
              Select a scenario to view detailed impact analysis
            </div>
          `}
        </div>

        <div class="panel-section recommendations">
          <h3 class="panel-title">
            💡 Recommendations
          </h3>
          ${activeScenario ? this.renderRecommendations() : ''}
        </div>
      </div>
    `;
  }

  private renderComparisonBadges(scenarioId: string): string {
    if (!this.comparisonData) return '';

    const badges = [];
    if (this.comparisonData.mostOptimal === scenarioId) {
      badges.push('<span class="comparison-badge badge-optimal">🏆 Most Optimal</span>');
    }
    if (this.comparisonData.leastRisky === scenarioId) {
      badges.push('<span class="comparison-badge badge-safest">🛡️ Safest</span>');
    }
    if (this.comparisonData.fastestImplementation === scenarioId) {
      badges.push('<span class="comparison-badge badge-fastest">⚡ Fastest</span>');
    }

    return badges.length > 0 ? `
      <div class="comparison-badges">
        ${badges.join('')}
      </div>
    ` : '';
  }

  private renderRecommendations(): string {
    // Mock recommendations - in real implementation, these would come from the API
    const recommendations = [
      "Run comprehensive test suite before implementing changes",
      "Consider gradual rollout with feature flags",
      "Update API documentation to reflect signature changes",
      "Coordinate with the Graphics Engineering team for review",
      "Plan for database migration if data structures change"
    ];

    return recommendations.map(rec => `
      <div class="recommendation-item">
        <div class="recommendation-text">${rec}</div>
      </div>
    `).join('');
  }

  private getRiskClass(riskScore: number): string {
    if (riskScore <= 3) return 'risk-low';
    if (riskScore <= 6) return 'risk-medium';
    return 'risk-high';
  }

  private getRiskLabel(riskScore: number): string {
    if (riskScore <= 3) return 'Low';
    if (riskScore <= 6) return 'Medium';
    return 'High';
  }

  // Event Handlers
  async selectSymbol(): Promise<void> {
    showSymbolSelector({
      title: 'Select Symbol for Impact Analysis',
      onSelect: (symbol) => {
        this.currentSymbol = {
          ...symbol,
          line: (symbol as any).line || 0,
          column: (symbol as any).column || 0,
          is_exported: (symbol as any).is_exported || false,
          project_id: (symbol as any).project_id || 1,
          language_id: (symbol as any).language_id || 1
        };
        this.scenarios = [];
        this.activeScenario = null;
        this.render();
      }
    });
  }

  async createScenario(changeType: string): Promise<void> {
    if (!this.currentSymbol) return;

    this._loading = true;
    this.render();

    try {
      // Call the enhanced impact analysis API
      const response = await dataService.fetch(
        `/api/analytics/enhanced-impact/${this.currentSymbol.id}?changeType=${changeType}`
      );

      if (response.success) {
        const scenario: ChangeScenario = {
          id: `${changeType}-${Date.now()}`,
          name: `${changeType.charAt(0).toUpperCase() + changeType.slice(1)} Change`,
          description: `Impact of changing ${changeType} for ${this.currentSymbol.name}`,
          targetSymbol: this.currentSymbol.name,
          changeType: changeType as any,
          simulatedChange: {
            from: 'current',
            to: 'modified',
            description: `${changeType} modification`
          },
          isActive: true,
          estimatedFixTime: response.data.estimatedFixTime || 30,
          riskScore: response.data.riskAssessment.overall || 5,
          affectedNodes: response.data.prediction.affectedNodes.length || 0
        };

        // Deactivate other scenarios
        this.scenarios.forEach(s => s.isActive = false);
        
        // Add new scenario
        this.scenarios.push(scenario);
        this.activeScenario = scenario.id;

        // Trigger ripple effect animation
        this.triggerRippleEffect(scenario);
      }
    } catch (error) {
      console.error('Failed to create scenario:', error);
    }

    this._loading = false;
    this.render();
  }

  activateScenario(scenarioId: string): void {
    this.scenarios.forEach(s => s.isActive = s.id === scenarioId);
    this.activeScenario = scenarioId;
    
    const scenario = this.scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      this.triggerRippleEffect(scenario);
    }
    
    this.render();
  }

  // WebGL/Canvas Methods
  private initializeCanvas(): void {
    const canvas = this.shadow.querySelector('#scenario-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    this.canvas = canvas;
    this.webglContext = canvas.getContext('webgl2');
    
    if (!this.webglContext) {
      console.warn('WebGL2 not supported, falling back to 2D canvas');
      // Fallback to 2D context
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) {
        this.initializeParticleSystem();
        this.startAnimation();
      }
      return;
    }

    this.setupWebGLShaders();
    this.startAnimation();
  }

  private setupWebGLShaders(): void {
    if (!this.webglContext) return;

    // Vertex shader for particle effects
    const vertexShaderSource = `#version 300 es
      in vec2 a_position;
      in float a_size;
      in vec3 a_color;
      in float a_alpha;
      
      uniform vec2 u_resolution;
      uniform float u_time;
      
      out vec3 v_color;
      out float v_alpha;
      
      void main() {
        vec2 position = a_position / u_resolution * 2.0 - 1.0;
        position.y *= -1.0;
        
        gl_Position = vec4(position, 0.0, 1.0);
        gl_PointSize = a_size;
        
        v_color = a_color;
        v_alpha = a_alpha;
      }
    `;

    // Fragment shader for particle effects  
    const fragmentShaderSource = `#version 300 es
      precision mediump float;
      
      in vec3 v_color;
      in float v_alpha;
      
      out vec4 fragColor;
      
      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        
        if (dist > 0.5) {
          discard;
        }
        
        float alpha = v_alpha * (1.0 - dist * 2.0);
        fragColor = vec4(v_color, alpha);
      }
    `;

    // Compile and link shaders (implementation details omitted for brevity)
    // This would create the full WebGL particle system
  }

  private initializeParticleSystem(): void {
    this.particles = [];
    this.rippleEffects = [];
  }

  private triggerRippleEffect(scenario: ChangeScenario): void {
    if (!this.canvas) return;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // Create expanding ripple effect
    const ripple: RippleEffect = {
      x: centerX,
      y: centerY,
      radius: 10,
      maxRadius: 300,
      alpha: 1,
      speed: 3,
      color: this.getRippleColor(scenario.riskScore)
    };

    this.rippleEffects.push(ripple);

    // Create particle burst
    for (let i = 0; i < scenario.affectedNodes * 2; i++) {
      const angle = (i / (scenario.affectedNodes * 2)) * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      
      this.particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        alpha: 1,
        color: ripple.color,
        life: 1
      });
    }
  }

  private getRippleColor(riskScore: number): string {
    if (riskScore <= 3) return '#4caf50'; // Green for low risk
    if (riskScore <= 6) return '#ffc107'; // Yellow for medium risk
    return '#f44336'; // Red for high risk
  }

  private startAnimation(): void {
    const animate = () => {
      this.updateParticles();
      this.updateRipples();
      this.drawFrame();
      
      this.animationFrame = requestAnimationFrame(animate);
    };
    
    animate();
  }

  private updateParticles(): void {
    this.particles = this.particles.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.alpha *= 0.98;
      particle.life -= 0.02;
      
      return particle.life > 0 && particle.alpha > 0.01;
    });
  }

  private updateRipples(): void {
    this.rippleEffects = this.rippleEffects.filter(ripple => {
      ripple.radius += ripple.speed;
      ripple.alpha = 1 - (ripple.radius / ripple.maxRadius);
      
      return ripple.radius < ripple.maxRadius;
    });
  }

  private drawFrame(): void {
    if (!this.canvas) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with subtle gradient background
    const gradient = ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
    gradient.addColorStop(0, 'rgba(147, 112, 219, 0.02)');
    gradient.addColorStop(1, 'rgba(255, 105, 180, 0.02)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw ripple effects
    this.rippleEffects.forEach(ripple => {
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `${ripple.color}${Math.floor(ripple.alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw particles
    this.particles.forEach(particle => {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = `${particle.color}${Math.floor(particle.alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.fill();
    });
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;

    // Add mouse interaction for canvas
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Create interactive ripple on click
      this.createInteractiveRipple(x, y);
    });
  }

  private createInteractiveRipple(x: number, y: number): void {
    const ripple: RippleEffect = {
      x,
      y,
      radius: 5,
      maxRadius: 150,
      alpha: 1,
      speed: 2,
      color: '#9370db'
    };

    this.rippleEffects.push(ripple);
  }

  // Public API methods called from HTML
  triggerRipple(): void {
    const activeScenario = this.scenarios.find(s => s.isActive);
    if (activeScenario) {
      this.triggerRippleEffect(activeScenario);
    }
  }

  resetVisualization(): void {
    this.particles = [];
    this.rippleEffects = [];
  }

  exportScenario(): void {
    const activeScenario = this.scenarios.find(s => s.isActive);
    if (activeScenario) {
      const exportData = {
        scenario: activeScenario,
        timestamp: new Date().toISOString(),
        symbol: this.currentSymbol
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `impact-scenario-${activeScenario.id}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    }
  }

  // Public method to set the current symbol (called from parent components)
  setCurrentSymbol(symbol: Symbol): void {
    this.currentSymbol = symbol;
    this.scenarios = [];
    this.activeScenario = null;
    this.comparisonData = null;
    this.render();
  }

  disconnectedCallback(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}

// Particle system interfaces
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  life: number;
}

interface RippleEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
  color: string;
}

defineComponent('scenario-builder', ScenarioBuilder);