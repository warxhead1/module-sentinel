/**
 * Module Sentinel - Code Intelligence Visualization
 * Main entry point with Enhanced Dashboard
 */

import { EnhancedDashboard } from './enhanced-dashboard.js';

// Initialize enhanced dashboard when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new EnhancedDashboard();
    (window as any).dashboard = dashboard; // Expose globally for debugging
    dashboard.init().catch(console.error);
  });
} else {
  const dashboard = new EnhancedDashboard();
  (window as any).dashboard = dashboard; // Expose globally for debugging
  dashboard.init().catch(console.error);
}