export const typescriptQueries = {
  // Import/Export queries
  imports: `
    ; Named imports
    (import_statement
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @import.name
            alias: (identifier)? @import.alias))))
    
    ; Default imports
    (import_statement
      (import_clause (identifier) @import.default))
    
    ; Namespace imports
    (import_statement
      (import_clause
        (namespace_import (identifier) @import.namespace)))
    
    ; Side effect imports
    (import_statement
      source: (string) @import.source)
    
    ; Dynamic imports
    (call_expression
      function: (import)
      arguments: (arguments (string) @import.dynamic))
    
    ; Exports
    (export_statement
      declaration: (lexical_declaration
        (variable_declarator
          name: (identifier) @export.name)))
    
    (export_statement
      (export_clause
        (export_specifier
          name: (identifier) @export.name
          alias: (identifier)? @export.alias)))
  `,

  // Class queries
  classes: `
    ; Class declarations
    (class_declaration
      name: (type_identifier) @class.name
      type_parameters: (type_parameters)? @class.type_params
      body: (class_body) @class.body)
    
    ; Abstract classes
    (class_declaration
      "abstract" @class.abstract
      name: (type_identifier) @class.name)
    
    ; Class expressions
    (class
      name: (type_identifier)? @class.name
      body: (class_body) @class.body)
    
    ; Class heritage
    (class_declaration
      name: (type_identifier) @class.name
      (class_heritage
        (extends_clause (type_identifier) @class.extends)
        (implements_clause (type_identifier) @class.implements)*))
    
    ; Decorated classes
    (decorator
      (identifier) @class.decorator
      (class_declaration name: (type_identifier) @class.name))
  `,

  // Interface queries
  interfaces: `
    ; Interface declarations
    (interface_declaration
      name: (type_identifier) @interface.name
      type_parameters: (type_parameters)? @interface.type_params
      body: (interface_body) @interface.body)
    
    ; Interface heritage
    (interface_declaration
      name: (type_identifier) @interface.name
      (extends_type_clause (type_identifier) @interface.extends)*)
    
    ; Type aliases
    (type_alias_declaration
      name: (type_identifier) @type_alias.name
      type_parameters: (type_parameters)? @type_alias.params
      value: (_) @type_alias.value)
  `,

  // Function queries
  functions: `
    ; Function declarations
    (function_declaration
      name: (identifier) @function.name
      type_parameters: (type_parameters)? @function.type_params
      parameters: (formal_parameters) @function.params
      return_type: (type_annotation)? @function.return_type
      body: (statement_block) @function.body)
    
    ; Async functions
    (function_declaration
      "async" @function.async
      name: (identifier) @function.name)
    
    ; Arrow functions
    (arrow_function
      parameters: (_) @arrow.params
      return_type: (type_annotation)? @arrow.return_type
      body: (_) @arrow.body)
    
    ; Generator functions
    (generator_function_declaration
      name: (identifier) @generator.name
      parameters: (formal_parameters) @generator.params)
    
    ; Method signatures
    (method_signature
      name: (property_identifier) @method.name
      type_parameters: (type_parameters)? @method.type_params
      parameters: (formal_parameters) @method.params
      return_type: (type_annotation)? @method.return_type)
  `,

  // Variable and property queries
  variables: `
    ; Const declarations
    (lexical_declaration
      "const" @variable.const
      (variable_declarator
        name: (identifier) @variable.name
        type: (type_annotation)? @variable.type
        value: (_)? @variable.value))
    
    ; Let declarations
    (lexical_declaration
      "let" @variable.let
      (variable_declarator
        name: (identifier) @variable.name
        type: (type_annotation)? @variable.type))
    
    ; Var declarations
    (variable_declaration
      (variable_declarator
        name: (identifier) @variable.name))
    
    ; Property declarations
    (public_field_definition
      property: (property_identifier) @property.name
      type: (type_annotation)? @property.type
      value: (_)? @property.value)
    
    ; Readonly properties
    (public_field_definition
      "readonly" @property.readonly
      property: (property_identifier) @property.name)
  `,

  // Type queries
  types: `
    ; Type parameters
    (type_parameters
      (type_parameter
        name: (type_identifier) @type_param.name
        constraint: (constraint)? @type_param.constraint))
    
    ; Union types
    (union_type) @type.union
    
    ; Intersection types
    (intersection_type) @type.intersection
    
    ; Generic types
    (generic_type
      name: (type_identifier) @type.generic_name
      type_arguments: (type_arguments) @type.generic_args)
    
    ; Literal types
    (literal_type) @type.literal
    
    ; Conditional types
    (conditional_type) @type.conditional
    
    ; Mapped types
    (mapped_type_clause) @type.mapped
    
    ; Tuple types
    (tuple_type) @type.tuple
  `,

  // Pattern detection queries
  patterns: `
    ; Decorators
    (decorator
      (identifier) @pattern.decorator)
    
    ; Dependency injection (common decorator patterns)
    (decorator
      (call_expression
        function: (identifier) @pattern.di_decorator
        (#match? @pattern.di_decorator "^(Injectable|Component|Service|Controller|Module)$")))
    
    ; React components (function components)
    (variable_declarator
      name: (identifier) @pattern.react_component
      (#match? @pattern.react_component "^[A-Z]")
      value: (arrow_function
        return_type: (type_annotation
          (type_identifier) @pattern.jsx_element
          (#match? @pattern.jsx_element "^(JSX.Element|ReactElement|ReactNode)$"))))
    
    ; React hooks
    (call_expression
      function: (identifier) @pattern.react_hook
      (#match? @pattern.react_hook "^use[A-Z]"))
    
    ; Event emitters
    (class_declaration
      name: (type_identifier) @pattern.event_emitter
      (class_heritage
        (extends_clause
          (member_expression
            property: (property_identifier) @pattern.extends_emitter
            (#match? @pattern.extends_emitter "EventEmitter")))))
    
    ; Singleton pattern
    (class_declaration
      name: (type_identifier) @pattern.singleton
      body: (class_body
        (method_definition
          "static" @pattern.static
          name: (property_identifier) @pattern.getInstance
          (#match? @pattern.getInstance "^getInstance$"))))
  `,

  // JSX queries (for React)
  jsx: `
    ; JSX Elements
    (jsx_element
      open_tag: (jsx_opening_element
        name: (identifier) @jsx.component))
    
    ; JSX Self-closing elements
    (jsx_self_closing_element
      name: (identifier) @jsx.component)
    
    ; JSX Props
    (jsx_attribute
      (property_identifier) @jsx.prop)
    
    ; JSX Expressions
    (jsx_expression) @jsx.expression
  `,

  // Documentation queries
  documentation: `
    ; JSDoc comments
    (comment) @comment.jsdoc
    (#match? @comment.jsdoc "^/\\*\\*")
    
    ; TSDoc comments
    (comment) @comment.tsdoc
    (#match? @comment.tsdoc "^///")
  `
};