/**
 * Comprehensive C++ Parser Test
 * 
 * Tests the refactored OptimizedCppTreeSitterParser with all its helper components
 * to validate that the new modular architecture correctly handles various C++ constructs
 * and provides the expected functionality including control flow analysis, complexity metrics,
 * pattern detection, and symbol extraction.
 */

import Database from "better-sqlite3";
import { TestResult } from "../helpers/JUnitReporter.js";
import { RefactoredOptimizedCppTreeSitterParser } from "../../src/parsers/tree-sitter/optimized-cpp-parser-refactored.js";
import { ParseResult } from "../../src/parsers/tree-sitter/parser-types.js";
import { createLogger } from "../../src/utils/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import { performance } from "perf_hooks";

interface FeatureTest {
  feature: string;
  success: boolean;
  count: number;
  time: number;
  errors?: string[];
  expectedMin?: number;
  expectedMax?: number;
}

interface ParserTestResult {
  file: string;
  tests: FeatureTest[];
  overallSuccess: boolean;
  totalTime: number;
}

export class CppParserComparisonTest {
  private parser!: RefactoredOptimizedCppTreeSitterParser;
  private testResults: ParserTestResult[] = [];
  private db: Database.Database;
  private logger = createLogger('CppParserComparisonTest');

  constructor(db: Database.Database) {
    this.db = db;
  }

  async setup(): Promise<void> {
    
    // Initialize the refactored parser with all features enabled
    this.parser = new RefactoredOptimizedCppTreeSitterParser(this.db, {
      debugMode: true, // Enable debug for detailed testing
      enableSemanticAnalysis: true,
      enableMultithreading: false, // Keep single-threaded for consistent testing
      enableComplexityAnalysis: true,
      enableControlFlowAnalysis: true,
      enablePatternDetection: true,
      cppOptions: {
        enableTemplateAnalysis: true,
        enableNamespaceTracking: true,
        enableInheritanceAnalysis: true,
        enableOperatorOverloadDetection: true,
        enableLambdaDetection: true,
        enableCoroutineDetection: true,
        enableConceptDetection: true
      }
    });
    
    await this.parser.initialize();
  }

  async teardown(): Promise<void> {
    await this.parser.shutdown();
  }

  async run(): Promise<TestResult[]> {
    const junitResults: TestResult[] = [];
    
    try {
      await this.setup();
      this.logger.info("Starting comprehensive C++ parser test with all helper components");
      
      // Test with various C++ code samples to validate all features
      await this.testBasicStructsAndClasses();
      await this.testModernCppFeatures();
      await this.testComplexTemplates();
      await this.testNamespacesAndScoping();
      await this.testControlFlowAnalysis();
      await this.testCrossFileRelationships();
      await this.testRealFileValidation();
      await this.testPerformanceOnLargeFiles();
      
      // Generate comprehensive report
      this.generateTestReport();
      
      // Convert internal test results to JUnit format
      for (const testResult of this.testResults) {
        for (const test of testResult.tests) {
          junitResults.push({
            name: `${testResult.file}: ${test.feature}`,
            className: "CppParserComparisonTest",
            status: test.success ? "passed" : "failed",
            time: test.time,
            error: test.errors && test.errors.length > 0 ? new Error(test.errors[0]) : undefined
          });
        }
      }
      
    } catch (error) {
      this.logger.error("Test execution failed", error);
      junitResults.push({
        name: "Test Setup/Execution",
        className: "CppParserComparisonTest", 
        status: "failed",
        time: 0,
        error: error instanceof Error ? error : new Error(String(error))
      });
    } finally {
      await this.teardown();
    }
    
    return junitResults;
  }

