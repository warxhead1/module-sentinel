use anyhow::{Result, anyhow};
use std::path::Path;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime};
use serde::{Serialize, Deserialize};
use tokio::fs;
use tree_sitter::{Parser, Tree, Node};
use dashmap::DashMap;
use tokio::sync::RwLock;
use walkdir::WalkDir;
use tracing::{info, debug, warn};

use crate::database::{
    project_database::ProjectDatabase,
    models::{UniversalSymbol},
};
use crate::parsers::tree_sitter::{Symbol, Language as ParserLanguage};

// ML Integration imports (conditional compilation)
#[cfg(feature = "ml")]
use crate::parsers::tree_sitter::{
    SyntaxPredictor, CodeEmbedder, ErrorPredictor, 
    Language as MLLanguage,
};

/// Configuration for the unified parsing service
#[derive(Debug, Clone)]
pub struct UnifiedParsingConfig {
    pub max_file_size_mb: u64,
    pub timeout_seconds: u64,
    pub enable_semantic_analysis: bool,
    pub parallel_parsing: bool,
    pub enable_ml_features: bool,
    pub enable_error_recovery: bool,
    pub cache_embeddings: bool,
}

impl Default for UnifiedParsingConfig {
    fn default() -> Self {
        Self {
            max_file_size_mb: 10,
            timeout_seconds: 30,
            enable_semantic_analysis: false,
            parallel_parsing: true,
            enable_ml_features: cfg!(feature = "ml"),
            enable_error_recovery: true,
            cache_embeddings: true,
        }
    }
}

/// Enhanced result of parsing a single file with optional ML features
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedFileParseResult {
    pub file_path: String,
    pub symbols: Vec<UniversalSymbol>,
    pub relationships: Vec<crate::database::models::UniversalRelationship>,
    pub success: bool,
    pub errors: Vec<EnhancedParseError>,
    pub parse_duration_ms: u64,
    pub language: String,
    // ML-enhanced fields (optional)
    pub confidence_score: Option<f32>,
    pub predicted_intent: Option<String>,
    pub embeddings_generated: bool,
    pub ml_suggestions: Vec<String>,
}

/// Enhanced error information with ML insights
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedParseError {
    pub message: String,
    pub line: u32,
    pub column: u32,
    pub error_type: String,
    pub confidence: Option<f32>,
    pub recovery_suggestions: Vec<String>,
}

/// Result of parsing an entire project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedParsedProject {
    pub project_id: i32,
    pub project_name: String,
    pub total_files: i32,
    pub total_symbols: i32,
    pub total_relationships: i32,
    pub success: bool,
    pub errors: Vec<String>,
    pub parse_duration_ms: u64,
    pub files_processed: i32,
    pub ml_enhanced_files: i32,
    pub confidence_scores: Option<Vec<f32>>,
}

/// File change information for incremental parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub file_path: String,
    pub change_type: ChangeType,
    pub timestamp: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChangeType {
    Modified,
    Added,
    Deleted,
}

/// ML components container (only available with ML feature)
#[cfg(feature = "ml")]
#[derive(Clone)]
struct MLComponents {
    syntax_predictor: Arc<SyntaxPredictor>,
    code_embedder: Arc<CodeEmbedder>,
    error_predictor: Arc<ErrorPredictor>,
    parse_cache: Arc<DashMap<u64, CachedParseResult>>,
    embedding_cache: Arc<DashMap<String, Vec<f32>>>,
}

#[cfg(feature = "ml")]
#[derive(Debug, Clone)]
struct CachedParseResult {
    tree_hash: u64,
    confidence: f32,
    embeddings: Vec<f32>,
    timestamp: SystemTime,
}


/// Unified parsing service that combines basic tree-sitter with optional ML enhancement
pub struct UnifiedParsingService {
    project_db: ProjectDatabase,
    config: UnifiedParsingConfig,
    
    // ML components (only available with ml feature)
    #[cfg(feature = "ml")]
    ml_components: Arc<RwLock<HashMap<ParserLanguage, MLComponents>>>,
}

impl UnifiedParsingService {
    /// Create a new unified parsing service
    pub async fn new(project_db: ProjectDatabase, config: UnifiedParsingConfig) -> Result<Self> {
        #[cfg(feature = "ml")]
        let ml_components = Arc::new(RwLock::new(HashMap::new()));
        
        Ok(Self {
            project_db,
            config,
            #[cfg(feature = "ml")]
            ml_components,
        })
    }

