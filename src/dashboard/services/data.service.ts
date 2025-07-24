/**
 * Shared data service for dashboard components
 * Provides centralized data fetching and caching to avoid DRY violations
 */
export class DataService {
  private static instance: DataService;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheDuration = 30000; // 30 seconds cache
  private listeners: Map<string, Set<Function>> = new Map();
  private activeRequests: Map<string, AbortController> = new Map();

  private constructor() {}

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  /**
   * Fetch data from API with caching
   */
  async fetch<T = any>(endpoint: string, forceRefresh = false): Promise<T> {
    const cacheKey = endpoint;
    const cached = this.cache.get(cacheKey);
    
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    // Cancel any existing request for this endpoint
    const existingController = this.activeRequests.get(cacheKey);
    if (existingController) {
      existingController.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    this.activeRequests.set(cacheKey, controller);

    try {
      const response = await fetch(endpoint, { 
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON response, got: ${contentType}. Response: ${text.slice(0, 200)}`);
      }
      
      const result = await response.json();
      
      // Handle API response format
      let data: T;
      if (result.success && result.data !== undefined) {
        data = result.data;
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        // Fallback for legacy endpoints
        data = result;
      }
      
      // Cache the data
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      
      // Clean up the controller
      this.activeRequests.delete(cacheKey);
      
      // Notify listeners
      this.notifyListeners(endpoint, data);
      
      return data;
    } catch (error) {
      // Clean up the controller
      this.activeRequests.delete(cacheKey);
      
      // Don't log aborted requests as errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw error; // Re-throw but don't log
      }
      
      console.error(`Failed to fetch ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Get projects with caching
   */
  async getProjects(forceRefresh = false): Promise<any[]> {
    return this.fetch('/api/projects', forceRefresh);
  }

  /**
   * Get languages with caching
   */
  async getLanguages(forceRefresh = false): Promise<any[]> {
    return this.fetch('/api/languages', forceRefresh);
  }

  /**
   * Get stats with caching
   */
  async getStats(forceRefresh = false): Promise<any> {
    return this.fetch('/api/stats', forceRefresh);
  }

  /**
   * Get namespaces with optional filtering
   */
  async getNamespaces(params?: { projectIds?: number[]; languageId?: number }, forceRefresh = false): Promise<any[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.projectIds?.length) {
      queryParams.set('project_ids', params.projectIds.join(','));
    }
    
    if (params?.languageId) {
      queryParams.set('language_id', params.languageId.toString());
    }
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.fetch(`/api/namespaces${queryString}`, forceRefresh);
  }

  /**
   * Get modules
   */
  async getModules(forceRefresh = false): Promise<any[]> {
    return this.fetch('/api/modules', forceRefresh);
  }

  /**
   * Get overall code relationships graph data
   */
  async getRelationships(forceRefresh = false): Promise<any> {
    return this.fetch('/api/relationships', forceRefresh);
  }

  /**
   * Subscribe to data changes
   */
  subscribe(endpoint: string, callback: Function): () => void {
    if (!this.listeners.has(endpoint)) {
      this.listeners.set(endpoint, new Set());
    }
    
    this.listeners.get(endpoint)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(endpoint);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Notify listeners when data changes
   */
  private notifyListeners(endpoint: string, data: any): void {
    const listeners = this.listeners.get(endpoint);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in data listener:', error);
        }
      });
    }
  }

  /**
   * Clear cache for specific endpoint or all
   */
  clearCache(endpoint?: string): void {
    if (endpoint) {
      this.cache.delete(endpoint);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Refresh all cached data
   */
  async refreshAll(): Promise<void> {
    const endpoints = Array.from(this.cache.keys());
    await Promise.all(endpoints.map(endpoint => this.fetch(endpoint, true)));
  }
}

// Export singleton instance
export const dataService = DataService.getInstance();