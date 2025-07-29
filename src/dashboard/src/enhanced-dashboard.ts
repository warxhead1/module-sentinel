/**
 * Enhanced Module Sentinel Dashboard
 * Beautiful data visualization for code intelligence
 * Designed for UX with 30 years of data analysis experience
 */

import { WebGPURenderer } from './core/webgpu-renderer.js';
import { WebGLFallbackRenderer } from './core/webgl-fallback-renderer.js';
import type { Symbol, UniversalRelationship } from './types/rust-bindings.js';
import { MCPBridge } from './data/mcp-bridge.js';
import { LiveDataManager } from './data/live-data-manager.js';

interface DashboardMetrics {
  totalSymbols: number;
  totalRelationships: number;
  languageDistribution: Record<string, number>;
  complexityMetrics: {
    averageComplexity: number;
    highComplexityFunctions: number;
    architecturalScore: number;
  };
  qualityMetrics: {
    testCoverage: number;
    codeReuse: number;
    technicalDebt: number;
  };
}

interface NetworkNode {
  id: string;
  name: string;
  type: 'function' | 'class' | 'struct' | 'interface' | 'module';
  language: string;
  complexity: number;
  connections: number;
  x: number;
  y: number;
  z: number; // 3D positioning
  size: number;
  color: string;
  importance: number; // 0-1 scale based on connections and usage
  // Constellation properties
  constellation?: string; // Which constellation this belongs to
  stellarClass: 'supergiant' | 'giant' | 'main-sequence' | 'white-dwarf' | 'neutron-star';
  luminosity: number; // How bright/visible at different zoom levels
  orbitalRadius?: number; // For nodes that orbit around others
  orbitalSpeed?: number;
  orbitalAngle?: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  type: 'calls' | 'inherits' | 'imports' | 'references';
  weight: number;
  frequency: number; // how often this connection is used
}

export class EnhancedDashboard {
  private renderer: WebGPURenderer | WebGLFallbackRenderer | null = null;
  private mcpBridge: MCPBridge | null = null;
  private liveDataManager: LiveDataManager | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  
  // Data structures
  private metrics: DashboardMetrics = {
    totalSymbols: 0,
    totalRelationships: 0,
    languageDistribution: {},
    complexityMetrics: {
      averageComplexity: 0,
      highComplexityFunctions: 0,
      architecturalScore: 0
    },
    qualityMetrics: {
      testCoverage: 0,
      codeReuse: 0,
      technicalDebt: 0
    }
  };
  
  private networkData: {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
  } = { nodes: [], edges: [] };
  
  // UI state
  private selectedNode: NetworkNode | null = null;
  private hoveredNode: NetworkNode | null = null;
  private zoomLevel = 1.0;
  private panOffset = { x: 0, y: 0 };
  private animationFrame = 0;
  
