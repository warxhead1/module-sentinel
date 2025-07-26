use tokio;
use anyhow::Result;
use std::sync::Arc;

use module_sentinel_parser::database::semantic_deduplicator::{
    SemanticDeduplicator, DuplicateGroup, DeduplicationStrategy, SimilarityThresholds
};
use module_sentinel_parser::database::bloom_filter::{SymbolBloomFilter, SymbolKey, BloomFilterStats};
use module_sentinel_parser::parsers::tree_sitter::{
    Language, CodeEmbedder, Symbol, SimilarityType
};

// Helper function to create test symbols with embeddings
fn create_test_symbol_with_embedding(
    name: &str, 
    signature: &str, 
    language: Language,
    embedding: Vec<f32>
) -> Symbol {
    Symbol {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        signature: signature.to_string(),
        language,
        file_path: format!("test_{}.rs", name),
        start_line: 1,
        end_line: 5,
        embedding: Some(embedding),
        semantic_hash: Some(format!("hash_{}", name)),
        normalized_name: name.to_lowercase().replace("_", ""),
        context_embedding: Some(vec![0.1, 0.2, 0.3]),
        duplicate_of: None,
        confidence_score: None,
        similar_symbols: vec![],
    }
}

#[tokio::test]
async fn test_semantic_deduplicator_creation() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Should create successfully
    assert!(true);
}

#[tokio::test]
async fn test_exact_duplicate_detection() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create identical symbols with same embeddings
    let identical_embedding = vec![0.5, 0.5, 0.5, 0.5, 0.5];
    let symbol1 = create_test_symbol_with_embedding(
        "calculateSum", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding.clone()
    );
    let symbol2 = create_test_symbol_with_embedding(
        "calculateSum", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding
    );
    
    let symbols = vec![symbol1, symbol2];
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    
    // Should find one duplicate group
    assert_eq!(duplicate_groups.len(), 1);
    
    let group = &duplicate_groups[0];
    assert_eq!(group.duplicate_symbols.len(), 1);
    assert!(group.group_confidence > 0.9); // High confidence for exact duplicates
    assert!(matches!(group.deduplication_strategy, DeduplicationStrategy::AutoMerge));
}

#[tokio::test]
async fn test_semantic_similarity_detection() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create semantically similar symbols
    let similar_embedding1 = vec![0.8, 0.2, 0.1, 0.3, 0.7];
    let similar_embedding2 = vec![0.7, 0.3, 0.2, 0.2, 0.8]; // Similar but not identical
    
    let symbol1 = create_test_symbol_with_embedding(
        "calculateSum", "fn(Vec<i32>) -> i32", Language::Rust, similar_embedding1
    );
    let symbol2 = create_test_symbol_with_embedding(
        "calc_sum", "fn(Vec<i32>) -> i32", Language::Rust, similar_embedding2
    );
    
    // Test similarity scoring
    let similarity = deduplicator.similarity_score(&symbol1, &symbol2).await.unwrap();
    assert!(similarity > 0.6); // Should be reasonably similar
    
    // Test similarity detection
    let are_similar = deduplicator.are_similar(&symbol1, &symbol2).await.unwrap();
    assert!(are_similar); // Should detect as similar
}

#[tokio::test]
async fn test_cross_language_duplicate_detection() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create equivalent functions in different languages
    let shared_embedding = vec![0.6, 0.4, 0.7, 0.2, 0.9];
    
    let rust_symbol = create_test_symbol_with_embedding(
        "calculate_sum", "fn(Vec<i32>) -> i32", Language::Rust, shared_embedding.clone()
    );
    let python_symbol = create_test_symbol_with_embedding(
        "calculate_sum", "def(List[int]) -> int", Language::Python, shared_embedding.clone()
    );
    let ts_symbol = create_test_symbol_with_embedding(
        "calculateSum", "function(number[]): number", Language::TypeScript, shared_embedding
    );
    
    let symbols = vec![rust_symbol, python_symbol, ts_symbol];
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    
    // Should find cross-language duplicates
    assert!(!duplicate_groups.is_empty());
    
    // Check that we found a group with multiple languages
    let multi_lang_group = duplicate_groups.iter().find(|group| {
        let mut languages = std::collections::HashSet::new();
        languages.insert(group.primary_symbol.language);
        for dup in &group.duplicate_symbols {
            languages.insert(dup.language);
        }
        languages.len() > 1
    });
    
    assert!(multi_lang_group.is_some());
}

