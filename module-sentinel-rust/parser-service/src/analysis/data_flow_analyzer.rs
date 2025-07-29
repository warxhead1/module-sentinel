use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use shared_types::UniversalSymbol;

/// Tracks how parameters are used across the codebase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterUsagePattern {
    /// Parameter name
    pub param_name: String,
    /// Expected type based on usage
    pub expected_type: Option<String>,
    /// Common initialization patterns
    pub init_patterns: HashMap<String, usize>, // pattern -> count
    /// Files where this pattern appears
    pub occurrences: Vec<UsageOccurrence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageOccurrence {
    pub file_path: String,
    pub line: u32,
    pub function_name: String,
    pub usage_pattern: String,
    pub confidence: f32,
}

/// Represents a potential data flow issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataFlowAnomaly {
    pub severity: AnomalySeverity,
    pub description: String,
    pub expected_pattern: String,
    pub actual_pattern: String,
    pub location: UsageOccurrence,
    pub similar_correct_usages: Vec<UsageOccurrence>,
    pub fix_suggestion: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnomalySeverity {
    Critical,  // Will definitely cause runtime error
    High,      // Likely to cause issues
    Medium,    // Inconsistent with patterns
    Low,       // Minor deviation
}

/// Main data flow analyzer
pub struct DataFlowAnalyzer {
    /// Tracks parameter usage patterns across the codebase
    parameter_patterns: HashMap<String, ParameterUsagePattern>,
    /// Function call graph with parameter info
    call_graph: HashMap<String, Vec<FunctionCall>>,
    /// Type inference engine
    type_hints: HashMap<String, InferredType>,
    /// Track functions that have return types
    functions_with_return_types: std::collections::HashSet<String>,
}

#[derive(Debug, Clone)]
struct FunctionCall {
    caller: String,
    callee: String,
    arguments: Vec<ArgumentInfo>,
    location: (String, u32), // file, line
}

#[derive(Debug, Clone)]
pub struct ArgumentInfo {
    pub param_name: String,
    pub value_type: String,
    pub value_pattern: String, // e.g., "dict with key 'flabberghast'"
}

#[derive(Debug, Clone)]
struct InferredType {
    base_type: String,
    constraints: Vec<String>, // e.g., "must have key 'flabberghast'"
    confidence: f32,
}

impl DataFlowAnalyzer {
    pub fn new() -> Self {
        Self {
            parameter_patterns: HashMap::new(),
            call_graph: HashMap::new(),
            type_hints: HashMap::new(),
            functions_with_return_types: std::collections::HashSet::new(),
        }
    }
    
    /// Add a symbol usage for analysis
    pub fn add_symbol_usage(&mut self, symbol: &UniversalSymbol) {
        // Extract function calls and parameter usage from the symbol
        // This is a simplified version - in reality we'd parse the symbol's body
        if let Some(signature) = &symbol.signature {
            // Track this function in our call graph
            self.call_graph
                .entry(symbol.name.clone())
                .or_insert_with(Vec::new);
            
            // Process the signature to extract useful information
            if signature.contains("->" ) {
                // This is a function with a return type
                self.functions_with_return_types.insert(symbol.name.clone());
            }
        }
    }
    
    /// Find all anomalies without threshold
    pub fn find_all_anomalies(&self) -> Vec<DataFlowAnomaly> {
        self.find_anomalies(0.1) // Default to 10% threshold
    }
    
    /// Get all callers of a specific function
    pub fn get_callers(&self, function_name: &str) -> Vec<&str> {
        let mut callers = Vec::new();
        if let Some(calls) = self.call_graph.get(function_name) {
            for call in calls {
                if !callers.contains(&call.caller.as_str()) {
                    callers.push(&call.caller);
                }
            }
        }
        callers
    }
    
    /// Get all functions called by a specific function
    pub fn get_callees(&self, function_name: &str) -> Vec<&str> {
        let mut callees = Vec::new();
        for (callee, calls) in &self.call_graph {
            for call in calls {
                if call.caller == function_name && !callees.contains(&callee.as_str()) {
                    callees.push(callee);
                }
            }
        }
        callees
    }
    
    /// Get call locations for debugging
    pub fn get_call_locations(&self, function_name: &str) -> Vec<(String, u32)> {
        let mut locations = Vec::new();
        if let Some(calls) = self.call_graph.get(function_name) {
            for call in calls {
                locations.push(call.location.clone());
            }
        }
        locations
    }
    
    /// Get detailed call information including caller-callee relationships
    pub fn get_call_details(&self, function_name: &str) -> Vec<(String, String, String, u32)> {
        let mut details = Vec::new();
        if let Some(calls) = self.call_graph.get(function_name) {
            for call in calls {
                details.push((
                    call.caller.clone(),
                    call.callee.clone(),
                    call.location.0.clone(),
                    call.location.1,
                ));
            }
        }
        details
    }
    
