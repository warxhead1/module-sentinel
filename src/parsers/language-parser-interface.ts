/**
 * Language Parser Interface - Core abstraction for multi-language support
 * 
 * This interface defines the contract that all language parsers must implement
 * to integrate with Module Sentinel's multi-language architecture.
 */

/**
 * Universal symbol representation that works across all languages
 */
export interface UniversalSymbol {
  // Core identification
  id?: string;
  name: string;
  qualifiedName: string;
  kind: UniversalSymbolKind;
  
  // Location information
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  
  // Type information (language-agnostic)
  returnType?: string;
  signature?: string;
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  
  // Semantic information
  namespace?: string;
  parentSymbol?: string;
  children?: UniversalSymbol[];
  isExported?: boolean;
  isAsync?: boolean;
  isAbstract?: boolean;
  
  // Language-specific features stored as JSON
  languageFeatures?: Record<string, any>;
  
  // Semantic tags for cross-language concepts
  semanticTags?: string[];
  
  // Analysis metadata
  confidence?: number;
}

/**
 * Universal symbol kinds that map across languages
 */
export enum UniversalSymbolKind {
  // Types
  Class = 'class',
  Interface = 'interface',
  Struct = 'struct',
  Enum = 'enum',
  Union = 'union',
  Typedef = 'typedef',
  TypeAlias = 'type_alias',
  
  // Functions
  Function = 'function',
  Method = 'method',
  Constructor = 'constructor',
  Destructor = 'destructor',
  Operator = 'operator',
  Property = 'property',
  
  // Variables
  Variable = 'variable',
  Constant = 'constant',
  Parameter = 'parameter',
  Field = 'field',
  
  // Modules
  Module = 'module',
  Namespace = 'namespace',
  Package = 'package',
  
  // Others
  Import = 'import',
  Export = 'export',
  Decorator = 'decorator',
  Annotation = 'annotation',
  Macro = 'macro',
  Label = 'label',
  Unknown = 'unknown'
}

/**
 * Universal relationship types between symbols
 */
export enum UniversalRelationshipType {
  // Inheritance and implementation
  Inherits = 'inherits',
  Implements = 'implements',
  Extends = 'extends',
  
  // Usage relationships
  Uses = 'uses',
  Calls = 'calls',
  References = 'references',
  
  // Containment
  Contains = 'contains',
  MemberOf = 'member_of',
  
  // Type relationships
  TypeOf = 'type_of',
  Returns = 'returns',
  Takes = 'takes',
  
  // Module relationships
  Imports = 'imports',
  Exports = 'exports',
  ReExports = 're_exports',
  Depends = 'depends',
  
  // Pattern relationships
  FactoryProduct = 'factory_product',
  ManagerManages = 'manager_manages',
  ObserverObserves = 'observer_observes',
  
  // Additional relationships
  Instantiates = 'instantiates',
  Declares = 'declares',
  Defines = 'defines',
  Overrides = 'overrides',
  Decorates = 'decorates',
  Annotates = 'annotates',
  Reads = 'reads',
  Writes = 'writes',
  Transforms = 'transforms',
  BindsTo = 'binds_to',
  MapsTo = 'maps_to',
  SerializesTo = 'serializes_to',
  
  // Cross-language relationships
  Spawns = 'spawns',
  Executes = 'executes',
  Invokes = 'invokes',
  Communicates = 'communicates'
}

/**
 * Universal relationship representation
 */
export interface UniversalRelationship {
  id?: string;
  fromSymbolId: string;
  toSymbolId: string;
  type: UniversalRelationshipType;
  confidence?: number;
  
  // Context information
  contextLine?: number;
  contextColumn?: number;
  contextSnippet?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

/**
 * Pattern detection result
 */
export interface DetectedPattern {
  type: string; // e.g., 'factory', 'singleton', 'observer'
  confidence: number;
  symbols: string[]; // Symbol IDs involved
  description?: string;
  severity?: 'info' | 'warning' | 'error';
  suggestions?: string[];
}

/**
 * Parser configuration
 */
export interface ParserConfig {
  // Language identification
  language: string;
  version: string;
  
  // Feature flags
  enableSemanticAnalysis?: boolean;
  enablePatternDetection?: boolean;
  enableTypeInference?: boolean;
  enableCrossReferences?: boolean;
  
  // Performance settings
  maxFileSize?: number;
  timeout?: number;
  debugMode?: boolean;
  
  // Language-specific options
  languageOptions?: Record<string, any>;
}

/**
 * Parsing result with metadata
 */
export interface ParseResult {
  symbols: UniversalSymbol[];
  relationships: UniversalRelationship[];
  patterns: DetectedPattern[];
  
  // Metadata
  parseTime: number;
  language: string;
  languageVersion?: string;
  confidence: number;
  
  // Errors and warnings
  errors: ParseError[];
  warnings: ParseWarning[];
  
