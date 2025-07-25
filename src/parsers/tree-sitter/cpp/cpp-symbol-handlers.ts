/**
 * C++ Symbol Handlers
 * 
 * Handles extraction of all C++ symbols including classes, functions, variables,
 * namespaces, templates, and other language constructs.
 */

import Parser from "tree-sitter";
import { Logger, createLogger } from "../../../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../../../utils/memory-monitor.js";
import { SymbolInfo } from "../parser-types.js";
import { CppAstUtils } from "./cpp-ast-utils.js";
import { 
  CppVisitorContext, 
  CppSymbolMetadata, 
  CppSymbolKind,
  CppAccessLevel 
} from "./cpp-types.js";

export class CppSymbolHandlers {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private astUtils: CppAstUtils;

  constructor() {
    this.logger = createLogger('CppSymbolHandlers');
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.astUtils = new CppAstUtils();
  }

  /**
   * Handle class and struct declarations
   */
  handleClass(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleClass');
    
    try {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) {
        this.logger.warn('Class node missing name field', { nodeType: node.type });
        return null;
      }

      const name = this.astUtils.getNodeText(nameNode, context.content);
      const qualifiedName = this.astUtils.buildStructQualifiedName(name, node, context);
      const isClass = node.type === "class_specifier";
      
      this.logger.debug('Processing class/struct', { 
        name, 
        qualifiedName, 
        type: isClass ? 'class' : 'struct' 
      });

      // Extract template information
      const isTemplate = this.astUtils.isInsideTemplate(node);
      let templateParameters: string[] = [];
      if (isTemplate) {
        const templateNode = this.findParentTemplate(node);
        if (templateNode) {
          templateParameters = this.astUtils.extractTemplateParameters(templateNode, context.content);
        }
      }

      // Extract inheritance information
      const baseClassClause = node.childForFieldName("base_class_clause");
      const inheritance = baseClassClause ? 
        this.astUtils.extractInheritanceInfo(baseClassClause, context.content) : [];

      // Get access level (default public for struct, private for class)
      const defaultAccessLevel = isClass ? CppAccessLevel.PRIVATE : CppAccessLevel.PUBLIC;
      
      // Build C++ specific metadata
      const metadata: CppSymbolMetadata = {
        isTemplate,
        templateParameters: templateParameters.length > 0 ? templateParameters : undefined,
        baseClasses: inheritance.length > 0 ? inheritance.map(inherit => ({
          name: inherit.className,
          accessLevel: inherit.accessLevel,
          isVirtual: inherit.isVirtual
        })) : undefined,
        members: [], // Will be populated as we find members
      };

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: isClass ? CppSymbolKind.CLASS : CppSymbolKind.STRUCT,
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        semanticTags: [
          isClass ? "class" : "struct",
          ...(isTemplate ? ["template"] : []),
          ...(inheritance.length > 0 ? ["inherited"] : [])
        ],
        complexity: this.calculateClassComplexity(node, context),
        confidence: 0.95,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        languageFeatures: metadata,
      };

      // Update context for nested processing
      context.currentClassScope = qualifiedName;
      context.accessLevels.set(qualifiedName, defaultAccessLevel);

      this.logger.debug('Created class/struct symbol', { 
        symbol: symbol.qualifiedName,
        templateParams: templateParameters.length,
        baseClasses: inheritance.length
      });

