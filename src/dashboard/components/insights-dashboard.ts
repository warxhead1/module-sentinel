import { DashboardComponent, defineComponent } from './base-component.js';

/**
 * 💡 Insights Dashboard - AI-Powered Code Intelligence
 * 
 * Features:
 * - Smart code quality metrics
 * - Technical debt analysis  
 * - Refactoring suggestions
 * - Architecture recommendations
 * - Performance insights
 * - Security analysis
 */
export class InsightsDashboard extends DashboardComponent {
  private insights: any[] = [];
  private metrics: any = {};
  private recommendations: any[] = [];

  async loadData(): Promise<void> {
    try {
      // Load insights data
      await Promise.allSettled([
        this.loadQualityMetrics(),
        this.loadTechnicalDebtAnalysis(),
        this.loadPerformanceInsights(),
        this.loadSecurityAnalysis(),
        this.loadArchitectureRecommendations()
      ]);
    } catch (error) {
      console.error('Failed to load insights data:', error);
    }
  }

  private async loadQualityMetrics(): Promise<void> {
    // Mock data for now - replace with real API calls
    this.metrics = {
      codeQuality: {
        score: 85,
        trend: 'improving',
        factors: {
          complexity: { score: 78, impact: 'high' },
          maintainability: { score: 92, impact: 'medium' },
          testCoverage: { score: 67, impact: 'high' },
          documentation: { score: 89, impact: 'low' }
        }
      },
      technicalDebt: {
        totalHours: 42,
        trend: 'stable',
        categories: {
          design: 18,
          performance: 12,
          security: 8,
          maintainability: 4
        }
      },
      trends: {
        codeGrowth: [65, 72, 78, 81, 85, 88, 85],
        complexity: [45, 48, 52, 49, 47, 44, 42],
        bugs: [12, 8, 15, 9, 6, 4, 3]
      }
    };
  }

  private async loadTechnicalDebtAnalysis(): Promise<void> {
    this.insights.push({
      type: 'technical-debt',
      severity: 'medium',
      title: 'Complex Function Detected',
      description: 'VulkanRenderer::setupRenderPipeline() has high cyclomatic complexity (23)',
      suggestion: 'Consider breaking this function into smaller, focused methods',
      impact: 'Maintainability',
      effort: '2-4 hours',
      files: ['src/rendering/VulkanRenderer.cpp:245']
    });

    this.insights.push({
      type: 'architecture',
      severity: 'low',
      title: 'Dependency Cycle Detected',
      description: 'Circular dependency between TerrainGenerator and VulkanRenderer',
      suggestion: 'Introduce an interface to break the dependency cycle',
      impact: 'Architecture Quality',
      effort: '4-6 hours',
      files: ['src/terrain/TerrainGenerator.cpp', 'src/rendering/VulkanRenderer.cpp']
    });
  }

  private async loadPerformanceInsights(): Promise<void> {
    this.insights.push({
      type: 'performance',
      severity: 'high',
      title: 'Memory Allocation Hotspot',
      description: 'Frequent allocations in BufferManager::allocateVertexBuffer()',
      suggestion: 'Implement object pooling or pre-allocate buffers',
      impact: 'Runtime Performance',
      effort: '1-2 days',
      files: ['src/memory/BufferManager.cpp:128']
    });
  }

  private async loadSecurityAnalysis(): Promise<void> {
    this.insights.push({
      type: 'security',
      severity: 'medium',
      title: 'Potential Buffer Overflow',
      description: 'Unchecked buffer access in ShaderLoader::loadShaderSource()',
      suggestion: 'Add bounds checking before buffer operations',
      impact: 'Security Risk',
      effort: '1-2 hours',
      files: ['src/shaders/ShaderLoader.cpp:67']
    });
  }

  private async loadArchitectureRecommendations(): Promise<void> {
    this.recommendations = [
      {
        category: 'Modularity',
        title: 'Extract Rendering Subsystem',
        description: 'Consider extracting all rendering-related classes into a separate module',
        benefits: ['Better separation of concerns', 'Easier testing', 'Reduced coupling'],
        effort: 'High',
        priority: 'Medium'
      },
      {
        category: 'Performance',
        title: 'Implement Resource Pooling',
        description: 'Add object pooling for frequently allocated/deallocated objects',
        benefits: ['Reduced memory fragmentation', 'Better performance', 'Predictable memory usage'],
        effort: 'Medium',
        priority: 'High'
      },
      {
        category: 'Maintainability',
        title: 'Standardize Error Handling',
        description: 'Implement consistent error handling patterns across all modules',
        benefits: ['Improved debugging', 'Better error recovery', 'Consistent user experience'],
        effort: 'Medium',
        priority: 'Medium'
      }
    ];
  }

