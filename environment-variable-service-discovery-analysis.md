# Environment Variable and Service Discovery Analysis

## Current Service Discovery Patterns in Microservices Demo

### 1. **Environment Variable Pattern Analysis**

#### Go Services (Frontend, Checkout)
```go
// Pattern: SERVICE_NAME_SERVICE_ADDR
mustMapEnv(&svc.productCatalogSvcAddr, "PRODUCT_CATALOG_SERVICE_ADDR")
mustMapEnv(&svc.currencySvcAddr, "CURRENCY_SERVICE_ADDR") 
mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR")
// Connection: grpc.DialContext(ctx, addr, ...)
```

#### JavaScript Services (Payment, Currency)
```javascript
// Pattern: Environment variables for configuration
const PORT = process.env['PORT'];
const collectorUrl = process.env.COLLECTOR_SERVICE_ADDR
```

#### Python Services (Email, Recommendation)
```python
# Direct usage in service initialization
# Environment variables typically loaded through configuration
```

#### C# Services (Cart)
```csharp
// Pattern: Configuration injection
string redisAddress = Configuration["REDIS_ADDR"];
string spannerProjectId = Configuration["SPANNER_PROJECT"];
```

### 2. **Service Dependency Map**

```
Frontend (Go) → {
  ProductCatalog (Go): PRODUCT_CATALOG_SERVICE_ADDR = "productcatalogservice:3550"
  Currency (Node.js): CURRENCY_SERVICE_ADDR = "currencyservice:7000"
  Cart (C#): CART_SERVICE_ADDR = "cartservice:7070"
  Recommendation (Python): RECOMMENDATION_SERVICE_ADDR = "recommendationservice:8080"
  Shipping (Go): SHIPPING_SERVICE_ADDR = "shippingservice:50051"
  Checkout (Go): CHECKOUT_SERVICE_ADDR = "checkoutservice:5050"
  Ad (Java): AD_SERVICE_ADDR = "adservice:9555"
}

Checkout (Go) → {
  ProductCatalog (Go): PRODUCT_CATALOG_SERVICE_ADDR
  Cart (C#): CART_SERVICE_ADDR
  Currency (Node.js): CURRENCY_SERVICE_ADDR
  Shipping (Go): SHIPPING_SERVICE_ADDR
  Email (Python): EMAIL_SERVICE_ADDR
  Payment (Node.js): PAYMENT_SERVICE_ADDR
}

Cart (C#) → {
  Redis: REDIS_ADDR
  Spanner: SPANNER_PROJECT / SPANNER_CONNECTION_STRING
  AlloyDB: ALLOYDB_PRIMARY_IP
}
```

### 3. **Connection Initialization Patterns**

#### gRPC Connection Pattern (Go)
```go
// 1. Read environment variable
mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR")
// 2. Create gRPC connection
mustConnGRPC(ctx, &svc.cartSvcConn, svc.cartSvcAddr)
// 3. Create client stub
pb.NewCartServiceClient(cs.cartSvcConn)
```

#### Configuration Pattern (C#)
```csharp
// 1. Read from configuration (which reads env vars)
string redisAddress = Configuration["REDIS_ADDR"];
// 2. Configure service based on available backends
if (!string.IsNullOrEmpty(redisAddress)) {
    services.AddStackExchangeRedisCache(options => {
        options.Configuration = redisAddress;
    });
}
```

### 4. **What Our Parsers Currently Detect**

#### ✅ Currently Detected:
1. **gRPC Client Creation**: `pb.NewCartServiceClient(conn)`
2. **Direct Environment Variable Access**: `os.Getenv("VAR_NAME")`
3. **HTTP/REST Calls**: `axios.post()`, `fetch()`
4. **Subprocess Spawning**: `exec.Command()`, `subprocess.run()`

#### ❌ Currently Missing:
1. **Environment Variable Assignment to Service Fields**
   ```go
   mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR")
   ```

2. **Connection String Pattern Recognition**
   ```go
   // Parser misses that "cartservice:7070" represents a service connection
   value: "cartservice:7070"
   ```

3. **Configuration-Based Service Discovery**
   ```csharp
   string redisAddress = Configuration["REDIS_ADDR"];
   ```

4. **Service Name to Language Mapping**
   - No way to know that "cartservice" is C#
   - No way to know that "currencyservice" is Node.js

5. **Indirect Service Connections**
   ```go
   // Connection established later using the stored address
   svc.cartSvcAddr // Used later in mustConnGRPC
   ```

## Proposed Parser Enhancements

### 1. **Environment Variable Tracking**

```typescript
// Add to CrossLanguageDetector
private static readonly ENV_VAR_PATTERNS = [
  // Go: os.Getenv("SERVICE_ADDR")
  /os\.Getenv\s*\(\s*["']([A-Z_]+_SERVICE_ADDR)["']\s*\)/,
  
  // Go: mustMapEnv(&field, "SERVICE_ADDR")
  /mustMapEnv\s*\([^,]+,\s*["']([A-Z_]+_SERVICE_ADDR)["']\s*\)/,
  
  // JavaScript: process.env.SERVICE_ADDR or process.env['SERVICE_ADDR']
  /process\.env\.([A-Z_]+_SERVICE_ADDR)|process\.env\[["']([A-Z_]+_SERVICE_ADDR)["']\]/,
  
  // Python: os.environ['SERVICE_ADDR']
  /os\.environ\[["']([A-Z_]+_SERVICE_ADDR)["']\]/,
  
  // C#: Configuration["SERVICE_ADDR"]
  /Configuration\[["']([A-Z_]+_ADDR)["']\]/
];

// Track service address patterns
private static readonly SERVICE_ADDR_PATTERNS = [
  // Kubernetes service pattern: servicename:port
  /["']([a-z]+service):\d+["']/,
  
  // HTTP URLs
  /["'](https?:\/\/[^"']+)["']/,
  
  // gRPC addresses
  /["']([a-z]+):\d{4,5}["']/
];
```

