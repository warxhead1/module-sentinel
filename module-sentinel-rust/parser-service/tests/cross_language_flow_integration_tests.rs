use module_sentinel_parser::analysis::endpoint_correlator::{EndpointCorrelator, APIEndpoint, CorrelationType};
use module_sentinel_parser::analysis::subprocess_detector::{SubprocessDetector, SubprocessCall, ExecutionType};
use module_sentinel_parser::database::models::UniversalSymbol;

/// Integration test demonstrating comprehensive cross-API/flow relationship detection
#[test]
fn test_comprehensive_cross_language_flow_detection() {
    // Setup: Create a realistic multi-language project scenario
    let mut endpoint_correlator = EndpointCorrelator::new();
    let subprocess_detector = SubprocessDetector::new();
    
    // Scenario: TypeScript frontend → Python API → Rust microservice → Database
    let symbols = create_realistic_project_symbols();
    
    // Extract API endpoints
    let endpoints = endpoint_correlator.extract_endpoints(&symbols).unwrap();
    
    // Extract subprocess calls
    let subprocess_calls = subprocess_detector.extract_subprocess_calls(&symbols).unwrap();
    
    // Find cross-language executions
    let cross_lang_executions = subprocess_detector.find_cross_language_executions(&subprocess_calls).unwrap();
    
    // Verify comprehensive detection
    assert_comprehensive_detection(&endpoints, &subprocess_calls, &cross_lang_executions);
    
    // Find correlations
    let correlations = endpoint_correlator.find_correlations(1).unwrap();
    
    // Verify cross-language correlations
    assert_cross_language_correlations(&correlations);
    
    // Test statistics
    let endpoint_stats = endpoint_correlator.get_statistics(1);
    let subprocess_stats = subprocess_detector.get_statistics(&subprocess_calls);
    
    assert_statistics(&endpoint_stats, &subprocess_stats);
}

