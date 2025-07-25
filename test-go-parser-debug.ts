import Database from 'better-sqlite3';
import { GoLanguageParser } from './src/parsers/adapters/go-language-parser.js';

const goCode = `
package main

type checkoutService struct {
  cartSvcConn *grpc.ClientConn
}

func (cs *checkoutService) getUserCart(ctx context.Context, userID string) ([]*pb.CartItem, error) {
  cart, err := pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, &pb.GetCartRequest{UserId: userID})
  if err \!= nil {
    return nil, err
  }
  return cart.GetItems(), nil
}
`;

async function testParser() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS languages (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS universal_symbols (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, language_id INTEGER, name TEXT, qualified_name TEXT, kind TEXT, file_path TEXT, line INTEGER, column INTEGER);
    CREATE TABLE IF NOT EXISTS universal_relationships (id INTEGER PRIMARY KEY, project_id INTEGER, from_symbol_id INTEGER, to_symbol_id INTEGER, type TEXT, metadata TEXT);
    INSERT INTO projects (id, name) VALUES (1, 'test');
    INSERT INTO languages (id, name) VALUES (1, 'go');
  `);

  const parser = new GoLanguageParser(db, { debugMode: true });
  await parser.initialize();

  const result = await parser.parseFile('test.go', goCode);

  console.log('\nRelationships:');
  for (const rel of result.relationships) {
    console.log(`  ${rel.fromName} → ${rel.toName} (${rel.relationshipType})`);
    if (rel.metadata) console.log(`    Metadata:`, rel.metadata);
  }

  db.close();
}

testParser().catch(console.error);
