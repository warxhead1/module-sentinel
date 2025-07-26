/**
 * Database compatibility utilities
 * Ensures raw database access when needed
 * 
 * IMPORTANT: This file is an APPROVED EXCEPTION for using db.prepare
 * Reason: This is a low-level utility that checks for database compatibility
 * and does not execute any actual SQL queries. It only checks if the prepare
 * method exists for type checking purposes.
 * 
 * DO NOT use db.prepare in regular application code! Use DrizzleDatabase instead.
 */

import { Database } from "better-sqlite3";

/**
 * Extract the raw database instance from a Drizzle or other wrapped database
 */
export function getRawDatabase(db: any): Database {
  // If it's already a raw better-sqlite3 Database, return as-is
  if (db && typeof db.prepare === 'function' && typeof db.close === 'function') {
    return db as Database;
  }
  
  // If it's a Drizzle instance, extract the raw database
  if (db && db.session && db.session.db) {
    return db.session.db as Database;
  }
  
  // Try other common patterns
  if (db && db._db) {
    return db._db as Database;
  }
  
  if (db && db.db) {
    return db.db as Database;
  }
  
  // If all else fails, throw a descriptive error
  throw new Error(`Cannot extract raw database from object: ${typeof db}. Expected better-sqlite3 Database instance with prepare() method.`);
}

/**
 * Ensure a database instance has the prepare method
 */
export function ensureDatabasePrepare(db: any): Database {
  if (!db) {
    throw new Error('Database instance is null or undefined');
  }
  
  if (typeof db.prepare !== 'function') {
    return getRawDatabase(db);
  }
  
  return db as Database;
}