    /// Parse a single file with unified ML/basic approach
    pub async fn parse_file(&self, file_path: &Path) -> Result<UnifiedFileParseResult> {
        let start_time = Instant::now();
        
        // Read file content
        let content = self.read_file_content(file_path).await?;
        
        // Detect language
        let language = self.detect_language(file_path)?;
        
        // Parse with appropriate method based on configuration
        let result = if self.config.enable_ml_features && cfg!(feature = "ml") {
            #[cfg(feature = "ml")]
            {
                self.parse_with_ml_enhancement(&content, file_path, &language).await?
            }
            #[cfg(not(feature = "ml"))]
            {
                self.parse_with_basic_treesitter(&content, file_path, &language).await?
            }
        } else {
            self.parse_with_basic_treesitter(&content, file_path, &language).await?
        };
        
        let parse_duration = start_time.elapsed().as_millis() as u64;
        
        Ok(UnifiedFileParseResult {
            file_path: file_path.to_string_lossy().to_string(),
            symbols: result.symbols,
            relationships: result.relationships,
            success: result.success,
            errors: result.errors,
            parse_duration_ms: parse_duration,
            language: language.to_string(),
            confidence_score: result.confidence_score,
            predicted_intent: result.predicted_intent,
            embeddings_generated: result.embeddings_generated,
            ml_suggestions: result.ml_suggestions,
        })
    }

    /// Parse an entire project from scratch
    pub async fn parse_project(&self, project_path: &Path, project_name: &str) -> Result<UnifiedParsedProject> {
        let start_time = Instant::now();
        
        // Create or get project in database
        let project = self.project_db.get_or_create_project(
            project_name, 
            project_path.to_string_lossy().as_ref()
        ).await?;
        let project_id = project.id;
        
        // Find all source files
        let source_files = self.find_source_files(project_path)?;
        
        let mut total_symbols = 0;
        let mut total_relationships = 0;
        let mut errors = Vec::new();
        let mut files_processed = 0;
        let mut ml_enhanced_files = 0;
        let mut confidence_scores = Vec::new();
        
        // Process files (parallel or sequential based on config)
        for (i, file_path) in source_files.iter().enumerate() {
            if i % 10 == 0 || i == source_files.len() - 1 {
                info!("Processing file {}/{}: {}", i + 1, source_files.len(), file_path.display());
            }
            
            match self.parse_file(file_path).await {
                Ok(mut result) => {
                    // Update symbols with correct project_id and language_id before storing
                    for symbol in &mut result.symbols {
                        symbol.project_id = project_id.unwrap_or(0);
                        symbol.language_id = self.get_or_create_language_id(&self.detect_language(file_path)?).await?;
                    }
                    
                    // Store symbols in database  
                    for symbol in &result.symbols {
                        let _stored = self.project_db.store_universal_symbol(symbol).await?;
                    }
                    
                    // Store relationships in database
                    for relationship in &result.relationships {
                        let _stored = self.project_db.store_universal_relationship(relationship).await?;
                    }
                    
                    total_symbols += result.symbols.len() as i32;
                    total_relationships += result.relationships.len() as i32;
                    files_processed += 1;
                    
                    if result.embeddings_generated {
                        ml_enhanced_files += 1;
                    }
                    
                    if let Some(confidence) = result.confidence_score {
                        confidence_scores.push(confidence);
                    }
                    
                    if !result.success {
                        errors.extend(
                            result.errors.iter()
                                .map(|e| format!("{}: {}", file_path.display(), e.message))
                        );
                    }
                    
                    debug!("Parsed {}: {} symbols, {} relationships", 
                        file_path.display(), result.symbols.len(), result.relationships.len());
                }
                Err(e) => {
                    warn!("Failed to parse {}: {}", file_path.display(), e);
                    errors.push(format!("Failed to parse {}: {}", file_path.display(), e));
                }
            }
        }
        
        let parse_duration = start_time.elapsed().as_millis() as u64;
        
        Ok(UnifiedParsedProject {
            project_id: project.id.unwrap_or(0),
            project_name: project_name.to_string(),
            total_files: source_files.len() as i32,
            total_symbols,
            total_relationships,
            success: errors.is_empty(),
            errors,
            parse_duration_ms: parse_duration,
            files_processed,
            ml_enhanced_files,
            confidence_scores: if confidence_scores.is_empty() { None } else { Some(confidence_scores) },
        })
    }

