use module_sentinel_parser::ast::{
    UniversalAst, UniversalNode, NodeId, NodeLocation, SourceLocation
};

fn create_test_location(start: usize, end: usize) -> NodeLocation {
    NodeLocation {
        start: SourceLocation { line: 1, column: start as u32, offset: start },
        end: SourceLocation { line: 1, column: end as u32, offset: end },
        text_range: (start, end),
    }
}

#[test]
fn test_create_function_node() {
    let mut ast = UniversalAst::new("test.rs".into(), "fn main() {}".into());
    let func = UniversalNode::Function { 
        name: "main".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_generator: false,
    };
    let id = ast.add_node(func, create_test_location(0, 12));
    
    assert_eq!(ast.nodes.len(), 1);
    assert_eq!(id, NodeId(0));
    
    // Verify we can retrieve the node
    let retrieved = ast.get_node(id).unwrap();
    match retrieved {
        UniversalNode::Function { name, .. } => {
            assert_eq!(name, "main");
        }
        _ => panic!("Expected Function node"),
    }
}

#[test]
fn test_create_class_with_methods() {
    let mut ast = UniversalAst::new("test.ts".into(), "class Test { method() {} }".into());
    
    // Create method node first
    let method = UniversalNode::Method {
        name: "method".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_static: false,
        is_abstract: false,
    };
    let method_id = ast.add_node(method, create_test_location(13, 24));
    
    // Create class node with method
    let class = UniversalNode::Class {
        name: "Test".into(),
        base: None,
        interfaces: vec![],
        members: vec![method_id],
        modifiers: vec![],
        type_parameters: vec![],
    };
    let class_id = ast.add_node(class, create_test_location(0, 26));
    ast.set_root(class_id);
    
    assert_eq!(ast.nodes.len(), 2);
    assert_eq!(ast.root, class_id);
    
    // Verify class structure
    match ast.get_node(class_id).unwrap() {
        UniversalNode::Class { members, name, .. } => {
            assert_eq!(name, "Test");
            assert_eq!(members.len(), 1);
            assert_eq!(members[0], method_id);
        }
        _ => panic!("Expected Class node"),
    }
}

#[test]
fn test_node_location_tracking() {
    let mut ast = UniversalAst::new("test.py".into(), "def hello(): pass".into());
    
    let func = UniversalNode::Function {
        name: "hello".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_generator: false,
    };
    
    let location = NodeLocation {
        start: SourceLocation { line: 1, column: 0, offset: 0 },
        end: SourceLocation { line: 1, column: 17, offset: 17 },
        text_range: (0, 17),
    };
    
    let id = ast.add_node(func, location.clone());
    
    let retrieved_loc = ast.get_location(id).unwrap();
    assert_eq!(retrieved_loc.start.line, 1);
    assert_eq!(retrieved_loc.start.column, 0);
    assert_eq!(retrieved_loc.end.column, 17);
    assert_eq!(retrieved_loc.text_range, (0, 17));
}