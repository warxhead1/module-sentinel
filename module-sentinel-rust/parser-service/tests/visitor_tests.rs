use module_sentinel_parser::ast::{
    UniversalAst, UniversalNode, NodeId, NodeLocation, SourceLocation,
    AstVisitor, LiteralValue
};

fn create_test_location(start: usize, end: usize) -> NodeLocation {
    NodeLocation {
        start: SourceLocation { line: 1, column: start as u32, offset: start },
        end: SourceLocation { line: 1, column: end as u32, offset: end },
        text_range: (start, end),
    }
}

struct NodeCounterVisitor {
    function_count: usize,
    class_count: usize,
    method_count: usize,
    total_nodes: usize,
}

impl NodeCounterVisitor {
    fn new() -> Self {
        Self {
            function_count: 0,
            class_count: 0,
            method_count: 0,
            total_nodes: 0,
        }
    }
    
    fn visit_ast(&mut self, ast: &UniversalAst) {
        self.visit_node(&ast.nodes[ast.root.0], ast.root, ast);
    }
}

impl AstVisitor for NodeCounterVisitor {
    type Result = ();
    
    fn visit_node(&mut self, node: &UniversalNode, _id: NodeId, ast: &UniversalAst) {
        self.total_nodes += 1;
        
        match node {
            UniversalNode::Function { .. } => self.function_count += 1,
            UniversalNode::Class { members, .. } => {
                self.class_count += 1;
                // Visit class members
                for &member_id in members {
                    if let Some(member) = ast.get_node(member_id) {
                        self.visit_node(member, member_id, ast);
                    }
                }
            }
            UniversalNode::Method { .. } => self.method_count += 1,
            UniversalNode::Module { exports, imports, .. } => {
                // Visit exports and imports
                for &export_id in exports {
                    if let Some(export) = ast.get_node(export_id) {
                        self.visit_node(export, export_id, ast);
                    }
                }
                for &import_id in imports {
                    if let Some(import) = ast.get_node(import_id) {
                        self.visit_node(import, import_id, ast);
                    }
                }
            }
            _ => {}
        }
    }
}

#[test]
fn test_visitor_counts_nodes() {
    let mut ast = UniversalAst::new("test.ts".into(), "test code".into());
    
    // Create a simple AST structure
    let func1 = UniversalNode::Function {
        name: "func1".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_generator: false,
    };
    let func1_id = ast.add_node(func1, create_test_location(0, 10));
    
    let method1 = UniversalNode::Method {
        name: "method1".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_static: false,
        is_abstract: false,
    };
    let method1_id = ast.add_node(method1, create_test_location(20, 30));
    
    let class1 = UniversalNode::Class {
        name: "MyClass".into(),
        base: None,
        interfaces: vec![],
        members: vec![method1_id],
        modifiers: vec![],
        type_parameters: vec![],
    };
    let class1_id = ast.add_node(class1, create_test_location(15, 35));
    
    let module = UniversalNode::Module {
        name: "test_module".into(),
        exports: vec![func1_id, class1_id],
        imports: vec![],
    };
    let module_id = ast.add_node(module, create_test_location(0, 40));
    ast.set_root(module_id);
    
    // Visit and count
    let mut counter = NodeCounterVisitor::new();
    counter.visit_ast(&ast);
    
    assert_eq!(counter.function_count, 1);
    assert_eq!(counter.class_count, 1);
    assert_eq!(counter.method_count, 1);
    assert_eq!(counter.total_nodes, 4); // module + function + class + method
}

// Test a visitor that collects symbol names
struct SymbolCollectorVisitor {
    symbols: Vec<String>,
}

impl SymbolCollectorVisitor {
    fn new() -> Self {
        Self { symbols: Vec::new() }
    }
}

impl AstVisitor for SymbolCollectorVisitor {
    type Result = ();
    
    fn visit_node(&mut self, node: &UniversalNode, _id: NodeId, ast: &UniversalAst) {
        match node {
            UniversalNode::Function { name, .. } => self.symbols.push(name.clone()),
            UniversalNode::Class { name, members, .. } => {
                self.symbols.push(name.clone());
                // Visit members
                self.visit_children(members, ast);
            }
            UniversalNode::Method { name, .. } => self.symbols.push(name.clone()),
            UniversalNode::Variable { name, .. } => self.symbols.push(name.clone()),
            UniversalNode::Module { exports, .. } => {
                // Visit exports
                self.visit_children(exports, ast);
            }
            _ => {}
        }
    }
}

