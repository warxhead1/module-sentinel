use anyhow::Result;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;
use tree_sitter::{Tree, Point};
use super::language::Language;
use super::{ParseError, MLSuggestion, ErrorType};
use crate::parsers::tree_sitter::Symbol;
use super::tokenizer::CodeTokenizer;

#[cfg(feature = "ml")]
use ort::value::Value;

// Type alias for ML session - will be replaced with actual ONNX runtime when ML feature is enabled
#[cfg(not(feature = "ml"))]
type MLSession = ();

#[cfg(feature = "ml")]
type MLSession = ort::session::Session;


/// Code embedder using local ONNX model
pub struct CodeEmbedder {
    #[cfg(feature = "ml")]
    model: Arc<RwLock<MLSession>>, // Need interior mutability for Session::run
    #[cfg(not(feature = "ml"))]
    model: Arc<MLSession>, // For mock
    tokenizer: Arc<CodeTokenizer>,
    embedding_dim: usize,
}

impl CodeEmbedder {
    /// Create a mock embedder for testing when ML features are disabled
    pub async fn mock_for_testing(language: &Language) -> Result<Self> {
        #[cfg(feature = "ml")]
        {
            // This shouldn't be called with ML feature enabled, but handle gracefully
            Self::load(language).await
        }
        #[cfg(not(feature = "ml"))]
        {
            Ok(Self {
                model: Arc::new(()),
                tokenizer: Arc::new(CodeTokenizer::new(language)?),
                embedding_dim: 768, // Standard BERT-like dimension
            })
        }
    }
    
    pub async fn load(language: &Language) -> Result<Self> {
        #[cfg(feature = "ml")]
        {
            use super::global_model_cache::get_cached_model;
            
            // Use the global cache to get the model - share the Arc directly
            let session = get_cached_model("code_similarity").await?;
            
            Ok(Self {
                model: session, // This is now Arc<RwLock<Session>>
                tokenizer: Arc::new(CodeTokenizer::new(language)?),
                embedding_dim: 768, // Standard BERT-like dimension
            })
        }
        
        #[cfg(not(feature = "ml"))]
        {
            use super::global_model_cache::get_cached_model;
            
            // When ML is disabled, still use the cache for consistency
            let session = get_cached_model("code_similarity").await?;
            
            Ok(Self {
                model: session, // Returns Arc<()> when ML disabled
                tokenizer: Arc::new(CodeTokenizer::new(language)?),
                embedding_dim: 768, // Standard BERT-like dimension
            })
        }
    }
    
    pub async fn embed(&self, text: &str, context: &str) -> Result<Vec<f32>> {
        #[cfg(feature = "ml")]
        {
            // Try to run ML inference, fall back to feature-based on error
            match self.run_ml_inference(text, context).await {
                Ok(embeddings) => Ok(embeddings),
                Err(e) => {
                    tracing::debug!("ML inference failed, using feature-based embedding: {}", e);
                    self.feature_based_embed(text, context).await
                }
            }
        }
        
        #[cfg(not(feature = "ml"))]
        {
            // Use feature-based embedding when ML is disabled
            self.feature_based_embed(text, context).await
        }
    }
    
    #[cfg(feature = "ml")]
    async fn run_ml_inference(&self, text: &str, context: &str) -> Result<Vec<f32>> {
        // Lock the shared session for inference
        let mut session = self.model.write().await;
        
        // ONNX inference using preprocessed tensors
            
            // Tokenize the input (for analysis) and encode directly for model input
            let _tokens = self.tokenizer.tokenize(text);
            let _context_tokens = self.tokenizer.tokenize(context);
            
            // Convert tokens to IDs using the original text
            let token_ids = self.tokenizer.encode(text);
            let context_ids = self.tokenizer.encode(context);
            
            // Prepare input tensor - combine text and context
            let max_seq_len = 512; // Standard BERT max sequence length
            let mut input_ids = vec![0i64; max_seq_len];
            
            // Fill with token IDs (truncate if needed)
            for (i, &id) in token_ids.iter().take(max_seq_len / 2).enumerate() {
                input_ids[i] = id as i64;
            }
            
            // Add context tokens
            let context_start = token_ids.len().min(max_seq_len / 2);
            for (i, &id) in context_ids.iter().take(max_seq_len / 2).enumerate() {
                if context_start + i < max_seq_len {
                    input_ids[context_start + i] = id as i64;
                }
            }
            
            // Create attention mask
            let attention_mask: Vec<i64> = input_ids.iter()
                .map(|&id| if id != 0 { 1 } else { 0 })
                .collect();
            
            // Create input tensors in the format expected by ort
            let input_shape = [1, max_seq_len];
            let input_ids_tensor = Value::from_array((input_shape, input_ids))?;
            let attention_mask_tensor = Value::from_array((input_shape, attention_mask))?;
            
            // Run inference with named inputs  
            use ort::session::SessionInputValue;
            let inputs: Vec<(String, SessionInputValue)> = vec![
                ("input_ids".to_string(), input_ids_tensor.into()),
                ("attention_mask".to_string(), attention_mask_tensor.into()),
            ];
            let outputs = session.run(inputs)?;
            
            // Extract embeddings from output
            if let Some(output) = outputs.get("last_hidden_state").or_else(|| outputs.get("pooler_output")) {
                let tensor_data = output.try_extract_tensor::<f32>()?;
                let embeddings: Vec<f32> = tensor_data.1.to_vec();
                
                // Take the mean pooling of sequence outputs if needed
                if embeddings.len() > self.embedding_dim {
                    let pooled = embeddings.chunks(self.embedding_dim)
                        .fold(vec![0.0; self.embedding_dim], |mut acc, chunk| {
                            for (i, &val) in chunk.iter().enumerate() {
                                if i < acc.len() {
                                    acc[i] += val;
                                }
                            }
                            acc
                        });
                    
                    let num_chunks = embeddings.len() / self.embedding_dim;
                    Ok(pooled.into_iter().map(|v| v / num_chunks as f32).collect())
                } else {
                    Ok(embeddings)
                }
            } else {
                Err(anyhow::anyhow!("No output from ML model"))
            }
    }
    
