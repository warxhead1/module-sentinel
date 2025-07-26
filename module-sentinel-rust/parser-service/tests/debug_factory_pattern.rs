use module_sentinel_parser::analysis::PatternDetector;
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language as ParserLanguage};

#[tokio::test]
async fn debug_factory_pattern_detection() {
    let detector = PatternDetector::new();
    
    // Create symbols that should match factory pattern
    let factory_symbols = vec![
        Symbol {
            id: "create_database".to_string(),
            name: "create_database".to_string(),
            signature: "pub fn create_database(db_type: &str, config: &str) -> Result<Box<dyn Database>, Error>".to_string(),
            language: ParserLanguage::Rust,
            file_path: "factory.rs".to_string(),
            start_line: 103,
            end_line: 116,
            embedding: None,
            semantic_hash: None,
            normalized_name: "create_database".to_string(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
        },
        Symbol {
            id: "make_connection".to_string(),
            name: "make_connection".to_string(),
            signature: "pub fn make_connection(protocol: Protocol) -> Box<dyn Connection>".to_string(),
            language: ParserLanguage::Rust,
            file_path: "factory.rs".to_string(),
            start_line: 122,
            end_line: 129,
            embedding: None,
            semantic_hash: None,
            normalized_name: "make_connection".to_string(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
        },
    ];
    
    println!("Testing factory pattern detection with symbols:");
    for symbol in &factory_symbols {
        println!("  - '{}': {}", symbol.name, symbol.signature);
    }
    
    // Enable debug logging for pattern detection
    std::env::set_var("RUST_LOG", "debug");
    tracing_subscriber::fmt::init();
    
    let patterns = detector.detect_patterns(&factory_symbols);
    
    println!("Detected {} patterns:", patterns.len());
    for pattern in &patterns {
        println!("  Pattern {:?}: {} symbols, confidence {}", pattern.category, pattern.symbols.len(), pattern.confidence);
        for symbol in &pattern.symbols {
            println!("    - {}", symbol.name);
        }
    }
    
    // Check for factory pattern specifically
    let factory_patterns: Vec<_> = patterns.iter()
        .filter(|p| matches!(p.category, module_sentinel_parser::analysis::PatternCategory::FactoryPattern))
        .collect();
    
    println!("Factory patterns found: {}", factory_patterns.len());
    
    if factory_patterns.is_empty() {
        println!("DEBUG: Let's check individual regex matching...");
        use regex::Regex;
        
        let name_regexes = vec![
            Regex::new(r"(?i)create").unwrap(),
            Regex::new(r"(?i)make").unwrap(),
            Regex::new(r"(?i)build").unwrap(),
            Regex::new(r"(?i)factory").unwrap(),
        ];
        
        let signature_regexes = vec![
            Regex::new(r"->.*Box<").unwrap(),
            Regex::new(r"->.*impl\s+").unwrap(),
            Regex::new(r"new.*->.*Self").unwrap(),
        ];
        
        for symbol in &factory_symbols {
            println!("\nAnalyzing symbol: {}", symbol.name);
            
            let name_matches: Vec<_> = name_regexes.iter()
                .filter(|regex| regex.is_match(&symbol.name))
                .collect();
            println!("  Name matches: {}/4", name_matches.len());
            
            let sig_matches: Vec<_> = signature_regexes.iter()
                .filter(|regex| regex.is_match(&symbol.signature))
                .collect();
            println!("  Signature matches: {}/3", sig_matches.len());
            
            if name_matches.len() > 0 && sig_matches.len() > 0 {
                println!("  ✓ This symbol SHOULD match factory pattern!");
            } else {
                println!("  ✗ This symbol doesn't match factory pattern");
            }
        }
    }
    
    assert!(!factory_patterns.is_empty(), "Should detect at least one factory pattern");
}