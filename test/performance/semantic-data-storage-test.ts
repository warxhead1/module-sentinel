/**
 * Performance Analysis Test for Semantic Data Storage
 * 
 * This test analyzes the current bottlenecks in our semantic data processing pipeline,
 * particularly focusing on the quadratic explosion of semantic relationships.
 */

import Database from 'better-sqlite3';
import { performance } from 'perf_hooks';

// Test configuration
const TEST_SCENARIOS = [
  { symbols: 100, name: 'Small Project' },
  { symbols: 500, name: 'Medium Project' },
  { symbols: 1000, name: 'Large Project' },
  { symbols: 2000, name: 'Very Large Project' },
  { symbols: 5000, name: 'Enterprise Project' }
];

interface PerformanceMetrics {
  scenario: string;
  symbolCount: number;
  relationshipCount: number;
  embeddingGenerationTime: number;
  relationshipGenerationTime: number;
  databaseWriteTime: number;
  totalTime: number;
  memoryUsedMB: number;
  relationshipsPerSymbol: number;
  timePerRelationship: number;
}

class SemanticDataStorageAnalyzer {
  private db: Database.Database;
  private metrics: PerformanceMetrics[] = [];

  constructor() {
    // Create in-memory database for testing
    this.db = new Database(':memory:');
    this.initializeSchema();
  }

  private initializeSchema() {
    // Simplified schema for testing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_symbols (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        embedding BLOB
      );

      CREATE TABLE IF NOT EXISTS test_relationships (
        id INTEGER PRIMARY KEY,
        from_symbol_id INTEGER NOT NULL,
        to_symbol_id INTEGER NOT NULL,
        similarity REAL NOT NULL,
        relationship_type TEXT NOT NULL,
        FOREIGN KEY (from_symbol_id) REFERENCES test_symbols(id),
        FOREIGN KEY (to_symbol_id) REFERENCES test_symbols(id)
      );

