import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import * as path from 'path';
import { PipelineStage } from '../types/index.js';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';

/**
 * Agent Context Preservation Service
 * 
 * Maintains contextual awareness for AI agents working on the codebase,
 * ensuring they understand the larger system while working on specific tasks.
 */
export class AgentContextService extends EventEmitter {
  private db: Database.Database;
  
  constructor(private dbPath: string) {
    super();
    this.db = new Database(dbPath);
    
    // Use unified schema manager for consistent database structure
    const schemaManager = UnifiedSchemaManager.getInstance();
    schemaManager.initializeDatabase(this.db);
    
    this.initDatabase();
    this.initEnhancedTables();
  }

  private initDatabase(): void {
    // All tables are now created by UnifiedSchemaManager
    // Initialize default constraints and rules
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    const defaultConstraints = [
      {
        id: 'no-cross-stage-vulkan',
        type: 'boundary',
        stage: null,
        description: 'Vulkan API calls should only be in rendering stage',
        level: 'strict'
      },
      {
        id: 'factory-pattern-consistency',
        type: 'pattern',
        stage: null,
        description: 'All pipeline creation must use PipelineFactory',
        level: 'strict'
      },
      {
        id: 'no-quality-regression',
        type: 'quality',
        stage: null,
        description: 'Code quality metrics should not decrease',
        level: 'warning'
      }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO execution_constraints 
      (constraint_id, constraint_type, stage, description, enforcement_level)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const constraint of defaultConstraints) {
      stmt.run(constraint.id, constraint.type, constraint.stage, constraint.description, constraint.level);
    }

    // Default guidance rules
    const defaultGuidance = [
      {
        id: 'use-pipeline-factory',
        name: 'Use Pipeline Factory Pattern',
        pattern: 'vkCreate.*Pipeline',
        stage: null,
        type: 'avoid',
        explanation: 'Direct Vulkan pipeline creation violates factory pattern. Use PipelineFactory instead.',
        good: 'auto pipeline = pipelineFactory.createComputePipeline(spec);',
        bad: 'vkCreateComputePipelines(device, cache, 1, &info, nullptr, &pipeline);'
      },
      {
        id: 'gpu-cpu-pairing',
        name: 'GPU/CPU Implementation Pairing',
        pattern: 'GPU.*Generator',
        stage: 'terrain_formation',
        type: 'require',
        explanation: 'Every GPU implementation should have a CPU fallback for compatibility.',
        good: 'class GPUHeightmapGenerator { /* GPU impl */ }\nclass CPUHeightmapGenerator { /* CPU fallback */ }',
        bad: 'class GPUHeightmapGenerator { /* No CPU alternative */ }'
      }
    ];

    const guidanceStmt = this.db.prepare(`
      INSERT OR IGNORE INTO guidance_rules 
      (rule_id, rule_name, pattern, stage, guidance_type, explanation, example_good, example_bad)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of defaultGuidance) {
      guidanceStmt.run(
        rule.id, rule.name, rule.pattern, rule.stage, 
        rule.type, rule.explanation, rule.good, rule.bad
      );
    }
  }

  private initEnhancedTables(): void {
    // Note: enhanced_symbols table is now created by UnifiedSchemaManager
    // No need to create it here anymore
    
    // Always create the additional tables needed by agent context services
    this.db.exec(`

      -- Agent-specific code clones table (renamed to avoid conflict with unified schema view)
      CREATE TABLE IF NOT EXISTS agent_code_clones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fragment1_id INTEGER NOT NULL,
        fragment2_id INTEGER NOT NULL,
        clone_type INTEGER NOT NULL, -- 1=exact, 2=renamed, 3=modified, 4=semantic
        similarity_score REAL NOT NULL,
        detected_at INTEGER NOT NULL,
        FOREIGN KEY (fragment1_id) REFERENCES ast_hashes(id),
        FOREIGN KEY (fragment2_id) REFERENCES ast_hashes(id)
      );

      -- AST hashes for clone detection
      CREATE TABLE IF NOT EXISTS ast_hashes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        fragment_hash TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        fragment_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Anti-patterns table for bad practice tracking
      CREATE TABLE IF NOT EXISTS duplication_antipatterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        pattern_name TEXT NOT NULL,
        description TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        severity TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        line_number INTEGER
      );

