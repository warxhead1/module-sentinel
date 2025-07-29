use module_sentinel_parser::analysis::endpoint_correlator::EndpointCorrelator;
use module_sentinel_parser::analysis::subprocess_detector::SubprocessDetector;
use module_sentinel_parser::database::models::UniversalSymbol;

#[test]
fn test_basic_api_detection() {
    let mut correlator = EndpointCorrelator::new();
    let detector = SubprocessDetector::new();
    
    // Create a simple test symbol
    let symbol = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "fetchData".to_string(),
        qualified_name: "api.fetchData".to_string(),
        kind: "function".to_string(),
        file_path: "test.js".to_string(),
        line: 5,
        column: 0,
        signature: Some("fetch('https://api.example.com/users')".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![symbol];
    
    // Test endpoint extraction
    let endpoints = correlator.extract_endpoints(&symbols).unwrap();
    assert_eq!(endpoints.len(), 1);
    
    let endpoint = &endpoints[0];
    assert_eq!(endpoint.method, "GET");
    assert_eq!(endpoint.path, "https://api.example.com/users");
    assert!(!endpoint.is_definition);
    
    // Test subprocess detection
    let subprocess_calls = detector.extract_subprocess_calls(&symbols).unwrap();
    assert_eq!(subprocess_calls.len(), 0); // No subprocess calls in this example
    
    println!("✅ Basic API detection test passed!");
}

#[test]
fn test_subprocess_detection() {
    let detector = SubprocessDetector::new();
    
    let symbol = UniversalSymbol {
        id: Some(1),
        project_id: 1,
        language_id: 1,
        name: "runScript".to_string(),
        qualified_name: "utils.runScript".to_string(),
        kind: "function".to_string(),
        file_path: "test.py".to_string(),
        line: 10,
        column: 0,
        signature: Some("subprocess.run(['python', 'data_processor.py', '--input', file_path])".to_string()),
        ..Default::default()
    };
    
    let symbols = vec![symbol];
    let subprocess_calls = detector.extract_subprocess_calls(&symbols).unwrap();
    
    assert_eq!(subprocess_calls.len(), 1);
    
    let call = &subprocess_calls[0];
    assert_eq!(call.command, "python");
    assert_eq!(call.language, "python");
    assert_eq!(call.library, "subprocess");
    
    println!("✅ Subprocess detection test passed!");
}

#[test]
fn test_statistics() {
    let mut correlator = EndpointCorrelator::new();
    let detector = SubprocessDetector::new();
    
    let symbols = vec![
        UniversalSymbol {
            id: Some(1),
            project_id: 1,
            language_id: 1,
            name: "fetchUsers".to_string(),
            qualified_name: "api.fetchUsers".to_string(),
            kind: "function".to_string(),
            file_path: "client.js".to_string(),
            line: 5,
            column: 0,
            signature: Some("axios.get('/api/users')".to_string()),
            ..Default::default()
        },
        UniversalSymbol {
            id: Some(2),
            project_id: 1,
            language_id: 2,
            name: "get_users".to_string(),
            qualified_name: "server.get_users".to_string(),
            kind: "function".to_string(),
            file_path: "server.py".to_string(),
            line: 15,
            column: 0,
            signature: Some("@app.route('/api/users', methods=['GET'])".to_string()),
            ..Default::default()
        },
    ];
    
    let endpoints = correlator.extract_endpoints(&symbols).unwrap();
    let subprocess_calls = detector.extract_subprocess_calls(&symbols).unwrap();
    
    // Verify endpoints were extracted correctly
    assert_eq!(endpoints.len(), 2, "Should extract 2 endpoints");
    
    let endpoint_stats = correlator.get_statistics(1);
    let subprocess_stats = detector.get_statistics(&subprocess_calls);
    
    assert_eq!(endpoint_stats.total_endpoints, 2);
    assert_eq!(endpoint_stats.client_calls, 1);
    assert_eq!(endpoint_stats.server_endpoints, 1);
    
    println!("✅ Statistics test passed!");
    println!("  Endpoint stats: {:?}", endpoint_stats);
    println!("  Subprocess stats: {:?}", subprocess_stats);
}