  render(): void {
    this.shadow.innerHTML = `
      <style>${this.styles()}</style>
      <div class="insights-dashboard">
        <div class="dashboard-header">
          <div class="header-content">
            <h1 class="dashboard-title">
              <span class="insight-icon">💡</span>
              Code Insights
              <span class="subtitle">AI-Powered Analysis</span>
            </h1>
            <div class="quality-score">
              <div class="score-circle">
                <div class="score-value">${this.metrics.codeQuality?.score || 0}</div>
                <div class="score-label">Quality Score</div>
              </div>
            </div>
          </div>
        </div>

        <div class="insights-grid">
          <!-- Quality Overview -->
          <div class="insight-section quality-overview">
            <div class="section-header">
              <h3>📊 Quality Metrics</h3>
              <span class="trend-indicator ${this.metrics.codeQuality?.trend}">
                ${this.getTrendIcon(this.metrics.codeQuality?.trend)} ${this.metrics.codeQuality?.trend}
              </span>
            </div>
            <div class="metrics-grid">
              ${this.renderQualityFactors()}
            </div>
          </div>

          <!-- Technical Debt -->
          <div class="insight-section debt-analysis">
            <div class="section-header">
              <h3>🔧 Technical Debt</h3>
              <span class="debt-total">${this.metrics.technicalDebt?.totalHours || 0}h estimated</span>
            </div>
            <div class="debt-breakdown">
              ${this.renderDebtBreakdown()}
            </div>
          </div>

          <!-- Trends Chart -->
          <div class="insight-section trends-chart">
            <div class="section-header">
              <h3>📈 Quality Trends</h3>
            </div>
            <div class="chart-container">
              ${this.renderTrendsChart()}
            </div>
          </div>

          <!-- Active Insights -->
          <div class="insight-section active-insights">
            <div class="section-header">
              <h3>🎯 Action Items</h3>
              <span class="insights-count">${this.insights.length} insights</span>
            </div>
            <div class="insights-list">
              ${this.insights.map(insight => this.renderInsight(insight)).join('')}
            </div>
          </div>

          <!-- Recommendations -->
          <div class="insight-section recommendations">
            <div class="section-header">
              <h3>🚀 Architecture Recommendations</h3>
            </div>
            <div class="recommendations-list">
              ${this.recommendations.map(rec => this.renderRecommendation(rec)).join('')}
            </div>
          </div>

          <!-- Smart Suggestions -->
          <div class="insight-section smart-suggestions">
            <div class="section-header">
              <h3>🤖 AI Suggestions</h3>
            </div>
            <div class="suggestions-container">
              ${this.renderSmartSuggestions()}
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private getTrendIcon(trend: string): string {
    switch (trend) {
      case 'improving': return '📈';
      case 'stable': return '➡️';
      case 'declining': return '📉';
      default: return '❓';
    }
  }

  private renderQualityFactors(): string {
    const factors = this.metrics.codeQuality?.factors || {};
    
    return Object.entries(factors).map(([key, factor]: [string, any]) => `
      <div class="quality-factor">
        <div class="factor-header">
          <span class="factor-name">${this.formatFactorName(key)}</span>
          <span class="factor-score">${factor.score}</span>
        </div>
        <div class="factor-bar">
          <div class="bar-fill" style="width: ${factor.score}%"></div>
        </div>
        <div class="factor-impact impact-${factor.impact}">${factor.impact} impact</div>
      </div>
    `).join('');
  }

  private formatFactorName(name: string): string {
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  private renderDebtBreakdown(): string {
    const categories = this.metrics.technicalDebt?.categories || {};
    const total = Object.values(categories).reduce((sum: number, val: any) => sum + val, 0);
    
    return Object.entries(categories).map(([category, hours]: [string, any]) => {
      const percentage = total > 0 ? ((hours / total) * 100).toFixed(1) : 0;
      return `
        <div class="debt-category">
          <div class="category-info">
            <span class="category-name">${category}</span>
            <span class="category-hours">${hours}h (${percentage}%)</span>
          </div>
          <div class="category-bar">
            <div class="bar-fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  private renderTrendsChart(): string {
    const trends = this.metrics.trends || {};
    
    return `
      <div class="trends-grid">
        <div class="trend-item">
          <div class="trend-label">Code Quality</div>
          <div class="trend-sparkline">
            ${this.renderSparkline(trends.codeGrowth || [], '#06ffa5')}
          </div>
          <div class="trend-current">${trends.codeGrowth?.slice(-1)[0] || 0}</div>
        </div>
        <div class="trend-item">
          <div class="trend-label">Complexity</div>
          <div class="trend-sparkline">
            ${this.renderSparkline(trends.complexity || [], '#feca57')}
          </div>
          <div class="trend-current">${trends.complexity?.slice(-1)[0] || 0}</div>
        </div>
        <div class="trend-item">
          <div class="trend-label">Bug Count</div>
          <div class="trend-sparkline">
            ${this.renderSparkline(trends.bugs || [], '#ff6b6b')}
          </div>
          <div class="trend-current">${trends.bugs?.slice(-1)[0] || 0}</div>
        </div>
      </div>
    `;
  }

