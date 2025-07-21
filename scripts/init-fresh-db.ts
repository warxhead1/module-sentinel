#!/usr/bin/env tsx
/**
 * Initialize fresh databases for development and production
 * This creates clean databases with all required tables using Drizzle ORM
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseConfig } from '../src/config/database-config.js';
import * as schema from '../src/database/drizzle/schema.js';

async function initFreshDatabase() {
  const dbConfig = DatabaseConfig.getInstance();
  const env = dbConfig.getEnv();
  const dbPath = dbConfig.getDbPath();
  
  console.log('🗄️  Database Initialization');
  console.log('=' .repeat(50));
  dbConfig.logConfig();
  console.log('=' .repeat(50));

  // Ask for confirmation if database exists
  if (fs.existsSync(dbPath)) {
    console.log(`\n⚠️  WARNING: Database already exists at ${dbPath}`);
    console.log('This will DELETE all existing data!');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      readline.question('Continue? (yes/no): ', resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Initialization cancelled');
      process.exit(0);
    }
    
    // Clean existing database
    await dbConfig.cleanDatabase();
  }

  console.log(`\n📋 Creating fresh ${env} database...`);
  
  // Create new database
  const sqliteDb = new Database(dbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON');
  
  const db = drizzle(sqliteDb, { schema });
  
  try {
    // Run Drizzle migrations
    const migrationsPath = path.join(process.cwd(), 'src/database/drizzle/migrations');
    
    if (fs.existsSync(migrationsPath)) {
      console.log('\n🔄 Running Drizzle migrations...');
      migrate(db, { migrationsFolder: migrationsPath });
      console.log('✅ Migrations completed');
    } else {
      console.log('\n⚠️  No migrations folder found, database tables will be created by Drizzle on first use');
    }
    
    // Add initial data
    console.log('\n📊 Adding initial data...');
    
    // Add default languages
    const languages = [
      { 
        name: 'cpp', 
        displayName: 'C++', 
        extensions: ['.cpp', '.hpp', '.h', '.cc', '.cxx', '.ixx'],
        parserClass: 'TreeSitterCppParser',
        features: ['templates', 'modules', 'concepts', 'coroutines']
      },
      { 
        name: 'python', 
        displayName: 'Python', 
        extensions: ['.py', '.pyi'],
        parserClass: 'TreeSitterPythonParser',
        features: ['type_hints', 'async', 'decorators']
      },
      { 
        name: 'typescript', 
        displayName: 'TypeScript', 
        extensions: ['.ts', '.tsx'],
        parserClass: 'TreeSitterTypeScriptParser',
        features: ['generics', 'decorators', 'jsx']
      },
      { 
        name: 'javascript', 
        displayName: 'JavaScript', 
        extensions: ['.js', '.jsx', '.mjs'],
        parserClass: 'TreeSitterJavaScriptParser',
        features: ['async', 'modules', 'jsx']
      },
      { 
        name: 'rust', 
        displayName: 'Rust', 
        extensions: ['.rs'],
        parserClass: 'TreeSitterRustParser',
        features: ['lifetimes', 'traits', 'macros']
      },
      { 
        name: 'go', 
        displayName: 'Go', 
        extensions: ['.go'],
        parserClass: 'TreeSitterGoParser',
        features: ['goroutines', 'interfaces', 'channels']
      }
    ];
    
    const insertedLanguages = await db.insert(schema.languages)
      .values(languages)
      .returning();
    
    console.log(`   ✅ Added ${insertedLanguages.length} languages`);
    
    // Add default project for development
    if (env === 'development') {
      const testProjectPath = path.join(process.cwd(), 'test/complex-files');
      
      if (fs.existsSync(testProjectPath)) {
        const insertedProject = await db.insert(schema.projects)
          .values({
            name: 'test-complex-files',
            displayName: 'Test Complex Files',
            description: 'Complex C++ test files for Module Sentinel development',
            rootPath: testProjectPath,
            isActive: true
          })
          .returning();
        
        console.log('   ✅ Added development test project');
        
        // Link C++ language to the test project
        const cppLang = insertedLanguages.find(l => l.name === 'cpp');
        if (cppLang && insertedProject[0]) {
          await db.insert(schema.projectLanguages)
            .values({
              projectId: insertedProject[0].id,
              languageId: cppLang.id,
              isPrimary: true
            });
          console.log('   ✅ Linked C++ language to test project');
        }
      }
    }
    
    // Verify tables
    console.log('\n📋 Verifying database structure...');
    const tables = sqliteDb.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `).all() as Array<{ name: string }>;
    
    console.log(`   Found ${tables.length} tables:`);
    tables.forEach(t => console.log(`     - ${t.name}`));
    
    // Show summary using raw SQL for simplicity
    const stats = {
      languages: sqliteDb.prepare('SELECT COUNT(*) as count FROM languages').get() as { count: number },
      projects: sqliteDb.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number },
      symbols: sqliteDb.prepare('SELECT COUNT(*) as count FROM universal_symbols').get() as { count: number }
    };
    
    console.log('\n📊 Database Summary:');
    console.log(`   Languages: ${stats.languages.count}`);
    console.log(`   Projects: ${stats.projects.count}`);
    console.log(`   Symbols: ${stats.symbols.count}`);
    
    console.log(`\n✅ ${env} database initialized successfully!`);
    console.log(`   Path: ${dbPath}`);
    
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    sqliteDb.close();
  }
}

// Run if called directly
if (require.main === module) {
  initFreshDatabase().catch(console.error);
}