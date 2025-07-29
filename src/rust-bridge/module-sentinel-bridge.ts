/**
 * TypeScript bridge for Module Sentinel Rust NAPI bindings
 * Provides type-safe async interface to Rust analysis engine
 */

import { createLogger } from '../utils/logger';
import * as path from 'path';
import type {
  Symbol,
  Language,
  AnalysisResult,
  ProjectInfo,
  IndexingOptions,
  SearchOptions,
  SimilarityResult,
  ParseResult,
  UniversalRelationship,
  CodeQualityResult,
  ComponentReuseRecommendation,
  ErrorFixSuggestion
} from '../types/rust-bindings.js';

const logger = createLogger('RustBridge');

// Define type for Rust bindings
interface RustBindings {
  ModuleSentinel: {
    new(projectPath: string): Promise<ModuleSentinelInstance>;
  };
  simpleSearch(projectPath: string, query: string, limit?: number): Promise<Symbol[]>;
  quickAnalyze(projectPath: string): Promise<AnalysisResult>;
  version?: string;
}

interface ModuleSentinelInstance {
  initialize(): Promise<void>;
  indexProject(options: IndexingOptions): Promise<ProjectInfo>;
  searchSymbols(query: string, options: SearchOptions): Promise<Symbol[]>;
  analyzePatterns(): Promise<AnalysisResult>;
  calculateSimilarity(symbol1Id: string, symbol2Id: string): Promise<SimilarityResult>;
  parseFile(filePath: string, language: Language): Promise<ParseResult>;
  analyzeCodeQuality(filePath: string, language: Language, content: string, includeSuggestions?: boolean): Promise<CodeQualityResult>;
  getAllRelationships(): Promise<UniversalRelationship[]>;
  getSymbolRelationships(symbolId: string): Promise<UniversalRelationship[]>;
  // ML-powered methods
  findReusableComponents(functionalityDescription: string, requiredCapabilities: string[]): Promise<ComponentReuseRecommendation[]>;
  getErrorFixSuggestions(filePath: string, errorMessage: string, errorLine: number, errorColumn: number): Promise<ErrorFixSuggestion[]>;
  recordUserFix(errorMessage: string, errorLine: number, errorColumn: number, appliedFix: string, language: Language): Promise<void>;
}

// Import the Rust NAPI bindings
let rustBindings: RustBindings | null = null;

