import { BaseTest } from '../helpers/BaseTest';
import Database from 'better-sqlite3';
import { PatternAwareIndexer } from '../../dist/indexing/pattern-aware-indexer.js';
import * as path from 'path';

export class CrossFileRelationshipTest extends BaseTest {
  private dbPath: string;
  
  constructor(dbPath: string) {
    super('cross-file-relationship');
    this.dbPath = dbPath;
  }
  
  async specificSetup(): Promise<void> {
    // Setup is handled by the main database
  }
  
  async specificTeardown(): Promise<void> {
    // Cleanup handled by caller
  }

  async run(): Promise<void> {
    const db = new Database(this.dbPath);
    
    try {
      // Test 1: Check current state of VisualFeedbackApplication relationships
      console.log('\n📋 Test 1: Current relationship attribution analysis');
      await (async () => {
        const relationships = db.prepare(`
          SELECT 
            s1.name as from_symbol,
            s1.qualified_name as from_qualified,
            s1.line as from_line,
            s2.name as to_symbol,
            s2.qualified_name as to_qualified,
            sr.line_number,
            sr.source_text
          FROM symbol_relationships sr
          JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
          JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
          WHERE s1.file_path LIKE '%VisualFeedbackApplication.cpp%'
            AND s1.parent_class = 'VisualFeedbackApplication'
          ORDER BY sr.line_number
          LIMIT 20
        `).all() as any[];

        console.log(`\n  Current relationships from VisualFeedbackApplication methods:`);
        relationships.forEach(r => {
          console.log(`    Line ${r.line_number}: ${r.from_qualified} -> ${r.to_qualified}`);
          if (r.source_text) {
            console.log(`      Source: ${r.source_text.trim()}`);
          }
        });

        // Check specifically for Initialize method
        const initRelations = relationships.filter(r => r.from_symbol === 'Initialize');
        console.log(`\n  Initialize method has ${initRelations.length} relationships`);
        
        console.log(`✅ Test 1 ${initRelations.length > 0 ? 'PASSED' : 'FAILED'}: Found ${initRelations.length} Initialize relationships`);
      })();

      // Test 2: Re-analyze specific critical files
      console.log('\n📋 Test 2: Re-analyze VisualFeedbackApplication with fixed analyzer');
      await (async () => {
        console.log('\n  Re-analyzing critical files with fixed cross-file analyzer...');
        
        const indexer = new PatternAwareIndexer('/home/warxh/planet_procgen', this.dbPath);
        
        // Focus on the VisualFeedbackApplication files
        const criticalFiles = [
          path.join('/home/warxh/planet_procgen', 'src/Application/Feedback/VisualFeedbackApplication.cpp'),
          path.join('/home/warxh/planet_procgen', 'include/Application/Feedback/VisualFeedbackApplication.ixx')
        ];
        
        // Re-index these specific files
        await indexer.indexFiles(criticalFiles);
        
        // Close the indexer to cleanup resources
        indexer.close();
        
        console.log('  Re-indexing complete');
        console.log(`✅ Test 2 PASSED: Re-indexed ${criticalFiles.length} critical files`);
      })();

      // Test 3: Verify relationships after re-analysis
      console.log('\n📋 Test 3: Verify corrected relationships');
      await (async () => {
        // Check Initialize method relationships after fix
        const initRelationships = db.prepare(`
          SELECT 
            s2.qualified_name as target,
            sr.line_number,
            sr.confidence,
            sr.source_text
          FROM symbol_relationships sr
          JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
          JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
          WHERE s1.qualified_name = 'VisualFeedbackApplication::Initialize'
            AND sr.relationship_type IN ('calls', 'uses', 'creates')
          ORDER BY sr.line_number
        `).all() as any[];

        console.log(`\n  Initialize method relationships after re-analysis:`);
        initRelationships.forEach(r => {
          console.log(`    Line ${r.line_number}: -> ${r.target} (confidence: ${r.confidence})`);
        });

        // Verify key relationships exist
        const hasLogger = initRelationships.some(r => r.target.includes('Logger::getInstance'));
        const hasGPU = initRelationships.some(r => r.target.includes('GPUInfrastructureManager'));
        const hasGUI = initRelationships.some(r => r.target.includes('InitializeGUI'));

        console.log(`\n  Key relationships found:`);
        console.log(`    Logger::getInstance: ${hasLogger ? '✓' : '✗'}`);
        console.log(`    GPUInfrastructureManager: ${hasGPU ? '✓' : '✗'}`);
        console.log(`    InitializeGUI: ${hasGUI ? '✓' : '✗'}`);

        const passed = initRelationships.length > 5;
        console.log(`✅ Test 3 ${passed ? 'PASSED' : 'FAILED'}: Found ${initRelationships.length} relationships (expected >5)`);
      })();

      // Test 4: Analyze call flow connectivity
      console.log('\n📋 Test 4: Call flow connectivity analysis');
      await (async () => {
        // Check if we can trace from Initialize to key subsystems
        const flowAnalysis = db.prepare(`
          WITH RECURSIVE call_flow AS (
            -- Start from Initialize method
            SELECT 
              s1.id as from_id,
              s1.qualified_name as from_name,
              s2.id as to_id,
              s2.qualified_name as to_name,
              s2.pipeline_stage as stage,
              1 as depth
            FROM symbol_relationships sr
            JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
            JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
            WHERE s1.qualified_name = 'VisualFeedbackApplication::Initialize'
              AND sr.relationship_type IN ('calls', 'uses', 'creates')
              
            UNION
            
            -- Recursively follow calls
            SELECT 
              cf.to_id as from_id,
              cf.to_name as from_name,
              s2.id as to_id,
              s2.qualified_name as to_name,
              s2.pipeline_stage as stage,
              cf.depth + 1 as depth
            FROM call_flow cf
            JOIN symbol_relationships sr ON sr.from_symbol_id = cf.to_id
            JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
            WHERE cf.depth < 5
              AND sr.relationship_type IN ('calls', 'uses', 'creates')
          )
          SELECT DISTINCT stage, COUNT(*) as count
          FROM call_flow
          WHERE stage IS NOT NULL
          GROUP BY stage
        `).all() as any[];

        console.log(`\n  Pipeline stages reachable from Initialize:`);
        flowAnalysis.forEach(f => {
          console.log(`    ${f.stage}: ${f.count} connections`);
        });

        const passed = flowAnalysis.length > 0;
        console.log(`✅ Test 4 ${passed ? 'PASSED' : 'FAILED'}: Found ${flowAnalysis.length} pipeline stages`);
      })();

      // Test 5: Detailed method attribution validation
      console.log('\n📋 Test 5: Method attribution validation');
      await (async () => {
        // Get all methods and their line ranges
        const methods = db.prepare(`
          SELECT 
            id,
            name,
            qualified_name,
            line,
            file_path
          FROM enhanced_symbols
          WHERE parent_class = 'VisualFeedbackApplication'
            AND kind IN ('method', 'function', 'constructor', 'destructor')
          ORDER BY line
        `).all() as any[];

        console.log(`\n  VisualFeedbackApplication methods:`);
        methods.forEach(m => {
          console.log(`    ${m.qualified_name} at line ${m.line}`);
        });

        // Check relationships per method
        const relationshipCounts = db.prepare(`
          SELECT 
            s1.qualified_name as method,
            COUNT(*) as relationship_count
          FROM symbol_relationships sr
          JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
          WHERE s1.parent_class = 'VisualFeedbackApplication'
          GROUP BY s1.qualified_name
          ORDER BY s1.line
        `).all() as any[];

        console.log(`\n  Relationships per method:`);
        relationshipCounts.forEach(r => {
          console.log(`    ${r.method}: ${r.relationship_count} relationships`);
        });

        // Verify Initialize has more relationships than constructor
        const constructorCount = relationshipCounts.find(r => 
          r.method === 'VisualFeedbackApplication::VisualFeedbackApplication')?.relationship_count || 0;
        const initializeCount = relationshipCounts.find(r => 
          r.method === 'VisualFeedbackApplication::Initialize')?.relationship_count || 0;

        console.log(`\n  Attribution check:`);
        console.log(`    Constructor relationships: ${constructorCount}`);
        console.log(`    Initialize relationships: ${initializeCount}`);
        console.log(`    Correctly attributed: ${initializeCount > constructorCount ? '✓' : '✗'}`);

        const passed = initializeCount > constructorCount;
        console.log(`✅ Test 5 ${passed ? 'PASSED' : 'FAILED'}: Correctly attributed (${initializeCount} > ${constructorCount})`);
      })();

    } finally {
      db.close();
    }
  }
}