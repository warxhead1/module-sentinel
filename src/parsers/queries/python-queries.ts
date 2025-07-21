
export const pythonQueries = `
; Imports
(import_statement name: (dotted_name (identifier) @import.module))
(from_import_statement
  module_name: (dotted_name (identifier) @import.module)
  name: (dotted_name (identifier) @import.name))
(from_import_statement
  module_name: (dotted_name (identifier) @import.module)
  name: (aliased_import (identifier) @import.name (identifier) @import.alias))

; Classes
(class_definition
  name: (identifier) @class.name
  superclasses: (argument_list . (identifier) @class.base)*
)

; Functions and Methods
(function_definition
  name: (identifier) @function.name
  parameters: (parameters . (typed_parameter (identifier) @function.param)*)*
  return_type: (type (identifier) @function.return_type)?
)

(decorated_definition
  (decorator (identifier) @decorator.name)
  definition: (function_definition
    name: (identifier) @function.name
  )
)

(decorated_definition
  (decorator (identifier) @decorator.name)
  definition: (class_definition
    name: (identifier) @class.name
  )
)

; Function Calls
(call
  function: (identifier) @call.function)
`;
