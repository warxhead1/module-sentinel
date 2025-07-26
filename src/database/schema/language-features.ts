
import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { universalSymbols } from '../drizzle/schema.js';

/**
 * Language-Specific Feature Tables
 * 
 * These tables store language-specific features that don't map cleanly to universal concepts.
 * Each table references the universal_symbols table for the base symbol information.
 */

// C++ specific features
export const cppFeatures = sqliteTable('cpp_features', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id),
  
  // Memory management
  isPointer: integer('is_pointer', { mode: 'boolean' }).default(false),
  isReference: integer('is_reference', { mode: 'boolean' }).default(false),
  isConst: integer('is_const', { mode: 'boolean' }).default(false),
  isVolatile: integer('is_volatile', { mode: 'boolean' }).default(false),
  isConstexpr: integer('is_constexpr', { mode: 'boolean' }).default(false),
  isMutable: integer('is_mutable', { mode: 'boolean' }).default(false),
  
  // Function features
  isVirtual: integer('is_virtual', { mode: 'boolean' }).default(false),
  isPureVirtual: integer('is_pure_virtual', { mode: 'boolean' }).default(false),
  isOverride: integer('is_override', { mode: 'boolean' }).default(false),
  isFinal: integer('is_final', { mode: 'boolean' }).default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  isDefaulted: integer('is_defaulted', { mode: 'boolean' }).default(false),
  isNoexcept: integer('is_noexcept', { mode: 'boolean' }).default(false),
  isInline: integer('is_inline', { mode: 'boolean' }).default(false),
  isExplicit: integer('is_explicit', { mode: 'boolean' }).default(false),
  
  // Constructor/Destructor specific
  isConstructor: integer('is_constructor', { mode: 'boolean' }).default(false),
  isDestructor: integer('is_destructor', { mode: 'boolean' }).default(false),
  isCopyConstructor: integer('is_copy_constructor', { mode: 'boolean' }).default(false),
  isMoveConstructor: integer('is_move_constructor', { mode: 'boolean' }).default(false),
  isCopyAssignment: integer('is_copy_assignment', { mode: 'boolean' }).default(false),
  isMoveAssignment: integer('is_move_assignment', { mode: 'boolean' }).default(false),
  
  // Template features
  isTemplate: integer('is_template', { mode: 'boolean' }).default(false),
  templateParameters: text('template_parameters'), // JSON array
  templateSpecialization: text('template_specialization'), // JSON object
  isTemplateSpecialization: integer('is_template_specialization', { mode: 'boolean' }).default(false),
  
  // Inheritance features
  baseClasses: text('base_classes'), // JSON array of base class info
  derivedClasses: text('derived_classes'), // JSON array
  
  // Module features (C++20)
  moduleName: text('module_name'),
  isModuleInterface: integer('is_module_interface', { mode: 'boolean' }).default(false),
  isModuleImplementation: integer('is_module_implementation', { mode: 'boolean' }).default(false),
  isModulePartition: integer('is_module_partition', { mode: 'boolean' }).default(false),
  
  // Concepts (C++20)
  requiresConcepts: text('requires_concepts'), // JSON array
  conceptDefinition: text('concept_definition'),
  
  // Coroutines (C++20)
  isCoroutine: integer('is_coroutine', { mode: 'boolean' }).default(false),
  coroutineType: text('coroutine_type'), // 'generator', 'task', 'awaitable'
  
  // Lambda expressions
  isLambda: integer('is_lambda', { mode: 'boolean' }).default(false),
  captureList: text('capture_list'), // JSON array
  
  // RAII and resource management
  isRAII: integer('is_raii', { mode: 'boolean' }).default(false),
  managedResources: text('managed_resources'), // JSON array
  
  // Performance hints
  isHotPath: integer('is_hot_path', { mode: 'boolean' }).default(false),
  isConstexprEvaluated: integer('is_constexpr_evaluated', { mode: 'boolean' }).default(false),
  
  // Additional features
  storageClass: text('storage_class'), // 'static', 'extern', 'thread_local'
  linkageType: text('linkage_type'), // 'internal', 'external', 'none'
  callingConvention: text('calling_convention'), // '__cdecl', '__stdcall', etc.
  attributes: text('attributes'), // JSON array of [[attributes]]
  
  // Documentation
  doxygenBrief: text('doxygen_brief'),
  doxygenDetailed: text('doxygen_detailed'),
  doxygenParams: text('doxygen_params'), // JSON array
  doxygenReturns: text('doxygen_returns'),
  doxygenThrows: text('doxygen_throws'), // JSON array
});

