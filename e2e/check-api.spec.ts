import { test, expect } from '@playwright/test';

test.describe('Check API and Routing', () => {
  test('verify API is accessible and routing works', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      console.log(`Console [${msg.type()}]:`, msg.text());
    });
    
    page.on('pageerror', err => {
      console.log('Page error:', err.message);
    });
    
    // First check if API is working
    const apiResponse = await page.request.get('/api/health');
    console.log('API Health status:', apiResponse.status());
    const apiData = await apiResponse.json();
    console.log('API Health data:', apiData);
    
    // Navigate to root
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Check if the app initialized
    const appInitialized = await page.evaluate(() => {
      return (window as any).dashboardServices !== undefined;
    });
    console.log('Dashboard services initialized:', appInitialized);
    
    // Check router state
    const routerState = await page.evaluate(() => {
      const services = (window as any).dashboardServices;
      if (services && services.router) {
        return {
          currentPath: window.location.pathname,
          hasRoutes: services.router.routes?.length > 0
        };
      }
      return null;
    });
    console.log('Router state:', routerState);
    
    // Try navigating programmatically
    await page.evaluate(() => {
      const services = (window as any).dashboardServices;
      if (services && services.router) {
        services.router.navigate('/relationships');
      }
    });
    
    await page.waitForTimeout(2000);
    
    // Check if navigation worked
    const afterNavigation = await page.evaluate(() => {
      return {
        pathname: window.location.pathname,
        componentCount: document.querySelectorAll('relationship-graph').length,
        routerOutletContent: document.querySelector('router-outlet')?.innerHTML?.substring(0, 100)
      };
    });
    console.log('After navigation:', afterNavigation);
    
    // Check for any data in state
    const stateData = await page.evaluate(() => {
      const services = (window as any).dashboardServices;
      if (services && services.state) {
        return {
          hasStats: services.state.getState('stats') !== undefined,
          hasNamespaces: services.state.getState('namespaces') !== undefined,
          lastError: services.state.getState('lastError')
        };
      }
      return null;
    });
    console.log('State data:', stateData);
    
    // Final check - screenshot
    await page.screenshot({ path: 'api-check.png', fullPage: true });
  });
});