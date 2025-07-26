use tokio;
use anyhow::Result;
use tempfile::TempDir;
use std::sync::Arc;
use std::fs;
use std::path::Path;

use module_sentinel_parser::{
    analysis::{SemanticAnalyzer, PatternDetector, SimilarityCalculator},
    services::{ParsingService, ParsingConfig},
    database::ProjectDatabase,
    parsers::tree_sitter::{CodeEmbedder, Language as ParserLanguage},
};

/// Create test files with real code patterns
async fn setup_test_project(temp_dir: &Path) -> Result<()> {
    // Create directory structure
    fs::create_dir_all(temp_dir.join("src"))?;
    fs::create_dir_all(temp_dir.join("tests"))?;
    fs::create_dir_all(temp_dir.join("src/patterns"))?;
    fs::create_dir_all(temp_dir.join("src/utils"))?;
    
    // Singleton pattern example
    fs::write(temp_dir.join("src/patterns/singleton.rs"), r#"
use std::sync::{Arc, Mutex, OnceLock};

pub struct ConfigManager {
    settings: HashMap<String, String>,
}

static INSTANCE: OnceLock<Arc<Mutex<ConfigManager>>> = OnceLock::new();

impl ConfigManager {
    fn new() -> Self {
        Self {
            settings: HashMap::new(),
        }
    }
    
    pub fn get_instance() -> Arc<Mutex<ConfigManager>> {
        INSTANCE.get_or_init(|| {
            Arc::new(Mutex::new(ConfigManager::new()))
        }).clone()
    }
    
    pub fn get_setting(&self, key: &str) -> Option<&String> {
        self.settings.get(key)
    }
}

// Another singleton implementation
pub struct Logger {
    level: LogLevel,
}

static LOGGER: OnceLock<Logger> = OnceLock::new();

impl Logger {
    pub fn instance() -> &'static Self {
        LOGGER.get_or_init(|| Logger { level: LogLevel::Info })
    }
    
    pub fn log(&self, message: &str) {
        println!("[{}] {}", self.level, message);
    }
}
"#)?;

    // Factory pattern example
    fs::write(temp_dir.join("src/patterns/factory.rs"), r#"
use std::boxed::Box;

pub trait Database {
    fn connect(&self) -> Result<(), Error>;
    fn query(&self, sql: &str) -> Result<Vec<Row>, Error>;
}

pub struct PostgresDB {
    connection_string: String,
}

pub struct MySQLDB {
    connection_string: String,
}

pub struct SQLiteDB {
    file_path: String,
}

impl Database for PostgresDB {
    fn connect(&self) -> Result<(), Error> {
        // Implementation
        Ok(())
    }
    
    fn query(&self, sql: &str) -> Result<Vec<Row>, Error> {
        // Implementation
        Ok(vec![])
    }
}

// Factory function
pub fn create_database(db_type: &str, config: &str) -> Result<Box<dyn Database>, Error> {
    match db_type {
        "postgres" => Ok(Box::new(PostgresDB {
            connection_string: config.to_string(),
        })),
        "mysql" => Ok(Box::new(MySQLDB {
            connection_string: config.to_string(),
        })),
        "sqlite" => Ok(Box::new(SQLiteDB {
            file_path: config.to_string(),
        })),
        _ => Err(Error::new("Unknown database type")),
    }
}

// Another factory pattern
pub struct ConnectionFactory;

impl ConnectionFactory {
    pub fn make_connection(protocol: Protocol) -> Box<dyn Connection> {
        match protocol {
            Protocol::Http => Box::new(HttpConnection::new()),
            Protocol::WebSocket => Box::new(WebSocketConnection::new()),
            Protocol::Tcp => Box::new(TcpConnection::new()),
        }
    }
}
"#)?;

    // Duplicate code examples
    fs::write(temp_dir.join("src/utils/validators.rs"), r#"
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

    // Async patterns
    fs::write(temp_dir.join("src/async_patterns.rs"), r#"
use tokio;
use futures::future::join_all;

pub async fn fetch_user_data(user_id: u64) -> Result<User, Error> {
    let client = reqwest::Client::new();
    let response = client
        .get(&format!("https://api.example.com/users/{}", user_id))
        .send()
        .await?;
    
    response.json::<User>().await
}

pub async fn fetch_multiple_users(user_ids: Vec<u64>) -> Result<Vec<User>, Error> {
    let futures = user_ids.into_iter()
        .map(|id| fetch_user_data(id))
        .collect::<Vec<_>>();
    
    let results = join_all(futures).await;
    
    results.into_iter()
        .collect::<Result<Vec<_>, _>>()
}

pub async fn parallel_process<T, F, Fut>(items: Vec<T>, processor: F) -> Vec<Fut::Output>
where
    F: Fn(T) -> Fut,
    Fut: std::future::Future,
{
    let futures = items.into_iter()
        .map(processor)
        .collect::<Vec<_>>();
    
    join_all(futures).await
}
"#)?;

    // Test patterns
    fs::write(temp_dir.join("tests/unit_tests.rs"), r#"
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validator_should_accept_valid_email() {
        assert!(validate_email("user@example.com"));
        assert!(validate_email("test.user@domain.co.uk"));
    }
    
    #[test]
    fn test_validator_should_reject_invalid_email() {
        assert!(!validate_email(""));
        assert!(!validate_email("no-at-sign"));
        assert!(!validate_email("@no-local"));
    }
    
    #[tokio::test]
    async fn test_async_fetch_should_return_user() {
        let user = fetch_user_data(123).await;
        assert!(user.is_ok());
    }
    
    #[test]
    fn should_calculate_average_correctly() {
        let numbers = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let avg = calculate_average(&numbers);
        assert_eq!(avg, Some(3.0));
    }
}
"#)?;

    // Cross-language FFI example
    fs::write(temp_dir.join("src/ffi_bindings.rs"), r#"
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};

#[repr(C)]
pub struct Point {
    x: f64,
    y: f64,
}

extern "C" {
    fn external_calculate_distance(p1: *const Point, p2: *const Point) -> f64;
    fn external_process_string(input: *const c_char) -> *mut c_char;
}

#[no_mangle]
pub extern "C" fn rust_create_point(x: f64, y: f64) -> *mut Point {
    Box::into_raw(Box::new(Point { x, y }))
}

#[no_mangle]
pub extern "C" fn rust_free_point(point: *mut Point) {
    if !point.is_null() {
        unsafe { Box::from_raw(point); }
    }
}

pub fn calculate_distance_ffi(p1: &Point, p2: &Point) -> f64 {
    unsafe {
        external_calculate_distance(p1 as *const Point, p2 as *const Point)
    }
}
"#)?;

    Ok(())
}

#[tokio::test]
async fn test_pattern_detection_on_real_code() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    setup_test_project(temp_dir.path()).await?;
    
    // Initialize components
    let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await?);
    let parsing_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await?);
    
    // Parse the project
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    parsing_service.parse_project(temp_dir.path(), "test_project").await?;
    
    // Create pattern detector
    let detector = PatternDetector::new();
    
    // Load symbols and detect patterns
    use module_sentinel_parser::database::{orm::QueryBuilder, models::UniversalSymbol};
    let symbols = project_db.db().find_all(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project.id.unwrap())
    ).await?;
    
    // Convert to parser symbols
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
        }
    }).collect();
    
    // Debug: Print parsed symbols
    println!("Found {} parsed symbols:", parser_symbols.len());
    for symbol in &parser_symbols {
        println!("  Symbol '{}': {}", symbol.name, symbol.signature);
    }
    
    let patterns = detector.detect_patterns(&parser_symbols);
    println!("Detected {} patterns:", patterns.len());
    for pattern in &patterns {
        println!("  Pattern {:?}: {} symbols, confidence {}", pattern.category, pattern.symbols.len(), pattern.confidence);
    }
    
    // Verify singleton pattern detection
    let singleton_pattern = patterns.iter()
        .find(|p| matches!(p.category, module_sentinel_parser::analysis::PatternCategory::SingletonPattern))
        .expect("Should detect singleton pattern");
    
    assert!(singleton_pattern.symbols.len() >= 2, "Should find at least 2 singleton implementations");
    assert!(singleton_pattern.confidence > 0.7, "Should have high confidence for singleton pattern");
    
    // Verify factory pattern detection
    let factory_pattern = patterns.iter()
        .find(|p| matches!(p.category, module_sentinel_parser::analysis::PatternCategory::FactoryPattern))
        .expect("Should detect factory pattern");
    
    assert!(factory_pattern.symbols.len() >= 2, "Should find factory methods");
    
    // Verify test pattern detection
    let test_pattern = patterns.iter()
        .find(|p| matches!(p.category, module_sentinel_parser::analysis::PatternCategory::TestPattern))
        .expect("Should detect test pattern");
    
    assert!(test_pattern.symbols.len() >= 4, "Should find test functions");
    
    // Verify FFI pattern detection
    let ffi_pattern = patterns.iter()
        .find(|p| matches!(p.category, module_sentinel_parser::analysis::PatternCategory::CrossLanguageFFI))
        .expect("Should detect FFI pattern");
    
    assert!(!ffi_pattern.symbols.is_empty(), "Should find FFI functions");
    
    Ok(())
}

