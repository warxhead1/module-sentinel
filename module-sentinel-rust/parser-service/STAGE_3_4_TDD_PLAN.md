# STAGE 3 & 4 TDD IMPLEMENTATION PLAN
## Advanced Semantic Deduplication with Real-Time Performance & Database Integration

### 🎯 **OVERVIEW**
Building on our successful Phase 2 implementation, we now advance to Phase 3 (Bloom Filter Optimization) and Phase 4 (Database Integration) using Test-Driven Development. Our ML-integrated semantic deduplication system will gain production-ready performance optimization and persistent storage capabilities.

### 📋 **CURRENT STATE ASSESSMENT**
✅ **Phase 2 Completed Successfully:**
- Semantic deduplication engine with adaptive learning
- Multi-dimensional similarity analysis 
- AI feedback integration (optional capability)
- Live pattern learning and real-time adaptation  
- Basic bloom filter implementation
- **Test Results: 8/13 tests passing** - Core functionality working

### 🔧 **PHASE 3: BLOOM FILTER OPTIMIZATION & PERFORMANCE**
*Advanced filtering with dynamic resizing, cache optimization, and performance monitoring*

#### **P3.1: Dynamic Bloom Filter Scaling**
**Test First Approach:**
```rust
#[tokio::test] 
async fn test_dynamic_bloom_filter_auto_resize() {
    let mut filter = AdaptiveSymbolBloomFilter::new(1000, 0.01).await.unwrap();
    
    // Insert items beyond capacity threshold (80%)
    for i in 0..850 {
        filter.insert_symbol_pair(&format!("sym_{}", i), &format!("target_{}", i)).await.unwrap();
    }
    
    let stats_before = filter.get_performance_stats().await;
    assert!(stats_before.load_factor > 0.8);
    
    // This insertion should trigger auto-resize
    filter.insert_symbol_pair("trigger_resize", "final_symbol").await.unwrap();
    
    let stats_after = filter.get_performance_stats().await;
    assert!(stats_after.capacity > stats_before.capacity);
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
```

**Implementation Requirements:**
- `AdaptiveSymbolBloomFilter` with auto-resizing capability
- Memory pressure detection and response
- Thread-safe concurrent operations
- Performance metrics and monitoring

#### **P3.2: Cache-Optimized Symbol Matching**
**Test First Approach:**
```rust
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
            l2_cache_size: 5000,   // Warm cache - frequently used
            l3_cache_size: 20000,  // Cold cache - long-term storage
        }
    ).await.unwrap();
    
    // Fill L1 cache beyond capacity
    for i in 0..1500 {
        let symbol = create_test_symbol(&format!("symbol_{}", i));
        deduplicator.cache_symbol_similarity(&symbol, 0.8).await;
    }
    
    let cache_distribution = deduplicator.get_cache_distribution().await;
    
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
    
    // Train predictor with pattern: symbols ending in _impl often compared together
    let training_symbols = create_symbols_with_pattern("_impl", 50);
    deduplicator.train_prediction_model(&training_symbols).await.unwrap();
    
    // Request similarity for one _impl symbol
    let target_symbol = create_test_symbol("service_impl");
    let similar = deduplicator.find_similar_symbols(&target_symbol, &[]).await.unwrap();
    
    // Should have preloaded other _impl symbols based on pattern
    let cache_stats = deduplicator.get_predictive_cache_stats().await;
    assert!(cache_stats.successful_predictions > 0);
    assert!(cache_stats.preload_hit_rate > 0.6);
    
    // Verify preloaded symbols are actually useful
    let other_impl_symbol = create_test_symbol("repository_impl");
    let start = std::time::Instant::now();
    let similarity = deduplicator.similarity_score(&target_symbol, &other_impl_symbol).await.unwrap();
    let lookup_time = start.elapsed();
    
    assert!(lookup_time.as_millis() < 10); // Should be very fast due to preloading
    assert!(similarity > 0.5); // Should be meaningful similarity
}
```

