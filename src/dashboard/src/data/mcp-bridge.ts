/**
 * MCP Bridge - Real-time data connection to Module Sentinel server
 */

import type { Symbol, UniversalRelationship, PatternDetectionResult } from '../types/rust-bindings.js';

export interface MCPEventHandlers {
  onSymbolsUpdate?: (symbols: Symbol[]) => void;
  onRelationsUpdate?: (relations: UniversalRelationship[]) => void;
  onPatternsUpdate?: (patterns: PatternDetectionResult[]) => void;
  onError?: (error: Error) => void;
}

export class MCPBridge {
  private sseConnection: EventSource | null = null;
  private apiBaseUrl: string;
  private handlers: MCPEventHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  constructor(apiBaseUrl = 'http://localhost:6969/api') {
    this.apiBaseUrl = apiBaseUrl;
  }
  
  async connect(): Promise<void> {
    // Establish SSE connection for real-time updates
    this.sseConnection = new EventSource(`${this.apiBaseUrl}/sse`);
    
    this.sseConnection.onopen = () => {
      console.info('SSE connection established');
      this.reconnectAttempts = 0;
    };
    
    this.sseConnection.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.handleConnectionError();
    };
    
    // Handle different event types
    this.sseConnection.addEventListener('symbols', (event) => {
      const symbols = JSON.parse(event.data) as Symbol[];
      this.handlers.onSymbolsUpdate?.(symbols);
    });
    
    this.sseConnection.addEventListener('relationshipChange', (event) => {
      const data = JSON.parse(event.data);
      // Extract relationships from the FlowUpdate structure
      const relations = data.relationships || [];
      this.handlers.onRelationsUpdate?.(relations);
    });
    
    this.sseConnection.addEventListener('patterns', (event) => {
      const patterns = JSON.parse(event.data) as PatternDetectionResult[];
      this.handlers.onPatternsUpdate?.(patterns);
    });
    
    // Verify connection
    await this.ping();
  }
  
  private async ping(): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/health`);
    if (!response.ok) {
      throw new Error(`MCP server not responding: ${response.status}`);
    }
  }
  
  private handleConnectionError(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.info(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      
      setTimeout(() => {
        this.disconnect();
        this.connect();
      }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000));
    } else {
      this.handlers.onError?.(new Error('Max reconnection attempts reached'));
    }
  }
  
  on<K extends keyof MCPEventHandlers>(event: K, handler: MCPEventHandlers[K]): void {
    this.handlers[event] = handler;
  }
  
  async searchSymbols(query: string, options?: any): Promise<Symbol[]> {
    const params = new URLSearchParams({ q: query, ...options });
    const response = await fetch(`${this.apiBaseUrl}/symbols/search?${params}`);
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const result = await response.json();
    // Handle the wrapped response format
    if (result.success && result.data && result.data.symbols) {
      return result.data.symbols;
    }
    return result;
  }
  
  async getSymbolRelations(symbolId: string): Promise<UniversalRelationship[]> {
    const response = await fetch(`${this.apiBaseUrl}/symbols/${symbolId}/relations`);
    
    if (!response.ok) {
      throw new Error(`Failed to get relations: ${response.status}`);
    }
    
    return response.json();
  }
  
  async getAllRelationships(): Promise<UniversalRelationship[]> {
    const response = await fetch(`${this.apiBaseUrl}/symbols/relationships`);
    
    if (!response.ok) {
      throw new Error(`Failed to get all relationships: ${response.status}`);
    }
    
    const result = await response.json();
    // Handle the wrapped response format
    if (result.success && result.data && result.data.relationships) {
      return result.data.relationships;
    }
    return result.relationships || result;
  }
  
  async analyzePatterns(symbolIds: string[]): Promise<PatternDetectionResult[]> {
    const response = await fetch(`${this.apiBaseUrl}/patterns/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbolIds })
    });
    
    if (!response.ok) {
      throw new Error(`Pattern analysis failed: ${response.status}`);
    }
    
    return response.json();
  }
  
  disconnect(): void {
    if (this.sseConnection) {
      this.sseConnection.close();
      this.sseConnection = null;
    }
  }
}