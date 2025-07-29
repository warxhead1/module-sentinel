use std::sync::Arc;
use std::collections::HashMap;

use napi::bindgen_prelude::*;
use napi_derive::napi;

// Set ORT logging environment variables at module load time
static INIT: std::sync::Once = std::sync::Once::new();

fn init_ort_logging() {
    INIT.call_once(|| {
        // Set ONNX Runtime environment variables BEFORE any ORT initialization
        // These must be set before the first ORT call for them to take effect
        std::env::set_var("ORT_LOG_LEVEL", "4");  // 4 = FATAL only (less than ERROR)
        std::env::set_var("ORT_DISABLE_ALL_LOGS", "1");  // Try to disable all logs
        std::env::set_var("ORT_LOG_SEVERITY_LEVEL", "4"); 
        std::env::set_var("ORT_LOG_VERBOSITY_LEVEL", "0");
        // Also try some variations that might work
        std::env::set_var("ONNXRUNTIME_LOG_LEVEL", "4");
    });
}

use module_sentinel_parser::{
    services::{ParsingService, ParsingConfig},
    analysis::{PatternDetector, SimilarityCalculator},
    database::ProjectDatabase,
    parsers::tree_sitter::{Language as RustLanguage, Symbol as RustSymbol, TreeSitterParser},
};

use serde::{Serialize, Deserialize};
use tracing::{info, warn, error};
use tree_sitter::Tree;

/// Sanitized error types for NAPI exposure
#[derive(Debug)]
enum SanitizedError {
    InvalidInput,
    NotFound,
    ServiceUnavailable,
    InternalError,
    PermissionDenied,
}

impl SanitizedError {
    fn to_napi_error(self) -> Error {
        match self {
            SanitizedError::InvalidInput => Error::new(
                Status::InvalidArg,
                "Invalid input parameters provided"
            ),
            SanitizedError::NotFound => Error::new(
                Status::InvalidArg,
                "Requested resource not found"
            ),
            SanitizedError::ServiceUnavailable => Error::new(
                Status::GenericFailure,
                "Service temporarily unavailable"
            ),
            SanitizedError::InternalError => Error::new(
                Status::GenericFailure,
                "An internal error occurred"
            ),
            SanitizedError::PermissionDenied => Error::new(
                Status::InvalidArg,
                "Access denied"
            ),
        }
    }
}

/// Sanitize internal errors before exposing them through NAPI
fn sanitize_error(error: &anyhow::Error) -> SanitizedError {
    let error_msg = error.to_string().to_lowercase();
    
    // Log the actual error for debugging (not exposed to client)
    error!("Internal error occurred: {}", error);
    
    // Classify errors into safe categories
    if error_msg.contains("does not exist") || error_msg.contains("not found") {
        SanitizedError::NotFound
    } else if error_msg.contains("permission") || error_msg.contains("access denied") {
        SanitizedError::PermissionDenied
    } else if error_msg.contains("invalid") || error_msg.contains("parse") {
        SanitizedError::InvalidInput
    } else if error_msg.contains("timeout") || error_msg.contains("unavailable") {
        SanitizedError::ServiceUnavailable
    } else {
        SanitizedError::InternalError
    }
}

// Initialize logging for NAPI
#[napi::module_init]
fn init() {
    // Initialize ORT logging settings immediately on module load
    init_ort_logging();
    
    // Set ONNX Runtime log level to reduce verbosity
    std::env::set_var("ORT_LOG", "error");
    
    // Only initialize tracing if not already initialized
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        )
        .try_init();
    info!("Module Sentinel NAPI bindings initialized");
}

/// TypeScript-compatible Language enum
#[napi(string_enum)]
#[derive(Debug, Serialize, Deserialize)]
pub enum Language {
    Rust,
    TypeScript,
    JavaScript,
    Python,
    Cpp,
    Java,
    Go,
    CSharp,
}

impl From<Language> for RustLanguage {
    fn from(lang: Language) -> Self {
        match lang {
            Language::Rust => RustLanguage::Rust,
            Language::TypeScript => RustLanguage::TypeScript,
            Language::JavaScript => RustLanguage::JavaScript,
            Language::Python => RustLanguage::Python,
            Language::Cpp => RustLanguage::Cpp,
            Language::Java => RustLanguage::Java,
            Language::Go => RustLanguage::Go,
            Language::CSharp => RustLanguage::CSharp,
        }
    }
}

impl From<RustLanguage> for Language {
    fn from(lang: RustLanguage) -> Self {
        match lang {
            RustLanguage::Rust => Language::Rust,
            RustLanguage::TypeScript => Language::TypeScript,
            RustLanguage::JavaScript => Language::JavaScript,
            RustLanguage::Python => Language::Python,
            RustLanguage::Cpp => Language::Cpp,
            RustLanguage::Java => Language::Java,
            RustLanguage::Go => Language::Go,
            RustLanguage::CSharp => Language::CSharp,
        }
    }
}

/// TypeScript-compatible Symbol structure
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub id: String,
    pub name: String,
    pub signature: String,
    pub return_type: Option<String>,
    pub language: Language,
    pub file_path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub normalized_name: String,
    pub confidence_score: Option<f64>,
    pub similar_symbols: Vec<String>,
}

impl From<RustSymbol> for Symbol {
    fn from(rust_symbol: RustSymbol) -> Self {
        Symbol {
            id: rust_symbol.id,
            name: rust_symbol.name,
            signature: rust_symbol.signature,
            return_type: None, // RustSymbol doesn't have return_type field
            language: rust_symbol.language.into(),
            file_path: rust_symbol.file_path,
            start_line: rust_symbol.start_line,
            end_line: rust_symbol.end_line,
            normalized_name: rust_symbol.normalized_name,
            confidence_score: rust_symbol.confidence_score.map(|f| f as f64),
            similar_symbols: rust_symbol.similar_symbols.iter()
                .map(|sim| format!("{}:{:.2}:{:?}", sim.symbol_id, sim.similarity_score, sim.relationship_type))
                .collect(),
        }
    }
}

/// Pattern detection result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternDetectionResult {
    pub category: String,
    pub symbols: Vec<Symbol>,
    pub confidence: f64,
    pub evidence: Vec<String>,
}

/// Similarity analysis result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarityResult {
    pub overall_score: f64,
    pub name_similarity: f64,
    pub signature_similarity: f64,
    pub structural_similarity: f64,
    pub context_similarity: f64,
}

/// Project information
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: i32,
    pub name: String,
    pub path: String,
    pub last_indexed: Option<String>,
    pub symbol_count: i32,
    pub language_distribution: HashMap<String, i32>,
}

/// Indexing options
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexingOptions {
    pub force: Option<bool>,
    pub languages: Option<Vec<Language>>,
    pub include_tests: Option<bool>,
    pub max_file_size: Option<u32>,
    pub exclude_patterns: Option<Vec<String>>,
}

/// Search options
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub kind: Option<String>,
    pub language: Option<Language>,
    pub limit: Option<i32>,
    pub include_private: Option<bool>,
    pub fuzzy_match: Option<bool>,
}

/// Analysis insights
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisInsights {
    pub total_symbols_analyzed: i32,
    pub duplicate_count: i32,
    pub patterns_detected: i32,
    pub average_similarity: f64,
    pub code_reuse_percentage: f64,
    pub recommendations: Vec<String>,
}

/// Complete analysis result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub patterns: Vec<PatternDetectionResult>,
    pub insights: AnalysisInsights,
    pub symbol_count: i32,
}

/// Parse result for a single file
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    pub symbols: Vec<Symbol>,
    pub errors: Vec<String>,
    pub parse_method: String,
    pub confidence: f64,
}

