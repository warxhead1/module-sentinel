import { BaseTest } from '../helpers/BaseTest.js';
import { ClangAstParser } from '../../src/parsers/clang-ast-parser.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ClangPerformanceTest extends BaseTest {
  private clangParser: ClangAstParser;
  private testFile = '/home/warxh/planet_procgen/src/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.cpp';
  private moduleInterfaceFile = '/home/warxh/planet_procgen/include/Rendering/Vulkan/Compute/VulkanTerrainCoherenceProcessor.ixx';

  constructor() {
    super('Clang Performance Test');
  }

  async specificSetup(): Promise<void> {
    this.clangParser = new ClangAstParser('clang++-19', '/home/warxh/planet_procgen');
    // Initialize the parser to load compilation database
    await this.clangParser.initialize('/home/warxh/planet_procgen');
  }

  async specificTeardown(): Promise<void> {
    // No specific teardown needed
  }

  async run(): Promise<void> {
    // Test 1: Compare .ixx vs .cpp file characteristics
    await this.testFileComparison();
    
    // Test 2: Test .ixx module interface parsing
    await this.testModuleInterfaceParsing();
    
    // Test 3: Measure Clang parsing time with different configurations
    await this.testClangParsingTime();
    
    // Test 4: Analyze what causes timeouts
    await this.testTimeoutAnalysis();
    
    // Test 5: Test incremental parsing strategies
    await this.testIncrementalParsing();
  }

  private async testFileComparison(): Promise<void> {
    console.log('\n📊 File Comparison Analysis (.ixx vs .cpp):');
    
    const files = [
      { path: this.moduleInterfaceFile, name: 'Module Interface (.ixx)' },
      { path: this.testFile, name: 'Implementation (.cpp)' }
    ];
    
    for (const file of files) {
      console.log(`\n  ${file.name}:`);
      await this.analyzeFileCharacteristics(file.path);
    }
  }

  private async testModuleInterfaceParsing(): Promise<void> {
    console.log('\n🧩 Module Interface Parsing Test (.ixx):');
    
    const timeoutTests = [
      { timeout: 5000, name: '5 seconds' },
      { timeout: 10000, name: '10 seconds' },
      { timeout: 30000, name: '30 seconds' }
    ];
    
    for (const test of timeoutTests) {
      console.log(`\n  Testing .ixx file with ${test.name} timeout:`);
      
      const startTime = Date.now();
      let success = false;
      
      try {
        const result = await Promise.race([
          this.clangParser.parseFile(this.moduleInterfaceFile),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout after ${test.timeout}ms`)), test.timeout)
          )
        ]);
        
        success = true;
        const elapsed = Date.now() - startTime;
        console.log(`    ✅ Success in ${(elapsed / 1000).toFixed(2)}s`);
        
        if (result && typeof result === 'object' && 'methods' in result && 'classes' in result) {
          console.log(`    Found ${(result as any).methods.length} methods, ${(result as any).classes.length} classes`);
        }
        break; // Success, no need to test longer timeouts
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        console.log(`    ❌ Failed after ${(elapsed / 1000).toFixed(2)}s: ${err.message}`);
      }
    }
  }

  private async analyzeFileCharacteristics(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      
      console.log(`    File: ${path.basename(filePath)}`);
      console.log(`    Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`    Lines: ${content.split('\n').length}`);
      
      // Count includes and imports
      const includes = content.match(/#include\s+[<"]/g)?.length || 0;
      const imports = content.match(/import\s+\w+/g)?.length || 0;
      const templates = content.match(/template\s*</g)?.length || 0;
      const classes = content.match(/class\s+\w+/g)?.length || 0;
      const functions = content.match(/\w+\s*\([^)]*\)\s*{/g)?.length || 0;
      
      console.log(`    Includes: ${includes}`);
      console.log(`    Imports: ${imports}`);
      console.log(`    Template declarations: ${templates}`);
      console.log(`    Class declarations: ${classes}`);
      console.log(`    Function definitions: ${functions}`);
      
      // Check for heavy dependencies
      const hasVulkan = content.includes('#include <vulkan/') || content.includes('import Vulkan');
      const hasGLM = content.includes('#include <glm/') || content.includes('import GLM');
      const hasBoost = content.includes('#include <boost/');
      
      console.log(`    Heavy dependencies:`);
      console.log(`      - Vulkan: ${hasVulkan ? 'Yes' : 'No'}`);
      console.log(`      - GLM: ${hasGLM ? 'Yes' : 'No'}`);
      console.log(`      - Boost: ${hasBoost ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.error(`    Error analyzing file: ${error}`);
    }
  }

  private async testClangParsingTime(): Promise<void> {
    console.log('\n⏱️  Clang Parsing Time Analysis:');
    
    // Test different timeout values
    const timeoutTests = [
      { timeout: 10000, name: '10 seconds' },
      { timeout: 30000, name: '30 seconds' },
      { timeout: 60000, name: '60 seconds' },
      { timeout: 120000, name: '120 seconds' }
    ];
    
    for (const test of timeoutTests) {
      console.log(`\n  Testing with ${test.name} timeout:`);
      
      const startTime = Date.now();
      let success = false;
      
      try {
        // We'll need to modify the clang parser to accept a timeout parameter
        // For now, let's just measure how long it takes
        const result = await Promise.race([
          this.clangParser.parseFile(this.testFile),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout after ${test.timeout}ms`)), test.timeout)
          )
        ]);
        
        success = true;
        const elapsed = Date.now() - startTime;
        console.log(`    ✅ Success in ${(elapsed / 1000).toFixed(2)}s`);
        
        if (result && typeof result === 'object' && 'methods' in result && 'classes' in result) {
          console.log(`    Found ${result.methods.length} methods, ${result.classes.length} classes`);
        }
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        console.log(`    ❌ Failed after ${(elapsed / 1000).toFixed(2)}s: ${err.message}`);
      }
      
      // Don't continue with longer timeouts if shorter ones succeed
      if (success) break;
    }
  }

  private async testTimeoutAnalysis(): Promise<void> {
    console.log('\n🔍 Timeout Root Cause Analysis:');
    
    // Test parsing with different configurations
    const configurations = [
      { 
        name: 'Full AST JSON', 
        args: ['-fsyntax-only', '-Xclang', '-ast-dump=json']
      },
      { 
        name: 'Lightweight AST print', 
        args: ['-fsyntax-only', '-Xclang', '-ast-print']
      },
      { 
        name: 'Syntax only (no AST)', 
        args: ['-fsyntax-only']
      },
      { 
        name: 'Preprocess only', 
        args: ['-E']
      }
    ];
    
    for (const config of configurations) {
      console.log(`\n  Testing ${config.name}:`);
      
      const startTime = Date.now();
      const { spawn } = await import('child_process');
      
      try {
        await new Promise<void>((resolve, reject) => {
          const args = [...config.args, this.testFile];
          console.log(`    Command: clang++-19 ${args.join(' ')}`);
          
          const clang = spawn('clang++-19', args);
          let outputSize = 0;
          let errorOutput = '';
          
          clang.stdout.on('data', (data) => {
            outputSize += data.length;
          });
          
          clang.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
          
          const timeout = setTimeout(() => {
            clang.kill('SIGKILL');
            reject(new Error('Process timed out after 30s'));
          }, 30000);
          
          clang.on('close', (code) => {
            clearTimeout(timeout);
            const elapsed = Date.now() - startTime;
            
            if (code === 0) {
              console.log(`    ✅ Success in ${(elapsed / 1000).toFixed(2)}s`);
              console.log(`    Output size: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);
              resolve();
            } else {
              console.log(`    ❌ Failed with code ${code} after ${(elapsed / 1000).toFixed(2)}s`);
              if (errorOutput) {
                console.log(`    Error: ${errorOutput.substring(0, 200)}...`);
              }
              reject(new Error(`Process exited with code ${code}`));
            }
          });
        });
      } catch (error) {
        console.log(`    ❌ ${error.message}`);
      }
    }
  }

  private async testIncrementalParsing(): Promise<void> {
    console.log('\n🔄 Incremental Parsing Strategies:');
    
    const content = await fs.readFile(this.testFile, 'utf-8');
    const lines = content.split('\n');
    
    // Strategy 1: Parse without includes
    console.log('\n  Strategy 1: Remove includes and imports');
    const withoutIncludes = lines
      .filter(line => !line.trim().startsWith('#include') && !line.trim().startsWith('import'))
      .join('\n');
    
    const tempFile1 = `/tmp/test_no_includes_${Date.now()}.cpp`;
    await fs.writeFile(tempFile1, withoutIncludes);
    
    try {
      const startTime = Date.now();
      await Promise.race([
        this.clangParser.parseFile(tempFile1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]);
      const elapsed = Date.now() - startTime;
      console.log(`    ✅ Parsed without includes in ${(elapsed / 1000).toFixed(2)}s`);
    } catch (error) {
      console.log(`    ❌ Failed: ${error.message}`);
    } finally {
      await fs.unlink(tempFile1).catch(() => {});
    }
    
    // Strategy 2: Parse function signatures only
    console.log('\n  Strategy 2: Extract function signatures only');
    const signatures = this.extractFunctionSignatures(content);
    console.log(`    Found ${signatures.length} function signatures without full parsing`);
    
    // Strategy 3: Parse in chunks
    console.log('\n  Strategy 3: Parse in chunks');
    const chunkSize = 1000; // lines per chunk
    const chunks = Math.ceil(lines.length / chunkSize);
    console.log(`    File has ${lines.length} lines, would need ${chunks} chunks of ${chunkSize} lines`);
  }

  private extractFunctionSignatures(content: string): string[] {
    const signatures: string[] = [];
    
    // Simple regex-based extraction for quick analysis
    const functionPattern = /^(?:[\w\s]*?)?\s*(?:inline\s+)?(?:virtual\s+)?(?:static\s+)?(?:constexpr\s+)?(?:[\w:]+(?:<[^>]+>)?[\s\*&]+)?(\w+)\s*\([^)]*\)\s*(?:const)?\s*(?:override)?\s*(?:noexcept)?\s*(?:->[\s\w:]+(?:<[^>]+>)?)?[^{;]*[{;]/gm;
    
    let match: RegExpExecArray | null;
    while ((match = functionPattern.exec(content)) !== null) {
      signatures.push(match[0].trim());
    }
    
    return signatures;
  }

}