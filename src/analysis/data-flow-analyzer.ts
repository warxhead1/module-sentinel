/**
 * Data Flow Analyzer
 * 
 * Tracks data types, transformations, and flow patterns across services.
 * Understands how data moves through sockets, gRPC calls, REST APIs, etc.
 */

import { Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import * as schema from '../database/drizzle/schema.js';

export interface DataFlowNode {
  id: string;
  serviceId: string;
  serviceName: string;
  language: string;
  symbolName: string;
  dataType: string;
  schemaDefinition?: string;
  location: {
    filePath: string;
    line: number;
    column: number;
  };
}

export interface DataFlowEdge {
  id: string;
  fromNode: string;
  toNode: string;
  communicationType: 'grpc' | 'websocket' | 'rest' | 'message_queue' | 'direct_call';
  protocol: string;
  dataTransformation?: {
    inputType: string;
    outputType: string;
    transformationFunction?: string;
    serialization?: 'json' | 'protobuf' | 'binary' | 'custom';
  };
  metadata: {
    confidence: number;
    crossLanguage: boolean;
    async: boolean;
    bidirectional: boolean;
  };
}

export interface DataFlowGraph {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  typeDefinitions: Map<string, TypeDefinition>;
  dataContracts: DataContract[];
}

export interface TypeDefinition {
  name: string;
  language: string;
  definition: string;
  fields: TypeField[];
  source: 'protobuf' | 'typescript_interface' | 'go_struct' | 'java_class' | 'python_dataclass';
  filePath: string;
}

export interface TypeField {
  name: string;
  type: string;
  optional: boolean;
  repeated: boolean;
  validation?: string;
  tags?: string[];
}

export interface DataContract {
  id: string;
  servicePair: [string, string]; // [producer, consumer]
  contractType: 'grpc_service' | 'websocket_event' | 'rest_endpoint' | 'message_topic';
  inputSchema: string;
  outputSchema: string;
  bidirectional: boolean;
  versioning?: {
    version: string;
    backwardCompatible: boolean;
  };
}

export class DataFlowAnalyzer {
  private db: Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private typeDefinitions: Map<string, TypeDefinition> = new Map();
  private dataFlowGraph: DataFlowGraph;

  constructor(db: Database) {
    this.db = db;
    this.drizzleDb = drizzle(db, { schema });
    this.dataFlowGraph = {
      nodes: [],
      edges: [],
      typeDefinitions: new Map(),
      dataContracts: []
    };
  }

  /**
   * Analyze data flow for a specific project
   */
  async analyzeDataFlow(projectId: number): Promise<DataFlowGraph> {
    console.log(`🔍 Analyzing data flow for project ${projectId}...`);

    // Step 1: Extract type definitions from all languages
    await this.extractTypeDefinitions(projectId);

    // Step 2: Build data flow nodes (services, functions, data structures)
    await this.buildDataFlowNodes(projectId);

    // Step 3: Identify data flow edges (communication paths)
    await this.identifyDataFlowEdges(projectId);

    // Step 4: Analyze data transformations
    await this.analyzeDataTransformations(projectId);

    // Step 5: Generate data contracts
    await this.generateDataContracts(projectId);

    console.log(`✅ Data flow analysis complete: ${this.dataFlowGraph.nodes.length} nodes, ${this.dataFlowGraph.edges.length} edges`);
    return this.dataFlowGraph;
  }

  /**
   * Extract type definitions from protobuf, TypeScript interfaces, Go structs, etc.
   */
  private async extractTypeDefinitions(projectId: number): Promise<void> {
    const symbols = await this.drizzleDb
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.projectId, projectId),
          eq(schema.universalSymbols.kind, 'interface') // TypeScript interfaces
        )
      );

    for (const symbol of symbols) {
      const typeDef = await this.parseTypeDefinition(symbol);
      if (typeDef) {
        this.typeDefinitions.set(typeDef.name, typeDef);
        this.dataFlowGraph.typeDefinitions.set(typeDef.name, typeDef);
      }
    }

    // Also extract Go structs
    const structs = await this.drizzleDb
      .select()
      .from(schema.universalSymbols)
      .where(
        and(
          eq(schema.universalSymbols.projectId, projectId),
          eq(schema.universalSymbols.kind, 'struct') // Go structs
        )
      );

    for (const struct of structs) {
      const typeDef = await this.parseStructDefinition(struct);
      if (typeDef) {
        this.typeDefinitions.set(typeDef.name, typeDef);
        this.dataFlowGraph.typeDefinitions.set(typeDef.name, typeDef);
      }
    }

    console.log(`📋 Extracted ${this.typeDefinitions.size} type definitions`);
  }

  /**
   * Build nodes representing data flow endpoints
   */
  private async buildDataFlowNodes(projectId: number): Promise<void> {
    // Get all services/functions that handle data
    const symbols = await this.drizzleDb
      .select()
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.projectId, projectId));

    const services = new Map<string, any>();

    // Group symbols by service (file-based grouping for microservices)
    for (const symbol of symbols) {
      const serviceName = this.extractServiceName(symbol.filePath);
      
      if (!services.has(serviceName)) {
        services.set(serviceName, {
          name: serviceName,
          language: symbol.languageId.toString() || 'unknown',
          symbols: [],
          endpoints: []
        });
      }

      const service = services.get(serviceName);
      service.symbols.push(symbol);

      // Identify data handling endpoints
      if (this.isDataEndpoint(symbol)) {
        const node: DataFlowNode = {
          id: `${serviceName}_${symbol.name}`,
          serviceId: serviceName,
          serviceName: serviceName,
          language: service.language,
          symbolName: symbol.name,
          dataType: this.extractDataType(symbol),
          schemaDefinition: symbol.signature || undefined,
          location: {
            filePath: symbol.filePath,
            line: symbol.line,
            column: symbol.column
          }
        };

        this.dataFlowGraph.nodes.push(node);
      }
    }

    console.log(`🏗️ Built ${this.dataFlowGraph.nodes.length} data flow nodes`);
  }

  /**
   * Identify communication edges between nodes
   */
  private async identifyDataFlowEdges(projectId: number): Promise<void> {
    // Get cross-language relationships (gRPC calls, HTTP requests, etc.)
    const relationships = await this.drizzleDb
      .select()
      .from(schema.universalRelationships)
      .where(eq(schema.universalRelationships.projectId, projectId));

    for (const rel of relationships) {
      const edge = await this.createDataFlowEdge(rel);
      if (edge) {
        this.dataFlowGraph.edges.push(edge);
      }
    }

    console.log(`🔗 Identified ${this.dataFlowGraph.edges.length} data flow edges`);
  }

  /**
   * Analyze how data transforms between services
   */
  private async analyzeDataTransformations(projectId: number): Promise<void> {
    for (const edge of this.dataFlowGraph.edges) {
      const transformation = await this.analyzeTransformation(edge);
      if (transformation) {
        edge.dataTransformation = transformation;
      }
    }

    console.log(`🔄 Analyzed data transformations for ${this.dataFlowGraph.edges.length} edges`);
  }

  /**
   * Generate data contracts between services
   */
  private async generateDataContracts(projectId: number): Promise<void> {
    const contractMap = new Map<string, DataContract>();

    for (const edge of this.dataFlowGraph.edges) {
      const contractId = `${edge.fromNode}_${edge.toNode}_${edge.communicationType}`;
      
      if (!contractMap.has(contractId)) {
        const contract: DataContract = {
          id: contractId,
          servicePair: [
            this.getServiceFromNode(edge.fromNode),
            this.getServiceFromNode(edge.toNode)
          ],
          contractType: this.mapCommunicationTypeToContract(edge.communicationType),
          inputSchema: edge.dataTransformation?.inputType || 'unknown',
          outputSchema: edge.dataTransformation?.outputType || 'unknown',
          bidirectional: edge.metadata.bidirectional
        };

        contractMap.set(contractId, contract);
      }
    }

    this.dataFlowGraph.dataContracts = Array.from(contractMap.values());
    console.log(`📝 Generated ${this.dataFlowGraph.dataContracts.length} data contracts`);
  }

  // Helper methods
  private async parseTypeDefinition(symbol: any): Promise<TypeDefinition | null> {
    if (!symbol.signature) return null;

    // Parse TypeScript interface
    const fields = this.parseInterfaceFields(symbol.signature);
    
    return {
      name: symbol.name,
      language: symbol.language || 'typescript',
      definition: symbol.signature,
      fields,
      source: 'typescript_interface',
      filePath: symbol.filePath
    };
  }

  private async parseStructDefinition(symbol: any): Promise<TypeDefinition | null> {
    if (!symbol.languageFeatures?.fields) return null;

    const fields: TypeField[] = symbol.languageFeatures.fields.map((field: any) => ({
      name: field.name,
      type: field.type,
      optional: false,
      repeated: false
    }));

    return {
      name: symbol.name,
      language: 'go',
      definition: symbol.signature || `type ${symbol.name} struct`,
      fields,
      source: 'go_struct',
      filePath: symbol.filePath
    };
  }

  private parseInterfaceFields(signature: string): TypeField[] {
    const fields: TypeField[] = [];
    // Simplified field parsing - would need more sophisticated parsing
    const fieldMatches = signature.match(/(\w+)(\?)?:\s*([^;,}]+)/g);
    
    if (fieldMatches) {
      for (const match of fieldMatches) {
        const [, name, optional, type] = match.match(/(\w+)(\?)?:\s*(.+)/) || [];
        if (name && type) {
          fields.push({
            name,
            type: type.trim(),
            optional: !!optional,
            repeated: type.includes('[]')
          });
        }
      }
    }

    return fields;
  }

  private extractServiceName(filePath: string): string {
    // Extract service name from microservices path pattern
    const match = filePath.match(/src\/([^\/]+)\//);
    return match ? match[1] : 'unknown';
  }

  private isDataEndpoint(symbol: any): boolean {
    // Check if symbol represents a data handling endpoint
    const isGrpcMethod = symbol.languageFeatures?.parameters?.some((p: any) => 
      p.type?.includes('pb.') || p.type?.includes('Request')
    );
    
    const isHttpHandler = symbol.signature?.includes('http') || 
                         symbol.signature?.includes('Request') ||
                         symbol.signature?.includes('Response');

    const isSocketHandler = symbol.signature?.includes('socket') ||
                           symbol.signature?.includes('emit') ||
                           symbol.signature?.includes('on');

    return isGrpcMethod || isHttpHandler || isSocketHandler;
  }

  private extractDataType(symbol: any): string {
    // Extract the primary data type this symbol works with
    if (symbol.languageFeatures?.returnTypes?.length > 0) {
      return symbol.languageFeatures.returnTypes[0];
    }

    if (symbol.languageFeatures?.parameters?.length > 0) {
      return symbol.languageFeatures.parameters[0].type;
    }

    return 'unknown';
  }

  private async createDataFlowEdge(relationship: any): Promise<DataFlowEdge | null> {
    if (!relationship.metadata?.crossLanguageType) return null;

    const communicationType = this.mapRelationshipTypeToCommunication(relationship.type);
    
    return {
      id: `${relationship.fromSymbolId}_${relationship.toSymbolId}`,
      fromNode: relationship.fromName || 'unknown',
      toNode: relationship.toName || 'unknown',
      communicationType,
      protocol: relationship.metadata.crossLanguageType || 'unknown',
      metadata: {
        confidence: relationship.confidence || 0.5,
        crossLanguage: true,
        async: relationship.metadata.isAsync || false,
        bidirectional: relationship.metadata.bidirectional || false
      }
    };
  }

  private async analyzeTransformation(edge: DataFlowEdge): Promise<any> {
    // Analyze data transformation between services
    // This would examine the actual data types and serialization methods
    return {
      inputType: 'Request',
      outputType: 'Response',
      serialization: edge.protocol === 'grpc' ? 'protobuf' : 'json'
    };
  }

  private getServiceFromNode(nodeId: string): string {
    return nodeId.split('_')[0];
  }

  private mapCommunicationTypeToContract(commType: string): DataContract['contractType'] {
    switch (commType) {
      case 'grpc': return 'grpc_service';
      case 'websocket': return 'websocket_event';
      case 'rest': return 'rest_endpoint';
      default: return 'grpc_service';
    }
  }

  private mapRelationshipTypeToCommunication(relType: string): DataFlowEdge['communicationType'] {
    switch (relType) {
      case 'invokes':
      case 'calls': return 'grpc';
      default: return 'direct_call';
    }
  }

  /**
   * Get data flow summary for visualization
   */
  getDataFlowSummary(): any {
    const serviceDataFlow = new Map<string, any>();

    // Group by service
    for (const node of this.dataFlowGraph.nodes) {
      if (!serviceDataFlow.has(node.serviceName)) {
        serviceDataFlow.set(node.serviceName, {
          name: node.serviceName,
          language: node.language,
          endpoints: [],
          incomingData: [],
          outgoingData: []
        });
      }
    }

    // Add data flow information
    for (const edge of this.dataFlowGraph.edges) {
      const fromService = this.getServiceFromNode(edge.fromNode);
      const toService = this.getServiceFromNode(edge.toNode);

      if (serviceDataFlow.has(fromService)) {
        serviceDataFlow.get(fromService).outgoingData.push({
          target: toService,
          type: edge.communicationType,
          dataType: edge.dataTransformation?.outputType
        });
      }

      if (serviceDataFlow.has(toService)) {
        serviceDataFlow.get(toService).incomingData.push({
          source: fromService,
          type: edge.communicationType,
          dataType: edge.dataTransformation?.inputType
        });
      }
    }

    return {
      services: Array.from(serviceDataFlow.values()),
      totalDataFlows: this.dataFlowGraph.edges.length,
      typeDefinitions: this.dataFlowGraph.typeDefinitions.size,
      dataContracts: this.dataFlowGraph.dataContracts.length
    };
  }
}