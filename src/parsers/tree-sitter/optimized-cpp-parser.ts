/**
 * Optimized C++ Tree-Sitter Parser
 *
 * High-performance C++ parser leveraging:
 * 1. Unified single-pass AST traversal
 * 2. Selective control flow analysis based on complexity
 * 3. Efficient symbol resolution cache
 * 4. Batch database operations
 * 5. Parser instance pooling
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import * as path from "path";
import * as fs from "fs/promises";

import { OptimizedTreeSitterBaseParser } from "./optimized-base-parser.js";
import {
  VisitorHandlers,
  VisitorContext,
  ScopeInfo,
} from "../unified-ast-visitor.js";
import {
  SymbolInfo,
  RelationshipInfo,
  PatternInfo,
  ParseResult,
} from "./parser-types.js";
import {
  SymbolResolutionCache,
  ResolutionContext,
} from "../../analysis/symbol-resolution-cache.js";
import { PatternBasedParser } from "./pattern-based-parser.js";
import {
  CPP_SYMBOL_PATTERNS,
  CPP_RELATIONSHIP_PATTERNS,
  CPP_PATTERN_DETECTORS,
} from "./cpp-patterns.js";

interface CppVisitorContext extends VisitorContext {
  // C++-specific context
  templateDepth: number;
  insideExportBlock: boolean;
  currentAccessLevel: "public" | "private" | "protected";
  usingDeclarations: Map<string, string>;
  resolutionContext: ResolutionContext;
}

export class OptimizedCppTreeSitterParser extends OptimizedTreeSitterBaseParser {
  private cppLanguage?: Parser.Language;
  private static symbolCache = new SymbolResolutionCache(50000); // Shared across instances
  private patternParser: PatternBasedParser;
  private useTreeSitter: boolean = false;

  constructor(db: Database, options: any) {
    super(db, options);

    // Debug mode controlled by options
    this.debugMode = options.debugMode || false;

    // Initialize pattern-based parser as fallback
    this.patternParser = new PatternBasedParser(
      CPP_SYMBOL_PATTERNS,
      CPP_RELATIONSHIP_PATTERNS,
      true // Enable debug in pattern parser too
    );
  }

  async initialize(): Promise<void> {
    try {
      // Use native tree-sitter-cpp (Node.js API) - modern v0.23.4
      try {
        // Load tree-sitter-cpp using correct Node.js API
        const cppLanguage = require("tree-sitter-cpp");
        if (cppLanguage && this.parser) {
          this.parser.setLanguage(cppLanguage);
          this.useTreeSitter = true;
          this.debug("Successfully loaded tree-sitter-cpp v0.23.4!");
          return;
        }
      } catch (error) {
        this.debug(`Failed to load tree-sitter-cpp: ${error}`);
      }

      // Fall back to pattern-based parsing
      this.useTreeSitter = false;
      this.debug("Using optimized pattern-based parsing for C++");
    } catch (error) {
      this.debug(`Failed to initialize C++ parser: ${error}`);
      this.useTreeSitter = false;
    }
  }

  /**
   * Override parseFile to always use pattern-based parsing when tree-sitter is not available
   */
  async parseFile(filePath: string, content: string): Promise<ParseResult> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.getCachedParse(filePath);
    if (cached) {
      this.debug(`Cache hit for ${filePath}`);
      await this.storeParsedData(filePath, cached);
      return cached as ParseResult;
    }

    let result;

    // Always use pattern-based parsing if tree-sitter is not available
    if (!this.useTreeSitter || content.length > 50 * 1024) {
      this.debug(`Using pattern-based parsing for: ${filePath}`);
      result = await this.performPatternBasedExtraction(content, filePath);
    } else {
      // Use tree-sitter for smaller files when available
      try {
        const tree = this.parser.parse(content);
        if (!tree) {
          throw new Error("Parser returned null tree");
        }
        result = await this.visitor.traverse(tree, filePath, content);
      } catch (error) {
        this.debug(
          `Tree-sitter parsing failed, falling back to patterns: ${error}`
        );
        result = await this.performPatternBasedExtraction(content, filePath);
      }
    }

    // Cache the result
    this.setCachedParse(filePath, result);

    // Store in database
    await this.storeParsedData(filePath, result);

    const duration = Date.now() - startTime;
    this.debug(`Parsed ${filePath} in ${duration}ms`);

    // Return the result
    return result as ParseResult;
  }

  protected createVisitorHandlers(): VisitorHandlers {
    return {
      // Symbol extraction handlers
      onClass: this.handleClass.bind(this),
      onFunction: this.handleFunction.bind(this),
      onNamespace: this.handleNamespace.bind(this),
      onVariable: this.handleVariable.bind(this),
      onEnum: this.handleEnum.bind(this),
      onTypedef: this.handleTypedef.bind(this),

      // Relationship extraction handlers
      onCall: this.handleCall.bind(this),
      onInheritance: this.handleInheritance.bind(this),
      onImport: this.handleImport.bind(this),
      onTypeReference: this.handleTypeReference.bind(this),

      // Pattern detection
      onPattern: this.handlePattern.bind(this),

      // Scope management
      onEnterScope: this.handleEnterScope.bind(this),
      onExitScope: this.handleExitScope.bind(this),
    };
  }

  protected getNodeTypeMap(): Map<string, keyof VisitorHandlers> {
    return new Map([
      // Classes and structs
      ["class_specifier", "onClass"],
      ["struct_specifier", "onClass"],

      // Functions and methods
      ["function_definition", "onFunction"],
      ["function_declaration", "onFunction"],
      ["method_definition", "onFunction"],
      ["constructor_definition", "onFunction"],
      ["destructor_definition", "onFunction"],
      ["operator_definition", "onFunction"],

      // Namespaces and modules
      ["namespace_definition", "onNamespace"],
      ["module_declaration", "onNamespace"],
      ["export_declaration", "onNamespace"],

      // Variables and fields
      ["field_declaration", "onVariable"],
      ["variable_declaration", "onVariable"],
      ["parameter_declaration", "onVariable"],

      // Type definitions
      ["enum_specifier", "onEnum"],
      ["type_definition", "onTypedef"],
      ["alias_declaration", "onTypedef"],
      ["using_declaration", "onTypedef"],

      // Relationships
      ["call_expression", "onCall"],
      ["base_class_clause", "onInheritance"],
      ["import_declaration", "onImport"],
      ["type_identifier", "onTypeReference"],

      // Patterns
      ["template_declaration", "onPattern"],
      ["lambda_expression", "onPattern"],
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
    const startTime = Date.now();

    // Use enhanced pattern parser with namespace tracking
    const context: CppVisitorContext = {
      filePath,
      content,
      symbols: new Map(),
      relationships: [],
      patterns: [],
      controlFlowData: { blocks: [], calls: [] },
      scopeStack: [],
      stats: {
        nodesVisited: 0,
        symbolsExtracted: 0,
        complexityChecks: 0,
        controlFlowAnalyzed: 0,
      },
      templateDepth: 0,
      insideExportBlock: false,
      currentAccessLevel: "public",
      usingDeclarations: new Map(),
      resolutionContext: {
        currentFile: filePath,
        currentNamespace: undefined,
        importedNamespaces: new Set(),
        typeAliases: new Map(),
      },
    };

    // Parse with pattern-based approach
    await this.parseWithPatterns(content, filePath, context);

    const duration = Date.now() - startTime;
    context.stats.nodesVisited = content.split("\n").length; // Approximate

    const symbols = Array.from(context.symbols.values());
    this.debug(
      `Pattern-based extraction found ${symbols.length} symbols in ${filePath}`
    );

    return {
      symbols,
      relationships: context.relationships,
      patterns: context.patterns,
      controlFlowData: context.controlFlowData,
      stats: { ...context.stats, patternParseTimeMs: duration },
    };
  }

  /**
   * Join multi-line function signatures - minimal approach
   */
  private joinMultiLineFunctions(
    lines: string[]
  ): Array<{ content: string; originalLine: number }> {
    const processedLines: Array<{ content: string; originalLine: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Only join if line ends with '(' and next line exists and looks like parameters
      if (
        line.trim().endsWith("(") &&
        i + 1 < lines.length &&
        lines[i + 1].trim().match(/^\s*(const\s+)?\w+/) && // Next line starts with a type
        line.match(/[\w:&<>,\s*]+\s+(\w+::)*\w+\s*\(\s*$/)
      ) {
        // Current line looks like function

        // Simple join: just combine this line with the next 2 lines max
        let combined = line.trim();
        let j = i + 1;
        while (j < lines.length && j < i + 3) {
          // Max 3 lines
          const nextLine = lines[j].trim();
          combined += " " + nextLine;
          if (nextLine.includes(")") && nextLine.includes("{")) {
            // Found complete signature
            processedLines.push({ content: combined, originalLine: lineNum });
            i = j; // Skip the lines we consumed
            break;
          }
          j++;
        }

        // If we didn't find a complete signature, just add original line
        if (j >= i + 3 || !combined.includes(") {")) {
          processedLines.push({ content: line, originalLine: lineNum });
        }
      } else {
        processedLines.push({ content: line, originalLine: lineNum });
      }
    }

    return processedLines;
  }

  private async parseWithPatterns(
    content: string,
    filePath: string,
    context: CppVisitorContext
  ): Promise<void> {
    const lines = content.split("\n");
    let currentNamespace: string | undefined;
    let namespaceStack: string[] = [];
    let braceDepth = 0;
    let insideClass: { name: string; depth: number } | null = null;

    this.debug(`\nParsing ${filePath} with ${lines.length} lines`);

    // Pre-process to join multi-line function signatures
    const processedLines = this.joinMultiLineFunctions(lines);

    for (let i = 0; i < processedLines.length; i++) {
      const line = processedLines[i].content;
      const lineNum = processedLines[i].originalLine;

      let symbol: SymbolInfo | undefined; // Declare symbol here, initialized to undefined

      // Count braces but don't update depth yet - we need to check for struct/class first
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      // Namespace detection
      const namespaceMatch = line.match(
        /^\s*(?:export\s+)?namespace\s+(\w+(?:::\w+)*)\s*{?/
      );
      if (namespaceMatch) {
        const ns = namespaceMatch[1];
        namespaceStack.push(ns);
        currentNamespace = namespaceStack.join("::");
        context.resolutionContext.currentNamespace = currentNamespace;

        symbol = {
          // Assign symbol here
          name: ns,
          qualifiedName: currentNamespace,
          kind: "namespace",
          filePath,
          line: lineNum,
          column: 1,
          semanticTags: ["namespace"],
          complexity: 0,
          confidence: 0.9,
          isDefinition: true,
          isExported: line.includes("export"),
          isAsync: false,
          namespace: namespaceStack.slice(0, -1).join("::") || undefined,
          parentScope: undefined
        };

        context.symbols.set(symbol.qualifiedName, symbol);
        context.stats.symbolsExtracted++;
        this.debug(
          `  Found namespace: ${symbol.qualifiedName} (filePath: ${symbol.filePath}, line: ${symbol.line})`
        );
      }

      // Class/struct detection
      const classMatch = line.match(
        /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)(?:\s*:\s*(.+?))?(?:\s*{|$)/
      );
      if (classMatch) {
        const [, type, name, inheritance] = classMatch;
        const qualifiedName = currentNamespace
          ? `${currentNamespace}::${name}`
          : name;

        insideClass = { name: qualifiedName, depth: braceDepth };

        symbol = {
          // Assign symbol here
          name,
          qualifiedName,
          kind: type,
          filePath,
          line: lineNum,
          column: 1,
          semanticTags: [
            type,
            line.includes("template") ? "template" : "",
          ].filter(Boolean),
          complexity: 1,
          confidence: 0.95,
          isDefinition: true,
          isExported: line.includes("export"),
          isAsync: false,
          namespace: currentNamespace,
          parentScope: insideClass?.name,
          languageFeatures: {
            inheritance: inheritance ? [inheritance.trim()] : [],
            members: [], // Will be populated as we find members
          } as any,
        };

        context.symbols.set(symbol.qualifiedName, symbol);
        context.stats.symbolsExtracted++;
        this.debug(
          `  Found ${type}: ${symbol.qualifiedName} (filePath: ${symbol.filePath}, line: ${symbol.line})`
        );

        // Update insideClass to track this struct/class for member association
        insideClass = { name: qualifiedName, depth: braceDepth };

        // Cache the symbol for fast resolution
        OptimizedCppTreeSitterParser.symbolCache.addSymbol({
          id: context.stats.symbolsExtracted,
          name,
          qualifiedName,
          kind: type,
          filePath,
          line: lineNum,
          column: 1,
          namespace: currentNamespace,
          semanticTags: symbol.semanticTags,
          childIds: [],
          callers: [],
          callees: [],
          inheritsFrom: [],
          inheritedBy: [],
          uses: [],
          usedBy: [],
          lastAccessed: Date.now(),
          accessCount: 0,
        });

        // Extract inheritance relationships
        if (inheritance) {
          const baseClasses = inheritance.split(",").map((s) => s.trim());
          for (const baseClass of baseClasses) {
            const cleanBase = baseClass.replace(
              /^\s*(public|private|protected)\s+/,
              ""
            );
            context.relationships.push({
              fromName: qualifiedName,
              toName: cleanBase,
              relationshipType: "inherits",
              confidence: 0.9,
              lineNumber: lineNum,
              crossLanguage: false,
            });
          }
        }
      }

      // Improved function/method detection to handle complex C++ patterns
      // Pattern 1: Class-qualified methods like "IPlanetBuilder& PlanetBuilder::WithTextureResolution(uint32_t resolution)"
      const classMethodMatch = line.match(
        /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(?:inline\s+)?(?:static\s+)?(?:virtual\s+)?(?:constexpr\s+)?([\w:&<>,\s*]+?)\s+(\w+::)+(\w+)\s*\([^)]*\)(?:\s*const)?(?:\s*noexcept)?(?:\s*->\s*[\w\s<>,&*]+)?(?:\s*{|;)/
      );

      // Pattern 2: Regular functions/methods
      const functionMatch = line.match(
        /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(?:inline\s+)?(?:static\s+)?(?:virtual\s+)?(?:constexpr\s+)?([\w:&<>,\s*]+?)\s+(\w+)\s*\([^)]*\)(?:\s*const)?(?:\s*noexcept)?(?:\s*->\s*[\w\s<>,&*]+)?(?:\s*{|;)/
      );

      let matchResult = classMethodMatch || functionMatch;
      if (
        matchResult &&
        !line.includes("if") &&
        !line.includes("while") &&
        !line.includes("for") &&
        !line.includes("=")
      ) {
        let returnType, name, fullQualifiedName;

        if (classMethodMatch) {
          // Handle class-qualified methods
          [, returnType, , name] = classMethodMatch;
          const classPath = classMethodMatch[0].match(/(\w+::)+/)?.[0];
          fullQualifiedName = classPath ? `${classPath}${name}` : name;
        } else {
          // Handle regular functions
          [, returnType, name] = functionMatch!;
          fullQualifiedName = name;
        }

        const [fullMatch] = matchResult;

        // Filter out LOG calls - they should be relationships, not symbols
        if (
          name.startsWith("LOG_") ||
          fullMatch.includes("LOG_ERROR(") ||
          fullMatch.includes("LOG_DEBUG(") ||
          fullMatch.includes("LOG_INFO(") ||
          fullMatch.includes("LOG_WARN(") ||
          fullMatch.includes("LOG_CRITICAL(") ||
          fullMatch.includes("LOG_TRACE(") ||
          fullMatch.includes("LOG_FATAL(") ||
          fullMatch.includes("LOG_WARNING(")
        ) {
          continue; // Skip this line and continue processing
        }

        const isConstructor =
          insideClass && name === insideClass.name.split("::").pop();
        const isDestructor = name.startsWith("~");

        const parentQualifiedName = insideClass?.name;
        let qualifiedName = classMethodMatch
          ? currentNamespace
            ? `${currentNamespace}::${fullQualifiedName}`
            : fullQualifiedName
          : parentQualifiedName
          ? `${parentQualifiedName}::${name}`
          : currentNamespace
          ? `${currentNamespace}::${name}`
          : name;

        // For functions and methods, append a simplified signature to ensure uniqueness for overloads
        symbol = {
          // Assign symbol here
          name,
          qualifiedName,
          kind: isConstructor
            ? "constructor"
            : isDestructor
            ? "destructor"
            : "function",
          filePath,
          line: lineNum,
          column: 1,
          returnType: returnType || "void",
          signature: fullMatch.trim(),
          semanticTags: this.extractFunctionTags(line, name),
          complexity: 1,
          confidence: 0.9,
          isDefinition: line.includes("{"),
          isExported: line.includes("export"),
          isAsync: line.includes("async") || line.includes("co_"),
          namespace: currentNamespace,
          parentScope: parentQualifiedName,
        };

        if (
          symbol.kind === "function" ||
          symbol.kind === "constructor" ||
          symbol.kind === "destructor"
        ) {
          const paramsMatch = fullMatch.match(/\((.*?)\)/);
          const params =
            paramsMatch && paramsMatch[1]
              ? paramsMatch[1].replace(/\s/g, "")
              : "";
          symbol.qualifiedName = `${qualifiedName}(${params})`; // Update qualifiedName on the symbol object
        }

        // Estimate complexity for selective control flow analysis
        const complexity = this.estimateFunctionComplexity(symbol, lines, i);
        symbol.complexity = complexity;

        context.symbols.set(symbol.qualifiedName, symbol);
        context.stats.symbolsExtracted++;
        this.debug(
          `  Found ${symbol.kind}: ${symbol.qualifiedName} (complexity: ${complexity}, filePath: ${symbol.filePath}, line: ${symbol.line})`
        );

        // Analyze control flow for complex functions, but always analyze for member access
        this.debug(`    Complexity check: ${complexity} >= 2 && ${context.stats.controlFlowAnalyzed} < 10 = ${complexity >= 2 && context.stats.controlFlowAnalyzed < 10}`);
        this.debug(`    Symbol kind check: ${symbol.kind} in [function, method, constructor] = ${symbol.kind === 'function' || symbol.kind === 'method' || symbol.kind === 'constructor'}`);
        
        if (complexity >= 2 && context.stats.controlFlowAnalyzed < 10) {
          context.stats.complexityChecks++;
          this.debug(`    Analyzing control flow for ${symbol.qualifiedName}`);
          await this.analyzePatternBasedControlFlow(symbol, lines, i, context);
          const blocksFound = context.controlFlowData.blocks.filter(
            (b) => b.symbolName === symbol?.qualifiedName
          ).length;
          this.debug(`    Found ${blocksFound} control flow blocks`);
        } else if (symbol.kind === 'function' || symbol.kind === 'method' || symbol.kind === 'constructor') {
          // For simple functions, still analyze for member access patterns
          this.debug(`    Analyzing member access for simple function: ${symbol.qualifiedName}`);
          await this.analyzeMemberAccess(symbol, lines, i, context);
        } else {
          this.debug(`    Skipping analysis for ${symbol.qualifiedName} (kind: ${symbol.kind}, complexity: ${complexity})`);
        }
      }

      // Exit class scope
      if (insideClass && braceDepth < insideClass.depth) {
        insideClass = null;
      }

      // Member detection inside struct/class
      if (insideClass && braceDepth > insideClass.depth) {
        
        // Member variable pattern: type name [= default_value];
        // Updated to handle types like uint32_t, std::string, etc.
        const memberMatch = line.match(
          /^\s*(?:(const|static|mutable|volatile)\s+)*([a-zA-Z_][\w:&*<>,\s]*?)\s+(\w+)(?:\s*=\s*([^;]+))?\s*;/
        );
        if (memberMatch) {
          const [, modifiers, memberType, memberName, defaultValue] =
            memberMatch;
          const memberQualifiedName = `${insideClass.name}::${memberName}`;

          const memberSymbol: any = {
            name: memberName,
            qualifiedName: memberQualifiedName,
            kind: "field",
            filePath,
            line: lineNum,
            column: line.indexOf(memberName) + 1,
            returnType: memberType.trim(), // Store member type as returnType
            semanticTags: [
              "member",
              modifiers?.includes("static") ? "static" : "",
            ].filter(Boolean),
            complexity: 0,
            confidence: 0.95,
            isDefinition: true,
            isExported: false,
            isAsync: false,
            namespace: currentNamespace,
            parentScope: insideClass.name, // Parent struct/class qualified name
            visibility: "public", // TODO: Track public/private/protected sections
            languageFeatures: JSON.stringify({
              memberType: memberType.trim(),
              defaultValue: defaultValue?.trim(),
              modifiers: modifiers?.split(/\s+/).filter(Boolean) || [],
              isStatic: modifiers?.includes("static") || false,
              isConst: modifiers?.includes("const") || false,
              isMutable: modifiers?.includes("mutable") || false,
            }),
          };

          context.symbols.set(memberSymbol.qualifiedName, memberSymbol);
          context.stats.symbolsExtracted++;
          this.debug(
            `    Found member: ${memberSymbol.qualifiedName} (type: ${memberType}, line: ${memberSymbol.line})`
          );

          // Add member to parent struct's member list if we can find it
          const parentSymbol = context.symbols.get(insideClass.name);
          if (parentSymbol && parentSymbol.languageFeatures) {
            parentSymbol.languageFeatures.members.push({
              name: memberName,
              type: memberType.trim(),
              defaultValue: defaultValue?.trim(),
              line: lineNum,
            });
          }
        }
      }

      // Exit namespace scope
      if (namespaceStack.length > 0 && braceDepth < namespaceStack.length) {
        namespaceStack.pop();
        currentNamespace =
          namespaceStack.length > 0 ? namespaceStack.join("::") : undefined;
        context.resolutionContext.currentNamespace = currentNamespace;
      }
      
      // Update brace depth at end of line processing
      braceDepth += openBraces;
      braceDepth -= closeBraces;
    }

    // Detect patterns
    const symbols = Array.from(context.symbols.values());
    for (const detector of CPP_PATTERN_DETECTORS) {
      const patterns = detector.detect(symbols as any);
      if (patterns) {
        context.patterns.push({
          patternType: patterns.type,
          patternName: patterns.description || patterns.type,
          confidence: patterns.confidence,
          details: patterns,
        });
      }
    }
  }

  private extractFunctionTags(line: string, name: string): string[] {
    const tags: string[] = ["function"];

    if (line.includes("template")) tags.push("template");
    if (line.includes("inline")) tags.push("inline");
    if (line.includes("static")) tags.push("static");
    if (line.includes("virtual")) tags.push("virtual");
    if (line.includes("override")) tags.push("override");
    if (line.includes("const")) tags.push("const");
    if (line.includes("noexcept")) tags.push("noexcept");
    if (line.includes("constexpr")) tags.push("constexpr");
    if (line.includes("operator")) tags.push("operator");
    if (
      line.includes("co_await") ||
      line.includes("co_yield") ||
      line.includes("co_return")
    )
      tags.push("coroutine");

    // Execution mode detection
    if (
      name.toLowerCase().includes("gpu") ||
      name.toLowerCase().includes("kernel")
    ) {
      tags.push("gpu-execution");
    }
    if (
      name.toLowerCase().includes("simd") ||
      name.toLowerCase().includes("vector")
    ) {
      tags.push("simd");
    }

    return tags;
  }

  private estimateFunctionComplexity(
    symbol: SymbolInfo,
    lines: string[],
    startIdx: number
  ): number {
    let complexity = 1;
    let braceDepth = 0;
    let lineCount = 0;

    // Quick scan to find function end and count control structures
    for (let i = startIdx; i < lines.length && i < startIdx + 100; i++) {
      const line = lines[i];
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      if (braceDepth > 0) {
        lineCount++;

        // Count control flow structures
        if (/\b(if|else\s+if)\s*\(/.test(line)) complexity += 1;
        if (/\b(for|while|do)\s*\(/.test(line)) complexity += 2;
        if (/\bswitch\s*\(/.test(line)) complexity += 2;
        if (/\btry\s*{/.test(line)) complexity += 1;
        if (/\bcatch\s*\(/.test(line)) complexity += 1;
        if (/\b(goto|break|continue|return)\b/.test(line)) complexity += 0.5;
        if (/\b(co_await|co_yield|co_return)\b/.test(line)) complexity += 2;
      }

      if (braceDepth === 0 && lineCount > 0) {
        break;
      }
    }

    // Adjust for function size
    if (lineCount < 3) return 0; // Skip trivial functions
    if (lineCount > 20) complexity += 2;
    if (lineCount > 50) complexity += 3;

    // Function name heuristics
    const nameLower = symbol.name.toLowerCase();
    if (nameLower.includes("process") || nameLower.includes("analyze"))
      complexity += 1;
    if (nameLower.includes("get") || nameLower.includes("set")) complexity -= 1;

    return Math.max(0, Math.floor(complexity));
  }

  /**
   * Analyze member access patterns for simple functions
   */
  private async analyzeMemberAccess(
    symbol: SymbolInfo,
    lines: string[],
    startIdx: number,
    context: CppVisitorContext
  ): Promise<void> {
    let braceDepth = 0;
    let foundFunctionStart = false;
    
    this.debug(`    analyzeMemberAccess: Starting analysis for ${symbol.qualifiedName} at line ${startIdx + 1}`);
    
    // Find where the function body starts
    for (let i = startIdx; i < lines.length && i < startIdx + 10; i++) {
      const line = lines[i];
      this.debug(`    analyzeMemberAccess: Checking line ${i + 1}: "${line.trim()}"`);
      if (line.includes("{")) {
        foundFunctionStart = true;
        this.debug(`    analyzeMemberAccess: Found function body start at line ${i + 1}`);
        break;
      }
    }
    
    if (!foundFunctionStart) {
      this.debug(`    analyzeMemberAccess: No function body found for ${symbol.qualifiedName}`);
      return;
    }
    
    // Scan function body for member access
    for (let i = startIdx; i < lines.length && i < startIdx + 100; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces;
      braceDepth -= closeBraces;

      // Only analyze inside function body
      if (foundFunctionStart && braceDepth > 0) {
        // Member access tracking (same patterns as in control flow analysis)
        // Pattern 1: object.member = value (write)
        const memberWriteMatches = line.matchAll(/\b(\w+)\.(\w+)\s*=/g);
        for (const match of memberWriteMatches) {
          const [, objectName, memberName] = match;
          if (objectName !== 'this') {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName,
              relationshipType: "writes_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_write"
            });
            this.debug(`      Found field write: ${objectName}.${memberName} at line ${lineNum}`);
          }
        }
        
        // Pattern 2: object.member in expressions (read)
        const memberAccessMatches = line.matchAll(/\b(\w+)\.(\w+)(?!\s*=)/g);
        for (const match of memberAccessMatches) {
          const [, objectName, memberName] = match;
          const beforeMatch = line.substring(0, match.index);
          const isBeingRead = beforeMatch.match(/=\s*$/) || 
                             line.substring(match.index! + match[0].length).match(/^\s*[;,\)\+\-\*\/\|\&<>]/) ||
                             beforeMatch.match(/return\s+$/);
          
          if (isBeingRead && objectName !== 'this') {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName,
              relationshipType: "reads_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_read"
            });
            this.debug(`      Found field read: ${objectName}.${memberName} at line ${lineNum}`);
          }
        }
        
        // Pattern 3: Arrow operator obj->member
        const arrowAccessMatches = line.matchAll(/\b(\w+)->(\w+)/g);
        for (const match of arrowAccessMatches) {
          const [fullMatch, objectName, memberName] = match;
          const isWrite = line.substring(match.index! + fullMatch.length).match(/^\s*=/);
          
          context.relationships.push({
            fromName: symbol.qualifiedName,
            toName: memberName,
            relationshipType: isWrite ? "writes_field" : "reads_field",
            confidence: 0.8,
            lineNumber: lineNum,
            columnNumber: match.index || 0,
            crossLanguage: false,
            sourceContext: `${objectName}->${memberName}`,
            usagePattern: isWrite ? "field_write" : "field_read"
          });
          this.debug(`      Found field ${isWrite ? 'write' : 'read'}: ${objectName}->${memberName} at line ${lineNum}`);
        }
      }

      // Exit when we close the function
      if (foundFunctionStart && braceDepth <= 0) {
        break;
      }
    }
  }

  private async analyzePatternBasedControlFlow(
    symbol: SymbolInfo,
    lines: string[],
    startIdx: number,
    context: CppVisitorContext
  ): Promise<void> {
    context.stats.controlFlowAnalyzed++;

    let braceDepth = 0;
    let functionStartDepth = 0;
    let foundFunctionStart = false;

    // Create entry block
    context.controlFlowData.blocks.push({
      symbolName: symbol.qualifiedName,
      blockType: "entry",
      startLine: symbol.line,
      endLine: symbol.line,
      complexity: 1,
    });

    // Track control flow blocks with their actual end positions
    const pendingBlocks: Array<{
      block: any;
      startBraceDepth: number;
      startLineNum: number;
    }> = [];

    // First, find where the function body actually starts
    for (let i = startIdx; i < lines.length && i < startIdx + 10; i++) {
      const line = lines[i];
      if (line.includes("{")) {
        foundFunctionStart = true;
        functionStartDepth =
          braceDepth +
          (line.match(/{/g) || []).length -
          (line.match(/}/g) || []).length;
        break;
      }
    }

    // Scan function body
    for (let i = startIdx; i < lines.length && i < startIdx + 200; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      // Check for control structures before updating brace depth
      if (/\bif\s*\(/.test(line)) {
        const block = {
          symbolName: symbol.qualifiedName,
          blockType: "conditional",
          startLine: lineNum,
          endLine: lineNum, // Will be updated when we find the closing brace
          condition: "if",
          complexity: 1,
        };
        // Store the brace depth AFTER this line's opening brace
        const depthAfterOpen = braceDepth + openBraces;
        pendingBlocks.push({
          block,
          startBraceDepth: depthAfterOpen,
          startLineNum: lineNum,
        });
      } else if (/\b(for|while)\s*\(/.test(line)) {
        const loopType = line.includes("for") ? "for" : "while";
        const block = {
          symbolName: symbol.qualifiedName,
          blockType: "loop",
          startLine: lineNum,
          endLine: lineNum, // Will be updated when we find the closing brace
          condition: loopType,
          loopType: loopType,
          complexity: 2,
        };
        // Store the brace depth AFTER this line's opening brace
        const depthAfterOpen = braceDepth + openBraces;
        pendingBlocks.push({
          block,
          startBraceDepth: depthAfterOpen,
          startLineNum: lineNum,
        });
      } else if (/\bswitch\s*\(/.test(line)) {
        const block = {
          symbolName: symbol.qualifiedName,
          blockType: "switch",
          startLine: lineNum,
          endLine: lineNum, // Will be updated when we find the closing brace
          condition: "switch",
          complexity: 2,
        };
        // Store the brace depth AFTER this line's opening brace
        const depthAfterOpen = braceDepth + openBraces;
        pendingBlocks.push({
          block,
          startBraceDepth: depthAfterOpen,
          startLineNum: lineNum,
        });
      }

      // Update brace depth
      braceDepth += openBraces;
      braceDepth -= closeBraces;

      // Check if any pending blocks should be closed
      // Process in reverse order to handle nested blocks correctly
      for (let j = pendingBlocks.length - 1; j >= 0; j--) {
        const pending = pendingBlocks[j];
        // A block ends when we return to a brace depth less than when it started
        if (braceDepth < pending.startBraceDepth) {
          // This block has ended
          pending.block.endLine = lineNum;
          context.controlFlowData.blocks.push(pending.block);
          pendingBlocks.splice(j, 1);
        }
      }

      if (
        braceDepth > 0 ||
        (foundFunctionStart && braceDepth >= functionStartDepth)
      ) {
        // Function calls and method calls
        // Pattern 1: Regular function calls (functionName or namespace::function)
        const functionCallMatches = line.matchAll(/\b(\w+(?:::\w+)*)\s*\(/g);
        // Pattern 2: Method calls (obj.method or obj->method)  
        const methodCallMatches = line.matchAll(/\b(\w+)(?:\.|\->)(\w+)\s*\(/g);
        // Process regular function calls
        for (const match of functionCallMatches) {
          const targetFunction = match[1];
          if (
            ![
              "if",
              "while",
              "for",
              "switch",
              "catch",
              "sizeof",
              "typeof",
              "return",
            ].includes(targetFunction)
          ) {
            context.controlFlowData.calls.push({
              callerName: symbol.qualifiedName,
              targetFunction,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              callType: "direct",
            });
            
            // Also create a relationship record for unified access
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: targetFunction,
              relationshipType: "calls",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: targetFunction + "(...)",
              usagePattern: "function_call"
            });
          }
        }
        
        // Process method calls (obj.method() or obj->method())
        for (const match of methodCallMatches) {
          const [fullMatch, objectName, methodName] = match;
          // Skip 'this' for now to avoid noise
          if (objectName !== 'this') {
            const targetMethod = objectName + "." + methodName;
            
            context.controlFlowData.calls.push({
              callerName: symbol.qualifiedName,
              targetFunction: targetMethod,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              callType: "method",
            });
            
            // Create relationship record
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: methodName, // We'll resolve this to the actual method symbol later
              relationshipType: "calls",
              confidence: 0.7, // Slightly lower confidence for method calls
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: fullMatch,
              usagePattern: "method_call"
            });
          }
        }
        
        // Member access tracking
        // Pattern 1: object.member = value (write)
        const memberWriteMatches = line.matchAll(/\b(\w+)\.(\w+)\s*=/g);
        for (const match of memberWriteMatches) {
          const [, objectName, memberName] = match;
          // Skip 'this' for now - focus on local variables and parameters
          if (objectName !== 'this') {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName, // We'll resolve this to actual member symbol later
              relationshipType: "writes_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_write"
            });
          }
        }
        
        // Pattern 2: object.member in expressions (read)
        // Exclude assignments by checking context
        const memberAccessMatches = line.matchAll(/\b(\w+)\.(\w+)(?!\s*=)/g);
        for (const match of memberAccessMatches) {
          const [, objectName, memberName] = match;
          // Check if this is part of a larger assignment (e.g., x = obj.member)
          const beforeMatch = line.substring(0, match.index);
          const isBeingRead = beforeMatch.match(/=\s*$/) || 
                             line.substring(match.index! + match[0].length).match(/^\s*[;,\)\+\-\*\/\|\&<>]/) ||
                             beforeMatch.match(/return\s+$/);
          
          if (isBeingRead && objectName !== 'this') {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName, // We'll resolve this to actual member symbol later
              relationshipType: "reads_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_read"
            });
          }
        }
        
        // Pattern 3: Arrow operator obj->member
        const arrowAccessMatches = line.matchAll(/\b(\w+)->(\w+)/g);
        for (const match of arrowAccessMatches) {
          const [fullMatch, objectName, memberName] = match;
          const isWrite = line.substring(match.index! + fullMatch.length).match(/^\s*=/);
          
          context.relationships.push({
            fromName: symbol.qualifiedName,
            toName: memberName,
            relationshipType: isWrite ? "writes_field" : "reads_field",
            confidence: 0.8,
            lineNumber: lineNum,
            columnNumber: match.index || 0,
            crossLanguage: false,
            sourceContext: `${objectName}->${memberName}`,
            usagePattern: isWrite ? "field_write" : "field_read"
          });
        }
      }

      // Check if we've exited the function
      if (
        foundFunctionStart &&
        braceDepth < functionStartDepth &&
        i > startIdx
      ) {
        symbol.endLine = lineNum;
        // Close any remaining pending blocks
        for (const pending of pendingBlocks) {
          pending.block.endLine = lineNum;
          context.controlFlowData.blocks.push(pending.block);
        }
        break;
      }
    }

    // Create exit block
    context.controlFlowData.blocks.push({
      symbolName: symbol.qualifiedName,
      blockType: "exit",
      startLine: symbol.endLine || symbol.line,
      endLine: symbol.endLine || symbol.line,
      complexity: 1,
    });
  }

  // Handler methods for visitor pattern

  private handleClass(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return null;

    const name = this.getNodeText(nameNode, context.content);
    const qualifiedName = this.buildQualifiedName(name, context);

    const symbol: SymbolInfo = {
      name,
      qualifiedName,
      kind: node.type === "class_specifier" ? "class" : "struct",
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
      semanticTags: [node.type === "class_specifier" ? "class" : "struct"],
      complexity: 1,
      confidence: 0.95,
      isDefinition: true,
      isExported: context.insideExportBlock,
      isAsync: false,
      namespace: context.resolutionContext.currentNamespace,
    };

    // Cache for fast resolution
    this.cacheSymbol(symbol);

    return symbol;
  }

  private handleFunction(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    // Implementation similar to pattern-based but using AST node
    // ... (abbreviated for brevity)
    return null;
  }

  private handleNamespace(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return null;

    const name = this.getNodeText(nameNode, context.content);

    // Update resolution context
    context.resolutionContext.currentNamespace = name;

    const symbol: SymbolInfo = {
      name,
      qualifiedName: name,
      kind: "namespace",
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      semanticTags: ["namespace"],
      complexity: 0,
      confidence: 1.0,
      isDefinition: true,
      isExported: node.type === "export_declaration",
      isAsync: false,
    };

    return symbol;
  }

  private handleVariable(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    // Variable handling
    return null;
  }

  private handleEnum(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    // Enum handling
    return null;
  }

  private handleTypedef(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    // Typedef handling
    return null;
  }

  private handleCall(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): RelationshipInfo | null {
    const context = ctx as CppVisitorContext;
    const functionNode = node.childForFieldName("function");
    if (!functionNode) return null;

    const targetName = this.getNodeText(functionNode, context.content);

    // Resolve the target symbol using cache
    const resolved = OptimizedCppTreeSitterParser.symbolCache.resolveSymbol(
      targetName,
      context.resolutionContext
    );

    if (resolved) {
      const currentScope = context.scopeStack[context.scopeStack.length - 1];
      return {
        fromName: currentScope?.qualifiedName || "unknown",
        toName: resolved.qualifiedName,
        relationshipType: "calls",
        confidence: 0.95,
        lineNumber: node.startPosition.row + 1,
        crossLanguage: false,
      };
    }

    return null;
  }

  private handleInheritance(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): RelationshipInfo[] | null {
    const context = ctx as CppVisitorContext;
    const relationships: RelationshipInfo[] = [];

    // Get the class name from parent node
    const classNode = node.parent;
    if (!classNode) return null;

    const classNameNode = classNode.childForFieldName("name");
    if (!classNameNode) return null;

    const className = this.getNodeText(classNameNode, context.content);

    // Parse base classes from inheritance node
    const inheritanceText = this.getNodeText(node, context.content);

    // Extract base classes (handle: "public Base1, private Base2")
    const baseClassRegex =
      /(?:public|private|protected)?\s*([A-Za-z_][\w:]*)(?:<[^>]+>)?/g;
    let match;

    while ((match = baseClassRegex.exec(inheritanceText)) !== null) {
      const baseClass = match[1];
      if (baseClass && baseClass !== className) {
        // Extract simple class name (remove namespace qualification)
        const baseSimpleName = baseClass.includes("::")
          ? baseClass.split("::").pop()!
          : baseClass;

        relationships.push({
          fromName: className,
          toName: baseSimpleName,
          relationshipType: "inherits",
          confidence: 1.0,
          lineNumber: node.startPosition.row + 1,
          crossLanguage: false,
        });

        console.log(
          `[OPTIMIZED INHERITANCE] Found: ${className} -> ${baseSimpleName} (line ${
            node.startPosition.row + 1
          })`
        );
      }
    }

    return relationships.length > 0 ? relationships : null;
  }

  private handleImport(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): RelationshipInfo | null {
    // Import handling
    return null;
  }

  private handleTypeReference(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): RelationshipInfo | null {
    // Type reference handling
    return null;
  }

  private handlePattern(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): PatternInfo | null {
    // Pattern detection
    return null;
  }

  private handleEnterScope(scope: ScopeInfo, ctx: VisitorContext): void {
    const context = ctx as CppVisitorContext;
    if (scope.type === "namespace") {
      context.resolutionContext.currentNamespace = scope.qualifiedName;
    }
  }

  private handleExitScope(scope: ScopeInfo, ctx: VisitorContext): void {
    const context = ctx as CppVisitorContext;
    if (scope.type === "namespace") {
      const parentScope = context.scopeStack[context.scopeStack.length - 2];
      context.resolutionContext.currentNamespace = parentScope?.qualifiedName;
    }
  }

  private buildQualifiedName(name: string, context: CppVisitorContext): string {
    const parts: string[] = [];

    if (context.resolutionContext.currentNamespace) {
      parts.push(context.resolutionContext.currentNamespace);
    }

    for (const scope of context.scopeStack) {
      if (scope.type === "class" || scope.type === "namespace") {
        parts.push(scope.name);
      }
    }

    parts.push(name);
    return parts.join("::");
  }

  private getNodeText(node: Parser.SyntaxNode, content: string): string {
    return content.substring(node.startIndex, node.endIndex);
  }

  private cacheSymbol(symbol: SymbolInfo): void {
    OptimizedCppTreeSitterParser.symbolCache.addSymbol({
      id: Date.now(), // Temporary ID
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      kind: symbol.kind,
      filePath: symbol.filePath,
      line: symbol.line,
      column: symbol.column,
      namespace: symbol.namespace,
      semanticTags: symbol.semanticTags,
      childIds: [],
      callers: [],
      callees: [],
      inheritsFrom: [],
      inheritedBy: [],
      uses: [],
      usedBy: [],
      lastAccessed: Date.now(),
      accessCount: 0,
    });
  }

  /**
   * Get cache statistics
   */
  static getCacheStatistics() {
    return OptimizedCppTreeSitterParser.symbolCache.getStatistics();
  }

  /**
   * Clear the symbol cache
   */
  static clearCache() {
    OptimizedCppTreeSitterParser.symbolCache.clear();
  }

  /**
   * Clear all caches including parent class caches
   */
  static clearAllCaches() {
    OptimizedTreeSitterBaseParser.clearAllCaches();
    OptimizedCppTreeSitterParser.symbolCache.clear();
    console.log("🧹 Cleared C++ parser caches");
  }
}
