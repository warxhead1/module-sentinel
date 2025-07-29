# NAPI Case Conversion Guide

## The Problem
NAPI-RS automatically converts Rust snake_case to JavaScript camelCase, but our codebase has inconsistent naming conventions, causing mapping issues.

## Current State (BROKEN)
- TypeScript interfaces mix snake_case and camelCase
- Some NAPI structs have `#[napi(js_name = "...")]` to force snake_case
- This creates confusion and bugs (like undefined line numbers)

## Solution: Standardize on camelCase in TypeScript

### Rust Side (NAPI bindings)
- Remove ALL `#[napi(js_name = "...")]` annotations
- Let NAPI auto-convert snake_case → camelCase
- Keep Rust code in idiomatic snake_case

### TypeScript Side
- Use camelCase for all interface properties
- Match what NAPI automatically generates

## Conversion Rules
| Rust (snake_case) | TypeScript (camelCase) |
|-------------------|------------------------|
| file_path         | filePath               |
| start_line        | startLine              |
| end_line          | endLine                |
| normalized_name   | normalizedName         |
| confidence_score  | confidenceScore        |
| similar_symbols   | similarSymbols         |
| project_id        | projectId              |
| from_symbol_id    | fromSymbolId           |
| symbol_count      | symbolCount            |
| language_distribution | languageDistribution |
| include_tests     | includeTests           |
| max_file_size     | maxFileSize            |
| exclude_patterns  | excludePatterns        |
| include_private   | includePrivate         |
| fuzzy_match       | fuzzyMatch             |

## Implementation Steps
1. Remove all `#[napi(js_name)]` from Rust code
2. Update all TypeScript interfaces to use camelCase
3. Update all TypeScript code using these interfaces
4. Rebuild and test

## Benefits
- Consistent with JavaScript conventions
- Less manual mapping needed
- NAPI handles conversion automatically
- Cleaner code without annotations