/**
 * Unified Confidence Scoring System
 * 
 * Provides standardized confidence metrics across all parsers and parsing operations.
 * This system replaces the inconsistent confidence calculations in individual parsers.
 */

export interface ConfidenceMetrics {
  overall: number;              // 0.0-1.0 overall confidence
  symbolDetection: number;      // Accuracy of class/method/function detection
  typeResolution: number;       // Template args, qualifiers, type analysis
  relationshipAccuracy: number; // Call graphs, inheritance, dependencies  
  modernCppSupport: number;     // C++20/23 features coverage
  moduleAnalysis: number;       // C++23 module parsing accuracy
  
  // Detailed breakdown
  classDetection: number;       // Class/struct detection accuracy
  methodDetection: number;      // Method/function detection accuracy
  includeResolution: number;    // Include/import parsing accuracy
  templateHandling: number;     // Template analysis accuracy
  namespaceHandling: number;    // Namespace tracking accuracy
}

export interface ConfidenceFactors {
  // File characteristics that affect confidence
  fileSize: number;             // Bytes
  lineCount: number;            // Lines of code
  complexity: number;           // Cyclomatic complexity estimate
  hasModernCpp: boolean;        // Uses C++20/23 features
  hasTemplates: boolean;        // Contains template code
  hasVulkanCode: boolean;       // Contains Vulkan API usage
  isModuleFile: boolean;        // C++23 module file (.ixx)
  
  // Parsing context
  parseTime: number;            // Milliseconds taken to parse
  treeSize: number;             // AST node count
  errorCount: number;           // Parse errors encountered
  ambiguousConstructs: number;  // Ambiguous language constructs
}

export class ConfidenceScorer {
  private static instance: ConfidenceScorer;
  
  // Confidence weights (sum to 1.0)
  private readonly weights = {
    symbolDetection: 0.25,      // 25% - Core symbol parsing
    typeResolution: 0.20,       // 20% - Type analysis accuracy
    relationshipAccuracy: 0.20, // 20% - Relationship detection
    modernCppSupport: 0.15,     // 15% - Modern C++ features
    moduleAnalysis: 0.20        // 20% - Module parsing (when applicable)
  };

  // Base confidence levels for different constructs
  private readonly baseConfidence = {
    simpleClass: 0.95,          // Simple class with public methods
    templateClass: 0.85,        // Template class (more complex)
    abstractClass: 0.80,        // Abstract class with virtual methods
    simpleFunction: 0.95,       // Basic function
    templateFunction: 0.85,     // Template function
    virtualFunction: 0.90,      // Virtual function
    operatorOverload: 0.80,     // Operator overloading
    includeStatement: 0.98,     // #include parsing
    moduleImport: 0.90,         // import statement (C++23)
    moduleExport: 0.85,         // export statement (C++23)
    namespace: 0.95,            // Namespace declaration
    usingDeclaration: 0.90,     // using statement
    typedef: 0.92,              // typedef/using alias
    concept: 0.80,              // C++20 concept
    coroutine: 0.75,            // C++20 coroutine
    lambda: 0.88,               // Lambda expression
    vulkanCall: 0.85            // Vulkan API call
  };

  public static getInstance(): ConfidenceScorer {
    if (!ConfidenceScorer.instance) {
      ConfidenceScorer.instance = new ConfidenceScorer();
    }
    return ConfidenceScorer.instance;
  }

