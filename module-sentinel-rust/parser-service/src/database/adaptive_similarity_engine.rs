// Simplified adaptive similarity engine
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::parsers::tree_sitter::{CodeEmbedder, Symbol};

/// Simple similarity calculation engine
pub struct AdaptiveSimilarityEngine {
    _embedder: Arc<CodeEmbedder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearnedSimilarity {
    pub pattern_id: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureVector {
    pub features: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlgorithmWeights {
    pub name_similarity: f32,
    pub signature_similarity: f32,
    pub behavioral_similarity: f32,
    pub embedding_similarity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccuracyTracker {
    pub overall_accuracy: f32,
}

impl AdaptiveSimilarityEngine {
    pub async fn new(embedder: Arc<CodeEmbedder>) -> Result<Self> {
        Ok(Self {
            _embedder: embedder,
        })
    }
    
    /// Calculate similarity between two symbols
    pub async fn calculate_adaptive_similarity(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<f32> {
        let mut similarity = 0.0;
        
        // Name similarity (40% weight)
        let name_sim = self.calculate_name_similarity(&symbol1.name, &symbol2.name);
        similarity += name_sim * 0.4;
        
        // Signature similarity (30% weight)
        let sig_sim = self.calculate_signature_similarity(&symbol1.signature, &symbol2.signature);
        similarity += sig_sim * 0.3;
        
        // File context similarity (20% weight)
        let context_sim = self.calculate_context_similarity(symbol1, symbol2);
        similarity += context_sim * 0.2;
        
        // Language match (10% weight)
        if symbol1.language == symbol2.language {
            similarity += 0.1;
        }
        
        Ok(similarity.min(1.0))
    }
    
    fn calculate_name_similarity(&self, name1: &str, name2: &str) -> f32 {
        let n1_lower = name1.to_lowercase();
        let n2_lower = name2.to_lowercase();
        
        if n1_lower == n2_lower {
            return 1.0;
        }
        
        // Normalize for different naming conventions
        let n1_normalized = n1_lower.replace(['_', '-'], "");
        let n2_normalized = n2_lower.replace(['_', '-'], "");
        
        if n1_normalized == n2_normalized {
            return 0.9;
        }
        
        // Check for common patterns
        if (n1_lower.starts_with("get") && n2_lower.starts_with("get")) ||
           (n1_lower.starts_with("set") && n2_lower.starts_with("set")) ||
           (n1_lower.starts_with("handle") && n2_lower.starts_with("handle")) {
            return 0.7;
        }
        
        // Basic substring match
        if n1_lower.contains(&n2_lower) || n2_lower.contains(&n1_lower) {
            return 0.5;
        }
        
        0.0
    }
    
    fn calculate_signature_similarity(&self, sig1: &str, sig2: &str) -> f32 {
        if sig1 == sig2 {
            return 1.0;
        }
        
        // Extract parameter count
        let params1 = sig1.matches(',').count() + if sig1.contains('(') && sig1.contains(')') { 1 } else { 0 };
        let params2 = sig2.matches(',').count() + if sig2.contains('(') && sig2.contains(')') { 1 } else { 0 };
        
        if params1 == params2 && params1 > 0 {
            return 0.7;
        }
        
        // Check for similar return types
        if sig1.contains("->") && sig2.contains("->") {
            let ret1 = sig1.split("->").nth(1).unwrap_or("").trim();
            let ret2 = sig2.split("->").nth(1).unwrap_or("").trim();
            if ret1 == ret2 {
                return 0.5;
            }
        }
        
        0.0
    }
    
    fn calculate_context_similarity(&self, symbol1: &Symbol, symbol2: &Symbol) -> f32 {
        // Same file
        if symbol1.file_path == symbol2.file_path {
            // Close proximity in the same file
            let line_distance = (symbol1.start_line as i32 - symbol2.start_line as i32).abs();
            if line_distance < 50 {
                return 1.0;
            } else if line_distance < 200 {
                return 0.7;
            } else {
                return 0.5;
            }
        }
        
        // Same directory
        let path1 = std::path::Path::new(&symbol1.file_path);
        let path2 = std::path::Path::new(&symbol2.file_path);
        
        if path1.parent() == path2.parent() {
            return 0.3;
        }
        
        0.0
    }
}