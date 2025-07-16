#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (gracefully handle missing .env in CI)
const result = dotenv.config();
if (result.error && !process.env.CI) {
  console.error('Error loading .env file:', result.error);
} else if (!result.error) {
  console.log('✅ Environment variables loaded from .env');
}

// Set up default environment variables for testing
if (!process.env.PROJECT_PATH) {
  // In CI or when .env is missing, use the test complex-files directory
  process.env.PROJECT_PATH = path.join(process.cwd(), 'test', 'complex-files');
}

if (!process.env.TEST_COMPLEX_FILES_SOURCE) {
  process.env.TEST_COMPLEX_FILES_SOURCE = path.join(process.cwd(), 'test', 'complex-files');
}

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(process.cwd(), '.test-db', 'module-sentinel.db');
}

if (!process.env.TEST_DATABASE_PATH) {
  process.env.TEST_DATABASE_PATH = path.join(process.cwd(), '.test-db', 'test-module-sentinel.db');
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// Debug: check if API key is loaded (don't log the actual key)
if (process.env.GEMINI_API_KEY) {
  console.log('✅ GEMINI_API_KEY is set');
} else {
  console.log('⚠️ GEMINI_API_KEY is not set (some features may be limited)');
}

import { TestRunner } from './test/TestRunner';

async function main() {
  const args = process.argv.slice(2);
  const forceRebuild = args.includes('--rebuild') || args.includes('-r');
  
  // Extract filter parameter
  const filterIndex = args.findIndex(arg => arg === '--filter' || arg === '-f');
  const testFilter = filterIndex !== -1 && args[filterIndex + 1] ? args[filterIndex + 1] : undefined;
  
  if (forceRebuild) {
    console.log('🔄 Force rebuild mode enabled\n');
  }
  
  if (testFilter) {
    console.log(`🔍 Running only tests matching: "${testFilter}"\n`);
  }
  
  const runner = new TestRunner({ forceRebuild, testFilter });
  await runner.run();
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});