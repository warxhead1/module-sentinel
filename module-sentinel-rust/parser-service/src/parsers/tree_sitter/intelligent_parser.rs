use anyhow::Result;
use tree_sitter::{Parser, Tree, Node, Point};
use dashmap::DashMap;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;
use super::language::Language;
use super::error_recovery::{ErrorRecoveryEngine, RecoverySuggestion};
use super::ml_integration::{SyntaxPredictor, CodeEmbedder, ErrorPredictor, IntentFeatures, EmbeddingStats};
// use crate::ast::UniversalAst; // TODO: Use when converting to UniversalAst

/// Intelligent Tree-Sitter parser with ML integration
pub struct IntelligentTreeSitterParser {
    parser: Parser,
    language: Language,
    error_recovery: ErrorRecoveryEngine,
    syntax_predictor: Arc<SyntaxPredictor>,
    code_embedder: Arc<CodeEmbedder>,
    error_predictor: Arc<ErrorPredictor>,
    // Cache for parse results and embeddings
    parse_cache: Arc<DashMap<u64, CachedParseResult>>,
    embedding_cache: Arc<DashMap<String, Vec<f32>>>,
    // Historical data for learning
    error_history: Arc<RwLock<ErrorHistory>>,
}

#[derive(Debug, Clone)]
pub struct IntelligentParseResult {
    pub tree: Tree,
    pub errors: Vec<ParseError>,
    pub recovery_suggestions: Vec<RecoverySuggestion>,
    pub confidence_score: f32,
    pub embeddings: SymbolEmbeddings,
    pub predicted_intent: Option<CodeIntent>,
}

#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub start_position: Point,
    pub end_position: Point,
    pub error_type: ErrorType,
    pub confidence: f32,
    pub ml_suggestions: Vec<MLSuggestion>,
}

#[derive(Debug, Clone)]
pub enum ErrorType {
    SyntaxError,
    MissingToken(String),
    UnexpectedToken(String),
    IncompleteConstruct(String),
    SemanticError(String),
}

#[derive(Debug, Clone)]
pub struct MLSuggestion {
    pub suggestion: String,
    pub confidence: f32,
    pub explanation: String,
    pub learned_from: Option<String>, // Reference to similar historical fix
}

#[derive(Debug, Clone)]
pub struct SymbolEmbeddings {
    pub function_embeddings: Vec<(String, Vec<f32>)>,
    pub class_embeddings: Vec<(String, Vec<f32>)>,
    pub similarity_matrix: Option<Vec<Vec<f32>>>,
}

#[derive(Debug, Clone)]
pub enum CodeIntent {
    FunctionDefinition(String),
    ClassDefinition(String),
    ImportStatement(String),
    ControlFlow(String),
    DataStructure(String),
}

#[derive(Debug, Clone)]
struct CachedParseResult {
    tree: Tree,
    embeddings: SymbolEmbeddings,
    timestamp: std::time::Instant,
}

#[derive(Debug, Default)]
struct ErrorHistory {
    successful_recoveries: Vec<SuccessfulRecovery>,
    failed_attempts: Vec<FailedAttempt>,
}

#[derive(Debug, Clone)]
struct SuccessfulRecovery {
    error_context: String,
    fix_applied: String,
    confidence: f32,
    timestamp: std::time::SystemTime,
}

#[derive(Debug, Clone)]
struct FailedAttempt {
    error_context: String,
    attempted_fix: String,
    failure_reason: String,
    timestamp: std::time::SystemTime,
}

impl IntelligentTreeSitterParser {
    pub async fn new(language: Language) -> Result<Self> {
        let mut parser = Parser::new();
        parser.set_language(&language.tree_sitter_language())?;
        
        // Load ML models
        let syntax_predictor = Arc::new(SyntaxPredictor::load(&language).await?);
        let code_embedder = Arc::new(CodeEmbedder::load(&language).await?);
        let error_predictor = Arc::new(ErrorPredictor::load(&language).await?);
        
        Ok(Self {
            parser,
            language,
            error_recovery: ErrorRecoveryEngine::new(),
            syntax_predictor,
            code_embedder,
            error_predictor,
            parse_cache: Arc::new(DashMap::new()),
            embedding_cache: Arc::new(DashMap::new()),
            error_history: Arc::new(RwLock::new(ErrorHistory::default())),
        })
    }
    
