#!/usr/bin/env node
/**
 * Script to seed the languages table with supported languages
 * This ensures language data is available for relationship visualization
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { languages } from '../database/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as os from 'os';

const SUPPORTED_LANGUAGES = [
  {
    name: 'cpp',
    displayName: 'C++',
    parserClass: 'CppTreeSitterParser',
    extensions: ['.cpp', '.cxx', '.cc', '.c++', '.hpp', '.hxx', '.h++', '.h', '.ixx', '.cppm'],
    features: ['templates', 'namespaces', 'classes', 'pointers', 'references'],
    priority: 100
  },
  {
    name: 'python',
    displayName: 'Python',
    parserClass: 'PythonLanguageParser',
    extensions: ['.py', '.pyx', '.pyi', '.pyw'],
    features: ['async', 'generators', 'decorators', 'type_hints'],
    priority: 100
  },
  {
    name: 'typescript',
    displayName: 'TypeScript',
    parserClass: 'TypeScriptLanguageParser',
    extensions: ['.ts', '.tsx'],
    features: ['generics', 'interfaces', 'decorators', 'jsx'],
    priority: 100
  },
  {
    name: 'javascript',
    displayName: 'JavaScript',
    parserClass: 'JavaScriptLanguageParser',
    extensions: ['.js', '.jsx', '.mjs'],
    features: ['async', 'modules', 'jsx'],
    priority: 90
  },
  {
    name: 'go',
    displayName: 'Go',
    parserClass: 'GoLanguageParser',
    extensions: ['.go'],
    features: ['goroutines', 'channels', 'interfaces'],
    priority: 95
  },
  {
    name: 'java',
    displayName: 'Java',
    parserClass: 'JavaLanguageParser',
    extensions: ['.java'],
    features: ['classes', 'interfaces', 'generics', 'annotations'],
    priority: 90
  },
  {
    name: 'csharp',
    displayName: 'C#',
    parserClass: 'CSharpLanguageParser',
    extensions: ['.cs'],
    features: ['async', 'linq', 'properties', 'events'],
    priority: 90
  }
];

async function seedLanguages() {
  // Determine database path
  const nodeEnv = process.env.NODE_ENV || 'development';
  const defaultDbPath = path.join(os.homedir(), '.module-sentinel', `${nodeEnv}.db`);
  const dbPath = process.env.DB_PATH || process.env.DEV_DB || defaultDbPath;
  
  console.log(`📊 Using database: ${dbPath}`);
  
  // Open database
  const sqliteDb = new Database(dbPath);
  const db = drizzle(sqliteDb);
  
  console.log('🌐 Seeding languages table...');
  
  let inserted = 0;
  let updated = 0;
  
  for (const lang of SUPPORTED_LANGUAGES) {
    try {
      // Check if language exists
      const existing = await db
        .select()
        .from(languages)
        .where(eq(languages.name, lang.name))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing language
        await db
          .update(languages)
          .set({
            displayName: lang.displayName,
            parserClass: lang.parserClass,
            extensions: lang.extensions,
            features: lang.features,
            priority: lang.priority,
            isEnabled: true
          })
          .where(eq(languages.name, lang.name));
        
        updated++;
        console.log(`✅ Updated language: ${lang.displayName}`);
      } else {
        // Insert new language
        await db
          .insert(languages)
          .values({
            name: lang.name,
            displayName: lang.displayName,
            parserClass: lang.parserClass,
            extensions: lang.extensions,
            features: lang.features,
            isEnabled: true,
            priority: lang.priority
          });
        
        inserted++;
        console.log(`✅ Inserted language: ${lang.displayName}`);
      }
    } catch (error) {
      console.error(`❌ Failed to process language ${lang.name}:`, error);
    }
  }
  
  console.log(`\n📊 Language seeding complete:`);
  console.log(`   - Inserted: ${inserted} languages`);
  console.log(`   - Updated: ${updated} languages`);
  
  // Verify languages are properly linked
  const symbolsWithoutLanguage = sqliteDb.prepare(`
    SELECT COUNT(*) as count 
    FROM universal_symbols 
    WHERE language_id NOT IN (SELECT id FROM languages)
  `).get() as { count: number };
  
  if (symbolsWithoutLanguage.count > 0) {
    console.warn(`\n⚠️  Found ${symbolsWithoutLanguage.count} symbols with invalid language_id`);
    console.log('   Run "npm run rebuild-index" to fix this issue');
  }
  
  // Show current language statistics
  const langStats = sqliteDb.prepare(`
    SELECT l.display_name, COUNT(s.id) as symbol_count
    FROM languages l
    LEFT JOIN universal_symbols s ON l.id = s.language_id
    GROUP BY l.id, l.display_name
    ORDER BY symbol_count DESC
  `).all() as Array<{ display_name: string; symbol_count: number }>;
  
  console.log('\n📊 Current language statistics:');
  langStats.forEach(stat => {
    console.log(`   - ${stat.display_name}: ${stat.symbol_count} symbols`);
  });
  
  sqliteDb.close();
}

// Run the script
seedLanguages().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});