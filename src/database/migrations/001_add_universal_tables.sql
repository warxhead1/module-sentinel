-- Universal Project and Language Management Tables
-- Foundation for multi-project, multi-language support

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  root_path TEXT NOT NULL,
  description TEXT,
  config_path TEXT,
  scan_paths TEXT, -- JSON array
  file_patterns TEXT, -- JSON array
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Languages table
CREATE TABLE IF NOT EXISTS languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_extensions TEXT NOT NULL, -- JSON array
  parser_name TEXT NOT NULL,
  features TEXT, -- JSON object of language-specific features
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Project-Language mapping
CREATE TABLE IF NOT EXISTS project_languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,
  config TEXT, -- JSON for language-specific config
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  UNIQUE(project_id, language_id)
);

-- Universal symbols table
CREATE TABLE IF NOT EXISTS universal_symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,
  
  -- Core identification
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL, -- function, class, interface, enum, etc.
  
  -- Location information
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  end_line INTEGER,
  end_column INTEGER,
  
  -- Type information
  return_type TEXT,
  signature TEXT,
  visibility TEXT, -- public, private, protected, internal
  
  -- Hierarchy
  namespace TEXT,
  parent_symbol_id INTEGER,
  
  -- Properties
  is_exported INTEGER NOT NULL DEFAULT 0,
  is_async INTEGER NOT NULL DEFAULT 0,
  is_abstract INTEGER NOT NULL DEFAULT 0,
  
  -- Language-specific features (JSON)
  language_features TEXT,
  
  -- Analysis metadata
  semantic_tags TEXT, -- comma-separated tags
  confidence REAL NOT NULL DEFAULT 1.0,
  
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_symbol_id) REFERENCES universal_symbols(id) ON DELETE SET NULL
);

-- Indexes for universal_symbols
CREATE INDEX IF NOT EXISTS idx_universal_symbols_project ON universal_symbols(project_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_language ON universal_symbols(language_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_name ON universal_symbols(name);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_qualified_name ON universal_symbols(qualified_name);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_kind ON universal_symbols(kind);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_file ON universal_symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_parent ON universal_symbols(parent_symbol_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_namespace ON universal_symbols(namespace);

-- Universal relationships table
CREATE TABLE IF NOT EXISTS universal_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL, -- extends, implements, uses, calls, etc.
  
  -- Additional context
  location_line INTEGER,
  location_column INTEGER,
  confidence REAL NOT NULL DEFAULT 1.0,
  metadata TEXT, -- JSON for relationship-specific data
  
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (source_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES universal_symbols(id) ON DELETE CASCADE
);

-- Indexes for relationships
CREATE INDEX IF NOT EXISTS idx_universal_relationships_source ON universal_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_target ON universal_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_type ON universal_relationships(relationship_type);

-- Universal patterns table
CREATE TABLE IF NOT EXISTS universal_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT,
  
  -- Pattern detection
  detection_rules TEXT, -- JSON
  examples TEXT, -- JSON array
  
  -- Metrics
  occurrences INTEGER NOT NULL DEFAULT 0,
  last_detected INTEGER,
  
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Pattern instances
CREATE TABLE IF NOT EXISTS pattern_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id INTEGER NOT NULL,
  symbol_id INTEGER NOT NULL,
  
  -- Instance details
  confidence REAL NOT NULL DEFAULT 1.0,
  metadata TEXT, -- JSON
  
  detected_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (pattern_id) REFERENCES universal_patterns(id) ON DELETE CASCADE,
  FOREIGN KEY (symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE
);

-- Indexes for patterns
CREATE INDEX IF NOT EXISTS idx_pattern_instances_pattern ON pattern_instances(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_instances_symbol ON pattern_instances(symbol_id);