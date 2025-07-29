use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use anyhow::Result;
use crate::database::orm::{Model, DatabaseValue};

/// Project model - represents a codebase being analyzed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: Option<i32>,
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub root_path: String,
    pub config_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_active: bool,
    pub metadata: Option<String>,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            display_name: None,
            description: None,
            root_path: String::new(),
            config_path: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            is_active: true,
            metadata: None,
        }
    }
}

impl Model for Project {
    fn table_name() -> &'static str { "projects" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "name", "display_name", "description", "root_path", "config_path", 
             "created_at", "updated_at", "is_active", "metadata"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("name".to_string(), self.name.clone().into());
        values.insert("display_name".to_string(), self.display_name.clone().into());
        values.insert("description".to_string(), self.description.clone().into());
        values.insert("root_path".to_string(), self.root_path.clone().into());
        values.insert("config_path".to_string(), self.config_path.clone().into());
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values.insert("updated_at".to_string(), self.updated_at.clone().into());
        values.insert("is_active".to_string(), DatabaseValue::Integer(if self.is_active { 1 } else { 0 }));
        values.insert("metadata".to_string(), self.metadata.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            name: match values.get("name") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            display_name: match values.get("display_name") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            description: match values.get("description") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            root_path: match values.get("root_path") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            config_path: match values.get("config_path") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            updated_at: match values.get("updated_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            is_active: match values.get("is_active") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => true,
            },
            metadata: match values.get("metadata") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
        })
    }
}

/// Language model - represents programming languages supported
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Language {
    pub id: Option<i32>,
    pub name: String,
    pub display_name: String,
    pub version: Option<String>,
    pub parser_class: String,
    pub extensions: String, // JSON array of file extensions
    pub features: Option<String>, // JSON object of language features
    pub is_enabled: bool,
    pub priority: i32,
}

impl Default for Language {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            display_name: String::new(),
            version: None,
            parser_class: String::new(),
            extensions: "[]".to_string(),
            features: None,
            is_enabled: true,
            priority: 100,
        }
    }
}

impl Model for Language {
    fn table_name() -> &'static str { "languages" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "name", "display_name", "version", "parser_class", "extensions", "features", "is_enabled", "priority"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("name".to_string(), self.name.clone().into());
        values.insert("display_name".to_string(), self.display_name.clone().into());
        values.insert("version".to_string(), self.version.clone().into());
        values.insert("parser_class".to_string(), self.parser_class.clone().into());
        values.insert("extensions".to_string(), self.extensions.clone().into());
        values.insert("features".to_string(), self.features.clone().into());
        values.insert("is_enabled".to_string(), DatabaseValue::Integer(if self.is_enabled { 1 } else { 0 }));
        values.insert("priority".to_string(), DatabaseValue::Integer(self.priority as i64));
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            name: match values.get("name") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            display_name: match values.get("display_name") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            version: match values.get("version") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            parser_class: match values.get("parser_class") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            extensions: match values.get("extensions") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => "[]".to_string(),
            },
            features: match values.get("features") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            is_enabled: match values.get("is_enabled") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => true,
            },
            priority: match values.get("priority") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 100,
            },
        })
    }
}

/// Universal symbol - the heart of our code analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversalSymbol {
    pub id: Option<i32>,
    pub project_id: i32,
    pub language_id: i32,
    pub name: String,
    pub qualified_name: String,
    pub kind: String, // function, class, variable, etc.
    pub file_path: String,
    pub line: i32,
    pub column: i32,
    pub end_line: Option<i32>,
    pub end_column: Option<i32>,
    pub return_type: Option<String>,
    pub signature: Option<String>,
    pub visibility: Option<String>, // public, private, protected
    pub namespace: Option<String>,
    pub parent_symbol_id: Option<i32>,
    pub is_exported: bool,
    pub is_async: bool,
    pub is_abstract: bool,
    pub language_features: Option<String>, // JSON object of language-specific features
    pub semantic_tags: Option<String>, // JSON array of semantic tags
    pub intent: Option<String>, // Inferred intent/purpose of the symbol
    pub confidence: f64,
    pub embedding: Option<String>, // JSON array of f32 values (768-dim vector)
    pub embedding_model: Option<String>, // Model used: "codebert-base" or "feature-v1"
    pub embedding_version: Option<i32>, // Version for future migrations
    pub created_at: String,
    pub updated_at: String,
}

