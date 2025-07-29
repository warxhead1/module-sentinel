use tree_sitter::{Tree, Node, TreeCursor};
use crate::database::models::UniversalRelationship;
use std::collections::HashMap;
use chrono;

/// Direct relationship extraction from AST
/// No fancy abstractions - just extract what we see
pub struct RelationshipExtractor {
    project_id: i32,
}

impl RelationshipExtractor {
    pub fn new(project_id: i32) -> Self {
        Self { project_id }
    }

    /// Helper to create a relationship with proper field values
    fn create_relationship(
        &self,
        from_symbol_id: Option<i32>,
        to_symbol_id: Option<i32>,
        relationship_type: &str,
        node: &Node,
        file_path: &str,
    ) -> UniversalRelationship {
        UniversalRelationship {
            id: None,
            project_id: self.project_id,
            from_symbol_id,
            to_symbol_id,
            relationship_type: relationship_type.to_string(),
            confidence: 0.8,
            context_line: Some(node.start_position().row as i32 + 1),
            context_column: Some(node.start_position().column as i32),
            context_snippet: Some(format!("{}:{}", file_path, node.start_position().row + 1)),
            metadata: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Extract relationships from AST - main entry point
    pub fn extract_from_ast(&self, tree: &Tree, source: &str, file_path: &str, symbol_map: &HashMap<String, i32>) -> Vec<UniversalRelationship> {
        use tracing::debug;
        debug!("Starting relationship extraction with {} symbols in map", symbol_map.len());
        let mut relationships = Vec::new();
        let mut cursor = tree.walk();
        
        // Track current context as we traverse
        let mut context_stack: Vec<(String, Option<i32>)> = Vec::new();
        
        self.extract_relationships_recursive_with_context(&mut cursor, source, file_path, symbol_map, &mut relationships, &mut context_stack);
        
        // Log relationship type breakdown for debugging
        if tracing::enabled!(tracing::Level::DEBUG) {
            use std::collections::HashMap;
            let mut type_counts: HashMap<String, i32> = HashMap::new();
            for rel in &relationships {
                *type_counts.entry(rel.relationship_type.clone()).or_insert(0) += 1;
            }
            debug!("Relationship extraction completed: {} total relationships", relationships.len());
            for (rel_type, count) in type_counts.iter() {
                debug!("  {}: {}", rel_type, count);
            }
        }
        
        relationships
    }

    /// Recursive extraction through the AST with context tracking
    fn extract_relationships_recursive_with_context(
        &self,
        cursor: &mut TreeCursor,
        source: &str,
        file_path: &str,
        symbol_map: &HashMap<String, i32>,
        relationships: &mut Vec<UniversalRelationship>,
        context_stack: &mut Vec<(String, Option<i32>)>,
    ) {
        let node = cursor.node();
        let node_kind = node.kind();
        
        // Track function/method context
        match node_kind {
            "function_declaration" | "method_definition" | "function_definition" | 
            "arrow_function" | "function_expression" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    if let Some(name) = self.extract_text(&name_node, source) {
                        let symbol_id = symbol_map.get(&name).copied();
                        context_stack.push((name, symbol_id));
                    }
                }
            }
            _ => {}
        }
        
        // Extract relationships with current context
        self.extract_node_relationships_with_context(&node, source, file_path, symbol_map, relationships, context_stack);
        
        // Visit children
        if cursor.goto_first_child() {
            loop {
                self.extract_relationships_recursive_with_context(cursor, source, file_path, symbol_map, relationships, context_stack);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
        
        // Pop context when leaving function scope
        match node_kind {
            "function_declaration" | "method_definition" | "function_definition" | 
            "arrow_function" | "function_expression" => {
                context_stack.pop();
            }
            _ => {}
        }
    }


    /// Extract data flow relationships from assignments
    fn extract_data_flow(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
        symbol_map: &HashMap<String, i32>
    ) -> Option<UniversalRelationship> {
        // For assignment: a = b, we have data flow from b to a
        let left = node.child_by_field_name("left")?;
        let right = node.child_by_field_name("right")?;
        
        let target_name = self.extract_text(&left, source)?;
        let source_name = self.extract_text(&right, source)?;
        
        let source_id = symbol_map.get(&source_name).copied();
        let target_id = symbol_map.get(&target_name).copied();
        
        if source_id.is_some() || target_id.is_some() {
            Some(UniversalRelationship {
                id: None,
                project_id: self.project_id,
                from_symbol_id: source_id,
                to_symbol_id: target_id,
                relationship_type: "data_flow".to_string(),
                confidence: 0.8,
                context_line: Some(node.start_position().row as i32 + 1),
                context_column: Some(node.start_position().column as i32),
                context_snippet: Some(self.extract_text(node, source).unwrap_or_default()),
                metadata: Some(format!(r#"{{"flow_type": "assignment", "file": "{}"}}"#, file_path)),
                created_at: chrono::Utc::now().to_rfc3339(),
            })
        } else {
            None
        }
    }



    // Helper methods for text extraction
    
    fn extract_text(&self, node: &Node, source: &str) -> Option<String> {
        let start = node.start_byte();
        let end = node.end_byte();
        if start < source.len() && end <= source.len() && start < end {
            Some(source[start..end].to_string())
        } else {
            None
        }
    }






    /// Extract class inheritance and implementation relationships
    fn extract_class_relationships(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
        symbol_map: &HashMap<String, i32>,
        relationships: &mut Vec<UniversalRelationship>
    ) {
        // Look for extends clause
        if let Some(heritage_clause) = node.child_by_field_name("superclass") {
            if let Some(class_name) = self.extract_text(node, source) {
                if let Some(parent_name) = self.extract_text(&heritage_clause, source) {
                    if let (Some(&from_id), Some(&to_id)) = (symbol_map.get(&class_name), symbol_map.get(&parent_name)) {
                        relationships.push(self.create_relationship(
                            Some(from_id),
                            Some(to_id),
                            "extends",
                            node,
                            file_path,
                        ));
                    }
                }
            }
        }

        // Look for implements clause
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                if child.kind() == "class_heritage" || child.kind() == "implements_clause" {
                    for j in 0..child.child_count() {
                        if let Some(interface) = child.child(j) {
                            if let Some(class_name) = self.extract_text(node, source) {
                                if let Some(interface_name) = self.extract_text(&interface, source) {
                                    if let (Some(&from_id), Some(&to_id)) = (symbol_map.get(&class_name), symbol_map.get(&interface_name)) {
                                        relationships.push(self.create_relationship(
                                            Some(from_id),
                                            Some(to_id),
                                            "implements",
                                            node,
                                            file_path,
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Extract interface relationships
    fn extract_interface_relationships(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
        symbol_map: &HashMap<String, i32>,
        relationships: &mut Vec<UniversalRelationship>
    ) {
        // Look for extends in interface
        if let Some(heritage_clause) = node.child_by_field_name("heritage") {
            if let Some(interface_name) = self.extract_text(node, source) {
                if let Some(parent_name) = self.extract_text(&heritage_clause, source) {
                    if let (Some(&from_id), Some(&to_id)) = (symbol_map.get(&interface_name), symbol_map.get(&parent_name)) {
                        relationships.push(self.create_relationship(
                            Some(from_id),
                            Some(to_id),
                            "extends",
                            node,
                            file_path,
                        ));
                    }
                }
            }
        }
    }



    /// Extract relationships with context awareness
    fn extract_node_relationships_with_context(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
        symbol_map: &HashMap<String, i32>,
        relationships: &mut Vec<UniversalRelationship>,
        context_stack: &Vec<(String, Option<i32>)>,
    ) {
        // Get current function context
        let current_function = context_stack.last();
        
        match node.kind() {
            // Function calls - now we know which function is making the call
            "call_expression" => {
                if let Some(rel) = self.extract_call_relationship_with_context(node, source, file_path, symbol_map, current_function) {
                    relationships.push(rel);
                }
            },
            
            // Constructor calls - now we know which function is instantiating
            "new_expression" => {
                if let Some(rel) = self.extract_constructor_call_with_context(node, source, file_path, symbol_map, current_function) {
                    relationships.push(rel);
                }
            },
            
            // Other relationship types
            "assignment" | "assignment_expression" => {
                if let Some(rel) = self.extract_data_flow(node, source, file_path, symbol_map) {
                    relationships.push(rel);
                }
            },
            
            // Member access with context
            "member_expression" | "property_access_expression" => {
                if let Some(rel) = self.extract_property_access_with_context(node, source, file_path, symbol_map, current_function) {
                    relationships.push(rel);
                }
            },
            
            // Class relationships
            "class_declaration" => {
                self.extract_class_relationships(node, source, file_path, symbol_map, relationships);
            },
            
            "interface_declaration" => {
                self.extract_interface_relationships(node, source, file_path, symbol_map, relationships);
            },
            
            "export_statement" | "export_declaration" => {
                if let Some(rel) = self.extract_export_relationship(node, source, file_path, symbol_map) {
                    relationships.push(rel);
                }
            },
            
            "type_annotation" | "type_reference" => {
                if let Some(rel) = self.extract_type_relationship(node, source, file_path, symbol_map) {
                    relationships.push(rel);
                }
            },
            
            _ => {}
        }
    }
    
    /// Extract call relationship with context
    fn extract_call_relationship_with_context(
        &self,
        node: &Node,
        source: &str,
        file_path: &str,
        symbol_map: &HashMap<String, i32>,
        current_function: Option<&(String, Option<i32>)>,
    ) -> Option<UniversalRelationship> {
        let function_node = node.child_by_field_name("function")?;
        let function_name = self.extract_text(&function_node, source)?;
        
        let caller_id = current_function.and_then(|(_, id)| *id);
        let callee_id = symbol_map.get(&function_name).copied();
        
        if caller_id.is_some() || callee_id.is_some() {
            Some(UniversalRelationship {
                id: None,
                project_id: self.project_id,
                from_symbol_id: caller_id,
                to_symbol_id: callee_id,
                relationship_type: "calls".to_string(),
                confidence: 0.9,
                context_line: Some(node.start_position().row as i32 + 1),
                context_column: Some(node.start_position().column as i32),
                context_snippet: Some(self.extract_text(node, source).unwrap_or_default()),
                metadata: Some(format!(r#"{{"call_type": "direct", "file": "{}", "caller": "{}"}}"#, 
                    file_path, 
                    current_function.map(|(name, _)| name.as_str()).unwrap_or("unknown")
                )),
                created_at: chrono::Utc::now().to_rfc3339(),
            })
        } else {
            None
        }
    }
    
    /// Extract constructor call with context
    fn extract_constructor_call_with_context(
        &self,
        node: &Node,
        source: &str,
        _file_path: &str,
        symbol_map: &HashMap<String, i32>,
        current_function: Option<&(String, Option<i32>)>,
    ) -> Option<UniversalRelationship> {
        if let Some(constructor_node) = node.child_by_field_name("constructor") {
            if let Some(class_name) = self.extract_text(&constructor_node, source) {
                let caller_id = current_function.and_then(|(_, id)| *id);
                if let Some(&to_id) = symbol_map.get(&class_name) {
                    return Some(UniversalRelationship {
                        id: None,
                        project_id: self.project_id,
                        from_symbol_id: caller_id,
                        to_symbol_id: Some(to_id),
                        relationship_type: "instantiates".to_string(),
                        confidence: 0.9,
                        context_line: Some(node.start_position().row as i32 + 1),
                        context_column: Some(node.start_position().column as i32),
                        context_snippet: Some(format!("new {}", class_name)),
                        metadata: Some(format!(r#"{{"constructor": "{}", "caller": "{}"}}"#,
                            class_name,
                            current_function.map(|(name, _)| name.as_str()).unwrap_or("unknown")
                        )),
                        created_at: chrono::Utc::now().to_rfc3339(),
                    });
                }
            }
        }
        None
    }
    
    /// Extract property access with context
    fn extract_property_access_with_context(
        &self,
        node: &Node,
        source: &str,
        _file_path: &str,
        symbol_map: &HashMap<String, i32>,
        current_function: Option<&(String, Option<i32>)>,
    ) -> Option<UniversalRelationship> {
        let object_node = node.child_by_field_name("object")?;
        let property_node = node.child_by_field_name("property")?;
        
        let object_name = self.extract_text(&object_node, source)?;
        let property_name = self.extract_text(&property_node, source)?;
        
        let from_id = current_function.and_then(|(_, id)| *id);
        let to_id = symbol_map.get(&object_name).copied();
        
        if from_id.is_some() || to_id.is_some() {
            Some(UniversalRelationship {
                id: None,
                project_id: self.project_id,
                from_symbol_id: from_id,
                to_symbol_id: to_id,
                relationship_type: "accesses".to_string(),
                confidence: 0.8,
                context_line: Some(node.start_position().row as i32 + 1),
                context_column: Some(node.start_position().column as i32),
                context_snippet: Some(format!("{}.{}", object_name, property_name)),
                metadata: Some(format!(r#"{{"property": "{}", "accessor": "{}"}}"#,
                    property_name,
                    current_function.map(|(name, _)| name.as_str()).unwrap_or("unknown")
                )),
                created_at: chrono::Utc::now().to_rfc3339(),
            })
        } else {
            None
        }
    }
    
    /// Extract export relationships
    fn extract_export_relationship(&self, node: &Node, source: &str, file_path: &str, symbol_map: &HashMap<String, i32>) -> Option<UniversalRelationship> {
        // Look for exported symbols
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                if let Some(symbol_name) = self.extract_text(&child, source) {
                    if let Some(&from_id) = symbol_map.get(&symbol_name) {
                        return Some(self.create_relationship(
                            Some(from_id),
                            None, // Export to module
                            "exports",
                            node,
                            file_path,
                        ));
                    }
                }
            }
        }
        None
    }

    /// Extract type annotation relationships
    fn extract_type_relationship(&self, node: &Node, source: &str, file_path: &str, symbol_map: &HashMap<String, i32>) -> Option<UniversalRelationship> {
        if let Some(type_name) = self.extract_text(node, source) {
            // Create relationship from variable/parameter to its type
            if let Some(&to_id) = symbol_map.get(&type_name) {
                return Some(self.create_relationship(
                    None, // Could be enhanced to find the variable
                    Some(to_id),
                    "has_type",
                    node,
                    file_path,
                ));
            }
        }
        None
    }
}