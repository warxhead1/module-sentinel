#!/usr/bin/env ts-node

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// Analyze REST/HTTP patterns in the existing codebase
async function analyzeRestApiPatterns() {
  console.log("🔍 Analyzing REST API and HTTP Cross-Language Patterns\n");

  const dbPath = path.join(process.env.HOME || ".", ".module-sentinel/development.db");
  
  if (!fs.existsSync(dbPath)) {
    console.error("❌ Database not found.");
    process.exit(1);
  }

  const db = new Database(dbPath);

  // 1. Check what files we have
  console.log("📂 Files in database:\n");
  const files = db.prepare(`
    SELECT DISTINCT file_path
    FROM universal_symbols
    WHERE file_path LIKE '%microservices%' OR file_path LIKE '%test-repos%'
    ORDER BY file_path
    LIMIT 20
  `).all() as Array<{ file_path: string }>;

  files.forEach(f => console.log(`  ${f.file_path}`));

  // 2. Look for HTTP patterns in code
  console.log("\n🌐 HTTP/REST Patterns in Code:\n");

  // Check for specific HTTP patterns in definition snippets
  const httpPatterns = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      s.kind,
      l.name as language,
      substr(s.definition_snippet, 1, 200) as snippet
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE (
      s.definition_snippet LIKE '%fetch(%' OR
      s.definition_snippet LIKE '%axios%' OR
      s.definition_snippet LIKE '%http.get%' OR
      s.definition_snippet LIKE '%http.post%' OR
      s.definition_snippet LIKE '%requests.%' OR
      s.definition_snippet LIKE '%.client.get%' OR
      s.definition_snippet LIKE '%.client.post%' OR
      s.definition_snippet LIKE '%HandleFunc%' OR
      s.definition_snippet LIKE '%app.get%' OR
      s.definition_snippet LIKE '%app.post%' OR
      s.definition_snippet LIKE '%router.%'
    )
    ORDER BY s.file_path, s.line_number
    LIMIT 30
  `).all();

  console.table(httpPatterns);

  // 3. Look for service URLs and endpoints
  console.log("\n🔗 Service URLs and Endpoints:\n");

  const serviceUrls = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      s.kind,
      l.name as language,
      substr(s.definition_snippet, 1, 200) as snippet
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE (
      s.definition_snippet LIKE '%SERVICE_ADDR%' OR
      s.definition_snippet LIKE '%localhost:%' OR
      s.definition_snippet LIKE '%http://%' OR
      s.definition_snippet LIKE '%https://%' OR
      s.definition_snippet LIKE '%:8080%' OR
      s.definition_snippet LIKE '%:3000%' OR
      s.definition_snippet LIKE '%/api/%' OR
      s.definition_snippet LIKE '%endpoint%'
    )
    ORDER BY s.file_path
    LIMIT 30
  `).all();

  console.table(serviceUrls);

  // 4. Analyze cross-language relationships
  console.log("\n🔄 Cross-Language Relationships:\n");

  const crossLangRels = db.prepare(`
    SELECT 
      r.type,
      r.detected_by,
      l1.name as from_language,
      s1.file_path as from_file,
      l2.name as to_language,
      s2.file_path as to_file,
      r.confidence
    FROM universal_relationships r
    JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
    JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
    JOIN languages l1 ON s1.language_id = l1.id
    JOIN languages l2 ON s2.language_id = l2.id
    WHERE l1.name != l2.name
    ORDER BY r.confidence DESC
    LIMIT 20
  `).all();

  console.table(crossLangRels);

  // 5. Specific example: Frontend HTTP handlers
  console.log("\n🎯 Example: Frontend HTTP Handlers\n");

  const frontendHandlers = db.prepare(`
    SELECT 
      s.name,
      s.kind,
      substr(s.definition_snippet, 1, 150) as snippet
    FROM universal_symbols s
    WHERE s.file_path LIKE '%frontend%'
      AND (
        s.name LIKE '%Handler' OR 
        s.name LIKE '%handler' OR
        s.definition_snippet LIKE '%HandleFunc%'
      )
    ORDER BY s.line_number
    LIMIT 20
  `).all();

  console.table(frontendHandlers);

  // 6. Missing patterns analysis
  console.log("\n❌ Potential Missing HTTP Cross-Language Patterns:\n");

  // Known HTTP communication patterns in microservices
  const knownPatterns = [
    { pattern: "Frontend serves HTTP endpoints", query: "HandleFunc" },
    { pattern: "Loadgenerator makes HTTP calls", query: "client.get|client.post" },
    { pattern: "Frontend calls shopping assistant", query: "/bot" },
    { pattern: "JavaScript fetch in templates", query: "fetch(" }
  ];

  for (const { pattern, query } of knownPatterns) {
    const count = db.prepare(`
      SELECT COUNT(*) as count
      FROM universal_symbols s
      WHERE s.definition_snippet LIKE '%${query}%'
    `).get() as { count: number };

    console.log(`${pattern}: ${count.count > 0 ? '✅ Found' : '❌ Not found'} (${count.count} occurrences)`);
  }

  // 7. Check for REST API definitions
  console.log("\n📡 REST API Route Definitions:\n");

  const restRoutes = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      l.name as language,
      substr(s.definition_snippet, 1, 200) as snippet
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE (
      s.definition_snippet LIKE '%app.get("%' OR
      s.definition_snippet LIKE '%app.post("%' OR
      s.definition_snippet LIKE '%router.get("%' OR
      s.definition_snippet LIKE '%router.post("%' OR
      s.definition_snippet LIKE '%@app.route%' OR
      s.definition_snippet LIKE '%@Get(%' OR
      s.definition_snippet LIKE '%@Post(%'
    )
    ORDER BY s.file_path
    LIMIT 20
  `).all();

  console.table(restRoutes);

  db.close();
  
  console.log("\n📝 Summary of Missing HTTP/REST Cross-Language Detection:\n");
  console.log("1. Frontend HTTP endpoints (HandleFunc) are not creating relationships to callers");
  console.log("2. Loadgenerator HTTP client calls are not linked to Frontend endpoints");
  console.log("3. JavaScript fetch() calls in templates are not detected");
  console.log("4. Service environment variables (SERVICE_ADDR) are not used to create relationships");
  console.log("5. REST API route definitions are not matched with their consumers");
}

analyzeRestApiPatterns().catch(console.error);