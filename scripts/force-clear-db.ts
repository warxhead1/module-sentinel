#!/usr/bin/env tsx
/**
 * Force clear all database files and create fresh database
 * This completely removes existing database files before creating fresh ones
 */
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/database/drizzle/schema.js";
import { DatabaseConfig } from "../src/config/database-config.js";
import { DatabaseInitializer } from "../src/database/database-initializer.js";

async function forceClearDatabase() {
  console.log("🧹 Force Clearing Database");
  console.log("=".repeat(50));

  // Use the same config as the server
  const dbConfig = DatabaseConfig.getInstance();
  const dbPath = dbConfig.getDbPath();
  const dbDir = path.dirname(dbPath);
  
  console.log(`🗄️  Using database config:`);
  dbConfig.logConfig();
  console.log("=".repeat(50));

  // Clear database files (including WAL and SHM files)
  const dbFiles = [
    dbPath,
    dbPath + "-shm", 
    dbPath + "-wal"
  ];

  console.log("🗑️  Removing existing database files...");
  for (const dbFile of dbFiles) {
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
      console.log(`   ✅ Removed: ${dbFile}`);
    }
  }

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  console.log(`📊 Creating fresh database: ${dbPath}`);

  // Use DatabaseInitializer to ensure all migrations run properly
  const dbInitializer = DatabaseInitializer.getInstance();
  const sqliteDb = await dbInitializer.initializeDatabase(dbPath);

  const db = drizzle(sqliteDb, { schema });

  try {
    console.log("✅ Database initialized with all migrations");

    // Add initial languages
    console.log("\n📚 Adding supported languages...");
    const languages = [
      { name: "cpp", displayName: "C++", extensions: JSON.stringify([".cpp", ".hpp", ".h", ".cc", ".cxx", ".ixx"]), parserClass: "CppLanguageParser" },
      { name: "python", displayName: "Python", extensions: JSON.stringify([".py", ".pyx", ".pyi"]), parserClass: "PythonLanguageParser" },
      { name: "typescript", displayName: "TypeScript", extensions: JSON.stringify([".ts", ".tsx"]), parserClass: "TypeScriptLanguageParser" },
      { name: "javascript", displayName: "JavaScript", extensions: JSON.stringify([".js", ".jsx", ".mjs"]), parserClass: "JavaScriptLanguageParser" },
      { name: "go", displayName: "Go", extensions: JSON.stringify([".go"]), parserClass: "GoLanguageParser" },
      { name: "java", displayName: "Java", extensions: JSON.stringify([".java"]), parserClass: "JavaLanguageParser" },
    ];

    const insertLanguage = sqliteDb.prepare(`
      INSERT OR IGNORE INTO languages (name, display_name, extensions, parser_class, is_enabled, priority)
      VALUES (?, ?, ?, ?, 1, 100)
    `);

    for (const lang of languages) {
      insertLanguage.run(lang.name, lang.displayName, lang.extensions, lang.parserClass);
      console.log(`   ✅ Added language: ${lang.displayName}`);
    }

    console.log("\n🎉 Database force-cleared and initialized successfully!");
    console.log(`📍 Location: ${dbPath}`);
    
    // Test the database
    const languageCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM languages").get() as { count: number };
    console.log(`🔍 Verification: ${languageCount.count} languages installed`);

  } catch (error) {
    console.error("❌ Failed to create fresh database:", error);
    process.exit(1);
  } finally {
    sqliteDb.close();
  }
}

forceClearDatabase().catch(console.error);