  // 3D Camera and Navigation
  private camera = {
    position: { x: 0, y: 0, z: 500 },
    target: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0, roll: 0 }
  };
  
  // Universe zoom levels
  private currentZoomLevel: 'galaxy' | 'solar-system' | 'planet' | 'surface' = 'galaxy';
  private targetZoomLevel: 'galaxy' | 'solar-system' | 'planet' | 'surface' = 'galaxy';
  private zoomTransition = 0; // 0-1 for smooth transitions
  
  // Constellation data
  private constellations = new Map<string, NetworkNode[]>();
  private stellarSystems = new Map<string, NetworkNode[]>();
  
  // Color schemes for beautiful visualization
  private readonly colorSchemes = {
    languages: {
      'Rust': { primary: '#ce422b', secondary: '#f74c00', glow: '#ff6b35' },
      'TypeScript': { primary: '#3178c6', secondary: '#4fa8da', glow: '#68c4ff' },
      'JavaScript': { primary: '#f7df1e', secondary: '#ffeb3b', glow: '#fff59d' },
      'Python': { primary: '#3776ab', secondary: '#4fc3f7', glow: '#81d4fa' },
      'Cpp': { primary: '#00599c', secondary: '#42a5f5', glow: '#64b5f6' },
      'Go': { primary: '#00add8', secondary: '#26c6da', glow: '#4dd0e1' }
    },
    complexity: {
      low: { primary: '#4caf50', glow: '#81c784' },
      medium: { primary: '#ff9800', glow: '#ffb74d' },
      high: { primary: '#f44336', glow: '#ef5350' },
      critical: { primary: '#9c27b0', glow: '#ba68c8' }
    },
    relationships: {
      calls: '#2196f3',
      inherits: '#9c27b0',
      imports: '#4caf50',
      references: '#ff9800'
    }
  };

  constructor() {
    this.canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas element not found');
    }
    
    // Set up high DPI rendering
    this.setupHighDPICanvas();
    
    // Initialize 2D context for overlay UI
    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
  }

  async init(): Promise<void> {
    try {
      // Initialize renderer (try WebGPU first, fallback to WebGL)
      await this.initRenderer();
      
      // Initialize data connections
      await this.initDataConnections();
      
      // Load initial data
      await this.loadData();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Start render loop
      this.startRenderLoop();
      
      // Show initial metrics
      this.updateMetricsDisplay();
      
      console.info('Enhanced Dashboard initialized successfully');
    } catch (error) {
      console.error('Failed to initialize enhanced dashboard:', error);
      this.showError(error);
    }
  }

  private async initRenderer(): Promise<void> {
    try {
      // Try WebGPU first
      this.renderer = new WebGPURenderer(this.canvas);
      await this.renderer.init();
      this.updateStatus('WebGPU Ready', true);
      this.updateElement('renderer-type', 'WebGPU');
    } catch (webgpuError) {
      console.warn('WebGPU not available, using WebGL fallback:', webgpuError);
      
      try {
        // Fallback to WebGL
        this.renderer = new WebGLFallbackRenderer(this.canvas);
        await this.renderer.init();
        this.updateStatus('WebGL Fallback', true);
        this.updateElement('renderer-type', 'WebGL');
      } catch (webglError) {
        console.warn('WebGL also failed, using Canvas 2D fallback:', webglError);
        
        // Ultimate fallback - use Canvas 2D directly
        this.renderer = null;
        this.updateStatus('Canvas 2D Mode', true);
        this.updateElement('renderer-type', 'Canvas2D');
      }
    }
  }

  private async initDataConnections(): Promise<void> {
    // Initialize MCP bridge
    this.mcpBridge = new MCPBridge();
    await this.mcpBridge.connect();
    
    // Initialize live data manager
    this.liveDataManager = new LiveDataManager(this.mcpBridge);
    
    // Set up event listeners for data updates
    this.liveDataManager.on('symbolsUpdated', (symbols: Symbol[]) => {
      this.processSymbolsData(symbols);
    });
    
    this.liveDataManager.on('relationsUpdated', (relations: UniversalRelationship[]) => {
      this.processRelationsData(relations);
    });
  }

  private async loadData(): Promise<void> {
    if (!this.liveDataManager) return;
    
    try {
      // Load initial data
      await this.liveDataManager.loadInitialData();
      
      // Also manually fetch more detailed data for enhanced visualization
      await this.fetchEnhancedData();
      
    } catch (error) {
      console.error('Failed to load data:', error);
      throw error; // Don't fallback to sample data
    }
  }

  private async fetchEnhancedData(): Promise<void> {
    if (!this.mcpBridge) return;
    
    try {
      // Fetch symbols with enhanced search
      const symbols = await this.mcpBridge.searchSymbols('', { limit: 1000 });
      
      // Fetch all relationships
      const relationships = await fetch('http://localhost:6969/api/symbols/relationships')
        .then(res => res.json())
        .then(data => data.success ? data.data.relationships : []);
      
      // Process the data for visualization
      this.processSymbolsData(symbols);
      this.processRelationsData(relationships);
      
      console.info(`Loaded ${symbols.length} symbols and ${relationships.length} relationships`);
      
    } catch (error) {
      console.error('Failed to fetch enhanced data:', error);
    }
  }

  private processSymbolsData(symbols: Symbol[]): void {
    // Update metrics
    this.metrics.totalSymbols = symbols.length;
    
    // Calculate language distribution
    const langDist: Record<string, number> = {};
    symbols.forEach(symbol => {
      langDist[symbol.language] = (langDist[symbol.language] || 0) + 1;
    });
    this.metrics.languageDistribution = langDist;
    
    // Convert symbols to network nodes with 3D properties
    this.networkData.nodes = symbols.slice(0, 500).map((symbol, _index) => {
      const complexity = this.calculateSymbolComplexity(symbol);
      const importance = this.calculateSymbolImportance(symbol);
      
      return {
        id: symbol.id,
        name: symbol.name,
        type: this.inferSymbolType(symbol),
        language: symbol.language,
        complexity,
        connections: 0, // Will be calculated from edges
        x: (Math.random() - 0.5) * 800,
        y: (Math.random() - 0.5) * 600,
        z: (Math.random() - 0.5) * 400, // Initialize Z coordinate
        size: Math.max(8, Math.min(40, 8 + importance * 32)),
        color: this.getLanguageColor(symbol.language),
        importance,
        // Initialize stellar properties (will be updated by layout algorithm)
        stellarClass: 'main-sequence',
        luminosity: 0.5
      };
    });
    
    this.calculateComplexityMetrics();
    this.updateVisualization();
  }

  private processRelationsData(relations: UniversalRelationship[]): void {
    this.metrics.totalRelationships = relations.length;
    
    // Convert relationships to network edges
    const nodeIds = new Set(this.networkData.nodes.map(n => n.id));
    
    this.networkData.edges = relations
      .filter(rel => {
        const sourceId = rel.fromSymbolId?.toString();
        const targetId = rel.toSymbolId?.toString();
        return sourceId && targetId && nodeIds.has(sourceId) && nodeIds.has(targetId);
      })
      .map(rel => ({
        source: rel.fromSymbolId!.toString(),
        target: rel.toSymbolId!.toString(),
        type: this.inferRelationType(rel.relationshipType),
        weight: rel.confidence,
        frequency: Math.random() * 100 // This would come from actual usage data
      }));
    
    // Update connection counts for nodes
    const connectionCounts = new Map<string, number>();
    this.networkData.edges.forEach(edge => {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
    });
    
    this.networkData.nodes.forEach(node => {
      node.connections = connectionCounts.get(node.id) || 0;
      // Adjust size based on connections
      node.size = Math.max(8, Math.min(40, 8 + node.connections * 2 + node.importance * 20));
    });
    
    this.updateVisualization();
  }

  private calculateSymbolComplexity(symbol: Symbol): number {
    // Calculate complexity based on multiple factors
    const lineCount = symbol.endLine - symbol.startLine;
    const signatureComplexity = symbol.signature.length / 50;
    const baseComplexity = Math.min(1.0, (lineCount + signatureComplexity) / 20);
    
    return baseComplexity;
  }

  private calculateSymbolImportance(symbol: Symbol): number {
    // Calculate importance based on symbol characteristics
    let importance = 0;
    
    // Public symbols are more important
    if (!symbol.signature.includes('private')) importance += 0.3;
    
    // Functions and classes are typically more important than variables
    if (symbol.signature.includes('function') || symbol.signature.includes('class')) {
      importance += 0.4;
    }
    
    // Longer symbols (more lines) might be more important
    const lineCount = symbol.endLine - symbol.startLine;
    importance += Math.min(0.3, lineCount / 100);
    
    return Math.min(1.0, importance);
  }

  private inferSymbolType(symbol: Symbol): NetworkNode['type'] {
    const sig = symbol.signature.toLowerCase();
    if (sig.includes('class')) return 'class';
    if (sig.includes('struct')) return 'struct';
    if (sig.includes('interface')) return 'interface';
    if (sig.includes('function') || sig.includes('fn ')) return 'function';
    return 'module';
  }

  private inferRelationType(relType: string): NetworkEdge['type'] {
    switch (relType.toLowerCase()) {
      case 'calls': return 'calls';
      case 'inherits': case 'extends': return 'inherits';
      case 'imports': case 'uses': return 'imports';
      default: return 'references';
    }
  }

  private getLanguageColor(language: string): string {
    const colors = this.colorSchemes.languages;
    return colors[language as keyof typeof colors]?.primary || '#888888';
  }

  private calculateComplexityMetrics(): void {
    if (this.networkData.nodes.length === 0) return;
    
    const complexities = this.networkData.nodes.map(n => n.complexity);
    this.metrics.complexityMetrics.averageComplexity = 
      complexities.reduce((sum, c) => sum + c, 0) / complexities.length;
    
    this.metrics.complexityMetrics.highComplexityFunctions = 
      this.networkData.nodes.filter(n => n.complexity > 0.7 && n.type === 'function').length;
    
    // Architectural score based on connection patterns
    const totalConnections = this.networkData.nodes.reduce((sum, n) => sum + n.connections, 0);
    const avgConnections = totalConnections / this.networkData.nodes.length;
    this.metrics.complexityMetrics.architecturalScore = Math.min(1.0, avgConnections / 10);
  }

  private updateVisualization(): void {
    // Apply revolutionary river flow layout for beautiful architectural streams
    this.applyRiverFlowLayout();
    
    // Update UI
    this.updateMetricsDisplay();
  }

  private applyRiverFlowLayout(): void {
    const nodes = this.networkData.nodes;
    const edges = this.networkData.edges;
    
    if (nodes.length === 0) return;
    
    // Phase 1: Identify architectural hierarchy
    const hierarchy = this.calculateArchitecturalHierarchy(nodes, edges);
    
    // Phase 2: Create main rivers (primary execution flows)
    const rivers = this.createExecutionRivers(hierarchy, edges);
    
    // Phase 3: Position nodes along rivers with beautiful flow patterns
    this.positionNodesAlongRivers(nodes, rivers);
    
    // Phase 4: Add tributaries and organize supporting functions
    this.organizeRiverTributaries(nodes, edges, rivers);
    
    // Phase 5: Apply gentle physics for natural positioning
    this.applyRiverPhysics(nodes, edges);
  }

  private calculateArchitecturalHierarchy(nodes: NetworkNode[], edges: NetworkEdge[]): Map<string, number> {
    const hierarchy = new Map<string, number>();
    const incomingEdges = new Map<string, number>();
    const outgoingEdges = new Map<string, number>();
    
    // Count connections for each node
    nodes.forEach(node => {
      incomingEdges.set(node.id, 0);
      outgoingEdges.set(node.id, 0);
    });
    
    edges.forEach(edge => {
      incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
      outgoingEdges.set(edge.source, (outgoingEdges.get(edge.source) || 0) + 1);
    });
    
    // Calculate hierarchy level based on node importance and connections
    nodes.forEach(node => {
      const incoming = incomingEdges.get(node.id) || 0;
      const outgoing = outgoingEdges.get(node.id) || 0;
      
      let level = 0;
      
      // Entry points (high importance, few incoming) go to level 0
      if (node.importance > 0.8 && incoming <= 2) {
        level = 0;
      }
      // Core logic (many connections) goes to levels 1-2  
      else if (incoming + outgoing > 5) {
        level = 1 + Math.min(2, Math.floor(incoming / 3));
      }
      // Utilities and helpers go to outer levels
      else {
        level = 3 + Math.min(3, Math.floor(incoming / 2));
      }
      
      hierarchy.set(node.id, level);
    });
    
    return hierarchy;
  }

  private createExecutionRivers(hierarchy: Map<string, number>, edges: NetworkEdge[]): Array<Array<string>> {
    const rivers: Array<Array<string>> = [];
    const visited = new Set<string>();
    
    // Start rivers from entry points (level 0)
    const entryPoints = Array.from(hierarchy.entries())
      .filter(([_, level]) => level === 0)
      .map(([nodeId, _]) => nodeId);
    
    entryPoints.forEach(entry => {
      if (!visited.has(entry)) {
        const river = this.traceRiverPath(entry, edges, hierarchy, visited);
        if (river.length > 1) { // Only create rivers with multiple nodes
          rivers.push(river);
        }
      }
    });
    
    return rivers;
  }

  private traceRiverPath(startNode: string, edges: NetworkEdge[], hierarchy: Map<string, number>, visited: Set<string>): string[] {
    const path: string[] = [startNode];
    visited.add(startNode);
    
    let currentNode = startNode;
    const maxDepth = 10; // Prevent infinite loops
    
    for (let depth = 0; depth < maxDepth; depth++) {
      // Find the best next node in the flow
      const outgoingEdges = edges.filter(e => e.source === currentNode);
      
      if (outgoingEdges.length === 0) break;
      
      // Choose the strongest connection that flows downstream (higher hierarchy level)
      const bestEdge = outgoingEdges
        .filter(e => !visited.has(e.target))
        .filter(e => (hierarchy.get(e.target) || 0) >= (hierarchy.get(currentNode) || 0))
        .sort((a, b) => b.weight - a.weight)[0];
      
      if (!bestEdge) break;
      
      currentNode = bestEdge.target;
      path.push(currentNode);
      visited.add(currentNode);
    }
    
    return path;
  }

  private positionNodesAlongRivers(nodes: NetworkNode[], rivers: Array<Array<string>>): void {
    const _universeSize = 2000; // 3D universe dimensions
    
    // Create constellation patterns from rivers
    rivers.forEach((river, riverIndex) => {
      const constellationName = `River-${riverIndex}`;
      const constellationNodes: NetworkNode[] = [];
      
      // Position constellation in 3D space with beautiful spiral patterns
      const spiralRadius = 300 + riverIndex * 150;
      const spiralHeight = riverIndex * 200 - (rivers.length * 100);
      const spiralRotation = riverIndex * 0.8;
      
      river.forEach((nodeId, nodeIndex) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        // Create spiral constellation pattern
        const progress = nodeIndex / Math.max(1, river.length - 1);
        const angle = spiralRotation + progress * Math.PI * 4; // Multiple turns
        const radius = spiralRadius * (0.3 + progress * 0.7); // Expanding spiral
        const height = spiralHeight + Math.sin(progress * Math.PI * 2) * 100;
        
        // 3D positioning
        node.x = Math.cos(angle) * radius;
        node.y = Math.sin(angle) * radius;
        node.z = height;
        
        // Set stellar properties based on position and importance
        this.assignStellarClass(node, progress);
        
        // Assign to constellation
        node.constellation = constellationName;
        constellationNodes.push(node);
      });
      
      this.constellations.set(constellationName, constellationNodes);
    });
    
    // Create additional depth layers for non-river nodes
    this.createGalacticLayers(nodes, rivers);
  }

  private assignStellarClass(node: NetworkNode, progress: number): void {
    // Assign stellar class based on importance and position
    if (node.importance > 0.9 && progress < 0.2) {
      node.stellarClass = 'supergiant'; // Entry points
      node.luminosity = 1.0;
      node.size = Math.max(20, 25 + node.importance * 20);
    } else if (node.importance > 0.7) {
      node.stellarClass = 'giant'; // Important functions
      node.luminosity = 0.8;
      node.size = Math.max(15, 18 + node.importance * 15);
    } else if (node.connections > 3) {
      node.stellarClass = 'main-sequence'; // Active functions
      node.luminosity = 0.6;
      node.size = Math.max(10, 12 + node.importance * 10);
    } else if (node.complexity > 0.5) {
      node.stellarClass = 'white-dwarf'; // Complex but isolated
      node.luminosity = 0.4;
      node.size = Math.max(8, 10 + node.importance * 8);
    } else {
      node.stellarClass = 'neutron-star'; // Utility functions
      node.luminosity = 0.2;
      node.size = Math.max(6, 8 + node.importance * 6);
    }
  }

  private createGalacticLayers(nodes: NetworkNode[], rivers: Array<Array<string>>): void {
    const riverNodes = new Set(rivers.flat());
    const peripheralNodes = nodes.filter(n => !riverNodes.has(n.id));
    
    // Create different galactic structures for different node types
    const nodesByType = this.groupNodesByType(peripheralNodes);
    
    // Utilities form outer ring (like asteroid belt)
    if (nodesByType.utilities) {
      this.createAsteroidBelt(nodesByType.utilities, 800, 1200);
    }
    
    // Tests form protective shell (like Oort cloud)
    if (nodesByType.tests) {
      this.createOortCloud(nodesByType.tests, 1500, 2000);
    }
    
    // Interfaces and types form inner orbital rings
    if (nodesByType.interfaces) {
      this.createOrbitalRing(nodesByType.interfaces, 400, 600);
    }
  }

  private groupNodesByType(nodes: NetworkNode[]): Record<string, NetworkNode[]> {
    const groups: Record<string, NetworkNode[]> = {};
    
    nodes.forEach(node => {
      let category = 'utilities';
      
      if (node.name.toLowerCase().includes('test') || node.name.toLowerCase().includes('spec')) {
        category = 'tests';
      } else if (node.type === 'interface' || node.name.toLowerCase().includes('type')) {
        category = 'interfaces';
      } else if (node.name.toLowerCase().includes('util') || node.name.toLowerCase().includes('helper')) {
        category = 'utilities';
      }
      
      if (!groups[category]) groups[category] = [];
      groups[category].push(node);
    });
    
    return groups;
  }

  private createAsteroidBelt(nodes: NetworkNode[], innerRadius: number, outerRadius: number): void {
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2;
      const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
      const height = (Math.random() - 0.5) * 200;
      
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.z = height;
      node.stellarClass = 'neutron-star';
      node.luminosity = 0.3;
      node.size = Math.max(4, 6 + node.importance * 8);
    });
  }

  private createOortCloud(nodes: NetworkNode[], innerRadius: number, outerRadius: number): void {
    nodes.forEach((node, _index) => {
      // Random spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
      
      node.x = radius * Math.sin(phi) * Math.cos(theta);
      node.y = radius * Math.sin(phi) * Math.sin(theta);
      node.z = radius * Math.cos(phi);
      node.stellarClass = 'white-dwarf';
      node.luminosity = 0.2;
      node.size = Math.max(5, 7 + node.importance * 10);
    });
  }

  private createOrbitalRing(nodes: NetworkNode[], innerRadius: number, outerRadius: number): void {
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2;
      const radius = innerRadius + (index % 3) * ((outerRadius - innerRadius) / 3);
      const height = Math.sin(angle * 3) * 50; // Slight wave pattern
      
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.z = height;
      
      // Set orbital properties for animation
      node.orbitalRadius = radius;
      node.orbitalSpeed = 0.001 + Math.random() * 0.002;
      node.orbitalAngle = angle;
      
      node.stellarClass = 'main-sequence';
      node.luminosity = 0.5;
      node.size = Math.max(8, 10 + node.importance * 12);
    });
  }

  private organizeRiverTributaries(nodes: NetworkNode[], edges: NetworkEdge[], rivers: Array<Array<string>>): void {
    const riverNodes = new Set(rivers.flat());
    const tributaryNodes = nodes.filter(n => !riverNodes.has(n.id));
    
    tributaryNodes.forEach(node => {
      // Find the closest river node this tributary connects to
      const connectedRiverNodes = edges
        .filter(e => (e.source === node.id && riverNodes.has(e.target)) || 
                    (e.target === node.id && riverNodes.has(e.source)))
        .map(e => e.source === node.id ? e.target : e.source);
      
      if (connectedRiverNodes.length > 0) {
        // Position tributary near its connected river node
        const riverNodeId = connectedRiverNodes[0];
        const riverNode = nodes.find(n => n.id === riverNodeId);
        
        if (riverNode) {
          // Create tributary branching pattern
          const angle = Math.random() * Math.PI * 2;
          const distance = 80 + Math.random() * 40;
          
          node.x = riverNode.x + Math.cos(angle) * distance;
          node.y = riverNode.y + Math.sin(angle) * distance;
          node.size = Math.max(6, 8 + node.importance * 12);
        }
      } else {
        // Position isolated nodes in outer regions
        const angle = Math.random() * Math.PI * 2;
        const distance = 300 + Math.random() * 200;
        
        node.x = Math.cos(angle) * distance;
        node.y = Math.sin(angle) * distance;
        node.size = Math.max(5, 6 + node.importance * 10);
      }
    });
  }

  private applyRiverPhysics(nodes: NetworkNode[], edges: NetworkEdge[]): void {
    // Apply gentle physics to make the rivers look more natural
    for (let iteration = 0; iteration < 20; iteration++) {
      // Gentle repulsion to prevent overlap
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];
          
          const dx = node2.x - node1.x;
          const dy = node2.y - node1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = (node1.size + node2.size) * 1.5;
          
          if (distance > 0 && distance < minDistance) {
            const force = (minDistance - distance) * 0.1;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            
            node1.x -= fx;
            node1.y -= fy;
            node2.x += fx;
            node2.y += fy;
          }
        }
      }
      
      // Gentle attraction along edges to maintain connections
      edges.forEach(edge => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 150) { // Only attract if too far apart
            const force = (distance - 150) * 0.005 * edge.weight;
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;
            
            source.x += fx;
            source.y += fy;
            target.x -= fx;
            target.y -= fy;
          }
        }
      });
    }
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;
    
    // Mouse events for interaction
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    
    // Window resize
    window.addEventListener('resize', () => this.handleResize());
  }

  private startRenderLoop(): void {
    const render = (currentTime: number) => {
      // Update universe dynamics
      this.updateUniverseDynamics(currentTime);
      
      // Update camera and zoom transitions
      this.updateCameraSystem(currentTime);
      
      // Render the universe
      this.render();
      
      this.animationFrame = requestAnimationFrame(render);
    };
    
    requestAnimationFrame(render);
  }

  private updateUniverseDynamics(currentTime: number): void {
    // Animate orbital mechanics
    this.networkData.nodes.forEach(node => {
      if (node.orbitalRadius && node.orbitalSpeed && node.orbitalAngle !== undefined) {
        node.orbitalAngle += node.orbitalSpeed;
        node.x = Math.cos(node.orbitalAngle) * node.orbitalRadius;
        node.y = Math.sin(node.orbitalAngle) * node.orbitalRadius;
        
        // Add subtle vertical oscillation
        node.z += Math.sin(currentTime * 0.001 + node.orbitalAngle) * 0.5;
      }
    });
    
    // Animate stellar luminosity (twinkling effect)
    this.networkData.nodes.forEach(node => {
      if (node.stellarClass === 'supergiant') {
        node.luminosity = 0.8 + Math.sin(currentTime * 0.003) * 0.2;
      }
    });
  }

  private updateCameraSystem(_currentTime: number): void {
    // Handle zoom level transitions
    if (this.currentZoomLevel !== this.targetZoomLevel) {
      this.zoomTransition = Math.min(1, this.zoomTransition + 0.02);
      
      if (this.zoomTransition >= 1) {
        this.currentZoomLevel = this.targetZoomLevel;
        this.zoomTransition = 0;
      }
      
      // Interpolate camera position during zoom transition
      const targetPos = this.getZoomLevelCameraPosition(this.targetZoomLevel);
      this.camera.position = this.lerpVector3(this.camera.position, targetPos, this.zoomTransition);
    }
    
    // Apply camera physics (momentum-based movement)
    this.camera.position.x += this.camera.velocity.x;
    this.camera.position.y += this.camera.velocity.y;
    this.camera.position.z += this.camera.velocity.z;
    
    // Apply damping
    this.camera.velocity.x *= 0.95;
    this.camera.velocity.y *= 0.95;
    this.camera.velocity.z *= 0.95;
    
    // Update zoom level based on camera distance
    const distanceFromCenter = Math.sqrt(
      this.camera.position.x ** 2 + 
      this.camera.position.y ** 2 + 
      this.camera.position.z ** 2
    );
    
    this.updateZoomLevelFromDistance(distanceFromCenter);
  }

  private getZoomLevelCameraPosition(level: typeof this.currentZoomLevel): { x: number, y: number, z: number } {
    switch (level) {
      case 'galaxy':
        return { x: 0, y: 0, z: 2500 }; // Far out view of entire codebase
      case 'solar-system':
        return { x: 0, y: 0, z: 800 }; // Module-level view
      case 'planet':
        return { x: 0, y: 0, z: 300 }; // Class/function group view
      case 'surface':
        return { x: 0, y: 0, z: 100 }; // Individual function view
      default:
        return { x: 0, y: 0, z: 500 };
    }
  }

  private updateZoomLevelFromDistance(distance: number): void {
    let newLevel: typeof this.currentZoomLevel;
    
    if (distance > 2000) {
      newLevel = 'galaxy';
    } else if (distance > 600) {
      newLevel = 'solar-system';
    } else if (distance > 200) {
      newLevel = 'planet';
    } else {
      newLevel = 'surface';
    }
    
    if (newLevel !== this.currentZoomLevel) {
      this.targetZoomLevel = newLevel;
    }
  }

  private lerpVector3(a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }, t: number): { x: number, y: number, z: number } {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    };
  }

  // Revolutionary flight controls
  private flyToNode(node: NetworkNode): void {
    // Smooth camera flight to any node in the universe
    const targetDistance = 150; // Distance to view node comfortably
    const direction = { 
      x: node.x - this.camera.position.x, 
      y: node.y - this.camera.position.y, 
      z: node.z - this.camera.position.z 
    };
    
    const length = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    
    if (length > 0) {
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;
    }
    
    // Set target position
    this.camera.target = {
      x: node.x - direction.x * targetDistance,
      y: node.y - direction.y * targetDistance,
      z: node.z - direction.z * targetDistance
    };
    
    // Add momentum toward target
    this.camera.velocity.x += (this.camera.target.x - this.camera.position.x) * 0.01;
    this.camera.velocity.y += (this.camera.target.y - this.camera.position.y) * 0.01;
    this.camera.velocity.z += (this.camera.target.z - this.camera.position.z) * 0.01;
  }

  private flyThroughConstellation(constellationName: string): void {
    // Epic flight through a constellation following the flow
    const constellation = this.constellations.get(constellationName);
    if (!constellation || constellation.length === 0) return;
    
    // Create flight path through constellation
    let currentIndex = 0;
    const flightSpeed = 2;
    
    const flyThroughStep = () => {
      if (currentIndex >= constellation.length) return;
      
      const currentNode = constellation[currentIndex];
      this.flyToNode(currentNode);
      
      // Move to next node after reaching current one
      const distance = Math.sqrt(
        (this.camera.position.x - currentNode.x) ** 2 +
        (this.camera.position.y - currentNode.y) ** 2 +
        (this.camera.position.z - currentNode.z) ** 2
      );
      
      if (distance < 200) {
        currentIndex++;
        setTimeout(flyThroughStep, 1000 / flightSpeed);
      } else {
        setTimeout(flyThroughStep, 50);
      }
    };
    
    flyThroughStep();
  }

  private render(): void {
    if (!this.ctx || !this.canvas) return;
    
    const { width: _width, height: _height } = this.canvas;
    
    if (this.renderer) {
      // Use WebGPU/WebGL renderer for maximum performance
      this.renderer.render();
    } else {
      // Use Canvas 2D with 3D projection
      this.renderUniverse3D();
    }
  }

  private renderUniverse3D(): void {
    if (!this.ctx || !this.canvas) return;
    
    const { width: _width, height: _height } = this.canvas;
    
    // Clear with deep space background
    this.renderDeepSpaceBackground();
    
    // Calculate 3D projection matrix
    const projectionData = this.calculate3DProjection();
    
    // Sort nodes by distance from camera (far to near for proper depth)
    const sortedNodes = [...this.networkData.nodes].sort((a, b) => {
      const distA = this.getDistanceFromCamera(a);
      const distB = this.getDistanceFromCamera(b);
      return distB - distA; // Far to near
    });
    
    // Render constellation connections first (in 3D space)
    this.render3DConnections(projectionData);
    
    // Render nodes with perspective and stellar effects
    this.render3DNodes(sortedNodes, projectionData);
    
    // Render zoom level indicator and navigation aids
    this.renderNavigationAids();
    
    // Render UI overlay
    this.renderUI();
  }

  private renderDeepSpaceBackground(): void {
    if (!this.ctx || !this.canvas) return;
    
    const { width, height } = this.canvas;
    
    // Deep space gradient
    const gradient = this.ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height)
    );
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(0.7, '#050510');
    gradient.addColorStop(1, '#000005');
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
    
    // Add distant stars
    this.renderDistantStars();
  }

  private renderDistantStars(): void {
    if (!this.ctx) return;
    
    const { width, height } = this.canvas;
    
    // Generate consistent star field based on camera position
    const seed = Math.floor(this.camera.position.x / 100) + Math.floor(this.camera.position.y / 100);
    
    for (let i = 0; i < 200; i++) {
      const x = ((seed + i * 7) % 1000) / 1000 * width;
      const y = ((seed + i * 13) % 1000) / 1000 * height;
      const brightness = ((seed + i * 23) % 1000) / 1000 * 0.5 + 0.1;
      
      this.ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      this.ctx.fillRect(x, y, 1, 1);
    }
  }

  private calculate3DProjection(): { centerX: number, centerY: number, fov: number } {
    return {
      centerX: this.canvas.width / 2,
      centerY: this.canvas.height / 2,
      fov: 800 // Field of view constant
    };
  }

  private project3DTo2D(node: NetworkNode, projection: { centerX: number, centerY: number, fov: number }): { x: number, y: number, scale: number, visible: boolean } {
    // Translate relative to camera
    const relativeX = node.x - this.camera.position.x;
    const relativeY = node.y - this.camera.position.y;
    const relativeZ = node.z - this.camera.position.z;
    
    // Perspective projection
    if (relativeZ >= -50) { // Don't render if too close or behind camera
      return { x: 0, y: 0, scale: 0, visible: false };
    }
    
    const scale = projection.fov / -relativeZ;
    const screenX = projection.centerX + relativeX * scale;
    const screenY = projection.centerY + relativeY * scale;
    
    // Check if within screen bounds (with margin)
    const margin = 100;
    const visible = screenX > -margin && screenX < this.canvas.width + margin &&
                   screenY > -margin && screenY < this.canvas.height + margin;
    
    return { x: screenX, y: screenY, scale, visible };
  }

  private getDistanceFromCamera(node: NetworkNode): number {
    return Math.sqrt(
      (node.x - this.camera.position.x) ** 2 +
      (node.y - this.camera.position.y) ** 2 +
      (node.z - this.camera.position.z) ** 2
    );
  }

  private render3DConnections(projection: { centerX: number, centerY: number, fov: number }): void {
    if (!this.ctx) return;
    
    this.ctx.globalAlpha = 0.3;
    
    this.networkData.edges.forEach(edge => {
      const source = this.networkData.nodes.find(n => n.id === edge.source);
      const target = this.networkData.nodes.find(n => n.id === edge.target);
      
      if (source && target) {
        const sourceProjected = this.project3DTo2D(source, projection);
        const targetProjected = this.project3DTo2D(target, projection);
        
        if (sourceProjected.visible && targetProjected.visible) {
          // Color based on edge type and distance
          const avgDistance = (this.getDistanceFromCamera(source) + this.getDistanceFromCamera(target)) / 2;
          const alpha = Math.max(0.1, Math.min(0.6, 2000 / avgDistance));
          
          if (this.ctx) {
            this.ctx.strokeStyle = this.colorSchemes.relationships[edge.type] + 
                                  Math.floor(alpha * 255).toString(16).padStart(2, '0');
            this.ctx.lineWidth = Math.max(0.5, edge.weight * 2 * Math.min(sourceProjected.scale, targetProjected.scale));
            
            this.ctx.beginPath();
            this.ctx.moveTo(sourceProjected.x, sourceProjected.y);
            this.ctx.lineTo(targetProjected.x, targetProjected.y);
            this.ctx.stroke();
          }
        }
      }
    });
    
    this.ctx.globalAlpha = 1.0;
  }

  private render3DNodes(sortedNodes: NetworkNode[], projection: { centerX: number, centerY: number, fov: number }): void {
    if (!this.ctx) return;
    
    sortedNodes.forEach(node => {
      const projected = this.project3DTo2D(node, projection);
      
      if (!projected.visible) return;
      
      const distance = this.getDistanceFromCamera(node);
      const isHovered = node === this.hoveredNode;
      const isSelected = node === this.selectedNode;
      
      // Calculate size based on stellar class and distance
      let renderSize = node.size * projected.scale * 0.1;
      
      // Minimum size based on zoom level and importance
      const minSize = this.getMinNodeSize(node);
      renderSize = Math.max(minSize, renderSize);
      
      // Maximum size cap
      renderSize = Math.min(50, renderSize);
      
      // Skip if too small to see
      if (renderSize < 1) return;
      
      // Render stellar effects based on class
      this.renderStellarNode(node, projected.x, projected.y, renderSize, distance, isHovered, isSelected);
      
      // Render label for important nodes or when close
      if (this.shouldRenderLabel(node, distance, renderSize)) {
        this.render3DLabel(node, projected.x, projected.y + renderSize + 5, distance);
      }
    });
  }

  private getMinNodeSize(node: NetworkNode): number {
    switch (this.currentZoomLevel) {
      case 'galaxy':
        return node.stellarClass === 'supergiant' ? 3 : 1;
      case 'solar-system':
        return node.importance > 0.5 ? 4 : 2;
      case 'planet':
        return 6;
      case 'surface':
        return 8;
      default:
        return 3;
    }
  }

  private renderStellarNode(node: NetworkNode, x: number, y: number, size: number, distance: number, isHovered: boolean, isSelected: boolean): void {
    if (!this.ctx) return;
    
    // Calculate luminosity based on distance and stellar class
    const baseLuminosity = node.luminosity * Math.min(1, 5000 / distance);
    const alpha = Math.max(0.1, Math.min(1, baseLuminosity));
    
    // Render glow effect for bright stars
    if (node.stellarClass === 'supergiant' || node.stellarClass === 'giant') {
      this.renderStellarGlow(x, y, size * 2, node.color, alpha * 0.3);
    }
    
    // Main stellar body
    this.ctx.fillStyle = node.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    this.ctx.beginPath();
    this.ctx.arc(x, y, size, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Special effects for different stellar classes
    switch (node.stellarClass) {
      case 'supergiant':
        this.renderSupergiantCorona(x, y, size, node.color, alpha);
        break;
      case 'neutron-star':
        this.renderNeutronStarPulse(x, y, size, alpha);
        break;
      case 'white-dwarf':
        this.renderWhiteDwarfRing(x, y, size, alpha);
        break;
    }
    
    // Selection/hover effects
    if (isSelected || isHovered) {
      this.ctx.strokeStyle = isSelected ? '#ffffff' : '#cccccc';
      this.ctx.lineWidth = isSelected ? 3 : 2;
      this.ctx.stroke();
    }
  }

  private renderStellarGlow(x: number, y: number, radius: number, color: string, alpha: number): void {
    if (!this.ctx) return;
    
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
    gradient.addColorStop(1, color + '00');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private renderSupergiantCorona(x: number, y: number, size: number, color: string, alpha: number): void {
    if (!this.ctx) return;
    
    // Animated corona effect
    const time = performance.now() * 0.001;
    const coronaSize = size * (1.5 + Math.sin(time * 2) * 0.2);
    
    this.ctx.strokeStyle = color + Math.floor(alpha * 128).toString(16).padStart(2, '0');
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, coronaSize, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private renderNeutronStarPulse(x: number, y: number, size: number, alpha: number): void {
    if (!this.ctx) return;
    
    // Rapid pulse effect
    const time = performance.now() * 0.01;
    const pulseIntensity = Math.sin(time) * 0.5 + 0.5;
    
    this.ctx.fillStyle = `rgba(200, 200, 255, ${alpha * pulseIntensity})`;
    this.ctx.beginPath();
    this.ctx.arc(x, y, size * (1 + pulseIntensity * 0.3), 0, Math.PI * 2);
    this.ctx.fill();
  }

  private renderWhiteDwarfRing(x: number, y: number, size: number, alpha: number): void {
    if (!this.ctx) return;
    
    // Thin bright ring
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(x, y, size * 1.3, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private shouldRenderLabel(node: NetworkNode, distance: number, renderSize: number): boolean {
    // Show labels based on zoom level, importance, and size
    if (this.currentZoomLevel === 'surface') return true;
    if (this.currentZoomLevel === 'planet' && node.importance > 0.6) return true;
    if (this.currentZoomLevel === 'solar-system' && node.stellarClass === 'supergiant') return true;
    if (renderSize > 15 || node === this.hoveredNode || node === this.selectedNode) return true;
    
    return false;
  }

  private render3DLabel(node: NetworkNode, x: number, y: number, distance: number): void {
    if (!this.ctx) return;
    
    const alpha = Math.max(0.3, Math.min(1, 3000 / distance));
    const fontSize = Math.max(10, Math.min(16, 12 + (node.importance * 4)));
    
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    
    // Background for readability
    const textWidth = this.ctx.measureText(node.name).width;
    this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
    this.ctx.fillRect(x - textWidth / 2 - 2, y - 2, textWidth + 4, fontSize + 4);
    
    // Text
    this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    this.ctx.fillText(node.name, x, y);
  }

  private renderNavigationAids(): void {
    if (!this.ctx) return;
    
    // Zoom level indicator
    const zoomText = `${this.currentZoomLevel.toUpperCase()} VIEW`;
    this.ctx.font = '14px Arial';
    this.ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(zoomText, 20, this.canvas.height - 60);
    
    // Camera position indicator (like GPS in space)
    const cameraInfo = `X: ${Math.round(this.camera.position.x)} Y: ${Math.round(this.camera.position.y)} Z: ${Math.round(this.camera.position.z)}`;
    this.ctx.font = '10px monospace';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.fillText(cameraInfo, 20, this.canvas.height - 40);
  }

  private renderEdges(): void {
    if (!this.ctx) return;
    
    this.ctx.globalAlpha = 0.6;
    this.ctx.lineWidth = 1;
    
    this.networkData.edges.forEach(edge => {
      const source = this.networkData.nodes.find(n => n.id === edge.source);
      const target = this.networkData.nodes.find(n => n.id === edge.target);
      
      if (source && target) {
        // Color based on relationship type
        if (this.ctx) {
          this.ctx.strokeStyle = this.colorSchemes.relationships[edge.type];
          this.ctx.lineWidth = Math.max(1, edge.weight * 3);
          
          this.ctx.beginPath();
          this.ctx.moveTo(source.x, source.y);
          this.ctx.lineTo(target.x, target.y);
          this.ctx.stroke();
        }
        
        // Add arrow for directed relationships
        if (edge.type === 'calls' || edge.type === 'inherits') {
          this.drawArrow(source.x, source.y, target.x, target.y, edge.weight * 8);
        }
      }
    });
    
    this.ctx.globalAlpha = 1.0;
  }

  private renderNodes(): void {
    if (!this.ctx) return;
    
    this.networkData.nodes.forEach(node => {
      const isHovered = node === this.hoveredNode;
      const isSelected = node === this.selectedNode;
      
      // Node background with glow effect
      if (isHovered || isSelected) {
        const glowColor = this.colorSchemes.languages[node.language as keyof typeof this.colorSchemes.languages]?.glow || '#ffffff';
        this.drawGlow(node.x, node.y, node.size * 1.5, glowColor);
      }
      
      // Main node circle
      if (this.ctx) {
        this.ctx.fillStyle = node.color;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Node border
        this.ctx.strokeStyle = isSelected ? '#ffffff' : (isHovered ? '#cccccc' : 'rgba(255,255,255,0.3)');
        this.ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
        this.ctx.stroke();
      }
      
      // Complexity indicator (inner circle)
      if (node.complexity > 0.5) {
        const complexityColor = node.complexity > 0.8 ? 
          this.colorSchemes.complexity.critical.primary : 
          this.colorSchemes.complexity.high.primary;
        
        if (this.ctx) {
          this.ctx.fillStyle = complexityColor;
          this.ctx.beginPath();
          this.ctx.arc(node.x, node.y, node.size * 0.3, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
      
      // Node label (for important nodes or when zoomed in)
      if (node.importance > 0.7 || this.zoomLevel > 1.5 || isHovered || isSelected) {
        this.renderNodeLabel(node);
      }
    });
  }

  private renderNodeLabel(node: NetworkNode): void {
    if (!this.ctx) return;
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `${Math.max(10, 12 * this.zoomLevel)}px Arial`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    // Background for readability
    const textWidth = this.ctx.measureText(node.name).width;
    this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
    this.ctx.fillRect(
      node.x - textWidth / 2 - 4,
      node.y + node.size + 8,
      textWidth + 8,
      16
    );
    
    // Text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(node.name, node.x, node.y + node.size + 16);
  }

  private drawGlow(x: number, y: number, radius: number, color: string): void {
    if (!this.ctx) return;
    
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color + '00');
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawArrow(x1: number, y1: number, x2: number, y2: number, size: number): void {
    if (!this.ctx) return;
    
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = Math.max(8, size);
    
    // Position arrow at target node edge
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const targetNode = this.networkData.nodes.find(n => n.x === x2 && n.y === y2);
    const offset = targetNode ? targetNode.size + 5 : 10;
    
    const arrowX = x1 + (x2 - x1) * (distance - offset) / distance;
    const arrowY = y1 + (y2 - y1) * (distance - offset) / distance;
    
    this.ctx.beginPath();
    this.ctx.moveTo(arrowX, arrowY);
    this.ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.moveTo(arrowX, arrowY);
    this.ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
      arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.stroke();
  }

  private renderUI(): void {
    if (!this.ctx || !this.canvas) return;
    
    // UI background
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
    this.ctx.fillRect(10, 10, 300, 200);
    
    // Metrics display
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    
    let y = 25;
    const lineHeight = 18;
    
    this.ctx.fillText(`Symbols: ${this.metrics.totalSymbols}`, 20, y);
    y += lineHeight;
    
    this.ctx.fillText(`Relationships: ${this.metrics.totalRelationships}`, 20, y);
    y += lineHeight;
    
    this.ctx.fillText(`Avg Complexity: ${this.metrics.complexityMetrics.averageComplexity.toFixed(2)}`, 20, y);
    y += lineHeight;
    
    this.ctx.fillText(`Architecture Score: ${this.metrics.complexityMetrics.architecturalScore.toFixed(2)}`, 20, y);
    y += lineHeight;
    
    // Language distribution
    y += 10;
    this.ctx.fillText('Languages:', 20, y);
    y += lineHeight;
    
    Object.entries(this.metrics.languageDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([lang, count]) => {
        this.ctx!.fillStyle = this.getLanguageColor(lang);
        this.ctx!.fillRect(20, y, 12, 12);
        this.ctx!.fillStyle = '#ffffff';
        this.ctx!.fillText(`${lang}: ${count}`, 40, y);
        y += lineHeight;
      });
    
    // Selected node details
    if (this.selectedNode) {
      this.renderSelectedNodeDetails();
    }
  }

  private renderSelectedNodeDetails(): void {
    if (!this.ctx || !this.canvas || !this.selectedNode) return;
    
    const panel = {
      x: this.canvas.width - 320,
      y: 10,
      width: 300,
      height: 250
    };
    
    // Panel background
    this.ctx.fillStyle = 'rgba(0,0,0,0.9)';
    this.ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    
    // Panel border
    this.ctx.strokeStyle = this.selectedNode.color;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
    
    // Node details
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    
    let y = panel.y + 15;
    const lineHeight = 20;
    
    this.ctx.fillText(this.selectedNode.name, panel.x + 10, y);
    y += lineHeight + 5;
    
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = '#cccccc';
    
    this.ctx.fillText(`Type: ${this.selectedNode.type}`, panel.x + 10, y);
    y += lineHeight;
    
    this.ctx.fillText(`Language: ${this.selectedNode.language}`, panel.x + 10, y);
    y += lineHeight;
    
    this.ctx.fillText(`Complexity: ${(this.selectedNode.complexity * 100).toFixed(1)}%`, panel.x + 10, y);
    y += lineHeight;
    
    this.ctx.fillText(`Connections: ${this.selectedNode.connections}`, panel.x + 10, y);
    y += lineHeight;
    
    this.ctx.fillText(`Importance: ${(this.selectedNode.importance * 100).toFixed(1)}%`, panel.x + 10, y);
    y += lineHeight;
    
    // Complexity bar
    y += 10;
    this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
    this.ctx.fillRect(panel.x + 10, y, panel.width - 20, 10);
    
    const complexityColor = this.selectedNode.complexity > 0.8 ? '#f44336' : 
                           this.selectedNode.complexity > 0.5 ? '#ff9800' : '#4caf50';
    this.ctx.fillStyle = complexityColor;
    this.ctx.fillRect(panel.x + 10, y, (panel.width - 20) * this.selectedNode.complexity, 10);
  }

  // Event handlers
  private handleClick(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.canvas.width / 2 - this.panOffset.x) / this.zoomLevel;
    const y = (event.clientY - rect.top - this.canvas.height / 2 - this.panOffset.y) / this.zoomLevel;
    
    // Find clicked node
    const clickedNode = this.networkData.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= node.size;
    });
    
    this.selectedNode = clickedNode || null;
  }

  private handleMouseMove(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.canvas.width / 2 - this.panOffset.x) / this.zoomLevel;
    const y = (event.clientY - rect.top - this.canvas.height / 2 - this.panOffset.y) / this.zoomLevel;
    
    // Find hovered node
    const hoveredNode = this.networkData.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= node.size;
    });
    
    this.hoveredNode = hoveredNode || null;
    
    // Update cursor
    this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'default';
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    this.zoomLevel = Math.max(0.1, Math.min(3.0, this.zoomLevel * zoomFactor));
  }

  private handleKeyboard(event: KeyboardEvent): void {
    const speed = 20;
    const _rotationSpeed = 0.05;
    
    switch (event.key) {
      case 'Escape':
        this.selectedNode = null;
        break;
      
      // Camera movement (WASD + QE for up/down)
      case 'w':
      case 'W':
        this.camera.velocity.z -= speed;
        break;
      case 's':
      case 'S':
        this.camera.velocity.z += speed;
        break;
      case 'a':
      case 'A':
        this.camera.velocity.x -= speed;
        break;
      case 'd':
      case 'D':
        this.camera.velocity.x += speed;
        break;
      case 'q':
      case 'Q':
        this.camera.velocity.y -= speed;
        break;
      case 'e':
      case 'E':
        this.camera.velocity.y += speed;
        break;
        
      // Zoom level shortcuts
      case '1':
        this.targetZoomLevel = 'galaxy';
        break;
      case '2':
        this.targetZoomLevel = 'solar-system';
        break;
      case '3':
        this.targetZoomLevel = 'planet';
        break;
      case '4':
        this.targetZoomLevel = 'surface';
        break;
        
      // Reset camera to origin
      case 'r':
      case 'R':
        this.camera.position = { x: 0, y: 0, z: 500 };
        this.camera.velocity = { x: 0, y: 0, z: 0 };
        this.targetZoomLevel = 'galaxy';
        break;
        
      // Fly to random constellation
      case 'f':
      case 'F': {
        const constellationNames = Array.from(this.constellations.keys());
        if (constellationNames.length > 0) {
          const randomConstellation = constellationNames[Math.floor(Math.random() * constellationNames.length)];
          this.flyThroughConstellation(randomConstellation);
        }
        break;
      }
        
      // Boost mode (hold shift for faster movement)
      case 'Shift':
        // Boost is handled by checking if shift is pressed during movement
        break;
        
      // Find and fly to most important node
      case 'h':
      case 'H': {
        const mostImportant = this.networkData.nodes
          .filter(n => n.importance > 0.8)
          .sort((a, b) => b.importance - a.importance)[0];
        if (mostImportant) {
          this.flyToNode(mostImportant);
          this.selectedNode = mostImportant;
        }
        break;
      }
    }
    
    // Apply boost if shift is held
    if (event.shiftKey) {
      this.camera.velocity.x *= 3;
      this.camera.velocity.y *= 3;
      this.camera.velocity.z *= 3;
    }
  }

  private handleResize(): void {
    this.setupHighDPICanvas();
  }

  // Utility methods
  private setupHighDPICanvas(): void {
    if (!this.canvas) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
    
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }


  private updateElement(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  private updateMetricsDisplay(): void {
    // Update HTML elements if they exist
    const elements = [
      { id: 'symbol-count', value: this.metrics.totalSymbols },
      { id: 'relation-count', value: this.metrics.totalRelationships },
      { id: 'fps', value: Math.round(1000 / 16) } // Approximate
    ];
    
    elements.forEach(({ id, value }) => {
      this.updateElement(id, value.toString());
    });
  }

  private updateStatus(message: string, connected: boolean): void {
    const statusEl = document.querySelector('.status-text');
    if (statusEl) statusEl.textContent = message;
    
    const indicator = document.getElementById('status-indicator');
    if (indicator) {
      indicator.classList.toggle('connected', connected);
    }
  }

  private showError(error: any): void {
    console.error('Dashboard error:', error);
    
    // Show error in UI
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = `Error: ${error.message || error}`;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(244, 67, 54, 0.9);
      color: white;
      padding: 15px;
      border-radius: 5px;
      z-index: 1000;
      max-width: 400px;
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => errorDiv.remove(), 5000);
  }

  // Public API
  public destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.renderer = null;
    this.mcpBridge?.disconnect();
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new EnhancedDashboard();
    (window as any).enhancedDashboard = dashboard;
    dashboard.init();
  });
} else {
  const dashboard = new EnhancedDashboard();
  (window as any).enhancedDashboard = dashboard;
  dashboard.init();
}