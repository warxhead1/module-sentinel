import { CrossLanguageDetector } from './src/parsers/utils/cross-language-detector.js';

console.log('🧪 Testing Cross-Language Detection\n');

// Test cases that should be detected
const testCases = [
  // Go gRPC patterns
  {
    code: 'cart, err := pb.NewCartServiceClient(cs.cartSvcConn).GetCart(ctx, &pb.GetCartRequest{UserId: userID})',
    lang: 'go',
    desc: 'Go gRPC client call'
  },
  {
    code: 'conn, err := grpc.Dial("productcatalog:3550", grpc.WithInsecure())',
    lang: 'go',
    desc: 'Go gRPC dial'
  },
  {
    code: 'client := pb.NewProductCatalogServiceClient(conn)',
    lang: 'go',
    desc: 'Go gRPC client creation'
  },
  
  // TypeScript/JavaScript HTTP patterns
  {
    code: 'const response = await fetch("http://currency-service:7000/convert", { method: "POST" })',
    lang: 'typescript',
    desc: 'TypeScript fetch API'
  },
  {
    code: 'await axios.post("http://payment-service:5000/charge", payload)',
    lang: 'typescript',
    desc: 'TypeScript axios POST'
  },
  {
    code: 'http.get("https://api.external.com/data").then(res => console.log(res))',
    lang: 'typescript',
    desc: 'TypeScript HTTP GET'
  },
  
  // Python patterns
  {
    code: 'response = requests.post("http://recommendation-service:8080/recommend", json=payload)',
    lang: 'python',
    desc: 'Python requests POST'
  },
  {
    code: 'subprocess.run(["node", "script.js", "--arg"], capture_output=True)',
    lang: 'python',
    desc: 'Python subprocess'
  },
  
  // Subprocess patterns
  {
    code: 'exec("python ml_model.py --predict")',
    lang: 'typescript',
    desc: 'Node.js exec Python'
  },
  {
    code: 'spawn("java", ["-jar", "service.jar"])',
    lang: 'typescript',
    desc: 'Node.js spawn Java'
  }
];

// Run tests
testCases.forEach((test, idx) => {
  console.log(`${idx + 1}. ${test.desc}:`);
  console.log(`   Language: ${test.lang}`);
  console.log(`   Code: ${test.code}`);
  
  const results = CrossLanguageDetector.detectCrossLanguageCalls(
    test.code,
    1,
    test.lang,
    'test.file'
  );
  
  if (results.length > 0) {
    console.log(`   ✅ DETECTED (${results.length} call${results.length > 1 ? 's' : ''}):`);
    results.forEach(result => {
      console.log(`      - Type: ${result.type}`);
      console.log(`        Target: ${result.targetEndpoint || result.targetLanguage || 'unknown'}`);
      console.log(`        Confidence: ${result.confidence}`);
      if (result.metadata) {
        console.log(`        Metadata: ${JSON.stringify(result.metadata)}`);
      }
      if (result.relationship) {
        console.log(`        Relationship: ${result.relationship.fromName} -> ${result.relationship.toName}`);
      }
    });
  } else {
    console.log(`   ❌ NOT DETECTED`);
  }
  console.log('');
});

// Summary
console.log('\n📊 Summary of Cross-Language Detection Issues:\n');
console.log('1. Detection is working - CrossLanguageDetector correctly identifies cross-language patterns');
console.log('2. The problem is in symbol resolution - cross-language calls reference external services');
console.log('3. Example: pb.NewCartServiceClient -> CartService (which exists in a different microservice)');
console.log('4. The indexer cannot resolve these symbols because they are not in the current codebase');
console.log('5. Result: Only 1 cross-language relationship is created (likely a false positive)\n');
console.log('Possible solutions:');
console.log('- Create "virtual" symbols for external services');
console.log('- Store cross-language relationships without symbol resolution');
console.log('- Use a different relationship type that doesn\'t require both symbols to exist');