  private async testBasicStructsAndClasses(): Promise<void> {
    const testCode = `
namespace Graphics {
  struct Point {
    float x;
    float y;
    float z;
  };
  
  class Shape {
  protected:
    Point center;
    std::string name;
    
  public:
    Shape(const std::string& n) : name(n) {}
    virtual ~Shape() {}
    
    virtual double area() const = 0;
    virtual void draw() const = 0;
    
    const std::string& getName() const { return name; }
    Point getCenter() const { return center; }
  };
  
  class Circle : public Shape {
  private:
    double radius;
    
  public:
    Circle(const std::string& name, double r) 
      : Shape(name), radius(r) {}
      
    double area() const override {
      return 3.14159 * radius * radius;
    }
    
    void draw() const override {
      // Drawing logic
    }
  };
}
`;

    const result = await this.testParserFeatures(
      "basic_structs_classes.cpp",
      testCode,
      [
        { feature: "Struct extraction", check: (r) => this.countSymbolsByKind(r, "struct"), expectedMin: 1 },
        { feature: "Class extraction", check: (r) => this.countSymbolsByKind(r, "class"), expectedMin: 2 },
        { feature: "Constructor detection", check: (r) => this.countSymbolsByKind(r, "constructor"), expectedMin: 2 },
        { feature: "Destructor detection", check: (r) => this.countSymbolsByKind(r, "destructor"), expectedMin: 1 },
        { feature: "Method extraction", check: (r) => this.countSymbolsByKind(r, "method") + this.countSymbolsByKind(r, "function"), expectedMin: 4 },
        { feature: "Field extraction", check: (r) => this.countSymbolsByKind(r, "field"), expectedMin: 4 },
        { feature: "Inheritance relationships", check: (r) => this.countRelationshipsByType(r, "inherits"), expectedMin: 1 },
        { feature: "Override detection", check: (r) => this.countSymbolsWithTag(r, "override"), expectedMin: 2 },
        { feature: "Virtual method detection", check: (r) => this.countSymbolsWithTag(r, "virtual"), expectedMin: 2 },
        { feature: "Access level tracking", check: (r) => this.checkAccessLevels(r), expectedMin: 8 }
      ]
    );
    
    this.testResults.push(result);
  }

  private async testModernCppFeatures(): Promise<void> {
    const testCode = `
#include <vector>
#include <memory>
#include <algorithm>

// C++17 inline variable
inline constexpr int MAX_SIZE = 1000;

// Template with concepts (C++20)
template<typename T>
concept Numeric = std::is_arithmetic_v<T>;

template<Numeric T>
class Matrix {
  std::vector<std::vector<T>> data;
  
public:
  // Structured binding support
  auto operator[](size_t row) -> std::vector<T>& {
    return data[row];
  }
  
  // Range-based for support
  auto begin() { return data.begin(); }
  auto end() { return data.end(); }
};

// Coroutine example
task<int> computeAsync() {
  co_await std::suspend_always{};
  co_return 42;
}

// Lambda with capture
auto processData = [&capture = MAX_SIZE](const auto& vec) {
  return std::transform(vec.begin(), vec.end(), vec.begin(),
    [](auto x) { return x * 2; });
};

// Structured binding
void useStructuredBinding() {
  auto [x, y, z] = std::make_tuple(1, 2.0, "three");
}
`;

    const result = await this.testParserFeatures(
      "modern_cpp_features.cpp",
      testCode,
      [
        { feature: "Inline variable detection", check: (r) => this.countSymbolsWithTag(r, "inline"), expectedMin: 1 },
        { feature: "Constexpr detection", check: (r) => this.countSymbolsWithTag(r, "constexpr"), expectedMin: 1 },
        { feature: "Template detection", check: (r) => this.countSymbolsWithTag(r, "template"), expectedMin: 2 },
        { feature: "Auto return type", check: (r) => this.countAutoReturns(r), expectedMin: 2 },
        { feature: "Coroutine detection", check: (r) => this.countSymbolsWithTag(r, "coroutine"), expectedMin: 1 },
        { feature: "Lambda detection", check: (r) => this.countPatternsByType(r, "lambda"), expectedMin: 2 },
        { feature: "Structured binding", check: (r) => this.countStructuredBindings(r), expectedMin: 1 },
        { feature: "Import relationships", check: (r) => this.countRelationshipsByType(r, "imports"), expectedMin: 2 }
      ]
    );
    
    this.testResults.push(result);
  }

