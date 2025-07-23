/**
 * Module Sentinel - Hybrid Database Schema
 * 
 * This schema is designed to:
 * 1. Preserve all existing C++ analysis capabilities from clean-unified-schema.ts
 * 2. Support multi-language and multi-project analysis
 * 3. Be extensible for future language support
 * 4. Maintain clean separation between universal and language-specific features
 * 
 * STRUCTURE:
 * - UNIVERSAL TABLES: Core tables that work across all languages
 * - C++ FEATURES: Rich C++ analysis (preserves all existing functionality)
 * - ANALYTICS & TRACKING: MCP tools and usage tracking
 * - RELATIONSHIPS: Cross-language symbol relationships
 * - RICH SEMANTIC ANALYSIS: Advanced analysis tables (preserved from original)
 * 
 * MIGRATION STRATEGY:
 * Direct mapping from existing enhanced_symbols table to preserve all C++ complexity
 */

import { sqliteTable, integer, text, real, blob, index, uniqueIndex, primaryKey, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

// Export code flow tables
export { 
  symbolCalls, 
  codeFlowPaths, 
  controlFlowBlocks, 
  dataFlowEdges,
  symbolCallsRelations,
  codeFlowPathsRelations,
  controlFlowBlocksRelations,
  dataFlowEdgesRelations
} from '../schema/code-flow';

// ============================================================================
// PROJECT MANAGEMENT TABLES
// ============================================================================

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name'),
  description: text('description'),
  rootPath: text('root_path').notNull(),
  configPath: text('config_path'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>()
}, (table) => ({
  nameIdx: index('idx_projects_name').on(table.name),
  activeIdx: index('idx_projects_active').on(table.isActive),
  rootPathIdx: index('idx_projects_root_path').on(table.rootPath)
}));

export const languages = sqliteTable('languages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  version: text('version'),
  parserClass: text('parser_class').notNull(),
  extensions: text('extensions', { mode: 'json' }).$type<string[]>().notNull(),
  features: text('features', { mode: 'json' }).$type<string[]>(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  priority: integer('priority').default(100)
}, (table) => ({
  nameIdx: index('idx_languages_name').on(table.name),
  enabledIdx: index('idx_languages_enabled').on(table.isEnabled),
  priorityIdx: index('idx_languages_priority').on(table.priority)
}));

export const projectLanguages = sqliteTable('project_languages', {
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  languageId: integer('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
  config: text('config', { mode: 'json' }).$type<Record<string, any>>(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  pk: primaryKey({ columns: [table.projectId, table.languageId] }),
  projectIdx: index('idx_project_languages_project').on(table.projectId),
  languageIdx: index('idx_project_languages_language').on(table.languageId)
}));

// ============================================================================
// UNIVERSAL SYMBOL TABLES
// ============================================================================

export const universalSymbols = sqliteTable('universal_symbols', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  languageId: integer('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
  
  // Core identification
  name: text('name').notNull(),
  qualifiedName: text('qualified_name').notNull(),
  kind: text('kind').notNull(), // UniversalSymbolKind enum
  
  // Location information
  filePath: text('file_path').notNull(),
  line: integer('line').notNull(),
  column: integer('column').notNull(),
  endLine: integer('end_line'),
  endColumn: integer('end_column'),
  
  // Type information
  returnType: text('return_type'),
  signature: text('signature'),
  visibility: text('visibility'), // 'public', 'private', 'protected', 'internal'
  
  // Semantic information
  namespace: text('namespace'),
  parentSymbolId: integer('parent_symbol_id'), // FK defined in table config below
  isExported: integer('is_exported', { mode: 'boolean' }).default(false),
  isAsync: integer('is_async', { mode: 'boolean' }).default(false),
  isAbstract: integer('is_abstract', { mode: 'boolean' }).default(false),
  
  // Language-specific features as JSON
  languageFeatures: text('language_features', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Semantic tags
  semanticTags: text('semantic_tags', { mode: 'json' }).$type<string[]>(),
  
  // Quality metrics
  confidence: real('confidence').default(1.0),
  
  // Metadata
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  projectIdx: index('idx_universal_symbols_project').on(table.projectId),
  languageIdx: index('idx_universal_symbols_language').on(table.languageId),
  qualifiedNameIdx: index('idx_universal_symbols_qualified_name').on(table.qualifiedName),
  kindIdx: index('idx_universal_symbols_kind').on(table.kind),
  filePathIdx: index('idx_universal_symbols_file_path').on(table.filePath),
  namespaceIdx: index('idx_universal_symbols_namespace').on(table.namespace),
  parentIdx: index('idx_universal_symbols_parent').on(table.parentSymbolId),
  parentFk: foreignKey({
    columns: [table.parentSymbolId],
    foreignColumns: [table.id],
    name: 'fk_universal_symbols_parent'
  }),
  uniqueSymbol: uniqueIndex('idx_universal_symbols_unique').on(
    table.projectId, table.languageId, table.qualifiedName, table.filePath, table.line
  )
}));

export const universalRelationships = sqliteTable('universal_relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Source and target symbols
  fromSymbolId: integer('from_symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  toSymbolId: integer('to_symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Relationship details
  type: text('type').notNull(), // UniversalRelationshipType enum
  confidence: real('confidence').notNull().default(1.0),
  
  // Optional context
  contextLine: integer('context_line'),
  contextColumn: integer('context_column'),
  contextSnippet: text('context_snippet'),
  
  // Language-specific metadata
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  projectIdx: index('idx_universal_relationships_project').on(table.projectId),
  fromIdx: index('idx_universal_relationships_from').on(table.fromSymbolId),
  toIdx: index('idx_universal_relationships_to').on(table.toSymbolId),
  typeIdx: index('idx_universal_relationships_type').on(table.type),
  uniqueRel: uniqueIndex('idx_universal_relationships_unique').on(
    table.fromSymbolId, table.toSymbolId, table.type
  )
}));

// ============================================================================
// LANGUAGE-SPECIFIC FEATURE TABLES
// ============================================================================

