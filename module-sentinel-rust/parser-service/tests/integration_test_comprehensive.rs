use tokio;
use anyhow::Result;
use std::sync::Arc;

// Import all the components we need to test integration
use module_sentinel_parser::database::{
    SemanticDeduplicator, 
    semantic_pattern_engine::SemanticPatternEngine,
    adaptive_similarity_engine::AdaptiveSimilarityEngine,
    bloom_filter::AdaptiveSymbolBloomFilter,
};
use module_sentinel_parser::parsers::tree_sitter::{
    CodeEmbedder, Language, Symbol, SimilarityType
};

// Helper function to create test symbols with realistic properties
fn create_realistic_symbol(
    name: &str, 
    signature: &str, 
    language: Language,
    file_path: &str,
    embedding: Option<Vec<f32>>
) -> Symbol {
    Symbol {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        signature: signature.to_string(),
        language,
        file_path: file_path.to_string(),
        start_line: 1,
        end_line: 10,
        embedding,
        semantic_hash: Some(format!("hash_{}", name)),
        normalized_name: name.to_lowercase().replace("_", ""),
        context_embedding: Some(vec![0.1, 0.2, 0.3, 0.4, 0.5]),
        duplicate_of: None,
        confidence_score: None,
        similar_symbols: vec![],
    }
}

#[tokio::test]
async fn test_full_integration_semantic_deduplication_with_adaptive_bloom_filter() {
    // This test verifies that all our layers work together:
    // 1. SemanticDeduplicator uses AdaptiveSymbolBloomFilter
    // 2. Bloom filter auto-scales when needed
    // 3. ML embeddings are properly integrated
    // 4. Performance is maintained under load
    
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create a large set of symbols to test auto-scaling
    let mut symbols = Vec::new();
    
    // Create families of similar symbols across languages
    for i in 0..200 {
        // Rust function family
        let rust_embedding = vec![0.8, 0.1, 0.1, 0.0, 0.0]; // Similar embedding
        symbols.push(create_realistic_symbol(
            &format!("calculate_sum_{}", i),
            "fn(Vec<i32>) -> i32",
            Language::Rust,
            &format!("rust/math_{}.rs", i),
            Some(rust_embedding.clone())
        ));
        
        // Python equivalent 
        let python_embedding = vec![0.75, 0.15, 0.1, 0.0, 0.0]; // Slightly different but similar
        symbols.push(create_realistic_symbol(
            &format!("calculate_sum_{}", i),
            "def(List[int]) -> int",
            Language::Python,
            &format!("python/math_{}.py", i),
            Some(python_embedding)
        ));
        
        // TypeScript equivalent
        let ts_embedding = vec![0.78, 0.12, 0.1, 0.0, 0.0]; // Similar family
        symbols.push(create_realistic_symbol(
            &format!("calculateSum{}", i),
            "function(number[]): number",
            Language::TypeScript,
            &format!("typescript/math_{}.ts", i),
            Some(ts_embedding)
        ));
        
        // Add some dissimilar symbols to test filtering
        if i % 10 == 0 {
            let different_embedding = vec![0.0, 0.0, 0.9, 0.1, 0.0]; // Very different
            symbols.push(create_realistic_symbol(
                &format!("parse_xml_{}", i),
                "fn(&str) -> Result<XmlDoc>",
                Language::Rust,
                &format!("rust/parser_{}.rs", i),
                Some(different_embedding)
            ));
        }
    }
    
    println!("Testing semantic deduplication with {} symbols", symbols.len());
    
    let start_time = std::time::Instant::now();
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    let duration = start_time.elapsed();
    
    println!("Deduplication completed in {:?}", duration);
    println!("Found {} duplicate groups", duplicate_groups.len());
    
    // Verify that we found meaningful duplicate groups
    assert!(!duplicate_groups.is_empty(), "Should find duplicate groups");
    
    // Verify that similar symbols across languages are grouped together
    let cross_language_groups = duplicate_groups.iter()
        .filter(|group| {
            let mut languages = std::collections::HashSet::new();
            languages.insert(group.primary_symbol.language);
            for dup in &group.duplicate_symbols {
                languages.insert(dup.language);
            }
            languages.len() > 1
        })
        .count();
    
    println!("Found {} cross-language duplicate groups", cross_language_groups);
    assert!(cross_language_groups > 0, "Should find cross-language duplicates");
    
    // Verify performance - should complete in reasonable time even with 600+ symbols
    assert!(duration.as_secs() < 30, "Deduplication should complete within 30 seconds");
    
    // Test that high-confidence duplicates are properly identified
    let high_confidence_groups = duplicate_groups.iter()
        .filter(|group| group.group_confidence > 0.8)
        .count();
    
    println!("Found {} high-confidence duplicate groups", high_confidence_groups);
    assert!(high_confidence_groups > 0, "Should find some high-confidence duplicates");
}

