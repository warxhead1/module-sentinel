import Parser from 'tree-sitter';
import Cpp from 'tree-sitter-cpp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MethodSignature, ClassInfo, ParameterInfo } from '../types/essential-features.js';

// Re-export for convenience
export { MethodSignature, ClassInfo, ParameterInfo };

// Enhanced interface for tree-sitter parsing results
interface EnhancedParseResult {
  methods: MethodSignature[];
  classes: ClassInfo[];
  interfaces: ClassInfo[];
  patterns: any[];
  relationships: any[];
  imports: string[];
  exports: string[];
}

export class EnhancedTreeSitterParser {
  private parser: Parser;
  private initialized = false;
  
  constructor() {
    this.parser = new Parser();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Handle both static and dynamic imports of tree-sitter-cpp
      let cppLanguage;
      if (typeof Cpp === 'function') {
        cppLanguage = Cpp;
      } else if ((Cpp as any).default) {
        cppLanguage = (Cpp as any).default;
      } else {
        // Try dynamic import as fallback
        const treeSitterCpp = await import('tree-sitter-cpp');
        cppLanguage = (treeSitterCpp as any).default || treeSitterCpp;
      }
      
      this.parser.setLanguage(cppLanguage);
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize tree-sitter C++ parser: ${error}`);
    }
  }

  async parseFile(filePath: string): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    let content = await fs.readFile(filePath, 'utf-8');
    
    if (!content || content.trim().length === 0) {
      throw new Error(`File is empty or could not be read: ${filePath}`);
    }
    
    // Extract C++23 imports before preprocessing
    const extractedImports = this.extractModuleImports(content);
    
    // Calculate appropriate buffer size for tree-sitter
    const baseBufferSize = 1024 * 1024; // 1MB base
    const contentBufferSize = Math.max(baseBufferSize, content.length * 2); // At least 2x content size
    const maxBufferSize = 16 * 1024 * 1024; // 16MB max to prevent memory issues
    const bufferSize = Math.min(contentBufferSize, maxBufferSize);
    
    if (content.length > 512 * 1024) { // 512KB
      console.warn(`File ${filePath} is large (${Math.round(content.length / 1024)}KB), using ${Math.round(bufferSize / 1024)}KB buffer`);
    }
    
    let tree;
    try {
      // Use calculated buffer size for tree-sitter
      tree = this.parser.parse(content, undefined, { bufferSize });
    } catch (error) {
      // If parsing fails, try with preprocessing and larger buffer
      console.warn(`Initial parse failed for ${filePath}, trying with preprocessing...`);
      const processedContent = this.preprocessModuleSyntax(content);
      const preprocessBufferSize = Math.min(processedContent.length * 3, maxBufferSize);
      
      try {
        tree = this.parser.parse(processedContent, undefined, { bufferSize: preprocessBufferSize });
      } catch (preprocessError) {
        // Final attempt with maximum buffer size
        console.warn(`Preprocessing failed, trying with maximum buffer size...`);
        tree = this.parser.parse(processedContent, undefined, { bufferSize: maxBufferSize });
      }
    }
    
    if (!tree || !tree.rootNode) {
      throw new Error(`Failed to parse file: ${filePath}`);
    }
    
    // Initialize state object
    const state = {
      methods: [] as MethodSignature[],
      classes: [] as ClassInfo[],
      includes: [] as string[],
      imports: [] as string[],
      exports: new Set<string>(),
      context: {
        currentClass: undefined as string | undefined,
        namespaces: [] as string[],
        templates: new Map<string, string[]>(),
      },
      content: content
    };

    // Walk the tree to extract symbols
    this.walkTree(tree.rootNode, state);
    
    // Add extracted imports from preprocessing
    extractedImports.forEach(imp => state.imports.push(imp));

    // Deduplicate methods and classes before returning
    const uniqueMethods = this.deduplicateMethods(state.methods);
    const uniqueClasses = this.deduplicateClasses(state.classes);
    const includes = Array.from(state.includes);
    const imports = Array.from(state.imports);
    const exports = Array.from(state.exports);

    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods: uniqueMethods,
      classes: uniqueClasses,
      interfaces: this.identifyInterfaces(uniqueClasses),
      relationships: this.extractRelationshipsFromTree(tree.rootNode, content, uniqueMethods, uniqueClasses),
      patterns: this.extractPatterns(tree.rootNode, content),
      imports: imports,
      exports: [...this.identifyExports(uniqueMethods, uniqueClasses), ...exports]
    };
  }

  private walkTree(node: Parser.SyntaxNode, state: any, depth: number = 0): void {
    if (depth > 100) return;
    
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
      case 'preproc_include':
        this.handleInclude(node, state);
        break;
    }

    // CRITICAL FIX: Check for qualified method implementations that tree-sitter might miss
    this.detectQualifiedMethodImplementations(node, state);

    // Continue walking
    for (let i = 0; i < node.childCount; i++) {
      this.walkTree(node.child(i)!, state, depth + 1);
    }
  }

  private handleNamespace(node: Parser.SyntaxNode, state: any, depth: number): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const namespaceName = nameNode.text;
    state.context.namespaces.push(namespaceName);

    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      for (let i = 0; i < bodyNode.childCount; i++) {
        this.walkTree(bodyNode.child(i)!, state, depth + 1);
      }
    }

    state.context.namespaces.pop();
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
    
    // Set visibility and namespace
    signature.visibility = 'public'; // Default for free functions
    signature.namespace = state.context.namespaces.length > 0 ? state.context.namespaces.join('::') : undefined;
    
    // Check if it's a method or free function
    if (state.context.currentClass) {
      signature.className = state.context.currentClass;
      signature.qualifiedName = `${state.context.currentClass}::${signature.name}`;
    } else {
      signature.qualifiedName = signature.name;
    }
    
    state.methods.push(signature);
  }

  private handleDeclaration(node: Parser.SyntaxNode, state: any): void {
    // Handle various declarations
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === 'function_declarator') {
        // Function declaration without body
        const signature = this.parseFunctionDeclarator(child, state.content);
        if (signature) {
          signature.visibility = 'public';
          signature.namespace = state.context.namespaces.length > 0 ? state.context.namespaces.join('::') : undefined;
          
          if (state.context.currentClass) {
            signature.className = state.context.currentClass;
            signature.qualifiedName = `${state.context.currentClass}::${signature.name}`;
          } else {
            signature.qualifiedName = signature.name;
          }
          
          state.methods.push(signature);
        }
      }
    }
  }

  private handleInclude(node: Parser.SyntaxNode, state: any): void {
    const pathNode = node.childForFieldName('path');
    if (pathNode) {
      const includePath = pathNode.text.replace(/[<>"]/g, '');
      state.includes.push(includePath);
    }
  }

  private parseFunctionDeclarator(node: Parser.SyntaxNode, content: string): MethodSignature | null {
    let nameNode: Parser.SyntaxNode | null = null;
    let parametersNode: Parser.SyntaxNode | null = null;
    
    // Navigate through potential pointer declarators
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === 'function_declarator') {
        const declarator = current.childForFieldName('declarator');
        if (declarator?.type === 'identifier') {
          nameNode = declarator;
          parametersNode = current.childForFieldName('parameters');
          break;
        }
        current = declarator;
      } else if (current.type === 'identifier') {
        nameNode = current;
        parametersNode = node.childForFieldName('parameters');
        break;
      } else {
        break;
      }
    }

    if (!nameNode) return null;

    const parameters: ParameterInfo[] = [];
    if (parametersNode) {
      for (let i = 0; i < parametersNode.childCount; i++) {
        const paramNode = parametersNode.child(i)!;
        if (paramNode.type === 'parameter_declaration') {
          const param = this.parseParameter(paramNode, content);
          if (param) parameters.push(param);
        }
      }
    }

    return {
      name: nameNode.text,
      parameters,
      returnType: 'void', // Will be set by caller
      visibility: 'public',
      isVirtual: false,
      isStatic: false,
      isConst: false,
      location: {
        line: nameNode.startPosition.row + 1,
        column: nameNode.startPosition.column + 1
      }
    };
  }

  private parseParameter(node: Parser.SyntaxNode, content: string): ParameterInfo | null {
    const typeNode = node.childForFieldName('type');
    const declaratorNode = node.childForFieldName('declarator');
    
    if (!typeNode) return null;
    
    const type = this.extractType(typeNode, content);
    let name = '';
    
    if (declaratorNode) {
      name = this.extractDeclaratorName(declaratorNode, content);
    }
    
    return {
      name,
      type,
      defaultValue: undefined,
      isConst: false,
      isReference: false,
      isPointer: false
    };
  }

  private extractType(node: Parser.SyntaxNode, content: string): string {
    return content.slice(node.startIndex, node.endIndex).trim();
  }

  private extractDeclaratorName(node: Parser.SyntaxNode, content: string): string {
    if (node.type === 'identifier') {
      return node.text;
    }
    
    // Handle pointer declarators, etc.
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === 'identifier') {
        return child.text;
      }
    }
    
    return '';
  }

  private extractBaseClasses(node: Parser.SyntaxNode, content: string): string[] {
    const baseClasses: string[] = [];
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)!;
      if (child.type === 'type_identifier') {
        baseClasses.push(child.text);
      }
    }
    
    return baseClasses;
  }

  private extractClassMembersEnhanced(bodyNode: Parser.SyntaxNode, classInfo: ClassInfo, state: any, depth: number): void {
    // Walk through class body to find methods and members
    for (let i = 0; i < bodyNode.childCount; i++) {
      this.walkTree(bodyNode.child(i)!, state, depth + 1);
    }
  }

  private identifyInterfaces(classes: ClassInfo[]): ClassInfo[] {
    return classes.filter(c => {
      // Simple heuristic: class with only pure virtual methods
      return c.name.startsWith('I') && c.methods.every(m => m.isVirtual);
    });
  }

  private identifyExports(methods: MethodSignature[], classes: ClassInfo[]): string[] {
    const exports: string[] = [];
    exports.push(...methods.map(m => m.name));
    exports.push(...classes.map(c => c.name));
    return exports;
  }

  private extractPatterns(root: Parser.SyntaxNode, content: string): any[] {
    const patterns: any[] = [];
    // Basic pattern detection - can be enhanced
    return patterns;
  }

  // NEW: Enhanced relationship extraction
  private extractRelationshipsFromTree(root: Parser.SyntaxNode, content: string, methods: MethodSignature[], classes: ClassInfo[]): any[] {
    const relationships: any[] = [];
    const contentLines = content.split('\n');
    
    // Add inheritance relationships from classes
    for (const cls of classes) {
      for (const baseClass of cls.baseClasses || []) {
        relationships.push({
          from: cls.name,
          to: baseClass,
          type: 'inherits',
          confidence: 0.95
        });
      }
    }
    
    // Extract method call relationships by analyzing method bodies
    for (const method of methods) {
      if (!method.location) continue; // Allow both class methods and global functions
      
      // Find the method's body in the source code
      const methodRelationships = this.extractMethodCallRelationships(
        method, content, contentLines, methods, classes
      );
      relationships.push(...methodRelationships);
    }
    
    return relationships;
  }
  
  private extractMethodCallRelationships(
    sourceMethod: MethodSignature, 
    content: string, 
    contentLines: string[], 
    allMethods: MethodSignature[], 
    allClasses: ClassInfo[]
  ): any[] {
    const relationships: any[] = [];
    
    // Find method body boundaries (crude but effective for C++)
    const startLine = sourceMethod.location.line;
    const methodBodyStart = this.findMethodBodyStart(contentLines, startLine);
    const methodBodyEnd = this.findMethodBodyEnd(contentLines, methodBodyStart);
    
    if (methodBodyStart === -1 || methodBodyEnd === -1) return relationships;
    
    // Analyze each line in the method body for function calls
    for (let lineNum = methodBodyStart; lineNum <= methodBodyEnd; lineNum++) {
      const line = contentLines[lineNum] || '';
      const calls = this.extractCallsFromLine(line, lineNum + 1);
      
      for (const call of calls) {
        // Find matching methods
        const targets = this.findMatchingMethods(call, allMethods, sourceMethod.className || '');
        
        for (const target of targets) {
          relationships.push({
            from: sourceMethod.name,
            to: target.name,
            type: 'calls',
            confidence: target.confidence
          });
        }
      }
    }
    
    return relationships;
  }
  
  public findMethodBodyStart(contentLines: string[], methodStartLine: number): number {
    // Handle C++ constructor initialization lists and method bodies accurately
    let foundOpenBrace = false;
    let braceLineIndex = -1;
    
    // Look for opening brace, but be smarter about constructor initialization lists
    for (let i = methodStartLine - 1; i < Math.min(contentLines.length, methodStartLine + 15); i++) {
      const line = contentLines[i] || '';
      
      if (line.includes('{')) {
        braceLineIndex = i;
        foundOpenBrace = true;
        
        // Check if this is just an empty method body: {}
        if (line.trim().endsWith('{}')) {
          // Empty method body - no actual body to analyze
          return -1;
        }
        
        // Check if opening and closing brace are on the same line (single-line method)
        const openBraceIndex = line.indexOf('{');
        const closeBraceIndex = line.indexOf('}', openBraceIndex + 1);
        if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
          // Single-line method body like: { return value; }
          return i; // Include this line as the only body line
        }
        
        // Multi-line method body - return line after opening brace
        return i + 1;
      }
    }
    
    return -1;
  }
  
  public findMethodBodyEnd(contentLines: string[], bodyStartLine: number): number {
    if (bodyStartLine === -1) return -1;
    
    const startLine = contentLines[bodyStartLine] || '';
    
    // Check if this is a single-line method (opening and closing brace on same line)
    const openBraceIndex = startLine.indexOf('{');
    const closeBraceIndex = startLine.indexOf('}', openBraceIndex + 1);
    if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
      // Single-line method - start and end are the same line
      return bodyStartLine;
    }
    
    // Multi-line method - find matching closing brace
    let braceCount = 0;
    let foundFirstBrace = false;
    
    for (let i = bodyStartLine; i < contentLines.length; i++) {
      const line = contentLines[i] || '';
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundFirstBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundFirstBrace && braceCount === 0) {
            return i;
          }
        }
      }
    }
    
    return -1;
  }
  
  public extractCallsFromLine(line: string, lineNumber: number): Array<{pattern: string, methodName: string, objectName?: string, lineNumber: number}> {
    const calls: Array<{pattern: string, methodName: string, objectName?: string, lineNumber: number}> = [];
    
    // Pattern 1: object.method() or object->method()
    const memberCallRegex = /(\w+)(?:\.|\->)(\w+)\s*\(/g;
    let match;
    while ((match = memberCallRegex.exec(line)) !== null) {
      calls.push({
        pattern: `${match[1]}.${match[2]}()`,
        methodName: match[2],
        objectName: match[1],
        lineNumber: lineNumber
      });
    }
    
    // Pattern 2: Direct method calls: method()
    const directCallRegex = /(?<![.\w])(\w+)\s*\(/g;
    while ((match = directCallRegex.exec(line)) !== null) {
      const methodName = match[1];
      
      // Skip common C++ keywords and operators
      if (['if', 'for', 'while', 'switch', 'return', 'throw', 'catch', 'sizeof', 'typeof', 'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast'].includes(methodName)) {
        continue;
      }
      
      // Skip if it's already captured as a member call
      const alreadyCaptured = calls.some(call => call.methodName === methodName && call.lineNumber === lineNumber);
      if (!alreadyCaptured) {
        calls.push({
          pattern: `${methodName}()`,
          methodName: methodName,
          lineNumber: lineNumber
        });
      }
    }
    
    return calls;
  }
  
  private findMatchingMethods(
    call: {pattern: string, methodName: string, objectName?: string, lineNumber: number}, 
    allMethods: MethodSignature[], 
    sourceClassName: string
  ): Array<{name: string, className: string | undefined, confidence: number}> {
    const matches: Array<{name: string, className: string | undefined, confidence: number}> = [];
    
    // Find methods with matching names, but exclude duplicates
    const candidateMethods = allMethods.filter(method => method.name === call.methodName);
    
    // Deduplicate candidates by preferring class methods over global duplicates
    const uniqueCandidates = new Map<string, MethodSignature>();
    for (const method of candidateMethods) {
      const key = `${method.name}::${method.location?.line || 0}::${method.parameters?.length || 0}`;
      
      if (!uniqueCandidates.has(key)) {
        uniqueCandidates.set(key, method);
      } else {
        // Prefer class method over global method for same location
        const existing = uniqueCandidates.get(key)!;
        if (method.className && !existing.className) {
          uniqueCandidates.set(key, method);
        }
      }
    }
    
    for (const method of uniqueCandidates.values()) {
      // Skip self-references unless it's a legitimate recursive call
      if (method.className === sourceClassName && method.name === call.methodName) {
        // Only allow recursive calls if there's clear evidence (e.g., parameters, conditional context)
        // For now, skip all self-references to avoid false positives
        continue;
      }
      
      let confidence = 0.5; // Base confidence
      
      // Same class methods get highest confidence
      if (method.className === sourceClassName) {
        confidence = 0.9;
      }
      // Methods in other classes get medium confidence
      else if (method.className) {
        confidence = 0.7;
      }
      // Global functions get lowest confidence
      else {
        confidence = 0.4;
      }
      
      // If this is a member call (object.method), try to match object type
      if (call.objectName && method.className) {
        // TODO: Could enhance this by tracking member variable types
        confidence *= 0.8; // Slightly lower confidence for member calls without type info
      }
      
      matches.push({
        name: method.name,
        className: method.className,
        confidence: confidence
      });
    }
    
    return matches;
  }

  private preprocessModuleSyntax(content: string): string {
    // Handle C++23 module syntax that tree-sitter-cpp might not support
    let processed = content;
    
    // Convert module declaration to comment to avoid parsing errors
    processed = processed.replace(/^module;/gm, '// module;');
    processed = processed.replace(/^export module\s+([^;]+);/gm, '// export module $1;');
    processed = processed.replace(/^import\s+([^;]+);/gm, '// import $1;');
    
    // Handle C++20/23 features that might cause issues
    processed = processed.replace(/\bexport\s+namespace\b/g, 'namespace');
    processed = processed.replace(/\bexport\s+(?=class|struct|enum|template)/g, '');
    
    // Handle concepts syntax more aggressively
    processed = processed.replace(/\brequires\s*\([^)]+\)\s*\{[^}]+\}/g, 'true');
    processed = processed.replace(/\bif\s+constexpr\s*\(/g, 'if (');
    processed = processed.replace(/\bconstexpr\s+(?=if|for|while)/g, '');
    
    // Handle template syntax that might be problematic
    processed = processed.replace(/template<typename\s+(\w+)>/g, 'template<class $1>');
    processed = processed.replace(/template<.*?requires.*?>/g, 'template<class T>');
    
    // Handle lambda expressions that might cause issues
    processed = processed.replace(/\[\s*\]\s*\([^)]*\)\s*mutable/g, '[](auto)');
    processed = processed.replace(/\[\s*=\s*\]\s*\([^)]*\)/g, '[=](auto)');
    
    // Handle auto return types that might be problematic
    processed = processed.replace(/\->\s*auto\s*\{/g, '-> void {');
    
    // Handle C++20 spaceship operator
    processed = processed.replace(/<=>/g, '== 0 ? 0 : 1');
    
    // Handle designated initializers that might cause issues
    processed = processed.replace(/\{\s*\.\w+\s*=/g, '{');
    
    // Handle attribute syntax
    processed = processed.replace(/\[\[.*?\]\]/g, '');
    
    return processed;
  }

  private deduplicateMethods(methods: MethodSignature[]): MethodSignature[] {
    const uniqueMethods = new Map<string, MethodSignature>();
    
    for (const method of methods) {
      // Create a unique key based on method signature and location
      const key = `${method.className || 'global'}::${method.name}::${method.location?.line || 0}::${method.parameters?.length || 0}`;
      
      if (!uniqueMethods.has(key)) {
        uniqueMethods.set(key, method);
      } else {
        // If duplicate, prefer the one with className over global
        const existing = uniqueMethods.get(key)!;
        if (method.className && !existing.className) {
          uniqueMethods.set(key, method);
        }
      }
    }
    
    return Array.from(uniqueMethods.values());
  }

  private deduplicateClasses(classes: ClassInfo[]): ClassInfo[] {
    const uniqueClasses = new Map<string, ClassInfo>();
    
    for (const cls of classes) {
      // Create a unique key based on class name and location
      const key = `${cls.name}::${cls.location?.line || 0}`;
      
      if (!uniqueClasses.has(key)) {
        uniqueClasses.set(key, cls);
      }
    }
    
    return Array.from(uniqueClasses.values());
  }

  /**
   * CRITICAL FIX: Detect qualified method implementations that tree-sitter might miss
   * This is essential for C++23 module files where class definitions and implementations are separate
   */
  private detectQualifiedMethodImplementations(node: Parser.SyntaxNode, state: any): void {
    const nodeText = node.text;
    
    // Look for qualified method implementations: ClassName::methodName(...) {
    const qualifiedMethodRegex = /([a-zA-Z_][a-zA-Z0-9_:]*)::(~?[a-zA-Z_][a-zA-Z0-9_]*?)\s*\([^)]*\)\s*(?:const\s*)?\s*\{/g;
    
    let match;
    while ((match = qualifiedMethodRegex.exec(nodeText)) !== null) {
      const fullQualifiedName = match[1];
      const methodName = match[2];
      
      // Extract the class name (last part of qualified name)
      const nameParts = fullQualifiedName.split('::');
      const className = nameParts[nameParts.length - 1];
      const namespace = nameParts.length > 1 ? nameParts.slice(0, -1).join('::') : undefined;
      
      // Find the method location in the source
      const methodStart = node.startIndex + match.index;
      const methodPos = this.getLineColumnFromIndex(state.content, methodStart);
      
      // Extract return type (look backwards from the match)
      const beforeMatch = state.content.substring(Math.max(0, methodStart - 200), methodStart);
      const returnType = this.extractReturnTypeFromPrecedingText(beforeMatch, methodName);
      
      // Extract parameters from the matched text
      const paramMatch = match[0].match(/\(([^)]*)\)/);
      const parameters = paramMatch ? this.parseParametersFromString(paramMatch[1]) : [];
      
      const signature: MethodSignature = {
        name: methodName,
        className: className,
        qualifiedName: `${className}::${methodName}`,
        parameters: parameters,
        returnType: returnType || 'auto',
        visibility: 'public' as const,
        isVirtual: false,
        isStatic: false,
        isConst: match[0].includes('const'),
        namespace: namespace,
        location: methodPos
      };
      
      // Check if we already have this method to avoid duplicates
      const existingMethod = state.methods.find((m: MethodSignature) => 
        m.name === methodName && 
        m.className === className && 
        Math.abs((m.location?.line || 0) - (methodPos.line || 0)) < 3
      );
      
      if (!existingMethod) {
        state.methods.push(signature);
      }
    }
  }
  
  /**
   * Convert byte index to line/column position
   */
  private getLineColumnFromIndex(content: string, index: number): { line: number; column: number } {
    const beforeIndex = content.substring(0, index);
    const lines = beforeIndex.split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }
  
  /**
   * Extract return type from text preceding a method implementation
   */
  private extractReturnTypeFromPrecedingText(text: string, methodName: string): string {
    // Look for return type patterns before the qualified method name
    const lines = text.split('\n');
    const lastLine = lines[lines.length - 1];
    
    // Common patterns:
    // "bool ClassName::methodName" -> "bool"
    // "void ClassName::methodName" -> "void"
    // "std::unique_ptr<Type> ClassName::methodName" -> "std::unique_ptr<Type>"
    const returnTypeMatch = lastLine.match(/^\s*([^\s]+(?:\s*<[^>]+>)?(?:\s*[*&]*)?)\s+[a-zA-Z_][a-zA-Z0-9_:]*::[a-zA-Z_]/);
    
    if (returnTypeMatch) {
      return returnTypeMatch[1].trim();
    }
    
    // Fallback: look for common return types
    if (lastLine.includes('bool')) return 'bool';
    if (lastLine.includes('void')) return 'void';
    if (lastLine.includes('int')) return 'int';
    if (lastLine.includes('float')) return 'float';
    if (lastLine.includes('double')) return 'double';
    if (lastLine.includes('size_t')) return 'size_t';
    if (lastLine.includes('uint32_t')) return 'uint32_t';
    
    return 'auto'; // Default fallback
  }
  
  /**
   * Parse parameters from parameter string
   */
  private parseParametersFromString(paramStr: string): ParameterInfo[] {
    if (!paramStr.trim()) return [];
    
    const parameters: ParameterInfo[] = [];
    const paramTokens = paramStr.split(',');
    
    for (const token of paramTokens) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      
      // Basic parameter parsing: "type name" or "type name = default"
      const paramMatch = trimmed.match(/^(.+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*(.+))?$/);
      
      if (paramMatch) {
        parameters.push({
          name: paramMatch[2],
          type: paramMatch[1].trim(),
          defaultValue: paramMatch[3]?.trim(),
          isConst: trimmed.includes('const'),
          isReference: trimmed.includes('&'),
          isPointer: trimmed.includes('*')
        });
      } else {
        // Fallback for complex types
        parameters.push({
          name: `param${parameters.length}`,
          type: trimmed,
          isConst: trimmed.includes('const'),
          isReference: trimmed.includes('&'),
          isPointer: trimmed.includes('*')
        });
      }
    }
    
    return parameters;
  }
  
  /**
   * Extract C++23 module imports from source code
   */
  private extractModuleImports(content: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Match C++23 import statements: "import ModuleName;"
      const importMatch = trimmedLine.match(/^import\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/);
      if (importMatch) {
        imports.push(importMatch[1]);
      }
      
      // Also match import with partition: "import ModuleName:PartitionName;"
      const importPartitionMatch = trimmedLine.match(/^import\s+([a-zA-Z_][a-zA-Z0-9_.]*):([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/);
      if (importPartitionMatch) {
        imports.push(`${importPartitionMatch[1]}:${importPartitionMatch[2]}`);
      }
    }
    
    return imports;
  }
}