// C++ FEATURES - ALL C++ analysis capabilities preserved from clean-unified-schema.ts
export const cppFeatures = sqliteTable('cpp_features', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // C++ Type System (preserved from original)
  isPointer: integer('is_pointer', { mode: 'boolean' }).default(false),
  isReference: integer('is_reference', { mode: 'boolean' }).default(false),
  isConst: integer('is_const', { mode: 'boolean' }).default(false),
  isVolatile: integer('is_volatile', { mode: 'boolean' }).default(false),
  isConstexpr: integer('is_constexpr', { mode: 'boolean' }).default(false),
  isConsteval: integer('is_consteval', { mode: 'boolean' }).default(false),
  isConstinit: integer('is_constinit', { mode: 'boolean' }).default(false),
  
  // C++ Object Model (preserved from original)
  isVirtual: integer('is_virtual', { mode: 'boolean' }).default(false),
  isOverride: integer('is_override', { mode: 'boolean' }).default(false),
  isFinal: integer('is_final', { mode: 'boolean' }).default(false),
  isStatic: integer('is_static', { mode: 'boolean' }).default(false),
  isInline: integer('is_inline', { mode: 'boolean' }).default(false),
  isFriend: integer('is_friend', { mode: 'boolean' }).default(false),
  
  // C++ Special Members (preserved from original)
  isConstructor: integer('is_constructor', { mode: 'boolean' }).default(false),
  isDestructor: integer('is_destructor', { mode: 'boolean' }).default(false),
  isOperator: integer('is_operator', { mode: 'boolean' }).default(false),
  operatorType: text('operator_type'),
  isConversion: integer('is_conversion', { mode: 'boolean' }).default(false),
  
  // C++ Templates (preserved from original)
  isTemplate: integer('is_template', { mode: 'boolean' }).default(false),
  isTemplateSpecialization: integer('is_template_specialization', { mode: 'boolean' }).default(false),
  templateParams: text('template_params', { mode: 'json' }).$type<any[]>(),
  templateArgs: text('template_args', { mode: 'json' }).$type<any[]>(),
  
  // C++ Enums (preserved from original)
  isEnum: integer('is_enum', { mode: 'boolean' }).default(false),
  isEnumClass: integer('is_enum_class', { mode: 'boolean' }).default(false),
  enumValues: text('enum_values', { mode: 'json' }).$type<any[]>(),
  
  // C++ Type Information (preserved from original)
  baseType: text('base_type'),
  parentClass: text('parent_class'),
  mangledName: text('mangled_name'),
  usr: text('usr'),
  
  // C++ Modules (C++20/23) (preserved from original)
  isModuleInterface: integer('is_module_interface', { mode: 'boolean' }).default(false),
  moduleName: text('module_name'),
  isModuleExported: integer('is_module_exported', { mode: 'boolean' }).default(false),
  exportNamespace: text('export_namespace'),
  
  // C++ Exceptions (preserved from original)
  isNoexcept: integer('is_noexcept', { mode: 'boolean' }).default(false),
  exceptionSpec: text('exception_spec'),
  
  // C++ Attributes (preserved from original)
  attributes: text('attributes', { mode: 'json' }).$type<string[]>(),
  
  // C++ Concepts (C++20) (preserved from original)
  isConcept: integer('is_concept', { mode: 'boolean' }).default(false),
  conceptConstraints: text('concept_constraints'),
  
  // Domain-Specific Types (preserved from original)
  isVulkanType: integer('is_vulkan_type', { mode: 'boolean' }).default(false),
  isStdType: integer('is_std_type', { mode: 'boolean' }).default(false),
  isPlanetgenType: integer('is_planetgen_type', { mode: 'boolean' }).default(false),
  
  // C++ Pattern Flags (preserved from original)
  isFactory: integer('is_factory', { mode: 'boolean' }).default(false),
  isVulkanApi: integer('is_vulkan_api', { mode: 'boolean' }).default(false),
  usesSmartPointers: integer('uses_smart_pointers', { mode: 'boolean' }).default(false),
  usesModernCpp: integer('uses_modern_cpp', { mode: 'boolean' }).default(false),
  
  // Execution Patterns (preserved from original)
  returnsVectorFloat: integer('returns_vector_float', { mode: 'boolean' }).default(false),
  usesGpuCompute: integer('uses_gpu_compute', { mode: 'boolean' }).default(false),
  hasCpuFallback: integer('has_cpu_fallback', { mode: 'boolean' }).default(false),
  isGenerator: integer('is_generator', { mode: 'boolean' }).default(false),
  
  // Metadata
  lastAnalyzed: integer('last_analyzed', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  // Essential indexes for C++ analysis performance
  templateIdx: index('idx_cpp_features_template').on(table.isTemplate),
  vulkanIdx: index('idx_cpp_features_vulkan').on(table.isVulkanType),
  modernIdx: index('idx_cpp_features_modern').on(table.usesModernCpp),
  stdIdx: index('idx_cpp_features_std').on(table.isStdType),
  planetgenIdx: index('idx_cpp_features_planetgen').on(table.isPlanetgenType),
  mangledIdx: index('idx_cpp_features_mangled').on(table.mangledName),
  usrIdx: index('idx_cpp_features_usr').on(table.usr),
  moduleIdx: index('idx_cpp_features_module').on(table.moduleName),
  baseTypeIdx: index('idx_cpp_features_base_type').on(table.baseType),
  parentIdx: index('idx_cpp_features_parent').on(table.parentClass),
}));

export const pythonFeatures = sqliteTable('python_features', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Function/Method features
  isGenerator: integer('is_generator', { mode: 'boolean' }).default(false),
  isCoroutine: integer('is_coroutine', { mode: 'boolean' }).default(false),
  isLambda: integer('is_lambda', { mode: 'boolean' }).default(false),
  isStaticmethod: integer('is_staticmethod', { mode: 'boolean' }).default(false),
  isClassmethod: integer('is_classmethod', { mode: 'boolean' }).default(false),
  isProperty: integer('is_property', { mode: 'boolean' }).default(false),
  
  // Decorators
  decorators: text('decorators', { mode: 'json' }).$type<string[]>(),
  
  // Type hints
  typeAnnotations: text('type_annotations', { mode: 'json' }).$type<Record<string, any>>(),
  returnAnnotation: text('return_annotation'),
  
  // Documentation
  docstring: text('docstring'),
  docstringFormat: text('docstring_format'), // 'google', 'numpy', 'sphinx', etc.
  
  // Parameters
  parameters: text('parameters', { mode: 'json' }).$type<any[]>(), // with default values, *args, **kwargs
  hasVarargs: integer('has_varargs', { mode: 'boolean' }).default(false),
  hasKwargs: integer('has_kwargs', { mode: 'boolean' }).default(false),
  
  // Class features
  baseClasses: text('base_classes', { mode: 'json' }).$type<string[]>(),
  metaclass: text('metaclass'),
  isDataclass: integer('is_dataclass', { mode: 'boolean' }).default(false),
  isNamedtuple: integer('is_namedtuple', { mode: 'boolean' }).default(false),
  isEnum: integer('is_enum', { mode: 'boolean' }).default(false),
  
  // Module features
  isDunderAll: integer('is_dunder_all', { mode: 'boolean' }).default(false),
  dunderAllExports: text('dunder_all_exports', { mode: 'json' }).$type<string[]>(),
  
  // Context managers
  isContextManager: integer('is_context_manager', { mode: 'boolean' }).default(false),
  isAsyncContextManager: integer('is_async_context_manager', { mode: 'boolean' }).default(false),
  
  // Legacy compatibility fields
  isAsync: integer('is_async', { mode: 'boolean' }).default(false),
  isDunder: integer('is_dunder', { mode: 'boolean' }).default(false),
  typeHint: text('type_hint'),
  returnTypeHint: text('return_type_hint'),
  importFrom: text('import_from'),
  importAs: text('import_as'),
  isRelativeImport: integer('is_relative_import', { mode: 'boolean' }).default(false)
});

