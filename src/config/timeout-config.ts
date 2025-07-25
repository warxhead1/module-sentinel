/**
 * Timeout Configuration
 * 
 * Centralized configuration for all timeout values across the application
 */

export interface TimeoutConfig {
  // Parser timeouts
  parser: {
    fileParseTimeout: number;       // Timeout for parsing a single file
    semanticAnalysisTimeout: number; // Timeout for semantic analysis per file
    patternFallbackTimeout: number;  // Timeout for pattern-based parsing
  };
  
  // Database timeouts
  database: {
    queryTimeout: number;           // Standard database query timeout
    transactionTimeout: number;     // Database transaction timeout
    migrationTimeout: number;       // Database migration timeout
  };
  
  // API timeouts
  api: {
    requestTimeout: number;         // HTTP request timeout
    processingTimeout: number;      // API processing timeout
    indexingTimeout: number;        // Project indexing timeout
  };
  
  // Memory monitoring
  memory: {
    gcMinInterval: number;          // Minimum interval between GC calls
    checkInterval: number;          // Memory check interval
  };
  
  // Test timeouts
  test: {
    unitTestTimeout: number;        // Individual unit test timeout
    integrationTestTimeout: number; // Integration test timeout
    testSuiteTimeout: number;       // Entire test suite timeout
  };
  
  // GitHub Actions timeouts
  cicd: {
    workflowJobTimeout: number;     // GitHub Actions job timeout
    testJobTimeout: number;         // Test job timeout
    buildJobTimeout: number;        // Build job timeout
  };
}

// Default configuration
const defaultTimeoutConfig: TimeoutConfig = {
  parser: {
    fileParseTimeout: 30000,        // 30 seconds
    semanticAnalysisTimeout: 15000, // 15 seconds
    patternFallbackTimeout: 5000,   // 5 seconds
  },
  
  database: {
    queryTimeout: 10000,            // 10 seconds
    transactionTimeout: 30000,      // 30 seconds
    migrationTimeout: 120000,       // 2 minutes
  },
  
  api: {
    requestTimeout: 30000,          // 30 seconds
    processingTimeout: 60000,       // 1 minute
    indexingTimeout: 300000,        // 5 minutes
  },
  
  memory: {
    gcMinInterval: 30000,           // 30 seconds
    checkInterval: 30000,           // 30 seconds
  },
  
  test: {
    unitTestTimeout: 30000,         // 30 seconds
    integrationTestTimeout: 120000, // 2 minutes
    testSuiteTimeout: 600000,       // 10 minutes
  },
  
  cicd: {
    workflowJobTimeout: 1800000,    // 30 minutes
    testJobTimeout: 1200000,        // 20 minutes
    buildJobTimeout: 600000,        // 10 minutes
  },
};

// Environment-specific overrides
const environmentOverrides: Record<string, Partial<TimeoutConfig>> = {
  development: {
    parser: {
      fileParseTimeout: 60000,      // Longer timeouts in dev
      semanticAnalysisTimeout: 30000,
      patternFallbackTimeout: 15000,
    },
    test: {
      unitTestTimeout: 60000,
      integrationTestTimeout: 300000,
      testSuiteTimeout: 600000,
    },
  },
  
  test: {
    parser: {
      fileParseTimeout: 15000,      // Shorter timeouts in test
      semanticAnalysisTimeout: 10000,
      patternFallbackTimeout: 5000,
    },
    api: {
      requestTimeout: 15000,
      processingTimeout: 30000,
      indexingTimeout: 120000,
    },
  },
  
  production: {
    parser: {
      fileParseTimeout: 20000,      // Conservative timeouts in prod
      semanticAnalysisTimeout: 10000,
      patternFallbackTimeout: 8000,
    },
    api: {
      requestTimeout: 25000,
      processingTimeout: 45000,
      indexingTimeout: 180000,
    },
  },
  
  ci: {
    test: {
      unitTestTimeout: 45000,       // Slightly longer for CI
      integrationTestTimeout: 180000,
      testSuiteTimeout: 900000,     // 15 minutes
    },
    cicd: {
      workflowJobTimeout: 2700000,  // 45 minutes for CI
      testJobTimeout: 1800000,      // 30 minutes
      buildJobTimeout: 900000,      // 15 minutes
    },
  },
};

/**
 * Get timeout configuration for current environment
 */
