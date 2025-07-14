#!/usr/bin/env tsx

import { EnhancedIndexer } from './src/services/enhanced-indexer.js';
import { ModuleIndexer } from './src/services/module-indexer.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';

const PLANET_PROCGEN_PATH = '/home/warxh/planet_procgen';
const ENHANCED_DB_PATH = '.module-sentinel/enhanced-index.db';

async function buildEnhancedIndex() {
  console.log('🚀 Building Enhanced Index for planet_procgen...\n');
  
  // Ensure database directory exists
  const dbDir = path.dirname(ENHANCED_DB_PATH);
  await fs.mkdir(dbDir, { recursive: true });
  
  // First use the regular indexer to get the basic data
  console.log('Step 1: Running basic indexer...');
  const basicIndexer = new ModuleIndexer({
    projectPath: PLANET_PROCGEN_PATH,
    scanPaths: [
      path.join(PLANET_PROCGEN_PATH, 'src'),
      path.join(PLANET_PROCGEN_PATH, 'include')
    ],
    filePatterns: ['**/*.cpp', '**/*.hpp', '**/*.h', '**/*.ixx'],
    parallel: true,
    maxConcurrent: 10,
    dbPath: '.module-sentinel/index.db'
  });
  
  await basicIndexer.buildIndex(true);
  const stats = await basicIndexer.getStats();
  console.log(`Basic index built: ${stats.totalModules} modules\n`);
  basicIndexer.close();
  
  // Now build the enhanced index
  console.log('Step 2: Building enhanced index...');
  const enhancedIndexer = new EnhancedIndexer(ENHANCED_DB_PATH);
  
  const files = await glob('**/*.{cpp,hpp,h,ixx}', {
    cwd: PLANET_PROCGEN_PATH,
    absolute: true,
    ignore: ['**/external/**', '**/build/**', '**/node_modules/**']
  });
  
  console.log(`Found ${files.length} files to index\n`);
  
  let processed = 0;
  for (const file of files) {
    try {
      await enhancedIndexer.indexModule(file);
      processed++;
      
      if (processed % 10 === 0) {
        console.log(`Progress: ${processed}/${files.length} files...`);
      }
    } catch (error: any) {
      console.error(`Failed to index ${path.basename(file)}: ${error.message}`);
    }
  }
  
  console.log(`\nEnhanced indexing complete! Processed ${processed} files.`);
  
  // Test the enhanced features
  console.log('\n🔍 Testing enhanced features...\n');
  
  // Test finding implementations
  const implementations = await enhancedIndexer.findImplementations(
    'heightmap generation',
    ['generate', 'heightmap', 'terrain'],
    'std::vector<float>'
  );
  
  console.log(`Found ${implementations.length} heightmap generation implementations:`);
  implementations.slice(0, 3).forEach(impl => {
    console.log(`  - ${impl.className}::${impl.name}`);
    console.log(`    ${impl.returnType} ${impl.name}(...)`);
  });
  
  // Test finding patterns
  console.log('\n🔍 Looking for code patterns...');
  const patterns = await enhancedIndexer.findSimilarPatterns(
    'for (int i = 0; i < size; ++i)',
    0.6
  );
  
  console.log(`Found ${patterns.length} similar loop patterns`);
  
  enhancedIndexer.close();
  console.log('\n✨ Enhanced index is ready for use!');
}

buildEnhancedIndex().catch(console.error);