
use crate::parsers::tree_sitter::Symbol;

/// Calculate similarity between symbols using multiple strategies
pub struct SimilarityCalculator {
    weights: SimilarityWeights,
}

#[derive(Debug, Clone)]
pub struct SimilarityWeights {
    pub name_weight: f32,
    pub signature_weight: f32,
    pub structure_weight: f32,
    pub context_weight: f32,
}

impl Default for SimilarityWeights {
    fn default() -> Self {
        Self {
            name_weight: 0.3,
            signature_weight: 0.4,
            structure_weight: 0.2,
            context_weight: 0.1,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SimilarityResult {
    pub overall_score: f32,
    pub name_similarity: f32,
    pub signature_similarity: f32,
    pub structural_similarity: f32,
    pub context_similarity: f32,
}

impl SimilarityCalculator {
    pub fn new() -> Self {
        Self {
            weights: SimilarityWeights::default(),
        }
    }
    
    pub fn with_weights(weights: SimilarityWeights) -> Self {
        Self { weights }
    }
    
    /// Calculate similarity between two symbols
    pub fn calculate(&self, symbol1: &Symbol, symbol2: &Symbol) -> SimilarityResult {
        let name_sim = self.name_similarity(&symbol1.name, &symbol2.name);
        let sig_sim = self.signature_similarity(&symbol1.signature, &symbol2.signature);
        let struct_sim = self.structural_similarity(symbol1, symbol2);
        let ctx_sim = self.context_similarity(symbol1, symbol2);
        
        let overall = self.weights.name_weight * name_sim
            + self.weights.signature_weight * sig_sim
            + self.weights.structure_weight * struct_sim
            + self.weights.context_weight * ctx_sim;
        
        SimilarityResult {
            overall_score: overall.min(1.0).max(0.0),
            name_similarity: name_sim,
            signature_similarity: sig_sim,
            structural_similarity: struct_sim,
            context_similarity: ctx_sim,
        }
    }
    
    /// Calculate name similarity using various techniques
    fn name_similarity(&self, name1: &str, name2: &str) -> f32 {
        // Exact match
        if name1 == name2 {
            return 1.0;
        }
        
        // Case-insensitive match
        if name1.to_lowercase() == name2.to_lowercase() {
            return 0.95;
        }
        
        // Normalize names (remove underscores, camelCase to snake_case)
        let norm1 = self.normalize_name(name1);
        let norm2 = self.normalize_name(name2);
        
        if norm1 == norm2 {
            return 0.9;
        }
        
        // Calculate edit distance
        let distance = self.levenshtein_distance(&norm1, &norm2);
        let max_len = norm1.len().max(norm2.len()) as f32;
        let edit_similarity = 1.0 - (distance as f32 / max_len);
        
        // Token-based similarity
        let tokens1 = self.tokenize_name(&norm1);
        let tokens2 = self.tokenize_name(&norm2);
        let token_similarity = self.token_similarity(&tokens1, &tokens2);
        
        // Combine approaches
        (edit_similarity * 0.6 + token_similarity * 0.4).max(0.0)
    }
    
    /// Calculate signature similarity
    fn signature_similarity(&self, sig1: &str, sig2: &str) -> f32 {
        if sig1 == sig2 {
            return 1.0;
        }
        
        // Extract and compare components
        let params1 = self.extract_parameters(sig1);
        let params2 = self.extract_parameters(sig2);
        let return1 = self.extract_return_type(sig1);
        let return2 = self.extract_return_type(sig2);
        
        let param_sim = self.parameter_similarity(&params1, &params2);
        let return_sim = if return1 == return2 { 1.0 } else { self.type_similarity(&return1, &return2) };
        
        (param_sim * 0.7 + return_sim * 0.3).max(0.0)
    }
    
    /// Calculate structural similarity based on symbol properties
    fn structural_similarity(&self, symbol1: &Symbol, symbol2: &Symbol) -> f32 {
        let mut score = 0.0;
        let mut factors = 0.0;
        
        // Similar line count
        let lines1 = symbol1.end_line - symbol1.start_line;
        let lines2 = symbol2.end_line - symbol2.start_line;
        if lines1 > 0 && lines2 > 0 {
            let line_ratio = (lines1 as f32).min(lines2 as f32) / (lines1 as f32).max(lines2 as f32);
            score += line_ratio;
            factors += 1.0;
        }
        
        // Same language
        if std::mem::discriminant(&symbol1.language) == std::mem::discriminant(&symbol2.language) {
            score += 1.0;
            factors += 1.0;
        }
        
        // Similar confidence scores
        if let (Some(conf1), Some(conf2)) = (symbol1.confidence_score, symbol2.confidence_score) {
            let conf_diff = (conf1 - conf2).abs();
            score += 1.0 - conf_diff;
            factors += 1.0;
        }
        
        if factors > 0.0 {
            score / factors
        } else {
            0.5 // Default neutral score
        }
    }
    
    /// Calculate context similarity based on file paths and namespaces
    fn context_similarity(&self, symbol1: &Symbol, symbol2: &Symbol) -> f32 {
        // Same file
        if symbol1.file_path == symbol2.file_path {
            return 1.0;
        }
        
        // Same directory
        let dir1 = std::path::Path::new(&symbol1.file_path).parent();
        let dir2 = std::path::Path::new(&symbol2.file_path).parent();
        
        if let (Some(d1), Some(d2)) = (dir1, dir2) {
            if d1 == d2 {
                return 0.8;
            }
            
            // Check if in related directories (e.g., src/module1 vs src/module2)
            let components1: Vec<_> = d1.components().collect();
            let components2: Vec<_> = d2.components().collect();
            
            let common_prefix = components1.iter()
                .zip(components2.iter())
                .take_while(|(a, b)| a == b)
                .count();
            
            let max_depth = components1.len().max(components2.len());
            if max_depth > 0 {
                return (common_prefix as f32 / max_depth as f32) * 0.7;
            }
        }
        
        0.0
    }
    
    // Helper methods
    
    fn normalize_name(&self, name: &str) -> String {
        // Convert camelCase to snake_case and remove common prefixes/suffixes
        let mut result = String::new();
        let mut prev_lower = false;
        
        for ch in name.chars() {
            if ch.is_uppercase() && prev_lower {
                result.push('_');
            }
            result.push(ch.to_lowercase().next().unwrap_or(ch));
            prev_lower = ch.is_lowercase();
        }
        
        result
            .trim_start_matches("get_")
            .trim_start_matches("set_")
            .trim_start_matches("is_")
            .trim_end_matches("_impl")
            .trim_end_matches("_internal")
            .to_string()
    }
    
    fn tokenize_name(&self, name: &str) -> Vec<String> {
        name.split('_')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect()
    }
    
    fn token_similarity(&self, tokens1: &[String], tokens2: &[String]) -> f32 {
        if tokens1.is_empty() || tokens2.is_empty() {
            return 0.0;
        }
        
        let set1: std::collections::HashSet<_> = tokens1.iter().collect();
        let set2: std::collections::HashSet<_> = tokens2.iter().collect();
        
        let intersection = set1.intersection(&set2).count();
        let union = set1.union(&set2).count();
        
        if union > 0 {
            intersection as f32 / union as f32
        } else {
            0.0
        }
    }
    
    fn levenshtein_distance(&self, s1: &str, s2: &str) -> usize {
        let len1 = s1.chars().count();
        let len2 = s2.chars().count();
        let mut matrix = vec![vec![0; len2 + 1]; len1 + 1];
        
        for i in 0..=len1 {
            matrix[i][0] = i;
        }
        for j in 0..=len2 {
            matrix[0][j] = j;
        }
        
        for (i, c1) in s1.chars().enumerate() {
            for (j, c2) in s2.chars().enumerate() {
                let cost = if c1 == c2 { 0 } else { 1 };
                matrix[i + 1][j + 1] = std::cmp::min(
                    std::cmp::min(
                        matrix[i][j + 1] + 1,
                        matrix[i + 1][j] + 1,
                    ),
                    matrix[i][j] + cost,
                );
            }
        }
        
        matrix[len1][len2]
    }
    
    fn extract_parameters(&self, signature: &str) -> Vec<String> {
        // Simple parameter extraction - would be more sophisticated in production
        if let Some(start) = signature.find('(') {
            if let Some(end) = signature.find(')') {
                let params = &signature[start + 1..end];
                return params.split(',')
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect();
            }
        }
        vec![]
    }
    
    fn extract_return_type(&self, signature: &str) -> String {
        // Simple return type extraction
        if let Some(arrow_pos) = signature.find("->") {
            signature[arrow_pos + 2..].trim().to_string()
        } else {
            "void".to_string()
        }
    }
    
    fn parameter_similarity(&self, params1: &[String], params2: &[String]) -> f32 {
        if params1.len() != params2.len() {
            // Different parameter counts should result in lower similarity
            let diff = (params1.len() as i32 - params2.len() as i32).abs();
            return 0.3 / (1.0 + diff as f32); // Reduced from 1.0 to 0.3 for different param counts
        }
        
        if params1.is_empty() {
            return 1.0;
        }
        
        let mut score = 0.0;
        for (p1, p2) in params1.iter().zip(params2.iter()) {
            score += self.type_similarity(p1, p2);
        }
        
        score / params1.len() as f32
    }
    
    fn type_similarity(&self, type1: &str, type2: &str) -> f32 {
        if type1 == type2 {
            return 1.0;
        }
        
        // Check for common type equivalences
        let norm1 = type1.replace("&", "").replace("mut", "").trim().to_string();
        let norm2 = type2.replace("&", "").replace("mut", "").trim().to_string();
        
        if norm1 == norm2 {
            return 0.9;
        }
        
        // Check for generic types
        if norm1.contains('<') && norm2.contains('<') {
            let base1 = norm1.split('<').next().unwrap_or(&norm1);
            let base2 = norm2.split('<').next().unwrap_or(&norm2);
            if base1 == base2 {
                return 0.8;
            }
        }
        
        // Common type aliases
        let type_aliases = [
            ("i32", "int"),
            ("i64", "long"),
            ("f32", "float"),
            ("f64", "double"),
            ("String", "str"),
            ("Vec", "Array"),
            ("HashMap", "Map"),
        ];
        
        for (t1, t2) in &type_aliases {
            if (norm1.contains(t1) && norm2.contains(t2)) || 
               (norm1.contains(t2) && norm2.contains(t1)) {
                return 0.7;
            }
        }
        
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::tree_sitter::Language;
    
    fn create_test_symbol(name: &str, signature: &str) -> Symbol {
        Symbol {
            id: name.to_string(),
            name: name.to_string(),
            signature: signature.to_string(),
            language: Language::Rust,
            file_path: "test.rs".to_string(),
            start_line: 1,
            end_line: 10,
            embedding: None,
            semantic_hash: None,
            normalized_name: name.to_lowercase(),
            context_embedding: None,
            duplicate_of: None,
            confidence_score: Some(1.0),
            similar_symbols: vec![],
            semantic_tags: None,
            intent: None,
        }
    }
    
    #[test]
    fn test_identical_symbols() {
        let calc = SimilarityCalculator::new();
        let symbol = create_test_symbol("process_data", "fn process_data(input: &str) -> Result<String>");
        
        let result = calc.calculate(&symbol, &symbol);
        assert_eq!(result.overall_score, 1.0);
        assert_eq!(result.name_similarity, 1.0);
        assert_eq!(result.signature_similarity, 1.0);
    }
    
    #[test]
    fn test_similar_names() {
        let calc = SimilarityCalculator::new();
        let symbol1 = create_test_symbol("get_user_data", "fn get_user_data() -> User");
        let symbol2 = create_test_symbol("getUserData", "fn getUserData() -> User");
        
        let result = calc.calculate(&symbol1, &symbol2);
        assert!(result.name_similarity > 0.8, "Expected high name similarity for camelCase vs snake_case");
    }
    
    #[test]
    fn test_different_signatures() {
        let calc = SimilarityCalculator::new();
        let symbol1 = create_test_symbol("process", "fn process(data: String) -> Result<()>");
        let symbol2 = create_test_symbol("process", "fn process(data: &str, options: Options) -> Result<String>");
        
        let result = calc.calculate(&symbol1, &symbol2);
        assert_eq!(result.name_similarity, 1.0);
        assert!(result.signature_similarity < 0.5, "Expected low signature similarity for different parameters");
    }
    
    #[test]
    fn test_levenshtein_distance() {
        let calc = SimilarityCalculator::new();
        assert_eq!(calc.levenshtein_distance("", ""), 0);
        assert_eq!(calc.levenshtein_distance("hello", "hello"), 0);
        assert_eq!(calc.levenshtein_distance("hello", "hallo"), 1);
        assert_eq!(calc.levenshtein_distance("sitting", "kitten"), 3);
    }
}