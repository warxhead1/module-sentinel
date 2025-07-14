#!/usr/bin/env tsx

import { ProjectVisualizer } from './src/visualization/project-visualizer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function generateVisualizations() {
  const dbPath = path.join(process.env.HOME || '/tmp', '.module-sentinel', 'module-sentinel.db');
  console.log(`📊 Generating visualizations from database: ${dbPath}`);
  
  const visualizer = new ProjectVisualizer(dbPath);
  
  try {
    // Create output directory
    const outputDir = './visualizations';
    await fs.mkdir(outputDir, { recursive: true });
    
    // Generate SVG treemap
    console.log('🎨 Generating SVG treemap...');
    const svg = await visualizer.generateTreemapSVG(1400, 900);
    await fs.writeFile(path.join(outputDir, 'project-treemap.svg'), svg);
    console.log('✅ Saved: project-treemap.svg');
    
    // Generate interactive HTML
    console.log('🌐 Generating interactive HTML visualization...');
    const html = await visualizer.generateInteractiveHTML();
    await fs.writeFile(path.join(outputDir, 'project-architecture.html'), html);
    console.log('✅ Saved: project-architecture.html');
    
    // Generate dependency matrix
    console.log('📊 Generating dependency matrix...');
    const matrix = await visualizer.generateDependencyMatrix();
    const matrixHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Module Dependency Matrix</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        table { margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Planet ProcGen - Module Dependency Matrix</h1>
    <p>Darker red indicates more dependencies between modules.</p>
    ${matrix}
</body>
</html>`;
    await fs.writeFile(path.join(outputDir, 'dependency-matrix.html'), matrixHtml);
    console.log('✅ Saved: dependency-matrix.html');
    
    console.log('\n🎉 All visualizations generated successfully!');
    console.log(`📁 Output directory: ${path.resolve(outputDir)}`);
    console.log('\nTo view the interactive visualization, open:');
    console.log(`  ${path.resolve(outputDir, 'project-architecture.html')}`);
    
  } catch (error) {
    console.error('❌ Error generating visualizations:', error);
  } finally {
    visualizer.close();
  }
}

// Also export a function to serve the visualizations
export async function serveVisualizations(port: number = 8080) {
  const express = await import('express');
  const app = express.default();
  
  app.use(express.static('visualizations'));
  
  app.get('/api/stats', async (req, res) => {
    const dbPath = path.join(process.env.HOME || '/tmp', '.module-sentinel', 'module-sentinel.db');
    const visualizer = new ProjectVisualizer(dbPath);
    
    try {
      const { nodes, edges } = await visualizer.generateDependencyGraph();
      res.json({
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes: nodes.slice(0, 100), // Limit for performance
        edges: edges.slice(0, 500)
      });
    } finally {
      visualizer.close();
    }
  });
  
  app.listen(port, () => {
    console.log(`🚀 Visualization server running at http://localhost:${port}`);
    console.log('📊 Available visualizations:');
    console.log(`   http://localhost:${port}/project-architecture.html`);
    console.log(`   http://localhost:${port}/dependency-matrix.html`);
    console.log(`   http://localhost:${port}/project-treemap.svg`);
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateVisualizations().catch(console.error);
}