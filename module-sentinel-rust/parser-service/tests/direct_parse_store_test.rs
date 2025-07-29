use anyhow::Result;
use module_sentinel_parser::database::project_database::ProjectDatabase;
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language};
use module_sentinel_parser::database::models::UniversalSymbol;
use tempfile::TempDir;

#[tokio::test]
async fn test_direct_parse_and_store() -> Result<()> {
    // Initialize logging
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .try_init();

    // Create temp directory for database
    let temp_dir = TempDir::new()?;
    
    println!("Creating database in directory: {:?}", temp_dir.path());
    
    // Create project database (it will create project.db in the temp dir)
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    // Create project
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    println!("Created project with ID: {:?}", project.id);
    
    // Get language ID
    let language = project_db.get_or_create_language("rust", "RustParser", &[".rs"]).await?;
    println!("Got language with ID: {:?}", language.id);
    
    // Create test symbols
    let test_symbols = vec![
        Symbol {
            id: "test::main".to_string(),
            name: "main".to_string(),
            signature: "fn main()".to_string(),
            language: Language::Rust,
            file_path: "test.rs".to_string(),
            start_line: 1,
            end_line: 3,
            embedding: None,
            semantic_hash: None,
            normalized_name: "main".to_string(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
            semantic_tags: Some(vec!["function".to_string()]),
            intent: None,
        },
        Symbol {
            id: "test::add".to_string(),
            name: "add".to_string(),
            signature: "fn add(a: i32, b: i32) -> i32".to_string(),
            language: Language::Rust,
            file_path: "test.rs".to_string(),
            start_line: 5,
            end_line: 7,
            embedding: None,
            semantic_hash: None,
            normalized_name: "add".to_string(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
            semantic_tags: Some(vec!["function".to_string()]),
            intent: None,
        },
    ];
    
    println!("\nTesting store_symbols (the working path from tests)...");
    let stored = project_db.store_symbols(
        project.id.unwrap(),
        language.id.unwrap(),
        &test_symbols
    ).await?;
    
    println!("Stored {} symbols via store_symbols", stored.len());
    
    // Now test store_parse_results (the production path)
    let universal_symbols: Vec<UniversalSymbol> = test_symbols.iter().map(|s| UniversalSymbol {
        id: None,
        project_id: project.id.unwrap(),
        language_id: language.id.unwrap(),
        name: s.name.clone(),
        qualified_name: s.id.clone(),
        kind: "function".to_string(),
        file_path: s.file_path.clone(),
        line: s.start_line as i32,
        column: 0,
        end_line: Some(s.end_line as i32),
        end_column: None,
        signature: Some(s.signature.clone()),
        return_type: None,
        visibility: Some("public".to_string()),
        namespace: None,
        parent_symbol_id: None,
        is_exported: true,
        is_async: false,
        is_abstract: false,
        language_features: None,
        semantic_tags: s.semantic_tags.as_ref().map(|tags| serde_json::to_string(tags).unwrap()),
        intent: None,
        confidence: s.confidence_score.unwrap_or(1.0) as f64,
        embedding: None,
        embedding_model: None,
        embedding_version: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    }).collect();
    
    println!("\nTesting store_parse_results (the production path)...");
    let stored2 = project_db.store_parse_results(
        project.id.unwrap(),
        &universal_symbols,
        &vec![]
    ).await?;
    
    println!("Stored {} symbols via store_parse_results", stored2.0.len());
    
    // Verify by querying
    let count = project_db.get_symbol_count(project.id.unwrap()).await?;
    println!("\nDatabase reports {} total symbols", count);
    
    // Search for symbols
    let found = project_db.search_symbols_simple("main", project.id.unwrap(), 10).await?;
    println!("Search for 'main' found {} results", found.len());
    for symbol in &found {
        println!("  - Found: {} ({})", symbol.name, symbol.kind);
    }
    
    Ok(())
}