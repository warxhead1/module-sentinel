import Parser from 'tree-sitter';
import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';
import { 
  MethodSignature, 
  ClassInfo,
  ParameterInfo,
  EnhancedModuleInfo,
  DetailedExport,
  DetailedImport,
  InterfaceInfo,
  SymbolRelationship,
  CodePattern,
  MemberInfo
} from '../types/essential-features.js';

interface TypeLocation {
  symbol: string;
  filePath: string;
  line: number;
  confidence: number;
  kind: string;
}

interface ChunkInfo {
  start: number;
  end: number;
  content: string;
  overlaps: boolean;
}

/**
 * Database-aware Tree-sitter Parser
 * 
 * This enhanced parser:
 * - Handles large files through intelligent chunking
 * - Resolves types across files using the indexed database
 * - Builds a comprehensive understanding of the codebase
 * - Maintains context across chunks
 */
export class DatabaseAwareTreeSitterParser {
  private parser: Parser;
  private cpp: any;
  private db: Database.Database | null = null;
  private typeCache: Map<string, TypeLocation[]> = new Map();
  private projectPath: string;
  private debugMode: boolean = false;
  
  // Chunk size configuration
  private readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks (lowered to handle problematic files)
  private readonly OVERLAP_SIZE = 4 * 1024; // 4KB overlap to maintain context

  constructor(projectPath: string, dbPath?: string, debugMode: boolean = false) {
    this.parser = new Parser();
    this.debugMode = debugMode;
    this.projectPath = projectPath;
    if (dbPath) {
      this.db = new Database(dbPath);
    }
  }

  async initialize(): Promise<void> {
    // Load tree-sitter-cpp
    try {
      const treeSitterCpp = await import('tree-sitter-cpp');
      this.cpp = treeSitterCpp.default;
      this.parser.setLanguage(this.cpp);
    } catch (error) {
      throw new Error('Failed to load tree-sitter-cpp: ' + error);
    }
    
    // Pre-populate type cache from database if available
    if (this.db) {
      this.populateTypeCache();
    }
  }

