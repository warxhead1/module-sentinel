#!/usr/bin/env tsx

import { ModuleSentinelMCPServer } from "../src/index.js";
import * as dotenv from "dotenv";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

async function initializeDatabase(dbPath: string) {
  console.log("🗃️  Initializing database schema and seed data...");

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  try {
    // Create tables manually
    console.log("  🔧 Creating core tables...");

    // Create projects table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT,
        description TEXT,
        root_path TEXT NOT NULL,
        config_path TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        metadata TEXT
      );
    `);

    // Create languages table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        version TEXT,
        parser_class TEXT NOT NULL,
        extensions TEXT NOT NULL,
        features TEXT,
        is_enabled INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 100
      );
    `);

    // Create project_languages table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS project_languages (
        project_id INTEGER NOT NULL,
        language_id INTEGER NOT NULL,
        config TEXT,
        is_primary INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, language_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
      );
    `);

    // Create universal_symbols table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS universal_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        language_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        end_line INTEGER,
        end_column INTEGER,
        return_type TEXT,
        signature TEXT,
        visibility TEXT,
        namespace TEXT,
        parent_symbol_id INTEGER,
        is_exported INTEGER DEFAULT 0,
        is_async INTEGER DEFAULT 0,
        is_abstract INTEGER DEFAULT 0,
        language_features TEXT,
        semantic_tags TEXT,
        confidence REAL DEFAULT 1.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_symbol_id) REFERENCES universal_symbols(id)
      );
    `);

    // Create universal_relationships table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS universal_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        from_symbol_id INTEGER,
        to_symbol_id INTEGER,
        type TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        context_line INTEGER,
        context_column INTEGER,
        context_snippet TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (from_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE,
        FOREIGN KEY (to_symbol_id) REFERENCES universal_symbols(id) ON DELETE CASCADE
      );
    `);

    // Seed default languages
    const languageSeedData = [
      {
        name: "cpp",
        displayName: "C++",
        version: "23",
        parserClass: "StreamingCppParser",
        extensions: JSON.stringify([
          ".cpp",
          ".cxx",
          ".cc",
          ".c++",
          ".ixx",
          ".cppm",
          ".h",
          ".hpp",
          ".hxx",
          ".h++",
        ]),
        features: JSON.stringify([
          "modules",
          "templates",
          "concepts",
          "coroutines",
        ]),
        isEnabled: true,
        priority: 10,
      },
      {
        name: "python",
        displayName: "Python",
        version: "3.12",
        parserClass: "PythonParser",
        extensions: JSON.stringify([".py", ".pyi", ".pyx"]),
        features: JSON.stringify(["async", "typing", "decorators"]),
        isEnabled: true,
        priority: 20,
      },
      {
        name: "typescript",
        displayName: "TypeScript",
        version: "5.0",
        parserClass: "TypeScriptParser",
        extensions: JSON.stringify([".ts", ".tsx", ".d.ts"]),
        features: JSON.stringify(["generics", "decorators", "modules"]),
        isEnabled: true,
        priority: 30,
      },
      {
        name: "javascript",
        displayName: "JavaScript",
        version: "ES2023",
        parserClass: "JavaScriptParser",
        extensions: JSON.stringify([".js", ".jsx", ".mjs", ".cjs"]),
        features: JSON.stringify(["modules", "async", "classes"]),
        isEnabled: true,
        priority: 40,
      },
    ];

    // Seed languages using raw SQL
    console.log("  🌱 Seeding languages...");
    for (const lang of languageSeedData) {
      const existing = sqlite
        .prepare("SELECT id FROM languages WHERE name = ?")
        .get(lang.name);
      if (!existing) {
        const insertStmt = sqlite.prepare(`
          INSERT INTO languages (name, display_name, version, parser_class, extensions, features, is_enabled, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(
          lang.name,
          lang.displayName,
          lang.version,
          lang.parserClass,
          lang.extensions,
          lang.features,
          lang.isEnabled ? 1 : 0,
          lang.priority
        );
      } else {
      }
    }

    console.log("✅ Database schema and seed data initialized successfully!");
  } finally {
    sqlite.close();
  }
}

async function main() {
  // Load environment variables
  dotenv.config();

  // Set environment variable to prevent auto-start
  process.env.MODULE_SENTINEL_SCRIPT_MODE = "true";

  const cleanRebuild = process.argv.includes("--clean");
  const projectPath =
    process.argv.find((arg) => arg.startsWith("--project="))?.split("=")[1] ||
    process.env.PROJECT_PATH ||
    process.env.MODULE_SENTINEL_PROJECT_PATH ||
    "/home/warxh/planet_procgen";

  const dbPath = process.env.DATABASE_PATH || ".test-db/main.db";

  console.log();

  // Initialize database schema first
  await initializeDatabase(dbPath);
  console.log();

  const server = new ModuleSentinelMCPServer({ skipAutoIndex: true });

  try {
    // Use the public method to rebuild index
    const result = await (server as any).handleRebuildIndex({
      projectPath,
      force: cleanRebuild,
    });

    console.log(result.content?.[0]?.text || JSON.stringify(result, null, 2));

    console.log("\n✅ Database rebuild completed successfully!");
  } catch (error) {
    console.error("❌ Database rebuild failed:", error);
    process.exit(1);
  } finally {
    // Server shutdown not needed for script execution
  }
}

if (require.main === module) {
  main().catch(console.error);
}
