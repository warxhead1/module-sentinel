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
  metrics?: { // New: Object for various metrics
    loc?: number; // Lines of Code
    cyclomaticComplexity?: number; // Cyclomatic Complexity
    // Add other static metrics as they become available from backend
  };
  // D3 simulation properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  isExpanded?: boolean; // New: To track expansion state of group nodes
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
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