import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, sql } from 'drizzle-orm';
import * as schema from './src/database/drizzle/schema.js';
import { CrossLanguageDetector } from './src/parsers/utils/cross-language-detector.js';

// Connect to the production database
const dbPath = process.env.PROD_DB || `${process.env.HOME}/.module-sentinel/prod/module-sentinel.db`;
console.log(`Connecting to database at: ${dbPath}`);

const db = Database(dbPath);
const drizzleDb = drizzle(db, { schema });

async function analyzeProjects() {
  // Get all projects
  const projects = await drizzleDb.select().from(schema.projects);
  console.log(`\nFound ${projects.length} projects:`);
  projects.forEach(p => console.log(`  - ${p.name} (ID: ${p.id})`));
}

async function analyzeCrossLanguageRelationships(projectId: number) {
  console.log(`\n=== Analyzing cross-language relationships for project ${projectId} ===`);
  
  // Get all relationships for the project
  const relationships = await drizzleDb
    .select({
      id: schema.universalRelationships.id,
      type: schema.universalRelationships.type,
      fromSymbolId: schema.universalRelationships.fromSymbolId,
      toSymbolId: schema.universalRelationships.toSymbolId,
      metadata: schema.universalRelationships.metadata,
      fromSymbol: {
        name: schema.universalSymbols.name,
        qualifiedName: schema.universalSymbols.qualifiedName,
        filePath: schema.universalSymbols.filePath,
        kind: schema.universalSymbols.kind,
      },
      toSymbol: {
        name: sql<string>`ts.name`,
        qualifiedName: sql<string>`ts.qualified_name`,
        filePath: sql<string>`ts.file_path`,
        kind: sql<string>`ts.kind`,
      }
    })
    .from(schema.universalRelationships)
    .innerJoin(
      schema.universalSymbols,
      eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
    )
    .innerJoin(
      sql`universal_symbols as ts`,
      sql`${schema.universalRelationships.toSymbolId} = ts.id`
    )
    .where(eq(schema.universalSymbols.projectId, projectId))
    .limit(1000);

  console.log(`Total relationships found: ${relationships.length}`);
  
  // Filter for potential cross-language relationships
  const crossLangRelationships = relationships.filter(rel => {
    // Check if metadata indicates cross-language
    if (rel.metadata) {
      try {
        const meta = JSON.parse(rel.metadata);
        if (meta.crossLanguage || meta.targetLanguage || meta.crossLanguageType) {
          return true;
        }
      } catch (e) {
        // Not JSON metadata
      }
    }
    
    // Check if file paths indicate different languages
    const fromExt = rel.fromSymbol.filePath.split('.').pop();
    const toExt = rel.toSymbol.filePath.split('.').pop();
    if (fromExt && toExt && fromExt !== toExt) {
      // Different extensions might indicate cross-language
      const langMap: Record<string, string> = {
        'go': 'go', 'py': 'python', 'js': 'javascript', 'ts': 'typescript',
        'java': 'java', 'cpp': 'cpp', 'cc': 'cpp', 'c': 'c', 'rs': 'rust'
      };
      const fromLang = langMap[fromExt];
      const toLang = langMap[toExt];
      if (fromLang && toLang && fromLang !== toLang) {
        return true;
      }
    }
    
    // Check for specific patterns in names
    if (rel.type === 'invokes' || rel.type === 'spawns' || rel.type === 'communicates') {
      // These relationship types might indicate cross-language calls
      return true;
    }
    
    return false;
  });
  
  console.log(`\nPotential cross-language relationships: ${crossLangRelationships.length}`);
  
  // Group by relationship type
  const byType = crossLangRelationships.reduce((acc, rel) => {
    acc[rel.type] = (acc[rel.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log("\nCross-language relationships by type:");
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  // Show some examples
  console.log("\nExample cross-language relationships:");
  crossLangRelationships.slice(0, 10).forEach(rel => {
    console.log(`\n  From: ${rel.fromSymbol.filePath}`);
    console.log(`       ${rel.fromSymbol.qualifiedName || rel.fromSymbol.name} (${rel.fromSymbol.kind})`);
    console.log(`  To:   ${rel.toSymbol.filePath}`);
    console.log(`       ${rel.toSymbol.qualifiedName || rel.toSymbol.name} (${rel.toSymbol.kind})`);
    console.log(`  Type: ${rel.type}`);
    if (rel.metadata) {
      try {
        const meta = JSON.parse(rel.metadata);
        console.log(`  Metadata:`, meta);
      } catch (e) {
        console.log(`  Metadata: ${rel.metadata}`);
      }
    }
  });
}

async function testCrossLanguageDetection() {
  console.log("\n=== Testing CrossLanguageDetector ===");
  
  // Test some example lines from microservices
  const testCases = [
    // Go gRPC client
    {
      line: `client := pb.NewCartServiceClient(conn)`,
      language: 'go',
      filePath: 'checkout/main.go'
    },
    // Go HTTP call
    {
      line: `resp, err := http.Post("http://productcatalog:3550/products", "application/json", bytes.NewBuffer(data))`,
      language: 'go',
      filePath: 'frontend/handlers.go'
    },
    // Python gRPC
    {
      line: `channel = grpc.insecure_channel("recommendationservice:8080")`,
      language: 'python',
      filePath: 'productcatalog/server.py'
    },
    // Node.js spawn
    {
      line: `const python = spawn('python', ['recommendation_engine.py', userId])`,
      language: 'typescript',
      filePath: 'frontend/api.ts'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.line}`);
    const results = CrossLanguageDetector.detectCrossLanguageCalls(
      testCase.line,
      1,
      testCase.language,
      testCase.filePath
    );
    
    if (results.length > 0) {
      results.forEach(result => {
        console.log(`  Detected: ${result.type}`);
        console.log(`  Target: ${result.targetEndpoint}`);
        console.log(`  Confidence: ${result.confidence}`);
        console.log(`  Metadata:`, result.metadata);
      });
    } else {
      console.log(`  No cross-language calls detected`);
    }
  }
}

async function checkSpecificPatterns(projectId: number) {
  console.log(`\n=== Checking specific cross-language patterns in project ${projectId} ===`);
  
  // Query for gRPC-related symbols
  const grpcSymbols = await drizzleDb
    .select()
    .from(schema.universalSymbols)
    .where(
      and(
        eq(schema.universalSymbols.projectId, projectId),
        or(
          sql`${schema.universalSymbols.name} LIKE '%Client%'`,
          sql`${schema.universalSymbols.name} LIKE '%Stub%'`,
          sql`${schema.universalSymbols.name} LIKE '%Service%'`,
          sql`${schema.universalSymbols.qualified_name} LIKE '%grpc%'`
        )
      )
    )
    .limit(20);
  
  console.log(`\nFound ${grpcSymbols.length} potential gRPC-related symbols:`);
  grpcSymbols.forEach(sym => {
    console.log(`  ${sym.qualifiedName || sym.name} (${sym.kind}) in ${sym.filePath}`);
  });
  
  // Query for HTTP/REST API patterns
  const httpSymbols = await drizzleDb
    .select()
    .from(schema.universalSymbols)
    .where(
      and(
        eq(schema.universalSymbols.projectId, projectId),
        or(
          sql`${schema.universalSymbols.name} LIKE '%http%'`,
          sql`${schema.universalSymbols.name} LIKE '%fetch%'`,
          sql`${schema.universalSymbols.name} LIKE '%axios%'`,
          sql`${schema.universalSymbols.name} LIKE '%request%'`
        )
      )
    )
    .limit(20);
  
  console.log(`\nFound ${httpSymbols.length} potential HTTP-related symbols:`);
  httpSymbols.forEach(sym => {
    console.log(`  ${sym.qualifiedName || sym.name} (${sym.kind}) in ${sym.filePath}`);
  });
}

// Run the analysis
async function main() {
  try {
    await analyzeProjects();
    
    // Test the detector
    await testCrossLanguageDetection();
    
    // Analyze each project
    const projects = await drizzleDb.select().from(schema.projects);
    for (const project of projects) {
      await analyzeCrossLanguageRelationships(project.id);
      await checkSpecificPatterns(project.id);
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    db.close();
  }
}

main();