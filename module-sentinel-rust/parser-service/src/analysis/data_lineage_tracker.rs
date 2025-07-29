use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Serialize, Deserialize};
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::algo::all_simple_paths;
use petgraph::visit::Dfs;

/// Represents a complete data lineage graph tracking how data flows through the system
#[derive(Debug, Clone)]
pub struct DataLineageTracker {
    /// The main flow graph where nodes are data points and edges are transformations
    pub flow_graph: DiGraph<DataNode, DataTransformation>,
    /// Quick lookup from qualified name to node index
    name_to_node: HashMap<String, NodeIndex>,
    /// Track which functions read/write which data
    function_interactions: HashMap<String, FunctionDataInteraction>,
    /// Cross-file data flows
    cross_file_flows: Vec<CrossFileFlow>,
}

/// A node in the data flow graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataNode {
    pub id: String,
    pub node_type: DataNodeType,
    pub qualified_name: String,
    pub file_path: String,
    pub line: u32,
    pub depth_from_root: u32,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DataNodeType {
    /// Original data source (user input, file read, API call)
    Source,
    /// Function parameter
    Parameter,
    /// Variable assignment
    Variable,
    /// Function return value
    ReturnValue,
    /// Data sink (file write, API response, UI display)
    Sink,
    /// Intermediate transformation
    Transformation,
}

/// Represents how data is transformed between nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataTransformation {
    pub transform_type: TransformType,
    pub function_name: String,
    pub confidence: f32,
    pub preserves_structure: bool,
    pub may_filter: bool,
    pub may_augment: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransformType {
    /// Direct assignment (x = y)
    Assignment,
    /// Function call transformation
    FunctionCall,
    /// Method call on object
    MethodCall,
    /// Array/Dict access
    Access,
    /// Arithmetic/Logic operation
    Operation,
    /// Type conversion
    Conversion,
    /// Merge from multiple sources
    Merge,
    /// Split into multiple outputs
    Split,
}

/// Tracks how a function interacts with data
#[derive(Debug, Clone, Default)]
pub struct FunctionDataInteraction {
    pub reads: HashSet<String>,    // Data nodes this function reads
    pub writes: HashSet<String>,   // Data nodes this function writes
    pub transforms: Vec<String>,   // Transformations this function performs
    pub call_depth: u32,          // Maximum call depth from this function
}

/// Represents data flow across file boundaries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossFileFlow {
    pub source_file: String,
    pub source_line: u32,
    pub source_symbol: String,
    pub target_file: String,
    pub target_line: u32,
    pub target_symbol: String,
    pub flow_type: FlowType,
    pub data_path: Vec<String>, // Node IDs in the path
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FlowType {
    Import,
    FunctionCall,
    SharedState,
    EventEmission,
    MessagePassing,
}

/// Analysis results for data lineage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataLineageAnalysis {
    pub total_nodes: usize,
    pub total_edges: usize,
    pub max_depth: u32,
    pub deepest_paths: Vec<DataFlowPath>,
    pub critical_nodes: Vec<CriticalNode>,
    pub data_islands: Vec<Vec<String>>, // Disconnected subgraphs
    pub cross_file_flows: Vec<CrossFileFlow>,
    pub complexity_score: f32,
}

/// A complete path showing how data flows
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataFlowPath {
    pub path: Vec<String>,
    pub depth: u32,
    pub transformations: Vec<String>,
    pub crosses_files: bool,
    pub confidence: f32,
}

/// Nodes that are critical to data flow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriticalNode {
    pub node_id: String,
    pub qualified_name: String,
    pub criticality_score: f32,
    pub incoming_flows: usize,
    pub outgoing_flows: usize,
    pub reason: String,
}

impl DataLineageTracker {
    pub fn new() -> Self {
        Self {
            flow_graph: DiGraph::new(),
            name_to_node: HashMap::new(),
            function_interactions: HashMap::new(),
            cross_file_flows: Vec::new(),
        }
    }

