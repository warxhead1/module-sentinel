/**
 * CallResolutionStrategies
 *
 * Modular, pluggable call target resolution strategies.
 * Refactors the complex call resolution logic into discrete, testable,
 * and maintainable strategy classes.
 */

import { RelationshipInfo } from "../parsers/tree-sitter/parser-types.js";
import { createLogger } from "../utils/logger.js";

export interface SymbolData {
  id: number;
  name: string;
  qualifiedName: string;
  filePath: string;
  kind: string;
  isExported: boolean | null;
}

export interface CallResolutionContext {
  relationship: RelationshipInfo;
  symbolMap: Map<string, number>;
  allSymbols: SymbolData[];
  fromName: string;
  targetName: string;
  callerParts: string[];
  callerNamespace?: string;
  callerClass?: string;
}

export interface CallResolutionResult {
  symbolId: number;
  strategy: string;
  confidence: number;
  reason: string;
}

export abstract class CallResolutionStrategy {
  protected logger = createLogger(this.constructor.name);

  abstract getStrategyName(): string;
  abstract getPriority(): number;
  abstract canResolve(context: CallResolutionContext): boolean;
  abstract resolve(context: CallResolutionContext): CallResolutionResult | null;

  protected findSymbolById(symbolId: number, allSymbols: SymbolData[]): SymbolData | undefined {
    return allSymbols.find(s => s.id === symbolId);
  }

  protected isCallableSymbol(symbol: SymbolData): boolean {
    return symbol.kind === "function" || symbol.kind === "method";
  }

  protected debug(message: string, context?: any): void {
    this.logger.debug(`[${this.getStrategyName()}] ${message}`, context);
  }
}

/**
 * Strategy 1: Exact qualified name match (highest priority)
 */
export class ExactQualifiedNameStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "ExactQualifiedName";
  }

  getPriority(): number {
    return 100;
  }

  canResolve(context: CallResolutionContext): boolean {
    return context.symbolMap.has(context.targetName);
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    const symbolId = context.symbolMap.get(context.targetName);
    if (!symbolId) return null;

    const symbol = this.findSymbolById(symbolId, context.allSymbols);
    if (!symbol || !this.isCallableSymbol(symbol)) return null;

    this.debug(`Exact match found: ${context.targetName}`);
    return {
      symbolId,
      strategy: this.getStrategyName(),
      confidence: 1.0,
      reason: `Exact qualified name match: ${context.targetName}`,
    };
  }
}

/**
 * Strategy 2: Same class method call
 */
export class SameClassMethodStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "SameClassMethod";
  }

  getPriority(): number {
    return 90;
  }

  canResolve(context: CallResolutionContext): boolean {
    return !!(context.callerClass && !context.targetName.includes("::"));
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    if (!context.callerClass || context.targetName.includes("::")) return null;

    const sameClassMethod = `${context.callerNamespace}::${context.targetName}`;
    const symbolId = context.symbolMap.get(sameClassMethod);
    if (!symbolId) return null;

    const symbol = this.findSymbolById(symbolId, context.allSymbols);
    if (!symbol || symbol.kind !== "method") return null;

    this.debug(`Same class method found: ${sameClassMethod}`);
    return {
      symbolId,
      strategy: this.getStrategyName(),
      confidence: 0.9,
      reason: `Same class method call: ${sameClassMethod}`,
    };
  }
}

/**
 * Strategy 3: Same namespace function call
 */
export class SameNamespaceFunctionStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "SameNamespaceFunction";
  }

  getPriority(): number {
    return 80;
  }

  canResolve(context: CallResolutionContext): boolean {
    return !!(context.callerNamespace && !context.targetName.includes("::"));
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    if (!context.callerNamespace || context.targetName.includes("::")) return null;

    const sameNamespaceFunc = `${context.callerNamespace}::${context.targetName}`;
    const symbolId = context.symbolMap.get(sameNamespaceFunc);
    if (!symbolId) return null;

    const symbol = this.findSymbolById(symbolId, context.allSymbols);
    if (!symbol || !this.isCallableSymbol(symbol)) return null;

    this.debug(`Same namespace function found: ${sameNamespaceFunc}`);
    return {
      symbolId,
      strategy: this.getStrategyName(),
      confidence: 0.8,
      reason: `Same namespace function call: ${sameNamespaceFunc}`,
    };
  }
}

