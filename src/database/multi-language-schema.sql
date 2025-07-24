-- Multi-Language Database Schema for Module Sentinel
-- This schema supports multiple languages, projects, and cross-language analysis

-- ============================================================================
-- PROJECT MANAGEMENT TABLES
-- ============================================================================

-- Projects table for multi-project support
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    description TEXT,
    root_path TEXT NOT NULL,
    config_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    metadata TEXT -- JSON for project-specific metadata
);

-- Languages supported by the system
CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- 'cpp', 'python', 'typescript', etc.
    display_name TEXT NOT NULL,
    version TEXT,
    parser_class TEXT NOT NULL,
    extensions TEXT NOT NULL, -- JSON array of file extensions
    features TEXT, -- JSON array of supported features
    is_enabled BOOLEAN DEFAULT 1,
    priority INTEGER DEFAULT 100 -- Lower number = higher priority
);

-- Project-Language associations (many-to-many)
CREATE TABLE IF NOT EXISTS project_languages (
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    language_id INTEGER REFERENCES languages(id) ON DELETE CASCADE,
    config TEXT, -- JSON configuration for this language in this project
    is_primary BOOLEAN DEFAULT 0, -- Primary language for the project
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, language_id)
);

-- ============================================================================
-- UNIVERSAL SYMBOL TABLES
-- ============================================================================

-- Universal symbols table (language-agnostic)
CREATE TABLE IF NOT EXISTS universal_symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    
    -- Core identification
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    kind TEXT NOT NULL, -- UniversalSymbolKind enum value
    
    -- Location information
    file_path TEXT NOT NULL,
    line INTEGER NOT NULL,
    column INTEGER NOT NULL,
    end_line INTEGER,
    end_column INTEGER,
    
    -- Type information (language-agnostic)
    return_type TEXT,
    signature TEXT,
    visibility TEXT, -- 'public', 'private', 'protected', 'internal'
    
    -- Semantic information
    namespace TEXT,
    parent_symbol_id INTEGER REFERENCES universal_symbols(id),
    is_exported BOOLEAN DEFAULT 0,
    is_async BOOLEAN DEFAULT 0,
    is_abstract BOOLEAN DEFAULT 0,
    
    -- Language-specific features stored as JSON
    language_features TEXT, -- JSON object
    
    -- Semantic tags for cross-language concepts
    semantic_tags TEXT, -- JSON array
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(project_id, language_id, qualified_name, file_path, line)
);

-- Universal relationships table (language-agnostic)
CREATE TABLE IF NOT EXISTS universal_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Source and target symbols
    from_symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    to_symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    
    -- Relationship details
    type TEXT NOT NULL, -- UniversalRelationshipType enum value
    confidence REAL NOT NULL DEFAULT 1.0,
    
    -- Optional context
    context_line INTEGER,
    context_column INTEGER,
    context_snippet TEXT,
    
    -- Language-specific metadata
    metadata TEXT, -- JSON object
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(from_symbol_id, to_symbol_id, type)
);

-- ============================================================================
-- LANGUAGE-SPECIFIC FEATURE TABLES
-- ============================================================================