    pub async fn parse_with_intelligence(&mut self, code: &str) -> Result<IntelligentParseResult> {
        // Check cache first
        let code_hash = self.hash_code(code);
        if let Some(cached) = self.parse_cache.get(&code_hash) {
            if cached.timestamp.elapsed().as_secs() < 60 {
                let tree = cached.tree.clone();
                let embeddings = cached.embeddings.clone();
                drop(cached); // Release the lock
                return self.create_result_from_cache_data(tree, embeddings, code).await;
            }
        }
        
        // Parse the code
        let tree = self.parser
            .parse(code, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse code"))?;
        
        // Perform intelligent error detection
        let errors = self.detect_errors_with_ml(&tree, code).await?;
        
        // Generate ML-powered recovery suggestions
        let recovery_suggestions = self.generate_ml_suggestions(&errors, code).await?;
        
        // Generate embeddings for symbols
        let embeddings = self.generate_embeddings(&tree, code).await?;
        
        // Predict code intent
        let predicted_intent = self.predict_intent(&tree, code, &embeddings).await?;
        
        // Calculate overall confidence
        let confidence_score = self.calculate_confidence(&tree, &errors, &embeddings);
        
        // Cache the result
        self.cache_result(code_hash, &tree, &embeddings);
        
        Ok(IntelligentParseResult {
            tree,
            errors,
            recovery_suggestions,
            confidence_score,
            embeddings,
            predicted_intent,
        })
    }
    
    async fn detect_errors_with_ml(&self, tree: &Tree, code: &str) -> Result<Vec<ParseError>> {
        let mut errors = Vec::new();
        let mut cursor = tree.walk();
        
        // Traditional error detection
        self.find_syntax_errors(&mut cursor, code, &mut errors);
        
        // ML-based error detection
        let ml_errors = self.predict_potential_errors(tree, code).await?;
        errors.extend(ml_errors);
        
        // Learn from history
        self.apply_historical_patterns(&mut errors, code).await?;
        
        Ok(errors)
    }
    
    async fn generate_ml_suggestions(&self, errors: &[ParseError], code: &str) -> Result<Vec<RecoverySuggestion>> {
        let mut suggestions = Vec::new();
        
        for error in errors {
            // Get ML predictions
            let ml_predictions = self.error_predictor
                .predict_fixes(error, code)
                .await?;
            
            // Combine with rule-based suggestions
            let simple_error = super::parser::ParseError {
                message: error.message.clone(),
                start_position: error.start_position,
                end_position: error.end_position,
            };
            let rule_based = self.error_recovery.suggest_recovery(&simple_error, code);
            
            // Merge and rank suggestions
            let merged = self.merge_suggestions(ml_predictions, rule_based);
            suggestions.extend(merged);
        }
        
        Ok(suggestions)
    }
    
    async fn generate_embeddings(&self, tree: &Tree, code: &str) -> Result<SymbolEmbeddings> {
        let mut function_embeddings = Vec::new();
        let mut class_embeddings = Vec::new();
        
        // Walk tree and collect symbols
        let symbols = self.extract_symbols(tree, code)?;
        
        for symbol in symbols {
            // Check embedding cache
            let cache_key = format!("{}:{}", self.language.id(), symbol.name);
            
            let embedding = if let Some(cached) = self.embedding_cache.get(&cache_key) {
                cached.clone()
            } else {
                // Generate embedding
                let context = format!("{}:{}", symbol.file_path, symbol.start_line);
                let emb = self.code_embedder.embed(&symbol.name, &context).await?;
                self.embedding_cache.insert(cache_key, emb.clone());
                emb
            };
            
            // Determine symbol kind from signature
            if symbol.signature.contains("fn") || symbol.signature.contains("function") {
                function_embeddings.push((symbol.name.clone(), embedding));
            } else if symbol.signature.contains("class") || symbol.signature.contains("struct") {
                class_embeddings.push((symbol.name.clone(), embedding));
            }
        }
        
        // Calculate similarity matrix if needed
        let similarity_matrix = if function_embeddings.len() > 1 {
            Some(self.calculate_similarity_matrix(&function_embeddings))
        } else {
            None
        };
        
        Ok(SymbolEmbeddings {
            function_embeddings,
            class_embeddings,
            similarity_matrix,
        })
    }
    
    async fn predict_intent(&self, tree: &Tree, code: &str, embeddings: &SymbolEmbeddings) -> Result<Option<CodeIntent>> {
        // Use embeddings and tree structure to predict intent
        let features = self.extract_intent_features(tree, code, embeddings)?;
        let intent = self.syntax_predictor.predict_intent(features).await?;
        Ok(intent)
    }
    
    fn calculate_confidence(&self, tree: &Tree, errors: &[ParseError], embeddings: &SymbolEmbeddings) -> f32 {
        let mut confidence = 1.0;
        
        // Reduce confidence for errors
        confidence -= errors.len() as f32 * 0.1;
        
        // Reduce confidence for missing nodes
        if tree.root_node().has_error() {
            confidence -= 0.2;
        }
        
        // Increase confidence for good embeddings
        if !embeddings.function_embeddings.is_empty() {
            confidence += 0.1;
        }
        
        confidence.max(0.0).min(1.0)
    }
    
    pub async fn learn_from_fix(&self, error: &ParseError, successful_fix: &str) -> Result<()> {
        let mut history = self.error_history.write().await;
        
        history.successful_recoveries.push(SuccessfulRecovery {
            error_context: format!("{:?}", error),
            fix_applied: successful_fix.to_string(),
            confidence: 0.9,
            timestamp: std::time::SystemTime::now(),
        });
        
        // Retrain error predictor with new data
        self.error_predictor.add_training_example(error, successful_fix).await?;
        
        Ok(())
    }
    
    pub async fn incremental_parse_with_ml(&mut self, code: &str, edits: Vec<(usize, usize, usize)>, previous_tree: Option<&Tree>) -> Result<IntelligentParseResult> {
        // Use ML to predict likely changes
        let _predicted_changes = self.syntax_predictor.predict_edits(&edits, code).await?;
        
        // Perform incremental parse
        let _tree = if let Some(prev) = previous_tree {
            // Real incremental parsing
            let mut tree = prev.clone();
            for (start, old_end, new_end) in edits {
                let edit = tree_sitter::InputEdit {
                    start_byte: start,
                    old_end_byte: old_end,
                    new_end_byte: new_end,
                    start_position: self.byte_to_point(code, start),
                    old_end_position: self.byte_to_point(code, old_end),
                    new_end_position: self.byte_to_point(code, new_end),
                };
                tree.edit(&edit);
            }
            self.parser.parse(code, Some(&tree))
                .ok_or_else(|| anyhow::anyhow!("Incremental parse failed"))?
        } else {
            self.parser.parse(code, None)
                .ok_or_else(|| anyhow::anyhow!("Parse failed"))?
        };
        
        // Apply intelligence to the result
        self.parse_with_intelligence(code).await
    }
    
    // Helper methods
    fn hash_code(&self, code: &str) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        code.hash(&mut hasher);
        hasher.finish()
    }
    
