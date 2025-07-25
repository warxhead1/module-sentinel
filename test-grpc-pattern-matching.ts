import { CrossLanguageDetector } from './src/parsers/utils/cross-language-detector.js';

// Test lines from the microservices demo
const testCases = [
  // Go gRPC client creation
  { line: 'cart, err := pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, &pb.GetCartRequest{UserId: userID})', lang: 'go' },
  { line: 'pb.NewCartServiceClient(cs.cartSvcConn).EmptyCart(ctx, &pb.EmptyCartRequest{UserId: userID})', lang: 'go' },
  { line: 'cl := pb.NewProductCatalogServiceClient(cs.productCatalogSvcConn)', lang: 'go' },
  { line: 'result, err := pb.NewCurrencyServiceClient(cs.currencySvcConn).Convert(context.TODO(), &pb.CurrencyConversionRequest{', lang: 'go' },
  
  // Python gRPC stub creation
  { line: 'product_catalog_stub = demo_pb2_grpc.ProductCatalogServiceStub(channel)', lang: 'python' },
  { line: 'stub = demo_pb2_grpc.EmailServiceStub(channel)', lang: 'python' },
  
  // C# gRPC (would need to add patterns for this)
  { line: 'public class CartService : Hipstershop.CartService.CartServiceBase', lang: 'csharp' },
  
  // Java gRPC
  { line: 'blockingStub = hipstershop.AdServiceGrpc.newBlockingStub(channel);', lang: 'java' }
];

console.log('Testing gRPC pattern matching:\n');

for (const testCase of testCases) {
  console.log(`Testing (${testCase.lang}): ${testCase.line}`);
  const results = CrossLanguageDetector.detectCrossLanguageCalls(
    testCase.line,
    1,
    testCase.lang,
    'test.file'
  );
  
  if (results.length > 0) {
    console.log('✅ Matched!');
    for (const result of results) {
      console.log(`   Type: ${result.type}`);
      console.log(`   Target: ${result.targetEndpoint}`);
      console.log(`   Confidence: ${result.confidence}`);
      console.log(`   Metadata:`, result.metadata);
    }
  } else {
    console.log('❌ No match');
  }
  console.log();
}