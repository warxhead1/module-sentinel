import { DashboardComponent, defineComponent } from './base-component.js';
import { 
  MultiLanguageDetector, 
  MultiLanguageNode, 
  CrossLanguageEdge 
} from '../utils/multi-language-detector.js';
import { 
  CrossLanguageAnalyzer 
} from '../utils/cross-language-analyzer.js';
import { 
  LanguageClusterer, 
  LanguageCluster 
} from '../utils/language-clusterer.js';
// import { 
//   SpawnDetector 
// } from '../utils/spawn-detector.js';
import * as d3 from 'd3';

interface CrossLanguageConnection {
  id: string;
  sourceNode: MultiLanguageNode;
  targetNode: MultiLanguageNode;
  connectionType: 'spawn' | 'import' | 'api_call' | 'data_transfer' | 'ffi';
  protocol?: string; // HTTP, IPC, file, etc.
  dataFormat?: string; // JSON, binary, etc.
  description: string;
}

export class MultiLanguageFlowExplorer extends DashboardComponent {
  private flowData: { nodes: MultiLanguageNode[], edges: CrossLanguageEdge[] } | null = null;
  private crossLanguageConnections: CrossLanguageConnection[] = [];
  private selectedLanguages: Set<string> = new Set(['cpp', 'python', 'typescript']);
  private currentFocusNode: string | null = null;
  private availableSymbols: any[] = [];
  
  // Analyzer instances
  private languageDetector: MultiLanguageDetector;
  private crossLanguageAnalyzer: CrossLanguageAnalyzer;
  private languageClusterer: LanguageClusterer;
  // private spawnDetector: SpawnDetector; // For future use
  
  private languageColors: Record<string, string> = {
    cpp: '#0055cc',      // Blue
    python: '#3776ab',   // Python blue
    typescript: '#007acc', // TypeScript blue
    javascript: '#f7df1e', // Yellow
    rust: '#ce422b',     // Rust orange
    go: '#00add8',       // Go cyan
    java: '#ed8b00',     // Java orange
  };
  
  constructor() {
    super();
    this.languageDetector = new MultiLanguageDetector();
    this.crossLanguageAnalyzer = new CrossLanguageAnalyzer();
    this.languageClusterer = new LanguageClusterer();
    // this.spawnDetector = new SpawnDetector(); // For future use
  }

  async loadData(): Promise<void> {
    try {
      // Load available symbols from all languages
      await this.loadAvailableSymbols();
      
      // Check if there's a starting point in the URL
      const params = new URLSearchParams(window.location.search);
      const startNode = params.get('node');
      const languages = params.get('languages')?.split(',') || ['cpp', 'python', 'typescript'];
      
      this.selectedLanguages = new Set(languages);
      
      if (startNode) {
        await this.loadMultiLanguageFlow(startNode);
      } else {
        this.render();
      }
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.render();
    }
  }

  /**
   * Convert relationships array to flow graph format
   */
  private convertRelationshipsToFlowData(relationships: any[]): any {
    const nodes = new Map<string, any>();
    const edges: any[] = [];

    relationships.forEach(rel => {
      // Add source node
      if (rel.from_symbol_id && !nodes.has(rel.from_symbol_id)) {
        nodes.set(rel.from_symbol_id, {
          id: rel.from_symbol_id,
          name: rel.from_name,
          qualified_name: rel.from_qualified_name || rel.from_name,
          kind: rel.from_kind,
          language: rel.from_language,
          file_path: rel.from_file_path,
          line: rel.from_line
        });
      }

      // Add target node
      if (rel.to_symbol_id && !nodes.has(rel.to_symbol_id)) {
        nodes.set(rel.to_symbol_id, {
          id: rel.to_symbol_id,
          name: rel.to_name,
          qualified_name: rel.to_qualified_name || rel.to_name,
          kind: rel.to_kind,
          language: rel.to_language,
          file_path: rel.to_file_path,
          line: rel.to_line
        });
      }

      // Add edge (D3.js expects 'source' and 'target' properties)
      if (rel.from_symbol_id && rel.to_symbol_id) {
        edges.push({
          source: rel.from_symbol_id,
          target: rel.to_symbol_id,
          type: rel.type,
          confidence: rel.confidence,
          cross_language: JSON.parse(rel.metadata || '{}').crossLanguage || false
        });
      }
    });

    const result = {
      nodes: Array.from(nodes.values()) as MultiLanguageNode[],
      edges: edges as CrossLanguageEdge[]
    };
    
    console.log('Converted flow data:', {
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
      nodeIds: result.nodes.map(n => n.id),
      edgeRefs: result.edges.map(e => `${e.source} -> ${e.target}`)
    });
    
    return result;
  }

