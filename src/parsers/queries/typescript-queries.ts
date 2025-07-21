
export const typescriptQueries = `
; Imports
(import_statement
  source: (string_literal) @import.source
  (import_clause (named_imports (import_specifier name: (identifier) @import.name))))

; Exports
(export_statement
  declaration: (class_declaration name: (type_identifier) @export.class.name))
(export_statement
  declaration: (function_declaration name: (identifier) @export.function.name))

; Class Declarations
(class_declaration
  name: (type_identifier) @class.name
  (class_heritage (extends_clause (identifier) @class.base))?
)

; Interface Declarations
(interface_declaration
  name: (type_identifier) @interface.name
)

; Function and Method Declarations
(function_declaration
  name: (identifier) @function.name
)

(method_definition
  name: (property_identifier) @method.name
)

; Call Expressions
(call_expression
  function: (identifier) @call.function)
`;
