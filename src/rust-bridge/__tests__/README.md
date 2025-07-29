# Rust Bridge Test Suite

This directory contains comprehensive tests for the ModuleSentinelBridge Rust NAPI bindings.

## Test Structure

```
__tests__/
├── README.md                           # This file
├── module-sentinel-bridge.test.ts      # Main functionality tests
├── performance.test.ts                 # Performance and memory tests
├── integration.test.ts                 # End-to-end workflow tests
├── fixtures/
│   └── index.ts                        # Mock data and test fixtures
└── helpers/
    └── test-utils.ts                   # Test utilities and helpers
```

## Test Categories

### 1. Main Functionality Tests (`module-sentinel-bridge.test.ts`)
- **Bridge Initialization**: Tests for proper setup and error handling
- **Project Indexing**: Tests for project analysis and indexing options
- **Symbol Search**: Tests for symbol queries with various options
- **Pattern Analysis**: Tests for design pattern detection
- **Similarity Calculation**: Tests for symbol similarity algorithms
- **File Parsing**: Tests for individual file analysis
- **Code Quality Analysis**: Tests for code quality metrics
- **Relationship Management**: Tests for symbol relationships
- **Static Methods**: Tests for quick search and analysis functions
- **Error Handling**: Tests for graceful error recovery

### 2. Performance Tests (`performance.test.ts`)
- **Indexing Performance**: Timing and memory usage for project indexing
- **Search Performance**: Response times for symbol searches
- **Analysis Performance**: Performance of pattern and similarity analysis
- **File Parsing Performance**: Speed of individual file processing
- **Relationship Performance**: Efficiency of relationship queries
- **Concurrent Operations**: Performance under concurrent load
- **Memory Management**: Memory leak detection and usage monitoring
- **Error Handling Performance**: Speed of error handling and recovery

### 3. Integration Tests (`integration.test.ts`)
- **Complete Workflows**: End-to-end analysis pipelines
- **Cross-Language Analysis**: Multi-language project analysis
- **Symbol Lifecycle Management**: Symbol creation, updates, and relationships
- **File Processing Integration**: Consistency between file and project analysis
- **Error Recovery and Resilience**: System behavior under failure conditions
- **Data Consistency Validation**: Referential integrity and metric accuracy

## Test Fixtures and Helpers

### Fixtures (`fixtures/index.ts`)
- Mock data for all Rust binding types
- Sample TypeScript, JavaScript, and Rust code
- Error scenarios and edge cases
- Helper functions for creating test data

### Test Utilities (`helpers/test-utils.ts`)
- Temporary test project creation
- Performance measurement utilities
- Memory usage monitoring
- Structure validation functions
- Language detection helpers

## Running Tests

### All Rust Bridge Tests
```bash
npm run test:rust-bridge
```

### Watch Mode (for development)
```bash
npm run test:rust-bridge:watch
```

### Performance Tests Only
```bash
npm run test:rust-bridge:performance
```

### Integration Tests Only
```bash
npm run test:rust-bridge:integration
```

### Individual Test Files
```bash
# Main functionality
npx jest src/rust-bridge/__tests__/module-sentinel-bridge.test.ts

# Performance
npx jest src/rust-bridge/__tests__/performance.test.ts

# Integration
npx jest src/rust-bridge/__tests__/integration.test.ts
```

## Test Requirements

### Prerequisites
1. **Rust Bindings Built**: Run `npm run build:rust` before testing
2. **Test Project**: The tests create temporary test projects automatically
3. **Node.js Memory**: Some tests require sufficient memory (use `--max-old-space-size=4096` if needed)

### Environment Variables
- `NODE_ENV=test` (automatically set by Jest)
- No additional environment variables required

## Test Data

### Temporary Test Projects
Tests automatically create temporary projects with:
- TypeScript files with classes, interfaces, and functions
- JavaScript files with modules and functions
- Rust files with structs and implementations
- Proper project structure with package.json

### Cleanup
All temporary files and projects are automatically cleaned up after tests complete.

## Performance Benchmarks

### Expected Performance Thresholds
- **Project Indexing**: < 10 seconds for small projects
- **Symbol Search**: < 2 seconds for 100 results
- **Pattern Analysis**: < 15 seconds for small projects
- **File Parsing**: < 2 seconds per file
- **Similarity Calculation**: < 1 second per comparison
- **Memory Usage**: < 100MB increase during indexing

### Performance Test Guidelines
- Tests run against small, controlled test projects
- Thresholds are conservative to account for different environments
- Performance tests help detect regressions and bottlenecks
- Memory tests help identify potential memory leaks

## Error Handling

### Test Coverage
- Invalid file paths and project paths
- Malformed queries and parameters
- Non-existent symbols and relationships
- Network and I/O failures
- Concurrent operation conflicts
- Resource exhaustion scenarios

### Error Validation
- Proper error types and messages
- Graceful degradation
- System recovery after errors
- Consistent error behavior across methods

## Best Practices

### Writing New Tests
1. Use descriptive test names that explain what is being tested
2. Follow the AAA pattern (Arrange, Act, Assert)
3. Use the provided fixtures and helpers for consistency
4. Validate both success cases and error conditions
5. Include performance considerations for long-running operations
6. Clean up any resources created during testing

### Test Organization
1. Group related tests using `describe` blocks
2. Use `beforeEach`/`afterEach` for common setup/teardown
3. Keep tests independent and idempotent
4. Use meaningful assertions with clear error messages
5. Document complex test scenarios

### Performance Testing
1. Use the `measurePerformance` helper for timing operations
2. Set reasonable performance thresholds
3. Test both typical and edge case scenarios
4. Monitor memory usage for long-running operations
5. Test concurrent operations when applicable

## Troubleshooting

### Common Issues

1. **"Rust bindings not found"**
   - Run `npm run build:rust` before testing
   - Check that `module-sentinel-rust.node` exists in project root

2. **Test timeouts**
   - Increase Jest timeout for long-running operations
   - Check that test projects are being created properly
   - Verify system resources are available

3. **Memory issues**
   - Use `--max-old-space-size=4096` flag for Node.js
   - Check for memory leaks in test code
   - Ensure proper cleanup in test teardown

4. **File permission errors**
   - Check write permissions for temporary directories
   - Verify test project cleanup is working
   - Ensure no files are locked by other processes

### Debug Mode
Enable debug output by setting:
```bash
DEBUG=module-sentinel:* npm run test:rust-bridge
```

### Verbose Output
For detailed test output:
```bash
npm run test:rust-bridge -- --verbose
```

## Contributing

When adding new tests:
1. Follow the existing test structure and naming conventions
2. Add appropriate fixtures and mock data
3. Include both positive and negative test cases
4. Consider performance implications
5. Update this README if adding new test categories
6. Ensure tests are deterministic and repeatable