export function getTimeoutConfig(): TimeoutConfig {
  // Browser compatibility: check if we're in Node.js environment
  const env = (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'development';
  const isCI = (typeof process !== 'undefined' && process.env?.CI) === 'true';
  
  let config = { ...defaultTimeoutConfig };
  
  // Apply environment overrides
  if (environmentOverrides[env]) {
    config = mergeConfig(config, environmentOverrides[env]);
  }
  
  // Apply CI overrides if running in CI
  if (isCI && environmentOverrides.ci) {
    config = mergeConfig(config, environmentOverrides.ci);
  }
  
  // Apply environment variable overrides
  config = applyEnvOverrides(config);
  
  return config;
}

/**
 * Deep merge configuration objects
 */
function mergeConfig(base: TimeoutConfig, override: Partial<TimeoutConfig>): TimeoutConfig {
  const result = { ...base };
  
  for (const [category, values] of Object.entries(override)) {
    if (typeof values === 'object' && values !== null) {
      (result as any)[category] = {
        ...(result as any)[category],
        ...values,
      };
    }
  }
  
  return result;
}

/**
 * Apply environment variable overrides
 */
function applyEnvOverrides(config: TimeoutConfig): TimeoutConfig {
  // Browser compatibility: skip environment variable overrides in browser
  if (typeof process === 'undefined' || !process.env) {
    return config;
  }

  const envOverrides: Record<string, string> = {
    'PARSER_FILE_TIMEOUT': 'parser.fileParseTimeout',
    'PARSER_SEMANTIC_TIMEOUT': 'parser.semanticAnalysisTimeout',
    'DB_QUERY_TIMEOUT': 'database.queryTimeout',
    'API_REQUEST_TIMEOUT': 'api.requestTimeout',
    'TEST_TIMEOUT': 'test.unitTestTimeout',
    'CI_JOB_TIMEOUT': 'cicd.workflowJobTimeout',
  };
  
  const result = { ...config };
  
  for (const [envVar, configPath] of Object.entries(envOverrides)) {
    const value = process.env[envVar];
    if (value && !isNaN(Number(value))) {
      const path = configPath.split('.');
      if (path.length === 2) {
        const [category, prop] = path;
        (result as any)[category][prop] = Number(value);
      }
    }
  }
  
  return result;
}

/**
 * Get a specific timeout value with fallback
 */
export function getTimeout(category: keyof TimeoutConfig, property: string, fallback?: number): number {
  const config = getTimeoutConfig();
  const value = (config[category] as any)?.[property];
  return typeof value === 'number' ? value : (fallback || 30000);
}

/**
 * Validate timeout configuration
 */
export function validateTimeoutConfig(config: TimeoutConfig): string[] {
  const errors: string[] = [];
  
  // Check for reasonable timeout values
  if (config.parser.fileParseTimeout < 1000) {
    errors.push('Parser file timeout too low (minimum 1 second)');
  }
  
  if (config.parser.fileParseTimeout > 300000) {
    errors.push('Parser file timeout too high (maximum 5 minutes)');
  }
  
  if (config.database.queryTimeout < 1000) {
    errors.push('Database query timeout too low (minimum 1 second)');
  }
  
  if (config.test.unitTestTimeout < 5000) {
    errors.push('Unit test timeout too low (minimum 5 seconds)');
  }
  
  // Check for logical relationships
  if (config.parser.semanticAnalysisTimeout > config.parser.fileParseTimeout) {
    errors.push('Semantic analysis timeout should not exceed file parse timeout');
  }
  
  if (config.database.transactionTimeout < config.database.queryTimeout) {
    errors.push('Transaction timeout should not be less than query timeout');
  }
  
  return errors;
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Wrap a promise with a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  timeoutMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(timeoutMs, timeoutMessage),
  ]);
}

// Export singleton instance
let cachedConfig: TimeoutConfig | null = null;

export function getConfigInstance(): TimeoutConfig {
  if (!cachedConfig) {
    cachedConfig = getTimeoutConfig();
    
    // Validate configuration
    const errors = validateTimeoutConfig(cachedConfig);
    if (errors.length > 0) {
      console.warn('Timeout configuration warnings:', errors);
    }
  }
  
  return cachedConfig;
}

// Clear cached config (useful for testing)
export function clearConfigCache(): void {
  cachedConfig = null;
}