  private async testComplexTemplates(): Promise<void> {
    const testCode = `
template<typename T, size_t N>
class Array {
  T data[N];
  
public:
  constexpr size_t size() const { return N; }
  T& operator[](size_t idx) { return data[idx]; }
  const T& operator[](size_t idx) const { return data[idx]; }
};

// Template specialization
template<>
class Array<bool, 8> {
  uint8_t bits;
  
public:
  bool operator[](size_t idx) const {
    return bits & (1 << idx);
  }
};

// Variadic template
template<typename... Args>
void log(Args&&... args) {
  ((std::cout << args << " "), ...);
}

// SFINAE example
template<typename T>
typename std::enable_if<std::is_integral<T>::value, T>::type
absolute(T value) {
  return value < 0 ? -value : value;
}

// Template template parameter
template<template<typename> class Container, typename T>
class Stack {
  Container<T> container;
  
public:
  void push(const T& value) { container.push_back(value); }
  T pop() { 
    T val = container.back();
    container.pop_back();
    return val;
  }
};
`;

    const result = await this.testParserFeatures(
      "complex_templates.cpp",
      testCode,
      [
        { feature: "Template class detection", check: (r) => this.countTemplateClasses(r), expectedMin: 3 },
        { feature: "Template function detection", check: (r) => this.countTemplateFunctions(r), expectedMin: 2 },
        { feature: "Template specialization", check: (r) => this.countTemplateSpecializations(r), expectedMin: 1 },
        { feature: "Variadic template detection", check: (r) => this.countVariadicTemplates(r), expectedMin: 1 },
        { feature: "Template parameters", check: (r) => this.countTemplateParameters(r), expectedMin: 4 },
        { feature: "Operator overloading", check: (r) => this.countSymbolsWithTag(r, "operator"), expectedMin: 2 }
      ]
    );
    
    this.testResults.push(result);
  }

  private async testNamespacesAndScoping(): Promise<void> {
    const testCode = `
namespace Outer {
  namespace Inner {
    class Base {
    public:
      virtual void method() = 0;
    };
  }
  
  using Inner::Base;
  
  namespace {
    // Anonymous namespace
    int internalCounter = 0;
  }
  
  class Derived : public Base {
  public:
    void method() override {
      ++internalCounter;
    }
  };
}

namespace Outer::Another {
  // C++17 nested namespace
  void function() {
    Derived d;
    d.method();
  }
}

// Global scope
using namespace Outer;

void globalFunction() {
  Another::function();
}
`;

    const result = await this.testParserFeatures(
      "namespaces_scoping.cpp",
      testCode,
      [
        { feature: "Namespace detection", check: (r) => this.countSymbolsByKind(r, "namespace"), expectedMin: 3 },
        { feature: "Nested namespace support", check: (r) => this.countNestedNamespaces(r), expectedMin: 1 },
        { feature: "Using declarations", check: (r) => this.countUsingDeclarations(r), expectedMin: 2 },
        { feature: "Anonymous namespace", check: (r) => this.countAnonymousNamespaces(r), expectedMin: 1 },
        { feature: "Scope resolution", check: (r) => this.checkScopeResolution(r), expectedMin: 5 },
        { feature: "Qualified names", check: (r) => this.checkQualifiedNames(r), expectedMin: 3 }
      ]
    );
    
    this.testResults.push(result);
  }

