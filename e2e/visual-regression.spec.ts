import { test, expect } from '@playwright/test';
import { D3GraphHelpers } from './helpers/d3-helpers';

test.describe('Visual Regression Tests', () => {
  let graphHelpers: D3GraphHelpers;

  test.beforeEach(async ({ page }) => {
    graphHelpers = new D3GraphHelpers(page);
    
    // Navigate to the relationships page
    await page.goto('/relationships');
    
    // Wait for the graph to load and stabilize
    await page.waitForSelector('relationship-graph svg', { timeout: 15000 });
    await graphHelpers.waitForSimulation();
    
    // Additional wait to ensure styles are applied
    await page.waitForTimeout(1000);
  });

  test('should render graph consistently', async ({ page }) => {
    // Take a screenshot of the entire graph
    const graph = page.locator('relationship-graph');
    await expect(graph).toHaveScreenshot('graph-default-view.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('should render node styles consistently', async ({ page }) => {
    // Focus on a specific area with nodes
    const nodes = await graphHelpers.getNodes();
    const nodeCount = await nodes.count();
    
    if (nodeCount > 0) {
      // Click on first node to see selection state
      const firstNode = nodes.first();
      const nodeId = await firstNode.getAttribute('data-id');
      await graphHelpers.clickNode(nodeId!);
      
      // Screenshot the selected node area
      await expect(firstNode).toHaveScreenshot('node-selected-state.png', {
        maxDiffPixels: 50,
        threshold: 0.2
      });
    }
  });

  test('should render tooltips consistently', async ({ page }) => {
    // Hover over a node to show tooltip
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    
    await firstNode.hover();
    await page.waitForTimeout(500); // Wait for tooltip animation
    
    // Screenshot the tooltip
    const tooltip = page.locator('.tooltip, [role="tooltip"]');
    if (await tooltip.isVisible()) {
      await expect(tooltip).toHaveScreenshot('node-tooltip.png', {
        maxDiffPixels: 50,
        threshold: 0.2
      });
    }
  });

  test('should render different node types with correct styles', async ({ page }) => {
    // Find nodes of different types and screenshot them
    const classNode = page.locator('g.node.type-class').first();
    const functionNode = page.locator('g.node.type-function').first();
    const interfaceNode = page.locator('g.node.type-interface').first();
    
    if (await classNode.count() > 0) {
      await expect(classNode).toHaveScreenshot('node-type-class.png', {
        maxDiffPixels: 30,
        threshold: 0.2
      });
    }
    
    if (await functionNode.count() > 0) {
      await expect(functionNode).toHaveScreenshot('node-type-function.png', {
        maxDiffPixels: 30,
        threshold: 0.2
      });
    }
    
    if (await interfaceNode.count() > 0) {
      await expect(interfaceNode).toHaveScreenshot('node-type-interface.png', {
        maxDiffPixels: 30,
        threshold: 0.2
      });
    }
  });

  test('should render edges consistently', async ({ page }) => {
    // Find an area with visible edges
    const edges = await graphHelpers.getEdges();
    
    if (await edges.count() > 0) {
      // Take a screenshot of the first edge
      const firstEdge = edges.first();
      await expect(firstEdge).toHaveScreenshot('edge-default.png', {
        maxDiffPixels: 30,
        threshold: 0.2
      });
    }
  });

  test('should render filtered view consistently', async ({ page }) => {
    // Apply a filter
    const filterButton = page.locator('button:has-text("Filter"), [aria-label*="filter"]').first();
    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(500);
      
      // Apply a specific filter (adjust selector based on your UI)
      const classFilter = page.locator('input[type="checkbox"][value="class"], label:has-text("Class")');
      if (await classFilter.isVisible()) {
        await classFilter.click();
        await graphHelpers.waitForSimulation();
        
        // Screenshot the filtered graph
        const graph = page.locator('relationship-graph');
        await expect(graph).toHaveScreenshot('graph-filtered-classes.png', {
          maxDiffPixels: 100,
          threshold: 0.2
        });
      }
    }
  });

  test('should render zoomed view consistently', async ({ page }) => {
    // Zoom in to a specific level
    await graphHelpers.zoom(2);
    await page.waitForTimeout(500);
    
    // Take screenshot of zoomed view
    const graph = page.locator('relationship-graph');
    await expect(graph).toHaveScreenshot('graph-zoomed-2x.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('should render details panel consistently', async ({ page }) => {
    // Click on a node to show details
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    const nodeId = await firstNode.getAttribute('data-id');
    
    await graphHelpers.clickNode(nodeId!);
    
    // Wait for details panel
    const detailsPanel = page.locator('.node-details, .details-panel');
    await expect(detailsPanel).toBeVisible();
    
    // Screenshot the details panel
    await expect(detailsPanel).toHaveScreenshot('node-details-panel.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('should handle theme changes consistently', async ({ page }) => {
    // Look for theme toggle
    const themeToggle = page.locator('button[aria-label*="theme"], button:has-text("Theme")');
    
    if (await themeToggle.isVisible()) {
      // Switch theme
      await themeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
      
      // Screenshot in alternate theme
      const graph = page.locator('relationship-graph');
      await expect(graph).toHaveScreenshot('graph-alternate-theme.png', {
        maxDiffPixels: 100,
        threshold: 0.2
      });
    }
  });

  test('should render empty state consistently', async ({ page }) => {
    // Search for something that returns no results
    await graphHelpers.searchNodes('xyznonexistentxyz');
    await page.waitForTimeout(1000);
    
    // Check if there's an empty state
    const emptyState = page.locator('.empty-state, [data-testid="empty-state"], text=/no.*found/i');
    
    if (await emptyState.isVisible()) {
      await expect(emptyState).toHaveScreenshot('graph-empty-state.png', {
        maxDiffPixels: 50,
        threshold: 0.2
      });
    }
  });
});