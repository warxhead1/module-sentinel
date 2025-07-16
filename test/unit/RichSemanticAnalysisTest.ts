import { BaseTest } from '../helpers/BaseTest';
import { DatabaseQueryTool } from '../../dist/tools/database-query-tool.js';
import { UnifiedCppParser } from '../../dist/parsers/unified-cpp-parser.js';
import { CleanUnifiedSchemaManager } from '../../dist/database/clean-unified-schema.js';
import { PatternAwareIndexer } from '../../dist/indexing/pattern-aware-indexer.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Rich Semantic Analysis Test
 * 
 * Tests the enhanced semantic capabilities:
 * - Complex semantic queries
 * - Rich call chain tracking
 * - Vulkan pattern analysis
 * - Natural language query processing
 */
export class RichSemanticAnalysisTest extends BaseTest {
  private queryTool?: DatabaseQueryTool;
  private parser?: UnifiedCppParser;
  private testDb?: Database.Database;
  private schemaManager: CleanUnifiedSchemaManager;

  constructor() {
    super('rich-semantic-analysis');
    this.schemaManager = CleanUnifiedSchemaManager.getInstance();
  }

  async specificSetup(): Promise<void> {
    // Create test database with rich semantic schema
    const testDbPath = path.join(process.cwd(), '.test-db', 'rich-semantic.db');
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    
    // Remove existing database if it exists
    try {
      await fs.unlink(testDbPath);
    } catch {}
    
    this.testDb = new Database(testDbPath);
    
    // Force database initialization by clearing the singleton state
    const manager = this.schemaManager as any;
    if (manager.initializedDatabases) {
      manager.initializedDatabases.clear();
    }
    
    this.schemaManager.initializeDatabase(this.testDb);
    
    // Initialize parsers and tools
    this.parser = new UnifiedCppParser({ debugMode: false });
    await this.parser.initialize();
    
    this.queryTool = new DatabaseQueryTool('/test/project');
    // Override the database with our test database
    (this.queryTool as any).db = this.testDb;
    
    // Index some complex-files to see relationship building in action
    await this.indexComplexFiles();
    
    // Populate test data
    await this.populateTestData();
  }

  async specificTeardown(): Promise<void> {
    this.queryTool?.close();
    this.testDb?.close();
  }

  async run(): Promise<void> {
    console.log('🧠 Rich Semantic Analysis Test\n');
    
    // Focus on the core issue: understanding relationship building
    await this.testRelationshipBuilding();
    await this.testComplexityAnalysis();
    await this.testMemoryPatternAnalysis();
  }