export const typescriptFeatures = sqliteTable('typescript_features', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Type system
  isReadonly: integer('is_readonly', { mode: 'boolean' }).default(false),
  isOptional: integer('is_optional', { mode: 'boolean' }).default(false),
  typeParameters: text('type_parameters', { mode: 'json' }).$type<any[]>(),
  typeConstraints: text('type_constraints', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Function features
  isArrowFunction: integer('is_arrow_function', { mode: 'boolean' }).default(false),
  isGenerator: integer('is_generator', { mode: 'boolean' }).default(false),
  
  // Decorators (experimental)
  decorators: text('decorators', { mode: 'json' }).$type<string[]>(),
  
  // Access modifiers (TypeScript)
  accessModifier: text('access_modifier'), // 'public', 'private', 'protected'
  
  // Class features
  isAbstract: integer('is_abstract', { mode: 'boolean' }).default(false),
  implementsInterfaces: text('implements_interfaces', { mode: 'json' }).$type<string[]>(),
  extendsClasses: text('extends_classes', { mode: 'json' }).$type<string[]>(),
  
  // Interface/Type features
  isInterface: integer('is_interface', { mode: 'boolean' }).default(false),
  isTypeAlias: integer('is_type_alias', { mode: 'boolean' }).default(false),
  isEnum: integer('is_enum', { mode: 'boolean' }).default(false),
  isNamespace: integer('is_namespace', { mode: 'boolean' }).default(false),
  
  // Module system
  exportType: text('export_type'), // 'named', 'default', 'namespace', 'type-only'
  importType: text('import_type'), // 'named', 'default', 'namespace', 'type-only', 'side-effect'
  moduleType: text('module_type'), // 'commonjs', 'esm', 'umd', 'amd'
  
  // JSX/React specific
  isReactComponent: integer('is_react_component', { mode: 'boolean' }).default(false),
  isReactHook: integer('is_react_hook', { mode: 'boolean' }).default(false),
  jsxReturnType: text('jsx_return_type'),
  
  // Additional TypeScript features
  isGeneric: integer('is_generic', { mode: 'boolean' }).default(false),
  isTypeGuard: integer('is_type_guard', { mode: 'boolean' }).default(false),
  isAssertion: integer('is_assertion', { mode: 'boolean' }).default(false),
  
  // Documentation
  jsDocComments: text('jsdoc_comments', { mode: 'json' }).$type<Record<string, any>>(),
  tsDocComments: text('tsdoc_comments', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Legacy compatibility fields
  typeAnnotation: text('type_annotation'),
  genericParams: text('generic_params', { mode: 'json' }).$type<any[]>(),
  isUnionType: integer('is_union_type', { mode: 'boolean' }).default(false),
  isIntersectionType: integer('is_intersection_type', { mode: 'boolean' }).default(false),
  isConditionalType: integer('is_conditional_type', { mode: 'boolean' }).default(false),
  isMappedType: integer('is_mapped_type', { mode: 'boolean' }).default(false),
  utilityType: text('utility_type'),
  isAmbient: integer('is_ambient', { mode: 'boolean' }).default(false),
  isDeclaration: integer('is_declaration', { mode: 'boolean' }).default(false)
});

// ============================================================================
// CROSS-LANGUAGE FEATURES
// ============================================================================

export const apiBindings = sqliteTable('api_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Source and target symbols
  sourceSymbolId: integer('source_symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  targetSymbolId: integer('target_symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Binding details
  bindingType: text('binding_type').notNull(), // 'ffi', 'rest', 'grpc', 'websocket'
  protocol: text('protocol'), // 'http', 'tcp', 'unix'
  endpoint: text('endpoint'),
  
  // Type mapping
  typeMapping: text('type_mapping', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Serialization info
  serializationFormat: text('serialization_format'), // 'json', 'protobuf', 'msgpack'
  schemaDefinition: text('schema_definition'),
  
  // Metadata
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  confidence: real('confidence').default(1.0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  projectIdx: index('idx_api_bindings_project').on(table.projectId),
  sourceIdx: index('idx_api_bindings_source').on(table.sourceSymbolId),
  targetIdx: index('idx_api_bindings_target').on(table.targetSymbolId),
  typeIdx: index('idx_api_bindings_type').on(table.bindingType)
}));

export const crossLanguageDeps = sqliteTable('cross_language_deps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Source and target languages
  fromLanguageId: integer('from_language_id').references(() => languages.id),
  toLanguageId: integer('to_language_id').references(() => languages.id),
  
  // Dependency details
  dependencyType: text('dependency_type').notNull(), // 'build', 'runtime', 'interface'
  dependencyPath: text('dependency_path'),
  
  // Symbols involved
  fromSymbolId: integer('from_symbol_id').references(() => universalSymbols.id),
  toSymbolId: integer('to_symbol_id').references(() => universalSymbols.id),
  
  // Metadata
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  projectIdx: index('idx_cross_language_deps_project').on(table.projectId),
  fromLangIdx: index('idx_cross_language_deps_from_lang').on(table.fromLanguageId),
  toLangIdx: index('idx_cross_language_deps_to_lang').on(table.toLanguageId)
}));

export const semanticEquivalents = sqliteTable('semantic_equivalents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Equivalent symbols
  symbolId1: integer('symbol_id_1').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  symbolId2: integer('symbol_id_2').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Equivalence details
  equivalenceType: text('equivalence_type').notNull(), // 'identical', 'similar', 'mapped'
  similarityScore: real('similarity_score').notNull().default(1.0),
  
  // Mapping information
  mappingRules: text('mapping_rules', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Metadata
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  projectIdx: index('idx_semantic_equivalents_project').on(table.projectId),
  symbol1Idx: index('idx_semantic_equivalents_symbol1').on(table.symbolId1),
  symbol2Idx: index('idx_semantic_equivalents_symbol2').on(table.symbolId2),
  uniqueEquiv: uniqueIndex('idx_semantic_equivalents_unique').on(table.symbolId1, table.symbolId2)
}));