#[test]
fn test_visitor_collects_symbols() {
    let mut ast = UniversalAst::new("test.ts".into(), "test code".into());
    
    // Build AST
    let var1 = UniversalNode::Variable {
        name: "myVar".into(),
        var_type: None,
        initializer: None,
        modifiers: vec![],
        is_const: false,
    };
    let var1_id = ast.add_node(var1, create_test_location(0, 10));
    
    let func1 = UniversalNode::Function {
        name: "processData".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: true,
        is_generator: false,
    };
    let func1_id = ast.add_node(func1, create_test_location(11, 25));
    
    let module = UniversalNode::Module {
        name: "main".into(),
        exports: vec![var1_id, func1_id],
        imports: vec![],
    };
    let module_id = ast.add_node(module, create_test_location(0, 30));
    ast.set_root(module_id);
    
    // Collect symbols
    let mut collector = SymbolCollectorVisitor::new();
    collector.visit_node(&ast.nodes[ast.root.0], ast.root, &ast);
    
    assert_eq!(collector.symbols.len(), 2);
    assert!(collector.symbols.contains(&"myVar".to_string()));
    assert!(collector.symbols.contains(&"processData".to_string()));
}

// Test a visitor that finds specific patterns
struct AsyncFunctionFinderVisitor {
    async_functions: Vec<String>,
}

impl AsyncFunctionFinderVisitor {
    fn new() -> Self {
        Self { async_functions: Vec::new() }
    }
    
    fn visit_ast(&mut self, ast: &UniversalAst) {
        self.visit_node(&ast.nodes[ast.root.0], ast.root, ast);
    }
}

impl AstVisitor for AsyncFunctionFinderVisitor {
    type Result = ();
    
    fn visit_node(&mut self, node: &UniversalNode, _id: NodeId, ast: &UniversalAst) {
        match node {
            UniversalNode::Function { name, is_async, .. } => {
                if *is_async {
                    self.async_functions.push(name.clone());
                }
            }
            UniversalNode::Method { name, is_async, .. } => {
                if *is_async {
                    self.async_functions.push(name.clone());
                }
            }
            UniversalNode::Module { exports, imports, .. } => {
                self.visit_children(exports, ast);
                self.visit_children(imports, ast);
            }
            UniversalNode::Class { members, .. } => {
                self.visit_children(members, ast);
            }
            _ => {}
        }
    }
}

#[test]
fn test_visitor_finds_async_functions() {
    let mut ast = UniversalAst::new("test.ts".into(), "test code".into());
    
    // Create mix of async and non-async functions
    let sync_func = UniversalNode::Function {
        name: "syncFunc".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: false,
        is_generator: false,
    };
    let sync_id = ast.add_node(sync_func, create_test_location(0, 10));
    
    let async_func = UniversalNode::Function {
        name: "asyncFunc".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: true,
        is_generator: false,
    };
    let async_id = ast.add_node(async_func, create_test_location(11, 25));
    
    let async_method = UniversalNode::Method {
        name: "asyncMethod".into(),
        params: vec![],
        return_type: None,
        body: None,
        modifiers: vec![],
        type_parameters: vec![],
        is_async: true,
        is_static: false,
        is_abstract: false,
    };
    let async_method_id = ast.add_node(async_method, create_test_location(26, 40));
    
    let class_node = UniversalNode::Class {
        name: "MyClass".into(),
        base: None,
        interfaces: vec![],
        members: vec![async_method_id],
        modifiers: vec![],
        type_parameters: vec![],
    };
    let class_id = ast.add_node(class_node, create_test_location(26, 50));
    
    let module = UniversalNode::Module {
        name: "test".into(),
        exports: vec![sync_id, async_id, class_id],
        imports: vec![],
    };
    let module_id = ast.add_node(module, create_test_location(0, 60));
    ast.set_root(module_id);
    
    // Find async functions
    let mut finder = AsyncFunctionFinderVisitor::new();
    finder.visit_ast(&ast);
    
    assert_eq!(finder.async_functions.len(), 2);
    assert!(finder.async_functions.contains(&"asyncFunc".to_string()));
    assert!(finder.async_functions.contains(&"asyncMethod".to_string()));
    assert!(!finder.async_functions.contains(&"syncFunc".to_string()));
}