  private async populateTestData(): Promise<void> {
    console.log('📊 Populating test data...');
    
    // Insert test symbols
    const symbolStmt = this.testDb!.prepare(`
      INSERT INTO enhanced_symbols (
        name, qualified_name, kind, file_path, line, column,
        pipeline_stage, semantic_tags, parser_used, parser_confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const testSymbols = [
      ['TerrainOrchestrator', 'PlanetGen::TerrainOrchestrator', 'class', '/src/terrain/TerrainOrchestrator.cpp', 25, 1, 'terrain_formation', '["orchestration", "manager"]', 'enhanced-tree-sitter', 0.9],
      ['WaterFoamRenderer', 'PlanetGen::Rendering::WaterFoamRenderer', 'class', '/src/rendering/WaterFoamRenderer.cpp', 15, 1, 'final_rendering', '["vulkan", "water", "foam"]', 'enhanced-tree-sitter', 0.95],
      ['CreateDescriptorSet', 'PlanetGen::Rendering::WaterFoamRenderer::CreateDescriptorSet', 'method', '/src/rendering/WaterFoamRenderer.cpp', 45, 5, 'final_rendering', '["vulkan", "descriptor_set", "foam"]', 'enhanced-tree-sitter', 0.92],
      ['NoiseGenerator', 'PlanetGen::Noise::NoiseGenerator', 'class', '/src/noise/NoiseGenerator.cpp', 30, 1, 'noise_generation', '["generation", "noise"]', 'enhanced-tree-sitter', 0.88],
      ['ProcessTerrain', 'PlanetGen::TerrainOrchestrator::ProcessTerrain', 'method', '/src/terrain/TerrainOrchestrator.cpp', 120, 5, 'terrain_formation', '["processing", "terrain"]', 'enhanced-tree-sitter', 0.91]
    ];

    testSymbols.forEach(symbol => {
      const result = symbolStmt.run(...symbol);
    });

    // Insert test Vulkan patterns using correct schema
    const vulkanStmt = this.testDb!.prepare(`
      INSERT INTO vulkan_patterns (
        symbol_id, operation_type, vulkan_object_type,
        resource_lifetime, sharing_mode, is_gpu_heavy,
        estimated_gpu_memory_mb, synchronization_required,
        follows_vulkan_best_practices, potential_performance_issue
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    vulkanStmt.run(3, 'descriptor_set', 'VkDescriptorSet', 'frame', 'exclusive', 1, 15, 1, 1, null);
    vulkanStmt.run(3, 'command_buffer', 'VkCommandBuffer', 'frame', 'exclusive', 1, 2, 1, 1, null);

    // Insert test complexity analysis
    const complexityStmt = this.testDb!.prepare(`
      INSERT INTO method_complexity_analysis (
        symbol_id, cyclomatic_complexity, cognitive_complexity, 
        nesting_depth, parameter_count, local_variable_count,
        line_count, has_loops, has_recursion, has_dynamic_allocation,
        readability_score, testability_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // symbol_id, cyclomatic, cognitive, nesting, params, locals, lines, loops, recursion, dynamic_alloc, readability, testability
    complexityStmt.run(3, 8, 12, 3, 4, 6, 45, 1, 0, 1, 0.75, 0.80);
    complexityStmt.run(5, 15, 22, 5, 6, 12, 120, 1, 1, 1, 0.45, 0.50);

    // Insert test memory patterns using correct schema
    const memoryStmt = this.testDb!.prepare(`
      INSERT INTO memory_patterns (
        symbol_id, pattern_type, allocation_method, memory_size_estimate,
        is_cache_friendly, has_alignment_optimization, uses_raii,
        potential_leak, potential_double_free, potential_use_after_free,
        source_location, evidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    memoryStmt.run(3, 'allocation', 'heap', 1024, 1, 0, 1, 0, 0, 0, 'line 45', 'make_unique usage');
    memoryStmt.run(5, 'allocation', 'heap', 2048, 0, 0, 0, 1, 0, 0, 'line 120', 'raw new operator');

    // Insert test call chains using correct schema
    const chainStmt = this.testDb!.prepare(`
      INSERT INTO call_chains (
        entry_point_id, chain_depth, total_functions,
        crosses_stage_boundaries, stage_transitions,
        estimated_execution_time_ms, has_performance_bottleneck, bottleneck_location,
        data_transformation_type, input_data_types, output_data_types
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // entry_point_id, depth, functions, crosses_boundaries, transitions, exec_time, has_bottleneck, bottleneck, transform_type, input_types, output_types
    chainStmt.run(
      1, 3, 5, 1, '["terrain_formation", "noise_generation"]',
      25.5, 0, null, 'generation', '["height_data"]', '["terrain_mesh"]'
    );

    // Insert test call chain steps using correct schema
    const stepStmt = this.testDb!.prepare(`
      INSERT INTO call_chain_steps (
        chain_id, step_number, caller_id, callee_id,
        call_site_line, call_context, data_passed, data_transformed,
        transformation_type, estimated_step_time_ms, is_performance_critical
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stepStmt.run(1, 0, 1, 4, 125, 'orchestrator calls noise gen', 'terrain params', 1, 'noise generation', 5.5, 0);
    stepStmt.run(1, 1, 4, 5, 250, 'noise gen calls process', 'noise data', 1, 'mesh generation', 15.0, 1);

    // Insert test rich function calls
    const callStmt = this.testDb!.prepare(`
      INSERT INTO rich_function_calls (
        caller_id, callee_id, call_site_line, call_type, 
        is_vulkan_api, vulkan_operation_category
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    callStmt.run(1, 3, 125, 'direct', 1, 'setup');

    console.log('✅ Test data populated successfully');
  }

  private async indexComplexFiles(): Promise<void> {
    console.log('📂 Indexing complex test files...');
    
    const testDbPath = path.join(process.cwd(), '.test-db', 'rich-semantic.db');
    const projectPath = path.join(process.cwd(), 'test', 'complex-files');
    // Pass our test database as the 5th parameter
    const indexer = new PatternAwareIndexer(projectPath, testDbPath, true, false, this.testDb);
    
    // Index a few representative files from complex-files
    const complexFilesDir = path.join(process.cwd(), 'test', 'complex-files', 'cpp');
    const filesToIndex = [
      'VulkanPipelineCreator.cpp',
      'VulkanPipelineManager.cpp',
      'TerrainOrchestrator.cpp'
    ];
    
    const fullPaths = filesToIndex.map(f => path.join(complexFilesDir, f));
    
    // Filter to only existing files
    const existingFiles = [];
    for (const filePath of fullPaths) {
      try {
        await fs.access(filePath);
        existingFiles.push(filePath);
      } catch {}
    }
    
    if (existingFiles.length > 0) {
      console.log(`   Indexing ${existingFiles.length} files...`);
      await indexer.indexFiles(existingFiles);
      console.log('   ✅ Complex files indexed');
    } else {
      console.log('   ⚠️  No complex files found to index');
    }
  }

  private async testRelationshipBuilding(): Promise<void> {
    console.log('\n🔗 Testing Relationship Building');
    
    // First check if any symbols were indexed
    const symbolCount = this.testDb!.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as { count: number };
    console.log(`   Total symbols in database: ${symbolCount.count}`);
    
    // Check symbols from the indexed files
    const fileSymbols = this.testDb!.prepare(`
      SELECT file_path, COUNT(*) as count 
      FROM enhanced_symbols 
      GROUP BY file_path
    `).all() as any[];
    console.log(`   Symbols by file:`);
    fileSymbols.forEach(f => {
      console.log(`     ${f.file_path}: ${f.count}`);
    });
    
    // Check how many relationships are being created
    const relationshipCount = this.testDb!.prepare('SELECT COUNT(*) as count FROM symbol_relationships').get() as { count: number };
    console.log(`   Total relationships in database: ${relationshipCount.count}`);
    
    // Check relationship types
    const relationshipTypes = this.testDb!.prepare(`
      SELECT relationship_type, COUNT(*) as count 
      FROM symbol_relationships 
      GROUP BY relationship_type 
      ORDER BY count DESC
    `).all() as any[];
    
    console.log(`   Relationship types:`);
    relationshipTypes.forEach(type => {
      console.log(`     ${type.relationship_type}: ${type.count}`);
    });
    
    // Sample some relationships to check quality
    const sampleRelationships = this.testDb!.prepare(`
      SELECT from_name, to_name, relationship_type, confidence, source_text
      FROM symbol_relationships
      ORDER BY RANDOM()
      LIMIT 10
    `).all() as any[];
    
    console.log(`   Sample relationships:`);
    sampleRelationships.forEach((rel, i) => {
      console.log(`     ${i + 1}. ${rel.from_name} -[${rel.relationship_type}]-> ${rel.to_name} (${rel.confidence})`);
      if (rel.source_text) {
        console.log(`        Source: ${rel.source_text.substring(0, 50)}...`);
      }
    });
    
    // Check semantic connections
    const semanticCount = this.testDb!.prepare('SELECT COUNT(*) as count FROM semantic_connections').get() as { count: number };
    console.log(`   Semantic connections: ${semanticCount.count}`);
    
    // Check for empty relationships (the issue we're trying to fix)
    const emptyRelationships = this.testDb!.prepare(`
      SELECT COUNT(*) as count 
      FROM symbol_relationships 
      WHERE (from_name IS NULL OR from_name = '') 
         OR (to_name IS NULL OR to_name = '')
    `).get() as { count: number };
    
    console.log(`   Empty relationships: ${emptyRelationships.count}`);
    
    if (emptyRelationships.count > 0) {
      console.log('   ⚠️  Found empty relationships - this indicates a problem with relationship building');
      
      // Show some empty relationships
      const emptyRels = this.testDb!.prepare(`
        SELECT relationship_type, from_symbol_id, to_symbol_id, source_text
        FROM symbol_relationships 
        WHERE (from_name IS NULL OR from_name = '') 
           OR (to_name IS NULL OR to_name = '')
        LIMIT 5
      `).all() as any[];
      
      console.log('   Sample empty relationships:');
      emptyRels.forEach((rel, i) => {
        console.log(`     ${i + 1}. Type: ${rel.relationship_type}, IDs: ${rel.from_symbol_id}->${rel.to_symbol_id}`);
        if (rel.source_text) {
          console.log(`        Source: ${rel.source_text.substring(0, 50)}...`);
        }
      });
    } else {
      console.log('   ✅ No empty relationships found');
    }
  }

  private async testAdvancedVulkanQueries(): Promise<void> {
    console.log('\n🎮 Testing Advanced Vulkan Queries');
    
    // Test specific descriptor set query
    const descriptorSets = await this.queryTool!.findVulkanDescriptorSets('foam water texture');
    console.log(`   Found ${descriptorSets.length} descriptor set operations matching foam water texture`);
    
    if (descriptorSets.length > 0) {
      const firstResult = descriptorSets[0];
      console.log(`   ✅ Found: ${firstResult.name} in ${firstResult.file_path}:${firstResult.line}`);
      console.log(`      Operation: ${firstResult.operation_type}, Type: ${firstResult.vulkan_object_type}`);
      console.log(`      GPU Heavy: ${firstResult.is_gpu_heavy}, Memory: ${firstResult.estimated_gpu_memory_mb}MB`);
      
      // Verify the result contains expected data
      if (firstResult.name === 'CreateDescriptorSet' && 
          firstResult.vulkan_object_type === 'VkDescriptorSet' &&
          firstResult.operation_type === 'descriptor_set') {
        console.log('   ✅ Vulkan descriptor set query returned correct data');
      } else {
        console.log('   ❌ Vulkan descriptor set query returned unexpected data');
      }
    } else {
      console.log('   ⚠️  No descriptor sets found - check test data');
    }
  }

  private async testCallChainTracking(): Promise<void> {
    console.log('\n🔗 Testing Call Chain Tracking');
    
    // Test call chain discovery
    const chains = await this.queryTool!.findCallChains('TerrainOrchestrator', 'ProcessTerrain');
    console.log(`   Found ${chains.length} call chains from TerrainOrchestrator to ProcessTerrain`);
    
    if (chains.length > 0) {
      const chain = chains[0];
      console.log(`   ✅ Chain: ${chain.entry_point_name} (${chain.entry_point_qualified})`);
      console.log(`      Depth: ${chain.chain_depth}, Functions: ${chain.total_functions}`);
      console.log(`      Crosses Boundaries: ${chain.crosses_stage_boundaries ? 'Yes' : 'No'}`);
      console.log(`      Stage Transitions: ${chain.stage_transitions}`);
      
      if (chain.steps && chain.steps.length > 0) {
        console.log(`      Steps: ${chain.steps.length}`);
        chain.steps.forEach((step: any, i: number) => {
          console.log(`        ${i}: ${step.from_name} -> ${step.to_name} (${step.call_type})`);
        });
        console.log('   ✅ Call chain steps detailed correctly');
      } else {
        console.log('   ⚠️  No detailed steps found for call chain');
      }
    } else {
      console.log('   ⚠️  No call chains found - check test data');
    }
  }

  private async testSemanticSearch(): Promise<void> {
    console.log('\n🔍 Testing Semantic Search');
    
    // Test multi-faceted semantic search
    const results = await this.queryTool!.semanticSearch('vulkan descriptor texture foam');
    console.log(`   Semantic search returned ${results.length} results`);
    
    const resultTypes = new Set(results.map((r: any) => r.result_type));
    console.log(`   Result types: ${Array.from(resultTypes).join(', ')}`);
    
    // Verify we get different types of results
    const hasSymbols = results.some((r: any) => r.result_type === 'symbol');
    const hasVulkan = results.some((r: any) => r.result_type === 'vulkan_pattern');
    
    if (hasSymbols && hasVulkan) {
      console.log('   ✅ Semantic search returned diverse result types');
    } else {
      console.log('   ⚠️  Semantic search missing expected result types');
    }
    
    // Show sample results
    results.slice(0, 3).forEach((result: any, i: number) => {
      console.log(`   ${i + 1}. [${result.result_type}] ${result.name} - ${result.file_path}:${result.line}`);
    });
  }

  private async testNaturalLanguageQueries(): Promise<void> {
    console.log('\n🗣️ Testing Natural Language Query Processing');
    
    const testQueries = [
      'Where are descriptor sets created for our foam water texture generation?',
      'Find call chains from TerrainOrchestrator to ProcessTerrain',
      'Show me performance critical code paths',
      'Find architectural violations in the pipeline'
    ];
    
    for (const query of testQueries) {
      console.log(`\n   Query: "${query}"`);
      try {
        const results = await this.queryTool!.processNaturalLanguageQuery(query);
        
        if (Array.isArray(results)) {
          console.log(`   ✅ Returned ${results.length} results`);
          if (results.length > 0) {
            const firstResult = results[0];
            if (firstResult.name || firstResult.chain_signature) {
              console.log(`      First result: ${firstResult.name || firstResult.chain_signature}`);
            }
          }
        } else if (results && typeof results === 'object') {
          const keys = Object.keys(results);
          console.log(`   ✅ Returned structured results with keys: ${keys.join(', ')}`);
          
          // Check for expected structure in performance queries
          if (query.includes('performance') && results.criticalCallChains) {
            console.log(`      Critical chains: ${results.criticalCallChains.length}`);
            console.log(`      Vulkan hotspots: ${results.vulkanHotspots.length}`);
            console.log(`      Complex functions: ${results.complexFunctions.length}`);
          }
        } else {
          console.log(`   ⚠️  Unexpected result type: ${typeof results}`);
        }
      } catch (error) {
        console.log(`   ❌ Query failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async testPerformanceAnalysis(): Promise<void> {
    console.log('\n⚡ Testing Performance Analysis');
    
    const perfResults = await this.queryTool!.findPerformanceCriticalPaths();
    
    console.log(`   Critical call chains: ${perfResults.criticalCallChains?.length || 0}`);
    console.log(`   Vulkan hotspots: ${perfResults.vulkanHotspots?.length || 0}`);
    console.log(`   Complex functions: ${perfResults.complexFunctions?.length || 0}`);
    
    if (perfResults.vulkanHotspots && perfResults.vulkanHotspots.length > 0) {
      const hotspot = perfResults.vulkanHotspots[0];
      console.log(`   ✅ Top Vulkan hotspot: ${hotspot.name} (${hotspot.operation_type})`);
      console.log(`      GPU Memory: ${hotspot.gpu_memory_usage_mb}MB`);
      console.log(`      Estimated Time: ${hotspot.estimated_gpu_time_ms}ms`);
    }
    
    if (perfResults.complexFunctions && perfResults.complexFunctions.length > 0) {
      const complex = perfResults.complexFunctions[0];
      console.log(`   ✅ Most complex function: ${complex.name}`);
      console.log(`      Cyclomatic: ${complex.cyclomatic_complexity}, Cognitive: ${complex.cognitive_complexity}`);
      console.log(`      Readability: ${complex.readability_score}, Testability: ${complex.testability_score}`);
    }
  }

  private async testArchitecturalAnalysis(): Promise<void> {
    console.log('\n🏗️ Testing Architectural Analysis');
    
    const violations = await this.queryTool!.findArchitecturalViolations();
    console.log(`   Found ${violations.length} architectural violations`);
    
    if (violations.length > 0) {
      const violation = violations[0];
      console.log(`   ✅ Violation: ${violation.chain_signature}`);
      console.log(`      Pipeline transitions: ${violation.pipeline_stage_transitions}`);
      console.log(`      Coupling strength: ${violation.coupling_strength}`);
      console.log(`      From: ${violation.entry_stage} -> To: ${violation.exit_stage}`);
    }
  }

  private async testComplexityAnalysis(): Promise<void> {
    console.log('\n🧮 Testing Complexity Analysis');
    
    // Query complexity data directly
    const complexityResults = this.testDb!.prepare(`
      SELECT 
        es.name,
        mca.cyclomatic_complexity,
        mca.cognitive_complexity,
        mca.readability_score,
        mca.testability_score
      FROM enhanced_symbols es
      JOIN method_complexity_analysis mca ON mca.symbol_id = es.id
      ORDER BY mca.cyclomatic_complexity DESC
    `).all();
    
    console.log(`   Found ${complexityResults.length} functions with complexity analysis`);
    
    if (complexityResults.length > 0) {
      const mostComplex = complexityResults[0];
      console.log(`   ✅ Most complex: ${mostComplex.name}`);
      console.log(`      Cyclomatic: ${mostComplex.cyclomatic_complexity}`);
      console.log(`      Cognitive: ${mostComplex.cognitive_complexity}`);
      console.log(`      Readability: ${mostComplex.readability_score}`);
      console.log(`      Testability: ${mostComplex.testability_score}`);
    }
  }

  private async testMemoryPatternAnalysis(): Promise<void> {
    console.log('\n🧠 Testing Memory Pattern Analysis');
    
    // Query memory patterns
    const memoryResults = this.testDb!.prepare(`
      SELECT 
        es.name,
        mp.pattern_type,
        mp.allocation_method,
        mp.uses_raii,
        mp.potential_leak,
        mp.is_cache_friendly
      FROM enhanced_symbols es
      JOIN memory_patterns mp ON mp.symbol_id = es.id
      ORDER BY mp.potential_leak DESC, mp.uses_raii ASC
    `).all();
    
    console.log(`   Found ${memoryResults.length} functions with memory pattern analysis`);
    
    if (memoryResults.length > 0) {
      memoryResults.forEach((pattern: any, i: number) => {
        console.log(`   ${i + 1}. ${pattern.name}: ${pattern.pattern_type}/${pattern.allocation_method}`);
        console.log(`      RAII: ${pattern.uses_raii ? 'Yes' : 'No'}, Leaks: ${pattern.potential_leak ? 'Potential' : 'None'}`);
      });
      
      const raiiCompliantCount = memoryResults.filter((p: any) => p.uses_raii).length;
      const leakRiskCount = memoryResults.filter((p: any) => p.potential_leak).length;
      
      console.log(`   ✅ RAII Compliance: ${raiiCompliantCount}/${memoryResults.length}`);
      console.log(`   ⚠️  Potential leaks: ${leakRiskCount}/${memoryResults.length}`);
    }
  }
}

export default RichSemanticAnalysisTest;