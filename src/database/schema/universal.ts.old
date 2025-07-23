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
  
  // Enhanced semantic intelligence fields
  semanticEmbedding: text('semantic_embedding'), // Binary embedding data as base64
  readabilityScore: real('readability_score'),
  architecturalRole: text('architectural_role'), // 'controller', 'service', 'model', 'utility', etc.
  complexityMetrics: text('complexity_metrics'), // JSON object with various complexity measures
  semanticSimilarityHash: text('semantic_similarity_hash'), // For quick similarity lookups
  
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

// Semantic clusters - groups of semantically similar symbols
export const semanticClusters = sqliteTable('semantic_clusters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  clusterName: text('cluster_name').notNull(),
  clusterType: text('cluster_type').notNull(), // 'functional', 'architectural', 'pattern-based'
  centroidEmbedding: text('centroid_embedding'), // Base64 encoded embedding centroid
  similarityThreshold: real('similarity_threshold').default(0.8),
  symbolCount: integer('symbol_count').default(0),
  quality: real('quality'), // Cluster quality metric (0-1)
  description: text('description'), // Auto-generated cluster description
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  projectTypeIdx: index('idx_semantic_clusters_project_type').on(table.projectId, table.clusterType),
  qualityIdx: index('idx_semantic_clusters_quality').on(table.quality),
  nameIdx: index('idx_semantic_clusters_name').on(table.clusterName),
}));

// Cluster membership - many-to-many relationship between symbols and clusters
export const clusterMembership = sqliteTable('cluster_membership', {
  clusterId: integer('cluster_id').notNull().references(() => semanticClusters.id),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id),
  similarity: real('similarity').notNull(), // Similarity to cluster centroid (0-1)
  role: text('role'), // 'core', 'peripheral', 'outlier'
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.clusterId, table.symbolId] }),
  clusterIdx: index('idx_cluster_membership_cluster').on(table.clusterId),
  symbolIdx: index('idx_cluster_membership_symbol').on(table.symbolId),
  similarityIdx: index('idx_cluster_membership_similarity').on(table.similarity),
}));

// Semantic insights - AI-generated insights about code quality and architecture
export const semanticInsights = sqliteTable('semantic_insights', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  insightType: text('insight_type').notNull(), // 'refactoring_opportunity', 'architectural_violation', 'performance_concern', 'code_smell'
  category: text('category').notNull(), // 'architecture', 'performance', 'maintainability', 'quality', 'testing', 'security'
  severity: text('severity').notNull(), // 'info', 'warning', 'error', 'critical'
  confidence: real('confidence').notNull(), // AI confidence in the insight (0-1)
  priority: text('priority').notNull(), // 'low', 'medium', 'high', 'critical'
  title: text('title').notNull(), // Short descriptive title
  description: text('description').notNull(), // Detailed description
  affectedSymbols: text('affected_symbols'), // JSON array of symbol IDs
  clusterId: integer('cluster_id').references(() => semanticClusters.id),
  
  // Metrics and analysis
  metrics: text('metrics'), // JSON object with insight metrics
  reasoning: text('reasoning'), // AI reasoning for the insight
  detectedAt: integer('detected_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  
  // User feedback and learning
  userFeedback: integer('user_feedback').default(0), // -1 (rejected), 0 (pending), 1 (accepted)
  feedbackComment: text('feedback_comment'), // Optional user comment
  feedbackTimestamp: integer('feedback_timestamp', { mode: 'timestamp' }),
  
  // Context and metadata
  contextLine: integer('context_line'),
  contextFile: text('context_file'),
  contextSnippet: text('context_snippet'),
  relatedInsights: text('related_insights'), // JSON array of related insight IDs
  
  // Lifecycle
  status: text('status').default('active'), // 'active', 'resolved', 'dismissed', 'false_positive'
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  projectTypeIdx: index('idx_semantic_insights_project_type').on(table.projectId, table.insightType),
  severityIdx: index('idx_semantic_insights_severity').on(table.severity),
  statusIdx: index('idx_semantic_insights_status').on(table.status),
  feedbackIdx: index('idx_semantic_insights_feedback').on(table.userFeedback),
  confidenceIdx: index('idx_semantic_insights_confidence').on(table.confidence),
}));

