/**
 * Local Code Embedding Generation System
 *
 * Generates vector embeddings for code symbols using local algorithms without external APIs.
 * Creates dense vector representations of code based on AST structure, semantic context,
 * and usage patterns for similarity analysis and clustering.
 */

import Parser from "tree-sitter";
import { Database } from "better-sqlite3";
import {
  SymbolInfo,
  RelationshipInfo,
} from "../parsers/tree-sitter/parser-types.js";
import { SemanticContext } from "./semantic-orchestrator.js";
import {
  generateEmbeddingSymbolId,
  generateEmbeddingCacheKey,
} from "./symbol-key-utils.js";
import { createLogger } from "../utils/logger.js";
import { checkMemory } from "../utils/memory-monitor.js";

export interface CodeEmbedding {
  symbolId: string | number;
  embedding: number[]; // Dense vector representation
  dimensions: number; // Embedding dimensionality (e.g., 128, 256, 512)
  version: string; // Embedding algorithm version
  metadata: EmbeddingMetadata;
}

export interface EmbeddingMetadata {
  symbolType: string;
  semanticRole: string;
  complexity: number;
  confidence: number;
  generatedAt: number; // timestamp
  algorithm: string; // Algorithm used to generate embedding
  featureCount: number; // Number of features used
}

export interface EmbeddingFeatures {
  // Structural features
  astStructure: number[]; // AST node type frequencies
  depthFeatures: number[]; // Nesting depth characteristics
  complexityFeatures: number[]; // Various complexity metrics

  // Lexical features
  tokenFeatures: number[]; // Token type frequencies
  namingFeatures: number[]; // Naming pattern features
  commentFeatures: number[]; // Comment density and quality

  // Semantic features
  semanticRoleFeatures: number[]; // Semantic role encoding
  usagePatternFeatures: number[]; // Usage pattern encoding
  relationshipFeatures: number[]; // Relationship pattern encoding

  // Domain-specific features
  languageFeatures: number[]; // Language-specific features
  architecturalFeatures: number[]; // Architectural pattern features
  qualityFeatures: number[]; // Code quality indicators
}

export interface SimilarityResult {
  symbolId1: string | number;
  symbolId2: string | number;
  similarity: number; // Cosine similarity (0-1)
  semanticSimilarity: number; // Semantic-focused similarity
  structuralSimilarity: number; // AST structure similarity
  functionalSimilarity: number; // Functional behavior similarity
}

export class LocalCodeEmbeddingEngine {
  private db: Database;
  private embeddingDimensions: number;
  private debugMode: boolean = false;
  private logger = createLogger("LocalCodeEmbeddingEngine");

  // Feature extractors
  private astFeatureExtractor: ASTFeatureExtractor;
  private lexicalFeatureExtractor: LexicalFeatureExtractor;
  private semanticFeatureExtractor: SemanticFeatureExtractor;
  private relationshipFeatureExtractor: RelationshipFeatureExtractor;

  // Embedding cache for performance
  private embeddingCache: Map<string, CodeEmbedding> = new Map();
  private static readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(
    db: Database,
    options: {
      dimensions?: number;
      debugMode?: boolean;
    } = {}
  ) {
    this.db = db;
    this.embeddingDimensions = options.dimensions || 256;
    this.debugMode = options.debugMode || false;

    // Initialize feature extractors
    this.astFeatureExtractor = new ASTFeatureExtractor();
    this.lexicalFeatureExtractor = new LexicalFeatureExtractor();
    this.semanticFeatureExtractor = new SemanticFeatureExtractor();
    this.relationshipFeatureExtractor = new RelationshipFeatureExtractor();
  }

