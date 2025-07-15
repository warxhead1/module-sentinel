import { BaseTest } from '../helpers/BaseTest';
import { EnhancedTreeSitterParser } from '../../src/parsers/enhanced-tree-sitter-parser';
import { GrammarAwareParser } from '../../src/parsers/grammar-aware-parser';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

export class ParserAnalysisTest extends BaseTest {
  private treeParser: EnhancedTreeSitterParser;
  private grammarParser: GrammarAwareParser;
  private db: Database.Database | null = null;

  constructor(sharedDbPath: string = 'module-sentinel.db') {
    super('parser-analysis');
    this.treeParser = new EnhancedTreeSitterParser();
    this.grammarParser = new GrammarAwareParser(false);
    this.db = new Database(sharedDbPath, { readonly: true });
  }

  async specificSetup(): Promise<void> {
    await this.treeParser.initialize();
    await this.grammarParser.initialize();
  }

  async specificTeardown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async run(): Promise<void> {
    console.log('\n🔍 Analyzing Parser Data Flow and Semantic Loss\n');
    
    await this.testVulkanFile();
    await this.testFactoryFile();
    await this.testMountainProcessorFile();
    await this.compareParserOutputs();
  }

  private async testVulkanFile(): Promise<void> {
    console.log('📍 Testing Vulkan file parsing (expecting GPU/Vulkan semantics)...');
    
    const vulkanFile = '/home/warxh/planet_procgen/src/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.cpp';
    
    try {
      await fs.access(vulkanFile);
      console.log(`  ✅ Found file: ${path.basename(vulkanFile)}`);
      
      // Test EnhancedTreeSitterParser directly
      console.log('\n  🌳 Testing EnhancedTreeSitterParser:');
      const treeResult = await this.treeParser.parseFile(vulkanFile);
      
      console.log(`    - Methods: ${treeResult.methods.length}`);
      console.log(`    - Classes: ${treeResult.classes.length}`);
      console.log(`    - Patterns: ${treeResult.patterns.length}`);
      console.log(`    - Relationships: ${treeResult.relationships.length}`);
      console.log(`    - Exports: ${treeResult.exports.length}`);
      
      // Show sample patterns and relationships
      if (treeResult.patterns.length > 0) {
        console.log(`    - Sample patterns:`);
        treeResult.patterns.slice(0, 3).forEach(p => {
          console.log(`      • ${p.type}: ${p.name} (confidence: ${p.confidence})`);
        });
      }
      
      if (treeResult.relationships.length > 0) {
        console.log(`    - Sample relationships:`);
        treeResult.relationships.slice(0, 3).forEach(r => {
          console.log(`      • ${r.source} ${r.type} ${r.target}`);
        });
      }
      
      // Check what's actually in the database for this file
      console.log('\n  💾 Checking database content:');
      const dbSymbols = this.db!.prepare(`
        SELECT name, kind, semantic_tags, file_path
        FROM enhanced_symbols 
        WHERE file_path LIKE '%VulkanTerrainCoherenceProcessor%'
        LIMIT 10
      `).all();
      
      console.log(`    - Database symbols: ${dbSymbols.length}`);
      if (dbSymbols.length > 0) {
        dbSymbols.forEach((s: any) => {
          console.log(`      • ${s.name} (${s.kind}) - tags: ${s.semantic_tags}`);
        });
      }
      
      // Check for Vulkan-specific content
      const vulkanKeywords = ['vulkan', 'vk', 'gpu', 'compute', 'shader', 'buffer'];
      let hasVulkanContent = false;
      
      for (const method of treeResult.methods) {
        const methodText = method.name.toLowerCase();
        if (vulkanKeywords.some(kw => methodText.includes(kw))) {
          hasVulkanContent = true;
          console.log(`    ✅ Found Vulkan content: ${method.name}`);
        }
      }
      
      if (!hasVulkanContent) {
        console.log(`    ⚠️  No obvious Vulkan patterns detected in method names`);
      }
      
    } catch (error) {
      console.log(`  ❌ Could not test Vulkan file: ${error}`);
    }
    console.log();
  }

  private async testFactoryFile(): Promise<void> {
    console.log('📍 Testing Factory pattern detection...');
    
    const factoryFile = '/home/warxh/planet_procgen/include/Generation/Pipeline/PipelineFactory.ixx';
    
    try {
      await fs.access(factoryFile);
      console.log(`  ✅ Found file: ${path.basename(factoryFile)}`);
      
      // Test pattern detection
      const treeResult = await this.treeParser.parseFile(factoryFile);
      
      console.log(`    - Methods: ${treeResult.methods.length}`);
      console.log(`    - Classes: ${treeResult.classes.length}`);
      console.log(`    - Patterns detected: ${treeResult.patterns.length}`);
      
      // Look for factory patterns specifically
      const factoryPatterns = treeResult.patterns.filter(p => 
        p.type === 'Factory' || p.name.includes('Factory')
      );
      
      if (factoryPatterns.length > 0) {
        console.log(`    ✅ Factory patterns detected:`);
        factoryPatterns.forEach(p => {
          console.log(`      • ${p.name}: ${JSON.stringify(p.details)}`);
        });
      } else {
        console.log(`    ⚠️  No factory patterns detected`);
      }
      
      // Look for create methods
      const createMethods = treeResult.methods.filter(m => 
        m.name.toLowerCase().includes('create')
      );
      
      if (createMethods.length > 0) {
        console.log(`    ✅ Create methods found:`);
        createMethods.forEach(m => {
          console.log(`      • ${m.name}: ${m.returnType}`);
        });
      }
      
      // Check database
      const dbSymbols = this.db!.prepare(`
        SELECT name, kind, semantic_tags
        FROM enhanced_symbols 
        WHERE file_path LIKE '%PipelineFactory%'
      `).all();
      
      console.log(`    - Database symbols: ${dbSymbols.length}`);
      const taggedSymbols = dbSymbols.filter((s: any) => 
        s.semantic_tags && s.semantic_tags !== '[]'
      );
      console.log(`    - Tagged symbols: ${taggedSymbols.length}`);
      
    } catch (error) {
      console.log(`  ❌ Could not test Factory file: ${error}`);
    }
    console.log();
  }

