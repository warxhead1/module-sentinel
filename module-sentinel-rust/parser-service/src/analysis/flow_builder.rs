use std::collections::{HashMap, HashSet};
use anyhow::Result;
use serde::{Serialize, Deserialize};
use crate::database::{Database, models::UniversalSymbol};
use crate::database::flow_models::{SymbolCall, DataFlow, CriticalPath, DeepFlow};

/// Flow graph node representing a symbol in the call graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowNode {
    pub id: i32,
    pub name: String,
    pub kind: String,
    pub file: String,
    pub line: i32,
}

/// Flow graph edge representing a relationship
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowEdge {
    pub source: i32,
    pub target: i32,
    pub edge_type: EdgeType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EdgeType {
    Call,
    DataFlow,
    Import,
    BelongsTo,
}

/// Complete flow graph with nodes and edges
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowGraph {
    pub nodes: HashMap<i32, FlowNode>,
    pub edges: Vec<FlowEdge>,
    pub incoming: HashMap<i32, Vec<i32>>, // node_id -> list of source nodes
    pub outgoing: HashMap<i32, Vec<i32>>, // node_id -> list of target nodes
}

impl FlowGraph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: Vec::new(),
            incoming: HashMap::new(),
            outgoing: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, node: FlowNode) {
        let node_id = node.id;
        self.nodes.insert(node_id, node);
        self.incoming.entry(node_id).or_insert_with(Vec::new);
        self.outgoing.entry(node_id).or_insert_with(Vec::new);
    }

    pub fn add_edge(&mut self, source: i32, target: i32, edge_type: EdgeType) {
        self.edges.push(FlowEdge {
            source,
            target,
            edge_type,
        });

        // Update adjacency lists
        self.outgoing.entry(source).or_insert_with(Vec::new).push(target);
        self.incoming.entry(target).or_insert_with(Vec::new).push(source);
    }

    pub fn nodes(&self) -> impl Iterator<Item = &FlowNode> {
        self.nodes.values()
    }

    pub fn node(&self, id: i32) -> Option<&FlowNode> {
        self.nodes.get(&id)
    }

    pub fn incoming_edges(&self, node_id: i32) -> impl Iterator<Item = i32> + '_ {
        self.incoming.get(&node_id).map(|v| v.iter().copied()).unwrap_or_default().into_iter()
    }

    pub fn outgoing_edges(&self, node_id: i32) -> impl Iterator<Item = i32> + '_ {
        self.outgoing.get(&node_id).map(|v| v.iter().copied()).unwrap_or_default().into_iter()
    }
}

/// Flow builder - creates flow graphs from database
pub struct FlowBuilder {
    db: Database,
}

impl FlowBuilder {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Build flow graph from symbols in database - no abstractions
    pub async fn build_from_symbols(&self, project_id: i32) -> Result<FlowGraph> {
        let mut graph = FlowGraph::new();

        // Get all symbols for this project
        let symbols = self.query_symbols(project_id).await?;
        let calls = self.query_calls(project_id).await?;
        let flows = self.query_flows(project_id).await?;

        // Add nodes to graph
        for symbol in symbols {
            graph.add_node(FlowNode {
                id: symbol.id.unwrap_or(0),
                name: symbol.name.clone(),
                kind: symbol.kind.clone(),
                file: symbol.file_path.clone(),
                line: symbol.line,
            });
        }

        // Add call edges
        for call in calls {
            graph.add_edge(call.caller_id, call.callee_id, EdgeType::Call);
        }

        // Add data flow edges
        for flow in flows {
            // Parse the flow path JSON
            if let Ok(path) = serde_json::from_str::<Vec<i32>>(&flow.flow_path) {
                for window in path.windows(2) {
                    graph.add_edge(window[0], window[1], EdgeType::DataFlow);
                }
            }
        }

        Ok(graph)
    }

    /// Find critical paths in the system - simple fan-in/fan-out analysis
    pub fn find_critical_paths(&self, graph: &FlowGraph, threshold: f64) -> Vec<CriticalPath> {
        let mut critical = Vec::new();

        for node in graph.nodes() {
            let fan_in = graph.incoming_edges(node.id).count() as i32;
            let fan_out = graph.outgoing_edges(node.id).count() as i32;

            // Simple criticality score
            let score = (fan_in * fan_out) as f64 + (fan_in + fan_out) as f64 / 2.0;

            if score > threshold {
                critical.push(CriticalPath {
                    id: None,
                    symbol_id: node.id,
                    symbol_name: node.name.clone(),
                    file_path: node.file.clone(),
                    line: node.line,
                    fan_in,
                    fan_out,
                    criticality_score: score,
                    project_id: 1, // TODO: get from context
                    created_at: chrono::Utc::now().to_rfc3339(),
                });
            }
        }

        // Sort by criticality score
        critical.sort_by(|a, b| b.criticality_score.partial_cmp(&a.criticality_score).unwrap());
        critical
    }

