
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
      const loadedLanguage = await (Parser as any).Language.load(wasmPath); // Access Language via Parser instance
      this.parser.setLanguage(loadedLanguage);
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
            isExported: false,
            isAsync: false,
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
            isExported: false,
            isAsync: false,
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
            isExported: false,
            isAsync: false,
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
      ['class_declaration', 'onInheritance'], // Re-use class_declaration for inheritance
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
    return {
      symbols: [],
      relationships: [],
      patterns: [],
      controlFlowData: { blocks: [], calls: [] },
      stats: {},
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
}