    /// Get inferred type information for a symbol
    pub fn get_inferred_type(&self, symbol_name: &str) -> Option<(String, Vec<String>, f32)> {
        self.type_hints.get(symbol_name).map(|t| {
            (t.base_type.clone(), t.constraints.clone(), t.confidence)
        })
    }
    
    /// Get all symbols with high confidence type inference
    pub fn get_high_confidence_types(&self, min_confidence: f32) -> Vec<(&str, &str, f32)> {
        self.type_hints
            .iter()
            .filter(|(_, t)| t.confidence >= min_confidence)
            .map(|(name, t)| (name.as_str(), t.base_type.as_str(), t.confidence))
            .collect()
    }
    
    /// Check if a type has specific constraints
    pub fn has_constraint(&self, symbol_name: &str, constraint: &str) -> bool {
        self.type_hints
            .get(symbol_name)
            .map(|t| t.constraints.iter().any(|c| c.contains(constraint)))
            .unwrap_or(false)
    }

    /// Analyze a function call and track parameter usage
    pub fn track_function_call(
        &mut self,
        caller: &str,
        callee: &str,
        args: Vec<ArgumentInfo>,
        file_path: &str,
        line: u32,
    ) {
        // Record the call
        let call = FunctionCall {
            caller: caller.to_string(),
            callee: callee.to_string(),
            arguments: args.clone(),
            location: (file_path.to_string(), line),
        };
        
        self.call_graph
            .entry(callee.to_string())
            .or_insert_with(Vec::new)
            .push(call);

        // Update parameter patterns
        for arg in args {
            self.update_parameter_pattern(&arg, callee, file_path, line);
        }
    }

    /// Update usage patterns for a parameter
    fn update_parameter_pattern(
        &mut self,
        arg: &ArgumentInfo,
        function_name: &str,
        file_path: &str,
        line: u32,
    ) {
        let pattern_key = format!("{}::{}", function_name, arg.param_name);
        
        let pattern = self.parameter_patterns
            .entry(pattern_key)
            .or_insert_with(|| ParameterUsagePattern {
                param_name: arg.param_name.clone(),
                expected_type: None,
                init_patterns: HashMap::new(),
                occurrences: Vec::new(),
            });

        // Track the initialization pattern
        *pattern.init_patterns
            .entry(arg.value_pattern.clone())
            .or_insert(0) += 1;

        // Record this occurrence
        pattern.occurrences.push(UsageOccurrence {
            file_path: file_path.to_string(),
            line,
            function_name: function_name.to_string(),
            usage_pattern: arg.value_pattern.clone(),
            confidence: 1.0,
        });

        // Update expected type if we have high confidence
        if pattern.expected_type.is_none() && pattern.occurrences.len() > 3 {
            pattern.expected_type = Some(arg.value_type.clone());
        }
    }

    /// Find anomalies in parameter usage
    pub fn find_anomalies(&self, threshold: f32) -> Vec<DataFlowAnomaly> {
        let mut anomalies = Vec::new();

        for (_param_key, pattern) in &self.parameter_patterns {
            // Find the dominant pattern (95% case)
            let total_usages: usize = pattern.init_patterns.values().sum();
            
            for (usage_pattern, count) in &pattern.init_patterns {
                let usage_ratio = *count as f32 / total_usages as f32;
                
                // If this pattern is used less than threshold (e.g., 5%), it's an anomaly
                if usage_ratio < threshold && total_usages > 10 {
                    // Find the dominant pattern
                    let dominant_pattern = pattern.init_patterns
                        .iter()
                        .max_by_key(|(_, c)| *c)
                        .map(|(p, _)| p.clone())
                        .unwrap_or_default();

                    // Find occurrences of this anomalous pattern
                    let anomalous_occurrences: Vec<_> = pattern.occurrences
                        .iter()
                        .filter(|o| o.usage_pattern == *usage_pattern)
                        .cloned()
                        .collect();

                    // Find similar correct usages
                    let correct_examples: Vec<_> = pattern.occurrences
                        .iter()
                        .filter(|o| o.usage_pattern == dominant_pattern)
                        .take(3)
                        .cloned()
                        .collect();

                    for occurrence in anomalous_occurrences {
                        anomalies.push(DataFlowAnomaly {
                            severity: self.calculate_severity(usage_ratio, usage_pattern),
                            description: format!(
                                "Parameter '{}' is initialized differently than {}% of other usages",
                                pattern.param_name,
                                ((1.0 - threshold) * 100.0) as u32
                            ),
                            expected_pattern: dominant_pattern.clone(),
                            actual_pattern: usage_pattern.clone(),
                            location: occurrence,
                            similar_correct_usages: correct_examples.clone(),
                            fix_suggestion: self.generate_fix_suggestion(
                                usage_pattern,
                                &dominant_pattern,
                            ),
                        });
                    }
                }
            }
        }

        anomalies
    }

