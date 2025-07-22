export const pythonQueries = {
  // Import queries
  imports: `
    ; Standard imports
    (import_statement name: (dotted_name) @import.module)
    (import_statement name: (aliased_import name: (dotted_name) @import.module alias: (identifier) @import.alias))
    
    ; From imports
    (import_from_statement
      module_name: (dotted_name) @import.module
      name: (dotted_name) @import.name)
    (import_from_statement
      module_name: (dotted_name) @import.module
      name: (aliased_import name: (identifier) @import.name alias: (identifier) @import.alias))
    
    ; Star imports
    (import_from_statement
      module_name: (dotted_name) @import.module
      (wildcard_import))
  `,

  // Class queries
  classes: `
    ; Class definitions
    (class_definition
      name: (identifier) @class.name
      superclasses: (argument_list (identifier) @class.base)*
      body: (block) @class.body)
    
    ; Decorated classes
    (decorated_definition
      (decorator (identifier) @class.decorator)
      definition: (class_definition name: (identifier) @class.name))
    
    ; Methods inside classes
    (class_definition
      body: (block
        (function_definition
          name: (identifier) @method.name
          parameters: (parameters) @method.params)))
  `,

  // Function queries
  functions: `
    ; Function definitions
    (function_definition
      name: (identifier) @function.name
      parameters: (parameters) @function.params
      return_type: (type) @function.return_type?
      body: (block) @function.body)
    
    ; Async functions
    (function_definition
      "async" @function.async
      name: (identifier) @function.name)
    
    ; Decorated functions
    (decorated_definition
      (decorator) @function.decorator
      definition: (function_definition name: (identifier) @function.name))
    
    ; Lambda functions
    (lambda parameters: (lambda_parameters) @lambda.params body: (_) @lambda.body)
  `,

  // Variable queries
  variables: `
    ; Variable assignments
    (assignment
      left: (identifier) @variable.name
      right: (_) @variable.value)
    
    ; Type annotated variables
    (assignment
      left: (identifier) @variable.name
      type: (type) @variable.type
      right: (_) @variable.value)
    
    ; Global variables
    (global_statement (identifier) @variable.global)
    
    ; Nonlocal variables
    (nonlocal_statement (identifier) @variable.nonlocal)
    
    ; Constants (by convention - uppercase)
    (assignment
      left: (identifier) @constant.name
      (#match? @constant.name "^[A-Z_]+$"))
  `,

  // Call and usage queries
  calls: `
    ; Function calls
    (call
      function: (identifier) @call.function
      arguments: (argument_list) @call.args)
    
    ; Method calls
    (call
      function: (attribute
        object: (_) @call.object
        attribute: (identifier) @call.method))
    
    ; Constructor calls
    (call
      function: (identifier) @call.constructor
      (#match? @call.constructor "^[A-Z]"))
  `,

  // Pattern detection queries
  patterns: `
    ; Context managers (with statements)
    (with_statement
      (with_clause
        (with_item value: (call function: (identifier) @pattern.context_manager))))
    
    ; Decorators that indicate patterns
    (decorator (identifier) @pattern.decorator
      (#match? @pattern.decorator "^(property|staticmethod|classmethod|abstractmethod|cached_property)$"))
    
    ; Generator functions (containing yield)
    (function_definition
      name: (identifier) @pattern.generator
      body: (block (expression_statement (yield))))
    
    ; Async context managers
    (with_statement
      "async" @pattern.async_context
      (with_clause))
    
    ; List/Dict/Set comprehensions
    (list_comprehension) @pattern.comprehension
    (dictionary_comprehension) @pattern.comprehension
    (set_comprehension) @pattern.comprehension
    (generator_expression) @pattern.generator_expr
  `,

  // Type information queries
  types: `
    ; Type annotations in function parameters
    (parameters
      (typed_parameter
        (identifier) @param.name
        type: (type) @param.type))
    
    ; Return type annotations
    (function_definition
      return_type: (type) @return.type)
    
    ; Variable type annotations
    (assignment
      left: (identifier) @var.name
      type: (type) @var.type)
    
    ; Type aliases
    (assignment
      left: (identifier) @type_alias.name
      right: (type) @type_alias.definition)
  `,

  // Documentation queries
  documentation: `
    ; Docstrings (first string in function/class body)
    (function_definition
      body: (block . (expression_statement (string) @docstring)))
    
    (class_definition
      body: (block . (expression_statement (string) @docstring)))
    
    ; Module docstrings
    (module . (expression_statement (string) @module.docstring))
  `
};