import { BaseTest } from '../helpers/BaseTest';
import Database from 'better-sqlite3';
import { PatternAwareIndexer } from '../../dist/indexing/pattern-aware-indexer.js';
import * as path from 'path';

export class CrossFileRelationshipTest extends BaseTest {
  private dbPath: string;
  private projectPath = '/home/warxh/planet_procgen';
  
  constructor(dbPath: string) {
    super();
    this.dbPath = dbPath;
  }
  
  protected getTestName(): string {
    return 'Cross-File Relationship Analysis';
  }

  protected async runTests(): Promise<void> {
    const db = new Database(this.dbPath);
    
    try {
      // Test 1: Check current state of VisualFeedbackApplication relationships
      await this.test('Current relationship attribution analysis', async () => {
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
        
        return initRelations.length > 0;
      });

      // Test 2: Re-analyze specific critical files
      await this.test('Re-analyze VisualFeedbackApplication with fixed analyzer', async () => {
        console.log('\n  Re-analyzing critical files with fixed cross-file analyzer...');
        
        const indexer = new PatternAwareIndexer(this.projectPath, this.dbPath);
        
        // Focus on the VisualFeedbackApplication files
        const criticalFiles = [
          path.join(this.projectPath, 'src/Application/Feedback/VisualFeedbackApplication.cpp'),
          path.join(this.projectPath, 'include/Application/Feedback/VisualFeedbackApplication.ixx')
        ];
        
        // Re-index these specific files
        await indexer.indexFiles(criticalFiles);
        
        console.log('  Re-indexing complete');
        return true;
      });

      // Test 3: Verify relationships after re-analysis
      await this.test('Verify corrected relationships', async () => {
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

        return initRelationships.length > 5; // Should have many relationships
      });

      // Test 4: Analyze call flow connectivity
      await this.test('Call flow connectivity analysis', async () => {
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

        return flowAnalysis.length > 0;
      });

      // Test 5: Detailed method attribution validation
      await this.test('Method attribution validation', async () => {
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

        return initializeCount > constructorCount;
      });

    } finally {
      db.close();
    }
  }
}