/**
 * Strategy 4: Standard library and common functions
 */
export class StandardLibraryStrategy extends CallResolutionStrategy {
  private readonly standardLibPatterns = [
    /^std::/,
    /^(printf|malloc|free|exit|strlen|strcpy|strcmp)$/,
  ];

  getStrategyName(): string {
    return "StandardLibrary";
  }

  getPriority(): number {
    return 70;
  }

  canResolve(context: CallResolutionContext): boolean {
    return this.standardLibPatterns.some(pattern => pattern.test(context.targetName));
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    if (!this.canResolve(context)) return null;

    // Look for exact match in symbol map
    for (const [key, id] of context.symbolMap.entries()) {
      if (key === context.targetName) {
        this.debug(`Standard library function found: ${context.targetName}`);
        return {
          symbolId: id,
          strategy: this.getStrategyName(),
          confidence: 0.7,
          reason: `Standard library function: ${context.targetName}`,
        };
      }
    }

    return null;
  }
}

/**
 * Strategy 5: Global function search with scoring
 */
export class GlobalFunctionSearchStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "GlobalFunctionSearch";
  }

  getPriority(): number {
    return 60;
  }

  canResolve(_context: CallResolutionContext): boolean {
    return true; // Can always attempt global search
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    const candidates: Array<{
      id: number;
      symbol: SymbolData;
      score: number;
    }> = [];

    for (const [key, id] of context.symbolMap.entries()) {
      const symbol = this.findSymbolById(id, context.allSymbols);
      if (!symbol || !this.isCallableSymbol(symbol)) continue;

      const score = this.calculateScore(key, symbol, context);
      if (score > 0) {
        candidates.push({ id, symbol, score });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score and return best match
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    this.debug(`Best global match found: ${best.symbol.qualifiedName} (score: ${best.score})`);
    return {
      symbolId: best.id,
      strategy: this.getStrategyName(),
      confidence: Math.min(best.score / 100, 0.6), // Cap confidence for global search
      reason: `Global function search match: ${best.symbol.qualifiedName} (score: ${best.score})`,
    };
  }

  private calculateScore(key: string, symbol: SymbolData, context: CallResolutionContext): number {
    let score = 0;
    const { targetName } = context;

    // Exact name match at end of qualified name
    if (key.endsWith(`::${targetName}`) || key === targetName) {
      score += 100;

      // Prefer exported functions for cross-file calls
      if (symbol.isExported === true) {
        score += 30;
      }

      // Prefer functions over methods for unqualified calls
      if (symbol.kind === "function" && !targetName.includes("::")) {
        score += 20;
      }

      // Prefer methods over functions for qualified calls
      if (symbol.kind === "method" && targetName.includes("::")) {
        score += 20;
      }
    }

    return score;
  }
}

/**
 * Strategy 6: Constructor pattern matching
 */
export class ConstructorPatternStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "ConstructorPattern";
  }

  getPriority(): number {
    return 85;
  }

  canResolve(context: CallResolutionContext): boolean {
    return !!(context.callerClass && context.targetName === context.callerClass);
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    if (!this.canResolve(context)) return null;

    const constructor = `${context.callerNamespace}::${context.targetName}`;
    const symbolId = context.symbolMap.get(constructor);
    if (!symbolId) return null;

    this.debug(`Constructor pattern matched: ${constructor}`);
    return {
      symbolId,
      strategy: this.getStrategyName(),
      confidence: 0.85,
      reason: `Constructor pattern: ${constructor}`,
    };
  }
}

/**
 * Strategy 7: Implicit this method calls
 */
