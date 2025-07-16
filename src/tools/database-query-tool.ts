import Database from 'better-sqlite3';
import * as path from 'path';
import { CleanUnifiedSchemaManager } from '../database/clean-unified-schema.js';

/**
 * Database Query Tool - Primary interface for querying indexed data
 * 
 * This tool demonstrates the proper approach:
 * 1. Query indexed data from the unified database
 * 2. Use the best available parser results (Clang > Tree-sitter > Streaming)
 * 3. Only trigger re-parsing when explicitly needed
 */
export class DatabaseQueryTool {
  private db?: Database.Database;
  private schemaManager: CleanUnifiedSchemaManager;

  constructor(private projectPath: string) {
    this.schemaManager = CleanUnifiedSchemaManager.getInstance();
  }

  async initialize(): Promise<void> {
    const dbPath = path.join(this.projectPath, '.module-sentinel', 'preservation.db');
    this.db = new Database(dbPath);
    this.schemaManager.initializeDatabase(this.db);
  }

  /**
   * Find symbol in indexed database - NO re-parsing
   */
  async findSymbol(symbolName: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Query from unified database using best available parser data
    const results = this.db.prepare(`
      SELECT 
        es.*,
        if.best_parser,
        if.best_confidence
      FROM enhanced_symbols es
      JOIN indexed_files if ON es.file_path = if.path
      WHERE es.name LIKE ?
      ORDER BY es.parser_confidence DESC, es.parse_timestamp DESC
    `).all(`%${symbolName}%`);

    return results;
  }

  /**
   * Get all symbols from a file - uses indexed data only
   */
  async getFileSymbols(filePath: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Check what parsers have successfully processed this file
    const fileInfo = this.db.prepare(`
      SELECT * FROM indexed_files WHERE path = ?
    `).get(filePath) as any;

    if (!fileInfo) {
      return []; // File not indexed yet
    }

    // Get symbols from the best parser that succeeded
    const symbols = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE file_path = ? 
      ORDER BY parser_confidence DESC
    `).all(filePath);

    return {
      fileInfo,
      symbols,
      metadata: {
        bestParser: fileInfo.best_parser,
        confidence: fileInfo.best_confidence,
        parsersUsed: fileInfo.best_parser ? [fileInfo.best_parser] : []
      }
    } as any;
  }

  /**
   * Find implementations of a class/function - database query only
   */
  async findImplementations(symbolName: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // First find the symbol declaration
    const declarations = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE name = ? AND is_definition = 0
      ORDER BY parser_confidence DESC
    `).all(symbolName);

    // Then find implementations
    const implementations = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE name = ? AND is_definition = 1
      ORDER BY parser_confidence DESC
    `).all(symbolName);

    // Also check relationships
    const relatedSymbols = this.db.prepare(`
      SELECT 
        es.*,
        sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols es ON es.id = sr.to_symbol_id
      WHERE sr.from_symbol_id IN (
        SELECT id FROM enhanced_symbols WHERE name = ?
      )
      AND sr.relationship_type IN ('implements', 'overrides', 'defines')
    `).all(symbolName);

    return {
      declarations,
      implementations,
      relatedSymbols
    } as any;
  }

  /**
   * Get code patterns from indexed data
   */
  async getPatterns(patternType?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT 
        dp.*,
        es.name as symbol_name,
        es.file_path
      FROM detected_patterns dp
      JOIN enhanced_symbols es ON es.id = dp.symbol_id
    `;

    if (patternType) {
      query += ` WHERE dp.pattern_type = ?`;
      return this.db.prepare(query).all(patternType);
    }

