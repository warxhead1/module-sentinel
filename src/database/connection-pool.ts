/**
 * Database Connection Pool
 * 
 * Manages concurrent database access with connection pooling and
 * proper transaction isolation to prevent race conditions.
 */

import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export interface ConnectionPoolOptions {
  maxConnections?: number;
  connectionTimeout?: number;
  retryDelay?: number;
}

export interface ConnectionWrapper {
  db: Database.Database;
  drizzleDb: BetterSQLite3Database;
  isInUse: boolean;
  lastUsed: number;
}

export class DatabaseConnectionPool {
  private connections: ConnectionWrapper[] = [];
  private maxConnections: number;
  private connectionTimeout: number;
  private retryDelay: number;
  private dbPath: string;
  private mutex = Promise.resolve() as Promise<any>;

  constructor(dbPath: string, options: ConnectionPoolOptions = {}) {
    this.dbPath = dbPath;
    this.maxConnections = options.maxConnections || 10;
    this.connectionTimeout = options.connectionTimeout || 30000;
    this.retryDelay = options.retryDelay || 100;
  }

  /**
   * Get a connection from the pool with mutex protection
   */
  async getConnection(): Promise<ConnectionWrapper> {
    return (this.mutex = this.mutex.then(async () => {
      // Try to find an available connection
      const available = this.connections.find(conn => !conn.isInUse);
      if (available) {
        available.isInUse = true;
        available.lastUsed = Date.now();
        return available;
      }

      // Create new connection if under limit
      if (this.connections.length < this.maxConnections) {
        const newConnection = this.createConnection();
        this.connections.push(newConnection);
        return newConnection;
      }

      // Wait for a connection to become available
      return this.waitForConnection();
    })) as Promise<ConnectionWrapper>;
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(connection: ConnectionWrapper): void {
    connection.isInUse = false;
    connection.lastUsed = Date.now();
  }

  /**
   * Execute a function with a database connection
   */
  async withConnection<T>(
    operation: (db: Database.Database, drizzleDb: BetterSQLite3Database) => Promise<T>
  ): Promise<T> {
    const connection = await this.getConnection();
    try {
      return await operation(connection.db, connection.drizzleDb);
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Execute a function within a transaction
   */
  async withTransaction<T>(
    operation: (db: Database.Database, drizzleDb: BetterSQLite3Database) => Promise<T>
  ): Promise<T> {
    return this.withConnection(async (db, drizzleDb) => {
      // Use better-sqlite3 transaction directly for async operations
      const transaction = db.transaction((txFunc: () => T) => txFunc());
      return transaction(() => operation(db, drizzleDb) as unknown as T);
    });
  }

  /**
   * Create a new database connection
   */
  private createConnection(): ConnectionWrapper {
    const db = new Database(this.dbPath);
    
    // Set pragmas for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = memory');
    db.pragma('foreign_keys = ON');

    const drizzleDb = drizzle(db);

    return {
      db,
      drizzleDb,
      isInUse: true,
      lastUsed: Date.now()
    };
  }

  /**
   * Wait for a connection to become available
   */
  private async waitForConnection(): Promise<ConnectionWrapper> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.connectionTimeout) {
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      
      const available = this.connections.find(conn => !conn.isInUse);
      if (available) {
        available.isInUse = true;
        available.lastUsed = Date.now();
        return available;
      }
    }

    throw new Error(`Database connection timeout after ${this.connectionTimeout}ms`);
  }

  /**
   * Close all connections and cleanup
   */
  async close(): Promise<void> {
    return this.mutex = this.mutex.then(async () => {
      for (const connection of this.connections) {
        if (connection.isInUse) {
          console.warn('🔄 Closing database connection that was still in use');
        }
        connection.db.close();
      }
      this.connections = [];
    });
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.length,
      availableConnections: this.connections.filter(c => !c.isInUse).length,
      inUseConnections: this.connections.filter(c => c.isInUse).length,
      maxConnections: this.maxConnections
    };
  }
}