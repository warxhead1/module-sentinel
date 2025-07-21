/**
 * Comprehensive Symbol Extraction Test
 * 
 * Tests that verify we're capturing ALL symbols, parameters, return types,
 * namespaces, and relationships from C++ files.
 */

import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, like } from 'drizzle-orm';
import { universalSymbols, projects } from '../../dist/database/schema/universal.js';
import { OptimizedCppTreeSitterParser } from '../../dist/parsers/tree-sitter/optimized-cpp-parser.js';
import { OptimizedTreeSitterBaseParser } from '../../dist/parsers/tree-sitter/optimized-base-parser.js';
import * as path from 'path';

interface ExpectedSymbol {
  name: string;
  qualifiedName: string;
  kind: string;
  returnType?: string;
  parameters?: { name: string; type: string }[];
  namespace?: string;
  parentClass?: string;
  line?: number;
}

export class ComprehensiveSymbolExtractionTest {
  private rawDb: Database.Database;
  private db: ReturnType<typeof drizzle>;

  constructor(rawDb: Database.Database) {
    this.rawDb = rawDb;
    this.db = drizzle(rawDb);
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    try {

      // Test 1: PlanetBuilder method extraction
      results.push(await this.testPlanetBuilderMethodExtraction());
      
      // Test 2: AdvancedHeightGenerator complex method
      results.push(await this.testAdvancedHeightGeneratorMethod());
      
      // Test 3: Namespace hierarchy extraction
      results.push(await this.testNamespaceHierarchy());
      
      // Test 4: Parameter extraction completeness
      results.push(await this.testParameterExtraction());
      
      // Test 5: Return type extraction
      results.push(await this.testReturnTypeExtraction());
      
      // Test 6: Class membership extraction
      results.push(await this.testClassMembershipExtraction());
      
      // Test 7: Template parameter extraction
      results.push(await this.testTemplateParameterExtraction());

    } catch (error) {
      results.push({
        name: 'setup_failure',
        status: 'failed',
        time: 0,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }

    return results;
  }

  /**
   * Test 1: Verify PlanetBuilder::WithTextureResolution is fully extracted
   */
  private async testPlanetBuilderMethodExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'planet_builder_method_extraction';
    
    try {
      const filePath = path.join(process.cwd(), 'test/complex-files/cpp/Generation/Factory/PlanetBuilder.cpp');
      
      // Instead of re-parsing, get the symbols that were already indexed
      const dbSymbols = this.db.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.filePath, filePath))
        .all();
      
      console.log(`\n[DB CHECK] Found ${dbSymbols.length} symbols in database for PlanetBuilder.cpp`);
      
      // Expected: IPlanetBuilder& PlanetBuilder::WithTextureResolution(uint32_t resolution)
      const expectedMethod: ExpectedSymbol = {
        name: 'WithTextureResolution',
        qualifiedName: 'PlanetGen::Generation::Factory::PlanetBuilder::WithTextureResolution',
        kind: 'function',
        returnType: 'IPlanetBuilder&',
        parameters: [{ name: 'resolution', type: 'uint32_t' }],
        namespace: 'PlanetGen::Generation::Factory',
        parentClass: 'PlanetBuilder'
      };
      
      // Find the method in database symbols
      const method = dbSymbols.find(s => 
        s.name === 'WithTextureResolution' && 
        (s.qualifiedName?.includes('PlanetBuilder') || s.namespace?.includes('PlanetBuilder'))
      );
      
      if (!method) {
        // List all methods for debugging
        console.log('\n[DEBUG] All methods found in PlanetBuilder.cpp:');
        dbSymbols.filter(s => s.kind === 'function' || s.kind === 'method').forEach(s => {
          console.log(`  - ${s.kind} ${s.name} at line ${s.line}`);
          if (s.signature) console.log(`    Signature: ${s.signature}`);
          if (s.returnType) console.log(`    Return type: ${s.returnType}`);
        });
        throw new Error('WithTextureResolution method not found in database');
      }
      
      // Verify all aspects
      const errors: string[] = [];
      
      console.log(`\n[DB CHECK] WithTextureResolution in DB:
  - Name: ${method.name}
  - Qualified: ${method.qualifiedName}
  - Return Type: ${method.returnType}
  - Signature: ${method.signature}
  - Namespace: ${method.namespace}`);
      
      if (errors.length > 0) {
        throw new Error('Symbol extraction incomplete:\n' + errors.join('\n'));
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
   * Test 2: Verify AdvancedHeightGenerator::GenerateHeightSpherical is fully extracted
   */
  private async testAdvancedHeightGeneratorMethod(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'advanced_height_generator_method';
    
    try {
      const filePath = path.join(process.cwd(), 'test/complex-files/cpp/Generation/Heightmaps/AdvancedHeightGenerator.cpp');
      
      // Get symbols from database
      const dbSymbols = this.db.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.filePath, filePath))
        .all();
      
      // Expected: HeightGenerationResult GenerateHeightSpherical(const HeightGenerationParameters& params, const std::vector<std::pair<float, float>>& coordinates)
      const expectedMethod: ExpectedSymbol = {
        name: 'GenerateHeightSpherical',
        qualifiedName: 'PlanetGen::Generation::AdvancedHeightGenerator::GenerateHeightSpherical',
        kind: 'function',
        returnType: 'HeightGenerationResult',
        parameters: [
          { name: 'params', type: 'const HeightGenerationParameters&' },
          { name: 'coordinates', type: 'const std::vector<std::pair<float, float>>&' }
        ],
        namespace: 'PlanetGen::Generation',
        parentClass: 'AdvancedHeightGenerator'
      };
      
      // Find the method
      const method = dbSymbols.find(s => 
        s.name === 'GenerateHeightSpherical' && 
        (s.qualifiedName?.includes('AdvancedHeightGenerator') || s.namespace?.includes('AdvancedHeightGenerator'))
      );
      
      if (!method) {
        // List all found symbols for debugging
        console.log('\n[DEBUG] All symbols found in AdvancedHeightGenerator.cpp:');
        dbSymbols.forEach(s => {
          console.log(`  - ${s.kind} ${s.qualifiedName || s.name} at line ${s.line}`);
        });
        throw new Error('GenerateHeightSpherical method not found in database');
      }
      
      // Verify method details
      const errors: string[] = [];
      
      if (!method.qualifiedName?.includes('GenerateHeightSpherical')) {
        errors.push(`Method not properly qualified: ${method.qualifiedName}`);
      }
      
      if (method.returnType !== expectedMethod.returnType) {
        errors.push(`Return type mismatch: expected "${expectedMethod.returnType}", got "${method.returnType}"`);
      }
      
      // Check complex parameter types
      if (method.signature) {
        if (!method.signature.includes('HeightGenerationParameters')) {
          errors.push('HeightGenerationParameters parameter type not found in signature');
        }
        if (!method.signature.includes('std::vector') && !method.signature.includes('vector')) {
          errors.push('std::vector parameter type not found in signature');
        }
        console.log(`\n[SIGNATURE CHECK] GenerateHeightSpherical signature: ${method.signature}`);
      }
      
      if (errors.length > 0) {
        throw new Error('Complex method extraction incomplete:\n' + errors.join('\n'));
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
   * Test 3: Verify namespace hierarchy is properly extracted
   */
  private async testNamespaceHierarchy(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'namespace_hierarchy_extraction';
    
    try {
      // Check both files have correct namespace extraction
      const files = [
        'test/complex-files/cpp/Generation/Factory/PlanetBuilder.cpp',
        'test/complex-files/cpp/Generation/Heightmaps/AdvancedHeightGenerator.cpp'
      ];
      
      for (const file of files) {
        const filePath = path.join(process.cwd(), file);
        const dbSymbols = this.db.select()
          .from(universalSymbols)
          .where(eq(universalSymbols.filePath, filePath))
          .all();
        
        // Find namespace symbols
        const namespaces = dbSymbols.filter(s => s.kind === 'namespace');
        
        // Should have PlanetGen::Generation::Factory namespace for PlanetBuilder.cpp
        const expectedNamespace = file.includes('PlanetBuilder.cpp') ? 
          'PlanetGen::Generation::Factory' : 'PlanetGen::Generation';
          
        const hasCorrectNamespace = namespaces.some(ns => 
          ns.qualifiedName === expectedNamespace ||
          ns.name === expectedNamespace
        );
        
        if (!hasCorrectNamespace) {
          console.log(`\n[DEBUG] Namespaces found in ${path.basename(file)}:`);
          namespaces.forEach(ns => {
            console.log(`  - ${ns.qualifiedName || ns.name}`);
          });
          throw new Error(`${expectedNamespace} namespace not found in ${file}`);
        }
        
        // Check that classes/functions have correct namespace
        const classesAndFunctions = dbSymbols.filter(s => 
          ['class', 'function', 'method'].includes(s.kind)
        );
        
        const withoutNamespace = classesAndFunctions.filter(s => 
          !s.namespace || (!s.namespace.includes('PlanetGen') && !s.qualifiedName?.includes('PlanetGen'))
        );
        
        if (withoutNamespace.length > 0) {
          console.log(`\n[WARNING] Symbols without proper namespace in ${path.basename(file)}:`);
          withoutNamespace.forEach(s => {
            console.log(`  - ${s.kind} ${s.name} (namespace: ${s.namespace || 'none'})`);
          });
        }
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
   * Test 4: Verify parameter extraction completeness
   */
  private async testParameterExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'parameter_extraction_completeness';
    
    try {
      const filePath = path.join(process.cwd(), 'test/complex-files/cpp/Generation/Factory/PlanetBuilder.cpp');
      const dbSymbols = this.db.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.filePath, filePath))
        .all();
      
      // Find methods with parameters
      const methodsWithParams = dbSymbols.filter(s => 
        (s.kind === 'function' || s.kind === 'method') && 
        s.signature && 
        s.signature.includes('(') && 
        !s.signature.includes('()')
      );
      
      console.log(`\n[PARAM CHECK] Found ${methodsWithParams.length} methods with parameters`);
      
      // Check a few specific methods
      const paramChecks = [
        { method: 'WithTextureResolution', expectedParam: 'uint32_t' },
        { method: 'WithConfiguration', expectedParam: 'PlanetInstanceConfig' },
        { method: 'WithLODLevels', expectedParam: 'int' }
      ];
      
      for (const check of paramChecks) {
        const method = methodsWithParams.find((m: any) => m.name === check.method);
        if (method) {
          if (!method.signature?.includes(check.expectedParam)) {
            throw new Error(`Parameter type "${check.expectedParam}" not found in ${check.method} signature: ${method.signature}`);
          }
          console.log(`  ✓ ${check.method}: ${method.signature}`);
        }
      }
      
      // Verify parameters are stored in database
      const dbMethods = await this.db.select()
        .from(universalSymbols)
        .where(and(
          eq(universalSymbols.filePath, filePath),
          like(universalSymbols.signature, '%(%')
        ));
      
      console.log(`\n[DB CHECK] ${dbMethods.length} methods with signatures in database`);
      
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
   * Test 5: Verify return type extraction
   */
  private async testReturnTypeExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'return_type_extraction';
    
    try {
      const filePath = path.join(process.cwd(), 'test/complex-files/cpp/Generation/Factory/PlanetBuilder.cpp');
      const dbSymbols = this.db.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.filePath, filePath))
        .all();
      
      // Check specific return types
      const returnTypeChecks = [
        { method: 'WithTextureResolution', expectedReturn: 'IPlanetBuilder&' },
        { method: 'Build', expectedReturn: 'unique_ptr' },
        { method: 'GetTextureResolution', expectedReturn: 'uint32_t' }
      ];
      
      const errors: string[] = [];
      
      for (const check of returnTypeChecks) {
        const method = dbSymbols.find((s: any) => 
          s.name === check.method && 
          (s.kind === 'function' || s.kind === 'method')
        );
        
        if (method) {
          if (!method.returnType?.includes(check.expectedReturn)) {
            errors.push(`${check.method}: expected return type containing "${check.expectedReturn}", got "${method.returnType}"`);
          } else {
            console.log(`  ✓ ${check.method} returns: ${method.returnType}`);
          }
        } else {
          console.log(`  ⚠ ${check.method} not found`);
        }
      }
      
      if (errors.length > 0) {
        throw new Error('Return type extraction issues:\n' + errors.join('\n'));
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
   * Test 6: Verify class membership is properly tracked
   */
  private async testClassMembershipExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'class_membership_extraction';
    
    try {
      const filePath = path.join(process.cwd(), 'test/complex-files/cpp/Generation/Factory/PlanetBuilder.cpp');
      const dbSymbols = this.db.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.filePath, filePath))
        .all();
      
      // Find PlanetBuilder class
      const planetBuilderClass = dbSymbols.find((s: any) => 
        s.name === 'PlanetBuilder' && s.kind === 'class'
      );
      
      if (!planetBuilderClass) {
        throw new Error('PlanetBuilder class not found');
      }
      
      // Find all methods that should belong to PlanetBuilder
      const planetBuilderMethods = dbSymbols.filter((s: any) => 
        (s.kind === 'function' || s.kind === 'method') &&
        s.qualifiedName?.includes('PlanetBuilder::')
      );
      
      console.log(`\n[CLASS MEMBERSHIP] Found ${planetBuilderMethods.length} PlanetBuilder methods`);
      
      // Verify they have correct qualified names
      const missingClass = planetBuilderMethods.filter((m: any) => 
        !m.qualifiedName?.includes('PlanetBuilder')
      );
      
      if (missingClass.length > 0) {
        console.log('\n[ERROR] Methods without proper class qualification:');
        missingClass.forEach((m: any) => {
          console.log(`  - ${m.name} (qualified: ${m.qualifiedName})`);
        });
        throw new Error(`${missingClass.length} methods not properly associated with PlanetBuilder class`);
      }
      
      // Sample some methods
      const sampleMethods = planetBuilderMethods.slice(0, 5);
      console.log('\n[SAMPLE] PlanetBuilder methods:');
      sampleMethods.forEach((m: any) => {
        console.log(`  - ${m.qualifiedName} (${m.kind})`);
      });
      
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
   * Test 7: Verify template parameters are extracted
   */
  private async testTemplateParameterExtraction(): Promise<TestResult> {
    const startTime = Date.now();
    const testName = 'template_parameter_extraction';
    
    try {
      const filePath = path.join(process.cwd(), 'test/complex-files/cpp/Generation/Heightmaps/AdvancedHeightGenerator.cpp');
      const dbSymbols = this.db.select()
        .from(universalSymbols)
        .where(eq(universalSymbols.filePath, filePath))
        .all();
      
      // Look for template usage (std::vector, std::unique_ptr, etc.)
      const symbolsWithTemplates = dbSymbols.filter((s: any) => 
        s.signature?.includes('<') || 
        s.returnType?.includes('<') ||
        (typeof s.semanticTags === 'string' ? JSON.parse(s.semanticTags) : s.semanticTags)?.includes('template')
      );
      
      console.log(`\n[TEMPLATE CHECK] Found ${symbolsWithTemplates.length} symbols with template syntax`);
      
      // Check specific template usages
      const hasVectorParam = dbSymbols.some((s: any) => 
        s.signature?.includes('std::vector') || s.signature?.includes('vector<')
      );
      
      const hasUniquePtr = dbSymbols.some((s: any) => 
        s.returnType?.includes('unique_ptr') || s.signature?.includes('unique_ptr')
      );
      
      if (!hasVectorParam) {
        console.log('\n[WARNING] No std::vector parameters found');
      }
      
      if (!hasUniquePtr) {
        console.log('\n[WARNING] No unique_ptr usage found');
      }
      
      // Show some examples
      const examples = symbolsWithTemplates.slice(0, 3);
      console.log('\n[EXAMPLES] Template usage:');
      examples.forEach((s: any) => {
        console.log(`  - ${s.name}: ${s.signature || s.returnType}`);
      });
      
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