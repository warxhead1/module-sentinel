/**
 * API Service for Module Sentinel Dashboard
 * Centralized API communication with error handling and caching
 */
import type { ApiResponse, Symbol, ModuleFile, Relationship, GraphNode, GraphEdge } from '../../shared/types/api';

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class ApiService {
  private baseUrl: string;
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown API error'
      };
    }
  }

  /**
   * Cached fetch with TTL
   */
  private async cachedFetch<T>(
    endpoint: string, 
    ttl: number = 5 * 60 * 1000, // 5 minutes default
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const cacheKey = `${endpoint}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return { success: true, data: cached.data };
    }

    const result = await this.fetch<T>(endpoint, options);
    
    if (result.success && result.data) {
      this.cache.set(cacheKey, {
        data: result.data,
        timestamp: Date.now(),
        ttl
      });
    }

    return result;
  }

  /**
   * Clear cache for specific endpoint or all
   */
  clearCache(pattern?: string) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // ============================================================================
  // API ENDPOINTS
  // ============================================================================

  /**
   * Health check
   */
  async checkHealth() {
    return this.fetch<{ status: string; timestamp: string }>('/health');
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return this.cachedFetch<{
      symbolCount: number;
      namespaceCount: number;
      kindBreakdown: Record<string, number>;
      languageBreakdown: Record<string, number>;
    }>('/stats', 2 * 60 * 1000); // Cache for 2 minutes
  }

  /**
   * Get all modules organized by namespace
   */
  async getModules() {
    return this.cachedFetch<ModuleFile[]>('/modules', 5 * 60 * 1000); // Cache for 5 minutes
  }

  /**
   * Get details for a specific module
   */
  async getModuleDetails(namespace: string, moduleName: string) {
    const encodedNamespace = encodeURIComponent(namespace);
    const encodedModule = encodeURIComponent(moduleName);
    return this.fetch<Symbol[]>(`/modules/${encodedNamespace}/${encodedModule}`);
  }

  /**
   * Search symbols
   */
  async searchSymbols(query: string, options: {
    kind?: string;
    namespace?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const params = new URLSearchParams({
      q: query,
      ...options.kind && { kind: options.kind },
      ...options.namespace && { namespace: options.namespace },
      ...options.limit && { limit: options.limit.toString() },
      ...options.offset && { offset: options.offset.toString() },
    });

    return this.fetch<Symbol[]>(`/symbols?${params}`);
  }

  /**
   * Get symbol relationships
   */
  async getSymbolRelationships(symbolId: number, direction: 'incoming' | 'outgoing' | 'both' = 'both') {
    const params = new URLSearchParams({ direction });
    return this.fetch<Relationship[]>(`/symbols/${symbolId}/relationships?${params}`);
  }

  /**
   * Get overall code relationships graph data
   */
  async getRelationships() {
    return this.cachedFetch<GraphData>('/relationships', 5 * 60 * 1000); // Cache for 5 minutes
  }

  /**
   * Get all namespaces
   */
  async getNamespaces() {
    return this.cachedFetch<Array<{
      namespace: string;
      symbol_count: number;
      kind_count: number;
      kinds: string;
    }>>('/namespaces', 10 * 60 * 1000); // Cache for 10 minutes
  }

  /**
   * Get symbols for a specific namespace
   */
  async getNamespaceSymbols(namespace: string, limit = 100) {
    const encodedNamespace = encodeURIComponent(namespace);
    const params = new URLSearchParams({ limit: limit.toString() });
    return this.fetch<Symbol[]>(`/namespaces/${encodedNamespace}/symbols?${params}`);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      totalMemory: JSON.stringify(Array.from(this.cache.values())).length
    };
  }

  /**
   * Preload common data
   */
  async preloadData() {
    console.log('🔄 Preloading dashboard data...');
    
    const promises = [
      this.getStats(),
      this.getNamespaces(),
      this.getModules()
    ];

    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Preloaded ${successful}/${promises.length} datasets`);
    
    return results;
  }
}