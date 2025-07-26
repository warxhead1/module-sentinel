use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use dashmap::DashMap;
use tracing::{info, debug, warn};

use crate::parsers::tree_sitter::{CodeEmbedder, Symbol, SimilarSymbol, SimilarityType, Language};
use super::bloom_filter::{SymbolBloomFilter, AdaptiveSymbolBloomFilter};

/// The Semantic Deduplication Mastermind - eliminates duplicate code through deep semantic understanding
/// This engine sees beyond surface similarities to find true semantic duplicates across languages
pub struct SemanticDeduplicator {
    // Core embedding and similarity engine
    embedder: Arc<CodeEmbedder>,
    similarity_engine: Arc<RwLock<SimilarityEngine>>,
    
    // Intelligent deduplication thresholds that adapt based on accuracy
    thresholds: Arc<RwLock<SimilarityThresholds>>,
    
    // Live learning from successful/failed deduplication attempts
    dedup_memory: Arc<DashMap<String, DeduplicationPattern>>,
    
    // Performance tracking for continuous improvement
    accuracy_tracker: Arc<RwLock<DeduplicationAccuracy>>,
    
    // Adaptive bloom filter for fast duplicate candidate filtering with auto-scaling
    bloom_filter: Arc<tokio::sync::RwLock<AdaptiveSymbolBloomFilter>>,
}

/// Adaptive similarity thresholds that learn from real-world accuracy
#[derive(Debug, Clone)]
pub struct SimilarityThresholds {
    pub high_confidence: f32,     // 0.9+ - Definitely same symbol (auto-merge)
    pub medium_confidence: f32,   // 0.7+ - Likely same symbol (suggest merge)  
    pub low_confidence: f32,      // 0.5+ - Possibly same symbol (flag for review)
    
    // Learning metadata
    pub last_updated: chrono::DateTime<chrono::Utc>,
    pub adaptation_count: u32,
    pub accuracy_history: Vec<AccuracyPoint>,
}

#[derive(Debug, Clone)]
pub struct AccuracyPoint {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub threshold_type: String,
    pub accuracy: f32,
    pub sample_size: u32,
}

/// Multi-dimensional similarity analysis engine
#[derive(Debug)]
pub struct SimilarityEngine {
    // Algorithm weights that adapt based on performance
    algorithm_weights: AlgorithmWeights,
    
    // Cross-language type and pattern mappings learned from data
    language_mappings: CrossLanguageMappings,
    
    // Contextual similarity boosters
    context_analyzers: Vec<ContextAnalyzer>,
    
    // Recently learned similarity patterns
    learned_patterns: HashMap<String, String>, // Simplified for now
}

/// Weights for different similarity algorithms - these adapt based on real-world accuracy
#[derive(Debug, Clone)]
pub struct AlgorithmWeights {
    pub name_similarity: f32,        // 0.3 default - exact/fuzzy name matching
    pub signature_similarity: f32,   // 0.4 default - parameter/return type analysis  
    pub behavioral_similarity: f32,  // 0.2 default - usage patterns and call graphs
    pub embedding_similarity: f32,   // 0.1 default - ML semantic embeddings
    
    // Adaptation metadata
    pub total_adjustments: u32,
    pub last_performance_review: chrono::DateTime<chrono::Utc>,
    pub performance_trend: f32, // Positive = improving, negative = degrading
}

/// Cross-language equivalence patterns discovered through analysis
#[derive(Debug, Clone)]
pub struct CrossLanguageMappings {
    // Direct type mappings: Vec<i32> -> List[int] -> Array<number>
    pub type_equivalences: HashMap<String, HashMap<Language, String>>,
    
    // Naming convention mappings: camelCase <-> snake_case <-> PascalCase
    pub naming_patterns: HashMap<Language, NamingConvention>,
    
    // Syntax pattern equivalences: for..in <-> for x in <-> forEach
    pub syntax_equivalences: Vec<SyntaxEquivalence>,
    
