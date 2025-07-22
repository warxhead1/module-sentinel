/**
 * Universal Language-Agnostic Indexer
 * 
 * This indexer orchestrates the parsing of multiple languages using
 * tree-sitter parsers and stores results in the universal schema.
 * It replaces the old pattern-aware indexer for the new system.
 */

import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, inArray, sql, isNull } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';

// Import schema
import { 
  projects, 
  languages, 
  fileIndex,
  universalSymbols,
  universalRelationships,
  detectedPatterns,
  projectLanguages
} from '../database/schema/universal.js';

// Import optimized parsers
import { OptimizedTreeSitterBaseParser as TreeSitterBaseParser } from '../parsers/tree-sitter/optimized-base-parser.js';
import { ParseOptions, ParseResult, RelationshipInfo } from '../parsers/tree-sitter/parser-types.js';
import { OptimizedCppTreeSitterParser as CppTreeSitterParser } from '../parsers/tree-sitter/optimized-cpp-parser.js';

export interface IndexOptions {
  projectPath: string;
  projectName?: string;
  languages?: string[];
  filePatterns?: string[];
  excludePatterns?: string[];
  parallelism?: number;
  debugMode?: boolean;
  forceReindex?: boolean;
  enableSemanticAnalysis?: boolean;
  enablePatternDetection?: boolean;
  maxFiles?: number;
  progressCallback?: (progress: IndexProgress) => void;
}

export interface IndexProgress {
  phase: 'discovery' | 'parsing' | 'relationships' | 'analysis' | 'storing' | 'complete';
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  errors: number;
  startTime: number;
  estimatedTimeRemaining?: number;
}

export interface IndexResult {
  success: boolean;
  projectId: number;
  filesIndexed: number;
  symbolsFound: number;
  relationshipsFound: number;
  patternsFound: number;
  errors: string[];
  duration: number;
  confidence: number;
}

interface LanguageParser {
  language: string;
  extensions: string[];
  parser: new (db: Database, options: ParseOptions) => TreeSitterBaseParser;
}

export class UniversalIndexer extends EventEmitter {
  private db: ReturnType<typeof drizzle>;
  private rawDb: Database;
  private options: Required<IndexOptions>;
  private parsers: Map<string, LanguageParser> = new Map();
  private progress: IndexProgress;
  private errors: string[] = [];
  
