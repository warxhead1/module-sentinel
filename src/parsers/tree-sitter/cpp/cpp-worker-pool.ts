/**
 * C++ Worker Pool
 * 
 * Manages multithreaded processing of C++ files using worker threads.
 * Provides load balancing, error handling, and progress tracking.
 */

import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import { Logger, createLogger } from "../../../utils/logger.js";
import { MemoryMonitor, getGlobalMemoryMonitor } from "../../../utils/memory-monitor.js";
import { 
  CppWorkItem, 
  CppWorkerResult, 
  CppParseResult,
  CppParsingOptions 
} from "./cpp-types.js";

export interface WorkerPoolOptions {
  maxWorkers?: number;
  queueTimeout?: number; // in milliseconds
  workerTimeout?: number; // in milliseconds
  retryAttempts?: number;
  enableLoadBalancing?: boolean;
  memoryThreshold?: number; // MB
}

export interface WorkerStats {
  workerId: number;
  isActive: boolean;
  tasksCompleted: number;
  tasksErrored: number;
  averageProcessingTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface PoolStats {
  totalWorkers: number;
  activeWorkers: number;
  queueSize: number;
  totalTasksProcessed: number;
  totalErrors: number;
  averageProcessingTime: number;
  throughputPerSecond: number;
}

class CppWorker {
  private worker: Worker;
  private isActive: boolean = false;
  private tasksCompleted: number = 0;
  private tasksErrored: number = 0;
  private totalProcessingTime: number = 0;
  private logger: Logger;
  private workerId: number;

  constructor(workerId: number, workerScript: string) {
    this.workerId = workerId;
    this.logger = createLogger(`CppWorker-${workerId}`);
    
    this.worker = new Worker(workerScript, {
      workerData: { workerId }
    });

    this.setupWorkerHandlers();
  }

  private setupWorkerHandlers(): void {
    this.worker.on('error', (error) => {
      this.logger.error('Worker error', error, { workerId: this.workerId });
      this.isActive = false;
    });

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        this.logger.error('Worker exited with error', undefined, { 
          workerId: this.workerId, 
          code 
        });
      }
      this.isActive = false;
    });
  }

  async processTask(
    workItem: CppWorkItem, 
    timeout: number
  ): Promise<CppWorkerResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      this.isActive = true;

      const timeoutHandle = setTimeout(() => {
        this.worker.terminate();
        this.tasksErrored++;
        this.isActive = false;
        reject(new Error(`Worker timeout after ${timeout}ms`));
      }, timeout);

      const messageHandler = (result: CppWorkerResult) => {
        clearTimeout(timeoutHandle);
        this.isActive = false;
        
        const processingTime = Date.now() - startTime;
        this.totalProcessingTime += processingTime;
        
        if (result.error) {
          this.tasksErrored++;
          reject(result.error);
        } else {
          this.tasksCompleted++;
          resolve(result);
        }
      };

      const errorHandler = (error: Error) => {
        clearTimeout(timeoutHandle);
        this.isActive = false;
        this.tasksErrored++;
        reject(error);
      };

      this.worker.once('message', messageHandler);
      this.worker.once('error', errorHandler);

      // Send work to the worker
      this.worker.postMessage(workItem);
    });
  }

  getStats(): WorkerStats {
    return {
      workerId: this.workerId,
      isActive: this.isActive,
      tasksCompleted: this.tasksCompleted,
      tasksErrored: this.tasksErrored,
      averageProcessingTime: this.tasksCompleted > 0 ? 
        this.totalProcessingTime / this.tasksCompleted : 0,
      memoryUsage: 0, // Would need to implement memory tracking
      cpuUsage: 0 // Would need to implement CPU tracking
    };
  }

  async terminate(): Promise<void> {
    await this.worker.terminate();
    this.isActive = false;
  }

  get id(): number {
    return this.workerId;
  }

  get active(): boolean {
    return this.isActive;
  }
}

export class CppWorkerPool {
  private logger: Logger;
  private memoryMonitor: MemoryMonitor;
  private workers: CppWorker[] = [];
  private workQueue: Array<{
    workItem: CppWorkItem;
    resolve: (result: CppWorkerResult) => void;
    reject: (error: Error) => void;
    retryCount: number;
    queuedAt: number;
  }> = [];
  
  private options: Required<WorkerPoolOptions>;
  private isShuttingDown: boolean = false;
  private totalTasksProcessed: number = 0;
  private totalErrors: number = 0;
  private startTime: number = Date.now();

