use tokio;
use anyhow::Result;
use module_sentinel_parser::analysis::{PatternDetector, PatternCategory, SimilarityCalculator};
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language as ParserLanguage};

fn create_test_symbol(name: &str, signature: &str, file_path: &str) -> Symbol {
    Symbol {
        id: name.to_string(),
        name: name.to_string(),
        signature: signature.to_string(),
        language: ParserLanguage::Rust,
        file_path: file_path.to_string(),
        start_line: 1,
        end_line: 10,
        embedding: None,
        semantic_hash: None,
        normalized_name: name.to_lowercase(),
        context_embedding: None,
        duplicate_of: None,
        confidence_score: Some(1.0),
        similar_symbols: vec![],
    }
}

#[test]
fn test_pattern_detector() {
    let detector = PatternDetector::new();
    
    // Create test symbols
    let symbols = vec![
        create_test_symbol("get_instance", "pub fn get_instance() -> &'static Self", "singleton.rs"),
        create_test_symbol("instance", "pub fn instance() -> &'static Logger", "logger.rs"),
        create_test_symbol("create_database", "pub fn create_database(db_type: &str) -> Box<dyn Database>", "factory.rs"),
        create_test_symbol("make_connection", "pub fn make_connection(protocol: Protocol) -> Box<dyn Connection>", "factory.rs"),
        create_test_symbol("test_validation", "fn test_validation()", "tests.rs"),
        create_test_symbol("should_parse_correctly", "fn should_parse_correctly()", "tests.rs"),
    ];
    
    let patterns = detector.detect_patterns(&symbols);
    
    // Should detect singleton pattern
    let singleton = patterns.iter()
        .find(|p| matches!(&p.category, PatternCategory::SingletonPattern))
        .expect("Should detect singleton pattern");
    assert_eq!(singleton.symbols.len(), 2);
    
    // Should detect factory pattern
    let factory = patterns.iter()
        .find(|p| matches!(&p.category, PatternCategory::FactoryPattern))
        .expect("Should detect factory pattern");
    assert_eq!(factory.symbols.len(), 2);
    
    // Should detect test pattern
    let test = patterns.iter()
        .find(|p| matches!(&p.category, PatternCategory::TestPattern))
        .expect("Should detect test pattern");
    assert_eq!(test.symbols.len(), 2);
}

#[test]
fn test_similarity_calculator() {
    let calc = SimilarityCalculator::new();
    
    // Test identical symbols
    let symbol1 = create_test_symbol("process_data", "fn process_data(data: &str) -> Result<String>", "processor.rs");
    let result = calc.calculate(&symbol1, &symbol1);
    assert_eq!(result.overall_score, 1.0);
    
    // Test similar symbols
    let symbol2 = create_test_symbol("processData", "fn processData(data: &str) -> Result<String>", "processor.rs");
    let result = calc.calculate(&symbol1, &symbol2);
    assert!(result.name_similarity > 0.8, "camelCase vs snake_case should be similar");
    
    // Test different symbols
    let symbol3 = create_test_symbol("delete_user", "fn delete_user(id: u64) -> Result<()>", "user.rs");
    let result = calc.calculate(&symbol1, &symbol3);
    assert!(result.overall_score < 0.3, "Different functions should have low similarity");
}

#[test]
fn test_code_snippet_analysis() {
    let detector = PatternDetector::new();
    
    let rust_singleton = r#"
        static INSTANCE: OnceCell<Config> = OnceCell::new();
        
        impl Config {
            pub fn instance() -> &'static Self {
                INSTANCE.get_or_init(|| Config::new())
            }
        }
    "#;
    
    let insights = detector.analyze_code_snippet(rust_singleton, "rust");
    assert!(insights.iter().any(|i| i.contains("Singleton")));
    
    let async_code = r#"
        async fn fetch_data(url: &str) -> Result<Data> {
            let response = client.get(url).send().await?;
            response.json::<Data>().await
        }
    "#;
    
    let insights = detector.analyze_code_snippet(async_code, "rust");
    assert!(insights.iter().any(|i| i.contains("async")));
}

#[test]
fn test_duplicate_detection() {
    let calc = SimilarityCalculator::new();
    
    // Create very similar functions
    let validate_email1 = create_test_symbol(
        "validate_email",
        "fn validate_email(email: &str) -> bool",
        "validators.rs"
    );
    
    let validate_email2 = create_test_symbol(
        "validate_email_address",
        "fn validate_email_address(address: &str) -> bool",
        "validators.rs"
    );
    
    let result = calc.calculate(&validate_email1, &validate_email2);
    assert!(result.overall_score > 0.6, "Similar validators should have high similarity");
    assert!(result.name_similarity > 0.7, "Names should be detected as similar");
    assert!(result.signature_similarity > 0.7, "Signatures are almost identical");
}