// ============================================================================
// SEMANTIC TAGGING SYSTEM
// ============================================================================

export const semanticTagDefinitions = sqliteTable('semantic_tag_definitions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // 'pattern', 'architecture', 'performance'
  
  // Scope
  isUniversal: integer('is_universal', { mode: 'boolean' }).default(true),
  applicableLanguages: text('applicable_languages', { mode: 'json' }).$type<string[]>(),
  
  // Hierarchy
  parentTagId: integer('parent_tag_id'), // FK defined in table config below
  
  // Validation
  validationRules: text('validation_rules', { mode: 'json' }).$type<Record<string, any>>(),
  
  // UI
  color: text('color'),
  icon: text('icon'),
  
  // Metadata
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  isActive: integer('is_active', { mode: 'boolean' }).default(true)
}, (table) => ({
  nameIdx: index('idx_semantic_tag_definitions_name').on(table.name),
  categoryIdx: index('idx_semantic_tag_definitions_category').on(table.category),
  parentIdx: index('idx_semantic_tag_definitions_parent').on(table.parentTagId),
  parentFk: foreignKey({
    columns: [table.parentTagId],
    foreignColumns: [table.id],
    name: 'fk_semantic_tag_definitions_parent'
  })
}));

export const symbolSemanticTags = sqliteTable('symbol_semantic_tags', {
  symbolId: integer('symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').references(() => semanticTagDefinitions.id, { onDelete: 'cascade' }),
  
  // Tag metadata
  confidence: real('confidence').default(1.0),
  autoDetected: integer('auto_detected', { mode: 'boolean' }).default(false),
  detectorName: text('detector_name'),
  
  // Context
  context: text('context', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  pk: primaryKey({ columns: [table.symbolId, table.tagId] }),
  symbolIdx: index('idx_symbol_semantic_tags_symbol').on(table.symbolId),
  tagIdx: index('idx_symbol_semantic_tags_tag').on(table.tagId)
}));

// ============================================================================
// PATTERN DETECTION RESULTS
// ============================================================================

export const detectedPatterns = sqliteTable('detected_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Pattern details
  patternType: text('pattern_type').notNull(),
  patternName: text('pattern_name'),
  description: text('description'),
  confidence: real('confidence').notNull().default(1.0),
  severity: text('severity').default('info'), // 'info', 'warning', 'error'
  
  // Detection metadata
  detectorName: text('detector_name'),
  detectorVersion: text('detector_version'),
  detectionTime: text('detection_time').default(sql`CURRENT_TIMESTAMP`),
  
  // Suggestions
  suggestions: text('suggestions', { mode: 'json' }).$type<string[]>(),
  
  // Metadata
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>()
}, (table) => ({
  projectIdx: index('idx_detected_patterns_project').on(table.projectId),
  typeIdx: index('idx_detected_patterns_type').on(table.patternType),
  severityIdx: index('idx_detected_patterns_severity').on(table.severity)
}));

export const patternSymbols = sqliteTable('pattern_symbols', {
  patternId: integer('pattern_id').references(() => detectedPatterns.id, { onDelete: 'cascade' }),
  symbolId: integer('symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  role: text('role') // Role in pattern (e.g., 'factory', 'product')
}, (table) => ({
  pk: primaryKey({ columns: [table.patternId, table.symbolId] }),
  patternIdx: index('idx_pattern_symbols_pattern').on(table.patternId),
  symbolIdx: index('idx_pattern_symbols_symbol').on(table.symbolId)
}));

// ============================================================================
// RICH SEMANTIC ANALYSIS - Advanced analysis tables (preserved from original)
// ============================================================================

// C++ MEMORY PATTERNS - Memory management analysis (preserved from original)
export const cppMemoryPatterns = sqliteTable('cpp_memory_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Memory pattern details (preserved from original)
  patternType: text('pattern_type').notNull(), // 'allocation', 'deallocation', 'access', 'leak_risk'
  allocationMethod: text('allocation_method'), // 'stack', 'heap', 'pool', 'custom'
  memorySizeEstimate: integer('memory_size_estimate'),
  
  // Performance characteristics (preserved from original)
  isCacheFriendly: integer('is_cache_friendly', { mode: 'boolean' }).default(false),
  hasAlignmentOptimization: integer('has_alignment_optimization', { mode: 'boolean' }).default(false),
  usesRaii: integer('uses_raii', { mode: 'boolean' }).default(false),
  
  // Safety analysis (preserved from original)
  potentialLeak: integer('potential_leak', { mode: 'boolean' }).default(false),
  potentialDoubleFree: integer('potential_double_free', { mode: 'boolean' }).default(false),
  potentialUseAfterFree: integer('potential_use_after_free', { mode: 'boolean' }).default(false),
  
  // Context (preserved from original)
  sourceLocation: text('source_location'),
  evidence: text('evidence'),
  confidence: real('confidence').default(0.8),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  symbolIdx: index('idx_cpp_memory_symbol').on(table.symbolId),
  patternIdx: index('idx_cpp_memory_pattern').on(table.patternType),
}));

// C++ VULKAN PATTERNS - Vulkan API usage analysis (preserved from original)
export const cppVulkanPatterns = sqliteTable('cpp_vulkan_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Vulkan operation details (preserved from original)
  operationType: text('operation_type').notNull(), // 'descriptor_set', 'command_buffer', 'pipeline', 'memory'
  vulkanObjectType: text('vulkan_object_type'), // 'VkDevice', 'VkCommandBuffer', etc.
  resourceLifetime: text('resource_lifetime'), // 'frame', 'persistent', 'temporary'
  sharingMode: text('sharing_mode'), // 'exclusive', 'concurrent'
  
  // Performance characteristics (preserved from original)
  isGpuHeavy: integer('is_gpu_heavy', { mode: 'boolean' }).default(false),
  estimatedGpuMemoryMb: integer('estimated_gpu_memory_mb').default(0),
  synchronizationRequired: integer('synchronization_required', { mode: 'boolean' }).default(false),
  
  // Best practices compliance (preserved from original)
  followsVulkanBestPractices: integer('follows_vulkan_best_practices', { mode: 'boolean' }).default(true),
  potentialPerformanceIssue: text('potential_performance_issue'),
  
  // Pipeline stage (preserved from original)
  pipelineStage: text('pipeline_stage'),
  
  // Metadata
  confidence: real('confidence').default(0.8),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  symbolIdx: index('idx_cpp_vulkan_symbol').on(table.symbolId),
  operationIdx: index('idx_cpp_vulkan_operation').on(table.operationType),
  objectTypeIdx: index('idx_cpp_vulkan_object_type').on(table.vulkanObjectType),
}));