  /**
   * Generate embedding for a single symbol
   */
  async generateEmbedding(
    symbol: SymbolInfo,
    ast: Parser.Tree | null,
    sourceCode: string,
    semanticContext?: SemanticContext,
    relationships?: RelationshipInfo[]
  ): Promise<CodeEmbedding> {
    const cacheKey = this.getCacheKey(symbol);

    // Check cache first
    if (this.embeddingCache.has(cacheKey)) {
      const cached = this.embeddingCache.get(cacheKey)!;
      if (
        Date.now() - cached.metadata.generatedAt <
        LocalCodeEmbeddingEngine.CACHE_TTL
      ) {
        return cached;
      }
    }

    const startTime = Date.now();
    const memoryBefore = checkMemory();

    // Extract comprehensive features
    const features = await this.extractFeatures(
      symbol,
      ast!,
      sourceCode,
      semanticContext,
      relationships
    );

    // Generate embedding vector
    const embedding = this.generateEmbeddingVector(features);

    // Create embedding object with consistent symbolId
    const codeEmbedding: CodeEmbedding = {
      symbolId: generateEmbeddingSymbolId(symbol), // Use consistent key format
      embedding,
      dimensions: this.embeddingDimensions,
      version: "1.0.0",
      metadata: {
        symbolType: symbol.kind,
        semanticRole: semanticContext?.semanticRole.primary || "unknown",
        complexity: symbol.complexity || 0,
        confidence: symbol.confidence || 1.0,
        generatedAt: Date.now(),
        algorithm: "local-multi-feature-v1",
        featureCount: this.getTotalFeatureCount(features),
      },
    };

    // Cache the result
    this.embeddingCache.set(cacheKey, codeEmbedding);

    // Performance tracking with existing monitoring
    const duration = Date.now() - startTime;
    const memoryAfter = checkMemory();
    
    this.logger.metric("embeddingGeneration", duration, "ms", {
      symbolName: symbol.name,
      symbolKind: symbol.kind,
      dimensions: this.embeddingDimensions,
      featureCount: this.getTotalFeatureCount(features),
      memoryUsed: memoryAfter.heapUsed - memoryBefore.heapUsed
    });

    if (duration > 1000) { // Log slow embeddings
      this.logger.warn("Slow embedding generation", {
        symbolName: symbol.name,
        duration,
        complexity: symbol.complexity
      });
    }

    return codeEmbedding;
  }