fn create_realistic_project_symbols() -> Vec<UniversalSymbol> {
    vec![
        // 1. TypeScript Frontend - API calls
        UniversalSymbol {
            id: Some(1),
            project_id: 1,
            language_id: 1,
            name: "fetchUserData".to_string(),
            qualified_name: "frontend.api.fetchUserData".to_string(),
            kind: "function".to_string(),
            file_path: "frontend/src/api/users.ts".to_string(),
            line: 15,
            column: 0,
            signature: Some("const response = await fetch('/api/users/' + userId);".to_string()),
            ..Default::default()
        },
        
        // 2. TypeScript Frontend - WebSocket connection
        UniversalSymbol {
            id: Some(2),
            project_id: 1,
            language_id: 1,
            name: "connectWebSocket".to_string(),
            qualified_name: "frontend.websocket.connectWebSocket".to_string(),
            kind: "function".to_string(),
            file_path: "frontend/src/websocket/connection.ts".to_string(),
            line: 8,
            column: 0,
            signature: Some("const ws = new WebSocket('ws://localhost:8080/ws/users');".to_string()),
            ..Default::default()
        },
        
        // 3. Python API Server - Endpoint definition
        UniversalSymbol {
            id: Some(3),
            project_id: 1,
            language_id: 2,
            name: "get_user".to_string(),
            qualified_name: "api.handlers.get_user".to_string(),
            kind: "function".to_string(),
            file_path: "backend/api/handlers.py".to_string(),
            line: 25,
            column: 0,
            signature: Some("@app.route('/api/users/<int:user_id>', methods=['GET'])".to_string()),
            ..Default::default()
        },
        
        // 4. Python API Server - Calling Rust microservice
        UniversalSymbol {
            id: Some(4),
            project_id: 1,
            language_id: 2,
            name: "call_auth_service".to_string(),
            qualified_name: "api.services.call_auth_service".to_string(),
            kind: "function".to_string(),
            file_path: "backend/api/services.py".to_string(),
            line: 40,
            column: 0,
            signature: Some("response = requests.post('http://auth-service:3000/verify', json=token_data)".to_string()),
            ..Default::default()
        },
        
        // 5. Python API Server - Subprocess call to data processor
        UniversalSymbol {
            id: Some(5),
            project_id: 1,
            language_id: 2,
            name: "process_user_data".to_string(),
            qualified_name: "api.processors.process_user_data".to_string(),
            kind: "function".to_string(),
            file_path: "backend/api/processors.py".to_string(),
            line: 60,
            column: 0,
            signature: Some("subprocess.run(['python', 'scripts/data_processor.py', '--user-id', str(user_id)])".to_string()),
            ..Default::default()
        },
        
        // 6. Rust Microservice - Auth endpoint
        UniversalSymbol {
            id: Some(6),
            project_id: 1,
            language_id: 3,
            name: "verify_token".to_string(),
            qualified_name: "auth_service::handlers::verify_token".to_string(),
            kind: "function".to_string(),
            file_path: "auth-service/src/handlers.rs".to_string(),
            line: 35,
            column: 0,
            signature: Some("Router::new().post('/verify', verify_token)".to_string()),
            ..Default::default()
        },
        
        // 7. Rust Microservice - Database call
        UniversalSymbol {
            id: Some(7),
            project_id: 1,
            language_id: 3,
            name: "get_user_permissions".to_string(),
            qualified_name: "auth_service::db::get_user_permissions".to_string(),
            kind: "function".to_string(),
            file_path: "auth-service/src/db.rs".to_string(),
            line: 20,
            column: 0,
            signature: Some("sqlx::query!(\"SELECT permissions FROM users WHERE id = $1\", user_id)".to_string()),
            ..Default::default()
        },
        
        // 8. Rust Microservice - Calling external Python ML service (async)
        UniversalSymbol {
            id: Some(8),
            project_id: 1,
            language_id: 3,
            name: "analyze_behavior".to_string(),
            qualified_name: "auth_service::ml::analyze_behavior".to_string(),
            kind: "function".to_string(),
            file_path: "auth-service/src/ml.rs".to_string(),
            line: 15,
            column: 0,
            signature: Some("Command::new(\"python\").arg(\"ml/behavior_analyzer.py\").arg(&user_data).spawn()".to_string()),
            ..Default::default()
        },
        
        // 9. Node.js Gateway - Proxying requests
        UniversalSymbol {
            id: Some(9),
            project_id: 1,
            language_id: 4,
            name: "proxyToBackend".to_string(),
            qualified_name: "gateway.proxy.proxyToBackend".to_string(),
            kind: "function".to_string(),
            file_path: "gateway/src/proxy.js".to_string(),
            line: 45,
            column: 0,
            signature: Some("app.use('/api', proxy('http://backend:5000'))".to_string()),
            ..Default::default()
        },
        
        // 10. Node.js Gateway - WebSocket forwarding
        UniversalSymbol {
            id: Some(10),
            project_id: 1,
            language_id: 4,
            name: "setupWebSocketProxy".to_string(),
            qualified_name: "gateway.websocket.setupWebSocketProxy".to_string(),
            kind: "function".to_string(),
            file_path: "gateway/src/websocket.js".to_string(),
            line: 20,
            column: 0,
            signature: Some("const upstream = new WebSocket('ws://backend:8080/ws/users');".to_string()),
            ..Default::default()
        },
    ]
}

fn assert_comprehensive_detection(
    endpoints: &[APIEndpoint],
    subprocess_calls: &[SubprocessCall],
    cross_lang_executions: &[module_sentinel_parser::analysis::subprocess_detector::CrossLanguageExecution],
) {
    // Should detect multiple API endpoints
    assert!(endpoints.len() >= 5, "Should detect at least 5 API endpoints, found {}", endpoints.len());
    
    // Should detect both client calls and server endpoints
    let client_calls: Vec<_> = endpoints.iter().filter(|e| !e.is_definition).collect();
    let server_endpoints: Vec<_> = endpoints.iter().filter(|e| e.is_definition).collect();
    
    assert!(client_calls.len() >= 3, "Should detect at least 3 client calls, found {}", client_calls.len());
    assert!(server_endpoints.len() >= 2, "Should detect at least 2 server endpoints, found {}", server_endpoints.len());
    
    // Should detect subprocess calls
    assert!(subprocess_calls.len() >= 2, "Should detect at least 2 subprocess calls, found {}", subprocess_calls.len());
    
    // Should detect cross-language executions
    assert!(cross_lang_executions.len() >= 1, "Should detect at least 1 cross-language execution, found {}", cross_lang_executions.len());
    
    // Check for WebSocket detection
    let websocket_endpoints: Vec<_> = endpoints.iter()
        .filter(|e| e.path.contains("ws://") || e.path.contains("/ws/"))
        .collect();
    assert!(websocket_endpoints.len() >= 1, "Should detect WebSocket connections");
    
    // Check for different execution types
    let async_calls: Vec<_> = subprocess_calls.iter()
        .filter(|c| matches!(c.execution_type, ExecutionType::Asynchronous))
        .collect();
    assert!(!async_calls.is_empty(), "Should detect asynchronous subprocess calls");
}