// C++ FUNCTION PARAMETERS - Enhanced parameter analysis (preserved from original)
export const cppFunctionParameters = sqliteTable('cpp_function_parameters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  functionSymbolId: integer('function_symbol_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Parameter details (preserved from original)
  parameterName: text('parameter_name').notNull(),
  parameterType: text('parameter_type').notNull(),
  position: integer('position').notNull(),
  
  // C++ type qualifiers (preserved from original)
  isConst: integer('is_const', { mode: 'boolean' }).default(false),
  isPointer: integer('is_pointer', { mode: 'boolean' }).default(false),
  isReference: integer('is_reference', { mode: 'boolean' }).default(false),
  isTemplate: integer('is_template', { mode: 'boolean' }).default(false),
  templateArgs: text('template_args', { mode: 'json' }).$type<any[]>(),
  
  // Parameter semantics (preserved from original)
  defaultValue: text('default_value'),
  semanticRole: text('semantic_role'), // 'input_data', 'output_buffer', 'config', 'context'
  dataFlowStage: text('data_flow_stage'), // pipeline stage this parameter belongs to
  
  // Metadata
  confidence: real('confidence').default(0.8),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  functionIdx: index('idx_cpp_params_function').on(table.functionSymbolId),
  typeIdx: index('idx_cpp_params_type').on(table.parameterType),
  roleIdx: index('idx_cpp_params_role').on(table.semanticRole),
}));

// C++ METHOD COMPLEXITY - Method complexity analysis (preserved from original)
export const cppMethodComplexity = sqliteTable('cpp_method_complexity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Complexity metrics (preserved from original)
  cyclomaticComplexity: integer('cyclomatic_complexity').default(0),
  cognitiveComplexity: integer('cognitive_complexity').default(0),
  nestingDepth: integer('nesting_depth').default(0),
  parameterCount: integer('parameter_count').default(0),
  localVariableCount: integer('local_variable_count').default(0),
  lineCount: integer('line_count').default(0),
  
  // Performance characteristics (preserved from original)
  hasLoops: integer('has_loops', { mode: 'boolean' }).default(false),
  hasRecursion: integer('has_recursion', { mode: 'boolean' }).default(false),
  hasDynamicAllocation: integer('has_dynamic_allocation', { mode: 'boolean' }).default(false),
  hasExceptionHandling: integer('has_exception_handling', { mode: 'boolean' }).default(false),
  
  // Maintainability metrics (preserved from original)
  readabilityScore: real('readability_score').default(0.0),
  testabilityScore: real('testability_score').default(0.0),
  
  // Metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  symbolIdx: index('idx_cpp_complexity_symbol').on(table.symbolId),
  cyclomaticIdx: index('idx_cpp_complexity_cyclomatic').on(table.cyclomaticComplexity),
  cognitiveIdx: index('idx_cpp_complexity_cognitive').on(table.cognitiveComplexity),
  readabilityIdx: index('idx_cpp_complexity_readability').on(table.readabilityScore),
}));

// CALL CHAINS - Call chain analysis for data flow tracking (preserved from original)
export const callChains = sqliteTable('call_chains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entryPointId: integer('entry_point_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Chain metrics (preserved from original)
  chainDepth: integer('chain_depth').default(0),
  totalFunctions: integer('total_functions').default(0),
  
  // Pipeline analysis (preserved from original)
  crossesStageBoundaries: integer('crosses_stage_boundaries', { mode: 'boolean' }).default(false),
  stageTransitions: text('stage_transitions', { mode: 'json' }).$type<any[]>(),
  
  // Performance analysis (preserved from original)
  estimatedExecutionTimeMs: real('estimated_execution_time_ms').default(0.0),
  hasPerformanceBottleneck: integer('has_performance_bottleneck', { mode: 'boolean' }).default(false),
  bottleneckLocation: text('bottleneck_location'),
  
  // Data flow analysis (preserved from original)
  dataTransformationType: text('data_transformation_type'), // 'generation', 'processing', 'rendering'
  inputDataTypes: text('input_data_types', { mode: 'json' }).$type<any[]>(),
  outputDataTypes: text('output_data_types', { mode: 'json' }).$type<any[]>(),
}, (table) => ({
  entryPointIdx: index('idx_call_chains_entry_point').on(table.entryPointId),
}));

// CALL CHAIN STEPS - Individual steps in call chains (preserved from original)
export const callChainSteps = sqliteTable('call_chain_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: integer('chain_id').notNull().references(() => callChains.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  callerId: integer('caller_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  calleeId: integer('callee_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Context (preserved from original)
  callSiteLine: integer('call_site_line'),
  callContext: text('call_context'),
  
  // Data flow (preserved from original)
  dataPassed: text('data_passed'), // description of data being passed
  dataTransformed: integer('data_transformed', { mode: 'boolean' }).default(false),
  transformationType: text('transformation_type'),
  
  // Performance impact (preserved from original)
  estimatedStepTimeMs: real('estimated_step_time_ms').default(0.0),
  isPerformanceCritical: integer('is_performance_critical', { mode: 'boolean' }).default(false),
}, (table) => ({
  chainIdx: index('idx_call_chain_steps_chain').on(table.chainId),
  callerIdx: index('idx_call_chain_steps_caller').on(table.callerId),
  calleeIdx: index('idx_call_chain_steps_callee').on(table.calleeId),
}));

