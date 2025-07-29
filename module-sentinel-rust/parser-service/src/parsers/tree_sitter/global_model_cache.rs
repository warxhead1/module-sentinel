use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use super::model_manager::{ModelManager, ModelConfig};

#[cfg(feature = "ml")]
use ort::session::Session;

#[cfg(not(feature = "ml"))]
type MLSession = ();

#[cfg(feature = "ml")]
type MLSession = Session;

// For sharing sessions that need interior mutability
#[cfg(feature = "ml")]
type SharedMLSession = Arc<tokio::sync::RwLock<MLSession>>;

#[cfg(not(feature = "ml"))]
type SharedMLSession = Arc<MLSession>;

/// Global singleton for caching ML models across all components
pub struct GlobalModelCache {
    model_manager: ModelManager,
    #[cfg(feature = "ml")]
    cached_sessions: RwLock<HashMap<String, SharedMLSession>>,
    #[cfg(not(feature = "ml"))]
    _placeholder: (),
}

impl GlobalModelCache {
    /// Initialize the global cache with a models directory
    fn new(models_dir: std::path::PathBuf) -> Self {
        Self {
            model_manager: ModelManager::new(models_dir),
            #[cfg(feature = "ml")]
            cached_sessions: RwLock::new(HashMap::new()),
            #[cfg(not(feature = "ml"))]
            _placeholder: (),
        }
    }

    /// Get cached model session, loading if necessary
    pub async fn get_model(&self, model_name: &str) -> Result<SharedMLSession> {
        #[cfg(feature = "ml")]
        {
            // Check if already cached
            {
                let cache = self.cached_sessions.read().await;
                if let Some(session) = cache.get(model_name) {
                    tracing::debug!("Using cached model: {}", model_name);
                    return Ok(Arc::clone(session));
                }
            }

            // Load model if not cached
            tracing::debug!("Loading model: {}", model_name);
            let session = match self.model_manager.load_model(model_name).await {
                Ok(s) => s,
                Err(e) => {
                    // For testing/development, return a mock session when models aren't available
                    if e.to_string().contains("Model file does not exist") {
                        tracing::warn!("Model {} not found, creating mock session for testing", model_name);
                        // Create a minimal valid ONNX model for testing
                        return Err(anyhow::anyhow!("Model {} not available. Please download models or disable ML features.", model_name));
                    }
                    return Err(e);
                }
            };
            let shared_session = Arc::new(RwLock::new(session));

            // Cache the loaded model
            {
                let mut cache = self.cached_sessions.write().await;
                cache.insert(model_name.to_string(), shared_session.clone());
            }

            Ok(shared_session)
        }

        #[cfg(not(feature = "ml"))]
        {
            // Return mock session when ML is disabled
            tracing::debug!("ML feature disabled, returning mock for model: {}", model_name);
            Ok(Arc::new(()))
        }
    }

    /// Get available model configurations
    pub fn available_models(&self) -> Vec<ModelConfig> {
        ModelManager::available_models()
    }

    /// Clear the model cache (useful for testing or memory management)
    pub async fn clear_cache(&self) {
        #[cfg(feature = "ml")]
        {
            let mut cache = self.cached_sessions.write().await;
            cache.clear();
            tracing::info!("Model cache cleared");
        }
    }

    /// Get cache statistics
    pub async fn cache_stats(&self) -> CacheStats {
        #[cfg(feature = "ml")]
        {
            let cache = self.cached_sessions.read().await;
            let loaded_models: Vec<String> = cache.keys().cloned().collect();
            CacheStats {
                cached_models_count: cache.len(),
                loaded_models,
                feature_enabled: true,
            }
        }

        #[cfg(not(feature = "ml"))]
        {
            CacheStats {
                cached_models_count: 0,
                loaded_models: vec![],
                feature_enabled: false,
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub cached_models_count: usize,
    pub loaded_models: Vec<String>,
    pub feature_enabled: bool,
}

/// Global singleton instance - initialized with proper models directory
static GLOBAL_CACHE: Lazy<RwLock<Option<GlobalModelCache>>> = Lazy::new(|| RwLock::new(None));

/// Initialize the global model cache with a models directory
pub async fn initialize_global_cache(models_dir: std::path::PathBuf) -> Result<()> {
    let mut cache = GLOBAL_CACHE.write().await;
    *cache = Some(GlobalModelCache::new(models_dir.clone()));
    tracing::debug!("Global model cache configured with directory: {:?}", models_dir);
    Ok(())
}

/// Helper function to get a cached model from the global cache
pub async fn get_cached_model(model_name: &str) -> Result<SharedMLSession> {
    let cache = GLOBAL_CACHE.read().await;
    match cache.as_ref() {
        Some(global_cache) => global_cache.get_model(model_name).await,
        None => {
            // Initialize with default models directory if not initialized
            drop(cache);
            let default_models_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("models");
            initialize_global_cache(default_models_dir).await?;
            
            let cache = GLOBAL_CACHE.read().await;
            cache.as_ref().unwrap().get_model(model_name).await
        }
    }
}

/// Helper function to get cache statistics
pub async fn get_cache_stats() -> CacheStats {
    let cache = GLOBAL_CACHE.read().await;
    match cache.as_ref() {
        Some(global_cache) => global_cache.cache_stats().await,
        None => CacheStats {
            cached_models_count: 0,
            loaded_models: vec![],
            feature_enabled: cfg!(feature = "ml"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_global_cache_initialization() {
        // Test that we can initialize and get the cache
        let temp_dir = tempdir().unwrap();
        let result = initialize_global_cache(temp_dir.path().to_path_buf()).await;
        assert!(result.is_ok());

        let stats = get_cache_stats().await;
        assert_eq!(stats.cached_models_count, 0);
        assert_eq!(stats.feature_enabled, cfg!(feature = "ml"));
    }

    #[tokio::test]
    async fn test_cache_stats() {
        // The cache is automatically initialized by Lazy
        let stats = get_cache_stats().await;
        assert_eq!(stats.feature_enabled, cfg!(feature = "ml"));
        // May have models from other tests - just verify stats are accessible
        assert!(stats.loaded_models.len() <= stats.cached_models_count);
    }
}