-- Enhanced Type Information Schema Extensions
-- These are OPTIONAL additions to your existing universal_symbols table

-- Add columns for detailed type analysis (backward compatible)
ALTER TABLE universal_symbols ADD COLUMN is_pointer BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_reference BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_const BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_volatile BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_builtin BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_std_type BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_vulkan_type BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_planetgen_type BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN base_type TEXT; -- Base type without qualifiers
ALTER TABLE universal_symbols ADD COLUMN template_arguments TEXT; -- JSON array of template args
ALTER TABLE universal_symbols ADD COLUMN type_modifiers TEXT; -- JSON array of modifiers
ALTER TABLE universal_symbols ADD COLUMN array_dimensions TEXT; -- JSON array of array sizes

-- Enhanced enum support
ALTER TABLE universal_symbols ADD COLUMN is_enum BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_enum_class BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN enum_values TEXT; -- JSON array of enum values

-- Enhanced method information
ALTER TABLE universal_symbols ADD COLUMN is_constructor BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_destructor BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_operator BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN operator_type TEXT;
ALTER TABLE universal_symbols ADD COLUMN is_override BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_final BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN is_noexcept BOOLEAN DEFAULT 0;

-- C++20/23 Module information
ALTER TABLE universal_symbols ADD COLUMN is_exported BOOLEAN DEFAULT 0;
ALTER TABLE universal_symbols ADD COLUMN module_name TEXT;
ALTER TABLE universal_symbols ADD COLUMN export_namespace TEXT;

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_symbols_base_type ON universal_symbols(base_type);
CREATE INDEX IF NOT EXISTS idx_symbols_type_category ON universal_symbols(is_std_type, is_vulkan_type, is_planetgen_type);
CREATE INDEX IF NOT EXISTS idx_symbols_enum ON universal_symbols(is_enum, is_enum_class);
CREATE INDEX IF NOT EXISTS idx_symbols_module ON universal_symbols(module_name, is_exported);

-- Parameter details table (for detailed method signatures)
CREATE TABLE IF NOT EXISTS universal_parameters (
    id INTEGER PRIMARY KEY,
    symbol_id INTEGER REFERENCES universal_symbols(id),
    parameter_index INTEGER NOT NULL,
    name TEXT,
    type_name TEXT NOT NULL,
    qualified_type TEXT,
    base_type TEXT,
    is_pointer BOOLEAN DEFAULT 0,
    is_reference BOOLEAN DEFAULT 0,
    is_const BOOLEAN DEFAULT 0,
    is_volatile BOOLEAN DEFAULT 0,
    is_template BOOLEAN DEFAULT 0,
    template_arguments TEXT, -- JSON
    default_value TEXT,
    is_variadic BOOLEAN DEFAULT 0,
    type_category TEXT, -- 'builtin', 'std', 'vulkan', 'planetgen', 'custom'
    
    UNIQUE(symbol_id, parameter_index)
);

CREATE INDEX IF NOT EXISTS idx_parameters_symbol ON universal_parameters(symbol_id);
CREATE INDEX IF NOT EXISTS idx_parameters_type ON universal_parameters(base_type, type_category);