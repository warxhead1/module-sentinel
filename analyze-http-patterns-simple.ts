#!/usr/bin/env ts-node

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// Simple analysis of HTTP/REST patterns
async function analyzeHttpPatterns() {
  console.log("🔍 Analyzing HTTP/REST Cross-Language Communication Patterns\n");

  const dbPath = path.join(process.env.HOME || ".", ".module-sentinel/development.db");
  const db = new Database(dbPath);

  // 1. Find symbols related to HTTP
  console.log("🌐 HTTP-Related Symbols:\n");
  
  const httpSymbols = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      s.kind,
      l.name as language
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE (
      s.name LIKE '%http%' OR 
      s.name LIKE '%Http%' OR
      s.name LIKE '%fetch%' OR
      s.name LIKE '%request%' OR
      s.name LIKE '%HandleFunc%' OR
      s.name LIKE '%handler%' OR
      s.name LIKE '%endpoint%'
    )
    AND s.file_path LIKE '%microservices%'
    ORDER BY s.file_path
    LIMIT 30
  `).all();

  console.table(httpSymbols);

  // 2. Check relationships
  console.log("\n🔗 Relationships in the System:\n");
  
  const relationships = db.prepare(`
    SELECT 
      r.type,
      r.detected_by,
      COUNT(*) as count
    FROM universal_relationships r
    GROUP BY r.type, r.detected_by
    ORDER BY count DESC
  `).all();

  console.table(relationships);

  // 3. Look for specific services
  console.log("\n📦 Services Found:\n");
  
  const services = db.prepare(`
    SELECT 
      DISTINCT substr(file_path, 
        instr(file_path, 'src/') + 4, 
        instr(substr(file_path, instr(file_path, 'src/') + 4), '/') - 1
      ) as service,
      COUNT(*) as symbol_count
    FROM universal_symbols
    WHERE file_path LIKE '%microservices-demo/src/%'
    GROUP BY service
    ORDER BY symbol_count DESC
  `).all();

  console.table(services);

  // 4. Specific example files
  console.log("\n📄 Example: Frontend Handlers:\n");
  
  const frontendFiles = db.prepare(`
    SELECT DISTINCT file_path
    FROM universal_symbols
    WHERE file_path LIKE '%frontend%handler%' OR file_path LIKE '%frontend%main%'
    LIMIT 10
  `).all();

  console.table(frontendFiles);

  // 5. Loadgenerator analysis
  console.log("\n🎯 Loadgenerator File:\n");
  
  const loadgenFile = db.prepare(`
    SELECT 
      s.name,
      s.kind,
      l.name as language
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE s.file_path LIKE '%loadgenerator%'
    ORDER BY s.name
  `).all();

  console.table(loadgenFile);

  // 6. Cross-language relationships
  console.log("\n🔄 Cross-Language Relationships:\n");
  
  const crossLang = db.prepare(`
    SELECT 
      l1.name as from_language,
      l2.name as to_language,
      r.type,
      COUNT(*) as count
    FROM universal_relationships r
    JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
    JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
    JOIN languages l1 ON s1.language_id = l1.id
    JOIN languages l2 ON s2.language_id = l2.id
    WHERE l1.name != l2.name
    GROUP BY l1.name, l2.name, r.type
    ORDER BY count DESC
    LIMIT 10
  `).all();

  if (crossLang.length > 0) {
    console.table(crossLang);
  } else {
    console.log("❌ No cross-language relationships found!");
  }

  // 7. Check for service address patterns
  console.log("\n🔧 Service Address Patterns:\n");
  
  const serviceAddrs = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      s.kind
    FROM universal_symbols s
    WHERE s.name LIKE '%SERVICE_ADDR%' OR s.name LIKE '%_ADDR%'
    LIMIT 10
  `).all();

  console.table(serviceAddrs);

  db.close();

  // Summary
  console.log("\n📝 Key Findings:\n");
  console.log("1. HTTP handlers are defined in the frontend service");
  console.log("2. Loadgenerator likely makes HTTP calls to frontend");
  console.log("3. Service addresses are configured via environment variables");
  console.log("4. Cross-language HTTP relationships are not being detected");
  console.log("\n❌ Missing Detection Patterns:");
  console.log("- Frontend HTTP route handlers (HandleFunc) not linked to callers");
  console.log("- Loadgenerator HTTP client calls not creating relationships");
  console.log("- Service discovery via environment variables not used for relationships");
  console.log("- JavaScript fetch() calls in templates not detected");
}

analyzeHttpPatterns().catch(console.error);