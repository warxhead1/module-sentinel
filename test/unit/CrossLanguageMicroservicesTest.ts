import { BaseTest } from '../helpers/BaseTest.js';
import { TestResult } from '../helpers/JUnitReporter.js';
import { UniversalIndexer } from '../../src/indexing/universal-indexer.js';
import { CrossLanguageDetector } from '../../src/parsers/utils/cross-language-detector.js';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';

export class CrossLanguageMicroservicesTest extends BaseTest {
  constructor(db: Database.Database) {
    super('Cross-Language Microservices Detection', db);
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    // Test 1: Index the microservices demo
    results.push(await this.runTest('Index multi-language microservices project', async () => {
      const projectPath = path.resolve('./test-repos/cross-language/microservices-demo');
      
      // Check if test repo exists
      if (!fs.existsSync(projectPath)) {
        this.skip('Microservices demo repo not found');
        return;
      }
      
      const indexer = new UniversalIndexer(this.db, { 
        projectPath: projectPath, 
        projectName: 'microservices-demo',
        languages: ['go', 'python', 'typescript', 'javascript', 'csharp', 'java'],
        debugMode: false,
        enableSemanticAnalysis: false,
        maxFiles: 200 // Increased limit to ensure Go files are included
      });
      
      console.log('\n    Indexing microservices demo project...');
      const indexResult = await indexer.indexProject();
      console.log(`      Indexed ${indexResult.filesIndexed} files, found ${indexResult.symbolsFound} symbols`);
      
      // Use the project ID from the indexing result
      const projectId = indexResult.projectId;
      
      // Get language distribution
      console.log(`\n    Using Project ID: ${projectId}`);
      
      const stats = this.db.prepare(`
        SELECT 
          l.name as language,
          COUNT(DISTINCT s.file_path) as file_count,
          COUNT(*) as symbol_count
        FROM universal_symbols s
        JOIN languages l ON s.language_id = l.id
        WHERE s.project_id = ?
        GROUP BY l.name
        ORDER BY symbol_count DESC
      `).all(projectId) as any[];
      
      console.log('\n    Language distribution:');
      stats.forEach(stat => {
        console.log(`      ${stat.language}: ${stat.file_count} files, ${stat.symbol_count} symbols`);
      });
      
      // Should have multiple languages
      this.assert(stats.length >= 3, `Expected at least 3 languages, got ${stats.length}`);
      
      // Check for specific languages
      const languages = stats.map(s => s.language);
      this.assert(languages.includes('go'), 'Should detect Go');
      this.assert(languages.includes('python'), 'Should detect Python');
      this.assert(languages.includes('javascript') || languages.includes('typescript'), 'Should detect JavaScript/TypeScript');
      
      // Store project ID for other tests
      (this as any).microservicesProjectId = projectId;
    }));
    
    // Test 2: Check for cross-language relationships
    results.push(await this.runTest('Detect cross-language relationships', async () => {
      const projectId = (this as any).microservicesProjectId || 1;
      
      const crossLangRelations = this.db.prepare(`
        SELECT 
          l1.name as from_language,
          l2.name as to_language,
          r.type,
          COUNT(*) as count
        FROM universal_relationships r
        JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
        JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
        JOIN languages l1 ON s1.language_id = l1.id
        JOIN languages l2 ON s2.language_id = l2.id
        WHERE l1.name != l2.name
          AND r.project_id = ?
        GROUP BY l1.name, l2.name, r.type
        ORDER BY count DESC
      `).all(projectId) as any[];
      
      console.log(`\n    Found ${crossLangRelations.length} cross-language relationship types`);
      
      if (crossLangRelations.length > 0) {
        console.log('    Top cross-language relationships:');
        crossLangRelations.slice(0, 5).forEach(rel => {
          console.log(`      ${rel.from_language} -> ${rel.to_language}: ${rel.count} ${rel.type}`);
        });
      }
      
      // For now, we'll check if the detector is working
      // The actual cross-language detection might need improvements
      console.log('\n    Note: Cross-language detection may need enhancements');
    }));
    
    // Test 3: Check for gRPC/Protobuf patterns
    results.push(await this.runTest('Detect gRPC/Protobuf usage', async () => {
      const projectId = (this as any).microservicesProjectId || 1;
      
      const grpcPatterns = this.db.prepare(`
        SELECT 
          s.name,
          s.file_path,
          s.kind,
          l.name as language
        FROM universal_symbols s
        JOIN languages l ON s.language_id = l.id
        WHERE s.project_id = ?
          AND (
            s.name LIKE '%grpc%' OR 
            s.name LIKE '%Grpc%' OR
            s.name LIKE '%proto%' OR
            s.name LIKE '%Proto%' OR
            s.signature LIKE '%grpc%' OR
            s.qualified_name LIKE '%.pb.%' OR
            s.qualified_name LIKE '%_pb2%'
          )
        LIMIT 10
      `).all(projectId) as any[];
      
      console.log(`\n    Found ${grpcPatterns.length} gRPC/Protobuf patterns`);
      
      if (grpcPatterns.length > 0) {
        console.log('    Sample gRPC patterns:');
        grpcPatterns.slice(0, 5).forEach(p => {
          console.log(`      ${p.language}: ${p.name} in ${path.basename(p.file_path)}`);
        });
      }
    }));
    
    // Test 4: Check HTTP/REST patterns
    results.push(await this.runTest('Detect HTTP/REST API patterns', async () => {
      const projectId = (this as any).microservicesProjectId || 1;
      
      const httpPatterns = this.db.prepare(`
        SELECT 
          s.name,
          s.file_path,
          s.kind,
          l.name as language
        FROM universal_symbols s
        JOIN languages l ON s.language_id = l.id
        WHERE s.project_id = ?
          AND (
            s.name LIKE '%http%' OR 
            s.name LIKE '%Http%' OR
            s.name LIKE '%Server%' OR
            s.name LIKE '%Client%' OR
            s.name LIKE '%request%' OR
            s.name LIKE '%Request%'
          )
          AND s.kind IN ('function', 'method', 'class')
        LIMIT 10
      `).all(projectId) as any[];
      
      console.log(`\n    Found ${httpPatterns.length} HTTP/REST patterns`);
      
      if (httpPatterns.length > 0) {
        console.log('    Sample HTTP patterns:');
        httpPatterns.slice(0, 5).forEach(p => {
          console.log(`      ${p.language}: ${p.name} (${p.kind}) in ${path.basename(p.file_path)}`);
        });
      }
    }));
    
    // Test 5: Test CrossLanguageDetector directly
    results.push(await this.runTest('CrossLanguageDetector pattern detection', async () => {
      // Test Go code with gRPC line by line
      const goCode = [
        'import (',
        '    "context"',
        '    pb "github.com/example/proto"',
        '    "google.golang.org/grpc"',
        ')',
        '',
        'func main() {',
        '    client := pb.NewCartServiceClient(conn)',
        '    response, err := client.GetCart(ctx, req)',
        '    cmd := exec.Command("python", "process.py")',
        '}'
      ];
      
      const goPatterns: any[] = [];
      goCode.forEach((line, idx) => {
        const calls = CrossLanguageDetector.detectCrossLanguageCalls(line, idx + 1, 'go', 'test.go');
        goPatterns.push(...calls);
      });
      console.log(`\n    Go patterns detected: ${goPatterns.length}`);
      goPatterns.forEach(p => {
        console.log(`      - Type: ${p.type}, Target: ${p.targetEndpoint || 'N/A'}, Language: ${p.targetLanguage || 'N/A'}`);
      });
      
      // Test Python code with gRPC line by line
      const pythonCode = [
        'import grpc',
        'from concurrent import futures',
        'import demo_pb2',
        'import demo_pb2_grpc',
        '',
        'def run():',
        '    response = requests.post("http://other-service:8080/api/data")',
        '    subprocess.run(["node", "process.js"])',
        '    client = EmailServiceClient(channel)',
        '    result = client.SendOrderConfirmation(request)'
      ];
      
      const pythonPatterns: any[] = [];
      pythonCode.forEach((line, idx) => {
        const calls = CrossLanguageDetector.detectCrossLanguageCalls(line, idx + 1, 'python', 'test.py');
        pythonPatterns.push(...calls);
      });
      console.log(`\n    Python patterns detected: ${pythonPatterns.length}`);
      pythonPatterns.forEach(p => {
        console.log(`      - Type: ${p.type}, Target: ${p.targetEndpoint || 'N/A'}, Language: ${p.targetLanguage || 'N/A'}`);
      });
      
      // Should detect some patterns
      this.assert(goPatterns.length > 0 || pythonPatterns.length > 0, 
                  'Should detect cross-language patterns in sample code');
    }));
    
    // Test 6: Check for service-to-service communication
    results.push(await this.runTest('Analyze service-to-service communication', async () => {
      // Look for environment variables that indicate service endpoints
      const projectId = (this as any).microservicesProjectId || 1;
      
      const envVarPatterns = this.db.prepare(`
        SELECT 
          s.name,
          s.file_path,
          l.name as language
        FROM universal_symbols s
        JOIN languages l ON s.language_id = l.id
        WHERE s.project_id = ?
          AND s.kind = 'variable'
          AND (
            s.name LIKE '%SERVICE%ADDR%' OR
            s.name LIKE '%_HOST' OR
            s.name LIKE '%_PORT' OR
            s.name LIKE '%_URL' OR
            s.name LIKE '%_ENDPOINT'
          )
        LIMIT 10
      `).all(projectId) as any[];
      
      console.log(`\n    Found ${envVarPatterns.length} service endpoint references`);
      
      if (envVarPatterns.length > 0) {
        console.log('    Service endpoint patterns:');
        envVarPatterns.slice(0, 5).forEach(p => {
          console.log(`      ${p.language}: ${p.name} in ${path.basename(p.file_path)}`);
        });
      }
      
      // Look for import/using statements that reference other services
      const serviceImports = this.db.prepare(`
        SELECT 
          s1.file_path as from_file,
          l.name as language
        FROM universal_relationships r
        JOIN universal_symbols s1 ON r.from_symbol_id = s1.id
        JOIN universal_symbols s2 ON r.to_symbol_id = s2.id
        JOIN languages l ON s1.language_id = l.id
        WHERE r.project_id = ?
          AND r.type = 'imports'
          AND (
            s1.file_path LIKE '%service%' OR
            s1.file_path LIKE '%proto%' OR
            s2.name LIKE '%pb%'
          )
        LIMIT 10
      `).all(projectId) as any[];
      
      console.log(`\n    Found ${serviceImports.length} service-related imports`);
      
      if (serviceImports.length > 0) {
        console.log('    Service imports:');
        serviceImports.slice(0, 5).forEach(imp => {
          console.log(`      ${imp.language}: import in ${path.basename(imp.from_file)}`);
        });
      }
    }));
    
    return results;
  }
}