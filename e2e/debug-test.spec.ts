import { test, expect } from '@playwright/test';

test.describe('Debug Dashboard', () => {
  test('check what loads on relationships page', async ({ page }) => {
    // Navigate to the relationships page
    await page.goto('/relationships');
    
    // Wait for initial load
    await page.waitForTimeout(3000);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'debug-relationships-page.png', fullPage: true });
    
    // Check what's on the page
    const pageContent = await page.content();
    console.log('Page title:', await page.title());
    
    // Check for any error messages
    const errorElements = await page.locator('text=/error|failed|exception/i').all();
    for (const error of errorElements) {
      console.log('Error found:', await error.textContent());
    }
    
    // Check for loading states
    const loadingElements = await page.locator('text=/loading|please wait/i').all();
    for (const loading of loadingElements) {
      console.log('Loading found:', await loading.textContent());
    }
    
    // Check for the router outlet
    const routerOutlet = await page.locator('router-outlet').isVisible();
    console.log('Router outlet visible:', routerOutlet);
    
    // Check what component is rendered
    const allComponents = await page.locator('[class*="component"], [data-component]').all();
    console.log('Components found:', allComponents.length);
    
    // Look for any custom elements
    const customElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements
        .filter(el => el.tagName.includes('-'))
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          visible: window.getComputedStyle(el).display !== 'none',
          hasContent: el.innerHTML.length > 0
        }));
    });
    
    console.log('Custom elements:', JSON.stringify(customElements, null, 2));
    
    // Check if there's a "no data" message
    const noDataPatterns = [
      'no data',
      'no relationships',
      'empty',
      'not found',
      'no symbols',
      'index your project'
    ];
    
    for (const pattern of noDataPatterns) {
      const elements = await page.locator(`text=/${pattern}/i`).all();
      for (const el of elements) {
        console.log(`Found "${pattern}" message:`, await el.textContent());
      }
    }
    
    // Check console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text());
      }
    });
    
    // Final check - is relationship-graph present?
    const relationshipGraph = await page.locator('relationship-graph').count();
    console.log('relationship-graph elements found:', relationshipGraph);
    
    // If not, check what's in the router outlet
    if (relationshipGraph === 0) {
      const outlet = await page.locator('router-outlet');
      const outletContent = await outlet.innerHTML();
      console.log('Router outlet content preview:', outletContent.substring(0, 200));
    }
  });
});