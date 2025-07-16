#!/usr/bin/env node

/**
 * Dashboard build script
 * Compiles TypeScript components and creates the dashboard distribution
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const ROOT_DIR = join(__dirname, '..');
const SRC_DIR = join(ROOT_DIR, 'src', 'dashboard');
const DIST_DIR = join(ROOT_DIR, 'dashboard', 'dist');
const SPA_DIR = join(ROOT_DIR, 'dashboard', 'spa');

async function buildDashboard() {
  // Clean dist directory
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true });
  }
  mkdirSync(DIST_DIR, { recursive: true });

  try {
    // Compile TypeScript to JavaScript (quietly)
    execSync(`npx tsc --project ${join(SRC_DIR, 'tsconfig.json')} --outDir ${DIST_DIR}`, {
      cwd: ROOT_DIR,
      stdio: 'pipe'
    });

    // Copy the SPA shell
    copyFileSync(
      join(SPA_DIR, 'index.html'),
      join(DIST_DIR, 'index.html')
    );

    // Create a production-ready app.js entry point
    const appJs = `
/**
 * Module Sentinel Dashboard - Production Build
 * Generated at: ${new Date().toISOString()}
 */

// Import router
export { router } from './components/router.js';

// Import and register all components
import './components/nav-sidebar.js';
import './components/dashboard-overview.js';
import './components/namespace-explorer.js';
import './components/relationship-graph.js';
import './components/pattern-analyzer.js';
import './components/performance-hotspots.js';
import './components/search-interface.js';
import './components/code-flow-explorer.js';
import './components/not-found.js';

// Initialize app
function initializeApp() {
  console.log('Module Sentinel Dashboard v2.0 - Production Build');
  
  // Global error handling
  window.addEventListener('error', (event) => {
    console.error('Dashboard error:', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });
}

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
`;

    writeFileSync(join(DIST_DIR, 'app.js'), appJs);

    // Create package info
    const packageInfo = {
      name: 'module-sentinel-dashboard',
      version: '2.0.0',
      description: 'Interactive code intelligence dashboard',
      main: 'app.js',
      files: ['**/*'],
      dependencies: {
        'd3': '^7.0.0',
        'chart.js': '^4.4.0'
      }
    };

    writeFileSync(
      join(DIST_DIR, 'package.json'),
      JSON.stringify(packageInfo, null, 2)
    );

    // Build completed silently

  } catch (error) {
    console.error('Dashboard build failed:', error);
    process.exit(1);
  }
}

// Create TypeScript config for dashboard components
function createTsConfig() {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ES2020',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      moduleResolution: 'node',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: false,
      outDir: '../dashboard/dist',
      rootDir: '.',
      allowSyntheticDefaultImports: true
    },
    include: [
      'components/**/*',
      'app.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      '**/*.test.ts'
    ]
  };

  const configPath = join(SRC_DIR, 'tsconfig.json');
  writeFileSync(configPath, JSON.stringify(tsConfig, null, 2));
}

// Run the build
if (require.main === module) {
  createTsConfig();
  buildDashboard();
}

export { buildDashboard, createTsConfig };