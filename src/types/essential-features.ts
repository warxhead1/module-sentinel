// Essential Features Type Definitions for Module Sentinel

export interface ImplementationMatch {
  module: string;
  method: string;
  signature: string;
  location: string;
  description?: string;
  similarity?: number;
  score?: number;
  usage_count?: number;
  complexity?: number;
  last_modified?: number;
}

export interface FindImplementationsRequest {
  functionality: string;
  keywords: string[];
  returnType?: string;
}

export interface FindImplementationsResponse {
  exact_matches: ImplementationMatch[];
  similar_implementations: ImplementationMatch[];
}

export interface DependencyPathRequest {
  from: string;
  to: string;
  stage?: string;
}

export interface DependencyPathResponse {
  recommended_path: string[];
  interfaces_needed: string[];
  example_usage?: string;
}

export interface SimilarCodeRequest {
  pattern: string;
  context: string;
  threshold: number;
}

export interface SimilarCodeMatch {
  location: string;
  pattern: string;
  suggestion: string;
}

export interface SimilarCodeResponse {
  similar_patterns: SimilarCodeMatch[];
}

export interface ApiSurfaceRequest {
  module: string;
  include_inherited?: boolean;
}

export interface MethodInfo {
  name: string;
  params: string[];
  returns: string;
  description?: string;
}

export interface ApiSurfaceResponse {
  public_methods: MethodInfo[];
  public_members: any[];
  interfaces: string[];
  dependencies: {
    required: string[];
    optional: string[];
  };
}

export interface UsageExampleRequest {
  class: string;
  method?: string;
}

export interface UsageExample {
  location: string;
  code: string;
  context: string;
}

export interface UsageExampleResponse {
  examples: UsageExample[];
}

export interface ImpactAnalysisRequest {
  module: string;
  change_type: 'interface_modification' | 'method_change' | 'removal' | 'rename';
}

export interface ImpactAnalysisResponse {
  direct_dependents: string[];
  indirect_dependents: string[];
  test_files: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  suggestion?: string;
}

export interface UnifiedSearchRequest {
  query: string;
  intent?: 'implementation' | 'usage' | 'debug' | 'extend';
  context?: {
    current_file: string;
    stage?: string;
  };
}

export interface UnifiedSearchResponse {
  existing_solutions: ImplementationMatch[];
  recommended_approach?: {
    description: string;
    steps: string[];
  };
  integration_path: string[];
  examples: UsageExample[];
  warnings?: string[];
}

// Pattern Recognition Types
export interface CodePattern {
  pattern: string;
  hash: string;
  frequency: number;
  locations: string[];
  category: 'loop' | 'conditional' | 'initialization' | 'algorithm' | 'other';
}

export interface SymbolRelationship {
  from: string;
  to: string;
  type: 'inherits' | 'implements' | 'uses' | 'calls' | 'returns';
  confidence: number;
}

// Enhanced Module Information
export interface EnhancedModuleInfo {
  path: string;
  relativePath: string;
  methods: MethodSignature[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  relationships: SymbolRelationship[];
  patterns: CodePattern[];
  imports: DetailedImport[];
  exports: DetailedExport[];
}

export interface MethodSignature {
  name: string;
  className?: string;
  parameters: ParameterInfo[];
  returnType: string;
  visibility: 'public' | 'private' | 'protected';
  isVirtual: boolean;
  isStatic: boolean;
  isConst: boolean;
  templateParams?: string[];
  location: { line: number; column: number };
}

export interface ParameterInfo {
  name: string;
  type: string;
  defaultValue?: string;
  isConst: boolean;
  isReference: boolean;
  isPointer: boolean;
}

export interface ClassInfo {
  name: string;
  namespace?: string;
  baseClasses: string[];
  interfaces: string[];
  methods: MethodSignature[];
  members: MemberInfo[];
  isTemplate: boolean;
  templateParams?: string[];
  location: { line: number; column: number };
}

export interface InterfaceInfo {
  name: string;
  methods: MethodSignature[];
  extends?: string[];
  location: { line: number; column: number };
}

export interface MemberInfo {
  name: string;
  type: string;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  isConst: boolean;
}

export interface DetailedImport {
  module: string;
  symbols: string[];
  isSystem: boolean;
  location: { line: number; column: number };
}

export interface DetailedExport {
  symbol: string;
  type: 'class' | 'function' | 'variable' | 'interface' | 'enum' | 'namespace';
  signature?: string;
  location: { line: number; column: number };
}

export interface CodeContext {
  filePath?: string;
  content?: string;
  symbols?: string[];
  cursorPosition?: { line: number; column: number };
  surroundingCode?: string;
  activeTaskDescription?: string;
}

// Cross-File Dependency Analysis Types
export interface CrossFileDependencyRequest {
  symbolName?: string;        // Analyze dependencies for specific symbol
  filePath?: string;         // Analyze dependencies for specific file  
  analysisType: 'symbol' | 'file' | 'downstream_impact' | 'file_dependencies';
  includeUsageDetails?: boolean;
}

export interface CrossFileUsage {
  fromSymbol: string;
  fromFile: string;
  fromLine: number;
  toSymbol: string;
  toFile: string;
  relationshipType: 'calls' | 'uses' | 'inherits' | 'includes';
  usagePattern: 'qualified_call' | 'simple_call' | 'type_usage' | 'inheritance';
  confidence: number;
  sourceText: string;
}

export interface FileDependency {
  dependentFile: string;
  dependencyFile: string;
  usageCount: number;
  relationshipTypes: string[];
  usages: CrossFileUsage[];
}

export interface DownstreamImpact {
  symbol: string;
  totalUsages: number;
  affectedFiles: string[];
  directCallers: string[];
  usagesByFile: { [file: string]: number };
  criticalUsages: CrossFileUsage[];  // High-confidence usages
}

export interface CrossFileDependencyResponse {
  analysisType: string;
  requestedSymbol?: string;
  requestedFile?: string;
  
  // For symbol analysis
  symbolUsages?: CrossFileUsage[];
  downstreamImpact?: DownstreamImpact;
  
  // For file analysis
  fileDependencies?: FileDependency[];
  dependsOnFiles?: string[];
  usedByFiles?: string[];
  
  // For overall analysis
  totalCrossFileRelationships?: number;
  usagePatternSummary?: { [pattern: string]: number };
  
  summary: string;
}