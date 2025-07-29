use crate::database::models::UniversalSymbol;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

// Compile regex patterns once at startup for performance
static TEST_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(test_|_test|test|spec_|_spec|should_|assert|expect|mock|stub)").unwrap()
});

static ASYNC_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(async|await|promise|future|stream|observable)").unwrap()
});

static ERROR_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(error|exception|fail|panic|throw|catch|try|result<)").unwrap()
});

static CONFIG_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(config|setting|option|preference|env|properties)").unwrap()
});

static HTTP_METHOD_PATTERN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(@get|@post|@put|@patch|@delete|@head|@options)").unwrap()
});

/// Extract semantic tags from a symbol based on its properties and context
pub fn extract_semantic_tags(symbol: &UniversalSymbol) -> Vec<String> {
    let mut tags = Vec::new();
    
    // Extract tags based on symbol kind
    match symbol.kind.as_str() {
        "function" | "method" => {
            extract_function_tags(&mut tags, symbol);
        }
        "class" | "struct" => {
            extract_class_tags(&mut tags, symbol);
        }
        "enum" => {
            tags.push("enum".to_string());
            extract_type_tags(&mut tags, symbol);
        }
        "interface" | "trait" => {
            tags.push("interface".to_string());
            extract_interface_tags(&mut tags, symbol);
        }
        "variable" | "constant" | "field" => {
            extract_variable_tags(&mut tags, symbol);
        }
        "type" | "typedef" | "type_alias" => {
            tags.push("type_definition".to_string());
            extract_type_tags(&mut tags, symbol);
        }
        "module" | "namespace" => {
            tags.push("module".to_string());
        }
        _ => {}
    }
    
    // Add context-based tags from file path
    extract_path_tags(&mut tags, &symbol.file_path);
    
    // Add visibility tags
    if let Some(vis) = &symbol.visibility {
        match vis.as_str() {
            "public" => tags.push("public_api".to_string()),
            "private" => tags.push("internal".to_string()),
            "protected" => tags.push("protected".to_string()),
            _ => {}
        }
    }
    
    // Add export/async modifiers
    if symbol.is_exported {
        tags.push("exported".to_string());
    }
    if symbol.is_async {
        tags.push("async".to_string());
    }
    if symbol.is_abstract {
        tags.push("abstract".to_string());
    }
    
    // Check signature for additional patterns
    if let Some(sig) = &symbol.signature {
        extract_signature_tags(&mut tags, sig);
    }
    
    // Remove duplicates while preserving order
    let mut seen = HashSet::new();
    tags.retain(|tag| seen.insert(tag.clone()));
    
    tags
}

