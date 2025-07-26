use anyhow::{Result, anyhow};
use std::path::Path;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};
use tokio::fs;
use tree_sitter::{Parser, Tree, Node};

use crate::database::{
    project_database::ProjectDatabase,
    models::{Project, Language, UniversalSymbol, FileIndex},
};
use crate::parsers::tree_sitter::{Symbol, Language as ParserLanguage};

/// Configuration for the parsing service
#[derive(Debug, Clone)]
pub struct ParsingConfig {
    pub max_file_size_mb: u64,
    pub timeout_seconds: u64,
    pub enable_semantic_analysis: bool,
    pub parallel_parsing: bool,
}

impl Default for ParsingConfig {
    fn default() -> Self {
        Self {
            max_file_size_mb: 10,
            timeout_seconds: 30,
            enable_semantic_analysis: false,
            parallel_parsing: true,
        }
    }
}

/// Result of parsing a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileParseResult {
    pub file_path: String,
    pub symbols: Vec<UniversalSymbol>,
    pub relationships: Vec<crate::database::models::UniversalRelationship>,
    pub success: bool,
    pub errors: Vec<String>,
    pub parse_duration_ms: u64,
    pub language: String,
}

/// Result of parsing an entire project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedProject {
    pub project_id: i32,
    pub project_name: String,
    pub total_files: i32,
    pub total_symbols: i32,
    pub total_relationships: i32,
    pub success: bool,
    pub errors: Vec<String>,
    pub parse_duration_ms: u64,
    pub files_processed: Vec<String>,
}

/// Represents a file that has changed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFile {
    pub file_path: String,
    pub change_type: ChangeType,
    pub last_modified: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChangeType {
    Modified,
    Added,
    Deleted,
}

/// Main parsing service that bridges parsers with database persistence
pub struct ParsingService {
    project_db: ProjectDatabase,
    config: ParsingConfig,
    // TODO: Add parser registry once we integrate actual parsers
    // parsers: HashMap<ParserLanguage, Box<dyn LanguageParser>>,
}

impl ParsingService {
    /// Create a new parsing service
    pub async fn new(project_db: ProjectDatabase, config: ParsingConfig) -> Result<Self> {
        Ok(Self {
            project_db,
            config,
        })
    }
    
    /// Check if the service is properly initialized
    pub fn is_initialized(&self) -> bool {
        // For now, always return true since we have the required components
        true
    }
    
    /// Parse a single file and return the results
    pub async fn parse_file(&self, file_path: &Path) -> Result<FileParseResult> {
        let start_time = Instant::now();
        
        // Check if file exists
        if !file_path.exists() {
            return Err(anyhow!("File does not exist: {}", file_path.display()));
        }
        
        // Check file size
        let metadata = fs::metadata(file_path).await?;
        let file_size_mb = metadata.len() / (1024 * 1024);
        if file_size_mb > self.config.max_file_size_mb {
            return Err(anyhow!("File too large: {} MB > {} MB", file_size_mb, self.config.max_file_size_mb));
        }
        
        // Read file content
        let content = fs::read_to_string(file_path).await?;
        
        // Determine language from file extension
        let language = self.detect_language(file_path)?;
        
        // Parse with tree-sitter
        let symbols = self.parse_symbols_with_treesitter(&content, file_path, &language)?;
        
        let parse_duration = start_time.elapsed().as_millis() as u64;
        
        // Check for basic syntax errors (simplified)
        let errors = self.detect_basic_errors(&content);
        let success = errors.is_empty();
        
        Ok(FileParseResult {
            file_path: file_path.to_string_lossy().to_string(),
            symbols,
            relationships: Vec::new(), // TODO: Extract relationships
            success,
            errors,
            parse_duration_ms: parse_duration,
            language: language.to_string(),
        })
    }
    
