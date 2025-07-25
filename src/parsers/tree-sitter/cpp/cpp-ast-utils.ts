/**
 * C++ AST Utilities
 * 
 * Provides common AST manipulation, text extraction, and qualified name building utilities
 * for C++ tree-sitter parsing operations.
 */

import Parser from "tree-sitter";
import { Logger, createLogger } from "../../../utils/logger.js";
import { CppVisitorContext } from "./cpp-types.js";

export class CppAstUtils {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('CppAstUtils');
  }

  /**
   * Extract text from a tree-sitter node
   */
  getNodeText(node: Parser.SyntaxNode, content: string): string {
    try {
      return content.slice(node.startIndex, node.endIndex);
    } catch (error) {
      this.logger.error('Failed to extract node text', error, {
        nodeType: node.type,
        startIndex: node.startIndex,
        endIndex: node.endIndex
      });
      return '';
    }
  }

  /**
   * Build qualified name considering current namespace context
   */
  buildQualifiedName(name: string, context: CppVisitorContext): string {
    const namespace = context.resolutionContext.currentNamespace;
    return namespace ? `${namespace}::${name}` : name;
  }

  /**
   * Build qualified name for struct/class considering parent scopes
   */
  buildStructQualifiedName(
    name: string, 
    node: Parser.SyntaxNode, 
    context: CppVisitorContext
  ): string {
    // Check if this struct/class is nested inside another
    let parent = node.parent;
    const parentScopes: string[] = [];

    while (parent) {
      if (parent.type === 'struct_specifier' || parent.type === 'class_specifier') {
        const parentNameNode = parent.childForFieldName('name');
        if (parentNameNode) {
          const parentName = this.getNodeText(parentNameNode, context.content);
          parentScopes.unshift(parentName);
        }
      }
      parent = parent.parent;
    }

    // Build full qualified name
    let qualifiedName = name;
    if (parentScopes.length > 0) {
      qualifiedName = `${parentScopes.join('::')}_::${name}`;
    }
    if (context.resolutionContext.currentNamespace) {
      qualifiedName = `${context.resolutionContext.currentNamespace}::${qualifiedName}`;
    }

    return qualifiedName;
  }

  /**
   * Build parent scope name considering the context hierarchy
   */
  buildParentScope(
    parentName: string, 
    context: CppVisitorContext, 
    parentNode: Parser.SyntaxNode
  ): string {
    // Check for nested classes/structs
    let grandParent = parentNode.parent;
    const parentScopes: string[] = [];

    while (grandParent) {
      if (grandParent.type === 'struct_specifier' || grandParent.type === 'class_specifier') {
        const grandParentNameNode = grandParent.childForFieldName('name');
        if (grandParentNameNode) {
          const grandParentName = this.getNodeText(grandParentNameNode, context.content);
          parentScopes.unshift(grandParentName);
        }
      }
      grandParent = grandParent.parent;
    }

    // Build parent scope
    let parentScope = parentName;
    if (parentScopes.length > 0) {
      parentScope = `${parentScopes.join('::')}_::${parentName}`;
    }
    if (context.resolutionContext.currentNamespace) {
      parentScope = `${context.resolutionContext.currentNamespace}::${parentScope}`;
    }

    return parentScope;
  }

  /**
   * Extract function modifiers from AST node
   */
  extractFunctionModifiers(node: Parser.SyntaxNode, content: string): string[] {
    const modifiers: string[] = [];

    // Check each child for modifiers
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      const childText = this.getNodeText(child, content);

      // Storage class specifiers
      if (child.type === 'storage_class_specifier') {
        modifiers.push(childText);
      }

      // Function specifiers
      if (child.type === 'function_specifier') {
        modifiers.push(childText);
      }

      // Type qualifiers
      if (child.type === 'type_qualifier') {
        modifiers.push(childText);
      }

      // Check for specific keywords
      if (['virtual', 'override', 'final', 'constexpr', 'inline', 'explicit', 'static'].includes(childText)) {
        modifiers.push(childText);
      }
    }

    return modifiers;
  }

  /**
   * Find first node of specified type in the tree
   */
  findNodeByType(node: Parser.SyntaxNode, targetType: string): Parser.SyntaxNode | null {
    // Check current node
    if (node.type === targetType) {
      return node;
    }

    // Check children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        const found = this.findNodeByType(child, targetType);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Check if a node is inside a template declaration
   */
  isInsideTemplate(node: Parser.SyntaxNode): boolean {
    let current = node.parent;
    while (current) {
      if (current.type === 'template_declaration') {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Extract template parameters from a template declaration
   */
  extractTemplateParameters(node: Parser.SyntaxNode, content: string): string[] {
    const parameters: string[] = [];
    
    // Look for template_parameter_list
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'template_parameter_list') {
        // Extract each parameter
        for (let j = 0; j < child.childCount; j++) {
          const param = child.child(j);
          if (param && param.type !== ',' && param.type !== '<' && param.type !== '>') {
            parameters.push(this.getNodeText(param, content));
          }
        }
        break;
      }
    }

    return parameters;
  }

  /**
   * Check if a function is a constructor
   */
  isConstructor(functionName: string, parentClassName: string): boolean {
    if (!parentClassName) return false;
    
    // Extract just the class name (without namespace)
    const className = parentClassName.split('::').pop() || '';
    return functionName === className;
  }

  /**
   * Check if a function is a destructor
   */
  isDestructor(functionName: string, parentClassName: string): boolean {
    if (!parentClassName) return false;
    
    // Check for destructor pattern (~ClassName)
    const className = parentClassName.split('::').pop() || '';
    return functionName === `~${className}` || functionName.startsWith('~');
  }

  /**
   * Extract access level (public/private/protected) for class members
   */
  getAccessLevel(node: Parser.SyntaxNode): 'public' | 'private' | 'protected' {
    // Look backwards in the AST for access specifiers
    let current = node.parent;
    
    while (current) {
      if (current.type === 'class_specifier' || current.type === 'struct_specifier') {
        // Default access level for structs is public, for classes is private
        return current.type === 'struct_specifier' ? 'public' : 'private';
      }
      
      // Look for access specifier
      if (current.type === 'access_specifier') {
        const specifierText = current.text;
        if (specifierText.includes('public')) return 'public';
        if (specifierText.includes('private')) return 'private';
        if (specifierText.includes('protected')) return 'protected';
      }
      
      current = current.parent;
    }

    return 'public'; // Default
  }

  /**
   * Extract inheritance information from base class clause
   */
  extractInheritanceInfo(node: Parser.SyntaxNode, content: string): Array<{
    className: string;
    accessLevel: 'public' | 'private' | 'protected';
    isVirtual: boolean;
  }> {
    const inheritance: Array<{
      className: string;
      accessLevel: 'public' | 'private' | 'protected';
      isVirtual: boolean;
    }> = [];

    if (node.type !== 'base_class_clause') return inheritance;

    // Parse base class list
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (child.type === 'base_class_specifier') {
        let className = '';
        let accessLevel: 'public' | 'private' | 'protected' = 'private';
        let isVirtual = false;

        // Extract components
        for (let j = 0; j < child.childCount; j++) {
          const grandChild = child.child(j);
          if (!grandChild) continue;

          const text = this.getNodeText(grandChild, content);

          if (grandChild.type === 'type_identifier' || grandChild.type === 'qualified_identifier') {
            className = text;
          } else if (text === 'public' || text === 'private' || text === 'protected') {
            accessLevel = text as 'public' | 'private' | 'protected';
          } else if (text === 'virtual') {
            isVirtual = true;
          }
        }

        if (className) {
          inheritance.push({
            className,
            accessLevel,
            isVirtual
          });
        }
      }
    }

    return inheritance;
  }

  /**
   * Check if a node represents a pure virtual function
   */
  isPureVirtual(node: Parser.SyntaxNode, content: string): boolean {
    // Look for "= 0" at the end of function declaration
    const nodeText = this.getNodeText(node, content);
    return /=\s*0\s*;?\s*$/.test(nodeText);
  }

  /**
   * Extract namespace from using declaration
   */
  extractUsingDeclaration(node: Parser.SyntaxNode, content: string): { alias?: string; namespace: string } | null {
    if (node.type !== 'using_declaration') return null;

    const nodeText = this.getNodeText(node, content);
    
    // Handle "using namespace std;"
    const namespaceMatch = nodeText.match(/using\s+namespace\s+([^;]+);/);
    if (namespaceMatch) {
      return { namespace: namespaceMatch[1].trim() };
    }

    // Handle "using std::string;"
    const aliasMatch = nodeText.match(/using\s+(?:(\w+)\s*=\s*)?([^;]+);/);
    if (aliasMatch) {
      return {
        alias: aliasMatch[1]?.trim(),
        namespace: aliasMatch[2].trim()
      };
    }

    return null;
  }

  /**
   * Check if current position is inside a specific context
   */
  isInsideContext(node: Parser.SyntaxNode, contextTypes: string[]): boolean {
    let current = node.parent;
    while (current) {
      if (contextTypes.includes(current.type)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }
}