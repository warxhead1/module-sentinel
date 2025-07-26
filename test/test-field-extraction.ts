#!/usr/bin/env node
/**
 * Test field extraction for C++ structs
 */

import Database from "better-sqlite3";
import { OptimizedCppTreeSitterParser } from "../dist/parsers/tree-sitter/optimized-cpp-parser.js";
import { createLogger } from "../dist/utils/logger.js";

const logger = createLogger('FieldExtractionTest');

async function testFieldExtraction() {
  const db = new Database(":memory:");
  
  // Initialize database schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS universal_symbols (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      qualified_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line INTEGER NOT NULL,
      column INTEGER NOT NULL,
      end_line INTEGER,
      end_column INTEGER,
      project_id INTEGER DEFAULT 1,
      language_id INTEGER DEFAULT 1
    );
  `);

  const parser = new OptimizedCppTreeSitterParser(db, {
    debugMode: true,
    enableComplexityAnalysis: true,
    enableControlFlowAnalysis: true,
    enablePatternDetection: true,
    cppOptions: {
      enableTemplateAnalysis: true,
      enableNamespaceTracking: true,
      enableInheritanceAnalysis: true,
    }
  });
  
  await parser.initialize();

  const testCode = `
    struct GenericResourceDesc {
      uint32_t width;
      uint32_t height;
      ResourceType type;
      Format format;
      uint32_t depth;
      uint32_t mipLevels;
      uint32_t arrayLayers;
      SampleCount samples;
      bool hostVisible;
    };
    
    class TestClass {
    private:
      int privateField;
      static const double PI = 3.14159;
      
    protected:
      std::string protectedField;
      
    public:
      TestClass() = default;
      void method() {}
      
      int publicField;
      mutable int mutableField;
    };
  `;

  logger.info("Testing field extraction...");
  
  const result = await parser.parseFile("test.cpp", testCode);
  
  // Find the GenericResourceDesc struct
  const genericResourceDesc = result.symbols.find(s => s.name === "GenericResourceDesc");
  if (!genericResourceDesc) {
    logger.error("GenericResourceDesc struct not found!");
    return;
  }
  
  logger.info(`Found GenericResourceDesc at line ${genericResourceDesc.line}`);
  
  // Count fields
  const structFields = result.symbols.filter(s => 
    s.kind === "field" && 
    s.parentScope === "GenericResourceDesc"
  );
  
  logger.info(`GenericResourceDesc fields found: ${structFields.length}`);
  structFields.forEach(field => {
    logger.info(`  - ${field.name}: ${field.returnType} at line ${field.line}`);
  });
  
  // Test class fields
  const classFields = result.symbols.filter(s => 
    s.kind === "field" && 
    s.parentScope === "TestClass"
  );
  
  logger.info(`TestClass fields found: ${classFields.length}`);
  classFields.forEach(field => {
    logger.info(`  - ${field.visibility} ${field.name}: ${field.returnType} at line ${field.line}`);
  });
  
  // Summary
  logger.info("\nSummary:");
  logger.info(`Total symbols: ${result.symbols.length}`);
  logger.info(`GenericResourceDesc fields: ${structFields.length} (expected: 9)`);
  logger.info(`TestClass fields: ${classFields.length} (expected: 5)`);
  
  const success = structFields.length === 9 && classFields.length >= 4;
  logger.info(`\nTest ${success ? 'PASSED' : 'FAILED'}`);
  
  await parser.shutdown();
  process.exit(success ? 0 : 1);
}

testFieldExtraction().catch(error => {
  logger.error("Test failed", error);
  process.exit(1);
});