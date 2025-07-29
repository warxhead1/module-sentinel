use anyhow::Result;
use std::sync::Arc;
use std::path::Path;
use tokio::sync::RwLock;
use tracing;

use crate::database::{
    orm::{Database, QueryBuilder},
    models::{Project, Language, UniversalSymbol, UniversalRelationship, FileIndex},
    cache::{CachedSemanticDeduplicator, CacheConfig},
    bloom_filter::{SymbolBloomFilter, SymbolKey},
    cache_persistence::{CachePersistenceManager, CachePersistenceStats},
    embedding_manager::EmbeddingManager,
    semantic_search::{SemanticSearchEngine, SearchResult},
};
use crate::parsers::tree_sitter::{CodeEmbedder, Symbol, Language as ParserLanguage};
use crate::analysis;

/// The main project database that combines ORM with your advanced caching
pub struct ProjectDatabase {
    db: Database,
    symbol_cache: Option<Arc<CachedSemanticDeduplicator>>,
    bloom_filter: Arc<RwLock<SymbolBloomFilter>>,
    cache_persistence: Option<Arc<CachePersistenceManager>>,
    embedding_manager: Option<Arc<EmbeddingManager>>,
    semantic_search: Option<Arc<SemanticSearchEngine>>,
}

impl ProjectDatabase {
    /// Map from language_id to ParserLanguage
    pub async fn map_language_id_to_parser_language(&self, language_id: i32) -> Result<ParserLanguage> {
        let languages = self.db.find_all(
            QueryBuilder::<Language>::new()
                .where_eq("id", language_id)
                .limit(1)
        ).await?;
        
        if let Some(language) = languages.first() {
            match language.name.as_str() {
                "rust" => Ok(ParserLanguage::Rust),
                "typescript" => Ok(ParserLanguage::TypeScript),
                "javascript" => Ok(ParserLanguage::JavaScript),
                "python" => Ok(ParserLanguage::Python),
                "cpp" | "c++" => Ok(ParserLanguage::Cpp),
                "java" => Ok(ParserLanguage::Java),
                "go" => Ok(ParserLanguage::Go),
                "c_sharp" | "csharp" => Ok(ParserLanguage::CSharp),
                _ => Ok(ParserLanguage::Rust), // Default fallback
            }
        } else {
            Ok(ParserLanguage::Rust) // Default fallback
        }
    }

    /// Map from Symbol to appropriate kind string
    fn map_symbol_to_kind(symbol: &Symbol) -> String {
        // Simple heuristic based on signature patterns
        let signature = &symbol.signature;
        let name = &symbol.name;
        
        if signature.contains("fn ") || signature.contains("function ") || signature.contains("def ") {
            "function".to_string()
        } else if signature.contains("class ") || signature.contains("struct ") {
            "class".to_string()
        } else if signature.contains("enum ") {
            "enum".to_string()
        } else if signature.contains("interface ") {
            "interface".to_string()
        } else if signature.contains("trait ") {
            "trait".to_string()
        } else if signature.contains("const ") || signature.contains("let ") || signature.contains("var ") {
            "variable".to_string()
        } else if name.chars().all(|c| c.is_uppercase() || c == '_') {
            "constant".to_string()
        } else {
            "symbol".to_string() // Generic fallback
        }
    }