  private async testMountainProcessorFile(): Promise<void> {
    console.log('📍 Testing MountainProcessor file (ProcessMountainOperation)...');
    
    // Find MountainProcessor file
    const dbResult = this.db!.prepare(`
      SELECT file_path 
      FROM enhanced_symbols 
      WHERE name = 'ProcessMountainOperation'
      LIMIT 1
    `).get() as any;
    
    if (!dbResult) {
      console.log('  ❌ ProcessMountainOperation not found in database');
      return;
    }
    
    const filePath = dbResult.file_path;
    console.log(`  ✅ Found file: ${path.basename(filePath)}`);
    
    try {
      // Test parser directly
      const treeResult = await this.treeParser.parseFile(filePath);
      
      // Find ProcessMountainOperation method
      const targetMethod = treeResult.methods.find(m => 
        m.name === 'ProcessMountainOperation'
      );
      
      if (targetMethod) {
        console.log(`    ✅ Parser found ProcessMountainOperation:`);
        console.log(`      - Return type: ${targetMethod.returnType}`);
        console.log(`      - Parameters: ${targetMethod.parameters.length}`);
        console.log(`      - Namespace: ${targetMethod.namespace || 'none'}`);
        console.log(`      - Class: ${targetMethod.className || 'none'}`);
        console.log(`      - Qualified name: ${targetMethod.qualifiedName || 'none'}`);
      } else {
        console.log(`    ❌ Parser did not find ProcessMountainOperation`);
      }
      
      // Check what patterns were detected
      console.log(`    - Total patterns detected: ${treeResult.patterns.length}`);
      if (treeResult.patterns.length > 0) {
        treeResult.patterns.forEach(p => {
          console.log(`      • Pattern: ${p.type} - ${p.name}`);
        });
      }
      
      // Check database semantic tags
      const dbMethod = this.db!.prepare(`
        SELECT name, semantic_tags 
        FROM enhanced_symbols 
        WHERE name = 'ProcessMountainOperation'
      `).get() as any;
      
      if (dbMethod) {
        console.log(`    - Database semantic tags: ${dbMethod.semantic_tags}`);
      }
      
    } catch (error) {
      console.log(`  ❌ Could not parse file: ${error}`);
    }
    console.log();
  }

  private async compareParserOutputs(): Promise<void> {
    console.log('📊 Comparing parser semantic richness...');
    
    // Test both parsers on the same file
    const testFile = '/home/warxh/planet_procgen/src/Core/Performance/WaterTerrainDebugMetrics.cpp';
    
    try {
      await fs.access(testFile);
      console.log(`  📁 Testing file: ${path.basename(testFile)}`);
      
      // Test EnhancedTreeSitterParser
      console.log('\n  🌳 EnhancedTreeSitterParser results:');
      const treeResult = await this.treeParser.parseFile(testFile);
      this.printParserSummary('Tree-sitter', treeResult);
      
      // Test GrammarAwareParser  
      console.log('\n  📝 GrammarAwareParser results:');
      const grammarResult = await this.grammarParser.parseFile(testFile);
      this.printParserSummary('Grammar-aware', grammarResult);
      
      // Compare semantic richness
      console.log('\n  📈 Semantic richness comparison:');
      console.log(`    Tree-sitter patterns: ${treeResult.patterns?.length || 0}`);
      console.log(`    Grammar-aware patterns: ${grammarResult.patterns?.length || 0}`);
      console.log(`    Tree-sitter relationships: ${treeResult.relationships?.length || 0}`);
      console.log(`    Grammar-aware relationships: ${grammarResult.relationships?.length || 0}`);
      
      // Check which parser would be selected by the worker
      const fileStats = await fs.stat(testFile);
      const fileSize = fileStats.size;
      const isLarge = fileSize > 256 * 1024; // 256KB threshold
      
      console.log(`\n  ⚙️  Parser selection logic:`);
      console.log(`    File size: ${Math.round(fileSize / 1024)}KB`);
      console.log(`    Would use grammar-aware: ${isLarge ? 'Yes' : 'No'}`);
      console.log(`    Selected parser: ${isLarge ? 'Grammar-aware' : 'Tree-sitter'}`);
      
    } catch (error) {
      console.log(`  ❌ Could not compare parsers: ${error}`);
    }
  }

  private printParserSummary(parserName: string, result: any): void {
    console.log(`    ${parserName}:`);
    console.log(`      - Methods: ${result.methods?.length || 0}`);
    console.log(`      - Classes: ${result.classes?.length || 0}`);
    console.log(`      - Patterns: ${result.patterns?.length || 0}`);
    console.log(`      - Relationships: ${result.relationships?.length || 0}`);
    console.log(`      - Exports: ${result.exports?.length || 0}`);
    console.log(`      - Imports: ${result.imports?.length || 0}`);
    
    // Show sample method names to check for semantic content
    if (result.methods && result.methods.length > 0) {
      const methodNames = result.methods.slice(0, 3).map((m: any) => m.name).join(', ');
      console.log(`      - Sample methods: ${methodNames}`);
    }
  }
}