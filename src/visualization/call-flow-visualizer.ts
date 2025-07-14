import Database from 'better-sqlite3';
import * as path from 'path';

interface FlowNode {
  id: string;
  name: string;
  fullPath: string;
  type: 'class' | 'function' | 'method';
  stage?: string;
  level: number;
  x?: number;
  y?: number;
  symbolCount: number;
  isKeyPath: boolean;
}

interface FlowEdge {
  source: string;
  target: string;
  type: 'calls' | 'uses' | 'inherits' | 'creates';
  count: number;
  isKeyPath: boolean;
}

export class CallFlowVisualizer {
  private db: Database.Database;
  private visitedNodes = new Set<string>();
  private keyPathNodes = new Set<string>();
  private flowNodes = new Map<string, FlowNode>();
  private flowEdges: FlowEdge[] = [];

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Trace the complete call flow from a starting point
   */
  async traceCallFlow(startSymbol: string, maxDepth: number = 10): Promise<{ nodes: FlowNode[], edges: FlowEdge[] }> {
    console.log(`Tracing call flow from: ${startSymbol}`);
    
    // Find the starting symbol
    const startingPoint = this.db.prepare(`
      SELECT id, name, qualified_name, file_path, kind, parent_class, pipeline_stage
      FROM enhanced_symbols 
      WHERE name = ? OR qualified_name = ? OR qualified_name LIKE ?
      ORDER BY 
        CASE 
          WHEN qualified_name = ? THEN 1
          WHEN name = ? THEN 2
          ELSE 3
        END
      LIMIT 1
    `).get(startSymbol, startSymbol, `%::${startSymbol}`, startSymbol, startSymbol) as any;

    if (!startingPoint) {
      throw new Error(`Starting symbol '${startSymbol}' not found`);
    }

    console.log(`Found starting point: ${startingPoint.qualified_name} (ID: ${startingPoint.id})`);

    // Start tracing
    await this.traceFromSymbol(startingPoint.id, 0, maxDepth, true);
    
    // Layout the graph
    this.layoutGraph();
    
    return {
      nodes: Array.from(this.flowNodes.values()),
      edges: this.flowEdges
    };
  }