  private async loadAvailableSymbols(): Promise<void> {
    try {
      // Use dedicated cross-language symbols API
      this.availableSymbols = [];
      
      console.log('Fetching cross-language symbols...');
      const symbolsResponse = await this.fetchAPI('/api/cross-language/symbols');
      console.log('Cross-language symbols API response:', symbolsResponse);
      
      // Handle both wrapped response {success: true, data: [...]} and unwrapped array [...]
      let symbolsArray: any[] = [];
      if (Array.isArray(symbolsResponse)) {
        // fetchAPI returned the raw array
        symbolsArray = symbolsResponse;
      } else if (symbolsResponse.success && symbolsResponse.data) {
        // fetchAPI returned wrapped response
        symbolsArray = symbolsResponse.data;
      }
      
      if (symbolsArray.length > 0) {
        this.availableSymbols = symbolsArray.map((symbol: any) => ({
          id: symbol.id,
          name: symbol.name,
          qualified_name: symbol.qualified_name || symbol.name,
          kind: symbol.kind,
          namespace: symbol.namespace,
          file_path: symbol.file_path,
          language: this.languageDetector.detectLanguageFromPath(symbol.file_path)
        }));
        
        console.log(`✅ Loaded ${this.availableSymbols.length} cross-language symbols:`, this.availableSymbols);
        return;
      } else {
        console.warn('❌ No cross-language symbols found in response:', symbolsResponse);
      }
      
      // Fallback to relationships API if cross-language endpoint fails
      const relationshipsResponse = await this.fetchAPI('/api/cross-language/relationships?limit=100');
      if (relationshipsResponse.success && relationshipsResponse.data?.relationships) {
        // Extract unique symbols from relationships
        const symbolMap = new Map();
        
        relationshipsResponse.data.relationships.forEach((edge: any) => {
          // Add source symbol
          if (edge.from_symbol_id && edge.from_name) {
            symbolMap.set(edge.from_symbol_id, {
              id: edge.from_symbol_id,
              name: edge.from_name,
              qualified_name: edge.from_qualified_name || edge.from_name,
              kind: edge.from_kind,
              namespace: edge.from_namespace,
              file_path: edge.from_file_path || 'unknown',
              language: this.languageDetector.detectLanguageFromPath(edge.from_file_path)
            });
          }
          
          // Add target symbol  
          if (edge.to_symbol_id && edge.to_name) {
            symbolMap.set(edge.to_symbol_id, {
              id: edge.to_symbol_id,
              name: edge.to_name,
              qualified_name: edge.to_qualified_name || edge.to_name,
              kind: edge.to_kind,
              namespace: edge.to_namespace,
              file_path: 'unknown'
            });
          }
        });
        
        this.availableSymbols = Array.from(symbolMap.values()).map(symbol => ({
          ...symbol,
          language: this.languageDetector.detectLanguageFromPath(symbol.file_path || 'unknown')
        }));
      }
      
      // Also add our known multi-language symbols directly
      const knownSymbols = [
        { id: 2077, name: 'BackendServer', qualified_name: 'BackendServer', language: 'typescript', kind: 'class' }
      ];
      
      // Add known symbols if not already present
      knownSymbols.forEach(known => {
        if (!this.availableSymbols.find(s => s.id === known.id)) {
          this.availableSymbols.push(known);
        }
      });
      
      // Filter to target languages and remove duplicates
      const targetLanguages = new Set(['cpp', 'python', 'typescript']);
      const uniqueSymbols = new Map();
      
      this.availableSymbols.forEach(symbol => {
        const detectedLang = this.languageDetector.detectLanguageFromPath(symbol.file_path) || symbol.language;
        if (targetLanguages.has(detectedLang) && !uniqueSymbols.has(symbol.id)) {
          uniqueSymbols.set(symbol.id, { ...symbol, language: detectedLang });
        }
      });
      
      this.availableSymbols = Array.from(uniqueSymbols.values());
      
      // Sort by language and name
      this.availableSymbols.sort((a, b) => 
        a.language.localeCompare(b.language) || a.name.localeCompare(b.name)
      );
    } catch (error) {
      console.warn('Failed to load available symbols:', error);
    }
  }