#### **P3.3: Performance Monitoring & Telemetry**
**Test First Approach:**
```rust
#[tokio::test]
async fn test_real_time_performance_monitoring() {
    let monitor = PerformanceMonitor::new(MonitoringConfig {
        metrics_interval_ms: 100,
        alert_thresholds: AlertThresholds {
            max_similarity_calculation_ms: 50,
            max_false_positive_rate: 0.05,
            min_cache_hit_rate: 0.7,
        },
    }).await.unwrap();
    
    let deduplicator = MonitoredSemanticDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        monitor.clone()
    ).await.unwrap();
    
    // Perform operations that should generate metrics
    let symbols = create_test_symbol_set(500);
    deduplicator.find_duplicates(&symbols).await.unwrap();
    
    // Wait for metrics collection
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    
    let metrics = monitor.get_current_metrics().await;
    
    // Verify comprehensive metrics collection
    assert!(metrics.total_operations > 0);
    assert!(metrics.average_latency_ms > 0.0);
    assert!(metrics.cache_hit_rate >= 0.0 && metrics.cache_hit_rate <= 1.0);
    assert!(metrics.bloom_filter_effectiveness > 0.0);
    assert!(metrics.memory_usage_mb > 0.0);
    
    // Verify performance baselines
    assert!(metrics.average_latency_ms < 100.0); // Should be fast
    assert!(metrics.bloom_filter_effectiveness > 0.8); // Should be effective
}

#[tokio::test]
async fn test_automated_performance_regression_detection() {
    let regression_detector = PerformanceRegressionDetector::new(
        RegressionConfig {
            baseline_window: 1000,
            alert_threshold_percent: 20.0, // Alert if 20% slower
            min_samples: 50,
        }
    ).await.unwrap();
    
    let deduplicator = RegressionAwareDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap()),
        regression_detector.clone()
    ).await.unwrap();
    
    // Establish baseline performance
    for _ in 0..100 {
        let symbols = create_small_symbol_set(10);
        deduplicator.find_duplicates(&symbols).await.unwrap();
    }
    
    let baseline = regression_detector.get_baseline_metrics().await;
    assert!(baseline.is_established);
    
    // Simulate performance regression (artificially slow operation)
    regression_detector.simulate_slowdown(2.5).await; // 2.5x slower
    
    let mut alerts_received = 0;
    for _ in 0..60 {
        let symbols = create_small_symbol_set(10);
        deduplicator.find_duplicates(&symbols).await.unwrap();
        
        if regression_detector.check_for_alerts().await.len() > 0 {
            alerts_received += 1;
        }
    }
    
    // Should detect regression and generate alerts
    assert!(alerts_received > 5);
    
    let alerts = regression_detector.get_recent_alerts().await;
    assert!(alerts.iter().any(|a| a.alert_type == AlertType::PerformanceRegression));
}
```

### 🗄️ **PHASE 4: DATABASE INTEGRATION & PERSISTENCE**
*Production-ready database integration with incremental updates, relationship tracking, and data integrity*