    /// Find deepest flow paths using DFS
    pub fn trace_deepest_flows(&self, graph: &FlowGraph, limit: usize) -> Vec<DeepFlow> {
        let mut flows = Vec::new();

        // DFS from each node to find deepest paths
        for node in graph.nodes() {
            let mut visited = HashSet::new();
            let mut path = Vec::new();

            self.dfs_deepest(node.id, graph, &mut visited, &mut path, &mut flows);
        }

        // Sort by depth and take top N
        flows.sort_by_key(|f| std::cmp::Reverse(f.depth));
        flows.truncate(limit);
        flows
    }

    /// DFS to find deepest paths
    fn dfs_deepest(
        &self,
        node_id: i32,
        graph: &FlowGraph,
        visited: &mut HashSet<i32>,
        path: &mut Vec<i32>,
        flows: &mut Vec<DeepFlow>
    ) {
        if visited.contains(&node_id) {
            return; // Cycle detection
        }

        visited.insert(node_id);
        path.push(node_id);

        let outgoing: Vec<i32> = graph.outgoing_edges(node_id).collect();

        if outgoing.is_empty() {
            // Leaf node - record the flow
            flows.push(DeepFlow {
                id: None,
                flow_path: serde_json::to_string(path).unwrap_or_default(),
                depth: path.len() as i32,
                project_id: 1, // TODO: get from context
                start_symbol_id: path.first().copied().unwrap_or(0),
                end_symbol_id: node_id,
                created_at: chrono::Utc::now().to_rfc3339(),
            });
        } else {
            for target in outgoing {
                self.dfs_deepest(target, graph, visited, path, flows);
            }
        }

        path.pop();
        visited.remove(&node_id);
    }

    // Database query helpers

    async fn query_symbols(&self, project_id: i32) -> Result<Vec<UniversalSymbol>> {
        // Direct SQLite query - no ORM abstractions
        let query = "SELECT * FROM universal_symbols WHERE project_id = ?";
        self.db.query_symbols_raw(query, &[project_id.into()]).await
    }

    async fn query_calls(&self, project_id: i32) -> Result<Vec<SymbolCall>> {
        let query = "SELECT * FROM symbol_calls WHERE project_id = ?";
        self.db.query_calls_raw(query, &[project_id.into()]).await
    }

    async fn query_flows(&self, project_id: i32) -> Result<Vec<DataFlow>> {
        let query = "SELECT * FROM data_flows WHERE project_id = ?";
        self.db.query_flows_raw(query, &[project_id.into()]).await
    }
}

/// Anomaly detection - find weird stuff in the code
pub struct AnomalyDetector;

impl AnomalyDetector {
    /// Detect anomalies in the flow graph
    pub fn detect_anomalies(&self, graph: &FlowGraph) -> Vec<Anomaly> {
        let mut anomalies = Vec::new();

        // Find nodes with high fan-in but low fan-out (potential bottlenecks)
        for node in graph.nodes() {
            let fan_in = graph.incoming_edges(node.id).count();
            let fan_out = graph.outgoing_edges(node.id).count();

            // High input, low output = bottleneck
            if fan_in > 10 && fan_out < 2 {
                anomalies.push(Anomaly {
                    kind: "BOTTLENECK".to_string(),
                    location: format!("{}:{}", node.file, node.line),
                    severity: "HIGH".to_string(),
                    message: format!("Symbol '{}' has {} inputs but only {} outputs", node.name, fan_in, fan_out),
                });
            }

            // No outgoing connections (dead end)
            if fan_in > 0 && fan_out == 0 && !node.kind.contains("return") {
                anomalies.push(Anomaly {
                    kind: "DEAD_END".to_string(),
                    location: format!("{}:{}", node.file, node.line),
                    severity: "MEDIUM".to_string(),
                    message: format!("Symbol '{}' receives data but never outputs it", node.name),
                });
            }

            // No incoming connections (potential unused code)
            if fan_in == 0 && fan_out > 0 && !node.name.contains("main") && !node.kind.contains("export") {
                anomalies.push(Anomaly {
                    kind: "UNUSED_CODE".to_string(),
                    location: format!("{}:{}", node.file, node.line),
                    severity: "LOW".to_string(),
                    message: format!("Symbol '{}' may be unused (no incoming references)", node.name),
                });
            }
        }

        anomalies
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Anomaly {
    pub kind: String,
    pub location: String,
    pub severity: String,
    pub message: String,
}