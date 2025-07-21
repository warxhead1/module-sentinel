-- Module Sentinel Unified Schema Migration
-- This is the single source of truth for all database tables
-- Generated from Drizzle schema definitions

-- ============================================================================
-- PROJECT MANAGEMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  root_path TEXT NOT NULL,
  config_path TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_root_path ON projects(root_path);

CREATE TABLE IF NOT EXISTS languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  version TEXT,
  parser_class TEXT NOT NULL,
  extensions TEXT NOT NULL,
  features TEXT,
  is_enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_languages_name ON languages(name);
CREATE INDEX IF NOT EXISTS idx_languages_enabled ON languages(is_enabled);
CREATE INDEX IF NOT EXISTS idx_languages_priority ON languages(priority);

CREATE TABLE IF NOT EXISTS project_languages (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  config TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_project_languages_project ON project_languages(project_id);
CREATE INDEX IF NOT EXISTS idx_project_languages_language ON project_languages(language_id);

-- ============================================================================
-- UNIVERSAL SYMBOL TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS universal_symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  end_line INTEGER,
  end_column INTEGER,
  return_type TEXT,
  signature TEXT,
  visibility TEXT,
  namespace TEXT,
  parent_symbol_id INTEGER REFERENCES universal_symbols(id),
  is_exported INTEGER DEFAULT 0,
  is_async INTEGER DEFAULT 0,
  is_abstract INTEGER DEFAULT 0,
  language_features TEXT,
  semantic_tags TEXT,
  confidence REAL DEFAULT 1.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  -- Additional fields for compatibility
  complexity INTEGER DEFAULT 1,
  is_definition INTEGER DEFAULT 1,
  parent_scope TEXT,
  -- For unique constraint
  UNIQUE(project_id, language_id, qualified_name, file_path, line)
);

CREATE INDEX IF NOT EXISTS idx_universal_symbols_project ON universal_symbols(project_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_language ON universal_symbols(language_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_qualified_name ON universal_symbols(qualified_name);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_kind ON universal_symbols(kind);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_file_path ON universal_symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_namespace ON universal_symbols(namespace);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_parent ON universal_symbols(parent_symbol_id);

CREATE TABLE IF NOT EXISTS universal_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
  to_symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  context_line INTEGER,
  context_column INTEGER,
  context_snippet TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(from_symbol_id, to_symbol_id, type)
);

CREATE INDEX IF NOT EXISTS idx_universal_relationships_project ON universal_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_from ON universal_relationships(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_to ON universal_relationships(to_symbol_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_type ON universal_relationships(type);

-- ============================================================================
-- CODE FLOW ANALYSIS TABLES
-- ============================================================================

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
  complexity INTEGER DEFAULT 1
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

-- ============================================================================
-- FILE INDEXING
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_hash TEXT,
  last_parsed INTEGER,
  parse_duration INTEGER,
  parser_version TEXT,
  symbol_count INTEGER DEFAULT 0,
  relationship_count INTEGER DEFAULT 0,
  pattern_count INTEGER DEFAULT 0,
  is_indexed INTEGER DEFAULT 0,
  has_errors INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(project_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_file_index_project ON file_index(project_id);
CREATE INDEX IF NOT EXISTS idx_file_index_language ON file_index(language_id);
CREATE INDEX IF NOT EXISTS idx_file_index_file_path ON file_index(file_path);
CREATE INDEX IF NOT EXISTS idx_file_index_last_parsed ON file_index(last_parsed);

-- ============================================================================
-- PATTERN DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS detected_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,
  pattern_name TEXT,
  description TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  severity TEXT DEFAULT 'info',
  detector_name TEXT,
  detector_version TEXT,
  detection_time INTEGER DEFAULT (strftime('%s', 'now')),
  suggestions TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_detected_patterns_project ON detected_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_type ON detected_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_severity ON detected_patterns(severity);

-- ============================================================================
-- SEMANTIC TAGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS semantic_tag_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  is_universal INTEGER DEFAULT 1,
  applicable_languages TEXT,
  parent_tag_id INTEGER REFERENCES semantic_tag_definitions(id),
  validation_rules TEXT,
  color TEXT,
  icon TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_semantic_tag_definitions_name ON semantic_tag_definitions(name);
CREATE INDEX IF NOT EXISTS idx_semantic_tag_definitions_category ON semantic_tag_definitions(category);
CREATE INDEX IF NOT EXISTS idx_semantic_tag_definitions_parent ON semantic_tag_definitions(parent_tag_id);

CREATE TABLE IF NOT EXISTS symbol_semantic_tags (
  symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES semantic_tag_definitions(id) ON DELETE CASCADE,
  confidence REAL DEFAULT 1.0,
  auto_detected INTEGER DEFAULT 0,
  detector_name TEXT,
  context TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_symbol_semantic_tags_symbol ON symbol_semantic_tags(symbol_id);
CREATE INDEX IF NOT EXISTS idx_symbol_semantic_tags_tag ON symbol_semantic_tags(tag_id);

-- ============================================================================
-- Insert default data
-- ============================================================================

-- Insert default languages
INSERT OR IGNORE INTO languages (name, display_name, parser_class, extensions, is_enabled, priority) VALUES
  ('cpp', 'C++', 'CppLanguageParser', '["cpp", "cc", "cxx", "hpp", "h", "hxx", "ixx", "c"]', 1, 100),
  ('python', 'Python', 'PythonLanguageParser', '["py", "pyi"]', 1, 90),
  ('typescript', 'TypeScript', 'TypeScriptLanguageParser', '["ts", "tsx"]', 1, 80),
  ('javascript', 'JavaScript', 'JavaScriptLanguageParser', '["js", "jsx", "mjs"]', 1, 70);

-- Insert default project if needed
INSERT OR IGNORE INTO projects (id, name, display_name, root_path) VALUES
  (1, 'test-project', 'Test Project', '/test/complex-files');