#!/usr/bin/env tsx

import { PatternAwareIndexer } from '../dist/indexing/pattern-aware-indexer.js';
import { UnifiedSchemaManager } from '../dist/database/unified-schema-manager.js';
import { Cpp23ModuleParsingTest } from './unit/Cpp23ModuleParsingTest';
import { PatternAwareIndexingTest } from './unit/PatternAwareIndexingTest';
import { ArchitecturalAnalysisTest } from './unit/ArchitecturalAnalysisTest';
import { EnhancedIntelligenceTest } from './unit/EnhancedIntelligenceTest';
import { ParserFallbackTest } from './unit/ParserFallbackTest';
import { RelationshipExtractionTest } from './unit/RelationshipExtractionTest';
import { CrossFileRelationshipTest } from './unit/CrossFileRelationshipTest';
import { ToolsIntegrationTest } from './unit/ToolsIntegrationTest';
import { SimpleToolTest } from './unit/SimpleToolTest';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import Database from 'better-sqlite3';

export class TestRunner extends EventEmitter {
  private projectPath = '/home/warxh/planet_procgen';
  private dbPath = 'module-sentinel.db'; // Real production database
  private forceRebuild: boolean;
  
  constructor(options?: { forceRebuild?: boolean }) {
    super();
    this.forceRebuild = options?.forceRebuild ?? false;
  }

  async run(): Promise<void> {
    console.log('🚀 Module Sentinel Comprehensive Test Suite\n');
    
    try {
      // First validate database structure
      console.log('🔍 Validating database structure...');
      await this.validateDatabaseStructure();
      
      // Check if index already exists
      const indexExists = await this.checkIndexExists(this.dbPath);
      
      if (this.forceRebuild || !indexExists) {
        console.log('📊 Building comprehensive index from real codebase...');
        if (this.forceRebuild) {
          console.log('  ⚠️  Force rebuild requested - clearing existing index');
          await fs.unlink(this.dbPath).catch(() => {}); // Delete if exists
        }
        await this.buildComprehensiveIndex();
      } else {
        console.log('Using existing production index (use --rebuild to force rebuild)');
        const stats = await this.getIndexStats(this.dbPath);
        console.log(`  📊 Index contains ${stats.symbolCount} symbols from ${stats.fileCount} files`);
      }
      
      // Run all analysis suites using the real production database
      
      const tests = [
        new Cpp23ModuleParsingTest(),
        new PatternAwareIndexingTest(this.dbPath),
        // new ArchitecturalAnalysisTest(this.dbPath), // Disabled to focus on relationship testing
        // new EnhancedIntelligenceTest(this.dbPath), // Disabled to focus on relationship testing  
        new ParserFallbackTest(),
        new RelationshipExtractionTest(this.dbPath),
        new CrossFileRelationshipTest(this.dbPath),
        new SimpleToolTest()
      ];
      
      console.log('\n🔧 Running test suites...\n');
      
      for (const test of tests) {
        console.log('='.repeat(60));
        await test.execute();
      }
      
      // Final analysis with parser hierarchy validation
      console.log('\n' + '='.repeat(60));
      console.log('📊 PARSER HIERARCHY & ANALYTICS INTEGRATION STATUS');
      await this.runFinalAnalysis();
      
    } finally {
      // Clean up any hanging resources
      console.log('\nAnalysis complete');
      
      // Force cleanup of any hanging timers or workers
      if (global.gc) {
        global.gc();
      }
    }
    
    console.log('\nAll tests completed!');
    
    // Force exit after a brief delay to allow cleanup
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }

  private async validateDatabaseStructure(): Promise<void> {
    // This validation will be performed by each component as needed
    // The UnifiedSchemaManager now tracks initialization per database file
    console.log('  Database structure will be validated by components');
  }

