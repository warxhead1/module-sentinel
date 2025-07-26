use serde::{Deserialize, Serialize};

/// Universal symbol kinds that work across all languages
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UniversalSymbolKind {
    // Structural
    #[serde(rename = "namespace")]
    Namespace,
    #[serde(rename = "package")]
    Package,
    #[serde(rename = "module")]
    Module,
    #[serde(rename = "class")]
    Class,
    #[serde(rename = "interface")]
    Interface,
    #[serde(rename = "struct")]
    Struct,
    #[serde(rename = "enum")]
    Enum,
    #[serde(rename = "trait")]
    Trait,
    #[serde(rename = "type_alias")]
    TypeAlias,
    
    // Functions
    #[serde(rename = "function")]
    Function,
    #[serde(rename = "method")]
    Method,
    #[serde(rename = "constructor")]
    Constructor,
    #[serde(rename = "destructor")]
    Destructor,
    #[serde(rename = "getter")]
    Getter,
    #[serde(rename = "setter")]
    Setter,
    
    // Variables
    #[serde(rename = "variable")]
    Variable,
    #[serde(rename = "constant")]
    Constant,
    #[serde(rename = "parameter")]
    Parameter,
    #[serde(rename = "property")]
    Property,
    #[serde(rename = "field")]
    Field,
    #[serde(rename = "enum_member")]
    EnumMember,
    
    // Other
    #[serde(rename = "import")]
    Import,
    #[serde(rename = "export")]
    Export,
    #[serde(rename = "unknown")]
    Unknown,
}

/// Universal relationship types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UniversalRelationshipType {
    // Inheritance
    #[serde(rename = "extends")]
    Extends,
    #[serde(rename = "implements")]
    Implements,
    #[serde(rename = "inherits")]
    Inherits,
    
    // Usage
    #[serde(rename = "uses")]
    Uses,
    #[serde(rename = "calls")]
    Calls,
    #[serde(rename = "instantiates")]
    Instantiates,
    #[serde(rename = "references")]
    References,
    #[serde(rename = "imports")]
    Imports,
    #[serde(rename = "exports")]
    Exports,
    
    // Containment
    #[serde(rename = "contains")]
    Contains,
    #[serde(rename = "defines")]
    Defines,
    #[serde(rename = "declares")]
    Declares,
    
    // Type relationships
    #[serde(rename = "returns")]
    Returns,
    #[serde(rename = "throws")]
    Throws,
    #[serde(rename = "type_parameter")]
    TypeParameter,
    #[serde(rename = "generic_argument")]
    GenericArgument,
    
    // Cross-language
    #[serde(rename = "ffi_call")]
    FfiCall,
    #[serde(rename = "rpc_call")]
    RpcCall,
    #[serde(rename = "subprocess_call")]
    SubprocessCall,
    #[serde(rename = "rest_api_call")]
    RestApiCall,
    #[serde(rename = "grpc_call")]
    GrpcCall,
}

/// Source location information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceLocation {
    pub line: u32,
    pub column: u32,
    pub offset: usize,
}

/// Universal symbol structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversalSymbol {
    pub name: String,
    pub qualified_name: String,
    pub kind: UniversalSymbolKind,
    pub file_path: String,
    pub start_location: SourceLocation,
    pub end_location: SourceLocation,
    pub namespace: Option<String>,
    pub parent_id: Option<i64>,
    pub signature: Option<String>,
    pub return_type: Option<String>,
    pub modifiers: Vec<String>,
    pub documentation: Option<String>,
    pub language_specific: Option<serde_json::Value>,
}

/// Universal relationship structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversalRelationship {
    pub from_symbol_id: i64,
    pub to_symbol_name: String,
    pub relationship_type: UniversalRelationshipType,
    pub file_path: String,
    pub start_location: SourceLocation,
    pub confidence: f32,
    pub metadata: Option<serde_json::Value>,
}

/// Parse result from language parsers
#[derive(Debug, Serialize, Deserialize)]
pub struct ParseResult {
    pub symbols: Vec<UniversalSymbol>,
    pub relationships: Vec<UniversalRelationship>,
    pub diagnostics: Vec<ParseDiagnostic>,
    pub parse_time_ms: u64,
}

/// Parse diagnostic information
#[derive(Debug, Serialize, Deserialize)]
pub struct ParseDiagnostic {
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub file_path: String,
    pub location: SourceLocation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
    Hint,
}

// String conversion implementations for database storage
impl UniversalSymbolKind {
    /// Convert to database string representation
    pub fn to_db_string(&self) -> String {
        serde_json::to_string(self)
            .unwrap_or_else(|_| "unknown".to_string())
            .trim_matches('"')
            .to_string()
    }
    
    /// Parse from database string representation
    pub fn from_db_string(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(&format!("\"{}\"", s))
    }
}

impl UniversalRelationshipType {
    /// Convert to database string representation
    pub fn to_db_string(&self) -> String {
        serde_json::to_string(self)
            .unwrap_or_else(|_| "unknown".to_string())
            .trim_matches('"')
            .to_string()
    }
    
    /// Parse from database string representation
    pub fn from_db_string(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(&format!("\"{}\"", s))
    }
}

impl std::fmt::Display for UniversalSymbolKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_db_string())
    }
}

impl std::fmt::Display for UniversalRelationshipType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_db_string())
    }
}