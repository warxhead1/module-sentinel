import { parentPort, workerData } from 'worker_threads';
import { GrammarAwareParser } from './grammar-aware-parser.js';
import { EnhancedTreeSitterParser } from './enhanced-tree-sitter-parser.js';
import * as fs from 'fs';
import * as path from 'path';

interface WorkerData {
  filePath: string;
  useGrammarAware: boolean;
  projectPath: string;
}

// Initialize parsers once per worker
const grammarParser = new GrammarAwareParser();
const treeParser = new EnhancedTreeSitterParser();
let initialized = false;

async function initializeParsers() {
  if (!initialized) {
    await grammarParser.initialize();
    await treeParser.initialize();
    initialized = true;
  }
}

async function parseFile(data: WorkerData) {
  try {
    await initializeParsers();
    
    const parser = data.useGrammarAware ? grammarParser : treeParser;
    const result = await parser.parseFile(data.filePath);
    
    // Add file size for performance tracking
    const stats = await fs.promises.stat(data.filePath);
    
    parentPort?.postMessage({
      success: true,
      result,
      filePath: data.filePath,
      fileSize: stats.size,
      parserUsed: data.useGrammarAware ? 'grammar-aware' : 'tree-sitter'
    });
  } catch (error) {
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      filePath: data.filePath
    });
  }
}

// Listen for messages from the main thread
if (parentPort) {
  parentPort.on('message', (data: WorkerData) => {
    console.log(`Worker received task for: ${data.filePath}`);
    parseFile(data);
  });
}

// Handle initial workerData if provided
if (workerData) {
  parseFile(workerData as WorkerData);
}