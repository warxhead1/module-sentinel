-- Migration: Add missing project_id column to control_flow_blocks table
-- This fixes the SQLite error where control_flow_blocks table has no column named project_id

-- First, rename the existing table if it exists
DROP TABLE IF EXISTS control_flow_blocks_backup;
ALTER TABLE control_flow_blocks RENAME TO control_flow_blocks_backup;

-- Create the new table with proper schema including project_id
CREATE TABLE control_flow_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL, -- entry, exit, conditional, loop, etc.
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_block_id INTEGER REFERENCES control_flow_blocks(id) ON DELETE SET NULL,
  condition TEXT, -- for conditional blocks
  loop_type TEXT, -- for, while, do-while
  complexity INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Copy data from backup table if it exists, setting project_id from the symbol's project
INSERT INTO control_flow_blocks (id, symbol_id, project_id, block_type, start_line, end_line, parent_block_id, condition, loop_type, complexity)
SELECT 
  b.id,
  b.symbol_id,
  s.project_id,  -- Get project_id from the related symbol
  b.block_type,
  b.start_line,
  b.end_line,
  b.parent_block_id,
  b.condition,
  b.loop_type,
  b.complexity
FROM control_flow_blocks_backup b
LEFT JOIN universal_symbols s ON b.symbol_id = s.id
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='control_flow_blocks_backup');

-- Drop the backup table
DROP TABLE IF EXISTS control_flow_blocks_backup;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_symbol ON control_flow_blocks(symbol_id);
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_project ON control_flow_blocks(project_id);
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_type ON control_flow_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_control_flow_blocks_parent ON control_flow_blocks(parent_block_id);