    /// Add a data source node (where data originates)
    pub fn add_source(&mut self, 
        qualified_name: &str, 
        file_path: &str, 
        line: u32,
        source_type: &str
    ) -> NodeIndex {
        let node = DataNode {
            id: format!("source_{}_{}", qualified_name, line),
            node_type: DataNodeType::Source,
            qualified_name: qualified_name.to_string(),
            file_path: file_path.to_string(),
            line,
            depth_from_root: 0,
            metadata: HashMap::from([
                ("source_type".to_string(), source_type.to_string())
            ]),
        };
        
        let idx = self.flow_graph.add_node(node.clone());
        self.name_to_node.insert(node.id.clone(), idx);
        idx
    }

    /// Track data flow from one node to another
    pub fn add_flow(&mut self,
        from: NodeIndex,
        to: NodeIndex,
        transform: DataTransformation
    ) {
        self.flow_graph.add_edge(from, to, transform);
        
        // Update depth
        let from_depth = self.flow_graph.node_weight(from)
            .map(|n| n.depth_from_root)
            .unwrap_or(0);
        
        if let Some(to_node) = self.flow_graph.node_weight_mut(to) {
            to_node.depth_from_root = from_depth + 1;
        }
    }

    /// Track a function call with data flow
    pub fn track_function_call(&mut self,
        _caller: &str,
        callee: &str,
        arguments: Vec<(String, NodeIndex)>, // (param_name, data_node)
        return_node: Option<NodeIndex>,
        file_path: &str,
        line: u32
    ) {
        // Create parameter nodes for the callee
        for (param_name, arg_node) in arguments {
            let param_node = DataNode {
                id: format!("param_{}_{}_{}", callee, param_name, line),
                node_type: DataNodeType::Parameter,
                qualified_name: format!("{}::{}", callee, param_name),
                file_path: file_path.to_string(),
                line,
                depth_from_root: 0, // Will be updated
                metadata: HashMap::new(),
            };
            
            let param_idx = self.flow_graph.add_node(param_node.clone());
            self.name_to_node.insert(param_node.id.clone(), param_idx);
            
            // Connect argument to parameter
            self.add_flow(arg_node, param_idx, DataTransformation {
                transform_type: TransformType::FunctionCall,
                function_name: callee.to_string(),
                confidence: 1.0,
                preserves_structure: true,
                may_filter: false,
                may_augment: false,
            });
            
            // Track function interaction
            self.function_interactions
                .entry(callee.to_string())
                .or_default()
                .reads.insert(param_node.id);
        }
        
        // Track return value flow if exists
        if let Some(ret_idx) = return_node {
            self.function_interactions
                .entry(callee.to_string())
                .or_default()
                .writes.insert(
                    self.flow_graph.node_weight(ret_idx)
                        .map(|n| n.id.clone())
                        .unwrap_or_default()
                );
        }
    }

    /// Find all paths from a source to any sink
    pub fn trace_from_source(&self, source_name: &str) -> Vec<DataFlowPath> {
        let mut paths = Vec::new();
        
        if let Some(&source_idx) = self.name_to_node.get(source_name) {
            // Find all sink nodes
            let sinks: Vec<_> = self.flow_graph.node_indices()
                .filter(|&idx| {
                    self.flow_graph.node_weight(idx)
                        .map(|n| n.node_type == DataNodeType::Sink)
                        .unwrap_or(false)
                })
                .collect();
            
            // Find paths to each sink
            for sink_idx in sinks {
                let paths_to_sink: Vec<Vec<NodeIndex>> = 
                    all_simple_paths(&self.flow_graph, source_idx, sink_idx, 0, None)
                    .collect();
                
                for path in paths_to_sink {
                    paths.push(self.convert_to_flow_path(&path));
                }
            }
        }
        
        paths
    }

