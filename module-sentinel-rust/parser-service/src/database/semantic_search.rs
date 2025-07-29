// Semantic search using embeddings
use anyhow::Result;
use std::sync::Arc;
use tracing::{info, debug};

use crate::database::{
    models::UniversalSymbol,
    orm::{Database, QueryBuilder},
    embedding_manager::EmbeddingManager,
};

/// Result of a semantic search
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub symbol: UniversalSymbol,
    pub similarity: f32,
    pub match_reason: String,
}

/// Semantic search engine using embeddings
pub struct SemanticSearchEngine {
    db: Arc<Database>,
    embedding_manager: Arc<EmbeddingManager>,
}

impl SemanticSearchEngine {
    pub fn new(db: Arc<Database>, embedding_manager: Arc<EmbeddingManager>) -> Self {
        Self {
            db,
            embedding_manager,
        }
    }
    
    /// Search for symbols semantically similar to the query
    pub async fn search(
        &self,
        query: &str,
        project_id: i32,
        limit: usize,
        threshold: f32,
    ) -> Result<Vec<SearchResult>> {
        info!("Semantic search for '{}' in project {}", query, project_id);
        
        // Generate query embedding
        let query_symbol = UniversalSymbol {
            name: query.to_string(),
            qualified_name: query.to_string(),
            kind: "query".to_string(),
            ..Default::default()
        };
        
        let query_embedding = self.embedding_manager.generate_embedding(&query_symbol).await?;
        
        // Get all symbols with embeddings for the project
        let symbols = self.get_symbols_with_embeddings(project_id).await?;
        
        // Calculate similarities
        let mut results = Vec::new();
        
        for symbol in symbols {
            if let Some(embedding_json) = &symbol.embedding {
                match EmbeddingManager::parse_embedding(embedding_json) {
                    Ok(symbol_embedding) => {
                        let similarity = EmbeddingManager::cosine_similarity(
                            &query_embedding,
                            &symbol_embedding
                        );
                        
                        if similarity >= threshold {
                            results.push(SearchResult {
                                symbol: symbol.clone(),
                                similarity,
                                match_reason: self.explain_match(&query_symbol, &symbol, similarity),
                            });
                        }
                    }
                    Err(e) => {
                        debug!("Failed to parse embedding for {}: {}", symbol.name, e);
                    }
                }
            }
        }
        
        // Sort by similarity descending
        results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
        
        // Limit results
        results.truncate(limit);
        
        info!("Found {} semantic matches", results.len());
        Ok(results)
    }
    
    /// Search for symbols similar to a given symbol
    pub async fn find_similar_symbols(
        &self,
        symbol: &UniversalSymbol,
        project_id: i32,
        limit: usize,
        threshold: f32,
    ) -> Result<Vec<SearchResult>> {
        // Generate or use existing embedding
        let query_embedding = if let Some(embedding_json) = &symbol.embedding {
            EmbeddingManager::parse_embedding(embedding_json)?
        } else {
            self.embedding_manager.generate_embedding(symbol).await?
        };
        
        // Get all symbols with embeddings
        let symbols = self.get_symbols_with_embeddings(project_id).await?;
        
        let mut results = Vec::new();
        
        for other_symbol in symbols {
            // Skip self
            if other_symbol.id == symbol.id {
                continue;
            }
            
            if let Some(embedding_json) = &other_symbol.embedding {
                match EmbeddingManager::parse_embedding(embedding_json) {
                    Ok(other_embedding) => {
                        let similarity = EmbeddingManager::cosine_similarity(
                            &query_embedding,
                            &other_embedding
                        );
                        
                        if similarity >= threshold {
                            results.push(SearchResult {
                                symbol: other_symbol.clone(),
                                similarity,
                                match_reason: self.explain_match(symbol, &other_symbol, similarity),
                            });
                        }
                    }
                    Err(e) => {
                        debug!("Failed to parse embedding for {}: {}", other_symbol.name, e);
                    }
                }
            }
        }
        
        // Sort by similarity
        results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        
        Ok(results)
    }
    
    /// Find potential component reuse opportunities
    pub async fn find_reusable_components(
        &self,
        intent: &str,
        project_id: i32,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        // Search with a lower threshold for broader matches
        let results = self.search(intent, project_id, limit * 2, 0.6).await?;
        
        // Filter to components (classes, modules, exported functions)
        let components: Vec<SearchResult> = results.into_iter()
            .filter(|r| {
                let kind = &r.symbol.kind;
                kind == "class" || kind == "module" || kind == "interface" ||
                (kind == "function" && r.symbol.is_exported)
            })
            .take(limit)
            .collect();
        
        Ok(components)
    }
    
    // Helper methods
    
    async fn get_symbols_with_embeddings(&self, project_id: i32) -> Result<Vec<UniversalSymbol>> {
        self.db.find_all(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
                .where_not_null("embedding")
        ).await
    }
    
    fn explain_match(&self, query: &UniversalSymbol, result: &UniversalSymbol, similarity: f32) -> String {
        let mut reasons = Vec::new();
        
        if similarity > 0.95 {
            reasons.push("Nearly identical functionality".to_string());
        } else if similarity > 0.85 {
            reasons.push("Very similar implementation".to_string());
        } else if similarity > 0.75 {
            reasons.push("Similar purpose and structure".to_string());
        } else {
            reasons.push("Related functionality".to_string());
        }
        
        // Check semantic tags overlap
        if let (Some(query_tags), Some(result_tags)) = (&query.semantic_tags, &result.semantic_tags) {
            if let (Ok(qtags), Ok(rtags)) = (
                serde_json::from_str::<Vec<String>>(query_tags),
                serde_json::from_str::<Vec<String>>(result_tags)
            ) {
                let common_tags: Vec<_> = qtags.iter()
                    .filter(|t| rtags.contains(t))
                    .collect();
                
                if !common_tags.is_empty() {
                    let tags_str = common_tags.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ");
                    reasons.push(format!("Common tags: {}", tags_str));
                }
            }
        }
        
        // Check if same kind
        if query.kind == result.kind {
            reasons.push(format!("Both are {}s", query.kind));
        }
        
        reasons.join(". ")
    }
}