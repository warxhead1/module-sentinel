-- Migration: Add language-specific feature tables
-- Created: 2025-01-21
-- Description: Adds tables for storing language-specific features for Python, TypeScript, and enhanced C++ support

-- C++ specific features table
CREATE TABLE IF NOT EXISTS cpp_features (
  symbol_id INTEGER PRIMARY KEY REFERENCES universal_symbols(id) ON DELETE CASCADE,
  
  -- Memory management
  is_pointer BOOLEAN DEFAULT FALSE,
  is_reference BOOLEAN DEFAULT FALSE,
  is_const BOOLEAN DEFAULT FALSE,
  is_volatile BOOLEAN DEFAULT FALSE,
  is_constexpr BOOLEAN DEFAULT FALSE,
  is_mutable BOOLEAN DEFAULT FALSE,
  
  -- Function features
  is_virtual BOOLEAN DEFAULT FALSE,
  is_pure_virtual BOOLEAN DEFAULT FALSE,
  is_override BOOLEAN DEFAULT FALSE,
  is_final BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_defaulted BOOLEAN DEFAULT FALSE,
  is_noexcept BOOLEAN DEFAULT FALSE,
  is_inline BOOLEAN DEFAULT FALSE,
  is_explicit BOOLEAN DEFAULT FALSE,
  
  -- Template features
  is_template BOOLEAN DEFAULT FALSE,
  template_parameters TEXT, -- JSON array
  template_specialization TEXT, -- JSON object
  
  -- Module features (C++20)
  module_name TEXT,
  is_module_interface BOOLEAN DEFAULT FALSE,
  is_module_implementation BOOLEAN DEFAULT FALSE,
  is_module_partition BOOLEAN DEFAULT FALSE,
  
  -- Concepts (C++20)
  requires_concepts TEXT, -- JSON array
  concept_definition TEXT,
  
  -- Additional features
  storage_class TEXT, -- 'static', 'extern', 'thread_local'
  linkage_type TEXT, -- 'internal', 'external', 'none'
  calling_convention TEXT, -- '__cdecl', '__stdcall', etc.
  attributes TEXT -- JSON array of [[attributes]]
);

-- Python specific features table
CREATE TABLE IF NOT EXISTS python_features (
  symbol_id INTEGER PRIMARY KEY REFERENCES universal_symbols(id) ON DELETE CASCADE,
  
  -- Function/Method features
  is_generator BOOLEAN DEFAULT FALSE,
  is_coroutine BOOLEAN DEFAULT FALSE,
  is_lambda BOOLEAN DEFAULT FALSE,
  is_staticmethod BOOLEAN DEFAULT FALSE,
  is_classmethod BOOLEAN DEFAULT FALSE,
  is_property BOOLEAN DEFAULT FALSE,
  
  -- Decorators
  decorators TEXT, -- JSON array
  
  -- Type hints
  type_annotations TEXT, -- JSON object
  return_annotation TEXT,
  
  -- Documentation
  docstring TEXT,
  docstring_format TEXT, -- 'google', 'numpy', 'sphinx', etc.
  
  -- Parameters
  parameters TEXT, -- JSON array with default values, *args, **kwargs
  has_varargs BOOLEAN DEFAULT FALSE,
  has_kwargs BOOLEAN DEFAULT FALSE,
  
  -- Class features
  base_classes TEXT, -- JSON array
  metaclass TEXT,
  is_dataclass BOOLEAN DEFAULT FALSE,
  is_namedtuple BOOLEAN DEFAULT FALSE,
  is_enum BOOLEAN DEFAULT FALSE,
  
  -- Module features
  is_dunder_all BOOLEAN DEFAULT FALSE,
  dunder_all_exports TEXT, -- JSON array
  
  -- Context managers
  is_context_manager BOOLEAN DEFAULT FALSE,
  is_async_context_manager BOOLEAN DEFAULT FALSE
);

