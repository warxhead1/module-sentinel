import { Page, Locator } from '@playwright/test';

export class D3GraphHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for D3 force simulation to stabilize
   */
  async waitForSimulation(timeout = 10000) {
    await this.page.waitForFunction(
      () => {
        const svg = document.querySelector('svg');
        if (!svg) return false;
        
        // Check if simulation exists and has low alpha (stabilized)
        const simulation = (window as any).d3?.select('svg').datum()?.simulation;
        return !simulation || simulation.alpha() < 0.01;
      },
      { timeout }
    );
  }

  /**
   * Get all nodes in the graph
   */
  async getNodes(): Promise<Locator> {
    return this.page.locator('g.node');
  }

  /**
   * Get a specific node by its data-id
   */
  async getNode(nodeId: string): Promise<Locator> {
    return this.page.locator(`g.node[data-id="${nodeId}"]`);
  }

  /**
   * Get all edges/links in the graph
   */
  async getEdges(): Promise<Locator> {
    return this.page.locator('line.link, path.link');
  }

  /**
   * Get edges connected to a specific node
   */
  async getNodeEdges(nodeId: string): Promise<Locator> {
    return this.page.locator(`line.link[data-source="${nodeId}"], line.link[data-target="${nodeId}"]`);
  }

  /**
   * Click on a node and wait for any animations
   */
  async clickNode(nodeId: string) {
    const node = await this.getNode(nodeId);
    await node.click();
    await this.page.waitForTimeout(300); // Wait for click animations
  }

  /**
   * Get the tooltip content for a node
   */
  async getNodeTooltip(nodeId: string): Promise<string | null> {
    const node = await this.getNode(nodeId);
    await node.hover();
    await this.page.waitForTimeout(200); // Wait for tooltip to appear
    
    const tooltip = this.page.locator('.tooltip, [role="tooltip"]');
    if (await tooltip.isVisible()) {
      return await tooltip.textContent();
    }
    return null;
  }

  /**
   * Zoom in/out on the graph
   */
  async zoom(scale: number, centerX?: number, centerY?: number) {
    const svg = await this.page.locator('svg').boundingBox();
    if (!svg) throw new Error('SVG element not found');

    const x = centerX ?? svg.x + svg.width / 2;
    const y = centerY ?? svg.y + svg.height / 2;

    // Simulate zoom with mouse wheel
    await this.page.mouse.move(x, y);
    await this.page.mouse.wheel(0, scale > 1 ? -100 : 100);
    await this.page.waitForTimeout(300); // Wait for zoom animation
  }

  /**
   * Pan the graph
   */
  async pan(deltaX: number, deltaY: number) {
    const svg = await this.page.locator('svg').boundingBox();
    if (!svg) throw new Error('SVG element not found');

    const startX = svg.x + svg.width / 2;
    const startY = svg.y + svg.height / 2;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, startY + deltaY);
    await this.page.mouse.up();
    await this.page.waitForTimeout(300); // Wait for pan animation
  }

  /**
   * Get the current transform (zoom/pan) of the graph
   */
  async getTransform(): Promise<{ x: number; y: number; scale: number }> {
    return await this.page.evaluate(() => {
      const g = document.querySelector('svg g');
      if (!g) return { x: 0, y: 0, scale: 1 };
      
      const transform = g.getAttribute('transform');
      if (!transform) return { x: 0, y: 0, scale: 1 };
      
      const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)\s*scale\(([-\d.]+)\)/);
      if (!match) return { x: 0, y: 0, scale: 1 };
      
      return {
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        scale: parseFloat(match[3])
      };
    });
  }

  /**
   * Filter nodes by type
   */
  async filterNodesByType(type: string) {
    const filterCheckbox = this.page.locator(`input[data-filter-type="${type}"]`);
    if (await filterCheckbox.isVisible()) {
      await filterCheckbox.click();
      await this.waitForSimulation();
    }
  }

  /**
   * Search for nodes
   */
  async searchNodes(query: string) {
    const searchInput = this.page.locator('input[placeholder*="Search"], input[type="search"]');
    await searchInput.fill(query);
    await this.page.waitForTimeout(500); // Wait for search debounce
  }

  /**
   * Get node details from the sidebar
   */
  async getNodeDetails(): Promise<Record<string, string>> {
    const details: Record<string, string> = {};
    const detailsPanel = this.page.locator('.node-details, .details-panel');
    
    if (await detailsPanel.isVisible()) {
      const rows = detailsPanel.locator('dt, dd');
      const count = await rows.count();
      
      for (let i = 0; i < count; i += 2) {
        const key = await rows.nth(i).textContent();
        const value = await rows.nth(i + 1).textContent();
        if (key && value) {
          details[key.replace(':', '')] = value;
        }
      }
    }
    
    return details;
  }

  /**
   * Verify graph has rendered with expected node count
   */
  async verifyNodeCount(expectedCount: number) {
    const nodes = await this.getNodes();
    const actualCount = await nodes.count();
    return actualCount === expectedCount;
  }

  /**
   * Get node position
   */
  async getNodePosition(nodeId: string): Promise<{ x: number; y: number }> {
    return await this.page.evaluate((id) => {
      const node = document.querySelector(`g.node[data-id="${id}"]`);
      if (!node) throw new Error(`Node ${id} not found`);
      
      const transform = node.getAttribute('transform');
      const match = transform?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      
      if (!match) throw new Error(`Invalid transform for node ${id}`);
      
      return {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
      };
    }, nodeId);
  }
}