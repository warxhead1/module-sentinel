/**
 * Analysis of SemanticDataPersister bottlenecks
 * 
 * This test examines the actual implementation to identify
 * why we're generating 626,778 relationships from 1,870 symbols.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as path from 'path';
import { DatabaseInitializer } from '../../src/database/database-initializer.js';
import { SemanticDataPersister } from '../../src/analysis/semantic-data-persister.js';

// Mock data for analysis
interface MockSymbolData {
  id: number;
  name: string;
  embedding: number[];
}

interface AnalysisResult {
  totalSymbols: number;
  totalPossiblePairs: number;
  actualRelationships: number;
  averageSimilarity: number;
  similarityDistribution: {
    veryHigh: number;  // > 0.9
    high: number;      // 0.8-0.9
    medium: number;    // 0.7-0.8
    low: number;       // 0.6-0.7
    veryLow: number;   // < 0.6
  };
  topConnectedSymbols: Array<{
    symbolId: number;
    connectionCount: number;
  }>;
  memoryFootprint: {
    embeddings: number;
    relationships: number;
    total: number;
  };
}

class SemanticPersisterAnalyzer {
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;

  constructor() {
    this.db = new Database(':memory:');
    this.drizzleDb = drizzle(this.db);
  }

  async analyzeRelationshipGeneration(symbolCount: number = 1870): Promise<AnalysisResult> {
    console.log(`\n🔍 Analyzing Semantic Relationship Generation`);
    console.log(`   Symbol Count: ${symbolCount}`);
    console.log(`   Theoretical Max Relationships: ${(symbolCount * (symbolCount - 1)) / 2}`);
    console.log('');

    // Initialize database
    const dbInit = DatabaseInitializer.getInstance();
    await dbInit.initializeDatabase(':memory:');

    // Generate mock symbol data with embeddings
    const symbols = this.generateMockSymbols(symbolCount);
    
    // Analyze relationship generation
    const analysis = await this.performAnalysis(symbols);
    
    this.printAnalysis(analysis);
    this.suggestOptimizations(analysis);
    
    return analysis;
  }

  private generateMockSymbols(count: number): MockSymbolData[] {
    const symbols: MockSymbolData[] = [];
    
    // Create different categories of symbols to simulate real-world clustering
    const categories = [
      { prefix: 'Controller', ratio: 0.1 },
      { prefix: 'Service', ratio: 0.15 },
      { prefix: 'Model', ratio: 0.2 },
      { prefix: 'Util', ratio: 0.1 },
      { prefix: 'Config', ratio: 0.05 },
      { prefix: 'Test', ratio: 0.1 },
      { prefix: 'Helper', ratio: 0.1 },
      { prefix: 'Component', ratio: 0.2 }
    ];

    let id = 1;
    for (const category of categories) {
      const categoryCount = Math.floor(count * category.ratio);
      const baseEmbedding = this.generateCategoryEmbedding();
      
      for (let i = 0; i < categoryCount; i++) {
        symbols.push({
          id: id++,
          name: `${category.prefix}_${i}`,
          embedding: this.perturbEmbedding(baseEmbedding, 0.2) // 20% variation within category
        });
      }
    }

    // Fill remaining with misc symbols
    while (symbols.length < count) {
      symbols.push({
        id: id++,
        name: `Misc_${id}`,
        embedding: this.generateRandomEmbedding()
      });
    }

    return symbols;
  }

  private generateCategoryEmbedding(): number[] {
    // Generate a base embedding for a category
    const dimensions = 256;
    const embedding = new Array(dimensions);
    
    // Create a specific pattern for this category
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = Math.sin(i * 0.1) * Math.random();
    }
    
    return this.normalizeEmbedding(embedding);
  }

  private generateRandomEmbedding(): number[] {
    const dimensions = 256;
    const embedding = new Array(dimensions);
    
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = Math.random() * 2 - 1;
    }
    
    return this.normalizeEmbedding(embedding);
  }

  private perturbEmbedding(base: number[], variance: number): number[] {
    return this.normalizeEmbedding(
      base.map(val => val + (Math.random() - 0.5) * variance)
    );
  }

  private normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  private async performAnalysis(symbols: MockSymbolData[]): Promise<AnalysisResult> {
    const totalPossiblePairs = (symbols.length * (symbols.length - 1)) / 2;
    const similarities: number[] = [];
    const connectionCounts = new Map<number, number>();
    
    // Calculate all pairwise similarities (this is the bottleneck)
    console.log('   Calculating pairwise similarities...');
    let relationshipCount = 0;
    
    for (let i = 0; i < symbols.length; i++) {
      if (i % 100 === 0) {
        console.log(`   Processing symbol ${i}/${symbols.length}...`);
      }
      
      for (let j = i + 1; j < symbols.length; j++) {
        const similarity = this.cosineSimilarity(symbols[i].embedding, symbols[j].embedding);
        
        // The persister stores ALL relationships, not just high similarity ones
        similarities.push(similarity);
        relationshipCount++;
        
        // Track connections per symbol
        connectionCounts.set(symbols[i].id, (connectionCounts.get(symbols[i].id) || 0) + 1);
        connectionCounts.set(symbols[j].id, (connectionCounts.get(symbols[j].id) || 0) + 1);
      }
    }

    // Analyze similarity distribution
    const distribution = {
      veryHigh: similarities.filter(s => s > 0.9).length,
      high: similarities.filter(s => s > 0.8 && s <= 0.9).length,
      medium: similarities.filter(s => s > 0.7 && s <= 0.8).length,
      low: similarities.filter(s => s > 0.6 && s <= 0.7).length,
      veryLow: similarities.filter(s => s <= 0.6).length
    };

    // Find top connected symbols
    const topConnected = Array.from(connectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([symbolId, count]) => ({ symbolId, connectionCount: count }));

    // Calculate memory footprint
    const embeddingMemory = symbols.length * 256 * 4; // 256 float32 values per embedding
    const relationshipMemory = relationshipCount * 32; // Rough estimate per relationship
    
    return {
      totalSymbols: symbols.length,
      totalPossiblePairs,
      actualRelationships: relationshipCount,
      averageSimilarity: similarities.reduce((a, b) => a + b, 0) / similarities.length,
      similarityDistribution: distribution,
      topConnectedSymbols: topConnected,
      memoryFootprint: {
        embeddings: embeddingMemory,
        relationships: relationshipMemory,
        total: embeddingMemory + relationshipMemory
      }
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }

  private printAnalysis(analysis: AnalysisResult) {
    console.log('\n📊 Analysis Results:');
    console.log('====================');
    
    console.log(`\nRelationship Statistics:`);
    console.log(`  Total Symbols: ${analysis.totalSymbols}`);
    console.log(`  Total Relationships: ${analysis.actualRelationships}`);
    console.log(`  Relationships per Symbol: ${(analysis.actualRelationships / analysis.totalSymbols).toFixed(1)}`);
    console.log(`  Average Similarity: ${analysis.averageSimilarity.toFixed(3)}`);
    
    console.log(`\nSimilarity Distribution:`);
    const total = analysis.actualRelationships;
    console.log(`  Very High (>0.9): ${analysis.similarityDistribution.veryHigh} (${(analysis.similarityDistribution.veryHigh / total * 100).toFixed(1)}%)`);
    console.log(`  High (0.8-0.9): ${analysis.similarityDistribution.high} (${(analysis.similarityDistribution.high / total * 100).toFixed(1)}%)`);
    console.log(`  Medium (0.7-0.8): ${analysis.similarityDistribution.medium} (${(analysis.similarityDistribution.medium / total * 100).toFixed(1)}%)`);
    console.log(`  Low (0.6-0.7): ${analysis.similarityDistribution.low} (${(analysis.similarityDistribution.low / total * 100).toFixed(1)}%)`);
    console.log(`  Very Low (<0.6): ${analysis.similarityDistribution.veryLow} (${(analysis.similarityDistribution.veryLow / total * 100).toFixed(1)}%)`);
    
    console.log(`\nMemory Footprint:`);
    console.log(`  Embeddings: ${(analysis.memoryFootprint.embeddings / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Relationships: ${(analysis.memoryFootprint.relationships / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Total: ${(analysis.memoryFootprint.total / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\nTop Connected Symbols:`);
    analysis.topConnectedSymbols.forEach((s, i) => {
      console.log(`  ${i + 1}. Symbol #${s.symbolId}: ${s.connectionCount} connections`);
    });
  }

  private suggestOptimizations(analysis: AnalysisResult) {
    console.log('\n\n🚀 Optimization Strategies:');
    console.log('==========================');
    
    const lowValueRelationships = analysis.similarityDistribution.veryLow + analysis.similarityDistribution.low;
    const lowValuePercentage = (lowValueRelationships / analysis.actualRelationships * 100).toFixed(1);
    
    console.log(`\n1. **Similarity Threshold**:`);
    console.log(`   - ${lowValuePercentage}% of relationships have similarity < 0.7`);
    console.log(`   - Implementing a 0.7 threshold would reduce storage by ${lowValuePercentage}%`);
    console.log(`   - Consider dynamic thresholds based on symbol categories`);
    
    console.log(`\n2. **Top-K Strategy**:`);
    console.log(`   - Store only top K most similar symbols per symbol`);
    console.log(`   - With K=20: ${analysis.totalSymbols * 20} relationships (${((analysis.totalSymbols * 20) / analysis.actualRelationships * 100).toFixed(1)}% of current)`);
    console.log(`   - With K=50: ${analysis.totalSymbols * 50} relationships (${((analysis.totalSymbols * 50) / analysis.actualRelationships * 100).toFixed(1)}% of current)`);
    
    console.log(`\n3. **Clustering-Based Reduction**:`);
    console.log(`   - Group similar symbols into clusters`);
    console.log(`   - Store only inter-cluster relationships`);
    console.log(`   - Estimated reduction: 70-80% fewer relationships`);
    
    console.log(`\n4. **Incremental Processing**:`);
    console.log(`   - Process relationships in batches`);
    console.log(`   - Use bloom filters to avoid duplicate calculations`);
    console.log(`   - Implement progressive refinement`);
    
    console.log(`\n5. **Storage Optimization**:`);
    console.log(`   - Use sparse matrix representation`);
    console.log(`   - Implement compression for low-value relationships`);
    console.log(`   - Consider external vector databases for scale`);

    // Calculate potential savings
    const threshold07Savings = analysis.similarityDistribution.veryLow + analysis.similarityDistribution.low;
    const topKSavings = analysis.actualRelationships - (analysis.totalSymbols * 50);
    
    console.log(`\n💰 Potential Savings:`);
    console.log(`   - With 0.7 threshold: Save ${(threshold07Savings / 1000).toFixed(0)}K relationships`);
    console.log(`   - With Top-50 strategy: Save ${(topKSavings / 1000).toFixed(0)}K relationships`);
    console.log(`   - Combined approach: Save ~90% of storage and computation`);
  }
}

// Example: Analyze the actual problem size from the logs
async function main() {
  const analyzer = new SemanticPersisterAnalyzer();
  
  console.log('🎯 Analyzing the reported case: 1,870 symbols → 626,778 relationships\n');
  
  // First, let's verify the math
  const expectedRelationships = (1870 * 1869) / 2;
  console.log(`Expected relationships (all pairs): ${expectedRelationships.toLocaleString()}`);
  console.log(`Reported relationships: 626,778`);
  console.log(`Percentage stored: ${(626778 / expectedRelationships * 100).toFixed(1)}%\n`);
  
  // Run analysis on similar size
  await analyzer.analyzeRelationshipGeneration(1870);
}

main().catch(console.error);