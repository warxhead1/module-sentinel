use module_sentinel_parser::patterns::{LanguageDefinition, PatternEngine};
use module_sentinel_parser::analysis::{EndpointCorrelator, CorrelationType};
use module_sentinel_parser::database::models::UniversalSymbol;
use tempfile::TempDir;
use std::fs;

#[test]
fn test_typescript_api_patterns() {
    let temp_dir = TempDir::new().unwrap();
    let pattern_file = temp_dir.path().join("typescript-api.yaml");
    
    let typescript_patterns = r#"
language: typescript
version: "5.0"
patterns:
  api_calls:
    - query: '(call_expression function: (identifier) @func_name arguments: (arguments (string) @endpoint)) (#match? @func_name "^fetch$")'
      confidence: 0.95
cross_language_patterns:
  api_calls:
    - pattern: 'fetch\s*\(\s*["'`]([^"'`]+)["'`]'
      confidence: 0.85
      capture_groups:
        1: "api_endpoint"
"#;
    
    fs::write(&pattern_file, typescript_patterns).unwrap();
    
    let definition = LanguageDefinition::from_yaml(typescript_patterns).unwrap();
    assert_eq!(definition.id, "typescript");
    assert_eq!(definition.patterns.api_patterns.len(), 1);
    assert_eq!(definition.cross_language_patterns.api_patterns.len(), 1);
    
    // Test pattern matching
    let pattern = &definition.patterns.api_patterns[0];
    let source = r#"const response = await fetch("https://api.example.com/users");"#;
    let matches = pattern.find_matches("typescript", source).unwrap();
    
    assert_eq!(matches.len(), 2); // func_name and endpoint captures
    assert_eq!(matches[0].capture_name, "func_name");
    assert_eq!(matches[0].text, "fetch");
    assert_eq!(matches[1].capture_name, "endpoint");
    assert_eq!(matches[1].text, "https://api.example.com/users");
}

#[test]
fn test_python_api_patterns() {
    let python_patterns = r#"
language: python
version: "3.12"
patterns:
  api_calls:
    - query: '(call function: (attribute object: (identifier) @lib_name attr: (identifier) @method) arguments: [(string) @endpoint]) (#match? @lib_name "^requests$")'
      confidence: 0.95
cross_language_patterns:
  api_calls:
    - pattern: 'requests\.(get|post|put|delete)\s*\(\s*["'\'']([^"'\'']+)["'\'']'
      confidence: 0.90
      capture_groups:
        1: "http_method"
        2: "api_endpoint"
"#;
    
    let definition = LanguageDefinition::from_yaml(python_patterns).unwrap();
    assert_eq!(definition.id, "python");
    assert_eq!(definition.patterns.api_patterns.len(), 1);
    assert_eq!(definition.cross_language_patterns.api_patterns.len(), 1);
    
    // Test cross-language pattern matching
    let cross_pattern = &definition.cross_language_patterns.api_patterns[0];
    assert_eq!(cross_pattern.confidence, 0.90);
    assert_eq!(cross_pattern.capture_groups.len(), 2);
}

#[test]
fn test_rust_api_patterns() {
    let rust_patterns = r#"
language: rust
version: "1.70"
patterns:
  api_calls:
    - query: '(call_expression function: (scoped_identifier path: (identifier) @reqwest_mod name: (identifier) @method) arguments: (arguments (string_literal) @endpoint)) (#match? @reqwest_mod "^reqwest$")'
      confidence: 0.95
cross_language_patterns:
  api_calls:
    - pattern: 'reqwest::[^:]*::(get|post|put|delete)\s*\(\s*"([^"]+)"'
      confidence: 0.85
      capture_groups:
        1: "http_method"
        2: "api_endpoint"
"#;
    
    let definition = LanguageDefinition::from_yaml(rust_patterns).unwrap();
    assert_eq!(definition.id, "rust");
    assert_eq!(definition.patterns.api_patterns.len(), 1);
    assert_eq!(definition.cross_language_patterns.api_patterns.len(), 1);
}