  /**
   * Generate embeddings for multiple symbols in batch
   */
  async generateBatchEmbeddings(
    symbols: Array<{
      symbol: SymbolInfo;
      ast: Parser.Tree;
      sourceCode: string;
      semanticContext?: SemanticContext;
      relationships?: RelationshipInfo[];
    }>
  ): Promise<CodeEmbedding[]> {
    const startTime = Date.now();
    const memoryBefore = checkMemory();

    // Process in parallel with controlled concurrency
    const concurrency = 8; // Process 8 symbols at once
    const results: CodeEmbedding[] = [];

    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      const batchPromises = batch.map((item) =>
        this.generateEmbedding(
          item.symbol,
          item.ast,
          item.sourceCode,
          item.semanticContext,
          item.relationships
        )
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const duration = Date.now() - startTime;
    const memoryAfter = checkMemory();
    
    // Performance tracking for batch processing
    this.logger.metric("batchEmbeddingGeneration", duration, "ms", {
      symbolCount: symbols.length,
      avgTimePerSymbol: duration / symbols.length,
      dimensions: this.embeddingDimensions,
      totalMemoryUsed: memoryAfter.heapUsed - memoryBefore.heapUsed
    });

    this.logger.info("Batch embedding generation completed", {
      symbolCount: symbols.length,
      totalDuration: duration,
      averagePerSymbol: `${Math.round(duration / symbols.length)}ms`
    });

    return results;
  }

  /**
   * Calculate similarity between two embeddings
   */
  calculateSimilarity(
    embedding1: CodeEmbedding,
    embedding2: CodeEmbedding
  ): SimilarityResult {
    // Cosine similarity
    const similarity = this.cosineSimilarity(
      embedding1.embedding,
      embedding2.embedding
    );

    // Calculate specialized similarity metrics by analyzing different feature segments
    const semanticSimilarity = this.calculateSemanticSimilarity(embedding1, embedding2);
    const structuralSimilarity = this.calculateStructuralSimilarity(embedding1, embedding2);
    const functionalSimilarity = this.calculateFunctionalSimilarity(embedding1, embedding2);

    return {
      symbolId1: embedding1.symbolId,
      symbolId2: embedding2.symbolId,
      similarity,
      semanticSimilarity,
      structuralSimilarity,
      functionalSimilarity,
    };
  }

  /**
   * Calculate semantic similarity based on role, pattern, and architectural features
   */
  private calculateSemanticSimilarity(embedding1: CodeEmbedding, embedding2: CodeEmbedding): number {
    const vec1 = embedding1.embedding;
    const vec2 = embedding2.embedding;
    
    // Identify semantic feature segments (approximate positions)
    // Based on our feature extraction order: AST structure, depth, complexity, tokens, naming, comments, semantic roles, patterns, relationships, language, architectural, quality
    const semanticStart = 20 + 2 + 7 + 3 + 5 + 3; // After AST structure, depth, complexity, tokens, naming, comments
    const semanticEnd = semanticStart + 6 + 8 + 5; // Semantic roles (6) + patterns (8) + architectural (5)
    
    if (vec1.length <= semanticEnd || vec2.length <= semanticEnd) {
      return this.cosineSimilarity(vec1, vec2); // Fallback to overall similarity
    }
    
    const semanticVec1 = vec1.slice(semanticStart, semanticEnd);
    const semanticVec2 = vec2.slice(semanticStart, semanticEnd);
    
    return this.cosineSimilarity(semanticVec1, semanticVec2);
  }

  /**
   * Calculate structural similarity based on AST structure, depth, and complexity features
   */
  private calculateStructuralSimilarity(embedding1: CodeEmbedding, embedding2: CodeEmbedding): number {
    const vec1 = embedding1.embedding;
    const vec2 = embedding2.embedding;
    
    // AST structure (20) + depth (2) + complexity (7) features
    const structuralEnd = 20 + 2 + 7;
    
    if (vec1.length <= structuralEnd || vec2.length <= structuralEnd) {
      return this.cosineSimilarity(vec1, vec2); // Fallback to overall similarity
    }
    
    const structuralVec1 = vec1.slice(0, structuralEnd);
    const structuralVec2 = vec2.slice(0, structuralEnd);
    
    return this.cosineSimilarity(structuralVec1, structuralVec2);
  }

  /**
   * Calculate functional similarity based on complexity, quality, and relationship features
   */
  private calculateFunctionalSimilarity(embedding1: CodeEmbedding, embedding2: CodeEmbedding): number {
    const vec1 = embedding1.embedding;
    const vec2 = embedding2.embedding;
    
    // Complexity features (7) + quality features + relationship features
    const complexityStart = 20 + 2; // After AST structure and depth
    const complexityEnd = complexityStart + 7; // Complexity features
    
    // Quality features are at the end after all other features
    const qualityStart = vec1.length - 5; // Assuming 5 quality features
    
    if (vec1.length <= complexityEnd || vec2.length <= qualityStart) {
      return this.cosineSimilarity(vec1, vec2); // Fallback to overall similarity
    }
    
    // Combine complexity and quality features for functional similarity
    const functionalVec1 = [...vec1.slice(complexityStart, complexityEnd), ...vec1.slice(qualityStart)];
    const functionalVec2 = [...vec2.slice(complexityStart, complexityEnd), ...vec2.slice(qualityStart)];
    
    return this.cosineSimilarity(functionalVec1, functionalVec2);
  }

  /**
   * Find most similar embeddings to a target embedding
   */
  findSimilar(
    targetEmbedding: CodeEmbedding,
    candidateEmbeddings: CodeEmbedding[],
    topK: number = 10
  ): SimilarityResult[] {
    const similarities = candidateEmbeddings
      .map((candidate) => this.calculateSimilarity(targetEmbedding, candidate))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return similarities;
  }

  /**
   * Extract comprehensive features from a symbol
   */
  public async extractFeatures(
    symbol: SymbolInfo,
    ast: Parser.Tree,
    sourceCode: string,
    semanticContext?: SemanticContext,
    relationships?: RelationshipInfo[]
  ): Promise<EmbeddingFeatures> {
    // Extract symbol-specific source code using line information
    const symbolSourceCode = this.extractSymbolSourceCode(symbol, sourceCode);
    
    // Extract features from different sources in parallel
    const [
      astFeatures,
      lexicalFeatures,
      semanticFeatures,
      relationshipFeatures,
    ] = await Promise.all([
      this.astFeatureExtractor.extract(symbol, ast, sourceCode, semanticContext),
      this.lexicalFeatureExtractor.extract(symbol, symbolSourceCode),
      this.semanticFeatureExtractor.extract(symbol, semanticContext),
      this.relationshipFeatureExtractor.extract(symbol, relationships || []),
    ]);

    return {
      astStructure: astFeatures.structure,
      depthFeatures: astFeatures.depth,
      complexityFeatures: astFeatures.complexity,
      tokenFeatures: lexicalFeatures.tokens,
      namingFeatures: lexicalFeatures.naming,
      commentFeatures: lexicalFeatures.comments,
      semanticRoleFeatures: semanticFeatures.roles,
      usagePatternFeatures: semanticFeatures.patterns,
      relationshipFeatures: relationshipFeatures.patterns,
      languageFeatures: astFeatures.language,
      architecturalFeatures: semanticFeatures.architectural,
      qualityFeatures: lexicalFeatures.quality,
    };
  }

  /**
   * Generate embedding vector from extracted features
   */
  private generateEmbeddingVector(features: EmbeddingFeatures): number[] {
    // Concatenate all feature vectors
    const allFeatures = [
      ...features.astStructure,
      ...features.depthFeatures,
      ...features.complexityFeatures,
      ...features.tokenFeatures,
      ...features.namingFeatures,
      ...features.commentFeatures,
      ...features.semanticRoleFeatures,
      ...features.usagePatternFeatures,
      ...features.relationshipFeatures,
      ...features.languageFeatures,
      ...features.architecturalFeatures,
      ...features.qualityFeatures,
    ];

    // Apply dimensionality reduction if needed
    return this.reduceDimensionality(allFeatures, this.embeddingDimensions);
  }

  /**
   * Reduce dimensionality using PCA-like transformation
   */
  private reduceDimensionality(
    features: number[],
    targetDim: number
  ): number[] {
    if (features.length <= targetDim) {
      // Pad with zeros if features are fewer than target dimensions
      return [...features, ...new Array(targetDim - features.length).fill(0)];
    }

    // Simple dimensionality reduction using binning
    const binSize = Math.ceil(features.length / targetDim);
    const reduced: number[] = [];

    for (let i = 0; i < targetDim; i++) {
      const start = i * binSize;
      const end = Math.min(start + binSize, features.length);
      const bin = features.slice(start, end);

      // Use average of bin values
      const average = bin.reduce((sum, val) => sum + val, 0) / bin.length;
      reduced.push(average);
    }

    // Normalize the vector
    return this.normalizeVector(reduced);
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );
    if (magnitude === 0) return vector;

    return vector.map((val) => val / magnitude);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error("Vectors must have the same length");
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return Math.max(0, Math.min(1, dotProduct / (magnitude1 * magnitude2)));
  }