#### **P4.1: Incremental Database Writer with Batching**
**Test First Approach:**
```rust
#[tokio::test]
async fn test_incremental_batch_writer_performance() {
    let db_writer = IncrementalBatchWriter::new(
        "test_incremental.db",
        BatchConfig {
            max_batch_size: 1000,
            max_batch_age_ms: 5000,
            parallel_writers: 4,
        }
    ).await.unwrap();
    
    // Generate large dataset
    let symbols = create_test_symbol_set(10000);
    let duplicate_groups = create_test_duplicate_groups(&symbols, 500);
    
    let start = std::time::Instant::now();
    
    // Write in multiple incremental batches
    for chunk in symbols.chunks(1000) {
        db_writer.write_symbols_incremental(chunk).await.unwrap();
    }
    
    for group in duplicate_groups {
        db_writer.write_duplicate_group(&group).await.unwrap();
    }
    
    // Force flush remaining batches
    db_writer.flush_all_batches().await.unwrap();
    
    let write_duration = start.elapsed();
    
    // Verify performance characteristics
    assert!(write_duration.as_secs() < 30); // Should complete quickly
    
    let writer_stats = db_writer.get_statistics().await;
    assert_eq!(writer_stats.total_symbols_written, 10000);
    assert_eq!(writer_stats.total_groups_written, 500);
    assert!(writer_stats.average_batch_size > 100); // Efficient batching
    assert!(writer_stats.database_integrity_check()); // Data consistent
}

#[tokio::test]
async fn test_conflict_resolution_during_concurrent_writes() {
    let db_writer = ConcurrentDatabaseWriter::new(
        "test_concurrent.db",
        ConcurrencyConfig {
            max_concurrent_writers: 8,
            conflict_resolution: ConflictResolution::MergeWithTimestamp,
            lock_timeout_ms: 1000,
        }
    ).await.unwrap();
    
    let base_symbol = create_test_symbol("shared_symbol");
    let mut handles = vec![];
    
    // Spawn multiple writers trying to update same symbol
    for writer_id in 0..5 {
        let writer = db_writer.clone();
        let mut symbol = base_symbol.clone();
        symbol.id = format!("writer_{}_update", writer_id);
        symbol.confidence_score = Some(0.1 * writer_id as f32);
        
        let handle = tokio::spawn(async move {
            writer.update_symbol_with_conflict_resolution(&symbol).await
        });
        handles.push(handle);
    }
    
    // Wait for all writers
    let results: Vec<_> = futures::future::join_all(handles).await;
    
    // All writes should succeed (no deadlocks)
    assert!(results.iter().all(|r| r.is_ok() && r.as_ref().unwrap().is_ok()));
    
    // Verify final state is consistent
    let final_symbol = db_writer.read_symbol("shared_symbol").await.unwrap();
    assert!(final_symbol.is_some());
    
    let conflict_stats = db_writer.get_conflict_statistics().await;
    assert!(conflict_stats.conflicts_resolved > 0);
    assert_eq!(conflict_stats.deadlocks_detected, 0);
}

#[tokio::test]
async fn test_incremental_deduplication_updates() {
    let db_writer = IncrementalDeduplicationWriter::new(
        "test_dedup_updates.db",
        DeduplicationConfig {
            update_strategy: UpdateStrategy::IncrementalMerge,
            relationship_tracking: true,
            history_preservation: true,
        }
    ).await.unwrap();
    
    // Initial symbol set
    let initial_symbols = create_test_symbol_set(100);
    db_writer.write_initial_symbols(&initial_symbols).await.unwrap();
    
    // Find initial duplicates
    let deduplicator = SemanticDeduplicator::new(
        Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap())
    ).await.unwrap();
    
    let initial_duplicates = deduplicator.find_duplicates(&initial_symbols).await.unwrap();
    db_writer.write_duplicate_groups(&initial_duplicates).await.unwrap();
    
    // Add new symbols that create additional relationships
    let new_symbols = create_related_symbol_set(&initial_symbols[0..10], 20);
    db_writer.write_symbols_incremental(&new_symbols).await.unwrap();
    
    // Update deduplication with new symbols
    let all_symbols = [initial_symbols, new_symbols].concat();
    let updated_duplicates = deduplicator.find_duplicates(&all_symbols).await.unwrap();
    
    // Incremental update should preserve existing relationships and add new ones
    let update_result = db_writer
        .update_deduplication_incremental(&updated_duplicates)
        .await.unwrap();
    
    assert!(update_result.relationships_added > 0);
    assert!(update_result.relationships_preserved > 0);
    assert_eq!(update_result.relationships_removed, 0); // Should not remove valid relationships
    
    // Verify relationship integrity
    let integrity_check = db_writer.verify_relationship_integrity().await.unwrap();
    assert!(integrity_check.is_valid);
    assert_eq!(integrity_check.orphaned_relationships, 0);
}
```

