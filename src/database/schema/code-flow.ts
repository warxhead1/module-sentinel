import { sqliteTable, text, integer, real, foreignKey, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Schema for code flow analysis tables
 */

// Tracks function/method calls between symbols
export const symbolCalls = sqliteTable('symbol_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  callerId: integer('caller_id').notNull(),
  calleeId: integer('callee_id'),
  projectId: integer('project_id'),
  targetFunction: text('target_function'),
  lineNumber: integer('line_number').notNull(),
  columnNumber: integer('column_number'),
  callType: text('call_type').notNull().default('direct'), // direct, virtual, delegate, etc.
  condition: text('condition'), // for conditional calls
  isConditional: integer('is_conditional', { mode: 'boolean' }).notNull().default(false),
  isRecursive: integer('is_recursive', { mode: 'boolean' }).notNull().default(false),
  argumentTypes: text('argument_types'), // JSON array of argument types
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date())
});

// Tracks execution paths through the code
export const codeFlowPaths = sqliteTable('code_flow_paths', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id'),
  startSymbolId: integer('start_symbol_id').notNull(),
  endSymbolId: integer('end_symbol_id'),
  pathNodes: text('path_nodes').notNull(), // JSON array of symbol IDs
  pathConditions: text('path_conditions'), // JSON array of conditions
  pathLength: integer('path_length').notNull(),
  isComplete: integer('is_complete', { mode: 'boolean' }).notNull().default(true),
  isCyclic: integer('is_cyclic', { mode: 'boolean' }).notNull().default(false),
  frequency: integer('frequency').default(0), // How often this path is taken
  coverage: real('coverage').default(0), // Percentage of path covered by tests
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date())
});

// Tracks control flow blocks within functions
export const controlFlowBlocks = sqliteTable('control_flow_blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbolId: integer('symbol_id').notNull(),
  projectId: integer('project_id'),
  blockType: text('block_type').notNull(), // entry, exit, conditional, loop, etc.
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  parentBlockId: integer('parent_block_id'),
  condition: text('condition'), // for conditional blocks
  loopType: text('loop_type'), // for, while, do-while
  complexity: integer('complexity').default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`)
}, (table) => ({
  symbolIdx: index('idx_control_flow_blocks_symbol').on(table.symbolId),
  projectIdx: index('idx_control_flow_blocks_project').on(table.projectId),
  typeIdx: index('idx_control_flow_blocks_type').on(table.blockType),
  parentIdx: index('idx_control_flow_blocks_parent').on(table.parentBlockId)
}));

// Tracks data flow within and between functions
export const dataFlowEdges = sqliteTable('data_flow_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceSymbolId: integer('source_symbol_id').notNull(),
  targetSymbolId: integer('target_symbol_id').notNull(),
  variableName: text('variable_name').notNull(),
  flowType: text('flow_type').notNull(), // parameter, return, global, member
  lineNumber: integer('line_number').notNull(),
  isModified: integer('is_modified', { mode: 'boolean' }).notNull().default(false),
  dataDependencies: text('data_dependencies') // JSON array of dependent variables
});

// Relations - will be defined later when universalSymbols is available
export const symbolCallsRelations = relations(symbolCalls, ({}) => ({}));
export const codeFlowPathsRelations = relations(codeFlowPaths, ({}) => ({}));
export const controlFlowBlocksRelations = relations(controlFlowBlocks, ({}) => ({}));
export const dataFlowEdgesRelations = relations(dataFlowEdges, ({}) => ({}));