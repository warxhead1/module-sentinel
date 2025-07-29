use anyhow::Result;
use tree_sitter::{Parser, Tree, Node, Point};
use super::language::Language;
use super::error_recovery::{ErrorRecoveryEngine, RecoverySuggestion};
use crate::ast::UniversalAst;

pub struct TreeSitterParser {
    parser: Parser,
    language: Language,
    error_recovery: ErrorRecoveryEngine,
}

#[derive(Debug)]
pub struct ParseResult {
    pub tree: Tree,
    pub errors: Vec<ParseError>,
    pub recovery_suggestions: Vec<RecoverySuggestion>,
}

#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub start_position: Point,
    pub end_position: Point,
}


impl TreeSitterParser {
    pub fn new(language: Language) -> Result<Self> {
        let mut parser = Parser::new();
        parser.set_language(&language.tree_sitter_language())?;
        
        Ok(Self {
            parser,
            language,
            error_recovery: ErrorRecoveryEngine::new(),
        })
    }
    
    pub fn language_id(&self) -> &str {
        self.language.id()
    }
    
    pub fn is_initialized(&self) -> bool {
        self.parser.language().is_some()
    }
    
    pub fn parse_string(&mut self, code: &str) -> Result<Tree> {
        self.parser
            .parse(code, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse code"))
    }
    
    pub fn parse_with_recovery(&mut self, code: &str) -> Result<ParseResult> {
        let tree = self.parser
            .parse(code, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse code"))?;
        
        let mut errors = Vec::new();
        let mut recovery_suggestions = Vec::new();
        
        // Check if the root has errors
        if tree.root_node().has_error() {
            // Walk the tree to find errors
            let mut cursor = tree.walk();
            self.find_errors(&mut cursor, code, &mut errors);
        }
        
        // If no explicit errors found but tree has error flag, add a generic error
        if errors.is_empty() && tree.root_node().has_error() {
            errors.push(ParseError {
                message: "Parse error detected".to_string(),
                start_position: tree.root_node().start_position(),
                end_position: tree.root_node().end_position(),
            });
        }
        
        // Generate recovery suggestions for each error
        for error in &errors {
            if let Some(suggestion) = self.error_recovery.suggest_recovery(error, code) {
                recovery_suggestions.push(suggestion);
            }
        }
        
        Ok(ParseResult {
            tree,
            errors,
            recovery_suggestions,
        })
    }
    
    pub fn parse_incremental(&mut self, code: &str, edits: Vec<(usize, usize, usize)>) -> Result<Tree> {
        // Convert edits to tree-sitter format
        let _tree_sitter_edits: Vec<tree_sitter::InputEdit> = edits
            .into_iter()
            .map(|(start, old_end, new_end)| {
                let start_point = self.byte_to_point(code, start);
                let old_end_point = self.byte_to_point(code, old_end);
                let new_end_point = self.byte_to_point(code, new_end);
                
                tree_sitter::InputEdit {
                    start_byte: start,
                    old_end_byte: old_end,
                    new_end_byte: new_end,
                    start_position: start_point,
                    old_end_position: old_end_point,
                    new_end_position: new_end_point,
                }
            })
            .collect();
        
        // For now, just parse from scratch
        // TODO: Implement proper incremental parsing
        self.parse_string(code)
    }
    
    pub fn to_universal_ast(&self, tree: &Tree) -> Result<UniversalAst> {
        use super::ast_converter::AstConverter;
        let converter = AstConverter::new(self.language);
        converter.convert(tree)
    }
    
    pub fn has_async_functions(&self, tree: &Tree) -> bool {
        match self.language {
            Language::Rust => self.check_node_type(tree.root_node(), "async_function"),
            Language::TypeScript | Language::JavaScript => {
                self.check_node_type(tree.root_node(), "async_function") ||
                self.check_node_type(tree.root_node(), "async_arrow_function")
            }
            _ => false,
        }
    }
    
    pub fn has_interfaces(&self, tree: &Tree) -> bool {
        match self.language {
            Language::TypeScript => self.check_node_type(tree.root_node(), "interface_declaration"),
            Language::Java => self.check_node_type(tree.root_node(), "interface_declaration"),
            Language::CSharp => self.check_node_type(tree.root_node(), "interface_declaration"),
            _ => false,
        }
    }
    
    fn find_errors(&self, cursor: &mut tree_sitter::TreeCursor, _code: &str, errors: &mut Vec<ParseError>) {
        let node = cursor.node();
        
        if node.is_error() || node.is_missing() {
            errors.push(ParseError {
                message: format!("Syntax error: unexpected {}", node.kind()),
                start_position: node.start_position(),
                end_position: node.end_position(),
            });
        }
        
        // Check if node has error descendants
        if node.has_error() {
            if cursor.goto_first_child() {
                loop {
                    self.find_errors(cursor, _code, errors);
                    if !cursor.goto_next_sibling() {
                        break;
                    }
                }
                cursor.goto_parent();
            }
        }
    }
    
    fn check_node_type(&self, node: Node, node_type: &str) -> bool {
        if node.kind() == node_type {
            return true;
        }
        
        for i in 0..node.child_count() {
            if let Some(child) = node.child(i) {
                if self.check_node_type(child, node_type) {
                    return true;
                }
            }
        }
        
        false
    }
    
    fn byte_to_point(&self, text: &str, byte: usize) -> Point {
        let mut line = 0;
        let mut column = 0;
        
        for (i, ch) in text.char_indices() {
            if i >= byte {
                break;
            }
            if ch == '\n' {
                line += 1;
                column = 0;
            } else {
                column += 1;
            }
        }
        
        Point { row: line, column }
    }
}

impl ParseResult {
    pub fn had_errors(&self) -> bool {
        !self.errors.is_empty()
    }
}