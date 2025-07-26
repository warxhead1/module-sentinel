use anyhow::{Result, anyhow};
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

use crate::database::{
    orm::{Database, QueryBuilder, Model, DatabaseValue},
    cache::{CachedSemanticDeduplicator, CacheStatistics},
    DuplicateGroup,
};

/// Cache entry stored in the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub id: Option<i32>,
    pub cache_key: String,
    pub cache_type: String, // "similarity", "symbol", "duplicate_group"
    pub cached_value: String, // JSON serialized value
    pub access_count: i64,
    pub created_at: String,
    pub last_accessed: String,
    pub expires_at: String,
}

impl Default for CacheEntry {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let expires = chrono::Utc::now() + chrono::Duration::hours(24);
        
        Self {
            id: None,
            cache_key: String::new(),
            cache_type: String::new(),
            cached_value: String::new(),
            access_count: 0,
            created_at: now.clone(),
            last_accessed: now,
            expires_at: expires.to_rfc3339(),
        }
    }
}

impl Model for CacheEntry {
    fn table_name() -> &'static str { "cache_entries" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "cache_key", "cache_type", "cached_value", "access_count", 
             "created_at", "last_accessed", "expires_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("cache_key".to_string(), self.cache_key.clone().into());
        values.insert("cache_type".to_string(), self.cache_type.clone().into());
        values.insert("cached_value".to_string(), self.cached_value.clone().into());
        values.insert("access_count".to_string(), DatabaseValue::Integer(self.access_count));
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values.insert("last_accessed".to_string(), self.last_accessed.clone().into());
        values.insert("expires_at".to_string(), self.expires_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            cache_key: match values.get("cache_key") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            cache_type: match values.get("cache_type") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            cached_value: match values.get("cached_value") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            access_count: match values.get("access_count") {
                Some(DatabaseValue::Integer(i)) => *i,
                _ => 0,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            last_accessed: match values.get("last_accessed") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            expires_at: match values.get("expires_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}

/// Manages cache persistence to database
pub struct CachePersistenceManager {
    db: Database,
    cache: Arc<CachedSemanticDeduplicator>,
    persistence_interval_secs: u64,
    max_cache_entries: usize,
}

impl CachePersistenceManager {
    /// Create a new cache persistence manager
    pub async fn new(
        db: Database, 
        cache: Arc<CachedSemanticDeduplicator>,
        persistence_interval_secs: u64,
    ) -> Result<Self> {
        // Create cache table if it doesn't exist
        Self::create_cache_table(&db).await?;
        
        Ok(Self {
            db,
            cache,
            persistence_interval_secs,
            max_cache_entries: 10000,
        })
    }
    
    /// Create the cache entries table
    async fn create_cache_table(db: &Database) -> Result<()> {
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS cache_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cache_key TEXT NOT NULL,
                cache_type TEXT NOT NULL,
                cached_value TEXT NOT NULL,
                access_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                last_accessed TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                UNIQUE(cache_key, cache_type)
            )
        "#.to_string()).await?;
        
        // Create indexes for performance
        db.migrate(r#"
            CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
            CREATE INDEX IF NOT EXISTS idx_cache_access ON cache_entries(last_accessed);
            CREATE INDEX IF NOT EXISTS idx_cache_key_type ON cache_entries(cache_key, cache_type);
        "#.to_string()).await?;
        
        Ok(())
    }
    
    /// Start the background persistence task
    pub async fn start_persistence_task(self: Arc<Self>) {
        let manager = Arc::clone(&self);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(manager.persistence_interval_secs)).await;
                
                if let Err(e) = manager.persist_cache_to_db().await {
                    eprintln!("Failed to persist cache: {}", e);
                }
                
                if let Err(e) = manager.cleanup_expired_entries().await {
                    eprintln!("Failed to cleanup expired entries: {}", e);
                }
            }
        });
    }
    
