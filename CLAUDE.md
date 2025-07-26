# Module Sentinel - AI Agent Guide

## Project Overview

Module Sentinel is a multi-language code analysis and visualization tool supporting C++, Python, TypeScript, and more. It uses tree-sitter parsing with a universal schema design to provide semantic intelligence and code visualization capabilities.

## Quick Command Reference

````bash
npm run dev          # Start development server (port 6969)
npm test            # Run tests (fast, no semantic analysis)
npm run test:semantic  # Run tests with semantic analysis enabled
npm run test:fast     # Run tests without indexing (fastest)
npm run build       # Production build
npm run dashboard   # Start visualization dashboard only



```bash
npm run lint              # Check all TypeScript files for issues
npm run lint:fix          # Automatically fix linting issues
npm run lint:check        # Strict check (used in pre-build)
````

````

## Architecture Essentials

### Core Components

- **unified-server.ts**: Main entry point serving both API and dashboard
- **src/api/**: RESTful API with modular services (database, indexing, semantic insights)
- **src/parsers/**: Tree-sitter based multi-language parsing with unified AST visitor
- **src/analysis/**: Semantic intelligence orchestration, embeddings, clustering
- **src/dashboard/**: Web components with D3.js visualizations

### Data Flow

1. **Parsing**: Source files � Language parser � Universal AST � Symbol extraction � Database
2. **Analysis**: Stored symbols � Semantic analysis � Embeddings � Insights
3. **Visualization**: API request � Service layer � Database � Dashboard component � D3.js

## Critical Development Patterns

### File Naming Convention

- Use **kebab-case** for all files: `semantic-intelligence-orchestrator.ts`
- Service files end with `.service.ts`
- Type definitions end with `.types.ts`

### Underscore Variable Guidelines

Use underscore-prefixed variables to indicate intentionally unused parameters, following these patterns:

**1. Interface Compliance**: Parameters required by interface but not used in implementation
```typescript
canResolve(_context: CallResolutionContext): boolean {
  return true; // Context not needed for this strategy
}
```

**2. Future Implementation**: Parameters reserved for planned functionality
```typescript
constructor(maxSize: number = 100000, _falsePositiveRate: number = 0.01) {
  this.maxSize = maxSize;
  // _falsePositiveRate reserved for future bloom filter config
}
```

**3. Library Callback Requirements**: Required by external library signatures
```typescript
node.on('click', (_event: any, d: any) => {
  this.selectNode(d); // Only need data, not event object
});
```

**4. Destructuring with Unused Elements**: When only some destructured values are needed
```typescript
const [_fullMatch, objectName, memberName] = match;
// Only using capture groups, not full match
```

**5. Debug/Placeholder Functions**: Incomplete implementations with TODO comments
```typescript
const _duration = Date.now() - startTime;
// TODO: Use duration for performance metrics
```

ESLint configuration supports this pattern:
```javascript
"@typescript-eslint/no-unused-vars": [
  "error", 
  { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
]
```

### Error Handling and Logging

Use the structured logger from `src/utils/logger.ts` for consistent logging:

```typescript
import { createLogger } from "../utils/logger.js";

const logger = createLogger("ComponentName");

// Log levels with context
logger.debug("Processing started", { file: "example.ts", count: 42 });
logger.info("Operation completed successfully", { duration: 150 });
logger.warn("High memory usage detected", { heapUsed: "512MB" });
logger.error("Operation failed", error, { operation: "parseFile" });

// Operation timing
const complete = logger.operation("parseFile", { file: "example.ts" });
// ... do work ...
complete(); // Logs completion with duration

// Assertions
logger.assert(symbols.length > 0, "Expected symbols to be found", { file });

// Metrics
logger.metric("parseTime", duration, "ms", { file, symbolCount });
````

**Never use console.log/warn/error directly** - always use the structured logger for consistent formatting and context.

### Database Queries

```typescript
// Use Drizzle ORM for type safety
const result = await this.db
  .select()
  .from(universalSymbols)
  .where(eq(universalSymbols.projectId, projectId))
  .limit(100);
```

### API Response Pattern

```typescript
// Success
res.json({ success: true, data: result });

// Error
res.status(500).json({
  success: false,
  error: error instanceof Error ? error.message : "Operation failed",
});
```

## Key Workflows

### Adding a New Language Parser

1. Install tree-sitter grammar: `npm install tree-sitter-{language}` (tree-sitter v0.25 base required)
2. Create adapter in `src/parsers/adapters/{language}-language-parser.ts`
3. Implement `LanguageParser` interface
4. Register in `ParserRegistry`
5. Add test cases in `test/unit/`

### Database Schema Changes

1. Create migration in `src/database/migrations/00X_description.sql`
2. Update Drizzle schema in `src/database/drizzle/schema.ts`
3. Migrations auto-apply on server startup

### Component Development

```typescript
// Web components extend BaseComponent
export class MyComponent extends BaseComponent {
  async loadData(): Promise<void> {
    /* fetch from API */
  }
  render(): void {
    /* update shadow DOM */
  }
}
// Register: defineComponent('my-component', MyComponent);
```

## Testing Strategy

- **Fast tests** (default): `npm test` - No semantic analysis, uses existing database
- **Filtered tests**: `npm test -- --filter drizzle` - Run specific test suites
- **Semantic tests**: `npm run test:semantic` - Enable expensive semantic analysis
- **Parser-only tests**: `npm run test:fast` - Skip indexing entirely (fastest)
- **Fresh database**: `npm run test:reset` - Reset database before running
- Test database location: `~/.module-sentinel/test/test.db`
- Tests work with existing data (like a real indexer) unless `--rebuild` is used
- Always run `npm test` before commits to validate changes

## Performance Considerations

- Parser instances are pooled and reused
- Symbol resolution uses LRU cache with Bloom filters
- Database operations are batched when possible
- Large file parsing has fallback to pattern-based extraction

### Memory Management

Use the memory monitor from `src/utils/memory-monitor.ts` for tracking memory usage:

```typescript
import {
  MemoryMonitor,
  getGlobalMemoryMonitor,
  checkMemory,
} from "../utils/memory-monitor.js";

// Quick memory check
const stats = checkMemory();
logger.info("Memory status", {
  percentUsed: `${stats.percentUsed.toFixed(1)}%`,
});

// Operation-specific monitoring
const monitor = new MemoryMonitor({
  warningPercent: 70,
  criticalPercent: 85,
  maxHeapMB: 2048,
});

// Track memory usage across an operation
const checkpoint = monitor.createCheckpoint("parseProject");
// ... do memory-intensive work ...
const { duration, memoryDelta } = checkpoint.complete();

// Register callback for memory warnings
monitor.onThresholdExceeded("parser", (stats) => {
  logger.warn("Memory warning - reducing concurrent operations", {
    percentUsed: stats.percentUsed,
    heapUsed: stats.heapUsed,
  });
  // Implement memory reduction strategy
});

// Automatic monitoring
monitor.startMonitoring(30000); // Check every 30 seconds
```

### Memory Best Practices

1. **Use checkpoints** for large operations (file parsing, indexing)
2. **Monitor during concurrent operations** - reduce parallelism when memory is high
3. **Enable garbage collection** with `--expose-gc` flag for production
4. **Batch processing** - process files in smaller groups when memory usage is high

## Common Gotchas

1. **Port conflicts**: Default ports are 6969 (main) and 6970 (HMR)
2. **Database permissions**: Ensure `~/.module-sentinel/` has proper permissions
3. **Parser memory**: Large files may need `--max-old-space-size` adjustment
4. **Build order**: TypeScript must compile before server starts in dev mode

## Integration Points

- **Tree-sitter**: Language parsers with pooling for performance
- **SQLite + Drizzle**: Type-safe database with automatic migrations
- **D3.js**: Force-directed graphs and interactive visualizations
- **Vite**: Fast development server with HMR

## Environment Variables

```bash
GEMINI_API_KEY=your-key        # For AI features (planned)
NODE_ENV=development|test|production
DEV_DB=/custom/path/to/dev.db  # Optional custom DB paths
PROD_DB=/custom/path/to/prod.db
```

## Parser Pitfalls and Testing

### Parser Improvements (Recent Updates)

1. **Enhanced Error Reporting**

   - Parser now reports when falling back to pattern-based extraction
   - Syntax errors are counted and logged with warnings
   - Parse method and errors available in result metadata

   ```typescript
   if ((result as any).parseMethod === "pattern-fallback") {
     logger.warn("Parser fell back to patterns", { file: filePath });
   }
   ```

2. **Modern Syntax Support**

   - ✅ Generators: `function* gen() { }`
   - ✅ Private fields: `class C { #private = 1; }`
   - ✅ Re-exports: `export { MyClass as MC } from './mod'`
   - ✅ Arrow function methods in classes
   - ✅ Getter/setter detection

3. **Advanced Cross-Language Detection**

   - REST APIs: `fetch()`, `axios.post()`
   - gRPC: Proto imports and client creation
   - FFI: `ffi-napi`, `ctypes`
   - WebSockets: `new WebSocket()`
   - Subprocess with language detection

   ```typescript
   // New cross-language detector usage
   import { CrossLanguageDetector } from "./parsers/utils/cross-language-detector.js";
   ```

4. **Performance Optimizations**
   - Configurable cache strategies: `aggressive`, `moderate`, `minimal`
   - Timeout protection for semantic analysis (10s default)
   - LRU cache eviction for memory efficiency
   - Dynamic cache TTL based on strategy

### Testing Parsers Efficiently

#### Test Individual Files Without Full Indexing

```typescript
import Database from "better-sqlite3";
import { TypeScriptLanguageParser } from "./src/parsers/adapters/typescript-language-parser.js";
import { DatabaseInitializer } from "./src/database/db-init.js";

// Create in-memory database for testing
const db = new Database(":memory:");
const initializer = new DatabaseInitializer(db);
await initializer.initialize();

// Test a single file
const parser = new TypeScriptLanguageParser(db, {
  debugMode: true,
  enableSemanticAnalysis: false, // Skip expensive operations
});
await parser.initialize();

const testCode = `
class TestClass {
  async method() { return 42; }
}
`;

const result = await parser.parseFile("test.ts", testCode);
logger.info("Parse completed", {
  symbolCount: result.symbols.length,
  symbols: result.symbols.map((s) => s.name),
  relationshipCount: result.relationships.length,
});
```

#### Common Test Cases to Verify

```typescript
// Test edge cases that often fail
const edgeCases = {
  // Modern syntax
  decorators: "@decorator class C {}",
  privateFields: "class C { #field = 1; }",
  optionalChaining: "obj?.prop?.method?.()",

  // Complex patterns
  nestedClasses: "class Outer { class Inner {} }",
  dynamicImports: 'const mod = await import("./mod")',
  templateLiterals: "type T = `prefix${string}`",

  // Cross-language
  subprocess: 'exec("python script.py")',
  ffi: 'require("ffi-napi")',
};
```

### Parser Accuracy Verification

1. **Check Symbol Counts**

   ```bash
   # Quick validation - parser should find roughly same count as grep
   grep -E "class|function|interface" file.ts | wc -l
   ```

2. **Validate Relationships**

   - Every import should create a relationship
   - Class inheritance should be tracked
   - Method calls within same file should be detected

3. **Monitor Parse Failures**
   ```typescript
   if (result.parseMethod === "pattern-fallback") {
     logger.warn("Tree-sitter parsing failed, using regex fallback", { 
       file: filePath,
       parseMethod: result.parseMethod 
     });
   }
   ```

### Known Parser Bugs

1. **TypeScript**: Arrow functions in object literals missed
2. **Python**: Decorators not linked to decorated items
3. **C++**: Template specializations create duplicate symbols
4. **All**: Unicode in identifiers may cause parsing errors

### Testing Best Practices

1. **Use In-Memory Database**: Avoid expensive disk I/O
2. **Disable Semantic Analysis**: Skip for parser-only tests
3. **Test Small Code Snippets**: Focus on specific patterns
4. **Compare Against Expected**: Maintain expected symbol counts
5. **Run Parser Directly**: Bypass indexing orchestration

### Parser Validation Utility

Use the new `ParserValidator` for comprehensive testing:

```typescript
import { ParserValidator } from "./parsers/utils/parser-validator.js";

const validator = new ParserValidator();
const testCases = ParserValidator.getTypeScriptTestCases();
const results = await validator.runTestSuite(parser, testCases);
```

Run validation: `npm run build && node dist/test-parser-validation.js`

## Debugging Tips

- Enable debug mode: Set `debugMode: true` in components
- Check test results: `test-results.xml` for CI/CD
- Database issues: Run `scripts/check-db-schema.ts`
- Parser issues: Check cache in `OptimizedBaseParser`
- Parse failures: Look for "pattern-fallback" in logs

### Using Utilities Effectively

#### Logger Integration Examples

```typescript
// Component with structured logging
import { createLogger } from "../utils/logger.js";

export class MyParser {
  private logger = createLogger("MyParser");

  async parseFile(file: string): Promise<ParseResult> {
    const complete = this.logger.operation("parseFile", { file });

    try {
      this.logger.debug("Starting parse", { size: fileSize });

      const result = await this.doParser(file);

      this.logger.metric("symbolsFound", result.symbols.length, "count");
      complete();
      return result;
    } catch (error) {
      this.logger.error("Parse failed", error, { file });
      throw error;
    }
  }
}
```

#### Memory Monitor Integration Examples

```typescript
// Service with memory awareness
import { getGlobalMemoryMonitor } from "../utils/memory-monitor.js";

export class IndexingService {
  private memoryMonitor = getGlobalMemoryMonitor();

  async indexProject(projectPath: string): Promise<void> {
    const checkpoint = this.memoryMonitor.createCheckpoint("indexProject");

    // Register memory warning handler
    this.memoryMonitor.onThresholdExceeded("indexing", (stats) => {
      this.logger.warn("Reducing batch size due to memory pressure", {
        percentUsed: stats.percentUsed,
        heapUsed: stats.heapUsed,
      });
      this.reduceBatchSize();
    });

    try {
      await this.processFiles(projectPath);
    } finally {
      const { memoryDelta } = checkpoint.complete();
      this.memoryMonitor.removeCallback("indexing");
    }
  }
}
```