    /// Parse an entire project from scratch
    pub async fn parse_project(&self, project_path: &Path, project_name: &str) -> Result<ParsedProject> {
        let start_time = Instant::now();
        
        // Create or get project in database
        let project = self.project_db.get_or_create_project(
            project_name, 
            project_path.to_string_lossy().as_ref()
        ).await?;
        
        let project_id = project.id.unwrap();
        
        // Find all source files
        let source_files = self.find_source_files(project_path).await?;
        
        let mut total_symbols = 0;
        let mut total_relationships = 0;
        let mut errors = Vec::new();
        let mut files_processed = Vec::new();
        
        // Parse each file
        for file_path in &source_files {
            match self.parse_file(file_path).await {
                Ok(result) => {
                    if result.success {
                        // Store symbols in database
                        let language = self.get_or_create_language(&result.language).await?;
                        let stored_symbols = self.project_db.store_symbols(
                            project_id,
                            language.id.unwrap(),
                            &self.convert_to_parser_symbols(&result.symbols)
                        ).await?;
                        
                        total_symbols += result.symbols.len() as i32;
                        total_relationships += result.relationships.len() as i32;
                        
                        // Update file index - use the full absolute path
                        let absolute_file_path = file_path.canonicalize().unwrap_or(file_path.clone());
                        let file_metadata = fs::metadata(&file_path).await?;
                        let file_hash = Self::calculate_file_hash(&file_path).await?;
                        
                        self.project_db.update_file_index(
                            project_id,
                            language.id.unwrap(),
                            &absolute_file_path.to_string_lossy(),
                            result.symbols.len() as i32,
                            result.relationships.len() as i32,
                            Some(result.parse_duration_ms as i32),
                            None,
                            file_metadata.len() as i64,
                            &file_hash
                        ).await?;
                    } else {
                        errors.extend(result.errors);
                    }
                    files_processed.push(file_path.to_string_lossy().to_string());
                }
                Err(e) => {
                    errors.push(format!("Failed to parse {}: {}", file_path.display(), e));
                }
            }
        }
        
        let parse_duration = start_time.elapsed().as_millis() as u64;
        
        Ok(ParsedProject {
            project_id,
            project_name: project_name.to_string(),
            total_files: source_files.len() as i32,
            total_symbols,
            total_relationships,
            success: errors.is_empty(),
            errors,
            parse_duration_ms: parse_duration,
            files_processed,
        })
    }
    
    /// Parse a project incrementally (only changed files)
    pub async fn parse_project_incremental(&self, project_path: &Path, project_id: i32) -> Result<ParsedProject> {
        let start_time = Instant::now();
        
        // Detect changed files
        let changed_files = self.detect_file_changes(project_path, project_id).await?;
        
        let mut total_symbols = 0;
        let mut total_relationships = 0;
        let mut errors = Vec::new();
        let mut files_processed = Vec::new();
        
        // Parse only changed files
        for changed_file in &changed_files {
            let file_path = Path::new(&changed_file.file_path);
            
            match changed_file.change_type {
                ChangeType::Deleted => {
                    // TODO: Remove symbols from database for deleted files
                    files_processed.push(changed_file.file_path.clone());
                }
                ChangeType::Modified | ChangeType::Added => {
                    match self.parse_file(file_path).await {
                        Ok(result) => {
                            if result.success {
                                let language = self.get_or_create_language(&result.language).await?;
                                let _stored_symbols = self.project_db.store_symbols(
                                    project_id,
                                    language.id.unwrap(),
                                    &self.convert_to_parser_symbols(&result.symbols)
                                ).await?;
                                
                                total_symbols += result.symbols.len() as i32;
                                total_relationships += result.relationships.len() as i32;
                                
                                let absolute_file_path = Path::new(&changed_file.file_path).canonicalize()
                                    .unwrap_or_else(|_| Path::new(&changed_file.file_path).to_path_buf());
                                let file_metadata = fs::metadata(&absolute_file_path).await?;
                                let file_hash = Self::calculate_file_hash(&absolute_file_path).await?;
                                
                                self.project_db.update_file_index(
                                    project_id,
                                    language.id.unwrap(),
                                    &absolute_file_path.to_string_lossy(),
                                    result.symbols.len() as i32,
                                    result.relationships.len() as i32,
                                    Some(result.parse_duration_ms as i32),
                                    None,
                                    file_metadata.len() as i64,
                                    &file_hash
                                ).await?;
                            } else {
                                errors.extend(result.errors);
                            }
                            files_processed.push(changed_file.file_path.clone());
                        }
                        Err(e) => {
                            errors.push(format!("Failed to parse {}: {}", changed_file.file_path, e));
                        }
                    }
                }
            }
        }
        
        let parse_duration = start_time.elapsed().as_millis() as u64;
        
        // Get project name (TODO: cache this)
        let project_name = format!("project_{}", project_id); // Simplified for now
        
        Ok(ParsedProject {
            project_id,
            project_name,
            total_files: changed_files.len() as i32,
            total_symbols,
            total_relationships,
            success: errors.is_empty(),
            errors,
            parse_duration_ms: parse_duration,
            files_processed,
        })
    }
    