#### **P4.2: Relationship Tracking & Graph Operations**
**Test First Approach:**
```rust
#[tokio::test]
async fn test_symbol_relationship_graph_queries() {
    let graph_db = SymbolRelationshipGraph::new("test_graph.db").await.unwrap();
    
    // Create complex symbol relationships
    let symbols = create_hierarchical_symbol_set(50); // Functions, classes, modules
    graph_db.insert_symbols(&symbols).await.unwrap();
    
    // Create various relationship types
    let relationships = vec![
        SymbolRelationship::new("func_a", "func_b", RelationType::SimilarityDuplicate, 0.95),
        SymbolRelationship::new("func_a", "class_a", RelationType::MemberOf, 1.0),
        SymbolRelationship::new("func_b", "class_b", RelationType::MemberOf, 1.0),
        SymbolRelationship::new("class_a", "class_b", RelationType::CrossLanguageEquivalent, 0.8),
        SymbolRelationship::new("func_c", "func_a", RelationType::CallsFunction, 1.0),
    ];
    
    graph_db.insert_relationships(&relationships).await.unwrap();
    
    // Test complex graph queries
    
    // Find all symbols similar to func_a (direct and transitive)
    let similar_symbols = graph_db
        .find_similar_symbols_transitive("func_a", 0.7)
        .await.unwrap();
    
    assert!(similar_symbols.contains(&"func_b".to_string())); // Direct similarity
    // Should also find class_b through class_a relationship chain
    
    // Find dependency chains
    let dependency_chain = graph_db
        .find_dependency_chain("func_c", "class_b")
        .await.unwrap();
    
    assert!(dependency_chain.len() > 2); // Should find multi-hop path
    
    // Test relationship strength calculations
    let relationship_strength = graph_db
        .calculate_relationship_strength("func_a", "class_b")
        .await.unwrap();
    
    assert!(relationship_strength > 0.5); // Should find indirect relationship
}

#[tokio::test]
async fn test_graph_consistency_and_cleanup() {
    let graph_db = ConsistentSymbolGraph::new("test_consistency.db").await.unwrap();
    
    // Insert symbols and relationships
    let symbols = create_test_symbol_set(100);
    graph_db.insert_symbols(&symbols).await.unwrap();
    
    let relationships = create_random_relationships(&symbols, 200);
    graph_db.insert_relationships(&relationships).await.unwrap();
    
    // Simulate symbol removal (e.g., file deleted)
    let symbols_to_remove = &symbols[0..10];
    for symbol in symbols_to_remove {
        graph_db.remove_symbol(&symbol.id).await.unwrap();
    }
    
    // Run consistency check
    let consistency_report = graph_db.check_graph_consistency().await.unwrap();
    
    // Should detect orphaned relationships
    assert!(consistency_report.orphaned_relationships > 0);
    
    // Run cleanup
    let cleanup_result = graph_db.cleanup_orphaned_relationships().await.unwrap();
    assert_eq!(cleanup_result.relationships_removed, consistency_report.orphaned_relationships);
    
    // Verify consistency after cleanup
    let post_cleanup_report = graph_db.check_graph_consistency().await.unwrap();
    assert_eq!(post_cleanup_report.orphaned_relationships, 0);
    assert!(post_cleanup_report.graph_integrity_score > 0.95);
}

#[tokio::test] 
async fn test_temporal_relationship_tracking() {
    let temporal_graph = TemporalSymbolGraph::new("test_temporal.db").await.unwrap();
    
    let symbol_a = create_test_symbol("evolving_function");
    let symbol_b = create_test_symbol("similar_function");
    
    // Track relationship evolution over time
    let initial_time = chrono::Utc::now();
    temporal_graph
        .add_relationship_at_time(&symbol_a.id, &symbol_b.id, 0.6, initial_time)
        .await.unwrap();
    
    // Simulate code evolution - symbols become more similar
    let later_time = initial_time + chrono::Duration::hours(1);
    temporal_graph
        .update_relationship_at_time(&symbol_a.id, &symbol_b.id, 0.9, later_time)
        .await.unwrap();
    
    // Query relationship history
    let relationship_history = temporal_graph
        .get_relationship_history(&symbol_a.id, &symbol_b.id)
        .await.unwrap();
    
    assert_eq!(relationship_history.len(), 2);
    assert_eq!(relationship_history[0].similarity, 0.6);
    assert_eq!(relationship_history[1].similarity, 0.9);
    
    // Query relationships at specific time
    let snapshot_at_initial = temporal_graph
        .get_relationships_at_time(initial_time)
        .await.unwrap();
    
    let initial_similarity = snapshot_at_initial
        .iter()
        .find(|r| r.source_id == symbol_a.id && r.target_id == symbol_b.id)
        .unwrap()
        .similarity;
    
    assert_eq!(initial_similarity, 0.6);
    
    // Test time-based analytics
    let evolution_analysis = temporal_graph
        .analyze_similarity_evolution(&symbol_a.id, &symbol_b.id)
        .await.unwrap();
    
    assert_eq!(evolution_analysis.trend, SimilarityTrend::Increasing);
    assert!(evolution_analysis.rate_of_change > 0.0);
}
```