// C++ complexity metrics table
export const cppComplexityMetrics = sqliteTable('cpp_complexity_metrics', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id),
  
  // Basic metrics
  linesOfCode: integer('lines_of_code').default(0),
  logicalLinesOfCode: integer('logical_lines_of_code').default(0),
  commentLines: integer('comment_lines').default(0),
  blankLines: integer('blank_lines').default(0),
  
  // Complexity metrics
  cyclomaticComplexity: integer('cyclomatic_complexity').default(1),
  cognitiveComplexity: integer('cognitive_complexity').default(0),
  maxNestingDepth: integer('max_nesting_depth').default(0),
  averageNestingDepth: real('average_nesting_depth').default(0),
  
  // Halstead metrics
  halsteadOperators: integer('halstead_operators').default(0),
  halsteadOperands: integer('halstead_operands').default(0),
  halsteadDistinctOperators: integer('halstead_distinct_operators').default(0),
  halsteadDistinctOperands: integer('halstead_distinct_operands').default(0),
  halsteadVocabulary: integer('halstead_vocabulary').default(0),
  halsteadLength: integer('halstead_length').default(0),
  halsteadVolume: real('halstead_volume').default(0),
  halsteadDifficulty: real('halstead_difficulty').default(0),
  halsteadEffort: real('halstead_effort').default(0),
  halsteadTimeToImplement: real('halstead_time_to_implement').default(0),
  halsteadBugs: real('halstead_bugs').default(0),
  
  // C++ specific complexity
  templateComplexity: integer('template_complexity').default(0),
  inheritanceComplexity: integer('inheritance_complexity').default(0),
  polymorphismComplexity: integer('polymorphism_complexity').default(0),
  exceptionComplexity: integer('exception_complexity').default(0),
  stlComplexity: integer('stl_complexity').default(0),
  modernCppComplexity: integer('modern_cpp_complexity').default(0),
  memoryManagementComplexity: integer('memory_management_complexity').default(0),
  
  // Maintainability and risk
  maintainabilityIndex: real('maintainability_index').default(50),
  riskLevel: text('risk_level').default('low'), // 'low', 'medium', 'high', 'very_high'
  riskFactors: text('risk_factors'), // JSON array
  
  // Performance hints
  hasExpensiveOperations: integer('has_expensive_operations', { mode: 'boolean' }).default(false),
  hasRecursion: integer('has_recursion', { mode: 'boolean' }).default(false),
  hasDeepNesting: integer('has_deep_nesting', { mode: 'boolean' }).default(false),
  hasComplexTemplates: integer('has_complex_templates', { mode: 'boolean' }).default(false),
  hasVirtualCalls: integer('has_virtual_calls', { mode: 'boolean' }).default(false),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  complexityIdx: index('idx_cpp_complexity_cyclomatic').on(table.cyclomaticComplexity),
  riskIdx: index('idx_cpp_complexity_risk').on(table.riskLevel),
  maintainabilityIdx: index('idx_cpp_complexity_maintainability').on(table.maintainabilityIndex),
}));

// Python specific features
export const pythonFeatures = sqliteTable('python_features', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id),
  
  // Function/Method features
  isGenerator: integer('is_generator', { mode: 'boolean' }).default(false),
  isCoroutine: integer('is_coroutine', { mode: 'boolean' }).default(false),
  isLambda: integer('is_lambda', { mode: 'boolean' }).default(false),
  isStaticmethod: integer('is_staticmethod', { mode: 'boolean' }).default(false),
  isClassmethod: integer('is_classmethod', { mode: 'boolean' }).default(false),
  isProperty: integer('is_property', { mode: 'boolean' }).default(false),
  
  // Decorators
  decorators: text('decorators'), // JSON array
  
  // Type hints
  typeAnnotations: text('type_annotations'), // JSON object
  returnAnnotation: text('return_annotation'),
  
  // Documentation
  docstring: text('docstring'),
  docstringFormat: text('docstring_format'), // 'google', 'numpy', 'sphinx', etc.
  
  // Parameters
  parameters: text('parameters'), // JSON array with default values, *args, **kwargs
  hasVarargs: integer('has_varargs', { mode: 'boolean' }).default(false),
  hasKwargs: integer('has_kwargs', { mode: 'boolean' }).default(false),
  
  // Class features
  baseClasses: text('base_classes'), // JSON array
  metaclass: text('metaclass'),
  isDataclass: integer('is_dataclass', { mode: 'boolean' }).default(false),
  isNamedtuple: integer('is_namedtuple', { mode: 'boolean' }).default(false),
  isEnum: integer('is_enum', { mode: 'boolean' }).default(false),
  
  // Module features
  isDunderAll: integer('is_dunder_all', { mode: 'boolean' }).default(false),
  dunderAllExports: text('dunder_all_exports'), // JSON array
  
  // Context managers
  isContextManager: integer('is_context_manager', { mode: 'boolean' }).default(false),
  isAsyncContextManager: integer('is_async_context_manager', { mode: 'boolean' }).default(false),
});

