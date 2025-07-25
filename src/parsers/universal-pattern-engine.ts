/**
 * Universal Pattern Engine
 * 
 * Detects architectural and design patterns across multiple programming languages
 * using language-agnostic symbol analysis and relationship mapping.
 */

import { 
  UniversalSymbol, 
  UniversalRelationship, 
  UniversalSymbolKind,
  UniversalRelationshipType,
  DetectedPattern 
} from './language-parser-interface.js';

/**
 * Universal pattern definition
 */
export interface UniversalPatternDefinition {
  id: string;
  name: string;
  description: string;
  category: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'anti-pattern';
  
  // Pattern detection criteria
  criteria: PatternCriteria;
  
  // Confidence scoring
  weights: PatternWeights;
  
  // Language support
  languages: string[]; // ['*'] for all languages
  
  // Pattern variations by language
  languageVariations?: Record<string, PatternVariation>;
}

export interface PatternCriteria {
  // Required symbol characteristics
  requiredSymbols?: SymbolRequirement[];
  
  // Required relationships
  requiredRelationships?: RelationshipRequirement[];
  
  // Symbol naming patterns
  namingPatterns?: NamingPattern[];
  
  // Structural requirements
  structuralRules?: StructuralRule[];
  
  // Anti-pattern indicators
  antiIndicators?: string[];
}

export interface SymbolRequirement {
  kind: UniversalSymbolKind | UniversalSymbolKind[];
  role: string; // 'factory', 'product', 'singleton', etc.
  minCount?: number;
  maxCount?: number;
  
  // Symbol characteristics
  mustHave?: string[]; // semantic tags, features
  mustNotHave?: string[];
  
  // Naming requirements
  namePattern?: RegExp;
  semanticTags?: string[];
}

export interface RelationshipRequirement {
  type: UniversalRelationshipType | UniversalRelationshipType[];
  fromRole: string;
  toRole: string;
  minCount?: number;
  confidence?: number;
}

export interface NamingPattern {
  role: string;
  patterns: RegExp[];
  weight: number;
}

export interface StructuralRule {
  rule: string; // 'singleton_instance', 'factory_method', etc.
  weight: number;
  validator: (symbols: Map<string, UniversalSymbol[]>) => boolean;
}

export interface PatternWeights {
  symbols: number;
  relationships: number;
  naming: number;
  structure: number;
}

export interface PatternVariation {
  namingConventions: Record<string, RegExp[]>;
  languageSpecificRules: StructuralRule[];
  additionalTags: string[];
}

/**
 * Pattern detection result with detailed analysis
 */
export interface PatternDetectionResult extends DetectedPattern {
  // Pattern matching details
  matchedSymbols: Map<string, UniversalSymbol[]>; // role -> symbols
  matchedRelationships: UniversalRelationship[];
  
  // Scoring breakdown
  scoreBreakdown: {
    symbolScore: number;
    relationshipScore: number;
    namingScore: number;
    structuralScore: number;
    totalScore: number;
  };
  
  // Pattern health
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
  recommendations: string[];
}

/**
 * Universal pattern engine
 */
export class UniversalPatternEngine {
  private patterns: Map<string, UniversalPatternDefinition> = new Map();
  
  constructor() {
    this.initializeBuiltInPatterns();
  }
  
  /**
   * Register a custom pattern
   */
  registerPattern(pattern: UniversalPatternDefinition): void {
    this.patterns.set(pattern.id, pattern);
  }
  
