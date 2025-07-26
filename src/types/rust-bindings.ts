/**
 * TypeScript type definitions matching Rust data structures
 * for seamless NAPI-RS integration
 */

export interface Symbol {
  id: string;
  name: string;
  signature: string;
  language: Language;
  file_path: string;
  start_line: number;
  end_line: number;
  normalized_name: string;
  confidence_score?: number;
  similar_symbols: string[];
}

export interface UniversalSymbol {
  id?: number;
  projectId: number;
  name: string;
  qualifiedName: string;
  symbolType: string;
  signature?: string;
  filePath: string;
  line: number;
  endLine?: number;
  languageId: number;
  confidence: number;
  parentSymbolId?: number;
  isPublic: boolean;
  documentation?: string;
  semanticHash?: string;
  lastModified: string;
}

export interface UniversalRelationship {
  id?: number;
  projectId: number;
  sourceSymbolId: number;
  targetSymbolId: number;
  relationshipType: string;
  strength: number;
  context?: string;
  confidence: number;
  isInferred: boolean;
  lastModified: string;
}

export enum Language {
  Rust = "Rust",
  TypeScript = "TypeScript", 
  JavaScript = "JavaScript",
  Python = "Python",
  Cpp = "Cpp",
  Java = "Java",
  Go = "Go",
  CSharp = "CSharp"
}

export interface ParseResult {
  symbols: Symbol[];
  relationships: UniversalRelationship[];
  errors: string[];
  parse_method: string;
  confidence: number;
}

export interface PatternDetectionResult {
  category: PatternCategory;
  symbols: Symbol[];
  confidence: number;
  evidence: string[];
}

export enum PatternCategory {
  SingletonPattern = "SingletonPattern",
  FactoryPattern = "FactoryPattern", 
  BuilderPattern = "BuilderPattern",
  ObserverPattern = "ObserverPattern",
  IteratorPattern = "IteratorPattern",
  ErrorHandling = "ErrorHandling",
  ResourceManagement = "ResourceManagement",
  AsyncPattern = "AsyncPattern",
  TestPattern = "TestPattern",
  CrossLanguageFFI = "CrossLanguageFFI",
  DataTransformation = "DataTransformation",
  AlgorithmicPattern = "AlgorithmicPattern"
}

export interface SimilarityResult {
  overall_score: number;
  name_similarity: number;
  signature_similarity: number;
  structural_similarity: number;
  context_similarity: number;
}

export interface DuplicateGroup {
  primarySymbol: Symbol;
  duplicateSymbols: Symbol[];
  similarityScores: Record<string, number>;
  confidence: number;
  pattern: string;
}

export interface AnalysisResult {
  patterns: PatternDetectionResult[];
  insights: AnalysisInsights;
  symbol_count: number;
}

export interface AnalysisInsights {
  total_symbols_analyzed: number;
  duplicate_count: number;
  patterns_detected: number;
  average_similarity: number;
  code_reuse_percentage: number;
  recommendations: string[];
}

export interface ProjectInfo {
  id: number;
  name: string;
  path: string;
  last_indexed?: string;
  symbol_count: number;
  language_distribution: Record<string, number>;
}

export interface IndexingOptions {
  force?: boolean;
  languages?: Language[];
  includeTests?: boolean;
  maxFileSize?: number;
  excludePatterns?: string[];
}

export interface SearchOptions {
  kind?: string;
  language?: Language;
  limit?: number;
  includePrivate?: boolean;
  fuzzyMatch?: boolean;
}

export interface CrossLanguageRelationship {
  sourceLanguage: Language;
  targetLanguage: Language;
  relationshipType: string;
  confidence: number;
  examples: Array<{
    sourceFile: string;
    targetFile: string;
    description: string;
  }>;
}