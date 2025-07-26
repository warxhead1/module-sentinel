# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Module Sentinel is a multi-language code analysis tool implementing MCP (Model Context Protocol) with a hybrid Rust/TypeScript architecture. It provides intelligent symbol analyzer, featuring tree-sitter parsing, semantic analysis, and code visualization.

## Essential Commands

```bash
# Core development
npm run build                 # Build both Rust bindings and TypeScript code
npm run build:rust           # Build Rust NAPI bindings (required for functionality)
npm run build:rust:debug     # Build Rust bindings in debug mode
npm run build:dashboard      # Build visualization dashboard
npm run dev                  # Start development with file watching

# Running the application
npm run start:mcp            # Start MCP server
npm run start:dashboard      # Start standalone dashboard server

# Code quality
npm run lint                 # Check TypeScript for issues
npm run lint:fix             # Auto-fix linting issues
npm run lint:check           # Strict linting (pre-build check)
npm run typecheck            # TypeScript type checking

# Utilities
npm run clean                # Remove build artifacts
```

## Architecture Overview

### Hybrid Rust/TypeScript Design

The project uses a **Rust core + TypeScript wrapper** architecture:

- **Rust Core** (`module-sentinel-rust/`): High-performance parsing engine using tree-sitter
  - `parser-service/`: Multi-language parsing with universal AST
  - `napi-bindings/`: NAPI-RS bridge for TypeScript integration
  - `shared-types/`: Common data structures

- **TypeScript Layer** (`src/`): MCP server and dashboard
  - `index.ts`: Main MCP server with tool definitions
  - `dashboard-server.ts`: Minimal HTTP server for visualization
  - `rust-bridge/`: TypeScript wrapper for Rust bindings
  - `types/`: TypeScript definitions for Rust data structures

### Key Components

1. **MCP Server** (`src/index.ts`): Implements Model Context Protocol with tools:
   - `search_symbols`: Query codebase symbols
   - `index_project`: Parse and analyze project files
   - `analyze_patterns`: Detect code patterns and design patterns
   - `calculate_similarity`: Compare symbol similarity
   - `parse_file`: Single file analysis

2. **Rust Parser Service**: Tree-sitter based multi-language parsing
   - Universal AST representation across languages
   - Pattern-based symbol extraction
   - Cross-language relationship detection
   - Performance-optimized with caching

3. **Dashboard Server**: Minimal HTTP server for code visualization
   - Zero-dependency Node.js HTTP server
   - API routes bridging to Rust analysis
   - Static file serving for web components

### Data Flow

1. **MCP Client** → **TypeScript MCP Server** → **Rust Bridge** → **Parser Service**
2. **Parser Service** extracts symbols → **Database** → **API responses** → **Dashboard**

## Development Patterns

### Rust-First Philosophy

- Core logic implemented in Rust for performance
- TypeScript acts as interface layer only
- Always build Rust bindings before TypeScript development
- Use structured logging from `utils/logger.ts`

### Error Handling

```typescript
// Rust bridge operations always include fallback strategies
try {
  const result = await this.rustBridge!.searchSymbols(query, options);
  return { success: true, data: result };
} catch (error) {
  // Fallback to quick search
  const results = await quickSearch(this.projectPath, query, options.limit);
  return { success: true, data: results };
}
```

### Process Management

- Single instance enforcement via PID file locking
- Graceful shutdown handling for SIGINT/SIGTERM
- Automatic cleanup of stale processes

## NAPI-RS Integration

### Building Native Bindings

The Rust code compiles to a native Node.js addon via NAPI-RS:

```bash
# Build for current platform
npm run build:rust

# The output is: module-sentinel-rust.node
```

### Bridge Pattern

TypeScript code loads the native module:

```typescript
// Lazy loading with error handling
async function loadRustBindings() {
  try {
    rustBindings = await import('../../module-sentinel-rust.node');
    return rustBindings;
  } catch (error) {
    throw new Error(`NAPI bindings not found: ${error}. Run 'npm run build:rust' first.`);
  }
}
```

## Testing Strategy

Currently focused on Rust-side testing:
- Integration tests in `module-sentinel-rust/parser-service/tests/`
- Pattern detection tests for various languages
- Database integration tests
- Performance benchmarks

## Language Support

The parser supports multiple languages through tree-sitter:
- **C++**: Primary focus, complex template and namespace support
- **Rust**: Full language support
- **TypeScript/JavaScript**: Modern syntax support
- **Python**: Class and function analysis
- **Go**: Basic parsing support

Languages are defined via pattern files and can be hot-reloaded without recompilation.

## Performance Considerations

### Rust Optimizations
- Memory-mapped file reading
- Zero-copy string processing
- Parallel parsing with work-stealing queues
- LRU caching with Bloom filters
- Batch database operations

### Development Mode
- Use `npm run dev` for file watching
- Dashboard runs on port 6969 by default
- TypeScript compilation occurs before server restart

## Database Integration

Uses SQLite with direct Rust integration:
- Schema matches TypeScript models for compatibility
- Batch insertions for performance
- Transaction management for consistency

## Environment Configuration

```bash
# Optional environment variables
MODULE_SENTINEL_PROJECT_PATH=/path/to/analyze  # Project to analyze
NODE_ENV=development|production                # Environment mode
```

## Common Gotchas

1. **Rust bindings must be built first**: Run `npm run build:rust` before development
2. **Platform-specific builds**: NAPI bindings are platform-specific
3. **Memory usage**: Large projects may require `--max-old-space-size` flag
4. **Process isolation**: Only one MCP server instance per project

## File Structure Conventions

- `kebab-case` for all filenames
- `.service.ts` suffix for service files
- `.types.ts` suffix for type definitions
- Rust modules follow standard Cargo conventions

## Integration Points

- **MCP Protocol**: Standard model context protocol implementation
- **Tree-sitter**: Language parsing with query-based pattern matching
- **SQLite**: Embedded database for symbol storage
- **NAPI-RS**: Native addon bindings for Rust integration
- **Vite**: Dashboard build system with hot module replacement

This architecture enables high-performance multi-language analysis while maintaining TypeScript developer experience through the MCP interface.