# Module Sentinel Rust - Foundational Phase Spec

## Overview

Before diving into language-specific parsing, we need to complete the foundational layer that enables universal symbol sorting and cross-language understanding. This spec focuses on **essential components only** - no over-engineering, just what's needed to make the system work effectively.

## Current State Assessment

### ✅ What We Have (Strong Foundation)
- Advanced 3-tier caching system (LRU, Hierarchical, Predictive)
- Universal AST with visitor pattern
- Pattern engine with YAML definitions
- Semantic deduplication framework
- Comprehensive test coverage

### 🔧 What We Need (4 Core Components)

## Component 1: Database Persistence Layer

**Purpose**: Connect our in-memory caches to persistent storage for project-scale analysis

### Simple Implementation
```rust
pub struct ProjectDatabase {
    conn: SqliteConnection,
    symbol_cache: Arc<CachedSemanticDeduplicator>,
    bloom_filter: SymbolBloomFilter,
}

impl ProjectDatabase {
    pub async fn new(project_path: &Path) -> Result<Self>;
    pub async fn store_symbols(&self, symbols: &[Symbol]) -> Result<()>;
    pub async fn load_symbols(&self, project_id: i32) -> Result<Vec<Symbol>>;
    pub async fn find_duplicates_across_files(&self) -> Result<Vec<DuplicateGroup>>;
}
```

**Schema** (Minimal, focused):
```sql
CREATE TABLE symbols (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    signature TEXT NOT NULL,
    language TEXT NOT NULL,
    file_path TEXT NOT NULL,
    embedding BLOB,                    -- For semantic similarity
    semantic_hash TEXT,                -- For fast duplicate detection
    duplicate_of INTEGER REFERENCES symbols(id)
);

CREATE TABLE symbol_relationships (
    id INTEGER PRIMARY KEY,
    from_symbol INTEGER REFERENCES symbols(id),
    to_symbol INTEGER REFERENCES symbols(id),
    relationship_type TEXT NOT NULL,   -- calls, extends, imports
    confidence REAL DEFAULT 1.0
);
```

**Performance Target**: Store 100K symbols in <5 seconds

---

## Component 2: Bloom Filter Integration

**Purpose**: Fast duplicate detection to avoid expensive similarity calculations

### Simple Implementation
```rust
pub struct SymbolBloomFilter {
    filter: bloomfilter::Bloom<String>,
    inserted_count: usize,
    false_positive_rate: f64,
}

impl SymbolBloomFilter {
    pub fn new(expected_symbols: usize) -> Self;
    pub fn insert(&mut self, symbol: &Symbol);
    pub fn might_contain(&self, symbol: &Symbol) -> bool;
    pub fn stats(&self) -> BloomFilterStats;
}

// Integration with existing cache
impl CachedSemanticDeduplicator {
    pub async fn find_duplicates_with_bloom(&self, symbols: &[Symbol]) -> Result<Vec<DuplicateGroup>> {
        // 1. Quick bloom filter check
        // 2. Only compute expensive similarity for potential matches
        // 3. Use existing cache for similarity scores
    }
}
```

**Performance Target**: <0.1ms lookup, <1% false positive rate

---

## Component 3: Universal Symbol Coordinator

**Purpose**: Orchestrate symbol processing across all languages into a unified format

### Simple Implementation
```rust
pub struct UniversalSymbolCoordinator {
    database: ProjectDatabase,
    language_parsers: HashMap<Language, Box<dyn LanguageParser>>,
    symbol_normalizer: SymbolNormalizer,
}

pub struct SymbolNormalizer {
    // Convert language-specific symbols to universal format
    // Handle cross-language type mappings (int -> i32 -> integer)
    // Normalize naming conventions (camelCase -> snake_case)
}

impl UniversalSymbolCoordinator {
    pub async fn process_project(&self, project_path: &Path) -> Result<UniversalSortingIndex>;
    pub async fn get_cross_language_relationships(&self) -> Result<Vec<CrossLanguageLink>>;
}

pub struct UniversalSortingIndex {
    pub symbols_by_similarity: Vec<Vec<Symbol>>,    // Grouped by semantic similarity
    pub cross_language_links: Vec<CrossLanguageLink>,
    pub duplicate_groups: Vec<DuplicateGroup>,
}
```

**Key Features**:
- Language-agnostic symbol representation
- Cross-language type mapping
- Unified relationship tracking

---

## Component 4: Simple File Change Tracker

**Purpose**: Only re-parse what changed, not entire projects

