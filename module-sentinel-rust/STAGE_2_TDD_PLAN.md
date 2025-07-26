# Stage 2 TDD Implementation Plan

## Overview

This plan focuses on incrementally building intelligent parsing capabilities with local ML integration, following strict TDD principles.

## Phase 1: Tree-Sitter Parser Integration

### 1.1 Basic Tree-Sitter Wrapper
**Test First:**
```rust
#[test]
fn test_tree_sitter_parser_creation() {
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    assert_eq!(parser.language_id(), "rust");
    assert!(parser.is_initialized());
}

#[test]
fn test_parse_simple_rust_code() {
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn main() { println!(\"Hello\"); }";
    let tree = parser.parse_string(code).unwrap();
    assert_eq!(tree.root_node().kind(), "source_file");
    assert_eq!(tree.root_node().child_count(), 1);
}
```

### 1.2 Error Recovery
**Test First:**
```rust
#[test]
fn test_parser_recovers_from_syntax_error() {
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn main() { println!(\"Hello\" }"; // Missing closing paren
    let result = parser.parse_with_recovery(code).unwrap();
    
    assert!(result.had_errors());
    assert_eq!(result.errors.len(), 1);
    assert_eq!(result.recovery_suggestions.len(), 1);
    assert_eq!(result.recovery_suggestions[0].suggestion, ")");
}

#[test]
fn test_ml_based_error_prediction() {
    let predictor = ErrorPredictor::new("models/syntax_error_v1.onnx").unwrap();
    let context = ErrorContext {
        tokens_before: vec!["println!", "(", "\"Hello\""],
        error_position: 25,
        expected_tokens: vec![")", ";"],
    };
    
    let predictions = predictor.predict_correction(&context);
    assert!(predictions.len() > 0);
    assert_eq!(predictions[0].token, ")");
    assert!(predictions[0].confidence > 0.8);
}
```

### 1.3 AST Conversion
**Test First:**
```rust
#[test]
fn test_tree_sitter_to_universal_ast() {
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn calculate(x: i32) -> i32 { x * 2 }";
    let tree = parser.parse_string(code).unwrap();
    let universal_ast = parser.to_universal_ast(&tree).unwrap();
    
    match universal_ast.get_node(universal_ast.root).unwrap() {
        UniversalNode::Function { name, params, .. } => {
            assert_eq!(name, "calculate");
            assert_eq!(params.len(), 1);
        }
        _ => panic!("Expected function node"),
    }
}
```

## Phase 2: Local ML Integration

### 2.1 ONNX Runtime Setup
**Test First:**
```rust
#[test]
fn test_load_onnx_model() {
    let model = LocalNeuralNet::new("models/code_completion_v1.onnx").unwrap();
    assert!(model.is_loaded());
    assert_eq!(model.input_dims(), vec![1, 512]); // batch_size, sequence_length
}

#[test]
fn test_tokenizer_integration() {
    let tokenizer = CodeTokenizer::new("models/tokenizer.json").unwrap();
    let tokens = tokenizer.tokenize("fn main() {}");
    assert!(tokens.len() > 0);
    assert_eq!(tokens[0], "fn");
}
```

### 2.2 Syntax Prediction
**Test First:**
```rust
#[test]
fn test_predict_next_token() {
    let predictor = SyntaxPredictor::new().unwrap();
    let context = vec!["fn", "calculate", "(", "x", ":", "i32", ")"];
    let predictions = predictor.predict_next(&context, top_k: 5);
    
    assert!(predictions.iter().any(|(token, _)| token == "->"));
    assert!(predictions[0].1 > 0.5); // confidence > 50%
}

#[test]
fn test_embedding_similarity() {
    let embedder = CodeEmbedder::new("models/code_embeddings_v1.onnx").unwrap();
    let emb1 = embedder.embed("calculate_sum");
    let emb2 = embedder.embed("compute_total");
    let emb3 = embedder.embed("parse_json");
    
    let sim_12 = cosine_similarity(&emb1, &emb2);
    let sim_13 = cosine_similarity(&emb1, &emb3);
    
    assert!(sim_12 > sim_13); // Similar function names should be closer
}
```

## Phase 3: Pattern Learning

### 3.1 Failure Collection
**Test First:**
```rust
#[test]
fn test_collect_parse_failure() {
    let mut learner = PatternLearner::new();
    let failure = ParseFailure {
        file: "test.rs",
        position: 42,
        expected: vec!["identifier", "string"],
        found: "number",
        context: "let x = ".to_string(),
    };
    
    learner.record_failure(failure);
    assert_eq!(learner.failure_count(), 1);
    
    let pattern = learner.suggest_pattern();
    assert!(pattern.is_some());
}

#[test]
fn test_pattern_validation() {
    let validator = PatternValidator::new();
    let good_pattern = Pattern {
        query: "(function_item name: (identifier) @name)",
        confidence: 0.9,
        // ...
    };
    let bad_pattern = Pattern {
        query: "(invalid syntax here",
        confidence: 0.9,
        // ...
    };
    
    assert!(validator.is_valid(&good_pattern));
    assert!(!validator.is_valid(&bad_pattern));
}
```

