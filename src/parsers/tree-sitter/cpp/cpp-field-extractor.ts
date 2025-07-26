/**
 * Optimized C++ Field Extractor
 * 
 * Efficient extraction of struct/class fields with O(n) complexity
 * Uses hashmap-based lookups and single-pass traversal
 */

import Parser from "tree-sitter";
import { Logger, createLogger } from "../../../utils/logger.js";
import { SymbolInfo } from "../parser-types.js";
import { CppAstUtils } from "./cpp-ast-utils.js";
import { CppVisitorContext, CppSymbolKind, CppAccessLevel } from "./cpp-types.js";

interface FieldExtractionResult {
  fields: SymbolInfo[];
  stats: {
    fieldsExtracted: number;
    accessSections: number;
    traversalTime: number;
  };
}

export class CppFieldExtractor {
  private logger: Logger;
  private astUtils: CppAstUtils;
  
  // Cache for parent scope resolution - O(1) lookups
  private scopeCache: Map<Parser.SyntaxNode, string> = new Map();
  
  constructor() {
    this.logger = createLogger('CppFieldExtractor');
    this.astUtils = new CppAstUtils();
  }

  /**
   * Extract all fields from a class/struct body with O(n) complexity
   */
  extractFields(
    classNode: Parser.SyntaxNode,
    className: string,
    qualifiedClassName: string,
    context: CppVisitorContext,
    isClass: boolean = true
  ): FieldExtractionResult {
    const startTime = performance.now();
    const fields: SymbolInfo[] = [];
    const stats = {
      fieldsExtracted: 0,
      accessSections: 0,
      traversalTime: 0
    };

    try {
      // Default access level: private for class, public for struct
      let currentAccessLevel = isClass ? CppAccessLevel.PRIVATE : CppAccessLevel.PUBLIC;
      
      // Find the body node efficiently - O(n) where n is number of direct children
      let bodyNode: Parser.SyntaxNode | null = null;
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child && child.type === "field_declaration_list") {
          bodyNode = child;
          break;
        }
      }

      if (!bodyNode) {
        this.logger.warn('No field declaration list found', { className });
        stats.traversalTime = performance.now() - startTime;
        return { fields, stats };
      }

      // Cache the parent scope for efficient lookups
      this.scopeCache.set(classNode, qualifiedClassName);

      // Single pass through all children - O(n) complexity
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (!child) continue;