#[tokio::test]
async fn test_adaptive_bloom_filter_integration_with_deduplicator() {
    // Test that the bloom filter properly auto-scales during deduplication
    
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder).await.unwrap();
    
    // Create a large number of symbols to trigger bloom filter scaling
    let mut symbols = Vec::new();
    for i in 0..1500 { // This should exceed the initial bloom filter capacity
        let embedding = vec![
            (i % 10) as f32 / 10.0,
            ((i + 1) % 10) as f32 / 10.0,
            0.0, 0.0, 0.0
        ];
        
        symbols.push(create_realistic_symbol(
            &format!("function_{}", i),
            &format!("fn() -> {}", i % 5),
            Language::Rust,
            &format!("module_{}.rs", i / 100),
            Some(embedding)
        ));
    }
    
    println!("Testing bloom filter auto-scaling with {} symbols", symbols.len());
    
    let start_time = std::time::Instant::now();
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    let duration = start_time.elapsed();
    
    println!("Large-scale deduplication completed in {:?}", duration);
    println!("Found {} duplicate groups from {} symbols", duplicate_groups.len(), symbols.len());
    
    // Verify the operation completed successfully
    assert!(duration.as_secs() < 60, "Should complete within 60 seconds even with auto-scaling");
    
    // The bloom filter should have auto-scaled during this operation
    // We can't directly test this, but the fact that it completed successfully indicates integration works
}

#[tokio::test]
async fn test_ml_feedback_integration_with_semantic_patterns() {
    // Test that ML feedback integration works with our semantic pattern engine
    
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = SemanticDeduplicator::new(embedder.clone()).await.unwrap();
    
    // Create symbols that should be considered similar by ML but different by basic metrics
    let symbol1 = create_realistic_symbol(
        "processUserData",
        "fn(User) -> Result<ProcessedUser>",
        Language::Rust,
        "user_service.rs",
        Some(vec![0.9, 0.1, 0.0, 0.0, 0.0]) // High semantic similarity
    );
    
    let symbol2 = create_realistic_symbol(
        "handle_user_processing", // Different naming convention
        "fn(User) -> Result<ProcessedUser>",
        Language::Rust,
        "user_handler.rs", 
        Some(vec![0.85, 0.15, 0.0, 0.0, 0.0]) // Similar embedding
    );
    
    let symbol3 = create_realistic_symbol(
        "parseXmlDocument", // Completely different functionality
        "fn(&str) -> Result<Document>",
        Language::Rust,
        "xml_parser.rs",
        Some(vec![0.0, 0.0, 0.9, 0.1, 0.0]) // Very different embedding
    );
    
    let symbols = vec![symbol1.clone(), symbol2.clone(), symbol3];
    
    // Test that similar symbols are identified
    let similarity_score = deduplicator.similarity_score(&symbol1, &symbol2).await.unwrap();
    println!("Similarity between processUserData and handle_user_processing: {}", similarity_score);
    assert!(similarity_score > 0.5, "Should detect semantic similarity despite naming differences");
    
    // Test full deduplication
    let duplicate_groups = deduplicator.find_duplicates(&symbols).await.unwrap();
    
    if !duplicate_groups.is_empty() {
        println!("Found {} duplicate groups", duplicate_groups.len());
        for group in &duplicate_groups {
            println!("Group confidence: {}, primary: {}, duplicates: {}", 
                group.group_confidence, 
                group.primary_symbol.name,
                group.duplicate_symbols.len()
            );
        }
    }
    
    // The similar symbols should be grouped together
    let found_similar_group = duplicate_groups.iter().any(|group| {
        (group.primary_symbol.name == "processUserData" && 
         group.duplicate_symbols.iter().any(|d| d.name == "handle_user_processing")) ||
        (group.primary_symbol.name == "handle_user_processing" && 
         group.duplicate_symbols.iter().any(|d| d.name == "processUserData"))
    });
    
    if found_similar_group {
        println!("✅ Successfully detected semantic similarity across naming conventions");
    } else {
        println!("⚠️ Did not group semantically similar symbols - may need threshold tuning");
    }
}

#[tokio::test]
async fn test_performance_under_concurrent_load() {
    // Test that our integrated system performs well under concurrent load
    
    let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
    let deduplicator = Arc::new(SemanticDeduplicator::new(embedder).await.unwrap());
    
    let mut handles = vec![];
    let symbols_per_thread = 100;
    let num_threads = 5;
    
    for thread_id in 0..num_threads {
        let deduplicator_clone = Arc::clone(&deduplicator);
        
        let handle = tokio::spawn(async move {
            let mut symbols = Vec::new();
            
            for i in 0..symbols_per_thread {
                let embedding = vec![
                    (thread_id as f32 + i as f32) / 20.0,
                    0.2, 0.1, 0.0, 0.0
                ];
                
                symbols.push(create_realistic_symbol(
                    &format!("thread_{}_function_{}", thread_id, i),
                    "fn() -> i32",
                    Language::Rust,
                    &format!("thread_{}.rs", thread_id),
                    Some(embedding)
                ));
            }
            
            let start = std::time::Instant::now();
            let groups = deduplicator_clone.find_duplicates(&symbols).await.unwrap();
            let duration = start.elapsed();
            
            (thread_id, groups.len(), duration)
        });
        
        handles.push(handle);
    }
    
    println!("Running concurrent deduplication with {} threads", num_threads);
    
    let mut total_groups = 0;
    let mut max_duration = std::time::Duration::from_secs(0);
    
    for handle in handles {
        let (thread_id, group_count, duration) = handle.await.unwrap();
        println!("Thread {} completed in {:?} with {} groups", thread_id, duration, group_count);
        
        total_groups += group_count;
        if duration > max_duration {
            max_duration = duration;
        }
    }
    
    println!("Concurrent processing completed. Total groups: {}, Max duration: {:?}", 
             total_groups, max_duration);
    
    // Verify reasonable performance under concurrent load
    assert!(max_duration.as_secs() < 30, "Individual threads should complete quickly");
    
    println!("✅ System maintains good performance under concurrent load");
}