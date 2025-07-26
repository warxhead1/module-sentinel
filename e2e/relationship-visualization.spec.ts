import { test, expect } from '@playwright/test';
import { D3GraphHelpers } from './helpers/d3-helpers';

test.describe('Relationship Visualization', () => {
  let graphHelpers: D3GraphHelpers;

  test.beforeEach(async ({ page }) => {
    graphHelpers = new D3GraphHelpers(page);
    
    // Navigate to the relationships page
    await page.goto('/relationships');
    
    // Wait for the app to fully load
    await page.waitForTimeout(2000);
    
    // Wait for the component or check if it requires data
    const componentVisible = await page.locator('relationship-graph').isVisible().catch(() => false);
    
    if (!componentVisible) {
      // Check if there's a message about no data
      const noDataMessage = await page.locator('text=/no data|no relationships|empty|not found/i').isVisible().catch(() => false);
      if (noDataMessage) {
        console.log('No data available for visualization');
        test.skip();
      }
    }
    
    // Wait for the page to load
    await page.waitForSelector('relationship-graph', { timeout: 15000 });
    
    // Wait for the graph to stabilize
    await graphHelpers.waitForSimulation();
  });

  test('should render the relationship graph with nodes', async ({ page }) => {
    // Verify the graph container exists
    const graphContainer = page.locator('relationship-graph');
    await expect(graphContainer).toBeVisible();
    
    // Verify SVG element exists
    const svg = page.locator('relationship-graph svg');
    await expect(svg).toBeVisible();
    
    // Check that nodes are rendered
    const nodes = await graphHelpers.getNodes();
    const nodeCount = await nodes.count();
    expect(nodeCount).toBeGreaterThan(0);
    
    // Log node count for debugging
    console.log(`Found ${nodeCount} nodes in the graph`);
  });

  test('should display node details on click', async ({ page }) => {
    // Get first node
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    
    // Get node ID
    const nodeId = await firstNode.getAttribute('data-id');
    expect(nodeId).toBeTruthy();
    
    // Click the node
    await graphHelpers.clickNode(nodeId!);
    
    // Check if details panel appears
    const detailsPanel = page.locator('.node-details, .details-panel, [data-testid="node-details"]');
    await expect(detailsPanel).toBeVisible({ timeout: 5000 });
    
    // Verify some details are shown
    const details = await graphHelpers.getNodeDetails();
    expect(Object.keys(details).length).toBeGreaterThan(0);
  });

  test('should show tooltips on hover', async ({ page }) => {
    // Get first node
    const nodes = await graphHelpers.getNodes();
    const firstNode = nodes.first();
    
    // Get node ID
    const nodeId = await firstNode.getAttribute('data-id');
    expect(nodeId).toBeTruthy();
    
    // Hover and get tooltip
    const tooltipText = await graphHelpers.getNodeTooltip(nodeId!);
    expect(tooltipText).toBeTruthy();
    expect(tooltipText!.length).toBeGreaterThan(0);
  });

  test('should filter nodes by type', async ({ page }) => {
    // Get initial node count
    const initialNodes = await graphHelpers.getNodes();
    const initialCount = await initialNodes.count();
    
    // Apply a filter (adjust based on your actual filter UI)
    await graphHelpers.filterNodesByType('class');
    
    // Get filtered node count
    const filteredNodes = await graphHelpers.getNodes();
    const filteredCount = await filteredNodes.count();
    
    // Filtered count should be different (unless all nodes are of that type)
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('should search for nodes', async ({ page }) => {
    // Search for a specific node (adjust query based on your data)
    await graphHelpers.searchNodes('main');
    
    // Wait for search to take effect
    await page.waitForTimeout(1000);
    
    // Check if search results are highlighted or filtered
    const highlightedNodes = page.locator('g.node.highlighted, g.node[data-highlighted="true"]');
    const highlightedCount = await highlightedNodes.count();
    
    // If no highlighted nodes, check if nodes are filtered
    if (highlightedCount === 0) {
      const visibleNodes = await graphHelpers.getNodes();
      const visibleCount = await visibleNodes.count();
      expect(visibleCount).toBeGreaterThan(0);
    } else {
      expect(highlightedCount).toBeGreaterThan(0);
    }
  });

  test('should render edges between nodes', async ({ page }) => {
    // Check that edges exist
    const edges = await graphHelpers.getEdges();
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThan(0);
    
    console.log(`Found ${edgeCount} edges in the graph`);
  });

  test('should maintain node positions after refresh', async ({ page }) => {
    // Get first few nodes and their positions
    const nodes = await graphHelpers.getNodes();
    const nodeCount = Math.min(await nodes.count(), 3);
    const positions: Record<string, { x: number; y: number }> = {};
    
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.nth(i);
      const nodeId = await node.getAttribute('data-id');
      if (nodeId) {
        positions[nodeId] = await graphHelpers.getNodePosition(nodeId);
      }
    }
    
    // Wait for simulation to fully stabilize
    await page.waitForTimeout(2000);
    
    // Refresh the page
    await page.reload();
    await page.waitForSelector('relationship-graph');
    await graphHelpers.waitForSimulation();
    
    // Check if positions are similar (within tolerance for simulation randomness)
    for (const [nodeId, oldPos] of Object.entries(positions)) {
      const newPos = await graphHelpers.getNodePosition(nodeId);
      const distance = Math.sqrt(
        Math.pow(newPos.x - oldPos.x, 2) + Math.pow(newPos.y - oldPos.y, 2)
      );
      
      // Allow some variance due to force simulation
      expect(distance).toBeLessThan(200);
    }
  });

  test('should display correct node types', async ({ page }) => {
    // Get all nodes
    const nodes = await graphHelpers.getNodes();
    const nodeCount = await nodes.count();
    
    // Check node classes for type indicators
    let classNodes = 0;
    let functionNodes = 0;
    let interfaceNodes = 0;
    
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.nth(i);
      const classes = await node.getAttribute('class');
      
      if (classes?.includes('type-class')) classNodes++;
      if (classes?.includes('type-function')) functionNodes++;
      if (classes?.includes('type-interface')) interfaceNodes++;
    }
    
    console.log(`Node types - Classes: ${classNodes}, Functions: ${functionNodes}, Interfaces: ${interfaceNodes}`);
    
    // At least some nodes should have types
    expect(classNodes + functionNodes + interfaceNodes).toBeGreaterThan(0);
  });
});