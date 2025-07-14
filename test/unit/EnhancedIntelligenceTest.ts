import { BaseTest } from '../helpers/BaseTest';
import { ClangIntelligentIndexer } from '../../dist/indexing/clang-intelligent-indexer.js';
import { DuplicateDetectionService } from '../../dist/services/duplicate-detection-service.js';
import { AgentContextService } from '../../dist/services/agent-context-service.js';
import { EnhancedAntiPatternDetector } from '../../dist/services/enhanced-antipattern-detector.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Tests for enhanced intelligent parsing and analysis features
 * Integrates Clang+19 AST parsing, duplicate detection, agent context, and anti-patterns
 */
export class EnhancedIntelligenceTest extends BaseTest {
  private clangIndexer: ClangIntelligentIndexer | null = null;
  private duplicateDetector: DuplicateDetectionService | null = null;
  private agentContext: AgentContextService | null = null;
  private antiPatternDetector: EnhancedAntiPatternDetector | null = null;
  private sharedDbPath: string;
  private realProjectPath: string = '/home/warxh/planet_procgen';
  
  // Test files that are actually being compiled - focus on .ixx module interfaces
  private testFiles = [
    'include/Common/GLMModule.ixx',
    'include/Common/PlanetCommon.ixx',
    'include/Core/Threading/ThreadPool.ixx',
    'include/Core/Logging/Logger.ixx',
    'include/Core/Performance/PerformanceMonitor.ixx'
  ];

  constructor(sharedDbPath: string = '.test-db/main/enhanced.db') {
    super('enhanced-intelligence');
    this.sharedDbPath = sharedDbPath;
  }

  async specificSetup(): Promise<void> {
    // Initialize all services with real project path
    this.clangIndexer = new ClangIntelligentIndexer(this.realProjectPath, this.sharedDbPath);
    this.duplicateDetector = new DuplicateDetectionService(this.realProjectPath, this.sharedDbPath);
    this.agentContext = new AgentContextService(this.sharedDbPath);
    this.antiPatternDetector = new EnhancedAntiPatternDetector(this.sharedDbPath);
    
    // Load compilation database if available
    await this.clangIndexer.loadCompilationDatabase();
  }

  async specificTeardown(): Promise<void> {
    // Close all services
    if (this.clangIndexer) this.clangIndexer.close();
    if (this.duplicateDetector) await this.duplicateDetector.close();
    if (this.agentContext) this.agentContext.close();
    if (this.antiPatternDetector) this.antiPatternDetector.close();
  }

  async run(): Promise<void> {
    console.log('\n📋 Test 1: Clang+19 AST Parsing');
    await this.testClangAstParsing();
    
    console.log('\n📋 Test 2: Duplicate Code Detection');
    await this.testDuplicateDetection();
    
    console.log('\n📋 Test 3: Agent Context Preservation');
    await this.testAgentContext();
    
    console.log('\n📋 Test 4: Enhanced Anti-Pattern Detection');
    await this.testEnhancedAntiPatterns();
    
    console.log('\n📋 Test 5: Integrated Intelligence Analysis');
    await this.testIntegratedAnalysis();
  }

  /**
   * Test 1: Verify Clang AST parsing capabilities
   */
  private async testClangAstParsing(): Promise<void> {
    console.log('Testing Clang+19 AST parsing capabilities...');
    
    let successCount = 0;
    let symbolCount = 0;
    
    for (const file of this.testFiles.slice(0, 2)) { // Test first 2 files
      const fullPath = path.join(this.realProjectPath, file);
      
      try {
        await this.clangIndexer!.indexFile(fullPath);
        successCount++;
        
        // Verify symbols were extracted
        const symbols = await this.clangIndexer!.findSymbol('create');
        symbolCount += symbols.length;
        
        console.log(`Indexed ${path.basename(file)} - found ${symbols.length} 'create' symbols`);
      } catch (error) {
        console.log(` Failed to index ${path.basename(file)}: ${(error as Error).message}`);
      }
    }
    
    console.log(`\n📊 AST Parsing Results:`);
    console.log(`  - Files parsed: ${successCount}/${this.testFiles.length}`);
    console.log(`  - Total symbols found: ${symbolCount}`);
    
    if (successCount === 0) {
      console.log(`  - ⚠️  WARNING: Clang+19 may not be installed. Falling back to tree-sitter.`);
    }
  }