### 2. **Service Discovery Relationship Creation**

```typescript
interface ServiceDiscoveryInfo {
  envVar: string;
  serviceName: string;
  servicePort?: number;
  protocol: 'grpc' | 'http' | 'redis' | 'database';
  confidence: number;
}

static detectServiceDiscovery(
  line: string,
  sourceLanguage: string
): ServiceDiscoveryInfo | null {
  // 1. Check for environment variable patterns
  for (const pattern of this.ENV_VAR_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      const envVar = match[1] || match[2];
      
      // 2. Extract service name from env var
      const serviceMatch = envVar.match(/^(.+)_SERVICE_ADDR$/);
      if (serviceMatch) {
        const serviceName = serviceMatch[1]
          .toLowerCase()
          .replace(/_/g, '');
        
        return {
          envVar,
          serviceName,
          protocol: 'grpc', // Default assumption
          confidence: 0.9
        };
      }
    }
  }
  
  // 3. Check for direct service address patterns
  const addrMatch = line.match(/["']([a-z]+service):(\d+)["']/);
  if (addrMatch) {
    return {
      envVar: 'direct',
      serviceName: addrMatch[1],
      servicePort: parseInt(addrMatch[2]),
      protocol: this.inferProtocolFromPort(parseInt(addrMatch[2])),
      confidence: 0.8
    };
  }
  
  return null;
}

private static inferProtocolFromPort(port: number): 'grpc' | 'http' | 'redis' | 'database' {
  // Common port mappings
  if (port === 80 || port === 8080 || port === 3000) return 'http';
  if (port === 6379) return 'redis';
  if (port === 5432 || port === 3306) return 'database';
  if (port >= 5000 && port <= 5999) return 'grpc'; // Common gRPC range
  return 'grpc'; // Default
}
```

### 3. **Enhanced Relationship Metadata**

```typescript
// When creating relationships, include service discovery metadata
const relationship: RelationshipInfo = {
  fromName: 'frontend',
  toName: 'cartservice',
  relationshipType: UniversalRelationshipType.Invokes,
  crossLanguage: true,
  metadata: {
    protocol: 'grpc',
    envVar: 'CART_SERVICE_ADDR',
    serviceAddress: 'cartservice:7070',
    discoveryMethod: 'environment-variable',
    connectionType: 'grpc-client'
  }
};
```

### 4. **Service Registry Integration**

```typescript
// Create a service registry from Kubernetes manifests or docker-compose
interface ServiceRegistry {
  services: Map<string, {
    name: string;
    language: string;
    port: number;
    protocol: string;
    envVars: string[];
  }>;
}

// Parse Kubernetes manifests to build registry
static buildServiceRegistry(k8sManifests: string[]): ServiceRegistry {
  const registry = new Map();
  
  // Parse each manifest
  for (const manifest of k8sManifests) {
    // Extract service name, ports, and env vars
    // Match with known language patterns
  }
  
  return { services: registry };
}
```

### 5. **Connection Flow Tracking**

```typescript
// Track the flow: env var → field → connection → client usage
interface ConnectionFlow {
  envVar: string;
  fieldName?: string;
  connectionMethod?: string;
  clientCreation?: string;
  usagePoints: Array<{
    line: number;
    method: string;
  }>;
}

// Example tracking:
// 1. mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR") 
//    → Track: CART_SERVICE_ADDR → svc.cartSvcAddr
// 2. mustConnGRPC(ctx, &svc.cartSvcConn, svc.cartSvcAddr)
//    → Track: svc.cartSvcAddr → svc.cartSvcConn
// 3. pb.NewCartServiceClient(cs.cartSvcConn)
//    → Track: svc.cartSvcConn → CartServiceClient
```

## Implementation Priority

1. **High Priority**: Environment variable detection for SERVICE_ADDR patterns
2. **High Priority**: Service name extraction from addresses (servicename:port)
3. **Medium Priority**: Configuration-based discovery (C# Configuration[])
4. **Medium Priority**: Connection flow tracking
5. **Low Priority**: Full Kubernetes/Docker manifest parsing

## Testing Strategy

1. Create test cases with all service discovery patterns
2. Verify environment variable → service name mapping
3. Test cross-language relationship creation
4. Validate metadata completeness
5. Check for false positives with similar patterns

## Expected Benefits

1. **Complete Service Dependency Graph**: Automatically map all service-to-service dependencies
2. **Protocol Detection**: Know whether services communicate via gRPC, HTTP, or other protocols
3. **Configuration Tracking**: Understand which services depend on which configuration
4. **Better Cross-Language Detection**: More accurate cross-language relationship detection
5. **Service Mesh Understanding**: Better support for Kubernetes/Istio service discovery patterns