fn extract_function_tags(tags: &mut Vec<String>, symbol: &UniversalSymbol) {
    let name_lower = symbol.name.to_lowercase();
    
    // CRUD operations
    if name_lower.starts_with("get") || name_lower.starts_with("fetch") || name_lower.starts_with("find") || name_lower.starts_with("load") || name_lower.starts_with("retrieve") {
        tags.push("data_retrieval".to_string());
    }
    if name_lower.starts_with("create") || name_lower.starts_with("add") || name_lower.starts_with("insert") || name_lower.starts_with("new") || name_lower.starts_with("make") {
        tags.push("data_creation".to_string());
    }
    if name_lower.starts_with("update") || name_lower.starts_with("modify") || name_lower.starts_with("edit") || name_lower.starts_with("patch") || name_lower.starts_with("set") || name_lower.starts_with("change") {
        tags.push("data_update".to_string());
    }
    if name_lower.starts_with("delete") || name_lower.starts_with("remove") || name_lower.starts_with("destroy") || name_lower.starts_with("drop") || name_lower.starts_with("clear") {
        tags.push("data_deletion".to_string());
    }
    
    // Common patterns
    if name_lower.contains("auth") || name_lower.contains("login") || name_lower.contains("logout") || name_lower.contains("signin") || name_lower.contains("signup") {
        tags.push("authentication".to_string());
    }
    if name_lower.contains("permission") || name_lower.contains("authorize") || name_lower.contains("access") {
        tags.push("authorization".to_string());
    }
    if name_lower.contains("validate") || name_lower.contains("check") || name_lower.contains("verify") || name_lower.contains("ensure") || name_lower.contains("assert") {
        tags.push("validation".to_string());
    }
    if name_lower.starts_with("handle") || name_lower.starts_with("process") || name_lower.ends_with("handler") || name_lower.ends_with("processor") {
        tags.push("handler".to_string());
    }
    if name_lower.contains("middleware") {
        tags.push("middleware".to_string());
    }
    
    // Data operations
    if name_lower.contains("query") || name_lower.contains("sql") || name_lower.contains("database") || name_lower.contains("db") {
        tags.push("database_operation".to_string());
    }
    if name_lower.contains("parse") || name_lower.contains("deserialize") || name_lower.contains("unmarshal") || name_lower.contains("decode") {
        tags.push("parsing".to_string());
    }
    if name_lower.contains("serialize") || name_lower.contains("marshal") || name_lower.contains("encode") || name_lower.contains("stringify") {
        tags.push("serialization".to_string());
    }
    if name_lower.contains("transform") || name_lower.contains("convert") || name_lower.contains("map") || name_lower.contains("translate") {
        tags.push("data_transformation".to_string());
    }
    if name_lower.contains("filter") || name_lower.contains("reduce") || name_lower.contains("aggregate") {
        tags.push("data_processing".to_string());
    }
    
    // UI/Rendering
    if name_lower.contains("render") || name_lower.contains("view") || name_lower.contains("display") || name_lower.contains("draw") || name_lower.contains("paint") {
        tags.push("ui_rendering".to_string());
    }
    if name_lower.contains("component") || name_lower.ends_with("component") {
        tags.push("ui_component".to_string());
    }
    
    // Testing
    if TEST_PATTERN.is_match(&name_lower) {
        tags.push("test".to_string());
        
        // Specific test types
        if name_lower.contains("unit") {
            tags.push("unit_test".to_string());
        }
        if name_lower.contains("integration") || name_lower.contains("e2e") {
            tags.push("integration_test".to_string());
        }
        if name_lower.contains("bench") || name_lower.contains("perf") {
            tags.push("performance_test".to_string());
        }
    }
    
    // Async/concurrent operations
    if ASYNC_PATTERN.is_match(&name_lower) {
        tags.push("async_operation".to_string());
    }
    
    // Error handling
    if ERROR_PATTERN.is_match(&name_lower) {
        tags.push("error_handling".to_string());
    }
    
    // Lifecycle methods
    if name_lower.starts_with("init") || name_lower.starts_with("setup") || name_lower.starts_with("configure") || name_lower.starts_with("bootstrap") {
        tags.push("initialization".to_string());
    }
    if name_lower.starts_with("cleanup") || name_lower.starts_with("dispose") || name_lower.starts_with("teardown") || name_lower.starts_with("destroy") || name_lower.starts_with("shutdown") {
        tags.push("cleanup".to_string());
    }
    
    // Event handling
    if name_lower.starts_with("on") || name_lower.ends_with("listener") || name_lower.contains("event") || name_lower.contains("emit") || name_lower.contains("trigger") {
        tags.push("event_handling".to_string());
    }
    
    // Caching
    if name_lower.contains("cache") || name_lower.contains("memoize") || name_lower.contains("store") && name_lower.contains("memory") {
        tags.push("caching".to_string());
    }
    
    // Logging/Monitoring
    if name_lower.contains("log") || name_lower.contains("trace") || name_lower.contains("debug") || name_lower.contains("monitor") {
        tags.push("logging".to_string());
    }
    
    // Configuration
    if CONFIG_PATTERN.is_match(&name_lower) {
        tags.push("configuration".to_string());
    }
    
    // Design patterns in function names
    if name_lower.contains("factory") || (name_lower.starts_with("create") && name_lower.ends_with("factory")) {
        tags.push("factory_pattern".to_string());
    }
    if name_lower.contains("builder") || name_lower.ends_with("builder") {
        tags.push("builder_pattern".to_string());
    }
    if name_lower.contains("observer") || name_lower.contains("subscribe") || name_lower.contains("notify") {
        tags.push("observer_pattern".to_string());
    }
    if name_lower.contains("singleton") || name_lower.contains("instance") && name_lower.contains("get") {
        tags.push("singleton_pattern".to_string());
    }
    if name_lower.contains("strategy") || name_lower.contains("algorithm") {
        tags.push("strategy_pattern".to_string());
    }
    if name_lower.contains("adapter") || name_lower.contains("wrapper") {
        tags.push("adapter_pattern".to_string());
    }
}