#[tokio::test]
async fn test_duplicate_detection_on_real_code() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    setup_test_project(temp_dir.path()).await?;
    
    // Initialize components
    let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await?);
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let analyzer = SemanticAnalyzer::new(embedder, Arc::clone(&project_db)).await?;
    
    // Parse the project
    let parsing_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await?);
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    parsing_service.parse_project(temp_dir.path(), "test_project").await?;
    
    // Analyze for duplicates
    let analysis = analyzer.analyze_file(
        project.id.unwrap(),
        "src/utils/validators.rs"
    ).await?;
    
    // Should find duplicate email validators
    assert!(!analysis.duplicate_groups.is_empty(), "Should find duplicate groups");
    
    let email_duplicates = analysis.duplicate_groups.iter()
        .find(|g| g.primary_symbol.name.contains("email"))
        .expect("Should find email validator duplicates");
    
    assert!(!email_duplicates.duplicate_symbols.is_empty(), "Should have duplicate email validators");
    
    // Should find duplicate average/mean calculators
    let calc_duplicates = analysis.duplicate_groups.iter()
        .find(|g| g.primary_symbol.name.contains("average") || g.primary_symbol.name.contains("mean"))
        .expect("Should find calculator duplicates");
    
    assert!(calc_duplicates.group_confidence > 0.8, "Should have high confidence for obvious duplicates");
    
    // Check insights
    assert!(analysis.insights.code_reuse_percentage > 0.0, "Should detect code reuse");
    assert!(!analysis.insights.recommendations.is_empty(), "Should provide recommendations");
    
    Ok(())
}

