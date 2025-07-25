/**
 * Base Test Class
 *
 * Provides common testing utilities and assertion methods
 * to avoid code duplication across test files.
 */

import Database from "better-sqlite3";
import { TestResult } from "./JUnitReporter.js";

export abstract class BaseTest {
  protected db: Database.Database;
  protected assertionCount = 0;
  protected passedAssertions = 0;
  protected currentTestName = "";
  protected testName: string;

  constructor(testName: string, db: Database.Database) {
    this.testName = testName;
    this.db = db;
  }

  /**
   * Run all tests and return results
   */
  abstract run(): Promise<TestResult[]>;

  /**
   * Assert a condition is true
   */
  protected assert(condition: boolean, message: string): void {
    this.assertionCount++;
    if (!condition) {
      throw new Error(`❌ Assertion failed: ${message}`);
    }
    this.passedAssertions++;
  }

  /**
   * Assert two values are equal
   */
  protected assertEqual<T>(actual: T, expected: T, message: string): void {
    this.assert(
      actual === expected,
      `${message} (expected: ${expected}, actual: ${actual})`
    );
  }

  /**
   * Assert actual is at least the minimum value
   */
  protected assertAtLeast(
    actual: number,
    minimum: number,
    message: string
  ): void {
    this.assert(
      actual >= minimum,
      `${message} (expected at least: ${minimum}, actual: ${actual})`
    );
  }

  /**
   * Assert actual is at most the maximum value
   */
  protected assertAtMost(
    actual: number,
    maximum: number,
    message: string
  ): void {
    this.assert(
      actual <= maximum,
      `${message} (expected at most: ${maximum}, actual: ${actual})`
    );
  }

  /**
   * Assert array contains a value
   */
  protected assertContains<T>(array: T[], value: T, message: string): void {
    this.assert(
      array.includes(value),
      `${message} (array does not contain: ${value})`
    );
  }

  /**
   * Assert string contains substring
   */
  protected assertStringContains(
    str: string,
    substring: string,
    message: string
  ): void {
    this.assert(
      str.includes(substring),
      `${message} (string does not contain: ${substring})`
    );
  }

  /**
   * Assert value is defined (not null or undefined)
   */
  protected assertDefined<T>(
    value: T | null | undefined,
    message: string
  ): asserts value is T {
    this.assert(
      value !== null && value !== undefined,
      `${message} (value is null or undefined)`
    );
  }

  /**
   * Assert value is truthy
   */
  protected assertTruthy(value: any, message: string): void {
    this.assert(!!value, `${message} (value is falsy)`);
  }

  /**
   * Assert value is falsy
   */
  protected assertFalsy(value: any, message: string): void {
    this.assert(!value, `${message} (value is truthy)`);
  }

  /**
   * Create a test result from a test execution
   */
  protected createTestResult(
    testName: string,
    testFunction: () => Promise<void> | void,
    startTime: number
  ): Promise<TestResult> {
    return this.runTest(testName, testFunction, startTime);
  }

  /**
   * Run a single test and return result
   */
  protected async runTest(
    name: string,
    testFunction: () => Promise<void> | void,
    startTime?: number
  ): Promise<TestResult> {
    const start = startTime || Date.now();
    this.currentTestName = name;
    this.assertionCount = 0;
    this.passedAssertions = 0;

    try {
      await testFunction();

      const message =
        this.assertionCount > 0
          ? `Passed ${this.passedAssertions}/${this.assertionCount} assertions`
          : "Test passed";

      return {
        name,
        status: "passed",
        time: Date.now() - start,
        message,
      };
    } catch (error) {
      return {
        name,
        status: "failed",
        time: Date.now() - start,
        error: error instanceof Error ? error : new Error(String(error)),
        message: `Failed after ${this.passedAssertions}/${this.assertionCount} assertions`,
      };
    }
  }

  /**
   * Log a message during tests
   */
  protected log(message: string): void {}

  /**
   * Log a warning during tests
   */
  protected warn(message: string): void {
    console.warn(`  ⚠️ [${this.currentTestName}] ${message}`);
  }

  /**
   * Log an error during tests
   */
  protected error(message: string): void {
    console.error(`  ❌ [${this.currentTestName}] ${message}`);
  }

  /**
   * Log success during tests
   */
  protected success(message: string): void {
    console.log(`  ✅ [${this.currentTestName}] ${message}`);
  }
}
