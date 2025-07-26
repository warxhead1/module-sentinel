use tokio;
use anyhow::Result;
use std::sync::Arc;
use std::collections::HashSet;

// Import the types we'll need to implement for Phase 3.2
use module_sentinel_parser::database::{
    cache::{
        CachedSemanticDeduplicator, CacheConfig, 
        HierarchicalCachedDeduplicator, HierarchicalCacheConfig, CacheLevel,
        PredictiveCachedDeduplicator, PredictiveCacheConfig,
        CacheStatistics, CacheDistribution, PredictiveCacheStats
    }
};
use module_sentinel_parser::parsers::tree_sitter::{CodeEmbedder, Language, Symbol};

// Helper functions for creating test symbols
fn create_test_symbol_set(count: usize) -> Vec<Symbol> {
    (0..count).map(|i| {
        Symbol {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!("function_{}", i),
            signature: format!("fn() -> i{}", i % 5),
            language: Language::Rust,
            file_path: format!("test_{}.rs", i),
            start_line: 1,
            end_line: 10,
            embedding: Some(vec![
                (i % 10) as f32 / 10.0,
                ((i + 2) % 10) as f32 / 10.0,
                0.0, 0.0, 0.0
            ]),
            semantic_hash: Some(format!("hash_{}", i)),
            normalized_name: format!("function{}", i),
            context_embedding: Some(vec![0.1, 0.2, 0.3]),
            duplicate_of: None,
            confidence_score: None,
            similar_symbols: vec![],
        }
    }).collect()
}

fn create_test_symbol(name: &str) -> Symbol {
    Symbol {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        signature: "fn() -> i32".to_string(),
        language: Language::Rust,
        file_path: format!("{}.rs", name),
        start_line: 1,
        end_line: 10,
        embedding: Some(vec![0.5, 0.3, 0.2, 0.0, 0.0]),
        semantic_hash: Some(format!("hash_{}", name)),
        normalized_name: name.to_lowercase(),
        context_embedding: Some(vec![0.1, 0.2, 0.3]),
        duplicate_of: None,
        confidence_score: None,
        similar_symbols: vec![],
    }
}

fn create_symbols_with_pattern(pattern: &str, count: usize) -> Vec<Symbol> {
    (0..count).map(|i| {
        Symbol {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!("function_{}{}", i, pattern),
            signature: "fn() -> i32".to_string(),
            language: Language::Rust,
            file_path: format!("module_{}.rs", i),
            start_line: 1,
            end_line: 10,
            embedding: Some(vec![0.6, 0.4, 0.0, 0.0, 0.0]),
            semantic_hash: Some(format!("hash_{}{}", i, pattern)),
            normalized_name: format!("function{}{}", i, pattern.replace("_", "")),
            context_embedding: Some(vec![0.1, 0.2, 0.3]),
            duplicate_of: None,
            confidence_score: None,
            similar_symbols: vec![],
        }
    }).collect()
}

// Phase 3.2 Test Cases from TDD Plan

#[tokio::test]
async fn test_lru_cache_integration_with_bloom_filter() {
    let deduplicator = CachedSemanticDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        CacheConfig {
            max_similarity_cache_size: 10000,
            max_symbol_cache_size: 5000,
            ttl_seconds: 300,
        }
    ).await.unwrap();
    
    let symbols = create_test_symbol_set(1000);
    
    // First pass - populate cache
    let start = std::time::Instant::now();
    let first_result = deduplicator.find_duplicates(&symbols).await.unwrap();
    let first_duration = start.elapsed();
    
    // Second pass - should hit cache
    let start = std::time::Instant::now();
    let second_result = deduplicator.find_duplicates(&symbols).await.unwrap();
    let second_duration = start.elapsed();
    
    // Cache should make second pass significantly faster
    assert!(second_duration < first_duration / 2);
    assert_eq!(first_result.len(), second_result.len()); // Same results
    
    let cache_stats = deduplicator.get_cache_statistics().await;
    assert!(cache_stats.similarity_cache_hit_rate > 0.8);
    assert!(cache_stats.bloom_filter_efficiency > 0.9);
}

