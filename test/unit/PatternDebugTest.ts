import { BaseTest } from '../helpers/BaseTest';
import { EnhancedTreeSitterParser } from '../../src/parsers/enhanced-tree-sitter-parser';
import * as fs from 'fs/promises';

export class PatternDebugTest extends BaseTest {
  private parser: EnhancedTreeSitterParser;

  constructor() {
    super('pattern-debug');
    this.parser = new EnhancedTreeSitterParser();
  }

  async specificSetup(): Promise<void> {
    await this.parser.initialize();
  }

  async specificTeardown(): Promise<void> {
    // No cleanup needed
  }

  async run(): Promise<void> {
    console.log('\n🔍 Debug: Pattern Detection Flow\n');
    
    // Test specific Vulkan file
    const vulkanFile = '/home/warxh/planet_procgen/src/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.cpp';
    
    try {
      await fs.access(vulkanFile);
      console.log(`📁 Testing file: ${vulkanFile}`);
      
      // Parse with enhanced parser
      const parseResult = await this.parser.parseFile(vulkanFile);
      
      console.log('\n📊 Parse Result Summary:');
      console.log(`  - Methods: ${parseResult.methods.length}`);
      console.log(`  - Classes: ${parseResult.classes.length}`);
      console.log(`  - Patterns: ${parseResult.patterns.length}`);
      console.log(`  - Exports: ${parseResult.exports.length}`);
      
      if (parseResult.patterns.length > 0) {
        console.log('\n🎯 Detected Patterns:');
        parseResult.patterns.forEach(pattern => {
          console.log(`  • ${pattern.type}: ${pattern.name}`);
          console.log(`    - Confidence: ${pattern.confidence}`);
          console.log(`    - Methods: ${pattern.details?.methods?.length || 0}`);
          if (pattern.details?.methods?.length > 0) {
            console.log(`    - Sample methods: ${pattern.details.methods.slice(0, 3).join(', ')}`);
          }
        });
      }
      
      if (parseResult.methods.length > 0) {
        console.log('\n🔧 Sample Methods:');
        parseResult.methods.slice(0, 5).forEach(method => {
          console.log(`  • ${method.name} (${method.returnType || 'void'})`);
        });
      }
      
      // Test pattern matching specifically
      console.log('\n🧪 Testing Pattern Matching Logic:');
      
      // Test if our pattern detection criteria work
      const sampleMethods = parseResult.methods.slice(0, 10);
      for (const method of sampleMethods) {
        const name = method.name.toLowerCase();
        const matchesGPU = /vulkan|gpu|compute|shader|buffer|vk_|render/i.test(method.name);
        const matchesPerformance = /performance|metric|measure|monitor|profile|timing|benchmark/i.test(method.name);
        const matchesMemory = /allocate|deallocate|malloc|free|memory|buffer|pool/i.test(method.name);
        
        if (matchesGPU || matchesPerformance || matchesMemory) {
          console.log(`  ✅ ${method.name}: GPU=${matchesGPU}, Perf=${matchesPerformance}, Mem=${matchesMemory}`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Error testing file: ${error}`);
    }
  }
}