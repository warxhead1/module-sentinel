use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum Language {
    Rust,
    TypeScript,
    JavaScript,
    Python,
    Cpp,
    Go,
    Java,
    CSharp,
}

impl Language {
    pub fn id(&self) -> &'static str {
        match self {
            Language::Rust => "rust",
            Language::TypeScript => "typescript",
            Language::JavaScript => "javascript",
            Language::Python => "python",
            Language::Cpp => "cpp",
            Language::Go => "go",
            Language::Java => "java",
            Language::CSharp => "c_sharp",
        }
    }
    
    pub fn extensions(&self) -> &'static [&'static str] {
        match self {
            Language::Rust => &[".rs"],
            Language::TypeScript => &[".ts", ".tsx"],
            Language::JavaScript => &[".js", ".jsx", ".mjs"],
            Language::Python => &[".py", ".pyi"],
            Language::Cpp => &[".cpp", ".cc", ".cxx", ".hpp", ".h", ".hxx"],
            Language::Go => &[".go"],
            Language::Java => &[".java"],
            Language::CSharp => &[".cs"],
        }
    }
    
    pub fn tree_sitter_language(&self) -> tree_sitter::Language {
        match self {
            Language::Rust => tree_sitter_rust::LANGUAGE.into(),
            Language::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            Language::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            Language::Python => tree_sitter_python::LANGUAGE.into(),
            Language::Cpp => tree_sitter_cpp::LANGUAGE.into(),
            Language::Go => tree_sitter_go::LANGUAGE.into(),
            Language::Java => tree_sitter_java::LANGUAGE.into(),
            Language::CSharp => tree_sitter_c_sharp::LANGUAGE.into(),
        }
    }
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.id())
    }
}