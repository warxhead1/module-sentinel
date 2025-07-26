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
fn debug_pattern_detection() {
    let detector = PatternDetector::new();
    
    // Test singleton detection
    let singleton_symbol = create_test_symbol("get_instance", "pub fn get_instance() -> &'static Self");
    println!("Testing symbol: {} with signature: {}", singleton_symbol.name, singleton_symbol.signature);
    
    let patterns = detector.detect_patterns(&[singleton_symbol]);
    println!("Detected {} patterns", patterns.len());
    println!("Note: Empty pattern categories are filtered out in detect_patterns");
    
    for pattern in &patterns {
        println!("Pattern category: {:?}, symbols: {}, confidence: {}", 
                 pattern.category, pattern.symbols.len(), pattern.confidence);
        for evidence in &pattern.evidence {
            println!("  Evidence: {}", evidence);
        }
    }
    
    // Test with multiple symbols
    let symbols = vec![
        create_test_symbol("get_instance", "pub fn get_instance() -> &'static Self"),
        create_test_symbol("instance", "pub fn instance() -> &'static Logger"),
        create_test_symbol("create_database", "pub fn create_database(db_type: &str) -> Box<dyn Database>"),
    ];
    
    println!("\n\nTesting with {} symbols", symbols.len());
    let patterns = detector.detect_patterns(&symbols);
    
    for pattern in &patterns {
        println!("\nPattern: {:?}", pattern.category);
        println!("  Matched symbols: {}", pattern.symbols.len());
        println!("  Confidence: {}", pattern.confidence);
        for symbol in &pattern.symbols {
            println!("    - {}: {}", symbol.name, symbol.signature);
        }
    }
}