-- TypeScript/JavaScript specific features table
CREATE TABLE IF NOT EXISTS typescript_features (
  symbol_id INTEGER PRIMARY KEY REFERENCES universal_symbols(id) ON DELETE CASCADE,
  
  -- Type system
  is_readonly BOOLEAN DEFAULT FALSE,
  is_optional BOOLEAN DEFAULT FALSE,
  type_parameters TEXT, -- JSON array
  type_constraints TEXT, -- JSON object
  
  -- Function features
  is_arrow_function BOOLEAN DEFAULT FALSE,
  is_generator BOOLEAN DEFAULT FALSE,
  
  -- Decorators (experimental)
  decorators TEXT, -- JSON array
  
  -- Access modifiers (TypeScript)
  access_modifier TEXT, -- 'public', 'private', 'protected'
  
  -- Class features
  is_abstract BOOLEAN DEFAULT FALSE,
  implements_interfaces TEXT, -- JSON array
  extends_classes TEXT, -- JSON array
  
  -- Interface/Type features
  is_interface BOOLEAN DEFAULT FALSE,
  is_type_alias BOOLEAN DEFAULT FALSE,
  is_enum BOOLEAN DEFAULT FALSE,
  is_namespace BOOLEAN DEFAULT FALSE,
  
  -- Module system
  export_type TEXT, -- 'named', 'default', 'namespace', 'type-only'
  import_type TEXT, -- 'named', 'default', 'namespace', 'type-only', 'side-effect'
  module_type TEXT, -- 'commonjs', 'esm', 'umd', 'amd'
  
  -- JSX/React specific
  is_react_component BOOLEAN DEFAULT FALSE,
  is_react_hook BOOLEAN DEFAULT FALSE,
  jsx_return_type TEXT,
  
  -- Additional TypeScript features
  is_generic BOOLEAN DEFAULT FALSE,
  is_type_guard BOOLEAN DEFAULT FALSE,
  is_assertion BOOLEAN DEFAULT FALSE,
  
  -- Documentation
  jsdoc_comments TEXT, -- JSON object
  tsdoc_comments TEXT -- JSON object
);

-- Cross-language binding features
CREATE TABLE IF NOT EXISTS cross_language_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  to_symbol_id INTEGER NOT NULL REFERENCES universal_symbols(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL, -- 'ffi', 'pybind11', 'ctypes', 'wasm', 'napi', etc.
  
  -- Binding metadata
  binding_library TEXT,
  binding_version TEXT,
  
  -- Type mapping
  type_mapping TEXT, -- JSON object mapping types between languages
  
  -- Performance characteristics
  is_async BOOLEAN DEFAULT FALSE,
  overhead_category TEXT, -- 'low', 'medium', 'high'
  
  -- Additional metadata
  metadata TEXT, -- JSON object for binding-specific data
  confidence REAL DEFAULT 1.0,
  
  created_at TIMESTAMP DEFAULT (strftime('%s', 'now')),
  updated_at TIMESTAMP DEFAULT (strftime('%s', 'now'))
);

-- Language-specific patterns
CREATE TABLE IF NOT EXISTS language_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL REFERENCES languages(id),
  pattern_name TEXT NOT NULL,
  pattern_category TEXT NOT NULL, -- 'idiom', 'anti-pattern', 'best-practice'
  
  -- Pattern definition
  description TEXT,
  detection TEXT, -- JSON object with detection rules
  
  -- Examples and fixes
  examples TEXT, -- JSON array of code examples
  recommendation TEXT,
  auto_fix_available BOOLEAN DEFAULT FALSE,
  
  -- Severity and impact
  severity TEXT, -- 'info', 'warning', 'error'
  performance_impact TEXT, -- 'none', 'low', 'medium', 'high'
  security_impact TEXT, -- 'none', 'low', 'medium', 'high'
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_detected TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT (strftime('%s', 'now')),
  updated_at TIMESTAMP DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cpp_features_template ON cpp_features(is_template);
CREATE INDEX IF NOT EXISTS idx_cpp_features_module ON cpp_features(module_name);

CREATE INDEX IF NOT EXISTS idx_python_features_generator ON python_features(is_generator);
CREATE INDEX IF NOT EXISTS idx_python_features_decorators ON python_features(decorators);

CREATE INDEX IF NOT EXISTS idx_typescript_features_react ON typescript_features(is_react_component);
CREATE INDEX IF NOT EXISTS idx_typescript_features_interface ON typescript_features(is_interface);

CREATE INDEX IF NOT EXISTS idx_bindings_from_symbol ON cross_language_bindings(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_bindings_to_symbol ON cross_language_bindings(to_symbol_id);
CREATE INDEX IF NOT EXISTS idx_bindings_type ON cross_language_bindings(binding_type);

CREATE INDEX IF NOT EXISTS idx_language_patterns_lang_pattern ON language_patterns(language_id, pattern_name);
CREATE INDEX IF NOT EXISTS idx_language_patterns_category ON language_patterns(pattern_category);
CREATE INDEX IF NOT EXISTS idx_language_patterns_severity ON language_patterns(severity);