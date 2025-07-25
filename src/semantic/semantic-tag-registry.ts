/**
 * Semantic Tag Registry - Formalized tagging system for cross-language concepts
 * 
 * This system provides a structured approach to semantic tagging that works
 * across different programming languages and projects.
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';

/**
 * Semantic tag definition
 */
export interface SemanticTagDefinition {
  id?: number;
  name: string;
  displayName: string;
  description?: string;
  category: TagCategory;
  
  // Scope and applicability
  isUniversal: boolean;
  applicableLanguages?: string[];
  
  // Hierarchy
  parentTagId?: number;
  parentTag?: SemanticTagDefinition;
  childTags?: SemanticTagDefinition[];
  
  // Validation and inference
  validationRules?: TagValidationRule[];
  inferenceRules?: TagInferenceRule[];
  
  // UI presentation
  color?: string;
  icon?: string;
  
  // Metadata
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Tag categories for organization
 */
export enum TagCategory {
  Pattern = 'pattern',
  Architecture = 'architecture',
  Performance = 'performance',
  Security = 'security',
  Quality = 'quality',
  Domain = 'domain',
  Language = 'language',
  Framework = 'framework',
  Custom = 'custom'
}

/**
 * Tag validation rule
 */
export interface TagValidationRule {
  type: 'symbol_name' | 'symbol_kind' | 'signature' | 'namespace' | 'custom';
  condition: string; // Regex pattern or custom validation function name
  message?: string;
}

/**
 * Tag inference rule
 */
export interface TagInferenceRule {
  type: 'symbol_name' | 'symbol_kind' | 'signature' | 'namespace' | 'relationship' | 'custom';
  condition: string;
  confidence: number; // 0.0 - 1.0
  requiredTags?: string[]; // Other tags that must be present
  excludedTags?: string[]; // Other tags that must not be present
}

/**
 * Tag assignment to a symbol
 */
export interface TagAssignment {
  symbolId: string;
  tagId: number;
  tagName: string;
  confidence: number;
  autoDetected: boolean;
  detectorName?: string;
  context?: {
    line?: number;
    column?: number;
    snippet?: string;
    metadata?: Record<string, any>;
  };
  createdAt: Date;
}

/**
 * Tag suggestion for a symbol
 */
export interface TagSuggestion {
  tagName: string;
  confidence: number;
  reason: string;
  rule?: TagInferenceRule;
}

/**
 * Semantic tag registry class
 */
export class SemanticTagRegistry extends EventEmitter {
  private db: Database.Database;
  private tagCache: Map<string, SemanticTagDefinition> = new Map();
  private categoryCache: Map<TagCategory, SemanticTagDefinition[]> = new Map();
  private logger = createLogger('SemanticTagRegistry');
  
