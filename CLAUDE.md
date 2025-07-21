# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Module Sentinel is an MCP (Model Context Protocol) server that provides intelligent C++ module analysis and architectural insights for the Planet ProcGen project. It uses tree-sitter for parsing C++23 modules (.ixx files) and provides tools to help maintain architectural boundaries, prevent code duplication, and guide proper module integration.

## Key Commands

### Building and Running

```bash
# Core build commands:
  npm run build         # Build TypeScript sources
  npm run clean         # Clean build artifacts

# Test runner (automatically builds first):
  npm run test          # Run all tests
  npm run test:filter <pattern>  # Run tests matching pattern (fuzzy)
  npm run test:comparison  # Run parser comparison test specifically
  
# Test runner with tsx directly (for more control):
  tsx run-tests.ts               # Build and run all tests
  tsx run-tests.ts --filter parser  # Fuzzy match: runs ParserComparisonTest
  tsx run-tests.ts --filter semantic # Fuzzy match: runs SemanticSearchTest, RichSemanticAnalysisTest
  tsx run-tests.ts --rebuild     # Force rebuild database before tests
  tsx run-tests.ts --include-new-parsers  # Include experimental parser tests

# Dashboard:
  npm run dashboard     # Start the visualization dashboard
```

### Test Filtering Examples

The test runner uses case-insensitive partial matching:
- `--filter parser` matches: ParserComparisonTest, ParserSupremacyTest
- `--filter semantic` matches: SemanticSearchTest, RichSemanticAnalysisTest
- `--filter api` matches: APIEndpointsTest
- `--filter tool` matches: ToolsIntegrationTest

## Architecture Overview

### Core Components

1. **StreamingCppParser** (`src/parsers/streaming-cpp-parser.ts`)

   - Handles C++23 module syntax (`export module`, `import`, etc.)
   - Falls back to line-based parsing for large files (>50KB)
   - Returns `ModuleSymbols` with Sets of exports, imports, functions, classes

2. **PatternAwareIndexer** (`src/indexing/pattern-aware-indexer.ts`)

   - Creates SQLite database with `enhanced_symbols` table
   - Detects patterns: GPU/CPU execution, factory patterns, anti-patterns
   - Builds semantic tags and relationships between symbols
   - Critical: Must be initialized before other tools can query the database

3. **ModuleSentinel** (`src/module-sentinel.ts`)

   - Main orchestrator class
   - Uses lazy database initialization for ModuleIndexer
   - Manages caching and parallel processing
   - Identifies pipeline stages based on file paths

4. **Priority Tools** (`src/tools/`)
   - Priority1Tools: find_implementations, find_similar_code
   - Priority2Tools: get_api_surface, analyze_impact (requires additional tables)
   - UnifiedSearch: Natural language search interface

### Database Schema

The system uses SQLite databases with these key tables:

- `enhanced_symbols`: Main symbol storage with semantic tags
- `semantic_connections`: Relationships between symbols
- `pattern_cache`: Cached pattern search results
- `module_index`: File-level module information

### Pipeline Stages

The project uses a defined pipeline architecture:

- `noise_generation`: Noise algorithms and generators
- `terrain_formation`: Terrain generation and orchestration
- `atmospheric_dynamics`: Weather and atmosphere
- `geological_processes`: Geological features
- `ecosystem_simulation`: Ecosystem and life
- `weather_systems`: Weather patterns
- `final_rendering`: Vulkan rendering pipeline

### Test Architecture

Tests follow SOLID principles with:

- `BaseTest`: Abstract base for all tests
- `TestDatabaseManager`: Handles database lifecycle
- `TestRunner`: Builds index once, runs all tests
- Tests share a common database in `.test-db/main/`

## Important Implementation Details

### C++23 Module Support

- The parser detects `export module X;` and `import Y;` statements
- Module files use `.ixx` extension
- Export detection includes namespaces, classes, and functions
- The parser does NOT currently add `module:` prefix to exports (known issue)

### Database Management

- Uses lazy initialization pattern to handle connection failures
- `getDatabase()` method recreates connections if closed
- Pattern-aware indexer must run before querying enhanced_symbols
- Different tools expect different database schemas (some incompatibility)

### Common Issues and Solutions

1. **"no such table: enhanced_symbols"**

   - Ensure PatternAwareIndexer has run first
   - Check database path consistency
   - Verify table creation in initDatabase()

2. **Database connection errors**

   - ModuleIndexer uses lazy initialization
   - Check for premature close() calls
   - Ensure shared database paths in tests

3. **Missing semantic tags**
   - Current coverage ~70%
   - Anti-pattern detection needs improvement
   - Some patterns not detected in .ixx files

## Configuration

The system uses `module-sentinel.config.json` to specify:

- Project path: `/home/warxh/planet_procgen`
- Scan paths for indexing
- File patterns for C++ source and headers
- Stage mapping for architectural organization

## Performance Considerations

- Streaming parser used for files >50KB
- Parallel processing via worker threads
- SQLite indices on key columns for fast queries
- Cache hit rate target: >95%
- Module analysis target: <50ms per module

## Build Process & File Guidelines

### NEVER EDIT THESE GENERATED FILES:
- `/workspace/dashboard/dist/**/*` - Auto-generated from TypeScript sources
- Files with build timestamps in headers

### EDIT THESE SOURCE FILES INSTEAD:
- `/workspace/src/dashboard/components/*.ts` - TypeScript component sources  
- `/workspace/dashboard/spa/index.html` - HTML template source
- `/workspace/src/api/visualization-api.ts` - API endpoint definitions

### Build Commands:
- `npm run build:dashboard` - Rebuilds dashboard from TypeScript sources
- Generated files get automatically overwritten on build
