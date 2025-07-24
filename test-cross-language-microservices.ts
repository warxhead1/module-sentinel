#!/usr/bin/env ts-node

import { UniversalIndexer } from "./src/indexing/universal-indexer.js";
import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { CrossLanguageDetector } from "./src/parsers/utils/cross-language-detector.js";

async function testCrossLanguageMicroservices() {
  console.log("🚀 Testing Cross-Language Detection on Microservices Demo\n");

  const dbPath = path.join(process.env.HOME || ".", ".module-sentinel/test/microservices-test.db");
  const projectPath = path.resolve("./test-repos/cross-language/microservices-demo");

  // Ensure database directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Clean start
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("✨ Starting with fresh database\n");
  }

  const db = new Database(dbPath);
  const indexer = new UniversalIndexer(dbPath);

  try {
    // Configure project
    await indexer.setActiveProject({
      name: "microservices-demo",
      rootPath: projectPath,
      displayName: "Cross-Language Microservices Demo",
      description: "Google's microservices demo for testing cross-language detection"
    });

    // Index all services
    console.log("📝 Indexing microservices...\n");
    await indexer.indexProject(projectPath);

    // Get basic stats
    const stats = db.prepare(`
      SELECT 
        l.name as language,
        COUNT(DISTINCT s.file_path) as file_count,
        COUNT(*) as symbol_count
      FROM universal_symbols s
      JOIN languages l ON s.language_id = l.id
      GROUP BY l.name
      ORDER BY symbol_count DESC
    `).all();

    console.log("📊 Language Distribution:");
    console.table(stats);

    // Check cross-language relationships
    console.log("\n🔗 Cross-Language Relationships:\n");
    
    const crossLangRelations = db.prepare(`
      SELECT 
        l1.name as from_language,
        l2.name as to_language,
        r.type,
        r.detected_by,
        COUNT(*) as count
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      JOIN languages l1 ON s1.language_id = l1.id
      JOIN languages l2 ON s2.language_id = l2.id
      WHERE l1.name != l2.name
        AND r.detected_by = 'cross-file-analyzer'
      GROUP BY l1.name, l2.name, r.type, r.detected_by
      ORDER BY count DESC
    `).all();

    if (crossLangRelations.length > 0) {
      console.table(crossLangRelations);
    } else {
      console.log("❌ No cross-language relationships detected!\n");
    }

    // Look for gRPC/protobuf usage
    console.log("\n🔍 Checking for gRPC/Protobuf patterns:\n");
    
    const grpcUsage = db.prepare(`
      SELECT 
        s.name,
        s.file_path,
        s.kind,
        l.name as language
      FROM universal_symbols s
      JOIN languages l ON s.language_id = l.id
      WHERE (
        s.name LIKE '%grpc%' OR 
        s.name LIKE '%proto%' OR
        s.name LIKE '%Grpc%' OR
        s.name LIKE '%Proto%' OR
        s.signature LIKE '%grpc%' OR
        s.qualified_name LIKE '%pb.%'
      )
      LIMIT 20
    `).all();

    if (grpcUsage.length > 0) {
      console.table(grpcUsage);
    } else {
      console.log("❌ No gRPC/Protobuf patterns found!\n");
    }

    // Check for HTTP/REST API patterns
    console.log("\n🌐 Checking for HTTP/REST API patterns:\n");
    
    const httpPatterns = db.prepare(`
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
        s.name LIKE '%axios%' OR
        s.name LIKE '%request%' OR
        s.name LIKE '%POST%' OR
        s.name LIKE '%GET%'
      )
      AND s.kind IN ('function', 'method', 'variable')
      LIMIT 20
    `).all();

    if (httpPatterns.length > 0) {
      console.table(httpPatterns);
    }

    // Test the cross-language detector directly
    console.log("\n🔬 Testing CrossLanguageDetector directly:\n");
    
    const detector = new CrossLanguageDetector();
    
    // Check a specific file
    const checkoutService = path.join(projectPath, "src/checkoutservice/main.go");
    if (fs.existsSync(checkoutService)) {
      const content = fs.readFileSync(checkoutService, 'utf-8');
      const patterns = detector.detectPatterns(content, 'go');
      
      console.log(`Patterns detected in checkoutservice/main.go:`);
      patterns.forEach(p => {
        console.log(`  - ${p.type}: ${p.targetLanguage || 'N/A'} (confidence: ${p.confidence})`);
        if (p.details) {
          console.log(`    Details: ${JSON.stringify(p.details).substring(0, 100)}...`);
        }
      });
    }

    // Check for specific cross-language calls
    console.log("\n🔎 Looking for specific cross-language calls:\n");
    
    const specificCalls = db.prepare(`
      SELECT 
        s1.name as caller,
        s1.file_path as caller_file,
        s2.name as callee,
        s2.file_path as callee_file,
        r.type,
        r.source_text
      FROM universal_relationships r
      JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
      JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
      WHERE (
        s1.file_path LIKE '%checkoutservice%' OR
        s1.file_path LIKE '%frontend%' OR
        s1.file_path LIKE '%cartservice%'
      )
      AND r.source_text IS NOT NULL
      LIMIT 10
    `).all();

    if (specificCalls.length > 0) {
      console.table(specificCalls);
    }

  } catch (error) {
    console.error("❌ Error during testing:", error);
  } finally {
    indexer.close();
    db.close();
  }
}

// Run the test
testCrossLanguageMicroservices().catch(console.error);