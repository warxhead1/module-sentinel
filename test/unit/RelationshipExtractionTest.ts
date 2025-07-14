import { BaseTest } from '../helpers/BaseTest';
import { PatternAwareIndexer } from '../../dist/indexing/pattern-aware-indexer.js';
import Database from 'better-sqlite3';
import * as path from 'path';

export class RelationshipExtractionTest extends BaseTest {
  private indexer: PatternAwareIndexer | null = null;
  private sharedDbPath: string;
  private testFiles = [
    // Real project files that should have rich relationships
    'src/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.cpp',
    'src/Rendering/Vulkan/Pipeline/PipelineFactory.cpp',
    'src/Rendering/Vulkan/Pipeline/VulkanPipelineManager.cpp',
    'include/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.ixx',
    'include/Rendering/Vulkan/Pipeline/PipelineFactory.ixx'
  ];

  constructor(sharedDbPath: string = '.test-db/main/pattern-aware.db') {
    super('relationship-extraction');
    this.sharedDbPath = sharedDbPath;
  }

  async specificSetup(): Promise<void> {
    this.indexer = new PatternAwareIndexer(this.projectPath, this.sharedDbPath);
  }

  async specificTeardown(): Promise<void> {
    if (this.indexer) {
      this.indexer.close();
    }
  }

  async run(): Promise<void> {
    console.log('\n📋 Test 1: Import/Export Relationships');
    await this.testImportExportRelationships();
    
    console.log('\n📋 Test 2: Function Call Relationships');
    await this.testFunctionCallRelationships();
    
    console.log('\n📋 Test 3: Class Inheritance Relationships');
    await this.testInheritanceRelationships();
    
    console.log('\n📋 Test 4: Manager/Component Relationships');
    await this.testManagerComponentRelationships();
    
    console.log('\n📋 Test 5: Vulkan API Wrapper Relationships');
    await this.testVulkanApiRelationships();
    
    console.log('\n📋 Test 6: Same-Class Method Call Relationships');
    await this.testSameClassMethodCalls();
    
    console.log('\n📋 Test 7: Cross-File Relationship Context');
    await this.testCrossFileRelationships();
  }

