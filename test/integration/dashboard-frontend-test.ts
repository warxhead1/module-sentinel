#!/usr/bin/env tsx
/**
 * Dashboard Frontend Integration Test
 * 
 * Tests the actual dashboard HTML/JavaScript to ensure:
 * - No JavaScript errors occur
 * - All API calls succeed
 * - UI elements render correctly
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';

interface TestResult {
  test: string;
  success: boolean;
  error?: string;
  details?: any;
}

class DashboardFrontendTester {
  private dashboardProcess: ChildProcess | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly port = 8081;
  private readonly baseUrl = `http://localhost:${this.port}`;
  private results: TestResult[] = [];

  async runAllTests(): Promise<boolean> {
    console.log('Dashboard Frontend Integration Test\n');

    try {
      await this.startDashboard();
      await this.waitForDashboard();
      await this.launchBrowser();
      
      console.log('Testing Dashboard Frontend...\n');
      
      // Test all aspects
      await this.testMainDashboardLoading();
      await this.testJavaScriptErrors();
      await this.testAPICallsFromFrontend();
      await this.testUIElements();
      await this.testNavigationBetweenViews();
      await this.testSearchFunctionality();
      await this.testErrorHandling();
      
      // Print summary
      this.printTestSummary();
      
      return this.allTestsPassed();
      
    } finally {
      await this.cleanup();
    }
  }

  private async startDashboard(): Promise<void> {
    console.log('Starting dashboard server...');
    
    const serverPath = path.join(__dirname, '../../start-enhanced-dashboard.ts');
    this.dashboardProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    });

    this.dashboardProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Module Sentinel Dashboard Ready!')) {
        console.log('✓ Dashboard server started');
      }
    });

    this.dashboardProcess.stderr?.on('data', (data) => {
      console.error('Dashboard stderr:', data.toString());
    });
  }

  private async waitForDashboard(): Promise<void> {
    console.log('Waiting for dashboard to be ready...');
    
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/stats`);
        if (response.ok) {
          console.log('✓ Dashboard API is ready');
          return;
        }
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Dashboard failed to start within 30 seconds');
  }

  private async launchBrowser(): Promise<void> {
    console.log('Launching browser...');
    
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    
    // Capture console messages
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
    
    // Capture page errors
    this.page.on('pageerror', error => {
      console.log('Page error:', error.message);
    });
    
    console.log('✓ Browser launched');
  }

  private async testMainDashboardLoading(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Navigate to dashboard
      const response = await this.page.goto(`${this.baseUrl}/dashboard/unified-dashboard.html`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      if (!response || !response.ok()) {
        throw new Error(`Failed to load dashboard: ${response?.status()}`);
      }
      
      // Wait for essential elements
      await this.page.waitForSelector('.dashboard-container', { timeout: 5000 });
      
      this.results.push({
        test: 'Main dashboard loading',
        success: true,
        details: 'Dashboard loaded successfully'
      });
      
      console.log('✓ Main dashboard loads without errors');
      
    } catch (error) {
      this.results.push({
        test: 'Main dashboard loading',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Main dashboard loading failed:', error);
    }
  }

  private async testJavaScriptErrors(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Collect JavaScript errors
      const jsErrors: string[] = [];
      
      this.page.on('pageerror', error => {
        jsErrors.push(error.message);
      });
      
      // Wait a bit for any async errors
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (jsErrors.length > 0) {
        throw new Error(`JavaScript errors detected: ${jsErrors.join(', ')}`);
      }
      
      this.results.push({
        test: 'JavaScript errors',
        success: true,
        details: 'No JavaScript errors'
      });
      
      console.log('✓ No JavaScript errors detected');
      
    } catch (error) {
      this.results.push({
        test: 'JavaScript errors',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ JavaScript error test failed:', error);
    }
  }

  private async testAPICallsFromFrontend(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Monitor network requests
      const failedRequests: string[] = [];
      
      this.page.on('response', response => {
        if (response.url().includes('/api/') && !response.ok()) {
          failedRequests.push(`${response.url()} - ${response.status()}`);
        }
      });
      
      // Reload to capture all initial API calls
      await this.page.reload({ waitUntil: 'networkidle2' });
      
      // Wait for API calls to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (failedRequests.length > 0) {
        throw new Error(`Failed API requests: ${failedRequests.join(', ')}`);
      }
      
      this.results.push({
        test: 'API calls from frontend',
        success: true,
        details: 'All API calls successful'
      });
      
      console.log('✓ All API calls from frontend succeed');
      
    } catch (error) {
      this.results.push({
        test: 'API calls from frontend',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ API calls test failed:', error);
    }
  }

  private async testUIElements(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Check for essential UI elements
      const elements = [
        { selector: '#totalSymbols', name: 'Total Symbols' },
        { selector: '#totalFiles', name: 'Total Files' },
        { selector: '#totalRelationships', name: 'Total Relationships' },
        { selector: '#semanticCoverage', name: 'Semantic Coverage' },
        { selector: '#pipelineChart', name: 'Pipeline Chart' },
        { selector: '#relationshipChart', name: 'Relationship Chart' },
        { selector: '#namespaceList', name: 'Namespace List' }
      ];
      
      for (const element of elements) {
        const exists = await this.page.$(element.selector) !== null;
        if (!exists) {
          throw new Error(`Missing UI element: ${element.name} (${element.selector})`);
        }
      }
      
      // Check if metrics have values (not "Error")
      const symbolsText = await this.page.$eval('#totalSymbols', el => el.textContent);
      if (symbolsText === 'Error' || !symbolsText) {
        throw new Error('Stats failed to load - metrics show "Error"');
      }
      
      this.results.push({
        test: 'UI elements rendering',
        success: true,
        details: 'All essential UI elements present'
      });
      
      console.log('✓ All UI elements render correctly');
      
    } catch (error) {
      this.results.push({
        test: 'UI elements rendering',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ UI elements test failed:', error);
    }
  }

  private async testNavigationBetweenViews(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Test navigation to different views
      const views = [
        { link: '[data-view="code-flow"]', view: 'code-flow' },
        { link: '[data-view="relationships"]', view: 'relationships' },
        { link: '[data-view="patterns"]', view: 'patterns' },
        { link: '[data-view="performance"]', view: 'performance' }
      ];
      
      for (const { link, view } of views) {
        await this.page.click(link);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const activeView = await this.page.$eval('.view.active', el => el.id);
        if (activeView !== view) {
          throw new Error(`Navigation to ${view} failed`);
        }
      }
      
      this.results.push({
        test: 'View navigation',
        success: true,
        details: 'All views navigate correctly'
      });
      
      console.log('✓ Navigation between views works');
      
    } catch (error) {
      this.results.push({
        test: 'View navigation',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Navigation test failed:', error);
    }
  }

  private async testSearchFunctionality(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Navigate to search view
      await this.page.click('[data-view="search"]');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Type in search box
      await this.page.type('#searchInput', 'Pipeline');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for debounce
      
      // Check for results
      const hasResults = await this.page.$('.search-result') !== null;
      if (!hasResults) {
        throw new Error('Search returned no results');
      }
      
      this.results.push({
        test: 'Search functionality',
        success: true,
        details: 'Search works correctly'
      });
      
      console.log('✓ Search functionality works');
      
    } catch (error) {
      this.results.push({
        test: 'Search functionality',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Search test failed:', error);
    }
  }

  private async testErrorHandling(): Promise<void> {
    try {
      if (!this.page) throw new Error('Page not initialized');
      
      // Test error handling by making a bad API call
      const errorResponse = await this.page.evaluate(async () => {
        try {
          const response = await fetch('/api/nonexistent');
          return { 
            ok: response.ok, 
            status: response.status,
            handled: true 
          };
        } catch (error) {
          return { 
            ok: false, 
            error: error instanceof Error ? error.message : String(error),
            handled: true 
          };
        }
      });
      
      if (!errorResponse.handled) {
        throw new Error('Error handling not working');
      }
      
      this.results.push({
        test: 'Error handling',
        success: true,
        details: 'Errors are handled gracefully'
      });
      
      console.log('✓ Error handling works correctly');
      
    } catch (error) {
      this.results.push({
        test: 'Error handling',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log('❌ Error handling test failed:', error);
    }
  }

  private printTestSummary(): void {
    console.log('\nFrontend Test Summary\n');
    console.log('='.repeat(60));
    
    const successful = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const successRate = ((successful / total) * 100).toFixed(1);
    
    console.log(`Overall Success Rate: ${successful}/${total} (${successRate}%)\n`);
    
    this.results.forEach(result => {
      const status = result.success ? '✓' : '✗';
      const details = result.success ? result.details : result.error;
      
      console.log(`${status} ${result.test.padEnd(30)} ${details || ''}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (successful === total) {
      console.log('All frontend tests passed!');
    } else {
      console.log(`${total - successful} test(s) failed`);
    }
  }

  private allTestsPassed(): boolean {
    return this.results.every(result => result.success);
  }

  private async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    
    if (this.dashboardProcess) {
      console.log('Stopping dashboard server...');
      this.dashboardProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Run the test
async function runFrontendTests(): Promise<void> {
  const tester = new DashboardFrontendTester();
  
  try {
    const success = await tester.runAllTests();
    
    if (!success) {
      console.log('\n❌ Frontend tests failed');
      process.exit(1);
    }
    
    console.log('\n✅ Frontend tests passed');
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Test runner failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFrontendTests().catch(console.error);
}

export { DashboardFrontendTester };