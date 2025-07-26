/**
 * Memory Monitor
 * 
 * Tracks memory usage during file processing and can trigger
 * garbage collection or processing adjustments when thresholds are exceeded
 */

import { createLogger, Logger } from './logger.js';
import { getTimeout } from '../config/timeout-config.js';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  percentUsed: number;
  // Convenient MB values
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  // Browser compatibility flag
  isBrowserMock?: boolean;
}

export interface MemoryThresholds {
  warningPercent: number;  // Warn when heap usage exceeds this percentage
  criticalPercent: number; // Take action when heap usage exceeds this percentage
  maxHeapMB: number;       // Maximum heap size in MB before taking action
}

export class MemoryMonitor {
  private logger: Logger;
  private thresholds: MemoryThresholds;
  private lastGC: number = 0;
  private gcMinInterval: number;
  private checkInterval?: NodeJS.Timeout;
  private callbacks: Map<string, (stats: MemoryStats) => void> = new Map();

  constructor(thresholds?: Partial<MemoryThresholds>) {
    this.logger = createLogger('MemoryMonitor');
    this.gcMinInterval = getTimeout('memory', 'gcMinInterval', 30000);
    this.thresholds = {
      warningPercent: 70,
      criticalPercent: 85,
      maxHeapMB: 2048, // 2GB default
      ...thresholds
    };
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    // Browser compatibility: return mock data if process is not available
    if (typeof process === 'undefined' || !process.memoryUsage) {
      return this.getBrowserMemoryStats();
    }

    const usage = process.memoryUsage();
    const heapTotal = usage.heapTotal;
    const heapUsed = usage.heapUsed;
    const percentUsed = (heapUsed / heapTotal) * 100;

    return {
      heapUsed,
      heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers || 0,
      percentUsed,
      // Calculate MB values for convenience
      heapUsedMB: heapUsed / 1024 / 1024,
      heapTotalMB: heapTotal / 1024 / 1024,
      rssMB: usage.rss / 1024 / 1024
    };
  }

  /**
   * Get mock memory statistics for browser environment
   */
  private getBrowserMemoryStats(): MemoryStats {
    // Use performance.memory if available (Chrome/Edge)
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      const heapUsed = memory.usedJSHeapSize || 0;
      const heapTotal = memory.totalJSHeapSize || memory.jsHeapSizeLimit || 64 * 1024 * 1024; // 64MB default
      const percentUsed = heapTotal > 0 ? (heapUsed / heapTotal) * 100 : 0;

      return {
        heapUsed,
        heapTotal,
        external: 0,
        rss: heapUsed, // Approximate RSS as heap used in browser
        arrayBuffers: 0,
        percentUsed,
        heapUsedMB: heapUsed / 1024 / 1024,
        heapTotalMB: heapTotal / 1024 / 1024,
        rssMB: heapUsed / 1024 / 1024,
        isBrowserMock: true
      };
    }

    // Fallback mock data for browsers without performance.memory
    const mockHeapTotal = 64 * 1024 * 1024; // 64MB
    const mockHeapUsed = 16 * 1024 * 1024;  // 16MB
    const percentUsed = (mockHeapUsed / mockHeapTotal) * 100;