  private async testImportExportRelationships(): Promise<void> {
    console.log('Testing import/export relationship extraction...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test that VulkanTerrainCoherenceProcessor imports are captured
    const importRelationships = db.prepare(`
      SELECT s1.name as from_symbol, s1.file_path as from_file,
             s2.name as to_symbol, sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.relationship_type = 'imports'
        AND s1.file_path LIKE '%VulkanTerrainCoherenceProcessor%'
      LIMIT 10
    `).all();
    
    console.log(`  Found ${importRelationships.length} import relationships`);
    
    // Test specific expected imports
    const expectedImports = ['VulkanBase', 'BufferCore', 'DescriptorManager'];
    let foundExpected = 0;
    
    for (const relationship of importRelationships as any[]) {
      if (expectedImports.includes(relationship.to_symbol)) {
        foundExpected++;
        console.log(`  ✓ ${relationship.from_symbol} imports ${relationship.to_symbol}`);
      }
    }
    
    console.log(`  Found ${foundExpected}/${expectedImports.length} expected imports`);
    
    db.close();
  }

  private async testFunctionCallRelationships(): Promise<void> {
    console.log('Testing function call relationship extraction...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test ProcessTerrainUnified -> ProcessTerrain relationship
    const processTerrainCalls = db.prepare(`
      SELECT s1.name as caller, s1.parent_class as caller_class, s1.file_path as caller_file,
             s2.name as called, s2.parent_class as called_class, s2.file_path as called_file,
             sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.relationship_type = 'calls'
        AND ((s1.name = 'ProcessTerrainUnified' AND s2.name = 'ProcessTerrain')
             OR (s1.name LIKE '%Initialize%' AND s2.name LIKE '%Create%'))
      ORDER BY sr.confidence DESC
    `).all();
    
    console.log(`  Found ${processTerrainCalls.length} specific call relationships`);
    
    for (const call of processTerrainCalls as any[]) {
      console.log(`  ✓ ${call.caller}(${call.caller_class}) -> ${call.called}(${call.called_class}) [confidence: ${call.confidence}]`);
      
      // Verify both methods are in the same class context when expected
      if (call.caller === 'ProcessTerrainUnified' && call.called === 'ProcessTerrain') {
        if (call.caller_class === call.called_class && call.caller_class === 'VulkanTerrainCoherenceProcessor') {
          console.log(`    ✓ Correct class context: ${call.caller_class}`);
        } else {
          console.log(`    ⚠️  Class context mismatch: ${call.caller_class} vs ${call.called_class}`);
        }
      }
    }
    
    db.close();
  }

  private async testInheritanceRelationships(): Promise<void> {
    console.log('Testing inheritance relationship extraction...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test inheritance relationships
    const inheritanceRelationships = db.prepare(`
      SELECT s1.name as derived_class, s1.file_path as derived_file,
             s2.name as base_class, s2.file_path as base_file,
             sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.relationship_type = 'inherits'
      ORDER BY sr.confidence DESC
      LIMIT 10
    `).all();
    
    console.log(`  Found ${inheritanceRelationships.length} inheritance relationships`);
    
    for (const inheritance of inheritanceRelationships as any[]) {
      console.log(`  ✓ ${inheritance.derived_class} inherits from ${inheritance.base_class} [confidence: ${inheritance.confidence}]`);
    }
    
    db.close();
  }

  private async testManagerComponentRelationships(): Promise<void> {
    console.log('Testing manager/component relationship extraction...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test that PipelineManager manages pipeline-related components
    const managerRelationships = db.prepare(`
      SELECT s1.name as manager, s1.file_path as manager_file,
             s2.name as managed, s2.file_path as managed_file,
             sr.relationship_type, sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.relationship_type IN ('manages', 'uses')
        AND (s1.name LIKE '%Manager%' OR s1.name LIKE '%Factory%')
      ORDER BY sr.confidence DESC
      LIMIT 10
    `).all();
    
    console.log(`  Found ${managerRelationships.length} manager/component relationships`);
    
    for (const relationship of managerRelationships as any[]) {
      console.log(`  ✓ ${relationship.manager} ${relationship.relationship_type} ${relationship.managed} [confidence: ${relationship.confidence}]`);
    }
    
    db.close();
  }

  private async testVulkanApiRelationships(): Promise<void> {
    console.log('Testing Vulkan API wrapper relationship extraction...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test that wrapper functions call Vulkan API functions
    const vulkanApiCalls = db.prepare(`
      SELECT s1.name as wrapper, s1.parent_class as wrapper_class, s1.file_path as wrapper_file,
             s2.name as api_func, s2.file_path as api_file,
             sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.relationship_type = 'calls'
        AND s2.name LIKE 'vk%'
      ORDER BY sr.confidence DESC
      LIMIT 10
    `).all();
    
    console.log(`  Found ${vulkanApiCalls.length} Vulkan API call relationships`);
    
    // Check for specific expected API calls
    const expectedApiCalls = ['vkCreateComputePipelines', 'vkCreateGraphicsPipelines', 'vkCreateBuffer'];
    let foundApiCalls = 0;
    
    for (const call of vulkanApiCalls as any[]) {
      console.log(`  ✓ ${call.wrapper}(${call.wrapper_class}) -> ${call.api_func} [confidence: ${call.confidence}]`);
      
      if (expectedApiCalls.includes(call.api_func)) {
        foundApiCalls++;
      }
    }
    
    console.log(`  Found ${foundApiCalls}/${expectedApiCalls.length} expected Vulkan API calls`);
    
    db.close();
  }

  private async testSameClassMethodCalls(): Promise<void> {
    console.log('Testing same-class method call relationships...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test that methods within the same class call each other
    const sameClassCalls = db.prepare(`
      SELECT s1.name as caller, s2.name as called, 
             s1.parent_class as class_name, s1.file_path as file_path,
             sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE sr.relationship_type = 'calls'
        AND s1.parent_class = s2.parent_class
        AND s1.parent_class IS NOT NULL
        AND s1.parent_class != ''
      ORDER BY sr.confidence DESC
      LIMIT 15
    `).all();
    
    console.log(`  Found ${sameClassCalls.length} same-class method calls`);
    
    // Group by class to show calling patterns
    const classCalls = new Map<string, any[]>();
    for (const call of sameClassCalls as any[]) {
      const className = call.class_name;
      if (!classCalls.has(className)) {
        classCalls.set(className, []);
      }
      classCalls.get(className)!.push(call);
    }
    
    for (const [className, calls] of classCalls) {
      console.log(`  📁 ${className}:`);
      for (const call of calls.slice(0, 3)) { // Show first 3 per class
        console.log(`    ✓ ${call.caller} -> ${call.called} [confidence: ${call.confidence}]`);
      }
    }
    
    db.close();
  }

  private async testCrossFileRelationships(): Promise<void> {
    console.log('Testing cross-file relationship context preservation...');
    
    const db = new Database(this.sharedDbPath);
    
    // Test that relationships properly preserve file context
    const crossFileRelationships = db.prepare(`
      SELECT s1.name as from_symbol, s1.file_path as from_file,
             s2.name as to_symbol, s2.file_path as to_file,
             sr.relationship_type, sr.confidence
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.file_path != s2.file_path
        AND sr.relationship_type IN ('calls', 'uses', 'imports')
      ORDER BY sr.confidence DESC
      LIMIT 10
    `).all();
    
    console.log(`  Found ${crossFileRelationships.length} cross-file relationships`);
    
    for (const relationship of crossFileRelationships as any[]) {
      const fromFile = path.basename(relationship.from_file);
      const toFile = path.basename(relationship.to_file);
      console.log(`  ✓ ${relationship.from_symbol}@${fromFile} ${relationship.relationship_type} ${relationship.to_symbol}@${toFile}`);
      console.log(`    [confidence: ${relationship.confidence}]`);
    }
    
    // Verify specific expected cross-file relationships
    const expectedCrossFile = [
      { type: 'imports', from: 'VulkanTerrainCoherenceProcessor', to: 'VulkanBase' },
      { type: 'calls', from: 'PipelineFactory', to: 'VulkanPipelineManager' }
    ];
    
    let foundExpected = 0;
    for (const expected of expectedCrossFile) {
      const found = (crossFileRelationships as any[]).some(rel => 
        rel.relationship_type === expected.type &&
        rel.from_symbol.includes(expected.from) &&
        rel.to_symbol.includes(expected.to)
      );
      if (found) {
        foundExpected++;
        console.log(`  ✓ Expected relationship found: ${expected.from} ${expected.type} ${expected.to}`);
      }
    }
    
    console.log(`  Found ${foundExpected}/${expectedCrossFile.length} expected cross-file relationships`);
    
    db.close();
  }
}