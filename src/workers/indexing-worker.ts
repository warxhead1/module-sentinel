import { parentPort, workerData as _workerData } from 'worker_threads';
import * as _fs from 'fs/promises';
import { createLogger } from '../utils/logger.js';
import type { ParseResult } from '../parsers/tree-sitter/parser-types.js';

const logger = createLogger('IndexingWorker');

interface WorkerMessage {
  type: 'parse';
  filePath: string;
  content: string;
  language: string;
  projectId: number;
  languageId: number;
  options: any;
}

interface WorkerResult {
  success: boolean;
  result?: ParseResult;
  error?: string;
}

// Dynamically load parser based on language
async function loadParser(language: string, options: any) {
  try {
    switch (language) {
      case 'typescript':
      case 'javascript': {
        const { TypeScriptLanguageParser } = await import('../parsers/adapters/typescript-language-parser.js');
        return new TypeScriptLanguageParser(null as any, options); // Worker doesn't have DB access
      }
      case 'python': {
        const { PythonLanguageParser } = await import('../parsers/adapters/python-language-parser.js');
        return new PythonLanguageParser(null as any, options);
      }
      case 'cpp': {
        const { OptimizedCppTreeSitterParser } = await import('../parsers/tree-sitter/optimized-cpp-parser.js');
        return new OptimizedCppTreeSitterParser(null as any, options);
      }
      case 'go': {
        const { GoLanguageParser } = await import('../parsers/adapters/go-language-parser.js');
        return new GoLanguageParser(null as any, options);
      }
      case 'java': {
        const { JavaLanguageParser } = await import('../parsers/adapters/java-language-parser.js');
        return new JavaLanguageParser(null as any, options);
      }
      case 'csharp': {
        const { CSharpLanguageParser } = await import('../parsers/adapters/csharp-language-parser.js');
        return new CSharpLanguageParser(null as any, options);
      }
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  } catch (error) {
    logger.error('Failed to load parser', error, { language });
    throw error;
  }
}

// Parse file in worker thread
async function parseFileInWorker(message: WorkerMessage): Promise<WorkerResult> {
  const operation = logger.operation('parseFile', { file: message.filePath });
  
  try {
    // Load appropriate parser
    const parser = await loadParser(message.language, {
      projectId: message.projectId,
      languageId: message.languageId,
      debugMode: message.options.debugMode,
      enablePatternDetection: message.options.enablePatternDetection,
      enableSemanticAnalysis: false, // Disable in worker to reduce memory
    });

    // Initialize parser if needed
    if (parser.initialize) {
      await parser.initialize();
    }

    // Parse the file
    const result = await parser.parseFile(message.filePath, message.content);
    
    operation();
    
    return {
      success: true,
      result
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Worker parsing failed', error, { file: message.filePath });
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Worker message handler
if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    const result = await parseFileInWorker(message);
    parentPort!.postMessage(result);
  });
}