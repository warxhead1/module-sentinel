pub mod lru_cache;
pub mod hierarchical_cache;  
pub mod predictive_cache;
pub mod cache_stats;

pub use lru_cache::{CachedSemanticDeduplicator, CacheConfig};
pub use hierarchical_cache::{HierarchicalCachedDeduplicator, HierarchicalCacheConfig, CacheLevel, CacheDistribution};
pub use predictive_cache::{PredictiveCachedDeduplicator, PredictiveCacheConfig, PredictiveCacheStats};
pub use cache_stats::CacheStatistics;