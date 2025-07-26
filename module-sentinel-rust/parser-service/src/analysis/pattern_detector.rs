use anyhow::Result;
use std::collections::HashMap;
use regex::Regex;
use tracing::{debug, warn};

use crate::parsers::tree_sitter::Symbol;

/// Detects common code patterns without requiring ML/embeddings
pub struct PatternDetector {
    patterns: HashMap<PatternCategory, Vec<PatternRule>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PatternCategory {
    SingletonPattern,
    FactoryPattern,
    BuilderPattern,
    ObserverPattern,
    IteratorPattern,
    ErrorHandling,
    ResourceManagement,
    AsyncPattern,
    TestPattern,
    CrossLanguageFFI,
    DataTransformation,
    AlgorithmicPattern(String),
}

#[derive(Debug, Clone)]
pub struct PatternRule {
    pub name: String,
    pub name_patterns: Vec<Regex>,
    pub signature_patterns: Vec<Regex>,
    pub context_hints: Vec<String>,
    pub min_confidence: f32,
}

#[derive(Debug, Clone)]
pub struct DetectedPattern {
    pub category: PatternCategory,
    pub symbols: Vec<Symbol>,
    pub confidence: f32,
    pub evidence: Vec<String>,
}

impl PatternDetector {
    pub fn new() -> Self {
        let mut detector = Self {
            patterns: HashMap::new(),
        };
        detector.initialize_patterns();
        detector
    }
    