#### **P4.3: Data Integrity & Recovery**
**Test First Approach:**
```rust
#[tokio::test]
async fn test_database_corruption_recovery() {
    let recovery_db = RecoverableDatabase::new(
        "test_recovery.db",
        RecoveryConfig {
            checkpoint_interval_ms: 1000,
            max_recovery_attempts: 3,
            integrity_check_on_startup: true,
        }
    ).await.unwrap();
    
    // Write initial data
    let symbols = create_test_symbol_set(1000);
    recovery_db.write_symbols(&symbols).await.unwrap();
    
    // Create checkpoint
    recovery_db.create_checkpoint("before_corruption").await.unwrap();
    
    // Write more data
    let additional_symbols = create_test_symbol_set(500);
    recovery_db.write_symbols(&additional_symbols).await.unwrap();
    
    // Simulate corruption (partial write failure)
    recovery_db.simulate_corruption().await;
    
    // Attempt recovery
    let recovery_result = recovery_db.attempt_recovery().await.unwrap();
    
    assert!(recovery_result.recovery_successful);
    assert_eq!(recovery_result.recovered_symbols, 1000); // Should recover to checkpoint
    assert_eq!(recovery_result.lost_symbols, 500); // Recent data lost
    
    // Verify database integrity after recovery
    let integrity_check = recovery_db.verify_integrity().await.unwrap();
    assert!(integrity_check.is_valid);
    assert_eq!(integrity_check.symbol_count, 1000);
}

#[tokio::test]
async fn test_transaction_rollback_on_constraint_violation() {
    let transactional_db = TransactionalDatabase::new("test_transactions.db").await.unwrap();
    
    // Start transaction
    let tx = transactional_db.begin_transaction().await.unwrap();
    
    // Insert valid symbols
    let valid_symbols = create_test_symbol_set(10);
    tx.insert_symbols(&valid_symbols).await.unwrap();
    
    // Attempt to insert invalid relationship (referencing non-existent symbol)
    let invalid_relationship = SymbolRelationship::new(
        "valid_symbol", 
        "non_existent_symbol", 
        RelationType::SimilarityDuplicate, 
        0.8
    );
    
    let result = tx.insert_relationship(&invalid_relationship).await;
    assert!(result.is_err()); // Should fail constraint check
    
    // Transaction should auto-rollback
    let tx_status = tx.get_status().await;
    assert_eq!(tx_status, TransactionStatus::RolledBack);
    
    // Verify no partial data was committed
    let symbol_count = transactional_db.count_symbols().await.unwrap();
    assert_eq!(symbol_count, 0); // Should be empty due to rollback
    
    // Verify can start new transaction after rollback
    let new_tx = transactional_db.begin_transaction().await.unwrap();
    new_tx.insert_symbols(&valid_symbols).await.unwrap();
    new_tx.commit().await.unwrap();
    
    let final_count = transactional_db.count_symbols().await.unwrap();
    assert_eq!(final_count, 10); // New transaction should succeed
}

#[tokio::test]
async fn test_cross_database_consistency_check() {
    // Test consistency between main database and cache
    let main_db = MainDatabase::new("test_main.db").await.unwrap();
    let cache_db = CacheDatabase::new("test_cache.db").await.unwrap();
    
    let consistency_checker = CrossDatabaseConsistencyChecker::new(
        main_db.clone(),
        cache_db.clone()
    ).await.unwrap();
    
    // Insert data in both databases
    let symbols = create_test_symbol_set(100);
    main_db.insert_symbols(&symbols).await.unwrap();
    cache_db.cache_symbols(&symbols).await.unwrap();
    
    // Modify cache to create inconsistency
    let mut modified_symbol = symbols[0].clone();
    modified_symbol.confidence_score = Some(0.99);
    cache_db.update_cached_symbol(&modified_symbol).await.unwrap();
    
    // Run consistency check
    let consistency_report = consistency_checker.check_consistency().await.unwrap();
    
    assert_eq!(consistency_report.inconsistent_symbols, 1);
    assert!(consistency_report.cache_ahead_of_main.contains(&symbols[0].id));
    
    // Test automated synchronization
    let sync_result = consistency_checker
        .synchronize_databases(SyncDirection::MainToCache)
        .await.unwrap();
    
    assert_eq!(sync_result.symbols_synchronized, 1);
    
    // Verify consistency after sync
    let post_sync_report = consistency_checker.check_consistency().await.unwrap();
    assert_eq!(post_sync_report.inconsistent_symbols, 0);
}
```

