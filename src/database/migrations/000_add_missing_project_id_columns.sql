-- Migration: Drop and recreate code flow tables with project_id
-- This migration handles existing databases that might be missing project_id columns
-- These tables only contain indexed data that can be regenerated, so it's safe to drop them

-- Drop old code flow analysis tables that might be missing project_id column
DROP TABLE IF EXISTS control_flow_blocks;
DROP TABLE IF EXISTS symbol_calls;
DROP TABLE IF EXISTS code_flow_paths;
DROP TABLE IF EXISTS data_flow_edges;

-- Also drop their indexes if they exist
DROP INDEX IF EXISTS idx_control_flow_blocks_symbol;
DROP INDEX IF EXISTS idx_control_flow_blocks_project;
DROP INDEX IF EXISTS idx_control_flow_blocks_type;
DROP INDEX IF EXISTS idx_control_flow_blocks_parent;

DROP INDEX IF EXISTS idx_symbol_calls_caller;
DROP INDEX IF EXISTS idx_symbol_calls_callee;
DROP INDEX IF EXISTS idx_symbol_calls_project;

DROP INDEX IF EXISTS idx_code_flow_paths_project;
DROP INDEX IF EXISTS idx_code_flow_paths_start;
DROP INDEX IF EXISTS idx_code_flow_paths_end;

DROP INDEX IF EXISTS idx_data_flow_edges_source;
DROP INDEX IF EXISTS idx_data_flow_edges_target;

-- Recreate the tables with project_id columns
CREATE TABLE IF NOT EXISTS symbol_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_id INTEGER NOT NULL,
  callee_id INTEGER,
  project_id INTEGER,
  target_function TEXT,
  line_number INTEGER NOT NULL,
  column_number INTEGER,
  call_type TEXT NOT NULL DEFAULT 'direct',
  condition TEXT,
  is_conditional INTEGER NOT NULL DEFAULT 0,
  is_recursive INTEGER NOT NULL DEFAULT 0,
  argument_types TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_symbol_calls_caller ON symbol_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_symbol_calls_callee ON symbol_calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_symbol_calls_project ON symbol_calls(project_id);

CREATE TABLE IF NOT EXISTS code_flow_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_symbol_id INTEGER NOT NULL,
  end_symbol_id INTEGER,
  path_nodes TEXT NOT NULL,
  path_conditions TEXT,
  path_length INTEGER NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 1,
  is_cyclic INTEGER NOT NULL DEFAULT 0,
  frequency INTEGER DEFAULT 0,
  coverage REAL DEFAULT 0,
  path_signature TEXT,
  complexity_score INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_code_flow_paths_project ON code_flow_paths(project_id);
CREATE INDEX IF NOT EXISTS idx_code_flow_paths_start ON code_flow_paths(start_symbol_id);
CREATE INDEX IF NOT EXISTS idx_code_flow_paths_end ON code_flow_paths(end_symbol_id);

CREATE TABLE IF NOT EXISTS control_flow_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL,
  project_id INTEGER,
  block_type TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_block_id INTEGER,
  condition TEXT,
  loop_type TEXT,
  complexity INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_symbol ON control_flow_blocks(symbol_id);
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_project ON control_flow_blocks(project_id);
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_type ON control_flow_blocks(block_type);

CREATE TABLE IF NOT EXISTS data_flow_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_symbol_id INTEGER NOT NULL,
  target_symbol_id INTEGER NOT NULL,
  variable_name TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  is_modified INTEGER NOT NULL DEFAULT 0,
  data_dependencies TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_flow_edges_source ON data_flow_edges(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_data_flow_edges_target ON data_flow_edges(target_symbol_id);