  constructor(dbOrPath: string | Database.Database) {
    super();
    if (typeof dbOrPath === 'string') {
      // Legacy support - create database directly
      this.db = new Database(dbOrPath);
      console.warn('SemanticTagRegistry: Creating database directly is deprecated. Use DatabaseInitializer instead.');
    } else {
      // Use pre-initialized database
      this.db = dbOrPath;
    }
    // Tables are created by DatabaseInitializer
    this.loadBuiltinTags();
  }
  
  
  /**
   * Register a new semantic tag
   */
  async registerTag(definition: Omit<SemanticTagDefinition, 'id'>): Promise<number> {
    // Validate definition
    this.validateTagDefinition(definition);
    
    // Check if tag already exists
    const existing = this.db.prepare('SELECT id FROM semantic_tag_definitions WHERE name = ?').get(definition.name);
    if (existing) {
      throw new Error(`Tag '${definition.name}' already exists`);
    }
    
    // Insert tag
    const insertTag = this.db.prepare(`
      INSERT INTO semantic_tag_definitions (
        name, display_name, description, category, is_universal, 
        applicable_languages, parent_tag_id, validation_rules, 
        inference_rules, color, icon, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = insertTag.run(
      definition.name,
      definition.displayName,
      definition.description || '',
      definition.category,
      definition.isUniversal ? 1 : 0,
      definition.applicableLanguages ? JSON.stringify(definition.applicableLanguages) : null,
      definition.parentTagId || null,
      definition.validationRules ? JSON.stringify(definition.validationRules) : null,
      definition.inferenceRules ? JSON.stringify(definition.inferenceRules) : null,
      definition.color || null,
      definition.icon || null,
      definition.isActive ? 1 : 0
    );
    
    const tagId = result.lastInsertRowid as number;
    
    // Clear cache
    this.clearCache();
    
    this.emit('tag:registered', { tagId, name: definition.name });
    
    return tagId;
  }
  
  /**
   * Update an existing tag
   */
  async updateTag(tagId: number, updates: Partial<SemanticTagDefinition>): Promise<void> {
    const existing = this.db.prepare('SELECT * FROM semantic_tag_definitions WHERE id = ?').get(tagId);
    if (!existing) {
      throw new Error(`Tag with id ${tagId} not found`);
    }
    
    // Build update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    
    if (updates.displayName !== undefined) {
      updateFields.push('display_name = ?');
      updateValues.push(updates.displayName);
    }
    
    if (updates.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(updates.description);
    }
    
    if (updates.category !== undefined) {
      updateFields.push('category = ?');
      updateValues.push(updates.category);
    }
    
    if (updates.isUniversal !== undefined) {
      updateFields.push('is_universal = ?');
      updateValues.push(updates.isUniversal ? 1 : 0);
    }
    
    if (updates.applicableLanguages !== undefined) {
      updateFields.push('applicable_languages = ?');
      updateValues.push(updates.applicableLanguages ? JSON.stringify(updates.applicableLanguages) : null);
    }
    
    if (updates.parentTagId !== undefined) {
      updateFields.push('parent_tag_id = ?');
      updateValues.push(updates.parentTagId);
    }
    
    if (updates.validationRules !== undefined) {
      updateFields.push('validation_rules = ?');
      updateValues.push(updates.validationRules ? JSON.stringify(updates.validationRules) : null);
    }
    
    if (updates.inferenceRules !== undefined) {
      updateFields.push('inference_rules = ?');
      updateValues.push(updates.inferenceRules ? JSON.stringify(updates.inferenceRules) : null);
    }
    
    if (updates.color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(updates.color);
    }
    
    if (updates.icon !== undefined) {
      updateFields.push('icon = ?');
      updateValues.push(updates.icon);
    }
    
    if (updates.isActive !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(updates.isActive ? 1 : 0);
    }
    
    if (updateFields.length === 0) {
      return; // No updates
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(tagId);
    
    const updateQuery = `
      UPDATE semantic_tag_definitions 
      SET ${updateFields.join(', ')} 
      WHERE id = ?
    `;
    
    this.db.prepare(updateQuery).run(...updateValues);
    
    // Clear cache
    this.clearCache();
    
    this.emit('tag:updated', { tagId, name: (existing as any).name });
  }
  
  /**
   * Delete a tag
   */
  async deleteTag(tagId: number): Promise<void> {
    const tag = this.db.prepare('SELECT name FROM semantic_tag_definitions WHERE id = ?').get(tagId);
    if (!tag) {
      throw new Error(`Tag with id ${tagId} not found`);
    }
    
    // Delete tag (CASCADE will handle symbol assignments)
    this.db.prepare('DELETE FROM semantic_tag_definitions WHERE id = ?').run(tagId);
    
    // Clear cache
    this.clearCache();
    
    this.emit('tag:deleted', { tagId, name: (tag as any).name });
  }
  
  /**
   * Get a tag by name
   */
  getTag(name: string): SemanticTagDefinition | null {
    // Check cache first
    if (this.tagCache.has(name)) {
      return this.tagCache.get(name)!;
    }
    
    // Load from database
    const tag = this.db.prepare(`
      SELECT * FROM semantic_tag_definitions 
      WHERE name = ? AND is_active = 1
    `).get(name);
    
    if (!tag) {
      return null;
    }
    
    const definition = this.dbRowToTagDefinition(tag);
    this.tagCache.set(name, definition);
    
    return definition;
  }
  
  /**
   * Get all tags by category
   */
  getTagsByCategory(category: TagCategory): SemanticTagDefinition[] {
    // Check cache first
    if (this.categoryCache.has(category)) {
      return this.categoryCache.get(category)!;
    }
    
    // Load from database
    const tags = this.db.prepare(`
      SELECT * FROM semantic_tag_definitions 
      WHERE category = ? AND is_active = 1
      ORDER BY name
    `).all(category);
    
    const definitions = tags.map(tag => this.dbRowToTagDefinition(tag));
    this.categoryCache.set(category, definitions);
    
    return definitions;
  }
  
  /**
   * Get all tags
   */
  getAllTags(): SemanticTagDefinition[] {
    const tags = this.db.prepare(`
      SELECT * FROM semantic_tag_definitions 
      WHERE is_active = 1
      ORDER BY category, name
    `).all();
    
    return tags.map(tag => this.dbRowToTagDefinition(tag));
  }
  
  /**
   * Get tags applicable to a language
   */
  getTagsForLanguage(language: string): SemanticTagDefinition[] {
    const tags = this.db.prepare(`
      SELECT * FROM semantic_tag_definitions 
      WHERE is_active = 1 
        AND (is_universal = 1 OR applicable_languages LIKE ?)
      ORDER BY category, name
    `).all(`%"${language}"%`);
    
    return tags.map(tag => this.dbRowToTagDefinition(tag));
  }
  
  /**
   * Assign a tag to a symbol
   */
  async assignTag(
    symbolId: string,
    tagName: string,
    confidence: number = 1.0,
    autoDetected: boolean = false,
    detectorName?: string,
    context?: TagAssignment['context']
  ): Promise<void> {
    const tag = this.getTag(tagName);
    if (!tag) {
      throw new Error(`Tag '${tagName}' not found`);
    }
    
    // Insert or update assignment
    const upsertAssignment = this.db.prepare(`
      INSERT OR REPLACE INTO symbol_semantic_tags 
      (symbol_id, tag_id, confidence, auto_detected, detector_name, context)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    upsertAssignment.run(
      symbolId,
      tag.id!,
      confidence,
      autoDetected ? 1 : 0,
      detectorName || null,
      context ? JSON.stringify(context) : null
    );
    
    this.emit('tag:assigned', { symbolId, tagName, confidence, autoDetected });
  }
  
  /**
   * Remove a tag from a symbol
   */
  async removeTag(symbolId: string, tagName: string): Promise<void> {
    const tag = this.getTag(tagName);
    if (!tag) {
      throw new Error(`Tag '${tagName}' not found`);
    }
    
    this.db.prepare(`
      DELETE FROM symbol_semantic_tags 
      WHERE symbol_id = ? AND tag_id = ?
    `).run(symbolId, tag.id!);
    
    this.emit('tag:removed', { symbolId, tagName });
  }
  
  /**
   * Get tags assigned to a symbol
   */
  getSymbolTags(symbolId: string): TagAssignment[] {
    const assignments = this.db.prepare(`
      SELECT 
        st.symbol_id,
        st.tag_id,
        st.confidence,
        st.auto_detected,
        st.detector_name,
        st.context,
        st.created_at,
        std.name as tag_name
      FROM symbol_semantic_tags st
      JOIN semantic_tag_definitions std ON st.tag_id = std.id
      WHERE st.symbol_id = ?
      ORDER BY st.confidence DESC, std.name
    `).all(symbolId);
    
    return assignments.map((assignment: any) => ({
      symbolId: assignment.symbol_id,
      tagId: assignment.tag_id,
      tagName: assignment.tag_name,
      confidence: assignment.confidence,
      autoDetected: !!assignment.auto_detected,
      detectorName: assignment.detector_name,
      context: assignment.context ? JSON.parse(assignment.context) : undefined,
      createdAt: new Date(assignment.created_at)
    }));
  }
  
  /**
   * Suggest tags for a symbol based on inference rules
   */
  async suggestTags(
    symbolName: string,
    symbolKind: string,
    signature?: string,
    namespace?: string,
    language?: string
  ): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = [];
    
    // Get applicable tags
    const applicableTags = language 
      ? this.getTagsForLanguage(language)
      : this.getAllTags();
    
    // Test each tag's inference rules
    for (const tag of applicableTags) {
      if (!tag.inferenceRules) continue;
      
      for (const rule of tag.inferenceRules) {
        const confidence = this.evaluateInferenceRule(rule, {
          symbolName,
          symbolKind,
          signature,
          namespace
        });
        
        if (confidence > 0) {
          suggestions.push({
            tagName: tag.name,
            confidence,
            reason: `Matched rule: ${rule.type} -> ${rule.condition}`,
            rule
          });
        }
      }
    }
    
    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    return suggestions;
  }
  