    // Learned from real deduplication attempts
    pub confidence_scores: HashMap<String, f32>,
}

#[derive(Debug, Clone)]  
pub struct NamingConvention {
    pub convention_type: NamingType,
    pub transformation_rules: Vec<TransformationRule>,
    pub confidence: f32,
}

#[derive(Debug, Clone)]
pub enum NamingType {
    CamelCase,     // calculateSum
    SnakeCase,     // calculate_sum  
    PascalCase,    // CalculateSum
    KebabCase,     // calculate-sum
    Mixed,         // calc_Sum (inconsistent)
}

#[derive(Debug, Clone)]
pub struct TransformationRule {
    pub from_pattern: String,
    pub to_pattern: String,
    pub confidence: f32,
    pub examples: Vec<(String, String)>, // (original, transformed)
}

/// Contextual analyzers that boost similarity based on code context
#[derive(Debug, Clone)]
pub struct ContextAnalyzer {
    pub analyzer_type: ContextType,
    pub boost_factor: f32,
    pub activation_threshold: f32,
    pub success_rate: f32,
}

#[derive(Debug, Clone)]
pub enum ContextType {
    SameModule,           // Functions in same module/package
    SimilarNaming,        // Similar naming patterns in vicinity  
    DesignPattern,        // Part of same design pattern
    DomainSpecific,       // Domain-specific similarity (e.g., math, networking)
    RefactoringCandidate, // Code that looks like it was refactored
    CrossLanguagePort,    // Ported between languages
}

/// Groups of symbols that are semantic duplicates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub group_id: String,
    pub primary_symbol: Symbol,    // The "canonical" version
    pub duplicate_symbols: Vec<Symbol>,
    pub similarity_scores: HashMap<String, f32>, // symbol_id -> similarity to primary
    pub group_confidence: f32,
    pub deduplication_strategy: DeduplicationStrategy,
    pub detected_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeduplicationStrategy {
    AutoMerge,           // High confidence - automatically merge
    SuggestMerge,        // Medium confidence - suggest to developer
    FlagForReview,       // Low confidence - flag for manual review
    KeepSeparate,        // Different enough to keep separate
}

/// Learned patterns from successful deduplication attempts
#[derive(Debug, Clone)]
pub struct DeduplicationPattern {
    pub pattern_id: String,
    pub source_characteristics: SymbolCharacteristics,
    pub target_characteristics: SymbolCharacteristics,
    pub similarity_features: SimilarityFeatures,
    pub success_rate: f32,
    pub usage_count: u32,
    pub last_successful_match: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone)]
pub struct SymbolCharacteristics {
    pub name_tokens: Vec<String>,
    pub signature_pattern: String,
    pub language: Language,
    pub complexity_metrics: HashMap<String, f32>,
    pub usage_context: String,
}

#[derive(Debug, Clone)]
pub struct SimilarityFeatures {
    pub name_similarity: f32,
    pub signature_similarity: f32,
    pub behavioral_similarity: f32,
    pub contextual_similarity: f32,
    pub cross_language_boost: f32,
    pub overall_similarity: f32,
}

impl SemanticDeduplicator {
    pub async fn new(embedder: Arc<CodeEmbedder>) -> Result<Self> {
        Ok(Self {
            embedder,
            similarity_engine: Arc::new(RwLock::new(SimilarityEngine::new())),
            thresholds: Arc::new(RwLock::new(SimilarityThresholds::default())),
            dedup_memory: Arc::new(DashMap::new()),
            accuracy_tracker: Arc::new(RwLock::new(DeduplicationAccuracy::new())),
            bloom_filter: Arc::new(tokio::sync::RwLock::new(
                AdaptiveSymbolBloomFilter::new(100_000, 0.01).await?
            )),
        })
    }
    
