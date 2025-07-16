# Module Sentinel - Agentic Guide

This document serves as a comprehensive guide for the Gemini agent to effectively understand, interact with, and contribute to the `module-sentinel` project. It outlines the project's purpose, architecture, available tools, and development conventions.

## 1. Project Overview

The `module-sentinel` is an MCP (Model Context Protocol) server designed to provide intelligent C++ module analysis and architectural insights for the Planet ProcGen project. Its core functionalities include:

*   **C++ Module Analysis**: Parsing and analyzing C++ modules to extract symbols, relationships, and architectural information.
*   **Architectural Insights**: Providing tools for dependency mapping, impact analysis, boundary validation, and architectural decision recording.
*   **Code Search & Suggestions**: Offering intelligent search capabilities (semantic search, symbol lookup) and import/module suggestions.
*   **Visualization**: Generating various visualizations of the codebase architecture.
*   **Persistent Knowledge**: Storing analyzed data and architectural decisions in a SQLite database for continuous learning and retrieval.

The primary entry point and active server implementation is `src/index.ts`. The `src/module-sentinel.ts` file appears to contain an older or internal class definition and is not directly used by the MCP server.

## 2. Architecture

The `module-sentinel` employs a database-centric architecture, leveraging SQLite for persistent storage of all analyzed code data.

*   **MCP Server (`src/index.ts`)**: The main application entry point. It initializes the database, sets up the MCP server, and exposes various tools and resources.
*   **Database (`module-sentinel.db`)**: A SQLite database that stores all indexed information.
    *   **Schema Management (`src/database/unified-schema-manager.ts`)**: Manages the database schema, ensuring consistency and providing methods for schema initialization and health reports. Key tables include:
        *   `enhanced_symbols`: Stores detailed information about C++ symbols (functions, classes, variables, etc.).
        *   `symbol_relationships`: Records relationships between symbols (calls, uses, inherits, implements).
        *   `architectural_decisions`: Stores recorded architectural decisions.
        *   `code_patterns` & `detected_patterns`: For managing and tracking code patterns/anti-patterns.
        *   `usage_examples`: Stores code snippets demonstrating usage of symbols.
        *   `modules`: Stores basic information about indexed files/modules.
*   **Indexing Subsystem (`src/services/unified-indexer.ts`)**: Orchestrates the code indexing process.
    *   **`ClangIntelligentIndexer` (`src/indexing/clang-intelligent-indexer.ts`)**: Responsible for deep AST analysis using Clang, extracting detailed symbol information and types.
    *   **`PatternAwareIndexer` (`src/indexing/pattern-aware-indexer.ts`)**: Focuses on identifying relationships and usage patterns between symbols.
    *   **`ModuleIndexer` (`src/services/module-indexer.ts`)**: Handles basic file/module discovery and indexing.
*   **Tool Implementations (`src/tools/`)**: Contains the business logic for the various MCP tools exposed by the server.
    *   `Priority1Tools.ts`: Implements high-priority tools like `find_implementations`, `find_similar_code`, and `analyze_cross_file_dependencies`.
    *   `Priority2Tools.ts`: Implements tools like `get_api_surface`, `analyze_impact`, `validate_boundaries`, and `suggest_module`.
    *   `UnifiedSearch.ts`: Provides a natural language interface for searching the codebase, leveraging `SemanticAnalyzer` to understand user intent.
*   **Services (`src/services/`)**: Contains various helper services used by the tools and indexers, such as `SemanticAnalyzer` (for natural language processing) and `AnalyticsService` (for reporting).
*   **Parsers (`src/parsers/`)**: Contains different C++ parsing strategies (e.g., `CppAstAnalyzer`, `StreamingCppParser`).
*   **Engines (`src/engines/`)**: Contains core processing engines like `ParallelProcessingEngine` and `ThoughtSignaturePreserver`.
*   **Visualizations (`src/visualization/`)**: Logic for generating architectural visualizations.

	
	claude mcp add-json module-sentinel '{
      "command": "/home/warxh/.nvm/versions/node/v22.17.0/bin/node",
      "args": ["/home/warxh/cpp_mcp_master/module-sentinel/dist/index.js"],
      "cwd": "/home/warxh/cpp_mcp_master/module-sentinel",
      "env": {
        "GEMINI_API_KEY": "'$GEMINI_API_KEY'",
        "NODE_ENV": "development"
      }
    }'

