use module_sentinel_parser::ast::{NodeLocation, SourceLocation, UniversalAst, UniversalNode, NodeId};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::path::PathBuf;
use tempfile::TempDir;
use std::fs;

pub fn create_test_location(start: usize, end: usize) -> NodeLocation {
    NodeLocation {
        start: SourceLocation { 
            line: 1, 
            column: start as u32, 
            offset: start 
        },
        end: SourceLocation { 
            line: 1, 
            column: end as u32, 
            offset: end 
        },
        text_range: (start, end),
    }
}

pub fn create_test_ast() -> UniversalAst {
    let mut ast = UniversalAst::new("test.rs".into(), "test source".into());
    
    // Add a module node
    let module = UniversalNode::Module {
        name: "test_module".into(),
        exports: vec![],
        imports: vec![],
    };
    let module_id = ast.add_node(module, create_test_location(0, 10));
    
    // Add a function node
    let func1 = UniversalNode::Function {
        name: "test_func1".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_generator: false,
    };
    let func1_id = ast.add_node(func1, create_test_location(11, 30));
    
    // Add another function
    let func2 = UniversalNode::Function {
        name: "test_func2".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec!["pub".into()],
        type_parameters: vec![],
        is_async: true,
        is_generator: false,
    };
    let func2_id = ast.add_node(func2, create_test_location(31, 50));
    
    // Add a class node
    let class = UniversalNode::Class {
        name: "TestClass".into(),
        base: None,
        interfaces: vec![],
        members: vec![],
        modifiers: vec!["pub".into()],
        type_parameters: vec![],
    };
    let class_id = ast.add_node(class, create_test_location(51, 70));
    
    // Update module to contain these nodes
    if let Some(UniversalNode::Module { exports, .. }) = ast.get_node_mut(module_id) {
        exports.push(func1_id);
        exports.push(func2_id);
        exports.push(class_id);
    }
    
    ast.set_root(module_id);
    ast
}

pub async fn create_test_db() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("Failed to create test database");
    
    // Run migrations
    sqlx::migrate!("../../migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");
    
    pool
}

pub fn create_test_project() -> TempDir {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    
    // Create some test files
    let src_dir = temp_dir.path().join("src");
    fs::create_dir(&src_dir).expect("Failed to create src dir");
    
    // C++ file
    fs::write(
        src_dir.join("main.cpp"),
        r#"
#include <iostream>

class Calculator {
public:
    int add(int a, int b) { return a + b; }
    int subtract(int a, int b) { return a - b; }
};

int main() {
    Calculator calc;
    std::cout << calc.add(5, 3) << std::endl;
    return 0;
}
"#
    ).expect("Failed to write main.cpp");
    
    // Rust file
    fs::write(
        src_dir.join("lib.rs"),
        r#"
pub struct Point {
    x: f64,
    y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Point { x, y }
    }
    
    pub fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}
"#
    ).expect("Failed to write lib.rs");
    
    // TypeScript file
    fs::write(
        src_dir.join("app.ts"),
        r#"
interface User {
    id: number;
    name: string;
    email: string;
}

class UserService {
    private users: User[] = [];
    
    async getUser(id: number): Promise<User | undefined> {
        return this.users.find(u => u.id === id);
    }
    
    async createUser(user: User): Promise<void> {
        this.users.push(user);
    }
}

export { UserService, User };
"#
    ).expect("Failed to write app.ts");
    
    temp_dir
}

pub fn assert_parse_error_contains(error: &str, expected: &str) {
    assert!(
        error.contains(expected),
        "Expected error to contain '{}', but got: '{}'",
        expected,
        error
    );
}