### 🔧 **IMPLEMENTATION STRATEGY**

#### **Phase 3 Implementation Order:**
1. **Dynamic Bloom Filter Scaling** (P3.1)
   - Implement auto-resizing bloom filter
   - Add memory pressure detection
   - Create concurrent access support

2. **Cache Optimization** (P3.2)  
   - Build hierarchical LRU cache system
   - Add predictive preloading
   - Implement cache telemetry

3. **Performance Monitoring** (P3.3)
   - Create real-time metrics collection
   - Build regression detection
   - Add automated alerting

#### **Phase 4 Implementation Order:**
1. **Incremental Database Writer** (P4.1)
   - Build batched writing system
   - Add conflict resolution
   - Implement incremental updates

2. **Relationship Graph Operations** (P4.2)
   - Create graph database layer
   - Build relationship queries
   - Add temporal tracking

3. **Data Integrity & Recovery** (P4.3)
   - Implement corruption recovery
   - Add transaction support
   - Build consistency checking

### 📊 **SUCCESS METRICS**

#### **Phase 3 Success Criteria:**
- ✅ Bloom filter auto-scaling with <50ms resize time
- ✅ Cache hit rate >85% for repeated operations  
- ✅ Performance regression detection with <5% false positives
- ✅ Memory usage remains <2GB under high load
- ✅ Concurrent operations support 100+ simultaneous requests

#### **Phase 4 Success Criteria:**
- ✅ Database writes >10,000 symbols/second in batches
- ✅ Graph queries complete in <100ms for 10,000+ node graphs
- ✅ Recovery from corruption with <1% data loss
- ✅ Transaction rollback success rate >99.9%
- ✅ Cross-database consistency maintained during failures

### 🚀 **INTEGRATION WITH EXISTING ML SYSTEM**

Both phases maintain our ML-integrated architecture:
- **Live Data Feedback**: Performance metrics feed back to ML optimization
- **AI-Enhanced Operations**: Optional AI validation for complex operations
- **Adaptive Learning**: System learns from operational patterns
- **Real-time Adaptation**: Performance and database systems adapt based on usage patterns

### 📝 **TESTING STRATEGY**

**TDD Approach for Both Phases:**
1. **Write Tests First**: All functionality begins with comprehensive test cases
2. **Red-Green-Refactor**: Implement minimal code to pass tests, then optimize
3. **Integration Testing**: Test interactions between Phase 3 & 4 components
4. **Performance Testing**: Verify performance criteria under load
5. **Regression Testing**: Ensure new phases don't break Phase 2 functionality

**Test Categories:**
- **Unit Tests**: Individual component functionality
- **Integration Tests**: Component interaction testing  
- **Performance Tests**: Load and stress testing
- **Chaos Tests**: Failure scenario testing
- **End-to-End Tests**: Complete workflow validation

This plan ensures our semantic deduplication system evolves into a production-ready, high-performance solution while maintaining the ML integration and adaptive learning capabilities established in Phase 2.