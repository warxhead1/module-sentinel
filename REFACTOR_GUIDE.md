# Universal Indexer Refactoring Guide

I've created 4 helper files to break down the massive universal-indexer.ts (2100+ lines) into logical components. Here are the files with placeholders that need the methods moved from the original file:

## Files Created:

### 1. `src/indexing/indexer-symbol-resolver.ts`
**Purpose**: Handle symbol resolution, mapping, and relationship processing

**Methods to move from universal-indexer.ts:**
- `createSymbolIdMapping` (lines 901-999)
- `resolveCallTarget` (lines 1897-2063) 
- `resolveCrossLanguageTarget` (lines 1798-1892)
- `createFileSymbols` (lines 1679-1733)
- `createModuleSymbols` (lines 1738-1793)
- `resolveAndStoreRelationships` (lines 1326-1651)
- `storeSymbols` (lines 1144-1321)

### 2. `src/indexing/indexer-file-discovery.ts`
**Purpose**: Handle file discovery, language detection, and file filtering

**Methods to move from universal-indexer.ts:**
- `discoverFiles` (lines 471-525)
- `filterChangedFiles` (lines 530-578)
- `getTargetExtensions` (lines 1042-1052)
- `getLanguageForExtension` (lines 1054-1061)
- `detectLanguage` (lines 1063-1066)
- `getLanguageDisplayName` (lines 1068-1077)
- `getParserClass` (lines 1079-1091)
- `getLanguageExtensions` (lines 1093-1105)

### 3. `src/indexing/indexer-semantic-processor.ts`
**Purpose**: Handle semantic analysis and intelligence processing

**Methods to move from universal-indexer.ts:**
- `performSemanticAnalysis` (lines 741-765)
- `processSemanticIntelligence` (lines 797-896)
- `resolveCrossFileReferences` (lines 770-774)
- `detectArchitecturalPatterns` (lines 779-783)
- `calculateComplexityMetrics` (lines 788-792)

### 4. `src/indexing/indexer-database-manager.ts`
**Purpose**: Handle database operations, project setup, and cleanup

**Methods to move from universal-indexer.ts:**
- `ensureProject` (lines 376-431)
- `ensureLanguages` (lines 436-466)
- `calculateIndexStats` (lines 1004-1036)
- `cleanProjectData` (lines 2073-2125)

## Instructions:

1. **For each method listed above:**
   - Copy the method from `universal-indexer.ts` (use the line numbers as reference)
   - Replace the placeholder in the corresponding helper file
   - Remove the "throw new Error" line
   - Make sure to preserve the method signature and logic

2. **After moving all methods:**
   - Replace the current `universal-indexer.ts` with `universal-indexer-refactored.ts`
   - Delete `universal-indexer-refactored.ts` 
   - Delete this guide file

3. **Important notes:**
   - The helper methods in the refactored indexer call these moved methods
   - Some methods may need slight parameter adjustments (I've tried to minimize this)
   - The imports at the top of each helper file should be sufficient
   - If you encounter any missing imports, add them as needed

## Benefits of this refactoring:
- Reduces main file from 2100+ lines to ~600 lines
- Creates logical separation of concerns
- Makes code more maintainable and testable
- Follows single responsibility principle

Would you like me to help move any specific methods, or would you prefer to do this systematically yourself?