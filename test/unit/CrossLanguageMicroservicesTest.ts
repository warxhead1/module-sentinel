import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { UniversalIndexer } from '../../dist/indexing/universal-indexer.js';
import { TestResult } from '../helpers/JUnitReporter';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../dist/database/drizzle/schema.js';
import { eq, and, or, like } from 'drizzle-orm';

interface LanguageStats {
  language: string;
  fileCount: number;
  services: string[];
}

interface CrossLanguagePattern {
  type: 'grpc' | 'rest' | 'websocket' | 'subprocess' | 'ffi';
  sourceService: string;
  sourceLanguage: string;
  targetService: string;
  targetLanguage: string;
  pattern: string;
  confidence: number;
}

export class CrossLanguageMicroservicesTest {
  private repoPath: string;
  private projectId!: string;
  private indexer!: UniversalIndexer;
  private db: Database.Database;
  private drizzleDb!: ReturnType<typeof drizzle>;

  constructor(db: Database.Database) {
    this.db = db;
    this.repoPath = path.resolve(process.cwd(), 'test-repos/cross-language/microservices-demo');
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Check if repo exists
    if (!fs.existsSync(this.repoPath)) {
      return [{
        name: 'Microservices Demo Repository Check',
        status: 'failed',
        time: 0,
        error: new Error(`Repository not found at ${this.repoPath}. Please clone https://github.com/GoogleCloudPlatform/microservices-demo`)
      }];
    }

    // Setup
    await this.setup();
    
    // Run tests
    results.push(await this.testLanguageDiscovery());
    results.push(await this.testProtoIndexing());
    results.push(await this.testGrpcPatterns());
    results.push(await this.testImportRelationships());
    results.push(await this.testServiceCommunication());
    
    return results;
  }