  private renderSparkline(data: number[], color: string): string {
    if (!data.length) return '<div class="no-data">No data</div>';
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    return `
      <svg class="sparkline" viewBox="0 0 100 20">
        <polyline
          fill="none"
          stroke="${color}"
          stroke-width="2"
          points="${data.map((val, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 20 - ((val - min) / range) * 20;
            return `${x},${y}`;
          }).join(' ')}"
        />
      </svg>
    `;
  }

  private renderInsight(insight: any): string {
    const severityClass = `severity-${insight.severity}`;
    const typeIcon = this.getInsightIcon(insight.type);
    
    return `
      <div class="insight-card ${severityClass}">
        <div class="insight-header">
          <span class="insight-type">${typeIcon} ${insight.type}</span>
          <span class="insight-severity">${insight.severity}</span>
        </div>
        <h4 class="insight-title">${insight.title}</h4>
        <p class="insight-description">${insight.description}</p>
        <div class="insight-suggestion">
          <strong>Suggestion:</strong> ${insight.suggestion}
        </div>
        <div class="insight-footer">
          <div class="insight-meta">
            <span class="impact">Impact: ${insight.impact}</span>
            <span class="effort">Effort: ${insight.effort}</span>
          </div>
          <div class="insight-files">
            ${insight.files.map((file: string) => `
              <span class="file-tag">${file}</span>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private getInsightIcon(type: string): string {
    const icons = {
      'technical-debt': '🔧',
      'performance': '⚡',
      'security': '🔒',
      'architecture': '🏗️',
      'maintainability': '🛠️'
    };
    return icons[type as keyof typeof icons] || '💡';
  }

  private renderRecommendation(rec: any): string {
    return `
      <div class="recommendation-card">
        <div class="rec-header">
          <span class="rec-category">${rec.category}</span>
          <span class="rec-priority priority-${rec.priority.toLowerCase()}">${rec.priority}</span>
        </div>
        <h4 class="rec-title">${rec.title}</h4>
        <p class="rec-description">${rec.description}</p>
        <div class="rec-benefits">
          <strong>Benefits:</strong>
          <ul>
            ${rec.benefits.map((benefit: string) => `<li>${benefit}</li>`).join('')}
          </ul>
        </div>
        <div class="rec-footer">
          <span class="rec-effort">Effort: ${rec.effort}</span>
        </div>
      </div>
    `;
  }

  private renderSmartSuggestions(): string {
    return `
      <div class="ai-suggestions">
        <div class="suggestion-item">
          <div class="suggestion-icon">🎯</div>
          <div class="suggestion-content">
            <h5>Optimize Import Structure</h5>
            <p>Consider reorganizing imports to reduce compilation dependencies</p>
            <button class="apply-suggestion">Apply</button>
          </div>
        </div>
        <div class="suggestion-item">
          <div class="suggestion-icon">🔄</div>
          <div class="suggestion-content">
            <h5>Refactor Large Functions</h5>
            <p>5 functions exceed recommended complexity thresholds</p>
            <button class="apply-suggestion">Review</button>
          </div>
        </div>
        <div class="suggestion-item">
          <div class="suggestion-icon">📦</div>
          <div class="suggestion-content">
            <h5>Extract Common Utilities</h5>
            <p>Detected duplicated code patterns across 8 files</p>
            <button class="apply-suggestion">Extract</button>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Apply suggestion buttons
    this.shadow.querySelectorAll('.apply-suggestion').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = e.target as HTMLElement;
        const suggestion = button.closest('.suggestion-item');
        const title = suggestion?.querySelector('h5')?.textContent;
        console.log(`🤖 Applying suggestion: ${title}`);
        
        button.textContent = 'Applied ✓';
        button.setAttribute('disabled', 'true');
        
        setTimeout(() => {
          button.textContent = 'Apply';
          button.removeAttribute('disabled');
        }, 3000);
      });
    });
  }

  styles(): string {
    return `
      .insights-dashboard {
        padding: 0;
        height: 100vh;
        overflow: auto;
        background: linear-gradient(135deg, 
          rgba(255, 193, 7, 0.02) 0%, 
          rgba(255, 152, 0, 0.01) 50%,
          rgba(255, 87, 34, 0.02) 100%);
      }

      .dashboard-header {
        background: linear-gradient(135deg, 
          rgba(255, 193, 7, 0.1) 0%, 
          rgba(255, 152, 0, 0.05) 100%);
        border-bottom: 1px solid var(--card-border);
        padding: 24px 32px;
        backdrop-filter: blur(10px);
      }

      .header-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 1400px;
        margin: 0 auto;
      }

      .dashboard-title {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(45deg, #ffc107, #ff9800, #ff5722);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
      }

      .insight-icon {
        font-size: 3rem;
        animation: glow 2s infinite ease-in-out;
        filter: drop-shadow(0 0 10px rgba(255, 193, 7, 0.5));
      }

      .subtitle {
        font-size: 1rem;
        color: var(--text-muted);
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-left: 8px;
      }

      .quality-score {
        display: flex;
        align-items: center;
      }

      .score-circle {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: conic-gradient(from 0deg, #06ffa5 0deg, #06ffa5 ${(this.metrics.codeQuality?.score || 0) * 3.6}deg, var(--card-border) ${(this.metrics.codeQuality?.score || 0) * 3.6}deg);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .score-circle::before {
        content: '';
        position: absolute;
        width: 70px;
        height: 70px;
        background: var(--bg-primary);
        border-radius: 50%;
      }

      .score-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        z-index: 1;
      }

      .score-label {
        font-size: 0.7rem;
        color: var(--text-muted);
        text-transform: uppercase;
        z-index: 1;
      }

      .insights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 24px;
        padding: 32px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .insight-section {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        padding: 24px;
        box-shadow: var(--shadow-soft);
        transition: var(--transition-smooth);
      }

      .insight-section:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--card-border);
      }

