/**
 * BatchOperationUtilities
 *
 * Consolidates repetitive batch processing patterns found throughout the codebase.
 * Provides reusable utilities for batching operations, deduplication, progress tracking,
 * and error handling in bulk operations.
 */

import { createLogger } from "../utils/logger.js";

export interface BatchProcessingConfig {
  batchSize?: number;
  maxConcurrency?: number;
  retryCount?: number;
  retryDelayMs?: number;
  enableProgressLogging?: boolean;
  progressLogInterval?: number;
  enableDeduplication?: boolean;
  timeoutMs?: number;
}

export interface BatchProcessingResult<T> {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ item: T; error: Error }>;
  duration: number;
  results: Array<{ item: T; success: boolean; result?: any; error?: Error }>;
}

export interface BatchOperation<TInput, TOutput> {
  process(items: TInput[]): Promise<TOutput[]>;
  getOperationName(): string;
}

export class BatchProcessor<TInput, TOutput = any> {
  private logger = createLogger("BatchProcessor");
  private config: Required<BatchProcessingConfig>;

  constructor(config: BatchProcessingConfig = {}) {
    this.config = {
      batchSize: config.batchSize || 100,
      maxConcurrency: config.maxConcurrency || 3,
      retryCount: config.retryCount || 2,
      retryDelayMs: config.retryDelayMs || 1000,
      enableProgressLogging: config.enableProgressLogging ?? true,
      progressLogInterval: config.progressLogInterval || 1000,
      enableDeduplication: config.enableDeduplication ?? false,
      timeoutMs: config.timeoutMs || 30000,
    };
  }

  /**
   * Process items in batches with configurable concurrency and error handling
   */
  async processBatches<T = TOutput>(
    items: TInput[],
    operation: BatchOperation<TInput, T>,
    keyExtractor?: (item: TInput) => string
  ): Promise<BatchProcessingResult<TInput>> {
    const startTime = Date.now();
    const operationName = operation.getOperationName();
    
    this.logger.debug(`Starting batch processing: ${operationName}`, {
      totalItems: items.length,
      batchSize: this.config.batchSize,
      maxConcurrency: this.config.maxConcurrency,
    });

    // Deduplicate if requested
    let processItems = items;
    if (this.config.enableDeduplication && keyExtractor) {
      processItems = this.deduplicateItems(items, keyExtractor);
      this.logger.debug(`Deduplicated items: ${items.length} -> ${processItems.length}`);
    }

    // Split into batches
    const batches = this.splitIntoBatches(processItems, this.config.batchSize);
    
    // Process batches with concurrency control
    const results: Array<{ item: TInput; success: boolean; result?: T; error?: Error }> = [];
    const errors: Array<{ item: TInput; error: Error }> = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Progress tracking
    const progressLogger = this.createProgressLogger(operationName, processItems.length);
    
    try {
      // Process batches in parallel with concurrency limit
      const concurrentBatches = this.createConcurrentBatchProcessor(batches, operation);
      
      for await (const batchResult of concurrentBatches) {
        for (const result of batchResult) {
          results.push(result);
          processed++;
          
          if (result.success) {
            succeeded++;
          } else {
            failed++;
            if (result.error) {
              errors.push({ item: result.item, error: result.error });
            }
          }
        }
        
        progressLogger(processed);
      }
    } catch (error) {
      this.logger.error(`Batch processing failed: ${operationName}`, error);
      throw error;
    }

    const duration = Date.now() - startTime;
    
    this.logger.debug(`Batch processing completed: ${operationName}`, {
      processed,
      succeeded,
      failed,
      duration,
      errorCount: errors.length,
    });

    return {
      processed,
      succeeded,
      failed,
      errors,
      duration,
      results,
    };
  }

  private deduplicateItems<T>(items: T[], keyExtractor: (item: T) => string): T[] {
    const seen = new Set<string>();
    const deduplicated: T[] = [];
    
    for (const item of items) {
      const key = keyExtractor(item);
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }
    
    return deduplicated;
  }

  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private createProgressLogger(operationName: string, total: number): (processed: number) => void {
    if (!this.config.enableProgressLogging) {
      return () => {}; // No-op
    }

    let lastLogTime = 0;
    return (processed: number) => {
      const now = Date.now();
      if (now - lastLogTime >= this.config.progressLogInterval) {
        const percent = ((processed / total) * 100).toFixed(1);
        this.logger.debug(`Progress: ${operationName}`, {
          processed,
          total,
          percent: `${percent}%`,
        });
        lastLogTime = now;
      }
    };
  }

