#!/usr/bin/env tsx

import { ModuleSentinelMCPServer } from '../src/index.js';
import * as dotenv from 'dotenv';

async function main() {
  // Load environment variables
  dotenv.config();
  
  // Set environment variable to prevent auto-start
  process.env.MODULE_SENTINEL_SCRIPT_MODE = 'true';
  
  const cleanRebuild = process.argv.includes('--clean');
  const projectPath = process.argv.find(arg => arg.startsWith('--project='))?.split('=')[1] || 
                     process.env.PROJECT_PATH || 
                     process.env.MODULE_SENTINEL_PROJECT_PATH || 
                     '/home/warxh/planet_procgen';
  
  const dbPath = process.env.DATABASE_PATH || 
                 process.env.MODULE_SENTINEL_DB_PATH || 
                 '/home/devuser/.module-sentinel/module-sentinel.db';
  
  console.log(`🚀 Starting database rebuild...`);
  console.log(`📁 Project path: ${projectPath}`);
  console.log(`💾 Database path: ${dbPath}`);
  console.log(`🔄 Clean rebuild: ${cleanRebuild ? 'YES' : 'NO'}`);
  console.log();
  
  const server = new ModuleSentinelMCPServer({ enableFileWatcher: false, skipAutoIndex: true });
  
  try {
    const result = await server.handleToolCall({
      params: {
        name: 'rebuild_index',
        arguments: {
          projectPath,
          cleanRebuild
        }
      }
    });
    
    console.log(result.content[0].text);
    
    console.log('\n✅ Database rebuild completed successfully!');
    
  } catch (error) {
    console.error('❌ Database rebuild failed:', error);
    process.exit(1);
  } finally {
    await server.shutdown();
  }
}

if (require.main === module) {
  main().catch(console.error);
}