      .section-header h3 {
        margin: 0;
        font-size: 1.2rem;
        color: var(--text-primary);
      }

      .trend-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 600;
      }

      .trend-indicator.improving {
        background: rgba(6, 255, 165, 0.2);
        color: #06ffa5;
      }

      .trend-indicator.stable {
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
      }

      .trend-indicator.declining {
        background: rgba(255, 107, 107, 0.2);
        color: #ff6b6b;
      }

      .debt-total, .insights-count {
        background: var(--primary-accent);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 600;
      }

      .metrics-grid {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .quality-factor {
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 8px;
      }

      .factor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .factor-name {
        font-weight: 600;
        color: var(--text-primary);
      }

      .factor-score {
        font-weight: 700;
        color: var(--primary-accent);
      }

      .factor-bar, .category-bar {
        height: 6px;
        background: var(--bg-primary);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 4px;
      }

      .bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary-accent), var(--secondary-accent));
        border-radius: 3px;
        transition: width 0.5s ease;
      }

      .factor-impact {
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
      }

      .impact-high { color: #ff6b6b; }
      .impact-medium { color: #feca57; }
      .impact-low { color: #06ffa5; }

      .debt-breakdown {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .debt-category {
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 8px;
      }

      .category-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .category-name {
        font-weight: 600;
        color: var(--text-primary);
        text-transform: capitalize;
      }

      .category-hours {
        font-size: 0.9rem;
        color: var(--text-muted);
      }

      .trends-grid {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .trend-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        background: var(--bg-secondary);
        border-radius: 8px;
      }

      .trend-label {
        font-weight: 600;
        color: var(--text-primary);
        min-width: 100px;
      }

      .trend-sparkline {
        flex: 1;
        height: 20px;
      }

      .sparkline {
        width: 100%;
        height: 100%;
      }

      .trend-current {
        font-weight: 700;
        color: var(--primary-accent);
        min-width: 40px;
        text-align: right;
      }

      .insights-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-height: 400px;
        overflow-y: auto;
      }

      .insight-card {
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border-left: 4px solid;
        transition: var(--transition-smooth);
      }

      .insight-card:hover {
        transform: translateX(4px);
      }

      .severity-high { border-left-color: #ff6b6b; }
      .severity-medium { border-left-color: #feca57; }
      .severity-low { border-left-color: #06ffa5; }

      .insight-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .insight-type {
        font-size: 0.8rem;
        color: var(--text-muted);
        text-transform: uppercase;
        font-weight: 600;
      }

      .insight-severity {
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
      }

      .severity-high .insight-severity {
        background: rgba(255, 107, 107, 0.2);
        color: #ff6b6b;
      }

      .severity-medium .insight-severity {
        background: rgba(254, 202, 87, 0.2);
        color: #feca57;
      }

      .severity-low .insight-severity {
        background: rgba(6, 255, 165, 0.2);
        color: #06ffa5;
      }

      .insight-title {
        margin: 0 0 8px 0;
        font-size: 1rem;
        color: var(--text-primary);
      }

      .insight-description {
        margin: 0 0 8px 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.4;
      }

      .insight-suggestion {
        margin: 8px 0;
        padding: 8px;
        background: rgba(6, 255, 165, 0.1);
        border-radius: 4px;
        font-size: 0.9rem;
        line-height: 1.4;
      }

      .insight-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-top: 12px;
        gap: 12px;
      }

      .insight-meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.8rem;
        color: var(--text-muted);
      }

      .insight-files {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .file-tag {
        background: var(--primary-accent);
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.7rem;
        font-family: monospace;
      }

      .recommendations-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .recommendation-card {
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border: 1px solid var(--card-border);
      }

      .rec-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .rec-category {
        background: var(--primary-accent);
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
      }

      .rec-priority {
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
      }

      .priority-high {
        background: rgba(255, 107, 107, 0.2);
        color: #ff6b6b;
      }

      .priority-medium {
        background: rgba(254, 202, 87, 0.2);
        color: #feca57;
      }

      .priority-low {
        background: rgba(6, 255, 165, 0.2);
        color: #06ffa5;
      }

      .rec-title {
        margin: 0 0 8px 0;
        font-size: 1rem;
        color: var(--text-primary);
      }

      .rec-description {
        margin: 0 0 12px 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.4;
      }

      .rec-benefits ul {
        margin: 4px 0 0 16px;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .rec-footer {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--card-border);
      }

      .rec-effort {
        font-size: 0.8rem;
        color: var(--text-muted);
        font-weight: 600;
      }

      .ai-suggestions {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .suggestion-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border: 1px solid var(--card-border);
        transition: var(--transition-smooth);
      }

      .suggestion-item:hover {
        background: rgba(6, 255, 165, 0.05);
        border-color: var(--primary-accent);
      }

      .suggestion-icon {
        font-size: 1.5rem;
        filter: drop-shadow(0 0 5px rgba(6, 255, 165, 0.3));
      }

      .suggestion-content {
        flex: 1;
      }

      .suggestion-content h5 {
        margin: 0 0 4px 0;
        color: var(--text-primary);
        font-size: 0.95rem;
      }

      .suggestion-content p {
        margin: 0 0 8px 0;
        color: var(--text-secondary);
        font-size: 0.85rem;
      }

      .apply-suggestion {
        background: var(--primary-accent);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 600;
        transition: var(--transition-smooth);
      }

      .apply-suggestion:hover {
        background: var(--secondary-accent);
        transform: translateY(-1px);
      }

      .apply-suggestion:disabled {
        background: #06ffa5;
        cursor: not-allowed;
      }

      /* Large sections that need more space */
      .active-insights,
      .recommendations {
        grid-column: span 2;
      }

      @keyframes glow {
        0%, 100% { 
          filter: drop-shadow(0 0 10px rgba(255, 193, 7, 0.5));
        }
        50% { 
          filter: drop-shadow(0 0 20px rgba(255, 193, 7, 0.8));
        }
      }

      @media (max-width: 1200px) {
        .active-insights,
        .recommendations {
          grid-column: span 1;
        }
      }

      @media (max-width: 768px) {
        .insights-grid {
          grid-template-columns: 1fr;
          padding: 16px;
        }
        
        .dashboard-header {
          padding: 16px 20px;
        }
        
        .header-content {
          flex-direction: column;
          gap: 16px;
        }
      }
    `;
  }
}

defineComponent('insights-dashboard', InsightsDashboard);