    fn cache_result(&self, hash: u64, tree: &Tree, embeddings: &SymbolEmbeddings) {
        self.parse_cache.insert(hash, CachedParseResult {
            tree: tree.clone(),
            embeddings: embeddings.clone(),
            timestamp: std::time::Instant::now(),
        });
    }
    
    async fn create_result_from_cache_data(&self, tree: Tree, embeddings: SymbolEmbeddings, code: &str) -> Result<IntelligentParseResult> {
        // Recreate result from cache
        let errors = self.detect_errors_with_ml(&tree, code).await?;
        let recovery_suggestions = self.generate_ml_suggestions(&errors, code).await?;
        let predicted_intent = self.predict_intent(&tree, code, &embeddings).await?;
        let confidence_score = self.calculate_confidence(&tree, &errors, &embeddings);
        
        Ok(IntelligentParseResult {
            tree,
            errors,
            recovery_suggestions,
            confidence_score,
            embeddings,
            predicted_intent,
        })
    }
    
    fn find_syntax_errors(&self, cursor: &mut tree_sitter::TreeCursor, code: &str, errors: &mut Vec<ParseError>) {
        let node = cursor.node();
        
        if node.is_error() || node.is_missing() {
            let error_type = if node.is_missing() {
                ErrorType::MissingToken(node.kind().to_string())
            } else {
                ErrorType::SyntaxError
            };
            
            errors.push(ParseError {
                message: format!("Syntax error: {}", node.kind()),
                start_position: node.start_position(),
                end_position: node.end_position(),
                error_type,
                confidence: 0.95,
                ml_suggestions: vec![],
            });
        }
        
        if node.has_error() {
            if cursor.goto_first_child() {
                loop {
                    self.find_syntax_errors(cursor, code, errors);
                    if !cursor.goto_next_sibling() {
                        break;
                    }
                }
                cursor.goto_parent();
            }
        }
    }
    