## 3. Available MCP Tools

The `module-sentinel` MCP server exposes a rich set of tools for code analysis and architectural insights. When interacting with the project, prioritize using these tools to gather information or perform actions.

### Priority 1 Tools (High-Impact Analysis)

*   **`find_implementations`**: Find all implementations of a given interface or base class.
    *   **Input**: `interfaceName` (string), `keywords` (string[]), `returnType` (string, optional)
*   **`find_similar_code`**: Find code similar to a given snippet or pattern.
    *   **Input**: `codeSnippet` (string), `threshold` (number, 0-1, default 0.7)
*   **`analyze_cross_file_dependencies`**: Analyze cross-file dependencies and usage patterns. Crucial for understanding downstream impact before modifying code, finding all files that depend on a symbol, or analyzing file-to-file relationships.
    *   **Input**: `analysisType` (enum: 'symbol', 'file', 'downstream_impact', 'file_dependencies'), `symbolName` (string, optional), `filePath` (string, optional), `includeUsageDetails` (boolean, default true)

### Priority 2 Tools (Architectural & Design Insights)

*   **`get_api_surface`**: Get the public API surface of a module.
    *   **Input**: `modulePath` (string)
*   **`analyze_impact`**: Analyze the impact of changes to a symbol.
    *   **Input**: `symbolName` (string)
*   **`validate_boundaries`**: Validate architectural boundaries and detect violations.
    *   **Input**: `checkType` (string, 'layer', 'module', 'all', default 'all')
*   **`suggest_module`**: Suggest the best module for a new class or functionality.
    *   **Input**: `className` (string), `description` (string)

### Unified Search Tools

*   **`find_module_for_symbol`**: Find which module contains a specific symbol.
    *   **Input**: `symbolName` (string)
*   **`semantic_search`**: Search code using natural language queries.
    *   **Input**: `query` (string)

### Index Management Tools

*   **`rebuild_index`**: Rebuild the code index.
    *   **Input**: `projectPath` (string)
*   **`index_status`**: Get the current status of the code index.
*   **`clear_cache`**: Clear pattern search cache for fresh searches.
*   **`generate_visualization`**: Generate project architecture visualizations (SVG treemap, interactive HTML, dependency matrix).
    *   **Input**: `outputDir` (string, default './visualizations'), `includeInteractive` (boolean, default true)

## 4. Available MCP Resources

The server also exposes several resources that can be read:

*   **`module-sentinel://project-index`**: Searchable index of all project symbols and modules.
*   **`module-sentinel://parser-metrics`**: Statistics about parsing quality and confidence scores.
*   **`module-sentinel://analytics-report`**: Comprehensive code quality and architectural analysis.

## 5. Development Workflow

The project uses TypeScript, Jest for testing, and ESLint for linting.

*   **Build**: `npm run build` (compiles TypeScript to `dist/`)
*   **Development Mode (with hot reload)**: `npm run dev`
*   **Start Server**: `npm start` (runs `dist/index.js`)
*   **Run Tests**: `npm test` (uses Jest)
*   **Type Checking**: `npm run typecheck`
*   **Linting**: `npm run lint`

## 6. Conventions & Best Practices

*   **Language**: TypeScript. Adhere to existing TypeScript patterns and type safety.
*   **Database Interaction**: Use `better-sqlite3` for direct database access. All database schema changes should be managed via `UnifiedSchemaManager`.
*   **Schema Validation**: `zod` is used for input schema validation for MCP tool requests.
*   **Error Handling**: Implement robust error handling, especially for file system operations and database interactions.
*   **Paths**: Use `path` module for path manipulation to ensure cross-platform compatibility.
*   **Environment Variables**: Sensitive information (like API keys) and configurable paths should be managed via `.env` files and `dotenv`.
*   **Modularity**: Keep code organized into logical modules and services within the `src/` directory.
*   **Testing**: Write unit and integration tests for new features and bug fixes. Refer to `test/TestRunner.ts` and existing test files for examples.
*   **Performance**: Be mindful of performance, especially for indexing and analysis operations, as indicated by the performance targets in `README.md`.
*   **Comments**: Add comments to explain complex logic or design decisions, but avoid redundant comments.
