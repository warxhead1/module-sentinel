import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './src/database/drizzle/schema.js';
import { eq, and, ne, sql } from 'drizzle-orm';
import { CrossLanguageDetector } from './src/parsers/utils/cross-language-detector.js';
import { GoLanguageParser } from './src/parsers/adapters/go-language-parser.js';
import { TypeScriptLanguageParser } from './src/parsers/adapters/typescript-language-parser.js';
import { DatabaseInitializer } from './src/database/database-initializer.js';

async function testCrossLanguageFlow() {
  console.log('🧪 Testing Cross-Language Detection Flow\n');

  // Create in-memory database for testing
  const db = new Database(':memory:');
  const drizzleDb = drizzle(db, { schema });
  
  // Initialize database with raw SQL
  const initSQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  file_extensions TEXT NOT NULL
);

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
  is_generic INTEGER DEFAULT 0,
  documentation TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (language_id) REFERENCES languages(id),
  FOREIGN KEY (parent_symbol_id) REFERENCES universal_symbols(id)
);

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
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (from_symbol_id) REFERENCES universal_symbols(id),
  FOREIGN KEY (to_symbol_id) REFERENCES universal_symbols(id)
);`;

  db.exec(initSQL);

  // Create test project and languages
  await drizzleDb.insert(schema.projects).values({
    name: 'Test Project',
    rootPath: '/test',
    description: 'Test cross-language',
    isActive: true
  });
  const projectId = 1;

  await drizzleDb.insert(schema.languages).values([
    { name: 'go', fileExtensions: '.go' },
    { name: 'typescript', fileExtensions: '.ts,.js' },
    { name: 'python', fileExtensions: '.py' },
    { name: 'java', fileExtensions: '.java' }
  ]);

  // Test 1: Parse Go code with gRPC client calls
  console.log('📝 Test 1: Go gRPC Client Calls\n');
  
  const goCode = `package main

import (
  "context"
  pb "checkoutservice/genproto"
  "google.golang.org/grpc"
)

type checkoutService struct {
  cartSvcConn *grpc.ClientConn
  productCatalogSvcConn *grpc.ClientConn
}

func (cs *checkoutService) getUserCart(ctx context.Context, userID string) ([]*pb.CartItem, error) {
  cart, err := pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, &pb.GetCartRequest{UserId: userID})
  if err != nil {
    return nil, err
  }
  return cart.Items, nil
}

func (cs *checkoutService) getProduct(ctx context.Context, productID string) (*pb.Product, error) {
  product, err := pb.NewProductCatalogServiceClient(cs.productCatalogSvcConn).GetProduct(ctx, &pb.GetProductRequest{Id: productID})
  return product, err
}`;

  const goParser = new GoLanguageParser(db, {
    projectId,
    languageId: 1,
    debugMode: true,
    enableSemanticAnalysis: false
  });
  await goParser.initialize();
  
  const goResult = await goParser.parseFile('checkout.go', goCode);
  console.log(`Found ${goResult.symbols.length} symbols`);
  console.log(`Found ${goResult.relationships.length} relationships\n`);
  
  // Check for cross-language relationships
  const crossLangRels = goResult.relationships.filter(r => r.crossLanguage === true);
  console.log(`Cross-language relationships: ${crossLangRels.length}`);
  crossLangRels.forEach(rel => {
    console.log(`  - ${rel.fromName} -> ${rel.toName} (${rel.relationshipType})`);
    if (rel.metadata) {
      console.log(`    Metadata: ${JSON.stringify(rel.metadata)}`);
    }
  });

  // Test 2: Parse TypeScript code with HTTP calls
  console.log('\n\n📝 Test 2: TypeScript HTTP Calls\n');
  
  const tsCode = `import axios from 'axios';

class CheckoutService {
  async convertCurrency(amount: number, from: string, to: string) {
    const response = await axios.post('http://currency-service:7000/convert', {
      amount,
      from,
      to
    });
    return response.data;
  }