    async fn predict_potential_errors(&self, tree: &Tree, code: &str) -> Result<Vec<ParseError>> {
        // Use ML to predict potential errors even in valid code
        let predictions = self.error_predictor.analyze_code(tree, code).await?;
        
        Ok(predictions.into_iter().map(|pred| ParseError {
            message: pred.description,
            start_position: pred.position,
            end_position: pred.position,
            error_type: ErrorType::SemanticError(pred.category),
            confidence: pred.confidence,
            ml_suggestions: pred.suggestions,
        }).collect())
    }
    
    async fn apply_historical_patterns(&self, errors: &mut Vec<ParseError>, _code: &str) -> Result<()> {
        let history = self.error_history.read().await;
        
        for error in errors.iter_mut() {
            // Find similar historical errors
            for recovery in &history.successful_recoveries {
                if self.is_similar_error(&error.message, &recovery.error_context) {
                    error.ml_suggestions.push(MLSuggestion {
                        suggestion: recovery.fix_applied.clone(),
                        confidence: recovery.confidence * 0.8, // Slightly lower confidence for historical
                        explanation: format!("Similar fix worked before with {:.0}% confidence", recovery.confidence * 100.0),
                        learned_from: Some(recovery.error_context.clone()),
                    });
                }
            }
        }
        
        Ok(())
    }
    
    fn is_similar_error(&self, error1: &str, error2: &str) -> bool {
        // Simple similarity check - can be enhanced with embeddings
        error1.split_whitespace().any(|word| error2.contains(word))
    }
    
    fn merge_suggestions(&self, ml_predictions: Vec<MLSuggestion>, rule_based: Option<RecoverySuggestion>) -> Vec<RecoverySuggestion> {
        let mut merged = Vec::new();
        
        // Add ML predictions
        for ml_pred in ml_predictions {
            merged.push(RecoverySuggestion {
                suggestion: ml_pred.suggestion,
                confidence: ml_pred.confidence,
                position: 0, // TODO: Extract from ML prediction
                description: ml_pred.explanation,
            });
        }
        
        // Add rule-based if not duplicate
        if let Some(rule) = rule_based {
            if !merged.iter().any(|s| s.suggestion == rule.suggestion) {
                merged.push(rule);
            }
        }
        
        // Sort by confidence
        merged.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        
        merged
    }
    
    fn extract_symbols(&self, tree: &Tree, code: &str) -> Result<Vec<Symbol>> {
        // Extract symbols from tree
        let mut symbols = Vec::new();
        let mut cursor = tree.walk();
        self.extract_symbols_recursive(&mut cursor, code, &mut symbols);
        Ok(symbols)
    }
    
