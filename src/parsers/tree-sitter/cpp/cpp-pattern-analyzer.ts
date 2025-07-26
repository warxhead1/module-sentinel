/**
 * C++ Pattern Analyzer
 * 
 * Provides pattern-based parsing capabilities for C++ code when tree-sitter
 * is not available. Uses regex patterns and heuristics to extract symbols
 * and relationships from C++ source code.
 */

import { Logger, createLogger } from "../../../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../../../utils/memory-monitor.js";
import { SymbolInfo, RelationshipInfo, PatternInfo } from "../parser-types.js";
import { 
  CppVisitorContext, 
  CppParseResult,
  CppSymbolKind,
  CppRelationshipKind 
} from "./cpp-types.js";

export interface CppPatternRules {
  symbols: {
    class: RegExp[];
    function: RegExp[];
    variable: RegExp[];
    namespace: RegExp[];
    enum: RegExp[];
    typedef: RegExp[];
    template: RegExp[];
    macro: RegExp[];
  };
  relationships: {
    calls: RegExp[];
    inheritance: RegExp[];
    includes: RegExp[];
    memberAccess: RegExp[];
    templateInstantiation: RegExp[];
  };
  patterns: {
    raii: RegExp[];
    singleton: RegExp[];
    factory: RegExp[];
    observer: RegExp[];
  };
}

export class CppPatternAnalyzer {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private patterns: CppPatternRules;

  constructor() {
    this.logger = createLogger('CppPatternAnalyzer');
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.patterns = this.initializePatterns();
  }

