use serde::{Deserialize, Serialize};

/// Comprehensive cache performance statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatistics {
    // Hit rate metrics
    pub similarity_cache_hit_rate: f64,
    pub symbol_cache_hit_rate: f64,
    pub bloom_filter_efficiency: f64,
    
    // Performance metrics
    pub average_lookup_time_ms: f64,
    pub cache_warming_time_ms: f64,
    pub eviction_time_ms: f64,
    
    // Memory usage
    pub memory_usage_mb: f64,
    pub peak_memory_usage_mb: f64,
    pub cache_size_adaptations: u64,
    
    // Operation counts
    pub total_cache_hits: u64,
    pub total_cache_misses: u64,
    pub cache_evictions: u64,
    pub cache_insertions: u64,
    
    // Cache efficiency
    pub cache_utilization_percent: f64,
    pub false_positive_saves: u64, // Times bloom filter saved expensive operations
}

impl Default for CacheStatistics {
    fn default() -> Self {
        Self {
            similarity_cache_hit_rate: 0.0,
            symbol_cache_hit_rate: 0.0,
            bloom_filter_efficiency: 0.0,
            average_lookup_time_ms: 0.0,
            cache_warming_time_ms: 0.0,
            eviction_time_ms: 0.0,
            memory_usage_mb: 0.0,
            peak_memory_usage_mb: 0.0,
            cache_size_adaptations: 0,
            total_cache_hits: 0,
            total_cache_misses: 0,
            cache_evictions: 0,
            cache_insertions: 0,
            cache_utilization_percent: 0.0,
            false_positive_saves: 0,
        }
    }
}

impl CacheStatistics {
    pub fn update_hit_rates(&mut self, hits: u64, misses: u64) {
        let total_requests = hits + misses;
        if total_requests > 0 {
            self.similarity_cache_hit_rate = hits as f64 / total_requests as f64;
        }
        self.total_cache_hits = hits;
        self.total_cache_misses = misses;
    }
    
    pub fn record_memory_usage(&mut self, current_mb: f64) {
        self.memory_usage_mb = current_mb;
        if current_mb > self.peak_memory_usage_mb {
            self.peak_memory_usage_mb = current_mb;
        }
    }
    
    pub fn record_cache_operation(&mut self, operation_time_ms: f64, is_hit: bool) {
        // Update running average
        let total_ops = self.total_cache_hits + self.total_cache_misses;
        if total_ops > 0 {
            self.average_lookup_time_ms = 
                (self.average_lookup_time_ms * total_ops as f64 + operation_time_ms) / (total_ops + 1) as f64;
        } else {
            self.average_lookup_time_ms = operation_time_ms;
        }
        
        if is_hit {
            self.total_cache_hits += 1;
        } else {
            self.total_cache_misses += 1;
        }
    }
}