export class ImplicitThisMethodStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "ImplicitThisMethod";
  }

  getPriority(): number {
    return 75;
  }

  canResolve(context: CallResolutionContext): boolean {
    return !!(context.callerClass && !context.targetName.includes("::"));
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    if (!this.canResolve(context)) return null;

    const implicitThis = `${context.callerNamespace}::${context.targetName}`;
    const symbolId = context.symbolMap.get(implicitThis);
    if (!symbolId) return null;

    const symbol = this.findSymbolById(symbolId, context.allSymbols);
    if (!symbol || symbol.kind !== "method") return null;

    this.debug(`Implicit this method found: ${implicitThis}`);
    return {
      symbolId,
      strategy: this.getStrategyName(),
      confidence: 0.75,
      reason: `Implicit this method call: ${implicitThis}`,
    };
  }
}

/**
 * Cross-language service resolution strategy
 */
export class CrossLanguageServiceStrategy extends CallResolutionStrategy {
  getStrategyName(): string {
    return "CrossLanguageService";
  }

  getPriority(): number {
    return 50;
  }

  canResolve(context: CallResolutionContext): boolean {
    return context.relationship.crossLanguage === true;
  }

  resolve(context: CallResolutionContext): CallResolutionResult | null {
    if (!this.canResolve(context)) return null;

    const { targetName } = context;
    
    // Handle gRPC patterns like "Cart" -> "CartService"
    const serviceVariants = this.generateServiceVariants(targetName);
    
    for (const variant of serviceVariants) {
      const result = this.findServiceImplementation(variant, context);
      if (result) return result;
    }

    // Handle environment variable patterns
    const envResult = this.handleEnvironmentVariablePatterns(targetName, context);
    if (envResult) return envResult;

    // Look for stub patterns
    const stubResult = this.findStubPatterns(targetName, context);
    if (stubResult) return stubResult;

    // Try metadata
    const metadataResult = this.tryMetadataLookup(context);
    if (metadataResult) return metadataResult;

    return null;
  }

  private generateServiceVariants(serviceName: string): string[] {
    if (serviceName.endsWith("Service") || serviceName.endsWith("Stub") || serviceName.endsWith("Client")) {
      return [serviceName];
    }

    return [
      `${serviceName}Service`,
      `${serviceName}ServiceImpl`,
      `${serviceName}ServiceServicer`, // Python gRPC
      `${serviceName}ServiceBase`, // C# gRPC
    ];
  }

  private findServiceImplementation(variant: string, context: CallResolutionContext): CallResolutionResult | null {
    for (const [_key, id] of context.symbolMap.entries()) {
      const symbol = this.findSymbolById(id, context.allSymbols);
      if (!symbol) continue;

      if ((symbol.kind === "class" || symbol.kind === "interface") &&
          (symbol.name === variant || symbol.qualifiedName.endsWith(variant))) {
        this.debug(`Service implementation found: ${symbol.qualifiedName}`);
        return {
          symbolId: id,
          strategy: this.getStrategyName(),
          confidence: 0.8,
          reason: `Cross-language service implementation: ${symbol.qualifiedName}`,
        };
      }
    }
    return null;
  }

  private handleEnvironmentVariablePatterns(targetName: string, context: CallResolutionContext): CallResolutionResult | null {
    if (!targetName.toLowerCase().includes("service")) return null;

    const normalizedTarget = targetName.toLowerCase().replace(/[-_]/g, "");

    for (const [_key, id] of context.symbolMap.entries()) {
      const symbol = this.findSymbolById(id, context.allSymbols);
      if (!symbol) continue;

      const normalizedSymbol = symbol.name.toLowerCase().replace(/[-_]/g, "");

      if ((symbol.kind === "class" || symbol.kind === "interface") &&
          normalizedSymbol.includes(normalizedTarget.replace("service", ""))) {
        this.debug(`Service found by fuzzy match: ${symbol.qualifiedName}`);
        return {
          symbolId: id,
          strategy: this.getStrategyName(),
          confidence: 0.6,
          reason: `Cross-language service fuzzy match: ${symbol.qualifiedName}`,
        };
      }
    }
    return null;
  }

