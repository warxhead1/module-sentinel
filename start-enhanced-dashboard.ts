#!/usr/bin/env node

/**
 * Enhanced Dashboard Launcher
 * Starts the visualization API server with comprehensive dashboard support
 */

import { VisualizationAPI } from './src/api/visualization-api.js';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PORT = 8081;
const API_PORT = 8081;

// Use database paths from .env with relative fallbacks for Docker
// Check if we're in development mode (via NODE_ENV or script name)
const isDev = process.env.NODE_ENV === 'development' || 
              process.env.NODE_ENV === 'dev' ||
              process.argv.includes('dev:dashboard') ||
              process.argv.includes('dashboard:watch');

// Ensure project path is available for services
const PROJECT_PATH = process.env.PROJECT_PATH || '/home/warxh/planet_procgen';

const DB_PATH = isDev 
  ? process.env.TEST_DATABASE_PATH || '/home/devuser/.module-sentinel/test-module-sentinel.db'
  : process.env.DATABASE_PATH || '/home/devuser/.module-sentinel/module-sentinel.db';

// Set environment variables that services expect
process.env.MODULE_SENTINEL_PROJECT_PATH = PROJECT_PATH;
process.env.CPP_PROJECT_PATH = PROJECT_PATH;

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const success = await new Promise<boolean>((resolve) => {
      http.get(url, (res) => {
        resolve(res.statusCode !== undefined);
      }).on('error', () => {
        resolve(false);
      });
    });
    
    if (success) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found at:', DB_PATH);
    console.log(isDev 
      ? 'Please run: npm run test:rebuild' 
      : 'Please ensure the production database exists');
    process.exit(1);
  }

  // Start the visualization API server
  const visualizationServer = new VisualizationAPI(DB_PATH, PORT);

  // Wait for server to start
  const serverReady = await waitForServer(`http://localhost:${PORT}`, 10);
  if (!serverReady) {
    console.error('❌ Failed to start dashboard server');
    process.exit(1);
  }

  // Build dashboards quietly
  await new Promise<void>((resolve) => {
    http.get(`http://localhost:${PORT}/build-dashboards`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve();
      });
    }).on('error', () => {
      resolve();
    });
  });

  console.log(`🚀 Dashboard ready at http://localhost:${PORT}`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    try {
      await visualizationServer.shutdown();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0);
  });
}

// Run the main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});