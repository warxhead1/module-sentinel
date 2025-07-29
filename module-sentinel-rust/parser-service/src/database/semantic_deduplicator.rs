// Simplified semantic deduplicator
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::parsers::tree_sitter::{CodeEmbedder, Symbol, SimilarSymbol, SimilarityType};

/// Simple deduplication engine that finds similar code
pub struct SemanticDeduplicator {
    embedder: Arc<CodeEmbedder>,
    similarity_engine: Arc<RwLock<SimilarityEngine>>,
    thresholds: Arc<RwLock<SimilarityThresholds>>,
}

/// Similarity thresholds for different confidence levels
#[derive(Debug, Clone)]
pub struct SimilarityThresholds {
    pub high_confidence: f32,     // 0.9+ - Definitely same symbol
    pub medium_confidence: f32,   // 0.7+ - Likely same symbol
    pub low_confidence: f32,      // 0.5+ - Possibly same symbol
}

/// Simple similarity engine
#[derive(Debug)]
pub struct SimilarityEngine {
    algorithm_weights: AlgorithmWeights,
    correction_history: Vec<CorrectionRecord>,
}

/// Record of a correction made to similarity scoring
#[derive(Debug, Clone)]
pub struct CorrectionRecord {
    pub symbol1_signature: String,
    pub symbol2_signature: String,
    pub predicted_similarity: f32,
    pub actual_similarity: f32,
    pub reason: String,
}

/// Weights for different similarity algorithms
#[derive(Debug, Clone)]
pub struct AlgorithmWeights {
    pub name_similarity: f32,
    pub signature_similarity: f32, 
    pub behavioral_similarity: f32,
    pub embedding_similarity: f32,
}

/// Groups of symbols that are semantic duplicates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub group_id: String,
    pub primary_symbol: Symbol,
    pub duplicate_symbols: Vec<Symbol>,
    pub similarity_scores: HashMap<String, f32>,
    pub group_confidence: f32,
    pub deduplication_strategy: DeduplicationStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeduplicationStrategy {
    AutoMerge,           // High confidence - automatically merge
    SuggestMerge,        // Medium confidence - suggest to developer
    FlagForReview,       // Low confidence - flag for manual review
    KeepSeparate,        // Different enough to keep separate
}

/// Insights into deduplication performance
#[derive(Debug)]
pub struct DeduplicationInsights {
    pub total_duplicate_groups: usize,
    pub high_confidence_groups: usize,
    pub medium_confidence_groups: usize,
    pub low_confidence_groups: usize,
}

impl SemanticDeduplicator {
    pub async fn new(embedder: Arc<CodeEmbedder>) -> Result<Self> {
        Ok(Self {
            embedder,
            similarity_engine: Arc::new(RwLock::new(SimilarityEngine::new())),
            thresholds: Arc::new(RwLock::new(SimilarityThresholds::default())),
        })
    }
    
    /// Find duplicate groups in a set of symbols
    pub async fn find_duplicates(&self, symbols: &[Symbol]) -> Result<Vec<DuplicateGroup>> {
        info!("Starting semantic deduplication for {} symbols", symbols.len());
        
        // First, ensure all symbols have embeddings
        let mut symbols_with_embeddings = symbols.to_vec();
        for symbol in &mut symbols_with_embeddings {
            if symbol.embedding.is_none() {
                // Generate embedding for this symbol using signature as text
                match self.embedder.generate_embeddings(&symbol.signature, &symbol.language).await {
                    Ok(embedding) => {
                        symbol.embedding = Some(embedding);
                        tracing::debug!("Generated embedding for symbol: {}", symbol.name);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to generate embedding for symbol {}: {}", symbol.name, e);
                    }
                }
            }
        }
        
        let mut duplicate_groups = Vec::new();
        let mut processed_symbols = std::collections::HashSet::new();
        
        for (i, symbol) in symbols_with_embeddings.iter().enumerate() {
            if processed_symbols.contains(&symbol.id) {
                continue;
            }
            
            let mut duplicates = Vec::new();
            let mut similarity_scores = HashMap::new();
            
            // Compare with remaining symbols
            for other_symbol in symbols_with_embeddings.iter().skip(i + 1) {
                if processed_symbols.contains(&other_symbol.id) {
                    continue;
                }
                
                let similarity = self.similarity_score(symbol, other_symbol).await?;
                let thresholds = self.thresholds.read().await;
                
                if similarity >= thresholds.low_confidence {
                    duplicates.push(other_symbol.clone());
                    similarity_scores.insert(other_symbol.id.clone(), similarity);
                }
            }
            
            if !duplicates.is_empty() {
                // Mark all symbols in group as processed
                processed_symbols.insert(symbol.id.clone());
                for dup in &duplicates {
                    processed_symbols.insert(dup.id.clone());
                }
                
                let group_confidence = if !duplicates.is_empty() {
                    similarity_scores.values().sum::<f32>() / duplicates.len() as f32
                } else {
                    0.0
                };
                
                let strategy = self.determine_deduplication_strategy(group_confidence).await;
                
                duplicate_groups.push(DuplicateGroup {
                    group_id: uuid::Uuid::new_v4().to_string(),
                    primary_symbol: symbol.clone(),
                    duplicate_symbols: duplicates,
                    similarity_scores,
                    group_confidence,
                    deduplication_strategy: strategy,
                });
            }
        }
        
        info!("Deduplication complete. Found {} duplicate groups", duplicate_groups.len());
        Ok(duplicate_groups)
    }
    
