pub mod tree_sitter;

pub use tree_sitter::{Language, TreeSitterParser, ParseResult, ParseError};
pub use crate::database::ParseResults;

// Stub implementation for ParserManager
use anyhow::Result;
use std::path::PathBuf;
use crate::patterns::PatternEngine;
use crate::config::PerfMode;

pub struct ParserManager;

impl ParserManager {
    pub async fn new(_pattern_engine: PatternEngine, _perf_mode: PerfMode) -> Result<Self> {
        Ok(Self)
    }
    
    pub async fn parse_project(&self, 
        _project_path: &PathBuf, 
        _languages: &[String], 
        _workers: usize,
        _include: Vec<String>,
        _exclude: Vec<String>
    ) -> Result<crate::database::ParseResults> {
        Ok(crate::database::ParseResults {
            total_files: 0,
            total_symbols: 0,
            total_relationships: 0,
            errors: vec![],
        })
    }
}