### Simple Implementation
```rust
pub struct FileChangeTracker {
    file_hashes: HashMap<PathBuf, u64>,
    last_scan: SystemTime,
}

impl FileChangeTracker {
    pub fn new() -> Self;
    pub async fn scan_for_changes(&mut self, project_path: &Path) -> Result<Vec<PathBuf>>;
    pub fn mark_processed(&mut self, file: &Path, hash: u64);
}

// Integration with coordinator
impl UniversalSymbolCoordinator {
    pub async fn incremental_update(&self, changed_files: &[PathBuf]) -> Result<()> {
        // 1. Parse only changed files
        // 2. Update relationships that might be affected
        // 3. Re-run deduplication on affected symbols only
    }
}
```

**Performance Target**: 1000-file project scan in <100ms

---

## Implementation Order & Timeline

### Week 1: Database Foundation
1. **Day 1-2**: Implement `ProjectDatabase` with basic SQLite schema
2. **Day 3-4**: Connect existing caches to database persistence
3. **Day 5**: Write integration tests with realistic symbol counts

### Week 2: Bloom Filter & Performance
1. **Day 1-2**: Implement `SymbolBloomFilter` and integrate with deduplicator
2. **Day 3-4**: Benchmark and tune bloom filter parameters
3. **Day 5**: Performance testing with 100K+ symbols

### Week 3: Universal Coordination
1. **Day 1-3**: Build `UniversalSymbolCoordinator` and `SymbolNormalizer`
2. **Day 4-5**: Implement cross-language type mapping and relationship tracking

### Week 4: Incremental Updates
1. **Day 1-2**: Implement `FileChangeTracker`
2. **Day 3-4**: Build incremental update logic
3. **Day 5**: End-to-end testing with full project workflows

---

## Success Criteria (Simple & Measurable)

### Functional Requirements
- ✅ Store and retrieve 100K symbols without data loss
- ✅ Detect duplicates across multiple files in same project
- ✅ Handle incremental updates for changed files only
- ✅ Provide unified symbol representation across languages

### Performance Requirements
- ✅ Full project analysis: <30 seconds for 50K LOC
- ✅ Incremental updates: <5 seconds for 10 changed files
- ✅ Memory usage: <2GB for large projects
- ✅ Database size: <100MB for 100K symbols

### Quality Requirements
- ✅ Duplicate detection accuracy: >95%
- ✅ False positive rate: <1%
- ✅ Cross-language relationship accuracy: >90%

---

## Design Principles

### 1. **Simplicity First**
- One responsibility per component
- Clear interfaces between components
- Minimal configuration required

### 2. **Performance by Design**
- Bloom filters for fast filtering
- LRU caches for hot data
- Incremental processing for large projects

### 3. **Extensibility Without Complexity**
- Plugin interfaces for new languages
- Configurable similarity thresholds
- Optional advanced features

### 4. **Battle-tested Foundations**
- SQLite for reliable persistence
- Established caching patterns
- Proven algorithms (bloom filters, LRU)

---

## Integration Points

### With Existing Caching
```rust
// Existing cache becomes the hot layer above persistent storage
ProjectDatabase -> CachedSemanticDeduplicator -> SymbolBloomFilter
```

### With Future Language Parsers
```rust
// Language parsers feed into universal coordinator
CppParser -> UniversalSymbolCoordinator -> ProjectDatabase
TypeScriptParser -> UniversalSymbolCoordinator -> ProjectDatabase
```

### With Pattern Engine
```rust
// Pattern engine helps with symbol normalization
PatternEngine -> SymbolNormalizer -> UniversalSymbolCoordinator
```

---

## Non-Goals (Avoiding Over-Engineering)

### ❌ What We're NOT Building
- Distributed database systems
- Complex ML embedding models
- Real-time collaborative editing
- Advanced visualization engines
- Custom query languages
- Complex plugin architectures

### ❌ Premature Optimizations We're Avoiding
- Custom memory allocators
- Lock-free data structures
- Custom serialization formats
- Complex sharding strategies
- Advanced compression algorithms

---

## Ready for Language-Specific Work

After completing these 4 components, we'll have:

1. **Persistent storage** for symbols and relationships
2. **Fast duplicate detection** with bloom filters
3. **Unified symbol representation** across languages
4. **Incremental processing** for large projects

This foundation will enable us to focus on language-specific parsing (C++, TypeScript, Python, etc.) without worrying about the underlying infrastructure.

**The goal is to build something that works reliably, performs well, and can be extended - not to build the most sophisticated system possible.**