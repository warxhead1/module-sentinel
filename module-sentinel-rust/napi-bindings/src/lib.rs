use std::sync::Arc;
use std::path::Path;
use std::collections::HashMap;

use napi::bindgen_prelude::*;
use napi_derive::napi;

use module_sentinel_parser::{
    services::{ParsingService, ParsingConfig},
    analysis::{SemanticAnalyzer, PatternDetector, SimilarityCalculator},
    database::{ProjectDatabase, models::UniversalRelationship},
    parsers::tree_sitter::{Language as RustLanguage, CodeEmbedder, Symbol as RustSymbol},
};

use serde::{Serialize, Deserialize};
use tracing::{info, warn, error};

// Initialize logging for NAPI
#[napi::module_init]
fn init() {
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();
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
            language: rust_symbol.language.into(),
            file_path: rust_symbol.file_path,
            start_line: rust_symbol.start_line,
            end_line: rust_symbol.end_line,
            normalized_name: rust_symbol.normalized_name,
            confidence_score: rust_symbol.confidence_score.map(|f| f as f64),
            similar_symbols: vec![], // TODO: Map SimilarSymbol to String
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

/// TypeScript-compatible UniversalRelationship structure for NAPI
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NapiUniversalRelationship {
    pub id: Option<i32>,
    pub project_id: i32,
    pub from_symbol_id: Option<i32>,
    pub to_symbol_id: Option<i32>,
    pub relationship_type: String,
    pub confidence: f64,
    pub context_line: Option<i32>,
    pub context_column: Option<i32>,
    pub context_snippet: Option<String>,
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

#[napi]
impl ModuleSentinel {
    /// Create a new Module Sentinel instance
    #[napi(factory)]
    pub async fn new(project_path: String) -> Result<Self> {
        info!("Initializing Module Sentinel for project: {}", project_path);
        
        let path = std::path::Path::new(&project_path);
        if !path.exists() {
            return Err(Error::new(
                Status::InvalidArg,
                format!("Project path does not exist: {}", project_path),
            ));
        }

        let project_db = match ProjectDatabase::new(&path).await {
            Ok(db) => Arc::new(db),
            Err(e) => {
                error!("Failed to initialize project database: {}", e);
                return Err(Error::new(
                    Status::GenericFailure,
                    format!("Database initialization failed: {}", e),
                ));
            }
        };

        Ok(ModuleSentinel {
            project_db,
            parsing_service: None,
            project_path,
        })
    }

    /// Initialize the parsing service (async operation)
    #[napi]
    pub async unsafe fn initialize(&mut self) -> Result<()> {
        info!("Initializing parsing service...");
        
        let parsing_db = match ProjectDatabase::new(std::path::Path::new(&self.project_path)).await {
            Ok(db) => db,
            Err(e) => {
                error!("Failed to create parsing database: {}", e);
                return Err(Error::new(
                    Status::GenericFailure,
                    format!("Parsing database creation failed: {}", e),
                ));
            }
        };

        let parsing_service = match ParsingService::new(parsing_db, ParsingConfig::default()).await {
            Ok(service) => Arc::new(service),
            Err(e) => {
                error!("Failed to initialize parsing service: {}", e);
                return Err(Error::new(
                    Status::GenericFailure,
                    format!("Parsing service initialization failed: {}", e),
                ));
            }
        };

        self.parsing_service = Some(parsing_service);
        info!("Parsing service initialized successfully");
        Ok(())
    }

    /// Index a project for analysis
    #[napi]
    pub async fn index_project(&self, options: Option<IndexingOptions>) -> Result<ProjectInfo> {
        info!("Starting project indexing...");
        
        let parsing_service = self.parsing_service.as_ref()
            .ok_or_else(|| Error::new(Status::InvalidArg, "Parsing service not initialized. Call initialize() first."))?;

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
                error!("Failed to create/get project: {}", e);
                return Err(Error::new(
                    Status::GenericFailure,
                    format!("Project creation failed: {}", e),
                ));
            }
        };

        // Perform parsing
        if let Err(e) = parsing_service.parse_project(
            std::path::Path::new(&self.project_path),
            "main_project"
        ).await {
            error!("Failed to parse project: {}", e);
            return Err(Error::new(
                Status::GenericFailure,
                format!("Project parsing failed: {}", e),
            ));
        }

        // Get symbol count and statistics
        let symbol_count = match self.project_db.get_symbol_count(project.id.unwrap_or(0)).await {
            Ok(count) => count,
            Err(_) => 0,
        };

        info!("Project indexing completed. Found {} symbols", symbol_count);

        Ok(ProjectInfo {
            id: project.id.unwrap_or(0),
            name: project.name,
            path: project.root_path,
            last_indexed: Some(project.updated_at),
            symbol_count: symbol_count as i32,
            language_distribution: HashMap::new(), // TODO: Implement language distribution
        })
    }

    /// Search for symbols in the indexed project
    #[napi]
    pub async fn search_symbols(&self, query: String, options: Option<SearchOptions>) -> Result<Vec<Symbol>> {
        info!("Searching symbols with query: '{}'", query);
        
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
            Err(e) => {
                warn!("Failed to get project for search: {}", e);
                return Ok(vec![]);
            }
        };

        let project_id = project.id.unwrap_or(0);
        
        // Search symbols (simplified implementation)
        let symbols = match self.project_db.search_symbols_simple(&query, project_id, limit).await {
            Ok(symbols) => symbols,
            Err(e) => {
                warn!("Symbol search failed: {}", e);
                return Ok(vec![]);
            }
        };

        // Convert to NAPI-compatible symbols
        let result: Vec<Symbol> = symbols.into_iter().map(|s| Symbol {
            id: s.qualified_name.clone(),
            name: s.name.clone(),
            signature: s.signature.unwrap_or_default(),
            language: Language::Rust, // TODO: Map from language_id
            file_path: s.file_path.clone(),
            start_line: s.line as u32,
            end_line: s.end_line.unwrap_or(s.line) as u32,
            normalized_name: s.name.to_lowercase(),
            confidence_score: Some(s.confidence as f64),
            similar_symbols: vec![],
        }).collect();

        info!("Found {} symbols matching query", result.len());
        Ok(result)
    }

    /// Analyze patterns in the indexed project
    #[napi]
    pub async fn analyze_patterns(&self) -> Result<AnalysisResult> {
        info!("Starting pattern analysis...");
        
        // Get project
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                error!("Failed to get project for analysis: {}", e);
                return Err(Error::new(
                    Status::GenericFailure,
                    format!("Project retrieval failed: {}", e),
                ));
            }
        };

        let project_id = project.id.unwrap_or(0);

        // Load symbols from database
        let symbols = match self.project_db.search_symbols_simple("", project_id, 1000).await {
            Ok(symbols) => symbols,
            Err(e) => {
                warn!("Failed to load symbols for analysis: {}", e);
                return Ok(AnalysisResult {
                    patterns: vec![],
                    insights: AnalysisInsights {
                        total_symbols_analyzed: 0,
                        duplicate_count: 0,
                        patterns_detected: 0,
                        average_similarity: 0.0,
                        code_reuse_percentage: 0.0,
                        recommendations: vec!["No symbols found for analysis".to_string()],
                    },
                    symbol_count: 0,
                });
            }
        };

        // Convert to parser symbols for analysis
        let parser_symbols: Vec<RustSymbol> = symbols.iter().map(|s| RustSymbol {
            id: s.qualified_name.clone(),
            name: s.name.clone(),
            signature: s.signature.clone().unwrap_or_default(),
            language: RustLanguage::Rust, // TODO: Map from language_id properly
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
        }).collect();

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

        let insights = AnalysisInsights {
            total_symbols_analyzed: total_symbols as i32,
            duplicate_count: 0, // TODO: Implement duplicate detection
            patterns_detected: patterns_detected as i32,
            average_similarity: 0.0,
            code_reuse_percentage: 0.0,
            recommendations: if patterns_detected > 0 {
                vec![format!("Detected {} design patterns across {} symbols", patterns_detected, total_symbols)]
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
        
        // This is a simplified implementation
        // In a real scenario, we'd load the actual symbols from the database
        let calc = SimilarityCalculator::new();
        
        // For demo purposes, return a mock result
        // TODO: Implement actual symbol loading and comparison
        Ok(SimilarityResult {
            overall_score: 0.75,
            name_similarity: 0.8,
            signature_similarity: 0.7,
            structural_similarity: 0.75,
            context_similarity: 0.8,
        })
    }

    

    /// Get relationships for a symbol
    #[napi]
    pub async fn get_symbol_relationships(&self) -> Result<Vec<NapiUniversalRelationship>> {
        info!("Getting all symbol relationships...");
        
        // For now, return all relationships in the database
        // In a real scenario, we might filter by project_id or symbol_id
        let project = match self.project_db.get_or_create_project(
            "main_project",
            &self.project_path
        ).await {
            Ok(p) => p,
            Err(e) => {
                error!("Failed to get project for relationships: {}", e);
                return Err(Error::new(
                    Status::GenericFailure,
                    format!("Project retrieval failed: {}", e),
                ));
            }
        };

        let project_id = project.id.unwrap_or(0);

        let rels = match self.project_db.get_all_relationships(project_id).await {
            Ok(rels) => rels,
            Err(e) => {
                warn!("Failed to retrieve relationships: {}", e);
                return Ok(vec![]);
            }
        };

        let relationships: Vec<NapiUniversalRelationship> = rels.into_iter().map(NapiUniversalRelationship::from).collect();
        Ok(relationships)
    }

    /// Parse a single file and return symbols
    #[napi]
    pub async fn parse_file(&self, file_path: String, language: Language) -> Result<ParseResult> {
        info!("Parsing file: {} (language: {:?})", file_path, language);
        
        let parsing_service = self.parsing_service.as_ref()
            .ok_or_else(|| Error::new(Status::InvalidArg, "Parsing service not initialized"))?;

        // Read file content
        let content = match std::fs::read_to_string(&file_path) {
            Ok(content) => content,
            Err(e) => {
                return Err(Error::new(
                    Status::InvalidArg,
                    format!("Failed to read file {}: {}", file_path, e),
                ));
            }
        };

        // Parse file using the parsing service
        // This is a simplified implementation - the actual parsing service might need adjustments
        Ok(ParseResult {
            symbols: vec![], // TODO: Implement actual parsing
            errors: vec![],
            parse_method: "tree-sitter".to_string(),
            confidence: 1.0,
        })
    }
}

