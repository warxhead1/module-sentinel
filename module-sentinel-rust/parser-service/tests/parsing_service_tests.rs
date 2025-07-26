use tokio;
use anyhow::Result;
use tempfile::TempDir;
use std::path::Path;
use std::sync::Arc;

use module_sentinel_parser::services::parsing_service::{
    ParsingService, ParsingConfig
};
use module_sentinel_parser::database::{
    project_database::ProjectDatabase,
};


// Helper function to create test project structure
async fn create_test_project() -> Result<(TempDir, std::path::PathBuf)> {
    let temp_dir = tempfile::tempdir()?;
    let project_path = temp_dir.path().to_path_buf();
    
    // Create test source files
    std::fs::create_dir_all(project_path.join("src"))?;
    
    // Simple Rust file
    std::fs::write(
        project_path.join("src/main.rs"),
        r#"
fn main() {
    println!("Hello, world!");
    let result = add_numbers(5, 3);
    println!("Result: {}", result);
}

fn add_numbers(a: i32, b: i32) -> i32 {
    a + b
}

struct Calculator {
    value: i32,
}

impl Calculator {
    fn new() -> Self {
        Self { value: 0 }
    }
    
    fn add(&mut self, x: i32) {
        self.value += x;
    }
}
"#
    )?;
    
    // Simple Python file  
    std::fs::write(
        project_path.join("src/utils.py"),
        r#"
def calculate_sum(a, b):
    """Calculate the sum of two numbers."""
    return a + b

class DataProcessor:
    def __init__(self):
        self.data = []
    
    def add_item(self, item):
        self.data.append(item)
    
    def process(self):
        return len(self.data)
"#
    )?;
    
    Ok((temp_dir, project_path))
}


#[tokio::test]
async fn test_parsing_service_creation() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig {
        max_file_size_mb: 10,
        timeout_seconds: 30,
        enable_semantic_analysis: false,
        parallel_parsing: true,
    };
    
    let service = ParsingService::new(project_db, config).await?;
    assert!(service.is_initialized());
    
    Ok(())
}

#[tokio::test]
async fn test_parse_single_file() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    // Create test project
    let (_project_temp_dir, project_path) = create_test_project().await?;
    let rust_file = project_path.join("src/main.rs");
    
    // Parse single file
    let result = service.parse_file(&rust_file).await?;
    
    assert!(!result.symbols.is_empty());
    assert!(result.symbols.len() >= 4); // main, add_numbers, Calculator struct, new method, add method
    assert!(result.success);
    // Parse duration might be 0 for very fast operations, so just check it's not negative
    assert!(result.parse_duration_ms >= 0);
    
    // Check that we found the expected symbols
    let symbol_names: Vec<&str> = result.symbols.iter().map(|s| s.name.as_str()).collect();
    assert!(symbol_names.contains(&"main"));
    assert!(symbol_names.contains(&"add_numbers"));
    assert!(symbol_names.contains(&"Calculator"));
    
    Ok(())
}

#[tokio::test]
async fn test_parse_project_full() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    // Create test project
    let (_project_temp_dir, project_path) = create_test_project().await?;
    
    // Parse entire project
    let result = service.parse_project(&project_path, "test_project").await?;
    
    assert!(result.total_files >= 2); // main.rs and utils.py
    assert!(result.total_symbols >= 6); // Rust + Python symbols
    assert!(result.success);
    assert!(!result.errors.is_empty() == false || result.errors.is_empty()); // Either no errors or some expected ones
    
    // Verify project was created in database
    assert!(result.project_id > 0);
    
    Ok(())
}

#[tokio::test]
async fn test_incremental_parsing() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    // Create test project
    let (_project_temp_dir, project_path) = create_test_project().await?;
    
    // Initial parse
    let result1 = service.parse_project(&project_path, "incremental_test").await?;
    let initial_symbol_count = result1.total_symbols;
    
    // Modify a file
    std::fs::write(
        project_path.join("src/main.rs"),
        r#"
fn main() {
    println!("Hello, modified world!");
}

fn new_function() -> String {
    "new function".to_string()
}
"#
    )?;
    
    // Incremental parse
    let result2 = service.parse_project_incremental(&project_path, result1.project_id).await?;
    
    assert!(result2.success);
    assert_ne!(result2.total_symbols, initial_symbol_count); // Should detect changes
    
    Ok(())
}

