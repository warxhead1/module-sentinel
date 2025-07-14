import { HybridCppParser } from '../parsers/hybrid-cpp-parser.js';
import { glob } from 'glob';
import { KnowledgeBase } from './knowledge-base.js';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

export class BackgroundAnalyzer {
  private parser: HybridCppParser;
  private knowledgeBase: KnowledgeBase;
  private projectPath: string;
  private isRunning: boolean = false;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    const debugMode = process.env.MODULE_SENTINEL_DEBUG === 'true';
    this.parser = new HybridCppParser(debugMode); // Will be initialized with projectPath later
    this.knowledgeBase = new KnowledgeBase(projectPath); // Pass projectPath
  }

  async initialize(): Promise<void> {
    await this.knowledgeBase.initialize();
    await this.parser.initialize(this.projectPath); // Initialize parser after KB
  }

  start(): void {
    if (this.isRunning) {
      console.log('Background analyzer is already running.');
      return;
    }
    this.isRunning = true;
    console.log('Starting background analysis...');
    this.runAnalysisLoop();
  }

  stop(): void {
    this.isRunning = false;
    console.log('Stopping background analysis.');
    this.knowledgeBase.close(); // Close KB connection on stop
  }

  private async runAnalysisLoop(): Promise<void> {
    while (this.isRunning) {
      const files = await glob('**/*.{cpp,hpp,ixx}', { cwd: this.projectPath, absolute: true });

      for (const file of files) {
        if (!this.isRunning) break;

        try {
          const fileContent = await fs.readFile(file, 'utf-8');
          const currentHash = crypto.createHash('sha256').update(fileContent).digest('hex');
          const lastIndexedHash = await this.knowledgeBase.getFileHash(file);

          if (currentHash === lastIndexedHash) {
            console.log(`⏭️  Skipping ${file} - no changes detected`);
            continue; // Skip if file hasn't changed
          }

          console.log(`🔄 Analyzing ${file} (changed)`);
          // Use the most powerful parser for deep analysis
          const moduleInfo = await this.parser.parseWithParser(file, 'clang');

          // Store the discovered patterns and relationships
          await this.knowledgeBase.storePatterns(file, moduleInfo.patterns);
          await this.knowledgeBase.storeRelationships(file, moduleInfo.relationships);
          await this.knowledgeBase.updateFileHash(file, currentHash); // Update hash after successful analysis

        } catch (error) {
          console.error(` Error analyzing ${file}:`, error);
        }

        // Pause to avoid consuming all resources
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for a longer period before the next full pass
      await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // 1 minute
    }
  }
}
