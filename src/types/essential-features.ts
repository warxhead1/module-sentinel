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
  usage_count?: number;
}

export interface ExportInfo {
  name: string;
  qualified_name: string;
  kind: string;
  usage_count: number;
  imported_by: string[];
  import_count: number;
}

export interface ApiMemberInfo {
  name: string;
  parent_class: string;
  qualified_name: string;
  usage_count: number;
}

export interface ApiSurfaceResponse {
  public_methods: MethodInfo[];
  public_members: ApiMemberInfo[];
  interfaces: string[];
  dependencies: {
    required: string[];
    optional: string[];
  };
  exports?: ExportInfo[];
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
  functions?: any[];
  namespaces?: any[];
  includes?: any[];
  imports: DetailedImport[];
  exports: DetailedExport[];
  
  // Unified parser metadata
  confidence?: {
    overall: number;
    symbolDetection: number;
    typeResolution: number;
    relationshipAccuracy: number;
    modernCppSupport: number;
    moduleAnalysis: number;
  };
  parseTime?: number;
  fileCharacteristics?: {
    isModuleFile: boolean;
    isHeaderFile: boolean;
    isImplementationFile: boolean;
    hasVulkanCode: boolean;
    hasModernCpp: boolean;
    lineCount: number;
    sizeBytes: number;
    isLarge: boolean;
    pipelineStage: string;
  };
  parserVersion?: string;
  // Enhanced: C++20/23 Module information
  moduleInfo?: {
    isModule: boolean;
    moduleName?: string | null;
    importedModules: string[];
    exportNamespaces: string[];
    
    // Enhanced: Module Analysis
    pipelineStage?: string;
    exports?: string[];
    imports?: string[];
    cohesionScore?: number;
    couplingScore?: number;
    complexityScore?: number;
    parseSuccess?: boolean;
    parseErrors?: string[];
  };
}

export interface MethodSignature {
  name: string;
  className?: string;
  parameters: ParameterInfo[];
  returnType: string;
  visibility: 'public' | 'private' | 'protected' | string;
  isVirtual: boolean;
  isStatic: boolean;
  isConst: boolean;
  templateParams?: string[];
  // Enhanced: Namespace and qualification support
  namespace?: string;
  qualifiedName?: string;
  isExported?: boolean;
  location: { line: number; column: number };
  // Enhanced: Detailed type analysis
  
  // Enhanced: Unified parser semantic features
  semanticTags?: string[];
  isTemplate?: boolean;
  complexity?: number;
  callsOtherMethods?: Array<{object: string; method: string}>;
  usesMembers?: Array<{object: string; member: string}>;
  returnTypeInfo?: any; // Enhanced type information
  enhancedSignature?: any; // EnhancedMethodSignature from enhanced-type-analyzer
  enhancedParameters?: any[]; // EnhancedParameterInfo[] from enhanced-type-analyzer
  annotations?: any[];
  bodyHash?: string;
  
  // Enhanced: Method Information
  isConstructor?: boolean;
  isDestructor?: boolean;
  isOperator?: boolean;
  operatorType?: string;
  isOverride?: boolean;
  isFinal?: boolean;
  isNoexcept?: boolean;
  exportNamespace?: string;
  
  // Enhanced: Semantic analysis data
  enhancedSemantics?: {
    cyclomaticComplexity?: number;
    cognitiveComplexity?: number;
    nestingDepth?: number;
    memoryPatterns?: any[];
    vulkanPatterns?: any[];
    modernCppFeatures?: any;
    callChains?: any[];
    functionCalls?: any[];
    typeResolution?: any;
    confidence?: number; // Method-specific confidence
  };
  
  // Enhanced: Pattern Analysis
  executionMode?: string;
  isAsync?: boolean;
  isFactory?: boolean;
  isGenerator?: boolean;
  pipelineStage?: string;
  returnsVectorFloat?: boolean;
  usesGpuCompute?: boolean;
  hasCpuFallback?: boolean;
  
  // Enhanced: Semantic Analysis
  relatedSymbols?: string[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  defaultValue?: string;
  isConst: boolean;
  isReference: boolean;
  isPointer: boolean;
  
  // Enhanced: Type Information
  qualifiedType?: string;
  baseType?: string;
  isVolatile?: boolean;
  isTemplate?: boolean;
  templateArguments?: string[];
  isVariadic?: boolean;
  typeCategory?: string;
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
  // Enhanced: Support for enum information
  isEnum?: boolean;
  isEnumClass?: boolean;
  enumValues?: string[];
  location: { line: number; column: number };
  // Enhanced: Detailed type analysis
  enhancedMembers?: any[]; // EnhancedMemberInfo[] from enhanced-type-analyzer
  
  // Enhanced: C++20/23 Module Information
  isExported?: boolean;
  exportNamespace?: string;
  
  // Enhanced: Unified parser semantic features
  semanticTags?: string[];
  isAbstract?: boolean;
  isFinal?: boolean;
  constructors?: any[];
  destructor?: any;
  
  // Enhanced: Type Information for Database Storage
  baseType?: string;
  isPointer?: boolean;
  isReference?: boolean;
  isConst?: boolean;
  isVolatile?: boolean;
  isBuiltin?: boolean;
  isStdType?: boolean;
  isVulkanType?: boolean;
  isPlanetgenType?: boolean;
  templateArguments?: string[];
  typeModifiers?: string[];
  arrayDimensions?: number[];
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
  type: 'class' | 'function' | 'variable' | 'interface' | 'enum' | 'namespace' | 'using_alias' | 'enum_value';
  signature?: string;
  location: { line: number; column: number };
  // Enhanced: Module export information
  namespace?: string;
  isModuleExport?: boolean;
  isNamespaceExport?: boolean;
  moduleContext?: string;
  originalType?: string; // For using aliases
}

export interface ModuleSymbols {
  exports: Set<string>;
  imports: Set<string>;
  functions: Set<string>;
  classes: Set<string>;
  namespaces: Set<string>;
  filePath: string;
  confidence: number;
  dependencies?: Set<string>;
  includes?: Set<string>;
  relationships?: Array<{from: string; to: string; type: string}>;
  moduleInfo?: {
    isModule: boolean;
    moduleName?: string;
    importedModules?: string[];
  };
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