async function loadRustBindings() {
  if (rustBindings) return rustBindings;
  
  try {
    // Try to load the compiled NAPI module
    // Use require for .node files to avoid TypeScript import errors
    const bindingPath = path.resolve(__dirname, '../../module-sentinel-rust.node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    rustBindings = require(bindingPath) as RustBindings;
    logger.info('Rust NAPI bindings loaded successfully');
    return rustBindings;
  } catch (error) {
    logger.error('Failed to load Rust NAPI bindings', error);
    throw new Error(`NAPI bindings not found: ${error}. Run 'npm run build:rust' first.`);
  }
}

/**
 * TypeScript wrapper for the Rust ModuleSentinel instance
 */
export class ModuleSentinelBridge {
  private rustInstance: ModuleSentinelInstance | null = null;
  private projectPath: string;
  private initialized = false;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Initialize the Rust bridge and parsing service
   */
  async initialize(): Promise<void> {
    const complete = logger.operation('initializeRustBridge', { projectPath: this.projectPath });
    
    try {
      const bindings = await loadRustBindings();
      
      // Create Rust instance using factory method
      this.rustInstance = await (bindings as any).ModuleSentinel.new(this.projectPath);
      
      // Initialize parsing service (unsafe call required for NAPI)
      await this.rustInstance!.initialize();
      
      this.initialized = true;
      complete();
      logger.info('Module Sentinel Rust bridge initialized', { projectPath: this.projectPath });
    } catch (error) {
      logger.error('Failed to initialize Rust bridge', error);
      throw error;
    }
  }

  /**
   * Ensure the bridge is initialized before operations
   */
  private ensureInitialized() {
    if (!this.initialized || !this.rustInstance) {
      throw new Error('ModuleSentinelBridge not initialized. Call initialize() first.');
    }
  }

  /**
   * Index a project for analysis
   */
  async index_project(options?: IndexingOptions): Promise<ProjectInfo> {
    this.ensureInitialized();
    
    const complete = logger.operation('index_project', { options });
    
    try {
      const result = await this.rustInstance!.indexProject(options || {});
      complete();
      logger.info('Project indexing completed', { 
        symbolCount: result.symbolCount,
        projectId: result.id 
      });
      return result;
    } catch (error) {
      logger.error('Project indexing failed', error);
      throw error;
    }
  }

  /**
   * Search for symbols in the indexed project
   */
  async search_symbols(query: string, options?: SearchOptions): Promise<Symbol[]> {
    this.ensureInitialized();
    
    const complete = logger.operation('search_symbols', { query, options });
    
    try {
      const results = await this.rustInstance!.searchSymbols(query, options || {});
      complete();
      logger.debug('Symbol search completed', { query, resultCount: results.length });
      return results;
    } catch (error) {
      logger.error('Symbol search failed', error, { query });
      throw error;
    }
  }

  /**
   * Analyze patterns in the indexed project
   */
  async analyze_patterns(): Promise<AnalysisResult> {
    this.ensureInitialized();
    
    const complete = logger.operation('analyze_patterns');
    
    try {
      const result = await this.rustInstance!.analyzePatterns();
      complete();
      logger.info('Pattern analysis completed', { 
        patternsDetected: result.insights.patternsDetected,
        symbolsAnalyzed: result.insights.totalSymbolsAnalyzed 
      });
      return result;
    } catch (error) {
      logger.error('Pattern analysis failed', error);
      throw error;
    }
  }

  /**
   * Calculate similarity between two symbols
   */
  async calculate_similarity(symbol1Id: string, symbol2Id: string): Promise<SimilarityResult> {
    this.ensureInitialized();
    
    try {
      const result = await this.rustInstance!.calculateSimilarity(symbol1Id, symbol2Id);
      logger.debug('Similarity calculation completed', { 
        symbol1Id, 
        symbol2Id, 
        overallScore: result.overallScore 
      });
      return result;
    } catch (error) {
      logger.error('Similarity calculation failed', error, { symbol1Id, symbol2Id });
      throw error;
    }
  }

  /**
   * Parse a single file and return symbols
   */
  async parse_file(filePath: string, language: Language): Promise<ParseResult> {
    this.ensureInitialized();
    
    const complete = logger.operation('parse_file', { filePath, language });
    
    try {
      const result = await this.rustInstance!.parseFile(filePath, language);
      complete();
      logger.debug('File parsing completed', { 
        filePath, 
        symbolCount: result.symbols.length,
        parseMethod: result.parseMethod 
      });
      return result;
    } catch (error) {
      logger.error('File parsing failed', error, { filePath, language });
      throw error;
    }
  }

  /**
   * Analyze code quality for a specific file
   */
  async analyze_code_quality(filePath: string, language: Language, includeSuggestions?: boolean): Promise<CodeQualityResult> {
    this.ensureInitialized();
    
    const complete = logger.operation('analyze_code_quality', { filePath, language, includeSuggestions });
    
    try {
      // Read the file content
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      
      const result = await this.rustInstance!.analyzeCodeQuality(filePath, language, content, includeSuggestions);
      complete();
      logger.debug('Code quality analysis completed', { 
        filePath, 
        overallScore: result.overallScore,
        issuesFound: result.issues.length 
      });
      return result;
    } catch (error) {
      logger.error('Code quality analysis failed', error, { filePath, language });
      throw error;
    }
  }

  /**
   * Get all symbol relationships from the project
   */
  async get_all_relationships(): Promise<UniversalRelationship[]> {
    this.ensureInitialized();
    
    const complete = logger.operation('get_all_relationships');
    
    try {
      const relationships = await this.rustInstance!.getAllRelationships();
      complete();
      logger.info('All relationships retrieved', { count: relationships.length });
      return relationships;
    } catch (error) {
      logger.error('Failed to get all relationships', error);
      throw error;
    }
  }

  /**
   * Get relationships for a specific symbol
   */
  async get_symbol_relationships(symbolId: string): Promise<UniversalRelationship[]> {
    this.ensureInitialized();
    
    const complete = logger.operation('get_symbol_relationships', { symbolId });
    
    try {
      const relationships = await this.rustInstance!.getSymbolRelationships(symbolId);
      complete();
      logger.info('Symbol relationships retrieved', { symbolId, count: relationships.length });
      return relationships;
    } catch (error) {
      logger.error('Failed to get symbol relationships', error, { symbolId });
      throw error;
    }
  }

  /**
   * Find reusable components that match the intended functionality (ML-powered)
   */
  async find_reusable_components(functionalityDescription: string, requiredCapabilities: string[]): Promise<ComponentReuseRecommendation[]> {
    this.ensureInitialized();
    
    const complete = logger.operation('find_reusable_components', { functionalityDescription, requiredCapabilities });
    
    try {
      const recommendations = await this.rustInstance!.findReusableComponents(functionalityDescription, requiredCapabilities);
      complete();
      logger.info('Component reuse analysis completed', { 
        functionalityDescription, 
        recommendationCount: recommendations.length 
      });
      return recommendations;
    } catch (error) {
      logger.error('Component reuse analysis failed', error, { functionalityDescription });
      throw error;
    }
  }

  /**
   * Get ML-powered fix suggestions for parse errors
   */
  async get_error_fix_suggestions(filePath: string, errorMessage: string, errorLine: number, errorColumn: number): Promise<ErrorFixSuggestion[]> {
    this.ensureInitialized();
    
    const complete = logger.operation('get_error_fix_suggestions', { filePath, errorMessage, errorLine, errorColumn });
    
    try {
      const suggestions = await this.rustInstance!.getErrorFixSuggestions(filePath, errorMessage, errorLine, errorColumn);
      complete();
      logger.info('Error fix suggestions generated', { 
        filePath, 
        suggestionCount: suggestions.length 
      });
      return suggestions;
    } catch (error) {
      logger.error('Error fix suggestion generation failed', error, { filePath, errorMessage });
      throw error;
    }
  }

  /**
   * Record a user fix for ML training
   */
  async record_user_fix(errorMessage: string, errorLine: number, errorColumn: number, appliedFix: string, language: Language): Promise<void> {
    this.ensureInitialized();
    
    const complete = logger.operation('record_user_fix', { errorMessage, appliedFix, language });
    
    try {
      await this.rustInstance!.recordUserFix(errorMessage, errorLine, errorColumn, appliedFix, language);
      complete();
      logger.info('User fix recorded for ML training', { errorMessage, appliedFix });
    } catch (error) {
      logger.error('Failed to record user fix', error, { errorMessage, appliedFix });
      // Don't throw - ML training errors shouldn't break the user flow
    }
  }

  /**
   * Get project statistics and health information
   */
  getProjectInfo(): { projectPath: string; initialized: boolean } {
    return {
      projectPath: this.projectPath,
      initialized: this.initialized
    };
  }
}

/**
 * Simple module-level functions for quick operations without full bridge setup
 */

/**
 * Quick symbol search without creating a full bridge instance
 */
export async function quick_search(projectPath: string, query: string, limit?: number): Promise<Symbol[]> {
  const complete = logger.operation('quick_search', { projectPath, query, limit });
  
  try {
    const bindings = await loadRustBindings();
    const results = await bindings.simpleSearch(projectPath, query, limit);
    complete();
    return results;
  } catch (error) {
    logger.error('Quick search failed', error, { projectPath, query });
    throw error;
  }
}

/**
 * Quick pattern analysis without full bridge setup
 */
export async function quick_analyze(projectPath: string): Promise<AnalysisResult> {
  const complete = logger.operation('quick_analyze', { projectPath });
  
  try {
    const bindings = await loadRustBindings();
    const result = await bindings.quickAnalyze(projectPath);
    complete();
    return result;
  } catch (error) {
    logger.error('Quick analysis failed', error, { projectPath });
    throw error;
  }
}

/**
 * Check if Rust bindings are available
 */
export async function check_rust_bindings(): Promise<boolean> {
  try {
    await loadRustBindings();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get bridge health information
 */
export async function get_bridge_health(): Promise<{
  rustBindingsAvailable: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const bindings = await loadRustBindings();
    return {
      rustBindingsAvailable: true,
      version: bindings.version || 'unknown'
    };
  } catch (error) {
    return {
      rustBindingsAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}