  /**
   * Generate cache key for a symbol
   */
  private getCacheKey(symbol: SymbolInfo): string {
    return generateEmbeddingCacheKey(symbol);
  }

  /**
   * Extract symbol-specific source code using line information
   */
  private extractSymbolSourceCode(symbol: SymbolInfo, fullSourceCode: string): string {
    if (!fullSourceCode) {
      console.warn(`[EmbeddingEngine] No source code provided for symbol ${symbol.name}`);
      return "";
    }
    
    if (!symbol.line || symbol.line <= 0) {
      console.warn(`[EmbeddingEngine] Invalid line number ${symbol.line} for symbol ${symbol.name}, using full source`);
      return fullSourceCode; // Fallback to full source if line number is invalid
    }

    const lines = fullSourceCode.split('\n');
    const startLine = Math.max(0, symbol.line - 1); // Convert to 0-based indexing
    const endLine = symbol.endLine ? Math.min(lines.length, symbol.endLine) : startLine + 1;
    
    // Validate line bounds
    if (startLine >= lines.length) {
      console.warn(`[EmbeddingEngine] Line ${symbol.line} exceeds file length ${lines.length} for symbol ${symbol.name}`);
      return fullSourceCode; // Fallback to full source
    }
    
    // Extract the lines containing this symbol
    const symbolLines = lines.slice(startLine, endLine);
    const extractedCode = symbolLines.join('\n');
    
    // Additional validation
    if (!extractedCode.trim()) {
      console.warn(`[EmbeddingEngine] Extracted empty code for symbol ${symbol.name} at line ${symbol.line}`);
      return fullSourceCode; // Fallback to full source
    }
    
    return extractedCode;
  }

