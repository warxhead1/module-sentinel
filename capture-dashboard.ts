import { chromium } from 'playwright';

async function captureDashboard() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set a larger viewport to capture more content
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  console.log('Navigating to dashboard...');
  await page.goto('http://localhost:6969');
  
  // Wait for the canvas or WebGPU content to load
  await page.waitForTimeout(3000);
  
  // Take a screenshot
  await page.screenshot({ path: 'dashboard-screenshot.png', fullPage: true });
  console.log('Screenshot saved to dashboard-screenshot.png');
  
  // Try to capture any console logs
  page.on('console', msg => console.log('Console:', msg.text()));
  
  // Check for WebGPU support
  const hasWebGPU = await page.evaluate(() => {
    return 'gpu' in navigator;
  });
  console.log('WebGPU support:', hasWebGPU);
  
  // Get any visible text content
  const textContent = await page.evaluate(() => {
    return document.body.innerText;
  });
  console.log('Page content:', textContent);
  
  // Check for canvas elements
  const canvasInfo = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    return Array.from(canvases).map(canvas => ({
      id: canvas.id,
      width: canvas.width,
      height: canvas.height,
      className: canvas.className
    }));
  });
  console.log('Canvas elements:', canvasInfo);
  
  await browser.close();
}

captureDashboard().catch(console.error);