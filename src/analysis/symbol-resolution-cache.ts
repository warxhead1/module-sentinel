/**
 * Symbol Resolution Cache
 * 
 * High-performance in-memory cache for symbol resolution and cross-reference lookup.
 * Optimized for fast lookups with multiple indexing strategies.
 * 
 * Key features:
 * 1. Multi-index structure for O(1) lookups by name, qualified name, and file
 * 2. Bloom filters for fast negative lookups
 * 3. LRU eviction for memory management
 * 4. Incremental updates without full rebuild
 */

import { BloomFilter } from 'bloom-filters';

export interface CachedSymbol {
  id: number;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  line: number;
  column: number;
  namespace?: string;
  signature?: string;
  returnType?: string;
  semanticTags: string[];
  parentId?: number;
  childIds: number[];
  // Cross-reference data
  callers: number[];
  callees: number[];
  inheritsFrom: number[];
  inheritedBy: number[];
  uses: number[];
  usedBy: number[];
  // Metadata
  lastAccessed: number;
  accessCount: number;
}

export interface ResolutionContext {
  currentFile: string;
  currentNamespace?: string;
  importedNamespaces: Set<string>;
  typeAliases: Map<string, string>;
}

export class SymbolResolutionCache {
  // Primary storage
  private symbolsById: Map<number, CachedSymbol> = new Map();
  
  // Multi-index structures
  private symbolsByName: Map<string, Set<number>> = new Map();
  private symbolsByQualifiedName: Map<string, number> = new Map();
  private symbolsByFile: Map<string, Set<number>> = new Map();
  private symbolsByNamespace: Map<string, Set<number>> = new Map();
  
  // Relationship indices
  private inheritanceGraph: Map<number, { parents: Set<number>; children: Set<number> }> = new Map();
  private callGraph: Map<number, { callers: Set<number>; callees: Set<number> }> = new Map();
  private usageGraph: Map<number, { uses: Set<number>; usedBy: Set<number> }> = new Map();
  
  // Bloom filters for fast negative lookups
  private nameBloomFilter: BloomFilter;
  private qualifiedNameBloomFilter: BloomFilter;
  
