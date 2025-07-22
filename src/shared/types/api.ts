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
  
  // Multi-language support
  language?: string; // 'cpp', 'python', 'typescript', 'javascript'
  languageFeatures?: { // Language-specific features
    isAsync?: boolean; // TypeScript/JavaScript async functions
    isExported?: boolean; // Exports from modules
    visibility?: 'public' | 'private' | 'protected'; // C++/TypeScript
    isStatic?: boolean; // Static methods/fields
    isAbstract?: boolean; // Abstract classes/methods
    decorators?: string[]; // Python/TypeScript decorators
    isReactComponent?: boolean; // TypeScript React components
    isReactHook?: boolean; // TypeScript React hooks
    spawn?: string; // Cross-language process spawning type
    spawnsPython?: boolean; // Indicates this function spawns Python
    spawnsCpp?: boolean; // Indicates this function spawns C++
    spawnTarget?: string; // Target language/script for spawning
  };
  
  metrics?: { // Enhanced metrics
    loc?: number; // Lines of Code
    cyclomaticComplexity?: number; // Cyclomatic Complexity
    callCount?: number; // How many times this is called
    crossLanguageCalls?: number; // Number of cross-language calls
    childCount?: number; // Number of child nodes (for group nodes)
    // Add other static metrics as they become available from backend
  };
  
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
  type: string; // 'calls', 'inherits', 'uses', 'includes', 'spawns', 'imports'
  weight?: number;
  details?: string; // Enhanced tooltip information
  
  // Multi-language relationship properties
  isCrossLanguage?: boolean; // True if connecting different language nodes
  sourceLanguage?: string; // Language of source node
  targetLanguage?: string; // Language of target node
  spawnType?: 'process' | 'script' | 'module'; // Type of cross-language spawn
  confidence?: number; // Confidence in relationship detection
}

export interface Relationship {
  id: number;
  from_symbol_id: number;
  to_symbol_id: number;
  type: string;
  confidence: number;
  context?: string;
}

export interface SearchQuery {
  query: string;
  kind?: string;
  namespace?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectStats {
  symbolCount: number;
  fileCount: number;
  namespaceCount: number;
  languageBreakdown: Record<string, number>;
  kindBreakdown: Record<string, number>;
}