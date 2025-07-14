import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';

/**
 * Intelligent C++ Indexer using Clang's compilation database
 * 
 * This provides:
 * - Accurate symbol indexing with full type information
 * - Incremental updates on file changes
 * - Cross-reference tracking
 * - Template instantiation understanding
 * - Macro expansion tracking
 */
export class ClangIntelligentIndexer extends EventEmitter {
  public db: Database.Database;
  private fileHashes: Map<string, string> = new Map();
  private compilationDatabase: CompileCommand[] = [];
  private indexVersion = 1;
  
  constructor(private projectPath: string, private dbPath: string) {
    super();
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    // Use unified schema manager instead of creating conflicting schemas
    const schemaManager = UnifiedSchemaManager.getInstance();
    schemaManager.initializeDatabase(this.db);
    
    // Create Clang-specific tables that don't conflict with unified schema
    this.db.exec(`
      -- Cross-references (who uses what) - Clang specific
      CREATE TABLE IF NOT EXISTS clang_references (
        from_symbol TEXT NOT NULL,
        to_symbol TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        kind TEXT NOT NULL, -- call, inherit, instantiate, etc.
        PRIMARY KEY (from_symbol, to_symbol, file_path, line, column)
      );

      -- Include dependencies - Clang specific
      CREATE TABLE IF NOT EXISTS clang_includes (
        file_path TEXT NOT NULL,
        included_path TEXT NOT NULL,
        is_system BOOLEAN,
        line INTEGER NOT NULL,
        PRIMARY KEY (file_path, included_path)
      );

      -- Template instantiations - Clang specific
      CREATE TABLE IF NOT EXISTS clang_template_instantiations (
        template_usr TEXT NOT NULL,
        instantiation_usr TEXT NOT NULL,
        template_args TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        PRIMARY KEY (template_usr, instantiation_usr)
      );

      -- Macro definitions and expansions - Clang specific
      CREATE TABLE IF NOT EXISTS clang_macros (
        name TEXT NOT NULL,
        definition TEXT,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        is_function_like BOOLEAN,
        parameters TEXT,
        PRIMARY KEY (name, file_path)
      );

      -- Call graph - Clang specific
      CREATE TABLE IF NOT EXISTS clang_call_graph (
        caller_usr TEXT NOT NULL,
        callee_usr TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        is_virtual_call BOOLEAN,
        PRIMARY KEY (caller_usr, callee_usr, file_path, line)
      );

      -- Inheritance hierarchy - Clang specific
      CREATE TABLE IF NOT EXISTS clang_inheritance (
        derived_usr TEXT NOT NULL,
        base_usr TEXT NOT NULL,
        access_specifier TEXT NOT NULL,
        is_virtual BOOLEAN,
        PRIMARY KEY (derived_usr, base_usr)
      );

      -- Create indexes for fast queries (only on actual tables, not views)
      CREATE INDEX IF NOT EXISTS idx_clang_ref_from ON clang_references(from_symbol);
      CREATE INDEX IF NOT EXISTS idx_clang_ref_to ON clang_references(to_symbol);
      CREATE INDEX IF NOT EXISTS idx_clang_includes_file ON clang_includes(file_path);
      CREATE INDEX IF NOT EXISTS idx_clang_call_caller ON clang_call_graph(caller_usr);
      CREATE INDEX IF NOT EXISTS idx_clang_call_callee ON clang_call_graph(callee_usr);
    `);
  }

  /**
   * Load compilation database (compile_commands.json)
   */
  async loadCompilationDatabase(): Promise<void> {
    const possiblePaths = [
      path.join(this.projectPath, 'build_clang', 'compile_commands.json'), // Prioritize build_clang
      path.join(this.projectPath, 'build', 'compile_commands.json'),
      path.join(this.projectPath, 'compile_commands.json'),
      path.join(this.projectPath, 'cmake-build-debug', 'compile_commands.json')
    ];

    for (const dbPath of possiblePaths) {
      try {
        const content = await fs.readFile(dbPath, 'utf-8');
        this.compilationDatabase = JSON.parse(content);
        console.log(`Loaded compilation database from: ${dbPath} (${this.compilationDatabase.length} commands)`);
        this.emit('compilation-database:loaded', { path: dbPath, commands: this.compilationDatabase.length });
        return;
      } catch (e) {
        // Try next path
      }
    }

    // If no compilation database found, we can still try to index with guessed flags
    this.emit('compilation-database:not-found');
  }

