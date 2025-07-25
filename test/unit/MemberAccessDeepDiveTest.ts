import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, like, or } from 'drizzle-orm';
import { universalSymbols, universalRelationships } from '../../dist/database/drizzle/schema.js';
import { OptimizedCppTreeSitterParser } from '../../dist/parsers/tree-sitter/optimized-cpp-parser.js';
import * as fs from 'fs';

export class MemberAccessDeepDiveTest {
  name = 'MemberAccessDeepDiveTest';
  description = 'Deep dive analysis of member access tracking - shows exactly what is captured at each step';

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const dbPath = '/home/node/.module-sentinel/development.db';
    console.log(`🔍 Running ${this.name}...`);
    
    const db = new Database(dbPath);
    const drizzleDb = drizzle(db);
    
    // Parse only the specific file we care about using the C++ parser directly
    console.log('📁 Parsing only RenderingTypes.ixx for focused analysis...');
    const targetFile = '/workspace/test/complex-files/ixx/RenderingTypes.ixx';
    const content = fs.readFileSync(targetFile, 'utf-8');
    
    const parser = new OptimizedCppTreeSitterParser(db, { 
      debugMode: true, 
      projectId: 1,
      languageId: 1
    });
    
    const parseResult = await parser.parseFile(targetFile, content);
    console.log(`✅ Parsed ${parseResult.symbols.length} symbols, ${parseResult.relationships.length} relationships\n`);
    
    // Only manually process relationships if we skipped indexing (single-file parsing)
    if (parseResult.relationships && parseResult.relationships.length > 0) {
      console.log(`📋 Found ${parseResult.relationships.length} relationships from parsing...`);
      
      // Check if we need to manually process (i.e., if database has minimal relationships)
      const existingRels = await drizzleDb.select().from(universalRelationships);
      
      if (existingRels.length === 0) {
        console.log(`📋 Processing relationships manually (bypassed UniversalIndexer)...`);
        
        // First get all symbols as a map for ID resolution
        const allSymbols = await drizzleDb.select().from(universalSymbols);
        const symbolMap = new Map<string, number>();
        for (const symbol of allSymbols) {
          symbolMap.set(symbol.qualifiedName, symbol.id);
        }
        
        // Manually create relationship records and insert them
        const relationshipRecords = [];
        for (const rel of parseResult.relationships) {
          const fromId = symbolMap.get(rel.fromName);
          let toId = symbolMap.get(rel.toName);
          
          // Special handling for field relationships - look for field symbols
          if (!toId && (rel.relationshipType === 'reads_field' || rel.relationshipType === 'writes_field')) {
            const memberName = rel.toName;
            for (const [key, id] of symbolMap.entries()) {
              if (key.endsWith(`::${memberName}`)) {
                const symbol = allSymbols.find(s => s.id === id);
                if (symbol && symbol.kind === 'field') {
                  toId = id;
                  break;
                }
              }
            }
          }
          
          if (fromId && toId) {
            relationshipRecords.push({
              projectId: 1,
              fromSymbolId: fromId,
              toSymbolId: toId,
              type: rel.relationshipType,
              confidence: rel.confidence || 0.8,
              contextLine: rel.lineNumber,
              contextSnippet: rel.sourceContext || `${rel.fromName} -> ${rel.toName}`,
              metadata: JSON.stringify({
                usagePattern: rel.usagePattern || 'unknown',
                crossLanguage: rel.crossLanguage || false
              })
            });
          }
        }
        
        if (relationshipRecords.length > 0) {
          await drizzleDb.insert(universalRelationships).values(relationshipRecords);
          console.log(`✅ Stored ${relationshipRecords.length} relationships in database\n`);
        } else {
          console.log(`⚠️  No relationships could be resolved (from/to symbol IDs not found)\n`);
        }
      } else {
        console.log(`✅ Using existing ${existingRels.length} relationships from UniversalIndexer\n`);
      }
    }
    
    // === STEP 1: Verify our target symbols exist ===
    console.log('\n📋 STEP 1: Verify Target Symbols');
    
