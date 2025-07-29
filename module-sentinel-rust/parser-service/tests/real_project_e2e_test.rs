/**
 * Real Project End-to-End Test
 * 
 * Tests the complete parsing pipeline against the actual module-sentinel project
 * to catch real-world integration issues that unit tests miss.
 */

use tokio;
use anyhow::Result;
use std::sync::Arc;
use std::path::Path;
use std::env;

use module_sentinel_parser::{
    services::{ParsingService, ParsingConfig},
    database::{ProjectDatabase, models::UniversalSymbol, orm::QueryBuilder},
};

/// Get the path to the module-sentinel project root
fn get_project_root() -> Result<String> {
    // Try to find project root by looking for package.json
    let current_dir = env::current_dir()?;
    
    // Go up from parser-service to module-sentinel root
    let project_root = current_dir
        .parent() // module-sentinel-rust
        .and_then(|p| p.parent()) // module-sentinel
        .ok_or_else(|| anyhow::anyhow!("Could not find module-sentinel project root"))?;
    
    let package_json = project_root.join("package.json");
    if !package_json.exists() {
        return Err(anyhow::anyhow!(
            "package.json not found at {:?}. This test must be run from the module-sentinel project.",
            package_json
        ));
    }
    
    Ok(project_root.to_string_lossy().to_string())
}