    /// Create a new project database with integrated caching
    pub async fn new(project_path: &Path) -> Result<Self> {
        let db_path = project_path.join("project.db");
        let db = Database::new(db_path.to_str().unwrap()).await?;
        
        // Use the ORM models to create the schema - they are the source of truth!
        Self::create_schema(&db).await?;
        
        // Initialize your advanced caching system using cached embedder
        // Only initialize embedder if ML features are available
        let symbol_cache = match CodeEmbedder::load(&ParserLanguage::Rust).await {
            Ok(embedder) => {
                match CachedSemanticDeduplicator::new(
                    Arc::new(embedder),
                    CacheConfig {
                        max_similarity_cache_size: 50000,
                        max_symbol_cache_size: 25000,
                        ttl_seconds: 3600, // 1 hour
                    }
                ).await {
                    Ok(cache) => Some(Arc::new(cache)),
                    Err(e) => {
                        tracing::warn!("Failed to create semantic deduplicator: {}. Caching disabled.", e);
                        None
                    }
                }
            },
            Err(e) => {
                tracing::warn!("Failed to load embedder: {}. Semantic caching will be disabled.", e);
                None
            }
        };
        
        // Initialize bloom filter for fast duplicate detection
        let bloom_filter = SymbolBloomFilter::new(100000, 0.01)?; // 100K symbols, 1% false positive
        
        // Initialize cache persistence only if we have a symbol cache
        let cache_persistence = if let Some(ref cache) = symbol_cache {
            match CachePersistenceManager::new(
                db.clone(),
                Arc::clone(cache),
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
            }
        } else {
            None
        };
        
        // Start persistence task if enabled
        if let Some(ref persistence) = cache_persistence {
            Arc::clone(persistence).start_persistence_task().await;
            
            // Load cache from database on startup
            if let Err(e) = persistence.load_cache_from_db().await {
                eprintln!("Failed to load cache from database: {}", e);
            }
        }
        
        // Initialize embedding manager (default to Rust for now)
        let embedding_manager = match EmbeddingManager::new(&ParserLanguage::Rust).await {
            Ok(manager) => {
                println!("Embedding manager initialized successfully");
                Some(Arc::new(manager))
            }
            Err(e) => {
                eprintln!("Failed to initialize embedding manager: {}", e);
                None
            }
        };
        
        // Initialize semantic search if embedding manager is available
        let semantic_search = embedding_manager.as_ref().map(|em| {
            Arc::new(SemanticSearchEngine::new(Arc::new(db.clone()), Arc::clone(em)))
        });
        
        Ok(Self {
            db,
            symbol_cache,
            bloom_filter: Arc::new(RwLock::new(bloom_filter)),
            cache_persistence,
            embedding_manager,
            semantic_search,
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
                intent TEXT,
                confidence REAL NOT NULL DEFAULT 1.0,
                embedding TEXT,
                embedding_model TEXT,
                embedding_version INTEGER,
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
        
        // Create user_fixes table for ML training data
        db.migrate(r#"
            CREATE TABLE IF NOT EXISTS user_fixes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_message TEXT NOT NULL,
                error_line INTEGER NOT NULL,
                error_column INTEGER NOT NULL,
                applied_fix TEXT NOT NULL,
                language TEXT NOT NULL,
                file_path TEXT,
                project_id INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id)
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
            tracing::info!("Found existing project '{}' with ID {:?}", name, project.id);
            return Ok(project.clone());
        }
        
        // Create new project
        let mut project = Project {
            name: name.to_string(),
            display_name: Some(name.to_string()),
            root_path: root_path.to_string(),
            ..Default::default()
        };
        
        tracing::info!("Creating new project '{}'", name);
        project = self.db.insert(project).await?;
        
        if project.id.is_none() {
            return Err(anyhow::anyhow!("Failed to get ID for newly created project '{}'", name));
        }
        
        tracing::info!("Successfully created project '{}' with ID {:?}", name, project.id);
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
                kind: Self::map_symbol_to_kind(symbol),
                file_path: symbol.file_path.clone(),
                line: symbol.start_line as i32,
                column: 0,
                end_line: Some(symbol.end_line as i32),
                signature: Some(symbol.signature.clone()),
                ..Default::default()
            };
            
            // Extract semantic tags and intent using our AI-enhanced analysis
            analysis::enrich_symbol_with_semantics(&mut universal_symbol);
            
            // Generate embedding if manager is available
            if let Some(ref embedding_manager) = self.embedding_manager {
                if let Err(e) = embedding_manager.enrich_symbol_with_embedding(&mut universal_symbol).await {
                    tracing::debug!("Failed to generate embedding for {}: {}", universal_symbol.name, e);
                }
            }
            
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
            let language = self.map_language_id_to_parser_language(symbol.language_id).await.unwrap_or(ParserLanguage::Rust);
            
            // Parse semantic tags from JSON if available
            let semantic_tags: Option<Vec<String>> = symbol.semantic_tags.as_ref()
                .and_then(|tags_json| serde_json::from_str(tags_json).ok());
            
            let cache_symbol = Symbol {
                id: symbol.qualified_name.clone(),
                name: symbol.name.clone(),
                signature: symbol.signature.clone().unwrap_or_default(),
                language,
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
                semantic_tags,
                intent: symbol.intent.clone(),
            };
            
            // This will use your advanced LRU/Hierarchical/Predictive caching
            if let Some(ref cache) = self.symbol_cache {
                let _ = cache.similarity_score(&cache_symbol, &cache_symbol).await;
            }
            
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
    
    /// Store symbols and relationships together in a transaction
    pub async fn store_parse_results(
        &self,
        project_id: i32,
        symbols: &[UniversalSymbol],
        relationships: &[UniversalRelationship],
    ) -> Result<(Vec<UniversalSymbol>, Vec<UniversalRelationship>)> {
        use std::collections::HashMap;
        
        tracing::debug!("store_parse_results called: project_id={}, symbols={}, relationships={}", 
            project_id, symbols.len(), relationships.len());
        
        // Clone the data to move into the closure
        let symbols_vec: Vec<UniversalSymbol> = symbols.to_vec();
        let relationships_vec: Vec<UniversalRelationship> = relationships.to_vec();
        
        self.db.transaction(move |tx| {
            let mut stored_symbols = Vec::new();
            let mut stored_relationships = Vec::new();
            
            // First, insert all symbols and collect their IDs
            let mut symbol_id_map = HashMap::new();
            
            for symbol in symbols_vec {
                let mut symbol_to_store = symbol.clone();
                symbol_to_store.project_id = project_id;
                
                // Try to insert - if it fails due to duplicate, we'll handle it
                tracing::trace!("Attempting to insert symbol: name='{}', file='{}', line={}", 
                    symbol_to_store.name, symbol_to_store.file_path, symbol_to_store.line);
                    
                match tx.insert(&symbol_to_store) {
                    Ok(inserted) => {
                        // Successfully inserted new symbol
                        tracing::trace!("Successfully inserted symbol '{}' with id={:?}", 
                            inserted.name, inserted.id);
                        if let Some(id) = inserted.id {
                            symbol_id_map.insert(symbol.qualified_name.clone(), id);
                        }
                        stored_symbols.push(inserted);
                    }
                    Err(e) => {
                        // Log the actual database error
                        tracing::error!("Failed to insert symbol '{}' from file '{}': {}", 
                            symbol.qualified_name, 
                            symbol.file_path,
                            e);
                        tracing::debug!("Symbol details: project_id={}, language_id={}, line={}", 
                            symbol.project_id,
                            symbol.language_id, 
                            symbol.line);
                        
                        // For now, continue without this symbol but log it
                        // TODO: Investigate why symbols are failing to insert
                    }
                }
            }
            
            // Now insert relationships with proper symbol IDs
            for relationship in relationships_vec {
                let mut rel_to_store = relationship.clone();
                rel_to_store.project_id = project_id;
                
                // Resolve placeholder IDs to actual database IDs
                // Placeholder IDs are negative numbers that correspond to symbol array indices
                if let Some(from_id) = rel_to_store.from_symbol_id {
                    if from_id < 0 {
                        // Convert negative placeholder to array index
                        let index = (-from_id - 1) as usize;
                        if let Some(stored_symbol) = stored_symbols.get(index) {
                            if let Some(actual_id) = stored_symbol.id {
                                rel_to_store.from_symbol_id = Some(actual_id);
                            }
                        }
                    }
                }
                
                if let Some(to_id) = rel_to_store.to_symbol_id {
                    if to_id < 0 {
                        // Convert negative placeholder to array index
                        let index = (-to_id - 1) as usize;
                        if let Some(stored_symbol) = stored_symbols.get(index) {
                            if let Some(actual_id) = stored_symbol.id {
                                rel_to_store.to_symbol_id = Some(actual_id);
                            }
                        }
                    }
                }
                
                // Only store relationships that have valid symbol IDs
                if rel_to_store.from_symbol_id.is_some() && rel_to_store.to_symbol_id.is_some() {
                    let inserted = tx.insert(&rel_to_store)?;
                    stored_relationships.push(inserted);
                }
            }
            
            Ok((stored_symbols, stored_relationships))
        }).await
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
        let mut parser_symbols = Vec::new();
        for s in &universal_symbols {
            let language = self.map_language_id_to_parser_language(s.language_id).await.unwrap_or(ParserLanguage::Rust);
            
            // Parse semantic tags and use intent from database
            let semantic_tags: Option<Vec<String>> = s.semantic_tags.as_ref()
                .and_then(|tags_json| serde_json::from_str(tags_json).ok());
            
            parser_symbols.push(Symbol {
                id: s.qualified_name.clone(),
                name: s.name.clone(),
                signature: s.signature.clone().unwrap_or_default(),
                language,
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
                semantic_tags,
                intent: s.intent.clone(),
            });
        }
        
        // Use your advanced semantic deduplication system!
        let duplicate_groups = if let Some(ref cache) = self.symbol_cache {
            cache.find_duplicates(&parser_symbols).await?
        } else {
            Vec::new()
        };
        
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
    
    /// Get file index for a specific file
    pub async fn get_file_index(&self, project_id: i32, file_path: &str) -> Result<Option<FileIndex>> {
        let results = self.db.find_all(
            QueryBuilder::<FileIndex>::new()
                .where_eq("project_id", project_id)
                .where_eq("file_path", file_path)
                .limit(1)
        ).await?;
        Ok(results.into_iter().next())
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
    
    /// Get language distribution for a project
    pub async fn get_language_distribution(&self, project_id: i32) -> Result<std::collections::HashMap<String, i32>> {
        use std::collections::HashMap;
        
        // Get all symbols for the project
        let symbols = self.db.find_all(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        // Count symbols by language_id
        let mut language_counts: HashMap<i32, i32> = HashMap::new();
        for symbol in symbols {
            *language_counts.entry(symbol.language_id).or_insert(0) += 1;
        }
        
        // Get language names for the IDs
        let mut distribution = HashMap::new();
        for (language_id, count) in language_counts {
            // Get language name
            let languages = self.db.find_all(
                QueryBuilder::<Language>::new()
                    .where_eq("id", language_id)
                    .limit(1)
            ).await?;
            
            if let Some(language) = languages.first() {
                distribution.insert(language.display_name.clone(), count);
            }
        }
        
        Ok(distribution)
    }

    /// Find symbol by exact qualified name (ID)
    pub async fn find_symbol_by_id(&self, symbol_id: &str, project_id: i32) -> Result<Option<UniversalSymbol>> {
        let symbols = self.db.find_all(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
                .where_eq("qualified_name", symbol_id)
                .limit(1)
        ).await?;
        
        Ok(symbols.into_iter().next())
    }
    
    /// Simple symbol search by name pattern
    pub async fn search_symbols_simple(&self, query: &str, project_id: i32, limit: usize) -> Result<Vec<UniversalSymbol>> {
        let query_builder = QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id)
            .limit(limit as i64);
        
        // If query is not empty and not a wildcard, add name filter
        if !query.is_empty() && query != "*" {
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
            // Return all symbols up to limit (empty query or wildcard "*")
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
        
        let cache_stats = if let Some(ref cache) = self.symbol_cache {
            cache.get_cache_statistics().await
        } else {
            // Return default stats when cache is disabled
            crate::database::cache::CacheStatistics::default()
        };
        
        Ok(ProjectStats {
            symbol_count: symbol_count as i32,
            relationship_count: relationship_count as i32,
            file_count: file_count as i32,
            indexed_files: indexed_files as i32,
            cache_hit_rate: cache_stats.similarity_cache_hit_rate,
            bloom_filter_efficiency: cache_stats.bloom_filter_efficiency,
        })
    }
    
    /// Search symbols semantically using embeddings
    pub async fn search_symbols_semantic(
        &self,
        query: &str,
        project_id: i32,
        limit: usize,
        threshold: Option<f32>,
    ) -> Result<Vec<SearchResult>> {
        if let Some(ref search_engine) = self.semantic_search {
            search_engine.search(query, project_id, limit, threshold.unwrap_or(0.7)).await
        } else {
            // Fallback to simple search
            tracing::warn!("Semantic search not available, falling back to simple search");
            let symbols = self.search_symbols_simple(query, project_id, limit).await?;
            Ok(symbols.into_iter().map(|s| SearchResult {
                symbol: s,
                similarity: 1.0,
                match_reason: "Name-based match".to_string(),
            }).collect())
        }
    }
    
    /// Find symbols similar to a given symbol
    pub async fn find_similar_symbols_semantic(
        &self,
        symbol: &UniversalSymbol,
        project_id: i32,
        limit: usize,
        threshold: Option<f32>,
    ) -> Result<Vec<SearchResult>> {
        if let Some(ref search_engine) = self.semantic_search {
            search_engine.find_similar_symbols(symbol, project_id, limit, threshold.unwrap_or(0.7)).await
        } else {
            // Fallback: find symbols with same name pattern
            let query = format!("{}%", &symbol.name[..symbol.name.len().min(5)]);
            let similar = self.db.find_all(
                QueryBuilder::<UniversalSymbol>::new()
                    .where_eq("project_id", project_id)
                    .where_like("name", query)
                    .limit(limit as i64)
            ).await?;
            
            Ok(similar.into_iter().map(|s| SearchResult {
                symbol: s,
                similarity: 0.8,
                match_reason: "Name pattern match".to_string(),
            }).collect())
        }
    }
    
    /// Find reusable components by intent
    pub async fn find_reusable_components(
        &self,
        intent: &str,
        project_id: i32,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        if let Some(ref search_engine) = self.semantic_search {
            search_engine.find_reusable_components(intent, project_id, limit).await
        } else {
            // Fallback: find exported functions and classes
            let components = self.db.find_all(
                QueryBuilder::<UniversalSymbol>::new()
                    .where_eq("project_id", project_id)
                    .where_eq("is_exported", 1)
                    .where_in("kind", vec!["function", "class", "interface"])
                    .limit(limit as i64)
            ).await?;
            
            Ok(components.into_iter().map(|s| SearchResult {
                symbol: s,
                similarity: 0.6,
                match_reason: "Exported component".to_string(),
            }).collect())
        }
    }
    
    /// Clean up expired cache entries
    pub async fn cleanup_caches(&self) -> Result<()> {
        let expired_count = if let Some(ref cache) = self.symbol_cache {
            cache.cleanup_expired().await
        } else {
            0
        };
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
    
    /// Clear all symbols and relationships for a project (used for force reindex)
    pub async fn clear_project_symbols(&self, project_id: i32) -> Result<()> {
        use crate::database::orm::DatabaseValue;
        
        // First delete all relationships for this project
        self.db.execute(
            "DELETE FROM universal_relationships WHERE project_id = ?",
            vec![DatabaseValue::Integer(project_id as i64)]
        ).await?;
        
        // Then delete all symbols for this project
        self.db.execute(
            "DELETE FROM universal_symbols WHERE project_id = ?",
            vec![DatabaseValue::Integer(project_id as i64)]
        ).await?;
        
        // Finally delete file index entries to force re-parsing
        self.db.execute(
            "DELETE FROM file_index WHERE project_id = ?",
            vec![DatabaseValue::Integer(project_id as i64)]
        ).await?;
        
        Ok(())
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