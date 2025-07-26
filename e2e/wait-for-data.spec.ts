import { test, expect } from '@playwright/test';

test.describe('Wait for Data', () => {
  test('check indexing status and data availability', async ({ page }) => {
    // Check API health and symbol count
    const apiResponse = await page.request.get('/api/health');
    const healthData = await apiResponse.json();
    
    console.log('='.repeat(60));
    console.log('Database Status:');
    console.log(`  Symbol Count: ${healthData.data?.database?.symbolCount || 0}`);
    console.log(`  Database Health: ${healthData.data?.database?.healthy ? '✅' : '❌'}`);
    console.log('='.repeat(60));
    
    // Navigate to stats to see more details
    await page.goto('/api/stats');
    const statsResponse = await page.textContent('body');
    
    try {
      const stats = JSON.parse(statsResponse);
      console.log('\nProject Statistics:');
      console.log(`  Total Symbols: ${stats.data?.totalSymbols || 0}`);
      console.log(`  Total Files: ${stats.data?.totalFiles || 0}`);
      console.log(`  Total Relationships: ${stats.data?.totalRelationships || 0}`);
      console.log(`  Languages: ${stats.data?.languages?.map(l => l.name).join(', ') || 'none'}`);
      
      if (stats.data?.projects?.length > 0) {
        console.log('\nProjects:');
        stats.data.projects.forEach(project => {
          console.log(`  - ${project.name}: ${project.stats?.symbolCount || 0} symbols`);
        });
      }
    } catch (e) {
      console.log('Could not parse stats:', e);
    }
    
    // Check indexing status
    const indexingResponse = await page.request.get('/api/indexing/status');
    const indexingData = await indexingResponse.json();
    
    if (indexingData.data?.status) {
      console.log('\nIndexing Status:');
      console.log(`  Status: ${indexingData.data.status}`);
      console.log(`  Progress: ${indexingData.data.progress || 'N/A'}`);
    }
    
    // Navigate to relationships page to check UI
    await page.goto('/relationships');
    await page.waitForTimeout(3000);
    
    // Take a screenshot of current state
    await page.screenshot({ 
      path: 'e2e-screenshots/current-data-state.png', 
      fullPage: true 
    });
    
    // Check for data or empty state
    const hasGraph = await page.locator('relationship-graph svg').isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no data|no relationships|empty|index your project/i').isVisible().catch(() => false);
    
    console.log('\nUI State:');
    console.log(`  Graph Visible: ${hasGraph ? '✅' : '❌'}`);
    console.log(`  Empty State: ${hasEmptyState ? 'Yes' : 'No'}`);
    
    if (hasEmptyState) {
      const emptyStateText = await page.locator('text=/no data|no relationships|empty|index your project/i').first().textContent();
      console.log(`  Empty State Message: "${emptyStateText}"`);
    }
    
    console.log('='.repeat(60));
    
    // Return status for other tests to use
    return {
      hasData: healthData.data?.database?.symbolCount > 0,
      isIndexing: indexingData.data?.status === 'indexing',
      hasGraph
    };
  });
});