fn extract_class_tags(tags: &mut Vec<String>, symbol: &UniversalSymbol) {
    let name_lower = symbol.name.to_lowercase();
    
    // Common class patterns
    if name_lower.contains("controller") {
        tags.push("controller".to_string());
        tags.push("mvc_pattern".to_string());
    }
    if name_lower.contains("service") || name_lower.ends_with("svc") {
        tags.push("service".to_string());
        tags.push("service_layer".to_string());
    }
    if name_lower.contains("repository") || name_lower.contains("dao") {
        tags.push("repository".to_string());
        tags.push("data_access_layer".to_string());
    }
    if name_lower.contains("model") || name_lower.contains("entity") {
        tags.push("data_model".to_string());
    }
    if name_lower.contains("dto") || name_lower.contains("payload") || name_lower.contains("request") || name_lower.contains("response") {
        tags.push("data_transfer_object".to_string());
    }
    if name_lower.contains("middleware") {
        tags.push("middleware".to_string());
    }
    if name_lower.contains("exception") || name_lower.contains("error") {
        tags.push("error_type".to_string());
    }
    if name_lower.contains("manager") {
        tags.push("manager".to_string());
    }
    if name_lower.contains("factory") {
        tags.push("factory_pattern".to_string());
    }
    if name_lower.contains("builder") {
        tags.push("builder_pattern".to_string());
    }
    if name_lower.contains("singleton") {
        tags.push("singleton_pattern".to_string());
    }
    if name_lower.contains("observer") || name_lower.contains("listener") {
        tags.push("observer_pattern".to_string());
    }
    if name_lower.contains("strategy") {
        tags.push("strategy_pattern".to_string());
    }
    if name_lower.contains("decorator") || name_lower.contains("wrapper") {
        tags.push("decorator_pattern".to_string());
    }
    if name_lower.contains("adapter") {
        tags.push("adapter_pattern".to_string());
    }
    if name_lower.contains("facade") {
        tags.push("facade_pattern".to_string());
    }
    if name_lower.contains("proxy") {
        tags.push("proxy_pattern".to_string());
    }
    
    // UI Components
    if name_lower.contains("component") || name_lower.contains("widget") || name_lower.contains("view") {
        tags.push("ui_component".to_string());
    }
    if name_lower.contains("page") || name_lower.contains("screen") {
        tags.push("ui_page".to_string());
    }
    if name_lower.contains("dialog") || name_lower.contains("modal") {
        tags.push("ui_dialog".to_string());
    }
    
    // Testing
    if TEST_PATTERN.is_match(&name_lower) {
        tags.push("test_class".to_string());
    }
    
    // Configuration
    if CONFIG_PATTERN.is_match(&name_lower) {
        tags.push("configuration".to_string());
    }
}