    return this.db.prepare(query).all();
  }

  /**
   * Get anti-patterns from indexed data
   */
  async getAntipatterns(filePath?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    if (filePath) {
      return this.db.prepare(`
        SELECT * FROM antipatterns 
        WHERE file_path = ?
        ORDER BY severity DESC, line_start ASC
      `).all(filePath);
    }

    return this.db.prepare(`
      SELECT 
        pattern_name,
        pattern_category,
        severity,
        COUNT(*) as occurrence_count,
        GROUP_CONCAT(DISTINCT file_path) as affected_files
      FROM antipatterns
      GROUP BY pattern_name, pattern_category, severity
      ORDER BY occurrence_count DESC
    `).all();
  }

  /**
   * Get duplicate code from indexed data
   */
  async getDuplicates(filePath?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    if (filePath) {
      return this.db.prepare(`
        SELECT * FROM code_duplicates 
        WHERE file1_path = ? OR file2_path = ?
        ORDER BY similarity_score DESC
      `).all(filePath, filePath);
    }

    return this.db.prepare(`
      SELECT * FROM code_duplicates 
      ORDER BY similarity_score DESC, token_count DESC
      LIMIT 100
    `).all();
  }

  /**
   * Search by semantic tags
   */
  async searchBySemanticTags(tags: string[]): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const tagConditions = tags.map(() => `semantic_tags LIKE ?`).join(' OR ');
    const tagParams = tags.map(tag => `%"${tag}"%`);

    return this.db.prepare(`
      SELECT 
        es.*,
        if.best_parser,
        if.best_confidence
      FROM enhanced_symbols es
      JOIN indexed_files if ON es.file_path = if.path
      WHERE ${tagConditions}
      ORDER BY es.parser_confidence DESC
    `).all(...tagParams);
  }

  /**
   * Get parsing statistics for a file
   */
  async getFileParsingStats(filePath: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const fileInfo = this.db.prepare(`
      SELECT * FROM indexed_files WHERE path = ?
    `).get(filePath);

    const symbolCounts = this.db.prepare(`
      SELECT 
        parser_used,
        COUNT(*) as symbol_count,
        AVG(parser_confidence) as avg_confidence,
        COUNT(CASE WHEN json_array_length(semantic_tags) > 0 THEN 1 END) as tagged_count
      FROM enhanced_symbols
      WHERE file_path = ?
      GROUP BY parser_used
    `).all(filePath);

    return {
      fileInfo,
      symbolCounts,
      recommendation: this.generateParsingRecommendation(fileInfo, symbolCounts)
    };
  }

  /**
   * Generate recommendation based on parsing results
   */
  private generateParsingRecommendation(fileInfo: any, symbolCounts: any[]): string {
    if (!fileInfo) {
      return 'File not indexed. Run indexing to analyze this file.';
    }

    if (fileInfo.best_parser === 'grammar-aware') {
      return 'File parsed with Grammar-aware parser. High confidence C++23 module analysis available.';
    }

    if (fileInfo.best_parser === 'tree-sitter') {
      return 'File parsed with Tree-sitter. Good semantic analysis available.';
    }

    if (fileInfo.best_parser === 'streaming') {
      return 'Large file parsed with streaming parser. Limited semantic information available.';
    }

    return 'File parsing failed. Check for syntax errors or missing dependencies.';
  }

  /**
   * Get cross-file relationships
   */
  async getRelationships(symbolName: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const outgoing = this.db.prepare(`
      SELECT 
        sr.*,
        es.name as target_name,
        es.file_path as target_file
      FROM symbol_relationships sr
      JOIN enhanced_symbols es ON es.id = sr.to_symbol_id
      WHERE sr.from_symbol_id IN (
        SELECT id FROM enhanced_symbols WHERE name = ?
      )
    `).all(symbolName);

    const incoming = this.db.prepare(`
      SELECT 
        sr.*,
        es.name as source_name,
        es.file_path as source_file
      FROM symbol_relationships sr
      JOIN enhanced_symbols es ON es.id = sr.from_symbol_id
      WHERE sr.to_symbol_id IN (
        SELECT id FROM enhanced_symbols WHERE name = ?
      )
    `).all(symbolName);

    return { outgoing, incoming };
  }

  /**
   * Only parse on-demand when explicitly requested
   */
  async requestEnhancedAnalysis(filePath: string, forceParser?: string): Promise<any> {
    // This would trigger actual parsing, but should be used sparingly
    // Most queries should use the indexed data above
    return {
      message: 'Enhanced analysis would trigger re-parsing. Use indexed data when possible.',
      indexedDataAvailable: await this.getFileSymbols(filePath)
    };
  }

  /**
   * ADVANCED SEMANTIC QUERY SUPPORT
   * Enable complex queries like "Where are descriptor sets created for our foam water texture generation?"
   */

  /**
   * Advanced Vulkan query: Find descriptor set operations with context
   */
  async findVulkanDescriptorSets(context?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT 
        es.name,
        es.qualified_name,
        es.file_path,
        es.line,
        es.pipeline_stage,
        vp.operation_type,
        vp.vulkan_object_type,
        vp.resource_lifetime,
        vp.sharing_mode,
        vp.is_gpu_heavy,
        vp.estimated_gpu_memory_mb,
        vp.synchronization_required,
        vp.follows_vulkan_best_practices,
        vp.potential_performance_issue,
        mca.cyclomatic_complexity
      FROM enhanced_symbols es
      JOIN vulkan_patterns vp ON vp.symbol_id = es.id
      LEFT JOIN method_complexity_analysis mca ON mca.symbol_id = es.id
      WHERE vp.operation_type = 'descriptor_set'
    `;

    const params: any[] = [];
    
    if (context) {
      query += ` AND (
        LOWER(es.name) LIKE LOWER(?) 
        OR LOWER(es.file_path) LIKE LOWER(?) 
        OR LOWER(es.semantic_tags) LIKE LOWER(?)
      )`;
      const contextPattern = `%${context}%`;
      params.push(contextPattern, contextPattern, contextPattern);
    }

    query += ` ORDER BY vp.is_gpu_heavy DESC, vp.estimated_gpu_memory_mb DESC, es.parser_confidence DESC`;

    return this.db.prepare(query).all(...params);
  }

  /**
   * Advanced call chain query: Trace execution paths
   */
  async findCallChains(entryPoint?: string, targetFunction?: string, maxDepth: number = 5): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT 
        cc.id,
        cc.chain_depth,
        cc.total_functions,
        cc.crosses_stage_boundaries,
        cc.stage_transitions,
        cc.estimated_execution_time_ms,
        cc.has_performance_bottleneck,
        cc.bottleneck_location,
        cc.data_transformation_type,
        cc.input_data_types,
        cc.output_data_types,
        es_entry.name as entry_point_name,
        es_entry.file_path as entry_point_file,
        es_entry.qualified_name as entry_point_qualified
      FROM call_chains cc
      JOIN enhanced_symbols es_entry ON es_entry.id = cc.entry_point_id
      WHERE cc.chain_depth <= ?
    `;

    const params: any[] = [maxDepth];

    if (entryPoint) {
      query += ` AND LOWER(es_entry.name) LIKE LOWER(?)`;
      params.push(`%${entryPoint}%`);
    }

    if (targetFunction) {
      query += ` AND (
        LOWER(es_exit.name) LIKE LOWER(?)
        OR LOWER(cc.chain_signature) LIKE LOWER(?)
      )`;
      params.push(`%${targetFunction}%`, `%${targetFunction}%`);
    }

    query += ` ORDER BY cc.critical_path DESC, cc.estimated_total_time_ms DESC`;

    const chains = this.db.prepare(query).all(...params) as any[];

    // Get detailed steps for each chain
    for (const chain of chains) {
      const steps = this.db.prepare(`
        SELECT 
          ccs.*,
          es_from.name as from_name,
          es_from.file_path as from_file,
          es_to.name as to_name,
          es_to.file_path as to_file
        FROM call_chain_steps ccs
        JOIN enhanced_symbols es_from ON es_from.id = ccs.from_symbol_id
        LEFT JOIN enhanced_symbols es_to ON es_to.id = ccs.to_symbol_id
        WHERE ccs.chain_id = (
          SELECT id FROM call_chains WHERE chain_signature = ?
        )
        ORDER BY ccs.step_index
      `).all((chain as any).chain_signature);
      
      (chain as any).steps = steps;
    }

    return chains;
  }

  /**
   * Complex semantic search: Natural language queries
   */
  async semanticSearch(query: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const lowerQuery = query.toLowerCase();
    const results: any[] = [];

    // Parse query for key terms
    const vulkanTerms = ['descriptor', 'vulkan', 'gpu', 'pipeline', 'command', 'buffer', 'texture', 'shader'];
    const memoryTerms = ['memory', 'allocation', 'leak', 'raii', 'smart', 'pointer'];
    const complexityTerms = ['complex', 'maintainability', 'cyclomatic', 'cognitive'];
    const pipelineTerms = ['terrain', 'noise', 'rendering', 'orchestrator', 'generation'];

    const hasVulkanTerms = vulkanTerms.some(term => lowerQuery.includes(term));
    const hasMemoryTerms = memoryTerms.some(term => lowerQuery.includes(term));
    const hasComplexityTerms = complexityTerms.some(term => lowerQuery.includes(term));
    const hasPipelineTerms = pipelineTerms.some(term => lowerQuery.includes(term));

    // Query 1: Direct symbol matches
    const symbolResults = this.db.prepare(`
      SELECT 
        'symbol' as result_type,
        es.name,
        es.qualified_name,
        es.file_path,
        es.line,
        es.kind,
        es.pipeline_stage,
        es.semantic_tags,
        es.parser_confidence,
        es.complexity
      FROM enhanced_symbols es
      WHERE 
        LOWER(es.name) LIKE ? 
        OR LOWER(es.qualified_name) LIKE ?
        OR LOWER(es.semantic_tags) LIKE ?
      ORDER BY es.parser_confidence DESC
      LIMIT 20
    `).all(`%${lowerQuery}%`, `%${lowerQuery}%`, `%${lowerQuery}%`);

    results.push(...symbolResults);

    // Query 2: Vulkan-specific search
    if (hasVulkanTerms) {
      const vulkanResults = this.db.prepare(`
        SELECT 
          'vulkan_pattern' as result_type,
          es.name,
          es.qualified_name,
          es.file_path,
          es.line,
          es.pipeline_stage,
          vp.operation_type,
          vp.descriptor_set_type,
          vp.api_pattern,
          vp.is_performance_critical,
          vp.source_context,
          vp.confidence
        FROM enhanced_symbols es
        JOIN vulkan_patterns vp ON vp.symbol_id = es.id
        WHERE 
          LOWER(vp.operation_type) LIKE ?
          OR LOWER(vp.descriptor_set_type) LIKE ?
          OR LOWER(vp.source_context) LIKE ?
        ORDER BY vp.is_performance_critical DESC, vp.confidence DESC
        LIMIT 15
      `).all(`%${lowerQuery}%`, `%${lowerQuery}%`, `%${lowerQuery}%`);

      results.push(...vulkanResults);
    }

    // Query 3: Memory pattern search
    if (hasMemoryTerms) {
      const memoryResults = this.db.prepare(`
        SELECT 
          'memory_pattern' as result_type,
          es.name,
          es.file_path,
          es.line,
          mp.allocation_type,
          mp.allocation_method,
          mp.is_raii_compliant,
          mp.potential_leaks,
          mp.memory_pool_candidate,
          mp.source_context,
          mp.confidence
        FROM enhanced_symbols es
        JOIN memory_patterns mp ON mp.symbol_id = es.id
        WHERE 
          LOWER(mp.allocation_type) LIKE ?
          OR LOWER(mp.allocation_method) LIKE ?
          OR LOWER(mp.source_context) LIKE ?
        ORDER BY mp.potential_leaks DESC, mp.confidence DESC
        LIMIT 15
      `).all(`%${lowerQuery}%`, `%${lowerQuery}%`, `%${lowerQuery}%`);

      results.push(...memoryResults);
    }

    // Query 4: Complexity analysis search
    if (hasComplexityTerms) {
      const complexityResults = this.db.prepare(`
        SELECT 
          'complexity_analysis' as result_type,
          es.name,
          es.file_path,
          es.line,
          mca.cyclomatic_complexity,
          mca.cognitive_complexity,
          mca.maintainability_index,
          mca.has_loops,
          mca.has_recursive_calls,
          mca.allocation_pattern
        FROM enhanced_symbols es
        JOIN method_complexity_analysis mca ON mca.symbol_id = es.id
        WHERE mca.cyclomatic_complexity > 10 OR mca.maintainability_index < 0.6
        ORDER BY mca.cyclomatic_complexity DESC, mca.maintainability_index ASC
        LIMIT 15
      `).all();

      results.push(...complexityResults);
    }

    // Query 5: Call chain search for pipeline terms
    if (hasPipelineTerms) {
      const chainResults = this.db.prepare(`
        SELECT 
          'call_chain' as result_type,
          cc.chain_signature,
          cc.chain_depth,
          cc.crosses_pipeline_stages,
          cc.execution_context,
          cc.data_flow_pattern,
          cc.critical_path,
          es.name as entry_point,
          es.file_path
        FROM call_chains cc
        JOIN enhanced_symbols es ON es.id = cc.entry_point_symbol_id
        WHERE 
          LOWER(cc.chain_signature) LIKE ?
          OR LOWER(cc.crosses_pipeline_stages) LIKE ?
          OR LOWER(cc.execution_context) LIKE ?
        ORDER BY cc.critical_path DESC, cc.chain_depth DESC
        LIMIT 10
      `).all(`%${lowerQuery}%`, `%${lowerQuery}%`, `%${lowerQuery}%`);

      results.push(...chainResults);
    }

    // Query 6: Modern C++ features search
    const modernCppResults = this.db.prepare(`
      SELECT 
        'modern_cpp' as result_type,
        es.name,
        es.file_path,
        es.line,
        mcf.modernization_score,
        mcf.legacy_pattern_count,
        mcf.uses_smart_pointers,
        mcf.uses_concepts,
        mcf.uses_coroutines,
        mcf.uses_ranges
      FROM enhanced_symbols es
      JOIN modern_cpp_features mcf ON mcf.symbol_id = es.id
      WHERE mcf.modernization_score < 0.7 OR mcf.legacy_pattern_count > 3
      ORDER BY mcf.modernization_score ASC, mcf.legacy_pattern_count DESC
      LIMIT 10
    `).all();

    results.push(...modernCppResults);

    return results;
  }

  /**
   * Architecture analysis: Find architectural boundary violations
   */
  async findArchitecturalViolations(): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    return this.db.prepare(`
      SELECT 
        cc.chain_signature,
        cc.pipeline_stage_transitions,
        cc.architectural_violations,
        cc.coupling_strength,
        cc.cohesion_level,
        es_entry.name as entry_point,
        es_entry.pipeline_stage as entry_stage,
        es_exit.name as exit_point,
        es_exit.pipeline_stage as exit_stage
      FROM call_chains cc
      JOIN enhanced_symbols es_entry ON es_entry.id = cc.entry_point_symbol_id
      LEFT JOIN enhanced_symbols es_exit ON es_exit.id = cc.exit_point_symbol_id
      WHERE 
        cc.architectural_violations > 0 
        OR cc.pipeline_stage_transitions > 2
        OR cc.coupling_strength > 0.7
      ORDER BY cc.architectural_violations DESC, cc.coupling_strength DESC
    `).all();
  }

  /**
   * Performance analysis: Find performance-critical code paths
   */
  async findPerformanceCriticalPaths(): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const results = {
      criticalCallChains: this.db.prepare(`
        SELECT 
          cc.chain_signature,
          cc.estimated_total_time_ms,
          cc.gpu_cpu_transitions,
          cc.critical_path,
          cc.execution_context,
          es.name as entry_point,
          es.pipeline_stage
        FROM call_chains cc
        JOIN enhanced_symbols es ON es.id = cc.entry_point_symbol_id
        WHERE cc.critical_path = 1 OR cc.estimated_total_time_ms > 1.0
        ORDER BY cc.estimated_total_time_ms DESC
      `).all(),

      vulkanHotspots: this.db.prepare(`
        SELECT 
          es.name,
          es.file_path,
          es.line,
          vp.operation_type,
          vp.estimated_gpu_time_ms,
          vp.gpu_memory_usage_mb,
          vp.follows_vulkan_best_practices
        FROM enhanced_symbols es
        JOIN vulkan_patterns vp ON vp.symbol_id = es.id
        WHERE 
          vp.is_performance_critical = 1 
          OR vp.estimated_gpu_time_ms > 0.5
          OR vp.gpu_memory_usage_mb > 10.0
        ORDER BY vp.estimated_gpu_time_ms DESC, vp.gpu_memory_usage_mb DESC
      `).all(),

      complexFunctions: this.db.prepare(`
        SELECT 
          es.name,
          es.file_path,
          es.line,
          mca.cyclomatic_complexity,
          mca.cognitive_complexity,
          mca.maintainability_index,
          mca.has_loops,
          mca.allocation_pattern
        FROM enhanced_symbols es
        JOIN method_complexity_analysis mca ON mca.symbol_id = es.id
        WHERE 
          mca.cyclomatic_complexity > 15 
          OR mca.cognitive_complexity > 20
          OR mca.maintainability_index < 0.4
        ORDER BY mca.cyclomatic_complexity DESC, mca.cognitive_complexity DESC
      `).all() as any[]
    } as any;

    return results;
  }

  /**
   * Advanced natural language query processor
   */
  async processNaturalLanguageQuery(query: string): Promise<any> {
    const lowerQuery = query.toLowerCase();
    
    // Parse intent from the query
    if (lowerQuery.includes('descriptor set') && (lowerQuery.includes('foam') || lowerQuery.includes('water') || lowerQuery.includes('texture'))) {
      return this.findVulkanDescriptorSets('water foam texture');
    }
    
    if (lowerQuery.includes('call chain') || lowerQuery.includes('trace') || lowerQuery.includes('execution path')) {
      const entryMatch = lowerQuery.match(/from\s+(\w+)/);
      const targetMatch = lowerQuery.match(/to\s+(\w+)/);
      return this.findCallChains(entryMatch?.[1], targetMatch?.[1]);
    }
    
    if (lowerQuery.includes('performance') || lowerQuery.includes('critical') || lowerQuery.includes('hotspot')) {
      return this.findPerformanceCriticalPaths();
    }
    
    if (lowerQuery.includes('violation') || lowerQuery.includes('boundary') || lowerQuery.includes('architecture')) {
      return this.findArchitecturalViolations();
    }
    
    if (lowerQuery.includes('memory') && (lowerQuery.includes('leak') || lowerQuery.includes('allocation'))) {
      return this.semanticSearch('memory leak allocation');
    }
    
    // Namespace queries
    if (lowerQuery.includes('namespace') || lowerQuery.includes('::')) {
      // Extract namespace pattern from query
      const nsMatch = query.match(/namespace\s+([A-Za-z0-9:_*]+)/i) || 
                      query.match(/in\s+([A-Za-z0-9:_*]+)/i) ||
                      query.match(/([A-Za-z0-9_]+::[A-Za-z0-9:_*]+)/);
      
      if (nsMatch) {
        const namespace = nsMatch[1];
        return this.db!.prepare(`
          SELECT name, qualified_name, kind, namespace, file_path, line,
                 return_type, signature, semantic_tags
          FROM enhanced_symbols
          WHERE namespace LIKE ?
             OR namespace = ?
             OR qualified_name LIKE ?
          ORDER BY namespace, kind, name
          LIMIT 100
        `).all(
          namespace.replace(/\*/g, '%'),
          namespace,
          `${namespace}%`
        );
      }
    }
    
    // Symbol resolution queries
    if (lowerQuery.includes('resolve') || lowerQuery.includes('find') && lowerQuery.includes('from')) {
      const symbolMatch = lowerQuery.match(/(?:resolve|find)\s+(\w+)/);
      const fromMatch = lowerQuery.match(/from\s+([A-Za-z0-9:_]+)/);
      
      if (symbolMatch && fromMatch) {
        const symbol = symbolMatch[1];
        const fromNs = fromMatch[1];
        
        return this.db!.prepare(`
          SELECT name, qualified_name, kind, namespace, file_path, line,
                 return_type, signature,
                 CASE 
                   WHEN namespace = ? THEN 'same namespace'
                   WHEN namespace = ? THEN 'parent namespace'
                   WHEN namespace = '' THEN 'global namespace'
                   ELSE 'other namespace'
                 END as resolution_context
          FROM enhanced_symbols
          WHERE name = ?
          ORDER BY 
            CASE 
              WHEN namespace = ? THEN 1
              WHEN namespace = ? THEN 2
              WHEN namespace = '' THEN 3
              ELSE 4
            END
        `).all(
          fromNs,
          fromNs.substring(0, fromNs.lastIndexOf('::') || 0),
          symbol,
          fromNs,
          fromNs.substring(0, fromNs.lastIndexOf('::') || 0)
        );
      }
    }
    
    // Fallback to semantic search
    return this.semanticSearch(query);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}