    return {
      heapUsed: mockHeapUsed,
      heapTotal: mockHeapTotal,
      external: 0,
      rss: mockHeapUsed,
      arrayBuffers: 0,
      percentUsed,
      heapUsedMB: mockHeapUsed / 1024 / 1024,
      heapTotalMB: mockHeapTotal / 1024 / 1024,
      rssMB: mockHeapUsed / 1024 / 1024,
      isBrowserMock: true
    };
  }

  /**
   * Format memory size for display
   */
  private formatMemory(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  /**
   * Check memory usage and take action if needed
   */
  checkMemory(): MemoryStats {
    const stats = this.getMemoryStats();
    const heapUsedMB = stats.heapUsed / 1024 / 1024;

    // Log current memory usage
    this.logger.debug('Memory usage', {
      heapUsed: this.formatMemory(stats.heapUsed),
      heapTotal: this.formatMemory(stats.heapTotal),
      percentUsed: `${stats.percentUsed.toFixed(1)}%`,
      rss: this.formatMemory(stats.rss)
    });

    // Check thresholds
    if (stats.percentUsed > this.thresholds.criticalPercent || 
        heapUsedMB > this.thresholds.maxHeapMB) {
      this.logger.error('Critical memory usage detected', undefined, {
        percentUsed: `${stats.percentUsed.toFixed(1)}%`,
        heapUsed: this.formatMemory(stats.heapUsed),
        threshold: `${this.thresholds.criticalPercent}%`
      });
      
      // Try to free memory
      this.triggerGarbageCollection();
      
      // Notify callbacks
      this.notifyCallbacks(stats);
    } else if (stats.percentUsed > this.thresholds.warningPercent) {
      this.logger.warn('High memory usage detected', {
        percentUsed: `${stats.percentUsed.toFixed(1)}%`,
        heapUsed: this.formatMemory(stats.heapUsed),
        threshold: `${this.thresholds.warningPercent}%`
      });
    }

    return stats;
  }

  /**
   * Trigger garbage collection if available and not too recent
   */
  private triggerGarbageCollection(): boolean {
    // Browser compatibility: skip GC in browser environments
    if (typeof global === 'undefined' || !global.gc) {
      if (typeof process !== 'undefined') {
        this.logger.warn('Garbage collection not available. Run Node with --expose-gc flag');
      } else {
        this.logger.debug('Garbage collection not available in browser environment');
      }
      return false;
    }

    const now = Date.now();
    if (now - this.lastGC < this.gcMinInterval) {
      this.logger.debug('Skipping GC - too recent', {
        lastGC: new Date(this.lastGC).toISOString(),
        minInterval: `${this.gcMinInterval}ms`
      });
      return false;
    }

    this.logger.info('Triggering garbage collection');
    const before = this.getMemoryStats();
    
    global.gc();
    this.lastGC = now;
    
    const after = this.getMemoryStats();
    const freedMB = (before.heapUsed - after.heapUsed) / 1024 / 1024;
    
    this.logger.info('Garbage collection completed', {
      freed: `${freedMB.toFixed(2)} MB`,
      heapBefore: this.formatMemory(before.heapUsed),
      heapAfter: this.formatMemory(after.heapUsed)
    });

    return true;
  }

  /**
   * Start automatic memory monitoring
   */
  startMonitoring(intervalMs?: number): void {
    const interval = intervalMs || getTimeout('memory', 'checkInterval', 30000);
    if (this.checkInterval) {
      this.stopMonitoring();
    }

    // Skip monitoring in browser environments to avoid performance issues
    if (typeof process === 'undefined') {
      this.logger.debug('Skipping memory monitoring in browser environment');
      return;
    }

    this.logger.info('Starting memory monitoring', {
      interval: `${interval}ms`,
      thresholds: this.thresholds
    });

    this.checkInterval = setInterval(() => {
      this.checkMemory();
    }, interval);
  }

  /**
   * Stop automatic memory monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      this.logger.info('Stopped memory monitoring');
    }
  }

  /**
   * Register a callback for memory threshold events
   */
  onThresholdExceeded(id: string, callback: (stats: MemoryStats) => void): void {
    this.callbacks.set(id, callback);
  }

  /**
   * Unregister a callback
   */
  removeCallback(id: string): void {
    this.callbacks.delete(id);
  }

  /**
   * Notify all registered callbacks
   */
  private notifyCallbacks(stats: MemoryStats): void {
    for (const [id, callback] of this.callbacks) {
      try {
        callback(stats);
      } catch (error) {
        this.logger.error(`Callback ${id} failed`, error);
      }
    }
  }

  /**
   * Create a memory checkpoint for tracking usage over an operation
   */
  createCheckpoint(name: string): MemoryCheckpoint {
    return new MemoryCheckpoint(name, this);
  }

  /**
   * Suggest memory-saving strategies based on current usage
   */
  getSuggestions(stats: MemoryStats): string[] {
    const suggestions: string[] = [];

    if (stats.percentUsed > this.thresholds.warningPercent) {
      suggestions.push('Consider processing files in smaller batches');
      suggestions.push('Clear caches between large operations');
      suggestions.push('Reduce concurrent file processing');
    }

    if (stats.external > stats.heapUsed * 0.5) {
      suggestions.push('High external memory usage - check for native module leaks');
    }

    if (stats.arrayBuffers > stats.heapUsed * 0.3) {
      suggestions.push('High ArrayBuffer usage - consider streaming instead of buffering');
    }

    return suggestions;
  }
}

