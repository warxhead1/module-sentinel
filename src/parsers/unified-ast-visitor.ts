/**
 * Unified AST Visitor Pattern
 *
 * Single-pass AST traversal that combines symbol extraction, relationship detection,
 * pattern analysis, and selective control flow analysis in one traversal.
 *
 * This eliminates the multiple AST traversals that were causing ~200ms overhead.
 */

import Parser from "tree-sitter";
import type {
  SymbolInfo,
  RelationshipInfo,
  PatternInfo,
} from "./tree-sitter/parser-types.js";

export interface ControlFlowBlock {
  symbolName: string;
  blockType: string;
  startLine: number;
  endLine: number;
  condition?: string;
  loopType?: string;
  complexity: number;
}

export interface ControlFlowCall {
  callerName: string;
  targetFunction: string;
  lineNumber: number;
  columnNumber: number;
  callType: string;
}

export interface VisitorContext {
  filePath: string;
  content: string;
  symbols: Map<string, SymbolInfo>;
  relationships: RelationshipInfo[];
  patterns: PatternInfo[];
  controlFlowData: {
    blocks: ControlFlowBlock[];
    calls: ControlFlowCall[];
  };
  // Scope tracking
  scopeStack: ScopeInfo[];
  currentNamespace?: string;
  // Performance tracking
  stats: {
    nodesVisited: number;
    symbolsExtracted: number;
    complexityChecks: number;
    controlFlowAnalyzed: number;
  };
}

export interface ScopeInfo {
  type: "namespace" | "class" | "function" | "block";
  name: string;
  qualifiedName: string;
  startLine: number;
  endLine?: number;
  parentSymbol?: SymbolInfo;
}

export interface VisitorHandlers {
  // Symbol extraction handlers
  onClass?: (node: Parser.SyntaxNode, ctx: VisitorContext) => SymbolInfo | null;
  onFunction?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onNamespace?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onVariable?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onEnum?: (node: Parser.SyntaxNode, ctx: VisitorContext) => SymbolInfo | null;
  onTypedef?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onInterface?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onMethod?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;

  // Relationship extraction handlers
  onCall?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => RelationshipInfo | null;
  onInheritance?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => RelationshipInfo[] | null;
  onImport?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => RelationshipInfo | null;
  onDeclaration?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => RelationshipInfo | null;
  onTypeReference?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => RelationshipInfo | null;
  onExport?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => RelationshipInfo | null;

  // Pattern detection handlers
  onPattern?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => PatternInfo | null;
  onTemplate?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onArrowFunction?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onProperty?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onTypeAlias?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo | null;
  onObjectPattern?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo[] | null;
  onArrayPattern?: (
    node: Parser.SyntaxNode,
    ctx: VisitorContext
  ) => SymbolInfo[] | null;

  // Control flow handlers (only called for complex functions)
  onControlStructure?: (node: Parser.SyntaxNode, ctx: VisitorContext) => void;

  // Scope management
  onEnterScope?: (scope: ScopeInfo, ctx: VisitorContext) => void;
  onExitScope?: (scope: ScopeInfo, ctx: VisitorContext) => void;
}

export interface ComplexityHeuristics {
  // Minimum lines for a function to be considered for control flow analysis
  minFunctionLines: number;
  // Complexity score threshold
  minComplexityScore: number;
  // Maximum functions to analyze per file
  maxFunctionsPerFile: number;
  // Keywords that increase complexity score
  complexityKeywords: Set<string>;
}

export class UnifiedASTVisitor {
  private handlers: VisitorHandlers;
  private nodeTypeMap: Map<string, keyof VisitorHandlers>;
  private complexityHeuristics: ComplexityHeuristics;

  constructor(
    handlers: VisitorHandlers,
    nodeTypeMap: Map<string, keyof VisitorHandlers>
  ) {
    this.handlers = handlers;
    this.nodeTypeMap = nodeTypeMap;
    this.complexityHeuristics = {
      minFunctionLines: 3,
      minComplexityScore: 2,
      maxFunctionsPerFile: 10,
      complexityKeywords: new Set([
        "if",
        "while",
        "for",
        "switch",
        "try",
        "catch",
        "do",
        "goto",
        "break",
        "continue",
        "return",
        "throw",
        "co_await",
        "co_yield",
        "co_return",
      ]),
    };
  }

