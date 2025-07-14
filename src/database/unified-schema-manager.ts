import Database from 'better-sqlite3';
import * as path from 'path';

/**
 * Unified Database Schema Manager
 * 
 * Centralized management of all database tables to prevent conflicts
 * and ensure proper multi-parser data merging based on confidence scores.
 */
export class UnifiedSchemaManager {
  private static instance: UnifiedSchemaManager;
  private initializedDatabases = new Set<string>();
  private backgroundReindexing = new Map<string, NodeJS.Timeout>();
  
  private constructor() {}
  
  static getInstance(): UnifiedSchemaManager {
    if (!UnifiedSchemaManager.instance) {
      UnifiedSchemaManager.instance = new UnifiedSchemaManager();
    }
    return UnifiedSchemaManager.instance;
  }
  
  /**
   * Initialize all database tables with proper schemas
   * This ensures no conflicts between services
   */
  initializeDatabase(db: Database.Database): void {
    // Use database filename as identifier to track per-database initialization
    const dbIdentifier = (db as any).name || db.memory ? 'memory' : 'unknown';
    if (this.initializedDatabases.has(dbIdentifier)) return;
    
    // Core symbol storage with multi-parser support
    this.createEnhancedSymbolsTable(db);
    
    // File tracking and metadata
    this.createFileTrackingTables(db);
    
    // Pattern and relationship tables
    this.createPatternTables(db);
    
    // Code quality and duplication tables
    this.createQualityTables(db);
    
    // Module and architectural tables
    this.createArchitecturalTables(db);
    
    // Agent and session tracking
    this.createAgentTables(db);
    
    // Create views for compatibility
    this.createCompatibilityViews(db);
    
    // Create triggers for confidence-based merging
    this.createMergeTriggers(db);
    
    // Create parser metrics table
    this.createParserMetricsTable(db);
    
    this.initializedDatabases.add(dbIdentifier);
  }
  
  private createEnhancedSymbolsTable(db: Database.Database): void {
    db.exec(`
      -- Master symbol table supporting all parsers with confidence-based merging
      CREATE TABLE IF NOT EXISTS enhanced_symbols (
        id INTEGER PRIMARY KEY,
        
        -- Core symbol information (all parsers provide)
        name TEXT NOT NULL,
        qualified_name TEXT,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER DEFAULT 0,
        signature TEXT,
        return_type TEXT,
        parent_class TEXT,
        namespace TEXT,
        
        -- Clang-specific fields (NULL for other parsers)
        mangled_name TEXT,
        is_definition BOOLEAN DEFAULT 0,
        is_template BOOLEAN DEFAULT 0,
        template_params TEXT, -- JSON
        usr TEXT, -- Clang USR for cross-references
        
        -- Tree-sitter enhanced fields
        ast_node_type TEXT,
        scope_depth INTEGER,
        
        -- Pattern detection (all parsers contribute)
        execution_mode TEXT, -- 'gpu', 'cpu', 'hybrid', 'auto'
        is_async BOOLEAN DEFAULT 0,
        is_factory BOOLEAN DEFAULT 0,
        is_generator BOOLEAN DEFAULT 0,
        pipeline_stage TEXT,
        
        -- Performance hints
        returns_vector_float BOOLEAN DEFAULT 0,
        uses_gpu_compute BOOLEAN DEFAULT 0,
        has_cpu_fallback BOOLEAN DEFAULT 0,
        
        -- Semantic analysis
        semantic_tags TEXT DEFAULT '[]', -- JSON array
        related_symbols TEXT DEFAULT '[]', -- JSON array of symbol IDs
        complexity INTEGER DEFAULT 0,
        
        -- Enhanced Type Information (Grammar-Aware Parser)
        base_type TEXT, -- Base type without qualifiers (e.g., 'string' from 'const std::string&')
        is_pointer BOOLEAN DEFAULT 0,
        is_reference BOOLEAN DEFAULT 0,
        is_const BOOLEAN DEFAULT 0,
        is_volatile BOOLEAN DEFAULT 0,
        is_builtin BOOLEAN DEFAULT 0,
        is_std_type BOOLEAN DEFAULT 0,
        is_vulkan_type BOOLEAN DEFAULT 0,
        is_planetgen_type BOOLEAN DEFAULT 0,
        template_arguments TEXT DEFAULT '[]', -- JSON array of template arguments
        type_modifiers TEXT DEFAULT '[]', -- JSON array of type modifiers
        array_dimensions TEXT DEFAULT '[]', -- JSON array of array sizes
        
        -- Enhanced Enum Support
        is_enum BOOLEAN DEFAULT 0,
        is_enum_class BOOLEAN DEFAULT 0,
        enum_values TEXT DEFAULT '[]', -- JSON array of enum values
        
        -- Enhanced Method Information
        is_constructor BOOLEAN DEFAULT 0,
        is_destructor BOOLEAN DEFAULT 0,
        is_operator BOOLEAN DEFAULT 0,
        operator_type TEXT,
        is_override BOOLEAN DEFAULT 0,
        is_final BOOLEAN DEFAULT 0,
        is_noexcept BOOLEAN DEFAULT 0,
        
        -- C++20/23 Module Information
        is_exported BOOLEAN DEFAULT 0,
        module_name TEXT,
        export_namespace TEXT,
        
        -- Parser tracking for intelligent merging
        parser_used TEXT DEFAULT 'unknown',
        parser_confidence REAL DEFAULT 0.0,
        parse_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        parser_version INTEGER DEFAULT 1,
        
        -- Track all parsers that have seen this symbol
        parser_history TEXT DEFAULT '[]', -- JSON array of {parser, confidence, timestamp}
        
        -- Quality metrics
        completeness_score REAL DEFAULT 0.0, -- How complete is this symbol info
        
        -- Prevent duplicates but allow updates from higher confidence parsers
        UNIQUE(name, file_path, line, kind)
      );
      
      -- Indices for fast lookups
      CREATE INDEX IF NOT EXISTS idx_symbols_filepath ON enhanced_symbols(file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON enhanced_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_qualified ON enhanced_symbols(qualified_name);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON enhanced_symbols(kind);
      CREATE INDEX IF NOT EXISTS idx_symbols_usr ON enhanced_symbols(usr);
      CREATE INDEX IF NOT EXISTS idx_symbols_confidence ON enhanced_symbols(parser_confidence);
      CREATE INDEX IF NOT EXISTS idx_symbols_stage ON enhanced_symbols(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_symbols_execution ON enhanced_symbols(execution_mode);
      
      -- Enhanced Type Information Indexes
      CREATE INDEX IF NOT EXISTS idx_symbols_base_type ON enhanced_symbols(base_type);
      CREATE INDEX IF NOT EXISTS idx_symbols_type_category ON enhanced_symbols(is_std_type, is_vulkan_type, is_planetgen_type);
      CREATE INDEX IF NOT EXISTS idx_symbols_enum ON enhanced_symbols(is_enum, is_enum_class);
      CREATE INDEX IF NOT EXISTS idx_symbols_module ON enhanced_symbols(module_name, is_exported);
      CREATE INDEX IF NOT EXISTS idx_symbols_method_type ON enhanced_symbols(is_constructor, is_destructor, is_operator);
      
      -- Enhanced Parameter Details Table
      CREATE TABLE IF NOT EXISTS enhanced_parameters (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER REFERENCES enhanced_symbols(id) ON DELETE CASCADE,
        parameter_index INTEGER NOT NULL,
        name TEXT,
        type_name TEXT NOT NULL,
        qualified_type TEXT,
        base_type TEXT,
        is_pointer BOOLEAN DEFAULT 0,
        is_reference BOOLEAN DEFAULT 0,
        is_const BOOLEAN DEFAULT 0,
        is_volatile BOOLEAN DEFAULT 0,
        is_template BOOLEAN DEFAULT 0,
        template_arguments TEXT DEFAULT '[]', -- JSON array
        default_value TEXT,
        is_variadic BOOLEAN DEFAULT 0,
        type_category TEXT, -- 'builtin', 'std', 'vulkan', 'planetgen', 'custom'
        
        UNIQUE(symbol_id, parameter_index)
      );
      
      CREATE INDEX IF NOT EXISTS idx_parameters_symbol ON enhanced_parameters(symbol_id);
      CREATE INDEX IF NOT EXISTS idx_parameters_type ON enhanced_parameters(base_type, type_category);
    `);
  }
  
