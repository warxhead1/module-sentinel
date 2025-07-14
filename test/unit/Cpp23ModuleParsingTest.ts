import { BaseTest } from '../helpers/BaseTest';
import { ModuleSentinel } from '../../dist/module-sentinel.js';
import { StreamingCppParser } from '../../dist/parsers/streaming-cpp-parser.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export class Cpp23ModuleParsingTest extends BaseTest {
  private sentinel: ModuleSentinel | null = null;
  private parser: StreamingCppParser | null = null;
  private testFiles = [
    'include/Core/Threading/JobSystem.ixx',
    'include/Rendering/Vulkan/Pipeline/PipelineFactory.ixx',
    'include/Application/Feedback/VisualFeedbackApplication.ixx'
  ];

  constructor() {
    super('cpp23-module-parsing');
  }

  async specificSetup(): Promise<void> {
    this.sentinel = new ModuleSentinel();
    this.parser = new StreamingCppParser();
  }

  async specificTeardown(): Promise<void> {
    this.sentinel = null;
    this.parser = null;
  }

  async run(): Promise<void> {
    await this.testDirectParsing();
    await this.testModuleSentinelAnalysis();
    await this.testModuleDetection();
  }

  private async testDirectParsing(): Promise<void> {
    console.log('\n📋 Test 1: Direct Parser Test for C++23 Modules');
    console.log('Testing direct parsing of .ixx files...\n');

    for (const testFile of this.testFiles) {
      const fullPath = path.join('/home/warxh/planet_procgen', testFile);
      const fileName = path.basename(fullPath);
      
      try {
        // Parse the file
        const result = await this.parser.parseFile(fullPath);
        
        console.log(`${fileName}:`);
        console.log(`  - Exports: ${result.exports.size}`);
        console.log(`  - Imports: ${result.imports.size}`);
        console.log(`  - Functions: ${result.functions.size}`);
        console.log(`  - Classes: ${result.classes.size}`);
        console.log(`  - Namespaces: ${result.namespaces.size}`);
        
        // Verify module export
        const hasModuleExport = Array.from(result.exports).some(e => e.includes('module:'));
        console.log(`  - Has module export: ${hasModuleExport ? 'YES' : 'NO'}`);
        
        // Show sample exports
        const sampleExports = Array.from(result.exports).slice(0, 3);
        console.log(`  - Sample exports: ${sampleExports.join(', ')}`);
        console.log('');
        
      } catch (error) {
        console.error(`❌ Failed to parse ${fileName}: ${error}`);
      }
    }
  }

  private async testModuleSentinelAnalysis(): Promise<void> {
    console.log('\n📋 Test 2: Module Sentinel Analysis\n');
    console.log('Testing module analysis through ModuleSentinel...\n');

    for (const testFile of this.testFiles) {
      const fullPath = path.join('/home/warxh/planet_procgen', testFile);
      const fileName = path.basename(fullPath);
      
      try {
        const moduleInfo = await this.sentinel!.analyzeModule(fullPath);
        
        console.log(`${fileName}:`);
        console.log(`  - Exports: ${moduleInfo.exports.length}`);
        console.log(`  - Imports: ${moduleInfo.imports.length}`);
        console.log(`  - Dependencies: ${moduleInfo.dependencies.length}`);
        console.log(`  - Pipeline Stage: ${moduleInfo.stage}`);
        
        const sampleExports = moduleInfo.exports.slice(0, 3);
        console.log(`  - Sample exports: ${sampleExports.join(', ')}`);
        console.log('');
        
      } catch (error) {
        console.error(`❌ Failed to analyze ${fileName}: ${error}`);
      }
    }
  }

  private async testModuleDetection(): Promise<void> {
    console.log('\n📋 Test 3: Module Export/Import Detection\n');
    console.log('Testing specific C++23 module syntax detection...\n');
    
    // Test on JobSystem.ixx which we know has module declarations
    const testFile = path.join('/home/warxh/planet_procgen', this.testFiles[0]);
    
    try {
      // Read file content for direct inspection
      const content = await fs.readFile(testFile, 'utf-8');
      
      // Check for module declaration
      const moduleDecl = content.match(/export\s+module\s+([\w.]+(?:::[\w.]+)*)\s*;/);
      if (moduleDecl) {
        console.log(`Found module declaration: ${moduleDecl[0]}`);
        console.log(`  - Module name: ${moduleDecl[1]}`);
      }
      
      // Check for imports
      const imports = content.match(/import\s+([\w.]+)\s*;/g);
      console.log(`\nFound ${imports ? imports.length : 0} import(s):`);
      if (imports) {
        imports.forEach(imp => {
          const match = imp.match(/import\s+([\w.]+)/);
          if (match) {
            console.log(`  - ${match[1]}`);
          }
        });
      }
      
      // Check for export namespace
      const exportNamespace = content.match(/export\s+namespace\s+([\w:]+)/g);
      console.log(`\nFound ${exportNamespace ? exportNamespace.length : 0} exported namespace(s):`);
      if (exportNamespace) {
        exportNamespace.forEach(ns => {
          const match = ns.match(/export\s+namespace\s+([\w:]+)/);
          if (match) {
            console.log(`  - ${match[1]}`);
          }
        });
      }
      
      // Parse and verify
      const parseResult = await this.parser!.parseFile(testFile);
      console.log('\n📊 Parser verification:');
      console.log(`  - Detected module exports: ${Array.from(parseResult.exports).filter(e => e.includes('module:')).length}`);
      console.log(`  - Detected imports: ${parseResult.imports.size}`);
      
    } catch (error) {
      console.error(`❌ Module detection test failed: ${error}`);
    }
  }
}

// Export for use in TestRunner
export default Cpp23ModuleParsingTest;