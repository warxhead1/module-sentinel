# TDD Implementation Plan for Rust Parser

## Overview

This plan follows Test-Driven Development principles to build the Rust parser incrementally, ensuring each component works before moving to the next.

## Phase 1: Core AST Infrastructure

### 1.1 Basic AST Node Creation
**Test First:**
```rust
// tests/ast_tests.rs
#[test]
fn test_create_function_node() {
    let mut ast = UniversalAst::new("test.rs".into(), "fn main() {}".into());
    let func = UniversalNode::Function { 
        name: "main".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_generator: false,
    };
    let id = ast.add_node(func, create_test_location(0, 12));
    assert_eq!(ast.nodes.len(), 1);
    assert_eq!(id, NodeId(0));
}
```

**Then implement:** Basic AST structure and node addition

### 1.2 AST Visitor Pattern
**Test First:**
```rust
#[test]
fn test_visitor_traversal() {
    let ast = create_test_ast();
    let mut counter = NodeCounterVisitor::new();
    counter.visit_ast(&ast);
    assert_eq!(counter.function_count, 2);
    assert_eq!(counter.class_count, 1);
}
```

**Then implement:** Visitor trait and basic traversal

## Phase 2: Pattern Engine

### 2.1 Pattern Loading
**Test First:**
```rust
#[test]
fn test_load_yaml_pattern() {
    let yaml = r#"
    language: rust
    patterns:
      function:
        - query: '(function_item name: (identifier) @name)'
    "#;
    let pattern = Pattern::from_yaml(yaml).unwrap();
    assert_eq!(pattern.language, "rust");
    assert_eq!(pattern.patterns.function.len(), 1);
}
```

**Then implement:** YAML pattern parsing

### 2.2 Pattern Matching
**Test First:**
```rust
#[test]
fn test_pattern_match_function() {
    let source = "fn calculate(x: i32) -> i32 { x * 2 }";
    let pattern = load_rust_patterns();
    let matches = pattern.find_matches(source);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].kind, "function");
    assert_eq!(matches[0].name, "calculate");
}
```

**Then implement:** Tree-sitter query execution

## Phase 3: Universal Parser Trait

### 3.1 Trait Definition
**Test First:**
```rust
#[test]
fn test_parser_trait_impl() {
    let parser = MockParser::new();
    assert_eq!(parser.language_id(), "mock");
    assert_eq!(parser.supported_extensions(), &[".mock"]);
}
```

**Then implement:** UniversalParser trait

### 3.2 Parse Method
**Test First:**
```rust
#[tokio::test]
async fn test_parse_simple_file() {
    let parser = RustParser::new();
    let ast = parser.parse(Source::Text("fn main() {}".into())).await.unwrap();
    assert_eq!(ast.nodes.len(), 1);
    matches!(ast.get_node(ast.root), Some(UniversalNode::Function { .. }));
}
```

**Then implement:** Basic parsing logic

## Phase 4: Database Integration

### 4.1 Schema Compatibility
**Test First:**
```rust
#[test]
fn test_symbol_to_db_model() {
    let symbol = UniversalSymbol {
        name: "test_func".into(),
        qualified_name: "mod::test_func".into(),
        kind: UniversalSymbolKind::Function,
        // ...
    };
    let db_model = symbol.to_db_model(project_id, language_id);
    assert_eq!(db_model.name, "test_func");
    assert_eq!(db_model.kind, "function");
}
```

**Then implement:** Model conversions

### 4.2 Batch Insertion
**Test First:**
```rust
#[sqlx::test]
async fn test_batch_insert_symbols(pool: SqlitePool) {
    let symbols = vec![create_test_symbol(); 100];
    let writer = DatabaseWriter::new(pool);
    writer.insert_symbols(symbols).await.unwrap();
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM universal_symbols")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 100);
}
```

**Then implement:** Batch database operations

## Phase 5: C++ Parser Implementation

### 5.1 Basic C++ Constructs
**Test First:**
```rust
#[test]
fn test_cpp_class_parsing() {
    let source = r#"
    class Calculator {
    public:
        int add(int a, int b) { return a + b; }
    };
    "#;
    let parser = CppParser::new();
    let ast = parser.parse(Source::Text(source.into())).await.unwrap();
    
    let symbols = parser.extract_symbols(&ast).unwrap();
    assert_eq!(symbols.len(), 2); // class + method
    assert_eq!(symbols[0].name, "Calculator");
    assert_eq!(symbols[1].name, "add");
}
```

**Then implement:** C++ parser using patterns

### 5.2 C++ Relationships
**Test First:**
```rust
#[test]
fn test_cpp_inheritance() {
    let source = r#"
    class Base {};
    class Derived : public Base {};
    "#;
    let parser = CppParser::new();
    let ast = parser.parse(Source::Text(source.into())).await.unwrap();
    
    let relationships = parser.detect_relationships(&ast).unwrap();
    assert_eq!(relationships.len(), 1);
    assert_eq!(relationships[0].relationship_type, UniversalRelationshipType::Inherits);
}
```

**Then implement:** Relationship detection

## Phase 6: Integration Testing

### 6.1 End-to-End Parse and Store
**Test First:**
```rust
#[tokio::test]
async fn test_parse_and_store_project() {
    let temp_dir = create_test_project();
    let db = create_test_db().await;
    
    let result = parse_project(temp_dir.path(), vec!["cpp"], &db).await.unwrap();
    
    assert_eq!(result.files_parsed, 3);
    assert!(result.total_symbols > 10);
    assert!(result.total_relationships > 5);
}
```

**Then implement:** Full pipeline

### 6.2 CLI Integration
**Test First:**
```rust
#[test]
fn test_cli_parsing() {
    let args = vec!["parser", "-p", "/project", "-l", "cpp,rust"];
    let cli = Cli::parse_from(args);
    assert_eq!(cli.languages, vec!["cpp", "rust"]);
}
```

**Then implement:** CLI argument handling

## Test Utilities

Create these helper functions early:
```rust
// tests/common/mod.rs
pub fn create_test_location(start: usize, end: usize) -> NodeLocation {
    NodeLocation {
        start: SourceLocation { line: 1, column: start as u32, offset: start },
        end: SourceLocation { line: 1, column: end as u32, offset: end },
        text_range: (start, end),
    }
}

pub fn create_test_ast() -> UniversalAst {
    // Build a simple AST for testing
}

pub async fn create_test_db() -> SqlitePool {
    // In-memory SQLite for tests
}
```

## Running Tests

```bash
# Run all tests
cargo test

# Run specific test module
cargo test ast_tests

# Run with output
cargo test -- --nocapture

# Run integration tests only
cargo test --test integration
```

## Key Testing Principles

1. **Write the test first** - It should fail
2. **Implement minimal code** to make it pass
3. **Refactor** while keeping tests green
4. **One assertion per test** when possible
5. **Test edge cases** after happy path
6. **Mock external dependencies** (filesystem, network)
7. **Use property-based testing** for complex scenarios

## Next Steps

1. Set up test infrastructure (create `tests/` directory)
2. Implement Phase 1.1 (Basic AST)
3. Run tests, make them pass
4. Commit working code
5. Move to Phase 1.2

This incremental approach ensures we build on solid foundations and catch issues early.