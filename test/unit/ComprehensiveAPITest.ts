/**
 * Comprehensive API Endpoint Test
 * Tests ALL API endpoints and validates their response structures
 */

import Database from 'better-sqlite3';
import { ModernApiServer } from '../../dist/api/server.js';
import { TestResult } from '../helpers/JUnitReporter';
import * as http from 'http';

interface ApiTestCase {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST';
  expectedShape: any;
  description: string;
}

export class ComprehensiveAPITest {
  private db: Database.Database;
  private api: ModernApiServer | null = null;
  private port: number = 0;
  
  constructor(db: Database.Database) {
    this.db = db;
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    try {
      // Start the API server once for all tests
      await this.startAPI();
      
      const testCases: ApiTestCase[] = [
        {
          name: 'testProjectsEndpoint',
          endpoint: '/api/projects',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'array',
            data_fields: ['id', 'name', 'display_name', 'description', 'root_path', 'metadata', 'is_active', 'created_at', 'symbol_count']
          },
          description: 'Projects endpoint should return array of project objects'
        },
        {
          name: 'testLanguagesEndpoint',
          endpoint: '/api/languages',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'array',
            data_fields: ['id', 'name', 'display_name', 'file_extensions', 'symbol_count']
          },
          description: 'Languages endpoint should return array of language objects'
        },
        {
          name: 'testStatsEndpoint',
          endpoint: '/api/stats',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'object',
            data_fields: ['symbolCount', 'namespaceCount', 'kindBreakdown', 'languageBreakdown']
          },
          description: 'Stats endpoint should return project statistics'
        },
        {
          name: 'testNamespacesEndpoint',
          endpoint: '/api/namespaces',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'array',
            data_fields: ['namespace', 'symbol_count', 'kinds']
          },
          description: 'Namespaces endpoint should return array of namespace objects'
        },
        {
          name: 'testModulesEndpoint',
          endpoint: '/api/modules',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'array',
            data_fields: ['name', 'qualifiedName', 'namespace', 'kind', 'files', 'imports', 'symbolCount', 'symbolKinds', 'children']
          },
          description: 'Modules endpoint should return array of module objects'
        },
        {
          name: 'testRelationshipsEndpoint',
          endpoint: '/api/relationships?projectId=1&limit=5',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'array',
            data_fields: ['id', 'from_symbol_id', 'to_symbol_id', 'type', 'confidence', 'from_name', 'to_name', 'from_language', 'to_language']
          },
          description: 'Relationships endpoint should return array of relationship objects with rich data'
        },
        {
          name: 'testSymbolsEndpoint',
          endpoint: '/api/symbols?q=test&limit=5',
          method: 'GET',
          expectedShape: {
            success: 'boolean',
            data: 'array',
            data_fields: ['id', 'name', 'qualified_name', 'kind', 'namespace', 'file_path', 'line', 'column']
          },
          description: 'Symbols search endpoint should return array of symbol objects'
        }
      ];
      
      // Run all test cases
      for (const testCase of testCases) {
        results.push(await this.runTestCase(testCase));
      }
      
    } finally {
      await this.stopAPI();
    }
    
    return results;
  }
  
  private async startAPI(): Promise<void> {
    this.api = new ModernApiServer(this.db, 0);
    await this.api.start();
    
    const address = (this.api as any).server?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not get server port');
    }
    this.port = address.port;
  }
  
  private async stopAPI(): Promise<void> {
    if (this.api) {
      await this.api.stop();
      this.api = null;
    }
  }
  
  private async runTestCase(testCase: ApiTestCase): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🧪 Testing ${testCase.name}: ${testCase.description}`);
      
      // Make the HTTP request
      const url = `http://localhost:${this.port}${testCase.endpoint}`;
      const response = await this.makeRequest(url);
      const data = JSON.parse(response);
      
      // Validate response structure
      this.validateResponseStructure(data, testCase.expectedShape, testCase.name);
      
      console.log(`✅ ${testCase.name} passed`);
      
      return {
        name: testCase.name,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      console.error(`❌ ${testCase.name} failed:`, error instanceof Error ? error.message : String(error));
      
      return {
        name: testCase.name,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private validateResponseStructure(data: any, expectedShape: any, testName: string): void {
    // Check success field
    if (typeof data.success !== expectedShape.success) {
      throw new Error(`Expected success to be ${expectedShape.success}, got ${typeof data.success}`);
    }
    
    if (!data.success) {
      throw new Error(`API returned success=false. Error: ${data.error || 'Unknown error'}`);
    }
    
    // Check data field type
    if (expectedShape.data === 'array' && !Array.isArray(data.data)) {
      throw new Error(`Expected data to be array, got ${typeof data.data}`);
    }
    
    if (expectedShape.data === 'object' && (typeof data.data !== 'object' || Array.isArray(data.data))) {
      throw new Error(`Expected data to be object, got ${Array.isArray(data.data) ? 'array' : typeof data.data}`);
    }
    
    // Check data fields if data exists
    if (expectedShape.data_fields && data.data) {
      const sampleItem = Array.isArray(data.data) ? data.data[0] : data.data;
      
      if (sampleItem) {
        for (const field of expectedShape.data_fields) {
          if (!(field in sampleItem)) {
            console.warn(`⚠️  ${testName}: Missing expected field '${field}' in response data`);
            console.warn(`   Available fields: ${Object.keys(sampleItem).join(', ')}`);
          }
        }
        
        console.log(`📋 ${testName} response sample:`, JSON.stringify(sampleItem, null, 2));
      } else if (Array.isArray(data.data) && data.data.length === 0) {
        console.warn(`⚠️  ${testName}: No data to validate structure (empty array)`);
      }
    }
  }
  
  private makeRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${url}`));
      }, 10000); // 10 second timeout
      
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timeout);
          resolve(data);
        });
        res.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}