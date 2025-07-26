import { test, expect } from '@playwright/test';
import { D3GraphHelpers } from './helpers/d3-helpers';
import { ScreenshotHelper } from './helpers/screenshot-helper';

test.describe('UX Documentation - Relationship Visualization', () => {
  test('document the complete user journey', async ({ page }) => {
    const screenshotHelper = new ScreenshotHelper('relationship-ux-journey');
    const graphHelpers = new D3GraphHelpers(page);
    
    // Document the loading experience
    await screenshotHelper.documentFlow(page, [
      {
        name: '01 - Homepage Load',
        action: async () => await page.goto('/'),
        waitFor: 'nav-sidebar'
      },
      {
        name: '02 - Navigation Menu',
        highlight: 'nav-sidebar',
        action: async () => {
          // Hover over menu items to show tooltips
          const navItems = await page.locator('nav-sidebar a').all();
          for (const item of navItems.slice(0, 3)) {
            await item.hover();
            await page.waitForTimeout(100);
          }
        }
      },
      {
        name: '03 - Navigate to Relationships',
        action: async () => {
          const relationshipsLink = page.locator('a[href="/relationships"]');
          await relationshipsLink.click();
        }
      }
    ]);

    // Wait for data to load (with timeout handling)
    const hasGraph = await page.waitForSelector('relationship-graph', { 
      timeout: 30000,
      state: 'visible' 
    }).then(() => true).catch(() => false);

    if (!hasGraph) {
      // Document empty state
      await screenshotHelper.capture(page, '04 - Empty State or Loading');
      
      // Check for error messages
      const errorMessages = await page.locator('text=/error|failed|no data|empty/i').all();
      if (errorMessages.length > 0) {
        await screenshotHelper.capture(page, '05 - Error State');
      }
      
      return; // Skip rest of test if no graph
    }

    // Document the loaded graph
    await screenshotHelper.documentFlow(page, [
      {
        name: '06 - Graph Loaded',
        waitFor: 'relationship-graph svg'
      },
      {
        name: '07 - Graph Controls',
        highlight: '.controls, .graph-controls, [data-testid="graph-controls"]'
      }
    ]);

    // Check if there are nodes
    const nodes = await graphHelpers.getNodes();
    const nodeCount = await nodes.count();
    
    if (nodeCount > 0) {
      // Document node interactions
      const firstNode = nodes.first();
      const nodeId = await firstNode.getAttribute('data-id');
      
      await screenshotHelper.captureComparison(
        page,
        'Node Default State',
        async () => {
          await graphHelpers.clickNode(nodeId!);
        },
        'Node Selected State'
      );

      // Document details panel
      const detailsPanel = page.locator('.node-details, .details-panel, [data-testid="node-details"]');
      if (await detailsPanel.isVisible()) {
        await screenshotHelper.captureElement(page, detailsPanel.first(), '08 - Node Details Panel');
      }

      // Document tooltips
      await screenshotHelper.capture(page, '09 - Tooltip Display', {
        action: async () => {
          const secondNode = nodes.nth(1);
          await secondNode.hover();
          await page.waitForTimeout(500);
        }
      });
    }

    // Document filtering UI
    const filterButton = page.locator('button:has-text("Filter"), [aria-label*="filter"]').first();
    if (await filterButton.isVisible()) {
      await screenshotHelper.captureComparison(
        page,
        'Filter Closed',
        async () => await filterButton.click(),
        'Filter Open'
      );
    }

    // Document search functionality
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await screenshotHelper.captureComparison(
        page,
        'Search Empty',
        async () => {
          await searchInput.fill('main');
          await page.waitForTimeout(500);
        },
        'Search Results'
      );
    }

    // Document responsive behavior
    const viewports = [
      { name: 'Desktop', width: 1920, height: 1080 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      await screenshotHelper.capture(page, `10 - ${viewport.name} View`);
    }
  });

  test('document all dashboard components', async ({ page }) => {
    const screenshotHelper = new ScreenshotHelper('dashboard-components');
    
    const routes = [
      { path: '/', name: 'Dashboard Overview' },
      { path: '/projects', name: 'Project Manager' },
      { path: '/modules', name: 'Modules Browser' },
      { path: '/namespaces', name: 'Namespace Explorer' },
      { path: '/analytics', name: 'Analytics Hub' },
      { path: '/insights', name: 'Insights Dashboard' },
      { path: '/patterns', name: 'Pattern Analyzer' },
      { path: '/performance', name: 'Performance Hotspots' },
      { path: '/search', name: 'Search Interface' },
      { path: '/code-flow', name: 'Code Flow Explorer' },
      { path: '/multi-language-flow', name: 'Multi-Language Flow' },
      { path: '/impact', name: 'Impact Visualization' }
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForTimeout(2000); // Allow components to load
      
      // Capture full page
      await screenshotHelper.capture(page, route.name);
      
      // Look for key UI elements
      const mainContent = page.locator('router-outlet > *').first();
      if (await mainContent.isVisible()) {
        const componentTag = await mainContent.evaluate(el => el.tagName.toLowerCase());
        console.log(`Route ${route.path} renders component: ${componentTag}`);
        
        // Capture any error states
        const errorElements = await page.locator('.error, [data-error], text=/error|failed/i').all();
        if (errorElements.length > 0) {
          await screenshotHelper.capture(page, `${route.name} - Error State`);
        }
        
        // Capture loading states
        const loadingElements = await page.locator('.loading, [data-loading], text=/loading/i').all();
        if (loadingElements.length > 0) {
          await screenshotHelper.capture(page, `${route.name} - Loading State`);
        }
      }
    }
  });

  test('document theme and styling', async ({ page }) => {
    const screenshotHelper = new ScreenshotHelper('theme-documentation');
    
    await page.goto('/relationships');
    await page.waitForTimeout(2000);
    
    // Check for theme toggle
    const themeToggle = page.locator('button[aria-label*="theme"], button:has-text("Theme"), [data-testid="theme-toggle"]');
    
    if (await themeToggle.isVisible()) {
      await screenshotHelper.captureComparison(
        page,
        'Default Theme',
        async () => {
          await themeToggle.click();
          await page.waitForTimeout(500);
        },
        'Alternate Theme'
      );
    }
    
    // Document color scheme
    const colorInfo = await page.evaluate(() => {
      const computedStyle = getComputedStyle(document.documentElement);
      return {
        primaryColor: computedStyle.getPropertyValue('--primary-color'),
        backgroundColor: computedStyle.getPropertyValue('--background-color'),
        textColor: computedStyle.getPropertyValue('--text-color'),
        accentColor: computedStyle.getPropertyValue('--accent-color')
      };
    });
    
    console.log('Color scheme:', colorInfo);
  });
});