    /// Find the deepest rooted data flows
    pub fn find_deepest_flows(&self, limit: usize) -> Vec<DataFlowPath> {
        let mut all_paths = Vec::new();
        
        // Find all source nodes
        let sources: Vec<_> = self.flow_graph.node_indices()
            .filter(|&idx| {
                self.flow_graph.node_weight(idx)
                    .map(|n| n.node_type == DataNodeType::Source)
                    .unwrap_or(false)
            })
            .collect();
        
        // DFS from each source to find maximum depth
        for source in sources {
            let mut dfs = Dfs::new(&self.flow_graph, source);
            let mut max_depth = 0;
            let mut deepest_node = source;
            
            while let Some(node) = dfs.next(&self.flow_graph) {
                if let Some(n) = self.flow_graph.node_weight(node) {
                    if n.depth_from_root > max_depth {
                        max_depth = n.depth_from_root;
                        deepest_node = node;
                    }
                }
            }
            
            // Reconstruct path from source to deepest
            if let Some(path) = self.find_path(source, deepest_node) {
                all_paths.push(self.convert_to_flow_path(&path));
            }
        }
        
        // Sort by depth and return top N
        all_paths.sort_by(|a, b| b.depth.cmp(&a.depth));
        all_paths.truncate(limit);
        all_paths
    }

    /// Identify critical nodes (high fan-in/fan-out)
    pub fn find_critical_nodes(&self) -> Vec<CriticalNode> {
        let mut critical_nodes = Vec::new();
        
        for idx in self.flow_graph.node_indices() {
            if let Some(node) = self.flow_graph.node_weight(idx) {
                let incoming = self.flow_graph.edges_directed(idx, petgraph::Direction::Incoming).count();
                let outgoing = self.flow_graph.edges_directed(idx, petgraph::Direction::Outgoing).count();
                
                // Calculate criticality score
                let criticality = (incoming * outgoing) as f32 + 
                                 (incoming + outgoing) as f32 / 2.0;
                
                if criticality > 5.0 { // Threshold for critical
                    let reason = if incoming > 3 && outgoing > 3 {
                        "High fan-in and fan-out - central data hub"
                    } else if incoming > 5 {
                        "High fan-in - data aggregation point"
                    } else if outgoing > 5 {
                        "High fan-out - data distribution point"
                    } else {
                        "Complex data transformation point"
                    };
                    
                    critical_nodes.push(CriticalNode {
                        node_id: node.id.clone(),
                        qualified_name: node.qualified_name.clone(),
                        criticality_score: criticality,
                        incoming_flows: incoming,
                        outgoing_flows: outgoing,
                        reason: reason.to_string(),
                    });
                }
            }
        }
        
        critical_nodes.sort_by(|a, b| b.criticality_score.partial_cmp(&a.criticality_score).unwrap());
        critical_nodes
    }

    /// Analyze cross-file data flows
    pub fn analyze_cross_file_flows(&mut self) -> Vec<CrossFileFlow> {
        let mut flows = Vec::new();
        
        for edge in self.flow_graph.edge_indices() {
            if let Some((from_idx, to_idx)) = self.flow_graph.edge_endpoints(edge) {
                if let (Some(from_node), Some(to_node)) = (
                    self.flow_graph.node_weight(from_idx),
                    self.flow_graph.node_weight(to_idx)
                ) {
                    if from_node.file_path != to_node.file_path {
                        let path = self.find_path(from_idx, to_idx)
                            .map(|p| p.iter().filter_map(|&idx| {
                                self.flow_graph.node_weight(idx).map(|n| n.id.clone())
                            }).collect())
                            .unwrap_or_default();
                        
                        flows.push(CrossFileFlow {
                            source_file: from_node.file_path.clone(),
                            source_line: from_node.line,
                            source_symbol: from_node.qualified_name.clone(),
                            target_file: to_node.file_path.clone(),
                            target_line: to_node.line,
                            target_symbol: to_node.qualified_name.clone(),
                            flow_type: FlowType::FunctionCall, // TODO: Detect actual type
                            data_path: path,
                        });
                    }
                }
            }
        }
        
        self.cross_file_flows = flows.clone();
        flows
    }