-- C++ specific features
CREATE TABLE IF NOT EXISTS cpp_features (
    symbol_id INTEGER PRIMARY KEY REFERENCES universal_symbols(id) ON DELETE CASCADE,
    
    -- C++ type system
    is_pointer BOOLEAN DEFAULT 0,
    is_reference BOOLEAN DEFAULT 0,
    is_const BOOLEAN DEFAULT 0,
    is_volatile BOOLEAN DEFAULT 0,
    is_constexpr BOOLEAN DEFAULT 0,
    is_consteval BOOLEAN DEFAULT 0,
    is_constinit BOOLEAN DEFAULT 0,
    
    -- C++ object model
    is_virtual BOOLEAN DEFAULT 0,
    is_override BOOLEAN DEFAULT 0,
    is_final BOOLEAN DEFAULT 0,
    is_static BOOLEAN DEFAULT 0,
    is_inline BOOLEAN DEFAULT 0,
    is_friend BOOLEAN DEFAULT 0,
    
    -- C++ special functions
    is_constructor BOOLEAN DEFAULT 0,
    is_destructor BOOLEAN DEFAULT 0,
    is_operator BOOLEAN DEFAULT 0,
    operator_type TEXT,
    is_conversion BOOLEAN DEFAULT 0,
    
    -- C++ templates
    is_template BOOLEAN DEFAULT 0,
    is_template_specialization BOOLEAN DEFAULT 0,
    template_params TEXT, -- JSON array
    template_args TEXT, -- JSON array
    
    -- C++ modules (C++20/23)
    is_module_interface BOOLEAN DEFAULT 0,
    module_name TEXT,
    is_module_exported BOOLEAN DEFAULT 0,
    
    -- C++ exceptions
    is_noexcept BOOLEAN DEFAULT 0,
    exception_spec TEXT,
    
    -- C++ attributes
    attributes TEXT, -- JSON array
    
    -- C++ concepts (C++20)
    is_concept BOOLEAN DEFAULT 0,
    concept_constraints TEXT
);

-- Python specific features
CREATE TABLE IF NOT EXISTS python_features (
    symbol_id INTEGER PRIMARY KEY REFERENCES universal_symbols(id) ON DELETE CASCADE,
    
    -- Python decorators
    decorators TEXT, -- JSON array
    
    -- Python type hints
    type_hint TEXT,
    return_type_hint TEXT,
    
    -- Python async/await
    is_async BOOLEAN DEFAULT 0,
    is_generator BOOLEAN DEFAULT 0,
    is_coroutine BOOLEAN DEFAULT 0,
    
    -- Python special methods
    is_dunder BOOLEAN DEFAULT 0,
    is_property BOOLEAN DEFAULT 0,
    is_classmethod BOOLEAN DEFAULT 0,
    is_staticmethod BOOLEAN DEFAULT 0,
    
    -- Python metaclasses
    metaclass TEXT,
    
    -- Python docstrings
    docstring TEXT,
    
    -- Python imports
    import_from TEXT,
    import_as TEXT,
    is_relative_import BOOLEAN DEFAULT 0
);

-- TypeScript specific features  
CREATE TABLE IF NOT EXISTS typescript_features (
    symbol_id INTEGER PRIMARY KEY REFERENCES universal_symbols(id) ON DELETE CASCADE,
    
    -- TypeScript type system
    type_annotation TEXT,
    generic_params TEXT, -- JSON array
    type_constraints TEXT, -- JSON array
    
    -- TypeScript access modifiers
    is_readonly BOOLEAN DEFAULT 0,
    is_optional BOOLEAN DEFAULT 0,
    
    -- TypeScript decorators
    decorators TEXT, -- JSON array
    
    -- TypeScript modules
    is_namespace BOOLEAN DEFAULT 0,
    export_type TEXT, -- 'named', 'default', 'star'
    
    -- TypeScript advanced types
    is_union_type BOOLEAN DEFAULT 0,
    is_intersection_type BOOLEAN DEFAULT 0,
    is_conditional_type BOOLEAN DEFAULT 0,
    is_mapped_type BOOLEAN DEFAULT 0,
    
    -- TypeScript utility types
    utility_type TEXT,
    
    -- TypeScript ambient declarations
    is_ambient BOOLEAN DEFAULT 0,
    is_declaration BOOLEAN DEFAULT 0
);

-- ============================================================================
-- CROSS-LANGUAGE FEATURES
-- ============================================================================

-- API bindings between languages (FFI, REST, gRPC, etc.)
CREATE TABLE IF NOT EXISTS api_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Source and target symbols
    source_symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    target_symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    
    -- Binding details
    binding_type TEXT NOT NULL, -- 'ffi', 'rest', 'grpc', 'websocket', etc.
    protocol TEXT, -- 'http', 'tcp', 'unix', etc.
    endpoint TEXT,
    
    -- Type mapping
    type_mapping TEXT, -- JSON object mapping types between languages
    
    -- Serialization info
    serialization_format TEXT, -- 'json', 'protobuf', 'msgpack', etc.
    schema_definition TEXT,
    
    -- Metadata
    metadata TEXT, -- JSON object
    confidence REAL DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cross-language dependencies (when one language depends on another)
