#\!/bin/bash

# Get list of staged TypeScript files
staged_files=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$')

if [ -z "$staged_files" ]; then
  echo "No staged TypeScript files to fix"
  exit 0
fi

echo "Fixing lint issues in staged files..."

# Fix each file
for file in $staged_files; do
  if [ -f "$file" ]; then
    echo "Fixing: $file"
    npx eslint "$file" --fix
  fi
done

echo "Done fixing lint issues"
