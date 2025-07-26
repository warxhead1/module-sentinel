/**
 * Simple Drizzle ORM Test
 * Tests basic database operations with the universal schema
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { TestResult } from '../helpers/JUnitReporter';
import { 
  projects, 
  languages, 
  universalSymbols 
} from '../../src/database/drizzle/schema.js';

export class DrizzleOrmTest {
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  
  constructor(db: Database.Database) {
    this.db = db;
    this.drizzleDb = drizzle(db);
  }
  
  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test 1: Can insert and query projects
    results.push(await this.testProjectOperations());
    
    // Test 2: Can insert and query languages
    results.push(await this.testLanguageOperations());
    
    // Test 3: Can insert and query symbols
    results.push(await this.testSymbolOperations());
    
    return results;
  }
  
  private async testProjectOperations(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Insert a test project (use unique name to avoid conflicts)
      const projectName = `drizzle-test-project-${Date.now()}`;
      const insertResult = await this.drizzleDb.insert(projects).values({
        name: projectName,
        displayName: 'Drizzle Test Project',
        description: 'A test project for unit testing Drizzle ORM',
        rootPath: '/test/drizzle-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true
      }).returning();
      
      if (insertResult.length === 0) {
        throw new Error('Failed to insert project');
      }
      
      // Query it back
      const queriedProjects = await this.drizzleDb
        .select()
        .from(projects)
        .where(eq(projects.name, projectName));
      
      if (queriedProjects.length !== 1) {
        throw new Error('Failed to query project');
      }
      
      if (queriedProjects[0].name !== projectName) {
        throw new Error('Project name mismatch');
      }
      
      return {
        name: 'testProjectOperations',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testProjectOperations',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testLanguageOperations(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Insert a test language (use unique name to avoid conflicts)
      const languageName = `test-lang-${Date.now()}`;
      const insertResult = await this.drizzleDb.insert(languages).values({
        name: languageName,
        displayName: 'Test Language',
        parserClass: 'TestParser',
        extensions: JSON.stringify(['.test']),
        isEnabled: true,
        priority: 50
      }).returning();
      
      if (insertResult.length === 0) {
        throw new Error('Failed to insert language');
      }
      
      // Query it back
      const queriedLanguages = await this.drizzleDb
        .select()
        .from(languages)
        .where(eq(languages.name, languageName));
      
      if (queriedLanguages.length !== 1) {
        throw new Error('Failed to query language');
      }
      
      return {
        name: 'testLanguageOperations',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testLanguageOperations',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  private async testSymbolOperations(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // First ensure we have a project and language
      const project = await this.drizzleDb
        .select()
        .from(projects)
        .limit(1);
      
      const language = await this.drizzleDb
        .select()
        .from(languages)
        .limit(1);
      
      if (project.length === 0 || language.length === 0) {
        throw new Error('Need project and language for symbol test');
      }
      
      // Insert a test symbol with unique values
      const timestamp = Date.now();
      const insertResult = await this.drizzleDb.insert(universalSymbols).values({
        projectId: project[0].id,
        languageId: language[0].id,
        name: `TestClass_${timestamp}`,
        qualifiedName: `namespace::TestClass_${timestamp}`,
        kind: 'class',
        filePath: `/test/TestClass_${timestamp}.hpp`,
        line: 10,
        column: 0,
        namespace: 'namespace'
      }).returning();
      
      if (insertResult.length === 0) {
        throw new Error('Failed to insert symbol');
      }
      
      // Query it back
      const queriedSymbols = await this.drizzleDb
        .select()
        .from(universalSymbols)
        .where(eq(universalSymbols.name, `TestClass_${timestamp}`));
      
      if (queriedSymbols.length !== 1) {
        throw new Error('Failed to query symbol');
      }
      
      return {
        name: 'testSymbolOperations',
        status: 'passed',
        time: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'testSymbolOperations',
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}