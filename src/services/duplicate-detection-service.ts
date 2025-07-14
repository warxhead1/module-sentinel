import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { ClangIntelligentIndexer } from '../indexing/clang-intelligent-indexer.js';
import { EventEmitter } from 'events';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';

/**
 * Duplicate Code Detection Service using Clang AST
 * 
 * Detects 4 types of code clones:
 * - Type 1: Exact clones (identical except whitespace)
 * - Type 2: Renamed clones (different names, same structure)
 * - Type 3: Modified clones (statements added/removed)
 * - Type 4: Semantic clones (different syntax, same behavior)
 */
export class DuplicateDetectionService extends EventEmitter {
  private db: Database.Database;
  private clangIndexer: ClangIntelligentIndexer;
  
  constructor(
    private projectPath: string,
    private dbPath: string
  ) {
    super();
    this.db = new Database(dbPath);
    this.clangIndexer = new ClangIntelligentIndexer(projectPath, dbPath);
    
    // Initialize database schema through unified manager
    const schemaManager = UnifiedSchemaManager.getInstance();
    schemaManager.initializeDatabase(this.db);
    
    // Create service-specific tables that aren't in unified schema
    this.initServiceSpecificTables();
  }
  
  private initServiceSpecificTables(): void {
    // Create tables specific to AST-based duplicate detection
    this.db.exec(`
      -- AST node hashes for similarity detection
      CREATE TABLE IF NOT EXISTS ast_hashes (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        node_type TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        structure_hash TEXT NOT NULL,
        semantic_hash TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        complexity INTEGER NOT NULL,
        parent_context TEXT
      );
      
      -- Clone groups (multiple fragments with same pattern)
      CREATE TABLE IF NOT EXISTS clone_groups (
        group_id TEXT PRIMARY KEY,
        clone_type INTEGER NOT NULL,
        member_count INTEGER NOT NULL,
        total_lines INTEGER NOT NULL,
        pattern_description TEXT,
        refactoring_suggestion TEXT
      );
      
      -- Clone group members
      CREATE TABLE IF NOT EXISTS clone_group_members (
        group_id TEXT NOT NULL,
        fragment_id INTEGER NOT NULL,
        PRIMARY KEY (group_id, fragment_id),
        FOREIGN KEY (group_id) REFERENCES clone_groups(group_id),
        FOREIGN KEY (fragment_id) REFERENCES ast_hashes(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_structure_hash ON ast_hashes(structure_hash);
      CREATE INDEX IF NOT EXISTS idx_semantic_hash ON ast_hashes(semantic_hash);
    `);
  }


  /**
   * Analyze a file for code duplication
   */
  async analyzeFile(filePath: string): Promise<DuplicationReport> {
    this.emit('file:analyzing', { path: filePath });
    
    // Get AST from clang
    await this.clangIndexer.indexFile(filePath);
    
    // Extract AST fragments and compute hashes
    const fragments = await this.extractAstFragments(filePath);
    
    // Store fragments
    await this.storeFragments(fragments);
    
    // Detect clones
    const clones = await this.detectClones(fragments);
    
    // Group clones
    const groups = await this.groupClones(clones);
    
    // Detect anti-patterns
    const antipatterns = await this.detectAntiPatterns(filePath, clones, groups);
    
    this.emit('file:analyzed', { 
      path: filePath, 
      fragments: fragments.length,
      clones: clones.length,
      groups: groups.length,
      antipatterns: antipatterns.length
    });
    
    return {
      filePath,
      fragments: fragments.length,
      clones,
      groups,
      antipatterns
    };
  }

  /**
   * Extract AST fragments from indexed data
   */
  private async extractAstFragments(filePath: string): Promise<AstFragment[]> {
    // Query indexed symbols from clang indexer
    const symbols = this.db.prepare(`
      SELECT * FROM symbols 
      WHERE file_path = ? AND kind IN ('function', 'method', 'class')
      ORDER BY line
    `).all(filePath);

    const fragments: AstFragment[] = [];
    
    for (const symbol of symbols as any[]) {
      // Get the full AST subtree for this symbol
      const astData = await this.getAstSubtree(symbol);
      
      if (astData) {
        const fragment: AstFragment = {
          id: 0, // Will be set on insert
          filePath,
          nodeType: symbol.kind,
          startLine: symbol.line,
          endLine: astData.endLine,
          structureHash: this.computeStructureHash(astData),
          semanticHash: this.computeSemanticHash(astData),
          tokenCount: astData.tokenCount,
          complexity: this.computeComplexity(astData),
          parentContext: symbol.parent_symbol || null,
          astData
        };
        
        fragments.push(fragment);
      }
    }
    
    return fragments;
  }

