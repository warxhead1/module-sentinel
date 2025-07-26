# Unified Rust Parser Implementation Spec

## Executive Summary

This spec defines a unified, extensible parser architecture in Rust that adapts quickly to language evolution. By unifying common patterns across languages while maintaining flexibility for language-specific features, we achieve:
- **10-50x performance improvement** over TypeScript
- **Rapid language updates** through pattern-based extensions
- **Zero-downtime language evolution** with hot-reloadable patterns
- **Universal AST abstraction** that works across all languages

## Architecture Overview

### Core Design Principles

1. **Pattern-First Architecture**: Languages are defined by patterns, not hard-coded logic
2. **Universal AST Layer**: Common representation for all language constructs
3. **Composable Analyzers**: Mix-and-match analysis capabilities
4. **Hot-Reloadable Patterns**: Update language support without recompiling
5. **Performance by Default**: Zero-copy parsing, parallel processing, memory mapping

## Detailed Component Specifications

### 1. Universal Parser Trait System

```rust
// Core trait that all language implementations must satisfy
trait UniversalParser: Send + Sync {
    // Language metadata
    fn language_id(&self) -> &str;
    fn supported_extensions(&self) -> &[&str];
    fn language_version(&self) -> Version;
    
    // Core parsing with universal AST output
    async fn parse(&self, source: Source) -> Result<UniversalAst>;
    
    // Pattern-based symbol extraction
    fn extract_symbols(&self, ast: &UniversalAst) -> Result<Vec<Symbol>>;
    
    // Relationship detection using pattern matching
    fn detect_relationships(&self, ast: &UniversalAst) -> Result<Vec<Relationship>>;
    
    // Language-specific features as capabilities
    fn capabilities(&self) -> Capabilities;
}

// Source input abstraction
enum Source {
    Text(String),
    File(PathBuf),
    MemoryMapped(Mmap),
    Stream(Box<dyn AsyncRead>),
}
```

### 2. Universal AST Representation

```rust
// Language-agnostic AST that captures all constructs
struct UniversalAst {
    root: NodeId,
    nodes: Arena<UniversalNode>,
    source_map: SourceMap,
    language_hints: HashMap<NodeId, LanguageHint>,
}

enum UniversalNode {
    // Structural nodes (common across languages)
    Module { name: String, exports: Vec<NodeId> },
    Class { name: String, base: Option<NodeId>, members: Vec<NodeId> },
    Function { name: String, params: Vec<NodeId>, body: NodeId },
    Interface { name: String, extends: Vec<NodeId> },
    Namespace { name: String, children: Vec<NodeId> },
    
    // Expression nodes
    Call { target: NodeId, args: Vec<NodeId> },
    MemberAccess { object: NodeId, member: String },
    Identifier { name: String, resolved: Option<SymbolId> },
    
    // Type nodes
    TypeAnnotation { base: String, generics: Vec<NodeId> },
    GenericParam { name: String, constraint: Option<NodeId> },
    
    // Control flow
    Conditional { condition: NodeId, then: NodeId, else_: Option<NodeId> },
    Loop { kind: LoopKind, condition: Option<NodeId>, body: NodeId },
    
    // Language-specific with universal interface
    LanguageSpecific { kind: String, data: serde_json::Value },
}
```

### 3. Pattern Engine Architecture

```rust
// Pattern-based language definition
struct LanguageDefinition {
    id: String,
    version: Version,
    patterns: PatternSet,
    symbol_rules: Vec<SymbolRule>,
    relationship_rules: Vec<RelationshipRule>,
    cross_language_rules: Vec<CrossLanguageRule>,
}

// Hot-reloadable pattern system
struct PatternSet {
    // Symbol patterns
    class_patterns: Vec<Pattern>,
    function_patterns: Vec<Pattern>,
    variable_patterns: Vec<Pattern>,
    import_patterns: Vec<Pattern>,
    
    // Relationship patterns
    inheritance_patterns: Vec<Pattern>,
    call_patterns: Vec<Pattern>,
    usage_patterns: Vec<Pattern>,
    
    // Cross-language patterns
    subprocess_patterns: Vec<Pattern>,
    api_patterns: Vec<Pattern>,
    ffi_patterns: Vec<Pattern>,
}

// Pattern matching engine
struct Pattern {
    // Tree-sitter query
    query: String,
    
    // Capture processing
    captures: HashMap<String, CaptureProcessor>,
    
    // Confidence scoring
    confidence: ConfidenceRule,
    
    // Version constraints
    min_version: Option<Version>,
    max_version: Option<Version>,
}
```