  private async* createConcurrentBatchProcessor<T>(
    batches: TInput[][],
    operation: BatchOperation<TInput, T>
  ): AsyncGenerator<Array<{ item: TInput; success: boolean; result?: T; error?: Error }>> {
    const semaphore = new Semaphore(this.config.maxConcurrency);
    const promises: Promise<Array<{ item: TInput; success: boolean; result?: T; error?: Error }>>[] = [];

    for (const batch of batches) {
      const promise = semaphore.acquire().then(async (release) => {
        try {
          return await this.processSingleBatch(batch, operation);
        } finally {
          release();
        }
      });
      promises.push(promise);
    }

    // Yield results as they complete
    for (const promise of promises) {
      yield await promise;
    }
  }

  private async processSingleBatch<T>(
    batch: TInput[],
    operation: BatchOperation<TInput, T>
  ): Promise<Array<{ item: TInput; success: boolean; result?: T; error?: Error }>> {
    const results: Array<{ item: TInput; success: boolean; result?: T; error?: Error }> = [];
    
    let attempt = 0;
    while (attempt <= this.config.retryCount) {
      try {
        const batchResults = await Promise.race([
          operation.process(batch),
          this.createTimeoutPromise<T[]>(this.config.timeoutMs),
        ]);

        // Successful batch processing
        for (let i = 0; i < batch.length; i++) {
          results.push({
            item: batch[i],
            success: true,
            result: batchResults[i],
          });
        }
        break;
      } catch (error) {
        attempt++;
        if (attempt > this.config.retryCount) {
          // Final failure - mark all items as failed
          for (const item of batch) {
            results.push({
              item,
              success: false,
              error: error as Error,
            });
          }
        } else {
          // Retry with delay
          await this.delay(this.config.retryDelayMs * attempt);
          this.logger.debug(`Retrying batch (attempt ${attempt}/${this.config.retryCount})`);
        }
      }
    }

    return results;
  }

  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve(() => this.release());
      } else {
        this.waitQueue.push(() => {
          this.permits--;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      const nextWaiter = this.waitQueue.shift();
      if (nextWaiter) {
        nextWaiter();
      }
    }
  }
}

/**
 * Specialized batch operations for common patterns
 */

/**
 * Database batch insert operation
 */
export class DatabaseBatchInsertOperation<T> implements BatchOperation<T, void> {
  constructor(
    private insertFn: (items: T[]) => Promise<void>,
    private operationName: string
  ) {}

  async process(items: T[]): Promise<void[]> {
    await this.insertFn(items);
    return new Array(items.length).fill(undefined);
  }

  getOperationName(): string {
    return this.operationName;
  }
}

/**
 * Mapping operation for transforming items
 */
export class MappingOperation<TInput, TOutput> implements BatchOperation<TInput, TOutput> {
  constructor(
    private mapFn: (item: TInput) => Promise<TOutput> | TOutput,
    private operationName: string
  ) {}

  async process(items: TInput[]): Promise<TOutput[]> {
    const results = await Promise.all(items.map(item => Promise.resolve(this.mapFn(item))));
    return results;
  }

  getOperationName(): string {
    return this.operationName;
  }
}

/**
 * Filtering operation for processing subsets
 */
export class FilteringOperation<T> implements BatchOperation<T, T | null> {
  constructor(
    private filterFn: (item: T) => Promise<boolean> | boolean,
    private operationName: string
  ) {}

  async process(items: T[]): Promise<(T | null)[]> {
    const results = await Promise.all(
      items.map(async item => {
        const shouldInclude = await Promise.resolve(this.filterFn(item));
        return shouldInclude ? item : null;
      })
    );
    return results;
  }

  getOperationName(): string {
    return this.operationName;
  }
}

/**
 * Validation operation for checking items
 */
