/**
 * Control Flow Analyzer
 * 
 * Analyzes function bodies to extract control flow information
 * including basic blocks, edges, loops, and conditions.
 */

import Parser from 'tree-sitter';
import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { 
  universalSymbols, 
  controlFlowBlocks,
  symbolCalls
} from '../database/drizzle/schema.js';

export interface ControlFlowBlock {
  id: number;
  type: 'entry' | 'exit' | 'basic' | 'conditional' | 'loop' | 'switch' | 'catch';
  startLine: number;
  endLine: number;
  code?: string;
  condition?: string;
}

export interface ControlFlowEdge {
  from: number;
  to: number;
  type: 'sequential' | 'branch-true' | 'branch-false' | 'loop-back' | 'break' | 'continue' | 'return' | 'throw';
  label?: string;
}

export interface LoopInfo {
  blockId: number;
  loopType: 'for' | 'while' | 'do-while' | 'range-for';
  condition: string;
  bodyStart: number;
  bodyEnd: number;
}

export interface ConditionalInfo {
  blockId: number;
  type: 'if' | 'switch' | 'ternary';
  condition: string;
  trueBranch: number;
  falseBranch?: number;
}

export interface ControlFlowGraph {
  blocks: ControlFlowBlock[];
  edges: ControlFlowEdge[];
  entryBlock: number;
  exitBlocks: number[];
  loops: LoopInfo[];
  conditionals: ConditionalInfo[];
  complexity: number;
}

export class ControlFlowAnalyzer {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private nextBlockId = 0;
  
  constructor(db: Database) {
    this.rawDb = db;
    this.db = drizzle(db);
  }

