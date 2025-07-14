import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import * as path from 'path';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';

/**
 * Enhanced Anti-Pattern Detector for C++ codebases
 * 
 * Detects common C++ anti-patterns, bad practices, and architectural violations
 * with a focus on GPU/Vulkan code and modern C++ standards.
 */
export class EnhancedAntiPatternDetector extends EventEmitter {
  private db: Database.Database;
  
  // Pattern definitions
  private readonly antiPatterns = {
    // Memory Management Anti-patterns
    rawPointerOwnership: {
      name: 'Raw Pointer Ownership',
      pattern: /(?:new\s+\w+(?:\[[^\]]*\])?(?!\s*\())(?!.*(?:unique_ptr|shared_ptr))/,
      severity: 'high',
      description: 'Using raw pointers for ownership instead of smart pointers',
      suggestion: 'Use std::unique_ptr or std::shared_ptr for ownership'
    },
    
    manualMemoryManagement: {
      name: 'Manual Memory Management',
      pattern: /\b(?:malloc|calloc|realloc|free)\s*\(/,
      severity: 'high',
      description: 'Using C-style memory management in C++ code',
      suggestion: 'Use new/delete or preferably smart pointers and containers'
    },
    
    deleteArrayMismatch: {
      name: 'Delete Array Mismatch',
      pattern: /new\s+\w+\s*\[[^\]]+\][^;]*;[^}]*delete(?!\s*\[\])/,
      severity: 'critical',
      description: 'Using delete instead of delete[] for array deallocation',
      suggestion: 'Use delete[] for arrays allocated with new[], or use std::vector'
    },
    
