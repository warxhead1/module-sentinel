/**
 * C++ specific types and interfaces
 */

import { SymbolInfo, RelationshipInfo, PatternInfo } from "../parser-types.js";
import { VisitorContext } from "../../unified-ast-visitor.js";
import { ResolutionContext } from "../../../analysis/symbol-resolution-cache.js";

export interface CppVisitorContext extends VisitorContext {
  // C++-specific context
  templateDepth: number;
  insideExportBlock: boolean;
  currentAccessLevel: "public" | "private" | "protected";
  usingDeclarations: Map<string, string>;
  resolutionContext: ResolutionContext;
  
  // Template context
  currentTemplateParameters?: string[];
  templateSpecializations?: Map<string, any>;
  
  // Class/struct context
  currentClassScope?: string;
  accessLevels: Map<string, "public" | "private" | "protected">;
  
  // Module context (C++20)
  currentModule?: string;
  moduleExports?: Set<string>;
  moduleImports?: Set<string>;
}

export interface CppSymbolMetadata {
  // Memory management
  isPointer?: boolean;
  isReference?: boolean;
  isConst?: boolean;
  isVolatile?: boolean;
  isConstexpr?: boolean;
  isMutable?: boolean;
  
  // Function features
  isVirtual?: boolean;
  isPureVirtual?: boolean;
  isOverride?: boolean;
  isFinal?: boolean;
  isDeleted?: boolean;
  isDefaulted?: boolean;
  isNoexcept?: boolean;
  isInline?: boolean;
  isExplicit?: boolean;
  
  // Constructor/Destructor
  isConstructor?: boolean;
  isDestructor?: boolean;
  isCopyConstructor?: boolean;
  isMoveConstructor?: boolean;
  isCopyAssignment?: boolean;
  isMoveAssignment?: boolean;
  
  // Template features
  isTemplate?: boolean;
  templateParameters?: string[];
  templateSpecialization?: Record<string, any>;
  isTemplateSpecialization?: boolean;
  
  // Module features (C++20)
  moduleName?: string;
  isModuleInterface?: boolean;
  isModuleImplementation?: boolean;
  isModulePartition?: boolean;
  
  // Concepts (C++20)
  requiresConcepts?: string[];
  conceptDefinition?: string;
  
  // Inheritance
  baseClasses?: Array<{
    name: string;
    accessLevel: "public" | "private" | "protected";
    isVirtual: boolean;
  }>;
  derivedClasses?: string[];
  
  // Members (for classes/structs)
  members?: Array<{
    name: string;
    type: string;
    defaultValue?: string;
    line: number;
    accessLevel: "public" | "private" | "protected";
  }>;
  
  // Additional features
  storageClass?: "static" | "extern" | "thread_local";
  linkageType?: "internal" | "external" | "none";
  callingConvention?: string;
  attributes?: string[];
  
  // Coroutines (C++20)
  isCoroutine?: boolean;
  coroutineType?: "generator" | "task" | "awaitable";
  
  // Lambda expressions
  isLambda?: boolean;
  captureList?: string[];
  
  // RAII and resource management
  isRAII?: boolean;
  managedResources?: string[];
  
  // Performance hints
  isHotPath?: boolean;
  isConstexprEvaluated?: boolean;
  
  // Documentation
  doxygen?: {
    brief?: string;
    detailed?: string;
    params?: Array<{ name: string; description: string }>;
    returns?: string;
    throws?: string[];
  };
}

export interface CppRelationshipMetadata {
  // Call relationships
  isVirtualCall?: boolean;
  isTemplateCall?: boolean;
  isOperatorOverload?: boolean;
  
  // Inheritance relationships
  inheritanceType?: "public" | "private" | "protected";
  isVirtualInheritance?: boolean;
  
  // Template relationships
  templateInstantiation?: Record<string, string>;
  
  // Friend relationships
  isFriend?: boolean;
  friendType?: "class" | "function";
  
  // Access patterns
  accessPattern?: "read" | "write" | "read_write";
  isConstAccess?: boolean;
  isMutableAccess?: boolean;
  
