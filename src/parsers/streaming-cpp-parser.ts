import Parser from 'tree-sitter';
import Cpp from 'tree-sitter-cpp';
import * as fs from 'fs';
import * as readline from 'readline';
import { EventEmitter } from 'events';

export interface ParseOptions {
  maxFileSize?: number; // Max file size to parse fully (default: 1MB)
  chunkSize?: number;   // Size of chunks for large files (default: 64KB)
  fastMode?: boolean;   // Skip detailed AST analysis for quick scanning
}

export interface ModuleSymbols {
  exports: Set<string>;
  imports: Set<string>;
  dependencies: Set<string>;
  namespaces: Set<string>;
  classes: Set<string>;
  functions: Set<string>;
  includes: Set<string>;
}

export class StreamingCppParser extends EventEmitter {
  private parser: Parser;
  private options: Required<ParseOptions>;

  constructor(options: ParseOptions = {}) {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(Cpp);
    
    this.options = {
      maxFileSize: options.maxFileSize || 1024 * 1024, // 1MB
      chunkSize: options.chunkSize || 64 * 1024,       // 64KB
      fastMode: options.fastMode || false
    };
  }

  async parseFile(filePath: string): Promise<ModuleSymbols> {
    const stats = await fs.promises.stat(filePath);
    
    // Always use streaming parser for files > 30KB to avoid tree-sitter limits
    // Tree-sitter has issues with files larger than ~32KB
    if (stats.size > 30 * 1024 || this.options.fastMode) {
      return this.parseStreamingFile(filePath);
    }
    
    // Try tree-sitter first for small files
    try {
      return await this.parseFullFile(filePath);
    } catch (error: any) {
      // Fall back to streaming parser if tree-sitter fails
      console.warn(`Tree-sitter failed for ${filePath}, using streaming parser:`, error.message);
      return this.parseStreamingFile(filePath);
    }
  }

  private async parseFullFile(filePath: string): Promise<ModuleSymbols> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const tree = this.parser.parse(content);
    
    const symbols: ModuleSymbols = {
      exports: new Set(),
      imports: new Set(),
      dependencies: new Set(),
      namespaces: new Set(),
      classes: new Set(),
      functions: new Set(),
      includes: new Set()
    };

