/**
 * Base Test Class
 *
 * Provides common testing utilities and assertion methods
 * to avoid code duplication across test files.
 */

import Database from "better-sqlite3";
import { TestResult } from "./JUnitReporter.js";
import { Assert, AssertionError } from "../../src/utils/test-assertions.js";
import { createLogger, Logger } from "../../src/utils/logger.js";

export abstract class BaseTest {
  protected db: Database.Database;
  protected assertionCount = 0;
  protected passedAssertions = 0;
  protected currentTestName = "";
  protected testName: string;
  protected logger: Logger;

  constructor(testName: string, db: Database.Database) {
    this.testName = testName;
    this.db = db;
    this.logger = createLogger(`Test:${testName}`);
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
    try {
      Assert.isTrue(condition, message);
      this.passedAssertions++;
    } catch (error) {
      if (error instanceof AssertionError) {
        this.logger.error(`Assertion failed in ${this.currentTestName}`, error);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Assert two values are equal
   */
  protected assertEqual<T>(actual: T, expected: T, message: string): void {
    this.assertionCount++;
    try {
      Assert.equal(actual, expected, message);
      this.passedAssertions++;
    } catch (error) {
      if (error instanceof AssertionError) {
        this.logger.error(`Assertion failed in ${this.currentTestName}`, error);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Assert actual is at least the minimum value
   */
  protected assertAtLeast(
    actual: number,
    minimum: number,
    message: string
  ): void {
    this.assertionCount++;
    try {
      Assert.isAtLeast(actual, minimum, message);
      this.passedAssertions++;
    } catch (error) {
      if (error instanceof AssertionError) {
        this.logger.error(`Assertion failed in ${this.currentTestName}`, error);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Assert actual is at most the maximum value
   */
  protected assertAtMost(
    actual: number,
    maximum: number,
    message: string
  ): void {
    this.assertionCount++;
    try {
      Assert.isLessThan(actual, maximum + 1, message);
      this.passedAssertions++;
    } catch (error) {
      if (error instanceof AssertionError) {
        this.logger.error(`Assertion failed in ${this.currentTestName}`, error);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Assert array contains a value
   */
  protected assertContains<T>(array: T[], value: T, message: string): void {
    this.assertionCount++;
    try {
      Assert.includes(array, value, message);
      this.passedAssertions++;
    } catch (error) {
      if (error instanceof AssertionError) {
        this.logger.error(`Assertion failed in ${this.currentTestName}`, error);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Assert string contains substring
   */
  protected assertStringContains(
    str: string,
    substring: string,
    message: string
  ): void {
    this.assertionCount++;
    try {
      Assert.contains(str, substring, message);
      this.passedAssertions++;
    } catch (error) {
      if (error instanceof AssertionError) {
        this.logger.error(`Assertion failed in ${this.currentTestName}`, error);
        throw error;
      }
      throw error;
    }
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
  protected log(message: string): void {
    this.logger.info(message);
  }

  /**
   * Log a warning during tests
   */
  protected warn(message: string): void {
    this.logger.warn(message, { test: this.currentTestName });
  }

  /**
   * Log an error during tests
   */
  protected error(message: string): void {
    this.logger.error(message, undefined, { test: this.currentTestName });
  }

  /**
   * Log success during tests
   */
  protected success(message: string): void {
    console.log(`  ✅ [${this.currentTestName}] ${message}`);
  }
}
