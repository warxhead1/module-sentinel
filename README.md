# Module Sentinel - Keeper of Architectural Boundaries

An MCP server that provides intelligent C++ module analysis and architectural insights for the Planet ProcGen project.

## Features

- **C++ Module Analysis**: Parse and analyze C++ modules using tree-sitter
- **Import Suggestions**: Get intelligent import suggestions based on context
- **Dependency Mapping**: Build and visualize module dependency graphs
- **Architectural Tracking**: Record and retrieve architectural decisions
- **Real-time Monitoring**: Watch directories for changes and auto-analyze
- **Parallel Processing**: Analyze multiple modules concurrently
- **Thought Preservation**: Maintain encrypted reasoning chains across sessions

## Installation

```bash
cd module-sentinel
npm install
npm run build
```

## Usage

### As an MCP Server

```bash
npm start
```

### Integration with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "module-sentinel": {
      "command": "node",
      "args": ["/path/to/module-sentinel/dist/index.js"]
    }
  }
}
```

## Available Tools

### `analyze_module`
Analyze a C++ module file to extract exports, imports, and dependencies.

```typescript
{
  modulePath: string // Path to C++ file
}
```

### `suggest_imports`
Get import suggestions for symbols in your current context.

```typescript
{
  filePath: string,
  content: string,
  symbols?: string[],
  cursor?: { line: number, column: number }
}
```

### `map_architecture`
Generate a complete dependency graph of all analyzed modules.

### `record_decision`
Record architectural decisions for future reference.

```typescript
{
  type: 'import' | 'export' | 'refactor' | 'dependency',
  module: string,
  decision: string,
  reasoning: string,
  impact: string[]
}
```

### `watch_directory`
Watch a directory for C++ file changes.

```typescript
{
  path: string // Directory to watch
}
```

## Performance Targets

- Module Analysis: < 50ms per module
- Import Suggestions: < 25ms
- Parallel Processing: 20+ modules simultaneously
- Memory Usage: < 50MB total
- Cache Hit Rate: > 95%

## Architecture

The Module Sentinel uses:
- **tree-sitter-cpp** for robust C++ parsing
- **Worker Threads** for parallel processing
- **SQLite** for thought signature persistence
- **MCP SDK** for tool integration

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```