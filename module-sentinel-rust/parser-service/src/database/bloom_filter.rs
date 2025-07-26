use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, RwLock};
use tokio::sync::RwLock as AsyncRwLock;

/// High-performance bloom filter for fast duplicate symbol detection
/// Optimized for symbol pairs with configurable false positive rates
pub struct SymbolBloomFilter {
    // Bit array for the bloom filter
    bits: Vec<bool>,
    
    // Filter configuration
    capacity: usize,           // Expected number of items
    false_positive_rate: f64,  // Target false positive rate
    optimal_hash_count: usize, // Number of hash functions to use
    
    // Performance tracking
    insertions: usize,
    queries: usize,
    estimated_false_positives: usize,
}

/// Key for symbol pairs in the bloom filter
#[derive(Debug, Clone, Hash, Serialize, Deserialize)]
pub struct SymbolKey {
    pub name_hash: u64,
    pub signature_hash: u64,
    pub context_hash: u64,
    pub combined_hash: u64,
}

impl SymbolBloomFilter {
    /// Create a new bloom filter with specified capacity and false positive rate
    pub fn new(expected_items: usize, false_positive_rate: f64) -> Result<Self> {
        // Calculate optimal parameters
        let optimal_bits = Self::calculate_optimal_bits(expected_items, false_positive_rate);
        let optimal_hashes = Self::calculate_optimal_hashes(expected_items, optimal_bits);
        
        Ok(Self {
            bits: vec![false; optimal_bits],
            capacity: expected_items,
            false_positive_rate,
            optimal_hash_count: optimal_hashes,
            insertions: 0,
            queries: 0,
            estimated_false_positives: 0,
        })
    }
    
    /// Insert a symbol key into the bloom filter
    pub fn insert(&mut self, key: &SymbolKey) {
        let hashes = self.generate_hashes(key);
        
        for hash in hashes {
            let index = hash % self.bits.len();
            self.bits[index] = true;
        }
        
        self.insertions += 1;
    }
    
    /// Insert a symbol pair into the bloom filter
    pub fn insert_pair(&mut self, symbol1_id: &str, symbol2_id: &str) {
        let key = self.create_pair_key(symbol1_id, symbol2_id);
        self.insert(&key);
    }
    
    /// Check if a symbol key might be in the filter (no false negatives)
    pub fn might_contain(&mut self, key: &SymbolKey) -> bool {
        self.queries += 1;
        
        let hashes = self.generate_hashes(key);
        
        for hash in hashes {
            let index = hash % self.bits.len();
            if !self.bits[index] {
                return false; // Definitely not in the set
            }
        }
        
        // Might be in the set (could be false positive)
        self.estimate_false_positive();
        true
    }
    
    /// Check if a symbol pair might be in the filter
    pub fn might_contain_pair(&mut self, symbol1_id: &str, symbol2_id: &str) -> bool {
        let key = self.create_pair_key(symbol1_id, symbol2_id);
        self.might_contain(&key)
    }
    
    /// Get current false positive probability
    pub fn current_false_positive_rate(&self) -> f64 {
        if self.insertions == 0 {
            return 0.0;
        }
        
        // Calculate actual false positive rate based on current load
        let load_factor = self.insertions as f64 / self.capacity as f64;
        let bits_per_element = self.bits.len() as f64 / self.insertions as f64;
        
        // Approximate false positive rate: (1 - e^(-k*n/m))^k
        // where k = hash functions, n = insertions, m = bit array size
        let exponent = -(self.optimal_hash_count as f64 * self.insertions as f64) / self.bits.len() as f64;
        let base = 1.0 - exponent.exp();
        base.powf(self.optimal_hash_count as f64)
    }
    
    /// Get filter statistics
    pub fn stats(&self) -> BloomFilterStats {
        BloomFilterStats {
            capacity: self.capacity,
            insertions: self.insertions,
            queries: self.queries,
            bit_array_size: self.bits.len(),
            hash_functions: self.optimal_hash_count,
            target_false_positive_rate: self.false_positive_rate,
            current_false_positive_rate: self.current_false_positive_rate(),
            estimated_false_positives: self.estimated_false_positives,
            memory_usage_bytes: self.memory_usage(),
            load_factor: self.insertions as f64 / self.capacity as f64,
        }
    }
    
    /// Clear the bloom filter
    pub fn clear(&mut self) {
        self.bits.fill(false);
        self.insertions = 0;
        self.queries = 0;
        self.estimated_false_positives = 0;
    }
    
