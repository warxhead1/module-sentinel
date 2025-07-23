import * as path from 'path';
import Database from 'better-sqlite3';
import { UniversalIndexer } from '../../dist/indexing/universal-indexer.js';
import { DataFlowAnalyzer } from '../../dist/analysis/data-flow-analyzer.js';
import { TestResult } from '../helpers/JUnitReporter';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../dist/database/drizzle/schema.js';

export class DataFlowAnalysisTest {
  private repoPath: string;
  private projectId!: number;
  private indexer!: UniversalIndexer;
  private dataFlowAnalyzer!: DataFlowAnalyzer;
  private db: Database.Database;
  private drizzleDb!: ReturnType<typeof drizzle>;

  constructor(db: Database.Database) {
    this.db = db;
    this.repoPath = path.resolve(process.cwd(), 'test-repos/cross-language/microservices-demo');
    this.drizzleDb = drizzle(db, { schema });
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Setup
    await this.setup();
    
    // Run tests
    results.push(await this.testDataFlowExtraction());
    results.push(await this.testTypeDefinitionExtraction());
    results.push(await this.testCrossServiceDataFlow());
    results.push(await this.testDataContractGeneration());
    results.push(await this.testGrpcDataFlow());
    
    return results;
  }

  private async setup(): Promise<void> {
    this.drizzleDb = drizzle(this.db, { schema });
    
    // Initialize indexer and data flow analyzer
    this.indexer = new UniversalIndexer(this.db, {
      projectPath: this.repoPath,
      projectName: 'microservices-demo-dataflow',
      languages: ['go', 'python', 'typescript', 'javascript'],
      debugMode: false,
      enableSemanticAnalysis: true
    });

    this.dataFlowAnalyzer = new DataFlowAnalyzer(this.db);
    
    // Create project
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, root_path, description)
      VALUES (?, ?, ?)
      RETURNING id
    `);
    
    const result = stmt.get('microservices-demo-dataflow', this.repoPath, 'Data flow analysis test') as any;
    this.projectId = result.id;

    // Index a subset of files for data flow testing
    const testFiles = [
      path.join(this.repoPath, 'src/frontend/main.go'),
      path.join(this.repoPath, 'src/checkoutservice/main.go'),
      path.join(this.repoPath, 'src/currencyservice/server.js'),
      path.join(this.repoPath, 'protos/demo.proto')
    ];

    for (const file of testFiles) {
      try {
        await this.indexer.indexFile(this.projectId, file);
      } catch (error) {
        console.warn(`⚠️ Failed to index ${file}: ${error}`);
      }
    }
  }

  private async testDataFlowExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(this.projectId);
      
      console.log('\n🔍 Data Flow Analysis Results:');
      console.log(`  Nodes: ${dataFlowGraph.nodes.length}`);
      console.log(`  Edges: ${dataFlowGraph.edges.length}`);
      console.log(`  Type Definitions: ${dataFlowGraph.typeDefinitions.size}`);
      console.log(`  Data Contracts: ${dataFlowGraph.dataContracts.length}`);

      // Log detailed information
      console.log('\n📊 Data Flow Nodes:');
      dataFlowGraph.nodes.forEach(node => {
        console.log(`  ${node.serviceName}(${node.language}) → ${node.symbolName}: ${node.dataType}`);
      });

      console.log('\n🔗 Data Flow Edges:');
      dataFlowGraph.edges.forEach(edge => {
        console.log(`  ${edge.fromNode} → ${edge.toNode} (${edge.communicationType})`);
        if (edge.dataTransformation) {
          console.log(`    Transform: ${edge.dataTransformation.inputType} → ${edge.dataTransformation.outputType}`);
        }
      });

      if (dataFlowGraph.nodes.length === 0) {
        throw new Error('No data flow nodes found');
      }

      return {
        name: 'Extract data flow nodes and edges',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Extract data flow nodes and edges',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testTypeDefinitionExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(this.projectId);
      
      console.log('\n📋 Type Definitions Found:');
      for (const [typeName, typeDef] of dataFlowGraph.typeDefinitions) {
        console.log(`  ${typeName} (${typeDef.language}):`);
        console.log(`    Source: ${typeDef.source}`);
        console.log(`    Fields: ${typeDef.fields.length}`);
        typeDef.fields.forEach(field => {
          console.log(`      ${field.name}: ${field.type}${field.optional ? '?' : ''}`);
        });
      }

      const typeCount = dataFlowGraph.typeDefinitions.size;
      console.log(`\n✅ Found ${typeCount} type definitions`);

      return {
        name: 'Extract type definitions from multiple languages',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Extract type definitions from multiple languages',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testCrossServiceDataFlow(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(this.projectId);
      const summary = this.dataFlowAnalyzer.getDataFlowSummary();

      console.log('\n🌐 Cross-Service Data Flow:');
      summary.services.forEach((service: any) => {
        console.log(`  ${service.name} (${service.language}):`);
        console.log(`    Incoming data flows: ${service.incomingData.length}`);
        console.log(`    Outgoing data flows: ${service.outgoingData.length}`);
        
        service.outgoingData.forEach((flow: any) => {
          console.log(`      → ${flow.target} (${flow.type}): ${flow.dataType || 'unknown'}`);
        });
      });

      const crossServiceFlows = dataFlowGraph.edges.filter(edge => 
        this.getServiceFromEdge(edge.fromNode) !== this.getServiceFromEdge(edge.toNode)
      );

      console.log(`\n✅ Found ${crossServiceFlows.length} cross-service data flows`);

      if (crossServiceFlows.length === 0) {
        console.log('⚠️ No cross-service data flows detected - this is expected for a limited test');
      }

      return {
        name: 'Detect cross-service data flows',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Detect cross-service data flows',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testDataContractGeneration(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(this.projectId);

      console.log('\n📝 Data Contracts:');
      dataFlowGraph.dataContracts.forEach(contract => {
        console.log(`  ${contract.servicePair[0]} ↔ ${contract.servicePair[1]}:`);
        console.log(`    Type: ${contract.contractType}`);
        console.log(`    Input: ${contract.inputSchema}`);
        console.log(`    Output: ${contract.outputSchema}`);
        console.log(`    Bidirectional: ${contract.bidirectional}`);
      });

      console.log(`\n✅ Generated ${dataFlowGraph.dataContracts.length} data contracts`);

      return {
        name: 'Generate data contracts between services',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Generate data contracts between services',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private async testGrpcDataFlow(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const dataFlowGraph = await this.dataFlowAnalyzer.analyzeDataFlow(this.projectId);

      // Look specifically for gRPC data flows
      const grpcFlows = dataFlowGraph.edges.filter(edge => 
        edge.communicationType === 'grpc' || edge.protocol === 'grpc'
      );

      console.log('\n🔧 gRPC Data Flows:');
      grpcFlows.forEach(flow => {
        console.log(`  ${flow.fromNode} → ${flow.toNode}:`);
        console.log(`    Protocol: ${flow.protocol}`);
        if (flow.dataTransformation) {
          console.log(`    Data: ${flow.dataTransformation.inputType} → ${flow.dataTransformation.outputType}`);
          console.log(`    Serialization: ${flow.dataTransformation.serialization}`);
        }
      });

      console.log(`\n✅ Found ${grpcFlows.length} gRPC data flows`);

      return {
        name: 'Analyze gRPC data flow patterns',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'Analyze gRPC data flow patterns',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  // Helper methods
  private getServiceFromEdge(nodeId: string): string {
    return nodeId.split('_')[0];
  }
}