  private async traceFromSymbol(symbolId: number, level: number, maxDepth: number, isKeyPath: boolean) {
    if (level > maxDepth || this.visitedNodes.has(symbolId.toString())) {
      return;
    }

    this.visitedNodes.add(symbolId.toString());

    // Get symbol info
    const symbol = this.db.prepare(`
      SELECT id, name, qualified_name, file_path, kind, parent_class, pipeline_stage
      FROM enhanced_symbols 
      WHERE id = ?
    `).get(symbolId) as any;

    if (!symbol) return;

    // Create node
    const nodeId = `${symbol.file_path}::${symbol.qualified_name || symbol.name}`;
    if (!this.flowNodes.has(nodeId)) {
      this.flowNodes.set(nodeId, {
        id: nodeId,
        name: symbol.qualified_name || symbol.name,
        fullPath: symbol.file_path,
        type: symbol.kind as any,
        stage: symbol.pipeline_stage,
        level,
        symbolCount: 1,
        isKeyPath
      });
    }

    if (isKeyPath) {
      this.keyPathNodes.add(nodeId);
    }

    // Find all outgoing relationships (what this symbol calls/uses)
    const outgoing = this.db.prepare(`
      SELECT 
        sr.to_symbol_id,
        sr.relationship_type,
        sr.confidence,
        s2.name as target_name,
        s2.qualified_name as target_qualified_name,
        s2.file_path as target_file,
        s2.kind as target_kind,
        s2.pipeline_stage as target_stage
      FROM symbol_relationships sr
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.from_symbol_id = ?
        AND sr.confidence > 0.5
        AND sr.relationship_type IN ('calls', 'uses', 'creates')
      ORDER BY sr.confidence DESC
      LIMIT 100
    `).all(symbolId) as any[];

    console.log(`Symbol ${symbol.name} has ${outgoing.length} outgoing relationships`);

    for (const rel of outgoing) {
      const targetNodeId = `${rel.target_file}::${rel.target_qualified_name || rel.target_name}`;
      
      // Add edge
      const edgeKey = `${nodeId}->${targetNodeId}`;
      const existingEdge = this.flowEdges.find(e => e.source === nodeId && e.target === targetNodeId);
      
      if (!existingEdge) {
        this.flowEdges.push({
          source: nodeId,
          target: targetNodeId,
          type: rel.relationship_type,
          count: 1,
          isKeyPath: isKeyPath && this.isKeyPathTarget(rel)
        });
      } else {
        existingEdge.count++;
      }

      // Recursively trace if this is a key path
      if (isKeyPath && this.isKeyPathTarget(rel)) {
        await this.traceFromSymbol(rel.to_symbol_id, level + 1, maxDepth, true);
      } else if (level < 2) {
        // Trace non-key paths only for first 2 levels
        await this.traceFromSymbol(rel.to_symbol_id, level + 1, maxDepth, false);
      }
    }

    // Also find incoming relationships for context
    if (level < 3) {
      const incoming = this.db.prepare(`
        SELECT 
          sr.from_symbol_id,
          sr.relationship_type,
          s1.name as source_name,
          s1.qualified_name as source_qualified_name,
          s1.file_path as source_file,
          s1.pipeline_stage as source_stage
        FROM symbol_relationships sr
        JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
        WHERE sr.to_symbol_id = ?
          AND sr.confidence > 0.8
          AND sr.relationship_type IN ('calls', 'uses')
        LIMIT 10
      `).all(symbolId) as any[];

      for (const rel of incoming) {
        const sourceNodeId = `${rel.source_file}::${rel.source_qualified_name || rel.source_name}`;
        
        if (!this.flowNodes.has(sourceNodeId)) {
          this.flowNodes.set(sourceNodeId, {
            id: sourceNodeId,
            name: rel.source_qualified_name || rel.source_name,
            fullPath: rel.source_file,
            type: 'method',
            stage: rel.source_stage,
            level: level - 1,
            symbolCount: 1,
            isKeyPath: false
          });
        }

        // Add edge
        this.flowEdges.push({
          source: sourceNodeId,
          target: nodeId,
          type: rel.relationship_type,
          count: 1,
          isKeyPath: false
        });
      }
    }
  }

  private isKeyPathTarget(rel: any): boolean {
    // Determine if this relationship leads to a key system
    const keyPatterns = [
      // Rendering pipeline
      /render|draw|vulkan|gpu|shader|pipeline|swapchain/i,
      // Planet generation
      /generate|terrain|planet|noise|heightmap|procgen/i,
      // GUI/Application
      /gui|window|event|input|feedback|application/i,
      // Core systems
      /initialize|update|process|compute|execute/i
    ];

    const targetName = rel.target_qualified_name || rel.target_name;
    const targetFile = rel.target_file;

    return keyPatterns.some(pattern => 
      pattern.test(targetName) || pattern.test(targetFile)
    );
  }

  private layoutGraph() {
    // Group nodes by level and stage
    const levels = new Map<number, FlowNode[]>();
    
    for (const node of this.flowNodes.values()) {
      if (!levels.has(node.level)) {
        levels.set(node.level, []);
      }
      levels.get(node.level)!.push(node);
    }

    // Layout each level
    const levelHeight = 150;
    const baseNodeWidth = 200;
    
    for (const [level, nodes] of levels) {
      const y = 100 + level * levelHeight;
      
      // Group by stage
      const stageGroups = new Map<string, FlowNode[]>();
      for (const node of nodes) {
        const stage = node.stage || 'unknown';
        if (!stageGroups.has(stage)) {
          stageGroups.set(stage, []);
        }
        stageGroups.get(stage)!.push(node);
      }

      // Layout each stage group
      let currentX = 100;
      for (const [stage, stageNodes] of stageGroups) {
        for (let i = 0; i < stageNodes.length; i++) {
          stageNodes[i].x = currentX + i * (baseNodeWidth + 50);
          stageNodes[i].y = y;
        }
        currentX += stageNodes.length * (baseNodeWidth + 50) + 100;
      }
    }
  }

