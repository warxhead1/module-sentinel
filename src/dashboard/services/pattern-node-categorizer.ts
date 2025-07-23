/**
 * PatternNodeCategorizer Service
 * 
 * Provides intelligent pattern-based categorization and classification for graph nodes.
 * Analyzes detected patterns to provide hierarchical classification, health assessment,
 * and relationship mapping between pattern instances.
 */

import { GraphNode } from '../../shared/types/api.js';

export interface PatternClassification {
  primaryPattern: {
    name: string;
    family: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'concurrency';
    strength: number;
    role: 'creator' | 'consumer' | 'coordinator' | 'observer' | 'mediator' | 'subject';
    health: 'healthy' | 'warning' | 'problematic' | 'anti-pattern';
  };
  secondaryPatterns: Array<{
    name: string;
    family: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'concurrency';
    strength: number;
    role: string;
  }>;
  patternMetrics: {
    patternComplexity: number;
    patternConsistency: number;
    refactoringPriority: 'none' | 'low' | 'medium' | 'high' | 'critical';
    evolutionStage: 'emerging' | 'stable' | 'mature' | 'degrading' | 'legacy';
  };
}

export interface PatternDefinition {
  name: string;
  family: 'creational' | 'structural' | 'behavioral' | 'architectural' | 'concurrency';
  indicators: string[]; // Keywords/patterns that indicate this pattern
  roles: string[]; // Possible roles a node can play in this pattern
  antiPatterns: string[]; // Related anti-patterns
  healthChecks: {
    good: string[]; // Indicators of good implementation
    warning: string[]; // Indicators of suboptimal implementation
    problematic: string[]; // Indicators of poor implementation
  };
}

export class PatternNodeCategorizer {
  private patternDefinitions: Map<string, PatternDefinition>;
  
  constructor() {
    this.patternDefinitions = new Map();
    this.initializePatternDefinitions();
  }

  /**
   * Categorize a node based on its detected patterns and other properties
   */
  public categorizeNode(node: GraphNode): PatternClassification | null {
    if (!node.patterns?.detectedPatterns || node.patterns.detectedPatterns.length === 0) {
      return null;
    }

    // Analyze all detected patterns and rank them
    const rankedPatterns = this.rankPatterns(node);
    
    if (rankedPatterns.length === 0) {
      return null;
    }

    // Select primary pattern (highest ranked)
    const primaryPattern = rankedPatterns[0];
    
    // Select secondary patterns (next highest ranked, up to 3)
    const secondaryPatterns = rankedPatterns.slice(1, 4);

    // Calculate pattern metrics
    const patternMetrics = this.calculatePatternMetrics(node, primaryPattern);

    return {
      primaryPattern: {
        name: primaryPattern.name,
        family: primaryPattern.family,
        strength: primaryPattern.strength,
        role: this.determinePatternRole(node, primaryPattern.name),
        health: this.assessPatternHealth(node, primaryPattern.name)
      },
      secondaryPatterns: secondaryPatterns.map(pattern => ({
        name: pattern.name,
        family: pattern.family,
        strength: pattern.strength,
        role: this.determinePatternRole(node, pattern.name)
      })),
      patternMetrics
    };
  }

