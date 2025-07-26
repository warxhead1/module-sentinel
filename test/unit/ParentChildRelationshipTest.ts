/**
 * Test to verify parent-child symbol relationships are properly resolved
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { createLogger } from "../../src/utils/logger.js";
import { DatabaseInitializer } from "../../src/database/database-initializer.js";
import { CppLanguageParser } from "../../src/parsers/adapters/cpp-language-parser.js";
import { universalSymbols, projects, languages } from "../../src/database/drizzle/schema.js";

export class ParentChildRelationshipTest {
  private logger = createLogger("ParentChildRelationshipTest");
  private db?: Database.Database;
  private drizzleDb?: ReturnType<typeof drizzle>;
  private parser?: CppLanguageParser;

  async setup(): Promise<void> {
    // Create in-memory database
    this.db = new Database(":memory:");
    this.drizzleDb = drizzle(this.db);
    
    // Initialize schema
    const initializer = DatabaseInitializer.getInstance();
    this.db.close(); // Close the initial database
    this.db = await initializer.initializeDatabase(":memory:");
    this.drizzleDb = drizzle(this.db);
    
    // Create test project and language
    await this.drizzleDb.insert(projects).values({
      name: "test-project",
      rootPath: "/test",
      displayName: "Test Project",
      createdAt: new Date().toISOString(),
      lastIndexed: new Date().toISOString()
    });
    
    await this.drizzleDb.insert(languages).values({
      name: "cpp",
      displayName: "C++",
      extensions: [".cpp", ".cc", ".cxx", ".hpp", ".h"],
      parserClass: "CppLanguageParser",
      active: true
    }).onConflictDoNothing();
    
    // Create parser
    this.parser = new CppLanguageParser(this.db, {
      debugMode: true,
      enableSemanticAnalysis: false
    });
    await this.parser.initialize();
  }

  async teardown(): Promise<void> {
    // Parser cleanup not needed
    if (this.db) {
      this.db.close();
    }
  }

  async run(): Promise<void> {
    this.logger.info("Testing parent-child symbol relationship resolution");
    
    await this.setup();
    
    try {
      // Test code with struct and its fields
      const testCode = `
struct Parent {
    int field1;
    double field2;
    void* field3;
};

class Container {
private:
    int privateField;
public:
    Parent parentMember;
    int publicField;
    
    void method() {
        privateField = 42;
        publicField = 100;
    }
};
`;

      // Parse the code
      const result = await this.parser!.parse("test.cpp", testCode);
      this.logger.info(`Parsed ${result.symbols.length} symbols`);
      
      // Store symbols in database using IndexerSymbolResolver logic
      await this.storeSymbolsWithParentResolution(result);
      
      // Query to verify parent-child relationships
      const allSymbols = await this.drizzleDb!
        .select()
        .from(universalSymbols)
        .where(eq(universalSymbols.projectId, 1));
      
      this.logger.info(`Total symbols in database: ${allSymbols.length}`);
      
      // Find parent symbols
      const parentStruct = allSymbols.find(s => s.name === "Parent" && s.kind === "struct");
      const containerClass = allSymbols.find(s => s.name === "Container" && s.kind === "class");
      
      if (!parentStruct || !containerClass) {
        throw new Error("Parent symbols not found");
      }
      
      this.logger.info(`Found Parent struct with ID: ${parentStruct.id}`);
      this.logger.info(`Found Container class with ID: ${containerClass.id}`);
      
      // Find fields of Parent struct
      const parentFields = allSymbols.filter(s => s.parentSymbolId === parentStruct.id);
      this.logger.info(`Fields of Parent struct: ${parentFields.length}`);
      for (const field of parentFields) {
        this.logger.info(`  - ${field.name} (ID: ${field.id}, parent: ${field.parentSymbolId})`);
      }
      
      // Find fields of Container class
      const containerFields = allSymbols.filter(s => s.parentSymbolId === containerClass.id);
      this.logger.info(`Fields of Container class: ${containerFields.length}`);
      for (const field of containerFields) {
        this.logger.info(`  - ${field.name} (ID: ${field.id}, parent: ${field.parentSymbolId})`);
      }
      
      // Verify counts
      if (parentFields.length !== 3) {
        throw new Error(`Expected 3 fields for Parent struct, got ${parentFields.length}`);
      }
      
      if (containerFields.length < 3) { // At least privateField, parentMember, publicField
        throw new Error(`Expected at least 3 fields for Container class, got ${containerFields.length}`);
      }
      
      // Verify field names
      const parentFieldNames = parentFields.map(f => f.name).sort();
      const expectedParentFields = ["field1", "field2", "field3"].sort();
      if (JSON.stringify(parentFieldNames) !== JSON.stringify(expectedParentFields)) {
        throw new Error(`Parent field names mismatch. Expected: ${expectedParentFields}, Got: ${parentFieldNames}`);
      }
      
      this.logger.info("✅ Parent-child relationships test PASSED!");
      
    } finally {
      await this.teardown();
    }
  }

  private async storeSymbolsWithParentResolution(parseResult: any): Promise<void> {
    // First pass: Store all symbols with null parentSymbolId
    const symbolRecords = parseResult.symbols.map((symbol: any) => ({
      projectId: 1,
      languageId: 1,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      kind: symbol.kind,
      filePath: "test.cpp",
      line: symbol.line,
      column: symbol.column,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
      signature: symbol.signature,
      returnType: symbol.returnType,
      visibility: symbol.visibility,
      complexity: symbol.complexity || 1,
      semanticTags: symbol.semanticTags || [],
      isDefinition: symbol.isDefinition || false,
      isExported: symbol.isExported || false,
      isAsync: symbol.isAsync || false,
      isAbstract: false,
      namespace: symbol.namespace,
      parentSymbolId: null,
      confidence: symbol.confidence || 1.0,
      languageFeatures: symbol.languageFeatures || null,
    }));

    if (symbolRecords.length > 0) {
      await this.drizzleDb!
        .insert(universalSymbols)
        .values(symbolRecords)
        .onConflictDoNothing();
    }

    // Second pass: Resolve parent relationships
    const symbolsWithParents = parseResult.symbols.filter((s: any) => s.parentScope);
    if (symbolsWithParents.length === 0) return;

    // Get all symbols from database
    const allDbSymbols = await this.drizzleDb!
      .select()
      .from(universalSymbols)
      .where(eq(universalSymbols.projectId, 1));

    // Create lookup maps
    const qualifiedNameToId = new Map<string, number>();
    const nameToId = new Map<string, number>();

    for (const sym of allDbSymbols) {
      if (sym.qualifiedName) {
        qualifiedNameToId.set(sym.qualifiedName, sym.id);
      }
      nameToId.set(sym.name, sym.id);
    }

    // Resolve and update parent relationships
    const updates: Array<{ childId: number; parentId: number }> = [];

    for (const symbol of symbolsWithParents) {
      const childId = qualifiedNameToId.get(symbol.qualifiedName);
      if (!childId) continue;

      // Try to find parent by qualified name or simple name
      const parentId = qualifiedNameToId.get(symbol.parentScope) || nameToId.get(symbol.parentScope);

      if (parentId) {
        updates.push({ childId, parentId });
        this.logger.debug(`Resolved: ${symbol.qualifiedName} -> ${symbol.parentScope}`);
      }
    }

    // Batch update
    if (updates.length > 0) {
      const updateStmt = this.db!.prepare(`
        UPDATE universal_symbols 
        SET parent_symbol_id = ? 
        WHERE id = ?
      `);

      const updateMany = this.db!.transaction((updates: Array<{ childId: number; parentId: number }>) => {
        for (const { childId, parentId } of updates) {
          updateStmt.run(parentId, childId);
        }
      });

      updateMany(updates);
      this.logger.info(`Updated ${updates.length} parent-child relationships`);
    }
  }
}