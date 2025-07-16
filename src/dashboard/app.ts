/**
 * Main application entry point
 * This file will be compiled to app.js and served to the browser
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

// Initialize app-wide features
function initializeApp() {
  console.log('Module Sentinel Dashboard initialized');
  
  // Add global error handling
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
  });

  // Handle navigation events
  window.addEventListener('navigation', (event: any) => {
    console.log('Navigation:', event.detail);
  });

  // Initialize tooltips, modals, etc.
  initializeUIHelpers();
}

function initializeUIHelpers() {
  // Global click handler for modal triggers
  document.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest('[data-modal]') as HTMLElement;
    if (trigger) {
      const modalType = trigger.getAttribute('data-modal');
      openModal(modalType, trigger);
    }
  });
}

function openModal(type: string | null, trigger: HTMLElement) {
  // This would open various modals
  console.log('Open modal:', type);
}

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}