#[test]
fn test_endpoint_correlator_basic() {
    let mut correlator = EndpointCorrelator::new();
    
    // Create mock symbols representing API endpoints
    let server_symbol = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "getUserById".to_string(),
        qualified_name: "api.getUserById".to_string(),
        kind: "function".to_string(),
        file_path: "server.js".to_string(),
        line: 10,
        column: 0,
        signature: Some("app.get('/users/:id', getUserById)".to_string()),
        ..Default::default()
    };
    
    let client_symbol = UniversalSymbol {
        id: Some(2),
        project_id: 1,
        language_id: 2,
        name: "fetchUser".to_string(),
        qualified_name: "client.fetchUser".to_string(),
        kind: "function".to_string(),
        file_path: "client.js".to_string(),
        line: 5,
        column: 0,
        signature: Some("fetch('/users/123')".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![server_symbol, client_symbol];
    let endpoints = correlator.extract_endpoints(&symbols).unwrap();
    
    assert_eq!(endpoints.len(), 2);
    
    // Check server endpoint
    let server_endpoint = endpoints.iter().find(|e| e.is_definition).unwrap();
    assert_eq!(server_endpoint.method, "GET");
    assert_eq!(server_endpoint.path, "/users/:id");
    assert_eq!(server_endpoint.framework, Some("Express".to_string()));
    
    // Check client call
    let client_call = endpoints.iter().find(|e| !e.is_definition).unwrap();
    assert_eq!(client_call.method, "GET");
    assert_eq!(client_call.path, "/users/123");
    assert_eq!(client_call.framework, Some("Fetch API".to_string()));
    
    // Test correlation
    let correlations = correlator.find_correlations(1).unwrap();
    assert_eq!(correlations.len(), 1);
    
    let correlation = &correlations[0];
    assert_eq!(correlation.client_call.path, "/users/123");
    assert_eq!(correlation.server_endpoint.path, "/users/:id");
    assert!(matches!(correlation.correlation_type, CorrelationType::PatternMatch));
    assert!(correlation.confidence > 0.8);
}

#[test]
fn test_endpoint_correlator_exact_match() {
    let mut correlator = EndpointCorrelator::new();
    
    let server_symbol = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "getUsers".to_string(),
        qualified_name: "api.getUsers".to_string(),
        kind: "function".to_string(),
        file_path: "server.py".to_string(),
        line: 15,
        column: 0,
        signature: Some("@app.route('/api/users', methods=['GET'])".to_string()),
        ..Default::default()
    };
    
    let client_symbol = UniversalSymbol {
        id: Some(2),
        project_id: 1,
        language_id: 2,
        name: "fetchAllUsers".to_string(),
        qualified_name: "client.fetchAllUsers".to_string(),
        kind: "function".to_string(),
        file_path: "client.py".to_string(),
        line: 8,
        column: 0,
        signature: Some("requests.get('/api/users')".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![server_symbol, client_symbol];
    correlator.extract_endpoints(&symbols).unwrap();
    
    let correlations = correlator.find_correlations(1).unwrap();
    assert_eq!(correlations.len(), 1);
    
    let correlation = &correlations[0];
    assert!(matches!(correlation.correlation_type, CorrelationType::ExactMatch));
    assert!(correlation.confidence >= 0.95);
}

#[test]
fn test_endpoint_correlator_framework_detection() {
    let mut correlator = EndpointCorrelator::new();
    
    // FastAPI endpoint
    let fastapi_symbol = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "create_user".to_string(),
        qualified_name: "api.create_user".to_string(),
        kind: "function".to_string(),
        file_path: "main.py".to_string(),
        line: 20,
        column: 0,
        signature: Some("@app.post('/users')".to_string()),
        ..Default::default()
    };
    
    // Axios client call
    let axios_symbol = UniversalSymbol {
        id: Some(2),
        project_id: 1,
        language_id: 2,
        name: "createUser".to_string(),
        qualified_name: "client.createUser".to_string(),
        kind: "function".to_string(),
        file_path: "client.ts".to_string(),
        line: 12,
        column: 0,
        signature: Some("axios.post('/users', userData)".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![fastapi_symbol, axios_symbol];
    let endpoints = correlator.extract_endpoints(&symbols).unwrap();
    
    let fastapi_endpoint = endpoints.iter().find(|e| e.framework == Some("FastAPI".to_string())).unwrap();
    assert_eq!(fastapi_endpoint.method, "POST");
    assert_eq!(fastapi_endpoint.path, "/users");
    
    let axios_call = endpoints.iter().find(|e| e.framework == Some("Axios".to_string())).unwrap();
    assert_eq!(axios_call.method, "POST");
    assert_eq!(axios_call.path, "/users");
    
    let statistics = correlator.get_statistics(1);
    assert_eq!(statistics.total_endpoints, 2);
    assert_eq!(statistics.client_calls, 1);
    assert_eq!(statistics.server_endpoints, 1);
    assert_eq!(statistics.frameworks, 2);
    assert!(statistics.framework_names.contains(&"FastAPI".to_string()));
    assert!(statistics.framework_names.contains(&"Axios".to_string()));
}

#[test]
fn test_pattern_engine_with_api_patterns() {
    let temp_dir = TempDir::new().unwrap();
    
    // Create multiple pattern files
    let ts_patterns = r#"
language: typescript
version: "5.0"
patterns:
  api_calls:
    - query: 'fetch'
      confidence: 0.9
"#;
    
    let py_patterns = r#"
language: python
version: "3.12"
patterns:
  api_calls:
    - query: 'requests'
      confidence: 0.9
"#;
    
    fs::write(temp_dir.path().join("typescript.yaml"), ts_patterns).unwrap();
    fs::write(temp_dir.path().join("python.yaml"), py_patterns).unwrap();
    
    let mut engine = PatternEngine::new(Some(temp_dir.path().to_path_buf())).unwrap();
    
    // Test TypeScript patterns
    let ts_patterns = engine.get_patterns("typescript").unwrap();
    assert_eq!(ts_patterns.api_patterns.len(), 1);
    
    // Test Python patterns
    let py_patterns = engine.get_patterns("python").unwrap();
    assert_eq!(py_patterns.api_patterns.len(), 1);
    
    // Test hot reload
    let updated_ts_patterns = r#"
language: typescript
version: "5.1"
patterns:
  api_calls:
    - query: 'fetch'
      confidence: 0.9
    - query: 'axios'
      confidence: 0.95
"#;
    
    fs::write(temp_dir.path().join("typescript.yaml"), updated_ts_patterns).unwrap();
    engine.reload_patterns().unwrap();
    
    let reloaded_ts_patterns = engine.get_patterns("typescript").unwrap();
    assert_eq!(reloaded_ts_patterns.api_patterns.len(), 2);
}

#[test]
fn test_websocket_pattern_extraction() {
    let mut correlator = EndpointCorrelator::new();
    
    let ws_symbol = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "connectWebSocket".to_string(),
        qualified_name: "client.connectWebSocket".to_string(),
        kind: "function".to_string(),
        file_path: "websocket.js".to_string(),
        line: 5,
        column: 0,
        signature: Some("new WebSocket('ws://localhost:8080/ws')".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![ws_symbol];
    let endpoints = correlator.extract_endpoints(&symbols).unwrap();
    
    // WebSocket connections should be extracted as API endpoints
    assert!(!endpoints.is_empty());
    
    // The endpoint should contain WebSocket URL information
    let ws_endpoint = &endpoints[0];
    assert!(ws_endpoint.path.contains("ws://localhost:8080/ws") || 
            ws_endpoint.file_path.contains("websocket"));
}

#[test]
fn test_cross_language_correlation() {
    let mut correlator = EndpointCorrelator::new();
    
    // Rust server endpoint (Axum)
    let rust_server = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "get_user".to_string(),
        qualified_name: "server::handlers::get_user".to_string(),
        kind: "function".to_string(),
        file_path: "src/handlers.rs".to_string(),
        line: 25,
        column: 0,
        signature: Some("Router::new().get('/api/v1/users/:id', get_user)".to_string()),
        ..Default::default()
    };
    
    // Python client call
    let python_client = UniversalSymbol {
        id: Some(2),
        project_id: 1,
        language_id: 2,
        name: "fetch_user_data".to_string(),
        qualified_name: "client.fetch_user_data".to_string(),
        kind: "function".to_string(),
        file_path: "client.py".to_string(),
        line: 10,
        column: 0,
        signature: Some("requests.get('http://localhost:3000/api/v1/users/42')".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![rust_server, python_client];
    correlator.extract_endpoints(&symbols).unwrap();
    
    let correlations = correlator.find_correlations(1).unwrap();
    
    // Should find correlation between Rust server and Python client
    assert!(!correlations.is_empty());
    
    let correlation = &correlations[0];
    assert!(correlation.server_endpoint.file_path.contains("handlers.rs"));
    assert!(correlation.client_call.file_path.contains("client.py"));
    
    // Should be a pattern match due to :id parameter
    assert!(matches!(correlation.correlation_type, CorrelationType::PatternMatch));
}