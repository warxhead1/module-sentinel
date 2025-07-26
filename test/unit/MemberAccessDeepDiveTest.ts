import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, like, or } from 'drizzle-orm';
import { universalSymbols, universalRelationships } from '../../dist/database/drizzle/schema.js';
import { OptimizedCppTreeSitterParser } from '../../dist/parsers/tree-sitter/optimized-cpp-parser.js';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTest } from '../helpers/BaseTest.js';

export class MemberAccessDeepDiveTest extends BaseTest {
  constructor(db: Database.Database) {
    super('MemberAccessDeepDiveTest', db);
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    results.push(await this.runTest('member_access_deep_dive', async () => {
      await this.testMemberAccessDeepDive();
    }));

    return results;
  }

  private async testMemberAccessDeepDive(): Promise<void> {
    const drizzleDb = drizzle(this.db);
    
    // Parse only the specific file we care about using the C++ parser directly
    this.log('Parsing only RenderingTypes.ixx for focused analysis...');
    const targetFile = path.join(process.cwd(), 'test/complex-files/ixx/RenderingTypes.ixx');
    
    // Check if file exists before trying to read it
    if (!fs.existsSync(targetFile)) {
      this.warn(`File not found: ${targetFile}, skipping parse step`);
    } else {
      const content = fs.readFileSync(targetFile, 'utf-8');
      
      const parser = new OptimizedCppTreeSitterParser(this.db, { 
        debugMode: false, 
        projectId: 1,
        languageId: 1
      });
      
      await parser.initialize();
      const parseResult = await parser.parseFile(targetFile, content);
      this.log(`Parsed ${parseResult.symbols.length} symbols, ${parseResult.relationships.length} relationships`);
    }
    
    // Since we're working with indexed data, we don't need to manually process relationships
    
    // === STEP 1: Verify our target symbols exist ===
    this.log('STEP 1: Verify Target Symbols');
    
    const genericResourceDesc = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.name, 'GenericResourceDesc'),
        eq(universalSymbols.kind, 'struct')
      ));
    
    this.log(`GenericResourceDesc struct: ${genericResourceDesc.length > 0 ? 'FOUND' : 'MISSING'}`);
    if (genericResourceDesc.length > 0) {
      this.log(`- ID: ${genericResourceDesc[0].id}`);
      this.log(`- Qualified Name: ${genericResourceDesc[0].qualifiedName}`);
      this.log(`- File: ${genericResourceDesc[0].filePath}`);
    }
    
    const toGenericFunction = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.name, 'ToGeneric'),
        or(
          eq(universalSymbols.kind, 'function'),
          eq(universalSymbols.kind, 'method')
        )
      ));
    
    this.log(`ToGeneric function: ${toGenericFunction.length > 0 ? 'FOUND' : 'MISSING'}`);
    if (toGenericFunction.length > 0) {
      this.log(`- ID: ${toGenericFunction[0].id}`);
      this.log(`- Qualified Name: ${toGenericFunction[0].qualifiedName}`);
      this.log(`- File: ${toGenericFunction[0].filePath}:${toGenericFunction[0].line}`);
    }
    
    // === STEP 2: Find all GenericResourceDesc fields ===
    this.log('STEP 2: GenericResourceDesc Fields');
    
    if (genericResourceDesc.length > 0) {
      const fields = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.kind, 'field'),
          eq(universalSymbols.parentSymbolId, genericResourceDesc[0].id)
        ));
      
      this.log(`Found ${fields.length} fields:`);
      for (const field of fields) {
        this.log(`- ${field.name} (${field.returnType}) [ID: ${field.id}]`);
      }
      
      this.assertAtLeast(fields.length, 5, `Should find at least 5 fields in GenericResourceDesc, found ${fields.length}`);
    }
    
    // === STEP 3: Check ALL field-related relationships ===
    this.log('STEP 3: All Field Relationships in Database');
    
    const allFieldRels = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1)
      ));
    
    const fieldWrites = allFieldRels.filter(r => r.type === 'writes_field');
    const fieldReads = allFieldRels.filter(r => r.type === 'reads_field');
    const fieldInits = allFieldRels.filter(r => r.type === 'initializes_field');
    
    this.log(`Total relationships in DB: ${allFieldRels.length}`);
    this.log(`Field writes: ${fieldWrites.length}`);
    this.log(`Field reads: ${fieldReads.length}`);
    this.log(`Field initializations: ${fieldInits.length}`);
    
    // Show first few field relationships to understand what's captured
    if (fieldWrites.length > 0) {
      this.log('Sample field writes:');
      for (const rel of fieldWrites.slice(0, 3)) {
        const fromSymbol = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, rel.fromSymbolId!));
        const toSymbol = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, rel.toSymbolId!));
        
        this.log(`- ${fromSymbol[0]?.qualifiedName || 'UNKNOWN'} -> ${toSymbol[0]?.qualifiedName || 'UNKNOWN'}`);
        this.log(`  Context: ${rel.contextSnippet || 'none'}`);
        this.log(`  Line: ${rel.contextLine || 'unknown'}`);
      }
    }
    
    // === STEP 4: Focus on ToGeneric function relationships ===
    this.log('STEP 4: ToGeneric Function Analysis');
    
    if (toGenericFunction.length > 0) {
      const toGenericRels = await drizzleDb.select()
        .from(universalRelationships)
        .where(eq(universalRelationships.fromSymbolId, toGenericFunction[0].id));
      
      this.log(`ToGeneric has ${toGenericRels.length} outgoing relationships:`);
      
      for (const rel of toGenericRels) {
        const toSymbol = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, rel.toSymbolId!));
        
        this.log(`- ${rel.type}: ${toSymbol[0]?.qualifiedName || 'UNKNOWN'} (${toSymbol[0]?.kind || 'unknown'})`);
        this.log(`  Context: "${rel.contextSnippet || 'none'}"`);
        this.log(`  Line: ${rel.contextLine || 'unknown'}`);
      }
      
      const toGenericFieldWrites = toGenericRels.filter(r => r.type === 'writes_field');
      this.log(`ToGeneric field writes: ${toGenericFieldWrites.length}`);
      
      this.assertAtLeast(toGenericFieldWrites.length, 3, 
        `ToGeneric should write to at least 3 fields (generic.type, generic.width, etc.), found ${toGenericFieldWrites.length}`);
    }
    
    // === STEP 5: Debug relationship resolution ===
    this.log('STEP 5: Relationship Resolution Debug');
    
    // Look for any relationships that mention field names we expect
    const suspectRels = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1),
        like(universalRelationships.contextSnippet, '%generic.%')
      ));
    
    this.log(`Relationships with 'generic.' context: ${suspectRels.length}`);
    for (const rel of suspectRels.slice(0, 3)) {
      const fromSymbol = await drizzleDb.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.id, rel.fromSymbolId!));
      
      this.log(`- ${rel.type}: ${fromSymbol[0]?.qualifiedName || 'UNKNOWN'} -> toSymbolId:${rel.toSymbolId}`);
      this.log(`  Context: "${rel.contextSnippet}"`);
      this.log(`  Metadata: ${rel.metadata}`);
    }
    
    // === STEP 6: Symbol name resolution check ===
    this.log('STEP 6: Symbol Name Resolution Check');
    
    // Check if we have symbols with names like 'type', 'width', etc.
    const commonFieldNames = ['type', 'width', 'height', 'format', 'depth'];
    for (const fieldName of commonFieldNames) {
      const symbols = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.name, fieldName),
          eq(universalSymbols.kind, 'field')
        ));
      
      this.log(`Field '${fieldName}': ${symbols.length} symbols found`);
      for (const sym of symbols.slice(0, 2)) {
        this.log(`- ${sym.qualifiedName} [ID: ${sym.id}]`);
      }
    }
    
    this.log('Summary:');
    this.log(`- GenericResourceDesc struct: ${genericResourceDesc.length > 0 ? 'EXISTS' : 'MISSING'}`);
    this.log(`- ToGeneric function: ${toGenericFunction.length > 0 ? 'EXISTS' : 'MISSING'}`);
    this.log(`- Total field relationships: ${fieldWrites.length + fieldReads.length + fieldInits.length}`);
    this.log(`- Field writes: ${fieldWrites.length}`);
    this.log(`- Relationships with 'generic.' context: ${suspectRels.length}`);
  }
}