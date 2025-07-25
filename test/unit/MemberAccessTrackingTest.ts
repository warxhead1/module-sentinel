import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { universalSymbols, universalRelationships } from '../../dist/database/drizzle/schema.js';

export class MemberAccessTrackingTest {
  name = 'MemberAccessTrackingTest';
  description = 'Verifies that field/member access (reads and writes) are tracked as relationships';

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const dbPath = '/home/node/.module-sentinel/development.db';
    console.log(`🔍 Running ${this.name}...`);
    console.log(`   Description: ${this.description}`);
    
    const db = new Database(dbPath);
    const drizzleDb = drizzle(db);
    
    // Test Case 1: Find functions that access struct members
    console.log('\n📊 Test Case 1: Functions accessing GenericResourceDesc members...');
    
    // First, find GenericResourceDesc struct
    const structs = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'struct'),
        eq(universalSymbols.name, 'GenericResourceDesc')
      ));
    
    this.assert(structs.length > 0, 'GenericResourceDesc struct should exist', results);
    
    if (structs.length > 0) {
      const struct = structs[0];
      
      // Find the width member
      const widthMember = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.kind, 'field'),
          eq(universalSymbols.name, 'width'),
          eq(universalSymbols.parentSymbolId, struct.id)
        ));
      
      this.assert(widthMember.length > 0, 'Width member should exist', results);
      
      if (widthMember.length > 0) {
        // Find relationships where functions read the width field
        const readRelationships = await drizzleDb.select()
          .from(universalRelationships)
          .where(and(
            eq(universalRelationships.toSymbolId, widthMember[0].id),
            eq(universalRelationships.type, 'reads_field')
          ));
        
        console.log(`   Found ${readRelationships.length} functions reading 'width' field`);
        
        // Find relationships where functions write to the width field
        const writeRelationships = await drizzleDb.select()
          .from(universalRelationships)
          .where(and(
            eq(universalRelationships.toSymbolId, widthMember[0].id),
            eq(universalRelationships.type, 'writes_field')
          ));
        
        console.log(`   Found ${writeRelationships.length} functions writing 'width' field`);
      }
    }
    
    // Test Case 2: Check ResourceDesc::ToGeneric() function for member access
    console.log('\n📊 Test Case 2: Analyzing ResourceDesc::ToGeneric() member access...');
    
    const toGenericFunctions = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'function'),
        eq(universalSymbols.name, 'ToGeneric')
      ));
    
    console.log(`   Found ${toGenericFunctions.length} ToGeneric functions`);
    
    if (toGenericFunctions.length > 0) {
      const func = toGenericFunctions[0];
      
      // This function should write to GenericResourceDesc fields
      const memberWrites = await drizzleDb.select()
        .from(universalRelationships)
        .where(and(
          eq(universalRelationships.fromSymbolId, func.id),
          eq(universalRelationships.type, 'writes_field')
        ));
      
      console.log(`   ToGeneric() writes to ${memberWrites.length} fields`);
      
      // It should write to at least some fields (type, format, width, height, etc.)
      this.assert(memberWrites.length >= 3, `ToGeneric() should write to at least 3 fields, found ${memberWrites.length}`, results);
      
      for (const write of memberWrites.slice(0, 5)) {
        const targetField = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, write.toSymbolId!));
        
        if (targetField.length > 0) {
          console.log(`     - Writes to: ${targetField[0].qualifiedName}`);
        }
      }
    }
    
    // Test Case 3: Track member access patterns
    console.log('\n📊 Test Case 3: Member access patterns...');
    
    // Find all field access relationships
    const allFieldAccess = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1)
      ))
      .limit(10);
    
    const fieldReadCount = allFieldAccess.filter(r => r.type === 'reads_field').length;
    const fieldWriteCount = allFieldAccess.filter(r => r.type === 'writes_field').length;
    
    console.log(`   Total field reads: ${fieldReadCount}`);
    console.log(`   Total field writes: ${fieldWriteCount}`);
    
    // We should have at least some field access tracked
    this.assert(fieldReadCount + fieldWriteCount > 0, 'Should track at least some field access', results);
    
    // Test Case 4: Check for member initialization in constructors
    console.log('\n📊 Test Case 4: Constructor member initialization...');
    
    const constructors = await drizzleDb.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.kind, 'constructor'))
      .limit(5);
    
    console.log(`   Found ${constructors.length} constructors`);
    
    for (const ctor of constructors) {
      const memberInits = await drizzleDb.select()
        .from(universalRelationships)
        .where(and(
          eq(universalRelationships.fromSymbolId, ctor.id),
          eq(universalRelationships.type, 'initializes_field')
        ));
      
      if (memberInits.length > 0) {
        console.log(`   ${ctor.qualifiedName} initializes ${memberInits.length} fields`);
      }
    }
    
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