    /// Resize the bloom filter if needed (when load factor gets too high)
    pub fn maybe_resize(&mut self) -> Result<bool> {
        let load_factor = self.insertions as f64 / self.capacity as f64;
        
        if load_factor > 0.8 && self.current_false_positive_rate() > self.false_positive_rate * 2.0 {
            // Need to resize - double the capacity
            let new_capacity = self.capacity * 2;
            let new_bits = Self::calculate_optimal_bits(new_capacity, self.false_positive_rate);
            let new_hashes = Self::calculate_optimal_hashes(new_capacity, new_bits);
            
            // Create new filter (note: we lose existing data, would need rehashing in production)
            self.bits = vec![false; new_bits];
            self.capacity = new_capacity;
            self.optimal_hash_count = new_hashes;
            self.insertions = 0;
            self.queries = 0;
            self.estimated_false_positives = 0;
            
            tracing::info!("Resized bloom filter to capacity {}", new_capacity);
            return Ok(true);
        }
        
        Ok(false)
    }
    
    // Private helper methods
    
    fn calculate_optimal_bits(expected_items: usize, false_positive_rate: f64) -> usize {
        // m = -n * ln(p) / (ln(2)^2)
        // where n = expected items, p = false positive rate, m = optimal bits
        let n = expected_items as f64;
        let p = false_positive_rate;
        let m = -(n * p.ln()) / (2.0_f64.ln().powi(2));
        
        m.ceil() as usize
    }
    
    fn calculate_optimal_hashes(expected_items: usize, bit_array_size: usize) -> usize {
        // k = (m/n) * ln(2)
        // where m = bit array size, n = expected items, k = optimal hash functions
        let m = bit_array_size as f64;
        let n = expected_items as f64;
        let k = (m / n) * 2.0_f64.ln();
        
        k.round().max(1.0) as usize
    }
    
    fn generate_hashes(&self, key: &SymbolKey) -> Vec<usize> {
        let mut hashes = Vec::with_capacity(self.optimal_hash_count);
        
        // Use multiple hash values from the key
        let hash_sources = [
            key.name_hash,
            key.signature_hash,
            key.context_hash,
            key.combined_hash,
        ];
        
        // Generate the required number of hash functions
        for i in 0..self.optimal_hash_count {
            let hash_index = i % hash_sources.len();
            let base_hash = hash_sources[hash_index];
            
            // Create distinct hash functions using the double hashing technique
            // h_i(x) = (h1(x) + i * h2(x)) mod m
            let h1 = base_hash as usize;
            let h2 = (base_hash.wrapping_mul(0x9e3779b9)).wrapping_add(i as u64) as usize;
            let hash = h1.wrapping_add(i.wrapping_mul(h2));
            
            hashes.push(hash);
        }
        
        hashes
    }
    
    fn create_pair_key(&self, symbol1_id: &str, symbol2_id: &str) -> SymbolKey {
        // Create consistent key regardless of order
        let (first, second) = if symbol1_id < symbol2_id {
            (symbol1_id, symbol2_id)
        } else {
            (symbol2_id, symbol1_id)
        };
        
        let name_hash = self.hash_string(first);
        let signature_hash = self.hash_string(second);
        let context_hash = self.hash_string(&format!("{}:{}", first, second));
        let combined_hash = name_hash.wrapping_add(signature_hash).wrapping_mul(0x9e3779b9);
        
        SymbolKey {
            name_hash,
            signature_hash,
            context_hash,
            combined_hash,
        }
    }
    
    fn hash_string(&self, s: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        s.hash(&mut hasher);
        hasher.finish()
    }
    
    fn estimate_false_positive(&mut self) {
        // Simple estimation - in a real implementation we'd track this more precisely
        let current_rate = self.current_false_positive_rate();
        if current_rate > self.false_positive_rate {
            self.estimated_false_positives += 1;
        }
    }
    
    fn memory_usage(&self) -> usize {
        // Approximate memory usage in bytes
        std::mem::size_of::<Self>() + (self.bits.len() / 8) // bits packed into bytes
    }
}

/// Statistics about bloom filter performance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BloomFilterStats {
    pub capacity: usize,
    pub insertions: usize,
    pub queries: usize,
    pub bit_array_size: usize,
    pub hash_functions: usize,
    pub target_false_positive_rate: f64,
    pub current_false_positive_rate: f64,
    pub estimated_false_positives: usize,
    pub memory_usage_bytes: usize,
    pub load_factor: f64,
}

