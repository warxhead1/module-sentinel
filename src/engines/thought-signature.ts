import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { ArchitecturalDecision, ThoughtPattern } from '../types/index.js';

import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';

export class ThoughtSignaturePreserver {
  private db: Database.Database;
  private schemaManager: UnifiedSchemaManager;

  constructor(db: Database.Database) {
    this.db = db;
    this.schemaManager = UnifiedSchemaManager.getInstance();
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
   * Shuts down the ThoughtSignaturePreserver, closing the database connection.
   * @returns A promise that resolves when the shutdown is complete.
   */
  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }
}