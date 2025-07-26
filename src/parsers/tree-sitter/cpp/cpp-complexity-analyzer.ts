/**
 * C++ Complexity Analyzer
 * 
 * Analyzes various complexity metrics for C++ code including cyclomatic complexity,
 * cognitive complexity, halstead metrics, and C++-specific complexity factors.
 */

import Parser from "tree-sitter";
import { Logger, createLogger } from "../../../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../../../utils/memory-monitor.js";
import { SymbolInfo } from "../parser-types.js";
import { CppAstUtils } from "./cpp-ast-utils.js";
import { CppVisitorContext } from "./cpp-types.js";
import { ControlFlowAnalysisResult } from "./cpp-control-flow-analyzer.js";

export interface ComplexityMetrics {
  // Basic metrics
  linesOfCode: number;
  logicalLinesOfCode: number;
  commentLines: number;
  blankLines: number;

  // Cyclomatic complexity
  cyclomaticComplexity: number;
  
  // Cognitive complexity (subjective complexity)
  cognitiveComplexity: number;
  
  // Halstead metrics
  halstead: {
    operators: number;
    operands: number;
    distinctOperators: number;
    distinctOperands: number;
    vocabulary: number;
    length: number;
    volume: number;
    difficulty: number;
    effort: number;
    timeToImplement: number; // in minutes
    bugs: number; // estimated bugs
  };
  
  // Nesting complexity
  maxNestingDepth: number;
  averageNestingDepth: number;
  
  // C++ specific metrics
  cppSpecific: {
    templateComplexity: number;
    inheritanceComplexity: number;
    polymorphismComplexity: number;
    exceptionComplexity: number;
    stlComplexity: number;
    modernCppComplexity: number; // C++11+ features
    memoryManagementComplexity: number;
  };
  
  // Maintainability metrics
  maintainabilityIndex: number;
  
  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high' | 'very_high';
  riskFactors: string[];
  
  // Performance hints
  performanceHints: {
    hasExpensiveOperations: boolean;
    hasRecursion: boolean;
    hasDeepNesting: boolean;
    hasComplexTemplates: boolean;
    hasVirtualCalls: boolean;
  };
}

export interface FileComplexityMetrics {
  filePath: string;
  overallMetrics: ComplexityMetrics;
  functionMetrics: Map<string, ComplexityMetrics>;
  classMetrics: Map<string, ComplexityMetrics>;
  
  // File-level statistics
  totalFunctions: number;
  totalClasses: number;
  averageFunctionComplexity: number;
  averageClassComplexity: number;
  mostComplexFunction: string | null;
  mostComplexClass: string | null;
}

export class CppComplexityAnalyzer {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private astUtils: CppAstUtils;

  // C++ operators for Halstead metrics
  private readonly cppOperators = new Set([
    '+', '-', '*', '/', '%', '++', '--', '=', '+=', '-=', '*=', '/=', '%=',
    '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~',
    '<<', '>>', '<<=', '>>=', '&=', '|=', '^=', '->', '.', '::', '?', ':',
    'new', 'delete', 'sizeof', 'typeid', 'static_cast', 'dynamic_cast',
    'const_cast', 'reinterpret_cast', 'throw', 'try', 'catch', 'if', 'else',
    'while', 'for', 'do', 'switch', 'case', 'default', 'break', 'continue',
    'return', 'goto', 'co_await', 'co_yield', 'co_return'
  ]);

