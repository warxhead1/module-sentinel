mod parser;
mod language;
mod error_recovery;
mod ast_converter;
mod intelligent_parser;
mod ml_integration;

pub use parser::{TreeSitterParser, ParseResult, ParseError};
pub use language::Language;
pub use error_recovery::{ErrorRecoveryEngine, ErrorContext, ErrorPredictor, RecoverySuggestion};
pub use ast_converter::AstConverter;
pub use intelligent_parser::{IntelligentTreeSitterParser, IntelligentParseResult, ErrorType, MLSuggestion, CodeIntent, SymbolEmbeddings, Symbol, SimilarSymbol, SimilarityType};
pub use ml_integration::{SyntaxPredictor, CodeEmbedder};