  /**
   * Count total features extracted
   */
  private getTotalFeatureCount(features: EmbeddingFeatures): number {
    return (
      features.astStructure.length +
      features.depthFeatures.length +
      features.complexityFeatures.length +
      features.tokenFeatures.length +
      features.namingFeatures.length +
      features.commentFeatures.length +
      features.semanticRoleFeatures.length +
      features.usagePatternFeatures.length +
      features.relationshipFeatures.length +
      features.languageFeatures.length +
      features.architecturalFeatures.length +
      features.qualityFeatures.length
    );
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }
}

// Feature extractor classes
class ASTFeatureExtractor {
  async extract(
    symbol: SymbolInfo,
    ast: Parser.Tree,
    _sourceCode: string,
    semanticContext?: SemanticContext
  ): Promise<{
    structure: number[];
    depth: number[];
    complexity: number[];
    language: number[];
  }> {
    // Extract AST structure features
    const structure = this.extractStructureFeatures(ast);
    const depth = this.extractDepthFeatures(ast);
    const complexity = this.extractComplexityFeatures(symbol, semanticContext);
    const language = this.extractLanguageFeatures(symbol);

    return { structure, depth, complexity, language };
  }

  private extractStructureFeatures(ast: Parser.Tree): number[] {
    // Count different AST node types
    const nodeTypeCounts: Record<string, number> = {};

    // Check if AST is valid
    if (!ast || !ast.rootNode) {
      return new Array(20).fill(0); // Return empty features array
    }

    // Use visited set to prevent infinite loops from circular references
    const visited = new Set<Parser.SyntaxNode>();

    const traverse = (node: Parser.SyntaxNode) => {
      // Prevent infinite loops from circular references
      if (visited.has(node)) {
        return;
      }
      visited.add(node);

      // Validate node before processing
      if (!node || !node.type) {
        return;
      }

      nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;

      // Safely traverse children with validation
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child !== node) {
          // Ensure child exists and isn't self-referential
          traverse(child);
        }
      }
    };

    traverse(ast.rootNode);

    // Convert to feature vector (top 50 most common node types)
    const commonNodeTypes = [
      "identifier",
      "function_definition",
      "compound_statement",
      "expression_statement",
      "assignment_expression",
      "call_expression",
      "parameter_list",
      "declaration",
      "if_statement",
      "for_statement",
      "while_statement",
      "return_statement",
      "binary_expression",
      "unary_expression",
      "field_expression",
      "subscript_expression",
      "type_identifier",
      "primitive_type",
      "pointer_declarator",
      "array_declarator",
      // Add more common node types...
    ];

    return commonNodeTypes.map((type) => nodeTypeCounts[type] || 0);
  }

  private extractDepthFeatures(ast: Parser.Tree): number[] {
    let maxDepth = 0;
    let avgDepth = 0;
    let nodeCount = 0;

    // Check if AST is valid
    if (!ast || !ast.rootNode) {
      return [0, 0]; // Return default depth features
    }

    // Use visited set to prevent infinite loops from circular references
    const visited = new Set<Parser.SyntaxNode>();

    const traverse = (node: Parser.SyntaxNode, depth: number) => {
      // Prevent infinite loops from circular references
      if (visited.has(node)) {
        return;
      }
      visited.add(node);

      // Validate node before processing
      if (!node) {
        return;
      }

      maxDepth = Math.max(maxDepth, depth);
      avgDepth += depth;
      nodeCount++;

      // Safely traverse children with validation
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child !== node) {
          // Ensure child exists and isn't self-referential
          traverse(child, depth + 1);
        }
      }
    };

    traverse(ast.rootNode, 0);
    avgDepth = nodeCount > 0 ? avgDepth / nodeCount : 0;

    return [maxDepth / 10, avgDepth / 10]; // Normalize
  }

  private extractComplexityFeatures(symbol: SymbolInfo, semanticContext?: SemanticContext): number[] {
    // If we have rich complexity metrics from SemanticContext, use them
    if (semanticContext?.complexityMetrics) {
      const metrics = semanticContext.complexityMetrics;
      return [
        (metrics.cyclomaticComplexity || 0) / 20, // Normalized cyclomatic complexity
        (metrics.cognitiveComplexity || 0) / 30, // Normalized cognitive complexity
        (metrics.nestingDepth || 0) / 10, // Normalized nesting depth
        (metrics.parameterCount || 0) / 15, // Normalized parameter count
        (metrics.lineCount || 0) / 200, // Normalized line count
        (symbol.signature?.length || 0) / 100, // Signature length
        (symbol.returnType?.length || 0) / 50, // Return type complexity
      ];
    }
    
    // Fallback to basic complexity if detailed metrics not available
    return [
      symbol.complexity / 20, // Normalize complexity
      (symbol.signature?.length || 0) / 100, // Signature length
      (symbol.returnType?.length || 0) / 50, // Return type complexity
      0, 0, 0, 0 // Padding for consistent dimensions
    ];
  }

  private extractLanguageFeatures(symbol: SymbolInfo): number[] {
    // Language-specific feature encoding
    const features: number[] = new Array(10).fill(0);

    // Symbol kind encoding
    const kindMap: Record<string, number> = {
      function: 0,
      method: 1,
      class: 2,
      struct: 3,
      interface: 4,
      enum: 5,
      variable: 6,
      constant: 7,
      namespace: 8,
      module: 9,
    };

    const kindIndex = kindMap[symbol.kind] || 9;
    features[kindIndex] = 1;

    return features;
  }
}