### 4. Composable Analyzer Framework

```rust
// Analyzers as plugins
trait Analyzer: Send + Sync {
    fn analyze(&self, ast: &UniversalAst, context: &AnalysisContext) 
        -> Result<AnalysisResult>;
}

// Built-in analyzers
struct SymbolExtractor;
struct RelationshipDetector;
struct ComplexityAnalyzer;
struct PatternMatcher;
struct CrossLanguageDetector;
struct SemanticAnalyzer;

// Analyzer pipeline
struct AnalyzerPipeline {
    analyzers: Vec<Box<dyn Analyzer>>,
    parallel: bool,
}

impl AnalyzerPipeline {
    async fn run(&self, ast: &UniversalAst) -> Result<CombinedResults> {
        if self.parallel {
            // Run analyzers in parallel
            futures::future::try_join_all(
                self.analyzers.iter()
                    .map(|a| a.analyze(ast, &ctx))
            ).await
        } else {
            // Sequential execution
            self.run_sequential(ast).await
        }
    }
}
```

### 5. Language Evolution System

```rust
// Language update without recompilation
struct LanguageEvolution {
    // Pattern hot-reloading
    pattern_watcher: FileWatcher,
    pattern_cache: Arc<RwLock<PatternCache>>,
    
    // Version management
    version_manager: VersionManager,
    
    // A/B testing for patterns
    experiments: ExperimentManager,
}

// Pattern versioning
struct PatternVersion {
    version: Version,
    patterns: PatternSet,
    changelog: Vec<Change>,
    performance_impact: PerformanceMetrics,
}

// Automatic pattern learning (future)
struct PatternLearner {
    // Learn from parsing failures
    failure_collector: FailureCollector,
    
    // Generate new patterns
    pattern_generator: PatternGenerator,
    
    // Validate against corpus
    validator: CorpusValidator,
}
```

### 6. Performance Optimizations

```rust
// Zero-copy parsing
struct ZeroCopyParser {
    // Memory-mapped source files
    mmap_cache: MmapCache,
    
    // Shared string interning
    string_interner: StringInterner,
    
    // Incremental parsing state
    incremental_state: IncrementalState,
}

// Parallel processing
struct ParallelProcessor {
    // Work-stealing queue
    work_queue: WorkStealingQueue<ParseJob>,
    
    // CPU-aware thread pool
    thread_pool: rayon::ThreadPool,
    
    // NUMA-aware memory allocation
    allocator: NumaAllocator,
}

// Caching strategies
struct CacheSystem {
    // AST cache with LRU eviction
    ast_cache: LruCache<FileHash, UniversalAst>,
    
    // Symbol cache with bloom filters
    symbol_cache: BloomFilterCache<SymbolKey, Symbol>,
    
    // Pattern match cache
    pattern_cache: PatternMatchCache,
}
```

### 7. Database Integration

```rust
// Direct SQLite integration
struct DatabaseWriter {
    pool: SqlitePool,
    batch_size: usize,
    transaction_timeout: Duration,
}

impl DatabaseWriter {
    // Batch insert with prepared statements
    async fn insert_symbols(&self, symbols: Vec<Symbol>) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        
        let stmt = r#"
            INSERT INTO universal_symbols 
            (project_id, language_id, name, qualified_name, kind, ...)
            VALUES (?, ?, ?, ?, ?, ...)
        "#;
        
        for chunk in symbols.chunks(self.batch_size) {
            sqlx::query(stmt)
                .execute_many(&mut tx)
                .await?;
        }
        
        tx.commit().await
    }
}
```

### 8. CLI Interface