    /// Calculate severity based on the type of anomaly
    fn calculate_severity(&self, usage_ratio: f32, pattern: &str) -> AnomalySeverity {
        // Critical: Missing required keys/fields or data without expected structure
        if pattern.contains("missing") || pattern.contains("undefined") || pattern.contains("without") {
            return AnomalySeverity::Critical;
        }
        
        // High: Wrong type or very rare pattern
        if usage_ratio < 0.01 {
            return AnomalySeverity::High;
        }
        
        // Medium: Uncommon pattern
        if usage_ratio < 0.05 {
            return AnomalySeverity::Medium;
        }
        
        // Low: Minor deviation
        AnomalySeverity::Low
    }

    /// Generate fix suggestion based on patterns
    fn generate_fix_suggestion(&self, wrong: &str, correct: &str) -> Option<String> {
        // Example: dict missing key
        if wrong.contains("dict without") && correct.contains("dict with key") {
            if let Some(key) = extract_dict_key(correct) {
                return Some(format!("Add '{}' key to the dictionary", key));
            }
        }
        
        // Example: wrong type
        if wrong.contains("type:") && correct.contains("type:") {
            let wrong_type = extract_type(wrong);
            let correct_type = extract_type(correct);
            return Some(format!("Change type from {} to {}", wrong_type, correct_type));
        }
        
        None
    }

    /// Analyze type flow through the codebase
    pub fn analyze_type_flow(&mut self, symbols: &[UniversalSymbol]) {
        // Build type constraints from function signatures and usage
        for symbol in symbols {
            if let Some(return_type) = &symbol.return_type {
                // Track what types flow where
                self.type_hints.insert(
                    symbol.qualified_name.clone(),
                    InferredType {
                        base_type: return_type.clone(),
                        constraints: self.infer_constraints(symbol),
                        confidence: 0.9,
                    },
                );
            }
        }
    }

    /// Infer constraints from usage patterns
    fn infer_constraints(&self, symbol: &UniversalSymbol) -> Vec<String> {
        let mut constraints = Vec::new();
        
        // Look at how this symbol is used
        if let Some(calls) = self.call_graph.get(&symbol.qualified_name) {
            // Analyze argument patterns to infer constraints
            let mut common_patterns = HashMap::new();
            
            for call in calls {
                for arg in &call.arguments {
                    *common_patterns.entry(&arg.value_pattern).or_insert(0) += 1;
                }
            }
            
            // Extract constraints from common patterns
            for (pattern, count) in common_patterns {
                if count > calls.len() / 2 {
                    // This is a common pattern, likely a constraint
                    constraints.push(pattern.clone());
                }
            }
        }
        
        constraints
    }
}

// Helper functions
fn extract_dict_key(pattern: &str) -> Option<&str> {
    // Extract key from pattern like "dict with key 'flabberghast'"
    pattern.split("'").nth(1)
}

fn extract_type(pattern: &str) -> &str {
    // Extract type from pattern like "type: dict"
    pattern.split(':').nth(1).map(str::trim).unwrap_or("unknown")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anomaly_detection() {
        let mut analyzer = DataFlowAnalyzer::new();
        
        // Simulate 95% correct usage
        for i in 0..95 {
            analyzer.track_function_call(
                "caller",
                "DataService.__init__",
                vec![ArgumentInfo {
                    param_name: "cool_param".to_string(),
                    value_type: "dict".to_string(),
                    value_pattern: "dict with key 'flabberghast'".to_string(),
                }],
                &format!("file{}.py", i),
                10,
            );
        }
        
        // Simulate 5% incorrect usage
        for i in 95..100 {
            analyzer.track_function_call(
                "caller",
                "DataService.__init__",
                vec![ArgumentInfo {
                    param_name: "cool_param".to_string(),
                    value_type: "dict".to_string(),
                    value_pattern: "dict without key 'flabberghast'".to_string(),
                }],
                &format!("file{}.py", i),
                10,
            );
        }
        
        let anomalies = analyzer.find_anomalies(0.1); // 10% threshold
        
        assert_eq!(anomalies.len(), 5);
        assert_eq!(anomalies[0].severity, AnomalySeverity::Critical);
        assert!(anomalies[0].fix_suggestion.is_some());
    }
}