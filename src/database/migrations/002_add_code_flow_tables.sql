-- Code Flow Analysis Tables
-- Track function calls, execution paths, and control flow

-- Symbol calls table - tracks function/method calls between symbols
CREATE TABLE IF NOT EXISTS symbol_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_id INTEGER NOT NULL,
  callee_id INTEGER NOT NULL,
  line_number INTEGER NOT NULL,
  column_number INTEGER,
  call_type TEXT NOT NULL DEFAULT 'direct', -- direct, virtual, delegate, etc.
  condition TEXT, -- for conditional calls
  is_conditional INTEGER NOT NULL DEFAULT 0, -- boolean
  is_recursive INTEGER NOT NULL DEFAULT 0, -- boolean
  argument_types TEXT, -- JSON array of argument types
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (caller_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (callee_id) REFERENCES universal_symbols(id) ON DELETE CASCADE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_symbol_calls_caller ON symbol_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_symbol_calls_callee ON symbol_calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_symbol_calls_conditional ON symbol_calls(is_conditional);

-- Code flow paths table - tracks execution paths through the code
CREATE TABLE IF NOT EXISTS code_flow_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_symbol_id INTEGER NOT NULL,
  end_symbol_id INTEGER,
  path_nodes TEXT NOT NULL, -- JSON array of symbol IDs
  path_conditions TEXT, -- JSON array of conditions
  path_length INTEGER NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 1, -- boolean
  is_cyclic INTEGER NOT NULL DEFAULT 0, -- boolean
  frequency INTEGER DEFAULT 0, -- How often this path is taken
  coverage REAL DEFAULT 0, -- Percentage of path covered by tests
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (start_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (end_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE
);

-- Index for path lookups
CREATE INDEX IF NOT EXISTS idx_code_flow_paths_start ON code_flow_paths(start_symbol_id);
CREATE INDEX IF NOT EXISTS idx_code_flow_paths_end ON code_flow_paths(end_symbol_id);

-- Control flow blocks table - tracks control flow blocks within functions
CREATE TABLE IF NOT EXISTS control_flow_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL,
  block_type TEXT NOT NULL, -- entry, exit, conditional, loop, etc.
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_block_id INTEGER,
  condition TEXT, -- for conditional blocks
  loop_type TEXT, -- for, while, do-while
  complexity INTEGER DEFAULT 1,
  FOREIGN KEY (symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_block_id) REFERENCES control_flow_blocks(id) ON DELETE CASCADE
);

-- Index for block lookups
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_symbol ON control_flow_blocks(symbol_id);
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_parent ON control_flow_blocks(parent_block_id);

-- Data flow edges table - tracks data flow within and between functions
CREATE TABLE IF NOT EXISTS data_flow_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_symbol_id INTEGER NOT NULL,
  target_symbol_id INTEGER NOT NULL,
  variable_name TEXT NOT NULL,
  flow_type TEXT NOT NULL, -- parameter, return, global, member
  line_number INTEGER NOT NULL,
  is_modified INTEGER NOT NULL DEFAULT 0, -- boolean
  data_dependencies TEXT, -- JSON array of dependent variables
  FOREIGN KEY (source_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (target_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE
);

-- Index for data flow lookups
CREATE INDEX IF NOT EXISTS idx_data_flow_edges_source ON data_flow_edges(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_data_flow_edges_target ON data_flow_edges(target_symbol_id);
CREATE INDEX IF NOT EXISTS idx_data_flow_edges_variable ON data_flow_edges(variable_name);

-- Add complexity column to universal_symbols if it doesn't exist
-- This is used by the code flow analysis
-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we'll handle this in code