# Module Sentinel Rust Parser - Stage 2 Implementation Spec

## Current State

We have successfully built:
- Universal AST with comprehensive node types
- Visitor pattern for traversal
- Pattern engine with YAML-based definitions and hot-reload
- Test-driven foundation with 15 passing tests
- Modular architecture ready for extension

## Stage 2 Objectives

### 1. Real Tree-Sitter Integration with Intelligent Error Recovery

#### 1.1 Parser Implementation
```rust
pub struct TreeSitterParser {
    parser: tree_sitter::Parser,
    language: tree_sitter::Language,
    error_recovery: ErrorRecoveryEngine,
    pattern_matcher: PatternMatcher,
}

pub struct ErrorRecoveryEngine {
    // Local neural network for syntax prediction
    syntax_predictor: LocalNeuralNet,
    // Pattern-based recovery strategies
    recovery_patterns: HashMap<String, RecoveryStrategy>,
    // Historical error database for learning
    error_history: ErrorDatabase,
}
```

#### 1.2 Local Neural Network Integration
Use ONNX Runtime or Candle for local inference:
- **Syntax Error Prediction**: Train lightweight model on common syntax errors
- **Symbol Resolution**: Fuzzy matching with learned embeddings
- **Pattern Suggestion**: Suggest likely code patterns based on context

```rust
pub struct LocalNeuralNet {
    runtime: ort::Session,
    tokenizer: CodeTokenizer,
    embedding_cache: DashMap<String, Vec<f32>>,
}

impl LocalNeuralNet {
    pub fn predict_next_token(&self, context: &[Token]) -> Vec<(Token, f32)> {
        // Returns probable next tokens with confidence scores
    }
    
    pub fn suggest_correction(&self, error_context: &ErrorContext) -> Vec<Correction> {
        // Suggests fixes for syntax errors
    }
}
```

### 2. High-Performance Database Layer

#### 2.1 Batch Operations with Intelligent Deduplication
```rust
pub struct IntelligentDatabaseWriter {
    pool: SqlitePool,
    dedup_engine: DeduplicationEngine,
    symbol_embeddings: EmbeddingStore,
    write_optimizer: WriteOptimizer,
}

pub struct DeduplicationEngine {
    // Bloom filter for fast existence checks
    bloom_filter: BloomFilter,
    // Semantic hashing for similar code detection
    semantic_hasher: SemanticHasher,
    // LRU cache of recent symbols
    recent_symbols: LruCache<SymbolKey, SymbolMetadata>,
}
```

#### 2.2 Incremental Updates
```rust
pub struct IncrementalUpdater {
    // Track file changes
    file_tracker: FileChangeTracker,
    // Diff-based updates
    ast_differ: AstDiffer,
    // Minimal database updates
    update_planner: UpdatePlanner,
}
```

### 3. Pattern Learning System

#### 3.1 Error-Based Pattern Learning
```rust
pub struct PatternLearner {
    // Collect parsing failures
    failure_collector: FailureCollector,
    // Extract patterns from failures
    pattern_extractor: PatternExtractor,
    // Validate and rank patterns
    pattern_validator: PatternValidator,
    // Local model for pattern quality
    quality_predictor: QualityPredictor,
}

impl PatternLearner {
    pub fn learn_from_failure(&mut self, failure: ParseFailure) -> Option<Pattern> {
        let context = self.failure_collector.collect_context(&failure);
        let candidate = self.pattern_extractor.extract(context);
        
        if self.pattern_validator.validate(&candidate) {
            let quality = self.quality_predictor.predict(&candidate);
            if quality > QUALITY_THRESHOLD {
                return Some(candidate);
            }
        }
        None
    }
}
```

#### 3.2 Adaptive Pattern Refinement
```rust
pub struct PatternRefiner {
    // A/B test patterns
    experiment_runner: ExperimentRunner,
    // Track pattern performance
    performance_tracker: PerformanceTracker,
    // Optimize patterns based on results
    pattern_optimizer: PatternOptimizer,
}
```

### 4. Language Parser Implementations

#### 4.1 C++ Parser with Template Support
```rust
pub struct CppParser {
    base_parser: TreeSitterParser,
    template_resolver: TemplateResolver,
    macro_expander: MacroExpander,
    cross_ref_analyzer: CrossReferenceAnalyzer,
}

pub struct TemplateResolver {
    // Handle complex template instantiations
    instantiation_cache: HashMap<TemplateKey, ResolvedTemplate>,
    // Recursive template resolution
    resolution_engine: ResolutionEngine,
    // Error recovery for invalid templates
    template_recovery: TemplateRecovery,
}
```

