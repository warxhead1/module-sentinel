# Approved Raw SQL Exceptions

This document lists all files that are approved to use raw SQL (`db.prepare`) instead of DrizzleDatabase. Each exception is documented with a clear reason.

## IMPORTANT: DO NOT USE `db.prepare` IN NEW CODE
Always use DrizzleDatabase methods in application code. If you need a new query, add a method to DrizzleDatabase.

## Approved Exceptions

### 1. Database Infrastructure
- **`src/database/run-migrations.ts`**
  - Reason: Migration runner requires direct DDL execution (CREATE TABLE, ALTER TABLE)
  - Usage: Running SQL migration files

- **`src/utils/database-manager.ts`**
  - Reason: Low-level database abstraction providing connection management and retry logic
  - Usage: Foundation layer that DrizzleDatabase builds upon

- **`src/utils/database-compatibility.ts`**
  - Reason: Compatibility layer that only checks for method existence
  - Usage: Type checking, no actual SQL execution

### 2. Diagnostic Tools
- **`src/scripts/check-data-integrity.ts`**
  - Reason: Diagnostic utility needing arbitrary SQL for database inspection
  - Usage: Database health checks and integrity validation

### 3. Complex Aggregations
- **`src/api/services/code-flow.service.ts`**
  - Reason: Complex CASE statements and nested subqueries that are inefficient in Drizzle
  - Usage: Two specific aggregation queries for flow metrics

### 4. Administrative Operations
- **`src/api/services/project.service.ts`**
  - Reason: PRAGMA statements and manual CASCADE deletion fallback
  - Usage: Foreign key enabling and project deletion

### 5. Legacy Support
- **`src/api/services/database.service.ts`**
  - Reason: Generic query executor for legacy routes
  - Usage: Should be deprecated - TODO: Create specific DrizzleDatabase methods

## Adding New Exceptions
New exceptions should NOT be added. Instead:
1. Add a new method to DrizzleDatabase for your use case
2. If truly impossible, get team approval and document here with clear justification

## Enforcement
- ESLint rule should flag any `db.prepare` usage outside these files
- Code reviews must verify no new raw SQL usage
- Exceptions must have clear inline comments explaining why they exist