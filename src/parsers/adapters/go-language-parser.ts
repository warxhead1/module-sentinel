import { OptimizedTreeSitterBaseParser } from '../tree-sitter/optimized-base-parser.js';
import { ParseOptions, SymbolInfo, RelationshipInfo, PatternInfo } from '../tree-sitter/parser-types.js';
import { UniversalSymbolKind, UniversalRelationshipType } from '../language-parser-interface.js';
import { Database } from 'better-sqlite3';
import { CrossLanguageDetector } from '../utils/cross-language-detector.js';

import Parser from 'tree-sitter';
import { VisitorHandlers, VisitorContext } from '../unified-ast-visitor.js';

export class GoLanguageParser extends OptimizedTreeSitterBaseParser {

  constructor(db: Database, options: ParseOptions) {
    super(db, options);
  }

  async initialize(): Promise<void> {
    try {
      // Use tree-sitter-go v0.23+
      const goLanguage = require("tree-sitter-go");
      if (goLanguage && this.parser) {
        this.parser.setLanguage(goLanguage);
        this.debug("✅ Successfully loaded tree-sitter-go!");
        return;
      }
    } catch (error) {
      this.debug(`Failed to load tree-sitter-go: ${error}`);
    }
    
    // Fall back to pattern-based parsing if tree-sitter fails
    this.debug("Using pattern-based parsing for Go");
  }

  protected createVisitorHandlers(): VisitorHandlers {
    return {
      onClass: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Go doesn't have classes, but we handle structs here
        if (node.type === 'type_declaration') {
          const typeSpecNode = node.childForFieldName('type_spec');
          if (typeSpecNode) {
            const nameNode = typeSpecNode.childForFieldName('name');
            const typeNode = typeSpecNode.childForFieldName('type');
            
            if (nameNode && typeNode && typeNode.type === 'struct_type') {
              const structName = this.getNodeText(nameNode, context.content);
              
              return {
                name: structName,
                qualifiedName: this.getQualifiedName(node, context.content),
                kind: UniversalSymbolKind.Struct,
                filePath: context.filePath,
                line: node.startPosition.row + 1,
                column: node.startPosition.column,
                endLine: node.endPosition.row + 1,
                endColumn: node.endPosition.column,
                isDefinition: true,
                confidence: 1.0,
                semanticTags: [],
                complexity: 1,
                isExported: this.isExported(structName),
                isAsync: false,
                languageFeatures: {
                  isStruct: true,
                  fields: this.extractStructFields(typeNode, context.content)
                }
              };
            }
          }
        }
        return null;
      },

      onInterface: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Go interfaces
        if (node.type === 'type_declaration') {
          const typeSpecNode = node.childForFieldName('type_spec');
          if (typeSpecNode) {
            const nameNode = typeSpecNode.childForFieldName('name');
            const typeNode = typeSpecNode.childForFieldName('type');
            
            if (nameNode && typeNode && typeNode.type === 'interface_type') {
              const interfaceName = this.getNodeText(nameNode, context.content);
              
              return {
                name: interfaceName,
                qualifiedName: this.getQualifiedName(node, context.content),
                kind: UniversalSymbolKind.Interface,
                filePath: context.filePath,
                line: node.startPosition.row + 1,
                column: node.startPosition.column,
                endLine: node.endPosition.row + 1,
                endColumn: node.endPosition.column,
                isDefinition: true,
                confidence: 1.0,
                semanticTags: [],
                complexity: 1,
                isExported: this.isExported(interfaceName),
                isAsync: false,
                languageFeatures: {
                  isInterface: true,
                  methods: this.extractInterfaceMethods(typeNode, context.content)
                }
              };
            }
          }
        }
        return null;
      },