    // RAII Violations
    missingResourceCleanup: {
      name: 'Missing Resource Cleanup',
      pattern: /(?:Create|Alloc|Open|Init)\w*\s*\([^)]*\)[^;]*;(?!.*(?:Destroy|Free|Close|Release))/s,
      severity: 'high',
      description: 'Resource acquisition without corresponding cleanup',
      suggestion: 'Implement RAII pattern or ensure cleanup in destructor'
    },
    
    // Vulkan-specific Anti-patterns
    vulkanSynchronizationMissing: {
      name: 'Missing Vulkan Synchronization',
      pattern: /vkCmd(?:Copy|Blit|Clear|Draw|Dispatch)[^;]+;(?!.*(?:vkQueueSubmit.*(?:fence|semaphore)|Barrier))/s,
      severity: 'high',
      description: 'Vulkan commands without proper synchronization',
      suggestion: 'Add appropriate pipeline barriers, semaphores, or fences'
    },
    
    vulkanErrorIgnored: {
      name: 'Ignored Vulkan Error',
      pattern: /vk\w+\s*\([^)]+\)\s*;(?!\s*(?:if|VK_CHECK|assert|throw))/,
      severity: 'high',
      description: 'Vulkan API call without error checking',
      suggestion: 'Check VkResult and handle errors appropriately'
    },
    
    directVulkanInHighLevel: {
      name: 'Direct Vulkan API in High-Level Code',
      pattern: /class\s+\w*(?:Manager|Controller|Orchestrator)[^{]*\{[^}]*vk(?:Create|Destroy|Allocate)/s,
      severity: 'medium',
      description: 'High-level manager classes using low-level Vulkan APIs directly',
      suggestion: 'Delegate Vulkan operations to specialized wrapper classes'
    },
    
    // Threading Anti-patterns
    mutexWithoutLockGuard: {
      name: 'Manual Mutex Management',
      pattern: /mutex\.lock\(\)[^;]*;(?!.*lock_guard|unique_lock)/,
      severity: 'high',
      description: 'Manual mutex locking without RAII lock guard',
      suggestion: 'Use std::lock_guard or std::unique_lock'
    },
    
    dataRaceRisk: {
      name: 'Potential Data Race',
      pattern: /static\s+(?!const|constexpr)\w+[^;]+;(?!.*(?:mutex|atomic|thread_local))/,
      severity: 'high',
      description: 'Non-const static variable without synchronization',
      suggestion: 'Use std::atomic, protect with mutex, or make thread_local'
    },
    
    // Modern C++ Anti-patterns
    cStyleCast: {
      name: 'C-Style Cast',
      pattern: /\(\s*(?:int|float|double|char|void)\s*\*?\s*\)/,
      severity: 'low',
      description: 'Using C-style casts instead of C++ casts',
      suggestion: 'Use static_cast, dynamic_cast, const_cast, or reinterpret_cast'
    },
    
    macroInsteadOfConstexpr: {
      name: 'Macro Instead of Constexpr',
      pattern: /#define\s+\w+\s+(?:\d+|0x[\da-fA-F]+)(?!\s*\/\/.*deprecated)/,
      severity: 'low',
      description: 'Using macros for constants instead of constexpr',
      suggestion: 'Use constexpr variables for compile-time constants'
    },
    
    // Performance Anti-patterns
    unnecessaryCopy: {
      name: 'Unnecessary Copy',
      pattern: /for\s*\(\s*(?:auto|std::\w+)\s+\w+\s*:/,
      severity: 'medium',
      description: 'Potential unnecessary copy in range-for or return',
      suggestion: 'Use const auto& for range-for, consider move semantics'
    },
    
    vectorPushBackInLoop: {
      name: 'Vector Growth in Loop',
      pattern: /for\s*\([^)]+\)\s*\{[^}]{0,200}push_back/,
      severity: 'medium',
      description: 'Vector push_back in loop without reserve',
      suggestion: 'Call reserve() before the loop to avoid reallocations'
    },
    
    // Architecture Anti-patterns
    godObject: {
      name: 'God Object',
      pattern: /class\s+\w+[^{]*\{[^}]{1000,}/,
      severity: 'high',
      description: 'Class with too many responsibilities',
      suggestion: 'Split into smaller, focused classes following SRP'
    },
    
    circularDependency: {
      name: 'Circular Dependency',
      pattern: /#include\s*"([^"]+)"/,
      severity: 'high',
      description: 'Potential circular dependency detected',
      suggestion: 'Refactor to remove circular dependencies, use forward declarations'
    },
    
    // GPU-specific Anti-patterns
    cpuGpuDataPingPong: {
      name: 'CPU-GPU Data Ping-Pong',
      pattern: /(?:Map|GetData)[^;]{0,100};[^}]{0,200}(?:Dispatch|Draw)/,
      severity: 'high',
      description: 'Frequent CPU-GPU data transfers causing pipeline stalls',
      suggestion: 'Batch operations, use persistent mapping, or compute on GPU'
    },
    
    missingGpuErrorHandling: {
      name: 'Missing GPU Error Handling',
      pattern: /GPU\w*(?:Compute|Generate|Process)\s*\([^)]*\)(?!.*(?:try|if|check|validate))/,
      severity: 'medium',
      description: 'GPU operation without error handling',
      suggestion: 'Add error checking and fallback mechanisms'
    }
  };
  
  constructor(private dbPath: string) {
    super();
    this.db = new Database(dbPath);
    
    // Initialize database schema through unified manager
    const schemaManager = UnifiedSchemaManager.getInstance();
    schemaManager.initializeDatabase(this.db);
    
    // Create service-specific tables
    this.initServiceSpecificTables();
  }
  
  private initServiceSpecificTables(): void {
    // All tables are now created by UnifiedSchemaManager
    // Just initialize pattern statistics
    this.initializePatternStats();
  }
  
  private initializePatternStats(): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO antipattern_stats (pattern_name)
      VALUES (?)
    `);
    
    for (const patternKey of Object.keys(this.antiPatterns)) {
      const pattern = this.antiPatterns[patternKey as keyof typeof this.antiPatterns];
      stmt.run(pattern.name);
    }
  }
  
  /**
   * Analyze a file for anti-patterns
   */
  async analyzeFile(filePath: string, content: string): Promise<AntiPatternReport> {
    const detections: AntiPatternDetection[] = [];
    const lines = content.split('\n');
    
    // Limit content size to prevent regex catastrophic backtracking
    const maxContentSize = 50000; // 50KB
    if (content.length > maxContentSize) {
      console.warn(`  ⚠️  File too large for anti-pattern detection: ${path.basename(filePath)} (${content.length} bytes)`);
      content = content.substring(0, maxContentSize);
    }
    
    // Check each pattern with timeout
    for (const [key, pattern] of Object.entries(this.antiPatterns)) {
      try {
        const startTime = Date.now();
        const matches = this.detectPattern(content, pattern, lines);
        const elapsed = Date.now() - startTime;
        
        if (elapsed > 100) {
          console.warn(`  ⚠️  Slow pattern ${pattern.name}: ${elapsed}ms`);
        }
        
        detections.push(...matches.map(match => ({
          ...match,
          filePath
        })));
      } catch (error) {
        console.warn(`  ⚠️  Pattern detection error for ${pattern.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Skip AST-based detection for now to avoid hanging
    // const astBasedDetections = await this.detectAstPatterns(filePath);
    // detections.push(...astBasedDetections);
    
    // Store detections in a transaction
    try {
      await this.storeDetections(detections);
      await this.updateCorrelations(detections);
    } catch (error) {
      console.error(`Database error storing detections: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Generate report
    return this.generateReport(filePath, detections);
  }
  
  /**
   * Detect pattern in content
   */
  private detectPattern(
    content: string,
    pattern: typeof this.antiPatterns[keyof typeof this.antiPatterns],
    lines: string[]
  ): AntiPatternMatch[] {
    const matches: AntiPatternMatch[] = [];
    let match;
    
    while ((match = pattern.pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const startLine = Math.max(0, lineNumber - 2);
      const endLine = Math.min(lines.length - 1, lineNumber + 2);
      const snippet = lines.slice(startLine, endLine + 1).join('\n');
      
      matches.push({
        patternName: pattern.name,
        severity: pattern.severity,
        lineNumber,
        codeSnippet: snippet,
        description: pattern.description,
        suggestion: pattern.suggestion,
        confidence: this.calculateConfidence(match[0], pattern.name)
      });
    }
    
    return matches;
  }
  
  /**
   * Detect patterns using AST analysis
   */
  private async detectAstPatterns(filePath: string): Promise<AntiPatternDetection[]> {
    const detections: AntiPatternDetection[] = [];
    
    try {
      const symbols = this.db.prepare(`
        SELECT * FROM enhanced_symbols 
        WHERE file_path = ?
      `).all(filePath) as any[];

      // God Object detection
      const classSymbols = symbols.filter(s => s.kind === 'class');
      for (const cls of classSymbols) {
        const methods = symbols.filter(s => s.kind === 'method' && s.parent_class === cls.name);
        if (methods.length > 20) {
          detections.push({
            patternName: 'God Object',
            severity: 'high',
            filePath,
            lineNumber: cls.line,
            codeSnippet: `class ${cls.name} has ${methods.length} methods`,
            description: `Class ${cls.name} has too many methods (${methods.length})`,
            suggestion: 'Consider splitting this class into smaller, focused components',
            confidence: 0.9
          });
        }

        // Non-virtual destructor in base class
        if (cls.base_classes && cls.base_classes.length > 0 && !symbols.some(s => s.parent_class === cls.name && s.name === `~${cls.name}` && s.is_virtual)) {
            detections.push({
                patternName: 'Non-virtual Destructor in Base Class',
                severity: 'high',
                filePath,
                lineNumber: cls.line,
                codeSnippet: `class ${cls.name}`,
                description: `Class ${cls.name} is a base class but has a non-virtual destructor.`,
                suggestion: 'Declare the destructor as virtual to ensure proper cleanup in derived classes.',
                confidence: 0.95
            });
        }
      }
      
      // Complex method detection
      const complexMethods = symbols.filter(s => s.kind === 'method' && s.complexity > 15);
      for (const method of complexMethods) {
        detections.push({
          patternName: 'Complex Method',
          severity: 'medium',
          filePath,
          lineNumber: method.line,
          codeSnippet: `${method.signature} // Complexity: ${method.complexity}`,
          description: `Method ${method.name} has high cyclomatic complexity (${method.complexity})`,
          suggestion: 'Extract helper methods to reduce complexity',
          confidence: 1.0
        });
      }

      // Incorrect exception handling
      const catchClauses = symbols.filter(s => s.kind === 'catch_clause');
      for (const clause of catchClauses) {
        if (clause.type === 'std::exception' && !clause.is_reference) {
            detections.push({
                patternName: 'Catching by Value',
                severity: 'medium',
                filePath,
                lineNumber: clause.line,
                codeSnippet: `catch (std::exception e)`,
                description: 'Catching exceptions by value can lead to object slicing and loss of information.',
                suggestion: 'Catch exceptions by const reference, e.g., `catch (const std::exception& e)`.',
                confidence: 1.0
            });
        }
      }
      
    } catch (error) {
      // AST data not available, skip AST-based detection
    }
    
    return detections;
  }
  
  /**
   * Calculate confidence score for a detection
   */
  private calculateConfidence(matchText: string, patternName: string): number {
    let confidence = 0.8; // Base confidence
    
    // Adjust based on pattern characteristics
    if (matchText.includes('TODO') || matchText.includes('FIXME')) {
      confidence *= 0.7; // Lower confidence for work-in-progress code
    }
    
    if (matchText.includes('test') || matchText.includes('Test')) {
      confidence *= 0.6; // Lower confidence for test code
    }
    
    // Check false positive history
    const stats = this.db.prepare(`
      SELECT false_positives, total_detections 
      FROM antipattern_stats 
      WHERE pattern_name = ?
    `).get(patternName) as any;
    
    if (stats && stats.total_detections > 0) {
      const falsePositiveRate = stats.false_positives / stats.total_detections;
      confidence *= (1 - falsePositiveRate * 0.5);
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }
  
  /**
   * Store detections in database
   */
  private async storeDetections(detections: AntiPatternDetection[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO antipatterns 
      (pattern_name, pattern_category, severity, file_path, line_start, 
       evidence, suggestion, confidence, detected_by, detection_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const updateStats = this.db.prepare(`
      UPDATE antipattern_stats 
      SET total_detections = total_detections + 1,
          last_detected = ?
      WHERE pattern_name = ?
    `);
    
    for (const detection of detections) {
      stmt.run(
        detection.patternName,
        'code-quality', // pattern_category - default category
        detection.severity,
        detection.filePath,
        detection.lineNumber,
        JSON.stringify({ snippet: detection.codeSnippet, description: detection.description }), // evidence as JSON
        detection.suggestion,
        detection.confidence,
        'enhanced-antipattern-detector', // detected_by
        Date.now()
      );
      
      updateStats.run(Date.now(), detection.patternName);
    }
  }
  
  /**
   * Update pattern correlations
   */
  private async updateCorrelations(detections: AntiPatternDetection[]): Promise<void> {
    if (detections.length < 2) return;
    
    const stmt = this.db.prepare(`
      INSERT INTO pattern_correlations (pattern1, pattern2, correlation_count)
      VALUES (?, ?, 1)
      ON CONFLICT(pattern1, pattern2) 
      DO UPDATE SET correlation_count = correlation_count + 1
    `);
    
    // Find all pairs of patterns in the same file
    for (let i = 0; i < detections.length; i++) {
      for (let j = i + 1; j < detections.length; j++) {
        const [p1, p2] = [detections[i].patternName, detections[j].patternName].sort();
        stmt.run(p1, p2);
      }
    }
    
    // Update correlation strength
    this.db.exec(`
      UPDATE pattern_correlations
      SET correlation_strength = 
        CAST(correlation_count AS REAL) / (
          SELECT MAX(correlation_count) FROM pattern_correlations
        )
    `);
  }
  
  /**
   * Generate anti-pattern report
   */
  private generateReport(filePath: string, detections: AntiPatternDetection[]): AntiPatternReport {
    const bySeverity = detections.reduce((acc, d) => {
      acc[d.severity] = (acc[d.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const criticalPatterns = detections.filter(d => 
      d.severity === 'critical' || d.severity === 'high'
    );
    
    const recommendations = this.generateRecommendations(detections);
    
    return {
      filePath,
      totalDetections: detections.length,
      bySeverity,
      criticalPatterns,
      detections,
      recommendations,
      riskScore: this.calculateRiskScore(detections)
    };
  }
  
  /**
   * Generate recommendations based on detected patterns
   */
  private generateRecommendations(detections: AntiPatternDetection[]): string[] {
    const recommendations: string[] = [];
    const patternCounts = new Map<string, number>();
    
    // Count pattern occurrences
    detections.forEach(d => {
      patternCounts.set(d.patternName, (patternCounts.get(d.patternName) || 0) + 1);
    });
    
    // Memory management issues
    if (patternCounts.get('Raw Pointer Ownership') || patternCounts.get('Manual Memory Management')) {
      recommendations.push('Modernize memory management: Use smart pointers (unique_ptr, shared_ptr) consistently');
    }
    
    // Vulkan issues
    const vulkanIssues = detections.filter(d => d.patternName.includes('Vulkan'));
    if (vulkanIssues.length > 0) {
      recommendations.push('Implement Vulkan wrapper classes to encapsulate error handling and synchronization');
    }
    
    // Architecture issues
    if (patternCounts.get('God Object')) {
      recommendations.push('Refactor large classes: Apply Single Responsibility Principle');
    }
    
    // Performance issues
    const perfIssues = detections.filter(d => 
      d.patternName.includes('Copy') || d.patternName.includes('Vector')
    );
    if (perfIssues.length > 0) {
      recommendations.push('Review performance hotspots: Use profiler to identify actual bottlenecks');
    }
    
    return recommendations;
  }
  
  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(detections: AntiPatternDetection[]): number {
    const severityWeights = {
      critical: 10,
      high: 5,
      medium: 2,
      low: 1
    };
    
    const totalWeight = detections.reduce((sum, d) => 
      sum + (severityWeights[d.severity as keyof typeof severityWeights] || 0) * d.confidence,
      0
    );
    
    // Normalize to 0-100 scale
    return Math.min(100, totalWeight * 2);
  }
  
  /**
   * Get fix examples for a pattern
   */
  async getFixExamples(patternName: string): Promise<FixExample[]> {
    return this.db.prepare(`
      SELECT * FROM fix_examples 
      WHERE pattern_name = ?
      ORDER BY upvotes DESC
      LIMIT 5
    `).all(patternName) as FixExample[];
  }
  
  /**
   * Mark detection as false positive
   */
  async markFalsePositive(detectionId: number): Promise<void> {
    const detection = this.db.prepare(
      'SELECT pattern_name FROM antipatterns WHERE id = ?'
    ).get(detectionId) as any;
    
    if (detection) {
      this.db.prepare(
        'UPDATE antipatterns SET is_false_positive = 1 WHERE id = ?'
      ).run(detectionId);
      
      this.db.prepare(`
        UPDATE antipattern_stats 
        SET false_positives = false_positives + 1
        WHERE pattern_name = ?
      `).run(detection.pattern_name);
    }
  }
  
  /**
   * Get project-wide anti-pattern summary
   */
  async getProjectSummary(): Promise<ProjectAntiPatternSummary> {
    const totalFiles = this.db.prepare(
      'SELECT COUNT(DISTINCT file_path) as count FROM antipatterns'
    ).get() as any;
    
    const patternStats = this.db.prepare(`
      SELECT 
        pattern_name,
        COUNT(*) as detection_count,
        COUNT(DISTINCT file_path) as affected_files,
        AVG(confidence) as avg_confidence
      FROM antipatterns
      WHERE is_false_positive = 0
      GROUP BY pattern_name
      ORDER BY detection_count DESC
    `).all() as any[];
    
    const severityBreakdown = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM antipatterns
      WHERE is_false_positive = 0
      GROUP BY severity
    `).all() as any[];
    
    const correlations = this.db.prepare(`
      SELECT pattern1, pattern2, correlation_strength
      FROM pattern_correlations
      WHERE correlation_strength > 0.5
      ORDER BY correlation_strength DESC
      LIMIT 10
    `).all() as any[];
    
    return {
      totalFilesAnalyzed: totalFiles.count,
      totalDetections: patternStats.reduce((sum: number, p: any) => sum + p.detection_count, 0),
      patternStats,
      severityBreakdown,
      strongCorrelations: correlations,
      recommendations: this.generateProjectRecommendations(patternStats)
    };
  }
  
  private generateProjectRecommendations(patternStats: any[]): string[] {
    const recommendations: string[] = [];
    const topPatterns = patternStats.slice(0, 5);
    
    if (topPatterns.some(p => p.pattern_name.includes('Memory'))) {
      recommendations.push('Consider adopting a project-wide smart pointer policy');
    }
    
    if (topPatterns.some(p => p.pattern_name.includes('God Object'))) {
      recommendations.push('Schedule refactoring sessions to break down large classes');
    }
    
    if (topPatterns.some(p => p.pattern_name.includes('Vulkan'))) {
      recommendations.push('Implement comprehensive Vulkan wrapper library');
    }
    
    return recommendations;
  }
  
  close(): void {
    this.db.close();
  }
}

// Type definitions
interface AntiPatternMatch {
  patternName: string;
  severity: string;
  lineNumber: number;
  codeSnippet: string;
  description: string;
  suggestion: string;
  confidence: number;
}

interface AntiPatternDetection extends AntiPatternMatch {
  filePath: string;
}

interface AntiPatternReport {
  filePath: string;
  totalDetections: number;
  bySeverity: Record<string, number>;
  criticalPatterns: AntiPatternDetection[];
  detections: AntiPatternDetection[];
  recommendations: string[];
  riskScore: number;
}

interface FixExample {
  id: number;
  patternName: string;
  beforeCode: string;
  afterCode: string;
  explanation: string;
  upvotes: number;
}

interface ProjectAntiPatternSummary {
  totalFilesAnalyzed: number;
  totalDetections: number;
  patternStats: any[];
  severityBreakdown: any[];
  strongCorrelations: any[];
  recommendations: string[];
}