  // Memory operations
  isAllocation?: boolean;
  isDeallocation?: boolean;
  allocationStrategy?: "stack" | "heap" | "static";
  
  // Exception handling
  isThrowingCall?: boolean;
  exceptionTypes?: string[];
  
  // Concurrency
  isThreadSafe?: boolean;
  requiresSynchronization?: boolean;
  
  // Optimization hints
  isInlinable?: boolean;
  isConstexprEvaluable?: boolean;
}

export interface CppParseResult {
  symbols: SymbolInfo[];
  relationships: RelationshipInfo[];
  patterns: PatternInfo[];
  controlFlowData: { blocks: any[]; calls: any[] };
  stats: {
    nodesVisited: number;
    symbolsExtracted: number;
    complexityChecks: number;
    controlFlowAnalyzed: number;
    templatesProcessed?: number;
    namespacesProcessed?: number;
    classesProcessed?: number;
    functionsProcessed?: number;
    patternParseTimeMs?: number;
  };
  
  // C++ specific results
  cppMetadata?: {
    namespaces: string[];
    templates: Array<{
      name: string;
      parameters: string[];
      specializations: number;
    }>;
    modules?: Array<{
      name: string;
      type: "interface" | "implementation" | "partition";
      exports: string[];
    }>;
    concepts?: Array<{
      name: string;
      requirements: string[];
    }>;
    includes: Array<{
      path: string;
      isSystem: boolean;
      isConditional: boolean;
    }>;
  };
}

export interface CppParsingOptions {
  // Language version
  cppStandard?: "cpp11" | "cpp14" | "cpp17" | "cpp20" | "cpp23";
  
  // Parser settings
  enableModules?: boolean;
  enableConcepts?: boolean;
  enableCoroutines?: boolean;
  
  // Analysis depth
  analyzeTemplateInstantiations?: boolean;
  analyzeMemoryPatterns?: boolean;
  analyzePerformanceHints?: boolean;
  
  // Preprocessing
  preprocessorDefinitions?: Map<string, string>;
  includePaths?: string[];
  
  // Performance
  maxTemplateDepth?: number;
  maxRecursionDepth?: number;
  
  // Feature toggles
  extractDocumentation?: boolean;
  analyzeRAII?: boolean;
  detectAntiPatterns?: boolean;
}

export interface CppWorkItem {
  filePath: string;
  content: string;
  options: CppParsingOptions;
  priority: number;
  timestamp: number;
  dependsOn?: string[];
}

export interface CppWorkerResult {
  workItem: CppWorkItem;
  result: CppParseResult;
  error?: Error;
  processingTime: number;
  memoryUsed: number;
  workerId: number;
}

// Enums for C++ specific constructs
export enum CppSymbolKind {
  CLASS = "class",
  STRUCT = "struct",
  UNION = "union",
  ENUM = "enum",
  ENUM_CLASS = "enum_class",
  FUNCTION = "function",
  METHOD = "method",
  CONSTRUCTOR = "constructor",
  DESTRUCTOR = "destructor",
  OPERATOR = "operator",
  VARIABLE = "variable",
  FIELD = "field",
  NAMESPACE = "namespace",
  TYPEDEF = "typedef",
  USING = "using",
  TEMPLATE = "template",
  CONCEPT = "concept",
  MODULE = "module",
  LAMBDA = "lambda",
  MACRO = "macro"
}

export enum CppRelationshipKind {
  CALLS = "calls",
  INHERITS = "inherits",
  USES = "uses",
  INCLUDES = "includes",
  INSTANTIATES = "instantiates",
  SPECIALIZES = "specializes",
  OVERRIDES = "overrides",
  OVERLOADS = "overloads",
  FRIENDS = "friends",
  CONTAINS = "contains",
  DEPENDS_ON = "depends_on",
  THROWS = "throws",
  CATCHES = "catches",
  ALLOCATES = "allocates",
  DEALLOCATES = "deallocates"
}

export enum CppAccessLevel {
  PUBLIC = "public",
  PRIVATE = "private",
  PROTECTED = "protected"
}