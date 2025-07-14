import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EnhancedModuleInfo, MethodSignature, ClassInfo } from '../types/essential-features.js';

/**
 * Lightweight Clang Parser that uses targeted queries instead of full AST dump
 * This is much faster and produces smaller output than -ast-dump=json
 */
export class ClangLightweightParser {
  private clangPath: string = 'clang++';
  private includePathsCache: string[] = [];
  private compilationDatabase: any = null;

  async initialize(projectPath: string): Promise<void> {
    // Detect include paths
    await this.detectIncludePaths(projectPath);
    
    // Load compilation database if available
    const compileCommandsPath = path.join(projectPath, 'compile_commands.json');
    try {
      const content = await fs.readFile(compileCommandsPath, 'utf-8');
      this.compilationDatabase = JSON.parse(content);
    } catch {
      // No compilation database
    }
  }

  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    // Use multiple lightweight passes instead of one heavy AST dump
    const [symbols, includes] = await Promise.all([
      this.extractSymbols(filePath),
      this.extractIncludes(filePath)
    ]);

    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods: symbols.methods,
      classes: symbols.classes,
      interfaces: [],
      relationships: [],
      patterns: [],
      imports: includes,
      exports: []
    };
  }

  /**
   * Extract symbols using clang's -fsyntax-only with custom diagnostics
   * This is MUCH faster than full AST dump
   */
  private async extractSymbols(filePath: string): Promise<{
    classes: ClassInfo[];
    methods: MethodSignature[];
  }> {
    return new Promise((resolve, reject) => {
      // Use clang-query or a simpler approach
      const args = [
        '-fsyntax-only',
        '-std=c++23',
        '-Xclang', '-ast-print',
        '-Xclang', '-ast-print-filter=*', // Print all declarations
        ...this.includePathsCache.map(p => `-I${p}`),
        filePath
      ];

      const clang = spawn(this.clangPath, args);
      const stdoutChunks: Buffer[] = [];
      let totalSize = 0;
      const maxSize = 5 * 1024 * 1024; // 5MB limit for AST print

      clang.stdout.on('data', (data: Buffer) => {
        totalSize += data.length;
        if (totalSize > maxSize) {
          clang.kill();
          // Fall back to even simpler parsing
          resolve(this.parseWithNmOrCtags(filePath));
          return;
        }
        stdoutChunks.push(data);
      });

      clang.stderr.on('data', () => {
        // Ignore stderr for now
      });

      clang.on('close', (code) => {
        if (code === 0 || code === 1) { // Allow warnings
          const output = Buffer.concat(stdoutChunks).toString('utf-8');
          resolve(this.parseAstPrintOutput(output));
        } else {
          // Fall back to simpler parsing
          resolve(this.parseWithNmOrCtags(filePath));
        }
      });

      // Kill if taking too long
      setTimeout(() => {
        clang.kill();
        resolve(this.parseWithNmOrCtags(filePath));
      }, 5000); // 5 second timeout
    });
  }

  /**
   * Parse the simplified AST print output
   */
  private parseAstPrintOutput(output: string): {
    classes: ClassInfo[];
    methods: MethodSignature[];
  } {
    const classes: ClassInfo[] = [];
    const methods: MethodSignature[] = [];
    
    const lines = output.split('\n');
    let currentClass: string | undefined;
    let inClass = false;

    for (const line of lines) {
      // Simple pattern matching for declarations
      const classMatch = line.match(/^\s*(class|struct)\s+(\w+)/);
      if (classMatch) {
        currentClass = classMatch[2];
        inClass = true;
        classes.push({
          name: currentClass,
          namespace: undefined,
          baseClasses: [],
          interfaces: [],
          methods: [],
          members: [],
          isTemplate: line.includes('template'),
          location: { line: 0, column: 0 }
        });
        continue;
      }

      // Detect end of class
      if (inClass && line.match(/^}/)) {
        inClass = false;
        currentClass = undefined;
        continue;
      }

      // Function/method declarations
      const funcMatch = line.match(/^\s*(?:virtual\s+)?(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:explicit\s+)?(?:[\w:]+\s+)?(\w+)\s*\([^)]*\)/);
      if (funcMatch && !line.includes('~')) { // Skip destructors
        const methodName = funcMatch[1];
        if (methodName && !['if', 'for', 'while', 'switch', 'return'].includes(methodName)) {
          methods.push({
            name: methodName,
            className: inClass ? currentClass : undefined,
            parameters: [],
            returnType: 'unknown',
            visibility: 'public',
            isVirtual: line.includes('virtual'),
            isStatic: line.includes('static'),
            isConst: line.includes('const'),
            location: { line: 0, column: 0 }
          });
        }
      }
    }

    return { classes, methods };
  }

  /**
   * Ultra-lightweight fallback using nm or simple grep
   */
  private async parseWithNmOrCtags(filePath: string): Promise<{
    classes: ClassInfo[];
    methods: MethodSignature[];
  }> {
    try {
      // Try to compile to object file and use nm
      const objFile = `/tmp/clang_parse_${Date.now()}.o`;
      
      await new Promise<void>((resolve) => {
        const compile = spawn(this.clangPath, [
          '-c', '-std=c++23', '-o', objFile,
          ...this.includePathsCache.map(p => `-I${p}`),
          filePath
        ]);

        compile.on('close', () => resolve());
        setTimeout(() => {
          compile.kill();
          resolve();
        }, 3000);
      });

      // Use nm to extract symbols
      const symbols = await new Promise<string>((resolve) => {
        const nm = spawn('nm', ['--demangle', objFile]);
        let output = '';
        
        nm.stdout.on('data', (data) => {
          output += data.toString();
        });

        nm.on('close', () => {
          fs.unlink(objFile).catch(() => {});
          resolve(output);
        });

        setTimeout(() => {
          nm.kill();
          fs.unlink(objFile).catch(() => {});
          resolve('');
        }, 1000);
      });

      return this.parseNmOutput(symbols);
    } catch {
      // Ultimate fallback: return empty
      return { classes: [], methods: [] };
    }
  }

  /**
   * Parse nm output for symbols
   */
  private parseNmOutput(output: string): {
    classes: ClassInfo[];
    methods: MethodSignature[];
  } {
    const classes = new Set<string>();
    const methods: MethodSignature[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      // Look for demangled C++ symbols
      const match = line.match(/[TW]\s+(.+)/);
      if (match) {
        const symbol = match[1];
        
        // Extract class names
        const classMatch = symbol.match(/(\w+)::/);
        if (classMatch) {
          classes.add(classMatch[1]);
        }

        // Extract method names
        const methodMatch = symbol.match(/(?:(\w+)::)?(\w+)\(/);
        if (methodMatch) {
          methods.push({
            name: methodMatch[2],
            className: methodMatch[1],
            parameters: [],
            returnType: 'unknown',
            visibility: 'public',
            isVirtual: false,
            isStatic: false,
            isConst: false,
            location: { line: 0, column: 0 }
          });
        }
      }
    }

    return {
      classes: Array.from(classes).map(name => ({
        name,
        namespace: undefined,
        baseClasses: [],
        interfaces: [],
        methods: [],
        members: [],
        isTemplate: false,
        location: { line: 0, column: 0 }
      })),
      methods
    };
  }

  /**
   * Extract includes using preprocessor
   */
  private async extractIncludes(filePath: string): Promise<any[]> {
    return new Promise((resolve) => {
      const args = [
        '-E', // Preprocess only
        '-H', // Show headers
        '-std=c++23',
        ...this.includePathsCache.map(p => `-I${p}`),
        filePath
      ];

      const clang = spawn(this.clangPath, args);
      const includes: string[] = [];

      clang.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const match = line.match(/^\.\s+(.+)/);
          if (match) {
            includes.push(match[1]);
          }
        }
      });

      clang.on('close', () => {
        resolve(includes.map(inc => ({
          module: path.basename(inc),
          symbols: [],
          isSystem: inc.includes('/usr/') || inc.includes('/System/'),
          location: { line: 0, column: 0 }
        })));
      });

      setTimeout(() => {
        clang.kill();
        resolve([]);
      }, 2000);
    });
  }

  private async detectIncludePaths(projectPath: string): Promise<void> {
    const candidates = [
      'include',
      'src',
      'lib',
      'third_party',
      'external',
      'vendor'
    ];

    for (const dir of candidates) {
      const fullPath = path.join(projectPath, dir);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          this.includePathsCache.push(fullPath);
        }
      } catch {
        // Directory doesn't exist
      }
    }
  }

  private getCompileFlags(filePath: string): string[] {
    if (!this.compilationDatabase) return [];

    const fileEntry = this.compilationDatabase.find((entry: any) => 
      entry.file === filePath || entry.file.endsWith(path.basename(filePath))
    );

    if (!fileEntry) return [];

    // Extract relevant flags
    const flags: string[] = [];
    const args = fileEntry.command.split(/\s+/);
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('-I') || arg.startsWith('-D') || arg.startsWith('-std=')) {
        flags.push(arg);
      } else if (arg === '-I' || arg === '-D') {
        if (i + 1 < args.length) {
          flags.push(arg, args[++i]);
        }
      }
    }

    return flags;
  }
}