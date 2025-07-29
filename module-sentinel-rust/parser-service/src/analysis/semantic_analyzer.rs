use anyhow::Result;
use std::sync::Arc;
use std::collections::HashMap;
use tracing::{info, debug};

use crate::database::{
    SemanticPatternEngine, AdaptiveSimilarityEngine,
    cache::CachedSemanticDeduplicator, DuplicateGroup,
    ProjectDatabase,
};
use crate::parsers::tree_sitter::{Symbol, CodeEmbedder};

/// The main semantic analyzer that orchestrates all analysis components
pub struct SemanticAnalyzer {
    pattern_engine: Arc<SemanticPatternEngine>,
    similarity_engine: Arc<AdaptiveSimilarityEngine>,
    deduplicator: Arc<CachedSemanticDeduplicator>,
    project_db: Arc<ProjectDatabase>,
}

#[derive(Debug, Clone)]
pub struct AnalysisResult {
    pub duplicate_groups: Vec<DuplicateGroup>,
    pub pattern_matches: Vec<PatternAnalysis>,
    pub similarity_matrix: HashMap<(String, String), f32>,
    pub insights: AnalysisInsights,
}

#[derive(Debug, Clone)]
pub struct PatternAnalysis {
    pub pattern_type: String,
    pub symbols: Vec<Symbol>,
    pub confidence: f32,
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct AnalysisInsights {
    pub total_symbols_analyzed: usize,
    pub duplicate_count: usize,
    pub patterns_detected: usize,
    pub average_similarity: f32,
    pub code_reuse_percentage: f32,
    pub recommendations: Vec<String>,
}

impl SemanticAnalyzer {
    pub async fn new(
        embedder: Arc<CodeEmbedder>,
        project_db: Arc<ProjectDatabase>,
    ) -> Result<Self> {
        let pattern_engine = Arc::new(SemanticPatternEngine::new(Arc::clone(&embedder)).await?);
        let similarity_engine = Arc::new(AdaptiveSimilarityEngine::new(Arc::clone(&embedder)).await?);
        let deduplicator = Arc::new(CachedSemanticDeduplicator::new(
            embedder,
            crate::database::cache::CacheConfig::default()
        ).await?);
        
        Ok(Self {
            pattern_engine,
            similarity_engine,
            deduplicator,
            project_db,
        })
    }
    
    /// Analyze symbols for a project
    pub async fn analyze_project(&self, project_id: i32) -> Result<AnalysisResult> {
        info!("Starting semantic analysis for project {}", project_id);
        
        // Step 1: Load all symbols from the project
        let symbols = self.load_project_symbols(project_id).await?;
        debug!("Loaded {} symbols for analysis", symbols.len());
        
        // Step 2: Find duplicate groups
        let duplicate_groups = self.deduplicator.find_duplicates(&symbols).await?;
        debug!("Found {} duplicate groups", duplicate_groups.len());
        
        // Step 3: Detect patterns
        let patterns = self.detect_patterns(&symbols).await?;
        debug!("Detected {} patterns", patterns.len());
        
        // Step 4: Calculate similarity matrix for top symbols
        let similarity_matrix = self.calculate_similarity_matrix(&symbols).await?;
        
        // Step 5: Generate insights
        let insights = self.generate_insights(&symbols, &duplicate_groups, &patterns);
        
        Ok(AnalysisResult {
            duplicate_groups,
            pattern_matches: patterns,
            similarity_matrix,
            insights,
        })
    }
    
    /// Analyze a specific file
    pub async fn analyze_file(&self, project_id: i32, file_path: &str) -> Result<AnalysisResult> {
        info!("Analyzing file: {}", file_path);
        
        let symbols = self.project_db.get_symbols_in_file(project_id, file_path).await?;
        let parser_symbols = self.convert_to_parser_symbols(&symbols).await?;
        
        // Find duplicates within the file
        let duplicate_groups = self.deduplicator.find_duplicates(&parser_symbols).await?;
        
        // Detect patterns in the file
        let patterns = self.detect_patterns(&parser_symbols).await?;
        
        // Calculate similarity for symbols in the file
        let similarity_matrix = self.calculate_similarity_matrix(&parser_symbols).await?;
        
        let insights = self.generate_insights(&parser_symbols, &duplicate_groups, &patterns);
        
        Ok(AnalysisResult {
            duplicate_groups,
            pattern_matches: patterns,
            similarity_matrix,
            insights,
        })
    }
    