    /// Persist current cache state to database
    pub async fn persist_cache_to_db(&self) -> Result<()> {
        // Get cache statistics to determine what to persist
        let stats = self.cache.get_cache_statistics().await;
        
        // Persist high-value cache entries (frequently accessed)
        // This is a placeholder - in a real implementation, we'd access the internal
        // cache structures and persist the most valuable entries
        
        println!("Cache persistence: {:.2}% hit rate", 
                 stats.similarity_cache_hit_rate * 100.0);
        
        Ok(())
    }
    
    /// Load cache from database on startup
    pub async fn load_cache_from_db(&self) -> Result<()> {
        // Load recent, frequently accessed cache entries
        let recent_entries = self.db.find_all(
            QueryBuilder::<CacheEntry>::new()
                .where_gt("expires_at", chrono::Utc::now().to_rfc3339())
                .order_by("access_count", true) // descending
                .limit(self.max_cache_entries as i64)
        ).await?;
        
        println!("Loaded {} cache entries from database", recent_entries.len());
        
        // TODO: Deserialize and populate the actual cache structures
        // This would require access to the internal cache implementation
        
        Ok(())
    }
    
    /// Store a similarity score in the cache
    pub async fn store_similarity_score(&self, symbol1_id: &str, symbol2_id: &str, score: f32) -> Result<()> {
        let cache_key = format!("{}:{}", symbol1_id, symbol2_id);
        let cached_value = serde_json::to_string(&score)?;
        
        let entry = CacheEntry {
            cache_key,
            cache_type: "similarity".to_string(),
            cached_value,
            access_count: 1,
            expires_at: (chrono::Utc::now() + chrono::Duration::hours(24)).to_rfc3339(),
            ..Default::default()
        };
        
        // Try to update existing entry, or insert new one
        let existing = self.db.find_all(
            QueryBuilder::<CacheEntry>::new()
                .where_eq("cache_key", entry.cache_key.clone())
                .where_eq("cache_type", entry.cache_type.clone())
                .limit(1)
        ).await?;
        
        if let Some(mut existing_entry) = existing.into_iter().next() {
            existing_entry.access_count += 1;
            existing_entry.last_accessed = chrono::Utc::now().to_rfc3339();
            existing_entry.cached_value = entry.cached_value;
            self.db.update(&existing_entry).await?;
        } else {
            self.db.insert(entry).await?;
        }
        
        Ok(())
    }
    
    /// Retrieve a similarity score from the cache
    pub async fn get_similarity_score(&self, symbol1_id: &str, symbol2_id: &str) -> Result<Option<f32>> {
        let cache_key = format!("{}:{}", symbol1_id, symbol2_id);
        
        let entries = self.db.find_all(
            QueryBuilder::<CacheEntry>::new()
                .where_eq("cache_key", cache_key)
                .where_eq("cache_type", "similarity")
                .where_gt("expires_at", chrono::Utc::now().to_rfc3339())
                .limit(1)
        ).await?;
        
        if let Some(mut entry) = entries.into_iter().next() {
            // Update access count and timestamp
            entry.access_count += 1;
            entry.last_accessed = chrono::Utc::now().to_rfc3339();
            self.db.update(&entry).await?;
            
            // Deserialize the score
            let score: f32 = serde_json::from_str(&entry.cached_value)?;
            Ok(Some(score))
        } else {
            Ok(None)
        }
    }
    
    /// Store duplicate groups in the cache
    pub async fn store_duplicate_groups(&self, project_id: i32, groups: &[DuplicateGroup]) -> Result<()> {
        let cache_key = format!("project_duplicates:{}", project_id);
        let cached_value = serde_json::to_string(&groups)?;
        
        let entry = CacheEntry {
            cache_key,
            cache_type: "duplicate_groups".to_string(),
            cached_value,
            access_count: 1,
            expires_at: (chrono::Utc::now() + chrono::Duration::hours(6)).to_rfc3339(),
            ..Default::default()
        };
        
        // Update or insert
        let existing = self.db.find_all(
            QueryBuilder::<CacheEntry>::new()
                .where_eq("cache_key", entry.cache_key.clone())
                .where_eq("cache_type", entry.cache_type.clone())
                .limit(1)
        ).await?;
        
        if let Some(mut existing_entry) = existing.into_iter().next() {
            existing_entry.access_count += 1;
            existing_entry.last_accessed = chrono::Utc::now().to_rfc3339();
            existing_entry.cached_value = entry.cached_value;
            existing_entry.expires_at = entry.expires_at;
            self.db.update(&existing_entry).await?;
        } else {
            self.db.insert(entry).await?;
        }
        
        Ok(())
    }
    
