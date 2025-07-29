#!/usr/bin/env python3
"""
Safe script to convert snake_case property access to camelCase in TypeScript files.
This script will show you what changes it will make before applying them.
"""

import os
import re
from pathlib import Path
from typing import List, Tuple, Dict

# Mapping of snake_case to camelCase
CONVERSIONS = {
    # Symbol fields
    'file_path': 'filePath',
    'start_line': 'startLine', 
    'end_line': 'endLine',
    'normalized_name': 'normalizedName',
    'confidence_score': 'confidenceScore',
    'similar_symbols': 'similarSymbols',
    
    # Analysis fields
    'symbol_count': 'symbolCount',
    'duplicate_count': 'duplicateCount',
    'patterns_detected': 'patternsDetected',
    'code_reuse_percentage': 'codeReusePercentage',
    'average_similarity': 'averageSimilarity',
    'total_symbols_analyzed': 'totalSymbolsAnalyzed',
    
    # Result fields
    'overall_score': 'overallScore',
    'parse_method': 'parseMethod',
    'name_similarity': 'nameSimilarity',
    'signature_similarity': 'signatureSimilarity',
    'structural_similarity': 'structuralSimilarity',
    'context_similarity': 'contextSimilarity',
    
    # Relationship fields
    'relationship_type': 'relationshipType',
    'from_symbol_id': 'fromSymbolId',
    'to_symbol_id': 'toSymbolId',
    'project_id': 'projectId',
    'context_line': 'contextLine',
    'context_column': 'contextColumn',
    'context_snippet': 'contextSnippet',
    'created_at': 'createdAt',
    
    # Quality metrics
    'cyclomatic_complexity': 'cyclomaticComplexity',
    'max_nesting_depth': 'maxNestingDepth',
    'function_count': 'functionCount',
    'large_function_count': 'largeFunctionCount',
    'lines_of_code': 'linesOfCode',
    'comment_ratio': 'commentRatio',
    'decision_points': 'decisionPoints',
    'error_handling_complexity': 'errorHandlingComplexity',
    
    # ML fields
    'existing_component_id': 'existingComponentId',
    'relevance_score': 'relevanceScore',
    'suggested_usage': 'suggestedUsage',
    'extension_needed': 'extensionNeeded',
    'component_path': 'componentPath',
    'learned_from': 'learnedFrom',
    'error_type': 'errorType',
    'ml_suggestions': 'mlSuggestions',
    'suggested_refactoring': 'suggestedRefactoring',
    
    # Options fields
    'include_tests': 'includeTests',
    'max_file_size': 'maxFileSize',
    'exclude_patterns': 'excludePatterns',
    'include_private': 'includePrivate',
    'fuzzy_match': 'fuzzyMatch',
    'language_distribution': 'languageDistribution',
}

def find_typescript_files(directory: str) -> List[Path]:
    """Find all TypeScript files in the given directory."""
    ts_files = []
    for root, _, files in os.walk(directory):
        # Skip node_modules and dist directories
        if 'node_modules' in root or 'dist' in root:
            continue
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                ts_files.append(Path(root) / file)
    return ts_files

def find_replacements(content: str) -> List[Tuple[str, str, int]]:
    """Find all property accesses that need to be replaced."""
    replacements = []
    
    for snake_case, camel_case in CONVERSIONS.items():
        # Match property access patterns like .property_name or ['property_name']
        patterns = [
            (f'\\.{snake_case}', f'.{camel_case}'),  # .property_name
            (f"\\['{snake_case}'\\]", f'.{camel_case}'),  # ['property_name']
            (f'\\["{snake_case}"\\]', f'.{camel_case}'),  # ["property_name"]
        ]
        
        for pattern, replacement in patterns:
            for match in re.finditer(pattern, content):
                replacements.append((match.group(), replacement, match.start()))
    
    # Sort by position (reverse order for safe replacement)
    replacements.sort(key=lambda x: x[2], reverse=True)
    return replacements

def show_changes(file_path: Path, replacements: List[Tuple[str, str, int]], content: str):
    """Display the changes that will be made to a file."""
    if not replacements:
        return
    
    print(f"\n📄 {file_path}")
    lines = content.split('\n')
    
    # Group replacements by line
    line_changes: Dict[int, List[Tuple[str, str]]] = {}
    for old, new, pos in replacements:
        line_num = content[:pos].count('\n')
        if line_num not in line_changes:
            line_changes[line_num] = []
        line_changes[line_num].append((old, new))
    
    # Show changes with context
    for line_num in sorted(line_changes.keys()):
        if 0 <= line_num < len(lines):
            line = lines[line_num]
            print(f"  Line {line_num + 1}: {line.strip()}")
            for old, new in line_changes[line_num]:
                print(f"    ❌ {old} → ✅ {new}")

def apply_replacements(content: str, replacements: List[Tuple[str, str, int]]) -> str:
    """Apply all replacements to the content."""
    result = content
    for old, new, pos in replacements:
        # Calculate the actual position in the current result string
        result = result[:pos] + new + result[pos + len(old):]
    return result

def main():
    print("🔍 Finding TypeScript files...")
    ts_files = find_typescript_files('src')
    
    print(f"📊 Found {len(ts_files)} TypeScript files")
    
    all_changes = []
    for file_path in ts_files:
        content = file_path.read_text()
        replacements = find_replacements(content)
        if replacements:
            all_changes.append((file_path, replacements, content))
    
    if not all_changes:
        print("✨ No changes needed!")
        return
    
    print(f"\n🔄 Found {sum(len(r) for _, r, _ in all_changes)} total replacements in {len(all_changes)} files")
    
    # Show all changes
    for file_path, replacements, content in all_changes:
        show_changes(file_path, replacements, content)
    
    # Auto-apply changes
    print("\n" + "="*60)
    response = 'y'  # Auto-apply
    
    if response == 'y':
        print("\n✏️  Applying changes...")
        for file_path, replacements, content in all_changes:
            new_content = apply_replacements(content, replacements)
            file_path.write_text(new_content)
            print(f"  ✅ Updated {file_path}")
        print("\n🎉 All changes applied successfully!")
    else:
        print("\n❌ Changes cancelled")

if __name__ == "__main__":
    main()