  private populateTypeCache(): void {
    if (!this.db) return;
    
    try {
      // Query for all type definitions (classes, typedefs, structs)
      const types = this.db.prepare(`
        SELECT 
          name,
          file_path,
          line,
          parser_confidence,
          kind
        FROM enhanced_symbols
        WHERE kind IN ('class', 'struct', 'typedef', 'type_alias', 'enum')
        ORDER BY parser_confidence DESC
      `).all() as Array<{
        name: string;
        file_path: string;
        line: number;
        parser_confidence: number;
        kind: string;
      }>;
      
      for (const type of types) {
        const location: TypeLocation = {
          symbol: type.name,
          filePath: type.file_path,
          line: type.line,
          confidence: type.parser_confidence,
          kind: type.kind
        };
        
        if (!this.typeCache.has(type.name)) {
          this.typeCache.set(type.name, []);
        }
        this.typeCache.get(type.name)!.push(location);
      }
      
      console.log(`Populated type cache with ${this.typeCache.size} unique types`);
    } catch (error) {
      console.warn('Failed to populate type cache:', error);
    }
  }

  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error(`File content is empty or invalid: ${filePath}`);
    }
    
    if (content.includes('\0')) {
      throw new Error(`File contains null bytes which cannot be parsed: ${filePath}`);
    }
    
    // For smaller files, use regular parsing
    if (content.length <= this.CHUNK_SIZE) {
      return this.parseContent(content, filePath);
    }
    
    // For larger files, use chunked parsing
    console.log(`File ${filePath} is large (${Math.round(content.length / 1024)}KB), using chunked parsing`);
    return this.parseChunked(content, filePath);
  }

  private async parseContent(content: string, filePath: string): Promise<EnhancedModuleInfo> {
    let tree;
    try {
      // Use larger buffer size to handle large files (tree-sitter default is 32KB)
      const bufferSize = Math.max(262144, content.length + 1024); // At least 256KB, or file size + buffer
      tree = this.parser.parse(content, undefined, { bufferSize });
    } catch (error) {
      // If tree-sitter fails on the full content, fall back to chunked parsing
      console.warn(`Tree-sitter failed on full content, falling back to chunked parsing: ${error}`);
      return this.parseChunked(content, filePath);
    }
    
    if (!tree || !tree.rootNode) {
      throw new Error(`Tree-sitter produced invalid parse tree for ${filePath}`);
    }
    
    const context = {
      namespaces: [] as string[],
      currentClass: undefined as string | undefined,
      templates: new Map<string, string[]>(),
      unresolvedTypes: new Set<string>()
    };
    
    const methods: MethodSignature[] = [];
    const classes: ClassInfo[] = [];
    const includes: DetailedImport[] = [];
    
    // Clear and set current parsing context for relationship extraction
    this.currentMethods = methods;
    this.currentClasses = classes;
    
    this.walkTree(tree.rootNode, {
      content,
      filePath,
      context,
      methods,
      classes,
      includes
    });
    
    // Resolve any unresolved types using the database
    await this.resolveTypes(context.unresolvedTypes, filePath);
    
    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods,
      classes,
      interfaces: this.identifyInterfaces(classes),
      relationships: this.extractRelationships(tree.rootNode, content),
      patterns: this.extractPatterns(tree.rootNode, content),
      imports: includes,
      exports: this.identifyExports(methods, classes).map(name => ({
        symbol: name,
        type: 'function' as const,
        location: { line: 0, column: 0 }
      }))
    };
  }

  private async parseChunked(content: string, filePath: string): Promise<EnhancedModuleInfo> {
    const chunks = this.createChunks(content);
    const allMethods: MethodSignature[] = [];
    const allClasses: ClassInfo[] = [];
    const allIncludes: DetailedImport[] = [];
    const globalContext = {
      namespaces: [] as string[],
      currentClass: undefined as string | undefined,
      templates: new Map<string, string[]>(),
      unresolvedTypes: new Set<string>()
    };
    
    // Set current parsing context for relationship extraction
    this.currentMethods = allMethods;
    this.currentClasses = allClasses;
    
    for (const chunk of chunks) {
      try {
        // Use proper buffer size for each chunk
        const bufferSize = Math.max(262144, chunk.content.length + 1024);
        const tree = this.parser.parse(chunk.content, undefined, { bufferSize });
        
        if (!tree || !tree.rootNode) {
          console.warn(`Failed to parse chunk ${chunk.start}-${chunk.end}`);
          continue;
        }
        
        const chunkMethods: MethodSignature[] = [];
        const chunkClasses: ClassInfo[] = [];
        const chunkIncludes: DetailedImport[] = [];
        
        this.walkTree(tree.rootNode, {
          content: chunk.content,
          filePath,
          context: globalContext,
          methods: chunkMethods,
          classes: chunkClasses,
          includes: chunkIncludes,
          chunkOffset: chunk.start
        });
        
        // Merge results, avoiding duplicates from overlapping regions
        if (!chunk.overlaps) {
          allMethods.push(...chunkMethods);
          allClasses.push(...chunkClasses);
          allIncludes.push(...chunkIncludes);
        } else {
          // For overlapping chunks, deduplicate based on position
          this.mergeChunkResults(
            { methods: allMethods, classes: allClasses, includes: allIncludes },
            { methods: chunkMethods, classes: chunkClasses, includes: chunkIncludes },
            chunk.start
          );
        }
      } catch (error) {
        console.warn(`Error parsing chunk ${chunk.start}-${chunk.end}:`, error);
      }
    }
    
    // Resolve unresolved types
    await this.resolveTypes(globalContext.unresolvedTypes, filePath);
    
    return {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      methods: allMethods,
      classes: allClasses,
      interfaces: this.identifyInterfaces(allClasses),
      relationships: [], // Would need to be extracted differently for chunks
      patterns: [], // Would need to be extracted differently for chunks
      imports: allIncludes,
      exports: this.identifyExports(allMethods, allClasses).map(name => ({
        symbol: name,
        type: 'function' as const,
        location: { line: 0, column: 0 }
      }))
    };
  }

  private createChunks(content: string): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    let currentPos = 0;
    
    while (currentPos < content.length) {
      const chunkStart = currentPos;
      let chunkEnd = Math.min(currentPos + this.CHUNK_SIZE, content.length);
      
      // Try to end chunk at a natural boundary (end of line or statement)
      if (chunkEnd < content.length) {
        const searchEnd = Math.min(chunkEnd + 1024, content.length);
        const nextNewline = content.indexOf('\n', chunkEnd);
        const nextSemicolon = content.indexOf(';', chunkEnd);
        const nextBrace = content.indexOf('}', chunkEnd);
        
        const boundaries = [nextNewline, nextSemicolon, nextBrace]
          .filter(pos => pos !== -1 && pos <= searchEnd);
        
        if (boundaries.length > 0) {
          chunkEnd = Math.min(...boundaries) + 1;
        }
      }
      
      chunks.push({
        start: chunkStart,
        end: chunkEnd,
        content: content.substring(chunkStart, chunkEnd),
        overlaps: false
      });
      
      // Add overlapping chunk if not at end
      if (chunkEnd < content.length) {
        const overlapStart = Math.max(0, chunkEnd - this.OVERLAP_SIZE);
        const overlapEnd = Math.min(chunkEnd + this.OVERLAP_SIZE, content.length);
        
        chunks.push({
          start: overlapStart,
          end: overlapEnd,
          content: content.substring(overlapStart, overlapEnd),
          overlaps: true
        });
      }
      
      currentPos = chunkEnd;
    }
    
    return chunks;
  }

  private async resolveTypes(unresolvedTypes: Set<string>, currentFile: string): Promise<void> {
    for (const typeName of unresolvedTypes) {
      const locations = this.typeCache.get(typeName);
      
      if (locations && locations.length > 0) {
        // Found in cache
        if (this.debugMode) {
          console.log(`Type '${typeName}' found in ${locations.length} location(s):`);
          for (const loc of locations.slice(0, 3)) { // Show top 3
            console.log(`  - ${loc.filePath}:${loc.line} (${loc.kind}, confidence: ${loc.confidence})`);
          }
        }
      } else if (this.db) {
        // Try to find in database
        const result = this.db.prepare(`
          SELECT 
            name,
            file_path,
            line,
            parser_confidence,
            kind
          FROM enhanced_symbols
          WHERE name = ?
          AND kind IN ('class', 'struct', 'typedef', 'type_alias', 'enum')
          ORDER BY parser_confidence DESC
          LIMIT 5
        `).all(typeName) as Array<{
          name: string;
          file_path: string;
          line: number;
          parser_confidence: number;
          kind: string;
        }>;
        
        if (result.length > 0) {
          console.log(`Type '${typeName}' found in database:`);
          for (const row of result) {
            console.log(`  - ${row.file_path}:${row.line} (${row.kind})`);
          }
          
          // Add to cache
          this.typeCache.set(typeName, result.map(r => ({
            symbol: r.name,
            filePath: r.file_path,
            line: r.line,
            confidence: r.parser_confidence,
            kind: r.kind
          })));
        } else {
          if (this.debugMode) console.log(`Type '${typeName}' not found in database`);
        }
      }
    }
  }

  private walkTree(node: any, context: any): void {
    // Track unresolved types
    if (node.type === 'type_identifier' || node.type === 'qualified_identifier') {
      const typeName = context.content.substring(node.startIndex, node.endIndex);
      if (!this.isBuiltinType(typeName) && !this.isStdType(typeName)) {
        context.context.unresolvedTypes.add(typeName);
      }
    }
    
    // Rest of the tree walking logic (similar to EnhancedTreeSitterParser)
    switch (node.type) {
      case 'class_specifier':
      case 'struct_specifier':
        this.extractClass(node, context);
        break;
      case 'function_definition':
      case 'function_declarator':
        this.extractMethod(node, context);
        break;
      case 'preproc_include':
        this.extractInclude(node, context);
        break;
      case 'namespace_definition':
        this.handleNamespace(node, context);
        break;
    }
    
    // Recursively walk children
    for (const child of node.children) {
      this.walkTree(child, context);
    }
  }

  private isBuiltinType(typeName: string): boolean {
    const builtinTypes = new Set([
      'void', 'bool', 'char', 'short', 'int', 'long', 'float', 'double',
      'signed', 'unsigned', 'const', 'volatile', 'static', 'extern',
      'auto', 'register', 'size_t', 'ptrdiff_t', 'nullptr_t',
      'int8_t', 'int16_t', 'int32_t', 'int64_t',
      'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t'
    ]);
    return builtinTypes.has(typeName);
  }

  private isStdType(typeName: string): boolean {
    return typeName.startsWith('std::') || 
           typeName === 'string' || 
           typeName === 'vector' ||
           typeName === 'map' ||
           typeName === 'set' ||
           typeName === 'unique_ptr' ||
           typeName === 'shared_ptr';
  }

  private mergeChunkResults(
    target: { methods: MethodSignature[], classes: ClassInfo[], includes: DetailedImport[] },
    source: { methods: MethodSignature[], classes: ClassInfo[], includes: DetailedImport[] },
    overlapStart: number
  ): void {
    // Simple deduplication based on name and approximate position
    for (const method of source.methods) {
      const exists = target.methods.some(m => 
        m.name === method.name && 
        Math.abs((m.location?.line || 0) - (method.location?.line || 0)) < 5
      );
      if (!exists) {
        target.methods.push(method);
      }
    }
    
    for (const cls of source.classes) {
      const exists = target.classes.some(c => 
        c.name === cls.name &&
        c.namespace === cls.namespace
      );
      if (!exists) {
        target.classes.push(cls);
      }
    }
    
    // Includes are usually at the top, so less likely to be duplicated
    target.includes.push(...source.includes);
  }

  private extractClass(node: any, context: any): void {
    const className = this.getNodeText(node.childForFieldName('name'), context.content, context);
    if (!className) return;
    
    const baseClasses: string[] = [];
    const baseClause = node.childForFieldName('base_clause');
    if (baseClause) {
      for (const child of baseClause.children) {
        if (child.type === 'base_specifier') {
          const baseName = this.getNodeText(child, context.content, context);
          if (baseName) baseClasses.push(baseName);
        }
      }
    }
    
    const classInfo: ClassInfo = {
      name: className,
      namespace: context.context.namespaces.join('::'),
      baseClasses,
      interfaces: [],
      methods: [],
      members: [],
      isTemplate: false,
      templateParams: [],
      location: { line: this.getLineNumber(node, context.content), column: 0 }
    };
    
    // Track current class for method extraction
    const previousClass = context.context.currentClass;
    context.context.currentClass = className;
    
    // Extract class body
    const classBody = node.childForFieldName('body');
    if (classBody) {
      this.walkTree(classBody, context);
    }
    
    context.context.currentClass = previousClass;
    context.classes.push(classInfo);
  }

  private extractMethod(node: any, context: any): void {
    const declarator = node.childForFieldName('declarator');
    if (!declarator) return;
    
    const methodName = this.getMethodName(declarator, context.content, context);
    if (!methodName) return;
    
    const returnType = this.getNodeText(node.childForFieldName('type'), context.content, context) || 'void';
    const parameters = this.extractParameters(declarator, context.content, context);
    
    const method: MethodSignature = {
      name: methodName,
      returnType,
      parameters,
      className: context.context.currentClass,
      visibility: 'public',
      isVirtual: this.hasQualifier(node, 'virtual'),
      isStatic: this.hasQualifier(node, 'static'),
      isConst: this.hasQualifier(declarator, 'const'),
      location: { line: this.getLineNumber(node, context.content), column: 0 }
    };
    
    context.methods.push(method);
  }

  private extractInclude(node: any, context: any): void {
    const pathNode = node.childForFieldName('path');
    if (!pathNode) return;
    
    const includePath = this.getNodeText(pathNode, context.content, context);
    if (includePath) {
      context.includes.push({
        module: includePath.replace(/["<>]/g, ''),
        symbols: [], // Would need to track imported symbols
        isSystem: includePath.startsWith('<'),
        location: { line: this.getLineNumber(node, context.content), column: 0 }
      });
    }
  }

  private handleNamespace(node: any, context: any): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;
    
    const namespaceName = this.getNodeText(nameNode, context.content, context);
    if (!namespaceName) return;
    
    context.context.namespaces.push(namespaceName);
    
    // Process namespace body
    const body = node.childForFieldName('body');
    if (body) {
      this.walkTree(body, context);
    }
    
    context.context.namespaces.pop();
  }

  // Helper methods
  private getNodeText(node: any, content: string, context?: any): string {
    if (!node) return '';
    const offset = context?.chunkOffset || 0;
    return content.substring(node.startIndex - offset, node.endIndex - offset);
  }

  private getMethodName(declarator: any, content: string, context?: any): string {
    if (declarator.type === 'function_declarator') {
      const nameNode = declarator.childForFieldName('declarator');
      if (nameNode) {
        return this.getNodeText(nameNode, content, context);
      }
    }
    return '';
  }

  private extractParameters(declarator: any, content: string, context?: any): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramList = declarator.childForFieldName('parameters');
    
    if (paramList) {
      for (const child of paramList.children) {
        if (child.type === 'parameter_declaration') {
          const type = this.getNodeText(child.childForFieldName('type'), content, context);
          const name = this.getNodeText(child.childForFieldName('declarator'), content, context) || '';
          const defaultValue = child.childForFieldName('default_value') 
            ? this.getNodeText(child.childForFieldName('default_value'), content, context) 
            : undefined;
          
          if (type) {
            params.push({ 
              name, 
              type, 
              defaultValue,
              isConst: type.includes('const'),
              isReference: type.includes('&'),
              isPointer: type.includes('*')
            });
          }
        }
      }
    }
    
    return params;
  }

  private hasQualifier(node: any, qualifier: string): boolean {
    for (const child of node.children) {
      if (child.type === qualifier) return true;
    }
    return false;
  }

  private getLineNumber(node: any, content: string): number {
    const lines = content.substring(0, node.startIndex).split('\n');
    return lines.length;
  }

  private identifyInterfaces(classes: ClassInfo[]): InterfaceInfo[] {
    return classes
      .filter(c => c.methods.every(m => m.isVirtual))
      .map(c => ({
        name: c.name,
        methods: c.methods,
        extends: c.baseClasses,
        location: c.location
      }));
  }

  private extractRelationships(node: any, content: string): SymbolRelationship[] {
    const relationships: SymbolRelationship[] = [];
    const contentLines = content.split('\n');
    
    // Get all extracted methods and classes from current parsing
    const allMethods = this.getAllMethodsFromContext();
    const allClasses = this.getAllClassesFromContext();
    
    // Add inheritance relationships from classes
    for (const cls of allClasses) {
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
    for (const method of allMethods) {
      if (!method.className || !method.location) continue;
      
      // Find the method's body in the source code
      const methodRelationships = this.extractMethodCallRelationships(
        method, content, contentLines, allMethods, allClasses
      );
      relationships.push(...methodRelationships);
    }
    
    return relationships;
  }

  private extractPatterns(node: any, content: string): CodePattern[] {
    // Would implement pattern extraction
    return [];
  }

  private identifyExports(methods: MethodSignature[], classes: ClassInfo[]): string[] {
    const exports: string[] = [];
    exports.push(...methods.map(m => m.name));
    exports.push(...classes.map(c => c.name));
    return exports;
  }

  // Helper methods for relationship extraction
  private currentMethods: MethodSignature[] = [];
  private currentClasses: ClassInfo[] = [];
  
  private getAllMethodsFromContext(): MethodSignature[] {
    return this.currentMethods;
  }
  
  private getAllClassesFromContext(): ClassInfo[] {
    return this.currentClasses;
  }
  
  private extractMethodCallRelationships(
    sourceMethod: MethodSignature, 
    content: string, 
    contentLines: string[], 
    allMethods: MethodSignature[], 
    allClasses: ClassInfo[]
  ): SymbolRelationship[] {
    const relationships: SymbolRelationship[] = [];
    
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
        const targets = this.findMatchingMethods(call, allMethods, sourceMethod.className!);
        
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
  
  private findMethodBodyStart(contentLines: string[], methodStartLine: number): number {
    // Look for the opening brace after the method declaration
    for (let i = methodStartLine - 1; i < Math.min(contentLines.length, methodStartLine + 10); i++) {
      const line = contentLines[i] || '';
      if (line.includes('{')) {
        // Return the line AFTER the opening brace to exclude the declaration
        return i + 1;
      }
    }
    return -1;
  }
  
  private findMethodBodyEnd(contentLines: string[], bodyStartLine: number): number {
    if (bodyStartLine === -1) return -1;
    
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
  
  private extractCallsFromLine(line: string, lineNumber: number): Array<{pattern: string, methodName: string, objectName?: string, lineNumber: number}> {
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

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}