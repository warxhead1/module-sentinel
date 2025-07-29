use std::collections::HashMap;
use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use super::language_definition::LanguageDefinition;
use super::pattern::PatternSet;

pub struct PatternEngine {
    patterns_dir: Option<PathBuf>,
    loaded_patterns: HashMap<String, LanguageDefinition>,
}

impl PatternEngine {
    pub fn new(patterns_dir: Option<PathBuf>) -> Result<Self> {
        let mut engine = Self {
            patterns_dir: patterns_dir.clone(),
            loaded_patterns: HashMap::new(),
        };
        
        // Load initial patterns if directory provided
        if let Some(dir) = patterns_dir {
            engine.load_all_patterns(&dir)?;
        }
        
        Ok(engine)
    }
    
    pub fn get_patterns(&self, language: &str) -> Result<&PatternSet> {
        self.loaded_patterns
            .get(language)
            .map(|def| &def.patterns)
            .ok_or_else(|| anyhow::anyhow!("No patterns found for language: {}", language))
    }
    
    pub fn reload_patterns(&mut self) -> Result<()> {
        if let Some(dir) = self.patterns_dir.clone() {
            self.loaded_patterns.clear();
            self.load_all_patterns(&dir)?;
        }
        Ok(())
    }
    
    fn load_all_patterns(&mut self, dir: &PathBuf) -> Result<()> {
        // Read all YAML files in the directory
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|s| s.to_str()) == Some("yaml") {
                let content = fs::read_to_string(&path)?;
                if let Ok(definition) = LanguageDefinition::from_yaml(&content) {
                    self.loaded_patterns.insert(definition.id.clone(), definition);
                }
            }
        }
        
        Ok(())
    }
}