  /**
   * Index a single file using clang
   */
  async indexFile(filePath: string, force: boolean = false): Promise<void> {
    // Check if file needs reindexing
    if (!force && !await this.needsReindex(filePath)) {
      this.emit('file:skipped', { path: filePath, reason: 'up-to-date' });
      return;
    }

    const startTime = Date.now();
    
    try {
      // Get compile command for this file
      const compileCommand = this.getCompileCommand(filePath);
      
      // Generate AST and index information using clang
      const indexData = await this.runClangIndexer(filePath, compileCommand);
      
      // Store in database
      await this.storeIndexData(filePath, indexData);
      
      // Update file tracking
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const hash = createHash('sha256').update(fileContent).digest('hex');
      
      this.db.prepare(`
        INSERT OR REPLACE INTO indexed_files (path, hash, last_indexed, compile_flags, dependencies)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        filePath,
        hash,
        Date.now(),
        JSON.stringify(compileCommand.flags),
        JSON.stringify(indexData.dependencies)
      );
      
      this.fileHashes.set(filePath, hash);
      
      const elapsed = Date.now() - startTime;
      this.emit('file:indexed', { 
        path: filePath, 
        symbols: indexData.symbols.length,
        time: elapsed 
      });
      
    } catch (error) {
      this.emit('file:error', { path: filePath, error });
      throw error;
    }
  }

  /**
   * Run clang with special indexing mode
   */
  private async runClangIndexer(filePath: string, compileCommand: CompileCommand): Promise<IndexData> {
    return new Promise((resolve, reject) => {
      // For C++23 modules, use more targeted AST filtering to reduce output size
      const isModuleFile = filePath.endsWith('.ixx') || filePath.includes('module');
      
      // First expand response files to get module-specific flags
      const expandedFlags = this.expandResponseFiles(compileCommand.flags, compileCommand.directory);
      
      // For modules, try to find available .pcm files
      const moduleFileArgs: string[] = [];
      if (isModuleFile) {
        try {
          const fs = require('fs');
          const buildDir = compileCommand.directory || path.join(this.projectPath, 'build_clang_linux');
          
          // Look for .pcm files in the build directory
          const findPcmFiles = (dir: string): string[] => {
            const results: string[] = [];
            try {
              const files = fs.readdirSync(dir);
              for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory() && file.startsWith('CMakeFiles')) {
                  results.push(...findPcmFiles(fullPath));
                } else if (file.endsWith('.pcm')) {
                  results.push(fullPath);
                }
              }
            } catch (e) {
              // Ignore errors
            }
            return results;
          };
          
          const pcmFiles = findPcmFiles(buildDir);
          // console.log(`Debug: Found ${pcmFiles.length} .pcm files for module dependencies`);
          
          // Add each .pcm file as a module dependency
          for (const pcm of pcmFiles.slice(0, 10)) { // Limit to prevent command line too long
            moduleFileArgs.push('-fmodule-file=' + pcm);
          }
        } catch (e) {
          // console.log('Debug: Could not scan for .pcm files:', e);
        }
      }
      
      const args = [
        '-Xclang', '-ast-dump=json',
        '-fsyntax-only',
        // Exclude system headers and external libraries to cut through noise
        '-fno-implicit-modules',  // Don't auto-import system modules
        // Add module dependencies
        ...moduleFileArgs,
        // Add filtering specifically for our project code
        ...(isModuleFile ? [
          '-Xclang', '-ast-dump-filter', '-Xclang', path.basename(filePath, path.extname(filePath))
        ] : []),
        // Keep all original flags to preserve C++23 module support but add aggressive filtering
        ...expandedFlags.filter(flag => 
          // Only filter out output-related flags that interfere with AST dumping
          !flag.startsWith('-o ') && 
          !flag.includes('.o') &&
          flag !== '-c' &&
          // Keep module-related flags
          !flag.startsWith('-fmodule-output=')
        ),
        // Add flags to minimize template instantiation in GLM
        '-ftemplate-backtrace-limit=1',  // Limit template error cascades
        '-ferror-limit=5',  // Stop early on errors to avoid massive output
        filePath
      ];

      // console.log(`Debug: Running clang++-19 with args:`, args.slice(0, 10), '...');
      // console.log(`Debug: Working directory:`, compileCommand.directory);

      const clang = spawn('clang++-19', args, {
        cwd: compileCommand.directory // Use the directory from compilation database
      });
      let stdout = '';
      let stderr = '';

      // Track when we start getting data to implement early cutoff
      let dataStartTime = 0;
      
      clang.stdout.on('data', (data) => {
        if (dataStartTime === 0) dataStartTime = Date.now();
        
        // Increased limits: 10MB for modules, 20MB for regular files
        const limit = isModuleFile ? 10_000_000 : 20_000_000;
        const timeLimit = 30000; // 30 seconds max
        
        // Cut off based on size OR time to avoid infinite template expansion
        if (stdout.length < limit && (Date.now() - dataStartTime) < timeLimit) {
          stdout += data;
        } else if (stdout.length >= limit) {
          // AST too large, will attempt partial parsing
          clang.kill('SIGTERM'); // Terminate early to stop massive output
        } else {
          // AST parsing timeout, will attempt partial parsing
          clang.kill('SIGTERM');
        }
      });
      clang.stderr.on('data', (data) => stderr += data);

      clang.on('close', (code) => {
        // Accept early termination as success since we intentionally cut off GLM noise
        if (code !== 0 && code !== null && !stderr.includes('SIGTERM')) {
          reject(new Error(`Clang failed: ${stderr}`));
          return;
        }

        try {
          // Check if we have valid JSON output
          if (!stdout.trim()) {
            reject(new Error(`No AST output from Clang`));
            return;
          }
          
          // Try to parse JSON with better error reporting and truncation handling
          let ast;
          try {
            // If output was truncated, try to find a complete JSON object
            let jsonToparse = stdout;
            if (stdout.length >= (isModuleFile ? 10_000_000 : 20_000_000)) {
              // Output was truncated, try to find the last complete JSON object
              const lastBrace = stdout.lastIndexOf('}');
              if (lastBrace > 0) {
                jsonToparse = stdout.substring(0, lastBrace + 1);
                // Attempting to parse truncated JSON
              }
            }
            
            ast = JSON.parse(jsonToparse);
          } catch (jsonError) {
            // If JSON parsing fails due to truncation, try to extract what we can
            // JSON parse failed due to truncation. Attempting to extract partial symbols...
            
            // Try to find individual symbol declarations in the raw text
            const symbolRegex = /"kind":\s*"(FunctionDecl|CXXMethodDecl|VarDecl|CXXRecordDecl|FieldDecl|NamespaceDecl|TypedefDecl|EnumDecl)"[^}]*"name":\s*"([^"]+)"/g;
            const symbolMatches = [];
            let match;
            
            // Extract up to 1000 symbols to avoid memory issues
            while ((match = symbolRegex.exec(stdout)) !== null && symbolMatches.length < 1000) {
              symbolMatches.push(match);
            }
            
            // Found ${symbolMatches.length} potential symbols in truncated AST
            
            const extractedSymbols = symbolMatches.map(match => {
              return {
                kind: match[1],
                name: match[2],
                loc: { file: filePath, line: 0 }
              };
            }).filter(sym => {
              // Filter out common stdlib symbols to focus on project symbols
              return !sym.name.startsWith('__') && 
                     !sym.name.includes('std::') &&
                     !['value', 'type', 'instance'].includes(sym.name);
            });
            
            // Create AST with extracted symbols, giving them proper structure
            ast = {
              kind: 'TranslationUnitDecl',
              inner: extractedSymbols.map(sym => ({
                ...sym,
                loc: { file: filePath, line: 1 },
                // Add additional fields that the walker expects
                inner: [],
                name: sym.name,
                kind: sym.kind
              })),
              loc: { file: filePath }
            };
            
            // Extracted ${extractedSymbols.length} symbols from truncated AST
          }
          
          const indexData = this.extractIndexData(ast, filePath);
          resolve(indexData);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Extract indexing information from Clang AST
   */
  private extractIndexData(ast: any, filePath: string): IndexData {
    const indexData: IndexData = {
      symbols: [],
      references: [],
      includes: [],
      templateInstantiations: [],
      macros: [],
      callGraph: [],
      inheritance: [],
      dependencies: []
    };

    const symbolMap = new Map<string, Symbol>();
    
    // First pass: collect all symbols
    this.walkAst(ast, {
      onSymbol: (symbol) => {
        // console.log(`Debug: Adding symbol ${symbol.name} (${symbol.kind}) to index`);
        indexData.symbols.push(symbol);
        if (symbol.usr) {
          symbolMap.set(symbol.usr, symbol);
        }
      },
      onReference: (ref) => indexData.references.push(ref),
      onInclude: (inc) => {
        indexData.includes.push(inc);
        indexData.dependencies.push(inc.includedPath);
      },
      onTemplateInstantiation: (inst) => indexData.templateInstantiations.push(inst),
      onMacro: (macro) => indexData.macros.push(macro),
      onCall: (call) => indexData.callGraph.push(call),
      onInheritance: (inh) => indexData.inheritance.push(inh)
    });

    return indexData;
  }

  /**
   * Walk Clang AST and extract information
   */
  private walkAst(node: any, callbacks: AstCallbacks, context: AstContext = {}): void {
    if (!node) return;

    // Extract location
    const location = this.extractLocation(node);

    switch (node.kind) {
      case 'FunctionDecl':
      case 'CXXMethodDecl':
        this.handleFunction(node, callbacks, context, location);
        break;
        
      case 'CXXRecordDecl':
      case 'ClassTemplateDecl':
        this.handleClass(node, callbacks, context, location);
        break;
        
      case 'VarDecl':
      case 'FieldDecl':
        this.handleVariable(node, callbacks, context, location);
        break;
        
      case 'CallExpr':
      case 'CXXMemberCallExpr':
        this.handleCall(node, callbacks, context, location);
        break;
        
      case 'DeclRefExpr':
      case 'MemberExpr':
        this.handleReference(node, callbacks, context, location);
        break;
        
      default:
        // For extracted symbols from truncated AST, create basic symbols
        if (node.name && node.kind) {
          const symbol: Symbol = {
            name: node.name,
            kind: this.mapKindToSimpleType(node.kind),
            filePath: location.file || '/unknown',
            line: location.line || 0,
            column: location.column || 0,
            isDefinition: true,
            visibility: 'public',
            isTemplate: false,
            usr: this.generateUSR(node)
          };
          callbacks.onSymbol(symbol);
        }
        break;
    }

    // Recursively walk children
    if (node.inner) {
      for (const child of node.inner) {
        this.walkAst(child, callbacks, {
          ...context,
          parent: node
        });
      }
    }
  }
  
  private mapKindToSimpleType(kind: string): string {
    switch (kind) {
      case 'FunctionDecl':
      case 'CXXMethodDecl':
        return 'function';
      case 'CXXRecordDecl':
      case 'ClassTemplateDecl':
        return 'class';
      case 'VarDecl':
      case 'FieldDecl':
        return 'variable';
      default:
        return kind.toLowerCase();
    }
  }

  private handleFunction(node: any, callbacks: AstCallbacks, context: AstContext, location: Location): void {
    const symbol: Symbol = {
      name: node.name || 'anonymous',
      mangledName: node.mangledName,
      kind: node.kind === 'CXXMethodDecl' ? 'method' : 'function',
      filePath: location.file || context.parent?.loc?.file || '/unknown',
      line: location.line || 0,
      column: location.column || 0,
      isDefinition: node.inner?.some((n: any) => n.kind === 'CompoundStmt') || true,
      signature: this.buildFunctionSignature(node),
      returnType: node.type?.qualType?.split('(')[0]?.trim(),
      parentSymbol: context.parent?.name,
      visibility: node.access || 'public',
      isTemplate: node.isTemplated || false,
      templateParams: node.templateParams,
      usr: node.usr || this.generateUSR(node)
    };

    callbacks.onSymbol(symbol);
  }

  private handleClass(node: any, callbacks: AstCallbacks, context: AstContext, location: Location): void {
    const symbol: Symbol = {
      name: node.name || 'anonymous',
      kind: 'class',
      filePath: location.file,
      line: location.line,
      column: location.column,
      isDefinition: node.completeDefinition || false,
      parentSymbol: context.parent?.name,
      visibility: 'public',
      isTemplate: node.kind === 'ClassTemplateDecl',
      templateParams: node.templateParams,
      usr: node.usr || this.generateUSR(node)
    };

    callbacks.onSymbol(symbol);

    // Handle inheritance
    if (node.bases) {
      for (const base of node.bases) {
        callbacks.onInheritance({
          derivedUsr: symbol.usr!,
          baseUsr: base.usr || base.type?.qualType,
          accessSpecifier: base.access || 'public',
          isVirtual: base.isVirtual || false
        });
      }
    }
  }

  private handleVariable(node: any, callbacks: AstCallbacks, context: AstContext, location: Location): void {
    const symbol: Symbol = {
      name: node.name,
      kind: node.kind === 'FieldDecl' ? 'field' : 'variable',
      filePath: location.file,
      line: location.line,
      column: location.column,
      isDefinition: true,
      isTemplate: false,
      signature: node.type?.qualType,
      parentSymbol: context.parent?.name,
      visibility: node.access || 'public',
      usr: node.usr || this.generateUSR(node)
    };

    callbacks.onSymbol(symbol);
  }

  private handleCall(node: any, callbacks: AstCallbacks, context: AstContext, location: Location): void {
    if (node.referencedDecl) {
      callbacks.onCall({
        callerUsr: context.currentFunction?.usr || 'global',
        calleeUsr: node.referencedDecl.usr,
        filePath: location.file,
        line: location.line,
        isVirtualCall: node.kind === 'CXXMemberCallExpr' && node.isVirtual
      });
    }
  }

  private handleReference(node: any, callbacks: AstCallbacks, context: AstContext, location: Location): void {
    if (node.referencedDecl) {
      callbacks.onReference({
        fromSymbol: context.currentFunction?.usr || 'global',
        toSymbol: node.referencedDecl.usr,
        filePath: location.file,
        line: location.line,
        column: location.column,
        kind: 'use'
      });
    }
  }

  private extractLocation(node: any): Location {
    if (node.loc) {
      return {
        file: node.loc.file || '',
        line: node.loc.line || 0,
        column: node.loc.col || 0
      };
    }
    return { file: '', line: 0, column: 0 };
  }

  private buildFunctionSignature(node: any): string {
    const params = node.params?.map((p: any) => p.type?.qualType || 'unknown').join(', ') || '';
    return `${node.type?.qualType || 'unknown'}(${params})`;
  }

  private generateUSR(node: any): string {
    // Generate a unique symbol resolution identifier
    // In real implementation, we'd use clang's USR generation
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${node.kind}:${node.name}:${node.loc?.line || 0}:${timestamp}:${random}`;
  }

  /**
   * Store extracted index data in database
   */
  private async storeIndexData(filePath: string, data: IndexData): Promise<void> {
    const transaction = this.db.transaction(() => {
      // Clear old data for this file
      this.db.prepare('DELETE FROM enhanced_symbols WHERE file_path = ? AND parser_used = ?').run(filePath, 'clang');
      this.db.prepare('DELETE FROM clang_references WHERE file_path = ?').run(filePath);
      this.db.prepare('DELETE FROM clang_includes WHERE file_path = ?').run(filePath);
      
      // Insert symbols using unified schema
      const insertSymbol = this.db.prepare(`
        INSERT INTO enhanced_symbols (
          name, mangled_name, kind, file_path, line, column,
          is_definition, signature, return_type, parent_class,
          namespace, is_template, template_params, usr,
          parser_used, parser_confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const symbol of data.symbols) {
        try {
          // console.log(`Debug: Storing symbol ${symbol.name} with USR ${symbol.usr}`);
          insertSymbol.run(
            symbol.name,
            symbol.mangledName || null,
            symbol.kind,
            symbol.filePath,
            symbol.line,
            symbol.column,
            symbol.isDefinition ? 1 : 0,
            symbol.signature || null,
            symbol.returnType || null,
            symbol.parentSymbol || null,
            symbol.parentSymbol || null, // namespace (simplified mapping)
            symbol.isTemplate ? 1 : 0,
            symbol.templateParams ? JSON.stringify(symbol.templateParams) : null,
            symbol.usr,
            'clang',
            0.95 // High confidence for Clang parser
          );
          // console.log(`Debug: Successfully stored ${symbol.name}`);
        } catch (error) {
          console.error(`Debug: Failed to store ${symbol.name}:`, (error as Error).message);
        }
      }
      
      // Insert references
      const insertRef = this.db.prepare(`
        INSERT OR IGNORE INTO clang_references (from_symbol, to_symbol, file_path, line, column, kind)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const ref of data.references) {
        insertRef.run(
          ref.fromSymbol,
          ref.toSymbol,
          ref.filePath,
          ref.line,
          ref.column,
          ref.kind
        );
      }
      
      // Insert other data...
    });
    
    transaction();
  }

  /**
   * Check if file needs reindexing
   */
  private async needsReindex(filePath: string): Promise<boolean> {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const currentHash = createHash('sha256').update(content).digest('hex');
    
    const storedHash = this.fileHashes.get(filePath);
    if (storedHash && storedHash === currentHash) {
      return false;
    }
    
    // Check database
    const row = this.db.prepare('SELECT hash FROM indexed_files WHERE path = ?').get(filePath) as any;
    if (row && row.hash === currentHash) {
      this.fileHashes.set(filePath, currentHash);
      return false;
    }
    
    return true;
  }

  /**
   * Get compile command for a file
   */
  private getCompileCommand(filePath: string): CompileCommand {
    // Find in compilation database
    const command = this.compilationDatabase.find(cmd => 
      path.resolve(cmd.file) === path.resolve(filePath)
    );
    
    // console.log(`Debug: Looking for file: ${filePath}`);
    // console.log(`Debug: Resolved path: ${path.resolve(filePath)}`);
    // console.log(`Debug: Database entries with GLM:`, this.compilationDatabase.filter(c => c.file.includes('GLM')).map(c => c.file));
    
    if (command) {
      // console.log(`Debug: Found compile command for ${filePath}`);
      return {
        file: command.file,
        directory: command.directory,
        flags: this.parseCompileCommand(command.command || command.arguments || [])
      };
    }
    
    // Generate default flags
    return {
      file: filePath,
      directory: this.projectPath,
      flags: [
        '-std=c++20',
        '-I' + path.join(this.projectPath, 'include'),
        '-I' + path.join(this.projectPath, 'src')
      ]
    };
  }

  private parseCompileCommand(command: string | string[]): string[] {
    if (Array.isArray(command)) {
      // Filter out the compiler name and any invalid arguments
      const filteredArgs = command.slice(1).filter(arg => arg !== '*' && !arg.includes('*'));
      return this.expandResponseFiles(filteredArgs);
    }
    
    // Parse shell command - need proper shell parsing to handle quotes
    // This is a simplified version that may not handle all cases
    const args: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      
      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ' ') {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current.length > 0) {
      args.push(current);
    }
    
    // Remove compiler name and filter out invalid arguments
    const filteredArgs = args.slice(1).filter(arg => arg !== '*' && !arg.includes('*'));
    
    // Expand response files (@file.modmap)
    return this.expandResponseFiles(filteredArgs);
  }
  
  private expandResponseFiles(args: string[], workingDir?: string): string[] {
    const expandedArgs: string[] = [];
    
    for (const arg of args) {
      if (arg.startsWith('@')) {
        try {
          // Try multiple possible locations for response files
          const possiblePaths = [
            workingDir ? path.resolve(workingDir, arg.substring(1)) : null,
            path.resolve(this.projectPath, 'build_clang', arg.substring(1)),
            path.resolve(this.projectPath, 'build_clang_linux', arg.substring(1))
          ].filter(p => p !== null) as string[];
          
          let responseContent = '';
          let found = false;
          
          for (const responsePath of possiblePaths) {
            try {
              const fs = require('fs');
              responseContent = fs.readFileSync(responsePath, 'utf-8');
              found = true;
              // console.log(`Debug: Read response file from ${responsePath}`);
              break;
            } catch (e) {
              // Try next path
            }
          }
          
          if (found) {
            const responseArgs = responseContent.trim().split(/\s+/).filter((a: string) => a);
            expandedArgs.push(...responseArgs);
          } else {
            console.log(`Warning: Could not read response file ${arg}`);
          }
        } catch (e) {
          console.log(`Warning: Error reading response file ${arg}`);
        }
      } else {
        expandedArgs.push(arg);
      }
    }
    
    return expandedArgs;
  }

  /**
   * Incremental update on file change
   */
  async updateFile(filePath: string): Promise<void> {
    await this.indexFile(filePath, true);
    
    // Also reindex files that include this one
    const dependents = this.db.prepare(`
      SELECT DISTINCT file_path FROM includes WHERE included_path = ?
    `).all(filePath) as any[];
    
    for (const dep of dependents) {
      await this.indexFile(dep.file_path, true);
    }
  }

  /**
   * Fast symbol lookup queries
   */
  async findSymbol(name: string): Promise<Symbol[]> {
    // Special case: '%' means find all symbols
    if (name === '%') {
      return this.db.prepare(`
        SELECT * FROM enhanced_symbols 
        WHERE parser_used = 'clang'
        ORDER BY is_definition DESC, kind
      `).all() as Symbol[];
    }
    
    return this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE (name = ? OR name LIKE ?) AND parser_used = 'clang'
      ORDER BY is_definition DESC, kind
    `).all(name, `%::${name}`) as Symbol[];
  }

  async findReferences(symbolUsr: string): Promise<Reference[]> {
    return this.db.prepare(`
      SELECT * FROM clang_references 
      WHERE to_symbol = ?
      ORDER BY file_path, line
    `).all(symbolUsr) as Reference[];
  }

  async getCallGraph(functionUsr: string): Promise<CallGraphEntry[]> {
    // Get all functions called by this function
    const calls = this.db.prepare(`
      SELECT * FROM call_graph 
      WHERE caller_usr = ?
    `).all(functionUsr) as CallGraphEntry[];
    
    // Get all functions that call this function
    const callers = this.db.prepare(`
      SELECT * FROM call_graph 
      WHERE callee_usr = ?
    `).all(functionUsr) as CallGraphEntry[];
    
    return [...calls, ...callers];
  }

  async getClassHierarchy(classUsr: string): Promise<InheritanceInfo[]> {
    // Get base classes
    const bases = this.db.prepare(`
      SELECT * FROM inheritance 
      WHERE derived_usr = ?
    `).all(classUsr) as InheritanceInfo[];
    
    // Get derived classes
    const derived = this.db.prepare(`
      SELECT * FROM inheritance 
      WHERE base_usr = ?
    `).all(classUsr) as InheritanceInfo[];
    
    return [...bases, ...derived];
  }

  close(): void {
    this.db.close();
  }
}

// Type definitions
interface CompileCommand {
  file: string;
  directory: string;
  command?: string;
  arguments?: string[];
  flags: string[];
}

interface IndexData {
  symbols: Symbol[];
  references: Reference[];
  includes: Include[];
  templateInstantiations: TemplateInstantiation[];
  macros: Macro[];
  callGraph: CallGraphEntry[];
  inheritance: InheritanceInfo[];
  dependencies: string[];
}

interface Symbol {
  name: string;
  mangledName?: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  isDefinition: boolean;
  signature?: string;
  returnType?: string;
  parentSymbol?: string;
  visibility: string;
  isTemplate: boolean;
  templateParams?: any;
  usr?: string;
}

interface Reference {
  fromSymbol: string;
  toSymbol: string;
  filePath: string;
  line: number;
  column: number;
  kind: string;
}

interface Include {
  filePath: string;
  includedPath: string;
  isSystem: boolean;
  line: number;
}

interface TemplateInstantiation {
  templateUsr: string;
  instantiationUsr: string;
  templateArgs: string;
  filePath: string;
  line: number;
}

interface Macro {
  name: string;
  definition?: string;
  filePath: string;
  line: number;
  isFunctionLike: boolean;
  parameters?: string;
}

interface CallGraphEntry {
  callerUsr: string;
  calleeUsr: string;
  filePath: string;
  line: number;
  isVirtualCall: boolean;
}

interface InheritanceInfo {
  derivedUsr: string;
  baseUsr: string;
  accessSpecifier: string;
  isVirtual: boolean;
}

interface Location {
  file: string;
  line: number;
  column: number;
}

interface AstContext {
  parent?: any;
  currentFunction?: Symbol;
}

interface AstCallbacks {
  onSymbol: (symbol: Symbol) => void;
  onReference: (ref: Reference) => void;
  onInclude: (inc: Include) => void;
  onTemplateInstantiation: (inst: TemplateInstantiation) => void;
  onMacro: (macro: Macro) => void;
  onCall: (call: CallGraphEntry) => void;
  onInheritance: (inh: InheritanceInfo) => void;
}

// Usage:
/*
const indexer = new ClangIntelligentIndexer('/path/to/project', '.index.db');
await indexer.loadCompilationDatabase();

// Initial indexing
await indexer.indexFile('/path/to/file.cpp');

// Fast queries
const symbols = await indexer.findSymbol('MyClass');
const references = await indexer.findReferences(symbols[0].usr);
const callGraph = await indexer.getCallGraph(methodUsr);

// Incremental update
await indexer.updateFile('/path/to/changed/file.cpp');
*/