#!/usr/bin/env tsx

/**
 * Test script to identify missing C++ features
 * Run with: tsx test-missing-cpp-features.ts
 */

import Database from 'better-sqlite3';
import { OptimizedCppTreeSitterParser } from './dist/parsers/tree-sitter/optimized-cpp-parser.js';

async function testMissingFeatures() {
  console.log('🔍 Testing Missing C++ Features\n');
  
  // Create in-memory database
  const db = new Database(':memory:');
  const parser = new OptimizedCppTreeSitterParser(db, { debugMode: true });
  await parser.initialize();

  const testCases = [
    {
      name: "Type Aliases",
      code: `
        using MyInt = int;
        using StringMap = std::map<std::string, int>;
        using ComplexType = std::vector<std::unique_ptr<MyClass>>;
        typedef int OldStyle;
      `,
      expectSymbols: ['MyInt', 'StringMap', 'ComplexType', 'OldStyle']
    },
    
    {
      name: "Structured Bindings", 
      code: `
        auto [x, y] = std::make_pair(1, 2);
        auto [a, b, c] = std::make_tuple(1, 2.0, "hello");
        auto& [ref_x, ref_y] = some_pair;
      `,
      expectSymbols: ['x', 'y', 'a', 'b', 'c', 'ref_x', 'ref_y']
    },
    
    {
      name: "Inline Variables",
      code: `
        inline constexpr int VERSION = 42;
        inline const std::string NAME = "test";
        inline thread_local int tls_var = 0;
      `,
      expectSymbols: ['VERSION', 'NAME', 'tls_var']
    },
    
    {
      name: "Concept Definitions",
      code: `
        template<typename T>
        concept Integral = std::is_integral_v<T>;
        
        template<typename T>
        concept Comparable = requires(T a, T b) {
          { a < b } -> std::convertible_to<bool>;
        };
      `,
      expectSymbols: ['Integral', 'Comparable']
    },
    
    {
      name: "Module Syntax",
      code: `
        export module MyModule;
        import std.core;
        import MyOtherModule;
        
        export namespace MyExports {
          class ExportedClass {};
        }
      `,
      expectSymbols: ['MyModule', 'MyExports', 'ExportedClass']
    }
  ];

  for (const testCase of testCases) {
    console.log(`\\n📋 Testing: ${testCase.name}`);
    console.log(`Expected symbols: ${testCase.expectSymbols.join(', ')}`);
    
    try {
      const result = await parser.parseFile(`test_${testCase.name.toLowerCase().replace(' ', '_')}.cpp`, testCase.code);
      
      const foundSymbols = result.symbols.map(s => s.name);
      const foundCount = testCase.expectSymbols.filter(expected => 
        foundSymbols.includes(expected)
      ).length;
      
      console.log(`Found symbols: ${foundSymbols.join(', ') || 'none'}`);
      console.log(`Detection rate: ${foundCount}/${testCase.expectSymbols.length} (${Math.round(foundCount/testCase.expectSymbols.length*100)}%)`);
      
      if (foundCount === 0) {
        console.log('❌ NO SYMBOLS DETECTED');
      } else if (foundCount < testCase.expectSymbols.length) {
        console.log(`⚠️  PARTIAL DETECTION`);
      } else {
        console.log('✅ ALL SYMBOLS DETECTED');
      }
      
    } catch (error) {
      console.log(`❌ PARSING ERROR: ${error}`);
    }
  }
  
  console.log('\\n🎯 Summary: Run this script to identify which features need parser improvements');
}

testMissingFeatures().catch(console.error);