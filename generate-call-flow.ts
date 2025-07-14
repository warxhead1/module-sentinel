#!/usr/bin/env tsx

import { CallFlowVisualizer } from './src/visualization/call-flow-visualizer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function generateCallFlow(startSymbol: string = 'VisualFeedbackApplication') {
  const dbPath = path.join(process.env.HOME || '/tmp', '.module-sentinel', 'module-sentinel.db');
  console.log(`🔍 Generating call flow from: ${startSymbol}`);
  console.log(`📊 Using database: ${dbPath}`);
  
  const visualizer = new CallFlowVisualizer(dbPath);
  
  try {
    // Create output directory
    const outputDir = './visualizations';
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate call flow visualization
    console.log('🎨 Tracing call flow and generating visualization...');
    const html = await visualizer.generateCallFlowHTML(startSymbol);
    
    const outputPath = path.join(outputDir, `call-flow-${startSymbol.toLowerCase()}.html`);
    await fs.writeFile(outputPath, html);
    
    console.log(`✅ Call flow visualization saved to: ${outputPath}`);
    console.log('\n🚀 To view the visualization:');
    console.log(`   1. Open in browser: firefox ${path.resolve(outputPath)}`);
    console.log(`   2. Or serve locally: python3 -m http.server 8000 -d visualizations`);
    console.log('\n📝 Interactive features:');
    console.log('   - Click nodes to see details and connections');
    console.log('   - Use search to find specific functions/classes');
    console.log('   - Toggle "Key Path Only" to see main execution flow');
    console.log('   - Switch layouts for different perspectives');
    console.log('   - Filter by pipeline stage');
    
  } catch (error) {
    console.error('❌ Error generating call flow:', error);
  } finally {
    visualizer.close();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const startSymbol = args[0] || 'VisualFeedbackApplication';

generateCallFlow(startSymbol).catch(console.error);