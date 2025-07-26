/**
 * Parser Post-Processor
 * 
 * Consolidated system that combines symbol deduplication, validation, and safeguards
 * into a single efficient pass. Replaces the redundant separate systems.
 */

import { SymbolInfo, RelationshipInfo, ParseResult } from '../tree-sitter/parser-types.js';

export interface ProcessedResult extends ParseResult {
  processing: {
    duplicatesRemoved: number;
    validationWarnings: string[];
    validationErrors: string[];
    qualityScore: number;
    processingTimeMs: number;
  };
}

export interface ProcessingIssue {
  type: 'error' | 'warning' | 'info';
  category: 'duplication' | 'validation' | 'performance' | 'semantics';
  message: string;
  details?: any;
}

export class ParserPostProcessor {
  private issues: ProcessingIssue[] = [];
  private duplicatesRemoved = 0;
  private seenSymbols = new Map<string, SymbolInfo>();

  /**
   * Process parse results with deduplication, validation, and quality checks
   */
  process(result: ParseResult, filePath: string): ProcessedResult {
    const startTime = Date.now();
    this.issues = [];
    this.duplicatesRemoved = 0;
    this.seenSymbols.clear();

    // Single pass: deduplicate and validate symbols
    const cleanSymbols = this.deduplicateAndValidateSymbols(result.symbols);
    
    // Validate relationships
    this.validateRelationships(result.relationships, cleanSymbols);
    
    // Performance and semantic checks
    this.performQualityChecks(result, filePath);
    
    const processingTime = Date.now() - startTime;
    const qualityScore = this.calculateQualityScore(cleanSymbols, result.relationships);

    return {
      ...result,
      symbols: cleanSymbols,
      processing: {
        duplicatesRemoved: this.duplicatesRemoved,
        validationWarnings: this.getWarnings(),
        validationErrors: this.getErrors(),
        qualityScore,
        processingTimeMs: processingTime
      }
    };
  }

  /**
   * Single pass: deduplicate symbols while validating them
   */
  private deduplicateAndValidateSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
    // Sort by quality metrics to process better symbols first
    const sortedSymbols = symbols.sort((a, b) => {
      // Higher confidence first
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      // More complete features first
      const aFeatures = Object.keys(a.languageFeatures || {}).length;
      const bFeatures = Object.keys(b.languageFeatures || {}).length;
      return bFeatures - aFeatures;
    });

    for (const symbol of sortedSymbols) {
      // Validate symbol during deduplication
      if (this.validateSymbol(symbol)) {
        this.addSymbolWithDeduplication(symbol);
      }
    }