    /// Get all symbols for a project
    pub async fn get_project_symbols(&self, project_id: i32) -> Result<Vec<UniversalSymbol>> {
        // Use the ORM to get all symbols for the project
        use crate::database::orm::QueryBuilder;
        let query = QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id);
        self.project_db.db().find_all(query).await
    }
    
    /// Detect file changes since last parse
    pub async fn detect_file_changes(&self, project_path: &Path, project_id: i32) -> Result<Vec<ChangedFile>> {
        let mut changed_files = Vec::new();
        
        // Get all indexed files for this project
        use crate::database::orm::QueryBuilder;
        use crate::database::models::FileIndex;
        let indexed_files = self.project_db.db().find_all(
            QueryBuilder::<FileIndex>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        // Create a map of indexed files for quick lookup
        let mut indexed_map = std::collections::HashMap::new();
        for file_index in indexed_files {
            indexed_map.insert(file_index.file_path.clone(), file_index);
        }
        
        // Find current source files
        let current_files = self.find_source_files(project_path).await?;
        
        // Check each current file against the index
        for file_path in current_files {
            // Normalize the path to absolute for consistent comparison
            let absolute_path = file_path.canonicalize().unwrap_or(file_path.clone());
            let file_path_str = absolute_path.to_string_lossy().to_string();
            let metadata = fs::metadata(&file_path).await?;
            let modified_time = metadata.modified()?;
            
            if let Some(file_index) = indexed_map.get(&file_path_str) {
                // File exists in index - check if it was modified by comparing hash
                let current_hash = Self::calculate_file_hash(&file_path).await?;
                
                if let Some(stored_hash) = &file_index.file_hash {
                    if &current_hash != stored_hash {
                        // File hash changed - file was modified
                        changed_files.push(ChangedFile {
                            file_path: file_path_str.clone(),
                            change_type: ChangeType::Modified,
                            last_modified: modified_time,
                        });
                    }
                } else {
                    // No hash stored - consider it modified
                    changed_files.push(ChangedFile {
                        file_path: file_path_str.clone(),
                        change_type: ChangeType::Modified,
                        last_modified: modified_time,
                    });
                }
                indexed_map.remove(&file_path_str);
            } else {
                // File not in index - it's new
                changed_files.push(ChangedFile {
                    file_path: file_path_str,
                    change_type: ChangeType::Added,
                    last_modified: modified_time,
                });
            }
        }
        
        // Any files left in indexed_map were deleted
        for (file_path, _) in indexed_map {
            changed_files.push(ChangedFile {
                file_path,
                change_type: ChangeType::Deleted,
                last_modified: SystemTime::now(), // Use current time for deleted files
            });
        }
        
        Ok(changed_files)
    }
    
    // Helper methods
    
    /// Calculate SHA256 hash of file contents
    async fn calculate_file_hash(file_path: &Path) -> Result<String> {
        use sha2::{Sha256, Digest};
        
        let content = fs::read(file_path).await?;
        let mut hasher = Sha256::new();
        hasher.update(&content);
        let result = hasher.finalize();
        Ok(format!("{:x}", result))
    }
    
    fn detect_language(&self, file_path: &Path) -> Result<ParserLanguage> {
        let extension = file_path.extension()
            .and_then(|ext| ext.to_str())
            .ok_or_else(|| anyhow!("Cannot determine file extension"))?;
            
        match extension {
            "rs" => Ok(ParserLanguage::Rust),
            "py" => Ok(ParserLanguage::Python),
            "ts" | "tsx" => Ok(ParserLanguage::TypeScript),
            "js" | "jsx" => Ok(ParserLanguage::JavaScript),
            "cpp" | "cc" | "cxx" | "hpp" | "h" => Ok(ParserLanguage::Cpp),
            _ => Err(anyhow!("Unsupported file extension: {}", extension))
        }
    }
    
    async fn find_source_files(&self, project_path: &Path) -> Result<Vec<std::path::PathBuf>> {
        let mut source_files = Vec::new();
        let supported_extensions = ["rs", "py", "ts", "tsx", "js", "jsx", "cpp", "cc", "cxx", "hpp", "h"];
        
        fn visit_dir(dir: &Path, extensions: &[&str], files: &mut Vec<std::path::PathBuf>) -> Result<()> {
            if dir.is_dir() {
                for entry in std::fs::read_dir(dir)? {
                    let entry = entry?;
                    let path = entry.path();
                    if path.is_dir() {
                        visit_dir(&path, extensions, files)?;
                    } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if extensions.contains(&ext) {
                            files.push(path);
                        }
                    }
                }
            }
            Ok(())
        }
        
        visit_dir(project_path, &supported_extensions, &mut source_files)?;
        Ok(source_files)
    }
    
    async fn get_or_create_language(&self, language_name: &str) -> Result<Language> {
        let parser_class = format!("{}Parser", language_name);
        let extensions = match language_name {
            "Rust" => vec![".rs"],
            "Python" => vec![".py"],
            "TypeScript" => vec![".ts", ".tsx"],
            "JavaScript" => vec![".js", ".jsx"],
            "Cpp" => vec![".cpp", ".cc", ".cxx", ".hpp", ".h"],
            _ => vec![],
        };
        
        self.project_db.get_or_create_language(
            language_name,
            &parser_class,
            &extensions.iter().map(|s| *s).collect::<Vec<_>>()
        ).await
    }
    
    // Mock symbol parsing - TODO: Replace with actual parser integration
    fn mock_parse_symbols(&self, content: &str, file_path: &Path, language: &ParserLanguage) -> Result<Vec<UniversalSymbol>> {
        let mut symbols = Vec::new();
        let lines: Vec<&str> = content.lines().collect();
        
        match language {
            ParserLanguage::Rust => {
                for (line_num, line) in lines.iter().enumerate() {
                    let line = line.trim();
                    
                    // Find functions
                    if line.starts_with("fn ") {
                        if let Some(name_end) = line.find('(') {
                            let name = line[3..name_end].trim();
                            symbols.push(UniversalSymbol {
                                name: name.to_string(),
                                qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                                kind: "function".to_string(),
                                file_path: file_path.to_string_lossy().to_string(),
                                line: line_num as i32 + 1,
                                column: 0,
                                signature: Some(line.to_string()),
                                ..Default::default()
                            });
                        }
                    }
                    
                    // Find structs
                    if line.starts_with("struct ") {
                        if let Some(name_end) = line[7..].find(' ').map(|i| i + 7).or_else(|| line.find('{')) {
                            let name = line[7..name_end].trim();
                            symbols.push(UniversalSymbol {
                                name: name.to_string(),
                                qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                                kind: "struct".to_string(),
                                file_path: file_path.to_string_lossy().to_string(),
                                line: line_num as i32 + 1,
                                column: 0,
                                signature: Some(line.to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }
            }
            ParserLanguage::Python => {
                for (line_num, line) in lines.iter().enumerate() {
                    let line = line.trim();
                    
                    // Find functions
                    if line.starts_with("def ") {
                        if let Some(name_end) = line.find('(') {
                            let name = line[4..name_end].trim();
                            symbols.push(UniversalSymbol {
                                name: name.to_string(),
                                qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                                kind: "function".to_string(),
                                file_path: file_path.to_string_lossy().to_string(),
                                line: line_num as i32 + 1,
                                column: 0,
                                signature: Some(line.to_string()),
                                ..Default::default()
                            });
                        }
                    }
                    
                    // Find classes
                    if line.starts_with("class ") {
                        if let Some(name_end) = line[6..].find(':').map(|i| i + 6).or_else(|| line[6..].find('(').map(|i| i + 6)) {
                            let name = line[6..name_end].trim();
                            symbols.push(UniversalSymbol {
                                name: name.to_string(),
                                qualified_name: format!("{}::{}", file_path.file_stem().unwrap().to_string_lossy(), name),
                                kind: "class".to_string(),
                                file_path: file_path.to_string_lossy().to_string(),
                                line: line_num as i32 + 1,
                                column: 0,
                                signature: Some(line.to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }
            }
            _ => {
                // For other languages, just return empty for now
            }
        }
        
        Ok(symbols)
    }
    
    fn detect_basic_errors(&self, content: &str) -> Vec<String> {
        let mut errors = Vec::new();
        
        // Very basic syntax error detection
        let open_braces = content.matches('{').count();
        let close_braces = content.matches('}').count();
        if open_braces != close_braces {
            errors.push(format!("Mismatched braces: {} open, {} close", open_braces, close_braces));
        }
        
        let open_parens = content.matches('(').count();
        let close_parens = content.matches(')').count();
        if open_parens != close_parens {
            errors.push(format!("Mismatched parentheses: {} open, {} close", open_parens, close_parens));
        }
        
        errors
    }
    
    fn convert_to_parser_symbols(&self, universal_symbols: &[UniversalSymbol]) -> Vec<Symbol> {
        universal_symbols.iter().map(|us| Symbol {
            id: us.qualified_name.clone(),
            name: us.name.clone(),
            signature: us.signature.clone().unwrap_or_default(),
            language: ParserLanguage::Rust, // TODO: Map from universal symbol
            file_path: us.file_path.clone(),
            start_line: us.line as u32,
            end_line: us.end_line.unwrap_or(us.line) as u32,
            embedding: None,
            semantic_hash: None,
            normalized_name: us.name.to_lowercase(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(us.confidence as f32),
            similar_symbols: Vec::new(),
        }).collect()
    }
}