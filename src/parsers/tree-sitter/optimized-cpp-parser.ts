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
      // Initialize base parser first
      // Initialize base parser first (note: initialize is abstract, calling from constructor)
      
      // Use native tree-sitter-cpp (Node.js API) - modern v0.23.4
      try {
        console.log("[CppParser] Attempting to load tree-sitter-cpp...");
        
        // Try different import strategies for tree-sitter-cpp
        let cppLanguage;
        try {
          // Strategy 1: Direct require
          cppLanguage = require("tree-sitter-cpp");
          console.log("[CppParser] Direct require succeeded");
        } catch (e1: any) {
          console.log("[CppParser] Direct require failed:", e1.message);
          try {
            // Strategy 2: Dynamic import
            const module = await import("tree-sitter-cpp");
            cppLanguage = module.default || module;
            console.log("[CppParser] Dynamic import succeeded");
          } catch (e2: any) {
            console.log("[CppParser] Dynamic import failed:", e2.message);
            throw new Error(`All import strategies failed: ${(e1 as any).message}, ${e2.message}`);
          }
        }
        
        if (cppLanguage && this.parser) {
          this.parser.setLanguage(cppLanguage);
          this.useTreeSitter = true;
          console.log("✅ [CppParser] Successfully loaded tree-sitter-cpp v0.23.4!");
          return;
        } else {
          throw new Error("Language or parser is null after loading");
        }
      } catch (error) {
        console.error("❌ [CppParser] Failed to load tree-sitter-cpp:", error);
        this.debug(`Failed to load tree-sitter-cpp: ${error}`);
      }

      // Fall back to pattern-based parsing
      this.useTreeSitter = false;
      console.warn("⚠️ [CppParser] Using optimized pattern-based parsing for C++");
      this.debug("Using optimized pattern-based parsing for C++");
    } catch (error) {
      console.error("❌ [CppParser] Failed to initialize C++ parser:", error);
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

    // Always try tree-sitter first when available, regardless of file size
    if (this.useTreeSitter) {
      try {
        // Tree-sitter parsing enabled
        this.debug(`Using tree-sitter parsing for: ${filePath}`);
        const tree = this.parser.parse(content);
        if (!tree) {
          throw new Error("Parser returned null tree");
        }
        
        // Check for parsing errors but don't fail - tree-sitter can still extract symbols from trees with errors
        if (tree.rootNode.hasError) {
          this.debug(`Tree has parsing errors but continuing with symbol extraction for: ${filePath}`);
        }
        // Create proper C++ visitor context
        const cppContext: CppVisitorContext = {
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

        result = await this.visitor.traverseWithContext(tree, cppContext);
        
        // Tree-sitter parsing completed successfully
      } catch (error) {
        if (filePath.includes('RenderingTypes.ixx')) {
          console.log(`❌ TARGETED: Tree-sitter failed for ${filePath}, falling back to patterns: ${error}`);
        }
        this.debug(
          `Tree-sitter parsing failed, falling back to patterns: ${error}`
        );
        result = await this.performPatternBasedExtraction(content, filePath);
        
        // Note: Semantic intelligence will use pattern-based data only when tree-sitter fails
      }
    } else {
      // Only use pattern-based parsing if tree-sitter is completely unavailable
      if (filePath.includes('RenderingTypes.ixx')) {
        console.log(`❌ TARGETED: Tree-sitter unavailable, using pattern-based parsing for: ${filePath}`);
      }
      this.debug(
        `Tree-sitter unavailable, using pattern-based parsing for: ${filePath}`
      );
      result = await this.performPatternBasedExtraction(content, filePath);
      
      // Note: Semantic intelligence will use pattern-based data only when tree-sitter unavailable
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
      onTemplate: this.handleTemplate.bind(this),

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
      ["structured_binding_declaration", "onVariable"],
      ["declaration", "onVariable"], // For structured bindings and inline variables
      ["init_declarator", "onVariable"], // For inline variables and other declarations

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
      ["template_declaration", "onTemplate"],
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
          parentScope: undefined,
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
        this.debug(
          `    Complexity check: ${complexity} >= 2 && ${
            context.stats.controlFlowAnalyzed
          } < 10 = ${complexity >= 2 && context.stats.controlFlowAnalyzed < 10}`
        );
        this.debug(
          `    Symbol kind check: ${
            symbol.kind
          } in [function, method, constructor] = ${
            symbol.kind === "function" ||
            symbol.kind === "method" ||
            symbol.kind === "constructor"
          }`
        );

        if (complexity >= 2 && context.stats.controlFlowAnalyzed < 10) {
          context.stats.complexityChecks++;
          this.debug(`    Analyzing control flow for ${symbol.qualifiedName}`);
          await this.analyzePatternBasedControlFlow(symbol, lines, i, context);
          const blocksFound = context.controlFlowData.blocks.filter(
            (b) => b.symbolName === symbol?.qualifiedName
          ).length;
          this.debug(`    Found ${blocksFound} control flow blocks`);
        } else if (
          symbol.kind === "function" ||
          symbol.kind === "method" ||
          symbol.kind === "constructor"
        ) {
          // For simple functions, still analyze for member access patterns
          this.debug(
            `    Analyzing member access for simple function: ${symbol.qualifiedName}`
          );
          await this.analyzeMemberAccess(symbol, lines, i, context);
        } else {
          this.debug(
            `    Skipping analysis for ${symbol.qualifiedName} (kind: ${symbol.kind}, complexity: ${complexity})`
          );
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

    this.debug(
      `    analyzeMemberAccess: Starting analysis for ${
        symbol.qualifiedName
      } at line ${startIdx + 1}`
    );

    // Find where the function body starts
    for (let i = startIdx; i < lines.length && i < startIdx + 10; i++) {
      const line = lines[i];
      this.debug(
        `    analyzeMemberAccess: Checking line ${i + 1}: "${line.trim()}"`
      );
      if (line.includes("{")) {
        foundFunctionStart = true;
        this.debug(
          `    analyzeMemberAccess: Found function body start at line ${i + 1}`
        );
        break;
      }
    }

    if (!foundFunctionStart) {
      this.debug(
        `    analyzeMemberAccess: No function body found for ${symbol.qualifiedName}`
      );
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
          if (objectName !== "this") {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName,
              relationshipType: "writes_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_write",
            });
            this.debug(
              `      Found field write: ${objectName}.${memberName} at line ${lineNum}`
            );
          }
        }

        // Pattern 2: object.member in expressions (read)
        const memberAccessMatches = line.matchAll(/\b(\w+)\.(\w+)(?!\s*=)/g);
        for (const match of memberAccessMatches) {
          const [, objectName, memberName] = match;
          const beforeMatch = line.substring(0, match.index);
          const isBeingRead =
            beforeMatch.match(/=\s*$/) ||
            line
              .substring(match.index! + match[0].length)
              .match(/^\s*[;,\)\+\-\*\/\|\&<>]/) ||
            beforeMatch.match(/return\s+$/);

          if (isBeingRead && objectName !== "this") {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName,
              relationshipType: "reads_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_read",
            });
            this.debug(
              `      Found field read: ${objectName}.${memberName} at line ${lineNum}`
            );
          }
        }

        // Pattern 3: Arrow operator obj->member
        const arrowAccessMatches = line.matchAll(/\b(\w+)->(\w+)/g);
        for (const match of arrowAccessMatches) {
          const [fullMatch, objectName, memberName] = match;
          const isWrite = line
            .substring(match.index! + fullMatch.length)
            .match(/^\s*=/);

          context.relationships.push({
            fromName: symbol.qualifiedName,
            toName: memberName,
            relationshipType: isWrite ? "writes_field" : "reads_field",
            confidence: 0.8,
            lineNumber: lineNum,
            columnNumber: match.index || 0,
            crossLanguage: false,
            sourceContext: `${objectName}->${memberName}`,
            usagePattern: isWrite ? "field_write" : "field_read",
          });
          this.debug(
            `      Found field ${
              isWrite ? "write" : "read"
            }: ${objectName}->${memberName} at line ${lineNum}`
          );
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
              usagePattern: "function_call",
            });
          }
        }

        // Process method calls (obj.method() or obj->method())
        for (const match of methodCallMatches) {
          const [fullMatch, objectName, methodName] = match;
          // Skip 'this' for now to avoid noise
          if (objectName !== "this") {
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
              usagePattern: "method_call",
            });
          }
        }

        // Member access tracking
        // Pattern 1: object.member = value (write)
        const memberWriteMatches = line.matchAll(/\b(\w+)\.(\w+)\s*=/g);
        for (const match of memberWriteMatches) {
          const [, objectName, memberName] = match;
          // Skip 'this' for now - focus on local variables and parameters
          if (objectName !== "this") {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName, // We'll resolve this to actual member symbol later
              relationshipType: "writes_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_write",
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
          const isBeingRead =
            beforeMatch.match(/=\s*$/) ||
            line
              .substring(match.index! + match[0].length)
              .match(/^\s*[;,\)\+\-\*\/\|\&<>]/) ||
            beforeMatch.match(/return\s+$/);

          if (isBeingRead && objectName !== "this") {
            context.relationships.push({
              fromName: symbol.qualifiedName,
              toName: memberName, // We'll resolve this to actual member symbol later
              relationshipType: "reads_field",
              confidence: 0.8,
              lineNumber: lineNum,
              columnNumber: match.index || 0,
              crossLanguage: false,
              sourceContext: `${objectName}.${memberName}`,
              usagePattern: "field_read",
            });
          }
        }

        // Pattern 3: Arrow operator obj->member
        const arrowAccessMatches = line.matchAll(/\b(\w+)->(\w+)/g);
        for (const match of arrowAccessMatches) {
          const [fullMatch, objectName, memberName] = match;
          const isWrite = line
            .substring(match.index! + fullMatch.length)
            .match(/^\s*=/);

          context.relationships.push({
            fromName: symbol.qualifiedName,
            toName: memberName,
            relationshipType: isWrite ? "writes_field" : "reads_field",
            confidence: 0.8,
            lineNumber: lineNum,
            columnNumber: match.index || 0,
            crossLanguage: false,
            sourceContext: `${objectName}->${memberName}`,
            usagePattern: isWrite ? "field_write" : "field_read",
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
    // Use AST-based qualified name construction for consistency with fields
    const qualifiedName = this.buildStructQualifiedName(name, node, context);

    // Struct creation successful

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

    // Don't manually manage scope stack - it's causing qualified name explosion

    return symbol;
  }

  private handleFunction(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    const content = context.content;
    
    // Get function name
    const nameNode = node.childForFieldName('declarator');
    if (!nameNode) return null;
    
    // Extract function name from the declarator
    let functionName = '';
    let isMethod = false;
    
    // Handle different declarator types
    if (nameNode.type === 'function_declarator') {
      // First try the 'declarator' field (works for methods in classes/structs)
      const funcNameNode = nameNode.childForFieldName('declarator');
      if (funcNameNode) {
        if (funcNameNode.type === 'field_identifier') {
          functionName = this.getNodeText(funcNameNode, content);
          isMethod = true; // Function inside a class/struct
        } else if (funcNameNode.type === 'identifier') {
          functionName = this.getNodeText(funcNameNode, content);
        } else {
          // Handle other declarator types (e.g., qualified_identifier)
          functionName = this.getNodeText(funcNameNode, content);
        }
      } else {
        // Fallback: look for identifier/field_identifier in children
        for (let i = 0; i < nameNode.childCount; i++) {
          const child = nameNode.child(i);
          if (child && (child.type === 'field_identifier' || child.type === 'identifier')) {
            functionName = this.getNodeText(child, content);
            isMethod = child.type === 'field_identifier';
            break;
          }
        }
      }
    } else if (nameNode.type === 'identifier' || nameNode.type === 'field_identifier') {
      // Direct identifier (simpler case)
      functionName = this.getNodeText(nameNode, content);
      isMethod = nameNode.type === 'field_identifier';
    }
    
    if (!functionName) {
      this.debug(`Failed to extract function name from node type: ${nameNode.type}`);
      return null;
    }
    
    // Get return type
    const typeNode = node.childForFieldName('type');
    const returnType = typeNode ? this.getNodeText(typeNode, content) : 'void';
    
    // Build qualified name by finding parent struct/class
    let parentScope: string | undefined;
    if (isMethod) {
      // For methods, find the containing struct/class
      let current = node.parent;
      while (current) {
        if (current.type === 'struct_specifier' || current.type === 'class_specifier') {
          const structNameNode = current.childForFieldName('name');
          if (structNameNode) {
            const structName = this.getNodeText(structNameNode, content);
            parentScope = this.buildParentScope(structName, context, current);
            break;
          }
        }
        current = current.parent;
      }
    } else {
      // For non-methods, use the namespace context
      parentScope = context.resolutionContext.currentNamespace;
    }
    
    const qualifiedName = parentScope ? `${parentScope}::${functionName}` : functionName;
    
    // Get function signature
    const parametersNode = nameNode.childForFieldName('parameters');
    let signature = functionName;
    if (parametersNode) {
      const paramText = this.getNodeText(parametersNode, content);
      signature = `${functionName}${paramText}`;
    }
    
    // Check for const method
    let isConst = false;
    // Check in the declarator node for const qualifier (for methods)
    if (nameNode.type === 'function_declarator') {
      for (let i = 0; i < nameNode.childCount; i++) {
        const child = nameNode.child(i);
        if (child && child.type === 'type_qualifier' && this.getNodeText(child, content) === 'const') {
          isConst = true;
          break;
        }
      }
    }
    // Also check at the function definition level (for other cases)
    if (!isConst) {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'type_qualifier' && this.getNodeText(child, content) === 'const') {
          isConst = true;
          break;
        }
      }
    }
    
    if (isConst) {
      signature += ' const';
    }
    
    const symbol: SymbolInfo = {
      name: functionName,
      qualifiedName: qualifiedName,
      kind: isMethod ? 'method' : 'function',
      filePath: context.filePath,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column,
      signature: signature,
      returnType: returnType,
      semanticTags: [],
      complexity: 1,
      confidence: 0.9,
      isDefinition: true,
      isExported: false,
      isAsync: false,
      namespace: context.resolutionContext.currentNamespace,
      parentScope: parentScope
    };
    
    // Cache for fast resolution
    this.cacheSymbol(symbol);
    
    return symbol;
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
    const context = ctx as CppVisitorContext;

    // Handle general declarations that might contain structured bindings or inline variables
    if (node.type === "declaration") {
      // Check if this is a structured binding by looking for structured_binding_declarator child
      const hasStructuredBinding = this.findNodeByType(node, 'structured_binding_declarator');
      if (hasStructuredBinding) {
        return this.handleStructuredBindingFromDeclaration(node, ctx);
      }
      
      // Check if this has inline keyword for inline variables
      const hasInline = node.text.includes('inline');
      if (hasInline) {
        return this.handleInlineVariableFromDeclaration(node, ctx);
      }
      
      // Handle as regular declaration
      return this.handleRegularDeclaration(node, ctx);
    }

    // Handle structured binding declarations (C++17) - direct type
    if (node.type === "structured_binding_declaration") {
      return this.handleStructuredBinding(node, ctx);
    }

    // Handle field declarations (struct/class members)
    if (node.type === "field_declaration") {
      // Get the declarator (variable name)
      const declarator = node.childForFieldName("declarator");
      if (!declarator) return null;

      const name = this.getNodeText(declarator, context.content);

      // Get the type from the type specifier
      const typeNode = node.childForFieldName("type");
      const returnType = typeNode
        ? this.getNodeText(typeNode, context.content)
        : "unknown";

      // Find the parent scope by traversing up the AST
      let parentScope: string | undefined;
      let parent = node.parent;
      while (parent) {
        if (
          parent.type === "class_specifier" ||
          parent.type === "struct_specifier"
        ) {
          const nameNode = parent.childForFieldName("name");
          if (nameNode) {
            const parentName = this.getNodeText(nameNode, context.content);
            
            // Build parent scope manually to avoid duplication
            // The parent struct should have the same namespace context as the field
            parentScope = this.buildParentScope(parentName, context, parent);

            // Safeguard: Log any suspicious qualified names for debugging
            if (parentScope && (parentScope.split('::').length > 3 || parentScope.includes(parentName + '::' + parentName))) {
              console.log(`⚠️  SAFEGUARD: Suspicious parent scope detected: ${parentScope} for field ${name}`);
            }

            break;
          }
        }
        parent = parent.parent;
      }
      
      // Build qualified name using the found parent scope
      const qualifiedName = parentScope ? `${parentScope}::${name}` : name;

      // More targeted logging
      if (!parentScope && name === "width") {
        console.log(
          `❌ TARGETED: Field 'width' has no parentScope - AST parent chain:`,
          node.parent?.type,
          node.parent?.parent?.type
        );
      }

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: "field",
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        returnType,
        semanticTags: ["field", "member"],
        complexity: 0,
        confidence: 0.95,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        parentScope, // This will be resolved to parentSymbolId later
      };

      // Field symbols are now being returned correctly

      return symbol;
    }

    // Handle init_declarator nodes (which may contain inline variables)
    if (node.type === "init_declarator") {
      // For init_declarator, we need to find the parent declaration for context
      let parentDeclaration = node.parent;
      while (parentDeclaration && parentDeclaration.type !== "variable_declaration") {
        parentDeclaration = parentDeclaration.parent;
      }
      
      if (parentDeclaration) {
        // Process this as a variable declaration with the parent context
        return this.handleInitDeclarator(node, parentDeclaration, context);
      }
    }

    // Handle regular variable declarations
    if (node.type === "variable_declaration") {
      const declarator = node.childForFieldName("declarator");
      if (!declarator) return null;

      const name = this.getNodeText(declarator, context.content);
      const qualifiedName = this.buildQualifiedName(name, context);

      const typeNode = node.childForFieldName("type");
      const returnType = typeNode
        ? this.getNodeText(typeNode, context.content)
        : "unknown";

      // Enhanced modifier detection using AST traversal and text fallback
      let isInline = false;
      let isConstexpr = false;
      let isConst = false;
      let isStatic = false;
      let isThreadLocal = false;
      let isExtern = false;
      let isMutable = false;
      
      // First, check AST nodes for storage class specifiers and type qualifiers
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        
        const childText = this.getNodeText(child, context.content);
        
        // Check storage class specifiers
        if (child.type === 'storage_class_specifier') {
          switch (childText) {
            case 'inline': isInline = true; break;
            case 'static': isStatic = true; break;
            case 'extern': isExtern = true; break;
            case 'thread_local': isThreadLocal = true; break;
          }
        }
        
        // Check type qualifiers
        if (child.type === 'type_qualifier') {
          switch (childText) {
            case 'const': isConst = true; break;
            case 'mutable': isMutable = true; break;
          }
        }
        
        // Check for constexpr (which might appear as its own node type)
        if (child.type === 'constexpr' || childText === 'constexpr') {
          isConstexpr = true;
        }
      }
      
      // Fallback to text-based detection for cases where AST doesn't capture everything
      const fullText = node.text;
      if (!isInline && /\binline\b/.test(fullText)) isInline = true;
      if (!isConstexpr && /\bconstexpr\b/.test(fullText)) isConstexpr = true;
      if (!isConst && /\bconst\b/.test(fullText)) isConst = true;
      if (!isStatic && /\bstatic\b/.test(fullText)) isStatic = true;
      if (!isThreadLocal && /\bthread_local\b/.test(fullText)) isThreadLocal = true;
      if (!isExtern && /\bextern\b/.test(fullText)) isExtern = true;
      if (!isMutable && /\bmutable\b/.test(fullText)) isMutable = true;

      // Build semantic tags based on modifiers
      const tags = ['variable'];
      if (isInline) {
        tags.push('inline');
        tags.push('modern_cpp'); // Inline variables are C++17 feature
      }
      if (isConstexpr) tags.push('constexpr');
      if (isConst) tags.push('const');
      if (isStatic) tags.push('static');
      if (isThreadLocal) tags.push('thread_local');
      if (isExtern) tags.push('extern');
      if (isMutable) tags.push('mutable');

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: "variable",
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        returnType,
        signature: fullText.trim(),
        semanticTags: tags,
        complexity: 0,
        confidence: 0.9,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        languageFeatures: {
          isInline: isInline,
          isConstexpr: isConstexpr,
          isConst: isConst,
          isStatic: isStatic,
          isThreadLocal: isThreadLocal,
          isExtern: isExtern,
          isMutable: isMutable,
          modifiers: tags.filter(tag => tag !== 'variable') // All modifiers except 'variable'
        }
      };

      // Enhanced debug logging for modern C++ features
      if (isInline) {
        this.debug(`✅ Detected inline variable: ${name} (C++17 feature)`);
      }
      if (isConstexpr) {
        this.debug(`✅ Detected constexpr variable: ${name}`);
      }
      if (tags.some(tag => ['inline', 'constexpr', 'modern_cpp'].includes(tag))) {
        this.debug(`🔍 Modern C++ variable detected: ${name} with tags: [${tags.join(', ')}]`);
      }

      return symbol;
    }

    return null;
  }

  private handleInitDeclarator(
    node: Parser.SyntaxNode,
    parentDeclaration: Parser.SyntaxNode,
    context: CppVisitorContext
  ): SymbolInfo | null {
    try {
      // Extract the variable name from the init_declarator
      const declarator = node.childForFieldName("declarator") || node.child(0);
      if (!declarator) return null;

      const name = this.getNodeText(declarator, context.content);
      if (!name) return null;

      const qualifiedName = this.buildQualifiedName(name, context);

      // Get type information from the parent declaration
      const typeNode = parentDeclaration.childForFieldName("type");
      const returnType = typeNode
        ? this.getNodeText(typeNode, context.content)
        : "unknown";

      // Check for modifiers in both the parent declaration and the declarator
      let isInline = false;
      let isConstexpr = false;
      let isConst = false;
      let isStatic = false;
      let isThreadLocal = false;
      let isExtern = false;
      let isMutable = false;

      // Check parent declaration for storage class specifiers
      for (let i = 0; i < parentDeclaration.childCount; i++) {
        const child = parentDeclaration.child(i);
        if (!child) continue;
        
        const childText = this.getNodeText(child, context.content);
        
        if (child.type === 'storage_class_specifier') {
          switch (childText) {
            case 'inline': isInline = true; break;
            case 'static': isStatic = true; break;
            case 'extern': isExtern = true; break;
            case 'thread_local': isThreadLocal = true; break;
          }
        }
        
        if (child.type === 'type_qualifier') {
          switch (childText) {
            case 'const': isConst = true; break;
            case 'mutable': isMutable = true; break;
          }
        }
        
        if (child.type === 'constexpr' || childText === 'constexpr') {
          isConstexpr = true;
        }
      }

      // Fallback to text-based detection
      const fullText = parentDeclaration.text;
      if (!isInline && /\binline\b/.test(fullText)) isInline = true;
      if (!isConstexpr && /\bconstexpr\b/.test(fullText)) isConstexpr = true;
      if (!isConst && /\bconst\b/.test(fullText)) isConst = true;
      if (!isStatic && /\bstatic\b/.test(fullText)) isStatic = true;
      if (!isThreadLocal && /\bthread_local\b/.test(fullText)) isThreadLocal = true;
      if (!isExtern && /\bextern\b/.test(fullText)) isExtern = true;
      if (!isMutable && /\bmutable\b/.test(fullText)) isMutable = true;

      // Build semantic tags
      const tags = ['variable'];
      if (isInline) {
        tags.push('inline');
        tags.push('modern_cpp');
      }
      if (isConstexpr) tags.push('constexpr');
      if (isConst) tags.push('const');
      if (isStatic) tags.push('static');
      if (isThreadLocal) tags.push('thread_local');
      if (isExtern) tags.push('extern');
      if (isMutable) tags.push('mutable');

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: "variable",
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        returnType,
        signature: parentDeclaration.text.trim(),
        semanticTags: tags,
        complexity: 0,
        confidence: 0.9,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        languageFeatures: {
          isInline: isInline,
          isConstexpr: isConstexpr,
          isConst: isConst,
          isStatic: isStatic,
          isThreadLocal: isThreadLocal,
          isExtern: isExtern,
          isMutable: isMutable,
          modifiers: tags.filter(tag => tag !== 'variable'),
          isInitDeclarator: true
        }
      };

      // Debug logging
      if (isInline) {
        this.debug(`✅ Detected inline variable (via init_declarator): ${name} (C++17 feature)`);
      }
      if (tags.some(tag => ['inline', 'constexpr', 'modern_cpp'].includes(tag))) {
        this.debug(`🔍 Modern C++ variable (via init_declarator): ${name} with tags: [${tags.join(', ')}]`);
      }

      return symbol;
      
    } catch (error) {
      this.debug(`Error in handleInitDeclarator: ${error}`);
      return null;
    }
  }

  private handleStructuredBindingFromDeclaration(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    try {
      // Find the structured_binding_declarator node
      const bindingDeclarator = this.findNodeByType(node, 'structured_binding_declarator');
      if (!bindingDeclarator) return null;

      // Extract variable names from the structured binding declarator
      const bindingList: string[] = [];
      for (let i = 0; i < bindingDeclarator.childCount; i++) {
        const child = bindingDeclarator.child(i);
        if (child && child.type === 'identifier') {
          bindingList.push(this.getNodeText(child, context.content));
        }
      }

      if (bindingList.length === 0) {
        this.debug(`No identifiers found in structured binding: ${node.text}`);
        return null;
      }

      this.debug(`🔍 Structured binding from declaration: [${bindingList.join(', ')}]`);

      // Create symbols for all binding variables
      const symbols: SymbolInfo[] = [];
      
      for (let i = 0; i < bindingList.length; i++) {
        const varName = bindingList[i];
        const qualifiedName = this.buildQualifiedName(varName, context);
        
        const symbol: SymbolInfo = {
          name: varName,
          qualifiedName,
          kind: 'variable',
          filePath: context.filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          endLine: node.endPosition.row + 1,
          endColumn: node.endPosition.column + 1,
          signature: node.text.trim(),
          returnType: 'auto', // Type is deduced from structured binding
          namespace: context.resolutionContext.currentNamespace,
          semanticTags: ['structured_binding', 'auto_deduced', 'modern_cpp'],
          complexity: 0,
          confidence: 0.95,
          isDefinition: true,
          isExported: context.insideExportBlock,
          isAsync: false,
          languageFeatures: {
            isStructuredBinding: true,
            bindingVariables: bindingList,
            totalBindings: bindingList.length,
            bindingIndex: i,
            hasAutoKeyword: true,
            declarationType: 'declaration_node'
          }
        };
        
        symbols.push(symbol);
        
        // Add all symbols except the first to context directly
        if (i > 0) {
          context.symbols.set(symbol.qualifiedName, symbol);
        }
      }
      
      if (symbols.length > 0) {
        this.debug(`✅ Detected structured binding from declaration: ${bindingList.join(', ')} (${symbols.length} variables)`);
        return symbols[0]; // Return the first symbol, others are added to context
      }
      
      return null;
      
    } catch (error) {
      this.debug(`Error in handleStructuredBindingFromDeclaration: ${error}`);
      return null;
    }
  }

  private handleInlineVariableFromDeclaration(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    try {
      // Find init_declarator that contains the variable name
      const initDeclarator = this.findNodeByType(node, 'init_declarator');
      if (!initDeclarator) return null;

      // Get variable name from the declarator
      const declarator = initDeclarator.childForFieldName('declarator') || initDeclarator.child(0);
      if (!declarator) return null;

      const name = this.getNodeText(declarator, context.content);
      if (!name) return null;

      const qualifiedName = this.buildQualifiedName(name, context);

      // Get type information
      const typeNode = node.childForFieldName("type") || this.findNodeByType(node, 'primitive_type');
      const returnType = typeNode
        ? this.getNodeText(typeNode, context.content)
        : "auto";

      // Parse modifiers from the declaration
      const fullText = node.text;
      const isInline = /\binline\b/.test(fullText);
      const isConstexpr = /\bconstexpr\b/.test(fullText);
      const isConst = /\bconst\b/.test(fullText);
      const isStatic = /\bstatic\b/.test(fullText);

      // Build semantic tags
      const tags = ['variable'];
      if (isInline) {
        tags.push('inline');
        tags.push('modern_cpp'); // Inline variables are C++17 feature
      }
      if (isConstexpr) tags.push('constexpr');
      if (isConst) tags.push('const');
      if (isStatic) tags.push('static');

      const symbol: SymbolInfo = {
        name,
        qualifiedName,
        kind: "variable",
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        returnType,
        signature: fullText.trim(),
        semanticTags: tags,
        complexity: 0,
        confidence: 0.95,
        isDefinition: true,
        isExported: context.insideExportBlock,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        languageFeatures: {
          isInline: isInline,
          isConstexpr: isConstexpr,
          isConst: isConst,
          isStatic: isStatic,
          modifiers: tags.filter(tag => tag !== 'variable'),
          declarationType: 'declaration_node'
        }
      };

      // Debug logging
      if (isInline) {
        this.debug(`✅ Detected inline variable from declaration: ${name} (C++17 feature)`);
      }
      if (tags.some(tag => ['inline', 'constexpr', 'modern_cpp'].includes(tag))) {
        this.debug(`🔍 Modern C++ variable from declaration: ${name} with tags: [${tags.join(', ')}]`);
      }

      return symbol;
      
    } catch (error) {
      this.debug(`Error in handleInlineVariableFromDeclaration: ${error}`);
      return null;
    }
  }

  private handleRegularDeclaration(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    try {
      // Handle regular declarations that aren't structured bindings or inline variables
      const initDeclarator = this.findNodeByType(node, 'init_declarator');
      if (initDeclarator) {
        return this.handleInitDeclarator(initDeclarator, node, context);
      }

      // For other types of declarations, we might need different handling
      this.debug(`Unhandled declaration type: ${node.text.substring(0, 100)}`);
      return null;
      
    } catch (error) {
      this.debug(`Error in handleRegularDeclaration: ${error}`);
      return null;
    }
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
    const context = ctx as CppVisitorContext;
    try {
      let aliasName: string | null = null;
      let underlyingType: string | null = null;
      
      // Handle different typedef/using patterns
      if (node.type === 'alias_declaration') {
        // Modern C++ using alias: using Name = Type;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;
          
          if (child.type === 'type_identifier' && i === 1) {
            aliasName = child.text;
          } else if (child.type === 'type_descriptor' || (child.text && child.text !== '=' && child.text !== 'using' && child.text !== ';')) {
            if (aliasName && child.text !== aliasName && child.text.length > 1) {
              underlyingType = child.text;
            }
          }
        }
      } else if (node.type === 'using_declaration') {
        // using namespace or using Name = Type
        const text = node.text;
        const usingMatch = text.match(/using\s+(\w+)\s*=\s*(.+);/);
        if (usingMatch) {
          aliasName = usingMatch[1];
          underlyingType = usingMatch[2].trim();
        }
      } else if (node.type === 'type_definition') {
        // Traditional typedef: typedef Type Name;
        const text = node.text;
        const typedefMatch = text.match(/typedef\s+(.+?)\s+(\w+);/);
        if (typedefMatch) {
          underlyingType = typedefMatch[1].trim();
          aliasName = typedefMatch[2];
        }
      }
      
      if (!aliasName) {
        this.debug(`Could not extract alias name from ${node.type}: ${node.text}`);
        return null;
      }
      
      const qualifiedName = this.buildQualifiedName(aliasName, context);
      
      const symbol: SymbolInfo = {
        name: aliasName,
        qualifiedName,
        kind: 'typedef',
        filePath: context.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
        signature: underlyingType || node.text,
        returnType: underlyingType || undefined,
        namespace: context.currentNamespace,
        semanticTags: ['type_alias'],
        complexity: 0,
        confidence: 0.95,
        isDefinition: true,
        isExported: context.insideExportBlock || node.text.includes('export'),
        isAsync: false,
        languageFeatures: {
          isTypeAlias: true,
          underlyingType: underlyingType
        }
      };

      this.debug(`✅ Detected type alias: ${aliasName} = ${underlyingType || 'unknown'}`);
      return symbol;
      
    } catch (error) {
      this.debug(`Error in handleTypedef: ${error}`);
      return null;
    }
  }

  private handleStructuredBinding(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    try {
      // Use AST traversal instead of regex pattern matching for better accuracy
      let bindingList: string[] = [];
      let autoKeyword = false;
      let qualifiers: string[] = [];
      
      // Find the binding list by traversing the AST
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        
        // Look for 'auto' keyword
        if (child.type === 'auto' || child.text === 'auto') {
          autoKeyword = true;
        }
        
        // Look for qualifiers (const, &, etc.)
        if (child.type === 'type_qualifier' || ['const', '&', '&&'].includes(child.text)) {
          qualifiers.push(child.text);
        }
        
        // Look for the binding list (usually in brackets)
        if (child.type === 'structured_binding_declarator' || child.text.includes('[')) {
          // Extract variable names from binding declarator
          const bindingText = this.getNodeText(child, context.content);
          const bracketMatch = bindingText.match(/\[([^\]]+)\]/);
          if (bracketMatch) {
            bindingList = bracketMatch[1]
              .split(',')
              .map(v => v.trim())
              .filter(v => v.length > 0 && /^[a-zA-Z_]\w*$/.test(v)); // Valid identifiers only
          }
        }
      }
      
      // Fallback to pattern matching if AST traversal fails
      if (bindingList.length === 0) {
        const text = node.text;
        const bindingMatch = text.match(/auto\s*(?:&|\*|const)?\s*\[([^\]]+)\]/);
        
        if (bindingMatch) {
          bindingList = bindingMatch[1]
            .split(',')
            .map(v => v.trim())
            .filter(v => v.length > 0 && /^[a-zA-Z_]\w*$/.test(v));
        }
      }
      
      if (bindingList.length === 0) {
        this.debug(`Could not parse structured binding: ${node.text}`);
        return null;
      }
      
      this.debug(`🔍 Structured binding detected: [${bindingList.join(', ')}] with qualifiers: [${qualifiers.join(', ')}]`);
      
      // Create symbols for all binding variables
      const symbols: SymbolInfo[] = [];
      
      for (let i = 0; i < bindingList.length; i++) {
        const varName = bindingList[i];
        const qualifiedName = this.buildQualifiedName(varName, context);
        
        const symbol: SymbolInfo = {
          name: varName,
          qualifiedName,
          kind: 'variable',
          filePath: context.filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          endLine: node.endPosition.row + 1,
          endColumn: node.endPosition.column + 1,
          signature: node.text.trim(),
          returnType: 'auto', // Type is deduced
          namespace: context.resolutionContext.currentNamespace,
          semanticTags: ['structured_binding', 'auto_deduced', 'modern_cpp'],
          complexity: 0,
          confidence: 0.95,
          isDefinition: true,
          isExported: context.insideExportBlock,
          isAsync: false,
          languageFeatures: {
            isStructuredBinding: true,
            bindingVariables: bindingList,
            totalBindings: bindingList.length,
            bindingIndex: i,
            qualifiers: qualifiers,
            hasAutoKeyword: autoKeyword
          }
        };
        
        symbols.push(symbol);
        
        // Add all symbols except the first to context directly
        if (i > 0) {
          context.symbols.set(symbol.qualifiedName, symbol);
        }
      }
      
      if (symbols.length > 0) {
        this.debug(`✅ Detected structured binding: ${bindingList.join(', ')} (${symbols.length} variables)`);
        return symbols[0]; // Return the first symbol, others are added to context
      }
      
      return null;
      
    } catch (error) {
      this.debug(`Error in handleStructuredBinding: ${error}`);
      return null;
    }
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
    let resolved = OptimizedCppTreeSitterParser.symbolCache.resolveSymbol(
      targetName,
      context.resolutionContext
    );
    
    // If simple name resolution fails, try qualified name resolution
    // This handles calls within the same class (methodA calling methodB)
    if (!resolved && context.scopeStack.length > 0) {
      const currentScope = context.scopeStack[context.scopeStack.length - 1];
      if (currentScope?.qualifiedName) {
        // Try to resolve as a method in the current scope
        const qualifiedTargetName = `${currentScope.qualifiedName}::${targetName}`;
        resolved = OptimizedCppTreeSitterParser.symbolCache.resolveSymbol(
          qualifiedTargetName,
          context.resolutionContext
        );
      }
    }

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
    // Store unresolved call for resolution in Phase 4 (UniversalIndexer)
    const currentScope = context.scopeStack[context.scopeStack.length - 1];
    return {
      fromName: currentScope?.qualifiedName || "unknown",
      toName: targetName,
      relationshipType: "calls",
      confidence: 0.9,
      lineNumber: node.startPosition.row + 1,
      crossLanguage: false,
    };
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

  private handleTemplate(
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ): SymbolInfo | null {
    const context = ctx as CppVisitorContext;
    const content = context.content;
    
    // Extract template parameters
    const templateParams = this.extractTemplateParameters(node, content);
    
    // Find the template declaration (class, function, etc.)
    let templateDeclaration: Parser.SyntaxNode | null = null;
    let templateType = 'unknown';
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      if (child.type === 'class_specifier' || child.type === 'struct_specifier') {
        templateDeclaration = child;
        templateType = child.type === 'class_specifier' ? 'class' : 'struct';
        break;
      } else if (child.type === 'function_definition' || child.type === 'declaration') {
        templateDeclaration = child;
        templateType = 'function';
        break;
      }
    }
    
    if (!templateDeclaration) {
      this.debug(`Template declaration not found in template node`);
      return null;
    }
    
    // Get the name of the template
    let name = 'UnknownTemplate';
    if (templateType === 'class' || templateType === 'struct') {
      const nameNode = templateDeclaration.childForFieldName('name');
      if (nameNode) {
        name = this.getNodeText(nameNode, content);
      }
    } else if (templateType === 'function') {
      // For function templates, we need to find the function name
      const funcDeclarator = this.findNodeByType(templateDeclaration, 'function_declarator');
      if (funcDeclarator) {
        const nameNode = funcDeclarator.childForFieldName('declarator') || funcDeclarator.child(0);
        if (nameNode) {
          name = this.getNodeText(nameNode, content);
        }
      }
    }
    
    const qualifiedName = this.buildQualifiedName(name, context);
    
    // Create template symbol
    const symbol: SymbolInfo = {
      name,
      qualifiedName,
      kind: templateType === 'function' ? 'function' : templateType as any,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column,
      filePath: context.filePath,
      signature: this.buildTemplateSignature(name, templateParams, templateType),
      returnType: templateType === 'function' ? this.extractReturnType(templateDeclaration, content) : undefined,
      complexity: templateType === 'function' ? 1 : 0,
      semanticTags: ['template'],
      isDefinition: true,
      isExported: false,
      isAsync: false,
      namespace: context.resolutionContext.currentNamespace,
      parentScope: this.buildParentScope('', context, node),
      confidence: 0.95,
      languageFeatures: {
        isTemplate: true,
        templateParameters: templateParams,
        templateType: templateType
      }
    };
    
    // Store template parameters as separate symbols
    for (const param of templateParams) {
      const paramSymbol: SymbolInfo = {
        name: param.name,
        qualifiedName: `${qualifiedName}::${param.name}`,
        kind: 'parameter',
        line: param.line,
        column: param.column,
        endLine: param.line,
        endColumn: param.column + param.name.length,
        filePath: context.filePath,
        signature: `${param.type} ${param.name}`,
        complexity: 0,
        semanticTags: ['template_parameter'],
        isDefinition: true,
        isExported: false,
        isAsync: false,
        namespace: context.resolutionContext.currentNamespace,
        parentScope: qualifiedName,
        confidence: 0.9,
        languageFeatures: {
          isTemplateParameter: true,
          parameterType: param.type
        }
      };
      
      context.symbols.set(paramSymbol.qualifiedName, paramSymbol);
    }
    
    this.debug(`✅ Detected template ${templateType}: ${qualifiedName} with ${templateParams.length} parameters`);
    
    context.symbols.set(symbol.qualifiedName, symbol);
    return symbol;
  }

  private handleEnterScope(scope: ScopeInfo, ctx: VisitorContext): void {
    const context = ctx as CppVisitorContext;
    if (scope.type === "namespace") {
      context.resolutionContext.currentNamespace = scope.qualifiedName;
    }
    // Handle class scopes (includes both C++ classes and structs)
    if (scope.type === "class") {
      // Scope is already on the stack, we just need to track it for parent resolution
    }
  }

  private handleExitScope(scope: ScopeInfo, ctx: VisitorContext): void {
    const context = ctx as CppVisitorContext;
    if (scope.type === "namespace") {
      const parentScope = context.scopeStack[context.scopeStack.length - 2];
      context.resolutionContext.currentNamespace = parentScope?.qualifiedName;
    }
    // Handle class scope exit (includes both C++ classes and structs)
    if (scope.type === "class") {
      // Scope is automatically popped by the visitor
    }
  }

  /**
   * Extract template parameters from template_parameter_list node
   */
  private extractTemplateParameters(node: Parser.SyntaxNode, content: string): Array<{
    name: string;
    type: string;
    line: number;
    column: number;
  }> {
    const params: Array<{ name: string; type: string; line: number; column: number }> = [];
    
    // Find template_parameter_list node
    const paramListNode = this.findNodeByType(node, 'template_parameter_list');
    if (!paramListNode) {
      return params;
    }
    
    // Process each parameter
    for (let i = 0; i < paramListNode.childCount; i++) {
      const child = paramListNode.child(i);
      if (!child) continue;
      
      if (child.type === 'type_parameter_declaration') {
        // Handle typename/class template parameters: typename T, class U
        const typeKeyword = this.findNodeByType(child, 'typename') || this.findNodeByType(child, 'class');
        const nameNode = this.findNodeByType(child, 'type_identifier');
        
        if (nameNode && typeKeyword) {
          params.push({
            name: this.getNodeText(nameNode, content),
            type: this.getNodeText(typeKeyword, content),
            line: nameNode.startPosition.row + 1,
            column: nameNode.startPosition.column
          });
        } else if (nameNode) {
          params.push({
            name: this.getNodeText(nameNode, content),
            type: 'typename',
            line: nameNode.startPosition.row + 1,
            column: nameNode.startPosition.column
          });
        }
      } else if (child.type === 'parameter_declaration') {
        // Handle non-type template parameters: int N, size_t Size
        const typeNode = child.child(0); // First child is usually the type
        const nameNode = child.child(1); // Second child is usually the name
        
        if (typeNode && nameNode) {
          params.push({
            name: this.getNodeText(nameNode, content),
            type: this.getNodeText(typeNode, content),
            line: nameNode.startPosition.row + 1,
            column: nameNode.startPosition.column
          });
        }
      }
    }
    
    return params;
  }

  /**
   * Build template signature
   */
  private buildTemplateSignature(name: string, params: Array<{ name: string; type: string }>, templateType: string): string {
    if (params.length === 0) {
      return `template<> ${templateType} ${name}`;
    }
    
    const paramList = params.map(p => `${p.type} ${p.name}`).join(', ');
    return `template<${paramList}> ${templateType} ${name}`;
  }

  /**
   * Find node by type (recursive search)
   */
  private findNodeByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
    if (node.type === type) {
      return node;
    }
    
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      const found = this.findNodeByType(child, type);
      if (found) return found;
    }
    
    return null;
  }

  /**
   * Extract return type from function declaration
   */
  private extractReturnType(node: Parser.SyntaxNode, content: string): string | undefined {
    // Look for the return type in function declaration
    const children = [];
    for (let i = 0; i < node.childCount; i++) {
      children.push(node.child(i));
    }
    
    // Find the type before the function declarator
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) continue;
      if (child.type === 'function_declarator') {
        // Look backwards for the type
        for (let j = i - 1; j >= 0; j--) {
          const prevChild = children[j];
          if (!prevChild) continue;
          if (prevChild.type === 'primitive_type' || 
              prevChild.type === 'type_identifier' ||
              prevChild.type === 'qualified_identifier') {
            return this.getNodeText(prevChild, content);
          }
        }
        break;
      }
    }
    
    return undefined;
  }

  private buildQualifiedName(name: string, context: CppVisitorContext): string {
    const parts: string[] = [];

    // Build qualified name from scope stack (which includes namespace and class scopes)
    for (const scope of context.scopeStack) {
      if (scope.type === "class" || scope.type === "namespace") {
        parts.push(scope.name);
      }
    }

    // If no scope stack, fall back to current namespace
    if (parts.length === 0 && context.resolutionContext.currentNamespace) {
      parts.push(context.resolutionContext.currentNamespace);
    }

    parts.push(name);
    const result = parts.join("::");
    
    // Safeguard: Detect and warn about duplications
    const nameParts = result.split('::');
    const duplicates = nameParts.filter((part, index) => 
      index > 0 && part === nameParts[index - 1]
    );
    if (duplicates.length > 0) {
      console.log(`⚠️  SAFEGUARD: Detected duplication in qualified name: ${result} (duplicates: ${duplicates.join(', ')})`);
    }

    return result;
  }

  private buildParentScope(parentName: string, context: CppVisitorContext, parentNode: Parser.SyntaxNode): string {
    // Build parent scope by traversing AST hierarchy, not using context scope stack
    // This avoids duplication issues from manually managed scope stacks
    
    const parts: string[] = [];
    
    // Traverse up from the parent struct to find containing namespaces/classes
    let current = parentNode.parent;
    while (current) {
      if (current.type === "namespace_definition") {
        const nameNode = current.childForFieldName("name");
        if (nameNode) {
          const nsName = this.getNodeText(nameNode, context.content);
          parts.unshift(nsName); // Add to beginning to maintain order
        }
      } else if (current.type === "class_specifier" || current.type === "struct_specifier") {
        const nameNode = current.childForFieldName("name");
        if (nameNode) {
          const className = this.getNodeText(nameNode, context.content);
          parts.unshift(className);
        }
      }
      current = current.parent;
    }
    
    // Add the parent struct name itself
    parts.push(parentName);
    
    const result = parts.join("::");
    
    // Safeguard: Ensure no duplication in parent scope
    const duplicateCheck = result.split('::');
    for (let i = 1; i < duplicateCheck.length; i++) {
      if (duplicateCheck[i] === duplicateCheck[i-1]) {
        console.log(`⚠️  SAFEGUARD: buildParentScope detected duplication in ${result}, removing duplicate`);
        duplicateCheck.splice(i, 1);
        i--; // Adjust index after removal
      }
    }
    
    return duplicateCheck.join('::');
  }

  private buildStructQualifiedName(structName: string, structNode: Parser.SyntaxNode, context: CppVisitorContext): string {
    // Build struct qualified name by traversing AST hierarchy
    // This ensures consistency with field parent scope resolution
    
    const parts: string[] = [];
    
    // Traverse up from the struct to find containing namespaces/classes
    let current = structNode.parent;
    while (current) {
      if (current.type === "namespace_definition") {
        const nameNode = current.childForFieldName("name");
        if (nameNode) {
          const nsName = this.getNodeText(nameNode, context.content);
          parts.unshift(nsName); // Add to beginning to maintain order
        }
      } else if (current.type === "class_specifier" || current.type === "struct_specifier") {
        const nameNode = current.childForFieldName("name");
        if (nameNode) {
          const className = this.getNodeText(nameNode, context.content);
          parts.unshift(className);
        }
      }
      current = current.parent;
    }
    
    // Add the struct name itself
    parts.push(structName);
    
    const result = parts.join("::");
    
    // Safeguard: Ensure no duplication in struct qualified name
    const duplicateCheck = result.split('::');
    for (let i = 1; i < duplicateCheck.length; i++) {
      if (duplicateCheck[i] === duplicateCheck[i-1]) {
        console.log(`⚠️  SAFEGUARD: buildStructQualifiedName detected duplication in ${result}, removing duplicate`);
        duplicateCheck.splice(i, 1);
        i--; // Adjust index after removal
      }
    }
    
    // Additional safeguard: Verify struct and parent scope will match
    const expectedParentScope = duplicateCheck.join('::');
    if (structName === "GenericResourceDesc") {
      console.log(`🔍 SAFEGUARD: Struct ${structName} will have qualifiedName: ${expectedParentScope}`);
      console.log(`🔍 SAFEGUARD: Fields should have parentScope: ${expectedParentScope}`);
    }
    
    return expectedParentScope;
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
