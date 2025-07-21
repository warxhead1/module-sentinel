/**
 * State Service for Module Sentinel Dashboard
 * Lightweight state management with reactive updates
 */

export type StateChangeListener<T = any> = (newValue: T, oldValue: T, key: string) => void;

export class StateService {
  private state = new Map<string, any>();
  private listeners = new Map<string, Set<StateChangeListener>>();
  private globalListeners = new Set<StateChangeListener>();

  /**
   * Set state value
   */
  setState<T>(key: string, value: T): void {
    const oldValue = this.state.get(key);
    this.state.set(key, value);

    // Notify specific listeners
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(listener => {
        try {
          listener(value, oldValue, key);
        } catch (error) {
          console.error(`Error in state listener for key "${key}":`, error);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener(value, oldValue, key);
      } catch (error) {
        console.error(`Error in global state listener:`, error);
      }
    });
  }

  /**
   * Get state value
   */
  getState<T>(key: string): T | undefined {
    return this.state.get(key) as T;
  }

  /**
   * Get state value with default
   */
  getStateOrDefault<T>(key: string, defaultValue: T): T {
    return this.state.has(key) ? this.state.get(key) as T : defaultValue;
  }

  /**
   * Check if state key exists
   */
  hasState(key: string): boolean {
    return this.state.has(key);
  }

  /**
   * Delete state key
   */
  deleteState(key: string): boolean {
    const had = this.state.has(key);
    if (had) {
      const oldValue = this.state.get(key);
      this.state.delete(key);
      
      // Notify listeners of deletion
      const keyListeners = this.listeners.get(key);
      if (keyListeners) {
        keyListeners.forEach(listener => {
          try {
            listener(undefined, oldValue, key);
          } catch (error) {
            console.error(`Error in state listener for deleted key "${key}":`, error);
          }
        });
      }
    }
    return had;
  }

  /**
   * Subscribe to state changes for a specific key
   */
  subscribe<T>(key: string, listener: StateChangeListener<T>): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    const keyListeners = this.listeners.get(key)!;
    keyListeners.add(listener);

    // Return unsubscribe function
    return () => {
      keyListeners.delete(listener);
      if (keyListeners.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all state changes
   */
  subscribeGlobal(listener: StateChangeListener): () => void {
    this.globalListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Update state with partial object
   */
  updateState<T extends Record<string, any>>(key: string, updates: Partial<T>): void {
    const current = this.getState<T>(key) || {} as T;
    const updated = { ...current, ...updates };
    this.setState(key, updated);
  }

  /**
   * Get all state keys
   */
  getKeys(): string[] {
    return Array.from(this.state.keys());
  }

  /**
   * Get all state as object
   */
  getAllState(): Record<string, any> {
    return Object.fromEntries(this.state);
  }

  /**
   * Clear all state
   */
  clearAllState(): void {
    const keys = this.getKeys();
    keys.forEach(key => this.deleteState(key));
  }

  /**
   * Persist state to localStorage
   */
  persistState(keys?: string[]): void {
    try {
      const stateToPersist = keys 
        ? Object.fromEntries(keys.map(key => [key, this.state.get(key)]).filter(([, value]) => value !== undefined))
        : this.getAllState();
      
      localStorage.setItem('module-sentinel-state', JSON.stringify(stateToPersist));
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Restore state from localStorage
   */
  restoreState(keys?: string[]): void {
    try {
      const stored = localStorage.getItem('module-sentinel-state');
      if (!stored) return;

      const restoredState = JSON.parse(stored);
      
      if (keys) {
        keys.forEach(key => {
          if (key in restoredState) {
            this.setState(key, restoredState[key]);
          }
        });
      } else {
        Object.entries(restoredState).forEach(([key, value]) => {
          this.setState(key, value);
        });
      }
    } catch (error) {
      console.error('Failed to restore state:', error);
    }
  }

  /**
   * Create a computed state that derives from other state values
   */
  createComputed<T>(
    key: string,
    dependencies: string[],
    compute: (...values: any[]) => T
  ): () => void {
    const updateComputed = () => {
      const values = dependencies.map(dep => this.getState(dep));
      const computed = compute(...values);
      this.setState(key, computed);
    };

    // Initial computation
    updateComputed();

    // Subscribe to dependencies
    const unsubscribers = dependencies.map(dep => 
      this.subscribe(dep, updateComputed)
    );

    // Return cleanup function
    return () => {
      unsubscribers.forEach(unsub => unsub());
      this.deleteState(key);
    };
  }

  /**
   * Get state statistics
   */
  getStats() {
    return {
      stateCount: this.state.size,
      listenerCount: Array.from(this.listeners.values()).reduce((total, set) => total + set.size, 0),
      globalListenerCount: this.globalListeners.size,
      memoryUsage: JSON.stringify(this.getAllState()).length
    };
  }
}

// Export singleton instance
export const stateService = new StateService();