// RICH FUNCTION CALLS - Detailed function call analysis (preserved from original)
export const richFunctionCalls = sqliteTable('rich_function_calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  callerId: integer('caller_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  calleeId: integer('callee_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  callSiteLine: integer('call_site_line').notNull(),
  
  // Call context (preserved from original)
  callType: text('call_type').notNull(), // 'direct', 'virtual', 'function_pointer', 'lambda'
  isVulkanApi: integer('is_vulkan_api', { mode: 'boolean' }).default(false),
  vulkanOperationCategory: text('vulkan_operation_category'), // 'setup', 'dispatch', 'synchronization'
  
  // Performance analysis (preserved from original)
  callFrequencyEstimate: text('call_frequency_estimate'), // 'once', 'per_frame', 'per_object', 'high_frequency'
  isGpuDispatch: integer('is_gpu_dispatch', { mode: 'boolean' }).default(false),
  hasSideEffects: integer('has_side_effects', { mode: 'boolean' }).default(false),
  
  // Data flow (preserved from original)
  passesLargeData: integer('passes_large_data', { mode: 'boolean' }).default(false),
  estimatedDataSizeBytes: integer('estimated_data_size_bytes').default(0),
  modifiesGlobalState: integer('modifies_global_state', { mode: 'boolean' }).default(false),
  
  // Pipeline context (preserved from original)
  pipelineStageFrom: text('pipeline_stage_from'),
  pipelineStageTo: text('pipeline_stage_to'),
  crossesStageBoundary: integer('crosses_stage_boundary', { mode: 'boolean' }).default(false),
}, (table) => ({
  callerIdx: index('idx_rich_calls_caller').on(table.callerId),
  calleeIdx: index('idx_rich_calls_callee').on(table.calleeId),
  vulkanIdx: index('idx_rich_calls_vulkan').on(table.isVulkanApi),
  crossesIdx: index('idx_rich_calls_crosses').on(table.crossesStageBoundary),
}));

// CLASS HIERARCHIES - C++ inheritance tracking (preserved from original)
export const cppClassHierarchies = sqliteTable('cpp_class_hierarchies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  classSymbolId: integer('class_symbol_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  baseClassSymbolId: integer('base_class_symbol_id').references(() => universalSymbols.id, { onDelete: 'cascade' }),
  
  // Inheritance details (preserved from original)
  className: text('class_name').notNull(),
  baseClassName: text('base_class_name'),
  classUsr: text('class_usr'),
  baseUsr: text('base_usr'),
  inheritanceType: text('inheritance_type').default('public'), // 'public', 'private', 'protected'
  isVirtual: integer('is_virtual', { mode: 'boolean' }).default(false),
  
  // Interface implementation (preserved from original)
  implementsInterface: integer('implements_interface', { mode: 'boolean' }).default(false),
  interfaceUsr: text('interface_usr'),
  
  // Metadata
  detectedBy: text('detected_by').default('unified'),
  confidence: real('confidence').default(0.8),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  classIdx: index('idx_cpp_hierarchies_class').on(table.classSymbolId),
  baseIdx: index('idx_cpp_hierarchies_base').on(table.baseClassSymbolId),
}));

// LEGACY COMPATIBILITY TABLES - Support for existing MCP tools
export const modules = sqliteTable('modules', {
  path: text('path').primaryKey(),
  relativePath: text('relative_path').notNull(),
  moduleName: text('module_name'),
  pipelineStage: text('pipeline_stage'),
  
  // Module data (preserved from original)
  exports: text('exports', { mode: 'json' }).$type<any[]>(),
  imports: text('imports', { mode: 'json' }).$type<any[]>(),
  dependencies: text('dependencies', { mode: 'json' }).$type<any[]>(),
  
  // Quality metrics (preserved from original)
  symbolCount: integer('symbol_count').default(0),
  relationshipCount: integer('relationship_count').default(0),
  patternCount: integer('pattern_count').default(0),
  
  // Metadata
  lastAnalyzed: integer('last_analyzed', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  confidence: real('confidence').default(0.0),
  parseSuccess: integer('parse_success', { mode: 'boolean' }).default(true),
}, (table) => ({
  moduleNameIdx: index('idx_modules_name').on(table.moduleName),
  pipelineStageIdx: index('idx_modules_stage').on(table.pipelineStage),
}));

// SEMANTIC CONNECTIONS - Semantic relationship cache (preserved from original)
export const semanticConnections = sqliteTable('semantic_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  connectedId: integer('connected_id').notNull().references(() => universalSymbols.id, { onDelete: 'cascade' }),
  connectionType: text('connection_type').notNull(),
  confidence: real('confidence').default(0.8),
  evidence: text('evidence'),
  detectedBy: text('detected_by').default('unified'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  symbolIdx: index('idx_semantic_connections_symbol').on(table.symbolId),
  connectedIdx: index('idx_semantic_connections_connected').on(table.connectedId),
  typeIdx: index('idx_semantic_connections_type').on(table.connectionType),
}));

// AGENT SESSIONS - Agent session tracking (preserved from original)
export const agentSessions = sqliteTable('agent_sessions', {
  sessionId: text('session_id').primaryKey(),
  agentName: text('agent_name').notNull(),
  taskDescription: text('task_description'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').notNull(), // 'active', 'completed', 'failed'
  
  // Results (preserved from original)
  symbolsAnalyzed: integer('symbols_analyzed').default(0),
  patternsDetected: integer('patterns_detected').default(0),
  relationshipsFound: integer('relationships_found').default(0),
  
  // Quality scores (preserved from original)
  confidenceScore: real('confidence_score').default(0.0),
}, (table) => ({
  statusIdx: index('idx_sessions_status').on(table.status),
}));

// SESSION MODIFICATIONS - Track agent modifications (preserved from original)
export const sessionModifications = sqliteTable('session_modifications', {
  sessionId: text('session_id').notNull().references(() => agentSessions.sessionId, { onDelete: 'cascade' }),
  symbolName: text('symbol_name').notNull(),
  filePath: text('file_path').notNull(),
  modificationType: text('modification_type').notNull(), // 'added', 'modified', 'deleted'
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  sessionIdx: index('idx_modifications_session').on(table.sessionId),
}));

// TOOL USAGE - MCP tool usage tracking (preserved from original)
export const toolUsage = sqliteTable('tool_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolName: text('tool_name').notNull(),
  parameters: text('parameters', { mode: 'json' }).$type<Record<string, any>>(),
  resultSummary: text('result_summary'),
  success: integer('success', { mode: 'boolean' }).default(true),
  executionTimeMs: integer('execution_time_ms'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  toolNameIdx: index('idx_tool_usage_tool_name').on(table.toolName),
  timestampIdx: index('idx_tool_usage_timestamp').on(table.timestamp),
}));

// SEARCH QUERIES - Search analytics (preserved from original)
export const searchQueries = sqliteTable('search_queries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  query: text('query').notNull(),
  queryType: text('query_type'), // 'find_implementations', 'find_similar', 'semantic_search'
  resultsCount: integer('results_count').default(0),
  success: integer('success', { mode: 'boolean' }).default(true),
  timestamp: integer('timestamp', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  queryTypeIdx: index('idx_search_queries_type').on(table.queryType),
  timestampIdx: index('idx_search_queries_timestamp').on(table.timestamp),
}));

