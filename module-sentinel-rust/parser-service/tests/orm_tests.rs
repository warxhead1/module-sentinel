use tokio;
use anyhow::Result;
use tempfile::TempDir;
use std::sync::Arc;

use module_sentinel_parser::database::{
    orm::{Database, QueryBuilder, DatabaseValue},
    models::{Project, Language, UniversalSymbol, UniversalRelationship, FileIndex},
};

// Helper to create a test database
async fn create_test_db() -> Result<(TempDir, Database)> {
    let temp_dir = tempfile::tempdir()?;
    let db_path = temp_dir.path().join("test.db");
    let db = Database::new(db_path.to_str().unwrap()).await?;
    
    // Create basic schema for testing
    let schema_sql = r#"
        CREATE TABLE projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT,
            description TEXT,
            root_path TEXT NOT NULL,
            config_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            metadata TEXT
        );
        
        CREATE TABLE languages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            version TEXT,
            parser_class TEXT NOT NULL,
            extensions TEXT NOT NULL,
            features TEXT,
            is_enabled INTEGER DEFAULT 1,
            priority INTEGER DEFAULT 100
        );
        
        CREATE TABLE universal_symbols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            language_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            qualified_name TEXT NOT NULL,
            kind TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line INTEGER NOT NULL,
            column INTEGER NOT NULL,
            end_line INTEGER,
            end_column INTEGER,
            return_type TEXT,
            signature TEXT,
            visibility TEXT,
            namespace TEXT,
            parent_symbol_id INTEGER,
            is_exported INTEGER DEFAULT 0,
            is_async INTEGER DEFAULT 0,
            is_abstract INTEGER DEFAULT 0,
            language_features TEXT,
            semantic_tags TEXT,
            confidence REAL DEFAULT 1.0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (language_id) REFERENCES languages(id)
        );
        
        CREATE TABLE universal_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            from_symbol_id INTEGER,
            to_symbol_id INTEGER,
            relationship_type TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            context_line INTEGER,
            context_column INTEGER,
            context_snippet TEXT,
            metadata TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (from_symbol_id) REFERENCES universal_symbols(id),
            FOREIGN KEY (to_symbol_id) REFERENCES universal_symbols(id)
        );
        
        CREATE TABLE file_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            language_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            file_hash TEXT,
            last_parsed TEXT,
            parse_duration INTEGER,
            parser_version TEXT,
            symbol_count INTEGER DEFAULT 0,
            relationship_count INTEGER DEFAULT 0,
            pattern_count INTEGER DEFAULT 0,
            is_indexed INTEGER DEFAULT 0,
            has_errors INTEGER DEFAULT 0,
            error_message TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (language_id) REFERENCES languages(id)
        );
    "#;
    
    db.migrate(schema_sql.to_string()).await?;
    Ok((temp_dir, db))
}

#[tokio::test]
async fn test_database_creation_and_migration() {
    let (_temp_dir, _db) = create_test_db().await.expect("Failed to create test database");
    // If we get here, database creation and migration worked
}

#[tokio::test]
async fn test_project_crud_operations() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    
    // Test INSERT
    let mut project = Project {
        name: "test_project".to_string(),
        display_name: Some("Test Project".to_string()),
        description: Some("A test project".to_string()),
        root_path: "/path/to/project".to_string(),
        config_path: Some("/path/to/config".to_string()),
        is_active: true,
        ..Default::default()
    };
    
    project = db.insert(project).await?;
    assert!(project.id.is_some());
    let project_id = project.id.unwrap();
    
    // Test FIND
    let found_project = db.find::<Project>(project_id as i64).await?;
    assert!(found_project.is_some());
    let found = found_project.unwrap();
    assert_eq!(found.name, "test_project");
    assert_eq!(found.display_name, Some("Test Project".to_string()));
    assert_eq!(found.root_path, "/path/to/project");
    assert!(found.is_active);
    
    // Test UPDATE
    let mut updated_project = found.clone();
    updated_project.description = Some("Updated description".to_string());
    updated_project.is_active = false;
    
    db.update(&updated_project).await?;
    
    let found_updated = db.find::<Project>(project_id as i64).await?.unwrap();
    assert_eq!(found_updated.description, Some("Updated description".to_string()));
    assert!(!found_updated.is_active);
    
    // Test DELETE
    db.delete::<Project>(project_id as i64).await?;
    let found_deleted = db.find::<Project>(project_id as i64).await?;
    assert!(found_deleted.is_none());
    
    Ok(())
}

