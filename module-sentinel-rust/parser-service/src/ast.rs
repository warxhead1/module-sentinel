use std::collections::HashMap;
use serde::{Deserialize, Serialize};
pub use shared_types::SourceLocation;

/// Node identifier in the AST arena
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(pub usize);

/// Symbol identifier for resolved references
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SymbolId(pub usize);

/// Universal AST representation that works across all languages
#[derive(Debug, Serialize, Deserialize)]
pub struct UniversalAst {
    pub root: NodeId,
    pub nodes: Vec<UniversalNode>,
    pub source_map: SourceMap,
    pub language_hints: HashMap<NodeId, LanguageHint>,
}

/// Source mapping for accurate location tracking
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SourceMap {
    pub file_path: String,
    pub node_locations: HashMap<NodeId, NodeLocation>,
    pub source_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeLocation {
    pub start: SourceLocation,
    pub end: SourceLocation,
    pub text_range: (usize, usize),
}

/// Language-specific hints for better analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageHint {
    pub language: String,
    pub version: String,
    pub metadata: serde_json::Value,
}

/// Universal node types that capture constructs across all languages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UniversalNode {
    // === Structural Nodes ===
    Module {
        name: String,
        exports: Vec<NodeId>,
        imports: Vec<NodeId>,
    },
    
    Class {
        name: String,
        base: Option<NodeId>,
        interfaces: Vec<NodeId>,
        members: Vec<NodeId>,
        modifiers: Vec<String>,
        type_parameters: Vec<NodeId>,
    },
    
    Interface {
        name: String,
        extends: Vec<NodeId>,
        members: Vec<NodeId>,
        type_parameters: Vec<NodeId>,
    },
    
    Struct {
        name: String,
        members: Vec<NodeId>,
        type_parameters: Vec<NodeId>,
    },
    
    Enum {
        name: String,
        members: Vec<NodeId>,
        base_type: Option<NodeId>,
    },
    
    Namespace {
        name: String,
        children: Vec<NodeId>,
        exports: Vec<NodeId>,
    },
    
    // === Function Nodes ===
    Function {
        name: String,
        params: Vec<NodeId>,
        return_type: Option<NodeId>,
        body: Option<NodeId>,
        modifiers: Vec<String>,
        type_parameters: Vec<NodeId>,
        is_async: bool,
        is_generator: bool,
    },
    
    Method {
        name: String,
        params: Vec<NodeId>,
        return_type: Option<NodeId>,
        body: Option<NodeId>,
        modifiers: Vec<String>,
        type_parameters: Vec<NodeId>,
        is_async: bool,
        is_static: bool,
        is_abstract: bool,
    },
    
    Constructor {
        params: Vec<NodeId>,
        body: Option<NodeId>,
        modifiers: Vec<String>,
        initializers: Vec<NodeId>,
    },
    
    Lambda {
        params: Vec<NodeId>,
        body: NodeId,
        captures: Vec<NodeId>,
        is_async: bool,
    },
    
    // === Variable Nodes ===
    Variable {
        name: String,
        var_type: Option<NodeId>,
        initializer: Option<NodeId>,
        modifiers: Vec<String>,
        is_const: bool,
    },
    
    Parameter {
        name: String,
        param_type: Option<NodeId>,
        default_value: Option<NodeId>,
        is_rest: bool,
        is_optional: bool,
    },
    
    Field {
        name: String,
        field_type: Option<NodeId>,
        initializer: Option<NodeId>,
        modifiers: Vec<String>,
    },
    
    Property {
        name: String,
        prop_type: Option<NodeId>,
        getter: Option<NodeId>,
        setter: Option<NodeId>,
        modifiers: Vec<String>,
    },
    
    // === Type Nodes ===
    TypeAnnotation {
        base: String,
        generics: Vec<NodeId>,
        is_nullable: bool,
        is_array: bool,
    },
    
    GenericParam {
        name: String,
        constraint: Option<NodeId>,
        default: Option<NodeId>,
    },
    
    UnionType {
        types: Vec<NodeId>,
    },
    
    IntersectionType {
        types: Vec<NodeId>,
    },
    
    TypeAlias {
        name: String,
        type_params: Vec<NodeId>,
        target: NodeId,
    },
    
    // === Expression Nodes ===
    Call {
        target: NodeId,
        args: Vec<NodeId>,
        type_args: Vec<NodeId>,
    },
    
    MemberAccess {
        object: NodeId,
        member: String,
        is_optional: bool,
    },
    
    Identifier {
        name: String,
        resolved: Option<SymbolId>,
    },
    
    Literal {
        value: LiteralValue,
    },
    
    BinaryOp {
        op: String,
        left: NodeId,
        right: NodeId,
    },
    
    UnaryOp {
        op: String,
        operand: NodeId,
    },
    
    Assignment {
        target: NodeId,
        value: NodeId,
        op: String,
    },
    
    ArrayLiteral {
        elements: Vec<NodeId>,
    },
    
    ObjectLiteral {
        properties: Vec<(String, NodeId)>,
    },
    
    // === Statement Nodes ===
    Block {
        statements: Vec<NodeId>,
    },
    
    Conditional {
        condition: NodeId,
        then_branch: NodeId,
        else_branch: Option<NodeId>,
    },
    
    Loop {
        kind: LoopKind,
        condition: Option<NodeId>,
        body: NodeId,
        init: Option<NodeId>,
        update: Option<NodeId>,
    },
    
    Return {
        value: Option<NodeId>,
    },
    
    Throw {
        value: NodeId,
    },
    
    Try {
        body: NodeId,
        catch_blocks: Vec<CatchBlock>,
        finally_block: Option<NodeId>,
    },
    
    Switch {
        value: NodeId,
        cases: Vec<SwitchCase>,
        default: Option<NodeId>,
    },
    
    // === Import/Export Nodes ===
    Import {
        source: String,
        items: Vec<ImportItem>,
        is_type_only: bool,
    },
    
    Export {
        items: Vec<ExportItem>,
        source: Option<String>,
        is_type_only: bool,
        is_default: bool,
    },
    
    // === Special Nodes ===
    Decorator {
        name: String,
        args: Vec<NodeId>,
        target: NodeId,
    },
    
    Comment {
        text: String,
        kind: CommentKind,
        associated_node: Option<NodeId>,
    },
    
    Attribute {
        name: String,
        args: Vec<NodeId>,
        target: NodeId,
    },
    
    // === Language-Specific ===
    LanguageSpecific {
        kind: String,
        data: serde_json::Value,
        children: Vec<NodeId>,
    },
}