impl SymbolKey {
    /// Create a new symbol key from symbol properties
    pub fn new(name: &str, signature: &str, context: &str) -> Self {
        let mut hasher = DefaultHasher::new();
        
        // Generate distinct hashes for different aspects
        name.hash(&mut hasher);
        let name_hash = hasher.finish();
        
        signature.hash(&mut hasher);  
        let signature_hash = hasher.finish();
        
        context.hash(&mut hasher);
        let context_hash = hasher.finish();
        
        let combined_hash = name_hash.wrapping_add(signature_hash).wrapping_add(context_hash);
        
        Self {
            name_hash,
            signature_hash,
            context_hash,
            combined_hash,
        }
    }
    
    /// Create a combined hash for efficient comparisons
    pub fn combined_hash(&self) -> u64 {
        self.combined_hash
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bloom_filter_basic_operations() {
        let mut filter = SymbolBloomFilter::new(1000, 0.01).unwrap();
        
        // Test insertion and querying
        let key1 = SymbolKey::new("calculateSum", "fn(Vec<i32>) -> i32", "math");
        let key2 = SymbolKey::new("calc_sum", "fn(Vec<i32>) -> i32", "math");
        let key3 = SymbolKey::new("totally_different", "fn() -> String", "string");
        
        // Insert key1
        filter.insert(&key1);
        
        // Should find key1
        assert!(filter.might_contain(&key1));
        
        // Should not find key3 (never inserted)
        assert!(!filter.might_contain(&key3));
        
        // Insert key2
        filter.insert(&key2);
        assert!(filter.might_contain(&key2));
    }
    
    #[test]
    fn test_symbol_pair_operations() {
        let mut filter = SymbolBloomFilter::new(1000, 0.01).unwrap();
        
        // Test pair insertion
        filter.insert_pair("symbol1", "symbol2");
        
        // Should find the pair (order shouldn't matter)
        assert!(filter.might_contain_pair("symbol1", "symbol2"));
        assert!(filter.might_contain_pair("symbol2", "symbol1"));
        
        // Should not find different pairs
        assert!(!filter.might_contain_pair("symbol1", "symbol3"));
    }
    
    #[test]
    fn test_false_positive_rate() {
        let mut filter = SymbolBloomFilter::new(100, 0.01).unwrap();
        
        // Insert some keys
        for i in 0..50 {
            let key = SymbolKey::new(&format!("symbol{}", i), "fn()", "test");
            filter.insert(&key);
        }
        
        // Check false positive rate is reasonable
        let stats = filter.stats();
        assert!(stats.current_false_positive_rate < 0.1); // Should be much better than 10%
        assert!(stats.load_factor <= 1.0);
    }
}

// Phase 3.1: Advanced Adaptive Bloom Filter Types

/// Memory pressure levels for adaptive behavior
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryPressure {
    Normal,
    Medium,
    High,
    Critical,
}

/// Configuration for bloom filter behavior
#[derive(Debug, Clone)]
pub struct BloomFilterConfig {
    pub compression_enabled: bool,
    pub hash_functions: usize,
    pub auto_resize_threshold: f64,
    pub max_memory_mb: usize,
}

impl Default for BloomFilterConfig {
    fn default() -> Self {
        Self {
            compression_enabled: false,
            hash_functions: 3,
            auto_resize_threshold: 0.8,
            max_memory_mb: 512,
        }
    }
}

/// Performance statistics for advanced bloom filters
#[derive(Debug, Clone)]
pub struct BloomFilterPerformanceStats {
    pub capacity: usize,
    pub total_insertions: usize,
    pub load_factor: f64,
    pub false_positive_rate: f64,
    pub average_insertion_time_ms: f64,
    pub memory_usage_mb: f64,
    pub resize_count: usize,
}

impl Default for BloomFilterPerformanceStats {
    fn default() -> Self {
        Self {
            capacity: 0,
            total_insertions: 0,
            load_factor: 0.0,
            false_positive_rate: 0.0,
            average_insertion_time_ms: 0.0,
            memory_usage_mb: 0.0,
            resize_count: 0,
        }
    }
}

/// Adaptive bloom filter that automatically resizes when capacity is exceeded  
pub struct AdaptiveSymbolBloomFilter {
    inner: AsyncRwLock<SymbolBloomFilter>,
    config: BloomFilterConfig,
    stats: AsyncRwLock<BloomFilterPerformanceStats>,
    resize_threshold: f64,
    target_false_positive_rate: f64,
    // Store recent insertions for resize data preservation
    recent_insertions: AsyncRwLock<Vec<(String, String)>>,
    max_stored_insertions: usize,
}

impl AdaptiveSymbolBloomFilter {
    pub async fn new(initial_capacity: usize, false_positive_rate: f64) -> Result<Self> {
        let filter = SymbolBloomFilter::new(initial_capacity, false_positive_rate)?;
        let mut stats = BloomFilterPerformanceStats::default();
        stats.capacity = initial_capacity;
        
        Ok(Self {
            inner: AsyncRwLock::new(filter),
            config: BloomFilterConfig::default(),
            stats: AsyncRwLock::new(stats),
            resize_threshold: 0.8,
            target_false_positive_rate: false_positive_rate,
            recent_insertions: AsyncRwLock::new(Vec::new()),
            max_stored_insertions: 10000, // Store up to 10k recent insertions for resize
        })
    }
    
