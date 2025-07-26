/**
 * Cross-Language API Linkage Detector
 *
 * This system detects and maps API boundaries between different languages,
 * including FFI calls, REST APIs, gRPC services, and other inter-language communication.
 */

import { EventEmitter } from "events";
import Database from "better-sqlite3";
import { DrizzleDatabase, type DrizzleDb } from "../database/drizzle-db.js";
import {
  UniversalSymbol,
  UniversalRelationship as _UniversalRelationship,
  UniversalRelationshipType as _UniversalRelationshipType,
} from "../parsers/language-parser-interface.js";

/**
 * API binding types
 */
export enum ApiBindingType {
  FFI = "ffi", // Foreign Function Interface
  REST = "rest", // REST API calls
  GraphQL = "graphql", // GraphQL queries/mutations
  gRPC = "grpc", // gRPC service calls
  WebSocket = "websocket", // WebSocket connections
  Database = "database", // Database queries
  MessageQueue = "message_queue", // Message queue operations
  SharedMemory = "shared_memory", // Shared memory access
  PipeIPC = "pipe_ipc", // Named pipes / IPC
  SocketIPC = "socket_ipc", // Unix domain sockets
  COM = "com", // COM objects (Windows)
  JNI = "jni", // Java Native Interface
  PythonC = "python_c", // Python C extensions
  NodeAddon = "node_addon", // Node.js native addons
  WebAssembly = "webassembly", // WebAssembly imports/exports
  Custom = "custom", // Custom protocol
}

/**
 * API binding detection result
 */
export interface ApiBinding {
  id?: number;
  projectId: number;

  // Source and target information
  sourceSymbolId?: string;
  targetSymbolId?: string;
  sourceLanguage: string;
  targetLanguage: string;

  // Binding details
  bindingType: ApiBindingType;
  protocol?: string;
  endpoint?: string;

  // Type mapping between languages
  typeMapping: TypeMapping;

  // Serialization details
  serializationFormat?: SerializationFormat;
  schemaDefinition?: string;

  // Detection metadata
  confidence: number;
  detectorName: string;
  detectionReason: string;

  // Additional metadata
  metadata?: Record<string, any>;

  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Type mapping between languages
 */
export interface TypeMapping {
  sourceType: string;
  targetType: string;
  mappingRules?: TypeMappingRule[];
  isLossless: boolean;
  requiresValidation: boolean;
}

/**
 * Type mapping rule
 */
export interface TypeMappingRule {
  sourcePattern: string;
  targetPattern: string;
  transformation?: string;
  validation?: string;
}

/**
 * Serialization format
 */
export enum SerializationFormat {
  JSON = "json",
  XML = "xml",
  Protobuf = "protobuf",
  MessagePack = "msgpack",
  Avro = "avro",
  Thrift = "thrift",
  CBOR = "cbor",
  BSON = "bson",
  Binary = "binary",
  Text = "text",
}

/**
 * Cross-language dependency
 */
export interface CrossLanguageDependency {
  id?: number;
  projectId: number;

  // Language information
  fromLanguage: string;
  toLanguage: string;

  // Dependency details
  dependencyType: DependencyType;
  dependencyPath: string;

  // Symbols involved
  fromSymbolId?: string;
  toSymbolId?: string;

  // Metadata
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Dependency types
 */
export enum DependencyType {
  Build = "build", // Build-time dependency
  Runtime = "runtime", // Runtime dependency
  Interface = "interface", // Interface definition
  Library = "library", // Shared library
  Service = "service", // External service
  Data = "data", // Data dependency
  Config = "config", // Configuration dependency
}

/**
 * API linkage detector class
 */
export class ApiLinkageDetector extends EventEmitter {
  private drizzleDb: DrizzleDatabase;
  private detectors: Map<string, ApiDetector> = new Map();

  constructor(dbOrPath: string | Database.Database | DrizzleDb) {
    super();
    if (typeof dbOrPath === "string") {
      const db = new Database(dbOrPath);
      this.drizzleDb = new DrizzleDatabase(db);
    } else if ('select' in dbOrPath && 'insert' in dbOrPath) {
      this.drizzleDb = new DrizzleDatabase(dbOrPath);
    } else {
      this.drizzleDb = new DrizzleDatabase(dbOrPath);
    }
    this.initializeDatabase();
    this.registerBuiltinDetectors();
  }

  /**
   * Initialize database tables
   */
  private initializeDatabase(): void {
    // Database tables are now managed by Drizzle migrations
  }

  /**
   * Register an API detector
   */
  registerDetector(name: string, detector: ApiDetector): void {
    this.detectors.set(name, detector);
    this.emit("detector:registered", { name, detector });
  }

  /**
   * Detect API bindings in a project
   */
  async detectApiBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]> {
    const bindings: ApiBinding[] = [];

    // Run all registered detectors
    for (const [name, detector] of this.detectors) {
      try {
        const detectorBindings = await detector.detectBindings(
          projectId,
          symbols
        );
        bindings.push(...detectorBindings);
      } catch (error) {
        console.warn(`API detector ${name} failed:`, error);
        this.emit("detector:error", { name, error });
      }
    }

    // Store bindings in database
    for (const binding of bindings) {
      await this.storeApiBinding(binding);
    }

    return bindings;
  }