  // C++ keywords that add complexity
  private readonly complexityKeywords = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', 'throw',
    'break', 'continue', 'return', 'goto', '&&', '||', '?'
  ]);

  constructor() {
    this.logger = createLogger('CppComplexityAnalyzer');
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.astUtils = new CppAstUtils();
  }

  /**
   * Analyze complexity for a single function
   */
  async analyzeFunctionComplexity(
    symbol: SymbolInfo,
    functionNode: Parser.SyntaxNode | null,
    content: string,
    controlFlowResult?: ControlFlowAnalysisResult
  ): Promise<ComplexityMetrics> {
    const checkpoint = this.memoryMonitor.createCheckpoint('analyzeFunctionComplexity');
    
    try {
      this.logger.debug('Analyzing function complexity', { function: symbol.qualifiedName });

      // Extract function source code
      let functionSource: string;
      if (functionNode) {
        functionSource = this.astUtils.getNodeText(functionNode, content);
      } else {
        // Extract using line-based approach
        functionSource = this.extractFunctionSourceByLines(symbol, content);
      }

      // Basic line metrics
      const lineMetrics = this.calculateLineMetrics(functionSource);
      
      // Use consolidated complexity analysis instead of duplicate methods
      const consolidatedMetrics = this.calculateComplexityMetricsUsingConsolidatedAnalyzer(functionSource, symbol);
      
      // Use control flow result if available, otherwise use consolidated analyzer
      const cyclomaticComplexity = controlFlowResult?.statistics.cyclomaticComplexity || 
        consolidatedMetrics.cyclomaticComplexity;
      
      const cognitiveComplexity = consolidatedMetrics.cognitiveComplexity;
      const halstead = consolidatedMetrics.halstead;
      const nestingMetrics = {
        maxNestingDepth: consolidatedMetrics.maxNestingDepth,
        averageNestingDepth: consolidatedMetrics.averageNestingDepth
      };
      
      // C++ specific complexity
      const cppSpecific = this.calculateCppSpecificComplexity(functionSource, symbol, functionNode);
      
      // Maintainability index
      const maintainabilityIndex = this.calculateMaintainabilityIndex(
        lineMetrics.logicalLinesOfCode,
        cyclomaticComplexity,
        halstead.volume,
        lineMetrics.commentLines
      );
      
      // Risk assessment
      const { riskLevel, riskFactors } = this.assessRisk({
        ...lineMetrics,
        cyclomaticComplexity,
        cognitiveComplexity,
        ...nestingMetrics,
        cppSpecific
      } as any);
      
      // Performance hints
      const performanceHints = this.analyzePerformanceHints(functionSource, cppSpecific);

      const metrics: ComplexityMetrics = {
        ...lineMetrics,
        cyclomaticComplexity,
        cognitiveComplexity,
        halstead,
        ...nestingMetrics,
        cppSpecific,
        maintainabilityIndex,
        riskLevel,
        riskFactors,
        performanceHints
      };

      this.logger.debug('Function complexity analysis completed', {
        function: symbol.qualifiedName,
        cyclomatic: cyclomaticComplexity,
        cognitive: cognitiveComplexity,
        risk: riskLevel
      });

      return metrics;

    } catch (error) {
      this.logger.error('Function complexity analysis failed', error, {
        function: symbol.qualifiedName
      });
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Analyze complexity for an entire file
   */
  async analyzeFileComplexity(
    filePath: string,
    content: string,
    symbols: SymbolInfo[],
    controlFlowResults?: Map<string, ControlFlowAnalysisResult>
  ): Promise<FileComplexityMetrics> {
    const checkpoint = this.memoryMonitor.createCheckpoint('analyzeFileComplexity');
    
    try {
      this.logger.info('Analyzing file complexity', { file: filePath });

      const functionMetrics = new Map<string, ComplexityMetrics>();
      const classMetrics = new Map<string, ComplexityMetrics>();

      // Analyze functions
      const functions = symbols.filter(s => 
        s.kind === 'function' || s.kind === 'method' || 
        s.kind === 'constructor' || s.kind === 'destructor'
      );

      for (const func of functions) {
        const controlFlow = controlFlowResults?.get(func.qualifiedName);
        const complexity = await this.analyzeFunctionComplexity(func, null, content, controlFlow);
        functionMetrics.set(func.qualifiedName, complexity);
      }

      // Analyze classes
      const classes = symbols.filter(s => s.kind === 'class' || s.kind === 'struct');
      for (const cls of classes) {
        const complexity = await this.analyzeClassComplexity(cls, symbols, content);
        classMetrics.set(cls.qualifiedName, complexity);
      }

      // Calculate file-level metrics
      const overallMetrics = this.calculateFileOverallMetrics(content, functionMetrics, classMetrics);
      
      // Statistics
      const functionComplexities = Array.from(functionMetrics.values()).map(m => m.cyclomaticComplexity);
      const classComplexities = Array.from(classMetrics.values()).map(m => m.cyclomaticComplexity);
      
      const averageFunctionComplexity = functionComplexities.length > 0 ? 
        functionComplexities.reduce((sum, c) => sum + c, 0) / functionComplexities.length : 0;
      
      const averageClassComplexity = classComplexities.length > 0 ? 
        classComplexities.reduce((sum, c) => sum + c, 0) / classComplexities.length : 0;

      const mostComplexFunction = this.findMostComplex(functionMetrics);
      const mostComplexClass = this.findMostComplex(classMetrics);

      const fileMetrics: FileComplexityMetrics = {
        filePath,
        overallMetrics,
        functionMetrics,
        classMetrics,
        totalFunctions: functions.length,
        totalClasses: classes.length,
        averageFunctionComplexity,
        averageClassComplexity,
        mostComplexFunction,
        mostComplexClass
      };

      this.logger.info('File complexity analysis completed', {
        file: filePath,
        functions: functions.length,
        classes: classes.length,
        avgFunctionComplexity: averageFunctionComplexity.toFixed(2),
        overallRisk: overallMetrics.riskLevel
      });

      return fileMetrics;

    } catch (error) {
      this.logger.error('File complexity analysis failed', error, { file: filePath });
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  // Complexity calculation methods

  private calculateLineMetrics(source: string): Pick<ComplexityMetrics, 'linesOfCode' | 'logicalLinesOfCode' | 'commentLines' | 'blankLines'> {
    const lines = source.split('\n');
    let logicalLines = 0;
    let commentLines = 0;
    let blankLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '') {
        blankLines++;
      } else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.endsWith('*/')) {
        commentLines++;
      } else {
        logicalLines++;
      }
    }

    return {
      linesOfCode: lines.length,
      logicalLinesOfCode: logicalLines,
      commentLines,
      blankLines
    };
  }

  // REMOVED: Duplicate complexity calculation methods
  // Now using consolidated CodeMetricsAnalyzer from ../../../analysis/code-metrics-analyzer.js
  
  private calculateComplexityMetricsUsingConsolidatedAnalyzer(source: string, symbol: SymbolInfo): {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    maxNestingDepth: number;
    averageNestingDepth: number;
    halstead: ComplexityMetrics['halstead'];
  } {
    // Use the consolidated analyzer instead of duplicate methods
    const { CodeMetricsAnalyzer } = require('../../../analysis/code-metrics-analyzer.js');
    const analyzer = new CodeMetricsAnalyzer();
    
    const input = {
      source,
      symbol: {
        name: symbol.name,
        kind: symbol.kind,
        signature: symbol.signature,
        returnType: symbol.returnType
      },
      language: 'cpp',
      maxLines: 200
    };
    
    const metrics = analyzer.analyzeComplexity(input);
    
    return {
      cyclomaticComplexity: metrics.cyclomaticComplexity,
      cognitiveComplexity: metrics.cognitiveComplexity,
      maxNestingDepth: metrics.nestingDepth,
      averageNestingDepth: metrics.nestingDepth, // Core analyzer doesn't separate these
      halstead: metrics.halstead
    };
  }

  private calculateCppSpecificComplexity(
    source: string, 
    symbol: SymbolInfo, 
    node?: Parser.SyntaxNode | null
  ): ComplexityMetrics['cppSpecific'] {
    
    let templateComplexity = 0;
    let inheritanceComplexity = 0;
    let polymorphismComplexity = 0;
    let exceptionComplexity = 0;
    let stlComplexity = 0;
    let modernCppComplexity = 0;
    let memoryManagementComplexity = 0;

    // Template complexity
    const templateMatches = source.match(/template\s*</g);
    if (templateMatches) {
      templateComplexity = templateMatches.length * 2;
    }

    // Inheritance complexity
    const inheritanceMatches = source.match(/:\s*(public|private|protected)/g);
    if (inheritanceMatches) {
      inheritanceComplexity = inheritanceMatches.length;
    }

    // Polymorphism complexity
    const virtualMatches = source.match(/\bvirtual\b/g);
    const overrideMatches = source.match(/\boverride\b/g);
    if (virtualMatches) polymorphismComplexity += virtualMatches.length;
    if (overrideMatches) polymorphismComplexity += overrideMatches.length;

    // Exception complexity
    const tryMatches = source.match(/\btry\b/g);
    const catchMatches = source.match(/\bcatch\b/g);
    const throwMatches = source.match(/\bthrow\b/g);
    if (tryMatches) exceptionComplexity += tryMatches.length;
    if (catchMatches) exceptionComplexity += catchMatches.length * 2;
    if (throwMatches) exceptionComplexity += throwMatches.length;

    // STL complexity
    const stlPatterns = [
      /std::/g, /\bvector\b/g, /\bmap\b/g, /\bset\b/g, /\blist\b/g,
      /\balgorithm\b/g, /\biterator\b/g, /\bunique_ptr\b/g, /\bshared_ptr\b/g
    ];
    for (const pattern of stlPatterns) {
      const matches = source.match(pattern);
      if (matches) stlComplexity += matches.length;
    }

    // Modern C++ complexity (C++11+)
    const modernPatterns = [
      /\bauto\b/g, /\bdecltype\b/g, /\blambda\b/g, /\[\]/g,
      /\bconstexpr\b/g, /\bnoexcept\b/g, /\boverride\b/g, /\bfinal\b/g,
      /\bmove\b/g, /\bforward\b/g, /\bco_await\b/g, /\bco_yield\b/g
    ];
    for (const pattern of modernPatterns) {
      const matches = source.match(pattern);
      if (matches) modernCppComplexity += matches.length;
    }

    // Memory management complexity
    const memoryPatterns = [
      /\bnew\b/g, /\bdelete\b/g, /\bmalloc\b/g, /\bfree\b/g,
      /\bmake_unique\b/g, /\bmake_shared\b/g, /\bunique_ptr\b/g, /\bshared_ptr\b/g
    ];
    for (const pattern of memoryPatterns) {
      const matches = source.match(pattern);
      if (matches) memoryManagementComplexity += matches.length;
    }

    return {
      templateComplexity,
      inheritanceComplexity,
      polymorphismComplexity,
      exceptionComplexity,
      stlComplexity,
      modernCppComplexity,
      memoryManagementComplexity
    };
  }

  private calculateMaintainabilityIndex(
    linesOfCode: number,
    cyclomaticComplexity: number,
    halsteadVolume: number,
    commentLines: number
  ): number {
    // Microsoft's maintainability index formula (adapted)
    const commentRatio = linesOfCode > 0 ? commentLines / linesOfCode : 0;
    const index = 171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(linesOfCode) + 50 * Math.sin(Math.sqrt(2.4 * commentRatio));
    
    return Math.max(0, Math.min(100, index));
  }

  private assessRisk(metrics: any): { riskLevel: ComplexityMetrics['riskLevel']; riskFactors: string[] } {
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Cyclomatic complexity risk
    if (metrics.cyclomaticComplexity > 20) {
      riskFactors.push('Very high cyclomatic complexity');
      riskScore += 3;
    } else if (metrics.cyclomaticComplexity > 10) {
      riskFactors.push('High cyclomatic complexity');
      riskScore += 2;
    } else if (metrics.cyclomaticComplexity > 5) {
      riskFactors.push('Moderate cyclomatic complexity');
      riskScore += 1;
    }

    // Cognitive complexity risk
    if (metrics.cognitiveComplexity > 25) {
      riskFactors.push('Very high cognitive complexity');
      riskScore += 3;
    } else if (metrics.cognitiveComplexity > 15) {
      riskFactors.push('High cognitive complexity');
      riskScore += 2;
    }

    // Nesting depth risk
    if (metrics.maxNestingDepth > 6) {
      riskFactors.push('Excessive nesting depth');
      riskScore += 2;
    } else if (metrics.maxNestingDepth > 4) {
      riskFactors.push('High nesting depth');
      riskScore += 1;
    }

    // Lines of code risk
    if (metrics.linesOfCode > 200) {
      riskFactors.push('Very long function');
      riskScore += 2;
    } else if (metrics.linesOfCode > 100) {
      riskFactors.push('Long function');
      riskScore += 1;
    }

    // C++ specific risks
    if (metrics.cppSpecific.templateComplexity > 10) {
      riskFactors.push('High template complexity');
      riskScore += 2;
    }
    if (metrics.cppSpecific.exceptionComplexity > 5) {
      riskFactors.push('Complex exception handling');
      riskScore += 1;
    }

    // Determine risk level
    let riskLevel: ComplexityMetrics['riskLevel'];
    if (riskScore >= 8) {
      riskLevel = 'very_high';
    } else if (riskScore >= 5) {
      riskLevel = 'high';
    } else if (riskScore >= 2) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return { riskLevel, riskFactors };
  }

  private analyzePerformanceHints(source: string, cppSpecific: ComplexityMetrics['cppSpecific']): ComplexityMetrics['performanceHints'] {
    return {
      hasExpensiveOperations: /\b(sort|find|search|regex|complex|sqrt|pow|log)\b/i.test(source),
      hasRecursion: /\brecursive\b/i.test(source) || this.detectRecursion(source),
      hasDeepNesting: source.split('\n').some(line => (line.match(/{/g) || []).length > 4),
      hasComplexTemplates: cppSpecific.templateComplexity > 5,
      hasVirtualCalls: /\bvirtual\b/.test(source) || /->/.test(source)
    };
  }

  private detectRecursion(source: string): boolean {
    // Simple recursion detection by looking for self-calls
    const functionNameMatch = source.match(/^\s*\w+\s+(\w+)\s*\(/m);
    if (functionNameMatch) {
      const functionName = functionNameMatch[1];
      const callPattern = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
      const calls = source.match(callPattern);
      return (calls?.length || 0) > 1; // More than one occurrence (definition + call)
    }
    return false;
  }

  // Helper methods

  private extractFunctionSourceByLines(symbol: SymbolInfo, content: string): string {
    const lines = content.split('\n');
    const startLine = symbol.line - 1;
    const endLine = symbol.endLine ? symbol.endLine - 1 : startLine + 50; // Default to 50 lines if no end
    
    return lines.slice(startLine, Math.min(endLine + 1, lines.length)).join('\n');
  }

  private async analyzeClassComplexity(
    symbol: SymbolInfo,
    allSymbols: SymbolInfo[],
    content: string
  ): Promise<ComplexityMetrics> {
    
    // For classes, aggregate complexity of all member functions
    const memberFunctions = allSymbols.filter(s => 
      s.parentScope === symbol.qualifiedName && 
      (s.kind === 'method' || s.kind === 'constructor' || s.kind === 'destructor')
    );

    let totalComplexity = 1; // Base complexity for class
    let totalLines = 0;
    let totalCognitive = 0;

    for (const member of memberFunctions) {
      const memberSource = this.extractFunctionSourceByLines(member, content);
      const memberMetrics = this.calculateLineMetrics(memberSource);
      const complexityMetrics = this.calculateComplexityMetricsUsingConsolidatedAnalyzer(memberSource, member);
      
      totalComplexity += complexityMetrics.cyclomaticComplexity;
      totalLines += memberMetrics.linesOfCode;
      totalCognitive += complexityMetrics.cognitiveComplexity;
    }

    // Create aggregated metrics for the class
    const lineMetrics = { linesOfCode: totalLines, logicalLinesOfCode: totalLines, commentLines: 0, blankLines: 0 };
    const halstead = { operators: 0, operands: 0, distinctOperators: 0, distinctOperands: 0, vocabulary: 0, length: 0, volume: 0, difficulty: 0, effort: 0, timeToImplement: 0, bugs: 0 };
    const nestingMetrics = { maxNestingDepth: 0, averageNestingDepth: 0 };
    const cppSpecific = { templateComplexity: 0, inheritanceComplexity: 0, polymorphismComplexity: 0, exceptionComplexity: 0, stlComplexity: 0, modernCppComplexity: 0, memoryManagementComplexity: 0 };
    
    return {
      ...lineMetrics,
      cyclomaticComplexity: totalComplexity,
      cognitiveComplexity: totalCognitive,
      halstead,
      ...nestingMetrics,
      cppSpecific,
      maintainabilityIndex: 50, // Default for classes
      riskLevel: totalComplexity > 20 ? 'high' : totalComplexity > 10 ? 'medium' : 'low',
      riskFactors: [],
      performanceHints: {
        hasExpensiveOperations: false,
        hasRecursion: false,
        hasDeepNesting: false,
        hasComplexTemplates: false,
        hasVirtualCalls: false
      }
    };
  }

  private calculateFileOverallMetrics(
    content: string,
    functionMetrics: Map<string, ComplexityMetrics>,
    classMetrics: Map<string, ComplexityMetrics>
  ): ComplexityMetrics {
    
    const fileLineMetrics = this.calculateLineMetrics(content);
    const allMetrics = [...functionMetrics.values(), ...classMetrics.values()];
    
    const totalCyclomatic = allMetrics.reduce((sum, m) => sum + m.cyclomaticComplexity, 0);
    const totalCognitive = allMetrics.reduce((sum, m) => sum + m.cognitiveComplexity, 0);
    const avgCyclomatic = allMetrics.length > 0 ? totalCyclomatic / allMetrics.length : 0;
    const avgCognitive = allMetrics.length > 0 ? totalCognitive / allMetrics.length : 0;

    // Aggregate other metrics
    const maxNesting = Math.max(...allMetrics.map(m => m.maxNestingDepth), 0);
    const avgNesting = allMetrics.length > 0 ? 
      allMetrics.reduce((sum, m) => sum + m.averageNestingDepth, 0) / allMetrics.length : 0;

    return {
      ...fileLineMetrics,
      cyclomaticComplexity: avgCyclomatic,
      cognitiveComplexity: avgCognitive,
      halstead: {
        operators: 0, operands: 0, distinctOperators: 0, distinctOperands: 0,
        vocabulary: 0, length: 0, volume: 0, difficulty: 0, effort: 0,
        timeToImplement: 0, bugs: 0
      },
      maxNestingDepth: maxNesting,
      averageNestingDepth: avgNesting,
      cppSpecific: {
        templateComplexity: 0, inheritanceComplexity: 0, polymorphismComplexity: 0,
        exceptionComplexity: 0, stlComplexity: 0, modernCppComplexity: 0,
        memoryManagementComplexity: 0
      },
      maintainabilityIndex: 50,
      riskLevel: avgCyclomatic > 10 ? 'high' : avgCyclomatic > 5 ? 'medium' : 'low',
      riskFactors: [],
      performanceHints: {
        hasExpensiveOperations: false, hasRecursion: false, hasDeepNesting: false,
        hasComplexTemplates: false, hasVirtualCalls: false
      }
    };
  }

  private findMostComplex(metrics: Map<string, ComplexityMetrics>): string | null {
    let maxComplexity = 0;
    let mostComplex: string | null = null;

    for (const [name, metric] of metrics) {
      if (metric.cyclomaticComplexity > maxComplexity) {
        maxComplexity = metric.cyclomaticComplexity;
        mostComplex = name;
      }
    }

    return mostComplex;
  }
}