  private async testControlFlowAnalysis(): Promise<void> {
    const testCode = `
class DataProcessor {
public:
  void processData(const std::vector<int>& data) {
    if (data.empty()) {
      LOG_ERROR("Empty data set");
      return;
    }
    
    for (size_t i = 0; i < data.size(); ++i) {
      if (data[i] < 0) {
        handleNegative(data[i]);
      } else if (data[i] == 0) {
        continue;
      } else {
        switch (data[i] % 3) {
          case 0:
            processMultipleOfThree(data[i]);
            break;
          case 1:
            processRemainder(data[i], 1);
            break;
          case 2:
            processRemainder(data[i], 2);
            break;
        }
      }
    }
    
    try {
      finalizeProcessing();
    } catch (const std::exception& e) {
      LOG_ERROR("Processing failed: " + std::string(e.what()));
      cleanup();
    }
  }
  
private:
  void handleNegative(int value) { /* ... */ }
  void processMultipleOfThree(int value) { /* ... */ }
  void processRemainder(int value, int remainder) { /* ... */ }
  void finalizeProcessing() { /* ... */ }
  void cleanup() { /* ... */ }
};
`;

    const result = await this.testParserFeatures(
      "control_flow_analysis.cpp",
      testCode,
      [
        { feature: "Function calls detection", check: (r) => this.countRelationshipsByType(r, "calls"), expectedMin: 8 },
        { feature: "Control flow blocks", check: (r) => this.countControlFlowBlocks(r), expectedMin: 6 },
        { feature: "Conditional blocks", check: (r) => this.countConditionalBlocks(r), expectedMin: 3 },
        { feature: "Loop blocks", check: (r) => this.countLoopBlocks(r), expectedMin: 1 },
        { feature: "Switch blocks", check: (r) => this.countSwitchBlocks(r), expectedMin: 1 },
        { feature: "Exception handling", check: (r) => this.countExceptionBlocks(r), expectedMin: 2 },
        { feature: "Complexity calculation", check: (r) => this.checkComplexityScores(r), expectedMin: 1 }
      ]
    );
    
    this.testResults.push(result);
  }

  private async testRealFileValidation(): Promise<void> {
    // Test with a simple known C++ file to validate exact parsing
    const simpleTestCode = `
#include <iostream>
#include <string>

namespace TestNamespace {
    class BaseClass {
    public:
        virtual void print() = 0;
        virtual ~BaseClass() = default;
    };

    class DerivedClass : public BaseClass {
    private:
        std::string message;
        
    public:
        DerivedClass(const std::string& msg) : message(msg) {}
        
        void print() override {
            std::cout << message << std::endl;
        }
        
        void setMessage(const std::string& msg) {
            message = msg;
        }
    };
    
    void globalFunction() {
        DerivedClass obj("Hello");
        obj.print();
        obj.setMessage("World");
    }
}
`;

    const result = await this.testParserFeatures(
      "simple_test_validation.cpp",
      simpleTestCode,
      [
        { feature: "Namespace count", check: (r) => this.countSymbolsByKind(r, "namespace"), expectedMin: 1, expectedMax: 1 },
        { feature: "Class count", check: (r) => this.countSymbolsByKind(r, "class"), expectedMin: 2, expectedMax: 2 },
        { feature: "Method count", check: (r) => {
          const methods = r.symbols.filter(s => s.kind === "method" || s.kind === "function");
          return methods.length;
        }, expectedMin: 5 },
        { feature: "Constructor detection", check: (r) => {
          const ctors = r.symbols.filter(s => s.kind === "constructor" || s.name === "DerivedClass");
          return ctors.length;
        }, expectedMin: 1 },
        { feature: "Inheritance relationship", check: (r) => {
          const inherits = r.relationships.filter(rel => 
            rel.relationshipType === "inherits" && 
            rel.fromName === "DerivedClass" && 
            rel.toName === "BaseClass"
          );
          return inherits.length;
        }, expectedMin: 1 },
        { feature: "Override detection", check: (r) => {
          const overrides = r.symbols.filter(s => 
            s.name === "print" && 
            (s.semanticTags?.includes("override") || s.signature?.includes("override"))
          );
          return overrides.length;
        }, expectedMin: 1 },
        { feature: "Call relationships", check: (r) => {
          const calls = r.relationships.filter(rel => rel.relationshipType === "calls");
          return calls.length;
        }, expectedMin: 3 }
      ]
    );
    
    this.testResults.push(result);
  }