  /**
   * Validate a tag assignment
   */
  validateTagAssignment(
    symbolName: string,
    symbolKind: string,
    tagName: string,
    signature?: string,
    namespace?: string
  ): { isValid: boolean; errors: string[] } {
    const tag = this.getTag(tagName);
    if (!tag) {
      return { isValid: false, errors: [`Tag '${tagName}' not found`] };
    }
    
    const errors: string[] = [];
    
    // Test validation rules
    if (tag.validationRules) {
      for (const rule of tag.validationRules) {
        const isValid = this.evaluateValidationRule(rule, {
          symbolName,
          symbolKind,
          signature,
          namespace
        });
        
        if (!isValid) {
          errors.push(rule.message || `Validation failed for rule: ${rule.type}`);
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }
  
  /**
   * Load built-in tags
   */
  private loadBuiltinTags(): void {
    const builtinTags: Omit<SemanticTagDefinition, 'id'>[] = [
      // Design patterns
      {
        name: 'factory',
        displayName: 'Factory Pattern',
        description: 'Creates objects without specifying exact classes',
        category: TagCategory.Pattern,
        isUniversal: true,
        color: '#4CAF50',
        icon: '🏭',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Ff]actory.*',
            confidence: 0.8
          },
          {
            type: 'symbol_name',
            condition: '.*[Cc]reate.*',
            confidence: 0.6
          }
        ]
      },
      {
        name: 'singleton',
        displayName: 'Singleton Pattern',
        description: 'Ensures a class has only one instance',
        category: TagCategory.Pattern,
        isUniversal: true,
        color: '#FF9800',
        icon: '🔒',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Ss]ingleton.*',
            confidence: 0.8
          },
          {
            type: 'symbol_name',
            condition: '.*[Ii]nstance.*',
            confidence: 0.6
          }
        ]
      },
      {
        name: 'observer',
        displayName: 'Observer Pattern',
        description: 'Defines subscription mechanism for object notifications',
        category: TagCategory.Pattern,
        isUniversal: true,
        color: '#2196F3',
        icon: '👀',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Oo]bserver.*',
            confidence: 0.8
          },
          {
            type: 'symbol_name',
            condition: '.*[Ll]istener.*',
            confidence: 0.7
          }
        ]
      },
      
      // Architecture
      {
        name: 'manager',
        displayName: 'Manager Component',
        description: 'Manages lifecycle and coordination of other components',
        category: TagCategory.Architecture,
        isUniversal: true,
        color: '#9C27B0',
        icon: '📊',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Mm]anager.*',
            confidence: 0.9
          }
        ]
      },
      {
        name: 'controller',
        displayName: 'Controller Component',
        description: 'Handles user input and coordinates between model and view',
        category: TagCategory.Architecture,
        isUniversal: true,
        color: '#607D8B',
        icon: '🎮',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Cc]ontroller.*',
            confidence: 0.9
          }
        ]
      },
      
      // Performance
      {
        name: 'gpu',
        displayName: 'GPU Accelerated',
        description: 'Code that utilizes GPU for computation',
        category: TagCategory.Performance,
        isUniversal: true,
        color: '#FF5722',
        icon: '🖥️',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Gg]pu.*',
            confidence: 0.9
          },
          {
            type: 'symbol_name',
            condition: '.*[Vv]ulkan.*',
            confidence: 0.8
          },
          {
            type: 'symbol_name',
            condition: '.*[Cc]ompute.*',
            confidence: 0.6
          }
        ]
      },
      {
        name: 'performance_critical',
        displayName: 'Performance Critical',
        description: 'Code that requires high performance optimization',
        category: TagCategory.Performance,
        isUniversal: true,
        color: '#F44336',
        icon: '⚡',
        isActive: true,
        inferenceRules: [
          {
            type: 'symbol_name',
            condition: '.*[Pp]erformance.*',
            confidence: 0.7
          },
          {
            type: 'symbol_name',
            condition: '.*[Oo]ptimized.*',
            confidence: 0.6
          }
        ]
      }
    ];
    
    // Register built-in tags
    for (const tag of builtinTags) {
      try {
        this.registerTag(tag);
      } catch {
        this.logger.debug('Tag already exists, skipping registration', { 
          tagName: tag.name,
          category: tag.category 
        });
        // Tag may already exist, which is fine
      }
    }
  }
  
  /**
   * Evaluate an inference rule
   */
  private evaluateInferenceRule(rule: TagInferenceRule, context: {
    symbolName: string;
    symbolKind: string;
    signature?: string;
    namespace?: string;
  }): number {
    try {
      switch (rule.type) {
        case 'symbol_name':
          return new RegExp(rule.condition, 'i').test(context.symbolName) ? rule.confidence : 0;
          
        case 'symbol_kind':
          return new RegExp(rule.condition, 'i').test(context.symbolKind) ? rule.confidence : 0;
          
        case 'signature':
          return context.signature && new RegExp(rule.condition, 'i').test(context.signature) ? rule.confidence : 0;
          
        case 'namespace':
          return context.namespace && new RegExp(rule.condition, 'i').test(context.namespace) ? rule.confidence : 0;
          
        default:
          return 0;
      }
    } catch (error) {
      console.warn(`Error evaluating inference rule: ${error}`);
      return 0;
    }
  }
  
  /**
   * Evaluate a validation rule
   */
  private evaluateValidationRule(rule: TagValidationRule, context: {
    symbolName: string;
    symbolKind: string;
    signature?: string;
    namespace?: string;
  }): boolean {
    try {
      switch (rule.type) {
        case 'symbol_name':
          return new RegExp(rule.condition, 'i').test(context.symbolName);
          
        case 'symbol_kind':
          return new RegExp(rule.condition, 'i').test(context.symbolKind);
          
        case 'signature':
          return !context.signature || new RegExp(rule.condition, 'i').test(context.signature);
          
        case 'namespace':
          return !context.namespace || new RegExp(rule.condition, 'i').test(context.namespace);
          
        default:
          return true;
      }
    } catch (error) {
      console.warn(`Error evaluating validation rule: ${error}`);
      return false;
    }
  }
  
  /**
   * Convert database row to tag definition
   */
  private dbRowToTagDefinition(row: any): SemanticTagDefinition {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      category: row.category as TagCategory,
      isUniversal: !!row.is_universal,
      applicableLanguages: row.applicable_languages ? JSON.parse(row.applicable_languages) : undefined,
      parentTagId: row.parent_tag_id,
      validationRules: row.validation_rules ? JSON.parse(row.validation_rules) : undefined,
      inferenceRules: row.inference_rules ? JSON.parse(row.inference_rules) : undefined,
      color: row.color,
      icon: row.icon,
      isActive: !!row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  
  /**
   * Validate tag definition
   */
  private validateTagDefinition(definition: Omit<SemanticTagDefinition, 'id'>): void {
    if (!definition.name || !definition.displayName) {
      throw new Error('Tag must have name and displayName');
    }
    
    if (!Object.values(TagCategory).includes(definition.category)) {
      throw new Error(`Invalid tag category: ${definition.category}`);
    }
    
    if (definition.parentTagId && definition.parentTagId <= 0) {
      throw new Error('Invalid parent tag ID');
    }
  }
  
  /**
   * Clear all caches
   */
  private clearCache(): void {
    this.tagCache.clear();
    this.categoryCache.clear();
  }
  
  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}