  private async checkIndexExists(dbPath: string): Promise<boolean> {
    try {
      await fs.access(dbPath);
      // Check if database has content
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });
      try {
        const result = db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any;
        db.close();
        return result.count > 0;
      } catch {
        db.close();
        return false;
      }
    } catch {
      return false;
    }
  }
  
  private async getIndexStats(dbPath: string): Promise<{ symbolCount: number; fileCount: number }> {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const symbolCount = (db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count;
    const fileCount = (db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM enhanced_symbols').get() as any).count;
    db.close();
    return { symbolCount, fileCount };
  }
  
  private async buildComprehensiveIndex(): Promise<void> {
    // Force database validation before indexing
    await this.validateDatabaseStructure();
    
    const indexer = new PatternAwareIndexer(this.projectPath, this.dbPath);
    
    // Index all files comprehensively
    console.log('📊 Finding all C++ files...');
    const { glob } = await import('glob');
    const patterns = [
      'src/**/*.cpp', 'src/**/*.cxx', 'src/**/*.cc',
      'include/**/*.ixx', 'include/**/*.hpp', 'include/**/*.h'
    ];
    
    const allFiles: string[] = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: this.projectPath });
      allFiles.push(...files);
    }
    
    const uniqueFiles = [...new Set(allFiles)].sort();
    const fullPaths = uniqueFiles.map(f => path.join(this.projectPath, f));
    
    console.log(`📁 Found ${uniqueFiles.length} C++ files`);
    
    // Index in batches for better performance and error handling
    const batchSize = 50;
    let totalIndexed = 0;
    let totalSymbols = 0;
    let emptyFiles = 0;
    
    for (let i = 0; i < fullPaths.length; i += batchSize) {
      const batch = fullPaths.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(fullPaths.length / batchSize);
      
      console.log(`\n📦 Batch ${batchNum}/${totalBatches}: ${batch.length} files`);
      
      try {
        // Filter existing files
        const existingPaths = [];
        for (const fullPath of batch) {
          try {
            await fs.access(fullPath);
            existingPaths.push(fullPath);
          } catch {
            // File doesn't exist, skip
          }
        }
        
        if (existingPaths.length > 0) {
          const startTime = Date.now();
          await indexer.indexFiles(existingPaths);
          const elapsed = Date.now() - startTime;
          
          // Count symbols in this batch
          const beforeCount = totalSymbols;
          totalSymbols = (indexer['db'].prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count;
          const batchSymbols = totalSymbols - beforeCount;
          
          totalIndexed += existingPaths.length;
          
          if (batchSymbols === 0) {
            emptyFiles += existingPaths.length;
          }
          
          console.log(`  ${existingPaths.length} files, ${batchSymbols} symbols (${elapsed}ms)`);
        }
      } catch (error) {
        console.log(`   Batch failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Get parser statistics
    const parserStats = indexer.getParserStats();
    
    console.log(`\n✨ Index complete:`);
    console.log(`  Files: ${totalIndexed}/${uniqueFiles.length}`);
    console.log(`  Symbols: ${totalSymbols}`);
    console.log(`  Empty: ${emptyFiles}`);
    console.log(`  Success rate: ${((totalIndexed - emptyFiles) / totalIndexed * 100).toFixed(1)}%`);
    console.log(`\n📊 Parser Usage:`);
    console.log(`  Clang: ${parserStats.clang} files (${(parserStats.clang/totalIndexed*100).toFixed(1)}%)`);
    console.log(`  Tree-sitter: ${parserStats.treeSitter} files (${(parserStats.treeSitter/totalIndexed*100).toFixed(1)}%)`);
    console.log(`  Streaming: ${parserStats.streaming} files (${(parserStats.streaming/totalIndexed*100).toFixed(1)}%)`);
    console.log(`  Failed: ${parserStats.failed} files`);
    
    // Use the indexer's database instance (it has the tables)
    const parserEffectiveness = indexer['db'].prepare(`
      SELECT 
        parser_used,
        COUNT(*) as symbol_count,
        AVG(parser_confidence) as avg_confidence,
        COUNT(DISTINCT file_path) as file_count
      FROM enhanced_symbols 
      GROUP BY parser_used
      ORDER BY avg_confidence DESC
    `).all() as any[];
    
    console.log(`\n🎯 Parser Effectiveness:`);
    parserEffectiveness.forEach(p => {
      console.log(`  ${p.parser_used}: ${p.symbol_count} symbols from ${p.file_count} files (avg confidence: ${(p.avg_confidence * 100).toFixed(1)}%)`);
    });

    // Show data quality and conflicts
    const qualityReport = indexer.getDataQualityReport();
    console.log(`\n📊 Data Quality by Parser:`);
    qualityReport.forEach((q: any) => {
      console.log(`  ${q.parser_used}: ${q.with_signatures}/${q.symbol_count} with signatures, ${q.with_mangled_names} with mangled names`);
    });

    const conflicts = indexer.getSymbolConflicts();
    if (conflicts.length > 0) {
      console.log(`\n⚔️  Symbol Conflicts Detected: ${conflicts.length}`);
      conflicts.slice(0, 3).forEach((c: any) => {
        console.log(`  ${c.name} in ${c.file_path}: ${c.parsers} (confidence range: ${(c.worst_confidence * 100).toFixed(0)}-${(c.best_confidence * 100).toFixed(0)}%)`);
      });
    } else {
      console.log(`\nNo symbol conflicts detected - all parsers agree`);
    }
    
    indexer.close();
  }

  private async runFinalAnalysis(): Promise<void> {
    console.log('\n📋 FINAL GAP ANALYSIS\n');
    
    // Create temporary indexer to access the production database
    const tempIndexer = new PatternAwareIndexer(this.projectPath, this.dbPath);
    const db = tempIndexer['db'];
    
    // Overall statistics
    const stats = {
      totalSymbols: (db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols').get() as any).count,
      symbolsWithTags: (db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols WHERE semantic_tags != '[]'").get() as any).count,
      antiPatterns: (db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols WHERE semantic_tags LIKE '%anti_pattern%'").get() as any).count,
      solidViolations: (db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols WHERE semantic_tags LIKE '%solid_violation%'").get() as any).count,
      factoryViolations: (db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols WHERE semantic_tags LIKE '%factory_pattern_violation%'").get() as any).count
    };
    
    const coverage = (stats.symbolsWithTags / stats.totalSymbols) * 100;
    
    console.log('📊 Overall Statistics:');
    console.log(`  - Total symbols indexed: ${stats.totalSymbols}`);
    console.log(`  - Semantic tag coverage: ${coverage.toFixed(1)}%`);
    console.log(`  - Anti-patterns detected: ${stats.antiPatterns}`);
    console.log(`  - SOLID violations: ${stats.solidViolations}`);
    console.log(`  - Factory pattern violations: ${stats.factoryViolations}`);
    
    // Critical gaps
    console.log('\n🔴 CRITICAL GAPS IDENTIFIED:');
    
    if (coverage < 70) {
      console.log(`  1. Low semantic coverage (${coverage.toFixed(1)}%) - should be >70%`);
    }
    
    if (stats.antiPatterns < 5) {
      console.log(`  2. Anti-pattern detection too low (${stats.antiPatterns}) - indicates missing detection`);
    }
    
    // File type coverage
    const fileTypes = db.prepare(`
      SELECT 
        CASE 
          WHEN file_path LIKE '%.ixx' THEN 'C++23 Modules'
          WHEN file_path LIKE '%.cpp' THEN 'Implementation'
          WHEN file_path LIKE '%.h' OR file_path LIKE '%.hpp' THEN 'Headers'
          ELSE 'Other'
        END as type,
        COUNT(DISTINCT file_path) as count
      FROM enhanced_symbols
      GROUP BY type
    `).all() as any[];
    
    console.log('\n📁 File Type Coverage:');
    fileTypes.forEach(ft => {
      console.log(`  - ${ft.type}: ${ft.count} files`);
    });
    
    const hasModules = fileTypes.some(ft => ft.type === 'C++23 Modules' && ft.count > 0);
    if (!hasModules) {
      console.log('   WARNING: No C++23 modules successfully indexed!');
    }
    
    // Parser hierarchy effectiveness
    const parserQuality = db.prepare(`
      SELECT 
        parser_used,
        AVG(parser_confidence) as avg_confidence,
        COUNT(CASE WHEN semantic_tags != '[]' THEN 1 END) as tagged_symbols,
        COUNT(*) as total_symbols
      FROM enhanced_symbols 
      GROUP BY parser_used
    `).all() as any[];
    
    console.log('\n🔧 Parser Quality vs Analytics:');
    parserQuality.forEach(p => {
      const tagRate = (p.tagged_symbols / p.total_symbols * 100).toFixed(1);
      console.log(`  ${p.parser_used}: ${(p.avg_confidence * 100).toFixed(1)}% confidence, ${tagRate}% semantic coverage`);
    });

    // Analytics integration status
    console.log('\n🧠 Analytics Integration Status:');
    
    try {
      const duplicateService = (db.prepare('SELECT COUNT(*) as count FROM code_clones').get() as any).count;
      console.log(`  Duplicate Detection: ${duplicateService} clones detected`);
    } catch {
      console.log(`  ⚠️  Duplicate Detection: Not properly integrated`);
    }
    
    try {
      const antipatterns = (db.prepare('SELECT COUNT(*) as count FROM antipattern_detections').get() as any).count;
      console.log(`  Anti-pattern Detection: ${antipatterns} patterns detected`);
    } catch {
      console.log(`  ⚠️  Anti-pattern Detection: Not properly integrated`);
    }

    // Recommendations
    console.log('\n🎯 INTEGRATION HEALTH:');
    
    const highConfidenceSymbols = (db.prepare('SELECT COUNT(*) as count FROM enhanced_symbols WHERE parser_confidence > 0.8').get() as any).count;
    const totalSymbols = stats.totalSymbols;
    const highConfidenceRate = (highConfidenceSymbols / totalSymbols * 100).toFixed(1);
    
    if (parseFloat(highConfidenceRate) > 60) {
      console.log(`  Parser hierarchy working: ${highConfidenceRate}% high-confidence symbols`);
    } else {
      console.log(`  ⚠️  Parser hierarchy needs improvement: only ${highConfidenceRate}% high-confidence symbols`);
    }
    
    if (coverage > 70) {
      console.log(`  Analytics integration healthy: ${coverage.toFixed(1)}% semantic coverage`);
    } else {
      console.log(`  ⚠️  Analytics need enhancement: ${coverage.toFixed(1)}% semantic coverage`);
    }
    
    tempIndexer.close();
  }
}

// Run if executed directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().catch(console.error);
}