      return symbol;

    } catch (error) {
      this.logger.error('Failed to handle class', error, { nodeType: node.type });
      return null;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle function and method declarations
   */
  handleFunction(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleFunction');
    
    try {
      // Get function name
      const nameNode = node.childForFieldName("declarator");
      if (!nameNode) {
        this.logger.warn('Function node missing declarator field', { nodeType: node.type });
        return null;
      }

      let functionName = "";
      let isMethod = false;

      // Extract function name from the declarator
      functionName = this.extractFunctionNameFromDeclarator(nameNode, context);
      
      // Determine if this is a method based on context or field_identifier
      isMethod = this.isMethodContext(node, nameNode, context);

      if (!functionName) {
        this.logger.warn('Could not extract function name', { nodeType: nameNode.type });
        return null;
      }

      // Get return type
      const typeNode = node.childForFieldName("type");
      const returnType = typeNode ? this.astUtils.getNodeText(typeNode, context.content) : "void";

      // Extract modifiers
      const modifiers = this.astUtils.extractFunctionModifiers(node, context.content);

      // Build qualified name
      let parentScope: string | undefined;
      if (isMethod && context.currentClassScope) {
        parentScope = context.currentClassScope;
      } else {
        parentScope = context.resolutionContext.currentNamespace;
      }

      const qualifiedName = parentScope ? `${parentScope}::${functionName}` : functionName;

      // Detect special function types
      const isConstructor = isMethod && parentScope ? 
        this.astUtils.isConstructor(functionName, parentScope) : false;
      const isDestructor = isMethod && parentScope ? 
        this.astUtils.isDestructor(functionName, parentScope) : false;
      
      // Detect function characteristics
      const isVirtual = modifiers.includes("virtual");
      const isPureVirtual = isVirtual && this.astUtils.isPureVirtual(node, context.content);
      const isOverride = modifiers.includes("override");
      const isFinal = modifiers.includes("final");
      const isConstexpr = modifiers.includes("constexpr");
      const isInline = modifiers.includes("inline");
      const isExplicit = modifiers.includes("explicit");
      const isStatic = modifiers.includes("static");
      const isConst = this.isConstMethod(node, context.content);
      const isNoexcept = this.isNoexceptMethod(node, context.content);

      // Detect template function
      const isTemplate = this.astUtils.isInsideTemplate(node);
      let templateParameters: string[] = [];
      if (isTemplate) {
        const templateNode = this.findParentTemplate(node);
        if (templateNode) {
          templateParameters = this.astUtils.extractTemplateParameters(templateNode, context.content);
        }
      }

      // Build signature
      const parametersNode = nameNode.childForFieldName("parameters");
      let signature = functionName;
      if (parametersNode) {
        const paramText = this.astUtils.getNodeText(parametersNode, context.content);
        signature = `${functionName}${paramText}`;
      }

      // Add modifiers to signature
      if (modifiers.length > 0) {
        signature = `${modifiers.join(" ")} ${signature}`;
      }
      if (isConst) signature += " const";
      if (isNoexcept) signature += " noexcept";

      // Determine symbol kind
      let symbolKind = CppSymbolKind.FUNCTION;
      if (isConstructor) symbolKind = CppSymbolKind.CONSTRUCTOR;
      else if (isDestructor) symbolKind = CppSymbolKind.DESTRUCTOR;
      else if (isMethod) symbolKind = CppSymbolKind.METHOD;
      else if (this.isOperatorOverload(functionName)) symbolKind = CppSymbolKind.OPERATOR;

      // Build metadata
      const metadata: CppSymbolMetadata = {
        isVirtual,
        isPureVirtual,
        isOverride,
        isFinal,
        isConstexpr,
        isInline,
        isExplicit,
        isNoexcept,
        isConst,
        isConstructor,
        isDestructor,
        isTemplate,
        templateParameters: templateParameters.length > 0 ? templateParameters : undefined,
        storageClass: isStatic ? "static" : undefined,
      };

      const symbol: SymbolInfo = {
        name: functionName,
        qualifiedName,
        kind: symbolKind,
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column,
        signature,
        returnType: isConstructor || isDestructor ? undefined : returnType,
        visibility: isMethod ? this.astUtils.getAccessLevel(node) : undefined,
        semanticTags: [
          symbolKind,
          ...modifiers,
          ...(isConst ? ["const"] : []),
          ...(isNoexcept ? ["noexcept"] : []),
          ...(isTemplate ? ["template"] : [])
        ],
        complexity: this.calculateFunctionComplexity(node, context),
        confidence: 0.9,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: this.isCoroutineFunction(node, context.content),
        namespace: context.resolutionContext.currentNamespace,
        parentScope,
        languageFeatures: metadata,
      };

      this.logger.debug('Created function symbol', {
        symbol: symbol.qualifiedName,
        kind: symbolKind,
        isTemplate,
        modifiers: modifiers.length
      });

      return symbol;

    } catch (error) {
      this.logger.error('Failed to handle function', error, { nodeType: node.type });
      return null;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle namespace declarations
   */
  handleNamespace(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleNamespace');
    
    try {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) {
        this.logger.warn('Namespace node missing name field');
        return null;
      }

      const name = this.astUtils.getNodeText(nameNode, context.content);
      const qualifiedName = this.astUtils.buildQualifiedName(name, context);

      // Update resolution context
      const previousNamespace = context.resolutionContext.currentNamespace;
      context.resolutionContext.currentNamespace = qualifiedName;

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: CppSymbolKind.NAMESPACE,
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        semanticTags: ["namespace"],
        complexity: 0,
        confidence: 1.0,
        isDefinition: true,
        isExported: node.type === "export_declaration",
        isAsync: false,
        namespace: previousNamespace,
      };

      this.logger.debug('Created namespace symbol', { namespace: qualifiedName });

      return symbol;

    } catch (error) {
      this.logger.error('Failed to handle namespace', error);
      return null;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle variable declarations
   */
  handleVariable(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleVariable');
    
    try {
      let name = "";
      let variableType = "";
      let isField = false;
      let accessLevel: CppAccessLevel = CppAccessLevel.PUBLIC;

      if (node.type === "field_declaration") {
        return this.handleFieldDeclaration(node, context);
      } else if (node.type === "variable_declaration") {
        return this.handleVariableDeclaration(node, context);
      } else if (node.type === "parameter_declaration") {
        return this.handleParameterDeclaration(node, context);
      }

      return null;

    } catch (error) {
      this.logger.error('Failed to handle variable', error, { nodeType: node.type });
      return null;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle field declarations (class/struct members)
   */
  private handleFieldDeclaration(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const declarator = node.childForFieldName("declarator");
    if (!declarator) return null;

    const name = this.astUtils.getNodeText(declarator, context.content);
    const typeNode = node.childForFieldName("type");
    const variableType = typeNode ? this.astUtils.getNodeText(typeNode, context.content) : "unknown";

    // Find parent class/struct
    let parentScope: string | undefined;
    let parent = node.parent;
    while (parent) {
      if (parent.type === "class_specifier" || parent.type === "struct_specifier") {
        const nameNode = parent.childForFieldName("name");
        if (nameNode) {
          const parentName = this.astUtils.getNodeText(nameNode, context.content);
          parentScope = this.astUtils.buildParentScope(parentName, context, parent);
          break;
        }
      }
      parent = parent.parent;
    }

    const qualifiedName = parentScope ? `${parentScope}::${name}` : name;
    const accessLevel = this.astUtils.getAccessLevel(node);

    // Extract modifiers
    const isStatic = node.text.includes("static");
    const isConst = node.text.includes("const");
    const isMutable = node.text.includes("mutable");
    const isVolatile = node.text.includes("volatile");

    const metadata: CppSymbolMetadata = {
      isConst,
      isMutable,
      isVolatile,
      storageClass: isStatic ? "static" : undefined,
    };

    const symbol: SymbolInfo = {
      name,
      qualifiedName,
      kind: CppSymbolKind.FIELD,
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      returnType: variableType,
      visibility: accessLevel,
      semanticTags: [
        "field",
        "member",
        ...(isStatic ? ["static"] : []),
        ...(isConst ? ["const"] : []),
        ...(isMutable ? ["mutable"] : [])
      ],
      complexity: 0,
      confidence: 0.95,
      isDefinition: true,
      isExported: context.insideExportBlock,
      isAsync: false,
      namespace: context.resolutionContext.currentNamespace,
      parentScope,
      languageFeatures: metadata,
    };

    this.logger.debug('Created field symbol', { 
      field: qualifiedName, 
      type: variableType, 
      access: accessLevel 
    });

    return symbol;
  }

  /**
   * Handle regular variable declarations
   */
  private handleVariableDeclaration(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const declarator = node.childForFieldName("declarator");
    if (!declarator) return null;

    const name = this.astUtils.getNodeText(declarator, context.content);
    const qualifiedName = this.astUtils.buildQualifiedName(name, context);

    const typeNode = node.childForFieldName("type");
    const variableType = typeNode ? this.astUtils.getNodeText(typeNode, context.content) : "unknown";

    // Extract modifiers from AST and text
    const modifiers = this.extractVariableModifiers(node, context.content);

    const metadata: CppSymbolMetadata = {
      isConst: modifiers.isConst,
      isConstexpr: modifiers.isConstexpr,
      isInline: modifiers.isInline,
      isMutable: modifiers.isMutable,
      isVolatile: modifiers.isVolatile,
      storageClass: modifiers.storageClass,
    };

    const symbol: SymbolInfo = {
      name,
      qualifiedName,
      kind: CppSymbolKind.VARIABLE,
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      returnType: variableType,
      signature: node.text.trim(),
      semanticTags: this.buildVariableSemanticTags(modifiers),
      complexity: 0,
      confidence: 0.9,
      isDefinition: true,
      isExported: context.insideExportBlock,
      isAsync: false,
      namespace: context.resolutionContext.currentNamespace,
      languageFeatures: metadata,
    };

    this.logger.debug('Created variable symbol', {
      variable: qualifiedName,
      type: variableType,
      modifiers: Object.keys(modifiers).filter(k => (modifiers as any)[k]).length
    });

    return symbol;
  }

  /**
   * Handle parameter declarations
   */
  private handleParameterDeclaration(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    // Parameters are typically not stored as top-level symbols
    // They would be stored as part of function metadata
    return null;
  }

  /**
   * Handle enum declarations
   */
  handleEnum(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleEnum');
    
    try {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return null;

      const name = this.astUtils.getNodeText(nameNode, context.content);
      const qualifiedName = this.astUtils.buildQualifiedName(name, context);
      
      const isEnumClass = node.text.includes("enum class") || node.text.includes("enum struct");
      const symbolKind = isEnumClass ? CppSymbolKind.ENUM_CLASS : CppSymbolKind.ENUM;

      // Extract underlying type if specified
      let underlyingType: string | undefined;
      const typeMatch = node.text.match(/enum\s+(?:class|struct)?\s+\w+\s*:\s*(\w+)/);
      if (typeMatch) {
        underlyingType = typeMatch[1];
      }

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: symbolKind,
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        returnType: underlyingType,
        semanticTags: [
          symbolKind,
          ...(isEnumClass ? ["scoped"] : ["unscoped"])
        ],
        complexity: 0,
        confidence: 0.95,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
      };

      this.logger.debug('Created enum symbol', { 
        enum: qualifiedName, 
        scoped: isEnumClass,
        underlyingType 
      });

      return symbol;

    } catch (error) {
      this.logger.error('Failed to handle enum', error);
      return null;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Handle typedef and using declarations
   */
  handleTypedef(node: Parser.SyntaxNode, context: CppVisitorContext): SymbolInfo | null {
    const checkpoint = this.memoryMonitor.createCheckpoint('handleTypedef');
    
    try {
      let name = "";
      let aliasedType = "";
      
      if (node.type === "alias_declaration") {
        // using alias = type;
        const nameNode = node.childForFieldName("name");
        const typeNode = node.childForFieldName("type");
        
        if (nameNode) name = this.astUtils.getNodeText(nameNode, context.content);
        if (typeNode) aliasedType = this.astUtils.getNodeText(typeNode, context.content);
      } else if (node.type === "type_definition") {
        // typedef type alias;
        const declarator = node.childForFieldName("declarator");
        const typeNode = node.childForFieldName("type");
        
        if (declarator) name = this.astUtils.getNodeText(declarator, context.content);
        if (typeNode) aliasedType = this.astUtils.getNodeText(typeNode, context.content);
      } else if (node.type === "using_declaration") {
        // Handle using declarations differently
        const usingInfo = this.astUtils.extractUsingDeclaration(node, context.content);
        if (usingInfo) {
          if (usingInfo.alias) {
            name = usingInfo.alias;
            aliasedType = usingInfo.namespace;
          } else {
            // using namespace declaration - add to context
            context.resolutionContext.importedNamespaces.add(usingInfo.namespace);
            return null; // Don't create symbol for namespace using
          }
        }
      }

      if (!name) return null;

      const qualifiedName = this.astUtils.buildQualifiedName(name, context);
      const isTemplate = this.astUtils.isInsideTemplate(node);

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: node.type === "using_declaration" ? CppSymbolKind.USING : CppSymbolKind.TYPEDEF,
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        returnType: aliasedType,
        semanticTags: [
          "type_alias",
          ...(isTemplate ? ["template"] : [])
        ],
        complexity: 0,
        confidence: 0.9,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        languageFeatures: {
          isTemplate,
          aliasedType
        }
      };

      // Add to type aliases context
      context.resolutionContext.typeAliases.set(name, aliasedType);

      this.logger.debug('Created typedef/using symbol', { 
        alias: qualifiedName, 
        type: aliasedType 
      });

      return symbol;

    } catch (error) {
      this.logger.error('Failed to handle typedef', error, { nodeType: node.type });
      return null;
    } finally {
      checkpoint.complete();
    }
  }

  // Helper methods

  private findParentTemplate(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let current = node.parent;
    while (current) {
      if (current.type === "template_declaration") {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private calculateClassComplexity(node: Parser.SyntaxNode, context: CppVisitorContext): number {
    // Base complexity
    let complexity = 1;

    // Count methods, fields, nested classes
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (child.type === "function_definition" || child.type === "method_definition") {
        complexity += 1;
      } else if (child.type === "field_declaration") {
        complexity += 0.5;
      } else if (child.type === "class_specifier" || child.type === "struct_specifier") {
        complexity += 2; // Nested classes add more complexity
      }
    }

    return Math.floor(complexity);
  }

  private calculateFunctionComplexity(node: Parser.SyntaxNode, context: CppVisitorContext): number {
    let complexity = 1;
    
    // This is a simplified complexity calculation
    // In practice, you'd want to analyze control flow
    const functionText = this.astUtils.getNodeText(node, context.content);
    
    // Count control flow keywords
    const ifMatches = functionText.match(/\bif\b/g) || [];
    const loopMatches = functionText.match(/\b(for|while|do)\b/g) || [];
    const switchMatches = functionText.match(/\bswitch\b/g) || [];
    const tryMatches = functionText.match(/\btry\b/g) || [];

    complexity += ifMatches.length;
    complexity += loopMatches.length * 2;
    complexity += switchMatches.length * 2;
    complexity += tryMatches.length;

    return complexity;
  }

  private isConstMethod(node: Parser.SyntaxNode, content: string): boolean {
    const nodeText = this.astUtils.getNodeText(node, content);
    return /\)\s*const\s*[{;]/.test(nodeText);
  }

  private isNoexceptMethod(node: Parser.SyntaxNode, content: string): boolean {
    const nodeText = this.astUtils.getNodeText(node, content);
    return /\bnoexcept\b/.test(nodeText);
  }

  private isOperatorOverload(functionName: string): boolean {
    return functionName.startsWith("operator");
  }

  private isCoroutineFunction(node: Parser.SyntaxNode, content: string): boolean {
    const functionText = this.astUtils.getNodeText(node, content);
    return /\b(co_await|co_yield|co_return)\b/.test(functionText);
  }

  private extractVariableModifiers(node: Parser.SyntaxNode, content: string) {
    let isInline = false;
    let isConstexpr = false;
    let isConst = false;
    let isStatic = false;
    let isThreadLocal = false;
    let isExtern = false;
    let isMutable = false;
    let isVolatile = false;
    let storageClass: "static" | "extern" | "thread_local" | undefined;

    // Check AST nodes
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      const childText = this.astUtils.getNodeText(child, content);

      if (child.type === "storage_class_specifier") {
        switch (childText) {
          case "inline": isInline = true; break;
          case "static": isStatic = true; storageClass = "static"; break;
          case "extern": isExtern = true; storageClass = "extern"; break;
          case "thread_local": isThreadLocal = true; storageClass = "thread_local"; break;
        }
      }

      if (child.type === "type_qualifier") {
        switch (childText) {
          case "const": isConst = true; break;
          case "mutable": isMutable = true; break;
          case "volatile": isVolatile = true; break;
        }
      }

      if (childText === "constexpr") {
        isConstexpr = true;
      }
    }

    // Fallback to text-based detection
    const fullText = node.text;
    if (!isInline && /\binline\b/.test(fullText)) isInline = true;
    if (!isConstexpr && /\bconstexpr\b/.test(fullText)) isConstexpr = true;

    return {
      isInline,
      isConstexpr,
      isConst,
      isStatic,
      isThreadLocal,
      isExtern,
      isMutable,
      isVolatile,
      storageClass
    };
  }

  private buildVariableSemanticTags(modifiers: any): string[] {
    const tags = ["variable"];
    
    if (modifiers.isInline) tags.push("inline", "modern_cpp");
    if (modifiers.isConstexpr) tags.push("constexpr");
    if (modifiers.isConst) tags.push("const");
    if (modifiers.isStatic) tags.push("static");
    if (modifiers.isThreadLocal) tags.push("thread_local");
    if (modifiers.isExtern) tags.push("extern");
    if (modifiers.isMutable) tags.push("mutable");
    if (modifiers.isVolatile) tags.push("volatile");

    return tags;
  }

  /**
   * Extract function name from complex declarator structures
   */
  private extractFunctionNameFromDeclarator(declaratorNode: Parser.SyntaxNode, context: CppVisitorContext): string {
    if (!declaratorNode) return "";

    switch (declaratorNode.type) {
      case "function_declarator":
        // Standard function: func() or method()
        const nameNode = declaratorNode.childForFieldName("declarator");
        if (nameNode) {
          return this.extractFunctionNameFromDeclarator(nameNode, context);
        }
        break;

      case "reference_declarator":
      case "pointer_declarator":
        // Functions returning references or pointers: int& func() or int* func()
        // The inner declarator is NOT a field child, but rather the second child (index 1)
        // First child is the & or * symbol, second child is the function_declarator
        for (let i = 0; i < declaratorNode.childCount; i++) {
          const child = declaratorNode.child(i);
          if (child && child.type === "function_declarator") {
            return this.extractFunctionNameFromDeclarator(child, context);
          }
        }
        break;

      case "identifier":
      case "field_identifier":
        // Direct function name
        return this.astUtils.getNodeText(declaratorNode, context.content);

      case "qualified_identifier":
        // Qualified function name: NS::Class::method
        const fullName = this.astUtils.getNodeText(declaratorNode, context.content);
        // Extract just the function name (last part after ::)
        const parts = fullName.split("::");
        return parts[parts.length - 1];

      case "destructor_name":
        // Destructor: ~ClassName
        return this.astUtils.getNodeText(declaratorNode, context.content);

      default:
        this.logger.debug('Unhandled declarator type', { 
          type: declaratorNode.type, 
          text: declaratorNode.text.substring(0, 50) 
        });
        return "";
    }

    return "";
  }

  /**
   * Determine if a function is a method based on context
   */
  private isMethodContext(functionNode: Parser.SyntaxNode, declaratorNode: Parser.SyntaxNode, context: CppVisitorContext): boolean {
    // Check if we're inside a class/struct
    let parent = functionNode.parent;
    while (parent) {
      if (parent.type === "class_specifier" || parent.type === "struct_specifier") {
        return true;
      }
      if (parent.type === "namespace_definition") {
        // If we hit a namespace first, it's not a method
        break;
      }
      parent = parent.parent;
    }

    // Check if the function name contains field_identifier
    return this.containsFieldIdentifier(declaratorNode);
  }

  /**
   * Check if a declarator contains a field_identifier (method indicator)
   */
  private containsFieldIdentifier(node: Parser.SyntaxNode): boolean {
    if (node.type === "field_identifier") {
      return true;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && this.containsFieldIdentifier(child)) {
        return true;
      }
    }

    return false;
  }
}