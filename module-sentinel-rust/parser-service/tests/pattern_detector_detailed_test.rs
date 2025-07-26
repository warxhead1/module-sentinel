use module_sentinel_parser::analysis::{PatternDetector, PatternCategory};
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language as ParserLanguage};

fn create_test_symbol(name: &str, signature: &str) -> Symbol {
    Symbol {
        id: name.to_string(),
        name: name.to_string(),
        signature: signature.to_string(),
        language: ParserLanguage::Rust,
        file_path: "test.rs".to_string(),
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
fn test_singleton_pattern_detection_detailed() {
    // Initialize logging
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .try_init();
        
    let detector = PatternDetector::new();
    
    // Test various singleton-like symbols
    let symbols = vec![
        create_test_symbol("get_instance", "pub fn get_instance() -> &'static Self"),
        create_test_symbol("instance", "pub fn instance() -> &'static Logger"),
        create_test_symbol("singleton", "pub static SINGLETON: OnceCell<MyStruct>"),
        create_test_symbol("shared_instance", "fn shared_instance() -> Arc<Self>"),
        create_test_symbol("not_a_singleton", "fn process_data(data: &str) -> Result<()>"),
    ];
    
    println!("\nTesting {} symbols for pattern detection", symbols.len());
    
    let patterns = detector.detect_patterns(&symbols);
    
    println!("\nDetected {} patterns total", patterns.len());
    
    for pattern in &patterns {
        println!("\nPattern: {:?}", pattern.category);
        println!("  Symbols matched: {}", pattern.symbols.len());
        println!("  Confidence: {}", pattern.confidence);
        println!("  Evidence:");
        for evidence in &pattern.evidence {
            println!("    - {}", evidence);
        }
        println!("  Matched symbols:");
        for symbol in &pattern.symbols {
            println!("    - {} : {}", symbol.name, symbol.signature);
        }
    }
    
    // Specifically check for singleton pattern
    let singleton_pattern = patterns.iter()
        .find(|p| matches!(p.category, PatternCategory::SingletonPattern));
        
    if let Some(pattern) = singleton_pattern {
        println!("\n✓ Singleton pattern found with {} symbols", pattern.symbols.len());
        assert!(!pattern.symbols.is_empty(), "Singleton pattern should have matched symbols");
    } else {
        println!("\n✗ No singleton pattern detected!");
        
        // Let's manually check why the first symbol didn't match
        println!("\nManual check for 'get_instance' symbol:");
        let test_symbol = &symbols[0];
        println!("  Name: '{}'", test_symbol.name);
        println!("  Signature: '{}'", test_symbol.signature);
        
        // Test regex patterns directly
        use regex::Regex;
        let instance_pattern = Regex::new(r"(?i)(get_?)?instance").unwrap();
        println!("  Name matches '(?i)(get_?)?instance': {}", instance_pattern.is_match(&test_symbol.name));
        
        let static_pattern = Regex::new(r"static.*Self").unwrap();
        println!("  Signature matches 'static.*Self': {}", static_pattern.is_match(&test_symbol.signature));
        
        let static_ref_pattern = Regex::new(r"&'static").unwrap();
        println!("  Signature matches '&'static': {}", static_ref_pattern.is_match(&test_symbol.signature));
    }
}

#[test]
fn test_factory_pattern_detection() {
    let detector = PatternDetector::new();
    
    let symbols = vec![
        create_test_symbol("create_database", "pub fn create_database(db_type: &str) -> Box<dyn Database>"),
        create_test_symbol("make_parser", "fn make_parser() -> impl Parser"),
        create_test_symbol("build_engine", "pub fn build_engine(config: Config) -> Box<dyn Engine>"),
        create_test_symbol("new", "pub fn new() -> Self"),
        create_test_symbol("factory", "struct DatabaseFactory"),
    ];
    
    let patterns = detector.detect_patterns(&symbols);
    
    let factory_pattern = patterns.iter()
        .find(|p| matches!(p.category, PatternCategory::FactoryPattern));
        
    if let Some(pattern) = factory_pattern {
        println!("Factory pattern found with {} symbols", pattern.symbols.len());
        for symbol in &pattern.symbols {
            println!("  - {}: {}", symbol.name, symbol.signature);
        }
    } else {
        println!("No factory pattern detected");
    }
}