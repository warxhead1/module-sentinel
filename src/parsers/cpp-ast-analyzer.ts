import Parser from 'tree-sitter';
import Cpp from 'tree-sitter-cpp';

export class CppAstAnalyzer {
  private parser: Parser;
  
  constructor() {
    this.parser = new Parser();
  }

  async initialize(): Promise<void> {
    this.parser.setLanguage(Cpp);
  }

  async parse(content: string): Promise<Parser.Tree> {
    return this.parser.parse(content);
  }

  async extractExports(tree: Parser.Tree): Promise<string[]> {
    const exports: string[] = [];
    const cursor = tree.walk();

    const visitNode = (depth: number = 0): void => {
      const node = cursor.currentNode;

      // Look for class declarations
      if (node.type === 'class_specifier') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          exports.push(nameNode.text);
        }
      }

      // Look for function declarations
      if (node.type === 'function_definition') {
        const declarator = node.childForFieldName('declarator');
        if (declarator) {
          const name = this.extractFunctionName(declarator);
          if (name) exports.push(name);
        }
      }

      // Look for namespace exports
      if (node.type === 'namespace_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          exports.push(`namespace::${nameNode.text}`);
        }
      }

      // Look for typedef/using declarations
      if (node.type === 'type_definition' || node.type === 'alias_declaration') {
        const nameNode = node.childForFieldName('declarator') || node.childForFieldName('name');
        if (nameNode) {
          exports.push(nameNode.text);
        }
      }

      // Traverse children
      if (cursor.gotoFirstChild()) {
        do {
          visitNode(depth + 1);
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visitNode();
    return [...new Set(exports)];
  }

  async extractImports(tree: Parser.Tree): Promise<string[]> {
    const imports: string[] = [];
    const cursor = tree.walk();

    const visitNode = (): void => {
      const node = cursor.currentNode;

      // Look for #include directives
      if (node.type === 'preproc_include') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          const includePath = pathNode.text.replace(/["<>]/g, '');
          imports.push(includePath);
        }
      }

      // Look for using declarations
      if (node.type === 'using_declaration') {
        const nameNode = node.descendantsOfType('qualified_identifier')[0];
        if (nameNode) {
          imports.push(nameNode.text);
        }
      }

      // Traverse children
      if (cursor.gotoFirstChild()) {
        do {
          visitNode();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visitNode();
    return [...new Set(imports)];
  }

  async extractDependencies(tree: Parser.Tree): Promise<string[]> {
    const dependencies: string[] = [];
    const cursor = tree.walk();

    const visitNode = (): void => {
      const node = cursor.currentNode;

      // Look for type references in function parameters and return types
      if (node.type === 'type_identifier' || node.type === 'qualified_identifier') {
        const parent = node.parent;
        if (parent && (
          parent.type === 'parameter_declaration' ||
          parent.type === 'function_declarator' ||
          parent.type === 'field_declaration'
        )) {
          dependencies.push(node.text);
        }
      }

      // Look for template instantiations
      if (node.type === 'template_type') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          dependencies.push(nameNode.text);
        }
      }

      // Traverse children
      if (cursor.gotoFirstChild()) {
        do {
          visitNode();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visitNode();
    return [...new Set(dependencies)].filter(dep => 
      !['void', 'int', 'float', 'double', 'char', 'bool', 'auto'].includes(dep)
    );
  }

  private extractFunctionName(declarator: Parser.SyntaxNode): string | null {
    if (declarator.type === 'function_declarator') {
      const nameNode = declarator.childForFieldName('declarator');
      if (nameNode && nameNode.type === 'identifier') {
        return nameNode.text;
      }
      if (nameNode && nameNode.type === 'field_identifier') {
        return nameNode.text;
      }
      if (nameNode && nameNode.type === 'qualified_identifier') {
        return nameNode.text;
      }
    }
    
    if (declarator.type === 'identifier') {
      return declarator.text;
    }

    return null;
  }
}