    /// Parse with ML enhancement (only available with ml feature)
    #[cfg(feature = "ml")]
    async fn parse_with_ml_enhancement(
        &self, 
        content: &str, 
        file_path: &Path, 
        language: &ParserLanguage
    ) -> Result<ParseResultInternal> {
        // Convert to ML language enum
        let ml_language = self.convert_to_ml_language(language)?;
        
        // Get or create ML components for this language
        let ml_components = self.get_or_create_ml_components(&ml_language).await?;
        
        // Create parser with ML integration
        let mut parser = self.get_cached_parser(language).await?;
        
        // Parse with tree-sitter
        let tree = parser.parse(content, None)
            .ok_or_else(|| anyhow!("Failed to parse code with tree-sitter"))?;
        
        // Check for errors
        let mut errors = Vec::new();
        let mut ml_suggestions = Vec::new();
        
        if tree.root_node().has_error() {
            // Basic error detection without ML recovery for now
            errors.push(EnhancedParseError {
                message: "Syntax error detected".to_string(),
                line: 0,
                column: 0,
                error_type: "SYNTAX_ERROR".to_string(),
                confidence: Some(0.8),
                recovery_suggestions: Vec::new(),
            });
        }
        
        // Generate embeddings if enabled
        let embeddings_generated = if self.config.cache_embeddings {
            match ml_components.code_embedder.generate_embeddings(content, &ml_language).await {
                Ok(_embeddings) => {
                    // Cache embeddings for future use
                    true
                }
                Err(e) => {
                    tracing::warn!("Failed to generate embeddings: {}", e);
                    false
                }
            }
        } else {
            false
        };
        
        // Extract symbols with enhanced analysis
        let symbols = self.extract_symbols_enhanced(&tree, content, file_path, language, &ml_components).await?;
        
        // Predict intent if possible
        let predicted_intent = ml_components.syntax_predictor
            .predict_intent(content, &ml_language)
            .await
            .ok()
            .map(|intent| format!("{:?}", intent));
        
        // Calculate confidence score
        let confidence_score = if tree.root_node().has_error() {
            Some(0.5) // Lower confidence for error trees
        } else {
            Some(0.9) // High confidence for clean parses
        };
        
        Ok(ParseResultInternal {
            symbols,
            relationships: Vec::new(), // TODO: Extract relationships
            success: errors.is_empty(),
            errors,
            confidence_score,
            predicted_intent,
            embeddings_generated,
            ml_suggestions,
        })
    }

    /// Parse with basic tree-sitter (always available)
    async fn parse_with_basic_treesitter(
        &self, 
        content: &str, 
        file_path: &Path, 
        language: &ParserLanguage
    ) -> Result<ParseResultInternal> {
        // Get cached parser
        let mut parser = self.get_cached_parser(language).await?;
        
        // Parse the code
        let tree = parser.parse(content, None)
            .ok_or_else(|| anyhow!("Failed to parse code with tree-sitter"))?;
        
        // Debug logging
        debug!("Parsed tree for {:?}: root_node.kind() = {}, has_error = {}", 
            file_path, tree.root_node().kind(), tree.root_node().has_error());
        
        // Extract symbols
        let symbols = self.extract_symbols_basic(&tree, content, file_path, language).await?;
        
        debug!("Extracted {} symbols from {:?}", symbols.len(), file_path);
        
        // Extract relationships
        let relationships = self.extract_relationships(&tree, content, file_path, language, &symbols)?;
        
        // Check for basic syntax errors - only if the root is ERROR or has actual parse errors
        let errors = if tree.root_node().kind() == "ERROR" || 
                       (tree.root_node().has_error() && symbols.is_empty()) {
            vec![EnhancedParseError {
                message: "Syntax error detected".to_string(),
                line: 0,
                column: 0,
                error_type: "SYNTAX_ERROR".to_string(),
                confidence: None,
                recovery_suggestions: Vec::new(),
            }]
        } else {
            Vec::new()
        };
        
        Ok(ParseResultInternal {
            symbols,
            relationships,
            success: errors.is_empty(),
            errors,
            confidence_score: None,
            predicted_intent: None,
            embeddings_generated: false,
            ml_suggestions: Vec::new(),
        })
    }

    /// Get or create cached parser for language
    async fn get_cached_parser(&self, language: &ParserLanguage) -> Result<Parser> {
        // Create new parser each time (Parser doesn't implement Clone)
        let mut parser = Parser::new();
        let ts_language = match language {
            ParserLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
            ParserLanguage::Python => tree_sitter_python::LANGUAGE.into(),
            ParserLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            ParserLanguage::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            ParserLanguage::Cpp => tree_sitter_cpp::LANGUAGE.into(),
            ParserLanguage::Go => tree_sitter_go::LANGUAGE.into(),
            ParserLanguage::Java => tree_sitter_java::LANGUAGE.into(),
            ParserLanguage::CSharp => tree_sitter_c_sharp::LANGUAGE.into(),
        };
        
        parser.set_language(&ts_language)?;
        
        Ok(parser)
    }

    /// Get or create ML components for language (only with ml feature)
    #[cfg(feature = "ml")]
    async fn get_or_create_ml_components(&self, language: &MLLanguage) -> Result<Arc<MLComponents>> {
        let parser_lang = self.convert_from_ml_language(language);
        let components_map = self.ml_components.read().await;
        
        if let Some(components) = components_map.get(&parser_lang) {
            return Ok(Arc::new(components.clone()));
        }
        
        drop(components_map);
        
        // Create new ML components
        let syntax_predictor = Arc::new(SyntaxPredictor::load(language).await?);
        let code_embedder = Arc::new(CodeEmbedder::load(language).await?);
        let error_predictor = Arc::new(ErrorPredictor::load(language).await?);
        
        let components = MLComponents {
            syntax_predictor,
            code_embedder,
            error_predictor,
            parse_cache: Arc::new(DashMap::new()),
            embedding_cache: Arc::new(DashMap::new()),
        };
        
        // Cache components
        let mut components_map = self.ml_components.write().await;
        components_map.insert(parser_lang, components.clone());
        
        Ok(Arc::new(components))
    }

