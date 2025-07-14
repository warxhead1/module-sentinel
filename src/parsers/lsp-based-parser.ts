import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { 
  MethodSignature, 
  ClassInfo,
  EnhancedModuleInfo 
} from '../types/essential-features.js';

/**
 * LSP-based C++ Parser using clangd
 * 
 * This provides IDE-level understanding of C++ code including:
 * - Accurate symbol resolution
 * - Cross-file references
 * - Template instantiation understanding
 * - Macro expansion
 */
export class LspBasedParser {
  private clangdProcess?: ChildProcess;
  private messageId = 0;
  private responseHandlers = new Map<number, (response: any) => void>();
  
  async initialize(projectPath: string): Promise<void> {
    // Start clangd process
    this.clangdProcess = spawn('clangd', [
      '--background-index',
      '--header-insertion=never',
      '--compile-commands-dir=' + projectPath
    ]);

    // Set up communication
    this.clangdProcess.stdout?.on('data', (data) => {
      this.handleClangdResponse(data.toString());
    });

    // Initialize LSP
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${projectPath}`,
      capabilities: {
        textDocument: {
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true
          }
        }
      }
    });
  }

  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    // Open document
    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${filePath}`,
        languageId: 'cpp',
        version: 1,
        text: await this.readFile(filePath)
      }
    });

    // Get document symbols (classes, methods, etc.)
    const symbols = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: `file://${filePath}` }
    });

    // Get semantic tokens for more detailed info
    const semanticTokens = await this.sendRequest('textDocument/semanticTokens/full', {
      textDocument: { uri: `file://${filePath}` }
    });

    // Convert LSP symbols to our format
    return this.convertLspSymbols(filePath, symbols, semanticTokens);
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve) => {
      const id = ++this.messageId;
      this.responseHandlers.set(id, resolve);
      
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this.sendMessage(message);
    });
  }

  private sendNotification(method: string, params: any): void {
    const message = {
      jsonrpc: '2.0',
      method,
      params
    };
    
    this.sendMessage(message);
  }

  private sendMessage(message: any): void {
    const json = JSON.stringify(message);
    const contentLength = Buffer.byteLength(json, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    
    this.clangdProcess?.stdin?.write(header + json);
  }

  private handleClangdResponse(data: string): void {
    // Parse LSP response
    const lines = data.split('\r\n');
    let contentLength = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('Content-Length:')) {
        contentLength = parseInt(line.split(':')[1].trim());
      } else if (line === '' && contentLength > 0) {
        // Parse JSON content
        const json = lines[i + 1];
        if (json) {
          try {
            const response = JSON.parse(json);
            if (response.id && this.responseHandlers.has(response.id)) {
              const handler = this.responseHandlers.get(response.id);
              this.responseHandlers.delete(response.id);
              handler?.(response.result);
            }
          } catch (e) {
            console.error('Failed to parse LSP response:', e);
          }
        }
      }
    }
  }

  private convertLspSymbols(
    filePath: string, 
    symbols: any[], 
    semanticTokens: any
  ): EnhancedModuleInfo {
    const methods: MethodSignature[] = [];
    const classes: ClassInfo[] = [];
    
    // Process hierarchical symbols
    this.processSymbols(symbols, methods, classes);
    
    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods,
      classes,
      interfaces: [], // Would need to identify from pure virtual classes
      relationships: [],
      patterns: [],
      imports: [],
      exports: []
    };
  }

  private processSymbols(
    symbols: any[], 
    methods: MethodSignature[], 
    classes: ClassInfo[],
    currentClass?: string
  ): void {
    for (const symbol of symbols) {
      switch (symbol.kind) {
        case 5: // Class
          const classInfo: ClassInfo = {
            name: symbol.name,
            namespace: undefined,
            baseClasses: [], // Would need to get from semantic analysis
            interfaces: [],
            methods: [],
            members: [],
            isTemplate: symbol.name.includes('<'),
            templateParams: undefined,
            location: {
              line: symbol.range.start.line + 1,
              column: symbol.range.start.character + 1
            }
          };
          classes.push(classInfo);
          
          // Process nested symbols
          if (symbol.children) {
            this.processSymbols(symbol.children, methods, classes, symbol.name);
          }
          break;
          
        case 6: // Method
        case 12: // Function
          const method: MethodSignature = {
            name: symbol.name,
            className: currentClass,
            parameters: [], // Would need detailed parsing
            returnType: 'auto', // Would need type info
            visibility: 'public',
            isVirtual: false,
            isStatic: false,
            isConst: symbol.name.includes('const'),
            location: {
              line: symbol.range.start.line + 1,
              column: symbol.range.start.character + 1
            }
          };
          methods.push(method);
          break;
      }
    }
  }

  private async readFile(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf-8');
  }

  async shutdown(): Promise<void> {
    await this.sendRequest('shutdown', {});
    this.sendNotification('exit', {});
    this.clangdProcess?.kill();
  }
}

// Usage:
/*
const parser = new LspBasedParser();
await parser.initialize('/path/to/project');
const moduleInfo = await parser.parseFile('/path/to/file.cpp');
await parser.shutdown();
*/