class LexicalFeatureExtractor {
  async extract(
    symbol: SymbolInfo,
    sourceCode: string
  ): Promise<{
    tokens: number[];
    naming: number[];
    comments: number[];
    quality: number[];
  }> {
    const tokens = this.extractTokenFeatures(sourceCode);
    const naming = this.extractNamingFeatures(symbol);
    const comments = this.extractCommentFeatures(sourceCode);
    const quality = this.extractQualityFeatures(sourceCode);

    return { tokens, naming, comments, quality };
  }

  private extractTokenFeatures(sourceCode: string): number[] {
    // Handle null/undefined source code
    if (!sourceCode || sourceCode.length === 0) {
      console.warn(
        "[LexicalFeatureExtractor] Empty source code, returning default token features"
      );
      return [0, 0, 0];
    }

    // Count token types
    const tokens = sourceCode.split(/\s+/).filter((t) => t.length > 0);
    const keywords = [
      "if",
      "else",
      "for",
      "while",
      "return",
      "class",
      "function",
      "const",
      "let",
      "var",
    ];
    const operators = [
      "+",
      "-",
      "*",
      "/",
      "=",
      "==",
      "!=",
      "<",
      ">",
      "&&",
      "||",
    ];

    const keywordCount = tokens.filter((t) => keywords.includes(t)).length;
    const operatorCount = sourceCode
      .split("")
      .filter((c) => operators.includes(c)).length;
    const identifierCount = tokens.filter((t) =>
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)
    ).length;

    if (tokens.length === 0) {
      return [0, 0, 0];
    }

    return [
      keywordCount / tokens.length,
      operatorCount / sourceCode.length,
      identifierCount / tokens.length,
    ];
  }

  private extractNamingFeatures(symbol: SymbolInfo): number[] {
    const name = symbol.name;

    return [
      name.length / 20, // Name length
      (name.match(/[A-Z]/g) || []).length / name.length, // Camel case ratio
      (name.match(/_/g) || []).length / name.length, // Snake case ratio
      /^[a-z]/.test(name) ? 1 : 0, // Starts with lowercase
      /^[A-Z]/.test(name) ? 1 : 0, // Starts with uppercase
    ];
  }

  private extractCommentFeatures(sourceCode: string): number[] {
    const lines = sourceCode.split("\n");
    const commentLines = lines.filter(
      (line) => line.trim().startsWith("//") || line.trim().startsWith("/*")
    );

    return [
      commentLines.length / lines.length, // Comment density
      sourceCode.includes("/**") ? 1 : 0, // Has doc comments
    ];
  }

  private extractQualityFeatures(sourceCode: string): number[] {
    const lines = sourceCode.split("\n");
    const avgLineLength =
      lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    const emptyLines = lines.filter((line) => line.trim() === "").length;

    return [
      Math.min(1, avgLineLength / 80), // Line length (normalized to 80 chars)
      emptyLines / lines.length, // Empty line ratio
      lines.length / 100, // Function size
    ];
  }
}

