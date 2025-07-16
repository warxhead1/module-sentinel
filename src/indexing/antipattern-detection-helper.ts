import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Anti-Pattern Detection Helper
 * Optimized batch processing for anti-pattern detection to avoid the 1.2 second bottleneck
 */
export class AntiPatternDetectionHelper {
  private db: Database.Database;
  private debugMode: boolean;

  // Simplified high-impact patterns for batch processing
  private readonly fastPatterns = {
    rawPointerOwnership: {
      name: 'Raw Pointer Ownership',
      pattern: /(?:new\s+\w+(?:\[[^\]]*\])?(?!\s*\())(?!.*(?:unique_ptr|shared_ptr))/g,
      severity: 'high',
      description: 'Using raw pointers for ownership instead of smart pointers',
      suggestion: 'Use std::unique_ptr or std::shared_ptr for ownership'
    },
    
    vulkanErrorIgnored: {
      name: 'Ignored Vulkan Error',
      pattern: /vk\w+\s*\([^)]+\)\s*;(?!\s*(?:if|VK_CHECK|assert|throw))/g,
      severity: 'high',
      description: 'Vulkan API call without error checking',
      suggestion: 'Check VkResult and handle errors appropriately'
    },
    
    mutexWithoutLockGuard: {
      name: 'Manual Mutex Management',
      pattern: /mutex\.lock\(\)[^;]*;(?!.*lock_guard|unique_lock)/g,
      severity: 'high',
      description: 'Manual mutex locking without RAII lock guard',
      suggestion: 'Use std::lock_guard or std::unique_lock'
    },
    
    cStyleCast: {
      name: 'C-Style Cast',
      pattern: /\(\s*(?:int|float|double|char|void)\s*\*?\s*\)/g,
      severity: 'low',
      description: 'Using C-style casts instead of C++ casts',
      suggestion: 'Use static_cast, dynamic_cast, const_cast, or reinterpret_cast'
    },
    
    unnecessaryCopy: {
      name: 'Unnecessary Copy',
      pattern: /for\s*\(\s*(?:auto|std::\w+)\s+\w+\s*:/g,
      severity: 'medium',
      description: 'Potential unnecessary copy in range-for',
      suggestion: 'Use const auto& for range-for loops'
    }
  };

  constructor(db: Database.Database, debugMode: boolean = false) {
    this.db = db;
    this.debugMode = debugMode;
  }

  /**
   * OPTIMIZED: Run anti-pattern detection for ALL files in batch
   * Ancient wisdom: Process all files with shared resources instead of per-file
   */
  async runAntiPatternDetectionBatch(allValidResults: any[]): Promise<void> {
    if (allValidResults.length === 0) return;

    // 1. Read all file contents in parallel
    const fileContents = await Promise.all(
      allValidResults.map(async (result) => {
        try {
          const content = await fs.readFile(result.filePath, 'utf-8');
          return { filePath: result.filePath, content };
        } catch (error) {
          console.warn(`Failed to read file for anti-pattern detection: ${result.filePath}`);
          return { filePath: result.filePath, content: '' };
        }
      })
    );

    // 2. Process all files with shared pattern compilation
    const allDetections: AntiPatternDetection[] = [];
    
    // Pre-compile all patterns once
    const compiledPatterns = Object.entries(this.fastPatterns).map(([key, pattern]) => ({
      key,
      ...pattern,
      compiledPattern: new RegExp(pattern.pattern.source, pattern.pattern.flags)
    }));

    // Process all files in batch
    for (const { filePath, content } of fileContents) {
      if (!content) continue;

      // Limit content size to prevent regex catastrophic backtracking
      const maxContentSize = 50000; // 50KB
      const processedContent = content.length > maxContentSize 
        ? content.substring(0, maxContentSize) 
        : content;

      const lines = processedContent.split('\n');
      const fileDetections = this.detectPatternsInFile(
        filePath, 
        processedContent, 
        lines, 
        compiledPatterns
      );

      allDetections.push(...fileDetections);
    }

    // 3. Add duplicate code detection (leveraging existing database)
    const duplicateDetections = await this.detectDuplicateCodeBatch(allValidResults);
    allDetections.push(...duplicateDetections);

    // 4. Store all detections in a single batch transaction
    if (allDetections.length > 0) {
      await this.storeDetectionsBatch(allDetections);
    }

    if (this.debugMode) {
      console.log(`📊 Anti-pattern detection completed: ${allDetections.length} detections across ${allValidResults.length} files`);
    }
  }

  /**
   * Fast pattern detection for a single file using pre-compiled patterns
   */
  private detectPatternsInFile(
    filePath: string,
    content: string,
    lines: string[],
    compiledPatterns: any[]
  ): AntiPatternDetection[] {
    const detections: AntiPatternDetection[] = [];

    for (const pattern of compiledPatterns) {
      try {
        let match;
        // Reset regex state
        pattern.compiledPattern.lastIndex = 0;

        while ((match = pattern.compiledPattern.exec(content)) !== null) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          const startLine = Math.max(0, lineNumber - 1);
          const endLine = Math.min(lines.length - 1, lineNumber + 1);
          const snippet = lines.slice(startLine, endLine + 1).join('\n');

          detections.push({
            patternName: pattern.name,
            severity: pattern.severity,
            filePath,
            lineNumber,
            codeSnippet: snippet,
            description: pattern.description,
            suggestion: pattern.suggestion,
            confidence: this.calculateFastConfidence(match[0], pattern.name)
          });

          // Prevent infinite loops on global regex
          if (pattern.compiledPattern.lastIndex === match.index) {
            pattern.compiledPattern.lastIndex++;
          }
        }
      } catch (error) {
        // Skip problematic patterns
        if (this.debugMode) {
          console.warn(`Pattern ${pattern.name} failed on ${path.basename(filePath)}: ${error}`);
        }
      }
    }

