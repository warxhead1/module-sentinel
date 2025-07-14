import Database from 'better-sqlite3';
import * as path from 'path';
import { UnifiedSchemaManager } from '../database/unified-schema-manager.js';

/**
 * Database Query Tool - Primary interface for querying indexed data
 * 
 * This tool demonstrates the proper approach:
 * 1. Query indexed data from the unified database
 * 2. Use the best available parser results (Clang > Tree-sitter > Streaming)
 * 3. Only trigger re-parsing when explicitly needed
 */
export class DatabaseQueryTool {
  private db?: Database.Database;
  private schemaManager: UnifiedSchemaManager;

  constructor(private projectPath: string) {
    this.schemaManager = UnifiedSchemaManager.getInstance();
  }

  async initialize(): Promise<void> {
    const dbPath = path.join(this.projectPath, '.module-sentinel', 'preservation.db');
    this.db = new Database(dbPath);
    this.schemaManager.initializeDatabase(this.db);
  }

  /**
   * Find symbol in indexed database - NO re-parsing
   */
  async findSymbol(symbolName: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Query from unified database using best available parser data
    const results = this.db.prepare(`
      SELECT 
        es.*,
        if.best_parser,
        if.best_confidence
      FROM enhanced_symbols es
      JOIN indexed_files if ON es.file_path = if.path
      WHERE es.name LIKE ?
      ORDER BY es.parser_confidence DESC, es.parse_timestamp DESC
    `).all(`%${symbolName}%`);

    return results;
  }

  /**
   * Get all symbols from a file - uses indexed data only
   */
  async getFileSymbols(filePath: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Check what parsers have successfully processed this file
    const fileInfo = this.db.prepare(`
      SELECT * FROM indexed_files WHERE path = ?
    `).get(filePath) as any;

    if (!fileInfo) {
      return []; // File not indexed yet
    }

    // Get symbols from the best parser that succeeded
    const symbols = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE file_path = ? 
      ORDER BY parser_confidence DESC
    `).all(filePath);

    return {
      fileInfo,
      symbols,
      metadata: {
        bestParser: fileInfo.best_parser,
        confidence: fileInfo.best_confidence,
        clangAvailable: fileInfo.clang_success === 1,
        treeAvailable: fileInfo.treesitter_success === 1,
        streamingAvailable: fileInfo.streaming_success === 1
      }
    } as any;
  }

  /**
   * Find implementations of a class/function - database query only
   */
  async findImplementations(symbolName: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    // First find the symbol declaration
    const declarations = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE name = ? AND is_definition = 0
      ORDER BY parser_confidence DESC
    `).all(symbolName);

    // Then find implementations
    const implementations = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE name = ? AND is_definition = 1
      ORDER BY parser_confidence DESC
    `).all(symbolName);

    // Also check relationships
    const relatedSymbols = this.db.prepare(`
      SELECT 
        es.*,
        sr.relationship_type
      FROM symbol_relationships sr
      JOIN enhanced_symbols es ON es.id = sr.to_symbol_id
      WHERE sr.from_symbol_id IN (
        SELECT id FROM enhanced_symbols WHERE name = ?
      )
      AND sr.relationship_type IN ('implements', 'overrides', 'defines')
    `).all(symbolName);

    return {
      declarations,
      implementations,
      relatedSymbols
    } as any;
  }

  /**
   * Get code patterns from indexed data
   */
  async getPatterns(patternType?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT 
        dp.*,
        es.name as symbol_name,
        es.file_path
      FROM detected_patterns dp
      JOIN enhanced_symbols es ON es.id = dp.symbol_id
    `;

    if (patternType) {
      query += ` WHERE dp.pattern_type = ?`;
      return this.db.prepare(query).all(patternType);
    }