  /**
   * Detect all patterns in a symbol set
   */
  async detectPatterns(
    symbols: UniversalSymbol[],
    relationships: UniversalRelationship[],
    language: string
  ): Promise<PatternDetectionResult[]> {
    const results: PatternDetectionResult[] = [];
    
    // Filter patterns applicable to this language
    const applicablePatterns = Array.from(this.patterns.values()).filter(
      p => p.languages.includes('*') || p.languages.includes(language)
    );
    
    for (const pattern of applicablePatterns) {
      const result = await this.detectPattern(pattern, symbols, relationships, language);
      if (result && result.confidence > 0.3) { // Minimum confidence threshold
        results.push(result);
      }
    }
    
    // Sort by confidence
    return results.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Detect a specific pattern
   */
  private async detectPattern(
    pattern: UniversalPatternDefinition,
    symbols: UniversalSymbol[],
    relationships: UniversalRelationship[],
    language: string
  ): Promise<PatternDetectionResult | null> {
    const matchedSymbols = new Map<string, UniversalSymbol[]>();
    const matchedRelationships: UniversalRelationship[] = [];
    
    // Apply language variation if available
    const effectivePattern = this.applyLanguageVariation(pattern, language);
    
    // Score different aspects of the pattern
    const symbolScore = this.scoreSymbolMatch(effectivePattern, symbols, matchedSymbols);
    const relationshipScore = this.scoreRelationshipMatch(
      effectivePattern, relationships, matchedSymbols, matchedRelationships
    );
    const namingScore = this.scoreNamingMatch(effectivePattern, symbols, language);
    const structuralScore = this.scoreStructuralMatch(effectivePattern, matchedSymbols);
    
    // Calculate weighted total score
    const weights = effectivePattern.weights;
    const totalScore = (
      symbolScore * weights.symbols +
      relationshipScore * weights.relationships +
      namingScore * weights.naming +
      structuralScore * weights.structure
    ) / (weights.symbols + weights.relationships + weights.naming + weights.structure);
    
    // Only return if we have a meaningful match
    if (totalScore < 0.3 || matchedSymbols.size === 0) {
      return null;
    }
    
    // Assess pattern quality and generate recommendations
    const { quality, issues, recommendations } = this.assessPatternQuality(
      effectivePattern, matchedSymbols, matchedRelationships, totalScore
    );
    
    return {
      type: pattern.id,
      confidence: totalScore,
      symbols: Array.from(matchedSymbols.values()).flat().map(s => s.qualifiedName),
      description: pattern.description,
      severity: totalScore > 0.8 ? 'info' : totalScore > 0.6 ? 'warning' : 'error',
      matchedSymbols,
      matchedRelationships,
      scoreBreakdown: {
        symbolScore,
        relationshipScore,
        namingScore,
        structuralScore,
        totalScore
      },
      quality,
      issues,
      recommendations
    };
  }
  
  /**
   * Score symbol matching against pattern requirements
   */
  private scoreSymbolMatch(
    pattern: UniversalPatternDefinition,
    symbols: UniversalSymbol[],
    matchedSymbols: Map<string, UniversalSymbol[]>
  ): number {
    if (!pattern.criteria.requiredSymbols) return 1.0;
    
    let totalScore = 0;
    const totalRequirements = pattern.criteria.requiredSymbols.length;
    
    for (const requirement of pattern.criteria.requiredSymbols) {
      const candidates = this.findSymbolCandidates(symbols, requirement);
      const requiredCount = requirement.minCount || 1;
      
      if (candidates.length >= requiredCount) {
        matchedSymbols.set(requirement.role, candidates.slice(0, requirement.maxCount || candidates.length));
        totalScore += 1.0;
      } else {
        totalScore += candidates.length / requiredCount;
      }
    }
    
    return totalScore / totalRequirements;
  }
  
  /**
   * Find symbol candidates matching requirements
   */
  private findSymbolCandidates(symbols: UniversalSymbol[], requirement: SymbolRequirement): UniversalSymbol[] {
    return symbols.filter(symbol => {
      // Check symbol kind
      const kinds = Array.isArray(requirement.kind) ? requirement.kind : [requirement.kind];
      if (!kinds.includes(symbol.kind as UniversalSymbolKind)) {
        return false;
      }
      
      // Check name pattern
      if (requirement.namePattern && !requirement.namePattern.test(symbol.name)) {
        return false;
      }
      
      // Check semantic tags
      if (requirement.semanticTags) {
        const symbolTags = symbol.semanticTags || [];
        if (!requirement.semanticTags.every(tag => symbolTags.includes(tag))) {
          return false;
        }
      }
      
      // Check must have/must not have features
      if (requirement.mustHave) {
        const features = Object.keys(symbol.languageFeatures || {});
        const tags = symbol.semanticTags || [];
        const allFeatures = [...features, ...tags];
        
        if (!requirement.mustHave.every(feature => allFeatures.includes(feature))) {
          return false;
        }
      }
      
      if (requirement.mustNotHave) {
        const features = Object.keys(symbol.languageFeatures || {});
        const tags = symbol.semanticTags || [];
        const allFeatures = [...features, ...tags];
        
        if (requirement.mustNotHave.some(feature => allFeatures.includes(feature))) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Score relationship matching
   */
  private scoreRelationshipMatch(
    pattern: UniversalPatternDefinition,
    relationships: UniversalRelationship[],
    matchedSymbols: Map<string, UniversalSymbol[]>,
    matchedRelationships: UniversalRelationship[]
  ): number {
    if (!pattern.criteria.requiredRelationships) return 1.0;
    
    let totalScore = 0;
    const totalRequirements = pattern.criteria.requiredRelationships.length;
    
    for (const requirement of pattern.criteria.requiredRelationships) {
      const fromSymbols = matchedSymbols.get(requirement.fromRole) || [];
      const toSymbols = matchedSymbols.get(requirement.toRole) || [];
      
      if (fromSymbols.length === 0 || toSymbols.length === 0) {
        continue;
      }
      
      const validRelationships = relationships.filter(rel => {
        const types = Array.isArray(requirement.type) ? requirement.type : [requirement.type];
        if (!types.includes(rel.type as UniversalRelationshipType)) {
          return false;
        }
        
        const hasFromSymbol = fromSymbols.some(s => s.qualifiedName === rel.fromSymbolId);
        const hasToSymbol = toSymbols.some(s => s.qualifiedName === rel.toSymbolId);
        
        return hasFromSymbol && hasToSymbol;
      });
      
      const requiredCount = requirement.minCount || 1;
      if (validRelationships.length >= requiredCount) {
        matchedRelationships.push(...validRelationships);
        totalScore += 1.0;
      } else {
        totalScore += validRelationships.length / requiredCount;
      }
    }
    
    return totalScore / totalRequirements;
  }
  
  /**
   * Score naming pattern matching
   */
  private scoreNamingMatch(
    pattern: UniversalPatternDefinition,
    symbols: UniversalSymbol[],
    _language: string
  ): number {
    if (!pattern.criteria.namingPatterns) return 1.0;
    
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const namingPattern of pattern.criteria.namingPatterns) {
      const candidates = symbols.filter(s => 
        namingPattern.patterns.some(p => p.test(s.name))
      );
      
      const score = candidates.length > 0 ? 1.0 : 0.0;
      totalScore += score * namingPattern.weight;
      totalWeight += namingPattern.weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 1.0;
  }
  
  /**
   * Score structural rule matching
   */
  private scoreStructuralMatch(
    pattern: UniversalPatternDefinition,
    matchedSymbols: Map<string, UniversalSymbol[]>
  ): number {
    if (!pattern.criteria.structuralRules) return 1.0;
    
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const rule of pattern.criteria.structuralRules) {
      const isValid = rule.validator(matchedSymbols);
      totalScore += (isValid ? 1.0 : 0.0) * rule.weight;
      totalWeight += rule.weight;
    }
    
    return totalWeight > 0 ? totalScore / totalWeight : 1.0;
  }
  
  /**
   * Apply language-specific variation to pattern
   */
  private applyLanguageVariation(
    pattern: UniversalPatternDefinition,
    language: string
  ): UniversalPatternDefinition {
    const variation = pattern.languageVariations?.[language];
    if (!variation) return pattern;
    
    // Create a modified pattern with language-specific rules
    return {
      ...pattern,
      criteria: {
        ...pattern.criteria,
        structuralRules: [
          ...(pattern.criteria.structuralRules || []),
          ...variation.languageSpecificRules
        ]
      }
    };
  }
  
  /**
   * Assess pattern quality and generate recommendations
   */
  private assessPatternQuality(
    pattern: UniversalPatternDefinition,
    matchedSymbols: Map<string, UniversalSymbol[]>,
    matchedRelationships: UniversalRelationship[],
    totalScore: number
  ): { quality: PatternDetectionResult['quality'], issues: string[], recommendations: string[] } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Quality assessment based on score
    let quality: PatternDetectionResult['quality'] = 'poor';
    if (totalScore >= 0.9) quality = 'excellent';
    else if (totalScore >= 0.7) quality = 'good';
    else if (totalScore >= 0.5) quality = 'fair';
    
    // Check for common issues
    if (totalScore < 0.6) {
      issues.push('Pattern implementation incomplete');
      recommendations.push('Review pattern requirements and ensure all components are properly implemented');
    }
    
    // Check symbol naming consistency
    const allSymbols = Array.from(matchedSymbols.values()).flat();
    const namingConsistency = this.checkNamingConsistency(allSymbols);
    if (namingConsistency < 0.7) {
      issues.push('Inconsistent naming conventions');
      recommendations.push('Standardize naming conventions across pattern components');
    }
    
    // Check relationship strength
    const avgRelationshipConfidence = matchedRelationships.length > 0
      ? matchedRelationships.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / matchedRelationships.length
      : 0.5;
    
    if (avgRelationshipConfidence < 0.6) {
      issues.push('Weak relationships between pattern components');
      recommendations.push('Strengthen coupling between pattern components');
    }
    
    return { quality, issues, recommendations };
  }
  
  /**
   * Check naming consistency across symbols
   */
  private checkNamingConsistency(symbols: UniversalSymbol[]): number {
    if (symbols.length < 2) return 1.0;
    
    // Simple heuristic: check if symbols follow similar naming patterns
    const namingStyles = symbols.map(s => this.detectNamingStyle(s.name));
    const mostCommonStyle = this.getMostCommon(namingStyles);
    const consistency = namingStyles.filter(style => style === mostCommonStyle).length / namingStyles.length;
    
    return consistency;
  }
  
  /**
   * Detect naming style (camelCase, snake_case, etc.)
   */
  private detectNamingStyle(name: string): string {
    if (name.includes('_')) return 'snake_case';
    if (name[0] === name[0].toLowerCase() && /[A-Z]/.test(name)) return 'camelCase';
    if (name[0] === name[0].toUpperCase()) return 'PascalCase';
    if (name === name.toUpperCase()) return 'UPPER_CASE';
    return 'unknown';
  }
  
  /**
   * Get most common item in array
   */
  private getMostCommon<T>(items: T[]): T {
    const counts = new Map<T, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    
    let maxCount = 0;
    let mostCommon = items[0];
    
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }
    
    return mostCommon;
  }
  
  /**
   * Initialize built-in universal patterns
   */
  private initializeBuiltInPatterns(): void {
    // Singleton Pattern (Universal)
    this.registerPattern({
      id: 'singleton',
      name: 'Singleton Pattern',
      description: 'Ensures a class has only one instance and provides global access',
      category: 'creational',
      languages: ['*'],
      criteria: {
        requiredSymbols: [
          {
            kind: UniversalSymbolKind.Class,
            role: 'singleton',
            minCount: 1,
            maxCount: 1,
            semanticTags: ['static']
          }
        ],
        namingPatterns: [
          {
            role: 'singleton',
            patterns: [/instance/i, /singleton/i, /getInstance/i],
            weight: 1.0
          }
        ],
        structuralRules: [
          {
            rule: 'has_private_constructor',
            weight: 1.0,
            validator: (symbols) => {
              const singletonSymbols = symbols.get('singleton') || [];
              return singletonSymbols.some(s => 
                s.semanticTags?.includes('private') || 
                s.languageFeatures?.isPrivate
              );
            }
          }
        ]
      },
      weights: {
        symbols: 0.3,
        relationships: 0.2,
        naming: 0.3,
        structure: 0.2
      }
    });
    
    // Factory Pattern (Universal)
    this.registerPattern({
      id: 'factory',
      name: 'Factory Pattern',
      description: 'Creates objects without specifying exact classes',
      category: 'creational',
      languages: ['*'],
      criteria: {
        requiredSymbols: [
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Interface],
            role: 'factory',
            minCount: 1,
            namePattern: /(factory|creator|builder)/i
          },
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Interface],
            role: 'product',
            minCount: 2 // Multiple products
          }
        ],
        requiredRelationships: [
          {
            type: [UniversalRelationshipType.Uses, UniversalRelationshipType.Calls],
            fromRole: 'factory',
            toRole: 'product',
            minCount: 1
          }
        ],
        namingPatterns: [
          {
            role: 'factory',
            patterns: [/factory/i, /creator/i, /make/i, /create/i],
            weight: 1.0
          }
        ]
      },
      weights: {
        symbols: 0.3,
        relationships: 0.4,
        naming: 0.2,
        structure: 0.1
      }
    });
    
    // Observer Pattern (Universal)
    this.registerPattern({
      id: 'observer',
      name: 'Observer Pattern',
      description: 'Defines one-to-many dependency between objects',
      category: 'behavioral',
      languages: ['*'],
      criteria: {
        requiredSymbols: [
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Interface],
            role: 'subject',
            minCount: 1,
            namePattern: /(subject|observable|publisher)/i
          },
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Interface],
            role: 'observer',
            minCount: 1,
            namePattern: /(observer|listener|subscriber)/i
          }
        ],
        requiredRelationships: [
          {
            type: [UniversalRelationshipType.Uses, UniversalRelationshipType.Calls],
            fromRole: 'subject',
            toRole: 'observer',
            minCount: 1
          }
        ],
        namingPatterns: [
          {
            role: 'observer',
            patterns: [/observer/i, /listener/i, /subscriber/i, /watcher/i],
            weight: 1.0
          },
          {
            role: 'subject',
            patterns: [/subject/i, /observable/i, /publisher/i, /notifier/i],
            weight: 1.0
          }
        ]
      },
      weights: {
        symbols: 0.3,
        relationships: 0.4,
        naming: 0.2,
        structure: 0.1
      }
    });
    
    // MVC Pattern (Architectural)
    this.registerPattern({
      id: 'mvc',
      name: 'Model-View-Controller',
      description: 'Separates application logic into three interconnected components',
      category: 'architectural',
      languages: ['*'],
      criteria: {
        requiredSymbols: [
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Module],
            role: 'model',
            minCount: 1,
            namePattern: /model/i
          },
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Module],
            role: 'view',
            minCount: 1,
            namePattern: /view/i
          },
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Module],
            role: 'controller',
            minCount: 1,
            namePattern: /controller/i
          }
        ],
        requiredRelationships: [
          {
            type: UniversalRelationshipType.Uses,
            fromRole: 'controller',
            toRole: 'model',
            minCount: 1
          },
          {
            type: UniversalRelationshipType.Uses,
            fromRole: 'controller',
            toRole: 'view',
            minCount: 1
          }
        ]
      },
      weights: {
        symbols: 0.4,
        relationships: 0.3,
        naming: 0.2,
        structure: 0.1
      }
    });
    
    // Repository Pattern (Universal)
    this.registerPattern({
      id: 'repository',
      name: 'Repository Pattern',
      description: 'Encapsulates data access logic and provides centralized data access',
      category: 'structural',
      languages: ['*'],
      criteria: {
        requiredSymbols: [
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Interface],
            role: 'repository',
            minCount: 1,
            namePattern: /(repository|dao|dataaccess)/i
          },
          {
            kind: [UniversalSymbolKind.Class, UniversalSymbolKind.Interface],
            role: 'entity',
            minCount: 1
          }
        ],
        namingPatterns: [
          {
            role: 'repository',
            patterns: [/repository/i, /dao/i, /dataaccess/i, /store/i],
            weight: 1.0
          }
        ]
      },
      weights: {
        symbols: 0.4,
        relationships: 0.2,
        naming: 0.3,
        structure: 0.1
      }
    });
  }
}