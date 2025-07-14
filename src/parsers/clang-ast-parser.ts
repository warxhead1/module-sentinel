import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  MethodSignature, 
  ClassInfo, 
  EnhancedModuleInfo,
  ParameterInfo 
} from '../types/essential-features.js';

/**
 * C++ AST Parser using Clang's AST dump functionality
 * 
 * This approach uses clang's built-in AST dumping to get accurate C++ parsing
 * including templates, overloads, and all C++ features.
 */
export class ClangAstParser {
  private clangPath: string;
  private includePathsCache: string[] = [];
  private modulePathsCache: string[] = [];
  private compilationDatabase?: any;

  constructor(clangPath: string = 'clang++-19') {
    // Try to use clang++-19 by default since it has better C++23 module support
    this.clangPath = clangPath;
  }

  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    // Step 1: Get AST output from clang
    const astOutput = await this.getClangAst(filePath);
    
    // Step 2: Extract information
    const methods: MethodSignature[] = [];
    const classes: ClassInfo[] = [];
    const functions: MethodSignature[] = [];
    
    // Check if output is JSON or plain text
    if (astOutput.trim().startsWith('{')) {
      // JSON mode - full AST
      const ast = JSON.parse(astOutput);
      
      this.traverseAst(ast, {
        onClass: (node) => classes.push(this.parseClassNode(node)),
        onMethod: (node, className) => methods.push(this.parseMethodNode(node, className)),
        onFunction: (node) => functions.push(this.parseFunctionNode(node))
      });
    } else {
      // Text mode - parse printed AST
      this.parseAstPrint(astOutput, classes, methods, functions);
    }
    
    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods: [...methods, ...functions],
      classes,
      interfaces: [], // Would need to identify pure virtual classes
      relationships: [], // Would need to track usage
      patterns: [], // Would need pattern detection
      imports: await this.extractIncludes(filePath),
      exports: this.identifyExports(classes, methods, functions)
    };
  }

  private async getClangAst(filePath: string): Promise<string> {
    // Check if file likely contains heavy templates (which explode AST size)
    const content = await fs.readFile(filePath, 'utf-8');
    const hasHeavyTemplates = content.includes('#include <glm/') || 
                             content.includes('#include <eigen') ||
                             content.includes('#include <boost/') ||
                             content.includes('#include <vulkan/') ||
                             content.includes('import Vulkan') ||
                             content.includes('import GLM') ||
                             content.includes('VulkanResourceManager') ||
                             content.includes('module VulkanTerrainCoherenceProcessor') ||
                             (content.includes('template<') && content.length > 5000) ||
                             content.length > 10000; // Any file > 10KB likely has complex templates
    
    const useLightweightMode = hasHeavyTemplates;
    
    // Try to use compilation database command first for proper module resolution
    const compileEntry = this.getCompileEntry(filePath);
    if (compileEntry) {
      console.log(`Using compilation database for ${filePath}`);
      return this.getClangAstFromCompileCommand(filePath, compileEntry, useLightweightMode);
    }
    
    // Only fall back to parseWithoutModuleDeclaration if no compilation database entry
    if (useLightweightMode && (content.includes('module ') || content.includes('import '))) {
      console.log(`Module implementation file detected - using source-only parsing (no compilation database entry)`);
      return this.parseWithoutModuleDeclaration(filePath, content);
    }
    
    if (useLightweightMode) {
      console.log(`Using lightweight mode for ${filePath} (detected heavy templates)`);
      
      // For lightweight mode, always try parsing without module declarations
      // This works better for complex module implementation files
      if (content.includes('module ') || content.includes('import ')) {
        console.log(`Module implementation file detected - using source-only parsing`);
        return this.parseWithoutModuleDeclaration(filePath, content);
      }
    }
    
    return this.getClangAstFallback(filePath, useLightweightMode);
  }

  private getCompileEntry(filePath: string): any {
    if (!this.compilationDatabase) return null;
    
    return this.compilationDatabase.find((cmd: any) => 
      cmd.file === filePath || path.resolve(cmd.file) === path.resolve(filePath)
    );
  }

  private async getClangAstFromCompileCommand(filePath: string, compileEntry: any, useLightweightMode: boolean): Promise<string> {
    const workingDir = compileEntry.directory;
    const originalCommand = compileEntry.command;
    const commandParts = originalCommand.split(/\s+/);
    const clangExecutable = commandParts[0];
    const newArgs: string[] = [];
    let skipNext = false;

    for (let i = 1; i < commandParts.length; i++) {
      const arg = commandParts[i];
      if (skipNext) {
        skipNext = false;
        continue;
      }
      if (arg === '-o' || arg === '-c') {
        if (arg === '-o') skipNext = true;
        continue;
      }
      if (arg.endsWith('.o') && !arg.startsWith('-')) {
        continue;
      }
      newArgs.push(arg);
    }

    newArgs.unshift('-fsyntax-only', '-Xclang', '-ast-dump=json', '-fno-diagnostics-color');
    
    console.log(`Clang AST command: cd ${workingDir} && ${clangExecutable} ${newArgs.join(' ')}`);

    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const bash = spawn('bash', ['-c', `cd ${workingDir} && ${clangExecutable} ${newArgs.join(' ')}`]);
      
      const StreamValues = require('stream-json/streamers/StreamValues');
      const parser = StreamValues.withParser();
      
      const relevantContent: string[] = [];
      let processedNodes = 0;
      const externalHeaders = new Set<string>();
      const projectHeaders = new Set<string>();

      bash.stdout.pipe(parser);

      parser.on('data', (data: any) => {
        const node = data.value;
        processedNodes++;
        
        // Track which files are encountered for dependency analysis
        if (node.loc && node.loc.file) {
          const nodeFile = node.loc.file;
          if (this.isExternalLibraryFile(nodeFile)) {
            externalHeaders.add(nodeFile);
          } else if (!nodeFile.endsWith(path.basename(filePath))) {
            projectHeaders.add(nodeFile);
          }
        }
        
        if (this.isMainFileNode(node, filePath) && !node.isImplicit) {
          if (['CXXRecordDecl', 'CXXMethodDecl', 'FunctionDecl', 'NamespaceDecl'].includes(node.kind)) {
            relevantContent.push(JSON.stringify(node));
          }
        }
        if (processedNodes % 1000 === 0) {
          console.log(`📊 Progress: ${processedNodes} nodes processed, ${relevantContent.length} relevant nodes found.`);
        }
      });

      parser.on('end', () => {
        console.log(`✅ Streaming extraction completed: ${relevantContent.length} relevant nodes from ${processedNodes} total`);
        console.log(`   Filtered out ${externalHeaders.size} external headers`);
        console.log(`   Found ${projectHeaders.size} project headers as dependencies`);
        if (externalHeaders.size > 0) {
          console.log(`   Example external headers filtered: ${Array.from(externalHeaders).slice(0, 3).join(', ')}...`);
        }
        resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
      });

      parser.on('error', (err: any) => {
        // It's possible the stream ends unexpectedly. We can still try to recover some data.
        if (relevantContent.length > 0) {
          console.warn(`JSON stream ended with an error, but recovering ${relevantContent.length} nodes.`);
          resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
        } else {
          reject(new Error(`JSON streaming failed: ${err.message}`));
        }
      });

      const stderrChunks: Buffer[] = [];
      bash.stderr.on('data', (data: Buffer) => {
        stderrChunks.push(data);
      });

      let processResolved = false;
      
      const handleProcessClose = (code: number | null) => {
        if (processResolved) return;
        processResolved = true;
        
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          
          // Check for fatal errors
          const isFatalError = stderr.includes('fatal error:') || 
                              stderr.includes('too many errors emitted') ||
                              stderr.includes('stopping now');
          
          if (isFatalError || relevantContent.length === 0) {
            console.warn(`Clang compilation database process failed with fatal errors. Code: ${code}`);
            reject(new Error(`No AST output from Clang`));
          } else {
            console.warn(`Clang process exited with code ${code}, but recovering ${relevantContent.length} nodes. Stderr: ${stderr.substring(0, 200)}...`);
            resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
          }
        } else {
          resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
        }
      };
      
      bash.on('close', handleProcessClose);
      bash.on('exit', handleProcessClose);
      
      bash.on('error', (error: any) => {
        if (processResolved) return;
        processResolved = true;
        console.warn(`Bash process error: ${error.message}`);
        reject(new Error(`Bash process failed: ${error.message}`));
      });

      const processTimeout = setTimeout(() => {
        if (processResolved) return;
        processResolved = true;
        
        try {
          bash.kill('SIGKILL');
        } catch (e) {
          // Process might already be dead
        }
        
        if (relevantContent.length > 0) {
          console.warn(`Clang parsing timed out, but recovering ${relevantContent.length} nodes.`);
          resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
        } else {
          console.warn(`Clang parsing timed out with no output.`);
          reject(new Error(`No AST output from Clang`));
        }
      }, 45000); // 45 seconds for compilation database method
      
      bash.on('close', () => clearTimeout(processTimeout));
    });
  }

  private getClangAstFallback(filePath: string, useLightweightMode: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = useLightweightMode ? [
        '-fsyntax-only',
        '-std=c++23',
        '-Xclang', '-ast-print',
        ...this.includePathsCache.map(p => `-I${p}`),
        filePath
      ] : [
        '-Xclang', '-ast-dump=json',
        '-fsyntax-only',
        '-std=c++23',
        '-fmodules',
        '-fimplicit-modules',
        ...this.includePathsCache.map(p => `-I${p}`),
        filePath
      ];

      const content = require('fs').readFileSync(filePath, 'utf-8');
      if (filePath.endsWith('.ixx') || filePath.endsWith('.cppm') || content.includes('module ')) {
        if (!useLightweightMode) {
          args.splice(2, 0, '-x', 'c++-module');
        }
        if (this.clangPath.includes('19')) {
          args.push('-fexperimental-modules-reduced-bmi');
        }
        args.push('-stdlib=libc++');
      }

      if (this.modulePathsCache.length > 0) {
        this.modulePathsCache.forEach(p => {
          args.push(`-fprebuilt-module-path=${p}`);
        });
      }

      const compileFlags = this.getCompileFlags(filePath);
      args.push(...compileFlags);

      console.log(`Clang fallback command: ${this.clangPath} ${args.join(' ')}`);
      const clang = spawn(this.clangPath, args);
      
      if (useLightweightMode) {
        // ast-print is not JSON, so we have to buffer it.
        // This is the lightweight mode, so it should be fine.
        const stdoutChunks: Buffer[] = [];
        clang.stdout.on('data', (data: Buffer) => {
          stdoutChunks.push(data);
        });
        clang.stdout.on('end', () => {
          resolve(Buffer.concat(stdoutChunks).toString('utf-8'));
        });
      } else {
        const StreamValues = require('stream-json/streamers/StreamValues');
        const parser = StreamValues.withParser();
        const relevantContent: string[] = [];
        let processedNodes = 0;

        clang.stdout.pipe(parser);

        parser.on('data', (data: any) => {
          const node = data.value;
          processedNodes++;
          // Filter out external library nodes in fallback mode too
          if (this.isMainFileNode(node, filePath) && !node.isImplicit) {
            if (['CXXRecordDecl', 'CXXMethodDecl', 'FunctionDecl', 'NamespaceDecl'].includes(node.kind)) {
              relevantContent.push(JSON.stringify(node));
            }
          }
          if (processedNodes % 1000 === 0) {
            console.log(`📊 Fallback Progress: ${processedNodes} nodes processed, ${relevantContent.length} relevant nodes found.`);
          }
        });

        parser.on('end', () => {
          console.log(`✅ Fallback streaming completed: ${relevantContent.length} nodes`);
          resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
        });

        parser.on('error', (err: any) => {
          if (relevantContent.length > 0) {
            console.warn(`Fallback JSON stream ended with an error, but recovering ${relevantContent.length} nodes.`);
            resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
          } else {
            reject(new Error(`Fallback JSON streaming failed: ${err.message}`));
          }
        });
      }

      const stderrChunks: Buffer[] = [];
      clang.stderr.on('data', (data: Buffer) => {
        stderrChunks.push(data);
      });

      let fallbackResolved = false;
      
      const handleFallbackClose = (code: number | null) => {
        if (fallbackResolved) return;
        fallbackResolved = true;
        
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          
          // Check for fatal errors
          const isFatalError = stderr.includes('fatal error:') || 
                              stderr.includes('too many errors emitted') ||
                              stderr.includes('stopping now');
          
          if (isFatalError) {
            console.warn(`Clang fallback failed with fatal errors. Code: ${code}`);
            reject(new Error(`No AST output from Clang`));
          } else {
            console.warn(`Clang fallback exited with code ${code}: ${stderr.substring(0, 200)}...`);
            reject(new Error(`Clang failed with code ${code}: ${stderr.substring(0, 200)}`));
          }
        }
      };
      
      clang.on('close', handleFallbackClose);
      clang.on('exit', handleFallbackClose);
      
      clang.on('error', (error: any) => {
        if (fallbackResolved) return;
        fallbackResolved = true;
        console.warn(`Clang fallback process error: ${error.message}`);
        reject(new Error(`Clang process failed: ${error.message}`));
      });

      const fallbackTimeout = setTimeout(() => {
        if (fallbackResolved) return;
        fallbackResolved = true;
        
        try {
          clang.kill('SIGKILL');
        } catch (e) {
          // Process might already be dead
        }
        
        console.warn(`Clang fallback parsing timed out.`);
        reject(new Error(`No AST output from Clang`));
      }, 30000); // 30 seconds for fallback
      
      clang.on('close', () => clearTimeout(fallbackTimeout));
    });
  }

  /**
   * Parse file without module declaration for lightweight analysis
   */
  private async parseWithoutModuleDeclaration(filePath: string, content: string): Promise<string> {
    const tempDir = '/tmp';
    const tempFile = path.join(tempDir, `clang_parse_${Date.now()}.cpp`);
    
    // Check if this is a .cpp file and if corresponding .ixx exists
    let interfaceContent = '';
    if (filePath.endsWith('.cpp')) {
      // Try multiple locations for the .ixx file
      const possibleIxxPaths = [
        filePath.replace(/\.cpp$/, '.ixx'),
        filePath.replace(/\/src\//, '/include/').replace(/\.cpp$/, '.ixx')
      ];
      
      for (const ixxPath of possibleIxxPaths) {
        try {
          const ixxContent = await fs.readFile(ixxPath, 'utf-8');
          console.log(`Found corresponding interface file: ${ixxPath}`);
          
          // Extract class definitions from the .ixx file
          // Remove export statements and module declarations
          interfaceContent = '\n// Interface definitions from ' + path.basename(ixxPath) + '\n' +
            ixxContent
              .split('\n')
              .filter(line => {
                const trimmed = line.trim();
                return !trimmed.startsWith('export module') && 
                       !trimmed.startsWith('module ') &&
                       !trimmed.startsWith('import ') &&
                       !trimmed.startsWith('export import') &&
                       trimmed !== 'module;';
              })
              .map(line => {
                // Remove 'export' keyword from declarations
                return line.replace(/^\s*export\s+/, '');
              })
              .join('\n') + '\n\n';
          break; // Found it, stop looking
        } catch (error) {
          // Try next path
        }
      }
      
      if (!interfaceContent) {
        console.log(`No corresponding .ixx file found for ${filePath}`);
      }
    }
    
    // Only add forward declarations if we didn't find an .ixx file
    const basicIncludes = `
// Basic types to help parsing
#include <cstdint>
#include <memory>
#include <string>
`;

    const vulkanForwardDecls = interfaceContent ? '' : `
// Vulkan forward declarations (only if no .ixx file found)
typedef void* VkDevice;
typedef void* VkBuffer;
typedef void* VkDeviceMemory;
typedef void* VkCommandBuffer;
typedef void* VkCommandPool;
typedef void* VkDescriptorSet;
typedef void* VkDescriptorSetLayout;
typedef void* VkPipeline;
typedef void* VkPipelineLayout;
typedef void* VkRenderPass;
typedef void* VkFramebuffer;
typedef void* VkImage;
typedef void* VkImageView;
typedef void* VkSemaphore;
typedef void* VkFence;
typedef uint32_t VkResult;`;

    const glmForwardDecls = interfaceContent ? '' : `
namespace glm {
  struct vec2 { float x, y; };
  struct vec3 { float x, y, z; };
  struct vec4 { float x, y, z, w; };
  struct mat4 { float data[16]; };
}`;

    const namespaceDecls = interfaceContent ? '' : `
namespace PlanetGen {
  namespace Rendering {
    class VulkanBase;
    class DescriptorManager;
    class VulkanPipelineManager;
    class BufferManagementSystem;
    class VulkanCommandBufferManager;
    struct CoherenceParameters;
    class VulkanTerrainCoherenceProcessor;
  }
  namespace Generation {
    namespace Physics {
      struct NoisePacket;
    }
  }
}
using namespace PlanetGen::Rendering;
using namespace PlanetGen::Generation;`;

    const forwardDeclarations = basicIncludes + vulkanForwardDecls + glmForwardDecls + namespaceDecls;
    
    const cleanedContent = forwardDeclarations + interfaceContent + content
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('module ') || 
            trimmed.startsWith('import ') ||
            trimmed === 'module;') {
          return false;
        }
        if (trimmed.startsWith('#include <vulkan/') ||
            trimmed.startsWith('#include <glm/') ||
            trimmed.startsWith('#include <algorithm>') ||
            trimmed.startsWith('#include <numeric>') ||
            trimmed.startsWith('#include <vector>') ||
            trimmed.startsWith('#include <unordered_map>') ||
            trimmed.startsWith('#include <future>') ||
            trimmed.startsWith('#include <random>')) {
          return false;
        }
        return true;
      })
      .join('\n');
    
    try {
      await fs.writeFile(tempFile, cleanedContent);
      
      const args = [
        '-fsyntax-only',
        '-std=c++23',
        '-fno-modules',
        '-fno-implicit-modules',
        '-Xclang', '-ast-dump=json',
        '-fno-diagnostics-color',
        ...this.includePathsCache.map(p => `-I${p}`),
        tempFile
      ];

      const compileFlags = this.getCompileFlags(filePath);
      args.push(...compileFlags);

      console.log(`Clang command (temp file): ${this.clangPath} ${args.join(' ')}`);
      
      return new Promise((resolve, reject) => {
        const clang = spawn(this.clangPath, args);
        const StreamValues = require('stream-json/streamers/StreamValues');
        const parser = StreamValues.withParser();
        const relevantContent: string[] = [];
        let processedNodes = 0;

        clang.stdout.pipe(parser);

        parser.on('data', (data: any) => {
          const node = data.value;
          processedNodes++;
          // Filter out external library nodes in temp file mode too
          if (this.isMainFileNode(node, filePath) && !node.isImplicit) {
            if (['CXXRecordDecl', 'CXXMethodDecl', 'FunctionDecl', 'NamespaceDecl'].includes(node.kind)) {
              relevantContent.push(JSON.stringify(node));
            }
          }
          if (processedNodes % 1000 === 0) {
            console.log(`📊 Temp file Progress: ${processedNodes} nodes processed, ${relevantContent.length} relevant nodes found.`);
          }
        });

        parser.on('end', () => {
          fs.unlink(tempFile).catch(() => {});
          console.log(`✅ Temp file streaming completed: ${relevantContent.length} nodes`);
          resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
        });

        parser.on('error', (err: any) => {
          fs.unlink(tempFile).catch(() => {});
          if (relevantContent.length > 0) {
            console.warn(`Temp file JSON stream ended with an error, but recovering ${relevantContent.length} nodes.`);
            resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
          } else {
            reject(new Error(`Temp file JSON streaming failed: ${err.message}`));
          }
        });

        const stderrChunks: Buffer[] = [];
        clang.stderr.on('data', (data: Buffer) => {
          stderrChunks.push(data);
        });

        let isResolved = false;
        
        const handleClose = (code: number | null) => {
          if (isResolved) return;
          isResolved = true;
          
          fs.unlink(tempFile).catch(() => {});
          
          if (code !== 0) {
            const stderr = Buffer.concat(stderrChunks).toString('utf-8');
            
            // Check for fatal errors that indicate Clang can't proceed
            const isFatalError = stderr.includes('fatal error:') || 
                                stderr.includes('too many errors emitted') ||
                                stderr.includes('stopping now');
            
            if (isFatalError || relevantContent.length === 0) {
              console.warn(`Clang (temp file) process exited with code ${code} due to fatal errors. Stderr: ${stderr.substring(0, 500)}...`);
              reject(new Error(`No AST output from Clang`));
            } else {
              console.warn(`Clang (temp file) process exited with code ${code}, but recovering ${relevantContent.length} nodes. Stderr: ${stderr.substring(0, 200)}...`);
              resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
            }
          } else {
            resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
          }
        };
        
        clang.on('close', handleClose);
        clang.on('exit', handleClose);
        
        // Handle process errors
        clang.on('error', (error: any) => {
          if (isResolved) return;
          isResolved = true;
          
          fs.unlink(tempFile).catch(() => {});
          console.warn(`Clang process error: ${error.message}`);
          reject(new Error(`Clang process failed: ${error.message}`));
        });

        // Shorter timeout with more aggressive handling
        const timeout = setTimeout(() => {
          if (isResolved) return;
          isResolved = true;
          
          // Force kill the process
          try {
            clang.kill('SIGKILL');
          } catch (e) {
            // Process might already be dead
          }
          
          fs.unlink(tempFile).catch(() => {});
          
          if (relevantContent.length > 0) {
            console.warn(`Clang (temp file) parsing timed out, but recovering ${relevantContent.length} nodes.`);
            resolve(`{"kind": "TranslationUnitDecl", "inner": [${relevantContent.join(',')}]}`);
          } else {
            console.warn(`Clang (temp file) parsing timed out with no output.`);
            reject(new Error(`No AST output from Clang`));
          }
        }, 30000); // Reduced to 30 seconds
        
        // Clear timeout if we resolve normally
        clang.on('close', () => clearTimeout(timeout));
      });
    } catch (error) {
      fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  /**
   * Parse AST print output (lightweight mode)
   */
  private parseAstPrint(output: string, classes: ClassInfo[], methods: MethodSignature[], functions: MethodSignature[]): void {
    const lines = output.split('\n');
    let currentClass: string | undefined;
    let currentNamespace: string | undefined;
    let inClass = false;

    // First pass: detect namespace
    const namespaceMatch = output.match(/namespace\s+([\w:]+)\s*\{/);
    if (namespaceMatch) {
      currentNamespace = namespaceMatch[1];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Enhanced class detection
      const classMatch = line.match(/^\s*(class|struct)\s+(\w+)/);
      if (classMatch) {
        currentClass = classMatch[2];
        
        // Skip STL and external library classes
        if (this.isExternalSymbolName(currentClass, currentNamespace)) {
          inClass = false;
          currentClass = undefined;
          continue;
        }
        
        inClass = true;
        
        // Look for inheritance
        const baseClasses: string[] = [];
        const inheritanceMatch = line.match(/:\s*(.+)/);
        if (inheritanceMatch) {
          baseClasses.push(...inheritanceMatch[1].split(',').map(s => s.trim()));
        }
        
        classes.push({
          name: currentClass,
          namespace: currentNamespace,
          baseClasses,
          interfaces: [],
          methods: [],
          members: [],
          isTemplate: line.includes('template'),
          location: { line: i + 1, column: 0 }
        });
        continue;
      }

      // Detect qualified method definitions (Class::method patterns)
      const qualifiedMethodMatch = line.match(/^(\w+)\s+([\w:]+)::([\w~]+)\s*\(/);
      if (qualifiedMethodMatch) {
        const returnType = qualifiedMethodMatch[1];
        const fullClassName = qualifiedMethodMatch[2];
        const className = fullClassName.split('::').pop() || '';
        const methodName = qualifiedMethodMatch[3];
        
        // Skip STL and external library methods
        if (this.isExternalSymbolName(className, fullClassName.includes('::') ? fullClassName : currentNamespace)) {
          continue;
        }
        
        // Extract parameters
        const paramMatch = line.match(/\(([^)]*)\)/);
        const parameters = paramMatch ? this.parseParameters(paramMatch[1]) : [];
        
        methods.push({
          name: methodName,
          className: className,
          parameters,
          returnType,
          visibility: 'public',
          isVirtual: line.includes('virtual'),
          isStatic: line.includes('static'),
          isConst: line.includes('const'),
          location: { line: i + 1, column: 0 }
        });
        continue;
      }

      // Constructor detection (ClassName::ClassName pattern)
      const constructorMatch = line.match(/([\w:]+)::([\w:]+)\s*\(/);
      if (constructorMatch) {
        const fullClassName = constructorMatch[1];
        const methodName = constructorMatch[2];
        const className = fullClassName.split('::').pop() || '';
        
        if (className === methodName) { // Constructor
          // Skip STL and external library constructors
          if (this.isExternalSymbolName(className, fullClassName.includes('::') ? fullClassName : currentNamespace)) {
            continue;
          }
          
          const paramMatch = line.match(/\(([^)]*)\)/);
          const parameters = paramMatch ? this.parseParameters(paramMatch[1]) : [];
          
          methods.push({
            name: methodName,
            className: className,
            parameters,
            returnType: '', // Constructors have no return type
            visibility: 'public',
            isVirtual: false,
            isStatic: false,
            isConst: false,
            location: { line: i + 1, column: 0 }
          });
          continue;
        }
      }

      // Detect end of class
      if (inClass && line.match(/^}/)) {
        inClass = false;
        currentClass = undefined;
        continue;
      }

      // Regular function/method declarations
      const funcMatch = line.match(/^\s*(?:virtual\s+)?(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:explicit\s+)?([\w:]+\s+)?(\w+)\s*\([^)]*\)/);
      if (funcMatch && !line.includes('~')) {
        const returnType = funcMatch[1]?.trim() || 'void';
        const methodName = funcMatch[2];
        
        if (methodName && !['if', 'for', 'while', 'switch', 'return', 'sizeof'].includes(methodName)) {
          const paramMatch = line.match(/\(([^)]*)\)/);
          const parameters = paramMatch ? this.parseParameters(paramMatch[1]) : [];
          
          const methodInfo: MethodSignature = {
            name: methodName,
            className: inClass ? currentClass : undefined,
            parameters,
            returnType,
            visibility: 'public',
            isVirtual: line.includes('virtual'),
            isStatic: line.includes('static'),
            isConst: line.includes('const'),
            location: { line: i + 1, column: 0 }
          };

          if (inClass) {
            methods.push(methodInfo);
          } else {
            functions.push(methodInfo);
          }
        }
      }
    }
  }

  private parseParameters(paramString: string): any[] {
    if (!paramString.trim()) return [];
    
    return paramString.split(',').map(param => {
      const trimmed = param.trim();
      const parts = trimmed.split(/\s+/);
      const name = parts.pop() || '';
      const type = parts.join(' ') || 'unknown';
      
      return {
        name: name.replace(/[*&]/, ''),
        type: type,
        isReference: trimmed.includes('&'),
        isPointer: trimmed.includes('*'),
        isConst: trimmed.includes('const')
      };
    });
  }

  private traverseAst(
    node: any, 
    callbacks: {
      onClass?: (node: any) => void;
      onMethod?: (node: any, className?: string) => void;
      onFunction?: (node: any) => void;
    },
    currentClass?: string
  ): void {
    if (!node) return;

    // Handle different node types
    switch (node.kind) {
      case 'CXXRecordDecl':
        if (node.name && !node.isImplicit) {
          callbacks.onClass?.(node);
          // Traverse class members
          if (node.inner) {
            node.inner.forEach((child: any) => 
              this.traverseAst(child, callbacks, node.name)
            );
          }
        }
        break;

      case 'CXXMethodDecl':
        if (!node.isImplicit) {
          callbacks.onMethod?.(node, currentClass);
        }
        break;

      case 'FunctionDecl':
        if (!currentClass && !node.isImplicit) {
          callbacks.onFunction?.(node);
        }
        break;

      case 'NamespaceDecl':
      case 'TranslationUnitDecl':
        // Continue traversing
        if (node.inner) {
          node.inner.forEach((child: any) => 
            this.traverseAst(child, callbacks, currentClass)
          );
        }
        break;
    }

    // Traverse children if not already done
    if (node.inner && !['CXXRecordDecl', 'NamespaceDecl', 'TranslationUnitDecl'].includes(node.kind)) {
      node.inner.forEach((child: any) => 
        this.traverseAst(child, callbacks, currentClass)
      );
    }
  }

  private parseClassNode(node: any): ClassInfo {
    const bases = node.bases || [];
    
    return {
      name: node.name,
      namespace: this.extractNamespace(node),
      baseClasses: bases
        .filter((b: any) => b.access === 'public')
        .map((b: any) => b.type.qualType),
      interfaces: [], // Would need to identify pure virtual base classes
      methods: [], // Methods are collected separately
      members: this.extractMembers(node),
      isTemplate: node.templateParams !== undefined,
      templateParams: node.templateParams?.map((p: any) => p.name),
      location: this.extractLocation(node)
    };
  }

  private parseMethodNode(node: any, className?: string): MethodSignature {
    const params = node.params || [];
    
    return {
      name: node.name,
      className,
      parameters: params.map((p: any) => this.parseParameter(p)),
      returnType: node.type?.qualType?.split('(')[0]?.trim() || 'void',
      visibility: this.extractVisibility(node),
      isVirtual: node.virtual === true,
      isStatic: node.storageClass === 'static',
      isConst: node.type?.qualType?.includes('const') || false,
      templateParams: node.templateParams?.map((p: any) => p.name),
      location: this.extractLocation(node)
    };
  }

  private parseFunctionNode(node: any): MethodSignature {
    return this.parseMethodNode(node, undefined);
  }

  private parseParameter(param: any): ParameterInfo {
    const type = param.type?.qualType || 'unknown';
    
    return {
      name: param.name || '',
      type: type,
      defaultValue: param.init ? this.extractDefaultValue(param.init) : undefined,
      isConst: type.includes('const'),
      isReference: type.includes('&'),
      isPointer: type.includes('*')
    };
  }

  private extractLocation(node: any): { line: number; column: number } {
    if (node.loc) {
      return {
        line: node.loc.line || 0,
        column: node.loc.col || 0
      };
    }
    return { line: 0, column: 0 };
  }

  private extractVisibility(node: any): 'public' | 'private' | 'protected' {
    return node.access || 'public';
  }

  private extractNamespace(node: any): string | undefined {
    // Would need to track namespace context during traversal
    return undefined;
  }

  private extractMembers(classNode: any): any[] {
    // Extract field declarations
    const members: any[] = [];
    
    if (classNode.inner) {
      classNode.inner
        .filter((n: any) => n.kind === 'FieldDecl')
        .forEach((field: any) => {
          members.push({
            name: field.name,
            type: field.type?.qualType || 'unknown',
            visibility: this.extractVisibility(field),
            isStatic: field.storageClass === 'static',
            isConst: field.type?.qualType?.includes('const') || false
          });
        });
    }
    
    return members;
  }

  private extractDefaultValue(initNode: any): string | undefined {
    // Simplified - would need to handle various expression types
    if (initNode.kind === 'IntegerLiteral') {
      return initNode.value;
    }
    if (initNode.kind === 'StringLiteral') {
      return `"${initNode.value}"`;
    }
    return undefined;
  }

  private async extractIncludes(filePath: string): Promise<any[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const includeRegex = /#include\s*[<"]([^>"]+)[>"]/g;
    const includes: any[] = [];
    
    let match;
    while ((match = includeRegex.exec(content)) !== null) {
      includes.push({
        module: match[1],
        symbols: [], // Would need to track what's used from each include
        isSystem: match[0].includes('<'),
        location: { line: content.substring(0, match.index).split('\n').length, column: 0 }
      });
    }
    
    return includes;
  }

  private identifyExports(classes: any[], methods: any[], functions: any[]): any[] {
    const exports: any[] = [];
    
    // Export public classes
    classes.forEach(c => {
      exports.push({
        symbol: c.name,
        type: 'class' as const,
        signature: `class ${c.name}`,
        location: c.location
      });
    });
    
    // Export public methods and functions
    [...methods, ...functions]
      .filter(m => m.visibility === 'public' || !m.className)
      .forEach(m => {
        exports.push({
          symbol: m.name,
          type: 'function' as const,
          signature: `${m.returnType} ${m.name}(${m.parameters.map((p: any) => p.type).join(', ')})`,
          location: m.location
        });
      });
    
    return exports;
  }

  async setIncludePaths(paths: string[]): Promise<void> {
    this.includePathsCache = paths;
  }

  async detectIncludePaths(projectPath: string): Promise<void> {
    // Auto-detect common include paths
    const commonPaths = [
      'include',
      'src',
      'lib',
      'external',
      'third_party',
      'deps'
    ];
    
    const detectedPaths: string[] = [];
    
    for (const dir of commonPaths) {
      const fullPath = path.join(projectPath, dir);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          detectedPaths.push(fullPath);
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    this.includePathsCache = detectedPaths;
    
    // Also detect module paths and compilation database
    await this.detectModulePaths(projectPath);
    await this.loadCompilationDatabase(projectPath);
  }

  private async detectModulePaths(projectPath: string): Promise<void> {
    const moduleDirs = [
      'modules',
      'build/modules',
      'build/CMakeFiles',
      'cmake-build-debug/modules',
      'cmake-build-release/modules',
      'out/modules',
      '.modules'
    ];
    
    const detectedModulePaths: string[] = [];
    
    for (const dir of moduleDirs) {
      const fullPath = path.join(projectPath, dir);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          detectedModulePaths.push(fullPath);
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    this.modulePathsCache = detectedModulePaths;
  }

  private async loadCompilationDatabase(projectPath: string): Promise<void> {
    const compileCommandsPath = path.join(projectPath, 'compile_commands.json');
    try {
      const content = await fs.readFile(compileCommandsPath, 'utf-8');
      this.compilationDatabase = JSON.parse(content);
    } catch (e) {
      // No compilation database available
    }
  }

  private getCompileFlags(filePath: string): string[] {
    if (!this.compilationDatabase) return [];
    
    const entry = this.compilationDatabase.find((cmd: any) => 
      cmd.file === filePath || path.resolve(cmd.file) === path.resolve(filePath)
    );
    
    if (entry && entry.command) {
      // Parse compile command to extract flags
      const args = entry.command.split(/\s+/);
      return args.filter((arg: string) => 
        arg.startsWith('-I') || 
        arg.startsWith('-isystem') ||
        arg.startsWith('-std=') || 
        arg.startsWith('-stdlib=') ||
        arg.startsWith('-fmodule') ||
        arg.startsWith('-fexperimental-modules') ||
        arg.startsWith('-fprebuilt-module-path=') ||
        arg === '-fPIC'
      );
    }
    
    return [];
  }

  /**
   * Check if a file path is from an external library that should be filtered out
   */
  private isExternalLibraryFile(filePath: string): boolean {
    const normalizedPath = filePath.toLowerCase();
    
    // Vulkan SDK files
    if (normalizedPath.includes('/vulkan-sdk/') || 
        normalizedPath.includes('vulkan/vulkan') ||
        normalizedPath.includes('/vulkan/') ||
        normalizedPath.includes('vk_platform.h') ||
        normalizedPath.includes('vk_layer') ||
        normalizedPath.includes('vulkan_core.h')) {
      return true;
    }
    
    // GLM library files
    if (normalizedPath.includes('/glm/') ||
        normalizedPath.includes('external/glm/') ||
        normalizedPath.includes('glm.hpp')) {
      return true;
    }
    
    // Standard library and system headers
    if (normalizedPath.includes('/usr/include/') ||
        normalizedPath.includes('/usr/lib/') ||
        normalizedPath.includes('/usr/local/include/') ||
        normalizedPath.includes('/opt/') ||
        normalizedPath.includes('/system/') ||
        normalizedPath.includes('bits/') ||
        normalizedPath.includes('__') || // Double underscore typically indicates system/internal headers
        normalizedPath.includes('/c++/') || // C++ standard library path
        normalizedPath.includes('type_traits') ||
        normalizedPath.includes('iostream') ||
        normalizedPath.includes('vector') ||
        normalizedPath.includes('string') ||
        normalizedPath.includes('memory') ||
        normalizedPath.includes('algorithm') ||
        normalizedPath.includes('functional') ||
        normalizedPath.includes('utility') ||
        normalizedPath.includes('iterator') ||
        normalizedPath.includes('numeric') ||
        normalizedPath.includes('unordered_map') ||
        normalizedPath.includes('unordered_set') ||
        normalizedPath.includes('tuple') ||
        normalizedPath.includes('array') ||
        normalizedPath.includes('deque') ||
        normalizedPath.includes('list') ||
        normalizedPath.includes('map') ||
        normalizedPath.includes('set') ||
        normalizedPath.includes('queue') ||
        normalizedPath.includes('stack') ||
        normalizedPath.includes('fstream') ||
        normalizedPath.includes('sstream') ||
        normalizedPath.includes('iomanip') ||
        normalizedPath.includes('chrono') ||
        normalizedPath.includes('thread') ||
        normalizedPath.includes('mutex') ||
        normalizedPath.includes('condition_variable') ||
        normalizedPath.includes('future') ||
        normalizedPath.includes('atomic') ||
        normalizedPath.includes('random') ||
        normalizedPath.includes('limits') ||
        normalizedPath.includes('exception') ||
        normalizedPath.includes('stdexcept') ||
        normalizedPath.includes('new') ||
        normalizedPath.includes('cstdlib') ||
        normalizedPath.includes('cstdio') ||
        normalizedPath.includes('cstring') ||
        normalizedPath.includes('cmath') ||
        normalizedPath.includes('cassert') ||
        normalizedPath.includes('cctype') ||
        normalizedPath.includes('cstdint') ||
        normalizedPath.includes('cstddef')) {
      return true;
    }
    
    // External dependencies and build artifacts
    if (normalizedPath.includes('_deps/') ||
        normalizedPath.includes('build/') ||
        normalizedPath.includes('build_') ||
        normalizedPath.includes('cmake-build-') ||
        normalizedPath.includes('external/') ||
        normalizedPath.includes('third_party/') ||
        normalizedPath.includes('vendor/') ||
        normalizedPath.includes('.cache/')) {
      return true;
    }
    
    // Other common external libraries
    if (normalizedPath.includes('boost/') ||
        normalizedPath.includes('eigen/') ||
        normalizedPath.includes('fmt/') ||
        normalizedPath.includes('spdlog/') ||
        normalizedPath.includes('gtest/') ||
        normalizedPath.includes('benchmark/')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if AST node is from our project source files (not external libraries)
   */
  private isMainFileNode(node: any, mainFilePath: string): boolean {
    if (!node.loc) return false;
    
    const targetFile = path.resolve(mainFilePath);
    const targetBasename = path.basename(mainFilePath);
    
    // Extract project base path from the main file path
    // This makes it work for any project, not just planet_procgen
    const projectRoot = this.findProjectRoot(targetFile);
    
    // Helper function to check if a file belongs to the project
    const isProjectFile = (filePath: string): boolean => {
      // Skip external library files entirely
      if (this.isExternalLibraryFile(filePath)) {
        return false;
      }
      
      const resolvedFile = path.resolve(filePath);
      
      // Exact match with target file
      if (resolvedFile === targetFile) return true;
      
      // Check if file is within project root
      if (projectRoot && resolvedFile.startsWith(projectRoot)) {
        // But exclude build directories even within project
        const relativePath = path.relative(projectRoot, resolvedFile);
        if (relativePath.includes('build/') || 
            relativePath.includes('cmake-build-') ||
            relativePath.includes('.cache/') ||
            relativePath.includes('external/') ||
            relativePath.includes('third_party/')) {
          return false;
        }
        return true;
      }
      
      // Fallback: check if it's the same filename (might be symlinked or have different paths)
      const nodeBasename = path.basename(filePath);
      if (nodeBasename === targetBasename) {
        // But make sure it's not from a system directory
        if (!filePath.includes('/usr/') && 
            !filePath.includes('/opt/') &&
            !filePath.includes('/__/')) {
          return true;
        }
      }
      
      return false;
    };
    
    // Check primary location
    if (node.loc.file) {
      if (isProjectFile(node.loc.file)) {
        return true;
      }
    }
    
    // Check expansion location (for macros)
    if (node.loc.expansionLoc && node.loc.expansionLoc.file) {
      if (isProjectFile(node.loc.expansionLoc.file)) {
        return true;
      }
    }
    
    // Check spelling location (for template instantiations)
    if (node.loc.spellingLoc && node.loc.spellingLoc.file) {
      if (isProjectFile(node.loc.spellingLoc.file)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a symbol name indicates it's from an external library
   */
  private isExternalSymbolName(symbolName: string, namespace?: string): boolean {
    const fullName = namespace ? `${namespace}::${symbolName}` : symbolName;
    
    // STL symbols
    if (fullName.startsWith('std::') || symbolName.startsWith('std::')) {
      return true;
    }
    
    // Common STL class names (even without std:: prefix in AST print)
    const stlClasses = [
      'allocator', 'basic_string', 'char_traits', 'vector', 'map', 'set',
      'unordered_map', 'unordered_set', 'pair', 'tuple', 'unique_ptr',
      'shared_ptr', 'weak_ptr', 'function', 'optional', 'variant',
      'string_view', 'array', 'deque', 'list', 'forward_list',
      'priority_queue', 'queue', 'stack', 'bitset', 'regex',
      'iterator', 'reverse_iterator', 'back_insert_iterator',
      'istream', 'ostream', 'iostream', 'fstream', 'stringstream',
      'exception', 'runtime_error', 'logic_error', 'out_of_range'
    ];
    
    if (stlClasses.includes(symbolName)) {
      return true;
    }
    
    // System/internal symbols
    if (symbolName.startsWith('__') || symbolName.startsWith('_')) {
      return true;
    }
    
    // Vulkan SDK types (these are C types, not classes we want to index)
    if (symbolName.startsWith('Vk') && symbolName.length > 2 && symbolName[2] === symbolName[2].toUpperCase()) {
      // VkDevice, VkBuffer, etc. are handles, not classes
      return true;
    }
    
    // GLM types
    if (namespace === 'glm' || fullName.startsWith('glm::')) {
      return true;
    }
    
    // Other external library patterns
    if (fullName.includes('boost::') || 
        fullName.includes('Eigen::') ||
        fullName.includes('fmt::') ||
        fullName.includes('spdlog::')) {
      return true;
    }
    
    return false;
  }

  /**
   * Find the project root directory from a file path
   */
  private findProjectRoot(filePath: string): string | null {
    let current = path.dirname(filePath);
    
    // Walk up the directory tree looking for project markers
    while (current !== path.dirname(current)) {
      // Check for common project root indicators
      try {
        const entries = require('fs').readdirSync(current);
        if (entries.includes('CMakeLists.txt') ||
            entries.includes('package.json') ||
            entries.includes('.git') ||
            entries.includes('compile_commands.json') ||
            entries.includes('Makefile')) {
          return current;
        }
      } catch (e) {
        // Directory not accessible
      }
      
      current = path.dirname(current);
    }
    
    // Fallback: assume src/ or include/ indicates project structure
    const srcMatch = filePath.match(/^(.*?)\/(?:src|include)\//);
    if (srcMatch) {
      return srcMatch[1];
    }
    
    return null;
  }

  /**
   * Extract semantic tags for methods/functions based on name and signature
   */
  private extractMethodSemanticTags(node: any): string[] {
    const tags: string[] = [];
    const name = (node.name || '').toLowerCase();
    const returnType = node.type?.qualType || '';
    
    // Action tags
    if (name.includes('generate')) tags.push('generator');
    if (name.includes('create')) tags.push('factory');
    if (name.includes('compute')) tags.push('compute');
    if (name.includes('render')) tags.push('render');
    if (name.includes('update')) tags.push('updater');
    if (name.includes('process')) tags.push('processor');
    if (name.includes('initialize') || name.includes('init')) tags.push('initializer');
    if (name.includes('cleanup') || name.includes('shutdown')) tags.push('destructor');
    if (name.includes('allocate') || name.includes('alloc')) tags.push('memory-manager');
    if (name.includes('deallocate') || name.includes('free')) tags.push('memory-manager');
    
    // GPU/Vulkan patterns
    if (name.includes('vulkan') || name.includes('vk')) tags.push('vulkan');
    if (name.includes('gpu') || name.includes('compute')) tags.push('gpu-compute');
    if (name.includes('cpu')) tags.push('cpu-compute');
    if (name.includes('buffer')) tags.push('buffer-management');
    if (name.includes('texture')) tags.push('texture-management');
    if (name.includes('shader')) tags.push('shader-management');
    if (name.includes('pipeline')) tags.push('pipeline-management');
    
    // Async patterns
    if (name.includes('async') || name.includes('await')) tags.push('async');
    if (returnType.includes('future') || returnType.includes('promise')) tags.push('async');
    
    // Memory patterns
    if (returnType.includes('vector') && returnType.includes('float')) tags.push('vector-math');
    if (returnType.includes('shared_ptr') || returnType.includes('unique_ptr')) tags.push('smart-pointer');
    
    // File path patterns (if available)
    const location = node.location;
    if (location && location.file) {
      const filePath = location.file.toLowerCase();
      if (filePath.includes('noise')) tags.push('noise-generation');
      if (filePath.includes('terrain')) tags.push('terrain-formation');
      if (filePath.includes('vulkan')) tags.push('vulkan');
      if (filePath.includes('render')) tags.push('rendering');
      if (filePath.includes('compute')) tags.push('gpu-compute');
    }
    
    return [...new Set(tags)];
  }

  /**
   * Extract semantic tags for classes based on name and inheritance
   */
  private extractClassSemanticTags(node: any): string[] {
    const tags: string[] = [];
    const name = (node.name || '').toLowerCase();
    const bases = node.bases || [];
    
    // Class type patterns
    if (name.includes('generator')) tags.push('generator');
    if (name.includes('factory')) tags.push('factory');
    if (name.includes('manager')) tags.push('manager');
    if (name.includes('processor')) tags.push('processor');
    if (name.includes('orchestrator')) tags.push('orchestrator');
    if (name.includes('controller')) tags.push('controller');
    if (name.includes('service')) tags.push('service');
    if (name.includes('handler')) tags.push('handler');
    if (name.includes('builder')) tags.push('builder');
    if (name.includes('provider')) tags.push('provider');
    
    // Technology-specific patterns
    if (name.includes('vulkan') || name.includes('vk')) tags.push('vulkan');
    if (name.includes('gpu')) tags.push('gpu-compute');
    if (name.includes('cpu')) tags.push('cpu-compute');
    if (name.includes('buffer')) tags.push('buffer-management');
    if (name.includes('texture')) tags.push('texture-management');
    if (name.includes('shader')) tags.push('shader-management');
    if (name.includes('pipeline')) tags.push('pipeline-management');
    
    // Inheritance patterns
    if (bases.length > 0) {
      tags.push('derived');
      
      // Check for common base class patterns
      bases.forEach((base: any) => {
        const baseName = (base.type?.qualType || '').toLowerCase();
        if (baseName.includes('singleton')) tags.push('singleton');
        if (baseName.includes('observable')) tags.push('observer-pattern');
        if (baseName.includes('factory')) tags.push('factory-pattern');
        if (baseName.includes('strategy')) tags.push('strategy-pattern');
      });
    }
    
    // Template patterns
    if (node.templateParams && node.templateParams.length > 0) {
      tags.push('template');
      if (node.templateParams.length > 2) tags.push('complex-template');
    }
    
    // File path patterns (if available)
    const location = node.location;
    if (location && location.file) {
      const filePath = location.file.toLowerCase();
      if (filePath.includes('noise')) tags.push('noise-generation');
      if (filePath.includes('terrain')) tags.push('terrain-formation');
      if (filePath.includes('vulkan')) tags.push('vulkan');
      if (filePath.includes('render')) tags.push('rendering');
      if (filePath.includes('compute')) tags.push('gpu-compute');
    }
    
    return [...new Set(tags)];
  }
}

// Example usage:
/*
const parser = new ClangAstParser();
await parser.detectIncludePaths('/path/to/project');
const moduleInfo = await parser.parseFile('/path/to/file.cpp');
console.log(`Found ${moduleInfo.methods.length} methods`);
*/