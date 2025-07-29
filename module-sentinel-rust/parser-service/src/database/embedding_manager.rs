// Embedding generation and management
use anyhow::Result;
use serde_json;
use std::sync::Arc;
use tracing::{info, debug};

use crate::parsers::tree_sitter::{CodeEmbedder, Language as ParserLanguage};
use crate::database::models::UniversalSymbol;

/// Manages embedding generation and storage for symbols
pub struct EmbeddingManager {
    embedder: Arc<CodeEmbedder>,
    model_name: String,
    version: i32,
}

impl EmbeddingManager {
    pub async fn new(language: &ParserLanguage) -> Result<Self> {
        // Use cached CodeEmbedder - no need to load multiple times
        let embedder = Arc::new(CodeEmbedder::load(language).await?);
        
        // Determine model name based on feature flags
        let model_name = if cfg!(feature = "ml") {
            "code_similarity".to_string() // Match the actual model name used in cache
        } else {
            "mock-embedder".to_string()
        };
        
        Ok(Self {
            embedder,
            model_name,
            version: 1,
        })
    }
    
    /// Generate embedding for a UniversalSymbol
    pub async fn generate_embedding(&self, symbol: &UniversalSymbol) -> Result<Vec<f32>> {
        // Build rich context for embedding
        let context = self.build_symbol_context(symbol);
        
        // Generate embedding using the full context
        let signature = symbol.signature.as_deref().unwrap_or("");
        self.embedder.embed(&context, signature).await
    }
    
    /// Enrich a symbol with embedding data
    pub async fn enrich_symbol_with_embedding(&self, symbol: &mut UniversalSymbol) -> Result<()> {
        // Skip if already has embedding from same model/version
        if let (Some(model), Some(version)) = (&symbol.embedding_model, &symbol.embedding_version) {
            if model == &self.model_name && version == &self.version {
                debug!("Symbol {} already has up-to-date embedding", symbol.name);
                return Ok(());
            }
        }
        
        // Generate embedding
        let embedding = self.generate_embedding(symbol).await?;
        
        // Store as JSON array
        symbol.embedding = Some(serde_json::to_string(&embedding)?);
        symbol.embedding_model = Some(self.model_name.clone());
        symbol.embedding_version = Some(self.version);
        
        Ok(())
    }
    
    /// Batch generate embeddings for multiple symbols
    pub async fn enrich_symbols_batch(&self, symbols: &mut [UniversalSymbol]) -> Result<()> {
        info!("Generating embeddings for {} symbols", symbols.len());
        
        let mut generated = 0;
        let mut skipped = 0;
        
        for symbol in symbols.iter_mut() {
            // Check if needs embedding
            if symbol.embedding.is_none() || 
               symbol.embedding_model.as_ref() != Some(&self.model_name) ||
               symbol.embedding_version != Some(self.version) {
                
                match self.enrich_symbol_with_embedding(symbol).await {
                    Ok(_) => generated += 1,
                    Err(e) => {
                        debug!("Failed to generate embedding for {}: {}", symbol.name, e);
                    }
                }
            } else {
                skipped += 1;
            }
        }
        
        info!("Embedding generation complete: {} generated, {} skipped", generated, skipped);
        Ok(())
    }
    
    /// Parse embedding from JSON string
    pub fn parse_embedding(embedding_json: &str) -> Result<Vec<f32>> {
        Ok(serde_json::from_str(embedding_json)?)
    }
    
    /// Calculate cosine similarity between two embeddings
    pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() || a.is_empty() {
            return 0.0;
        }
        
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if norm_a == 0.0 || norm_b == 0.0 {
            0.0
        } else {
            dot_product / (norm_a * norm_b)
        }
    }
    
    // Private helper methods
    
    fn build_symbol_context(&self, symbol: &UniversalSymbol) -> String {
        let mut context_parts = Vec::new();
        
        // Symbol name and kind
        context_parts.push(format!("{} {}", symbol.kind, symbol.name));
        
        // Qualified name provides namespace context
        if symbol.qualified_name != symbol.name {
            context_parts.push(symbol.qualified_name.clone());
        }
        
        // File context
        let file_name = symbol.file_path.split('/').last().unwrap_or(&symbol.file_path);
        context_parts.push(format!("in {}", file_name));
        
        // Return type is crucial for understanding function purpose
        if let Some(return_type) = &symbol.return_type {
            context_parts.push(format!("returns {}", return_type));
        }
        
        // Signature provides parameter information
        if let Some(signature) = &symbol.signature {
            context_parts.push(signature.clone());
        }
        
        // Semantic tags add rich context
        if let Some(tags_json) = &symbol.semantic_tags {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(tags_json) {
                context_parts.push(tags.join(" "));
            }
        }
        
        // Intent adds high-level understanding
        if let Some(intent) = &symbol.intent {
            context_parts.push(intent.clone());
        }
        
        // Modifiers
        let mut modifiers = Vec::new();
        if symbol.is_async { modifiers.push("async"); }
        if symbol.is_exported { modifiers.push("exported"); }
        if symbol.is_abstract { modifiers.push("abstract"); }
        if !modifiers.is_empty() {
            context_parts.push(modifiers.join(" "));
        }
        
        context_parts.join(" ")
    }
}