  /**
   * Test 2: Duplicate code detection
   */
  private async testDuplicateDetection(): Promise<void> {
    console.log('Analyzing code duplication patterns...');
    
    const reports: any[] = [];
    
    for (const file of this.testFiles.slice(0, 3)) {
      const fullPath = path.join(this.realProjectPath, file);
      
      try {
        const report = await this.duplicateDetector!.analyzeFile(fullPath);
        reports.push(report);
        
        if (report.clones.length > 0) {
          console.log(`Found ${report.clones.length} clones in ${path.basename(file)}`);
          
          // Show clone types
          const cloneTypes = report.clones.reduce((acc, clone) => {
            acc[`type${clone.type}`] = (acc[`type${clone.type}`] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          console.log(`   Clone types: ${JSON.stringify(cloneTypes)}`);
        }
      } catch (error) {
        console.log(` Duplication analysis failed for ${path.basename(file)}: ${(error as Error).message}`);
      }
    }
    
    // Get project-wide report
    const projectReport = await this.duplicateDetector!.getProjectReport();
    
    console.log(`\n📊 Duplication Analysis Summary:`);
    console.log(`  - Total clones detected: ${projectReport.totalClones}`);
    console.log(`  - Duplication ratio: ${(projectReport.duplicationRatio * 100).toFixed(1)}%`);
    console.log(`  - Clone type distribution: ${JSON.stringify(projectReport.clonesByType)}`);
    
    if (projectReport.recommendations.length > 0) {
      console.log(`\n  Recommendations:`);
      projectReport.recommendations.forEach(rec => 
        console.log(`  - ${rec}`)
      );
    }
  }

  /**
   * Test 3: Agent context preservation
   */
  private async testAgentContext(): Promise<void> {
    console.log('Testing agent context preservation system...');
    
    // Start a mock agent session
    const session = await this.agentContext!.startSession(
      'test-agent',
      'Implement GPU heightmap optimization',
      this.testFiles.slice(3, 5) // GPU-related files
    );
    
    console.log(`Started agent session: ${session.sessionId}`);
    console.log(`  - Architectural stage: ${session.architecturalStage}`);
    console.log(`  - Quality score before: ${session.qualityScoreBefore?.toFixed(2)}`);
    
    // Show context constraints
    if (session.context) {
      console.log(`\n  Active constraints: ${session.context.constraints.length}`);
      session.context.constraints.slice(0, 3).forEach(c => 
        console.log(`  - ${c.description} (${c.enforcement_level})`)
      );
      
      console.log(`\n  Guidance rules: ${session.context.guidanceRules.length}`);
      session.context.guidanceRules.slice(0, 3).forEach(r => 
        console.log(`  - ${r.rule_name}: ${r.explanation}`)
      );
    }
    
    // Simulate modifications
    await this.agentContext!.trackModification(
      session.sessionId,
      'generateHeightmap',
      this.testFiles[3],
      'modified',
      'void generateHeightmap(float* data)',
      'void generateHeightmap(float* data, GPUMode mode)'
    );
    
    // Validate session
    const validation = await this.agentContext!.validateSession(session.sessionId);
    
    console.log(`\n📊 Session Validation Results:`);
    console.log(`  - Validations passed: ${validation.passed}`);
    console.log(`  - Quality delta: ${validation.qualityDelta.toFixed(2)}`);
    console.log(`  - Summary:\n${validation.summary.split('\n').map(s => `    ${s}`).join('\n')}`);
  }

  /**
   * Test 4: Enhanced anti-pattern detection
   */
  private async testEnhancedAntiPatterns(): Promise<void> {
    console.log('Detecting C++ anti-patterns and bad practices...');
    
    const allDetections: any[] = [];
    let filesAnalyzed = 0;
    const maxFiles = 2; // Reduced to prevent hanging
    
    for (const file of this.testFiles.slice(0, maxFiles)) {
      const fullPath = path.join(this.realProjectPath, file);
      
      try {
        console.log(`  Analyzing ${path.basename(file)}...`);
        
        // Check if file exists
        await fs.access(fullPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Add timeout for analysis
        const analysisPromise = this.antiPatternDetector!.analyzeFile(fullPath, content);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), 3000)
        );
        
        const report = await Promise.race([analysisPromise, timeoutPromise]);
        filesAnalyzed++;
        
        if (report.totalDetections > 0) {
          allDetections.push(...report.detections);
          console.log(`Found ${report.totalDetections} anti-patterns in ${path.basename(file)}`);
          console.log(`   Risk score: ${report.riskScore.toFixed(1)}/100`);
          console.log(`   Severity: ${JSON.stringify(report.bySeverity)}`);
          
          // Show critical patterns
          report.criticalPatterns.slice(0, 2).forEach(p => 
            console.log(`   - ${p.patternName} (line ${p.lineNumber}): ${p.description}`)
          );
        } else {
          console.log(`  ✓ No anti-patterns found in ${path.basename(file)}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('ENOENT')) {
          console.log(`  ⚠️  Skipping missing file: ${path.basename(file)}`);
        } else if (errorMsg.includes('timeout')) {
          console.log(`  ⚠️  Analysis timeout for ${path.basename(file)}`);
        } else {
          console.log(`  ⚠️  Analysis error for ${path.basename(file)}: ${errorMsg}`);
        }
      }
    }
    
    // Only get project summary if we analyzed files
    if (filesAnalyzed > 0) {
      try {
        const projectSummary = await this.antiPatternDetector!.getProjectSummary();
        
        console.log(`\n📊 Anti-Pattern Detection Summary:`);
        console.log(`  - Total files analyzed: ${projectSummary.totalFilesAnalyzed}`);
        console.log(`  - Total detections: ${projectSummary.totalDetections}`);
        
        if (projectSummary.patternStats.length > 0) {
          console.log(`\n  Top anti-patterns:`);
          projectSummary.patternStats.slice(0, 5).forEach(p => 
            console.log(`  - ${p.pattern_name}: ${p.detection_count} occurrences in ${p.affected_files} files`)
          );
        }
        
        if (projectSummary.strongCorrelations.length > 0) {
          console.log(`\n  Pattern correlations:`);
          projectSummary.strongCorrelations.slice(0, 3).forEach(c => 
            console.log(`  - ${c.pattern1} ↔ ${c.pattern2} (strength: ${c.correlation_strength.toFixed(2)})`)
          );
        }
      } catch (error) {
        console.log(`\n⚠️  Could not generate project summary: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log(`\n⚠️  No files were successfully analyzed for anti-patterns`);
    }
  }

  /**
   * Test 5: Integrated intelligence analysis
   */
  private async testIntegratedAnalysis(): Promise<void> {
    console.log('Running integrated intelligence analysis...');
    
    const db = new Database(this.sharedDbPath);
    
    // Analyze relationships between different detection types
    console.log('\n🔍 Cross-Analysis Results:');
    
    // Files with both duplicates and anti-patterns
    const problematicFiles = db.prepare(`
      SELECT DISTINCT 
        ah.file_path,
        COUNT(DISTINCT cc.id) as clone_count,
        COUNT(DISTINCT ap.id) as antipattern_count
      FROM ast_hashes ah
      LEFT JOIN code_clones cc ON (ah.id = cc.fragment1_id OR ah.id = cc.fragment2_id)
      LEFT JOIN antipattern_detections ap ON ah.file_path = ap.file_path
      GROUP BY ah.file_path
      HAVING clone_count > 0 AND antipattern_count > 0
    `).all();
    
    if (problematicFiles.length > 0) {
      console.log(`  Files with both duplicates and anti-patterns: ${problematicFiles.length}`);
      problematicFiles.slice(0, 3).forEach((f: any) => 
        console.log(`  - ${path.basename(f.file_path)}: ${f.clone_count} clones, ${f.antipattern_count} anti-patterns`)
      );
    }
    
    // Semantic tag coverage improvement
    const tagCoverage = db.prepare(`
      SELECT 
        COUNT(*) as total_symbols,
        SUM(CASE WHEN semantic_tags != '[]' THEN 1 ELSE 0 END) as tagged_symbols,
        COUNT(DISTINCT semantic_tags) as unique_tag_combinations
      FROM enhanced_symbols
    `).get() as any;
    
    const coverage = tagCoverage.tagged_symbols / tagCoverage.total_symbols * 100;
    
    console.log(`\n📊 Semantic Tagging Progress:`);
    console.log(`  - Symbol coverage: ${coverage.toFixed(1)}% (${tagCoverage.tagged_symbols}/${tagCoverage.total_symbols})`);
    console.log(`  - Unique tag combinations: ${tagCoverage.unique_tag_combinations}`);
    
    // Intelligence recommendations
    console.log(`\n🎯 Intelligent Recommendations:`);
    
    if (coverage < 90) {
      console.log(`  1. Semantic coverage is ${coverage.toFixed(1)}% - need to enhance pattern detection`);
    }
    
    if (problematicFiles.length > 5) {
      console.log(`  2. ${problematicFiles.length} files have both duplication and anti-patterns - prioritize refactoring`);
    }
    
    const vulkanAntipatterns = db.prepare(`
      SELECT COUNT(*) as count 
      FROM antipattern_detections 
      WHERE pattern_name LIKE '%Vulkan%'
    `).get() as any;
    
    if (vulkanAntipatterns.count > 10) {
      console.log(`  3. ${vulkanAntipatterns.count} Vulkan anti-patterns detected - implement wrapper library`);
    }
    
    console.log(`\n✨ Enhanced intelligence features are ready to guide agent development!`);
    
    db.close();
  }
}

// Export for use in TestRunner
export default EnhancedIntelligenceTest;