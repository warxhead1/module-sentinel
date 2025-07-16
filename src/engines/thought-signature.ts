import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { ArchitecturalDecision, ThoughtPattern } from '../types/index.js';

import { CleanUnifiedSchemaManager } from '../database/clean-unified-schema.js';

export interface AgentFeedback {
  sessionId: string;
  agentName: string;
  feedbackType: 'tool_failure' | 'missing_context' | 'success' | 'clarification_needed';
  toolName?: string;
  toolParams?: any;
  expectedOutcome?: string;
  actualOutcome?: string;
  errorMessage?: string;
  resolution?: string;
  confidence?: number;
}

export interface ContextGap {
  sessionId: string;
  missingContextType: 'symbol_info' | 'file_relationship' | 'architectural_pattern' | 'dependency' | 'usage_example';
  description: string;
  requestedByAgent: string;
  contextQuery?: string;
  resolutionStatus?: 'pending' | 'resolved' | 'workaround' | 'not_available';
  resolutionMethod?: string;
  resolvedContext?: any;
  timeToResolution?: number;
}

export interface LearningPattern {
  patternType: 'tool_usage' | 'context_retrieval' | 'error_recovery' | 'optimization';
  description: string;
  triggerConditions: any;
  successfulApproach: any;
  failureApproaches?: any[];
  successRate?: number;
  confidenceScore?: number;
}

export class ThoughtSignaturePreserver {
  private db: Database.Database;
  private schemaManager: CleanUnifiedSchemaManager;

  constructor(db: Database.Database) {
    this.db = db;
    this.schemaManager = CleanUnifiedSchemaManager.getInstance();
    this.schemaManager.initializeDatabase(this.db);
    console.log('ThoughtSignaturePreserver initialized successfully with shared DB.');
  }

