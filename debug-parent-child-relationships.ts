#!/usr/bin/env node
/**
 * Debug script to test the complete parent-child relationship pipeline
 * for C++ struct fields
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import { OptimizedCppTreeSitterParser } from "./dist/parsers/tree-sitter/optimized-cpp-parser.js";
import { createLogger } from "./dist/utils/logger.js";
import { universalSymbols } from "./dist/database/drizzle/schema.js";
import { DatabaseInitializer } from "./dist/database/db-init.js";

const logger = createLogger('ParentChildDebug');

async function debugParentChildRelationships() {
  const db = new Database(":memory:");
  const drizzleDb = drizzle(db);
  
  // Initialize database schema
  const initializer = new DatabaseInitializer(db);
  await initializer.initialize();

  const parser = new OptimizedCppTreeSitterParser(db, {
    debugMode: true,
    enableComplexityAnalysis: false,
    enableControlFlowAnalysis: false,
    enablePatternDetection: false,
  });
  
  await parser.initialize();

  const testCode = `
    struct GenericResourceDesc {
      uint32_t width;
      uint32_t height;
      uint32_t depth;
      ResourceType type;
      Format format;
      uint32_t mipLevels;
      uint32_t arrayLayers;
      SampleCount samples;
      bool hostVisible;
      int extraField;
    };
  `;

  logger.info("=== STEP 1: Parse C++ code ===");
  const result = await parser.parseFile("test.cpp", testCode);
  
  logger.info(`Parse result: ${result.symbols.length} symbols found`);
  
  // Check symbols in parse result
  const structSymbol = result.symbols.find(s => s.name === "GenericResourceDesc");
  const fieldSymbols = result.symbols.filter(s => s.kind === "field");
  
  logger.info(`\nStruct symbol found: ${structSymbol ? 'YES' : 'NO'}`);
  if (structSymbol) {
    logger.info(`  - Name: ${structSymbol.name}`);
    logger.info(`  - Qualified Name: ${structSymbol.qualifiedName}`);
    logger.info(`  - Kind: ${structSymbol.kind}`);
  }
  
  logger.info(`\nField symbols found: ${fieldSymbols.length}`);
  fieldSymbols.forEach(field => {
    logger.info(`  - ${field.name}: parentScope='${field.parentScope}', qualifiedName='${field.qualifiedName}'`);
  });

  logger.info("\n=== STEP 2: Check database storage BEFORE indexing ===");
  
  // Check what's in the database before indexing
  const allSymbolsBeforeIndexing = await drizzleDb.select().from(universalSymbols);
  logger.info(`Symbols in database before indexing: ${allSymbolsBeforeIndexing.length}`);

  logger.info("\n=== STEP 3: Use Universal Indexer to store symbols ===");
  
  // Import and use the universal indexer to properly store symbols
  const { UniversalIndexer } = await import("./dist/indexing/universal-indexer.js");
  const indexer = new UniversalIndexer(db, {
    projectPath: "/tmp/test",
    projectName: "test",
    languages: ["cpp"],
    debugMode: true,
    enableSemanticAnalysis: false,
  });

  // Manually create a project and store our symbols
  await db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, path, created_at, updated_at)
    VALUES (1, 'test', '/tmp/test', datetime('now'), datetime('now'))
  `).run();

  await db.prepare(`
    INSERT OR IGNORE INTO languages (id, name, extension)
    VALUES (1, 'cpp', '.cpp')
  `).run();

  // Store the symbols using the indexer's symbol resolver
  const { IndexerSymbolResolver } = await import("./dist/indexing/indexer-symbol-resolver.js");
  const symbolResolver = new IndexerSymbolResolver(db);
  
  const languageMap = new Map([["cpp", 1]]);
  const parseResults = [{ ...result, filePath: "test.cpp" }];
  
  await symbolResolver.storeSymbols(
    1, // projectId
    languageMap,
    parseResults,
    (ext: string) => ext === ".cpp" ? "cpp" : null,
    []
  );

  logger.info("\n=== STEP 4: Check database storage AFTER indexing ===");
  
  const allSymbolsAfterIndexing = await drizzleDb.select().from(universalSymbols);
  logger.info(`Symbols in database after indexing: ${allSymbolsAfterIndexing.length}`);
  
  // Find the struct and fields in database
  const dbStruct = allSymbolsAfterIndexing.find(s => s.name === "GenericResourceDesc");
  const dbFields = allSymbolsAfterIndexing.filter(s => s.kind === "field");
  
  logger.info(`\nDatabase struct: ${dbStruct ? 'FOUND' : 'MISSING'}`);
  if (dbStruct) {
    logger.info(`  - ID: ${dbStruct.id}`);
    logger.info(`  - Name: ${dbStruct.name}`);
    logger.info(`  - Qualified Name: ${dbStruct.qualifiedName}`);
    logger.info(`  - Parent Symbol ID: ${dbStruct.parentSymbolId}`);
  }
  
  logger.info(`\nDatabase fields: ${dbFields.length}`);
  dbFields.forEach(field => {
    logger.info(`  - ${field.name}: parentSymbolId=${field.parentSymbolId}, qualifiedName='${field.qualifiedName}'`);
  });

  logger.info("\n=== STEP 5: Test parent-child relationship query ===");
  
  if (dbStruct) {
    const childFields = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'field'),
        eq(universalSymbols.parentSymbolId, dbStruct.id)
      ));
    
    logger.info(`Fields found by parentSymbolId query: ${childFields.length}`);
    childFields.forEach(field => {
      logger.info(`  - ${field.name}: ${field.returnType}`);
    });
    
    // This should be 10 (the number of fields in GenericResourceDesc)
    const expectedFields = 10;
    const success = childFields.length === expectedFields;
    logger.info(`\n=== RESULT ===`);
    logger.info(`Expected: ${expectedFields} fields`);
    logger.info(`Found: ${childFields.length} fields`);
    logger.info(`Test ${success ? 'PASSED' : 'FAILED'}`);
    
    if (!success) {
      // Debug information
      logger.info("\n=== DEBUG INFO ===");
      logger.info("All symbols in database:");
      allSymbolsAfterIndexing.forEach(sym => {
        logger.info(`  - ${sym.name} (${sym.kind}): parentSymbolId=${sym.parentSymbolId}, qualifiedName='${sym.qualifiedName}'`);
      });
    }
    
    process.exit(success ? 0 : 1);
  } else {
    logger.error("Struct not found in database - test failed");
    process.exit(1);
  }
}

debugParentChildRelationships().catch(error => {
  logger.error("Debug script failed", error);
  process.exit(1);
});