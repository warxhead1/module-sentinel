/**
 * Type definitions for Code Flow Analysis
 * These types match the database schema and provide strong typing throughout
 */

// Database row types that match the actual schema
export interface UniversalSymbolRow {
  id: number;
  project_id: number;
  language_id: number;
  name: string;
  qualified_name: string;
  kind: string;
  file_path: string;
  line: number;
  column: number;
  end_line: number | null;
  end_column: number | null;
  return_type: string | null;
  signature: string | null;
  visibility: string | null;
  namespace: string | null;
  parent_symbol_id: number | null;
  is_exported: boolean;
  is_async: boolean;
  is_abstract: boolean;
  language_features: string | null;
  semantic_tags: string | null;
  confidence: number;
  created_at: string;
  updated_at: string | null;
}

export interface SymbolCallRow {
  id: number;
  caller_id: number;
  callee_id: number;
  line_number: number;
  column_number: number | null;
  call_type: string;
  condition: string | null;
  is_conditional: boolean;
  is_recursive: boolean;
  argument_types: string | null;
  created_at: string;
}

export interface CodeFlowPathRow {
  id: number;
  start_symbol_id: number;
  end_symbol_id: number | null;
  path_nodes: string;
  path_conditions: string | null;
  path_length: number;
  is_complete: boolean;
  is_cyclic: boolean;
  frequency: number;
  coverage: number;
  created_at: string;
}

export interface ControlFlowBlockRow {
  id: number;
  symbol_id: number;
  block_type: string;
  start_line: number;
  end_line: number;
  parent_block_id: number | null;
  condition: string | null;
  loop_type: string | null;
  complexity: number;
}

// API response types with joined data
export interface SymbolWithCallInfo extends UniversalSymbolRow {
  line_number: number;
  call_type: string;
  is_conditional: boolean;
  condition: string | null;
}

export interface SymbolCallWithCallee extends SymbolCallRow {
  callee_name: string;
  callee_kind: string;
}

export interface SymbolCallWithTarget extends SymbolCallRow {
  target_name: string;
}

// Transformed types for API responses
export interface CallGraphNode {
  id: number;
  name: string;
  qualified_name: string;
  kind: string;
  file_path: string;
  line_start: number;
  line_end: number | null;
  language_id: number;
  project_id: number;
  complexity?: number;
  call_count?: number;
}

export interface CallInfo {
  line_number: number;
  call_type: string;
  is_conditional: boolean;
  condition?: string | null;
}

export interface CallGraphNodeWithCallInfo extends CallGraphNode {
  call_info: CallInfo;
}

export interface ExecutionPath {
  id: number;
  start_symbol_id: number;
  end_symbol_id?: number;
  path_nodes: number[];
  path_conditions: string[];
  path_length: number;
  is_complete: boolean;
  is_cyclic: boolean;
  frequency: number;
  coverage: number;
}

export interface BranchTarget {
  target_id: number;
  target_name: string;
  line_number: number;
}

export interface BranchInfo {
  condition: string;
  targets: BranchTarget[];
  coverage: number;
}

export interface BranchAnalysis {
  symbol_id: number;
  branches: BranchInfo[];
  total_branches: number;
  covered_branches: number;
  unused_branches: string[];
}

export interface UnusedSymbol extends CallGraphNode {
  call_count?: number;
}

export interface FlowMetrics {
  total_functions: number;
  functions_with_calls: number;
  called_functions: number;
  total_calls: number;
  conditional_calls: number;
  recursive_calls: number;
  avg_calls_per_function: number;
}

export interface ComplexityDistribution {
  complexity_level: string;
  count: number;
}

export interface HotspotSymbol extends CallGraphNode {
  incoming_calls: number;
}

export interface BottleneckSymbol extends CallGraphNode {
  outgoing_calls: number;
}

export interface ControlFlow {
  symbol: UniversalSymbolRow;
  entry_point: number;
  exit_points: number[];
  blocks: ControlFlowBlockRow[];
  edges: Array<{
    from_line: number;
    to_symbol: string;
    type: string;
    condition: string | null;
    is_conditional: boolean;
  }>;
  loops: Array<{
    type: string | null;
    start_line: number;
    end_line: number;
    condition: string | null;
  }>;
  conditions: Array<{
    line: number;
    condition: string | null;
    true_branch: string;
    call_type: string;
  }>;
  exceptions: any[];
  dataFlowEdges?: Array<{
    from: number;
    to: number;
    type: string;
    variable: string | null;
  }>;
}

// Helper type for database query results
export interface DatabaseQueryResult<T> {
  rows: T[];
}