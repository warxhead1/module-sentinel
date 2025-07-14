import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';

interface Node {
  id: string;
  name: string;
  type: 'file' | 'class' | 'function' | 'namespace' | 'module';
  size: number;
  stage?: string;
  children?: Node[];
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  metrics?: {
    symbols: number;
    dependencies: number;
    complexity?: number;
    antipatterns?: string[];
  };
}

interface Edge {
  source: string;
  target: string;
  type: 'uses' | 'inherits' | 'calls' | 'implements';
  weight: number;
}

export class ProjectVisualizer {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Generate a hierarchical tree structure of the project
   */
  async generateProjectTree(): Promise<Node> {
    // Get all files grouped by directory
    const files = this.db.prepare(`
      SELECT DISTINCT 
        file_path,
        pipeline_stage,
        COUNT(*) as symbol_count
      FROM enhanced_symbols
      GROUP BY file_path
      ORDER BY file_path
    `).all() as any[];

    // Build directory tree
    const root: Node = {
      id: 'root',
      name: 'planet_procgen',
      type: 'module',
      size: 0,
      children: []
    };

    const dirMap = new Map<string, Node>();
    dirMap.set('', root);

    for (const file of files) {
      const parts = file.file_path.split('/');
      const fileName = parts.pop()!;
      let currentPath = '';
      let parent = root;

      // Build directory nodes
      for (let i = 0; i < parts.length; i++) {
        if (i < 3) continue; // Skip /home/warxh/planet_procgen
        
        const dirName = parts[i];
        currentPath = currentPath ? `${currentPath}/${dirName}` : dirName;
        
        if (!dirMap.has(currentPath)) {
          const dirNode: Node = {
            id: currentPath,
            name: dirName,
            type: 'module',
            size: 0,
            children: []
          };
          parent.children!.push(dirNode);
          dirMap.set(currentPath, dirNode);
        }
        parent = dirMap.get(currentPath)!;
      }

      // Add file node
      const fileNode: Node = {
        id: file.file_path,
        name: fileName,
        type: 'file',
        size: file.symbol_count,
        stage: file.pipeline_stage,
        metrics: {
          symbols: file.symbol_count,
          dependencies: 0
        }
      };
      parent.children!.push(fileNode);
    }

    // Calculate sizes recursively
    this.calculateNodeSizes(root);
    
    return root;
  }

  /**
   * Generate a dependency graph for cross-file relationships
   */
  async generateDependencyGraph(): Promise<{ nodes: Node[], edges: Edge[] }> {
    // Get all files with metrics
    const files = this.db.prepare(`
      SELECT 
        file_path,
        pipeline_stage,
        COUNT(*) as symbol_count,
        AVG(parser_confidence) as avg_confidence
      FROM enhanced_symbols
      GROUP BY file_path
    `).all() as any[];

    // Get cross-file dependencies
    const dependencies = this.db.prepare(`
      SELECT 
        s1.file_path as source_file,
        s2.file_path as target_file,
        sr.relationship_type,
        COUNT(*) as connection_count
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.file_path != s2.file_path
        AND sr.detected_by = 'cross-file-analyzer'
      GROUP BY s1.file_path, s2.file_path, sr.relationship_type
    `).all() as any[];

    // Create nodes
    const nodes: Node[] = files.map(file => ({
      id: file.file_path,
      name: path.basename(file.file_path),
      type: 'file',
      size: file.symbol_count,
      stage: file.pipeline_stage,
      metrics: {
        symbols: file.symbol_count,
        dependencies: 0,
        complexity: file.avg_confidence
      }
    }));

    // Create edges
    const edges: Edge[] = dependencies.map(dep => ({
      source: dep.source_file,
      target: dep.target_file,
      type: dep.relationship_type as any,
      weight: dep.connection_count
    }));

    // Update dependency counts
    const depCounts = new Map<string, number>();
    edges.forEach(edge => {
      depCounts.set(edge.source, (depCounts.get(edge.source) || 0) + 1);
      depCounts.set(edge.target, (depCounts.get(edge.target) || 0) + 1);
    });

    nodes.forEach(node => {
      node.metrics!.dependencies = depCounts.get(node.id) || 0;
    });

    return { nodes, edges };
  }

