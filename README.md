# Module Sentinel

A high-performance multi-language code analysis tool implementing the Model Context Protocol (MCP) with optional ML-enhanced capabilities.

## Features

### Core Analysis
- **Multi-language parsing**: C++, Rust, TypeScript, Python, Go using tree-sitter
- **Symbol extraction**: Functions, classes, interfaces, and relationships
- **Pattern detection**: Design patterns, code duplication, architectural insights
- **Similarity analysis**: Code similarity scoring and duplicate detection
- **Cross-language detection**: API calls, FFI, subprocess interactions

### Architecture
- **Hybrid Rust/TypeScript**: High-performance Rust core with TypeScript MCP interface
- **Universal AST**: Unified representation across all supported languages
- **NAPI-RS bindings**: Native Node.js integration for optimal performance
- **SQLite storage**: Embedded database for symbol indexing and caching

## Quick Start

### Installation
```bash
npm install
npm run build        # Build both Rust and TypeScript components
```

### Usage

#### MCP Server
```bash
npm run start:mcp    # Start Model Context Protocol server
```

#### Standalone Analysis
```bash
npm run start:dashboard  # Web visualization dashboard (port 6969)
```

#### Development
```bash
npm run dev          # Development mode with file watching
```

## Optional ML Features

Module Sentinel supports optional machine learning enhancements for improved analysis accuracy.

### Enable ML Features
```bash
# Build with ML support
npm run build:rust -- --features ml

# The default build excludes ML dependencies for smaller size
npm run build        # Standard build without ML
```

### ML Capabilities (when enabled)
- **Enhanced similarity detection**: 70% → 90% accuracy improvement
- **Error prediction**: Intelligent syntax error suggestions
- **Code completion**: Context-aware token prediction
- **Smart tokenization**: Language-aware code tokenization

### ML Models
- **Code similarity embedder**: 15MB model for duplicate detection
- **Error predictor**: 50MB model for syntax error recovery
- **Simple completion**: 60MB model for basic autocomplete

Total ML bundle: ~125MB (downloaded on first use)

## API

### MCP Tools
- `search_symbols`: Query codebase symbols with filters
- `index_project`: Parse and analyze project files
- `analyze_patterns`: Detect design patterns and code smells
- `calculate_similarity`: Compare symbol similarity scores
- `parse_file`: Single file analysis

### REST API
```bash
# Symbol search
GET /api/symbols?query=function&language=rust

# Project analysis
POST /api/analyze
Content-Type: application/json
{"projectPath": "/path/to/code"}
```

## Language Support

| Language   | Parsing | Patterns | Cross-Language |
|------------|---------|----------|----------------|
| C++        | ✅      | ✅       | ✅             |
| Rust       | ✅      | ✅       | ✅             |
| TypeScript | ✅      | ✅       | ✅             |
| Python     | ✅      | ✅       | ✅             |
| Go         | ✅      | ⚠️       | ✅             |
| Java       | ✅      | ⚠️       | ⚠️             |

## Performance

### Core Parser
- **Memory efficient**: Memory-mapped file reading, zero-copy processing
- **Parallel processing**: Work-stealing queue for concurrent parsing
- **Caching**: LRU cache with Bloom filters for duplicate detection
- **Batch operations**: Optimized database insertions

### Resource Usage
- **Standard build**: ~50MB memory footprint
- **With ML features**: ~2-4GB memory (models loaded on demand)
- **Parse speed**: ~10,000 LOC/second typical throughput

## Development

### Build System
```bash
npm run build:rust          # Build native Rust bindings
npm run build:dashboard      # Build web visualization
npm run typecheck           # TypeScript type checking
npm run lint                # Code quality checks
```

### Testing
```bash
# Rust tests (comprehensive)
cd module-sentinel-rust/parser-service
cargo test

# TypeScript integration tests
npm test
```

### Architecture Overview
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   MCP Client    │ -> │ TypeScript   │ -> │ Rust Parser     │
│                 │    │ Bridge       │    │ Service         │
└─────────────────┘    └──────────────┘    └─────────────────┘
                                                     │
                                            ┌─────────────────┐
                                            │ SQLite Database │
                                            │ Symbol Storage  │
                                            └─────────────────┘
```

## License

Licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Contributing

1. Install dependencies: `npm install`
2. Build native bindings: `npm run build:rust`
3. Run tests: `cargo test` (Rust) and `npm test` (TypeScript)
4. Follow the coding conventions in [CLAUDE.md](CLAUDE.md)

---

**Note**: ML features are optional and can be disabled for lighter deployments. The core analysis functionality works independently of ML enhancements.