#[tokio::test]
async fn test_similarity_calculation_on_real_code() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    setup_test_project(temp_dir.path()).await?;
    
    // Initialize components
    let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await?);
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let analyzer = SemanticAnalyzer::new(embedder, Arc::clone(&project_db)).await?;
    
    // Parse the project
    let parsing_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await?);
    parsing_service.parse_project(temp_dir.path(), "test_project").await?;
    
    // Get some symbols to compare
    use module_sentinel_parser::database::{orm::QueryBuilder, models::UniversalSymbol};
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    let symbols = project_db.db().find_all(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project.id.unwrap())
            .limit(20)
    ).await?;
    
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
        }
    }).collect();
    
    // Test direct similarity calculation
    let calc = SimilarityCalculator::new();
    
    if parser_symbols.len() >= 2 {
        // Find email validators
        let email_validators: Vec<_> = parser_symbols.iter()
            .filter(|s| s.name.contains("email"))
            .collect();
        
        if email_validators.len() >= 2 {
            let similarity = calc.calculate(email_validators[0], email_validators[1]);
            assert!(similarity.name_similarity > 0.7, "Email validators should have similar names");
            assert!(similarity.overall_score > 0.6, "Email validators should be similar overall");
        }
        
        // Compare singleton methods
        let instance_methods: Vec<_> = parser_symbols.iter()
            .filter(|s| s.name.contains("instance") || s.name.contains("get_instance"))
            .collect();
        
        if instance_methods.len() >= 2 {
            let similarity = calc.calculate(instance_methods[0], instance_methods[1]);
            assert!(similarity.name_similarity > 0.5, "Instance methods should have somewhat similar names");
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_full_project_analysis() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    setup_test_project(temp_dir.path()).await?;
    
    // Initialize all components
    let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await?);
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let analyzer = SemanticAnalyzer::new(embedder, Arc::clone(&project_db)).await?;
    
    // Parse the project
    let parsing_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await?);
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    parsing_service.parse_project(temp_dir.path(), "test_project").await?;
    
    // Run full analysis
    let analysis = analyzer.analyze_project(project.id.unwrap()).await?;
    
    // Verify comprehensive results
    assert!(analysis.insights.total_symbols_analyzed > 0, "Should analyze symbols");
    assert!(analysis.insights.patterns_detected > 0, "Should detect patterns");
    assert!(!analysis.pattern_matches.is_empty(), "Should find pattern matches");
    
    // Check for specific patterns
    let pattern_types: Vec<_> = analysis.pattern_matches.iter()
        .map(|p| &p.pattern_type)
        .collect();
    
    assert!(pattern_types.iter().any(|t| t.contains("Singleton")), "Should detect singleton pattern");
    assert!(pattern_types.iter().any(|t| t.contains("Factory")), "Should detect factory pattern");
    
    // Verify insights are meaningful
    assert!(!analysis.insights.recommendations.is_empty(), "Should provide recommendations");
    
    println!("\n=== Analysis Results ===");
    println!("Total symbols analyzed: {}", analysis.insights.total_symbols_analyzed);
    println!("Duplicate groups found: {}", analysis.duplicate_groups.len());
    println!("Patterns detected: {}", analysis.insights.patterns_detected);
    println!("Code reuse: {:.1}%", analysis.insights.code_reuse_percentage);
    println!("\nRecommendations:");
    for rec in &analysis.insights.recommendations {
        println!("  - {}", rec);
    }
    
    Ok(())
}

