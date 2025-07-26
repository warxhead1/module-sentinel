/**
 * Semantic Tag Registry - Drizzle-based implementation
 * 
 * This is a refactored version that uses DrizzleDatabase instead of raw SQL queries.
 * It maintains the same API as the original SemanticTagRegistry for backward compatibility.
 */

import { EventEmitter } from 'events';
import Database from 'better-sqlite3';
import { createLogger } from '../utils/logger.js';
import { DrizzleDatabase } from '../database/drizzle-db.js';

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
 * Semantic tag registry class using Drizzle
 */
export class SemanticTagRegistry extends EventEmitter {
  private drizzleDb: DrizzleDatabase;
  private tagCache: Map<string, SemanticTagDefinition> = new Map();
  private categoryCache: Map<TagCategory, SemanticTagDefinition[]> = new Map();
  private logger = createLogger('SemanticTagRegistry');
  
  constructor(dbOrPath: string | Database.Database) {
    super();
    
    let rawDb: Database.Database;
    if (typeof dbOrPath === 'string') {
      // Legacy support - create database directly
      rawDb = new Database(dbOrPath);
      console.warn('SemanticTagRegistry: Creating database directly is deprecated. Use DatabaseInitializer instead.');
    } else {
      rawDb = dbOrPath;
    }
    
    // Create DrizzleDatabase wrapper
    this.drizzleDb = new DrizzleDatabase(rawDb);
    
    // Load built-in tags
    this.loadBuiltinTags();
  }
  
  /**
   * Register a new semantic tag
   */
  async registerTag(definition: Omit<SemanticTagDefinition, 'id'>): Promise<number> {
    // Validate definition
    this.validateTagDefinition(definition);
    
    // Check if tag already exists
    const exists = await this.drizzleDb.semanticTagExists(definition.name);
    if (exists) {
      throw new Error(`Tag '${definition.name}' already exists`);
    }
    
    // Insert tag using Drizzle
    const tagId = await this.drizzleDb.insertSemanticTag({
      name: definition.name,
      displayName: definition.displayName,
      description: definition.description,
      category: definition.category,
      isUniversal: definition.isUniversal,
      applicableLanguages: definition.applicableLanguages,
      parentTagId: definition.parentTagId,
      validationRules: definition.validationRules,
      color: definition.color,
      icon: definition.icon,
      isActive: definition.isActive
    });
    
    if (!tagId) {
      throw new Error('Failed to create tag');
    }
    
    // Clear cache
    this.clearCache();
    
    this.emit('tag:registered', { tagId, name: definition.name });
    
    return tagId;
  }
  
  /**
   * Update an existing tag
   */
  async updateTag(tagId: number, updates: Partial<SemanticTagDefinition>): Promise<void> {
    // TODO: Add validation by getting existing tag first
    
    await this.drizzleDb.updateSemanticTag(tagId, {
      displayName: updates.displayName,
      description: updates.description,
      category: updates.category,
      isUniversal: updates.isUniversal,
      applicableLanguages: updates.applicableLanguages,
      parentTagId: updates.parentTagId,
      validationRules: updates.validationRules,
      color: updates.color,
      icon: updates.icon,
      isActive: updates.isActive
    });
    
    // Clear cache
    this.clearCache();
    
    this.emit('tag:updated', { tagId });
  }
  
  /**
   * Delete a tag
   */
  async deleteTag(tagId: number): Promise<void> {
    const tagName = await this.drizzleDb.deleteSemanticTag(tagId);
    
    // Clear cache
    this.clearCache();
    
    this.emit('tag:deleted', { tagId, name: tagName });
  }
  
  /**
   * Get a tag by name
   */
  getTag(name: string): SemanticTagDefinition | null {
    // Check cache first
    if (this.tagCache.has(name)) {
      return this.tagCache.get(name)!;
    }
    
    // Load from database using Drizzle
    const tag = this.drizzleDb.getSemanticTagByName(name);
    
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
  async getTagsByCategory(category: TagCategory): Promise<SemanticTagDefinition[]> {
    // Check cache first
    if (this.categoryCache.has(category)) {
      return this.categoryCache.get(category)!;
    }
    
    // Load from database using Drizzle
    const tags = await this.drizzleDb.getSemanticTagsByCategory(category);
    
    const definitions = tags.map(tag => this.dbRowToTagDefinition(tag));
    this.categoryCache.set(category, definitions);
    
    return definitions;
  }
  
  /**
   * Get all tags
   */
  async getAllTags(): Promise<SemanticTagDefinition[]> {
    const tags = await this.drizzleDb.getAllSemanticTags();
    return tags.map(tag => this.dbRowToTagDefinition(tag));
  }
  
  /**
   * Get tags applicable to a language
   */
  async getTagsForLanguage(language: string): Promise<SemanticTagDefinition[]> {
    const tags = await this.drizzleDb.getSemanticTagsForLanguage(language);
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
    const tag = await this.getTag(tagName);
    if (!tag || !tag.id) {
      throw new Error(`Tag '${tagName}' not found`);
    }
    
    await this.drizzleDb.assignSemanticTag({
      symbolId,
      tagId: tag.id,
      confidence,
      autoDetected,
      detectorName: detectorName || null,
      context: context || null
    });
    
    this.emit('tag:assigned', { symbolId, tagName, confidence, autoDetected });
  }
  
  /**
   * Remove a tag from a symbol
   */
  async removeTag(symbolId: string, tagName: string): Promise<void> {
    const tag = await this.getTag(tagName);
    if (!tag || !tag.id) {
      throw new Error(`Tag '${tagName}' not found`);
    }
    
    await this.drizzleDb.removeSemanticTag(symbolId, tag.id);
    
    this.emit('tag:removed', { symbolId, tagName });
  }
  
  /**
   * Get tags assigned to a symbol
   */
  async getSymbolTags(symbolId: string): Promise<TagAssignment[]> {
    const assignments = await this.drizzleDb.getSymbolSemanticTags(symbolId);
    
    return assignments.map((assignment: any) => ({
      symbolId: assignment.symbolId.toString(),
      tagId: assignment.tagId,
      tagName: assignment.tagName,
      confidence: assignment.confidence,
      autoDetected: !!assignment.autoDetected,
      detectorName: assignment.detectorName,
      context: assignment.context,
      createdAt: new Date(assignment.createdAt)
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
      ? await this.getTagsForLanguage(language)
      : await this.getAllTags();
    
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
  private async loadBuiltinTags(): Promise<void> {
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
        await this.registerTag(tag);
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
      displayName: row.displayName,
      description: row.description,
      category: row.category as TagCategory,
      isUniversal: !!row.isUniversal,
      applicableLanguages: row.applicableLanguages,
      parentTagId: row.parentTagId,
      validationRules: row.validationRules,
      inferenceRules: row.validationRules ? 
        JSON.parse(JSON.stringify(row.validationRules)) : undefined, // Using validationRules as a fallback
      color: row.color,
      icon: row.icon,
      isActive: !!row.isActive,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.createdAt ? new Date(row.createdAt) : undefined // Using createdAt as fallback
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
    // DrizzleDatabase doesn't expose a close method, so we get the raw db
    const rawDb = this.drizzleDb.getRawDb();
    rawDb.close();
  }
}