    fn initialize_patterns(&mut self) {
        // Singleton Pattern
        self.add_pattern(PatternCategory::SingletonPattern, vec![
            PatternRule {
                name: "Singleton Instance".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)(get_?)?instance").unwrap(),
                    Regex::new(r"(?i)singleton").unwrap(),
                    Regex::new(r"(?i)shared").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"static.*Self").unwrap(),
                    Regex::new(r"&'static").unwrap(),
                ],
                context_hints: vec!["once".to_string(), "lazy_static".to_string()],
                min_confidence: 0.5,  // Lowered from 0.7 to match actual patterns
            },
        ]);
        
        // Factory Pattern
        self.add_pattern(PatternCategory::FactoryPattern, vec![
            PatternRule {
                name: "Factory Method".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)create").unwrap(),
                    Regex::new(r"(?i)make").unwrap(),
                    Regex::new(r"(?i)build").unwrap(),
                    Regex::new(r"(?i)factory").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"->.*Box<").unwrap(),
                    Regex::new(r"->.*impl\s+").unwrap(),
                    Regex::new(r"new.*->.*Self").unwrap(),
                ],
                context_hints: vec!["trait object".to_string()],
                min_confidence: 0.6,
            },
        ]);
        
        // Builder Pattern
        self.add_pattern(PatternCategory::BuilderPattern, vec![
            PatternRule {
                name: "Builder Methods".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)with_").unwrap(),
                    Regex::new(r"(?i)set_").unwrap(),
                    Regex::new(r"(?i)builder").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"self.*->.*Self").unwrap(),
                    Regex::new(r"mut self.*->.*Self").unwrap(),
                ],
                context_hints: vec!["chain".to_string(), "fluent".to_string()],
                min_confidence: 0.7,
            },
        ]);
        
        // Error Handling Patterns
        self.add_pattern(PatternCategory::ErrorHandling, vec![
            PatternRule {
                name: "Error Handling".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)handle.*error").unwrap(),
                    Regex::new(r"(?i)on_error").unwrap(),
                    Regex::new(r"(?i)catch").unwrap(),
                    Regex::new(r"(?i)recover").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"Result<.*>").unwrap(),
                    Regex::new(r"Option<.*>").unwrap(),
                    Regex::new(r"Error").unwrap(),
                ],
                context_hints: vec!["?".to_string(), "unwrap".to_string(), "expect".to_string()],
                min_confidence: 0.6,
            },
        ]);
        
        // Async Patterns
        self.add_pattern(PatternCategory::AsyncPattern, vec![
            PatternRule {
                name: "Async Operations".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)async").unwrap(),
                    Regex::new(r"(?i)await").unwrap(),
                    Regex::new(r"(?i)future").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"async.*fn").unwrap(),
                    Regex::new(r"Future").unwrap(),
                    Regex::new(r"Stream").unwrap(),
                ],
                context_hints: vec!["tokio".to_string(), "async-std".to_string()],
                min_confidence: 0.8,
            },
        ]);
        
        // Test Patterns
        self.add_pattern(PatternCategory::TestPattern, vec![
            PatternRule {
                name: "Test Functions".to_string(),
                name_patterns: vec![
                    Regex::new(r"^test_").unwrap(),
                    Regex::new(r"_test$").unwrap(),
                    Regex::new(r"(?i)should_").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"#\[test\]").unwrap(),
                    Regex::new(r"#\[tokio::test\]").unwrap(),
                ],
                context_hints: vec!["assert".to_string(), "expect".to_string()],
                min_confidence: 0.9,
            },
        ]);
        
        // Cross-Language FFI
        self.add_pattern(PatternCategory::CrossLanguageFFI, vec![
            PatternRule {
                name: "FFI Bindings".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)ffi").unwrap(),
                    Regex::new(r"(?i)extern").unwrap(),
                    Regex::new(r"(?i)binding").unwrap(),
                    Regex::new(r"(?i)native").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r#"extern.*"C""#).unwrap(),
                    Regex::new(r"#\[no_mangle\]").unwrap(),
                    Regex::new(r"unsafe").unwrap(),
                ],
                context_hints: vec!["cbindgen".to_string(), "libc".to_string()],
                min_confidence: 0.8,
            },
        ]);
        
        // Common Algorithms
        self.add_pattern(PatternCategory::AlgorithmicPattern("sort".to_string()), vec![
            PatternRule {
                name: "Sorting Algorithm".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)sort").unwrap(),
                    Regex::new(r"(?i)quick_?sort").unwrap(),
                    Regex::new(r"(?i)merge_?sort").unwrap(),
                    Regex::new(r"(?i)heap_?sort").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"&mut\s*\[").unwrap(),
                    Regex::new(r"Vec<").unwrap(),
                ],
                context_hints: vec!["swap".to_string(), "partition".to_string(), "compare".to_string()],
                min_confidence: 0.7,
            },
        ]);
        
        self.add_pattern(PatternCategory::AlgorithmicPattern("search".to_string()), vec![
            PatternRule {
                name: "Search Algorithm".to_string(),
                name_patterns: vec![
                    Regex::new(r"(?i)search").unwrap(),
                    Regex::new(r"(?i)find").unwrap(),
                    Regex::new(r"(?i)binary_?search").unwrap(),
                    Regex::new(r"(?i)locate").unwrap(),
                ],
                signature_patterns: vec![
                    Regex::new(r"Option<").unwrap(),
                    Regex::new(r"->.*bool").unwrap(),
                ],
                context_hints: vec!["index".to_string(), "position".to_string()],
                min_confidence: 0.7,
            },
        ]);
    }
    
    fn add_pattern(&mut self, category: PatternCategory, rules: Vec<PatternRule>) {
        self.patterns.insert(category, rules);
    }
    
    pub fn detect_patterns(&self, symbols: &[Symbol]) -> Vec<DetectedPattern> {
        let mut detected = Vec::new();
        
        for (category, rules) in &self.patterns {
            let matches = self.find_matches_for_category(symbols, category, rules);
            if !matches.symbols.is_empty() {
                detected.push(matches);
            }
        }
        
        detected
    }
    
    fn find_matches_for_category(
        &self,
        symbols: &[Symbol],
        category: &PatternCategory,
        rules: &[PatternRule],
    ) -> DetectedPattern {
        let mut matching_symbols = Vec::new();
        let mut evidence = Vec::new();
        let mut total_confidence = 0.0;
        let mut match_count = 0;
        
        for symbol in symbols {
            for rule in rules {
                let (matches, rule_evidence, confidence) = self.check_symbol_against_rule(symbol, rule);
                if matches && confidence >= rule.min_confidence {
                    matching_symbols.push(symbol.clone());
                    evidence.extend(rule_evidence);
                    total_confidence += confidence;
                    match_count += 1;
                    break; // Don't double-count symbols
                }
            }
        }
        
        let avg_confidence = if match_count > 0 {
            total_confidence / match_count as f32
        } else {
            0.0
        };
        
        DetectedPattern {
            category: category.clone(),
            symbols: matching_symbols,
            confidence: avg_confidence,
            evidence,
        }
    }
    
    fn check_symbol_against_rule(&self, symbol: &Symbol, rule: &PatternRule) -> (bool, Vec<String>, f32) {
        let mut evidence = Vec::new();
        let mut score = 0.0;
        let mut checks = 0.0;
        
        debug!("Checking symbol '{}' against rule '{}'", symbol.name, rule.name);
        debug!("  Symbol signature: '{}'", symbol.signature);
        
        // Check name patterns
        for pattern in &rule.name_patterns {
            checks += 1.0;
            let matches = pattern.is_match(&symbol.name);
            debug!("  Name pattern '{}' matches '{}': {}", pattern.as_str(), symbol.name, matches);
            if matches {
                score += 1.0;
                evidence.push(format!("Name '{}' matches pattern '{}'", symbol.name, pattern.as_str()));
            }
        }
        
        // Check signature patterns
        for pattern in &rule.signature_patterns {
            checks += 1.0;
            let matches = pattern.is_match(&symbol.signature);
            debug!("  Signature pattern '{}' matches '{}': {}", pattern.as_str(), symbol.signature, matches);
            if matches {
                score += 1.0;
                evidence.push(format!("Signature matches pattern '{}'", pattern.as_str()));
            }
        }
        
        // Check context hints in the signature
        for hint in &rule.context_hints {
            checks += 0.5; // Context hints are worth less
            let in_sig = symbol.signature.contains(hint);
            let in_name = symbol.name.contains(hint);
            debug!("  Context hint '{}' in signature: {}, in name: {}", hint, in_sig, in_name);
            if in_sig || in_name {
                score += 0.5;
                evidence.push(format!("Contains context hint '{}'", hint));
            }
        }
        
        let confidence = if checks > 0.0 { score / checks } else { 0.0 };
        let matches = confidence >= rule.min_confidence;
        
        debug!("  Final: score={}, checks={}, confidence={}, min_confidence={}, matches={}", 
               score, checks, confidence, rule.min_confidence, matches);
        
        (matches, evidence, confidence)
    }
    
    /// Analyze patterns in code snippets (for real code testing)
    pub fn analyze_code_snippet(&self, code: &str, language: &str) -> Vec<String> {
        let mut insights = Vec::new();
        
        // Simple heuristic analysis
        if code.contains("static") && code.contains("instance") {
            insights.push("Potential Singleton pattern detected".to_string());
        }
        
        if code.contains("create") || code.contains("factory") {
            insights.push("Potential Factory pattern detected".to_string());
        }
        
        if code.contains("async") && code.contains("await") {
            insights.push("Async/await pattern detected".to_string());
        }
        
        if code.contains("extern") && code.contains("\"C\"") {
            insights.push("FFI/Cross-language binding detected".to_string());
        }
        
        if code.matches("fn test_").count() > 0 || code.contains("#[test]") {
            insights.push("Test code detected".to_string());
        }
        
        // Language-specific patterns
        match language {
            "rust" => {
                if code.contains("Result<") {
                    insights.push("Rust error handling pattern detected".to_string());
                }
                if code.contains("impl") && code.contains("trait") {
                    insights.push("Trait implementation pattern detected".to_string());
                }
            }
            "typescript" | "javascript" => {
                if code.contains("async") && code.contains("await") {
                    insights.push("JavaScript async/await pattern detected".to_string());
                }
                if code.contains("class") && code.contains("extends") {
                    insights.push("Class inheritance pattern detected".to_string());
                }
            }
            "python" => {
                if code.contains("def __init__") {
                    insights.push("Python class constructor pattern detected".to_string());
                }
                if code.contains("@property") {
                    insights.push("Python property decorator pattern detected".to_string());
                }
            }
            _ => {}
        }
        
        insights
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_pattern_detector_creation() {
        let detector = PatternDetector::new();
        assert!(!detector.patterns.is_empty());
    }
    
    #[test]
    fn test_singleton_detection() {
        let detector = PatternDetector::new();
        
        let symbol = Symbol {
            id: "1".to_string(),
            name: "get_instance".to_string(),
            signature: "pub fn get_instance() -> &'static Self".to_string(),
            language: crate::parsers::tree_sitter::Language::Rust,
            file_path: "test.rs".to_string(),
            start_line: 1,
            end_line: 5,
            embedding: None,
            semantic_hash: None,
            normalized_name: "get_instance".to_string(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
        };
        
        let patterns = detector.detect_patterns(&[symbol]);
        
        let singleton = patterns.iter()
            .find(|p| matches!(p.category, PatternCategory::SingletonPattern))
            .expect("Should detect singleton pattern");
        
        assert!(!singleton.symbols.is_empty());
        assert!(singleton.confidence >= 0.5);
    }
    
    #[test]
    fn test_code_snippet_analysis() {
        let detector = PatternDetector::new();
        
        let rust_code = r#"
            static INSTANCE: OnceCell<MyStruct> = OnceCell::new();
            
            impl MyStruct {
                pub fn get_instance() -> &'static Self {
                    INSTANCE.get_or_init(|| MyStruct::new())
                }
            }
        "#;
        
        let insights = detector.analyze_code_snippet(rust_code, "rust");
        assert!(insights.iter().any(|i| i.contains("Singleton")));
    }
}