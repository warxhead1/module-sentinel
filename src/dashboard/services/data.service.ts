import { Language, Project, ProjectStats, Namespace, Module, Relationship } from '../../shared/types/api.js';

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
  private pendingRequests: Map<string, Promise<any>> = new Map(); // Request deduplication
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second initial delay

  private constructor() {}

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  /**
   * Fetch data from API with caching, deduplication, and retry logic
   */
  async fetch<T = any>(endpoint: string, forceRefresh = false): Promise<T> {
    const cacheKey = endpoint;
    const cached = this.cache.get(cacheKey);
    
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }

    // Check if there's already a pending request for this endpoint
    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest && !forceRefresh) {
      console.debug(`Deduplicating request for ${endpoint}`);
      return pendingRequest;
    }

    // Create the actual request with retry logic
    const requestPromise = this.executeRequestWithRetry<T>(endpoint, cacheKey, cached);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Execute request with exponential backoff retry logic
   */
  private async executeRequestWithRetry<T>(endpoint: string, cacheKey: string, cached?: {data: any, timestamp: number}): Promise<T> {
    const currentAttempt = this.retryAttempts.get(cacheKey) || 0;
    
    // Create new AbortController for this request
    const controller = new AbortController();
    this.activeRequests.set(cacheKey, controller);

    try {
      // Create timeout signal that will abort after 10 seconds
      const timeoutSignal = AbortSignal.timeout(10000);
      
      // Combine controller signal with timeout signal
      const combinedSignal = AbortSignal.any ? 
        AbortSignal.any([controller.signal, timeoutSignal]) : 
        controller.signal; // Fallback for older Node versions
      
      const response = await fetch(endpoint, { 
        signal: combinedSignal,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
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
      
      // Reset retry attempts on success
      this.retryAttempts.delete(cacheKey);
      
      // Clean up the controller
      this.activeRequests.delete(cacheKey);
      
      // Notify listeners
      this.notifyListeners(endpoint, data);
      
      return data;
      
    } catch (error) {
      // Clean up the controller
      this.activeRequests.delete(cacheKey);
      
      // Handle aborted requests gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        // Return cached data if available for aborted requests
        if (cached) {
          console.debug(`Request aborted, returning cached data for ${endpoint}`);
          return cached.data;
        }
        // If no cached data, re-throw the abort error
        throw error;
      }

      // Implement retry logic for network errors
      if (currentAttempt < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.retryDelay * Math.pow(2, currentAttempt); // Exponential backoff
        console.warn(`Request failed for ${endpoint}, retrying in ${delay}ms (attempt ${currentAttempt + 1}/${this.maxRetries}):`, error);
        
        this.retryAttempts.set(cacheKey, currentAttempt + 1);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeRequestWithRetry<T>(endpoint, cacheKey, cached);
      }
      
      // Reset retry attempts after max retries
      this.retryAttempts.delete(cacheKey);
      
      // Return cached data as fallback if available
      if (cached) {
        console.warn(`All retries failed for ${endpoint}, returning cached data:`, error);
        return cached.data;
      }
      
      console.error(`Failed to fetch ${endpoint} after ${currentAttempt + 1} attempts:`, error);
      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true; // Network error
    }
    if (error instanceof Error && error.message.includes('timeout')) {
      return true; // Timeout error
    }
    if (error instanceof Error && error.message.match(/50[0-9]/)) {
      return true; // 5xx server errors
    }
    return false;
  }

  /**
   * Get projects with caching
   */
  async getProjects(forceRefresh = false): Promise<Project[]> {
    return this.fetch('/api/projects', forceRefresh);
  }

  /**
   * Get languages with caching
   */
  async getLanguages(forceRefresh = false): Promise<Language[]> {
    return this.fetch('/api/languages', forceRefresh);
  }

  /**
   * Get stats with caching
   */
  async getStats(forceRefresh = false): Promise<ProjectStats> {
    return this.fetch('/api/stats', forceRefresh);
  }

  /**
   * Get namespaces with optional filtering
   */
  async getNamespaces(params?: { projectIds?: number[]; languageId?: number }, forceRefresh = false): Promise<Namespace[]> {
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
  async getModules(forceRefresh = false): Promise<Module[]> {
    return this.fetch('/api/modules', forceRefresh);
  }

  /**
   * Get overall code relationships graph data
   */
  async getRelationships(forceRefresh = false): Promise<Relationship[]> {
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
      this.retryAttempts.delete(endpoint);
    } else {
      this.cache.clear();
      this.retryAttempts.clear();
    }
  }

  /**
   * Refresh all cached data
   */
  async refreshAll(): Promise<void> {
    const endpoints = Array.from(this.cache.keys());
    await Promise.all(endpoints.map(endpoint => this.fetch(endpoint, true)));
  }

  /**
   * Health check for API connectivity
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    details: string;
  }> {
    const startTime = Date.now();
    let healthTimeout: NodeJS.Timeout | undefined;
    
    try {
      // Create timeout controller for health check
      const healthController = new AbortController();
      healthTimeout = setTimeout(() => healthController.abort(), 5000); // 5 second timeout
      
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: healthController.signal
      });
      
      clearTimeout(healthTimeout);
      
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        return {
          status: latency < 500 ? 'healthy' : 'degraded',
          latency,
          details: `API responding in ${latency}ms`
        };
      } else {
        return {
          status: 'unhealthy',
          latency,
          details: `API returned ${response.status}: ${response.statusText}`
        };
      }
    } catch (error) {
      if (healthTimeout) clearTimeout(healthTimeout); // Prevent memory leak
      const latency = Date.now() - startTime;
      return {
        status: 'unhealthy',
        latency,
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get service statistics for monitoring
   */
  getStatistics(): {
    cacheSize: number;
    activeRequests: number;
    pendingRequests: number;
    retryAttempts: number;
    hitRate: number;
  } {
    // Calculate cache hit rate (simplified)
    const totalRequests = this.cache.size + this.retryAttempts.size;
    const hitRate = totalRequests > 0 ? (this.cache.size / totalRequests) * 100 : 0;
    
    return {
      cacheSize: this.cache.size,
      activeRequests: this.activeRequests.size,
      pendingRequests: this.pendingRequests.size,
      retryAttempts: this.retryAttempts.size,
      hitRate: Math.round(hitRate)
    };
  }
}

// Export singleton instance
export const dataService = DataService.getInstance();