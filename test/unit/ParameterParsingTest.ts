import { BaseTest } from '../helpers/BaseTest';
import { UnifiedCppParser } from '../../src/parsers/unified-cpp-parser';
import { ParameterInfo } from '../../src/types/essential-features';

export class ParameterParsingTest extends BaseTest {
  private parser!: UnifiedCppParser;

  constructor() {
    super('parameter-parsing');
  }

  async specificSetup(): Promise<void> {
    this.parser = new UnifiedCppParser();
    await this.parser.initialize();
  }

  async specificTeardown(): Promise<void> {
    // No cleanup needed
  }

  async run(): Promise<void> {
    console.log('🔍 Parameter Parsing Quality Test');
    console.log('===================================');
    
    await this.testBasicParameterParsing();
    await this.testComplexParameterParsing();
    await this.testEdgeCases();
    await this.testRealWorldExamples();
    await this.calculateOverallQuality();
  }

  private async testBasicParameterParsing(): Promise<void> {
    console.log('\n📋 Test 1: Basic Parameter Parsing');
    
    const testCases = [
      {
        name: 'Simple types',
        line: 'void function(int x, float y)',
        expected: [
          { name: 'x', type: 'int', isConst: false, isPointer: false, isReference: false },
          { name: 'y', type: 'float', isConst: false, isPointer: false, isReference: false }
        ]
      },
      {
        name: 'Const parameters',
        line: 'void function(const int x, const float& y)',
        expected: [
          { name: 'x', type: 'const int', isConst: true, isPointer: false, isReference: false },
          { name: 'y', type: 'const float&', isConst: true, isPointer: false, isReference: true }
        ]
      },
      {
        name: 'Pointer parameters',
        line: 'void function(int* ptr, char** argv)',
        expected: [
          { name: 'ptr', type: 'int*', isConst: false, isPointer: true, isReference: false },
          { name: 'argv', type: 'char**', isConst: false, isPointer: true, isReference: false }
        ]
      },
      {
        name: 'Reference parameters',
        line: 'void function(int& ref, const std::string& str)',
        expected: [
          { name: 'ref', type: 'int&', isConst: false, isPointer: false, isReference: true },
          { name: 'str', type: 'const std::string&', isConst: true, isPointer: false, isReference: true }
        ]
      }
    ];

    for (const testCase of testCases) {
      console.log(`  Testing: ${testCase.name}`);
      const result = this.extractParametersFromLine(testCase.line);
      this.validateParameters(result, testCase.expected, testCase.name);
    }
  }

  private async testComplexParameterParsing(): Promise<void> {
    console.log('\n📋 Test 2: Complex Parameter Parsing');
    
    const testCases = [
      {
        name: 'Template parameters',
        line: 'void function(std::vector<int>& vec, std::map<std::string, int> mapping)',
        expected: [
          { name: 'vec', type: 'std::vector<int>&', isConst: false, isPointer: false, isReference: true },
          { name: 'mapping', type: 'std::map<std::string, int>', isConst: false, isPointer: false, isReference: false }
        ]
      },
      {
        name: 'Nested templates',
        line: 'void function(std::vector<std::unique_ptr<TerrainPatch>>& patches)',
        expected: [
          { name: 'patches', type: 'std::vector<std::unique_ptr<TerrainPatch>>&', isConst: false, isPointer: false, isReference: true }
        ]
      },
      {
        name: 'Function pointers',
        line: 'void function(int (*callback)(int, float), void* userData)',
        expected: [
          { name: 'callback', type: 'int (*)(int, float)', isConst: false, isPointer: true, isReference: false },
          { name: 'userData', type: 'void*', isConst: false, isPointer: true, isReference: false }
        ]
      },
      {
        name: 'Default parameters',
        line: 'void function(int x = 42, const std::string& name = "default")',
        expected: [
          { name: 'x', type: 'int', isConst: false, isPointer: false, isReference: false, defaultValue: '42' },
          { name: 'name', type: 'const std::string&', isConst: true, isPointer: false, isReference: true, defaultValue: '"default"' }
        ]
      }
    ];

    for (const testCase of testCases) {
      console.log(`  Testing: ${testCase.name}`);
      const result = this.extractParametersFromLine(testCase.line);
      this.validateParameters(result, testCase.expected, testCase.name);
    }
  }