  recordDecision(decision: ArchitecturalDecision): void {

    const encryptedContext = this.encrypt(JSON.stringify({
      decision,
      systemState: this.captureSystemState()
    }));

    const stmt = this.db.prepare(`
      INSERT INTO architectural_decisions 
      (type, module, decision, reasoning, timestamp, impact, encrypted_context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      decision.type,
      decision.module,
      decision.decision,
      decision.reasoning,
      decision.timestamp,
      JSON.stringify(decision.impact),
      encryptedContext
    );

    // Also record as thought pattern
    this.recordThoughtPattern({
      id: crypto.randomUUID(),
      timestamp: decision.timestamp,
      decision: decision.decision,
      reasoning: decision.reasoning,
      context: { type: decision.type, module: decision.module }
    });
  }

  recordThoughtPattern(pattern: ThoughtPattern): void {
    if (!this.db) throw new Error('Database not initialized');

    const patternHash = this.hashPattern(pattern);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO thought_patterns 
      (id, timestamp, decision, reasoning, context, pattern_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.id,
      pattern.timestamp,
      pattern.decision,
      pattern.reasoning,
      JSON.stringify(pattern.context),
      patternHash
    );
  }

  async retrieveDecisions(module: string, limit: number = 10): Promise<ArchitecturalDecision[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM architectural_decisions 
      WHERE module = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    const rows = stmt.all(module, limit) as any[];

    return rows.map(row => ({
      type: row.type,
      module: row.module,
      decision: row.decision,
      reasoning: row.reasoning,
      timestamp: row.timestamp,
      impact: JSON.parse(row.impact)
    }));
  }

  async findSimilarPatterns(context: Record<string, any>, limit: number = 5): Promise<ThoughtPattern[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Simple similarity based on context keys
    const contextKeys = Object.keys(context).sort().join(',');
    
    const stmt = this.db.prepare(`
      SELECT * FROM thought_patterns 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    const rows = stmt.all(limit * 2) as any[];

    // Filter and rank by similarity
    const patterns = rows
      .map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        decision: row.decision,
        reasoning: row.reasoning,
        context: JSON.parse(row.context)
      }))
      .filter(pattern => {
        const patternKeys = Object.keys(pattern.context).sort().join(',');
        return patternKeys === contextKeys;
      })
      .slice(0, limit);

    return patterns;
  }

  async getInsights(module: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const decisions = await this.retrieveDecisions(module, 100);
    
    const insights = {
      totalDecisions: decisions.length,
      decisionTypes: {} as Record<string, number>,
      commonPatterns: [] as string[],
      evolutionTimeline: [] as any[]
    };

    // Analyze decision types
    for (const decision of decisions) {
      insights.decisionTypes[decision.type] = (insights.decisionTypes[decision.type] || 0) + 1;
    }

    // Find common reasoning patterns
    const reasoningMap = new Map<string, number>();
    for (const decision of decisions) {
      const key = decision.reasoning.toLowerCase().split(' ').slice(0, 5).join(' ');
      reasoningMap.set(key, (reasoningMap.get(key) || 0) + 1);
    }

    insights.commonPatterns = Array.from(reasoningMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);

    // Build evolution timeline
    const timelineMap = new Map<number, any>();
    for (const decision of decisions) {
      const day = Math.floor(decision.timestamp / (24 * 60 * 60 * 1000));
      if (!timelineMap.has(day)) {
        timelineMap.set(day, {
          date: new Date(day * 24 * 60 * 60 * 1000),
          decisions: 0,
          types: new Set()
        });
      }
      const entry = timelineMap.get(day)!;
      entry.decisions++;
      entry.types.add(decision.type);
    }

    insights.evolutionTimeline = Array.from(timelineMap.values())
      .map(entry => ({
        date: entry.date,
        decisions: entry.decisions,
        types: Array.from(entry.types)
      }));

    return insights;
  }

  private captureSystemState(): any {
    return {
      memory: process.memoryUsage(),
      timestamp: Date.now(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  private deriveEncryptionKey(): Buffer {
    // In production, this should use a secure key management system
    const secret = process.env.MODULE_SENTINEL_KEY || 'module-sentinel-default-key';
    return crypto.scryptSync(secret, 'salt', 32);
  }

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.deriveEncryptionKey(), iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(data: string): string {
    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.deriveEncryptionKey(), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private hashPattern(pattern: ThoughtPattern): string {
    const data = JSON.stringify({
      decision: pattern.decision,
      reasoning: pattern.reasoning,
      contextKeys: Object.keys(pattern.context).sort()
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Record feedback from agents about tool failures or missing context
   */
  async recordAgentFeedback(feedback: AgentFeedback): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO agent_feedback 
      (session_id, agent_name, timestamp, feedback_type, tool_name, 
       tool_params, expected_outcome, actual_outcome, error_message, 
       resolution, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      feedback.sessionId,
      feedback.agentName,
      Date.now(),
      feedback.feedbackType,
      feedback.toolName || null,
      feedback.toolParams ? JSON.stringify(feedback.toolParams) : null,
      feedback.expectedOutcome || null,
      feedback.actualOutcome || null,
      feedback.errorMessage || null,
      feedback.resolution || null,
      feedback.confidence || 0.0
    );

    // If this is a tool failure, check if we have a pattern for recovery
    if (feedback.feedbackType === 'tool_failure' && feedback.toolName) {
      await this.analyzeToolFailurePattern(feedback);
    }
  }

  /**
   * Record missing context identified by agents
   */
  async recordContextGap(gap: ContextGap): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO context_gaps 
      (session_id, timestamp, missing_context_type, description, 
       requested_by_agent, context_query, resolution_status, 
       resolution_method, resolved_context, time_to_resolution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      gap.sessionId,
      Date.now(),
      gap.missingContextType,
      gap.description,
      gap.requestedByAgent,
      gap.contextQuery || null,
      gap.resolutionStatus || 'pending',
      gap.resolutionMethod || null,
      gap.resolvedContext ? JSON.stringify(gap.resolvedContext) : null,
      gap.timeToResolution || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Record successful resolution of a context gap
   */
  async recordResolution(gapId: number, resolution: {
    method: string;
    context: any;
    timeToResolution: number;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE context_gaps 
      SET resolution_status = 'resolved',
          resolution_method = ?,
          resolved_context = ?,
          time_to_resolution = ?
      WHERE id = ?
    `);

    stmt.run(
      resolution.method,
      JSON.stringify(resolution.context),
      resolution.timeToResolution,
      gapId
    );

    // Learn from this resolution
    await this.learnFromResolution(gapId, resolution);
  }

  /**
   * Analyze patterns in tool failures to suggest improvements
   */
  private async analyzeToolFailurePattern(feedback: AgentFeedback): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check for similar failures
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count, 
             GROUP_CONCAT(DISTINCT resolution) as resolutions
      FROM agent_feedback
      WHERE tool_name = ? 
        AND feedback_type = 'tool_failure'
        AND error_message LIKE ?
      GROUP BY tool_name
    `);

    const similarFailures = stmt.get(
      feedback.toolName,
      `%${feedback.errorMessage?.substring(0, 50)}%`
    ) as any;

    if (similarFailures && similarFailures.count > 3) {
      // We have a pattern - record it
      await this.recordLearningPattern({
        patternType: 'tool_usage',
        description: `Recurring failure with ${feedback.toolName}`,
        triggerConditions: {
          tool: feedback.toolName,
          errorPattern: feedback.errorMessage
        },
        successfulApproach: {
          resolutions: similarFailures.resolutions?.split(',').filter(Boolean) || []
        },
        confidenceScore: Math.min(similarFailures.count / 10, 1.0)
      });
    }
  }

  /**
   * Record a learning pattern from successful resolutions
   */
  async recordLearningPattern(pattern: LearningPattern): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const patternSignature = this.hashLearningPattern(pattern);

    // Check if pattern already exists
    const existing = this.db.prepare(`
      SELECT id, usage_count, success_rate 
      FROM learning_patterns 
      WHERE pattern_signature = ?
    `).get(patternSignature) as any;

    if (existing) {
      // Update existing pattern
      this.db.prepare(`
        UPDATE learning_patterns 
        SET usage_count = usage_count + 1,
            last_used = ?,
            confidence_score = ?
        WHERE id = ?
      `).run(Date.now(), pattern.confidenceScore || 0, existing.id);
    } else {
      // Insert new pattern
      this.db.prepare(`
        INSERT INTO learning_patterns 
        (pattern_type, pattern_signature, description, trigger_conditions,
         successful_approach, failure_approaches, success_rate, usage_count,
         last_used, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        pattern.patternType,
        patternSignature,
        pattern.description,
        JSON.stringify(pattern.triggerConditions),
        JSON.stringify(pattern.successfulApproach),
        pattern.failureApproaches ? JSON.stringify(pattern.failureApproaches) : null,
        pattern.successRate || 0,
        1,
        Date.now(),
        pattern.confidenceScore || 0
      );
    }
  }

  /**
   * Learn from successful context gap resolutions
   */
  private async learnFromResolution(gapId: number, resolution: any): Promise<void> {
    const gap = this.db.prepare(`
      SELECT * FROM context_gaps WHERE id = ?
    `).get(gapId) as any;

    if (!gap) return;

    // Create a learning pattern from this resolution
    await this.recordLearningPattern({
      patternType: 'context_retrieval',
      description: `Successful resolution of ${gap.missing_context_type}`,
      triggerConditions: {
        contextType: gap.missing_context_type,
        query: gap.context_query
      },
      successfulApproach: {
        method: resolution.method,
        timeToResolution: resolution.timeToResolution
      },
      successRate: 1.0,
      confidenceScore: 0.8
    });

    // Create a context recommendation for future use
    this.db.prepare(`
      INSERT INTO context_recommendations
      (context_type, trigger_pattern, recommended_context, rationale, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      gap.missing_context_type,
      gap.context_query || gap.description,
      JSON.stringify(resolution.context),
      `Successful resolution method: ${resolution.method}`,
      gap.requested_by_agent
    );
  }

  private hashLearningPattern(pattern: LearningPattern): string {
    const data = JSON.stringify({
      type: pattern.patternType,
      triggers: pattern.triggerConditions,
      approach: pattern.successfulApproach
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get enhanced context based on historical patterns and feedback
   */
  async getEnhancedContext(sessionId: string, contextType: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    // 1. Get relevant learning patterns
    const patterns = this.db.prepare(`
      SELECT * FROM learning_patterns
      WHERE pattern_type = 'context_retrieval'
        AND trigger_conditions LIKE ?
      ORDER BY success_rate DESC, usage_count DESC
      LIMIT 5
    `).all(`%${contextType}%`) as any[];

    // 2. Get recent successful resolutions for similar context
    const recentResolutions = this.db.prepare(`
      SELECT resolved_context, resolution_method, time_to_resolution
      FROM context_gaps
      WHERE missing_context_type = ?
        AND resolution_status = 'resolved'
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(contextType) as any[];

    // 3. Get context recommendations
    const recommendations = this.db.prepare(`
      SELECT * FROM context_recommendations
      WHERE context_type = ?
      ORDER BY success_rate DESC, usage_count DESC
      LIMIT 5
    `).all(contextType) as any[];

    // 4. Get related architectural decisions
    const decisions = await this.retrieveDecisions('', 10);

    // 5. Compile enhanced context
    const enhancedContext = {
      sessionId,
      contextType,
      patterns: patterns.map(p => ({
        ...p,
        triggerConditions: JSON.parse(p.trigger_conditions),
        successfulApproach: JSON.parse(p.successful_approach)
      })),
      recentResolutions: recentResolutions.map(r => ({
        context: r.resolved_context ? JSON.parse(r.resolved_context) : null,
        method: r.resolution_method,
        timeToResolution: r.time_to_resolution
      })),
      recommendations: recommendations.map(r => ({
        ...r,
        recommendedContext: JSON.parse(r.recommended_context)
      })),
      relatedDecisions: decisions,
      metadata: {
        timestamp: Date.now(),
        confidence: this.calculateContextConfidence(patterns, recentResolutions)
      }
    };

    return enhancedContext;
  }

  /**
   * Suggest what context might be missing based on patterns
   */
  async suggestMissingContext(sessionId: string, currentContext: any): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const suggestions: string[] = [];

    // 1. Check common context gaps for this session type
    const commonGaps = this.db.prepare(`
      SELECT missing_context_type, COUNT(*) as frequency
      FROM context_gaps
      WHERE resolution_status = 'resolved'
      GROUP BY missing_context_type
      ORDER BY frequency DESC
      LIMIT 5
    `).all() as any[];

    // 2. Check what context types are typically needed together
    const relatedContext = this.db.prepare(`
      SELECT c1.missing_context_type as type1, c2.missing_context_type as type2
      FROM context_gaps c1
      JOIN context_gaps c2 ON c1.session_id = c2.session_id
      WHERE c1.id != c2.id
        AND c1.resolution_status = 'resolved'
        AND c2.resolution_status = 'resolved'
      GROUP BY type1, type2
      HAVING COUNT(*) > 3
    `).all() as any[];

    // 3. Generate suggestions
    commonGaps.forEach(gap => {
      if (!currentContext[gap.missing_context_type]) {
        suggestions.push(`Consider adding ${gap.missing_context_type} context (needed in ${gap.frequency} cases)`);
      }
    });

    // Add related context suggestions
    const contextTypes = Object.keys(currentContext);
    relatedContext.forEach(rel => {
      if (contextTypes.includes(rel.type1) && !contextTypes.includes(rel.type2)) {
        suggestions.push(`When using ${rel.type1}, ${rel.type2} is often also needed`);
      }
    });

    return suggestions;
  }

  /**
   * Get related decisions and patterns for a given context
   */
  async getRelatedDecisions(query: string, limit: number = 10): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    // Search in architectural decisions
    const decisions = this.db.prepare(`
      SELECT * FROM architectural_decisions
      WHERE decision LIKE ? OR reasoning LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as any[];

    // Search in thought patterns
    const patterns = this.db.prepare(`
      SELECT * FROM thought_patterns
      WHERE decision LIKE ? OR reasoning LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as any[];

    // Search in learning patterns
    const learningPatterns = this.db.prepare(`
      SELECT * FROM learning_patterns
      WHERE description LIKE ?
      ORDER BY success_rate DESC, usage_count DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as any[];

    return {
      decisions: decisions.map(d => ({
        ...d,
        impact: JSON.parse(d.impact)
      })),
      thoughtPatterns: patterns.map(p => ({
        ...p,
        context: JSON.parse(p.context)
      })),
      learningPatterns: learningPatterns.map(p => ({
        ...p,
        triggerConditions: JSON.parse(p.trigger_conditions),
        successfulApproach: JSON.parse(p.successful_approach)
      }))
    };
  }

  /**
   * Start a feedback loop for continuous improvement
   */
  async startFeedbackLoop(loopId: string, initialContext: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare(`
      INSERT INTO feedback_loops
      (loop_id, start_time, initial_context, agent_sessions)
      VALUES (?, ?, ?, ?)
    `).run(
      loopId,
      Date.now(),
      JSON.stringify(initialContext),
      JSON.stringify([])
    );
  }

  /**
   * Update feedback loop with improvements
   */
  async updateFeedbackLoop(loopId: string, improvements: any[], metrics: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const loop = this.db.prepare(`
      SELECT * FROM feedback_loops WHERE loop_id = ?
    `).get(loopId) as any;

    if (!loop) return;

    const currentImprovements = loop.improvements_made ? 
      JSON.parse(loop.improvements_made) : [];
    
    this.db.prepare(`
      UPDATE feedback_loops
      SET improvements_made = ?,
          metrics_after = ?,
          end_time = ?
      WHERE loop_id = ?
    `).run(
      JSON.stringify([...currentImprovements, ...improvements]),
      JSON.stringify(metrics),
      Date.now(),
      loopId
    );
  }

  /**
   * Calculate confidence score for enhanced context
   */
  private calculateContextConfidence(patterns: any[], resolutions: any[]): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on pattern success rates
    if (patterns.length > 0) {
      const avgSuccessRate = patterns.reduce((sum, p) => sum + p.success_rate, 0) / patterns.length;
      confidence += avgSuccessRate * 0.3;
    }

    // Increase confidence based on recent successful resolutions
    if (resolutions.length > 0) {
      confidence += Math.min(resolutions.length / 10, 0.2);
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Analyze patterns to identify improvement opportunities
   */
  async analyzePatterns(sessionId?: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    // 1. Analyze tool failure patterns
    const toolFailures = this.db.prepare(`
      SELECT tool_name, feedback_type, COUNT(*) as failure_count,
             AVG(confidence) as avg_confidence
      FROM agent_feedback
      WHERE feedback_type = 'tool_failure'
      ${sessionId ? 'AND session_id = ?' : ''}
      GROUP BY tool_name, feedback_type
      ORDER BY failure_count DESC
    `).all(sessionId ? [sessionId] : []) as any[];

    // 2. Analyze context gap patterns
    const contextGaps = this.db.prepare(`
      SELECT missing_context_type, resolution_status,
             COUNT(*) as gap_count,
             AVG(time_to_resolution) as avg_resolution_time
      FROM context_gaps
      ${sessionId ? 'WHERE session_id = ?' : ''}
      GROUP BY missing_context_type, resolution_status
      ORDER BY gap_count DESC
    `).all(sessionId ? [sessionId] : []) as any[];

    // 3. Analyze learning pattern effectiveness
    const patternEffectiveness = this.db.prepare(`
      SELECT pattern_type, AVG(success_rate) as avg_success_rate,
             SUM(usage_count) as total_usage,
             AVG(confidence_score) as avg_confidence
      FROM learning_patterns
      GROUP BY pattern_type
      ORDER BY avg_success_rate DESC
    `).all() as any[];

    // 4. Identify recurring issues
    const recurringIssues = this.db.prepare(`
      SELECT feedback_type, error_message, COUNT(*) as occurrence_count
      FROM agent_feedback
      WHERE error_message IS NOT NULL
      ${sessionId ? 'AND session_id = ?' : ''}
      GROUP BY feedback_type, error_message
      HAVING occurrence_count > 2
      ORDER BY occurrence_count DESC
    `).all(sessionId ? [sessionId] : []) as any[];

    // 5. Calculate improvement metrics
    const improvementMetrics = await this.calculateImprovementMetrics(sessionId);

    return {
      toolFailures,
      contextGaps,
      patternEffectiveness,
      recurringIssues,
      improvementMetrics,
      recommendations: this.generateImprovementRecommendations({
        toolFailures,
        contextGaps,
        patternEffectiveness,
        recurringIssues
      })
    };
  }

  /**
   * Calculate improvement metrics over time
   */
  private async calculateImprovementMetrics(sessionId?: string): Promise<any> {
    const timeWindows = [
      { name: 'last_24h', hours: 24 },
      { name: 'last_week', hours: 168 },
      { name: 'last_month', hours: 720 }
    ];

    const metrics: any = {};

    for (const window of timeWindows) {
      const cutoff = Date.now() - (window.hours * 60 * 60 * 1000);

      // Success rate over time
      const successRate = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN feedback_type = 'success' THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM agent_feedback
        WHERE timestamp > ?
        ${sessionId ? 'AND session_id = ?' : ''}
      `).get(sessionId ? [cutoff, sessionId] : [cutoff]) as any;

      // Context gap resolution rate
      const resolutionRate = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN resolution_status = 'resolved' THEN 1 END) * 100.0 / COUNT(*) as resolution_rate
        FROM context_gaps
        WHERE timestamp > ?
        ${sessionId ? 'AND session_id = ?' : ''}
      `).get(sessionId ? [cutoff, sessionId] : [cutoff]) as any;

      metrics[window.name] = {
        successRate: successRate?.success_rate || 0,
        resolutionRate: resolutionRate?.resolution_rate || 0
      };
    }

    return metrics;
  }

  /**
   * Generate improvement recommendations based on pattern analysis
   */
  private generateImprovementRecommendations(analysis: any): string[] {
    const recommendations: string[] = [];

    // Tool failure recommendations
    if (analysis.toolFailures.length > 0) {
      const topFailure = analysis.toolFailures[0];
      if (topFailure.failure_count > 5) {
        recommendations.push(
          `Tool '${topFailure.tool_name}' has failed ${topFailure.failure_count} times. Consider reviewing its implementation or providing better context.`
        );
      }
    }

    // Context gap recommendations
    const unresolvedGaps = analysis.contextGaps.filter((g: any) => 
      g.resolution_status === 'pending' && g.gap_count > 3
    );
    if (unresolvedGaps.length > 0) {
      recommendations.push(
        `There are ${unresolvedGaps.length} types of context gaps that remain unresolved. Focus on providing ${unresolvedGaps[0].missing_context_type} context.`
      );
    }

    // Pattern effectiveness recommendations
    const lowPerformingPatterns = analysis.patternEffectiveness.filter((p: any) => 
      p.avg_success_rate < 0.5 && p.total_usage > 5
    );
    if (lowPerformingPatterns.length > 0) {
      recommendations.push(
        `Pattern type '${lowPerformingPatterns[0].pattern_type}' has low success rate (${(lowPerformingPatterns[0].avg_success_rate * 100).toFixed(1)}%). Consider revising the approach.`
      );
    }

    // Recurring issues recommendations
    if (analysis.recurringIssues.length > 0) {
      const topIssue = analysis.recurringIssues[0];
      recommendations.push(
        `Error '${topIssue.error_message.substring(0, 50)}...' has occurred ${topIssue.occurrence_count} times. Create a specific pattern to handle this.`
      );
    }

    return recommendations;
  }

  /**
   * Get feedback statistics for reporting
   */
  async getFeedbackStats(sessionId?: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const stats = {
      totalFeedback: 0,
      feedbackByType: {} as Record<string, number>,
      contextGapStats: {
        total: 0,
        resolved: 0,
        pending: 0,
        avgResolutionTime: 0
      },
      learningPatternStats: {
        total: 0,
        byType: {} as Record<string, number>,
        avgSuccessRate: 0
      },
      topTools: [] as any[],
      recentImprovements: [] as any[]
    };

    // Total feedback count
    const totalFeedback = this.db.prepare(`
      SELECT COUNT(*) as count FROM agent_feedback
      ${sessionId ? 'WHERE session_id = ?' : ''}
    `).get(sessionId ? [sessionId] : []) as any;
    stats.totalFeedback = totalFeedback.count;

    // Feedback by type
    const feedbackByType = this.db.prepare(`
      SELECT feedback_type, COUNT(*) as count
      FROM agent_feedback
      ${sessionId ? 'WHERE session_id = ?' : ''}
      GROUP BY feedback_type
    `).all(sessionId ? [sessionId] : []) as any[];
    
    feedbackByType.forEach(f => {
      stats.feedbackByType[f.feedback_type] = f.count;
    });

    // Context gap statistics
    const contextStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN resolution_status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN resolution_status = 'pending' THEN 1 END) as pending,
        AVG(CASE WHEN resolution_status = 'resolved' THEN time_to_resolution END) as avg_resolution_time
      FROM context_gaps
      ${sessionId ? 'WHERE session_id = ?' : ''}
    `).get(sessionId ? [sessionId] : []) as any;

    stats.contextGapStats = {
      total: contextStats.total,
      resolved: contextStats.resolved,
      pending: contextStats.pending,
      avgResolutionTime: contextStats.avg_resolution_time || 0
    };

    // Learning pattern statistics
    const patternStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        pattern_type,
        AVG(success_rate) as avg_success_rate
      FROM learning_patterns
      GROUP BY pattern_type
    `).all() as any[];

    stats.learningPatternStats.total = patternStats.reduce((sum: number, p: any) => sum + p.total, 0);
    patternStats.forEach(p => {
      stats.learningPatternStats.byType[p.pattern_type] = p.total;
    });
    stats.learningPatternStats.avgSuccessRate = 
      patternStats.reduce((sum: number, p: any) => sum + p.avg_success_rate, 0) / patternStats.length;

    // Top tools by usage
    stats.topTools = this.db.prepare(`
      SELECT tool_name, COUNT(*) as usage_count,
             COUNT(CASE WHEN feedback_type = 'success' THEN 1 END) as success_count
      FROM agent_feedback
      WHERE tool_name IS NOT NULL
      ${sessionId ? 'AND session_id = ?' : ''}
      GROUP BY tool_name
      ORDER BY usage_count DESC
      LIMIT 5
    `).all(sessionId ? [sessionId] : []) as any[];

    // Recent improvements
    stats.recentImprovements = this.db.prepare(`
      SELECT * FROM feedback_improvements
      ORDER BY timestamp DESC
      LIMIT 10
    `).all() as any[];

    return stats;
  }

  /**
   * Shuts down the ThoughtSignaturePreserver, closing the database connection.
   * @returns A promise that resolves when the shutdown is complete.
   */
  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }
}