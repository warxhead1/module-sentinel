use regex::Regex;

#[test]
fn test_regex_patterns() {
    // Test singleton patterns
    let instance_pattern = Regex::new(r"(?i)(get_?)?instance").unwrap();
    
    assert!(instance_pattern.is_match("instance"));
    assert!(instance_pattern.is_match("get_instance"));
    assert!(instance_pattern.is_match("getInstance"));
    assert!(instance_pattern.is_match("INSTANCE"));
    
    // Test static pattern
    let static_pattern = Regex::new(r"static.*Self").unwrap();
    assert!(static_pattern.is_match("static Self"));
    assert!(static_pattern.is_match("static mut Self"));
    assert!(static_pattern.is_match("pub fn get_instance() -> &'static Self"));
    
    // Test function patterns
    let fn_pattern = Regex::new(r"fn\s+\w+").unwrap();
    assert!(fn_pattern.is_match("fn test()"));
    assert!(fn_pattern.is_match("pub fn get_instance()"));
    
    // Test specific signature
    let signature = "pub fn get_instance() -> &'static Self";
    println!("Testing signature: '{}'", signature);
    println!("Contains 'static': {}", signature.contains("static"));
    println!("Matches static.*Self: {}", static_pattern.is_match(signature));
}