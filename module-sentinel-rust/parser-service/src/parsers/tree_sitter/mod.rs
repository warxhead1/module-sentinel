mod parser;
mod language;
mod error_recovery;
mod ast_converter;
// mod intelligent_parser;
mod ml_integration;
mod model_manager;
mod tokenizer;

pub use parser::{TreeSitterParser, ParseResult, ParseError as TreeSitterParseError};
pub use language::Language;
pub use error_recovery::{ErrorRecoveryEngine, ErrorContext, ErrorPredictor, RecoverySuggestion};
pub use ast_converter::AstConverter;
// pub use intelligent_parser::{IntelligentTreeSitterParser, IntelligentParseResult, ErrorType, MLSuggestion, CodeIntent, SymbolEmbeddings, Symbol, SimilarSymbol, SimilarityType};

// Define Symbol struct with all fields from intelligent_parser.rs.backup
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Symbol {
    pub id: String,
    pub name: String,
    pub signature: String,
    pub language: Language,
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

// Define SimilarSymbol with correct structure
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimilarSymbol {
    pub symbol_id: String,
    pub similarity_score: f32,
    pub relationship_type: SimilarityType,
}

// Define SimilarityType enum
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum SimilarityType {
    ExactDuplicate,      // 0.95+
    SemanticDuplicate,   // 0.8+
    FunctionalSimilar,   // 0.6+
    StructuralSimilar,   // 0.4+    
    NameSimilar,         // 0.4+
}

// Define additional types for ML integration compatibility
#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub start_position: tree_sitter::Point,
    pub end_position: tree_sitter::Point,
    pub error_type: ErrorType,
    pub confidence: f32,
    pub ml_suggestions: Vec<MLSuggestion>,
}

#[derive(Debug, Clone)]
pub struct MLSuggestion {
    pub suggestion: String,
    pub confidence: f32,
    pub explanation: String,
    pub learned_from: Option<String>, // Reference to similar historical fix
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
pub enum ErrorType {
    SyntaxError,
    MissingToken(String),
    UnexpectedToken(String),
    IncompleteConstruct(String),
    SemanticError(String),
}
pub use ml_integration::{SyntaxPredictor, CodeEmbedder};
pub use model_manager::{ModelManager, ModelConfig};
pub use tokenizer::CodeTokenizer;

// Types are already defined and exported above