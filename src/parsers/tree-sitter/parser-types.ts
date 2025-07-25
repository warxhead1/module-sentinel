/**
 * Common types for all parsers
 */

export interface SymbolInfo {
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;
  returnType?: string;
  visibility?: string; // 'public', 'private', 'protected', 'internal'
  semanticTags: string[];
  complexity: number;
  confidence: number;
  isDefinition: boolean;
  isExported: boolean;
  isAsync: boolean;
  namespace?: string;
  parentScope?: string;
  languageFeatures?: Record<string, any>;
}

export interface RelationshipInfo {
  fromName: string;
  toName: string;
  relationshipType: string;
  confidence: number;
  lineNumber?: number;
  columnNumber?: number;
  crossLanguage: boolean;
  sourceContext?: string;
  usagePattern?: string;
  sourceText?: string;
  bridgeType?: string;
  metadata?: Record<string, any>; // Additional metadata for enhanced analysis
}

export interface PatternInfo {
  patternType: string;
  patternName: string;
  confidence: number;
  details?: any;
}

export interface ParseOptions {
  projectId?: number;
  debugMode?: boolean;
  maxFileSize?: number;
  enableControlFlow?: boolean;
  enablePatterns?: boolean;
  enablePatternDetection?: boolean;
  enableSemanticAnalysis?: boolean;
  languageId?: number;
  semanticAnalysisTimeout?: number;
  parseTimeout?: number;
  cacheStrategy?: 'aggressive' | 'moderate' | 'minimal';
}

export interface ParseResult {
  symbols: SymbolInfo[];
  relationships: RelationshipInfo[];
  patterns: PatternInfo[];
  controlFlowData: { blocks: any[]; calls: any[] };
  stats: any;
  semanticIntelligence?: any; // SemanticIntelligenceResult
}