  /**
   * Initialize pattern definitions with detection rules
   */
  private initializePatternDefinitions(): void {
    // Creational Patterns
    this.patternDefinitions.set('Factory', {
      name: 'Factory',
      family: 'creational',
      indicators: ['factory', 'create', 'make', 'build', 'getInstance'],
      roles: ['creator', 'product'],
      antiPatterns: ['god-object'],
      healthChecks: {
        good: ['single-responsibility', 'interface-segregation', 'dependency-injection'],
        warning: ['high-complexity', 'many-parameters'],
        problematic: ['god-object', 'tight-coupling', 'hardcoded-dependencies']
      }
    });

    this.patternDefinitions.set('Singleton', {
      name: 'Singleton',
      family: 'creational',
      indicators: ['singleton', 'getInstance', 'static-instance'],
      roles: ['creator', 'instance'],
      antiPatterns: ['global-state', 'hidden-dependencies'],
      healthChecks: {
        good: ['thread-safe', 'lazy-initialization'],
        warning: ['eager-initialization', 'mutable-state'],
        problematic: ['global-state', 'tight-coupling', 'testing-difficulties']
      }
    });

    this.patternDefinitions.set('Builder', {
      name: 'Builder',
      family: 'creational',
      indicators: ['builder', 'build', 'with', 'set', 'fluent-interface'],
      roles: ['creator', 'director', 'product'],
      antiPatterns: ['telescoping-constructor'],
      healthChecks: {
        good: ['fluent-interface', 'immutable-products', 'validation'],
        warning: ['complex-builder', 'incomplete-validation'],
        problematic: ['mutable-products', 'no-validation', 'god-builder']
      }
    });

    // Structural Patterns
    this.patternDefinitions.set('Decorator', {
      name: 'Decorator',
      family: 'structural',
      indicators: ['decorator', 'wrapper', 'enhance', 'extend'],
      roles: ['decorator', 'component', 'concrete-decorator'],
      antiPatterns: ['feature-envy'],
      healthChecks: {
        good: ['composition-over-inheritance', 'interface-based', 'single-responsibility'],
        warning: ['deep-nesting', 'performance-overhead'],
        problematic: ['inheritance-abuse', 'circular-dependencies', 'god-decorator']
      }
    });

    this.patternDefinitions.set('Adapter', {
      name: 'Adapter',
      family: 'structural',
      indicators: ['adapter', 'wrapper', 'bridge', 'convert', 'translate'],
      roles: ['adapter', 'adaptee', 'target'],
      antiPatterns: ['impedance-mismatch'],
      healthChecks: {
        good: ['clean-interface', 'minimal-translation', 'error-handling'],
        warning: ['complex-translation', 'data-loss'],
        problematic: ['leaky-abstraction', 'performance-bottleneck', 'god-adapter']
      }
    });

    // Behavioral Patterns
    this.patternDefinitions.set('Observer', {
      name: 'Observer',
      family: 'behavioral',
      indicators: ['observer', 'notify', 'subscribe', 'listen', 'event', 'signal'],
      roles: ['subject', 'observer', 'concrete-observer'],
      antiPatterns: ['event-spam', 'memory-leaks'],
      healthChecks: {
        good: ['weak-references', 'async-notifications', 'error-isolation'],
        warning: ['synchronous-notifications', 'many-observers'],
        problematic: ['memory-leaks', 'circular-notifications', 'event-spam']
      }
    });

    this.patternDefinitions.set('Command', {
      name: 'Command',
      family: 'behavioral',
      indicators: ['command', 'execute', 'undo', 'redo', 'invoke', 'action'],
      roles: ['command', 'invoker', 'receiver'],
      antiPatterns: ['anemic-command'],
      healthChecks: {
        good: ['undoable', 'composable', 'stateless'],
        warning: ['stateful-commands', 'complex-commands'],
        problematic: ['anemic-command', 'god-command', 'tight-coupling']
      }
    });

    this.patternDefinitions.set('State', {
      name: 'State',
      family: 'behavioral',
      indicators: ['state', 'transition', 'context', 'currentState'],
      roles: ['context', 'state', 'concrete-state'],
      antiPatterns: ['state-explosion', 'god-state'],
      healthChecks: {
        good: ['clear-transitions', 'immutable-states', 'validation'],
        warning: ['complex-states', 'many-transitions'],
        problematic: ['state-explosion', 'invalid-transitions', 'god-state']
      }
    });

    // Architectural Patterns
    this.patternDefinitions.set('MVC', {
      name: 'MVC',
      family: 'architectural',
      indicators: ['controller', 'model', 'view', 'mvc'],
      roles: ['model', 'view', 'controller'],
      antiPatterns: ['fat-controller', 'anemic-model'],
      healthChecks: {
        good: ['separation-of-concerns', 'testable', 'loose-coupling'],
        warning: ['fat-controller', 'fat-model'],
        problematic: ['god-controller', 'anemic-model', 'tight-coupling']
      }
    });

    this.patternDefinitions.set('Repository', {
      name: 'Repository',
      family: 'architectural',
      indicators: ['repository', 'dao', 'data-access', 'persistence'],
      roles: ['repository', 'entity', 'data-mapper'],
      antiPatterns: ['generic-repository'],
      healthChecks: {
        good: ['domain-specific', 'testable', 'abstraction'],
        warning: ['generic-repository', 'leaky-abstraction'],
        problematic: ['god-repository', 'data-access-mixing', 'tight-coupling']
      }
    });

    // Concurrency Patterns
    this.patternDefinitions.set('Producer-Consumer', {
      name: 'Producer-Consumer',
      family: 'concurrency',
      indicators: ['producer', 'consumer', 'queue', 'buffer', 'publish', 'subscribe'],
      roles: ['producer', 'consumer', 'buffer'],
      antiPatterns: ['busy-waiting', 'race-conditions'],
      healthChecks: {
        good: ['bounded-buffer', 'proper-synchronization', 'backpressure'],
        warning: ['unbounded-buffer', 'blocking-operations'],
        problematic: ['race-conditions', 'deadlock', 'resource-leaks']
      }
    });
  }