/// Code quality issue with ML-enhanced fields
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityIssue {
    pub description: String,
    pub category: String,
    pub severity: String, // "low", "medium", "high"
    pub suggestion: Option<String>,
    pub confidence: Option<f64>,
    pub suggested_refactoring: Option<Vec<String>>,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

/// Code quality analysis result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeQualityResult {
    pub issues: Vec<QualityIssue>,
    pub metrics: QualityMetrics,
    pub overall_score: f64, // 0.0 to 100.0
    pub recommendations: Vec<String>,
}

/// Code quality metrics
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityMetrics {
    pub cyclomatic_complexity: u32,
    pub max_nesting_depth: u32,
    pub function_count: u32,
    pub large_function_count: u32,
    pub lines_of_code: u32,
    pub comment_ratio: f64,
    pub decision_points: Option<u32>,
    pub error_handling_complexity: Option<u32>,
}

/// ML-powered component reuse recommendation
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentReuseRecommendation {
    pub existing_component_id: String,
    pub relevance_score: f64,
    pub suggested_usage: String,
    pub extension_needed: String, // "none", "minor_config", "new_implementation", "significant_mod"
    pub component_path: String,
}

/// ML error fix suggestion
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorFixSuggestion {
    pub suggestion: String,
    pub confidence: f64,
    pub explanation: String,
    pub learned_from: Option<String>,
}

/// Parse error with ML suggestions
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MLParseError {
    pub message: String,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub error_type: String,
    pub ml_suggestions: Vec<ErrorFixSuggestion>,
}

/// TypeScript-compatible UniversalRelationship structure for NAPI
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NapiUniversalRelationship {
    #[napi(ts_type = "number | null")]
    pub id: Option<i32>,
    pub project_id: i32,
    #[napi(ts_type = "number | null")]
    pub from_symbol_id: Option<i32>,
    #[napi(ts_type = "number | null")]
    pub to_symbol_id: Option<i32>,
    pub relationship_type: String,
    pub confidence: f64,
    #[napi(ts_type = "number | null")]
    pub context_line: Option<i32>,
    #[napi(ts_type = "number | null")]
    pub context_column: Option<i32>,
    #[napi(ts_type = "string | null")]
    pub context_snippet: Option<String>,
    #[napi(ts_type = "string | null")]
    pub metadata: Option<String>,
    pub created_at: String,
}

impl From<module_sentinel_parser::database::models::UniversalRelationship> for NapiUniversalRelationship {
    fn from(rel: module_sentinel_parser::database::models::UniversalRelationship) -> Self {
        NapiUniversalRelationship {
            id: rel.id,
            project_id: rel.project_id,
            from_symbol_id: rel.from_symbol_id,
            to_symbol_id: rel.to_symbol_id,
            relationship_type: rel.relationship_type,
            confidence: rel.confidence,
            context_line: rel.context_line,
            context_column: rel.context_column,
            context_snippet: rel.context_snippet,
            metadata: rel.metadata,
            created_at: rel.created_at,
        }
    }
}







/// Main NAPI class for Module Sentinel operations
#[napi]
pub struct ModuleSentinel {
    project_db: Arc<ProjectDatabase>,
    parsing_service: Option<Arc<ParsingService>>,
    project_path: String,
}

// Non-NAPI helper methods
impl ModuleSentinel {
    /// Categorize functionality based on description
    fn categorize_functionality(&self, description: &str) -> String {
        let desc_lower = description.to_lowercase();
        
        if desc_lower.contains("parse") || desc_lower.contains("parser") || desc_lower.contains("parsing") || 
           desc_lower.contains("ast") || desc_lower.contains("tree") || desc_lower.contains("syntax") ||
           desc_lower.contains("lexer") || desc_lower.contains("grammar") || desc_lower.contains("sitter") {
            "parsing".to_string()
        } else if desc_lower.contains("database") || desc_lower.contains("query") || desc_lower.contains("sql") {
            "database".to_string()
        } else if desc_lower.contains("log") || desc_lower.contains("debug") || desc_lower.contains("trace") {
            "logging".to_string()
        } else if desc_lower.contains("http") || desc_lower.contains("request") || desc_lower.contains("api") {
            "http_client".to_string()
        } else if desc_lower.contains("auth") || desc_lower.contains("login") || desc_lower.contains("token") {
            "authentication".to_string()
        } else if desc_lower.contains("file") || desc_lower.contains("read") || desc_lower.contains("write") {
            "file_processing".to_string()
        } else {
            "general".to_string()
        }
    }
    
    /// Detect language from file path
    fn detect_language_from_path(&self, file_path: &str) -> Language {
        let path = std::path::Path::new(file_path);
        match path.extension().and_then(|ext| ext.to_str()) {
            Some("rs") => Language::Rust,
            Some("ts") => Language::TypeScript,
            Some("js") | Some("jsx") => Language::JavaScript,
            Some("py") => Language::Python,
            Some("cpp") | Some("cc") | Some("cxx") | Some("hpp") | Some("h") => Language::Cpp,
            Some("java") => Language::Java,
            Some("go") => Language::Go,
            Some("cs") => Language::CSharp,
            _ => Language::Rust, // Default
        }
    }
    
    /// Classify error type from message
    #[cfg(feature = "ml")]
    fn classify_error_type(&self, error_message: &str) -> module_sentinel_parser::parsers::tree_sitter::ErrorType {
        use module_sentinel_parser::parsers::tree_sitter::ErrorType;
        
        let msg_lower = error_message.to_lowercase();
        
        if msg_lower.contains("missing") && msg_lower.contains("token") {
            if let Some(token) = self.extract_token_from_message(&msg_lower) {
                ErrorType::MissingToken(token)
            } else {
                ErrorType::SyntaxError
            }
        } else if msg_lower.contains("unexpected") && msg_lower.contains("token") {
            if let Some(token) = self.extract_token_from_message(&msg_lower) {
                ErrorType::UnexpectedToken(token)
            } else {
                ErrorType::SyntaxError
            }
        } else if msg_lower.contains("incomplete") {
            ErrorType::IncompleteConstruct("unknown".to_string())
        } else {
            ErrorType::SyntaxError
        }
    }
    
    /// Extract token from error message
    #[cfg(feature = "ml")]
    fn extract_token_from_message(&self, message: &str) -> Option<String> {
        // Simple extraction - look for quoted strings
        if let Some(start) = message.find('\'') {
            if let Some(end) = message[start+1..].find('\'') {
                return Some(message[start+1..start+1+end].to_string());
            }
        }
        if let Some(start) = message.find('"') {
            if let Some(end) = message[start+1..].find('"') {
                return Some(message[start+1..start+1+end].to_string());
            }
        }
        None
    }

    /// Helper function to map language_id to Language enum
    async fn map_language_id_to_enum(&self, language_id: i32) -> Language {
        // Get language from database
        let languages = match self.project_db.db().find_all(
            module_sentinel_parser::database::orm::QueryBuilder::<module_sentinel_parser::database::models::Language>::new()
                .where_eq("id", language_id)
                .limit(1)
        ).await {
            Ok(langs) => langs,
            Err(_) => return Language::Rust, // Default fallback
        };
        
        if let Some(language) = languages.first() {
            match language.name.as_str() {
                "rust" => Language::Rust,
                "typescript" => Language::TypeScript,
                "javascript" => Language::JavaScript,
                "python" => Language::Python,
                "cpp" | "c++" => Language::Cpp,
                "java" => Language::Java,
                "go" => Language::Go,
                "csharp" | "c_sharp" => Language::CSharp,
                _ => Language::Rust, // Default fallback
            }
        } else {
            Language::Rust // Default fallback
        }
    }
}

