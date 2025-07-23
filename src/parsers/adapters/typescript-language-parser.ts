
import { OptimizedTreeSitterBaseParser } from '../tree-sitter/optimized-base-parser.js';
import { ParseOptions, SymbolInfo, RelationshipInfo, PatternInfo, ParseResult } from '../tree-sitter/parser-types.js';
import { UniversalSymbolKind, UniversalRelationshipType } from '../language-parser-interface.js';
import { typescriptQueries } from '../queries/typescript-queries.js';
import { Database } from 'better-sqlite3';
import { CrossLanguageDetector } from '../utils/cross-language-detector.js';
import { ParserPostProcessor } from '../utils/parser-post-processor.js';

import Parser from 'tree-sitter';
import { VisitorHandlers, VisitorContext } from '../unified-ast-visitor.js';

export class TypeScriptLanguageParser extends OptimizedTreeSitterBaseParser {
  
  /**
   * Override parseFile to apply consolidated post-processing
   */
  async parseFile(filePath: string, content: string): Promise<ParseResult> {
    // Call parent implementation
    const result = await super.parseFile(filePath, content);
    
    // Apply consolidated post-processing (deduplication + validation + quality checks)
    const processor = new ParserPostProcessor();
    const processedResult = processor.process(result, filePath);
    
    // Log processing results
    if (processedResult.processing.duplicatesRemoved > 0) {
      this.debug(`🛡️ Post-processing: removed ${processedResult.processing.duplicatesRemoved} duplicates`);
    }
    
    if (processedResult.processing.validationErrors.length > 0) {
      this.debug(`🚨 Post-processing: ${processedResult.processing.validationErrors.length} errors`);
      processedResult.processing.validationErrors.forEach(error => {
        this.debug(`  ❌ ${error}`);
      });
    }
    
    if (processedResult.processing.validationWarnings.length > 0) {
      this.debug(`⚠️ Post-processing: ${processedResult.processing.validationWarnings.length} warnings`);
      processedResult.processing.validationWarnings.slice(0, 3).forEach(warning => {
        this.debug(`  ⚠️ ${warning}`);
      });
    }
    
    this.debug(`📊 Quality score: ${processedResult.processing.qualityScore.toFixed(1)}/100`);
    
    return processedResult;
  }

  constructor(db: Database, options: ParseOptions) {
    super(db, options);
  }