    /// Analyze similarity between two symbols
    pub async fn analyze_symbol_similarity(&self, symbol1: &Symbol, symbol2: &Symbol) -> Result<f32> {
        // Use adaptive similarity engine for accurate comparison
        let similarity = self.similarity_engine.calculate_adaptive_similarity(symbol1, symbol2).await?;
        
        // Also check cache for performance
        let cached_similarity = self.deduplicator.similarity_score(symbol1, symbol2).await?;
        
        // Return the adaptive result, but use cache if very similar
        if (similarity - cached_similarity).abs() < 0.05 {
            Ok(cached_similarity)
        } else {
            Ok(similarity)
        }
    }
    
    /// Find similar symbols to a target
    pub async fn find_similar_symbols(&self, target: &Symbol, candidates: &[Symbol], threshold: f32) -> Result<Vec<(Symbol, f32)>> {
        let _pattern_matches = self.pattern_engine.find_similar_symbols(target, candidates).await?;
        
        let mut results = Vec::new();
        for candidate in candidates {
            let similarity = self.analyze_symbol_similarity(target, candidate).await?;
            if similarity >= threshold {
                results.push((candidate.clone(), similarity));
            }
        }
        
        // Sort by similarity descending
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        
        Ok(results)
    }
    
    // Helper methods
    
    async fn load_project_symbols(&self, project_id: i32) -> Result<Vec<Symbol>> {
        use crate::database::orm::QueryBuilder;
        use crate::database::models::UniversalSymbol;
        
        let universal_symbols = self.project_db.db().find_all(
            QueryBuilder::<UniversalSymbol>::new()
                .where_eq("project_id", project_id)
        ).await?;
        
        self.convert_to_parser_symbols(&universal_symbols).await
    }
    
    async fn convert_to_parser_symbols(&self, universal_symbols: &[crate::database::models::UniversalSymbol]) -> Result<Vec<Symbol>> {
        let mut result = Vec::new();
        
        for s in universal_symbols {
            let language = self.project_db.map_language_id_to_parser_language(s.language_id).await?;
            
            // Parse semantic tags and intent from database
            let semantic_tags: Option<Vec<String>> = s.semantic_tags.as_ref()
                .and_then(|tags_json| serde_json::from_str(tags_json).ok());
            
            result.push(Symbol {
                id: s.qualified_name.clone(),
                name: s.name.clone(),
                signature: s.signature.clone().unwrap_or_default(),
                language,
                file_path: s.file_path.clone(),
                start_line: s.line as u32,
                end_line: s.end_line.unwrap_or(s.line) as u32,
                embedding: None,
                semantic_hash: None,
                normalized_name: s.name.to_lowercase(),
                context_embedding: None,
                duplicate_of: None,
                confidence_score: Some(s.confidence as f32),
                similar_symbols: vec![],
                semantic_tags,
                intent: s.intent.clone(),
            });
        }
        
        Ok(result)
    }
    
    async fn detect_patterns(&self, symbols: &[Symbol]) -> Result<Vec<PatternAnalysis>> {
        let evolving_patterns = self.pattern_engine.detect_patterns(symbols).await?;
        
        let mut pattern_analyses = Vec::new();
        
        // Group symbols by detected patterns
        for pattern in evolving_patterns {
            let mut matching_symbols = Vec::new();
            
            // Find symbols that match this pattern
            for symbol in symbols {
                // Simple pattern matching based on name/signature patterns
                if self.symbol_matches_pattern(symbol, &pattern) {
                    matching_symbols.push(symbol.clone());
                }
            }
            
            if !matching_symbols.is_empty() {
                pattern_analyses.push(PatternAnalysis {
                    pattern_type: format!("{:?}", pattern.pattern_type),
                    symbols: matching_symbols,
                    confidence: pattern.confidence,
                    description: self.describe_pattern(&pattern),
                });
            }
        }
        
        Ok(pattern_analyses)
    }
    
    fn symbol_matches_pattern(&self, symbol: &Symbol, pattern: &crate::database::EvolvingPattern) -> bool {
        // Simple heuristic matching - in reality this would be more sophisticated
        match &pattern.pattern_type {
            crate::database::PatternType::FunctionSimilarity { .. } => {
                symbol.signature.contains("fn") || symbol.signature.contains("function")
            }
            crate::database::PatternType::CrossLanguage => {
                // Check if symbol name suggests cross-language pattern
                symbol.name.contains("ffi") || symbol.name.contains("binding") || 
                symbol.name.contains("extern")
            }
            crate::database::PatternType::AlgorithmicEquivalence { algorithm_class } => {
                symbol.name.to_lowercase().contains(&algorithm_class.to_lowercase())
            }
        }
    }
    
