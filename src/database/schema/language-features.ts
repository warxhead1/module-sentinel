
import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { universalSymbols } from './universal.js';

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
  
  // Template features
  isTemplate: integer('is_template', { mode: 'boolean' }).default(false),
  templateParameters: text('template_parameters'), // JSON array
  templateSpecialization: text('template_specialization'), // JSON object
  
  // Module features (C++20)
  moduleName: text('module_name'),
  isModuleInterface: integer('is_module_interface', { mode: 'boolean' }).default(false),
  isModuleImplementation: integer('is_module_implementation', { mode: 'boolean' }).default(false),
  isModulePartition: integer('is_module_partition', { mode: 'boolean' }).default(false),
  
  // Concepts (C++20)
  requiresConcepts: text('requires_concepts'), // JSON array
  conceptDefinition: text('concept_definition'),
  
  // Additional features
  storageClass: text('storage_class'), // 'static', 'extern', 'thread_local'
  linkageType: text('linkage_type'), // 'internal', 'external', 'none'
  callingConvention: text('calling_convention'), // '__cdecl', '__stdcall', etc.
  attributes: text('attributes'), // JSON array of [[attributes]]
});

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