    /// Extract symbols with enhanced ML analysis
    #[cfg(feature = "ml")]
    async fn extract_symbols_enhanced(
        &self,
        tree: &Tree,
        content: &str,
        file_path: &Path,
        language: &ParserLanguage,
        _ml_components: &MLComponents,
    ) -> Result<Vec<UniversalSymbol>> {
        // Use existing symbol extraction logic but with ML enhancements
        self.extract_symbols_basic(tree, content, file_path, language).await
    }

    /// Extract symbols using basic tree-sitter traversal
    async fn extract_symbols_basic(
        &self,
        tree: &Tree,
        content: &str,
        file_path: &Path,
        language: &ParserLanguage,
    ) -> Result<Vec<UniversalSymbol>> {
        let mut symbols = Vec::new();
        let mut cursor = tree.walk();
        
        // Get the language_id for the foreign key - we'll need to ensure languages are populated
        let language_id = self.get_or_create_language_id(language).await?;
        
        match language {
            ParserLanguage::Rust => self.extract_rust_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
            ParserLanguage::Python => self.extract_python_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
            ParserLanguage::TypeScript | ParserLanguage::JavaScript => self.extract_typescript_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
            ParserLanguage::Cpp => self.extract_cpp_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
            ParserLanguage::Go => self.extract_go_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
            ParserLanguage::Java => self.extract_java_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
            ParserLanguage::CSharp => self.extract_csharp_symbols(&mut cursor, content, file_path, language_id, &mut symbols),
        }
        
        Ok(symbols)
    }

    // Language conversion helpers for ML feature
    #[cfg(feature = "ml")]
    fn convert_to_ml_language(&self, lang: &ParserLanguage) -> Result<MLLanguage> {
        match lang {
            ParserLanguage::Rust => Ok(MLLanguage::Rust),
            ParserLanguage::Python => Ok(MLLanguage::Python),
            ParserLanguage::TypeScript => Ok(MLLanguage::TypeScript),
            ParserLanguage::JavaScript => Ok(MLLanguage::JavaScript),
            ParserLanguage::Cpp => Ok(MLLanguage::Cpp),
            ParserLanguage::Go => Ok(MLLanguage::Go),
            ParserLanguage::Java => Ok(MLLanguage::Java),
            ParserLanguage::CSharp => Ok(MLLanguage::CSharp),
        }
    }

    #[cfg(feature = "ml")]
    fn convert_from_ml_language(&self, lang: &MLLanguage) -> ParserLanguage {
        match lang {
            MLLanguage::Rust => ParserLanguage::Rust,
            MLLanguage::Python => ParserLanguage::Python,
            MLLanguage::TypeScript => ParserLanguage::TypeScript,
            MLLanguage::JavaScript => ParserLanguage::JavaScript,
            MLLanguage::Cpp => ParserLanguage::Cpp,
            MLLanguage::Go => ParserLanguage::Go,
            MLLanguage::Java => ParserLanguage::Java,
            MLLanguage::CSharp => ParserLanguage::CSharp,
        }
    }

    // Utility methods (existing implementations from parsing_service.rs)
    async fn read_file_content(&self, file_path: &Path) -> Result<String> {
        let metadata = fs::metadata(file_path).await?;
        let size_mb = metadata.len() / (1024 * 1024);
        
        if size_mb > self.config.max_file_size_mb {
            return Err(anyhow!(
                "File {} is too large ({} MB > {} MB limit)", 
                file_path.display(), 
                size_mb, 
                self.config.max_file_size_mb
            ));
        }
        
        Ok(fs::read_to_string(file_path).await?)
    }

    fn detect_language(&self, file_path: &Path) -> Result<ParserLanguage> {
        let extension = file_path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        
        match extension {
            "rs" => Ok(ParserLanguage::Rust),
            "py" => Ok(ParserLanguage::Python),
            "ts" => Ok(ParserLanguage::TypeScript),
            "js" | "jsx" => Ok(ParserLanguage::JavaScript),
            "cpp" | "cc" | "cxx" | "hpp" | "h" => Ok(ParserLanguage::Cpp),
            "go" => Ok(ParserLanguage::Go),
            "java" => Ok(ParserLanguage::Java),
            "cs" => Ok(ParserLanguage::CSharp),
            _ => Err(anyhow!("Unsupported file extension: {}", extension)),
        }
    }