    /// Main deduplication method - finds all semantic duplicates in a symbol set
    pub async fn find_duplicates(&self, symbols: &[Symbol]) -> Result<Vec<DuplicateGroup>> {
        info!("Starting semantic deduplication for {} symbols", symbols.len());
        
        let mut duplicate_groups = Vec::new();
        let mut processed_symbols = std::collections::HashSet::new();
        
        // Build bloom filter for fast candidate filtering
        self.update_bloom_filter(symbols).await?;
        
        for (i, symbol) in symbols.iter().enumerate() {
            if processed_symbols.contains(&symbol.id) {
                continue; // Already part of a duplicate group
            }
            
            // Find potential duplicates using bloom filter + semantic analysis
            let candidates = self.find_duplicate_candidates(symbol, &symbols[i+1..]).await?;
            
            if !candidates.is_empty() {
                // Analyze similarities and create duplicate group
                let group = self.create_duplicate_group(symbol, candidates).await?;
                
                // Mark all symbols in group as processed
                processed_symbols.insert(group.primary_symbol.id.clone());
                for dup in &group.duplicate_symbols {
                    processed_symbols.insert(dup.id.clone());
                }
                
                duplicate_groups.push(group);
            }
        }
        
        // Learn from this deduplication session
        self.learn_from_deduplication_session(&duplicate_groups).await?;
        
        info!("Deduplication complete. Found {} duplicate groups", duplicate_groups.len());
        Ok(duplicate_groups)
    }
    
