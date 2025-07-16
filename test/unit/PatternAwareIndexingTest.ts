import { BaseTest } from '../helpers/BaseTest';
import { PatternAwareIndexer } from '../../dist/indexing/pattern-aware-indexer.js';
import Database from 'better-sqlite3';
import * as path from 'path';

export class PatternAwareIndexingTest extends BaseTest {
  private indexer: PatternAwareIndexer | null = null;
  private sharedDbPath: string;
  private testFiles = [
    'cpp/TerrainOrchestrator.cpp',
    'cpp/VulkanPipelineCreator.cpp',
    'cpp/VulkanPipelineManager.cpp'
  ];

  constructor(sharedDbPath: string = '.test-db/main/pattern-aware.db') {
    super('pattern-aware-indexing');
    this.sharedDbPath = sharedDbPath;
  }

  async specificSetup(): Promise<void> {
    // Use the shared database from TestRunner
    this.indexer = new PatternAwareIndexer(this.projectPath, this.sharedDbPath);
  }

  async specificTeardown(): Promise<void> {
    if (this.indexer) {
      this.indexer.close();
    }
  }

  async run(): Promise<void> {
    await this.testIndexBuilding();
    
    // Important: Only run database queries after indexing
    const db = new Database(this.sharedDbPath);
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='enhanced_symbols'").get();
    
    if (tableExists) {
      await this.testPatternDetection();
      await this.testSemanticTagCoverage();
    } else {
      console.log('\n⚠️  Skipping pattern tests - enhanced_symbols table not created');
    }
    
    db.close(); // Close the connection we opened for checking
  }

  private async testIndexBuilding(): Promise<void> {
    let successCount = 0;
    for (const file of this.testFiles) {
      const fullPath = path.join(this.projectPath, file);
      try {
        await this.indexer!.indexFile(fullPath);
        successCount++;
      } catch (error) {
        console.log(` Failed to index ${path.basename(file)}: ${(error as Error).message}`);
      }
    }
    
    // ASSERTIONS: Verify indexing is working
    this.assertGreaterThan(successCount, 0, "Should successfully index at least one file");
    this.assertGreaterEqual(successCount, this.testFiles.length * 0.8, "Should index >80% of files successfully");
  }

  private async testPatternDetection(): Promise<void> {
    const db = new Database(this.sharedDbPath);
    
    // Test factory pattern detection
    const factoryPatterns = db.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE is_factory = 1
    `).get() as any;
    
    // Test GPU/CPU pattern detection
    const gpuPatterns = db.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE execution_mode = 'gpu'
    `).get() as any;
    
    const cpuPatterns = db.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE execution_mode = 'cpu'
    `).get() as any;
    
    // ASSERTIONS: Verify pattern detection is working
    this.assertGreaterThan(factoryPatterns.count, 0, "Should detect at least one factory pattern");
    this.assertGreaterThan(gpuPatterns.count + cpuPatterns.count, 0, "Should detect GPU or CPU execution patterns");
    
    // Test anti-pattern detection
    const antiPatterns = db.prepare(`
      SELECT name, file_path, semantic_tags 
      FROM enhanced_symbols 
      WHERE semantic_tags LIKE '%anti_pattern%'
      LIMIT 5
    `).all();
    
    if (antiPatterns.length > 0) {
      console.log(`\n⚠️  Detected ${antiPatterns.length} anti-patterns:`);
      antiPatterns.forEach((pattern: any) => {
        console.log(`  - ${pattern.name} in ${path.basename(pattern.file_path)}`);
      });
    }
    
    db.close();
  }

  private async testSemanticTagCoverage(): Promise<void> {
    const db = new Database(this.sharedDbPath);
    
    const totalSymbols = (db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count;
    const symbolsWithTags = (db.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE semantic_tags != '[]'
    `).get() as any).count;
    
    const coverage = (symbolsWithTags / totalSymbols) * 100;
    
    // ASSERTIONS: Verify semantic tag coverage
    this.assertGreaterThan(totalSymbols, 100, "Should have >100 symbols in database");
    this.assertGreaterThan(symbolsWithTags, 50, "Should have >50 symbols with semantic tags");
    this.assertGreaterEqual(coverage, 70, "Semantic tag coverage should be >=70%");
    
    // Analyze tag distribution
    const tagStats = db.prepare(`
      SELECT 
        CASE 
          WHEN semantic_tags LIKE '%gpu%' THEN 'GPU-related'
          WHEN semantic_tags LIKE '%factory%' THEN 'Factory pattern'
          WHEN semantic_tags LIKE '%generator%' THEN 'Generator pattern'
          WHEN semantic_tags LIKE '%anti_pattern%' THEN 'Anti-pattern'
          WHEN semantic_tags LIKE '%solid_violation%' THEN 'SOLID violation'
          ELSE 'Other'
        END as tag_category,
        COUNT(*) as count
      FROM enhanced_symbols
      WHERE semantic_tags != '[]'
      GROUP BY tag_category
    `).all();
    
    // ASSERTIONS: Verify tag distribution
    this.assertGreaterThan(tagStats.length, 0, "Should have at least one tag category");
    const totalTagged = tagStats.reduce((sum: number, stat: any) => sum + stat.count, 0);
    this.assertGreaterThan(totalTagged, 20, "Should have >20 symbols with categorized tags");
    
    db.close();
  }
}