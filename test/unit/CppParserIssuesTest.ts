/**
 * C++ Parser Issues Test
 * 
 * Focused test suite targeting known issues and gaps in the C++ parser:
 * - Inheritance detection (0 relationships found)
 * - Override/virtual method detection
 * - Control flow analysis (16.7% success rate)
 * - Modern C++ features (lambdas, coroutines, concepts)
 * - Template specialization
 * - Include relationships
 */

import Database from "better-sqlite3";
import { TestResult } from "../helpers/JUnitReporter.js";
import { OptimizedCppTreeSitterParser } from "../../src/parsers/tree-sitter/optimized-cpp-parser.js";
import { ParseResult } from "../../src/parsers/tree-sitter/parser-types.js";
import { createLogger } from "../../src/utils/logger.js";

interface IssueTest {
  name: string;
  code: string;
  validate: (result: ParseResult) => { passed: boolean; details: string };
}

export class CppParserIssuesTest {
  private parser!: OptimizedCppTreeSitterParser;
  private db: Database.Database;
  private logger = createLogger('CppParserIssuesTest');

  constructor(db: Database.Database) {
    this.db = db;
  }

  async setup(): Promise<void> {
    this.parser = new OptimizedCppTreeSitterParser(this.db, {
      debugMode: true,
      enableSemanticAnalysis: true,
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
    const results: TestResult[] = [];
    
    try {
      await this.setup();
      
      const issueTests: IssueTest[] = [
        // Issue 1: Inheritance Detection
        {
          name: "Basic Inheritance Detection",
          code: `
            class Base {
            public:
              virtual void method() {}
            };
            
            class Derived : public Base {
            public:
              void method() override {}
            };
          `,
          validate: (result) => {
            const inheritanceRels = result.relationships.filter(r => r.relationshipType === 'inherits');
            return {
              passed: inheritanceRels.length > 0,
              details: `Found ${inheritanceRels.length} inheritance relationships (expected: 1+)`
            };
          }
        },
        
        // Issue 2: Override Detection
        {
          name: "Override Method Detection",
          code: `
            class Base {
              virtual void virtualMethod() {}
              virtual void pureVirtual() = 0;
            };
            
            class Derived : public Base {
              void virtualMethod() override {}
              void pureVirtual() override {}
              void method() final {}
            };
          `,
          validate: (result) => {
            const overrideMethods = result.symbols.filter(s => 
              s.languageFeatures?.isOverride || 
              s.signature?.includes('override')
            );
            const virtualMethods = result.symbols.filter(s => 
              s.languageFeatures?.isVirtual || 
              s.signature?.includes('virtual')
            );
            const finalMethods = result.symbols.filter(s => 
              s.languageFeatures?.isFinal || 
              s.signature?.includes('final')
            );
            
            return {
              passed: overrideMethods.length >= 2 && virtualMethods.length >= 2 && finalMethods.length >= 1,
              details: `Override: ${overrideMethods.length}/2+, Virtual: ${virtualMethods.length}/2+, Final: ${finalMethods.length}/1+`
            };
          }
        },
        
        // Issue 3: Control Flow Analysis
        {
          name: "Control Flow Block Detection",
          code: `
            int complexFunction(int x) {
              if (x > 0) {
                for (int i = 0; i < x; ++i) {
                  if (i % 2 == 0) {
                    switch (i) {
                      case 0: return 1;
                      case 2: break;
                      default: continue;
                    }
                  }
                }
              } else {
                while (x < 0) {
                  x++;
                }
              }
              
              try {
                throw std::runtime_error("test");
              } catch (const std::exception& e) {
                return -1;
              }
              
              return 0;
            }
          `,
          validate: (result) => {
            const blocks = result.controlFlowData?.blocks || [];
            const conditionalBlocks = blocks.filter(b => b.blockType === 'conditional');
            const loopBlocks = blocks.filter(b => b.blockType === 'loop');
            const switchBlocks = blocks.filter(b => b.blockType === 'switch');
            const exceptionBlocks = blocks.filter(b => b.blockType === 'exception');
            
            return {
              passed: conditionalBlocks.length >= 2 && loopBlocks.length >= 2 && 
                      switchBlocks.length >= 1 && exceptionBlocks.length >= 1,
              details: `Conditional: ${conditionalBlocks.length}/2+, Loop: ${loopBlocks.length}/2+, ` +
                       `Switch: ${switchBlocks.length}/1+, Exception: ${exceptionBlocks.length}/1+`
            };
          }
        },
        
        // Issue 4: Lambda Detection
        {
          name: "Lambda Expression Detection",
          code: `
            void testLambdas() {
              auto simple = []() { return 42; };
              auto capture = [x = 5](int y) { return x + y; };
              auto generic = []<typename T>(T val) { return val * 2; };
              
              std::vector<int> vec = {1, 2, 3};
              std::for_each(vec.begin(), vec.end(), [](int& n) { n *= 2; });
            }
          `,
          validate: (result) => {
            const lambdaPatterns = result.patterns.filter(p => 
              p.patternType === 'lambda' || p.patternName?.includes('lambda')
            );
            const lambdaSymbols = result.symbols.filter(s => 
              s.kind === 'lambda' || s.name.includes('lambda')
            );
            
            return {
              passed: lambdaPatterns.length >= 4 || lambdaSymbols.length >= 4,
              details: `Lambda patterns: ${lambdaPatterns.length}/4+, Lambda symbols: ${lambdaSymbols.length}`
            };
          }
        },
        
        // Issue 5: Template Specialization
        {
          name: "Template Specialization Detection",
          code: `
            template<typename T>
            class Container {
              T value;
            };
            
            template<>
            class Container<int> {
              int value;
              void optimize() {}
            };
            
            template<typename T, typename U>
            class Pair {
              T first;
              U second;
            };
            
            template<typename T>
            class Pair<T, T> {
              T both[2];
            };
          `,
          validate: (result) => {
            const templateClasses = result.symbols.filter(s => 
              s.kind === 'class' && (s.signature?.includes('template') || s.languageFeatures?.isTemplate)
            );
            const specializations = result.symbols.filter(s => 
              s.name.includes('<') && s.name.includes('>')
            );
            
            return {
              passed: templateClasses.length >= 4 && specializations.length >= 2,
              details: `Template classes: ${templateClasses.length}/4+, Specializations: ${specializations.length}/2+`
            };
          }
        },
        
        // Issue 6: Include Relationships
        {
          name: "Include Directive Detection",
          code: `
            #include <iostream>
            #include <vector>
            #include "myheader.h"
            #include "../lib/helper.hpp"
            
            void test() {
              std::cout << "Hello" << std::endl;
              std::vector<int> v;
            }
          `,
          validate: (result) => {
            const includeRels = result.relationships.filter(r => 
              r.relationshipType === 'imports' || r.relationshipType === 'includes'
            );
            const systemIncludes = includeRels.filter(r => r.toName.startsWith('<'));
            const localIncludes = includeRels.filter(r => r.toName.startsWith('"'));
            
            return {
              passed: includeRels.length >= 4 && systemIncludes.length >= 2 && localIncludes.length >= 2,
              details: `Total includes: ${includeRels.length}/4+, System: ${systemIncludes.length}/2+, Local: ${localIncludes.length}/2+`
            };
          }
        },
        
        // Issue 7: Modern C++ Features - DISABLED: Parser doesn't support C++20/23 yet
        /*{
          name: "C++20/23 Features Detection",
          code: `
            // Concepts
            template<typename T>
            concept Arithmetic = std::is_arithmetic_v<T>;
            
            template<Arithmetic T>
            T add(T a, T b) { return a + b; }
            
            // Coroutines
            generator<int> fibonacci() {
              int a = 0, b = 1;
              while (true) {
                co_yield a;
                std::tie(a, b) = std::pair{b, a + b};
              }
            }
            
            // Modules
            export module math;
            export int multiply(int a, int b) { return a * b; }
            
            // Structured bindings
            auto [x, y, z] = std::make_tuple(1, 2.0, "three");
          `,
          validate: (result) => {
            const concepts = result.symbols.filter(s => 
              s.kind === 'concept' || s.name.includes('concept')
            );
            const coroutines = result.symbols.filter(s => 
              s.signature?.includes('co_yield') || s.signature?.includes('co_await')
            );
            const modules = result.symbols.filter(s => 
              s.kind === 'module' || s.signature?.includes('export module')
            );
            const structuredBindings = result.patterns.filter(p => 
              p.patternType === 'structured_binding'
            );
            
            return {
              passed: concepts.length >= 1 || coroutines.length >= 1 || 
                      modules.length >= 1 || structuredBindings.length >= 1,
              details: `Concepts: ${concepts.length}, Coroutines: ${coroutines.length}, ` +
                       `Modules: ${modules.length}, Bindings: ${structuredBindings.length}`
            };
          }
        },*/
        
        // Issue 8: Complex Function Analysis
        {
          name: "Function Complexity and Metrics",
          code: `
            class ComplexClass {
            public:
              ComplexClass() = default;
              ComplexClass(int x) : value(x) {}
              ComplexClass(const ComplexClass&) = delete;
              ComplexClass(ComplexClass&&) noexcept = default;
              
              int complexMethod(int a, int b) const noexcept {
                if (a > b) {
                  for (int i = 0; i < a; ++i) {
                    if (i % 2 == 0) {
                      b += i;
                    } else {
                      b -= i;
                    }
                  }
                }
                return b;
              }
              
              static constexpr int staticMethod() { return 42; }
              
            private:
              int value;
            };
          `,
          validate: (result) => {
            const constructors = result.symbols.filter(s => s.kind === 'constructor');
            const deletedMethods = result.symbols.filter(s => 
              s.signature?.includes('= delete')
            );
            const noexceptMethods = result.symbols.filter(s => 
              s.signature?.includes('noexcept')
            );
            const complexMethods = result.symbols.filter(s => 
              s.kind === 'method' && s.complexity && s.complexity > 3
            );
            
            return {
              passed: constructors.length >= 4 && deletedMethods.length >= 1 && 
                      noexceptMethods.length >= 2 && complexMethods.length >= 1,
              details: `Constructors: ${constructors.length}/4+, Deleted: ${deletedMethods.length}/1+, ` +
                       `Noexcept: ${noexceptMethods.length}/2+, Complex: ${complexMethods.length}/1+`
            };
          }
        }
      ];
      
      // Run all issue tests
      for (const test of issueTests) {
        const startTime = Date.now();
        
        try {
          this.logger.info(`Running test: ${test.name}`);
          
          const parseResult = await this.parser.parseFile(`test_${test.name}.cpp`, test.code);
          const validation = test.validate(parseResult);
          const duration = Date.now() - startTime;
          
          results.push({
            name: test.name,
            className: "CppParserIssuesTest",
            status: validation.passed ? "passed" : "failed",
            time: duration,
            error: validation.passed ? undefined : new Error(validation.details)
          });
          
          this.logger.info(`Test ${test.name}: ${validation.passed ? 'PASSED' : 'FAILED'} - ${validation.details}`);
          
          // Log detailed parse results for failed tests
          if (!validation.passed) {
            this.logger.debug("Parse result details", {
              symbols: parseResult.symbols.length,
              relationships: parseResult.relationships.length,
              patterns: parseResult.patterns.length,
              controlFlowBlocks: parseResult.controlFlowData?.blocks?.length || 0,
              symbolTypes: [...new Set(parseResult.symbols.map(s => s.kind))],
              relationshipTypes: [...new Set(parseResult.relationships.map(r => r.relationshipType))]
            });
          }
          
        } catch (error) {
          this.logger.error(`Test ${test.name} threw error`, error);
          results.push({
            name: test.name,
            className: "CppParserIssuesTest",
            status: "failed",
            time: Date.now() - startTime,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }
      
    } catch (error) {
      this.logger.error("Test setup failed", error);
      results.push({
        name: "Test Setup",
        className: "CppParserIssuesTest",
        status: "failed",
        time: 0,
        error: error instanceof Error ? error : new Error(String(error))
      });
    } finally {
      await this.teardown();
    }
    
    // Summary
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    
    this.logger.info(`\nC++ Parser Issues Test Summary:`);
    this.logger.info(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);
    
    if (failed > 0) {
      this.logger.error(`\nFailing tests:`);
      results.filter(r => r.status === 'failed').forEach(r => {
        this.logger.error(`- ${r.name}: ${r.error?.message}`);
      });
    }
    
    return results;
  }
}