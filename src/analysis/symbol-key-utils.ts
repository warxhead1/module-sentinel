/**
 * Symbol Key Utilities
 *
 * Provides consistent key generation strategies across all semantic analysis components.
 * This ensures that symbol IDs, context keys, embedding keys, and database lookups
 * all use the same format for reliable mapping between components.
 */

import { SymbolInfo } from "../parsers/tree-sitter/parser-types.js";

/**
 * Generate a consistent unique key for a symbol that can be used across all components
 */
export function generateSymbolKey(
  symbol: SymbolInfo,
  filePath?: string
): string {
  const file = filePath || symbol.filePath || "";

  // Use qualified name if available, otherwise fall back to name
  const symbolName = symbol.qualifiedName || symbol.name;

  // Create consistent key: name@file:line:column
  return `${symbolName}@${file}:${symbol.line}:${symbol.column}`;
}

/**
 * Generate a semantic context key (used by semantic orchestrator)
 */
export function generateSemanticContextKey(
  symbol: SymbolInfo,
  filePath?: string
): string {
  return generateSymbolKey(symbol, filePath);
}

/**
 * Generate an embedding cache key (used by embedding engine)
 */
export function generateEmbeddingCacheKey(
  symbol: SymbolInfo,
  filePath?: string
): string {
  // Include complexity for cache invalidation when complexity changes
  const baseKey = generateSymbolKey(symbol, filePath);
  return `${baseKey}:${symbol.complexity || 0}`;
}

/**
 * Generate a symbol ID for embedding storage (used for embedding symbolId field)
 */
export function generateEmbeddingSymbolId(
  symbol: SymbolInfo,
  filePath?: string
): string {
  return generateSymbolKey(symbol, filePath);
}

/**
 * Generate symbol ID mapping key for database lookup
 */
export function generateDatabaseLookupKey(
  symbol: SymbolInfo,
  filePath?: string
): string {
  return generateSymbolKey(symbol, filePath);
}

/**
 * Generate an alternative key format for backward compatibility with existing patterns
 */
export function generateAlternativeKey(
  symbol: SymbolInfo,
  filePath?: string
): string {
  const file = filePath || symbol.filePath || "";
  // Format: file:name:line:column
  return `${file}:${symbol.name || symbol.qualifiedName}:${symbol.line}:${
    symbol.column
  }`;
}

/**
 * Extract symbol info from a generated key (for debugging/reverse lookup)
 */
export function parseSymbolKey(
  key: string
): { name: string; filePath: string; line: number; column: number } | null {
  try {
    // Format: name@file:line:column
    const atIndex = key.lastIndexOf("@");
    if (atIndex === -1) return null;

    const name = key.substring(0, atIndex);
    const locationPart = key.substring(atIndex + 1);

    const parts = locationPart.split(":");
    if (parts.length < 3) return null;

    const filePath = parts.slice(0, -2).join(":"); // Handle file paths with colons
    const line = parseInt(parts[parts.length - 2], 10);
    const column = parseInt(parts[parts.length - 1], 10);

    if (isNaN(line) || isNaN(column)) return null;

    return { name, filePath, line, column };
  } catch {
    return null;
  }
}

/**
 * Validate that a key follows the expected format
 */
export function isValidSymbolKey(key: string): boolean {
  return parseSymbolKey(key) !== null;
}

/**
 * Debug utility to log key generation
 */
export function debugKeyGeneration(
  symbol: SymbolInfo,
  filePath?: string,
  componentName?: string
): void {
  const _key = generateSymbolKey(symbol, filePath);
  const _component = componentName ? `[${componentName}] ` : "";
  // TODO: Implement debug logging for key generation
  // Should log: symbol name, generated key, component name
}
