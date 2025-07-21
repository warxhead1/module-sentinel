/**
 * Cross-Language Relationship Analyzer
 * 
 * Detects relationships between symbols across different programming languages
 * through interface boundaries, FFI calls, API usage, and data serialization.
 */

import { 
  UniversalSymbol, 
  UniversalRelationship, 
  UniversalSymbolKind,
  UniversalRelationshipType 
} from './language-parser-interface.js';

/**
 * Cross-language bridge types
 */
export enum CrossLanguageBridgeType {
  FFI = 'ffi',                    // Foreign Function Interface
  API = 'api',                    // REST/GraphQL API calls
  RPC = 'rpc',                    // Remote Procedure Calls
  Database = 'database',          // Shared database access
  FileSystem = 'filesystem',      // File-based communication
  Socket = 'socket',              // Network socket communication
  SharedMemory = 'shared_memory', // Shared memory access
  Serialization = 'serialization', // Data serialization boundaries
  Configuration = 'configuration', // Shared configuration
  Environment = 'environment'     // Environment variables
}

/**
 * Cross-language relationship with bridge metadata
 */
export interface CrossLanguageRelationship extends UniversalRelationship {
  bridgeType: CrossLanguageBridgeType;
  fromLanguage: string;
  toLanguage: string;
  
  // Bridge-specific metadata
  bridgeMetadata: {
    // API/RPC specific
    endpoint?: string;
    method?: string;
    protocol?: string;
    
    // FFI specific
    libraryName?: string;
    functionName?: string;
    callingConvention?: string;
    
    // Serialization specific
    format?: string; // 'json', 'protobuf', 'xml', etc.
    schema?: string;
    
    // Database specific
    tableName?: string;
    queryType?: string;
    
    // File system specific
    filePath?: string;
    fileFormat?: string;
    
    // Configuration specific
    configKey?: string;
    configFormat?: string;
  };
  
  // Data flow information
  dataFlow?: {
    direction: 'bidirectional' | 'unidirectional';
    dataTypes: string[];
    transformations: string[];
  };
}

/**
 * Language interface definition
 */
export interface LanguageInterface {
  language: string;
  interfaceType: 'export' | 'import' | 'binding';
  symbols: UniversalSymbol[];
  bridgeTypes: CrossLanguageBridgeType[];
  
  // Interface metadata
  metadata: {
    // API interfaces
    apiSpec?: string; // OpenAPI, GraphQL schema, etc.
    baseUrl?: string;
    version?: string;
    
    // FFI interfaces
    headerFiles?: string[];
    libraryFiles?: string[];
    
    // Module interfaces
    exportedNames?: string[];
    importedNames?: string[];
  };
}

/**
 * Cross-language analyzer
 */
export class CrossLanguageAnalyzer {
  private languageInterfaces: Map<string, LanguageInterface[]> = new Map();
  private bridgeDetectors: Map<CrossLanguageBridgeType, BridgeDetector> = new Map();
  
  constructor() {
    this.initializeBridgeDetectors();
  }
  
  /**
   * Analyze symbols from multiple languages and detect cross-language relationships
   */
  async analyzeCrossLanguageRelationships(
    symbolsByLanguage: Map<string, UniversalSymbol[]>,
    existingRelationships: Map<string, UniversalRelationship[]>
  ): Promise<CrossLanguageRelationship[]> {
    const crossLanguageRels: CrossLanguageRelationship[] = [];
    
    // Step 1: Extract language interfaces
    const interfaces = this.extractLanguageInterfaces(symbolsByLanguage);
    
    // Step 2: Detect cross-language bridges
    const languages = Array.from(symbolsByLanguage.keys());
    
    for (let i = 0; i < languages.length; i++) {
      for (let j = i + 1; j < languages.length; j++) {
        const lang1 = languages[i];
        const lang2 = languages[j];
        
        const symbols1 = symbolsByLanguage.get(lang1) || [];
        const symbols2 = symbolsByLanguage.get(lang2) || [];
        
        // Detect relationships between these two languages
        const relationships = await this.detectBridgeRelationships(
          lang1, symbols1, lang2, symbols2, interfaces
        );
        
        crossLanguageRels.push(...relationships);
      }
    }
    
    // Step 3: Analyze data flows
    this.analyzeDataFlows(crossLanguageRels, symbolsByLanguage);
    
    return crossLanguageRels;
  }
  