#[tokio::test]
async fn test_hierarchical_cache_eviction() {
    let deduplicator = HierarchicalCachedDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        HierarchicalCacheConfig {
            l1_cache_size: 1000,   // Hot cache - recent items
            l2_cache_size: 400,    // Warm cache - frequently used (smaller to trigger L3)
            l3_cache_size: 20000,  // Cold cache - long-term storage
        }
    ).await.unwrap();
    
    // Fill L1 cache beyond capacity
    for i in 0..1500 {
        let symbol = create_test_symbol(&format!("symbol_{}", i));
        deduplicator.cache_symbol_similarity(&symbol, 0.8).await;
    }
    
    let cache_distribution = deduplicator.get_cache_distribution().await;
    
    println!("Cache distribution: L1={}, L2={}, L3={}, Total={}", 
             cache_distribution.l1_count, cache_distribution.l2_count, 
             cache_distribution.l3_count, cache_distribution.total_items);
    
    // Should have proper hierarchical distribution
    assert_eq!(cache_distribution.l1_count, 1000); // L1 at capacity
    assert!(cache_distribution.l2_count > 0);      // Overflow to L2
    assert!(cache_distribution.l3_count > 0);      // Some in L3
    
    // Most recent items should be in L1 (hottest cache)
    for i in 1400..1500 {
        let symbol = create_test_symbol(&format!("symbol_{}", i));
        let cache_level = deduplicator.check_cache_level(&symbol).await;
        assert_eq!(cache_level, CacheLevel::L1);
    }
}

#[tokio::test]
async fn test_predictive_cache_preloading() {
    let deduplicator = PredictiveCachedDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        PredictiveCacheConfig {
            prediction_window: 100,
            preload_threshold: 0.7,
            ml_prediction_enabled: true,
        }
    ).await.unwrap();
    
    // Create training symbols with _impl pattern - more diverse set
    let mut training_symbols = Vec::new();
    
    // Add service implementations
    for i in 0..20 {
        training_symbols.push(create_test_symbol(&format!("user_service_impl_{}", i)));
        training_symbols.push(create_test_symbol(&format!("order_service_impl_{}", i)));
        training_symbols.push(create_test_symbol(&format!("payment_service_impl_{}", i)));
    }
    
    // Add repository implementations  
    for i in 0..20 {
        training_symbols.push(create_test_symbol(&format!("user_repository_impl_{}", i)));
        training_symbols.push(create_test_symbol(&format!("order_repository_impl_{}", i)));
        training_symbols.push(create_test_symbol(&format!("payment_repository_impl_{}", i)));
    }
    
    // Add controller implementations
    for i in 0..20 {
        training_symbols.push(create_test_symbol(&format!("user_controller_impl_{}", i)));
        training_symbols.push(create_test_symbol(&format!("order_controller_impl_{}", i)));
    }
    
    // Train predictor with this diverse set
    deduplicator.train_prediction_model(&training_symbols).await.unwrap();
    
    // Now test with symbols from the trained set
    let target_symbol = create_test_symbol("service_impl");
    let context_symbols = vec![
        create_test_symbol("repository_impl"),
        create_test_symbol("controller_impl"),
        create_test_symbol("another_service_impl"),
    ];
    
    // This should trigger predictive preloading
    let similar = deduplicator.find_similar_symbols(&target_symbol, &context_symbols).await.unwrap();
    
    // Check initial cache stats after find_similar_symbols
    let cache_stats = deduplicator.get_predictive_cache_stats().await;
    println!("After find_similar_symbols - successful_predictions: {}", cache_stats.successful_predictions);
    
    // Now test similarity between _impl symbols to trigger cache hits
    let other_impl_symbol = create_test_symbol("repository_impl");
    let start = std::time::Instant::now();
    let similarity = deduplicator.similarity_score(&target_symbol, &other_impl_symbol).await.unwrap();
    let lookup_time = start.elapsed();
    
    // Check cache stats after similarity_score
    let final_cache_stats = deduplicator.get_predictive_cache_stats().await;
    println!("After similarity_score - successful_predictions: {}", final_cache_stats.successful_predictions);
    
    // Should have preloaded symbols based on pattern matching
    assert!(final_cache_stats.successful_predictions > 0, 
           "Expected successful predictions > 0, got {}", final_cache_stats.successful_predictions);
    assert!(final_cache_stats.preload_hit_rate > 0.0, 
           "Expected preload hit rate > 0.0, got {}", final_cache_stats.preload_hit_rate);
    
    // Verify the similarity lookup was reasonably fast and meaningful
    assert!(lookup_time.as_millis() < 50, "Lookup took too long: {}ms", lookup_time.as_millis());
    assert!(similarity > 0.5, "Expected meaningful similarity > 0.5, got {}", similarity);
    
    // Test a few more similarity calls to increase successful predictions
    for other_symbol in &context_symbols {
        if other_symbol.id != target_symbol.id {
            let _ = deduplicator.similarity_score(&target_symbol, other_symbol).await.unwrap();
        }
    }
    
    let final_stats = deduplicator.get_predictive_cache_stats().await;
    println!("Final stats - successful_predictions: {}, preload_hit_rate: {}", 
             final_stats.successful_predictions, final_stats.preload_hit_rate);
    
    // Should have accumulated more successful predictions
    assert!(final_stats.successful_predictions > 0);
}