// Insight recommendations - specific actionable recommendations for insights
export const insightRecommendations = sqliteTable('insight_recommendations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  insightId: integer('insight_id').notNull().references(() => semanticInsights.id),
  action: text('action').notNull(), // Short action description
  description: text('description').notNull(), // Detailed recommendation
  effort: text('effort').notNull(), // 'low', 'medium', 'high'
  impact: text('impact').notNull(), // 'low', 'medium', 'high'
  priority: integer('priority').notNull(), // 1-10 ranking
  codeExample: text('code_example'), // Optional code example
  relatedSymbols: text('related_symbols'), // JSON array of related symbol IDs
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  insightIdx: index('idx_insight_recommendations_insight').on(table.insightId),
  priorityIdx: index('idx_insight_recommendations_priority').on(table.priority),
  effortImpactIdx: index('idx_insight_recommendations_effort_impact').on(table.effort, table.impact),
}));

// Semantic relationships - enhanced relationships with semantic meaning
export const semanticRelationships = sqliteTable('semantic_relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  
  // Base relationship (can be null for inferred relationships)
  baseRelationshipId: integer('base_relationship_id').references(() => universalRelationships.id),
  
  // Semantic relationship details
  fromSymbolId: integer('from_symbol_id').notNull().references(() => universalSymbols.id),
  toSymbolId: integer('to_symbol_id').notNull().references(() => universalSymbols.id),
  semanticType: text('semantic_type').notNull(), // 'semantic_similarity', 'functional_dependency', 'architectural_layer'
  strength: real('strength').notNull(), // Relationship strength (0-1)
  confidence: real('confidence').notNull(), // Detection confidence (0-1)
  
  // Semantic context
  semanticContext: text('semantic_context'), // JSON object with semantic metadata
  inferenceMethod: text('inference_method'), // How this relationship was discovered
  
  // Validation and feedback
  isValidated: integer('is_validated', { mode: 'boolean' }).default(false),
  validatedBy: text('validated_by'), // User or system that validated
  validationTimestamp: integer('validation_timestamp', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  fromSymbolIdx: index('idx_semantic_relationships_from').on(table.fromSymbolId),
  toSymbolIdx: index('idx_semantic_relationships_to').on(table.toSymbolId),
  typeIdx: index('idx_semantic_relationships_type').on(table.semanticType),
  strengthIdx: index('idx_semantic_relationships_strength').on(table.strength),
  projectIdx: index('idx_semantic_relationships_project').on(table.projectId),
}));

// User preferences - stores user preferences for semantic analysis
export const userPreferences = sqliteTable('user_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(), // User identifier
  projectId: integer('project_id').references(() => projects.id), // Project-specific preferences
  
  // Semantic analysis preferences
  semanticSensitivity: real('semantic_sensitivity').default(0.8), // Threshold for semantic insights
  preferredInsightTypes: text('preferred_insight_types'), // JSON array of preferred insight types
  customSemanticRules: text('custom_semantic_rules'), // JSON array of user-defined rules
  
  // UI preferences
  dashboardLayout: text('dashboard_layout'), // JSON object with dashboard preferences
  visualizationSettings: text('visualization_settings'), // JSON object with viz preferences
  
  // Learning preferences
  feedbackFrequency: text('feedback_frequency').default('normal'), // 'minimal', 'normal', 'verbose'
  learningMode: integer('learning_mode', { mode: 'boolean' }).default(true), // Enable/disable learning from feedback
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  userIdx: index('idx_user_preferences_user').on(table.userId),
  projectIdx: index('idx_user_preferences_project').on(table.projectId),
  userProjectIdx: index('idx_user_preferences_user_project').on(table.userId, table.projectId),
}));

