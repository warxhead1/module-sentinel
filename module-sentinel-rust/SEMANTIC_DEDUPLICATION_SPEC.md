# Semantic Deduplication Implementation Spec

## Overview

Implement intelligent symbol deduplication using ML embeddings and probabilistic data structures to efficiently identify semantically similar code symbols across languages.

## Core Components

### 1. SemanticDeduplicator

**Purpose**: Main orchestrator for semantic similarity detection
**Location**: `src/database/semantic_deduplicator.rs`

```rust
pub struct SemanticDeduplicator {
    embedder: Arc<CodeEmbedder>,
    bloom_filter: SymbolBloomFilter,
    similarity_cache: Arc<DashMap<String, f32>>,
    threshold_config: SimilarityThresholds,
}

pub struct SimilarityThresholds {
    pub high_confidence: f32,     // 0.9+ - Definitely same symbol
    pub medium_confidence: f32,   // 0.7+ - Likely same symbol  
    pub low_confidence: f32,      // 0.5+ - Possibly same symbol
}
```

**Key Methods**:
- `are_similar(&self, symbol1: &Symbol, symbol2: &Symbol) -> bool`
- `similarity_score(&self, symbol1: &Symbol, symbol2: &Symbol) -> f32`
- `find_duplicates(&self, symbols: &[Symbol]) -> Vec<DuplicateGroup>`
- `merge_similar_symbols(&self, symbols: Vec<Symbol>) -> Vec<Symbol>`

### 2. SymbolBloomFilter

**Purpose**: Fast probabilistic duplicate detection
**Location**: `src/database/bloom_filter.rs`

```rust
pub struct SymbolBloomFilter {
    filter: BloomFilter<SymbolKey>,
    capacity: usize,
    false_positive_rate: f64,
}

pub struct SymbolKey {
    pub name_hash: u64,
    pub signature_hash: u64,
    pub context_hash: u64,
}
```

**Performance Requirements**:
- `insert()`: O(1) average, <1ms
- `might_contain()`: O(1) average, <0.1ms
- Memory usage: <100MB for 1M symbols
- False positive rate: <1%

### 3. Enhanced Symbol Structure

**Location**: `src/database/symbol.rs`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub id: SymbolId,
    pub name: String,
    pub signature: String,
    pub language: Language,
    pub file_path: String,
    pub start_line: u32,
    pub end_line: u32,
    
    // Semantic fields
    pub embedding: Option<Vec<f32>>,
    pub semantic_hash: Option<String>,
    pub normalized_name: String,
    pub context_embedding: Option<Vec<f32>>,
    
    // Deduplication metadata
    pub duplicate_of: Option<SymbolId>,
    pub confidence_score: Option<f32>,
    pub similar_symbols: Vec<SimilarSymbol>,
}

#[derive(Debug, Clone)]
pub struct SimilarSymbol {
    pub symbol_id: SymbolId,
    pub similarity_score: f32,
    pub relationship_type: SimilarityType,
}

#[derive(Debug, Clone)]
pub enum SimilarityType {
    ExactDuplicate,      // 0.95+
    SemanticDuplicate,   // 0.8+
    FunctionalSimilar,   // 0.6+
    NameSimilar,         // 0.4+
}
```

## Implementation Phases

### Phase 1: Basic Semantic Similarity (Current)

**Test Cases**:
```rust
#[test]
fn test_exact_name_similarity() {
    let dedup = SemanticDeduplicator::new();
    let s1 = create_symbol("calculateSum", "fn(Vec<i32>) -> i32");
    let s2 = create_symbol("calculateSum", "fn(Vec<i32>) -> i32");
    assert_eq!(dedup.similarity_score(&s1, &s2), 1.0);
}

#[test]
fn test_semantic_name_similarity() {
    let dedup = SemanticDeduplicator::new();
    let s1 = create_symbol("calculateSum", "fn(Vec<i32>) -> i32");
    let s2 = create_symbol("calc_sum", "fn(Vec<i32>) -> i32");
    assert!(dedup.similarity_score(&s1, &s2) > 0.8);
}

