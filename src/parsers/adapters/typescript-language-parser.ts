
import { OptimizedTreeSitterBaseParser } from '../tree-sitter/optimized-base-parser.js';
import { ParseOptions, SymbolInfo, RelationshipInfo, PatternInfo } from '../tree-sitter/parser-types.js';
import { UniversalSymbolKind, UniversalRelationshipType } from '../language-parser-interface.js';
import { typescriptQueries } from '../queries/typescript-queries.js';
import { Database } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

import Parser from 'tree-sitter';
import { Language } from 'tree-sitter';
import { VisitorHandlers, VisitorContext } from '../unified-ast-visitor.js';

export class TypeScriptLanguageParser extends OptimizedTreeSitterBaseParser {

  constructor(db: Database, options: ParseOptions) {
    super(db, options);
  }

  async initialize(): Promise<void> {
    const wasmPath = path.join(__dirname, '..', 'wasm', 'tree-sitter-typescript.wasm');
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
      console.error("Failed to load TypeScript parser:", e);
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
              isAbstract: this.isAbstract(node),
              visibility: this.getVisibility(node),
              typeParameters: this.getTypeParameters(node, context.content),
              implements: this.getImplements(node, context.content),
              decorators: this.getDecorators(node, context.content)
            }
          };
        }
        return null;
      },
      
      onInterface: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = this.getNodeText(nameNode, context.content);
          const qualifiedName = this.getQualifiedName(node, context.content);
          return {
            name: name,
            qualifiedName: qualifiedName,
            kind: UniversalSymbolKind.Interface,
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
              typeParameters: this.getTypeParameters(node, context.content),
              extends: this.getExtends(node, context.content)
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
              typeParameters: this.getTypeParameters(node, context.content),
              parameters: this.getParameters(node, context.content),
              returnType: this.getReturnType(node, context.content),
              decorators: this.getDecorators(node, context.content)
            }
          };
        }
        return null;
      },
      onMethod: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        const methodNameNode = node.childForFieldName('name');
        if (methodNameNode) {
          const methodName = this.getNodeText(methodNameNode, context.content);
          const qualifiedName = this.getQualifiedName(node, context.content);
          return {
            name: methodName,
            qualifiedName: qualifiedName,
            kind: UniversalSymbolKind.Method,
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
              visibility: this.getVisibility(node),
              isStatic: this.isStatic(node),
              isReadonly: this.isReadonly(node),
              typeParameters: this.getTypeParameters(node, context.content),
              parameters: this.getParameters(node, context.content),
              returnType: this.getReturnType(node, context.content),
              decorators: this.getDecorators(node, context.content)
            }
          };
        }
        return null;
      },
      onCall: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        const functionNode = node.childForFieldName('function');
        if (functionNode) {
          const functionName = this.getNodeText(functionNode, context.content);
          const callerName = this.getQualifiedName(node, context.content);
          
          // Check if this is a cross-language call
          // 1. Direct process spawning functions
          const isProcessSpawn = functionName.match(/\b(spawn|exec|execFile|fork|system)\b/);
          
          // 2. Custom Python script calls (look for .py in arguments)
          let isPythonScriptCall = false;
          try {
            // Check if any child nodes contain .py file references
            const callArgs = this.getCallArguments(node, context.content);
            isPythonScriptCall = callArgs.some(arg => 
              typeof arg === 'string' && arg.includes('.py')
            );
          } catch (e) {
            // Fallback: check raw text for .py references
            const nodeText = this.getNodeText(node, context.content);
            isPythonScriptCall = nodeText.includes('.py');
          }
          
          const isCrossLanguageCall = isProcessSpawn || isPythonScriptCall;
          
          // For Python script calls, set the target to the actual script name
          let targetName = functionName;
          if (isPythonScriptCall) {
            try {
              const callArgs = this.getCallArguments(node, context.content);
              const pythonFile = callArgs.find(arg => arg.includes('.py'));
              if (pythonFile) {
                targetName = pythonFile;
              }
            } catch (e) {
              // Fallback: extract .py filename from raw text
              const nodeText = this.getNodeText(node, context.content);
              const pythonMatch = nodeText.match(/['"`]([^'"`]*\.py)['"`]/);
              if (pythonMatch) {
                targetName = pythonMatch[1];
              }
            }
          }
          
          return {
            fromName: callerName, // Caller
            toName: targetName, // Target (function name or Python script)
            relationshipType: UniversalRelationshipType.Calls,
            confidence: isCrossLanguageCall ? 0.8 : 0.7, // Higher confidence for cross-language
            crossLanguage: !!isCrossLanguageCall,
            lineNumber: node.startPosition.row,
            columnNumber: node.startPosition.column,
            sourceContext: isCrossLanguageCall ? this.getNodeText(node, context.content) : undefined,
            bridgeType: isPythonScriptCall ? 'python_script' : undefined
          };
        }
        return null;
      },
      onImport: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          const moduleName = this.getNodeText(sourceNode, context.content).replace(/['"`]/g, '');
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
      onExport: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        const declarationNode = node.childForFieldName('declaration');
        if (declarationNode) {
          const nameNode = declarationNode.childForFieldName('name');
          if (nameNode) {
            const exportedName = this.getNodeText(nameNode, context.content);
            return {
              fromName: this.getQualifiedName(declarationNode, context.content), // The symbol being exported
              toName: context.filePath, // The file exports it
              relationshipType: UniversalRelationshipType.Exports,
              confidence: 1.0,
              crossLanguage: false,
            };
          }
        }
        return null;
      },
      onInheritance: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo[] | null => {
        const relationships: RelationshipInfo[] = [];
        const classNameNode = node.childForFieldName('name');
        if (classNameNode) {
          const qualifiedName = this.getQualifiedName(node, context.content);
          const extendsClauseNode = node.childForFieldName('heritage_clause');
          if (extendsClauseNode) {
            const extendsNode = extendsClauseNode.children.find((child: any) => child.type === 'extends_clause');
            if (extendsNode) {
              const baseClassNode = extendsNode.child(1); // Assuming identifier is at index 1
              if (baseClassNode && baseClassNode.type === 'type_identifier') {
                const baseClassName = this.getNodeText(baseClassNode, context.content);
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
      ['class_declaration', 'onClass'],
      ['interface_declaration', 'onInterface'],
      ['function_declaration', 'onFunction'],
      ['method_definition', 'onMethod'],
      ['call_expression', 'onCall'],
      ['import_statement', 'onImport'],
      ['export_statement', 'onExport'],
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
    
    // Track current context - similar to C++ parser
    let currentNamespace: string | undefined;
    let currentClass: string | undefined;
    let currentInterface: string | undefined;
    let insideEnum = false;
    let braceDepth = 0;
    let classBraceDepth = -1; // -1 means not in a class
    let interfaceBraceDepth = -1; // -1 means not in an interface
    let classStack: { name: string; depth: number }[] = []; // Support nested classes
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('//') || trimmedLine === '') continue;
      
      // Count braces on this line
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      
      // Interface detection
      const interfaceMatch = line.match(/export\s+interface\s+(\w+)(?:<.*?>)?/);
      if (!interfaceMatch) {
        const simpleInterfaceMatch = line.match(/interface\s+(\w+)(?:<.*?>)?/);
        if (simpleInterfaceMatch) {
          symbols.push({
            name: simpleInterfaceMatch[1],
            qualifiedName: simpleInterfaceMatch[1],
            kind: UniversalSymbolKind.Interface,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.9,
            semanticTags: [],
            complexity: 1,
            isExported: false,
            isAsync: false,
            languageFeatures: {}
          });
          currentInterface = simpleInterfaceMatch[1];
          interfaceBraceDepth = braceDepth + openBraces;
        }
      } else if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          qualifiedName: interfaceMatch[1],
          kind: UniversalSymbolKind.Interface,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: [],
          complexity: 1,
          isExported: true,
          isAsync: false,
          languageFeatures: {}
        });
        currentInterface = interfaceMatch[1];
        interfaceBraceDepth = braceDepth + openBraces;
      }
      
      // Class detection
      const classMatch = line.match(/export\s+(?:abstract\s+)?class\s+(\w+)(?:<.*?>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+(.+?))?(?:\s*{)?/);
      if (!classMatch) {
        const simpleClassMatch = line.match(/(?:abstract\s+)?class\s+(\w+)(?:<.*?>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+(.+?))?(?:\s*{)?/);
        if (simpleClassMatch) {
          const className = simpleClassMatch[1];
          symbols.push({
            name: className,
            qualifiedName: className,
            kind: UniversalSymbolKind.Class,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.9,
            semanticTags: [],
            complexity: 1,
            isExported: false,
            isAsync: false,
            languageFeatures: {
              isAbstract: line.includes('abstract'),
              extends: simpleClassMatch[2] || undefined,
              implements: simpleClassMatch[3]?.split(',').map(s => s.trim()) || []
            }
          });
          currentClass = className;
          // If there's an opening brace on the same line, include it
          if (line.includes('{')) {
            classBraceDepth = braceDepth + 1;
          } else {
            // Brace might be on next line
            classBraceDepth = braceDepth;
          }
          classStack.push({ name: className, depth: classBraceDepth });
          
          // Add inheritance relationship
          if (simpleClassMatch[2]) {
            relationships.push({
              fromName: className,
              toName: simpleClassMatch[2],
              relationshipType: UniversalRelationshipType.Inherits,
              confidence: 0.9,
              crossLanguage: false
            });
          }
        }
      } else if (classMatch) {
        const className = classMatch[1];
        symbols.push({
          name: className,
          qualifiedName: className,
          kind: UniversalSymbolKind.Class,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: [],
          complexity: 1,
          isExported: true,
          isAsync: false,
          languageFeatures: {
            isAbstract: line.includes('abstract'),
            extends: classMatch[2] || undefined,
            implements: classMatch[3]?.split(',').map(s => s.trim()) || []
          }
        });
        currentClass = className;
        // If there's an opening brace on the same line, include it
        if (line.includes('{')) {
          classBraceDepth = braceDepth + 1;
        } else {
          // Brace might be on next line
          classBraceDepth = braceDepth;
        }
        classStack.push({ name: className, depth: classBraceDepth });
        
        // Add inheritance relationship
        if (classMatch[2]) {
          relationships.push({
            fromName: className,
            toName: classMatch[2],
            relationshipType: UniversalRelationshipType.Inherits,
            confidence: 0.9,
            crossLanguage: false
          });
        }
      }
      
      // Function/Method detection
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<.*?>)?\s*\(/);
      const arrowFuncMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/);
      
      // Method detection - only look for methods inside classes
      let methodMatch = null;
      if (currentClass && classBraceDepth >= 0) {
        if (braceDepth >= classBraceDepth) {
          // Inside a class - look for method patterns
          // Pattern 1: async methodName(params): ReturnType {
          methodMatch = line.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*:\s*.*?\s*{/);
          if (!methodMatch) {
            // Pattern 2: methodName(params) {
            methodMatch = line.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/);
          }
          if (!methodMatch) {
            // Pattern 3: With modifiers
            methodMatch = line.match(/^\s*(?:(?:public|private|protected|static|readonly)\s+)*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/);
          }
        }
      }
      
      if (funcMatch) {
        const funcName = funcMatch[1];
        symbols.push({
          name: funcName,
          qualifiedName: currentClass ? `${currentClass}.${funcName}` : funcName,
          kind: UniversalSymbolKind.Function,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: [],
          complexity: 1,
          isExported: line.includes('export'),
          isAsync: line.includes('async'),
          languageFeatures: {}
        });
      } else if (arrowFuncMatch) {
        const funcName = arrowFuncMatch[1];
        const isReactComponent = line.includes('React.FC') || line.includes('React.Component');
        const isHook = funcName.startsWith('use') && funcName[3] === funcName[3].toUpperCase();
        
        symbols.push({
          name: funcName,
          qualifiedName: funcName,
          kind: UniversalSymbolKind.Function,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: [],
          complexity: 1,
          isExported: line.includes('export'),
          isAsync: line.includes('async'),
          languageFeatures: {
            isReactComponent,
            isReactHook: isHook
          }
        });
      } else if (methodMatch) {
        const methodName = methodMatch[1];
        // Skip reserved words, constructor, and control flow keywords
        const reservedWords = ['constructor', 'if', 'for', 'while', 'switch', 'catch', 'try', 'else', 'return', 'throw', 'typeof', 'instanceof', 'new', 'var', 'let', 'const'];
        if (!reservedWords.includes(methodName)) {
          symbols.push({
            name: methodName,
            qualifiedName: `${currentClass}.${methodName}`,
            kind: UniversalSymbolKind.Method,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.7,
            semanticTags: [],
            complexity: 1,
            isExported: false,
            isAsync: line.includes('async'),
            languageFeatures: {
              visibility: line.includes('private') ? 'private' : line.includes('protected') ? 'protected' : 'public',
              isStatic: line.includes('static')
            }
          });
        }
      }
      
      // Enum detection
      const enumMatch = line.match(/export\s+enum\s+(\w+)/);
      if (!enumMatch) {
        const simpleEnumMatch = line.match(/enum\s+(\w+)/);
        if (simpleEnumMatch) {
          symbols.push({
            name: simpleEnumMatch[1],
            qualifiedName: simpleEnumMatch[1],
            kind: UniversalSymbolKind.Enum,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.9,
            semanticTags: [],
            complexity: 1,
            isExported: false,
            isAsync: false,
            languageFeatures: {}
          });
          insideEnum = true;
        }
      } else if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          qualifiedName: enumMatch[1],
          kind: UniversalSymbolKind.Enum,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: [],
          complexity: 1,
          isExported: true,
          isAsync: false,
          languageFeatures: {}
        });
        insideEnum = true;
      }
      
      // Type alias detection
      const typeMatch = line.match(/export\s+type\s+(\w+)(?:<.*?>)?\s*=/);
      if (!typeMatch) {
        const simpleTypeMatch = line.match(/type\s+(\w+)(?:<.*?>)?\s*=/);
        if (simpleTypeMatch) {
          symbols.push({
            name: simpleTypeMatch[1],
            qualifiedName: simpleTypeMatch[1],
            kind: UniversalSymbolKind.TypeAlias,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.8,
            semanticTags: [],
            complexity: 1,
            isExported: false,
            isAsync: false,
            languageFeatures: {}
          });
        }
      } else if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          qualifiedName: typeMatch[1],
          kind: UniversalSymbolKind.TypeAlias,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: [],
          complexity: 1,
          isExported: true,
          isAsync: false,
          languageFeatures: {}
        });
      }
      
      // Import detection
      const importMatch = line.match(/import\s+(?:\{[^}]+\}|[^{}\s]+)\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        relationships.push({
          fromName: filePath,
          toName: importMatch[1],
          relationshipType: UniversalRelationshipType.Imports,
          confidence: 1.0,
          crossLanguage: false
        });
      }
      
      // Process spawning detection
      const spawnMatch = line.match(/\b(spawn|exec|execFile|fork)\s*\(/);
      const pythonCallMatch = line.match(/\b(callPythonScript|executePython|runPython)\s*\(\s*['"`]([^'"`]*\.py)['"`]/);
      
      if (spawnMatch || pythonCallMatch) {
        let targetScript = 'python_script';
        let isSpawn = false;
        let spawnType = 'spawn';
        
        if (pythonCallMatch) {
          // Direct Python method call with script name
          targetScript = pythonCallMatch[2]; // Extract script name from quotes
          isSpawn = true;
          spawnType = pythonCallMatch[1]; // callPythonScript, executePython, etc.
        } else if (spawnMatch) {
          // Check if it's spawning a Python script
          const pythonMatch = line.match(/(python3?|\.py['"])/);
          if (pythonMatch) {
            // Try to extract script name from spawn arguments
            const scriptMatch = line.match(/(['"`])([^'"`]*\.py)\1/);
            targetScript = scriptMatch ? scriptMatch[2] : 'python_script';
            isSpawn = true;
            spawnType = spawnMatch[1];
          }
        }
        
        if (isSpawn) {
          // Find the current method/function we're in
          let targetSymbol = null;
          
          // Look backwards through symbols to find the containing method/function
          for (let j = symbols.length - 1; j >= 0; j--) {
            const sym = symbols[j];
            if ((sym.kind === UniversalSymbolKind.Method || sym.kind === UniversalSymbolKind.Function) &&
                sym.line <= lineNum) {
              targetSymbol = sym;
              break;
            }
          }
          
          if (targetSymbol) {
            if (!targetSymbol.languageFeatures) {
              targetSymbol.languageFeatures = {};
            }
            targetSymbol.languageFeatures.spawn = spawnType;
            targetSymbol.languageFeatures.spawnsPython = true;
            targetSymbol.semanticTags.push('cross-language-caller');
            
            // Create cross-language relationship
            relationships.push({
              fromName: targetSymbol.qualifiedName,
              toName: targetScript,
              relationshipType: UniversalRelationshipType.Spawns,
              confidence: 0.9,
              crossLanguage: true,
              lineNumber: lineNum,
              columnNumber: 0,
            });
          }
        }
      }
      
      // Namespace detection
      const namespaceMatch = line.match(/(?:export\s+)?namespace\s+(\w+)/);
      if (namespaceMatch) {
        currentNamespace = namespaceMatch[1];
        symbols.push({
          name: namespaceMatch[1],
          qualifiedName: namespaceMatch[1],
          kind: UniversalSymbolKind.Namespace,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: [],
          complexity: 1,
          isExported: line.includes('export'),
          isAsync: false,
          languageFeatures: {}
        });
      }
      
      // Check for closing braces BEFORE updating depth
      if (closeBraces > 0) {
        // Check if we're exiting a class
        if (classBraceDepth >= 0 && braceDepth <= classBraceDepth) {
          currentClass = undefined;
          classBraceDepth = -1;
          
          // Pop from stack and check for parent class
          classStack.pop();
          if (classStack.length > 0) {
            const parent = classStack[classStack.length - 1];
            currentClass = parent.name;
            classBraceDepth = parent.depth;
          }
        }
        
        // Check if we're exiting an interface
        if (interfaceBraceDepth >= 0 && braceDepth <= interfaceBraceDepth) {
          currentInterface = undefined;
          interfaceBraceDepth = -1;
        }
        
        // Check if we're exiting an enum
        if (insideEnum && braceDepth === 0) {
          insideEnum = false;
        }
      }
      
      // Update brace depth after processing the line
      braceDepth += openBraces - closeBraces;
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
      if (current.type === 'class_declaration' || current.type === 'interface_declaration' || current.type === 'function_declaration' || current.type === 'method_definition') {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          parts.unshift(this.getNodeText(nameNode, content));
        }
      }
    }
    return parts.join('.');
  }

  private getCallArguments(node: Parser.SyntaxNode, content: string): string[] {
    const args: string[] = [];
    const argumentsNode = node.childForFieldName('arguments');
    if (argumentsNode) {
      for (let i = 0; i < argumentsNode.childCount; i++) {
        const arg = argumentsNode.child(i);
        if (arg && arg.type !== ',' && arg.type !== '(' && arg.type !== ')') {
          const argText = this.getNodeText(arg, content).trim();
          // Remove quotes from string literals
          const cleanArgText = argText.replace(/^['"`]|['"`]$/g, '');
          args.push(cleanArgText);
        }
      }
    }
    return args;
  }

  // TypeScript-specific helper methods
  private isExported(node: Parser.SyntaxNode, context: VisitorContext): boolean {
    // Check for export keyword
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === 'export_statement') {
        return true;
      }
      // Check if there's an export modifier
      const hasExportModifier = current.children.some(child => 
        child.type === 'export' || child.text === 'export'
      );
      if (hasExportModifier) return true;
      current = current.parent;
    }
    return false;
  }

  private isAsyncFunction(node: Parser.SyntaxNode): boolean {
    // Check for async modifier
    return node.children.some(child => 
      child.type === 'async' || child.text === 'async'
    );
  }

  private isAbstract(node: Parser.SyntaxNode): boolean {
    return node.children.some(child => 
      child.type === 'abstract' || child.text === 'abstract'
    );
  }

  private isStatic(node: Parser.SyntaxNode): boolean {
    return node.children.some(child => 
      child.type === 'static' || child.text === 'static'
    );
  }

  private isReadonly(node: Parser.SyntaxNode): boolean {
    return node.children.some(child => 
      child.type === 'readonly' || child.text === 'readonly'
    );
  }

  private getVisibility(node: Parser.SyntaxNode): string {
    if (node.children.some(child => child.text === 'private')) return 'private';
    if (node.children.some(child => child.text === 'protected')) return 'protected';
    if (node.children.some(child => child.text === 'public')) return 'public';
    return 'public'; // Default in TypeScript
  }

  private getTypeParameters(node: Parser.SyntaxNode, content: string): string[] | null {
    const typeParamsNode = node.childForFieldName('type_parameters');
    if (typeParamsNode) {
      const params: string[] = [];
      for (const param of typeParamsNode.children) {
        if (param.type === 'type_parameter') {
          params.push(this.getNodeText(param, content));
        }
      }
      return params.length > 0 ? params : null;
    }
    return null;
  }

  private getParameters(node: Parser.SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const parametersNode = node.childForFieldName('parameters');
    if (parametersNode) {
      for (const param of parametersNode.children) {
        if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
          const paramInfo: any = {
            name: this.getNodeText(param.childForFieldName('pattern') || param, content),
            required: param.type === 'required_parameter'
          };
          
          // Get type annotation
          const typeNode = param.childForFieldName('type');
          if (typeNode) {
            paramInfo.type = this.getNodeText(typeNode, content);
          }
          
          params.push(paramInfo);
        }
      }
    }
    return params;
  }

  private getReturnType(node: Parser.SyntaxNode, content: string): string | null {
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      return this.getNodeText(returnTypeNode, content);
    }
    return null;
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

  private getImplements(node: Parser.SyntaxNode, content: string): string[] {
    const implementsList: string[] = [];
    const heritageNode = node.childForFieldName('heritage');
    if (heritageNode) {
      for (const clause of heritageNode.children) {
        if (clause.type === 'implements_clause') {
          for (const child of clause.children) {
            if (child.type === 'type_identifier' || child.type === 'generic_type') {
              implementsList.push(this.getNodeText(child, content));
            }
          }
        }
      }
    }
    return implementsList;
  }

  private getExtends(node: Parser.SyntaxNode, content: string): string[] {
    const extendsList: string[] = [];
    const heritageNode = node.childForFieldName('heritage');
    if (heritageNode) {
      for (const clause of heritageNode.children) {
        if (clause.type === 'extends_clause') {
          for (const child of clause.children) {
            if (child.type === 'type_identifier' || child.type === 'generic_type') {
              extendsList.push(this.getNodeText(child, content));
            }
          }
        }
      }
    }
    return extendsList;
  }
}
