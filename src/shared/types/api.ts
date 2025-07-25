/**
 * Shared API types for Module Sentinel Dashboard
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface Symbol {
  id: number;
  name: string;
  qualified_name: string;
  kind: string;
  namespace: string;
  file_path: string;
  line: number;
  column: number;
  visibility?: string;
  signature?: string;
  return_type?: string;
  is_exported: boolean;
  language_id: number;
  project_id: number;
  complexity?: number; // Added for cyclomatic complexity
  depth?: number; // Added for cognitive complexity calculation
}

export interface ModuleFile {
  name: string;
  qualifiedName: string;
  namespace: string;
  kind: 'module' | 'namespace';
  files: FileInfo[];
  imports: string[];
  symbolCount: number;
  symbolKinds: string[];
  children: Symbol[];
}

export interface FileInfo {
  path: string;
  type: 'interface' | 'implementation' | 'other';
  symbolCount?: number;
  symbolKinds?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string; // e.g., 'class', 'function', 'namespace', 'module', 'file'
  namespace?: string;
  moduleId?: string; // New: For grouping by module/file (e.g., file path hash)
  parentGroupId?: string; // New: For explicit hierarchical grouping (e.g., namespace ID)
  size?: number;
  
  // Rich symbol information from database
  qualifiedName?: string;
  filePath?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  
  // Type and signature information
  signature?: string; // Full function/method signature
  returnType?: string; // Return type for functions
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  parentSymbolId?: number; // Direct parent symbol relationship
  
  // Rich semantic information
  semanticTags?: string[]; // Cross-language semantic concepts
  confidence?: number; // Parser confidence in symbol detection
  isDefinition?: boolean; // True if this is the definition (not just declaration)
  
  // Multi-language support
  language?: string; // 'cpp', 'python', 'typescript', 'javascript'
  languageFeatures?: { // Language-specific features (stored as JSON in DB)
    isAsync?: boolean; // TypeScript/JavaScript async functions
    isExported?: boolean; // Exports from modules
    isStatic?: boolean; // Static methods/fields
    isAbstract?: boolean; // Abstract classes/methods
    decorators?: string[]; // Python/TypeScript decorators
    isReactComponent?: boolean; // TypeScript React components
    isReactHook?: boolean; // TypeScript React hooks
    spawn?: string; // Cross-language process spawning type
    spawnsPython?: boolean; // Indicates this function spawns Python
    spawnsCpp?: boolean; // Indicates this function spawns C++
    spawnTarget?: string; // Target language/script for spawning
    // C++ specific
    isTemplate?: boolean; // Template function/class
    templateParameters?: string[]; // Template parameter names
    isVirtual?: boolean; // Virtual method
    virtualMethods?: string[]; // List of virtual method names (for classes)
    isInline?: boolean; // Inline function
    hasCoroutineKeywords?: boolean; // Uses co_await, co_yield, co_return
    executionMode?: 'cpu' | 'gpu' | 'simd'; // Detected execution mode
    // TypeScript specific
    tsDecorators?: string[]; // TypeScript decorators
    genericConstraints?: string[]; // Generic type constraints
    // Python specific
    pythonDecorators?: string[]; // Python function decorators
    isAsyncGenerator?: boolean; // Python async generator
  };
  
  // Enhanced metrics and complexity
  metrics?: {
    loc?: number; // Lines of Code
    cyclomaticComplexity?: number; // Cyclomatic Complexity
    cognitiveComplexity?: number; // Cognitive complexity (nesting depth)
    callCount?: number; // How many times this is called
    crossLanguageCalls?: number; // Number of cross-language calls
    childCount?: number; // Number of child nodes (for group nodes)
    parameterCount?: number; // Number of function parameters
    nestingDepth?: number; // Maximum nesting depth
    controlStructures?: number; // Number of if/for/while/switch/try statements
    memberCount?: number; // Number of class members (for classes)
    templateComplexity?: number; // Complexity of template instantiation
    methodCount?: number; // Number of methods (for class containers)
    propertyCount?: number; // Number of properties (for class containers)
  };
  
  // Pattern detection results
  patterns?: {
    detectedPatterns?: string[]; // Design patterns detected (factory, observer, etc.)
    antiPatterns?: string[]; // Anti-patterns detected
    architecturalRole?: string; // Role in architecture (controller, service, model, etc.)
    codeSmells?: string[]; // Detected code smells
    
    // Enhanced pattern categorization
    primaryPattern?: {
      name: string; // Primary pattern name
      family: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'concurrency'; // Pattern family
      strength: number; // Confidence score 0-100
      role: 'creator' | 'consumer' | 'coordinator' | 'observer' | 'mediator' | 'subject'; // Node's role in pattern
      health: 'healthy' | 'warning' | 'problematic' | 'anti-pattern'; // Pattern implementation quality
    };
    
    secondaryPatterns?: Array<{
      name: string;
      family: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'concurrency';
      strength: number;
      role: string;
    }>;
    
    patternMetrics?: {
      patternComplexity?: number; // How complex this pattern implementation is
      patternConsistency?: number; // How consistent with standard pattern implementation (0-100)
      refactoringPriority?: 'none' | 'low' | 'medium' | 'high' | 'critical'; // Refactoring urgency
      evolutionStage?: 'emerging' | 'stable' | 'mature' | 'degrading' | 'legacy'; // Pattern lifecycle stage
    };
    
    patternRelationships?: Array<{
      relatedNodeId: string; // ID of related node in the same pattern
      relationshipType: 'collaborates' | 'creates' | 'observes' | 'mediates' | 'decorates'; // How nodes relate in pattern
      strength: number; // Strength of pattern relationship
    }>;
  };
  
  // Documentation and comments
  documentation?: {
    hasDocumentation?: boolean; // Has doc comments
    docString?: string; // Brief documentation excerpt
    parameterDocs?: Record<string, string>; // Parameter documentation
    returnDoc?: string; // Return value documentation
    examples?: string[]; // Code examples from docs
  };
  
  // Performance characteristics
  performance?: {
    estimatedComplexity?: 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n²)' | 'O(n!)' | 'unknown';
    memoryUsage?: 'low' | 'medium' | 'high' | 'unknown';
    isHotPath?: boolean; // Frequently called function
    hasAsyncOperations?: boolean; // Contains async/await operations
    hasFileIO?: boolean; // Contains file I/O operations
    hasNetworkCalls?: boolean; // Contains network operations
  };
  
  // Container node properties for hierarchical visualization
  containerType?: 'class' | 'namespace' | 'module';
  childNodes?: GraphNode[]; // Child nodes when acting as container
  aggregatedMethods?: Array<{
    id: string;
    name: string;
    type: string;
    visibility?: string;
    metrics?: any;
    isPublic?: boolean;
    complexity?: number;
  }>; // Simple methods shown as badges
  parentContainerId?: string; // Reference to parent container
  isVisible?: boolean; // Visibility state for child nodes
  
  // D3 simulation properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  isExpanded?: boolean; // New: To track expansion state of group nodes
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string; // 'calls', 'inherits', 'uses', 'includes', 'spawns', 'imports', 'instantiates', 'overrides'
  weight?: number;
  details?: string; // Enhanced tooltip information
  
  // Rich relationship context from database
  contextLine?: number; // Line number where relationship occurs
  contextColumn?: number; // Column number where relationship occurs
  contextSnippet?: string; // Code snippet showing the relationship
  confidence?: number; // Confidence in relationship detection (0.0 - 1.0)
  
  // Multi-language relationship properties
  isCrossLanguage?: boolean; // True if connecting different language nodes
  sourceLanguage?: string; // Language of source node
  targetLanguage?: string; // Language of target node
  spawnType?: 'process' | 'script' | 'module'; // Type of cross-language spawn
  bridgeType?: string; // How languages are bridged (FFI, subprocess, etc.)
  
  // Relationship semantics
  usagePattern?: string; // How the relationship is used (parameter, return, assignment, etc.)
  accessType?: 'read' | 'write' | 'readwrite' | 'execute'; // Type of access
  frequency?: number; // How often this relationship occurs
  isConditional?: boolean; // True if relationship only occurs under certain conditions
  
  // Performance implications
  performanceImpact?: 'none' | 'low' | 'medium' | 'high'; // Performance cost of relationship
  isAsynchronous?: boolean; // True for async calls
  hasErrorHandling?: boolean; // True if relationship has proper error handling
  
  // Template and generic relationships
  templateInstantiation?: {
    templateArgs?: string[]; // Template arguments for C++ instantiations
    genericConstraints?: string[]; // Generic type constraints
  };
  
  // Inheritance specific
  inheritanceDetails?: {
    accessSpecifier?: 'public' | 'private' | 'protected'; // C++ inheritance access
    isVirtual?: boolean; // Virtual inheritance
    overrideDetails?: string; // Method override information
  };
  
  // Metadata for rich visualization
  metadata?: {
    [key: string]: any; // Language-specific relationship metadata
  };
}

export interface Relationship {
  id: number;
  from_symbol_id: number;
  to_symbol_id: number;
  type: string;
  confidence: number;
  context?: string;
  contextLine?: number;
  contextColumn?: number;
  contextSnippet?: string;
  metadata?: Record<string, any>;
  
  // Enhanced fields from joins
  from_name?: string;
  from_qualified_name?: string;
  from_kind?: string;
  from_namespace?: string;
  from_language?: string;
  to_name?: string;
  to_qualified_name?: string;
  to_kind?: string;
  to_namespace?: string;
  to_language?: string;
  
  // Additional rich data fields
  from_file_path?: string;
  from_line?: number;
  from_column?: number;
  from_signature?: string;
  from_return_type?: string;
  from_visibility?: string;
  from_is_exported?: boolean;
  from_is_async?: boolean;
  from_is_abstract?: boolean;
  from_language_features?: string;
  from_semantic_tags?: string;
  from_confidence?: number;
  to_file_path?: string;
  to_line?: number;
  to_column?: number;
  to_signature?: string;
  to_return_type?: string;
  to_visibility?: string;
  to_is_exported?: boolean;
  to_is_async?: boolean;
  to_is_abstract?: boolean;
  to_language_features?: string;
  to_semantic_tags?: string;
  to_confidence?: number;
}

export interface SearchQuery {
  query: string;
  kind?: string;
  namespace?: string;
  limit?: number;
  offset?: number;
}

export interface Language {
  id: number;
  name: string;
  display_name: string;
  file_extensions: string;
  symbol_count: number;
}

export interface Project {
  id: number;
  name: string;
  display_name: string;
  description: string;
  root_path: string;
  metadata: string; // JSON string
  is_active: number; // SQLite boolean (0/1)  
  created_at: string;
  symbol_count: number;
}

export interface ProjectStats {
  symbolCount: number;
  namespaceCount: number;
  kindBreakdown: Record<string, number>;
  languageBreakdown: Record<string, number>;
}

export interface Namespace {
  namespace: string;
  symbol_count: number;
  kinds: string; // Comma-separated kinds
}

export interface Module {
  name: string;
  qualifiedName: string;
  namespace: string;
  kind: string;
  files: FileInfo[];
  imports: string[];
  symbolCount: number;
  symbolKinds: string[];
  children: Symbol[];
}