#[tokio::test]
async fn test_cache_performance_under_memory_pressure() {
    let deduplicator = CachedSemanticDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        CacheConfig {
            max_similarity_cache_size: 1000,  // Small cache to trigger pressure
            max_symbol_cache_size: 500,
            ttl_seconds: 60,  // Short TTL to trigger evictions
        }
    ).await.unwrap();
    
    // Generate more symbols than cache can hold
    let symbols = create_test_symbol_set(2000);
    
    let start = std::time::Instant::now();
    let _result = deduplicator.find_duplicates(&symbols).await.unwrap();
    let duration = start.elapsed();
    
    println!("Large dataset processed in {:?}", duration);
    
    let cache_stats = deduplicator.get_cache_statistics().await;
    
    // Simulate memory pressure to trigger evictions
    let evicted_count = deduplicator.simulate_memory_pressure().await;
    
    let cache_stats = deduplicator.get_cache_statistics().await;
    
    // Verify cache behaved correctly under pressure
    assert!(cache_stats.cache_evictions > 0 || evicted_count > 0); // Should have evicted items
    assert!(cache_stats.memory_usage_mb < 100.0); // Should stay within bounds
    assert!(duration.as_secs() < 10); // Should still be reasonably fast
    
    println!("Cache stats under pressure: {:?}", cache_stats);
}

#[tokio::test]
async fn test_cache_coherency_across_concurrent_operations() {
    let deduplicator = Arc::new(CachedSemanticDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        CacheConfig {
            max_similarity_cache_size: 5000,
            max_symbol_cache_size: 2500,
            ttl_seconds: 300,
        }
    ).await.unwrap());
    
    let mut handles = vec![];
    
    // Spawn multiple concurrent operations
    for worker_id in 0..5 {
        let deduplicator_clone = Arc::clone(&deduplicator);
        
        let handle = tokio::spawn(async move {
            let symbols = create_test_symbol_set(200);
            
            // Each worker processes symbols multiple times
            let mut results = Vec::new();
            for iteration in 0..3 {
                let start = std::time::Instant::now();
                let result = deduplicator_clone.find_duplicates(&symbols).await.unwrap();
                let duration = start.elapsed();
                
                results.push((iteration, result.len(), duration));
            }
            
            (worker_id, results)
        });
        
        handles.push(handle);
    }
    
    // Collect results
    let mut all_results = Vec::new();
    for handle in handles {
        let (worker_id, results) = handle.await.unwrap();
        all_results.push((worker_id, results));
    }
    
    // Verify cache effectiveness across workers
    for (worker_id, results) in all_results {
        println!("Worker {} results:", worker_id);
        
        // Later iterations should be faster due to cache
        let first_duration = results[0].2;
        let last_duration = results[2].2;
        
        println!("  First: {:?}, Last: {:?}", first_duration, last_duration);
        
        // Results should be consistent
        let first_count = results[0].1;
        let last_count = results[2].1;
        assert_eq!(first_count, last_count, "Results should be consistent across cache hits");
        
        // Performance should improve (or at least not degrade significantly)
        assert!(last_duration <= first_duration * 2, "Cache should not significantly slow down operations");
    }
    
    let final_cache_stats = deduplicator.get_cache_statistics().await;
    println!("Final cache stats: {:?}", final_cache_stats);
    
    // Should have good hit rates from concurrent operations
    assert!(final_cache_stats.similarity_cache_hit_rate > 0.3);
}

