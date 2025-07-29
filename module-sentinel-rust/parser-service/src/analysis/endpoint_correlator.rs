use std::collections::{HashMap, HashSet};
use anyhow::Result;
use regex::Regex;
use serde::{Serialize, Deserialize};
use crate::database::models::UniversalSymbol;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIEndpoint {
    pub id: String,
    pub method: String,
    pub path: String,
    pub file_path: String,
    pub line: u32,
    pub handler_function: Option<String>,
    pub parameters: Vec<String>,
    pub is_definition: bool, // true for server endpoints, false for client calls
    pub confidence: f32,
    pub framework: Option<String>, // Express, Flask, FastAPI, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointCorrelation {
    pub client_call: APIEndpoint,
    pub server_endpoint: APIEndpoint,
    pub confidence: f32,
    pub correlation_type: CorrelationType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CorrelationType {
    ExactMatch,      // Exact URL and method match
    PatternMatch,    // URL pattern match (e.g., /users/:id matches /users/123)
    PrefixMatch,     // Base URL matches
    EnvironmentVar,  // Connected via environment variables
}

pub struct EndpointCorrelator {
    endpoints: HashMap<String, Vec<APIEndpoint>>,
    url_patterns: Vec<Regex>,
}

impl EndpointCorrelator {
    pub fn new() -> Self {
        Self {
            endpoints: HashMap::new(),
            url_patterns: vec![
                // Common URL parameter patterns
                Regex::new(r":\w+").unwrap(),      // Express.js style :id
                Regex::new(r"\{\w+\}").unwrap(),   // FastAPI style {id}
                Regex::new(r"<\w+>").unwrap(),     // Flask style <id>
                Regex::new(r"\$\{\w+\}").unwrap(), // Template literal ${id}
            ],
        }
    }

    /// Extract API endpoints from symbols
    pub fn extract_endpoints(&mut self, symbols: &[UniversalSymbol]) -> Result<Vec<APIEndpoint>> {
        let mut extracted_endpoints = Vec::new();

        for symbol in symbols {
            // Check if this symbol represents an API endpoint
            if let Some(endpoint) = self.symbol_to_endpoint(symbol)? {
                // Store in registry by project
                let project_key = format!("project_{}", symbol.project_id);
                self.endpoints.entry(project_key).or_insert_with(Vec::new).push(endpoint.clone());
                extracted_endpoints.push(endpoint);
            }
        }

        Ok(extracted_endpoints)
    }

    /// Convert a symbol to an API endpoint if applicable
    fn symbol_to_endpoint(&self, symbol: &UniversalSymbol) -> Result<Option<APIEndpoint>> {
        // Check the symbol's kind and signature for API patterns
        if let Some(signature) = &symbol.signature {
            // Server endpoint patterns
            if let Some(endpoint) = self.extract_server_endpoint(symbol, signature)? {
                return Ok(Some(endpoint));
            }

            // Client API call patterns
            if let Some(endpoint) = self.extract_client_call(symbol, signature)? {
                return Ok(Some(endpoint));
            }
        }

        Ok(None)
    }

    /// Extract server endpoint definitions
    fn extract_server_endpoint(&self, symbol: &UniversalSymbol, signature: &str) -> Result<Option<APIEndpoint>> {
        // Express.js patterns
        if let Some(captures) = Regex::new(r#"app\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: captures[1].to_uppercase(),
                path: captures[2].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: Some(symbol.name.clone()),
                parameters: self.extract_url_parameters(&captures[2]),
                is_definition: true,
                confidence: 0.95,
                framework: Some("Express".to_string()),
            }));
        }

        // FastAPI patterns
        if let Some(captures) = Regex::new(r#"@app\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: captures[1].to_uppercase(),
                path: captures[2].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: Some(symbol.name.clone()),
                parameters: self.extract_url_parameters(&captures[2]),
                is_definition: true,
                confidence: 0.95,
                framework: Some("FastAPI".to_string()),
            }));
        }

        // Flask patterns
        if let Some(captures) = Regex::new(r#"@app\.route\s*\(\s*["']([^"']+)["'].*methods\s*=\s*\[["']([^"']+)["']"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: captures[2].to_uppercase(),
                path: captures[1].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: Some(symbol.name.clone()),
                parameters: self.extract_url_parameters(&captures[1]),
                is_definition: true,
                confidence: 0.90,
                framework: Some("Flask".to_string()),
            }));
        }

        // Axum patterns (Rust)
        if let Some(captures) = Regex::new(r#"Router::new\(\)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: captures[1].to_uppercase(),
                path: captures[2].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: Some(symbol.name.clone()),
                parameters: self.extract_url_parameters(&captures[2]),
                is_definition: true,
                confidence: 0.85,
                framework: Some("Axum".to_string()),
            }));
        }

        // Express middleware/proxy patterns
        if let Some(captures) = Regex::new(r#"app\.use\s*\(\s*["']([^"']+)["'].*proxy\s*\(\s*["']([^"']+)["']"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: "PROXY".to_string(),
                path: captures[1].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: Some(symbol.name.clone()),
                parameters: vec![],
                is_definition: true,
                confidence: 0.80,
                framework: Some("Express Proxy".to_string()),
            }));
        }

        Ok(None)
    }

    /// Extract client API calls
    fn extract_client_call(&self, symbol: &UniversalSymbol, signature: &str) -> Result<Option<APIEndpoint>> {
        // fetch() patterns
        if let Some(captures) = Regex::new(r#"fetch\s*\(\s*["'`]([^"'`]+)["'`]"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: "GET".to_string(), // Default method
                path: captures[1].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: None,
                parameters: vec![],
                is_definition: false,
                confidence: 0.90,
                framework: Some("Fetch API".to_string()),
            }));
        }

        // axios patterns
        if let Some(captures) = Regex::new(r#"axios\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: captures[1].to_uppercase(),
                path: captures[2].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: None,
                parameters: vec![],
                is_definition: false,
                confidence: 0.95,
                framework: Some("Axios".to_string()),
            }));
        }

        // requests patterns (Python)
        if let Some(captures) = Regex::new(r#"requests\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: captures[1].to_uppercase(),
                path: captures[2].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: None,
                parameters: vec![],
                is_definition: false,
                confidence: 0.95,
                framework: Some("Requests".to_string()),
            }));
        }

        // reqwest patterns (Rust)
        if let Some(captures) = Regex::new(r#"reqwest::(?:Client::)?(?:get|post|put|delete|patch)\s*\(\s*"([^"]+)""#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: "GET".to_string(), // Would need more sophisticated parsing
                path: captures[1].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: None,
                parameters: vec![],
                is_definition: false,
                confidence: 0.90,
                framework: Some("Reqwest".to_string()),
            }));
        }

        // WebSocket patterns
        if let Some(captures) = Regex::new(r#"new WebSocket\s*\(\s*["'`]([^"'`]+)["'`]"#)?.captures(signature) {
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: "WEBSOCKET".to_string(),
                path: captures[1].to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: None,
                parameters: vec![],
                is_definition: false,
                confidence: 0.95,
                framework: Some("WebSocket".to_string()),
            }));
        }

        // Dynamic fetch patterns (with string concatenation)
        if let Some(captures) = Regex::new(r#"fetch\s*\(\s*["'`]([^"'`]*)\+\s*\w+|fetch\s*\(\s*["'`]([^"'`]+)["'`]\s*\+\s*\w+"#)?.captures(signature) {
            let path = captures.get(1).or(captures.get(2)).map(|m| m.as_str()).unwrap_or("");
            return Ok(Some(APIEndpoint {
                id: format!("{}:{}:{}", symbol.file_path, symbol.line, symbol.column),
                method: "GET".to_string(),
                path: path.to_string(),
                file_path: symbol.file_path.clone(),
                line: symbol.line as u32,
                handler_function: None,
                parameters: vec![],
                is_definition: false,
                confidence: 0.80, // Lower confidence due to dynamic nature
                framework: Some("Fetch API".to_string()),
            }));
        }

        Ok(None)
    }

    /// Extract URL parameters from a path
    fn extract_url_parameters(&self, path: &str) -> Vec<String> {
        let mut parameters = Vec::new();
        
        for pattern in &self.url_patterns {
            for capture in pattern.find_iter(path) {
                parameters.push(capture.as_str().to_string());
            }
        }
        
        parameters
    }

    /// Find correlations between client calls and server endpoints
    pub fn find_correlations(&self, project_id: i32) -> Result<Vec<EndpointCorrelation>> {
        let mut correlations = Vec::new();
        let project_key = format!("project_{}", project_id);
        
        if let Some(endpoints) = self.endpoints.get(&project_key) {
            let (client_calls, server_endpoints): (Vec<_>, Vec<_>) = 
                endpoints.iter().partition(|e| !e.is_definition);

            for client_call in &client_calls {
                for server_endpoint in &server_endpoints {
                    if let Some(correlation) = self.match_endpoints(client_call, server_endpoint)? {
                        correlations.push(correlation);
                    }
                }
            }
        }

        // Sort by confidence (highest first)
        correlations.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());

        Ok(correlations)
    }

    /// Match a client call with a server endpoint
    fn match_endpoints(&self, client: &APIEndpoint, server: &APIEndpoint) -> Result<Option<EndpointCorrelation>> {
        // Method must match
        if client.method != server.method {
            return Ok(None);
        }

        // Extract just the path from client URL (remove hostname, protocol)
        let client_path = self.extract_path_from_url(&client.path);
        let server_path = &server.path;

        // Try different matching strategies
        let correlation_type;
        let confidence;

        // Exact match
        if client_path == *server_path {
            correlation_type = CorrelationType::ExactMatch;
            confidence = 0.95;
        }
        // Pattern match (URL parameters)
        else if self.paths_match_pattern(&client_path, server_path)? {
            correlation_type = CorrelationType::PatternMatch;
            confidence = 0.85;
        }
        // Prefix match (same base path)
        else if client_path.starts_with(&self.extract_base_path(server_path)) ||
                server_path.starts_with(&self.extract_base_path(&client_path)) {
            correlation_type = CorrelationType::PrefixMatch;
            confidence = 0.60;
        }
        else {
            return Ok(None);
        }

        Ok(Some(EndpointCorrelation {
            client_call: client.clone(),
            server_endpoint: server.clone(),
            confidence,
            correlation_type,
        }))
    }

    /// Check if two paths match considering URL parameters
    fn paths_match_pattern(&self, client_path: &str, server_path: &str) -> Result<bool> {
        // Convert server path patterns to regex
        let mut pattern = server_path.to_string();
        
        // Replace common parameter patterns with regex
        pattern = pattern.replace("/:id", r"/\d+");
        pattern = pattern.replace("/{id}", r"/\d+");
        pattern = pattern.replace("/<id>", r"/\d+");
        pattern = pattern.replace("/${id}", r"/\d+");
        
        // More generic parameter replacement
        for url_pattern in &self.url_patterns {
            pattern = url_pattern.replace_all(&pattern, r"[^/]+").to_string();
        }

        let regex = Regex::new(&format!("^{}$", pattern))?;
        Ok(regex.is_match(client_path))
    }

    /// Extract the base path (everything before the first parameter)
    fn extract_base_path(&self, path: &str) -> String {
        for pattern in &self.url_patterns {
            if let Some(m) = pattern.find(path) {
                return path[..m.start()].to_string();
            }
        }
        path.to_string()
    }

    /// Extract just the path portion from a full URL
    fn extract_path_from_url(&self, url: &str) -> String {
        // If it's already just a path (starts with /), return as-is
        if url.starts_with('/') {
            return url.to_string();
        }
        
        // Parse full URLs like http://auth-service:3000/verify
        if let Some(start) = url.find("://") {
            if let Some(path_start) = url[start + 3..].find('/') {
                // Found the path portion after domain
                return url[start + 3 + path_start..].to_string();
            } else {
                // No path after domain, assume root
                return "/".to_string();
            }
        }
        
        // If no protocol, look for domain pattern (host:port/path)
        if let Some(slash_pos) = url.find('/') {
            if url[..slash_pos].contains(':') {
                // Looks like host:port/path
                return url[slash_pos..].to_string();
            }
        }
        
        // Default: return as-is (assume it's already a path)
        url.to_string()
    }

    /// Get all endpoints for a project
    pub fn get_endpoints(&self, project_id: i32) -> Vec<&APIEndpoint> {
        let project_key = format!("project_{}", project_id);
        self.endpoints.get(&project_key).map(|v| v.iter().collect()).unwrap_or_default()
    }

    /// Get statistics about endpoint detection
    pub fn get_statistics(&self, project_id: i32) -> EndpointStatistics {
        let project_key = format!("project_{}", project_id);
        let endpoints = self.endpoints.get(&project_key);
        
        if let Some(endpoints) = endpoints {
            let (client_calls, server_endpoints): (Vec<_>, Vec<_>) = 
                endpoints.iter().partition(|e| !e.is_definition);
            
            let frameworks: HashSet<String> = endpoints.iter()
                .filter_map(|e| e.framework.clone())
                .collect();

            EndpointStatistics {
                total_endpoints: endpoints.len(),
                client_calls: client_calls.len(),
                server_endpoints: server_endpoints.len(),
                frameworks: frameworks.len(),
                framework_names: frameworks.into_iter().collect(),
            }
        } else {
            EndpointStatistics::default()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EndpointStatistics {
    pub total_endpoints: usize,
    pub client_calls: usize,
    pub server_endpoints: usize,
    pub frameworks: usize,
    pub framework_names: Vec<String>,
}

impl Default for EndpointCorrelator {
    fn default() -> Self {
        Self::new()
    }
}