  // Cache statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    updates: 0
  };
  
  // Configuration
  private maxSize: number;
  private evictionBatchSize: number;
  
  constructor(maxSize: number = 100000, falsePositiveRate: number = 0.01) {
    this.maxSize = maxSize;
    this.evictionBatchSize = Math.floor(maxSize * 0.1); // Evict 10% when full
    
    // Initialize bloom filters
    this.nameBloomFilter = new BloomFilter(maxSize, 4);
    this.qualifiedNameBloomFilter = new BloomFilter(maxSize, 4);
  }
  
  /**
   * Add or update a symbol in the cache
   */
  addSymbol(symbol: CachedSymbol): void {
    const existingSymbol = this.symbolsById.get(symbol.id);
    
    if (existingSymbol) {
      // Update existing symbol
      this.removeFromIndices(existingSymbol);
      this.stats.updates++;
    }
    
    // Check if we need to evict
    if (this.symbolsById.size >= this.maxSize) {
      this.evictLRU();
    }
    
    // Add to primary storage
    symbol.lastAccessed = Date.now();
    symbol.accessCount = existingSymbol?.accessCount || 0;
    this.symbolsById.set(symbol.id, symbol);
    
    // Update indices
    this.addToIndices(symbol);
    
    // Update bloom filters
    this.nameBloomFilter.add(symbol.name);
    this.qualifiedNameBloomFilter.add(symbol.qualifiedName);
  }
  
  /**
   * Batch add symbols for better performance
   */
  addSymbolsBatch(symbols: CachedSymbol[]): void {
    // Pre-calculate evictions needed
    const spaceneeded = symbols.length - (this.maxSize - this.symbolsById.size);
    if (spaceneeded > 0) {
      this.evictLRU(spaceneeded);
    }
    
    const now = Date.now();
    for (const symbol of symbols) {
      symbol.lastAccessed = now;
      symbol.accessCount = 0;
      
      // Add to primary storage
      this.symbolsById.set(symbol.id, symbol);
      
      // Update indices
      this.addToIndices(symbol);
      
      // Update bloom filters
      this.nameBloomFilter.add(symbol.name);
      this.qualifiedNameBloomFilter.add(symbol.qualifiedName);
    }
  }
  
  /**
   * Resolve a symbol by name with context awareness
   */
  resolveSymbol(name: string, context: ResolutionContext): CachedSymbol | null {
    // Fast negative lookup
    if (!this.nameBloomFilter.has(name)) {
      this.stats.misses++;
      return null;
    }
    
    // Try qualified name first if namespace is provided
    if (context.currentNamespace) {
      const qualifiedName = `${context.currentNamespace}::${name}`;
      const symbol = this.getByQualifiedName(qualifiedName);
      if (symbol) {
        this.stats.hits++;
        return symbol;
      }
    }
    
    // Check imported namespaces
    for (const ns of context.importedNamespaces) {
      const qualifiedName = `${ns}::${name}`;
      const symbol = this.getByQualifiedName(qualifiedName);
      if (symbol) {
        this.stats.hits++;
        return symbol;
      }
    }
    
    // Check type aliases
    const aliasedName = context.typeAliases.get(name);
    if (aliasedName) {
      const symbol = this.getByQualifiedName(aliasedName);
      if (symbol) {
        this.stats.hits++;
        return symbol;
      }
    }
    
    // Fall back to unqualified name search
    const candidates = this.symbolsByName.get(name);
    if (candidates && candidates.size > 0) {
      // Prefer symbols from the same file
      for (const id of candidates) {
        const symbol = this.symbolsById.get(id);
        if (symbol && symbol.filePath === context.currentFile) {
          this.updateAccessStats(symbol);
          this.stats.hits++;
          return symbol;
        }
      }
      
      // Return the first match
      const firstId = candidates.values().next().value;
      const symbol = this.symbolsById.get(firstId!);
      if (symbol) {
        this.updateAccessStats(symbol);
        this.stats.hits++;
        return symbol;
      }
    }
    
    this.stats.misses++;
    return null;
  }
  
  /**
   * Get symbol by ID
   */
  getById(id: number): CachedSymbol | null {
    const symbol = this.symbolsById.get(id);
    if (symbol) {
      this.updateAccessStats(symbol);
      this.stats.hits++;
      return symbol;
    }
    this.stats.misses++;
    return null;
  }
  
  /**
   * Get symbol by qualified name
   */
  getByQualifiedName(qualifiedName: string): CachedSymbol | null {
    // Fast negative lookup
    if (!this.qualifiedNameBloomFilter.has(qualifiedName)) {
      this.stats.misses++;
      return null;
    }
    
    const id = this.symbolsByQualifiedName.get(qualifiedName);
    if (id !== undefined) {
      const symbol = this.symbolsById.get(id);
      if (symbol) {
        this.updateAccessStats(symbol);
        this.stats.hits++;
        return symbol;
      }
    }
    this.stats.misses++;
    return null;
  }
  
  /**
   * Get all symbols in a file
   */
  getByFile(filePath: string): CachedSymbol[] {
    const ids = this.symbolsByFile.get(filePath);
    if (!ids) return [];
    
    const symbols: CachedSymbol[] = [];
    for (const id of ids) {
      const symbol = this.symbolsById.get(id);
      if (symbol) {
        this.updateAccessStats(symbol);
        symbols.push(symbol);
      }
    }
    
    this.stats.hits += symbols.length;
    return symbols;
  }
  
  /**
   * Get all symbols in a namespace
   */
  getByNamespace(namespace: string): CachedSymbol[] {
    const ids = this.symbolsByNamespace.get(namespace);
    if (!ids) return [];
    
    const symbols: CachedSymbol[] = [];
    for (const id of ids) {
      const symbol = this.symbolsById.get(id);
      if (symbol) {
        this.updateAccessStats(symbol);
        symbols.push(symbol);
      }
    }
    
    return symbols;
  }
  
  /**
   * Get callers of a symbol
   */
  getCallers(symbolId: number): CachedSymbol[] {
    const callInfo = this.callGraph.get(symbolId);
    if (!callInfo) return [];
    
    const callers: CachedSymbol[] = [];
    for (const callerId of callInfo.callers) {
      const caller = this.symbolsById.get(callerId);
      if (caller) {
        callers.push(caller);
      }
    }
    
    return callers;
  }
  
  /**
   * Get symbols called by a symbol
   */
  getCallees(symbolId: number): CachedSymbol[] {
    const callInfo = this.callGraph.get(symbolId);
    if (!callInfo) return [];
    
    const callees: CachedSymbol[] = [];
    for (const calleeId of callInfo.callees) {
      const callee = this.symbolsById.get(calleeId);
      if (callee) {
        callees.push(callee);
      }
    }
    
    return callees;
  }
  
  /**
   * Get inheritance hierarchy
   */
  getInheritanceHierarchy(symbolId: number): {
    parents: CachedSymbol[];
    children: CachedSymbol[];
  } {
    const inheritInfo = this.inheritanceGraph.get(symbolId);
    if (!inheritInfo) return { parents: [], children: [] };
    
    const parents: CachedSymbol[] = [];
    for (const parentId of inheritInfo.parents) {
      const parent = this.symbolsById.get(parentId);
      if (parent) {
        parents.push(parent);
      }
    }
    
    const children: CachedSymbol[] = [];
    for (const childId of inheritInfo.children) {
      const child = this.symbolsById.get(childId);
      if (child) {
        children.push(child);
      }
    }
    
    return { parents, children };
  }
  
  /**
   * Add a relationship between symbols
   */
  addRelationship(fromId: number, toId: number, type: 'calls' | 'inherits' | 'uses'): void {
    switch (type) {
      case 'calls':
        this.addCallRelationship(fromId, toId);
        break;
      case 'inherits':
        this.addInheritanceRelationship(fromId, toId);
        break;
      case 'uses':
        this.addUsageRelationship(fromId, toId);
        break;
    }
  }
  
  /**
   * Clear symbols for a specific file (for incremental updates)
   */
  clearFile(filePath: string): void {
    const symbolIds = this.symbolsByFile.get(filePath);
    if (!symbolIds) return;
    
    for (const id of symbolIds) {
      const symbol = this.symbolsById.get(id);
      if (symbol) {
        this.removeFromIndices(symbol);
        this.symbolsById.delete(id);
      }
    }
    
    this.symbolsByFile.delete(filePath);
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
    updates: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    
    return {
      size: this.symbolsById.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions,
      updates: this.stats.updates
    };
  }
  
  /**
   * Clear the entire cache
   */
  clear(): void {
    this.symbolsById.clear();
    this.symbolsByName.clear();
    this.symbolsByQualifiedName.clear();
    this.symbolsByFile.clear();
    this.symbolsByNamespace.clear();
    this.inheritanceGraph.clear();
    this.callGraph.clear();
    this.usageGraph.clear();
    
    // Reinitialize bloom filters
    this.nameBloomFilter = new BloomFilter(this.maxSize, 4);
    this.qualifiedNameBloomFilter = new BloomFilter(this.maxSize, 4);
    
    // Reset stats
    this.stats = { hits: 0, misses: 0, evictions: 0, updates: 0 };
  }
  
  // Private helper methods
  
  private addToIndices(symbol: CachedSymbol): void {
    // Name index
    let nameSet = this.symbolsByName.get(symbol.name);
    if (!nameSet) {
      nameSet = new Set();
      this.symbolsByName.set(symbol.name, nameSet);
    }
    nameSet.add(symbol.id);
    
    // Qualified name index
    this.symbolsByQualifiedName.set(symbol.qualifiedName, symbol.id);
    
    // File index
    let fileSet = this.symbolsByFile.get(symbol.filePath);
    if (!fileSet) {
      fileSet = new Set();
      this.symbolsByFile.set(symbol.filePath, fileSet);
    }
    fileSet.add(symbol.id);
    
    // Namespace index
    if (symbol.namespace) {
      let nsSet = this.symbolsByNamespace.get(symbol.namespace);
      if (!nsSet) {
        nsSet = new Set();
        this.symbolsByNamespace.set(symbol.namespace, nsSet);
      }
      nsSet.add(symbol.id);
    }
  }
  
  private removeFromIndices(symbol: CachedSymbol): void {
    // Name index
    const nameSet = this.symbolsByName.get(symbol.name);
    if (nameSet) {
      nameSet.delete(symbol.id);
      if (nameSet.size === 0) {
        this.symbolsByName.delete(symbol.name);
      }
    }
    
    // Qualified name index
    this.symbolsByQualifiedName.delete(symbol.qualifiedName);
    
    // File index
    const fileSet = this.symbolsByFile.get(symbol.filePath);
    if (fileSet) {
      fileSet.delete(symbol.id);
      if (fileSet.size === 0) {
        this.symbolsByFile.delete(symbol.filePath);
      }
    }
    
    // Namespace index
    if (symbol.namespace) {
      const nsSet = this.symbolsByNamespace.get(symbol.namespace);
      if (nsSet) {
        nsSet.delete(symbol.id);
        if (nsSet.size === 0) {
          this.symbolsByNamespace.delete(symbol.namespace);
        }
      }
    }
  }
  
  private updateAccessStats(symbol: CachedSymbol): void {
    symbol.lastAccessed = Date.now();
    symbol.accessCount++;
  }
  
  private evictLRU(count: number = this.evictionBatchSize): void {
    // Sort symbols by access time and count
    const symbols = Array.from(this.symbolsById.values());
    symbols.sort((a, b) => {
      // First by access count, then by last accessed time
      if (a.accessCount !== b.accessCount) {
        return a.accessCount - b.accessCount;
      }
      return a.lastAccessed - b.lastAccessed;
    });
    
    // Evict least recently used symbols
    const toEvict = symbols.slice(0, count);
    for (const symbol of toEvict) {
      this.removeFromIndices(symbol);
      this.symbolsById.delete(symbol.id);
      this.stats.evictions++;
    }
  }
  
  private addCallRelationship(callerId: number, calleeId: number): void {
    // Update call graph
    let callerInfo = this.callGraph.get(callerId);
    if (!callerInfo) {
      callerInfo = { callers: new Set(), callees: new Set() };
      this.callGraph.set(callerId, callerInfo);
    }
    callerInfo.callees.add(calleeId);
    
    let calleeInfo = this.callGraph.get(calleeId);
    if (!calleeInfo) {
      calleeInfo = { callers: new Set(), callees: new Set() };
      this.callGraph.set(calleeId, calleeInfo);
    }
    calleeInfo.callers.add(callerId);
    
    // Update symbol objects
    const caller = this.symbolsById.get(callerId);
    const callee = this.symbolsById.get(calleeId);
    if (caller && callee) {
      caller.callees.push(calleeId);
      callee.callers.push(callerId);
    }
  }
  
  private addInheritanceRelationship(childId: number, parentId: number): void {
    // Update inheritance graph
    let childInfo = this.inheritanceGraph.get(childId);
    if (!childInfo) {
      childInfo = { parents: new Set(), children: new Set() };
      this.inheritanceGraph.set(childId, childInfo);
    }
    childInfo.parents.add(parentId);
    
    let parentInfo = this.inheritanceGraph.get(parentId);
    if (!parentInfo) {
      parentInfo = { parents: new Set(), children: new Set() };
      this.inheritanceGraph.set(parentId, parentInfo);
    }
    parentInfo.children.add(childId);
    
    // Update symbol objects
    const child = this.symbolsById.get(childId);
    const parent = this.symbolsById.get(parentId);
    if (child && parent) {
      child.inheritsFrom.push(parentId);
      parent.inheritedBy.push(childId);
    }
  }
  
  private addUsageRelationship(userId: number, usedId: number): void {
    // Update usage graph
    let userInfo = this.usageGraph.get(userId);
    if (!userInfo) {
      userInfo = { uses: new Set(), usedBy: new Set() };
      this.usageGraph.set(userId, userInfo);
    }
    userInfo.uses.add(usedId);
    
    let usedInfo = this.usageGraph.get(usedId);
    if (!usedInfo) {
      usedInfo = { uses: new Set(), usedBy: new Set() };
      this.usageGraph.set(usedId, usedInfo);
    }
    usedInfo.usedBy.add(userId);
    
    // Update symbol objects
    const user = this.symbolsById.get(userId);
    const used = this.symbolsById.get(usedId);
    if (user && used) {
      user.uses.push(usedId);
      used.usedBy.push(userId);
    }
  }
}