  constructor(options: WorkerPoolOptions = {}) {
    this.logger = createLogger('CppWorkerPool');
    this.memoryMonitor = getGlobalMemoryMonitor();
    
    this.options = {
      maxWorkers: options.maxWorkers || Math.max(1, os.cpus().length - 1),
      queueTimeout: options.queueTimeout || 30000, // 30 seconds
      workerTimeout: options.workerTimeout || 120000, // 2 minutes
      retryAttempts: options.retryAttempts || 2,
      enableLoadBalancing: options.enableLoadBalancing ?? true,
      memoryThreshold: options.memoryThreshold || 1024 // 1GB
    };

    this.logger.info('Initializing C++ worker pool', {
      maxWorkers: this.options.maxWorkers,
      enableLoadBalancing: this.options.enableLoadBalancing
    });
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    const checkpoint = this.memoryMonitor.createCheckpoint('initializeWorkerPool');
    
    try {
      const workerScript = this.createWorkerScript();
      
      // Create workers
      for (let i = 0; i < this.options.maxWorkers; i++) {
        const worker = new CppWorker(i, workerScript);
        this.workers.push(worker);
      }

      // Start processing queue
      this.startQueueProcessor();

      this.logger.info('Worker pool initialized', {
        workers: this.workers.length
      });

    } catch (error) {
      this.logger.error('Failed to initialize worker pool', error);
      throw error;
    } finally {
      checkpoint.complete();
    }
  }

