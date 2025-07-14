import { BaseTest } from '../helpers/BaseTest';
import { PatternAwareIndexer } from '../../dist/indexing/pattern-aware-indexer.js';
import Database from 'better-sqlite3';
import * as path from 'path';

export class PatternAwareIndexingTest extends BaseTest {
  private indexer: PatternAwareIndexer | null = null;
  private sharedDbPath: string;
  private testFiles = [
    'src/Generation/Heightmaps/GPUModularHeightmapGenerator.cpp',
    'src/Rendering/Vulkan/Core/VulkanResourceManager.cpp',
    'src/Generation/Orchestration/TerrainOrchestrator.cpp'
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
    console.log('\n📋 Test 1: Index Building');
    await this.testIndexBuilding();
    
    // Important: Only run database queries after indexing
    const db = new Database(this.sharedDbPath);
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='enhanced_symbols'").get();
    
    if (tableExists) {
      console.log('\n📋 Test 2: Pattern Detection');
      await this.testPatternDetection();
      
      console.log('\n📋 Test 3: Semantic Tag Coverage');
      await this.testSemanticTagCoverage();
    } else {
      console.log('\n⚠️  Skipping pattern tests - enhanced_symbols table not created');
    }
    
    db.close(); // Close the connection we opened for checking
  }

  private async testIndexBuilding(): Promise<void> {
    console.log('Building pattern-aware index...');
    
    let successCount = 0;
    for (const file of this.testFiles) {
      const fullPath = path.join(this.projectPath, file);
      try {
        await this.indexer!.indexFile(fullPath);
        successCount++;
        console.log(`Indexed: ${path.basename(file)}`);
      } catch (error) {
        console.log(` Failed to index ${path.basename(file)}: ${(error as Error).message}`);
      }
    }
    
    console.log(`\n📊 Indexed ${successCount}/${this.testFiles.length} files successfully`);
  }

  private async testPatternDetection(): Promise<void> {
    console.log('\nTesting pattern detection capabilities...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test factory pattern detection
    const factoryPatterns = db.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE is_factory = 1
    `).get() as any;
    
    console.log(`Factory patterns detected: ${factoryPatterns.count}`);
    
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
    
    console.log(`GPU execution patterns: ${gpuPatterns.count}`);
    console.log(`CPU execution patterns: ${cpuPatterns.count}`);
    
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
  }

  private async testSemanticTagCoverage(): Promise<void> {
    console.log('\nAnalyzing semantic tag coverage...');
    
    const db = new Database(this.sharedDbPath);
    
    const totalSymbols = (db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count;
    const symbolsWithTags = (db.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE semantic_tags != '[]'
    `).get() as any).count;
    
    const coverage = (symbolsWithTags / totalSymbols) * 100;
    
    console.log(`\n📊 Semantic Tag Coverage:`);
    console.log(`  - Total symbols: ${totalSymbols}`);
    console.log(`  - Symbols with tags: ${symbolsWithTags}`);
    console.log(`  - Coverage: ${coverage.toFixed(1)}%`);
    
    if (coverage < 70) {
      console.log(`  - ⚠️  WARNING: Coverage below 70% threshold`);
    } else {
      console.log(`  - Good semantic coverage`);
    }
    
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
    
    console.log('\n📊 Tag Distribution:');
    tagStats.forEach((stat: any) => {
      console.log(`  - ${stat.tag_category}: ${stat.count}`);
    });
  }
}