/**
 * Universal Types - Core types for multi-language symbol analysis
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
  isExported?: boolean;
  isAsync?: boolean;
  isAbstract?: boolean;
  
  // Language-specific features stored as JSON
  languageFeatures?: Record<string, any>;
  
  // Semantic tags for cross-language concepts
  semanticTags?: string[];
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
  
  // Functions and methods
  Function = 'function',
  Method = 'method',
  Constructor = 'constructor',
  Destructor = 'destructor',
  Operator = 'operator',
  
  // Variables and fields
  Variable = 'variable',
  Field = 'field',
  Property = 'property',
  Constant = 'constant',
  Parameter = 'parameter',
  
  // Namespaces and modules
  Namespace = 'namespace',
  Module = 'module',
  Package = 'package',
  
  // Import/Export
  Import = 'import',
  Export = 'export',
  
  // Other
  Macro = 'macro',
  Annotation = 'annotation',
  Label = 'label',
  Unknown = 'unknown'
}

/**
 * Relationship between symbols
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
 * Types of relationships between symbols
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
  Depends = 'depends',
  
  // Pattern relationships
  FactoryProduct = 'factory_product',
  ManagerManages = 'manager_manages',
  ObserverObserves = 'observer_observes'
}

/**
 * Detected pattern in code
 */
export interface DetectedPattern {
  id?: string;
  projectId: number;
  patternType: string;
  patternName?: string;
  description?: string;
  confidence: number;
  severity?: 'info' | 'warning' | 'error';
  
  // Detection metadata
  detectorName?: string;
  detectorVersion?: string;
  detectionTime?: Date;
  
  // Associated symbols
  symbolIds?: number[];
  
  // Suggestions for improvement
  suggestions?: string[];
  
  // Additional metadata
  metadata?: Record<string, any>;
}