    return this.db.prepare(query).all();
  }

  /**
   * Get anti-patterns from indexed data
   */
  async getAntipatterns(filePath?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    if (filePath) {
      return this.db.prepare(`
        SELECT * FROM antipatterns 
        WHERE file_path = ?
        ORDER BY severity DESC, line_start ASC
      `).all(filePath);
    }

    return this.db.prepare(`
      SELECT 
        pattern_name,
        pattern_category,
        severity,
        COUNT(*) as occurrence_count,
        GROUP_CONCAT(DISTINCT file_path) as affected_files
      FROM antipatterns
      GROUP BY pattern_name, pattern_category, severity
      ORDER BY occurrence_count DESC
    `).all();
  }

  /**
   * Get duplicate code from indexed data
   */
  async getDuplicates(filePath?: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    if (filePath) {
      return this.db.prepare(`
        SELECT * FROM code_duplicates 
        WHERE file1_path = ? OR file2_path = ?
        ORDER BY similarity_score DESC
      `).all(filePath, filePath);
    }

    return this.db.prepare(`
      SELECT * FROM code_duplicates 
      ORDER BY similarity_score DESC, token_count DESC
      LIMIT 100
    `).all();
  }

  /**
   * Search by semantic tags
   */
  async searchBySemanticTags(tags: string[]): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const tagConditions = tags.map(() => `semantic_tags LIKE ?`).join(' OR ');
    const tagParams = tags.map(tag => `%"${tag}"%`);

    return this.db.prepare(`
      SELECT 
        es.*,
        if.best_parser,
        if.best_confidence
      FROM enhanced_symbols es
      JOIN indexed_files if ON es.file_path = if.path
      WHERE ${tagConditions}
      ORDER BY es.parser_confidence DESC
    `).all(...tagParams);
  }

  /**
   * Get parsing statistics for a file
   */
  async getFileParsingStats(filePath: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const fileInfo = this.db.prepare(`
      SELECT * FROM indexed_files WHERE path = ?
    `).get(filePath);

    const symbolCounts = this.db.prepare(`
      SELECT 
        parser_used,
        COUNT(*) as symbol_count,
        AVG(parser_confidence) as avg_confidence,
        COUNT(CASE WHEN json_array_length(semantic_tags) > 0 THEN 1 END) as tagged_count
      FROM enhanced_symbols
      WHERE file_path = ?
      GROUP BY parser_used
    `).all(filePath);

    return {
      fileInfo,
      symbolCounts,
      recommendation: this.generateParsingRecommendation(fileInfo, symbolCounts)
    };
  }

  /**
   * Generate recommendation based on parsing results
   */
  private generateParsingRecommendation(fileInfo: any, symbolCounts: any[]): string {
    if (!fileInfo) {
      return 'File not indexed. Run indexing to analyze this file.';
    }

    if (fileInfo.clang_success === 1) {
      return 'File successfully parsed with Clang. High confidence results available.';
    }

    if (fileInfo.treesitter_success === 1) {
      return 'File parsed with Tree-sitter. Good results available. Install Clang for higher accuracy.';
    }

    if (fileInfo.streaming_success === 1) {
      return 'Large file parsed with streaming parser. Limited semantic information available.';
    }

    return 'File parsing failed. Check for syntax errors or missing dependencies.';
  }

  /**
   * Get cross-file relationships
   */
  async getRelationships(symbolName: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const outgoing = this.db.prepare(`
      SELECT 
        sr.*,
        es.name as target_name,
        es.file_path as target_file
      FROM symbol_relationships sr
      JOIN enhanced_symbols es ON es.id = sr.to_symbol_id
      WHERE sr.from_symbol_id IN (
        SELECT id FROM enhanced_symbols WHERE name = ?
      )
    `).all(symbolName);

    const incoming = this.db.prepare(`
      SELECT 
        sr.*,
        es.name as source_name,
        es.file_path as source_file
      FROM symbol_relationships sr
      JOIN enhanced_symbols es ON es.id = sr.from_symbol_id
      WHERE sr.to_symbol_id IN (
        SELECT id FROM enhanced_symbols WHERE name = ?
      )
    `).all(symbolName);

    return { outgoing, incoming };
  }

  /**
   * Only parse on-demand when explicitly requested
   */
  async requestEnhancedAnalysis(filePath: string, forceParser?: string): Promise<any> {
    // This would trigger actual parsing, but should be used sparingly
    // Most queries should use the indexed data above
    return {
      message: 'Enhanced analysis would trigger re-parsing. Use indexed data when possible.',
      indexedDataAvailable: await this.getFileSymbols(filePath)
    };
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}

// Example usage showing the proper flow
export async function demonstrateProperFlow(): Promise<void> {
  const tool = new DatabaseQueryTool('/home/warxh/planet_procgen');
  await tool.initialize();

  console.log('📚 Demonstrating Proper Database-First Approach\n');

  // 1. Query indexed symbols
  console.log('1️⃣ Finding symbols from indexed data:');
  const symbols = await tool.findSymbol('Pipeline');
  console.log(`   Found ${symbols.length} symbols matching "Pipeline"`);

  // 2. Get file information without re-parsing
  console.log('\n2️⃣ Getting file info from database:');
  const fileInfo = await tool.getFileSymbols('example.cpp');
  console.log(`   File parsed by: ${(fileInfo as any).metadata?.bestParser || 'not indexed'}`);

  // 3. Find patterns from indexed data
  console.log('\n3️⃣ Finding patterns from indexed data:');
  const patterns = await tool.getPatterns('Factory');
  console.log(`   Found ${patterns.length} factory patterns`);

  // 4. Get anti-patterns without re-analysis
  console.log('\n4️⃣ Getting anti-patterns from database:');
  const antipatterns = await tool.getAntipatterns();
  console.log(`   Found ${antipatterns.length} anti-pattern types`);

  console.log('\n✅ All queries used indexed data - no re-parsing needed!');

  tool.close();
}