  constructor(db: Database, options: IndexOptions) {
    super();
    this.rawDb = db;
    this.db = drizzle(db);
    
    this.options = {
      projectPath: options.projectPath,
      projectName: options.projectName || path.basename(options.projectPath),
      languages: options.languages || ['cpp', 'python', 'typescript', 'javascript'],
      filePatterns: options.filePatterns || [],
      excludePatterns: options.excludePatterns || ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      parallelism: options.parallelism || 4,
      debugMode: options.debugMode || false,
      forceReindex: options.forceReindex || false,
      enableSemanticAnalysis: options.enableSemanticAnalysis ?? true,
      enablePatternDetection: options.enablePatternDetection ?? true,
      maxFiles: options.maxFiles || 0,
      progressCallback: options.progressCallback || (() => {})
    };
    
    this.progress = {
      phase: 'discovery',
      totalFiles: 0,
      processedFiles: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    this.registerParsers();
  }

  /**
   * Register language parsers
   */
  private registerParsers(): void {
    // Register C++ parser
    this.parsers.set('cpp', {
      language: 'cpp',
      extensions: ['.cpp', '.hpp', '.h', '.cc', '.cxx', '.hxx', '.ixx', '.cppm'],
      parser: CppTreeSitterParser
    });
    
    // Register Python parser - dynamic import to avoid circular dependencies
    this.parsers.set('python', {
      language: 'python',
      extensions: ['.py', '.pyi', '.pyx'],
      parser: require('../parsers/adapters/python-language-parser.js').PythonLanguageParser
    });
    
    // Register TypeScript parser
    this.parsers.set('typescript', {
      language: 'typescript',
      extensions: ['.ts', '.tsx'],
      parser: require('../parsers/adapters/typescript-language-parser.js').TypeScriptLanguageParser
    });
    
    // Register JavaScript parser (uses TypeScript parser with JS mode)
    this.parsers.set('javascript', {
      language: 'javascript',
      extensions: ['.js', '.jsx', '.mjs', '.cjs'],
      parser: require('../parsers/adapters/typescript-language-parser.js').TypeScriptLanguageParser
    });
  }

  /**
   * Index a project
   */
  async indexProject(): Promise<IndexResult> {
    const startTime = Date.now();
    
    try {
      // Phase 1: Project setup
      const projectId = await this.ensureProject();
      const languageMap = await this.ensureLanguages();
      
      // Phase 2: File discovery
      this.updateProgress('discovery');
      const files = await this.discoverFiles();
      this.progress.totalFiles = files.length;
      
      if (files.length === 0) {
        return this.createResult(projectId, startTime, false, 'No files found to index');
      }
      
      this.debug(`Discovered ${files.length} files to index`);
      
      // Phase 3: Parallel parsing
      this.updateProgress('parsing');
      const parseResults = await this.parseFilesInParallel(files, projectId, languageMap);
      
      // Phase 4: Resolve and store relationships
      this.updateProgress('relationships');
      await this.resolveAndStoreRelationships(projectId, parseResults);
      
      // Phase 5: Semantic analysis
      if (this.options.enableSemanticAnalysis) {
        this.updateProgress('analysis');
        await this.performSemanticAnalysis(projectId);
      }
      
      // Phase 6: Complete
      this.updateProgress('complete');
      
      // Calculate totals
      const stats = await this.calculateIndexStats(projectId);
      
      return {
        success: true,
        projectId,
        filesIndexed: parseResults.length,
        symbolsFound: stats.symbols,
        relationshipsFound: stats.relationships,
        patternsFound: stats.patterns,
        errors: this.errors,
        duration: Date.now() - startTime,
        confidence: stats.avgConfidence
      };
      
    } catch (error) {
      this.debug(`Indexing failed: ${error}`);
      return this.createResult(0, startTime, false, String(error));
    }
  }

  /**
   * Ensure project exists in database
   */
  private async ensureProject(): Promise<number> {
    // First check by name to avoid conflicts
    const existingByName = await this.db.select()
      .from(projects)
      .where(eq(projects.name, this.options.projectName))
      .limit(1);
    
    if (existingByName.length > 0) {
      // Update project path if needed
      await this.db.update(projects)
        .set({
          rootPath: this.options.projectPath,
          updatedAt: new Date(),
          isActive: true
        })
        .where(eq(projects.id, existingByName[0].id));
      
      return existingByName[0].id;
    }
    
    // Check by path
    const existingByPath = await this.db.select()
      .from(projects)
      .where(eq(projects.rootPath, this.options.projectPath))
      .limit(1);
    
    if (existingByPath.length > 0) {
      // Update project name
      await this.db.update(projects)
        .set({
          name: this.options.projectName,
          updatedAt: new Date(),
          isActive: true
        })
        .where(eq(projects.id, existingByPath[0].id));
      
      return existingByPath[0].id;
    }
    
    // Create new project
    const result = await this.db.insert(projects)
      .values({
        name: this.options.projectName,
        rootPath: this.options.projectPath,
        description: `Indexed by Universal Indexer`,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      })
      .returning({ id: projects.id });
    
    return result[0].id;
  }

  /**
   * Ensure languages exist and return mapping
   */
  private async ensureLanguages(): Promise<Map<string, number>> {
    const languageMap = new Map<string, number>();
    
    for (const lang of this.options.languages) {
      const existing = await this.db.select()
        .from(languages)
        .where(eq(languages.name, lang))
        .limit(1);
      
      if (existing.length > 0) {
        languageMap.set(lang, existing[0].id);
      } else {
        // Insert new language
        const result = await this.db.insert(languages)
          .values({
            name: lang,
            displayName: this.getLanguageDisplayName(lang),
            parserClass: this.getParserClass(lang),
            extensions: JSON.stringify(this.getLanguageExtensions(lang)),
            isEnabled: true
          })
          .returning({ id: languages.id });
        
        languageMap.set(lang, result[0].id);
      }
    }
    
    return languageMap;
  }

  /**
   * Discover files to index
   */
  private async discoverFiles(): Promise<string[]> {
    const files: string[] = [];
    const extensions = this.getTargetExtensions();
    
    this.debug(`Target extensions: ${extensions.join(', ')}`);
    this.debug(`Project path: ${this.options.projectPath}`);
    
    // Build glob patterns
    const patterns = this.options.filePatterns.length > 0 
      ? this.options.filePatterns
      : extensions.map(ext => `**/*${ext}`);
    
    this.debug(`Glob patterns: ${patterns.join(', ')}`);
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.options.projectPath,
        absolute: true,
        ignore: this.options.excludePatterns
      });
      