  /**
   * Calculate unified confidence score for parsing results
   */
  calculateConfidence(
    symbols: any, 
    factors: ConfidenceFactors,
    parserSpecificData?: any
  ): ConfidenceMetrics {
    
    // Calculate individual confidence components
    const symbolDetection = this.calculateSymbolDetectionConfidence(symbols, factors);
    const typeResolution = this.calculateTypeResolutionConfidence(symbols, factors);
    const relationshipAccuracy = this.calculateRelationshipConfidence(symbols, factors);
    const modernCppSupport = this.calculateModernCppConfidence(symbols, factors);
    const moduleAnalysis = this.calculateModuleAnalysisConfidence(symbols, factors);

    // Calculate weighted overall confidence
    const overall = (
      symbolDetection * this.weights.symbolDetection +
      typeResolution * this.weights.typeResolution +
      relationshipAccuracy * this.weights.relationshipAccuracy +
      modernCppSupport * this.weights.modernCppSupport +
      moduleAnalysis * this.weights.moduleAnalysis
    );

    // Detailed breakdown
    const classDetection = this.calculateClassDetectionConfidence(symbols, factors);
    const methodDetection = this.calculateMethodDetectionConfidence(symbols, factors);
    const includeResolution = this.calculateIncludeResolutionConfidence(symbols, factors);
    const templateHandling = this.calculateTemplateHandlingConfidence(symbols, factors);
    const namespaceHandling = this.calculateNamespaceHandlingConfidence(symbols, factors);

    return {
      overall: Math.max(0, Math.min(1, overall)), // Clamp to [0,1]
      symbolDetection,
      typeResolution,
      relationshipAccuracy,
      modernCppSupport,
      moduleAnalysis,
      classDetection,
      methodDetection,
      includeResolution,
      templateHandling,
      namespaceHandling
    };
  }

  /**
   * Calculate symbol detection confidence
   */
  private calculateSymbolDetectionConfidence(symbols: any, factors: ConfidenceFactors): number {
    let confidence = 0.9; // Base confidence

    // Adjust based on file complexity
    if (factors.complexity > 20) confidence -= 0.1;
    if (factors.complexity > 50) confidence -= 0.1;

    // Adjust based on file size (larger files may have missed symbols)
    if (factors.fileSize > 100000) confidence -= 0.05; // 100KB+
    if (factors.fileSize > 500000) confidence -= 0.1;  // 500KB+

    // Adjust based on parse errors
    if (factors.errorCount > 0) {
      confidence -= Math.min(0.3, factors.errorCount * 0.05);
    }

    // Adjust based on modern C++ (harder to parse accurately)
    if (factors.hasModernCpp) confidence -= 0.05;
    if (factors.hasTemplates) confidence -= 0.05;

    return Math.max(0.5, Math.min(1.0, confidence));
  }

  /**
   * Calculate type resolution confidence
   */
  private calculateTypeResolutionConfidence(symbols: any, factors: ConfidenceFactors): number {
    let confidence = 0.85; // Base confidence for type resolution

    // Templates are harder to analyze
    if (factors.hasTemplates) confidence -= 0.1;
    
    // Modern C++ has complex type deduction
    if (factors.hasModernCpp) confidence -= 0.05;

    // Check if we have enhanced type information
    const hasEnhancedTypes = symbols.methods?.some((m: any) => m.enhancedSemantics?.typeResolution);
    if (hasEnhancedTypes) confidence += 0.1;

    return Math.max(0.6, Math.min(1.0, confidence));
  }

  /**
   * Calculate relationship detection confidence
   */
  private calculateRelationshipConfidence(symbols: any, factors: ConfidenceFactors): number {
    let confidence = 0.8; // Base confidence

    // Complex files have more complex relationships
    if (factors.complexity > 30) confidence -= 0.1;
    
    // Large files may have missed relationships
    if (factors.lineCount > 1000) confidence -= 0.05;
    
    // Check for relationship data
    const hasRelationships = symbols.relationships && symbols.relationships.length > 0;
    if (hasRelationships) confidence += 0.1;

    return Math.max(0.6, Math.min(1.0, confidence));
  }

  /**
   * Calculate modern C++ support confidence
   */
  private calculateModernCppConfidence(symbols: any, factors: ConfidenceFactors): number {
    if (!factors.hasModernCpp) {
      return 1.0; // Perfect confidence if no modern C++ to analyze
    }

    let confidence = 0.8; // Base confidence for modern C++

    // Check for specific modern C++ feature detection
    const hasModernFeatures = symbols.methods?.some((m: any) => 
      m.enhancedSemantics?.modernCppFeatures
    );
    if (hasModernFeatures) confidence += 0.1;

    return Math.max(0.7, Math.min(1.0, confidence));
  }

