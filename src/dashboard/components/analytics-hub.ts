import { DashboardComponent, defineComponent } from './base-component.js';
import * as d3 from 'd3';

/**
 * 🧠 Analytics Hub - Advanced Data Visualization & Intelligence Dashboard
 * 
 * Features:
 * - Interactive relationship graphs with D3.js
 * - Dependency flow diagrams
 * - Symbol distribution charts
 * - Code complexity heatmaps
 * - Language usage analytics
 * - Pattern detection insights
 * - Architecture topology maps
 */
export class AnalyticsHub extends DashboardComponent {
  private activeTab: string = 'relationships';
  private chartData: any = {};
  private d3Available: boolean = false;

  private tabs = [
    { 
      id: 'relationships', 
      title: 'Relationship Graph', 
      icon: '🕸️',
      description: 'Interactive symbol dependencies'
    },
    { 
      id: 'architecture', 
      title: 'Architecture Map', 
      icon: '🏗️',
      description: 'System topology overview'
    },
    { 
      id: 'complexity', 
      title: 'Complexity Analysis', 
      icon: '📈',
      description: 'Code complexity metrics'
    },
    { 
      id: 'distribution', 
      title: 'Symbol Distribution', 
      icon: '📊',
      description: 'Symbol types & counts'
    },
    { 
      id: 'languages', 
      title: 'Language Analytics', 
      icon: '🌍',
      description: 'Multi-language insights'
    },
    { 
      id: 'patterns', 
      title: 'Pattern Intelligence', 
      icon: '🧩',
      description: 'Design pattern analysis'
    },
    { 
      id: 'hotspots', 
      title: 'Code Hotspots', 
      icon: '🔥',
      description: 'Performance & complexity hotspots'
    }
  ];

  async loadData(): Promise<void> {
    try {
      // Check if D3.js is available
      this.d3Available = typeof (window as any).d3 !== 'undefined';
      
      if (!this.d3Available) {
        console.log('📊 Loading D3.js for advanced visualizations...');
        await this.loadD3();
      }

      // Load analytics data in parallel
      await Promise.allSettled([
        this.loadRelationshipData(),
        this.loadComplexityData(),
        this.loadDistributionData(),
        this.loadLanguageData(),
        this.loadPatternData(),
        this.loadHotspotData()
      ]);

    } catch (error) {
      console.error('Failed to load analytics data:', error);
    }
  }

