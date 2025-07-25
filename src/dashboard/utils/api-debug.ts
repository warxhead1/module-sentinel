/**
 * API Debug Utility
 * Helps diagnose why the relationship graph isn't loading
 */

export class ApiDebugger {
  static async debugRelationshipsEndpoint(): Promise<void> {
    console.log('🔍 Debugging Relationships API...');
    
    try {
      // Test the raw API endpoint
      const response = await fetch('/api/relationships');
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);
      
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        console.log('JSON Data:', data);
        console.log('Data structure:', {
          isArray: Array.isArray(data),
          hasNodes: data.nodes !== undefined,
          hasEdges: data.edges !== undefined,
          nodeCount: data.nodes?.length || 0,
          edgeCount: data.edges?.length || 0
        });
      } else {
        const text = await response.text();
        console.log('Non-JSON response:', text.substring(0, 200));
      }
    } catch (error) {
      console.error('API Debug Error:', error);
    }
  }
  
  static async debugDatabaseConnection(): Promise<void> {
    console.log('🔍 Debugging Database Connection...');
    
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      console.log('Database status:', data);
    } catch (error) {
      console.error('Database connection error:', error);
    }
  }
}