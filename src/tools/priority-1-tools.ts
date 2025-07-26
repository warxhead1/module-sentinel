import {
  FindImplementationsRequest,
  FindImplementationsResponse,
  DependencyPathRequest,
  DependencyPathResponse,
  SimilarCodeRequest,
  SimilarCodeResponse,
  ImplementationMatch,
  SimilarCodeMatch,
  CrossFileDependencyRequest,
  CrossFileDependencyResponse,
  CrossFileUsage,
  FileDependency,
  DownstreamImpact,
} from "../types/essential-features.js";
import { type DrizzleDb } from "../database/drizzle-db.js";
import * as schema from "../database/drizzle/schema.js";
import { eq, like, or, and, inArray, sql, desc, asc } from "drizzle-orm";
import * as path from "path";
import { LocalCodeEmbeddingEngine } from "../analysis/local-code-embedding.js";
import type { Database } from "better-sqlite3";

export class Priority1Tools {
  private db: DrizzleDb;
  private embeddingEngine?: LocalCodeEmbeddingEngine;
  private rawDb?: Database;

  constructor(db: DrizzleDb, rawDb?: Database) {
    this.db = db;
    this.rawDb = rawDb;
    if (rawDb) {
      this.embeddingEngine = new LocalCodeEmbeddingEngine(rawDb, {
        dimensions: 256,
        debugMode: false
      });
    }
  }

  /**
   * Find existing implementations of functionality
   */
  async findImplementations(
    request: FindImplementationsRequest
  ): Promise<FindImplementationsResponse> {
    const exact_matches: ImplementationMatch[] = [];
    const similar_implementations: ImplementationMatch[] = [];

    // Search for methods matching the criteria using Drizzle
    const methods = await this.db
      .select({
        name: schema.universalSymbols.name,
        parentSymbolId: schema.universalSymbols.parentSymbolId,
        returnType: schema.universalSymbols.returnType,
        signature: schema.universalSymbols.signature,
        filePath: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        qualifiedName: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        namespace: schema.universalSymbols.namespace,
        semanticTags: schema.universalSymbols.semanticTags,
      })
      .from(schema.universalSymbols)
      .where(
        and(
          inArray(schema.universalSymbols.kind, ["function", "method"]),
          or(
            like(schema.universalSymbols.name, `%${request.functionality}%`),
            like(schema.universalSymbols.qualifiedName, `%${request.functionality}%`),
            like(schema.universalSymbols.signature, `%${request.functionality}%`),
            like(schema.universalSymbols.namespace, `%${request.functionality}%`),
            sql`${schema.universalSymbols.namespace} || '::' || ${schema.universalSymbols.name} LIKE ${`%${request.functionality}%`}`
          )
        )
      )
      .orderBy(
        sql`CASE 
          WHEN ${schema.universalSymbols.name} = ${request.functionality} THEN 1
          WHEN ${schema.universalSymbols.name} LIKE ${`${request.functionality}%`} THEN 2
          WHEN ${schema.universalSymbols.qualifiedName} LIKE ${`%${request.functionality}%`} THEN 3
          WHEN ${schema.universalSymbols.namespace} LIKE ${`%${request.functionality}%`} THEN 4
          ELSE 5
        END`,
        asc(schema.universalSymbols.name)
      );

    // Categorize matches by relevance
    for (const method of methods) {
      const methodName = method.name;
      const returnType = method.returnType || "void";
      const namespace = method.namespace || "";
      const qualifiedName = method.qualifiedName;

      // Build proper signature with parameters if not already provided
      const buildSignature = () => {
        if (method.signature) return method.signature;
        return `${returnType} ${methodName}(...)`;
      };

      const match: ImplementationMatch = {
        module: namespace || "Global",
        method: qualifiedName,
        signature: buildSignature(),
        location: `${method.filePath}:${method.line}`,
        description: this.generateMethodDescription(method),
        score: 0.5, // Default score
      };

      // Check if it's an exact match
      const isExact = request.keywords.every((keyword) =>
        methodName.toLowerCase().includes(keyword.toLowerCase())
      );

      if (
        isExact &&
        (!request.returnType || returnType.includes(request.returnType))
      ) {
        exact_matches.push(match);
      } else {
        match.similarity = this.calculateMethodSimilarity(method, request);
        similar_implementations.push(match);
      }
    }

    // Sort similar implementations by similarity score
    similar_implementations.sort(
      (a, b) => (b.similarity || 0) - (a.similarity || 0)
    );

    return {
      exact_matches: exact_matches.slice(0, 5),
      similar_implementations: similar_implementations.slice(0, 10),
    };
  }

