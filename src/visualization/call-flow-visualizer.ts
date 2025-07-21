import Database from 'better-sqlite3';

/**
 * Call flow visualizer for universal schema
 * Generates call graphs and execution flow diagrams
 */
export class CallFlowVisualizer {
  constructor(private db: Database.Database) {}

  /**
   * Generate call flow HTML for a specific symbol
   */
  async generateCallFlowHTML(symbolName: string): Promise<string> {
    // Find the symbol
    const symbol = this.db.prepare(`
      SELECT s.*, p.name as project_name
      FROM universal_symbols s
      JOIN projects p ON s.project_id = p.id
      WHERE s.name = ? OR s.qualified_name = ?
      LIMIT 1
    `).get(symbolName, symbolName) as any;

    if (!symbol) {
      return this.generateErrorHTML(`Symbol "${symbolName}" not found`);
    }

    // Get call relationships
    const outgoingCalls = this.getOutgoingCalls(symbol.id);
    const incomingCalls = this.getIncomingCalls(symbol.id);

    return `<!DOCTYPE html>
<html>
<head>
    <title>Call Flow - ${symbol.qualified_name || symbol.name}</title>
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
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { 
            color: #333; 
            margin-bottom: 10px;
        }
        .symbol-info {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            font-family: monospace;
        }
        .flow-section {
            margin: 30px 0;
        }
        .flow-section h2 {
            color: #4a9eff;
            margin-bottom: 15px;
        }
        .call-list {
            list-style: none;
            padding: 0;
        }
        .call-item {
            padding: 10px;
            margin: 5px 0;
            background: #f0f7ff;
            border-left: 3px solid #4a9eff;
            border-radius: 3px;
        }
        .incoming {
            border-left-color: #66cc66;
            background: #f0fff0;
        }
        .call-name {
            font-weight: 500;
            color: #333;
        }
        .call-meta {
            font-size: 14px;
            color: #666;
            margin-top: 2px;
        }
        .no-calls {
            color: #999;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌊 Call Flow Analysis</h1>
        
        <div class="symbol-info">
            <strong>${symbol.qualified_name || symbol.name}</strong><br>
            ${symbol.kind} • ${symbol.project_name}<br>
            ${symbol.file_path}:${symbol.line}
            ${symbol.signature ? `<br>Signature: ${symbol.signature}` : ''}
        </div>
        
        <div class="flow-section">
            <h2>⬇️ Outgoing Calls (${outgoingCalls.length})</h2>
            ${outgoingCalls.length > 0 ? `
                <ul class="call-list">
                    ${outgoingCalls.map(call => `
                        <li class="call-item">
                            <div class="call-name">${call.qualified_name || call.name}</div>
                            <div class="call-meta">
                                ${call.kind} • ${call.relationship_type} • confidence: ${(call.confidence * 100).toFixed(0)}%
                            </div>
                        </li>
                    `).join('')}
                </ul>
            ` : '<p class="no-calls">No outgoing calls found</p>'}
        </div>
        
        <div class="flow-section">
            <h2>⬆️ Incoming Calls (${incomingCalls.length})</h2>
            ${incomingCalls.length > 0 ? `
                <ul class="call-list">
                    ${incomingCalls.map(call => `
                        <li class="call-item incoming">
                            <div class="call-name">${call.qualified_name || call.name}</div>
                            <div class="call-meta">
                                ${call.kind} • ${call.relationship_type} • confidence: ${(call.confidence * 100).toFixed(0)}%
                            </div>
                        </li>
                    `).join('')}
                </ul>
            ` : '<p class="no-calls">No incoming calls found</p>'}
        </div>
    </div>
</body>
</html>`;
  }

  private getOutgoingCalls(symbolId: number): any[] {
    return this.db.prepare(`
      SELECT 
        s.name,
        s.qualified_name,
        s.kind,
        s.file_path,
        s.line,
        r.relationship_type,
        r.confidence
      FROM universal_relationships r
      JOIN universal_symbols s ON r.to_symbol_id = s.id
      WHERE r.from_symbol_id = ?
        AND r.relationship_type IN ('calls', 'uses', 'depends_on')
      ORDER BY r.confidence DESC, s.name
      LIMIT 50
    `).all(symbolId);
  }

  private getIncomingCalls(symbolId: number): any[] {
    return this.db.prepare(`
      SELECT 
        s.name,
        s.qualified_name,
        s.kind,
        s.file_path,
        s.line,
        r.relationship_type,
        r.confidence
      FROM universal_relationships r
      JOIN universal_symbols s ON r.from_symbol_id = s.id
      WHERE r.to_symbol_id = ?
        AND r.relationship_type IN ('calls', 'uses', 'depends_on')
      ORDER BY r.confidence DESC, s.name
      LIMIT 50
    `).all(symbolId);
  }

  private generateErrorHTML(error: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Call Flow - Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .error {
            max-width: 600px;
            margin: 50px auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .error h1 {
            color: #ff4444;
        }
    </style>
</head>
<body>
    <div class="error">
        <h1>❌ Error</h1>
        <p>${error}</p>
    </div>
</body>
</html>`;
  }
}