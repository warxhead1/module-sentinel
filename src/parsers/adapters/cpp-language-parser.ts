/**
 * C++ Language Parser Adapter
 * 
 * Implements the ILanguageParser interface for C++ using our optimized parser
 */

import { ILanguageParser, ParseResult as IParseResult, ParserConfig, UniversalSymbolKind, UniversalRelationshipType, UniversalSymbol, UniversalRelationship } from '../language-parser-interface.js';
import { OptimizedCppTreeSitterParser } from '../tree-sitter/optimized-cpp-parser.js';
import { Database } from 'better-sqlite3';
import * as fs from 'fs/promises';

export class CppLanguageParser implements ILanguageParser {
  public readonly language = 'cpp';
  public readonly version = '3.0.0';
  public readonly supportedExtensions = ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.hxx', '.ixx', '.c'];
  public readonly features = [
    'modules',
    'templates', 
    'classes',
    'functions',
    'namespaces',
    'relationships',
    'patterns',
    'control-flow',
    'c++23'
  ];
  
  private parser?: OptimizedCppTreeSitterParser;
  private config: ParserConfig;
  private db?: Database;

  constructor(config?: ParserConfig) {
    this.config = config || {
      language: 'cpp',
      version: '3.0.0',
      enableSemanticAnalysis: true,
      enablePatternDetection: true,
      debugMode: false
    };
  }

  configure(config: ParserConfig): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ParserConfig {
    return this.config;
  }

  reset(): void {
    this.parser = undefined;
  }

  getMetadata(): Record<string, any> {
    return {
      parserType: 'tree-sitter-optimized',
      fallbackMode: 'pattern-based',
      cacheEnabled: true,
      supportsCpp23: true
    };
  }

  getSupportedFeatures(): string[] {
    return this.features;
  }

  async initialize(db: Database): Promise<void> {
    this.db = db;
    this.parser = new OptimizedCppTreeSitterParser(db, {
      debugMode: this.config.debugMode || false,
      projectId: (this.config as any).projectId || 1
    });
    await this.parser.initialize();
  }

  async parse(filePath: string, content?: string): Promise<IParseResult> {
    if (!this.parser) {
      throw new Error('Parser not initialized. Call initialize() first.');
    }

    // Read content if not provided
    if (!content) {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const startTime = Date.now();
    
    // Parse the file
    const result = await this.parser.parseFile(filePath, content);
    
    // Convert to IParseResult format
    return {
      symbols: result.symbols.map(s => ({
        id: `${filePath}:${s.line}:${s.column}`,
        name: s.name,
        qualifiedName: s.qualifiedName,
        kind: this.mapSymbolKind(s.kind),
        filePath: s.filePath,
        line: s.line,
        column: s.column,
        endLine: s.endLine,
        endColumn: s.endColumn,
        returnType: s.returnType,
        signature: s.signature,
        visibility: 'public', // TODO: extract from semanticTags
        namespace: s.namespace,
        parentSymbol: s.parentScope,
        isExported: s.isExported,
        isAsync: s.isAsync,
        isAbstract: false, // TODO: extract from semanticTags
        languageFeatures: {
          semanticTags: s.semanticTags,
          complexity: s.complexity
        },
        semanticTags: s.semanticTags,
        confidence: s.confidence
      })),
      relationships: result.relationships.map(r => ({
        fromSymbolId: `${filePath}:${r.fromName}`,
        toSymbolId: `${filePath}:${r.toName}`,
        type: this.mapRelationshipType(r.relationshipType),
        confidence: r.confidence,
        contextLine: r.lineNumber,
        metadata: {
          crossLanguage: r.crossLanguage,
          sourceContext: r.sourceContext,
          usagePattern: r.usagePattern,
          sourceText: r.sourceText,
          bridgeType: r.bridgeType
        }
      })),
      patterns: result.patterns.map(p => ({
        type: p.patternType,
        confidence: p.confidence,
        symbols: [], // TODO: extract symbol IDs
        description: p.patternName,
        severity: 'info' as const,
        suggestions: []
      })),
      parseTime: Date.now() - startTime,
      language: 'cpp',
      languageVersion: '23',
      confidence: 0.9,
      errors: [],
      warnings: [],
      stats: {
        symbolCount: result.symbols.length,
        relationshipCount: result.relationships.length,
        patternCount: result.patterns.length,
        linesAnalyzed: result.stats?.nodesVisited || 0
      }
    };
  }

  validate(): boolean {
    // Basic validation
    return true;
  }

  canParse(filePath: string): boolean {
    return this.supportedExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  private mapSymbolKind(kind: string): UniversalSymbolKind {
    const mapping: Record<string, UniversalSymbolKind> = {
      'class': UniversalSymbolKind.Class,
      'struct': UniversalSymbolKind.Class,
      'function': UniversalSymbolKind.Function,
      'method': UniversalSymbolKind.Method,
      'constructor': UniversalSymbolKind.Constructor,
      'destructor': UniversalSymbolKind.Method,
      'namespace': UniversalSymbolKind.Namespace,
      'enum': UniversalSymbolKind.Enum,
      'variable': UniversalSymbolKind.Variable,
      'field': UniversalSymbolKind.Property,
      'typedef': UniversalSymbolKind.Typedef,
      'interface': UniversalSymbolKind.Interface,
      'module': UniversalSymbolKind.Module
    };

    return mapping[kind] || UniversalSymbolKind.Unknown;
  }

  private mapRelationshipType(type: string): UniversalRelationshipType {
    const mapping: Record<string, UniversalRelationshipType> = {
      'inherits': UniversalRelationshipType.Inherits,
      'implements': UniversalRelationshipType.Implements,
      'uses': UniversalRelationshipType.Uses,
      'calls': UniversalRelationshipType.Calls,
      'imports': UniversalRelationshipType.Imports,
      'exports': UniversalRelationshipType.Exports,
      'instantiates': UniversalRelationshipType.Instantiates,
      'overrides': UniversalRelationshipType.Overrides,
      'references': UniversalRelationshipType.References
    };

    return mapping[type] || UniversalRelationshipType.References;
  }

  async parseSymbols(filePath: string, content?: string): Promise<UniversalSymbol[]> {
    const result = await this.parse(filePath, content);
    return result.symbols;
  }

  async parseRelationships(filePath: string, symbols: UniversalSymbol[]): Promise<UniversalRelationship[]> {
    const result = await this.parse(filePath);
    return result.relationships;
  }

  getLanguageFeatures(symbol: UniversalSymbol): Record<string, any> {
    return symbol.languageFeatures || {};
  }
}