fn extract_interface_tags(tags: &mut Vec<String>, symbol: &UniversalSymbol) {
    let name_lower = symbol.name.to_lowercase();
    
    if name_lower.starts_with("i") && name_lower.len() > 1 && name_lower.chars().nth(1).unwrap().is_uppercase() {
        // Common interface naming convention
        tags.push("interface_contract".to_string());
    }
    
    if name_lower.contains("repository") {
        tags.push("repository_interface".to_string());
    }
    if name_lower.contains("service") {
        tags.push("service_interface".to_string());
    }
    if name_lower.contains("handler") {
        tags.push("handler_interface".to_string());
    }
    if name_lower.contains("observable") || name_lower.contains("observer") {
        tags.push("observer_pattern".to_string());
    }
}

fn extract_type_tags(tags: &mut Vec<String>, symbol: &UniversalSymbol) {
    let name_lower = symbol.name.to_lowercase();
    
    if name_lower.contains("error") || name_lower.contains("exception") {
        tags.push("error_type".to_string());
    }
    if name_lower.contains("result") || name_lower.contains("option") || name_lower.contains("maybe") {
        tags.push("result_type".to_string());
    }
    if name_lower.contains("config") || name_lower.contains("settings") {
        tags.push("config_type".to_string());
    }
    if name_lower.contains("state") {
        tags.push("state_type".to_string());
    }
    if name_lower.contains("props") || name_lower.contains("properties") {
        tags.push("properties_type".to_string());
    }
}

fn extract_variable_tags(tags: &mut Vec<String>, symbol: &UniversalSymbol) {
    let name_lower = symbol.name.to_lowercase();
    
    if name_lower.contains("config") || name_lower.contains("settings") {
        tags.push("configuration".to_string());
    }
    if name_lower.contains("const") || symbol.name.chars().all(|c| !c.is_alphabetic() || c.is_uppercase()) {
        tags.push("constant".to_string());
    }
    if name_lower.contains("env") {
        tags.push("environment_variable".to_string());
    }
    if name_lower.contains("flag") || name_lower.starts_with("is_") || name_lower.starts_with("has_") || name_lower.starts_with("should_") {
        tags.push("flag".to_string());
    }
    if name_lower.contains("count") || name_lower.contains("total") || name_lower.contains("num") {
        tags.push("counter".to_string());
    }
    if name_lower.contains("cache") {
        tags.push("cache_storage".to_string());
    }
}

fn extract_path_tags(tags: &mut Vec<String>, file_path: &str) {
    let path_lower = file_path.to_lowercase();
    
    // Test directories
    if path_lower.contains("/test/") || path_lower.contains("/tests/") || path_lower.contains("/__tests__/") ||
       path_lower.contains("/spec/") || path_lower.contains(".test.") || path_lower.contains(".spec.") {
        tags.push("test_code".to_string());
    }
    
    // Source directories
    if path_lower.contains("/src/") || path_lower.contains("/lib/") {
        tags.push("source_code".to_string());
    }
    
    // Config files
    if path_lower.contains("/config/") || path_lower.contains(".config.") || path_lower.ends_with("config.js") ||
       path_lower.ends_with("config.ts") || path_lower.ends_with("config.json") {
        tags.push("configuration_file".to_string());
    }
    
    // API/Routes
    if path_lower.contains("/api/") || path_lower.contains("/routes/") || path_lower.contains("/endpoints/") {
        tags.push("api_code".to_string());
    }
    
    // Controllers
    if path_lower.contains("/controllers/") || path_lower.contains(".controller.") {
        tags.push("controller_file".to_string());
    }
    
    // Services
    if path_lower.contains("/services/") || path_lower.contains(".service.") {
        tags.push("service_file".to_string());
    }
    
    // Models
    if path_lower.contains("/models/") || path_lower.contains(".model.") {
        tags.push("model_file".to_string());
    }
    
    // Utils/Helpers
    if path_lower.contains("/utils/") || path_lower.contains("/helpers/") || path_lower.contains("/common/") {
        tags.push("utility_code".to_string());
    }
    
    // UI Components
    if path_lower.contains("/components/") || path_lower.contains("/views/") || path_lower.contains("/pages/") {
        tags.push("ui_code".to_string());
    }
    
    // Database
    if path_lower.contains("/migrations/") || path_lower.contains("/seeds/") || path_lower.contains("/db/") {
        tags.push("database_code".to_string());
    }
}