// PATTERN CACHE - Cache for pattern search results (preserved from original)
export const patternCache = sqliteTable('pattern_cache', {
  patternName: text('pattern_name').primaryKey(),
  symbolIds: text('symbol_ids').notNull(), // JSON array of symbol IDs
  lastUpdated: integer('last_updated', { mode: 'timestamp' }),
  computationTimeMs: integer('computation_time_ms'),
});

// ANALYTICS CACHE - General analytics cache (preserved from original)
export const analyticsCache = sqliteTable('analytics_cache', {
  cacheKey: text('cache_key').primaryKey(),
  cacheValue: text('cache_value'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
});

// ============================================================================
// INDEXING AND CACHING
// ============================================================================

export const fileIndex = sqliteTable('file_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  languageId: integer('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
  
  // File information
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  fileHash: text('file_hash'), // SHA-256 hash
  
  // Parsing metadata
  lastParsed: text('last_parsed'),
  parseDuration: integer('parse_duration'), // milliseconds
  parserVersion: text('parser_version'),
  
  // Statistics
  symbolCount: integer('symbol_count').default(0),
  relationshipCount: integer('relationship_count').default(0),
  patternCount: integer('pattern_count').default(0),
  
  // Status
  isIndexed: integer('is_indexed', { mode: 'boolean' }).default(false),
  hasErrors: integer('has_errors', { mode: 'boolean' }).default(false),
  errorMessage: text('error_message'),
  
  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
}, (table) => ({
  projectIdx: index('idx_file_index_project').on(table.projectId),
  languageIdx: index('idx_file_index_language').on(table.languageId),
  filePathIdx: index('idx_file_index_file_path').on(table.filePath),
  lastParsedIdx: index('idx_file_index_last_parsed').on(table.lastParsed),
  uniqueFile: uniqueIndex('idx_file_index_unique').on(table.projectId, table.filePath)
}));

// ============================================================================
// RELATIONS (for Drizzle ORM joins)
// ============================================================================

export const projectsRelations = relations(projects, ({ many }) => ({
  projectLanguages: many(projectLanguages),
  symbols: many(universalSymbols),
  relationships: many(universalRelationships),
  apiBindings: many(apiBindings),
  crossLanguageDeps: many(crossLanguageDeps),
  semanticEquivalents: many(semanticEquivalents),
  detectedPatterns: many(detectedPatterns),
  fileIndex: many(fileIndex)
}));

export const languagesRelations = relations(languages, ({ many }) => ({
  projectLanguages: many(projectLanguages),
  symbols: many(universalSymbols),
  fileIndex: many(fileIndex)
}));

export const universalSymbolsRelations = relations(universalSymbols, ({ one, many }) => ({
  project: one(projects, {
    fields: [universalSymbols.projectId],
    references: [projects.id]
  }),
  language: one(languages, {
    fields: [universalSymbols.languageId],
    references: [languages.id]
  }),
  parent: one(universalSymbols, {
    fields: [universalSymbols.parentSymbolId],
    references: [universalSymbols.id]
  }),
  children: many(universalSymbols),
  outgoingRelationships: many(universalRelationships, {
    relationName: 'fromSymbol'
  }),
  incomingRelationships: many(universalRelationships, {
    relationName: 'toSymbol'
  }),
  cppFeatures: one(cppFeatures),
  pythonFeatures: one(pythonFeatures),
  typescriptFeatures: one(typescriptFeatures),
  semanticTags: many(symbolSemanticTags),
  patternSymbols: many(patternSymbols)
}));

export const universalRelationshipsRelations = relations(universalRelationships, ({ one }) => ({
  project: one(projects, {
    fields: [universalRelationships.projectId],
    references: [projects.id]
  }),
  fromSymbol: one(universalSymbols, {
    fields: [universalRelationships.fromSymbolId],
    references: [universalSymbols.id],
    relationName: 'fromSymbol'
  }),
  toSymbol: one(universalSymbols, {
    fields: [universalRelationships.toSymbolId],
    references: [universalSymbols.id],
    relationName: 'toSymbol'
  })
}));

export const semanticTagDefinitionsRelations = relations(semanticTagDefinitions, ({ one, many }) => ({
  parent: one(semanticTagDefinitions, {
    fields: [semanticTagDefinitions.parentTagId],
    references: [semanticTagDefinitions.id]
  }),
  children: many(semanticTagDefinitions),
  symbolTags: many(symbolSemanticTags)
}));

export const symbolSemanticTagsRelations = relations(symbolSemanticTags, ({ one }) => ({
  symbol: one(universalSymbols, {
    fields: [symbolSemanticTags.symbolId],
    references: [universalSymbols.id]
  }),
  tag: one(semanticTagDefinitions, {
    fields: [symbolSemanticTags.tagId],
    references: [semanticTagDefinitions.id]
  })
}));

export const detectedPatternsRelations = relations(detectedPatterns, ({ one, many }) => ({
  project: one(projects, {
    fields: [detectedPatterns.projectId],
    references: [projects.id]
  }),
  patternSymbols: many(patternSymbols)
}));

export const patternSymbolsRelations = relations(patternSymbols, ({ one }) => ({
  pattern: one(detectedPatterns, {
    fields: [patternSymbols.patternId],
    references: [detectedPatterns.id]
  }),
  symbol: one(universalSymbols, {
    fields: [patternSymbols.symbolId],
    references: [universalSymbols.id]
  })
}));

// ============================================================================
// SEMANTIC INTELLIGENCE TABLES
// ============================================================================

// Semantic clusters - groups of semantically similar symbols
export const semanticClusters = sqliteTable('semantic_clusters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  clusterName: text('cluster_name').notNull(),
  clusterType: text('cluster_type').notNull(), // 'function_similarity', 'data_structure', 'pattern_based', etc.
  quality: real('quality').notNull(), // Cluster quality score (0-1)
  symbolCount: integer('symbol_count').notNull().default(0),
  similarityThreshold: real('similarity_threshold').notNull(),
  centroidEmbedding: blob('centroid_embedding', { mode: 'buffer' }), // Base64 encoded centroid embedding
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  projectTypeIdx: index('idx_semantic_clusters_project_type').on(table.projectId, table.clusterType),
  qualityIdx: index('idx_semantic_clusters_quality').on(table.quality),
  nameIdx: index('idx_semantic_clusters_name').on(table.clusterName),
}));

// Cluster membership - many-to-many relationship between symbols and clusters
export const clusterMembership = sqliteTable('cluster_membership', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clusterId: integer('cluster_id').notNull().references(() => semanticClusters.id),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id),
  similarity: real('similarity').notNull(),
  role: text('role').default('member'),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  clusterIdx: index('idx_cluster_membership_cluster').on(table.clusterId),
  symbolIdx: index('idx_cluster_membership_symbol').on(table.symbolId),
  similarityIdx: index('idx_cluster_membership_similarity').on(table.similarity),
  uniqueIdx: uniqueIndex('idx_cluster_membership_unique').on(table.clusterId, table.symbolId),
}));

