#\!/bin/bash

echo "=== UNUSED VARIABLE ANALYSIS ==="
echo

# Group by file
echo "BY FILE:"
git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | while read file; do
  errors=$(npx eslint "$file" 2>&1 | grep -E "error.*unused" | wc -l)
  if [ $errors -gt 0 ]; then
    echo "$errors errors in $file"
  fi
done | sort -nr

echo
echo "=== CATEGORIES ==="

# Imports never used
echo
echo "UNUSED IMPORTS:"
git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | xargs npx eslint 2>&1 | grep -E "error.*is defined but never used.*import" | wc -l

# Function parameters never used
echo
echo "UNUSED FUNCTION PARAMETERS:"
git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | xargs npx eslint 2>&1 | grep -E "error.*is defined but never used.*args" | wc -l

# Variables assigned but never used
echo
echo "ASSIGNED BUT NEVER USED:"
git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | xargs npx eslint 2>&1 | grep -E "error.*is assigned a value but never used" | wc -l

# Type imports
echo
echo "UNUSED TYPE IMPORTS:"
git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | xargs npx eslint 2>&1 | grep -E "error.*is defined but never used.*type" | wc -l