  private createFileTrackingTables(db: Database.Database): void {
    db.exec(`
      -- Track all indexed files and their parser status
      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        hash TEXT,
        last_indexed INTEGER NOT NULL,
        
        -- Parser attempts and results
        clang_attempted BOOLEAN DEFAULT 0,
        clang_success BOOLEAN DEFAULT 0,
        clang_symbols INTEGER DEFAULT 0,
        clang_error TEXT,
        
        treesitter_attempted BOOLEAN DEFAULT 0,
        treesitter_success BOOLEAN DEFAULT 0,
        treesitter_symbols INTEGER DEFAULT 0,
        treesitter_error TEXT,
        
        streaming_attempted BOOLEAN DEFAULT 0,
        streaming_success BOOLEAN DEFAULT 0,
        streaming_symbols INTEGER DEFAULT 0,
        streaming_error TEXT,
        
        -- Best parser for this file
        best_parser TEXT,
        best_confidence REAL DEFAULT 0.0,
        
        -- File metadata
        file_size INTEGER,
        is_module BOOLEAN DEFAULT 0,
        compile_flags TEXT, -- JSON
        dependencies TEXT -- JSON array
      );
    `);
    
    // Create indexes after table is created
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_files_best_parser ON indexed_files(best_parser);
        CREATE INDEX IF NOT EXISTS idx_files_success ON indexed_files(clang_success, treesitter_success);
      `);
    } catch (error) {
      // Indexes might fail if columns don't exist in existing tables
      // This is okay, the indexes are for optimization only
    }
  }
  
  private createPatternTables(db: Database.Database): void {
    db.exec(`
      -- Pattern detection results (merged from all parsers)
      CREATE TABLE IF NOT EXISTS detected_patterns (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        pattern_type TEXT NOT NULL,
        confidence REAL NOT NULL,
        detected_by TEXT NOT NULL, -- Which parser detected this
        details TEXT, -- JSON with pattern-specific details
        FOREIGN KEY (symbol_id) REFERENCES enhanced_symbols(id),
        UNIQUE(symbol_id, pattern_type, detected_by)
      );
      
      -- Symbol relationships (calls, inherits, implements, etc.)
      CREATE TABLE IF NOT EXISTS symbol_relationships (
        id INTEGER PRIMARY KEY,
        from_symbol_id INTEGER,
        from_symbol_usr TEXT,
        to_symbol_id INTEGER,
        to_symbol_usr TEXT,
        relationship_type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        detected_by TEXT NOT NULL,
        
        -- Cross-file analysis fields
        usage_pattern TEXT,        -- qualified_call, simple_call, type_usage, etc.
        source_text TEXT,         -- The actual source line where the relationship was found
        line_number INTEGER,      -- Line number in the source file
        
        -- At least one ID or USR must be provided
        CHECK (from_symbol_id IS NOT NULL OR from_symbol_usr IS NOT NULL),
        CHECK (to_symbol_id IS NOT NULL OR to_symbol_usr IS NOT NULL)
      );
      
      CREATE INDEX IF NOT EXISTS idx_rel_from_id ON symbol_relationships(from_symbol_id);
      CREATE INDEX IF NOT EXISTS idx_rel_to_id ON symbol_relationships(to_symbol_id);
      CREATE INDEX IF NOT EXISTS idx_rel_from_usr ON symbol_relationships(from_symbol_usr);
      CREATE INDEX IF NOT EXISTS idx_rel_to_usr ON symbol_relationships(to_symbol_usr);
      CREATE INDEX IF NOT EXISTS idx_rel_type ON symbol_relationships(relationship_type);
      CREATE INDEX IF NOT EXISTS idx_rel_usage_pattern ON symbol_relationships(usage_pattern);
      CREATE INDEX IF NOT EXISTS idx_rel_detected_by ON symbol_relationships(detected_by);
      
      -- Semantic connections between symbols
      CREATE TABLE IF NOT EXISTS semantic_connections (
        symbol_id INTEGER NOT NULL,
        connected_id INTEGER NOT NULL,
        connection_type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        evidence TEXT, -- JSON explaining the connection
        PRIMARY KEY (symbol_id, connected_id, connection_type),
        FOREIGN KEY (symbol_id) REFERENCES enhanced_symbols(id),
        FOREIGN KEY (connected_id) REFERENCES enhanced_symbols(id)
      );
      
      -- Pattern cache for expensive computations
      CREATE TABLE IF NOT EXISTS pattern_cache (
        pattern_name TEXT PRIMARY KEY,
        symbol_ids TEXT NOT NULL, -- JSON array
        last_updated INTEGER,
        computation_time_ms INTEGER
      );
    `);
  }
  
  private createQualityTables(db: Database.Database): void {
    db.exec(`
      -- Code duplication tracking with multi-parser support
      CREATE TABLE IF NOT EXISTS code_duplicates (
        id INTEGER PRIMARY KEY,
        
        -- Fragment information
        file1_path TEXT NOT NULL,
        file1_start INTEGER NOT NULL,
        file1_end INTEGER NOT NULL,
        file1_hash TEXT NOT NULL,
        
        file2_path TEXT NOT NULL,
        file2_start INTEGER NOT NULL,
        file2_end INTEGER NOT NULL,
        file2_hash TEXT NOT NULL,
        
        -- Duplication analysis
        duplicate_type INTEGER NOT NULL, -- 1-4 (exact, renamed, modified, semantic)
        similarity_score REAL NOT NULL,
        token_count INTEGER,
        
        -- Detection metadata
        detected_by TEXT NOT NULL,
        detection_confidence REAL NOT NULL,
        detection_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        
        -- Review status
        is_false_positive BOOLEAN DEFAULT 0,
        reviewed_by TEXT,
        review_notes TEXT,
        
        UNIQUE(file1_path, file1_start, file2_path, file2_start)
      );
      
      CREATE INDEX IF NOT EXISTS idx_dup_similarity ON code_duplicates(similarity_score);
      CREATE INDEX IF NOT EXISTS idx_dup_type ON code_duplicates(duplicate_type);
      
      -- Anti-pattern detections (unified from all detectors)
      CREATE TABLE IF NOT EXISTS antipatterns (
        id INTEGER PRIMARY KEY,
        pattern_name TEXT NOT NULL,
        pattern_category TEXT NOT NULL,
        severity TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER,
        
        -- Detection details
        detected_by TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT, -- JSON with specific evidence
        suggestion TEXT,
        
        -- Review status
        is_false_positive BOOLEAN DEFAULT 0,
        fixed BOOLEAN DEFAULT 0,
        fix_commit TEXT,
        
        detection_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(pattern_name, file_path, line_start)
      );
      
      CREATE INDEX IF NOT EXISTS idx_anti_pattern ON antipatterns(pattern_name);
      CREATE INDEX IF NOT EXISTS idx_anti_severity ON antipatterns(severity);
      CREATE INDEX IF NOT EXISTS idx_anti_file ON antipatterns(file_path);
      
      -- Enhanced anti-pattern analysis tables
      CREATE TABLE IF NOT EXISTS antipattern_stats (
        pattern_name TEXT PRIMARY KEY,
        total_detections INTEGER DEFAULT 0,
        false_positives INTEGER DEFAULT 0,
        last_detected INTEGER,
        avg_fix_time INTEGER
      );
      
      -- Pattern relationships (patterns that often appear together)
      CREATE TABLE IF NOT EXISTS pattern_correlations (
        pattern1 TEXT NOT NULL,
        pattern2 TEXT NOT NULL,
        correlation_count INTEGER DEFAULT 0,
        correlation_strength REAL,
        PRIMARY KEY (pattern1, pattern2)
      );
      
      -- Fix suggestions and examples for better development guidance
      CREATE TABLE IF NOT EXISTS fix_examples (
        id INTEGER PRIMARY KEY,
        pattern_name TEXT NOT NULL,
        before_code TEXT NOT NULL,
        after_code TEXT NOT NULL,
        explanation TEXT,
        upvotes INTEGER DEFAULT 0
      );
    `);
  }
  
  private createArchitecturalTables(db: Database.Database): void {
    db.exec(`
      -- Module information with enhanced metadata
      CREATE TABLE IF NOT EXISTS modules (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        module_name TEXT,
        pipeline_stage TEXT,
        
        -- Module analysis results
        exports TEXT, -- JSON array
        imports TEXT, -- JSON array
        dependencies TEXT, -- JSON array
        
        -- Quality metrics
        cohesion_score REAL,
        coupling_score REAL,
        complexity_score REAL,
        
        -- Parser success tracking
        parse_success BOOLEAN DEFAULT 1,
        parse_errors TEXT, -- JSON array
        
        last_analyzed INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_modules_stage ON modules(pipeline_stage);
      CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(module_name);
      
      -- Class hierarchy with multi-source support
      CREATE TABLE IF NOT EXISTS class_hierarchies (
        id INTEGER PRIMARY KEY,
        class_name TEXT NOT NULL,
        class_usr TEXT,
        file_path TEXT NOT NULL,
        
        -- Inheritance information
        base_class TEXT,
        base_usr TEXT,
        inheritance_type TEXT, -- public, private, protected
        
        -- Interface implementation
        implements_interface TEXT,
        interface_usr TEXT,
        
        -- Detection metadata
        detected_by TEXT NOT NULL,
        confidence REAL NOT NULL,
        
        UNIQUE(class_name, file_path, base_class, implements_interface)
      );
      
      CREATE INDEX IF NOT EXISTS idx_hierarchy_class ON class_hierarchies(class_name);
      CREATE INDEX IF NOT EXISTS idx_hierarchy_base ON class_hierarchies(base_class);
      CREATE INDEX IF NOT EXISTS idx_hierarchy_interface ON class_hierarchies(implements_interface);
    `);
  }
  
  private createAgentTables(db: Database.Database): void {
    db.exec(`
      -- Agent work session tracking
      CREATE TABLE IF NOT EXISTS agent_sessions (
        session_id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        task_description TEXT NOT NULL,
        architectural_stage TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT NOT NULL, -- active, completed, failed
        quality_score_before REAL,
        quality_score_after REAL,
        
        -- Additional unified schema fields
        start_time INTEGER DEFAULT (strftime('%s', 'now')),
        end_time INTEGER,
        symbols_analyzed INTEGER DEFAULT 0,
        patterns_detected INTEGER DEFAULT 0,
        suggestions_made INTEGER DEFAULT 0,
        confidence_score REAL
      );
      
      -- Agent context and session management tables (matching AgentContextService schema)
      CREATE TABLE IF NOT EXISTS session_modifications (
        session_id TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        modification_type TEXT NOT NULL, -- added, modified, deleted
        old_signature TEXT,
        new_signature TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );
      
      CREATE TABLE IF NOT EXISTS boundary_crossings (
        session_id TEXT NOT NULL,
        from_stage TEXT NOT NULL,
        to_stage TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        crossing_type TEXT NOT NULL, -- dependency, call, inheritance
        severity TEXT NOT NULL, -- allowed, warning, violation
        suggestion TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );
      
      CREATE TABLE IF NOT EXISTS execution_constraints (
        constraint_id TEXT PRIMARY KEY,
        constraint_type TEXT NOT NULL, -- boundary, pattern, quality
        stage TEXT,
        description TEXT NOT NULL,
        enforcement_level TEXT NOT NULL, -- strict, warning, suggestion
        active BOOLEAN DEFAULT 1
      );
      
      -- REMOVED: validation_results table - no usage found in codebase
      -- CREATE TABLE IF NOT EXISTS validation_results (...)
      
      CREATE TABLE IF NOT EXISTS guidance_rules (
        rule_id TEXT PRIMARY KEY,
        rule_name TEXT NOT NULL,
        pattern TEXT NOT NULL, -- regex or AST pattern
        stage TEXT,
        guidance_type TEXT NOT NULL, -- avoid, prefer, require
        explanation TEXT NOT NULL,
        example_good TEXT,
        example_bad TEXT,
        active BOOLEAN DEFAULT 1
      );
      
      -- Enhanced quality metrics with rich type information
      CREATE TABLE IF NOT EXISTS quality_metrics (
        id INTEGER PRIMARY KEY,
        session_id TEXT,
        file_path TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value_before REAL,
        value_after REAL,
        delta REAL,
        
        -- Enhanced metrics leveraging our rich data
        vulkan_type_usage_score REAL,
        std_type_usage_score REAL,
        planetgen_type_usage_score REAL,
        namespace_cohesion_score REAL,
        module_export_quality_score REAL,
        semantic_connection_density REAL,
        pipeline_stage_clarity REAL,
        type_safety_score REAL,
        
        timestamp INTEGER NOT NULL,
        confidence REAL DEFAULT 1.0,
        
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );
      
      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_session_status ON agent_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_modifications_session ON session_modifications(session_id);
      CREATE INDEX IF NOT EXISTS idx_crossings_session ON boundary_crossings(session_id);
      -- Enhanced indexes for analytics performance
      CREATE INDEX IF NOT EXISTS idx_quality_metrics_file ON quality_metrics(file_path);
      CREATE INDEX IF NOT EXISTS idx_quality_metrics_session ON quality_metrics(session_id);
      CREATE INDEX IF NOT EXISTS idx_quality_metrics_timestamp ON quality_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_symbol_quality_type_safety ON analytics_symbol_quality(type_safety_score);
      CREATE INDEX IF NOT EXISTS idx_module_metrics_health ON analytics_module_metrics(health_score);
      CREATE INDEX IF NOT EXISTS idx_module_metrics_integration ON analytics_module_metrics(type_ecosystem_integration);
      
      -- Architectural decisions with reasoning
      CREATE TABLE IF NOT EXISTS architectural_decisions (
        id INTEGER PRIMARY KEY,
        session_id TEXT,
        
        -- Decision details
        decision_type TEXT NOT NULL,
        module_path TEXT,
        description TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        
        -- Supporting evidence
        evidence_symbols TEXT, -- JSON array of symbol IDs
        evidence_patterns TEXT, -- JSON array of pattern IDs
        
        -- Decision metadata
        confidence REAL NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        
        -- ThoughtSignature compatibility fields
        type TEXT, -- For compatibility with ThoughtSignaturePreserver
        module TEXT, -- For compatibility with ThoughtSignaturePreserver
        decision TEXT, -- For compatibility with ThoughtSignaturePreserver
        impact TEXT, -- For compatibility with ThoughtSignaturePreserver
        encrypted_context TEXT, -- For encrypted context storage
        
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );

      -- Thought patterns for consciousness preservation
      CREATE TABLE IF NOT EXISTS thought_patterns (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        context TEXT NOT NULL,
        pattern_hash TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_decisions_type ON architectural_decisions(decision_type);
      CREATE INDEX IF NOT EXISTS idx_decisions_session ON architectural_decisions(session_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_module ON architectural_decisions(module);
      CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON architectural_decisions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_patterns_timestamp ON thought_patterns(timestamp);
      
      -- Analytics tables for comprehensive quality analysis
      CREATE TABLE IF NOT EXISTS analytics_symbol_quality (
        file_path TEXT PRIMARY KEY,
        total_symbols INTEGER,
        high_confidence_symbols INTEGER,
        avg_confidence REAL,
        avg_complexity REAL,
        has_antipatterns BOOLEAN,
        has_duplicates BOOLEAN,
        
        -- Enhanced type analytics from our rich data
        vulkan_type_count INTEGER DEFAULT 0,
        std_type_count INTEGER DEFAULT 0,
        planetgen_type_count INTEGER DEFAULT 0,
        enum_class_count INTEGER DEFAULT 0,
        exported_symbol_count INTEGER DEFAULT 0,
        constructor_destructor_pairs INTEGER DEFAULT 0,
        operator_overload_count INTEGER DEFAULT 0,
        template_specialization_count INTEGER DEFAULT 0,
        semantic_connection_count INTEGER DEFAULT 0,
        
        -- Type safety and quality scores
        type_safety_score REAL DEFAULT 0.0,
        api_design_score REAL DEFAULT 0.0,
        namespace_organization_score REAL DEFAULT 0.0,
        module_cohesion_score REAL DEFAULT 0.0,
        
        last_updated INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS analytics_module_metrics (
        module_path TEXT PRIMARY KEY,
        cohesion_score REAL,
        coupling_score REAL,
        afferent_coupling INTEGER,
        efferent_coupling INTEGER,
        instability REAL,
        abstractness REAL,
        main_sequence_distance REAL,
        health_score REAL,
        
        -- Enhanced module analytics leveraging our rich semantic data
        export_interface_quality REAL DEFAULT 0.0,  -- How well-designed are exported APIs
        type_ecosystem_integration REAL DEFAULT 0.0, -- Integration with Vulkan/STL/PlanetGen
        pipeline_stage_alignment REAL DEFAULT 0.0,  -- How well module aligns with its pipeline stage
        semantic_coherence REAL DEFAULT 0.0,        -- How semantically related are module contents
        module_export_completeness REAL DEFAULT 0.0, -- Are all important symbols exported
        cross_stage_dependency_health REAL DEFAULT 0.0, -- Quality of dependencies between pipeline stages
        
        -- Detailed breakdowns
        vulkan_wrapper_ratio REAL DEFAULT 0.0,      -- Ratio of Vulkan wrappers to raw Vulkan usage
        factory_pattern_usage REAL DEFAULT 0.0,     -- How well factory patterns are used
        raii_compliance_score REAL DEFAULT 0.0,     -- Constructor/destructor pair completeness
        const_correctness_score REAL DEFAULT 0.0,   -- Const/non-const method pair completeness
        
        last_updated INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS analytics_cache (
        cache_key TEXT PRIMARY KEY,
        cache_value TEXT,
        created_at INTEGER,
        expires_at INTEGER
      );
      
      -- Usage examples for better development guidance
      CREATE TABLE IF NOT EXISTS usage_examples (
        id INTEGER PRIMARY KEY,
        symbol TEXT NOT NULL,
        module_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        example_code TEXT NOT NULL,
        context TEXT,
        effectiveness_rating REAL DEFAULT 0.5
      );
    `);
  }
  
  private createCompatibilityViews(db: Database.Database): void {
    // Create views for backward compatibility with existing code
    db.exec(`
      -- Compatibility view for ClangIntelligentIndexer
      CREATE VIEW IF NOT EXISTS symbols AS
      SELECT 
        id,
        name,
        mangled_name,
        kind,
        file_path,
        line,
        column,
        is_definition,
        signature,
        return_type,
        parent_class as parent_symbol,
        'public' as visibility,
        is_template,
        template_params,
        namespace as semantic_parent,
        namespace as lexical_parent,
        usr
      FROM enhanced_symbols
      WHERE parser_used = 'clang' OR usr IS NOT NULL;
      
      -- Compatibility view for code_clones table
      CREATE VIEW IF NOT EXISTS code_clones AS
      SELECT
        id,
        duplicate_type as clone_type,
        similarity_score,
        0 as fragment1_id,
        0 as fragment2_id,
        file1_path as fragment1_path,
        file1_start as fragment1_start,
        file1_end as fragment1_end,
        file2_path as fragment2_path,
        file2_start as fragment2_start,
        file2_end as fragment2_end,
        NULL as clone_group,
        detection_timestamp,
        is_false_positive
      FROM code_duplicates;
      
      -- Compatibility view for antipattern_detections
      CREATE VIEW IF NOT EXISTS antipattern_detections AS
      SELECT
        id,
        pattern_name,
        pattern_category as pattern_type,
        severity,
        file_path,
        line_start as line,
        line_end,
        detected_by,
        confidence,
        evidence,
        suggestion,
        is_false_positive,
        fixed,
        detection_timestamp
      FROM antipatterns;
      
      -- Module index compatibility
      CREATE VIEW IF NOT EXISTS module_index AS
      SELECT
        path,
        relative_path,
        pipeline_stage as stage,
        exports,
        imports,
        dependencies
      FROM modules;
      
      -- Enhanced modules compatibility
      CREATE VIEW IF NOT EXISTS enhanced_modules AS
      SELECT
        path,
        relative_path,
        pipeline_stage as stage,
        json_object(
          'exports', json(exports),
          'imports', json(imports),
          'classes', '[]',
          'functions', '[]'
        ) as module_data
      FROM modules;
    `);
  }
  
  private createMergeTriggers(db: Database.Database): void {
    // Trigger to handle parser result merging based on confidence
    db.exec(`
      -- Trigger to update parser history when symbols are inserted/updated
      CREATE TRIGGER IF NOT EXISTS update_parser_history
      AFTER INSERT ON enhanced_symbols
      BEGIN
        UPDATE enhanced_symbols
        SET parser_history = json_insert(
          COALESCE(parser_history, '[]'),
          '$[#]',
          json_object(
            'parser', NEW.parser_used,
            'confidence', NEW.parser_confidence,
            'timestamp', NEW.parse_timestamp
          )
        )
        WHERE id = NEW.id;
      END;
      
      -- Trigger to update file tracking when symbols are added
      CREATE TRIGGER IF NOT EXISTS update_file_tracking
      AFTER INSERT ON enhanced_symbols
      BEGIN
        UPDATE indexed_files
        SET 
          clang_symbols = CASE 
            WHEN NEW.parser_used = 'clang' 
            THEN COALESCE(clang_symbols, 0) + 1 
            ELSE clang_symbols 
          END,
          treesitter_symbols = CASE 
            WHEN NEW.parser_used = 'tree-sitter' 
            THEN COALESCE(treesitter_symbols, 0) + 1 
            ELSE treesitter_symbols 
          END,
          streaming_symbols = CASE 
            WHEN NEW.parser_used = 'streaming' 
            THEN COALESCE(streaming_symbols, 0) + 1 
            ELSE streaming_symbols 
          END,
          best_parser = CASE 
            WHEN NEW.parser_confidence > COALESCE(best_confidence, 0) 
            THEN NEW.parser_used 
            ELSE best_parser 
          END,
          best_confidence = CASE 
            WHEN NEW.parser_confidence > COALESCE(best_confidence, 0) 
            THEN NEW.parser_confidence 
            ELSE best_confidence 
          END
        WHERE path = NEW.file_path;
      END;
    `);
  }
  
  /**
   * Safely merge parser results based on confidence scores
   */
  mergeParserResult(
    db: Database.Database, 
    symbol: any, 
    parser: string, 
    confidence: number
  ): void {
    const existing = db.prepare(`
      SELECT id, parser_confidence 
      FROM enhanced_symbols 
      WHERE name = ? AND file_path = ? AND line = ? AND kind = ?
    `).get(symbol.name, symbol.file_path, symbol.line, symbol.kind) as any;
    
    if (!existing || confidence > existing.parser_confidence) {
      // New symbol or higher confidence - insert/update
      const stmt = db.prepare(`
        INSERT INTO enhanced_symbols (
          name, qualified_name, kind, file_path, line, column,
          signature, return_type, parent_class, namespace,
          mangled_name, is_definition, is_template, template_params, usr,
          execution_mode, is_async, is_factory, is_generator, pipeline_stage,
          returns_vector_float, uses_gpu_compute, has_cpu_fallback,
          semantic_tags, related_symbols, complexity,
          parser_used, parser_confidence
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(name, file_path, line, kind) DO UPDATE SET
          qualified_name = excluded.qualified_name,
          column = excluded.column,
          signature = COALESCE(excluded.signature, signature),
          return_type = COALESCE(excluded.return_type, return_type),
          parent_class = COALESCE(excluded.parent_class, parent_class),
          namespace = COALESCE(excluded.namespace, namespace),
          mangled_name = COALESCE(excluded.mangled_name, mangled_name),
          is_definition = COALESCE(excluded.is_definition, is_definition),
          is_template = COALESCE(excluded.is_template, is_template),
          template_params = COALESCE(excluded.template_params, template_params),
          usr = COALESCE(excluded.usr, usr),
          execution_mode = COALESCE(excluded.execution_mode, execution_mode),
          is_async = COALESCE(excluded.is_async, is_async),
          is_factory = COALESCE(excluded.is_factory, is_factory),
          is_generator = COALESCE(excluded.is_generator, is_generator),
          pipeline_stage = COALESCE(excluded.pipeline_stage, pipeline_stage),
          returns_vector_float = COALESCE(excluded.returns_vector_float, returns_vector_float),
          uses_gpu_compute = COALESCE(excluded.uses_gpu_compute, uses_gpu_compute),
          has_cpu_fallback = COALESCE(excluded.has_cpu_fallback, has_cpu_fallback),
          semantic_tags = excluded.semantic_tags,
          related_symbols = excluded.related_symbols,
          complexity = COALESCE(excluded.complexity, complexity),
          parser_used = excluded.parser_used,
          parser_confidence = excluded.parser_confidence,
          parse_timestamp = strftime('%s', 'now')
        WHERE excluded.parser_confidence > parser_confidence;
      `);
      
      stmt.run(
        symbol.name,
        symbol.qualified_name || symbol.name,
        symbol.kind,
        symbol.file_path,
        symbol.line,
        symbol.column || 0,
        symbol.signature,
        symbol.return_type,
        symbol.parent_class,
        symbol.namespace,
        symbol.mangled_name,
        symbol.is_definition ? 1 : 0,
        symbol.is_template ? 1 : 0,
        symbol.template_params ? JSON.stringify(symbol.template_params) : null,
        symbol.usr,
        symbol.execution_mode,
        symbol.is_async ? 1 : 0,
        symbol.is_factory ? 1 : 0,
        symbol.is_generator ? 1 : 0,
        symbol.pipeline_stage,
        symbol.returns_vector_float ? 1 : 0,
        symbol.uses_gpu_compute ? 1 : 0,
        symbol.has_cpu_fallback ? 1 : 0,
        JSON.stringify(symbol.semantic_tags || []),
        JSON.stringify(symbol.related_symbols || []),
        symbol.complexity || 0,
        parser,
        confidence
      );
    }
  }

  /**
   * Schedule progressive background re-indexing for out-of-date files
   */
  scheduleProgressiveReindexing(
    db: Database.Database, 
    projectPath: string, 
    reindexCallback: (filePath: string) => Promise<void>
  ): void {
    const dbKey = db.name || 'default';
    
    // Clear existing timer if any
    if (this.backgroundReindexing.has(dbKey)) {
      clearInterval(this.backgroundReindexing.get(dbKey)!);
    }
    
    // Schedule periodic check for out-of-date files
    const timer = setInterval(async () => {
      try {
        const outdatedFiles = this.findOutdatedFiles(db, projectPath);
        
        if (outdatedFiles.length > 0) {
          console.log(`📋 Found ${outdatedFiles.length} files needing re-indexing`);
          
          // Process one file at a time to avoid overwhelming the system
          const filePath = outdatedFiles[0];
          console.log(`🔄 Progressive re-indexing: ${filePath}`);
          
          try {
            await reindexCallback(filePath);
            
            // Update the last_indexed timestamp
            db.prepare(`
              UPDATE indexed_files 
              SET last_indexed = strftime('%s', 'now')
              WHERE path = ?
            `).run(filePath);
            
          } catch (error: unknown) {
            console.error(`Re-indexing failed for ${filePath}:`, error instanceof Error ? error.message : error);
            
            // Mark as failed to avoid retry loops
            // Since we don't know which parser failed during reindexing, mark both as having errors
            // but don't change the success flags - they might have succeeded before
            db.prepare(`
              UPDATE indexed_files 
              SET last_indexed = strftime('%s', 'now'),
                  clang_error = CASE 
                    WHEN clang_success = 0 THEN ? 
                    ELSE clang_error 
                  END,
                  treesitter_error = CASE 
                    WHEN treesitter_success = 0 THEN ? 
                    ELSE treesitter_error 
                  END
              WHERE path = ?
            `).run(
              error instanceof Error ? error.message : String(error), 
              error instanceof Error ? error.message : String(error), 
              filePath
            );
          }
        }
        
      } catch (error: unknown) {
        console.error('Progressive re-indexing check failed:', error instanceof Error ? error.message : error);
      }
    }, 30000); // Check every 30 seconds
    
    this.backgroundReindexing.set(dbKey, timer);
  }

  /**
   * Find files that are out of date and need re-indexing
   */
  private findOutdatedFiles(db: Database.Database, projectPath: string): string[] {
    const cutoffTime = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // 24 hours ago
    
    const outdatedFiles = db.prepare(`
      SELECT path FROM indexed_files 
      WHERE (
        last_indexed < ? OR 
        (clang_success = 0 AND treesitter_success = 0 AND streaming_success = 0) OR
        (best_confidence < 0.5)
      )
      AND path LIKE ?
      -- Don't retry files that have recent errors from all parsers
      AND NOT (
        clang_error IS NOT NULL AND 
        treesitter_error IS NOT NULL AND 
        last_indexed > ?
      )
      ORDER BY last_indexed ASC, best_confidence ASC
      LIMIT 10
    `).all(cutoffTime, `${projectPath}%`, cutoffTime - (60 * 60)) as { path: string }[];
    
    return outdatedFiles.map(f => f.path);
  }

  /**
   * Check if a file has changed since last indexing
   */
  async hasFileChanged(db: Database.Database, filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const crypto = await import('crypto');
      
      const content = await fs.readFile(filePath, 'utf-8');
      const currentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      const record = db.prepare(`
        SELECT hash FROM indexed_files WHERE path = ?
      `).get(filePath) as { hash?: string } | undefined;
      
      return !record || record.hash !== currentHash;
      
    } catch (error) {
      // File might not exist anymore
      return true;
    }
  }

  /**
   * Stop background re-indexing for a database
   */
  stopProgressiveReindexing(db: Database.Database): void {
    const dbKey = db.name || 'default';
    
    if (this.backgroundReindexing.has(dbKey)) {
      clearInterval(this.backgroundReindexing.get(dbKey)!);
      this.backgroundReindexing.delete(dbKey);
    }
  }

  /**
   * Store parser quality metrics for tracking
   */
  storeParserMetrics(
    db: Database.Database,
    parserName: string,
    filePath: string,
    metrics: {
      symbolsDetected: number;
      confidence: number;
      semanticCoverage: number;
      parseTimeMs: number;
      success: boolean;
      error?: string;
    }
  ): void {
    // Update indexed_files with parser-specific metrics
    const stmt = db.prepare(`
      UPDATE indexed_files
      SET 
        ${parserName}_attempted = 1,
        ${parserName}_success = ?,
        ${parserName}_symbols = ?,
        ${parserName}_error = ?,
        best_parser = CASE 
          WHEN ? > COALESCE(best_confidence, 0) THEN ?
          ELSE best_parser 
        END,
        best_confidence = CASE 
          WHEN ? > COALESCE(best_confidence, 0) THEN ?
          ELSE best_confidence 
        END
      WHERE path = ?
    `);

    stmt.run(
      metrics.success ? 1 : 0,
      metrics.symbolsDetected,
      metrics.error || null,
      metrics.confidence,
      parserName,
      metrics.confidence,
      metrics.confidence,
      filePath
    );
    
    // Also insert into parser_metrics table for detailed tracking
    try {
      const metricsStmt = db.prepare(`
        INSERT INTO parser_metrics (
          parser_name, file_path, parse_time_ms, symbols_detected,
          confidence, semantic_coverage, success, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      metricsStmt.run(
        parserName,
        filePath,
        metrics.parseTimeMs,
        metrics.symbolsDetected,
        metrics.confidence,
        metrics.semanticCoverage,
        metrics.success ? 1 : 0,
        metrics.error || null
      );
    } catch (e) {
      // Table might not exist in older databases
      console.debug('Could not insert into parser_metrics table:', e);
    }
  }

  /**
   * Get parser quality metrics from the unified database
   */
  getParserQualityMetrics(db: Database.Database): any {
    const metrics = db.prepare(`
      SELECT 
        'clang' as parser,
        COUNT(CASE WHEN clang_attempted = 1 THEN 1 END) as files_attempted,
        COUNT(CASE WHEN clang_success = 1 THEN 1 END) as files_succeeded,
        SUM(COALESCE(clang_symbols, 0)) as total_symbols,
        COUNT(CASE WHEN best_parser = 'clang' THEN 1 END) as best_parser_count
      FROM indexed_files
      UNION ALL
      SELECT 
        'treesitter' as parser,
        COUNT(CASE WHEN treesitter_attempted = 1 THEN 1 END) as files_attempted,
        COUNT(CASE WHEN treesitter_success = 1 THEN 1 END) as files_succeeded,
        SUM(COALESCE(treesitter_symbols, 0)) as total_symbols,
        COUNT(CASE WHEN best_parser = 'treesitter' THEN 1 END) as best_parser_count
      FROM indexed_files
      UNION ALL
      SELECT 
        'streaming' as parser,
        COUNT(CASE WHEN streaming_attempted = 1 THEN 1 END) as files_attempted,
        COUNT(CASE WHEN streaming_success = 1 THEN 1 END) as files_succeeded,
        SUM(COALESCE(streaming_symbols, 0)) as total_symbols,
        COUNT(CASE WHEN best_parser = 'streaming' THEN 1 END) as best_parser_count
      FROM indexed_files
    `).all();

    return metrics;
  }

  /**
   * Get analytics integration metrics from unified database
   */
  getAnalyticsMetrics(db: Database.Database): any {
    const duplicates = db.prepare(`
      SELECT COUNT(*) as count FROM code_duplicates
    `).get() as { count: number };

    const antipatterns = db.prepare(`
      SELECT COUNT(*) as count FROM antipatterns
    `).get() as { count: number };

    const solidViolations = db.prepare(`
      SELECT COUNT(*) as count FROM antipatterns 
      WHERE pattern_category = 'SOLID'
    `).get() as { count: number };

    const factoryViolations = db.prepare(`
      SELECT COUNT(*) as count FROM antipatterns 
      WHERE pattern_name LIKE '%Factory%'
    `).get() as { count: number };

    const fileTypeCoverage = db.prepare(`
      SELECT 
        CASE 
          WHEN path LIKE '%.ixx' OR path LIKE '%.cppm' THEN 'module'
          WHEN path LIKE '%.h' OR path LIKE '%.hpp' OR path LIKE '%.hxx' THEN 'header'
          WHEN path LIKE '%.cpp' OR path LIKE '%.cc' OR path LIKE '%.cxx' THEN 'implementation'
          ELSE 'other'
        END as file_type,
        COUNT(*) as count
      FROM indexed_files
      GROUP BY file_type
    `).all() as { file_type: string; count: number }[];

    return {
      duplicatesFound: duplicates.count,
      antiPatternsDetected: antipatterns.count,
      solidViolations: solidViolations.count,
      factoryViolations: factoryViolations.count,
      fileTypeCoverage: fileTypeCoverage.reduce((acc, curr) => {
        acc[curr.file_type] = curr.count;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  /**
   * Get high confidence symbol percentage from unified database
   */
  getHighConfidenceSymbolPercentage(db: Database.Database): number {
    const result = db.prepare(`
      SELECT 
        COUNT(CASE WHEN parser_confidence >= 0.9 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as percentage
      FROM enhanced_symbols
    `).get() as { percentage: number | null };

    return result.percentage || 0;
  }

  /**
   * Get semantic coverage by parser
   */
  getSemanticCoverageByParser(db: Database.Database): any {
    const coverage = db.prepare(`
      SELECT 
        parser_used,
        COUNT(*) as total_symbols,
        COUNT(CASE WHEN json_array_length(semantic_tags) > 0 THEN 1 END) as tagged_symbols,
        COUNT(CASE WHEN json_array_length(semantic_tags) > 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as coverage_percentage
      FROM enhanced_symbols
      GROUP BY parser_used
    `).all();

    return coverage;
  }

  /**
   * Get integration health report
   */
  getIntegrationHealthReport(db: Database.Database): any {
    const parserMetrics = this.getParserQualityMetrics(db);
    const analyticsMetrics = this.getAnalyticsMetrics(db);
    const highConfidencePercentage = this.getHighConfidenceSymbolPercentage(db);
    const semanticCoverage = this.getSemanticCoverageByParser(db);
    const reindexingStats = this.getReindexingStats(db);

    const recommendations = this.generateRecommendations(
      parserMetrics,
      analyticsMetrics,
      highConfidencePercentage,
      semanticCoverage
    );

    return {
      parserMetrics,
      analyticsMetrics,
      highConfidencePercentage,
      semanticCoverage,
      reindexingStats,
      recommendations
    };
  }

  /**
   * Generate recommendations based on unified metrics
   */
  private generateRecommendations(
    parserMetrics: any[],
    analyticsMetrics: any,
    highConfidencePercentage: number,
    semanticCoverage: any[]
  ): string[] {
    const recommendations: string[] = [];

    if (highConfidencePercentage < 50) {
      recommendations.push(
        'Critical: Less than 50% high-confidence symbols. Consider installing Clang for better parsing accuracy.'
      );
    }

    const clangMetrics = parserMetrics.find(m => m.parser === 'clang');
    if (!clangMetrics || clangMetrics.files_succeeded === 0) {
      recommendations.push(
        'Clang parser not successfully parsing files. Check Clang installation and C++23 module configuration.'
      );
    }

    if (analyticsMetrics.duplicatesFound === 0 && analyticsMetrics.antiPatternsDetected > 0) {
      recommendations.push(
        'Anti-patterns detected but no duplicates found. Clang AST analysis may improve duplicate detection.'
      );
    }

    const treeSitterCoverage = semanticCoverage.find(s => s.parser_used === 'tree-sitter');
    if (treeSitterCoverage && treeSitterCoverage.coverage_percentage < 70) {
      recommendations.push(
        `Tree-sitter semantic coverage is ${treeSitterCoverage.coverage_percentage.toFixed(1)}%. Enhance pattern detection rules.`
      );
    }

    return recommendations;
  }

  /**
   * Get re-indexing statistics
   */
  getReindexingStats(db: Database.Database): {
    totalFiles: number;
    successfullyParsed: number;
    needsReindexing: number;
    averageConfidence: number;
  } {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalFiles,
        SUM(CASE WHEN clang_success = 1 OR treesitter_success = 1 THEN 1 ELSE 0 END) as successfullyParsed,
        AVG(best_confidence) as averageConfidence
      FROM indexed_files
    `).get() as any;
    
    const cutoffTime = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
    const needsReindexing = db.prepare(`
      SELECT COUNT(*) as count
      FROM indexed_files 
      WHERE last_indexed < ? OR best_confidence < 0.5
    `).get(cutoffTime) as { count: number };
    
    return {
      totalFiles: stats.totalFiles || 0,
      successfullyParsed: stats.successfullyParsed || 0,
      needsReindexing: needsReindexing.count || 0,
      averageConfidence: stats.averageConfidence || 0
    };
  }
  
  private createParserMetricsTable(db: Database.Database): void {
    db.exec(`
      -- Parser performance metrics
      CREATE TABLE IF NOT EXISTS parser_metrics (
        id INTEGER PRIMARY KEY,
        parser_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        parse_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        
        -- Performance metrics
        parse_time_ms INTEGER,
        symbols_detected INTEGER,
        confidence REAL,
        semantic_coverage REAL,
        
        -- Success/failure tracking
        success BOOLEAN NOT NULL,
        error_message TEXT,
        
        -- Additional metrics
        file_size INTEGER,
        memory_used_mb INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_parser_metrics_file ON parser_metrics(file_path);
      CREATE INDEX IF NOT EXISTS idx_parser_metrics_parser ON parser_metrics(parser_name);
    `);
  }
  
}