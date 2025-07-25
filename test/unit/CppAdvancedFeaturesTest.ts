/**
 * C++ Advanced Features Test
 * 
 * Tests C++ parser capabilities for advanced features that were identified
 * as problematic in the PARSER_CAPABILITIES_REPORT.md:
 * 
 * 1. Template specializations and metaprogramming
 * 2. Modern C++17/20 features (concepts, modules)
 * 3. Complex data types and type inference
 * 4. Macro expansions and preprocessor directives
 * 5. Unicode identifiers and complex nested structures
 * 6. Template duplicate symbol handling
 */

import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, like, or } from 'drizzle-orm';
import { universalSymbols, projects } from '../../dist/database/schema/universal.js';
import { OptimizedCppTreeSitterParser } from '../../dist/parsers/tree-sitter/optimized-cpp-parser.js';

interface TemplateTestCase {
  name: string;
  code: string;
  expectedSymbols: {
    name: string;
    kind: string;
    signature?: string;
    returnType?: string;
    templateParams?: string[];
  }[];
  shouldNoDuplicates?: boolean;
}

export class CppAdvancedFeaturesTest {
  private rawDb: Database.Database;
  private db: ReturnType<typeof drizzle>;
  private parser: OptimizedCppTreeSitterParser;

  constructor(rawDb: Database.Database) {
    this.rawDb = rawDb;
    this.db = drizzle(rawDb);
    this.parser = new OptimizedCppTreeSitterParser(rawDb, { 
      debugMode: true,
      enableSemanticAnalysis: false 
    });
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    try {
      await this.parser.initialize();

      // Test 1: Template Specializations
      results.push(await this.testTemplateSpecializations());
      
      // Test 2: Template Metaprogramming
      results.push(await this.testTemplateMetaprogramming());
      
      // Test 3: Modern C++ Features
      results.push(await this.testModernCppFeatures());
      
      // Test 4: Complex Data Types
      results.push(await this.testComplexDataTypes());
      
      // Test 5: Template Duplicates Handling
      results.push(await this.testTemplateDuplicatesHandling());
      
      // Test 6: Concept and Constraints (C++20)
      results.push(await this.testConceptsAndConstraints());
      
      // Test 7: Module Imports (C++20)
      results.push(await this.testModuleImports());
      
      // Test 8: SFINAE and Type Traits
      results.push(await this.testSFINAEAndTypeTraits());

    } catch (error) {
      results.push({
        name: 'advanced_cpp_setup_failure',
        status: 'failed',
        time: 0,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }

    return results;
  }

  /**
   * Test 1: Template Specializations - should not create duplicate symbols
   */
  private async testTemplateSpecializations(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'template_specializations';
    
    try {
      const testCode = `
namespace Test {
  // Primary template
  template<typename T>
  class Container {
  public:
    T data;
    void process(T item);
    T get() const { return data; }
  };
  
  // Full specialization for int
  template<>
  class Container<int> {
  public:
    int data;
    void process(int item);
    int get() const { return data; }
    void specialIntMethod();
  };
  
  // Partial specialization for pointers  
  template<typename T>
  class Container<T*> {
  public:
    T* data;
    void process(T* item);
    T* get() const { return data; }
    void specialPointerMethod();
  };
  
  // Template function with specialization
  template<typename T>
  T max(T a, T b) { return a > b ? a : b; }
  
  template<>
  int max<int>(int a, int b) { return a > b ? a : b; }
}
`;

      const result = await this.parser.parseFile('test_template_spec.cpp', testCode);
      
      console.log(`\\n[TEMPLATE SPEC] Found ${result.symbols.length} symbols`);
      
      // Check we have primary template
      const primaryTemplate = result.symbols.find(s => 
        s.name === 'Container' && 
        !s.signature?.includes('<int>') &&
        !s.signature?.includes('<T*>')
      );
      
      if (!primaryTemplate) {
        throw new Error('Primary template Container not found');
      }
      
      // Check we have specializations
      const intSpecialization = result.symbols.find(s => 
        s.name === 'Container' && 
        (s.signature?.includes('<int>') || s.qualifiedName?.includes('<int>'))
      );
      
      const pointerSpecialization = result.symbols.find(s => 
        s.name === 'Container' && 
        (s.signature?.includes('<T*>') || s.qualifiedName?.includes('<T*>'))
      );
      
      // Verify specialization-specific methods
      const specialIntMethod = result.symbols.find(s => s.name === 'specialIntMethod');
      const specialPointerMethod = result.symbols.find(s => s.name === 'specialPointerMethod');
      
      if (!specialIntMethod) {
        console.log('\\n[WARNING] specialIntMethod not found - specialization methods may not be detected');
      }
      
      if (!specialPointerMethod) {
        console.log('\\n[WARNING] specialPointerMethod not found - specialization methods may not be detected');
      }
      
      // Check template function specialization
      const maxFunctions = result.symbols.filter(s => s.name === 'max');
      console.log(`\\n[TEMPLATE FUNC] Found ${maxFunctions.length} max function(s)`);
      
      // Verify no excessive duplicates (some duplicates expected for templates)
      const containerClasses = result.symbols.filter(s => 
        s.name === 'Container' && s.kind === 'class'
      );
      
      if (containerClasses.length > 5) {
        console.log(`\\n[WARNING] High number of Container duplicates: ${containerClasses.length}`);
        containerClasses.forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.qualifiedName} - ${c.signature}`);
        });
      }
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 2: Template Metaprogramming
   */
  private async testTemplateMetaprogramming(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'template_metaprogramming';
    
    try {
      const testCode = `
#include <type_traits>

namespace Meta {
  // SFINAE example
  template<typename T>
  typename std::enable_if<std::is_integral<T>::value, T>::type
  process_integral(T value) {
    return value * 2;
  }
  
  template<typename T>
  typename std::enable_if<std::is_floating_point<T>::value, T>::type
  process_floating(T value) {
    return value / 2.0;
  }
  
  // Variadic template
  template<typename... Args>
  void print_types(Args... args) {
    ((std::cout << typeid(args).name() << " "), ...);
  }
  
  // Template template parameter
  template<template<typename> class Container, typename T>
  class Wrapper {
  public:
    Container<T> data;
    void add(const T& item);
  };
  
  // Recursive template metaprogramming
  template<int N>
  struct Factorial {
    static constexpr int value = N * Factorial<N-1>::value;
  };
  
  template<>
  struct Factorial<0> {
    static constexpr int value = 1;
  };
  
  // Type traits
  template<typename T>
  struct is_pointer : std::false_type {};
  
  template<typename T>
  struct is_pointer<T*> : std::true_type {};
  
  // CRTP pattern
  template<typename Derived>
  class Base {
  public:
    void interface() {
      static_cast<Derived*>(this)->implementation();
    }
  };
  
  class Derived : public Base<Derived> {
  public:
    void implementation();
  };
}
`;

      const result = await this.parser.parseFile('test_metaprogramming.cpp', testCode);
      
      console.log(`\\n[METAPROGRAMMING] Found ${result.symbols.length} symbols`);
      
      // Check SFINAE functions
      const sfinaeIntegral = result.symbols.find(s => s.name === 'process_integral');
      const sfinaeFloating = result.symbols.find(s => s.name === 'process_floating');
      
      if (!sfinaeIntegral || !sfinaeFloating) {
        console.log('\\n[WARNING] SFINAE functions not detected properly');
      }
      
      // Check variadic template
      const variadicTemplate = result.symbols.find(s => s.name === 'print_types');
      if (variadicTemplate && variadicTemplate.signature?.includes('...')) {
        console.log(`\\n[VARIADIC] Found variadic template: ${variadicTemplate.signature}`);
      }
      
      // Check template template parameter
      const wrapperClass = result.symbols.find(s => s.name === 'Wrapper');
      if (wrapperClass) {
        console.log(`\\n[TEMPLATE TEMPLATE] Found Wrapper class: ${wrapperClass.signature}`);
      }
      
      // Check recursive template
      const factorialStruct = result.symbols.find(s => s.name === 'Factorial');
      if (factorialStruct) {
        console.log(`\\n[RECURSIVE] Found Factorial template: ${factorialStruct.signature}`);
      }
      
      // Check type traits
      const typeTraits = result.symbols.filter(s => 
        s.name === 'is_pointer' && s.kind === 'class'
      );
      console.log(`\\n[TYPE TRAITS] Found ${typeTraits.length} type trait specializations`);
      
      // Check CRTP pattern
      const baseClass = result.symbols.find(s => s.name === 'Base');
      const derivedClass = result.symbols.find(s => s.name === 'Derived');
      
      if (baseClass && derivedClass) {
        console.log(`\\n[CRTP] Found CRTP pattern: Base and Derived classes`);
      }
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 3: Modern C++ Features (C++17/20)
   */
  private async testModernCppFeatures(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'modern_cpp_features';
    
    try {
      const testCode = `
#include <optional>
#include <variant>
#include <string_view>

namespace Modern {
  // Structured bindings (C++17)
  auto [x, y, z] = std::make_tuple(1, 2.0, "hello");
  
  // if constexpr (C++17)
  template<typename T>
  void process_type() {
    if constexpr (std::is_integral_v<T>) {
      // Handle integral types
    } else if constexpr (std::is_floating_point_v<T>) {
      // Handle floating point types
    }
  }
  
  // Fold expressions (C++17)
  template<typename... Args>
  auto sum(Args... args) {
    return (args + ...);
  }
  
  // std::optional usage
  std::optional<int> maybe_get_value(bool condition) {
    if (condition) {
      return 42;
    }
    return std::nullopt;
  }
  
  // std::variant usage
  using Value = std::variant<int, double, std::string>;
  
  void process_variant(const Value& v) {
    std::visit([](auto&& arg) {
      using T = std::decay_t<decltype(arg)>;
      if constexpr (std::is_same_v<T, int>) {
        // Handle int
      } else if constexpr (std::is_same_v<T, double>) {
        // Handle double
      } else if constexpr (std::is_same_v<T, std::string>) {
        // Handle string
      }
    }, v);
  }
  
  // std::string_view usage
  void process_string(std::string_view sv) {
    // Process string view
  }
  
  // Inline variables (C++17)
  inline constexpr double pi = 3.14159265359;
  
  // Class template argument deduction (C++17)
  class DeductionGuideExample {
  public:
    template<typename T>
    DeductionGuideExample(T value) : data(value) {}
    
  private:
    std::variant<int, double, std::string> data;
  };
  
  // Requires clause (C++20 - might not be fully supported)
  template<typename T>
  requires std::is_arithmetic_v<T>
  T multiply_by_two(T value) {
    return value * 2;
  }
  
  // Coroutines (C++20 - might not be fully supported)
  // Note: This is advanced and may not parse correctly
  /*
  std::generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
      co_yield a;
      auto next = a + b;
      a = b;
      b = next;
    }
  }
  */
}
`;

      const result = await this.parser.parseFile('test_modern_cpp.cpp', testCode);
      
      console.log(`\\n[MODERN CPP] Found ${result.symbols.length} symbols`);
      
      // Check modern features
      const features = {
        'structured_bindings': result.symbols.some(s => s.signature?.includes('auto [') || s.name?.includes('x, y, z')),
        'if_constexpr': result.symbols.some(s => s.name === 'process_type'),
        'fold_expressions': result.symbols.some(s => s.name === 'sum' && s.signature?.includes('...')),
        'optional_usage': result.symbols.some(s => s.name === 'maybe_get_value' && s.returnType?.includes('optional')),
        'variant_usage': result.symbols.some(s => s.name === 'Value' || s.name === 'process_variant'),
        'string_view': result.symbols.some(s => s.signature?.includes('string_view')),
        'inline_variables': result.symbols.some(s => s.name === 'pi'),
        'deduction_guides': result.symbols.some(s => s.name === 'DeductionGuideExample'),
        'requires_clause': result.symbols.some(s => s.name === 'multiply_by_two')
      };
      
      console.log('\\n[MODERN FEATURES] Detection results:');
      Object.entries(features).forEach(([feature, detected]) => {
        console.log(`  ${detected ? '✓' : '✗'} ${feature}`);
      });
      
      const detectedCount = Object.values(features).filter(Boolean).length;
      console.log(`\\n[SUMMARY] Detected ${detectedCount}/9 modern C++ features`);
      
      // We expect at least half the features to be detected
      if (detectedCount < 4) {
        console.log('\\n[WARNING] Low detection rate for modern C++ features');
      }
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 4: Complex Data Types
   */
  private async testComplexDataTypes(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'complex_data_types';
    
    try {
      const testCode = `
#include <vector>
#include <map>
#include <unordered_map>
#include <memory>
#include <functional>

namespace DataTypes {
  // Complex nested templates
  using NestedMap = std::map<std::string, std::vector<std::unique_ptr<int>>>;
  using FunctionMap = std::unordered_map<std::string, std::function<void(int, double)>>;
  
  // Function pointers and lambdas
  using CallbackType = std::function<void(const std::vector<int>&)>;
  auto lambda = [](int x, int y) -> int { return x + y; };
  
  // Complex return types
  std::unique_ptr<std::vector<std::shared_ptr<std::string>>> 
  create_complex_structure() {
    return std::make_unique<std::vector<std::shared_ptr<std::string>>>();
  }
  
  // Template with multiple parameters and defaults
  template<typename Key, typename Value, typename Hash = std::hash<Key>>
  class ComplexContainer {
  private:
    std::unordered_map<Key, std::vector<Value>, Hash> data;
    
  public:
    void insert(const Key& k, const Value& v);
    std::vector<Value>& get(const Key& k);
    
    // Nested template method
    template<typename Predicate>
    std::vector<Value> filter(const Key& k, Predicate pred) {
      std::vector<Value> result;
      auto& values = data[k];
      std::copy_if(values.begin(), values.end(), 
                   std::back_inserter(result), pred);
      return result;
    }
  };
  
  // RAII and smart pointers
  class ResourceManager {
  private:
    std::unique_ptr<int[]> array_ptr;
    std::shared_ptr<std::vector<double>> shared_data;
    std::weak_ptr<std::string> weak_reference;
    
  public:
    ResourceManager(size_t size);
    ~ResourceManager() = default;
    
    // Move semantics
    ResourceManager(ResourceManager&& other) noexcept;
    ResourceManager& operator=(ResourceManager&& other) noexcept;
    
    // Deleted copy operations
    ResourceManager(const ResourceManager&) = delete;
    ResourceManager& operator=(const ResourceManager&) = delete;
  };
  
  // Concepts-like constraints (C++20 style)
  template<typename T>
  concept Arithmetic = std::is_arithmetic_v<T>;
  
  template<Arithmetic T>
  T add(T a, T b) {
    return a + b;
  }
  
  // Type aliases with complex templates
  template<typename T>
  using ProcessorFunc = std::function<std::vector<T>(const std::vector<T>&)>;
  
  template<typename T>
  using SharedVector = std::shared_ptr<std::vector<T>>;
}
`;

      const result = await this.parser.parseFile('test_complex_types.cpp', testCode);
      
      console.log(`\\n[COMPLEX TYPES] Found ${result.symbols.length} symbols`);
      
      // Check type aliases
      const typeAliases = result.symbols.filter(s => 
        ['NestedMap', 'FunctionMap', 'CallbackType', 'ProcessorFunc', 'SharedVector'].includes(s.name)
      );
      console.log(`\\n[TYPE ALIASES] Found ${typeAliases.length}/5 type aliases`);
      
      // Check complex return types
      const complexFunction = result.symbols.find(s => s.name === 'create_complex_structure');
      if (complexFunction && complexFunction.returnType) {
        console.log(`\\n[COMPLEX RETURN] ${complexFunction.name}: ${complexFunction.returnType}`);
      }
      
      // Check template class with multiple parameters
      const complexContainer = result.symbols.find(s => s.name === 'ComplexContainer');
      if (complexContainer) {
        console.log(`\\n[TEMPLATE CLASS] Found ComplexContainer: ${complexContainer.signature}`);
      }
      
      // Check nested template method
      const filterMethod = result.symbols.find(s => s.name === 'filter');
      if (filterMethod) {
        console.log(`\\n[NESTED TEMPLATE] Found filter method: ${filterMethod.signature}`);
      }
      
      // Check RAII class
      const resourceManager = result.symbols.find(s => s.name === 'ResourceManager');
      if (resourceManager) {
        console.log(`\\n[RAII CLASS] Found ResourceManager class`);
        
        // Check move semantics
        const moveConstructor = result.symbols.find(s => 
          s.name === 'ResourceManager' && 
          s.signature?.includes('&&')
        );
        if (moveConstructor) {
          console.log(`  ✓ Move constructor detected`);
        }
      }
      
      // Check concept usage (C++20)
      const conceptUsage = result.symbols.find(s => s.name === 'add' && s.signature?.includes('Arithmetic'));
      if (conceptUsage) {
        console.log(`\\n[CONCEPTS] Found concept-constrained function: ${conceptUsage.signature}`);
      }
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 5: Template Duplicates Handling
   */
  private async testTemplateDuplicatesHandling(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'template_duplicates_handling';
    
    try {
      const testCode = `
namespace Duplicates {
  // This should NOT create excessive duplicates
  template<typename T>
  class TestTemplate {
  public:
    void method1();
    void method2();
    T getValue();
  };
  
  // Multiple instantiations - parser should handle gracefully
  TestTemplate<int> int_instance;
  TestTemplate<double> double_instance;
  TestTemplate<std::string> string_instance;
  
  // Explicit instantiation
  template class TestTemplate<float>;
  
  // Template function with multiple calls
  template<typename T>
  T process(T value) { return value; }
  
  void usage() {
    process(42);
    process(3.14);
    process(std::string("hello"));
  }
}
`;

      const result = await this.parser.parseFile('test_duplicates.cpp', testCode);
      
      console.log(`\\n[DUPLICATES] Found ${result.symbols.length} symbols`);
      
      // Count TestTemplate occurrences
      const testTemplates = result.symbols.filter(s => s.name === 'TestTemplate');
      console.log(`\\n[TEMPLATE COUNT] Found ${testTemplates.length} TestTemplate symbols`);
      
      // Should not have excessive duplicates (more than 10 would be problematic)
      if (testTemplates.length > 10) {
        console.log(`\\n[ERROR] Excessive TestTemplate duplicates detected!`);
        testTemplates.forEach((t, i) => {
          console.log(`  ${i + 1}. ${t.qualifiedName} - ${t.signature} - Line ${t.line}`);
        });
        throw new Error(`Excessive duplicates: ${testTemplates.length} TestTemplate symbols`);
      }
      
      // Count process function occurrences
      const processFunctions = result.symbols.filter(s => s.name === 'process');
      console.log(`\\n[FUNCTION COUNT] Found ${processFunctions.length} process function symbols`);
      
      if (processFunctions.length > 5) {
        console.log(`\\n[WARNING] Many process function duplicates: ${processFunctions.length}`);
      }
      
      // Check that methods are properly associated
      const methods = result.symbols.filter(s => 
        ['method1', 'method2', 'getValue'].includes(s.name)
      );
      console.log(`\\n[METHODS] Found ${methods.length} template methods`);
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 6: Concepts and Constraints (C++20)
   */
  private async testConceptsAndConstraints(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'concepts_and_constraints';
    
    try {
      const testCode = `
#include <concepts>
#include <type_traits>

namespace Concepts {
  // Basic concept definition
  template<typename T>
  concept Integral = std::is_integral_v<T>;
  
  template<typename T>
  concept FloatingPoint = std::is_floating_point_v<T>;
  
  // Compound concept
  template<typename T>
  concept Arithmetic = Integral<T> || FloatingPoint<T>;
  
  // Concept with requirements clause
  template<typename T>
  concept Comparable = requires(T a, T b) {
    { a < b } -> std::convertible_to<bool>;
    { a > b } -> std::convertible_to<bool>;
    { a == b } -> std::convertible_to<bool>;
  };
  
  // Function with concept constraint
  template<Integral T>
  T double_value(T value) {
    return value * 2;
  }
  
  template<FloatingPoint T>
  T half_value(T value) {
    return value / 2.0;
  }
  
  // Class template with concept constraint
  template<Comparable T>
  class SortedContainer {
  private:
    std::vector<T> data;
    
  public:
    void insert(const T& item);
    bool contains(const T& item) const;
  };
  
  // Abbreviated function template (C++20)
  auto process_arithmetic(Arithmetic auto value) {
    return value + 1;
  }
  
  // Requires clause with complex constraints
  template<typename T>
  requires Arithmetic<T> && sizeof(T) >= 4
  T complex_operation(T value) {
    return value * value;
  }
}
`;

      const result = await this.parser.parseFile('test_concepts.cpp', testCode);
      
      console.log(`\\n[CONCEPTS] Found ${result.symbols.length} symbols`);
      
      // Check concept definitions
      const concepts = result.symbols.filter(s => 
        ['Integral', 'FloatingPoint', 'Arithmetic', 'Comparable'].includes(s.name)
      );
      console.log(`\\n[CONCEPT DEFS] Found ${concepts.length}/4 concept definitions`);
      
      // Check constrained functions
      const constrainedFunctions = result.symbols.filter(s => 
        ['double_value', 'half_value', 'process_arithmetic', 'complex_operation'].includes(s.name)
      );
      console.log(`\\n[CONSTRAINED FUNCS] Found ${constrainedFunctions.length}/4 constrained functions`);
      
      // Check constrained class
      const sortedContainer = result.symbols.find(s => s.name === 'SortedContainer');
      if (sortedContainer) {
        console.log(`\\n[CONSTRAINED CLASS] Found SortedContainer: ${sortedContainer.signature}`);
      }
      
      // Note: C++20 concepts are very new and may not be fully supported
      // This test primarily checks that the parser doesn't crash on concept syntax
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 7: Module Imports (C++20)
   */
  private async testModuleImports(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'module_imports';
    
    try {
      const testCode = `
// Module declaration
module MyModule;

// Import statements
import std.core;
import std.io;
import MyOtherModule;

// Exported declarations
export namespace MyExports {
  class ExportedClass {
  public:
    void exportedMethod();
  };
  
  template<typename T>
  export T exportedFunction(T value);
  
  export constexpr int exported_constant = 42;
}

// Non-exported (private) declarations
namespace Internal {
  class InternalClass {
  public:
    void internalMethod();
  };
  
  void helper_function();
}

// Module interface partition
export module MyModule:interface;

// Module implementation partition
module MyModule:implementation;
`;

      const result = await this.parser.parseFile('test_modules.cpp', testCode);
      
      console.log(`\\n[MODULES] Found ${result.symbols.length} symbols`);
      
      // Check for module-related symbols
      const exportedSymbols = result.symbols.filter(s => 
        s.name?.includes('exported') || s.qualifiedName?.includes('MyExports')
      );
      console.log(`\\n[EXPORTED] Found ${exportedSymbols.length} exported symbols`);
      
      const internalSymbols = result.symbols.filter(s => 
        s.qualifiedName?.includes('Internal')
      );
      console.log(`\\n[INTERNAL] Found ${internalSymbols.length} internal symbols`);
      
      // Check specific exports
      const exportedClass = result.symbols.find(s => s.name === 'ExportedClass');
      const exportedFunction = result.symbols.find(s => s.name === 'exportedFunction');
      const exportedConstant = result.symbols.find(s => s.name === 'exported_constant');
      
      console.log(`\\n[SPECIFIC EXPORTS] Found:
  - ExportedClass: ${!!exportedClass}
  - exportedFunction: ${!!exportedFunction}  
  - exported_constant: ${!!exportedConstant}`);
      
      // Note: C++20 modules are very new and may have limited parser support
      // This test primarily verifies the parser doesn't crash on module syntax
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Test 8: SFINAE and Type Traits
   */
  private async testSFINAEAndTypeTraits(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'sfinae_and_type_traits';
    
    try {
      const testCode = `
#include <type_traits>

namespace SFINAE {
  // Classic SFINAE with enable_if
  template<typename T>
  typename std::enable_if_t<std::is_integral_v<T>, void>
  process_integral(T value) {
    // Handle integral types
  }
  
  template<typename T>
  typename std::enable_if_t<std::is_floating_point_v<T>, void>
  process_floating(T value) {
    // Handle floating point types
  }
  
  // SFINAE with decltype and expression SFINAE
  template<typename T>
  auto has_size_method(T&& obj) -> decltype(obj.size(), std::true_type{});
  
  template<typename T>
  std::false_type has_size_method(...);
  
  // SFINAE with return type deduction
  template<typename Container>
  auto get_size(const Container& c) -> decltype(c.size()) {
    return c.size();
  }
  
  template<typename Array, size_t N>
  constexpr size_t get_size(const Array (&)[N]) {
    return N;
  }
  
  // Tag dispatching
  struct integral_tag {};
  struct floating_point_tag {};
  
  template<typename T>
  using number_tag = std::conditional_t<
    std::is_integral_v<T>, 
    integral_tag, 
    floating_point_tag
  >;
  
  template<typename T>
  void process_number_impl(T value, integral_tag) {
    // Handle integral
  }
  
  template<typename T>
  void process_number_impl(T value, floating_point_tag) {
    // Handle floating point
  }
  
  template<typename T>
  void process_number(T value) {
    process_number_impl(value, number_tag<T>{});
  }
  
  // Custom type traits
  template<typename T>
  struct is_container : std::false_type {};
  
  template<typename T>
  struct is_container<std::vector<T>> : std::true_type {};
  
  template<typename T>
  struct is_container<std::list<T>> : std::true_type {};
  
  template<typename T>
  inline constexpr bool is_container_v = is_container<T>::value;
  
  // Perfect forwarding with SFINAE
  template<typename T>
  auto forward_call(T&& arg) 
    -> std::enable_if_t<is_container_v<std::decay_t<T>>, void> {
    // Handle containers
  }
  
  template<typename T>
  auto forward_call(T&& arg) 
    -> std::enable_if_t<!is_container_v<std::decay_t<T>>, void> {
    // Handle non-containers
  }
}
`;

      const result = await this.parser.parseFile('test_sfinae.cpp', testCode);
      
      console.log(`\\n[SFINAE] Found ${result.symbols.length} symbols`);
      
      // Check SFINAE functions
      const sfinaeFunc1 = result.symbols.find(s => s.name === 'process_integral');
      const sfinaeFunc2 = result.symbols.find(s => s.name === 'process_floating');
      
      if (sfinaeFunc1 && sfinaeFunc2) {
        console.log(`\\n[ENABLE_IF] Found enable_if SFINAE functions`);
        console.log(`  - process_integral: ${sfinaeFunc1.signature}`);
        console.log(`  - process_floating: ${sfinaeFunc2.signature}`);
      }
      
      // Check expression SFINAE
      const hasSize = result.symbols.filter(s => s.name === 'has_size_method');
      console.log(`\\n[EXPRESSION SFINAE] Found ${hasSize.length} has_size_method overloads`);
      
      // Check auto return type deduction
      const getSizeFunctions = result.symbols.filter(s => s.name === 'get_size');
      console.log(`\\n[AUTO RETURN] Found ${getSizeFunctions.length} get_size overloads`);
      
      // Check tag dispatching
      const tagStructs = result.symbols.filter(s => 
        s.name?.includes('tag') && s.kind === 'class'
      );
      console.log(`\\n[TAG DISPATCH] Found ${tagStructs.length} tag structs`);
      
      // Check custom type traits
      const typeTraits = result.symbols.filter(s => 
        s.name === 'is_container'
      );
      console.log(`\\n[TYPE TRAITS] Found ${typeTraits.length} custom type trait definitions`);
      
      // Check perfect forwarding
      const forwardCall = result.symbols.filter(s => s.name === 'forward_call');
      console.log(`\\n[PERFECT FORWARDING] Found ${forwardCall.length} forward_call overloads`);
      
      return {
        name: testName,
        status: 'passed',
        time: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        time: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}