  /**
   * Generate SVG visualization of the project structure
   */
  async generateTreemapSVG(width: number = 1200, height: number = 800): Promise<string> {
    const tree = await this.generateProjectTree();
    
    // Use D3.js-style treemap algorithm (simplified)
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .node { stroke: #333; stroke-width: 1px; cursor: pointer; }
    .node:hover { stroke-width: 2px; opacity: 0.8; }
    .label { font-family: Arial, sans-serif; font-size: 12px; fill: #333; }
    .rendering { fill: #4CAF50; }
    .terrain_formation { fill: #2196F3; }
    .physics_processing { fill: #FF9800; }
    .gui { fill: #9C27B0; }
    .orchestration { fill: #F44336; }
    .unknown { fill: #9E9E9E; }
    .tooltip { font-size: 10px; fill: white; }
  </style>
  <defs>
    <filter id="shadow">
      <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
  </defs>
`;

    const nodes = this.layoutTreemap(tree, 10, 10, width - 20, height - 20);
    
    for (const node of nodes) {
      if (node.type === 'file' && node.rect) {
        const color = this.getStageColor(node.stage);
        const { x, y, width: w, height: h } = node.rect;
        
        svg += `  <g>
    <rect class="node ${node.stage || 'unknown'}" 
          x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${color}" filter="url(#shadow)">
      <title>${node.name}
Symbols: ${node.metrics?.symbols || 0}
Stage: ${node.stage || 'unknown'}</title>
    </rect>`;
        
        if (w > 50 && h > 20) {
          svg += `
    <text class="label" x="${x + w/2}" y="${y + h/2}" 
          text-anchor="middle" dominant-baseline="middle">
      ${node.name.length > 20 ? node.name.substring(0, 20) + '...' : node.name}
    </text>`;
        }
        
        svg += `
  </g>
`;
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Generate interactive HTML visualization
   */
  async generateInteractiveHTML(): Promise<string> {
    const { nodes, edges } = await this.generateDependencyGraph();
    
    // Get statistics
    const stats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT file_path) as total_files,
        COUNT(*) as total_symbols,
        COUNT(DISTINCT pipeline_stage) as total_stages
      FROM enhanced_symbols
    `).get() as any;

    const stageStats = this.db.prepare(`
      SELECT 
        pipeline_stage,
        COUNT(DISTINCT file_path) as file_count,
        COUNT(*) as symbol_count
      FROM enhanced_symbols
      WHERE pipeline_stage IS NOT NULL
      GROUP BY pipeline_stage
      ORDER BY symbol_count DESC
    `).all() as any[];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Planet ProcGen - Project Architecture</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://unpkg.com/force-graph"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: #f5f5f5;
        }
        .header {
            background: #333;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .container {
            display: flex;
            height: calc(100vh - 80px);
        }
        .sidebar {
            width: 300px;
            background: white;
            padding: 20px;
            overflow-y: auto;
            box-shadow: 2px 0 5px rgba(0,0,0,0.1);
        }
        .main {
            flex: 1;
            position: relative;
        }
        .stats {
            margin-bottom: 20px;
        }
        .stat-card {
            background: #f0f0f0;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 5px;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        .stat-label {
            font-size: 14px;
            color: #666;
        }
        .stage-list {
            list-style: none;
            padding: 0;
        }
        .stage-item {
            padding: 10px;
            margin-bottom: 5px;
            background: #f9f9f9;
            border-left: 4px solid;
            cursor: pointer;
        }
        .stage-item:hover {
            background: #e9e9e9;
        }
        .controls {
            position: absolute;
            top: 10px;
            right: 10px;
            background: white;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        #graph {
            width: 100%;
            height: 100%;
        }
        .tooltip {
            position: absolute;
            padding: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 5px;
            pointer-events: none;
            font-size: 12px;
            z-index: 1000;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Planet ProcGen - Architecture Visualization</h1>
        <p>Interactive dependency graph and project structure analysis</p>
    </div>
    
    <div class="container">
        <div class="sidebar">
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value">${stats.total_files}</div>
                    <div class="stat-label">Total Files</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.total_symbols.toLocaleString()}</div>
                    <div class="stat-label">Total Symbols</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${edges.length.toLocaleString()}</div>
                    <div class="stat-label">Cross-file Dependencies</div>
                </div>
            </div>
            
            <h3>Pipeline Stages</h3>
            <ul class="stage-list">
                ${stageStats.map(stage => `
                <li class="stage-item" style="border-color: ${this.getStageColor(stage.pipeline_stage)}">
                    <strong>${stage.pipeline_stage}</strong><br>
                    ${stage.file_count} files, ${stage.symbol_count.toLocaleString()} symbols
                </li>
                `).join('')}
            </ul>
        </div>
        
        <div class="main">
            <div class="controls">
                <label>
                    <input type="checkbox" id="showLabels" checked> Show Labels
                </label>
                <br>
                <label>
                    Link Distance: <input type="range" id="linkDistance" min="50" max="300" value="150">
                </label>
                <br>
                <label>
                    Charge Force: <input type="range" id="chargeForce" min="-500" max="-50" value="-200">
                </label>
            </div>
            <div id="graph"></div>
        </div>
    </div>
    
    <div class="tooltip" style="display: none;"></div>
    
    <script>
        const graphData = {
            nodes: ${JSON.stringify(nodes.map(n => ({
                id: n.id,
                name: n.name,
                size: Math.sqrt(n.size) * 2,
                stage: n.stage,
                symbols: n.metrics?.symbols || 0,
                dependencies: n.metrics?.dependencies || 0
            })))},
            links: ${JSON.stringify(edges.map(e => ({
                source: e.source,
                target: e.target,
                type: e.type,
                value: e.weight
            })))}
        };
        
        const stageColors = {
            rendering: '#4CAF50',
            terrain_formation: '#2196F3',
            physics_processing: '#FF9800',
            gui: '#9C27B0',
            orchestration: '#F44336',
            atmospheric_dynamics: '#00BCD4',
            geological_processes: '#795548',
            ecosystem_simulation: '#8BC34A',
            weather_systems: '#3F51B5',
            feature_placement: '#CDDC39',
            unknown: '#9E9E9E'
        };
        
        // Create force-directed graph
        const Graph = ForceGraph()
            (document.getElementById('graph'))
            .graphData(graphData)
            .nodeId('id')
            .nodeLabel(node => \`\${node.name}\\nSymbols: \${node.symbols}\\nDependencies: \${node.dependencies}\`)
            .nodeColor(node => stageColors[node.stage] || stageColors.unknown)
            .nodeRelSize(4)
            .linkColor(() => 'rgba(0,0,0,0.2)')
            .linkWidth(link => Math.sqrt(link.value))
            .linkDirectionalArrowLength(3.5)
            .linkDirectionalArrowRelPos(1)
            .onNodeClick(node => {
                console.log('Clicked node:', node);
                // Could open file or show detailed view
            })
            .onNodeHover(node => {
                const tooltip = document.querySelector('.tooltip');
                if (node) {
                    tooltip.innerHTML = \`
                        <strong>\${node.name}</strong><br>
                        Stage: \${node.stage || 'unknown'}<br>
                        Symbols: \${node.symbols}<br>
                        Dependencies: \${node.dependencies}
                    \`;
                    tooltip.style.display = 'block';
                } else {
                    tooltip.style.display = 'none';
                }
            });
        
        // Update graph on control changes
        document.getElementById('linkDistance').addEventListener('input', e => {
            Graph.d3Force('link').distance(e.target.value);
            Graph.d3ReheatSimulation();
        });
        
        document.getElementById('chargeForce').addEventListener('input', e => {
            Graph.d3Force('charge').strength(e.target.value);
            Graph.d3ReheatSimulation();
        });
        
        document.getElementById('showLabels').addEventListener('change', e => {
            Graph.nodeLabel(e.target.checked ? node => node.name : '');
        });
        
        // Move tooltip with mouse
        document.addEventListener('mousemove', e => {
            const tooltip = document.querySelector('.tooltip');
            tooltip.style.left = (e.pageX + 10) + 'px';
            tooltip.style.top = (e.pageY - 10) + 'px';
        });
        
        // Stage filtering
        document.querySelectorAll('.stage-item').forEach(item => {
            item.addEventListener('click', function() {
                const stageName = this.querySelector('strong').textContent;
                const filteredNodes = graphData.nodes.filter(n => n.stage === stageName);
                const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
                const filteredLinks = graphData.links.filter(l => 
                    filteredNodeIds.has(l.source.id || l.source) && 
                    filteredNodeIds.has(l.target.id || l.target)
                );
                
                Graph.graphData({
                    nodes: filteredNodes,
                    links: filteredLinks
                });
            });
        });
    </script>
</body>
</html>`;

    return html;
  }

  /**
   * Generate a module-level dependency matrix
   */
  async generateDependencyMatrix(): Promise<string> {
    // Get unique modules by extracting directory names
    const allFiles = this.db.prepare(`
      SELECT DISTINCT file_path 
      FROM enhanced_symbols
    `).all() as any[];
    
    // Extract module names from file paths
    const moduleSet = new Set<string>();
    for (const file of allFiles) {
      const match = file.file_path.match(/planet_procgen\/(src|include)\/([^\/]+)/);
      if (match) {
        moduleSet.add(match[2]);
      }
    }
    const moduleNames = Array.from(moduleSet).sort();
    
    // Get dependencies between modules
    const dependencies = this.db.prepare(`
      SELECT 
        s1.file_path as source_file,
        s2.file_path as target_file,
        COUNT(*) as dependency_count
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.file_path != s2.file_path
      GROUP BY s1.file_path, s2.file_path
    `).all() as any[];

    // Build dependency matrix
    const matrix: number[][] = [];
    const moduleIndex = new Map(moduleNames.map((name, i) => [name, i]));

    // Initialize matrix
    for (let i = 0; i < moduleNames.length; i++) {
      matrix[i] = new Array(moduleNames.length).fill(0);
    }

    // Fill matrix with dependency counts
    for (const dep of dependencies) {
      const sourceMatch = dep.source_file.match(/planet_procgen\/(src|include)\/([^\/]+)/);
      const targetMatch = dep.target_file.match(/planet_procgen\/(src|include)\/([^\/]+)/);
      
      if (sourceMatch && targetMatch) {
        const sourceModule = sourceMatch[2];
        const targetModule = targetMatch[2];
        
        if (sourceModule !== targetModule) {
          const sourceIdx = moduleIndex.get(sourceModule);
          const targetIdx = moduleIndex.get(targetModule);
          
          if (sourceIdx !== undefined && targetIdx !== undefined) {
            matrix[sourceIdx][targetIdx] += dep.dependency_count;
          }
        }
      }
    }

    // Generate HTML table
    let html = '<table style="border-collapse: collapse; font-family: monospace;">';
    html += '<tr><th></th>';
    for (const name of moduleNames) {
      html += `<th style="writing-mode: vertical-lr; padding: 5px;">${name}</th>`;
    }
    html += '</tr>';

    for (let i = 0; i < moduleNames.length; i++) {
      html += `<tr><th style="text-align: right; padding: 5px;">${moduleNames[i]}</th>`;
      for (let j = 0; j < moduleNames.length; j++) {
        const value = matrix[i][j];
        const color = value > 0 ? `rgba(255, 0, 0, ${Math.min(value / 100, 1)})` : 'white';
        html += `<td style="background-color: ${color}; width: 20px; height: 20px; text-align: center; border: 1px solid #ccc;">${value || ''}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';

    return html;
  }

  // Helper methods
  private calculateNodeSizes(node: Node): number {
    if (!node.children || node.children.length === 0) {
      return node.size;
    }
    
    let totalSize = 0;
    for (const child of node.children) {
      totalSize += this.calculateNodeSizes(child);
    }
    node.size = totalSize;
    return totalSize;
  }

  private layoutTreemap(node: Node, x: number, y: number, width: number, height: number): Node[] {
    const nodes: Node[] = [];
    
    if (!node.children || node.children.length === 0) {
      node.rect = { x, y, width, height };
      nodes.push(node);
      return nodes;
    }

    // Simple slice-and-dice layout
    const totalSize = node.size || 1;
    let currentX = x;
    let currentY = y;
    
    const isHorizontal = width > height;
    
    for (const child of node.children) {
      const ratio = (child.size || 1) / totalSize;
      
      if (isHorizontal) {
        const childWidth = width * ratio;
        nodes.push(...this.layoutTreemap(child, currentX, y, childWidth, height));
        currentX += childWidth;
      } else {
        const childHeight = height * ratio;
        nodes.push(...this.layoutTreemap(child, x, currentY, width, childHeight));
        currentY += childHeight;
      }
    }
    
    return nodes;
  }

  private getStageColor(stage?: string): string {
    const colors: Record<string, string> = {
      rendering: '#4CAF50',
      terrain_formation: '#2196F3',
      physics_processing: '#FF9800',
      gui: '#9C27B0',
      orchestration: '#F44336',
      atmospheric_dynamics: '#00BCD4',
      geological_processes: '#795548',
      ecosystem_simulation: '#8BC34A',
      weather_systems: '#3F51B5',
      feature_placement: '#CDDC39'
    };
    return colors[stage || ''] || '#9E9E9E';
  }

  close() {
    this.db.close();
  }
}