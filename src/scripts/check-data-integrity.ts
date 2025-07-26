#!/usr/bin/env node
/**
 * Script to check data integrity and identify missing language information
 * 
 * IMPORTANT: This file is an APPROVED EXCEPTION for using db.prepare
 * Reason: This is a diagnostic utility script that needs direct SQL access
 * to inspect database schema and data integrity. It runs outside the main
 * application context and needs to execute arbitrary diagnostic queries
 * that would be impractical to pre-define in DrizzleDatabase.
 * 
 * DO NOT use db.prepare in regular application code! Use DrizzleDatabase instead.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

async function checkDataIntegrity() {
  // Determine database path
  const nodeEnv = process.env.NODE_ENV || 'development';
  const defaultDbPath = path.join(os.homedir(), '.module-sentinel', `${nodeEnv}.db`);
  const dbPath = process.env.DB_PATH || process.env.DEV_DB || defaultDbPath;
  
  console.log(`📊 Checking database: ${dbPath}\n`);
  
  const db = new Database(dbPath);
  
  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON');
  
  // 1. Check if languages table exists and has data
  console.log('🔍 Checking languages table...');
  try {
    const langCount = db.prepare('SELECT COUNT(*) as count FROM languages').get() as { count: number };
    const langs = db.prepare('SELECT * FROM languages').all();
    
    console.log(`✅ Languages table exists with ${langCount.count} languages:`);
    langs.forEach((lang: any) => {
      console.log(`   - ${lang.display_name} (id: ${lang.id})`);
    });
  } catch (error) {
    console.error('❌ Languages table error:', error);
  }
  
  // 2. Check symbols with missing language_id
  console.log('\n🔍 Checking symbols with missing language references...');
  const orphanedSymbols = db.prepare(`
    SELECT COUNT(*) as count 
    FROM universal_symbols 
    WHERE language_id NOT IN (SELECT id FROM languages)
  `).get() as { count: number };
  
  if (orphanedSymbols.count > 0) {
    console.warn(`⚠️  Found ${orphanedSymbols.count} symbols with invalid language_id`);
    
    // Show sample of orphaned symbols
    const samples = db.prepare(`
      SELECT id, name, file_path, language_id 
      FROM universal_symbols 
      WHERE language_id NOT IN (SELECT id FROM languages)
      LIMIT 5
    `).all();
    
    console.log('   Sample orphaned symbols:');
    samples.forEach((sym: any) => {
      console.log(`   - ${sym.name} (id: ${sym.id}, language_id: ${sym.language_id}, file: ${sym.file_path})`);
    });
  } else {
    console.log('✅ All symbols have valid language references');
  }
  
  // 3. Check relationships data structure
  console.log('\n🔍 Checking relationships data...');
  const relCount = db.prepare('SELECT COUNT(*) as count FROM universal_relationships').get() as { count: number };
  console.log(`📊 Total relationships: ${relCount.count}`);
  
  // Sample a relationship to check structure
  if (relCount.count > 0) {
    const sampleRel = db.prepare(`
      SELECT r.*, 
        s1.language_id as from_lang_id,
        s2.language_id as to_lang_id,
        l1.name as from_language,
        l2.name as to_language
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      LEFT JOIN languages l1 ON s1.language_id = l1.id
      LEFT JOIN languages l2 ON s2.language_id = l2.id
      LIMIT 1
    `).get() as any;
    
    console.log('   Sample relationship structure:');
    console.log(`   - Type: ${sampleRel?.type}`);
    console.log(`   - From language: ${sampleRel?.from_language || 'NULL'} (id: ${sampleRel?.from_lang_id})`);
    console.log(`   - To language: ${sampleRel?.to_language || 'NULL'} (id: ${sampleRel?.to_lang_id})`);
  }
  
  // 4. Check cross-language relationships
  console.log('\n🔍 Checking cross-language relationships...');
  const crossLangRels = db.prepare(`
    SELECT 
      l1.name as from_language,
      l2.name as to_language,
      COUNT(*) as count
    FROM universal_relationships r
    JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
    JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
    LEFT JOIN languages l1 ON s1.language_id = l1.id
    LEFT JOIN languages l2 ON s2.language_id = l2.id
    WHERE l1.id != l2.id OR (l1.id IS NULL OR l2.id IS NULL)
    GROUP BY l1.name, l2.name
    ORDER BY count DESC
  `).all();
  
  if (crossLangRels.length > 0) {
    console.log('✅ Found cross-language relationships:');
    crossLangRels.forEach((rel: any) => {
      console.log(`   - ${rel.from_language || 'NULL'} → ${rel.to_language || 'NULL'}: ${rel.count} relationships`);
    });
  } else {
    console.log('ℹ️  No cross-language relationships found');
  }
  
  // 5. Test the API query directly
  console.log('\n🔍 Testing API query for relationships...');
  try {
    const apiResult = db.prepare(`
      SELECT r.*, 
        s1.name as from_name, s1.qualified_name as from_qualified_name,
        s1.kind as from_kind, s1.namespace as from_namespace,
        l1.name as from_language,
        s2.name as to_name, s2.qualified_name as to_qualified_name,
        s2.kind as to_kind, s2.namespace as to_namespace,
        l2.name as to_language
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      LEFT JOIN languages l1 ON s1.language_id = l1.id
      LEFT JOIN languages l2 ON s2.language_id = l2.id
      LIMIT 3
    `).all();
    
    console.log(`✅ API query returns ${apiResult.length} relationships`);
    if (apiResult.length > 0) {
      console.log('   First relationship:');
      const first = apiResult[0] as any;
      console.log(`   - ${first.from_name} (${first.from_language || 'NO_LANG'}) → ${first.to_name} (${first.to_language || 'NO_LANG'})`);
    }
  } catch (error) {
    console.error('❌ API query failed:', error);
  }
  
  // 6. Summary and recommendations
  console.log('\n📊 Summary:');
  const hasLanguages = db.prepare('SELECT COUNT(*) as count FROM languages').get() as { count: number };
  const hasValidRefs = orphanedSymbols.count === 0;
  
  if (hasLanguages.count === 0) {
    console.log('❌ No languages in database - run: npm run db:seed-languages');
  } else if (!hasValidRefs) {
    console.log('⚠️  Some symbols have invalid language references - run: npm run rebuild-index');
  } else {
    console.log('✅ Database integrity looks good!');
  }
  
  db.close();
}

// Run the script
checkDataIntegrity().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});