  /**
   * Extract language interfaces from symbols
   */
  private extractLanguageInterfaces(
    symbolsByLanguage: Map<string, UniversalSymbol[]>
  ): Map<string, LanguageInterface[]> {
    const interfaces = new Map<string, LanguageInterface[]>();
    
    for (const [language, symbols] of symbolsByLanguage) {
      const langInterfaces: LanguageInterface[] = [];
      
      // Find exported symbols (public API)
      const exportedSymbols = symbols.filter(s => 
        s.isExported || 
        s.visibility === 'public' ||
        s.semanticTags?.includes('exported') ||
        s.semanticTags?.includes('public_api')
      );
      
      if (exportedSymbols.length > 0) {
        langInterfaces.push({
          language,
          interfaceType: 'export',
          symbols: exportedSymbols,
          bridgeTypes: this.inferBridgeTypes(exportedSymbols, language),
          metadata: this.extractInterfaceMetadata(exportedSymbols, language)
        });
      }
      
      // Find imported symbols (external dependencies)
      const importedSymbols = symbols.filter(s =>
        s.kind === UniversalSymbolKind.Import ||
        s.semanticTags?.includes('external') ||
        s.semanticTags?.includes('imported')
      );
      
      if (importedSymbols.length > 0) {
        langInterfaces.push({
          language,
          interfaceType: 'import',
          symbols: importedSymbols,
          bridgeTypes: this.inferBridgeTypes(importedSymbols, language),
          metadata: this.extractInterfaceMetadata(importedSymbols, language)
        });
      }
      
      interfaces.set(language, langInterfaces);
    }
    
    return interfaces;
  }
  
  /**
   * Detect bridge relationships between two languages
   */
  private async detectBridgeRelationships(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]> {
    const relationships: CrossLanguageRelationship[] = [];
    
    // Try each bridge detector
    for (const [bridgeType, detector] of this.bridgeDetectors) {
      const bridgeRels = await detector.detect(
        lang1, symbols1, lang2, symbols2, interfaces
      );
      relationships.push(...bridgeRels);
    }
    
    return relationships;
  }
  
  /**
   * Infer possible bridge types from symbols
   */
  private inferBridgeTypes(symbols: UniversalSymbol[], language: string): CrossLanguageBridgeType[] {
    const bridgeTypes: Set<CrossLanguageBridgeType> = new Set();
    
    for (const symbol of symbols) {
      const name = symbol.name.toLowerCase();
      const tags = symbol.semanticTags || [];
      
      // API/Web related
      if (name.includes('api') || name.includes('http') || name.includes('rest') ||
          tags.includes('web') || tags.includes('api')) {
        bridgeTypes.add(CrossLanguageBridgeType.API);
      }
      
      // FFI related
      if (name.includes('ffi') || name.includes('extern') || name.includes('native') ||
          tags.includes('ffi') || tags.includes('native')) {
        bridgeTypes.add(CrossLanguageBridgeType.FFI);
      }
      
      // RPC related
      if (name.includes('rpc') || name.includes('grpc') || name.includes('service') ||
          tags.includes('rpc') || tags.includes('service')) {
        bridgeTypes.add(CrossLanguageBridgeType.RPC);
      }
      
      // Database related
      if (name.includes('db') || name.includes('sql') || name.includes('database') ||
          tags.includes('database') || tags.includes('persistence')) {
        bridgeTypes.add(CrossLanguageBridgeType.Database);
      }
      
      // Serialization related
      if (name.includes('json') || name.includes('xml') || name.includes('serialize') ||
          tags.includes('serialization') || tags.includes('json')) {
        bridgeTypes.add(CrossLanguageBridgeType.Serialization);
      }
      
      // Configuration related
      if (name.includes('config') || name.includes('setting') ||
          tags.includes('configuration') || tags.includes('config')) {
        bridgeTypes.add(CrossLanguageBridgeType.Configuration);
      }
    }
    
    return Array.from(bridgeTypes);
  }
  
  /**
   * Extract interface metadata
   */
  private extractInterfaceMetadata(symbols: UniversalSymbol[], language: string): LanguageInterface['metadata'] {
    const metadata: LanguageInterface['metadata'] = {};
    
    // Extract exported/imported names
    metadata.exportedNames = symbols
      .filter(s => s.isExported)
      .map(s => s.qualifiedName);
    
    metadata.importedNames = symbols
      .filter(s => s.kind === UniversalSymbolKind.Import)
      .map(s => s.qualifiedName);
    
    // Language-specific metadata extraction
    if (language === 'cpp') {
      metadata.headerFiles = symbols
        .filter(s => s.filePath.endsWith('.h') || s.filePath.endsWith('.hpp'))
        .map(s => s.filePath);
    }
    
    return metadata;
  }
  