  async initialize(): Promise<void> {
    try {
      // Use native tree-sitter-typescript (Node.js API) - modern v0.23.2
      const typescriptLanguage = require("tree-sitter-typescript/typescript");
      if (typescriptLanguage && this.parser) {
        this.parser.setLanguage(typescriptLanguage);
        this.debug("Successfully loaded tree-sitter-typescript v0.23.2!");
        return;
      }
    } catch (error) {
      this.debug(`Failed to load tree-sitter-typescript: ${error}`);
    }
    
    // Fall back to pattern-based parsing if tree-sitter fails
    this.debug("Using pattern-based parsing for TypeScript");
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
          
          // Check for dynamic import() calls
          if (functionName === 'import') {
            const argumentsNode = node.childForFieldName('arguments');
            if (argumentsNode) {
              const argsText = this.getNodeText(argumentsNode, context.content);
              // Extract the module path from import('path') or import(`template`)
              let modulePath: string | null = null;
              
              // Handle string literals: import('path')
              const stringMatch = argsText.match(/['"]([^'"]+)['"]/);
              if (stringMatch) {
                modulePath = stringMatch[1];
              } else {
                // Handle template literals: import(`./modules/${moduleName}`)
                const templateMatch = argsText.match(/`([^`]+)`/);
                if (templateMatch) {
                  modulePath = templateMatch[1]; // Keep full template for analysis
                }
              }
              
              if (modulePath) {
                return {
                  fromName: callerName,
                  toName: modulePath,
                  relationshipType: UniversalRelationshipType.Imports,
                  confidence: 0.9,
                  crossLanguage: false,
                  lineNumber: node.startPosition.row + 1,
                  columnNumber: node.startPosition.column,
                  sourceContext: this.getNodeText(node, context.content),
                  usagePattern: 'dynamic_import',
                  metadata: {
                    isDynamicImport: true,
                    moduleSpecifier: modulePath
                  }
                };
              }
            }
          }
          
          // Use enhanced cross-language detection
          const line = this.getNodeText(node, context.content);
          const crossLangCalls = CrossLanguageDetector.detectCrossLanguageCalls(
            line,
            node.startPosition.row + 1,
            'typescript',
            context.filePath
          );
          
          // If cross-language call detected, create relationship
          if (crossLangCalls.length > 0) {
            const crossLang = crossLangCalls[0];
            return {
              fromName: callerName,
              toName: crossLang.targetEndpoint || functionName,
              relationshipType: crossLang.relationship.relationshipType || UniversalRelationshipType.Invokes,
              confidence: crossLang.confidence,
              crossLanguage: true,
              lineNumber: node.startPosition.row + 1,
              columnNumber: node.startPosition.column,
              metadata: {
                ...crossLang.metadata,
                crossLanguageType: crossLang.type,
                targetLanguage: crossLang.targetLanguage
              }
            };
          }
          
          // Regular function call
          return {
            fromName: callerName,
            toName: functionName,
            relationshipType: UniversalRelationshipType.Calls,
            confidence: 0.7,
            crossLanguage: false,
            lineNumber: node.startPosition.row + 1,
            columnNumber: node.startPosition.column
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
      onVariable: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Handle variable declarations (const, let, var)
        let nameNode: Parser.SyntaxNode | null = null;
        let variableName: string | null = null;
        let isArrowFunction = false;
        let isReactComponent = false;
        
        
        if (node.type === 'lexical_declaration') {
          // lexical_declaration -> variable_declarator -> identifier
          const declarator = node.children.find(child => child.type === 'variable_declarator');
          if (declarator) {
            // Try multiple ways to get the identifier name
            nameNode = declarator.childForFieldName('name');
            if (!nameNode) {
              // Look for identifier in children
              nameNode = declarator.children.find(child => child.type === 'identifier') || null;
            }
            if (!nameNode) {
              // Look deeper for identifier (in case of complex patterns)
              for (const child of declarator.children) {
                if (child.type === 'identifier') {
                  nameNode = child;
                  break;
                }
                // Check child's children for identifier
                for (const grandchild of child.children || []) {
                  if (grandchild.type === 'identifier') {
                    nameNode = grandchild;
                    break;
                  }
                }
                if (nameNode) break;
              }
            }
            
            if (nameNode) {
              variableName = this.getNodeText(nameNode, context.content);
              
              // Check if this is an arrow function assignment
              const valueNode = declarator.childForFieldName('value');
              if (valueNode) {
                const valueText = this.getNodeText(valueNode, context.content);
                isArrowFunction = valueText.includes('=>') || valueText.includes('function');
                isReactComponent = valueText.includes('React.FC') || valueText.includes('React.Component');
              }
            }
          }
        } else if (node.type === 'variable_declarator') {
          // Direct variable_declarator
          nameNode = node.childForFieldName('name') || node.children.find(child => child.type === 'identifier') || null;
          if (nameNode) {
            variableName = this.getNodeText(nameNode, context.content);
            
            // Check if this is an arrow function assignment
            const valueNode = node.childForFieldName('value');
            if (valueNode) {
              const valueText = this.getNodeText(valueNode, context.content);
              isArrowFunction = valueText.includes('=>') || valueText.includes('function');
              isReactComponent = valueText.includes('React.FC') || valueText.includes('React.Component');
            }
          }
        }
        
        if (variableName && nameNode) {
          const qualifiedName = this.getQualifiedName(nameNode, context.content);
          
          // Determine symbol kind based on content
          let symbolKind = UniversalSymbolKind.Variable;
          if (isArrowFunction) {
            symbolKind = UniversalSymbolKind.Function;
          }
          
          return {
            name: variableName,
            qualifiedName: qualifiedName,
            kind: symbolKind,
            filePath: context.filePath,
            line: node.startPosition.row,
            column: node.startPosition.column,
            endLine: node.endPosition.row,
            endColumn: node.endPosition.column,
            isDefinition: true,
            confidence: 0.9,
            semanticTags: [],
            complexity: 1,
            isExported: this.isExported(node, context),
            isAsync: this.isAsyncFunction(node),
            languageFeatures: {
              isReactComponent,
              isArrowFunction
            }
          };
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
      },
      onArrowFunction: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Extract arrow function name and details
        const functionText = this.getNodeText(node, context.content);
        
        // Try to find the function name from parent assignment or property
        let functionName = 'anonymous';
        const parent = node.parent;
        
        if (parent?.type === 'variable_declarator') {
          const nameNode = parent.childForFieldName('name');
          if (nameNode) {
            functionName = this.getNodeText(nameNode, context.content);
          }
        } else if (parent?.type === 'pair') {
          // Arrow function in object property
          const keyNode = parent.childForFieldName('key');
          if (keyNode) {
            functionName = this.getNodeText(keyNode, context.content);
          }
        } else if (parent?.type === 'assignment_expression') {
          const leftNode = parent.childForFieldName('left');
          if (leftNode) {
            functionName = this.getNodeText(leftNode, context.content);
          }
        }
        
        const isAsync = functionText.includes('async');
        const hasGenerics = functionText.includes('<') && functionText.includes('>');
        
        return {
          name: functionName,
          qualifiedName: this.getQualifiedName(node, context.content),
          kind: UniversalSymbolKind.Function,
          filePath: context.filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          endLine: node.endPosition.row + 1,
          endColumn: node.endPosition.column,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: isAsync ? ['async'] : [],
          complexity: this.calculateComplexity(functionText),
          isExported: false,
          isAsync,
          languageFeatures: {
            isArrowFunction: true,
            hasGenerics,
            returnType: this.extractReturnType(functionText)
          }
        };
      },
      onProperty: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Handle object property definitions that might contain arrow functions
        const keyNode = node.childForFieldName('key');
        const valueNode = node.childForFieldName('value');
        
        if (!keyNode || !valueNode) return null;
        
        const propertyName = this.getNodeText(keyNode, context.content);
        const valueText = this.getNodeText(valueNode, context.content);
        
        // Check if the value is an arrow function
        if (valueNode.type === 'arrow_function' || valueText.includes('=>')) {
          const isAsync = valueText.includes('async');
          const hasGenerics = valueText.includes('<') && valueText.includes('>');
          
          return {
            name: propertyName,
            qualifiedName: this.getQualifiedName(node, context.content),
            kind: UniversalSymbolKind.Function,
            filePath: context.filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            endLine: node.endPosition.row + 1,
            endColumn: node.endPosition.column,
            isDefinition: true,
            confidence: 0.9,
            semanticTags: isAsync ? ['async'] : [],
            complexity: this.calculateComplexity(valueText),
            isExported: false,
            isAsync,
            languageFeatures: {
              isArrowFunction: true,
              isObjectProperty: true,
              hasGenerics,
              returnType: this.extractReturnType(valueText)
            }
          };
        }
        
        // For non-function properties, return a property symbol
        return {
          name: propertyName,
          qualifiedName: this.getQualifiedName(node, context.content),
          kind: UniversalSymbolKind.Variable,
          filePath: context.filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          endLine: node.endPosition.row + 1,
          endColumn: node.endPosition.column,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: [],
          complexity: 1,
          isExported: false,
          isAsync: false,
          languageFeatures: {
            isObjectProperty: true,
            propertyType: this.extractPropertyType(valueText)
          }
        };
      },
      onTypeAlias: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Handle TypeScript type alias declarations
        const nameNode = node.childForFieldName('name');
        if (!nameNode) return null;
        
        const typeName = this.getNodeText(nameNode, context.content);
        const typeValueNode = node.childForFieldName('value');
        const typeValue = typeValueNode ? this.getNodeText(typeValueNode, context.content) : '';
        
        const isTemplateLiteral = typeValue.includes('`') && typeValue.includes('${');
        const isUnionType = typeValue.includes(' | ');
        const isGeneric = typeValue.includes('<') && typeValue.includes('>');
        
        return {
          name: typeName,
          qualifiedName: this.getQualifiedName(node, context.content),
          kind: UniversalSymbolKind.TypeAlias,
          filePath: context.filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          endLine: node.endPosition.row + 1,
          endColumn: node.endPosition.column,
          isDefinition: true,
          confidence: 0.95,
          semanticTags: isTemplateLiteral ? ['template-literal'] : isUnionType ? ['union'] : [],
          complexity: 1,
          isExported: false,
          isAsync: false,
          signature: `type ${typeName} = ${typeValue}`,
          languageFeatures: {
            isTemplateLiteral,
            isUnionType,
            isGeneric,
            typeValue: typeValue.trim()
          }
        };
      },
      onObjectPattern: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo[] | null => {
        // Handle object destructuring patterns like { a, b: c, ...rest }
        const symbols: SymbolInfo[] = [];
        
        for (const child of node.children) {
          if (child.type === 'shorthand_property_identifier_pattern') {
            // Simple destructuring: { a }
            const name = this.getNodeText(child, context.content);
            symbols.push(this.createDestructuredSymbol(name, child, context));
          } else if (child.type === 'pair_pattern') {
            // Renamed destructuring: { a: b }
            const valueNode = child.childForFieldName('value');
            if (valueNode) {
              if (valueNode.type === 'identifier') {
                // Simple rename: { a: b }
                const name = this.getNodeText(valueNode, context.content);
                symbols.push(this.createDestructuredSymbol(name, valueNode, context));
              } else if (valueNode.type === 'object_pattern' || valueNode.type === 'array_pattern') {
                // Nested destructuring: { a: { b } } - will be handled recursively
                // The visitor will call the appropriate handler for the nested pattern
              }
            }
          } else if (child.type === 'rest_pattern') {
            // Rest destructuring: { ...rest }
            const identifierNode = child.children.find(c => c.type === 'identifier');
            if (identifierNode) {
              const name = this.getNodeText(identifierNode, context.content);
              symbols.push(this.createDestructuredSymbol(name, identifierNode, context, true));
            }
          }
        }
        
        return symbols.length > 0 ? symbols : null;
      },
      onArrayPattern: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo[] | null => {
        // Handle array destructuring patterns like [a, b, ...rest]
        const symbols: SymbolInfo[] = [];
        
        for (const child of node.children) {
          if (child.type === 'identifier') {
            // Simple array destructuring: [a, b]
            const name = this.getNodeText(child, context.content);
            symbols.push(this.createDestructuredSymbol(name, child, context));
          } else if (child.type === 'rest_pattern') {
            // Rest destructuring: [...rest]
            const identifierNode = child.children.find(c => c.type === 'identifier');
            if (identifierNode) {
              const name = this.getNodeText(identifierNode, context.content);
              symbols.push(this.createDestructuredSymbol(name, identifierNode, context, true));
            }
          }
        }
        
        return symbols.length > 0 ? symbols : null;
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
      // CRITICAL FIX: Add missing node types for const/let/var declarations
      ['lexical_declaration', 'onVariable'],
      ['variable_declarator', 'onVariable'],
      // CRITICAL FIX: Add arrow function and property handlers
      ['arrow_function', 'onArrowFunction'],
      ['pair', 'onProperty'],
      // Add type alias support for template literal types
      ['type_alias_declaration', 'onTypeAlias'],
      // Add destructuring pattern support
      ['object_pattern', 'onObjectPattern'],
      ['array_pattern', 'onArrayPattern'],
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
      const arrowFuncMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/);
      const generatorMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s*\*\s*(\w+)\s*(?:<.*?>)?\s*\(/);
      
      // Modern pattern detection
      const decoratorMatch = line.match(/^\s*@(\w+)(?:\([^)]*\))?\s*$/);
      const privateFieldMatch = line.match(/^\s*#(\w+)\s*(?::\s*[^=;]+)?(?:\s*=\s*[^;]+)?;/);
      const getterSetterMatch = line.match(/^\s*(?:get|set)\s+(\w+)\s*\(/);
      
      // Method detection - only look for methods inside classes
      let methodMatch = null;
      if (currentClass && classBraceDepth >= 0) {
        if (braceDepth >= classBraceDepth) {
          // Inside a class - look for method patterns
          // Pattern 1: async methodName(params): ReturnType {
          methodMatch = line.match(/^\s*(?:(?:public|private|protected|static|readonly|override|abstract)\s+)*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/);
          if (!methodMatch) {
            // Pattern 2: methodName(params) {
            methodMatch = line.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/);
          }
          if (!methodMatch) {
            // Pattern 3: Property methods (arrow functions as class properties)
            methodMatch = line.match(/^\s*(?:(?:public|private|protected|static|readonly)\s+)*(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/);
          }
          if (!methodMatch && getterSetterMatch) {
            // Pattern 4: Getter/Setter
            methodMatch = getterSetterMatch;
          }
        }
      }
      
      // Handle generators first
      if (generatorMatch) {
        const funcName = generatorMatch[1];
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
          semanticTags: ['generator'],
          complexity: 1,
          isExported: line.includes('export'),
          isAsync: line.includes('async'),
          languageFeatures: {
            isGenerator: true
          }
        });
      } else if (funcMatch) {
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
      
      // Enhanced cross-language detection
      const crossLangCalls = CrossLanguageDetector.detectCrossLanguageCalls(
        line,
        lineNum,
        'typescript',
        filePath
      );
      
      if (crossLangCalls.length > 0) {
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
          // Process each cross-language call
          for (const crossLang of crossLangCalls) {
            if (!targetSymbol.languageFeatures) {
              targetSymbol.languageFeatures = {};
            }
            
            // Add cross-language metadata
            targetSymbol.languageFeatures.crossLanguageCalls = targetSymbol.languageFeatures.crossLanguageCalls || [];
            targetSymbol.languageFeatures.crossLanguageCalls.push({
              type: crossLang.type,
              target: crossLang.targetEndpoint,
              language: crossLang.targetLanguage
            });
            
            if (!targetSymbol.semanticTags.includes('cross-language-caller')) {
              targetSymbol.semanticTags.push('cross-language-caller');
            }
            
            // Create cross-language relationship
            relationships.push({
              fromName: targetSymbol.qualifiedName,
              toName: crossLang.targetEndpoint || 'unknown',
              relationshipType: crossLang.relationship.relationshipType || UniversalRelationshipType.Invokes,
              confidence: crossLang.confidence,
              crossLanguage: true,
              lineNumber: lineNum,
              columnNumber: 0,
              metadata: crossLang.metadata
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
      
      // Private field detection (inside classes)
      if (currentClass && privateFieldMatch) {
        const fieldName = privateFieldMatch[1];
        symbols.push({
          name: `#${fieldName}`,
          qualifiedName: `${currentClass}.#${fieldName}`,
          kind: UniversalSymbolKind.Field,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: ['private-field'],
          complexity: 1,
          isExported: false,
          isAsync: false,
          languageFeatures: {
            visibility: 'private',
            isPrivateField: true
          }
        });
      }
      
      // Re-export detection
      const reExportMatch = line.match(/export\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"]/);
      if (reExportMatch) {
        const exports = reExportMatch[1].split(',').map(e => e.trim());
        exports.forEach(exp => {
          // Handle renamed exports: originalName as exportedName
          const [original, exported] = exp.split(/\s+as\s+/).map(s => s.trim());
          relationships.push({
            fromName: filePath,
            toName: reExportMatch[2],
            relationshipType: UniversalRelationshipType.ReExports,
            confidence: 1.0,
            crossLanguage: false,
            metadata: {
              originalName: original,
              exportedName: exported || original
            }
          });
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

  /**
   * Calculate complexity of a function based on its content
   */
  private calculateComplexity(functionText: string): number {
    let complexity = 1; // Base complexity
    
    // Add complexity for control structures
    const controlPatterns = [
      /\bif\b/g, /\belse\b/g, /\bwhile\b/g, /\bfor\b/g, /\bswitch\b/g,
      /\bcatch\b/g, /\btry\b/g, /\?\s*:/g // ternary operator
    ];
    
    for (const pattern of controlPatterns) {
      const matches = functionText.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    return Math.min(complexity, 10); // Cap at 10
  }

  /**
   * Extract return type from function signature
   */
  private extractReturnType(functionText: string): string | undefined {
    // Look for explicit return type annotation
    const returnTypeMatch = functionText.match(/:\s*([^=>{]+)\s*=>/);
    if (returnTypeMatch) {
      return returnTypeMatch[1].trim();
    }
    
    // Try to infer from return statements
    const returnMatch = functionText.match(/return\s+([^;}\n]+)/);
    if (returnMatch) {
      const returnValue = returnMatch[1].trim();
      if (returnValue.startsWith('"') || returnValue.startsWith("'")) return 'string';
      if (returnValue.match(/^\d+$/)) return 'number';
      if (returnValue === 'true' || returnValue === 'false') return 'boolean';
      if (returnValue.startsWith('{')) return 'object';
      if (returnValue.startsWith('[')) return 'array';
    }
    
    return undefined;
  }

  /**
   * Extract property type from value
   */
  private extractPropertyType(valueText: string): string | undefined {
    if (valueText.includes('=>')) return 'function';
    if (valueText.startsWith('"') || valueText.startsWith("'")) return 'string';
    if (valueText.match(/^\d+$/)) return 'number';
    if (valueText === 'true' || valueText === 'false') return 'boolean';
    if (valueText.startsWith('{')) return 'object';
    if (valueText.startsWith('[')) return 'array';
    return 'unknown';
  }

  /**
   * Create a symbol for a destructured variable
   */
  private createDestructuredSymbol(
    name: string, 
    node: Parser.SyntaxNode, 
    context: VisitorContext, 
    isRest: boolean = false
  ): SymbolInfo {
    return {
      name,
      qualifiedName: this.getQualifiedName(node, context.content),
      kind: UniversalSymbolKind.Variable,
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column,
      isDefinition: true,
      confidence: 0.9,
      semanticTags: isRest ? ['rest', 'destructured'] : ['destructured'],
      complexity: 1,
      isExported: false,
      isAsync: false,
      languageFeatures: {
        isDestructured: true,
        isRestParameter: isRest
      }
    };
  }
}