  /**
   * Store API binding in database
   */
  async storeApiBinding(binding: ApiBinding): Promise<number> {
    return await this.drizzleDb.insertApiBinding({
      projectId: binding.projectId,
      sourceSymbolId: binding.sourceSymbolId || null,
      targetSymbolId: binding.targetSymbolId || null,
      sourceLanguage: binding.sourceLanguage,
      targetLanguage: binding.targetLanguage,
      bindingType: binding.bindingType,
      protocol: binding.protocol || null,
      endpoint: binding.endpoint || null,
      typeMapping: binding.typeMapping,
      serializationFormat: binding.serializationFormat || null,
      schemaDefinition: binding.schemaDefinition || null,
      confidence: binding.confidence,
      detectorName: binding.detectorName,
      detectionReason: binding.detectionReason || "",
      metadata: binding.metadata || null
    });
  }

  /**
   * Get API bindings for a project
   */
  async getApiBindings(
    projectId: number,
    bindingType?: ApiBindingType
  ): Promise<ApiBinding[]> {
    const rows = await this.drizzleDb.getApiBindings(projectId, bindingType);
    return rows.map((row) => this.dbRowToApiBinding(row));
  }

  /**
   * Get cross-language dependencies
   */
  async getCrossLanguageDependencies(projectId: number): Promise<CrossLanguageDependency[]> {
    const rows = await this.drizzleDb.getCrossLanguageDependencies(projectId);
    return rows.map((row) => this.dbRowToCrossLanguageDependency(row));
  }

  /**
   * Find semantic equivalents between languages
   */
  async findSemanticEquivalents(
    projectId: number,
    symbols: UniversalSymbol[],
    language1: string,
    language2: string
  ): Promise<any[]> {
    const equivalents: any[] = [];

    // Group symbols by language
    const lang1Symbols = symbols.filter(
      (s) => s.languageFeatures?.language === language1
    );
    const lang2Symbols = symbols.filter(
      (s) => s.languageFeatures?.language === language2
    );

    // Find potential equivalents based on name similarity
    for (const symbol1 of lang1Symbols) {
      for (const symbol2 of lang2Symbols) {
        const similarity = this.calculateSymbolSimilarity(symbol1, symbol2);

        if (similarity > 0.7) {
          equivalents.push({
            symbol1: symbol1.qualifiedName,
            symbol2: symbol2.qualifiedName,
            similarity,
            type: "name_similarity",
          });
        }
      }
    }

    return equivalents;
  }

  /**
   * Register built-in detectors
   */
  private registerBuiltinDetectors(): void {
    // REST API detector
    this.registerDetector("rest-api", new RestApiDetector());

    // FFI detector
    this.registerDetector("ffi", new FfiDetector());

    // gRPC detector
    this.registerDetector("grpc", new GrpcDetector());

    // WebSocket detector
    this.registerDetector("websocket", new WebSocketDetector());

    // Database detector
    this.registerDetector("database", new DatabaseDetector());
  }

  /**
   * Calculate similarity between two symbols
   */
  private calculateSymbolSimilarity(
    symbol1: UniversalSymbol,
    symbol2: UniversalSymbol
  ): number {
    // Simple name-based similarity
    const name1 = symbol1.name.toLowerCase();
    const name2 = symbol2.name.toLowerCase();

    if (name1 === name2) return 1.0;

    // Levenshtein distance
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);