  /**
   * Analyze C++ code using pattern-based parsing
   */
  async analyzeCode(
    content: string, 
    filePath: string, 
    context: CppVisitorContext
  ): Promise<CppParseResult> {
    const checkpoint = this.memoryMonitor.createCheckpoint('analyzeCode');
    
    try {
      this.logger.info('Starting pattern-based C++ analysis', {
        file: filePath,
        lines: content.split('\n').length
      });

      // Preprocess the content
      const processedContent = this.preprocessContent(content);
      const lines = processedContent.split('\n');

      // Initialize results
      const symbols: SymbolInfo[] = [];
      const relationships: RelationshipInfo[] = [];
      const patterns: PatternInfo[] = [];
      const stats = {
        nodesVisited: lines.length,
        symbolsExtracted: 0,
        complexityChecks: 0,
        controlFlowAnalyzed: 0,
        templatesProcessed: 0,
        namespacesProcessed: 0,
        classesProcessed: 0,
        functionsProcessed: 0,
        patternParseTimeMs: 0
      };

      // Track parsing state
      let currentNamespace: string | undefined;
      const namespaceStack: string[] = [];
      let currentClass: string | undefined;
      const classStack: string[] = [];
      let braceDepth = 0;
      let lineNumber = 0;

      // Process line by line
      for (const line of lines) {
        lineNumber++;
        
        // Update brace depth
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceDepth += openBraces - closeBraces;

        // Extract symbols
        const lineSymbols = await this.extractSymbolsFromLine(
          line, 
          lineNumber, 
          filePath, 
          currentNamespace, 
          currentClass,
          context
        );
        symbols.push(...lineSymbols);
        stats.symbolsExtracted += lineSymbols.length;

        // Update namespace context
        const nsChange = this.updateNamespaceContext(line, namespaceStack);
        if (nsChange) {
          currentNamespace = namespaceStack.length > 0 ? namespaceStack.join('::') : undefined;
          context.resolutionContext.currentNamespace = currentNamespace;
          if (nsChange.isEntering) {
            stats.namespacesProcessed++;
          }
        }

        // Update class context
        const classChange = this.updateClassContext(line, classStack, braceDepth);
        if (classChange) {
          currentClass = classStack.length > 0 ? classStack.join('::') : undefined;
          if (classChange.isEntering) {
            stats.classesProcessed++;
          }
        }

        // Extract relationships
        const lineRelationships = await this.extractRelationshipsFromLine(
          line, 
          lineNumber, 
          filePath, 
          currentNamespace, 
          currentClass,
          context
        );
        relationships.push(...lineRelationships);

        // Check for design patterns
        const linePatterns = this.detectPatternsInLine(line, lineNumber, symbols);
        patterns.push(...linePatterns);
      }

      // Post-process to detect more complex patterns
      const complexPatterns = this.detectComplexPatterns(symbols, relationships);
      patterns.push(...complexPatterns);

      // Update final stats
      stats.templatesProcessed = symbols.filter(s => s.semanticTags.includes('template')).length;
      stats.functionsProcessed = symbols.filter(s => 
        s.kind === CppSymbolKind.FUNCTION || 
        s.kind === CppSymbolKind.METHOD ||
        s.kind === CppSymbolKind.CONSTRUCTOR ||
        s.kind === CppSymbolKind.DESTRUCTOR
      ).length;

      const result: CppParseResult = {
        symbols,
        relationships,
        patterns,
        controlFlowData: { blocks: [], calls: [] }, // Will be filled by control flow analyzer
        stats
      };

      this.logger.info('Pattern-based analysis completed', {
        symbols: symbols.length,
        relationships: relationships.length,
        patterns: patterns.length
      });

      return result;

    } catch (error) {
      this.logger.error('Pattern analysis failed', error, { file: filePath });
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Extract symbols from a single line
   */
  private async extractSymbolsFromLine(
    line: string,
    lineNumber: number,
    filePath: string,
    currentNamespace: string | undefined,
    currentClass: string | undefined,
    context: CppVisitorContext
  ): Promise<SymbolInfo[]> {
    const symbols: SymbolInfo[] = [];

    try {
      // Class/struct detection
      const classSymbols = this.extractClassSymbols(line, lineNumber, filePath, currentNamespace);
      symbols.push(...classSymbols);

      // Function detection
      const functionSymbols = this.extractFunctionSymbols(line, lineNumber, filePath, currentNamespace, currentClass);
      symbols.push(...functionSymbols);

      // Variable detection
      const variableSymbols = this.extractVariableSymbols(line, lineNumber, filePath, currentNamespace, currentClass);
      symbols.push(...variableSymbols);

      // Namespace detection
      const namespaceSymbols = this.extractNamespaceSymbols(line, lineNumber, filePath, currentNamespace);
      symbols.push(...namespaceSymbols);

      // Enum detection
      const enumSymbols = this.extractEnumSymbols(line, lineNumber, filePath, currentNamespace);
      symbols.push(...enumSymbols);

      // Typedef/using detection
      const typedefSymbols = this.extractTypedefSymbols(line, lineNumber, filePath, currentNamespace);
      symbols.push(...typedefSymbols);

      // Template detection
      const templateSymbols = this.extractTemplateSymbols(line, lineNumber, filePath, currentNamespace);
      symbols.push(...templateSymbols);

    } catch (error) {
      this.logger.error('Failed to extract symbols from line', error, { lineNumber, line: line.slice(0, 100) });
    }

    return symbols;
  }

  /**
   * Extract relationships from a single line
   */
  private async extractRelationshipsFromLine(
    line: string,
    lineNumber: number,
    filePath: string,
    currentNamespace: string | undefined,
    currentClass: string | undefined,
    context: CppVisitorContext
  ): Promise<RelationshipInfo[]> {
    const relationships: RelationshipInfo[] = [];

    try {
      // Function calls
      const callRelationships = this.extractCallRelationships(line, lineNumber, currentNamespace, currentClass);
      relationships.push(...callRelationships);

      // Include directives
      const includeRelationships = this.extractIncludeRelationships(line, lineNumber, filePath);
      relationships.push(...includeRelationships);

      // Member access
      const memberAccessRelationships = this.extractMemberAccessRelationships(line, lineNumber, currentNamespace, currentClass);
      relationships.push(...memberAccessRelationships);

      // Inheritance (detected at class level)
      const inheritanceRelationships = this.extractInheritanceRelationships(line, lineNumber, currentNamespace);
      relationships.push(...inheritanceRelationships);

    } catch (error) {
      this.logger.error('Failed to extract relationships from line', error, { lineNumber });
    }

    return relationships;
  }

  // Symbol extraction methods

  private extractClassSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.class) {
      const match = line.match(pattern);
      if (match) {
        const [, type, name, inheritance] = match;
        const qualifiedName = currentNamespace ? `${currentNamespace}::${name}` : name;

        const symbol: SymbolInfo = {
          name,
          qualifiedName,
          kind: type === 'class' ? CppSymbolKind.CLASS : CppSymbolKind.STRUCT,
          filePath,
          line: lineNumber,
          column: line.indexOf(name) + 1,
          semanticTags: [type, ...(inheritance ? ['inherited'] : [])],
          complexity: 1,
          confidence: 0.85,
          isDefinition: true,
          isExported: line.includes('export'),
          isAsync: false,
          namespace: currentNamespace,
          languageFeatures: {
            inheritance: inheritance ? [inheritance.trim()] : []
          }
        };

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private extractFunctionSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string, currentClass?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.function) {
      const match = line.match(pattern);
      if (match) {
        const [fullMatch, returnType, name] = match;
        
        // Skip LOG calls and control flow keywords
        if (!name || name.startsWith('LOG_') || ['if', 'while', 'for', 'switch'].includes(name)) {
          continue;
        }

        let qualifiedName = name;
        let symbolKind = CppSymbolKind.FUNCTION;
        let parentScope: string | undefined;

        if (currentClass) {
          parentScope = currentClass;
          qualifiedName = `${currentClass}::${name}`;
          symbolKind = CppSymbolKind.METHOD;

          // Check for constructor/destructor
          const className = currentClass.split('::').pop();
          if (name === className) {
            symbolKind = CppSymbolKind.CONSTRUCTOR;
          } else if (name === `~${className}` || name.startsWith('~')) {
            symbolKind = CppSymbolKind.DESTRUCTOR;
          }
        } else if (currentNamespace) {
          qualifiedName = `${currentNamespace}::${name}`;
        }

        // Extract modifiers
        const modifiers = this.extractFunctionModifiers(fullMatch);

        const symbol: SymbolInfo = {
          name,
          qualifiedName,
          kind: symbolKind,
          filePath,
          line: lineNumber,
          column: line.indexOf(name) + 1,
          signature: fullMatch.trim(),
          returnType: symbolKind === CppSymbolKind.CONSTRUCTOR || symbolKind === CppSymbolKind.DESTRUCTOR ? undefined : returnType,
          semanticTags: [symbolKind, ...modifiers],
          complexity: this.estimateComplexityFromLine(line),
          confidence: 0.8,
          isDefinition: line.includes('{'),
          isExported: line.includes('export'),
          isAsync: line.includes('co_await') || line.includes('co_yield') || line.includes('co_return'),
          namespace: currentNamespace,
          parentScope,
          languageFeatures: {
            modifiers,
            isVirtual: modifiers.includes('virtual'),
            isConst: line.includes(') const'),
            isNoexcept: line.includes('noexcept')
          }
        };

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private extractVariableSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string, currentClass?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.variable) {
      const match = line.match(pattern);
      if (match) {
        const [, modifiers, type, name] = match;
        
        let qualifiedName = name;
        let symbolKind = CppSymbolKind.VARIABLE;
        let parentScope: string | undefined;

        if (currentClass) {
          parentScope = currentClass;
          qualifiedName = `${currentClass}::${name}`;
          symbolKind = CppSymbolKind.FIELD;
        } else if (currentNamespace) {
          qualifiedName = `${currentNamespace}::${name}`;
        }

        const modifierList = modifiers ? modifiers.trim().split(/\s+/) : [];

        const symbol: SymbolInfo = {
          name,
          qualifiedName,
          kind: symbolKind,
          filePath,
          line: lineNumber,
          column: line.indexOf(name) + 1,
          returnType: type,
          semanticTags: [symbolKind, ...modifierList],
          complexity: 0,
          confidence: 0.75,
          isDefinition: true,
          isExported: line.includes('export'),
          isAsync: false,
          namespace: currentNamespace,
          parentScope,
          languageFeatures: {
            modifiers: modifierList,
            isConst: modifierList.includes('const'),
            isStatic: modifierList.includes('static'),
            isConstexpr: modifierList.includes('constexpr')
          }
        };

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private extractNamespaceSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.namespace) {
      const match = line.match(pattern);
      if (match) {
        const [, name] = match;
        const qualifiedName = currentNamespace ? `${currentNamespace}::${name}` : name;

        const symbol: SymbolInfo = {
          name,
          qualifiedName,
          kind: CppSymbolKind.NAMESPACE,
          filePath,
          line: lineNumber,
          column: line.indexOf(name) + 1,
          semanticTags: ['namespace'],
          complexity: 0,
          confidence: 0.9,
          isDefinition: true,
          isExported: line.includes('export'),
          isAsync: false,
          namespace: currentNamespace
        };

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private extractEnumSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.enum) {
      const match = line.match(pattern);
      if (match) {
        const [, enumType, name, underlyingType] = match;
        const qualifiedName = currentNamespace ? `${currentNamespace}::${name}` : name;
        const isEnumClass = enumType.includes('class') || enumType.includes('struct');

        const symbol: SymbolInfo = {
          name,
          qualifiedName,
          kind: isEnumClass ? CppSymbolKind.ENUM_CLASS : CppSymbolKind.ENUM,
          filePath,
          line: lineNumber,
          column: line.indexOf(name) + 1,
          returnType: underlyingType,
          semanticTags: [isEnumClass ? 'enum_class' : 'enum', ...(isEnumClass ? ['scoped'] : ['unscoped'])],
          complexity: 0,
          confidence: 0.9,
          isDefinition: true,
          isExported: line.includes('export'),
          isAsync: false,
          namespace: currentNamespace
        };

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private extractTypedefSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.typedef) {
      const match = line.match(pattern);
      if (match) {
        let name: string;
        let aliasedType: string;

        if (line.startsWith('typedef')) {
          [, aliasedType, name] = match;
        } else {
          [, name, aliasedType] = match;
        }

        const qualifiedName = currentNamespace ? `${currentNamespace}::${name}` : name;

        const symbol: SymbolInfo = {
          name,
          qualifiedName,
          kind: line.startsWith('typedef') ? CppSymbolKind.TYPEDEF : CppSymbolKind.USING,
          filePath,
          line: lineNumber,
          column: line.indexOf(name) + 1,
          returnType: aliasedType,
          semanticTags: ['type_alias'],
          complexity: 0,
          confidence: 0.85,
          isDefinition: true,
          isExported: line.includes('export'),
          isAsync: false,
          namespace: currentNamespace,
          languageFeatures: {
            aliasedType
          }
        };

        symbols.push(symbol);
      }
    }

    return symbols;
  }

  private extractTemplateSymbols(line: string, lineNumber: number, filePath: string, currentNamespace?: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const pattern of this.patterns.symbols.template) {
      const match = line.match(pattern);
      if (match) {
        const [, templateParams] = match;
        
        // Template declarations don't create separate symbols
        // They modify the next symbol to be a template
        // This would be handled by the following line processing
      }
    }

    return symbols;
  }

  // Relationship extraction methods

  private extractCallRelationships(line: string, lineNumber: number, currentNamespace?: string, currentClass?: string): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];
    const currentScope = currentClass || currentNamespace || 'global';

    for (const pattern of this.patterns.relationships.calls) {
      const matches = Array.from(line.matchAll(pattern));
      for (const match of matches) {
        const functionName = match[1];
        
        if (['if', 'while', 'for', 'switch', 'catch', 'sizeof', 'typeof', 'return'].includes(functionName)) {
          continue;
        }

        const relationship: RelationshipInfo = {
          fromName: currentScope,
          toName: functionName,
          relationshipType: CppRelationshipKind.CALLS,
          confidence: 0.7,
          lineNumber,
          columnNumber: match.index || 0,
          crossLanguage: false,
          sourceContext: match[0],
          usagePattern: 'function_call'
        };

        relationships.push(relationship);
      }
    }

    return relationships;
  }

  private extractIncludeRelationships(line: string, lineNumber: number, filePath: string): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];

    for (const pattern of this.patterns.relationships.includes) {
      const match = line.match(pattern);
      if (match) {
        const [, includePath] = match;
        const isSystemInclude = includePath.startsWith('<');
        const cleanPath = includePath.replace(/^[<"]|[>"]$/g, '');

        const relationship: RelationshipInfo = {
          fromName: filePath,
          toName: cleanPath,
          relationshipType: CppRelationshipKind.INCLUDES,
          confidence: 1.0,
          lineNumber,
          columnNumber: 0,
          crossLanguage: false,
          sourceContext: line.trim(),
          usagePattern: isSystemInclude ? 'system_include' : 'user_include'
        };

        relationships.push(relationship);
      }
    }

    return relationships;
  }