      -- Agent-specific references table for symbol usage tracking
      CREATE TABLE IF NOT EXISTS agent_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_symbol TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        kind TEXT NOT NULL
      );

      -- Class hierarchy table for compatibility
      CREATE TABLE IF NOT EXISTS class_hierarchy (
        child_class TEXT NOT NULL,
        parent_class TEXT NOT NULL,
        inheritance_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        PRIMARY KEY (child_class, parent_class)
      );

      -- Symbol relationships table for dependency tracking
      CREATE TABLE IF NOT EXISTS symbol_relationships (
        from_symbol TEXT NOT NULL,
        from_module TEXT NOT NULL,
        to_symbol TEXT NOT NULL,
        to_module TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY (from_symbol, from_module, to_symbol, to_module)
      );

      -- Note: enhanced_symbols indexes are created by UnifiedSchemaManager
      CREATE INDEX IF NOT EXISTS idx_agent_clones_type ON agent_code_clones(clone_type);
      CREATE INDEX IF NOT EXISTS idx_antipatterns_file ON duplication_antipatterns(file_path);
    `);
    
    // Populate enhanced_symbols from pattern-aware indexer data if available
    this.populateEnhancedSymbolsFromExisting();
  }

  private populateEnhancedSymbolsFromExisting(): void {
    try {
      // Check if enhanced_symbols table has data
      const enhancedCount = this.db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as { count: number } | undefined;
      
      if ((enhancedCount?.count || 0) > 0) {
        // Enhanced symbols already populated by PatternAwareIndexer
        console.log(`Using existing enhanced_symbols with ${enhancedCount?.count} symbols`);
        return;
      }
      
      console.log(`ℹ️  Enhanced symbols table is empty, may need indexing first`);
      
    } catch (error) {
      // Enhanced symbols table might not exist yet
      console.log(`ℹ️  Enhanced symbols table not available: ${(error as Error).message}`);
    }
  }

  /**
   * Start a new agent session
   */
  async startSession(
    agentName: string,
    taskDescription: string,
    targetFiles: string[]
  ): Promise<AgentSession> {
    const sessionId = this.generateSessionId();
    const stage = this.detectStageFromFiles(targetFiles);
    const qualityBefore = await this.calculateQualityScore(targetFiles);

    const session: AgentSession = {
      sessionId,
      agentName,
      taskDescription,
      architecturalStage: stage,
      startedAt: Date.now(),
      status: 'active',
      qualityScoreBefore: qualityBefore,
      context: await this.buildInitialContext(targetFiles, stage)
    };

    this.db.prepare(`
      INSERT INTO agent_sessions 
      (session_id, agent_name, task_description, architectural_stage, started_at, status, quality_score_before)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.sessionId,
      session.agentName,
      session.taskDescription,
      session.architecturalStage,
      session.startedAt,
      session.status,
      session.qualityScoreBefore
    );

    this.emit('session:started', session);
    return session;
  }

  /**
   * Build initial context for agent
   */
  private async buildInitialContext(
    targetFiles: string[],
    stage: string
  ): Promise<AgentContext> {
    // Get relevant constraints
    const constraints = this.db.prepare(`
      SELECT * FROM execution_constraints 
      WHERE active = 1 AND (stage = ? OR stage IS NULL)
    `).all(stage) as ExecutionConstraint[];

    // Get relevant guidance rules
    const guidanceRules = this.db.prepare(`
      SELECT * FROM guidance_rules 
      WHERE active = 1 AND (stage = ? OR stage IS NULL)
    `).all(stage) as GuidanceRule[];

    // Get architectural boundaries
    const boundaries = this.getArchitecturalBoundaries(stage);

    // Get recent antipatterns in this stage
    const recentAntipatterns = this.db.prepare(`
      SELECT DISTINCT pattern_name, description, suggestion 
      FROM duplication_antipatterns 
      WHERE file_path IN (${targetFiles.map(() => '?').join(',')})
      ORDER BY detected_at DESC 
      LIMIT 10
    `).all(...targetFiles);

    // Get related symbols and their quality scores
    const relatedSymbols = await this.getRelatedSymbols(targetFiles);

    return {
      stage,
      constraints,
      guidanceRules,
      boundaries,
      recentAntipatterns,
      relatedSymbols,
      safeModificationZones: this.identifySafeZones(targetFiles, relatedSymbols),
      suggestedPatterns: this.getSuggestedPatterns(stage)
    };
  }

  /**
   * Track a modification made by the agent
   */
  async trackModification(
    sessionId: string,
    symbolName: string,
    filePath: string,
    modificationType: 'added' | 'modified' | 'deleted',
    oldSignature?: string,
    newSignature?: string
  ): Promise<void> {
    this.db.prepare(`
      INSERT INTO session_modifications 
      (session_id, symbol_name, file_path, modification_type, 
       old_signature, new_signature, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      symbolName,
      filePath,
      modificationType,
      oldSignature,
      newSignature,
      Date.now()
    );

    // Check for boundary violations
    await this.checkBoundaryViolations(sessionId, symbolName, filePath);
    
    this.emit('modification:tracked', { sessionId, symbolName, modificationType });
  }

  /**
   * Check for architectural boundary violations
   */
  private async checkBoundaryViolations(
    sessionId: string,
    symbolName: string,
    filePath: string
  ): Promise<void> {
    // Note: architectural_stage not available in unified schema
    // Use 'unknown' as default stage for now
    const currentStage = 'unknown';
    
    // Check if symbol references cross-stage dependencies using unified schema
    const dependencies = this.db.prepare(`
      SELECT DISTINCT 
        to_s.file_path as to_file,
        to_s.name as to_symbol
      FROM symbol_relationships sr
      JOIN enhanced_symbols from_s ON sr.from_symbol_id = from_s.id
      JOIN enhanced_symbols to_s ON sr.to_symbol_id = to_s.id
      WHERE from_s.name = ? AND from_s.file_path = ?
    `).all(symbolName, filePath);

    for (const dep of dependencies as any[]) {
      const depStage = this.detectStageFromFiles([dep.to_file]);
      
      if (depStage !== currentStage) {
        const severity = this.assessCrossingSeverity(currentStage, depStage);
        const suggestion = this.suggestBoundaryFix(currentStage, depStage, dep.to_symbol);
        
        this.db.prepare(`
          INSERT INTO boundary_crossings 
          (session_id, from_stage, to_stage, symbol_name, 
           crossing_type, severity, suggestion, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          currentStage,
          depStage,
          symbolName,
          'dependency',
          severity,
          suggestion,
          Date.now()
        );
        
        if (severity === 'violation') {
          this.emit('boundary:violation', {
            sessionId,
            symbolName,
            fromStage: currentStage,
            toStage: depStage,
            suggestion
          });
        }
      }
    }
  }

  /**
   * Validate session results
   */
  async validateSession(sessionId: string): Promise<ValidationReport> {
    const validations: ValidationResult[] = [];
    
    // Get all modifications
    const modifications = this.db.prepare(`
      SELECT * FROM session_modifications WHERE session_id = ?
    `).all(sessionId);

    // Validate patterns
    for (const mod of modifications) {
      const patternValidations = await this.validatePatterns(mod);
      validations.push(...patternValidations);
    }

    // Validate boundaries
    const boundaryViolations = this.db.prepare(`
      SELECT * FROM boundary_crossings 
      WHERE session_id = ? AND severity = 'violation'
    `).all(sessionId);

    for (const violation of boundaryViolations as any[]) {
      validations.push({
        type: 'boundary',
        passed: false,
        message: `Architectural boundary violation: ${violation.from_stage} -> ${violation.to_stage}`,
        severity: 'error',
        filePath: violation.symbol_name,
        suggestion: violation.suggestion
      });
    }

    // Calculate quality after
    const session = this.db.prepare(
      'SELECT * FROM agent_sessions WHERE session_id = ?'
    ).get(sessionId) as any;

    const targetFiles = modifications.map((m: any) => m.file_path);
    const qualityAfter = await this.calculateQualityScore(targetFiles);

    // Update session using unified schema columns
    this.db.prepare(`
      UPDATE agent_sessions 
      SET end_time = ?, status = ?
      WHERE session_id = ?
    `).run(
      Math.floor(Date.now() / 1000), // Unix timestamp
      validations.every(v => v.passed) ? 'completed' : 'completed_with_issues',
      sessionId
    );

    // Store validation results
    const stmt = this.db.prepare(`
      INSERT INTO validation_results 
      (session_id, validation_type, passed, message, severity, file_path, line_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const validation of validations) {
      stmt.run(
        sessionId,
        validation.type,
        validation.passed ? 1 : 0,
        validation.message,
        validation.severity,
        validation.filePath,
        validation.lineNumber || null,
        Date.now()
      );
    }

    return {
      sessionId,
      validations,
      qualityDelta: qualityAfter - session.quality_score_before,
      passed: validations.every(v => v.passed),
      summary: this.generateValidationSummary(validations, qualityAfter - session.quality_score_before)
    };
  }

  /**
   * Get guidance for current context
   */
  async getContextualGuidance(
    sessionId: string,
    currentFile: string,
    proposedAction: string
  ): Promise<ContextualGuidance> {
    const session = this.db.prepare(
      'SELECT * FROM agent_sessions WHERE session_id = ?'
    ).get(sessionId) as any;

    // Get applicable rules
    const rules = this.db.prepare(`
      SELECT * FROM guidance_rules 
      WHERE active = 1 
      AND (stage = ? OR stage IS NULL)
      AND ? LIKE '%' || pattern || '%'
    `).all(session.architectural_stage, proposedAction) as GuidanceRule[];

    // Get recent similar modifications
    const similarMods = this.db.prepare(`
      SELECT * FROM session_modifications 
      WHERE file_path = ? 
      AND session_id != ?
      ORDER BY timestamp DESC 
      LIMIT 5
    `).all(currentFile, sessionId);

    // Check for potential issues
    const potentialIssues = await this.detectPotentialIssues(
      proposedAction,
      currentFile,
      session.architectural_stage
    );

    return {
      applicableRules: rules,
      similarModifications: similarMods,
      potentialIssues,
      recommendations: this.generateRecommendations(rules, potentialIssues),
      alternativeApproaches: this.suggestAlternatives(proposedAction, session.architectural_stage)
    };
  }

  /**
   * Calculate quality score for files
   */
  private async calculateQualityScore(files: string[]): Promise<number> {
    if (files.length === 0) return 0;

    // Get metrics from various sources
    const metricsQuery = `
      SELECT 
        AVG(complexity) as avg_complexity,
        COUNT(DISTINCT name) as symbol_count,
        SUM(CASE WHEN semantic_tags LIKE '%anti_pattern%' THEN 1 ELSE 0 END) as antipattern_count
      FROM enhanced_symbols 
      WHERE file_path IN (${files.map(() => '?').join(',')})
    `;

    const metrics = this.db.prepare(metricsQuery).get(...files) as any;

    // Get duplication ratio
    const duplicationQuery = `
      SELECT COUNT(*) as duplicate_count 
      FROM code_clones c
      JOIN ast_hashes a1 ON c.fragment1_id = a1.id
      JOIN ast_hashes a2 ON c.fragment2_id = a2.id
      WHERE a1.file_path IN (${files.map(() => '?').join(',')})
      OR a2.file_path IN (${files.map(() => '?').join(',')})
    `;

    const duplication = this.db.prepare(duplicationQuery).get(...files, ...files) as any;

    // Calculate composite score (0-100)
    const complexityScore = Math.max(0, 100 - (metrics.avg_complexity || 0) * 5);
    const antipatternScore = Math.max(0, 100 - (metrics.antipattern_count || 0) * 10);
    const duplicationScore = Math.max(0, 100 - (duplication.duplicate_count || 0) * 5);

    return (complexityScore + antipatternScore + duplicationScore) / 3;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectStageFromFiles(files: string[]): string {
    // Simplified stage detection based on file paths
    const stageCounts: Record<string, number> = {};
    
    for (const file of files) {
      const normalized = file.toLowerCase();
      let stage = 'unknown';
      
      if (normalized.includes('noise')) stage = 'noise_generation';
      else if (normalized.includes('terrain')) stage = 'terrain_formation';
      else if (normalized.includes('atmosphere')) stage = 'atmospheric_dynamics';
      else if (normalized.includes('geological')) stage = 'geological_processes';
      else if (normalized.includes('ecosystem')) stage = 'ecosystem_simulation';
      else if (normalized.includes('weather')) stage = 'weather_systems';
      else if (normalized.includes('render')) stage = 'final_rendering';
      
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }
    
    // Return most common stage
    return Object.entries(stageCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
  }

  private getArchitecturalBoundaries(stage: string): ArchitecturalBoundary[] {
    const boundaries: ArchitecturalBoundary[] = [
      {
        fromStage: 'terrain_formation',
        toStage: 'final_rendering',
        allowedDependencies: ['RenderData', 'Mesh', 'Texture'],
        forbiddenDependencies: ['VulkanDevice', 'Pipeline', 'CommandBuffer']
      },
      {
        fromStage: 'noise_generation',
        toStage: 'terrain_formation',
        allowedDependencies: ['NoiseGenerator', 'NoiseParameters'],
        forbiddenDependencies: ['TerrainOrchestrator', 'HeightmapGenerator']
      }
    ];
    
    return boundaries.filter(b => b.fromStage === stage || b.toStage === stage);
  }

  private async getRelatedSymbols(files: string[]): Promise<any[]> {
    if (files.length === 0) return [];
    
    return this.db.prepare(`
      SELECT DISTINCT s.* 
      FROM enhanced_symbols s
      WHERE s.file_path IN (${files.map(() => '?').join(',')})
      LIMIT 100
    `).all(...files);
  }

  private identifySafeZones(files: string[], symbols: any[]): SafeZone[] {
    const safeZones: SafeZone[] = [];
    
    // Methods with low complexity and no external dependencies are safe
    const safeMethods = symbols.filter(s => 
      s.complexity < 5 && 
      !s.semantic_tags?.includes('anti_pattern')
    );
    
    for (const method of safeMethods) {
      safeZones.push({
        file: method.file_path,
        startLine: method.line,
        endLine: method.line + 50, // Approximate
        reason: 'Low complexity method with no antipatterns',
        confidence: 0.9
      });
    }
    
    return safeZones;
  }

  private getSuggestedPatterns(stage: string): SuggestedPattern[] {
    const patterns: SuggestedPattern[] = [
      {
        name: 'Factory Pattern',
        applicableFor: ['object creation', 'pipeline setup'],
        example: 'Use PipelineFactory for creating Vulkan pipelines',
        benefits: ['Centralized creation logic', 'Easier testing', 'Consistent initialization']
      },
      {
        name: 'RAII Pattern',
        applicableFor: ['resource management', 'GPU resources'],
        example: 'Wrap Vulkan resources in RAII containers',
        benefits: ['Automatic cleanup', 'Exception safety', 'No resource leaks']
      }
    ];
    
    return patterns;
  }

  private assessCrossingSeverity(fromStage: string, toStage: string): string {
    // Define allowed crossings
    const allowedCrossings = new Set([
      'noise_generation->terrain_formation',
      'terrain_formation->final_rendering',
      'atmospheric_dynamics->weather_systems'
    ]);
    
    const crossing = `${fromStage}->${toStage}`;
    
    if (allowedCrossings.has(crossing)) return 'allowed';
    
    // Check for reverse dependencies (always bad)
    const reverseCrossings = new Set([
      'final_rendering->terrain_formation',
      'terrain_formation->noise_generation'
    ]);
    
    if (reverseCrossings.has(crossing)) return 'violation';
    
    return 'warning';
  }

  private suggestBoundaryFix(fromStage: string, toStage: string, symbol: string): string {
    if (fromStage === 'terrain_formation' && toStage === 'final_rendering') {
      return `Consider using an interface or data transfer object instead of directly accessing ${symbol}`;
    }
    
    return `Review architectural boundaries between ${fromStage} and ${toStage}`;
  }

  private async validatePatterns(modification: any): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // Check against guidance rules
    const rules = this.db.prepare(
      'SELECT * FROM guidance_rules WHERE active = 1'
    ).all() as GuidanceRule[];
    
    for (const rule of rules) {
      if (modification.new_signature?.match(new RegExp(rule.pattern))) {
        if (rule.guidance_type === 'avoid') {
          results.push({
            type: 'pattern',
            passed: false,
            message: rule.explanation,
            severity: 'error',
            filePath: modification.file_path,
            suggestion: rule.example_good
          });
        }
      }
    }
    
    return results;
  }

  private generateValidationSummary(validations: ValidationResult[], qualityDelta: number): string {
    const failed = validations.filter(v => !v.passed);
    const summary: string[] = [];
    
    if (failed.length === 0) {
      summary.push('All validations passed successfully.');
    } else {
      summary.push(`${failed.length} validation(s) failed.`);
      
      const byType = failed.reduce((acc, v) => {
        acc[v.type] = (acc[v.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      for (const [type, count] of Object.entries(byType)) {
        summary.push(`- ${count} ${type} issue(s)`);
      }
    }
    
    if (qualityDelta > 0) {
      summary.push(`Code quality improved by ${qualityDelta.toFixed(2)} points.`);
    } else if (qualityDelta < 0) {
      summary.push(`⚠️ Code quality decreased by ${Math.abs(qualityDelta).toFixed(2)} points.`);
    }
    
    return summary.join('\n');
  }

  private async detectPotentialIssues(
    action: string,
    file: string,
    stage: string
  ): Promise<PotentialIssue[]> {
    const issues: PotentialIssue[] = [];
    
    // Check for common problematic patterns
    if (action.includes('vkCreate') && !file.includes('Factory')) {
      issues.push({
        type: 'pattern_violation',
        description: 'Direct Vulkan object creation outside of factory',
        severity: 'high',
        suggestion: 'Use appropriate factory class for Vulkan object creation'
      });
    }
    
    if (action.includes('new ') && action.includes('[]')) {
      issues.push({
        type: 'memory_management',
        description: 'Raw array allocation detected',
        severity: 'medium',
        suggestion: 'Consider using std::vector or std::array'
      });
    }
    
    return issues;
  }

  private generateRecommendations(
    rules: GuidanceRule[],
    issues: PotentialIssue[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (rules.some(r => r.guidance_type === 'avoid')) {
      recommendations.push('Review and refactor to comply with architectural patterns');
    }
    
    if (issues.some(i => i.severity === 'high')) {
      recommendations.push('Address high-severity issues before proceeding');
    }
    
    return recommendations;
  }

  private suggestAlternatives(action: string, stage: string): string[] {
    const alternatives: string[] = [];
    
    if (action.includes('vkCreateGraphicsPipelines')) {
      alternatives.push('pipelineFactory.createGraphicsPipeline(spec)');
      alternatives.push('pipelineBuilder.withShaders(...).build()');
    }
    
    if (action.includes('malloc') || action.includes('new ')) {
      alternatives.push('std::make_unique<T>()');
      alternatives.push('std::make_shared<T>()');
      alternatives.push('Stack allocation if size is known');
    }
    
    return alternatives;
  }

  close(): void {
    this.db.close();
  }
}

// Type definitions
interface AgentSession {
  sessionId: string;
  agentName: string;
  taskDescription: string;
  architecturalStage: string;
  startedAt: number;
  completedAt?: number;
  status: string;
  qualityScoreBefore: number;
  qualityScoreAfter?: number;
  context?: AgentContext;
}

interface AgentContext {
  stage: string;
  constraints: ExecutionConstraint[];
  guidanceRules: GuidanceRule[];
  boundaries: ArchitecturalBoundary[];
  recentAntipatterns: any[];
  relatedSymbols: any[];
  safeModificationZones: SafeZone[];
  suggestedPatterns: SuggestedPattern[];
}

interface ExecutionConstraint {
  constraint_id: string;
  constraint_type: string;
  stage: string | null;
  description: string;
  enforcement_level: string;
}

interface GuidanceRule {
  rule_id: string;
  rule_name: string;
  pattern: string;
  stage: string | null;
  guidance_type: string;
  explanation: string;
  example_good?: string;
  example_bad?: string;
}

interface ArchitecturalBoundary {
  fromStage: string;
  toStage: string;
  allowedDependencies: string[];
  forbiddenDependencies: string[];
}

interface SafeZone {
  file: string;
  startLine: number;
  endLine: number;
  reason: string;
  confidence: number;
}

interface SuggestedPattern {
  name: string;
  applicableFor: string[];
  example: string;
  benefits: string[];
}

interface ValidationResult {
  type: string;
  passed: boolean;
  message: string;
  severity: string;
  filePath?: string;
  lineNumber?: number;
  suggestion?: string;
}

interface ValidationReport {
  sessionId: string;
  validations: ValidationResult[];
  qualityDelta: number;
  passed: boolean;
  summary: string;
}

interface ContextualGuidance {
  applicableRules: GuidanceRule[];
  similarModifications: any[];
  potentialIssues: PotentialIssue[];
  recommendations: string[];
  alternativeApproaches: string[];
}

interface PotentialIssue {
  type: string;
  description: string;
  severity: string;
  suggestion: string;
}