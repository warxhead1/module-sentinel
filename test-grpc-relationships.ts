import { SemanticRelationshipEnhancer } from './src/services/semantic-relationship-enhancer.js';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), '.module-sentinel', 'test', 'test.db');
console.log('Using database:', dbPath);

// First check what gRPC relationships we have
const db = new Database(dbPath);

// Check for cross-language relationships with gRPC metadata
const grpcRelationships = db.prepare(`
  SELECT 
    s1.name as from_name,
    s1.file_path as from_file,
    r.type,
    r.metadata,
    s2.name as to_name,
    s2.file_path as to_file
  FROM universal_relationships r
  JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
  LEFT JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
  WHERE r.metadata LIKE '%grpc%'
    OR r.metadata LIKE '%crossLanguageType%'
  LIMIT 20
`).all();

console.log('\n🔍 Current gRPC relationships:');
for (const rel of grpcRelationships) {
  console.log(`  ${rel.from_name} (${path.basename(rel.from_file)}) → ${rel.to_name || 'unknown'} (${rel.to_file ? path.basename(rel.to_file) : 'N/A'})`);
  console.log(`     Type: ${rel.type}, Metadata: ${rel.metadata?.substring(0, 100)}...`);
}

// Now run the enhancer
console.log('\n🚀 Running semantic relationship enhancer...\n');
const enhancer = new SemanticRelationshipEnhancer(dbPath);

async function runTest() {
  await enhancer.enhanceAllRelationships();

  // Check for new gRPC service relationships
  const grpcServiceRelationships = db.prepare(`
    SELECT 
      s1.name as from_name,
      s1.file_path as from_file,
      l1.name as from_lang,
      r.type,
      s2.name as to_name,
      s2.file_path as to_file,
      l2.name as to_lang,
      r.metadata
    FROM universal_relationships r
    JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
    JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
    JOIN languages l1 ON s1.language_id = l1.id
    JOIN languages l2 ON s2.language_id = l2.id
    WHERE r.type = 'grpc_calls_service'
    LIMIT 20
  `).all();

  console.log('\n✨ New gRPC cross-language service relationships:');
  for (const rel of grpcServiceRelationships) {
    console.log(`  ${rel.from_name} (${rel.from_lang}) → ${rel.to_name} (${rel.to_lang})`);
    console.log(`     From: ${path.basename(rel.from_file)}`);
    console.log(`     To: ${path.basename(rel.to_file)}`);
  }

  db.close();
}

runTest().catch(console.error);