```rust
#[derive(Parser)]
struct Cli {
    /// Project path to parse
    #[arg(short, long)]
    project_path: PathBuf,
    
    /// Languages to parse (comma-separated)
    #[arg(short, long, value_delimiter = ',')]
    languages: Vec<String>,
    
    /// Database path
    #[arg(short, long, default_value = "~/.module-sentinel/prod.db")]
    db_path: PathBuf,
    
    /// Pattern definition path (for hot-reloading)
    #[arg(long)]
    patterns_dir: Option<PathBuf>,
    
    /// Performance mode
    #[arg(long, default_value = "balanced")]
    perf_mode: PerfMode,
}

enum PerfMode {
    /// Maximum speed, high memory usage
    Turbo,
    /// Balanced speed and memory
    Balanced,
    /// Low memory usage
    LowMemory,
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. **Universal AST Definition**
   - Define all node types
   - Implement arena allocator
   - Create source mapping

2. **Pattern Engine**
   - Pattern parser
   - Pattern matcher
   - Hot-reload system

3. **Database Models**
   - Schema matching TypeScript
   - Batch insert optimization
   - Transaction management

### Phase 2: Language Parsers (Week 2)
1. **Base Parser Trait**
   - Common functionality
   - Error handling
   - Progress reporting

2. **Language Implementations**
   - C++ (most complex, prove the system)
   - TypeScript/JavaScript (high usage)
   - Python (different syntax style)
   - Go, Java, C# (parallel development)

3. **Pattern Definitions**
   - Convert regex patterns to tree-sitter queries
   - Define confidence rules
   - Cross-language patterns

### Phase 3: Analyzers (Week 3)
1. **Core Analyzers**
   - Symbol extraction
   - Relationship detection
   - Complexity analysis

2. **Advanced Analyzers**
   - Cross-language detection
   - Pattern matching
   - Semantic analysis

3. **Pipeline System**
   - Parallel execution
   - Result aggregation
   - Error propagation

### Phase 4: Performance & Integration (Week 4)
1. **Performance Optimization**
   - Memory mapping
   - Parallel processing
   - Caching system

2. **CLI Development**
   - Argument parsing
   - Progress reporting
   - Error formatting

3. **TypeScript Integration**
   - Process spawning
   - Result monitoring
   - Error handling

## Pattern Definition Examples

### TypeScript/JavaScript Patterns
```yaml
language: typescript
version: ">=4.0"
patterns:
  class:
    - query: |
        (class_declaration
          name: (identifier) @name
          body: (class_body) @body)
    - query: |
        (class_expression
          name: (identifier)? @name
          body: (class_body) @body)
  
  function:
    - query: |
        (function_declaration
          name: (identifier) @name
          parameters: (formal_parameters) @params)
    - query: |
        (arrow_function
          parameters: (_) @params
          body: (_) @body)
  
  import:
    - query: |
        (import_statement
          source: (string) @source)
      captures:
        source: 
          processor: extract_module_path
  
  cross_language:
    subprocess:
      - pattern: 'spawn\s*\(\s*["\']([^"\']+)["\']'
        confidence: 0.9
        capture_groups:
          1: target_executable
```

### Python Patterns
```yaml
language: python
version: ">=3.6"
patterns:
  class:
    - query: |
        (class_definition
          name: (identifier) @name
          superclasses: (argument_list)? @bases)
  
  function:
    - query: |
        (function_definition
          name: (identifier) @name
          parameters: (parameters) @params)
    - query: |
        (lambda
          parameters: (lambda_parameters)? @params)
  
  decorator:
    - query: |
        (decorated_definition
          (decorator) @decorator
          definition: (_) @target)
```

## Performance Targets

- **Parsing Speed**: 100,000+ lines/second per core
- **Memory Usage**: < 2GB for 1M LOC project
- **Startup Time**: < 100ms
- **Pattern Hot-Reload**: < 50ms
- **Database Insertion**: 10,000+ symbols/second

## Future Extensions

1. **Machine Learning Integration**
   - Pattern learning from failures
   - Anomaly detection
   - Code quality prediction

2. **Real-time Analysis**
   - LSP server mode
   - Incremental updates
   - Live pattern matching

3. **Distributed Parsing**
   - Multi-machine support
   - Cloud-native deployment
   - Kubernetes operator

This architecture provides the flexibility to adapt to rapid language changes while maintaining exceptional performance.