  /**
   * Find the dependency path between modules
   */
  async findDependencyPath(
    request: DependencyPathRequest
  ): Promise<DependencyPathResponse> {
    // Build dependency graph
    const graph = await this.buildDependencyGraph();

    // Find shortest path using BFS
    const path = this.findShortestPath(graph, request.from, request.to);

    if (!path || path.length === 0) {
      return {
        recommended_path: [],
        interfaces_needed: [],
        example_usage:
          "No direct path found. Consider creating an interface or adapter.",
      };
    }

    // Identify interfaces along the path
    const interfaces = await this.identifyRequiredInterfaces(path);

    // Find example usage
    const example = await this.findBestExample(path);

    return {
      recommended_path: path,
      interfaces_needed: interfaces,
      example_usage: example,
    };
  }

  /**
   * Find similar code patterns using semantic search with embeddings
   */
  async findSimilarCode(
    request: SimilarCodeRequest
  ): Promise<SimilarCodeResponse> {
    const { pattern, context, threshold = 0.7 } = request;

    // Try semantic search first if embeddings are available
    if (this.embeddingEngine && this.rawDb) {
      try {
        const semanticResults = await this.findSimilarCodeSemantic(
          pattern,
          context,
          threshold
        );
        
        if (semanticResults.length > 0) {
          return { similar_patterns: semanticResults };
        }
      } catch (error) {
        console.warn("Semantic search failed, falling back to pattern matching:", error);
      }
    }

    // Fall back to pattern-based search
    const patterns = await this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        signature: schema.universalSymbols.signature,
        filePath: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        parentSymbolId: schema.universalSymbols.parentSymbolId,
        returnType: schema.universalSymbols.returnType,
        qualifiedName: schema.universalSymbols.qualifiedName,
        semanticTags: schema.universalSymbols.semanticTags,
      })
      .from(schema.universalSymbols)
      .where(
        and(
          inArray(schema.universalSymbols.kind, ["function", "method"]),
          or(
            like(schema.universalSymbols.signature, `%${request.pattern}%`),
            like(schema.universalSymbols.name, `%${request.pattern}%`)
          )
        )
      )
      .orderBy(
        sql`CASE 
          WHEN ${schema.universalSymbols.signature} LIKE ${`%${request.pattern}%`} THEN 1
          WHEN ${schema.universalSymbols.name} LIKE ${`%${request.pattern}%`} THEN 2
          ELSE 3
        END`
      )
      .limit(50);

    const similar_patterns: SimilarCodeMatch[] = patterns.map((pattern) => ({
      location: `${pattern.filePath}:${pattern.line}`,
      pattern: this.describePattern(pattern),
      suggestion: this.generateSuggestion(pattern, request.context),
      // Add semantic score based on tags
      semanticScore: this.calculateBasicSemanticScore(pattern, context)
    }));

    // Sort by semantic score if available
    similar_patterns.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));

    return { similar_patterns: similar_patterns.slice(0, 20) };
  }

  /**
   * Find similar code using semantic embeddings
   */
  private async findSimilarCodeSemantic(
    pattern: string,
    context: string,
    threshold: number
  ): Promise<SimilarCodeMatch[]> {
    if (!this.embeddingEngine) {
      throw new Error("Embedding engine not initialized");
    }

    // Generate embedding for the search pattern
    const searchSymbol = {
      name: "search_pattern",
      qualifiedName: `${context}::search_pattern`,
      kind: "function",
      filePath: "search",
      line: 1,
      column: 1,
      isDefinition: true,
      confidence: 1.0,
      semanticTags: [context],
      complexity: 1,
      isExported: false,
      isAsync: false,
      signature: pattern
    };

    const searchEmbedding = await this.embeddingEngine.generateEmbedding(
      searchSymbol as any,
      null, // No AST for search pattern
      pattern,
      undefined, // No semantic context
      [] // No relationships
    );

    // Get embeddings from database
    const embeddings = await this.db
      .select({
        symbolId: schema.codeEmbeddings.symbolId,
        embedding: schema.codeEmbeddings.embedding,
      })
      .from(schema.codeEmbeddings)
      .where(eq(schema.codeEmbeddings.embeddingType, 'semantic'))
      .limit(1000);

    // Calculate similarities
    const similarities: Array<{ symbolId: number; similarity: number }> = [];
    
    for (const emb of embeddings) {
      try {
        const storedEmbedding = JSON.parse(emb.embedding.toString('utf8'));
        const similarity = this.cosineSimilarity(searchEmbedding.embedding, storedEmbedding);
        
        if (similarity >= threshold) {
          similarities.push({ symbolId: emb.symbolId, similarity });
        }
      } catch {
        // Skip malformed embeddings
      }
    }

    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topSimilarities = similarities.slice(0, 20);

    if (topSimilarities.length === 0) {
      return [];
    }

    // Get symbol details
    const symbolIds = topSimilarities.map(s => s.symbolId);
    const symbols = await this.db
      .select({
        id: schema.universalSymbols.id,
        name: schema.universalSymbols.name,
        signature: schema.universalSymbols.signature,
        filePath: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        qualifiedName: schema.universalSymbols.qualifiedName,
        semanticTags: schema.universalSymbols.semanticTags,
      })
      .from(schema.universalSymbols)
      .where(sql`${schema.universalSymbols.id} IN (${sql.join(symbolIds, sql`, `)})`);

    // Create results with similarity scores
    return symbols.map(symbol => {
      const similarity = topSimilarities.find(s => s.symbolId === symbol.id)?.similarity || 0;
      
      return {
        location: `${symbol.filePath}:${symbol.line}`,
        pattern: this.describePattern(symbol),
        suggestion: this.generateSemanticSuggestion(symbol, context, similarity),
        semanticScore: similarity
      };
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      return 0;
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Calculate basic semantic score without embeddings
   */
  private calculateBasicSemanticScore(
    symbol: any,
    context: string
  ): number {
    let score = 0;

    // Check semantic tags
    if (symbol.semanticTags && Array.isArray(symbol.semanticTags)) {
      const contextWords = context.toLowerCase().split(/\W+/);
      const matchingTags = symbol.semanticTags.filter((tag: string) =>
        contextWords.some(word => tag.toLowerCase().includes(word))
      );
      score += matchingTags.length * 0.3;
    }

    // Check name similarity
    if (symbol.name.toLowerCase().includes(context.toLowerCase())) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate suggestion based on semantic similarity
   */
  private generateSemanticSuggestion(
    symbol: any,
    context: string,
    similarity: number
  ): string {
    if (similarity > 0.9) {
      return `Highly similar implementation (${Math.round(similarity * 100)}% match) - consider reusing '${symbol.name}'`;
    } else if (similarity > 0.8) {
      return `Strong semantic match (${Math.round(similarity * 100)}%) - '${symbol.name}' implements similar functionality`;
    } else if (similarity > 0.7) {
      return `Related implementation (${Math.round(similarity * 100)}%) - '${symbol.name}' may provide useful patterns`;
    } else {
      return this.generateSuggestion(symbol, context);
    }
  }

  // Helper methods

  private generateMethodDescription(method: {
    name: string;
    returnType: string | null;
    signature: string | null;
    namespace: string | null;
    semanticTags: string[] | null;
  }): string {
    const returnType = method.returnType || "void";
    const methodName = method.name;
    const namespace = method.namespace;
    const signature = method.signature;

    // If we have a full signature, use it
    if (signature && signature !== `${methodName}(...)`) {
      return signature;
    }

    // Build description from available data
    const namespacePrefix = namespace ? `${namespace}::` : "";
    const semanticTags = method.semanticTags || [];
    const tagSuffix =
      semanticTags.length > 0 ? ` [${semanticTags.join(", ")}]` : "";

    return `${returnType} ${namespacePrefix}${methodName}(...)${tagSuffix}`;
  }

  private calculateMethodSimilarity(
    method: {
      name: string;
      returnType: string | null;
      semanticTags: string[] | null;
    },
    request: FindImplementationsRequest
  ): number {
    let similarity = 0;
    const methodName = method.name;
    const returnType = method.returnType;

    // Name similarity
    const nameSimilarity =
      request.keywords.filter((k) =>
        methodName.toLowerCase().includes(k.toLowerCase())
      ).length / request.keywords.length;
    similarity += nameSimilarity * 0.5;

    // Return type similarity
    if (
      request.returnType &&
      returnType &&
      returnType.includes(request.returnType)
    ) {
      similarity += 0.3;
    }

    // Semantic tags similarity
    if (method.semanticTags) {
      const tags = method.semanticTags;
      const tagMatches = request.keywords.filter((k) =>
        tags.some((tag: string) => tag.toLowerCase().includes(k.toLowerCase()))
      ).length;
      similarity += (tagMatches / request.keywords.length) * 0.2;
    }

    return Math.min(similarity, 1.0);
  }

  private async buildDependencyGraph(): Promise<Map<string, Set<string>>> {
    const graph = new Map<string, Set<string>>();

    // Query all module dependencies by joining with universal_symbols
    const dependencies = await this.db
      .selectDistinct({
        fromModule: schema.universalSymbols.filePath,
        toModule: sql<string>`to_symbols.file_path`,
      })
      .from(schema.universalRelationships)
      .leftJoin(
        schema.universalSymbols,
        eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
      )
      .leftJoin(
        sql`${schema.universalSymbols} as to_symbols`,
        sql`${schema.universalRelationships.toSymbolId} = to_symbols.id`
      )
      .where(
        and(
          inArray(schema.universalRelationships.type, ["uses", "calls", "inherits", "implements"]),
          sql`${schema.universalSymbols.filePath} IS NOT NULL`,
          sql`to_symbols.file_path IS NOT NULL`
        )
      );

    for (const dep of dependencies) {
      if (dep.fromModule && dep.toModule) {
        if (!graph.has(dep.fromModule)) {
          graph.set(dep.fromModule, new Set());
        }
        graph.get(dep.fromModule)!.add(dep.toModule);
      }
    }

    return graph;
  }

  private findShortestPath(
    graph: Map<string, Set<string>>,
    from: string,
    to: string
  ): string[] {
    const queue: string[][] = [[from]];
    const visited = new Set<string>([from]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (current === to) {
        return path;
      }

      const neighbors = graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return [];
  }

  private async identifyRequiredInterfaces(path: string[]): Promise<string[]> {
    const interfaces = new Set<string>();

    // For each step in the path, check what interfaces are needed
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];

      const relationships = await this.db
        .selectDistinct({
          toSymbol: sql<string>`to_symbols.name`,
        })
        .from(schema.universalRelationships)
        .leftJoin(
          schema.universalSymbols,
          eq(schema.universalRelationships.fromSymbolId, schema.universalSymbols.id)
        )
        .leftJoin(
          sql`${schema.universalSymbols} as to_symbols`,
          sql`${schema.universalRelationships.toSymbolId} = to_symbols.id`
        )
        .where(
          and(
            eq(schema.universalSymbols.filePath, from),
            sql`to_symbols.file_path = ${to}`,
            eq(schema.universalRelationships.type, "implements")
          )
        );

      relationships.forEach((rel) => interfaces.add(rel.toSymbol));
    }

    return Array.from(interfaces);
  }

  private async findBestExample(path: string[]): Promise<string> {
    // Since usage_examples table doesn't exist, we'll provide a simple fallback
    // In a real implementation, you might query semanticInsights or other tables
    // for relevant examples
    return `See ${path[0]} for integration pattern`;
  }

  private describePattern(pattern: {
    name: string;
    signature: string | null;
    returnType?: string | null;
  }): string {
    // Since we don't have pattern categories in the schema, 
    // describe based on name and signature
    if (pattern.signature) {
      return pattern.signature;
    }
    return `${pattern.returnType || "void"} ${pattern.name}(...)`;
  }

  private generateSuggestion(pattern: {
    name: string;
    signature: string | null;
  }, context: string): string {
    // Provide context-aware suggestions
    if (pattern.name.toLowerCase().includes("loop") && context.includes("noise")) {
      return "Use existing BatchNoiseGenerator::SampleGrid() for better performance";
    }

    if (pattern.name.toLowerCase().includes("init")) {
      return "Consider using existing initialization patterns from the codebase";
    }

    return `Consider reusing the existing '${pattern.name}' implementation`;
  }

  /**
   * Analyze cross-file dependencies and usage patterns
   *
   * WHEN TO USE:
   * - Understanding downstream impact before modifying a function/class
   * - Finding all files that depend on a specific symbol
   * - Analyzing file-to-file dependency relationships
   * - Impact analysis for refactoring or bug fixes
   *
   * WHAT DATA TO EXPECT:
   * - Exact usage locations with line numbers and source code
   * - Cross-file call patterns (qualified vs simple calls)
   * - File dependency maps showing which files depend on which
   * - Downstream impact analysis for change planning
   */
  async analyzeCrossFileDependencies(
    request: CrossFileDependencyRequest
  ): Promise<CrossFileDependencyResponse> {
    const {
      symbolName,
      filePath,
      analysisType,
      includeUsageDetails = true,
    } = request;

    let response: CrossFileDependencyResponse = {
      analysisType,
      requestedSymbol: symbolName,
      requestedFile: filePath,
      summary: "",
    };

    try {
      switch (analysisType) {
        case "symbol":
          if (!symbolName) {
            throw new Error("symbolName is required for symbol analysis");
          }
          response = await this.analyzeSymbolDependencies(
            symbolName,
            includeUsageDetails
          );
          break;

        case "file":
          if (!filePath) {
            throw new Error("filePath is required for file analysis");
          }
          response = await this.analyzeFileDependencies(
            filePath,
            includeUsageDetails
          );
          break;

        case "downstream_impact":
          if (!symbolName) {
            throw new Error(
              "symbolName is required for downstream impact analysis"
            );
          }
          response = await this.analyzeDownstreamImpact(symbolName);
          break;

        case "file_dependencies":
          response = await this.analyzeOverallFileDependencies();
          break;

        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }

      return response;
    } catch (error) {
      return {
        analysisType,
        requestedSymbol: symbolName,
        requestedFile: filePath,
        summary: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Analyze dependencies for a specific symbol
   */
  private async analyzeSymbolDependencies(
    symbolName: string,
    includeDetails: boolean
  ): Promise<CrossFileDependencyResponse> {
    // Find all cross-file usages of this symbol
    const usages = await this.db
      .select({
        fromSymbol: sql<string>`s1.name`,
        fromFile: sql<string>`s1.file_path`,
        toSymbol: sql<string>`s2.name`,
        toFile: sql<string>`s2.file_path`,
        type: schema.universalRelationships.type,
        confidence: schema.universalRelationships.confidence,
        contextLine: schema.universalRelationships.contextLine,
        contextSnippet: schema.universalRelationships.contextSnippet,
      })
      .from(schema.universalRelationships)
      .innerJoin(
        sql`${schema.universalSymbols} as s1`,
        sql`${schema.universalRelationships.fromSymbolId} = s1.id`
      )
      .innerJoin(
        sql`${schema.universalSymbols} as s2`,
        sql`${schema.universalRelationships.toSymbolId} = s2.id`
      )
      .where(
        and(
          sql`s2.name = ${symbolName}`,
          sql`s1.file_path != s2.file_path`
        )
      )
      .orderBy(desc(schema.universalRelationships.confidence), sql`s1.file_path`);

    const symbolUsages: CrossFileUsage[] = usages.map((usage) => ({
      fromSymbol: usage.fromSymbol,
      fromFile: usage.fromFile,
      fromLine: usage.contextLine || 0,
      toSymbol: usage.toSymbol,
      toFile: usage.toFile,
      relationshipType: (usage.type as "calls" | "uses" | "inherits" | "includes"),
      usagePattern: "simple_call" as const, // Default pattern since it's not in schema
      confidence: usage.confidence,
      sourceText: usage.contextSnippet || "",
    }));

    // Calculate downstream impact
    const affectedFiles = [...new Set(symbolUsages.map((u) => u.fromFile))];
    const directCallers = [...new Set(symbolUsages.map((u) => u.fromSymbol))];
    const usagesByFile: { [file: string]: number } = {};

    symbolUsages.forEach((usage) => {
      const fileName = path.basename(usage.fromFile);
      usagesByFile[fileName] = (usagesByFile[fileName] || 0) + 1;
    });

    const downstreamImpact: DownstreamImpact = {
      symbol: symbolName,
      totalUsages: symbolUsages.length,
      affectedFiles: affectedFiles.map((f) => path.basename(f)),
      directCallers,
      usagesByFile,
      criticalUsages: symbolUsages.filter((u) => u.confidence >= 0.8),
    };

    let summary = `Found ${symbolUsages.length} cross-file usages of '${symbolName}' across ${affectedFiles.length} files.`;
    if (downstreamImpact.criticalUsages.length > 0) {
      summary += ` ${downstreamImpact.criticalUsages.length} are high-confidence usages.`;
    }

    return {
      analysisType: "symbol",
      requestedSymbol: symbolName,
      symbolUsages: includeDetails ? symbolUsages : undefined,
      downstreamImpact,
      summary,
    };
  }

  /**
   * Analyze dependencies for a specific file
   */
  private async analyzeFileDependencies(
    filePath: string,
    includeDetails: boolean
  ): Promise<CrossFileDependencyResponse> {
    // Find what this file depends on
    const dependsOn = await this.db
      .select({
        dependencyFile: sql<string>`s2.file_path`,
        usageCount: sql<number>`count(*)`,
        relationshipTypes: sql<string>`group_concat(distinct ${schema.universalRelationships.type})`,
      })
      .from(schema.universalRelationships)
      .innerJoin(
        sql`${schema.universalSymbols} as s1`,
        sql`${schema.universalRelationships.fromSymbolId} = s1.id`
      )
      .innerJoin(
        sql`${schema.universalSymbols} as s2`,
        sql`${schema.universalRelationships.toSymbolId} = s2.id`
      )
      .where(
        and(
          sql`s1.file_path = ${filePath}`,
          sql`s1.file_path != s2.file_path`
        )
      )
      .groupBy(sql`s2.file_path`)
      .orderBy(desc(sql`count(*)`));

    // Find what depends on this file
    const usedBy = await this.db
      .select({
        dependentFile: sql<string>`s1.file_path`,
        usageCount: sql<number>`count(*)`,
        relationshipTypes: sql<string>`group_concat(distinct ${schema.universalRelationships.type})`,
      })
      .from(schema.universalRelationships)
      .innerJoin(
        sql`${schema.universalSymbols} as s1`,
        sql`${schema.universalRelationships.fromSymbolId} = s1.id`
      )
      .innerJoin(
        sql`${schema.universalSymbols} as s2`,
        sql`${schema.universalRelationships.toSymbolId} = s2.id`
      )
      .where(
        and(
          sql`s2.file_path = ${filePath}`,
          sql`s1.file_path != s2.file_path`
        )
      )
      .groupBy(sql`s1.file_path`)
      .orderBy(desc(sql`count(*)`));

    // For MCP precision: only include basic info unless details requested
    const dependsOnFiles = dependsOn.map((dep) =>
      path.basename(dep.dependencyFile)
    );
    const usedByFiles = usedBy.map((dep) => path.basename(dep.dependentFile));

    const summary = `File '${path.basename(filePath)}' depends on ${
      dependsOnFiles.length
    } files and is used by ${usedByFiles.length} files.`;

    // Include detailed dependency information if requested
    const detailedDependencies = includeDetails ? {
      dependsOnDetails: dependsOn.map(dep => ({
        file: dep.dependencyFile,
        usageCount: dep.usageCount,
        relationshipTypes: dep.relationshipTypes?.split(',') || []
      })),
      usedByDetails: usedBy.map(dep => ({
        file: dep.dependentFile,
        usageCount: dep.usageCount,
        relationshipTypes: dep.relationshipTypes?.split(',') || []
      }))
    } : undefined;

    return {
      analysisType: "file",
      requestedFile: filePath,
      dependsOnFiles,
      usedByFiles,
      summary,
      ...(detailedDependencies || {})
    };
  }

  /**
   * Analyze downstream impact for a symbol (comprehensive)
   */
  private async analyzeDownstreamImpact(
    symbolName: string
  ): Promise<CrossFileDependencyResponse> {
    // Get all relationships involving this symbol
    const allRelationships = await this.db
      .select({
        fromSymbol: sql<string>`s1.name`,
        fromFile: sql<string>`s1.file_path`,
        fromClass: sql<number | null>`s1.parent_symbol_id`,
        toSymbol: sql<string>`s2.name`,
        toFile: sql<string>`s2.file_path`,
        toClass: sql<number | null>`s2.parent_symbol_id`,
        type: schema.universalRelationships.type,
        confidence: schema.universalRelationships.confidence,
        contextSnippet: schema.universalRelationships.contextSnippet,
        contextLine: schema.universalRelationships.contextLine,
      })
      .from(schema.universalRelationships)
      .innerJoin(
        sql`${schema.universalSymbols} as s1`,
        sql`${schema.universalRelationships.fromSymbolId} = s1.id`
      )
      .innerJoin(
        sql`${schema.universalSymbols} as s2`,
        sql`${schema.universalRelationships.toSymbolId} = s2.id`
      )
      .where(
        or(
          sql`s1.name = ${symbolName}`,
          sql`s2.name = ${symbolName}`
        )
      )
      .orderBy(desc(schema.universalRelationships.confidence));

    // Separate incoming vs outgoing relationships
    const incomingUsages = allRelationships.filter(
      (rel) => rel.toSymbol === symbolName
    );
    const outgoingUsages = allRelationships.filter(
      (rel) => rel.fromSymbol === symbolName
    );

    const affectedFiles = [
      ...new Set([
        ...incomingUsages.map((u) => u.fromFile),
        ...outgoingUsages.map((u) => u.toFile),
      ]),
    ];

    const directCallers = [
      ...new Set(incomingUsages.map((u) => u.fromSymbol)),
    ];
    const directCallees = [...new Set(outgoingUsages.map((u) => u.toSymbol))];

    const downstreamImpact: DownstreamImpact = {
      symbol: symbolName,
      totalUsages: incomingUsages.length,
      affectedFiles: affectedFiles.map((f) => path.basename(f)),
      directCallers,
      usagesByFile: {},
      criticalUsages: incomingUsages
        .filter((u) => u.confidence >= 0.8)
        .map((u) => ({
          fromSymbol: u.fromSymbol,
          fromFile: u.fromFile,
          fromLine: u.contextLine || 0,
          toSymbol: u.toSymbol,
          toFile: u.toFile,
          relationshipType: (u.type as "calls" | "uses" | "inherits" | "includes"),
          usagePattern: "simple_call" as const, // Default pattern
          confidence: u.confidence,
          sourceText: u.contextSnippet || "",
        })),
    };

    // Count usages by file
    incomingUsages.forEach((usage) => {
      const fileName = path.basename(usage.fromFile);
      downstreamImpact.usagesByFile[fileName] =
        (downstreamImpact.usagesByFile[fileName] || 0) + 1;
    });

    let summary = `Symbol '${symbolName}' has ${incomingUsages.length} incoming usages and ${outgoingUsages.length} outgoing dependencies across ${affectedFiles.length} files.`;
    summary += ` Direct callers: ${directCallers.length}, Direct callees: ${directCallees.length}.`;

    return {
      analysisType: "downstream_impact",
      requestedSymbol: symbolName,
      downstreamImpact,
      summary,
    };
  }

  /**
   * Analyze overall file dependency patterns
   */
  private async analyzeOverallFileDependencies(): Promise<CrossFileDependencyResponse> {
    // Get file-to-file dependency summary
    const fileDeps = await this.db
      .select({
        dependentFile: sql<string>`s1.file_path`,
        dependencyFile: sql<string>`s2.file_path`,
        usageCount: sql<number>`count(*)`,
        relationshipTypes: sql<string>`group_concat(distinct ${schema.universalRelationships.type})`,
        avgConfidence: sql<number>`avg(${schema.universalRelationships.confidence})`,
      })
      .from(schema.universalRelationships)
      .innerJoin(
        sql`${schema.universalSymbols} as s1`,
        sql`${schema.universalRelationships.fromSymbolId} = s1.id`
      )
      .innerJoin(
        sql`${schema.universalSymbols} as s2`,
        sql`${schema.universalRelationships.toSymbolId} = s2.id`
      )
      .where(
        sql`s1.file_path != s2.file_path`
      )
      .groupBy(sql`s1.file_path`, sql`s2.file_path`)
      .orderBy(desc(sql`count(*)`));

    const fileDependencies: FileDependency[] = fileDeps.map((dep) => ({
      dependentFile: path.basename(dep.dependentFile),
      dependencyFile: path.basename(dep.dependencyFile),
      usageCount: dep.usageCount,
      relationshipTypes: dep.relationshipTypes.split(","),
      usages: [], // Detailed usages not included in overview
    }));

    // Get relationship type summary
    const patternSummary = await this.db
      .select({
        type: schema.universalRelationships.type,
        count: sql<number>`count(*)`,
      })
      .from(schema.universalRelationships)
      .groupBy(schema.universalRelationships.type)
      .orderBy(desc(sql`count(*)`));

    const usagePatternSummary: { [pattern: string]: number } = {};
    let totalRelationships = 0;

    patternSummary.forEach((p) => {
      usagePatternSummary[p.type] = p.count;
      totalRelationships += p.count;
    });

    const summary = `Found ${totalRelationships} cross-file relationships across ${
      fileDependencies.length
    } file pairs. Top patterns: ${Object.keys(usagePatternSummary)
      .slice(0, 3)
      .join(", ")}.`;

    return {
      analysisType: "file_dependencies",
      fileDependencies,
      totalCrossFileRelationships: totalRelationships,
      usagePatternSummary,
      summary,
    };
  }

  /**
   * Find all symbols in a namespace (or namespace pattern)
   * Example: "PlanetGen::Rendering" or "PlanetGen::*"
   */
  async findInNamespace(namespace: string): Promise<any[]> {
    // Convert * wildcards to SQL % wildcards
    const namespacePattern = namespace.replace(/\*/g, "%");

    const symbols = await this.db
      .select({
        name: schema.universalSymbols.name,
        qualifiedName: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        namespace: schema.universalSymbols.namespace,
        filePath: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        returnType: schema.universalSymbols.returnType,
        signature: schema.universalSymbols.signature,
        semanticTags: schema.universalSymbols.semanticTags,
      })
      .from(schema.universalSymbols)
      .where(
        or(
          like(schema.universalSymbols.namespace, namespacePattern),
          eq(schema.universalSymbols.namespace, namespace)
        )
      )
      .orderBy(
        schema.universalSymbols.namespace,
        schema.universalSymbols.kind,
        schema.universalSymbols.name
      );

    // Group by namespace for better organization
    const grouped = new Map<string, any[]>();
    for (const symbol of symbols) {
      const ns = symbol.namespace || "global";
      if (!grouped.has(ns)) {
        grouped.set(ns, []);
      }
      grouped.get(ns)!.push(symbol);
    }

    return Array.from(grouped.entries()).map(([ns, syms]) => ({
      namespace: ns,
      symbolCount: syms.length,
      symbols: syms,
    }));
  }

  /**
   * Resolve a symbol name from a given namespace context
   * This implements C++ name lookup rules
   */
  async resolveSymbol(
    symbolName: string,
    fromNamespace: string,
    _fromFile: string
  ): Promise<any[]> {
    // Get parent namespace
    const parentNamespace = fromNamespace.substring(0, fromNamespace.lastIndexOf("::") || 0);

    // Try to resolve in order of C++ lookup rules
    const candidates = await this.db
      .select({
        name: schema.universalSymbols.name,
        qualifiedName: schema.universalSymbols.qualifiedName,
        kind: schema.universalSymbols.kind,
        namespace: schema.universalSymbols.namespace,
        filePath: schema.universalSymbols.filePath,
        line: schema.universalSymbols.line,
        returnType: schema.universalSymbols.returnType,
        signature: schema.universalSymbols.signature,
        semanticTags: schema.universalSymbols.semanticTags,
        priority: sql<number>`
          CASE 
            WHEN ${schema.universalSymbols.namespace} = ${fromNamespace} THEN 1
            WHEN ${schema.universalSymbols.namespace} = ${parentNamespace} THEN 2
            WHEN ${schema.universalSymbols.namespace} = '' THEN 3
            ELSE 5
          END
        `,
      })
      .from(schema.universalSymbols)
      .where(eq(schema.universalSymbols.name, symbolName))
      .orderBy(
        sql`priority`,
        schema.universalSymbols.qualifiedName
      );

    return candidates;
  }

  close(): void {
    // No longer managing database connection directly
    // Connection is managed by DrizzleDb
  }
}
