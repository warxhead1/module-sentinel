/**
 * Service Discovery Detector
 * 
 * Detects environment variable-based service discovery patterns
 * and creates relationships based on service connections.
 */

import { RelationshipInfo } from '../tree-sitter/parser-types.js';
import { UniversalRelationshipType } from '../language-parser-interface.js';

export interface ServiceDiscoveryInfo {
  type: 'env-var' | 'config' | 'direct' | 'service-mesh';
  envVar?: string;
  serviceName: string;
  serviceHost?: string;
  servicePort?: number;
  protocol: 'grpc' | 'http' | 'redis' | 'database' | 'amqp' | 'kafka';
  confidence: number;
  metadata?: Record<string, any>;
}

export interface ConnectionFlow {
  envVar: string;
  fieldName?: string;
  connectionMethod?: string;
  clientCreation?: string;
  usagePoints: Array<{
    line: number;
    method: string;
  }>;
}

export class ServiceDiscoveryDetector {
  // Environment variable patterns for service discovery
  private static readonly ENV_VAR_PATTERNS = [
    // Go: os.Getenv("SERVICE_ADDR")
    {
      pattern: /os\.Getenv\s*\(\s*["']([A-Z_]+(?:_SERVICE)?_ADDR)["']\s*\)/,
      language: 'go',
      type: 'env-var'
    },
    // Go: mustMapEnv(&field, "SERVICE_ADDR")
    {
      pattern: /mustMapEnv\s*\([^,]+,\s*["']([A-Z_]+(?:_SERVICE)?_ADDR)["']\s*\)/,
      language: 'go',
      type: 'env-var'
    },
    // JavaScript: process.env.SERVICE_ADDR or process.env['SERVICE_ADDR']
    {
      pattern: /process\.env\.([A-Z_]+(?:_SERVICE)?_ADDR)|process\.env\[["']([A-Z_]+(?:_SERVICE)?_ADDR)["']\]/,
      language: 'javascript',
      type: 'env-var'
    },
    // Python: os.environ['SERVICE_ADDR'] or os.environ.get('SERVICE_ADDR')
    {
      pattern: /os\.environ(?:\[["']([A-Z_]+(?:_SERVICE)?_ADDR)["']\]|\.get\s*\(\s*["']([A-Z_]+(?:_SERVICE)?_ADDR)["']\s*\))/,
      language: 'python',
      type: 'env-var'
    },
    // C#: Configuration["SERVICE_ADDR"]
    {
      pattern: /Configuration\[["']([A-Z_]+_ADDR)["']\]/,
      language: 'csharp',
      type: 'config'
    },
    // Java: System.getenv("SERVICE_ADDR")
    {
      pattern: /System\.getenv\s*\(\s*"([A-Z_]+(?:_SERVICE)?_ADDR)"\s*\)/,
      language: 'java',
      type: 'env-var'
    },
    // Additional patterns for HOST/PORT pairs
    {
      pattern: /os\.Getenv\s*\(\s*["']([A-Z_]+_HOST)["']\s*\)/,
      language: 'go',
      type: 'env-var'
    },
    {
      pattern: /process\.env\.([A-Z_]+_HOST)|process\.env\[["']([A-Z_]+_HOST)["']\]/,
      language: 'javascript',
      type: 'env-var'
    }
  ];

  // Service address patterns (in string literals)
  private static readonly SERVICE_ADDR_PATTERNS = [
    // Kubernetes service pattern: servicename:port
    {
      pattern: /["']([a-z][\w-]*(?:service)?):(\d{1,5})["']/,
      type: 'kubernetes'
    },
    // HTTP/HTTPS URLs
    {
      pattern: /["'](https?:\/\/[^"']+)["']/,
      type: 'http'
    },
    // Redis connection
    {
      pattern: /["'](redis:\/\/[^"']+|[^:]+:6379)["']/,
      type: 'redis'
    },
    // Database connections
    {
      pattern: /["'](postgres:\/\/[^"']+|mysql:\/\/[^"']+|mongodb:\/\/[^"']+)["']/,
      type: 'database'
    },
    // AMQP/RabbitMQ
    {
      pattern: /["'](amqp:\/\/[^"']+)["']/,
      type: 'amqp'
    },
    // Kafka
    {
      pattern: /["']([^:]+:9092)["']/,
      type: 'kafka'
    }
  ];

  // Service name normalization patterns
  private static readonly SERVICE_NAME_PATTERNS = [
    // From env var: PRODUCT_CATALOG_SERVICE_ADDR -> productcatalogservice
    {
      pattern: /^(.+)_SERVICE_ADDR$/,
      transform: (match: string) => match.toLowerCase().replace(/_/g, '') + 'service'
    },
    // From env var: CART_SERVICE_ADDR -> cartservice (special cases like REDIS_ADDR -> redis)
    {
      pattern: /^(.+)_ADDR$/,
      transform: (match: string) => {
        const base = match.toLowerCase().replace(/_/g, '');
        // Special cases that don't need 'service' suffix
        const noServiceSuffix = ['redis', 'db', 'database', 'collector', 'kafka', 'rabbitmq', 'amqp'];
        if (noServiceSuffix.some(special => base.includes(special))) {
          return base;
        }
        // Add 'service' suffix if it doesn't have it
        return base.endsWith('service') ? base : base + 'service';
      }
    },
    // From env var: REDIS_HOST -> redis
    {
      pattern: /^(.+)_HOST$/,
      transform: (match: string) => match.toLowerCase().replace(/_/g, '')
    }
  ];

  // Protocol inference from port
  private static inferProtocolFromPort(port: number): 'grpc' | 'http' | 'redis' | 'database' | 'amqp' | 'kafka' {
    const portMap: Record<number, 'grpc' | 'http' | 'redis' | 'database' | 'amqp' | 'kafka'> = {
      80: 'http',
      443: 'http',
      3000: 'http',
      8080: 'http',
      8081: 'http',
      8082: 'http',
      8090: 'http',
      5432: 'database', // PostgreSQL
      3306: 'database', // MySQL
      27017: 'database', // MongoDB
      6379: 'redis',
      5672: 'amqp', // RabbitMQ
      9092: 'kafka',
    };

    if (portMap[port]) return portMap[port];
    
    // Common ranges
    if (port >= 5000 && port <= 5999) return 'grpc';
    if (port >= 8000 && port <= 8999) return 'http';
    if (port >= 50000 && port <= 59999) return 'grpc';
    
    return 'grpc'; // Default assumption
  }

  /**
   * Detect service discovery patterns in a line of code
   */
  static detectServiceDiscovery(
    line: string,
    lineNumber: number,
    sourceLanguage: string,
    filePath: string
  ): Array<ServiceDiscoveryInfo & { relationship: Partial<RelationshipInfo> }> {
    const results: Array<ServiceDiscoveryInfo & { relationship: Partial<RelationshipInfo> }> = [];

    // Skip comments
    const trimmedLine = line.trim();
    if (!trimmedLine || 
        trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('#') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*')) {
      return results;
    }

    // 1. Check for environment variable patterns
    for (const envPattern of this.ENV_VAR_PATTERNS) {
      if (envPattern.language && envPattern.language !== sourceLanguage) continue;
      
      const match = line.match(envPattern.pattern);
      if (match) {
        const envVar = match[1] || match[2];
        const serviceName = this.extractServiceNameFromEnvVar(envVar);
        
        if (serviceName) {
          const protocol = this.inferProtocolFromEnvVar(envVar);
          
          results.push({
            type: envPattern.type as any,
            envVar,
            serviceName,
            protocol,
            confidence: 0.9,
            metadata: {
              detectionMethod: 'env-var',
              envVarPattern: envVar
            },
            relationship: {
              fromName: filePath,
              toName: serviceName,
              relationshipType: UniversalRelationshipType.Invokes,
              confidence: 0.9,
              crossLanguage: true,
              lineNumber,
              metadata: {
                protocol,
                envVar,
                discoveryMethod: 'environment-variable'
              }
            }
          });
        }
      }
    }

    // 2. Check for direct service address patterns
    for (const addrPattern of this.SERVICE_ADDR_PATTERNS) {
      const match = line.match(addrPattern.pattern);
      if (match) {
        let serviceName: string;
        let serviceHost: string | undefined;
        let servicePort: number | undefined;
        let protocol: any = addrPattern.type;

        if (addrPattern.type === 'kubernetes') {
          serviceName = match[1];
          serviceHost = match[1];
          servicePort = parseInt(match[2]);
          protocol = this.inferProtocolFromPort(servicePort);
        } else {
          // Extract from URL
          const url = match[1];
          try {
            const parsed = new URL(url);
            serviceName = parsed.hostname;
            serviceHost = parsed.hostname;
            servicePort = parsed.port ? parseInt(parsed.port) : undefined;
          } catch {
            serviceName = match[1];
          }
        }

        results.push({
          type: 'direct',
          serviceName,
          serviceHost,
          servicePort,
          protocol,
          confidence: 0.8,
          metadata: {
            detectionMethod: 'direct-address',
            addressPattern: match[0]
          },
          relationship: {
            fromName: filePath,
            toName: serviceName,
            relationshipType: UniversalRelationshipType.Invokes,
            confidence: 0.8,
            crossLanguage: true,
            lineNumber,
            metadata: {
              protocol,
              address: match[1],
              discoveryMethod: 'direct-address'
            }
          }
        });
      }
    }

    return results;
  }

  /**
   * Extract service name from environment variable
   */
  private static extractServiceNameFromEnvVar(envVar: string): string | null {
    for (const pattern of this.SERVICE_NAME_PATTERNS) {
      const match = envVar.match(pattern.pattern);
      if (match) {
        return pattern.transform(match[1]);
      }
    }
    
    // Fallback: just lowercase and remove underscores
    if (envVar.includes('_ADDR') || envVar.includes('_HOST')) {
      return envVar
        .replace(/_ADDR$/, '')
        .replace(/_HOST$/, '')
        .toLowerCase()
        .replace(/_/g, '');
    }
    
    return null;
  }

  /**
   * Infer protocol from environment variable name
   */
  private static inferProtocolFromEnvVar(envVar: string): 'grpc' | 'http' | 'redis' | 'database' | 'amqp' | 'kafka' {
    const lowerVar = envVar.toLowerCase();
    
    if (lowerVar.includes('redis')) return 'redis';
    if (lowerVar.includes('db') || lowerVar.includes('database')) return 'database';
    if (lowerVar.includes('amqp') || lowerVar.includes('rabbit')) return 'amqp';
    if (lowerVar.includes('kafka')) return 'kafka';
    if (lowerVar.includes('http')) return 'http';
    
    // Most microservice patterns use gRPC
    if (lowerVar.includes('service')) return 'grpc';
    
    return 'grpc'; // Default
  }

  /**
   * Track connection flow from environment variable to usage
   */
  static trackConnectionFlow(
    code: string,
    envVar: string
  ): ConnectionFlow | null {
    const flow: ConnectionFlow = {
      envVar,
      usagePoints: []
    };

    const lines = code.split('\n');
    
    // Track field assignment
    const fieldPattern = new RegExp(`(\\w+)\\s*[=:].*${envVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(fieldPattern);
      if (match) {
        flow.fieldName = match[1];
        break;
      }
    }

    // Track connection creation
    if (flow.fieldName) {
      const connPattern = new RegExp(`(\\w+Conn|\\w+Client).*${flow.fieldName}`);
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(connPattern);
        if (match) {
          flow.connectionMethod = match[0];
          flow.usagePoints.push({
            line: i + 1,
            method: 'connection'
          });
        }
      }
    }

    // Track client creation
    const clientPattern = /New(\w+)Client|(\w+)Stub|(\w+)Client\s*=/;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(clientPattern);
      if (match && (lines[i].includes(flow.fieldName || '') || lines[i].includes(flow.connectionMethod || ''))) {
        flow.clientCreation = match[0];
        flow.usagePoints.push({
          line: i + 1,
          method: 'client-creation'
        });
      }
    }

    return flow.usagePoints.length > 0 ? flow : null;
  }

  /**
   * Build a service registry from configuration files
   */
  static buildServiceRegistry(configContent: string, configType: 'kubernetes' | 'docker-compose'): Map<string, {
    name: string;
    language?: string;
    port: number;
    protocol: string;
    envVars: string[];
  }> {
    const registry = new Map();

    if (configType === 'kubernetes') {
      // Parse Kubernetes YAML
      const envVarPattern = /name:\s*([A-Z_]+_ADDR)\s*\n\s*value:\s*"([^"]+)"/g;
      let match;
      while ((match = envVarPattern.exec(configContent)) !== null) {
        const [_, envVar, value] = match;
        const serviceName = this.extractServiceNameFromEnvVar(envVar);
        
        if (serviceName && value.includes(':')) {
          const [host, portStr] = value.split(':');
          const port = parseInt(portStr);
          
          registry.set(serviceName, {
            name: serviceName,
            port,
            protocol: this.inferProtocolFromPort(port),
            envVars: [envVar]
          });
        }
      }
    }

    return registry;
  }
}