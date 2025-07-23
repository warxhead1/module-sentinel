-- Migration: Update language feature tables with additional columns
-- Created: 2025-01-21
-- Description: Adds missing columns to existing python_features and typescript_features tables

-- Note: SQLite doesn't support IF NOT EXISTS with ALTER TABLE ADD COLUMN
-- If columns already exist, these statements will fail but that's OK

-- Update Python features table
ALTER TABLE python_features ADD COLUMN is_lambda BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN type_annotations TEXT;
ALTER TABLE python_features ADD COLUMN return_annotation TEXT;
ALTER TABLE python_features ADD COLUMN docstring_format TEXT;
ALTER TABLE python_features ADD COLUMN parameters TEXT;
ALTER TABLE python_features ADD COLUMN has_varargs BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN has_kwargs BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN base_classes TEXT;
ALTER TABLE python_features ADD COLUMN is_dataclass BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN is_namedtuple BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN is_enum BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN is_dunder_all BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN dunder_all_exports TEXT;
ALTER TABLE python_features ADD COLUMN is_context_manager BOOLEAN DEFAULT FALSE;
ALTER TABLE python_features ADD COLUMN is_async_context_manager BOOLEAN DEFAULT FALSE;

-- Update TypeScript features table
ALTER TABLE typescript_features ADD COLUMN type_parameters TEXT;
ALTER TABLE typescript_features ADD COLUMN is_arrow_function BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN is_generator BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN access_modifier TEXT;
ALTER TABLE typescript_features ADD COLUMN is_abstract BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN implements_interfaces TEXT;
ALTER TABLE typescript_features ADD COLUMN extends_classes TEXT;
ALTER TABLE typescript_features ADD COLUMN is_interface BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN is_type_alias BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN is_enum BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN import_type TEXT;
ALTER TABLE typescript_features ADD COLUMN module_type TEXT;
ALTER TABLE typescript_features ADD COLUMN is_react_component BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN is_react_hook BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN jsx_return_type TEXT;
ALTER TABLE typescript_features ADD COLUMN is_generic BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN is_type_guard BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN is_assertion BOOLEAN DEFAULT FALSE;
ALTER TABLE typescript_features ADD COLUMN jsdoc_comments TEXT;
ALTER TABLE typescript_features ADD COLUMN tsdoc_comments TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_python_features_lambda ON python_features(is_lambda);
CREATE INDEX IF NOT EXISTS idx_python_features_dataclass ON python_features(is_dataclass);
CREATE INDEX IF NOT EXISTS idx_python_features_enum ON python_features(is_enum);

CREATE INDEX IF NOT EXISTS idx_typescript_features_react ON typescript_features(is_react_component);
CREATE INDEX IF NOT EXISTS idx_typescript_features_interface ON typescript_features(is_interface);
CREATE INDEX IF NOT EXISTS idx_typescript_features_arrow ON typescript_features(is_arrow_function);