    const genericResourceDesc = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.name, 'GenericResourceDesc'),
        eq(universalSymbols.kind, 'struct')
      ));
    
    console.log(`   GenericResourceDesc struct: ${genericResourceDesc.length > 0 ? '✅ FOUND' : '❌ MISSING'}`);
    if (genericResourceDesc.length > 0) {
      console.log(`   - ID: ${genericResourceDesc[0].id}`);
      console.log(`   - Qualified Name: ${genericResourceDesc[0].qualifiedName}`);
      console.log(`   - File: ${genericResourceDesc[0].filePath}`);
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
    
    console.log(`   ToGeneric function: ${toGenericFunction.length > 0 ? '✅ FOUND' : '❌ MISSING'}`);
    if (toGenericFunction.length > 0) {
      console.log(`   - ID: ${toGenericFunction[0].id}`);
      console.log(`   - Qualified Name: ${toGenericFunction[0].qualifiedName}`);
      console.log(`   - File: ${toGenericFunction[0].filePath}:${toGenericFunction[0].line}`);
    }
    
    // === STEP 2: Find all GenericResourceDesc fields ===
    console.log('\n📋 STEP 2: GenericResourceDesc Fields');
    
    if (genericResourceDesc.length > 0) {
      const fields = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.kind, 'field'),
          eq(universalSymbols.parentSymbolId, genericResourceDesc[0].id)
        ));
      
      console.log(`   Found ${fields.length} fields:`);
      for (const field of fields) {
        console.log(`   - ${field.name} (${field.returnType}) [ID: ${field.id}]`);
      }
      
      this.assert(fields.length >= 5, `Should find at least 5 fields in GenericResourceDesc, found ${fields.length}`, results);
    }
    
    // === STEP 3: Check ALL field-related relationships ===
    console.log('\n📋 STEP 3: All Field Relationships in Database');
    
    const allFieldRels = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1)
      ));
    
    const fieldWrites = allFieldRels.filter(r => r.type === 'writes_field');
    const fieldReads = allFieldRels.filter(r => r.type === 'reads_field');
    const fieldInits = allFieldRels.filter(r => r.type === 'initializes_field');
    
    console.log(`   Total relationships in DB: ${allFieldRels.length}`);
    console.log(`   Field writes: ${fieldWrites.length}`);
    console.log(`   Field reads: ${fieldReads.length}`);
    console.log(`   Field initializations: ${fieldInits.length}`);
    
    // Show first few field relationships to understand what's captured
    if (fieldWrites.length > 0) {
      console.log('\n   Sample field writes:');
      for (const rel of fieldWrites.slice(0, 3)) {
        const fromSymbol = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, rel.fromSymbolId!));
        const toSymbol = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, rel.toSymbolId!));
        
        console.log(`   - ${fromSymbol[0]?.qualifiedName || 'UNKNOWN'} -> ${toSymbol[0]?.qualifiedName || 'UNKNOWN'}`);
        console.log(`     Context: ${rel.contextSnippet || 'none'}`);
        console.log(`     Line: ${rel.contextLine || 'unknown'}`);
      }
    }
    
    // === STEP 4: Focus on ToGeneric function relationships ===
    console.log('\n📋 STEP 4: ToGeneric Function Analysis');
    
    if (toGenericFunction.length > 0) {
      const toGenericRels = await drizzleDb.select()
        .from(universalRelationships)
        .where(eq(universalRelationships.fromSymbolId, toGenericFunction[0].id));
      
      console.log(`   ToGeneric has ${toGenericRels.length} outgoing relationships:`);
      
      for (const rel of toGenericRels) {
        const toSymbol = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, rel.toSymbolId!));
        
        console.log(`   - ${rel.type}: ${toSymbol[0]?.qualifiedName || 'UNKNOWN'} (${toSymbol[0]?.kind || 'unknown'})`);
        console.log(`     Context: "${rel.contextSnippet || 'none'}"`);
        console.log(`     Line: ${rel.contextLine || 'unknown'}`);
      }
      
      const toGenericFieldWrites = toGenericRels.filter(r => r.type === 'writes_field');
      console.log(`\n   ToGeneric field writes: ${toGenericFieldWrites.length}`);
      
      this.assert(toGenericFieldWrites.length >= 3, 
        `ToGeneric should write to at least 3 fields (generic.type, generic.width, etc.), found ${toGenericFieldWrites.length}`, 
        results);
    }
    
    // === STEP 5: Debug relationship resolution ===
    console.log('\n📋 STEP 5: Relationship Resolution Debug');
    
    // Look for any relationships that mention field names we expect
    const suspectRels = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1),
        like(universalRelationships.contextSnippet, '%generic.%')
      ));
    
    console.log(`   Relationships with 'generic.' context: ${suspectRels.length}`);
    for (const rel of suspectRels) {
      const fromSymbol = await drizzleDb.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.id, rel.fromSymbolId!));
      
      console.log(`   - ${rel.type}: ${fromSymbol[0]?.qualifiedName || 'UNKNOWN'} -> toSymbolId:${rel.toSymbolId}`);
      console.log(`     Context: "${rel.contextSnippet}"`);
      console.log(`     Metadata: ${rel.metadata}`);
    }
    
    // === STEP 6: Symbol name resolution check ===
    console.log('\n📋 STEP 6: Symbol Name Resolution Check');
    
    // Check if we have symbols with names like 'type', 'width', etc.
    const commonFieldNames = ['type', 'width', 'height', 'format', 'depth'];
    for (const fieldName of commonFieldNames) {
      const symbols = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.name, fieldName),
          eq(universalSymbols.kind, 'field')
        ));
      
      console.log(`   Field '${fieldName}': ${symbols.length} symbols found`);
      for (const sym of symbols.slice(0, 2)) {
        console.log(`     - ${sym.qualifiedName} [ID: ${sym.id}]`);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   - GenericResourceDesc struct: ${genericResourceDesc.length > 0 ? 'EXISTS' : 'MISSING'}`);
    console.log(`   - ToGeneric function: ${toGenericFunction.length > 0 ? 'EXISTS' : 'MISSING'}`);
    console.log(`   - Total field relationships: ${fieldWrites.length + fieldReads.length + fieldInits.length}`);
    console.log(`   - Field writes: ${fieldWrites.length}`);
    console.log(`   - Relationships with 'generic.' context: ${suspectRels.length}`);
    
    return results;
  }
  
  private assert(condition: boolean, message: string, results: TestResult[]): void {
    if (condition) {
      results.push({
        name: message,
        status: 'passed',
        time: 0
      });
    } else {
      results.push({
        name: message,
        status: 'failed',
        time: 0,
        error: new Error(message)
      });
    }
  }
}