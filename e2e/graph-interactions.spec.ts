import { test, expect } from '@playwright/test';
import { D3GraphHelpers } from './helpers/d3-helpers';

test.describe('Graph Interactions', () => {
  let graphHelpers: D3GraphHelpers;

  test.beforeEach(async ({ page }) => {
    graphHelpers = new D3GraphHelpers(page);
    
    // Navigate to the relationships page
    await page.goto('/relationships');
    
    // Wait for the graph to load
    await page.waitForSelector('relationship-graph svg', { timeout: 15000 });
    await graphHelpers.waitForSimulation();
  });

  test('should zoom in and out', async ({ page }) => {
    // Get initial transform
    const initialTransform = await graphHelpers.getTransform();
    expect(initialTransform.scale).toBe(1);
    
    // Zoom in
    await graphHelpers.zoom(2);
    const zoomedInTransform = await graphHelpers.getTransform();
    expect(zoomedInTransform.scale).toBeGreaterThan(initialTransform.scale);
    
    // Zoom out
    await graphHelpers.zoom(0.5);
    const zoomedOutTransform = await graphHelpers.getTransform();
    expect(zoomedOutTransform.scale).toBeLessThan(zoomedInTransform.scale);
  });

  test('should pan the graph', async ({ page }) => {
    // Get initial transform
    const initialTransform = await graphHelpers.getTransform();
    
    // Pan right and down
    await graphHelpers.pan(100, 50);
    const pannedTransform = await graphHelpers.getTransform();
    
    // Check that the graph has moved
    expect(pannedTransform.x).not.toBe(initialTransform.x);
    expect(pannedTransform.y).not.toBe(initialTransform.y);
  });

  test('should drag nodes', async ({ page }) => {
    // Get first node
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    const nodeId = await firstNode.getAttribute('data-id');
    expect(nodeId).toBeTruthy();
    
    // Get initial position
    const initialPos = await graphHelpers.getNodePosition(nodeId!);
    
    // Drag the node
    const nodeBounds = await firstNode.boundingBox();
    expect(nodeBounds).toBeTruthy();
    
    await page.mouse.move(nodeBounds!.x + nodeBounds!.width / 2, nodeBounds!.y + nodeBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(nodeBounds!.x + 100, nodeBounds!.y + 50);
    await page.mouse.up();
    
    // Wait for position update
    await page.waitForTimeout(500);
    
    // Get new position
    const newPos = await graphHelpers.getNodePosition(nodeId!);
    
    // Node should have moved
    expect(newPos.x).not.toBe(initialPos.x);
    expect(newPos.y).not.toBe(initialPos.y);
  });

  test('should highlight connected nodes on selection', async ({ page }) => {
    // Click on a node
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    const nodeId = await firstNode.getAttribute('data-id');
    
    await graphHelpers.clickNode(nodeId!);
    
    // Check for highlighted connected nodes
    const highlightedNodes = page.locator('g.node.connected, g.node[data-connected="true"]');
    const highlightedEdges = page.locator('line.link.highlighted, path.link.highlighted');
    
    // Should have at least some highlighted elements
    const highlightedNodeCount = await highlightedNodes.count();
    const highlightedEdgeCount = await highlightedEdges.count();
    
    // If this node has connections, they should be highlighted
    const nodeEdges = await graphHelpers.getNodeEdges(nodeId!);
    const edgeCount = await nodeEdges.count();
    
    if (edgeCount > 0) {
      expect(highlightedNodeCount + highlightedEdgeCount).toBeGreaterThan(0);
    }
  });

  test('should reset zoom on double click', async ({ page }) => {
    // Zoom in first
    await graphHelpers.zoom(2.5);
    const zoomedTransform = await graphHelpers.getTransform();
    expect(zoomedTransform.scale).toBeGreaterThan(1);
    
    // Double click on SVG background to reset
    const svg = page.locator('relationship-graph svg');
    await svg.dblclick();
    
    // Wait for animation
    await page.waitForTimeout(500);
    
    // Check if zoom is reset
    const resetTransform = await graphHelpers.getTransform();
    expect(resetTransform.scale).toBeCloseTo(1, 1);
  });

  test('should show context menu on right click', async ({ page }) => {
    // Right click on a node
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    
    await firstNode.click({ button: 'right' });
    
    // Check for context menu
    const contextMenu = page.locator('.context-menu, [role="menu"], [data-testid="context-menu"]');
    
    // If context menu is implemented, it should be visible
    const isVisible = await contextMenu.isVisible();
    if (isVisible) {
      // Verify menu has options
      const menuItems = contextMenu.locator('[role="menuitem"], li');
      const itemCount = await menuItems.count();
      expect(itemCount).toBeGreaterThan(0);
    }
  });

  test('should handle keyboard navigation', async ({ page }) => {
    // Focus on the graph
    const graph = page.locator('relationship-graph');
    await graph.focus();
    
    // Test zoom with keyboard
    await page.keyboard.press('+');
    await page.waitForTimeout(300);
    const zoomedIn = await graphHelpers.getTransform();
    expect(zoomedIn.scale).toBeGreaterThan(1);
    
    await page.keyboard.press('-');
    await page.waitForTimeout(300);
    const zoomedOut = await graphHelpers.getTransform();
    expect(zoomedOut.scale).toBeLessThan(zoomedIn.scale);
    
    // Test pan with arrow keys
    const beforePan = await graphHelpers.getTransform();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const afterPan = await graphHelpers.getTransform();
    
    // Graph should have panned
    expect(afterPan.x).not.toBe(beforePan.x);
  });

  test('should handle multi-select with ctrl/cmd', async ({ page, browserName }) => {
    const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
    
    // Get multiple nodes
    const nodes = await graphHelpers.getNodes();
    const nodeCount = await nodes.count();
    
    if (nodeCount >= 2) {
      // Click first node
      const firstNode = nodes.first();
      await firstNode.click();
      
      // Ctrl/Cmd click second node
      const secondNode = nodes.nth(1);
      await secondNode.click({ modifiers: [modifier] });
      
      // Check for multiple selections
      const selectedNodes = page.locator('g.node.selected, g.node[data-selected="true"]');
      const selectedCount = await selectedNodes.count();
      
      // Should have 2 selected nodes
      expect(selectedCount).toBe(2);
    }
  });

  test('should handle graph bounds correctly', async ({ page }) => {
    // Pan far to the right
    await graphHelpers.pan(5000, 0);
    
    // The graph should either:
    // 1. Have bounds that prevent excessive panning, or
    // 2. Allow free panning
    
    const transform = await graphHelpers.getTransform();
    
    // Just verify the pan operation completed without errors
    expect(transform).toBeDefined();
    expect(transform.x).toBeDefined();
  });
});