    return 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Convert database row to API binding
   */
  private dbRowToApiBinding(row: any): ApiBinding {
    return {
      id: row.id,
      projectId: row.project_id,
      sourceSymbolId: row.source_symbol_id,
      targetSymbolId: row.target_symbol_id,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      bindingType: row.binding_type as ApiBindingType,
      protocol: row.protocol,
      endpoint: row.endpoint,
      typeMapping: JSON.parse(row.type_mapping),
      serializationFormat: row.serialization_format as SerializationFormat,
      schemaDefinition: row.schema_definition,
      confidence: row.confidence,
      detectorName: row.detector_name,
      detectionReason: row.detection_reason,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  /**
   * Convert database row to cross-language dependency
   */
  private dbRowToCrossLanguageDependency(row: any): CrossLanguageDependency {
    return {
      id: row.id,
      projectId: row.project_id,
      fromLanguage: row.from_language,
      toLanguage: row.to_language,
      dependencyType: row.dependency_type as DependencyType,
      dependencyPath: row.dependency_path,
      fromSymbolId: row.from_symbol_id,
      toSymbolId: row.to_symbol_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    // DrizzleDatabase manages its own connection
  }
}

/**
 * API detector interface
 */
export interface ApiDetector {
  detectBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]>;
}

/**
 * REST API detector
 */
class RestApiDetector implements ApiDetector {
  async detectBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]> {
    const bindings: ApiBinding[] = [];

    // Look for HTTP client calls
    const httpSymbols = symbols.filter(
      (s) =>
        s.signature?.includes("http") ||
        s.signature?.includes("fetch") ||
        s.signature?.includes("axios") ||
        s.signature?.includes("request")
    );

    for (const symbol of httpSymbols) {
      bindings.push({
        projectId,
        sourceSymbolId: symbol.qualifiedName,
        sourceLanguage: symbol.languageFeatures?.language || "unknown",
        targetLanguage: "http",
        bindingType: ApiBindingType.REST,
        protocol: "http",
        typeMapping: {
          sourceType: "object",
          targetType: "json",
          isLossless: false,
          requiresValidation: true,
        },
        serializationFormat: SerializationFormat.JSON,
        confidence: 0.8,
        detectorName: "rest-api",
        detectionReason: "HTTP client call detected",
        createdAt: new Date(),
      });
    }

    return bindings;
  }
}

/**
 * FFI detector
 */
class FfiDetector implements ApiDetector {
  async detectBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]> {
    const bindings: ApiBinding[] = [];

    // Look for extern declarations
    const externSymbols = symbols.filter(
      (s) =>
        s.languageFeatures?.isExtern ||
        s.signature?.includes("extern") ||
        s.signature?.includes("__declspec(dllimport)")
    );

    for (const symbol of externSymbols) {
      bindings.push({
        projectId,
        sourceSymbolId: symbol.qualifiedName,
        sourceLanguage: symbol.languageFeatures?.language || "cpp",
        targetLanguage: "c",
        bindingType: ApiBindingType.FFI,
        typeMapping: {
          sourceType: "native",
          targetType: "native",
          isLossless: true,
          requiresValidation: false,
        },
        confidence: 0.9,
        detectorName: "ffi",
        detectionReason: "Extern symbol declaration detected",
        createdAt: new Date(),
      });
    }

    return bindings;
  }
}

/**
 * gRPC detector
 */
class GrpcDetector implements ApiDetector {
  async detectBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]> {
    const bindings: ApiBinding[] = [];

    // Look for gRPC-related symbols
    const grpcSymbols = symbols.filter(
      (s) =>
        s.signature?.includes("grpc") ||
        s.namespace?.includes("grpc") ||
        s.signature?.includes(".proto")
    );

    for (const symbol of grpcSymbols) {
      bindings.push({
        projectId,
        sourceSymbolId: symbol.qualifiedName,
        sourceLanguage: symbol.languageFeatures?.language || "unknown",
        targetLanguage: "grpc",
        bindingType: ApiBindingType.gRPC,
        protocol: "grpc",
        typeMapping: {
          sourceType: "message",
          targetType: "protobuf",
          isLossless: true,
          requiresValidation: false,
        },
        serializationFormat: SerializationFormat.Protobuf,
        confidence: 0.9,
        detectorName: "grpc",
        detectionReason: "gRPC service call detected",
        createdAt: new Date(),
      });
    }

    return bindings;
  }
}

/**
 * WebSocket detector
 */
class WebSocketDetector implements ApiDetector {
  async detectBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]> {
    const bindings: ApiBinding[] = [];

    // Look for WebSocket-related symbols
    const wsSymbols = symbols.filter(
      (s) =>
        s.signature?.includes("websocket") ||
        s.signature?.includes("WebSocket") ||
        s.name.toLowerCase().includes("websocket")
    );

    for (const symbol of wsSymbols) {
      bindings.push({
        projectId,
        sourceSymbolId: symbol.qualifiedName,
        sourceLanguage: symbol.languageFeatures?.language || "unknown",
        targetLanguage: "websocket",
        bindingType: ApiBindingType.WebSocket,
        protocol: "websocket",
        typeMapping: {
          sourceType: "message",
          targetType: "text",
          isLossless: false,
          requiresValidation: true,
        },
        serializationFormat: SerializationFormat.JSON,
        confidence: 0.8,
        detectorName: "websocket",
        detectionReason: "WebSocket connection detected",
        createdAt: new Date(),
      });
    }

    return bindings;
  }
}

/**
 * Database detector
 */
class DatabaseDetector implements ApiDetector {
  async detectBindings(
    projectId: number,
    symbols: UniversalSymbol[]
  ): Promise<ApiBinding[]> {
    const bindings: ApiBinding[] = [];

    // Look for database-related symbols
    const dbSymbols = symbols.filter(
      (s) =>
        s.signature?.includes("sql") ||
        s.signature?.includes("database") ||
        s.signature?.includes("query") ||
        s.name.toLowerCase().includes("db")
    );

    for (const symbol of dbSymbols) {
      bindings.push({
        projectId,
        sourceSymbolId: symbol.qualifiedName,
        sourceLanguage: symbol.languageFeatures?.language || "unknown",
        targetLanguage: "sql",
        bindingType: ApiBindingType.Database,
        protocol: "sql",
        typeMapping: {
          sourceType: "object",
          targetType: "row",
          isLossless: false,
          requiresValidation: true,
        },
        confidence: 0.7,
        detectorName: "database",
        detectionReason: "Database query detected",
        createdAt: new Date(),
      });
    }

    return bindings;
  }
}
