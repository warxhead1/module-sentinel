import { DashboardComponent, defineComponent } from './base-component.js';
import { showSymbolSelector } from './symbol-selector-modal.js';
import { stateService } from '../services/state.service.js';

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
  protected container!: HTMLElement;
  private insights: any[] = [];
  private metrics: any = {};
  private recommendations: any[] = [];
  private clusters: any[] = [];
  private selectedSymbol: any = null;
  private activeTab: string = 'insights';

  async loadData(): Promise<void> {
    try {
      // Check if a symbol is selected from state
      const selectedSymbolId = stateService.getState('selectedNodeId');
      const storedSymbol = stateService.getState('selectedSymbol');
      
      if (storedSymbol && !this.selectedSymbol) {
        this.selectedSymbol = storedSymbol;
      }
      
      // Load data based on active tab
      switch (this.activeTab) {
        case 'insights':
          await this.loadInsights();
          break;
        case 'metrics':
          await this.loadQualityMetrics();
          break;
        case 'clusters':
          await this.loadClusters();
          break;
      }
    } catch (error) {
      console.error('Failed to load insights data:', error);
    }
  }

  private async loadInsights(): Promise<void> {
    try {
      // Load insights with optional symbol filtering
      const url = this.selectedSymbol 
        ? `/api/semantic/insights/symbol/${this.selectedSymbol.id}`
        : '/api/semantic/insights?limit=20';
        
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && data.data && data.data.insights) {
        this.insights = data.data.insights;
        
        // Load recommendations for top insights
        await this.loadRecommendationsForInsights();
      }
    } catch (error) {
      console.error('Failed to load insights:', error);
      // Fallback to empty state
      this.insights = [];
    }
  }

  private async loadRecommendationsForInsights(): Promise<void> {
    try {
      const topInsights = this.insights.slice(0, 5);
      const recommendationPromises = topInsights.map(insight => 
        fetch(`/api/semantic/insights/${insight.id}/recommendations`)
          .then(res => res.json())
          .catch(() => ({ success: false }))
      );
      
      const results = await Promise.all(recommendationPromises);
      
      // Attach recommendations to insights
      topInsights.forEach((insight, index) => {
        if (results[index].success && results[index].data) {
          insight.recommendations = results[index].data.recommendations;
        }
      });
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    }
  }

  private async loadQualityMetrics(): Promise<void> {
    try {
      const response = await fetch('/api/semantic/metrics');
      const data = await response.json();
      
      if (data.success && data.data && data.data.metrics) {
        // Transform raw metrics into dashboard format
        this.metrics = {
          overview: {
            totalInsights: data.data.metrics.totalInsights || 0,
            criticalIssues: data.data.metrics.criticalIssues || 0,
            totalClusters: data.data.metrics.totalClusters || 0,
            avgClusterQuality: Math.round((data.data.metrics.avgClusterQuality || 0) * 100)
          },
          byCategory: data.data.metrics.insightsByCategory || {},
          bySeverity: data.data.metrics.insightsBySeverity || {},
          clusterTypes: data.data.metrics.clustersByType || {}
        };
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
      this.metrics = {
        overview: { totalInsights: 0, criticalIssues: 0, totalClusters: 0, avgClusterQuality: 0 },
        byCategory: {},
        bySeverity: {},
        clusterTypes: {}
      };
    }
  }

  private async loadClusters(): Promise<void> {
    try {
      const response = await fetch('/api/semantic/clusters?limit=10');
      const data = await response.json();
      
      if (data.success && data.data && data.data.clusters) {
        this.clusters = data.data.clusters;
      }
    } catch (error) {
      console.error('Failed to load clusters:', error);
      this.clusters = [];
    }
  }

  render(): string {
    return `
      <div class="insights-dashboard">
        ${this.renderHeader()}
        ${this.renderTabs()}
        <div class="dashboard-content">
          ${this.renderActiveTabContent()}
        </div>
      </div>
    `;
  }

  private renderHeader(): string {
    const symbolInfo = this.selectedSymbol 
      ? `<span class="selected-symbol">Symbol: <code>${this.selectedSymbol.name}</code></span>`
      : '<span class="no-symbol">No symbol selected</span>';
      
    return `
      <div class="dashboard-header">
        <h2>💡 Semantic Intelligence</h2>
        <div class="header-controls">
          ${symbolInfo}
          <button class="select-symbol-btn">
            <i class="icon">🎯</i> Select Symbol
          </button>
          <button class="refresh-btn">
            <i class="icon">🔄</i> Refresh
          </button>
        </div>
      </div>
    `;
  }

  private renderTabs(): string {
    const tabs = [
      { id: 'insights', label: '💡 Insights', count: this.insights.length },
      { id: 'metrics', label: '📊 Metrics', count: null },
      { id: 'clusters', label: '🎯 Clusters', count: this.clusters.length }
    ];
    
    return `
      <div class="dashboard-tabs">
        ${tabs.map(tab => `
          <button class="tab-btn ${this.activeTab === tab.id ? 'active' : ''}" 
                  data-tab="${tab.id}">
            ${tab.label}
            ${tab.count !== null ? `<span class="count">${tab.count}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  private renderActiveTabContent(): string {
    switch (this.activeTab) {
      case 'insights':
        return this.renderInsights();
      case 'metrics':
        return this.renderMetrics();
      case 'clusters':
        return this.renderClusters();
      default:
        return '<div class="empty-state">Select a tab to view content</div>';
    }
  }

  private renderInsights(): string {
    if (this.insights.length === 0) {
      return `
        <div class="empty-state">
          <p>No insights available yet.</p>
          <p class="hint">Run semantic analysis on your codebase to generate insights.</p>
          <button class="analyze-btn">Run Analysis</button>
        </div>
      `;
    }

    return `
      <div class="insights-grid">
        ${this.insights.map(insight => this.renderInsightCard(insight)).join('')}
      </div>
    `;
  }

  private renderInsightCard(insight: any): string {
    const severityClass = `severity-${insight.severity}`;
    const priorityClass = `priority-${insight.priority}`;
    const categoryIcon = this.getCategoryIcon(insight.category);
    
    return `
      <div class="insight-card ${severityClass} ${priorityClass}">
        <div class="insight-header">
          <span class="category-icon">${categoryIcon}</span>
          <h3>${insight.title}</h3>
          <span class="severity">${insight.severity}</span>
        </div>
        
        <p class="description">${insight.description}</p>
        
        <div class="insight-meta">
          <span class="confidence">
            <i class="icon">🎯</i> ${Math.round(insight.confidence * 100)}% confidence
          </span>
          <span class="affected">
            <i class="icon">📍</i> ${insight.affectedSymbols?.length || 0} symbols
          </span>
        </div>
        
        ${insight.reasoning ? `
          <div class="reasoning">
            <strong>Why:</strong> ${insight.reasoning}
          </div>
        ` : ''}
        
        ${insight.recommendations && insight.recommendations.length > 0 ? `
          <div class="recommendations">
            <h4>Recommendations:</h4>
            ${insight.recommendations.map((rec: any) => `
              <div class="recommendation">
                <span class="action">${rec.action}</span>
                <span class="effort effort-${rec.effort}">${rec.effort} effort</span>
                <span class="impact impact-${rec.impact}">${rec.impact} impact</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="insight-actions">
          <button class="view-details-btn" data-insight-id="${insight.id}">
            View Details
          </button>
          <button class="feedback-btn positive" data-insight-id="${insight.id}" data-feedback="1">
            👍
          </button>
          <button class="feedback-btn negative" data-insight-id="${insight.id}" data-feedback="-1">
            👎
          </button>
        </div>
      </div>
    `;
  }

  private renderMetrics(): string {
    if (!this.metrics.overview) {
      return '<div class="loading">Loading metrics...</div>';
    }

    return `
      <div class="metrics-dashboard">
        <div class="metrics-overview">
          <div class="metric-card">
            <h3>Total Insights</h3>
            <div class="metric-value">${this.metrics.overview.totalInsights}</div>
          </div>
          <div class="metric-card critical">
            <h3>Critical Issues</h3>
            <div class="metric-value">${this.metrics.overview.criticalIssues}</div>
          </div>
          <div class="metric-card">
            <h3>Semantic Clusters</h3>
            <div class="metric-value">${this.metrics.overview.totalClusters}</div>
          </div>
          <div class="metric-card">
            <h3>Cluster Quality</h3>
            <div class="metric-value">${this.metrics.overview.avgClusterQuality}%</div>
          </div>
        </div>
        
        <div class="metrics-breakdown">
          ${this.renderCategoryBreakdown()}
          ${this.renderSeverityBreakdown()}
          ${this.renderClusterBreakdown()}
        </div>
      </div>
    `;
  }

  private renderCategoryBreakdown(): string {
    const categories = Object.entries(this.metrics.byCategory);
    if (categories.length === 0) return '';
    
    return `
      <div class="breakdown-section">
        <h3>Insights by Category</h3>
        <div class="category-bars">
          ${categories.map(([category, count]) => `
            <div class="bar-item">
              <span class="label">${category}</span>
              <div class="bar">
                <div class="bar-fill" style="width: ${this.getPercentage(count as number, this.metrics.overview.totalInsights)}%"></div>
              </div>
              <span class="count">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderSeverityBreakdown(): string {
    const severities = Object.entries(this.metrics.bySeverity);
    if (severities.length === 0) return '';
    
    return `
      <div class="breakdown-section">
        <h3>Insights by Severity</h3>
        <div class="severity-grid">
          ${severities.map(([severity, count]) => `
            <div class="severity-item severity-${severity}">
              <span class="severity-label">${severity}</span>
              <span class="severity-count">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderClusterBreakdown(): string {
    const clusters = Object.entries(this.metrics.clusterTypes);
    if (clusters.length === 0) return '';
    
    return `
      <div class="breakdown-section">
        <h3>Cluster Analysis</h3>
        <div class="cluster-stats">
          ${clusters.map(([type, stats]: [string, any]) => `
            <div class="cluster-type">
              <h4>${type}</h4>
              <div class="cluster-metrics">
                <span>Count: ${stats.count}</span>
                <span>Quality: ${Math.round(stats.avgQuality * 100)}%</span>
                <span>Symbols: ${stats.totalSymbols}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderClusters(): string {
    if (this.clusters.length === 0) {
      return `
        <div class="empty-state">
          <p>No clusters found.</p>
          <p class="hint">Semantic clustering groups similar code symbols together.</p>
        </div>
      `;
    }

    return `
      <div class="clusters-grid">
        ${this.clusters.map(cluster => this.renderClusterCard(cluster)).join('')}
      </div>
    `;
  }

  private renderClusterCard(cluster: any): string {
    const qualityClass = cluster.quality > 0.8 ? 'high' : cluster.quality > 0.6 ? 'medium' : 'low';
    
    return `
      <div class="cluster-card quality-${qualityClass}">
        <div class="cluster-header">
          <h3>${cluster.name}</h3>
          <span class="cluster-type">${cluster.type}</span>
        </div>
        
        <p class="cluster-description">${cluster.description || 'No description available'}</p>
        
        <div class="cluster-stats">
          <div class="stat">
            <span class="label">Quality</span>
            <span class="value">${Math.round(cluster.quality * 100)}%</span>
          </div>
          <div class="stat">
            <span class="label">Symbols</span>
            <span class="value">${cluster.symbolCount}</span>
          </div>
          <div class="stat">
            <span class="label">Threshold</span>
            <span class="value">${Math.round(cluster.similarityThreshold * 100)}%</span>
          </div>
        </div>
        
        <button class="view-cluster-btn" data-cluster-id="${cluster.id}">
          View Members
        </button>
      </div>
    `;
  }

  setupEventListeners(): void {
    // Tab switching
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).dataset.tab;
        if (tab) {
          this.activeTab = tab;
          this.render();
          this.loadData();
        }
      });
    });

    // Symbol selection
    const selectSymbolBtn = this.container.querySelector('.select-symbol-btn');
    if (selectSymbolBtn) {
      selectSymbolBtn.addEventListener('click', () => {
        showSymbolSelector({
          onSelect: (selected) => {
            this.selectedSymbol = selected;
            stateService.setState('selectedSymbol', selected);
            this.render();
            this.loadData();
          }
        });
      });
    }

    // Refresh button
    const refreshBtn = this.container.querySelector('.refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadData();
      });
    }

    // Feedback buttons
    this.container.querySelectorAll('.feedback-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const insightId = target.dataset.insightId;
        const feedback = parseInt(target.dataset.feedback || '0');
        
        if (insightId && feedback) {
          await this.submitFeedback(insightId, feedback);
          target.classList.add('submitted');
        }
      });
    });

    // View details buttons
    this.container.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const insightId = (e.target as HTMLElement).dataset.insightId;
        if (insightId) {
          this.viewInsightDetails(insightId);
        }
      });
    });

    // View cluster buttons
    this.container.querySelectorAll('.view-cluster-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const clusterId = (e.target as HTMLElement).dataset.clusterId;
        if (clusterId) {
          this.viewClusterDetails(clusterId);
        }
      });
    });

    // Analyze button
    const analyzeBtn = this.container.querySelector('.analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        this.triggerAnalysis();
      });
    }
  }

  private async submitFeedback(insightId: string, feedback: number): Promise<void> {
    try {
      const response = await fetch(`/api/semantic/insights/${insightId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback })
      });
      
      if (!response.ok) {
        console.error('Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  }

  private viewInsightDetails(insightId: string): void {
    // Navigate to detailed insight view or show modal
    console.log('View insight details:', insightId);
  }

  private viewClusterDetails(clusterId: string): void {
    // Navigate to cluster details or show modal
    console.log('View cluster details:', clusterId);
  }

  private async triggerAnalysis(): Promise<void> {
    // Trigger semantic analysis
    console.log('Triggering semantic analysis...');
    // This would typically trigger a full analysis
  }

  private getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      architecture: '🏗️',
      performance: '⚡',
      maintainability: '🔧',
      quality: '✨',
      testing: '🧪',
      security: '🔒',
      'best_practices': '📚'
    };
    return icons[category] || '💡';
  }

  private getPercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }
}

// Register the component
defineComponent('insights-dashboard', InsightsDashboard);