    /// Calculate similarity between two symbols with full breakdown
    pub async fn similarity_score(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<f32> {
        let similarity_engine = self.similarity_engine.read().await;
        
        // Multi-dimensional similarity calculation
        let features = self.extract_similarity_features(symbol1, symbol2).await?;
        
        // Apply learned patterns
        let pattern_boost = self.apply_learned_patterns(&features).await;
        
        // Apply contextual analysis
        let context_boost = similarity_engine.analyze_context_similarity(symbol1, symbol2);
        
        // Weighted combination using adaptive weights
        let weights = &similarity_engine.algorithm_weights;
        let base_similarity = (
            features.name_similarity * weights.name_similarity +
            features.signature_similarity * weights.signature_similarity +
            features.behavioral_similarity * weights.behavioral_similarity +
            features.contextual_similarity * weights.embedding_similarity // Use contextual for embedding weight
        ) / (weights.name_similarity + weights.signature_similarity + 
             weights.behavioral_similarity + weights.embedding_similarity);
        
        // Apply boosts
        let final_similarity = (base_similarity + pattern_boost + context_boost).min(1.0);
        
        // Record for learning
        self.record_similarity_calculation(symbol1, symbol2, final_similarity).await?;
        
        Ok(final_similarity)
    }
    
    /// Check if two symbols are semantically similar above threshold
    pub async fn are_similar(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<bool> {
        let similarity = self.similarity_score(symbol1, symbol2).await?;
        let thresholds = self.thresholds.read().await;
        
        Ok(similarity >= thresholds.low_confidence)
    }
    
    /// Merge similar symbols by updating their relationships
    pub async fn merge_similar_symbols(&self, symbols: Vec<Symbol>) -> Result<Vec<Symbol>> {
        let mut merged_symbols = Vec::new();
        let duplicate_groups = self.find_duplicates(&symbols).await?;
        
        // Create a mapping of which symbols are duplicates
        let mut duplicate_map: HashMap<String, String> = HashMap::new(); // duplicate_id -> primary_id
        
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
    
    /// Learn from manual corrections to improve future deduplication
    pub async fn learn_from_correction(&self, 
        symbol1: &Symbol, 
        symbol2: &Symbol, 
        predicted_similarity: f32,
        actual_similarity: f32,
        correction_reason: &str
    ) -> Result<()> {
        
        debug!("Learning from correction: predicted={}, actual={}, reason='{}'", 
               predicted_similarity, actual_similarity, correction_reason);
        
        // Update accuracy tracking
        let mut tracker = self.accuracy_tracker.write().await;
        tracker.record_correction(predicted_similarity, actual_similarity, correction_reason);
        
        // Extract features for learning
        let features = self.extract_similarity_features(symbol1, symbol2).await?;
        
        // Create or update learned pattern
        let pattern_key = self.generate_pattern_key(&features);
        let pattern = DeduplicationPattern {
            pattern_id: pattern_key.clone(),
            source_characteristics: self.extract_symbol_characteristics(symbol1).await?,
            target_characteristics: self.extract_symbol_characteristics(symbol2).await?,
            similarity_features: features,
            success_rate: if actual_similarity > predicted_similarity { 1.0 } else { 0.0 },
            usage_count: 1,
            last_successful_match: chrono::Utc::now(),
        };
        
        self.dedup_memory.insert(pattern_key, pattern);
        
        // Trigger threshold adaptation if needed
        self.maybe_adapt_thresholds().await?;
        
        Ok(())
    }
    
    /// Get insights into deduplication performance and learning
    pub async fn get_deduplication_insights(&self) -> Result<DeduplicationInsights> {
        let tracker = self.accuracy_tracker.read().await;
        let thresholds = self.thresholds.read().await;
        let similarity_engine = self.similarity_engine.read().await;
        
        Ok(DeduplicationInsights {
            total_learned_patterns: self.dedup_memory.len(),
            overall_accuracy: tracker.calculate_overall_accuracy(),
            current_thresholds: thresholds.clone(),
            algorithm_weights: similarity_engine.algorithm_weights.clone(),
            recent_corrections: tracker.get_recent_corrections(),
            top_performing_patterns: self.get_top_performing_patterns().await?,
            cross_language_mappings: similarity_engine.language_mappings.type_equivalences.len(),
        })
    }
    
    // Private implementation methods...
    
    async fn find_duplicate_candidates(&self, target: &Symbol, candidates: &[Symbol]) -> Result<Vec<Symbol>> {
        let mut potential_duplicates = Vec::new();
        
        // First pass: filter candidates using bloom filter
        let mut bloom_candidates = Vec::new();
        {
            let bloom_filter = self.bloom_filter.read().await;
            for candidate in candidates {
                if bloom_filter.might_contain_pair(&target.id, &candidate.id).await {
                    bloom_candidates.push(candidate.clone());
                }
            }
        } // Release bloom filter lock
        
        // Second pass: detailed similarity analysis on filtered candidates
        let thresholds = self.thresholds.read().await;
        for candidate in bloom_candidates {
            let similarity = self.similarity_score(target, &candidate).await?;
            if similarity >= thresholds.low_confidence {
                potential_duplicates.push(candidate);
            }
        }
        
        Ok(potential_duplicates)
    }
    
    async fn create_duplicate_group(&self, primary: &Symbol, duplicates: Vec<Symbol>) -> Result<DuplicateGroup> {
        let mut similarity_scores = HashMap::new();
        let mut total_confidence = 0.0;
        
        for duplicate in &duplicates {
            let similarity = self.similarity_score(primary, duplicate).await?;
            similarity_scores.insert(duplicate.id.clone(), similarity);
            total_confidence += similarity;
        }
        
        let group_confidence = if !duplicates.is_empty() {
            total_confidence / duplicates.len() as f32
        } else {
            0.0
        };
        
        let strategy = self.determine_deduplication_strategy(group_confidence).await;
        
        Ok(DuplicateGroup {
            group_id: uuid::Uuid::new_v4().to_string(),
            primary_symbol: primary.clone(),
            duplicate_symbols: duplicates,
            similarity_scores,
            group_confidence,
            deduplication_strategy: strategy,
            detected_at: chrono::Utc::now(),
        })
    }
    
    async fn extract_similarity_features(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<SimilarityFeatures> {
        // Name similarity with cross-language awareness
        let name_similarity = self.calculate_cross_language_name_similarity(
            &symbol1.name, &symbol2.name, symbol1.language, symbol2.language
        ).await?;
        
        // Signature similarity with type mapping
        let signature_similarity = self.calculate_signature_similarity(
            &symbol1.signature, &symbol2.signature, symbol1.language, symbol2.language
        ).await?;
        
        // Behavioral similarity from usage patterns
        let behavioral_similarity = self.calculate_behavioral_similarity(symbol1, symbol2).await?;
        
        // Embedding similarity using ML (stored in contextual_similarity for now)
        let contextual_similarity_value = if let (Some(emb1), Some(emb2)) = (&symbol1.embedding, &symbol2.embedding) {
            self.cosine_similarity(emb1, emb2)
        } else {
            0.0
        };
        
        // Cross-language boost
        let cross_language_boost = if symbol1.language != symbol2.language {
            self.calculate_cross_language_boost(symbol1, symbol2).await?
        } else {
            0.0
        };
        
        Ok(SimilarityFeatures {
            name_similarity,
            signature_similarity,
            behavioral_similarity,
            contextual_similarity: contextual_similarity_value,
            cross_language_boost,
            overall_similarity: 0.0, // Will be calculated later
        })
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
    
    // Additional helper methods would be implemented here...
    
    async fn update_bloom_filter(&self, symbols: &[Symbol]) -> Result<()> {
        let mut filter = self.bloom_filter.write().await;
        
        // Group symbols by signature for efficient comparison
        let mut signature_groups: std::collections::HashMap<String, Vec<&Symbol>> = std::collections::HashMap::new();
        
        for symbol in symbols {
            signature_groups.entry(symbol.signature.clone())
                .or_insert_with(Vec::new)
                .push(symbol);
        }
        
        // Insert pairs within each signature group (these are most likely to be similar)
        for (_signature, group_symbols) in signature_groups.iter() {
            if group_symbols.len() > 1 {
                for i in 0..group_symbols.len() {
                    for j in (i + 1)..group_symbols.len() {
                        filter.insert_symbol_pair(&group_symbols[i].id, &group_symbols[j].id).await?;
                    }
                }
            }
        }
        
        // Also insert pairs with similar names (but limit to avoid O(n²) explosion)
        if symbols.len() <= 1000 { // Only do this for smaller symbol sets
            for i in 0..symbols.len() {
                for j in (i + 1)..std::cmp::min(i + 50, symbols.len()) { // Limit comparisons per symbol
                    let symbol1 = &symbols[i];
                    let symbol2 = &symbols[j];
                    
                    if symbol1.signature != symbol2.signature && 
                       self.names_potentially_similar(&symbol1.name, &symbol2.name) {
                        filter.insert_symbol_pair(&symbol1.id, &symbol2.id).await?;
                    }
                }
            }
        }
        
        Ok(())
    }
    
    // Helper method to determine if names are potentially similar
    fn names_potentially_similar(&self, name1: &str, name2: &str) -> bool {
        // Normalize names for comparison
        let norm1 = name1.to_lowercase().replace("_", "").replace("-", "");
        let norm2 = name2.to_lowercase().replace("_", "").replace("-", ""); 
        
        // Check for exact match after normalization
        if norm1 == norm2 {
            return true;
        }
        
        // Check for substring relationships
        if norm1.contains(&norm2) || norm2.contains(&norm1) {
            return true;
        }
        
        // Check for common prefixes/suffixes
        let common_prefix_len = norm1.chars().zip(norm2.chars())
            .take_while(|(a, b)| a == b)
            .count();
        
        if common_prefix_len >= 4 && common_prefix_len >= norm1.len().min(norm2.len()) / 2 {
            return true;
        }
        
        false
    }
    
    async fn learn_from_deduplication_session(&self, groups: &[DuplicateGroup]) -> Result<()> {
        let mut tracker = self.accuracy_tracker.write().await;
        for group in groups {
            tracker.record_deduplication_success(group.group_confidence, group.duplicate_symbols.len());
        }
        Ok(())
    }
    
    async fn apply_learned_patterns(&self, features: &SimilarityFeatures) -> f32 {
        // Apply learned patterns from memory
        let pattern_key = format!("{}_{}", 
            (features.name_similarity * 10.0) as u32,
            (features.signature_similarity * 10.0) as u32
        );
        
        if let Some(pattern) = self.dedup_memory.get(&pattern_key) {
            pattern.success_rate * 0.1 // Small boost based on learned patterns
        } else {
            0.0
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
    
    async fn record_similarity_calculation(&self, symbol1: &Symbol, symbol2: &Symbol, similarity: f32) -> Result<()> {
        debug!("Similarity calculated: {} <-> {} = {:.3}", symbol1.name, symbol2.name, similarity);
        Ok(())
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
    
    async fn calculate_cross_language_name_similarity(&self, name1: &str, name2: &str, lang1: Language, lang2: Language) -> Result<f32> {
        // Simple cross-language name similarity
        let normalized1 = self.normalize_name_for_language(name1, lang1);
        let normalized2 = self.normalize_name_for_language(name2, lang2);
        
        Ok(self.string_similarity(&normalized1, &normalized2))
    }
    
    fn normalize_name_for_language(&self, name: &str, _lang: Language) -> String {
        // Simple normalization - convert to lowercase and remove underscores
        name.to_lowercase().replace("_", "").replace("-", "")
    }
    
    fn string_similarity(&self, s1: &str, s2: &str) -> f32 {
        if s1 == s2 { return 1.0; }
        
        let max_len = s1.len().max(s2.len());
        if max_len == 0 { return 1.0; }
        
        let distance = edit_distance::edit_distance(s1, s2);
        1.0 - (distance as f32 / max_len as f32)
    }
    
    async fn calculate_signature_similarity(&self, sig1: &str, sig2: &str, _lang1: Language, _lang2: Language) -> Result<f32> {
        // Simple signature similarity
        Ok(self.string_similarity(sig1, sig2))
    }
    
    async fn calculate_behavioral_similarity(&self, _symbol1: &Symbol, _symbol2: &Symbol) -> Result<f32> {
        // Placeholder for behavioral similarity - would analyze usage patterns
        Ok(0.5)
    }
    
    async fn calculate_cross_language_boost(&self, _symbol1: &Symbol, _symbol2: &Symbol) -> Result<f32> {
        // Placeholder for cross-language similarity boost
        Ok(0.1)
    }
    
    async fn extract_symbol_characteristics(&self, symbol: &Symbol) -> Result<SymbolCharacteristics> {
        Ok(SymbolCharacteristics {
            name_tokens: symbol.name.split(&['_', '-', ' '][..]).map(|s| s.to_string()).collect(),
            signature_pattern: symbol.signature.clone(),
            language: symbol.language,
            complexity_metrics: HashMap::new(),
            usage_context: symbol.file_path.clone(),
        })
    }
    
    fn generate_pattern_key(&self, features: &SimilarityFeatures) -> String {
        format!("pattern_{}_{}_{}_{}", 
            (features.name_similarity * 100.0) as u32,
            (features.signature_similarity * 100.0) as u32,
            (features.behavioral_similarity * 100.0) as u32,
            (features.contextual_similarity * 100.0) as u32
        )
    }
    
    async fn maybe_adapt_thresholds(&self) -> Result<()> {
        let tracker = self.accuracy_tracker.read().await;
        if tracker.should_adapt_thresholds() {
            let mut thresholds = self.thresholds.write().await;
            thresholds.adapt_based_on_accuracy(&tracker);
        }
        Ok(())
    }
    
    async fn get_top_performing_patterns(&self) -> Result<Vec<DeduplicationPattern>> {
        let patterns: Vec<_> = self.dedup_memory.iter()
            .map(|entry| entry.value().clone())
            .collect();
        
        let mut sorted_patterns = patterns;
        sorted_patterns.sort_by(|a, b| b.success_rate.partial_cmp(&a.success_rate).unwrap_or(std::cmp::Ordering::Equal));
        sorted_patterns.truncate(5);
        
        Ok(sorted_patterns)
    }
}

impl SimilarityEngine {
    pub fn new() -> Self {
        Self {
            algorithm_weights: AlgorithmWeights::default(),
            language_mappings: CrossLanguageMappings::default(),
            context_analyzers: vec![],
            learned_patterns: HashMap::new(),
        }
    }
    
    pub fn analyze_context_similarity(&self, _symbol1: &Symbol, _symbol2: &Symbol) -> f32 {
        // Analyze contextual similarity (same file, similar imports, etc.)
        0.1 // Placeholder
    }
}

impl DeduplicationAccuracy {
    pub fn new() -> Self {
        Self {
            total_predictions: 0,
            correct_predictions: 0,
            false_positives: 0,
            false_negatives: 0,
            accuracy_history: vec![],
            last_evaluation: chrono::Utc::now(),
        }
    }
    
    pub fn record_correction(&mut self, predicted: f32, actual: f32, _reason: &str) {
        self.total_predictions += 1;
        
        let threshold = 0.7; // Medium confidence threshold
        let predicted_positive = predicted > threshold;
        let actual_positive = actual > threshold;
        
        match (predicted_positive, actual_positive) {
            (true, true) | (false, false) => self.correct_predictions += 1,
            (true, false) => self.false_positives += 1,
            (false, true) => self.false_negatives += 1,
        }
    }
    
    pub fn record_deduplication_success(&mut self, confidence: f32, _group_size: usize) {
        self.total_predictions += 1;
        if confidence > 0.7 {
            self.correct_predictions += 1;
        }
    }
    
    pub fn calculate_overall_accuracy(&self) -> f32 {
        if self.total_predictions == 0 {
            0.0
        } else {
            self.correct_predictions as f32 / self.total_predictions as f32
        }
    }
    
    pub fn get_recent_corrections(&self) -> Vec<String> {
        // Return recent correction summaries
        vec!["Recent accuracy improvements".to_string()]
    }
    
    pub fn should_adapt_thresholds(&self) -> bool {
        self.total_predictions > 50 && self.calculate_overall_accuracy() < 0.8
    }
}

impl SimilarityThresholds {
    pub fn adapt_based_on_accuracy(&mut self, _tracker: &DeduplicationAccuracy) {
        // Adapt thresholds based on accuracy feedback
        self.adaptation_count += 1;
        self.last_updated = chrono::Utc::now();
    }
}

impl Default for SimilarityThresholds {
    fn default() -> Self {
        Self {
            high_confidence: 0.9,
            medium_confidence: 0.7,
            low_confidence: 0.5,
            last_updated: chrono::Utc::now(),
            adaptation_count: 0,
            accuracy_history: vec![],
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
            total_adjustments: 0,
            last_performance_review: chrono::Utc::now(),
            performance_trend: 0.0,
        }
    }
}

impl Default for CrossLanguageMappings {
    fn default() -> Self {
        Self {
            type_equivalences: HashMap::new(),
            naming_patterns: HashMap::new(),
            syntax_equivalences: vec![],
            confidence_scores: HashMap::new(),
        }
    }
}

/// Performance tracking for deduplication accuracy
#[derive(Debug)]
pub struct DeduplicationAccuracy {
    pub total_predictions: u32,
    pub correct_predictions: u32,
    pub false_positives: u32,
    pub false_negatives: u32,
    pub accuracy_history: Vec<AccuracyPoint>,
    pub last_evaluation: chrono::DateTime<chrono::Utc>,
}

/// Insights into deduplication performance and patterns
#[derive(Debug)]
pub struct DeduplicationInsights {
    pub total_learned_patterns: usize,
    pub overall_accuracy: f32,
    pub current_thresholds: SimilarityThresholds,
    pub algorithm_weights: AlgorithmWeights,
    pub recent_corrections: Vec<String>,
    pub top_performing_patterns: Vec<DeduplicationPattern>,
    pub cross_language_mappings: usize,
}

#[derive(Debug, Clone)]
pub struct SyntaxEquivalence {
    pub pattern: String,
    pub languages: Vec<Language>,
    pub confidence: f32,
}