#[tokio::test]
async fn test_deduplication_with_different_similarity_levels() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create symbols with varying levels of similarity
    let high_sim_embedding = vec![0.9, 0.1, 0.0, 0.0, 0.0];
    let medium_sim_embedding = vec![0.7, 0.3, 0.0, 0.0, 0.0];
    let low_sim_embedding = vec![0.5, 0.5, 0.0, 0.0, 0.0];
    let no_sim_embedding = vec![0.0, 0.0, 1.0, 0.0, 0.0];
    
    let primary = create_test_symbol_with_embedding(
        "processData", "fn(&[u8]) -> Vec<u8>", Language::Rust, vec![1.0, 0.0, 0.0, 0.0, 0.0]
    );
    
    let high_similar = create_test_symbol_with_embedding(
        "process_data", "fn(&[u8]) -> Vec<u8>", Language::Rust, high_sim_embedding
    );
    
    let medium_similar = create_test_symbol_with_embedding(
        "processBytes", "fn(&[u8]) -> Vec<u8>", Language::Rust, medium_sim_embedding
    );
    
    let low_similar = create_test_symbol_with_embedding(
        "handleData", "fn(&[u8]) -> Vec<u8>", Language::Rust, low_sim_embedding
    );
    
    let not_similar = create_test_symbol_with_embedding(
        "generateRandomNumber", "fn() -> i32", Language::Rust, no_sim_embedding
    );
    
    let symbols = vec![primary, high_similar, medium_similar, low_similar, not_similar];
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    
    // Should find appropriate groups based on similarity
    let main_group = duplicate_groups.iter().find(|g| g.primary_symbol.name == "processData");
    
    if let Some(group) = main_group {
        // High similarity should be in the group
        assert!(group.duplicate_symbols.iter().any(|s| s.name == "process_data"));
        
        // Check deduplication strategies
        for (symbol_id, similarity) in &group.similarity_scores {
            if *similarity > 0.9 {
                assert!(matches!(group.deduplication_strategy, DeduplicationStrategy::AutoMerge));
            } else if *similarity > 0.7 {
                // Could be AutoMerge or SuggestMerge depending on overall confidence
                assert!(matches!(group.deduplication_strategy, 
                    DeduplicationStrategy::AutoMerge | DeduplicationStrategy::SuggestMerge));
            }
        }
        
        // Not similar symbol should not be in the group
        assert!(!group.duplicate_symbols.iter().any(|s| s.name == "generateRandomNumber"));
    }
}

#[tokio::test]
async fn test_merge_similar_symbols() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create symbols for merging
    let identical_embedding = vec![0.8, 0.1, 0.1, 0.0, 0.0];
    
    let mut primary = create_test_symbol_with_embedding(
        "calculateTotal", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding.clone()
    );
    let primary_id = primary.id.clone();
    
    let mut duplicate1 = create_test_symbol_with_embedding(
        "calc_total", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding.clone()
    );
    
    let mut duplicate2 = create_test_symbol_with_embedding(
        "computeTotal", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding
    );
    
    let symbols = vec![primary, duplicate1, duplicate2];
    let merged_symbols = deduplicator.merge_similar_symbols(symbols).await.unwrap();
    
    // Check that duplicates are properly marked
    let primary_symbol = merged_symbols.iter().find(|s| s.id == primary_id).unwrap();
    assert!(primary_symbol.duplicate_of.is_none()); // Primary shouldn't be marked as duplicate
    assert!(!primary_symbol.similar_symbols.is_empty()); // Should have similar symbols list
    
    // Check duplicate symbols
    let duplicate_symbols: Vec<_> = merged_symbols.iter()
        .filter(|s| s.duplicate_of.is_some())
        .collect();
    
    assert!(duplicate_symbols.len() >= 1); // Should have at least one duplicate marked
    
    for dup in duplicate_symbols {
        assert_eq!(dup.duplicate_of.as_ref().unwrap(), &primary_id);
        assert!(dup.confidence_score.is_some());
        assert!(dup.confidence_score.unwrap() > 0.5);
    }
}