  /**
   * Single-pass traversal of the AST
   */
  async traverse(
    tree: Parser.Tree,
    filePath: string,
    content: string
  ): Promise<{
    symbols: SymbolInfo[];
    relationships: RelationshipInfo[];
    patterns: PatternInfo[];
    controlFlowData: { blocks: any[]; calls: any[] };
    stats: any;
  }> {
    const startTime = Date.now();

    const context: VisitorContext = {
      filePath,
      content,
      symbols: new Map(),
      relationships: [],
      patterns: [],
      controlFlowData: {
        blocks: [],
        calls: [],
      },
      scopeStack: [],
      stats: {
        nodesVisited: 0,
        symbolsExtracted: 0,
        complexityChecks: 0,
        controlFlowAnalyzed: 0,
      },
    };

    // Start traversal from root
    await this.visitNode(tree.rootNode, context);

    // Convert symbols map to array
    const symbols = Array.from(context.symbols.values());

    // Sort by complexity for control flow analysis priority
    const complexFunctions = symbols
      .filter((s) => ["function", "method", "constructor"].includes(s.kind))
      .map((s) => ({
        symbol: s,
        complexity: this.estimateComplexity(s, content),
      }))
      .filter(
        (item) =>
          item.complexity >= this.complexityHeuristics.minComplexityScore
      )
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, this.complexityHeuristics.maxFunctionsPerFile);

    // Analyze member access patterns for all functions
    await this.analyzeMemberAccessPatterns(symbols, content, context);

    // Calculate duration after all processing is complete
    const duration = Date.now() - startTime;

    const functionCount = symbols.filter((s) => s.kind === "function").length;

    const stats = `[UnifiedVisitor] Single-pass completed in ${duration}ms:
      - Nodes visited: ${context.stats.nodesVisited}
      - Symbols extracted: ${context.stats.symbolsExtracted}
      - Relationships found: ${context.relationships.length}
      - Patterns detected: ${context.patterns.length}
      - Complex functions identified: ${complexFunctions.length}/${functionCount}`;

    console.log(stats);

    // Force flush
    if (process.stdout.write) {
      process.stdout.write("[DEBUG] About to return results...\n");
    } else {
    }