    fn extract_symbols_recursive(&self, cursor: &mut tree_sitter::TreeCursor, code: &str, symbols: &mut Vec<Symbol>) {
        let node = cursor.node();
        
        // Language-specific symbol extraction
        match self.language {
            Language::Rust => self.extract_rust_symbols(node, code, symbols),
            Language::TypeScript => self.extract_typescript_symbols(node, code, symbols),
            _ => {}
        }
        
        if cursor.goto_first_child() {
            loop {
                self.extract_symbols_recursive(cursor, code, symbols);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }
    
    fn extract_rust_symbols(&self, node: Node, code: &str, symbols: &mut Vec<Symbol>) {
        match node.kind() {
            "function_item" => {
                if let Ok(name) = node.utf8_text(code.as_bytes()) {
                    symbols.push(Symbol {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: name.to_string(),
                        signature: format!("fn {}", name),
                        language: super::language::Language::Rust,
                        file_path: "current_file.rs".to_string(),
                        start_line: node.start_position().row as u32,
                        end_line: node.end_position().row as u32,
                        embedding: None,
                        semantic_hash: None,
                        normalized_name: name.to_lowercase(),
                        context_embedding: None,
                        duplicate_of: None,
                        confidence_score: None,
                        similar_symbols: vec![],
                    });
                }
            }
            "struct_item" => {
                if let Ok(name) = node.utf8_text(code.as_bytes()) {
                    symbols.push(Symbol {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: name.to_string(),
                        signature: format!("struct {}", name),
                        language: super::language::Language::Rust,
                        file_path: "current_file.rs".to_string(),
                        start_line: node.start_position().row as u32,
                        end_line: node.end_position().row as u32,
                        embedding: None,
                        semantic_hash: None,
                        normalized_name: name.to_lowercase(),
                        context_embedding: None,
                        duplicate_of: None,
                        confidence_score: None,
                        similar_symbols: vec![],
                    });
                }
            }
            _ => {}
        }
    }
    
    fn extract_typescript_symbols(&self, node: Node, code: &str, symbols: &mut Vec<Symbol>) {
        match node.kind() {
            "function_declaration" | "arrow_function" => {
                if let Ok(name) = node.utf8_text(code.as_bytes()) {
                    symbols.push(Symbol {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: name.to_string(),
                        signature: format!("function {}", name),
                        language: super::language::Language::TypeScript,
                        file_path: "current_file.ts".to_string(),
                        start_line: node.start_position().row as u32,
                        end_line: node.end_position().row as u32,
                        embedding: None,
                        semantic_hash: None,
                        normalized_name: name.to_lowercase(),
                        context_embedding: None,
                        duplicate_of: None,
                        confidence_score: None,
                        similar_symbols: vec![],
                    });
                }
            }
            "class_declaration" => {
                if let Ok(name) = node.utf8_text(code.as_bytes()) {
                    symbols.push(Symbol {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: name.to_string(),
                        signature: format!("class {}", name),
                        language: super::language::Language::TypeScript,
                        file_path: "current_file.ts".to_string(),
                        start_line: node.start_position().row as u32,
                        end_line: node.end_position().row as u32,
                        embedding: None,
                        semantic_hash: None,
                        normalized_name: name.to_lowercase(),
                        context_embedding: None,
                        duplicate_of: None,
                        confidence_score: None,
                        similar_symbols: vec![],
                    });
                }
            }
            _ => {}
        }
    }
    
    fn get_node_context(&self, node: Node, code: &str) -> String {
        // Get surrounding context for better embeddings
        let start = node.start_byte().saturating_sub(50);
        let end = (node.end_byte() + 50).min(code.len());
        code[start..end].to_string()
    }
    
    fn calculate_similarity_matrix(&self, embeddings: &[(String, Vec<f32>)]) -> Vec<Vec<f32>> {
        let n = embeddings.len();
        let mut matrix = vec![vec![0.0; n]; n];
        
        for i in 0..n {
            for j in 0..n {
                matrix[i][j] = self.cosine_similarity(&embeddings[i].1, &embeddings[j].1);
            }
        }
        
        matrix
    }
    
    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if norm_a == 0.0 || norm_b == 0.0 {
            0.0
        } else {
            dot_product / (norm_a * norm_b)
        }
    }
    
    fn extract_intent_features(&self, tree: &Tree, code: &str, embeddings: &SymbolEmbeddings) -> Result<IntentFeatures> {
        Ok(IntentFeatures {
            node_types: self.count_node_types(tree),
            embedding_stats: self.calculate_embedding_stats(embeddings),
            code_length: code.len(),
            depth: self.calculate_tree_depth(tree),
        })
    }
    
    fn count_node_types(&self, tree: &Tree) -> HashMap<String, usize> {
        let mut counts = HashMap::new();
        let mut cursor = tree.walk();
        self.count_nodes_recursive(&mut cursor, &mut counts);
        counts
    }
    
    fn count_nodes_recursive(&self, cursor: &mut tree_sitter::TreeCursor, counts: &mut HashMap<String, usize>) {
        let node_type = cursor.node().kind().to_string();
        *counts.entry(node_type).or_insert(0) += 1;
        
        if cursor.goto_first_child() {
            loop {
                self.count_nodes_recursive(cursor, counts);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }
    
    fn calculate_embedding_stats(&self, embeddings: &SymbolEmbeddings) -> EmbeddingStats {
        EmbeddingStats {
            function_count: embeddings.function_embeddings.len(),
            class_count: embeddings.class_embeddings.len(),
            avg_similarity: embeddings.similarity_matrix.as_ref()
                .map(|m| m.iter().flat_map(|row| row.iter()).sum::<f32>() / (m.len() * m.len()) as f32)
                .unwrap_or(0.0),
        }
    }
    
    fn calculate_tree_depth(&self, tree: &Tree) -> usize {
        let mut max_depth = 0;
        let mut cursor = tree.walk();
        self.calculate_depth_recursive(&mut cursor, 0, &mut max_depth);
        max_depth
    }
    
    fn calculate_depth_recursive(&self, cursor: &mut tree_sitter::TreeCursor, current_depth: usize, max_depth: &mut usize) {
        *max_depth = (*max_depth).max(current_depth);
        
        if cursor.goto_first_child() {
            loop {
                self.calculate_depth_recursive(cursor, current_depth + 1, max_depth);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }
    
    fn byte_to_point(&self, text: &str, byte: usize) -> Point {
        let mut line = 0;
        let mut column = 0;
        
        for (i, ch) in text.char_indices() {
            if i >= byte {
                break;
            }
            if ch == '\n' {
                line += 1;
                column = 0;
            } else {
                column += 1;
            }
        }
        
        Point { row: line, column }
    }
}

// Supporting types
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Symbol {
    pub id: String,
    pub name: String,
    pub signature: String,
    pub language: super::language::Language,
    pub file_path: String,
    pub start_line: u32,
    pub end_line: u32,
    
    // Semantic fields for pattern engine
    pub embedding: Option<Vec<f32>>,
    pub semantic_hash: Option<String>,
    pub normalized_name: String,
    pub context_embedding: Option<Vec<f32>>,
    
    // Deduplication metadata
    pub duplicate_of: Option<String>,
    pub confidence_score: Option<f32>,
    pub similar_symbols: Vec<SimilarSymbol>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimilarSymbol {
    pub symbol_id: String,
    pub similarity_score: f32,
    pub relationship_type: SimilarityType,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SimilarityType {
    ExactDuplicate,      // 0.95+
    SemanticDuplicate,   // 0.8+
    FunctionalSimilar,   // 0.6+
    NameSimilar,         // 0.4+
}

#[derive(Debug, Clone)]
enum SymbolKind {
    Function,
    Class,
    Variable,
    Type,
}

// IntentFeatures and EmbeddingStats imported from ml_integration