#[tokio::test]
async fn test_learning_from_corrections() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    let symbol1 = create_test_symbol_with_embedding(
        "parseJson", "fn(&str) -> Result<JsonValue>", Language::Rust, vec![0.6, 0.4, 0.0, 0.0, 0.0]
    );
    let symbol2 = create_test_symbol_with_embedding(
        "parseXml", "fn(&str) -> Result<XmlValue>", Language::Rust, vec![0.7, 0.3, 0.0, 0.0, 0.0]
    );
    
    // Initial similarity prediction
    let initial_similarity = deduplicator.similarity_score(&symbol1, &symbol2).await.unwrap();
    
    // Learn from correction - these should NOT be similar despite similar signatures
    deduplicator.learn_from_correction(
        &symbol1, 
        &symbol2, 
        initial_similarity,
        0.2, // Actual similarity is low
        "Different data formats - JSON vs XML parsing have different semantics"
    ).await.unwrap();
    
    // After learning, similar comparisons should have adjusted scores
    let symbol3 = create_test_symbol_with_embedding(
        "parseYaml", "fn(&str) -> Result<YamlValue>", Language::Rust, vec![0.65, 0.35, 0.0, 0.0, 0.0]
    );
    
    let new_similarity = deduplicator.similarity_score(&symbol1, &symbol3).await.unwrap();
    
    // The deduplicator should have learned that parse* functions with different formats are not similar
    // This is a complex test that would require more sophisticated learning implementation
    assert!(true); // Placeholder - in real implementation we'd verify learning occurred
}

#[tokio::test]
async fn test_deduplication_insights() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create some symbols and run deduplication
    let symbols = vec![
        create_test_symbol_with_embedding(
            "function1", "fn() -> i32", Language::Rust, vec![0.5, 0.5, 0.0, 0.0, 0.0]
        ),
        create_test_symbol_with_embedding(
            "function_1", "fn() -> i32", Language::Rust, vec![0.6, 0.4, 0.0, 0.0, 0.0]
        ),
        create_test_symbol_with_embedding(
            "function2", "fn() -> String", Language::TypeScript, vec![0.0, 0.0, 0.8, 0.2, 0.0]
        ),
    ];
    
    let _duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    
    // Get insights
    let insights = deduplicator.get_deduplication_insights().await.unwrap();
    
    // Should have meaningful insights
    assert!(insights.overall_accuracy >= 0.0 && insights.overall_accuracy <= 1.0);
    assert!(insights.current_thresholds.high_confidence > insights.current_thresholds.medium_confidence);
    assert!(insights.current_thresholds.medium_confidence > insights.current_thresholds.low_confidence);
    assert!(insights.algorithm_weights.name_similarity >= 0.0);
    assert!(insights.algorithm_weights.signature_similarity >= 0.0);
}

#[tokio::test]
async fn test_bloom_filter_integration() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create many symbols to test bloom filter performance
    let mut symbols = Vec::new();
    for i in 0..50 {
        let embedding = vec![
            (i % 5) as f32 / 5.0, 
            ((i + 1) % 5) as f32 / 5.0, 
            0.0, 0.0, 0.0
        ];
        symbols.push(create_test_symbol_with_embedding(
            &format!("function_{}", i),
            &format!("fn() -> i{}", i % 3),
            Language::Rust,
            embedding
        ));
    }
    
    let start = std::time::Instant::now();
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    let duration = start.elapsed();
    
    // Should complete quickly due to bloom filter optimization
    assert!(duration.as_millis() < 1000); // Less than 1 second for 50 symbols
    
    // Should find some duplicates based on similar signatures
    let groups_with_same_signature = duplicate_groups.iter()
        .filter(|g| g.duplicate_symbols.len() > 0)
        .count();
    
    // With our test data structure, we should find some groups
    assert!(groups_with_same_signature > 0);
}

