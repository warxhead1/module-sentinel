use module_sentinel_parser::patterns::{Pattern, LanguageDefinition, PatternEngine};
use std::collections::HashMap;

#[test]
fn test_load_yaml_pattern() {
    let yaml = r#"
language: rust
version: "1.0"
patterns:
  function:
    - query: '(function_item name: (identifier) @name)'
      confidence: 0.9
  class:
    - query: '(struct_item name: (type_identifier) @name)'
      confidence: 0.8
"#;
    
    let definition = LanguageDefinition::from_yaml(yaml).unwrap();
    assert_eq!(definition.id, "rust");
    assert_eq!(definition.version, "1.0");
    assert_eq!(definition.patterns.function_patterns.len(), 1);
    assert_eq!(definition.patterns.class_patterns.len(), 1);
}

#[test]
fn test_pattern_matching() {
    let pattern = Pattern {
        query: "(function_item name: (identifier) @name)".to_string(),
        captures: HashMap::new(),
        confidence: 0.9,
        min_version: None,
        max_version: None,
    };
    
    let source = "fn calculate(x: i32) -> i32 { x * 2 }";
    let matches = pattern.find_matches("rust", source).unwrap();
    
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].capture_name, "name");
    assert_eq!(matches[0].text, "calculate");
}

#[test]
fn test_cross_language_patterns() {
    let yaml = r#"
language: typescript
version: "4.0"
cross_language_patterns:
  subprocess:
    - pattern: "spawn\\s*\\(\\s*[\"']([^\"']+)[\"']"
      confidence: 0.9
      capture_groups:
        1: target_executable
  api_calls:
    - pattern: "fetch\\s*\\(\\s*[\"']([^\"']+)[\"']"
      confidence: 0.8
      capture_groups:
        1: api_endpoint
"#;
    
    let definition = LanguageDefinition::from_yaml(yaml).unwrap();
    assert_eq!(definition.cross_language_patterns.subprocess_patterns.len(), 1);
    assert_eq!(definition.cross_language_patterns.api_patterns.len(), 1);
}

#[test]
fn test_pattern_hot_reload() {
    use tempfile::TempDir;
    use std::fs;
    
    let temp_dir = TempDir::new().unwrap();
    let pattern_file = temp_dir.path().join("rust.yaml");
    
    // Write initial pattern
    let initial_yaml = r#"
language: rust
version: "1.0"
patterns:
  function:
    - query: '(function_item name: (identifier) @name)'
"#;
    fs::write(&pattern_file, initial_yaml).unwrap();
    
    // Load pattern engine
    let mut engine = PatternEngine::new(Some(temp_dir.path().to_path_buf())).unwrap();
    let patterns = engine.get_patterns("rust").unwrap();
    assert_eq!(patterns.function_patterns.len(), 1);
    
    // Update pattern file
    let updated_yaml = r#"
language: rust
version: "1.1"
patterns:
  function:
    - query: '(function_item name: (identifier) @name)'
    - query: '(async_function name: (identifier) @name)'
"#;
    fs::write(&pattern_file, updated_yaml).unwrap();
    
    // Trigger reload
    engine.reload_patterns().unwrap();
    let updated_patterns = engine.get_patterns("rust").unwrap();
    assert_eq!(updated_patterns.function_patterns.len(), 2);
}

#[test]
fn test_pattern_version_constraints() {
    let pattern = Pattern {
        query: "(async_function)".to_string(),
        captures: HashMap::new(),
        confidence: 0.9,
        min_version: Some("1.39".to_string()),
        max_version: Some("2.0".to_string()),
    };
    
    assert!(pattern.is_compatible_with_version("1.40"));
    assert!(pattern.is_compatible_with_version("1.75"));
    assert!(!pattern.is_compatible_with_version("1.38"));
    assert!(!pattern.is_compatible_with_version("2.1"));
}

// Test pattern confidence scoring
#[test]
fn test_pattern_confidence() {
    let high_confidence = Pattern {
        query: "(function_item)".to_string(),
        captures: HashMap::new(),
        confidence: 0.95,
        min_version: None,
        max_version: None,
    };
    
    let low_confidence = Pattern {
        query: "(identifier)".to_string(),
        captures: HashMap::new(),
        confidence: 0.5,
        min_version: None,
        max_version: None,
    };
    
    assert!(high_confidence.confidence > low_confidence.confidence);
    assert!(high_confidence.is_high_confidence());
    assert!(!low_confidence.is_high_confidence());
}

// Test pattern capture processing
#[test]
fn test_capture_processors() {
    use module_sentinel_parser::patterns::CaptureProcessor;
    
    let mut captures = HashMap::new();
    captures.insert("name".to_string(), CaptureProcessor::ExtractIdentifier);
    captures.insert("path".to_string(), CaptureProcessor::ExtractModulePath);
    
    let pattern = Pattern {
        query: "(import_statement source: (string) @path)".to_string(),
        captures,
        confidence: 0.9,
        min_version: None,
        max_version: None,
    };
    
    // Test that capture processors are applied
    let processed = pattern.process_capture("path", "./module");
    assert_eq!(processed, "module");
}

// Test composite patterns
#[test]
fn test_composite_patterns() {
    let yaml = r#"
language: typescript
version: "4.0"
patterns:
  class_with_interface:
    composite: true
    requires:
      - class_declaration
      - implements_clause
    query: |
      (class_declaration
        name: (identifier) @class_name
        interfaces: (implements_clause
          (identifier) @interface_name))
"#;
    
    let definition = LanguageDefinition::from_yaml(yaml).unwrap();
    let composite = &definition.patterns.composite_patterns["class_with_interface"];
    assert!(composite.is_composite);
    assert_eq!(composite.requires.len(), 2);
}