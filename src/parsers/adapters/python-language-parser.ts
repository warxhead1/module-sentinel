
import { OptimizedTreeSitterBaseParser } from '../tree-sitter/optimized-base-parser.js';
import { ParseOptions, SymbolInfo, RelationshipInfo, PatternInfo } from '../tree-sitter/parser-types.js';
import { UniversalSymbolKind, UniversalRelationshipType } from '../language-parser-interface.js';
import { pythonQueries } from '../queries/python-queries.js';
import { Database } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

import Parser, { Language } from 'tree-sitter';
import { VisitorHandlers, VisitorContext } from '../unified-ast-visitor.js';

export class PythonLanguageParser extends OptimizedTreeSitterBaseParser {

  constructor(db: Database, options: ParseOptions) {
    super(db, options);
  }

  async initialize(): Promise<void> {
    const wasmPath = path.join(__dirname, '..', 'wasm', 'tree-sitter-python.wasm');
    try {
      // Tree-sitter web bindings syntax
      const Language = (Parser as any).Language;
      if (Language && Language.load) {
        const loadedLanguage = await Language.load(wasmPath);
        this.parser.setLanguage(loadedLanguage);
      } else {
        console.error("Tree-sitter Language.load not available, pattern-based parsing will be used");
      }
    } catch (e) {
      console.error("Failed to load Python parser:", e);
    }
  }