fn extract_signature_tags(tags: &mut Vec<String>, signature: &str) {
    // HTTP decorators/annotations
    if HTTP_METHOD_PATTERN.is_match(signature) {
        tags.push("http_endpoint".to_string());
        
        if signature.contains("@Get") || signature.contains("@GET") {
            tags.push("http_get".to_string());
        }
        if signature.contains("@Post") || signature.contains("@POST") {
            tags.push("http_post".to_string());
        }
        if signature.contains("@Put") || signature.contains("@PUT") {
            tags.push("http_put".to_string());
        }
        if signature.contains("@Patch") || signature.contains("@PATCH") {
            tags.push("http_patch".to_string());
        }
        if signature.contains("@Delete") || signature.contains("@DELETE") {
            tags.push("http_delete".to_string());
        }
    }
    
    // Common decorators/annotations
    if signature.contains("@Test") || signature.contains("@test") {
        tags.push("test_method".to_string());
    }
    if signature.contains("@Override") || signature.contains("@override") {
        tags.push("override_method".to_string());
    }
    if signature.contains("@Deprecated") || signature.contains("@deprecated") {
        tags.push("deprecated".to_string());
    }
    if signature.contains("@Async") || signature.contains("@async") {
        tags.push("async_method".to_string());
    }
    if signature.contains("@Transaction") || signature.contains("@transactional") {
        tags.push("transactional".to_string());
    }
    if signature.contains("@Cacheable") || signature.contains("@cache") {
        tags.push("cacheable".to_string());
    }
    
    // Parameter types
    if signature.contains("Request") || signature.contains("HttpRequest") {
        tags.push("http_handler".to_string());
    }
    if signature.contains("Response") || signature.contains("HttpResponse") {
        tags.push("http_handler".to_string());
    }
    if signature.contains("Stream") || signature.contains("Observable") {
        tags.push("stream_processing".to_string());
    }
    if signature.contains("Promise") || signature.contains("Future") || signature.contains("Task<") {
        tags.push("async_operation".to_string());
    }
    if signature.contains("Callback") || signature.contains("Handler") {
        tags.push("callback_handler".to_string());
    }
}