fn assert_cross_language_correlations(correlations: &[module_sentinel_parser::analysis::endpoint_correlator::EndpointCorrelation]) {
    assert!(correlations.len() >= 2, "Should find at least 2 endpoint correlations, found {}", correlations.len());
    
    // Should find high-confidence correlations
    let high_confidence: Vec<_> = correlations.iter()
        .filter(|c| c.confidence > 0.8)
        .collect();
    assert!(high_confidence.len() >= 1, "Should find at least 1 high-confidence correlation");
    
    // Should find different correlation types
    let exact_matches: Vec<_> = correlations.iter()
        .filter(|c| matches!(c.correlation_type, CorrelationType::ExactMatch))
        .collect();
    let pattern_matches: Vec<_> = correlations.iter()
        .filter(|c| matches!(c.correlation_type, CorrelationType::PatternMatch))
        .collect();
    
    assert!(exact_matches.len() + pattern_matches.len() >= 1, "Should find exact or pattern matches");
}

fn assert_statistics(
    endpoint_stats: &module_sentinel_parser::analysis::endpoint_correlator::EndpointStatistics,
    subprocess_stats: &module_sentinel_parser::analysis::subprocess_detector::SubprocessStatistics,
) {
    // Endpoint statistics
    assert!(endpoint_stats.total_endpoints >= 5, "Should have at least 5 total endpoints");
    assert!(endpoint_stats.frameworks >= 3, "Should detect at least 3 different frameworks");
    assert!(endpoint_stats.framework_names.len() >= 3, "Should identify multiple framework names");
    
    // Should detect various frameworks
    let expected_frameworks = ["Express", "FastAPI", "Axum", "Fetch API", "Axios"];
    let detected_frameworks: Vec<_> = endpoint_stats.framework_names.iter()
        .filter(|name| expected_frameworks.contains(&name.as_str()))
        .collect();
    assert!(detected_frameworks.len() >= 2, "Should detect multiple expected frameworks");
    
    // Subprocess statistics
    assert!(subprocess_stats.total_calls >= 2, "Should have at least 2 subprocess calls");
    assert!(subprocess_stats.unique_languages >= 2, "Should involve at least 2 languages");
    assert!(subprocess_stats.unique_commands >= 1, "Should have at least 1 unique command");
    
    // Should detect different execution patterns
    assert!(subprocess_stats.synchronous_calls + subprocess_stats.asynchronous_calls >= 1, 
           "Should detect execution calls");
}

