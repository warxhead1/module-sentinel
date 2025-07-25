#!/usr/bin/env ts-node

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

// Analysis script to find HTTP/REST cross-language patterns
async function analyzeHttpCrossLanguage() {
  console.log("🔍 Analyzing HTTP/REST Cross-Language Communication Patterns\n");

  const dbPath = path.join(process.env.HOME || ".", ".module-sentinel/test/microservices-test.db");
  
  if (!fs.existsSync(dbPath)) {
    console.error("❌ Database not found. Please run test-cross-language-microservices.ts first.");
    process.exit(1);
  }

  const db = new Database(dbPath);

  // 1. Find all HTTP-related symbols
  console.log("📡 HTTP/REST Related Symbols:\n");
  
  const httpSymbols = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      s.kind,
      l.name as language,
      s.line_number
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE (
      s.name LIKE '%http%' OR 
      s.name LIKE '%Http%' OR
      s.name LIKE '%HTTP%' OR
      s.name LIKE '%fetch%' OR
      s.name LIKE '%axios%' OR
      s.name LIKE '%request%' OR
      s.name LIKE '%Request%' OR
      s.name LIKE '%endpoint%' OR
      s.name LIKE '%Endpoint%' OR
      s.name LIKE '%route%' OR
      s.name LIKE '%Route%' OR
      s.name LIKE '%api%' OR
      s.name LIKE '%Api%' OR
      s.name LIKE '%API%'
    )
    ORDER BY s.file_path, s.line_number
    LIMIT 50
  `).all();

  console.table(httpSymbols);

  // 2. Find service address environment variables
  console.log("\n🔧 Service Address Environment Variables:\n");
  
  const serviceAddrs = db.prepare(`
    SELECT 
      s.name,
      s.file_path,
      s.kind,
      l.name as language,
      s.line_number
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE (
      s.name LIKE '%SERVICE_ADDR%' OR
      s.name LIKE '%SERVICE_URL%' OR
      s.name LIKE '%_ENDPOINT%' OR
      s.name LIKE '%_HOST%' OR
      s.name LIKE '%_PORT%'
    )
    ORDER BY s.file_path
  `).all();

  console.table(serviceAddrs);

  // 3. Check relationships that might be HTTP-based
  console.log("\n🔗 Potential HTTP Relationships (invokes/calls):\n");
  
  const httpRelationships = db.prepare(`
    SELECT 
      s1.name as from_symbol,
      s1.file_path as from_file,
      l1.name as from_language,
      s2.name as to_symbol,
      s2.file_path as to_file,
      l2.name as to_language,
      r.type,
      r.detected_by,
      r.confidence
    FROM universal_relationships r
    JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
    JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
    JOIN languages l1 ON s1.language_id = l1.id
    JOIN languages l2 ON s2.language_id = l2.id
    WHERE (
      s1.name LIKE '%http%' OR 
      s2.name LIKE '%http%' OR
      s1.name LIKE '%fetch%' OR
      s2.name LIKE '%fetch%' OR
      s1.name LIKE '%request%' OR
      s2.name LIKE '%request%' OR
      r.type = 'invokes' OR
      r.type = 'calls'
    )
    AND r.confidence > 0.5
    LIMIT 30
  `).all();

  console.table(httpRelationships);

  // 4. Analyze specific services for HTTP patterns
  console.log("\n📋 Frontend Service HTTP Endpoints:\n");
  
  // Frontend routes
  const frontendRoutes = db.prepare(`
    SELECT 
      s.name,
      s.kind,
      s.line_number,
      substr(s.definition_snippet, 1, 100) as snippet
    FROM universal_symbols s
    JOIN languages l ON s.language_id = l.id
    WHERE s.file_path LIKE '%frontend%'
      AND (s.name LIKE '%Handler' OR s.name LIKE '%handler')
    ORDER BY s.line_number
  `).all();

  console.table(frontendRoutes);

  // 5. Find missing cross-language HTTP relationships
  console.log("\n❌ Potential Missing HTTP Cross-Language Relationships:\n");

  // Services that should communicate via HTTP
  const servicePairs = [
    { from: 'loadgenerator', to: 'frontend', type: 'HTTP calls' },
    { from: 'frontend', to: 'shoppingassistant', type: 'HTTP API calls' },
    { from: 'frontend', to: 'adservice', type: 'gRPC calls' }
  ];

  for (const pair of servicePairs) {
    const relations = db.prepare(`
      SELECT COUNT(*) as count
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      WHERE s1.file_path LIKE '%${pair.from}%'
        AND s2.file_path LIKE '%${pair.to}%'
    `).get() as { count: number };

    console.log(`${pair.from} → ${pair.to} (${pair.type}): ${relations.count} relationships found`);
  }

  // 6. Analyze loadgenerator HTTP calls
  console.log("\n🎯 Loadgenerator HTTP Endpoints:\n");

  const loadgenEndpoints = [
    '/', '/setCurrency', '/product/', '/cart', '/cart/empty', '/cart/checkout', '/logout'
  ];

  console.log("Expected endpoints being called by loadgenerator:");
  for (const endpoint of loadgenEndpoints) {
    console.log(`  - ${endpoint}`);
  }

  // Check if these are captured
  const loadgenCalls = db.prepare(`
    SELECT 
      s.name,
      s.kind,
      substr(s.definition_snippet, 1, 150) as snippet
    FROM universal_symbols s
    WHERE s.file_path LIKE '%loadgenerator%'
      AND s.kind IN ('function', 'method')
    ORDER BY s.line_number
  `).all();

  console.log("\nActual functions found in loadgenerator:");
  console.table(loadgenCalls);

  db.close();
}

analyzeHttpCrossLanguage().catch(console.error);