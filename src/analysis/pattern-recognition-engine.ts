/**
 * Pattern Recognition Engine
 * 
 * Consolidates all pattern detection, architectural analysis, and quality assessment
 * from the semantic analysis system. Provides clean separation of pattern recognition
 * concerns from complexity metrics.
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import { Logger, createLogger } from "../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../utils/memory-monitor.js";
import { SymbolInfo, RelationshipInfo } from "../parsers/tree-sitter/parser-types.js";
import { UniversalSymbol } from "../types/universal-types.js";

export interface PatternAnalysisInput {
  symbol: SymbolInfo | UniversalSymbol;
  sourceCode: string;
  ast?: Parser.Tree;
  relationships: RelationshipInfo[];
  filePath?: string;
}

export interface SemanticRole {
  primary: "data" | "behavior" | "control" | "interface" | "utility" | "configuration";
  secondary?: string[];
  confidence: number;
}

export interface UsagePattern {
  pattern: "creator" | "consumer" | "transformer" | "validator" | "coordinator" | "observer";
  frequency: number;
  context: string[];
  examples: UsageExample[];
}

export interface UsageExample {
  filePath: string;
  lineNumber: number;
  codeSnippet: string;
  context: string;
}

export interface ArchitecturalLayer {
  layer: "presentation" | "business" | "data" | "infrastructure" | "cross-cutting" | "unknown";
  subLayer?: string;
  confidence: number;
}

export interface ModuleRole {
  role: "entry-point" | "core-logic" | "utility" | "bridge" | "facade" | "adapter" | "factory";
  importance: "critical" | "important" | "supporting" | "utility";
  publicInterface: boolean;
}

export interface ComponentType {
  type: "controller" | "service" | "model" | "view" | "repository" | "helper" | "config" | "test";
  subType?: string;
  confidence: number;
}

export interface QualityIndicator {
  type: "code-smell" | "anti-pattern" | "best-practice" | "optimization-opportunity";
  name: string;
  severity: "info" | "warning" | "error" | "critical";
  description: string;
  confidence: number;
  suggestion?: string;
}

export interface AlgorithmicPattern {
  pattern: "loop-accumulation" | "recursive" | "divide-conquer" | "dynamic-programming" | 
           "greedy" | "backtracking" | "state-machine" | "pipeline" | "map-reduce";
  confidence: number;
  complexity: "O(1)" | "O(log n)" | "O(n)" | "O(n log n)" | "O(n²)" | "O(2^n)" | "O(n!)" | "unknown";
  characteristics: string[];
}

export interface SemanticRelationship {
  targetSymbolId: number | string;
  relationshipType: "uses" | "extends" | "implements" | "composes" | "aggregates" | "depends-on" | "similar-to";
  strength: number;
  semanticSimilarity: number;
  functionalSimilarity: number;
  context: string;
}

export interface PerformanceCharacteristics {
  executionMode: "cpu-intensive" | "io-intensive" | "memory-intensive" | "network-intensive" | "balanced";
  scalability: "constant" | "linear" | "logarithmic" | "polynomial" | "exponential" | "unknown";
  resourceUsage: {
    memory: "low" | "medium" | "high" | "unknown";
    cpu: "low" | "medium" | "high" | "unknown";
    io: "low" | "medium" | "high" | "unknown";
  };
  parallelizable: boolean;
  cacheable: boolean;
}

export interface ReadabilityMetrics {
  namingQuality: number;
  commentQuality: number;
  structureClarity: number;
  overallReadability: number;
  improvementSuggestions: string[];
}

export interface RefactoringOpportunity {
  type: "extract-method" | "extract-class" | "inline" | "move-method" | "rename" | "simplify";
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  effort: "trivial" | "easy" | "moderate" | "difficult";
  benefit: string;
  risks: string[];
}

export interface PatternAnalysisResult {
  semanticRole: SemanticRole;
  usagePatterns: UsagePattern[];
  architecturalLayer: ArchitecturalLayer;
  moduleRole: ModuleRole;
  componentType: ComponentType;
  qualityIndicators: QualityIndicator[];
  algorithmicPatterns: AlgorithmicPattern[];
  semanticRelationships: SemanticRelationship[];
  performanceCharacteristics: PerformanceCharacteristics;
  readabilityMetrics: ReadabilityMetrics;
  refactoringOpportunities: RefactoringOpportunity[];
}

export class PatternRecognitionEngine {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private db?: Database;

  constructor(db?: Database) {
    this.logger = createLogger('PatternRecognitionEngine');
    this.memoryMonitor = getGlobalMemoryMonitor();
    this.db = db;
  }

  /**
   * Analyze all patterns for a given symbol
   */
  async analyzePatterns(input: PatternAnalysisInput): Promise<PatternAnalysisResult> {
    const checkpoint = this.memoryMonitor.createCheckpoint('analyzePatterns');
    
    try {
      this.logger.debug('Analyzing symbol patterns', { symbolName: input.symbol.name });

      // Analyze different pattern types in parallel with timeouts
      const analysisPromises = [
        this.withTimeout(this.analyzeSemanticRole(input), 1000, "semantic role"),
        this.withTimeout(this.analyzeUsagePatterns(input), 500, "usage patterns"),
        this.withTimeout(this.analyzeArchitecturalLayer(input), 300, "architectural layer"),
        this.withTimeout(this.analyzeModuleRole(input), 300, "module role"),
        this.withTimeout(this.analyzeComponentType(input), 300, "component type"),
        this.withTimeout(this.identifyQualityIndicators(input), 500, "quality indicators"),
        this.withTimeout(this.recognizeAlgorithmicPatterns(input), 500, "algorithmic patterns"),
        this.withTimeout(this.analyzeSemanticRelationships(input), 300, "semantic relationships"),
        this.withTimeout(this.analyzePerformanceCharacteristics(input), 500, "performance characteristics"),
        this.withTimeout(this.analyzeReadability(input), 300, "readability"),
      ];

      const results = await Promise.allSettled(analysisPromises);

      // Extract results with graceful fallbacks
      const semanticRole = this.getResult(results[0], { primary: "utility" as const, confidence: 0.1 }) as SemanticRole;
      const usagePatterns = this.getResult(results[1], []) as UsagePattern[];
      const architecturalLayer = this.getResult(results[2], { layer: "unknown" as const, confidence: 0.1 }) as ArchitecturalLayer;
      const moduleRole = this.getResult(results[3], { role: "utility" as const, importance: "utility" as const, publicInterface: false }) as ModuleRole;
      const componentType = this.getResult(results[4], { type: "helper" as const, confidence: 0.1 }) as ComponentType;
      const qualityIndicators = this.getResult(results[5], []) as QualityIndicator[];
      const algorithmicPatterns = this.getResult(results[6], []) as AlgorithmicPattern[];
      const semanticRelationships = this.getResult(results[7], []) as SemanticRelationship[];
      const performanceCharacteristics = this.getResult(results[8], this.getDefaultPerformanceCharacteristics()) as PerformanceCharacteristics;
      const readabilityMetrics = this.getResult(results[9], this.getDefaultReadabilityMetrics()) as ReadabilityMetrics;

      // Generate refactoring opportunities based on analysis
      const refactoringOpportunities = this.identifyRefactoringOpportunities(
        input, qualityIndicators, algorithmicPatterns
      );

      return {
        semanticRole,
        usagePatterns,
        architecturalLayer,
        moduleRole,
        componentType,
        qualityIndicators,
        algorithmicPatterns,
        semanticRelationships,
        performanceCharacteristics,
        readabilityMetrics,
        refactoringOpportunities
      };

    } catch (error) {
      this.logger.error('Pattern analysis failed', error);
      return this.getDefaultPatternAnalysis();
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Analyze the primary semantic role of a symbol
   */
  private async analyzeSemanticRole(input: PatternAnalysisInput): Promise<SemanticRole> {
    const indicators = {
      data: 0,
      behavior: 0,
      control: 0,
      interface: 0,
      utility: 0,
      configuration: 0,
    };

    // Analyze based on symbol kind
    switch (input.symbol.kind) {
      case "class":
      case "struct": {
        const hasDataMembers = input.sourceCode.includes("private:") || input.sourceCode.includes("public:");
        const hasVirtualMethods = input.sourceCode.includes("virtual") || input.sourceCode.includes("override");

        if (hasVirtualMethods) indicators.interface += 0.6;
        if (hasDataMembers) indicators.data += 0.4;
        indicators.behavior += 0.3;
        break;
      }

      case "function":
      case "method":
        if (input.symbol.name.includes("get") || input.symbol.name.includes("set")) {
          indicators.data += 0.5;
        }
        if (input.symbol.name.includes("validate") || input.symbol.name.includes("check")) {
          indicators.utility += 0.4;
        }
        if (input.symbol.name.includes("control") || input.symbol.name.includes("manage")) {
          indicators.control += 0.6;
        }
        indicators.behavior += 0.4;
        break;

      case "interface":
        indicators.interface += 0.8;
        break;

      case "enum":
      case "constant":
        indicators.configuration += 0.7;
        indicators.data += 0.3;
        break;

      default:
        indicators.utility += 0.5;
    }

    // Analyze naming patterns
    const nameAnalysis = this.analyzeNamingPatterns(input.symbol.name);
    Object.keys(nameAnalysis).forEach((key) => {
      if (key in indicators) {
        indicators[key as keyof typeof indicators] += nameAnalysis[key] * 0.3;
      }
    });

    // Find the primary role
    const primaryRole = Object.entries(indicators).sort(([, a], [, b]) => b - a)[0][0] as SemanticRole["primary"];
    const confidence = Math.min(1.0, indicators[primaryRole as keyof typeof indicators]);

    return {
      primary: primaryRole,
      confidence: Math.max(0.1, confidence),
    };
  }

  /**
   * Analyze usage patterns based on relationships
   */
  private async analyzeUsagePatterns(input: PatternAnalysisInput): Promise<UsagePattern[]> {
    const patterns: UsagePattern[] = [];

    const incomingRels = input.relationships.filter((r) => r.toName === input.symbol.name);
    const outgoingRels = input.relationships.filter((r) => r.fromName === input.symbol.name);

    // Creator pattern: creates or instantiates other objects
    const createsCount = outgoingRels.filter((r) =>
      r.relationshipType === "creates" || r.relationshipType === "instantiates"
    ).length;

    if (createsCount > 0) {
      patterns.push({
        pattern: "creator",
        frequency: createsCount,
        context: ["object-creation", "factory-method"],
        examples: [],
      });
    }

    // Consumer pattern: uses other objects/services
    const usesCount = outgoingRels.filter((r) => 
      r.relationshipType === "uses" || r.relationshipType === "calls"
    ).length;

    if (usesCount > 2) {
      patterns.push({
        pattern: "consumer",
        frequency: usesCount,
        context: ["service-usage", "dependency-injection"],
        examples: [],
      });
    }

    // Observer pattern: is notified by other objects
    const observesCount = incomingRels.filter((r) =>
      r.relationshipType === "notifies" || r.relationshipType === "signals"
    ).length;

    if (observesCount > 0) {
      patterns.push({
        pattern: "observer",
        frequency: observesCount,
        context: ["event-handling", "notification"],
        examples: [],
      });
    }

    // Transformer pattern: processes and transforms data
    if (this.detectTransformerPattern(input)) {
      patterns.push({
        pattern: "transformer",
        frequency: 1,
        context: ["data-transformation", "processing"],
        examples: [],
      });
    }

    return patterns;
  }

  /**
   * Analyze architectural layer based on symbol and file path
   */
  private async analyzeArchitecturalLayer(input: PatternAnalysisInput): Promise<ArchitecturalLayer> {
    const filePath = input.filePath || "";
    const lowerPath = filePath.toLowerCase();
    const symbolName = input.symbol.name.toLowerCase();

    // Analyze file path patterns
    if (lowerPath.includes("gui") || lowerPath.includes("ui") || lowerPath.includes("view")) {
      return { layer: "presentation", confidence: 0.8 };
    }
    
    if (lowerPath.includes("controller") || lowerPath.includes("handler")) {
      return { layer: "presentation", subLayer: "controller", confidence: 0.7 };
    }
    
    if (lowerPath.includes("service") || lowerPath.includes("business") || lowerPath.includes("logic")) {
      return { layer: "business", confidence: 0.8 };
    }
    
    if (lowerPath.includes("repository") || lowerPath.includes("dao") || lowerPath.includes("database")) {
      return { layer: "data", confidence: 0.8 };
    }
    
    if (lowerPath.includes("util") || lowerPath.includes("helper") || lowerPath.includes("common")) {
      return { layer: "cross-cutting", confidence: 0.7 };
    }

    // Analyze symbol name patterns
    if (symbolName.includes("render") || symbolName.includes("display")) {
      return { layer: "presentation", confidence: 0.6 };
    }
    
    if (symbolName.includes("process") || symbolName.includes("calculate")) {
      return { layer: "business", confidence: 0.6 };
    }

    return { layer: "unknown", confidence: 0.1 };
  }

  /**
   * Analyze module role within the system
   */
  private async analyzeModuleRole(input: PatternAnalysisInput): Promise<ModuleRole> {
    const symbolName = input.symbol.name.toLowerCase();
    const relationships = input.relationships;

    // Determine public interface
    const isPublic = input.symbol.name.charAt(0) !== '_' && 
                    !symbolName.includes("private") && 
                    !symbolName.includes("internal");

    // Analyze role based on name and usage
    if (symbolName.includes("main") || symbolName.includes("entry")) {
      return { role: "entry-point", importance: "critical", publicInterface: isPublic };
    }
    
    if (symbolName.includes("factory") || symbolName.includes("create")) {
      return { role: "factory", importance: "important", publicInterface: isPublic };
    }
    
    if (symbolName.includes("facade") || symbolName.includes("interface")) {
      return { role: "facade", importance: "important", publicInterface: true };
    }
    
    if (symbolName.includes("adapter") || symbolName.includes("bridge")) {
      return { role: "adapter", importance: "supporting", publicInterface: isPublic };
    }

    // Analyze based on relationship count
    const incomingCount = relationships.filter(r => r.toName === input.symbol.name).length;
    const outgoingCount = relationships.filter(r => r.fromName === input.symbol.name).length;

    if (incomingCount > 5) {
      return { role: "core-logic", importance: "critical", publicInterface: isPublic };
    }
    
    if (outgoingCount > incomingCount * 2) {
      return { role: "utility", importance: "supporting", publicInterface: isPublic };
    }

    return { role: "core-logic", importance: "important", publicInterface: isPublic };
  }

  /**
   * Analyze component type based on patterns
   */
  private async analyzeComponentType(input: PatternAnalysisInput): Promise<ComponentType> {
    const symbolName = input.symbol.name.toLowerCase();
    const filePath = (input.filePath || "").toLowerCase();

    // Analyze based on naming conventions
    if (symbolName.includes("controller") || filePath.includes("controller")) {
      return { type: "controller", confidence: 0.9 };
    }
    
    if (symbolName.includes("service") || filePath.includes("service")) {
      return { type: "service", confidence: 0.9 };
    }
    
    if (symbolName.includes("model") || filePath.includes("model")) {
      return { type: "model", confidence: 0.8 };
    }
    
    if (symbolName.includes("view") || filePath.includes("view")) {
      return { type: "view", confidence: 0.8 };
    }
    
    if (symbolName.includes("repository") || filePath.includes("repository")) {
      return { type: "repository", confidence: 0.9 };
    }
    
    if (symbolName.includes("config") || filePath.includes("config")) {
      return { type: "config", confidence: 0.8 };
    }
    
    if (symbolName.includes("test") || filePath.includes("test")) {
      return { type: "test", confidence: 0.9 };
    }

    return { type: "helper", confidence: 0.3 };
  }

  /**
   * Identify quality indicators and code smells
   */
  private async identifyQualityIndicators(input: PatternAnalysisInput): Promise<QualityIndicator[]> {
    const indicators: QualityIndicator[] = [];
    const sourceLines = input.sourceCode.split('\n');

    // Long method detection
    if (sourceLines.length > 50) {
      indicators.push({
        type: "code-smell",
        name: "Long Method",
        severity: "warning",
        description: "Method is very long and may be difficult to understand",
        confidence: 0.8,
        suggestion: "Consider breaking this method into smaller, more focused methods"
      });
    }

    // Complex conditional detection
    const complexConditions = sourceLines.filter(line => 
      (line.match(/&&|\|\|/g) || []).length > 2
    );
    
    if (complexConditions.length > 0) {
      indicators.push({
        type: "code-smell",
        name: "Complex Conditional",
        severity: "info",
        description: "Complex boolean expressions detected",
        confidence: 0.7,
        suggestion: "Consider extracting complex conditions into well-named variables"
      });
    }

    // Magic number detection
    const magicNumbers = sourceLines.filter(line =>
      /\b\d{2,}\b/.test(line) && !line.includes("//")
    );
    
    if (magicNumbers.length > 2) {
      indicators.push({
        type: "code-smell",
        name: "Magic Numbers",
        severity: "info",
        description: "Unexplained numeric literals found",
        confidence: 0.6,
        suggestion: "Replace magic numbers with named constants"
      });
    }

    return indicators;
  }

  /**
   * Recognize algorithmic patterns in the code
   */
  private async recognizeAlgorithmicPatterns(input: PatternAnalysisInput): Promise<AlgorithmicPattern[]> {
    const patterns: AlgorithmicPattern[] = [];
    const source = input.sourceCode.toLowerCase();

    // Loop accumulation pattern
    if (source.includes("for") && (source.includes("sum") || source.includes("total") || source.includes("+="))) {
      patterns.push({
        pattern: "loop-accumulation",
        confidence: 0.7,
        complexity: "O(n)",
        characteristics: ["iterative", "accumulative"]
      });
    }

    // Recursive pattern
    if (this.detectRecursionPattern(input)) {
      patterns.push({
        pattern: "recursive",
        confidence: 0.8,
        complexity: "unknown",
        characteristics: ["recursive", "divide-and-conquer"]
      });
    }

    // State machine pattern
    if (source.includes("switch") && source.includes("state")) {
      patterns.push({
        pattern: "state-machine",
        confidence: 0.6,
        complexity: "O(1)",
        characteristics: ["state-based", "finite-automaton"]
      });
    }

    // Pipeline pattern
    if (source.includes("pipe") || (source.includes("transform") && source.includes("chain"))) {
      patterns.push({
        pattern: "pipeline",
        confidence: 0.5,
        complexity: "O(n)",
        characteristics: ["sequential", "transformational"]
      });
    }

    return patterns;
  }

  /**
   * Analyze semantic relationships between symbols
   */
  private async analyzeSemanticRelationships(input: PatternAnalysisInput): Promise<SemanticRelationship[]> {
    const relationships: SemanticRelationship[] = [];

    for (const rel of input.relationships) {
      const semanticRel: SemanticRelationship = {
        targetSymbolId: rel.toName,
        relationshipType: this.mapRelationshipType(rel.relationshipType),
        strength: this.calculateRelationshipStrength(rel),
        semanticSimilarity: this.calculateSemanticSimilarity(input.symbol.name, rel.toName),
        functionalSimilarity: 0.5, // Placeholder
        context: rel.relationshipType
      };
      
      relationships.push(semanticRel);
    }

    return relationships.slice(0, 10); // Limit to top 10 relationships
  }

  /**
   * Analyze performance characteristics
   */
  private async analyzePerformanceCharacteristics(input: PatternAnalysisInput): Promise<PerformanceCharacteristics> {
    const source = input.sourceCode.toLowerCase();

    // Determine execution mode
    let executionMode: PerformanceCharacteristics['executionMode'] = "balanced";
    if (source.includes("sort") || source.includes("search") || source.includes("calculate")) {
      executionMode = "cpu-intensive";
    } else if (source.includes("read") || source.includes("write") || source.includes("file")) {
      executionMode = "io-intensive";
    } else if (source.includes("allocate") || source.includes("buffer") || source.includes("cache")) {
      executionMode = "memory-intensive";
    }

    // Determine scalability
    let scalability: PerformanceCharacteristics['scalability'] = "unknown";
    if (source.includes("for") && !source.includes("nested")) {
      scalability = "linear";
    } else if (source.includes("log") || source.includes("binary")) {
      scalability = "logarithmic";
    } else if (source.includes("nested") || source.includes("double")) {
      scalability = "polynomial";
    }

    return {
      executionMode,
      scalability,
      resourceUsage: {
        memory: source.includes("new") || source.includes("allocate") ? "medium" : "low",
        cpu: source.includes("loop") || source.includes("calculate") ? "medium" : "low",
        io: source.includes("read") || source.includes("write") ? "medium" : "low"
      },
      parallelizable: source.includes("parallel") || source.includes("thread"),
      cacheable: !source.includes("random") && !source.includes("time")
    };
  }

  /**
   * Analyze readability metrics
   */
  private async analyzeReadability(input: PatternAnalysisInput): Promise<ReadabilityMetrics> {
    const lines = input.sourceCode.split('\n');
    
    // Naming quality based on symbol name
    const namingQuality = this.assessNamingQuality(input.symbol.name);
    
    // Comment quality
    const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*'));
    const commentQuality = Math.min(1.0, commentLines.length / Math.max(lines.length * 0.1, 1));
    
    // Structure clarity based on nesting and length
    const structureClarity = Math.max(0, 1.0 - (lines.length / 100));
    
    const overallReadability = (namingQuality + commentQuality + structureClarity) / 3;

    const suggestions: string[] = [];
    if (namingQuality < 0.6) suggestions.push("Improve variable and method naming");
    if (commentQuality < 0.3) suggestions.push("Add more explanatory comments");
    if (structureClarity < 0.5) suggestions.push("Break down complex methods");

    return {
      namingQuality,
      commentQuality,
      structureClarity,
      overallReadability,
      improvementSuggestions: suggestions
    };
  }

  // Helper methods

  private analyzeNamingPatterns(name: string): Record<string, number> {
    const patterns = {
      data: 0,
      behavior: 0,
      control: 0,
      interface: 0,
      utility: 0,
      configuration: 0,
    };

    const lowerName = name.toLowerCase();

    if (/(get|set|data|value|property|field)/.test(lowerName)) patterns.data += 0.5;
    if (/(process|execute|run|perform|do|action)/.test(lowerName)) patterns.behavior += 0.5;
    if (/(control|manage|handle|coordinate|orchestrate)/.test(lowerName)) patterns.control += 0.5;
    if (/(interface|contract|api|service|facade)/.test(lowerName)) patterns.interface += 0.5;
    if (/(util|helper|tool|support|common)/.test(lowerName)) patterns.utility += 0.5;
    if (/(config|setting|option|param|constant)/.test(lowerName)) patterns.configuration += 0.5;

    return patterns;
  }

  private detectTransformerPattern(input: PatternAnalysisInput): boolean {
    const name = input.symbol.name.toLowerCase();
    return name.includes("transform") || name.includes("convert") || 
           name.includes("map") || name.includes("process");
  }

  private detectRecursionPattern(input: PatternAnalysisInput): boolean {
    const functionMatch = input.sourceCode.match(/(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:function|\(.*\)\s*=>))/);
    if (functionMatch) {
      const functionName = functionMatch[1] || functionMatch[2];
      return input.sourceCode.includes(functionName + "(");
    }
    return false;
  }

  private mapRelationshipType(type: string): SemanticRelationship['relationshipType'] {
    const mapping: Record<string, SemanticRelationship['relationshipType']> = {
      "calls": "uses",
      "inherits": "extends",
      "includes": "depends-on",
      "creates": "uses",
      "instantiates": "uses"
    };
    return mapping[type] || "uses";
  }

  private calculateRelationshipStrength(rel: RelationshipInfo): number {
    // Simple heuristic based on relationship type
    const strengthMap: Record<string, number> = {
      "inherits": 0.9,
      "implements": 0.8,
      "calls": 0.6,
      "uses": 0.5,
      "includes": 0.4
    };
    return strengthMap[rel.relationshipType] || 0.3;
  }

  private calculateSemanticSimilarity(name1: string, name2: string): number {
    // Simple Jaccard similarity based on word components
    const words1 = name1.toLowerCase().split(/[_\s]+/);
    const words2 = name2.toLowerCase().split(/[_\s]+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private assessNamingQuality(name: string): number {
    let quality = 0.5; // Base quality
    
    // Positive indicators
    if (name.length >= 4) quality += 0.2; // Not too short
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) quality += 0.2; // Good casing
    if (name.includes('_') && name === name.toLowerCase()) quality += 0.1; // Snake case
    
    // Negative indicators
    if (name.length < 3) quality -= 0.3; // Too short
    if (/^\w$/.test(name)) quality -= 0.4; // Single character
    if (/\d+$/.test(name)) quality -= 0.2; // Ends with numbers
    
    return Math.max(0, Math.min(1, quality));
  }

  private identifyRefactoringOpportunities(
    input: PatternAnalysisInput,
    _qualityIndicators: QualityIndicator[],
    _algorithmicPatterns: AlgorithmicPattern[]
  ): RefactoringOpportunity[] {
    const opportunities: RefactoringOpportunity[] = [];

    // Long method opportunity
    const lines = input.sourceCode.split('\n').length;
    if (lines > 50) {
      opportunities.push({
        type: "extract-method",
        description: "Method is very long and could be broken down",
        priority: lines > 100 ? "high" : "medium",
        effort: "moderate",
        benefit: "Improved readability and maintainability",
        risks: ["May affect performance", "Requires careful testing"]
      });
    }

    // Complex naming opportunity
    if (input.symbol.name.length < 3) {
      opportunities.push({
        type: "rename",
        description: "Symbol name is too short and unclear",
        priority: "medium",
        effort: "easy",
        benefit: "Better code readability",
        risks: ["May break external references"]
      });
    }

    return opportunities;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private getResult<T>(result: PromiseSettledResult<T>, defaultValue: T): T {
    return result.status === "fulfilled" ? result.value : defaultValue;
  }

  private getDefaultPerformanceCharacteristics(): PerformanceCharacteristics {
    return {
      executionMode: "balanced",
      scalability: "unknown",
      resourceUsage: { memory: "unknown", cpu: "unknown", io: "unknown" },
      parallelizable: false,
      cacheable: false
    };
  }

  private getDefaultReadabilityMetrics(): ReadabilityMetrics {
    return {
      namingQuality: 0.5,
      commentQuality: 0.5,
      structureClarity: 0.5,
      overallReadability: 0.5,
      improvementSuggestions: []
    };
  }

  private getDefaultPatternAnalysis(): PatternAnalysisResult {
    return {
      semanticRole: { primary: "utility", confidence: 0.1 },
      usagePatterns: [],
      architecturalLayer: { layer: "unknown", confidence: 0.1 },
      moduleRole: { role: "utility", importance: "utility", publicInterface: false },
      componentType: { type: "helper", confidence: 0.1 },
      qualityIndicators: [],
      algorithmicPatterns: [],
      semanticRelationships: [],
      performanceCharacteristics: this.getDefaultPerformanceCharacteristics(),
      readabilityMetrics: this.getDefaultReadabilityMetrics(),
      refactoringOpportunities: []
    };
  }
}