#[test]
fn test_cross_language_similarity() {
    let dedup = SemanticDeduplicator::new();
    let rust_fn = create_symbol("calculate_sum", "fn(Vec<i32>) -> i32");
    let py_fn = create_symbol("calculate_sum", "def(List[int]) -> int");
    assert!(dedup.similarity_score(&rust_fn, &py_fn) > 0.7);
}
```

### Phase 2: Embedding-Based Similarity

**Similarity Algorithm**:
1. **Name Similarity** (30% weight):
   - Levenshtein distance
   - Camel/snake case normalization
   - Abbreviation expansion (calc → calculate)

2. **Signature Similarity** (40% weight):
   - Parameter count and types
   - Return type matching
   - Cross-language type mapping

3. **Context Similarity** (20% weight):
   - Surrounding code embedding
   - Usage patterns
   - Call graph similarity

4. **Semantic Embedding** (10% weight):
   - Code embeddings from ML model
   - Learned semantic relationships

### Phase 3: Bloom Filter Optimization

**Implementation**:
```rust
impl SymbolBloomFilter {
    pub fn new(expected_items: usize, false_positive_rate: f64) -> Self {
        let optimal_bits = Self::calculate_optimal_bits(expected_items, false_positive_rate);
        let optimal_hashes = Self::calculate_optimal_hashes(expected_items, optimal_bits);
        
        Self {
            filter: BloomFilter::new(optimal_bits, optimal_hashes),
            capacity: expected_items,
            false_positive_rate,
        }
    }
    
    pub fn insert(&mut self, key: &SymbolKey) {
        // Use multiple hash functions on different symbol aspects
        let hashes = [
            key.name_hash,
            key.signature_hash, 
            key.context_hash,
            key.combined_hash(),
        ];
        
        for hash in hashes {
            self.filter.set(hash as usize % self.filter.len());
        }
    }
}
```

### Phase 4: Database Integration

**Schema Updates**:
```sql
-- Add deduplication columns to symbols table
ALTER TABLE symbols ADD COLUMN embedding BLOB;
ALTER TABLE symbols ADD COLUMN semantic_hash TEXT;
ALTER TABLE symbols ADD COLUMN normalized_name TEXT;
ALTER TABLE symbols ADD COLUMN duplicate_of INTEGER REFERENCES symbols(id);
ALTER TABLE symbols ADD COLUMN confidence_score REAL;

-- Create similarity relationships table
CREATE TABLE symbol_similarities (
    id INTEGER PRIMARY KEY,
    symbol1_id INTEGER REFERENCES symbols(id),
    symbol2_id INTEGER REFERENCES symbols(id),
    similarity_score REAL NOT NULL,
    similarity_type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol1_id, symbol2_id)
);

-- Create indexes for performance
CREATE INDEX idx_symbols_semantic_hash ON symbols(semantic_hash);
CREATE INDEX idx_symbols_normalized_name ON symbols(normalized_name);
CREATE INDEX idx_similarities_score ON symbol_similarities(similarity_score);
```

**Batch Processing**:
```rust
pub struct BatchDeduplicator {
    deduplicator: SemanticDeduplicator,
    batch_size: usize,
    db_pool: Arc<SqlitePool>,
}

impl BatchDeduplicator {
    pub async fn deduplicate_project(&self, project_id: i32) -> Result<DeduplicationStats> {
        let symbols = self.load_symbols_batch(project_id).await?;
        let mut stats = DeduplicationStats::default();
        
        for batch in symbols.chunks(self.batch_size) {
            let duplicates = self.deduplicator.find_duplicates(batch).await?;
            self.update_database(&duplicates).await?;
            stats.merge(duplicates.len());
        }
        
        Ok(stats)
    }
}
```

## Performance Requirements

### Throughput
- **Symbol similarity**: <10ms per comparison
- **Batch deduplication**: >1000 symbols/second
- **Bloom filter lookup**: <0.1ms

### Memory Usage
- **In-memory cache**: <500MB for active symbols
- **Bloom filter**: <100MB for 1M symbols
- **Embedding storage**: <50MB for 10K symbols

### Accuracy Targets
- **Precision**: >95% (few false positives)
- **Recall**: >90% (find most duplicates) 
- **False positive rate**: <1%

## Error Handling & Edge Cases

### Malformed Symbols
```rust
impl SemanticDeduplicator {
    fn validate_symbol(&self, symbol: &Symbol) -> Result<(), ValidationError> {
        if symbol.name.is_empty() {
            return Err(ValidationError::EmptyName);
        }
        if symbol.signature.len() > MAX_SIGNATURE_LENGTH {
            return Err(ValidationError::SignatureTooLong);
        }
        // ... more validations
        Ok(())
    }
}
```

### Memory Pressure
- Implement LRU cache eviction
- Stream processing for large datasets
- Configurable batch sizes

### Cross-Language Edge Cases
- Handle language-specific naming conventions
- Map equivalent types across languages
- Consider different paradigms (OOP vs functional)

## Testing Strategy

### Unit Tests
- Individual similarity algorithms
- Bloom filter operations
- Database operations

### Integration Tests
- End-to-end deduplication workflow
- Cross-language similarity
- Performance benchmarks

### Property-Based Tests
- Similarity transitivity
- Commutative property
- Reflexive property (symbol similar to itself)

This spec provides the detailed implementation roadmap for semantic deduplication while building on the existing ML foundation.