CREATE TABLE IF NOT EXISTS cross_language_deps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Source and target languages
    from_language_id INTEGER REFERENCES languages(id),
    to_language_id INTEGER REFERENCES languages(id),
    
    -- Dependency details
    dependency_type TEXT NOT NULL, -- 'build', 'runtime', 'interface', etc.
    dependency_path TEXT, -- File path or module name
    
    -- Symbols involved
    from_symbol_id INTEGER REFERENCES universal_symbols(id),
    to_symbol_id INTEGER REFERENCES universal_symbols(id),
    
    -- Metadata
    metadata TEXT, -- JSON object
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Semantic equivalents (similar concepts across languages)
CREATE TABLE IF NOT EXISTS semantic_equivalents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Equivalent symbols
    symbol_id_1 INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    symbol_id_2 INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    
    -- Equivalence details
    equivalence_type TEXT NOT NULL, -- 'identical', 'similar', 'mapped', etc.
    similarity_score REAL NOT NULL DEFAULT 1.0,
    
    -- Mapping information
    mapping_rules TEXT, -- JSON object describing how to map between them
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(symbol_id_1, symbol_id_2),
    CHECK(symbol_id_1 != symbol_id_2)
);

-- ============================================================================
-- SEMANTIC TAGGING SYSTEM
-- ============================================================================

-- Formal tag definitions
CREATE TABLE IF NOT EXISTS semantic_tag_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- 'pattern', 'architecture', 'performance', etc.
    
    -- Scope
    is_universal BOOLEAN DEFAULT 1, -- Applies to all languages
    applicable_languages TEXT, -- JSON array of language names if not universal
    
    -- Hierarchy
    parent_tag_id INTEGER REFERENCES semantic_tag_definitions(id),
    
    -- Validation
    validation_rules TEXT, -- JSON object with validation rules
    
    -- Color and icon for UI
    color TEXT,
    icon TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Tag assignments to symbols
CREATE TABLE IF NOT EXISTS symbol_semantic_tags (
    symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES semantic_tag_definitions(id) ON DELETE CASCADE,
    
    -- Tag metadata
    confidence REAL DEFAULT 1.0,
    auto_detected BOOLEAN DEFAULT 0,
    detector_name TEXT,
    
    -- Context
    context TEXT, -- JSON object with additional context
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (symbol_id, tag_id)
);

-- ============================================================================
-- PATTERN DETECTION RESULTS
-- ============================================================================

-- Detected patterns
CREATE TABLE IF NOT EXISTS detected_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Pattern details
    pattern_type TEXT NOT NULL,
    pattern_name TEXT,
    description TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    severity TEXT DEFAULT 'info', -- 'info', 'warning', 'error'
    
    -- Detection metadata
    detector_name TEXT,
    detector_version TEXT,
    detection_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Suggestions
    suggestions TEXT, -- JSON array of improvement suggestions
    
    -- Metadata
    metadata TEXT -- JSON object
);

-- Pattern-symbol associations
CREATE TABLE IF NOT EXISTS pattern_symbols (
    pattern_id INTEGER REFERENCES detected_patterns(id) ON DELETE CASCADE,
    symbol_id INTEGER REFERENCES universal_symbols(id) ON DELETE CASCADE,
    role TEXT, -- Role of symbol in pattern (e.g., 'factory', 'product')
    
    PRIMARY KEY (pattern_id, symbol_id)
);

-- ============================================================================
-- INDEXING AND CACHING
-- ============================================================================

-- File indexing metadata
CREATE TABLE IF NOT EXISTS file_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    
    -- File information
    file_path TEXT NOT NULL,
    file_size INTEGER,
    file_hash TEXT, -- SHA-256 hash for change detection
    
    -- Parsing metadata
    last_parsed TIMESTAMP,
    parse_duration INTEGER, -- milliseconds
    parser_version TEXT,
    
    -- Statistics
    symbol_count INTEGER DEFAULT 0,
    relationship_count INTEGER DEFAULT 0,
    pattern_count INTEGER DEFAULT 0,
    
    -- Status
    is_indexed BOOLEAN DEFAULT 0,
    has_errors BOOLEAN DEFAULT 0,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(project_id, file_path)
);

