pub mod semantic_analyzer;
pub mod pattern_detector;
pub mod similarity_calculator;
pub mod endpoint_correlator;
pub mod subprocess_detector;
pub mod data_flow_analyzer;
pub mod data_lineage_tracker;
pub mod integrated_flow_analysis;
pub mod relationship_extractor;
pub mod flow_builder;
pub mod semantic_tag_extractor;

pub use semantic_analyzer::{SemanticAnalyzer, AnalysisResult, AnalysisInsights};
pub use pattern_detector::{PatternDetector, DetectedPattern, PatternCategory};
pub use similarity_calculator::{SimilarityCalculator, SimilarityResult};
pub use endpoint_correlator::{EndpointCorrelator, APIEndpoint, EndpointCorrelation, CorrelationType, EndpointStatistics};
pub use subprocess_detector::{SubprocessDetector, SubprocessCall, CrossLanguageExecution, ExecutionType, DataTransferMethod, SubprocessStatistics};
pub use data_flow_analyzer::{DataFlowAnalyzer, DataFlowAnomaly, ParameterUsagePattern, UsageOccurrence, AnomalySeverity, ArgumentInfo};
pub use data_lineage_tracker::{
    DataLineageTracker, DataNode, DataNodeType, DataTransformation, TransformType,
    DataLineageAnalysis, DataFlowPath, CriticalNode, CrossFileFlow, FlowType
};
pub use integrated_flow_analysis::{
    IntegratedFlowAnalysis, IntegratedAnalysisResult, IntegratedFlow, FlowType as IntegratedFlowType,
    FlowPoint, FlowTransformation, CorrelatedIssue, IssueSeverity
};
pub use relationship_extractor::RelationshipExtractor;
pub use flow_builder::{FlowBuilder, FlowGraph, FlowNode, FlowEdge, EdgeType, AnomalyDetector, Anomaly};
pub use semantic_tag_extractor::{extract_semantic_tags, enrich_symbol_with_semantics};