  private findStubPatterns(targetName: string, context: CallResolutionContext): CallResolutionResult | null {
    const stubPatterns = [
      `${targetName}Stub`,
      `${targetName}Client`,
      `${targetName}ServiceStub`,
      `${targetName}ServiceClient`,
    ];

    for (const pattern of stubPatterns) {
      const symbolId = context.symbolMap.get(pattern);
      if (symbolId) {
        const symbol = this.findSymbolById(symbolId, context.allSymbols);
        if (symbol) {
          this.debug(`Stub/client found: ${symbol.qualifiedName}`);
          return {
            symbolId,
            strategy: this.getStrategyName(),
            confidence: 0.7,
            reason: `Cross-language stub/client: ${symbol.qualifiedName}`,
          };
        }
      }
    }
    return null;
  }

  private tryMetadataLookup(context: CallResolutionContext): CallResolutionResult | null {
    const metadata = context.relationship.metadata || {};
    if (!metadata.targetService) return null;

    const symbolId = context.symbolMap.get(metadata.targetService);
    if (symbolId) {
      this.debug(`Service found via metadata: ${metadata.targetService}`);
      return {
        symbolId,
        strategy: this.getStrategyName(),
        confidence: 0.9,
        reason: `Cross-language service via metadata: ${metadata.targetService}`,
      };
    }
    return null;
  }
}

/**
 * Main call resolution orchestrator
 */
export class CallResolutionOrchestrator {
  private strategies: CallResolutionStrategy[] = [];
  private logger = createLogger("CallResolutionOrchestrator");

  constructor() {
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    this.strategies = [
      new ExactQualifiedNameStrategy(),
      new SameClassMethodStrategy(),
      new ConstructorPatternStrategy(),
      new SameNamespaceFunctionStrategy(),
      new ImplicitThisMethodStrategy(),
      new StandardLibraryStrategy(),
      new GlobalFunctionSearchStrategy(),
      new CrossLanguageServiceStrategy(),
    ];

    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority());

    this.logger.debug(`Initialized ${this.strategies.length} call resolution strategies`);
  }

  /**
   * Resolve a call target using the strategy chain
   */
  resolveCallTarget(
    relationship: RelationshipInfo,
    symbolMap: Map<string, number>,
    allSymbols: SymbolData[]
  ): CallResolutionResult | null {
    const context = this.buildContext(relationship, symbolMap, allSymbols);
    
    this.logger.debug(`Resolving call: ${context.fromName} -> ${context.targetName}`);

    for (const strategy of this.strategies) {
      if (strategy.canResolve(context)) {
        const result = strategy.resolve(context);
        if (result) {
          this.logger.debug(`Resolved by ${strategy.getStrategyName()}`, {
            from: context.fromName,
            to: context.targetName,
            confidence: result.confidence,
            reason: result.reason,
          });
          return result;
        }
      }
    }

    this.logger.debug(`Could not resolve call: ${context.fromName} -> ${context.targetName}`);
    return null;
  }

  private buildContext(
    relationship: RelationshipInfo,
    symbolMap: Map<string, number>,
    allSymbols: SymbolData[]
  ): CallResolutionContext {
    const fromName = relationship.fromName;
    const targetName = relationship.toName;
    const callerParts = fromName.split("::");
    const callerNamespace = callerParts.length > 1 ? callerParts.slice(0, -1).join("::") : undefined;
    const callerClass = callerParts.length > 1 ? callerParts[callerParts.length - 2] : undefined;

    return {
      relationship,
      symbolMap,
      allSymbols,
      fromName,
      targetName,
      callerParts,
      callerNamespace,
      callerClass,
    };
  }

  /**
   * Add a custom strategy
   */
  addStrategy(strategy: CallResolutionStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => b.getPriority() - a.getPriority());
    this.logger.debug(`Added custom strategy: ${strategy.getStrategyName()}`);
  }

  /**
   * Get all available strategies
   */
  getStrategies(): readonly CallResolutionStrategy[] {
    return this.strategies;
  }
}

/**
 * Factory function to create call resolution orchestrator
 */
export function createCallResolutionOrchestrator(): CallResolutionOrchestrator {
  return new CallResolutionOrchestrator();
}