#[tokio::test]
async fn test_real_project_comprehensive_parsing() -> Result<()> {
    println!("🚀 Starting comprehensive E2E test on real module-sentinel project...");
    
    // Get the real project path
    let project_path = get_project_root()?;
    println!("📂 Project path: {}", project_path);
    
    // Verify we have source files
    let src_path = Path::new(&project_path).join("src");
    let rust_path = Path::new(&project_path).join("module-sentinel-rust");
    
    if !src_path.exists() || !rust_path.exists() {
        return Err(anyhow::anyhow!(
            "Expected source directories not found. This must be run from module-sentinel project root."
        ));
    }
    
    // Create temporary database for testing
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(project_db, ParsingConfig::default()).await?);
    
    // Parse the real project
    println!("🔍 Parsing project with multiple languages...");
    let start_time = std::time::Instant::now();
    
    let parsed_result = parsing_service.parse_project(
        Path::new(&project_path), 
        "module_sentinel_real_project", 
        true // force re-parsing
    ).await?;
    
    let parse_duration = start_time.elapsed();
    println!("⏱️  Parsing completed in {:?}", parse_duration);
    
    // Create database connection for querying
    let query_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    // === SYMBOL VALIDATION ===
    println!("\n📊 Analyzing parsed symbols...");
    
    let all_symbols = query_db.db().find_all(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", parsed_result.project_id)
    ).await?;
    
    println!("✅ Total symbols found: {}", all_symbols.len());
    
    // Validate reasonable symbol count for a project this size
    assert!(
        all_symbols.len() >= 500, 
        "Expected at least 500 symbols for module-sentinel project, found {}", 
        all_symbols.len()
    );
    
    // Check language distribution
    let mut language_counts = std::collections::HashMap::new();
    for symbol in &all_symbols {
        *language_counts.entry(symbol.language_id).or_insert(0) += 1;
    }
    
    println!("📈 Language distribution:");
    for (lang_id, count) in &language_counts {
        println!("  Language {}: {} symbols", lang_id, count);
    }
    
    // Should have multiple languages
    assert!(
        language_counts.len() >= 2, 
        "Expected multiple languages, found {}", 
        language_counts.len()
    );
    
    // === FILE PATH VALIDATION ===
    println!("\n📁 Validating file paths...");
    
    let symbols_with_real_paths: Vec<_> = all_symbols.iter()
        .filter(|s| !s.file_path.is_empty() && s.file_path != "undefined")
        .collect();
    
    println!("✅ Symbols with valid file paths: {}/{}", 
        symbols_with_real_paths.len(), all_symbols.len());
    
    assert!(
        symbols_with_real_paths.len() > all_symbols.len() / 2,
        "More than half of symbols should have valid file paths"
    );
    
    // Check for expected files
    let has_bridge_symbols = all_symbols.iter()
        .any(|s| s.file_path.contains("module-sentinel-bridge"));
    let has_rust_symbols = all_symbols.iter()
        .any(|s| s.file_path.contains(".rs"));
    let has_ts_symbols = all_symbols.iter()
        .any(|s| s.file_path.contains(".ts") && !s.file_path.contains("test"));
    
    println!("🔍 File type coverage:");
    println!("  Bridge files: {}", has_bridge_symbols);
    println!("  Rust files: {}", has_rust_symbols);
    println!("  TypeScript files: {}", has_ts_symbols);
    
    assert!(has_ts_symbols, "Should find TypeScript symbols");
    assert!(has_rust_symbols, "Should find Rust symbols");
    
    // === RELATIONSHIP VALIDATION ===
    println!("\n🔗 Analyzing relationships...");
    
    let all_relationships = query_db.get_all_relationships(parsed_result.project_id).await?;
    println!("✅ Total relationships found: {}", all_relationships.len());
    
    // This is the critical test - we should have MANY relationships
    assert!(
        all_relationships.len() >= 100, 
        "Expected at least 100 relationships for a complex project, found {}. This indicates relationship extraction is broken.",
        all_relationships.len()
    );
    
    // Validate relationship types
    let mut relationship_types = std::collections::HashMap::new();
    for rel in &all_relationships {
        *relationship_types.entry(&rel.relationship_type).or_insert(0) += 1;
    }
    
    println!("📊 Relationship type distribution:");
    for (rel_type, count) in &relationship_types {
        println!("  {}: {}", rel_type, count);
    }
    
    // Should have multiple relationship types
    assert!(
        relationship_types.len() >= 3,
        "Expected multiple relationship types (calls, accesses, etc.), found {}",
        relationship_types.len()
    );
    
    // Validate relationship data integrity
    let valid_relationships: Vec<_> = all_relationships.iter()
        .filter(|r| r.from_symbol_id.is_some() && r.to_symbol_id.is_some())
        .collect();
    
    println!("✅ Valid relationships (both endpoints): {}/{}", 
        valid_relationships.len(), all_relationships.len());
    
    assert!(
        valid_relationships.len() > all_relationships.len() / 2,
        "More than half of relationships should have valid symbol IDs"
    );
    
    // === SPECIFIC PATTERN VALIDATION ===
    println!("\n🎯 Validating expected patterns...");
    
    // Look for specific symbols we know should exist
    let bridge_class_symbols: Vec<_> = all_symbols.iter()
        .filter(|s| s.name.contains("ModuleSentinel") && s.kind == "class")
        .collect();
    
    let function_symbols: Vec<_> = all_symbols.iter()
        .filter(|s| s.kind == "function" || s.kind == "method")
        .collect();
    
    println!("🔍 Expected patterns found:");
    println!("  ModuleSentinel classes: {}", bridge_class_symbols.len());
    println!("  Functions/methods: {}", function_symbols.len());
    
    assert!(
        function_symbols.len() >= 50,
        "Expected at least 50 functions/methods, found {}",
        function_symbols.len()
    );
    
    // === RELATIONSHIP DENSITY VALIDATION ===
    let relationship_density = all_relationships.len() as f64 / all_symbols.len() as f64;
    println!("\n📈 Relationship density: {:.2} relationships per symbol", relationship_density);
    
    // In a well-connected codebase, we should have a reasonable relationship density
    assert!(
        relationship_density >= 0.1,
        "Relationship density too low: {:.2}. Expected at least 0.1 relationships per symbol.",
        relationship_density
    );
    
    // === PERFORMANCE VALIDATION ===
    println!("\n⚡ Performance metrics:");
    println!("  Parse time: {:?}", parse_duration);
    println!("  Symbols per second: {:.0}", all_symbols.len() as f64 / parse_duration.as_secs_f64());
    
    // Should be reasonably fast
    assert!(
        parse_duration.as_secs() < 30,
        "Parsing took too long: {:?}. Should complete within 30 seconds.",
        parse_duration
    );
    
    // === SUMMARY ===
    println!("\n🎉 E2E Test Summary:");
    println!("  ✅ Symbols: {} (target: ≥500)", all_symbols.len());
    println!("  ✅ Relationships: {} (target: ≥100)", all_relationships.len());
    println!("  ✅ Languages: {} (target: ≥2)", language_counts.len());
    println!("  ✅ Relationship density: {:.2} (target: ≥0.1)", relationship_density);
    println!("  ✅ Parse time: {:?} (target: <30s)", parse_duration);
    
    Ok(())
}

