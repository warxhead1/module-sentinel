import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  MethodSignature, 
  ClassInfo,
  ParameterInfo,
  EnhancedModuleInfo 
} from '../types/essential-features.js';

/**
 * Enhanced Tree-sitter Parser with better C++ understanding
 * 
 * This improves on the basic tree-sitter approach by:
 * - Better template handling
 * - Namespace tracking
 * - More accurate type extraction
 * - Better understanding of C++ idioms
 */
export class EnhancedTreeSitterParser {
  private parser: Parser;
  private cpp: any;

  constructor() {
    this.parser = new Parser();
  }

  async initialize(): Promise<void> {
    // Dynamically load tree-sitter-cpp
    try {
      const treeSitterCpp = await import('tree-sitter-cpp');
      // When using dynamic imports, tree-sitter-cpp is wrapped in a module object
      // and the actual language object is in the .default property
      this.cpp = treeSitterCpp.default;
      this.parser.setLanguage(this.cpp);
    } catch (error) {
      throw new Error('Failed to load tree-sitter-cpp: ' + error);
    }
  }

  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Check file size - tree-sitter has issues with files > 32KB
    if (content.length > 256 * 1024) {
      throw new Error(`File too large for tree-sitter (${Math.round(content.length / 1024)}KB). Maximum supported size is 256KB.`);
    }
    
    // Validate content is not empty or corrupt
    if (!content || content.trim().length === 0) {
      throw new Error(`File content is empty or invalid: ${filePath}`);
    }
    
    // Check for null bytes or other invalid characters that might cause parser issues
    if (content.includes('\0')) {
      throw new Error(`File contains null bytes which cannot be parsed: ${filePath}`);
    }
    