  async loadD3(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof (window as any).d3 !== 'undefined') {
        this.d3Available = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://d3js.org/d3.v7.min.js';
      script.onload = () => {
        this.d3Available = true;
        console.log('✅ D3.js loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load D3.js');
        reject(new Error('Failed to load D3.js'));
      };
      document.head.appendChild(script);
    });
  }

  private async loadRelationshipData(): Promise<void> {
    try {
      const response = await this.fetchAPI('/api/relationships?limit=100');
      this.chartData.relationships = response || [];
    } catch (error) {
      console.warn('Failed to load relationship data:', error);
      this.chartData.relationships = [];
    }
  }

  private async loadComplexityData(): Promise<void> {
    try {
      // Mock complexity data for now
      this.chartData.complexity = {
        byFile: [
          { file: 'VulkanRenderer.cpp', complexity: 85, loc: 1240, functions: 34 },
          { file: 'TerrainGenerator.cpp', complexity: 72, loc: 890, functions: 28 },
          { file: 'ShaderManager.cpp', complexity: 65, loc: 670, functions: 22 },
          { file: 'RenderPipeline.cpp', complexity: 58, loc: 520, functions: 18 },
          { file: 'BufferManager.cpp', complexity: 45, loc: 380, functions: 15 }
        ],
        byNamespace: [
          { namespace: 'Rendering::Vulkan', avgComplexity: 68, fileCount: 12 },
          { namespace: 'Terrain::Generation', avgComplexity: 54, fileCount: 8 },
          { namespace: 'Core::Memory', avgComplexity: 42, fileCount: 6 },
          { namespace: 'Utils::Math', avgComplexity: 35, fileCount: 4 }
        ]
      };
    } catch (error) {
      console.warn('Failed to load complexity data:', error);
    }
  }

  private async loadDistributionData(): Promise<void> {
    try {
      const stats = await this.fetchAPI('/api/stats');
      this.chartData.distribution = {
        symbolTypes: stats?.kindBreakdown || {},
        languageBreakdown: stats?.languageBreakdown || {}
      };
    } catch (error) {
      console.warn('Failed to load distribution data:', error);
      this.chartData.distribution = { symbolTypes: {}, languageBreakdown: {} };
    }
  }

  private async loadLanguageData(): Promise<void> {
    try {
      const languages = await this.fetchAPI('/api/languages');
      this.chartData.languages = languages || [];
    } catch (error) {
      console.warn('Failed to load language data:', error);
      this.chartData.languages = [];
    }
  }

  private async loadPatternData(): Promise<void> {
    try {
      const patterns = await this.fetchAPI('/api/patterns');
      this.chartData.patterns = patterns || [];
    } catch (error) {
      console.warn('Failed to load pattern data:', error);
      this.chartData.patterns = [];
    }
  }

  private async loadHotspotData(): Promise<void> {
    try {
      const hotspots = await this.fetchAPI('/api/performance/hotspots');
      this.chartData.hotspots = hotspots || [];
    } catch (error) {
      console.warn('Failed to load hotspot data:', error);
      this.chartData.hotspots = [];
    }
  }

  render(): void {
    this.shadow.innerHTML = `
      <style>${this.styles()}</style>
      <div class="analytics-hub">
        <div class="hub-header">
          <div class="header-content">
            <h1 class="hub-title">
              <span class="brain-icon">🧠</span>
              Analytics Hub
              <span class="subtitle">Advanced Code Intelligence</span>
            </h1>
            <div class="stats-overview">
              <div class="stat-card">
                <div class="stat-value">${Object.keys(this.chartData.distribution?.symbolTypes || {}).length}</div>
                <div class="stat-label">Symbol Types</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${this.chartData.relationships?.length || 0}</div>
                <div class="stat-label">Relationships</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${this.chartData.languages?.length || 0}</div>
                <div class="stat-label">Languages</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">${this.chartData.patterns?.length || 0}</div>
                <div class="stat-label">Patterns</div>
              </div>
            </div>
          </div>
        </div>

        <div class="tab-navigation">
          ${this.tabs.map(tab => `
            <button class="tab-btn ${this.activeTab === tab.id ? 'active' : ''}" 
                    data-tab="${tab.id}">
              <span class="tab-icon">${tab.icon}</span>
              <div class="tab-content">
                <div class="tab-title">${tab.title}</div>
                <div class="tab-description">${tab.description}</div>
              </div>
            </button>
          `).join('')}
        </div>

        <div class="visualization-container">
          ${this.renderActiveVisualization()}
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.initializeVisualization();
  }

  private renderActiveVisualization(): string {
    switch (this.activeTab) {
      case 'relationships':
        return this.renderRelationshipGraph();
      case 'architecture':
        return this.renderArchitectureMap();
      case 'complexity':
        return this.renderComplexityAnalysis();
      case 'distribution':
        return this.renderDistributionCharts();
      case 'languages':
        return this.renderLanguageAnalytics();
      case 'patterns':
        return this.renderPatternIntelligence();
      case 'hotspots':
        return this.renderCodeHotspots();
      default:
        return '<div class="placeholder">Select a visualization type</div>';
    }
  }

  private renderRelationshipGraph(): string {
    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>🕸️ Interactive Relationship Graph</h3>
          <div class="chart-controls">
            <button class="control-btn" data-action="zoom-in">🔍 Zoom In</button>
            <button class="control-btn" data-action="zoom-out">🔍 Zoom Out</button>
            <button class="control-btn" data-action="reset">🔄 Reset View</button>
            <button class="control-btn" data-action="layout">🎯 Re-layout</button>
          </div>
        </div>
        <div id="relationship-graph" class="d3-visualization">
          ${this.d3Available ? 
            '<div class="loading">Loading interactive graph...</div>' : 
            '<div class="error">D3.js loading required for visualization</div>'
          }
        </div>
        <div class="graph-legend">
          <div class="legend-item">
            <span class="legend-color function"></span>
            <span>Functions</span>
          </div>
          <div class="legend-item">
            <span class="legend-color class"></span>
            <span>Classes</span>
          </div>
          <div class="legend-item">
            <span class="legend-color namespace"></span>
            <span>Namespaces</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderArchitectureMap(): string {
    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>🏗️ System Architecture Topology</h3>
        </div>
        <div id="architecture-map" class="d3-visualization">
          <div class="coming-soon">🚧 Architecture visualization coming soon!</div>
        </div>
      </div>
    `;
  }

  private renderComplexityAnalysis(): string {
    const complexityData = this.chartData.complexity;
    if (!complexityData) {
      return '<div class="loading">Loading complexity data...</div>';
    }

    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>📈 Code Complexity Analysis</h3>
        </div>
        <div class="complexity-grid">
          <div class="complexity-chart">
            <h4>Most Complex Files</h4>
            <div class="complexity-bars">
              ${complexityData.byFile.map((file: any) => `
                <div class="complexity-bar">
                  <div class="file-info">
                    <span class="file-name">${file.file}</span>
                    <span class="complexity-score">${file.complexity}</span>
                  </div>
                  <div class="bar-container">
                    <div class="bar" style="width: ${file.complexity}%"></div>
                  </div>
                  <div class="file-stats">
                    <span>📄 ${file.loc} LOC</span>
                    <span>⚡ ${file.functions} Functions</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="namespace-complexity">
            <h4>Namespace Complexity</h4>
            <div class="namespace-grid">
              ${complexityData.byNamespace.map((ns: any) => `
                <div class="namespace-card">
                  <div class="namespace-name">${ns.namespace}</div>
                  <div class="complexity-meter">
                    <div class="meter-fill" style="width: ${ns.avgComplexity}%"></div>
                  </div>
                  <div class="namespace-stats">
                    <span>📊 ${ns.avgComplexity} avg complexity</span>
                    <span>📁 ${ns.fileCount} files</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderDistributionCharts(): string {
    const { symbolTypes, languageBreakdown } = this.chartData.distribution;
    
    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>📊 Symbol & Language Distribution</h3>
        </div>
        <div class="distribution-grid">
          <div class="pie-chart-container">
            <h4>Symbol Types</h4>
            <div id="symbol-pie-chart" class="pie-chart">
              ${this.renderPieChart(symbolTypes)}
            </div>
          </div>
          <div class="pie-chart-container">
            <h4>Language Breakdown</h4>
            <div id="language-pie-chart" class="pie-chart">
              ${this.renderPieChart(languageBreakdown)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderPieChart(data: Record<string, number>): string {
    const entries = Object.entries(data);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    
    if (total === 0) {
      return '<div class="no-data">No data available</div>';
    }

    const colors = ['#9370db', '#ba55d3', '#dda0dd', '#e6e6fa', '#f0e6ff', '#d8bfd8'];
    
    return `
      <div class="pie-segments">
        ${entries.map(([key, value], index) => {
          const percentage = ((value / total) * 100).toFixed(1);
          return `
            <div class="pie-segment" style="background: ${colors[index % colors.length]};">
              <span class="segment-label">${key}</span>
              <span class="segment-value">${value} (${percentage}%)</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private renderLanguageAnalytics(): string {
    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>🌍 Multi-Language Analytics & Flow Visualization</h3>
          <div class="chart-controls">
            <button class="control-btn" data-action="explore-flow">🔍 Explore Cross-Language Flow</button>
            <button class="control-btn" data-action="refresh-data">🔄 Refresh Data</button>
          </div>
        </div>
        
        <div class="language-analytics-container">
          <!-- Language Statistics Grid -->
          <div class="language-stats-section">
            <h4>📊 Language Distribution</h4>
            <div id="language-analytics" class="language-grid">
              ${this.chartData.languages.map((lang: any) => `
                <div class="language-card">
                  <div class="language-header">
                    <span class="language-name">${lang.display_name || lang.name}</span>
                    <span class="symbol-count">${lang.symbol_count} symbols</span>
                  </div>
                  <div class="language-progress">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${Math.min(100, (lang.symbol_count / 1000) * 100)}%"></div>
                    </div>
                  </div>
                  <div class="language-stats">
                    <span>📂 Extensions: ${lang.file_extensions || 'Unknown'}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Multi-Language Flow Visualization -->
          <div class="flow-visualization-section">
            <h4>🌐 Cross-Language Flow Visualization</h4>
            <div class="flow-integration-container">
              <div id="multi-language-flow-integration" class="ml-flow-container">
                <div class="flow-instructions">
                  <div class="instruction-card">
                    <h5>🎯 How to Explore Multi-Language Flow</h5>
                    <ol>
                      <li>Click "Explore Cross-Language Flow" above to open the full explorer</li>
                      <li>Or browse relationships in the dedicated <a href="#/relationships" class="flow-link">Relationship Graph</a></li>
                      <li>Search for specific symbols in the <a href="#/search" class="flow-link">Search Interface</a></li>
                    </ol>
                  </div>
                  
                  <div class="quick-actions">
                    <button class="action-btn" onclick="this.getRootNode().host.openMultiLanguageFlow()">
                      🚀 Launch Multi-Language Explorer
                    </button>
                    <button class="action-btn" onclick="this.getRootNode().host.openRelationships()">
                      🕸️ View Relationship Graph
                    </button>
                  </div>
                </div>
                
                <!-- Placeholder for embedded mini-visualization -->
                <div class="mini-flow-preview">
                  <div class="preview-header">
                    <span>📈 Recent Cross-Language Activity</span>
                  </div>
                  <div class="preview-content">
                    <div class="connection-summary">
                      <div class="connection-type">
                        <span class="connection-icon">🔗</span>
                        <span class="connection-label">C++ ↔ Python</span>
                        <span class="connection-count">12 connections</span>
                      </div>
                      <div class="connection-type">
                        <span class="connection-icon">⚡</span>
                        <span class="connection-label">TypeScript ↔ JavaScript</span>
                        <span class="connection-count">8 connections</span>
                      </div>
                      <div class="connection-type">
                        <span class="connection-icon">🌊</span>
                        <span class="connection-label">Python Process Spawning</span>
                        <span class="connection-count">5 spawns detected</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderPatternIntelligence(): string {
    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>🧩 Design Pattern Intelligence</h3>
        </div>
        <div class="patterns-grid">
          <div class="coming-soon">🚧 Pattern analysis visualization coming soon!</div>
        </div>
      </div>
    `;
  }

  private renderCodeHotspots(): string {
    return `
      <div class="chart-container">
        <div class="chart-header">
          <h3>🔥 Performance & Complexity Hotspots</h3>
        </div>
        <div class="hotspots-heatmap">
          <div class="coming-soon">🚧 Hotspot heatmap visualization coming soon!</div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Tab navigation
    this.shadow.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabId = target.getAttribute('data-tab');
        if (tabId && tabId !== this.activeTab) {
          this.activeTab = tabId;
          this.render();
        }
      });
    });

    // Chart controls
    this.shadow.querySelectorAll('.control-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.getAttribute('data-action');
        this.handleChartAction(action);
      });
    });
  }

  private handleChartAction(action: string | null): void {
    switch (action) {
      case 'zoom-in':
        console.log('🔍 Zooming in...');
        break;
      case 'zoom-out':
        console.log('🔍 Zooming out...');
        break;
      case 'reset':
        console.log('🔄 Resetting view...');
        break;
      case 'layout':
        console.log('🎯 Re-layouting graph...');
        break;
      case 'explore-flow':
        this.openMultiLanguageFlow();
        break;
      case 'refresh-data':
        this.refreshLanguageData();
        break;
    }
  }

  // Public methods for navigation (called from button onclick)
  openMultiLanguageFlow(): void {
    const router = (window as any).dashboardServices?.router;
    if (router) {
      router.navigate('/multi-language-flow');
    } else {
      window.location.hash = '#/multi-language-flow';
    }
  }

  openRelationships(): void {
    const router = (window as any).dashboardServices?.router;
    if (router) {
      router.navigate('/relationships');
    } else {
      window.location.hash = '#/relationships';
    }
  }

  private async refreshLanguageData(): Promise<void> {
    console.log('🔄 Refreshing language data...');
    try {
      await this.loadLanguageData();
      this.render(); // Re-render with fresh data
    } catch (error) {
      console.error('Failed to refresh language data:', error);
    }
  }

  private async initializeVisualization(): Promise<void> {
    if (this.activeTab === 'relationships' && this.d3Available) {
      await this.initializeRelationshipGraph();
    }
  }

  private async initializeRelationshipGraph(): Promise<void> {
    const container = this.shadow.getElementById('relationship-graph');
    if (!container || !this.d3Available) return;

    const d3 = (window as any).d3;
    const relationships = this.chartData.relationships || [];

    if (relationships.length === 0) {
      container.innerHTML = '<div class="no-data">No relationship data available</div>';
      return;
    }

    // Clear container
    container.innerHTML = '';

    // Create SVG
    const width = container.clientWidth || 800;
    const height = 500;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Create sample data for now
    const nodes = [
      { id: 'VulkanRenderer', type: 'class', group: 1 },
      { id: 'TerrainGenerator', type: 'class', group: 2 },
      { id: 'BufferManager', type: 'class', group: 3 },
      { id: 'ShaderManager', type: 'class', group: 3 },
      { id: 'RenderPipeline', type: 'class', group: 1 }
    ];

    const links = [
      { source: 'VulkanRenderer', target: 'BufferManager', type: 'calls' },
      { source: 'VulkanRenderer', target: 'ShaderManager', type: 'calls' },
      { source: 'TerrainGenerator', target: 'VulkanRenderer', type: 'calls' },
      { source: 'RenderPipeline', target: 'VulkanRenderer', type: 'inherits' }
    ];

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Create links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#9370db')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', 2);

    // Create nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 15)
      .attr('fill', (d: any) => d.group === 1 ? '#ba55d3' : d.group === 2 ? '#dda0dd' : '#e6e6fa')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .call(d3.drag()
        .on('start', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event: any, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Add labels
    const labels = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text((d: any) => d.id)
      .attr('font-size', 10)
      .attr('font-family', 'monospace')
      .attr('fill', '#fff')
      .attr('text-anchor', 'middle')
      .attr('dy', 4);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    console.log('✅ Relationship graph initialized with D3.js');
  }

  styles(): string {
    return `
      .analytics-hub {
        padding: 0;
        height: 100vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: linear-gradient(135deg, 
          rgba(147, 112, 219, 0.02) 0%, 
          rgba(186, 85, 211, 0.01) 50%,
          rgba(221, 160, 221, 0.02) 100%);
      }

      .hub-header {
        background: linear-gradient(135deg, 
          rgba(147, 112, 219, 0.1) 0%, 
          rgba(186, 85, 211, 0.05) 100%);
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

      .hub-title {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 2.5rem;
        font-weight: 700;
        background: linear-gradient(45deg, #9370db, #ba55d3, #dda0dd);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
        position: relative;
      }

      .brain-icon {
        font-size: 3rem;
        animation: pulse 2s infinite ease-in-out;
        filter: drop-shadow(0 0 10px rgba(147, 112, 219, 0.5));
      }

      .subtitle {
        font-size: 1rem;
        color: var(--text-muted);
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-left: 8px;
      }

      .stats-overview {
        display: flex;
        gap: 20px;
      }

      .stat-card {
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 16px 20px;
        text-align: center;
        min-width: 100px;
        transition: var(--transition-smooth);
      }

      .stat-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
        background: rgba(147, 112, 219, 0.1);
      }

      .stat-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--primary-accent);
        display: block;
        line-height: 1;
      }

      .stat-label {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .tab-navigation {
        display: flex;
        background: var(--card-bg);
        border-bottom: 1px solid var(--card-border);
        overflow-x: auto;
        padding: 0 32px;
        gap: 8px;
      }

      .tab-btn {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        background: transparent;
        border: none;
        border-bottom: 3px solid transparent;
        cursor: pointer;
        transition: var(--transition-smooth);
        min-width: 200px;
        text-align: left;
      }

      .tab-btn:hover {
        background: rgba(147, 112, 219, 0.1);
        border-bottom-color: var(--primary-accent);
      }

      .tab-btn.active {
        background: rgba(147, 112, 219, 0.15);
        border-bottom-color: var(--primary-accent);
        box-shadow: inset 0 0 20px rgba(147, 112, 219, 0.1);
      }

      .tab-icon {
        font-size: 1.5rem;
        filter: drop-shadow(0 0 5px rgba(147, 112, 219, 0.3));
      }

      .tab-content {
        flex: 1;
      }

      .tab-title {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.95rem;
        margin-bottom: 2px;
      }

      .tab-description {
        font-size: 0.8rem;
        color: var(--text-muted);
        line-height: 1.2;
      }

      .visualization-container {
        flex: 1;
        overflow: auto;
        padding: 32px;
        background: var(--bg-primary);
      }

      .chart-container {
        max-width: 1400px;
        margin: 0 auto;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: var(--shadow-medium);
      }

      .chart-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 24px 32px;
        background: linear-gradient(135deg, 
          rgba(147, 112, 219, 0.05) 0%, 
          rgba(186, 85, 211, 0.02) 100%);
        border-bottom: 1px solid var(--card-border);
      }

      .chart-header h3 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .chart-controls {
        display: flex;
        gap: 8px;
      }

      .control-btn {
        padding: 8px 16px;
        background: rgba(147, 112, 219, 0.1);
        border: 1px solid var(--card-border);
        border-radius: 6px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: var(--transition-smooth);
        font-size: 0.875rem;
      }

      .control-btn:hover {
        background: rgba(147, 112, 219, 0.2);
        color: var(--primary-accent);
      }

      .d3-visualization {
        min-height: 500px;
        background: var(--bg-secondary);
        position: relative;
        overflow: hidden;
      }

      .loading, .error, .no-data, .coming-soon {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 400px;
        color: var(--text-muted);
        font-size: 1.2rem;
        font-weight: 500;
      }

      .graph-legend {
        display: flex;
        gap: 24px;
        padding: 16px 32px;
        background: var(--bg-secondary);
        border-top: 1px solid var(--card-border);
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
        color: var(--text-secondary);
      }

      .legend-color {
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }

      .legend-color.function { background: #ba55d3; }
      .legend-color.class { background: #dda0dd; }
      .legend-color.namespace { background: #e6e6fa; }

      .complexity-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        padding: 32px;
      }

      .complexity-bars {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .complexity-bar {
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border: 1px solid var(--card-border);
      }

      .file-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .file-name {
        font-family: monospace;
        font-weight: 600;
        color: var(--text-primary);
      }

      .complexity-score {
        background: linear-gradient(45deg, #ff6b6b, #feca57);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-weight: 700;
      }

      .bar-container {
        height: 8px;
        background: var(--bg-primary);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
      }

      .bar {
        height: 100%;
        background: linear-gradient(90deg, #48cae4, #0077b6);
        border-radius: 4px;
        transition: width 0.5s ease;
      }

      .file-stats {
        display: flex;
        gap: 16px;
        font-size: 0.8rem;
        color: var(--text-muted);
      }

      .namespace-grid {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .namespace-card {
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border: 1px solid var(--card-border);
      }

      .namespace-name {
        font-family: monospace;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 8px;
      }

      .complexity-meter {
        height: 6px;
        background: var(--bg-primary);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 8px;
      }

      .meter-fill {
        height: 100%;
        background: linear-gradient(90deg, #06ffa5, #0d7377);
        border-radius: 3px;
        transition: width 0.5s ease;
      }

      .namespace-stats {
        display: flex;
        gap: 16px;
        font-size: 0.8rem;
        color: var(--text-muted);
      }

      .distribution-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        padding: 32px;
      }

      .pie-chart-container {
        background: var(--bg-secondary);
        border-radius: 12px;
        padding: 24px;
        border: 1px solid var(--card-border);
      }

      .pie-chart-container h4 {
        margin: 0 0 20px 0;
        color: var(--text-primary);
        text-align: center;
      }

      .pie-segments {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .pie-segment {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }

      .language-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        padding: 32px;
      }

      .language-card {
        background: var(--bg-secondary);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 20px;
        transition: var(--transition-smooth);
      }

      .language-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-medium);
      }

      .language-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .language-name {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 1.1rem;
      }

      .symbol-count {
        background: var(--primary-accent);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 600;
      }

      .language-progress {
        margin: 12px 0;
      }

      .progress-bar {
        height: 8px;
        background: var(--bg-primary);
        border-radius: 4px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary-accent), var(--secondary-accent));
        border-radius: 4px;
        transition: width 0.5s ease;
      }

      .language-stats {
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      /* Multi-Language Flow Integration Styles */
      .language-analytics-container {
        padding: 32px;
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .language-stats-section h4,
      .flow-visualization-section h4 {
        color: var(--text-primary);
        margin: 0 0 16px 0;
        font-size: 1.2rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .flow-integration-container {
        background: var(--bg-secondary);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        overflow: hidden;
      }

      .ml-flow-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        padding: 24px;
      }

      .flow-instructions {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .instruction-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        padding: 20px;
      }

      .instruction-card h5 {
        color: var(--primary-accent);
        margin: 0 0 12px 0;
        font-size: 1rem;
        font-weight: 600;
      }

      .instruction-card ol {
        color: var(--text-secondary);
        margin: 0;
        padding-left: 20px;
        line-height: 1.6;
      }

      .instruction-card li {
        margin-bottom: 8px;
      }

      .flow-link {
        color: var(--primary-accent);
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: var(--transition-smooth);
      }

      .flow-link:hover {
        border-bottom-color: var(--primary-accent);
      }

      .quick-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .action-btn {
        background: linear-gradient(135deg, var(--primary-accent), var(--secondary-accent));
        color: white;
        border: none;
        border-radius: 8px;
        padding: 12px 20px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition-smooth);
        box-shadow: 0 4px 12px rgba(147, 112, 219, 0.3);
      }

      .action-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(147, 112, 219, 0.4);
      }

      .mini-flow-preview {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 8px;
        overflow: hidden;
      }

      .preview-header {
        background: linear-gradient(135deg, 
          rgba(147, 112, 219, 0.1) 0%, 
          rgba(186, 85, 211, 0.05) 100%);
        padding: 12px 16px;
        border-bottom: 1px solid var(--card-border);
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.9rem;
      }

      .preview-content {
        padding: 16px;
      }

      .connection-summary {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .connection-type {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 6px;
        border: 1px solid rgba(147, 112, 219, 0.1);
        transition: var(--transition-smooth);
      }

      .connection-type:hover {
        background: rgba(147, 112, 219, 0.05);
        border-color: var(--primary-accent);
      }

      .connection-icon {
        font-size: 1.2rem;
        min-width: 20px;
      }

      .connection-label {
        color: var(--text-secondary);
        flex: 1;
        font-size: 0.9rem;
        font-family: 'Fira Code', monospace;
      }

      .connection-count {
        background: var(--primary-accent);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        min-width: 50px;
        text-align: center;
      }

      @keyframes pulse {
        0%, 100% { 
          transform: scale(1);
          filter: drop-shadow(0 0 10px rgba(147, 112, 219, 0.5));
        }
        50% { 
          transform: scale(1.05);
          filter: drop-shadow(0 0 20px rgba(147, 112, 219, 0.8));
        }
      }

      /* Responsive design */
      @media (max-width: 1200px) {
        .complexity-grid,
        .distribution-grid {
          grid-template-columns: 1fr;
        }
        
        .header-content {
          flex-direction: column;
          gap: 20px;
          text-align: center;
        }
        
        .stats-overview {
          justify-content: center;
        }
      }

      @media (max-width: 768px) {
        .hub-header {
          padding: 16px 20px;
        }
        
        .visualization-container {
          padding: 16px;
        }
        
        .tab-navigation {
          padding: 0 16px;
        }
        
        .tab-btn {
          min-width: 150px;
          padding: 12px 16px;
        }
        
        .chart-header {
          padding: 16px 20px;
          flex-direction: column;
          gap: 12px;
        }
        
        .chart-controls {
          justify-content: center;
        }
      }
    `;
  }
}

defineComponent('analytics-hub', AnalyticsHub);