#[tokio::test]
async fn test_query_builder_where_conditions() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    
    // Insert test data
    let projects = vec![
        Project {
            name: "project_a".to_string(),
            display_name: Some("Project A".to_string()),
            root_path: "/path/a".to_string(),
            is_active: true,
            ..Default::default()
        },
        Project {
            name: "project_b".to_string(),
            display_name: Some("Project B".to_string()),
            root_path: "/path/b".to_string(),
            is_active: false,
            ..Default::default()
        },
        Project {
            name: "test_project".to_string(),
            display_name: Some("Test Project".to_string()),
            root_path: "/path/test".to_string(),
            is_active: true,
            ..Default::default()
        },
    ];
    
    for project in projects {
        db.insert(project).await?;
    }
    
    // Test WHERE equals
    let active_projects = db.find_all(
        QueryBuilder::<Project>::new()
            .where_eq("is_active", true)
    ).await?;
    assert_eq!(active_projects.len(), 2);
    
    // Test WHERE with string
    let project_a = db.find_all(
        QueryBuilder::<Project>::new()
            .where_eq("name", "project_a")
    ).await?;
    assert_eq!(project_a.len(), 1);
    assert_eq!(project_a[0].display_name, Some("Project A".to_string()));
    
    // Test WHERE LIKE
    let test_projects = db.find_all(
        QueryBuilder::<Project>::new()
            .where_like("name", "%test%")
    ).await?;
    assert_eq!(test_projects.len(), 1);
    assert_eq!(test_projects[0].name, "test_project");
    
    // Test WHERE IN
    let specific_projects = db.find_all(
        QueryBuilder::<Project>::new()
            .where_in("name", vec!["project_a", "project_b"])
    ).await?;
    assert_eq!(specific_projects.len(), 2);
    
    Ok(())
}

#[tokio::test]
async fn test_query_builder_ordering_and_limits() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    
    // Insert test languages with different priorities
    let languages = vec![
        Language {
            name: "rust".to_string(),
            display_name: "Rust".to_string(),
            parser_class: "RustParser".to_string(),
            extensions: r#"[".rs"]"#.to_string(),
            priority: 10,
            ..Default::default()
        },
        Language {
            name: "cpp".to_string(),
            display_name: "C++".to_string(),
            parser_class: "CppParser".to_string(),
            extensions: r#"[".cpp", ".hpp"]"#.to_string(),
            priority: 20,
            ..Default::default()
        },
        Language {
            name: "python".to_string(),
            display_name: "Python".to_string(),
            parser_class: "PythonParser".to_string(),
            extensions: r#"[".py"]"#.to_string(),
            priority: 30,
            ..Default::default()
        },
    ];
    
    for language in languages {
        db.insert(language).await?;
    }
    
    // Test ORDER BY ascending
    let ordered_asc = db.find_all(
        QueryBuilder::<Language>::new()
            .order_by("priority", false)
    ).await?;
    assert_eq!(ordered_asc.len(), 3);
    assert_eq!(ordered_asc[0].name, "rust");
    assert_eq!(ordered_asc[1].name, "cpp");
    assert_eq!(ordered_asc[2].name, "python");
    
    // Test ORDER BY descending
    let ordered_desc = db.find_all(
        QueryBuilder::<Language>::new()
            .order_by("priority", true)
    ).await?;
    assert_eq!(ordered_desc.len(), 3);
    assert_eq!(ordered_desc[0].name, "python");
    assert_eq!(ordered_desc[1].name, "cpp");
    assert_eq!(ordered_desc[2].name, "rust");
    
    // Test LIMIT
    let limited = db.find_all(
        QueryBuilder::<Language>::new()
            .order_by("priority", false)
            .limit(2)
    ).await?;
    assert_eq!(limited.len(), 2);
    assert_eq!(limited[0].name, "rust");
    assert_eq!(limited[1].name, "cpp");
    
    // Test OFFSET
    let offset = db.find_all(
        QueryBuilder::<Language>::new()
            .order_by("priority", false)
            .offset(1)
            .limit(2)
    ).await?;
    assert_eq!(offset.len(), 2);
    assert_eq!(offset[0].name, "cpp");
    assert_eq!(offset[1].name, "python");
    
    Ok(())
}