// TypeScript/JavaScript specific features
export const typescriptFeatures = sqliteTable('typescript_features', {
  symbolId: integer('symbol_id').primaryKey().references(() => universalSymbols.id),
  
  // Type system
  isReadonly: integer('is_readonly', { mode: 'boolean' }).default(false),
  isOptional: integer('is_optional', { mode: 'boolean' }).default(false),
  typeParameters: text('type_parameters'), // JSON array
  typeConstraints: text('type_constraints'), // JSON object
  
  // Function features
  isArrowFunction: integer('is_arrow_function', { mode: 'boolean' }).default(false),
  isGenerator: integer('is_generator', { mode: 'boolean' }).default(false),
  
  // Decorators (experimental)
  decorators: text('decorators'), // JSON array
  
  // Access modifiers (TypeScript)
  accessModifier: text('access_modifier'), // 'public', 'private', 'protected'
  
  // Class features
  isAbstract: integer('is_abstract', { mode: 'boolean' }).default(false),
  implementsInterfaces: text('implements_interfaces'), // JSON array
  extendsClasses: text('extends_classes'), // JSON array
  
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
  jsDocComments: text('jsdoc_comments'), // JSON object
  tsDocComments: text('tsdoc_comments'), // JSON object
});

// Cross-language binding features (for FFI, Python C extensions, WASM, etc.)
export const crossLanguageBindings = sqliteTable('cross_language_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromSymbolId: integer('from_symbol_id').notNull().references(() => universalSymbols.id),
  toSymbolId: integer('to_symbol_id').notNull().references(() => universalSymbols.id),
  bindingType: text('binding_type').notNull(), // 'ffi', 'pybind11', 'ctypes', 'wasm', 'napi', etc.
  
  // Binding metadata
  bindingLibrary: text('binding_library'), // Library used for binding
  bindingVersion: text('binding_version'),
  
  // Type mapping
  typeMapping: text('type_mapping'), // JSON object mapping types between languages
  
  // Performance characteristics
  isAsync: integer('is_async', { mode: 'boolean' }).default(false),
  overheadCategory: text('overhead_category'), // 'low', 'medium', 'high'
  
  // Additional metadata
  metadata: text('metadata'), // JSON object for binding-specific data
  confidence: real('confidence').default(1.0),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  fromSymbolIdx: index('idx_bindings_from_symbol').on(table.fromSymbolId),
  toSymbolIdx: index('idx_bindings_to_symbol').on(table.toSymbolId),
  bindingTypeIdx: index('idx_bindings_type').on(table.bindingType),
}));

// Language-specific patterns
export const languagePatterns = sqliteTable('language_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  languageId: integer('language_id').notNull().references(() => universalSymbols.languageId),
  patternName: text('pattern_name').notNull(),
  patternCategory: text('pattern_category').notNull(), // 'idiom', 'anti-pattern', 'best-practice'
  
  // Pattern definition
  description: text('description'),
  detection: text('detection'), // JSON object with detection rules
  
  // Examples and fixes
  examples: text('examples'), // JSON array of code examples
  recommendation: text('recommendation'),
  autoFixAvailable: integer('auto_fix_available', { mode: 'boolean' }).default(false),
  
  // Severity and impact
  severity: text('severity'), // 'info', 'warning', 'error'
  performanceImpact: text('performance_impact'), // 'none', 'low', 'medium', 'high'
  securityImpact: text('security_impact'), // 'none', 'low', 'medium', 'high'
  
  // Usage tracking
  usageCount: integer('usage_count').default(0),
  lastDetected: integer('last_detected', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  languagePatternIdx: index('idx_language_patterns_lang_pattern').on(table.languageId, table.patternName),
  categoryIdx: index('idx_language_patterns_category').on(table.patternCategory),
  severityIdx: index('idx_language_patterns_severity').on(table.severity),
}));