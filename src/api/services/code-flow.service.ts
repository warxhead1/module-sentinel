import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { 
  universalSymbols, 
  projects,
  symbolCalls,
  codeFlowPaths,
  controlFlowBlocks,
  dataFlowEdges
} from '../../database/drizzle/schema.js';
import { eq, and, or, sql, inArray, not, isNull } from 'drizzle-orm';
import type {
  UniversalSymbolRow,
  SymbolCallRow,
  CodeFlowPathRow,
  ControlFlowBlockRow,
  SymbolWithCallInfo,
  SymbolCallWithCallee,
  SymbolCallWithTarget,
  CallGraphNode,
  CallInfo,
  CallGraphNodeWithCallInfo,
  ExecutionPath,
  BranchInfo,
  BranchAnalysis,
  UnusedSymbol,
  FlowMetrics,
  ComplexityDistribution,
  HotspotSymbol,
  BottleneckSymbol,
  ControlFlow
} from '../types/code-flow.types.js';

export class CodeFlowService {
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;

  constructor(database: Database.Database) {
    this.db = database;
    this.drizzleDb = drizzle(database);
  }

  /**
   * Get call graph for a specific symbol
   */
  async getCallGraph(
    symbolId: number, 
    options: { 
      depth?: number; 
      direction?: 'incoming' | 'outgoing' | 'both';
      includeTransitive?: boolean;
    } = {}
  ) {
    const { depth = 1, direction = 'both', includeTransitive = false } = options;

    try {
      // Get the target symbol
      const targetSymbol = await this.drizzleDb.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.id, symbolId))
        .limit(1);

      if (!targetSymbol.length) {
        throw new Error('Symbol not found');
      }

      let callers: CallGraphNodeWithCallInfo[] = [];
      let callees: CallGraphNodeWithCallInfo[] = [];

      // Get callers (incoming calls)
      if (direction === 'incoming' || direction === 'both') {
        const callersQuery = this.db.prepare<[number], SymbolWithCallInfo>(`
          SELECT 
            s.*,
            sc.line_number,
            sc.call_type,
            sc.is_conditional,
            sc.condition
          FROM symbol_calls sc
          INNER JOIN universal_symbols s ON sc.caller_id = s.id
          WHERE sc.callee_id = ?
          ORDER BY sc.line_number
        `);

        const callerRows = callersQuery.all(symbolId);
        callers = callerRows.map(row => ({
          ...this.extractSymbolFields(row),
          call_info: {
            line_number: row.line_number,
            call_type: row.call_type,
            is_conditional: row.is_conditional,
            condition: row.condition
          }
        }));
      }

      // Get callees (outgoing calls)
      if (direction === 'outgoing' || direction === 'both') {
        const calleesQuery = this.db.prepare<[number], SymbolWithCallInfo>(`
          SELECT 
            s.*,
            sc.line_number,
            sc.call_type,
            sc.is_conditional,
            sc.condition
          FROM symbol_calls sc
          INNER JOIN universal_symbols s ON sc.callee_id = s.id
          WHERE sc.caller_id = ?
          ORDER BY sc.line_number
        `);

        const calleeRows = calleesQuery.all(symbolId);
        callees = calleeRows.map(row => ({
          ...this.extractSymbolFields(row),
          call_info: {
            line_number: row.line_number,
            call_type: row.call_type,
            is_conditional: row.is_conditional,
            condition: row.condition
          }
        }));
      }

      // If depth > 1 or includeTransitive, expand the graph
      if (depth > 1 || includeTransitive) {
        // This would require recursive queries or graph traversal
        // For now, just return immediate neighbors
      }