#[tokio::test]
async fn test_complex_queries_with_symbols() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    
    // Set up test data
    let project = db.insert(Project {
        name: "test_project".to_string(),
        root_path: "/test".to_string(),
        ..Default::default()
    }).await?;
    
    let language = db.insert(Language {
        name: "rust".to_string(),
        display_name: "Rust".to_string(),
        parser_class: "RustParser".to_string(),
        extensions: r#"[".rs"]"#.to_string(),
        ..Default::default()
    }).await?;
    
    let project_id = project.id.unwrap();
    let language_id = language.id.unwrap();
    
    // Insert symbols
    let symbols = vec![
        UniversalSymbol {
            project_id,
            language_id,
            name: "main".to_string(),
            qualified_name: "::main".to_string(),
            kind: "function".to_string(),
            file_path: "src/main.rs".to_string(),
            line: 1,
            column: 0,
            signature: Some("fn main()".to_string()),
            is_exported: true,
            confidence: 0.95,
            ..Default::default()
        },
        UniversalSymbol {
            project_id,
            language_id,
            name: "helper".to_string(),
            qualified_name: "::helper".to_string(),
            kind: "function".to_string(),
            file_path: "src/lib.rs".to_string(),
            line: 10,
            column: 0,
            signature: Some("fn helper() -> i32".to_string()),
            is_exported: false,
            confidence: 0.88,
            ..Default::default()
        },
        UniversalSymbol {
            project_id,
            language_id,
            name: "Config".to_string(),
            qualified_name: "::Config".to_string(),
            kind: "struct".to_string(),
            file_path: "src/config.rs".to_string(),
            line: 5,
            column: 0,
            signature: Some("struct Config".to_string()),
            is_exported: true,
            confidence: 0.99,
            ..Default::default()
        },
    ];
    
    let mut inserted_symbols = Vec::new();
    for symbol in symbols {
        let inserted = db.insert(symbol).await?;
        inserted_symbols.push(inserted);
    }
    
    // Test complex query: Find all exported functions with high confidence
    let exported_functions = db.find_all(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id)
            .where_eq("kind", "function")
            .where_eq("is_exported", true)
            .where_eq("confidence", 0.95)
            .order_by("line", false)
    ).await?;
    
    assert_eq!(exported_functions.len(), 1);
    assert_eq!(exported_functions[0].name, "main");
    
    // Test query with file path pattern
    let lib_symbols = db.find_all(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id)
            .where_like("file_path", "%lib.rs")
    ).await?;
    
    assert_eq!(lib_symbols.len(), 1);
    assert_eq!(lib_symbols[0].name, "helper");
    
    // Test count functionality
    let total_symbols = db.count(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id)
    ).await?;
    assert_eq!(total_symbols, 3);
    
    let function_count = db.count(
        QueryBuilder::<UniversalSymbol>::new()
            .where_eq("project_id", project_id)
            .where_eq("kind", "function")
    ).await?;
    assert_eq!(function_count, 2);
    
    Ok(())
}