    return Array.from(this.seenSymbols.values());
  }

  /**
   * Validate a single symbol and return whether it should be included
   */
  private validateSymbol(symbol: SymbolInfo): boolean {
    let isValid = true;

    // Check for empty or invalid names
    if (!symbol.name || symbol.name.trim() === '') {
      this.addIssue('error', 'validation', `Symbol has empty name at line ${symbol.line}`);
      isValid = false;
    }

    // Check for position inconsistencies
    if (symbol.endLine && symbol.endLine < symbol.line) {
      this.addIssue('error', 'validation', `Symbol "${symbol.name}" has end line before start line`);
      isValid = false;
    }

    // Check for suspicious qualified names (parser capturing too much)
    if (symbol.qualifiedName && symbol.qualifiedName.length > 200) {
      this.addIssue('warning', 'validation', 
        `Symbol "${symbol.name}" has unusually long qualified name (${symbol.qualifiedName.length} chars)`);
    }

    if (symbol.qualifiedName && (
      symbol.qualifiedName.includes('\n') || 
      (symbol.qualifiedName.includes('{') && symbol.qualifiedName.includes('}') && symbol.qualifiedName.length > 50)
    )) {
      this.addIssue('warning', 'validation', 
        `Symbol "${symbol.name}" qualified name appears to contain raw code`);
    }

    // Check confidence levels
    if (symbol.confidence < 0.3) {
      this.addIssue('warning', 'validation', 
        `Symbol "${symbol.name}" has very low confidence (${symbol.confidence})`);
    }

    return isValid;
  }

  /**
   * Add symbol with deduplication logic
   */
  private addSymbolWithDeduplication(symbol: SymbolInfo): void {
    const key = this.generateDeduplicationKey(symbol);
    
    if (this.seenSymbols.has(key)) {
      // Duplicate detected
      const existing = this.seenSymbols.get(key)!;
      
      if (this.shouldReplaceSymbol(existing, symbol)) {
        this.seenSymbols.set(key, symbol);
        this.recordDuplicateRemoval(existing, symbol, 'replaced');
      } else {
        this.recordDuplicateRemoval(existing, symbol, 'rejected');
      }
      
      this.duplicatesRemoved++;
    } else {
      // New symbol
      this.seenSymbols.set(key, symbol);
    }
  }

  /**
   * Generate deduplication key for symbol
   */
  private generateDeduplicationKey(symbol: SymbolInfo): string {
    if (symbol.kind === 'function') {
      // For functions, use name only for arrow functions that might be detected multiple times
      const isFromVariableDeclaration = symbol.qualifiedName === symbol.name;
      const isFromArrowFunctionNode = symbol.qualifiedName !== symbol.name && 
                                      symbol.languageFeatures?.isArrowFunction;
      
      if (isFromVariableDeclaration || isFromArrowFunctionNode) {
        return `${symbol.kind}:${symbol.name}`;
      }
      
      return `${symbol.kind}:${symbol.name}:${symbol.line}`;
    }
    
    return `${symbol.kind}:${symbol.name}:${symbol.line}:${symbol.column}`;
  }

  /**
   * Determine which symbol to keep when duplicates are found
   */
  private shouldReplaceSymbol(existing: SymbolInfo, candidate: SymbolInfo): boolean {
    // 1. Prefer symbols from variable handlers over arrow function handlers
    if (existing.kind === 'function' && candidate.kind === 'function') {
      const existingFromVariable = !existing.languageFeatures?.isArrowFunction || 
                                   existing.qualifiedName === existing.name;
      const candidateFromVariable = !candidate.languageFeatures?.isArrowFunction || 
                                    candidate.qualifiedName === candidate.name;
      
      if (existingFromVariable && !candidateFromVariable) {
        return false; // Keep existing (from variable handler)
      }
      if (!existingFromVariable && candidateFromVariable) {
        return true; // Replace with candidate (from variable handler)
      }
    }
    
    // 2. Prefer higher confidence
    if (candidate.confidence > existing.confidence + 0.1) {
      return true;
    }
    
    // 3. Prefer symbols with signatures
    if (candidate.signature && !existing.signature) {
      return true;
    }
    
    // 4. Prefer more complete language features
    const candidateFeatureCount = Object.keys(candidate.languageFeatures || {}).length;
    const existingFeatureCount = Object.keys(existing.languageFeatures || {}).length;
    
    if (candidateFeatureCount > existingFeatureCount + 2) {
      return true;
    }
    
    return false; // Keep existing by default
  }

  /**
   * Record duplicate removal for analysis
   */
  private recordDuplicateRemoval(existing: SymbolInfo, duplicate: SymbolInfo, action: 'replaced' | 'rejected'): void {
    if (existing.kind === 'function' && duplicate.kind === 'function' && existing.name === duplicate.name) {
      const existingIsArrow = existing.languageFeatures?.isArrowFunction;
      const duplicateIsArrow = duplicate.languageFeatures?.isArrowFunction;
      
      if (existingIsArrow && duplicateIsArrow) {
        // This is the expected arrow function double-detection pattern
        return;
      }
    }
    
    // Log unexpected duplications
    this.addIssue('info', 'duplication', 
      `Symbol "${existing.name}" detected multiple times (${action})`);
  }

  /**
   * Validate relationships
   */
  private validateRelationships(relationships: RelationshipInfo[], symbols: SymbolInfo[]): void {
    const symbolNames = new Set(symbols.map(s => s.name));
    const qualifiedNames = new Set(symbols.map(s => s.qualifiedName));

    relationships.forEach((rel, index) => {
      // Check for empty relationship names
      if (!rel.fromName || !rel.toName) {
        this.addIssue('error', 'validation', 
          `Relationship ${index} has empty from/to name`);
      }

      // Check confidence levels
      if (rel.confidence < 0.2) {
        this.addIssue('warning', 'validation', 
          `Relationship "${rel.fromName}" -> "${rel.toName}" has very low confidence (${rel.confidence})`);
      }
    });
  }

  /**
   * Perform quality and performance checks
   */
  private performQualityChecks(result: ParseResult, filePath: string): void {
    const { symbols, relationships } = result;
    
    // Performance checks
    if (symbols.length > 1000) {
      this.addIssue('warning', 'performance', 
        `Extracted ${symbols.length} symbols - may impact performance`);
    }
    
    if (relationships.length > 5000) {
      this.addIssue('warning', 'performance', 
        `Extracted ${relationships.length} relationships - may impact performance`);
    }

    // Check duplicate removal ratio
    if (this.duplicatesRemoved > symbols.length * 0.3) {
      this.addIssue('warning', 'duplication', 
        `High duplication rate: removed ${this.duplicatesRemoved} duplicates from ${symbols.length + this.duplicatesRemoved} total`);
    }

    // Semantic accuracy checks
    this.performSemanticChecks(symbols, filePath);
  }

  /**
   * Perform semantic accuracy checks
   */
  private performSemanticChecks(symbols: SymbolInfo[], filePath: string): void {
    const functions = symbols.filter(s => s.kind === 'function');
    const classes = symbols.filter(s => s.kind === 'class');

    // Check function/class ratio (sanity check)
    if (functions.length > 0 && classes.length > 0) {
      const ratio = functions.length / classes.length;
      if (ratio > 50) {
        this.addIssue('warning', 'semantics', 
          `Very high function-to-class ratio (${ratio.toFixed(1)}:1) - check for over-detection`);
      }
    }

    // Check arrow function percentage
    const arrowFunctions = functions.filter(f => f.languageFeatures?.isArrowFunction);
    if (arrowFunctions.length > functions.length * 0.9 && functions.length > 5) {
      this.addIssue('info', 'semantics', 
        `${((arrowFunctions.length / functions.length) * 100).toFixed(1)}% of functions are arrow functions`);
    }
  }

  /**
   * Calculate quality score based on various metrics
   */
  private calculateQualityScore(symbols: SymbolInfo[], relationships: RelationshipInfo[]): number {
    let score = 100;
    
    // Deduct for errors and warnings
    const errors = this.getErrors();
    const warnings = this.getWarnings();
    
    score -= errors.length * 10; // -10 per error
    score -= warnings.length * 2; // -2 per warning
    
    // Deduct for high duplication rate
    const totalSymbols = symbols.length + this.duplicatesRemoved;
    if (totalSymbols > 0) {
      const duplicationRate = this.duplicatesRemoved / totalSymbols;
      score -= duplicationRate * 20; // Up to -20 for 100% duplication
    }
    
    // Bonus for good confidence scores
    const avgConfidence = symbols.reduce((sum, s) => sum + s.confidence, 0) / symbols.length;
    score += (avgConfidence - 0.7) * 10; // Bonus/penalty based on average confidence
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Helper methods for issue management
   */
  private addIssue(type: 'error' | 'warning' | 'info', category: 'duplication' | 'validation' | 'performance' | 'semantics', message: string, details?: any): void {
    this.issues.push({ type, category, message, details });
  }

  private getErrors(): string[] {
    return this.issues.filter(i => i.type === 'error').map(i => i.message);
  }

  private getWarnings(): string[] {
    return this.issues.filter(i => i.type === 'warning').map(i => i.message);
  }

  /**
   * Generate a summary report
   */
  generateReport(result: ProcessedResult): string {
    const { processing } = result;
    
    let report = '🛡️ Parser Post-Processing Report\n\n';
    report += `📊 Quality Score: ${processing.qualityScore.toFixed(1)}/100\n`;
    report += `⚡ Processing Time: ${processing.processingTimeMs}ms\n`;
    
    if (processing.duplicatesRemoved > 0) {
      report += `🔄 Duplicates Removed: ${processing.duplicatesRemoved}\n`;
    }
    
    if (processing.validationErrors.length > 0) {
      report += `❌ Errors: ${processing.validationErrors.length}\n`;
      processing.validationErrors.forEach((error, i) => {
        report += `  ${i + 1}. ${error}\n`;
      });
    }
    
    if (processing.validationWarnings.length > 0) {
      report += `⚠️ Warnings: ${processing.validationWarnings.length}\n`;
      processing.validationWarnings.slice(0, 5).forEach((warning, i) => {
        report += `  ${i + 1}. ${warning}\n`;
      });
      if (processing.validationWarnings.length > 5) {
        report += `  ... and ${processing.validationWarnings.length - 5} more\n`;
      }
    }
    
    return report;
  }
}