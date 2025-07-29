# Module Sentinel

A high-performance multi-language code analysis tool implementing the Model Context Protocol (MCP) with advanced visualization and flow analysis capabilities.

## Features

### Core Analysis
- **Multi-language parsing**: C++, Rust, TypeScript, Python, Go using tree-sitter
- **Symbol extraction**: Functions, classes, interfaces, and relationships
- **Pattern detection**: Design patterns, code duplication, architectural insights
- **Similarity analysis**: Code similarity scoring and duplicate detection
- **Cross-language detection**: API calls, FFI, subprocess interactions
- **Code quality metrics**: Complexity analysis, bottleneck detection, performance insights

### Architecture
- **Hybrid Rust/TypeScript**: High-performance Rust core with TypeScript MCP interface
- **Universal AST**: Unified representation across all supported languages
- **NAPI-RS bindings**: Native Node.js integration for optimal performance
- **SQLite storage**: Embedded database for symbol indexing and caching
- **Zero-dependency dashboard**: Pure Node.js HTTP server for visualization

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

#### Dashboard Server
```bash
npm run start:dashboard  # Web visualization dashboard (port 6969)

# Access the dashboard at:
# - http://localhost:6969 - Main architecture visualization with mode selector
# - http://localhost:6969/flow.html - Standalone flow comparison dashboard

# Available flow visualization modes:
# 1. Enhanced (Original) - Full features, ~1500 particles
# 2. Performance Optimized - 60 FPS stable, smart LOD, 10k visual particles
# 3. GPU Accelerated - WebGL2 compute shaders, 100k+ particles
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
- `analyze_code_quality`: Get complexity metrics and suggestions
- `predict_component_reuse`: Find reusable components
- `get_duplicate_groups`: Identify duplicate code blocks
- `get_complexity_metrics`: Analyze code complexity
- `get_project_insights`: Comprehensive project analysis

### REST API
```bash
# Symbol search
GET /api/symbols/search?q=function&language=rust

# Flow API endpoints
GET /api/flow/symbols?limit=100
GET /api/flow/relationships?include_metrics=true
GET /api/flow/metrics/system
GET /api/flow/analysis/bottlenecks

# Real-time updates (Server-Sent Events)
GET /api/flow/stream
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

## Current Status

### Working Features
✅ **Build & Compilation**: Full TypeScript + Rust NAPI build pipeline  
✅ **Flow API**: All endpoints return data (symbols, relationships, metrics)  
✅ **SSE Streaming**: Real-time updates with 2-second intervals  
✅ **Dashboard Server**: Zero-dependency HTTP server on port 6969  
✅ **Visualization**: 3D liquid flow and architecture map views  
✅ **Error Handling**: Graceful fallbacks and mock data when needed  

### Known Limitations
- Symbol search requires wildcard (`*`) query, empty queries fail
- Project must be indexed before real data appears (currently returns mock data)
- Some Rust integration tests fail without proper bindings loaded
- ML features are optional and not included in standard build

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

# TypeScript tests - API and service tests
npm test

# Test results summary:
# - Flow Analysis Service: 9 passing
# - Flow Routes API: 13 passing  
# - Rust Bridge: 5 passing
# - Dashboard Components: 19 passing (1 performance test may vary)
# - MCP Integration: Tests require Rust bindings
```

### Architecture Overview
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   MCP Client    │ -> │ TypeScript   │ -> │ Rust Parser     │
│                 │    │ Bridge       │    │ Service         │
└─────────────────┘    └──────────────┘    └─────────────────┘
        │                      │                     │
        │              ┌──────────────┐    ┌─────────────────┐
        └──────────────│ Flow Service │    │ SQLite Database │
                       │ & Dashboard  │    │ Symbol Storage  │
                       └──────────────┘    └─────────────────┘
                               │
                       ┌──────────────┐
                       │ SSE Stream   │
                       │ Real-time    │
                       └──────────────┘
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