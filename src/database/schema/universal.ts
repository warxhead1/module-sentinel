import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Universal Database Schema - Base Tables
 * 
 * These tables contain fields that apply to all programming languages.
 * Language-specific features are stored in separate feature tables.
 */

// Projects table - supports multi-project analysis
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  displayName: text('display_name'),
  description: text('description'),
  rootPath: text('root_path').notNull(),
  configPath: text('config_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  metadata: text('metadata'), // JSON
});

// Languages table - supported programming languages
export const languages = sqliteTable('languages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(), // 'cpp', 'python', 'typescript'
  displayName: text('display_name').notNull(), // 'C++', 'Python', 'TypeScript'
  version: text('version'), // Language version support
  parserClass: text('parser_class').notNull(),
  extensions: text('extensions').notNull(), // JSON array
  features: text('features'), // JSON array
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  priority: integer('priority').default(100),
});

// File index - tracks all indexed files across projects
export const fileIndex = sqliteTable('file_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  languageId: integer('language_id').notNull().references(() => languages.id),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  fileHash: text('file_hash'),
  lastParsed: integer('last_parsed', { mode: 'timestamp' }),
  parseDuration: integer('parse_duration'),
  parserVersion: text('parser_version'),
  symbolCount: integer('symbol_count').default(0),
  relationshipCount: integer('relationship_count').default(0),
  patternCount: integer('pattern_count').default(0),
  isIndexed: integer('is_indexed', { mode: 'boolean' }).default(false),
  hasErrors: integer('has_errors', { mode: 'boolean' }).default(false),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  projectPathIdx: index('idx_file_index_project_path').on(table.projectId, table.filePath),
  languageIdx: index('idx_file_index_language').on(table.languageId),
  hashIdx: index('idx_file_index_hash').on(table.fileHash),
}));

// Universal symbols - core symbol information for all languages
export const universalSymbols: any = sqliteTable('universal_symbols', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  languageId: integer('language_id').notNull().references(() => languages.id),
  
  // Core identification
  name: text('name').notNull(),
  qualifiedName: text('qualified_name').notNull(),
  kind: text('kind').notNull(),
  
  // Location information
  filePath: text('file_path').notNull(),
  line: integer('line').notNull(),
  column: integer('column').notNull(),
  endLine: integer('end_line'),
  endColumn: integer('end_column'),
  
  // Type information (language-agnostic)
  returnType: text('return_type'),
  signature: text('signature'),
  visibility: text('visibility'), // 'public', 'private', 'protected', 'internal'
  
  // Semantic information
  namespace: text('namespace'),
  parentSymbolId: integer('parent_symbol_id'),
  isExported: integer('is_exported', { mode: 'boolean' }).default(false),
  isAsync: integer('is_async', { mode: 'boolean' }).default(false),
  isAbstract: integer('is_abstract', { mode: 'boolean' }).default(false),
  
  // Language-specific features stored as JSON
  languageFeatures: text('language_features'), // JSON object
  
  // Semantic tags for cross-language concepts  
  semanticTags: text('semantic_tags'), // JSON array
  
  // Analysis metadata
  confidence: real('confidence').default(1.0),
  
  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  projectLanguageIdx: index('idx_symbols_project_language').on(table.projectId, table.languageId),
  filePathIdx: index('idx_symbols_file_path').on(table.filePath),
  nameIdx: index('idx_symbols_name').on(table.name),
  kindIdx: index('idx_symbols_kind').on(table.kind),
  qualifiedNameIdx: index('idx_symbols_qualified_name').on(table.qualifiedName),
  parentIdx: index('idx_symbols_parent').on(table.parentSymbolId),
}));

// Universal relationships - symbol relationships across all languages  
export const universalRelationships = sqliteTable('universal_relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  
  // Source and target symbols
  fromSymbolId: integer('from_symbol_id').references(() => universalSymbols.id),
  toSymbolId: integer('to_symbol_id').references(() => universalSymbols.id),
  
  // Relationship details
  type: text('type').notNull(), // UniversalRelationshipType enum value
  confidence: real('confidence').notNull().default(1.0),
  
  // Optional context
  contextLine: integer('context_line'),
  contextColumn: integer('context_column'),
  contextSnippet: text('context_snippet'),
  
  // Language-specific metadata
  metadata: text('metadata'), // JSON object
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  fromSymbolIdx: index('idx_relationships_from').on(table.fromSymbolId),
  toSymbolIdx: index('idx_relationships_to').on(table.toSymbolId),
  typeIdx: index('idx_relationships_type').on(table.type),
  projectIdx: index('idx_relationships_project').on(table.projectId),
}));

// Universal patterns - pattern detection across all languages
export const detectedPatterns = sqliteTable('detected_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id),
  
  // Pattern information
  patternType: text('pattern_type').notNull(),
  patternName: text('pattern_name'),
  confidence: real('confidence').notNull(),
  
  // Context
  lineNumber: integer('line_number'),
  details: text('details', { mode: 'json' }),
  
  // Metadata
  detectedBy: text('detected_by').default('unified'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  symbolIdx: index('idx_patterns_symbol').on(table.symbolId),
  typeIdx: index('idx_patterns_type').on(table.patternType),
  projectIdx: index('idx_patterns_project').on(table.projectId),
}));

// Pattern symbols - links patterns to multiple symbols
export const patternSymbols = sqliteTable('pattern_symbols', {
  patternId: integer('pattern_id').notNull().references(() => detectedPatterns.id),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id),
  role: text('role'), // 'primary', 'secondary', 'context'
  confidence: real('confidence').default(1.0),
}, (table) => ({
  pk: primaryKey({ columns: [table.patternId, table.symbolId] }),
  patternIdx: index('idx_pattern_symbols_pattern').on(table.patternId),
  symbolIdx: index('idx_pattern_symbols_symbol').on(table.symbolId),
}));

// Project languages - many-to-many relationship for multi-language projects
export const projectLanguages = sqliteTable('project_languages', {
  projectId: integer('project_id').notNull().references(() => projects.id),
  languageId: integer('language_id').notNull().references(() => languages.id),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  confidence: real('confidence').default(1.0),
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.languageId] }),
  projectIdx: index('idx_project_languages_project').on(table.projectId),
  languageIdx: index('idx_project_languages_language').on(table.languageId),
}));

// Tool usage tracking - MCP tool usage analytics
export const toolUsage = sqliteTable('tool_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id),
  toolName: text('tool_name').notNull(),
  parameters: text('parameters', { mode: 'json' }),
  resultSummary: text('result_summary'),
  success: integer('success', { mode: 'boolean' }).default(true),
  executionTimeMs: integer('execution_time_ms'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  toolNameIdx: index('idx_tool_usage_tool_name').on(table.toolName),
  timestampIdx: index('idx_tool_usage_timestamp').on(table.timestamp),
  projectIdx: index('idx_tool_usage_project').on(table.projectId),
}));

// Search queries - search analytics
export const searchQueries = sqliteTable('search_queries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id),
  query: text('query').notNull(),
  queryType: text('query_type'), // 'find_implementations', 'find_similar', 'semantic_search'
  resultsCount: integer('results_count').default(0),
  success: integer('success', { mode: 'boolean' }).default(true),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  queryTypeIdx: index('idx_search_queries_type').on(table.queryType),
  timestampIdx: index('idx_search_queries_timestamp').on(table.timestamp),
  projectIdx: index('idx_search_queries_project').on(table.projectId),
}));