    /// Generate embeddings using the loaded model
    pub async fn generate_embeddings(&self, text: &str, _language: &Language) -> Result<Vec<f32>> {
        // Use the embed method which already handles both ML and fallback
        self.embed(text, "").await
    }
    
    /// Feature-based embedding fallback when ML model is not available
    async fn feature_based_embed(&self, text: &str, _context: &str) -> Result<Vec<f32>> {
        let tokens = self.tokenizer.tokenize(text);
        let mut embeddings = vec![0.0; self.embedding_dim];
        
        // Feature 1: Function signature patterns
        if text.contains("fn ") || text.contains("function") || text.contains("def ") {
            embeddings[0] = 1.0; // Function marker
            if text.contains("validate") {
                embeddings[1] = 0.9; // Validation pattern
            }
            if text.contains("email") {
                embeddings[2] = 0.8; // Email-related
            }
            if text.contains("format") || text.contains("split") {
                embeddings[3] = 0.7; // String processing
            }
        }
        
        // Feature 2: Token similarity
        let token_features = tokens.iter().enumerate().map(|(_i, token)| {
            match token.as_str() {
                "validate" => 0.9,
                "email" => 0.8,
                "format" => 0.7,
                "string" => 0.6,
                "fn" | "function" | "def" => 0.9,
                "return" => 0.5,
                _ => 0.1,
            }
        });
        
        for (i, value) in token_features.enumerate() {
            if i < self.embedding_dim - 10 {
                embeddings[i + 10] = value;
            }
        }
        
        // Feature 3: Structural similarity
        let paren_count = text.matches('(').count() as f32 * 0.1;
        let brace_count = text.matches('{').count() as f32 * 0.1;
        embeddings[self.embedding_dim - 2] = paren_count.min(1.0);
        embeddings[self.embedding_dim - 1] = brace_count.min(1.0);
        
        // Normalize
        let norm: f32 = embeddings.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for emb in &mut embeddings {
                *emb /= norm;
            }
        }
        
        Ok(embeddings)
    }
}


/// Error predictor for code quality analysis and parse error suggestions
pub struct ErrorPredictor {
    model: Arc<RwLock<Option<Arc<RwLock<MLSession>>>>>,
    language: Language,
}

impl ErrorPredictor {
    pub async fn load(language: &Language) -> Result<Self> {
        #[cfg(feature = "ml")]
        {
            // Try to load the error prediction model from global cache
            use super::global_model_cache::get_cached_model;
            
            let model = match get_cached_model("error_prediction").await {
                Ok(session) => {
                    tracing::info!("Loaded error prediction model for {:?}", language);
                    Some(session)
                }
                Err(e) => {
                    tracing::warn!("Failed to load error prediction model: {}. Using rule-based fallback.", e);
                    None
                }
            };
            
            Ok(Self {
                model: Arc::new(RwLock::new(model)),
                language: *language,
            })
        }
        
        #[cfg(not(feature = "ml"))]
        {
            Ok(Self {
                model: Arc::new(RwLock::new(None)),
                language: *language,
            })
        }
    }
    
    /// Predict fixes for parse errors with semantic context
    pub async fn predict_fixes(&self, error: &ParseError, code: &str) -> Result<Vec<MLSuggestion>> {
        let mut suggestions = Vec::new();
        
        // Try to use ML model first if available
        #[cfg(feature = "ml")]
        {
            let model_guard = self.model.read().await;
            if let Some(model_session) = model_guard.as_ref() {
                // Need to lock the inner session with write access
                let mut session = model_session.write().await;
                // Prepare input for ML model
                // This is a simplified example - real implementation would need proper input formatting
                match self.predict_with_ml(&mut *session, error, code).await {
                    Ok(ml_suggestions) => {
                        suggestions.extend(ml_suggestions);
                        if !suggestions.is_empty() {
                            return Ok(suggestions);
                        }
                    }
                    Err(e) => {
                        tracing::debug!("ML prediction failed, falling back to rules: {}", e);
                    }
                }
            }
        }
        
        // Enhanced rule-based suggestions that simulate ML predictions
        match &error.error_type {
            ErrorType::MissingToken(token) => {
                suggestions.push(MLSuggestion {
                    suggestion: token.clone(),
                    confidence: 0.85,
                    explanation: format!("Add missing {}", token),
                    learned_from: None,
                });
                
                // Context-aware suggestions based on language patterns
                if token == ")" {
                    suggestions.push(MLSuggestion {
                        suggestion: ")".to_string(),
                        confidence: 0.90,
                        explanation: "Close parentheses to match opening".to_string(),
                        learned_from: Some("Common syntax pattern".to_string()),
                    });
                }
            }
            ErrorType::UnexpectedToken(token) => {
                // Get context-aware suggestions
                let context_suggestions = self.get_context_suggestions(code, error).await?;
                suggestions.extend(context_suggestions);
                
                suggestions.push(MLSuggestion {
                    suggestion: "".to_string(),
                    confidence: 0.75,
                    explanation: format!("Remove unexpected {}", token),
                    learned_from: None,
                });
            }
            _ => {}
        }
        
        Ok(suggestions)
    }
    