      this.debug(`Pattern ${pattern} found ${matches.length} files`);
      files.push(...matches);
    }
    
    // Filter by language extensions
    const extensionSet = new Set(extensions);
    const filteredFiles = files.filter(file => {
      const ext = path.extname(file);
      return extensionSet.has(ext);
    });
    
    // Apply maxFiles limit if specified
    if (this.options.maxFiles && this.options.maxFiles > 0) {
      return filteredFiles.slice(0, this.options.maxFiles);
    }
    
    return filteredFiles;
  }

  /**
   * Parse files in parallel using worker threads
   */
  private async parseFilesInParallel(
    files: string[],
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<Array<ParseResult & { filePath: string }>> {
    const results: Array<ParseResult & { filePath: string }> = [];
    const chunks = this.chunkArray(files, Math.ceil(files.length / this.options.parallelism));
    
    // Process chunks in parallel
    const promises = chunks.map(chunk => this.parseFileChunk(chunk, projectId, languageMap));
    const chunkResults = await Promise.all(promises);
    
    // Flatten results
    for (const chunkResult of chunkResults) {
      results.push(...chunkResult);
    }
    
    return results;
  }

  /**
   * Parse a chunk of files
   */
  private async parseFileChunk(
    files: string[],
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<Array<ParseResult & { filePath: string }>> {
    const results: Array<ParseResult & { filePath: string }> = [];
    
    for (const file of files) {
      try {
        const result = await this.parseFile(file, projectId, languageMap);
        results.push({ ...result, filePath: file });
        
        this.progress.processedFiles++;
        this.updateProgress('parsing', file);
        
      } catch (error) {
        this.errors.push(`Failed to parse ${file}: ${error}`);
        this.progress.errors++;
      }
    }
    
    return results;
  }

  /**
   * Parse a single file
   */
  private async parseFile(
    filePath: string,
    projectId: number,
    languageMap: Map<string, number>
  ): Promise<ParseResult> {
    // Determine language from extension
    const ext = path.extname(filePath);
    const language = this.getLanguageForExtension(ext);
    
    if (!language) {
      throw new Error(`No parser for extension: ${ext}`);
    }
    
    const languageId = languageMap.get(language);
    if (!languageId) {
      throw new Error(`Language not initialized: ${language}`);
    }
    
    // Get parser class
    const parserInfo = this.parsers.get(language);
    if (!parserInfo) {
      throw new Error(`No parser registered for language: ${language}`);
    }
    
    // Create parser instance
    const parseOptions: ParseOptions = {
      projectId,
      languageId,
      debugMode: this.options.debugMode,
      enablePatternDetection: this.options.enablePatternDetection,
      enableSemanticAnalysis: this.options.enableSemanticAnalysis
    };
    
    
    const parser = new parserInfo.parser(this.rawDb, parseOptions);
    await parser.initialize();
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Parse file
    return await parser.parseFile(filePath, content);
  }

  /**
   * Perform semantic analysis across all files
   */
  private async performSemanticAnalysis(projectId: number): Promise<void> {
    // Resolve cross-file references
    // TODO: Implement cross-file reference resolution
    // await this.resolveCrossFileReferences(projectId);
    
    // Detect architectural patterns
    await this.detectArchitecturalPatterns(projectId);
    
    // Calculate complexity metrics
    await this.calculateComplexityMetrics(projectId);
  }

  /**
   * Resolve cross-file symbol references
   */
  private async resolveCrossFileReferences(projectId: number): Promise<void> {
    // TODO: Implement proper cross-file reference resolution
    // This requires more sophisticated symbol resolution logic
    return;
  }

  /**
   * Detect architectural patterns across the codebase
   */
  private async detectArchitecturalPatterns(projectId: number): Promise<void> {
    // TODO: Implement cross-file pattern detection
    // Examples: MVC, Factory clusters, Pipeline stages
    this.debug('Architectural pattern detection not yet implemented');
  }

  /**
   * Calculate complexity metrics
   */
  private async calculateComplexityMetrics(projectId: number): Promise<void> {
    // TODO: Calculate module-level complexity
    // Examples: Coupling, cohesion, cyclomatic complexity aggregates
    this.debug('Complexity metrics calculation not yet implemented');
  }

  /**
   * Calculate index statistics
   */
  private async calculateIndexStats(projectId: number): Promise<{
    symbols: number;
    relationships: number;
    patterns: number;
    avgConfidence: number;
  }> {
    const symbolCount = await this.db.select({ count: sql<number>`count(*)` })
      .from(universalSymbols)
      .where(eq(universalSymbols.projectId, projectId));
    
    const relationshipCount = await this.db.select({ count: sql<number>`count(*)` })
      .from(universalRelationships)
      .where(eq(universalRelationships.projectId, projectId));
    
    const patternCount = await this.db.select({ count: sql<number>`count(*)` })
      .from(detectedPatterns)
      .where(eq(detectedPatterns.projectId, projectId));
    
    const avgConfidence = await this.db.select({ avg: sql<number>`avg(confidence)` })
      .from(universalSymbols)
      .where(eq(universalSymbols.projectId, projectId));
    
    return {
      symbols: symbolCount[0]?.count || 0,
      relationships: relationshipCount[0]?.count || 0,
      patterns: patternCount[0]?.count || 0,
      avgConfidence: avgConfidence[0]?.avg || 0
    };
  }

  /**
   * Helper methods
   */
  
  private getTargetExtensions(): string[] {
    const extensions: string[] = [];
    
    for (const [_, parser] of this.parsers) {
      if (this.options.languages.includes(parser.language)) {
        extensions.push(...parser.extensions);
      }
    }
    
    return extensions;
  }

  private getLanguageForExtension(ext: string): string | null {
    for (const [lang, parser] of this.parsers) {
      if (parser.extensions.includes(ext)) {
        return lang;
      }
    }
    return null;
  }

  private getLanguageDisplayName(lang: string): string {
    const displayNames: Record<string, string> = {
      cpp: 'C++',
      python: 'Python',
      typescript: 'TypeScript',
      javascript: 'JavaScript'
    };
    
    return displayNames[lang] || lang;
  }

  private getParserClass(lang: string): string {
    const parserClasses: Record<string, string> = {
      cpp: 'CppTreeSitterParser',
      python: 'PythonTreeSitterParser',
      typescript: 'TypeScriptTreeSitterParser',
      javascript: 'JavaScriptTreeSitterParser'
    };
    
    return parserClasses[lang] || 'UnknownParser';
  }

  private getLanguageExtensions(lang: string): string[] {
    const extensionMap: Record<string, string[]> = {
      cpp: ['.cpp', '.hpp', '.ixx', '.cxx', '.hxx'],
      python: ['.py', '.pyx', '.pyi'],
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx']
    };
    
    return extensionMap[lang] || [];
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    
    return chunks;
  }

  private updateProgress(phase: IndexProgress['phase'], currentFile?: string): void {
    this.progress.phase = phase;
    this.progress.currentFile = currentFile;
    
    // Calculate estimated time remaining
    if (this.progress.processedFiles > 0 && this.progress.totalFiles > 0) {
      const elapsed = Date.now() - this.progress.startTime;
      const perFile = elapsed / this.progress.processedFiles;
      const remaining = this.progress.totalFiles - this.progress.processedFiles;
      this.progress.estimatedTimeRemaining = perFile * remaining;
    }
    
    // Emit progress event
    this.emit('progress', this.progress);
    
    // Call callback if provided
    if (this.options.progressCallback) {
      this.options.progressCallback(this.progress);
    }
  }

  /**
   * Resolve and store relationships after all symbols are indexed
   */
  private async resolveAndStoreRelationships(
    projectId: number,
    parseResults: Array<ParseResult & { filePath: string }>
  ): Promise<void> {
    this.debug('Resolving and storing relationships...');
    
    // Collect all relationships from parse results
    const allRelationships: Array<{
      relationship: RelationshipInfo;
      filePath: string;
    }> = [];
    
    for (const result of parseResults) {
      if (result.relationships && result.relationships.length > 0) {
        this.debug(`Found ${result.relationships.length} relationships in ${result.filePath}`);
        for (const rel of result.relationships) {
          allRelationships.push({
            relationship: rel,
            filePath: result.filePath || ''
          });
        }
      }
    }
    
    if (allRelationships.length === 0) {
      this.debug('No relationships to store');
      return;
    }
    
    this.debug(`Found ${allRelationships.length} relationships to resolve`);
    
    // Now that all symbols are stored, resolve relationships
    const { universalSymbols, universalRelationships } = await import('../database/schema/universal.js');
    
    // Get all unique symbol names involved in relationships
    const symbolNames = new Set<string>();
    allRelationships.forEach(({ relationship }) => {
      symbolNames.add(relationship.fromName);
      symbolNames.add(relationship.toName);
    });
    
    // Fetch all relevant symbols from database
    const symbolMap = new Map<string, number>();
    const symbolsInDb = await this.db.select({
      id: universalSymbols.id,
      name: universalSymbols.name,
      qualifiedName: universalSymbols.qualifiedName
    })
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.projectId, projectId),
        or(
          ...Array.from(symbolNames).map(name => 
            or(
              eq(universalSymbols.name, name),
              eq(universalSymbols.qualifiedName, name)
            )
          )
        )
      ));
    
    // Build map of symbol names to IDs
    symbolsInDb.forEach(sym => {
      symbolMap.set(sym.name, sym.id);
      symbolMap.set(sym.qualifiedName, sym.id);
    });
    
    // Convert relationships to database format
    const relationshipRecords = allRelationships
      .filter(({ relationship }) => {
        const fromId = symbolMap.get(relationship.fromName);
        const toId = symbolMap.get(relationship.toName);
        if (!fromId || !toId) {
          this.debug(`Skipping relationship ${relationship.fromName} -> ${relationship.toName}: symbol not found`);
          return false;
        }
        return true;
      })
      .map(({ relationship }) => ({
        projectId,
        fromSymbolId: symbolMap.get(relationship.fromName)!,
        toSymbolId: symbolMap.get(relationship.toName)!,
        type: relationship.relationshipType,
        confidence: relationship.confidence,
        contextLine: relationship.lineNumber || null,
        contextSnippet: relationship.sourceContext || null,
        metadata: JSON.stringify({
          usagePattern: relationship.usagePattern,
          sourceText: relationship.sourceText,
          crossLanguage: relationship.crossLanguage,
          bridgeType: relationship.bridgeType
        })
      }));
    
    if (relationshipRecords.length > 0) {
      try {
        await this.db.insert(universalRelationships).values(relationshipRecords);
        this.debug(`Successfully stored ${relationshipRecords.length} relationships`);
      } catch (error) {
        this.debug(`Failed to store relationships: ${error}`);
        this.errors.push(`Failed to store relationships: ${error}`);
      }
    }
    
    this.debug(`Resolved ${relationshipRecords.length} of ${allRelationships.length} relationships`);
  }

  private createResult(
    projectId: number,
    startTime: number,
    success: boolean,
    error?: string
  ): IndexResult {
    if (error) {
      this.errors.push(error);
    }
    
    return {
      success,
      projectId,
      filesIndexed: 0,
      symbolsFound: 0,
      relationshipsFound: 0,
      patternsFound: 0,
      errors: this.errors,
      duration: Date.now() - startTime,
      confidence: 0
    };
  }

  private debug(message: string, ...args: any[]): void {
    if (this.options.debugMode) {
      console.log(`[UniversalIndexer] ${message}`, ...args);
    }
  }
}