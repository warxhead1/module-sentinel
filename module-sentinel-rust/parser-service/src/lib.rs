pub mod ast;
pub mod parsers;
pub mod database;
pub mod models;
pub mod patterns;
pub mod analyzers;
pub mod config;
pub mod services;
pub mod analysis;

// Re-export commonly used types
pub use crate::parsers::{ParserManager, ParseResults};
pub use crate::config::PerfMode;