// === Supporting Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LiteralValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Null,
    Regex(String, String), // pattern, flags
    Template(Vec<TemplatePart>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TemplatePart {
    String(String),
    Expression(NodeId),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LoopKind {
    For,
    While,
    DoWhile,
    ForIn,
    ForOf,
    ForAwait,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatchBlock {
    pub param: Option<NodeId>,
    pub body: NodeId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchCase {
    pub value: Option<NodeId>, // None for default case
    pub body: Vec<NodeId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImportItem {
    Named { name: String, alias: Option<String> },
    Default { alias: String },
    Namespace { alias: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportItem {
    Named { name: String, alias: Option<String> },
    All { alias: Option<String> },
    Value(NodeId),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommentKind {
    Line,
    Block,
    Doc,
}

// === AST Builder ===

impl UniversalAst {
    pub fn new(file_path: String, source_text: String) -> Self {
        Self {
            root: NodeId(0),
            nodes: Vec::new(),
            source_map: SourceMap {
                file_path,
                source_text,
                node_locations: HashMap::new(),
            },
            language_hints: HashMap::new(),
        }
    }
    
    pub fn add_node(&mut self, node: UniversalNode, location: NodeLocation) -> NodeId {
        let id = NodeId(self.nodes.len());
        self.nodes.push(node);
        self.source_map.node_locations.insert(id, location);
        id
    }
    
    pub fn get_node(&self, id: NodeId) -> Option<&UniversalNode> {
        self.nodes.get(id.0)
    }
    
    pub fn get_node_mut(&mut self, id: NodeId) -> Option<&mut UniversalNode> {
        self.nodes.get_mut(id.0)
    }
    
    pub fn get_location(&self, id: NodeId) -> Option<&NodeLocation> {
        self.source_map.node_locations.get(&id)
    }
    
    pub fn set_root(&mut self, root: NodeId) {
        self.root = root;
    }
}

// === Visitor Pattern ===

pub trait AstVisitor {
    type Result;
    
    fn visit_node(&mut self, node: &UniversalNode, id: NodeId, ast: &UniversalAst) -> Self::Result;
    
    fn visit_children(&mut self, children: &[NodeId], ast: &UniversalAst) -> Vec<Self::Result> {
        children.iter()
            .filter_map(|&child_id| {
                ast.get_node(child_id)
                    .map(|child| self.visit_node(child, child_id, ast))
            })
            .collect()
    }
}