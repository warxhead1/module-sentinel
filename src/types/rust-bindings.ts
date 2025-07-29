/**
 * TypeScript type definitions matching Rust data structures
 * for seamless NAPI-RS integration
 */

export interface Symbol {
  id: string;
  name: string;
  signature: string;
  returnType?: string;
  language: Language;
  filePath: string;
  startLine: number;
  endLine: number;
  normalizedName: string;
  confidenceScore?: number;
  similarSymbols: string[];
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
  fromSymbolId?: number;
  toSymbolId?: number;
  relationshipType: string;
  confidence: number;
  contextLine?: number;
  contextColumn?: number;
  contextSnippet?: string;
  metadata?: string;
  createdAt: string;
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
  parseMethod: string;
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
  overallScore: number;
  nameSimilarity: number;
  signatureSimilarity: number;
  structuralSimilarity: number;
  contextSimilarity: number;
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
  symbolCount: number;
}

export interface AnalysisInsights {
  totalSymbolsAnalyzed: number;
  duplicateCount: number;
  patternsDetected: number;
  averageSimilarity: number;
  codeReusePercentage: number;
  recommendations: string[];
}

export interface ProjectInfo {
  id: number;
  name: string;
  path: string;
  lastIndexed?: string;
  symbolCount: number;
  languageDistribution: Record<string, number>;
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

export interface QualityIssue {
  description: string;
  category: string;
  severity: string;
  suggestion?: string;
  confidence?: number;
  suggestedRefactoring?: string[];
  line?: number;
  column?: number;
}

export interface QualityMetrics {
  cyclomaticComplexity: number;
  maxNestingDepth: number;
  functionCount: number;
  largeFunctionCount: number;
  linesOfCode: number;
  commentRatio: number;
  decisionPoints?: number;
  errorHandlingComplexity?: number;
}

export interface CodeQualityResult {
  issues: QualityIssue[];
  metrics: QualityMetrics;
  overallScore: number;
  recommendations: string[];
}

// ML-powered types
export interface ComponentReuseRecommendation {
  existingComponentId: string;
  relevanceScore: number;
  suggestedUsage: string;
  extensionNeeded: "none" | "minor_config" | "new_implementation" | "significant_mod";
  componentPath: string;
}

export interface ErrorFixSuggestion {
  suggestion: string;
  confidence: number;
  explanation: string;
  learnedFrom?: string;
}

export interface MLParseError {
  message: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  errorType: string;
  mlSuggestions: ErrorFixSuggestion[];
}