/// Infer the intent/purpose of a symbol based on its properties
pub fn infer_symbol_intent(symbol: &UniversalSymbol) -> Option<String> {
    let name_lower = symbol.name.to_lowercase();
    
    // CRUD operations
    if name_lower.starts_with("get") || name_lower.starts_with("fetch") || name_lower.starts_with("find") || name_lower.starts_with("load") || name_lower.starts_with("retrieve") {
        return Some("retrieve_data".to_string());
    }
    if name_lower.starts_with("create") || name_lower.starts_with("add") || name_lower.starts_with("insert") || name_lower.starts_with("new") {
        return Some("create_resource".to_string());
    }
    if name_lower.starts_with("update") || name_lower.starts_with("modify") || name_lower.starts_with("edit") || name_lower.starts_with("set") {
        return Some("update_resource".to_string());
    }
    if name_lower.starts_with("delete") || name_lower.starts_with("remove") || name_lower.starts_with("destroy") {
        return Some("delete_resource".to_string());
    }
    
    // Authentication/Authorization
    if name_lower.contains("auth") || name_lower.contains("login") || name_lower.contains("logout") {
        return Some("manage_authentication".to_string());
    }
    if name_lower.contains("permission") || name_lower.contains("authorize") {
        return Some("manage_authorization".to_string());
    }
    
    // Validation
    if name_lower.starts_with("validate") || name_lower.starts_with("check") || name_lower.starts_with("verify") || name_lower.starts_with("ensure") {
        return Some("validate_data".to_string());
    }
    
    // Processing
    if name_lower.starts_with("process") || name_lower.starts_with("handle") || name_lower.starts_with("execute") {
        return Some("process_data".to_string());
    }
    
    // Transformation
    if name_lower.starts_with("convert") || name_lower.starts_with("transform") || name_lower.starts_with("map") || name_lower.starts_with("parse") {
        return Some("transform_data".to_string());
    }
    
    // Initialization
    if name_lower.starts_with("init") || name_lower.starts_with("setup") || name_lower.starts_with("configure") || name_lower.starts_with("bootstrap") {
        return Some("initialize_component".to_string());
    }
    
    // Cleanup
    if name_lower.starts_with("cleanup") || name_lower.starts_with("dispose") || name_lower.starts_with("teardown") {
        return Some("cleanup_resources".to_string());
    }
    
    // Testing
    if name_lower.starts_with("test") || name_lower.contains("_test") || name_lower.contains("spec") {
        return Some("test_functionality".to_string());
    }
    
    // Rendering/UI
    if name_lower.starts_with("render") || name_lower.starts_with("draw") || name_lower.starts_with("display") {
        return Some("render_ui".to_string());
    }
    
    // Event handling
    if name_lower.starts_with("on") || name_lower.starts_with("handle") && name_lower.contains("event") {
        return Some("handle_event".to_string());
    }
    
    // Based on symbol kind
    match symbol.kind.as_str() {
        "class" | "struct" => {
            if name_lower.contains("controller") {
                return Some("handle_requests".to_string());
            }
            if name_lower.contains("service") {
                return Some("provide_business_logic".to_string());
            }
            if name_lower.contains("repository") {
                return Some("manage_data_persistence".to_string());
            }
            if name_lower.contains("model") || name_lower.contains("entity") {
                return Some("represent_data".to_string());
            }
        }
        _ => {}
    }
    
    None
}

/// Update a symbol with semantic tags and intent
pub fn enrich_symbol_with_semantics(symbol: &mut UniversalSymbol) {
    // Extract semantic tags
    let tags = extract_semantic_tags(symbol);
    if !tags.is_empty() {
        symbol.semantic_tags = Some(serde_json::to_string(&tags).unwrap_or_default());
    }
    
    // Infer intent
    symbol.intent = infer_symbol_intent(symbol);
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_function_tags() {
        let symbol = UniversalSymbol {
            name: "getUserById".to_string(),
            kind: "function".to_string(),
            is_async: true,
            ..Default::default()
        };
        
        let tags = extract_semantic_tags(&symbol);
        assert!(tags.contains(&"data_retrieval".to_string()));
        assert!(tags.contains(&"async".to_string()));
    }
    
    #[test]
    fn test_extract_class_tags() {
        let symbol = UniversalSymbol {
            name: "UserController".to_string(),
            kind: "class".to_string(),
            ..Default::default()
        };
        
        let tags = extract_semantic_tags(&symbol);
        assert!(tags.contains(&"controller".to_string()));
        assert!(tags.contains(&"mvc_pattern".to_string()));
    }
    
    #[test]
    fn test_path_tags() {
        let symbol = UniversalSymbol {
            name: "testFunction".to_string(),
            kind: "function".to_string(),
            file_path: "/src/tests/user.test.ts".to_string(),
            ..Default::default()
        };
        
        let tags = extract_semantic_tags(&symbol);
        assert!(tags.contains(&"test_code".to_string()));
        assert!(tags.contains(&"test".to_string()));
    }
    
    #[test]
    fn test_intent_inference() {
        let symbol = UniversalSymbol {
            name: "createUser".to_string(),
            kind: "function".to_string(),
            ..Default::default()
        };
        
        let intent = infer_symbol_intent(&symbol);
        assert_eq!(intent, Some("create_resource".to_string()));
    }
}