#[test]
fn test_realistic_microservices_architecture_detection() {
    let mut endpoint_correlator = EndpointCorrelator::new();
    
    // Simulate a microservices architecture with:
    // - API Gateway (Node.js)
    // - User Service (Python/FastAPI)  
    // - Auth Service (Rust/Axum)
    // - Notification Service (Go)
    // - Frontend (TypeScript/React)
    
    let microservices_symbols = vec![
        // API Gateway routing
        UniversalSymbol {
            id: Some(1),
            project_id: 2,
            language_id: 1,
            name: "routeToUserService".to_string(),
            qualified_name: "gateway.routes.routeToUserService".to_string(),
            kind: "function".to_string(),
            file_path: "gateway/routes/users.js".to_string(),
            line: 10,
            column: 0,
            signature: Some("app.use('/users', proxy('http://user-service:8000'))".to_string()),
            ..Default::default()
        },
        
        // User Service endpoint
        UniversalSymbol {
            id: Some(2),
            project_id: 2,
            language_id: 2,
            name: "create_user".to_string(),
            qualified_name: "user_service.api.create_user".to_string(),
            kind: "function".to_string(),
            file_path: "user-service/app/api.py".to_string(),
            line: 30,
            column: 0,
            signature: Some("@app.post('/users')".to_string()),
            ..Default::default()
        },
        
        // User Service calling Auth Service
        UniversalSymbol {
            id: Some(3),
            project_id: 2,
            language_id: 2,
            name: "verify_permissions".to_string(),
            qualified_name: "user_service.auth.verify_permissions".to_string(),
            kind: "function".to_string(),
            file_path: "user-service/app/auth.py".to_string(),
            line: 15,
            column: 0,
            signature: Some("httpx.post('http://auth-service:3000/verify', json=token)".to_string()),
            ..Default::default()
        },
        
        // Auth Service endpoint
        UniversalSymbol {
            id: Some(4),
            project_id: 2,
            language_id: 3,
            name: "verify_token".to_string(),
            qualified_name: "auth_service::handlers::verify_token".to_string(),
            kind: "function".to_string(),
            file_path: "auth-service/src/handlers.rs".to_string(),
            line: 25,
            column: 0,
            signature: Some("Router::new().post('/verify', verify_token)".to_string()),
            ..Default::default()
        },
        
        // Frontend calling Gateway
        UniversalSymbol {
            id: Some(5),
            project_id: 2,
            language_id: 4,
            name: "createUser".to_string(),
            qualified_name: "frontend.api.createUser".to_string(),
            kind: "function".to_string(),
            file_path: "frontend/src/api/users.ts".to_string(),
            line: 20,
            column: 0,
            signature: Some("axios.post('/users', userData)".to_string()),
            ..Default::default()
        },
    ];
    
    let endpoints = endpoint_correlator.extract_endpoints(&microservices_symbols).unwrap();
    let correlations = endpoint_correlator.find_correlations(2).unwrap();
    
    // Should detect service-to-service communication
    assert!(endpoints.len() >= 4, "Should detect endpoints from multiple services");
    assert!(correlations.len() >= 1, "Should find service communication patterns");
    
    // Should identify different frameworks across services
    let stats = endpoint_correlator.get_statistics(2);
    assert!(stats.frameworks >= 3, "Should detect multiple microservice frameworks");
}

#[test] 
fn test_database_and_external_service_integration() {
    let subprocess_detector = SubprocessDetector::new();
    
    // Test detection of database calls and external service integrations
    let integration_symbols = vec![
        // Database migrations
        UniversalSymbol {
            id: Some(1),
            project_id: 3,
            language_id: 1,
            name: "runMigrations".to_string(),
            qualified_name: "db.migrations.runMigrations".to_string(),
            kind: "function".to_string(),
            file_path: "scripts/migrate.js".to_string(),
            line: 5,
            column: 0,
            signature: Some("spawn('psql', ['-f', 'migrations/001_users.sql', process.env.DATABASE_URL])".to_string()),
            ..Default::default()
        },
        
        // External ML service call
        UniversalSymbol {
            id: Some(2),
            project_id: 3,
            language_id: 2,
            name: "analyze_sentiment".to_string(),
            qualified_name: "ml.sentiment.analyze_sentiment".to_string(),
            kind: "function".to_string(),
            file_path: "ml/sentiment_analyzer.py".to_string(),
            line: 15,
            column: 0,
            signature: Some("subprocess.run(['python', 'external/bert_model.py', '--text', text_data])".to_string()),
            ..Default::default()
        },
        
        // Redis cache management
        UniversalSymbol {
            id: Some(3),
            project_id: 3,
            language_id: 3,
            name: "cache_user_session".to_string(),
            qualified_name: "cache::redis::cache_user_session".to_string(),
            kind: "function".to_string(),
            file_path: "cache/src/redis.rs".to_string(),
            line: 40,
            column: 0,
            signature: Some("Command::new(\"redis-cli\").args(&[\"set\", &key, &value])".to_string()),
            ..Default::default()
        },
    ];
    
    let subprocess_calls = subprocess_detector.extract_subprocess_calls(&integration_symbols).unwrap();
    let cross_lang_executions = subprocess_detector.find_cross_language_executions(&subprocess_calls).unwrap();
    
    // Should detect external tool integrations
    assert!(subprocess_calls.len() >= 3, "Should detect database and external service calls");
    
    // Should identify different execution environments
    let stats = subprocess_detector.get_statistics(&subprocess_calls);
    assert!(stats.unique_commands >= 3, "Should detect multiple external commands");
    assert!(stats.unique_languages >= 2, "Should involve multiple languages");
    
    // Should detect cross-language ML pipeline
    assert!(cross_lang_executions.len() >= 1, "Should detect cross-language ML execution");
}