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