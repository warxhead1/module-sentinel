/**
 * Enhanced Intellisense Bridge - MCP Tool Integration
 * 
 * Creates a bridge between the MCP server tools and enhanced intellisense
 * capabilities, providing contextual architectural guidance and smart
 * suggestions for the human<->AI development workflow.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { ArchitecturalPatternAnalyzer, PatternInstance } from './architectural-pattern-analyzer.js';
import { RippleEffectTracker } from './ripple-effect-tracker.js';
import { ChangeImpactPredictor } from './change-impact-predictor.js';

export interface IntelliSenseContext {
  currentFile: string;
  currentSymbol?: string;
  cursorPosition: { line: number; column: number };
  nearbySymbols: string[];
  semanticContext: {
    stage: string;
    patterns: string[];
    relationships: string[];
    tags: string[];
  };
}

export interface SmartSuggestion {
  id: string;
  type: 'pattern' | 'refactor' | 'optimization' | 'warning' | 'best-practice' | 'architectural';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  action: {
    type: 'code-completion' | 'refactor' | 'extract' | 'navigate' | 'analyze';
    target?: string;
    suggestion?: string;
    parameters?: Record<string, any>;
  };
  reasoning: string;
  confidence: number;
  context: {
    file: string;
    symbol?: string;
    patterns: string[];
    stage: string;
  };
  codeSnippet?: string;
  documentation?: string;
  relatedFiles?: string[];
}

export interface ArchitecturalGuidance {
  currentContext: {
    file: string;
    stage: string;
    patterns: PatternInstance[];
    complexity: number;
    maintainability: number;
  };
  suggestions: SmartSuggestion[];
  insights: {
    strengths: string[];
    concerns: string[];
    opportunities: string[];
  };
  navigation: {
    relatedFiles: Array<{
      path: string;
      relationship: string;
      relevance: number;
    }>;
    relatedPatterns: Array<{
      pattern: string;
      location: string;
      similarity: number;
    }>;
  };
}

export interface MCPToolIntegration {
  toolName: string;
  enhancedCapabilities: {
    contextAwareness: boolean;
    patternRecognition: boolean;
    impactAnalysis: boolean;
    smartFiltering: boolean;
  };
  suggestions: SmartSuggestion[];
}

export class EnhancedIntelliSenseBridge {
  private db: Database.Database;
  private patternAnalyzer: ArchitecturalPatternAnalyzer;
  private rippleTracker: RippleEffectTracker;
  private impactPredictor: ChangeImpactPredictor;
  private contextCache = new Map<string, IntelliSenseContext>();
  private suggestionCache = new Map<string, SmartSuggestion[]>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.patternAnalyzer = new ArchitecturalPatternAnalyzer(dbPath);
    this.rippleTracker = new RippleEffectTracker(dbPath);
    this.impactPredictor = new ChangeImpactPredictor(dbPath);
  }

  /**
   * Generate enhanced architectural guidance for current context
   */
  async generateArchitecturalGuidance(context: IntelliSenseContext): Promise<ArchitecturalGuidance> {
    console.log(`🧠 Generating architectural guidance for ${context.currentFile}...`);
    
    // Analyze current context
    const currentContext = await this.analyzeCurrentContext(context);
    
    // Generate smart suggestions
    const suggestions = await this.generateSmartSuggestions(context, currentContext);
    
    // Generate insights
    const insights = await this.generateInsights(currentContext);
    
    // Generate navigation aids
    const navigation = await this.generateNavigationAids(context, currentContext);
    
    return {
      currentContext,
      suggestions,
      insights,
      navigation
    };
  }

  private async analyzeCurrentContext(context: IntelliSenseContext): Promise<ArchitecturalGuidance['currentContext']> {
    // Get file-level information
    const fileInfo = this.db.prepare(`
      SELECT 
        pipeline_stage,
        AVG(parser_confidence) as avg_confidence,
        COUNT(*) as symbol_count
      FROM enhanced_symbols
      WHERE file_path = ?
      GROUP BY pipeline_stage
      LIMIT 1
    `).get(context.currentFile) as any;

    if (!fileInfo) {
      return {
        file: context.currentFile,
        stage: 'unknown',
        patterns: [],
        complexity: 0,
        maintainability: 50
      };
    }

    // Get patterns in this file
    const patterns = await this.patternAnalyzer.analyzePatterns();
    const filePatterns = patterns.filter(p => p.location.filePath === context.currentFile);
    
    // Calculate complexity and maintainability
    const complexity = this.calculateFileComplexity(fileInfo, filePatterns);
    const maintainability = this.calculateFileMaintainability(fileInfo, filePatterns);

    return {
      file: context.currentFile,
      stage: fileInfo.pipeline_stage || 'unknown',
      patterns: filePatterns,
      complexity,
      maintainability
    };
  }

  private async generateSmartSuggestions(
    context: IntelliSenseContext, 
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // Pattern-based suggestions
    suggestions.push(...await this.generatePatternSuggestions(context, currentContext));
    
    // Architectural suggestions
    suggestions.push(...await this.generateArchitecturalSuggestions(context, currentContext));
    
    // Optimization suggestions
    suggestions.push(...await this.generateOptimizationSuggestions(context, currentContext));
    
    // Best practice suggestions
    suggestions.push(...await this.generateBestPracticeSuggestions(context, currentContext));
    
    // Warning suggestions
    suggestions.push(...await this.generateWarningSuggestions(context, currentContext));
    
    // Sort by priority and confidence
    return suggestions.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    }).slice(0, 10); // Limit to top 10 suggestions
  }

  private async generatePatternSuggestions(
    context: IntelliSenseContext,
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // Suggest completing pattern implementations
    if (currentContext.patterns.length > 0) {
      for (const pattern of currentContext.patterns) {
        if (pattern.confidence < 0.9) {
          suggestions.push({
            id: `complete_pattern_${pattern.id}`,
            type: 'pattern',
            priority: 'medium',
            title: `Complete ${pattern.patternType} Pattern`,
            description: `The ${pattern.name} pattern is incomplete (${(pattern.confidence * 100).toFixed(1)}% confidence). Consider implementing missing components.`,
            action: {
              type: 'refactor',
              target: pattern.name,
              suggestion: `Implement missing ${pattern.patternType} pattern components`
            },
            reasoning: `Pattern analysis shows incomplete implementation with ${pattern.antiPatterns.length} anti-patterns detected`,
            confidence: 0.8,
            context: {
              file: context.currentFile,
              symbol: pattern.name,
              patterns: [pattern.patternType],
              stage: currentContext.stage
            },
            documentation: `${pattern.patternType} patterns typically require: ${pattern.relationships.join(', ')}`
          });
        }
      }
    }
    
    // Suggest new patterns based on code structure
    if (currentContext.stage === 'rendering' && currentContext.patterns.length === 0) {
      suggestions.push({
        id: 'suggest_vulkan_raii',
        type: 'pattern',
        priority: 'high',
        title: 'Consider RAII Pattern for Vulkan Resources',
        description: 'Rendering stage files benefit from RAII patterns for automatic resource management.',
        action: {
          type: 'code-completion',
          suggestion: 'Implement RAII wrapper for Vulkan resources'
        },
        reasoning: 'Vulkan resources require careful lifecycle management, RAII patterns prevent resource leaks',
        confidence: 0.85,
        context: {
          file: context.currentFile,
          patterns: ['vulkan-raii'],
          stage: currentContext.stage
        },
        codeSnippet: `class VulkanRAII {
private:
    VkDevice device;
    VkBuffer buffer;
public:
    VulkanRAII(VkDevice dev) : device(dev) {
        // Create Vulkan resources
    }
    ~VulkanRAII() {
        // Cleanup Vulkan resources
        if (buffer != VK_NULL_HANDLE) {
            vkDestroyBuffer(device, buffer, nullptr);
        }
    }
};`
      });
    }
    
    return suggestions;
  }

  private async generateArchitecturalSuggestions(
    context: IntelliSenseContext,
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // Cross-stage dependency warnings
    const crossStageDeps = this.db.prepare(`
      SELECT s2.pipeline_stage, COUNT(*) as dep_count
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.file_path = ? 
        AND s1.pipeline_stage != s2.pipeline_stage
        AND s2.pipeline_stage IS NOT NULL
      GROUP BY s2.pipeline_stage
      ORDER BY dep_count DESC
    `).all(context.currentFile) as any[];

    if (crossStageDeps.length > 0) {
      const primaryDep = crossStageDeps[0];
      suggestions.push({
        id: 'cross_stage_dependency',
        type: 'architectural',
        priority: 'medium',
        title: 'Cross-Stage Dependencies Detected',
        description: `This ${currentContext.stage} file has ${primaryDep.dep_count} dependencies on ${primaryDep.pipeline_stage} stage. Consider architectural review.`,
        action: {
          type: 'analyze',
          target: 'dependencies'
        },
        reasoning: 'Cross-stage dependencies can indicate architectural coupling issues',
        confidence: 0.75,
        context: {
          file: context.currentFile,
          patterns: [],
          stage: currentContext.stage
        }
      });
    }
    
    // Complexity warnings
    if (currentContext.complexity > 7) {
      suggestions.push({
        id: 'complexity_warning',
        type: 'architectural',
        priority: 'high',
        title: 'High Complexity Detected',
        description: `File complexity score is ${currentContext.complexity}/10. Consider refactoring for better maintainability.`,
        action: {
          type: 'refactor',
          suggestion: 'Break down complex components into smaller, focused modules'
        },
        reasoning: 'High complexity reduces maintainability and increases bug risk',
        confidence: 0.9,
        context: {
          file: context.currentFile,
          patterns: [],
          stage: currentContext.stage
        }
      });
    }
    
    return suggestions;
  }

  private async generateOptimizationSuggestions(
    context: IntelliSenseContext,
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // GPU optimization suggestions for rendering stage
    if (currentContext.stage === 'rendering') {
      const hasGPUPatterns = currentContext.patterns.some(p => p.semanticTags.includes('gpu'));
      if (!hasGPUPatterns) {
        suggestions.push({
          id: 'gpu_optimization',
          type: 'optimization',
          priority: 'medium',
          title: 'Consider GPU Acceleration',
          description: 'Rendering stage files can benefit from GPU compute patterns for better performance.',
          action: {
            type: 'code-completion',
            suggestion: 'Implement GPU compute shaders for parallel processing'
          },
          reasoning: 'GPU parallelization can significantly improve rendering performance',
          confidence: 0.7,
          context: {
            file: context.currentFile,
            patterns: ['gpu-compute'],
            stage: currentContext.stage
          }
        });
      }
    }
    
    // Memory optimization suggestions
    const hasMemoryPatterns = currentContext.patterns.some(p => p.patternType === 'memory-pool');
    if (!hasMemoryPatterns && currentContext.stage !== 'gui') {
      suggestions.push({
        id: 'memory_optimization',
        type: 'optimization',
        priority: 'low',
        title: 'Consider Memory Pooling',
        description: 'Memory pool patterns can improve performance for frequent allocations.',
        action: {
          type: 'code-completion',
          suggestion: 'Implement memory pool for frequent allocations'
        },
        reasoning: 'Memory pools reduce allocation overhead and fragmentation',
        confidence: 0.6,
        context: {
          file: context.currentFile,
          patterns: ['memory-pool'],
          stage: currentContext.stage
        }
      });
    }
    
    return suggestions;
  }

  private async generateBestPracticeSuggestions(
    context: IntelliSenseContext,
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // Modern C++ suggestions
    const modernCppSymbols = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM enhanced_symbols
      WHERE file_path = ? AND semantic_tags LIKE '%modern-cpp%'
    `).get(context.currentFile) as any;

    if (modernCppSymbols.count === 0) {
      suggestions.push({
        id: 'modern_cpp',
        type: 'best-practice',
        priority: 'low',
        title: 'Consider Modern C++ Features',
        description: 'This file could benefit from modern C++20/23 features like concepts, modules, or constexpr.',
        action: {
          type: 'refactor',
          suggestion: 'Adopt modern C++ features for better type safety and performance'
        },
        reasoning: 'Modern C++ features improve code safety, readability, and performance',
        confidence: 0.6,
        context: {
          file: context.currentFile,
          patterns: [],
          stage: currentContext.stage
        }
      });
    }
    
    // Documentation suggestions
    if (currentContext.maintainability < 70) {
      suggestions.push({
        id: 'documentation',
        type: 'best-practice',
        priority: 'medium',
        title: 'Improve Documentation',
        description: `File maintainability score is ${currentContext.maintainability}/100. Better documentation would help.`,
        action: {
          type: 'refactor',
          suggestion: 'Add comprehensive documentation and comments'
        },
        reasoning: 'Good documentation significantly improves maintainability',
        confidence: 0.8,
        context: {
          file: context.currentFile,
          patterns: [],
          stage: currentContext.stage
        }
      });
    }
    
    return suggestions;
  }

  private async generateWarningSuggestions(
    context: IntelliSenseContext,
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // Anti-pattern warnings
    const antiPatterns = currentContext.patterns.flatMap(p => p.antiPatterns);
    if (antiPatterns.length > 0) {
      suggestions.push({
        id: 'antipattern_warning',
        type: 'warning',
        priority: 'high',
        title: 'Anti-Patterns Detected',
        description: `Found ${antiPatterns.length} anti-patterns: ${antiPatterns.slice(0, 2).join(', ')}`,
        action: {
          type: 'refactor',
          suggestion: 'Address detected anti-patterns to improve code quality'
        },
        reasoning: 'Anti-patterns indicate design issues that should be addressed',
        confidence: 0.85,
        context: {
          file: context.currentFile,
          patterns: [],
          stage: currentContext.stage
        }
      });
    }
    
    // Confidence warnings
    const lowConfidenceSymbols = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM enhanced_symbols
      WHERE file_path = ? AND parser_confidence < 0.8
    `).get(context.currentFile) as any;

    if (lowConfidenceSymbols.count > 0) {
      suggestions.push({
        id: 'confidence_warning',
        type: 'warning',
        priority: 'medium',
        title: 'Low Parser Confidence',
        description: `${lowConfidenceSymbols.count} symbols have low parser confidence. Consider code clarification.`,
        action: {
          type: 'refactor',
          suggestion: 'Clarify ambiguous code constructs'
        },
        reasoning: 'Low parser confidence may indicate ambiguous or complex code',
        confidence: 0.7,
        context: {
          file: context.currentFile,
          patterns: [],
          stage: currentContext.stage
        }
      });
    }
    
    return suggestions;
  }

  private async generateInsights(
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<ArchitecturalGuidance['insights']> {
    const strengths: string[] = [];
    const concerns: string[] = [];
    const opportunities: string[] = [];
    
    // Analyze strengths
    if (currentContext.maintainability > 80) {
      strengths.push('High maintainability score indicates well-structured code');
    }
    
    if (currentContext.patterns.length > 0) {
      strengths.push(`Implements ${currentContext.patterns.length} architectural patterns`);
    }
    
    if (currentContext.complexity < 5) {
      strengths.push('Low complexity score suggests good modular design');
    }
    
    // Analyze concerns
    if (currentContext.complexity > 7) {
      concerns.push('High complexity may impact maintainability');
    }
    
    const antiPatternCount = currentContext.patterns.reduce((sum, p) => sum + p.antiPatterns.length, 0);
    if (antiPatternCount > 0) {
      concerns.push(`${antiPatternCount} anti-patterns detected`);
    }
    
    if (currentContext.maintainability < 60) {
      concerns.push('Low maintainability score needs attention');
    }
    
    // Analyze opportunities
    if (currentContext.stage === 'rendering' && !currentContext.patterns.some(p => p.patternType === 'vulkan-raii')) {
      opportunities.push('Could benefit from Vulkan RAII patterns');
    }
    
    if (currentContext.patterns.length === 0) {
      opportunities.push('Consider implementing architectural patterns for better structure');
    }
    
    if (currentContext.complexity > 5 && currentContext.patterns.length === 0) {
      opportunities.push('Refactoring into design patterns could reduce complexity');
    }
    
    return { strengths, concerns, opportunities };
  }

  private async generateNavigationAids(
    context: IntelliSenseContext,
    currentContext: ArchitecturalGuidance['currentContext']
  ): Promise<ArchitecturalGuidance['navigation']> {
    // Find related files
    const relatedFiles = this.db.prepare(`
      SELECT DISTINCT s2.file_path, sr.relationship_type, COUNT(*) as connection_count
      FROM symbol_relationships sr
      JOIN enhanced_symbols s1 ON sr.from_symbol_id = s1.id
      JOIN enhanced_symbols s2 ON sr.to_symbol_id = s2.id
      WHERE s1.file_path = ? AND s2.file_path != ?
      GROUP BY s2.file_path, sr.relationship_type
      ORDER BY connection_count DESC
      LIMIT 5
    `).all(context.currentFile, context.currentFile) as any[];

    // Find related patterns
    const relatedPatterns = currentContext.patterns.length > 0 
      ? await this.findRelatedPatterns(currentContext.patterns[0])
      : [];

    return {
      relatedFiles: relatedFiles.map((file: any) => ({
        path: file.file_path,
        relationship: file.relationship_type,
        relevance: Math.min(1.0, file.connection_count / 10)
      })),
      relatedPatterns: relatedPatterns.map(pattern => ({
        pattern: pattern.name,
        location: pattern.location.filePath,
        similarity: 0.8 // Simplified similarity score
      }))
    };
  }

  private async findRelatedPatterns(pattern: PatternInstance): Promise<PatternInstance[]> {
    const allPatterns = await this.patternAnalyzer.analyzePatterns();
    return allPatterns.filter(p => 
      p.id !== pattern.id && 
      (p.stage === pattern.stage || 
       p.patternType === pattern.patternType ||
       p.semanticTags.some(tag => pattern.semanticTags.includes(tag)))
    ).slice(0, 3);
  }

  private calculateFileComplexity(fileInfo: any, patterns: PatternInstance[]): number {
    let complexity = Math.min(10, fileInfo.symbol_count / 20);
    complexity += patterns.reduce((sum, p) => sum + p.complexity, 0) / Math.max(patterns.length, 1);
    return Math.min(10, complexity);
  }

  private calculateFileMaintainability(fileInfo: any, patterns: PatternInstance[]): number {
    let maintainability = (fileInfo.avg_confidence || 0.8) * 100;
    maintainability -= patterns.reduce((sum, p) => sum + p.antiPatterns.length * 10, 0);
    return Math.max(0, Math.min(100, maintainability));
  }

  /**
   * Enhance MCP tools with architectural context
   */
  async enhanceMCPTool(toolName: string, context: IntelliSenseContext): Promise<MCPToolIntegration> {
    const guidance = await this.generateArchitecturalGuidance(context);
    
    const enhancedCapabilities = {
      contextAwareness: true,
      patternRecognition: guidance.currentContext.patterns.length > 0,
      impactAnalysis: true,
      smartFiltering: true
    };
    
    // Generate tool-specific suggestions
    const suggestions = await this.generateToolSpecificSuggestions(toolName, guidance, context);
    
    return {
      toolName,
      enhancedCapabilities,
      suggestions
    };
  }

  private async generateToolSpecificSuggestions(
    toolName: string, 
    guidance: ArchitecturalGuidance,
    context: IntelliSenseContext
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    switch (toolName) {
      case 'find_implementations':
        suggestions.push({
          id: 'find_impl_enhanced',
          type: 'architectural',
          priority: 'medium',
          title: 'Pattern-Aware Implementation Search',
          description: 'Search includes related pattern implementations and architectural variants',
          action: {
            type: 'navigate',
            parameters: {
              includePatterns: guidance.currentContext.patterns.map(p => p.patternType),
              filterByStage: guidance.currentContext.stage
            }
          },
          reasoning: 'Architectural context helps find more relevant implementations',
          confidence: 0.8,
          context: {
            file: context.currentFile,
            patterns: guidance.currentContext.patterns.map(p => p.patternType),
            stage: guidance.currentContext.stage
          }
        });
        break;
        
      case 'analyze_impact':
        if (context.currentSymbol) {
          suggestions.push({
            id: 'impact_prediction',
            type: 'architectural',
            priority: 'high',
            title: 'Predictive Impact Analysis',
            description: 'Enhanced impact analysis with change scenario modeling',
            action: {
              type: 'analyze',
              target: context.currentSymbol,
              parameters: {
                includeRippleEffects: true,
                modelChangeScenarios: true
              }
            },
            reasoning: 'Predictive analysis helps understand long-term impact of changes',
            confidence: 0.9,
            context: {
              file: context.currentFile,
              symbol: context.currentSymbol,
              patterns: [],
              stage: guidance.currentContext.stage
            }
          });
        }
        break;
        
      case 'get_api_surface':
        suggestions.push({
          id: 'pattern_aware_api',
          type: 'architectural',
          priority: 'medium',
          title: 'Pattern-Aware API Analysis',
          description: 'API surface analysis includes pattern interfaces and architectural boundaries',
          action: {
            type: 'analyze',
            parameters: {
              includePatternAPIs: true,
              groupByArchitecturalLayer: true
            }
          },
          reasoning: 'Pattern-aware analysis provides better API organization insights',
          confidence: 0.85,
          context: {
            file: context.currentFile,
            patterns: guidance.currentContext.patterns.map(p => p.patternType),
            stage: guidance.currentContext.stage
          }
        });
        break;
    }
    
    return suggestions;
  }

  /**
   * Generate real-time contextual suggestions as user types
   */
  async getRealtimeSuggestions(
    context: IntelliSenseContext,
    partialCode: string
  ): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    
    // Pattern completion suggestions
    if (partialCode.includes('class') && context.semanticContext.stage === 'rendering') {
      suggestions.push({
        id: 'vulkan_class_completion',
        type: 'pattern',
        priority: 'medium',
        title: 'Vulkan RAII Class Template',
        description: 'Complete class with Vulkan RAII pattern',
        action: {
          type: 'code-completion',
          suggestion: 'VulkanBuffer',
          parameters: {
            template: 'vulkan-raii-class'
          }
        },
        reasoning: 'Rendering classes often benefit from RAII patterns',
        confidence: 0.7,
        context: {
          file: context.currentFile,
          patterns: ['vulkan-raii'],
          stage: context.semanticContext.stage
        },
        codeSnippet: `class VulkanBuffer {
private:
    VkDevice device;
    VkBuffer buffer;
    VkDeviceMemory memory;
    
public:
    VulkanBuffer(VkDevice dev, VkDeviceSize size, VkBufferUsageFlags usage);
    ~VulkanBuffer();
    
    VkBuffer getBuffer() const { return buffer; }
    void* map();
    void unmap();
};`
      });
    }
    
    // Factory pattern suggestions
    if (partialCode.includes('create') || partialCode.includes('make')) {
      suggestions.push({
        id: 'factory_method_completion',
        type: 'pattern',
        priority: 'low',
        title: 'Factory Method Pattern',
        description: 'Consider implementing factory method pattern',
        action: {
          type: 'code-completion',
          suggestion: 'Factory method implementation'
        },
        reasoning: 'Factory patterns provide flexible object creation',
        confidence: 0.6,
        context: {
          file: context.currentFile,
          patterns: ['factory'],
          stage: context.semanticContext.stage
        }
      });
    }
    
    return suggestions;
  }

  close(): void {
    this.patternAnalyzer.close();
    this.rippleTracker.close();
    this.impactPredictor.close();
    this.db.close();
  }
}