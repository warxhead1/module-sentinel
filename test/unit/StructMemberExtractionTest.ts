import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { universalSymbols } from '../../dist/database/drizzle/schema.js';

export class StructMemberExtractionTest {
  name = 'StructMemberExtractionTest';
  description = 'Verifies that struct/class members are properly extracted and linked to parent symbols';

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    // Use the database that was already created by the test runner
    const dbPath = '/home/node/.module-sentinel/development.db';
    console.log(`🔍 Running ${this.name}...`);
    console.log(`   Description: ${this.description}`);
    console.log(`   Database: ${dbPath}`);
    
    const db = new Database(dbPath);
    const drizzleDb = drizzle(db);
    
    // Query for the GenericResourceDesc struct
    console.log('🔍 Searching for GenericResourceDesc struct...');
    
    const structs = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'struct'),
        eq(universalSymbols.name, 'GenericResourceDesc')
      ));
    
    this.assert(structs.length > 0, 'GenericResourceDesc struct should be found', results);
    
    if (structs.length > 0) {
      const struct = structs[0];
      console.log(`✅ Found struct: ${struct.qualifiedName} at line ${struct.line}`);
      
      // Check language features
      if (struct.languageFeatures) {
        const features = typeof struct.languageFeatures === 'string' 
          ? JSON.parse(struct.languageFeatures) 
          : struct.languageFeatures;
        console.log(`   Members in language features: ${features.members?.length || 0}`);
      }
      
      // Query for members with parent relationship
      const members = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.kind, 'field'),
          eq(universalSymbols.parentSymbolId, struct.id)
        ));
      
      console.log(`\n📋 Found ${members.length} members with parent relationship:`);
      
      // Expected members based on RenderingTypes.ixx
      const expectedMembers = [
        { name: 'usage', type: 'BufferUsage' },
        { name: 'textureFormat', type: 'RGFormat' },
        { name: 'dimension', type: 'TextureDimension' },
        { name: 'width', type: 'int' },
        { name: 'height', type: 'int' },
        { name: 'depthOrArrayLayers', type: 'int' },
        { name: 'mipLevelCount', type: 'int' },
        { name: 'sampleCount', type: 'int' },
        { name: 'baseMipLevel', type: 'int' },
        { name: 'baseArrayLayer', type: 'int' },
        { name: 'arrayLayerCount', type: 'std::optional<int>' }
      ];
      
      for (const member of members) {
        console.log(`   - ${member.name} (type: ${member.returnType}) at line ${member.line}`);
        if (member.languageFeatures) {
          const features = typeof member.languageFeatures === 'string'
            ? JSON.parse(member.languageFeatures)
            : member.languageFeatures;
          if (features.defaultValue) {
            console.log(`     Default: ${features.defaultValue}`);
          }
          if (features.memberType) {
            console.log(`     Member type: ${features.memberType}`);
          }
        }
      }
      
      // Verify we found at least some expected members
      this.assert(members.length >= 5, `Should find at least 5 members, found ${members.length}`, results);
      
      // Check if specific members exist
      const widthMember = members.find(m => m.name === 'width');
      this.assert(widthMember !== undefined, 'Should find width member', results);
      if (widthMember) {
        this.assert(widthMember.returnType === 'uint32_t', 'Width should be of type uint32_t', results);
      }
      
      const typeMember = members.find(m => m.name === 'type');
      this.assert(typeMember !== undefined, 'Should find type member', results);
      if (typeMember) {
        this.assert(typeMember.returnType === 'ResourceSystemType', 'Type should be ResourceSystemType', results);
      }
      
      // Also check for orphan field symbols (fields without parent relationship)
      const allFields = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.kind, 'field'),
          eq(universalSymbols.filePath, '/workspace/test/complex-files/ixx/RenderingTypes.ixx')
        ));
      
      console.log(`\n🔍 Total field symbols in RenderingTypes.ixx: ${allFields.length}`);
      
      // Check parent scope resolution
      const fieldsWithParentScope = allFields.filter(f => f.parentScope === struct.qualifiedName);
      console.log(`   Fields with correct parentScope: ${fieldsWithParentScope.length}`);
      
      // Debug: Show first few field symbols to understand what's happening
      if (allFields.length > 0) {
        console.log('\n🔍 Sample field symbols:');
        for (const field of allFields.slice(0, 5)) {
          console.log(`   - ${field.qualifiedName} (parentScope: ${field.parentScope || 'none'}, parentSymbolId: ${field.parentSymbolId || 'none'})`);
        }
      }
      
      if (members.length === 0 && fieldsWithParentScope.length > 0) {
        console.log('\n⚠️  Fields have parentScope but parentSymbolId not resolved!');
        console.log('   This suggests the parent resolution logic needs attention.');
      }
    }
    
    // Also check TextureView struct at line 149
    console.log('\n🔍 Checking TextureView struct (extends GenericResourceDesc)...');
    
    const textureViews = await drizzleDb.select()
      .from(universalSymbols)
      .where(and(
        eq(universalSymbols.kind, 'struct'),
        eq(universalSymbols.name, 'TextureView')
      ));
    
    if (textureViews.length > 0) {
      const textureView = textureViews[0];
      console.log(`✅ Found struct: ${textureView.qualifiedName} at line ${textureView.line}`);
      
      // Check for additional members
      const textureViewMembers = await drizzleDb.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.kind, 'field'),
          eq(universalSymbols.parentSymbolId, textureView.id)
        ));
      
      console.log(`   Members: ${textureViewMembers.length}`);
      for (const member of textureViewMembers) {
        console.log(`   - ${member.name} (type: ${member.returnType})`);
      }
    }
    
    // Return results
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