-- ============================================================================
-- INDICES FOR PERFORMANCE
-- ============================================================================

-- Core symbol indices
CREATE INDEX IF NOT EXISTS idx_universal_symbols_project ON universal_symbols(project_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_language ON universal_symbols(language_id);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_qualified_name ON universal_symbols(qualified_name);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_kind ON universal_symbols(kind);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_file_path ON universal_symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_namespace ON universal_symbols(namespace);
CREATE INDEX IF NOT EXISTS idx_universal_symbols_parent ON universal_symbols(parent_symbol_id);

-- Relationship indices
CREATE INDEX IF NOT EXISTS idx_universal_relationships_project ON universal_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_from ON universal_relationships(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_to ON universal_relationships(to_symbol_id);
CREATE INDEX IF NOT EXISTS idx_universal_relationships_type ON universal_relationships(type);

-- Cross-language indices
CREATE INDEX IF NOT EXISTS idx_api_bindings_project ON api_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_api_bindings_source ON api_bindings(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_api_bindings_target ON api_bindings(target_symbol_id);
CREATE INDEX IF NOT EXISTS idx_api_bindings_type ON api_bindings(binding_type);

-- Semantic tag indices
CREATE INDEX IF NOT EXISTS idx_symbol_semantic_tags_symbol ON symbol_semantic_tags(symbol_id);
CREATE INDEX IF NOT EXISTS idx_symbol_semantic_tags_tag ON symbol_semantic_tags(tag_id);

-- Pattern indices
CREATE INDEX IF NOT EXISTS idx_detected_patterns_project ON detected_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_detected_patterns_type ON detected_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_symbols_pattern ON pattern_symbols(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_symbols_symbol ON pattern_symbols(symbol_id);

-- File index indices
CREATE INDEX IF NOT EXISTS idx_file_index_project ON file_index(project_id);
CREATE INDEX IF NOT EXISTS idx_file_index_language ON file_index(language_id);
CREATE INDEX IF NOT EXISTS idx_file_index_file_path ON file_index(file_path);
CREATE INDEX IF NOT EXISTS idx_file_index_last_parsed ON file_index(last_parsed);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for symbols with their language information
CREATE VIEW IF NOT EXISTS v_symbols_with_language AS
SELECT 
    s.*,
    l.name as language_name,
    l.display_name as language_display_name,
    p.name as project_name
FROM universal_symbols s
JOIN languages l ON s.language_id = l.id
JOIN projects p ON s.project_id = p.id;

-- View for relationships with symbol names
CREATE VIEW IF NOT EXISTS v_relationships_with_names AS
SELECT 
    r.*,
    fs.qualified_name as from_symbol_name,
    ts.qualified_name as to_symbol_name,
    fl.name as from_language,
    tl.name as to_language,
    p.name as project_name
FROM universal_relationships r
JOIN universal_symbols fs ON r.from_symbol_id = fs.id
JOIN universal_symbols ts ON r.to_symbol_id = ts.id
JOIN languages fl ON fs.language_id = fl.id
JOIN languages tl ON ts.language_id = tl.id
JOIN projects p ON r.project_id = p.id;

-- View for cross-language bindings
CREATE VIEW IF NOT EXISTS v_cross_language_bindings AS
SELECT 
    ab.*,
    ss.qualified_name as source_symbol_name,
    ts.qualified_name as target_symbol_name,
    sl.name as source_language,
    tl.name as target_language
FROM api_bindings ab
LEFT JOIN universal_symbols ss ON ab.source_symbol_id = ss.id
LEFT JOIN universal_symbols ts ON ab.target_symbol_id = ts.id
LEFT JOIN languages sl ON ss.language_id = sl.id
LEFT JOIN languages tl ON ts.language_id = tl.id;

-- ============================================================================
-- MIGRATION COMPATIBILITY
-- ============================================================================

-- This schema provides universal symbol storage for all supported languages
-- while maintaining backward compatibility for existing tools.