/**
 * Memory checkpoint for tracking usage over an operation
 */
export class MemoryCheckpoint {
  private name: string;
  private monitor: MemoryMonitor;
  private startStats: MemoryStats;
  private startTime: number;
  private logger: Logger;

  constructor(name: string, monitor: MemoryMonitor) {
    this.name = name;
    this.monitor = monitor;
    this.startStats = monitor.getMemoryStats();
    this.startTime = Date.now();
    this.logger = createLogger(`MemoryCheckpoint:${name}`);
    
    // Only log checkpoint creation for high memory usage operations
    if (this.startStats.percentUsed > 70) {
      this.logger.debug('High memory checkpoint created', {
        heapUsed: `${(this.startStats.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        percentUsed: `${this.startStats.percentUsed.toFixed(1)}%`
      });
    }
  }

  /**
   * Complete the checkpoint and log memory usage
   */
  complete(): { duration: number; memoryDelta: number; percentDelta: number } {
    const endStats = this.monitor.getMemoryStats();
    const duration = Date.now() - this.startTime;
    const memoryDelta = endStats.heapUsed - this.startStats.heapUsed;
    const percentDelta = endStats.percentUsed - this.startStats.percentUsed;

    // Only log INFO if memory change is very significant (> 50MB or > 15% change or long duration)
    const memoryDeltaMB = memoryDelta / 1024 / 1024;
    const shouldLogInfo = Math.abs(memoryDeltaMB) > 50 || Math.abs(percentDelta) > 15 || duration > 2000;
    
    // Use debug logging for moderate changes (> 25MB or > 10% or > 1000ms)
    const shouldLogDebug = !shouldLogInfo && (Math.abs(memoryDeltaMB) > 25 || Math.abs(percentDelta) > 10 || duration > 1000);

    if (shouldLogInfo) {
      this.logger.info('Checkpoint completed', {
        duration,
        memoryDelta: `${memoryDeltaMB.toFixed(2)} MB`,
        percentDelta: `${percentDelta.toFixed(1)}%`,
        finalHeap: `${(endStats.heapUsed / 1024 / 1024).toFixed(2)} MB`
      });
    } else if (shouldLogDebug) {
      this.logger.debug('Checkpoint completed', {
        duration,
        memoryDelta: `${memoryDeltaMB.toFixed(2)} MB`,
        percentDelta: `${percentDelta.toFixed(1)}%`,
        finalHeap: `${(endStats.heapUsed / 1024 / 1024).toFixed(2)} MB`
      });
    }

    // Warn if operation used significant memory
    if (memoryDelta > 50 * 1024 * 1024) { // 50MB
      this.logger.warn('Operation used significant memory', {
        operation: this.name,
        memoryUsed: `${(memoryDelta / 1024 / 1024).toFixed(2)} MB`
      });
    }

    return { duration, memoryDelta, percentDelta };
  }
}

// Global memory monitor instance
let globalMonitor: MemoryMonitor | undefined;

export function getGlobalMemoryMonitor(thresholds?: Partial<MemoryThresholds>): MemoryMonitor {
  if (!globalMonitor) {
    globalMonitor = new MemoryMonitor(thresholds);
  }
  return globalMonitor;
}

// Export convenience functions
export const checkMemory = () => getGlobalMemoryMonitor().checkMemory();
export const startMemoryMonitoring = (interval?: number) => 
  getGlobalMemoryMonitor().startMonitoring(interval);
export const stopMemoryMonitoring = () => 
  getGlobalMemoryMonitor().stopMonitoring();