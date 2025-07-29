use tokio;
use std::sync::Arc;

use module_sentinel_parser::database::SemanticDeduplicator;
use module_sentinel_parser::parsers::tree_sitter::{CodeEmbedder, Language, Symbol};

// Helper function to create test symbols
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
        semantic_tags: None,
        intent: None,
    }
}

#[tokio::test]
async fn test_simple_integration_debug() {
    // Create a very simple test case to debug the integration
    
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create identical symbols with same embeddings - should definitely be duplicates
    let identical_embedding = vec![0.9, 0.1, 0.0, 0.0, 0.0];
    let symbol1 = create_test_symbol_with_embedding(
        "calculateSum", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding.clone()
    );
    let symbol2 = create_test_symbol_with_embedding(
        "calculateSum", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding.clone()
    );
    let symbol3 = create_test_symbol_with_embedding(
        "calculate_sum", "fn(Vec<i32>) -> i32", Language::Rust, identical_embedding.clone()
    );
    
    let symbols = vec![symbol1.clone(), symbol2.clone(), symbol3.clone()];
    
    println!("Testing simple duplicate detection with {} symbols", symbols.len());
    println!("Symbol 1: {} ({})", symbol1.name, symbol1.id);
    println!("Symbol 2: {} ({})", symbol2.name, symbol2.id);
    println!("Symbol 3: {} ({})", symbol3.name, symbol3.id);
    
    // Test individual similarity scores first
    let similarity_1_2 = deduplicator.similarity_score(&symbol1, &symbol2).await.unwrap();
    let similarity_1_3 = deduplicator.similarity_score(&symbol1, &symbol3).await.unwrap();
    
    println!("Similarity 1-2: {}", similarity_1_2);
    println!("Similarity 1-3: {}", similarity_1_3);
    
    // Now test full deduplication
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    
    println!("Found {} duplicate groups", duplicate_groups.len());
    
    for (i, group) in duplicate_groups.iter().enumerate() {
        println!("Group {}: Primary: {}, Duplicates: {}, Confidence: {}", 
                 i, 
                 group.primary_symbol.name,
                 group.duplicate_symbols.len(),
                 group.group_confidence);
        
        for (j, dup) in group.duplicate_symbols.iter().enumerate() {
            println!("  Duplicate {}: {}", j, dup.name);
        }
    }
    
    // These should definitely be found as duplicates
    assert!(!duplicate_groups.is_empty(), "Should find duplicate groups for identical symbols");
}

#[tokio::test]
async fn test_bloom_filter_debug() {
    // Test specifically if the bloom filter is working correctly
    
    use module_sentinel_parser::database::bloom_filter::AdaptiveSymbolBloomFilter;
    
    let mut bloom_filter = AdaptiveSymbolBloomFilter::new(1000, 0.01).await.unwrap();
    
    // Insert some symbol pairs
    bloom_filter.insert_symbol_pair("symbol1", "symbol2").await.unwrap();
    bloom_filter.insert_symbol_pair("symbol1", "symbol3").await.unwrap();
    
    // Test if we can find them
    let found_1_2 = bloom_filter.might_contain_pair("symbol1", "symbol2").await;
    let found_1_3 = bloom_filter.might_contain_pair("symbol1", "symbol3").await;
    let found_1_4 = bloom_filter.might_contain_pair("symbol1", "symbol4").await; // Should be false
    
    println!("Bloom filter test:");
    println!("  Found 1-2: {}", found_1_2);
    println!("  Found 1-3: {}", found_1_3); 
    println!("  Found 1-4: {}", found_1_4);
    
    assert!(found_1_2, "Should find inserted pair 1-2");
    assert!(found_1_3, "Should find inserted pair 1-3");
    assert!(!found_1_4, "Should not find non-inserted pair 1-4");
    
    println!("✅ Bloom filter is working correctly");
}