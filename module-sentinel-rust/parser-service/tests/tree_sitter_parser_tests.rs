use module_sentinel_parser::parsers::tree_sitter::{TreeSitterParser, Language};
use module_sentinel_parser::ast::UniversalNode;

#[test]
fn test_tree_sitter_parser_creation() {
    let mut parser = TreeSitterParser::new(Language::Rust).unwrap();
    assert_eq!(parser.language_id(), "rust");
    assert!(parser.is_initialized());
}

#[test]
fn test_parse_simple_rust_code() {
    let mut parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn main() { println!(\"Hello\"); }";
    let tree = parser.parse_string(code).unwrap();
    assert_eq!(tree.root_node().kind(), "source_file");
    assert_eq!(tree.root_node().child_count(), 1);
}

#[test]
fn test_parser_recovers_from_syntax_error() {
    let mut parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn main() { println!(\"Hello\" }"; // Missing closing paren
    let result = parser.parse_with_recovery(code).unwrap();
    
    println!("Has error: {}", result.tree.root_node().has_error());
    println!("Root node kind: {}", result.tree.root_node().kind());
    println!("Errors found: {}", result.errors.len());
    for error in &result.errors {
        println!("Error: {:?}", error);
    }
    
    assert!(result.had_errors());
    assert_eq!(result.errors.len(), 1);
    assert_eq!(result.recovery_suggestions.len(), 1);
    assert_eq!(result.recovery_suggestions[0].suggestion, ")");
}

#[test]
fn test_tree_sitter_to_universal_ast() {
    let mut parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn calculate(x: i32) -> i32 { x * 2 }";
    let tree = parser.parse_string(code).unwrap();
    let universal_ast = parser.to_universal_ast(&tree).unwrap();
    
    match universal_ast.get_node(universal_ast.root).unwrap() {
        UniversalNode::Function { name, params, .. } => {
            assert_eq!(name, "calculate");
            assert_eq!(params.len(), 1);
        }
        _ => panic!("Expected function node"),
    }
}

#[test]
fn test_parse_typescript_code() {
    let mut parser = TreeSitterParser::new(Language::TypeScript).unwrap();
    let code = "function greet(name: string): string { return `Hello, ${name}!`; }";
    let tree = parser.parse_string(code).unwrap();
    assert_eq!(tree.root_node().kind(), "program");
}

#[test]
fn test_parse_python_code() {
    let mut parser = TreeSitterParser::new(Language::Python).unwrap();
    let code = "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)";
    let tree = parser.parse_string(code).unwrap();
    assert_eq!(tree.root_node().kind(), "module");
}

#[test]
fn test_parse_cpp_code() {
    let mut parser = TreeSitterParser::new(Language::Cpp).unwrap();
    let code = r#"
#include <iostream>

class Calculator {
public:
    int add(int a, int b) { return a + b; }
};
"#;
    let tree = parser.parse_string(code).unwrap();
    assert_eq!(tree.root_node().kind(), "translation_unit");
}

#[test]
fn test_error_recovery_multiple_errors() {
    let mut parser = TreeSitterParser::new(Language::Rust).unwrap();
    let code = "fn main() { let x = ; let y = 42 }"; // Missing value after =
    let result = parser.parse_with_recovery(code).unwrap();
    
    assert!(result.had_errors());
    assert!(result.errors.len() >= 1);
    assert!(!result.recovery_suggestions.is_empty());
}

#[test]
fn test_incremental_parsing() {
    let mut parser = TreeSitterParser::new(Language::Rust).unwrap();
    
    // Initial parse
    let code1 = "fn main() { println!(\"Hello\"); }";
    let tree1 = parser.parse_string(code1).unwrap();
    
    // Modified code
    let code2 = "fn main() { println!(\"Hello, World!\"); }";
    let tree2 = parser.parse_incremental(code2, vec![(21, 27, 35)]).unwrap(); // Edit range
    
    assert_ne!(tree1.root_node().id(), tree2.root_node().id());
}

#[test]
fn test_language_specific_features() {
    // Test Rust-specific features
    let mut rust_parser = TreeSitterParser::new(Language::Rust).unwrap();
    let rust_code = "async fn fetch_data() -> Result<String, Error> { Ok(\"data\".to_string()) }";
    let rust_tree = rust_parser.parse_string(rust_code).unwrap();
    assert!(rust_parser.has_async_functions(&rust_tree));
    
    // Test TypeScript-specific features
    let mut ts_parser = TreeSitterParser::new(Language::TypeScript).unwrap();
    let ts_code = "interface User { name: string; age?: number; }";
    let ts_tree = ts_parser.parse_string(ts_code).unwrap();
    assert!(ts_parser.has_interfaces(&ts_tree));
}