  protected createVisitorHandlers(): VisitorHandlers {
    return {
      onClass: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        const classNameNode = node.childForFieldName('name');
        if (classNameNode) {
          const className = this.getNodeText(classNameNode, context.content);
          const qualifiedName = this.getQualifiedName(node, context.content);
          return {
            name: className,
            qualifiedName: qualifiedName,
            kind: UniversalSymbolKind.Class,
            filePath: context.filePath,
            line: node.startPosition.row,
            column: node.startPosition.column,
            endLine: node.endPosition.row,
            endColumn: node.endPosition.column,
            isDefinition: true,
            confidence: 1.0,
            semanticTags: [],
            complexity: 1,
            isExported: this.isExported(node, context),
            isAsync: false,
            languageFeatures: {
              decorators: this.getDecorators(node, context.content),
              baseClasses: this.getBaseClasses(node, context.content),
              docstring: this.getDocstring(node, context.content)
            }
          };
        }
        return null;
      },
      onFunction: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        const functionNameNode = node.childForFieldName('name');
        if (functionNameNode) {
          const functionName = this.getNodeText(functionNameNode, context.content);
          const qualifiedName = this.getQualifiedName(node, context.content);
          return {
            name: functionName,
            qualifiedName: qualifiedName,
            kind: UniversalSymbolKind.Function,
            filePath: context.filePath,
            line: node.startPosition.row,
            column: node.startPosition.column,
            endLine: node.endPosition.row,
            endColumn: node.endPosition.column,
            isDefinition: true,
            confidence: 1.0,
            semanticTags: [],
            complexity: 1,
            isExported: this.isExported(node, context),
            isAsync: this.isAsyncFunction(node),
            languageFeatures: {
              decorators: this.getDecorators(node, context.content),
              isGenerator: this.isGenerator(node),
              parameters: this.getParameters(node, context.content),
              returnAnnotation: this.getReturnAnnotation(node, context.content),
              docstring: this.getDocstring(node, context.content)
            }
          };
        }
        return null;
      },
      onCall: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        const functionNode = node.childForFieldName('function');
        if (functionNode) {
          const functionName = this.getNodeText(functionNode, context.content);
          return {
            fromName: this.getQualifiedName(node, context.content), // Caller
            toName: functionName, // Callee
            relationshipType: UniversalRelationshipType.Calls,
            confidence: 0.7,
            crossLanguage: false,
          };
        }
        return null;
      },
      onImport: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        const moduleNameNode = node.childForFieldName('name');
        if (moduleNameNode) {
          const moduleName = this.getNodeText(moduleNameNode, context.content);
          return {
            fromName: context.filePath, // The file itself imports
            toName: moduleName,
            relationshipType: UniversalRelationshipType.Imports,
            confidence: 1.0,
            crossLanguage: false,
          };
        }
        return null;
      },
      onInheritance: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo[] | null => {
        const relationships: RelationshipInfo[] = [];
        const classNameNode = node.childForFieldName('name');
        if (classNameNode) {
          const qualifiedName = this.getQualifiedName(node, context.content);
          const superclassesNode = node.childForFieldName('superclasses');
          if (superclassesNode) {
            for (const child of superclassesNode.children) {
              if (child.type === 'identifier') {
                const baseClassName = this.getNodeText(child, context.content);
                relationships.push({
                  fromName: qualifiedName,
                  toName: baseClassName,
                  relationshipType: UniversalRelationshipType.Inherits,
                  confidence: 0.9,
                  crossLanguage: false,
                });
              }
            }
          }
        }
        return relationships.length > 0 ? relationships : null;
      }
    };
  }

  protected getNodeTypeMap(): Map<string, keyof VisitorHandlers> {
    return new Map<string, keyof VisitorHandlers>([
      ['class_definition', 'onClass'],
      ['function_definition', 'onFunction'],
      ['call', 'onCall'],
      ['import_statement', 'onImport'],
      ['import_from_statement', 'onImport'],
      ['assignment', 'onVariable'],
      ['global_statement', 'onVariable'],
    ]);
  }

  protected async performPatternBasedExtraction(
    content: string,
    filePath: string
  ): Promise<{
    symbols: SymbolInfo[];
    relationships: RelationshipInfo[];
    patterns: PatternInfo[];
    controlFlowData: { blocks: any[]; calls: any[] };
    stats: any;
  }> {
    this.debug(`Falling back to pattern-based extraction for ${filePath}`);
    
    const symbols: SymbolInfo[] = [];
    const relationships: RelationshipInfo[] = [];
    const patterns: PatternInfo[] = [];
    const lines = content.split('\n');
    
    // Track current context
    let currentClass: string | undefined;
    let currentIndentLevel = 0;
    let insideClass = false;
    let decorators: string[] = [];
    let docstring: string | null = null;
    let captureDocstring = false;
    let docstringQuotes = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments (except docstrings)
      if (trimmedLine === '' || (trimmedLine.startsWith('#') && !captureDocstring)) continue;
      
      // Calculate indent level
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      
      // Docstring handling
      if (captureDocstring) {
        if (trimmedLine.endsWith(docstringQuotes)) {
          captureDocstring = false;
          docstring = docstring ? docstring + '\n' + trimmedLine.slice(0, -docstringQuotes.length) : trimmedLine.slice(0, -docstringQuotes.length);
        } else {
          docstring = docstring ? docstring + '\n' + trimmedLine : trimmedLine;
        }
        continue;
      }
      
      // Decorator detection
      if (trimmedLine.startsWith('@')) {
        decorators.push(trimmedLine.slice(1));
        continue;
      }
      
      // Class detection
      const classMatch = trimmedLine.match(/^class\s+(\w+)(?:\(([^)]+)\))?:/);
      if (classMatch) {
        const className = classMatch[1];
        const baseClasses = classMatch[2]?.split(',').map(s => s.trim()) || [];
        
        // Check for docstring on next line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const docstringMatch = nextLine.match(/^('{3}|"{3})/);
          if (docstringMatch) {
            docstringQuotes = docstringMatch[1];
            captureDocstring = true;
            docstring = nextLine.slice(3);
            if (nextLine.endsWith(docstringQuotes)) {
              captureDocstring = false;
              docstring = docstring.slice(0, -3);
            }
          }
        }
        
        symbols.push({
          name: className,
          qualifiedName: className,
          kind: UniversalSymbolKind.Class,
          filePath,
          line: lineNum,
          column: indent,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: decorators.includes('dataclass') ? ['dataclass'] : [],
          complexity: 1,
          isExported: true, // Python classes are generally accessible
          isAsync: false,
          languageFeatures: {
            decorators: [...decorators],
            baseClasses,
            docstring: docstring || undefined
          }
        });
        
        currentClass = className;
        currentIndentLevel = indent;
        insideClass = true;
        decorators = [];
        docstring = null;
        
        // Add inheritance relationships
        for (const baseClass of baseClasses) {
          relationships.push({
            fromName: className,
            toName: baseClass,
            relationshipType: UniversalRelationshipType.Inherits,
            confidence: 0.9,
            crossLanguage: false
          });
        }
      }
      
      // Function/Method detection
      let funcMatch = trimmedLine.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
      
      // Handle multi-line function definitions
      if (!funcMatch && trimmedLine.match(/^(?:async\s+)?def\s+(\w+)\s*\(/)) {
        // Function definition continues on next lines
        let fullDef = trimmedLine;
        let j = i + 1;
        while (j < lines.length && !fullDef.includes('):')) {
          fullDef += ' ' + lines[j].trim();
          j++;
        }
        funcMatch = fullDef.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
      }
      
      if (funcMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2];
        const returnType = funcMatch[3]?.trim();
        const isAsync = trimmedLine.startsWith('async def');
        const isMethod = insideClass && indent > currentIndentLevel;
        
        if (funcName === 'generate_terrain_async') {
          this.debug(`Found generate_terrain_async: trimmedLine="${trimmedLine}", isAsync=${isAsync}`);
        }
        
        // Check for docstring on next line
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const docstringMatch = nextLine.match(/^('{3}|"{3})/);
          if (docstringMatch) {
            docstringQuotes = docstringMatch[1];
            captureDocstring = true;
            docstring = nextLine.slice(3);
            if (nextLine.endsWith(docstringQuotes)) {
              captureDocstring = false;
              docstring = docstring.slice(0, -3);
            }
          }
        }
        
        // Parse parameters
        const paramList = params.split(',').map(p => {
          const paramMatch = p.trim().match(/^(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?$/);
          if (paramMatch) {
            return {
              name: paramMatch[1],
              type: paramMatch[2]?.trim(),
              default: paramMatch[3]?.trim()
            };
          }
          return null;
        }).filter(Boolean);
        
        // Check if it's a generator
        let isGenerator = false;
        if (i + 1 < lines.length) {
          // Simple check for yield in next few lines
          for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
            if (lines[j].includes('yield')) {
              isGenerator = true;
              break;
            }
          }
        }
        
        symbols.push({
          name: funcName,
          qualifiedName: isMethod && currentClass ? `${currentClass}.${funcName}` : funcName,
          kind: isMethod ? UniversalSymbolKind.Method : UniversalSymbolKind.Function,
          filePath,
          line: lineNum,
          column: indent,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: decorators.filter(d => ['staticmethod', 'classmethod', 'property'].includes(d)),
          complexity: 1,
          isExported: !funcName.startsWith('_'),
          isAsync,
          languageFeatures: {
            decorators: [...decorators],
            isGenerator,
            parameters: paramList,
            returnAnnotation: returnType,
            docstring: docstring || undefined,
            isStatic: decorators.includes('staticmethod'),
            isClassMethod: decorators.includes('classmethod'),
            isProperty: decorators.includes('property'),
            isAbstractMethod: decorators.includes('abstractmethod')
          }
        });
        
        decorators = [];
        docstring = null;
      }
      
      // Import detection
      const importMatch = trimmedLine.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)$/);
      if (importMatch) {
        const fromModule = importMatch[1];
        const imports = importMatch[2];
        
        if (fromModule) {
          relationships.push({
            fromName: filePath,
            toName: fromModule,
            relationshipType: UniversalRelationshipType.Imports,
            confidence: 1.0,
            crossLanguage: false
          });
        } else {
          // Direct imports
          const importList = imports.split(',').map(s => s.trim().split(' as ')[0]);
          for (const imp of importList) {
            relationships.push({
              fromName: filePath,
              toName: imp,
              relationshipType: UniversalRelationshipType.Imports,
              confidence: 1.0,
              crossLanguage: false
            });
          }
        }
      }
      
      // Global variable detection
      const globalVarMatch = trimmedLine.match(/^(\w+)\s*(?::\s*([^=]+))?\s*=\s*(.+)$/);
      if (globalVarMatch && indent === 0 && !insideClass) {
        const varName = globalVarMatch[1];
        const varType = globalVarMatch[2]?.trim();
        
        // Skip if it's likely a constant (all caps)
        if (varName === varName.toUpperCase()) {
          symbols.push({
            name: varName,
            qualifiedName: varName,
            kind: UniversalSymbolKind.Constant,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.7,
            semanticTags: [],
            complexity: 1,
            isExported: !varName.startsWith('_'),
            isAsync: false,
            languageFeatures: {
              type: varType
            }
          });
        }
      }
      
      // Reset class context if dedented
      if (insideClass && indent <= currentIndentLevel && trimmedLine !== '') {
        insideClass = false;
        currentClass = undefined;
      }
    }
    
    this.debug(`Pattern-based extraction found ${symbols.length} symbols, ${relationships.length} relationships`);
    
    return {
      symbols,
      relationships,
      patterns,
      controlFlowData: { blocks: [], calls: [] },
      stats: {
        linesProcessed: lines.length,
        symbolsExtracted: symbols.length,
        relationshipsFound: relationships.length
      },
    };
  }

  private getNodeText(node: Parser.SyntaxNode, content: string): string {
    return content.substring(node.startIndex, node.endIndex);
  }

  private getQualifiedName(node: Parser.SyntaxNode, content: string): string {
    let current = node;
    let parts = [this.getNodeText(node, content)];
    while (current.parent) {
      current = current.parent;
      if (current.type === 'class_definition' || current.type === 'function_definition') {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          parts.unshift(this.getNodeText(nameNode, content));
        }
      }
    }
    return parts.join('.');
  }

  // Python-specific helper methods
  private isExported(node: Parser.SyntaxNode, context: VisitorContext): boolean {
    // In Python, check if at module level or has __all__ export
    return node.parent?.type === 'module';
  }

  private isAsyncFunction(node: Parser.SyntaxNode): boolean {
    // Check for 'async' keyword before 'def'
    const asyncKeyword = node.children.find(child => 
      child.type === 'async' || child.text === 'async'
    );
    return !!asyncKeyword;
  }

  private isGenerator(node: Parser.SyntaxNode): boolean {
    // Check if function body contains yield statements
    const body = node.childForFieldName('body');
    if (!body) return false;
    
    let hasYield = false;
    const checkForYield = (n: Parser.SyntaxNode) => {
      if (n.type === 'yield' || n.type === 'yield_expression') {
        hasYield = true;
        return;
      }
      for (const child of n.children) {
        checkForYield(child);
      }
    };
    checkForYield(body);
    return hasYield;
  }

  private getDecorators(node: Parser.SyntaxNode, content: string): string[] {
    const decorators: string[] = [];
    // Look for decorator nodes before the definition
    let prev = node.previousSibling;
    while (prev && prev.type === 'decorator') {
      const decoratorName = this.getNodeText(prev, content)
        .replace('@', '')
        .trim();
      decorators.unshift(decoratorName);
      prev = prev.previousSibling;
    }
    return decorators;
  }

  private getBaseClasses(node: Parser.SyntaxNode, content: string): string[] {
    const baseClasses: string[] = [];
    const superclassesNode = node.childForFieldName('superclasses');
    if (superclassesNode) {
      for (const child of superclassesNode.children) {
        if (child.type === 'identifier' || child.type === 'attribute') {
          baseClasses.push(this.getNodeText(child, content));
        }
      }
    }
    return baseClasses;
  }

  private getParameters(node: Parser.SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const parametersNode = node.childForFieldName('parameters');
    if (parametersNode) {
      for (const param of parametersNode.children) {
        if (param.type === 'identifier' || param.type === 'typed_parameter') {
          const paramInfo: any = {
            name: this.getNodeText(param.childForFieldName('name') || param, content)
          };
          
          // Get type annotation if present
          const typeNode = param.childForFieldName('type');
          if (typeNode) {
            paramInfo.type = this.getNodeText(typeNode, content);
          }
          
          // Check if it's a default parameter
          const defaultNode = param.childForFieldName('value');
          if (defaultNode) {
            paramInfo.default = this.getNodeText(defaultNode, content);
          }
          
          params.push(paramInfo);
        }
      }
    }
    return params;
  }

  private getReturnAnnotation(node: Parser.SyntaxNode, content: string): string | null {
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      return this.getNodeText(returnTypeNode, content);
    }
    return null;
  }

  private getDocstring(node: Parser.SyntaxNode, content: string): string | null {
    const body = node.childForFieldName('body');
    if (body && body.children.length > 0) {
      const firstStatement = body.children[0];
      if (firstStatement.type === 'expression_statement') {
        const expr = firstStatement.children[0];
        if (expr && expr.type === 'string') {
          return this.getNodeText(expr, content)
            .replace(/^["']{3}|["']{3}$/g, '') // Remove triple quotes
            .replace(/^["']|["']$/g, ''); // Remove single quotes
        }
      }
    }
    return null;
  }
}