// Example usage showing the proper flow
export async function demonstrateProperFlow(): Promise<void> {
  const tool = new DatabaseQueryTool('/home/warxh/planet_procgen');
  await tool.initialize();

  console.log('📚 Demonstrating Proper Database-First Approach\n');

  // 1. Query indexed symbols
  console.log('1️⃣ Finding symbols from indexed data:');
  const symbols = await tool.findSymbol('Pipeline');
  console.log(`   Found ${symbols.length} symbols matching "Pipeline"`);

  // 2. Get file information without re-parsing
  console.log('\n2️⃣ Getting file info from database:');
  const fileInfo = await tool.getFileSymbols('example.cpp');
  console.log(`   File parsed by: ${(fileInfo as any).metadata?.bestParser || 'not indexed'}`);

  // 3. Find patterns from indexed data
  console.log('\n3️⃣ Finding patterns from indexed data:');
  const patterns = await tool.getPatterns('Factory');
  console.log(`   Found ${patterns.length} factory patterns`);

  // 4. Get anti-patterns without re-analysis
  console.log('\n4️⃣ Getting anti-patterns from database:');
  const antipatterns = await tool.getAntipatterns();
  console.log(`   Found ${antipatterns.length} anti-pattern types`);

  console.log('\n✅ All queries used indexed data - no re-parsing needed!');

  tool.close();
}