import fetch from 'node-fetch';

async function testDashboardAPI() {
  const baseUrl = 'http://localhost:6969/api';
  
  console.log('Testing Dashboard API endpoints...\n');
  
  // 1. Test health endpoint
  console.log('1. Testing health endpoint...');
  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    const health = await healthRes.json();
    console.log('Health:', JSON.stringify(health, null, 2));
  } catch (error) {
    console.error('Health check failed:', error);
  }
  
  // 2. Index the project
  console.log('\n2. Indexing project...');
  try {
    const indexRes = await fetch(`${baseUrl}/project/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        force: true,
        languages: ['Rust', 'TypeScript', 'JavaScript', 'Python', 'Cpp']
      })
    });
    const indexResult = await indexRes.json();
    console.log('Index result:', JSON.stringify(indexResult, null, 2));
  } catch (error) {
    console.error('Indexing failed:', error);
  }
  
  // 3. Search for symbols
  console.log('\n3. Searching for symbols...');
  try {
    const searchRes = await fetch(`${baseUrl}/symbols/search?q=&limit=10`);
    const searchResult = await searchRes.json();
    console.log('Search result:', JSON.stringify(searchResult, null, 2));
  } catch (error) {
    console.error('Symbol search failed:', error);
  }
  
  // 4. Get relationships
  console.log('\n4. Getting relationships...');
  try {
    const relRes = await fetch(`${baseUrl}/symbols/relationships`);
    const relResult = await relRes.json();
    console.log('Relationships:', JSON.stringify(relResult, null, 2));
  } catch (error) {
    console.error('Getting relationships failed:', error);
  }
  
  // 5. Get flow symbols
  console.log('\n5. Getting flow symbols...');
  try {
    const flowRes = await fetch(`${baseUrl}/flow/symbols?limit=10`);
    const flowResult = await flowRes.json();
    console.log('Flow symbols:', JSON.stringify(flowResult, null, 2));
  } catch (error) {
    console.error('Getting flow symbols failed:', error);
  }
}

testDashboardAPI();