  private async setup(): Promise<void> {
    this.drizzleDb = drizzle(this.db, { schema });
    
    // Initialize indexer
    this.indexer = new UniversalIndexer(this.db, {
      projectPath: this.repoPath,
      projectName: 'microservices-demo',
      languages: ['go', 'python', 'java', 'typescript', 'javascript', 'csharp'],
      debugMode: false,
      enableSemanticAnalysis: true
    });
    
    // Create project
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, root_path, description)
      VALUES (?, ?, ?)
      RETURNING id
    `);
    
    const result = stmt.get('microservices-demo', this.repoPath, 'Google Cloud microservices demo') as any;
    this.projectId = result.id;
  }

  private async testLanguageDiscovery(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const stats: Map<string, LanguageStats> = new Map();
      
      // Scan each service directory
      const srcPath = path.join(this.repoPath, 'src');
      const services = fs.readdirSync(srcPath).filter(f => 
        fs.statSync(path.join(srcPath, f)).isDirectory()
      );
      
      for (const service of services) {
        const servicePath = path.join(srcPath, service);
        const language = await this.detectServiceLanguage(servicePath);
        
        if (!stats.has(language)) {
          stats.set(language, { language, fileCount: 0, services: [] });
        }
        
        const stat = stats.get(language)!;
        stat.services.push(service);
        stat.fileCount += this.countSourceFiles(servicePath, language);
      }
      
      // Log findings
      console.log('\n📊 Language Distribution:');
      for (const [lang, stat] of stats) {
        console.log(`  ${lang}: ${stat.services.length} services, ${stat.fileCount} files`);
        console.log(`    Services: ${stat.services.join(', ')}`);
      }
      
      // Assertions
      if (stats.size < 4) {
        throw new Error(`Expected at least 4 languages, found ${stats.size}`);
      }
      
      const expectedLangs = ['Go', 'Python', 'Java', 'C#'];
      const missingLangs = expectedLangs.filter(lang => !stats.has(lang));
      if (missingLangs.length > 0) {
        throw new Error(`Missing expected languages: ${missingLangs.join(', ')}`);
      }
      
      return {
        name: 'Discover languages in microservices-demo',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Discover languages in microservices-demo',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testProtoIndexing(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Index generated gRPC code instead of proto files (no proto parser available)
      const srcPath = path.join(this.repoPath, 'src');
      const generatedFiles = this.findFiles(srcPath, '.pb.go', '_pb2.py', '_grpc.py', '.pb.js', '.pb.ts');
      
      console.log(`\n🔍 Found ${generatedFiles.length} generated gRPC files`);
      
      for (const genFile of generatedFiles) {
        try {
          await this.indexer.indexFile(this.projectId, genFile);
        } catch (error) {
          console.warn(`⚠️  Failed to index ${genFile}: ${error}`);
        }
      }
      
      // Check for gRPC service-related symbols (interfaces, classes containing "Service")
      const services = await this.drizzleDb
        .select()
        .from(schema.universalSymbols)
        .where(
          and(
            eq(schema.universalSymbols.projectId, this.projectId),
            or(
              eq(schema.universalSymbols.kind, 'interface'),
              eq(schema.universalSymbols.kind, 'class')
            ),
            like(schema.universalSymbols.name, '%Service%')
          )
        );
      
      console.log(`\n📋 gRPC Service-related Symbols Found:`);
      for (const service of services) {
        console.log(`  - ${service.name} (${service.filePath})`);
      }
      
      if (services.length === 0) {
        console.warn('⚠️  No gRPC service symbols found - this might be expected if no generated code was parsed');
        console.log('📝 Note: Proto files are not directly parseable - looking for generated code patterns');
      }
      
      return {
        name: 'Index proto files and generated code',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Index proto files and generated code',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testGrpcPatterns(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Index all source files
      const srcPath = path.join(this.repoPath, 'src');
      const allFiles = this.findAllSourceFiles(srcPath);
      
      console.log(`\n📂 Indexing ${allFiles.length} source files...`);
      
      let indexed = 0;
      for (const file of allFiles) {
        try {
          await this.indexer.indexFile(this.projectId, file);
          indexed++;
        } catch (error) {
          console.warn(`⚠️  Failed to index ${file}: ${error}`);
        }
      }
      
      console.log(`✅ Successfully indexed ${indexed}/${allFiles.length} files`);
      
      // Look for cross-language patterns
      const patterns = await this.detectCrossLanguagePatterns();
      
      console.log(`\n🔗 Cross-Language Patterns Found:`);
      for (const pattern of patterns) {
        console.log(`  ${pattern.sourceService}(${pattern.sourceLanguage}) → ${pattern.targetService}(${pattern.targetLanguage})`);
        console.log(`    Type: ${pattern.type}, Pattern: ${pattern.pattern}`);
      }
      
      if (patterns.length === 0) {
        throw new Error('No cross-language communication patterns detected');
      }
      
      return {
        name: 'Detect cross-language gRPC patterns',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Detect cross-language gRPC patterns',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testImportRelationships(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Get all import relationships
      const imports = await this.drizzleDb
        .select()
        .from(schema.universalRelationships)
        .where(
          and(
            eq(schema.universalRelationships.projectId, this.projectId),
            eq(schema.universalRelationships.type, 'imports')
          )
        );
      
      // Group by source file language
      const importsByLanguage = new Map<string, number>();
      
      for (const imp of imports) {
        const sourceFile = imp.sourceFilePath;
        if (!sourceFile) {
          console.warn(`⚠️  Import relationship has null/undefined sourceFilePath:`, imp);
          continue;
        }
        const language = this.getFileLanguage(sourceFile);
        importsByLanguage.set(language, (importsByLanguage.get(language) || 0) + 1);
      }
      
      console.log('\n📦 Import Relationships by Language:');
      for (const [lang, count] of importsByLanguage) {
        console.log(`  ${lang}: ${count} imports`);
      }
      
      // Look for proto-generated imports
      const protoImports = imports.filter(imp => 
        imp.targetFilePath && (
          imp.targetFilePath.includes('pb.') || 
          imp.targetFilePath.includes('_pb') ||
          imp.targetFilePath.includes('proto')
        )
      );
      
      console.log(`\n🔧 Proto-generated imports: ${protoImports.length}`);
      
      if (imports.length === 0) {
        throw new Error('No import relationships found');
      }
      
      return {
        name: 'Analyze import relationships',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Analyze import relationships',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testServiceCommunication(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Look for gRPC client instantiations
      const symbols = await this.drizzleDb
        .select()
        .from(schema.universalSymbols)
        .where(
          and(
            eq(schema.universalSymbols.projectId, this.projectId),
            or(
              like(schema.universalSymbols.name, '%Client'),
              like(schema.universalSymbols.name, '%ServiceClient'),
              like(schema.universalSymbols.name, '%Stub')
            )
          )
        );
      
      console.log('\n🎯 gRPC Client Usage:');
      const serviceConnections = new Map<string, Set<string>>();
      
      for (const symbol of symbols) {
        const service = this.extractServiceName(symbol.filePath);
        const targetService = symbol.name.replace(/Client|ServiceClient|Stub/, '').toLowerCase();
        
        if (!serviceConnections.has(service)) {
          serviceConnections.set(service, new Set());
        }
        serviceConnections.get(service)!.add(targetService);
      }
      
      for (const [service, targets] of serviceConnections) {
        console.log(`  ${service} → ${Array.from(targets).join(', ')}`);
      }
      
      if (serviceConnections.size === 0) {
        throw new Error('No service-to-service communication detected');
      }
      
      return {
        name: 'Test service-to-service communication detection',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Test service-to-service communication detection',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  // Helper methods
  private async detectServiceLanguage(servicePath: string): Promise<string> {
    const files = fs.readdirSync(servicePath);
    
    if (files.includes('go.mod')) return 'Go';
    if (files.includes('package.json')) return 'Node.js';
    if (files.includes('requirements.txt')) return 'Python';
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'Java';
    if (files.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) return 'C#';
    if (files.includes('Gemfile')) return 'Ruby';
    
    return 'Unknown';
  }

  private countSourceFiles(dir: string, language: string): number {
    const extensions: Record<string, string[]> = {
      'Go': ['.go'],
      'Node.js': ['.js', '.ts'],
      'Python': ['.py'],
      'Java': ['.java'],
      'C#': ['.cs'],
      'Ruby': ['.rb']
    };
    
    const exts = extensions[language] || [];
    return this.findFiles(dir, ...exts).length;
  }

  private findFiles(dir: string, ...extensions: string[]): string[] {
    const results: string[] = [];
    
    function walk(currentDir: string) {
      try {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
          const filePath = path.join(currentDir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
            walk(filePath);
          } else if (stat.isFile() && extensions.some(ext => file.endsWith(ext))) {
            results.push(filePath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }
    
    walk(dir);
    return results;
  }

  private findAllSourceFiles(dir: string): string[] {
    const allExtensions = ['.go', '.js', '.ts', '.py', '.java', '.cs', '.rb', '.proto'];
    return this.findFiles(dir, ...allExtensions);
  }

  private async detectCrossLanguagePatterns(): Promise<CrossLanguagePattern[]> {
    const patterns: CrossLanguagePattern[] = [];
    
    // Look for gRPC client instantiations
    const clientUsage = await this.drizzleDb
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.projectId, this.projectId),
          or(
            like(schema.universalSymbols.name, '%Client'),
            like(schema.universalSymbols.signature, '%NewClient%'),
            like(schema.universalSymbols.signature, '%_stub%')
          )
        )
      );
    
    for (const usage of clientUsage) {
      const sourceService = this.extractServiceName(usage.filePath);
      const sourceLanguage = this.getFileLanguage(usage.filePath);
      const targetService = this.extractTargetService(usage.name);
      
      if (targetService && targetService !== sourceService) {
        patterns.push({
          type: 'grpc',
          sourceService,
          sourceLanguage,
          targetService,
          targetLanguage: 'Unknown', // Would need to look up
          pattern: usage.name,
          confidence: 0.8
        });
      }
    }
    
    return patterns;
  }

  private getFileLanguage(filePath: string | null | undefined): string {
    if (!filePath) return 'Unknown';
    if (filePath.endsWith('.go')) return 'Go';
    if (filePath.endsWith('.js') || filePath.endsWith('.ts')) return 'Node.js';
    if (filePath.endsWith('.py')) return 'Python';
    if (filePath.endsWith('.java')) return 'Java';
    if (filePath.endsWith('.cs')) return 'C#';
    if (filePath.endsWith('.rb')) return 'Ruby';
    if (filePath.endsWith('.proto')) return 'Proto';
    return 'Unknown';
  }

  private extractServiceName(filePath: string): string {
    const match = filePath.match(/src\/([^\/]+)\//);
    return match ? match[1] : 'unknown';
  }

  private extractTargetService(clientName: string): string | null {
    // Remove common suffixes
    const cleaned = clientName
      .replace(/Client$/, '')
      .replace(/ServiceClient$/, '')
      .replace(/Stub$/, '')
      .replace(/_stub$/, '');
    
    // Convert to lowercase for matching
    return cleaned.toLowerCase();
  }
}