impl Default for UniversalSymbol {
    fn default() -> Self {
        Self {
            id: None,
            project_id: 0,
            language_id: 0,
            name: String::new(),
            qualified_name: String::new(),
            kind: String::new(),
            file_path: String::new(),
            line: 0,
            column: 0,
            end_line: None,
            end_column: None,
            return_type: None,
            signature: None,
            visibility: None,
            namespace: None,
            parent_symbol_id: None,
            is_exported: false,
            is_async: false,
            is_abstract: false,
            language_features: None,
            semantic_tags: None,
            intent: None,
            confidence: 1.0,
            embedding: None,
            embedding_model: None,
            embedding_version: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for UniversalSymbol {
    fn table_name() -> &'static str { "universal_symbols" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "project_id", "language_id", "name", "qualified_name", "kind", "file_path", 
             "line", "column", "end_line", "end_column", "return_type", "signature", "visibility", 
             "namespace", "parent_symbol_id", "is_exported", "is_async", "is_abstract", 
             "language_features", "semantic_tags", "intent", "confidence", "embedding", 
             "embedding_model", "embedding_version", "created_at", "updated_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("language_id".to_string(), DatabaseValue::Integer(self.language_id as i64));
        values.insert("name".to_string(), self.name.clone().into());
        values.insert("qualified_name".to_string(), self.qualified_name.clone().into());
        values.insert("kind".to_string(), self.kind.clone().into());
        values.insert("file_path".to_string(), self.file_path.clone().into());
        values.insert("line".to_string(), DatabaseValue::Integer(self.line as i64));
        values.insert("column".to_string(), DatabaseValue::Integer(self.column as i64));
        values.insert("end_line".to_string(), self.end_line.map(|l| l as i64).into());
        values.insert("end_column".to_string(), self.end_column.map(|c| c as i64).into());
        values.insert("return_type".to_string(), self.return_type.clone().into());
        values.insert("signature".to_string(), self.signature.clone().into());
        values.insert("visibility".to_string(), self.visibility.clone().into());
        values.insert("namespace".to_string(), self.namespace.clone().into());
        values.insert("parent_symbol_id".to_string(), self.parent_symbol_id.map(|id| id as i64).into());
        values.insert("is_exported".to_string(), DatabaseValue::Integer(if self.is_exported { 1 } else { 0 }));
        values.insert("is_async".to_string(), DatabaseValue::Integer(if self.is_async { 1 } else { 0 }));
        values.insert("is_abstract".to_string(), DatabaseValue::Integer(if self.is_abstract { 1 } else { 0 }));
        values.insert("language_features".to_string(), self.language_features.clone().into());
        values.insert("semantic_tags".to_string(), self.semantic_tags.clone().into());
        values.insert("intent".to_string(), self.intent.clone().into());
        values.insert("confidence".to_string(), DatabaseValue::Real(self.confidence));
        values.insert("embedding".to_string(), self.embedding.clone().into());
        values.insert("embedding_model".to_string(), self.embedding_model.clone().into());
        values.insert("embedding_version".to_string(), self.embedding_version.map(|v| v as i64).into());
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values.insert("updated_at".to_string(), self.updated_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            language_id: match values.get("language_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            name: match values.get("name") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            qualified_name: match values.get("qualified_name") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            kind: match values.get("kind") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            file_path: match values.get("file_path") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            line: match values.get("line") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            column: match values.get("column") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            end_line: match values.get("end_line") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            end_column: match values.get("end_column") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            return_type: match values.get("return_type") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            signature: match values.get("signature") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            visibility: match values.get("visibility") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            namespace: match values.get("namespace") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            parent_symbol_id: match values.get("parent_symbol_id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            is_exported: match values.get("is_exported") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => false,
            },
            is_async: match values.get("is_async") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => false,
            },
            is_abstract: match values.get("is_abstract") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => false,
            },
            language_features: match values.get("language_features") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            semantic_tags: match values.get("semantic_tags") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            intent: match values.get("intent") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            confidence: match values.get("confidence") {
                Some(DatabaseValue::Real(r)) => *r,
                Some(DatabaseValue::Integer(i)) => *i as f64,
                _ => 1.0,
            },
            embedding: match values.get("embedding") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            embedding_model: match values.get("embedding_model") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            embedding_version: match values.get("embedding_version") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            updated_at: match values.get("updated_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}

/// Universal relationship - connections between symbols
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversalRelationship {
    pub id: Option<i32>,
    pub project_id: i32,
    pub from_symbol_id: Option<i32>,
    pub to_symbol_id: Option<i32>,
    pub relationship_type: String, // calls, extends, imports, uses, etc.
    pub confidence: f64,
    pub context_line: Option<i32>,
    pub context_column: Option<i32>,
    pub context_snippet: Option<String>,
    pub metadata: Option<String>, // JSON object for additional data
    pub created_at: String,
}

impl Default for UniversalRelationship {
    fn default() -> Self {
        Self {
            id: None,
            project_id: 0,
            from_symbol_id: None,
            to_symbol_id: None,
            relationship_type: String::new(),
            confidence: 1.0,
            context_line: None,
            context_column: None,
            context_snippet: None,
            metadata: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for UniversalRelationship {
    fn table_name() -> &'static str { "universal_relationships" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "project_id", "from_symbol_id", "to_symbol_id", "relationship_type", "confidence", 
             "context_line", "context_column", "context_snippet", "metadata", "created_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("from_symbol_id".to_string(), self.from_symbol_id.map(|id| id as i64).into());
        values.insert("to_symbol_id".to_string(), self.to_symbol_id.map(|id| id as i64).into());
        values.insert("relationship_type".to_string(), self.relationship_type.clone().into());
        values.insert("confidence".to_string(), DatabaseValue::Real(self.confidence));
        values.insert("context_line".to_string(), self.context_line.map(|l| l as i64).into());
        values.insert("context_column".to_string(), self.context_column.map(|c| c as i64).into());
        values.insert("context_snippet".to_string(), self.context_snippet.clone().into());
        values.insert("metadata".to_string(), self.metadata.clone().into());
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            from_symbol_id: match values.get("from_symbol_id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            to_symbol_id: match values.get("to_symbol_id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            relationship_type: match values.get("relationship_type") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            confidence: match values.get("confidence") {
                Some(DatabaseValue::Real(r)) => *r,
                Some(DatabaseValue::Integer(i)) => *i as f64,
                _ => 1.0,
            },
            context_line: match values.get("context_line") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            context_column: match values.get("context_column") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            context_snippet: match values.get("context_snippet") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            metadata: match values.get("metadata") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}

/// File index - tracks files and their parsing status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileIndex {
    pub id: Option<i32>,
    pub project_id: i32,
    pub language_id: i32,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub file_hash: Option<String>,
    pub last_parsed: Option<String>,
    pub parse_duration: Option<i32>, // milliseconds
    pub parser_version: Option<String>,
    pub symbol_count: i32,
    pub relationship_count: i32,
    pub pattern_count: i32,
    pub is_indexed: bool,
    pub has_errors: bool,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for FileIndex {
    fn default() -> Self {
        Self {
            id: None,
            project_id: 0,
            language_id: 0,
            file_path: String::new(),
            file_size: None,
            file_hash: None,
            last_parsed: None,
            parse_duration: None,
            parser_version: None,
            symbol_count: 0,
            relationship_count: 0,
            pattern_count: 0,
            is_indexed: false,
            has_errors: false,
            error_message: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for FileIndex {
    fn table_name() -> &'static str { "file_index" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "project_id", "language_id", "file_path", "file_size", "file_hash", 
             "last_parsed", "parse_duration", "parser_version", "symbol_count", 
             "relationship_count", "pattern_count", "is_indexed", "has_errors", 
             "error_message", "created_at", "updated_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("language_id".to_string(), DatabaseValue::Integer(self.language_id as i64));
        values.insert("file_path".to_string(), self.file_path.clone().into());
        values.insert("file_size".to_string(), self.file_size.into());
        values.insert("file_hash".to_string(), self.file_hash.clone().into());
        values.insert("last_parsed".to_string(), self.last_parsed.clone().into());
        values.insert("parse_duration".to_string(), self.parse_duration.map(|d| d as i64).into());
        values.insert("parser_version".to_string(), self.parser_version.clone().into());
        values.insert("symbol_count".to_string(), DatabaseValue::Integer(self.symbol_count as i64));
        values.insert("relationship_count".to_string(), DatabaseValue::Integer(self.relationship_count as i64));
        values.insert("pattern_count".to_string(), DatabaseValue::Integer(self.pattern_count as i64));
        values.insert("is_indexed".to_string(), DatabaseValue::Integer(if self.is_indexed { 1 } else { 0 }));
        values.insert("has_errors".to_string(), DatabaseValue::Integer(if self.has_errors { 1 } else { 0 }));
        values.insert("error_message".to_string(), self.error_message.clone().into());
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values.insert("updated_at".to_string(), self.updated_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            language_id: match values.get("language_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            file_path: match values.get("file_path") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            file_size: match values.get("file_size") {
                Some(DatabaseValue::Integer(i)) => Some(*i),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            file_hash: match values.get("file_hash") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            last_parsed: match values.get("last_parsed") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            parse_duration: match values.get("parse_duration") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            parser_version: match values.get("parser_version") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            symbol_count: match values.get("symbol_count") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            relationship_count: match values.get("relationship_count") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            pattern_count: match values.get("pattern_count") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            is_indexed: match values.get("is_indexed") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => false,
            },
            has_errors: match values.get("has_errors") {
                Some(DatabaseValue::Integer(i)) => *i != 0,
                _ => false,
            },
            error_message: match values.get("error_message") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            updated_at: match values.get("updated_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}