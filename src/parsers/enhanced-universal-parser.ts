/**
 * Enhanced Universal Parser Framework
 *
 * Provides a truly language-agnostic parsing system that eliminates
 * hard-coded language assumptions and enables seamless multi-language support.
 */

import { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  UniversalSymbol,
  UniversalRelationship,
  UniversalSymbolKind,
  UniversalRelationshipType,
  DetectedPattern,
  ParseResult,
  ILanguageParser,
  BaseLanguageParser,
} from "./language-parser-interface.js";

/**
 * Language-agnostic symbol context for scope tracking
 */
export interface UniversalScopeContext {
  // Scope hierarchy - works for namespaces, packages, modules
  scopeStack: ScopeFrame[];
  currentScope?: ScopeFrame;

  // Symbol resolution cache
  symbolCache: Map<string, UniversalSymbol>;

  // Language-specific context
  languageContext: Record<string, any>;

  // Parsing state
  currentLine: number;
  braceDepth: number;
  indentLevel: number;
}

export interface ScopeFrame {
  type: "namespace" | "module" | "package" | "class" | "function" | "block";
  name: string;
  qualifiedName: string;
  line: number;
  language: string;

  // Language-specific scope data
  languageData?: Record<string, any>;
}

/**
 * Universal control flow representation
 */
export interface UniversalControlFlow {
  symbolId: string;
  language: string;
  blocks: ControlFlowBlock[];
  edges: ControlFlowEdge[];
  complexity: number;
  patterns: string[]; // e.g., ['recursive', 'early_return', 'error_handling']
}

export interface ControlFlowBlock {
  id: string;
  type:
    | "entry"
    | "exit"
    | "basic"
    | "conditional"
    | "loop"
    | "exception"
    | "async";
  startLine: number;
  endLine: number;
  condition?: string;
  language: string;

  // Language-specific block data
  languageData?: Record<string, any>;
}

export interface ControlFlowEdge {
  from: string;
  to: string;
  type: "sequential" | "branch" | "loop" | "exception" | "async" | "return";
  label?: string;
  condition?: string;
}

/**
 * Language-agnostic symbol enhancement pipeline
 */
export class UniversalSymbolEnhancer {
  private db: ReturnType<typeof drizzle>;
  private languageParsers: Map<string, ILanguageParser> = new Map();

  constructor(db: Database) {
    this.db = drizzle(db);
  }

  /**
   * Register a language parser
   */
  registerParser(parser: ILanguageParser): void {
    this.languageParsers.set(parser.language, parser);
  }