#[tokio::test]
async fn test_adaptive_cache_sizing() {
    // Test that cache sizes adapt based on usage patterns
    
    let mut deduplicator = CachedSemanticDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        CacheConfig {
            max_similarity_cache_size: 1000,
            max_symbol_cache_size: 500, 
            ttl_seconds: 300,
        }
    ).await.unwrap();
    
    // Initial workload - small symbol set
    let small_symbols = create_test_symbol_set(100);
    deduplicator.find_duplicates(&small_symbols).await.unwrap();
    
    let initial_stats = deduplicator.get_cache_statistics().await;
    
    // Larger workload - should trigger adaptive behavior  
    let large_symbols = create_test_symbol_set(3000);
    deduplicator.find_duplicates(&large_symbols).await.unwrap();
    
    let final_stats = deduplicator.get_cache_statistics().await;
    
    println!("Initial cache usage: {:.2}MB", initial_stats.memory_usage_mb);
    println!("Final cache usage: {:.2}MB", final_stats.memory_usage_mb);
    
    // Cache should adapt to larger working set
    assert!(final_stats.cache_size_adaptations > 0);
    assert!(final_stats.peak_memory_usage_mb > initial_stats.memory_usage_mb);
    
    // But should still maintain reasonable bounds
    assert!(final_stats.memory_usage_mb < 200.0); // Reasonable memory limit
}

#[tokio::test]
async fn test_cache_warming_strategies() {
    let deduplicator = PredictiveCachedDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        PredictiveCacheConfig {
            prediction_window: 50,
            preload_threshold: 0.8,
            ml_prediction_enabled: true,
        }
    ).await.unwrap();
    
    // Create symbol patterns that should be predictable
    let mut all_symbols = Vec::new();
    
    // Pattern 1: Service classes
    for i in 0..20 {
        all_symbols.push(create_test_symbol(&format!("UserService_{}", i)));
        all_symbols.push(create_test_symbol(&format!("OrderService_{}", i)));
    }
    
    // Pattern 2: Repository classes  
    for i in 0..20 {
        all_symbols.push(create_test_symbol(&format!("UserRepository_{}", i)));
        all_symbols.push(create_test_symbol(&format!("OrderRepository_{}", i)));
    }
    
    // Train the predictor
    deduplicator.train_prediction_model(&all_symbols).await.unwrap();
    
    // Test cache warming
    let service_symbol = create_test_symbol("PaymentService_1");
    deduplicator.warm_cache_for_symbol(&service_symbol).await.unwrap();
    
    let warming_stats = deduplicator.get_predictive_cache_stats().await;
    
    // Should have warmed cache with related symbols
    assert!(warming_stats.cache_warming_events > 0);
    assert!(warming_stats.preloaded_symbols > 0);
    
    // Subsequent operations on similar symbols should be fast
    let related_symbol = create_test_symbol("PaymentService_2");
    let start = std::time::Instant::now();
    let _similarity = deduplicator.similarity_score(&service_symbol, &related_symbol).await.unwrap();
    let lookup_time = start.elapsed();
    
    assert!(lookup_time.as_millis() < 5); // Very fast due to cache warming
    
    println!("Cache warming effectiveness: {} symbols preloaded, {}ms lookup time", 
             warming_stats.preloaded_symbols, lookup_time.as_millis());
}