  /**
   * Calculate module analysis confidence
   */
  private calculateModuleAnalysisConfidence(symbols: any, factors: ConfidenceFactors): number {
    if (!factors.isModuleFile) {
      return 1.0; // Perfect confidence if not a module file
    }

    let confidence = 0.85; // Base confidence for module analysis

    // Check for module-specific data
    const hasModuleInfo = symbols.moduleInfo || symbols.exports?.length > 0;
    if (hasModuleInfo) confidence += 0.1;

    return Math.max(0.7, Math.min(1.0, confidence));
  }

  // Detailed breakdown methods
  private calculateClassDetectionConfidence(symbols: any, factors: ConfidenceFactors): number {
    const classCount = symbols.classes?.length || 0;
    let confidence = classCount > 0 ? 0.9 : 0.8;
    
    if (factors.hasTemplates) confidence -= 0.05;
    return Math.max(0.7, Math.min(1.0, confidence));
  }

  private calculateMethodDetectionConfidence(symbols: any, factors: ConfidenceFactors): number {
    const methodCount = symbols.methods?.length || 0;
    let confidence = methodCount > 0 ? 0.9 : 0.8;
    
    if (factors.hasTemplates) confidence -= 0.05;
    return Math.max(0.7, Math.min(1.0, confidence));
  }

  private calculateIncludeResolutionConfidence(symbols: any, factors: ConfidenceFactors): number {
    const includeCount = symbols.imports?.length || 0;
    return includeCount > 0 ? 0.95 : 0.9; // High confidence for include parsing
  }

  private calculateTemplateHandlingConfidence(symbols: any, factors: ConfidenceFactors): number {
    if (!factors.hasTemplates) return 1.0;
    return 0.85; // Templates are inherently complex
  }

  private calculateNamespaceHandlingConfidence(symbols: any, factors: ConfidenceFactors): number {
    return 0.9; // Generally high confidence for namespace handling
  }

  /**
   * Get confidence threshold for different quality levels
   */
  getQualityThresholds() {
    return {
      excellent: 0.95,   // 95%+ confidence
      good: 0.85,        // 85%+ confidence  
      acceptable: 0.75,  // 75%+ confidence
      poor: 0.60,        // 60%+ confidence
      unacceptable: 0.0  // Below 60%
    };
  }

  /**
   * Get confidence level description
   */
  getConfidenceLevel(confidence: number): string {
    const thresholds = this.getQualityThresholds();
    
    if (confidence >= thresholds.excellent) return 'Excellent';
    if (confidence >= thresholds.good) return 'Good';
    if (confidence >= thresholds.acceptable) return 'Acceptable';
    if (confidence >= thresholds.poor) return 'Poor';
    return 'Unacceptable';
  }

  /**
   * Generate confidence report
   */
  generateConfidenceReport(metrics: ConfidenceMetrics, factors: ConfidenceFactors): string {
    const level = this.getConfidenceLevel(metrics.overall);
    
    return `
Parser Confidence Report
========================
Overall Confidence: ${(metrics.overall * 100).toFixed(1)}% (${level})

Component Breakdown:
- Symbol Detection: ${(metrics.symbolDetection * 100).toFixed(1)}%
- Type Resolution: ${(metrics.typeResolution * 100).toFixed(1)}%
- Relationships: ${(metrics.relationshipAccuracy * 100).toFixed(1)}%
- Modern C++: ${(metrics.modernCppSupport * 100).toFixed(1)}%
- Module Analysis: ${(metrics.moduleAnalysis * 100).toFixed(1)}%

File Characteristics:
- Size: ${factors.fileSize} bytes (${factors.lineCount} lines)
- Complexity: ${factors.complexity}
- Modern C++: ${factors.hasModernCpp ? 'Yes' : 'No'}
- Templates: ${factors.hasTemplates ? 'Yes' : 'No'}
- Module File: ${factors.isModuleFile ? 'Yes' : 'No'}
- Parse Time: ${factors.parseTime}ms
- Errors: ${factors.errorCount}
`;
  }
}