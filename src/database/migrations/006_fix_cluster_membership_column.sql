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