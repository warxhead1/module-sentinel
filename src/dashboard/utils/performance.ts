/**
 * Performance utilities for dashboard components
 */

/**
 * Debounce function to limit the rate at which a function can fire
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func(...args);
  };
}

/**
 * Throttle function to ensure function is called at most once per specified time period
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastFunc: NodeJS.Timeout | null = null;
  let lastRan: number;

  return function executedFunction(...args: Parameters<T>) {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
      if (lastFunc) clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func(...args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

/**
 * Simple performance timer
 */
export class PerformanceTimer {
  private startTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  end(label?: string): number {
    const elapsed = performance.now() - this.startTime;
    if (label) {
    }
    return elapsed;
  }
}

/**
 * Measure execution time of a function
 */
export function measureTime<T>(fn: () => T, label?: string): T {
  const timer = new PerformanceTimer();
  timer.start();
  const result = fn();
  timer.end(label);
  return result;
}

/**
 * Measure execution time of an async function
 */
export async function measureTimeAsync<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<T> {
  const timer = new PerformanceTimer();
  timer.start();
  const result = await fn();
  timer.end(label);
  return result;
}
