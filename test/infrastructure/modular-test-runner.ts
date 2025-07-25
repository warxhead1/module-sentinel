/**
 * Modular Test Runner
 * 
 * Highly flexible test runner that can work with any database backend
 * and parser combination. Designed for easy migration between systems.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
// import * as fs from 'fs/promises';
import { 
  DatabaseAdapter, 
  DatabaseAdapterFactory, 
  SymbolData, 
  RelationshipData, 
  PatternData 
} from './database-adapter.js';

export interface ParserInterface {
  name: string;
  parseFile(filePath: string): Promise<ParseResult>;
  initialize?(): Promise<void>;
  cleanup?(): Promise<void>;
}

export interface ParseResult {
  symbols: SymbolData[];
  relationships: RelationshipData[];
  patterns: PatternData[];
  confidence: number;
  parseTime: number;
  success: boolean;
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface TestConfiguration {
  databaseType: 'legacy' | 'multiproject';
  databasePath: string;
  parsers: ParserInterface[];
  testFiles: string[];
  outputFormat: 'console' | 'json' | 'both';
  includeDetailedAnalysis: boolean;
  enableBenchmarking: boolean;
}

export interface ComparisonMetrics {
  file: string;
  results: Record<string, ParseResult>;
  analysis: {
    bestParser: string;
    worstParser: string;
    symbolDetectionWinner: string;
    performanceWinner: string;
    confidenceWinner: string;
    issues: string[];
    recommendations: string[];
  };
}

export class ModularTestRunner {
  private config: TestConfiguration;
  private dbAdapter: DatabaseAdapter;
  private db: Database;
  private results: ComparisonMetrics[] = [];
  
  constructor(config: TestConfiguration) {
    this.config = config;
  }
  
  async initialize(): Promise<void> {
    console.log(`🚀 Initializing Modular Test Runner`);
    console.log(`   Database: ${this.config.databaseType} at ${this.config.databasePath}`);
    console.log(`   Parsers: ${this.config.parsers.map(p => p.name).join(', ')}`);
    console.log(`   Test files: ${this.config.testFiles.length}`);
    
    // Initialize database
    this.db = new Database(this.config.databasePath);
    this.dbAdapter = DatabaseAdapterFactory.create(this.config.databaseType, this.db);
    await this.dbAdapter.initializeSchema();
    
    // Initialize parsers
    for (const parser of this.config.parsers) {
      if (parser.initialize) {
        await parser.initialize();
      }
    }
    
    console.log(`✅ Initialization complete\n`);
  }
  
  async runComparison(): Promise<ComparisonMetrics[]> {
    console.log(`🔬 Starting Parser Comparison Analysis`);
    console.log('='.repeat(60));
    
    for (const testFile of this.config.testFiles) {
      console.log(`\n📄 Testing: ${path.basename(testFile)}`);
      console.log('-'.repeat(40));
      
      const fileResults: Record<string, ParseResult> = {};
      
      // Test each parser on this file
      for (const parser of this.config.parsers) {
        console.log(`  🔧 ${parser.name}...`);
        
        try {
          const startTime = Date.now();
          const result = await parser.parseFile(testFile);
          result.parseTime = Date.now() - startTime;
          
          // Store results in database for analysis
          await this.storeParseResults(testFile, parser.name, result);
          
          fileResults[parser.name] = result;
          
          console.log(`     ✅ ${result.symbols.length} symbols, ${result.parseTime}ms, ${(result.confidence * 100).toFixed(1)}% confidence`);
          
        } catch (error) {
          console.log(`     ❌ Failed: ${error.message}`);
          fileResults[parser.name] = {
            symbols: [],
            relationships: [],
            patterns: [],
            confidence: 0,
            parseTime: 0,
            success: false,
            errors: [error.message]
          };
        }
      }
      
      // Analyze results for this file
      const analysis = this.analyzeFileResults(fileResults);
      const metrics: ComparisonMetrics = {
        file: path.basename(testFile),
        results: fileResults,
        analysis
      };
      
      this.results.push(metrics);
      
      // Print immediate analysis
      this.printFileAnalysis(metrics);
    }
    
    // Print overall summary
    this.printOverallSummary();
    
    return this.results;
  }
  
  private async storeParseResults(filePath: string, parserName: string, result: ParseResult): Promise<void> {
    // Clear previous results for this file/parser
    await this.dbAdapter.deleteSymbolsByFile(filePath);
    await this.dbAdapter.deleteRelationshipsByFile(filePath);
    await this.dbAdapter.deletePatternsByFile(filePath);
    
    // Store symbols
    for (const symbol of result.symbols) {
      symbol.file_path = filePath;
      symbol.parser_used = parserName;
      await this.dbAdapter.insertSymbol(symbol);
    }
    
    // Store relationships
    for (const relationship of result.relationships) {
      relationship.file_path = filePath;
      await this.dbAdapter.insertRelationship(relationship);
    }
    
    // Store patterns
    for (const pattern of result.patterns) {
      pattern.file_path = filePath;
      await this.dbAdapter.insertPattern(pattern);
    }
  }
  
  private analyzeFileResults(results: Record<string, ParseResult>): any {
    const parserNames = Object.keys(results);
    
    // Find best performers in different categories
    let bestSymbolCount = 0;
    let bestPerformance = Infinity;
    let bestConfidence = 0;
    let symbolWinner = '';
    let perfWinner = '';
    let confWinner = '';
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    for (const [name, result] of Object.entries(results)) {
      if (!result.success) {
        issues.push(`${name} failed to parse`);
        continue;
      }
      
      // Symbol detection winner
      if (result.symbols.length > bestSymbolCount) {
        bestSymbolCount = result.symbols.length;
        symbolWinner = name;
      }
      
      // Performance winner
      if (result.parseTime < bestPerformance) {
        bestPerformance = result.parseTime;
        perfWinner = name;
      }
      
      // Confidence winner
      if (result.confidence > bestConfidence) {
        bestConfidence = result.confidence;
        confWinner = name;
      }
      
      // Check for issues
      if (result.symbols.length === 0) {
        issues.push(`${name} found no symbols`);
      }
      
      if (result.confidence < 0.7) {
        issues.push(`${name} has low confidence (${(result.confidence * 100).toFixed(1)}%)`);
      }
      
      if (result.parseTime > 1000) {
        issues.push(`${name} is slow (${result.parseTime}ms)`);
      }
    }
    
    // Generate recommendations
    const successfulParsers = parserNames.filter(name => results[name].success);
    
    if (successfulParsers.length === 0) {
      recommendations.push('All parsers failed - check file format or parser configuration');
    } else if (successfulParsers.length === 1) {
      recommendations.push(`Only ${successfulParsers[0]} works - investigate other parser issues`);
    } else {
      // Multiple working parsers - recommend best overall
      const scores: Record<string, number> = {};
      
      for (const name of successfulParsers) {
        const result = results[name];
        let score = 0;
        
        // Symbol detection (40% weight)
        score += (result.symbols.length / bestSymbolCount) * 40;
        
        // Performance (30% weight) - inverse scoring
        score += (bestPerformance / result.parseTime) * 30;
        
        // Confidence (30% weight)
        score += (result.confidence / bestConfidence) * 30;
        
        scores[name] = score;
      }
      
      const bestOverall = Object.entries(scores).sort(([,a], [,b]) => b - a)[0][0];
      recommendations.push(`Best overall: ${bestOverall}`);
      
      if (symbolWinner !== perfWinner) {
        recommendations.push(`Trade-off: ${symbolWinner} finds more symbols, ${perfWinner} is faster`);
      }
    }
    
    return {
      bestParser: symbolWinner || 'none',
      worstParser: parserNames.find(name => !results[name].success) || 'none',
      symbolDetectionWinner: symbolWinner,
      performanceWinner: perfWinner,
      confidenceWinner: confWinner,
      issues,
      recommendations
    };
  }
  
  private printFileAnalysis(metrics: ComparisonMetrics): void {
    console.log(`\n📊 Analysis for ${metrics.file}:`);
    
    // Performance comparison
    console.log(`   ⏱️  Performance: ${metrics.analysis.performanceWinner} wins`);
    console.log(`   🔍 Symbol Detection: ${metrics.analysis.symbolDetectionWinner} wins`);
    console.log(`   🎯 Confidence: ${metrics.analysis.confidenceWinner} wins`);
    
    // Issues
    if (metrics.analysis.issues.length > 0) {
      console.log(`   ⚠️  Issues:`);
      metrics.analysis.issues.forEach(issue => console.log(`      • ${issue}`));
    }
    
    // Recommendations
    if (metrics.analysis.recommendations.length > 0) {
      console.log(`   💡 Recommendations:`);
      metrics.analysis.recommendations.forEach(rec => console.log(`      • ${rec}`));
    }
  }
  
  private printOverallSummary(): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 OVERALL SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    
    const parserNames = this.config.parsers.map(p => p.name);
    const stats: Record<string, any> = {};
    
    // Initialize stats
    for (const name of parserNames) {
      stats[name] = {
        successCount: 0,
        totalSymbols: 0,
        totalTime: 0,
        totalConfidence: 0,
        wins: { symbols: 0, performance: 0, confidence: 0 }
      };
    }
    
    // Collect stats
    for (const result of this.results) {
      for (const [parserName, parseResult] of Object.entries(result.results)) {
        if (parseResult.success) {
          stats[parserName].successCount++;
          stats[parserName].totalSymbols += parseResult.symbols.length;
          stats[parserName].totalTime += parseResult.parseTime;
          stats[parserName].totalConfidence += parseResult.confidence;
        }
        
        // Count wins
        if (result.analysis.symbolDetectionWinner === parserName) {
          stats[parserName].wins.symbols++;
        }
        if (result.analysis.performanceWinner === parserName) {
          stats[parserName].wins.performance++;
        }
        if (result.analysis.confidenceWinner === parserName) {
          stats[parserName].wins.confidence++;
        }
      }
    }
    
    // Print summary
    const totalFiles = this.results.length;
    
    console.log(`\n📊 Success Rates:`);
    for (const [name, stat] of Object.entries(stats)) {
      const rate = (stat.successCount / totalFiles * 100).toFixed(1);
      console.log(`   ${name}: ${stat.successCount}/${totalFiles} (${rate}%)`);
    }
    
    console.log(`\n🏆 Category Winners:`);
    for (const [name, stat] of Object.entries(stats)) {
      if (stat.successCount > 0) {
        const avgSymbols = (stat.totalSymbols / stat.successCount).toFixed(1);
        const avgTime = (stat.totalTime / stat.successCount).toFixed(0);
        const avgConf = (stat.totalConfidence / stat.successCount * 100).toFixed(1);
        
        console.log(`   ${name}:`);
        console.log(`     Avg symbols: ${avgSymbols}, Time: ${avgTime}ms, Confidence: ${avgConf}%`);
        console.log(`     Wins: ${stat.wins.symbols} symbols, ${stat.wins.performance} performance, ${stat.wins.confidence} confidence`);
      }
    }
    
    // Migration readiness
    console.log(`\n🚀 Migration Assessment:`);
    const legacyParser = stats['Legacy Unified Parser'] || stats['legacy'];
    const newParser = stats['Tree-Sitter Parser'] || stats['tree-sitter'];
    
    if (legacyParser && newParser) {
      if (newParser.successCount >= legacyParser.successCount && 
          newParser.totalSymbols >= legacyParser.totalSymbols * 0.9) {
        console.log(`   ✅ READY for legacy parser removal`);
        console.log(`      New parser matches or exceeds legacy performance`);
      } else {
        console.log(`   ⚠️  NOT READY for legacy parser removal`);
        console.log(`      Address issues before migration`);
      }
    }
  }
  
  async getDetailedStats(): Promise<any> {
    const dbStats = await this.dbAdapter.getStats();
    
    return {
      database: dbStats,
      testRun: {
        totalFiles: this.config.testFiles.length,
        totalParsers: this.config.parsers.length,
        totalResults: this.results.length
      },
      configuration: {
        databaseType: this.config.databaseType,
        outputFormat: this.config.outputFormat,
        enabledFeatures: {
          detailedAnalysis: this.config.includeDetailedAnalysis,
          benchmarking: this.config.enableBenchmarking
        }
      }
    };
  }
  
  async exportResults(format: 'json' | 'csv' = 'json'): Promise<string> {
    const data = {
      configuration: this.config,
      results: this.results,
      stats: await this.getDetailedStats(),
      timestamp: new Date().toISOString()
    };
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Simple CSV export
      const headers = ['file', 'parser', 'symbols', 'time_ms', 'confidence', 'success'];
      const rows = [headers.join(',')];
      
      for (const result of this.results) {
        for (const [parserName, parseResult] of Object.entries(result.results)) {
          const row = [
            result.file,
            parserName,
            parseResult.symbols.length,
            parseResult.parseTime,
            (parseResult.confidence * 100).toFixed(1),
            parseResult.success
          ];
          rows.push(row.join(','));
        }
      }
      
      return rows.join('\n');
    }
  }
  
  async cleanup(): Promise<void> {
    // Cleanup parsers
    for (const parser of this.config.parsers) {
      if (parser.cleanup) {
        await parser.cleanup();
      }
    }
    
    // Close database
    this.dbAdapter.close();
    
    console.log(`\n🧹 Cleanup completed`);
  }
}

/**
 * Configuration builder for easy test setup
 */
