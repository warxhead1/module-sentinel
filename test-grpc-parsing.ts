import Database from 'better-sqlite3';
import { GoLanguageParser } from './src/parsers/adapters/go-language-parser.js';

// Create in-memory database for testing
const db = new Database(':memory:');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
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
    is_definition INTEGER DEFAULT 1,
    confidence REAL DEFAULT 1.0,
    semantic_tags TEXT,
    complexity INTEGER DEFAULT 1,
    is_exported INTEGER DEFAULT 0,
    is_async INTEGER DEFAULT 0,
    return_type TEXT,
    signature TEXT,
    visibility TEXT,
    namespace TEXT,
    parent_symbol_id INTEGER,
    parent_scope TEXT,
    language_features TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (language_id) REFERENCES languages(id)
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
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (from_symbol_id) REFERENCES universal_symbols(id),
    FOREIGN KEY (to_symbol_id) REFERENCES universal_symbols(id)
  );
  
  INSERT INTO projects (name, path) VALUES ('test', '/test');
  INSERT INTO languages (name) VALUES ('go');
`);

// Test gRPC code snippet
const testCode = `
package main

import (
  "context"
  pb "github.com/GoogleCloudPlatform/microservices-demo/src/checkoutservice/genproto"
)

type checkoutService struct {
  pb.UnimplementedCheckoutServiceServer
  cartSvcConn *grpc.ClientConn
}

func (cs *checkoutService) getUserCart(ctx context.Context, userID string) ([]*pb.CartItem, error) {
  cart, err := pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, &pb.GetCartRequest{UserId: userID})
  if err != nil {
    return nil, fmt.Errorf("failed to get user cart during checkout: %+v", err)
  }
  return cart.GetItems(), nil
}

func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderRequest) (*pb.PlaceOrderResponse, error) {
  // Get user cart
  items, err := cs.getUserCart(ctx, req.UserId)
  if err != nil {
    return nil, err
  }
  
  // Call currency service
  result, err := pb.NewCurrencyServiceClient(cs.currencySvcConn).Convert(ctx, &pb.CurrencyConversionRequest{
    From: price,
    ToCode: currency
  })
  
  // Call product catalog
  cl := pb.NewProductCatalogServiceClient(cs.productCatalogSvcConn)
  product, err := cl.GetProduct(ctx, &pb.GetProductRequest{Id: item.GetProductId()})
  
  return &pb.PlaceOrderResponse{Order: order}, nil
}
`;

// Test the parser
const parser = new GoLanguageParser(db, {
  debugMode: true,
  enableSemanticAnalysis: false
});

async function runTest() {
  await parser.initialize();

  console.log('🧪 Testing gRPC pattern detection in Go code...\n');

  const result = await parser.parseFile('test.go', testCode);

  console.log(`Found ${result.symbols.length} symbols:`);
  for (const symbol of result.symbols) {
    console.log(`  - ${symbol.kind}: ${symbol.name} (line ${symbol.line})`);
  }

  console.log(`\nFound ${result.relationships.length} relationships:`);
  for (const rel of result.relationships) {
    console.log(`  - ${rel.fromName} → ${rel.toName} (${rel.relationshipType})`);
    if (rel.crossLanguage) {
      console.log(`    Cross-language: ${JSON.stringify(rel.metadata)}`);
    }
  }

  // Check specifically for gRPC client calls
  const grpcCalls = result.relationships.filter(r => 
    r.metadata?.crossLanguageType === 'grpc' || 
    r.toName?.includes('ServiceClient')
  );

  console.log(`\n✨ Found ${grpcCalls.length} gRPC client calls:`);
  for (const call of grpcCalls) {
    console.log(`  - ${call.fromName} → ${call.toName}`);
    console.log(`    Metadata: ${JSON.stringify(call.metadata)}`);
  }

  db.close();
}

runTest().catch(console.error);