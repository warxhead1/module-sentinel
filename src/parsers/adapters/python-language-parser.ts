
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
      const loadedLanguage = await (Parser as any).Language.load(wasmPath);
      this.parser.setLanguage(loadedLanguage);
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
      ['from_import_statement', 'onImport'],
      ['class_definition', 'onInheritance'], // Re-use class_definition for inheritance
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
      if (current.type === 'class_definition' || current.type === 'function_definition') {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          parts.unshift(this.getNodeText(nameNode, content));
        }
      }
    }
    return parts.join('.');
  }
}