  // Statistics
  stats: {
    symbolCount: number;
    relationshipCount: number;
    patternCount: number;
    linesAnalyzed: number;
  };
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'fatal';
}

export interface ParseWarning {
  message: string;
  line?: number;
  column?: number;
  type: string;
}

/**
 * Core interface that all language parsers must implement
 */
export interface ILanguageParser {
  // Parser identification
  readonly language: string;
  readonly version: string;
  readonly supportedExtensions: string[];
  readonly features: string[];
  
  // Configuration
  configure(config: ParserConfig): void;
  getConfig(): ParserConfig;
  
  // Core parsing methods
  canParse(filePath: string): boolean;
  parse(filePath: string, content?: string): Promise<ParseResult>;
  parseSymbols(filePath: string, content?: string): Promise<UniversalSymbol[]>;
  parseRelationships(filePath: string, symbols: UniversalSymbol[]): Promise<UniversalRelationship[]>;
  
  // Pattern detection (optional)
  detectPatterns?(symbols: UniversalSymbol[], relationships: UniversalRelationship[]): Promise<DetectedPattern[]>;
  
  // Type resolution (optional)
  resolveTypes?(symbols: UniversalSymbol[]): Promise<Map<string, string>>;
  
  // Cross-reference resolution (optional)
  resolveCrossReferences?(symbols: UniversalSymbol[], projectContext: any): Promise<UniversalRelationship[]>;
  
  // Language-specific features
  getLanguageFeatures(symbol: UniversalSymbol): Record<string, any>;
  
  // Validation
  validate(): boolean;
  getSupportedFeatures(): string[];
}

/**
 * Base class providing common functionality for language parsers
 */
export abstract class BaseLanguageParser implements ILanguageParser {
  protected config: ParserConfig;
  
  constructor(
    public readonly language: string,
    public readonly version: string,
    public readonly supportedExtensions: string[],
    public readonly features: string[]
  ) {
    this.config = {
      language,
      version,
      enableSemanticAnalysis: true,
      enablePatternDetection: true,
      enableTypeInference: true,
      enableCrossReferences: true
    };
  }
  
  configure(config: ParserConfig): void {
    this.config = { ...this.config, ...config };
  }
  
  getConfig(): ParserConfig {
    return { ...this.config };
  }
  
  canParse(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return this.supportedExtensions.includes(`.${ext}`);
  }
  
  async parse(filePath: string, content?: string): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseError[] = [];
    const warnings: ParseWarning[] = [];
    
    try {
      // Parse symbols
      const symbols = await this.parseSymbols(filePath, content);
      
      // Parse relationships
      const relationships = await this.parseRelationships(filePath, symbols);
      
      // Detect patterns if enabled
      let patterns: DetectedPattern[] = [];
      if (this.config.enablePatternDetection && 'detectPatterns' in this && typeof (this as any).detectPatterns === 'function') {
        patterns = await (this as any).detectPatterns(symbols, relationships);
      }
      
      // Calculate statistics
      const linesAnalyzed = content ? content.split('\n').length : 0;
      
      return {
        symbols,
        relationships,
        patterns,
        parseTime: Date.now() - startTime,
        language: this.language,
        languageVersion: this.version,
        confidence: this.calculateConfidence(symbols, relationships),
        errors,
        warnings,
        stats: {
          symbolCount: symbols.length,
          relationshipCount: relationships.length,
          patternCount: patterns.length,
          linesAnalyzed
        }
      };
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        severity: 'fatal'
      });
      
      return {
        symbols: [],
        relationships: [],
        patterns: [],
        parseTime: Date.now() - startTime,
        language: this.language,
        confidence: 0,
        errors,
        warnings,
        stats: {
          symbolCount: 0,
          relationshipCount: 0,
          patternCount: 0,
          linesAnalyzed: 0
        }
      };
    }
  }
  
  // Abstract methods that must be implemented by language-specific parsers
  abstract parseSymbols(filePath: string, content?: string): Promise<UniversalSymbol[]>;
  abstract parseRelationships(filePath: string, symbols: UniversalSymbol[]): Promise<UniversalRelationship[]>;
  abstract getLanguageFeatures(symbol: UniversalSymbol): Record<string, any>;
  
  // Default implementations
  validate(): boolean {
    return true;
  }
  
  getSupportedFeatures(): string[] {
    return this.features;
  }
  
  protected calculateConfidence(symbols: UniversalSymbol[], relationships: UniversalRelationship[]): number {
    // Basic confidence calculation - can be overridden
    if (symbols.length === 0) return 0;
    
    const hasQualifiedNames = symbols.filter(s => s.qualifiedName).length / symbols.length;
    const hasTypes = symbols.filter(s => s.returnType || s.signature).length / symbols.length;
    const avgRelationshipConfidence = relationships.length > 0
      ? relationships.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / relationships.length
      : 0.5;
    
    return (hasQualifiedNames + hasTypes + avgRelationshipConfidence) / 3;
  }
}