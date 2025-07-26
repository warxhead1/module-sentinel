use anyhow::{Result, anyhow};
use std::sync::Arc;
use std::path::Path;
use std::collections::HashMap;
use tokio::sync::RwLock;

use crate::database::{
    orm::{Database, QueryBuilder},
    models::{Project, Language, UniversalSymbol, UniversalRelationship, FileIndex},
    cache::{CachedSemanticDeduplicator, CacheConfig},
    bloom_filter::{SymbolBloomFilter, SymbolKey},
    cache_persistence::{CachePersistenceManager, CachePersistenceStats},
};
use crate::parsers::tree_sitter::{CodeEmbedder, Symbol, Language as ParserLanguage};

/// The main project database that combines ORM with your advanced caching
pub struct ProjectDatabase {
    db: Database,
    symbol_cache: Arc<CachedSemanticDeduplicator>,
    bloom_filter: Arc<RwLock<SymbolBloomFilter>>,
    cache_persistence: Option<Arc<CachePersistenceManager>>,
}

impl ProjectDatabase {
    /// Create a new project database with integrated caching
    pub async fn new(project_path: &Path) -> Result<Self> {
        let db_path = project_path.join("project.db");
        let db = Database::new(db_path.to_str().unwrap()).await?;
        
        // Use the ORM models to create the schema - they are the source of truth!
        Self::create_schema(&db).await?;
        
        // Initialize your advanced caching system
        #[cfg(feature = "ml")]
        let embedder = Arc::new(CodeEmbedder::load(&ParserLanguage::Rust).await?);
        #[cfg(not(feature = "ml"))]
        let embedder = Arc::new(CodeEmbedder::mock_for_testing(&ParserLanguage::Rust).await?);
        
        let symbol_cache = Arc::new(CachedSemanticDeduplicator::new(
            embedder,
            CacheConfig {
                max_similarity_cache_size: 50000,
                max_symbol_cache_size: 25000,
                ttl_seconds: 3600, // 1 hour
            }
        ).await?);
        
        // Initialize bloom filter for fast duplicate detection
        let bloom_filter = SymbolBloomFilter::new(100000, 0.01)?; // 100K symbols, 1% false positive
        
        // Initialize cache persistence
        let cache_persistence = match CachePersistenceManager::new(
            db.clone(),
            Arc::clone(&symbol_cache),
            300, // Persist every 5 minutes
        ).await {
            Ok(manager) => {
                println!("Cache persistence manager initialized successfully");
                Some(Arc::new(manager))
            }
            Err(e) => {
                eprintln!("Failed to initialize cache persistence: {}", e);
                None
            }
        };
        
        // Start persistence task if enabled
        if let Some(ref persistence) = cache_persistence {
            Arc::clone(persistence).start_persistence_task().await;
            
            // Load cache from database on startup
            if let Err(e) = persistence.load_cache_from_db().await {
                eprintln!("Failed to load cache from database: {}", e);
            }
        }
        
        Ok(Self {
            db,
            symbol_cache,
            bloom_filter: Arc::new(RwLock::new(bloom_filter)),
            cache_persistence,
        })
    }
    
    /// Get a reference to the database for direct ORM operations
    pub fn db(&self) -> &Database {
        &self.db
    }
    
    /// Create database schema based on ORM models - models are the source of truth!
    async fn create_schema(db: &Database) -> Result<()> {
        // Create projects table based on the Project model
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                display_name TEXT,
                description TEXT,
                root_path TEXT NOT NULL,
                config_path TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                is_active INTEGER NOT NULL DEFAULT 1,
                metadata TEXT
            )
        "#.to_string()).await?;
        
