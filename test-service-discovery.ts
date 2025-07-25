#!/usr/bin/env node

/**
 * Test service discovery detection
 */

import { ServiceDiscoveryDetector } from './src/parsers/utils/service-discovery-detector.js';
import { CrossLanguageDetector } from './src/parsers/utils/cross-language-detector.js';

console.log('🔍 Testing Service Discovery Detection\n');

// Test cases from the microservices demo
const testCases = [
  {
    name: 'Go - mustMapEnv pattern',
    language: 'go',
    code: `mustMapEnv(&svc.productCatalogSvcAddr, "PRODUCT_CATALOG_SERVICE_ADDR")`,
    expected: {
      envVar: 'PRODUCT_CATALOG_SERVICE_ADDR',
      serviceName: 'productcatalogservice'
    }
  },
  {
    name: 'Go - os.Getenv pattern',
    language: 'go', 
    code: `addr := os.Getenv("CART_SERVICE_ADDR")`,
    expected: {
      envVar: 'CART_SERVICE_ADDR',
      serviceName: 'cartservice'
    }
  },
  {
    name: 'JavaScript - process.env pattern',
    language: 'javascript',
    code: `const collectorUrl = process.env.COLLECTOR_SERVICE_ADDR`,
    expected: {
      envVar: 'COLLECTOR_SERVICE_ADDR',
      serviceName: 'collectorservice'
    }
  },
  {
    name: 'C# - Configuration pattern',
    language: 'csharp',
    code: `string redisAddress = Configuration["REDIS_ADDR"];`,
    expected: {
      envVar: 'REDIS_ADDR',
      serviceName: 'redis'
    }
  },
  {
    name: 'Kubernetes service address',
    language: 'yaml',
    code: `value: "cartservice:7070"`,
    expected: {
      serviceName: 'cartservice',
      port: 7070,
      protocol: 'grpc'
    }
  },
  {
    name: 'HTTP service address',
    language: 'go',
    code: `apiUrl := "http://recommendationservice:8080/recommend"`,
    expected: {
      serviceName: 'recommendationservice',
      protocol: 'http'
    }
  }
];

// Test service discovery detection
console.log('=== Service Discovery Detection ===\n');

testCases.forEach(testCase => {
  console.log(`Test: ${testCase.name}`);
  console.log(`Code: ${testCase.code}`);
  
  const results = ServiceDiscoveryDetector.detectServiceDiscovery(
    testCase.code,
    1,
    testCase.language,
    'test.file'
  );
  
  if (results.length > 0) {
    const result = results[0];
    console.log(`✅ Found service discovery:`);
    console.log(`   Type: ${result.type}`);
    console.log(`   Service: ${result.serviceName}`);
    if (result.envVar) console.log(`   Env Var: ${result.envVar}`);
    if (result.servicePort) console.log(`   Port: ${result.servicePort}`);
    console.log(`   Protocol: ${result.protocol}`);
    console.log(`   Confidence: ${result.confidence}`);
    
    // Verify expected values
    if (testCase.expected.envVar && result.envVar !== testCase.expected.envVar) {
      console.log(`   ⚠️  Expected env var: ${testCase.expected.envVar}`);
    }
    if (testCase.expected.serviceName && result.serviceName !== testCase.expected.serviceName) {
      console.log(`   ⚠️  Expected service: ${testCase.expected.serviceName}`);
    }
  } else {
    console.log(`❌ No service discovery found`);
  }
  console.log('');
});

// Test cross-language detection with service discovery
console.log('\n=== Cross-Language Detection with Service Discovery ===\n');

const crossLangTestCases = [
  {
    name: 'gRPC client creation after env var',
    language: 'go',
    code: `pb.NewCartServiceClient(cs.cartSvcConn)`,
    expected: {
      type: 'grpc',
      service: 'Cart'
    }
  },
  {
    name: 'Combined env var and gRPC',
    language: 'go',
    code: `mustMapEnv(&svc.emailSvcAddr, "EMAIL_SERVICE_ADDR")`,
    expected: {
      multiple: true
    }
  }
];

crossLangTestCases.forEach(testCase => {
  console.log(`Test: ${testCase.name}`);
  console.log(`Code: ${testCase.code}`);
  
  const results = CrossLanguageDetector.detectCrossLanguageCalls(
    testCase.code,
    1,
    testCase.language,
    'test.file'
  );
  
  console.log(`Found ${results.length} cross-language call(s):`);
  results.forEach((result, idx) => {
    console.log(`   [${idx + 1}] Type: ${result.type}`);
    console.log(`       Target: ${result.targetEndpoint}`);
    console.log(`       Relationship: ${result.relationship.relationshipType}`);
    if (result.metadata) {
      console.log(`       Metadata:`, result.metadata);
    }
  });
  console.log('');
});

// Test connection flow tracking
console.log('\n=== Connection Flow Tracking ===\n');

const flowTestCode = `
func main() {
    svc := new(frontendServer)
    
    mustMapEnv(&svc.cartSvcAddr, "CART_SERVICE_ADDR")
    mustMapEnv(&svc.currencySvcAddr, "CURRENCY_SERVICE_ADDR")
    
    mustConnGRPC(ctx, &svc.cartSvcConn, svc.cartSvcAddr)
    mustConnGRPC(ctx, &svc.currencySvcConn, svc.currencySvcAddr)
    
    // Later in code...
    cartClient := pb.NewCartServiceClient(svc.cartSvcConn)
    cart, err := cartClient.GetCart(ctx, &pb.GetCartRequest{UserId: userID})
}
`;

console.log('Tracking CART_SERVICE_ADDR flow:');
const cartFlow = ServiceDiscoveryDetector.trackConnectionFlow(flowTestCode, 'CART_SERVICE_ADDR');
if (cartFlow) {
  console.log(`✅ Tracked connection flow:`);
  console.log(`   Env Var: ${cartFlow.envVar}`);
  console.log(`   Field: ${cartFlow.fieldName}`);
  console.log(`   Connection: ${cartFlow.connectionMethod}`);
  console.log(`   Client: ${cartFlow.clientCreation}`);
  console.log(`   Usage points: ${cartFlow.usagePoints.length}`);
} else {
  console.log('❌ Could not track connection flow');
}

console.log('\n✨ Service discovery detection test complete!');