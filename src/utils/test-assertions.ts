/**
 * Test assertion utilities for Module Sentinel
 * Provides structured assertions with clear error messages
 */

export class AssertionError extends Error {
  constructor(message: string, actual?: any, expected?: any) {
    super(message);
    this.name = 'AssertionError';
    if (actual !== undefined) {
      this.message += `\n  Actual: ${JSON.stringify(actual, null, 2)}`;
    }
    if (expected !== undefined) {
      this.message += `\n  Expected: ${JSON.stringify(expected, null, 2)}`;
    }
  }
}

export class Assert {
  /**
   * Assert that a condition is true
   */
  static isTrue(condition: boolean, message?: string): void {
    if (!condition) {
      throw new AssertionError(message || 'Expected condition to be true', condition, true);
    }
  }

  /**
   * Assert that a condition is false
   */
  static isFalse(condition: boolean, message?: string): void {
    if (condition) {
      throw new AssertionError(message || 'Expected condition to be false', condition, false);
    }
  }

  /**
   * Assert that two values are equal (using ===)
   */
  static equal<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new AssertionError(
        message || `Expected values to be equal`,
        actual,
        expected
      );
    }
  }

  /**
   * Assert that two values are not equal
   */
  static notEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual === expected) {
      throw new AssertionError(
        message || `Expected values to not be equal`,
        actual,
        `not ${expected}`
      );
    }
  }

  /**
   * Assert that two values are deeply equal
   */
  static deepEqual<T>(actual: T, expected: T, message?: string): void {
    if (!this.deepCompare(actual, expected)) {
      throw new AssertionError(
        message || 'Expected values to be deeply equal',
        actual,
        expected
      );
    }
  }

  /**
   * Assert that a value is null
   */
  static isNull(value: any, message?: string): void {
    if (value !== null) {
      throw new AssertionError(message || 'Expected value to be null', value, null);
    }
  }

  /**
   * Assert that a value is not null
   */
  static isNotNull(value: any, message?: string): void {
    if (value === null) {
      throw new AssertionError(message || 'Expected value to not be null', value, 'not null');
    }
  }

  /**
   * Assert that a value is undefined
   */
  static isUndefined(value: any, message?: string): void {
    if (value !== undefined) {
      throw new AssertionError(message || 'Expected value to be undefined', value, undefined);
    }
  }

  /**
   * Assert that a value is defined (not undefined)
   */
  static isDefined(value: any, message?: string): void {
    if (value === undefined) {
      throw new AssertionError(message || 'Expected value to be defined', value, 'defined');
    }
  }

  /**
   * Assert that an array includes a value
   */
  static includes<T>(array: T[], value: T, message?: string): void {
    if (!array.includes(value)) {
      throw new AssertionError(
        message || `Expected array to include value`,
        array,
        `array containing ${value}`
      );
    }
  }

  /**
   * Assert that a string contains a substring
   */
  static contains(str: string, substring: string, message?: string): void {
    if (!str.includes(substring)) {
      throw new AssertionError(
        message || `Expected string to contain substring`,
        str,
        `string containing "${substring}"`
      );
    }
  }

  /**
   * Assert that a value is greater than another
   */
  static isGreaterThan(actual: number, expected: number, message?: string): void {
    if (actual <= expected) {
      throw new AssertionError(
        message || `Expected ${actual} to be greater than ${expected}`,
        actual,
        `> ${expected}`
      );
    }
  }

  /**
   * Assert that a value is greater than or equal to another
   */
  static isAtLeast(actual: number, expected: number, message?: string): void {
    if (actual < expected) {
      throw new AssertionError(
        message || `Expected ${actual} to be at least ${expected}`,
        actual,
        `>= ${expected}`
      );
    }
  }

  /**
   * Assert that a value is less than another
   */
  static isLessThan(actual: number, expected: number, message?: string): void {
    if (actual >= expected) {
      throw new AssertionError(
        message || `Expected ${actual} to be less than ${expected}`,
        actual,
        `< ${expected}`
      );
    }
  }

  /**
   * Assert that a value is within a range (inclusive)
   */
  static isInRange(value: number, min: number, max: number, message?: string): void {
    if (value < min || value > max) {
      throw new AssertionError(
        message || `Expected ${value} to be between ${min} and ${max}`,
        value,
        `${min} <= value <= ${max}`
      );
    }
  }

  /**
   * Assert that a function throws an error
   */
  static throws(fn: () => any, expectedError?: string | RegExp, message?: string): void {
    try {
      fn();
      throw new AssertionError(
        message || 'Expected function to throw an error',
        'no error thrown',
        'error'
      );
    } catch (error) {
      if (error instanceof AssertionError) {
        throw error;
      }
      if (expectedError) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (typeof expectedError === 'string') {
          if (!errorMessage.includes(expectedError)) {
            throw new AssertionError(
              message || 'Error message does not match expected',
              errorMessage,
              expectedError
            );
          }
        } else if (expectedError instanceof RegExp) {
          if (!expectedError.test(errorMessage)) {
            throw new AssertionError(
              message || 'Error message does not match pattern',
              errorMessage,
              expectedError.toString()
            );
          }
        }
      }
    }
  }

  /**
   * Assert that an async function rejects
   */
  static async rejects(
    fn: () => Promise<any>,
    expectedError?: string | RegExp,
    message?: string
  ): Promise<void> {
    try {
      await fn();
      throw new AssertionError(
        message || 'Expected promise to reject',
        'promise resolved',
        'rejection'
      );
    } catch (error) {
      if (error instanceof AssertionError) {
        throw error;
      }
      if (expectedError) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (typeof expectedError === 'string') {
          if (!errorMessage.includes(expectedError)) {
            throw new AssertionError(
              message || 'Error message does not match expected',
              errorMessage,
              expectedError
            );
          }
        } else if (expectedError instanceof RegExp) {
          if (!expectedError.test(errorMessage)) {
            throw new AssertionError(
              message || 'Error message does not match pattern',
              errorMessage,
              expectedError.toString()
            );
          }
        }
      }
    }
  }

  /**
   * Assert that an object has a property
   */
  static hasProperty(obj: any, property: string, message?: string): void {
    if (!(property in obj)) {
      throw new AssertionError(
        message || `Expected object to have property "${property}"`,
        Object.keys(obj),
        `object with property "${property}"`
      );
    }
  }

  /**
   * Assert array length
   */
  static lengthOf<T>(array: T[], expectedLength: number, message?: string): void {
    if (array.length !== expectedLength) {
      throw new AssertionError(
        message || `Expected array to have length ${expectedLength}`,
        array.length,
        expectedLength
      );
    }
  }

  /**
   * Assert that value is empty (length 0 for arrays/strings, no keys for objects)
   */
  static isEmpty(value: any[] | string | object, message?: string): void {
    let isEmpty = false;
    if (Array.isArray(value) || typeof value === 'string') {
      isEmpty = value.length === 0;
    } else if (typeof value === 'object' && value !== null) {
      isEmpty = Object.keys(value).length === 0;
    }
    
    if (!isEmpty) {
      throw new AssertionError(
        message || 'Expected value to be empty',
        value,
        'empty'
      );
    }
  }

  /**
   * Assert that value is not empty
   */
  static isNotEmpty(value: any[] | string | object, message?: string): void {
    let isEmpty = false;
    if (Array.isArray(value) || typeof value === 'string') {
      isEmpty = value.length === 0;
    } else if (typeof value === 'object' && value !== null) {
      isEmpty = Object.keys(value).length === 0;
    }
    
    if (isEmpty) {
      throw new AssertionError(
        message || 'Expected value to not be empty',
        value,
        'not empty'
      );
    }
  }

  /**
   * Deep comparison helper
   */
  private static deepCompare(a: any, b: any): boolean {
    if (a === b) return true;
    
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    
    if (!a || !b || (typeof a !== 'object' && typeof b !== 'object')) {
      return a === b;
    }
    
    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }
    
    if (a.prototype !== b.prototype) return false;
    
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    
    return keys.every(k => this.deepCompare(a[k], b[k]));
  }
}

// Convenience exports for common assertions
export const assert = Assert;
export const assertTrue = Assert.isTrue.bind(Assert);
export const assertFalse = Assert.isFalse.bind(Assert);
export const assertEqual = Assert.equal.bind(Assert);
export const assertDeepEqual = Assert.deepEqual.bind(Assert);
export const assertThrows = Assert.throws.bind(Assert);
export const assertRejects = Assert.rejects.bind(Assert);