    /// Retrieve duplicate groups from the cache
    pub async fn get_duplicate_groups(&self, project_id: i32) -> Result<Option<Vec<DuplicateGroup>>> {
        let cache_key = format!("project_duplicates:{}", project_id);
        
        let entries = self.db.find_all(
            QueryBuilder::<CacheEntry>::new()
                .where_eq("cache_key", cache_key)
                .where_eq("cache_type", "duplicate_groups")
                .where_gt("expires_at", chrono::Utc::now().to_rfc3339())
                .limit(1)
        ).await?;
        
        if let Some(mut entry) = entries.into_iter().next() {
            // Update access count
            entry.access_count += 1;
            entry.last_accessed = chrono::Utc::now().to_rfc3339();
            self.db.update(&entry).await?;
            
            // Deserialize the groups
            let groups: Vec<DuplicateGroup> = serde_json::from_str(&entry.cached_value)?;
            Ok(Some(groups))
        } else {
            Ok(None)
        }
    }
    
    /// Clean up expired cache entries
    pub async fn cleanup_expired_entries(&self) -> Result<()> {
        // Delete entries that have expired
        let expired_count = self.db.execute(
            "DELETE FROM cache_entries WHERE expires_at < ?",
            vec![chrono::Utc::now().to_rfc3339().into()]
        ).await?;
        
        if expired_count > 0 {
            println!("Cleaned up {} expired cache entries", expired_count);
        }
        
        // Also delete least recently used entries if we're over the limit
        let total_count = self.db.count(QueryBuilder::<CacheEntry>::new()).await?;
        
        if total_count > self.max_cache_entries as i64 {
            let to_delete = total_count - self.max_cache_entries as i64;
            
            // Get the IDs of the least recently used entries
            let lru_entries = self.db.find_all(
                QueryBuilder::<CacheEntry>::new()
                    .order_by("last_accessed", false) // ascending (oldest first)
                    .limit(to_delete as i64)
            ).await?;
            
            for entry in lru_entries {
                if let Some(id) = entry.id {
                    self.db.delete::<CacheEntry>(id as i64).await?;
                }
            }
            
            println!("Cleaned up {} LRU cache entries", to_delete);
        }
        
        Ok(())
    }
    
    /// Get cache statistics including persistence info
    pub async fn get_persistence_stats(&self) -> Result<CachePersistenceStats> {
        let total_entries = self.db.count(QueryBuilder::<CacheEntry>::new()).await?;
        
        let similarity_entries = self.db.count(
            QueryBuilder::<CacheEntry>::new()
                .where_eq("cache_type", "similarity")
        ).await?;
        
        let duplicate_group_entries = self.db.count(
            QueryBuilder::<CacheEntry>::new()
                .where_eq("cache_type", "duplicate_groups")
        ).await?;
        
        let cache_stats = self.cache.get_cache_statistics().await;
        
        Ok(CachePersistenceStats {
            total_persisted_entries: total_entries as usize,
            similarity_entries: similarity_entries as usize,
            duplicate_group_entries: duplicate_group_entries as usize,
            cache_hit_rate: cache_stats.similarity_cache_hit_rate,
            memory_cache_stats: cache_stats,
        })
    }
}

/// Statistics about cache persistence
#[derive(Debug, Clone)]
pub struct CachePersistenceStats {
    pub total_persisted_entries: usize,
    pub similarity_entries: usize,
    pub duplicate_group_entries: usize,
    pub cache_hit_rate: f64,
    pub memory_cache_stats: CacheStatistics,
}