    /// Get complete lineage analysis
    pub fn analyze(&mut self) -> DataLineageAnalysis {
        // First, properly calculate depths from the graph structure
        self.recalculate_depths();
        
        let max_depth = self.flow_graph.node_indices()
            .filter_map(|idx| self.flow_graph.node_weight(idx).map(|n| n.depth_from_root))
            .max()
            .unwrap_or(0);
        
        DataLineageAnalysis {
            total_nodes: self.flow_graph.node_count(),
            total_edges: self.flow_graph.edge_count(),
            max_depth,
            deepest_paths: self.find_deepest_flows(5),
            critical_nodes: self.find_critical_nodes(),
            data_islands: self.find_disconnected_subgraphs(),
            cross_file_flows: self.analyze_cross_file_flows(),
            complexity_score: self.calculate_complexity_score(),
        }
    }
    
    /// Recalculate depths from root nodes using BFS
    fn recalculate_depths(&mut self) {
        use std::collections::VecDeque;
        
        // Find all source nodes (nodes with no incoming edges)
        let sources: Vec<_> = self.flow_graph.node_indices()
            .filter(|&idx| {
                self.flow_graph.neighbors_directed(idx, petgraph::Direction::Incoming).count() == 0
            })
            .collect();
        
        // Reset all depths to max value initially
        for idx in self.flow_graph.node_indices() {
            if let Some(node) = self.flow_graph.node_weight_mut(idx) {
                node.depth_from_root = u32::MAX;
            }
        }
        
        // BFS from each source to calculate minimum depths
        for source in sources {
            let mut queue = VecDeque::new();
            queue.push_back((source, 0));
            
            while let Some((current_idx, depth)) = queue.pop_front() {
                // Update depth if we found a shorter path
                if let Some(current_node) = self.flow_graph.node_weight_mut(current_idx) {
                    if depth < current_node.depth_from_root {
                        current_node.depth_from_root = depth;
                        
                        // Add neighbors to queue with incremented depth
                        for neighbor in self.flow_graph.neighbors_directed(current_idx, petgraph::Direction::Outgoing) {
                            queue.push_back((neighbor, depth + 1));
                        }
                    }
                }
            }
        }
        
        // Convert any remaining MAX values to 0 (disconnected nodes)
        for idx in self.flow_graph.node_indices() {
            if let Some(node) = self.flow_graph.node_weight_mut(idx) {
                if node.depth_from_root == u32::MAX {
                    node.depth_from_root = 0;
                }
            }
        }
    }

    // Helper methods
    
    fn find_path(&self, from: NodeIndex, to: NodeIndex) -> Option<Vec<NodeIndex>> {
        // Simple BFS path finding
        let mut queue = VecDeque::new();
        let mut visited = HashMap::new();
        
        queue.push_back(from);
        visited.insert(from, None);
        
        while let Some(current) = queue.pop_front() {
            if current == to {
                // Reconstruct path
                let mut path = vec![current];
                let mut node = current;
                
                while let Some(&Some(parent)) = visited.get(&node) {
                    path.push(parent);
                    node = parent;
                }
                
                path.reverse();
                return Some(path);
            }
            
            for neighbor in self.flow_graph.neighbors(current) {
                if !visited.contains_key(&neighbor) {
                    visited.insert(neighbor, Some(current));
                    queue.push_back(neighbor);
                }
            }
        }
        
        None
    }
    
    fn convert_to_flow_path(&self, indices: &[NodeIndex]) -> DataFlowPath {
        let path: Vec<_> = indices.iter()
            .filter_map(|&idx| self.flow_graph.node_weight(idx).map(|n| n.qualified_name.clone()))
            .collect();
        
        let depth = indices.len() as u32;
        
        let transformations = indices.windows(2)
            .filter_map(|pair| {
                self.flow_graph.find_edge(pair[0], pair[1])
                    .and_then(|e| self.flow_graph.edge_weight(e))
                    .map(|t| format!("{:?}: {}", t.transform_type, t.function_name))
            })
            .collect();
        
        let crosses_files = indices.windows(2).any(|pair| {
            let file1 = self.flow_graph.node_weight(pair[0]).map(|n| &n.file_path);
            let file2 = self.flow_graph.node_weight(pair[1]).map(|n| &n.file_path);
            file1 != file2
        });
        
        DataFlowPath {
            path,
            depth,
            transformations,
            crosses_files,
            confidence: 0.9, // TODO: Calculate actual confidence
        }
    }
    