        switch (child.type) {
          case "access_specifier":
            // Update current access level
            currentAccessLevel = this.extractAccessLevel(child, context);
            stats.accessSections++;
            break;

          case "field_declaration":
            // Extract field with current access level
            const field = this.extractField(
              child, 
              qualifiedClassName, 
              currentAccessLevel, 
              context
            );
            if (field) {
              fields.push(field);
              stats.fieldsExtracted++;
            }
            break;

          case "function_definition":
          case "declaration":
            // Skip methods and other declarations
            break;

          default:
            // Handle nested types, templates, etc.
            if (this.isFieldLikeDeclaration(child)) {
              const field = this.extractField(
                child,
                qualifiedClassName,
                currentAccessLevel,
                context
              );
              if (field) {
                fields.push(field);
                stats.fieldsExtracted++;
              }
            }
        }
      }

      this.logger.debug('Field extraction completed', {
        className: qualifiedClassName,
        fieldsFound: stats.fieldsExtracted,
        accessSections: stats.accessSections
      });

    } catch (error) {
      this.logger.error('Field extraction failed', error, { className });
    } finally {
      // Clean up cache entry
      this.scopeCache.delete(classNode);
      stats.traversalTime = performance.now() - startTime;
    }

    return { fields, stats };
  }

  /**
   * Extract a single field declaration - O(1) for simple fields
   */
  private extractField(
    node: Parser.SyntaxNode,
    parentScope: string,
    accessLevel: CppAccessLevel,
    context: CppVisitorContext
  ): SymbolInfo | null {
    try {
      // Extract type and declarator efficiently
      const typeNode = node.childForFieldName("type");
      const declaratorNode = node.childForFieldName("declarator");
      
      if (!declaratorNode) {
        // Handle multiple declarators (int x, y, z;)
        const declarators = this.extractMultipleDeclarators(node, context);
        if (declarators.length === 0) return null;
        
        // For now, just handle the first one (TODO: return array)
        const firstDeclarator = declarators[0];
        return this.createFieldSymbol(
          firstDeclarator.name,
          firstDeclarator.type,
          parentScope,
          accessLevel,
          node,
          context
        );
      }

      const fieldName = this.extractFieldName(declaratorNode, context);
      if (!fieldName) return null;

      const fieldType = typeNode ? 
        this.astUtils.getNodeText(typeNode, context.content) : "unknown";

      return this.createFieldSymbol(
        fieldName,
        fieldType,
        parentScope,
        accessLevel,
        node,
        context
      );

    } catch (error) {
      this.logger.error('Failed to extract field', error);
      return null;
    }
  }

  /**
   * Create field symbol with all metadata - O(1)
   */
  private createFieldSymbol(
    name: string,
    type: string,
    parentScope: string,
    accessLevel: CppAccessLevel,
    node: Parser.SyntaxNode,
    context: CppVisitorContext
  ): SymbolInfo {
    const qualifiedName = `${parentScope}::${name}`;
    
    // Extract modifiers from node text - single pass
    const nodeText = this.astUtils.getNodeText(node, context.content);
    const isStatic = nodeText.includes("static");
    const isConst = nodeText.includes("const");
    const isMutable = nodeText.includes("mutable");
    const isVolatile = nodeText.includes("volatile");

    return {
      name,
      qualifiedName,
      kind: CppSymbolKind.FIELD,
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      returnType: type,
      visibility: accessLevel,
      semanticTags: [
        "field",
        "member",
        ...(isStatic ? ["static"] : []),
        ...(isConst ? ["const"] : []),
        ...(isMutable ? ["mutable"] : []),
        ...(isVolatile ? ["volatile"] : [])
      ],
      complexity: 0,
      confidence: 0.95,
      isDefinition: true,
      isExported: context.insideExportBlock,
      isAsync: false,
      namespace: context.resolutionContext.currentNamespace,
      parentScope,
      languageFeatures: {
        isConst,
        isMutable,
        isVolatile,
        storageClass: isStatic ? "static" : undefined,
      }
    };
  }

  /**
   * Extract field name from declarator - O(1) for simple cases
   */
  private extractFieldName(declarator: Parser.SyntaxNode, context: CppVisitorContext): string {
    switch (declarator.type) {
      case "identifier":
      case "field_identifier":
        return this.astUtils.getNodeText(declarator, context.content);
        
      case "pointer_declarator":
      case "reference_declarator":
        // Recursive but bounded by language syntax depth
        const innerDeclarator = declarator.child(1);
        return innerDeclarator ? this.extractFieldName(innerDeclarator, context) : "";
        
      case "array_declarator":
        const arrayDeclarator = declarator.child(0);
        return arrayDeclarator ? this.extractFieldName(arrayDeclarator, context) : "";
        
      default:
        this.logger.debug('Unknown declarator type', { type: declarator.type });
        return "";
    }
  }

  /**
   * Extract multiple declarators from a single declaration - O(n) where n is declarator count
   */
  private extractMultipleDeclarators(
    node: Parser.SyntaxNode,
    context: CppVisitorContext
  ): Array<{ name: string; type: string }> {
    const declarators: Array<{ name: string; type: string }> = [];
    const typeNode = node.childForFieldName("type");
    const baseType = typeNode ? this.astUtils.getNodeText(typeNode, context.content) : "unknown";

    // Look for comma-separated declarators
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === "identifier" || child.type === "field_identifier")) {
        declarators.push({
          name: this.astUtils.getNodeText(child, context.content),
          type: baseType
        });
      }
    }

    return declarators;
  }

  /**
   * Extract access level from access specifier - O(1)
   */
  private extractAccessLevel(node: Parser.SyntaxNode, context: CppVisitorContext): CppAccessLevel {
    const text = this.astUtils.getNodeText(node, context.content).trim();
    
    if (text.startsWith("public")) return CppAccessLevel.PUBLIC;
    if (text.startsWith("private")) return CppAccessLevel.PRIVATE;
    if (text.startsWith("protected")) return CppAccessLevel.PROTECTED;
    
    return CppAccessLevel.PRIVATE; // Default
  }

  /**
   * Check if a node could be a field declaration - O(1)
   */
  private isFieldLikeDeclaration(node: Parser.SyntaxNode): boolean {
    const fieldLikeTypes = new Set([
      "field_declaration",
      "declaration",
      "member_declaration",
      "static_assert_declaration" // Can contain static members
    ]);
    
    return fieldLikeTypes.has(node.type);
  }

  /**
   * Clear all caches - for memory management
   */
  clearCaches(): void {
    this.scopeCache.clear();
  }
}