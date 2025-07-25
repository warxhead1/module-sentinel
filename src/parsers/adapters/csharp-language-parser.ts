import { OptimizedTreeSitterBaseParser } from '../tree-sitter/optimized-base-parser.js';
import { ParseOptions, SymbolInfo, RelationshipInfo, PatternInfo } from '../tree-sitter/parser-types.js';
import { UniversalSymbolKind, UniversalRelationshipType } from '../language-parser-interface.js';
import { Database } from 'better-sqlite3';
import { CrossLanguageDetector } from '../utils/cross-language-detector.js';

import Parser from 'tree-sitter';
import { VisitorHandlers, VisitorContext } from '../unified-ast-visitor.js';

export class CSharpLanguageParser extends OptimizedTreeSitterBaseParser {

  constructor(db: Database, options: ParseOptions) {
    super(db, options);
  }

  async initialize(): Promise<void> {
    try {
      // Use tree-sitter-c-sharp v0.23+ with legacy compatibility
      const csharpLanguage = require("tree-sitter-c-sharp");
      if (csharpLanguage && this.parser) {
        this.parser.setLanguage(csharpLanguage);
        this.debug("✅ Successfully loaded tree-sitter-c-sharp!");
        return;
      }
    } catch (error) {
      this.debug(`Failed to load tree-sitter-c-sharp: ${error}`);
    }
    
    // Fall back to pattern-based parsing if tree-sitter fails
    this.debug("Using pattern-based parsing for C#");
  }

  protected createVisitorHandlers(): VisitorHandlers {
    return {
      onClass: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        if (node.type === 'class_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const className = this.getNodeText(nameNode, context.content);
            
            return {
              name: className,
              qualifiedName: this.getQualifiedName(node, context.content),
              kind: UniversalSymbolKind.Class,
              filePath: context.filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
              isDefinition: true,
              confidence: 1.0,
              semanticTags: [],
              complexity: 1,
              isExported: this.isPublic(node),
              isAsync: false,
              languageFeatures: {
                modifiers: this.extractModifiers(node),
                implements: this.extractImplements(node, context.content),
                extendsList: this.extractExtends(node, context.content)
              }
            };
          }
        }
        
        // Handle interfaces
        if (node.type === 'interface_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const interfaceName = this.getNodeText(nameNode, context.content);
            
            return {
              name: interfaceName,
              qualifiedName: this.getQualifiedName(node, context.content),
              kind: UniversalSymbolKind.Interface,
              filePath: context.filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
              isDefinition: true,
              confidence: 1.0,
              semanticTags: [],
              complexity: 1,
              isExported: this.isPublic(node),
              isAsync: false,
              languageFeatures: {
                modifiers: this.extractModifiers(node)
              }
            };
          }
        }
        
