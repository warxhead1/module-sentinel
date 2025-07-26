use module_sentinel_parser::analysis::{PatternDetector, PatternCategory};
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language as ParserLanguage};
use regex::Regex;

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
fn debug_pattern_matching() {
    // Manually test the singleton pattern matching logic
    let symbol = create_test_symbol("get_instance", "pub fn get_instance() -> &'static Self");
    
    println!("Symbol name: '{}'", symbol.name);
    println!("Symbol signature: '{}'", symbol.signature);
    
    // Test name patterns
    let name_patterns = vec![
        Regex::new(r"(?i)(get_?)?instance").unwrap(),
        Regex::new(r"(?i)singleton").unwrap(),
        Regex::new(r"(?i)shared").unwrap(),
    ];
    
    println!("\nTesting name patterns:");
    for (i, pattern) in name_patterns.iter().enumerate() {
        let matches = pattern.is_match(&symbol.name);
        println!("  Pattern {}: {} - matches: {}", i, pattern.as_str(), matches);
    }
    
    // Test signature patterns
    let signature_patterns = vec![
        Regex::new(r"static.*Self").unwrap(),
        Regex::new(r"&'static").unwrap(),
    ];
    
    println!("\nTesting signature patterns:");
    for (i, pattern) in signature_patterns.iter().enumerate() {
        let matches = pattern.is_match(&symbol.signature);
        println!("  Pattern {}: {} - matches: {}", i, pattern.as_str(), matches);
    }
    
    // Test context hints
    let context_hints = vec!["once", "lazy_static"];
    println!("\nTesting context hints:");
    for hint in &context_hints {
        let in_sig = symbol.signature.contains(hint);
        let in_name = symbol.name.contains(hint);
        println!("  Hint '{}': in_signature={}, in_name={}", hint, in_sig, in_name);
    }
    
    // Calculate confidence as the detector would
    let mut score = 0.0;
    let mut checks = 0.0;
    
    // Check name patterns
    for pattern in &name_patterns {
        checks += 1.0;
        if pattern.is_match(&symbol.name) {
            score += 1.0;
            println!("\nName pattern matched: {}", pattern.as_str());
        }
    }
    
    // Check signature patterns  
    for pattern in &signature_patterns {
        checks += 1.0;
        if pattern.is_match(&symbol.signature) {
            score += 1.0;
            println!("Signature pattern matched: {}", pattern.as_str());
        }
    }
    
    // Check context hints
    for hint in &context_hints {
        checks += 0.5;
        if symbol.signature.contains(hint) || symbol.name.contains(hint) {
            score += 0.5;
            println!("Context hint matched: {}", hint);
        }
    }
    
    let confidence = if checks > 0.0 { score / checks } else { 0.0 };
    println!("\nFinal score: {} / {} = {}", score, checks, confidence);
    println!("Min confidence for singleton: 0.7");
    println!("Would match: {}", confidence >= 0.7);
}