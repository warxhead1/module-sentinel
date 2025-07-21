import { BaseTest } from '../helpers/BaseTest';
import { ControlFlowAnalyzer } from '../../src/analysis/control-flow-analyzer.js';
import Database from 'better-sqlite3';
import Parser from 'tree-sitter';
import * as fs from 'fs';
import * as path from 'path';

export class ControlFlowAnalysisTest extends BaseTest {
  private analyzer!: ControlFlowAnalyzer;
  private parser!: Parser;
  
  async specificSetup(): Promise<void> {
    const testDb = this.dbManager.getDatabase();
    this.analyzer = new ControlFlowAnalyzer(testDb);
    
    this.parser = new Parser();
    
    // Try to load tree-sitter-cpp if available
    try {
      const CppLanguage = require('tree-sitter-cpp');
      this.parser.setLanguage(CppLanguage);
    } catch (error) {
      console.warn('⚠️  tree-sitter-cpp not available, skipping AST-based tests');
      // We'll skip the test if parser isn't available
    }
  }
  
  async specificTeardown(): Promise<void> {
    // Nothing specific to teardown
  }
  
  async run(): Promise<void> {
    await this.testSerializeToStringControlFlow();
  }
  
  private async testSerializeToStringControlFlow(): Promise<void> {
    console.log('\n🔍 Testing control flow analysis for SerializeToString method...');
    
    // Read the actual SerializeToString file
    const filePath = path.join(
      __dirname, '..',
      'complex-files/cpp/Generation/Configuration/JsonConfigurationHelpers.cpp'
    );
    
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Test file not found: ${filePath}`);
      return;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Skip if parser wasn't loaded
    try {
      if (!this.parser || !this.parser.getLanguage()) {
        console.log('   ⏭️  Skipping - tree-sitter-cpp not available');
        return;
      }
    } catch (error) {
      console.log('   ⏭️  Skipping - tree-sitter-cpp not available');
      return;
    }
    
    const tree = this.parser.parse(content);
    
    // First, let's find the SerializeToString function in the database
    const testDb = this.dbManager.getDatabase(this.testName);
    const symbolQuery = testDb.prepare(`
      SELECT * FROM universal_symbols 
      WHERE name = 'SerializeToString' 
      AND file_path LIKE '%JsonConfigurationHelpers.cpp'
      AND line = 18
      LIMIT 1
    `);
    
    let symbol = symbolQuery.get() as any;
    
    if (!symbol) {
      // Insert a mock symbol for testing
      const insertResult = testDb.prepare(`
        INSERT INTO universal_symbols (
          project_id, language_id, name, qualified_name, kind,
          file_path, line, column, end_line, end_column,
          return_type, signature, confidence
        ) VALUES (1, 1, 'SerializeToString', 'SerializeToString', 'function',
          ?, 18, 1, 66, 1, 'std::string', 
          'std::string JsonUtil::SerializeToString(const JsonValue& value, int indent)', 0.9)
      `).run(filePath);
      
      symbol = { id: insertResult.lastInsertRowid };
    }
    
    // Analyze the control flow
    console.log(`📊 Analyzing control flow for symbol ID: ${symbol.id}`);
    const cfg = await this.analyzer.analyzeSymbol(symbol.id, tree, content);
    
    // Check the results
    console.log(`\n📈 Control Flow Analysis Results:`);
    console.log(`  - Total blocks: ${cfg.blocks.length}`);
    console.log(`  - Cyclomatic complexity: ${cfg.complexity}`);
    console.log(`  - Entry point: line ${cfg.blocks.find(b => b.type === 'entry')?.startLine}`);
    
    // Find specific blocks we expect
    const switchBlock = cfg.blocks.find(b => b.type === 'switch');
    const loopBlocks = cfg.blocks.filter(b => b.type === 'loop');
    const conditionalBlocks = cfg.blocks.filter(b => b.type === 'conditional');
    
    console.log(`\n🔍 Block Analysis:`);
    if (switchBlock) {
      console.log(`  ✅ Switch block found: lines ${switchBlock.startLine}-${switchBlock.endLine}`);
      this.assert(
        switchBlock.endLine > switchBlock.startLine + 5,
        `Switch block should span multiple lines, got ${switchBlock.startLine}-${switchBlock.endLine}`
      );
    } else {
      console.log(`  ❌ No switch block found`);
    }
    
    console.log(`  - Found ${loopBlocks.length} loop blocks:`);
    for (const loop of loopBlocks) {
      console.log(`    • Loop at lines ${loop.startLine}-${loop.endLine}`);
      this.assert(
        loop.endLine > loop.startLine,
        `Loop block should span multiple lines, got ${loop.startLine}-${loop.endLine}`
      );
    }
    
    console.log(`  - Found ${conditionalBlocks.length} conditional blocks:`);
    for (const cond of conditionalBlocks) {
      console.log(`    • Conditional at lines ${cond.startLine}-${cond.endLine}`);
    }
    
    // Verify we have the expected blocks based on the code structure
    this.assert(cfg.blocks.length >= 7, `Expected at least 7 blocks, got ${cfg.blocks.length}`);
    this.assert(switchBlock !== undefined, 'Should have a switch block');
    this.assert(loopBlocks.length >= 2, `Expected at least 2 loops, got ${loopBlocks.length}`);
    
    // Check that blocks have proper ranges
    const problemBlocks = cfg.blocks.filter(b => 
      b.type !== 'entry' && b.type !== 'exit' && b.startLine === b.endLine
    );
    
    if (problemBlocks.length > 0) {
      console.log(`\n⚠️  Found ${problemBlocks.length} blocks with same start/end line:`);
      for (const block of problemBlocks) {
        console.log(`    • ${block.type} block at line ${block.startLine}`);
      }
    }
    
    // Check function calls are captured
    const callsQuery = testDb.prepare(`
      SELECT COUNT(*) as count FROM symbol_calls 
      WHERE caller_id = ?
    `);
    
    const callsResult = callsQuery.get(symbol.id) as { count: number };
    console.log(`\n📞 Function calls from SerializeToString: ${callsResult.count}`);
    
    // Get all function calls for detailed analysis
    const allCallsQuery = testDb.prepare(`
      SELECT line_number, target_function, callee_id, call_type, is_conditional 
      FROM symbol_calls 
      WHERE caller_id = ? 
      ORDER BY line_number
    `);
    
    const allCalls = allCallsQuery.all(symbol.id) as any[];
    console.log(`\n📋 All function calls stored:`);
    
    if (allCalls.length === 0) {
      console.log(`  ❌ NO FUNCTION CALLS FOUND - Parser not extracting calls!`);
      this.assert(false, 'Expected function calls but found none - parser issue');
    } else {
      allCalls.forEach((call: any) => {
        const targetInfo = call.target_function || `callee_id:${call.callee_id}` || 'UNKNOWN';
        const conditionalFlag = call.is_conditional ? ' (conditional)' : '';
        console.log(`  Line ${call.line_number}: ${targetInfo} [${call.call_type}]${conditionalFlag}`);
      });
    }
    
    // Check for calls with missing target information
    const callsWithoutTarget = allCalls.filter((call: any) => 
      !call.target_function && !call.callee_id
    );
    
    if (callsWithoutTarget.length > 0) {
      console.log(`\n⚠️  Found ${callsWithoutTarget.length} calls with missing target information:`);
      callsWithoutTarget.forEach((call: any) => {
        console.log(`  Line ${call.line_number}: Missing both target_function and callee_id`);
      });
    }
    
    // Verify the specific lines where we expect function calls
    const expectedCallLines = [23, 37, 38, 42, 49, 50, 51, 56];
    console.log(`\n🎯 Checking expected function call lines:`);
    
    let foundCallsCount = 0;
    for (const line of expectedCallLines) {
      const callAtLine = allCalls.find(call => call.line_number === line);
      
      if (callAtLine) {
        const targetInfo = callAtLine.target_function || `callee_id:${callAtLine.callee_id}` || 'UNKNOWN';
        console.log(`  ✅ Found call at line ${line}: ${targetInfo}`);
        foundCallsCount++;
      } else {
        console.log(`  ❌ Missing call at line ${line}`);
      }
    }
    
    // Assert we found at least some of the expected calls
    this.assert(
      foundCallsCount >= 3, 
      `Expected at least 3 function calls at specific lines, found ${foundCallsCount}/${expectedCallLines.length}`
    );
    
    // Check control flow blocks have calls within their ranges
    console.log(`\n🔗 Verifying function calls within control flow blocks:`);
    for (const block of cfg.blocks) {
      if (block.type === 'entry' || block.type === 'exit') continue;
      
      const callsInBlock = allCalls.filter(call => 
        call.line_number >= block.startLine && call.line_number <= block.endLine
      );
      
      console.log(`  Block ${block.type} (${block.startLine}-${block.endLine}): ${callsInBlock.length} calls`);
      
      if (callsInBlock.length > 0) {
        callsInBlock.forEach(call => {
          const targetInfo = call.target_function || `callee_id:${call.callee_id}` || 'UNKNOWN';
          console.log(`    • Line ${call.line_number}: ${targetInfo}`);
        });
      }
    }
    
    console.log('\n✅ Control flow analysis test completed');
  }
}