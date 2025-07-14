import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ModuleIndexer } from './module-indexer.js';
import { PatternAwareIndexer } from '../indexing/pattern-aware-indexer.js';

export interface WatcherOptions {
  paths: string[];
  filePatterns: string[];
  indexer: ModuleIndexer | PatternAwareIndexer;
  debounceMs?: number;
  batchUpdates?: boolean;
}

export class FileWatcher extends EventEmitter {
  private watchers: fs.FSWatcher[] = [];
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private batchedUpdates: Set<string> = new Set();
  private batchTimeout: NodeJS.Timeout | null = null;
  private options: WatcherOptions;

  constructor(options: WatcherOptions) {
    super();
    this.options = options;
  }

  async start(): Promise<void> {
    for (const watchPath of this.options.paths) {
      try {
        const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
          if (filename) {
            this.handleFileChange(path.join(watchPath, filename), eventType);
          }
        });
        
        this.watchers.push(watcher);
        this.emit('watching', { path: watchPath });
      } catch (error) {
        this.emit('error', { path: watchPath, error });
      }
    }
  }

  private handleFileChange(filePath: string, eventType: string): void {
    // Check if file matches our patterns
    const ext = path.extname(filePath);
    const shouldWatch = ['.cpp', '.hpp', '.h', '.ixx', '.cc', '.cxx'].includes(ext);
    
    if (!shouldWatch) return;

    if (this.options.batchUpdates) {
      // Add to batch
      this.batchedUpdates.add(filePath);
      
      // Clear existing batch timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      
      // Set new batch timeout
      this.batchTimeout = setTimeout(() => {
        this.processBatchedUpdates();
      }, this.options.debounceMs || 1000);
    } else {
      // Original debounced single-file update
      const existing = this.pendingUpdates.get(filePath);
      if (existing) {
        clearTimeout(existing);
      }

      const timeout = setTimeout(async () => {
        this.pendingUpdates.delete(filePath);
        
        try {
          if (eventType === 'rename') {
            // Check if file exists
            try {
              await fs.promises.access(filePath);
              // File created or renamed
              await this.options.indexer.updateFile(filePath);
              this.emit('indexed', { path: filePath, action: 'created' });
            } catch {
              // File deleted
              await this.options.indexer.removeFile(filePath);
              this.emit('indexed', { path: filePath, action: 'deleted' });
            }
          } else {
            // File modified
            await this.options.indexer.updateFile(filePath);
            this.emit('indexed', { path: filePath, action: 'updated' });
          }
        } catch (error) {
          this.emit('error', { path: filePath, error });
        }
      }, this.options.debounceMs || 1000);

      this.pendingUpdates.set(filePath, timeout);
    }
  }
  
  private async processBatchedUpdates(): Promise<void> {
    if (this.batchedUpdates.size === 0) return;
    
    const files = Array.from(this.batchedUpdates);
    this.batchedUpdates.clear();
    this.batchTimeout = null;
    
    this.emit('batch:start', { count: files.length });
    
    try {
      // Use parallel indexing if available
      if ('indexFiles' in this.options.indexer) {
        await (this.options.indexer as PatternAwareIndexer).indexFiles(files);
      } else {
        // Fallback to sequential updates
        for (const file of files) {
          await this.options.indexer.updateFile(file);
        }
      }
      
      this.emit('batch:complete', { count: files.length });
    } catch (error) {
      this.emit('batch:error', { files, error });
    }
  }

  stop(): void {
    // Clear pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();
    
    // Clear batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.batchedUpdates.clear();

    // Close watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}