    fn describe_pattern(&self, pattern: &crate::database::EvolvingPattern) -> String {
        match &pattern.pattern_type {
            crate::database::PatternType::FunctionSimilarity { .. } => {
                "Functions with similar semantic behavior".to_string()
            }
            crate::database::PatternType::CrossLanguage => {
                "Cross-language interface or binding pattern".to_string()
            }
            crate::database::PatternType::AlgorithmicEquivalence { algorithm_class } => {
                format!("Implementation of {} algorithm", algorithm_class)
            }
        }
    }
    
    async fn calculate_similarity_matrix(&self, symbols: &[Symbol]) -> Result<HashMap<(String, String), f32>> {
        let mut matrix = HashMap::new();
        
        // Only calculate for a subset to avoid O(n²) explosion
        let subset: Vec<_> = symbols.iter().take(50).collect();
        
        for (i, symbol1) in subset.iter().enumerate() {
            for symbol2 in subset.iter().skip(i + 1) {
                let similarity = self.analyze_symbol_similarity(symbol1, symbol2).await?;
                if similarity > 0.3 { // Only store meaningful similarities
                    matrix.insert((symbol1.id.clone(), symbol2.id.clone()), similarity);
                    matrix.insert((symbol2.id.clone(), symbol1.id.clone()), similarity);
                }
            }
        }
        
        Ok(matrix)
    }
    
    fn generate_insights(&self, symbols: &[Symbol], duplicate_groups: &[DuplicateGroup], patterns: &[PatternAnalysis]) -> AnalysisInsights {
        let total_symbols = symbols.len();
        let duplicate_count = duplicate_groups.iter()
            .map(|g| g.duplicate_symbols.len())
            .sum::<usize>();
        
        let code_reuse_percentage = if total_symbols > 0 {
            (duplicate_count as f32 / total_symbols as f32) * 100.0
        } else {
            0.0
        };
        
        let mut recommendations = Vec::new();
        
        if code_reuse_percentage > 30.0 {
            recommendations.push(format!(
                "High code duplication detected ({:.1}%). Consider extracting common functionality into shared modules.",
                code_reuse_percentage
            ));
        } else if code_reuse_percentage > 0.0 {
            recommendations.push(format!(
                "Low code duplication detected ({:.1}%). Good code organization.",
                code_reuse_percentage
            ));
        }
        
        if duplicate_groups.len() > 10 {
            recommendations.push(format!(
                "Found {} groups of duplicate code. Review these for refactoring opportunities.",
                duplicate_groups.len()
            ));
        } else if duplicate_groups.len() > 0 {
            recommendations.push(format!(
                "Found {} groups of duplicate code. Consider consolidating if appropriate.",
                duplicate_groups.len()
            ));
        }
        
        for pattern in patterns {
            if pattern.confidence > 0.8 && pattern.symbols.len() > 3 {
                recommendations.push(format!(
                    "Strong {} pattern detected across {} symbols. Consider creating an abstraction.",
                    pattern.pattern_type, pattern.symbols.len()
                ));
            } else if pattern.confidence > 0.3 && pattern.symbols.len() >= 2 {
                recommendations.push(format!(
                    "Detected {} pattern across {} symbols with {:.1}% confidence.",
                    pattern.pattern_type, pattern.symbols.len(), pattern.confidence * 100.0
                ));
            }
        }
        
        // Always provide basic recommendations if nothing else is found
        if recommendations.is_empty() {
            if total_symbols > 0 {
                recommendations.push("Code analysis completed. Consider adding more structured patterns for better maintainability.".to_string());
            } else {
                recommendations.push("No symbols found for analysis.".to_string());
            }
        }
        
        AnalysisInsights {
            total_symbols_analyzed: total_symbols,
            duplicate_count,
            patterns_detected: patterns.len(),
            average_similarity: 0.0, // Would calculate from similarity matrix
            code_reuse_percentage,
            recommendations,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_semantic_analyzer_creation() {
        use tempfile::TempDir;
        use crate::parsers::tree_sitter::{CodeEmbedder, Language};
        
        let temp_dir = TempDir::new().unwrap();
        let project_db = Arc::new(ProjectDatabase::new(temp_dir.path()).await.unwrap());
        let embedder = Arc::new(CodeEmbedder::load(&Language::Rust).await.unwrap());
        
        let analyzer = SemanticAnalyzer::new(embedder, project_db).await;
        assert!(analyzer.is_ok(), "SemanticAnalyzer should be created successfully");
    }
}