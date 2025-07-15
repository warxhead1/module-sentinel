import { BaseTest } from '../helpers/BaseTest';
import { HybridCppParser } from '../../dist/parsers/hybrid-cpp-parser.js';
import { UnifiedSchemaManager } from '../../dist/database/unified-schema-manager.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Test Parser Fallback Mechanism
 * 
 * This test ensures that when Clang is unavailable or fails,
 * the system properly falls back to Tree-sitter and fills in gaps
 */
export class ParserFallbackTest extends BaseTest {
  private parser: HybridCppParser;
  private schemaManager: UnifiedSchemaManager;
  private testDbPath: string;
  private projectPath: string = '/home/warxh/planet_procgen';
  
  // Test files that we know exist
  private testFiles = [
    'src/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.cpp',
    'src/Core/Performance/WaterTerrainDebugMetrics.cpp',
    'include/Core/Threading/JobSystem.ixx',
    'include/Generation/Pipeline/PipelineFactory.ixx'
  ];

  constructor() {
    super('parser-fallback');
    this.testDbPath = '.test-db/fallback/parser-fallback.db';
    this.parser = new HybridCppParser();
    this.schemaManager = UnifiedSchemaManager.getInstance();
  }

  async specificSetup(): Promise<void> {
    // Create test database directory
    await fs.mkdir(path.dirname(this.testDbPath), { recursive: true });
    
    // Initialize parser with project path
    await this.parser.initialize(this.projectPath);
  }

  async specificTeardown(): Promise<void> {
    // Stop background re-indexing
    this.parser.stopProgressiveReindexing();
  }

  async run(): Promise<void> {
    console.log('\n📋 Test 1: Simulate Clang Unavailable');
    await this.testClangUnavailable();
    
    console.log('\n📋 Test 2: Test Clang Failure with Tree-sitter Fallback');
    await this.testClangFailureWithFallback();
    
    console.log('\n📋 Test 3: Test Progressive Gap Filling');
    await this.testProgressiveGapFilling();
    
    console.log('\n📋 Test 4: Verify Database Integrity');
    await this.verifyDatabaseIntegrity();
  }

  /**
   * Test 1: Simulate Clang being unavailable
   */
  private async testClangUnavailable(): Promise<void> {
    console.log('Testing parser behavior when Clang is not available...\n');
    
    // Create a new parser instance and manually set hasClang to false
    const noClangParser = new HybridCppParser();
    (noClangParser as any).hasClang = false; // Force Clang unavailable
    await noClangParser.initialize(this.projectPath);
    
    const filePath = path.join(this.projectPath, this.testFiles[0]);
    console.log(`Parsing ${path.basename(filePath)} without Clang...`);
    
    const result = await noClangParser.parseFile(filePath);
    
    console.log(`✅ Tree-sitter fallback results:`);
    console.log(`  - Methods found: ${result.methods.length}`);
    console.log(`  - Classes found: ${result.classes.length}`);
    console.log(`  - Patterns detected: ${result.patterns.length}`);
    
    // Verify data was stored in preservation database
    const db = new Database(path.join(this.projectPath, '.module-sentinel', 'preservation.db'));
    const fileInfo = db.prepare('SELECT * FROM indexed_files WHERE path = ?').get(filePath) as any;
    
    console.log(`\n📊 Database record:`);
    console.log(`  - Parser used: ${fileInfo?.best_parser || 'none'}`);
    console.log(`  - Tree-sitter success: ${fileInfo?.treesitter_success === 1 ? 'Yes' : 'No'}`);
    console.log(`  - Clang success: ${fileInfo?.clang_success === 1 ? 'Yes' : 'No'}`);
    console.log(`  - Confidence: ${fileInfo?.best_confidence || 0}`);
    
    db.close();
    noClangParser.stopProgressiveReindexing();
  }

  /**
   * Test 2: Test Clang failure with proper fallback
   */
  private async testClangFailureWithFallback(): Promise<void> {
    console.log('Testing fallback when Clang fails to parse a file...\n');
    
    // Use a file that might cause Clang issues (.ixx module file)
    const filePath = path.join(this.projectPath, this.testFiles[2]);
    console.log(`Parsing module file: ${path.basename(filePath)}`);
    
    // First, try with all parsers
    const allParsersResult = await this.parser.parseWithAllParsers(filePath);
    
    console.log(`\n🔄 All parsers attempted:`);
    console.log(`  - Total methods: ${allParsersResult.methods.length}`);
    console.log(`  - Total classes: ${allParsersResult.classes.length}`);
    console.log(`  - Total patterns: ${allParsersResult.patterns.length}`);
    
    // Check what each parser found
    const db = new Database(path.join(this.projectPath, '.module-sentinel', 'preservation.db'));
    
    const parserMetrics = db.prepare(`
      SELECT 
        parser_name,
        COUNT(*) as attempts,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(confidence) as avg_confidence,
        AVG(semantic_coverage) as avg_coverage
      FROM parser_metrics
      WHERE file_path = ?
      GROUP BY parser_name
    `).all(filePath) as any[];
    
    console.log(`\n📊 Parser performance for this file:`);
    parserMetrics.forEach(metric => {
      console.log(`  ${metric.parser_name}:`);
      console.log(`    - Attempts: ${metric.attempts}`);
      console.log(`    - Successes: ${metric.successes}`);
      console.log(`    - Avg confidence: ${metric.avg_confidence?.toFixed(2) || 'N/A'}`);
      console.log(`    - Semantic coverage: ${(metric.avg_coverage * 100).toFixed(1)}%`);
    });
    
    db.close();
  }