      onFunction: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const functionName = this.getNodeText(nameNode, context.content);
          const isMain = functionName === 'main';
          const isInit = functionName === 'init';
          
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
            confidence: 1.0,
            semanticTags: isMain ? ['entry-point'] : isInit ? ['init'] : [],
            complexity: this.calculateComplexity(this.getNodeText(node, context.content)),
            isExported: this.isExported(functionName),
            isAsync: false, // Go doesn't have async/await, uses goroutines
            languageFeatures: {
              isMain,
              isInit,
              parameters: this.extractParameters(node, context.content),
              returnTypes: this.extractReturnTypes(node, context.content),
              hasGoroutines: this.hasGoroutines(node, context.content)
            }
          };
        }
        return null;
      },

      onMethod: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Go method with receiver
        const nameNode = node.childForFieldName('name');
        const receiverNode = node.childForFieldName('receiver');
        
        if (nameNode) {
          const methodName = this.getNodeText(nameNode, context.content);
          let receiverType = '';
          
          if (receiverNode) {
            receiverType = this.extractReceiverType(receiverNode, context.content);
          }
          
          return {
            name: methodName,
            qualifiedName: receiverType ? `${receiverType}.${methodName}` : methodName,
            kind: UniversalSymbolKind.Method,
            filePath: context.filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            endLine: node.endPosition.row + 1,
            endColumn: node.endPosition.column,
            isDefinition: true,
            confidence: 1.0,
            semanticTags: [],
            complexity: this.calculateComplexity(this.getNodeText(node, context.content)),
            isExported: this.isExported(methodName),
            isAsync: false,
            languageFeatures: {
              receiverType,
              isPointerReceiver: this.isPointerReceiver(receiverNode, context.content),
              parameters: this.extractParameters(node, context.content),
              returnTypes: this.extractReturnTypes(node, context.content),
              hasGoroutines: this.hasGoroutines(node, context.content)
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
          
          // Check for goroutine launch
          if (functionName.startsWith('go ')) {
            const actualFunction = functionName.replace('go ', '');
            return {
              fromName: callerName,
              toName: actualFunction,
              relationshipType: UniversalRelationshipType.Invokes,
              confidence: 0.9,
              crossLanguage: false,
              lineNumber: node.startPosition.row + 1,
              columnNumber: node.startPosition.column,
              metadata: {
                isGoroutine: true
              }
            };
          }

          // Check for cross-language patterns (gRPC, HTTP calls, etc.)
          const line = this.getNodeText(node, context.content);
          const crossLangCalls = CrossLanguageDetector.detectCrossLanguageCalls(
            line,
            node.startPosition.row + 1,
            'go',
            context.filePath
          );
          
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
            confidence: 0.8,
            crossLanguage: false,
            lineNumber: node.startPosition.row + 1,
            columnNumber: node.startPosition.column
          };
        }
        return null;
      },

      onImport: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        // Go import statement
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          const importPath = this.getNodeText(pathNode, context.content).replace(/"/g, '');
          
          return {
            fromName: context.filePath,
            toName: importPath,
            relationshipType: UniversalRelationshipType.Imports,
            confidence: 1.0,
            crossLanguage: false,
            metadata: {
              isStandardLibrary: this.isStandardLibrary(importPath),
              isLocalModule: importPath.startsWith('./') || importPath.startsWith('../')
            }
          };
        }
        return null;
      },

      onExport: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        // Go doesn't have explicit exports, uses capitalization
        // This is handled in the isExported method
        return null;
      },

      onVariable: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Go variable declarations
        if (node.type === 'var_declaration' || node.type === 'short_var_declaration' || node.type === 'const_declaration') {
          const specNodes = node.children.filter(child => 
            child.type === 'var_spec' || child.type === 'const_spec'
          );
          
          for (const specNode of specNodes) {
            const nameNode = specNode.childForFieldName('name');
            if (nameNode) {
              const varName = this.getNodeText(nameNode, context.content);
              
              return {
                name: varName,
                qualifiedName: this.getQualifiedName(node, context.content),
                kind: node.type === 'const_declaration' ? UniversalSymbolKind.Constant : UniversalSymbolKind.Variable,
                filePath: context.filePath,
                line: node.startPosition.row + 1,
                column: node.startPosition.column,
                endLine: node.endPosition.row + 1,
                endColumn: node.endPosition.column,
                isDefinition: true,
                confidence: 0.9,
                semanticTags: [],
                complexity: 1,
                isExported: this.isExported(varName),
                isAsync: false,
                languageFeatures: {
                  varType: this.extractVarType(specNode, context.content),
                  isConstant: node.type === 'const_declaration'
                }
              };
            }
          }
        }
        return null;
      },

      onInheritance: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo[] | null => {
        // Go doesn't have inheritance but has embedding and interface implementation
        // This would be detected through struct field analysis and method matching
        return null;
      }
    };
  }

  protected getNodeTypeMap(): Map<string, keyof VisitorHandlers> {
    return new Map<string, keyof VisitorHandlers>([
      ['type_declaration', 'onClass'], // Handles both structs and interfaces
      ['function_declaration', 'onFunction'],
      ['method_declaration', 'onMethod'],
      ['call_expression', 'onCall'],
      ['import_declaration', 'onImport'],
      ['var_declaration', 'onVariable'],
      ['short_var_declaration', 'onVariable'],
      ['const_declaration', 'onVariable'],
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
    
    let currentPackage: string | undefined;
    let insideStruct = false;
    let currentStruct: string | undefined;
    let braceDepth = 0;
    let structBraceDepth = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('//') || trimmedLine === '') continue;
      
      // Count braces
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      
      // Package declaration
      const packageMatch = line.match(/^package\s+(\w+)/);
      if (packageMatch) {
        currentPackage = packageMatch[1];
        symbols.push({
          name: currentPackage,
          qualifiedName: currentPackage,
          kind: UniversalSymbolKind.Package,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 1.0,
          semanticTags: [],
          complexity: 1,
          isExported: false,
          isAsync: false,
          languageFeatures: {}
        });
      }
      
      // Struct declaration
      const structMatch = line.match(/type\s+(\w+)\s+struct\s*{?/);
      if (structMatch) {
        const structName = structMatch[1];
        symbols.push({
          name: structName,
          qualifiedName: structName,
          kind: UniversalSymbolKind.Struct,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.9,
          semanticTags: [],
          complexity: 1,
          isExported: this.isExported(structName),
          isAsync: false,
          languageFeatures: { isStruct: true }
        });
        
        currentStruct = structName;
        if (line.includes('{')) {
          structBraceDepth = braceDepth + 1;
          insideStruct = true;
        }
      }
      
      // Interface declaration
      const interfaceMatch = line.match(/type\s+(\w+)\s+interface\s*{?/);
      if (interfaceMatch) {
        const interfaceName = interfaceMatch[1];
        symbols.push({
          name: interfaceName,
          qualifiedName: interfaceName,
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
          isExported: this.isExported(interfaceName),
          isAsync: false,
          languageFeatures: { isInterface: true }
        });
      }
      
      // Function declaration
      const funcMatch = line.match(/func\s+(\w+)\s*\([^)]*\)(?:\s*\([^)]*\))?\s*{?/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const isMain = funcName === 'main';
        const isInit = funcName === 'init';
        
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
          semanticTags: isMain ? ['entry-point'] : isInit ? ['init'] : [],
          complexity: 1,
          isExported: this.isExported(funcName),
          isAsync: false,
          languageFeatures: { isMain, isInit }
        });
      }
      
      // Method declaration (with receiver)
      const methodMatch = line.match(/func\s*\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)\s*\([^)]*\)(?:\s*\([^)]*\))?\s*{?/);
      if (methodMatch) {
        const receiverType = methodMatch[1];
        const methodName = methodMatch[2];
        
        symbols.push({
          name: methodName,
          qualifiedName: `${receiverType}.${methodName}`,
          kind: UniversalSymbolKind.Method,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: [],
          complexity: 1,
          isExported: this.isExported(methodName),
          isAsync: false,
          languageFeatures: { receiverType }
        });
      }
      
      // Import statements
      const importMatch = line.match(/import\s+"([^"]+)"/);
      if (importMatch) {
        relationships.push({
          fromName: filePath,
          toName: importMatch[1],
          relationshipType: UniversalRelationshipType.Imports,
          confidence: 1.0,
          crossLanguage: false
        });
      }
      
      // Variable declarations
      const varMatch = line.match(/var\s+(\w+)(?:\s+(\w+))?(?:\s*=.*)?/);
      if (varMatch) {
        const varName = varMatch[1];
        symbols.push({
          name: varName,
          qualifiedName: varName,
          kind: UniversalSymbolKind.Variable,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.7,
          semanticTags: [],
          complexity: 1,
          isExported: this.isExported(varName),
          isAsync: false,
          languageFeatures: { varType: varMatch[2] }
        });
      }
      
      // Constant declarations
      const constMatch = line.match(/const\s+(\w+)(?:\s+(\w+))?\s*=.*/);
      if (constMatch) {
        const constName = constMatch[1];
        symbols.push({
          name: constName,
          qualifiedName: constName,
          kind: UniversalSymbolKind.Constant,
          filePath,
          line: lineNum,
          column: 0,
          endLine: lineNum,
          endColumn: line.length,
          isDefinition: true,
          confidence: 0.8,
          semanticTags: [],
          complexity: 1,
          isExported: this.isExported(constName),
          isAsync: false,
          languageFeatures: { varType: constMatch[2], isConstant: true }
        });
      }
      
      // Struct fields (when inside a struct)
      if (insideStruct && currentStruct && braceDepth >= structBraceDepth) {
        const fieldMatch = line.match(/^\s*(\w+)\s+([^`\n]+)(?:`[^`]*`)?/);
        if (fieldMatch && !fieldMatch[1].match(/^(if|for|switch|func|type|var|const|return)$/)) {
          const fieldName = fieldMatch[1];
          const fieldType = fieldMatch[2].trim();
          
          symbols.push({
            name: fieldName,
            qualifiedName: `${currentStruct}.${fieldName}`,
            kind: UniversalSymbolKind.Field,
            filePath,
            line: lineNum,
            column: 0,
            endLine: lineNum,
            endColumn: line.length,
            isDefinition: true,
            confidence: 0.7,
            semanticTags: [],
            complexity: 1,
            isExported: this.isExported(fieldName),
            isAsync: false,
            languageFeatures: { 
              fieldType,
              parentStruct: currentStruct
            }
          });
        }
      }
      
      // Enhanced cross-language detection
      const crossLangCalls = CrossLanguageDetector.detectCrossLanguageCalls(
        line,
        lineNum,
        'go',
        filePath
      );
      
      if (crossLangCalls.length > 0) {
        for (const crossLang of crossLangCalls) {
          relationships.push({
            fromName: 'unknown', // Would need better context tracking
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
      
      // Check for closing braces
      if (closeBraces > 0 && insideStruct && braceDepth <= structBraceDepth) {
        insideStruct = false;
        currentStruct = undefined;
        structBraceDepth = -1;
      }
      
      // Update brace depth
      braceDepth += openBraces - closeBraces;
    }
    
    this.debug(`Go pattern-based extraction found ${symbols.length} symbols, ${relationships.length} relationships`);
    
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

  // Go-specific helper methods
  private getNodeText(node: Parser.SyntaxNode, content: string): string {
    return content.substring(node.startIndex, node.endIndex);
  }

  private getQualifiedName(node: Parser.SyntaxNode, content: string): string {
    // For Go, we generally use simple names unless inside a receiver method
    const nameField = node.childForFieldName('name');
    if (nameField) {
      return this.getNodeText(nameField, content);
    }
    return 'unknown';
  }

  private isExported(name: string): boolean {
    // In Go, exported identifiers start with a capital letter
    return name.length > 0 && name[0] === name[0].toUpperCase();
  }

  private isStandardLibrary(importPath: string): boolean {
    // Go standard library packages
    const stdPkgs = [
      'fmt', 'context', 'net/http', 'os', 'io', 'strings', 'strconv', 'time',
      'log', 'encoding/json', 'database/sql', 'sync', 'regexp', 'path/filepath'
    ];
    return stdPkgs.includes(importPath) || !importPath.includes('.');
  }

  private extractStructFields(structNode: Parser.SyntaxNode, content: string): any[] {
    const fields: any[] = [];
    for (const child of structNode.children) {
      if (child.type === 'field_declaration') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        if (nameNode && typeNode) {
          fields.push({
            name: this.getNodeText(nameNode, content),
            type: this.getNodeText(typeNode, content),
            exported: this.isExported(this.getNodeText(nameNode, content))
          });
        }
      }
    }
    return fields;
  }

  private extractInterfaceMethods(interfaceNode: Parser.SyntaxNode, content: string): any[] {
    const methods: any[] = [];
    for (const child of interfaceNode.children) {
      if (child.type === 'method_spec') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          methods.push({
            name: this.getNodeText(nameNode, content),
            signature: this.getNodeText(child, content)
          });
        }
      }
    }
    return methods;
  }

  private extractParameters(node: Parser.SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      for (const param of paramsNode.children) {
        if (param.type === 'parameter_declaration') {
          const nameNode = param.childForFieldName('name');
          const typeNode = param.childForFieldName('type');
          if (nameNode && typeNode) {
            params.push({
              name: this.getNodeText(nameNode, content),
              type: this.getNodeText(typeNode, content)
            });
          }
        }
      }
    }
    return params;
  }

  private extractReturnTypes(node: Parser.SyntaxNode, content: string): string[] {
    const returnTypes: string[] = [];
    const resultNode = node.childForFieldName('result');
    if (resultNode) {
      if (resultNode.type === 'parameter_list') {
        for (const param of resultNode.children) {
          if (param.type === 'parameter_declaration') {
            const typeNode = param.childForFieldName('type');
            if (typeNode) {
              returnTypes.push(this.getNodeText(typeNode, content));
            }
          }
        }
      } else {
        // Single return type
        returnTypes.push(this.getNodeText(resultNode, content));
      }
    }
    return returnTypes;
  }

  private extractReceiverType(receiverNode: Parser.SyntaxNode, content: string): string {
    const paramDecl = receiverNode.children.find(child => child.type === 'parameter_declaration');
    if (paramDecl) {
      const typeNode = paramDecl.childForFieldName('type');
      if (typeNode) {
        return this.getNodeText(typeNode, content).replace('*', ''); // Remove pointer indicator
      }
    }
    return '';
  }

  private isPointerReceiver(receiverNode: Parser.SyntaxNode | null, content: string): boolean {
    if (!receiverNode) return false;
    const receiverText = this.getNodeText(receiverNode, content);
    return receiverText.includes('*');
  }

  private extractVarType(specNode: Parser.SyntaxNode, content: string): string | undefined {
    const typeNode = specNode.childForFieldName('type');
    if (typeNode) {
      return this.getNodeText(typeNode, content);
    }
    return undefined;
  }

  private hasGoroutines(node: Parser.SyntaxNode, content: string): boolean {
    const functionBody = this.getNodeText(node, content);
    return functionBody.includes('go ') && functionBody.includes('(');
  }

  private calculateComplexity(functionText: string): number {
    let complexity = 1; // Base complexity
    
    // Add complexity for Go control structures
    const controlPatterns = [
      /\bif\b/g, /\belse\b/g, /\bfor\b/g, /\bswitch\b/g, /\bcase\b/g,
      /\bselect\b/g, /\bdefer\b/g, /\bgo\b/g // Go-specific
    ];
    
    for (const pattern of controlPatterns) {
      const matches = functionText.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    return Math.min(complexity, 10); // Cap at 10
  }
}