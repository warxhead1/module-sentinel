#!/usr/bin/env tsx

import { IndexerLogger } from '../src/utils/indexer-logger.js';

async function tailLog() {
  const logFile = IndexerLogger.getLatestLogFile();
  
  if (!logFile) {
    console.log('No indexer log file found');
    return;
  }
  
  console.log(`📝 Tailing log file: ${logFile}`);
  console.log('='.repeat(80));
  
  const lines = await IndexerLogger.tailLog(100);
  lines.forEach(line => console.log(line));
  
  console.log('='.repeat(80));
  console.log('To continuously monitor, run: tail -f ' + logFile);
}

tailLog().catch(console.error);