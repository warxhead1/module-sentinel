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
    
    this.walkTree(tree.rootNode, {
      content,
      filePath,
      context,
      methods,
      classes,
      includes
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
      exports: this.identifyExports(methods, classes)
    };
  }

  private walkTree(node: Parser.SyntaxNode, state: any): void {
    switch (node.type) {
      case 'namespace_definition':
        this.handleNamespace(node, state);
        break;
        
      case 'class_specifier':
      case 'struct_specifier':
        this.handleClass(node, state);
        break;
        
      case 'function_definition':
        this.handleFunction(node, state);
        break;
        
      case 'declaration':
        this.handleDeclaration(node, state);
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
    }
    
    // Continue walking the tree
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.walkTree(child, state);
      }
    }
  }

  private handleClass(node: Parser.SyntaxNode, state: any): void {
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
      namespace: state.context.namespaces.join('::'),
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
      this.extractClassMembersEnhanced(bodyNode, classInfo, state);
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
    
    // Check if it's a method or free function
    if (state.context.currentClass) {
      signature.className = state.context.currentClass;
    }
    
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

  private handleNamespace(node: Parser.SyntaxNode, state: any): void {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      state.context.namespaces.push(nameNode.text);
    }
    
    // Process namespace body
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        const child = bodyNode.child(i);
        if (child) {
          this.walkTree(child, state);
        }
      }
    }
    
    // Pop namespace when done
    if (nameNode) {
      state.context.namespaces.pop();
    }
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
      console.log(`📦 Found module declaration: ${moduleName}`);
      
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
      console.log(`📥 Found import declaration: ${moduleName}`);
      
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
      console.log(`🔍 Macro ${macroName} might define types`);
    } else if (macroBody.includes('(') && macroBody.includes(')')) {
      console.log(`🔍 Macro ${macroName} might define functions`);
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
    console.log(`🏷️  Type alias: ${aliasName} -> ${originalType}`);
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
        console.log(`🧬 Template instantiation: ${templateParts.base}<${templateParts.args.join(', ')}>`);
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
  private extractClassMembersEnhanced(bodyNode: Parser.SyntaxNode, classInfo: ClassInfo, state: any): void {
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
          
          this.walkTree(child, state);
          
          state.context.currentClass = oldCurrentClass;
          break;
      }
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
console.log(`Found ${moduleInfo.methods.length} methods and ${moduleInfo.classes.length} classes`);
*/