export class ValidationOperation<T> implements BatchOperation<T, { item: T; valid: boolean; errors: string[] }> {
  constructor(
    private validateFn: (item: T) => Promise<string[]> | string[],
    private operationName: string
  ) {}

  async process(items: T[]): Promise<Array<{ item: T; valid: boolean; errors: string[] }>> {
    const results = await Promise.all(
      items.map(async item => {
        const errors = await Promise.resolve(this.validateFn(item));
        return {
          item,
          valid: errors.length === 0,
          errors,
        };
      })
    );
    return results;
  }

  getOperationName(): string {
    return this.operationName;
  }
}

/**
 * Utility functions for common batch processing patterns
 */
export class BatchUtilities {
  private static logger = createLogger("BatchUtilities");

  /**
   * Process items in chunks with a simple function
   */
  static async processInChunks<T, R>(
    items: T[],
    chunkSize: number,
    processFn: (chunk: T[]) => Promise<R[]>,
    operationName: string = "processInChunks"
  ): Promise<R[]> {
    const processor = new BatchProcessor<T[], R[]>({ 
      batchSize: 1 // Process one chunk at a time
    });
    
    // Convert to batch format
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    // Use the batch processor with the mapping operation
    const operation = new MappingOperation<T[], R[]>(processFn, operationName);
    const results = await processor.processBatches(chunks, operation);
    
    // Extract successful results and flatten
    return results.results
      .filter(r => r.success && r.result)
      .map(r => r.result)
      .flat();
  }

  /**
   * Deduplicate items based on a key function
   */
  static deduplicateByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    
    for (const item of items) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    
    this.logger.debug(`Deduplicated items: ${items.length} -> ${result.length}`);
    return result;
  }

  /**
   * Group items by a key function
   */
  static groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    
    for (const item of items) {
      const key = keyFn(item);
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
    
    return groups;
  }

  /**
   * Process items with progress reporting
   */
  static async processWithProgress<T, R>(
    items: T[],
    processFn: (item: T) => Promise<R>,
    progressCallback: (processed: number, total: number) => void,
    operationName: string = "processWithProgress"
  ): Promise<R[]> {
    const logger = createLogger(`BatchUtilities:${operationName}`);
    const results: R[] = [];
    
    logger.debug(`Starting ${operationName} with ${items.length} items`);
    
    for (let i = 0; i < items.length; i++) {
      const result = await processFn(items[i]);
      results.push(result);
      progressCallback(i + 1, items.length);
    }
    
    logger.debug(`Completed ${operationName}`, { totalItems: items.length });
    return results;
  }

  /**
   * Merge multiple batch processing results
   */
  static mergeBatchResults<T>(
    results: BatchProcessingResult<T>[]
  ): BatchProcessingResult<T> {
    const merged: BatchProcessingResult<T> = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      duration: 0,
      results: [],
    };

    for (const result of results) {
      merged.processed += result.processed;
      merged.succeeded += result.succeeded;
      merged.failed += result.failed;
      merged.errors.push(...result.errors);
      merged.duration = Math.max(merged.duration, result.duration);
      merged.results.push(...result.results);
    }

    return merged;
  }
}

/**
 * Factory functions for creating common batch operations
 */
export function createBatchProcessor<TInput, TOutput = any>(
  config?: BatchProcessingConfig
): BatchProcessor<TInput, TOutput> {
  return new BatchProcessor<TInput, TOutput>(config);
}

export function createDatabaseBatchInsert<T>(
  insertFn: (items: T[]) => Promise<void>,
  operationName: string
): DatabaseBatchInsertOperation<T> {
  return new DatabaseBatchInsertOperation(insertFn, operationName);
}

export function createMappingOperation<TInput, TOutput>(
  mapFn: (item: TInput) => Promise<TOutput> | TOutput,
  operationName: string
): MappingOperation<TInput, TOutput> {
  return new MappingOperation(mapFn, operationName);
}

export function createFilteringOperation<T>(
  filterFn: (item: T) => Promise<boolean> | boolean,
  operationName: string
): FilteringOperation<T> {
  return new FilteringOperation(filterFn, operationName);
}

export function createValidationOperation<T>(
  validateFn: (item: T) => Promise<string[]> | string[],
  operationName: string
): ValidationOperation<T> {
  return new ValidationOperation(validateFn, operationName);
}