    /// Calculate similarity between two symbols
    pub async fn similarity_score(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<f32> {
        // First check if we have a correction for this type of comparison
        if let Some(corrected_similarity) = self.check_correction_history(symbol1, symbol2).await {
            return Ok(corrected_similarity);
        }
        
        let similarity_engine = self.similarity_engine.read().await;
        
        // Calculate individual similarity components
        let name_sim = self.calculate_name_similarity(&symbol1.name, &symbol2.name);
        let sig_sim = self.calculate_signature_similarity(&symbol1.signature, &symbol2.signature);
        let context_sim = self.calculate_context_similarity(symbol1, symbol2);
        let embedding_sim = if let (Some(emb1), Some(emb2)) = (&symbol1.embedding, &symbol2.embedding) {
            self.cosine_similarity(emb1, emb2)
        } else {
            0.0
        };
        
        // Apply weights
        let weights = &similarity_engine.algorithm_weights;
        let weighted_similarity = (
            name_sim * weights.name_similarity +
            sig_sim * weights.signature_similarity +
            context_sim * weights.behavioral_similarity +
            embedding_sim * weights.embedding_similarity
        ) / (weights.name_similarity + weights.signature_similarity + 
             weights.behavioral_similarity + weights.embedding_similarity);
        
        Ok(weighted_similarity.min(1.0))
    }
    
    /// Check if two symbols are similar above threshold
    pub async fn are_similar(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<bool> {
        let similarity = self.similarity_score(symbol1, symbol2).await?;
        let thresholds = self.thresholds.read().await;
        Ok(similarity >= thresholds.low_confidence)
    }
    
    /// Get insights about deduplication
    pub async fn get_deduplication_insights(&self, groups: &[DuplicateGroup]) -> DeduplicationInsights {
        let thresholds = self.thresholds.read().await;
        
        let high_confidence = groups.iter()
            .filter(|g| g.group_confidence >= thresholds.high_confidence)
            .count();
            
        let medium_confidence = groups.iter()
            .filter(|g| g.group_confidence >= thresholds.medium_confidence && 
                        g.group_confidence < thresholds.high_confidence)
            .count();
            
        let low_confidence = groups.iter()
            .filter(|g| g.group_confidence >= thresholds.low_confidence && 
                        g.group_confidence < thresholds.medium_confidence)
            .count();
        
        DeduplicationInsights {
            total_duplicate_groups: groups.len(),
            high_confidence_groups: high_confidence,
            medium_confidence_groups: medium_confidence,
            low_confidence_groups: low_confidence,
        }
    }
    
    /// Merge similar symbols by updating their relationships
    pub async fn merge_similar_symbols(&self, symbols: Vec<Symbol>) -> Result<Vec<Symbol>> {
        let mut merged_symbols = Vec::new();
        let duplicate_groups = self.find_duplicates(&symbols).await?;
        
        // Create a mapping of which symbols are duplicates
        let mut duplicate_map: HashMap<String, String> = HashMap::new();
        
        for group in &duplicate_groups {
            for duplicate in &group.duplicate_symbols {
                duplicate_map.insert(duplicate.id.clone(), group.primary_symbol.id.clone());
            }
        }
        
        // Process symbols, updating relationships for duplicates
        for mut symbol in symbols {
            if let Some(primary_id) = duplicate_map.get(&symbol.id) {
                // This is a duplicate - mark it as such
                symbol.duplicate_of = Some(primary_id.clone());
                
                // Find the similarity score
                if let Some(group) = duplicate_groups.iter().find(|g| 
                    g.duplicate_symbols.iter().any(|d| d.id == symbol.id)) {
                    symbol.confidence_score = group.similarity_scores.get(&symbol.id).copied();
                }
            } else if duplicate_groups.iter().any(|g| g.primary_symbol.id == symbol.id) {
                // This is a primary symbol - add similar symbols list
                if let Some(group) = duplicate_groups.iter().find(|g| g.primary_symbol.id == symbol.id) {
                    symbol.similar_symbols = group.duplicate_symbols.iter().map(|dup| SimilarSymbol {
                        symbol_id: dup.id.clone(),
                        similarity_score: group.similarity_scores.get(&dup.id).copied().unwrap_or(0.0),
                        relationship_type: self.classify_similarity_type(
                            group.similarity_scores.get(&dup.id).copied().unwrap_or(0.0)
                        ),
                    }).collect();
                }
            }
            
            merged_symbols.push(symbol);
        }
        
        Ok(merged_symbols)
    }
    
    // Helper methods
    
    fn calculate_name_similarity(&self, name1: &str, name2: &str) -> f32 {
        let n1_lower = name1.to_lowercase();
        let n2_lower = name2.to_lowercase();
        
        if n1_lower == n2_lower {
            return 1.0;
        }
        
        // Normalize naming conventions
        let n1_normalized = n1_lower.replace(['_', '-'], "");
        let n2_normalized = n2_lower.replace(['_', '-'], "");
        
        if n1_normalized == n2_normalized {
            return 0.9;
        }
        
        // Check for common prefixes
        let common_prefix_len = n1_lower.chars()
            .zip(n2_lower.chars())
            .take_while(|(a, b)| a == b)
            .count();
            
        if common_prefix_len >= 4 && common_prefix_len >= n1_lower.len().min(n2_lower.len()) / 2 {
            return 0.7;
        }
        
        0.0
    }
    
    fn calculate_signature_similarity(&self, sig1: &str, sig2: &str) -> f32 {
        if sig1 == sig2 {
            return 1.0;
        }
        
        // Simple parameter count comparison
        let params1 = sig1.matches(',').count();
        let params2 = sig2.matches(',').count();
        
        if params1 == params2 {
            return 0.5;
        }
        
        0.0
    }
    
    fn calculate_context_similarity(&self, symbol1: &Symbol, symbol2: &Symbol) -> f32 {
        // Same file
        if symbol1.file_path == symbol2.file_path {
            return 0.8;
        }
        
        // Same directory
        let path1 = std::path::Path::new(&symbol1.file_path);
        let path2 = std::path::Path::new(&symbol2.file_path);
        
        if path1.parent() == path2.parent() {
            return 0.5;
        }
        
        0.0
    }
    
    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if norm_a == 0.0 || norm_b == 0.0 {
            0.0
        } else {
            dot_product / (norm_a * norm_b)
        }
    }
    
    async fn determine_deduplication_strategy(&self, confidence: f32) -> DeduplicationStrategy {
        let thresholds = self.thresholds.read().await;
        
        if confidence >= thresholds.high_confidence {
            DeduplicationStrategy::AutoMerge
        } else if confidence >= thresholds.medium_confidence {
            DeduplicationStrategy::SuggestMerge
        } else if confidence >= thresholds.low_confidence {
            DeduplicationStrategy::FlagForReview
        } else {
            DeduplicationStrategy::KeepSeparate
        }
    }
    
    fn classify_similarity_type(&self, similarity: f32) -> SimilarityType {
        if similarity > 0.95 {
            SimilarityType::ExactDuplicate
        } else if similarity > 0.8 {
            SimilarityType::SemanticDuplicate
        } else if similarity > 0.6 {
            SimilarityType::FunctionalSimilar
        } else {
            SimilarityType::NameSimilar
        }
    }
    
    /// Learn from a correction where predicted similarity was wrong
    pub async fn learn_from_correction(
        &self,
        symbol1: &Symbol,
        symbol2: &Symbol,
        predicted_similarity: f32,
        actual_similarity: f32,
        reason: &str,
    ) -> Result<()> {
        let mut engine = self.similarity_engine.write().await;
        
        // Record the correction
        engine.correction_history.push(CorrectionRecord {
            symbol1_signature: symbol1.signature.clone(),
            symbol2_signature: symbol2.signature.clone(),
            predicted_similarity,
            actual_similarity,
            reason: reason.to_string(),
        });
        
        // Adjust weights based on the correction
        // If we predicted too high similarity, reduce weights for components that contributed
        if predicted_similarity > actual_similarity {
            let diff = predicted_similarity - actual_similarity;
            
            // Check which components were misleading
            let name_sim = self.calculate_name_similarity(&symbol1.name, &symbol2.name);
            let sig_sim = self.calculate_signature_similarity(&symbol1.signature, &symbol2.signature);
            
            // If names were similar but actual similarity is low, reduce name weight
            if name_sim > 0.7 && diff > 0.3 {
                engine.algorithm_weights.name_similarity *= 0.9;
                engine.algorithm_weights.embedding_similarity *= 1.1; // Increase embedding weight
                info!("Adjusted weights: reduced name similarity weight due to correction");
            }
            
            // If signatures were similar but actual similarity is low, reduce signature weight
            if sig_sim > 0.7 && diff > 0.3 {
                engine.algorithm_weights.signature_similarity *= 0.9;
                engine.algorithm_weights.embedding_similarity *= 1.1;
                info!("Adjusted weights: reduced signature similarity weight due to correction");
            }
        }
        
        // Normalize weights to ensure they sum to 1.0
        let total = engine.algorithm_weights.name_similarity 
            + engine.algorithm_weights.signature_similarity
            + engine.algorithm_weights.behavioral_similarity
            + engine.algorithm_weights.embedding_similarity;
            
        if total > 0.0 {
            engine.algorithm_weights.name_similarity /= total;
            engine.algorithm_weights.signature_similarity /= total;
            engine.algorithm_weights.behavioral_similarity /= total;
            engine.algorithm_weights.embedding_similarity /= total;
        }
        
        Ok(())
    }
    
    /// Check if we've learned from similar corrections before
    pub async fn check_correction_history(&self, symbol1: &Symbol, symbol2: &Symbol) -> Option<f32> {
        let engine = self.similarity_engine.read().await;
        
        // Look for similar corrections in history
        for record in &engine.correction_history {
            // Check for exact match first
            if (record.symbol1_signature == symbol1.signature && record.symbol2_signature == symbol2.signature) ||
               (record.symbol1_signature == symbol2.signature && record.symbol2_signature == symbol1.signature) {
                return Some(record.actual_similarity);
            }
            
            // Check if this is a similar comparison (e.g., parsers for different formats)
            let sig1_match = record.symbol1_signature.contains("parse") && symbol1.signature.contains("parse");
            let sig2_match = record.symbol2_signature.contains("parse") && symbol2.signature.contains("parse");
            
            if sig1_match && sig2_match {
                // Check if they're parsing different formats (like JSON vs XML)
                let format1_old = extract_format(&record.symbol1_signature);
                let format2_old = extract_format(&record.symbol2_signature);
                let format1_new = extract_format(&symbol1.signature);
                let format2_new = extract_format(&symbol2.signature);
                
                if format1_old != format2_old && format1_new != format2_new {
                    // We've learned that parsers for different formats should have low similarity
                    return Some(record.actual_similarity);
                }
            }
        }
        
        None
    }
}

impl SimilarityEngine {
    pub fn new() -> Self {
        Self {
            algorithm_weights: AlgorithmWeights::default(),
            correction_history: Vec::new(),
        }
    }
    
    pub fn analyze_context_similarity(&self, _symbol1: &Symbol, _symbol2: &Symbol) -> f32 {
        // Simple context analysis
        0.1
    }
}

impl Default for SimilarityThresholds {
    fn default() -> Self {
        Self {
            high_confidence: 0.9,
            medium_confidence: 0.7,
            low_confidence: 0.5,
        }
    }
}

impl Default for AlgorithmWeights {
    fn default() -> Self {
        Self {
            name_similarity: 0.3,
            signature_similarity: 0.4,
            behavioral_similarity: 0.2,
            embedding_similarity: 0.1,
        }
    }
}

/// Helper function to extract format from a parser signature
fn extract_format(signature: &str) -> &str {
    if signature.contains("JsonValue") || signature.to_lowercase().contains("json") {
        "json"
    } else if signature.contains("XmlValue") || signature.to_lowercase().contains("xml") {
        "xml"
    } else if signature.contains("YamlValue") || signature.to_lowercase().contains("yaml") {
        "yaml"
    } else if signature.contains("TomlValue") || signature.to_lowercase().contains("toml") {
        "toml"
    } else {
        "unknown"
    }
}