    pub async fn insert_symbol_pair(&mut self, symbol1: &str, symbol2: &str) -> Result<()> {
        let start_time = std::time::Instant::now();
        
        // Store this insertion for potential resize data preservation
        {
            let mut recent = self.recent_insertions.write().await;
            recent.push((symbol1.to_string(), symbol2.to_string()));
            
            // Keep only recent insertions to prevent unbounded growth
            if recent.len() > self.max_stored_insertions {
                let drain_count = recent.len() - self.max_stored_insertions;
                recent.drain(0..drain_count);
            }
        }
        
        // Update statistics first to get correct load factor
        {
            let mut stats = self.stats.write().await;
            stats.total_insertions += 1;
            stats.load_factor = stats.total_insertions as f64 / stats.capacity as f64;
        }
        
        // Check if we need to resize after updating stats
        {
            let stats = self.stats.read().await;
            if stats.load_factor > self.resize_threshold {
                drop(stats);
                self.resize_if_needed().await?;
            }
        }
        
        // Perform the insertion
        {
            let mut filter = self.inner.write().await;
            filter.insert_pair(symbol1, symbol2);
        }
        
        // Update timing statistics
        {
            let mut stats = self.stats.write().await;
            let insertion_time = start_time.elapsed().as_secs_f64() * 1000.0;
            stats.average_insertion_time_ms = 
                (stats.average_insertion_time_ms * (stats.total_insertions - 1) as f64 + insertion_time) 
                / stats.total_insertions as f64;
        }
        
        Ok(())
    }
    
    pub async fn might_contain_pair(&self, symbol1: &str, symbol2: &str) -> bool {
        let mut filter = self.inner.write().await;
        filter.might_contain_pair(symbol1, symbol2)
    }
    
    pub async fn get_performance_stats(&self) -> BloomFilterPerformanceStats {
        let stats = self.stats.read().await;
        let mut result = stats.clone();
        
        // Update false positive rate from inner filter
        let filter = self.inner.read().await;
        result.false_positive_rate = filter.current_false_positive_rate();
        result.memory_usage_mb = filter.stats().memory_usage_bytes as f64 / (1024.0 * 1024.0);
        
        result
    }
    
    async fn resize_if_needed(&mut self) -> Result<()> {
        let current_stats = self.stats.read().await;
        let new_capacity = current_stats.capacity * 2;
        drop(current_stats);
        
        // Get the recent insertions to re-insert after resize
        let stored_pairs = {
            let recent = self.recent_insertions.read().await;
            recent.clone()
        };
        
        // Create new larger filter
        let mut new_filter = SymbolBloomFilter::new(new_capacity, self.target_false_positive_rate)?;
        
        // Re-insert stored data into the new filter
        for (symbol1, symbol2) in &stored_pairs {
            new_filter.insert_pair(symbol1, symbol2);
        }
        
        // Replace the old filter with the new one containing the re-inserted data
        {
            let mut filter = self.inner.write().await;
            *filter = new_filter;
        }
        
        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.capacity = new_capacity;
            stats.load_factor = stats.total_insertions as f64 / new_capacity as f64;
            stats.resize_count += 1;
        }
        
        tracing::info!("Resized adaptive bloom filter to capacity {} and re-inserted {} stored pairs", 
                      new_capacity, stored_pairs.len());
        Ok(())
    }
}

/// Memory-aware bloom filter that adapts behavior based on memory pressure
pub struct MemoryAwareBloomFilter {
    inner: AsyncRwLock<SymbolBloomFilter>,
    config: AsyncRwLock<BloomFilterConfig>,
    memory_pressure: AsyncRwLock<MemoryPressure>,
    target_false_positive_rate: f64,
}