#[tokio::test]
async fn test_relationships_and_foreign_keys() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    
    // Set up test data
    let project = db.insert(Project {
        name: "test_project".to_string(),
        root_path: "/test".to_string(),
        ..Default::default()
    }).await?;
    
    let language = db.insert(Language {
        name: "rust".to_string(),
        display_name: "Rust".to_string(),
        parser_class: "RustParser".to_string(),
        extensions: r#"[".rs"]"#.to_string(),
        ..Default::default()
    }).await?;
    
    let project_id = project.id.unwrap();
    let language_id = language.id.unwrap();
    
    // Insert symbols
    let caller = db.insert(UniversalSymbol {
        project_id,
        language_id,
        name: "caller".to_string(),
        qualified_name: "::caller".to_string(),
        kind: "function".to_string(),
        file_path: "src/main.rs".to_string(),
        line: 1,
        column: 0,
        ..Default::default()
    }).await?;
    
    let callee = db.insert(UniversalSymbol {
        project_id,
        language_id,
        name: "callee".to_string(),
        qualified_name: "::callee".to_string(),
        kind: "function".to_string(),
        file_path: "src/lib.rs".to_string(),
        line: 10,
        column: 0,
        ..Default::default()
    }).await?;
    
    let caller_id = caller.id.unwrap();
    let callee_id = callee.id.unwrap();
    
    // Insert relationship
    let relationship = db.insert(UniversalRelationship {
        project_id,
        from_symbol_id: Some(caller_id),
        to_symbol_id: Some(callee_id),
        relationship_type: "calls".to_string(),
        confidence: 0.95,
        context_line: Some(5),
        context_snippet: Some("callee()".to_string()),
        ..Default::default()
    }).await?;
    
    assert!(relationship.id.is_some());
    
    // Query relationships
    let outgoing_relationships = db.find_all(
        QueryBuilder::<UniversalRelationship>::new()
            .where_eq("from_symbol_id", caller_id)
    ).await?;
    
    assert_eq!(outgoing_relationships.len(), 1);
    assert_eq!(outgoing_relationships[0].relationship_type, "calls");
    assert_eq!(outgoing_relationships[0].to_symbol_id, Some(callee_id));
    
    let incoming_relationships = db.find_all(
        QueryBuilder::<UniversalRelationship>::new()
            .where_eq("to_symbol_id", callee_id)
    ).await?;
    
    assert_eq!(incoming_relationships.len(), 1);
    assert_eq!(incoming_relationships[0].from_symbol_id, Some(caller_id));
    
    Ok(())
}

#[tokio::test]
async fn test_file_index_operations() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    
    // Set up test data
    let project = db.insert(Project {
        name: "test_project".to_string(),
        root_path: "/test".to_string(),
        ..Default::default()
    }).await?;
    
    let language = db.insert(Language {
        name: "rust".to_string(),
        display_name: "Rust".to_string(),
        parser_class: "RustParser".to_string(),
        extensions: r#"[".rs"]"#.to_string(),
        ..Default::default()
    }).await?;
    
    let project_id = project.id.unwrap();
    let language_id = language.id.unwrap();
    
    // Insert file index entries
    let files = vec![
        FileIndex {
            project_id,
            language_id,
            file_path: "src/main.rs".to_string(),
            file_size: Some(1024),
            file_hash: Some("abc123".to_string()),
            symbol_count: 5,
            relationship_count: 2,
            pattern_count: 1,
            is_indexed: true,
            has_errors: false,
            parse_duration: Some(150),
            ..Default::default()
        },
        FileIndex {
            project_id,
            language_id,
            file_path: "src/lib.rs".to_string(),
            file_size: Some(2048),
            file_hash: Some("def456".to_string()),
            symbol_count: 10,
            relationship_count: 5,
            pattern_count: 3,
            is_indexed: false,
            has_errors: true,
            error_message: Some("Parse error".to_string()),
            parse_duration: Some(300),
            ..Default::default()
        },
    ];
    
    for file in files {
        db.insert(file).await?;
    }
    
    // Test queries on file index
    let indexed_files = db.find_all(
        QueryBuilder::<FileIndex>::new()
            .where_eq("project_id", project_id)
            .where_eq("is_indexed", true)
    ).await?;
    
    assert_eq!(indexed_files.len(), 1);
    assert_eq!(indexed_files[0].file_path, "src/main.rs");
    assert_eq!(indexed_files[0].symbol_count, 5);
    
    let files_with_errors = db.find_all(
        QueryBuilder::<FileIndex>::new()
            .where_eq("project_id", project_id)
            .where_eq("has_errors", true)
    ).await?;
    
    assert_eq!(files_with_errors.len(), 1);
    assert_eq!(files_with_errors[0].file_path, "src/lib.rs");
    assert_eq!(files_with_errors[0].error_message, Some("Parse error".to_string()));
    
    // Test aggregation queries
    let total_symbols: i64 = db.find_all(
        QueryBuilder::<FileIndex>::new()
            .where_eq("project_id", project_id)
    ).await?
    .iter()
    .map(|f| f.symbol_count as i64)
    .sum();
    
    assert_eq!(total_symbols, 15);
    
    Ok(())
}