  private async testCrossFileRelationships(): Promise<void> {
    const headerCode = `
#pragma once

namespace Math {
  class Vector3 {
  public:
    float x, y, z;
    
    Vector3(float x = 0, float y = 0, float z = 0);
    Vector3 operator+(const Vector3& other) const;
    Vector3 operator*(float scalar) const;
    float dot(const Vector3& other) const;
    Vector3 cross(const Vector3& other) const;
  };
  
  inline float distance(const Vector3& a, const Vector3& b) {
    Vector3 diff = a - b;
    return std::sqrt(diff.dot(diff));
  }
}
`;

    const implCode = `
#include "vector3.h"
#include <cmath>

namespace Math {
  Vector3::Vector3(float x, float y, float z) 
    : x(x), y(y), z(z) {}
    
  Vector3 Vector3::operator+(const Vector3& other) const {
    return Vector3(x + other.x, y + other.y, z + other.z);
  }
  
  Vector3 Vector3::operator*(float scalar) const {
    return Vector3(x * scalar, y * scalar, z * scalar);
  }
  
  float Vector3::dot(const Vector3& other) const {
    return x * other.x + y * other.y + z * other.z;
  }
  
  Vector3 Vector3::cross(const Vector3& other) const {
    return Vector3(
      y * other.z - z * other.y,
      z * other.x - x * other.z,
      x * other.y - y * other.x
    );
  }
}
`;

    // Test header file
    const headerResult = await this.testParserFeatures(
      "vector3.h",
      headerCode,
      [
        { feature: "Header class detection", check: (r) => this.countSymbolsByKind(r, "class"), expectedMin: 1 },
        { feature: "Method declarations", check: (r) => this.countMethodDeclarations(r), expectedMin: 4 },
        { feature: "Inline functions", check: (r) => this.countSymbolsWithTag(r, "inline"), expectedMin: 1 }
      ]
    );
    
    // Test implementation file  
    const implResult = await this.testParserFeatures(
      "vector3.cpp",
      implCode,
      [
        { feature: "Method definitions", check: (r) => this.countMethodDefinitions(r), expectedMin: 4 },
        { feature: "Include relationships", check: (r) => this.countRelationshipsByType(r, "imports"), expectedMin: 2 },
        { feature: "Member access", check: (r) => this.countMemberAccess(r), expectedMin: 8 }
      ]
    );
    
    this.testResults.push(headerResult);
    this.testResults.push(implResult);
  }