  /**
   * Analyze data flows in cross-language relationships
   */
  private analyzeDataFlows(
    relationships: CrossLanguageRelationship[],
    symbolsByLanguage: Map<string, UniversalSymbol[]>
  ): void {
    for (const rel of relationships) {
      // Determine data flow direction
      rel.dataFlow = {
        direction: this.determineDataFlowDirection(rel),
        dataTypes: this.extractDataTypes(rel, symbolsByLanguage),
        transformations: this.detectTransformations(rel)
      };
    }
  }
  
  /**
   * Determine data flow direction
   */
  private determineDataFlowDirection(rel: CrossLanguageRelationship): 'bidirectional' | 'unidirectional' {
    // Simple heuristic based on relationship type
    const bidirectionalTypes = [
      UniversalRelationshipType.Uses,
      CrossLanguageBridgeType.API,
      CrossLanguageBridgeType.RPC,
      CrossLanguageBridgeType.Database
    ];
    
    return bidirectionalTypes.includes(rel.type as any) ? 'bidirectional' : 'unidirectional';
  }
  
  /**
   * Extract data types involved in relationship
   */
  private extractDataTypes(
    rel: CrossLanguageRelationship,
    symbolsByLanguage: Map<string, UniversalSymbol[]>
  ): string[] {
    const dataTypes: Set<string> = new Set();
    
    // Extract from symbols involved
    const allSymbols = Array.from(symbolsByLanguage.values()).flat();
    const fromSymbol = allSymbols.find(s => s.qualifiedName === rel.fromSymbolId);
    const toSymbol = allSymbols.find(s => s.qualifiedName === rel.toSymbolId);
    
    if (fromSymbol?.returnType) dataTypes.add(fromSymbol.returnType);
    if (toSymbol?.returnType) dataTypes.add(toSymbol.returnType);
    
    // Extract from relationship metadata
    if (rel.bridgeMetadata.format) {
      dataTypes.add(rel.bridgeMetadata.format);
    }
    
    return Array.from(dataTypes);
  }
  
  /**
   * Detect data transformations
   */
  private detectTransformations(rel: CrossLanguageRelationship): string[] {
    const transformations: string[] = [];
    
    // Based on bridge type
    switch (rel.bridgeType) {
      case CrossLanguageBridgeType.Serialization:
        transformations.push('serialization', 'deserialization');
        if (rel.bridgeMetadata.format) {
          transformations.push(`${rel.bridgeMetadata.format}_encoding`);
        }
        break;
        
      case CrossLanguageBridgeType.API:
        transformations.push('http_encoding', 'json_serialization');
        break;
        
      case CrossLanguageBridgeType.FFI:
        transformations.push('type_marshalling', 'abi_conversion');
        break;
        
      case CrossLanguageBridgeType.Database:
        transformations.push('sql_mapping', 'orm_conversion');
        break;
    }
    
    return transformations;
  }
  
  /**
   * Initialize bridge detectors
   */
  private initializeBridgeDetectors(): void {
    this.bridgeDetectors.set(CrossLanguageBridgeType.API, new APIBridgeDetector());
    this.bridgeDetectors.set(CrossLanguageBridgeType.FFI, new FFIBridgeDetector());
    this.bridgeDetectors.set(CrossLanguageBridgeType.Serialization, new SerializationBridgeDetector());
    this.bridgeDetectors.set(CrossLanguageBridgeType.Database, new DatabaseBridgeDetector());
    this.bridgeDetectors.set(CrossLanguageBridgeType.Configuration, new ConfigurationBridgeDetector());
  }
}

/**
 * Bridge detector interface
 */
export interface BridgeDetector {
  detect(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]>;
}

/**
 * API bridge detector
 */
