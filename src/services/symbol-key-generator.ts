/**
 * SymbolKeyGenerator
 *
 * Unified symbol key generation with pluggable strategies.
 * Consolidates the multiple key generation approaches found throughout the codebase
 * into a single, consistent, and extensible service.
 */

import { SymbolInfo } from "../parsers/tree-sitter/parser-types.js";
import { createLogger } from "../utils/logger.js";

export interface SymbolKeyStrategy {
  generateKey(symbol: SymbolInfo, filePath?: string): string;
  getStrategyName(): string;
  isValidKey(key: string): boolean;
  parseKey?(key: string): ParsedSymbolKey | null;
}

export interface ParsedSymbolKey {
  name: string;
  filePath: string;
  line: number;
  column: number;
  qualifiedName?: string;
}

/**
 * Primary strategy: name@file:line:column
 */
export class PrimaryKeyStrategy implements SymbolKeyStrategy {
  getStrategyName(): string {
    return "primary";
  }

  generateKey(symbol: SymbolInfo, filePath?: string): string {
    const file = filePath || symbol.filePath || "";
    const symbolName = symbol.qualifiedName || symbol.name;
    return `${symbolName}@${file}:${symbol.line}:${symbol.column}`;
  }

  isValidKey(key: string): boolean {
    return this.parseKey(key) !== null;
  }

  parseKey(key: string): ParsedSymbolKey | null {
    try {
      const atIndex = key.lastIndexOf("@");
      if (atIndex === -1) return null;

      const name = key.substring(0, atIndex);
      const locationPart = key.substring(atIndex + 1);

      const parts = locationPart.split(":");
      if (parts.length < 3) return null;

      const filePath = parts.slice(0, -2).join(":");
      const line = parseInt(parts[parts.length - 2], 10);
      const column = parseInt(parts[parts.length - 1], 10);

      if (isNaN(line) || isNaN(column)) return null;

      return { name, filePath, line, column, qualifiedName: name };
    } catch {
      return null;
    }
  }
}

/**
 * Alternative strategy: file:name:line:column (for backward compatibility)
 */
export class AlternativeKeyStrategy implements SymbolKeyStrategy {
  getStrategyName(): string {
    return "alternative";
  }

  generateKey(symbol: SymbolInfo, filePath?: string): string {
    const file = filePath || symbol.filePath || "";
    const symbolName = symbol.name || symbol.qualifiedName;
    return `${file}:${symbolName}:${symbol.line}:${symbol.column}`;
  }

  isValidKey(key: string): boolean {
    return this.parseKey(key) !== null;
  }

  parseKey(key: string): ParsedSymbolKey | null {
    try {
      const parts = key.split(":");
      if (parts.length < 4) return null;

      const filePath = parts.slice(0, -3).join(":");
      const name = parts[parts.length - 3];
      const line = parseInt(parts[parts.length - 2], 10);
      const column = parseInt(parts[parts.length - 1], 10);

      if (isNaN(line) || isNaN(column)) return null;

      return { name, filePath, line, column };
    } catch {
      return null;
    }
  }
}

/**
 * Simple name strategy: just the symbol name (for fallback lookups)
 */
export class SimpleNameStrategy implements SymbolKeyStrategy {
  getStrategyName(): string {
    return "simple";
  }

  generateKey(symbol: SymbolInfo, _filePath?: string): string {
    return symbol.name;
  }

  isValidKey(key: string): boolean {
    return key.length > 0 && !key.includes("@") && !key.includes(":");
  }
}

/**
 * Qualified name strategy: uses qualified name only
 */
export class QualifiedNameStrategy implements SymbolKeyStrategy {
  getStrategyName(): string {
    return "qualified";
  }

  generateKey(symbol: SymbolInfo, _filePath?: string): string {
    return symbol.qualifiedName || symbol.name;
  }

  isValidKey(key: string): boolean {
    return key.length > 0;
  }
}

/**
 * Embedding strategy: includes complexity for cache invalidation
 */
export class EmbeddingKeyStrategy implements SymbolKeyStrategy {
  private primaryStrategy = new PrimaryKeyStrategy();

  getStrategyName(): string {
    return "embedding";
  }

  generateKey(symbol: SymbolInfo, filePath?: string): string {
    const baseKey = this.primaryStrategy.generateKey(symbol, filePath);
    return `${baseKey}:${symbol.complexity || 0}`;
  }

  isValidKey(key: string): boolean {
    // Check if it ends with :number (complexity)
    const lastColonIndex = key.lastIndexOf(":");
    if (lastColonIndex === -1) return false;
    
    const complexityPart = key.substring(lastColonIndex + 1);
    if (isNaN(parseInt(complexityPart, 10))) return false;
    
    const baseKey = key.substring(0, lastColonIndex);
    return this.primaryStrategy.isValidKey(baseKey);
  }

  parseKey(key: string): ParsedSymbolKey | null {
    const lastColonIndex = key.lastIndexOf(":");
    if (lastColonIndex === -1) return null;
    
    const baseKey = key.substring(0, lastColonIndex);
    return this.primaryStrategy.parseKey(baseKey);
  }
}

export type KeyStrategyType = "primary" | "alternative" | "simple" | "qualified" | "embedding";

export class SymbolKeyGenerator {
  private static instance: SymbolKeyGenerator;
  private logger = createLogger("SymbolKeyGenerator");
  private strategies = new Map<KeyStrategyType, SymbolKeyStrategy>();
  private defaultStrategy: KeyStrategyType = "primary";

  private constructor() {
    this.initializeStrategies();
  }