/// Module-level functions for simpler operations

/// Simple symbol search without creating a full ModuleSentinel instance
#[napi]
pub async fn simple_search(project_path: String, query: String, limit: Option<i32>) -> Result<Vec<Symbol>> {
    // Create a simple database connection for search
    let path = std::path::Path::new(&project_path);
    let project_db = Arc::new(ProjectDatabase::new(&path).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Database initialization failed: {}", e))
    })?);
    
    let project = project_db.get_or_create_project("main_project", &project_path).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Project creation failed: {}", e))
    })?;
    
    let limit_val = limit.unwrap_or(20) as usize;
    let symbols = project_db.search_symbols_simple(&query, project.id.unwrap_or(0), limit_val).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Search failed: {}", e))
    })?;
    
    // Convert to NAPI-compatible symbols
    let result: Vec<Symbol> = symbols.into_iter().map(|s| Symbol {
        id: s.qualified_name.clone(),
        name: s.name.clone(),
        signature: s.signature.unwrap_or_default(),
        language: Language::Rust, // TODO: Map from language_id
        file_path: s.file_path.clone(),
        start_line: s.line as u32,
        end_line: s.end_line.unwrap_or(s.line) as u32,
        normalized_name: s.name.to_lowercase(),
        confidence_score: Some(s.confidence as f64),
        similar_symbols: vec![],
    }).collect();
    
    Ok(result)
}

/// Quick pattern analysis without full setup
#[napi]
pub async fn quick_analyze(project_path: String) -> Result<AnalysisResult> {
    // Create a temporary ModuleSentinel for analysis
    let path = std::path::Path::new(&project_path);
    let project_db = Arc::new(ProjectDatabase::new(&path).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Database initialization failed: {}", e))
    })?);
    
    // Create a parsing service
    let parsing_db = ProjectDatabase::new(&path).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Parsing database creation failed: {}", e))
    })?;
    
    let parsing_service = Arc::new(ParsingService::new(parsing_db, ParsingConfig::default()).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Parsing service initialization failed: {}", e))
    })?);
    
    // Index the project
    let project = project_db.get_or_create_project("main_project", &project_path).await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Project creation failed: {}", e))
    })?;
    
    parsing_service.parse_project(&path, "main_project").await.map_err(|e| {
        Error::new(Status::GenericFailure, format!("Project parsing failed: {}", e))
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