export class APIBridgeDetector implements BridgeDetector {
  async detect(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]> {
    const relationships: CrossLanguageRelationship[] = [];
    
    // Find API endpoints in one language
    const apiSymbols1 = symbols1.filter(s => 
      s.semanticTags?.includes('api') || 
      s.semanticTags?.includes('endpoint') ||
      s.name.toLowerCase().includes('api')
    );
    
    // Find API clients in another language
    const clientSymbols2 = symbols2.filter(s =>
      s.semanticTags?.includes('client') ||
      s.semanticTags?.includes('http') ||
      s.name.toLowerCase().includes('client')
    );
    
    // Match endpoints with clients
    for (const apiSymbol of apiSymbols1) {
      for (const clientSymbol of clientSymbols2) {
        // Simple name-based matching (can be enhanced)
        if (this.areAPIRelated(apiSymbol, clientSymbol)) {
          relationships.push({
            fromSymbolId: clientSymbol.qualifiedName,
            toSymbolId: apiSymbol.qualifiedName,
            type: UniversalRelationshipType.Calls,
            confidence: 0.7,
            bridgeType: CrossLanguageBridgeType.API,
            fromLanguage: lang2,
            toLanguage: lang1,
            bridgeMetadata: {
              protocol: 'http',
              method: this.extractHTTPMethod(apiSymbol),
              endpoint: this.extractEndpoint(apiSymbol)
            }
          });
        }
      }
    }
    
    return relationships;
  }
  
  private areAPIRelated(apiSymbol: UniversalSymbol, clientSymbol: UniversalSymbol): boolean {
    // Simple heuristic - can be enhanced with more sophisticated matching
    const apiName = apiSymbol.name.toLowerCase();
    const clientName = clientSymbol.name.toLowerCase();
    
    // Remove common prefixes/suffixes
    const apiCore = apiName.replace(/(api|endpoint|handler|controller)/, '');
    const clientCore = clientName.replace(/(client|service|api)/, '');
    
    return apiCore === clientCore || apiCore.includes(clientCore) || clientCore.includes(apiCore);
  }
  
  private extractHTTPMethod(symbol: UniversalSymbol): string {
    const name = symbol.name.toLowerCase();
    if (name.includes('get')) return 'GET';
    if (name.includes('post')) return 'POST';
    if (name.includes('put')) return 'PUT';
    if (name.includes('delete')) return 'DELETE';
    return 'GET'; // default
  }
  
  private extractEndpoint(symbol: UniversalSymbol): string {
    // Extract from symbol name or annotations
    const name = symbol.name;
    // Simple heuristic - in real implementation, parse annotations/decorators
    return `/${name.toLowerCase().replace(/([A-Z])/g, '-$1').substring(1)}`;
  }
}

/**
 * FFI bridge detector
 */
export class FFIBridgeDetector implements BridgeDetector {
  async detect(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]> {
    const relationships: CrossLanguageRelationship[] = [];
    
    // Common FFI patterns
    const ffiPatterns = [
      { from: 'python', to: 'cpp', pattern: /ctypes|cffi|pybind11/i },
      { from: 'javascript', to: 'cpp', pattern: /node-addon|napi|ffi/i },
      { from: 'rust', to: 'cpp', pattern: /bindgen|cc|cpp/i },
      { from: 'python', to: 'rust', pattern: /pyo3|rust-cpython/i }
    ];
    
    // Find FFI symbols
    const ffiSymbols1 = symbols1.filter(s =>
      s.semanticTags?.includes('ffi') ||
      s.semanticTags?.includes('extern') ||
      ffiPatterns.some(p => 
        (p.from === lang1 || p.to === lang1) && p.pattern.test(s.name)
      )
    );
    
    const ffiSymbols2 = symbols2.filter(s =>
      s.semanticTags?.includes('ffi') ||
      s.semanticTags?.includes('extern') ||
      ffiPatterns.some(p => 
        (p.from === lang2 || p.to === lang2) && p.pattern.test(s.name)
      )
    );
    
    // Match FFI symbols
    for (const symbol1 of ffiSymbols1) {
      for (const symbol2 of ffiSymbols2) {
        if (this.areFFIRelated(symbol1, symbol2)) {
          relationships.push({
            fromSymbolId: symbol1.qualifiedName,
            toSymbolId: symbol2.qualifiedName,
            type: UniversalRelationshipType.Calls,
            confidence: 0.8,
            bridgeType: CrossLanguageBridgeType.FFI,
            fromLanguage: lang1,
            toLanguage: lang2,
            bridgeMetadata: {
              libraryName: this.extractLibraryName(symbol1, symbol2),
              functionName: symbol2.name,
              callingConvention: this.inferCallingConvention(lang1, lang2)
            }
          });
        }
      }
    }
    
    return relationships;
  }
  
  private areFFIRelated(symbol1: UniversalSymbol, symbol2: UniversalSymbol): boolean {
    // Match function signatures or similar names
    return symbol1.name === symbol2.name || 
           symbol1.signature === symbol2.signature ||
           this.normalizeFFIName(symbol1.name) === this.normalizeFFIName(symbol2.name);
  }
  