    fn find_disconnected_subgraphs(&self) -> Vec<Vec<String>> {
        let mut visited = HashSet::new();
        let mut islands = Vec::new();
        
        for node in self.flow_graph.node_indices() {
            if !visited.contains(&node) {
                let mut island = Vec::new();
                let mut dfs = Dfs::new(&self.flow_graph, node);
                
                while let Some(n) = dfs.next(&self.flow_graph) {
                    visited.insert(n);
                    if let Some(node_data) = self.flow_graph.node_weight(n) {
                        island.push(node_data.qualified_name.clone());
                    }
                }
                
                if island.len() > 1 {
                    islands.push(island);
                }
            }
        }
        
        islands
    }
    
    fn calculate_complexity_score(&self) -> f32 {
        let nodes = self.flow_graph.node_count() as f32;
        let edges = self.flow_graph.edge_count() as f32;
        let cross_file = self.cross_file_flows.len() as f32;
        
        // Complexity based on graph density and cross-file flows
        (edges / nodes.max(1.0)) * (1.0 + cross_file / 10.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deep_data_flow() {
        let mut tracker = DataLineageTracker::new();
        
        // Create a deep flow: user_input -> validate -> transform -> process -> save
        let source = tracker.add_source("user_input", "api.py", 10, "http_request");
        
        let validate_param = tracker.flow_graph.add_node(DataNode {
            id: "validate_param".to_string(),
            node_type: DataNodeType::Parameter,
            qualified_name: "validate::data".to_string(),
            file_path: "validators.py".to_string(),
            line: 20,
            depth_from_root: 0,
            metadata: HashMap::new(),
        });
        
        let transform_result = tracker.flow_graph.add_node(DataNode {
            id: "transform_result".to_string(),
            node_type: DataNodeType::Transformation,
            qualified_name: "transform::result".to_string(),
            file_path: "processors.py".to_string(),
            line: 30,
            depth_from_root: 0,
            metadata: HashMap::new(),
        });
        
        let process_output = tracker.flow_graph.add_node(DataNode {
            id: "process_output".to_string(),
            node_type: DataNodeType::ReturnValue,
            qualified_name: "process::output".to_string(),
            file_path: "handlers.py".to_string(),
            line: 40,
            depth_from_root: 0,
            metadata: HashMap::new(),
        });
        
        // Build the flow chain: source -> validate -> transform -> process
        tracker.add_flow(source, validate_param, DataTransformation {
            transform_type: TransformType::FunctionCall,
            function_name: "validate".to_string(),
            confidence: 1.0,
            preserves_structure: true,
            may_filter: true,
            may_augment: false,
        });
        
        tracker.add_flow(validate_param, transform_result, DataTransformation {
            transform_type: TransformType::FunctionCall,
            function_name: "transform".to_string(),
            confidence: 1.0,
            preserves_structure: false,
            may_filter: false,
            may_augment: true,
        });
        
        tracker.add_flow(transform_result, process_output, DataTransformation {
            transform_type: TransformType::FunctionCall,
            function_name: "process".to_string(),
            confidence: 1.0,
            preserves_structure: true,
            may_filter: false,
            may_augment: false,
        });
        
        // Analyze the flow
        let analysis = tracker.analyze();
        
        // Now we should have: source(0) -> validate(1) -> transform(2) -> process(3)
        // So max_depth should be 3, which is >= 2
        assert!(analysis.max_depth >= 2);
        assert!(analysis.cross_file_flows.len() >= 1);
    }
}