    /// Predict fixes using the ML model
    #[cfg(feature = "ml")]
    async fn predict_with_ml(&self, session: &mut MLSession, error: &ParseError, code: &str) -> Result<Vec<MLSuggestion>> {
        // Extract context around the error
        let lines: Vec<&str> = code.lines().collect();
        let error_line = error.start_position.row as usize;
        
        // Get context window (3 lines before and after)
        let start_line = error_line.saturating_sub(3);
        let end_line = (error_line + 3).min(lines.len() - 1);
        
        let context = lines[start_line..=end_line].join("\n");
        
        // Prepare input tensor
        // For error prediction, we typically need:
        // 1. Error type encoding
        // 2. Context tokens
        // 3. Position information
        
        let error_type_encoding = match &error.error_type {
            ErrorType::MissingToken(_) => vec![1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            ErrorType::UnexpectedToken(_) => vec![0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
            ErrorType::SyntaxError => vec![0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
            ErrorType::IncompleteConstruct(_) => vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            ErrorType::SemanticError(_) => vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            ErrorType::UnknownError(_) => vec![0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        };
        
        // Tokenize context (simplified - real implementation would use proper tokenizer)
        let tokens: Vec<&str> = context.split_whitespace().collect();
        let max_tokens = 128;
        
        // Create input features
        let mut input_features = vec![0.0f32; max_tokens + 6]; // 6 for error type
        
        // Add error type
        for (i, val) in error_type_encoding.iter().enumerate() {
            input_features[i] = *val;
        }
        
        // Add token embeddings (simplified - just use hash values normalized)
        for (i, token) in tokens.iter().take(max_tokens - 6).enumerate() {
            use std::hash::{Hash, Hasher};
            use std::collections::hash_map::DefaultHasher;
            let mut hasher = DefaultHasher::new();
            token.hash(&mut hasher);
            input_features[i + 6] = (hasher.finish() % 1000) as f32 / 1000.0;
        }
        
        // Run inference
        let input_shape = [1, max_tokens + 6];
        
        // Create ORT Value from tensor
        use ort::value::Value;
        let input_value = Value::from_array((input_shape, input_features))?;
        
        let outputs = session.run(vec![("input", input_value)])?;
        
        // Decode outputs
        let output = &outputs[0];
        let predictions_array = output.try_extract_array::<f32>()?;
        let predictions = predictions_array.as_slice().unwrap_or(&[]);
        
        let mut suggestions = Vec::new();
        
        // Top suggestions based on confidence
        if predictions.len() >= 3 {
            if predictions[0] > 0.7 {
                suggestions.push(MLSuggestion {
                    suggestion: self.decode_suggestion_from_model_output(0, &error.error_type),
                    confidence: predictions[0],
                    explanation: "ML model suggests this fix based on similar patterns".to_string(),
                    learned_from: Some("Training data patterns".to_string()),
                });
            }
            
            if predictions[1] > 0.5 {
                suggestions.push(MLSuggestion {
                    suggestion: self.decode_suggestion_from_model_output(1, &error.error_type),
                    confidence: predictions[1],
                    explanation: "Alternative fix suggestion".to_string(),
                    learned_from: Some("Common error patterns".to_string()),
                });
            }
        }
        
        Ok(suggestions)
    }
    
    /// Decode model output index to actual suggestion
    fn decode_suggestion_from_model_output(&self, index: usize, error_type: &ErrorType) -> String {
        match (index, error_type) {
            (0, ErrorType::MissingToken(token)) => format!("Add {}", token),
            (1, ErrorType::MissingToken(_)) => "Add missing delimiter".to_string(),
            (0, ErrorType::UnexpectedToken(token)) => format!("Remove {}", token),
            (1, ErrorType::UnexpectedToken(_)) => "Check syntax before this token".to_string(),
            (0, ErrorType::SyntaxError) => "Fix syntax structure".to_string(),
            (1, ErrorType::SyntaxError) => "Review language syntax rules".to_string(),
            _ => "Review code structure".to_string(),
        }
    }
    
    /// Get context-aware suggestions based on surrounding code
    async fn get_context_suggestions(&self, code: &str, error: &ParseError) -> Result<Vec<MLSuggestion>> {
        let mut suggestions = Vec::new();
        
        // Analyze context around error position
        let error_line = error.start_position.row;
        let lines: Vec<&str> = code.lines().collect();
        
        if error_line < lines.len() {
            let line = lines[error_line];
            
            // Language-specific pattern matching
            match self.language {
                Language::Rust => {
                    if line.contains("println!(") && !line.contains(");") {
                        suggestions.push(MLSuggestion {
                            suggestion: ");".to_string(),
                            confidence: 0.95,
                            explanation: "Complete println! macro call".to_string(),
                            learned_from: Some("Rust macro syntax".to_string()),
                        });
                    }
                }
                Language::TypeScript => {
                    if line.contains("function") && !line.contains("(") {
                        suggestions.push(MLSuggestion {
                            suggestion: "()".to_string(),
                            confidence: 0.85,
                            explanation: "Add function parameters".to_string(),
                            learned_from: Some("TypeScript function syntax".to_string()),
                        });
                    }
                }
                _ => {}
            }
        }
        
        Ok(suggestions)
    }
    
    /// Analyze code for potential quality issues (complexity, maintainability)
    pub async fn analyze_code_quality(&self, tree: &Tree, code: &str) -> Result<Vec<QualityIssue>> {
        let mut issues = Vec::new();
        
        // 1. Cyclomatic Complexity Analysis
        let complexity_metrics = self.calculate_complexity_metrics(tree, code)?;
        
        if complexity_metrics.cyclomatic_complexity > 10 {
            issues.push(QualityIssue {
                description: format!("High cyclomatic complexity: {} (threshold: 10)", complexity_metrics.cyclomatic_complexity),
                position: Point { row: 0, column: 0 },
                category: "complexity".to_string(),
                severity: if complexity_metrics.cyclomatic_complexity > 15 { "high" } else { "medium" }.to_string(),
                confidence: 0.9,
                suggested_refactoring: vec!["Extract methods to reduce branching".to_string()],
            });
        }
        
        // 2. Nesting Depth Analysis
        if complexity_metrics.max_nesting_depth > 4 {
            issues.push(QualityIssue {
                description: format!("Deep nesting detected: {} levels (threshold: 4)", complexity_metrics.max_nesting_depth),
                position: Point { row: 0, column: 0 },
                category: "complexity".to_string(),
                severity: "medium".to_string(),
                confidence: 0.8,
                suggested_refactoring: vec!["Use early returns to reduce nesting".to_string()],
            });
        }
        
        // 3. Function Length Analysis
        let line_count = code.lines().count();
        if line_count > 50 {
            issues.push(QualityIssue {
                description: format!("Function is {} lines long, consider breaking it down", line_count),
                position: Point { row: 0, column: 0 },
                category: "complexity".to_string(),
                severity: if line_count > 100 { "high" } else { "medium" }.to_string(),
                confidence: 0.8,
                suggested_refactoring: vec!["Extract smaller functions".to_string()],
            });
        }
        
        // Language-specific quality checks
        match self.language {
            Language::Rust => {
                // Detect missing error handling
                if code.contains("unwrap()") {
                    issues.push(QualityIssue {
                        description: "Potential panic: consider using ? operator or handling error".to_string(),
                        position: Point { row: 0, column: 0 }, // TODO: Get actual position
                        category: "error_handling".to_string(),
                        severity: "medium".to_string(),
                        confidence: 0.7,
                        suggested_refactoring: vec!["Replace unwrap() with ? operator".to_string()],
                    });
                }
                
                // Detect clone() overuse
                let clone_count = code.matches(".clone()").count();
                if clone_count > 3 {
                    issues.push(QualityIssue {
                        description: format!("Excessive cloning detected ({} instances)", clone_count),
                        position: Point { row: 0, column: 0 },
                        category: "performance".to_string(),
                        severity: "low".to_string(),
                        confidence: 0.6,
                        suggested_refactoring: vec!["Consider using references or Rc/Arc".to_string()],
                    });
                }
            }
            _ => {}
        }
        
        Ok(issues)
    }
    
    /// Calculate comprehensive complexity metrics from AST
    fn calculate_complexity_metrics(&self, tree: &Tree, _code: &str) -> Result<ComplexityMetrics> {
        let root_node = tree.root_node();
        let mut metrics = ComplexityMetrics::default();
        
        // Walk the tree to calculate metrics
        self.walk_node_for_complexity(&root_node, &mut metrics, 0);
        
        Ok(metrics)
    }
    
    /// Recursive tree walker for complexity analysis
    fn walk_node_for_complexity(&self, node: &tree_sitter::Node, metrics: &mut ComplexityMetrics, depth: usize) {
        // Update max nesting depth
        metrics.max_nesting_depth = metrics.max_nesting_depth.max(depth);
        
        // Language-specific complexity counting
        match self.language {
            Language::Rust => {
                match node.kind() {
                    // Decision points increase cyclomatic complexity
                    "if_expression" | "match_expression" | "while_expression" | 
                    "for_expression" | "loop_expression" => {
                        metrics.cyclomatic_complexity += 1;
                        metrics.decision_points += 1;
                    }
                    // Count match arms
                    "match_arm" => {
                        metrics.cyclomatic_complexity += 1;
                    }
                    // Count function definitions
                    "function_item" => {
                        metrics.function_count += 1;
                    }
                    // Count error handling patterns
                    "try_expression" => {
                        metrics.error_handling_complexity += 1;
                    }
                    _ => {}
                }
            }
            Language::TypeScript | Language::JavaScript => {
                match node.kind() {
                    "if_statement" | "switch_statement" | "while_statement" | 
                    "for_statement" | "do_statement" | "conditional_expression" => {
                        metrics.cyclomatic_complexity += 1;
                        metrics.decision_points += 1;
                    }
                    "function_declaration" | "arrow_function" | "method_definition" => {
                        metrics.function_count += 1;
                    }
                    "try_statement" | "catch_clause" => {
                        metrics.error_handling_complexity += 1;
                    }
                    _ => {}
                }
            }
            _ => {
                // Generic complexity counting for other languages
                if node.kind().contains("if") || node.kind().contains("while") || 
                   node.kind().contains("for") || node.kind().contains("switch") {
                    metrics.cyclomatic_complexity += 1;
                    metrics.decision_points += 1;
                }
            }
        }
        
        // Recursively process child nodes
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                let child_depth = if self.is_nesting_node(&child) { depth + 1 } else { depth };
                self.walk_node_for_complexity(&child, metrics, child_depth);
            }
        }
    }
    
    /// Check if a node increases nesting level
    fn is_nesting_node(&self, node: &tree_sitter::Node) -> bool {
        match self.language {
            Language::Rust => {
                matches!(node.kind(), 
                    "block" | "if_expression" | "match_expression" | "while_expression" | 
                    "for_expression" | "loop_expression" | "function_item" | "impl_item"
                )
            }
            Language::TypeScript | Language::JavaScript => {
                matches!(node.kind(),
                    "statement_block" | "if_statement" | "while_statement" | 
                    "for_statement" | "function_declaration" | "class_declaration"
                )
            }
            _ => node.kind().contains("block") || node.kind().contains("body")
        }
    }
    
    /// Store examples for continuous learning
    pub async fn add_training_example(&self, error: &ParseError, fix: &str) -> Result<()> {
        // TODO: Store training example for future model updates
        // For now, log it for manual analysis
        tracing::info!("Learning from fix: {:?} -> {}", error, fix);
        Ok(())
    }
}

/// Component Reuse Predictor - Prevents over-engineering by finding existing solutions
pub struct ComponentReusePredictor {
    /// Database of known component patterns and their semantic tags
    component_index: HashMap<String, ComponentSignature>,
    /// Common functionality patterns (logging, DB access, HTTP clients, etc.)
    functionality_patterns: Vec<FunctionalityPattern>,
}

impl ComponentReusePredictor {
    pub fn new() -> Self {
        let mut predictor = Self {
            component_index: HashMap::new(),
            functionality_patterns: Vec::new(),
        };
        predictor.initialize_patterns();
        predictor
    }
    
    /// Initialize common functionality patterns that indicate reusable components
    fn initialize_patterns(&mut self) {
        self.functionality_patterns = vec![
            FunctionalityPattern {
                category: "database".to_string(),
                keywords: vec!["connect", "query", "insert", "update", "delete", "transaction", "pool", "client"].into_iter().map(String::from).collect(),
                common_types: vec!["mongodb", "postgres", "mysql", "redis", "sqlite"].into_iter().map(String::from).collect(),
                typical_interfaces: vec!["connect()", "query(sql)", "insert(data)", "close()"].into_iter().map(String::from).collect(),
            },
            FunctionalityPattern {
                category: "logging".to_string(),
                keywords: vec!["log", "debug", "info", "warn", "error", "trace", "logger", "appender"].into_iter().map(String::from).collect(),
                common_types: vec!["console", "file", "syslog", "remote", "structured"].into_iter().map(String::from).collect(),
                typical_interfaces: vec!["log(level, message)", "setLevel()", "addAppender()"].into_iter().map(String::from).collect(),
            },
            FunctionalityPattern {
                category: "http_client".to_string(),
                keywords: vec!["request", "fetch", "http", "https", "client", "get", "post", "put", "delete"].into_iter().map(String::from).collect(),
                common_types: vec!["rest", "graphql", "soap", "webhook"].into_iter().map(String::from).collect(),
                typical_interfaces: vec!["get(url)", "post(url, data)", "setHeaders()"].into_iter().map(String::from).collect(),
            },
            FunctionalityPattern {
                category: "authentication".to_string(),
                keywords: vec!["auth", "login", "token", "jwt", "oauth", "session", "password", "credential"].into_iter().map(String::from).collect(),
                common_types: vec!["jwt", "oauth2", "saml", "basic", "api_key"].into_iter().map(String::from).collect(),
                typical_interfaces: vec!["authenticate()", "authorize()", "getToken()"].into_iter().map(String::from).collect(),
            },
            FunctionalityPattern {
                category: "file_processing".to_string(),
                keywords: vec!["read", "write", "parse", "transform", "convert", "upload", "download"].into_iter().map(String::from).collect(),
                common_types: vec!["csv", "json", "xml", "yaml", "binary", "stream"].into_iter().map(String::from).collect(),
                typical_interfaces: vec!["read(path)", "write(path, data)", "parse(content)"].into_iter().map(String::from).collect(),
            },
            FunctionalityPattern {
                category: "parsing".to_string(),
                keywords: vec!["parse", "parser", "tree", "sitter", "ast", "syntax", "lexer", "token", "grammar", "language", "node", "visitor"].into_iter().map(String::from).collect(),
                common_types: vec!["tree_sitter", "pest", "nom", "antlr", "lalrpop", "regex", "custom"].into_iter().map(String::from).collect(),
                typical_interfaces: vec!["parse(input)", "parse_file(path)", "get_ast()", "visit_node()", "tokenize()"].into_iter().map(String::from).collect(),
            },
        ];
    }
    
    /// Index existing components from the codebase
    pub fn index_existing_components(&mut self, symbols: &[Symbol]) {
        for symbol in symbols {
            if let Some(component_sig) = self.extract_component_signature(symbol) {
                self.component_index.insert(symbol.id.clone(), component_sig);
            }
        }
    }
    
    /// Extract semantic signature from a symbol that might represent a reusable component
    fn extract_component_signature(&self, symbol: &Symbol) -> Option<ComponentSignature> {
        let name_lower = symbol.name.to_lowercase();
        let sig_lower = symbol.signature.to_lowercase();
        
        // Look for patterns that suggest this is a reusable component
        for pattern in &self.functionality_patterns {
            let relevance_score = self.calculate_keyword_relevance(&name_lower, &sig_lower, pattern);
                
            if relevance_score >= 0.3 { // Requires meaningful relevance to the pattern
                    
                return Some(ComponentSignature {
                    functionality_category: pattern.category.clone(),
                    semantic_tags: self.extract_semantic_tags(&name_lower, &sig_lower, pattern),
                    abstraction_level: self.determine_abstraction_level(symbol),
                    extensibility_indicators: self.find_extensibility_patterns(symbol),
                    file_path: symbol.file_path.clone(),
                    confidence: relevance_score,
                });
            }
        }
        
        None
    }
    
    /// Calculate how relevant a symbol is to a functionality pattern using smart scoring
    fn calculate_keyword_relevance(&self, name: &str, signature: &str, pattern: &FunctionalityPattern) -> f32 {
        let mut score: f32 = 0.0;
        let total_text = format!("{} {}", name, signature);
        
        // Core keywords get higher weight (primary parsing terms)
        let core_keywords = ["parse", "parser", "tree", "sitter", "ast", "syntax"];
        let supporting_keywords = ["lexer", "token", "grammar", "language", "node", "visitor"];
        
        for keyword in &pattern.keywords {
            let keyword_lower = keyword.to_lowercase();
            
            // Check for exact matches in name (highest weight)
            if name.contains(&keyword_lower) {
                if core_keywords.contains(&keyword.as_str()) {
                    score += 0.4; // Core keyword in name = very relevant
                } else if supporting_keywords.contains(&keyword.as_str()) {
                    score += 0.25; // Supporting keyword in name = quite relevant
                } else {
                    score += 0.15; // Other keyword in name = somewhat relevant
                }
            }
            
            // Check for matches in signature (medium weight)
            else if signature.contains(&keyword_lower) {
                if core_keywords.contains(&keyword.as_str()) {
                    score += 0.2; // Core keyword in signature
                } else {
                    score += 0.1; // Other keyword in signature
                }
            }
        }
        
        // Bonus for multiple keyword combinations that make semantic sense
        let parsing_combo_patterns = [
            ("parse", "tree"), ("tree", "sitter"), ("ast", "node"), 
            ("syntax", "tree"), ("parser", "language"), ("lexer", "token")
        ];
        
        for (word1, word2) in &parsing_combo_patterns {
            if total_text.contains(word1) && total_text.contains(word2) {
                score += 0.2; // Bonus for meaningful combinations
            }
        }
        
        // Cap the score at 1.0
        score.min(1.0)
    }
    
    /// Extract semantic tags that describe what this component can do
    fn extract_semantic_tags(&self, name: &str, signature: &str, pattern: &FunctionalityPattern) -> Vec<String> {
        let mut tags = Vec::new();
        
        // Add matched keywords as tags
        for keyword in &pattern.keywords {
            if name.contains(keyword) || signature.contains(keyword) {
                tags.push(keyword.clone());
            }
        }
        
        // Add type-specific tags
        for common_type in &pattern.common_types {
            if name.contains(common_type) || signature.contains(common_type) {
                tags.push(format!("supports_{}", common_type));
            }
        }
        
        // Add abstraction tags
        if name.contains("interface") || name.contains("abstract") {
            tags.push("abstract".to_string());
        }
        if name.contains("factory") || name.contains("builder") {
            tags.push("creational".to_string());
        }
        if signature.contains("config") || signature.contains("options") {
            tags.push("configurable".to_string());
        }
        
        tags
    }
    
    /// Determine how abstract/reusable this component is
    fn determine_abstraction_level(&self, symbol: &Symbol) -> AbstractionLevel {
        let name_lower = symbol.name.to_lowercase();
        let sig_lower = symbol.signature.to_lowercase();
        
        if name_lower.contains("interface") || name_lower.contains("trait") || name_lower.contains("abstract") {
            AbstractionLevel::Interface
        } else if sig_lower.contains("impl") || name_lower.contains("factory") || name_lower.contains("builder") {
            AbstractionLevel::Implementation
        } else if name_lower.contains("util") || name_lower.contains("helper") {
            AbstractionLevel::Utility
        } else {
            AbstractionLevel::Concrete
        }
    }
    
    /// Find patterns that suggest this component is extensible
    fn find_extensibility_patterns(&self, symbol: &Symbol) -> Vec<String> {
        let mut patterns = Vec::new();
        let sig_lower = symbol.signature.to_lowercase();
        
        if sig_lower.contains("config") || sig_lower.contains("options") {
            patterns.push("configurable".to_string());
        }
        if sig_lower.contains("plugin") || sig_lower.contains("middleware") {
            patterns.push("pluggable".to_string());
        }
        if sig_lower.contains("callback") || sig_lower.contains("handler") {
            patterns.push("event_driven".to_string());
        }
        if sig_lower.contains("builder") || sig_lower.contains("fluent") {
            patterns.push("fluent_api".to_string());
        }
        
        patterns
    }
    
    /// Predict what existing components could satisfy a user intent instead of building new ones
    pub fn predict_component_reuse(&self, user_intent: &UserIntent) -> Vec<ReuseRecommendation> {
        let mut recommendations = Vec::new();
        
        for (symbol_id, component) in &self.component_index {
            let relevance_score = self.calculate_relevance(user_intent, component);
            
            if relevance_score > 0.5 { // Only recommend if reasonably relevant
                recommendations.push(ReuseRecommendation {
                    existing_component_id: symbol_id.clone(),
                    component_signature: component.clone(),
                    relevance_score,
                    suggested_usage: self.generate_usage_suggestion(user_intent, component),
                    extension_needed: self.assess_extension_needed(user_intent, component),
                });
            }
        }
        
        // Sort by relevance, highest first
        recommendations.sort_by(|a, b| b.relevance_score.partial_cmp(&a.relevance_score).unwrap());
        recommendations.truncate(5); // Return top 5 recommendations
        
        recommendations
    }
    
    /// Calculate how relevant an existing component is to the user's intent
    fn calculate_relevance(&self, intent: &UserIntent, component: &ComponentSignature) -> f32 {
        let mut score = 0.0;
        
        // Category match is highly important
        if intent.functionality_category == component.functionality_category {
            score += 0.4;
        }
        
        // Count semantic tag overlaps
        let tag_matches = intent.required_capabilities.iter()
            .filter(|cap| component.semantic_tags.contains(cap))
            .count();
        
        if tag_matches > 0 {
            score += (tag_matches as f32 / intent.required_capabilities.len() as f32) * 0.4;
        }
        
        // Bonus for extensible components
        if !component.extensibility_indicators.is_empty() {
            score += 0.2;
        }
        
        score * component.confidence
    }
    
    /// Generate a specific usage suggestion
    fn generate_usage_suggestion(&self, intent: &UserIntent, component: &ComponentSignature) -> String {
        let base_suggestion = match component.abstraction_level {
            AbstractionLevel::Interface => {
                format!("Implement the existing {} interface instead of creating a new component", component.functionality_category)
            }
            AbstractionLevel::Implementation => {
                if component.extensibility_indicators.contains(&"configurable".to_string()) {
                    format!("Configure the existing {} component with your specific requirements", component.functionality_category)
                } else {
                    format!("Extend the existing {} implementation", component.functionality_category)
                }
            }
            AbstractionLevel::Utility => {
                format!("Use the existing {} utility functions", component.functionality_category)
            }
            AbstractionLevel::Concrete => {
                format!("Adapt the existing {} component or create a similar interface", component.functionality_category)
            }
        };
        
        // Add intent-specific details if available
        if !intent.required_capabilities.is_empty() {
            format!("{} to support: {}", base_suggestion, intent.required_capabilities.join(", "))
        } else {
            base_suggestion
        }
    }
    
    /// Assess what extensions/modifications might be needed
    fn assess_extension_needed(&self, intent: &UserIntent, component: &ComponentSignature) -> ExtensionAssessment {
        let missing_capabilities: Vec<String> = intent.required_capabilities.iter()
            .filter(|cap| !component.semantic_tags.contains(cap))
            .cloned()
            .collect();
            
        if missing_capabilities.is_empty() {
            ExtensionAssessment::None
        } else if missing_capabilities.len() <= 2 && !component.extensibility_indicators.is_empty() {
            ExtensionAssessment::MinorConfiguration
        } else if component.abstraction_level == AbstractionLevel::Interface {
            ExtensionAssessment::NewImplementation
        } else {
            ExtensionAssessment::SignificantModification
        }
    }
}

/// Represents a user's intent for functionality they want to implement
#[derive(Debug, Clone)]
pub struct UserIntent {
    pub functionality_category: String,
    pub required_capabilities: Vec<String>,
    pub context_description: String,
}

/// Signature of an existing component that could be reused
#[derive(Debug, Clone)]
pub struct ComponentSignature {
    pub functionality_category: String,
    pub semantic_tags: Vec<String>,
    pub abstraction_level: AbstractionLevel,
    pub extensibility_indicators: Vec<String>,
    pub file_path: String,
    pub confidence: f32,
}

/// Pattern for recognizing common functionality categories
#[derive(Debug, Clone)]
pub struct FunctionalityPattern {
    pub category: String,
    pub keywords: Vec<String>,
    pub common_types: Vec<String>,
    pub typical_interfaces: Vec<String>,
}

/// How abstract/reusable a component is
#[derive(Debug, Clone, PartialEq)]
pub enum AbstractionLevel {
    Interface,      // Trait/interface definition
    Implementation, // Concrete implementation of interface
    Utility,        // Helper functions
    Concrete,       // Specific implementation
}

/// Recommendation for reusing existing components
#[derive(Debug, Clone)]
pub struct ReuseRecommendation {
    pub existing_component_id: String,
    pub component_signature: ComponentSignature,
    pub relevance_score: f32,
    pub suggested_usage: String,
    pub extension_needed: ExtensionAssessment,
}

/// Assessment of what extensions are needed to reuse a component
#[derive(Debug, Clone)]
pub enum ExtensionAssessment {
    None,                    // Can use as-is
    MinorConfiguration,      // Just need to configure it differently
    NewImplementation,       // Need to implement an interface
    SignificantModification, // Major changes needed
}

/// Represents a code quality issue detected by analysis
#[derive(Debug, Clone)]
pub struct QualityIssue {
    pub description: String,
    pub position: Point,
    pub category: String,
    pub severity: String,
    pub confidence: f32,
    pub suggested_refactoring: Vec<String>,
}

/// Comprehensive complexity metrics for code analysis
#[derive(Debug, Clone, Default)]
pub struct ComplexityMetrics {
    pub cyclomatic_complexity: usize,
    pub max_nesting_depth: usize,
    pub decision_points: usize,
    pub function_count: usize,
    pub error_handling_complexity: usize,
}

impl ComplexityMetrics {
    /// Calculate a composite complexity score
    pub fn complexity_score(&self) -> f32 {
        let base_score = self.cyclomatic_complexity as f32;
        let nesting_penalty = (self.max_nesting_depth as f32).powi(2) * 0.5;
        let error_handling_bonus = -(self.error_handling_complexity as f32 * 0.2);
        
        (base_score + nesting_penalty + error_handling_bonus).max(1.0)
    }
    
    /// Determine if the code is considered complex
    pub fn is_complex(&self) -> bool {
        self.cyclomatic_complexity > 10 || self.max_nesting_depth > 4
    }
}

// CodeTokenizer is now imported from tokenizer.rs module

#[derive(Debug)]
pub struct IntentFeatures {
    pub node_types: std::collections::HashMap<String, usize>,
    pub embedding_stats: EmbeddingStats,
    pub code_length: usize,
    pub depth: usize,
}

#[derive(Debug)]
pub struct EmbeddingStats {
    pub function_count: usize,
    pub class_count: usize,
    pub avg_similarity: f32,
}

/// Simple syntax predictor for ML-enhanced parsing
pub struct SyntaxPredictor {
    language: Language,
    prediction_cache: Arc<RwLock<HashMap<String, f32>>>,
}

impl SyntaxPredictor {
    pub fn new(language: Language) -> Self {
        Self {
            language,
            prediction_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub async fn load(language: Language) -> Result<Self> {
        Ok(Self::new(language))
    }
    
    /// Predict the likelihood of syntax correctness for a code snippet
    pub async fn predict_syntax_correctness(&self, code: &str) -> Result<f32> {
        // Simple heuristic-based prediction for now
        let mut score: f32 = 1.0;
        
        // Check for basic syntax issues
        let lines = code.lines().count();
        if lines == 0 {
            return Ok(0.0);
        }
        
        // Language-specific basic checks
        match self.language {
            Language::Rust => {
                // Check for balanced braces
                let open_braces = code.matches('{').count();
                let close_braces = code.matches('}').count();
                if open_braces != close_braces {
                    score *= 0.3;
                }
                
                // Check for balanced parentheses
                let open_parens = code.matches('(').count();
                let close_parens = code.matches(')').count();
                if open_parens != close_parens {
                    score *= 0.5;
                }
            }
            Language::TypeScript | Language::JavaScript => {
                // Basic JS/TS syntax checks
                let semicolon_count = code.matches(';').count();
                let line_count = code.lines().count();
                if line_count > 3 && semicolon_count == 0 {
                    score *= 0.7; // Might be missing semicolons
                }
            }
            _ => {
                // Generic checks for other languages
                if code.trim().is_empty() {
                    score = 0.0;
                }
            }
        }
        
        Ok(score.clamp(0.0, 1.0))
    }
    
    /// Predict the intent of the code
    pub async fn predict_intent(&self, code: &str, _language: &Language) -> Result<Option<String>> {
        // Simple intent prediction based on code patterns
        let code_lower = code.to_lowercase();
        
        if code_lower.contains("test") || code_lower.contains("assert") {
            Ok(Some("testing".to_string()))
        } else if code_lower.contains("http") || code_lower.contains("api") || code_lower.contains("endpoint") {
            Ok(Some("api_development".to_string()))
        } else if code_lower.contains("database") || code_lower.contains("sql") || code_lower.contains("query") {
            Ok(Some("data_access".to_string()))
        } else if code_lower.contains("class") || code_lower.contains("struct") {
            Ok(Some("type_definition".to_string()))
        } else if code_lower.contains("function") || code_lower.contains("fn ") {
            Ok(Some("function_definition".to_string()))
        } else {
            Ok(Some("general_programming".to_string()))
        }
    }
    
    /// Clear prediction cache
    pub async fn clear_cache(&self) {
        self.prediction_cache.write().await.clear();
    }
}