  /**
   * Analyze control flow for a symbol (function/method)
   */
  async analyzeSymbol(symbolId: number, tree: Parser.Tree | null, content: string): Promise<ControlFlowGraph> {
    const startTime = Date.now();
    const maxAnalysisTime = 5000; // 5 second timeout per symbol
    
    // Get symbol info
    const symbol = await this.db.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.id, symbolId))
      .limit(1)
      .then(rows => rows[0]);
    
    if (!symbol) {
      throw new Error(`Symbol ${symbolId} not found`);
    }
    
    // Initialize control flow graph
    const cfg: ControlFlowGraph = {
      blocks: [],
      edges: [],
      entryBlock: 0,
      exitBlocks: [],
      loops: [],
      conditionals: [],
      complexity: 1 // Start with 1 for the function itself
    };
    
    // Create entry block
    const entryBlock = this.createBlock('entry', symbol.line, symbol.line);
    cfg.blocks.push(entryBlock);
    cfg.entryBlock = entryBlock.id;
    
    if (tree && tree.rootNode) {
      // Find the function node in the AST
      const functionNode = this.findFunctionNode(tree.rootNode, symbol.line);
      
      if (functionNode) {
        // Analyze the function body
        const bodyNode = this.findFunctionBody(functionNode);
        if (bodyNode) {
          const lastBlockId = this.analyzeNode(bodyNode, entryBlock.id, cfg, content);
          
          // Create exit block if not already created
          if (!cfg.exitBlocks.length) {
            const exitBlock = this.createBlock('exit', symbol.endLine || symbol.line, symbol.endLine || symbol.line);
            cfg.blocks.push(exitBlock);
            cfg.exitBlocks.push(exitBlock.id);
            
            // Connect last block to exit
            if (lastBlockId !== null) {
              cfg.edges.push({
                from: lastBlockId,
                to: exitBlock.id,
                type: 'sequential'
              });
            }
          }
        }
      }
    } else {
      // Fallback: Pattern-based analysis
      await this.analyzeWithPatterns(symbol, content, cfg);
    }
    
    // Check for timeout
    const duration = Date.now() - startTime;
    if (duration > maxAnalysisTime) {
      console.warn(`Control flow analysis timeout for symbol ${symbol.name} (${duration}ms)`);
      // Return minimal CFG on timeout
      return {
        blocks: [
          { id: 0, type: 'entry', startLine: symbol.line, endLine: symbol.line },
          { id: 1, type: 'exit', startLine: symbol.endLine || symbol.line, endLine: symbol.endLine || symbol.line }
        ],
        edges: [{ from: 0, to: 1, type: 'sequential' }],
        entryBlock: 0,
        exitBlocks: [1],
        loops: [],
        conditionals: [],
        complexity: 1
      };
    }
    
    // Store control flow data in database
    await this.storeControlFlow(symbolId, cfg);
    
    return cfg;
  }

  /**
   * Analyze AST node and build control flow graph
   */
  private analyzeNode(
    node: Parser.SyntaxNode,
    previousBlockId: number,
    cfg: ControlFlowGraph,
    content: string
  ): number | null {
    let currentBlockId = previousBlockId;
    
    // Map language-specific node types to common control flow patterns
    const nodeType = this.normalizeNodeType(node.type);
    
    switch (nodeType) {
      case 'if_statement':
        currentBlockId = this.analyzeIfStatement(node, currentBlockId, cfg, content);
        break;
        
      case 'while_statement':
      case 'for_statement':
      case 'do_statement':
        currentBlockId = this.analyzeLoop(node, currentBlockId, cfg, content);
        break;
        
      case 'switch_statement':
        currentBlockId = this.analyzeSwitchStatement(node, currentBlockId, cfg, content);
        break;
        
      case 'return_statement':
        currentBlockId = this.analyzeReturnStatement(node, currentBlockId, cfg, content);
        break;
        
      case 'throw_statement':
        currentBlockId = this.analyzeThrowStatement(node, currentBlockId, cfg, content);
        break;
        
      case 'compound_statement':
        // Analyze each statement in the block
        for (const child of node.children) {
          if (child.type !== '{' && child.type !== '}') {
            const nextId = this.analyzeNode(child, currentBlockId, cfg, content);
            if (nextId !== null) {
              currentBlockId = nextId;
            }
          }
        }
        break;
        
      default:
        // For other statements, check if they contain control flow
        for (const child of node.children) {
          const nextId = this.analyzeNode(child, currentBlockId, cfg, content);
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
  private analyzeIfStatement(
    node: Parser.SyntaxNode,
    previousBlockId: number,
    cfg: ControlFlowGraph,
    content: string
  ): number {
    // Increase complexity for each decision point
    cfg.complexity++;
    
    // Find the branches to get the full conditional range
    const trueBranchNode = node.childForFieldName('consequence');
    const falseBranchNode = node.childForFieldName('alternative');
    let condEndRow = node.endPosition.row + 1;
    
    if (falseBranchNode) {
      condEndRow = falseBranchNode.endPosition.row + 1;
    } else if (trueBranchNode) {
      condEndRow = trueBranchNode.endPosition.row + 1;
    }
    
    // Create conditional block that spans the entire if statement
    const condBlock = this.createBlock('conditional', node.startPosition.row + 1, condEndRow);
    cfg.blocks.push(condBlock);
    
    // Connect previous to conditional
    cfg.edges.push({
      from: previousBlockId,
      to: condBlock.id,
      type: 'sequential'
    });
    
    // Extract condition
    const conditionNode = node.childForFieldName('condition');
    if (conditionNode) {
      condBlock.condition = content.substring(conditionNode.startIndex, conditionNode.endIndex);
    }
    
    // Create blocks for true and false branches (already have trueBranchNode and falseBranchNode from above)
    
    let mergeBlockId: number | null = null;
    
    if (trueBranchNode) {
      const trueBlock = this.createBlock('basic', trueBranchNode.startPosition.row + 1, trueBranchNode.endPosition.row + 1);
      cfg.blocks.push(trueBlock);
      
      // Connect conditional to true branch
      cfg.edges.push({
        from: condBlock.id,
        to: trueBlock.id,
        type: 'branch-true'
      });
      
      // Analyze true branch
      const trueEndId = this.analyzeNode(trueBranchNode, trueBlock.id, cfg, content);
      
      // Create merge block
      mergeBlockId = this.nextBlockId++;
      const mergeBlock = this.createBlock('basic', node.endPosition.row + 1, node.endPosition.row + 1);
      cfg.blocks.push(mergeBlock);
      
      if (trueEndId !== null) {
        cfg.edges.push({
          from: trueEndId,
          to: mergeBlockId,
          type: 'sequential'
        });
      }
      
      cfg.conditionals.push({
        blockId: condBlock.id,
        type: 'if',
        condition: condBlock.condition || '',
        trueBranch: trueBlock.id,
        falseBranch: falseBranchNode ? undefined : mergeBlockId
      });
    }
    
    if (falseBranchNode) {
      cfg.complexity++; // Additional path
      
      const falseBlock = this.createBlock('basic', falseBranchNode.startPosition.row + 1, falseBranchNode.endPosition.row + 1);
      cfg.blocks.push(falseBlock);
      
      // Connect conditional to false branch
      cfg.edges.push({
        from: condBlock.id,
        to: falseBlock.id,
        type: 'branch-false'
      });
      
      // Analyze false branch
      const falseEndId = this.analyzeNode(falseBranchNode, falseBlock.id, cfg, content);
      
      if (falseEndId !== null && mergeBlockId !== null) {
        cfg.edges.push({
          from: falseEndId,
          to: mergeBlockId,
          type: 'sequential'
        });
      }
      
      // Update conditional info
      const condInfo = cfg.conditionals[cfg.conditionals.length - 1];
      if (condInfo) {
        condInfo.falseBranch = falseBlock.id;
      }
    } else if (mergeBlockId !== null) {
      // No else branch - connect conditional directly to merge
      cfg.edges.push({
        from: condBlock.id,
        to: mergeBlockId,
        type: 'branch-false'
      });
    }
    
    return mergeBlockId || condBlock.id;
  }

  /**
   * Analyze loop statement
   */
  private analyzeLoop(
    node: Parser.SyntaxNode,
    previousBlockId: number,
    cfg: ControlFlowGraph,
    content: string
  ): number {
    // Increase complexity for each loop
    cfg.complexity++;
    
    const loopType = node.type === 'for_statement' ? 'for' :
                     node.type === 'while_statement' ? 'while' :
                     node.type === 'do_statement' ? 'do-while' : 'for';
    
    // Find the body node first to get the full range
    const bodyNode = node.childForFieldName('body');
    const loopEndRow = bodyNode ? bodyNode.endPosition.row + 1 : node.endPosition.row + 1;
    
    // Create loop header block that spans the entire loop including body
    const loopBlock = this.createBlock('loop', node.startPosition.row + 1, loopEndRow);
    cfg.blocks.push(loopBlock);
    
    // Connect previous to loop header
    cfg.edges.push({
      from: previousBlockId,
      to: loopBlock.id,
      type: 'sequential'
    });
    
    // Extract condition
    const conditionNode = node.childForFieldName('condition');
    if (conditionNode) {
      loopBlock.condition = content.substring(conditionNode.startIndex, conditionNode.endIndex);
    }
    
    // Create loop body block
    if (bodyNode) {
      const bodyBlock = this.createBlock('basic', bodyNode.startPosition.row + 1, bodyNode.endPosition.row + 1);
      cfg.blocks.push(bodyBlock);
      
      // Connect loop header to body
      cfg.edges.push({
        from: loopBlock.id,
        to: bodyBlock.id,
        type: 'branch-true'
      });
      
      // Analyze loop body
      const bodyEndId = this.analyzeNode(bodyNode, bodyBlock.id, cfg, content);
      
      // Connect body back to loop header
      if (bodyEndId !== null) {
        cfg.edges.push({
          from: bodyEndId,
          to: loopBlock.id,
          type: 'loop-back'
        });
      }
      
      cfg.loops.push({
        blockId: loopBlock.id,
        loopType: loopType,
        condition: loopBlock.condition || '',
        bodyStart: bodyBlock.startLine,
        bodyEnd: bodyBlock.endLine
      });
    }
    
    // Create exit block
    const exitBlock = this.createBlock('basic', node.endPosition.row + 1, node.endPosition.row + 1);
    cfg.blocks.push(exitBlock);
    
    // Connect loop header to exit (when condition is false)
    cfg.edges.push({
      from: loopBlock.id,
      to: exitBlock.id,
      type: 'branch-false'
    });
    
    return exitBlock.id;
  }

  /**
   * Pattern-based fallback analysis
   */
  private async analyzeWithPatterns(
    symbol: any,
    content: string,
    cfg: ControlFlowGraph
  ): Promise<void> {
    const lines = content.split('\n');
    const functionStart = symbol.line - 1;
    const functionEnd = symbol.endLine ? symbol.endLine - 1 : lines.length - 1;
    
    let currentBlockStart = functionStart;
    let lastBlockId = cfg.entryBlock;
    
    // Multi-language patterns
    const ifPattern = /\b(if|elif|else\s+if)\s*[\(\:]|^\s*if\s+/; // C++/JS/TS: if (, Python: if :
    const loopPattern = /\b(for|while)\s*[\(\:]|^\s*(for|while)\s+/; // Supports both styles
    const returnPattern = /\breturn\b/;
    const functionPattern = /\b(def|function|func|fn)\s+/; // Nested functions
    
    // Simple pattern matching for control flow
    for (let i = functionStart; i <= functionEnd; i++) {
      const line = lines[i];
      
      if (ifPattern.test(line)) {
        // Found if statement
        cfg.complexity++;
        
        // Create block for code before if
        if (i > currentBlockStart) {
          const block = this.createBlock('basic', currentBlockStart + 1, i);
          cfg.blocks.push(block);
          cfg.edges.push({ from: lastBlockId, to: block.id, type: 'sequential' });
          lastBlockId = block.id;
        }
        
        // Create conditional block
        const condBlock = this.createBlock('conditional', i + 1, i + 1);
        condBlock.condition = this.extractCondition(line);
        cfg.blocks.push(condBlock);
        cfg.edges.push({ from: lastBlockId, to: condBlock.id, type: 'sequential' });
        
        currentBlockStart = i + 1;
      } else if (loopPattern.test(line)) {
        // Found loop
        cfg.complexity++;
        
        // Detect loop type
        const loopType = line.includes('for') ? 'for' : 
                        line.includes('while') ? 'while' : 'for';
        
        // Create loop block with type
        const loopBlock = this.createBlock('loop', i + 1, i + 1);
        loopBlock.condition = this.extractCondition(line);
        cfg.blocks.push(loopBlock);
        cfg.edges.push({ from: lastBlockId, to: loopBlock.id, type: 'sequential' });
        
        // Add to loops collection with type
        cfg.loops.push({
          blockId: loopBlock.id,
          loopType: loopType,
          condition: loopBlock.condition || '',
          bodyStart: i + 1,
          bodyEnd: functionEnd // Simplified for pattern-based analysis
        });
        
        currentBlockStart = i + 1;
      }
    }
    
    // Create final block and exit
    if (currentBlockStart < functionEnd) {
      const block = this.createBlock('basic', currentBlockStart + 1, functionEnd);
      cfg.blocks.push(block);
      cfg.edges.push({ from: lastBlockId, to: block.id, type: 'sequential' });
      lastBlockId = block.id;
    }
    
    // Create exit block
    const exitBlock = this.createBlock('exit', functionEnd + 1, functionEnd + 1);
    cfg.blocks.push(exitBlock);
    cfg.exitBlocks.push(exitBlock.id);
    cfg.edges.push({ from: lastBlockId, to: exitBlock.id, type: 'sequential' });
  }

  /**
   * Store control flow data in database
   */
  private async storeControlFlow(symbolId: number, cfg: ControlFlowGraph): Promise<void> {
    // Delete existing control flow data for this symbol
    await this.db.delete(controlFlowBlocks)
      .where(eq(controlFlowBlocks.symbolId, symbolId));
    
    // Store blocks
    for (const block of cfg.blocks) {
      await this.db.insert(controlFlowBlocks).values({
        symbolId,
        blockType: block.type,
        startLine: block.startLine,
        endLine: block.endLine,
        condition: block.condition,
        complexity: 1 // Basic complexity for now
      });
    }
    
    // TODO: Store edges in a separate table if needed
    // For now, edges are returned in memory only
  }

  /**
   * Helper methods
   */
  private createBlock(
    type: ControlFlowBlock['type'],
    startLine: number,
    endLine: number
  ): ControlFlowBlock {
    return {
      id: this.nextBlockId++,
      type,
      startLine,
      endLine
    };
  }

  private findFunctionNode(root: Parser.SyntaxNode, targetLine: number): Parser.SyntaxNode | null {
    // Simple traversal to find function at target line
    const queue: Parser.SyntaxNode[] = [root];
    
    while (queue.length > 0) {
      const node = queue.shift()!;
      
      if ((node.type === 'function_definition' || node.type === 'method_definition') &&
          node.startPosition.row + 1 === targetLine) {
        return node;
      }
      
      queue.push(...node.children);
    }
    
    return null;
  }

  private findFunctionBody(functionNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
    return functionNode.childForFieldName('body') || 
           functionNode.children.find(child => child.type === 'compound_statement') ||
           null;
  }

  private extractCondition(line: string): string {
    // Try parentheses first (C++/JS/TS)
    let match = line.match(/\((.*?)\)/);
    if (match) return match[1].trim();
    
    // Try Python style (if condition:)
    match = line.match(/(?:if|while|for)\s+(.+?):/);
    if (match) return match[1].trim();
    
    return '';
  }

  /**
   * Normalize language-specific node types to common types
   */
  private normalizeNodeType(nodeType: string): string {
    // Python mappings
    if (nodeType === 'if_statement' || nodeType === 'elif_clause' || nodeType === 'else_clause') {
      return 'if_statement';
    }
    if (nodeType === 'for_in_clause' || nodeType === 'for_statement') {
      return 'for_statement';
    }
    if (nodeType === 'while_statement' || nodeType === 'while_clause') {
      return 'while_statement';
    }
    if (nodeType === 'return_statement' || nodeType === 'yield_statement') {
      return 'return_statement';
    }
    if (nodeType === 'raise_statement') {
      return 'throw_statement';
    }
    if (nodeType === 'try_statement') {
      return 'try_statement';
    }
    if (nodeType === 'match_statement') { // Python's match
      return 'switch_statement';
    }
    
    // TypeScript/JavaScript mappings
    if (nodeType === 'if_else_statement') {
      return 'if_statement';
    }
    if (nodeType === 'for_in_statement' || nodeType === 'for_of_statement') {
      return 'for_statement';
    }
    if (nodeType === 'throw_expression') {
      return 'throw_statement';
    }
    if (nodeType === 'switch_case') {
      return 'switch_statement';
    }
    if (nodeType === 'block' || nodeType === 'statement_block') {
      return 'compound_statement';
    }
    
    // Default: return as-is
    return nodeType;
  }

  private analyzeReturnStatement(
    node: Parser.SyntaxNode,
    previousBlockId: number,
    cfg: ControlFlowGraph,
    content: string
  ): number {
    // Create exit block if not exists
    let exitBlockId = cfg.exitBlocks[0];
    if (!exitBlockId) {
      const exitBlock = this.createBlock('exit', node.endPosition.row + 1, node.endPosition.row + 1);
      cfg.blocks.push(exitBlock);
      cfg.exitBlocks.push(exitBlock.id);
      exitBlockId = exitBlock.id;
    }
    
    // Connect to exit
    cfg.edges.push({
      from: previousBlockId,
      to: exitBlockId,
      type: 'return'
    });
    
    return exitBlockId;
  }

  private analyzeThrowStatement(
    node: Parser.SyntaxNode,
    previousBlockId: number,
    cfg: ControlFlowGraph,
    content: string
  ): number {
    // Similar to return, but with throw edge type
    let exitBlockId = cfg.exitBlocks[0];
    if (!exitBlockId) {
      const exitBlock = this.createBlock('exit', node.endPosition.row + 1, node.endPosition.row + 1);
      cfg.blocks.push(exitBlock);
      cfg.exitBlocks.push(exitBlock.id);
      exitBlockId = exitBlock.id;
    }
    
    cfg.edges.push({
      from: previousBlockId,
      to: exitBlockId,
      type: 'throw'
    });
    
    return exitBlockId;
  }

  private analyzeSwitchStatement(
    node: Parser.SyntaxNode,
    previousBlockId: number,
    cfg: ControlFlowGraph,
    content: string
  ): number {
    // Increase complexity for each case
    cfg.complexity += node.children.filter(child => child.type === 'case_statement').length;
    
    // Find the body to get the full switch range
    const bodyNode = node.childForFieldName('body');
    const switchEndRow = bodyNode ? bodyNode.endPosition.row + 1 : node.endPosition.row + 1;
    
    // Create switch block that spans the entire switch statement
    const switchBlock = this.createBlock('switch', node.startPosition.row + 1, switchEndRow);
    cfg.blocks.push(switchBlock);
    
    cfg.edges.push({
      from: previousBlockId,
      to: switchBlock.id,
      type: 'sequential'
    });
    
    // TODO: Implement full switch analysis
    // For now, return the switch block
    return switchBlock.id;
  }
}