        // Handle structs
        if (node.type === 'struct_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const structName = this.getNodeText(nameNode, context.content);
            
            return {
              name: structName,
              qualifiedName: this.getQualifiedName(node, context.content),
              kind: UniversalSymbolKind.Struct,
              filePath: context.filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
              isDefinition: true,
              confidence: 1.0,
              semanticTags: [],
              complexity: 1,
              isExported: this.isPublic(node),
              isAsync: false,
              languageFeatures: {
                modifiers: this.extractModifiers(node),
                implements: this.extractImplements(node, context.content)
              }
            };
          }
        }
        
        return null;
      },

      onMethod: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        if (node.type === 'method_declaration' || node.type === 'constructor_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const methodName = this.getNodeText(nameNode, context.content);
            
            return {
              name: methodName,
              qualifiedName: this.getQualifiedName(node, context.content),
              kind: node.type === 'constructor_declaration' ? UniversalSymbolKind.Constructor : UniversalSymbolKind.Method,
              filePath: context.filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
              isDefinition: true,
              confidence: 1.0,
              semanticTags: [],
              complexity: this.calculateComplexity(this.getNodeText(node, context.content)),
              isExported: this.isPublic(node),
              isAsync: this.hasModifier(node, 'async'),
              returnType: this.extractReturnType(node, context.content),
              signature: this.extractMethodSignature(node, context.content),
              languageFeatures: {
                modifiers: this.extractModifiers(node),
                parameters: this.extractParameters(node, context.content)
              }
            };
          }
        }
        
        return null;
      },

      onVariable: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        // Handle field declarations
        if (node.type === 'field_declaration') {
          const declarationNode = node.childForFieldName('declaration');
          if (declarationNode && declarationNode.type === 'variable_declaration') {
            const declaratorNode = declarationNode.child(declarationNode.childCount - 1);
            if (declaratorNode && declaratorNode.type === 'variable_declarator') {
              const nameNode = declaratorNode.childForFieldName('name');
              if (nameNode) {
                const fieldName = this.getNodeText(nameNode, context.content);
                
                return {
                  name: fieldName,
                  qualifiedName: this.getQualifiedName(node, context.content),
                  kind: UniversalSymbolKind.Field,
                  filePath: context.filePath,
                  line: node.startPosition.row + 1,
                  column: node.startPosition.column + 1,
                  endLine: node.endPosition.row + 1,
                  endColumn: node.endPosition.column + 1,
                  isDefinition: true,
                  confidence: 1.0,
                  semanticTags: [],
                  complexity: 1,
                  isExported: this.isPublic(node),
                  isAsync: false,
                  returnType: this.extractFieldType(node, context.content),
                  languageFeatures: {
                    modifiers: this.extractModifiers(node)
                  }
                };
              }
            }
          }
        }
        
        // Handle property declarations
        if (node.type === 'property_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const propertyName = this.getNodeText(nameNode, context.content);
            
            return {
              name: propertyName,
              qualifiedName: this.getQualifiedName(node, context.content),
              kind: UniversalSymbolKind.Property,
              filePath: context.filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
              isDefinition: true,
              confidence: 1.0,
              semanticTags: [],
              complexity: 1,
              isExported: this.isPublic(node),
              isAsync: false,
              returnType: this.extractPropertyType(node, context.content),
              languageFeatures: {
                modifiers: this.extractModifiers(node)
              }
            };
          }
        }
        
        return null;
      },

      onImport: (node: Parser.SyntaxNode, context: VisitorContext): RelationshipInfo | null => {
        if (node.type === 'using_directive') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const usingPath = this.getNodeText(nameNode, context.content);
            return {
              fromName: context.filePath,
              toName: usingPath,
              relationshipType: UniversalRelationshipType.Imports,
              confidence: 1.0,
              crossLanguage: false,
              lineNumber: node.startPosition.row + 1,
              columnNumber: node.startPosition.column + 1
            };
          }
        }
        
        return null;
      },

      onNamespace: (node: Parser.SyntaxNode, context: VisitorContext): SymbolInfo | null => {
        if (node.type === 'namespace_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const namespaceName = this.getNodeText(nameNode, context.content);
            
            return {
              name: namespaceName,
              qualifiedName: namespaceName,
              kind: UniversalSymbolKind.Namespace,
              filePath: context.filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column + 1,
              endLine: node.endPosition.row + 1,
              endColumn: node.endPosition.column + 1,
              isDefinition: true,
              confidence: 1.0,
              semanticTags: [],
              complexity: 1,
              isExported: true,
              isAsync: false,
              languageFeatures: {
                isNamespace: true
              }
            };
          }
        }
        
        return null;
      }
    };
  }

  protected getNodeTypeMap(): Map<string, keyof VisitorHandlers> {
    return new Map<string, keyof VisitorHandlers>([
      ['class_declaration', 'onClass'],
      ['interface_declaration', 'onClass'],
      ['struct_declaration', 'onClass'],
      ['method_declaration', 'onMethod'],
      ['constructor_declaration', 'onMethod'],
      ['field_declaration', 'onVariable'],
      ['property_declaration', 'onVariable'],
      ['using_directive', 'onImport'],
      ['namespace_declaration', 'onNamespace'],
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
    
    // Extract classes
    const classRegex = /(?:public\s+)?class\s+(\w+)/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const lineIndex = content.substring(0, match.index).split('\n').length;
      symbols.push({
        name: match[1],
        qualifiedName: match[1],
        kind: UniversalSymbolKind.Class,
        filePath,
        line: lineIndex,
        column: match.index,
        isDefinition: true,
        confidence: 0.8,
        semanticTags: [],
        complexity: 1,
        isExported: match[0].includes('public'),
        isAsync: false
      });
    }
    
    // Extract gRPC patterns
    const grpcServiceRegex = /public\s+class\s+(\w+)\s*:\s*(\w+\.)?(\w+Base)/g;
    while ((match = grpcServiceRegex.exec(content)) !== null) {
      if (match[3] && match[3].includes('Base')) {
        patterns.push({
          patternType: 'grpc_service',
          patternName: `gRPC service implementation: ${match[1]}`,
          confidence: 0.9,
          details: { serviceName: match[1], baseClass: match[3] }
        });
      }
    }
    
    // Extract ASP.NET Core controllers
    const controllerRegex = /public\s+class\s+(\w+Controller)\s*:\s*(\w+)/g;
    while ((match = controllerRegex.exec(content)) !== null) {
      patterns.push({
        patternType: 'aspnet_controller',
        patternName: `ASP.NET Core controller: ${match[1]}`,
        confidence: 0.8,
        details: { controllerName: match[1], baseClass: match[2] }
      });
    }
    
    return {
      symbols,
      relationships,
      patterns,
      controlFlowData: { blocks: [], calls: [] },
      stats: { symbolCount: symbols.length, relationshipCount: relationships.length }
    };
  }

  // C#-specific helper methods
  private isPublic(node: Parser.SyntaxNode): boolean {
    const modifiers = node.child(0);
    if (modifiers && modifiers.type === 'modifiers') {
      for (let i = 0; i < modifiers.childCount; i++) {
        const modifier = modifiers.child(i);
        if (modifier && modifier.text === 'public') {
          return true;
        }
      }
    }
    return false;
  }

  private hasModifier(node: Parser.SyntaxNode, target: string): boolean {
    const modifiers = node.child(0);
    if (modifiers && modifiers.type === 'modifiers') {
      for (let i = 0; i < modifiers.childCount; i++) {
        const modifier = modifiers.child(i);
        if (modifier && modifier.text === target) {
          return true;
        }
      }
    }
    return false;
  }

  private extractModifiers(node: Parser.SyntaxNode): string[] {
    const modifiersList: string[] = [];
    const modifiers = node.child(0);
    if (modifiers && modifiers.type === 'modifiers') {
      for (let i = 0; i < modifiers.childCount; i++) {
        const modifier = modifiers.child(i);
        if (modifier) {
          modifiersList.push(modifier.text);
        }
      }
    }
    return modifiersList;
  }

  private extractMethodSignature(node: Parser.SyntaxNode, content: string): string {
    return this.getNodeText(node, content).split('{')[0].trim();
  }

  private extractReturnType(node: Parser.SyntaxNode, content: string): string | undefined {
    const typeNode = node.childForFieldName('type');
    return typeNode ? this.getNodeText(typeNode, content) : undefined;
  }

  private extractFieldType(node: Parser.SyntaxNode, content: string): string | undefined {
    const declarationNode = node.childForFieldName('declaration');
    if (declarationNode) {
      const typeNode = declarationNode.childForFieldName('type');
      return typeNode ? this.getNodeText(typeNode, content) : undefined;
    }
    return undefined;
  }

  private extractPropertyType(node: Parser.SyntaxNode, content: string): string | undefined {
    const typeNode = node.childForFieldName('type');
    return typeNode ? this.getNodeText(typeNode, content) : undefined;
  }

  private extractParameters(node: Parser.SyntaxNode, content: string): any[] {
    const parameters: any[] = [];
    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      for (let i = 0; i < paramsNode.childCount; i++) {
        const param = paramsNode.child(i);
        if (param && param.type === 'parameter') {
          const typeNode = param.childForFieldName('type');
          const nameNode = param.childForFieldName('name');
          if (typeNode && nameNode) {
            parameters.push({
              name: this.getNodeText(nameNode, content),
              type: this.getNodeText(typeNode, content)
            });
          }
        }
      }
    }
    return parameters;
  }

  private extractImplements(node: Parser.SyntaxNode, content: string): string[] {
    const implementsList: string[] = [];
    const baseListNode = node.childForFieldName('base_list');
    if (baseListNode) {
      for (let i = 0; i < baseListNode.childCount; i++) {
        const baseType = baseListNode.child(i);
        if (baseType && baseType.type === 'identifier') {
          implementsList.push(this.getNodeText(baseType, content));
        }
      }
    }
    return implementsList;
  }

  private extractExtends(node: Parser.SyntaxNode, content: string): string | undefined {
    const baseListNode = node.childForFieldName('base_list');
    if (baseListNode && baseListNode.childCount > 0) {
      const firstBase = baseListNode.child(0);
      return firstBase ? this.getNodeText(firstBase, content) : undefined;
    }
    return undefined;
  }
  
  private getNodeText(node: Parser.SyntaxNode, content: string): string {
    return content.substring(node.startIndex, node.endIndex);
  }
  
  private getQualifiedName(node: Parser.SyntaxNode, content: string): string {
    let current = node;
    const parts = [this.getNodeText(node, content)];
    while (current.parent) {
      current = current.parent;
      if (current.type === 'class_declaration' || current.type === 'interface_declaration' || current.type === 'method_declaration') {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          parts.unshift(this.getNodeText(nameNode, content));
        }
      }
    }
    return parts.join('.');
  }
  
  private calculateComplexity(methodText: string): number {
    let complexity = 1; // Base complexity
    
    // Add complexity for control structures
    const controlPatterns = [
      /\bif\b/g, /\belse\b/g, /\bwhile\b/g, /\bfor\b/g, /\bswitch\b/g,
      /\bcatch\b/g, /\btry\b/g, /\?\s*:/g // ternary operator
    ];
    
    for (const pattern of controlPatterns) {
      const matches = methodText.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    return Math.min(complexity, 10); // Cap at 10
  }
}