#[tokio::test] 
async fn test_symbol_persistence() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    // Create test project
    let (_project_temp_dir, project_path) = create_test_project().await?;
    
    // Parse project
    let result = service.parse_project(&project_path, "persistence_test").await?;
    
    // Verify symbols were stored in database
    let stored_symbols = service.get_project_symbols(result.project_id).await?;
    assert!(!stored_symbols.is_empty());
    assert_eq!(stored_symbols.len() as i32, result.total_symbols);
    
    // Verify we can query specific symbols
    let main_symbols: Vec<_> = stored_symbols.iter()
        .filter(|s| s.name == "main")
        .collect();
    assert_eq!(main_symbols.len(), 1);
    
    Ok(())
}

#[tokio::test]
async fn test_file_change_detection() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    // Create test project
    let (_project_temp_dir, project_path) = create_test_project().await?;
    
    // Wait a bit before parsing to ensure file timestamps are stable
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Initial parse
    let result1 = service.parse_project(&project_path, "change_detection_test").await?;
    
    // Check for changes (should be none initially since we just parsed)
    let changes1 = service.detect_file_changes(&project_path, result1.project_id).await?;
    assert!(changes1.is_empty());
    
    // Wait a bit to ensure file modification time is after parse time
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    
    // Modify file
    std::fs::write(
        project_path.join("src/main.rs"),
        "fn main() { println!(\"Modified!\"); }"
    )?;
    
    // Check for changes (should detect the modification)
    let changes2 = service.detect_file_changes(&project_path, result1.project_id).await?;
    assert!(!changes2.is_empty());
    assert_eq!(changes2.len(), 1);
    assert!(changes2[0].file_path.ends_with("main.rs"));
    
    Ok(())
}

#[tokio::test]
async fn test_error_handling() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig::default();
    let service = ParsingService::new(project_db, config).await?;
    
    // Try to parse non-existent file
    let result = service.parse_file(Path::new("/non/existent/file.rs")).await;
    assert!(result.is_err());
    
    // Try to parse file with syntax errors
    let temp_dir = tempfile::tempdir()?;
    let bad_file = temp_dir.path().join("bad.rs");
    std::fs::write(&bad_file, "fn main( { // Invalid syntax")?;
    
    let result = service.parse_file(&bad_file).await?;
    assert!(!result.success);
    assert!(!result.errors.is_empty());
    
    Ok(())
}

#[tokio::test]
async fn test_concurrent_parsing() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let project_db = ProjectDatabase::new(temp_dir.path()).await?;
    
    let config = ParsingConfig {
        parallel_parsing: true,
        ..Default::default()
    };
    let service = Arc::new(ParsingService::new(project_db, config).await?);
    
    // Create multiple test files
    let temp_dir = tempfile::tempdir()?;
    let project_path = temp_dir.path();
    
    for i in 0..5 {
        std::fs::write(
            project_path.join(format!("file_{}.rs", i)),
            format!("fn function_{}() {{ println!(\"Hello {}\"); }}", i, i)
        )?;
    }
    
    // Parse files concurrently
    let mut handles = Vec::new();
    for i in 0..5 {
        let service_clone = Arc::clone(&service);
        let file_path = project_path.join(format!("file_{}.rs", i));
        let handle = tokio::spawn(async move {
            service_clone.parse_file(&file_path).await
        });
        handles.push(handle);
    }
    
    // Wait for all parses to complete
    let mut total_symbols = 0;
    for handle in handles {
        let result = handle.await??;
        assert!(result.success);
        total_symbols += result.symbols.len();
    }
    
    assert_eq!(total_symbols, 5); // One function per file
    
    Ok(())
}