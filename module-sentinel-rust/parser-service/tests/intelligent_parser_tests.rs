use module_sentinel_parser::parsers::tree_sitter::{
    IntelligentTreeSitterParser, Language, ErrorType, CodeIntent
};

#[tokio::test]
async fn test_intelligent_parser_creation() {
    let parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    // Parser should be created successfully
    assert!(true);
}

#[tokio::test]
async fn test_parse_with_intelligence() {
    let mut parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    let code = "fn main() { println!(\"Hello, World!\"); }";
    
    let result = parser.parse_with_intelligence(code).await.unwrap();
    
    // Should have high confidence for valid code
    assert!(result.confidence_score > 0.8);
    
    // Should detect function intent
    match result.predicted_intent {
        Some(CodeIntent::FunctionDefinition(_)) => {},
        _ => panic!("Expected function definition intent"),
    }
    
    // Should have no errors
    assert!(result.errors.is_empty());
}

#[tokio::test]
async fn test_ml_error_detection() {
    let mut parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    let code = "fn main() { let x = 42.unwrap(); }"; // unwrap on non-Result
    
    let result = parser.parse_with_intelligence(code).await.unwrap();
    
    // ML should detect potential issue
    assert!(!result.errors.is_empty() || result.confidence_score < 1.0);
}

#[tokio::test]
async fn test_embedding_generation() {
    let mut parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    let code = r#"
        fn calculate_sum(numbers: Vec<i32>) -> i32 {
            numbers.iter().sum()
        }
        
        fn compute_total(values: Vec<i32>) -> i32 {
            values.iter().sum()
        }
    "#;
    
    let result = parser.parse_with_intelligence(code).await.unwrap();
    
    // Should have embeddings for both functions
    assert_eq!(result.embeddings.function_embeddings.len(), 2);
    
    // Should have similarity matrix
    assert!(result.embeddings.similarity_matrix.is_some());
    
    // Similar functions should have high similarity
    if let Some(matrix) = result.embeddings.similarity_matrix {
        // Diagonal should be 1.0 (self-similarity)
        assert!((matrix[0][0] - 1.0).abs() < 0.01);
        // Similar functions should have high similarity
        assert!(matrix[0][1] > 0.5);
    }
}

#[tokio::test]
async fn test_error_recovery_with_ml() {
    let mut parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    let code = "fn main() { println!(\"Hello\" }"; // Missing closing paren
    
    let result = parser.parse_with_intelligence(code).await.unwrap();
    
    // Should detect error
    assert!(!result.errors.is_empty());
    
    // Should have ML suggestions
    let error = &result.errors[0];
    assert!(!error.ml_suggestions.is_empty());
    
    // Should suggest closing paren
    assert!(result.recovery_suggestions.iter().any(|s| s.suggestion.contains(")")));
}

#[tokio::test]
async fn test_learning_from_fix() {
    let mut parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    
    // Parse code with error
    let code = "fn main() { let x = ; }";
    let result = parser.parse_with_intelligence(code).await.unwrap();
    
    assert!(!result.errors.is_empty());
    let error = &result.errors[0];
    
    // Learn from successful fix
    parser.learn_from_fix(error, "0").await.unwrap();
    
    // Parse similar error
    let similar_code = "fn test() { let y = ; }";
    let result2 = parser.parse_with_intelligence(similar_code).await.unwrap();
    
    // Should have learned suggestion
    if !result2.errors.is_empty() {
        let suggestions = &result2.errors[0].ml_suggestions;
        assert!(suggestions.iter().any(|s| s.learned_from.is_some()));
    }
}

#[tokio::test]
async fn test_incremental_parse_with_ml() {
    let mut parser = IntelligentTreeSitterParser::new(Language::Rust).await.unwrap();
    
    // Initial parse
    let code1 = "fn main() { println!(\"Hello\"); }";
    let result1 = parser.parse_with_intelligence(code1).await.unwrap();
    let tree1 = result1.tree;
    
    // Incremental parse with edit
    let code2 = "fn main() { println!(\"Hello, World!\"); }";
    let edits = vec![(21, 27, 35)]; // Changed "Hello" to "Hello, World!"
    
    let result2 = parser.incremental_parse_with_ml(code2, edits, Some(&tree1)).await.unwrap();
    
    // Should maintain high confidence
    assert!(result2.confidence_score > 0.8);
    
    // Should still detect function
    match result2.predicted_intent {
        Some(CodeIntent::FunctionDefinition(_)) => {},
        _ => panic!("Expected function definition intent"),
    }
}

#[tokio::test]
async fn test_multi_language_support() {
    // Test TypeScript
    let mut ts_parser = IntelligentTreeSitterParser::new(Language::TypeScript).await.unwrap();
    let ts_code = "function greet(name: string): string { return `Hello, ${name}!`; }";
    let ts_result = ts_parser.parse_with_intelligence(ts_code).await.unwrap();
    assert!(ts_result.confidence_score > 0.8);
    
    // Test Python
    let mut py_parser = IntelligentTreeSitterParser::new(Language::Python).await.unwrap();
    let py_code = "def greet(name):\n    return f'Hello, {name}!'";
    let py_result = py_parser.parse_with_intelligence(py_code).await.unwrap();
    assert!(py_result.confidence_score > 0.8);
}