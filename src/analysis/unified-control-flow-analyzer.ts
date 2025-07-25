/**
 * Unified Control Flow Analyzer
 *
 * Consolidates functionality from multiple control flow analyzers into a single,
 * comprehensive analyzer that supports multiple languages, provides rich analysis
 * capabilities, and integrates with both database storage and visualization systems.
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import {
  universalSymbols,
  controlFlowBlocks,
  symbolCalls as _symbolCalls,
} from "../database/drizzle/schema.js";
import { createLogger } from "../utils/logger.js";
import { getGlobalMemoryMonitor } from "../utils/memory-monitor.js";
import {
  ComplexityAnalyzer,
  ComplexityMetrics,
} from "../dashboard/utils/complexity-analyzer.js";
import {
  CodeMetricsAnalyzer,
  MetricsInput,
} from "./code-metrics-analyzer.js";
import {
  HotspotDetector,
  HotspotAnalysis,
} from "../dashboard/utils/hotspot-detector.js";
import {
  DataFlowTracker,
  DataFlowAnalysis,
} from "../dashboard/utils/data-flow-tracker.js";

// Unified block type that combines all analyzer types
export interface ControlFlowBlock {
  id: string;
  symbolName: string;
  type:
    | "entry"
    | "exit"
    | "basic"
    | "statement"
    | "conditional"
    | "loop"
    | "switch"
    | "try"
    | "catch"
    | "finally"
    | "return"
    | "throw";
  startLine: number;
  endLine: number;
  code?: string;
  condition?: string;
  loopType?: "for" | "while" | "do-while" | "range-for" | "for-in" | "for-of";
  parentBlockId?: string;
  complexity: number;
  // Performance metrics from dashboard engine
  metrics?: {
    executionTime?: number;
    callCount?: number;
    memoryUsage?: number;
  };
  // Language-specific features from C++ analyzer
  variables?: string[];
  calls?: string[];
  exceptionTypes?: string[];
  children?: string[];
}

export interface ControlFlowEdge {
  from: string;
  to: string;
  type:
    | "sequential"
    | "normal"
    | "branch-true"
    | "branch-false"
    | "true"
    | "false"
    | "loop-back"
    | "break"
    | "continue"
    | "return"
    | "throw"
    | "exception";
  probability?: number;
  label?: string;
}

export interface ControlFlowCall {
  id: string;
  callerName: string;
  targetFunction: string;
  lineNumber: number;
  columnNumber?: number;
  callType?:
    | "direct"
    | "virtual"
    | "template"
    | "function_pointer"
    | "lambda"
    | "unknown";
  isConditional?: boolean;
  isInLoop?: boolean;
  isInTryCatch?: boolean;
  argumentTypes?: string[];
  templateArgs?: string[];
}

export interface ControlFlowPath {
  id: string;
  startBlock: string;
  endBlock: string;
  blocks: string[];
  conditions: string[];
  isComplete: boolean;
  isCyclic: boolean;
  complexity: number;
}

export interface ControlFlowAnalysis {
  blocks: ControlFlowBlock[];
  edges: ControlFlowEdge[];
  calls: ControlFlowCall[];
  paths: ControlFlowPath[];
  metrics: ComplexityMetrics;
  dataFlows?: DataFlowAnalysis;
  hotspots?: HotspotAnalysis;
  deadCode: number[];
  hotPaths: string[][];
  statistics: {
    totalBlocks: number;
    conditionalBlocks: number;
    loopBlocks: number;
    exceptionBlocks: number;
    maxNestingDepth: number;
    cyclomaticComplexity: number;
    callComplexity: number;
  };
}

// Compatibility interface for old ControlFlowAnalyzer
export interface ControlFlowGraph {
  blocks: Array<{
    id: number;
    type:
      | "entry"
      | "exit"
      | "basic"
      | "conditional"
      | "loop"
      | "switch"
      | "catch";
    startLine: number;
    endLine: number;
    code?: string;
    condition?: string;
  }>;
  edges: Array<{
    from: number;
    to: number;
    type:
      | "sequential"
      | "branch-true"
      | "branch-false"
      | "loop-back"
      | "break"
      | "continue"
      | "return"
      | "throw";
    label?: string;
  }>;
  entryBlock: number;
  exitBlocks: number[];
  loops: Array<{
    blockId: number;
    loopType: "for" | "while" | "do-while" | "range-for" | "for-in" | "for-of";
    condition: string;
    bodyStart: number;
    bodyEnd: number;
  }>;
  conditionals: Array<{
    blockId: number;
    type: "if" | "switch" | "ternary";
    condition: string;
    trueBranch: number;
    falseBranch?: number;
  }>;
  complexity: number;
}

export interface AnalysisOptions {
  language?:
    | "cpp"
    | "python"
    | "typescript"
    | "javascript"
    | "java"
    | "rust"
    | "go";
  includeDataFlow?: boolean;
  detectHotspots?: boolean;
  performanceMetrics?: boolean;
  maxDepth?: number;
  callGraphDepth?: number;
  storeInDatabase?: boolean;
  timeoutMs?: number;
}

export class UnifiedControlFlowAnalyzer {
  private logger = createLogger("UnifiedControlFlowAnalyzer");
  private memoryMonitor = getGlobalMemoryMonitor();
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private complexityAnalyzer: ComplexityAnalyzer;
  private metricsAnalyzer: CodeMetricsAnalyzer;
  private hotspotDetector?: HotspotDetector;
  private dataFlowTracker?: DataFlowTracker;
  private nextBlockId = 0;
  private nextCallId = 0;

  constructor(db: Database) {
    this.rawDb = db;
    this.db = drizzle(db);
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.metricsAnalyzer = new CodeMetricsAnalyzer();
  }

  /**
   * Convert ControlFlowAnalysis to old ControlFlowGraph format for compatibility
   */
  toControlFlowGraph(analysis: ControlFlowAnalysis): ControlFlowGraph {
    // Map string IDs to numeric IDs
    const idMap = new Map<string, number>();
    let nextId = 0;

    analysis.blocks.forEach((block) => {
      idMap.set(block.id, nextId++);
    });

    // Convert blocks
    const blocks = analysis.blocks.map((block) => ({
      id: idMap.get(block.id)!,
      type: block.type as any,
      startLine: block.startLine,
      endLine: block.endLine,
      code: block.code,
      condition: block.condition,
    }));

    // Convert edges
    const edges = analysis.edges.map((edge) => ({
      from: idMap.get(edge.from)!,
      to: idMap.get(edge.to)!,
      type: edge.type as any,
      label: edge.label,
    }));

    // Find entry and exit blocks
    const entryBlock = blocks.find((b) => b.type === "entry")?.id || 0;
    const exitBlocks = blocks.filter((b) => b.type === "exit").map((b) => b.id);

    // Extract loops and conditionals
    const loops = blocks
      .filter((b) => b.type === "loop")
      .map((b) => {
        const block = analysis.blocks.find((ab) => idMap.get(ab.id) === b.id)!;
        return {
          blockId: b.id,
          loopType: block.loopType || "for",
          condition: b.condition || "",
          bodyStart: b.startLine,
          bodyEnd: b.endLine,
        };
      });

    const conditionals = blocks
      .filter((b) => b.type === "conditional")
      .map((b) => {
        const outgoingEdges = edges.filter((e) => e.from === b.id);
        const trueBranch =
          outgoingEdges.find((e) => e.type === "branch-true")?.to || b.id + 1;
        const falseBranch = outgoingEdges.find(
          (e) => e.type === "branch-false"
        )?.to;

        return {
          blockId: b.id,
          type: "if" as const,
          condition: b.condition || "",
          trueBranch,
          falseBranch,
        };
      });

    return {
      blocks,
      edges,
      entryBlock,
      exitBlocks,
      loops,
      conditionals,
      complexity: analysis.statistics.cyclomaticComplexity,
    };
  }

  /**
   * Analyze control flow for a symbol (function/method)
   */
  async analyzeSymbol(
    symbolId: number,
    tree: Parser.Tree | null,
    content: string,
    options: AnalysisOptions = {}
  ): Promise<ControlFlowAnalysis> {
    const checkpoint = this.memoryMonitor.createCheckpoint("analyzeSymbol");
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 5000;

    try {
      // Get symbol info
      const symbol = await this.db
        .select()
        .from(universalSymbols)
        .where(eq(universalSymbols.id, symbolId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!symbol) {
        throw new Error(`Symbol ${symbolId} not found`);
      }

      this.logger.debug("Analyzing control flow", {
        symbol: symbol.name,
        line: symbol.line,
        language: options.language || "unknown",
      });

      // Initialize lazy components if needed
      if (options.detectHotspots && !this.hotspotDetector) {
        this.hotspotDetector = new HotspotDetector();
      }
      if (options.includeDataFlow && !this.dataFlowTracker) {
        this.dataFlowTracker = new DataFlowTracker();
      }

      // Build control flow graph
      let blocks: ControlFlowBlock[];
      let edges: ControlFlowEdge[];
      let calls: ControlFlowCall[];

      if (tree && tree.rootNode) {
        // AST-based analysis
        const result = await this.analyzeWithAST(
          tree,
          symbol,
          content,
          options.language || "cpp"
        );
        blocks = result.blocks;
        edges = result.edges;
        calls = result.calls;
      } else {
        // Pattern-based fallback
        const result = await this.analyzeWithPatterns(
          symbol,
          content,
          options.language || "cpp"
        );
        blocks = result.blocks;
        edges = result.edges;
        calls = result.calls;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        this.logger.warn("Control flow analysis timeout", {
          symbol: symbol.name,
          duration: Date.now() - startTime,
        });
        return this.createMinimalResult(symbol);
      }

      // Calculate complexity metrics
      const metrics = this.complexityAnalyzer.analyze({
        nodes: blocks.map((b) => ({
          id: b.id,
          type: this.mapBlockTypeToNodeType(b.type),
          line: b.startLine,
          endLine: b.endLine,
          code: b.code || `Lines ${b.startLine}-${b.endLine}`,
          metrics: b.metrics,
          children: b.children,
        })),
        edges,
        blocks: blocks as any,
        symbol: symbol as any,
      });

      // Find dead code
      const deadCode = this.findDeadCode(blocks, edges);

      // Find hot paths
      const hotPaths = this.findHotPaths(blocks, edges);

      // Generate paths
      const paths = this.generateControlFlowPaths(blocks, edges);

      // Optional analyses
      let dataFlows: DataFlowAnalysis | undefined;
      let hotspots: HotspotAnalysis | undefined;

      if (options.includeDataFlow && this.dataFlowTracker) {
        dataFlows = this.dataFlowTracker.analyze(
          blocks.map((b) => this.blockToNode(b)),
          edges,
          { symbol, edges: calls } as any
        );
      }

      if (options.detectHotspots && this.hotspotDetector) {
        hotspots = this.hotspotDetector.analyze(
          blocks.map((b) => this.blockToNode(b)),
          edges,
          { symbol, edges: calls } as any
        );
      }

      // Calculate statistics
      const statistics = this.calculateStatistics(blocks, calls, paths);

      // Store in database if requested
      if (options.storeInDatabase) {
        await this.storeControlFlow(symbolId, blocks, edges);
      }

      const analysis: ControlFlowAnalysis = {
        blocks,
        edges,
        calls,
        paths,
        metrics,
        dataFlows,
        hotspots,
        deadCode,
        hotPaths,
        statistics,
      };

      this.logger.debug("Control flow analysis completed", {
        symbol: symbol.name,
        blocks: blocks.length,
        edges: edges.length,
        complexity: statistics.cyclomaticComplexity,
      });

      return analysis;
    } catch (error) {
      this.logger.error("Control flow analysis failed", error);
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Analyze with AST
   */
  private async analyzeWithAST(
    tree: Parser.Tree,
    symbol: any,
    content: string,
    language: string
  ): Promise<{
    blocks: ControlFlowBlock[];
    edges: ControlFlowEdge[];
    calls: ControlFlowCall[];
  }> {
    const blocks: ControlFlowBlock[] = [];
    const edges: ControlFlowEdge[] = [];
    const calls: ControlFlowCall[] = [];

    // Reset counters
    this.nextBlockId = 0;
    this.nextCallId = 0;

    // Create entry block
    const entryBlock = this.createBlock(
      symbol.name,
      "entry",
      symbol.line,
      symbol.line
    );
    blocks.push(entryBlock);

    // Find function node
    const functionNode = this.findFunctionNode(tree.rootNode, symbol.line);
    if (functionNode) {
      const bodyNode = this.findFunctionBody(functionNode);
      if (bodyNode) {
        const context = {
          blocks,
          edges,
          calls,
          symbol,
          content,
          language,
          currentBlock: entryBlock.id,
        };

        const lastBlockId = await this.analyzeNode(bodyNode, context);

        // Create exit block
        const exitBlock = this.createBlock(
          symbol.name,
          "exit",
          symbol.endLine || symbol.line,
          symbol.endLine || symbol.line
        );
        blocks.push(exitBlock);

        // Connect last block to exit
        if (lastBlockId && !this.hasPathToExit(lastBlockId, edges)) {
          edges.push({
            from: lastBlockId,
            to: exitBlock.id,
            type: "sequential",
          });
        }
      }
    }

    return { blocks, edges, calls };
  }

  /**
   * Analyze AST node recursively
   */
  private async analyzeNode(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string | null> {
    const nodeType = this.normalizeNodeType(node.type, context.language);
    let currentBlockId = context.currentBlock;

    switch (nodeType) {
      case "if_statement":
        currentBlockId = await this.analyzeIfStatement(node, context);
        break;

      case "while_statement":
      case "for_statement":
      case "do_statement":
        currentBlockId = await this.analyzeLoop(node, context);
        break;

      case "switch_statement":
        currentBlockId = await this.analyzeSwitchStatement(node, context);
        break;

      case "try_statement":
        currentBlockId = await this.analyzeTryStatement(node, context);
        break;

      case "return_statement":
        currentBlockId = await this.analyzeReturnStatement(node, context);
        break;

      case "throw_statement":
        currentBlockId = await this.analyzeThrowStatement(node, context);
        break;

      case "call_expression":
        await this.analyzeCallExpression(node, context);
        break;

      case "compound_statement":
      case "block_statement":
        for (const child of node.children) {
          if (child.type !== "{" && child.type !== "}") {
            context.currentBlock = currentBlockId;
            const nextId = await this.analyzeNode(child, context);
            if (nextId !== null) {
              currentBlockId = nextId;
            }
          }
        }
        break;

      default:
        // Recursively analyze children
        for (const child of node.children) {
          context.currentBlock = currentBlockId;
          const nextId = await this.analyzeNode(child, context);
          if (nextId !== null) {
            currentBlockId = nextId;
          }
        }
    }

    return currentBlockId;
  }

  /**
   * Analyze if statement
   */
  private async analyzeIfStatement(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string> {
    const { blocks, edges, content } = context;

    // Create conditional block
    const condBlock = this.createBlock(
      context.symbol.name,
      "conditional",
      node.startPosition.row + 1,
      node.endPosition.row + 1
    );

    // Extract condition
    const conditionNode = node.childForFieldName("condition");
    if (conditionNode) {
      condBlock.condition = content.substring(
        conditionNode.startIndex,
        conditionNode.endIndex
      );
    }

    blocks.push(condBlock);
    edges.push({
      from: context.currentBlock,
      to: condBlock.id,
      type: "sequential",
    });

    // Analyze branches
    const trueBranchNode = node.childForFieldName("consequence");
    const falseBranchNode = node.childForFieldName("alternative");

    let trueEndId: string | null = null;
    let falseEndId: string | null = null;

    if (trueBranchNode) {
      const trueBlock = this.createBlock(
        context.symbol.name,
        "basic",
        trueBranchNode.startPosition.row + 1,
        trueBranchNode.endPosition.row + 1
      );
      blocks.push(trueBlock);
      edges.push({
        from: condBlock.id,
        to: trueBlock.id,
        type: "branch-true",
        label: "true",
      });

      context.currentBlock = trueBlock.id;
      trueEndId = await this.analyzeNode(trueBranchNode, context);
    }

    if (falseBranchNode) {
      const falseBlock = this.createBlock(
        context.symbol.name,
        "basic",
        falseBranchNode.startPosition.row + 1,
        falseBranchNode.endPosition.row + 1
      );
      blocks.push(falseBlock);
      edges.push({
        from: condBlock.id,
        to: falseBlock.id,
        type: "branch-false",
        label: "false",
      });

      context.currentBlock = falseBlock.id;
      falseEndId = await this.analyzeNode(falseBranchNode, context);
    }

    // Create merge block
    const mergeBlock = this.createBlock(
      context.symbol.name,
      "basic",
      node.endPosition.row + 1,
      node.endPosition.row + 1
    );
    blocks.push(mergeBlock);

    // Connect branches to merge
    if (trueEndId) {
      edges.push({
        from: trueEndId,
        to: mergeBlock.id,
        type: "sequential",
      });
    }

    if (falseEndId) {
      edges.push({
        from: falseEndId,
        to: mergeBlock.id,
        type: "sequential",
      });
    } else {
      // No else branch - connect condition directly to merge
      edges.push({
        from: condBlock.id,
        to: mergeBlock.id,
        type: "branch-false",
        label: "false",
      });
    }

    return mergeBlock.id;
  }

  /**
   * Analyze loop statement
   */
  private async analyzeLoop(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string> {
    const { blocks, edges, content } = context;

    const loopType = this.getLoopType(node.type);

    // Create loop block
    const loopBlock = this.createBlock(
      context.symbol.name,
      "loop",
      node.startPosition.row + 1,
      node.endPosition.row + 1
    );
    loopBlock.loopType = loopType;

    // Extract condition
    const conditionNode = node.childForFieldName("condition");
    if (conditionNode) {
      loopBlock.condition = content.substring(
        conditionNode.startIndex,
        conditionNode.endIndex
      );
    }

    blocks.push(loopBlock);
    edges.push({
      from: context.currentBlock,
      to: loopBlock.id,
      type: "sequential",
    });

    // Analyze loop body
    const bodyNode = node.childForFieldName("body");
    if (bodyNode) {
      const bodyBlock = this.createBlock(
        context.symbol.name,
        "basic",
        bodyNode.startPosition.row + 1,
        bodyNode.endPosition.row + 1
      );
      blocks.push(bodyBlock);
      edges.push({
        from: loopBlock.id,
        to: bodyBlock.id,
        type: "branch-true",
        label: "enter loop",
      });

      context.currentBlock = bodyBlock.id;
      const bodyEndId = await this.analyzeNode(bodyNode, context);

      // Loop back edge
      if (bodyEndId) {
        edges.push({
          from: bodyEndId,
          to: loopBlock.id,
          type: "loop-back",
          label: "continue",
        });
      }
    }

    // Create exit block
    const exitBlock = this.createBlock(
      context.symbol.name,
      "basic",
      node.endPosition.row + 1,
      node.endPosition.row + 1
    );
    blocks.push(exitBlock);
    edges.push({
      from: loopBlock.id,
      to: exitBlock.id,
      type: "branch-false",
      label: "exit loop",
    });

    return exitBlock.id;
  }

  /**
   * Pattern-based analysis fallback
   */
  private async analyzeWithPatterns(
    symbol: any,
    content: string,
    language: string
  ): Promise<{
    blocks: ControlFlowBlock[];
    edges: ControlFlowEdge[];
    calls: ControlFlowCall[];
  }> {
    const blocks: ControlFlowBlock[] = [];
    const edges: ControlFlowEdge[] = [];
    const calls: ControlFlowCall[] = [];

    // Reset counters
    this.nextBlockId = 0;
    this.nextCallId = 0;

    const lines = content.split("\n");
    const functionStart = symbol.line - 1;
    const functionEnd = symbol.endLine ? symbol.endLine - 1 : lines.length - 1;

    // Create entry block
    const entryBlock = this.createBlock(
      symbol.name,
      "entry",
      symbol.line,
      symbol.line
    );
    blocks.push(entryBlock);

    let currentBlockStart = functionStart;
    let lastBlockId = entryBlock.id;

    // Language-specific patterns
    const patterns = this.getLanguagePatterns(language);

    // Analyze line by line
    for (let i = functionStart; i <= functionEnd && i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for control structures
      for (const [patternName, pattern] of Object.entries(patterns)) {
        if (pattern.test(line)) {
          // Create block for code before control structure
          if (i > currentBlockStart) {
            const block = this.createBlock(
              symbol.name,
              "basic",
              currentBlockStart + 1,
              i
            );
            blocks.push(block);
            edges.push({ from: lastBlockId, to: block.id, type: "sequential" });
            lastBlockId = block.id;
          }

          // Create control structure block
          const controlBlock = this.createControlBlock(
            patternName,
            symbol.name,
            lineNum,
            line
          );
          blocks.push(controlBlock);
          edges.push({
            from: lastBlockId,
            to: controlBlock.id,
            type: "sequential",
          });
          lastBlockId = controlBlock.id;

          currentBlockStart = i + 1;
          break;
        }
      }

      // Extract function calls
      const callMatches = this.extractFunctionCalls(
        line,
        lineNum,
        symbol.name,
        language
      );
      calls.push(...callMatches);
    }

    // Create final block
    if (currentBlockStart < functionEnd) {
      const block = this.createBlock(
        symbol.name,
        "basic",
        currentBlockStart + 1,
        functionEnd
      );
      blocks.push(block);
      edges.push({ from: lastBlockId, to: block.id, type: "sequential" });
      lastBlockId = block.id;
    }

    // Create exit block
    const exitBlock = this.createBlock(
      symbol.name,
      "exit",
      functionEnd + 1,
      functionEnd + 1
    );
    blocks.push(exitBlock);
    edges.push({ from: lastBlockId, to: exitBlock.id, type: "sequential" });

    return { blocks, edges, calls };
  }

  /**
   * Helper methods
   */
  private createBlock(
    symbolName: string,
    type: ControlFlowBlock["type"],
    startLine: number,
    endLine: number,
    parentBlockId?: string,
    condition?: string
  ): ControlFlowBlock {
    const id = `block_${this.nextBlockId++}`;
    return {
      id,
      symbolName,
      type,
      startLine,
      endLine,
      parentBlockId,
      condition,
      complexity: this.calculateBlockComplexity(type),
    };
  }

  private calculateBlockComplexity(type: ControlFlowBlock["type"]): number {
    switch (type) {
      case "loop":
        return 2;
      case "conditional":
      case "switch":
        return 1;
      default:
        return 0;
    }
  }

  private findFunctionNode(
    root: Parser.SyntaxNode,
    targetLine: number
  ): Parser.SyntaxNode | null {
    const queue: Parser.SyntaxNode[] = [root];

    while (queue.length > 0) {
      const node = queue.shift()!;

      if (
        this.isFunctionNode(node) &&
        node.startPosition.row + 1 === targetLine
      ) {
        return node;
      }

      queue.push(...node.children);
    }

    return null;
  }

  private isFunctionNode(node: Parser.SyntaxNode): boolean {
    const functionTypes = [
      "function_definition",
      "method_definition",
      "function_declaration",
      "method_declaration",
      "lambda_expression",
      "arrow_function",
    ];
    return functionTypes.includes(node.type);
  }

  private findFunctionBody(
    functionNode: Parser.SyntaxNode
  ): Parser.SyntaxNode | null {
    return (
      functionNode.childForFieldName("body") ||
      functionNode.children.find(
        (child) =>
          child.type === "compound_statement" ||
          child.type === "block_statement"
      ) ||
      null
    );
  }

  private normalizeNodeType(nodeType: string, language: string): string {
    // Language-specific mappings
    const mappings: Record<string, Record<string, string>> = {
      python: {
        if_statement: "if_statement",
        elif_clause: "if_statement",
        else_clause: "if_statement",
        for_in_clause: "for_statement",
        while_statement: "while_statement",
        return_statement: "return_statement",
        raise_statement: "throw_statement",
        try_statement: "try_statement",
        match_statement: "switch_statement",
      },
      typescript: {
        if_else_statement: "if_statement",
        for_in_statement: "for_statement",
        for_of_statement: "for_statement",
        throw_expression: "throw_statement",
        switch_case: "switch_statement",
        block: "compound_statement",
      },
      javascript: {
        if_else_statement: "if_statement",
        for_in_statement: "for_statement",
        for_of_statement: "for_statement",
        throw_expression: "throw_statement",
        switch_case: "switch_statement",
        statement_block: "compound_statement",
      },
    };

    const langMappings = mappings[language] || {};
    return langMappings[nodeType] || nodeType;
  }

  private getLoopType(nodeType: string): ControlFlowBlock["loopType"] {
    switch (nodeType) {
      case "for_statement":
        return "for";
      case "while_statement":
        return "while";
      case "do_statement":
        return "do-while";
      case "for_range_loop":
        return "range-for";
      case "for_in_statement":
        return "for-in";
      case "for_of_statement":
        return "for-of";
      default:
        return "for";
    }
  }

  private getLanguagePatterns(language: string): Record<string, RegExp> {
    const basePatterns = {
      if: /\b(if|elif|else\s+if)\s*[(:]/,
      while: /\bwhile\s*[(:]/,
      for: /\bfor\s*[(:]/,
      switch: /\b(switch|match)\s*[(:]/,
      try: /\btry\s*[:{]/,
      catch: /\b(catch|except)\s*[(:]/,
      return: /\breturn\b/,
      throw: /\b(throw|raise)\b/,
    };

    // Language-specific adjustments
    if (language === "python") {
      basePatterns.if = /^\s*(if|elif|else)\s*.*:/;
      basePatterns.while = /^\s*while\s+.*:/;
      basePatterns.for = /^\s*for\s+.*:/;
    }

    return basePatterns;
  }

  private createControlBlock(
    patternName: string,
    symbolName: string,
    lineNum: number,
    line: string
  ): ControlFlowBlock {
    let type: ControlFlowBlock["type"] = "basic";
    let condition: string | undefined;

    switch (patternName) {
      case "if":
        type = "conditional";
        condition = this.extractCondition(line, patternName);
        break;
      case "while":
      case "for":
        type = "loop";
        condition = this.extractCondition(line, patternName);
        break;
      case "switch":
        type = "switch";
        condition = this.extractCondition(line, patternName);
        break;
      case "try":
        type = "try";
        break;
      case "catch":
        type = "catch";
        break;
      case "return":
        type = "return";
        break;
      case "throw":
        type = "throw";
        break;
    }

    return this.createBlock(
      symbolName,
      type,
      lineNum,
      lineNum,
      undefined,
      condition
    );
  }

  private extractCondition(line: string, controlType: string): string {
    // Extract condition based on control type
    // For C++/JS/TS style with parentheses
    const parenMatch = line.match(new RegExp(`\\b${controlType}\\s*\\(([^)]+)\\)`));
    if (parenMatch) return parenMatch[1].trim();

    // For Python style with colon
    const colonMatch = line.match(new RegExp(`\\b${controlType}\\s+(.+?):`));
    if (colonMatch) return colonMatch[1].trim();

    // For catch blocks - extract exception type
    if (controlType === 'catch') {
      const catchMatch = line.match(/\bcatch\s*\(([^)]+)\)/);
      if (catchMatch) return catchMatch[1].trim();
    }

    return "";
  }

  private extractFunctionCalls(
    line: string,
    lineNum: number,
    callerName: string,
    _language: string
  ): ControlFlowCall[] {
    const calls: ControlFlowCall[] = [];
    const patterns = this.getFunctionCallPatterns(_language);

    for (const pattern of patterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        const targetFunction = match[1];
        if (!this.isControlKeyword(targetFunction, _language)) {
          calls.push({
            id: `call_${this.nextCallId++}`,
            callerName,
            targetFunction,
            lineNumber: lineNum,
            columnNumber: match.index,
          });
        }
      }
    }

    return calls;
  }

  private getFunctionCallPatterns(language: string): RegExp[] {
    switch (language) {
      case "python":
        return [/(\w+)\s*\(/g, /(\w+(?:\.\w+)+)\s*\(/g];
      case "cpp":
        return [
          /(\w+(?:::\w+)*)\s*\(/g,
          /(\w+(?:\.\w+)+)\s*\(/g,
          /(\w+(?:->\w+)+)\s*\(/g,
        ];
      default:
        return [/(\w+)\s*\(/g, /(\w+(?:\.\w+)+)\s*\(/g];
    }
  }

  private isControlKeyword(word: string, language: string): boolean {
    // Common keywords across languages
    const commonKeywords = [
      "if",
      "else",
      "while",
      "for",
      "do",
      "switch",
      "case",
      "try",
      "catch",
      "return",
    ];
    
    // Language-specific keywords
    const languageKeywords: Record<string, string[]> = {
      python: [
        "elif",
        "except",
        "finally",
        "raise",
        "with",
        "pass",
        "break",
        "continue",
        "def",
        "class",
        "lambda",
        "yield",
        "assert"
      ],
      cpp: [
        "throw",
        "sizeof",
        "typeof",
        "new",
        "delete",
        "namespace",
        "using",
        "static_cast",
        "dynamic_cast",
        "const_cast",
        "reinterpret_cast",
        "typeid",
        "noexcept"
      ],
      javascript: [
        "throw",
        "typeof",
        "instanceof",
        "new",
        "delete",
        "finally",
        "async",
        "await",
        "yield",
        "const",
        "let",
        "var",
        "function"
      ],
      typescript: [
        "throw",
        "typeof",
        "instanceof",
        "new",
        "delete",
        "finally",
        "async",
        "await",
        "yield",
        "const",
        "let",
        "var",
        "function",
        "interface",
        "type",
        "enum",
        "namespace",
        "declare"
      ],
      java: [
        "throw",
        "instanceof",
        "new",
        "finally",
        "synchronized",
        "volatile",
        "transient",
        "native",
        "strictfp",
        "assert"
      ],
      rust: [
        "match",
        "loop",
        "continue",
        "break",
        "unsafe",
        "async",
        "await",
        "move",
        "fn",
        "impl",
        "trait",
        "mod"
      ],
      go: [
        "defer",
        "panic",
        "recover",
        "go",
        "chan",
        "select",
        "fallthrough",
        "func",
        "interface",
        "struct",
        "package"
      ]
    };
    
    // Check common keywords first
    if (commonKeywords.includes(word)) {
      return true;
    }
    
    // Check language-specific keywords
    const specificKeywords = languageKeywords[language] || [];
    return specificKeywords.includes(word);
  }

  private findDeadCode(
    blocks: ControlFlowBlock[],
    edges: ControlFlowEdge[]
  ): number[] {
    const reachable = new Set<string>();
    const queue = blocks.filter((b) => b.type === "entry").map((b) => b.id);

    while (queue.length > 0) {
      const blockId = queue.shift()!;
      if (reachable.has(blockId)) continue;

      reachable.add(blockId);

      const outgoing = edges.filter((e) => e.from === blockId);
      outgoing.forEach((edge) => {
        if (!reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      });
    }

    return blocks.filter((b) => !reachable.has(b.id)).map((b) => b.startLine);
  }

  private findHotPaths(
    blocks: ControlFlowBlock[],
    edges: ControlFlowEdge[]
  ): string[][] {
    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (blockId: string, path: string[]) => {
      if (visited.has(blockId)) return;
      visited.add(blockId);

      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      path.push(blockId);

      if (block.type === "exit") {
        paths.push([...path]);
      } else {
        const outgoing = edges.filter((e) => e.from === blockId);
        outgoing.forEach((edge) => {
          dfs(edge.to, path);
        });
      }

      path.pop();
      visited.delete(blockId);
    };

    blocks
      .filter((b) => b.type === "entry")
      .forEach((entry) => {
        dfs(entry.id, []);
      });

    // Sort by complexity and length
    return paths
      .sort((a, b) => {
        const complexityA = a.reduce((sum, id) => {
          const block = blocks.find((b) => b.id === id);
          return sum + (block?.complexity || 0);
        }, 0);
        const complexityB = b.reduce((sum, id) => {
          const block = blocks.find((b) => b.id === id);
          return sum + (block?.complexity || 0);
        }, 0);
        return complexityB - complexityA || a.length - b.length;
      })
      .slice(0, 5);
  }

  private generateControlFlowPaths(
    blocks: ControlFlowBlock[],
    edges: ControlFlowEdge[]
  ): ControlFlowPath[] {
    const paths: ControlFlowPath[] = [];
    const entryBlocks = blocks.filter((b) => b.type === "entry");
    const exitBlocks = blocks.filter((b) => b.type === "exit");

    for (const entry of entryBlocks) {
      for (const exit of exitBlocks) {
        if (entry.symbolName === exit.symbolName) {
          const pathBlocks = this.findPathBetween(entry.id, exit.id, edges);
          if (pathBlocks.length > 0) {
            const conditions = pathBlocks
              .map((id) => blocks.find((b) => b.id === id))
              .filter((b) => b && b.condition)
              .map((b) => b!.condition!);

            const complexity = pathBlocks.reduce((sum, id) => {
              const block = blocks.find((b) => b.id === id);
              return sum + (block?.complexity || 0);
            }, 0);

            paths.push({
              id: `path_${entry.id}_${exit.id}`,
              startBlock: entry.id,
              endBlock: exit.id,
              blocks: pathBlocks,
              conditions,
              isComplete: true,
              isCyclic: this.detectCycle(pathBlocks, edges),
              complexity,
            });
          }
        }
      }
    }

    return paths;
  }

  private findPathBetween(
    start: string,
    end: string,
    edges: ControlFlowEdge[]
  ): string[] {
    const queue: { id: string; path: string[] }[] = [
      { id: start, path: [start] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (id === end) {
        return path;
      }

      if (visited.has(id)) continue;
      visited.add(id);

      const outgoing = edges.filter((e) => e.from === id);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          queue.push({ id: edge.to, path: [...path, edge.to] });
        }
      }
    }

    return [];
  }

  private detectCycle(path: string[], edges: ControlFlowEdge[]): boolean {
    const pathSet = new Set(path);
    return edges.some(
      (e) =>
        pathSet.has(e.from) &&
        pathSet.has(e.to) &&
        path.indexOf(e.to) < path.indexOf(e.from)
    );
  }

  private calculateStatistics(
    blocks: ControlFlowBlock[],
    calls: ControlFlowCall[],
    paths: ControlFlowPath[]
  ): ControlFlowAnalysis["statistics"] {
    const conditionalBlocks = blocks.filter(
      (b) => b.type === "conditional"
    ).length;
    const loopBlocks = blocks.filter((b) => b.type === "loop").length;
    const exceptionBlocks = blocks.filter(
      (b) => b.type === "try" || b.type === "catch" || b.type === "finally"
    ).length;

    // Cyclomatic complexity: edges - nodes + 2
    const nodes = blocks.length;
    const edges = paths.reduce((sum, p) => sum + p.blocks.length - 1, 0);
    const cyclomaticComplexity = Math.max(1, edges - nodes + 2);

    // Max nesting depth
    const maxNestingDepth = this.calculateMaxNestingDepth(blocks);

    return {
      totalBlocks: blocks.length,
      conditionalBlocks,
      loopBlocks,
      exceptionBlocks,
      maxNestingDepth,
      cyclomaticComplexity,
      callComplexity: calls.length,
    };
  }

  private calculateMaxNestingDepth(blocks: ControlFlowBlock[]): number {
    let maxDepth = 0;

    const calculateDepth = (blockId: string, depth: number = 0): void => {
      maxDepth = Math.max(maxDepth, depth);
      const children = blocks.filter((b) => b.parentBlockId === blockId);
      for (const child of children) {
        calculateDepth(child.id, depth + 1);
      }
    };

    // Start from blocks without parents
    blocks
      .filter((b) => !b.parentBlockId)
      .forEach((b) => {
        calculateDepth(b.id);
      });

    return maxDepth;
  }

  private hasPathToExit(blockId: string, edges: ControlFlowEdge[]): boolean {
    const visited = new Set<string>();
    const queue = [blockId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const outgoing = edges.filter((e) => e.from === current);
      if (outgoing.some((e) => e.type === "return" || e.type === "throw")) {
        return true;
      }

      queue.push(...outgoing.map((e) => e.to));
    }

    return false;
  }

  private blockToNode(block: ControlFlowBlock): any {
    return {
      id: block.id,
      type: this.mapBlockTypeToNodeType(block.type),
      line: block.startLine,
      endLine: block.endLine,
      code: block.code || `Lines ${block.startLine}-${block.endLine}`,
      metrics: block.metrics,
      children: block.children,
    };
  }

  private mapBlockTypeToNodeType(blockType: ControlFlowBlock["type"]): string {
    const mapping: Record<ControlFlowBlock["type"], string> = {
      entry: "entry",
      exit: "exit",
      basic: "statement",
      statement: "statement",
      conditional: "condition",
      loop: "loop",
      switch: "switch",
      try: "exception",
      catch: "exception",
      finally: "exception",
      return: "return",
      throw: "exception",
    };
    return mapping[blockType] || "statement";
  }

  private async storeControlFlow(
    symbolId: number,
    blocks: ControlFlowBlock[],
    _edges: ControlFlowEdge[]
  ): Promise<void> {
    // Delete existing control flow data
    await this.db
      .delete(controlFlowBlocks)
      .where(eq(controlFlowBlocks.symbolId, symbolId));

    // Store blocks
    for (const block of blocks) {
      await this.db.insert(controlFlowBlocks).values({
        symbolId,
        blockType: block.type,
        startLine: block.startLine,
        endLine: block.endLine,
        condition: block.condition,
        complexity: block.complexity,
      });
    }
  }

  private createMinimalResult(symbol: any): ControlFlowAnalysis {
    const entryBlock = this.createBlock(
      symbol.name,
      "entry",
      symbol.line,
      symbol.line
    );
    const exitBlock = this.createBlock(
      symbol.name,
      "exit",
      symbol.endLine || symbol.line,
      symbol.endLine || symbol.line
    );

    return {
      blocks: [entryBlock, exitBlock],
      edges: [{ from: entryBlock.id, to: exitBlock.id, type: "sequential" }],
      calls: [],
      paths: [],
      metrics: {
        cyclomaticComplexity: 1,
        cognitiveComplexity: 1,
        nestingDepth: 0,
        paramCount: 0,
        localVariables: 0,
        returnPoints: 1,
        halsteadMetrics: {
          vocabulary: 0,
          length: 0,
          volume: 0,
          difficulty: 0,
          effort: 0,
          time: 0,
          bugs: 0,
        },
        maintainabilityIndex: 100,
      },
      deadCode: [],
      hotPaths: [],
      statistics: {
        totalBlocks: 2,
        conditionalBlocks: 0,
        loopBlocks: 0,
        exceptionBlocks: 0,
        maxNestingDepth: 0,
        cyclomaticComplexity: 1,
        callComplexity: 0,
      },
    };
  }

  // Additional methods for specific statement types
  private async analyzeSwitchStatement(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string | null> {
    const { blocks, edges, content } = context;

    const switchBlock = this.createBlock(
      context.symbol.name,
      "switch",
      node.startPosition.row + 1,
      node.endPosition.row + 1
    );

    const conditionNode = node.childForFieldName("condition");
    if (conditionNode) {
      switchBlock.condition = content.substring(
        conditionNode.startIndex,
        conditionNode.endIndex
      );
    }

    blocks.push(switchBlock);
    edges.push({
      from: context.currentBlock,
      to: switchBlock.id,
      type: "sequential",
    });

    // TODO: Analyze case statements
    const bodyNode = node.childForFieldName("body");
    if (bodyNode) {
      context.currentBlock = switchBlock.id;
      return await this.analyzeNode(bodyNode, context);
    }

    return switchBlock.id;
  }

  private async analyzeTryStatement(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string | null> {
    const { blocks, edges } = context;

    const tryBlock = this.createBlock(
      context.symbol.name,
      "try",
      node.startPosition.row + 1,
      node.endPosition.row + 1
    );

    blocks.push(tryBlock);
    edges.push({
      from: context.currentBlock,
      to: tryBlock.id,
      type: "sequential",
    });

    // Analyze try body
    const bodyNode = node.childForFieldName("body");
    let lastBlockId = tryBlock.id;
    if (bodyNode) {
      context.currentBlock = tryBlock.id;
      const bodyEndId = await this.analyzeNode(bodyNode, context);
      if (bodyEndId) lastBlockId = bodyEndId;
    }

    // Analyze catch clauses
    for (const child of node.children) {
      if (child.type === "catch_clause") {
        const catchBlock = this.createBlock(
          context.symbol.name,
          "catch",
          child.startPosition.row + 1,
          child.endPosition.row + 1
        );
        blocks.push(catchBlock);
        edges.push({
          from: tryBlock.id,
          to: catchBlock.id,
          type: "exception",
        });

        const catchBody = child.childForFieldName("body");
        if (catchBody) {
          context.currentBlock = catchBlock.id;
          const catchEndId = await this.analyzeNode(catchBody, context);
          if (catchEndId) lastBlockId = catchEndId;
        }
      }
    }

    return lastBlockId;
  }

  private async analyzeReturnStatement(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string | null> {
    const { blocks, edges } = context;

    const returnBlock = this.createBlock(
      context.symbol.name,
      "return",
      node.startPosition.row + 1,
      node.endPosition.row + 1
    );

    blocks.push(returnBlock);
    edges.push({
      from: context.currentBlock,
      to: returnBlock.id,
      type: "sequential",
    });

    // Find or create exit block
    let exitBlock = blocks.find(
      (b: ControlFlowBlock) =>
        b.type === "exit" && b.symbolName === context.symbol.name
    );
    if (!exitBlock) {
      exitBlock = this.createBlock(
        context.symbol.name,
        "exit",
        context.symbol.endLine || returnBlock.endLine,
        context.symbol.endLine || returnBlock.endLine
      );
      blocks.push(exitBlock);
    }

    edges.push({
      from: returnBlock.id,
      to: exitBlock.id,
      type: "return",
    });

    return returnBlock.id;
  }

  private async analyzeThrowStatement(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<string | null> {
    const { blocks, edges } = context;

    const throwBlock = this.createBlock(
      context.symbol.name,
      "throw",
      node.startPosition.row + 1,
      node.endPosition.row + 1
    );

    blocks.push(throwBlock);
    edges.push({
      from: context.currentBlock,
      to: throwBlock.id,
      type: "sequential",
    });

    // Find or create exit block
    let exitBlock = blocks.find(
      (b: ControlFlowBlock) =>
        b.type === "exit" && b.symbolName === context.symbol.name
    );
    if (!exitBlock) {
      exitBlock = this.createBlock(
        context.symbol.name,
        "exit",
        context.symbol.endLine || throwBlock.endLine,
        context.symbol.endLine || throwBlock.endLine
      );
      blocks.push(exitBlock);
    }

    edges.push({
      from: throwBlock.id,
      to: exitBlock.id,
      type: "throw",
    });

    return throwBlock.id;
  }

  private async analyzeCallExpression(
    node: Parser.SyntaxNode,
    context: any
  ): Promise<void> {
    const { calls, content } = context;

    const functionNode = node.childForFieldName("function");
    if (!functionNode) return;

    const functionName = content.substring(
      functionNode.startIndex,
      functionNode.endIndex
    );

    if (this.isControlKeyword(functionName, context.language)) {
      return;
    }

    const call: ControlFlowCall = {
      id: `call_${this.nextCallId++}`,
      callerName: context.symbol.name,
      targetFunction: functionName,
      lineNumber: node.startPosition.row + 1,
      columnNumber: node.startPosition.column + 1,
      callType: this.determineCallType(functionNode, context),
    };

    // Add context information
    const currentBlock = context.blocks.find(
      (b: ControlFlowBlock) => b.id === context.currentBlock
    );
    if (currentBlock) {
      call.isConditional = currentBlock.type === "conditional";
      call.isInLoop = currentBlock.type === "loop";
      call.isInTryCatch =
        currentBlock.type === "try" || currentBlock.type === "catch";

      // Add call to block
      if (!currentBlock.calls) currentBlock.calls = [];
      currentBlock.calls.push(functionName);
    }

    calls.push(call);
  }

  private determineCallType(
    functionNode: Parser.SyntaxNode,
    context: any
  ): ControlFlowCall["callType"] {
    const nodeText = context.content.substring(
      functionNode.startIndex,
      functionNode.endIndex
    );

    if (functionNode.type === "field_expression" || nodeText.includes("->")) {
      return "virtual";
    } else if (
      functionNode.type === "template_instantiation" ||
      nodeText.includes("<")
    ) {
      return "template";
    } else if (functionNode.type === "lambda_expression") {
      return "lambda";
    } else if (nodeText.includes("(*") || nodeText.includes("->*")) {
      return "function_pointer";
    }

    return "direct";
  }

  /**
   * Analyze control flow for in-memory symbol data (for parsers)
   * This is the primary adapter method for parsers that have symbol data
   * but haven't stored it in the database yet.
   */
  async analyzeSymbolData(
    symbolData: {
      name: string;
      qualifiedName?: string;
      line: number;
      endLine?: number;
      kind?: string;
      signature?: string;
      returnType?: string;
      content?: string;
      language?: string;
    },
    tree: Parser.Tree | null,
    content: string,
    options: AnalysisOptions = {}
  ): Promise<ControlFlowAnalysis> {
    const checkpoint = this.memoryMonitor.createCheckpoint("analyzeSymbolData");
    
    try {
      // Build control flow graph
      let blocks: ControlFlowBlock[];
      let edges: ControlFlowEdge[];
      let calls: ControlFlowCall[];

      if (tree && tree.rootNode) {
        // AST-based analysis
        const result = await this.analyzeWithAST(
          tree,
          symbolData,
          content,
          options.language || symbolData.language || "cpp"
        );
        blocks = result.blocks;
        edges = result.edges;
        calls = result.calls;
      } else {
        // Pattern-based fallback
        const result = await this.analyzeWithPatterns(
          symbolData,
          content,
          options.language || symbolData.language || "cpp"
        );
        blocks = result.blocks;
        edges = result.edges;
        calls = result.calls;
      }

      // Calculate complexity metrics using CodeMetricsAnalyzer
      const nodes = blocks.map((b) => this.blockToNode(b));
      
      const metricInput: MetricsInput = {
        source: symbolData.content || content,
        lines: (symbolData.content || content).split('\n'),
        nodes: nodes,
        edges: edges,
        blocks: blocks,
        symbol: {
          name: symbolData.name,
          kind: symbolData.kind || 'function',
          signature: symbolData.signature,
          returnType: symbolData.returnType,
          line: symbolData.line,
          endLine: symbolData.endLine
        },
        language: options.language || symbolData.language || 'cpp'
      };

      const coreMetrics = this.metricsAnalyzer.analyzeComplexity(metricInput);
      
      // Transform to dashboard-compatible ComplexityMetrics
      const metrics: ComplexityMetrics = {
        cyclomaticComplexity: coreMetrics.cyclomaticComplexity,
        cognitiveComplexity: coreMetrics.cognitiveComplexity,
        nestingDepth: coreMetrics.nestingDepth,
        paramCount: coreMetrics.parameterCount,
        localVariables: coreMetrics.localVariables || 0,
        returnPoints: coreMetrics.returnPoints || 0,
        halsteadMetrics: {
          vocabulary: coreMetrics.halstead.vocabulary,
          length: coreMetrics.halstead.length,
          volume: Math.round(coreMetrics.halstead.volume),
          difficulty: Math.round(coreMetrics.halstead.difficulty * 10) / 10,
          effort: Math.round(coreMetrics.halstead.effort),
          time: Math.round(coreMetrics.halstead.timeToImplement),
          bugs: Math.round(coreMetrics.halstead.bugs * 100) / 100
        },
        maintainabilityIndex: Math.round(coreMetrics.maintainabilityIndex)
      };

      // Calculate other required fields
      const deadCode = this.findDeadCode(blocks, edges);
      const hotPaths = this.findHotPaths(blocks, edges);
      const paths = this.generateControlFlowPaths(blocks, edges);
      const statistics = this.calculateStatistics(blocks, calls, paths);

      // Optional analyses
      let dataFlows: DataFlowAnalysis | undefined;
      let hotspots: HotspotAnalysis | undefined;

      if (options.includeDataFlow && !this.dataFlowTracker) {
        this.dataFlowTracker = new DataFlowTracker();
      }
      if (options.detectHotspots && !this.hotspotDetector) {
        this.hotspotDetector = new HotspotDetector();
      }

      if (options.includeDataFlow && this.dataFlowTracker) {
        dataFlows = this.dataFlowTracker.analyze(
          nodes,
          edges,
          { symbol: symbolData, edges: calls } as any
        );
      }

      if (options.detectHotspots && this.hotspotDetector) {
        hotspots = this.hotspotDetector.analyze(
          nodes,
          edges,
          { symbol: symbolData, edges: calls } as any
        );
      }

      return {
        blocks,
        edges,
        calls,
        paths,
        metrics,
        dataFlows,
        hotspots,
        deadCode,
        hotPaths,
        statistics,
      };
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Analyze control flow for visualization (dashboard use case)
   */
  async analyzeVisualization(
    data: {
      symbol: any;
      blocks?: any[];
      edges?: any[];
      entry_point?: number;
      exit_points?: number[];
    },
    options: AnalysisOptions = {}
  ): Promise<ControlFlowAnalysis> {
    const { includeDataFlow = true, detectHotspots = true } = options;

    // Transform raw data into control flow structures
    const { nodes, edges } = this.buildControlFlowGraphFromData(data);

    // Calculate complexity metrics
    const metrics = this.complexityAnalyzer.analyze({
      nodes,
      edges,
      blocks: data.blocks || [],
      symbol: data.symbol,
    });

    // Initialize lazy components if needed
    if (detectHotspots && !this.hotspotDetector) {
      this.hotspotDetector = new HotspotDetector();
    }
    if (includeDataFlow && !this.dataFlowTracker) {
      this.dataFlowTracker = new DataFlowTracker();
    }

    // Detect hotspots and performance bottlenecks
    let hotspots: HotspotAnalysis = {
      hotPaths: [],
      bottlenecks: [],
      optimizationOpportunities: [],
    };
    if (detectHotspots && this.hotspotDetector) {
      hotspots = this.hotspotDetector.analyze(nodes, edges, data);
    }

    // Track data flow through the function
    let dataFlows: DataFlowAnalysis = { flows: [], variables: new Map() };
    if (includeDataFlow && this.dataFlowTracker) {
      dataFlows = this.dataFlowTracker.analyze(nodes, edges, data);
    }

    // Find dead code
    const deadCode = this.findDeadCode(
      nodes.map((n) => ({
        ...n,
        id: n.id,
        symbolName: data.symbol.name,
        type: this.mapNodeTypeToBlockType(n.type),
        startLine: n.line,
        endLine: n.endLine || n.line,
        complexity: 0,
      })),
      edges
    );

    // Extract hot execution paths
    const hotPaths = this.findHotPaths(
      nodes.map((n) => ({
        ...n,
        id: n.id,
        symbolName: data.symbol.name,
        type: this.mapNodeTypeToBlockType(n.type),
        startLine: n.line,
        endLine: n.endLine || n.line,
        complexity: 0,
      })),
      edges
    );

    // Convert nodes back to blocks for compatibility
    const blocks: ControlFlowBlock[] = nodes.map((n) => ({
      id: n.id,
      symbolName: data.symbol.name,
      type: this.mapNodeTypeToBlockType(n.type),
      startLine: n.line,
      endLine: n.endLine || n.line,
      code: n.code,
      complexity: 0,
      metrics: n.metrics,
      children: n.children,
    }));

    return {
      blocks,
      edges,
      calls: [], // Visualization doesn't need detailed call info
      paths: [],
      metrics,
      dataFlows,
      hotspots,
      deadCode,
      hotPaths,
      statistics: this.calculateStatistics(blocks, [], []),
    };
  }

  /**
   * Core analysis logic shared by all entry points
   */
  private async performAnalysis(
    symbol: any,
    tree: Parser.Tree | null,
    content: string,
    options: AnalysisOptions
  ): Promise<ControlFlowAnalysis> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 5000;

    this.logger.debug("Analyzing control flow", {
      symbol: symbol.name,
      line: symbol.line,
      language: options.language || "unknown",
    });

    // Initialize lazy components if needed
    if (options.detectHotspots && !this.hotspotDetector) {
      this.hotspotDetector = new HotspotDetector();
    }
    if (options.includeDataFlow && !this.dataFlowTracker) {
      this.dataFlowTracker = new DataFlowTracker();
    }

    // Build control flow graph
    let blocks: ControlFlowBlock[];
    let edges: ControlFlowEdge[];
    let calls: ControlFlowCall[];

    if (tree && tree.rootNode) {
      // AST-based analysis
      const result = await this.analyzeWithAST(
        tree,
        symbol,
        content,
        options.language || "cpp"
      );
      blocks = result.blocks;
      edges = result.edges;
      calls = result.calls;
    } else {
      // Pattern-based fallback
      const result = await this.analyzeWithPatterns(
        symbol,
        content,
        options.language || "cpp"
      );
      blocks = result.blocks;
      edges = result.edges;
      calls = result.calls;
    }

    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      this.logger.warn("Control flow analysis timeout", {
        symbol: symbol.name,
        duration: Date.now() - startTime,
      });
      return this.createMinimalResult(symbol);
    }

    // Calculate complexity metrics
    const metrics = this.complexityAnalyzer.analyze({
      nodes: blocks.map((b) => ({
        id: b.id,
        type: this.mapBlockTypeToNodeType(b.type),
        line: b.startLine,
        endLine: b.endLine,
        code: b.code || `Lines ${b.startLine}-${b.endLine}`,
        metrics: b.metrics,
        children: b.children,
      })),
      edges,
      blocks: blocks as any,
      symbol: symbol as any,
    });

    // Find dead code
    const deadCode = this.findDeadCode(blocks, edges);

    // Find hot paths
    const hotPaths = this.findHotPaths(blocks, edges);

    // Generate paths
    const paths = this.generateControlFlowPaths(blocks, edges);

    // Optional analyses
    let dataFlows: DataFlowAnalysis | undefined;
    let hotspots: HotspotAnalysis | undefined;

    if (options.includeDataFlow && this.dataFlowTracker) {
      dataFlows = this.dataFlowTracker.analyze(
        blocks.map((b) => this.blockToNode(b)),
        edges,
        { symbol, edges: calls } as any
      );
    }

    if (options.detectHotspots && this.hotspotDetector) {
      hotspots = this.hotspotDetector.analyze(
        blocks.map((b) => this.blockToNode(b)),
        edges,
        { symbol, edges: calls } as any
      );
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(blocks, calls, paths);

    return {
      blocks,
      edges,
      calls,
      paths,
      metrics,
      dataFlows,
      hotspots,
      deadCode,
      hotPaths,
      statistics,
    };
  }

  /**
   * Build control flow graph from dashboard data format
   */
  private buildControlFlowGraphFromData(data: any): {
    nodes: any[];
    edges: ControlFlowEdge[];
  } {
    const nodes: any[] = [];
    const edges: ControlFlowEdge[] = [];

    // Entry node
    nodes.push({
      id: "entry",
      type: "entry",
      line: data.entry_point || data.symbol.line,
      code: `${data.symbol.name}(${this.extractParameters(
        data.symbol.signature
      )})`,
    });

    // Process blocks
    if (data.blocks && data.blocks.length > 0) {
      data.blocks.forEach((block: any) => {
        const nodeId = `block_${block.id}`;
        nodes.push({
          id: nodeId,
          type: this.mapBlockTypeFromDashboard(block.block_type),
          line: block.start_line,
          endLine: block.end_line,
          code:
            block.condition || `Lines ${block.start_line}-${block.end_line}`,
        });

        // Add edges based on block relationships
        if (block.parent_block_id) {
          edges.push({
            from: `block_${block.parent_block_id}`,
            to: nodeId,
            type: "normal",
          });
        } else {
          edges.push({
            from: "entry",
            to: nodeId,
            type: "normal",
          });
        }
      });
    } else {
      // Simple function body
      nodes.push({
        id: "function_body",
        type: "statement",
        line: data.entry_point || data.symbol.line,
        code: `Function body (${data.symbol.name})`,
      });

      edges.push({
        from: "entry",
        to: "function_body",
        type: "normal",
      });
    }

    // Exit nodes
    if (data.exit_points) {
      data.exit_points.forEach((exitLine: number, index: number) => {
        const exitId = `exit_${index}`;
        nodes.push({
          id: exitId,
          type: "exit",
          line: exitLine,
          code: "return",
        });

        // Connect to exit
        if (!data.blocks || data.blocks.length === 0) {
          edges.push({
            from: "function_body",
            to: exitId,
            type: "normal",
          });
        }
      });
    }

    // Add conditional edges
    this.addConditionalEdgesFromData(nodes, edges);

    return { nodes, edges };
  }

  /**
   * Add conditional edges for visualization data
   */
  private addConditionalEdgesFromData(
    nodes: any[],
    edges: ControlFlowEdge[]
  ): void {
    // Build adjacency maps for efficient lookups
    const nodeMap = new Map<string, any>();
    const outgoingEdges = new Map<string, ControlFlowEdge[]>();
    const incomingEdges = new Map<string, ControlFlowEdge[]>();

    nodes.forEach((node) => nodeMap.set(node.id, node));
    edges.forEach((edge) => {
      if (!outgoingEdges.has(edge.from)) outgoingEdges.set(edge.from, []);
      if (!incomingEdges.has(edge.to)) incomingEdges.set(edge.to, []);
      outgoingEdges.get(edge.from)!.push(edge);
      incomingEdges.get(edge.to)!.push(edge);
    });

    // Process conditional blocks
    nodes.forEach((node) => {
      if (node.type === "condition") {
        // Find true and false branches
        const outgoing = outgoingEdges.get(node.id) || [];
        const normalEdge = outgoing.find((e) => e.type === "normal");
        if (normalEdge) {
          normalEdge.type = "true";
          normalEdge.label = "true";
        }

        // Add false branch if missing
        const falseTarget = this.findFalseBranchTarget(
          node,
          nodeMap,
          outgoingEdges
        );
        if (
          falseTarget &&
          !outgoing.some((e) => e.to === falseTarget && e.type === "false")
        ) {
          edges.push({
            from: node.id,
            to: falseTarget,
            type: "false",
            label: "false",
          });
        }
      } else if (node.type === "loop") {
        // Add loop-back edge
        const loopBackTarget = this.findLoopBackTarget(
          node,
          nodeMap,
          outgoingEdges,
          incomingEdges
        );
        if (loopBackTarget) {
          const outgoing = outgoingEdges.get(node.id) || [];
          if (
            !outgoing.some(
              (e) => e.to === loopBackTarget && e.type === "loop-back"
            )
          ) {
            edges.push({
              from: node.id,
              to: loopBackTarget,
              type: "loop-back",
              label: "continue",
            });
          }
        }
      }
    });
  }

  /**
   * Helper method to find false branch target
   */
  private findFalseBranchTarget(
    conditionNode: any,
    nodeMap: Map<string, any>,
    outgoingEdges: Map<string, ControlFlowEdge[]>
  ): string | null {
    // For a condition node, the false branch typically goes to:
    // 1. An else block if it exists
    // 2. The merge point after the if statement
    // 3. The next statement in sequence

    const outgoing = outgoingEdges.get(conditionNode.id) || [];

    // If we already have a true branch, look for the next logical node
    const trueBranch = outgoing.find(
      (e) => e.type === "true" || e.type === "normal"
    );
    if (trueBranch) {
      // Find nodes at the same nesting level that come after this condition
      const conditionLine = conditionNode.line;
      const candidateNodes = Array.from(nodeMap.values())
        .filter((n) => n.line > conditionLine && n.type !== "exit")
        .sort((a, b) => a.line - b.line);

      // Look for the first node that's not reachable from the true branch
      for (const candidate of candidateNodes) {
        if (!this.isReachableFrom(trueBranch.to, candidate.id, outgoingEdges)) {
          return candidate.id;
        }
      }
    }

    return null;
  }

  /**
   * Helper method to find loop-back target
   */
  private findLoopBackTarget(
    loopNode: any,
    nodeMap: Map<string, any>,
    outgoingEdges: Map<string, ControlFlowEdge[]>,
    _incomingEdges: Map<string, ControlFlowEdge[]>
  ): string | null {
    // For a loop node, we need to find where the loop body ends and loops back
    // This is typically the last node in the loop body that should connect back to the loop header

    const loopLine = loopNode.line;
    const loopEndLine = loopNode.endLine || loopLine;

    // Find all nodes within the loop body
    const loopBodyNodes = Array.from(nodeMap.values())
      .filter((n) => n.line > loopLine && n.line <= loopEndLine)
      .sort((a, b) => b.line - a.line); // Sort by line descending

    // Look for the last node in the loop body that doesn't already have an outgoing edge
    for (const bodyNode of loopBodyNodes) {
      const outgoing = outgoingEdges.get(bodyNode.id) || [];

      // If this node doesn't have any outgoing edges, or only has edges to exit nodes,
      // it's likely the end of the loop body
      if (
        outgoing.length === 0 ||
        outgoing.every((e) => {
          const target = nodeMap.get(e.to);
          return target && target.type === "exit";
        })
      ) {
        // Check if there's already a path from this node to the loop header
        if (!this.isReachableFrom(bodyNode.id, loopNode.id, outgoingEdges)) {
          return loopNode.id; // Loop back to the loop header
        }
      }
    }

    // If we can't find a specific end node, check if the loop itself needs a self-loop
    // (e.g., for single-line loops)
    const outgoing = outgoingEdges.get(loopNode.id) || [];
    if (outgoing.length === 0) {
      return loopNode.id;
    }

    return null;
  }

  /**
   * Check if targetId is reachable from sourceId through the graph
   */
  private isReachableFrom(
    sourceId: string,
    targetId: string,
    outgoingEdges: Map<string, ControlFlowEdge[]>
  ): boolean {
    if (sourceId === targetId) return true;

    const visited = new Set<string>();
    const queue = [sourceId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const outgoing = outgoingEdges.get(current) || [];
      for (const edge of outgoing) {
        if (edge.to === targetId) return true;
        if (!visited.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    return false;
  }

  /**
   * Map dashboard block types to unified node types
   */
  private mapBlockTypeFromDashboard(blockType: string): string {
    const mapping: Record<string, string> = {
      entry: "entry",
      exit: "exit",
      conditional: "condition",
      condition: "condition",
      loop: "loop",
      try: "exception",
      catch: "exception",
      return: "return",
      switch: "switch",
    };
    return mapping[blockType] || "statement";
  }

  /**
   * Map node types to block types
   */
  private mapNodeTypeToBlockType(nodeType: string): ControlFlowBlock["type"] {
    const mapping: Record<string, ControlFlowBlock["type"]> = {
      entry: "entry",
      exit: "exit",
      statement: "basic",
      condition: "conditional",
      loop: "loop",
      exception: "try",
      return: "return",
      switch: "switch",
    };
    return mapping[nodeType] || "basic";
  }

  /**
   * Extract parameters from function signature
   */
  private extractParameters(signature: string | null): string {
    if (!signature) return "";
    const match = signature.match(/\((.*?)\)/);
    return match ? match[1] : "";
  }

  /**
   * Build hierarchical structure for visualization (from dashboard engine)
   */
  buildHierarchy(blocks: ControlFlowBlock[], edges: ControlFlowEdge[]): any {
    const children: Record<
      string,
      Array<{ nodeId: string; edgeType: string }>
    > = {};
    edges.forEach((edge) => {
      if (!children[edge.from]) children[edge.from] = [];
      children[edge.from].push({ nodeId: edge.to, edgeType: edge.type });
    });

    const visited = new Set<string>();

    const buildTree = (blockId: string, edgeTypeFromParent?: string): any => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || visited.has(blockId)) {
        return block
          ? { ...this.blockToNode(block), edgeTypeFromParent, children: [] }
          : null;
      }

      visited.add(blockId);

      const nodeChildren = children[blockId] || [];

      return {
        ...this.blockToNode(block),
        edgeTypeFromParent: edgeTypeFromParent || "normal",
        children: nodeChildren
          .map((child) => buildTree(child.nodeId, child.edgeType))
          .filter(Boolean),
      };
    };

    const entryBlock = blocks.find((b) => b.type === "entry");
    if (!entryBlock) {
      this.logger.warn("No entry block found, using first block");
      return blocks.length > 0 ? buildTree(blocks[0].id) : null;
    }

    return buildTree(entryBlock.id);
  }

  /**
   * Get function calls from a specific line or block (from dashboard engine)
   */
  getFunctionCallsFromLine(
    line: number,
    analysis: ControlFlowAnalysis,
    block?: ControlFlowBlock
  ): string[] {
    if (block && block.id === "function_body") {
      return analysis.calls.map((call) => call.targetFunction).filter(Boolean);
    }

    let startLine = line;
    let endLine = line;

    if (block) {
      startLine = block.startLine;
      endLine = block.endLine;
    }

    return analysis.calls
      .filter(
        (call) => call.lineNumber >= startLine && call.lineNumber <= endLine
      )
      .map((call) => call.targetFunction)
      .filter(Boolean);
  }

  /**
   * Check if navigation is possible to a node (from dashboard engine)
   */
  canNavigateToNode(
    block: ControlFlowBlock,
    analysis: ControlFlowAnalysis
  ): boolean {
    if (block.type === "entry" || block.type === "exit") {
      return false;
    }

    const functionCalls = this.getFunctionCallsFromLine(
      block.startLine,
      analysis,
      block
    );
    return functionCalls.length > 0;
  }
}