      CREATE INDEX idx_test_relationships_from ON test_relationships(from_symbol_id);
      CREATE INDEX idx_test_relationships_to ON test_relationships(to_symbol_id);
      CREATE INDEX idx_test_relationships_similarity ON test_relationships(similarity);
    `);
  }

  async runAnalysis() {
    console.log('🔬 Semantic Data Storage Performance Analysis');
    console.log('============================================\n');

    for (const scenario of TEST_SCENARIOS) {
      await this.analyzeScenario(scenario);
    }

    this.printAnalysis();
    this.suggestOptimizations();
  }

  private async analyzeScenario(scenario: { symbols: number; name: string }) {
    console.log(`\n📊 Analyzing ${scenario.name} (${scenario.symbols} symbols)...`);
    
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    // Reset database
    this.db.exec('DELETE FROM test_relationships');
    this.db.exec('DELETE FROM test_symbols');

    // 1. Generate test symbols with embeddings
    const embeddingStart = performance.now();
    const symbols = this.generateTestSymbols(scenario.symbols);
    const embeddingTime = performance.now() - embeddingStart;

    // 2. Store symbols
    const storeStart = performance.now();
    this.storeSymbols(symbols);
    performance.now() - storeStart; // Store time tracked but not used in metrics

    // 3. Generate semantic relationships (this is where the explosion happens)
    const relationshipStart = performance.now();
    const relationships = this.generateSemanticRelationships(symbols);
    const relationshipTime = performance.now() - relationshipStart;

    // 4. Store relationships
    const dbWriteStart = performance.now();
    const storedCount = this.storeRelationships(relationships);
    const dbWriteTime = performance.now() - dbWriteStart;

    const totalTime = performance.now() - startTime;
    const memoryUsed = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;

    const metrics: PerformanceMetrics = {
      scenario: scenario.name,
      symbolCount: scenario.symbols,
      relationshipCount: storedCount,
      embeddingGenerationTime: embeddingTime,
      relationshipGenerationTime: relationshipTime,
      databaseWriteTime: dbWriteTime,
      totalTime,
      memoryUsedMB: memoryUsed,
      relationshipsPerSymbol: storedCount / scenario.symbols,
      timePerRelationship: totalTime / storedCount
    };

    this.metrics.push(metrics);
    
    console.log(`  ✓ Generated ${storedCount} relationships`);
    console.log(`  ✓ Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`  ✓ Memory used: ${memoryUsed.toFixed(2)}MB`);
  }

  private generateTestSymbols(count: number): Array<{ id: number; name: string; embedding: Float32Array }> {
    const symbols = [];
    for (let i = 0; i < count; i++) {
      symbols.push({
        id: i + 1,
        name: `Symbol_${i}`,
        embedding: this.generateRandomEmbedding(256) // 256-dimensional embeddings
      });
    }
    return symbols;
  }

  private generateRandomEmbedding(dimensions: number): Float32Array {
    const embedding = new Float32Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = Math.random() * 2 - 1; // Random values between -1 and 1
    }
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
    return embedding;
  }

  private storeSymbols(symbols: Array<{ id: number; name: string; embedding: Float32Array }>) {
    const stmt = this.db.prepare(`
      INSERT INTO test_symbols (id, name, qualified_name, embedding)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((symbols: any[]) => {
      for (const symbol of symbols) {
        stmt.run(
          symbol.id,
          symbol.name,
          `namespace::${symbol.name}`,
          Buffer.from(symbol.embedding.buffer)
        );
      }
    });

    insertMany(symbols);
  }

  private generateSemanticRelationships(symbols: Array<{ id: number; name: string; embedding: Float32Array }>) {
    const relationships = [];
    const SIMILARITY_THRESHOLD = 0.7; // Only store relationships above this threshold
    
    // This is the quadratic explosion problem - comparing every symbol with every other symbol
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const similarity = this.cosineSimilarity(symbols[i].embedding, symbols[j].embedding);
        
        if (similarity >= SIMILARITY_THRESHOLD) {
          relationships.push({
            from_id: symbols[i].id,
            to_id: symbols[j].id,
            similarity,
            type: this.inferRelationshipType(similarity)
          });
        }
      }
    }
    
    return relationships;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct; // Assumes normalized vectors
  }

  private inferRelationshipType(similarity: number): string {
    if (similarity >= 0.95) return 'near_duplicate';
    if (similarity >= 0.85) return 'very_similar';
    if (similarity >= 0.75) return 'similar';
    return 'related';
  }

  private storeRelationships(relationships: Array<{ from_id: number; to_id: number; similarity: number; type: string }>): number {
    if (relationships.length === 0) return 0;

    const stmt = this.db.prepare(`
      INSERT INTO test_relationships (from_symbol_id, to_symbol_id, similarity, relationship_type)
      VALUES (?, ?, ?, ?)
    `);

    const BATCH_SIZE = 1000;
    let stored = 0;

    // Batch insert for better performance
    for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
      const batch = relationships.slice(i, i + BATCH_SIZE);
      
      const insertBatch = this.db.transaction((batch: any[]) => {
        for (const rel of batch) {
          stmt.run(rel.from_id, rel.to_id, rel.similarity, rel.type);
        }
      });
      
      insertBatch(batch);
      stored += batch.length;
    }

    return stored;
  }

  private printAnalysis() {
    console.log('\n\n📈 Performance Analysis Results');
    console.log('================================\n');

    console.log('| Scenario | Symbols | Relationships | Rels/Symbol | Total Time | Memory | Time/Rel |');
    console.log('|----------|---------|---------------|-------------|------------|--------|----------|');
    
    for (const m of this.metrics) {
      console.log(
        `| ${m.scenario.padEnd(8)} | ${m.symbolCount.toString().padStart(7)} | ${
          m.relationshipCount.toString().padStart(13)
        } | ${m.relationshipsPerSymbol.toFixed(1).padStart(11)} | ${
          m.totalTime.toFixed(0).padStart(8)
        }ms | ${m.memoryUsedMB.toFixed(1).padStart(5)}MB | ${
          m.timePerRelationship.toFixed(3).padStart(6)
        }ms |`
      );
    }

    console.log('\n\n⏱️  Time Breakdown');
    console.log('==================\n');

    for (const m of this.metrics) {
      console.log(`${m.scenario}:`);
      console.log(`  Embedding Generation: ${m.embeddingGenerationTime.toFixed(2)}ms`);
      console.log(`  Relationship Generation: ${m.relationshipGenerationTime.toFixed(2)}ms`);
      console.log(`  Database Write: ${m.databaseWriteTime.toFixed(2)}ms`);
      console.log(`  Total: ${m.totalTime.toFixed(2)}ms\n`);
    }
  }

  private suggestOptimizations() {
    console.log('\n\n💡 Optimization Recommendations');
    console.log('================================\n');

    console.log('1. **Relationship Reduction Strategies**:');
    console.log('   - Increase similarity threshold (current: 0.7)');
    console.log('   - Use locality-sensitive hashing (LSH) for approximate nearest neighbors');
    console.log('   - Implement hierarchical clustering to group similar symbols');
    console.log('   - Only store top-K relationships per symbol\n');

    console.log('2. **Storage Optimizations**:');
    console.log('   - Use compressed embedding storage (quantization)');
    console.log('   - Implement relationship pruning (remove low-value relationships)');
    console.log('   - Use sparse matrix representation for relationships');
    console.log('   - Consider graph database for relationship-heavy data\n');

    console.log('3. **Processing Optimizations**:');
    console.log('   - Parallelize relationship generation');
    console.log('   - Use SIMD operations for similarity calculations');
    console.log('   - Implement streaming/incremental processing');
    console.log('   - Cache frequently accessed relationships\n');

    console.log('4. **Architectural Changes**:');
    console.log('   - Move relationship generation to background jobs');
    console.log('   - Implement on-demand relationship calculation');
    console.log('   - Use approximate algorithms (LSH, random projection)');
    console.log('   - Consider external vector database (Pinecone, Weaviate, Qdrant)\n');

    // Calculate growth rate
    if (this.metrics.length >= 2) {
      const first = this.metrics[0];
      const last = this.metrics[this.metrics.length - 1];
      const symbolGrowth = last.symbolCount / first.symbolCount;
      const relationshipGrowth = last.relationshipCount / first.relationshipCount;
      const growthRate = relationshipGrowth / (symbolGrowth * symbolGrowth);

      console.log(`⚠️  Relationship Growth Analysis:`);
      console.log(`   Symbol increase: ${symbolGrowth.toFixed(1)}x`);
      console.log(`   Relationship increase: ${relationshipGrowth.toFixed(1)}x`);
      console.log(`   Growth rate: ${growthRate.toFixed(2)} (ideal: 1.0 for O(n²))\n`);
    }
  }
}

// Run the analysis
async function main() {
  const analyzer = new SemanticDataStorageAnalyzer();
  await analyzer.runAnalysis();
}

main().catch(console.error);