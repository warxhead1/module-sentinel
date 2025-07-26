-- Migration: Add Semantic Intelligence Tables
-- This migration adds tables for semantic analysis, clustering, and insights

-- Semantic clusters - Groups of similar symbols based on semantic similarity
CREATE TABLE IF NOT EXISTS semantic_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  cluster_name TEXT NOT NULL,
  cluster_type TEXT NOT NULL, -- 'function_similarity', 'data_structure', 'pattern_based', etc.
  quality REAL NOT NULL, -- Cluster quality score (0-1)
  symbol_count INTEGER NOT NULL DEFAULT 0,
  similarity_threshold REAL NOT NULL,
  centroid_embedding BLOB, -- Base64 encoded centroid embedding
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_semantic_clusters_project_type ON semantic_clusters(project_id, cluster_type);
CREATE INDEX IF NOT EXISTS idx_semantic_clusters_quality ON semantic_clusters(quality);
CREATE INDEX IF NOT EXISTS idx_semantic_clusters_name ON semantic_clusters(cluster_name);

-- Cluster membership - Which symbols belong to which clusters
CREATE TABLE IF NOT EXISTS cluster_membership (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id INTEGER NOT NULL REFERENCES semantic_clusters(id),
  symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id),
  similarity REAL NOT NULL, -- Similarity to cluster centroid (0-1)
  role TEXT DEFAULT 'member', -- 'primary', 'member', 'outlier'
  joined_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cluster_membership_cluster ON cluster_membership(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_membership_symbol ON cluster_membership(symbol_id);
CREATE INDEX IF NOT EXISTS idx_cluster_membership_similarity ON cluster_membership(similarity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_membership_unique ON cluster_membership(cluster_id, symbol_id);

-- Semantic insights - AI-generated insights about code quality and architecture
CREATE TABLE IF NOT EXISTS semantic_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  insight_type TEXT NOT NULL, -- 'refactoring_opportunity', 'architectural_violation', 'performance_concern', 'code_smell'
  category TEXT NOT NULL, -- 'architecture', 'performance', 'maintainability', 'quality', 'testing', 'security'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  confidence REAL NOT NULL, -- AI confidence in the insight (0-1)
  priority TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  title TEXT NOT NULL, -- Short descriptive title
  description TEXT NOT NULL, -- Detailed description
  affected_symbols TEXT, -- JSON array of symbol IDs
  cluster_id INTEGER REFERENCES semantic_clusters(id), -- Related cluster if applicable
  metrics TEXT, -- JSON object with relevant metrics
  source_context TEXT, -- Code context that triggered the insight
  reasoning TEXT, -- AI reasoning for the insight
  context_line INTEGER, -- Line number where insight applies
  context_file TEXT, -- File path where insight applies  
  context_snippet TEXT, -- Code snippet for insight
  related_insights TEXT, -- JSON array of related insight IDs
  detected_at INTEGER DEFAULT (strftime('%s', 'now')),
  resolved_at INTEGER,
  resolution TEXT, -- How the insight was resolved
  status TEXT DEFAULT 'active', -- 'active', 'resolved', 'ignored', 'false_positive'
  user_feedback INTEGER, -- -1: negative, 0: neutral, 1: positive
  feedback_comment TEXT,
  feedback_timestamp INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_semantic_insights_project_type ON semantic_insights(project_id, insight_type);
CREATE INDEX IF NOT EXISTS idx_semantic_insights_severity ON semantic_insights(severity);
CREATE INDEX IF NOT EXISTS idx_semantic_insights_status ON semantic_insights(status);
CREATE INDEX IF NOT EXISTS idx_semantic_insights_feedback ON semantic_insights(user_feedback);
CREATE INDEX IF NOT EXISTS idx_semantic_insights_confidence ON semantic_insights(confidence);

-- Insight recommendations - specific actionable recommendations for insights
CREATE TABLE IF NOT EXISTS insight_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  insight_id INTEGER NOT NULL REFERENCES semantic_insights(id),
  action TEXT NOT NULL, -- Short action description
  description TEXT NOT NULL, -- Detailed recommendation
  effort TEXT NOT NULL, -- 'low', 'medium', 'high'
  impact TEXT NOT NULL, -- 'low', 'medium', 'high'
  priority INTEGER NOT NULL, -- Ordering priority
  example_code TEXT, -- Example implementation
  related_symbols TEXT, -- JSON array of symbol IDs
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_insight_recommendations_insight ON insight_recommendations(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_recommendations_priority ON insight_recommendations(priority);

-- Code embeddings - Vector embeddings for semantic similarity
CREATE TABLE IF NOT EXISTS code_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id),
  embedding_type TEXT NOT NULL, -- 'semantic', 'structural', 'combined'
  embedding BLOB NOT NULL, -- Base64 encoded vector
  dimensions INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_code_embeddings_symbol ON code_embeddings(symbol_id);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_type ON code_embeddings(embedding_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_embeddings_unique ON code_embeddings(symbol_id, embedding_type);

-- Semantic relationships - Discovered semantic relationships between symbols
CREATE TABLE IF NOT EXISTS semantic_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  from_symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id),
  to_symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id),
  semantic_type TEXT NOT NULL, -- 'similar_purpose', 'complementary', 'alternative_implementation', etc.
  strength REAL NOT NULL, -- Relationship strength (0-1)
  evidence TEXT, -- JSON array of evidence
  discovered_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_semantic_relationships_from ON semantic_relationships(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_to ON semantic_relationships(to_symbol_id);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_type ON semantic_relationships(semantic_type);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_strength ON semantic_relationships(strength);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_project ON semantic_relationships(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_relationships_unique ON semantic_relationships(from_symbol_id, to_symbol_id, semantic_type);


-- Migration to fix cluster_membership column name mismatch
-- Changes 'joined_at' to 'assigned_at' to match the Drizzle schema

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First, create a temporary table with the correct schema
CREATE TABLE IF NOT EXISTS cluster_membership_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id INTEGER NOT NULL REFERENCES semantic_clusters(id),
  symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id),
  similarity REAL NOT NULL,
  role TEXT DEFAULT 'member',
  assigned_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Copy data from old table if it exists
INSERT INTO cluster_membership_new (id, cluster_id, symbol_id, similarity, role, assigned_at)
SELECT id, cluster_id, symbol_id, similarity, role, joined_at
FROM cluster_membership
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='cluster_membership');

-- Drop old table if it exists
DROP TABLE IF EXISTS cluster_membership;

-- Rename new table to original name
ALTER TABLE cluster_membership_new RENAME TO cluster_membership;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_cluster_membership_cluster ON cluster_membership(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_membership_symbol ON cluster_membership(symbol_id);
CREATE INDEX IF NOT EXISTS idx_cluster_membership_similarity ON cluster_membership(similarity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_membership_unique ON cluster_membership(cluster_id, symbol_id);


-- Migration: Fix CASCADE deletes for semantic intelligence tables
-- This migration adds proper CASCADE deletes that were missing from the original migration

-- Drop and recreate cluster_membership with CASCADE
DROP TABLE IF EXISTS cluster_membership;

CREATE TABLE cluster_membership (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id INTEGER NOT NULL REFERENCES semantic_clusters(id) ON DELETE CASCADE,
  symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  similarity REAL NOT NULL, -- Similarity to cluster centroid (0-1)
  role TEXT DEFAULT 'member', -- 'primary', 'member', 'outlier'
  joined_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_cluster_membership_cluster ON cluster_membership(cluster_id);
CREATE INDEX idx_cluster_membership_symbol ON cluster_membership(symbol_id);
CREATE INDEX idx_cluster_membership_similarity ON cluster_membership(similarity);
CREATE UNIQUE INDEX idx_cluster_membership_unique ON cluster_membership(cluster_id, symbol_id);

-- Drop and recreate insight_recommendations with CASCADE
DROP TABLE IF EXISTS insight_recommendations;

CREATE TABLE insight_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  insight_id INTEGER NOT NULL REFERENCES semantic_insights(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- Short action description
  description TEXT NOT NULL, -- Detailed recommendation
  effort TEXT NOT NULL, -- 'low', 'medium', 'high'
  impact TEXT NOT NULL, -- 'low', 'medium', 'high'
  priority INTEGER NOT NULL, -- Ordering priority
  example_code TEXT, -- Example implementation
  related_symbols TEXT, -- JSON array of symbol IDs
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_insight_recommendations_insight ON insight_recommendations(insight_id);
CREATE INDEX idx_insight_recommendations_priority ON insight_recommendations(priority);

-- Drop and recreate code_embeddings with CASCADE
DROP TABLE IF EXISTS code_embeddings;

CREATE TABLE code_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  embedding_type TEXT NOT NULL, -- 'semantic', 'structural', 'combined'
  embedding BLOB NOT NULL, -- Base64 encoded vector
  dimensions INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_code_embeddings_symbol ON code_embeddings(symbol_id);
CREATE INDEX idx_code_embeddings_type ON code_embeddings(embedding_type);
CREATE UNIQUE INDEX idx_code_embeddings_unique ON code_embeddings(symbol_id, embedding_type);

-- Drop and recreate semantic_relationships with CASCADE
DROP TABLE IF EXISTS semantic_relationships;

CREATE TABLE semantic_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  to_symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  semantic_type TEXT NOT NULL, -- 'similar_purpose', 'complementary', 'alternative_implementation', etc.
  strength REAL NOT NULL, -- Relationship strength (0-1)
  evidence TEXT, -- JSON array of evidence
  discovered_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_semantic_relationships_from ON semantic_relationships(from_symbol_id);
CREATE INDEX idx_semantic_relationships_to ON semantic_relationships(to_symbol_id);
CREATE INDEX idx_semantic_relationships_type ON semantic_relationships(semantic_type);
CREATE INDEX idx_semantic_relationships_strength ON semantic_relationships(strength);
CREATE INDEX idx_semantic_relationships_project ON semantic_relationships(project_id);
CREATE UNIQUE INDEX idx_semantic_relationships_unique ON semantic_relationships(from_symbol_id, to_symbol_id, semantic_type);

-- Drop and recreate semantic_clusters with CASCADE (since it references projects)
DROP TABLE IF EXISTS semantic_clusters;

CREATE TABLE semantic_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL,
  cluster_type TEXT NOT NULL, -- 'function_similarity', 'data_structure', 'pattern_based', etc.
  quality REAL NOT NULL, -- Cluster quality score (0-1)
  symbol_count INTEGER NOT NULL DEFAULT 0,
  similarity_threshold REAL NOT NULL,
  centroid_embedding BLOB, -- Base64 encoded centroid embedding
  description TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_semantic_clusters_project_type ON semantic_clusters(project_id, cluster_type);
CREATE INDEX idx_semantic_clusters_quality ON semantic_clusters(quality);
CREATE INDEX idx_semantic_clusters_name ON semantic_clusters(cluster_name);

-- Drop and recreate semantic_insights with CASCADE
DROP TABLE IF EXISTS semantic_insights;

CREATE TABLE semantic_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- 'refactoring_opportunity', 'architectural_violation', 'performance_concern', 'code_smell'
  category TEXT NOT NULL, -- 'architecture', 'performance', 'maintainability', 'quality', 'testing', 'security'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  confidence REAL NOT NULL, -- AI confidence in the insight (0-1)
  priority TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  title TEXT NOT NULL, -- Short descriptive title
  description TEXT NOT NULL, -- Detailed description
  affected_symbols TEXT, -- JSON array of symbol IDs
  cluster_id INTEGER REFERENCES semantic_clusters(id) ON DELETE SET NULL, -- Related cluster if applicable
  metrics TEXT, -- JSON object with relevant metrics
  source_context TEXT, -- Code context that triggered the insight
  reasoning TEXT, -- AI reasoning for the insight
  context_line INTEGER, -- Line number where insight applies
  context_file TEXT, -- File path where insight applies  
  context_snippet TEXT, -- Code snippet for insight
  related_insights TEXT, -- JSON array of related insight IDs
  detected_at INTEGER DEFAULT (strftime('%s', 'now')),
  resolved_at INTEGER,
  resolution TEXT, -- How the insight was resolved
  status TEXT DEFAULT 'active', -- 'active', 'resolved', 'ignored', 'false_positive'
  user_feedback INTEGER, -- -1: negative, 0: neutral, 1: positive
  feedback_comment TEXT,
  feedback_timestamp INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_semantic_insights_project_type ON semantic_insights(project_id, insight_type);
CREATE INDEX idx_semantic_insights_severity ON semantic_insights(severity);
CREATE INDEX idx_semantic_insights_status ON semantic_insights(status);
CREATE INDEX idx_semantic_insights_feedback ON semantic_insights(user_feedback);
CREATE INDEX idx_semantic_insights_confidence ON semantic_insights(confidence);




     CREATE TABLE IF NOT EXISTS api_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        source_symbol_id TEXT,
        target_symbol_id TEXT,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        binding_type TEXT NOT NULL,
        protocol TEXT,
        endpoint TEXT,
        type_mapping TEXT NOT NULL,
        serialization_format TEXT,
        schema_definition TEXT,
        confidence REAL NOT NULL DEFAULT 1.0,
        detector_name TEXT NOT NULL,
        detection_reason TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS cross_language_deps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        from_language TEXT NOT NULL,
        to_language TEXT NOT NULL,
        dependency_type TEXT NOT NULL,
        dependency_path TEXT NOT NULL,
        from_symbol_id TEXT,
        to_symbol_id TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS semantic_equivalents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        symbol_id_1 TEXT NOT NULL,
        symbol_id_2 TEXT NOT NULL,
        equivalence_type TEXT NOT NULL,
        similarity_score REAL NOT NULL DEFAULT 1.0,
        mapping_rules TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(symbol_id_1, symbol_id_2)
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_bindings_project ON api_bindings(project_id);
      CREATE INDEX IF NOT EXISTS idx_api_bindings_type ON api_bindings(binding_type);
      CREATE INDEX IF NOT EXISTS idx_api_bindings_languages ON api_bindings(source_language, target_language);
      CREATE INDEX IF NOT EXISTS idx_cross_deps_project ON cross_language_deps(project_id);
      CREATE INDEX IF NOT EXISTS idx_cross_deps_languages ON cross_language_deps(from_language, to_language);
      CREATE INDEX IF NOT EXISTS idx_semantic_equivalents_project ON semantic_equivalents(project_id);