        // Create languages table based on the Language model
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS languages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                version TEXT,
                parser_class TEXT NOT NULL,
                extensions TEXT NOT NULL,
                features TEXT,
                is_enabled INTEGER NOT NULL DEFAULT 1,
                priority INTEGER NOT NULL DEFAULT 100
            )
        "#.to_string()).await?;
        
        // Create universal_symbols table based on the UniversalSymbol model
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS universal_symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                language_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                qualified_name TEXT NOT NULL,
                kind TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line INTEGER NOT NULL,
                column INTEGER NOT NULL DEFAULT 0,
                end_line INTEGER,
                end_column INTEGER,
                return_type TEXT,
                signature TEXT,
                visibility TEXT,
                namespace TEXT,
                parent_symbol_id INTEGER,
                is_exported INTEGER NOT NULL DEFAULT 0,
                is_async INTEGER NOT NULL DEFAULT 0,
                is_abstract INTEGER NOT NULL DEFAULT 0,
                language_features TEXT,
                semantic_tags TEXT,
                confidence REAL NOT NULL DEFAULT 1.0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (language_id) REFERENCES languages(id),
                FOREIGN KEY (parent_symbol_id) REFERENCES universal_symbols(id)
            )
        "#.to_string()).await?;
        
        // Create universal_relationships table based on the UniversalRelationship model
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS universal_relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                from_symbol_id INTEGER,
                to_symbol_id INTEGER,
                relationship_type TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 1.0,
                context_line INTEGER,
                context_column INTEGER,
                context_snippet TEXT,
                metadata TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (from_symbol_id) REFERENCES universal_symbols(id),
                FOREIGN KEY (to_symbol_id) REFERENCES universal_symbols(id)
            )
        "#.to_string()).await?;
        
        // Create file_index table based on the FileIndex model
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS file_index (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                language_id INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                file_size INTEGER,
                file_hash TEXT,
                last_parsed TEXT,
                parse_duration INTEGER,
                parser_version TEXT,
                symbol_count INTEGER NOT NULL DEFAULT 0,
                relationship_count INTEGER NOT NULL DEFAULT 0,
                pattern_count INTEGER NOT NULL DEFAULT 0,
                is_indexed INTEGER NOT NULL DEFAULT 0,
                has_errors INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (language_id) REFERENCES languages(id)
            )
        "#.to_string()).await?;
        
        Ok(())
    }
    
    /// Get or create a project
    pub async fn get_or_create_project(&self, name: &str, root_path: &str) -> Result<Project> {
        // Try to find existing project
        let existing = self.db.find_all(
            QueryBuilder::<Project>::new()
                .where_eq("name", name)
                .limit(1)
        ).await?;
        
        if let Some(project) = existing.first() {
            return Ok(project.clone());
        }
        
        // Create new project
        let mut project = Project {
            name: name.to_string(),
            display_name: Some(name.to_string()),
            root_path: root_path.to_string(),
            ..Default::default()
        };
        
        project = self.db.insert(project).await?;
        Ok(project)
    }
    
    /// Get or create a language
    pub async fn get_or_create_language(&self, name: &str, parser_class: &str, extensions: &[&str]) -> Result<Language> {
        // Try to find existing language
        let existing = self.db.find_all(
            QueryBuilder::<Language>::new()
                .where_eq("name", name)
                .limit(1)
        ).await?;
        
        if let Some(language) = existing.first() {
            return Ok(language.clone());
        }
        
        // Create new language
        let mut language = Language {
            name: name.to_string(),
            display_name: name.to_string(),
            parser_class: parser_class.to_string(),
            extensions: serde_json::to_string(extensions)?,
            ..Default::default()
        };
        
        language = self.db.insert(language).await?;
        Ok(language)
    }
    
    /// Store symbols with bloom filter optimization and caching
    pub async fn store_symbols(&self, project_id: i32, language_id: i32, symbols: &[Symbol]) -> Result<Vec<UniversalSymbol>> {
        let mut stored_symbols = Vec::new();
        let mut new_symbols = Vec::new();
        
        // Convert parser symbols to universal symbols
        for symbol in symbols {
            let mut universal_symbol = UniversalSymbol {
                project_id,
                language_id,
                name: symbol.name.clone(),
                qualified_name: symbol.id.clone(), // Use symbol ID for qualified name for now
                kind: "function".to_string(), // TODO: Map from symbol type
                file_path: symbol.file_path.clone(),
                line: symbol.start_line as i32,
                column: 0,
                end_line: Some(symbol.end_line as i32),
                signature: Some(symbol.signature.clone()),
                ..Default::default()
            };
            
            // Check bloom filter for potential duplicates
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            
            let mut hasher = DefaultHasher::new();
            universal_symbol.qualified_name.hash(&mut hasher);
            let name_hash = hasher.finish();
            
            let mut hasher = DefaultHasher::new();
            universal_symbol.signature.as_deref().unwrap_or("").hash(&mut hasher);
            let signature_hash = hasher.finish();
            
            let mut hasher = DefaultHasher::new();
            format!("{}:{}", universal_symbol.file_path, universal_symbol.line).hash(&mut hasher);
            let context_hash = hasher.finish();
            
            let combined_hash = name_hash ^ signature_hash ^ context_hash;
            
            let symbol_key = SymbolKey {
                name_hash,
                signature_hash,
                context_hash,
                combined_hash,
            };
            
            if !self.bloom_filter.write().await.might_contain(&symbol_key) {
                // Definitely new - add to bloom filter and insert
                self.bloom_filter.write().await.insert(&symbol_key);
                new_symbols.push(universal_symbol);
            } else {
                // Might be duplicate - check database
                let existing = self.db.find_all(
                    QueryBuilder::<UniversalSymbol>::new()
                        .where_eq("project_id", project_id)
                        .where_eq("qualified_name", universal_symbol.qualified_name.clone())
                        .where_eq("file_path", universal_symbol.file_path.clone())
                        .where_eq("line", universal_symbol.line)
                        .limit(1)
                ).await?;
                
                if existing.is_empty() {
                    // False positive - actually new
                    new_symbols.push(universal_symbol);
                } else {
                    // True duplicate - skip
                    stored_symbols.push(existing[0].clone());
                }
            }
        }
        
        // Batch insert new symbols
        for symbol in new_symbols {
            let inserted = self.db.insert(symbol).await?;
            stored_symbols.push(inserted);
        }
        
        // Update cache with all symbols (for similarity calculations)
        for symbol in &stored_symbols {
            // Convert universal symbol back to parser symbol for cache
            let cache_symbol = Symbol {
                id: symbol.qualified_name.clone(),
                name: symbol.name.clone(),
                signature: symbol.signature.clone().unwrap_or_default(),
                language: ParserLanguage::Rust, // TODO: Map from language_id
                file_path: symbol.file_path.clone(),
                start_line: symbol.line as u32,
                end_line: symbol.end_line.unwrap_or(symbol.line) as u32,
                embedding: None,
                semantic_hash: None,
                normalized_name: symbol.name.to_lowercase(),
                context_embedding: None,
                duplicate_of: None,
                confidence_score: Some(symbol.confidence as f32),
                similar_symbols: vec![],
            };
            
            // This will use your advanced LRU/Hierarchical/Predictive caching
            let _ = self.symbol_cache.similarity_score(&cache_symbol, &cache_symbol).await;
            
            // Persist high-value similarity scores if cache persistence is enabled
            if let Some(ref persistence) = self.cache_persistence {
                // For now, just persist self-similarity (1.0) as a baseline
                let _ = persistence.store_similarity_score(
                    &cache_symbol.id,
                    &cache_symbol.id,
                    1.0
                ).await;
            }
        }
        
        Ok(stored_symbols)
    }

    /// Store a single UniversalSymbol directly
    pub async fn store_universal_symbol(&self, symbol: &UniversalSymbol) -> Result<UniversalSymbol> {
        // Insert the symbol directly
        let inserted = self.db.insert(symbol.clone()).await?;
        Ok(inserted)
    }
    
    /// Store a single UniversalRelationship directly
    pub async fn store_universal_relationship(&self, relationship: &UniversalRelationship) -> Result<UniversalRelationship> {
        // Insert the relationship directly
        let inserted = self.db.insert(relationship.clone()).await?;
        Ok(inserted)
    }
    
    /// Find duplicates across the entire project using your advanced deduplication
    pub async fn find_duplicates_across_project(&self, project_id: i32) -> Result<Vec<crate::database::DuplicateGroup>> {
        // Check cache first if persistence is enabled
        if let Some(ref persistence) = self.cache_persistence {
            if let Ok(Some(cached_groups)) = persistence.get_duplicate_groups(project_id).await {
                return Ok(cached_groups);
            }
        }
        
        // Load all symbols for the project
        let universal_symbols = self.db.find_all(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        // Convert to parser symbols for your advanced deduplication
        let parser_symbols: Vec<Symbol> = universal_symbols.iter().map(|s| Symbol {
            id: s.qualified_name.clone(),
            name: s.name.clone(),
            signature: s.signature.clone().unwrap_or_default(),
            language: ParserLanguage::Rust, // TODO: Map from language_id
            file_path: s.file_path.clone(),
            start_line: s.line as u32,
            end_line: s.end_line.unwrap_or(s.line) as u32,
            embedding: None,
            semantic_hash: None,
            normalized_name: s.name.to_lowercase(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(s.confidence as f32),
            similar_symbols: vec![],
        }).collect();
        
        // Use your advanced semantic deduplication system!
        let duplicate_groups = self.symbol_cache.find_duplicates(&parser_symbols).await?;
        
        // Cache the results if persistence is enabled
        if let Some(ref persistence) = self.cache_persistence {
            let _ = persistence.store_duplicate_groups(project_id, &duplicate_groups).await;
        }
        
        Ok(duplicate_groups)
    }
    
    /// Store relationships between symbols
    pub async fn store_relationships(&self, project_id: i32, relationships: &[(i32, i32, &str)]) -> Result<Vec<UniversalRelationship>> {
        let mut stored_relationships = Vec::new();
        
        for (from_id, to_id, rel_type) in relationships {
            let relationship = UniversalRelationship {
                project_id,
                from_symbol_id: Some(*from_id),
                to_symbol_id: Some(*to_id),
                relationship_type: rel_type.to_string(),
                ..Default::default()
            };
            
            let inserted = self.db.insert(relationship).await?;
            stored_relationships.push(inserted);
        }
        
        Ok(stored_relationships)
    }
    
    /// Update file index after parsing
    pub async fn update_file_index(&self, project_id: i32, language_id: i32, file_path: &str, 
                                   symbol_count: i32, relationship_count: i32, 
                                   parse_duration_ms: Option<i32>, error: Option<&str>,
                                   file_size: i64, file_hash: &str) -> Result<FileIndex> {
        // Try to find existing file index
        let existing = self.db.find_all(
            QueryBuilder::<FileIndex>::new()
                .where_eq("project_id", project_id)
                .where_eq("file_path", file_path)
                .limit(1)
        ).await?;
        
        if let Some(mut file_index) = existing.first().cloned() {
            // Update existing
            file_index.symbol_count = symbol_count;
            file_index.relationship_count = relationship_count;
            file_index.parse_duration = parse_duration_ms;
            file_index.has_errors = error.is_some();
            file_index.error_message = error.map(|e| e.to_string());
            file_index.is_indexed = error.is_none();
            file_index.file_size = Some(file_size);
            file_index.file_hash = Some(file_hash.to_string());
            // Set last_parsed to current time
            file_index.last_parsed = Some(chrono::Utc::now().to_rfc3339());
            file_index.updated_at = chrono::Utc::now().to_rfc3339();
            
            self.db.update(&file_index).await?;
            Ok(file_index)
        } else {
            // Create new
            let file_index = FileIndex {
                project_id,
                language_id,
                file_path: file_path.to_string(),
                file_size: Some(file_size),
                file_hash: Some(file_hash.to_string()),
                symbol_count,
                relationship_count,
                parse_duration: parse_duration_ms,
                has_errors: error.is_some(),
                error_message: error.map(|e| e.to_string()),
                is_indexed: error.is_none(),
                last_parsed: Some(chrono::Utc::now().to_rfc3339()),
                ..Default::default()
            };
            
            let inserted = self.db.insert(file_index).await?;
            Ok(inserted)
        }
    }
    
    /// Get symbols by project and file
    pub async fn get_symbols_in_file(&self, project_id: i32, file_path: &str) -> Result<Vec<UniversalSymbol>> {
        self.db.find_all(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
                .where_eq("file_path", file_path)
                .order_by("line", false)
        ).await
    }
    
    /// Get relationships for a symbol
    pub async fn get_symbol_relationships(&self, symbol_id: i32) -> Result<Vec<UniversalRelationship>> {
        let outgoing = self.db.find_all(
            QueryBuilder::<UniversalRelationship>::new()
                .where_eq("from_symbol_id", symbol_id)
        ).await?;
        
        let incoming = self.db.find_all(
            QueryBuilder::<UniversalRelationship>::new()
                .where_eq("to_symbol_id", symbol_id)
        ).await?;
        
        let mut all_relationships = outgoing;
        all_relationships.extend(incoming);
        Ok(all_relationships)
    }

    /// Get all relationships for a project
    pub async fn get_all_relationships(&self, project_id: i32) -> Result<Vec<UniversalRelationship>> {
        self.db.find_all(
            QueryBuilder::<UniversalRelationship>::new()
                .where_eq("project_id", project_id)
        ).await
    }

    /// Get symbol count for a project
    pub async fn get_symbol_count(&self, project_id: i32) -> Result<usize> {
        let count = self.db.count(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        Ok(count as usize)
    }

    /// Simple symbol search by name pattern
    pub async fn search_symbols_simple(&self, query: &str, project_id: i32, limit: usize) -> Result<Vec<UniversalSymbol>> {
        let mut query_builder = QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id)
            .limit(limit as i64);
        
        // If query is not empty, add name filter
        if !query.is_empty() {
            // For now, use a simple contains search
            // In a real implementation, we'd use SQLite's LIKE or FTS
            let symbols = self.db.find_all(query_builder).await?;
            
            // Filter in memory for now (not ideal for large datasets)
            let filtered: Vec<UniversalSymbol> = symbols.into_iter()
                .filter(|s| s.name.to_lowercase().contains(&query.to_lowercase()) ||
                           s.qualified_name.to_lowercase().contains(&query.to_lowercase()))
                .take(limit)
                .collect();
            
            Ok(filtered)
        } else {
            // Return all symbols up to limit
            self.db.find_all(query_builder).await
        }
    }
    
    /// Get project statistics
    pub async fn get_project_stats(&self, project_id: i32) -> Result<ProjectStats> {
        let symbol_count = self.db.count(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        let relationship_count = self.db.count(
            QueryBuilder::<UniversalRelationship>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        let file_count = self.db.count(
            QueryBuilder::<FileIndex>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        let indexed_files = self.db.count(
            QueryBuilder::<FileIndex>::new()
                .where_eq("project_id", project_id)
                .where_eq("is_indexed", true)
        ).await?;
        
        let cache_stats = self.symbol_cache.get_cache_statistics().await;
        
        Ok(ProjectStats {
            symbol_count: symbol_count as i32,
            relationship_count: relationship_count as i32,
            file_count: file_count as i32,
            indexed_files: indexed_files as i32,
            cache_hit_rate: cache_stats.similarity_cache_hit_rate,
            bloom_filter_efficiency: cache_stats.bloom_filter_efficiency,
        })
    }
    
    /// Clean up expired cache entries
    pub async fn cleanup_caches(&self) -> Result<()> {
        let expired_count = self.symbol_cache.cleanup_expired().await;
        println!("Cleaned up {} expired cache entries", expired_count);
        Ok(())
    }
    
    /// Get cache persistence statistics
    pub async fn get_cache_persistence_stats(&self) -> Result<Option<CachePersistenceStats>> {
        if let Some(ref persistence) = self.cache_persistence {
            Ok(Some(persistence.get_persistence_stats().await?))
        } else {
            Ok(None)
        }
    }
}

/// Project statistics
#[derive(Debug, Clone)]
pub struct ProjectStats {
    pub symbol_count: i32,
    pub relationship_count: i32,
    pub file_count: i32,
    pub indexed_files: i32,
    pub cache_hit_rate: f64,
    pub bloom_filter_efficiency: f64,
}

// Simple example usage
impl ProjectDatabase {
    /// Example: Process a simple file
    pub async fn process_file_example(&self, project_name: &str, file_path: &str, symbols: &[Symbol]) -> Result<()> {
        // Get or create project
        let project = self.get_or_create_project(project_name, "/path/to/project").await?;
        
        // Get or create language
        let language = self.get_or_create_language("rust", "RustParser", &[".rs"]).await?;
        
        // Store symbols with advanced caching and bloom filter optimization
        let stored_symbols = self.store_symbols(
            project.id.unwrap(), 
            language.id.unwrap(), 
            symbols
        ).await?;
        
        // Update file index
        self.update_file_index(
            project.id.unwrap(),
            language.id.unwrap(),
            file_path,
            stored_symbols.len() as i32,
            0, // No relationships in this example
            Some(150), // 150ms parse time
            None, // No errors
            0, // File size - would be calculated in real usage
            "example_hash" // File hash - would be calculated in real usage
        ).await?;
        
        // Find duplicates using your advanced semantic analysis
        let duplicates = self.find_duplicates_across_project(project.id.unwrap()).await?;
        
        println!("Processed {} symbols, found {} duplicate groups", 
                 stored_symbols.len(), duplicates.len());
        
        Ok(())
    }
}