import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './src/database/drizzle/schema.js';
import { eq, and, ne, sql } from 'drizzle-orm';
import { CrossLanguageDetector } from './src/parsers/utils/cross-language-detector.js';

async function diagnoseCrossLanguageDetection() {
  const db = new Database('/home/node/.module-sentinel/development.db');
  const drizzleDb = drizzle(db, { schema });

  console.log('🔍 Diagnosing Cross-Language Detection\n');

  // 1. Check total relationships
  const totalRelationships = await drizzleDb
    .select({ count: sql<number>`count(*)` })
    .from(schema.universalRelationships);
  console.log(`📊 Total relationships: ${totalRelationships[0].count}`);

  // 2. Check cross-language relationships  
  const crossLangRelationships = await drizzleDb
    .select({
      fromLang: schema.languages.name,
      toLang: sql<string>`l2.name`,
      fromSymbol: schema.universalSymbols.name,
      toSymbol: sql<string>`us2.name`,
      type: schema.universalRelationships.type,
      fromFile: schema.universalSymbols.filePath,
      toFile: sql<string>`us2.file_path`,
      metadata: schema.universalRelationships.metadata
    })
    .from(schema.universalRelationships)
    .innerJoin(
      schema.universalSymbols,
      eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
    )
    .innerJoin(
      schema.languages,
      eq(schema.universalSymbols.languageId, schema.languages.id)
    )
    .innerJoin(
      sql`universal_symbols us2`,
      sql`${schema.universalRelationships.toSymbolId} = us2.id`
    )
    .innerJoin(
      sql`languages l2`,
      sql`us2.language_id = l2.id`
    )
    .where(sql`${schema.languages.name} != l2.name`)
    .limit(10);

  console.log(`\n🌐 Cross-language relationships found: ${crossLangRelationships.length}`);
  crossLangRelationships.forEach((rel, idx) => {
    console.log(`\n${idx + 1}. ${rel.fromLang} → ${rel.toLang}`);
    console.log(`   From: ${rel.fromSymbol} (${rel.fromFile})`);
    console.log(`   To: ${rel.toSymbol} (${rel.toFile})`);
    console.log(`   Type: ${rel.type}`);
    if (rel.metadata) {
      console.log(`   Metadata: ${rel.metadata}`);
    }
  });

  // 3. Test CrossLanguageDetector on sample code
  console.log('\n\n🧪 Testing CrossLanguageDetector\n');

  const testCases = [
    {
      lang: 'go',
      code: 'cart, err := pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, &pb.GetCartRequest{UserId: userID})',
      desc: 'Go gRPC client call'
    },
    {
      lang: 'typescript', 
      code: 'const response = await fetch("http://currency-service:7000/convert", { method: "POST" })',
      desc: 'TypeScript HTTP call'
    },
    {
      lang: 'python',
      code: 'response = requests.post("http://recommendation-service:8080/recommend", json=payload)',
      desc: 'Python HTTP call'
    },
    {
      lang: 'go',
      code: 'conn, err := grpc.Dial("productcatalog:3550", grpc.WithInsecure())',
      desc: 'Go gRPC dial'
    }
  ];

  testCases.forEach(test => {
    console.log(`\n📝 ${test.desc}:`);
    console.log(`   Code: ${test.code}`);
    const results = CrossLanguageDetector.detectCrossLanguageCalls(
      test.code,
      1,
      test.lang,
      'test.file'
    );
    
    if (results.length > 0) {
      results.forEach(result => {
        console.log(`   ✅ Detected: ${result.type} call`);
        console.log(`      Target: ${result.targetEndpoint || result.targetLanguage || 'unknown'}`);
        console.log(`      Confidence: ${result.confidence}`);
      });
    } else {
      console.log(`   ❌ No cross-language calls detected`);
    }
  });

  // 4. Check if gRPC patterns are in the database
  console.log('\n\n🔎 Checking for gRPC patterns in database\n');
  
  const grpcPatterns = ['NewCartServiceClient', 'NewProductCatalogServiceClient', 'grpc.Dial', 'grpc.DialContext'];
  
  for (const pattern of grpcPatterns) {
    const symbols = await drizzleDb
      .select({
        name: schema.universalSymbols.name,
        file: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line
      })
      .from(schema.universalSymbols)
      .where(sql`${schema.universalSymbols.name} LIKE ${`%${pattern}%`}`)
      .limit(5);
      
    if (symbols.length > 0) {
      console.log(`\n📌 Found "${pattern}" symbols:`);
      symbols.forEach(sym => {
        console.log(`   - ${sym.name} at ${sym.file}:${sym.line}`);
      });
    } else {
      console.log(`\n❌ No symbols found matching "${pattern}"`);
    }
  }

  // 5. Check relationship metadata for cross-language info
  console.log('\n\n📋 Checking relationship metadata\n');
  
  const relationshipsWithMetadata = await drizzleDb
    .select({
      type: schema.universalRelationships.type,
      metadata: schema.universalRelationships.metadata,
      fromSymbol: schema.universalSymbols.name,
      fromFile: schema.universalSymbols.filePath
    })
    .from(schema.universalRelationships)
    .innerJoin(
      schema.universalSymbols,
      eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
    )
    .where(sql`${schema.universalRelationships.metadata} IS NOT NULL AND ${schema.universalRelationships.metadata} != ''`)
    .limit(10);

  if (relationshipsWithMetadata.length > 0) {
    console.log(`Found ${relationshipsWithMetadata.length} relationships with metadata:`);
    relationshipsWithMetadata.forEach((rel, idx) => {
      console.log(`\n${idx + 1}. ${rel.type} from ${rel.fromSymbol}`);
      console.log(`   File: ${rel.fromFile}`);
      console.log(`   Metadata: ${rel.metadata}`);
    });
  } else {
    console.log('No relationships found with metadata');
  }

  db.close();
}

diagnoseCrossLanguageDetection().catch(console.error);