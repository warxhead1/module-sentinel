use tokio;
use anyhow::Result;
use std::sync::Arc;
use std::collections::HashSet;

// Import the types we'll need to implement
use module_sentinel_parser::database::bloom_filter::{
    AdaptiveSymbolBloomFilter, MemoryAwareBloomFilter, ConcurrentBloomFilter,
    BloomFilterPerformanceStats, MemoryPressure, BloomFilterConfig
};

// Test helper functions
fn generate_test_symbol_pairs(count: usize) -> Vec<(String, String)> {
    (0..count)
        .map(|i| (format!("sym_{}", i), format!("target_{}", i)))
        .collect()
}

#[tokio::test]
async fn test_dynamic_bloom_filter_auto_resize() {
    let mut filter = AdaptiveSymbolBloomFilter::new(1000, 0.01).await.unwrap();
    
    // Insert items up to but not exceeding capacity threshold (80%)
    for i in 0..799 {
        filter.insert_symbol_pair(&format!("sym_{}", i), &format!("target_{}", i)).await.unwrap();
    }
    
    let stats_before = filter.get_performance_stats().await;
    println!("Load factor before: {}, capacity: {}, insertions: {}", 
             stats_before.load_factor, stats_before.capacity, stats_before.total_insertions);
    assert!(stats_before.load_factor < 0.8); // Should not have resized yet
    assert_eq!(stats_before.capacity, 1000); // Original capacity
    
    // These insertions should trigger auto-resize
    filter.insert_symbol_pair("trigger_resize_1", "final_symbol_1").await.unwrap();
    filter.insert_symbol_pair("trigger_resize_2", "final_symbol_2").await.unwrap();
    
    let stats_after = filter.get_performance_stats().await;
    println!("Load factor after: {}, capacity: {}, insertions: {}", 
             stats_after.load_factor, stats_after.capacity, stats_after.total_insertions);
    assert!(stats_after.capacity > stats_before.capacity); // Should have resized
    assert!(stats_after.load_factor < 0.5); // Should be reduced after resize
    assert!(stats_after.false_positive_rate < 0.02); // Within acceptable bounds
}

#[tokio::test]
async fn test_bloom_filter_memory_pressure_response() {
    let mut filter = MemoryAwareBloomFilter::new(10000, 0.01).await.unwrap();
    
    // Simulate memory pressure
    filter.set_memory_pressure(MemoryPressure::High).await;
    
    // Should use more aggressive compression
    let config = filter.get_current_config().await;
    assert!(config.compression_enabled);
    assert!(config.hash_functions < 5); // Reduced for memory efficiency
    
    // Should still maintain accuracy
    for i in 0..100 {
        filter.insert_symbol_pair(&format!("test_{}", i), "target").await.unwrap();
    }
    
    let accuracy = filter.measure_accuracy_sample(100).await.unwrap();
    assert!(accuracy > 0.95); // Still highly accurate despite memory constraints
}

#[tokio::test]
async fn test_multi_threaded_bloom_filter_performance() {
    let filter = Arc::new(ConcurrentBloomFilter::new(50000, 0.001).await.unwrap());
    let mut handles = vec![];
    
    // Spawn 10 concurrent workers
    for worker_id in 0..10 {
        let filter_clone = Arc::clone(&filter);
        let handle = tokio::spawn(async move {
            for i in 0..1000 {
                let key = format!("worker_{}_{}", worker_id, i);
                filter_clone.insert_symbol_pair(&key, "shared_target").await.unwrap();
                
                // Verify immediate read consistency
                assert!(filter_clone.might_contain_pair(&key, "shared_target").await);
            }
            worker_id
        });
        handles.push(handle);
    }
    
    // Wait for all workers
    for handle in handles {
        handle.await.unwrap();
    }
    
    let final_stats = filter.get_performance_stats().await;
    assert_eq!(final_stats.total_insertions, 10000);
    assert!(final_stats.average_insertion_time_ms < 1.0); // Fast insertions
    assert!(final_stats.false_positive_rate < 0.002); // Within target
}

#[tokio::test]
async fn test_bloom_filter_resize_preserves_data() {
    let mut filter = AdaptiveSymbolBloomFilter::new(500, 0.01).await.unwrap();
    
    // Insert data that we'll verify after resize
    let test_pairs = generate_test_symbol_pairs(400);
    for (sym, target) in &test_pairs {
        filter.insert_symbol_pair(sym, target).await.unwrap();
    }
    
    // Verify all data is present before resize
    for (sym, target) in &test_pairs {
        assert!(filter.might_contain_pair(sym, target).await);
    }
    
    // Force a resize by inserting more data
    for i in 400..500 {
        filter.insert_symbol_pair(&format!("additional_{}", i), "target").await.unwrap();
    }
    
    // Verify original data is still present after resize
    for (sym, target) in &test_pairs {
        assert!(
            filter.might_contain_pair(sym, target).await,
            "Lost data after resize: {} -> {}", sym, target
        );
    }
}

