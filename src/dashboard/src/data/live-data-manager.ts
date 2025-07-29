/**
 * Live Data Manager - Handles data filtering, caching, and updates
 */

import type { Symbol, UniversalRelationship, PatternDetectionResult, QualityMetrics } from '../types/rust-bindings.js';
import { MCPBridge } from './mcp-bridge.js';

type DataLayer = 'symbols' | 'patterns' | 'quality';

interface FilteredData {
  symbols: Symbol[];
  relations: UniversalRelationship[];
  patterns?: PatternDetectionResult[];
  quality?: QualityMetrics;
}

interface DataCache {
  symbols: Map<string, Symbol>;
  relations: Map<string, UniversalRelationship>;
  patterns: PatternDetectionResult[];
  quality: QualityMetrics | null;
}

export class LiveDataManager extends EventTarget {
  private mcpBridge: MCPBridge;
  private cache: DataCache = {
    symbols: new Map(),
    relations: new Map(),
    patterns: [],
    quality: null
  };
  
  constructor(mcpBridge: MCPBridge) {
    super();
    this.mcpBridge = mcpBridge;
    
    // Set up MCP event handlers
    this.mcpBridge.on('onSymbolsUpdate', (symbols: Symbol[]) => {
      this.updateSymbols(symbols);
    });
    
    this.mcpBridge.on('onRelationsUpdate', (relations: UniversalRelationship[]) => {
      this.updateRelations(relations);
    });
    
    this.mcpBridge.on('onPatternsUpdate', (patterns: PatternDetectionResult[]) => {
      this.updatePatterns(patterns);
    });
  }
  
  async loadInitialData(): Promise<void> {
    try {
      // Load all symbols
      const symbols = await this.mcpBridge.searchSymbols('', { limit: 10000 });
      this.updateSymbols(symbols);
      
      // Load all relationships using the correct symbols API
      try {
        const response = await fetch(`${this.mcpBridge['apiBaseUrl']}/symbols/relationships`);
        if (response.ok) {
          const data = await response.json();
          const relations = data.success ? data.data.relationships : data.relationships || [];
          console.info('Symbols API response:', { data, relations: relations.length });
          this.updateRelations(relations);
        }
      } catch (error) {
        console.warn('Failed to load relationships via symbols API, will rely on SSE updates:', error);
      }
      
      console.info(`Loaded ${this.cache.symbols.size} symbols and ${this.cache.relations.size} relations`);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      throw error;
    }
  }
  
  private updateSymbols(symbols: Symbol[]): void {
    symbols.forEach(symbol => {
      this.cache.symbols.set(symbol.id, symbol);
    });
    
    this.dispatchEvent(new CustomEvent('symbolsUpdated', {
      detail: Array.from(this.cache.symbols.values())
    }));
  }
  
  private updateRelations(relations: UniversalRelationship[]): void {
    relations.forEach(relation => {
      const key = `${relation.fromSymbolId}-${relation.toSymbolId}`;
      this.cache.relations.set(key, relation);
    });
    
    this.dispatchEvent(new CustomEvent('relationsUpdated', {
      detail: Array.from(this.cache.relations.values())
    }));
  }
  
  private updatePatterns(patterns: PatternDetectionResult[]): void {
    this.cache.patterns = patterns;
    
    this.dispatchEvent(new CustomEvent('patternsUpdated', {
      detail: patterns
    }));
  }
  
  getFilteredData(layer: DataLayer): FilteredData {
    const symbols = Array.from(this.cache.symbols.values());
    const relations = Array.from(this.cache.relations.values());
    
    switch (layer) {
      case 'symbols':
        // Return all symbols and relations
        return { symbols, relations };
        
      case 'patterns': {
        // Filter to symbols involved in patterns
        const patternSymbolIds = new Set<string>();
        this.cache.patterns.forEach(pattern => {
          pattern.symbols.forEach((symbol: Symbol) => {
            patternSymbolIds.add(symbol.id);
          });
        });
        
        const patternSymbols = symbols.filter(s => patternSymbolIds.has(s.id));
        const patternRelations = relations.filter(r => 
          patternSymbolIds.has(r.fromSymbolId?.toString() || '') || 
          patternSymbolIds.has(r.toSymbolId?.toString() || '')
        );
        
        return {
          symbols: patternSymbols,
          relations: patternRelations,
          patterns: this.cache.patterns
        };
      }
        
      case 'quality': {
        // Filter to symbols with quality issues
        const qualitySymbols = symbols.filter(s => s.confidenceScore && s.confidenceScore < 0.8);
        
        return {
          symbols: qualitySymbols,
          relations,
          quality: this.cache.quality || undefined
        };
      }
        
      default:
        return { symbols, relations };
    }
  }
  
  getSymbolById(id: string): Symbol | undefined {
    return this.cache.symbols.get(id);
  }
  
  getRelatedSymbols(symbolId: string): Symbol[] {
    const related = new Set<string>();
    
    // Find all relations involving this symbol
    this.cache.relations.forEach(relation => {
      if (relation.fromSymbolId?.toString() === symbolId) {
        related.add(relation.toSymbolId?.toString() || '');
      } else if (relation.toSymbolId?.toString() === symbolId) {
        related.add(relation.fromSymbolId?.toString() || '');
      }
    });
    
    return Array.from(related)
      .map(id => this.cache.symbols.get(id))
      .filter((s): s is Symbol => s !== undefined);
  }
  
  on(event: string, handler: (data: any) => void): void {
    this.addEventListener(event, (e: Event) => {
      handler((e as CustomEvent).detail);
    });
  }
}