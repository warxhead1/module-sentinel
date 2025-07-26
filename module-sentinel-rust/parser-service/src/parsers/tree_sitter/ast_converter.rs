use anyhow::Result;
use tree_sitter::{Tree, Node};
use crate::ast::{UniversalAst, UniversalNode, NodeId, NodeLocation, SourceLocation};
use super::language::Language;

pub struct AstConverter {
    language: Language,
}

impl AstConverter {
    pub fn new(language: Language) -> Self {
        Self { language }
    }
    
    pub fn convert(&self, tree: &Tree) -> Result<UniversalAst> {
        let source = ""; // TODO: Pass source code
        let mut ast = UniversalAst::new(self.language.id().to_string(), source.to_string());
        
        let root_node = tree.root_node();
        let root_id = self.convert_node(&mut ast, root_node)?;
        ast.set_root(root_id);
        
        Ok(ast)
    }
    
    fn convert_node(&self, ast: &mut UniversalAst, node: Node) -> Result<NodeId> {
        let universal_node = match self.language {
            Language::Rust => self.convert_rust_node(node, ast)?,
            Language::TypeScript => self.convert_typescript_node(node, ast)?,
            Language::Python => self.convert_python_node(node, ast)?,
            Language::Cpp => self.convert_cpp_node(node, ast)?,
            _ => self.convert_generic_node(node, ast)?,
        };
        
        let location = self.node_to_location(node);
        Ok(ast.add_node(universal_node, location))
    }
    
    fn convert_rust_node(&self, node: Node, ast: &mut UniversalAst) -> Result<UniversalNode> {
        match node.kind() {
            "function_item" => {
                let name = self.get_child_text(node, "identifier").unwrap_or_default();
                let params = vec![]; // TODO: Extract parameters
                let body = None; // TODO: Convert body
                
                Ok(UniversalNode::Function {
                    name,
                    params,
                    return_type: None,
                    body,
                    modifiers: vec![],
                    type_parameters: vec![],
                    is_async: false,
                    is_generator: false,
                })
            }
            "source_file" => {
                let children = self.convert_children(ast, node)?;
                Ok(UniversalNode::Module {
                    name: "main".to_string(),
                    exports: children,
                    imports: vec![],
                })
            }
            _ => self.convert_generic_node(node, ast),
        }
    }
    
    fn convert_typescript_node(&self, node: Node, ast: &mut UniversalAst) -> Result<UniversalNode> {
        match node.kind() {
            "function_declaration" => {
                let name = self.get_child_text(node, "identifier").unwrap_or_default();
                Ok(UniversalNode::Function {
                    name,
                    params: vec![],
                    return_type: None,
                    body: None,
                    modifiers: vec![],
                    type_parameters: vec![],
                    is_async: false,
                    is_generator: false,
                })
            }
            "interface_declaration" => {
                let name = self.get_child_text(node, "identifier").unwrap_or_default();
                Ok(UniversalNode::Interface {
                    name,
                    extends: vec![],
                    members: vec![],
                    type_parameters: vec![],
                })
            }
            "program" => {
                let children = self.convert_children(ast, node)?;
                Ok(UniversalNode::Module {
                    name: "main".to_string(),
                    exports: children,
                    imports: vec![],
                })
            }
            _ => self.convert_generic_node(node, ast),
        }
    }
    
    fn convert_python_node(&self, node: Node, ast: &mut UniversalAst) -> Result<UniversalNode> {
        match node.kind() {
            "function_definition" => {
                let name = self.get_child_text(node, "identifier").unwrap_or_default();
                Ok(UniversalNode::Function {
                    name,
                    params: vec![],
                    return_type: None,
                    body: None,
                    modifiers: vec![],
                    type_parameters: vec![],
                    is_async: false,
                    is_generator: false,
                })
            }
            "module" => {
                let children = self.convert_children(ast, node)?;
                Ok(UniversalNode::Module {
                    name: "main".to_string(),
                    exports: children,
                    imports: vec![],
                })
            }
            _ => self.convert_generic_node(node, ast),
        }
    }
    
    fn convert_cpp_node(&self, node: Node, ast: &mut UniversalAst) -> Result<UniversalNode> {
        match node.kind() {
            "class_specifier" => {
                let name = self.get_child_text(node, "identifier").unwrap_or_default();
                Ok(UniversalNode::Class {
                    name,
                    base: None,
                    interfaces: vec![],
                    members: vec![],
                    modifiers: vec![],
                    type_parameters: vec![],
                })
            }
            "translation_unit" => {
                let children = self.convert_children(ast, node)?;
                Ok(UniversalNode::Module {
                    name: "main".to_string(),
                    exports: children,
                    imports: vec![],
                })
            }
            _ => self.convert_generic_node(node, ast),
        }
    }
    
    fn convert_generic_node(&self, node: Node, _ast: &mut UniversalAst) -> Result<UniversalNode> {
        Ok(UniversalNode::LanguageSpecific {
            kind: node.kind().to_string(),
            data: serde_json::Value::Null,
            children: vec![],
        })
    }
    
    fn convert_children(&self, ast: &mut UniversalAst, node: Node) -> Result<Vec<NodeId>> {
        let mut children = Vec::new();
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                children.push(self.convert_node(ast, child)?);
            }
        }
        Ok(children)
    }
    
    fn get_child_text(&self, node: Node, kind: &str) -> Option<String> {
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                if child.kind() == kind {
                    return Some(child.utf8_text(&[]).ok()?.to_string());
                }
            }
        }
        None
    }
    
    fn node_to_location(&self, node: Node) -> NodeLocation {
        NodeLocation {
            start: SourceLocation {
                line: node.start_position().row as u32 + 1,
                column: node.start_position().column as u32,
                offset: node.start_byte(),
            },
            end: SourceLocation {
                line: node.end_position().row as u32 + 1,
                column: node.end_position().column as u32,
                offset: node.end_byte(),
            },
            text_range: (node.start_byte(), node.end_byte()),
        }
    }
}