// Semantic insights - AI-generated insights about code quality and architecture
export const semanticInsights = sqliteTable('semantic_insights', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  insightType: text('insight_type').notNull(), // 'refactoring_opportunity', 'architectural_violation', 'performance_concern', 'code_smell'
  category: text('category').notNull(), // 'architecture', 'performance', 'maintainability', 'quality', 'testing', 'security'
  severity: text('severity').notNull(), // 'low', 'medium', 'high', 'critical'
  confidence: real('confidence').notNull(), // AI confidence in the insight (0-1)
  priority: text('priority').notNull(), // 'low', 'medium', 'high', 'critical'
  title: text('title').notNull(),
  description: text('description').notNull(),
  affectedSymbols: text('affected_symbols'), // JSON array of symbol IDs
  clusterId: integer('cluster_id').references(() => semanticClusters.id),
  metrics: text('metrics'), // JSON object with relevant metrics
  sourceContext: text('source_context'), // Code context that triggered the insight
  reasoning: text('reasoning'), // AI reasoning for the insight
  contextLine: integer('context_line'),
  contextFile: text('context_file'),
  contextSnippet: text('context_snippet'),
  relatedInsights: text('related_insights'), // JSON array of related insight IDs
  detectedAt: integer('detected_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolution: text('resolution'),
  status: text('status').default('active'), // 'active', 'resolved', 'ignored', 'false_positive'
  userFeedback: integer('user_feedback'), // -1: negative, 0: neutral, 1: positive
  feedbackComment: text('feedback_comment'),
  feedbackTimestamp: integer('feedback_timestamp', { mode: 'timestamp' }),
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
  action: text('action').notNull(),
  description: text('description').notNull(),
  effort: text('effort').notNull(), // 'low', 'medium', 'high'
  impact: text('impact').notNull(), // 'low', 'medium', 'high'
  priority: integer('priority').notNull(),
  exampleCode: text('example_code'),
  relatedSymbols: text('related_symbols'), // JSON array of symbol IDs
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  insightIdx: index('idx_insight_recommendations_insight').on(table.insightId),
  priorityIdx: index('idx_insight_recommendations_priority').on(table.priority),
}));

// Semantic relationships - discovered semantic relationships between symbols
export const semanticRelationships = sqliteTable('semantic_relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  fromSymbolId: integer('from_symbol_id').notNull().references(() => universalSymbols.id),
  toSymbolId: integer('to_symbol_id').notNull().references(() => universalSymbols.id),
  semanticType: text('semantic_type').notNull(), // 'similar_purpose', 'complementary', 'alternative_implementation', etc.
  strength: real('strength').notNull(), // Relationship strength (0-1)
  evidence: text('evidence'), // JSON array of evidence
  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  fromIdx: index('idx_semantic_relationships_from').on(table.fromSymbolId),
  toIdx: index('idx_semantic_relationships_to').on(table.toSymbolId),
  typeIdx: index('idx_semantic_relationships_type').on(table.semanticType),
  strengthIdx: index('idx_semantic_relationships_strength').on(table.strength),
  projectIdx: index('idx_semantic_relationships_project').on(table.projectId),
  uniqueIdx: uniqueIndex('idx_semantic_relationships_unique').on(table.fromSymbolId, table.toSymbolId, table.semanticType),
}));

// Code embeddings - Vector embeddings for semantic similarity
export const codeEmbeddings = sqliteTable('code_embeddings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbolId: integer('symbol_id').notNull().references(() => universalSymbols.id),
  embeddingType: text('embedding_type').notNull(), // 'semantic', 'structural', 'combined'
  embedding: blob('embedding', { mode: 'buffer' }).notNull(), // Base64 encoded vector
  dimensions: integer('dimensions').notNull(),
  modelVersion: text('model_version').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  symbolIdx: index('idx_code_embeddings_symbol').on(table.symbolId),
  typeIdx: index('idx_code_embeddings_type').on(table.embeddingType),
  uniqueIdx: uniqueIndex('idx_code_embeddings_unique').on(table.symbolId, table.embeddingType),
}));

// Export all table types for use in application
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Language = typeof languages.$inferSelect;
export type NewLanguage = typeof languages.$inferInsert;
export type UniversalSymbol = typeof universalSymbols.$inferSelect;
export type NewUniversalSymbol = typeof universalSymbols.$inferInsert;
export type UniversalRelationship = typeof universalRelationships.$inferSelect;
export type NewUniversalRelationship = typeof universalRelationships.$inferInsert;
export type CppFeature = typeof cppFeatures.$inferSelect;
export type NewCppFeature = typeof cppFeatures.$inferInsert;
export type SemanticCluster = typeof semanticClusters.$inferSelect;
export type NewSemanticCluster = typeof semanticClusters.$inferInsert;
export type ClusterMembership = typeof clusterMembership.$inferSelect;
export type NewClusterMembership = typeof clusterMembership.$inferInsert;
export type SemanticInsight = typeof semanticInsights.$inferSelect;
export type NewSemanticInsight = typeof semanticInsights.$inferInsert;
export type InsightRecommendation = typeof insightRecommendations.$inferSelect;
export type NewInsightRecommendation = typeof insightRecommendations.$inferInsert;
export type SemanticRelationship = typeof semanticRelationships.$inferSelect;
export type NewSemanticRelationship = typeof semanticRelationships.$inferInsert;
export type CodeEmbedding = typeof codeEmbeddings.$inferSelect;
export type NewCodeEmbedding = typeof codeEmbeddings.$inferInsert;
export type PythonFeature = typeof pythonFeatures.$inferSelect;
export type NewPythonFeature = typeof pythonFeatures.$inferInsert;
export type TypescriptFeature = typeof typescriptFeatures.$inferSelect;
export type NewTypescriptFeature = typeof typescriptFeatures.$inferInsert;
export type SemanticTagDefinition = typeof semanticTagDefinitions.$inferSelect;
export type NewSemanticTagDefinition = typeof semanticTagDefinitions.$inferInsert;
export type DetectedPattern = typeof detectedPatterns.$inferSelect;
export type NewDetectedPattern = typeof detectedPatterns.$inferInsert;
export type FileIndex = typeof fileIndex.$inferSelect;
export type NewFileIndex = typeof fileIndex.$inferInsert;