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
  private antiPatterns: any[] = [];
  private antiPatternSummary: any = {};
  private selectedSymbol: any = null;
  private activeTab: string = 'insights';

  private get api() {
    return (window as any).dashboardServices?.api;
  }

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
        case 'antipatterns':
          await this.loadAntiPatterns();
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
      
      console.log('📊 Loading insights from:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('📊 Insights API response:', data);
      
      if (data.success && data.data && data.data.insights) {
        // Map API response fields to component expected fields
        this.insights = data.data.insights.map((insight: any) => ({
          id: insight.id,
          title: insight.title,
          description: insight.description,
          category: insight.category,
          type: insight.type || insight.insightType,
          severity: insight.severity,
          priority: insight.priority,
          confidence: insight.confidence,
          affectedSymbols: this.parseJsonField(insight.affectedSymbols, []),
          reasoning: insight.reasoning,
          metrics: this.parseJsonField(insight.metrics, {}),
          status: insight.status,
          userFeedback: insight.userFeedback,
          detectedAt: insight.detectedAt
        }));
        
        console.log(`✅ Loaded ${this.insights.length} insights`, this.insights);
        
        // Load recommendations for top insights
        await this.loadRecommendationsForInsights();
        
        // Re-render to display the loaded data
        this.render();
      } else {
        console.warn('⚠️ No insights in response:', data);
        this.insights = [];
        this.render();
      }
    } catch (error) {
      console.error('❌ Failed to load insights:', error);
      // Fallback to empty state
      this.insights = [];
      this.render();
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
      console.log('📊 Loading enhanced quality metrics...');
      
      // Load enhanced quality metrics with anti-patterns
      const qualityResponse = await this.api.getCodeQualityMetrics();
      
      if (qualityResponse.success && qualityResponse.data) {
        const data = qualityResponse.data;
        
        // Transform enhanced metrics into dashboard format
        this.metrics = {
          overview: {
            healthScore: data.healthScore || 0,
            confidence: data.confidence || 0,
            coverage: data.coverage || 0,
            maintainabilityIndex: Math.round(data.maintainabilityIndex || 0),
            technicalDebt: data.technicalDebt || 0,
            totalAntiPatterns: data.antiPatterns?.total || 0,
            criticalAntiPatterns: data.antiPatterns?.bySeverity?.critical || 0
          },
          antiPatterns: data.antiPatterns || {
            total: 0,
            bySeverity: {},
            byType: {},
            details: []
          },
          patterns: data.patterns || 0,
          issues: data.issues || {},
          recommendations: data.recommendations || []
        };
        console.log('✅ Loaded metrics:', this.metrics);
        
        // Re-render to display the loaded data
        this.render();
      } else {
        console.warn('⚠️ No metrics in response:', qualityResponse);
        this.metrics = {
          overview: { totalInsights: 0, criticalIssues: 0, totalClusters: 0, avgClusterQuality: 0 },
          byCategory: {},
          bySeverity: {},
          clusterTypes: {}
        };
        this.render();
      }
    } catch (error) {
      console.error('❌ Failed to load metrics:', error);
      this.metrics = {
        overview: { totalInsights: 0, criticalIssues: 0, totalClusters: 0, avgClusterQuality: 0 },
        byCategory: {},
        bySeverity: {},
        clusterTypes: {}
      };
      this.render();
    }
  }

  private async loadAntiPatterns(): Promise<void> {
    try {
      console.log('🔍 Loading advanced anti-patterns...');
      
      // Load anti-pattern summary for overview
      const summaryResponse = await this.api.getAntiPatternSummary();
      if (summaryResponse.success && summaryResponse.data) {
        this.antiPatternSummary = summaryResponse.data;
      }
      
      // Load detailed anti-patterns
      const antiPatternsResponse = await this.api.getAntiPatterns({ 
        limit: 50, 
        severity: undefined // Load all severities
      });
      
      if (antiPatternsResponse.success && antiPatternsResponse.data) {
        this.antiPatterns = antiPatternsResponse.data;
        console.log('✅ Loaded anti-patterns:', this.antiPatterns.length);
        
        // If a symbol is selected, also load its specific anti-patterns
        if (this.selectedSymbol && this.selectedSymbol.id) {
          const symbolAntiPatternsResponse = await this.api.getSymbolAntiPatterns(this.selectedSymbol.id);
          if (symbolAntiPatternsResponse.success && symbolAntiPatternsResponse.data) {
            this.selectedSymbol.antiPatterns = symbolAntiPatternsResponse.data;
          }
        }
        
        // Re-render to display the loaded data
        this.render();
      }
    } catch (error) {
      console.error('Failed to load anti-patterns:', error);
    }
  }

  private async loadClusters(): Promise<void> {
    try {
      console.log('📊 Loading clusters...');
      const response = await fetch('/api/semantic/clusters?limit=10');
      const data = await response.json();
      
      console.log('📊 Clusters API response:', data);
      
      if (data.success && data.data && data.data.clusters) {
        // Map API response fields to component expected fields
        this.clusters = data.data.clusters.map((cluster: any) => ({
          id: cluster.id,
          name: cluster.name || `Cluster ${cluster.id}`,
          type: cluster.clusterType || cluster.type,
          description: cluster.description,
          quality: cluster.quality || cluster.averageSimilarity || 0,
          symbolCount: cluster.symbolCount || cluster.size || 0,
          similarityThreshold: cluster.similarityThreshold || 0.7,
          metadata: cluster.metadata ? JSON.parse(cluster.metadata) : {},
          createdAt: cluster.createdAt
        }));
        
        console.log(`✅ Loaded ${this.clusters.length} clusters`, this.clusters);
        
        // Re-render to display the loaded data
        this.render();
      } else {
        console.warn('⚠️ No clusters in response:', data);
        this.clusters = [];
        this.render();
      }
    } catch (error) {
      console.error('❌ Failed to load clusters:', error);
      this.clusters = [];
      this.render();
    }
  }

  render(): void {
    const content = `
      <div class="insights-dashboard">
        ${this.renderHeader()}
        ${this.renderTabs()}
        <div class="dashboard-content">
          ${this.renderActiveTabContent()}
        </div>
      </div>
    `;
    
    this.shadow.innerHTML = `
      <style>${this.styles()}</style>
      ${content}
    `;
    
    // Set the container reference for event listeners
    this.container = this.shadow.querySelector('.insights-dashboard') as HTMLElement;
    
    // Setup event listeners after rendering
    this.setupEventListeners();
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
          <button type="button" class="analyze-btn">Run Analysis</button>
          <br><br>
          <button type="button" class="demo-btn" onclick="this.getRootNode().host.loadDemoData()">Load Demo Data</button>
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
    try {
      console.log('🚀 Triggering semantic analysis...');
      
      const analyzeBtn = this.container.querySelector('.analyze-btn') as HTMLButtonElement;
      if (analyzeBtn) {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
      }
      
      const response = await fetch('/api/semantic/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          options: {
            generateInsights: true,
            performClustering: true,
            includeMetrics: true
          }
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Semantic analysis triggered successfully:', data);
        
        // Show success message
        if (analyzeBtn) {
          analyzeBtn.textContent = 'Analysis Started!';
          analyzeBtn.style.background = 'rgba(76, 175, 80, 0.2)';
          analyzeBtn.style.color = '#4caf50';
        }
        
        // Wait a bit then reload data
        setTimeout(async () => {
          await this.loadData();
          if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Run Analysis';
            analyzeBtn.style.background = '';
            analyzeBtn.style.color = '';
          }
        }, 3000);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('❌ Failed to trigger analysis:', error);
      
      const analyzeBtn = this.container.querySelector('.analyze-btn') as HTMLButtonElement;
      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Run Analysis';
        analyzeBtn.style.background = 'rgba(255, 82, 82, 0.2)';
        analyzeBtn.style.color = '#ff5252';
        
        setTimeout(() => {
          analyzeBtn.style.background = '';
          analyzeBtn.style.color = '';
        }, 3000);
      }
    }
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

  /**
   * Load demo data for testing the UI
   */
  public loadDemoData(): void {
    console.log('🎭 Loading demo insights data...');
    
    // Demo insights
    this.insights = [
      {
        id: 1,
        title: 'Large Class Detected',
        description: 'The UniversalIndexer class has 842 lines of code and 37 methods, which exceeds recommended limits for maintainability.',
        category: 'maintainability',
        type: 'code_smell',
        severity: 'high',
        priority: 'high',
        confidence: 0.92,
        affectedSymbols: ['UniversalIndexer', 'indexFiles', 'processLanguage'],
        reasoning: 'Classes with more than 500 lines and 20 methods become difficult to understand, test, and maintain. This violates the Single Responsibility Principle.',
        recommendations: [
          { action: 'Extract language-specific indexing into separate strategy classes', effort: 'medium', impact: 'high' },
          { action: 'Move file traversal logic to a dedicated FileScanner class', effort: 'low', impact: 'medium' }
        ]
      },
      {
        id: 2,
        title: 'Potential N+1 Query Problem',
        description: 'The getSymbolRelationships method performs individual queries in a loop, which could cause performance issues with large datasets.',
        category: 'performance',
        type: 'performance_concern',
        severity: 'medium',
        priority: 'medium',
        confidence: 0.85,
        affectedSymbols: ['getSymbolRelationships', 'DatabaseService'],
        reasoning: 'Database queries inside loops can lead to N+1 query problems, significantly impacting performance as data grows.',
        recommendations: [
          { action: 'Use batch queries with IN clause to fetch all relationships at once', effort: 'low', impact: 'high' },
          { action: 'Implement query result caching for frequently accessed relationships', effort: 'medium', impact: 'medium' }
        ]
      },
      {
        id: 3,
        title: 'Missing Error Handling',
        description: 'Several async methods in the parser modules lack proper error handling, which could lead to unhandled promise rejections.',
        category: 'quality',
        type: 'code_smell',
        severity: 'medium',
        priority: 'high',
        confidence: 0.78,
        affectedSymbols: ['parseFile', 'extractSymbols', 'processImports'],
        reasoning: 'Unhandled errors in async operations can crash the application or leave it in an inconsistent state.',
        recommendations: [
          { action: 'Wrap async operations in try-catch blocks', effort: 'low', impact: 'high' },
          { action: 'Implement a global error handler for uncaught promise rejections', effort: 'low', impact: 'medium' }
        ]
      },
      {
        id: 4,
        title: 'Circular Dependency Detected',
        description: 'Circular dependency chain found between SemanticAnalyzer → SymbolResolver → TypeChecker → SemanticAnalyzer.',
        category: 'architecture',
        type: 'architectural_violation',
        severity: 'high',
        priority: 'high',
        confidence: 0.95,
        affectedSymbols: ['SemanticAnalyzer', 'SymbolResolver', 'TypeChecker'],
        reasoning: 'Circular dependencies make the code harder to understand, test, and can lead to initialization problems.',
        recommendations: [
          { action: 'Extract shared functionality into a separate module', effort: 'medium', impact: 'high' },
          { action: 'Use dependency injection to break the circular chain', effort: 'high', impact: 'high' }
        ]
      },
      {
        id: 5,
        title: 'Insufficient Test Coverage',
        description: 'The CrossLanguageDetector module has only 23% test coverage, well below the project standard of 80%.',
        category: 'testing',
        type: 'testing_gap',
        severity: 'medium',
        priority: 'medium',
        confidence: 0.88,
        affectedSymbols: ['CrossLanguageDetector', 'detectFFI', 'detectSubprocess'],
        reasoning: 'Low test coverage increases the risk of bugs and makes refactoring dangerous.',
        recommendations: [
          { action: 'Add unit tests for all public methods', effort: 'medium', impact: 'high' },
          { action: 'Create integration tests for cross-language detection scenarios', effort: 'high', impact: 'high' }
        ]
      }
    ];
    
    // Demo metrics
    this.metrics = {
      overview: {
        totalInsights: 47,
        criticalIssues: 5,
        totalClusters: 12,
        avgClusterQuality: 78
      },
      byCategory: {
        architecture: 8,
        performance: 12,
        maintainability: 15,
        quality: 7,
        testing: 5
      },
      bySeverity: {
        critical: 5,
        high: 12,
        medium: 20,
        low: 10
      },
      clusterTypes: {
        'Similar Implementation': { count: 5, avgQuality: 0.82, totalSymbols: 43 },
        'Common Patterns': { count: 3, avgQuality: 0.75, totalSymbols: 28 },
        'API Groups': { count: 4, avgQuality: 0.79, totalSymbols: 31 }
      }
    };
    
    // Demo clusters
    this.clusters = [
      {
        id: 1,
        name: 'Parser Implementation Pattern',
        type: 'implementation',
        description: 'Similar parser implementations across different language modules',
        quality: 0.85,
        symbolCount: 12,
        similarityThreshold: 0.8
      },
      {
        id: 2,
        name: 'Database Access Layer',
        type: 'api_group',
        description: 'Database service methods with similar signatures and functionality',
        quality: 0.78,
        symbolCount: 8,
        similarityThreshold: 0.75
      },
      {
        id: 3,
        name: 'Error Handling Patterns',
        type: 'pattern',
        description: 'Common error handling and logging patterns across modules',
        quality: 0.72,
        symbolCount: 15,
        similarityThreshold: 0.7
      }
    ];
    
    console.log('✅ Demo data loaded');
    this.render();
  }

  private getPercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  styles(): string {
    return `
      .insights-dashboard {
        padding: 24px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .dashboard-header h2 {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .header-controls {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .selected-symbol,
      .no-symbol {
        font-size: 14px;
        color: var(--text-secondary);
      }

      .selected-symbol code {
        background: rgba(100, 255, 218, 0.1);
        padding: 2px 8px;
        border-radius: 4px;
        color: var(--primary-accent);
      }

      button {
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        color: var(--text-primary);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: var(--transition-smooth);
      }

      button:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: var(--primary-accent);
      }

      .dashboard-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
        border-bottom: 1px solid var(--card-border);
        padding-bottom: 16px;
      }

      .tab-btn {
        padding: 12px 24px;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        position: relative;
        transition: var(--transition-smooth);
      }

      .tab-btn:hover {
        color: var(--text-primary);
      }

      .tab-btn.active {
        color: var(--primary-accent);
      }

      .tab-btn.active::after {
        content: '';
        position: absolute;
        bottom: -17px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--primary-accent);
      }

      .count {
        background: rgba(100, 255, 218, 0.2);
        color: var(--primary-accent);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        margin-left: 8px;
      }

      .dashboard-content {
        min-height: 400px;
      }

      .empty-state {
        text-align: center;
        padding: 80px 20px;
        color: var(--text-muted);
      }

      .empty-state p {
        margin: 8px 0;
        font-size: 16px;
      }

      .hint {
        font-size: 14px;
        opacity: 0.7;
      }

      .analyze-btn {
        margin-top: 24px;
        background: var(--primary-accent);
        color: #0a192f;
        font-weight: 600;
        padding: 12px 32px;
      }

      .analyze-btn:hover {
        background: var(--secondary-accent);
        transform: translateY(-2px);
      }

      .demo-btn {
        background: rgba(147, 112, 219, 0.2);
        color: #9370db;
        border-color: #9370db;
        font-weight: 600;
        padding: 12px 32px;
      }

      .demo-btn:hover {
        background: rgba(147, 112, 219, 0.3);
        transform: translateY(-2px);
      }

      /* Insights Grid */
      .insights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 24px;
      }

      .insight-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: var(--border-radius);
        padding: 20px;
        transition: var(--transition-smooth);
      }

      .insight-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
      }

      .insight-card.severity-critical {
        border-color: #ff5252;
      }

      .insight-card.severity-high {
        border-color: #ff9800;
      }

      .insight-card.severity-medium {
        border-color: #ffc107;
      }

      .insight-card.severity-low {
        border-color: #4caf50;
      }

      .insight-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
      }

      .category-icon {
        font-size: 24px;
      }

      .insight-header h3 {
        flex: 1;
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .severity {
        padding: 4px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .severity-critical .severity {
        background: rgba(255, 82, 82, 0.2);
        color: #ff5252;
      }

      .severity-high .severity {
        background: rgba(255, 152, 0, 0.2);
        color: #ff9800;
      }

      .severity-medium .severity {
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
      }

      .severity-low .severity {
        background: rgba(76, 175, 80, 0.2);
        color: #4caf50;
      }

      .description {
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 16px;
      }

      .insight-meta {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        font-size: 12px;
        color: var(--text-muted);
      }

      .insight-meta .icon {
        margin-right: 4px;
      }

      .reasoning {
        background: rgba(255, 255, 255, 0.03);
        padding: 12px;
        border-radius: 8px;
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 16px;
      }

      .recommendations {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--card-border);
      }

      .recommendations h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: var(--text-primary);
      }

      .recommendation {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 6px;
        margin-bottom: 8px;
        font-size: 13px;
      }

      .action {
        flex: 1;
        color: var(--text-primary);
      }

      .effort,
      .impact {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        text-transform: uppercase;
      }

      .effort-low {
        background: rgba(76, 175, 80, 0.2);
        color: #4caf50;
      }

      .effort-medium {
        background: rgba(255, 193, 7, 0.2);
        color: #ffc107;
      }

      .effort-high {
        background: rgba(255, 82, 82, 0.2);
        color: #ff5252;
      }

      .impact-low {
        background: rgba(158, 158, 158, 0.2);
        color: #9e9e9e;
      }

      .impact-medium {
        background: rgba(3, 169, 244, 0.2);
        color: #03a9f4;
      }

      .impact-high {
        background: rgba(100, 255, 218, 0.2);
        color: var(--primary-accent);
      }

      .insight-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
      }

      .view-details-btn {
        flex: 1;
        background: rgba(100, 255, 218, 0.1);
        color: var(--primary-accent);
        border-color: var(--primary-accent);
      }

      .view-details-btn:hover {
        background: rgba(100, 255, 218, 0.2);
      }

      .feedback-btn {
        width: 40px;
        padding: 8px;
        font-size: 16px;
      }

      .feedback-btn.submitted {
        background: rgba(100, 255, 218, 0.2);
        border-color: var(--primary-accent);
      }

      /* Metrics Dashboard */
      .metrics-dashboard {
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .metrics-overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 24px;
      }

      .metric-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: var(--border-radius);
        padding: 24px;
        text-align: center;
      }

      .metric-card.critical {
        border-color: #ff5252;
      }

      .metric-card h3 {
        margin: 0 0 16px 0;
        font-size: 14px;
        color: var(--text-secondary);
        font-weight: 500;
      }

      .metric-value {
        font-size: 36px;
        font-weight: 700;
        color: var(--primary-accent);
      }

      .metric-card.critical .metric-value {
        color: #ff5252;
      }

      .metrics-breakdown {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 24px;
      }

      .breakdown-section {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: var(--border-radius);
        padding: 24px;
      }

      .breakdown-section h3 {
        margin: 0 0 20px 0;
        font-size: 16px;
        color: var(--text-primary);
      }

      .category-bars {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .bar-item {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .bar-item .label {
        width: 120px;
        font-size: 13px;
        color: var(--text-secondary);
        text-transform: capitalize;
      }

      .bar {
        flex: 1;
        height: 24px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        background: var(--primary-accent);
        transition: width 0.5s ease;
      }

      .bar-item .count {
        width: 40px;
        text-align: right;
        font-size: 13px;
        color: var(--text-primary);
        background: none;
        padding: 0;
        margin: 0;
      }

      .severity-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .severity-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
      }

      .severity-label {
        font-size: 14px;
        text-transform: capitalize;
      }

      .severity-count {
        font-size: 20px;
        font-weight: 600;
      }

      /* Clusters */
      .clusters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 24px;
      }

      .cluster-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: var(--border-radius);
        padding: 20px;
        transition: var(--transition-smooth);
      }

      .cluster-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
      }

      .cluster-card.quality-high {
        border-color: var(--primary-accent);
      }

      .cluster-card.quality-medium {
        border-color: #ffc107;
      }

      .cluster-card.quality-low {
        border-color: #ff5252;
      }

      .cluster-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .cluster-header h3 {
        margin: 0;
        font-size: 16px;
        color: var(--text-primary);
      }

      .cluster-type {
        padding: 4px 12px;
        background: rgba(100, 255, 218, 0.1);
        color: var(--primary-accent);
        border-radius: 16px;
        font-size: 12px;
        text-transform: capitalize;
      }

      .cluster-description {
        color: var(--text-secondary);
        font-size: 14px;
        margin-bottom: 16px;
        line-height: 1.5;
      }

      .cluster-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 16px;
      }

      .stat {
        text-align: center;
      }

      .stat .label {
        display: block;
        font-size: 12px;
        color: var(--text-muted);
        margin-bottom: 4px;
      }

      .stat .value {
        display: block;
        font-size: 20px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .view-cluster-btn {
        width: 100%;
        background: rgba(100, 255, 218, 0.1);
        color: var(--primary-accent);
        border-color: var(--primary-accent);
      }

      .view-cluster-btn:hover {
        background: rgba(100, 255, 218, 0.2);
      }

      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
        color: var(--text-muted);
      }
    `;
  }

  private parseJsonField(field: any, defaultValue: any): any {
    if (!field) return defaultValue;
    
    // If it's already an object/array, return it
    if (typeof field === 'object') return field;
    
    // If it's a string, try to parse it
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch (error) {
        console.warn('Failed to parse JSON field:', field, error);
        return defaultValue;
      }
    }
    
    return defaultValue;
  }
}

// Register the component
defineComponent('insights-dashboard', InsightsDashboard);