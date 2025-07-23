# Module Sentinel - AI Agent Guide

## Project Overview

Module Sentinel is a multi-language code analysis and visualization tool supporting C++, Python, TypeScript, and more. It uses tree-sitter parsing with a universal schema design to provide semantic intelligence and code visualization capabilities.

## Quick Command Reference

```bash
npm run dev          # Start development server (port 6969)
npm test            # Run tests and create sample database
npm run build       # Production build
npm run dashboard   # Start visualization dashboard only
```

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

### Error Handling

```typescript
// Always use emoji prefixes for console logging
console.log(` Operation succeeded`);
console.error(`L Operation failed:`, error);
console.warn(`� Warning message`);
```

### Database Queries

```typescript
// Use Drizzle ORM for type safety
const result = await this.db
  .select()
  .from(universalSymbols)
  .where(eq(universalSymbols.projectId, projectId))
  .limit(100);

// Use raw SQL only for complex operations with parameters
db.prepare("DELETE FROM table WHERE id = ?").run(id);
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

- Run specific tests: `npm test -- --filter drizzle`
- Test database location: `~/.module-sentinel/test/test.db`
- Tests use custom assertion framework with emoji feedback
- Always run `npm test` before commits to validate changes

## Performance Considerations

- Parser instances are pooled and reused
- Symbol resolution uses LRU cache with Bloom filters
- Database operations are batched when possible
- Large file parsing has fallback to pattern-based extraction

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
   if ((result as any).parseMethod === 'pattern-fallback') {
     console.warn('Parser fell back to patterns');
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
   import { CrossLanguageDetector } from './parsers/utils/cross-language-detector.js';
   ```

4. **Performance Optimizations**
   - Configurable cache strategies: `aggressive`, `moderate`, `minimal`
   - Timeout protection for semantic analysis (10s default)
   - LRU cache eviction for memory efficiency
   - Dynamic cache TTL based on strategy

### Testing Parsers Efficiently

#### Test Individual Files Without Full Indexing
```typescript
import Database from 'better-sqlite3';
import { TypeScriptLanguageParser } from './src/parsers/adapters/typescript-language-parser.js';
import { DatabaseInitializer } from './src/database/db-init.js';

// Create in-memory database for testing
const db = new Database(':memory:');
const initializer = new DatabaseInitializer(db);
await initializer.initialize();

// Test a single file
const parser = new TypeScriptLanguageParser(db, { 
  debugMode: true,
  enableSemanticAnalysis: false  // Skip expensive operations
});
await parser.initialize();

const testCode = `
class TestClass {
  async method() { return 42; }
}
`;

const result = await parser.parseFile('test.ts', testCode);
console.log('Found symbols:', result.symbols.map(s => s.name));
console.log('Found relationships:', result.relationships.length);
```

#### Common Test Cases to Verify
```typescript
// Test edge cases that often fail
const edgeCases = {
  // Modern syntax
  decorators: '@decorator class C {}',
  privateFields: 'class C { #field = 1; }',
  optionalChaining: 'obj?.prop?.method?.()',
  
  // Complex patterns
  nestedClasses: 'class Outer { class Inner {} }',
  dynamicImports: 'const mod = await import("./mod")',
  templateLiterals: 'type T = `prefix${string}`',
  
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
   if (result.parseMethod === 'pattern-fallback') {
     console.warn('⚠️ Tree-sitter parsing failed, using regex fallback');
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
import { ParserValidator } from './parsers/utils/parser-validator.js';

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