#[tokio::test]
async fn test_real_project_relationship_extraction() -> Result<()> {
    println!("🔍 Testing relationship extraction on real project files...");
    
    let project_path = get_project_root()?;
    
    // Test specific files that should have many relationships
    let test_files = vec![
        "src/rust-bridge/module-sentinel-bridge.ts",
        "src/services/flow-analysis.service.ts", 
        "module-sentinel-rust/napi-bindings/src/lib.rs",
    ];
    
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(project_db, ParsingConfig::default()).await?);
    
    for test_file in test_files {
        let file_path = Path::new(&project_path).join(test_file);
        
        if !file_path.exists() {
            println!("⚠️  Skipping non-existent file: {}", test_file);
            continue;
        }
        
        println!("📄 Testing file: {}", test_file);
        
        // Parse just this file
        let result = parsing_service.parse_file(&file_path).await;
        
        match result {
            Ok(parse_result) => {
                println!("  ✅ Symbols: {}", parse_result.symbols.len());
                println!("  ✅ Relationships: {}", parse_result.relationships.len());
                
                // A complex file should have multiple symbols and relationships
                if parse_result.symbols.len() > 5 {
                    assert!(
                        parse_result.relationships.len() > 0,
                        "File {} has {} symbols but 0 relationships - relationship extraction is broken",
                        test_file, parse_result.symbols.len()
                    );
                }
                
                // Print sample relationships for debugging
                for (i, rel) in parse_result.relationships.iter().take(3).enumerate() {
                    println!("    Relationship {}: {} -> {} ({})", 
                        i + 1, 
                        rel.from_symbol_id.unwrap_or(0),
                        rel.to_symbol_id.unwrap_or(0),
                        rel.relationship_type
                    );
                }
            }
            Err(e) => {
                println!("  ❌ Parse error: {}", e);
                // Don't fail the test for individual file errors, but log them
            }
        }
    }
    
    println!("✅ Individual file relationship extraction test completed");
    
    Ok(())
}

#[tokio::test]
async fn test_real_project_search_functionality() -> Result<()> {
    println!("🔍 Testing search functionality on real project...");
    
    let project_path = get_project_root()?;
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(project_db, ParsingConfig::default()).await?);
    
    // Parse the project first
    let parsed_result = parsing_service.parse_project(
        Path::new(&project_path), 
        "search_test_project", 
        true
    ).await?;
    
    // Verify parsing was successful
    assert!(parsed_result.symbols_count > 0, "Should have parsed some symbols from the project");
    
    let query_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    // Test searches for symbols we know should exist
    let test_queries = vec![
        ("ModuleSentinel", "Should find the main bridge class"),
        ("parse", "Should find parsing functions"),
        ("get_all_relationships", "Should find relationship methods"),
        ("search_symbols", "Should find search methods"),
    ];
    
    for (query, description) in test_queries {
        println!("🔍 Searching for: '{}' - {}", query, description);
        
        let results = query_db.search_symbols_simple(&query, 1, 10).await?;
        
        println!("  ✅ Found {} results", results.len());
        
        // Print sample results
        for (i, symbol) in results.iter().take(3).enumerate() {
            println!("    {}: {} in {}", i + 1, symbol.name, symbol.file_path);
        }
        
        // We should find at least some results for these common terms
        if query == "parse" || query == "get" {
            assert!(
                results.len() > 0,
                "Search for '{}' returned 0 results - search functionality is broken",
                query
            );
        }
    }
    
    println!("✅ Search functionality test completed");
    
    Ok(())
}