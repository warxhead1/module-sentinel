/**
 * Structured logger utility for Module Sentinel
 * Provides consistent logging across TypeScript components
 */

interface LogContext {
  [key: string]: unknown;
}

interface OperationHandle {
  (): void;
}

export class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  private log(level: string, message: string, error?: Error, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component: this.component,
      message,
      ...(context && { context }),
      ...(error && { 
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      })
    };

    // Use console for now - in production this would go to a proper logging service
    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(logEntry));
    } else if (level === 'debug' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(JSON.stringify(logEntry));
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, undefined, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, undefined, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, undefined, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext | unknown) {
    // Ensure error and context are properly typed
    const typedError = error instanceof Error ? error : 
      (error ? new Error(String(error)) : undefined);
    const typedContext = (context && typeof context === 'object') ? context as LogContext : undefined;
    this.log('error', message, typedError, typedContext);
  }

  /**
   * Create an operation timer for performance tracking
   */
  operation(operationName: string, context?: LogContext): OperationHandle {
    const startTime = Date.now();
    this.debug(`Starting operation: ${operationName}`, { 
      operation: operationName,
      ...context 
    });

    return () => {
      const duration = Date.now() - startTime;
      this.info(`Completed operation: ${operationName}`, { 
        operation: operationName,
        duration: `${duration}ms`,
        ...context 
      });
    };
  }

  /**
   * Assert a condition and log error if false
   */
  assert(condition: boolean, message: string, context?: LogContext) {
    if (!condition) {
      this.error(`Assertion failed: ${message}`, undefined, context);
    }
  }

  /**
   * Log a metric value
   */
  metric(name: string, value: number, unit: string, context?: LogContext) {
    this.info(`Metric: ${name}`, {
      metric: {
        name,
        value,
        unit
      },
      ...context
    });
  }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

/**
 * Global logger for general use
 */
export const logger = createLogger('ModuleSentinel');