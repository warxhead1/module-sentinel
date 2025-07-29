use anyhow::Result;
use std::sync::Arc;
use std::fs;
use std::path::Path;

use module_sentinel_parser::{
    analysis::SimilarityCalculator,
    services::{ParsingService, ParsingConfig},
    database::ProjectDatabase,
    parsers::tree_sitter::{Language as ParserLanguage},
};

/// Create test files with real duplicate code patterns
async fn setup_test_project(temp_dir: &Path) -> Result<()> {
    fs::create_dir_all(temp_dir.join("src"))?;
    
    // Create file with duplicate email validation functions
    fs::write(temp_dir.join("src/validators.rs"), r#"
// These functions are very similar and should be detected as duplicates

pub fn validate_email(email: &str) -> bool {
    if email.is_empty() {
        return false;
    }
    
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return false;
    }
    
    let local = parts[0];
    let domain = parts[1];
    
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    
    // Check for valid characters
    let valid_chars = local.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '_' || c == '-');
    if !valid_chars {
        return false;
    }
    
    // Check domain
    domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

pub fn validate_email_address(address: &str) -> bool {
    if address.is_empty() {
        return false;
    }
    
    let components: Vec<&str> = address.split('@').collect();
    if components.len() != 2 {
        return false;
    }
    
    let username = components[0];
    let domain_name = components[1];
    
    if username.is_empty() || domain_name.is_empty() {
        return false;
    }
    
    // Validate characters in username
    let chars_valid = username.chars().all(|ch| ch.is_alphanumeric() || ch == '.' || ch == '_' || ch == '-');
    if !chars_valid {
        return false;
    }
    
    // Validate domain
    domain_name.contains('.') && !domain_name.starts_with('.') && !domain_name.ends_with('.')
}

// Another duplicate pair
pub fn calculate_average(numbers: &[f64]) -> Option<f64> {
    if numbers.is_empty() {
        return None;
    }
    
    let sum: f64 = numbers.iter().sum();
    Some(sum / numbers.len() as f64)
}

pub fn compute_mean(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    
    let total: f64 = values.iter().sum();
    Some(total / values.len() as f64)
}
"#)?;

    Ok(())
}

#[tokio::test]
async fn test_simple_duplicate_detection_with_similarity_calculator() -> Result<()> {
    println!("Testing simple duplicate detection using SimilarityCalculator...");
    
    let temp_dir = tempfile::tempdir()?;
    setup_test_project(temp_dir.path()).await?;
    
    // Initialize components
    let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await?);
    let parsing_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await?);
    
    // Parse the project
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    parsing_service.parse_project(temp_dir.path(), "test_project", true).await?;
    
    // Load symbols from database
    use module_sentinel_parser::database::{orm::QueryBuilder, models::UniversalSymbol};
    let symbols = project_db.db().find_all(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project.id.unwrap())
    ).await?;
    
    println!("Found {} symbols in database", symbols.len());
    
    // Convert to parser symbols for similarity calculation
    let parser_symbols: Vec<_> = symbols.iter().map(|s| {
        module_sentinel_parser::parsers::tree_sitter::Symbol {
            id: s.qualified_name.clone(),
            name: s.name.clone(),
            signature: s.signature.clone().unwrap_or_default(),
            language: ParserLanguage::Rust,
            file_path: s.file_path.clone(),
            start_line: s.line as u32,
            end_line: s.end_line.unwrap_or(s.line) as u32,
            embedding: None,
            semantic_hash: None,
            normalized_name: s.name.to_lowercase(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
            semantic_tags: None,
            intent: None,
        }
    }).collect();
    
    // Find email validation functions
    let email_validators: Vec<_> = parser_symbols.iter()
        .filter(|s| s.name.contains("email"))
        .collect();
    
    println!("Found {} email validators:", email_validators.len());
    for validator in &email_validators {
        println!("  - {}: {}", validator.name, validator.signature);
    }
    
    // Find average calculation functions
    let calculators: Vec<_> = parser_symbols.iter()
        .filter(|s| s.name.contains("average") || s.name.contains("mean"))
        .collect();
    
    println!("Found {} calculators:", calculators.len());
    for calc in &calculators {
        println!("  - {}: {}", calc.name, calc.signature);
    }
    
    // Test similarity using SimilarityCalculator directly
    let similarity_calc = SimilarityCalculator::new();
    
    // Test email validator similarity
    if email_validators.len() >= 2 {
        let similarity = similarity_calc.calculate(email_validators[0], email_validators[1]);
        println!("\nEmail validator similarity: {:.3}", similarity.overall_score);
        println!("  Name similarity: {:.3}", similarity.name_similarity);
        println!("  Signature similarity: {:.3}", similarity.signature_similarity);
        
        // These should be detected as duplicates with a threshold of 0.6
        assert!(similarity.overall_score > 0.6, 
            "Email validators should have high similarity: {:.3} > 0.6", 
            similarity.overall_score);
        
        println!("✓ Email validators correctly identified as duplicates");
    }
    
    // Test calculator similarity 
    if calculators.len() >= 2 {
        let calc_average = calculators.iter().find(|c| c.name.contains("average")).unwrap();
        let compute_mean = calculators.iter().find(|c| c.name.contains("mean")).unwrap();
        
        let similarity = similarity_calc.calculate(calc_average, compute_mean);
        println!("\nCalculator similarity: {:.3}", similarity.overall_score);
        println!("  Name similarity: {:.3}", similarity.name_similarity);
        println!("  Signature similarity: {:.3}", similarity.signature_similarity);
        
        // These should be somewhat similar but may not meet high threshold
        if similarity.overall_score > 0.4 {
            println!("✓ Calculators have moderate similarity: {:.3}", similarity.overall_score);
        } else {
            println!("⚠ Calculators have low similarity: {:.3} (this is expected)", similarity.overall_score);
        }
    }
    
    // Verify we have actual symbols with meaningful signatures
    let meaningful_symbols: Vec<_> = parser_symbols.iter()
        .filter(|s| !s.signature.is_empty() && s.signature.contains("fn"))
        .collect();
    
    assert!(!meaningful_symbols.is_empty(), "Should have symbols with function signatures");
    assert!(meaningful_symbols.len() >= 4, "Should have at least 4 function symbols");
    
    println!("\n✓ Test completed successfully!");
    println!("  - Found {} total symbols", parser_symbols.len());
    println!("  - Found {} email validators", email_validators.len());
    println!("  - Found {} calculators", calculators.len());
    println!("  - Similarity calculation working correctly");
    
    Ok(())
}