  private normalizeFFIName(name: string): string {
    // Remove common FFI prefixes/suffixes
    return name.replace(/^(lib|c_|py_|rs_|js_)/, '').replace(/(_lib|_ffi|_binding)$/, '');
  }
  
  private extractLibraryName(symbol1: UniversalSymbol, symbol2: UniversalSymbol): string {
    // Extract from file path or symbol namespace
    const path1 = symbol1.filePath;
    const path2 = symbol2.filePath;
    
    // Simple heuristic
    if (path1.includes('.so') || path1.includes('.dll') || path1.includes('.dylib')) {
      return path1.split('/').pop()?.split('.')[0] || 'unknown';
    }
    
    return symbol1.namespace || symbol2.namespace || 'unknown';
  }
  
  private inferCallingConvention(lang1: string, lang2: string): string {
    // Simple heuristic based on language pairs
    if ((lang1 === 'cpp' && lang2 === 'python') || (lang1 === 'python' && lang2 === 'cpp')) {
      return 'cdecl';
    }
    return 'default';
  }
}

/**
 * Serialization bridge detector
 */
export class SerializationBridgeDetector implements BridgeDetector {
  async detect(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]> {
    const relationships: CrossLanguageRelationship[] = [];
    
    // Find serialization-related symbols
    const serSymbols1 = symbols1.filter(s => this.isSerializationSymbol(s));
    const serSymbols2 = symbols2.filter(s => this.isSerializationSymbol(s));
    
    // Match symbols that serialize/deserialize the same data structures
    for (const s1 of serSymbols1) {
      for (const s2 of serSymbols2) {
        if (this.areSerializationRelated(s1, s2)) {
          relationships.push({
            fromSymbolId: s1.qualifiedName,
            toSymbolId: s2.qualifiedName,
            type: UniversalRelationshipType.SerializesTo,
            confidence: 0.6,
            bridgeType: CrossLanguageBridgeType.Serialization,
            fromLanguage: lang1,
            toLanguage: lang2,
            bridgeMetadata: {
              format: this.detectSerializationFormat(s1, s2),
              schema: this.extractSchema(s1, s2)
            }
          });
        }
      }
    }
    
    return relationships;
  }
  
  private isSerializationSymbol(symbol: UniversalSymbol): boolean {
    const name = symbol.name.toLowerCase();
    const tags = symbol.semanticTags || [];
    
    return name.includes('serialize') ||
           name.includes('deserialize') ||
           name.includes('json') ||
           name.includes('xml') ||
           name.includes('protobuf') ||
           tags.includes('serialization') ||
           tags.includes('json');
  }
  
  private areSerializationRelated(s1: UniversalSymbol, s2: UniversalSymbol): boolean {
    // Simple name-based matching for data structures
    const name1 = this.normalizeDataStructureName(s1.name);
    const name2 = this.normalizeDataStructureName(s2.name);
    
    return name1 === name2;
  }
  
  private normalizeDataStructureName(name: string): string {
    // Remove serialization-specific prefixes/suffixes
    return name.replace(/(serialize|deserialize|json|xml|dto|model|entity)$/i, '')
               .replace(/^(json|xml|proto)_?/i, '')
               .toLowerCase();
  }
  
  private detectSerializationFormat(s1: UniversalSymbol, s2: UniversalSymbol): string {
    const combined = (s1.name + s2.name).toLowerCase();
    
    if (combined.includes('json')) return 'json';
    if (combined.includes('xml')) return 'xml';
    if (combined.includes('protobuf') || combined.includes('proto')) return 'protobuf';
    if (combined.includes('yaml')) return 'yaml';
    
    return 'unknown';
  }
  
  private extractSchema(s1: UniversalSymbol, s2: UniversalSymbol): string {
    // Extract schema information from symbols
    // This is a simplified implementation
    return s1.signature || s2.signature || 'unknown';
  }
}

/**
 * Database bridge detector
 */
export class DatabaseBridgeDetector implements BridgeDetector {
  async detect(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]> {
    const relationships: CrossLanguageRelationship[] = [];
    
    // Find database-related symbols
    const dbSymbols1 = symbols1.filter(s => this.isDatabaseSymbol(s));
    const dbSymbols2 = symbols2.filter(s => this.isDatabaseSymbol(s));
    
    // Match symbols that access the same database entities
    for (const db1 of dbSymbols1) {
      for (const db2 of dbSymbols2) {
        if (this.areDatabaseRelated(db1, db2)) {
          relationships.push({
            fromSymbolId: db1.qualifiedName,
            toSymbolId: db2.qualifiedName,
            type: UniversalRelationshipType.Depends,
            confidence: 0.7,
            bridgeType: CrossLanguageBridgeType.Database,
            fromLanguage: lang1,
            toLanguage: lang2,
            bridgeMetadata: {
              tableName: this.extractTableName(db1, db2),
              queryType: this.inferQueryType(db1, db2)
            }
          });
        }
      }
    }
    
    return relationships;
  }
  