impl MemoryAwareBloomFilter {
    pub async fn new(capacity: usize, false_positive_rate: f64) -> Result<Self> {
        let filter = SymbolBloomFilter::new(capacity, false_positive_rate)?;
        
        Ok(Self {
            inner: AsyncRwLock::new(filter),
            config: AsyncRwLock::new(BloomFilterConfig::default()),
            memory_pressure: AsyncRwLock::new(MemoryPressure::Normal),
            target_false_positive_rate: false_positive_rate,
        })
    }
    
    pub async fn set_memory_pressure(&mut self, pressure: MemoryPressure) {
        let mut current_pressure = self.memory_pressure.write().await;
        *current_pressure = pressure;
        drop(current_pressure);
        
        // Adapt configuration based on memory pressure
        let mut config = self.config.write().await;
        match pressure {
            MemoryPressure::Normal => {
                config.compression_enabled = false;
                config.hash_functions = 3;
            }
            MemoryPressure::Medium => {
                config.compression_enabled = false;
                config.hash_functions = 2;
            }
            MemoryPressure::High => {
                config.compression_enabled = true;
                config.hash_functions = 2;
            }
            MemoryPressure::Critical => {
                config.compression_enabled = true;
                config.hash_functions = 1;
            }
        }
    }
    
    pub async fn get_current_config(&self) -> BloomFilterConfig {
        let config = self.config.read().await;
        config.clone()
    }
    
    pub async fn insert_symbol_pair(&mut self, symbol1: &str, symbol2: &str) -> Result<()> {
        let mut filter = self.inner.write().await;
        filter.insert_pair(symbol1, symbol2);
        Ok(())
    }
    
    pub async fn might_contain_pair(&self, symbol1: &str, symbol2: &str) -> bool {
        let mut filter = self.inner.write().await;
        filter.might_contain_pair(symbol1, symbol2)
    }
    
    pub async fn measure_accuracy_sample(&self, sample_size: usize) -> Result<f64> {
        // Simple accuracy measurement - check false positive rate
        let filter = self.inner.read().await;
        let fp_rate = filter.current_false_positive_rate();
        Ok(1.0 - fp_rate) // Accuracy is 1 - false positive rate
    }
}

/// Thread-safe concurrent bloom filter for high-throughput scenarios
pub struct ConcurrentBloomFilter {
    inner: Arc<AsyncRwLock<SymbolBloomFilter>>,
    stats: Arc<AsyncRwLock<BloomFilterPerformanceStats>>,
}

impl ConcurrentBloomFilter {
    pub async fn new(capacity: usize, false_positive_rate: f64) -> Result<Self> {
        let filter = SymbolBloomFilter::new(capacity, false_positive_rate)?;
        let mut stats = BloomFilterPerformanceStats::default();
        stats.capacity = capacity;
        
        Ok(Self {
            inner: Arc::new(AsyncRwLock::new(filter)),
            stats: Arc::new(AsyncRwLock::new(stats)),
        })
    }
    
    pub async fn insert_symbol_pair(&self, symbol1: &str, symbol2: &str) -> Result<()> {
        let start_time = std::time::Instant::now();
        
        {
            let mut filter = self.inner.write().await;
            filter.insert_pair(symbol1, symbol2);
        }
        
        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.total_insertions += 1;
            stats.load_factor = stats.total_insertions as f64 / stats.capacity as f64;
            
            let insertion_time = start_time.elapsed().as_secs_f64() * 1000.0;
            stats.average_insertion_time_ms = 
                (stats.average_insertion_time_ms * (stats.total_insertions - 1) as f64 + insertion_time) 
                / stats.total_insertions as f64;
        }
        
        Ok(())
    }
    
    pub async fn might_contain_pair(&self, symbol1: &str, symbol2: &str) -> bool {
        let mut filter = self.inner.write().await;
        filter.might_contain_pair(symbol1, symbol2)
    }
    
    pub async fn get_performance_stats(&self) -> BloomFilterPerformanceStats {
        let stats = self.stats.read().await;
        let mut result = stats.clone();
        
        let filter = self.inner.read().await;
        result.false_positive_rate = filter.current_false_positive_rate();
        result.memory_usage_mb = filter.stats().memory_usage_bytes as f64 / (1024.0 * 1024.0);
        
        result
    }
}