  public static getInstance(): SymbolKeyGenerator {
    if (!SymbolKeyGenerator.instance) {
      SymbolKeyGenerator.instance = new SymbolKeyGenerator();
    }
    return SymbolKeyGenerator.instance;
  }

  private initializeStrategies(): void {
    this.strategies.set("primary", new PrimaryKeyStrategy());
    this.strategies.set("alternative", new AlternativeKeyStrategy());
    this.strategies.set("simple", new SimpleNameStrategy());
    this.strategies.set("qualified", new QualifiedNameStrategy());
    this.strategies.set("embedding", new EmbeddingKeyStrategy());

    this.logger.debug(`Initialized ${this.strategies.size} key generation strategies`);
  }

  /**
   * Generate a key using the specified strategy
   */
  public generateKey(
    symbol: SymbolInfo,
    filePath?: string,
    strategy: KeyStrategyType = this.defaultStrategy
  ): string {
    const keyStrategy = this.strategies.get(strategy);
    if (!keyStrategy) {
      throw new Error(`Unknown key strategy: ${strategy}`);
    }

    return keyStrategy.generateKey(symbol, filePath);
  }

  /**
   * Generate multiple keys for a symbol using different strategies
   */
  public generateMultipleKeys(
    symbol: SymbolInfo,
    filePath?: string,
    strategies: KeyStrategyType[] = ["primary", "alternative", "simple", "qualified"]
  ): Map<KeyStrategyType, string> {
    const keys = new Map<KeyStrategyType, string>();

    for (const strategyType of strategies) {
      try {
        const key = this.generateKey(symbol, filePath, strategyType);
        keys.set(strategyType, key);
      } catch (error) {
        this.logger.warn(`Failed to generate key with strategy ${strategyType}`, { error });
      }
    }

    return keys;
  }

  /**
   * Generate all possible keys for a symbol (for comprehensive mapping)
   */
  public generateAllKeys(symbol: SymbolInfo, filePath?: string): Map<KeyStrategyType, string> {
    return this.generateMultipleKeys(symbol, filePath, [
      "primary",
      "alternative", 
      "simple",
      "qualified",
      "embedding"
    ]);
  }

  /**
   * Validate a key against all strategies
   */
  public validateKey(key: string): { valid: boolean; strategies: KeyStrategyType[] } {
    const validStrategies: KeyStrategyType[] = [];

    for (const [strategyType, strategy] of this.strategies) {
      if (strategy.isValidKey(key)) {
        validStrategies.push(strategyType);
      }
    }

    return {
      valid: validStrategies.length > 0,
      strategies: validStrategies
    };
  }

  /**
   * Parse a key using the best matching strategy
   */
  public parseKey(key: string): ParsedSymbolKey | null {
    // Try strategies in order of preference
    const strategyOrder: KeyStrategyType[] = ["primary", "alternative", "embedding"];
    
    for (const strategyType of strategyOrder) {
      const strategy = this.strategies.get(strategyType);
      if (strategy && strategy.parseKey) {
        const result = strategy.parseKey(key);
        if (result) {
          this.logger.debug(`Parsed key with ${strategyType} strategy`, { key, result });
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Get the strategy for a given key type
   */
  public getStrategy(strategyType: KeyStrategyType): SymbolKeyStrategy | null {
    return this.strategies.get(strategyType) || null;
  }

  /**
   * Set the default strategy
   */
  public setDefaultStrategy(strategy: KeyStrategyType): void {
    if (!this.strategies.has(strategy)) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    this.defaultStrategy = strategy;
    this.logger.debug(`Set default strategy to ${strategy}`);
  }

  /**
   * Add or replace a custom strategy
   */
  public addStrategy(strategyType: KeyStrategyType, strategy: SymbolKeyStrategy): void {
    this.strategies.set(strategyType, strategy);
    this.logger.debug(`Added custom strategy: ${strategyType}`);
  }

  /**
   * Generate keys for batch symbol processing
   */
  public generateBatchKeys(
    symbols: Array<{ symbol: SymbolInfo; filePath?: string }>,
    strategies: KeyStrategyType[] = ["primary", "alternative"]
  ): Map<string, { symbol: SymbolInfo; filePath?: string; keys: Map<KeyStrategyType, string> }> {
    const results = new Map();

    for (const item of symbols) {
      const keys = this.generateMultipleKeys(item.symbol, item.filePath, strategies);
      const primaryKey = keys.get("primary") || keys.get("alternative") || item.symbol.name;
      
      results.set(primaryKey, {
        symbol: item.symbol,
        filePath: item.filePath,
        keys
      });
    }

    this.logger.debug(`Generated batch keys for ${symbols.length} symbols`);
    return results;
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getSymbolKeyGenerator(): SymbolKeyGenerator {
  return SymbolKeyGenerator.getInstance();
}

/**
 * Convenience functions that match the existing symbol-key-utils.ts API
 */
export function generateSymbolKey(symbol: SymbolInfo, filePath?: string): string {
  return getSymbolKeyGenerator().generateKey(symbol, filePath, "primary");
}

export function generateAlternativeKey(symbol: SymbolInfo, filePath?: string): string {
  return getSymbolKeyGenerator().generateKey(symbol, filePath, "alternative");
}

export function generateEmbeddingCacheKey(symbol: SymbolInfo, filePath?: string): string {
  return getSymbolKeyGenerator().generateKey(symbol, filePath, "embedding");
}

export function parseSymbolKey(key: string): ParsedSymbolKey | null {
  return getSymbolKeyGenerator().parseKey(key);
}

export function isValidSymbolKey(key: string): boolean {
  return getSymbolKeyGenerator().validateKey(key).valid;
}