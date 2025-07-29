-- Flow Analysis Database Schema
-- Simple, direct schema for relationships and flow analysis

-- Direct symbol call relationships
CREATE TABLE IF NOT EXISTS symbol_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id INTEGER NOT NULL,
    callee_id INTEGER NOT NULL,
    call_site_line INTEGER NOT NULL,
    call_type TEXT NOT NULL DEFAULT 'direct', -- 'direct', 'async', 'callback'
    project_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (caller_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (callee_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Data flow paths
CREATE TABLE IF NOT EXISTS data_flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    sink_id INTEGER NOT NULL,
    flow_path TEXT NOT NULL, -- JSON array of symbol IDs
    transformations TEXT, -- JSON array of operations
    project_id INTEGER NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (sink_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Critical path analysis results
CREATE TABLE IF NOT EXISTS critical_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL,
    symbol_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line INTEGER NOT NULL,
    fan_in INTEGER NOT NULL DEFAULT 0,
    fan_out INTEGER NOT NULL DEFAULT 0,
    criticality_score REAL NOT NULL DEFAULT 0.0,
    project_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Deep flow traces for lineage analysis
CREATE TABLE IF NOT EXISTS deep_flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_path TEXT NOT NULL, -- JSON array of symbol IDs
    depth INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    start_symbol_id INTEGER NOT NULL,
    end_symbol_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (start_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (end_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_symbol_calls_caller ON symbol_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_symbol_calls_callee ON symbol_calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_symbol_calls_project ON symbol_calls(project_id);

CREATE INDEX IF NOT EXISTS idx_data_flows_source ON data_flows(source_id);
CREATE INDEX IF NOT EXISTS idx_data_flows_sink ON data_flows(sink_id);
CREATE INDEX IF NOT EXISTS idx_data_flows_project ON data_flows(project_id);

CREATE INDEX IF NOT EXISTS idx_critical_paths_symbol ON critical_paths(symbol_id);
CREATE INDEX IF NOT EXISTS idx_critical_paths_project ON critical_paths(project_id);
CREATE INDEX IF NOT EXISTS idx_critical_paths_score ON critical_paths(criticality_score DESC);

CREATE INDEX IF NOT EXISTS idx_deep_flows_start ON deep_flows(start_symbol_id);
CREATE INDEX IF NOT EXISTS idx_deep_flows_end ON deep_flows(end_symbol_id);
CREATE INDEX IF NOT EXISTS idx_deep_flows_project ON deep_flows(project_id);
CREATE INDEX IF NOT EXISTS idx_deep_flows_depth ON deep_flows(depth DESC);