### 3.2 Adaptive Learning
**Test First:**
```rust
#[test]
fn test_pattern_performance_tracking() {
    let mut tracker = PatternPerformanceTracker::new();
    let pattern_id = PatternId::new();
    
    tracker.record_success(pattern_id, parse_time: 10.0);
    tracker.record_success(pattern_id, parse_time: 12.0);
    tracker.record_failure(pattern_id, error: "timeout");
    
    let stats = tracker.get_stats(pattern_id);
    assert_eq!(stats.success_rate, 0.67);
    assert_eq!(stats.avg_parse_time, 11.0);
}
```

## Phase 4: Intelligent Database Operations

### 4.1 Semantic Deduplication
**Test First:**
```rust
#[test]
fn test_semantic_deduplication() {
    let dedup = SemanticDeduplicator::new();
    
    let symbol1 = Symbol {
        name: "calculateSum",
        signature: "fn(Vec<i32>) -> i32",
        // ...
    };
    let symbol2 = Symbol {
        name: "calc_sum",
        signature: "fn(Vec<i32>) -> i32",
        // ...
    };
    
    assert!(dedup.are_similar(&symbol1, &symbol2));
    assert_eq!(dedup.similarity_score(&symbol1, &symbol2), 0.85);
}

#[test]
fn test_bloom_filter_optimization() {
    let mut bloom = SymbolBloomFilter::new(100_000, 0.01);
    let symbol_key = SymbolKey::new("module::function");
    
    bloom.insert(&symbol_key);
    assert!(bloom.might_contain(&symbol_key));
    assert!(!bloom.might_contain(&SymbolKey::new("other::function")));
}
```

### 4.2 Incremental Updates
**Test First:**
```rust
#[test]
fn test_incremental_ast_diff() {
    let old_ast = parse_code("fn main() { println!(\"Hello\"); }");
    let new_ast = parse_code("fn main() { println!(\"Hello, World!\"); }");
    
    let diff = AstDiffer::diff(&old_ast, &new_ast);
    assert_eq!(diff.changes.len(), 1);
    assert_eq!(diff.changes[0].kind, ChangeKind::Modified);
    assert_eq!(diff.changes[0].node_path, vec!["main", "body", "println", "args", "0"]);
}
```

## Phase 5: Cross-Language Intelligence

### 5.1 API Detection
**Test First:**
```rust
#[test]
fn test_detect_rest_api_definition() {
    let code = r#"
    app.post('/users', async (req, res) => {
        const user = await createUser(req.body);
        res.json(user);
    });
    "#;
    
    let detector = ApiDetector::new();
    let apis = detector.detect_apis(code, Language::TypeScript);
    
    assert_eq!(apis.len(), 1);
    assert_eq!(apis[0].method, "POST");
    assert_eq!(apis[0].path, "/users");
    assert_eq!(apis[0].handler, "createUser");
}

#[test]
fn test_cross_language_symbol_matching() {
    let matcher = CrossLanguageMatcher::new();
    
    let py_symbol = Symbol {
        name: "calculate_sum",
        language: "python",
        signature: "def calculate_sum(numbers: List[int]) -> int",
    };
    
    let rust_symbol = Symbol {
        name: "calculate_sum",
        language: "rust",
        signature: "fn calculate_sum(numbers: Vec<i32>) -> i32",
    };
    
    let match_result = matcher.match_symbols(&py_symbol, &rust_symbol);
    assert!(match_result.is_match);
    assert!(match_result.confidence > 0.9);
}
```

## Test Data Management

### Synthetic Test Data Generation
```rust
#[test]
fn test_with_generated_code() {
    let generator = CodeGenerator::new();
    let test_cases = generator.generate_test_cases(
        language: Language::Rust,
        complexity: Complexity::Medium,
        count: 100,
    );
    
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    let mut success_count = 0;
    
    for test_case in test_cases {
        if let Ok(tree) = parser.parse_string(&test_case.code) {
            success_count += 1;
        }
    }
    
    assert!(success_count as f64 / test_cases.len() as f64 > 0.95);
}
```

### Real-World Code Corpus
```rust
#[test]
fn test_with_real_world_samples() {
    let corpus = CodeCorpus::load("test-data/real-world-samples").unwrap();
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    
    for sample in corpus.samples() {
        let result = parser.parse_with_recovery(&sample.code);
        assert!(result.is_ok());
        
        if result.had_errors() {
            assert!(!result.recovery_suggestions.is_empty());
        }
    }
}
```

## Performance Benchmarks as Tests

```rust
#[bench]
fn bench_parse_large_file(b: &mut Bencher) {
    let code = fs::read_to_string("test-data/large_file.rs").unwrap();
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    
    b.iter(|| {
        parser.parse_string(&code).unwrap()
    });
}

#[test]
fn test_performance_requirements() {
    let code = generate_code_lines(10_000); // 10k lines
    let parser = TreeSitterParser::new(Language::Rust).unwrap();
    
    let start = Instant::now();
    let _ = parser.parse_string(&code);
    let duration = start.elapsed();
    
    assert!(duration.as_millis() < 100); // Must parse in <100ms
}
```

## Key Testing Principles for ML Components

1. **Deterministic Tests**: Use fixed random seeds for ML models
2. **Threshold-Based Assertions**: Don't test exact values, test ranges
3. **Regression Tests**: Save model outputs and detect degradation
4. **Mock External Models**: For unit tests, mock ONNX runtime
5. **Integration Tests**: Test full pipeline with real models
6. **Performance Benchmarks**: ML inference must be <10ms

This TDD approach ensures we build reliable, intelligent parsing capabilities incrementally while maintaining high code quality and performance standards.