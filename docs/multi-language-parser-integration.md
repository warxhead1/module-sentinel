
# Multi-Language Parser Integration Plan

## 1. Introduction

This document outlines the plan to extend Module Sentinel's parsing capabilities to include JavaScript, TypeScript, and Python, in addition to the existing C++ support. The goal is to create a unified system where all languages are parsed into a common `UniversalSymbol` and `UniversalRelationship` format, feeding into the existing analysis pipeline.

This integration will leverage the existing `tree-sitter` infrastructure and the flexible `ParserRegistry` plugin system.

## 2. Core Architecture

The integration will be built upon two key components:

*   **`ILanguageParser` Interface (`src/parsers/language-parser-interface.ts`)**: This interface defines the contract for all language-specific parsers. Each new parser will be a class that implements this interface.
*   **`ParserRegistry` (`src/parsers/parser-registry.ts`)**: This class acts as a plugin manager for the various language parsers. We will register our new JS/TS and Python parsers with this registry, allowing the system to select the appropriate parser for a given file type.

## 3. New Dependencies

To support the new languages, the following `tree-sitter` grammar packages must be added to the `devDependencies` in `package.json`:

```json
"dependencies": {
    ...
    "tree-sitter-javascript": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0",
    "tree-sitter-python": "^0.21.0",
    ...
},
```

These will be installed via `npm install`.

## 4. New File Creation Plan

The following new files will be created to implement the parsers.

### 4.1. TypeScript/JavaScript Parser

Given the similarity between TypeScript and JavaScript, a single parser can handle both.

*   **`src/parsers/adapters/typescript-language-parser.ts`**: This will be the main parser class for TypeScript and JavaScript. It will extend `BaseLanguageParser` and use the `tree-sitter-typescript` and `tree-sitter-javascript` grammars. It will handle both `.ts`, `.tsx`, `.js`, and `.jsx` files.

*   **`src/parsers/queries/typescript-queries.ts`**: This file will contain `tree-sitter` queries for extracting symbols (classes, functions, interfaces, etc.) and relationships (imports, exports, inheritance) from TypeScript and JavaScript source code.

### 4.2. Python Parser

*   **`src/parsers/adapters/python-language-parser.ts`**: The main parser class for Python. It will extend `BaseLanguageParser` and use the `tree-sitter-python` grammar. It will handle `.py` files.

*   **`src/parsers/queries/python-queries.ts`**: This file will contain `tree-sitter` queries for extracting symbols (classes, functions, decorators, etc.) and relationships (imports, inheritance) from Python source code.

## 5. Existing File Modification Plan

### 5.1. Register New Parsers

The primary modification will be in `src/parsers/parser-registry.ts` to register the newly created parsers. The `initializeBuiltinParsers` method will be updated as follows:

```typescript
// src/parsers/parser-registry.ts

// ... imports

  private initializeBuiltinParsers(): void {
    // Register C++ parser (existing functionality)
    this.registerParser({
      name: 'unified-cpp-parser',
      language: 'cpp',
      version: '3.0.0',
      createParser: (config) => {
        const { CppLanguageParser } = require('./adapters/cpp-language-parser.js');
        return new CppLanguageParser(config);
      },
      description: 'Unified C++ parser with C++23 module support',
      supportedExtensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.hxx', '.ixx'],
      features: ['modules', 'templates', 'classes', 'functions', 'relationships', 'patterns'],
      isEnabled: true,
      priority: 10
    });

    // Register TypeScript/JavaScript parser
    this.registerParser({
      name: 'tree-sitter-typescript-parser',
      language: 'typescript',
      version: '1.0.0',
      createParser: (config) => {
        const { TypeScriptLanguageParser } = require('./adapters/typescript-language-parser.js');
        return new TypeScriptLanguageParser(config);
      },
      description: 'Tree-sitter based TypeScript and JavaScript parser',
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx'],
      features: ['classes', 'functions', 'interfaces', 'imports', 'exports', 'decorators'],
      isEnabled: true,
      priority: 20
    });

    // Register Python parser
    this.registerParser({
      name: 'tree-sitter-python-parser',
      language: 'python',
      version: '1.0.0',
      createParser: (config) => {
        const { PythonLanguageParser } = require('./adapters/python-language-parser.js');
        return new PythonLanguageParser(config);
      },
      description: 'Tree-sitter based Python parser',
      supportedExtensions: ['.py', '.pyw'],
      features: ['classes', 'functions', 'decorators', 'type-hints'],
      isEnabled: true,
      priority: 20
    });
  }

// ... rest of the file
```

## 6. Implementation Steps

1.  **Add Dependencies**: Update `package.json` with the new `tree-sitter` grammars and run `npm install`.
2.  **Create Query Files**: Create `src/parsers/queries/typescript-queries.ts` and `src/parsers/queries/python-queries.ts` with the respective `tree-sitter` queries.
3.  **Implement Parser Adapters**: Create the `src/parsers/adapters/typescript-language-parser.ts` and `src/parsers/adapters/python-language-parser.ts` files, implementing the `ILanguageParser` interface.
4.  **Register Parsers**: Modify `src/parsers/parser-registry.ts` to register the new parsers as detailed above.
5.  **Testing**: Add new test cases to the `test/` directory to verify that the new parsers correctly identify symbols and relationships in sample JS/TS and Python files.

## 7. Conclusion

By following this plan, we can systematically extend Module Sentinel to support JavaScript, TypeScript, and Python. This will significantly enhance the tool's utility for multi-language projects, providing a unified view of the entire codebase.
