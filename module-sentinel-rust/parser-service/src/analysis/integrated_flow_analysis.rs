use std::sync::Arc;
use serde::{Serialize, Deserialize};
use anyhow::Result;
use tokio::sync::Mutex;

use super::{DataFlowAnalyzer, DataLineageTracker};
use crate::services::unified_parsing_service::UnifiedParsingService;
use crate::parsers::Language;
use shared_types::{UniversalSymbol, UniversalSymbolKind};

// Define our own CodeLocation type since it's not in shared-types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeLocation {
    pub file: String,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegratedFlow {
    pub id: String,
    pub name: String,
    pub flow_type: FlowType,
    pub start_point: FlowPoint,
    pub end_points: Vec<FlowPoint>,
    pub transformations: Vec<FlowTransformation>,
    pub depth: usize,
    pub crosses_process_boundary: bool,
    pub crosses_network_boundary: bool,
    pub data_types: Vec<String>,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FlowType {
    HttpRequest,
    DatabaseQuery,
    FileOperation,
    ProcessExecution,
    NetworkCall,
    MessageQueue,
    EventBus,
    DataTransformation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowPoint {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub symbol: String,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowTransformation {
    pub location: FlowPoint,
    pub operation: String,
    pub from_type: Option<String>,
    pub to_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegratedAnalysisResult {
    pub total_files: usize,
    pub parameter_anomalies: Vec<DataFlowAnomaly>,
    pub lineage_analysis: DataLineageAnalysis,
    pub correlated_issues: Vec<CorrelatedIssue>,
    pub integrated_flows: Vec<IntegratedFlow>,
}

// Re-export types from data flow analyzer with proper names
pub use crate::analysis::data_flow_analyzer::DataFlowAnomaly;
pub use crate::analysis::data_lineage_tracker::DataLineageAnalysis;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrelatedIssue {
    pub issue_type: String,
    pub severity: IssueSeverity,
    pub affected_flows: Vec<String>,
    pub description: String,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IssueSeverity {
    Critical,
    High,
    Medium,
    Low,
}

/// Integrates data flow anomaly detection with deep lineage tracking
pub struct IntegratedFlowAnalysis {
    data_flow_analyzer: Arc<Mutex<DataFlowAnalyzer>>,
    lineage_tracker: Arc<Mutex<DataLineageTracker>>,
}

impl IntegratedFlowAnalysis {
    pub fn new() -> Self {
        Self {
            data_flow_analyzer: Arc::new(Mutex::new(DataFlowAnalyzer::new())),
            lineage_tracker: Arc::new(Mutex::new(DataLineageTracker::new())),
        }
    }

    /// Analyze a complete project for data flows and anomalies
    pub async fn analyze_project(&self, 
        parsing_service: &UnifiedParsingService,
        project_path: &std::path::Path
    ) -> Result<IntegratedAnalysisResult> {
        // 1. Parse all files and collect flows
        let source_files = parsing_service.find_source_files(project_path)?;
        let mut integrated_flows = Vec::new();
        
        for file_path in &source_files {
            if let Ok(content) = tokio::fs::read_to_string(file_path).await {
                if let Ok(flows) = self.analyze_file(parsing_service, file_path, &content).await {
                    integrated_flows.extend(flows);
                }
            }
        }
        
        // 2. Get analysis results from our analyzers
        let flow_analyzer = self.data_flow_analyzer.lock().await;
        let anomalies = flow_analyzer.find_all_anomalies();
        
        // 3. Get lineage analysis
        let mut lineage = self.lineage_tracker.lock().await;
        let lineage_analysis = lineage.analyze();
        
        // 4. Correlate findings
        let correlated = self.correlate_findings(&anomalies, &lineage_analysis);
        
        Ok(IntegratedAnalysisResult {
            total_files: source_files.len(),
            parameter_anomalies: anomalies,
            lineage_analysis,
            correlated_issues: correlated,
            integrated_flows,
        })
    }

    /// Analyze a single file for data flows
    async fn analyze_file(
        &self,
        parsing_service: &UnifiedParsingService,
        file_path: &std::path::Path,
        content: &str,
    ) -> Result<Vec<IntegratedFlow>> {
        let mut flows = Vec::new();
        
        // Detect language
        match parsing_service.detect_language(file_path) {
            Ok(lang) => {
                // Parse the file asynchronously
                let tree = parsing_service.parse_content(content, file_path).await?;
                
                // Extract symbols from the parsed tree
                let symbols = self.extract_symbols_from_tree(&tree, &lang, file_path)?;
                
                // Analyze each symbol for data flows
                for symbol in &symbols {
                    if let Some(flow) = self.analyze_symbol_flow(symbol, file_path).await {
                        flows.push(flow);
                    }
                }
                
                // Register symbols with analyzers
                let mut flow_analyzer = self.data_flow_analyzer.lock().await;
                let mut lineage_tracker = self.lineage_tracker.lock().await;
                
                for symbol in symbols {
                    // Add to flow analyzer for functions/methods
                    if matches!(symbol.kind, UniversalSymbolKind::Function | UniversalSymbolKind::Method) {
                        flow_analyzer.add_symbol_usage(&symbol);
                    }
                    
                    // Add to lineage tracker
                    lineage_tracker.add_source(
                        &symbol.name,
                        "UserInput", // source type
                        symbol.start_location.line, // line number
                        "function" // node type
                    );
                }
            }
            Err(_) => {
                // Unknown language, skip
            }
        }
        
        Ok(flows)
    }

    /// Extract symbols from a parsed tree
    fn extract_symbols_from_tree(
        &self,
        _tree: &tree_sitter::Tree,
        _lang: &Language,
        _file_path: &std::path::Path,
    ) -> Result<Vec<UniversalSymbol>> {
        // This is a simplified version - in reality, we'd walk the tree
        // and extract symbols based on language-specific patterns
        Ok(Vec::new())
    }

    /// Analyze a symbol to create an integrated flow
    async fn analyze_symbol_flow(
        &self,
        symbol: &UniversalSymbol,
        file_path: &std::path::Path,
    ) -> Option<IntegratedFlow> {
        // Only analyze functions and methods
        if !matches!(symbol.kind, UniversalSymbolKind::Function | UniversalSymbolKind::Method) {
            return None;
        }
        
        // Determine flow type based on symbol characteristics
        let flow_type = self.determine_flow_type(symbol);
        
        // Create flow point for the symbol
        let start_point = FlowPoint {
            file: file_path.to_string_lossy().to_string(),
            line: symbol.start_location.line as usize,
            column: symbol.start_location.column as usize,
            symbol: symbol.name.clone(),
            context: symbol.kind.to_string(),
        };
        
        // For now, we'll create empty end points since we need to analyze relationships
        let end_points = Vec::new();
        
        Some(IntegratedFlow {
            id: format!("flow_{}", uuid::Uuid::new_v4()),
            name: symbol.name.clone(),
            flow_type,
            start_point,
            end_points,
            transformations: Vec::new(),
            depth: 1,
            crosses_process_boundary: false,
            crosses_network_boundary: self.check_network_boundary(symbol),
            data_types: self.extract_data_types(symbol),
            confidence: 0.8,
        })
    }

    /// Determine the flow type based on symbol characteristics
    fn determine_flow_type(&self, symbol: &UniversalSymbol) -> FlowType {
        let name_lower = symbol.name.to_lowercase();
        let context_lower = symbol.kind.to_string().to_lowercase();
        
        if name_lower.contains("http") || name_lower.contains("request") || 
           context_lower.contains("endpoint") || context_lower.contains("route") {
            FlowType::HttpRequest
        } else if name_lower.contains("query") || name_lower.contains("database") ||
                  name_lower.contains("sql") {
            FlowType::DatabaseQuery
        } else if name_lower.contains("file") || name_lower.contains("read") ||
                  name_lower.contains("write") {
            FlowType::FileOperation
        } else if name_lower.contains("exec") || name_lower.contains("spawn") ||
                  name_lower.contains("process") {
            FlowType::ProcessExecution
        } else {
            FlowType::DataTransformation
        }
    }

    /// Check if the symbol involves network boundaries
    fn check_network_boundary(&self, symbol: &UniversalSymbol) -> bool {
        let name_lower = symbol.name.to_lowercase();
        name_lower.contains("http") || name_lower.contains("api") || 
        name_lower.contains("request") || name_lower.contains("fetch")
    }

    /// Extract data types from symbol
    fn extract_data_types(&self, symbol: &UniversalSymbol) -> Vec<String> {
        // Extract from return type and signature
        let mut types = Vec::new();
        if let Some(return_type) = &symbol.return_type {
            types.push(return_type.clone());
        }
        types
    }

    /// Correlate anomalies with lineage analysis
    fn correlate_findings(
        &self,
        anomalies: &[DataFlowAnomaly],
        lineage_analysis: &DataLineageAnalysis,
    ) -> Vec<CorrelatedIssue> {
        let mut issues = Vec::new();
        
        // Check for anomalies in critical paths
        for anomaly in anomalies {
            // Check if this anomaly is in a deep flow
            let in_deep_flow = lineage_analysis.deepest_paths.iter()
                .any(|path| path.path.iter().any(|node_name| 
                    node_name.contains(&anomaly.location.function_name)
                ));
            
            if in_deep_flow {
                issues.push(CorrelatedIssue {
                    issue_type: "AnomalyInDeepFlow".to_string(),
                    severity: match anomaly.severity {
                        crate::analysis::data_flow_analyzer::AnomalySeverity::Critical => IssueSeverity::Critical,
                        crate::analysis::data_flow_analyzer::AnomalySeverity::High => IssueSeverity::High,
                        crate::analysis::data_flow_analyzer::AnomalySeverity::Medium => IssueSeverity::Medium,
                        crate::analysis::data_flow_analyzer::AnomalySeverity::Low => IssueSeverity::Low,
                    },
                    affected_flows: vec![anomaly.location.function_name.clone()],
                    description: format!(
                        "Data flow anomaly in deep flow: {}",
                        anomaly.description
                    ),
                    suggestions: anomaly.fix_suggestion.as_ref()
                        .map(|s| vec![s.clone()])
                        .unwrap_or_default(),
                });
            }
        }
        
        // Check for critical nodes with many anomalies
        for critical_node in &lineage_analysis.critical_nodes {
            let anomaly_count = anomalies.iter()
                .filter(|a| critical_node.qualified_name.contains(&a.location.function_name))
                .count();
            
            if anomaly_count > 1 {
                issues.push(CorrelatedIssue {
                    issue_type: "MultipleAnomaliesInCriticalNode".to_string(),
                    severity: IssueSeverity::Critical,
                    affected_flows: vec![critical_node.qualified_name.clone()],
                    description: format!(
                        "Critical node '{}' has {} data flow anomalies",
                        critical_node.qualified_name, anomaly_count
                    ),
                    suggestions: vec![
                        "Review and fix all data flow issues in this critical path".to_string(),
                        "Add comprehensive error handling and validation".to_string(),
                        "Consider refactoring to reduce complexity".to_string(),
                    ],
                });
            }
        }
        
        issues
    }
}