use anyhow::{Result, anyhow};
use std::path::Path;
use std::time::{Instant, SystemTime};
use serde::{Serialize, Deserialize};
use serde_json;
use tokio::fs;
use tree_sitter::{Parser, Tree, Node};
use walkdir::WalkDir;
use tracing::{info, debug, warn};
use sha2::{Sha256, Digest};

use crate::database::{
    project_database::ProjectDatabase,
    models::{UniversalSymbol},
};
use crate::parsers::tree_sitter::Language as ParserLanguage;
use crate::analysis::RelationshipExtractor;
use std::collections::HashMap;
#[cfg(feature = "ml")]
use std::sync::Arc;
#[cfg(feature = "ml")]
use tokio::sync::RwLock;
#[cfg(feature = "ml")]
use dashmap::DashMap;

// ML Integration imports (conditional compilation)
#[cfg(feature = "ml")]
use crate::parsers::tree_sitter::{
    CodeEmbedder, ErrorPredictor, SyntaxPredictor,
    Language as MLLanguage, ComponentReusePredictor,
    UserIntent,
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
    component_reuse_predictor: Arc<RwLock<ComponentReusePredictor>>,
    parse_cache: Arc<DashMap<u64, CachedParseResult>>,
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
    /// Compute hash of file content for caching
    fn compute_file_hash(&self, content: &str) -> String {
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;
        
        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
    
    /// Compute hash of parse tree for caching
    fn compute_tree_hash(&self, tree: &tree_sitter::Tree) -> u64 {
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;
        
        let mut hasher = DefaultHasher::new();
        // Hash tree properties
        tree.root_node().range().start_byte.hash(&mut hasher);
        tree.root_node().range().end_byte.hash(&mut hasher);
        tree.root_node().child_count().hash(&mut hasher);
        hasher.finish()
    }
    
    /// Create a new unified parsing service
    pub async fn new(project_db: ProjectDatabase, config: UnifiedParsingConfig) -> Result<Self> {
        // Initialize global model cache if ML features are enabled
        if config.enable_ml_features {
            use crate::parsers::tree_sitter::initialize_global_cache;
            use std::path::Path;
            
            let models_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("models");
            initialize_global_cache(models_dir).await.unwrap_or_else(|e| {
                tracing::warn!("Failed to initialize global model cache: {}", e);
            });
        }
        
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
    pub async fn parse_project(&self, project_path: &Path, project_name: &str, force_reindex: bool) -> Result<UnifiedParsedProject> {
        let start_time = Instant::now();
        
        // Create or get project in database
        let project = self.project_db.get_or_create_project(
            project_name, 
            project_path.to_string_lossy().as_ref()
        ).await?;
        let project_id = project.id.ok_or_else(|| anyhow::anyhow!("Project creation failed - no ID assigned"))?;
        
        // Clear existing symbols if force reindex is requested
        if force_reindex {
            info!("Force reindex requested, clearing existing symbols for project {}", project_id);
            self.project_db.clear_project_symbols(project_id).await?;
        }
        
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
            
            // Check if file needs to be re-indexed
            if !force_reindex {
                if let Ok(should_skip) = self.should_skip_file(project_id, file_path).await {
                    if should_skip {
                        debug!("Skipping unchanged file: {}", file_path.display());
                        continue;
                    }
                }
            }
            
            let parse_time = Instant::now();
            match self.parse_file(file_path).await {
                Ok(mut result) => {
                    // Update symbols with correct project_id and language_id before storing
                    let actual_project_id = project_id;
                    for symbol in &mut result.symbols {
                        symbol.project_id = actual_project_id;
                        symbol.language_id = self.get_or_create_language_id(&self.detect_language(file_path)?).await?;
                    }
                    
                    // Update relationships with correct project_id
                    for relationship in &mut result.relationships {
                        relationship.project_id = project_id;
                    }
                    
                    // Store symbols and relationships in a transaction
                    tracing::info!("Storing {} symbols and {} relationships for project_id={:?}", 
                        result.symbols.len(), result.relationships.len(), project_id);
                    
                    let (stored_symbols, stored_relationships) = self.project_db.store_parse_results(
                        project_id,
                        &result.symbols,
                        &result.relationships,
                    ).await?;
                    
                    tracing::info!("Successfully stored {} symbols and {} relationships", 
                        stored_symbols.len(), stored_relationships.len());
                    
                    total_symbols += stored_symbols.len() as i32;
                    total_relationships += stored_relationships.len() as i32;
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
                    
                    // Update file index with success
                    let language_id = self.get_or_create_language_id(&self.detect_language(file_path)?).await?;
                    let file_metadata = fs::metadata(file_path).await?;
                    let file_size = file_metadata.len() as i64;
                    let file_hash = self.calculate_file_hash(file_path).await?;
                    
                    self.project_db.update_file_index(
                        project_id,
                        language_id,
                        file_path.to_string_lossy().as_ref(),
                        result.symbols.len() as i32,
                        result.relationships.len() as i32,
                        Some(parse_time.elapsed().as_millis() as i32),
                        None, // No error
                        file_size,
                        &file_hash
                    ).await?;
                }
                Err(e) => {
                    warn!("Failed to parse {}: {}", file_path.display(), e);
                    errors.push(format!("Failed to parse {}: {}", file_path.display(), e));
                    
                    // Update file index with error
                    if let Ok(language_id) = self.get_or_create_language_id(&self.detect_language(file_path).unwrap_or(ParserLanguage::Rust)).await {
                        let file_metadata = fs::metadata(file_path).await.ok();
                        let file_size = file_metadata.map(|m| m.len() as i64).unwrap_or(0);
                        let file_hash = self.calculate_file_hash(file_path).await.unwrap_or_default();
                        
                        let _ = self.project_db.update_file_index(
                            project_id,
                            language_id,
                            file_path.to_string_lossy().as_ref(),
                            0, // No symbols
                            0, // No relationships
                            Some(parse_time.elapsed().as_millis() as i32),
                            Some(&e.to_string()),
                            file_size,
                            &file_hash
                        ).await;
                    }
                }
            }
        }
        
        let parse_duration = start_time.elapsed().as_millis() as u64;
        
        Ok(UnifiedParsedProject {
            project_id,
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
        
        // Check cache first
        let file_hash = self.compute_file_hash(content);
        let file_hash_u64 = file_hash.parse::<u64>().unwrap_or_else(|_| {
            use std::hash::{Hash, Hasher};
            use std::collections::hash_map::DefaultHasher;
            let mut hasher = DefaultHasher::new();
            file_hash.hash(&mut hasher);
            hasher.finish()
        });
        
        // Try to get cached embeddings
        let cached_embeddings = if let Some(cached) = ml_components.parse_cache.get(&file_hash_u64) {
            // Check if cache is still fresh (e.g., within 1 hour)
            if let Ok(elapsed) = cached.timestamp.elapsed() {
                if elapsed.as_secs() < 3600 {
                    tracing::debug!("Using cached parse result for {} (tree_hash: {}, confidence: {})", 
                        file_path.display(), cached.tree_hash, cached.confidence);
                    // Return the embeddings from the cached result
                    Some(cached.embeddings.clone())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };
        
        // Create parser with ML integration
        let mut parser = self.get_cached_parser(language).await?;
        
        // Parse with tree-sitter
        let tree = parser.parse(content, None)
            .ok_or_else(|| anyhow!("Failed to parse code with tree-sitter"))?;
        
        // Check for errors and use ML to predict fixes
        let mut errors = Vec::new();
        let mut ml_suggestions = Vec::new();
        
        if tree.root_node().has_error() {
            // Find error nodes and use ML to predict fixes
            let error_nodes = self.find_error_nodes(&tree.root_node());
            
            for error_node in error_nodes {
                let parse_error = crate::parsers::tree_sitter::ParseError {
                    message: format!("Syntax error at {}:{}", 
                        error_node.start_position().row + 1, 
                        error_node.start_position().column),
                    start_position: tree_sitter::Point {
                        row: error_node.start_position().row,
                        column: error_node.start_position().column,
                    },
                    end_position: tree_sitter::Point {
                        row: error_node.end_position().row,
                        column: error_node.end_position().column,
                    },
                    error_type: self.classify_error_type(&error_node, content),
                    confidence: 0.8,
                    ml_suggestions: Vec::new(),
                };
                
                // Use ML to predict fixes
                let fix_suggestions = ml_components.error_predictor
                    .predict_fixes(&parse_error, content)
                    .await
                    .unwrap_or_default();
                
                // Convert ML suggestions to recovery suggestions
                let recovery_suggestions: Vec<String> = fix_suggestions.iter()
                    .map(|s| format!("{} (confidence: {:.0}%)", s.explanation, s.confidence * 100.0))
                    .collect();
                
                // Add to ML suggestions for display
                for suggestion in &fix_suggestions {
                    ml_suggestions.push(format!(
                        "🔧 {} - {} (learned from: {})",
                        suggestion.suggestion,
                        suggestion.explanation,
                        suggestion.learned_from.as_ref().unwrap_or(&"syntax patterns".to_string())
                    ));
                }
                
                errors.push(EnhancedParseError {
                    message: parse_error.message.clone(),
                    line: error_node.start_position().row as u32,
                    column: error_node.start_position().column as u32,
                    error_type: format!("{:?}", parse_error.error_type),
                    confidence: Some(0.8),
                    recovery_suggestions,
                });
            }
        }
        
        // Generate embeddings if enabled
        let embeddings_generated = if self.config.cache_embeddings {
            match ml_components.code_embedder.generate_embeddings(content, &ml_language).await {
                Ok(embeddings) => {
                    // Cache the parse result with embeddings
                    let cached_result = CachedParseResult {
                        tree_hash: self.compute_tree_hash(&tree),
                        confidence: 0.95, // High confidence for successful parse
                        embeddings,
                        timestamp: std::time::SystemTime::now(),
                    };
                    ml_components.parse_cache.insert(file_hash_u64, cached_result);
                    
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
        let symbols = self.extract_symbols_enhanced(&tree, content, file_path, language, &ml_components, cached_embeddings.as_ref()).await?;
        
        // Predict intent if possible
        let predicted_intent = ml_components.syntax_predictor
            .predict_intent(content, &ml_language)
            .await
            .ok()
            .map(|intent| format!("{:?}", intent));
        
        // Analyze code quality using ML
        let quality_issues = ml_components.error_predictor
            .analyze_code_quality(&tree, content)
            .await
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to analyze code quality: {}", e);
                Vec::new()
            });
        
        // Convert quality issues to ML suggestions
        for issue in &quality_issues {
            ml_suggestions.push(format!(
                "{} (line {}, {})\n  Suggested: {}",
                issue.description,
                issue.position.row + 1,
                issue.severity,
                issue.suggested_refactoring.join(", ")
            ));
            
            // Add as enhanced error if severity is high
            if issue.severity == "high" {
                errors.push(EnhancedParseError {
                    message: issue.description.clone(),
                    line: issue.position.row as u32,
                    column: issue.position.column as u32,
                    error_type: issue.category.clone(),
                    confidence: Some(issue.confidence),
                    recovery_suggestions: issue.suggested_refactoring.clone(),
                });
            }
        }
        
        // Check for component reuse opportunities based on the parsed code intent
        if let Some(intent_str) = &predicted_intent {
            // Create a UserIntent from the predicted intent
            let user_intent = UserIntent {
                functionality_category: self.extract_functionality_category(intent_str),
                required_capabilities: self.extract_capabilities(content),
                context_description: format!("File: {}", file_path.display()),
            };
            
            let predictor = ml_components.component_reuse_predictor.read().await;
            let reuse_recommendations = predictor.predict_component_reuse(&user_intent);
            
            // Add reuse recommendations to ML suggestions
            for recommendation in reuse_recommendations.iter().take(3) {
                ml_suggestions.push(format!(
                    "🔄 Consider reusing: {} ({}% match)\n  {}",
                    recommendation.component_signature.functionality_category,
                    (recommendation.relevance_score * 100.0) as i32,
                    recommendation.suggested_usage
                ));
            }
        }
        
        // Calculate confidence score based on quality analysis
        let confidence_score = if tree.root_node().has_error() {
            Some(0.5) // Lower confidence for error trees
        } else if quality_issues.iter().any(|i| i.severity == "high") {
            Some(0.7) // Medium confidence if high severity issues
        } else if !quality_issues.is_empty() {
            Some(0.8) // Slightly lower if any issues
        } else {
            Some(0.9) // High confidence for clean parses
        };
        
        // Extract relationships between symbols
        debug!("Extracting relationships for {} symbols", symbols.len());
        let relationships = self.extract_relationships(
            &tree,
            content,
            file_path,
            language,
            &symbols
        )?;
        debug!("Extracted {} relationships", relationships.len());
        
        Ok(ParseResultInternal {
            symbols,
            relationships,
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
        
        // Create new ML components - CodeEmbedder will use global cache
        tracing::debug!("Creating ML components for language: {:?}", language);
        let syntax_predictor = Arc::new(SyntaxPredictor::load(*language).await?);
        let code_embedder = Arc::new(CodeEmbedder::load(language).await?);
        let error_predictor = Arc::new(ErrorPredictor::load(*language).await?);
        let component_reuse_predictor = Arc::new(RwLock::new(ComponentReusePredictor::new()));
        
        let components = MLComponents {
            syntax_predictor,
            code_embedder,
            error_predictor,
            component_reuse_predictor,
            parse_cache: Arc::new(DashMap::new()),
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
        ml_components: &MLComponents,
        cached_embeddings: Option<&Vec<f32>>,
    ) -> Result<Vec<UniversalSymbol>> {
        // Extract symbols normally
        let symbols = self.extract_symbols_basic(tree, content, file_path, language).await?;
        
        // Index the symbols for component reuse analysis
        {
            let mut predictor = ml_components.component_reuse_predictor.write().await;
            
            // If we have cached embeddings, distribute them to symbols
            let embedding_chunks = if let Some(embeddings) = cached_embeddings {
                // Split embeddings into chunks for each symbol
                let chunk_size = embeddings.len() / symbols.len().max(1);
                Some((embeddings, chunk_size))
            } else {
                None
            };
            
            let symbols_for_analysis: Vec<crate::parsers::tree_sitter::Symbol> = symbols.iter().enumerate().map(|(idx, s)| {
                // Extract embedding chunk for this symbol if available
                let symbol_embedding = if let Some((embeddings, chunk_size)) = &embedding_chunks {
                    let start = idx * chunk_size;
                    let end = ((idx + 1) * chunk_size).min(embeddings.len());
                    if start < embeddings.len() {
                        Some(embeddings[start..end].to_vec())
                    } else {
                        None
                    }
                } else {
                    None
                };
                
                crate::parsers::tree_sitter::Symbol {
                    id: s.qualified_name.clone(),
                    name: s.name.clone(),
                    signature: s.signature.clone().unwrap_or_default(),
                    language: *language,
                    file_path: s.file_path.clone(),
                    start_line: s.line as u32,
                    end_line: s.end_line.unwrap_or(s.line) as u32,
                    embedding: symbol_embedding,
                    semantic_hash: None,
                    normalized_name: s.name.to_lowercase(),
                    context_embedding: cached_embeddings.map(|_| vec![0.0; 128]), // Placeholder context embedding
                    duplicate_of: None,
                    confidence_score: Some(s.confidence as f32),
                    similar_symbols: vec![],
                    semantic_tags: s.semantic_tags.clone().and_then(|tags| serde_json::from_str(&tags).ok()),
                    intent: s.intent.clone(),
                }
            }).collect();
            
            if cached_embeddings.is_some() {
                tracing::info!("Applied cached embeddings to {} symbols", symbols_for_analysis.len());
            }
            
            predictor.index_existing_components(&symbols_for_analysis);
        }
        
        Ok(symbols)
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
        
        debug!("Extracting symbols for {} file: {}", language, file_path.display());
        
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

    /// Parse content directly without reading from file
    pub async fn parse_content(&self, content: &str, file_path: &Path) -> Result<tree_sitter::Tree> {
        let language = self.detect_language(file_path)?;
        let mut parser = self.get_cached_parser(&language).await?;
        
        parser.parse(content, None)
            .ok_or_else(|| anyhow!("Failed to parse content"))
    }

    pub fn detect_language(&self, file_path: &Path) -> Result<ParserLanguage> {
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

    pub fn find_source_files(&self, project_path: &Path) -> Result<Vec<std::path::PathBuf>> {
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

    /// Check if a file should be skipped based on modification time and hash
    async fn should_skip_file(&self, project_id: i32, file_path: &Path) -> Result<bool> {
        // Get file metadata
        let metadata = fs::metadata(file_path).await?;
        let modified_time = metadata.modified()?;
        
        // Check if we have an existing file index
        if let Some(file_index) = self.project_db.get_file_index(project_id, file_path.to_string_lossy().as_ref()).await? {
            // If the file was successfully indexed and hasn't been modified since
            if file_index.is_indexed && !file_index.has_errors {
                // Parse the updated_at timestamp
                if let Ok(last_indexed) = chrono::DateTime::parse_from_rfc3339(&file_index.updated_at) {
                    let last_indexed_time = SystemTime::UNIX_EPOCH + 
                        std::time::Duration::from_secs(last_indexed.timestamp() as u64);
                    
                    // If file hasn't been modified since last index, skip it
                    // Add a small tolerance (1 second) to handle timing precision issues
                    let tolerance = std::time::Duration::from_secs(1);
                    if modified_time <= last_indexed_time + tolerance {
                        debug!("Skipping unchanged file: {} (modified: {:?}, indexed: {:?})", 
                            file_path.display(), modified_time, last_indexed_time);
                        return Ok(true);
                    }
                }
            }
        }
        
        Ok(false)
    }

    /// Calculate SHA256 hash of a file
    async fn calculate_file_hash(&self, file_path: &Path) -> Result<String> {
        let content = fs::read(file_path).await?;
        let mut hasher = Sha256::new();
        hasher.update(&content);
        let result = hasher.finalize();
        Ok(format!("{:x}", result))
    }
    
    /// Get or create language ID for foreign key relationships
    pub async fn get_or_create_language_id(&self, language: &ParserLanguage) -> Result<i32> {
        use crate::database::{orm::QueryBuilder, models::Language};
        
        // Get language name and metadata
        let (name, display_name, extensions) = match language {
            ParserLanguage::Rust => ("rust", "Rust", vec![".rs"]),
            ParserLanguage::Python => ("python", "Python", vec![".py", ".pyi"]),
            ParserLanguage::TypeScript => ("typescript", "TypeScript", vec![".ts", ".tsx"]),
            ParserLanguage::JavaScript => ("javascript", "JavaScript", vec![".js", ".jsx", ".mjs"]),
            ParserLanguage::Cpp => ("cpp", "C++", vec![".cpp", ".cc", ".cxx", ".hpp", ".h"]),
            ParserLanguage::Go => ("go", "Go", vec![".go"]),
            ParserLanguage::CSharp => ("csharp", "C#", vec![".cs"]),
            ParserLanguage::Java => ("java", "Java", vec![".java"]),
        };
        
        // First, try to find existing language
        let existing_languages = self.project_db.db().find_all(
            QueryBuilder::<Language>::new()
                .where_eq("name", name)
                .limit(1)
        ).await?;
        
        if let Some(existing) = existing_languages.first() {
            // Return existing language ID
            Ok(existing.id.unwrap())
        } else {
            // Create new language entry
            let language_model = Language {
                id: None,
                name: name.to_string(),
                display_name: display_name.to_string(),
                version: None,
                parser_class: format!("tree_sitter::{}", name),
                extensions: serde_json::to_string(&extensions).unwrap_or_else(|_| "[]".to_string()),
                features: None,
                is_enabled: true,
                priority: 100,
            };
            
            let inserted = self.project_db.db().insert(language_model).await?;
            Ok(inserted.id.unwrap())
        }
    }

    // Symbol extraction methods (from existing parsing_service.rs)
    fn extract_rust_symbols(&self, cursor: &mut tree_sitter::TreeCursor, content: &str, file_path: &Path, language_id: i32, symbols: &mut Vec<UniversalSymbol>) {
        let node = cursor.node();
        
        match node.kind() {
            "function_item" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        let signature = self.build_function_signature(node, content);
                        let return_type = self.extract_rust_return_type(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "function".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(signature),
                            return_type,
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
                        let return_type = self.extract_python_return_type(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "function".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(signature),
                            return_type,
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
        
        // Debug logging
        if matches!(node.kind(), "function_declaration" | "method_definition" | "class_declaration" | "interface_declaration" | "variable_declaration") {
            debug!("TypeScript: Found node kind '{}' at line {}", node.kind(), node.start_position().row + 1);
        }
        
        match node.kind() {
            "function_declaration" | "method_definition" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        debug!("TypeScript: Found function '{}'", name);
                        let signature = self.build_function_signature(node, content);
                        let return_type = self.extract_typescript_return_type(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                            kind: "function".to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(signature),
                            return_type,
                            language_id,
                            project_id: 0, // Will be set later in index_project
                            ..Default::default()
                        });
                    }
                }
            }
            "class_declaration" => {
                if let Some(name_node) = self.find_child_of_type(node, "identifier") {
                    if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                        debug!("TypeScript: Found class '{}'", name);
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
                        
                        let return_type = self.extract_cpp_return_type(node, content);
                        symbols.push(UniversalSymbol {
                            name: name.to_string(),
                            qualified_name,
                            kind: kind.to_string(),
                            file_path: file_path.to_string_lossy().to_string(),
                            line: node.start_position().row as i32 + 1,
                            column: node.start_position().column as i32,
                            end_line: Some(node.end_position().row as i32 + 1),
                            signature: Some(self.get_function_signature(node, content)),
                            return_type,
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

    /// Extract return type from TypeScript/JavaScript function signature
    fn extract_typescript_return_type(&self, node: Node, content: &str) -> Option<String> {
        // For now, let's use a simpler approach - extract from the signature
        // This is more reliable than trying to navigate the AST
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            // Look for function declaration pattern: "function name(...): Type"
            // or method pattern: "name(...): Type"
            if let Some(paren_close) = text.rfind(')') {
                let after_params = &text[paren_close + 1..];
                // Look for the colon that indicates a return type
                if let Some(colon_pos) = after_params.find(':') {
                    let return_type_part = &after_params[colon_pos + 1..];
                    // Take everything until the opening brace or end
                    let return_type = if let Some(brace_pos) = return_type_part.find('{') {
                        &return_type_part[..brace_pos]
                    } else {
                        return_type_part
                    };
                    
                    let clean_type = return_type.trim();
                    if !clean_type.is_empty() {
                        return Some(clean_type.to_string());
                    }
                }
            }
        }
        
        None
    }

    /// Extract return type from Rust function signature
    fn extract_rust_return_type(&self, node: Node, content: &str) -> Option<String> {
        // Look for return_type child node (after ->)
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                if child.kind() == "->" {
                    // The next node should be the return type
                    if let Some(type_node) = node.child(i + 1) {
                        if let Ok(return_type) = type_node.utf8_text(content.as_bytes()) {
                            return Some(return_type.trim().to_string());
                        }
                    }
                }
            }
        }
        
        // Alternative: look for the pattern in signature
        if let Ok(signature) = node.utf8_text(content.as_bytes()) {
            if let Some(arrow_pos) = signature.find("->") {
                let after_arrow = &signature[arrow_pos + 2..];
                // Take until opening brace or end of line
                let return_type = if let Some(brace_pos) = after_arrow.find('{') {
                    &after_arrow[..brace_pos]
                } else {
                    after_arrow.lines().next().unwrap_or(after_arrow)
                };
                return Some(return_type.trim().to_string());
            }
        }
        
        None
    }

    /// Extract return type from Python function signature
    fn extract_python_return_type(&self, node: Node, content: &str) -> Option<String> {
        // Python uses -> for return type annotations
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            // Look for pattern: "def name(...) -> Type:"
            if let Some(arrow_pos) = text.find("->") {
                let after_arrow = &text[arrow_pos + 2..];
                // Take everything until the colon
                let return_type = if let Some(colon_pos) = after_arrow.find(':') {
                    &after_arrow[..colon_pos]
                } else {
                    after_arrow
                };
                
                let clean_type = return_type.trim();
                if !clean_type.is_empty() {
                    return Some(clean_type.to_string());
                }
            }
        }
        
        None
    }

    /// Extract return type from C++ function signature
    fn extract_cpp_return_type(&self, node: Node, content: &str) -> Option<String> {
        // In C++, return type comes before the function name
        // Look for type_identifier or primitive_type before function_declarator
        if let Some(parent) = node.parent() {
            for i in 0..parent.child_count() {
                if let Some(child) = parent.child(i) {
                    if child.id() == node.id() {
                        // Found the function declarator, check previous siblings for type
                        if i > 0 {
                            if let Some(type_node) = parent.child(i - 1) {
                                match type_node.kind() {
                                    "type_identifier" | "primitive_type" | "template_type" |
                                    "qualified_identifier" | "sized_type_specifier" => {
                                        if let Ok(return_type) = type_node.utf8_text(content.as_bytes()) {
                                            return Some(return_type.trim().to_string());
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
        
        None
    }

    /// Extract relationships between symbols using qualified names as placeholders
    fn extract_relationships(
        &self,
        tree: &Tree,
        content: &str,
        file_path: &Path,
        _language: &ParserLanguage,
        symbols: &[UniversalSymbol],
    ) -> Result<Vec<crate::database::models::UniversalRelationship>> {
        // Create a map of symbol names to their qualified names for relationship tracking
        // We'll resolve the actual database IDs later after symbols are stored
        let mut symbol_map: HashMap<String, i32> = HashMap::new();
        for (index, symbol) in symbols.iter().enumerate() {
            // Use a placeholder ID based on the symbol's position in the array
            symbol_map.insert(symbol.name.clone(), -(index as i32 + 1));
            symbol_map.insert(symbol.qualified_name.clone(), -(index as i32 + 1));
        }
        
        // Use the proper RelationshipExtractor
        // Get project_id from the first symbol if available, otherwise use 0
        let project_id = symbols.iter()
            .find_map(|s| Some(s.project_id))
            .unwrap_or(0);
        
        let extractor = RelationshipExtractor::new(project_id);
        let relationships = extractor.extract_from_ast(tree, content, file_path.to_str().unwrap_or(""), &symbol_map);
        
        Ok(relationships)
    }

    /* DEPRECATED: Using RelationshipExtractor instead
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
                            project_id: 0, // Will be set later
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
                            project_id: 0,
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
    */

    /// Extract function calls with parameter information for data flow analysis
    pub fn extract_function_calls_with_params(&self, 
        cursor: &mut tree_sitter::TreeCursor, 
        content: &str, 
        _file_path: &Path,
        data_flow_analyzer: &mut crate::analysis::DataFlowAnalyzer,
        current_function: Option<&str>
    ) {
        let node = cursor.node();
        let caller = current_function.unwrap_or("global");
        
        match node.kind() {
            "call_expression" => {
                if let Some((callee, args)) = self.extract_call_info(node, content) {
                    let arg_infos = self.extract_argument_info(&args, content);
                    
                    data_flow_analyzer.track_function_call(
                        caller,
                        &callee,
                        arg_infos,
                        &_file_path.to_string_lossy(),
                        node.start_position().row as u32 + 1,
                    );
                }
            }
            "function_declaration" | "method_definition" | "function_definition" => {
                // Track we're inside a function
                let func_name = self.extract_function_name_for_analysis(node, content);
                
                if cursor.goto_first_child() {
                    loop {
                        self.extract_function_calls_with_params(
                            cursor, 
                            content, 
                            _file_path, 
                            data_flow_analyzer,
                            func_name.as_deref()
                        );
                        if !cursor.goto_next_sibling() {
                            break;
                        }
                    }
                    cursor.goto_parent();
                }
                return;
            }
            _ => {}
        }
        
        // Recurse through children
        if cursor.goto_first_child() {
            loop {
                self.extract_function_calls_with_params(
                    cursor, 
                    content, 
                    _file_path, 
                    data_flow_analyzer,
                    current_function
                );
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    /// Extract call information (callee name and arguments node)
    fn extract_call_info<'a>(&self, node: Node<'a>, content: &str) -> Option<(String, Node<'a>)> {
        let function_node = self.find_child_of_type(node, "identifier")
            .or_else(|| self.find_child_of_type(node, "member_expression"))?;
        
        let callee = function_node.utf8_text(content.as_bytes()).ok()?;
        let args_node = self.find_child_of_type(node, "arguments")?;
        
        Some((callee.to_string(), args_node))
    }

    /// Extract argument information from arguments node
    fn extract_argument_info(&self, args_node: &Node, content: &str) -> Vec<crate::analysis::data_flow_analyzer::ArgumentInfo> {
        let mut arg_infos = Vec::new();
        let mut cursor = args_node.walk();
        
        if cursor.goto_first_child() {
            loop {
                let node = cursor.node();
                
                // Skip parentheses and commas
                if matches!(node.kind(), "(" | ")" | ",") {
                    if !cursor.goto_next_sibling() {
                        break;
                    }
                    continue;
                }
                
                // Extract argument info
                if let Some(arg_info) = self.analyze_argument(node, content) {
                    arg_infos.push(arg_info);
                }
                
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }
        
        arg_infos
    }

    /// Analyze a single argument to extract type and pattern information
    fn analyze_argument(&self, node: Node, content: &str) -> Option<crate::analysis::data_flow_analyzer::ArgumentInfo> {
        use crate::analysis::data_flow_analyzer::ArgumentInfo;
        
        let node_text = node.utf8_text(content.as_bytes()).ok()?;
        
        // Determine argument type and pattern
        let (value_type, value_pattern) = match node.kind() {
            "string" | "string_literal" => {
                ("string".to_string(), format!("string: \"{}\"", node_text.trim_matches(|c| c == '"' || c == '\'')))
            }
            "number" | "integer" => {
                ("number".to_string(), format!("number: {}", node_text))
            }
            "true" | "false" => {
                ("boolean".to_string(), format!("boolean: {}", node_text))
            }
            "object" => {
                // Analyze object for keys
                let keys = self.extract_object_keys(node, content);
                let pattern = if keys.is_empty() {
                    "dict empty".to_string()
                } else {
                    format!("dict with key {}", keys.join(", "))
                };
                ("dict".to_string(), pattern)
            }
            "array" => {
                let length = self.count_array_elements(node);
                ("array".to_string(), format!("array with {} elements", length))
            }
            "identifier" => {
                // Variable reference
                ("variable".to_string(), format!("variable: {}", node_text))
            }
            _ => {
                ("unknown".to_string(), format!("complex: {}", node.kind()))
            }
        };
        
        // For now, we'll use a generic param name
        // In a real implementation, we'd match this with function signatures
        Some(ArgumentInfo {
            param_name: "param".to_string(),
            value_type,
            value_pattern,
        })
    }

    /// Extract keys from an object literal
    fn extract_object_keys(&self, node: Node, content: &str) -> Vec<String> {
        let mut keys = Vec::new();
        let mut cursor = node.walk();
        
        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                
                // Look for property nodes
                if child.kind() == "property" || child.kind() == "pair" {
                    // Find the key (identifier or string)
                    if let Some(key_node) = self.find_child_of_type(child, "property_identifier")
                        .or_else(|| self.find_child_of_type(child, "identifier"))
                        .or_else(|| self.find_child_of_type(child, "string")) {
                        
                        if let Ok(key) = key_node.utf8_text(content.as_bytes()) {
                            let clean_key = key.trim_matches(|c| c == '"' || c == '\'');
                            keys.push(format!("'{}'", clean_key));
                        }
                    }
                }
                
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }
        
        keys
    }

    /// Count elements in an array
    fn count_array_elements(&self, node: Node) -> usize {
        let mut count = 0;
        let mut cursor = node.walk();
        
        if cursor.goto_first_child() {
            loop {
                let child = cursor.node();
                // Skip brackets and commas
                if !matches!(child.kind(), "[" | "]" | ",") {
                    count += 1;
                }
                
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
        }
        
        count
    }

    /// Find all error nodes in the tree
    fn find_error_nodes<'a>(&self, node: &Node<'a>) -> Vec<Node<'a>> {
        let mut error_nodes = Vec::new();
        let mut cursor = node.walk();
        
        fn find_errors_recursive<'a>(cursor: &mut tree_sitter::TreeCursor<'a>, errors: &mut Vec<Node<'a>>) {
            let node = cursor.node();
            if node.is_error() || node.kind() == "ERROR" || node.has_error() {
                errors.push(node);
            }
            
            if cursor.goto_first_child() {
                loop {
                    find_errors_recursive(cursor, errors);
                    if !cursor.goto_next_sibling() {
                        break;
                    }
                }
                cursor.goto_parent();
            }
        }
        
        find_errors_recursive(&mut cursor, &mut error_nodes);
        error_nodes
    }
    
    /// Classify error type based on context
    fn classify_error_type(&self, node: &Node, content: &str) -> crate::parsers::tree_sitter::ErrorType {
        use crate::parsers::tree_sitter::ErrorType;
        
        // Look at parent and siblings to determine error type
        if let Some(parent) = node.parent() {
            match parent.kind() {
                "function_declaration" | "function_definition" => {
                    // Check if it's a missing parenthesis or brace
                    if let Ok(text) = parent.utf8_text(content.as_bytes()) {
                        if text.matches('(').count() != text.matches(')').count() {
                            return ErrorType::MissingToken(")".to_string());
                        }
                        if text.matches('{').count() != text.matches('}').count() {
                            return ErrorType::MissingToken("}".to_string());
                        }
                    }
                }
                "call_expression" => {
                    return ErrorType::MissingToken(")".to_string());
                }
                _ => {}
            }
        }
        
        // Check the error node itself
        if let Ok(text) = node.utf8_text(content.as_bytes()) {
            if text.trim().is_empty() {
                return ErrorType::MissingToken("token".to_string());
            } else {
                return ErrorType::UnexpectedToken(text.to_string());
            }
        }
        
        ErrorType::UnknownError("Parse error".to_string())
    }
    
    /// Extract function name for analysis context
    fn extract_function_name_for_analysis(&self, node: Node, content: &str) -> Option<String> {
        // Try various ways to find the function name
        if let Some(name_node) = self.find_child_of_type(node, "identifier")
            .or_else(|| self.find_child_of_type(node, "property_identifier")) {
            
            if let Ok(name) = name_node.utf8_text(content.as_bytes()) {
                return Some(name.to_string());
            }
        }
        
        // For methods, try to get the method name from the signature
        if let Ok(sig) = node.utf8_text(content.as_bytes()) {
            // Extract name from signature (crude but works for many cases)
            if let Some(name) = sig.split_whitespace()
                .find(|s| !s.starts_with('(') && !s.starts_with('{') && s.len() > 1) {
                return Some(name.to_string());
            }
        }
        
        None
    }
    
    /// Extract functionality category from intent string
    #[cfg(feature = "ml")]
    fn extract_functionality_category(&self, intent: &str) -> String {
        let intent_lower = intent.to_lowercase();
        if intent_lower.contains("database") || intent_lower.contains("query") {
            "database".to_string()
        } else if intent_lower.contains("log") || intent_lower.contains("debug") {
            "logging".to_string()
        } else if intent_lower.contains("http") || intent_lower.contains("request") {
            "http_client".to_string()
        } else if intent_lower.contains("auth") || intent_lower.contains("token") {
            "authentication".to_string()
        } else if intent_lower.contains("file") || intent_lower.contains("parse") {
            "file_processing".to_string()
        } else {
            "general".to_string()
        }
    }
    
    /// Extract capabilities from code content
    #[cfg(feature = "ml")]
    fn extract_capabilities(&self, content: &str) -> Vec<String> {
        let mut capabilities = Vec::new();
        let content_lower = content.to_lowercase();
        
        // Simple keyword-based capability extraction
        if content_lower.contains("async") || content_lower.contains("await") {
            capabilities.push("async".to_string());
        }
        if content_lower.contains("error") || content_lower.contains("result") {
            capabilities.push("error_handling".to_string());
        }
        if content_lower.contains("test") || content_lower.contains("assert") {
            capabilities.push("testing".to_string());
        }
        if content_lower.contains("config") || content_lower.contains("settings") {
            capabilities.push("configurable".to_string());
        }
        if content_lower.contains("stream") || content_lower.contains("buffer") {
            capabilities.push("streaming".to_string());
        }
        
        capabilities
    }
    
    /// Record a user fix for ML training
    #[cfg(feature = "ml")]
    pub async fn record_user_fix(
        &self,
        file_path: &Path,
        error_position: tree_sitter::Point,
        original_code: &str,
        fixed_code: &str,
    ) -> Result<()> {
        let language = self.detect_language(file_path)?;
        let ml_language = self.convert_to_ml_language(&language)?;
        let ml_components = self.get_or_create_ml_components(&ml_language).await?;
        
        // Parse the original code to find the error
        let mut parser = self.get_cached_parser(&language).await?;
        if let Some(tree) = parser.parse(original_code, None) {
            // Find the error node at the given position
            let error_nodes = self.find_error_nodes(&tree.root_node());
            
            for error_node in error_nodes {
                if error_node.start_position().row == error_position.row &&
                   error_node.start_position().column == error_position.column {
                    
                    // Create ParseError for the ML system
                    let parse_error = crate::parsers::tree_sitter::ParseError {
                        message: format!("Error at {}:{}", error_position.row + 1, error_position.column),
                        start_position: error_position,
                        end_position: error_node.end_position(),
                        error_type: self.classify_error_type(&error_node, original_code),
                        confidence: 0.8,
                        ml_suggestions: vec![],
                    };
                    
                    // Extract the fix from the diff
                    let fix = self.extract_fix_from_diff(original_code, fixed_code, error_position);
                    
                    // Train the error predictor with this example
                    ml_components.error_predictor
                        .add_training_example(&parse_error, &fix)
                        .await?;
                    
                    tracing::info!("Recorded user fix for ML training: {} -> {}", 
                        parse_error.message, fix);
                    break;
                }
            }
        }
        
        Ok(())
    }
    
    /// Extract the fix from the code diff
    #[cfg(feature = "ml")]
    fn extract_fix_from_diff(
        &self, 
        original: &str, 
        fixed: &str, 
        error_position: tree_sitter::Point
    ) -> String {
        let original_lines: Vec<&str> = original.lines().collect();
        let fixed_lines: Vec<&str> = fixed.lines().collect();
        
        // Find the changed line
        if error_position.row < original_lines.len() && error_position.row < fixed_lines.len() {
            let original_line = original_lines[error_position.row];
            let fixed_line = fixed_lines[error_position.row];
            
            if original_line != fixed_line {
                return fixed_line.to_string();
            }
        }
        
        // If line didn't change, look for nearby changes
        for (i, (orig, fix)) in original_lines.iter().zip(fixed_lines.iter()).enumerate() {
            if orig != fix {
                return format!("Line {}: {}", i + 1, fix);
            }
        }
        
        // Default to showing the fixed code snippet
        fixed.to_string()
    }
    
    /// Get model cache statistics (useful for monitoring)
    pub async fn get_model_cache_stats(&self) -> Result<String> {
        if !self.config.enable_ml_features {
            return Ok("ML features disabled - no model cache".to_string());
        }
        
        use crate::parsers::tree_sitter::get_cache_stats;
        let stats = get_cache_stats().await;
        
        Ok(format!(
            "Model Cache Stats: {} models cached, Feature enabled: {}, Loaded models: {:?}",
            stats.cached_models_count,
            stats.feature_enabled,
            stats.loaded_models
        ))
    }
    
    /// Get detailed relationship statistics for a project
    pub async fn get_relationship_stats(&self, project_id: i32) -> Result<String> {
        use std::collections::HashMap;
        
        // Get all relationships for the project
        let relationships = self.project_db.get_all_relationships(project_id).await?;
        
        // Count by relationship type  
        let mut type_counts: HashMap<String, i32> = HashMap::new();
        for relationship in &relationships {
            *type_counts.entry(relationship.relationship_type.clone()).or_insert(0) += 1;
        }
        
        let mut stats = format!("Relationship Stats (project {}): {} total relationships\n", 
                               project_id, relationships.len());
        
        for (rel_type, count) in type_counts.iter() {
            stats.push_str(&format!("  {}: {}\n", rel_type, count));
        }
        
        Ok(stats)
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