  private extractMemberAccessRelationships(line: string, lineNumber: number, currentNamespace?: string, currentClass?: string): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];
    const currentScope = currentClass || currentNamespace || 'global';

    for (const pattern of this.patterns.relationships.memberAccess) {
      const matches = Array.from(line.matchAll(pattern));
      for (const match of matches) {
        const [fullMatch, objectName, memberName] = match;
        
        if (objectName !== 'this') {
          const isWrite = line.includes(`${fullMatch} =`) || line.includes(`${fullMatch}=`);
          
          const relationship: RelationshipInfo = {
            fromName: currentScope,
            toName: memberName,
            relationshipType: isWrite ? 'writes_field' : 'reads_field',
            confidence: 0.8,
            lineNumber,
            columnNumber: match.index || 0,
            crossLanguage: false,
            sourceContext: fullMatch,
            usagePattern: isWrite ? 'field_write' : 'field_read'
          };

          relationships.push(relationship);
        }
      }
    }

    return relationships;
  }

  private extractInheritanceRelationships(line: string, lineNumber: number, currentNamespace?: string): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];

    for (const pattern of this.patterns.relationships.inheritance) {
      const match = line.match(pattern);
      if (match) {
        const [, derivedClass, , inheritanceList] = match;
        const derivedQualifiedName = currentNamespace ? `${currentNamespace}::${derivedClass}` : derivedClass;

        if (inheritanceList) {
          const baseClasses = inheritanceList.split(',').map(s => s.trim());
          for (const baseClass of baseClasses) {
            const cleanBaseClass = baseClass.replace(/^\s*(public|private|protected)\s+/, '');
            
            const relationship: RelationshipInfo = {
              fromName: derivedQualifiedName,
              toName: cleanBaseClass,
              relationshipType: CppRelationshipKind.INHERITS,
              confidence: 0.9,
              lineNumber,
              columnNumber: 0,
              crossLanguage: false,
              sourceContext: `${derivedClass} : ${inheritanceList}`,
              usagePattern: 'inheritance'
            };

            relationships.push(relationship);
          }
        }
      }
    }

    return relationships;
  }

  // Pattern detection methods

  private detectPatternsInLine(line: string, lineNumber: number, symbols: SymbolInfo[]): PatternInfo[] {
    const patterns: PatternInfo[] = [];

    // RAII pattern detection
    for (const pattern of this.patterns.patterns.raii) {
      if (pattern.test(line)) {
        patterns.push({
          patternType: 'raii',
          patternName: 'Resource Acquisition Is Initialization',
          confidence: 0.7,
          details: { line: lineNumber, text: line.trim() }
        });
      }
    }

    return patterns;
  }

  private detectComplexPatterns(symbols: SymbolInfo[], relationships: RelationshipInfo[]): PatternInfo[] {
    const patterns: PatternInfo[] = [];

    // Singleton pattern detection
    const singletonClasses = symbols.filter(s => 
      s.kind === CppSymbolKind.CLASS && 
      symbols.some(constructor => 
        constructor.kind === CppSymbolKind.CONSTRUCTOR && 
        constructor.parentScope === s.qualifiedName &&
        constructor.visibility === 'private'
      )
    );

    for (const singletonClass of singletonClasses) {
      patterns.push({
        patternType: 'singleton',
        patternName: 'Singleton Pattern',
        confidence: 0.8,
        details: { className: singletonClass.qualifiedName }
      });
    }

    return patterns;
  }

  // Helper methods

  private preprocessContent(content: string): string {
    // Remove comments but preserve line structure
    const processed = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, ''); // Remove line comments

    return processed;
  }

  private updateNamespaceContext(line: string, namespaceStack: string[]): { isEntering: boolean } | null {
    const nsMatch = line.match(/^\s*(?:export\s+)?namespace\s+(\w+(?:::\w+)*)\s*{?/);
    if (nsMatch) {
      const ns = nsMatch[1];
      namespaceStack.push(ns);
      return { isEntering: true };
    }

    // Check for namespace end (simplified)
    if (line.trim() === '}' && namespaceStack.length > 0) {
      namespaceStack.pop();
      return { isEntering: false };
    }

    return null;
  }

  private updateClassContext(line: string, classStack: string[], braceDepth: number): { isEntering: boolean } | null {
    const classMatch = line.match(/^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)/);
    if (classMatch) {
      const className = classMatch[2];
      classStack.push(className);
      return { isEntering: true };
    }

    // Simplified class end detection
    if (line.includes('}') && classStack.length > 0) {
      classStack.pop();
      return { isEntering: false };
    }

    return null;
  }

  private extractFunctionModifiers(functionText: string): string[] {
    const modifiers: string[] = [];
    const modifierKeywords = ['virtual', 'override', 'final', 'constexpr', 'inline', 'explicit', 'static', 'const', 'noexcept'];
    
    for (const keyword of modifierKeywords) {
      if (functionText.includes(keyword)) {
        modifiers.push(keyword);
      }
    }

    return modifiers;
  }

  private estimateComplexityFromLine(line: string): number {
    let complexity = 1;
    
    // Count control flow keywords
    const controlFlowKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch'];
    for (const keyword of controlFlowKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = line.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  private initializePatterns(): CppPatternRules {
    return {
      symbols: {
        class: [
          /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)(?:\s*:\s*(.+?))?(?:\s*{|$)/,
          /^\s*(class|struct)\s+(\w+)\s*{/
        ],
        function: [
          /^[\s\w:&<>,*]*?([a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*)\s+([a-zA-Z_]\w*)\s*\([^)]*\)(?:\s*const)?(?:\s*noexcept)?(?:\s*->[\w\s<>,&*]+)?(?:\s*{|;)/,
          /^[\s\w:&<>,*]*?\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*(?:const\s*)?(?:noexcept\s*)?{/
        ],
        variable: [
          /^\s*((?:static|const|constexpr|extern|inline|mutable|volatile)\s+)*([a-zA-Z_][\w:<>,*&\s]*?)\s+([a-zA-Z_]\w*)\s*(?:=|;)/
        ],
        namespace: [
          /^\s*(?:export\s+)?namespace\s+([a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*)\s*{?/
        ],
        enum: [
          /^\s*(?:export\s+)?(enum(?:\s+class|\s+struct)?)\s+([a-zA-Z_]\w*)(?:\s*:\s*([a-zA-Z_]\w*))?/
        ],
        typedef: [
          /^\s*typedef\s+(.+?)\s+([a-zA-Z_]\w*)\s*;/,
          /^\s*using\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s*;/
        ],
        template: [
          /^\s*template\s*<([^>]+)>/
        ],
        macro: [
          /^\s*#define\s+([a-zA-Z_]\w*)/
        ]
      },
      relationships: {
        calls: [
          /\b([a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*)\s*\(/g
        ],
        inheritance: [
          /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)\s*:\s*(.+?)\s*{/
        ],
        includes: [
          /^\s*#include\s+([<"][^>"]+[>"])/
        ],
        memberAccess: [
          /\b(\w+)(?:\.|->)(\w+)/g
        ],
        templateInstantiation: [
          /\b([a-zA-Z_]\w*)<([^>]+)>/g
        ]
      },
      patterns: {
        raii: [
          /\b(?:unique_ptr|shared_ptr|weak_ptr|scoped_ptr)\b/,
          /\b(?:lock_guard|unique_lock|scoped_lock)\b/,
          /\b(?:fstream|ifstream|ofstream)\b/
        ],
        singleton: [
          /static\s+\w+\s*&\s*getInstance\s*\(/,
          /private\s*:\s*.*constructor/
        ],
        factory: [
          /static\s+\w+\s*\*?\s*create\w*/,
          /\bmake_\w+\(/
        ],
        observer: [
          /\baddObserver\b/,
          /\bnotify\w*\b/,
          /\bsubject\b.*\bobserver\b/i
        ]
      }
    };
  }
}