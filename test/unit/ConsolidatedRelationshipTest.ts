import { BaseTest } from '../helpers/BaseTest';
import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Consolidated Relationship Test
 * 
 * Combines relationship extraction testing from:
 * - RelationshipExtractionTest: Core relationship types
 * - CrossFileRelationshipTest: Cross-file attribution and call flows
 * - ComplexRelationshipTest: Complex scenarios and edge cases
 */
export class ConsolidatedRelationshipTest extends BaseTest {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    super('consolidated-relationship');
    this.dbPath = dbPath;
  }

  async specificSetup(): Promise<void> {
    // Use the shared test database
    this.db = new Database(this.dbPath);
  }

  async specificTeardown(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  async run(): Promise<void> {
    console.log('\n🔗 Consolidated Relationship Analysis Test');
    console.log('=' + '='.repeat(50));

    // Test 1: Core Relationship Types
    await this.testCoreRelationshipTypes();

    // Test 2: Cross-File Analysis
    await this.testCrossFileRelationships();

    // Test 3: Complex Scenarios
    await this.testComplexScenarios();

    // Test 4: Call Flow Connectivity
    await this.testCallFlowConnectivity();
  }

  /**
   * Test 1: Core relationship types (from RelationshipExtractionTest)
   */
  private async testCoreRelationshipTypes(): Promise<void> {
    console.log('\n📋 Test 1: Core Relationship Types');
    
    const relationshipTypes = [
      { type: 'imports', description: 'Module import relationships' },
      { type: 'calls', description: 'Function/method calls' },
      { type: 'inherits', description: 'Class inheritance' },
      { type: 'manages', description: 'Manager/component patterns' },
      { type: 'wraps', description: 'API wrapper functions' },
      { type: 'uses', description: 'Type usage relationships' },
      { type: 'member_of', description: 'Method/class membership' }
    ];

    // First, let's see what relationship types actually exist
    const allTypes = this.db.prepare(`
      SELECT relationship_type, COUNT(*) as count
      FROM symbol_relationships
      GROUP BY relationship_type
      ORDER BY count DESC
    `).all() as any[];

    console.log('\n  Actual relationship types in database:');
    for (const type of allTypes) {
      console.log(`    ${type.relationship_type}: ${type.count}`);
    }

    console.log('\n  Expected relationship types:');
    for (const relType of relationshipTypes) {
      const count = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM symbol_relationships 
        WHERE relationship_type = ?
      `).get(relType.type) as { count: number };

      console.log(`  ${relType.type}: ${count.count} relationships (${relType.description})`);
    }

    // Debug: Check if we have classes that should have inheritance
    const classesWithInheritance = this.db.prepare(`
      SELECT name, signature, file_path
      FROM enhanced_symbols
      WHERE kind = 'class' 
        AND signature LIKE '%:%'
      LIMIT 10
    `).all() as any[];

    if (classesWithInheritance.length > 0) {
      console.log('\n  Classes with inheritance signatures:');
      for (const cls of classesWithInheritance) {
        console.log(`    ${cls.name}: ${cls.signature}`);
      }
    }

    // Validate specific patterns
    this.validateManagerPatterns();
    this.validateInheritanceChains();
  }

  /**
   * Test 2: Cross-file relationships and attribution
   */
  private async testCrossFileRelationships(): Promise<void> {
    console.log('\n📋 Test 2: Cross-File Relationship Analysis');

    // Analyze cross-file relationships
    const crossFileStats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT sr.from_symbol_id || '-' || sr.to_symbol_id) as unique_relationships,
        COUNT(DISTINCT es1.file_path) as source_files,
        COUNT(DISTINCT es2.file_path) as target_files,
        COUNT(CASE WHEN es1.file_path != es2.file_path THEN 1 END) as cross_file_count
      FROM symbol_relationships sr
      JOIN enhanced_symbols es1 ON sr.from_symbol_id = es1.id
      JOIN enhanced_symbols es2 ON sr.to_symbol_id = es2.id
      WHERE sr.relationship_type IN ('calls', 'uses', 'imports')
    `).get() as any;

    console.log(`  Unique relationships: ${crossFileStats.unique_relationships}`);
    console.log(`  Source files: ${crossFileStats.source_files}`);
    console.log(`  Target files: ${crossFileStats.target_files}`);
    console.log(`  Cross-file relationships: ${crossFileStats.cross_file_count}`);

    // Method attribution validation
    this.validateMethodAttribution();
  }

  /**
   * Test 3: Complex scenarios and edge cases
   */
  private async testComplexScenarios(): Promise<void> {
    console.log('\n📋 Test 3: Complex Scenario Analysis');

    // Debug: Check if we have constructors at all
    const constructors = this.db.prepare(`
      SELECT name, parent_class, file_path
      FROM enhanced_symbols
      WHERE is_constructor = 1
      LIMIT 10
    `).all() as any[];

    console.log(`  Constructors in database: ${constructors.length}`);
    if (constructors.length > 0) {
      console.log('  Sample constructors:');
      for (const ctor of constructors.slice(0, 3)) {
        console.log(`    ${ctor.parent_class}::${ctor.name} in ${path.basename(ctor.file_path)}`);
      }
    }

    // Constructor relationships
    const constructorRelationships = this.db.prepare(`
      SELECT 
        es1.name as from_name,
        es2.name as to_name,
        sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols es1 ON sr.from_symbol_id = es1.id
      JOIN enhanced_symbols es2 ON sr.to_symbol_id = es2.id
      WHERE es1.is_constructor = 1
      LIMIT 10
    `).all() as any[];

    console.log(`  Constructor relationships found: ${constructorRelationships.length}`);

    // Duplicate detection via bodyHash
    const duplicateMethods = this.db.prepare(`
      SELECT 
        body_hash,
        COUNT(*) as count,
        GROUP_CONCAT(name, ', ') as method_names
      FROM enhanced_symbols
      WHERE body_hash IS NOT NULL
        AND kind = 'method'
      GROUP BY body_hash
      HAVING COUNT(*) > 1
      LIMIT 5
    `).all() as any[];

    console.log(`  Duplicate method signatures found: ${duplicateMethods.length}`);
    duplicateMethods.forEach(dup => {
      console.log(`    - ${dup.count} methods: ${dup.method_names}`);
    });
  }

  /**
   * Test 4: Call flow connectivity analysis
   */
  private async testCallFlowConnectivity(): Promise<void> {
    console.log('\n📋 Test 4: Call Flow Connectivity');

    // Find a good starting point
    const startSymbol = this.db.prepare(`
      SELECT id, name, qualified_name
      FROM enhanced_symbols
      WHERE kind = 'method'
        AND name LIKE '%Process%'
      LIMIT 1
    `).get() as any;

    if (startSymbol) {
      console.log(`  Analyzing call flow from: ${startSymbol.name}`);

      // Recursive CTE for call chain analysis
      const callChain = this.db.prepare(`
        WITH RECURSIVE call_chain AS (
          -- Base case
          SELECT 
            es1.id as caller_id,
            es1.name as caller_name,
            es2.id as callee_id,
            es2.name as callee_name,
            1 as depth
          FROM symbol_relationships sr
          JOIN enhanced_symbols es1 ON sr.from_symbol_id = es1.id
          JOIN enhanced_symbols es2 ON sr.to_symbol_id = es2.id
          WHERE sr.relationship_type = 'calls'
            AND es1.id = ?
          
          UNION ALL
          
          -- Recursive case
          SELECT 
            cc.caller_id,
            cc.caller_name,
            es2.id as callee_id,
            es2.name as callee_name,
            cc.depth + 1
          FROM call_chain cc
          JOIN symbol_relationships sr ON cc.callee_id = sr.from_symbol_id
          JOIN enhanced_symbols es2 ON sr.to_symbol_id = es2.id
          WHERE sr.relationship_type = 'calls'
            AND cc.depth < 5
        )
        SELECT DISTINCT callee_name, depth
        FROM call_chain
        ORDER BY depth, callee_name
      `).all(startSymbol.id) as any[];

      console.log(`  Call chain depth analysis:`);
      const depthCounts = new Map<number, number>();
      callChain.forEach(call => {
        depthCounts.set(call.depth, (depthCounts.get(call.depth) || 0) + 1);
      });
      
      for (const [depth, count] of depthCounts) {
        console.log(`    Depth ${depth}: ${count} methods`);
      }
    }
  }

  /**
   * Helper: Validate manager patterns
   */
  private validateManagerPatterns(): void {
    const managerPatterns = this.db.prepare(`
      SELECT 
        es1.name as manager,
        es2.name as component,
        sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols es1 ON sr.from_symbol_id = es1.id
      JOIN enhanced_symbols es2 ON sr.to_symbol_id = es2.id
      WHERE sr.relationship_type = 'manages'
      LIMIT 5
    `).all() as any[];

    if (managerPatterns.length > 0) {
      console.log('\n  Sample Manager Patterns:');
      managerPatterns.forEach(mp => {
        console.log(`    ${mp.manager} manages ${mp.component} (confidence: ${mp.confidence})`);
      });
    }
  }

  /**
   * Helper: Validate inheritance chains
   */
  private validateInheritanceChains(): void {
    const inheritanceChains = this.db.prepare(`
      SELECT 
        es1.name as child,
        es2.name as parent,
        es1.file_path
      FROM symbol_relationships sr
      JOIN enhanced_symbols es1 ON sr.from_symbol_id = es1.id
      JOIN enhanced_symbols es2 ON sr.to_symbol_id = es2.id
      WHERE sr.relationship_type = 'inherits'
      LIMIT 5
    `).all() as any[];

    if (inheritanceChains.length > 0) {
      console.log('\n  Sample Inheritance Chains:');
      inheritanceChains.forEach(ic => {
        console.log(`    ${ic.child} extends ${ic.parent}`);
      });
    }
  }

  /**
   * Helper: Validate method attribution
   */
  private validateMethodAttribution(): void {
    const misattributed = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM symbol_relationships sr
      WHERE sr.from_name NOT IN (
        SELECT name FROM enhanced_symbols WHERE id = sr.from_symbol_id
      )
    `).get() as { count: number };

    console.log(`\n  Method Attribution Validation:`);
    console.log(`    Misattributed relationships: ${misattributed.count}`);
    console.log(`    Attribution accuracy: ${misattributed.count === 0 ? '✅ 100%' : '⚠️  Needs correction'}`);
  }
}