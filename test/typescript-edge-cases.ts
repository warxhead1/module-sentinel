/**
 * TypeScript Edge Cases Test Suite
 * 
 * This file contains various TypeScript patterns that parsers often struggle with.
 * Used to test and improve parser accuracy.
 */

// 1. Arrow functions in object literals
const objectWithArrows = {
  simpleArrow: () => 42,
  asyncArrow: async () => await fetch('/api'),
  genericArrow: <T>(x: T): T => x,
  nestedObject: {
    deepArrow: (x: number) => x * 2,
    veryDeep: {
      tripleNested: () => 'deep'
    }
  },
  // Complex case: arrow function returning object literal
  returnsObject: () => ({ x: 1, y: 2 }),
  // With destructuring
  destructuredArrow: ({ x, y }: { x: number; y: number }) => x + y,
  // Array of arrows
  arrowArray: [
    () => 1,
    () => 2,
    (x: number) => x
  ]
};

// 2. Template literal types
type Color = 'red' | 'blue' | 'green';
type Size = 'small' | 'medium' | 'large';
type TemplateLiteralType = `${Color}-${Size}`;
type ComplexTemplate = `prefix-${string}-${number}-suffix`;
type URLPattern = `/api/${string}/v${number}`;

// Template literal with embedded expressions
const templateFunc = <T extends string>(prefix: T) => {
  return `result-${prefix}` as const;
};

// 3. Dynamic imports
const lazyModule = () => import('./module');
const conditionalImport = async (condition: boolean) => {
  if (condition) {
    const { someExport } = await import('./conditional-module');
    return someExport;
  }
  return import('./default-module');
};

// Dynamic import with template literal
const dynamicPath = (moduleName: string) => import(`./modules/${moduleName}`);

// 4. Complex destructuring patterns
const { 
  prop1,
  prop2: renamedProp,
  nested: { 
    deep,
    deeper: { deepest }
  },
  ...rest
} = someObject;

// Array destructuring with rest
const [first, second, ...remaining] = someArray;

// Mixed destructuring in parameters
function complexParams({
  x,
  y: { z, w: [a, b, ...c] },
  ...others
}: ComplexType) {
  return { x, z, a, b, c, others };
}

// 5. Intersection and union types with functions
type Handler = ((x: string) => void) & { meta?: string };
type AsyncHandler = ((x: string) => Promise<void>) | ((x: string, y: number) => Promise<void>);

// 6. Const assertions and literal types
const config = {
  endpoint: '/api/v1',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
} as const;

const tuple = [1, 'two', true] as const;

// 7. Mapped types with template literals
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]
};

type Setters<T> = {
  [K in keyof T as `set${Capitalize<string & K>}`]: (value: T[K]) => void
};

// 8. Conditional types with infer
type ExtractPromise<T> = T extends Promise<infer U> ? U : never;
type ExtractFunction<T> = T extends (...args: infer A) => infer R ? [A, R] : never;

// 9. Class with decorators and parameter properties
@sealed
class DecoratedClass {
  @log
  method(@required param: string) {
    return param;
  }

  constructor(
    private readonly id: string,
    public name: string,
    protected age?: number
  ) {}
}

// 10. Complex async patterns
const asyncGenerator = async function* () {
  yield 1;
  yield await Promise.resolve(2);
  yield* [3, 4, 5];
};

const asyncIterable = {
  async *[Symbol.asyncIterator]() {
    yield 'hello';
    yield 'world';
  }
};

// 11. Type guards and assertions
function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function assertDefined<T>(x: T | undefined): asserts x is T {
  if (x === undefined) throw new Error('Value is undefined');
}

// 12. Module augmentation
declare module 'existing-module' {
  interface ExistingInterface {
    newProperty: string;
  }
}

// 13. Namespace with exports
namespace ComplexNamespace {
  export interface Config {
    url: string;
    timeout: number;
  }

  export class Implementation {
    constructor(private config: Config) {}
  }

  export namespace Nested {
    export type DeepType = string;
  }
}

// 14. Abstract class with abstract properties
abstract class AbstractBase {
  abstract readonly abstractProp: string;
  abstract abstractMethod(): void;
  
  concreteMethod() {
    return this.abstractProp;
  }
}

// 15. Overloaded functions
function overloaded(x: string): string;
function overloaded(x: number): number;
function overloaded(x: string | number): string | number {
  return x;
}

// 16. Generic constraints with conditional types
type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never
}[keyof T];

interface Example {
  a: string;
  b: number;
  c: string;
  d: boolean;
}

type StringKeys = KeysOfType<Example, string>; // 'a' | 'c'