#### 4.2 TypeScript/JavaScript Parser with Modern Syntax
```rust
pub struct TypeScriptParser {
    base_parser: TreeSitterParser,
    type_resolver: TypeResolver,
    module_resolver: ModuleResolver,
    jsx_handler: JsxHandler,
}

pub struct TypeResolver {
    // Infer types from usage
    type_inferencer: TypeInferencer,
    // Handle union/intersection types
    complex_type_handler: ComplexTypeHandler,
    // Generic resolution
    generic_resolver: GenericResolver,
}
```

### 5. Intelligent Symbol Resolution

#### 5.1 Semantic Symbol Matcher
```rust
pub struct SemanticSymbolMatcher {
    // Embedding-based similarity
    embedding_engine: EmbeddingEngine,
    // Context-aware matching
    context_analyzer: ContextAnalyzer,
    // Fuzzy matching with learned weights
    fuzzy_matcher: FuzzyMatcher,
}

pub struct EmbeddingEngine {
    // Local embedding model (e.g., CodeBERT ONNX)
    model: ort::Session,
    // Cache embeddings for performance
    cache: EmbeddingCache,
    // Incremental embedding updates
    incremental_updater: IncrementalEmbedder,
}
```

#### 5.2 Cross-Language Symbol Linking
```rust
pub struct CrossLanguageLinker {
    // Detect API boundaries
    api_detector: ApiDetector,
    // Match symbols across languages
    symbol_matcher: CrossLanguageSymbolMatcher,
    // Confidence scoring
    confidence_scorer: ConfidenceScorer,
}
```

### 6. Performance Optimizations

#### 6.1 Parallel Processing Pipeline
```rust
pub struct ParallelPipeline {
    // File-level parallelism
    file_processor: ParallelFileProcessor,
    // AST node-level parallelism
    node_processor: ParallelNodeProcessor,
    // Batch database writes
    batch_writer: BatchWriter,
    // Memory pressure monitor
    memory_monitor: MemoryMonitor,
}
```

#### 6.2 Incremental Parsing
```rust
pub struct IncrementalParser {
    // Tree-sitter incremental parsing
    incremental_state: HashMap<PathBuf, tree_sitter::Tree>,
    // Change detection
    change_detector: ChangeDetector,
    // Minimal re-parsing
    reparse_optimizer: ReparseOptimizer,
}
```

## Implementation Phases

### Phase 1: Core Tree-Sitter Integration (Week 1)
1. Implement TreeSitterParser wrapper
2. Add error recovery mechanisms
3. Create language-specific parsers
4. Write comprehensive tests

### Phase 2: Intelligent Features (Week 2)
1. Integrate ONNX Runtime for local ML
2. Implement error prediction model
3. Build pattern learning system
4. Create embedding engine

### Phase 3: Database & Performance (Week 3)
1. Implement batch database operations
2. Add deduplication engine
3. Create incremental update system
4. Optimize parallel processing

### Phase 4: Advanced Features (Week 4)
1. Cross-language symbol linking
2. Template/macro resolution
3. Performance benchmarking
4. Production hardening

## Key Design Decisions

### Local ML Models
- Use ONNX Runtime for compatibility
- Small models (<50MB) for syntax prediction
- Embedding models for semantic matching
- All processing happens locally

### Error Recovery Strategy
1. Collect context around errors
2. Use ML model to predict likely fix
3. Fall back to pattern-based recovery
4. Learn from successful recoveries

### Performance Targets
- Parse 1M LOC in <30 seconds
- Incremental updates in <100ms
- Memory usage <1GB for large projects
- Error recovery success rate >80%

## Testing Strategy

### Unit Tests
- Each parser component
- Error recovery scenarios
- ML model predictions
- Database operations

### Integration Tests
- Full parsing pipeline
- Cross-language projects
- Error recovery chains
- Performance benchmarks

### Property-Based Tests
- Parser invariants
- Database consistency
- Symbol resolution accuracy
- Pattern matching correctness

## Future Extensibility

### Plugin System
- Custom language parsers
- Additional ML models
- Pattern providers
- Analysis plugins

### Distributed Mode
- Multi-machine parsing
- Shared symbol database
- Distributed embeddings
- Collaborative learning

This architecture ensures we build an intelligent system that learns from errors, adapts to new patterns, and provides high-quality parsing even for complex or malformed code.