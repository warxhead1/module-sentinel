#!/bin/bash
# CI/CD test script for GitLab
# This ensures tests run correctly against complex-files

set -e  # Exit on error

echo "🚀 Starting CI/CD Test Suite"
echo "================================"

# Set environment variables for CI
export MODULE_SENTINEL_DEBUG="false"
export NODE_ENV="test"
export MODULE_SENTINEL_PROJECT_PATH="/workspace/test/complex-files"

# Ensure database directory exists
mkdir -p .test-db

# Build the project
echo "🔨 Building project..."
npm run build

# Run all tests
echo "🧪 Running all tests..."
npm run test

# Check if test results exist
if [ -f "test-results.xml" ]; then
    echo "✅ Test results generated successfully"
    # Parse test results for summary
    grep -o 'tests="[0-9]*"' test-results.xml | head -1
    grep -o 'failures="[0-9]*"' test-results.xml | head -1
else
    echo "⚠️  No test results file found"
fi

echo "================================"
echo "✅ CI/CD Test Suite Complete"