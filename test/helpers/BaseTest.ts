import { TestDatabaseManager } from './TestDatabaseManager';
import * as path from 'path';

export class AssertionError extends Error {
  constructor(message: string, actual?: any, expected?: any) {
    super(message);
    this.name = 'AssertionError';
    if (actual !== undefined) {
      this.message += `\n  Expected: ${JSON.stringify(expected)}`;
      this.message += `\n  Actual: ${JSON.stringify(actual)}`;
    }
  }
}

export abstract class BaseTest {
  protected dbManager: TestDatabaseManager;
  protected projectPath: string;
  protected testName: string;
  protected assertionCount: number = 0;
  protected passedAssertions: number = 0;

  constructor(testName: string, projectPath: string = '/home/warxh/planet_procgen') {
    this.testName = testName;
    this.projectPath = projectPath;
    this.dbManager = new TestDatabaseManager(`.test-db/${testName}`);
  }

  // Assertion methods
  protected assert(condition: boolean, message: string): void {
    this.assertionCount++;
    if (!condition) {
      throw new AssertionError(`❌ ${message}`);
    }
    this.passedAssertions++;
    console.log(`✅ ${message}`);
  }

  protected assertEqual<T>(actual: T, expected: T, message?: string): void {
    this.assertionCount++;
    if (actual !== expected) {
      const msg = message || `Expected ${expected}, got ${actual}`;
      throw new AssertionError(`❌ ${msg}`, actual, expected);
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `${actual} equals ${expected}`}`);
  }

  protected assertGreaterThan(actual: number, expected: number, message?: string): void {
    this.assertionCount++;
    if (actual <= expected) {
      const msg = message || `Expected ${actual} > ${expected}`;
      throw new AssertionError(`❌ ${msg}`, actual, expected);
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `${actual} > ${expected}`}`);
  }

  protected assertGreaterEqual(actual: number, expected: number, message?: string): void {
    this.assertionCount++;
    if (actual < expected) {
      const msg = message || `Expected ${actual} >= ${expected}`;
      throw new AssertionError(`❌ ${msg}`, actual, expected);
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `${actual} >= ${expected}`}`);
  }

  protected assertLessThan(actual: number, expected: number, message?: string): void {
    this.assertionCount++;
    if (actual >= expected) {
      const msg = message || `Expected ${actual} < ${expected}`;
      throw new AssertionError(`❌ ${msg}`, actual, expected);
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `${actual} < ${expected}`}`);
  }

  protected assertContains<T>(array: T[], item: T, message?: string): void {
    this.assertionCount++;
    if (!array.includes(item)) {
      const msg = message || `Expected array to contain ${item}`;
      throw new AssertionError(`❌ ${msg}`, array, item);
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `Array contains ${item}`}`);
  }

  protected assertNotEmpty<T>(array: T[], message?: string): void {
    this.assertionCount++;
    if (!array || array.length === 0) {
      const msg = message || `Expected non-empty array`;
      throw new AssertionError(`❌ ${msg}`, array?.length || 0, "> 0");
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `Array is not empty (length: ${array.length})`}`);
  }

  protected assertExists(value: any, message?: string): void {
    this.assertionCount++;
    if (value === null || value === undefined) {
      const msg = message || `Expected value to exist`;
      throw new AssertionError(`❌ ${msg}`, value, "not null/undefined");
    }
    this.passedAssertions++;
    console.log(`✅ ${message || `Value exists`}`);
  }

  protected printAssertionSummary(): void {
    console.log(`\n📊 Assertion Summary: ${this.passedAssertions}/${this.assertionCount} passed`);
    if (this.passedAssertions === this.assertionCount) {
      console.log(`🎉 All assertions passed!`);
    } else {
      console.log(`⚠️  ${this.assertionCount - this.passedAssertions} assertions failed`);
    }
  }

  async setup(): Promise<void> {
    console.log(`\n🔧 Setting up test: ${this.testName}`);
    await this.dbManager.initialize();
    await this.specificSetup();
  }

  async teardown(): Promise<void> {
    console.log(`\n🧹 Tearing down test: ${this.testName}`);
    await this.specificTeardown();
    this.dbManager.closeAll();
  }

  abstract specificSetup(): Promise<void>;
  abstract specificTeardown(): Promise<void>;
  abstract run(): Promise<void>;

  async execute(): Promise<void> {
    try {
      await this.setup();
      await this.run();
      this.printAssertionSummary();
      console.log(`✅ Test ${this.testName} completed successfully`);
    } catch (error) {
      this.printAssertionSummary();
      console.error(`❌ Test ${this.testName} failed:`, error);
      throw error;
    } finally {
      await this.teardown();
    }
  }
}