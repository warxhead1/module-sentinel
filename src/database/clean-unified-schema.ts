import Database from 'better-sqlite3';

/**
 * Clean Unified Database Schema Manager
 * 
 * Simplified schema focused on the unified parser and essential features.
 * Removed legacy multi-parser complexity and overly complex analytics.
 */
export class CleanUnifiedSchemaManager {
  private static instance: CleanUnifiedSchemaManager;
  private initializedDatabases = new Set<string>();
  
  private constructor() {}
  
  static getInstance(): CleanUnifiedSchemaManager {
    if (!CleanUnifiedSchemaManager.instance) {
      CleanUnifiedSchemaManager.instance = new CleanUnifiedSchemaManager();
    }
    return CleanUnifiedSchemaManager.instance;
  }
  
  /**
   * Initialize clean database schema optimized for unified parser
   */
  initializeDatabase(db: Database.Database): void {
    // Use the actual database file path as identifier, or 'memory' for in-memory databases
    const dbIdentifier = db.memory ? 'memory' : db.name || 'unknown';
    if (this.initializedDatabases.has(dbIdentifier)) return;
    
    console.log('🔧 Initializing clean unified schema...');
    
    try {
      // Core tables only
      this.createCoreSymbolTable(db);
      this.createFileTrackingTable(db);
      this.createRelationshipTable(db);
      this.createPatternTable(db);
      this.createModuleTable(db);
      
      // Essential MCP tool tables
      this.createToolsTables(db);
      
      // Agent session tracking (simplified)
      this.createAgentTables(db);
      
      // Class hierarchy table
      this.createClassHierarchyTable(db);
      
      // Code patterns table
      this.createCodePatternsTable(db);
      
      // Semantic connections table
      this.createSemanticConnectionsTable(db);
      
      // Rich semantic analysis tables (required by tests for data flow tracking)
      this.createRichSemanticTables(db);
      
      // Create indexes for performance (with fail-safe)
      console.log('🔧 Creating indexes...');
      this.createIndexesSafely(db);
      
      console.log('✅ Clean unified schema initialized');
      this.initializedDatabases.add(dbIdentifier);
    } catch (error) {
      console.error('❌ Failed to initialize database schema:', error);
      throw new Error(`Database schema initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Core symbol table - clean and focused
   */
  private createCoreSymbolTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS enhanced_symbols (
        id INTEGER PRIMARY KEY,
        
        -- Essential symbol information
        name TEXT NOT NULL,
        qualified_name TEXT,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER DEFAULT 0,
        
        -- Core details
        signature TEXT,
        return_type TEXT,
        parent_class TEXT,
        namespace TEXT,
        mangled_name TEXT,
        usr TEXT,
        
        -- Unified parser results
        semantic_tags TEXT DEFAULT '[]', -- JSON array
        related_symbols TEXT DEFAULT '[]', -- JSON array
        complexity INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.0,
        parser_confidence REAL DEFAULT 0.0,
        
        -- C++23 Module support
        is_exported BOOLEAN DEFAULT 0,
        module_name TEXT,
        export_namespace TEXT,
        
        -- Type information (simplified)
        is_template BOOLEAN DEFAULT 0,
        template_params TEXT,
        template_arguments TEXT DEFAULT '[]', -- JSON array (required by indexer)
        base_type TEXT,
        is_pointer BOOLEAN DEFAULT 0,
        is_reference BOOLEAN DEFAULT 0,
        is_constructor BOOLEAN DEFAULT 0,
        is_destructor BOOLEAN DEFAULT 0,
        is_operator BOOLEAN DEFAULT 0,
        operator_type TEXT,
        is_virtual BOOLEAN DEFAULT 0,
        is_static BOOLEAN DEFAULT 0,
        is_const BOOLEAN DEFAULT 0,
        is_vulkan_type BOOLEAN DEFAULT 0,
        is_std_type BOOLEAN DEFAULT 0,
        is_planetgen_type BOOLEAN DEFAULT 0,
        is_definition BOOLEAN DEFAULT 0,
        
        -- Enhanced Enum Support (required by indexer)
        is_enum BOOLEAN DEFAULT 0,
        is_enum_class BOOLEAN DEFAULT 0,
        enum_values TEXT DEFAULT '[]', -- JSON array of enum values
        
        -- Pattern flags (simplified)
        is_factory BOOLEAN DEFAULT 0,
        is_vulkan_api BOOLEAN DEFAULT 0,
        uses_smart_pointers BOOLEAN DEFAULT 0,
        uses_modern_cpp BOOLEAN DEFAULT 0,
        
        -- Execution patterns
        execution_mode TEXT,
        is_async BOOLEAN DEFAULT 0,
        is_generator BOOLEAN DEFAULT 0,
        pipeline_stage TEXT,
        returns_vector_float BOOLEAN DEFAULT 0,
        uses_gpu_compute BOOLEAN DEFAULT 0,
        has_cpu_fallback BOOLEAN DEFAULT 0,
        
        -- Metadata
        parser_used TEXT DEFAULT 'unified',
        parse_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        body_hash TEXT,
        
        UNIQUE(name, file_path, line, kind)
      );
    `);
  }
  
  /**
   * File tracking - simplified
   */
  private createFileTrackingTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        hash TEXT,
        last_indexed INTEGER NOT NULL,
        
        -- Parse results
        confidence REAL DEFAULT 0.0,
        symbol_count INTEGER DEFAULT 0,
        
        -- File metadata
        file_size INTEGER,
        is_module BOOLEAN DEFAULT 0
      );
    `);
  }
  
  /**
   * Symbol relationships - clean and focused
   */
  private createRelationshipTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS symbol_relationships (
        id INTEGER PRIMARY KEY,
        from_symbol_id INTEGER,
        to_symbol_id INTEGER,
        from_name TEXT,
        to_name TEXT,
        relationship_type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        
        -- Context
        line_number INTEGER,
        source_context TEXT,
        usage_pattern TEXT,
        source_text TEXT,
        
        -- Metadata
        detected_by TEXT DEFAULT 'unified',
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        
        FOREIGN KEY (from_symbol_id) REFERENCES enhanced_symbols(id),
        FOREIGN KEY (to_symbol_id) REFERENCES enhanced_symbols(id)
      );
    `);
  }
  
  /**
   * Pattern detection results - simplified
   */
  private createPatternTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS detected_patterns (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        pattern_type TEXT NOT NULL,
        pattern_name TEXT,
        confidence REAL NOT NULL,
        
        -- Context
        line_number INTEGER,
        details TEXT, -- JSON with pattern details
        
        -- Metadata
        detected_by TEXT DEFAULT 'unified',
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        
        FOREIGN KEY (symbol_id) REFERENCES enhanced_symbols(id)
      );
      
      -- Pattern cache table (required by PatternAwareIndexer for search performance)
      CREATE TABLE IF NOT EXISTS pattern_cache (
        pattern_name TEXT PRIMARY KEY,
        symbol_ids TEXT NOT NULL, -- JSON array of symbol IDs
        last_updated INTEGER,
        computation_time_ms INTEGER
      );
    `);
  }
  
  /**
   * Module information - clean
   */
  private createModuleTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        path TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        module_name TEXT,
        pipeline_stage TEXT,
        
        -- Module data
        exports TEXT DEFAULT '[]', -- JSON array
        imports TEXT DEFAULT '[]', -- JSON array
        dependencies TEXT DEFAULT '[]', -- JSON array
        
        -- Quality metrics
        symbol_count INTEGER DEFAULT 0,
        relationship_count INTEGER DEFAULT 0,
        pattern_count INTEGER DEFAULT 0,
        
        -- Metadata
        last_analyzed INTEGER DEFAULT (strftime('%s', 'now')),
        confidence REAL DEFAULT 0.0,
        parse_success BOOLEAN DEFAULT 1
      );
    `);
  }
  
  /**
   * Essential MCP tool tables
   */
  private createToolsTables(db: Database.Database): void {
    db.exec(`
      -- Tool usage tracking
      CREATE TABLE IF NOT EXISTS tool_usage (
        id INTEGER PRIMARY KEY,
        tool_name TEXT NOT NULL,
        parameters TEXT, -- JSON
        result_summary TEXT,
        success BOOLEAN DEFAULT 1,
        execution_time_ms INTEGER,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      -- Search queries and results
      CREATE TABLE IF NOT EXISTS search_queries (
        id INTEGER PRIMARY KEY,
        query TEXT NOT NULL,
        query_type TEXT, -- 'find_implementations', 'find_similar', 'semantic_search'
        results_count INTEGER DEFAULT 0,
        success BOOLEAN DEFAULT 1,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }
  
  /**
   * Agent session tracking - simplified
   */
  private createAgentTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        session_id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        task_description TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT NOT NULL, -- 'active', 'completed', 'failed'
        
        -- Results
        symbols_analyzed INTEGER DEFAULT 0,
        patterns_detected INTEGER DEFAULT 0,
        relationships_found INTEGER DEFAULT 0,
        
        -- Quality scores
        confidence_score REAL DEFAULT 0.0
      );
      
      -- Agent modifications
      CREATE TABLE IF NOT EXISTS session_modifications (
        session_id TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        modification_type TEXT NOT NULL, -- 'added', 'modified', 'deleted'
        timestamp INTEGER NOT NULL,
        
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );
    `);
  }
  
  /**
   * Create class hierarchy table for inheritance tracking
   */
  private createClassHierarchyTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS class_hierarchies (
        id INTEGER PRIMARY KEY,
        class_name TEXT NOT NULL,
        class_usr TEXT,
        file_path TEXT NOT NULL,
        base_class TEXT,
        base_usr TEXT,
        inheritance_type TEXT DEFAULT 'public',
        implements_interface BOOLEAN DEFAULT 0,
        interface_usr TEXT,
        detected_by TEXT DEFAULT 'unified',
        confidence REAL DEFAULT 0.8,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }

  /**
   * Create code patterns table for pattern tracking
   */
  private createCodePatternsTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS code_patterns (
        id INTEGER PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_name TEXT,
        file_path TEXT NOT NULL,
        line INTEGER,
        confidence REAL DEFAULT 0.8,
        evidence TEXT,
        detected_by TEXT DEFAULT 'unified',
        detection_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        
        -- Additional columns for enhanced indexer
        pattern_hash TEXT,
        pattern TEXT,
        category TEXT,
        frequency INTEGER DEFAULT 1,
        locations TEXT DEFAULT '[]'
      );
    `);
  }

  /**
   * Create semantic connections table for relationship tracking
   */
  private createSemanticConnectionsTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_connections (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        connected_id INTEGER NOT NULL,
        connection_type TEXT NOT NULL,
        confidence REAL DEFAULT 0.8,
        evidence TEXT,
        detected_by TEXT DEFAULT 'unified',
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }

  /**
   * Rich semantic analysis tables for data flow tracking
   * These tables support understanding how data flows through the system
   * e.g., PlanetaryData -> terrain generation -> rendering pipeline
   */
  private createRichSemanticTables(db: Database.Database): void {
    // Enhanced parameter analysis for function signatures
    db.exec(`
      CREATE TABLE IF NOT EXISTS enhanced_parameters (
        id INTEGER PRIMARY KEY,
        function_id INTEGER NOT NULL,
        parameter_name TEXT NOT NULL,
        parameter_type TEXT NOT NULL,
        position INTEGER NOT NULL,
        is_const BOOLEAN DEFAULT 0,
        is_pointer BOOLEAN DEFAULT 0,
        is_reference BOOLEAN DEFAULT 0,
        is_template BOOLEAN DEFAULT 0,
        template_args TEXT DEFAULT '[]', -- JSON array
        default_value TEXT,
        semantic_role TEXT, -- 'input_data', 'output_buffer', 'config', 'context'
        data_flow_stage TEXT, -- pipeline stage this parameter belongs to
        
        FOREIGN KEY (function_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Method complexity analysis for maintainability
    db.exec(`
      CREATE TABLE IF NOT EXISTS method_complexity_analysis (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        cyclomatic_complexity INTEGER DEFAULT 0,
        cognitive_complexity INTEGER DEFAULT 0,
        nesting_depth INTEGER DEFAULT 0,
        parameter_count INTEGER DEFAULT 0,
        local_variable_count INTEGER DEFAULT 0,
        line_count INTEGER DEFAULT 0,
        
        -- Performance characteristics
        has_loops BOOLEAN DEFAULT 0,
        has_recursion BOOLEAN DEFAULT 0,
        has_dynamic_allocation BOOLEAN DEFAULT 0,
        has_exception_handling BOOLEAN DEFAULT 0,
        
        -- Maintainability metrics
        readability_score REAL DEFAULT 0.0,
        testability_score REAL DEFAULT 0.0,
        
        FOREIGN KEY (symbol_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Memory pattern analysis for performance optimization
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_patterns (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        pattern_type TEXT NOT NULL, -- 'allocation', 'deallocation', 'access', 'leak_risk'
        allocation_method TEXT, -- 'stack', 'heap', 'pool', 'custom'
        memory_size_estimate INTEGER,
        is_cache_friendly BOOLEAN DEFAULT 0,
        has_alignment_optimization BOOLEAN DEFAULT 0,
        uses_raii BOOLEAN DEFAULT 0,
        
        -- Safety analysis
        potential_leak BOOLEAN DEFAULT 0,
        potential_double_free BOOLEAN DEFAULT 0,
        potential_use_after_free BOOLEAN DEFAULT 0,
        
        -- Context
        source_location TEXT,
        evidence TEXT,
        
        FOREIGN KEY (symbol_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Vulkan-specific pattern analysis for graphics pipeline
    db.exec(`
      CREATE TABLE IF NOT EXISTS vulkan_patterns (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        operation_type TEXT NOT NULL, -- 'descriptor_set', 'command_buffer', 'pipeline', 'memory'
        vulkan_object_type TEXT, -- 'VkDevice', 'VkCommandBuffer', etc.
        resource_lifetime TEXT, -- 'frame', 'persistent', 'temporary'
        sharing_mode TEXT, -- 'exclusive', 'concurrent'
        
        -- Performance characteristics
        is_gpu_heavy BOOLEAN DEFAULT 0,
        estimated_gpu_memory_mb INTEGER DEFAULT 0,
        synchronization_required BOOLEAN DEFAULT 0,
        
        -- Best practices compliance
        follows_vulkan_best_practices BOOLEAN DEFAULT 1,
        potential_performance_issue TEXT,
        
        FOREIGN KEY (symbol_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Call chain analysis for data flow tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_chains (
        id INTEGER PRIMARY KEY,
        entry_point_id INTEGER NOT NULL,
        chain_depth INTEGER DEFAULT 0,
        total_functions INTEGER DEFAULT 0,
        
        -- Pipeline analysis
        crosses_stage_boundaries BOOLEAN DEFAULT 0,
        stage_transitions TEXT DEFAULT '[]', -- JSON array of stage transitions
        
        -- Performance analysis
        estimated_execution_time_ms REAL DEFAULT 0.0,
        has_performance_bottleneck BOOLEAN DEFAULT 0,
        bottleneck_location TEXT,
        
        -- Data flow analysis
        data_transformation_type TEXT, -- 'generation', 'processing', 'rendering'
        input_data_types TEXT DEFAULT '[]', -- JSON array
        output_data_types TEXT DEFAULT '[]', -- JSON array
        
        FOREIGN KEY (entry_point_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Individual steps in call chains for detailed flow analysis
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_chain_steps (
        id INTEGER PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        step_number INTEGER NOT NULL,
        caller_id INTEGER NOT NULL,
        callee_id INTEGER NOT NULL,
        
        -- Context
        call_site_line INTEGER,
        call_context TEXT,
        
        -- Data flow
        data_passed TEXT, -- description of data being passed
        data_transformed BOOLEAN DEFAULT 0,
        transformation_type TEXT,
        
        -- Performance impact
        estimated_step_time_ms REAL DEFAULT 0.0,
        is_performance_critical BOOLEAN DEFAULT 0,
        
        FOREIGN KEY (chain_id) REFERENCES call_chains(id),
        FOREIGN KEY (caller_id) REFERENCES enhanced_symbols(id),
        FOREIGN KEY (callee_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Rich function call analysis with context
    db.exec(`
      CREATE TABLE IF NOT EXISTS rich_function_calls (
        id INTEGER PRIMARY KEY,
        caller_id INTEGER NOT NULL,
        callee_id INTEGER NOT NULL,
        call_site_line INTEGER NOT NULL,
        
        -- Call context
        call_type TEXT NOT NULL, -- 'direct', 'virtual', 'function_pointer', 'lambda'
        is_vulkan_api BOOLEAN DEFAULT 0,
        vulkan_operation_category TEXT, -- 'setup', 'dispatch', 'synchronization'
        
        -- Performance analysis
        call_frequency_estimate TEXT, -- 'once', 'per_frame', 'per_object', 'high_frequency'
        is_gpu_dispatch BOOLEAN DEFAULT 0,
        has_side_effects BOOLEAN DEFAULT 0,
        
        -- Data flow
        passes_large_data BOOLEAN DEFAULT 0,
        estimated_data_size_bytes INTEGER DEFAULT 0,
        modifies_global_state BOOLEAN DEFAULT 0,
        
        -- Pipeline context
        pipeline_stage_from TEXT,
        pipeline_stage_to TEXT,
        crosses_stage_boundary BOOLEAN DEFAULT 0,
        
        FOREIGN KEY (caller_id) REFERENCES enhanced_symbols(id),
        FOREIGN KEY (callee_id) REFERENCES enhanced_symbols(id)
      );
    `);

    // Agent execution constraints (required by AgentContextService)
    db.exec(`
      CREATE TABLE IF NOT EXISTS execution_constraints (
        constraint_id TEXT PRIMARY KEY,
        constraint_type TEXT NOT NULL, -- boundary, pattern, quality
        stage TEXT,
        description TEXT NOT NULL,
        enforcement_level TEXT NOT NULL -- strict, warning, suggestion
      );
    `);

    // Guidance rules (required by AgentContextService)
    db.exec(`
      CREATE TABLE IF NOT EXISTS guidance_rules (
        rule_id TEXT PRIMARY KEY,
        rule_name TEXT NOT NULL,
        pattern TEXT NOT NULL, -- regex or AST pattern
        stage TEXT,
        guidance_type TEXT NOT NULL, -- avoid, prefer, require
        explanation TEXT,
        example_good TEXT,
        example_bad TEXT,
        active BOOLEAN DEFAULT 1
      );
    `);

    // Boundary crossings (required by AgentContextService)
    db.exec(`
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
    `);

    // Analytics cache for performance
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_cache (
        cache_key TEXT PRIMARY KEY,
        cache_value TEXT,
        created_at INTEGER,
        expires_at INTEGER
      );
    `);

    // Antipattern statistics table (from enhanced-antipattern-detector)
    db.exec(`
      CREATE TABLE IF NOT EXISTS antipattern_stats (
        pattern_name TEXT PRIMARY KEY,
        detection_count INTEGER DEFAULT 0,
        confidence_avg REAL DEFAULT 0.0,
        last_updated INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Agent-specific tables for code analysis
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_code_clones (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        clone_type TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        file1_path TEXT NOT NULL,
        file2_path TEXT NOT NULL,
        lines1 TEXT NOT NULL,
        lines2 TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS ast_hashes (
        hash TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        node_type TEXT NOT NULL,
        complexity INTEGER DEFAULT 0,
        structure_hash TEXT NOT NULL,
        semantic_hash TEXT,
        token_count INTEGER DEFAULT 0,
        line_start INTEGER,
        line_end INTEGER
      );

      CREATE TABLE IF NOT EXISTS duplication_antipatterns (
        id INTEGER PRIMARY KEY,
        pattern_name TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_references (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        reference_type TEXT NOT NULL,
        from_symbol TEXT NOT NULL,
        to_symbol TEXT NOT NULL,
        context TEXT,
        FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
      );
      
      -- Clone groups and members for duplicate detection
      CREATE TABLE IF NOT EXISTS clone_groups (
        group_id TEXT PRIMARY KEY,
        clone_type INTEGER NOT NULL,
        member_count INTEGER NOT NULL,
        total_lines INTEGER NOT NULL,
        pattern_description TEXT,
        refactoring_suggestion TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE TABLE IF NOT EXISTS clone_group_members (
        group_id TEXT NOT NULL,
        fragment_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        PRIMARY KEY (group_id, fragment_id),
        FOREIGN KEY (group_id) REFERENCES clone_groups(group_id)
      );
    `);

    console.log('✅ Rich semantic analysis tables created');
  }

  /**
   * Create performance indexes with fail-safe error handling
   */
  private createIndexesSafely(db: Database.Database): void {
    const indexes = [
      // Symbol indexes
      { name: 'idx_symbols_file', table: 'enhanced_symbols', column: 'file_path' },
      { name: 'idx_symbols_name', table: 'enhanced_symbols', column: 'name' },
      { name: 'idx_symbols_kind', table: 'enhanced_symbols', column: 'kind' },
      { name: 'idx_symbols_confidence', table: 'enhanced_symbols', column: 'confidence' },
      { name: 'idx_symbols_parser_confidence', table: 'enhanced_symbols', column: 'parser_confidence' },
      { name: 'idx_symbols_module', table: 'enhanced_symbols', column: 'module_name' },
      { name: 'idx_symbols_definition', table: 'enhanced_symbols', column: 'is_definition' },
      
      // Relationship indexes
      { name: 'idx_rel_from', table: 'symbol_relationships', column: 'from_symbol_id' },
      { name: 'idx_rel_to', table: 'symbol_relationships', column: 'to_symbol_id' },
      { name: 'idx_rel_type', table: 'symbol_relationships', column: 'relationship_type' },
      
      // Pattern indexes
      { name: 'idx_patterns_symbol', table: 'detected_patterns', column: 'symbol_id' },
      { name: 'idx_patterns_type', table: 'detected_patterns', column: 'pattern_type' },
      
      // Module indexes
      { name: 'idx_modules_name', table: 'modules', column: 'module_name' },
      
      // Tool indexes
      { name: 'idx_tool_usage_name', table: 'tool_usage', column: 'tool_name' },
      { name: 'idx_tool_usage_time', table: 'tool_usage', column: 'timestamp' },
      
      // Agent indexes
      { name: 'idx_sessions_status', table: 'agent_sessions', column: 'status' },
      { name: 'idx_modifications_session', table: 'session_modifications', column: 'session_id' }
    ];
    
    for (const index of indexes) {
      try {
        // First check if table exists
        const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(index.table);
        if (!tableExists) {
          console.warn(`⚠️  Table ${index.table} does not exist, skipping index ${index.name}`);
          continue;
        }
        
        // Check if column exists
        const columns = db.prepare(`PRAGMA table_info(${index.table})`).all() as any[];
        const columnExists = columns.some(col => col.name === index.column);
        if (!columnExists) {
          console.warn(`⚠️  Column ${index.column} does not exist in table ${index.table}, skipping index ${index.name}`);
          continue;
        }
        
        // Create the index
        db.exec(`CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.column});`);
        console.log(`✅ Created index: ${index.name}`);
      } catch (error) {
        console.error(`❌ Failed to create index ${index.name}:`, error instanceof Error ? error.message : String(error));
        // Continue with other indexes instead of failing completely
      }
    }
  }
  
  /**
   * Clean way to store symbol data from unified parser
   */
  storeSymbol(db: Database.Database, symbol: any): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO enhanced_symbols (
        name, qualified_name, kind, file_path, line, column,
        signature, return_type, parent_class, namespace, mangled_name, usr,
        semantic_tags, related_symbols, complexity, confidence, parser_confidence,
        is_exported, module_name,
        is_template, template_params, base_type, is_pointer, is_reference, is_constructor, is_destructor, is_virtual, is_static, is_const, is_vulkan_type, is_std_type, is_planetgen_type, is_definition,
        is_factory, is_vulkan_api, uses_smart_pointers, uses_modern_cpp,
        execution_mode, is_async, is_generator, pipeline_stage, returns_vector_float, uses_gpu_compute, has_cpu_fallback,
        parser_used, body_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      symbol.name,
      symbol.qualifiedName || symbol.name,
      symbol.kind,
      symbol.filePath,
      symbol.line,
      symbol.column || 0,
      symbol.signature,
      symbol.returnType,
      symbol.parentClass,
      symbol.namespace,
      symbol.mangledName,
      symbol.usr,
      JSON.stringify(symbol.semanticTags || []),
      JSON.stringify(symbol.relatedSymbols || []),
      symbol.complexity || 0,
      symbol.confidence || 0.0,
      symbol.parserConfidence || symbol.confidence || 0.0,
      symbol.isExported ? 1 : 0,
      symbol.moduleName,
      symbol.isTemplate ? 1 : 0,
      JSON.stringify(symbol.templateParams || []),
      symbol.baseType,
      symbol.isPointer ? 1 : 0,
      symbol.isReference ? 1 : 0,
      symbol.isConstructor ? 1 : 0,
      symbol.isDestructor ? 1 : 0,
      symbol.isVirtual ? 1 : 0,
      symbol.isStatic ? 1 : 0,
      symbol.isConst ? 1 : 0,
      symbol.isVulkanType ? 1 : 0,
      symbol.isStdType ? 1 : 0,
      symbol.isPlanetgenType ? 1 : 0,
      symbol.isDefinition ? 1 : 0,
      symbol.isFactory ? 1 : 0,
      symbol.isVulkanApi ? 1 : 0,
      symbol.usesSmartPointers ? 1 : 0,
      symbol.usesModernCpp ? 1 : 0,
      symbol.executionMode,
      symbol.isAsync ? 1 : 0,
      symbol.isGenerator ? 1 : 0,
      symbol.pipelineStage,
      symbol.returnsVectorFloat ? 1 : 0,
      symbol.usesGpuCompute ? 1 : 0,
      symbol.hasCpuFallback ? 1 : 0,
      'unified',
      symbol.bodyHash || null
    );
  }
  
  /**
   * Store relationship data from unified parser
   */
  storeRelationship(db: Database.Database, relationship: any): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO symbol_relationships (
        from_symbol_id, to_symbol_id, from_name, to_name,
        relationship_type, confidence, line_number, source_context
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      relationship.fromSymbolId,
      relationship.toSymbolId,
      relationship.fromName,
      relationship.toName,
      relationship.type,
      relationship.confidence || 1.0,
      relationship.lineNumber,
      relationship.sourceContext
    );
  }
  
  /**
   * Store pattern data from unified parser
   */
  storePattern(db: Database.Database, pattern: any): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO detected_patterns (
        symbol_id, pattern_type, pattern_name, confidence,
        line_number, details
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      pattern.symbolId,
      pattern.type,
      pattern.name,
      pattern.confidence || 1.0,
      pattern.lineNumber,
      JSON.stringify(pattern.details || {})
    );
  }
  
  /**
   * Store module data from unified parser
   */
  storeModule(db: Database.Database, module: any): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO modules (
        path, relative_path, module_name, pipeline_stage,
        exports, imports, dependencies,
        symbol_count, relationship_count, pattern_count, confidence, parse_success
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      module.path,
      module.relativePath,
      module.moduleName,
      module.pipelineStage,
      JSON.stringify(module.exports || []),
      JSON.stringify(module.imports || []),
      JSON.stringify(module.dependencies || []),
      module.symbolCount || 0,
      module.relationshipCount || 0,
      module.patternCount || 0,
      module.confidence || 0.0,
      module.parseSuccess ? 1 : 0
    );
  }
  
  /**
   * Get simple statistics
   */
  getStats(db: Database.Database): any {
    const symbolCount = db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as { count: number };
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM indexed_files').get() as { count: number };
    const relationshipCount = db.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as { count: number };
    const patternCount = db.prepare('SELECT COUNT(*) as count FROM detected_patterns').get() as { count: number };
    
    const avgConfidence = db.prepare('SELECT AVG(confidence) as avg FROM enhanced_symbols').get() as { avg: number };
    
    return {
      symbols: symbolCount.count,
      files: fileCount.count,
      relationships: relationshipCount.count,
      patterns: patternCount.count,
      averageConfidence: avgConfidence.avg || 0
    };
  }
  
  /**
   * Clean up old data
   */
  cleanup(db: Database.Database): void {
    // Remove old entries older than 30 days
    const cutoff = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    db.exec(`
      DELETE FROM tool_usage WHERE timestamp < ${cutoff};
      DELETE FROM search_queries WHERE timestamp < ${cutoff};
      DELETE FROM agent_sessions WHERE started_at < ${cutoff} AND status = 'completed';
    `);
  }

  /**
   * Reset/rebuild database with clean schema
   */
  rebuildDatabase(db: Database.Database): void {
    console.log('🔄 Rebuilding database with clean schema...');
    
    // Drop all existing tables
    const tables = ['enhanced_symbols', 'indexed_files', 'symbol_relationships', 'detected_patterns', 
                   'modules', 'tool_usage', 'search_queries', 'agent_sessions', 'session_modifications'];
    
    for (const table of tables) {
      try {
        db.exec(`DROP TABLE IF EXISTS ${table};`);
      } catch (error) {
        // Ignore errors for tables that don't exist
      }
    }
    
    // Clear the initialization tracking
    const dbIdentifier = db.memory ? 'memory' : db.name || 'unknown';
    this.initializedDatabases.delete(dbIdentifier);
    
    // Reinitialize with clean schema
    this.initializeDatabase(db);
    
    console.log('✅ Database rebuilt with clean schema');
  }
}