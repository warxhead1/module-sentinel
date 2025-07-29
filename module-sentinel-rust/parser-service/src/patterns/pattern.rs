use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub query: String,
    pub captures: HashMap<String, CaptureProcessor>,
    pub confidence: f32,
    pub min_version: Option<String>,
    pub max_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CaptureProcessor {
    ExtractIdentifier,
    ExtractModulePath,
    ExtractString,
    Custom(String),
}

#[derive(Debug, Clone)]
pub struct PatternMatch {
    pub capture_name: String,
    pub text: String,
    pub start_byte: usize,
    pub end_byte: usize,
}

impl Pattern {
    pub fn find_matches(&self, language: &str, source: &str) -> Result<Vec<PatternMatch>> {
        use tree_sitter::{Parser, Query, QueryCursor, StreamingIterator};
        
        // Get the appropriate tree-sitter language
        let ts_language = match language {
            "rust" => tree_sitter_rust::LANGUAGE.into(),
            "cpp" | "c++" => tree_sitter_cpp::LANGUAGE.into(),
            "python" => tree_sitter_python::LANGUAGE.into(),
            "typescript" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            "javascript" => tree_sitter_javascript::LANGUAGE.into(),
            "go" => tree_sitter_go::LANGUAGE.into(),
            "java" => tree_sitter_java::LANGUAGE.into(),
            "c_sharp" | "csharp" => tree_sitter_c_sharp::LANGUAGE.into(),
            _ => {
                tracing::warn!("Unsupported language for pattern matching: {}", language);
                return Ok(vec![]);
            }
        };
        
        // Parse the source code
        let mut parser = Parser::new();
        parser.set_language(&ts_language)?;
        
        let tree = match parser.parse(source, None) {
            Some(tree) => tree,
            None => {
                tracing::warn!("Failed to parse source code for pattern matching");
                return Ok(vec![]);
            }
        };
        
        // Create and execute the query
        let query = match Query::new(&ts_language, &self.query) {
            Ok(query) => query,
            Err(e) => {
                tracing::warn!("Invalid tree-sitter query: {} - Error: {}", self.query, e);
                return Ok(vec![]);
            }
        };
        
        let mut cursor = QueryCursor::new();
        let mut pattern_matches = Vec::new();
        
        // Use the proper QueryMatches API with while loop
        let text_provider = source.as_bytes();
        let mut matches = cursor.matches(&query, tree.root_node(), text_provider);
        
        // Use a while loop to iterate through matches
        while let Some(query_match) = matches.next() {
            for capture in query_match.captures {
                let capture_name = query.capture_names()[capture.index as usize].to_string();
                let node = capture.node;
                
                // Extract text safely
                let text = match node.utf8_text(text_provider) {
                    Ok(text) => text,
                    Err(_) => {
                        tracing::warn!("Failed to extract text for capture: {}", capture_name);
                        continue;
                    }
                };
                
                pattern_matches.push(PatternMatch {
                    capture_name,
                    text: text.to_string(),
                    start_byte: node.start_byte(),
                    end_byte: node.end_byte(),
                });
            }
        }
        
        tracing::debug!("Tree-sitter pattern matching for language '{}' found {} matches", language, pattern_matches.len());
        Ok(pattern_matches)
    }
    
    pub fn is_compatible_with_version(&self, version: &str) -> bool {
        let version_parts: Vec<u32> = version.split('.').filter_map(|s| s.parse().ok()).collect();
        
        if let Some(min_ver) = &self.min_version {
            let min_parts: Vec<u32> = min_ver.split('.').filter_map(|s| s.parse().ok()).collect();
            if !Self::version_gte(&version_parts, &min_parts) {
                return false;
            }
        }
        
        if let Some(max_ver) = &self.max_version {
            let max_parts: Vec<u32> = max_ver.split('.').filter_map(|s| s.parse().ok()).collect();
            if !Self::version_lt(&version_parts, &max_parts) {
                return false;
            }
        }
        
        true
    }
    
    fn version_gte(v1: &[u32], v2: &[u32]) -> bool {
        for i in 0..v2.len() {
            if i >= v1.len() {
                return false;
            }
            if v1[i] > v2[i] {
                return true;
            }
            if v1[i] < v2[i] {
                return false;
            }
        }
        true
    }
    
    fn version_lt(v1: &[u32], v2: &[u32]) -> bool {
        for i in 0..v2.len() {
            if i >= v1.len() {
                return true;
            }
            if v1[i] < v2[i] {
                return true;
            }
            if v1[i] > v2[i] {
                return false;
            }
        }
        false
    }
    
    pub fn is_high_confidence(&self) -> bool {
        self.confidence >= 0.8
    }
    
    pub fn process_capture(&self, capture_name: &str, value: &str) -> String {
        match self.captures.get(capture_name) {
            Some(CaptureProcessor::ExtractModulePath) => {
                // Remove ./ prefix if present
                value.strip_prefix("./").unwrap_or(value).to_string()
            }
            _ => value.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompositePattern {
    pub is_composite: bool,
    pub requires: Vec<String>,
    pub query: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PatternSet {
    pub function_patterns: Vec<Pattern>,
    pub class_patterns: Vec<Pattern>,
    pub variable_patterns: Vec<Pattern>,
    pub import_patterns: Vec<Pattern>,
    pub inheritance_patterns: Vec<Pattern>,
    pub call_patterns: Vec<Pattern>,
    pub usage_patterns: Vec<Pattern>,
    pub subprocess_patterns: Vec<Pattern>,
    pub api_patterns: Vec<Pattern>,
    pub ffi_patterns: Vec<Pattern>,
    pub composite_patterns: HashMap<String, CompositePattern>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CrossLanguagePatterns {
    pub subprocess_patterns: Vec<CrossLanguagePattern>,
    pub api_patterns: Vec<CrossLanguagePattern>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossLanguagePattern {
    pub pattern: String,
    pub confidence: f32,
    pub capture_groups: HashMap<usize, String>,
}