import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { universalSymbols, universalRelationships } from '../../dist/database/drizzle/schema.js';
import { BaseTest } from '../helpers/BaseTest.js';

export class MemberAccessTrackingTest extends BaseTest {
  constructor(db: Database.Database) {
    super('MemberAccessTrackingTest', db);
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    results.push(await this.runTest('member_access_tracking', async () => {
      await this.testMemberAccessTracking();
    }));

    return results;
  }

  private async testMemberAccessTracking(): Promise<void> {
    const drizzleDb = drizzle(this.db);
    
    // Test Case 1: Find functions that access struct members
    this.log('Test Case 1: Functions accessing GenericResourceDesc members...');
    
    // First, find GenericResourceDesc struct
    const structs = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'struct'),
        eq(universalSymbols.name, 'GenericResourceDesc')
      ));
    
    this.assert(structs.length > 0, 'GenericResourceDesc struct should exist');
    
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
      
      this.assert(widthMember.length > 0, 'Width member should exist');
      
      if (widthMember.length > 0) {
        // Find relationships where functions read the width field
        const readRelationships = await drizzleDb.select()
          .from(universalRelationships)
          .where(and(
            eq(universalRelationships.toSymbolId, widthMember[0].id),
            eq(universalRelationships.type, 'reads_field')
          ));
        
        this.log(`Found ${readRelationships.length} functions reading 'width' field`);
        
        // Find relationships where functions write to the width field
        const writeRelationships = await drizzleDb.select()
          .from(universalRelationships)
          .where(and(
            eq(universalRelationships.toSymbolId, widthMember[0].id),
            eq(universalRelationships.type, 'writes_field')
          ));
        
        this.log(`Found ${writeRelationships.length} functions writing 'width' field`);
      }
    }
    
    // Test Case 2: Check ResourceDesc::ToGeneric() function for member access
    this.log('Test Case 2: Analyzing ResourceDesc::ToGeneric() member access...');
    
    const toGenericFunctions = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'function'),
        eq(universalSymbols.name, 'ToGeneric')
      ));
    
    this.log(`Found ${toGenericFunctions.length} ToGeneric functions`);
    
    if (toGenericFunctions.length > 0) {
      const func = toGenericFunctions[0];
      
      // This function should write to GenericResourceDesc fields
      const memberWrites = await drizzleDb.select()
        .from(universalRelationships)
        .where(and(
          eq(universalRelationships.fromSymbolId, func.id),
          eq(universalRelationships.type, 'writes_field')
        ));
      
      this.log(`ToGeneric() writes to ${memberWrites.length} fields`);
      
      // It should write to at least some fields (type, format, width, height, etc.)
      this.assertAtLeast(memberWrites.length, 3, `ToGeneric() should write to at least 3 fields, found ${memberWrites.length}`);
      
      for (const write of memberWrites.slice(0, 5)) {
        const targetField = await drizzleDb.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.id, write.toSymbolId!));
        
        if (targetField.length > 0) {
          this.log(`- Writes to: ${targetField[0].qualifiedName}`);
        }
      }
    }
    
    // Test Case 3: Track member access patterns
    this.log('Test Case 3: Member access patterns...');
    
    // Find all field access relationships  
    const fieldReads = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1),
        eq(universalRelationships.type, 'reads_field')
      ))
      .limit(100);

    const fieldWrites = await drizzleDb.select()
      .from(universalRelationships)
      .where(and(
        eq(universalRelationships.projectId, 1),
        eq(universalRelationships.type, 'writes_field')
      ))
      .limit(100);
    
    const fieldReadCount = fieldReads.length;
    const fieldWriteCount = fieldWrites.length;
    
    this.log(`Total field reads: ${fieldReadCount}`);
    this.log(`Total field writes: ${fieldWriteCount}`);
    
    // We should have at least some field access tracked
    this.assert(fieldReadCount + fieldWriteCount > 0, 'Should track at least some field access');
    
    // Test Case 4: Check for member initialization in constructors
    this.log('Test Case 4: Constructor member initialization...');
    
    const constructors = await drizzleDb.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.kind, 'constructor'))
      .limit(5);
    
    this.log(`Found ${constructors.length} constructors`);
    
    for (const ctor of constructors) {
      const memberInits = await drizzleDb.select()
        .from(universalRelationships)
        .where(and(
          eq(universalRelationships.fromSymbolId, ctor.id),
          eq(universalRelationships.type, 'initializes_field')
        ));
      
      if (memberInits.length > 0) {
        this.log(`${ctor.qualifiedName} initializes ${memberInits.length} fields`);
      }
    }
  }
}