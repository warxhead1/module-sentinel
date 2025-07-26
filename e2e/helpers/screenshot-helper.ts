import { Page } from '@playwright/test';
import * as path from 'path';

export class ScreenshotHelper {
  private screenshotIndex = 0;
  private testName: string;
  
  constructor(testName: string) {
    this.testName = testName.replace(/[^a-zA-Z0-9]/g, '-');
  }

  /**
   * Take a screenshot with annotation
   */
  async capture(page: Page, stepName: string, options?: {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    mask?: string[]; // CSS selectors to mask
    highlightSelector?: string; // CSS selector to highlight with a border
  }) {
    this.screenshotIndex++;
    const filename = `${this.screenshotIndex.toString().padStart(2, '0')}-${stepName.replace(/[^a-zA-Z0-9]/g, '-')}.png`;
    const filepath = path.join('e2e-screenshots', this.testName, filename);

    // Add highlight if requested
    if (options?.highlightSelector) {
      await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          (element as HTMLElement).style.outline = '3px solid #ff0000';
          (element as HTMLElement).style.outlineOffset = '2px';
        }
      }, options.highlightSelector);
    }

    // Add annotation overlay
    await page.evaluate((text) => {
      const overlay = document.createElement('div');
      overlay.id = 'test-annotation';
      overlay.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 14px;
        z-index: 99999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      `;
      overlay.textContent = text;
      document.body.appendChild(overlay);
    }, stepName);

    // Take screenshot
    await page.screenshot({
      path: filepath,
      fullPage: options?.fullPage ?? true,
      clip: options?.clip,
      mask: options?.mask ? await page.locator(options.mask.join(', ')).all() : undefined
    });

    // Remove annotation and highlight
    await page.evaluate(() => {
      const overlay = document.getElementById('test-annotation');
      if (overlay) overlay.remove();
      
      // Remove all outlines
      document.querySelectorAll('*').forEach(el => {
        (el as HTMLElement).style.outline = '';
      });
    });

    return filepath;
  }

  /**
   * Capture element with context
   */
  async captureElement(page: Page, selector: string, stepName: string, padding = 20) {
    const element = page.locator(selector);
    const box = await element.boundingBox();
    
    if (!box) {
      console.warn(`Element ${selector} not found for screenshot`);
      return null;
    }

    return this.capture(page, stepName, {
      clip: {
        x: Math.max(0, box.x - padding),
        y: Math.max(0, box.y - padding),
        width: box.width + padding * 2,
        height: box.height + padding * 2
      }
    });
  }

  /**
   * Compare visual states
   */
  async captureComparison(page: Page, beforeAction: string, action: () => Promise<void>, afterAction: string) {
    // Capture before state
    await this.capture(page, `Before: ${beforeAction}`);
    
    // Perform action
    await action();
    
    // Wait for any animations
    await page.waitForTimeout(500);
    
    // Capture after state
    await this.capture(page, `After: ${afterAction}`);
  }

  /**
   * Document UI flow with screenshots
   */
  async documentFlow(page: Page, steps: Array<{
    name: string;
    action?: () => Promise<void>;
    highlight?: string;
    waitFor?: string;
  }>) {
    for (const step of steps) {
      if (step.action) {
        await step.action();
      }
      
      if (step.waitFor) {
        await page.waitForSelector(step.waitFor, { timeout: 5000 }).catch(() => {
          console.warn(`Selector ${step.waitFor} not found`);
        });
      }
      
      await this.capture(page, step.name, { highlightSelector: step.highlight });
    }
  }
}