  async exploreSelectedSymbol(): Promise<void> {
    const selectElement = this.shadow.querySelector('#symbolSelect') as HTMLSelectElement;
    if (!selectElement || !selectElement.value) {
      return;
    }
    
    const symbolId = selectElement.value;
    await this.loadMultiLanguageFlow(symbolId);
  }

  private async loadMultiLanguageFlow(nodeId: string) {
    try {
      this._loading = true;
      this.updateLoadingState();

      // Use dedicated cross-language relationships API
      const url = `/api/cross-language/relationships?from_symbol=${nodeId}&languages=${Array.from(this.selectedLanguages).join(',')}`;
      console.log('Fetching cross-language relationships from:', url);
      
      const data = await this.fetchAPI(url);
      console.log('Cross-language relationships data:', data);
      
      // Handle both relationship array and flow graph formats
      let flowData: any;
      if (Array.isArray(data)) {
        // Convert relationships array to flow graph format
        console.log('Converting relationships to flow graph format');
        flowData = this.convertRelationshipsToFlowData(data);
      } else if (data && (data.nodes || data.edges)) {
        // Already in flow graph format
        flowData = data;
      } else {
        throw new Error('No flow data received');
      }

      console.log('Processing multi-language data:', flowData);
      this.flowData = await this.processMultiLanguageData(flowData);
      
      // Analyze cross-language connections
      const analysis = this.crossLanguageAnalyzer.analyzeCrossLanguageConnections(
        this.flowData.nodes,
        this.flowData.edges
      );
      
      // Convert to connection format for display
      this.crossLanguageConnections = await this.identifyCrossLanguageConnections(
        this.flowData.nodes,
        analysis.connections
      );
      
      this.currentFocusNode = nodeId;
      
      console.log('Flow data processed:', {
        nodes: this.flowData?.nodes?.length || 0,
        edges: this.flowData?.edges?.length || 0,
        connections: this.crossLanguageConnections.length
      });
      
      this._loading = false;
      this.render();
      
      // Initialize visualization after DOM is ready
      setTimeout(() => {
        this.initializeMultiLanguageGraph();
      }, 0);
    } catch (error) {
      console.error('Error loading multi-language flow:', error);
      this._error = error instanceof Error ? error.message : String(error);
      this._loading = false;
      this.render();
    }
  }

