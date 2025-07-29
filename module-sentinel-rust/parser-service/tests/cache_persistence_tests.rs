use tokio;
use anyhow::Result;
use std::sync::Arc;
use std::collections::HashMap;

use module_sentinel_parser::database::{
    orm::Database,
    cache::{CachedSemanticDeduplicator, CacheConfig},
    cache_persistence::{CachePersistenceManager, CacheEntry},
    DuplicateGroup, DeduplicationStrategy,
};
use module_sentinel_parser::parsers::tree_sitter::{Symbol, Language as ParserLanguage, CodeEmbedder};

#[tokio::test]
async fn test_cache_persistence_creation() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Database::new(db_path.to_str().unwrap()).await?;
    
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let cache = Arc::new(CachedSemanticDeduplicator::new(
        embedder,
        CacheConfig::default(),
    ).await?);
    
    let persistence = CachePersistenceManager::new(
        db,
        cache,
        60, // 1 minute persistence interval
    ).await?;
    
    // Verify table was created
    let stats = persistence.get_persistence_stats().await?;
    assert_eq!(stats.total_persisted_entries, 0);
    
    Ok(())
}

#[tokio::test]
async fn test_similarity_score_persistence() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Database::new(db_path.to_str().unwrap()).await?;
    
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let cache = Arc::new(CachedSemanticDeduplicator::new(
        embedder,
        CacheConfig::default(),
    ).await?);
    
    let persistence = Arc::new(CachePersistenceManager::new(
        db.clone(),
        cache,
        60,
    ).await?);
    
    // Store a similarity score
    persistence.store_similarity_score("symbol1", "symbol2", 0.85).await?;
    
    // Retrieve it
    let score = persistence.get_similarity_score("symbol1", "symbol2").await?;
    assert!(score.is_some());
    assert_eq!(score.unwrap(), 0.85);
    
    // Verify stats
    let stats = persistence.get_persistence_stats().await?;
    assert_eq!(stats.similarity_entries, 1);
    
    Ok(())
}

#[tokio::test]
async fn test_duplicate_groups_caching() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Database::new(db_path.to_str().unwrap()).await?;
    
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let cache = Arc::new(CachedSemanticDeduplicator::new(
        embedder,
        CacheConfig::default(),
    ).await?);
    
    let persistence = Arc::new(CachePersistenceManager::new(
        db,
        cache,
        60,
    ).await?);
    
    // Create test duplicate groups
    let primary_symbol = Symbol {
        id: "symbol1".to_string(),
        name: "test_function".to_string(),
        signature: "fn test_function()".to_string(),
        language: ParserLanguage::Rust,
        file_path: "test.rs".to_string(),
        start_line: 1,
        end_line: 5,
        embedding: None,
        semantic_hash: None,
        normalized_name: "test_function".to_string(),
        context_embedding: None,
        duplicate_of: None,
        confidence_score: Some(1.0),
        similar_symbols: vec![],
        semantic_tags: None,
        intent: None,
    };
    
    let mut similarity_scores = HashMap::new();
    similarity_scores.insert("symbol1".to_string(), 1.0);
    
    let groups = vec![
        DuplicateGroup {
            group_id: "group1".to_string(),
            primary_symbol,
            duplicate_symbols: vec![],
            similarity_scores,
            group_confidence: 0.95,
            deduplication_strategy: DeduplicationStrategy::AutoMerge,
        },
    ];
    
    // Store duplicate groups
    let project_id = 1;
    persistence.store_duplicate_groups(project_id, &groups).await?;
    
    // Retrieve them
    let cached_groups = persistence.get_duplicate_groups(project_id).await?;
    assert!(cached_groups.is_some());
    let cached_groups = cached_groups.unwrap();
    assert_eq!(cached_groups.len(), 1);
    assert_eq!(cached_groups[0].primary_symbol.name, "test_function");
    
    Ok(())
}

#[tokio::test]
async fn test_cache_expiration_cleanup() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Database::new(db_path.to_str().unwrap()).await?;
    
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let cache = Arc::new(CachedSemanticDeduplicator::new(
        embedder,
        CacheConfig::default(),
    ).await?);
    
    let persistence = Arc::new(CachePersistenceManager::new(
        db,
        cache,
        60,
    ).await?);
    
    // Store some entries
    for i in 0..5 {
        persistence.store_similarity_score(
            &format!("symbol{}", i),
            &format!("symbol{}", i + 1),
            0.5 + (i as f32 * 0.1)
        ).await?;
    }
    
    // Verify all entries exist
    let stats = persistence.get_persistence_stats().await?;
    assert_eq!(stats.similarity_entries, 5);
    
    // Run cleanup (should not delete anything since entries are fresh)
    persistence.cleanup_expired_entries().await?;
    
    let stats_after = persistence.get_persistence_stats().await?;
    assert_eq!(stats_after.similarity_entries, 5);
    
    Ok(())
}

#[tokio::test]
async fn test_cache_access_count_updates() -> Result<()> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Database::new(db_path.to_str().unwrap()).await?;
    
    let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
    let cache = Arc::new(CachedSemanticDeduplicator::new(
        embedder,
        CacheConfig::default(),
    ).await?);
    
    let persistence = Arc::new(CachePersistenceManager::new(
        db.clone(),
        cache,
        60,
    ).await?);
    
    // Store a similarity score
    persistence.store_similarity_score("symbolA", "symbolB", 0.75).await?;
    
    // Access it multiple times
    for _ in 0..3 {
        let _ = persistence.get_similarity_score("symbolA", "symbolB").await?;
    }
    
    // Check that access count increased
    use module_sentinel_parser::database::orm::QueryBuilder;
    let entries = db.find_all(
        QueryBuilder::<CacheEntry>::new()
            .where_eq("cache_key", "symbolA:symbolB")
    ).await?;
    
    assert_eq!(entries.len(), 1);
    assert!(entries[0].access_count >= 3);
    
    Ok(())
}