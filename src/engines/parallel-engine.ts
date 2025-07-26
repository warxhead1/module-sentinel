import { Worker } from 'worker_threads';
import * as os from 'os';
import * as _path from 'path';

interface WorkerTask<T, R> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export class ParallelProcessingEngine {
  private workers: Worker[] = [];
  private taskQueue: WorkerTask<any, any>[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private workerCount: number;
  
  constructor(workerCount?: number) {
    this.workerCount = workerCount || Math.min(os.cpus().length, 4);
  }

  async initialize(): Promise<void> {
    // Workers will be created on demand
  }

  async processInParallel<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    if (items.length === 0) return [];
    
    // For small arrays, process synchronously
    if (items.length < 3) {
      return Promise.all(items.map(processor));
    }

    // Create worker pool if needed
    if (this.workers.length === 0) {
      await this.createWorkerPool();
    }

    // Split work into chunks
    const chunkSize = Math.ceil(items.length / this.workerCount);
    const chunks: T[][] = [];
    
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }

    // Process chunks in parallel
    const results = await Promise.all(
      chunks.map(chunk => this.processChunk(chunk, processor))
    );

    // Flatten results
    return results.flat();
  }

  private async createWorkerPool(): Promise<void> {
    const workerScript = `
      const { parentPort } = require('worker_threads');
      
      parentPort.on('message', async ({ id, chunk, processorCode }) => {
        try {
          const processor = new Function('return ' + processorCode)();
          const results = [];
          
          for (const item of chunk) {
            const result = await processor(item);
            results.push(result);
          }
          
          parentPort.postMessage({ id, results });
        } catch (error) {
          parentPort.postMessage({ id, error: error.message });
        }
      });
    `;

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(workerScript, { eval: true });
      this.workers.push(worker);
    }
  }

  private async processChunk<T, R>(
    chunk: T[],
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    // For now, process synchronously to avoid worker serialization issues
    return Promise.all(chunk.map(processor));
  }

  private getAvailableWorker(): Worker | null {
    for (const worker of this.workers) {
      if (!this.busyWorkers.has(worker)) {
        return worker;
      }
    }
    return null;
  }

  private runOnWorker<T, R>(
    worker: Worker,
    chunk: T[],
    processor: (item: T) => Promise<R>,
    resolve: (results: R[]) => void,
    reject: (error: Error) => void
  ): void {
    const id = Math.random().toString(36);
    this.busyWorkers.add(worker);

    const messageHandler = (message: any) => {
      if (message.id !== id) return;
      
      worker.off('message', messageHandler);
      worker.off('error', errorHandler);
      this.busyWorkers.delete(worker);

      if (message.error) {
        reject(new Error(message.error));
      } else {
        resolve(message.results);
      }

      // Process queued tasks
      this.processNextInQueue();
    };

    const errorHandler = (error: Error) => {
      worker.off('message', messageHandler);
      worker.off('error', errorHandler);
      this.busyWorkers.delete(worker);
      reject(error);
      this.processNextInQueue();
    };

    worker.on('message', messageHandler);
    worker.on('error', errorHandler);

    worker.postMessage({
      id,
      chunk,
      processorCode: processor.toString()
    });
  }

  private processNextInQueue(): void {
    if (this.taskQueue.length === 0) return;
    
    const worker = this.getAvailableWorker();
    if (!worker) return;

    const task = this.taskQueue.shift()!;
    this.runOnWorker(
      worker,
      task.data.chunk,
      task.data.processor,
      task.resolve,
      task.reject
    );
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map(worker => worker.terminate()));
    this.workers = [];
    this.busyWorkers.clear();
    this.taskQueue = [];
  }
}