    this.walkTree(tree.rootNode, symbols);
    return symbols;
  }

  private async parseStreamingFile(filePath: string): Promise<ModuleSymbols> {
    const symbols: ModuleSymbols = {
      exports: new Set(),
      imports: new Set(),
      dependencies: new Set(),
      namespaces: new Set(),
      classes: new Set(),
      functions: new Set(),
      includes: new Set()
    };

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let inComment = false;
    let braceDepth = 0;
    let currentNamespace: string[] = [];
    let inExportBlock = false;
    let exportNamespaceStack: string[] = [];

    for await (const line of rl) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Handle multi-line comments
      if (line.includes('/*')) inComment = true;
      if (line.includes('*/')) {
        inComment = false;
        continue;
      }
      if (inComment) continue;

      // Skip single-line comments
      const cleanLine = line.split('//')[0].trim();
      if (!cleanLine) continue;

      // Track brace depth for namespace tracking
      const openBraces = (cleanLine.match(/{/g) || []).length;
      const closeBraces = (cleanLine.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;
      
      // Handle namespace exits
      if (closeBraces > 0 && currentNamespace.length > 0) {
        for (let i = 0; i < closeBraces && currentNamespace.length > 0; i++) {
          currentNamespace.pop();
          if (exportNamespaceStack.length > 0) {
            exportNamespaceStack.pop();
            if (exportNamespaceStack.length === 0) {
              inExportBlock = false;
            }
          }
        }
      }

      // Parse includes
      const includeMatch = cleanLine.match(/#include\s*[<"]([^>"]+)[>"]/);
      if (includeMatch) {
        symbols.includes.add(includeMatch[1]);
        continue;
      }

      // Parse namespace declarations
      const namespaceMatch = cleanLine.match(/namespace\s+(\w+)/);
      if (namespaceMatch) {
        currentNamespace.push(namespaceMatch[1]);
        symbols.namespaces.add(namespaceMatch[1]);
        // If we're in an export block, this nested namespace is also exported
        if (inExportBlock) {
          const fullNamespace = [...exportNamespaceStack, namespaceMatch[1]].join('::');
          symbols.exports.add(fullNamespace);
        }
        continue;
      }
      
      // Parse constants/constexpr within export blocks or namespaces
      const constMatch = cleanLine.match(/(?:constexpr|const|inline\s+constexpr)\s+(\w+(?:\s*<[^>]+>)?)\s+(\w+)\s*=/);
      if (constMatch && (inExportBlock || currentNamespace.length > 0)) {
        const constType = constMatch[1];
        const constName = constMatch[2];
        
        // Build fully qualified name
        const namespacePrefix = currentNamespace.length > 0 ? currentNamespace.join('::') + '::' : '';
        const qualifiedName = namespacePrefix + constName;
        
        // If in export block, add to exports
        if (inExportBlock) {
          symbols.exports.add(qualifiedName);
          symbols.exports.add(`constexpr ${constType} ${qualifiedName}`);
        }
        
        // Always add to functions set for visibility
        symbols.functions.add(qualifiedName);
        continue;
      }

      // Parse class declarations (including those without immediate : or {)
      const classMatch = cleanLine.match(/(?:class|struct)\s+(\w+)(?:\s*[:;{]|$)/);
      if (classMatch && !cleanLine.includes('enum')) {
        const className = classMatch[1];
        // Skip forward declarations
        if (!cleanLine.includes(';') || cleanLine.includes('{')) {
          symbols.classes.add(className);
          symbols.exports.add(className);
        }
        continue;
      }

      // Parse C++20 module declaration (export module ModuleName;)
      const exportModuleMatch = cleanLine.match(/export\s+module\s+([\w.]+(?:::[\w.]+)*)\s*;/);
      if (exportModuleMatch) {
        symbols.exports.add(exportModuleMatch[1]);
        symbols.exports.add(`module:${exportModuleMatch[1]}`);
        continue;
      }
      
      // Parse C++20 module imports (import ModuleName;)
      const importMatch = cleanLine.match(/import\s+([\w.]+(?:::[\w.]+)*)\s*;/);
      if (importMatch) {
        symbols.imports.add(importMatch[1]);
        symbols.dependencies.add(importMatch[1]);
        continue;
      }
      
      // Parse export namespace (export namespace NamespaceName)
      const exportNamespaceMatch = cleanLine.match(/export\s+namespace\s+(\w+(?:::\w+)*)/);
      if (exportNamespaceMatch) {
        symbols.exports.add(exportNamespaceMatch[1]);
        symbols.namespaces.add(exportNamespaceMatch[1]);
        inExportBlock = true;
        exportNamespaceStack.push(exportNamespaceMatch[1]);
        continue;
      }
      
      // Parse export class/struct
      const exportClassMatch = cleanLine.match(/export\s+(?:class|struct)\s+(\w+)/);
      if (exportClassMatch) {
        symbols.exports.add(exportClassMatch[1]);
        symbols.classes.add(exportClassMatch[1]);
        continue;
      }
      
      // Parse export function/template
      const exportFuncMatch = cleanLine.match(/export\s+(?:template\s*<[^>]*>\s*)?(?:[\w:]+(?:<[^>]+>)?\s+)*(\w+)\s*\(/);
      if (exportFuncMatch) {
        symbols.exports.add(exportFuncMatch[1]);
        symbols.functions.add(exportFuncMatch[1]);
        continue;
      }
      
      // Parse export constants/variables (common in .ixx files)
      const exportConstMatch = cleanLine.match(/export\s+(?:constexpr|const|inline\s+constexpr)\s+(\w+(?:\s*<[^>]+>)?)\s+(\w+)/);
      if (exportConstMatch) {
        const constType = exportConstMatch[1];
        const constName = exportConstMatch[2];
        symbols.exports.add(`constexpr ${constType} ${constName}`);
        continue;
      }
      
      // Parse general export statements within export blocks
      if (cleanLine.includes('export') && cleanLine.includes('{')) {
        // Handle export { ... } blocks - mark as in export block
        // This is a simplified approach for export blocks
        continue;
      }
      
      // Parse module interface/implementation distinction
      const moduleMatch = cleanLine.match(/module\s+([\w.]+(?:::[\w.]+)*)\s*;/);
      if (moduleMatch && !cleanLine.includes('export')) {
        // This is a module implementation unit, not interface
        symbols.imports.add(moduleMatch[1]);
        continue;
      }

      // Parse qualified method definitions (Class::method patterns)
      const qualifiedMethodMatch = cleanLine.match(/^[\w*&\s<>:,]*\s+([\w:]+)::([\w~]+)\s*\(/);
      if (qualifiedMethodMatch) {
        const fullQualifier = qualifiedMethodMatch[1];
        const methodName = qualifiedMethodMatch[2];
        const className = fullQualifier.split('::').pop() || '';
        
        // Add both the qualified name and class
        symbols.functions.add(`${fullQualifier}::${methodName}`);
        symbols.classes.add(className);
        
        // Also add namespace if present
        const namespaceParts = fullQualifier.split('::');
        if (namespaceParts.length > 1) {
          const namespace = namespaceParts.slice(0, -1).join('::');
          symbols.namespaces.add(namespace);
        }
        continue;
      }

      // Parse constructor patterns (ClassName::ClassName)
      const constructorMatch = cleanLine.match(/([\w:]+)::([\w:]+)\s*\(([^)]*)\)/);
      if (constructorMatch) {
        const fullClassName = constructorMatch[1];
        const methodName = constructorMatch[2];
        const paramString = constructorMatch[3];
        const className = fullClassName.split('::').pop() || '';
        
        if (className === methodName) { // Constructor
          symbols.functions.add(`${fullClassName}::${methodName}`);
          symbols.classes.add(className);
          
          // Add namespace if present
          const namespaceParts = fullClassName.split('::');
          if (namespaceParts.length > 1) {
            const namespace = namespaceParts.slice(0, -1).join('::');
            symbols.namespaces.add(namespace);
          }
          
          // Parse constructor parameters for type information
          if (paramString.trim()) {
            this.parseParameterTypes(paramString, symbols);
          }
          continue;
        }
      }

      // Parse namespace detection (enhanced)
      const nestedNamespaceMatch = cleanLine.match(/namespace\s+([\w:]+)\s*\{/);
      if (nestedNamespaceMatch) {
        const fullNamespace = nestedNamespaceMatch[1];
        symbols.namespaces.add(fullNamespace);
        // Add individual namespace parts
        fullNamespace.split('::').forEach(part => {
          if (part) symbols.namespaces.add(part);
        });
        continue;
      }
      
      // Parse namespace with nested structure (e.g., "namespace PlanetGen::Rendering {")
      const complexNamespaceMatch = cleanLine.match(/namespace\s+([\w]+(?:::[\w]+)+)\s*\{/);
      if (complexNamespaceMatch) {
        const fullNamespace = complexNamespaceMatch[1];
        symbols.namespaces.add(fullNamespace);
        // Add hierarchical namespace parts
        const parts = fullNamespace.split('::');
        for (let i = 1; i <= parts.length; i++) {
          const partialNamespace = parts.slice(0, i).join('::');
          symbols.namespaces.add(partialNamespace);
        }
        continue;
      }

      // Parse function declarations (enhanced pattern for C++)
      const ctorDtorMatch = cleanLine.match(/^\s*(?:virtual\s+)?(~?)(\w+)\s*\([^)]*\)\s*(?::\s*\w+\([^)]*\))?\s*[{;]/);
      if (ctorDtorMatch && ctorDtorMatch[2] && !['if', 'for', 'while', 'switch', 'catch'].includes(ctorDtorMatch[2])) {
        const funcName = ctorDtorMatch[1] + ctorDtorMatch[2];
        symbols.functions.add(funcName);
        continue;
      }
      
      // Match regular functions including return types
      const funcMatch = cleanLine.match(/^\s*(?:(?:virtual|static|inline|explicit|constexpr)\s+)*(?:[\w:]+(?:<[^>]+>)?\s+)+(\w+)\s*\([^)]*\)\s*(?:const)?\s*(?:override)?\s*(?:->\s*[\w:]+)?\s*[{;]/);
      if (funcMatch && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(funcMatch[1])) {
        symbols.functions.add(funcMatch[1]);
        symbols.exports.add(funcMatch[1]);
        continue;
      }
      
      // Match member function definitions outside class (e.g., Class::method)
      const memberFuncMatch = cleanLine.match(/^\s*(?:[\w:]+(?:<[^>]+>)?\s+)*([\w:]+)::([\w~]+)\s*\(([^)]*)\)/);
      if (memberFuncMatch) {
        const className = memberFuncMatch[1];
        const methodName = memberFuncMatch[2];
        const paramString = memberFuncMatch[3];
        
        symbols.functions.add(`${className}::${methodName}`);
        symbols.classes.add(className.split('::').pop() || className);
        symbols.exports.add(`${className}::${methodName}`);
        
        // Parse parameter types
        if (paramString.trim()) {
          this.parseParameterTypes(paramString, symbols);
        }
        
        // Add namespace if present in class name
        const namespaceParts = className.split('::');
        if (namespaceParts.length > 1) {
          const namespace = namespaceParts.slice(0, -1).join('::');
          symbols.namespaces.add(namespace);
        }
        continue;
      }

      // Parse using declarations
      const usingMatch = cleanLine.match(/using\s+(?:namespace\s+)?(\w+(?:::\w+)*)/);
      if (usingMatch) {
        symbols.imports.add(usingMatch[1]);
        continue;
      }

      // Parse typedef/using alias
      const typedefMatch = cleanLine.match(/(?:typedef|using)\s+\w+\s*=?\s*(\w+(?:::\w+)*)/);
      if (typedefMatch) {
        symbols.dependencies.add(typedefMatch[1]);
        continue;
      }
    }

    this.emit('parsed', { filePath, symbols });
    return symbols;
  }
  
  /**
   * Parse parameter types from function/method signatures
   */
  private parseParameterTypes(paramString: string, symbols: ModuleSymbols): void {
    if (!paramString.trim()) return;
    
    // Split parameters by comma, but be careful with template parameters
    const params = this.splitParameters(paramString);
    
    params.forEach(param => {
      const trimmed = param.trim();
      if (!trimmed) return;
      
      // Extract type information (everything before the variable name)
      const typeMatch = trimmed.match(/^([\w:]+(?:<[^>]*>)?(?:\*|&)?)\s+\w+/);
      if (typeMatch) {
        const type = typeMatch[1].replace(/[*&]$/, '').trim();
        
        // If it contains ::, it might be a qualified type
        if (type.includes('::')) {
          const parts = type.split('::');
          if (parts.length > 1) {
            const namespace = parts.slice(0, -1).join('::');
            const typeName = parts[parts.length - 1];
            symbols.namespaces.add(namespace);
            symbols.dependencies.add(type);
          }
        } else if (type.includes('<')) {
          // Template type - extract base type
          const baseType = type.split('<')[0];
          symbols.dependencies.add(baseType);
        } else if (type !== 'int' && type !== 'float' && type !== 'double' && type !== 'bool' && type !== 'char' && type !== 'void') {
          // Non-primitive type
          symbols.dependencies.add(type);
        }
      }
    });
  }
  
  /**
   * Split parameter string by comma, handling nested templates
   */
  private splitParameters(paramString: string): string[] {
    const params: string[] = [];
    let current = '';
    let angleDepth = 0;
    let parenDepth = 0;
    
    for (let i = 0; i < paramString.length; i++) {
      const char = paramString[i];
      
      if (char === '<') angleDepth++;
      else if (char === '>') angleDepth--;
      else if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;
      else if (char === ',' && angleDepth === 0 && parenDepth === 0) {
        params.push(current.trim());
        current = '';
        continue;
      }
      
      current += char;
    }
    
    if (current.trim()) {
      params.push(current.trim());
    }
    
    return params;
  }

  private walkTree(node: Parser.SyntaxNode, symbols: ModuleSymbols): void {
    switch (node.type) {
      case 'class_specifier':
      case 'struct_specifier':
        const className = node.childForFieldName('name');
        if (className) {
          symbols.classes.add(className.text);
          symbols.exports.add(className.text);
        }
        // Also extract methods from class body
        const classBody = node.childForFieldName('body');
        if (classBody) {
          this.extractClassMethods(classBody, className?.text || '', symbols);
        }
        break;

      case 'function_definition':
      case 'function_declarator':
        const declarator = node.childForFieldName('declarator') || node;
        if (declarator) {
          const funcName = this.extractFunctionName(declarator);
          if (funcName) {
            symbols.functions.add(funcName);
            symbols.exports.add(funcName);
          }
        }
        break;
        
      case 'declaration':
        // Handle function declarations
        const funcDecl = node.descendantsOfType('function_declarator')[0];
        if (funcDecl) {
          const name = this.extractFunctionName(funcDecl);
          if (name) {
            symbols.functions.add(name);
            symbols.exports.add(name);
          }
        }
        break;

      case 'namespace_definition':
        const nsName = node.childForFieldName('name');
        if (nsName) {
          symbols.namespaces.add(nsName.text);
        }
        break;

      case 'preproc_include':
        const path = node.childForFieldName('path');
        if (path) {
          const includePath = path.text.replace(/["<>]/g, '');
          symbols.includes.add(includePath);
        }
        break;

      case 'using_declaration':
        const identifier = node.descendantsOfType('qualified_identifier')[0];
        if (identifier) {
          symbols.imports.add(identifier.text);
        }
        break;
    }

    // Recursively walk children
    for (const child of node.children) {
      this.walkTree(child, symbols);
    }
  }

  private extractFunctionName(declarator: Parser.SyntaxNode): string | null {
    if (declarator.type === 'function_declarator') {
      const inner = declarator.childForFieldName('declarator');
      if (inner?.type === 'identifier') {
        return inner.text;
      }
      if (inner?.type === 'qualified_identifier') {
        return inner.text.split('::').pop() || null;
      }
      if (inner?.type === 'field_identifier') {
        return inner.text;
      }
      // Try direct identifier child
      const id = declarator.descendantsOfType('identifier')[0];
      if (id) {
        return id.text;
      }
    }
    // Handle other declarator types
    const id = declarator.descendantsOfType('identifier')[0];
    if (id) {
      return id.text;
    }
    return null;
  }
  
  private extractClassMethods(body: Parser.SyntaxNode, className: string, symbols: ModuleSymbols): void {
    // Extract methods from class body
    for (const child of body.children) {
      if (child.type === 'function_definition' || child.type === 'declaration') {
        const funcDecl = child.descendantsOfType('function_declarator')[0];
        if (funcDecl) {
          const methodName = this.extractFunctionName(funcDecl);
          if (methodName) {
            symbols.functions.add(methodName);
            symbols.exports.add(`${className}::${methodName}`);
          }
        }
      }
    }
  }
}