  async getRecommendations(userId: string) {
    const response = await fetch('http://recommendation-service:8080/recommend', {
      method: 'POST',
      body: JSON.stringify({ userId }),
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }
}`;

  const tsParser = new TypeScriptLanguageParser(db, {
    projectId,
    languageId: 2,
    debugMode: true,
    enableSemanticAnalysis: false
  });
  await tsParser.initialize();
  
  const tsResult = await tsParser.parseFile('checkout.ts', tsCode);
  console.log(`Found ${tsResult.symbols.length} symbols`);
  console.log(`Found ${tsResult.relationships.length} relationships\n`);
  
  const tsCrossLangRels = tsResult.relationships.filter(r => r.crossLanguage === true);
  console.log(`Cross-language relationships: ${tsCrossLangRels.length}`);
  tsCrossLangRels.forEach(rel => {
    console.log(`  - ${rel.fromName} -> ${rel.toName} (${rel.relationshipType})`);
    if (rel.metadata) {
      console.log(`    Metadata: ${JSON.stringify(rel.metadata)}`);
    }
  });

  // Test 3: Direct CrossLanguageDetector test
  console.log('\n\n📝 Test 3: Direct CrossLanguageDetector Tests\n');
  
  const testCases = [
    {
      code: 'pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, request)',
      lang: 'go',
      desc: 'gRPC client call'
    },
    {
      code: 'await axios.post("http://payment-service:5000/charge", payload)',
      lang: 'typescript',
      desc: 'HTTP POST call'
    },
    {
      code: 'grpc.Dial("productcatalog:3550", grpc.WithInsecure())',
      lang: 'go',
      desc: 'gRPC dial'
    },
    {
      code: 'exec("python ml_model.py --predict")',
      lang: 'typescript',
      desc: 'Subprocess call'
    }
  ];

  testCases.forEach(test => {
    console.log(`\n${test.desc} (${test.lang}):`);
    console.log(`  Code: ${test.code}`);
    
    const results = CrossLanguageDetector.detectCrossLanguageCalls(
      test.code,
      1,
      test.lang,
      'test.file'
    );
    
    if (results.length > 0) {
      results.forEach(result => {
        console.log(`  ✅ Detected: ${result.type}`);
        console.log(`     Target: ${result.targetEndpoint || result.targetLanguage || 'unknown'}`);
        console.log(`     Confidence: ${result.confidence}`);
        if (result.relationship) {
          console.log(`     Relationship type: ${result.relationship.relationshipType}`);
          console.log(`     To name: ${result.relationship.toName}`);
        }
      });
    } else {
      console.log(`  ❌ No detection`);
    }
  });

  // Test 4: Check what the actual problem is with symbol resolution
  console.log('\n\n🔍 Test 4: Symbol Resolution Issue\n');
  
  // Simulate what would happen in the indexer
  const symbolMap = new Map<string, number>();
  
  // Add some test symbols
  symbolMap.set('checkoutService::getUserCart', 1);
  symbolMap.set('checkoutService::getProduct', 2);
  symbolMap.set('CheckoutService::convertCurrency', 3);
  symbolMap.set('CheckoutService::getRecommendations', 4);
  
  // These are the symbols that WOULD exist if the other services were indexed
  // symbolMap.set('CartService', 100);  // Would be in cart service
  // symbolMap.set('ProductCatalogService', 101);  // Would be in product catalog service
  
  console.log('Symbol map contains:');
  for (const [name, id] of symbolMap) {
    console.log(`  ${id}: ${name}`);
  }
  
  console.log('\nCross-language calls would try to resolve:');
  console.log('  - "NewCartServiceClient" -> No symbol exists');
  console.log('  - "http://currency-service:7000/convert" -> No symbol exists');
  console.log('  - The issue: Cross-language calls reference external services not in the current codebase');
  
  db.close();
}

testCrossLanguageFlow().catch(console.error);