  /**
   * Rank detected patterns by strength and relevance
   */
  private rankPatterns(node: GraphNode): Array<{name: string, family: any, strength: number}> {
    const detectedPatterns = node.patterns?.detectedPatterns || [];
    const ranked: Array<{name: string, family: any, strength: number}> = [];

    for (const patternName of detectedPatterns) {
      const definition = this.patternDefinitions.get(patternName);
      if (!definition) continue;

      const strength = this.calculatePatternStrength(node, definition);
      ranked.push({
        name: patternName,
        family: definition.family,
        strength
      });
    }

    // Sort by strength (highest first)
    return ranked.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Calculate pattern strength based on indicators and node properties
   */
  private calculatePatternStrength(node: GraphNode, pattern: PatternDefinition): number {
    let strength = 50; // Base strength

    // Check for pattern indicators in node name/signature
    const nodeText = `${node.name} ${node.signature || ''} ${node.type}`.toLowerCase();
    const matchingIndicators = pattern.indicators.filter(indicator => 
      nodeText.includes(indicator.toLowerCase())
    ).length;
    
    strength += matchingIndicators * 15; // Each matching indicator adds 15 points

    // Check semantic tags
    const semanticTags = node.semanticTags || [];
    const tagMatches = semanticTags.filter(tag => 
      pattern.indicators.some(indicator => tag.toLowerCase().includes(indicator.toLowerCase()))
    ).length;
    
    strength += tagMatches * 10; // Each matching tag adds 10 points

    // Check for anti-patterns (reduce strength)
    const antiPatternMatches = (node.patterns?.antiPatterns || []).filter(antiPattern =>
      pattern.antiPatterns.includes(antiPattern)
    ).length;
    
    strength -= antiPatternMatches * 20; // Each anti-pattern reduces by 20 points

    // Consider parser confidence
    if (node.confidence !== undefined) {
      strength *= node.confidence;
    }

    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, Math.round(strength)));
  }

  /**
   * Determine the role of a node in a specific pattern
   */
  private determinePatternRole(node: GraphNode, patternName: string): 'creator' | 'consumer' | 'coordinator' | 'observer' | 'mediator' | 'subject' {
    const definition = this.patternDefinitions.get(patternName);
    if (!definition) return 'consumer';

    const nodeText = `${node.name} ${node.signature || ''} ${node.type}`.toLowerCase();

    // Pattern-specific role detection
    switch (patternName) {
      case 'Factory':
        if (nodeText.includes('create') || nodeText.includes('make') || nodeText.includes('factory')) {
          return 'creator';
        }
        return 'consumer';

      case 'Observer':
        if (nodeText.includes('notify') || nodeText.includes('publish') || nodeText.includes('emit')) {
          return 'subject';
        }
        if (nodeText.includes('observe') || nodeText.includes('listen') || nodeText.includes('subscribe')) {
          return 'observer';
        }
        return 'consumer';

      case 'Command':
        if (nodeText.includes('execute') || nodeText.includes('invoke') || nodeText.includes('run')) {
          return 'coordinator';
        }
        return 'consumer';

      case 'MVC':
        if (node.type === 'class' && nodeText.includes('controller')) {
          return 'coordinator';
        }
        if (node.type === 'class' && (nodeText.includes('model') || nodeText.includes('entity'))) {
          return 'subject';
        }
        if (nodeText.includes('view') || nodeText.includes('ui') || nodeText.includes('component')) {
          return 'observer';
        }
        return 'consumer';

      default:
        return 'consumer';
    }
  }

  /**
   * Assess the health of a pattern implementation
   */
  private assessPatternHealth(node: GraphNode, patternName: string): 'healthy' | 'warning' | 'problematic' | 'anti-pattern' {
    const definition = this.patternDefinitions.get(patternName);
    if (!definition) return 'warning';

    // Check for anti-patterns first
    const antiPatterns = node.patterns?.antiPatterns || [];
    if (antiPatterns.some(ap => definition.antiPatterns.includes(ap))) {
      return 'anti-pattern';
    }

    const codeSmells = node.patterns?.codeSmells || [];
    const semanticTags = node.semanticTags || [];
    const nodeText = `${node.name} ${node.signature || ''} ${node.type}`.toLowerCase();

    // Count health indicators
    let goodIndicators = 0;
    let warningIndicators = 0;
    let problematicIndicators = 0;

    // Check good indicators
    goodIndicators += definition.healthChecks.good.filter(indicator =>
      semanticTags.some(tag => tag.includes(indicator)) || nodeText.includes(indicator)
    ).length;

    // Check warning indicators
    warningIndicators += definition.healthChecks.warning.filter(indicator =>
      semanticTags.some(tag => tag.includes(indicator)) || 
      nodeText.includes(indicator) ||
      codeSmells.includes(indicator)
    ).length;

    // Check problematic indicators
    problematicIndicators += definition.healthChecks.problematic.filter(indicator =>
      codeSmells.includes(indicator) || 
      antiPatterns.includes(indicator)
    ).length;

    // Consider complexity metrics
    const complexity = node.metrics?.cyclomaticComplexity || 0;
    if (complexity > 15) problematicIndicators++;
    else if (complexity > 10) warningIndicators++;

    // Determine overall health
    if (problematicIndicators > 0) return 'problematic';
    if (warningIndicators > goodIndicators) return 'warning';
    if (goodIndicators > 0) return 'healthy';
    
    return 'warning'; // Default
  }

  /**
   * Calculate comprehensive pattern metrics
   */
  private calculatePatternMetrics(node: GraphNode, primaryPattern: {name: string, family: any, strength: number}): {
    patternComplexity: number;
    patternConsistency: number;
    refactoringPriority: 'none' | 'low' | 'medium' | 'high' | 'critical';
    evolutionStage: 'emerging' | 'stable' | 'mature' | 'degrading' | 'legacy';
  } {
    // Calculate pattern complexity (0-100)
    const cyclomaticComplexity = node.metrics?.cyclomaticComplexity || 1;
    const nestingDepth = node.metrics?.nestingDepth || 1;
    const patternComplexity = Math.min(100, (cyclomaticComplexity * 5) + (nestingDepth * 10));

    // Calculate pattern consistency (how well it matches the standard pattern)
    const patternConsistency = primaryPattern.strength;

    // Determine refactoring priority
    const antiPatternCount = (node.patterns?.antiPatterns || []).length;
    const codeSmellCount = (node.patterns?.codeSmells || []).length;
    
    let refactoringPriority: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    if (antiPatternCount > 2 || codeSmellCount > 3) refactoringPriority = 'critical';
    else if (antiPatternCount > 1 || codeSmellCount > 2) refactoringPriority = 'high';
    else if (antiPatternCount > 0 || codeSmellCount > 1) refactoringPriority = 'medium';
    else if (patternConsistency < 60) refactoringPriority = 'low';

    // Determine evolution stage
    let evolutionStage: 'emerging' | 'stable' | 'mature' | 'degrading' | 'legacy' = 'stable';
    if (patternConsistency < 40) evolutionStage = 'emerging';
    else if (patternConsistency > 80 && antiPatternCount === 0) evolutionStage = 'mature';
    else if (antiPatternCount > 1 || codeSmellCount > 2) evolutionStage = 'degrading';
    else if (codeSmellCount > 3) evolutionStage = 'legacy';

    return {
      patternComplexity,
      patternConsistency,
      refactoringPriority,
      evolutionStage
    };
  }

  /**
   * Get all supported pattern families
   */
  public getPatternFamilies(): string[] {
    const families = new Set<string>();
    for (const definition of this.patternDefinitions.values()) {
      families.add(definition.family);
    }
    return Array.from(families);
  }

  /**
   * Get patterns by family
   */
  public getPatternsByFamily(family: string): PatternDefinition[] {
    return Array.from(this.patternDefinitions.values())
      .filter(pattern => pattern.family === family);
  }

  /**
   * Get pattern definition by name
   */
  public getPatternDefinition(name: string): PatternDefinition | undefined {
    return this.patternDefinitions.get(name);
  }
}