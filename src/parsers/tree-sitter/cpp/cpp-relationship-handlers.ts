/**
 * C++ Relationship Handlers
 * 
 * Handles extraction of relationships between C++ symbols including function calls,
 * inheritance, includes, template instantiations, and other dependencies.
 */

import Parser from "tree-sitter";
import { Logger, createLogger } from "../../../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../../../utils/memory-monitor.js";
import { RelationshipInfo } from "../parser-types.js";
import { CppAstUtils } from "./cpp-ast-utils.js";
import { 
  CppVisitorContext, 
  CppRelationshipMetadata, 
  CppRelationshipKind 
} from "./cpp-types.js";

export class CppRelationshipHandlers {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private astUtils: CppAstUtils;

  constructor() {
    this.logger = createLogger('CppRelationshipHandlers');
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.astUtils = new CppAstUtils();
  }

  /**
   * Handle function and method calls
   */
  handleCall(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleCall');
    const relationships: RelationshipInfo[] = [];
    
    try {
      if (node.type !== "call_expression") {
        this.logger.warn('Expected call_expression node', { nodeType: node.type });
        return relationships;
      }

      const functionNode = node.childForFieldName("function");
      if (!functionNode) return relationships;

      const functionText = this.astUtils.getNodeText(functionNode, context.content);
      const currentScope = this.getCurrentFunctionScope(node, context);
      
      if (!currentScope) {
        this.logger.debug('Call found outside function scope', { call: functionText });
        return relationships;
      }

      // Handle different types of calls
      if (functionNode.type === "identifier") {
        // Direct function call: func()
        const relationship = this.createDirectCall(
          currentScope, 
          functionText, 
          node, 
          context,
          CppRelationshipKind.CALLS
        );
        if (relationship) relationships.push(relationship);
        
      } else if (functionNode.type === "field_expression") {
        // Method call: obj.method() or obj->method()
        const methodRelationships = this.handleMethodCall(functionNode, currentScope, node, context);
        relationships.push(...methodRelationships);
        
      } else if (functionNode.type === "qualified_identifier") {
        // Qualified call: namespace::func() or Class::func()
        const relationship = this.createQualifiedCall(
          currentScope, 
          functionText, 
          node, 
          context
        );
        if (relationship) relationships.push(relationship);
        
      } else if (functionNode.type === "template_function") {
        // Template function call: func<T>()
        const relationship = this.createTemplateCall(
          currentScope, 
          functionText, 
          node, 
          context
        );
        if (relationship) relationships.push(relationship);
      }

      this.logger.debug('Processed call relationships', { 
        call: functionText, 
        relationships: relationships.length 
      });

      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle call', error, { nodeType: node.type });
      return relationships;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle inheritance relationships
   */
  handleInheritance(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleInheritance');
    const relationships: RelationshipInfo[] = [];
    
    try {
      if (node.type !== "base_class_clause") {
        this.logger.warn('Expected base_class_clause node', { nodeType: node.type });
        return relationships;
      }

      // Find the derived class
      const classNode = node.parent;
      if (!classNode || (classNode.type !== "class_specifier" && classNode.type !== "struct_specifier")) {
        return relationships;
      }

      const classNameNode = classNode.childForFieldName("name");
      if (!classNameNode) return relationships;

      const derivedClass = this.astUtils.getNodeText(classNameNode, context.content);
      const derivedQualifiedName = this.astUtils.buildStructQualifiedName(derivedClass, classNode, context);

      // Extract inheritance information
      const inheritanceInfo = this.astUtils.extractInheritanceInfo(node, context.content);
      
      for (const inheritance of inheritanceInfo) {
        const metadata: CppRelationshipMetadata = {
          inheritanceType: inheritance.accessLevel,
          isVirtualInheritance: inheritance.isVirtual,
        };

        const relationship: RelationshipInfo = {
          fromName: derivedQualifiedName,
          toName: inheritance.className,
          relationshipType: CppRelationshipKind.INHERITS,
          confidence: 0.95,
          lineNumber: node.startPosition.row + 1,
          columnNumber: node.startPosition.column + 1,
          crossLanguage: false,
          sourceContext: `${derivedClass} : ${inheritance.accessLevel}${inheritance.isVirtual ? ' virtual' : ''} ${inheritance.className}`,
          usagePattern: "inheritance",
          metadata
        };

        relationships.push(relationship);

        this.logger.debug('Created inheritance relationship', {
          from: derivedQualifiedName,
          to: inheritance.className,
          access: inheritance.accessLevel,
          virtual: inheritance.isVirtual
        });
      }

      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle inheritance', error);
      return relationships;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle include directives
   */
  handleImport(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleImport');
    const relationships: RelationshipInfo[] = [];
    
    try {
      if (node.type !== "preproc_include") {
        this.logger.warn('Expected preproc_include node', { nodeType: node.type });
        return relationships;
      }

      const pathNode = node.childForFieldName("path");
      if (!pathNode) return relationships;

      const includePath = this.astUtils.getNodeText(pathNode, context.content);
      const isSystemInclude = includePath.startsWith('<') && includePath.endsWith('>');
      const cleanPath = includePath.replace(/^[<"]|[>"]$/g, '');

      const relationship: RelationshipInfo = {
        fromName: context.filePath,
        toName: cleanPath,
        relationshipType: CppRelationshipKind.INCLUDES,
        confidence: 1.0,
        lineNumber: node.startPosition.row + 1,
        columnNumber: node.startPosition.column + 1,
        crossLanguage: false,
        sourceContext: `#include ${includePath}`,
        usagePattern: isSystemInclude ? "system_include" : "user_include",
        metadata: {
          isSystemInclude
        }
      };

      relationships.push(relationship);

      this.logger.debug('Created include relationship', {
        from: context.filePath,
        to: cleanPath,
        system: isSystemInclude
      });

      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle import', error);
      return relationships;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle general declarations for type references
   */
  handleDeclaration(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleDeclaration');
    const relationships: RelationshipInfo[] = [];
    
    try {
      // Extract type references from variable declarations
      if (node.type === "variable_declaration" || node.type === "field_declaration") {
        const typeReferences = this.extractTypeReferences(node, context);
        relationships.push(...typeReferences);
      }

      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle declaration', error, { nodeType: node.type });
      return relationships;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle type references
   */
  handleTypeReference(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleTypeReference');
    const relationships: RelationshipInfo[] = [];
    
    try {
      if (node.type !== "type_identifier" && node.type !== "qualified_identifier") {
        return relationships;
      }

      const typeName = this.astUtils.getNodeText(node, context.content);
      const currentScope = this.getCurrentScope(node, context);
      
      if (!currentScope) return relationships;

      // Only create relationships for non-primitive types
      if (this.isPrimitiveType(typeName)) {
        return relationships;
      }

      const relationship: RelationshipInfo = {
        fromName: currentScope,
        toName: typeName,
        relationshipType: CppRelationshipKind.USES,
        confidence: 0.8,
        lineNumber: node.startPosition.row + 1,
        columnNumber: node.startPosition.column + 1,
        crossLanguage: false,
        sourceContext: typeName,
        usagePattern: "type_reference"
      };

      relationships.push(relationship);

      this.logger.debug('Created type reference relationship', {
        from: currentScope,
        to: typeName
      });

      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle type reference', error);
      return relationships;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle template instantiations
   */
  handleTemplateInstantiation(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleTemplateInstantiation');
    const relationships: RelationshipInfo[] = [];
    
    try {
      if (node.type !== "template_instantiation") {
        return relationships;
      }

      const templateName = node.childForFieldName("name");
      const argumentList = node.childForFieldName("arguments");
      
      if (!templateName) return relationships;

      const templateNameText = this.astUtils.getNodeText(templateName, context.content);
      const currentScope = this.getCurrentScope(node, context);
      
      if (!currentScope) return relationships;

      // Extract template arguments
      const templateArgs: string[] = [];
      if (argumentList) {
        for (let i = 0; i < argumentList.childCount; i++) {
          const arg = argumentList.child(i);
          if (arg && arg.type !== ',' && arg.type !== '<' && arg.type !== '>') {
            templateArgs.push(this.astUtils.getNodeText(arg, context.content));
          }
        }
      }

      const metadata: CppRelationshipMetadata = {
        templateInstantiation: templateArgs.reduce((acc, arg, idx) => {
          acc[`T${idx}`] = arg;
          return acc;
        }, {} as Record<string, string>)
      };

      const relationship: RelationshipInfo = {
        fromName: currentScope,
        toName: templateNameText,
        relationshipType: CppRelationshipKind.INSTANTIATES,
        confidence: 0.9,
        lineNumber: node.startPosition.row + 1,
        columnNumber: node.startPosition.column + 1,
        crossLanguage: false,
        sourceContext: this.astUtils.getNodeText(node, context.content),
        usagePattern: "template_instantiation",
        metadata
      };

      relationships.push(relationship);

      this.logger.debug('Created template instantiation relationship', {
        from: currentScope,
        to: templateNameText,
        args: templateArgs
      });

      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle template instantiation', error);
      return relationships;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle friend declarations
   */
  handleFriendDeclaration(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];
    
    try {
      // This would handle friend class/function declarations
      // Implementation depends on tree-sitter grammar support
      
      return relationships;

    } catch (error) {
      this.logger.error('Failed to handle friend declaration', error);
      return relationships;
    }
  }

  // Helper methods

  private handleMethodCall(
    functionNode: Parser.SyntaxNode, 
    currentScope: string, 
    callNode: Parser.SyntaxNode, 
    context: CppVisitorContext
  ): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];

    const objectNode = functionNode.childForFieldName("object");
    const fieldNode = functionNode.childForFieldName("field");
    
    if (!objectNode || !fieldNode) return relationships;

    const objectName = this.astUtils.getNodeText(objectNode, context.content);
    const methodName = this.astUtils.getNodeText(fieldNode, context.content);
    const operator = functionNode.text.includes('->') ? '->' : '.';

    // Create relationship to the method
    const methodCall: RelationshipInfo = {
      fromName: currentScope,
      toName: methodName,
      relationshipType: CppRelationshipKind.CALLS,
      confidence: 0.85,
      lineNumber: callNode.startPosition.row + 1,
      columnNumber: callNode.startPosition.column + 1,
      crossLanguage: false,
      sourceContext: `${objectName}${operator}${methodName}()`,
      usagePattern: operator === '->' ? "pointer_method_call" : "object_method_call",
      metadata: {
        isVirtualCall: operator === '->' // Might be virtual if called through pointer
      }
    };

    relationships.push(methodCall);

    // If object is not 'this', create object usage relationship
    if (objectName !== "this") {
      const objectUsage: RelationshipInfo = {
        fromName: currentScope,
        toName: objectName,
        relationshipType: CppRelationshipKind.USES,
        confidence: 0.8,
        lineNumber: callNode.startPosition.row + 1,
        columnNumber: callNode.startPosition.column + 1,
        crossLanguage: false,
        sourceContext: `${objectName}${operator}${methodName}()`,
        usagePattern: "object_access"
      };

      relationships.push(objectUsage);
    }

    return relationships;
  }

  private createDirectCall(
    fromScope: string, 
    functionName: string, 
    node: Parser.SyntaxNode, 
    context: CppVisitorContext,
    relationshipType: string
  ): RelationshipInfo | null {
    
    // Skip control flow keywords
    if (['if', 'while', 'for', 'switch', 'catch', 'sizeof', 'typeof', 'return'].includes(functionName)) {
      return null;
    }

    return {
      fromName: fromScope,
      toName: functionName,
      relationshipType,
      confidence: 0.8,
      lineNumber: node.startPosition.row + 1,
      columnNumber: node.startPosition.column + 1,
      crossLanguage: false,
      sourceContext: `${functionName}(...)`,
      usagePattern: "function_call"
    };
  }

  private createQualifiedCall(
    fromScope: string, 
    qualifiedName: string, 
    node: Parser.SyntaxNode, 
    context: CppVisitorContext
  ): RelationshipInfo | null {
    
    return {
      fromName: fromScope,
      toName: qualifiedName,
      relationshipType: CppRelationshipKind.CALLS,
      confidence: 0.9,
      lineNumber: node.startPosition.row + 1,
      columnNumber: node.startPosition.column + 1,
      crossLanguage: false,
      sourceContext: `${qualifiedName}(...)`,
      usagePattern: "qualified_call"
    };
  }

  private createTemplateCall(
    fromScope: string, 
    functionName: string, 
    node: Parser.SyntaxNode, 
    context: CppVisitorContext
  ): RelationshipInfo | null {
    
    const metadata: CppRelationshipMetadata = {
      isTemplateCall: true
    };

    return {
      fromName: fromScope,
      toName: functionName,
      relationshipType: CppRelationshipKind.CALLS,
      confidence: 0.85,
      lineNumber: node.startPosition.row + 1,
      columnNumber: node.startPosition.column + 1,
      crossLanguage: false,
      sourceContext: this.astUtils.getNodeText(node, context.content),
      usagePattern: "template_call",
      metadata
    };
  }

  private extractTypeReferences(node: Parser.SyntaxNode, context: CppVisitorContext): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];
    
    const typeNode = node.childForFieldName("type");
    if (!typeNode) return relationships;

    const typeName = this.astUtils.getNodeText(typeNode, context.content);
    const currentScope = this.getCurrentScope(node, context);
    
    if (!currentScope || this.isPrimitiveType(typeName)) {
      return relationships;
    }

    const relationship: RelationshipInfo = {
      fromName: currentScope,
      toName: typeName,
      relationshipType: CppRelationshipKind.USES,
      confidence: 0.8,
      lineNumber: node.startPosition.row + 1,
      columnNumber: node.startPosition.column + 1,
      crossLanguage: false,
      sourceContext: typeName,
      usagePattern: "type_usage"
    };

    relationships.push(relationship);
    return relationships;
  }

  private getCurrentFunctionScope(node: Parser.SyntaxNode, context: CppVisitorContext): string | null {
    let current = node.parent;
    
    while (current) {
      if (current.type === "function_definition" || 
          current.type === "method_definition" ||
          current.type === "constructor_definition" ||
          current.type === "destructor_definition") {
        
        const nameNode = current.childForFieldName("declarator");
        if (nameNode) {
          // Extract function name (this is simplified)
          const functionName = this.extractFunctionNameFromDeclarator(nameNode, context);
          if (functionName) {
            return this.astUtils.buildQualifiedName(functionName, context);
          }
        }
      }
      current = current.parent;
    }
    
    return null;
  }

  private getCurrentScope(node: Parser.SyntaxNode, context: CppVisitorContext): string | null {
    // Try function scope first
    const functionScope = this.getCurrentFunctionScope(node, context);
    if (functionScope) return functionScope;

    // Fall back to class scope
    let current = node.parent;
    while (current) {
      if (current.type === "class_specifier" || current.type === "struct_specifier") {
        const nameNode = current.childForFieldName("name");
        if (nameNode) {
          const className = this.astUtils.getNodeText(nameNode, context.content);
          return this.astUtils.buildStructQualifiedName(className, current, context);
        }
      }
      current = current.parent;
    }

    // Fall back to namespace
    return context.resolutionContext.currentNamespace || context.filePath;
  }

  private extractFunctionNameFromDeclarator(nameNode: Parser.SyntaxNode, context: CppVisitorContext): string | null {
    if (nameNode.type === "function_declarator") {
      const funcNameNode = nameNode.childForFieldName("declarator");
      if (funcNameNode) {
        return this.astUtils.getNodeText(funcNameNode, context.content);
      }
    } else if (nameNode.type === "identifier" || nameNode.type === "field_identifier") {
      return this.astUtils.getNodeText(nameNode, context.content);
    }
    
    return null;
  }

  private isPrimitiveType(typeName: string): boolean {
    const primitiveTypes = new Set([
      'void', 'bool', 'char', 'wchar_t', 'char16_t', 'char32_t',
      'signed', 'unsigned', 'short', 'int', 'long', 'float', 'double',
      'auto', 'decltype'
    ]);
    
    return primitiveTypes.has(typeName.split(' ')[0]);
  }
}