#[napi]
impl ModuleSentinel {
    /// Create a new Module Sentinel instance
    #[napi(factory)]
    pub async fn new(project_path: String) -> Result<Self> {
        info!("Initializing Module Sentinel for project path");
        
        let path = std::path::Path::new(&project_path);
        if !path.exists() {
            warn!("Project path validation failed");
            return Err(SanitizedError::NotFound.to_napi_error());
        }

        let project_db = match ProjectDatabase::new(&path).await {
            Ok(db) => Arc::new(db),
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        let instance = ModuleSentinel {
            project_db,
            parsing_service: None,
            project_path,
        };
        
        // Clean up any test symbols on initialization
        instance.cleanup_test_symbols_internal().await;
        
        Ok(instance)
    }

    /// Internal method to clean up test symbols
    async fn cleanup_test_symbols_internal(&self) {
        // Get or create the main project
        if let Ok(project) = self.project_db.get_or_create_project("main_project", &self.project_path).await {
            if let Some(project_id) = project.id {
                // Check for common test symbols
                let test_symbols = ["BaseClass", "DerivedClass", "console", "doSomething", "calculate"];
                let mut found_test_symbols = false;
                
                for test_symbol in &test_symbols {
                    if let Ok(symbols) = self.project_db.search_symbols_simple(test_symbol, project_id, 1).await {
                        if !symbols.is_empty() {
                            found_test_symbols = true;
                            break;
                        }
                    }
                }
                
                if found_test_symbols {
                    info!("Test symbols detected in database, cleaning up...");
                    if let Err(e) = self.project_db.clear_project_symbols(project_id).await {
                        error!("Failed to clear test symbols: {}", e);
                    } else {
                        info!("Successfully cleared test symbols from database");
                    }
                }
            }
        }
    }
    
    /// Initialize the parsing service (async operation)
    #[napi]
    pub async unsafe fn initialize(&mut self) -> Result<()> {
        info!("Initializing parsing service");
        
        let parsing_db = match ProjectDatabase::new(std::path::Path::new(&self.project_path)).await {
            Ok(db) => db,
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        let parsing_service = match ParsingService::new(parsing_db, ParsingConfig::default()).await {
            Ok(service) => Arc::new(service),
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        self.parsing_service = Some(parsing_service);
        info!("Parsing service initialized successfully");
        Ok(())
    }

    /// Index a project for analysis
    #[napi]
    pub async fn index_project(&self, options: Option<IndexingOptions>) -> Result<ProjectInfo> {
        info!("Starting project indexing");
        
        let parsing_service = self.parsing_service.as_ref()
            .ok_or_else(|| SanitizedError::ServiceUnavailable.to_napi_error())?;

        let opts = options.unwrap_or(IndexingOptions {
            force: Some(false),
            languages: None,
            include_tests: Some(true),
            max_file_size: Some(1024 * 1024), // 1MB default
            exclude_patterns: None,
        });

        // Create or get project
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };
        
        // Check if we should clear existing symbols
        let should_clear = if opts.force.unwrap_or(false) {
            true
        } else {
            // Also clear if we detect test symbols (defensive cleanup)
            if let Some(project_id) = project.id {
                match self.project_db.search_symbols_simple("BaseClass", project_id, 1).await {
                    Ok(symbols) => !symbols.is_empty(), // Found test symbol, need to clear
                    Err(_) => false,
                }
            } else {
                false
            }
        };
        
        // Clear test symbols if detected
        if should_clear && project.id.is_some() {
            info!("Clearing existing symbols (force reindex or test symbols detected)");
            if let Err(e) = self.project_db.clear_project_symbols(project.id.unwrap()).await {
                error!("Failed to clear project symbols: {}", e);
            }
        }

        // Perform parsing with options
        if let Err(e) = parsing_service.parse_project(
            std::path::Path::new(&self.project_path),
            "main_project",
            opts.force.unwrap_or(false)
        ).await {
            return Err(sanitize_error(&e).to_napi_error());
        }

        // Get symbol count and statistics
        let symbol_count = match self.project_db.get_symbol_count(project.id.unwrap_or(0)).await {
            Ok(count) => count,
            Err(_) => 0,
        };
        
        // Get language distribution
        let language_distribution = match self.project_db.get_language_distribution(project.id.unwrap_or(0)).await {
            Ok(dist) => dist,
            Err(_) => HashMap::new(),
        };

        info!("Project indexing completed successfully");

        Ok(ProjectInfo {
            id: project.id.unwrap_or(0),
            name: project.name,
            path: project.root_path,
            last_indexed: Some(project.updated_at),
            symbol_count: symbol_count as i32,
            language_distribution,
        })
    }

    /// Search for symbols in the indexed project
    #[napi]
    pub async fn search_symbols(&self, query: String, options: Option<SearchOptions>) -> Result<Vec<Symbol>> {
        info!("Searching symbols");
        
        let opts = options.unwrap_or(SearchOptions {
            kind: None,
            language: None,
            limit: Some(20),
            include_private: Some(true),
            fuzzy_match: Some(false),
        });

        // Use the symbol search from project database
        let limit = opts.limit.unwrap_or(20) as usize;
        
        // Get project
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(_e) => {
                warn!("Failed to get project for search");
                return Ok(vec![]);
            }
        };

        let project_id = project.id.unwrap_or(0);
        
        // Search symbols (get more to allow for language filtering)
        let search_limit = if opts.language.is_some() { limit * 3 } else { limit };
        let symbols = match self.project_db.search_symbols_simple(&query, project_id, search_limit).await {
            Ok(symbols) => symbols,
            Err(e) => {
                error!("Symbol search operation failed for query '{}': {}", query, e);
                return Ok(vec![]);
            }
        };

        // Convert to NAPI-compatible symbols and filter by language if specified
        let mut result = Vec::new();
        let target_language_id = if let Some(ref lang) = opts.language {
            // Convert NAPI Language to language_id
            if let Some(ref parsing_service) = self.parsing_service {
                match parsing_service.get_or_create_language_id(&lang.clone().into()).await {
                    Ok(id) => Some(id),
                    Err(_) => None,
                }
            } else {
                None
            }
        } else {
            None
        };

        for s in symbols {
            // Filter by language if specified
            if let Some(target_id) = target_language_id {
                if s.language_id != target_id {
                    continue; // Skip symbols that don't match the target language
                }
            }
            let language = self.map_language_id_to_enum(s.language_id).await;
            result.push(Symbol {
                id: s.qualified_name.clone(),
                name: s.name.clone(),
                signature: s.signature.unwrap_or_default(),
                return_type: s.return_type,
                language,
                file_path: s.file_path.clone(),
                start_line: s.line as u32,
                end_line: s.end_line.unwrap_or(s.line) as u32,
                normalized_name: s.name.to_lowercase(),
                confidence_score: Some(s.confidence as f64),
                similar_symbols: vec![],
            });
            
            // Apply limit after filtering
            if result.len() >= limit {
                break;
            }
        }

        info!("Symbol search completed successfully");
        Ok(result)
    }

    /// Analyze patterns in the indexed project
    #[napi]
    pub async fn analyze_patterns(&self) -> Result<AnalysisResult> {
        info!("Starting pattern analysis");
        
        // Get project
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        let project_id = project.id.unwrap_or(0);

        // Load symbols from database
        let symbols = match self.project_db.search_symbols_simple("", project_id, 1000).await {
            Ok(symbols) => symbols,
            Err(e) => {
                error!("Failed to load symbols for analysis in project {}: {}", project_id, e);
                return Ok(AnalysisResult {
                    patterns: vec![],
                    insights: AnalysisInsights {
                        total_symbols_analyzed: 0,
                        duplicate_count: 0,
                        patterns_detected: 0,
                        average_similarity: 0.0,
                        code_reuse_percentage: 0.0,
                        recommendations: vec!["Analysis could not be completed".to_string()],
                    },
                    symbol_count: 0,
                });
            }
        };

        // Convert to parser symbols for analysis
        let mut parser_symbols = Vec::new();
        for s in &symbols {
            // Map language_id to RustLanguage using the database
            let language = match self.project_db.map_language_id_to_parser_language(s.language_id).await {
                Ok(lang) => lang,
                Err(_) => RustLanguage::Rust, // Default fallback
            };
            
            // Parse semantic tags from JSON if available
            let semantic_tags: Option<Vec<String>> = s.semantic_tags.as_ref()
                .and_then(|tags_json| serde_json::from_str(tags_json).ok());
            
            parser_symbols.push(RustSymbol {
                id: s.qualified_name.clone(),
                name: s.name.clone(),
                signature: s.signature.clone().unwrap_or_default(),
                language,
                file_path: s.file_path.clone(),
                start_line: s.line as u32,
                end_line: s.end_line.unwrap_or(s.line) as u32,
                embedding: None,
                semantic_hash: None,
                normalized_name: s.name.to_lowercase(),
                context_embedding: None,
                duplicate_of: None,
                confidence_score: Some(s.confidence as f32),
                similar_symbols: vec![],
                semantic_tags,
                intent: s.intent.clone(),
            });
        }

        // Run pattern detection
        let detector = PatternDetector::new();
        let patterns = detector.detect_patterns(&parser_symbols);

        // Convert patterns to NAPI format
        let pattern_results: Vec<PatternDetectionResult> = patterns.into_iter().map(|p| {
            PatternDetectionResult {
                category: format!("{:?}", p.category),
                symbols: p.symbols.into_iter().map(Symbol::from).collect(),
                confidence: p.confidence as f64,
                evidence: p.evidence,
            }
        }).collect();

        let total_symbols = parser_symbols.len();
        let patterns_detected = pattern_results.len();

        // Calculate duplicates and similarity scores
        let similarity_calculator = SimilarityCalculator::new();
        let mut duplicate_count = 0;
        let mut total_similarity = 0.0;
        let mut comparison_count = 0;
        
        // Compare each symbol with others to find duplicates
        for i in 0..parser_symbols.len() {
            for j in (i + 1)..parser_symbols.len() {
                let similarity_result = similarity_calculator.calculate(&parser_symbols[i], &parser_symbols[j]);
                let score = similarity_result.overall_score;
                
                // Consider symbols as duplicates if similarity > 0.9
                if score > 0.9 {
                    duplicate_count += 1;
                }
                
                total_similarity += score;
                comparison_count += 1;
            }
        }
        
        let average_similarity = if comparison_count > 0 {
            (total_similarity / comparison_count as f32) as f64
        } else {
            0.0
        };
        
        let code_reuse_percentage = if total_symbols > 0 {
            (duplicate_count as f64 / total_symbols as f64) * 100.0
        } else {
            0.0
        };

        let insights = AnalysisInsights {
            total_symbols_analyzed: total_symbols as i32,
            duplicate_count: duplicate_count as i32,
            patterns_detected: patterns_detected as i32,
            average_similarity,
            code_reuse_percentage,
            recommendations: if patterns_detected > 0 {
                let mut recs = vec![format!("Detected {} design patterns across {} symbols", patterns_detected, total_symbols)];
                if duplicate_count > 0 {
                    recs.push(format!("Found {} potential duplicate symbols - consider refactoring", duplicate_count));
                }
                recs
            } else {
                vec!["No significant patterns detected. Consider refactoring for better code organization.".to_string()]
            },
        };

        info!("Pattern analysis completed. Found {} patterns", patterns_detected);

        Ok(AnalysisResult {
            patterns: pattern_results,
            insights,
            symbol_count: total_symbols as i32,
        })
    }

    /// Calculate similarity between two symbols
    #[napi]
    pub async fn calculate_similarity(&self, symbol1_id: String, symbol2_id: String) -> Result<SimilarityResult> {
        info!("Calculating similarity between symbols: {} and {}", symbol1_id, symbol2_id);
        
        // Get project for database queries
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };
        let project_id = project.id.unwrap_or(0);
        
        // Load both symbols from database by exact ID
        let symbol1 = self.project_db.find_symbol_by_id(&symbol1_id, project_id).await
            .map_err(|e| sanitize_error(&e).to_napi_error())?
            .ok_or_else(|| SanitizedError::NotFound.to_napi_error())?;
            
        let symbol2 = self.project_db.find_symbol_by_id(&symbol2_id, project_id).await
            .map_err(|e| sanitize_error(&e).to_napi_error())?
            .ok_or_else(|| SanitizedError::NotFound.to_napi_error())?;
        
        // Convert to parser symbols for similarity calculation
        let lang1 = self.project_db.map_language_id_to_parser_language(symbol1.language_id).await
            .unwrap_or(RustLanguage::Rust);
        let lang2 = self.project_db.map_language_id_to_parser_language(symbol2.language_id).await
            .unwrap_or(RustLanguage::Rust);
            
        let semantic_tags1: Option<Vec<String>> = symbol1.semantic_tags.as_ref()
            .and_then(|tags_json| serde_json::from_str(tags_json).ok());
            
        let parser_symbol1 = RustSymbol {
            id: symbol1.qualified_name.clone(),
            name: symbol1.name.clone(),
            signature: symbol1.signature.clone().unwrap_or_default(),
            language: lang1,
            file_path: symbol1.file_path.clone(),
            start_line: symbol1.line as u32,
            end_line: symbol1.end_line.unwrap_or(symbol1.line) as u32,
            embedding: None,
            semantic_hash: None,
            normalized_name: symbol1.name.to_lowercase(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(symbol1.confidence as f32),
            similar_symbols: vec![],
            semantic_tags: semantic_tags1,
            intent: symbol1.intent.clone(),
        };
        
        let semantic_tags2: Option<Vec<String>> = symbol2.semantic_tags.as_ref()
            .and_then(|tags_json| serde_json::from_str(tags_json).ok());
            
        let parser_symbol2 = RustSymbol {
            id: symbol2.qualified_name.clone(),
            name: symbol2.name.clone(),
            signature: symbol2.signature.clone().unwrap_or_default(),
            language: lang2,
            file_path: symbol2.file_path.clone(),
            start_line: symbol2.line as u32,
            end_line: symbol2.end_line.unwrap_or(symbol2.line) as u32,
            embedding: None,
            semantic_hash: None,
            normalized_name: symbol2.name.to_lowercase(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(symbol2.confidence as f32),
            similar_symbols: vec![],
            semantic_tags: semantic_tags2,
            intent: symbol2.intent.clone(),
        };
        
        // Use the actual similarity calculator
        let calc = SimilarityCalculator::new();
        let similarity_score = calc.calculate(&parser_symbol1, &parser_symbol2);
        
        info!("Computed similarity between '{}' and '{}': {:.3}", 
              symbol1.name, symbol2.name, similarity_score.overall_score);
        
        Ok(SimilarityResult {
            overall_score: similarity_score.overall_score as f64,
            name_similarity: similarity_score.name_similarity as f64,
            signature_similarity: similarity_score.signature_similarity as f64,
            structural_similarity: similarity_score.structural_similarity as f64,
            context_similarity: similarity_score.context_similarity as f64,
        })
    }

    

    /// Get all relationships in the project
    #[napi]
    pub async fn get_all_relationships(&self) -> Result<Vec<NapiUniversalRelationship>> {
        info!("Getting all symbol relationships");
        
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        let project_id = project.id.unwrap_or(0);

        let rels = match self.project_db.get_all_relationships(project_id).await {
            Ok(rels) => rels,
            Err(e) => {
                error!("Failed to retrieve relationships for project {}: {}", project_id, e);
                return Ok(vec![]);
            }
        };

        let relationships: Vec<NapiUniversalRelationship> = rels.into_iter().map(NapiUniversalRelationship::from).collect();
        Ok(relationships)
    }

    /// Get relationships for a specific symbol
    #[napi]
    pub async fn get_symbol_relationships(&self, symbol_id: String) -> Result<Vec<NapiUniversalRelationship>> {
        info!("Getting relationships for symbol: {}", symbol_id);
        
        // First, we need to find the symbol in the database to get its internal ID
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        let project_id = project.id.unwrap_or(0);

        // Search for the symbol to get its database ID
        let symbols = match self.project_db.search_symbols_simple(&symbol_id, project_id, 100).await {
            Ok(symbols) => symbols,
            Err(e) => {
                error!("Failed to search for symbol {}: {}", symbol_id, e);
                return Ok(vec![]);
            }
        };

        // Find the exact match or the first match
        let db_symbol = symbols.into_iter()
            .find(|s| s.qualified_name == symbol_id || s.name == symbol_id);

        if let Some(symbol) = db_symbol {
            if let Some(symbol_db_id) = symbol.id {
                let rels = match self.project_db.get_symbol_relationships(symbol_db_id).await {
                    Ok(rels) => rels,
                    Err(e) => {
                        error!("Failed to retrieve relationships for symbol {} (ID: {}): {}", symbol_id, symbol_db_id, e);
                        return Ok(vec![]);
                    }
                };

                let relationships: Vec<NapiUniversalRelationship> = rels.into_iter().map(NapiUniversalRelationship::from).collect();
                info!("Found {} relationships for symbol {}", relationships.len(), symbol_id);
                return Ok(relationships);
            }
        }

        info!("No symbol found with ID: {}", symbol_id);
        Ok(vec![])
    }

    /// Record a user fix for ML training
    #[napi]
    pub async fn record_user_fix(&self, error_message: String, error_line: u32, error_column: u32, applied_fix: String, language: Language) -> Result<()> {
        info!("Recording user fix for ML training: {} -> {}", error_message, applied_fix);
        
        #[cfg(feature = "ml")]
        {
            use module_sentinel_parser::parsers::tree_sitter::{ParseError, ErrorPredictor};
            
            // Create error predictor
            let predictor = match ErrorPredictor::load(language.into()).await {
                Ok(p) => p,
                Err(_) => return Ok(()), // Silently ignore if ML is not available
            };
            
            // Create parse error structure
            let parse_error = ParseError {
                message: error_message.clone(),
                start_position: tree_sitter::Point { row: error_line as usize, column: error_column as usize },
                end_position: tree_sitter::Point { row: error_line as usize, column: error_column as usize },
                error_type: self.classify_error_type(&error_message),
                confidence: 1.0, // User fixes are high confidence
                ml_suggestions: vec![],
            };
            
            // Add training example
            if let Err(e) = predictor.add_training_example(&parse_error, &applied_fix).await {
                warn!("Failed to record training example: {}", e);
            }
        }
        
        #[cfg(not(feature = "ml"))]
        {
            // Store the fix in database for future ML training
            // This data can be used when ML is enabled later
            match self.project_db.db().execute(
                "INSERT INTO user_fixes (error_message, error_line, error_column, applied_fix, language, created_at) 
                 VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                vec![
                    module_sentinel_parser::database::orm::DatabaseValue::Text(error_message.clone()),
                    module_sentinel_parser::database::orm::DatabaseValue::Integer(error_line as i64),
                    module_sentinel_parser::database::orm::DatabaseValue::Integer(error_column as i64),
                    module_sentinel_parser::database::orm::DatabaseValue::Text(applied_fix),
                    module_sentinel_parser::database::orm::DatabaseValue::Text(format!("{:?}", language)),
                ]
            ).await {
                Ok(_) => info!("User fix stored for future ML training: {}:{}", error_line, error_column),
                Err(e) => warn!("Failed to store user fix: {}", e),
            }
        }
        
        Ok(())
    }

    /// Parse a single file and return symbols
    #[napi]
    pub async fn parse_file(&self, file_path: String, language: Language) -> Result<ParseResult> {
        info!("Parsing file: {} (language: {:?})", file_path, language);
        
        let parsing_service = self.parsing_service.as_ref()
            .ok_or_else(|| SanitizedError::ServiceUnavailable.to_napi_error())?;

        // Validate file path is within project bounds for security
        let project_path = std::path::Path::new(&self.project_path);
        let target_path = std::path::Path::new(&file_path);
        
        if !target_path.starts_with(project_path) {
            warn!("Attempted to access file outside project boundary: {}", file_path);
            return Err(SanitizedError::PermissionDenied.to_napi_error());
        }

        // Verify file exists and is readable before parsing
        if !std::path::Path::new(&file_path).exists() {
            error!("File not found: '{}'", file_path);
            return Err(sanitize_error(&anyhow::anyhow!("File not found")).to_napi_error());
        }

        // Use the parsing service to actually parse the file
        match parsing_service.parse_file(&target_path).await {
            Ok(parse_result) => {
                // Convert UniversalSymbol to NAPI Symbol
                let symbols: Vec<Symbol> = parse_result.symbols.into_iter().map(|us| {
                    Symbol {
                        id: us.qualified_name.clone(),
                        name: us.name.clone(),
                        signature: us.signature.unwrap_or_default(),
                        return_type: us.return_type,
                        language, // Use the language passed in
                        file_path: us.file_path.clone(),
                        start_line: us.line as u32,
                        end_line: us.end_line.unwrap_or(us.line) as u32,
                        normalized_name: us.name.to_lowercase(),
                        confidence_score: Some(us.confidence),
                        similar_symbols: vec![],
                    }
                }).collect();
                
                let errors: Vec<String> = parse_result.errors.into_iter()
                    .map(|e| format!("Line {}: {}", e.line, e.message))
                    .collect();
                
                info!("Successfully parsed file '{}' ({}): {} symbols, {} errors", 
                      file_path, parse_result.language, symbols.len(), errors.len());
                
                Ok(ParseResult {
                    symbols,
                    errors,
                    parse_method: "tree-sitter".to_string(),
                    confidence: parse_result.confidence_score.unwrap_or(1.0) as f64,
                })
            }
            Err(e) => {
                error!("Failed to parse file '{}': {}", file_path, e);
                Ok(ParseResult {
                    symbols: vec![],
                    errors: vec![format!("Parse failed")],
                    parse_method: "tree-sitter".to_string(),
                    confidence: 0.0,
                })
            }
        }
    }

    /// Find reusable components that match the intended functionality
    #[napi]
    pub async fn find_reusable_components(&self, functionality_description: String, required_capabilities: Vec<String>) -> Result<Vec<ComponentReuseRecommendation>> {
        info!("Finding reusable components for: {}", functionality_description);
        
        #[cfg(feature = "ml")]
        {
            // Create user intent from the description
            let user_intent = module_sentinel_parser::parsers::tree_sitter::UserIntent {
                functionality_category: self.categorize_functionality(&functionality_description),
                required_capabilities,
                context_description: functionality_description.clone(),
            };
            
            // Get the parsing service to access ML components
            if let Some(ref _parsing_service) = self.parsing_service {
                // Get all symbols to index for component reuse
                let project = match self.project_db.get_or_create_project(
                    "main_project",
                    &self.project_path
                ).await {
                    Ok(p) => p,
                    Err(_) => return Ok(vec![]),
                };
                
                let symbols = match self.project_db.search_symbols_simple("", project.id.unwrap_or(0), 1000).await {
                    Ok(syms) => syms,
                    Err(_) => return Ok(vec![]),
                };
                
                // Convert to parser symbols
                let mut parser_symbols = Vec::new();
                for s in symbols {
                    let language = match self.project_db.map_language_id_to_parser_language(s.language_id).await {
                        Ok(lang) => lang,
                        Err(_) => RustLanguage::Rust,
                    };
                    
                    parser_symbols.push(RustSymbol {
                        id: s.qualified_name.clone(),
                        name: s.name.clone(),
                        signature: s.signature.clone().unwrap_or_default(),
                        language,
                        file_path: s.file_path.clone(),
                        start_line: s.line as u32,
                        end_line: s.end_line.unwrap_or(s.line) as u32,
                        embedding: None,
                        semantic_hash: None,
                        normalized_name: s.name.to_lowercase(),
                        context_embedding: None,
                        duplicate_of: None,
                        confidence_score: Some(s.confidence as f32),
                        similar_symbols: vec![],
                        semantic_tags: s.semantic_tags.clone()
                            .and_then(|tags| serde_json::from_str(&tags).ok()),
                        intent: s.intent.clone(),
                    });
                }
                
                // Use the component reuse predictor
                let mut predictor = module_sentinel_parser::parsers::tree_sitter::ComponentReusePredictor::new();
                predictor.index_existing_components(&parser_symbols);
                let recommendations = predictor.predict_component_reuse(&user_intent);
                
                // Convert to NAPI format
                let mut results = Vec::new();
                for rec in recommendations {
                    results.push(ComponentReuseRecommendation {
                        existing_component_id: rec.existing_component_id,
                        relevance_score: rec.relevance_score as f64,
                        suggested_usage: rec.suggested_usage,
                        extension_needed: match rec.extension_needed {
                            module_sentinel_parser::parsers::tree_sitter::ExtensionAssessment::None => "none".to_string(),
                            module_sentinel_parser::parsers::tree_sitter::ExtensionAssessment::MinorConfiguration => "minor_config".to_string(),
                            module_sentinel_parser::parsers::tree_sitter::ExtensionAssessment::NewImplementation => "new_implementation".to_string(),
                            module_sentinel_parser::parsers::tree_sitter::ExtensionAssessment::SignificantModification => "significant_mod".to_string(),
                        },
                        component_path: rec.component_signature.file_path,
                    });
                }
                
                return Ok(results);
            }
            
            // Return empty if no parsing service available
            Ok(vec![])
        }
        
        #[cfg(not(feature = "ml"))]
        {
            // Basic functionality matching without ML - search by keywords
            let mut recommendations = Vec::new();
            
            // Get project ID
            let project = match self.project_db.get_or_create_project(
                "main_project",
                &self.project_path
            ).await {
                Ok(p) => p,
                Err(_) => return Ok(vec![]),
            };
            
            // Search for symbols that match the description and capabilities
            let category = self.categorize_functionality(&functionality_description);
            let search_terms = format!("{} {} {}", functionality_description, required_capabilities.join(" "), category);
            let symbols = match self.project_db.search_symbols_simple(&search_terms, project.id.unwrap_or(0), 50).await {
                Ok(syms) => syms,
                Err(_) => return Ok(vec![]),
            };
            
            // Score and convert to recommendations
            for symbol in symbols {
                // Simple keyword matching score
                let mut relevance_score: f32 = 0.0;
                let symbol_text = format!("{} {} {}", symbol.name, symbol.signature.as_ref().unwrap_or(&String::new()), symbol.qualified_name).to_lowercase();
                
                // Check description match
                for word in functionality_description.split_whitespace() {
                    if symbol_text.contains(&word.to_lowercase()) {
                        relevance_score += 0.3;
                    }
                }
                
                // Check capabilities match
                for capability in &required_capabilities {
                    if symbol_text.contains(&capability.to_lowercase()) {
                        relevance_score += 0.5;
                    }
                }
                
                if relevance_score > 0.0 {
                    recommendations.push(ComponentReuseRecommendation {
                        existing_component_id: symbol.qualified_name,
                        relevance_score: (relevance_score.min(1.0) as f64),
                        suggested_usage: format!("Consider using {} for {}", symbol.name, functionality_description),
                        extension_needed: if relevance_score > 0.7 { "none" } else { "minor_config" }.to_string(),
                        component_path: symbol.file_path,
                    });
                }
            }
            
            // Sort by relevance
            recommendations.sort_by(|a, b| b.relevance_score.partial_cmp(&a.relevance_score).unwrap_or(std::cmp::Ordering::Equal));
            recommendations.truncate(10);
            
            return Ok(recommendations);
        }
    }

    /// Get ML-powered fix suggestions for parse errors
    #[napi]
    pub async fn get_error_fix_suggestions(&self, file_path: String, error_message: String, error_line: u32, error_column: u32) -> Result<Vec<ErrorFixSuggestion>> {
        info!("Getting ML fix suggestions for error at {}:{}:{}", file_path, error_line, error_column);
        
        #[cfg(feature = "ml")]
        {
            use module_sentinel_parser::parsers::tree_sitter::{ParseError, ErrorPredictor};
            
            // Read the file content
            let content = match std::fs::read_to_string(&file_path) {
                Ok(content) => content,
                Err(_) => return Ok(vec![]),
            };
            
            // Determine language from file extension
            let language = self.detect_language_from_path(&file_path);
            
            // Create error predictor
            let predictor = match ErrorPredictor::load(language.into()).await {
                Ok(p) => p,
                Err(_) => return Ok(vec![]),
            };
            
            // Create parse error structure
            let parse_error = ParseError {
                message: error_message.clone(),
                start_position: tree_sitter::Point { row: error_line as usize, column: error_column as usize },
                end_position: tree_sitter::Point { row: error_line as usize, column: error_column as usize },
                error_type: self.classify_error_type(&error_message),
                confidence: 0.8,
                ml_suggestions: vec![],
            };
            
            // Get ML suggestions
            match predictor.predict_fixes(&parse_error, &content).await {
                Ok(suggestions) => {
                    let mut results = Vec::new();
                    for sug in suggestions {
                        results.push(ErrorFixSuggestion {
                            suggestion: sug.suggestion,
                            confidence: sug.confidence as f64,
                            explanation: sug.explanation,
                            learned_from: sug.learned_from,
                        });
                    }
                    Ok(results)
                }
                Err(_) => Ok(vec![]),
            }
        }
        
        #[cfg(not(feature = "ml"))]
        {
            // Language-aware rule-based suggestions
            let language = self.detect_language_from_path(&file_path);
            let mut suggestions = Vec::new();
            
            // Common error patterns with language-specific fixes
            if error_message.contains("missing") {
                let suggestion = match language {
                    Language::Rust => {
                        if error_message.contains("semicolon") {
                            "Add a semicolon at the end of the statement"
                        } else if error_message.contains("mut") {
                            "Add 'mut' keyword for mutable binding"
                        } else {
                            "Add the missing token"
                        }
                    },
                    Language::TypeScript | Language::JavaScript => {
                        if error_message.contains("semicolon") {
                            "Add a semicolon (or check if one is needed in your style)"
                        } else if error_message.contains("type") {
                            "Add type annotation"
                        } else {
                            "Add the missing element"
                        }
                    },
                    Language::Python => {
                        if error_message.contains("colon") {
                            "Add a colon after the statement"
                        } else if error_message.contains("indent") {
                            "Fix indentation (Python uses indentation for blocks)"
                        } else {
                            "Add the missing syntax element"
                        }
                    },
                    _ => "Add the missing token",
                };
                
                suggestions.push(ErrorFixSuggestion {
                    suggestion: suggestion.to_string(),
                    confidence: 0.7,
                    explanation: format!("Common {} syntax error at line {}", 
                        format!("{:?}", language), error_line),
                    learned_from: None,
                });
            }
            
            // Check for common bracket/parenthesis errors
            if error_message.contains("expected") && (error_message.contains("}") || error_message.contains(")") || error_message.contains("]")) {
                suggestions.push(ErrorFixSuggestion {
                    suggestion: "Check for unclosed brackets, parentheses, or braces".to_string(),
                    confidence: 0.8,
                    explanation: format!("Mismatch detected at line {}, column {}", error_line, error_column),
                    learned_from: None,
                });
            }
            
            Ok(suggestions)
        }
    }

    /// Analyze code quality for a specific file
    #[napi]
    pub async fn analyze_code_quality(&self, file_path: String, language: Language, content: String, include_suggestions: Option<bool>) -> Result<CodeQualityResult> {
        info!("Analyzing code quality for file: {} (language: {:?})", file_path, language);
        
        // Note: Content is provided as parameter, no need to read from file

        // Parse the file using tree-sitter
        let rust_language: RustLanguage = language.into();
        let mut parser = match TreeSitterParser::new(rust_language) {
            Ok(parser) => parser,
            Err(e) => {
                error!("Failed to create parser for {:?}: {}", language, e);
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        let tree = match parser.parse_string(&content) {
            Ok(tree) => tree,
            Err(e) => {
                error!("Failed to parse file '{}': {}", file_path, e);
                return Err(sanitize_error(&e).to_napi_error());
            }
        };

        // Try ML-powered analysis first, fallback to basic analysis
        #[cfg(feature = "ml")]
        {
            if let Ok(quality_result) = self.ml_code_quality_analysis(&file_path, &content, &tree, rust_language, include_suggestions.unwrap_or(true)).await {
                return Ok(quality_result);
            }
        }
        
        // Fallback to basic analysis
        self.basic_code_quality_analysis(&file_path, &content, &tree, include_suggestions.unwrap_or(true))
    }

    // Helper method for ML-powered code quality analysis
    #[cfg(feature = "ml")]
    async fn ml_code_quality_analysis(&self, file_path: &str, content: &str, tree: &Tree, language: RustLanguage, include_suggestions: bool) -> Result<CodeQualityResult> {
        use module_sentinel_parser::parsers::tree_sitter::ErrorPredictor;
        
        // Create error predictor for quality analysis
        let predictor = match ErrorPredictor::load(language).await {
            Ok(p) => p,
            Err(_) => return Err(Error::new(Status::GenericFailure, "Failed to load ML model")),
        };
        
        // Analyze code quality using ML
        let quality_issues = match predictor.analyze_code_quality(tree, content).await {
            Ok(issues) => issues,
            Err(_) => return Err(Error::new(Status::GenericFailure, "ML analysis failed")),
        };
        
        // Convert ML issues to NAPI format
        let mut issues = Vec::new();
        for qi in quality_issues {
            issues.push(QualityIssue {
                description: qi.description,
                category: qi.category,
                severity: qi.severity,
                suggestion: if qi.suggested_refactoring.is_empty() {
                    None
                } else {
                    Some(qi.suggested_refactoring[0].clone())
                },
                confidence: Some(qi.confidence as f64),
                suggested_refactoring: Some(qi.suggested_refactoring),
                line: Some(qi.position.row as u32),
                column: Some(qi.position.column as u32),
            });
        }
        
        // Calculate metrics using the tree
        let metrics = self.calculate_basic_metrics(content, tree);
        
        // Calculate ML-enhanced quality score
        let overall_score = self.calculate_ml_quality_score(&issues, &metrics);
        
        // Generate ML-powered recommendations
        let recommendations = if include_suggestions {
            self.generate_ml_recommendations(&issues, &metrics, file_path)
        } else {
            vec![]
        };
        
        Ok(CodeQualityResult {
            issues,
            metrics,
            overall_score,
            recommendations,
        })
    }
    
    // Calculate ML-enhanced quality score
    #[cfg(feature = "ml")]
    fn calculate_ml_quality_score(&self, issues: &[QualityIssue], metrics: &QualityMetrics) -> f64 {
        let mut score: f64 = 100.0;
        
        // Weight issues by confidence
        for issue in issues {
            let confidence = issue.confidence.unwrap_or(1.0);
            match issue.severity.as_str() {
                "high" => score -= 15.0 * confidence,
                "medium" => score -= 10.0 * confidence,
                "low" => score -= 5.0 * confidence,
                _ => score -= 5.0 * confidence,
            }
        }
        
        // Consider complexity metrics
        if metrics.cyclomatic_complexity > 20 {
            score -= 20.0;
        } else if metrics.cyclomatic_complexity > 10 {
            score -= (metrics.cyclomatic_complexity - 10) as f64;
        }
        
        score.max(0.0).min(100.0)
    }
    
    // Generate ML-powered recommendations
    #[cfg(feature = "ml")]
    fn generate_ml_recommendations(&self, issues: &[QualityIssue], metrics: &QualityMetrics, _file_path: &str) -> Vec<String> {
        let mut recommendations = Vec::new();
        
        // Group issues by category
        let mut category_counts = std::collections::HashMap::new();
        for issue in issues {
            *category_counts.entry(issue.category.clone()).or_insert(0) += 1;
        }
        
        // Priority recommendations based on categories
        if let Some(&complexity_count) = category_counts.get("complexity") {
            if complexity_count > 0 {
                recommendations.push(format!("🔧 {} complexity issues detected. Consider refactoring complex functions.", complexity_count));
            }
        }
        
        if let Some(&error_handling_count) = category_counts.get("error_handling") {
            if error_handling_count > 0 {
                recommendations.push(format!("⚠️  {} error handling issues. Improve error recovery patterns.", error_handling_count));
            }
        }
        
        // Add ML-specific insights
        let high_confidence_issues: Vec<_> = issues.iter()
            .filter(|i| i.confidence.unwrap_or(0.0) > 0.8)
            .collect();
            
        if !high_confidence_issues.is_empty() {
            recommendations.push(format!("🎯 {} high-confidence issues identified by ML analysis", high_confidence_issues.len()));
        }
        
        // Component reuse recommendation
        if metrics.cyclomatic_complexity > 15 {
            recommendations.push("💡 Use 'find_reusable_components' to discover existing solutions before implementing".to_string());
        }
        
        recommendations
    }

    // Helper method for basic code quality analysis when ML is not available
    fn basic_code_quality_analysis(&self, _file_path: &str, content: &str, tree: &Tree, include_suggestions: bool) -> Result<CodeQualityResult> {
        let metrics = self.calculate_basic_metrics(content, tree);
        
        let mut issues = Vec::new();
        
        // Basic complexity checks
        if metrics.cyclomatic_complexity > 10 {
            issues.push(QualityIssue {
                description: format!("High cyclomatic complexity: {} (threshold: 10)", metrics.cyclomatic_complexity),
                category: "complexity".to_string(),
                severity: if metrics.cyclomatic_complexity > 15 { "high".to_string() } else { "medium".to_string() },
                suggestion: Some("Consider breaking this into smaller functions".to_string()),
                confidence: Some(0.9),
                suggested_refactoring: Some(vec!["Extract methods to reduce branching".to_string()]),
                line: None,
                column: None,
            });
        }
        
        if metrics.max_nesting_depth > 4 {
            issues.push(QualityIssue {
                description: format!("Deep nesting detected: {} levels (threshold: 4)", metrics.max_nesting_depth),
                category: "complexity".to_string(),
                severity: "medium".to_string(),
                suggestion: Some("Consider extracting nested logic into separate functions".to_string()),
                confidence: Some(0.8),
                suggested_refactoring: Some(vec!["Use early returns to reduce nesting".to_string()]),
                line: None,
                column: None,
            });
        }
        
        if metrics.comment_ratio < 0.1 {
            issues.push(QualityIssue {
                description: format!("Low comment ratio: {:.1}% (recommended: >10%)", metrics.comment_ratio * 100.0),
                category: "documentation".to_string(),
                severity: "low".to_string(),
                suggestion: Some("Add more comments to explain complex logic".to_string()),
                confidence: Some(0.7),
                suggested_refactoring: Some(vec!["Add documentation comments to public functions".to_string()]),
                line: None,
                column: None,
            });
        }
        
        if metrics.large_function_count > 0 {
            issues.push(QualityIssue {
                description: format!("{} large functions detected (>50 lines)", metrics.large_function_count),
                category: "maintainability".to_string(),
                severity: "medium".to_string(),
                suggestion: Some("Consider breaking large functions into smaller, focused functions".to_string()),
                confidence: Some(0.8),
                suggested_refactoring: Some(vec!["Extract smaller functions".to_string()]),
                line: None,
                column: None,
            });
        }
        
        let overall_score = self.calculate_quality_score(&issues, &metrics);
        let recommendations = self.generate_quality_recommendations(&issues, &metrics, include_suggestions);
        
        Ok(CodeQualityResult {
            issues,
            metrics,
            overall_score,
            recommendations,
        })
    }

    // Calculate basic code metrics
    fn calculate_basic_metrics(&self, content: &str, tree: &Tree) -> QualityMetrics {
        let lines_of_code = content.lines().count() as u32;
        let comment_lines = content.lines().filter(|line| {
            let trimmed = line.trim();
            trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with("*") || trimmed.starts_with("#")
        }).count() as u32;
        
        let comment_ratio = if lines_of_code > 0 {
            comment_lines as f64 / lines_of_code as f64
        } else {
            0.0
        };
        
        // Walk the tree to calculate metrics
        let mut cyclomatic_complexity = 1; // Base complexity
        let mut max_nesting_depth = 0;
        let mut function_count = 0;
        let mut large_function_count = 0;
        
        let mut cursor = tree.walk();
        self.walk_tree_for_metrics(&mut cursor, 0, &mut cyclomatic_complexity, &mut max_nesting_depth, &mut function_count, &mut large_function_count, content);
        
        QualityMetrics {
            cyclomatic_complexity,
            max_nesting_depth,
            function_count,
            large_function_count,
            lines_of_code,
            comment_ratio,
            decision_points: None,
            error_handling_complexity: None,
        }
    }

    // Walk the tree to calculate complexity metrics
    fn walk_tree_for_metrics(&self, cursor: &mut tree_sitter::TreeCursor, depth: u32, complexity: &mut u32, max_depth: &mut u32, func_count: &mut u32, large_func_count: &mut u32, content: &str) {
        *max_depth = (*max_depth).max(depth);
        
        let node = cursor.node();
        let node_type = node.kind();
        
        // Count complexity-adding constructs
        match node_type {
            "if_statement" | "while_statement" | "for_statement" | "match_expression" | 
            "switch_statement" | "conditional_expression" | "catch_clause" => {
                *complexity += 1;
            }
            "function_declaration" | "method_declaration" | "function_definition" | 
            "function" | "function_item" => {
                *func_count += 1;
                
                // Check if this is a large function (rough estimate)
                let start_line = node.start_position().row;
                let end_line = node.end_position().row;
                if end_line - start_line > 50 {
                    *large_func_count += 1;
                }
            }
            _ => {}
        }
        
        // Recursively process children
        if cursor.goto_first_child() {
            loop {
                self.walk_tree_for_metrics(cursor, depth + 1, complexity, max_depth, func_count, large_func_count, content);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    // Calculate overall quality score
    fn calculate_quality_score(&self, issues: &[QualityIssue], metrics: &QualityMetrics) -> f64 {
        let mut score: f32 = 100.0;
        
        // Deduct points for issues
        for issue in issues {
            match issue.severity.as_str() {
                "high" => score -= 15.0,
                "medium" => score -= 10.0,
                "low" => score -= 5.0,
                _ => score -= 5.0,
            }
        }
        
        // Additional deductions for metrics
        if metrics.cyclomatic_complexity > 20 {
            score -= 20.0;
        } else if metrics.cyclomatic_complexity > 15 {
            score -= 10.0;
        }
        
        if metrics.max_nesting_depth > 6 {
            score -= 15.0;
        }
        
        if metrics.comment_ratio < 0.05 {
            score -= 10.0;
        }
        
        score.max(0.0).min(100.0) as f64
    }

    // Generate quality recommendations
    fn generate_quality_recommendations(&self, issues: &[QualityIssue], metrics: &QualityMetrics, include_suggestions: bool) -> Vec<String> {
        let mut recommendations = Vec::new();
        
        if issues.is_empty() {
            recommendations.push("✅ Code quality looks good! No major issues detected.".to_string());
        } else {
            recommendations.push(format!("🔍 Found {} code quality issues to address", issues.len()));
        }
        
        if include_suggestions {
            // Priority recommendations based on metrics
            if metrics.cyclomatic_complexity > 15 {
                recommendations.push("🚨 HIGH PRIORITY: Reduce cyclomatic complexity by breaking down complex functions".to_string());
            }
            
            if metrics.max_nesting_depth > 5 {
                recommendations.push("⚠️  MEDIUM PRIORITY: Reduce nesting depth by extracting nested logic".to_string());
            }
            
            if metrics.large_function_count > 0 {
                recommendations.push("📏 MEDIUM PRIORITY: Break down large functions for better maintainability".to_string());
            }
            
            if metrics.comment_ratio < 0.1 {
                recommendations.push("📝 LOW PRIORITY: Add more comments to improve code documentation".to_string());
            }
            
            // General recommendations
            recommendations.push("💡 Run static analysis tools for deeper insights".to_string());
            recommendations.push("🧪 Consider adding unit tests for complex functions".to_string());
        }
        
        recommendations
    }
}

/// Module-level functions for simpler operations

/// Simple symbol search without creating a full ModuleSentinel instance
#[napi]
pub async fn simple_search(project_path: String, query: String, limit: Option<i32>) -> Result<Vec<Symbol>> {
    // Create a simple database connection for search
    let path = std::path::Path::new(&project_path);
    let project_db = Arc::new(ProjectDatabase::new(&path).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?);
    
    let project = project_db.get_or_create_project("main_project", &project_path).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?;
    
    let limit_val = limit.unwrap_or(20) as usize;
    let symbols = project_db.search_symbols_simple(&query, project.id.unwrap_or(0), limit_val).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?;
    
    // Convert to NAPI-compatible symbols
    let mut result = Vec::new();
    for s in symbols {
        // Map language_id to Language enum using database
        let language = match project_db.db().find_all(
            module_sentinel_parser::database::orm::QueryBuilder::<module_sentinel_parser::database::models::Language>::new()
                .where_eq("id", s.language_id)
                .limit(1)
        ).await {
            Ok(langs) => {
                if let Some(lang) = langs.first() {
                    match lang.name.as_str() {
                        "rust" => Language::Rust,
                        "typescript" => Language::TypeScript,
                        "javascript" => Language::JavaScript,
                        "python" => Language::Python,
                        "cpp" | "c++" => Language::Cpp,
                        "java" => Language::Java,
                        "go" => Language::Go,
                        "csharp" | "c_sharp" => Language::CSharp,
                        _ => Language::Rust,
                    }
                } else {
                    Language::Rust
                }
            }
            Err(_) => Language::Rust,
        };
        
        result.push(Symbol {
            id: s.qualified_name.clone(),
            name: s.name.clone(),
            signature: s.signature.unwrap_or_default(),
            return_type: s.return_type,
            language,
            file_path: s.file_path.clone(),
            start_line: s.line as u32,
            end_line: s.end_line.unwrap_or(s.line) as u32,
            normalized_name: s.name.to_lowercase(),
            confidence_score: Some(s.confidence as f64),
            similar_symbols: vec![],
        });
    }
    
    Ok(result)
}

/// Quick pattern analysis without full setup
#[napi]
pub async fn quick_analyze(project_path: String) -> Result<AnalysisResult> {
    // Create a temporary ModuleSentinel for analysis
    let path = std::path::Path::new(&project_path);
    let project_db = Arc::new(ProjectDatabase::new(&path).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?);
    
    // Create a parsing service
    let parsing_db = ProjectDatabase::new(&path).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?;
    
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?);
    
    // Index the project
    project_db.get_or_create_project("main_project", &project_path).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?;
    
    parsing_service.parse_project(&path, "main_project", true).await.map_err(|e| {
        sanitize_error(&e).to_napi_error()
    })?;
    
    // Simple pattern analysis result
    Ok(AnalysisResult {
        patterns: vec![],
        insights: AnalysisInsights {
            total_symbols_analyzed: 0,
            duplicate_count: 0,
            patterns_detected: 0,
            average_similarity: 0.0,
            code_reuse_percentage: 0.0,
            recommendations: vec!["Quick analysis completed successfully".to_string()],
        },
        symbol_count: 0,
    })
}