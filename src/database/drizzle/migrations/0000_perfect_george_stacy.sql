CREATE TABLE `agent_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`agent_name` text NOT NULL,
	`task_description` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`status` text NOT NULL,
	`symbols_analyzed` integer DEFAULT 0,
	`patterns_detected` integer DEFAULT 0,
	`relationships_found` integer DEFAULT 0,
	`confidence_score` real DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_status` ON `agent_sessions` (`status`);--> statement-breakpoint
CREATE TABLE `analytics_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`cache_value` text,
	`created_at` integer,
	`expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `api_bindings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`source_symbol_id` integer,
	`target_symbol_id` integer,
	`binding_type` text NOT NULL,
	`protocol` text,
	`endpoint` text,
	`type_mapping` text,
	`serialization_format` text,
	`schema_definition` text,
	`metadata` text,
	`confidence` real DEFAULT 1,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_api_bindings_project` ON `api_bindings` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_api_bindings_source` ON `api_bindings` (`source_symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_api_bindings_target` ON `api_bindings` (`target_symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_api_bindings_type` ON `api_bindings` (`binding_type`);--> statement-breakpoint
CREATE TABLE `call_chain_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain_id` integer NOT NULL,
	`step_number` integer NOT NULL,
	`caller_id` integer NOT NULL,
	`callee_id` integer NOT NULL,
	`call_site_line` integer,
	`call_context` text,
	`data_passed` text,
	`data_transformed` integer DEFAULT false,
	`transformation_type` text,
	`estimated_step_time_ms` real DEFAULT 0,
	`is_performance_critical` integer DEFAULT false,
	FOREIGN KEY (`chain_id`) REFERENCES `call_chains`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`caller_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callee_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_call_chain_steps_chain` ON `call_chain_steps` (`chain_id`);--> statement-breakpoint
CREATE INDEX `idx_call_chain_steps_caller` ON `call_chain_steps` (`caller_id`);--> statement-breakpoint
CREATE INDEX `idx_call_chain_steps_callee` ON `call_chain_steps` (`callee_id`);--> statement-breakpoint
CREATE TABLE `call_chains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_point_id` integer NOT NULL,
	`chain_depth` integer DEFAULT 0,
	`total_functions` integer DEFAULT 0,
	`crosses_stage_boundaries` integer DEFAULT false,
	`stage_transitions` text,
	`estimated_execution_time_ms` real DEFAULT 0,
	`has_performance_bottleneck` integer DEFAULT false,
	`bottleneck_location` text,
	`data_transformation_type` text,
	`input_data_types` text,
	`output_data_types` text,
	FOREIGN KEY (`entry_point_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_call_chains_entry_point` ON `call_chains` (`entry_point_id`);--> statement-breakpoint
CREATE TABLE `code_flow_paths` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_symbol_id` integer NOT NULL,
	`end_symbol_id` integer,
	`path_nodes` text NOT NULL,
	`path_conditions` text,
	`path_length` integer NOT NULL,
	`is_complete` integer DEFAULT true NOT NULL,
	`is_cyclic` integer DEFAULT false NOT NULL,
	`frequency` integer DEFAULT 0,
	`coverage` real DEFAULT 0,
	`created_at` integer DEFAULT '"2025-07-20T22:08:29.471Z"' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `control_flow_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol_id` integer NOT NULL,
	`block_type` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`parent_block_id` integer,
	`condition` text,
	`loop_type` text,
	`complexity` integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE `cpp_class_hierarchies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`class_symbol_id` integer NOT NULL,
	`base_class_symbol_id` integer,
	`class_name` text NOT NULL,
	`base_class_name` text,
	`class_usr` text,
	`base_usr` text,
	`inheritance_type` text DEFAULT 'public',
	`is_virtual` integer DEFAULT false,
	`implements_interface` integer DEFAULT false,
	`interface_usr` text,
	`detected_by` text DEFAULT 'unified',
	`confidence` real DEFAULT 0.8,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`class_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_class_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cpp_hierarchies_class` ON `cpp_class_hierarchies` (`class_symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_cpp_hierarchies_base` ON `cpp_class_hierarchies` (`base_class_symbol_id`);--> statement-breakpoint
CREATE TABLE `cpp_features` (
	`symbol_id` integer PRIMARY KEY NOT NULL,
	`is_pointer` integer DEFAULT false,
	`is_reference` integer DEFAULT false,
	`is_const` integer DEFAULT false,
	`is_volatile` integer DEFAULT false,
	`is_constexpr` integer DEFAULT false,
	`is_consteval` integer DEFAULT false,
	`is_constinit` integer DEFAULT false,
	`is_virtual` integer DEFAULT false,
	`is_override` integer DEFAULT false,
	`is_final` integer DEFAULT false,
	`is_static` integer DEFAULT false,
	`is_inline` integer DEFAULT false,
	`is_friend` integer DEFAULT false,
	`is_constructor` integer DEFAULT false,
	`is_destructor` integer DEFAULT false,
	`is_operator` integer DEFAULT false,
	`operator_type` text,
	`is_conversion` integer DEFAULT false,
	`is_template` integer DEFAULT false,
	`is_template_specialization` integer DEFAULT false,
	`template_params` text,
	`template_args` text,
	`is_enum` integer DEFAULT false,
	`is_enum_class` integer DEFAULT false,
	`enum_values` text,
	`base_type` text,
	`parent_class` text,
	`mangled_name` text,
	`usr` text,
	`is_module_interface` integer DEFAULT false,
	`module_name` text,
	`is_module_exported` integer DEFAULT false,
	`export_namespace` text,
	`is_noexcept` integer DEFAULT false,
	`exception_spec` text,
	`attributes` text,
	`is_concept` integer DEFAULT false,
	`concept_constraints` text,
	`is_vulkan_type` integer DEFAULT false,
	`is_std_type` integer DEFAULT false,
	`is_planetgen_type` integer DEFAULT false,
	`is_factory` integer DEFAULT false,
	`is_vulkan_api` integer DEFAULT false,
	`uses_smart_pointers` integer DEFAULT false,
	`uses_modern_cpp` integer DEFAULT false,
	`returns_vector_float` integer DEFAULT false,
	`uses_gpu_compute` integer DEFAULT false,
	`has_cpu_fallback` integer DEFAULT false,
	`is_generator` integer DEFAULT false,
	`last_analyzed` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cpp_features_template` ON `cpp_features` (`is_template`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_vulkan` ON `cpp_features` (`is_vulkan_type`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_modern` ON `cpp_features` (`uses_modern_cpp`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_std` ON `cpp_features` (`is_std_type`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_planetgen` ON `cpp_features` (`is_planetgen_type`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_mangled` ON `cpp_features` (`mangled_name`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_usr` ON `cpp_features` (`usr`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_module` ON `cpp_features` (`module_name`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_base_type` ON `cpp_features` (`base_type`);--> statement-breakpoint
CREATE INDEX `idx_cpp_features_parent` ON `cpp_features` (`parent_class`);--> statement-breakpoint
CREATE TABLE `cpp_function_parameters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`function_symbol_id` integer NOT NULL,
	`parameter_name` text NOT NULL,
	`parameter_type` text NOT NULL,
	`position` integer NOT NULL,
	`is_const` integer DEFAULT false,
	`is_pointer` integer DEFAULT false,
	`is_reference` integer DEFAULT false,
	`is_template` integer DEFAULT false,
	`template_args` text,
	`default_value` text,
	`semantic_role` text,
	`data_flow_stage` text,
	`confidence` real DEFAULT 0.8,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`function_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cpp_params_function` ON `cpp_function_parameters` (`function_symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_cpp_params_type` ON `cpp_function_parameters` (`parameter_type`);--> statement-breakpoint
CREATE INDEX `idx_cpp_params_role` ON `cpp_function_parameters` (`semantic_role`);--> statement-breakpoint
CREATE TABLE `cpp_memory_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol_id` integer NOT NULL,
	`pattern_type` text NOT NULL,
	`allocation_method` text,
	`memory_size_estimate` integer,
	`is_cache_friendly` integer DEFAULT false,
	`has_alignment_optimization` integer DEFAULT false,
	`uses_raii` integer DEFAULT false,
	`potential_leak` integer DEFAULT false,
	`potential_double_free` integer DEFAULT false,
	`potential_use_after_free` integer DEFAULT false,
	`source_location` text,
	`evidence` text,
	`confidence` real DEFAULT 0.8,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cpp_memory_symbol` ON `cpp_memory_patterns` (`symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_cpp_memory_pattern` ON `cpp_memory_patterns` (`pattern_type`);--> statement-breakpoint
CREATE TABLE `cpp_method_complexity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol_id` integer NOT NULL,
	`cyclomatic_complexity` integer DEFAULT 0,
	`cognitive_complexity` integer DEFAULT 0,
	`nesting_depth` integer DEFAULT 0,
	`parameter_count` integer DEFAULT 0,
	`local_variable_count` integer DEFAULT 0,
	`line_count` integer DEFAULT 0,
	`has_loops` integer DEFAULT false,
	`has_recursion` integer DEFAULT false,
	`has_dynamic_allocation` integer DEFAULT false,
	`has_exception_handling` integer DEFAULT false,
	`readability_score` real DEFAULT 0,
	`testability_score` real DEFAULT 0,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cpp_complexity_symbol` ON `cpp_method_complexity` (`symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_cpp_complexity_cyclomatic` ON `cpp_method_complexity` (`cyclomatic_complexity`);--> statement-breakpoint
CREATE INDEX `idx_cpp_complexity_cognitive` ON `cpp_method_complexity` (`cognitive_complexity`);--> statement-breakpoint
CREATE INDEX `idx_cpp_complexity_readability` ON `cpp_method_complexity` (`readability_score`);--> statement-breakpoint
CREATE TABLE `cpp_vulkan_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol_id` integer NOT NULL,
	`operation_type` text NOT NULL,
	`vulkan_object_type` text,
	`resource_lifetime` text,
	`sharing_mode` text,
	`is_gpu_heavy` integer DEFAULT false,
	`estimated_gpu_memory_mb` integer DEFAULT 0,
	`synchronization_required` integer DEFAULT false,
	`follows_vulkan_best_practices` integer DEFAULT true,
	`potential_performance_issue` text,
	`pipeline_stage` text,
	`confidence` real DEFAULT 0.8,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cpp_vulkan_symbol` ON `cpp_vulkan_patterns` (`symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_cpp_vulkan_operation` ON `cpp_vulkan_patterns` (`operation_type`);--> statement-breakpoint
CREATE INDEX `idx_cpp_vulkan_object_type` ON `cpp_vulkan_patterns` (`vulkan_object_type`);--> statement-breakpoint
CREATE TABLE `cross_language_deps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`from_language_id` integer,
	`to_language_id` integer,
	`dependency_type` text NOT NULL,
	`dependency_path` text,
	`from_symbol_id` integer,
	`to_symbol_id` integer,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cross_language_deps_project` ON `cross_language_deps` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_cross_language_deps_from_lang` ON `cross_language_deps` (`from_language_id`);--> statement-breakpoint
CREATE INDEX `idx_cross_language_deps_to_lang` ON `cross_language_deps` (`to_language_id`);--> statement-breakpoint
CREATE TABLE `data_flow_edges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_symbol_id` integer NOT NULL,
	`target_symbol_id` integer NOT NULL,
	`variable_name` text NOT NULL,
	`flow_type` text NOT NULL,
	`line_number` integer NOT NULL,
	`is_modified` integer DEFAULT false NOT NULL,
	`data_dependencies` text
);
--> statement-breakpoint
CREATE TABLE `detected_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`pattern_type` text NOT NULL,
	`pattern_name` text,
	`description` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`severity` text DEFAULT 'info',
	`detector_name` text,
	`detector_version` text,
	`detection_time` text DEFAULT CURRENT_TIMESTAMP,
	`suggestions` text,
	`metadata` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_detected_patterns_project` ON `detected_patterns` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_detected_patterns_type` ON `detected_patterns` (`pattern_type`);--> statement-breakpoint
CREATE INDEX `idx_detected_patterns_severity` ON `detected_patterns` (`severity`);--> statement-breakpoint
CREATE TABLE `file_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`language_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer,
	`file_hash` text,
	`last_parsed` text,
	`parse_duration` integer,
	`parser_version` text,
	`symbol_count` integer DEFAULT 0,
	`relationship_count` integer DEFAULT 0,
	`pattern_count` integer DEFAULT 0,
	`is_indexed` integer DEFAULT false,
	`has_errors` integer DEFAULT false,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_file_index_project` ON `file_index` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_file_index_language` ON `file_index` (`language_id`);--> statement-breakpoint
CREATE INDEX `idx_file_index_file_path` ON `file_index` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_file_index_last_parsed` ON `file_index` (`last_parsed`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_index_unique` ON `file_index` (`project_id`,`file_path`);--> statement-breakpoint
CREATE TABLE `languages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`version` text,
	`parser_class` text NOT NULL,
	`extensions` text NOT NULL,
	`features` text,
	`is_enabled` integer DEFAULT true,
	`priority` integer DEFAULT 100
);
--> statement-breakpoint
CREATE UNIQUE INDEX `languages_name_unique` ON `languages` (`name`);--> statement-breakpoint
CREATE INDEX `idx_languages_name` ON `languages` (`name`);--> statement-breakpoint
CREATE INDEX `idx_languages_enabled` ON `languages` (`is_enabled`);--> statement-breakpoint
CREATE INDEX `idx_languages_priority` ON `languages` (`priority`);--> statement-breakpoint
CREATE TABLE `modules` (
	`path` text PRIMARY KEY NOT NULL,
	`relative_path` text NOT NULL,
	`module_name` text,
	`pipeline_stage` text,
	`exports` text,
	`imports` text,
	`dependencies` text,
	`symbol_count` integer DEFAULT 0,
	`relationship_count` integer DEFAULT 0,
	`pattern_count` integer DEFAULT 0,
	`last_analyzed` integer DEFAULT CURRENT_TIMESTAMP,
	`confidence` real DEFAULT 0,
	`parse_success` integer DEFAULT true
);
--> statement-breakpoint
CREATE INDEX `idx_modules_name` ON `modules` (`module_name`);--> statement-breakpoint
CREATE INDEX `idx_modules_stage` ON `modules` (`pipeline_stage`);--> statement-breakpoint
CREATE TABLE `pattern_cache` (
	`pattern_name` text PRIMARY KEY NOT NULL,
	`symbol_ids` text NOT NULL,
	`last_updated` integer,
	`computation_time_ms` integer
);
--> statement-breakpoint
CREATE TABLE `pattern_symbols` (
	`pattern_id` integer,
	`symbol_id` integer,
	`role` text,
	PRIMARY KEY(`pattern_id`, `symbol_id`),
	FOREIGN KEY (`pattern_id`) REFERENCES `detected_patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pattern_symbols_pattern` ON `pattern_symbols` (`pattern_id`);--> statement-breakpoint
CREATE INDEX `idx_pattern_symbols_symbol` ON `pattern_symbols` (`symbol_id`);--> statement-breakpoint
CREATE TABLE `project_languages` (
	`project_id` integer NOT NULL,
	`language_id` integer NOT NULL,
	`config` text,
	`is_primary` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`project_id`, `language_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_languages_project` ON `project_languages` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_languages_language` ON `project_languages` (`language_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`description` text,
	`root_path` text NOT NULL,
	`config_path` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`is_active` integer DEFAULT true,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);--> statement-breakpoint
CREATE INDEX `idx_projects_name` ON `projects` (`name`);--> statement-breakpoint
CREATE INDEX `idx_projects_active` ON `projects` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_projects_root_path` ON `projects` (`root_path`);--> statement-breakpoint
CREATE TABLE `python_features` (
	`symbol_id` integer PRIMARY KEY NOT NULL,
	`decorators` text,
	`type_hint` text,
	`return_type_hint` text,
	`is_async` integer DEFAULT false,
	`is_generator` integer DEFAULT false,
	`is_coroutine` integer DEFAULT false,
	`is_dunder` integer DEFAULT false,
	`is_property` integer DEFAULT false,
	`is_classmethod` integer DEFAULT false,
	`is_staticmethod` integer DEFAULT false,
	`metaclass` text,
	`docstring` text,
	`import_from` text,
	`import_as` text,
	`is_relative_import` integer DEFAULT false,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rich_function_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_id` integer NOT NULL,
	`callee_id` integer NOT NULL,
	`call_site_line` integer NOT NULL,
	`call_type` text NOT NULL,
	`is_vulkan_api` integer DEFAULT false,
	`vulkan_operation_category` text,
	`call_frequency_estimate` text,
	`is_gpu_dispatch` integer DEFAULT false,
	`has_side_effects` integer DEFAULT false,
	`passes_large_data` integer DEFAULT false,
	`estimated_data_size_bytes` integer DEFAULT 0,
	`modifies_global_state` integer DEFAULT false,
	`pipeline_stage_from` text,
	`pipeline_stage_to` text,
	`crosses_stage_boundary` integer DEFAULT false,
	FOREIGN KEY (`caller_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callee_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rich_calls_caller` ON `rich_function_calls` (`caller_id`);--> statement-breakpoint
CREATE INDEX `idx_rich_calls_callee` ON `rich_function_calls` (`callee_id`);--> statement-breakpoint
CREATE INDEX `idx_rich_calls_vulkan` ON `rich_function_calls` (`is_vulkan_api`);--> statement-breakpoint
CREATE INDEX `idx_rich_calls_crosses` ON `rich_function_calls` (`crosses_stage_boundary`);--> statement-breakpoint
CREATE TABLE `search_queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`query_type` text,
	`results_count` integer DEFAULT 0,
	`success` integer DEFAULT true,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_search_queries_type` ON `search_queries` (`query_type`);--> statement-breakpoint
CREATE INDEX `idx_search_queries_timestamp` ON `search_queries` (`timestamp`);--> statement-breakpoint
CREATE TABLE `semantic_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol_id` integer NOT NULL,
	`connected_id` integer NOT NULL,
	`connection_type` text NOT NULL,
	`confidence` real DEFAULT 0.8,
	`evidence` text,
	`detected_by` text DEFAULT 'unified',
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_semantic_connections_symbol` ON `semantic_connections` (`symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_semantic_connections_connected` ON `semantic_connections` (`connected_id`);--> statement-breakpoint
CREATE INDEX `idx_semantic_connections_type` ON `semantic_connections` (`connection_type`);--> statement-breakpoint
CREATE TABLE `semantic_equivalents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`symbol_id_1` integer,
	`symbol_id_2` integer,
	`equivalence_type` text NOT NULL,
	`similarity_score` real DEFAULT 1 NOT NULL,
	`mapping_rules` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol_id_1`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol_id_2`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_semantic_equivalents_project` ON `semantic_equivalents` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_semantic_equivalents_symbol1` ON `semantic_equivalents` (`symbol_id_1`);--> statement-breakpoint
CREATE INDEX `idx_semantic_equivalents_symbol2` ON `semantic_equivalents` (`symbol_id_2`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_semantic_equivalents_unique` ON `semantic_equivalents` (`symbol_id_1`,`symbol_id_2`);--> statement-breakpoint
CREATE TABLE `semantic_tag_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`is_universal` integer DEFAULT true,
	`applicable_languages` text,
	`parent_tag_id` integer,
	`validation_rules` text,
	`color` text,
	`icon` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`is_active` integer DEFAULT true,
	FOREIGN KEY (`parent_tag_id`) REFERENCES `semantic_tag_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semantic_tag_definitions_name_unique` ON `semantic_tag_definitions` (`name`);--> statement-breakpoint
CREATE INDEX `idx_semantic_tag_definitions_name` ON `semantic_tag_definitions` (`name`);--> statement-breakpoint
CREATE INDEX `idx_semantic_tag_definitions_category` ON `semantic_tag_definitions` (`category`);--> statement-breakpoint
CREATE INDEX `idx_semantic_tag_definitions_parent` ON `semantic_tag_definitions` (`parent_tag_id`);--> statement-breakpoint
CREATE TABLE `session_modifications` (
	`session_id` text NOT NULL,
	`symbol_name` text NOT NULL,
	`file_path` text NOT NULL,
	`modification_type` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_modifications_session` ON `session_modifications` (`session_id`);--> statement-breakpoint
CREATE TABLE `symbol_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_id` integer NOT NULL,
	`callee_id` integer NOT NULL,
	`line_number` integer NOT NULL,
	`column_number` integer,
	`call_type` text DEFAULT 'direct' NOT NULL,
	`condition` text,
	`is_conditional` integer DEFAULT false NOT NULL,
	`is_recursive` integer DEFAULT false NOT NULL,
	`argument_types` text,
	`created_at` integer DEFAULT '"2025-07-20T22:08:29.470Z"' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `symbol_semantic_tags` (
	`symbol_id` integer,
	`tag_id` integer,
	`confidence` real DEFAULT 1,
	`auto_detected` integer DEFAULT false,
	`detector_name` text,
	`context` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(`symbol_id`, `tag_id`),
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `semantic_tag_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_symbol_semantic_tags_symbol` ON `symbol_semantic_tags` (`symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_symbol_semantic_tags_tag` ON `symbol_semantic_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tool_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_name` text NOT NULL,
	`parameters` text,
	`result_summary` text,
	`success` integer DEFAULT true,
	`execution_time_ms` integer,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_tool_usage_tool_name` ON `tool_usage` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_tool_usage_timestamp` ON `tool_usage` (`timestamp`);--> statement-breakpoint
CREATE TABLE `typescript_features` (
	`symbol_id` integer PRIMARY KEY NOT NULL,
	`type_annotation` text,
	`generic_params` text,
	`type_constraints` text,
	`is_readonly` integer DEFAULT false,
	`is_optional` integer DEFAULT false,
	`decorators` text,
	`is_namespace` integer DEFAULT false,
	`export_type` text,
	`is_union_type` integer DEFAULT false,
	`is_intersection_type` integer DEFAULT false,
	`is_conditional_type` integer DEFAULT false,
	`is_mapped_type` integer DEFAULT false,
	`utility_type` text,
	`is_ambient` integer DEFAULT false,
	`is_declaration` integer DEFAULT false,
	FOREIGN KEY (`symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `universal_relationships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`from_symbol_id` integer,
	`to_symbol_id` integer,
	`type` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`context_line` integer,
	`context_column` integer,
	`context_snippet` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_universal_relationships_project` ON `universal_relationships` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_universal_relationships_from` ON `universal_relationships` (`from_symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_universal_relationships_to` ON `universal_relationships` (`to_symbol_id`);--> statement-breakpoint
CREATE INDEX `idx_universal_relationships_type` ON `universal_relationships` (`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_universal_relationships_unique` ON `universal_relationships` (`from_symbol_id`,`to_symbol_id`,`type`);--> statement-breakpoint
CREATE TABLE `universal_symbols` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`language_id` integer NOT NULL,
	`name` text NOT NULL,
	`qualified_name` text NOT NULL,
	`kind` text NOT NULL,
	`file_path` text NOT NULL,
	`line` integer NOT NULL,
	`column` integer NOT NULL,
	`end_line` integer,
	`end_column` integer,
	`return_type` text,
	`signature` text,
	`visibility` text,
	`namespace` text,
	`parent_symbol_id` integer,
	`is_exported` integer DEFAULT false,
	`is_async` integer DEFAULT false,
	`is_abstract` integer DEFAULT false,
	`language_features` text,
	`semantic_tags` text,
	`confidence` real DEFAULT 1,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_symbol_id`) REFERENCES `universal_symbols`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_project` ON `universal_symbols` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_language` ON `universal_symbols` (`language_id`);--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_qualified_name` ON `universal_symbols` (`qualified_name`);--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_kind` ON `universal_symbols` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_file_path` ON `universal_symbols` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_namespace` ON `universal_symbols` (`namespace`);--> statement-breakpoint
CREATE INDEX `idx_universal_symbols_parent` ON `universal_symbols` (`parent_symbol_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_universal_symbols_unique` ON `universal_symbols` (`project_id`,`language_id`,`qualified_name`,`file_path`,`line`);