  /**
   * Process a C++ file using the worker pool
   */
  async processFile(
    filePath: string,
    content: string,
    options: CppParsingOptions = {},
    priority: number = 0
  ): Promise<CppParseResult> {
    
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    const workItem: CppWorkItem = {
      filePath,
      content,
      options,
      priority,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      // Check memory usage before queuing
      const memStats = this.memoryMonitor.getMemoryStats();
      if (memStats.heapUsed / 1024 / 1024 > this.options.memoryThreshold) {
        reject(new Error('Memory threshold exceeded, cannot queue more work'));
        return;
      }

      const queueItem = {
        workItem,
        resolve: (result: CppWorkerResult) => resolve(result.result),
        reject,
        retryCount: 0,
        queuedAt: Date.now()
      };

      // Insert based on priority
      if (priority > 0 && this.options.enableLoadBalancing) {
        const insertIndex = this.workQueue.findIndex(item => item.workItem.priority < priority);
        if (insertIndex === -1) {
          this.workQueue.push(queueItem);
        } else {
          this.workQueue.splice(insertIndex, 0, queueItem);
        }
      } else {
        this.workQueue.push(queueItem);
      }

      this.logger.debug('Work item queued', {
        file: filePath,
        priority,
        queueSize: this.workQueue.length
      });
    });
  }

  /**
   * Process multiple files concurrently
   */
  async processFiles(
    files: Array<{ filePath: string; content: string; options?: CppParsingOptions; priority?: number }>
  ): Promise<Map<string, CppParseResult | Error>> {
    
    const results = new Map<string, CppParseResult | Error>();
    const promises = files.map(async (file) => {
      try {
        const result = await this.processFile(
          file.filePath, 
          file.content, 
          file.options, 
          file.priority
        );
        results.set(file.filePath, result);
      } catch (error) {
        results.set(file.filePath, error as Error);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get worker pool statistics
   */
  getStats(): PoolStats {
    const workerStats = this.workers.map(w => w.getStats());
    const activeWorkers = workerStats.filter(s => s.isActive).length;
    const totalCompleted = workerStats.reduce((sum, s) => sum + s.tasksCompleted, 0);
    const totalProcessingTime = workerStats.reduce((sum, s) => 
      sum + (s.tasksCompleted * s.averageProcessingTime), 0);
    
    const avgProcessingTime = totalCompleted > 0 ? totalProcessingTime / totalCompleted : 0;
    const runtimeSeconds = (Date.now() - this.startTime) / 1000;
    const throughput = runtimeSeconds > 0 ? this.totalTasksProcessed / runtimeSeconds : 0;

    return {
      totalWorkers: this.workers.length,
      activeWorkers,
      queueSize: this.workQueue.length,
      totalTasksProcessed: this.totalTasksProcessed,
      totalErrors: this.totalErrors,
      averageProcessingTime: avgProcessingTime,
      throughputPerSecond: throughput
    };
  }

  /**
   * Get individual worker statistics
   */
  getWorkerStats(): WorkerStats[] {
    return this.workers.map(w => w.getStats());
  }

  /**
   * Shutdown the worker pool
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down worker pool');
    this.isShuttingDown = true;

    // Clear remaining queue
    for (const item of this.workQueue) {
      item.reject(new Error('Worker pool shutting down'));
    }
    this.workQueue.length = 0;

    // Terminate all workers
    const terminationPromises = this.workers.map(worker => worker.terminate());
    await Promise.allSettled(terminationPromises);

    this.workers.length = 0;
    this.logger.info('Worker pool shutdown complete');
  }

  // Private methods

  private createWorkerScript(): string {
    // In a real implementation, this would point to a separate worker file
    // For now, we'll use the current file and check if we're in a worker
    return __filename;
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      this.processQueue();
    }, 100); // Check queue every 100ms

    // Also process queue immediately when items are added
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isShuttingDown || this.workQueue.length === 0) {
      return;
    }

    // Find available workers
    const availableWorkers = this.workers.filter(w => !w.active);
    if (availableWorkers.length === 0) {
      return;
    }

    // Process as many items as we have available workers
    const itemsToProcess = Math.min(availableWorkers.length, this.workQueue.length);
    
    for (let i = 0; i < itemsToProcess; i++) {
      const queueItem = this.workQueue.shift();
      const worker = availableWorkers[i];
      
      if (!queueItem || !worker) continue;

      // Check for queue timeout
      const queueTime = Date.now() - queueItem.queuedAt;
      if (queueTime > this.options.queueTimeout) {
        queueItem.reject(new Error(`Queue timeout after ${queueTime}ms`));
        continue;
      }

      // Process the work item
      this.processWorkItem(worker, queueItem);
    }
  }

  private async processWorkItem(
    worker: CppWorker,
    queueItem: typeof this.workQueue[0]
  ): Promise<void> {
    
    try {
      this.logger.debug('Processing work item', {
        worker: worker.id,
        file: queueItem.workItem.filePath
      });

      const result = await worker.processTask(queueItem.workItem, this.options.workerTimeout);
      
      this.totalTasksProcessed++;
      queueItem.resolve(result);

      this.logger.debug('Work item completed', {
        worker: worker.id,
        file: queueItem.workItem.filePath,
        processingTime: result.processingTime
      });

    } catch (error) {
      this.logger.error('Work item failed', error, {
        worker: worker.id,
        file: queueItem.workItem.filePath,
        retryCount: queueItem.retryCount
      });

      // Retry logic
      if (queueItem.retryCount < this.options.retryAttempts) {
        queueItem.retryCount++;
        queueItem.queuedAt = Date.now();
        
        // Add back to queue for retry (with lower priority)
        this.workQueue.push(queueItem);
        
        this.logger.debug('Work item queued for retry', {
          file: queueItem.workItem.filePath,
          retryCount: queueItem.retryCount
        });
      } else {
        this.totalErrors++;
        queueItem.reject(error as Error);
      }
    }
  }

  /**
   * Adjust worker pool size dynamically
   */
  async adjustPoolSize(newSize: number): Promise<void> {
    if (newSize < 1) {
      throw new Error('Pool size must be at least 1');
    }

    const currentSize = this.workers.length;
    
    if (newSize > currentSize) {
      // Add workers
      const workerScript = this.createWorkerScript();
      for (let i = currentSize; i < newSize; i++) {
        const worker = new CppWorker(i, workerScript);
        this.workers.push(worker);
      }
      
      this.logger.info('Added workers to pool', {
        added: newSize - currentSize,
        newSize
      });
    } else if (newSize < currentSize) {
      // Remove workers (terminate inactive ones first)
      const workersToRemove = this.workers.slice(newSize);
      const terminationPromises = workersToRemove.map(w => w.terminate());
      await Promise.allSettled(terminationPromises);
      
      this.workers = this.workers.slice(0, newSize);
      
      this.logger.info('Removed workers from pool', {
        removed: currentSize - newSize,
        newSize
      });
    }

    this.options.maxWorkers = newSize;
  }
}

// Worker thread code (would normally be in a separate file)
if (require.main !== module) {
  // This is being imported, not executed as main
} else {
  // This is the main worker thread entry point
  const { parentPort, workerData } = require('worker_threads');
  
  if (parentPort && workerData) {
    const workerId = workerData.workerId;
    const logger = createLogger(`CppWorker-${workerId}-Thread`);
    
    parentPort.on('message', async (workItem: CppWorkItem) => {
      const startTime = Date.now();
      
      try {
        logger.debug('Worker processing file', {
          worker: workerId,
          file: workItem.filePath
        });

        // Import the main parser (would need to be async in real implementation)
        // const { OptimizedCppTreeSitterParser } = await import('./optimized-cpp-parser.js');
        
        // For now, simulate processing
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
        
        const result: CppWorkerResult = {
          workItem,
          result: {
            symbols: [],
            relationships: [],
            patterns: [],
            controlFlowData: { blocks: [], calls: [] },
            stats: {
              nodesVisited: 0,
              symbolsExtracted: 0,
              complexityChecks: 0,
              controlFlowAnalyzed: 0
            }
          },
          processingTime: Date.now() - startTime,
          memoryUsed: process.memoryUsage().heapUsed,
          workerId
        };

        parentPort.postMessage(result);
        
      } catch (error) {
        const result: CppWorkerResult = {
          workItem,
          result: {
            symbols: [],
            relationships: [],
            patterns: [],
            controlFlowData: { blocks: [], calls: [] },
            stats: {
              nodesVisited: 0,
              symbolsExtracted: 0,
              complexityChecks: 0,
              controlFlowAnalyzed: 0
            }
          },
          error: error as Error,
          processingTime: Date.now() - startTime,
          memoryUsed: process.memoryUsage().heapUsed,
          workerId
        };

        parentPort.postMessage(result);
      }
    });
  }
}