    let tree;
    try {
      // Use larger buffer size to handle large files (tree-sitter default is 32KB)
      const bufferSize = Math.max(262144, content.length + 1024); // At least 256KB, or file size + buffer
      tree = this.parser.parse(content, undefined, { bufferSize });
    } catch (error) {
      throw new Error(`Tree-sitter parsing failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    if (!tree || !tree.rootNode) {
      throw new Error(`Tree-sitter produced invalid parse tree for ${filePath}`);
    }
    
    const context = {
      namespaces: [] as string[],
      currentClass: undefined as string | undefined,
      templates: new Map<string, string[]>()
    };
    
    const methods: MethodSignature[] = [];
    const classes: ClassInfo[] = [];
    const includes: any[] = [];
    const exports: any[] = [];
    
    this.walkTree(tree.rootNode, {
      content,
      filePath,
      context,
      methods,
      classes,
      includes,
      exports
    });
    
    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods,
      classes,
      interfaces: this.identifyInterfaces(classes),
      relationships: this.extractRelationships(tree.rootNode, content),
      patterns: this.extractPatterns(tree.rootNode, content),
      imports: includes,
      exports: [...this.identifyExports(methods, classes), ...exports]
    };
  }

  private walkTree(node: Parser.SyntaxNode, state: any, depth: number = 0): void {
    // Prevent infinite recursion
    if (depth > 100) {
      console.warn(`⚠️ Tree walk depth exceeded 100 at node type: ${node.type}`);
      return;
    }
    
    // Track performance for slow operations
    const startTime = depth < 3 ? Date.now() : 0;
    
    switch (node.type) {
      case 'namespace_definition':
        this.handleNamespace(node, state, depth);
        break;
        
      case 'class_specifier':
      case 'struct_specifier':
        this.handleClass(node, state, depth);
        break;
        
      case 'function_definition':
        this.handleFunction(node, state);
        break;
        
      case 'declaration':
        this.handleDeclaration(node, state);
        break;
        
      // Enhanced: Handle enum declarations including enum class
      case 'enum_specifier':
        this.handleEnum(node, state);
        break;
        
      case 'template_declaration':
        this.handleTemplate(node, state);
        break;
        
      case 'preproc_include':
        this.handleInclude(node, state);
        break;
        
      // Enhanced: Handle C++23 module declarations
      case 'module_declaration':
        this.handleModuleDeclaration(node, state);
        break;
        
      case 'import_declaration':
        this.handleImportDeclaration(node, state);
        break;
        
      // Enhanced: Better macro handling
      case 'preproc_def':
      case 'preproc_function_def':
        this.handleMacroDefinition(node, state);
        break;
        
      // Enhanced: Type alias handling for better type resolution
      case 'alias_declaration':
      case 'type_definition':
        this.handleTypeAlias(node, state);
        break;
        
      // Enhanced: Export declarations for C++23 modules
      case 'export_declaration':
        this.handleExportDeclaration(node, state, depth);
        break;
        
      // Enhanced: Using declarations for better symbol tracking
      case 'using_declaration':
        this.handleUsingDeclaration(node, state);
        break;
    }
    
    // Continue walking the tree
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.walkTree(child, state, depth + 1);
      }
    }
  }

  private handleClass(node: Parser.SyntaxNode, state: any, depth: number = 0): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;
    
    const className = nameNode.text;
    const oldClass = state.context.currentClass;
    state.context.currentClass = className;
    
    // Extract base classes
    const baseClasses: string[] = [];
    const baseClauseNode = node.childForFieldName('base_class_clause');
    if (baseClauseNode) {
      baseClasses.push(...this.extractBaseClasses(baseClauseNode, state.content));
    }
    
    const classInfo: ClassInfo = {
      name: className,
      namespace: state.context.namespaces.length > 0 ? state.context.namespaces.join('::') : undefined,
      baseClasses,
      interfaces: [],
      methods: [],
      members: [],
      isTemplate: state.context.templates.has(className),
      templateParams: state.context.templates.get(className),
      location: {
        line: nameNode.startPosition.row + 1,
        column: nameNode.startPosition.column + 1
      }
    };
    
    // Extract members
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      this.extractClassMembersEnhanced(bodyNode, classInfo, state, depth);
    }
    
    state.classes.push(classInfo);
    state.context.currentClass = oldClass;
  }

  private handleFunction(node: Parser.SyntaxNode, state: any): void {
    const declaratorNode = node.childForFieldName('declarator');
    if (!declaratorNode) return;
    
    const signature = this.parseFunctionDeclarator(declaratorNode, state.content);
    if (!signature) return;
    
    // Get return type
    const typeNode = node.childForFieldName('type');
    if (typeNode) {
      signature.returnType = this.extractType(typeNode, state.content);
    }
    
    // Check for const qualifier
    const qualifiersNode = node.childForFieldName('qualifiers');
    if (qualifiersNode && qualifiersNode.text.includes('const')) {
      signature.isConst = true;
    }
    
    // Set visibility based on context
    signature.visibility = this.getCurrentVisibility(node);
    
    // Enhanced: Include namespace information
    signature.namespace = state.context.namespaces.length > 0 ? state.context.namespaces.join('::') : undefined;
    
    // Check if it's a method or free function
    if (state.context.currentClass) {
      signature.className = state.context.currentClass;
      // For methods, include class in qualified name
      signature.qualifiedName = this.getQualifiedName(`${state.context.currentClass}::${signature.name}`, state.context.namespaces);
    } else {
      // For free functions, just use namespace qualification
      signature.qualifiedName = this.getQualifiedName(signature.name, state.context.namespaces);
    }
    
    // Mark as exported if in export namespace
    signature.isExported = this.isInExportedNamespace(state);
    
    state.methods.push(signature);
  }

  private parseFunctionDeclarator(node: Parser.SyntaxNode, content: string): MethodSignature | null {
    let nameNode: Parser.SyntaxNode | null = null;
    let parametersNode: Parser.SyntaxNode | null = null;
    
    // Navigate through potential pointer declarators
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === 'function_declarator') {
        const declarator = current.childForFieldName('declarator');
        if (declarator?.type === 'identifier' || declarator?.type === 'field_identifier') {
          nameNode = declarator;
        } else if (declarator?.type === 'qualified_identifier') {
          nameNode = declarator.lastChild;
        }
        parametersNode = current.childForFieldName('parameters');
        break;
      }
      current = current.firstChild;
    }
    
    if (!nameNode) return null;
    
    const signature: MethodSignature = {
      name: nameNode.text,
      parameters: [],
      returnType: 'void',
      visibility: 'public',
      isVirtual: false,
      isStatic: false,
      isConst: false,
      location: {
        line: nameNode.startPosition.row + 1,
        column: nameNode.startPosition.column + 1
      }
    };
    
    // Parse parameters
    if (parametersNode) {
      signature.parameters = this.parseParameters(parametersNode, content);
    }
    
    return signature;
  }

  private parseParameters(node: Parser.SyntaxNode, content: string): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'parameter_declaration') {
        const param = this.parseParameter(child, content);
        if (param) {
          params.push(param);
        }
      }
    }
    
    return params;
  }

  private parseParameter(node: Parser.SyntaxNode, content: string): ParameterInfo | null {
    const typeNode = node.childForFieldName('type');
    const declaratorNode = node.childForFieldName('declarator');
    
    if (!typeNode) return null;
    
    const type = this.extractType(typeNode, content);
    let name = '';
    
    if (declaratorNode) {
      // Handle various declarator types
      if (declaratorNode.type === 'identifier') {
        name = declaratorNode.text;
      } else if (declaratorNode.type === 'pointer_declarator' || 
                 declaratorNode.type === 'reference_declarator') {
        const id = declaratorNode.lastChild;
        if (id?.type === 'identifier') {
          name = id.text;
        }
      }
    }
    
    // Check for default value
    let defaultValue: string | undefined;
    const defaultNode = node.childForFieldName('default_value');
    if (defaultNode) {
      defaultValue = content.substring(defaultNode.startIndex, defaultNode.endIndex);
    }
    
    return {
      name,
      type,
      defaultValue,
      isConst: type.includes('const'),
      isReference: type.includes('&') || declaratorNode?.type === 'reference_declarator',
      isPointer: type.includes('*') || declaratorNode?.type === 'pointer_declarator'
    };
  }

  private extractType(node: Parser.SyntaxNode, content: string): string {
    // Handle various type constructs
    let type = content.substring(node.startIndex, node.endIndex).trim();
    
    // Clean up the type string
    type = type.replace(/\s+/g, ' ');
    
    // Handle common patterns
    if (node.type === 'auto') {
      return 'auto';
    }
    
    return type;
  }

  private extractBaseClasses(node: Parser.SyntaxNode, content: string): string[] {
    const bases: string[] = [];
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'base_class' || child.type === 'type_identifier')) {
        bases.push(child.text);
      }
    }
    
    return bases;
  }



  private getCurrentVisibility(node: Parser.SyntaxNode): 'public' | 'private' | 'protected' {
    // Walk up the tree to find access specifier
    let current: Parser.SyntaxNode | null = node;
    let lastAccessSpecifier: string = 'private';
    
    while (current) {
      if (current.type === 'access_specifier') {
        const label = current.firstChild;
        if (label) {
          lastAccessSpecifier = label.text;
        }
      }
      current = current.previousSibling;
    }
    
    return lastAccessSpecifier as any;
  }

  private handleNamespace(node: Parser.SyntaxNode, state: any, depth: number = 0): void {
    const nameNode = node.childForFieldName('name');
    let namespaceParts: string[] = [];
    
    if (nameNode) {
      // Handle qualified namespace identifiers like "PlanetGen::Rendering"
      const namespaceName = nameNode.text;
      // console.log(`🔍 Detected namespace node: "${namespaceName}" (type: ${nameNode.type})`);
      
      if (nameNode.type === 'qualified_identifier') {
        // For qualified identifiers, extract all parts
        namespaceParts = this.extractQualifiedIdentifierParts(nameNode);
      } else if (namespaceName.includes('::')) {
        // Fallback: split by ::
        namespaceParts = namespaceName.split('::').map(part => part.trim()).filter(part => part);
      } else {
        namespaceParts = [namespaceName];
      }
      
      // console.log(`   Namespace parts: [${namespaceParts.join(', ')}]`);
      
      // Push each namespace part
      namespaceParts.forEach(part => {
        state.context.namespaces.push(part);
      });
    }
    
    // Process namespace body
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (child) {
          this.walkTree(child, state, depth + 1);
        }
      }
    }
    
    // Pop namespace levels when done
    for (let i = 0; i < namespaceParts.length; i++) {
      if (state.context.namespaces.length > 0) {
        state.context.namespaces.pop();
      }
    }
  }
  
  /**
   * Extract parts from a qualified identifier node
   */
  private extractQualifiedIdentifierParts(node: Parser.SyntaxNode): string[] {
    const parts: string[] = [];
    
    // Traverse the qualified identifier structure
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === 'identifier') {
        parts.unshift(current.text); // Add to beginning
        break;
      } else if (current.type === 'qualified_identifier') {
        // Get the right-most identifier
        const rightNode = current.lastChild;
        if (rightNode && rightNode.type === 'identifier') {
          parts.unshift(rightNode.text);
        }
        // Move to the left part
        current = current.firstChild;
      } else {
        break;
      }
    }
    
    return parts;
  }

  private handleTemplate(node: Parser.SyntaxNode, state: any): void {
    const parametersNode = node.childForFieldName('parameters');
    const declarationNode = node.lastChild;
    
    if (parametersNode && declarationNode) {
      const templateParams = this.extractTemplateParameters(parametersNode);
      
      // Store template parameters for the next declaration
      if (declarationNode.type === 'class_specifier' || 
          declarationNode.type === 'function_definition') {
        const nameNode = declarationNode.childForFieldName('name');
        if (nameNode) {
          state.context.templates.set(nameNode.text, templateParams);
        }
      }
    }
  }

  private extractTemplateParameters(node: Parser.SyntaxNode): string[] {
    const params: string[] = [];
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (child.type === 'type_parameter_declaration' || 
                    child.type === 'variadic_type_parameter_declaration')) {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          params.push(nameNode.text);
        }
      }
    }
    
    return params;
  }

  private handleInclude(node: Parser.SyntaxNode, state: any): void {
    const pathNode = node.lastChild;
    if (pathNode && (pathNode.type === 'string_literal' || pathNode.type === 'system_lib_string')) {
      const includePath = pathNode.text.slice(1, -1); // Remove quotes
      state.includes.push({
        module: includePath,
        symbols: [],
        isSystem: pathNode.type === 'system_lib_string',
        location: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        }
      });
    }
  }

  private handleDeclaration(node: Parser.SyntaxNode, state: any): void {
    // Handle various declarations like typedefs, using declarations, etc.
    if (node.text.includes('typedef')) {
      // Handle typedef
    } else if (node.text.includes('using')) {
      // Handle using declarations
    }
    
    // Check for enum declarations within declarations
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === 'enum_specifier') {
        this.handleEnum(child, state);
      }
    }
  }

  private identifyInterfaces(classes: ClassInfo[]): any[] {
    // Identify classes that are pure virtual (interfaces)
    return classes.filter(c => {
      // Simple heuristic: class with only pure virtual methods
      return c.name.startsWith('I') && c.methods.every(m => m.isVirtual);
    });
  }

  private currentClassContext: string | undefined;
  private currentVisibilityContext: 'public' | 'private' | 'protected' = 'private';

  private extractRelationships(root: Parser.SyntaxNode, content: string): any[] {
    const relationships: any[] = [];
    const cursor = root.walk();

    const visit = (currentNode: Parser.SyntaxNode, currentClass?: string) => {
      if (currentNode.type === 'class_specifier') {
        const nameNode = currentNode.childForFieldName('name');
        if (nameNode) {
          currentClass = nameNode.text;
        }
      }

      // Look for function calls, e.g., otherObject.doSomething()
      if (currentNode.type === 'call_expression') {
        const functionNode = currentNode.childForFieldName('function');
        if (functionNode && functionNode.type === 'field_expression') {
          const objectNode = functionNode.childForFieldName('argument');
          const methodNode = functionNode.childForFieldName('field');

          if (objectNode && methodNode && currentClass) {
            relationships.push({
              source: currentClass,
              target: objectNode.text, // Note: This is a simplification
              type: 'uses'
            });
          }
        }
      }

      for (let i = 0; i < currentNode.childCount; i++) {
        visit(currentNode.child(i)!, currentClass);
      }
    };

    visit(root);
    return relationships;
  }

  private extractPatterns(root: Parser.SyntaxNode, content: string): any[] {
    const patterns: any[] = [];
    const classes = this.extractClasses(root, content); // Pass content

    for (const classInfo of classes) {
      if (classInfo.name.endsWith('Factory')) {
        const factoryMethods = classInfo.methods.filter(m => 
          m.name.startsWith('create') &&
          (m.returnType.includes('std::unique_ptr') || m.returnType.includes('std::shared_ptr'))
        );

        if (factoryMethods.length > 0) {
          patterns.push({
            type: 'Factory',
            name: classInfo.name,
            location: classInfo.location,
            confidence: 0.8,
            details: {
              createdType: factoryMethods[0].returnType.match(/<(.*)>/)?.[1] || 'unknown',
              factoryMethods: factoryMethods.map(m => m.name)
            }
          });
        }
      }
    }
    return patterns;
  }

  // Helper method to extract class information for pattern analysis
  private extractClasses(root: Parser.SyntaxNode, content: string): ClassInfo[] {
      const classes: ClassInfo[] = [];
      const cursor = root.walk();
      const visit = (node: Parser.SyntaxNode) => {
          if (node.type === 'class_specifier' || node.type === 'struct_specifier') {
              const nameNode = node.childForFieldName('name');
              if (nameNode) {
                  const className = nameNode.text;
                  const classInfo: ClassInfo = {
                      name: className,
                      namespace: '', // Will be populated by handleNamespace
                      baseClasses: [],
                      interfaces: [],
                      methods: [],
                      members: [],
                      isTemplate: false,
                      templateParams: [],
                      location: {
                          line: nameNode.startPosition.row + 1,
                          column: nameNode.startPosition.column + 1
                      }
                  };

                  // Temporarily set current class context for method/member parsing
                  const oldCurrentClass = this.currentClassContext;
                  this.currentClassContext = className;

                  // Extract members and methods within this class
                  const bodyNode = node.childForFieldName('body');
                  if (bodyNode) {
                      let currentVisibility: 'public' | 'private' | 'protected' = 
                          node.type === 'struct_specifier' ? 'public' : 'private';

                      for (let i = 0; i < bodyNode.childCount; i++) {
                          const child = bodyNode.child(i);
                          if (!child) continue;

                          if (child.type === 'access_specifier') {
                              const labelNode = child.firstChild;
                              if (labelNode) {
                                  currentVisibility = labelNode.text.replace(':', '').trim() as any;
                              }
                          } else if (child.type === 'field_declaration') {
                              const field = this.parseFieldDeclaration(child, content, currentVisibility);
                              if (field) {
                                  classInfo.members.push(field);
                              }
                          } else if (child.type === 'function_definition' || child.type === 'declaration') {
                              const method = this.parseFunctionDeclarator(child.childForFieldName('declarator')!, content);
                              if (method) {
                                  method.visibility = currentVisibility;
                                  method.className = className;
                                  classInfo.methods.push(method);
                              }
                          }
                      }
                  }
                  classes.push(classInfo);

                  // Restore previous class context
                  this.currentClassContext = oldCurrentClass;
              }
          }
          for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child) {
                  visit(child);
              }
          }
      };
      visit(root);
      return classes;
  }

  private identifyExports(methods: MethodSignature[], classes: ClassInfo[]): any[] {
    const exports: any[] = [];
    
    // Export public classes
    classes.forEach(c => {
      exports.push({
        symbol: c.name,
        type: 'class' as const,
        signature: `class ${c.name}`,
        location: c.location
      });
    });
    
    // Export public methods
    methods
      .filter(m => m.visibility === 'public' || !m.className)
      .forEach(m => {
        exports.push({
          symbol: m.name,
          type: 'function' as const,
          signature: `${m.returnType} ${m.name}(${m.parameters.map(p => p.type).join(', ')})`,
          location: m.location
        });
      });
    
    return exports;
  }

  // Enhanced handlers for better C++ understanding

  /**
   * Handle C++23 module declarations: export module foo.bar;
   */
  private handleModuleDeclaration(node: Parser.SyntaxNode, state: any): void {
    const moduleNameNode = node.childForFieldName('name');
    if (moduleNameNode) {
      const moduleName = moduleNameNode.text;
      // console.log(`📦 Found module declaration: ${moduleName}`);
      
      // Add to exports if it's an export module
      const isExport = node.text.startsWith('export');
      if (isExport) {
        state.includes.push({
          module: moduleName,
          symbols: [],
          isSystem: false,
          isModuleExport: true,
          location: {
            line: node.startPosition.row + 1,
            column: node.startPosition.column + 1
          }
        });
      }
    }
  }

  /**
   * Handle C++23 import declarations: import foo.bar;
   */
  private handleImportDeclaration(node: Parser.SyntaxNode, state: any): void {
    const moduleNameNode = node.childForFieldName('module_name');
    if (moduleNameNode) {
      const moduleName = moduleNameNode.text;
      // console.log(`📥 Found import declaration: ${moduleName}`);
      
      state.includes.push({
        module: moduleName,
        symbols: [],
        isSystem: false,
        isModuleImport: true,
        location: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        }
      });
    }
  }

  /**
   * Enhanced macro handling for better symbol resolution
   */
  private handleMacroDefinition(node: Parser.SyntaxNode, state: any): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const macroName = nameNode.text;
    const macroBody = node.text.substring(nameNode.endIndex);

    // Track macros that might define types or functions
    if (!state.context.macros) {
      state.context.macros = new Map<string, string>();
    }
    
    state.context.macros.set(macroName, macroBody.trim());

    // Detect common patterns
    if (macroBody.includes('class') || macroBody.includes('struct')) {
      // console.log(`🔍 Macro ${macroName} might define types`);
    } else if (macroBody.includes('(') && macroBody.includes(')')) {
      // console.log(`🔍 Macro ${macroName} might define functions`);
    }
  }

  /**
   * Handle type aliases for better type resolution
   */
  private handleTypeAlias(node: Parser.SyntaxNode, state: any): void {
    const nameNode = node.childForFieldName('name');
    const typeNode = node.childForFieldName('type');
    
    if (!nameNode || !typeNode) return;

    const aliasName = nameNode.text;
    const originalType = this.extractType(typeNode, state.content);

    // Track type aliases for better type resolution
    if (!state.context.typeAliases) {
      state.context.typeAliases = new Map<string, string>();
    }
    
    state.context.typeAliases.set(aliasName, originalType);
    // console.log(`Type alias: ${aliasName} -> ${originalType}`);
  }

  /**
   * Handle export declarations: export { ... } or export class/function
   * Enhanced to understand export namespace patterns
   */
  private handleExportDeclaration(node: Parser.SyntaxNode, state: any, depth: number = 0): void {
    const content = state.content;
    const exportText = content.substring(node.startIndex, node.endIndex);
    
    // console.log(`📤 Processing export declaration: ${exportText.substring(0, 100)}...`);

    // Handle export namespace - mark current context as exported
    if (exportText.includes('namespace')) {
      // console.log(`   Contains namespace keyword`);
      
      // Look for namespace_definition child
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'namespace_definition') {
          // console.log(`   Found namespace_definition child`);
          
          // Mark that we're in an exported namespace context
          if (!state.context.exportedNamespaces) {
            state.context.exportedNamespaces = new Set<string>();
          }
          
          // Handle the namespace directly
          this.handleNamespace(child, state, depth);
          
          // Mark the namespace as exported AFTER processing it
          const currentNamespace = state.context.namespaces.join('::');
          if (currentNamespace) {
            state.context.exportedNamespaces.add(currentNamespace);
            // console.log(`📤 Marked export namespace: ${currentNamespace}`);
          }
          return;
        }
      }
    }

    // Handle export blocks: export { ... }
    if (exportText.includes('{') && exportText.includes('}')) {
      this.parseExportBlock(node, state);
      return;
    }

    // Handle direct exports: export class/function/variable
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      switch (child.type) {
        case 'class_specifier':
        case 'struct_specifier':
          const className = child.childForFieldName('name');
          if (className) {
            const qualifiedName = this.getQualifiedName(className.text, state.context.namespaces);
            this.addExport(state, qualifiedName, 'class', child);
          }
          break;

        case 'function_definition':
          const funcDeclarator = child.childForFieldName('declarator');
          if (funcDeclarator) {
            const funcName = this.extractFunctionName(funcDeclarator);
            if (funcName) {
              const qualifiedName = this.getQualifiedName(funcName, state.context.namespaces);
              this.addExport(state, qualifiedName, 'function', child);
            }
          }
          break;

        case 'declaration':
          // Handle variable declarations, using declarations, etc.
          this.handleExportedDeclaration(child, state);
          break;
      }
    }
  }

  /**
   * Parse export block content: export { using statements, declarations }
   */
  private parseExportBlock(node: Parser.SyntaxNode, state: any): void {
    const content = state.content;
    
    // Find the block content between { and }
    const blockStart = node.text.indexOf('{');
    const blockEnd = node.text.lastIndexOf('}');
    
    if (blockStart === -1 || blockEnd === -1) return;
    
    const blockContent = node.text.substring(blockStart + 1, blockEnd);
    const lines = blockContent.split('\n');
    
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('//')) continue;
      
      // Parse using alias: using Type = OtherType;
      const usingAliasMatch = cleanLine.match(/using\s+(\w+)\s*=\s*([\w:]+(?:<[^>]*>)?)/);
      if (usingAliasMatch) {
        const aliasName = usingAliasMatch[1];
        const originalType = usingAliasMatch[2];
        this.addExport(state, aliasName, 'alias', node);
        this.addExport(state, `using ${aliasName} = ${originalType}`, 'using_alias', node);
        continue;
      }
      
      // Parse using function: using namespace::function;
      const usingFunctionMatch = cleanLine.match(/using\s+([\w:]+)::([\w~]+|operator[+\-*/=<>!&|^%~\[\]()]+)/);
      if (usingFunctionMatch) {
        const functionName = usingFunctionMatch[2];
        const fullName = `${usingFunctionMatch[1]}::${functionName}`;
        this.addExport(state, functionName, 'function', node);
        this.addExport(state, `using ${fullName}`, 'using_function', node);
        continue;
      }
    }
  }

  /**
   * Handle using declarations for symbol tracking
   */
  private handleUsingDeclaration(node: Parser.SyntaxNode, state: any): void {
    const content = state.content;
    const usingText = content.substring(node.startIndex, node.endIndex);

    // Parse using namespace
    const namespaceMatch = usingText.match(/using\s+namespace\s+([\w:]+)/);
    if (namespaceMatch) {
      const namespaceName = namespaceMatch[1];
      state.includes.push({
        module: namespaceName,
        symbols: [],
        isSystem: false,
        isUsingNamespace: true,
        location: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        }
      });
      return;
    }

    // Parse using alias: using Type = OtherType;
    const aliasMatch = usingText.match(/using\s+(\w+)\s*=\s*([\w:]+(?:<[^>]*>)?)/);
    if (aliasMatch) {
      const aliasName = aliasMatch[1];
      const originalType = aliasMatch[2];
      
      // Track type alias
      if (!state.context.typeAliases) {
        state.context.typeAliases = new Map<string, string>();
      }
      state.context.typeAliases.set(aliasName, originalType);
      
      // Add to exports if this is a top-level using declaration
      state.includes.push({
        module: originalType,
        symbols: [aliasName],
        isSystem: false,
        isUsingAlias: true,
        aliasName,
        originalType,
        location: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        }
      });
      return;
    }

    // Parse using function: using namespace::function;
    const functionMatch = usingText.match(/using\s+([\w:]+)::([\w~]+|operator[+\-*/=<>!&|^%~\[\]()]+)/);
    if (functionMatch) {
      const namespacePart = functionMatch[1];
      const functionName = functionMatch[2];
      
      state.includes.push({
        module: namespacePart,
        symbols: [functionName],
        isSystem: false,
        isUsingFunction: true,
        functionName,
        qualifiedName: `${namespacePart}::${functionName}`,
        location: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        }
      });
    }
  }

  /**
   * Handle exported declarations within export statements
   */
  private handleExportedDeclaration(node: Parser.SyntaxNode, state: any): void {
    // Handle variable declarations, function declarations, etc.
    const declarationType = node.type;
    // console.log(`Handling exported declaration type: ${declarationType}`);
    
    // This can be expanded to handle specific declaration types
    // For now, we'll extract basic information
    const content = state.content;
    const declText = content.substring(node.startIndex, node.endIndex);
    
    // Simple pattern matching for now - can be enhanced with tree-sitter parsing
    const symbolMatch = declText.match(/(\w+)(?=\s*[;({])/);
    if (symbolMatch) {
      this.addExport(state, symbolMatch[1], 'declaration', node);
    }
  }

  /**
   * Get qualified name for a symbol
   */
  private getQualifiedName(symbolName: string, namespaces: string[]): string {
    if (namespaces.length === 0) {
      return symbolName;
    }
    return `${namespaces.join('::')}::${symbolName}`;
  }

  /**
   * Check if current context is in an exported namespace
   */
  private isInExportedNamespace(state: any): boolean {
    if (!state.context.exportedNamespaces) {
      return false;
    }
    const currentNamespace = state.context.namespaces.join('::');
    return state.context.exportedNamespaces.has(currentNamespace) || 
           Array.from(state.context.exportedNamespaces).some(ns => currentNamespace.startsWith(ns));
  }

  /**
   * Add export to the state with enhanced qualification
   */
  private addExport(state: any, symbolName: string, symbolType: string, node: Parser.SyntaxNode): void {
    const exportInfo = {
      symbol: symbolName,
      type: symbolType,
      signature: symbolName,
      isNamespaceExport: this.isInExportedNamespace(state),
      namespace: state.context.namespaces.length > 0 ? state.context.namespaces.join('::') : undefined,
      location: {
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1
      }
    };

    // Initialize exports array if it doesn't exist
    if (!state.exports) {
      state.exports = [];
    }
    
    state.exports.push(exportInfo);
    // console.log(`Added export: ${symbolName} (${symbolType}) [namespace: ${exportInfo.namespace || 'global'}]`);
  }

  /**
   * Extract function name from declarator node (copied from streaming parser)
   */
  private extractFunctionName(declarator: Parser.SyntaxNode): string | null {
    if (declarator.type === 'function_declarator') {
      const inner = declarator.childForFieldName('declarator');
      if (inner?.type === 'identifier') {
        return inner.text;
      }
      if (inner?.type === 'qualified_identifier') {
        return inner.text.split('::').pop() || null;
      }
      if (inner?.type === 'field_identifier') {
        return inner.text;
      }
      // Try direct identifier child
      const id = declarator.descendantsOfType('identifier')[0];
      if (id) {
        return id.text;
      }
    }
    // Handle other declarator types
    const id = declarator.descendantsOfType('identifier')[0];
    if (id) {
      return id.text;
    }
    return null;
  }

  /**
   * Enhanced type extraction with template and alias resolution
   */
  private extractTypeEnhanced(node: Parser.SyntaxNode, content: string, context: any): string {
    let baseType = this.extractType(node, content);

    // Resolve type aliases if available
    if (context.typeAliases?.has(baseType)) {
      baseType = context.typeAliases.get(baseType)!;
    }

    // Handle template instantiations better
    if (baseType.includes('<') && baseType.includes('>')) {
      const templateParts = this.parseTemplateInstantiation(baseType);
      if (templateParts) {
        // console.log(`🧬 Template instantiation: ${templateParts.base}<${templateParts.args.join(', ')}>`);
      }
    }

    return baseType;
  }

  /**
   * Parse template instantiation for better understanding
   */
  private parseTemplateInstantiation(type: string): { base: string; args: string[] } | null {
    const match = type.match(/^([^<]+)<(.+)>$/);
    if (!match) return null;

    const base = match[1].trim();
    const argsStr = match[2];
    
    // Simple comma splitting (doesn't handle nested templates perfectly)
    const args = argsStr.split(',').map(arg => arg.trim());
    
    return { base, args };
  }

  /**
   * Enhanced class member extraction with better visibility tracking
   */
  private extractClassMembersEnhanced(bodyNode: Parser.SyntaxNode, classInfo: ClassInfo, state: any, depth: number = 0): void {
    let currentVisibility: 'public' | 'private' | 'protected' = 'private'; // Default for class
    
    if (classInfo.name) {
      // Structs default to public
      const isStruct = bodyNode.parent?.type === 'struct_specifier';
      currentVisibility = isStruct ? 'public' : 'private';
    }

    for (let i = 0; i < bodyNode.childCount; i++) {
      const child = bodyNode.child(i);
      if (!child) continue;

      switch (child.type) {
        case 'access_specifier':
          const accessText = child.text.replace(':', '').trim();
          if (['public', 'private', 'protected'].includes(accessText)) {
            currentVisibility = accessText as any;
          }
          break;

        case 'field_declaration':
          const member = this.parseFieldDeclaration(child, state.content, currentVisibility);
          if (member) {
            classInfo.members.push(member);
          }
          break;

        case 'function_definition':
        case 'declaration':
          // Handle method declarations with proper visibility
          const oldCurrentClass = state.context.currentClass;
          state.context.currentClass = classInfo.name;
          state.context.currentVisibility = currentVisibility;
          
          this.walkTree(child, state, depth + 1);
          
          state.context.currentClass = oldCurrentClass;
          break;
      }
    }
  }

  /**
   * Handle enum declarations including enum class
   */
  private handleEnum(node: Parser.SyntaxNode, state: any): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;
    
    const enumName = nameNode.text;
    const isEnumClass = node.text.trim().startsWith('enum class') || node.text.trim().startsWith('enum struct');
    const currentNamespace = state.context.namespaces.length > 0 ? state.context.namespaces.join('::') : undefined;
    
    // Extract enum values
    const enumValues: string[] = [];
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (child && child.type === 'enumerator') {
          const valueNameNode = child.childForFieldName('name');
          if (valueNameNode) {
            enumValues.push(valueNameNode.text);
          }
        }
      }
    }
    
    // Create enum info (treating as a special kind of class for now)
    const enumInfo: ClassInfo = {
      name: enumName,
      namespace: currentNamespace,
      baseClasses: [],
      interfaces: [],
      methods: [],
      members: enumValues.map(value => ({
        name: value,
        type: enumName,
        visibility: 'public' as const,
        isStatic: true,
        isConst: true,
        location: {
          line: nameNode.startPosition.row + 1,
          column: nameNode.startPosition.column + 1
        }
      })),
      isTemplate: false,
      isEnum: true,
      isEnumClass: isEnumClass,
      location: {
        line: nameNode.startPosition.row + 1,
        column: nameNode.startPosition.column + 1
      }
    };
    
    state.classes.push(enumInfo);
    
    // Also add enum values as individual exports if it's in an export namespace
    if (isEnumClass && enumValues.length > 0) {
      enumValues.forEach(value => {
        state.exports.push({
          symbol: `${enumName}::${value}`,
          type: 'enum_value',
          signature: `${enumName}::${value}`,
          location: {
            line: nameNode.startPosition.row + 1,
            column: nameNode.startPosition.column + 1
          }
        });
      });
    }
  }

  /**
   * Parse field declaration with enhanced type information
   */
  private parseFieldDeclaration(node: Parser.SyntaxNode, content: string, visibility: string): any {
    const typeNode = node.childForFieldName('type');
    const declaratorNode = node.childForFieldName('declarator');
    
    if (!typeNode || !declaratorNode) return null;

    const type = this.extractType(typeNode, content);
    const name = declaratorNode.text;

    return {
      name,
      type,
      visibility,
      isStatic: node.text.includes('static'),
      isConst: type.includes('const'),
      location: {
        line: declaratorNode.startPosition.row + 1,
        column: declaratorNode.startPosition.column + 1
      }
    };
  }
}

// Usage:
/*
const parser = new EnhancedTreeSitterParser();
await parser.initialize();
const moduleInfo = await parser.parseFile('/path/to/file.cpp');
// console.log(`Found ${moduleInfo.methods.length} methods and ${moduleInfo.classes.length} classes`);
*/