#[tokio::test]
async fn test_cross_file_similarity() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    
    // Create files with similar functions across different modules
    fs::create_dir_all(temp_dir.path().join("src/module1"))?;
    fs::create_dir_all(temp_dir.path().join("src/module2"))?;
    
    fs::write(temp_dir.path().join("src/module1/data.rs"), r#"
pub fn process_user_data(user: &User) -> Result<ProcessedData, Error> {
    validate_user(user)?;
    let normalized = normalize_user_data(user);
    let result = transform_to_output(normalized);
    Ok(result)
}

fn validate_user(user: &User) -> Result<(), Error> {
    if user.name.is_empty() {
        return Err(Error::InvalidName);
    }
    if user.email.is_empty() {
        return Err(Error::InvalidEmail);
    }
    Ok(())
}
"#)?;
    
    fs::write(temp_dir.path().join("src/module2/processor.rs"), r#"
pub fn handle_user_info(user_info: &UserInfo) -> Result<ProcessedInfo, Error> {
    check_user_info(user_info)?;
    let cleaned = clean_user_info(user_info);
    let output = convert_to_result(cleaned);
    Ok(output)
}

fn check_user_info(info: &UserInfo) -> Result<(), Error> {
    if info.full_name.is_empty() {
        return Err(Error::MissingName);
    }
    if info.email_address.is_empty() {
        return Err(Error::MissingEmail);
    }
    Ok(())
}
"#)?;
    
    // Analyze
    let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await?);
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let analyzer = SemanticAnalyzer::new(embedder, Arc::clone(&project_db)).await?;
    
    let parsing_db = ProjectDatabase::new(temp_dir.path()).await?;
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await?);
    let project = project_db.get_or_create_project("test_project", temp_dir.path().to_str().unwrap()).await?;
    parsing_service.parse_project(temp_dir.path(), "test_project").await?;
    
    let analysis = analyzer.analyze_project(project.id.unwrap()).await?;
    
    // These functions should be detected as similar despite being in different files
    assert!(!analysis.similarity_matrix.is_empty(), "Should find similar functions across files");
    
    Ok(())
}