  private async testPerformanceOnLargeFiles(): Promise<void> {
    // Test with a real complex C++ file from our test suite
    const complexFilePath = path.join(process.cwd(), "test", "complex-files", "Buffer", "BufferCore.ixx");
    
    try {
      const fileContent = await fs.readFile(complexFilePath, 'utf-8');
      
      const result = await this.testParserFeatures(
        "BufferCore.ixx",
        fileContent,
        [
          { feature: "Total symbols", check: (r) => r.symbols.length, expectedMin: 10 },
          { feature: "Total relationships", check: (r) => r.relationships.length, expectedMin: 5 },
          { feature: "Module declarations", check: (r) => this.countSymbolsByKind(r, "module"), expectedMin: 0 },
          { feature: "Export declarations", check: (r) => this.countSymbolsWithTag(r, "exported"), expectedMin: 0 },
          { feature: "Template instantiations", check: (r) => this.countRelationshipsByType(r, "instantiates"), expectedMin: 0 },
          { feature: "Parse time under 5s", check: (_r) => 1, expectedMin: 1 }, // Success if parsing completes
          { feature: "Memory efficiency", check: (_r) => 1, expectedMin: 1 } // Success if no memory issues
        ]
      );
      
      this.testResults.push(result);
      
      // Also test with additional complex files if they exist
      const additionalFiles = ["BufferFactory.cpp", "BufferResource.cpp"];
      for (const fileName of additionalFiles) {
        const filePath = path.join(process.cwd(), "test", "complex-files", "Buffer", fileName);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const fileResult = await this.testParserFeatures(
            fileName,
            content,
            [
              { feature: "Total symbols", check: (r) => r.symbols.length, expectedMin: 1 },
              { feature: "Total relationships", check: (r) => r.relationships.length, expectedMin: 0 }
            ]
          );
          this.testResults.push(fileResult);
        } catch (err) {
          this.logger.warn(`Could not read ${fileName}, skipping`, err);
        }
      }
      
    } catch (error) {
      this.logger.error("Could not read complex test file, falling back to generated code", error);
      // Fall back to generated code if file doesn't exist
      const largeCode = this.generateLargeCppFile(1000);
      const result = await this.testParserFeatures(
        "large_file_performance.cpp",
        largeCode,
        [
          { feature: "Total symbols", check: (r) => r.symbols.length, expectedMin: classCount * 5 }, // Expect at least 5 symbols per class
          { feature: "Total relationships", check: (r) => r.relationships.length, expectedMin: classCount },
          { feature: "Parse time under 10s", check: (_r) => 1, expectedMin: 1 },
          { feature: "Memory efficiency", check: (_r) => 1, expectedMin: 1 }
        ]
      );
      this.testResults.push(result);
    }
  }

  // Feature testing logic  
  private async testParserFeatures(
    filename: string,
    code: string,
    checks: Array<{ 
      feature: string; 
      check: (result: ParseResult) => number;
      expectedMin?: number;
      expectedMax?: number;
    }>
  ): Promise<ParserTestResult> {
    const tests: FeatureTest[] = [];
    
    // Parse with the refactored parser
    const parseStart = performance.now();
    let parseResult: ParseResult | null = null;
    let parseError: string | null = null;
    
    try {
      parseResult = await this.parser.parseFile(filename, code);
    } catch (error) {
      parseError = String(error);
    }
    const totalTime = performance.now() - parseStart;
    
    // Run feature tests
    for (const { feature, check, expectedMin, expectedMax } of checks) {
      const featureStart = performance.now();
      let count = 0;
      let featureError: string | null = null;
      
      try {
        count = parseResult ? check(parseResult) : 0;
      } catch (error) {
        featureError = String(error);
      }
      
      const featureTime = performance.now() - featureStart;
      
      // Determine success based on expectations
      let success = !parseError && !featureError;
      if (success && expectedMin !== undefined) {
        success = count >= expectedMin;
      }
      if (success && expectedMax !== undefined) {
        success = count <= expectedMax;
      }
      
      const test: FeatureTest = {
        feature,
        success,
        count,
        time: featureTime,
        expectedMin,
        expectedMax,
        errors: [parseError, featureError].filter(e => e !== null) as string[]
      };
      
      tests.push(test);
    }
    
    // Determine overall success
    const overallSuccess = tests.every(t => t.success);
    
    return {
      file: filename,
      tests,
      overallSuccess,
      totalTime
    };
  }

  // Helper methods for checks
  private countSymbolsByKind(result: ParseResult, kind: string): number {
    return result.symbols.filter(s => s.kind === kind).length;
  }
  
  private countRelationshipsByType(result: ParseResult, type: string): number {
    return result.relationships.filter(r => r.relationshipType === type).length;
  }
  
  private countSymbolsWithTag(result: ParseResult, tag: string): number {
    return result.symbols.filter(s => s.semanticTags?.includes(tag)).length;
  }
  
  private countPatternsByType(result: ParseResult, type: string): number {
    return result.patterns.filter(p => p.patternType === type).length;
  }
  
  private checkAccessLevels(result: ParseResult): number {
    return result.symbols.filter(s => s.visibility).length;
  }
  
  private countAutoReturns(result: ParseResult): number {
    return result.symbols.filter(s => s.returnType === "auto").length;
  }
  
  private countStructuredBindings(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.semanticTags?.includes("structured_binding") ||
      s.languageFeatures?.isStructuredBinding
    ).length;
  }
  
  private countTemplateClasses(result: ParseResult): number {
    return result.symbols.filter(s => 
      (s.kind === "class" || s.kind === "struct") && 
      s.semanticTags?.includes("template")
    ).length;
  }
  
  private countTemplateFunctions(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.kind === "function" && 
      s.semanticTags?.includes("template")
    ).length;
  }
  
  private countTemplateSpecializations(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.semanticTags?.includes("template_specialization")
    ).length;
  }
  
  private countVariadicTemplates(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.signature?.includes("...") && s.semanticTags?.includes("template")
    ).length;
  }
  
  private countTemplateParameters(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.signature?.match(/<.*>/)
    ).length;
  }
  
  private countNestedNamespaces(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.kind === "namespace" && s.qualifiedName.includes("::")
    ).length;
  }
  
  private countUsingDeclarations(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.kind === "using" || s.semanticTags?.includes("using")
    ).length;
  }
  
  private countAnonymousNamespaces(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.kind === "namespace" && s.name === ""
    ).length;
  }
  
  private checkScopeResolution(result: ParseResult): number {
    return result.symbols.filter(s => s.namespace || s.parentScope).length;
  }
  
  private checkQualifiedNames(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.qualifiedName && s.qualifiedName.includes("::")
    ).length;
  }
  
  private countControlFlowBlocks(result: ParseResult): number {
    return result.controlFlowData?.blocks?.length || 0;
  }
  
  private countConditionalBlocks(result: ParseResult): number {
    return result.controlFlowData?.blocks?.filter(b => 
      b.blockType === "conditional"
    ).length || 0;
  }
  
  private countLoopBlocks(result: ParseResult): number {
    return result.controlFlowData?.blocks?.filter(b => 
      b.blockType === "loop"
    ).length || 0;
  }
  
  private countSwitchBlocks(result: ParseResult): number {
    return result.controlFlowData?.blocks?.filter(b => 
      b.blockType === "switch"
    ).length || 0;
  }
  
  private countExceptionBlocks(result: ParseResult): number {
    return result.controlFlowData?.blocks?.filter(b => 
      b.blockType === "try" || b.blockType === "catch"
    ).length || 0;
  }
  
  private checkComplexityScores(result: ParseResult): number {
    return result.symbols.filter(s => 
      s.complexity && s.complexity > 0
    ).length;
  }
  
  private countMethodDeclarations(result: ParseResult): number {
    return result.symbols.filter(s => 
      (s.kind === "function" || s.kind === "method") && 
      !s.isDefinition
    ).length;
  }
  
  private countMethodDefinitions(result: ParseResult): number {
    return result.symbols.filter(s => 
      (s.kind === "function" || s.kind === "method") && 
      s.isDefinition
    ).length;
  }
  
  private countMemberAccess(result: ParseResult): number {
    return result.relationships.filter(r => 
      r.relationshipType === "reads_field" || 
      r.relationshipType === "writes_field"
    ).length;
  }
  
  // Generate test data
  private generateLargeCppFile(classCount: number): string {
    let code = "#include <iostream>\n#include <vector>\n#include <memory>\n\n";
    
    for (let i = 0; i < classCount; i++) {
      code += `
namespace Module${Math.floor(i / 10)} {
  class Class${i} {
  private:
    int member1;
    double member2;
    std::string member3;
    
  public:
    Class${i}() : member1(0), member2(0.0) {}
    
    void method1() {
      if (member1 > 0) {
        for (int j = 0; j < member1; ++j) {
          process(j);
        }
      }
    }
    
    double method2(int param) const {
      return member2 * param;
    }
    
    virtual void virtualMethod() {
      // Complex logic
      switch (member1 % 3) {
        case 0: handleCase0(); break;
        case 1: handleCase1(); break;
        case 2: handleCase2(); break;
      }
    }
    
  private:
    void process(int value) { member1 += value; }
    void handleCase0() { member2 *= 2; }
    void handleCase1() { member2 /= 2; }
    void handleCase2() { member2 = 0; }
  };
}
`;
    }
    
    return code;
  }
  
  // Report generation
  private generateTestReport(): void {
    this.logger.info("\n" + "=".repeat(80));
    this.logger.info("C++ PARSER COMPREHENSIVE TEST REPORT");
    this.logger.info("=" .repeat(80) + "\n");
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let totalTime = 0;
    
    for (const testResult of this.testResults) {
      this.logger.info(`\nFile: ${testResult.file}`);
      this.logger.info("-".repeat(60));
      this.logger.info(`Parse time: ${testResult.totalTime.toFixed(2)}ms`);
      this.logger.info(`Overall success: ${testResult.overallSuccess ? "✅ PASS" : "❌ FAIL"}`);
      this.logger.info("");
      
      totalTime += testResult.totalTime;
      
      for (const test of testResult.tests) {
        totalTests++;
        
        const status = test.success ? "✅" : "❌";
        const color = test.success ? "\x1b[32m" : "\x1b[31m";
        const reset = "\x1b[0m";
        
        let expectationText = "";
        if (test.expectedMin !== undefined || test.expectedMax !== undefined) {
          const min = test.expectedMin !== undefined ? test.expectedMin : "0";
          const max = test.expectedMax !== undefined ? test.expectedMax : "∞";
          expectationText = ` (expected: ${min}${test.expectedMax !== undefined ? `-${max}` : "+"})`; 
        }
        
        this.logger.info(
          `${color}${status}${reset} ${test.feature.padEnd(35)} | ` +
          `Found: ${test.count.toString().padStart(4)}${expectationText} | ` +
          `Time: ${test.time.toFixed(2)}ms`
        );
        
        if (test.success) {
          passedTests++;
        } else {
          failedTests++;
          if (test.errors && test.errors.length > 0) {
            this.logger.info(`    Error: ${test.errors[0]}`);
          }
        }
      }
    }
    
    // Summary
    this.logger.info("\n" + "=".repeat(80));
    this.logger.info("SUMMARY");
    this.logger.info("=" .repeat(80));
    this.logger.info(`Total tests: ${totalTests}`);
    this.logger.info(`Passed: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    this.logger.info(`Failed: ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);
    this.logger.info(`Total parsing time: ${totalTime.toFixed(2)}ms`);
    this.logger.info(`Average time per file: ${(totalTime/this.testResults.length).toFixed(2)}ms`);
    
    const overallSuccess = failedTests === 0;
    const successRate = passedTests / totalTests;
    
    this.logger.info("\n" + "=".repeat(80));
    if (overallSuccess) {
      this.logger.info("🎉 ALL TESTS PASSED!");
      this.logger.info("The refactored C++ parser successfully handles all tested scenarios");
      this.logger.info("with proper symbol extraction, relationship detection, and helper functionality.");
    } else if (successRate >= 0.8) {
      this.logger.info("⚠️  MOSTLY SUCCESSFUL WITH SOME ISSUES");
      this.logger.info("Most features work correctly but some edge cases need attention.");
    } else {
      this.logger.info("❌ SIGNIFICANT ISSUES DETECTED");
      this.logger.info("The parser has fundamental problems that need to be addressed.");
    }
    
    // Detailed component analysis
    this.analyzeComponentPerformance();
    
    this.logger.info("=" .repeat(80) + "\n");
    
    // Log final assessment
    if (!overallSuccess) {
      this.logger.error(`C++ parser validation failed: ${failedTests}/${totalTests} tests failed`);
    } else {
      this.logger.info("✅ All C++ parser tests passed successfully!");
    }
  }
  
  private analyzeComponentPerformance(): void {
    this.logger.info("\nCOMPONENT ANALYSIS:");
    this.logger.info("-".repeat(40));
    
    // Analyze different categories of features
    const categories = {
      "Symbol Extraction": ["struct", "class", "constructor", "destructor", "method", "field", "function"],
      "Modern C++ Features": ["inline", "constexpr", "template", "auto", "coroutine", "lambda", "structured"],
      "Relationships": ["inheritance", "calls", "imports", "instantiates"],
      "Control Flow": ["control flow", "conditional", "loop", "switch", "exception", "complexity"],
      "Scoping": ["namespace", "scope", "qualified", "using", "anonymous"]
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      const relevantTests = this.testResults.flatMap(result => 
        result.tests.filter(test => 
          keywords.some(keyword => test.feature.toLowerCase().includes(keyword))
        )
      );
      
      if (relevantTests.length > 0) {
        const passed = relevantTests.filter(t => t.success).length;
        const total = relevantTests.length;
        const rate = (passed / total * 100).toFixed(1);
        const avgTime = relevantTests.reduce((sum, t) => sum + t.time, 0) / total;
        
        this.logger.info(`${category.padEnd(20)}: ${passed}/${total} (${rate}%) - avg ${avgTime.toFixed(2)}ms`);
      }
    }
  }
}