      return {
        target: targetSymbol[0],
        callers,
        callees,
        metrics: {
          incoming_calls: callers.length,
          outgoing_calls: callees.length,
          conditional_calls: callees.filter(c => c.call_info.is_conditional).length
        }
      };

    } catch (error) {
      throw new Error(`Failed to fetch call graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get execution paths from a starting symbol
   */
  async getExecutionPaths(
    startSymbolId: number,
    options: {
      endSymbolId?: number;
      maxPaths?: number;
      includeIncomplete?: boolean;
    } = {}
  ): Promise<ExecutionPath[]> {
    const { endSymbolId, maxPaths = 10, includeIncomplete = false } = options;

    try {
      // For now, use a simple approach - trace direct calls
      // In a full implementation, this would use graph algorithms
      const paths: ExecutionPath[] = [];
      
      // Get all direct call paths from the start symbol
      const visited = new Set<number>();
      const currentPath: number[] = [startSymbolId];
      const conditions: string[] = [];

      await this.traceExecutionPaths(
        startSymbolId,
        endSymbolId,
        currentPath,
        conditions,
        visited,
        paths,
        maxPaths,
        includeIncomplete
      );

      return paths;

    } catch (error) {
      throw new Error(`Failed to fetch execution paths: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get branch analysis for a symbol
   */
  async getBranchAnalysis(symbolId: number): Promise<BranchAnalysis> {
    try {
      // Get all conditional calls from this symbol
      const conditionalCallsQuery = this.db.prepare<[number], SymbolCallWithTarget>(`
        SELECT 
          sc.*,
          s.name as target_name
        FROM symbol_calls sc
        INNER JOIN universal_symbols s ON sc.callee_id = s.id
        WHERE sc.caller_id = ? AND sc.is_conditional = 1
        ORDER BY sc.condition, sc.line_number
      `);

      const conditionalCalls = conditionalCallsQuery.all(symbolId);

      // Group by condition
      const branchMap = new Map<string, BranchInfo>();
      
      for (const call of conditionalCalls) {
        const condition = call.condition || 'unknown';
        
        if (!branchMap.has(condition)) {
          branchMap.set(condition, {
            condition,
            targets: [],
            coverage: Math.random() * 100 // TODO: Calculate real coverage
          });
        }
        
        branchMap.get(condition)!.targets.push({
          target_id: call.callee_id,
          target_name: call.target_name,
          line_number: call.line_number
        });
      }

      const branches = Array.from(branchMap.values());
      const coveredBranches = branches.filter(b => b.coverage > 0);
      const unusedBranches = branches
        .filter(b => b.coverage === 0)
        .map(b => b.condition);

      return {
        symbol_id: symbolId,
        branches,
        total_branches: branches.length,
        covered_branches: coveredBranches.length,
        unused_branches: unusedBranches
      };

    } catch (error) {
      throw new Error(`Failed to fetch branch analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find unused code paths and functions
   */
  async findUnusedPaths(options: {
    projectId?: number;
    threshold?: number;
    excludePatterns?: string[];
  } = {}): Promise<{
    unused_symbols: UnusedSymbol[];
    rarely_used_symbols: UnusedSymbol[];
    statistics: {
      total_unused: number;
      total_rarely_used: number;
      by_kind: Record<string, number>;
    };
  }> {
    const { projectId, threshold = 0, excludePatterns = ['main%', 'test%', '%Test%'] } = options;

    try {
      // Build exclude conditions
      const excludeConditions = excludePatterns
        .map(() => 'AND s.name NOT LIKE ?')
        .join(' ');

      // Find symbols that are never called
      const unusedQuery = this.db.prepare<any[], UniversalSymbolRow>(`
        SELECT s.*
        FROM universal_symbols s
        WHERE s.kind IN ('function', 'method')
        ${projectId ? 'AND s.project_id = ?' : ''}
        AND NOT EXISTS (
          SELECT 1 FROM symbol_calls sc
          WHERE sc.callee_id = s.id
        )
        ${excludeConditions}
        ORDER BY s.file_path, s.line
        LIMIT 100
      `);

      const unusedParams = projectId ? [projectId, ...excludePatterns] : excludePatterns;
      const unusedRows = unusedQuery.all(...unusedParams);

      // Find rarely used symbols with proper typing
      interface RarelyUsedSymbol extends UniversalSymbolRow {
        call_count: number;
      }

      const rarelyUsedQuery = this.db.prepare<any[], RarelyUsedSymbol>(`
        SELECT 
          s.*,
          COUNT(sc.id) as call_count
        FROM universal_symbols s
        LEFT JOIN symbol_calls sc ON sc.callee_id = s.id
        WHERE s.kind IN ('function', 'method')
        ${projectId ? 'AND s.project_id = ?' : ''}
        ${excludeConditions}
        GROUP BY s.id
        HAVING COUNT(sc.id) <= ?
        ORDER BY call_count ASC, s.file_path, s.line
        LIMIT 100
      `);

      const rarelyUsedParams = projectId 
        ? [projectId, ...excludePatterns, threshold]
        : [...excludePatterns, threshold];
      const rarelyUsedRows = rarelyUsedQuery.all(...rarelyUsedParams);

      // Calculate statistics by kind
      const byKind: Record<string, number> = {};
      for (const symbol of [...unusedRows, ...rarelyUsedRows]) {
        byKind[symbol.kind] = (byKind[symbol.kind] || 0) + 1;
      }

      return {
        unused_symbols: unusedRows.map(s => this.extractSymbolFields(s)),
        rarely_used_symbols: rarelyUsedRows.map(s => ({
          ...this.extractSymbolFields(s),
          call_count: s.call_count
        })),
        statistics: {
          total_unused: unusedRows.length,
          total_rarely_used: rarelyUsedRows.length,
          by_kind: byKind
        }
      };

    } catch (error) {
      throw new Error(`Failed to find unused paths: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get control flow graph for a function
   */
  async getControlFlow(symbolId: number, options: {
    includeDataFlow?: boolean;
  } = {}): Promise<ControlFlow> {
    try {
      // Get the symbol
      const symbol = await this.drizzleDb.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.id, symbolId))
        .limit(1);

      if (!symbol.length) {
        throw new Error('Symbol not found');
      }

      // Get all calls within this function
      const internalCallsQuery = this.db.prepare<[number], SymbolCallWithCallee>(`
        SELECT 
          sc.*,
          COALESCE(sc.targetFunction, s.name) as callee_name,
          s.kind as callee_kind
        FROM symbol_calls sc
        LEFT JOIN universal_symbols s ON sc.callee_id = s.id
        WHERE sc.caller_id = ?
        ORDER BY sc.line_number
      `);

      const internalCalls = internalCallsQuery.all(symbolId);

      // Get control flow blocks if available
      const blocks = await this.drizzleDb.select()
        .from(controlFlowBlocks)
        .where(eq(controlFlowBlocks.symbolId, symbolId))
        .orderBy(controlFlowBlocks.startLine);

      // Build edges from calls
      const edges = internalCalls.map(call => ({
        from_line: call.line_number,
        to_symbol: call.callee_name,
        type: call.call_type,
        condition: call.condition,
        is_conditional: call.is_conditional
      }));

      // Extract conditions
      const conditions = internalCalls
        .filter(c => c.is_conditional)
        .map(c => ({
          line: c.line_number,
          condition: c.condition,
          true_branch: c.callee_name,
          call_type: c.call_type
        }));

      // Extract loops from blocks
      const loops = blocks
        .filter(b => b.blockType === 'loop')
        .map(b => ({
          type: b.loopType,
          start_line: b.startLine,
          end_line: b.endLine,
          condition: b.condition
        }));

      // Transform symbol from camelCase to snake_case
      const transformedSymbol: UniversalSymbolRow = {
        id: symbol[0].id,
        project_id: symbol[0].projectId,
        language_id: symbol[0].languageId,
        name: symbol[0].name,
        qualified_name: symbol[0].qualifiedName,
        kind: symbol[0].kind,
        file_path: symbol[0].filePath,
        line: symbol[0].line,
        column: symbol[0].column,
        end_line: symbol[0].endLine,
        end_column: symbol[0].endColumn,
        return_type: symbol[0].returnType,
        signature: symbol[0].signature,
        visibility: symbol[0].visibility,
        namespace: symbol[0].namespace,
        parent_symbol_id: symbol[0].parentSymbolId,
        is_exported: symbol[0].isExported ?? false,
        is_async: symbol[0].isAsync ?? false,
        is_abstract: symbol[0].isAbstract ?? false,
        language_features: typeof symbol[0].languageFeatures === 'string' ? symbol[0].languageFeatures : JSON.stringify(symbol[0].languageFeatures),
        semantic_tags: Array.isArray(symbol[0].semanticTags) ? symbol[0].semanticTags.join(',') : symbol[0].semanticTags,
        confidence: symbol[0].confidence ?? 1.0,
        created_at: symbol[0].createdAt ?? new Date().toISOString(),
        updated_at: symbol[0].updatedAt
      };

      // Transform blocks from camelCase to snake_case
      const transformedBlocks: ControlFlowBlockRow[] = blocks.map(b => ({
        id: b.id,
        symbol_id: b.symbolId,
        block_type: b.blockType,
        start_line: b.startLine,
        end_line: b.endLine,
        parent_block_id: b.parentBlockId,
        condition: b.condition,
        loop_type: b.loopType,
        complexity: b.complexity ?? 1
      }));

      return {
        symbol: transformedSymbol,
        entry_point: symbol[0].line,
        exit_points: [symbol[0].endLine || symbol[0].line], // TODO: Find all return statements
        blocks: transformedBlocks,
        edges,
        loops,
        conditions,
        exceptions: [] // TODO: Extract exception handlers
      };

    } catch (error) {
      throw new Error(`Failed to fetch control flow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze code complexity for a symbol
   */
  async analyzeComplexity(symbolId: number): Promise<{
    cyclomatic: number;
    cognitive: number;
    nestingDepth: number;
    halsteadMetrics: {
      vocabulary: number;
      length: number;
      difficulty: number;
      effort: number;
    };
  }> {
    try {
      // Get control flow blocks
      const blocks = await this.drizzleDb.select()
        .from(controlFlowBlocks)
        .where(eq(controlFlowBlocks.symbolId, symbolId));

      // Calculate cyclomatic complexity
      // CC = E - N + 2P where E = edges, N = nodes, P = connected components
      const edges = await this.drizzleDb.select()
        .from(dataFlowEdges)
        .where(or(
          eq(dataFlowEdges.sourceSymbolId, symbolId),
          eq(dataFlowEdges.targetSymbolId, symbolId)
        ));
      
      const cyclomatic = edges.length - blocks.length + 2;

      // Calculate cognitive complexity
      let cognitive = 0;
      let currentNesting = 0;
      const nestingStack: number[] = [];

      blocks.forEach(block => {
        if (block.blockType === 'condition' || block.blockType === 'loop') {
          cognitive += 1 + currentNesting;
          if (block.parentBlockId) {
            currentNesting++;
            nestingStack.push(currentNesting);
          }
        } else if (block.blockType === 'catch') {
          cognitive += 1;
        }
      });

      const nestingDepth = Math.max(...nestingStack, 0);

      // Halstead metrics (simplified estimation)
      const uniqueOperators = new Set(blocks.map(b => b.blockType)).size;
      const uniqueOperands = blocks.filter(b => b.condition).length;
      const vocabulary = uniqueOperators + uniqueOperands;
      const length = blocks.length * 2; // Rough estimate
      const difficulty = (uniqueOperators / 2) * (length / uniqueOperands || 1);
      const effort = difficulty * length;

      return {
        cyclomatic,
        cognitive,
        nestingDepth,
        halsteadMetrics: {
          vocabulary,
          length,
          difficulty: Math.round(difficulty),
          effort: Math.round(effort)
        }
      };
    } catch (error) {
      throw new Error(`Failed to analyze complexity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get execution hotspots for a project
   */
  async getExecutionHotspots(projectId: number, options: {
    limit?: number;
    minCalls?: number;
  } = {}): Promise<{
    hotspots: Array<{
      symbol: UniversalSymbolRow;
      metrics: {
        totalCalls: number;
        uniqueCallers: number;
        averageDepth: number;
        isBottleneck: boolean;
      };
    }>;
    criticalPaths: Array<{
      path: number[];
      frequency: number;
      totalComplexity: number;
    }>;
  }> {
    const { limit = 20, minCalls = 10 } = options;

    try {
      // Find most called functions
      const hotspotQuery = this.db.prepare<[number, number, number], any>(`
        SELECT 
          s.*,
          COUNT(DISTINCT sc.caller_id) as unique_callers,
          COUNT(sc.id) as total_calls
        FROM universal_symbols s
        LEFT JOIN symbol_calls sc ON s.id = sc.callee_id
        WHERE s.project_id = ?
        GROUP BY s.id
        HAVING total_calls >= ?
        ORDER BY total_calls DESC
        LIMIT ?
      `);

      const hotspots = hotspotQuery.all(projectId, minCalls, limit);

      // Transform to proper format
      const transformedHotspots = hotspots.map(hs => ({
        symbol: this.transformToSnakeCase(hs),
        metrics: {
          totalCalls: hs.total_calls,
          uniqueCallers: hs.unique_callers,
          averageDepth: 0, // Simplified for now
          isBottleneck: hs.unique_callers > 5 && hs.total_calls > 50
        }
      }));

      // Find critical execution paths
      const pathsQuery = this.db.prepare<[number], any>(`
        SELECT 
          path_signature,
          COUNT(*) as frequency,
          SUM(complexity_score) as total_complexity
        FROM code_flow_paths
        WHERE project_id = ?
        GROUP BY path_signature
        ORDER BY frequency DESC
        LIMIT 10
      `);

      const criticalPaths = pathsQuery.all(projectId).map(path => ({
        path: JSON.parse(path.path_signature || '[]'),
        frequency: path.frequency,
        totalComplexity: path.total_complexity || 0
      }));

      return {
        hotspots: transformedHotspots,
        criticalPaths
      };
    } catch (error) {
      throw new Error(`Failed to get execution hotspots: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private transformToSnakeCase(row: any): UniversalSymbolRow {
    return {
      id: row.id,
      project_id: row.projectId || row.project_id,
      language_id: row.languageId || row.language_id,
      name: row.name,
      qualified_name: row.qualifiedName || row.qualified_name,
      kind: row.kind,
      file_path: row.filePath || row.file_path,
      line: row.line,
      column: row.column,
      end_line: row.endLine || row.end_line,
      end_column: row.endColumn || row.end_column,
      return_type: row.returnType || row.return_type,
      signature: row.signature,
      visibility: row.visibility,
      namespace: row.namespace,
      parent_symbol_id: row.parentSymbolId || row.parent_symbol_id,
      is_exported: row.isExported ?? row.is_exported ?? false,
      is_async: row.isAsync ?? row.is_async ?? false,
      is_abstract: row.isAbstract ?? row.is_abstract ?? false,
      language_features: typeof row.languageFeatures === 'string' ? row.languageFeatures : 
                        typeof row.language_features === 'string' ? row.language_features :
                        JSON.stringify(row.languageFeatures || row.language_features || null),
      semantic_tags: Array.isArray(row.semanticTags) ? row.semanticTags.join(',') : 
                     Array.isArray(row.semantic_tags) ? row.semantic_tags.join(',') :
                     row.semanticTags || row.semantic_tags,
      confidence: row.confidence ?? 1.0,
      created_at: row.createdAt || row.created_at || new Date().toISOString(),
      updated_at: row.updatedAt || row.updated_at
    };
  }

  /**
   * Get aggregated flow metrics
   */
  async getFlowMetrics(projectId?: number): Promise<{
    summary: FlowMetrics;
    complexity_distribution: ComplexityDistribution[];
    hotspots: HotspotSymbol[];
    bottlenecks: BottleneckSymbol[];
  }> {
    try {
      // Get summary metrics
      const summaryQuery = this.db.prepare<any[], FlowMetrics>(`
        SELECT 
          COUNT(DISTINCT s.id) as total_functions,
          COUNT(DISTINCT sc.caller_id) as functions_with_calls,
          COUNT(DISTINCT sc.callee_id) as called_functions,
          COUNT(sc.id) as total_calls,
          COUNT(CASE WHEN sc.is_conditional THEN 1 END) as conditional_calls,
          COUNT(CASE WHEN sc.is_recursive THEN 1 END) as recursive_calls,
          AVG(subq.call_count) as avg_calls_per_function
        FROM universal_symbols s
        LEFT JOIN symbol_calls sc ON s.id = sc.caller_id
        LEFT JOIN (
          SELECT caller_id, COUNT(*) as call_count
          FROM symbol_calls
          GROUP BY caller_id
        ) subq ON s.id = subq.caller_id
        WHERE s.kind IN ('function', 'method')
        ${projectId ? 'AND s.project_id = ?' : ''}
      `);

      const summaryRow = projectId 
        ? summaryQuery.get(projectId)
        : summaryQuery.get();

      if (!summaryRow) {
        throw new Error('Failed to get flow metrics summary');
      }

      // Get complexity distribution
      const complexityQuery = this.db.prepare<any[], ComplexityDistribution>(`
        SELECT 
          CASE 
            WHEN COUNT(sc.id) = 0 THEN 'simple'
            WHEN COUNT(sc.id) < 5 THEN 'moderate'
            WHEN COUNT(sc.id) < 10 THEN 'complex'
            ELSE 'very_complex'
          END as complexity_level,
          COUNT(DISTINCT s.id) as count
        FROM universal_symbols s
        LEFT JOIN symbol_calls sc ON s.id = sc.caller_id
        WHERE s.kind IN ('function', 'method')
        ${projectId ? 'AND s.project_id = ?' : ''}
        GROUP BY complexity_level
      `);

      const complexityRows = projectId
        ? complexityQuery.all(projectId)
        : complexityQuery.all();

      // Find hotspots (most called functions)
      interface HotspotRow extends UniversalSymbolRow {
        incoming_calls: number;
      }

      const hotspotsQuery = this.db.prepare<any[], HotspotRow>(`
        SELECT 
          s.*,
          COUNT(sc.id) as incoming_calls
        FROM universal_symbols s
        INNER JOIN symbol_calls sc ON sc.callee_id = s.id
        WHERE s.kind IN ('function', 'method')
        ${projectId ? 'AND s.project_id = ?' : ''}
        GROUP BY s.id
        ORDER BY incoming_calls DESC
        LIMIT 10
      `);

      const hotspotRows = projectId
        ? hotspotsQuery.all(projectId)
        : hotspotsQuery.all();

      // Find bottlenecks (functions with many outgoing calls)
      interface BottleneckRow extends UniversalSymbolRow {
        outgoing_calls: number;
      }

      const bottlenecksQuery = this.db.prepare<any[], BottleneckRow>(`
        SELECT 
          s.*,
          COUNT(sc.id) as outgoing_calls
        FROM universal_symbols s
        INNER JOIN symbol_calls sc ON sc.caller_id = s.id
        WHERE s.kind IN ('function', 'method')
        ${projectId ? 'AND s.project_id = ?' : ''}
        GROUP BY s.id
        ORDER BY outgoing_calls DESC
        LIMIT 10
      `);

      const bottleneckRows = projectId
        ? bottlenecksQuery.all(projectId)
        : bottlenecksQuery.all();

      return {
        summary: summaryRow,
        complexity_distribution: complexityRows,
        hotspots: hotspotRows.map(h => ({
          ...this.extractSymbolFields(h),
          incoming_calls: h.incoming_calls
        })),
        bottlenecks: bottleneckRows.map(b => ({
          ...this.extractSymbolFields(b),
          outgoing_calls: b.outgoing_calls
        }))
      };

    } catch (error) {
      throw new Error(`Failed to fetch flow metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper method to trace execution paths recursively
   */
  private async traceExecutionPaths(
    currentSymbolId: number,
    targetSymbolId: number | undefined,
    currentPath: number[],
    conditions: string[],
    visited: Set<number>,
    paths: ExecutionPath[],
    maxPaths: number,
    includeIncomplete: boolean,
    depth: number = 0
  ): Promise<void> {
    if (paths.length >= maxPaths || depth > 10) {
      return;
    }

    // Check if we reached the target
    if (targetSymbolId && currentSymbolId === targetSymbolId) {
      paths.push({
        id: paths.length + 1,
        start_symbol_id: currentPath[0],
        end_symbol_id: targetSymbolId,
        path_nodes: [...currentPath],
        path_conditions: [...conditions],
        path_length: currentPath.length,
        is_complete: true,
        is_cyclic: false,
        frequency: 0,
        coverage: 0
      });
      return;
    }

    // Mark as visited
    visited.add(currentSymbolId);

    // Get all calls from current symbol
    const callsQuery = this.db.prepare<[number], SymbolCallRow>(`
      SELECT * FROM symbol_calls
      WHERE caller_id = ?
      ORDER BY line_number
    `);

    const calls = callsQuery.all(currentSymbolId);

    if (calls.length === 0 && includeIncomplete) {
      // Dead end - add incomplete path
      paths.push({
        id: paths.length + 1,
        start_symbol_id: currentPath[0],
        end_symbol_id: undefined,
        path_nodes: [...currentPath],
        path_conditions: [...conditions],
        path_length: currentPath.length,
        is_complete: false,
        is_cyclic: false,
        frequency: 0,
        coverage: 0
      });
    }

    // Explore each call
    for (const call of calls) {
      if (visited.has(call.callee_id)) {
        // Cycle detected
        if (includeIncomplete) {
          paths.push({
            id: paths.length + 1,
            start_symbol_id: currentPath[0],
            end_symbol_id: call.callee_id,
            path_nodes: [...currentPath, call.callee_id],
            path_conditions: [...conditions, call.condition || ''],
            path_length: currentPath.length + 1,
            is_complete: false,
            is_cyclic: true,
            frequency: 0,
            coverage: 0
          });
        }
        continue;
      }

      // Recurse
      currentPath.push(call.callee_id);
      if (call.condition) {
        conditions.push(call.condition);
      }

      await this.traceExecutionPaths(
        call.callee_id,
        targetSymbolId,
        currentPath,
        conditions,
        new Set(visited),
        paths,
        maxPaths,
        includeIncomplete,
        depth + 1
      );

      // Backtrack
      currentPath.pop();
      if (call.condition) {
        conditions.pop();
      }
    }
  }

  /**
   * Helper to extract symbol fields consistently
   */
  private extractSymbolFields(row: UniversalSymbolRow): CallGraphNode {
    return {
      id: row.id,
      name: row.name,
      qualified_name: row.qualified_name,
      kind: row.kind,
      file_path: row.file_path,
      line_start: row.line,
      line_end: row.end_line,
      language_id: row.language_id,
      project_id: row.project_id
    };
  }
}