use serde::{Deserialize, Serialize};
use anyhow::Result;
use super::pattern::{Pattern, PatternSet, CrossLanguagePatterns, CrossLanguagePattern, CompositePattern};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageDefinition {
    pub id: String,
    pub version: String,
    pub patterns: PatternSet,
    #[serde(default)]
    pub symbol_rules: Vec<SymbolRule>,
    #[serde(default)]
    pub relationship_rules: Vec<RelationshipRule>,
    #[serde(default)]
    pub cross_language_patterns: CrossLanguagePatterns,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolRule {
    pub name: String,
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipRule {
    pub name: String,
    pub pattern: String,
}

impl LanguageDefinition {
    pub fn from_yaml(yaml_str: &str) -> Result<Self> {
        // Parse the YAML
        let parsed: serde_yaml::Value = serde_yaml::from_str(yaml_str)?;
        
        let mut definition = LanguageDefinition {
            id: parsed["language"].as_str().unwrap_or("").to_string(),
            version: parsed["version"].as_str().unwrap_or("1.0").to_string(),
            patterns: PatternSet::default(),
            symbol_rules: vec![],
            relationship_rules: vec![],
            cross_language_patterns: CrossLanguagePatterns::default(),
        };
        
        // Parse patterns
        if let Some(patterns) = parsed["patterns"].as_mapping() {
            for (key, value) in patterns {
                let key_str = key.as_str().unwrap_or("");
                
                match key_str {
                    "function" => {
                        definition.patterns.function_patterns = Self::parse_patterns(value)?;
                    }
                    "class" => {
                        definition.patterns.class_patterns = Self::parse_patterns(value)?;
                    }
                    "variable" => {
                        definition.patterns.variable_patterns = Self::parse_patterns(value)?;
                    }
                    "import" => {
                        definition.patterns.import_patterns = Self::parse_patterns(value)?;
                    }
                    "inheritance" => {
                        definition.patterns.inheritance_patterns = Self::parse_patterns(value)?;
                    }
                    "call" => {
                        definition.patterns.call_patterns = Self::parse_patterns(value)?;
                    }
                    "usage" => {
                        definition.patterns.usage_patterns = Self::parse_patterns(value)?;
                    }
                    "api_calls" => {
                        definition.patterns.api_patterns = Self::parse_patterns(value)?;
                    }
                    "websocket_patterns" => {
                        definition.patterns.api_patterns.extend(Self::parse_patterns(value)?);
                    }
                    "subprocess_patterns" => {
                        definition.patterns.subprocess_patterns = Self::parse_patterns(value)?;
                    }
                    "database_patterns" => {
                        definition.patterns.api_patterns.extend(Self::parse_patterns(value)?);
                    }
                    "endpoint_definitions" => {
                        definition.patterns.api_patterns.extend(Self::parse_patterns(value)?);
                    }
                    "ffi_patterns" => {
                        definition.patterns.ffi_patterns = Self::parse_patterns(value)?;
                    }
                    "class_with_interface" => {
                        // Handle composite pattern
                        if let Ok(composite) = Self::parse_composite_pattern(value) {
                            definition.patterns.composite_patterns.insert(key_str.to_string(), composite);
                        }
                    }
                    _ => {}
                }
            }
        }
        
        // Parse cross-language patterns
        if let Some(cross_lang) = parsed["cross_language_patterns"].as_mapping() {
            for (key, value) in cross_lang {
                let key_str = key.as_str().unwrap_or("");
                
                match key_str {
                    "subprocess" => {
                        definition.cross_language_patterns.subprocess_patterns = 
                            Self::parse_cross_language_patterns(value)?;
                    }
                    "api_calls" => {
                        definition.cross_language_patterns.api_patterns = 
                            Self::parse_cross_language_patterns(value)?;
                    }
                    "websocket" => {
                        definition.cross_language_patterns.api_patterns.extend(
                            Self::parse_cross_language_patterns(value)?
                        );
                    }
                    "ffi_calls" => {
                        definition.cross_language_patterns.api_patterns.extend(
                            Self::parse_cross_language_patterns(value)?
                        );
                    }
                    "database" => {
                        definition.cross_language_patterns.api_patterns.extend(
                            Self::parse_cross_language_patterns(value)?
                        );
                    }
                    _ => {}
                }
            }
        }
        
        Ok(definition)
    }
    
    fn parse_patterns(value: &serde_yaml::Value) -> Result<Vec<Pattern>> {
        let mut patterns = Vec::new();
        
        if let Some(pattern_list) = value.as_sequence() {
            for pattern_yaml in pattern_list {
                let pattern = Pattern {
                    query: pattern_yaml["query"].as_str().unwrap_or("").to_string(),
                    confidence: pattern_yaml["confidence"].as_f64().unwrap_or(0.8) as f32,
                    captures: HashMap::new(),
                    min_version: pattern_yaml["min_version"].as_str().map(|s| s.to_string()),
                    max_version: pattern_yaml["max_version"].as_str().map(|s| s.to_string()),
                };
                patterns.push(pattern);
            }
        }
        
        Ok(patterns)
    }
    
    fn parse_cross_language_patterns(value: &serde_yaml::Value) -> Result<Vec<CrossLanguagePattern>> {
        let mut patterns = Vec::new();
        
        if let Some(pattern_list) = value.as_sequence() {
            for pattern_yaml in pattern_list {
                let mut capture_groups = HashMap::new();
                
                if let Some(groups) = pattern_yaml["capture_groups"].as_mapping() {
                    for (k, v) in groups {
                        if let (Some(idx), Some(name)) = (k.as_u64(), v.as_str()) {
                            capture_groups.insert(idx as usize, name.to_string());
                        }
                    }
                }
                
                let pattern = CrossLanguagePattern {
                    pattern: pattern_yaml["pattern"].as_str().unwrap_or("").to_string(),
                    confidence: pattern_yaml["confidence"].as_f64().unwrap_or(0.8) as f32,
                    capture_groups,
                };
                patterns.push(pattern);
            }
        }
        
        Ok(patterns)
    }
    
    fn parse_composite_pattern(value: &serde_yaml::Value) -> Result<CompositePattern> {
        let mut requires = Vec::new();
        
        if let Some(req_list) = value["requires"].as_sequence() {
            for req in req_list {
                if let Some(s) = req.as_str() {
                    requires.push(s.to_string());
                }
            }
        }
        
        Ok(CompositePattern {
            is_composite: value["composite"].as_bool().unwrap_or(false),
            requires,
            query: value["query"].as_str().unwrap_or("").to_string(),
        })
    }
}