#[tokio::test]
async fn test_database_value_conversions() {
    // Test various data type conversions
    let int_val: DatabaseValue = 42i32.into();
    let long_val: DatabaseValue = 42i64.into();
    let float_val: DatabaseValue = 3.14f32.into();
    let double_val: DatabaseValue = 3.14f64.into();
    let string_val: DatabaseValue = "test".into();
    let owned_string_val: DatabaseValue = "test".to_string().into();
    let bytes_val: DatabaseValue = vec![1, 2, 3].into();
    let none_val: DatabaseValue = Option::<String>::None.into();
    let some_val: DatabaseValue = Some("test".to_string()).into();
    
    match int_val {
        DatabaseValue::Integer(42) => {},
        _ => panic!("Integer conversion failed"),
    }
    
    match long_val {
        DatabaseValue::Integer(42) => {},
        _ => panic!("Long conversion failed"),
    }
    
    match float_val {
        DatabaseValue::Real(f) if (f - 3.14).abs() < 0.001 => {},
        _ => panic!("Float conversion failed"),
    }
    
    match double_val {
        DatabaseValue::Real(f) if (f - 3.14).abs() < 0.001 => {},
        _ => panic!("Double conversion failed"),
    }
    
    match string_val {
        DatabaseValue::Text(s) if s == "test" => {},
        _ => panic!("String conversion failed"),
    }
    
    match owned_string_val {
        DatabaseValue::Text(s) if s == "test" => {},
        _ => panic!("Owned string conversion failed"),
    }
    
    match bytes_val {
        DatabaseValue::Blob(b) if b == vec![1, 2, 3] => {},
        _ => panic!("Bytes conversion failed"),
    }
    
    match none_val {
        DatabaseValue::Null => {},
        _ => panic!("None conversion failed"),
    }
    
    match some_val {
        DatabaseValue::Text(s) if s == "test" => {},
        _ => panic!("Some conversion failed"),
    }
}

#[tokio::test]
async fn test_concurrent_operations() -> Result<()> {
    let (_temp_dir, db) = create_test_db().await?;
    let db = Arc::new(db);
    
    // Test concurrent inserts
    let mut handles = Vec::new();
    
    for i in 0..10 {
        let db_clone = Arc::clone(&db);
        let handle = tokio::spawn(async move {
            let project = Project {
                name: format!("project_{}", i),
                root_path: format!("/path/{}", i),
                ..Default::default()
            };
            db_clone.insert(project).await
        });
        handles.push(handle);
    }
    
    // Wait for all inserts to complete
    let mut results = Vec::new();
    for handle in handles {
        let result = handle.await.unwrap()?;
        results.push(result);
    }
    
    assert_eq!(results.len(), 10);
    
    // Verify all projects were inserted
    let all_projects = db.find_all(QueryBuilder::<Project>::new()).await?;
    assert_eq!(all_projects.len(), 10);
    
    // Test concurrent reads
    let mut read_handles = Vec::new();
    
    for result in &results {
        let db_clone = Arc::clone(&db);
        let project_id = result.id.unwrap() as i64;
        let handle = tokio::spawn(async move {
            db_clone.find::<Project>(project_id).await
        });
        read_handles.push(handle);
    }
    
    // Wait for all reads to complete
    for handle in read_handles {
        let found = handle.await.unwrap()?;
        assert!(found.is_some());
    }
    
    Ok(())
}