class SemanticFeatureExtractor {
  async extract(
    symbol: SymbolInfo,
    semanticContext?: SemanticContext
  ): Promise<{
    roles: number[];
    patterns: number[];
    architectural: number[];
  }> {
    if (!semanticContext) {
      return {
        roles: new Array(6).fill(0),
        patterns: new Array(8).fill(0),
        architectural: new Array(5).fill(0),
      };
    }

    const roles = this.extractRoleFeatures(semanticContext);
    const patterns = this.extractPatternFeatures(semanticContext);
    const architectural = this.extractArchitecturalFeatures(semanticContext);

    return { roles, patterns, architectural };
  }

  private extractRoleFeatures(context: SemanticContext): number[] {
    const roleMap = {
      data: 0,
      behavior: 1,
      control: 2,
      interface: 3,
      utility: 4,
      configuration: 5,
    };

    const features = new Array(6).fill(0);
    const roleIndex =
      roleMap[context.semanticRole.primary as keyof typeof roleMap];
    if (roleIndex !== undefined) {
      features[roleIndex] = context.semanticRole.confidence;
    }

    return features;
  }

  private extractPatternFeatures(context: SemanticContext): number[] {
    const patternMap = {
      creator: 0,
      consumer: 1,
      transformer: 2,
      validator: 3,
      coordinator: 4,
      observer: 5,
      adapter: 6,
      facade: 7,
    };

    const features = new Array(8).fill(0);

    context.usagePatterns.forEach((pattern: { pattern: string; frequency: number }) => {
      const index = patternMap[pattern.pattern as keyof typeof patternMap];
      if (index !== undefined) {
        features[index] = Math.min(1, pattern.frequency / 10);
      }
    });

    return features;
  }

  private extractArchitecturalFeatures(context: SemanticContext): number[] {
    const layerMap = {
      presentation: 0,
      business: 1,
      data: 2,
      infrastructure: 3,
      "cross-cutting": 4,
    };

    const features = new Array(5).fill(0);
    const layerIndex =
      layerMap[context.architecturalLayer.layer as keyof typeof layerMap];
    if (layerIndex !== undefined) {
      features[layerIndex] = context.architecturalLayer.confidence;
    }

    return features;
  }
}

class RelationshipFeatureExtractor {
  async extract(
    symbol: SymbolInfo,
    relationships: RelationshipInfo[]
  ): Promise<{
    patterns: number[];
  }> {
    const patterns = this.extractRelationshipPatterns(relationships);
    return { patterns };
  }

  private extractRelationshipPatterns(
    relationships: RelationshipInfo[]
  ): number[] {
    // Note: We need the current symbol name to properly filter relationships
    // For now, count all relationship types and their frequencies
    const relationshipCounts = new Map<string, number>();

    // Count occurrences of each relationship type
    relationships.forEach((rel) => {
      const type = rel.relationshipType || 'unknown';
      relationshipCounts.set(type, (relationshipCounts.get(type) || 0) + 1);
    });

    const relationshipTypes = [
      "calls",
      "uses", 
      "creates",
      "inherits",
      "implements",
      "aggregates",
      "imports",
      "exports"
    ];

    // Create feature vector based on relationship type frequencies
    const features: number[] = relationshipTypes.map(type => {
      const count = relationshipCounts.get(type) || 0;
      return Math.min(1, count / 10); // Normalize to 0-1 (max 10 relationships per type)
    });

    // Add total relationship count as a feature
    features.push(Math.min(1, relationships.length / 20)); // Normalize total count

    return features;
  }
}