    return detections;
  }

  /**
   * Batch duplicate code detection using pre-fetched symbol data
   */
  private async detectDuplicateCodeBatch(allValidResults: any[]): Promise<AntiPatternDetection[]> {
    const detections: AntiPatternDetection[] = [];

    try {
      // Get all file paths
      const allFilePaths = allValidResults.map(r => r.filePath);
      const placeholders = allFilePaths.map(() => '?').join(',');

      // Single query to get all methods with body hashes
      const allMethods = this.db.prepare(`
        SELECT id, name, file_path, line, body_hash, kind, parent_class
        FROM enhanced_symbols 
        WHERE file_path IN (${placeholders})
        AND kind IN ('method', 'function') 
        AND body_hash IS NOT NULL
      `).all(...allFilePaths) as any[];

      // Group by body hash for duplicate detection
      const methodsByHash = new Map<string, any[]>();
      for (const method of allMethods) {
        if (!methodsByHash.has(method.body_hash)) {
          methodsByHash.set(method.body_hash, []);
        }
        methodsByHash.get(method.body_hash)!.push(method);
      }

      // Find duplicates
      for (const [hash, methods] of methodsByHash) {
        if (methods.length > 1) {
          // Process each method in the duplicate group
          for (const method of methods) {
            const duplicates = methods.filter(m => m.id !== method.id);
            const duplicateCount = duplicates.length;
            const crossFile = duplicates.some(d => d.file_path !== method.file_path);
            const severity = this.calculateDuplicateSeverity(duplicateCount, crossFile);

            let description = `Method '${method.name}' has ${duplicateCount} duplicate${duplicateCount > 1 ? 's' : ''}`;
            if (crossFile) {
              const fileCount = new Set(duplicates.map(d => d.file_path)).size;
              description += ` across ${fileCount + 1} files`;
            }

            detections.push({
              patternName: crossFile ? 'Cross-File Code Duplication' : 'Code Duplication',
              severity,
              filePath: method.file_path,
              lineNumber: method.line,
              codeSnippet: `${method.parent_class ? method.parent_class + '::' : ''}${method.name}()`,
              description,
              suggestion: this.getDuplicationRefactoringSuggestion(duplicateCount, crossFile, method.kind),
              confidence: 0.95
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error in batch duplicate detection: ${error}`);
    }

    return detections;
  }

  /**
   * Fast confidence calculation
   */
  private calculateFastConfidence(matchText: string, patternName: string): number {
    let confidence = 0.8;

    // Quick adjustments
    if (matchText.includes('TODO') || matchText.includes('FIXME')) {
      confidence *= 0.7;
    }
    if (matchText.includes('test') || matchText.includes('Test')) {
      confidence *= 0.6;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate duplicate severity
   */
  private calculateDuplicateSeverity(duplicateCount: number, crossFile: boolean): 'low' | 'medium' | 'high' | 'critical' {
    if (crossFile && duplicateCount >= 3) return 'high';
    if (crossFile || duplicateCount >= 5) return 'medium';
    return 'low';
  }

  /**
   * Generate refactoring suggestion
   */
  private getDuplicationRefactoringSuggestion(duplicateCount: number, crossFile: boolean, kind: string): string {
    if (crossFile) {
      return 'Extract common functionality into a shared utility class or module';
    }
    if (kind === 'method' && duplicateCount >= 3) {
      return 'Extract common logic into a private helper method';
    }
    return 'Refactor to eliminate code duplication using DRY principle';
  }

  /**
   * Store all detections in a single batch transaction
   */
  private async storeDetectionsBatch(detections: AntiPatternDetection[]): Promise<void> {
    if (detections.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO detected_patterns 
      (symbol_id, pattern_type, pattern_name, confidence, line_number, details, detected_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const detection of detections) {
        try {
          stmt.run(
            null, // symbol_id - null for file-level patterns
            'antipattern',
            detection.patternName,
            detection.confidence,
            detection.lineNumber,
            JSON.stringify({ 
              severity: detection.severity,
              file_path: detection.filePath,
              snippet: detection.codeSnippet, 
              description: detection.description,
              suggestion: detection.suggestion
            }),
            'antipattern-helper'
          );
        } catch (error) {
          // Skip invalid detections
          if (this.debugMode) {
            console.warn(`Failed to store detection: ${detection.patternName} in ${detection.filePath}`);
          }
        }
      }
    });

    transaction();
  }
}

// Type definitions
interface AntiPatternDetection {
  patternName: string;
  severity: string;
  filePath: string;
  lineNumber: number;
  codeSnippet: string;
  description: string;
  suggestion: string;
  confidence: number;
}