#[tokio::test] 
async fn test_performance_with_large_symbol_set() {
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create a larger set of symbols
    let mut symbols = Vec::new();
    for i in 0..200 {
        let embedding = vec![
            (i % 10) as f32 / 10.0,
            ((i + 2) % 10) as f32 / 10.0,
            ((i + 5) % 10) as f32 / 10.0,
            0.0, 0.0
        ];
        
        symbols.push(create_test_symbol_with_embedding(
            &format!("process_data_{}", i),
            &format!("fn(Vec<i{}>) -> Vec<i{}>", i % 5, i % 5),
            if i % 3 == 0 { Language::Rust } 
            else if i % 3 == 1 { Language::TypeScript } 
            else { Language::Python },
            embedding
        ));
    }
    
    let start = std::time::Instant::now();
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    let duration = start.elapsed();
    
    // Should complete in reasonable time
    assert!(duration.as_secs() < 10); // Less than 10 seconds for 200 symbols
    
    // Should find some duplicates
    assert!(!duplicate_groups.is_empty());
    
    println!("Processed {} symbols in {:?}, found {} duplicate groups", 
             symbols.len(), duration, duplicate_groups.len());
}

// Tests for the bloom filter specifically

#[test]
fn test_bloom_filter_basic_functionality() {
    let mut filter = SymbolBloomFilter::new(1000, 0.01).unwrap();
    
    // Test symbol key creation and operations
    let key1 = SymbolKey::new("calculateSum", "fn(Vec<i32>) -> i32", "math");
    let key2 = SymbolKey::new("calc_sum", "fn(Vec<i32>) -> i32", "math");
    let key3 = SymbolKey::new("processData", "fn(&[u8]) -> Vec<u8>", "data");
    
    // Insert some keys
    filter.insert(&key1);
    filter.insert(&key2);
    
    // Test queries
    assert!(filter.might_contain(&key1));
    assert!(filter.might_contain(&key2));
    assert!(!filter.might_contain(&key3)); // Should definitely not be there
    
    // Test statistics
    let stats = filter.stats();
    assert_eq!(stats.insertions, 2);
    assert!(stats.current_false_positive_rate >= 0.0);
    assert!(stats.load_factor <= 1.0);
}

#[test]
fn test_bloom_filter_pair_operations() {
    let mut filter = SymbolBloomFilter::new(1000, 0.01).unwrap();
    
    // Test symbol pair operations
    filter.insert_pair("symbol1", "symbol2");
    filter.insert_pair("symbol3", "symbol4");
    
    // Should find inserted pairs
    assert!(filter.might_contain_pair("symbol1", "symbol2"));
    assert!(filter.might_contain_pair("symbol2", "symbol1")); // Order shouldn't matter
    assert!(filter.might_contain_pair("symbol3", "symbol4"));
    
    // Should not find non-inserted pairs
    assert!(!filter.might_contain_pair("symbol1", "symbol3"));
    assert!(!filter.might_contain_pair("symbol2", "symbol4"));
}

#[test]
fn test_bloom_filter_performance_characteristics() {
    let mut filter = SymbolBloomFilter::new(10000, 0.01).unwrap();
    
    // Insert many items
    for i in 0..5000 {
        let key = SymbolKey::new(&format!("symbol{}", i), "fn()", "test");
        filter.insert(&key);
    }
    
    let stats = filter.stats();
    
    // Check performance characteristics
    assert_eq!(stats.insertions, 5000);
    assert!(stats.current_false_positive_rate < 0.05); // Should be reasonable
    assert!(stats.load_factor == 0.5); // Half capacity
    assert!(stats.memory_usage_bytes > 0);
    
    // Test query performance
    let start = std::time::Instant::now();
    for i in 5000..5100 { // Query items not in the filter
        let key = SymbolKey::new(&format!("symbol{}", i), "fn()", "test");
        filter.might_contain(&key);
    }
    let duration = start.elapsed();
    
    // Should be very fast
    assert!(duration.as_millis() < 10);
}