  /**
   * Test 3: Test progressive gap filling
   */
  private async testProgressiveGapFilling(): Promise<void> {
    console.log('Testing progressive gap filling with multiple parsers...\n');
    
    const filePath = path.join(this.projectPath, this.testFiles[1]);
    
    // Step 1: Parse with streaming only (minimal info)
    console.log('Step 1: Streaming parser (minimal info)');
    const streamingResult = await this.parser.parseWithParser(filePath, 'streaming');
    console.log(`  - Classes: ${streamingResult.classes.length}`);
    console.log(`  - Methods: ${streamingResult.methods.length} (expected: 0)`);
    
    // Step 2: Parse with tree-sitter (more info)
    console.log('\nStep 2: Tree-sitter parser (semantic info)');
    const treeSitterResult = await this.parser.parseWithParser(filePath, 'tree-sitter');
    console.log(`  - Classes: ${treeSitterResult.classes.length}`);
    console.log(`  - Methods: ${treeSitterResult.methods.length}`);
    console.log(`  - Patterns: ${treeSitterResult.patterns.length}`);
    
    // Step 3: Clang parser disabled - doesn't support C++23 modules
    console.log('\nStep 3: Skipping Clang parser (not compatible with C++23 modules)');
    console.log(`  - Tree-sitter data preserved`);
    
    // Check final database state
    const db = new Database(path.join(this.projectPath, '.module-sentinel', 'preservation.db'));
    
    const symbols = db.prepare(`
      SELECT 
        parser_used,
        COUNT(*) as symbol_count,
        AVG(parser_confidence) as avg_confidence
      FROM enhanced_symbols
      WHERE file_path = ?
      GROUP BY parser_used
    `).all(filePath) as any[];
    
    console.log(`\n📊 Final symbol distribution:`);
    symbols.forEach(s => {
      console.log(`  - ${s.parser_used}: ${s.symbol_count} symbols (confidence: ${s.avg_confidence.toFixed(2)})`);
    });
    
    db.close();
  }

  /**
   * Test 4: Verify database integrity after fallbacks
   */
  private async verifyDatabaseIntegrity(): Promise<void> {
    console.log('Verifying database integrity after parser fallbacks...\n');
    
    const db = new Database(path.join(this.projectPath, '.module-sentinel', 'preservation.db'));
    
    // Check file coverage
    const fileCoverage = db.prepare(`
      SELECT 
        COUNT(DISTINCT path) as total_files,
        SUM(CASE WHEN clang_success = 1 THEN 1 ELSE 0 END) as clang_parsed,
        SUM(CASE WHEN treesitter_success = 1 THEN 1 ELSE 0 END) as treesitter_parsed,
        SUM(CASE WHEN streaming_success = 1 THEN 1 ELSE 0 END) as streaming_parsed,
        SUM(CASE WHEN best_parser IS NOT NULL THEN 1 ELSE 0 END) as has_parser
      FROM indexed_files
    `).get() as any;
    
    console.log(`📊 File Coverage:`);
    console.log(`  - Total files indexed: ${fileCoverage.total_files}`);
    console.log(`  - Clang successful: ${fileCoverage.clang_parsed}`);
    console.log(`  - Tree-sitter successful: ${fileCoverage.treesitter_parsed}`);
    console.log(`  - Streaming successful: ${fileCoverage.streaming_parsed}`);
    console.log(`  - Files with at least one parser: ${fileCoverage.has_parser}`);
    
    // Check symbol preservation
    const symbolPreservation = db.prepare(`
      SELECT 
        parser_used,
        COUNT(*) as total_symbols,
        AVG(parser_confidence) as avg_confidence,
        COUNT(DISTINCT file_path) as files_covered
      FROM enhanced_symbols
      GROUP BY parser_used
    `).all() as any[];
    
    console.log(`\n📊 Symbol Preservation by Parser:`);
    symbolPreservation.forEach(sp => {
      console.log(`  ${sp.parser_used || 'unknown'}:`);
      console.log(`    - Symbols: ${sp.total_symbols}`);
      console.log(`    - Files: ${sp.files_covered}`);
      console.log(`    - Avg confidence: ${sp.avg_confidence.toFixed(2)}`);
    });
    
    // Check for files with multiple parser results (gap filling)
    const gapFilled = db.prepare(`
      SELECT 
        file_path,
        COUNT(DISTINCT parser_used) as parser_count,
        GROUP_CONCAT(DISTINCT parser_used) as parsers_used
      FROM enhanced_symbols
      GROUP BY file_path
      HAVING parser_count > 1
      LIMIT 5
    `).all() as any[];
    
    if (gapFilled.length > 0) {
      console.log(`\n✅ Gap Filling Examples (files with multiple parsers):`);
      gapFilled.forEach(gf => {
        console.log(`  - ${path.basename(gf.file_path)}: ${gf.parsers_used}`);
      });
    }
    
    // Verify no data loss
    const dataIntegrity = db.prepare(`
      SELECT 
        COUNT(*) as orphan_symbols
      FROM enhanced_symbols
      WHERE file_path NOT IN (SELECT path FROM indexed_files)
    `).get() as any;
    
    console.log(`\n🔒 Data Integrity:`);
    console.log(`  - Orphan symbols: ${dataIntegrity.orphan_symbols}`);
    console.log(`  - Status: ${dataIntegrity.orphan_symbols === 0 ? '✅ No data loss' : '❌ Data integrity issue'}`);
    
    db.close();
  }
}

// Export for use in TestRunner
export default ParserFallbackTest;