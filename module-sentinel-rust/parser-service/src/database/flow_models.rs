use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use anyhow::Result;
use crate::database::orm::{Model, DatabaseValue};

/// Direct symbol call relationships - for call graph analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolCall {
    pub id: Option<i32>,
    pub caller_id: i32,
    pub callee_id: i32,
    pub call_site_line: i32,
    pub call_type: String, // 'direct', 'async', 'callback'
    pub project_id: i32,
    pub created_at: String,
}

impl Default for SymbolCall {
    fn default() -> Self {
        Self {
            id: None,
            caller_id: 0,
            callee_id: 0,
            call_site_line: 0,
            call_type: "direct".to_string(),
            project_id: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for SymbolCall {
    fn table_name() -> &'static str { "symbol_calls" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "caller_id", "callee_id", "call_site_line", "call_type", "project_id", "created_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("caller_id".to_string(), DatabaseValue::Integer(self.caller_id as i64));
        values.insert("callee_id".to_string(), DatabaseValue::Integer(self.callee_id as i64));
        values.insert("call_site_line".to_string(), DatabaseValue::Integer(self.call_site_line as i64));
        values.insert("call_type".to_string(), self.call_type.clone().into());
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            caller_id: match values.get("caller_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            callee_id: match values.get("callee_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            call_site_line: match values.get("call_site_line") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            call_type: match values.get("call_type") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => "direct".to_string(),
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}

/// Data flow paths - tracks how data moves through the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataFlow {
    pub id: Option<i32>,
    pub source_id: i32,
    pub sink_id: i32,
    pub flow_path: String, // JSON array of symbol IDs
    pub transformations: Option<String>, // JSON array of operations
    pub project_id: i32,
    pub confidence: f64,
    pub created_at: String,
}

impl Default for DataFlow {
    fn default() -> Self {
        Self {
            id: None,
            source_id: 0,
            sink_id: 0,
            flow_path: "[]".to_string(),
            transformations: None,
            project_id: 0,
            confidence: 1.0,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for DataFlow {
    fn table_name() -> &'static str { "data_flows" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "source_id", "sink_id", "flow_path", "transformations", "project_id", "confidence", "created_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("source_id".to_string(), DatabaseValue::Integer(self.source_id as i64));
        values.insert("sink_id".to_string(), DatabaseValue::Integer(self.sink_id as i64));
        values.insert("flow_path".to_string(), self.flow_path.clone().into());
        values.insert("transformations".to_string(), self.transformations.clone().into());
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("confidence".to_string(), DatabaseValue::Real(self.confidence));
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            source_id: match values.get("source_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            sink_id: match values.get("sink_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            flow_path: match values.get("flow_path") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => "[]".to_string(),
            },
            transformations: match values.get("transformations") {
                Some(DatabaseValue::Text(s)) => Some(s.clone()),
                Some(DatabaseValue::Null) => None,
                _ => None,
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            confidence: match values.get("confidence") {
                Some(DatabaseValue::Real(r)) => *r,
                Some(DatabaseValue::Integer(i)) => *i as f64,
                _ => 1.0,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}

/// Critical path analysis results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriticalPath {
    pub id: Option<i32>,
    pub symbol_id: i32,
    pub symbol_name: String,
    pub file_path: String,
    pub line: i32,
    pub fan_in: i32,
    pub fan_out: i32,
    pub criticality_score: f64,
    pub project_id: i32,
    pub created_at: String,
}

impl Default for CriticalPath {
    fn default() -> Self {
        Self {
            id: None,
            symbol_id: 0,
            symbol_name: String::new(),
            file_path: String::new(),
            line: 0,
            fan_in: 0,
            fan_out: 0,
            criticality_score: 0.0,
            project_id: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for CriticalPath {
    fn table_name() -> &'static str { "critical_paths" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "symbol_id", "symbol_name", "file_path", "line", "fan_in", "fan_out", "criticality_score", "project_id", "created_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("symbol_id".to_string(), DatabaseValue::Integer(self.symbol_id as i64));
        values.insert("symbol_name".to_string(), self.symbol_name.clone().into());
        values.insert("file_path".to_string(), self.file_path.clone().into());
        values.insert("line".to_string(), DatabaseValue::Integer(self.line as i64));
        values.insert("fan_in".to_string(), DatabaseValue::Integer(self.fan_in as i64));
        values.insert("fan_out".to_string(), DatabaseValue::Integer(self.fan_out as i64));
        values.insert("criticality_score".to_string(), DatabaseValue::Real(self.criticality_score));
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            symbol_id: match values.get("symbol_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            symbol_name: match values.get("symbol_name") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            file_path: match values.get("file_path") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
            line: match values.get("line") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            fan_in: match values.get("fan_in") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            fan_out: match values.get("fan_out") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            criticality_score: match values.get("criticality_score") {
                Some(DatabaseValue::Real(r)) => *r,
                Some(DatabaseValue::Integer(i)) => *i as f64,
                _ => 0.0,
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}

/// Deep flow traces for data lineage analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepFlow {
    pub id: Option<i32>,
    pub flow_path: String, // JSON array of symbol IDs
    pub depth: i32,
    pub project_id: i32,
    pub start_symbol_id: i32,
    pub end_symbol_id: i32,
    pub created_at: String,
}

impl Default for DeepFlow {
    fn default() -> Self {
        Self {
            id: None,
            flow_path: "[]".to_string(),
            depth: 0,
            project_id: 0,
            start_symbol_id: 0,
            end_symbol_id: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Model for DeepFlow {
    fn table_name() -> &'static str { "deep_flows" }
    
    fn get_id(&self) -> Option<i64> {
        self.id.map(|id| id as i64)
    }
    
    fn set_id(&mut self, id: i64) {
        self.id = Some(id as i32);
    }
    
    fn field_names() -> Vec<&'static str> {
        vec!["id", "flow_path", "depth", "project_id", "start_symbol_id", "end_symbol_id", "created_at"]
    }
    
    fn to_field_values(&self) -> HashMap<String, DatabaseValue> {
        let mut values = HashMap::new();
        values.insert("id".to_string(), self.id.map(|id| id as i64).into());
        values.insert("flow_path".to_string(), self.flow_path.clone().into());
        values.insert("depth".to_string(), DatabaseValue::Integer(self.depth as i64));
        values.insert("project_id".to_string(), DatabaseValue::Integer(self.project_id as i64));
        values.insert("start_symbol_id".to_string(), DatabaseValue::Integer(self.start_symbol_id as i64));
        values.insert("end_symbol_id".to_string(), DatabaseValue::Integer(self.end_symbol_id as i64));
        values.insert("created_at".to_string(), self.created_at.clone().into());
        values
    }
    
    fn from_field_values(values: HashMap<String, DatabaseValue>) -> Result<Self> {
        Ok(Self {
            id: match values.get("id") {
                Some(DatabaseValue::Integer(i)) => Some(*i as i32),
                _ => None,
            },
            flow_path: match values.get("flow_path") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => "[]".to_string(),
            },
            depth: match values.get("depth") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            project_id: match values.get("project_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            start_symbol_id: match values.get("start_symbol_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            end_symbol_id: match values.get("end_symbol_id") {
                Some(DatabaseValue::Integer(i)) => *i as i32,
                _ => 0,
            },
            created_at: match values.get("created_at") {
                Some(DatabaseValue::Text(s)) => s.clone(),
                _ => String::new(),
            },
        })
    }
}