#[tokio::test]
async fn test_memory_pressure_adaptive_behavior() {
    let mut filter = MemoryAwareBloomFilter::new(5000, 0.01).await.unwrap();
    
    // Start with normal memory pressure
    filter.set_memory_pressure(MemoryPressure::Normal).await;
    let normal_config = filter.get_current_config().await;
    
    // Insert some data
    for i in 0..1000 {
        filter.insert_symbol_pair(&format!("normal_{}", i), "target").await.unwrap();
    }
    
    // Switch to high memory pressure
    filter.set_memory_pressure(MemoryPressure::High).await;
    let high_pressure_config = filter.get_current_config().await;
    
    // Configuration should be more memory-conscious
    assert!(high_pressure_config.hash_functions <= normal_config.hash_functions);
    assert!(high_pressure_config.compression_enabled || !normal_config.compression_enabled);
    
    // Should still function correctly
    for i in 1000..1500 {
        filter.insert_symbol_pair(&format!("pressure_{}", i), "target").await.unwrap();
    }
    
    // Verify data from both phases
    for i in 0..1000 {
        assert!(filter.might_contain_pair(&format!("normal_{}", i), "target").await);
    }
    for i in 1000..1500 {
        assert!(filter.might_contain_pair(&format!("pressure_{}", i), "target").await);
    }
}

#[tokio::test]
async fn test_concurrent_filter_data_consistency() {
    let filter = Arc::new(ConcurrentBloomFilter::new(10000, 0.01).await.unwrap());
    let inserted_pairs = Arc::new(tokio::sync::Mutex::new(HashSet::new()));
    let mut handles = vec![];
    
    // Spawn multiple inserters and readers
    for worker_id in 0..5 {
        let filter_clone = Arc::clone(&filter);
        let pairs_clone = Arc::clone(&inserted_pairs);
        
        let handle = tokio::spawn(async move {
            for i in 0..200 {
                let key = format!("worker_{}_{}", worker_id, i);
                let target = format!("target_{}", i % 10); // Some overlap in targets
                
                // Insert the pair
                filter_clone.insert_symbol_pair(&key, &target).await.unwrap();
                
                // Record what we inserted
                {
                    let mut pairs = pairs_clone.lock().await;
                    pairs.insert((key.clone(), target.clone()));
                }
                
                // Immediately verify it's findable
                assert!(
                    filter_clone.might_contain_pair(&key, &target).await,
                    "Failed to find immediately after insert: {} -> {}", key, target
                );
            }
        });
        handles.push(handle);
    }
    
    // Wait for all insertions to complete
    for handle in handles {
        handle.await.unwrap();
    }
    
    // Verify all inserted pairs are still findable
    let final_pairs = inserted_pairs.lock().await;
    for (key, target) in final_pairs.iter() {
        assert!(
            filter.might_contain_pair(key, target).await,
            "Lost data in concurrent scenario: {} -> {}", key, target
        );
    }
    
    println!("Successfully verified {} pairs in concurrent scenario", final_pairs.len());
}

#[tokio::test]
async fn test_performance_stats_accuracy() {
    let mut filter = AdaptiveSymbolBloomFilter::new(2000, 0.02).await.unwrap();
    
    let initial_stats = filter.get_performance_stats().await;
    assert_eq!(initial_stats.total_insertions, 0);
    assert_eq!(initial_stats.capacity, 2000);
    assert_eq!(initial_stats.load_factor, 0.0);
    
    // Insert exactly 500 items
    for i in 0..500 {
        filter.insert_symbol_pair(&format!("test_{}", i), &format!("target_{}", i)).await.unwrap();
    }
    
    let after_insertions = filter.get_performance_stats().await;
    assert_eq!(after_insertions.total_insertions, 500);
    assert!((after_insertions.load_factor - 0.25).abs() < 0.01); // 500/2000 = 0.25
    assert!(after_insertions.false_positive_rate >= 0.0);
    assert!(after_insertions.false_positive_rate <= 0.05); // Should be reasonable
    
    // Test false positive rate measurement with items we know aren't there
    let mut false_positives = 0;
    let test_count = 1000;
    
    for i in 1000..1000 + test_count {
        if filter.might_contain_pair(&format!("not_inserted_{}", i), "target").await {
            false_positives += 1;
        }
    }
    
    let measured_fp_rate = false_positives as f64 / test_count as f64;
    
    // Should be close to our configured rate (0.02) but allow for some variance
    assert!(measured_fp_rate < 0.1, "False positive rate too high: {}", measured_fp_rate);
    
    println!("Measured false positive rate: {:.3}%", measured_fp_rate * 100.0);
}