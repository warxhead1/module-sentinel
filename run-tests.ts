#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
// Load environment variables before anything else
const result = dotenv.config();
if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.log('✅ Environment variables loaded from .env');
  // Debug: check if API key is loaded (don't log the actual key)
  if (process.env.GEMINI_API_KEY) {
    console.log('✅ GEMINI_API_KEY is set');
  } else {
    console.log('❌ GEMINI_API_KEY is not set');
  }
}

import { TestRunner } from './test/TestRunner';

async function main() {
  const args = process.argv.slice(2);
  const forceRebuild = args.includes('--rebuild') || args.includes('-r');
  
  if (forceRebuild) {
    console.log('🔄 Force rebuild mode enabled\n');
  }
  
  const runner = new TestRunner({ forceRebuild });
  await runner.run();
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});