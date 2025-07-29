use module_sentinel_parser::analysis::SimilarityCalculator;
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language as ParserLanguage};

#[tokio::test]
async fn debug_duplicate_detection_similarity() {
    // Create symbols that should be detected as duplicates (email validators)
    let email_validator_1 = Symbol {
        id: "validate_email".to_string(),
        name: "validate_email".to_string(),
        signature: "pub fn validate_email(email: &str) -> bool".to_string(),
        language: ParserLanguage::Rust,
        file_path: "validators.rs".to_string(),
        start_line: 136,
        end_line: 161,
        embedding: None,
        semantic_hash: None,
        normalized_name: "validate_email".to_string(),
        context_embedding: None,
        duplicate_of: None,
        confidence_score: Some(1.0),
        similar_symbols: vec![],
        semantic_tags: None,
        intent: None,
    };
    
    let email_validator_2 = Symbol {
        id: "validate_email_address".to_string(),
        name: "validate_email_address".to_string(),
        signature: "pub fn validate_email_address(address: &str) -> bool".to_string(),
        language: ParserLanguage::Rust,
        file_path: "validators.rs".to_string(),
        start_line: 163,
        end_line: 188,
        embedding: None,
        semantic_hash: None,
        normalized_name: "validate_email_address".to_string(),
        context_embedding: None,
        duplicate_of: None,
        confidence_score: Some(1.0),
        similar_symbols: vec![],
        semantic_tags: None,
        intent: None,
    };
    
    // Also test average calculators
    let calc_average = Symbol {
        id: "calculate_average".to_string(),
        name: "calculate_average".to_string(),
        signature: "pub fn calculate_average(numbers: &[f64]) -> Option<f64>".to_string(),
        language: ParserLanguage::Rust,
        file_path: "validators.rs".to_string(),
        start_line: 191,
        end_line: 198,
        embedding: None,
        semantic_hash: None,
        normalized_name: "calculate_average".to_string(),
        context_embedding: None,
        duplicate_of: None,
        confidence_score: Some(1.0),
        similar_symbols: vec![],
        semantic_tags: None,
        intent: None,
    };
    
    let compute_mean = Symbol {
        id: "compute_mean".to_string(),
        name: "compute_mean".to_string(),
        signature: "pub fn compute_mean(values: &[f64]) -> Option<f64>".to_string(),
        language: ParserLanguage::Rust,
        file_path: "validators.rs".to_string(),
        start_line: 200,
        end_line: 207,
        embedding: None,
        semantic_hash: None,
        normalized_name: "compute_mean".to_string(),
        context_embedding: None,
        duplicate_of: None,
        confidence_score: Some(1.0),
        similar_symbols: vec![],
        semantic_tags: None,
        intent: None,
    };
    
    let calc = SimilarityCalculator::new();
    
    // Test email validator similarity
    let email_similarity = calc.calculate(&email_validator_1, &email_validator_2);
    println!("Email validator similarity: {:.3}", email_similarity.overall_score);
    println!("  Name similarity: {:.3}", email_similarity.name_similarity);
    println!("  Signature similarity: {:.3}", email_similarity.signature_similarity);
    println!("  Structural similarity: {:.3}", email_similarity.structural_similarity);
    
    // Test average calculator similarity
    let calc_similarity = calc.calculate(&calc_average, &compute_mean);
    println!("Average calculator similarity: {:.3}", calc_similarity.overall_score);
    println!("  Name similarity: {:.3}", calc_similarity.name_similarity);
    println!("  Signature similarity: {:.3}", calc_similarity.signature_similarity);
    println!("  Structural similarity: {:.3}", calc_similarity.structural_similarity);
    
    // Check what threshold we should use
    println!("\nRecommended duplicate thresholds:");
    println!("  Email validators: {:.3} > 0.7? {}", email_similarity.overall_score, email_similarity.overall_score > 0.7);
    println!("  Average calculators: {:.3} > 0.7? {}", calc_similarity.overall_score, calc_similarity.overall_score > 0.7);
    
    // Test if similarity > 0.6 instead of 0.7
    println!("  Email validators: {:.3} > 0.6? {}", email_similarity.overall_score, email_similarity.overall_score > 0.6);
    println!("  Average calculators: {:.3} > 0.6? {}", calc_similarity.overall_score, calc_similarity.overall_score > 0.6);
    
    // Test if similarity > 0.5 instead of 0.7
    println!("  Email validators: {:.3} > 0.5? {}", email_similarity.overall_score, email_similarity.overall_score > 0.5);
    println!("  Average calculators: {:.3} > 0.5? {}", calc_similarity.overall_score, calc_similarity.overall_score > 0.5);
}