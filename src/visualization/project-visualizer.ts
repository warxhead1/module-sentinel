import Database from 'better-sqlite3';

/**
 * Project visualizer for universal schema
 * Generates treemaps and dependency visualizations
 */
export class ProjectVisualizer {
  constructor(private db: Database.Database) {}

  /**
   * Generate a treemap visualization showing project structure
   */
  async generateTreemapSVG(width: number = 1400, height: number = 900): Promise<string> {
    // Get hierarchical data
    const data = this.getHierarchicalData();
    
    // Simple SVG treemap
    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .cell { stroke: #fff; stroke-width: 1px; }
    .label { font-family: Arial, sans-serif; font-size: 12px; fill: white; }
    .namespace { fill: #4a9eff; }
    .class { fill: #66cc66; }
    .function { fill: #ff9944; }
    .module { fill: #cc66cc; }
  </style>
  <rect width="${width}" height="${height}" fill="#f0f0f0"/>
`;

    // Simple grid layout for visualization
    const margin = 10;
    const cellWidth = (width - margin * 2) / 10;
    const cellHeight = (height - margin * 2) / 10;
    
    let x = margin;
    let y = margin;
    let row = 0;
    
    for (const item of data.slice(0, 100)) { // Limit to 100 items for simplicity
      if (x + cellWidth > width - margin) {
        x = margin;
        y += cellHeight + 5;
        row++;
        if (row > 9) break; // Max 10 rows
      }
      
      const color = this.getColorForKind(item.kind);
      svg += `  <g>
    <rect class="cell ${item.kind}" x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="${color}" opacity="0.8"/>
    <text class="label" x="${x + 5}" y="${y + 20}">${this.truncate(item.name, 15)}</text>
    <text class="label" x="${x + 5}" y="${y + 35}" font-size="10" opacity="0.7">${item.count} symbols</text>
  </g>\n`;
      
      x += cellWidth + 5;
    }
    
    svg += '</svg>';
    return svg;
  }

  /**
   * Generate an interactive HTML visualization
   */
  async generateInteractiveHTML(): Promise<string> {
    const stats = this.getProjectStats();
    const topSymbols = this.getTopSymbols();
    
    return `<!DOCTYPE html>
<html>
<head>
    <title>Project Architecture - Module Sentinel</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 { color: #333; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: #4a9eff;
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .symbol-list {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-top: 20px;
        }
        .symbol-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .symbol-name {
            font-weight: 500;
            color: #333;
        }
        .symbol-meta {
            font-size: 14px;
            color: #666;
            margin-top: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Project Architecture Overview</h1>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${stats.totalProjects}</div>
                <div class="stat-label">Projects</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalSymbols}</div>
                <div class="stat-label">Total Symbols</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalFiles}</div>
                <div class="stat-label">Files Indexed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalRelationships}</div>
                <div class="stat-label">Relationships</div>
            </div>
        </div>
        
        <div class="symbol-list">
            <h2>Top Symbols by Relationships</h2>
            ${topSymbols.map(s => `
                <div class="symbol-item">
                    <div class="symbol-name">${s.qualified_name || s.name}</div>
                    <div class="symbol-meta">
                        ${s.kind} • ${s.project_name} • ${s.relationship_count} relationships
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate a dependency matrix visualization
   */
  async generateDependencyMatrix(): Promise<string> {
    // Get namespace dependencies
    const dependencies = this.db.prepare(`
      SELECT 
        s1.namespace as from_namespace,
        s2.namespace as to_namespace,
        COUNT(*) as dependency_count
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      WHERE s1.namespace IS NOT NULL 
        AND s2.namespace IS NOT NULL 
        AND s1.namespace != s2.namespace
      GROUP BY s1.namespace, s2.namespace
      ORDER BY dependency_count DESC
      LIMIT 100
    `).all() as any[];

    // Get unique namespaces
    const namespaces = new Set<string>();
    dependencies.forEach(d => {
      namespaces.add(d.from_namespace);
      namespaces.add(d.to_namespace);
    });
    const namespaceList = Array.from(namespaces).sort();

    // Build matrix
    let html = `<table style="border-collapse: collapse;">
<tr><th></th>${namespaceList.map(ns => `<th style="writing-mode: vertical-lr; padding: 5px;">${ns}</th>`).join('')}</tr>`;

    for (const fromNs of namespaceList) {
      html += `<tr><th style="text-align: right; padding: 5px;">${fromNs}</th>`;
      for (const toNs of namespaceList) {
        const dep = dependencies.find(d => d.from_namespace === fromNs && d.to_namespace === toNs);
        const count = dep ? dep.dependency_count : 0;
        const opacity = count > 0 ? Math.min(count / 10, 1) : 0;
        html += `<td style="background: rgba(255,0,0,${opacity}); width: 20px; height: 20px; text-align: center;">${count || ''}</td>`;
      }
      html += '</tr>';
    }
    
    html += '</table>';
    return html;
  }

  // Helper methods
  private getHierarchicalData(): any[] {
    return this.db.prepare(`
      SELECT 
        COALESCE(namespace, 'global') as namespace,
        kind,
        COUNT(*) as count,
        MIN(name) as name
      FROM universal_symbols
      GROUP BY namespace, kind
      ORDER BY count DESC
    `).all();
  }

  private getProjectStats(): any {
    return this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM projects WHERE is_active = 1) as totalProjects,
        (SELECT COUNT(*) FROM universal_symbols) as totalSymbols,
        (SELECT COUNT(DISTINCT file_path) FROM universal_symbols) as totalFiles,
        (SELECT COUNT(*) FROM universal_relationships) as totalRelationships
    `).get() as any;
  }

  private getTopSymbols(): any[] {
    return this.db.prepare(`
      SELECT 
        s.name,
        s.qualified_name,
        s.kind,
        p.name as project_name,
        COUNT(r.id) as relationship_count
      FROM universal_symbols s
      JOIN projects p ON s.project_id = p.id
      LEFT JOIN universal_relationships r ON s.id = r.from_symbol_id OR s.id = r.to_symbol_id
      GROUP BY s.id
      ORDER BY relationship_count DESC
      LIMIT 20
    `).all();
  }

  private getColorForKind(kind: string): string {
    const colors: Record<string, string> = {
      namespace: '#4a9eff',
      class: '#66cc66',
      function: '#ff9944',
      method: '#ff9944',
      module: '#cc66cc',
      variable: '#ffcc66',
      type: '#9966ff'
    };
    return colors[kind] || '#999999';
  }

  private truncate(str: string, length: number): string {
    return str.length > length ? str.substring(0, length - 3) + '...' : str;
  }
}