  private async testEdgeCases(): Promise<void> {
    console.log('\n📋 Test 3: Edge Cases');
    
    const testCases = [
      {
        name: 'Empty parameters',
        line: 'void function()',
        expected: []
      },
      {
        name: 'Single parameter',
        line: 'void function(int x)',
        expected: [
          { name: 'x', type: 'int', isConst: false, isPointer: false, isReference: false }
        ]
      },
      {
        name: 'Whitespace variations',
        line: 'void function( const int &  x  ,  float *  y  )',
        expected: [
          { name: 'x', type: 'const int &', isConst: true, isPointer: false, isReference: true },
          { name: 'y', type: 'float *', isConst: false, isPointer: true, isReference: false }
        ]
      },
      {
        name: 'Unnamed parameters',
        line: 'void function(int, float)',
        expected: [
          { name: '', type: 'int', isConst: false, isPointer: false, isReference: false },
          { name: '', type: 'float', isConst: false, isPointer: false, isReference: false }
        ]
      }
    ];

    for (const testCase of testCases) {
      console.log(`  Testing: ${testCase.name}`);
      const result = this.extractParametersFromLine(testCase.line);
      this.validateParameters(result, testCase.expected, testCase.name);
    }
  }

  private async testRealWorldExamples(): Promise<void> {
    console.log('\n📋 Test 4: Real-World Examples from Database');
    
    // Get problematic examples from the database
    const problematicExamples = [
      'void function(data.elevation.data.begin()',
      'void function(sortedElevations.begin()',
      'void function(design.randomSeed + 100)',
      'void function(normX, normY)',
      'void function(0.1f, 0.9f)'
    ];

    console.log('  Current problematic patterns:');
    for (const example of problematicExamples) {
      console.log(`    Input: ${example}`);
      const result = this.extractParametersFromLine(example);
      console.log(`    Output: ${JSON.stringify(result, null, 6)}`);
      console.log(`    Issue: Parsing function calls as parameters`);
    }
  }

  private async calculateOverallQuality(): Promise<void> {
    console.log('\n📊 Overall Quality Assessment');
    
    // Test with real method signatures from the codebase
    const realExamples = [
      'TerrainOrchestrator::EnableDetailedPhysicsReporting(bool enabled)',
      'VulkanPipelineCreator::CreatePipeline(const PipelineCreateInfo& info)',
      'TerrainOrchestrator::GenerateContinentalCenters(const PlanetaryData& data)',
      'VulkanPipelineManager::ExecuteComputeWithIterations(uint32_t iterations)',
      'TerrainOrchestrator::SetTerraformingParameter(const std::string& name, float value)',
      'VulkanPipelineCreator::AnalyzeReflectionData(const std::vector<uint32_t>& spirv)',
      'TerrainOrchestrator::BuildNoisePacketsForErosion(const std::vector<ErosionPoint>& points)'
    ];

    let totalTests = 0;
    let passedTests = 0;

    for (const example of realExamples) {
      const result = this.extractParametersFromLine(example);
      totalTests++;
      
      // Simple quality check - parameters should have names and reasonable types
      const hasValidParams = result.every(p => 
        p.name !== '' && 
        p.type.length > 0 && 
        !p.type.includes('(') && // No function calls in type
        !p.type.includes('.') && // No property access in type
        p.type !== 'unknown'
      );
      
      if (hasValidParams) {
        passedTests++;
      } else {
        console.log(`  ❌ Failed: ${example}`);
        console.log(`     Result: ${JSON.stringify(result)}`);
      }
    }

    const quality = (passedTests / totalTests) * 100;
    console.log(`\n  Quality Score: ${quality.toFixed(1)}% (${passedTests}/${totalTests})`);
    console.log(`  Target: 90%+`);
    
    if (quality < 90) {
      console.log('  ⚠️  Below target - enhancement needed');
    } else {
      console.log('  ✅ Target achieved!');
    }
  }

  private extractParametersFromLine(line: string): ParameterInfo[] {
    // Use the parser's private method via reflection
    return (this.parser as any).extractParametersFromLine(line);
  }

  private validateParameters(actual: ParameterInfo[], expected: any[], testName: string): void {
    if (actual.length !== expected.length) {
      console.log(`    ❌ ${testName}: Expected ${expected.length} parameters, got ${actual.length}`);
      console.log(`       Actual result: ${JSON.stringify(actual, null, 6)}`);
      return;
    }

    for (let i = 0; i < expected.length; i++) {
      const actualParam = actual[i];
      const expectedParam = expected[i];

      const matches = 
        actualParam.name === expectedParam.name &&
        actualParam.type === expectedParam.type &&
        actualParam.isConst === expectedParam.isConst &&
        actualParam.isPointer === expectedParam.isPointer &&
        actualParam.isReference === expectedParam.isReference &&
        (expectedParam.defaultValue ? actualParam.defaultValue === expectedParam.defaultValue : true);

      if (!matches) {
        console.log(`    ❌ ${testName}: Parameter ${i} mismatch`);
        console.log(`       Expected: ${JSON.stringify(expectedParam)}`);
        console.log(`       Actual:   ${JSON.stringify(actualParam)}`);
        return;
      }
    }

    console.log(`    ✅ ${testName}: All parameters match`);
  }
}