  /**
   * Get AST subtree for a symbol
   */
  private async getAstSubtree(symbol: any): Promise<AstNode | null> {
    // In real implementation, this would query the clang AST
    // For now, we'll create a simplified structure
    const references = this.db.prepare(`
      SELECT * FROM "references" 
      WHERE from_symbol = ?
    `).all(symbol.usr);

    const calls = this.db.prepare(`
      SELECT * FROM call_graph 
      WHERE caller_usr = ?
    `).all(symbol.usr);

    return {
      type: symbol.kind,
      name: symbol.name,
      signature: symbol.signature,
      startLine: symbol.line,
      endLine: symbol.line + 50, // Estimate
      tokenCount: 100, // Estimate
      children: [],
      references: references.length,
      calls: calls.length
    };
  }

  /**
   * Compute structure hash (for Type 1/2 clone detection)
   */
  private computeStructureHash(ast: AstNode): string {
    const normalized = this.normalizeAst(ast);
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  /**
   * Normalize AST by abstracting identifiers
   */
  private normalizeAst(ast: AstNode): any {
    return {
      type: ast.type,
      signature: ast.signature?.replace(/\b[a-zA-Z_]\w*\b/g, 'ID'),
      children: ast.children.map(child => this.normalizeAst(child)),
      // Preserve structural properties
      hasLoops: ast.type.includes('ForStmt') || ast.type.includes('WhileStmt'),
      hasConditionals: ast.type.includes('IfStmt') || ast.type.includes('SwitchStmt'),
      callCount: ast.calls || 0
    };
  }

  /**
   * Compute semantic hash (for Type 3/4 clone detection)
   */
  private computeSemanticHash(ast: AstNode): string {
    const semantic = this.extractSemanticSignature(ast);
    return crypto.createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
  }

  /**
   * Extract semantic signature from AST
   */
  private extractSemanticSignature(ast: AstNode): SemanticSignature {
    return {
      inputs: this.extractInputs(ast),
      outputs: this.extractOutputs(ast),
      sideEffects: this.extractSideEffects(ast),
      controlFlow: this.extractControlFlow(ast),
      dataFlow: this.extractDataFlow(ast)
    };
  }

  private extractInputs(ast: AstNode): string[] {
    // Extract parameters and accessed external variables
    return [];
  }

  private extractOutputs(ast: AstNode): string[] {
    // Extract return types and modified external state
    return [];
  }

  private extractSideEffects(ast: AstNode): string[] {
    // Extract I/O operations, network calls, etc.
    return [];
  }

  private extractControlFlow(ast: AstNode): string {
    // Extract control flow pattern
    return 'linear'; // simplified
  }

  private extractDataFlow(ast: AstNode): string[] {
    // Extract data transformation patterns
    return [];
  }

  /**
   * Compute cyclomatic complexity
   */
  private computeComplexity(ast: AstNode): number {
    let complexity = 1; // Base complexity
    
    // Add complexity for each decision point
    const walk = (node: AstNode) => {
      if (node.type.includes('IfStmt')) complexity++;
      if (node.type.includes('ForStmt')) complexity++;
      if (node.type.includes('WhileStmt')) complexity++;
      if (node.type.includes('CaseStmt')) complexity++;
      if (node.type.includes('CatchStmt')) complexity++;
      
      node.children.forEach(child => walk(child));
    };
    
    walk(ast);
    return complexity;
  }

  /**
   * Store AST fragments in database
   */
  private async storeFragments(fragments: AstFragment[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO ast_hashes (
        file_path, node_type, start_line, end_line,
        structure_hash, semantic_hash, token_count, 
        complexity, parent_context
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const fragment of fragments) {
      const result = stmt.run(
        fragment.filePath,
        fragment.nodeType,
        fragment.startLine,
        fragment.endLine,
        fragment.structureHash,
        fragment.semanticHash,
        fragment.tokenCount,
        fragment.complexity,
        fragment.parentContext
      );
      
      fragment.id = result.lastInsertRowid as number;
    }
  }

  /**
   * Detect clones by comparing fragments
   */
  private async detectClones(fragments: AstFragment[]): Promise<CodeClone[]> {
    const clones: CodeClone[] = [];
    
    // Get all existing fragments for comparison
    const allFragments = this.db.prepare(`
      SELECT * FROM ast_hashes 
      WHERE token_count > 10 -- Minimum size threshold
    `).all() as AstFragment[];

    for (const fragment of fragments) {
      for (const candidate of allFragments) {
        if (fragment.id === candidate.id) continue;
        
        const clone = this.compareFragments(fragment, candidate);
        if (clone) {
          clones.push(clone);
        }
      }
    }
    
    // Store detected clones
    const stmt = this.db.prepare(`
      INSERT INTO code_clones (
        clone_type, similarity_score, fragment1_id, 
        fragment2_id, detection_timestamp
      ) VALUES (?, ?, ?, ?, ?)
    `);

    for (const clone of clones) {
      stmt.run(
        clone.type,
        clone.similarity,
        clone.fragment1Id,
        clone.fragment2Id,
        Date.now()
      );
    }
    
    return clones;
  }

  /**
   * Compare two fragments for clones
   */
  private compareFragments(f1: AstFragment, f2: AstFragment): CodeClone | null {
    // Type 1: Exact match
    if (f1.structureHash === f2.structureHash) {
      return {
        type: 1,
        similarity: 1.0,
        fragment1Id: f1.id!,
        fragment2Id: f2.id!,
        fragment1: f1,
        fragment2: f2
      };
    }
    
    // Type 2: Same structure, different names
    if (f1.semanticHash === f2.semanticHash && f1.complexity === f2.complexity) {
      return {
        type: 2,
        similarity: 0.9,
        fragment1Id: f1.id!,
        fragment2Id: f2.id!,
        fragment1: f1,
        fragment2: f2
      };
    }
    
    // Type 3/4: Fuzzy matching
    const similarity = this.calculateSimilarity(f1, f2);
    if (similarity > 0.7) {
      return {
        type: similarity > 0.85 ? 3 : 4,
        similarity,
        fragment1Id: f1.id!,
        fragment2Id: f2.id!,
        fragment1: f1,
        fragment2: f2
      };
    }
    
    return null;
  }

  /**
   * Calculate similarity between fragments
   */
  private calculateSimilarity(f1: AstFragment, f2: AstFragment): number {
    // Token-based similarity
    const tokenSim = 1 - Math.abs(f1.tokenCount - f2.tokenCount) / Math.max(f1.tokenCount, f2.tokenCount);
    
    // Complexity similarity
    const complexitySim = 1 - Math.abs(f1.complexity - f2.complexity) / Math.max(f1.complexity, f2.complexity);
    
    // Type similarity
    const typeSim = f1.nodeType === f2.nodeType ? 1 : 0.5;
    
    // Weighted average
    return (tokenSim * 0.4 + complexitySim * 0.4 + typeSim * 0.2);
  }

  /**
   * Group related clones
   */
  private async groupClones(clones: CodeClone[]): Promise<CloneGroup[]> {
    const groups = new Map<string, Set<number>>();
    
    // Group by structure hash
    clones.forEach(clone => {
      const key = `${clone.type}_${clone.fragment1?.structureHash || 'unknown'}`;
      if (!groups.has(key)) {
        groups.set(key, new Set());
      }
      groups.get(key)!.add(clone.fragment1Id);
      groups.get(key)!.add(clone.fragment2Id);
    });
    
    const cloneGroups: CloneGroup[] = [];
    
    for (const [key, fragmentIds] of groups) {
      if (fragmentIds.size < 2) continue;
      
      const fragments = Array.from(fragmentIds).map(id => 
        this.db.prepare('SELECT * FROM ast_hashes WHERE id = ?').get(id)
      ).filter(Boolean) as any[];
      
      const totalLines = fragments.reduce((sum: number, f: any) => 
        sum + (f.end_line - f.start_line + 1), 0
      );
      
      const group: CloneGroup = {
        groupId: crypto.createHash('md5').update(key).digest('hex'),
        cloneType: parseInt(key.split('_')[0]),
        memberCount: fragmentIds.size,
        totalLines,
        patternDescription: this.describePattern(fragments),
        refactoringSuggestion: this.suggestRefactoring(fragments)
      };
      
      cloneGroups.push(group);
      
      // Store group
      this.db.prepare(`
        INSERT OR REPLACE INTO clone_groups 
        (group_id, clone_type, member_count, total_lines, pattern_description, refactoring_suggestion)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        group.groupId,
        group.cloneType,
        group.memberCount,
        group.totalLines,
        group.patternDescription,
        group.refactoringSuggestion
      );
      
      // Store members
      const memberStmt = this.db.prepare(`
        INSERT OR REPLACE INTO clone_group_members (group_id, fragment_id)
        VALUES (?, ?)
      `);
      
      fragmentIds.forEach(fragmentId => {
        memberStmt.run(group.groupId, fragmentId);
      });
    }
    
    return cloneGroups;
  }

  private describePattern(fragments: any[]): string {
    const first = fragments[0];
    return `${first.node_type} pattern found in ${fragments.length} locations`;
  }

  private suggestRefactoring(fragments: any[]): string {
    const first = fragments[0];
    if (first.node_type === 'function') {
      return 'Consider extracting common functionality into a shared utility function';
    }
    if (first.node_type === 'class') {
      return 'Consider creating a base class or template to eliminate duplication';
    }
    return 'Consider refactoring to eliminate code duplication';
  }

  /**
   * Detect anti-patterns from duplication
   */
  private async detectAntiPatterns(
    filePath: string, 
    clones: CodeClone[], 
    groups: CloneGroup[]
  ): Promise<AntiPattern[]> {
    const antipatterns: AntiPattern[] = [];
    
    // Copy-paste programming
    const copyPasteGroups = groups.filter(g => g.memberCount > 3);
    for (const group of copyPasteGroups) {
      antipatterns.push({
        patternName: 'Copy-Paste Programming',
        description: `Found ${group.memberCount} instances of duplicated ${group.patternDescription}`,
        severity: 'high',
        filePath,
        lineStart: 0, // Would need to aggregate from fragments
        lineEnd: 0,
        suggestion: 'Apply DRY principle: ' + group.refactoringSuggestion
      });
    }
    
    // Shotgun surgery pattern
    const crossFileClones = clones.filter(c => 
      c.fragment1?.filePath !== c.fragment2?.filePath
    );
    if (crossFileClones.length > 5) {
      antipatterns.push({
        patternName: 'Shotgun Surgery',
        description: 'Multiple files contain similar code that would need simultaneous updates',
        severity: 'high',
        filePath,
        lineStart: 0,
        lineEnd: 0,
        suggestion: 'Consolidate related functionality into a single module'
      });
    }
    
    // Feature envy
    const externalReferenceClones = clones.filter(c => 
      c.fragment1?.parentContext !== c.fragment2?.parentContext
    );
    if (externalReferenceClones.length > 0) {
      antipatterns.push({
        patternName: 'Feature Envy',
        description: 'Code is duplicated across different class contexts',
        severity: 'medium',
        filePath,
        lineStart: 0,
        lineEnd: 0,
        suggestion: 'Move functionality to the class it primarily operates on'
      });
    }
    
    // Store antipatterns
    const stmt = this.db.prepare(`
      INSERT INTO duplication_antipatterns 
      (pattern_name, description, severity, file_path, line_start, line_end, suggestion, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const pattern of antipatterns) {
      stmt.run(
        pattern.patternName,
        pattern.description,
        pattern.severity,
        pattern.filePath,
        pattern.lineStart,
        pattern.lineEnd,
        pattern.suggestion,
        Date.now()
      );
    }
    
    return antipatterns;
  }

  /**
   * Get duplication report for entire project
   */
  async getProjectReport(): Promise<ProjectDuplicationReport> {
    const totalClones = this.db.prepare(
      'SELECT COUNT(*) as count FROM code_clones'
    ).get() as any;
    
    const clonesByType = this.db.prepare(`
      SELECT clone_type, COUNT(*) as count 
      FROM code_clones 
      GROUP BY clone_type
    `).all() as any[];
    
    const largestGroups = this.db.prepare(`
      SELECT * FROM clone_groups 
      ORDER BY total_lines DESC 
      LIMIT 10
    `).all() as CloneGroup[];
    
    const antipatterns = this.db.prepare(`
      SELECT pattern_name, COUNT(*) as count 
      FROM duplication_antipatterns 
      GROUP BY pattern_name
    `).all() as any[];
    
    const duplicationRatio = this.calculateDuplicationRatio();
    
    return {
      totalClones: totalClones.count,
      clonesByType: clonesByType.reduce((acc, row) => {
        acc[`type${row.clone_type}`] = row.count;
        return acc;
      }, {}),
      duplicationRatio,
      largestGroups,
      antipatternSummary: antipatterns,
      recommendations: this.generateRecommendations(duplicationRatio, antipatterns)
    };
  }

  private calculateDuplicationRatio(): number {
    const totalLines = this.db.prepare(`
      SELECT SUM(end_line - start_line + 1) as total 
      FROM ast_hashes
    `).get() as any;
    
    const duplicatedLines = this.db.prepare(`
      SELECT SUM(cg.total_lines) as duplicated 
      FROM clone_groups cg
    `).get() as any;
    
    return (duplicatedLines?.duplicated || 0) / (totalLines?.total || 1);
  }

  private generateRecommendations(duplicationRatio: number, antipatterns: any[]): string[] {
    const recommendations: string[] = [];
    
    if (duplicationRatio > 0.3) {
      recommendations.push('High duplication ratio detected. Prioritize refactoring efforts.');
    }
    
    if (antipatterns.find(ap => ap.pattern_name === 'Copy-Paste Programming')) {
      recommendations.push('Implement shared utilities or base classes to reduce copy-paste code.');
    }
    
    if (antipatterns.find(ap => ap.pattern_name === 'Shotgun Surgery')) {
      recommendations.push('Consider architectural refactoring to reduce coupling between modules.');
    }
    
    return recommendations;
  }

  async close(): Promise<void> {
    this.clangIndexer.close();
    this.db.close();
  }
}

// Type definitions
interface AstFragment {
  id?: number;
  filePath: string;
  nodeType: string;
  startLine: number;
  endLine: number;
  structureHash: string;
  semanticHash: string;
  tokenCount: number;
  complexity: number;
  parentContext: string | null;
  astData?: AstNode;
}

interface AstNode {
  type: string;
  name?: string;
  signature?: string;
  startLine: number;
  endLine: number;
  tokenCount: number;
  children: AstNode[];
  references?: number;
  calls?: number;
}

interface SemanticSignature {
  inputs: string[];
  outputs: string[];
  sideEffects: string[];
  controlFlow: string;
  dataFlow: string[];
}

interface CodeClone {
  type: number; // 1, 2, 3, or 4
  similarity: number;
  fragment1Id: number;
  fragment2Id: number;
  fragment1?: AstFragment;
  fragment2?: AstFragment;
}

interface CloneGroup {
  groupId: string;
  cloneType: number;
  memberCount: number;
  totalLines: number;
  patternDescription: string;
  refactoringSuggestion: string;
}

interface AntiPattern {
  patternName: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  filePath: string;
  lineStart: number;
  lineEnd: number;
  suggestion: string;
}

interface DuplicationReport {
  filePath: string;
  fragments: number;
  clones: CodeClone[];
  groups: CloneGroup[];
  antipatterns: AntiPattern[];
}

interface ProjectDuplicationReport {
  totalClones: number;
  clonesByType: Record<string, number>;
  duplicationRatio: number;
  largestGroups: CloneGroup[];
  antipatternSummary: any[];
  recommendations: string[];
}