  /**
   * Get appropriate parser for file
   */
  getParserForFile(filePath: string): ILanguageParser | null {
    for (const parser of this.languageParsers.values()) {
      if (parser.canParse(filePath)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Enhanced symbol extraction with universal scope tracking
   */
  async extractSymbolsUniversal(
    filePath: string,
    content: string,
    language: string
  ): Promise<UniversalSymbol[]> {
    const parser = this.languageParsers.get(language);
    if (!parser) {
      throw new Error(`No parser registered for language: ${language}`);
    }

    // Create universal scope context
    const context = this.createUniversalContext(filePath, content, language);

    // Parse with language-specific parser
    const symbols = await parser.parseSymbols(filePath, content);

    // Enhance symbols with universal features
    return await this.enhanceSymbolsUniversal(symbols, context);
  }

  /**
   * Universal scope management - works across all languages
   */
  private createUniversalContext(
    filePath: string,
    content: string,
    language: string
  ): UniversalScopeContext {
    return {
      scopeStack: [],
      symbolCache: new Map(),
      languageContext: {
        language,
        filePath,
        content,
        lines: content.split("\n"),
      },
      currentLine: 0,
      braceDepth: 0,
      indentLevel: 0,
    };
  }

  /**
   * Universal qualified name builder - language aware
   */
  buildUniversalQualifiedName(
    name: string,
    context: UniversalScopeContext
  ): string {
    if (context.scopeStack.length === 0) {
      return name;
    }

    const language = context.languageContext.language;
    const separator = this.getNamespaceSeparator(language);
    const scopePath = context.scopeStack.map((s) => s.name).join(separator);

    return scopePath ? `${scopePath}${separator}${name}` : name;
  }

  /**
   * Language-specific namespace separators
   */
  private getNamespaceSeparator(language: string): string {
    const separators: Record<string, string> = {
      cpp: "::",
      python: ".",
      typescript: ".",
      javascript: ".",
      rust: "::",
      go: ".",
      java: ".",
      csharp: ".",
      kotlin: ".",
      swift: ".",
    };

    return separators[language] || ".";
  }

  /**
   * Universal symbol enhancement pipeline
   */
  private async enhanceSymbolsUniversal(
    symbols: UniversalSymbol[],
    context: UniversalScopeContext
  ): Promise<UniversalSymbol[]> {
    const enhanced: UniversalSymbol[] = [];

    for (const symbol of symbols) {
      // Update scope context based on symbol
      this.updateScopeForSymbol(symbol, context);

      // Enhance qualified name
      if (!symbol.qualifiedName || symbol.qualifiedName === symbol.name) {
        symbol.qualifiedName = this.buildUniversalQualifiedName(
          symbol.name,
          context
        );
      }

      // Add universal semantic tags
      symbol.semanticTags = [
        ...(symbol.semanticTags || []),
        ...this.generateUniversalSemanticTags(symbol, context),
      ];

      // Cache for relationship resolution
      context.symbolCache.set(symbol.qualifiedName, symbol);

      enhanced.push(symbol);
    }

    return enhanced;
  }

  /**
   * Update scope context based on symbol type
   */
  private updateScopeForSymbol(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): void {
    // Universal scope types that work across languages
    const scopeTypes = [
      "namespace",
      "module",
      "package",
      "class",
      "interface",
      "struct",
    ];

    if (scopeTypes.includes(symbol.kind)) {
      const frame: ScopeFrame = {
        type: symbol.kind as any,
        name: symbol.name,
        qualifiedName: symbol.qualifiedName,
        line: symbol.line,
        language: context.languageContext.language,
        languageData: symbol.languageFeatures,
      };

      context.scopeStack.push(frame);
      context.currentScope = frame;
    }
  }

  /**
   * Generate universal semantic tags that work across languages
   */
  private generateUniversalSemanticTags(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): string[] {
    const tags: string[] = [];
    const language = context.languageContext.language;

    // Universal visibility mapping
    if (symbol.visibility) {
      tags.push(`visibility:${symbol.visibility}`);
    }

    // Universal async/await pattern
    if (symbol.isAsync) {
      tags.push("async", "concurrent");
    }

    // Universal export pattern
    if (symbol.isExported) {
      tags.push("exported", "public_api");
    }

    // Universal abstraction pattern
    if (symbol.isAbstract) {
      tags.push("abstract", "contract");
    }

    // Language-specific tag mapping
    if (symbol.languageFeatures) {
      tags.push(
        ...this.mapLanguageFeaturesToTags(symbol.languageFeatures, language)
      );
    }

    // Pattern-based tags
    tags.push(...this.detectUniversalPatterns(symbol, context));

    return tags;
  }

  /**
   * Map language-specific features to universal tags
   */
  private mapLanguageFeaturesToTags(
    features: Record<string, any>,
    language: string
  ): string[] {
    const tags: string[] = [];

    // C++ specific mappings
    if (language === "cpp") {
      if (features.isTemplate) tags.push("generic", "template");
      if (features.isVirtual) tags.push("virtual", "polymorphic");
      if (features.isStatic) tags.push("static", "class_level");
      if (features.isConst) tags.push("immutable", "readonly");
      if (features.isInline) tags.push("inline", "optimization");
      if (features.isNoexcept) tags.push("safe", "no_exceptions");
    }

    // Python specific mappings
    if (language === "python") {
      if (features.isProperty) tags.push("property", "accessor");
      if (features.isClassMethod) tags.push("class_method", "static");
      if (features.isStaticMethod) tags.push("static_method", "utility");
      if (features.isCoroutine) tags.push("async", "coroutine");
      if (features.isGenerator) tags.push("generator", "lazy");
    }

    // TypeScript specific mappings
    if (language === "typescript") {
      if (features.isGeneric) tags.push("generic", "template");
      if (features.isReadonly) tags.push("readonly", "immutable");
      if (features.isOptional) tags.push("optional", "nullable");
      if (features.isDecorator) tags.push("decorator", "meta");
    }

    return tags;
  }

  /**
   * Detect universal patterns across languages
   */
  private detectUniversalPatterns(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): string[] {
    const patterns: string[] = [];
    const name = symbol.name.toLowerCase();

    // Factory pattern (universal)
    if (
      name.includes("factory") ||
      name.includes("create") ||
      name.includes("make")
    ) {
      patterns.push("factory", "creational");
    }

    // Builder pattern (universal)
    if (name.includes("builder") || name.includes("build")) {
      patterns.push("builder", "fluent");
    }

    // Manager pattern (universal)
    if (name.includes("manager") || name.includes("controller")) {
      patterns.push("manager", "coordinator");
    }

    // Service pattern (universal)
    if (name.includes("service") || name.includes("provider")) {
      patterns.push("service", "provider");
    }

    // Repository pattern (universal)
    if (name.includes("repository") || name.includes("dao")) {
      patterns.push("repository", "data_access");
    }

    // Event pattern (universal)
    if (
      name.includes("event") ||
      name.includes("listener") ||
      name.includes("handler")
    ) {
      patterns.push("event", "observer");
    }

    return patterns;
  }

  /**
   * Universal control flow analysis
   */
  async analyzeControlFlowUniversal(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): Promise<UniversalControlFlow> {
    const language = context.languageContext.language;
    const analyzer = this.getControlFlowAnalyzer(language);

    return await analyzer.analyze(symbol, context);
  }

  /**
   * Get language-specific control flow analyzer
   */
  private getControlFlowAnalyzer(
    language: string
  ): UniversalControlFlowAnalyzer {
    // Language-specific analyzers that implement universal interface
    switch (language) {
      case "cpp":
        return new CppControlFlowAnalyzer();
      case "python":
        return new PythonControlFlowAnalyzer();
      case "typescript":
        return new TypeScriptControlFlowAnalyzer();
      default:
        return new GenericControlFlowAnalyzer();
    }
  }
}

/**
 * Universal control flow analyzer interface
 */
export interface UniversalControlFlowAnalyzer {
  analyze(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): Promise<UniversalControlFlow>;
}

/**
 * Generic control flow analyzer for any language
 */
export class GenericControlFlowAnalyzer
  implements UniversalControlFlowAnalyzer
{
  async analyze(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): Promise<UniversalControlFlow> {
    // Generic pattern-based analysis that works for any language
    const blocks: ControlFlowBlock[] = [];
    const edges: ControlFlowEdge[] = [];

    // Create entry block
    blocks.push({
      id: "entry",
      type: "entry",
      startLine: symbol.line,
      endLine: symbol.line,
      language: context.languageContext.language,
    });

    // Analyze content between symbol start and end
    const content = context.languageContext.content;
    const lines = content.split("\n");
    const startLine = symbol.line - 1;
    const endLine = symbol.endLine || startLine + 10; // Estimate

    let complexity = 1;

    for (let i = startLine; i < Math.min(endLine, lines.length); i++) {
      const line = lines[i];

      // Universal control flow patterns
      if (this.isConditional(line)) {
        complexity++;
        blocks.push({
          id: `conditional_${i}`,
          type: "conditional",
          startLine: i + 1,
          endLine: i + 1,
          condition: this.extractCondition(line),
          language: context.languageContext.language,
        });
      }

      if (this.isLoop(line)) {
        complexity++;
        blocks.push({
          id: `loop_${i}`,
          type: "loop",
          startLine: i + 1,
          endLine: i + 1,
          condition: this.extractCondition(line),
          language: context.languageContext.language,
        });
      }

      if (this.isException(line)) {
        complexity++;
        blocks.push({
          id: `exception_${i}`,
          type: "exception",
          startLine: i + 1,
          endLine: i + 1,
          language: context.languageContext.language,
        });
      }
    }

    // Create exit block
    blocks.push({
      id: "exit",
      type: "exit",
      startLine: endLine,
      endLine: endLine,
      language: context.languageContext.language,
    });

    return {
      symbolId: symbol.qualifiedName,
      language: context.languageContext.language,
      blocks,
      edges,
      complexity,
      patterns: this.detectControlFlowPatterns(blocks),
    };
  }

  private isConditional(line: string): boolean {
    // Universal conditional patterns
    return /\b(if|else|switch|case|when|unless|match)\b/.test(line);
  }

  private isLoop(line: string): boolean {
    // Universal loop patterns
    return /\b(for|while|do|loop|each|map|filter|reduce)\b/.test(line);
  }

  private isException(line: string): boolean {
    // Universal exception patterns
    return /\b(try|catch|except|finally|throw|raise|error)\b/.test(line);
  }

  private extractCondition(line: string): string {
    // Universal condition extraction
    const patterns = [
      /\((.*?)\)/, // Parentheses: if (condition)
      /:\s*(.+)/, // Colon: if condition:
      /\s+(.*?)\s*{/, // Brace: if condition {
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return "";
  }

  private detectControlFlowPatterns(blocks: ControlFlowBlock[]): string[] {
    const patterns: string[] = [];

    const hasConditional = blocks.some((b) => b.type === "conditional");
    const hasLoop = blocks.some((b) => b.type === "loop");
    const hasException = blocks.some((b) => b.type === "exception");

    if (hasConditional) patterns.push("branching");
    if (hasLoop) patterns.push("iteration");
    if (hasException) patterns.push("error_handling");

    if (blocks.length <= 2) patterns.push("simple");
    else if (blocks.length > 10) patterns.push("complex");

    return patterns;
  }
}

/**
 * C++ specific control flow analyzer
 */
export class CppControlFlowAnalyzer extends GenericControlFlowAnalyzer {
  async analyze(
    symbol: UniversalSymbol,
    context: UniversalScopeContext
  ): Promise<UniversalControlFlow> {
    const baseResult = await super.analyze(symbol, context);

    // Add C++ specific patterns
    const content = context.languageContext.content;
    const lines = content.split("\n");

    // Detect C++ specific patterns
    const cppPatterns: string[] = [];

    for (const line of lines) {
      if (
        line.includes("RAII") ||
        line.includes("unique_ptr") ||
        line.includes("shared_ptr")
      ) {
        cppPatterns.push("raii", "resource_management");
      }
      if (
        line.includes("template") ||
        (line.includes("<") && line.includes(">"))
      ) {
        cppPatterns.push("template_metaprogramming");
      }
      if (line.includes("constexpr") || line.includes("consteval")) {
        cppPatterns.push("compile_time");
      }
    }

    baseResult.patterns.push(...cppPatterns);
    return baseResult;
  }
}

/**
 * Python specific control flow analyzer
 */
export class PythonControlFlowAnalyzer extends GenericControlFlowAnalyzer {
  // Similar implementation for Python specific patterns
}

/**
 * TypeScript specific control flow analyzer
 */
export class TypeScriptControlFlowAnalyzer extends GenericControlFlowAnalyzer {
  // Similar implementation for TypeScript specific patterns
}