  /**
   * Generate an interactive HTML visualization of the call flow
   */
  async generateCallFlowHTML(startSymbol: string): Promise<string> {
    const { nodes, edges } = await this.traceCallFlow(startSymbol);
    
    // Get statistics
    const stats = {
      totalNodes: nodes.length,
      keyPathNodes: nodes.filter(n => n.isKeyPath).length,
      totalEdges: edges.length,
      stages: [...new Set(nodes.map(n => n.stage).filter(Boolean))].sort()
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Call Flow: ${startSymbol} - Planet ProcGen</title>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/webcola@3.4.0/WebCola/cola.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape-cola@2.5.1/cytoscape-cola.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: #0a0a0a;
            color: #e0e0e0;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            height: 100vh;
        }
        
        #cy {
            flex: 1;
            background: radial-gradient(circle at center, #1a1a2e 0%, #0a0a0a 100%);
        }
        
        .sidebar {
            width: 320px;
            background: rgba(20, 20, 30, 0.95);
            backdrop-filter: blur(10px);
            padding: 20px;
            overflow-y: auto;
            border-left: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: -5px 0 20px rgba(0, 0, 0, 0.5);
        }
        
        .header {
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
            letter-spacing: -0.5px;
        }
        
        .stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .stat-value {
            font-size: 28px;
            font-weight: 600;
            background: linear-gradient(45deg, #00ff88, #0088ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .controls {
            margin-bottom: 30px;
        }
        
        .control-group {
            margin-bottom: 20px;
        }
        
        .control-group label {
            display: block;
            margin-bottom: 8px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #888;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        button {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        
        button:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
        }
        
        button.active {
            background: linear-gradient(45deg, #00ff88, #0088ff);
            border-color: transparent;
            color: #000;
        }
        
        .legend {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .legend h3 {
            font-size: 14px;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #888;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            font-size: 13px;
        }
        
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
            margin-right: 10px;
        }
        
        .info-panel {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(20, 20, 30, 0.9);
            backdrop-filter: blur(10px);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-width: 400px;
            display: none;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }
        
        .info-panel h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            font-weight: 400;
        }
        
        .info-panel .details {
            font-size: 13px;
            line-height: 1.6;
            color: #ccc;
        }
        
        .search-box {
            width: 100%;
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            margin-bottom: 10px;
        }
        
        .search-box::placeholder {
            color: #666;
        }
        
        .tooltip {
            position: absolute;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            z-index: 9999;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="cy"></div>
        
        <div class="sidebar">
            <div class="header">
                <h1>Call Flow Analysis</h1>
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalNodes}</div>
                    <div class="stat-label">Total Nodes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.keyPathNodes}</div>
                    <div class="stat-label">Key Path Nodes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.totalEdges}</div>
                    <div class="stat-label">Dependencies</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.stages.length}</div>
                    <div class="stat-label">Stages</div>
                </div>
            </div>
            
            <div class="controls">
                <div class="control-group">
                    <label>Search</label>
                    <input type="text" class="search-box" placeholder="Search nodes..." id="searchBox">
                </div>
                
                <div class="control-group">
                    <label>Layout</label>
                    <div class="button-group">
                        <button onclick="changeLayout('dagre')" class="active">Hierarchical</button>
                        <button onclick="changeLayout('cola')">Force</button>
                        <button onclick="changeLayout('breadthfirst')">Tree</button>
                    </div>
                </div>
                
                <div class="control-group">
                    <label>View</label>
                    <div class="button-group">
                        <button onclick="toggleKeyPath()" id="keyPathBtn">Key Path Only</button>
                        <button onclick="cy.fit()">Fit</button>
                        <button onclick="cy.reset()">Reset</button>
                    </div>
                </div>
                
                <div class="control-group">
                    <label>Highlight Stage</label>
                    <div class="button-group" style="flex-wrap: wrap;">
                        <button onclick="highlightStage(null)">All</button>
                        ${stats.stages.map(stage => 
                          `<button onclick="highlightStage('${stage}')">${stage?.replace(/_/g, ' ') || stage}</button>`
                        ).join('')}
                    </div>
                </div>
            </div>
            
            <div class="legend">
                <h3>Legend</h3>
                <div class="legend-item">
                    <div class="legend-color" style="background: #00ff88;"></div>
                    <span>Key Path Node</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #0088ff;"></div>
                    <span>Regular Node</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #ff0088;"></div>
                    <span>Entry Point</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: rgba(255, 255, 255, 0.5);"></div>
                    <span>Calls Relationship</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: rgba(0, 255, 136, 0.5);"></div>
                    <span>Key Path Flow</span>
                </div>
            </div>
        </div>
    </div>
    
    <div class="info-panel" id="infoPanel">
        <h3 id="infoTitle"></h3>
        <div class="details" id="infoDetails"></div>
    </div>
    
    <div class="tooltip" id="tooltip" style="display: none;"></div>
    
    <script>
        // Graph data
        const graphData = {
            nodes: ${JSON.stringify(nodes.map(n => ({
                data: {
                    id: n.id,
                    label: n.name.split('::').pop(),
                    fullName: n.name,
                    type: n.type,
                    stage: n.stage || 'unknown',
                    level: n.level,
                    isKeyPath: n.isKeyPath,
                    filePath: n.fullPath,
                    fileName: n.fullPath.split('/').pop()
                }
            })))},
            edges: ${JSON.stringify(edges.map(e => ({
                data: {
                    id: e.source + '-' + e.target,
                    source: e.source,
                    target: e.target,
                    type: e.type,
                    weight: e.count,
                    isKeyPath: e.isKeyPath
                }
            })))}
        };
        
        // Global variables
        let cy;
        let showKeyPathOnly = false;
        
        // Layout functions
        function changeLayout(layoutName) {
            // Update button states
            document.querySelectorAll('.button-group button').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            const layoutOptions = {
                dagre: {
                    name: 'dagre',
                    rankDir: 'TB',
                    nodeSep: 100,
                    rankSep: 150,
                    padding: 50
                },
                cola: {
                    name: 'cola',
                    nodeSpacing: 50,
                    edgeLength: 200,
                    maxSimulationTime: 2000
                },
                breadthfirst: {
                    name: 'breadthfirst',
                    directed: true,
                    padding: 50,
                    spacingFactor: 1.5
                }
            };
            
            cy.layout(layoutOptions[layoutName]).run();
        }
        
        function toggleKeyPath() {
            showKeyPathOnly = !showKeyPathOnly;
            document.getElementById('keyPathBtn').classList.toggle('active');
            
            if (showKeyPathOnly) {
                cy.elements().hide();
                cy.nodes('[isKeyPath = true]').show();
                cy.edges().filter(function(edge) {
                    return edge.source().data('isKeyPath') && edge.target().data('isKeyPath');
                }).show();
            } else {
                cy.elements().show();
            }
        }
        
        function highlightStage(stage) {
            cy.elements().removeClass('highlighted dimmed');
            
            if (stage !== 'all') {
                cy.nodes().forEach(function(node) {
                    if (node.data('stage') === stage) {
                        node.addClass('highlighted');
                    } else {
                        node.addClass('dimmed');
                    }
                });
                
                cy.edges().forEach(function(edge) {
                    const sourceStage = edge.source().data('stage');
                    const targetStage = edge.target().data('stage');
                    if (sourceStage === stage || targetStage === stage) {
                        edge.addClass('highlighted');
                    } else {
                        edge.addClass('dimmed');
                    }
                });
            }
        }

        // Initialize Cytoscape
        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: graphData,
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'background-color': ele => {
                            if (ele.data('level') === 0) return '#ff0088';
                            if (ele.data('isKeyPath')) return '#00ff88';
                            return '#0088ff';
                        },
                        'width': ele => 30 + Math.sqrt(ele.degree()) * 10,
                        'height': ele => 30 + Math.sqrt(ele.degree()) * 10,
                        'font-size': '12px',
                        'color': '#fff',
                        'text-outline-color': '#000',
                        'text-outline-width': 2,
                        'border-width': ele => ele.data('isKeyPath') ? 3 : 1,
                        'border-color': '#fff',
                        'opacity': 0.9
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'background-color': '#fff',
                        'color': '#000',
                        'border-width': 4,
                        'border-color': '#00ff88',
                        'z-index': 999
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': ele => Math.min(1 + Math.log(ele.data('weight')), 5),
                        'line-color': ele => ele.data('isKeyPath') ? '#00ff88' : '#666',
                        'target-arrow-color': ele => ele.data('isKeyPath') ? '#00ff88' : '#666',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'opacity': ele => ele.data('isKeyPath') ? 0.8 : 0.4,
                        'arrow-scale': 1.2
                    }
                },
                {
                    selector: 'edge:selected',
                    style: {
                        'line-color': '#fff',
                        'target-arrow-color': '#fff',
                        'opacity': 1,
                        'z-index': 999
                    }
                },
                {
                    selector: '.highlighted',
                    style: {
                        'background-color': '#ffd700',
                        'border-color': '#ffd700',
                        'opacity': 1,
                        'z-index': 1000
                    }
                },
                {
                    selector: '.dimmed',
                    style: {
                        'opacity': 0.2
                    }
                }
            ],
            layout: {
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 100,
                rankSep: 150,
                padding: 50
            },
            minZoom: 0.1,
            maxZoom: 3,
            wheelSensitivity: 0.2
        });
        
        // Event handlers
        cy.on('tap', 'node', function(evt) {
            const node = evt.target;
            const data = node.data();
            
            document.getElementById('infoTitle').textContent = data.fullName;
            document.getElementById('infoDetails').innerHTML = 
                '<strong>Type:</strong> ' + data.type + '<br>' +
                '<strong>Stage:</strong> ' + data.stage + '<br>' +
                '<strong>File:</strong> ' + data.fileName + '<br>' +
                '<strong>Level:</strong> ' + data.level + '<br>' +
                '<strong>Connections:</strong> ' + node.degree() + '<br>' +
                '<strong>Key Path:</strong> ' + (data.isKeyPath ? 'Yes' : 'No');
            
            document.getElementById('infoPanel').style.display = 'block';
            
            // Highlight connected nodes
            cy.elements().addClass('dimmed');
            node.removeClass('dimmed');
            node.neighborhood().removeClass('dimmed');
        });
        
        cy.on('tap', function(evt) {
            if (evt.target === cy) {
                document.getElementById('infoPanel').style.display = 'none';
                cy.elements().removeClass('dimmed');
            }
        });
        
        // Search functionality
        document.getElementById('searchBox').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            
            if (searchTerm) {
                cy.elements().addClass('dimmed');
                cy.nodes().forEach(node => {
                    if (node.data('fullName').toLowerCase().includes(searchTerm) ||
                        node.data('fileName').toLowerCase().includes(searchTerm)) {
                        node.removeClass('dimmed');
                        node.addClass('highlighted');
                    }
                });
            } else {
                cy.elements().removeClass('dimmed highlighted');
            }
        });
        
        // Mouse hover for edges
        cy.on('mouseover', 'edge', function(evt) {
            const edge = evt.target;
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML = edge.data('type') + ': ' + edge.data('weight') + ' connections';
            tooltip.style.display = 'block';
        });
        
        cy.on('mouseout', 'edge', function() {
            document.getElementById('tooltip').style.display = 'none';
        });
        
        document.addEventListener('mousemove', function(e) {
            const tooltip = document.getElementById('tooltip');
            if (tooltip.style.display === 'block') {
                tooltip.style.left = e.pageX + 10 + 'px';
                tooltip.style.top = e.pageY - 25 + 'px';
            }
        });
    </script>
</body>
</html>`;

    return html;
  }

  close() {
    this.db.close();
  }
}