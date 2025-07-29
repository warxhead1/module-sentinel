// Core ORM and database functionality
pub mod orm;
pub mod models;
pub mod flow_models;
pub mod project_database;
pub mod embedding_manager;
pub mod semantic_search;

// Advanced analysis modules
pub mod semantic_pattern_engine;
pub mod adaptive_similarity_engine;
pub mod ai_feedback_integration;
pub mod bloom_filter;
pub mod semantic_deduplicator;
pub mod cache;
pub mod cache_persistence;

// Export the beautiful ORM
pub use orm::{Database, Model, QueryBuilder, DatabaseValue};
pub use models::{Project, Language, UniversalSymbol, UniversalRelationship, FileIndex};
pub use flow_models::{SymbolCall, DataFlow, CriticalPath, DeepFlow};
pub use project_database::{ProjectDatabase, ProjectStats};

// Export advanced analysis components
pub use semantic_pattern_engine::{
    SemanticPatternEngine, EvolvingPattern, PatternType, PatternMatch,
    AIFeedback, ValidationResult, ValidationPriority
};

pub use adaptive_similarity_engine::{
    AdaptiveSimilarityEngine, LearnedSimilarity, FeatureVector, 
    AlgorithmWeights, AccuracyTracker
};

pub use ai_feedback_integration::{
    AIFeedbackIntegration, AIValidationService, ValidationQueue,
    FeedbackProcessor, AIValidationResponse
};

pub use bloom_filter::{SymbolBloomFilter, SymbolKey, BloomFilterStats};

pub use semantic_deduplicator::{
    SemanticDeduplicator, DuplicateGroup, DeduplicationStrategy, 
    SimilarityThresholds, DeduplicationInsights
};

pub use cache_persistence::{
    CachePersistenceManager, CachePersistenceStats, CacheEntry
};

pub use embedding_manager::{
    EmbeddingManager
};

pub use semantic_search::{
    SemanticSearchEngine, SearchResult
};

// Compatibility with existing code
use anyhow::Result;
use std::path::Path;

pub struct DatabaseWriter;

impl DatabaseWriter {
    pub async fn new(_path: &Path) -> Result<Self> {
        Ok(Self)
    }
    
    pub async fn write_results(&self, _results: &ParseResults) -> Result<()> {
        Ok(())
    }
}

pub struct ParseResults {
    pub total_files: usize,
    pub total_symbols: usize,
    pub total_relationships: usize,
    pub errors: Vec<(std::path::PathBuf, String)>,
}