  private async processMultiLanguageData(data: any): Promise<{ nodes: MultiLanguageNode[], edges: CrossLanguageEdge[] }> {
    const nodes: MultiLanguageNode[] = [];
    const edges: CrossLanguageEdge[] = [];
    
    // Process nodes and enhance with language information
    if (data.nodes) {
      for (const node of data.nodes) {
        const enhancedNode: MultiLanguageNode = {
          ...node,
          language: node.language || this.languageDetector.detectLanguageFromPath(node.file_path || ''),
          languageGroup: this.getLanguageGroup(node),
          languageFeatures: await this.detectLanguageFeatures(node)
        };
        nodes.push(enhancedNode);
      }
    }

    // Process edges and detect cross-language relationships
    if (data.edges) {
      data.edges.forEach((edge: any) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
          const isCrossLanguage = sourceNode.language !== targetNode.language;
          const connectionType = isCrossLanguage 
            ? this.languageDetector.determineConnectionType(edge, sourceNode, targetNode)
            : undefined;
          
          const enhancedEdge: CrossLanguageEdge = {
            source: edge.source,
            target: edge.target,
            type: edge.type,
            isCrossLanguage,
            connectionType,
            confidence: edge.confidence
          };
          edges.push(enhancedEdge);
        }
      });
    }

    // Detect language boundaries
    const boundaries = this.languageDetector.detectLanguageBoundaries(nodes, edges);
    boundaries.entryPoints.forEach(node => { node.isEntry = true; });
    boundaries.exitPoints.forEach(node => { node.isExit = true; });

    return { nodes, edges };
  }

  private getLanguageGroup(node: any): string {
    const language = node.language || this.languageDetector.detectLanguageFromPath(node.file_path || '');
    const namespace = node.namespace || '';
    return `${language}::${namespace}`;
  }

  /**
   * Detect language-specific features
   */
  private async detectLanguageFeatures(node: MultiLanguageNode): Promise<any> {
    // In a real implementation, this would analyze actual code content
    // For now, use simple name-based detection
    const codeContent = node.name; // Simplified
    return await this.languageDetector.detectLanguageFeatures(node, codeContent);
  }

  /**
   * Identify cross-language connections
   */
  private async identifyCrossLanguageConnections(
    nodes: MultiLanguageNode[],
    edges: CrossLanguageEdge[]
  ): Promise<CrossLanguageConnection[]> {
    const connections: CrossLanguageConnection[] = [];
    
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const connection: CrossLanguageConnection = {
          id: `conn_${edge.source}_${edge.target}`,
          sourceNode,
          targetNode,
          connectionType: edge.connectionType || 'data_transfer',
          protocol: this.determineProtocol(edge, sourceNode, targetNode),
          dataFormat: this.determineDataFormat(edge, sourceNode, targetNode),
          description: this.generateEdgeDetails(edge, sourceNode, targetNode)
        };
        
        connections.push(connection);
      }
    });

    return connections;
  }

  private determineProtocol(edge: CrossLanguageEdge, _source: MultiLanguageNode, _target: MultiLanguageNode): string {
    if (edge.connectionType === 'spawn') return 'process';
    if (edge.connectionType === 'import' || edge.connectionType === 'ffi') return 'module';
    if (edge.connectionType === 'api_call') return 'http';
    return 'unknown';
  }

  private determineDataFormat(edge: CrossLanguageEdge, source: MultiLanguageNode, target: MultiLanguageNode): string {
    // Detect data format based on function signatures, file types, etc.
    if (source.name?.includes('json') || target.name?.includes('json')) return 'JSON';
    if (edge.connectionType === 'spawn') return 'CLI args';
    if (edge.connectionType === 'ffi') return 'binary';
    return 'unknown';
  }

  private generateEdgeDetails(edge: CrossLanguageEdge, source: MultiLanguageNode, target: MultiLanguageNode): string {
    if (!source || !target) return edge.type;
    
    if (edge.isCrossLanguage) {
      return `${source.language} ${edge.type} ${target.language}: ${source.name} → ${target.name}`;
    }
    
    return `${edge.type}: ${source.name} → ${target.name}`;
  }

  render() {
    if (this._loading) {
      this.shadow.innerHTML = this.renderLoading();
      return;
    }

    if (this._error) {
      this.shadow.innerHTML = this.renderError();
      return;
    }

    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 20px;
          height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        }
        
        .multi-language-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ml-title {
          font-size: 2rem;
          font-weight: 300;
          color: #fff;
          margin: 0 0 8px 0;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .language-indicator {
          display: flex;
          gap: 8px;
        }
        
        .lang-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .lang-cpp { background: ${this.languageColors.cpp}; color: white; }
        .lang-python { background: ${this.languageColors.python}; color: white; }
        .lang-typescript { background: ${this.languageColors.typescript}; color: white; }
        .lang-javascript { background: ${this.languageColors.javascript}; color: black; }
        
        .ml-subtitle {
          font-size: 1.1rem;
          color: #aaa;
          font-weight: 300;
        }
        
        .ml-container {
          display: grid;
          grid-template-columns: 350px 1fr 350px;
          gap: 20px;
          height: calc(100vh - 150px);
        }
        
        .ml-sidebar {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px;
          padding: 20px;
          overflow-y: auto;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ml-canvas {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(5px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .ml-controls {
          position: absolute;
          top: 20px;
          left: 20px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          z-index: 10;
        }
        
        .control-panel {
          background: rgba(0, 0, 0, 0.8);
          border-radius: 8px;
          padding: 12px;
          min-width: 200px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .control-title {
          color: #4ecdc4;
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .language-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .lang-filter {
          padding: 6px 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.1);
          color: #e0e0e0;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.8rem;
        }
        
        .lang-filter.active {
          background: #4ecdc4;
          border-color: #4ecdc4;
          color: #000;
        }
        
        .lang-filter:hover {
          background: rgba(78, 205, 196, 0.3);
        }
        
        .connection-types {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        
        .connection-legend {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          font-size: 0.8rem;
        }
        
        .connection-line {
          width: 20px;
          height: 2px;
          border-radius: 2px;
        }
        
        .spawn-line { background: #ff6b6b; }
        .import-line { background: #4ecdc4; }
        .api-line { background: #feca57; }
        .ffi-line { background: #a55eea; }
        .data-line { background: #74b9ff; }
        
        .ml-button {
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid #4ecdc4;
          color: #4ecdc4;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.85rem;
        }
        
        .ml-button:hover {
          background: rgba(78, 205, 196, 0.3);
        }
        
        #multiLanguageGraph {
          width: 100%;
          height: 100%;
        }
        
        .symbol-selector {
          margin-bottom: 15px;
        }
        
        .symbol-selector select {
          width: 100%;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 0.9rem;
        }
        
        .symbol-selector button {
          margin-top: 10px;
          width: 100%;
        }
        
        .cross-language-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 15px;
        }
        
        .connection-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .connection-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .connection-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .connection-type {
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }
        
        .type-spawn { background: #ff6b6b; color: white; }
        .type-import { background: #4ecdc4; color: black; }
        .type-api_call { background: #feca57; color: black; }
        .type-ffi { background: #a55eea; color: white; }
        .type-data_transfer { background: #74b9ff; color: white; }
        
        .connection-flow {
          font-size: 0.9rem;
          color: #e0e0e0;
          margin-bottom: 5px;
        }
        
        .flow-arrow {
          color: #666;
          margin: 0 8px;
        }
        
        .connection-details {
          font-size: 0.8rem;
          color: #888;
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          color: #666;
        }
        
        .empty-icon {
          font-size: 3rem;
          margin-bottom: 15px;
          opacity: 0.5;
        }
        
        h3 {
          color: #4ecdc4;
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0 0 15px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      </style>
      
      <div class="multi-language-header">
        <h1 class="ml-title">
          Multi-Language Flow Explorer
          <div class="language-indicator">
            <span class="lang-badge lang-cpp">C++</span>
            <span class="lang-badge lang-python">Python</span>
            <span class="lang-badge lang-typescript">TypeScript</span>
          </div>
        </h1>
        <p class="ml-subtitle">Explore cross-language relationships and execution flows</p>
      </div>
      
      <div class="ml-container">
        <div class="ml-sidebar">
          <h3>Symbol Explorer</h3>
          ${this.availableSymbols.length > 0 ? `
            <div class="symbol-selector">
              <select id="symbolSelect">
                <option value="">Select a symbol to explore...</option>
                ${this.availableSymbols.map(symbol => `
                  <option value="${symbol.id}" ${symbol.id == this.currentFocusNode ? 'selected' : ''}>
                    [${symbol.language}] ${symbol.name}
                  </option>
                `).join('')}
              </select>
              <button class="ml-button" onclick="this.getRootNode().host.exploreSelectedSymbol()">
                🔍 Explore Symbol
              </button>
            </div>
          ` : this._loading ? `
            <p>Loading symbols...</p>
          ` : `
            <p style="color: #888; margin-top: 20px;">No symbols available</p>
          `}
        </div>
        
        <div class="ml-canvas">
          <div class="ml-controls">
            <div class="control-panel">
              <div class="control-title">Language Filter</div>
              <div class="language-filters">
                ${['cpp', 'python', 'typescript', 'javascript', 'rust', 'go'].map(lang => `
                  <div class="lang-filter ${this.selectedLanguages.has(lang) ? 'active' : ''}" 
                       data-lang="${lang}">
                    ${lang}
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="control-panel">
              <div class="control-title">Connection Types</div>
              <div class="connection-types">
                <div class="connection-legend">
                  <div class="connection-line spawn-line"></div>
                  <span>Process Spawn</span>
                </div>
                <div class="connection-legend">
                  <div class="connection-line import-line"></div>
                  <span>Import/Module</span>
                </div>
                <div class="connection-legend">
                  <div class="connection-line api-line"></div>
                  <span>API Call</span>
                </div>
                <div class="connection-legend">
                  <div class="connection-line ffi-line"></div>
                  <span>FFI/Binding</span>
                </div>
                <div class="connection-legend">
                  <div class="connection-line data-line"></div>
                  <span>Data Transfer</span>
                </div>
              </div>
            </div>
            
            <button class="ml-button" onclick="this.getRootNode().host.resetView()">
              ↺ Reset View
            </button>
            
            <button class="ml-button" onclick="this.getRootNode().host.focusCrossLanguage()">
              🎯 Focus Cross-Language
            </button>
          </div>
          
          ${this.flowData ? `
            <svg id="multiLanguageGraph"></svg>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">🌐</div>
              <h3>No Multi-Language Flow Loaded</h3>
              <p>Select a symbol from the left panel to explore cross-language relationships</p>
            </div>
          `}
        </div>
        
        <div class="ml-sidebar">
          <h3>Cross-Language Connections</h3>
          ${this.crossLanguageConnections.length > 0 ? `
            <div class="cross-language-list">
              ${this.crossLanguageConnections.map(conn => `
                <div class="connection-item" data-connection="${conn.id}">
                  <div class="connection-header">
                    <span class="connection-type type-${conn.connectionType}">${conn.connectionType}</span>
                  </div>
                  <div class="connection-flow">
                    ${conn.sourceNode.name}<span class="flow-arrow">→</span>${conn.targetNode.name}
                  </div>
                  <div class="connection-details">
                    ${conn.sourceNode.language} → ${conn.targetNode.language}
                    ${conn.protocol ? `• ${conn.protocol}` : ''}
                    ${conn.dataFormat ? `• ${conn.dataFormat}` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">🔗</div>
              <p>No cross-language connections detected</p>
            </div>
          `}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private initializeMultiLanguageGraph() {
    if (!this.flowData) {
      console.error('No flow data available');
      return;
    }
    
    if (!d3) {
      console.error('D3.js not loaded, waiting...');
      // Retry after a short delay to allow D3 to load
      setTimeout(() => this.initializeMultiLanguageGraph(), 100);
      return;
    }

    const container = this.shadow.getElementById('multiLanguageGraph');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    d3.select(container).selectAll('*').remove();

    const svg = d3.select(container)
      .attr('width', width)
      .attr('height', height);

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    const g = svg.append('g');

    // Group nodes by language
    const languageClusters = this.languageClusterer.groupSymbolsByLanguage(
      this.flowData.nodes,
      { groupByNamespace: true, groupByModule: true }
    );

    // Create force simulation with language clustering
    const simulation = d3.forceSimulation(this.flowData.nodes as any)
      .force('link', d3.forceLink(this.flowData.edges)
        .id((d: any) => d.id)
        .distance((d: any) => (d as CrossLanguageEdge).isCrossLanguage ? 200 : 100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('cluster', this.createLanguageClusterForce(languageClusters))
      .force('collision', d3.forceCollide().radius(30));

    // Create links with enhanced styling for cross-language connections
    const link = g.append('g')
      .selectAll('path')
      .data(this.flowData.edges)
      .enter().append('path')
      .attr('class', 'flow-link')
      .attr('stroke', (d: CrossLanguageEdge) => this.getEdgeColor(d))
      .attr('stroke-width', (d: CrossLanguageEdge) => d.isCrossLanguage ? 4 : 2)
      .attr('stroke-dasharray', (d: CrossLanguageEdge) => d.isCrossLanguage ? '10,5' : null)
      .attr('opacity', (d: CrossLanguageEdge) => d.isCrossLanguage ? 0.9 : 0.6)
      .attr('marker-end', 'url(#arrowhead)');

    // Create nodes with language-specific styling
    const node = g.append('g')
      .selectAll('.ml-node')
      .data(this.flowData.nodes)
      .enter().append('g')
      .attr('class', 'ml-node')
      .call((d3.drag() as any)
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

    // Add circles to nodes
    node.append('circle')
      .attr('r', (d: any) => this.getNodeRadius(d))
      .attr('fill', (d: any) => this.getNodeColor(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', (d: any) => d.id === this.currentFocusNode ? 3 : 1);

    // Add labels to nodes
    node.append('text')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#e0e0e0')
      .style('pointer-events', 'none')
      .text((d: any) => d.name.length > 12 ? d.name.substring(0, 10) + '...' : d.name);

    // Add language badges
    node.append('rect')
      .attr('x', -15)
      .attr('y', -25)
      .attr('width', 30)
      .attr('height', 12)
      .attr('rx', 6)
      .attr('fill', (d: any) => this.languageColors[d.language] || '#666')
      .attr('opacity', 0.8);

    node.append('text')
      .attr('y', -19)
      .attr('text-anchor', 'middle')
      .style('font-size', '8px')
      .style('fill', 'white')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text((d: any) => (d.language || 'unknown').substring(0, 3).toUpperCase());

    // Add click handlers
    node.on('click', (_event: any, d: any) => {
      this.selectNode(d);
    });

    // Update simulation
    simulation.on('tick', () => {
      link.attr('d', (d: any) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Add arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#666')
      .style('stroke', 'none');

    // Store references
    (this as any)._svg = svg;
    (this as any)._g = g;
    (this as any)._zoom = zoom;
    (this as any)._simulation = simulation;
  }

  private createLanguageClusterForce(clusters: Map<string, LanguageCluster>) {
    // Generate cluster layout
    const container = this.shadow.getElementById('multiLanguageGraph');
    if (container) {
      this.languageClusterer.generateClusterLayout(
        clusters,
        container.clientWidth,
        container.clientHeight
      );
    }
    
    const strength = 0.1;
    
    return (alpha: number) => {
      if (!this.flowData) return;
      
      this.flowData.nodes.forEach((d: any) => {
        const cluster = clusters.get(d.language);
        if (cluster && cluster.centroid) {
          d.vx -= (d.x - cluster.centroid.x) * strength * alpha;
          d.vy -= (d.y - cluster.centroid.y) * strength * alpha;
        }
      });
    };
  }


  private getNodeRadius(node: any): number {
    const baseRadius = 15;
    const maxRadius = 35;
    
    if (node.metrics?.crossLanguageCalls) {
      return Math.min(maxRadius, baseRadius + node.metrics.crossLanguageCalls * 3);
    }
    
    if (node.languageFeatures?.spawn) {
      return baseRadius + 8;
    }
    
    return baseRadius;
  }

  private getNodeColor(node: any): string {
    const baseColor = this.languageColors[node.language] || '#666';
    
    if (node.languageFeatures?.spawn) {
      return '#ff6b6b'; // Red for process spawners
    }
    
    if (node.isEntry) {
      return '#4ecdc4'; // Teal for entry points
    }
    
    return baseColor;
  }


  private getEdgeColor(edge: CrossLanguageEdge): string {
    if (edge.isCrossLanguage) {
      switch (edge.connectionType) {
        case 'spawn': return '#ff6b6b';
        case 'import': return '#4ecdc4';
        case 'api_call': return '#feca57';
        case 'ffi': return '#a55eea';
        case 'data_transfer': return '#74b9ff';
        default: return '#666';
      }
    }
    return '#666';
  }

  private selectNode(node: any) {
    console.log('Selected node:', node);
    this.emit('node-selected', { node });
  }

  private attachEventListeners() {
    // Language filter toggles
    this.shadow.querySelectorAll('.lang-filter[data-lang]').forEach(filter => {
      filter.addEventListener('click', (e) => {
        const lang = (e.target as HTMLElement).getAttribute('data-lang');
        if (lang) {
          if (this.selectedLanguages.has(lang)) {
            this.selectedLanguages.delete(lang);
          } else {
            this.selectedLanguages.add(lang);
          }
          this.render();
          if (this.currentFocusNode) {
            setTimeout(() => this.initializeMultiLanguageGraph(), 0);
          }
        }
      });
    });

    // Connection item clicks
    this.shadow.querySelectorAll('.connection-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const connectionId = (e.currentTarget as HTMLElement).getAttribute('data-connection');
        const connection = this.crossLanguageConnections.find(c => c.id === connectionId);
        if (connection) {
          this.highlightConnection(connection);
        }
      });
    });
  }

  private highlightConnection(connection: CrossLanguageConnection) {
    // Highlight the connection in the graph
    console.log('Highlighting connection:', connection);
    this.emit('connection-highlighted', { connection });
  }

  // Public methods for external controls
  resetView() {
    if ((this as any)._svg && (this as any)._zoom) {
      (this as any)._svg.transition()
        .duration(750)
        .call((this as any)._zoom.transform, d3.zoomIdentity);
    }
  }

  focusCrossLanguage() {
    // Focus on cross-language connections
    if (this.crossLanguageConnections.length > 0) {
      const connection = this.crossLanguageConnections[0];
      this.highlightConnection(connection);
    }
  }

  private updateLoadingState() {
    // Update loading state
    const canvas = this.shadow.querySelector('.ml-canvas');
    if (canvas) {
      canvas.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔄</div>
          <h3>Loading multi-language flow...</h3>
          <p>Analyzing cross-language relationships</p>
        </div>
      `;
    }
  }
}

// Initialize and register component
defineComponent('multi-language-flow-explorer', MultiLanguageFlowExplorer);