export class TestConfigurationBuilder {
  private config: Partial<TestConfiguration> = {
    databaseType: 'legacy',
    parsers: [],
    testFiles: [],
    outputFormat: 'console',
    includeDetailedAnalysis: true,
    enableBenchmarking: true
  };
  
  withDatabase(type: 'legacy' | 'multiproject', path: string): this {
    this.config.databaseType = type;
    this.config.databasePath = path;
    return this;
  }
  
  withParser(parser: ParserInterface): this {
    this.config.parsers!.push(parser);
    return this;
  }
  
  withTestFiles(files: string[]): this {
    this.config.testFiles = files;
    return this;
  }
  
  withComplexTestFiles(): this {
    this.config.testFiles = [
      'test/complex-files/cpp/Core/VulkanResourceManager.cpp',
      'test/complex-files/cpp/Services/Reflection/ShaderReflectionSystem.cpp',
      'test/complex-files/ixx/Core/VulkanManager.ixx',
      'test/complex-files/ixx/SPIRV/SPIRVCore.ixx',
      'test/complex-files/src-buffer/BufferFactory.cpp'
    ];
    return this;
  }
  
  withOutput(format: 'console' | 'json' | 'both'): this {
    this.config.outputFormat = format;
    return this;
  }
  
  build(): TestConfiguration {
    if (!this.config.databasePath) {
      throw new Error('Database path is required');
    }
    if (!this.config.parsers || this.config.parsers.length === 0) {
      throw new Error('At least one parser is required');
    }
    if (!this.config.testFiles || this.config.testFiles.length === 0) {
      throw new Error('At least one test file is required');
    }
    
    return this.config as TestConfiguration;
  }
}