    return {
      symbols,
      relationships: context.relationships,
      patterns: context.patterns,
      controlFlowData: context.controlFlowData,
      stats: { ...context.stats, traversalTimeMs: duration },
    };
  }

  /**
   * Single-pass traversal with custom context (for language-specific contexts)
   */
  async traverseWithContext(
    tree: Parser.Tree,
    context: VisitorContext
  ): Promise<{
    symbols: SymbolInfo[];
    relationships: RelationshipInfo[];
    patterns: PatternInfo[];
    controlFlowData: { blocks: any[]; calls: any[] };
    stats: any;
  }> {
    const startTime = Date.now();

    // Start traversal from root
    await this.visitNode(tree.rootNode, context);

    const duration = Date.now() - startTime;

    // Convert symbols map to array
    const symbols = Array.from(context.symbols.values());

    // Sort by complexity for control flow analysis priority
    const complexFunctions = symbols
      .filter((s) => ["function", "method", "constructor"].includes(s.kind))
      .map((s) => ({
        symbol: s,
        complexity: this.estimateComplexity(s, context.content),
      }))
      .filter(
        (item) =>
          item.complexity >= this.complexityHeuristics.minComplexityScore
      )
      .sort((a, b) => b.complexity - a.complexity)
      .map((item) => item.symbol);

    // Stats are included in the return object

    // Analyze member access patterns for all functions
    await this.analyzeMemberAccessPatterns(symbols, context.content, context);

    return {
      symbols,
      relationships: context.relationships,
      patterns: context.patterns,
      controlFlowData: context.controlFlowData,
      stats: { ...context.stats, traversalTimeMs: duration },
    };
  }

  /**
   * Visit a single node and dispatch to appropriate handlers
   */
  private async visitNode(
    node: Parser.SyntaxNode,
    context: VisitorContext
  ): Promise<void> {
    context.stats.nodesVisited++;

    // Check if we have a handler for this node type
    const handlerKey = this.nodeTypeMap.get(node.type);

    if (handlerKey && this.handlers[handlerKey]) {
      try {
        // Symbol extraction
        if (
          handlerKey.startsWith("on") &&
          handlerKey !== "onEnterScope" &&
          handlerKey !== "onExitScope"
        ) {
          const handler = this.handlers[handlerKey] as any;
          const result = handler(node, context);

          if (result) {
            if (Array.isArray(result)) {
              // Check if it's an array of symbols or relationships
              if (
                result.length > 0 &&
                "name" in result[0] &&
                "kind" in result[0]
              ) {
                // Array of symbols (from destructuring patterns)
                for (const symbol of result as SymbolInfo[]) {
                  context.symbols.set(symbol.qualifiedName, symbol);
                  context.stats.symbolsExtracted++;
                }
              } else {
                // Array of relationships
                context.relationships.push(...result);
              }
            } else if ("patternType" in result) {
              // Pattern
              context.patterns.push(result);
            } else if ("name" in result && "kind" in result) {
              // Symbol
              const symbol = result as SymbolInfo;
              context.symbols.set(symbol.qualifiedName, symbol);
              context.stats.symbolsExtracted++;

              // Check if this symbol needs control flow analysis
              if (this.shouldAnalyzeControlFlow(symbol, context)) {
                context.stats.complexityChecks++;
                await this.analyzeControlFlow(node, symbol, context);
              }
            } else if ("fromName" in result && "toName" in result) {
              // Relationship
              context.relationships.push(result);
            }
          }
        }
      } catch (error) {
        console.error(`Error in handler ${handlerKey}:`, error);
      }
    }

    // Check for scope changes
    this.updateScope(node, context);

    // Visit children
    for (const child of node.children) {
      await this.visitNode(child, context);
    }

    // Exit scope if needed
    this.exitScope(node, context);
  }

  /**
   * Determine if a symbol needs control flow analysis based on complexity
   */
  private shouldAnalyzeControlFlow(
    symbol: SymbolInfo,
    context: VisitorContext
  ): boolean {
    // Only analyze functions/methods
    if (!["function", "method", "constructor"].includes(symbol.kind)) {
      return false;
    }

    // Already analyzed too many functions in this file?
    if (
      context.stats.controlFlowAnalyzed >=
      this.complexityHeuristics.maxFunctionsPerFile
    ) {
      return false;
    }

    // Estimate complexity
    const complexity = this.estimateComplexity(symbol, context.content);
    return complexity >= this.complexityHeuristics.minComplexityScore;
  }

  /**
   * Fast complexity estimation without full analysis
   */
  private estimateComplexity(symbol: SymbolInfo, content: string): number {
    let score = 1; // Base score

    // Line count heuristic
    const lineCount = (symbol.endLine || symbol.line) - symbol.line + 1;
    if (lineCount < this.complexityHeuristics.minFunctionLines) return 0;

    if (lineCount > 10) score += 1;
    if (lineCount > 20) score += 2;
    if (lineCount > 50) score += 3;

    // Name-based heuristics
    const nameLower = symbol.name.toLowerCase();
    if (
      nameLower.includes("process") ||
      nameLower.includes("analyze") ||
      nameLower.includes("compute") ||
      nameLower.includes("handle")
    ) {
      score += 2;
    }
    if (
      nameLower.includes("get") ||
      nameLower.includes("set") ||
      nameLower.includes("is") ||
      nameLower.includes("has")
    ) {
      score -= 1; // Likely simple accessors
    }

    // Signature complexity
    if (symbol.signature) {
      const paramCount = (symbol.signature.match(/,/g) || []).length + 1;
      if (paramCount > 3) score += 1;
      if (paramCount > 6) score += 2;
    }

    // Quick content scan for control flow keywords
    if (symbol.line && symbol.endLine) {
      const lines = content.split("\n").slice(symbol.line - 1, symbol.endLine);
      const functionContent = lines.join("\n").toLowerCase();

      for (const keyword of this.complexityHeuristics.complexityKeywords) {
        const regex = new RegExp(`\\b${keyword}\\s*[\\(\\{]`, "g");
        const matches = functionContent.match(regex);
        if (matches) {
          score += matches.length * 0.5;
        }
      }
    }

    return Math.max(0, Math.floor(score));
  }

  /**
   * Analyze control flow for a complex function
   */
  private async analyzeControlFlow(
    node: Parser.SyntaxNode,
    symbol: SymbolInfo,
    context: VisitorContext
  ): Promise<void> {
    context.stats.controlFlowAnalyzed++;

    // Find function body
    let bodyNode: Parser.SyntaxNode | null = null;
    for (const child of node.children) {
      if (
        child.type === "compound_statement" ||
        child.type === "function_body" ||
        child.type === "block"
      ) {
        bodyNode = child;
        break;
      }
    }

    if (!bodyNode) return;

    // Create entry block
    const entryBlock = {
      symbolName: symbol.name,
      blockType: "entry",
      startLine: bodyNode.startPosition.row + 1,
      endLine: bodyNode.startPosition.row + 1,
      complexity: 1,
    };
    context.controlFlowData.blocks.push(entryBlock);

    // Traverse body for control structures and calls
    await this.extractControlFlowFromBody(bodyNode, symbol, context);

    // Create exit block
    const exitBlock = {
      symbolName: symbol.name,
      blockType: "exit",
      startLine: bodyNode.endPosition.row + 1,
      endLine: bodyNode.endPosition.row + 1,
      complexity: 1,
    };
    context.controlFlowData.blocks.push(exitBlock);
  }

  /**
   * Extract control flow structures and function calls from function body
   */
  private async extractControlFlowFromBody(
    node: Parser.SyntaxNode,
    symbol: SymbolInfo,
    context: VisitorContext
  ): Promise<void> {
    // Control structure detection
    if (node.type === "if_statement") {
      // Find the body/consequent node for accurate end position
      const consequentNode =
        node.childForFieldName("consequence") ||
        node.childForFieldName("then") ||
        node.children.find((n) => n.type === "compound_statement");
      const endLine = consequentNode
        ? consequentNode.endPosition.row + 1
        : node.endPosition.row + 1;

      context.controlFlowData.blocks.push({
        symbolName: symbol.name,
        blockType: "conditional",
        startLine: node.startPosition.row + 1,
        endLine: endLine,
        condition: "if",
        complexity: 1,
      });
    } else if (
      node.type === "for_statement" ||
      node.type === "while_statement" ||
      node.type === "do_statement"
    ) {
      // Find the body node for accurate end position
      const bodyNode =
        node.childForFieldName("body") ||
        node.children.find((n) => n.type === "compound_statement");
      const endLine = bodyNode
        ? bodyNode.endPosition.row + 1
        : node.endPosition.row + 1;

      context.controlFlowData.blocks.push({
        symbolName: symbol.name,
        blockType: "loop",
        startLine: node.startPosition.row + 1,
        endLine: endLine,
        condition: node.type.replace("_statement", ""),
        loopType: node.type.replace("_statement", ""),
        complexity: 2,
      });
    } else if (node.type === "switch_statement") {
      // Find the body node for accurate end position
      const bodyNode =
        node.childForFieldName("body") ||
        node.children.find((n) => n.type === "compound_statement");
      const endLine = bodyNode
        ? bodyNode.endPosition.row + 1
        : node.endPosition.row + 1;

      context.controlFlowData.blocks.push({
        symbolName: symbol.name,
        blockType: "switch",
        startLine: node.startPosition.row + 1,
        endLine: endLine,
        condition: "switch",
        complexity: 2,
      });
    }

    // Function call extraction
    if (node.type === "call_expression") {
      const functionNode = node.childForFieldName("function");
      if (functionNode) {
        const targetFunction = this.getNodeText(functionNode, context.content);
        context.controlFlowData.calls.push({
          callerName: symbol.name,
          targetFunction,
          lineNumber: node.startPosition.row + 1,
          columnNumber: node.startPosition.column,
          callType: "direct",
        });
      }
    }

    // Recurse into children
    for (const child of node.children) {
      await this.extractControlFlowFromBody(child, symbol, context);
    }
  }

  /**
   * Update scope tracking
   */
  private updateScope(node: Parser.SyntaxNode, context: VisitorContext): void {
    const scopeTypes = {
      namespace_definition: "namespace",
      class_specifier: "class",
      struct_specifier: "class",
      function_definition: "function",
      method_definition: "function",
      compound_statement: "block",
    };

    const scopeType = scopeTypes[node.type as keyof typeof scopeTypes];
    if (scopeType) {
      const nameNode = node.childForFieldName("name");
      const name = nameNode
        ? this.getNodeText(nameNode, context.content)
        : "anonymous";

      const parentScope = context.scopeStack[context.scopeStack.length - 1];
      const qualifiedName = parentScope
        ? `${parentScope.qualifiedName}::${name}`
        : name;

      const scope: ScopeInfo = {
        type: scopeType as any,
        name,
        qualifiedName,
        startLine: node.startPosition.row + 1,
      };

      context.scopeStack.push(scope);

      if (scopeType === "namespace") {
        context.currentNamespace = qualifiedName;
      }

      this.handlers.onEnterScope?.(scope, context);
    }
  }

  /**
   * Exit scope tracking
   */
  private exitScope(node: Parser.SyntaxNode, context: VisitorContext): void {
    const currentScope = context.scopeStack[context.scopeStack.length - 1];
    if (currentScope && node.endPosition.row + 1 > currentScope.startLine) {
      currentScope.endLine = node.endPosition.row + 1;

      // Check if we're exiting this scope
      const scopeTypes = [
        "namespace_definition",
        "class_specifier",
        "struct_specifier",
        "function_definition",
        "method_definition",
        "compound_statement",
      ];

      if (scopeTypes.includes(node.type)) {
        const scope = context.scopeStack.pop();
        if (scope) {
          this.handlers.onExitScope?.(scope, context);

          if (scope.type === "namespace") {
            const parentScope =
              context.scopeStack[context.scopeStack.length - 1];
            context.currentNamespace = parentScope?.qualifiedName;
          }
        }
      }
    }
  }

  /**
   * Get text content of a node
   */
  private getNodeText(node: Parser.SyntaxNode, content: string): string {
    return content.substring(node.startIndex, node.endIndex);
  }

  /**
   * Configure complexity heuristics
   */
  setComplexityHeuristics(heuristics: Partial<ComplexityHeuristics>): void {
    this.complexityHeuristics = { ...this.complexityHeuristics, ...heuristics };
  }

  /**
   * Analyze member access patterns in function bodies for all languages
   * This provides universal field access detection for reads_field/writes_field relationships
   */
  async analyzeMemberAccessPatterns(
    symbols: SymbolInfo[],
    content: string,
    context: VisitorContext
  ): Promise<void> {
    const lines = content.split("\n");

    // Find all function symbols that need member access analysis
    const functionSymbols = symbols.filter(
      (s) =>
        s.kind === "function" || s.kind === "method" || s.kind === "constructor"
    );

    // Analyzing member access for functions

    for (let i = 0; i < functionSymbols.length; i++) {
      const funcSymbol = functionSymbols[i];
      // Processing function

      if (funcSymbol.name === "ToGeneric") {
        // Analyzing ToGeneric function
      }

      // Add timeout to prevent individual functions from hanging indefinitely
      const functionTimeout = 5000; // 5 second timeout per function
      try {
        await Promise.race([
          this.analyzeFunctionMemberAccess(funcSymbol, lines, content, context),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Function analysis timeout: ${funcSymbol.name}`)
                ),
              functionTimeout
            )
          ),
        ]);
        // Completed function
      } catch (error: any) {
        console.warn(
          `[UnifiedASTVisitor] Failed to analyze function ${funcSymbol.name}: ${error.message}`
        );
        // Continue with next function instead of hanging
      }
    }
  }

  /**
   * Analyze member access patterns within a specific function
   */
  private async analyzeFunctionMemberAccess(
    funcSymbol: SymbolInfo,
    lines: string[],
    content: string,
    context: VisitorContext
  ): Promise<void> {
    // Find the function body boundaries with safer limits
    const startLine = funcSymbol.line - 1; // Convert to 0-based
    const maxScanLines = 50; // Limit function analysis to 50 lines max
    const endLine = Math.min(
      funcSymbol.endLine || startLine + maxScanLines,
      startLine + maxScanLines,
      lines.length
    );

    if (startLine < 0 || startLine >= lines.length) {
      return; // Invalid start line
    }

    let braceDepth = 0;
    let insideFunctionBody = false;
    let linesProcessed = 0;
    const maxLinesToProcess = 100; // Emergency brake

    // Scan through the function lines
    for (
      let i = startLine;
      i < endLine && linesProcessed < maxLinesToProcess;
      i++
    ) {
      const line = lines[i];
      const lineNum = i + 1;
      linesProcessed++;

      // Emergency timeout check
      if (linesProcessed % 25 === 0) {
        // Processing function line
      }

      // Track brace depth to know when we're inside the function body
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces;
      braceDepth -= closeBraces;

      // Start analyzing once we're inside the function body
      if (openBraces > 0 && !insideFunctionBody) {
        insideFunctionBody = true;
      }

      // Only analyze lines inside the function body
      if (insideFunctionBody && braceDepth > 0) {
        await this.extractMemberAccessFromLine(
          line,
          lineNum,
          funcSymbol,
          context
        );
      }

      // Exit when we close the function
      if (insideFunctionBody && braceDepth <= 0) {
        break;
      }
    }

    if (linesProcessed >= maxLinesToProcess) {
      console.warn(
        `[UnifiedASTVisitor] Emergency brake triggered for function ${funcSymbol.name} after ${linesProcessed} lines`
      );
    }
  }

  /**
   * Extract member access patterns from a single line
   * Language-agnostic patterns for field access detection
   */
  private async extractMemberAccessFromLine(
    line: string,
    lineNumber: number,
    funcSymbol: SymbolInfo,
    context: VisitorContext
  ): Promise<void> {
    // Safety check for extremely long lines that could cause performance issues
    if (line.length > 1000) {
      return; // Skip analysis of extremely long lines
    }

    // Pattern 1: Member writes - object.member = value
    // Use Array.from to safely handle all matches without infinite loops
    const memberWriteMatches = Array.from(line.matchAll(/\b(\w+)\.(\w+)\s*=/g));

    for (const match of memberWriteMatches) {
      const [fullMatch, objectName, memberName] = match;

      if (funcSymbol.name === "ToGeneric") {
        // Found member write in ToGeneric
      }

      // Skip 'this' as it's not cross-object access
      if (objectName !== "this") {
        // For now, use the member name as-is. The indexer will resolve the full qualified name.
        context.relationships.push({
          fromName: funcSymbol.qualifiedName,
          toName: `${objectName}.${memberName}`, // Include object context
          relationshipType: "writes_field",
          confidence: 0.8,
          lineNumber: lineNumber,
          columnNumber: match.index || 0,
          crossLanguage: false,
          sourceContext: `${objectName}.${memberName}`,
          usagePattern: "field_write",
          metadata: {
            objectName: objectName,
            memberName: memberName,
            accessType: "dot_notation",
          },
        });
      }
    }

    // Pattern 2: Member reads - value = object.member or object.member in expressions
    // Use Array.from to safely handle all matches without infinite loops
    const memberReadMatches = Array.from(
      line.matchAll(/\b(\w+)\.(\w+)(?!\s*=)/g)
    );

    for (const match of memberReadMatches) {
      const [fullMatch, objectName, memberName] = match;
      const beforeMatch = line.substring(0, match.index || 0);

      // Determine if this is actually a read operation
      const isBeingRead =
        beforeMatch.match(/=\s*$/) || // assignment: x = obj.member
        beforeMatch.match(/return\s+$/) || // return obj.member
        beforeMatch.match(/\(\s*$/) || // function call: func(obj.member)
        beforeMatch.match(/,\s*$/) || // parameter: func(x, obj.member)
        line
          .substring((match.index || 0) + fullMatch.length)
          .match(/^\s*[;,\)\+\-\*\/\|\&<>]/); // expression: obj.member + x

      if (isBeingRead && objectName !== "this") {
        context.relationships.push({
          fromName: funcSymbol.qualifiedName,
          toName: `${objectName}.${memberName}`, // Include object context
          relationshipType: "reads_field",
          confidence: 0.8,
          lineNumber: lineNumber,
          columnNumber: match.index || 0,
          crossLanguage: false,
          sourceContext: `${objectName}.${memberName}`,
          usagePattern: "field_read",
          metadata: {
            objectName: objectName,
            memberName: memberName,
            accessType: "dot_notation",
          },
        });
      }
    }

    // Pattern 3: Pointer access - obj->member (primarily for C++)
    // Use Array.from to safely handle all matches without infinite loops
    const pointerAccessMatches = Array.from(line.matchAll(/\b(\w+)->(\w+)/g));

    for (const match of pointerAccessMatches) {
      const [fullMatch, objectName, memberName] = match;
      const isWrite = line
        .substring((match.index || 0) + fullMatch.length)
        .match(/^\s*=/);

      context.relationships.push({
        fromName: funcSymbol.qualifiedName,
        toName: `${objectName}.${memberName}`, // Normalize to dot notation for consistency
        relationshipType: isWrite ? "writes_field" : "reads_field",
        confidence: 0.8,
        lineNumber: lineNumber,
        columnNumber: match.index || 0,
        crossLanguage: false,
        sourceContext: `${objectName}->${memberName}`,
        usagePattern: isWrite ? "field_write" : "field_read",
        metadata: {
          objectName: objectName,
          memberName: memberName,
          accessType: "pointer_notation",
        },
      });
    }
  }
}
