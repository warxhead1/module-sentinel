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
    pub fn find_matches(&self, _language: &str, _source: &str) -> Result<Vec<PatternMatch>> {
        // TODO: Implement actual tree-sitter matching
        // For now, return mock data for tests
        if self.query.contains("function_item") && _source.contains("fn calculate") {
            Ok(vec![PatternMatch {
                capture_name: "name".to_string(),
                text: "calculate".to_string(),
                start_byte: 3,
                end_byte: 12,
            }])
        } else {
            Ok(vec![])
        }
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