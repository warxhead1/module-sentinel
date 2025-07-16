import { UnifiedCppParser } from '../../src/parsers/unified-cpp-parser.js';
import { BaseTest } from '../helpers/BaseTest.js';
import * as path from 'path';

/**
 * Test the unified parser functionality
 */
export class UnifiedParserTest extends BaseTest {
  private parser: UnifiedCppParser;

  constructor() {
    super('unified-parser-test');
    this.parser = new UnifiedCppParser({
      enableModuleAnalysis: true,
      enableSemanticAnalysis: true,
      enableTypeAnalysis: true,
      debugMode: false,
      projectPath: process.cwd()
    });
  }

  async specificSetup(): Promise<void> {
    // Initialize the parser
    await this.parser.initialize();
  }

  async specificTeardown(): Promise<void> {
    // No specific teardown needed
  }

  async run(): Promise<void> {
    console.log('\n🚀 Testing Unified Parser...');
    
    // Test files from the complex-files directory
    const testFiles = [
      path.join(process.cwd(), 'test/complex-files/ixx/VulkanTypes.ixx'),
      path.join(process.cwd(), 'test/complex-files/ixx/RenderingTypes.ixx'),
      path.join(process.cwd(), 'test/complex-files/cpp/VulkanPipelineCreator.cpp'),
      path.join(process.cwd(), 'test/complex-files/cpp/VulkanPipelineManager.cpp')
    ];

    let totalParsed = 0;
    let totalSymbols = 0;
    let totalRelationships = 0;
    let totalPatterns = 0;
    let totalConfidence = 0;

    for (const filePath of testFiles) {
      try {
        console.log(`\n🔬 Parsing: ${path.basename(filePath)}`);
        
        const result = await this.parser.parseFile(filePath);
        
        const confidence = result.confidence?.overall || 0;
        const methods = result.methods?.length || 0;
        const classes = result.classes?.length || 0;
        const patterns = result.patterns?.length || 0;
        const relationships = result.relationships?.length || 0;
        
        console.log(`   ✅ Confidence: ${(confidence * 100).toFixed(1)}%`);
        console.log(`   📊 Methods: ${methods}, Classes: ${classes}`);
        console.log(`   🔗 Relationships: ${relationships}, Patterns: ${patterns}`);
        
        totalParsed++;
        totalSymbols += methods + classes;
        totalRelationships += relationships;
        totalPatterns += patterns;
        totalConfidence += confidence;
        
      } catch (error) {
        console.error(`   ❌ Failed to parse ${path.basename(filePath)}: ${error.message}`);
      }
    }

    // Summary
    console.log(`\n📊 Unified Parser Summary:`);
    console.log(`   Files parsed: ${totalParsed}/${testFiles.length}`);
    console.log(`   Average confidence: ${(totalConfidence / totalParsed * 100).toFixed(1)}%`);
    console.log(`   Total symbols: ${totalSymbols}`);
    console.log(`   Total relationships: ${totalRelationships}`);
    console.log(`   Total patterns: ${totalPatterns}`);
    
    // Validate results
    if (totalParsed === testFiles.length) {
      console.log(`   ✅ All files parsed successfully`);
    } else {
      console.log(`   ⚠️  ${testFiles.length - totalParsed} files failed to parse`);
    }
    
    if (totalConfidence / totalParsed >= 0.8) {
      console.log(`   ✅ High confidence parsing (${(totalConfidence / totalParsed * 100).toFixed(1)}%)`);
    } else {
      console.log(`   ⚠️  Low confidence parsing (${(totalConfidence / totalParsed * 100).toFixed(1)}%)`);
    }

    if (totalRelationships > 100) {
      console.log(`   ✅ Rich relationship extraction (${totalRelationships} relationships)`);
    } else {
      console.log(`   ⚠️  Limited relationship extraction (${totalRelationships} relationships)`);
    }
  }
}