    fn find_source_files(&self, project_path: &Path) -> Result<Vec<std::path::PathBuf>> {
        let mut files = Vec::new();
        let max_file_size = 2 * 1024 * 1024; // 2MB limit
        
        info!("Scanning directory: {}", project_path.display());
        
        for entry in WalkDir::new(project_path)
            .into_iter()
            .filter_entry(|e| !self.should_skip_directory(e.path()))
            .take(1000) // Limit to 1000 files to prevent hanging
        {
            let entry = entry?;
            if entry.file_type().is_file() {
                // Check file size before processing
                if let Ok(metadata) = entry.metadata() {
                    if metadata.len() > max_file_size {
                        debug!("Skipping large file: {} ({} bytes)", entry.path().display(), metadata.len());
                        continue;
                    }
                }
                
                if let Ok(_) = self.detect_language(entry.path()) {
                    debug!("Found source file: {}", entry.path().display());
                    files.push(entry.path().to_path_buf());
                }
            }
        }
        
        info!("Found {} source files to parse", files.len());
        Ok(files)
    }

    fn should_skip_directory(&self, path: &Path) -> bool {
        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            matches!(name, 
                "target" | "node_modules" | ".git" | "build" | "dist" | "out" |
                ".cargo" | "vendor" | "deps" | "pkg" | "bin" | ".npm" |
                "__pycache__" | ".pytest_cache" | "venv" | ".venv" |
                "coverage" | ".coverage" | "htmlcov" | ".tox" |
                ".idea" | ".vscode" | ".vs" | ".nuget" | 
                "obj" | "Debug" | "Release" | "x64" | "x86" |
                "Pods" | "DerivedData" | ".dart_tool" |
                "generated" | "autogen" | "auto-generated"
            )
        } else {
            false
        }
    }

    /// Get or create language ID for foreign key relationships
    async fn get_or_create_language_id(&self, language: &ParserLanguage) -> Result<i32> {
        // For now, return a simple mapping - in production this would query/create in DB
        let language_id = match language {
            ParserLanguage::Rust => 1,
            ParserLanguage::Python => 2,
            ParserLanguage::TypeScript => 3,
            ParserLanguage::JavaScript => 4,
            ParserLanguage::Cpp => 5,
            ParserLanguage::Go => 6,
            ParserLanguage::Java => 7,
            ParserLanguage::CSharp => 8,
        };
        Ok(language_id)
    }

    // Symbol extraction methods (from existing parsing_service.rs)
    fn extract_rust_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        let node = cursor.node();
        
        match node.kind() {
            "function_item" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        let signature = self.build_function_signature(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "function".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(signature),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "impl_item" => {
                if cursor.goto_first_child() {
                    loop {
                        if cursor.node().kind() == "function_item" {
                            self.extract_rust_symbols(cursor, content, file_path, language_id, symbols);
                        } else {
                            self.extract_rust_symbols(cursor, content, file_path, language_id, symbols);
                        }
                        if !cursor.goto_next_sibling() {
                            break;
                        }
                    }
                    cursor.goto_parent();
                }
            }
            "struct_item" => {
                if let Some(name_node) = self.find_child_of_type(node, "type_identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "struct".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(format!("struct {}", name)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "enum_item" => {
                if let Some(name_node) = self.find_child_of_type(node, "type_identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "enum".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(format!("enum {}", name)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            _ => {}
        }
        
        // Recursively process children
        if cursor.goto_first_child() {
            loop {
                self.extract_rust_symbols(cursor, content, file_path, language_id, symbols);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    fn extract_python_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        let node = cursor.node();
        
        match node.kind() {
            "function_definition" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        let signature = self.build_function_signature(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "function".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(signature),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "class_definition" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "class".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(format!("class {}", name)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            _ => {}
        }
        
        // Recursively process children
        if cursor.goto_first_child() {
            loop {
                self.extract_python_symbols(cursor, content, file_path, language_id, symbols);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    fn extract_typescript_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        let node = cursor.node();
        
        match node.kind() {
            "function_declaration" | "method_definition" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        let signature = self.build_function_signature(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "function".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(signature),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "class_declaration" => {
                if let Some(name_node) = self.find_child_of_type(node, "type_identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "class".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(format!("class {}", name)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            _ => {}
        }
        
        // Recursively process children
        if cursor.goto_first_child() {
            loop {
                self.extract_typescript_symbols(cursor, content, file_path, language_id, symbols);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    fn extract_cpp_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        let node = cursor.node();
        
        match node.kind() {
            "class_specifier" | "struct_specifier" => {
                if let Some(name_node) = self.find_child_of_type(node, "type_identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        let kind = if node.kind() == "class_specifier" { "class" } else { "struct" };
                        
                        // Check if it's a template
                        let is_template = node.parent()
                            .map(|p| p.kind() == "template_declaration")
                            .unwrap_or(false);
                        
                        let qualified_name = if is_template {
                            format!("{}::template<> {}", file_path.file_stem().unwrap().to_string_lossy(), name)
                        } else {
                            format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name)
                        };
                        
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name,
                            kind: kind.to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(self.get_node_text(node, content, 200)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "function_definition" | "function_declarator" => {
                if let Some(name_node) = self.find_function_name(node) {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        let is_method = self.is_method_definition(node);
                        let is_template = node.parent()
                            .map(|p| p.kind() == "template_declaration")
                            .unwrap_or(false);
                        
                        let qualified_name = format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name);
                        let kind = if is_method {
                            if is_template { "template_method" } else { "method" }
                        } else {
                            if is_template { "template_function" } else { "function" }
                        };
                        
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name,
                            kind: kind.to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(self.get_function_signature(node, content)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "field_declaration" => {
                // Extract member variables
                if let Some(declarator) = self.find_child_of_type(node, "field_identifier") {
                    if let Ok(name) = declarator.utf8_text(content.as_bytes()) {
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "field".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(self.get_node_text(node, content, 100)),
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "namespace_definition" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "namespace".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: None,
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "template_declaration" => {
                // Template declarations are handled when we encounter the actual declaration
                // (class, function, etc.)
            }
            "declaration" => {
                // Method declarations inside classes
                if let Some(declarator) = self.find_child_of_type(node, "function_declarator") {
                    if let Some(name_node) = self.find_function_name(declarator) {
                        if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                            if self.is_method_definition(node) {
                                symbols.push(UniversalSymbol {
                                    name: name.to_string(),
                                    qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                                    kind: "method".to_string(),
                                    file_path: file_path.to_string_lossy().to_string(),
                                    line: node.start_position().row as i32 + 1,
                                    column: node.start_position().column as i32,
                                    end_line: Some(node.end_position().row as i32 + 1),
                                    signature: Some(self.get_node_text(node, content, 200)),
                                    language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                                });
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        
        // Recursively process children
        if cursor.goto_first_child() {
            loop {
                self.extract_cpp_symbols(cursor, content, file_path, language_id, symbols);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    fn extract_go_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        self.extract_basic_symbols(cursor, content, file_path, language_id, symbols, &ParserLanguage::Go);
    }

    fn extract_java_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        self.extract_basic_symbols(cursor, content, file_path, language_id, symbols, &ParserLanguage::Java);
    }

    fn extract_csharp_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        self.extract_basic_symbols(cursor, content, file_path, language_id, symbols, &ParserLanguage::CSharp);
    }

    fn extract_basic_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>, _language: &ParserLanguage) {
        let node = cursor.node();
        
        // Generic symbol extraction for unsupported languages
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            if text.len() < 100 && (node.kind().contains("function") || node.kind().contains("method") || node.kind().contains("class")) {
                symbols.push(UniversalSymbol {
                    name: text.to_string(),
                    qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), text),
                    kind: node.kind().to_string(),
                    file_path: file_path.to_string_lossy().to_string(),
                    line: node.start_position().row as i32 + 1,
                    column: node.start_position().column as i32,
                    end_line: Some(node.end_position().row as i32 + 1),
                    signature: Some(text.to_string()),
                    ..Default::default()
                });
            }
        }
        
        // Recursively process children
        if cursor.goto_first_child() {
            loop {
                self.extract_basic_symbols(cursor, content, file_path, language_id, symbols, _language);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    fn find_function_name<'a>(&self, node: Node<'a>) -> Option<Node<'a>> {
        // For C++ functions, the name might be in different places
        if let Some(declarator) = self.find_child_of_type(node, "function_declarator") {
            if let Some(id) = self.find_child_of_type(declarator, "identifier") {
                return Some(id);
            }
            if let Some(field_id) = self.find_child_of_type(declarator, "field_identifier") {
                return Some(field_id);
            }
            if let Some(qualified) = self.find_child_of_type(declarator, "qualified_identifier") {
                if let Some(id) = self.find_child_of_type(qualified, "identifier") {
                    return Some(id);
                }
            }
        }
        
        // Fallback to direct identifier
        self.find_child_of_type(node, "identifier")
    }
    
    fn is_method_definition(&self, node: Node) -> bool {
        // Check if this function is inside a class/struct
        let mut current = node.parent();
        while let Some(parent) = current {
            match parent.kind() {
                "class_specifier" | "struct_specifier" => return true,
                "translation_unit" => return false,
                _ => current = parent.parent(),
            }
        }
        false
    }
    
    fn get_function_signature(&self, node: Node, content: &str) -> String {
        // Try to extract a clean function signature
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            // Limit signature length and clean it up
            let sig = text.lines()
                .next()
                .unwrap_or(text)
                .trim()
                .to_string();
            
            if sig.len() > 200 {
                format!("{}...", &sig[..197])
            } else {
                sig
            }
        } else {
            String::new()
        }
    }
    
    fn get_node_text(&self, node: Node, content: &str, max_len: usize) -> String {
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            if text.len() > max_len {
                format!("{}...", &text[..max_len-3])
            } else {
                text.to_string()
            }
        } else {
            String::new()
        }
    }
    
    fn find_child_of_type<'a>(&self, node: Node<'a>, node_type: &str) -> Option<Node<'a>> {
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                if child.kind() == node_type {
                    return Some(child);
                }
                // Recursively search in children
                if let Some(found) = self.find_child_of_type(child, node_type) {
                    return Some(found);
                }
            }
        }
        None
    }
    
    fn build_function_signature(&self, node: Node, content: &str) -> String {
        // Try to get the full function signature from start to opening brace or end
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            // Find the first line or until opening brace
            if let Some(brace_pos) = text.find('{') {
                text[..brace_pos].trim().to_string()
            } else {
                // Take first line
                text.lines().next().unwrap_or(text).trim().to_string()
            }
        } else {
            "".to_string()
        }
    }

    /// Extract relationships between symbols
    fn extract_relationships(
        &self,
        tree: &Tree,
        content: &str,
        file_path: &Path,
        language: &ParserLanguage,
        symbols: &[UniversalSymbol],
    ) -> Result<Vec<crate::database::models::UniversalRelationship>> {
        let mut relationships = Vec::new();
        let mut cursor = tree.walk();
        
        match language {
            ParserLanguage::Rust => self.extract_rust_relationships(&mut cursor, content, file_path, symbols, &mut relationships),
            ParserLanguage::TypeScript | ParserLanguage::JavaScript => self.extract_typescript_relationships(&mut cursor, content, file_path, symbols, &mut relationships),
            ParserLanguage::Python => self.extract_python_relationships(&mut cursor, content, file_path, symbols, &mut relationships),
            ParserLanguage::Cpp => self.extract_cpp_relationships(&mut cursor, content, file_path, symbols, &mut relationships),
            _ => {} // Other languages not yet implemented
        }
        
        Ok(relationships)
    }

    /// Extract Rust relationships (uses, imports, calls, extends)
    fn extract_rust_relationships(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        content: &str,
        file_path: &Path,
        symbols: &[UniversalSymbol],
        relationships: &mut Vec<crate::database::models::UniversalRelationship>,
    ) {
        let node = cursor.node();
        
        match node.kind() {
            "use_declaration" => {
                // Extract import relationships
                if let Some(path_node) = self.find_child_of_type(node, "use_as_clause")
                    .or_else(|| self.find_child_of_type(node, "scoped_use_list"))
                    .or_else(|| self.find_child_of_type(node, "identifier")) {
                    
                    if let Ok(import_name) = path_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1, // Will be set later
                            from_symbol_id: None, // Will be resolved later
                            to_symbol_id: None,
                            relationship_type: "imports".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(import_name.to_string()),
                            metadata: Some(serde_json::json!({
                                "import_type": "use",
                                "import_path": import_name
                            }).to_string()),
                            ..Default::default()
                        });
                    }
                }
            }
            "call_expression" => {
                // Extract function call relationships
                if let Some(func_node) = self.find_child_of_type(node, "identifier")
                    .or_else(|| self.find_child_of_type(node, "field_expression")) {
                    
                    if let Ok(func_name) = func_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None, // Current function
                            to_symbol_id: None,   // Called function
                            relationship_type: "calls".to_string(),
                            confidence: 0.9,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(func_name.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            "impl_item" => {
                // Extract trait implementation relationships
                if let Some(trait_node) = self.find_child_of_type(node, "type_identifier") {
                    if let Ok(trait_name) = trait_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "implements".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(trait_name.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            _ => {}
        }
        
        // Recurse through children
        if cursor.goto_first_child() {
            loop {
                self.extract_rust_relationships(cursor, content, file_path, symbols, relationships);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    /// Extract TypeScript/JavaScript relationships
    fn extract_typescript_relationships(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        content: &str,
        file_path: &Path,
        symbols: &[UniversalSymbol],
        relationships: &mut Vec<crate::database::models::UniversalRelationship>,
    ) {
        let node = cursor.node();
        
        match node.kind() {
            "import_statement" => {
                // Extract ES6 imports
                if let Some(source_node) = self.find_child_of_type(node, "string") {
                    if let Ok(import_path) = source_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "imports".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(import_path.trim_matches(|c| c == '"' || c == '\'').to_string()),
                            metadata: Some(serde_json::json!({
                                "import_type": "es6"
                            }).to_string()),
                            ..Default::default()
                        });
                    }
                }
            }
            "call_expression" => {
                // Extract function calls
                if let Some(func_node) = self.find_child_of_type(node, "identifier")
                    .or_else(|| self.find_child_of_type(node, "member_expression")) {
                    
                    if let Ok(func_name) = func_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "calls".to_string(),
                            confidence: 0.9,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(func_name.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            "class_heritage" => {
                // Extract class inheritance
                if let Some(extends_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(parent_class) = extends_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "extends".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(parent_class.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            _ => {}
        }
        
        // Recurse through children
        if cursor.goto_first_child() {
            loop {
                self.extract_typescript_relationships(cursor, content, file_path, symbols, relationships);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    /// Extract Python relationships
    fn extract_python_relationships(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        content: &str,
        file_path: &Path,
        symbols: &[UniversalSymbol],
        relationships: &mut Vec<crate::database::models::UniversalRelationship>,
    ) {
        let node = cursor.node();
        
        match node.kind() {
            "import_statement" | "import_from_statement" => {
                // Extract Python imports
                if let Some(module_node) = self.find_child_of_type(node, "dotted_name")
                    .or_else(|| self.find_child_of_type(node, "identifier")) {
                    
                    if let Ok(import_name) = module_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "imports".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(import_name.to_string()),
                            metadata: Some(serde_json::json!({
                                "import_type": if node.kind() == "import_statement" { "import" } else { "from_import" }
                            }).to_string()),
                            ..Default::default()
                        });
                    }
                }
            }
            "call" => {
                // Extract function calls
                if let Some(func_node) = self.find_child_of_type(node, "identifier")
                    .or_else(|| self.find_child_of_type(node, "attribute")) {
                    
                    if let Ok(func_name) = func_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "calls".to_string(),
                            confidence: 0.9,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(func_name.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            "class_definition" => {
                // Extract class inheritance
                if let Some(args_node) = self.find_child_of_type(node, "argument_list") {
                    // Look for parent classes in the argument list
                    let mut arg_cursor = args_node.walk();
                    if arg_cursor.goto_first_child() {
                        loop {
                            if arg_cursor.node().kind() == "identifier" {
                                if let Ok(parent_class) = arg_cursor.node().utf8_text(content.as_bytes()) {
                                    relationships.push(crate::database::models::UniversalRelationship {
                                        project_id: 0, // Will be set later in index_project
                                        from_symbol_id: None,
                                        to_symbol_id: None,
                                        relationship_type: "extends".to_string(),
                                        confidence: 1.0,
                                        context_line: Some(node.start_position().row as i32 + 1),
                                        context_column: Some(node.start_position().column as i32),
                                        context_snippet: Some(parent_class.to_string()),
                                        metadata: None,
                            ..Default::default()
                                    });
                                }
                            }
                            if !arg_cursor.goto_next_sibling() {
                                break;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        
        // Recurse through children
        if cursor.goto_first_child() {
            loop {
                self.extract_python_relationships(cursor, content, file_path, symbols, relationships);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    /// Extract C++ relationships
    fn extract_cpp_relationships(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        content: &str,
        file_path: &Path,
        symbols: &[UniversalSymbol],
        relationships: &mut Vec<crate::database::models::UniversalRelationship>,
    ) {
        let node = cursor.node();
        
        match node.kind() {
            "preproc_include" => {
                // Extract #include directives
                if let Some(path_node) = self.find_child_of_type(node, "string_literal")
                    .or_else(|| self.find_child_of_type(node, "system_lib_string")) {
                    
                    if let Ok(include_path) = path_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "includes".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(include_path.trim_matches(|c| c == '"' || c == '<' || c == '>').to_string()),
                            metadata: Some(serde_json::json!({
                                "include_type": if include_path.starts_with('<') { "system" } else { "local" }
                            }).to_string()),
                            ..Default::default()
                        });
                    }
                }
            }
            "call_expression" => {
                // Extract function calls
                if let Some(func_node) = self.find_child_of_type(node, "identifier")
                    .or_else(|| self.find_child_of_type(node, "field_expression")) {
                    
                    if let Ok(func_name) = func_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "calls".to_string(),
                            confidence: 0.9,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(func_name.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            "base_class_clause" => {
                // Extract class inheritance
                if let Some(base_node) = self.find_child_of_type(node, "type_identifier") {
                    if let Ok(base_class) = base_node.utf8_text(content.as_bytes()) {
                        relationships.push(crate::database::models::UniversalRelationship {
                            project_id: 1,
                            from_symbol_id: None,
                            to_symbol_id: None,
                            relationship_type: "extends".to_string(),
                            confidence: 1.0,
                            context_line: Some(node.start_position().row as i32 + 1),
                            context_column: Some(node.start_position().column as i32),
                            context_snippet: Some(base_class.to_string()),
                            metadata: None,
                            ..Default::default()
                        });
                    }
                }
            }
            _ => {}
        }
        
        // Recurse through children
        if cursor.goto_first_child() {
            loop {
                self.extract_cpp_relationships(cursor, content, file_path, symbols, relationships);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }
}

/// Internal parse result structure
struct ParseResultInternal {
    symbols: Vec<UniversalSymbol>,
    relationships: Vec<crate::database::models::UniversalRelationship>,
    success: bool,
    errors: Vec<EnhancedParseError>,
    confidence_score: Option<f32>,
    predicted_intent: Option<String>,
    embeddings_generated: bool,
    ml_suggestions: Vec<String>,
}

// Re-export for compatibility with existing code
pub use UnifiedParsingConfig as ParsingConfig;
pub use UnifiedFileParseResult as FileParseResult;
pub use UnifiedParsedProject as ParsedProject;
pub use UnifiedParsingService as ParsingService;