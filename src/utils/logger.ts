/**
 * Structured logger for Module Sentinel
 * Provides consistent logging with levels, context, and optional assertions
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  component?: string;
  operation?: string;
  file?: string;
  symbolName?: string;
  duration?: number;
  count?: number;
  [key: string]: any;
}

interface ErrorGroup {
  type: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  contexts: LogContext[];
  samples: Array<{ error: any; context: LogContext; timestamp: number }>;
}

class ErrorAggregator {
  private errorGroups = new Map<string, ErrorGroup>();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 2000; // 2 seconds
  private readonly MAX_SAMPLES = 3; // Keep only first 3 samples per group

  addError(error: any, context: LogContext = {}) {
    const errorKey = this.getErrorKey(error, context);
    const now = Date.now();

    if (!this.errorGroups.has(errorKey)) {
      this.errorGroups.set(errorKey, {
        type: this.getErrorType(error),
        message: this.getErrorMessage(error),
        count: 0,
        firstSeen: now,
        lastSeen: now,
        contexts: [],
        samples: []
      });
    }

    const group = this.errorGroups.get(errorKey)!;
    group.count++;
    group.lastSeen = now;
    group.contexts.push(context);

    // Keep only the first few samples for detailed analysis
    if (group.samples.length < this.MAX_SAMPLES) {
      group.samples.push({ error, context, timestamp: now });
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  private getErrorKey(error: any, context: LogContext): string {
    const errorType = this.getErrorType(error);
    const errorMessage = this.getErrorMessage(error);
    const component = context.component || 'unknown';
    const operation = context.operation || 'unknown';
    
    // Create a key that groups similar errors together
    return `${errorType}:${component}:${operation}:${errorMessage.substring(0, 100)}`;
  }

  private getErrorType(error: any): string {
    if (error instanceof Error) {
      return error.constructor.name;
    }
    if (typeof error === 'string') {
      return 'StringError';
    }
    return typeof error;
  }

  private getErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  flush() {
    if (this.errorGroups.size === 0) return;

    console.error('\n' + '='.repeat(80));
    console.error('🚨 ERROR SUMMARY (Last 2 seconds)');
    console.error('='.repeat(80));

    // Sort by count (most frequent first)
    const sortedGroups = Array.from(this.errorGroups.entries())
      .sort(([,a], [,b]) => b.count - a.count);

    for (const [_, group] of sortedGroups) {
      console.error(`\n📍 ${group.type}: ${group.message}`);
      console.error(`   Count: ${group.count} | Duration: ${group.lastSeen - group.firstSeen}ms`);
      
      // Show affected components/operations
      const components = [...new Set(group.contexts.map(c => c.component).filter(Boolean))];
      const operations = [...new Set(group.contexts.map(c => c.operation).filter(Boolean))];
      
      if (components.length > 0) {
        console.error(`   Components: ${components.join(', ')}`);
      }
      if (operations.length > 0) {
        console.error(`   Operations: ${operations.join(', ')}`);
      }

      // Show sample errors for detailed debugging
      if (group.samples.length > 0) {
        console.error(`   Sample errors:`);
        group.samples.forEach((sample, i) => {
          console.error(`     ${i + 1}. ${JSON.stringify(sample.context, null, 2)}`);
          if (sample.error instanceof Error && sample.error.stack) {
            const stackLines = sample.error.stack.split('\n').slice(0, 3);
            console.error(`        Stack: ${stackLines.join(' → ')}`);
          }
        });
      }
    }

    console.error('='.repeat(80) + '\n');

    // Clear groups and timer
    this.errorGroups.clear();
    this.flushTimer = null;
  }

  // Force flush (useful for test completion, etc.)
  forceFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// Global error aggregator
const globalErrorAggregator = new ErrorAggregator();

export class Logger {
  private static instance: Logger;
  private level: LogLevel = LogLevel.INFO;
  private readonly componentName: string;

  constructor(componentName: string) {
    this.componentName = componentName;
  }

  static create(componentName: string): Logger {
    return new Logger(componentName);
  }

  static setGlobalLevel(level: LogLevel): void {
    Logger.prototype.level = level;
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const component = context?.component || this.componentName;
    
    let formatted = `[${timestamp}] [${level}] [${component}]`;
    
    if (context?.operation) {
      formatted += ` [${context.operation}]`;
    }
    
    formatted += ` ${message}`;
    
    // Add context details if present
    if (context) {
      const { component: _, operation: __, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        formatted += ` | ${this.serializeContext(rest)}`;
      }
    }
    
    return formatted;
  }

  /**
   * Parse parameters for backwards compatibility
   * Handles both logger.info(msg, context) and logger.info(msg, error, context)
   */
  private parseParameters(
    contextOrError?: LogContext | Error | unknown, 
    context?: LogContext
  ): { finalContext: LogContext; hasError: boolean } {
    // If context is provided as second parameter, first parameter is error
    if (context !== undefined) {
      return {
        finalContext: { ...context, error: contextOrError },
        hasError: true
      };
    }
    
    // If first parameter is an Error, treat it as error with empty context
    if (contextOrError instanceof Error) {
      return {
        finalContext: { error: contextOrError },
        hasError: true
      };
    }
    
    // If first parameter is an object but not an Error, treat it as context
    if (contextOrError && typeof contextOrError === 'object' && !Array.isArray(contextOrError)) {
      return {
        finalContext: contextOrError as LogContext,
        hasError: false
      };
    }
    
    // If first parameter is a string or primitive, treat it as error message
    if (contextOrError !== undefined && contextOrError !== null) {
      return {
        finalContext: { error: contextOrError },
        hasError: true
      };
    }
    
    // No context or error provided
    return {
      finalContext: {},
      hasError: false
    };
  }

  private serializeContext(obj: any): string {
    return JSON.stringify(obj, (key, value) => {
      // Handle Error objects
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      
      // Handle other objects that don't stringify well
      if (typeof value === 'object' && value !== null) {
        // If it's a plain object, continue normal serialization
        if (value.constructor === Object || Array.isArray(value)) {
          return value;
        }
        
        // For other objects, try to extract meaningful info
        try {
          // Try to get useful properties
          const result: any = {};
          if (value.toString && value.toString !== Object.prototype.toString) {
            result.toString = value.toString();
          }
          if (value.message) result.message = value.message;
          if (value.name) result.name = value.name;
          if (value.code) result.code = value.code;
          return Object.keys(result).length > 0 ? result : String(value);
        } catch {
          return String(value);
        }
      }
      
      return value;
    }, 2);
  }

  debug(message: string, contextOrError?: LogContext | Error | unknown, context?: LogContext): void {
    if (this.level <= LogLevel.DEBUG) {
      const { finalContext } = this.parseParameters(contextOrError, context);
      console.log(this.formatMessage('DEBUG', message, finalContext));
    }
  }

  info(message: string, contextOrError?: LogContext | Error | unknown, context?: LogContext): void {
    if (this.level <= LogLevel.INFO) {
      const { finalContext } = this.parseParameters(contextOrError, context);
      console.log(this.formatMessage('INFO', message, finalContext));
    }
  }

  warn(message: string, contextOrError?: LogContext | Error | unknown, context?: LogContext): void {
    if (this.level <= LogLevel.WARN) {
      const { finalContext } = this.parseParameters(contextOrError, context);
      console.warn(this.formatMessage('WARN', message, finalContext));
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.level <= LogLevel.ERROR) {
      const fullContext = { ...context, component: context?.component || this.componentName };
      
      // Add to aggregator for burst reporting
      if (error) {
        globalErrorAggregator.addError(error, fullContext);
      }
      
      // Still log individual errors for immediate visibility (but less verbose)
      const shortMessage = `${message}${error instanceof Error ? ` (${error.constructor.name}: ${error.message})` : ''}`;
      console.error(`[${new Date().toISOString()}] [ERROR] [${this.componentName}] ${shortMessage}`);
    }
  }

  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    const fullContext = { ...context, component: context?.component || this.componentName };
    
    // Add to aggregator
    if (error) {
      globalErrorAggregator.addError(error, fullContext);
    }
    
    // Fatal errors always show full details immediately
    console.error(this.formatMessage('FATAL', message, { ...fullContext, error: error }));
  }

  /**
   * Assert a condition and log if it fails
   */
  assert(condition: boolean, message: string, context?: LogContext): void {
    if (!condition) {
      this.error(`Assertion failed: ${message}`, undefined, context);
    }
  }

  /**
   * Log operation start and return a function to log completion
   */
  operation(operationName: string, context?: LogContext): () => void {
    const startTime = Date.now();
    this.debug(`Starting ${operationName}`, { ...context, operation: operationName });
    
    return () => {
      const duration = Date.now() - startTime;
      this.debug(`Completed ${operationName}`, { 
        ...context, 
        operation: operationName, 
        duration 
      });
    };
  }

  /**
   * Log a metric or performance measurement
   */
  metric(name: string, value: number, unit: string = 'ms', context?: LogContext): void {
    this.info(`Metric: ${name}`, { ...context, metric: name, value, unit });
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    const childLogger = new Logger(this.componentName);
    const originalMethods = {
      debug: childLogger.debug.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      error: childLogger.error.bind(childLogger),
      fatal: childLogger.fatal.bind(childLogger),
    };

    childLogger.debug = (message: string, error?: Error | unknown, context?: LogContext) => 
      originalMethods.debug(message, error, { ...additionalContext, ...context });
    childLogger.info = (message: string, error?: Error | unknown, context?: LogContext) => 
      originalMethods.info(message, error, { ...additionalContext, ...context });
    childLogger.warn = (message: string, error?: Error | unknown, context?: LogContext) => 
      originalMethods.warn(message, error, { ...additionalContext, ...context });
    childLogger.error = (message: string, error?: Error | unknown, context?: LogContext) => 
      originalMethods.error(message, error, { ...additionalContext, ...context });
    childLogger.fatal = (message: string, error?: Error | unknown, context?: LogContext) => 
      originalMethods.fatal(message, error, { ...additionalContext, ...context });

    return childLogger;
  }
}

// Convenience factory functions
export const createLogger = (componentName: string): Logger => Logger.create(componentName);

// Global logger configuration
export const configureLogging = (level: LogLevel): void => {
  Logger.setGlobalLevel(level);
};

// Error aggregation utilities
export const flushErrorSummary = (): void => {
  globalErrorAggregator.forceFlush();
};

export const scheduleErrorSummaryFlush = (delayMs: number = 1000): void => {
  setTimeout(() => globalErrorAggregator.forceFlush(), delayMs);
};

// Export log level helpers
export const isDebugEnabled = (): boolean => Logger.prototype['level'] <= LogLevel.DEBUG;
export const isInfoEnabled = (): boolean => Logger.prototype['level'] <= LogLevel.INFO;