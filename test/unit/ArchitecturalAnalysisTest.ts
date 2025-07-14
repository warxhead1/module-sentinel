import { BaseTest } from '../helpers/BaseTest';
import { Priority1Tools } from '../../dist/tools/priority-1-tools.js';
import { Priority2Tools } from '../../dist/tools/priority-2-tools.js';
import { UnifiedSearch } from '../../dist/tools/unified-search.js';
import * as path from 'path';

export class ArchitecturalAnalysisTest extends BaseTest {
  private priority1: Priority1Tools | null = null;
  private priority2: Priority2Tools | null = null;
  private unified: UnifiedSearch | null = null;
  private sharedDbPath: string;

  constructor(sharedDbPath: string = '.test-db/main/pattern-aware.db') {
    super('architectural-analysis');
    this.sharedDbPath = sharedDbPath;
  }

  async specificSetup(): Promise<void> {
    // Use the shared database from TestRunner
    this.priority1 = new Priority1Tools(this.sharedDbPath, this.projectPath);
    this.priority2 = new Priority2Tools(this.sharedDbPath);
    this.unified = new UnifiedSearch(this.sharedDbPath);
  }

  async specificTeardown(): Promise<void> {
    if (this.priority1) this.priority1.close();
    if (this.priority2) this.priority2.close();
    if (this.unified) this.unified.close();
  }

  async run(): Promise<void> {
    console.log('\n📋 Test 1: Shader Bug Tracing');
    await this.testShaderBugTracing();
    
    console.log('\n📋 Test 2: Architecture Placement Guidance');
    await this.testArchitecturePlacement();
    
    console.log('\n📋 Test 3: Pipeline Factory Violations');
    await this.testPipelineFactoryViolations();
  }

  private async testShaderBugTracing(): Promise<void> {
    console.log('Testing shader debugging capabilities...');
    
    const shaderScenarios = [
      'vertex shader compilation error',
      'compute shader dispatch failure',
      'pipeline state mismatch',
      'uniform buffer binding issue'
    ];
    
    for (const scenario of shaderScenarios) {
      console.log(`\n🐛 Scenario: "${scenario}"`);
      
      const result = await this.unified!.search({
        query: `${scenario} vulkan graphics`,
        intent: 'debug',
        context: {
          current_file: path.join(this.projectPath, 'src/Rendering/Vulkan/Pipeline/VulkanPipelineBuilder.cpp'),
          stage: 'rendering'
        }
      });
      
      if (result.existing_solutions.length > 0) {
        console.log('Found solutions:');
        result.existing_solutions.slice(0, 2).forEach(sol => {
          console.log(`  - ${sol.module}::${sol.method}`);
          console.log(`    ${path.relative(this.projectPath, sol.location)}`);
        });
      } else {
        console.log(' NO SOLUTIONS FOUND');
      }
      
      if (result.recommended_approach) {
        console.log(`💡 Debug approach: ${result.recommended_approach.description}`);
      }
    }
  }

  private async testArchitecturePlacement(): Promise<void> {
    console.log('\nTesting architectural placement guidance...');
    
    const features = [
      { name: 'water surface rendering', expectedStage: 'rendering' },
      { name: 'procedural cave generation', expectedStage: 'terrain_formation' },
      { name: 'texture streaming manager', expectedStage: 'resource_management' }
    ];
    
    for (const feature of features) {
      console.log(`\n🆕 Feature: "${feature.name}"`);
      
      const guidance = await this.unified!.search({
        query: `where should I implement ${feature.name}`,
        intent: 'extend',
        context: {
          current_file: path.join(this.projectPath, 'src/new_feature.cpp'),
          stage: 'unknown'
        }
      });
      
      if (guidance.recommended_approach) {
        console.log(`Guidance: ${guidance.recommended_approach.description}`);
        
        const hasCorrectStage = guidance.recommended_approach.description
          .toLowerCase()
          .includes(feature.expectedStage);
        
        console.log(`  Stage guidance: ${hasCorrectStage ? 'CORRECT' : ' INCORRECT'}`);
      } else {
        console.log(' NO ARCHITECTURAL GUIDANCE');
      }
      
      if (guidance.integration_path?.length > 0) {
        console.log(`  Integration path: ${guidance.integration_path.join(' -> ')}`);
      }
    }
  }

  private async testPipelineFactoryViolations(): Promise<void> {
    console.log('\nDetecting Pipeline Factory Pattern violations...');
    
    const violations = await this.priority1!.findImplementations({
      functionality: 'pipeline creation violations',
      keywords: ['CreatePipeline', 'CreatePipelineLayout', 'vkCreate'],
      returnType: undefined
    });
    
    console.log(`\n🚨 Found ${violations.exact_matches.length} exact violations`);
    console.log(`🚨 Found ${violations.similar_implementations.length} similar violations`);
    
    // Analyze violations by file
    const violationsByFile = new Map<string, number>();
    
    [...violations.exact_matches, ...violations.similar_implementations].forEach(match => {
      const fileName = path.basename(match.location);
      violationsByFile.set(fileName, (violationsByFile.get(fileName) || 0) + 1);
    });
    
    console.log('\n📊 Violations by file:');
    Array.from(violationsByFile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([file, count]) => {
        console.log(`  - ${file}: ${count} violations`);
      });
    
    // Check specific known violators
    const knownViolators = ['VulkanComputeBase', 'VulkanResourceManager'];
    
    for (const violator of knownViolators) {
      const specific = [...violations.exact_matches, ...violations.similar_implementations]
        .filter(match => match.location.includes(violator));
      
      if (specific.length > 0) {
        console.log(`\n⚠️  ${violator} violations: ${specific.length}`);
        specific.slice(0, 3).forEach(match => {
          console.log(`  - ${match.method}: ${match.signature}`);
        });
      }
    }
  }
}