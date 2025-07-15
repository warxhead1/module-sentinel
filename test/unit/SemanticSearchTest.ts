import { BaseTest } from '../helpers/BaseTest';
import Database from 'better-sqlite3';
import * as path from 'path';

export class SemanticSearchTest extends BaseTest {
  private db: Database.Database | null = null;
  private sharedDbPath: string;

  constructor(sharedDbPath: string = 'module-sentinel.db') {
    super('semantic-search');
    this.sharedDbPath = sharedDbPath;
  }

  async specificSetup(): Promise<void> {
    this.db = new Database(this.sharedDbPath, { readonly: true });
  }

  async specificTeardown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async run(): Promise<void> {
    console.log('\n🔍 Testing Semantic Search Capabilities\n');
    
    await this.testProcessMountainOperation();
    await this.testGenerateHeightMap();
    await this.testSemanticRichness();
  }

  private async testProcessMountainOperation(): Promise<void> {
    console.log('📍 Testing search for ProcessMountainOperation...');
    
    const results = this.db!.prepare(`
      SELECT name, file_path, kind, semantic_tags 
      FROM enhanced_symbols 
      WHERE name LIKE '%ProcessMountainOperation%'
      OR semantic_tags LIKE '%ProcessMountainOperation%'
    `).all();

    console.log(`Found ${results.length} results for ProcessMountainOperation`);
    
    if (results.length > 0) {
      results.forEach((r: any) => {
        console.log(`  - ${r.name} in ${path.basename(r.file_path)}`);
        console.log(`    Type: ${r.kind}, Tags: ${r.semantic_tags || 'none'}`);
      });
      
      // Check if it correctly identifies MountainProcessor
      const inMountainProcessor = results.some((r: any) => 
        r.file_path.includes('MountainProcessor') || 
        r.file_path.includes('mountain')
      );
      console.log(`  ✓ Found in MountainProcessor: ${inMountainProcessor}`);
    } else {
      console.log('  ⚠️  No results found - semantic data may be incomplete');
    }
    console.log();
  }

  private async testGenerateHeightMap(): Promise<void> {
    console.log('📍 Testing search for GenerateHeightMap (expecting multiple results)...');
    
    const results = this.db!.prepare(`
      SELECT name, file_path, kind, semantic_tags 
      FROM enhanced_symbols 
      WHERE name LIKE '%GenerateHeightMap%'
      OR name LIKE '%generateHeightMap%'
      OR semantic_tags LIKE '%height%map%'
      ORDER BY file_path
    `).all();

    console.log(`Found ${results.length} results for GenerateHeightMap`);
    
    if (results.length > 0) {
      // Group by file
      const fileGroups = new Map<string, any[]>();
      results.forEach((r: any) => {
        const file = path.basename(r.file_path);
        if (!fileGroups.has(file)) {
          fileGroups.set(file, []);
        }
        fileGroups.get(file)!.push(r);
      });
      
      console.log(`  Found in ${fileGroups.size} different files:`);
      for (const [file, symbols] of fileGroups) {
        console.log(`  - ${file}: ${symbols.length} symbol(s)`);
        symbols.forEach(s => {
          console.log(`    • ${s.name} (${s.kind})`);
        });
      }
      
      console.log(`  ✓ Multiple implementations: ${fileGroups.size > 1}`);
    } else {
      console.log('  ⚠️  No results found - semantic data may be incomplete');
    }
    console.log();
  }

  private async testSemanticRichness(): Promise<void> {
    console.log('📊 Analyzing overall semantic richness...');
    
    // Check how many symbols have semantic tags
    const totalSymbols = (this.db!.prepare(
      'SELECT COUNT(*) as count FROM enhanced_symbols'
    ).get() as any).count;
    
    const taggedSymbols = (this.db!.prepare(
      "SELECT COUNT(*) as count FROM enhanced_symbols WHERE semantic_tags IS NOT NULL AND semantic_tags != ''"
    ).get() as any).count;
    
    const percentage = totalSymbols > 0 ? (taggedSymbols / totalSymbols * 100).toFixed(1) : 0;
    
    console.log(`  Total symbols: ${totalSymbols}`);
    console.log(`  Tagged symbols: ${taggedSymbols} (${percentage}%)`);
    
    // Check semantic tag diversity
    const tagTypes = this.db!.prepare(`
      SELECT DISTINCT semantic_tags 
      FROM enhanced_symbols 
      WHERE semantic_tags IS NOT NULL AND semantic_tags != ''
      LIMIT 20
    `).all();
    
    console.log(`  Sample semantic tags:`);
    tagTypes.slice(0, 10).forEach((t: any) => {
      console.log(`    - ${t.semantic_tags}`);
    });
    
    // Check relationships
    const relationships = (this.db!.prepare(
      'SELECT COUNT(*) as count FROM semantic_connections'
    ).get() as any).count;
    
    console.log(`  Semantic connections: ${relationships}`);
    
    // Test a specific semantic query
    console.log('\n  Testing semantic query capabilities:');
    const gpuSymbols = this.db!.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE semantic_tags LIKE '%gpu%' 
         OR semantic_tags LIKE '%vulkan%'
         OR semantic_tags LIKE '%compute%shader%'
    `).get() as any;
    
    console.log(`    GPU-related symbols: ${gpuSymbols.count}`);
    
    const factorySymbols = this.db!.prepare(`
      SELECT COUNT(*) as count 
      FROM enhanced_symbols 
      WHERE semantic_tags LIKE '%factory%' 
         OR name LIKE '%Factory%'
         OR name LIKE '%Create%'
    `).get() as any;
    
    console.log(`    Factory pattern symbols: ${factorySymbols.count}`);
    
    console.log('\n  Summary:');
    if (percentage < 50) {
      console.log('  ⚠️  Semantic coverage is low - indexer may need enhancement');
    } else if (percentage < 80) {
      console.log('  🔶 Semantic coverage is moderate - some gaps remain');
    } else {
      console.log('  ✅ Good semantic coverage');
    }
  }

}