  private isDatabaseSymbol(symbol: UniversalSymbol): boolean {
    const name = symbol.name.toLowerCase();
    const tags = symbol.semanticTags || [];
    
    return name.includes('repository') ||
           name.includes('dao') ||
           name.includes('model') ||
           name.includes('entity') ||
           tags.includes('database') ||
           tags.includes('repository') ||
           tags.includes('persistence');
  }
  
  private areDatabaseRelated(db1: UniversalSymbol, db2: UniversalSymbol): boolean {
    // Match based on entity names
    const entity1 = this.extractEntityName(db1.name);
    const entity2 = this.extractEntityName(db2.name);
    
    return entity1 === entity2;
  }
  
  private extractEntityName(name: string): string {
    // Remove repository/dao/model suffixes
    return name.replace(/(repository|dao|model|entity)$/i, '').toLowerCase();
  }
  
  private extractTableName(db1: UniversalSymbol, db2: UniversalSymbol): string {
    return this.extractEntityName(db1.name);
  }
  
  private inferQueryType(db1: UniversalSymbol, db2: UniversalSymbol): string {
    // Simple heuristic based on method names
    const combined = (db1.name + db2.name).toLowerCase();
    
    if (combined.includes('find') || combined.includes('get') || combined.includes('select')) {
      return 'select';
    }
    if (combined.includes('save') || combined.includes('insert') || combined.includes('create')) {
      return 'insert';
    }
    if (combined.includes('update')) {
      return 'update';
    }
    if (combined.includes('delete') || combined.includes('remove')) {
      return 'delete';
    }
    
    return 'unknown';
  }
}

/**
 * Configuration bridge detector
 */
export class ConfigurationBridgeDetector implements BridgeDetector {
  async detect(
    lang1: string,
    symbols1: UniversalSymbol[],
    lang2: string,
    symbols2: UniversalSymbol[],
    interfaces: Map<string, LanguageInterface[]>
  ): Promise<CrossLanguageRelationship[]> {
    const relationships: CrossLanguageRelationship[] = [];
    
    // Find configuration-related symbols
    const configSymbols1 = symbols1.filter(s => this.isConfigurationSymbol(s));
    const configSymbols2 = symbols2.filter(s => this.isConfigurationSymbol(s));
    
    // Match symbols that access the same configuration keys
    for (const c1 of configSymbols1) {
      for (const c2 of configSymbols2) {
        if (this.areConfigurationRelated(c1, c2)) {
          relationships.push({
            fromSymbolId: c1.qualifiedName,
            toSymbolId: c2.qualifiedName,
            type: UniversalRelationshipType.Depends,
            confidence: 0.8,
            bridgeType: CrossLanguageBridgeType.Configuration,
            fromLanguage: lang1,
            toLanguage: lang2,
            bridgeMetadata: {
              configKey: this.extractConfigKey(c1, c2),
              configFormat: 'env' // Could be enhanced to detect json, yaml, etc.
            }
          });
        }
      }
    }
    
    return relationships;
  }
  
  private isConfigurationSymbol(symbol: UniversalSymbol): boolean {
    const name = symbol.name.toLowerCase();
    const tags = symbol.semanticTags || [];
    
    return name.includes('config') ||
           name.includes('setting') ||
           name.includes('env') ||
           tags.includes('configuration') ||
           tags.includes('config');
  }
  
  private areConfigurationRelated(c1: UniversalSymbol, c2: UniversalSymbol): boolean {
    // Match based on configuration key names
    const key1 = this.extractConfigKey(c1);
    const key2 = this.extractConfigKey(c2);
    
    return key1 === key2;
  }
  
  private extractConfigKey(symbol1: UniversalSymbol, symbol2?: UniversalSymbol): string {
    // Extract configuration key from symbol name
    const name = symbol1.name.replace(/^(get|set|load)_?/i, '')
                              .replace(/_(config|setting|env)$/i, '')
                              .toUpperCase();
    
    return name;
  }
}