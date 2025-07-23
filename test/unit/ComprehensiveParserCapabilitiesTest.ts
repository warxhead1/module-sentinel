/**
 * Comprehensive Parser Capabilities Test
 * 
 * This test systematically evaluates Module Sentinel's parser capabilities
 * across all supported languages and features. It identifies gaps and
 * generates detailed reports for improvement prioritization.
 */

import { TestResult } from '../helpers/JUnitReporter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, count, sql } from 'drizzle-orm';
import { universalSymbols, universalRelationships, languages, symbolCalls } from '../../dist/database/drizzle/schema.js';
import * as fs from 'fs';
import * as path from 'path';

interface SymbolExpectation {
  kind: string;
  name: string;
  qualifiedName?: string;
  returnType?: string;
  signature?: string;
  parentName?: string;
  hasCompleteMetadata?: boolean;
}

interface RelationshipExpectation {
  type: string;
  fromName: string;
  toName: string;
  contextSnippet?: string;
}

interface TestFileExpectations {
  filePath: string;
  description: string;
  symbols: SymbolExpectation[];
  relationships: RelationshipExpectation[];
}

interface GapAnalysisReport {
  summary: {
    totalSymbolsExpected: number;
    totalSymbolsFound: number;
    symbolCoverage: number;
    totalRelationshipsExpected: number;
    totalRelationshipsFound: number;
    relationshipCoverage: number;
    criticalGaps: number;
    testsPassed: number;
    testsFailed: number;
  };
  symbolGaps: Array<{
    kind: string;
    expected: number;
    found: number;
    priority: 'high' | 'medium' | 'low';
    examples: string[];
    missingSymbols: string[];
  }>;
  relationshipGaps: Array<{
    type: string;
    expected: number;
    found: number;
    priority: 'high' | 'medium' | 'low';
    examples: string[];
    missingRelationships: string[];
  }>;
  metadataGaps: Array<{
    field: string;
    completeness: number;
    priority: 'high' | 'medium' | 'low';
    issues: string[];
  }>;
  languageFeatureGaps: Array<{
    feature: string;
    language: string;
    detected: boolean;
    priority: 'high' | 'medium' | 'low';
    description: string;
  }>;
}

export class ComprehensiveParserCapabilitiesTest {
  name = 'ComprehensiveParserCapabilitiesTest';
  description = 'Comprehensive evaluation of parser capabilities across all languages and features';
  private db: Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private gapReport: GapAnalysisReport;

  constructor(database: Database) {
    this.db = database;
    this.drizzleDb = drizzle(database);
    this.gapReport = this.initializeGapReport();
  }

  async run(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    console.log(`🔍 Running ${this.name}...`);
    console.log(`📋 Comprehensive analysis of parser capabilities across all languages\n`);

    try {
      // Get all indexed symbols and relationships
      const allSymbols = await this.drizzleDb.select().from(universalSymbols);
      const allRelationships = await this.drizzleDb.select().from(universalRelationships);
      
      console.log(`📊 Database Overview:`);
      console.log(`   Total symbols: ${allSymbols.length}`);
      console.log(`   Total relationships: ${allRelationships.length}`);
      
      // Analyze by language
      await this.analyzeLanguageDistribution(allSymbols, results);
      
      // Analyze symbol kinds
      await this.analyzeSymbolKinds(allSymbols, results);
      
      // Analyze relationship types  
      await this.analyzeRelationshipTypes(allRelationships, results);
      
      // Test specific file expectations
      await this.testSpecificFileExpectations(results);
      
      // Analyze metadata completeness
      await this.analyzeMetadataCompleteness(allSymbols, results);
      
      // Test modern C++ features
      await this.testModernCppFeatures(allSymbols, results);
      
      // Test template detection
      await this.testTemplateDetection(allSymbols, results);
      
      // Test inheritance relationships
      await this.testInheritanceRelationships(allRelationships, results);
      
      // Generate final gap analysis report
      this.finalizeGapReport(allSymbols, allRelationships);
      await this.generateGapAnalysisReport();
      
      console.log(`\\n📋 Gap Analysis Summary:`);
      console.log(`   Symbol Coverage: ${this.gapReport.summary.symbolCoverage.toFixed(1)}%`);
      console.log(`   Relationship Coverage: ${this.gapReport.summary.relationshipCoverage.toFixed(1)}%`);
      console.log(`   Critical Gaps: ${this.gapReport.summary.criticalGaps}`);
      console.log(`   Tests Passed: ${this.gapReport.summary.testsPassed}/${this.gapReport.summary.testsPassed + this.gapReport.summary.testsFailed}`);
      
    } catch (error) {
      results.push({
        name: 'Comprehensive Parser Analysis',
        status: 'failed',
        time: 0,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }

    return results;
  }

  private async analyzeLanguageDistribution(allSymbols: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 LANGUAGE DISTRIBUTION ANALYSIS`);
    
    const languageStats = new Map<number, { name: string; count: number }>();
    
    // Get language information
    const languagesList = await this.drizzleDb.select().from(languages);
    const languageMap = new Map<number, string>();
    for (const lang of languagesList) {
      languageMap.set(lang.id, lang.displayName || lang.name);
      languageStats.set(lang.id, { name: lang.displayName || lang.name, count: 0 });
    }
    
    // Count symbols by language
    for (const symbol of allSymbols) {
      const langStats = languageStats.get(symbol.language_id);
      if (langStats) {
        langStats.count++;
      }
    }
    
    // Report language distribution
    console.log(`   Languages detected:`);
    for (const [langId, stats] of languageStats) {
      console.log(`   - ${stats.name}: ${stats.count} symbols`);
    }
    
    // Verify language detection is working
    const hasMultipleLanguages = languageStats.size > 1;
    const hasSymbols = allSymbols.length > 0;
    
    results.push({
      name: 'Language Detection Working',
      status: hasSymbols && hasMultipleLanguages ? 'passed' : 'failed',
      time: 0,
      error: !hasSymbols ? new Error('No symbols found') : 
             !hasMultipleLanguages ? new Error('Only one language detected') : undefined
    });
  }

  private async analyzeSymbolKinds(allSymbols: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 SYMBOL KINDS ANALYSIS`);
    
    const symbolKinds = new Map<string, number>();
    const expectedKinds = [
      'class', 'struct', 'function', 'method', 'constructor', 'destructor',
      'field', 'variable', 'parameter', 'namespace', 'enum', 'typedef',
      'interface', 'property', 'constant', 'module', 'import', 'export'
    ];
    
    // Count symbols by kind
    for (const symbol of allSymbols) {
      const count = symbolKinds.get(symbol.kind) || 0;
      symbolKinds.set(symbol.kind, count + 1);
    }
    
    console.log(`   Symbol kinds found:`);
    for (const [kind, count] of symbolKinds.entries()) {
      console.log(`   - ${kind}: ${count}`);
    }
    
    // Check for expected kinds
    const foundKinds = Array.from(symbolKinds.keys());
    const missingKinds = expectedKinds.filter(kind => !foundKinds.includes(kind));
    
    console.log(`\\n   Missing symbol kinds: ${missingKinds.length > 0 ? missingKinds.join(', ') : 'None'}`);
    
    // Update gap report
    for (const kind of expectedKinds) {
      const found = symbolKinds.get(kind) || 0;
      const expected = this.getExpectedCountForKind(kind);
      
      if (found < expected) {
        this.gapReport.symbolGaps.push({
          kind,
          expected,
          found,
          priority: this.getKindPriority(kind),
          examples: this.getKindExamples(kind),
          missingSymbols: []
        });
      }
    }
    
    // Test essential symbol kinds are present
    const essentialKinds = ['class', 'struct', 'function', 'method', 'field', 'namespace'];
    const hasEssentialKinds = essentialKinds.every(kind => symbolKinds.has(kind));
    
    results.push({
      name: 'Essential Symbol Kinds Present',
      status: hasEssentialKinds ? 'passed' : 'failed',
      time: 0,
      error: !hasEssentialKinds ? new Error('Missing essential kinds: ' + essentialKinds.filter(k => !symbolKinds.has(k)).join(', ')) : undefined
    });
  }

  private async analyzeRelationshipTypes(allRelationships: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 RELATIONSHIP TYPES ANALYSIS`);
    
    const relationshipTypes = new Map<string, number>();
    const expectedTypes = [
      'calls', 'inherits', 'implements', 'imports', 'exports', 
      'reads_field', 'writes_field', 'references', 'uses',
      'contains', 'member_of', 'overrides', 'instantiates'
    ];
    
    // Count relationships by type from universal_relationships
    for (const rel of allRelationships) {
      const count = relationshipTypes.get(rel.type) || 0;
      relationshipTypes.set(rel.type, count + 1);
    }
    
    // Also check function calls from symbol_calls table
    const functionCalls = await this.drizzleDb.select().from(symbolCalls);
    const existingCallCount = relationshipTypes.get('calls') || 0;
    relationshipTypes.set('calls', existingCallCount + functionCalls.length);
    console.log(`   Additional function calls from symbol_calls table: ${functionCalls.length}`);
    
    console.log(`   Relationship types found:`);
    for (const [type, count] of relationshipTypes.entries()) {
      console.log(`   - ${type}: ${count}`);
    }
    
    // Check for expected types
    const foundTypes = Array.from(relationshipTypes.keys());
    const missingTypes = expectedTypes.filter(type => !foundTypes.includes(type));
    
    console.log(`\\n   Missing relationship types: ${missingTypes.length > 0 ? missingTypes.join(', ') : 'None'}`);
    
    // Update gap report
    for (const type of expectedTypes) {
      const found = relationshipTypes.get(type) || 0;
      const expected = this.getExpectedCountForRelationshipType(type);
      
      if (found < expected) {
        this.gapReport.relationshipGaps.push({
          type,
          expected,
          found,
          priority: this.getRelationshipTypePriority(type),
          examples: this.getRelationshipTypeExamples(type),
          missingRelationships: []
        });
      }
    }
    
    // Test essential relationship types are present
    const essentialTypes = ['calls', 'reads_field', 'writes_field', 'imports'];
    const hasEssentialTypes = essentialTypes.every(type => relationshipTypes.has(type));
    
    results.push({
      name: 'Essential Relationship Types Present',
      status: hasEssentialTypes ? 'passed' : 'failed',
      time: 0,
      error: !hasEssentialTypes ? new Error('Missing essential types: ' + essentialTypes.filter(t => !relationshipTypes.has(t)).join(', ')) : undefined
    });
  }

  private async testSpecificFileExpectations(results: TestResult[]): Promise<void> {
    console.log(`\\n📋 SPECIFIC FILE EXPECTATIONS TEST`);
    
    // Test RenderingTypes.ixx - our known working file
    const renderingTypesExpectations: TestFileExpectations = {
      filePath: '/workspace/test/complex-files/ixx/RenderingTypes.ixx',
      description: 'C++ module with structs, functions, and field access',
      symbols: [
        { kind: 'struct', name: 'GenericResourceDesc', qualifiedName: 'GenericResourceDesc' },
        { kind: 'struct', name: 'ResourceDesc', qualifiedName: 'ResourceDesc' },
        { kind: 'method', name: 'ToGeneric', qualifiedName: 'ResourceDesc::ToGeneric', returnType: 'GenericResourceDesc' },
        { kind: 'field', name: 'type', qualifiedName: 'GenericResourceDesc::type', parentName: 'GenericResourceDesc' },
        { kind: 'field', name: 'width', qualifiedName: 'GenericResourceDesc::width' },
        { kind: 'field', name: 'height', qualifiedName: 'GenericResourceDesc::height' }
      ],
      relationships: [
        { type: 'writes_field', fromName: 'ResourceDesc::ToGeneric', toName: 'type' },
        { type: 'writes_field', fromName: 'ResourceDesc::ToGeneric', toName: 'width' },
        { type: 'writes_field', fromName: 'ResourceDesc::ToGeneric', toName: 'height' }
      ]
    };
    
    await this.testFileExpectations(renderingTypesExpectations, results);
    
    // Test NoiseFactory.cpp - C++ module with inheritance and templates
    const noiseFactoryExpectations: TestFileExpectations = {
      filePath: '/workspace/test/complex-files/cpp/Generation/Noise/NoiseFactory.cpp',
      description: 'C++ factory pattern with modules and templates',
      symbols: [
        { kind: 'namespace', name: 'PlanetGen::Rendering::Noise' },
        { kind: 'function', name: 'Create', signature: 'std::unique_ptr<INoiseGenerator> Create(NoiseType, int, float, int)' },
        { kind: 'function', name: 'CreateSimpleNoise' },
        { kind: 'function', name: 'CreateWorley' }
      ],
      relationships: [
        { type: 'calls', fromName: 'Create', toName: 'CreateSimpleNoise' },
        { type: 'calls', fromName: 'Create', toName: 'CreateWorley' },
        { type: 'imports', fromName: 'NoiseFactory', toName: 'NoiseInterface' }
      ]
    };
    
    await this.testFileExpectations(noiseFactoryExpectations, results);
  }

  private async testFileExpectations(expectations: TestFileExpectations, results: TestResult[]): Promise<void> {
    console.log(`\\n   Testing: ${expectations.description}`);
    console.log(`   File: ${expectations.filePath}`);
    
    // Get symbols from this file
    const fileSymbols = await this.drizzleDb.select()
      .from(universalSymbols)
      .where(eq(universalSymbols.filePath, expectations.filePath));
    
    console.log(`   Found ${fileSymbols.length} symbols in file`);
    
    // Test symbol expectations
    let symbolTests = 0;
    let symbolPassed = 0;
    
    for (const expectedSymbol of expectations.symbols) {
      symbolTests++;
      
      // Smart name matching: handle both simple names and qualified names
      const found = fileSymbols.find(s => {
        if (s.kind !== expectedSymbol.kind) return false;
        
        // If expectedSymbol.qualifiedName is provided, use exact qualified name match
        if (expectedSymbol.qualifiedName) {
          return s.qualifiedName === expectedSymbol.qualifiedName;
        }
        
        // Otherwise, match if:
        // 1. Exact name match (s.name === expectedSymbol.name), OR
        // 2. The symbol's name ends with the expected name (for qualified names like "Class::Method" matching "Method"), OR  
        // 3. The symbol's qualified name contains the expected name
        return s.name === expectedSymbol.name || 
               s.name.endsWith('::' + expectedSymbol.name) ||
               s.qualifiedName.endsWith('::' + expectedSymbol.name);
      });
      
      if (found) {
        symbolPassed++;
        console.log(`   ✅ Found ${expectedSymbol.kind}: ${expectedSymbol.name} (actual: ${found.name})`);
        
        // Check metadata completeness
        if (expectedSymbol.returnType && found.returnType !== expectedSymbol.returnType) {
          console.log(`   ⚠️  Return type mismatch: expected '${expectedSymbol.returnType}', got '${found.returnType}'`);
        }
        if (expectedSymbol.signature && found.signature !== expectedSymbol.signature) {
          console.log(`   ⚠️  Signature mismatch: expected '${expectedSymbol.signature}', got '${found.signature}'`);
        }
      } else {
        console.log(`   ❌ Missing ${expectedSymbol.kind}: ${expectedSymbol.name}`);
        // Debug: Show what we actually have for this kind
        const sameKindSymbols = fileSymbols.filter(s => s.kind === expectedSymbol.kind);
        if (sameKindSymbols.length > 0) {
          console.log(`       Available ${expectedSymbol.kind}s: ${sameKindSymbols.map(s => s.name).join(', ')}`);
        }
      }
    }
    
    // Test relationship expectations from universal_relationships
    const fileRelationships = await this.drizzleDb.select()
      .from(universalRelationships)
      .innerJoin(universalSymbols, eq(universalRelationships.fromSymbolId, universalSymbols.id))
      .where(eq(universalSymbols.filePath, expectations.filePath));
    
    // Also check function calls from symbol_calls table
    const fileFunctionCalls = await this.drizzleDb.select()
      .from(symbolCalls)
      .innerJoin(universalSymbols, eq(symbolCalls.callerId, universalSymbols.id))
      .where(eq(universalSymbols.filePath, expectations.filePath));
    
    let relationshipTests = 0;
    let relationshipPassed = 0;
    
    for (const expectedRel of expectations.relationships) {
      relationshipTests++;
      let found = false;
      let foundSource = '';
      
      // Smart relationship matching: handle qualified names more flexibly
      // Check universal_relationships table
      const relFound = fileRelationships.find(r => {
        const typeMatches = r.universal_relationships.type === expectedRel.type;
        const fromMatches = r.universal_symbols.qualifiedName.includes(expectedRel.fromName) ||
                           r.universal_symbols.name.includes(expectedRel.fromName) ||
                           r.universal_symbols.name.endsWith('::' + expectedRel.fromName);
        return typeMatches && fromMatches;
      });
      
      // Check symbol_calls table for 'calls' relationships  
      let callFound = false;
      if (expectedRel.type === 'calls') {
        callFound = fileFunctionCalls.some(c => {
          const fromMatches = c.universal_symbols.qualifiedName.includes(expectedRel.fromName) ||
                             c.universal_symbols.name.includes(expectedRel.fromName) ||
                             c.universal_symbols.name.endsWith('::' + expectedRel.fromName);
          const toMatches = c.symbol_calls.targetFunction &&
                           (c.symbol_calls.targetFunction === expectedRel.toName || 
                            c.symbol_calls.targetFunction.includes(expectedRel.toName) ||
                            c.symbol_calls.targetFunction.endsWith('::' + expectedRel.toName));
          return fromMatches && toMatches;
        });
      }
      
      found = (relFound !== undefined) || callFound;
      foundSource = relFound ? 'universal_relationships' : (callFound ? 'symbol_calls' : '');
      
      if (found) {
        relationshipPassed++;
        console.log(`   ✅ Found ${expectedRel.type}: ${expectedRel.fromName} -> ${expectedRel.toName} (${foundSource})`);
      } else {
        console.log(`   ❌ Missing ${expectedRel.type}: ${expectedRel.fromName} -> ${expectedRel.toName}`);
        
        // Debug: Show what relationships we actually have for this type
        const sameTypeRels = fileRelationships.filter(r => r.universal_relationships.type === expectedRel.type);
        if (sameTypeRels.length > 0) {
          console.log(`       Available ${expectedRel.type} relationships: ${sameTypeRels.map(r => r.universal_symbols.name).join(', ')}`);
        }
        if (expectedRel.type === 'calls' && fileFunctionCalls.length > 0) {
          console.log(`       Available function calls: ${fileFunctionCalls.map(c => c.symbol_calls.targetFunction).join(', ')}`);
        }
      }
    }
    
    // Add results
    results.push({
      name: expectations.description + ' - Symbol Detection',
      status: symbolPassed === symbolTests ? 'passed' : 'failed',
      time: 0,
      error: symbolPassed !== symbolTests ? new Error(symbolPassed + '/' + symbolTests + ' symbols found') : undefined
    });
    
    results.push({
      name: expectations.description + ' - Relationship Detection',
      status: relationshipPassed === relationshipTests ? 'passed' : 'failed',
      time: 0,
      error: relationshipPassed !== relationshipTests ? new Error(relationshipPassed + '/' + relationshipTests + ' relationships found') : undefined
    });
  }

  private async analyzeMetadataCompleteness(allSymbols: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 METADATA COMPLETENESS ANALYSIS`);
    
    const functionSymbols = allSymbols.filter(s => s.kind === 'function' || s.kind === 'method');
    const classSymbols = allSymbols.filter(s => s.kind === 'class' || s.kind === 'struct');
    
    console.log(`   Analyzing ${functionSymbols.length} functions and ${classSymbols.length} classes`);
    
    // Analyze function signatures
    let functionsWithSignatures = 0;
    let functionsWithReturnTypes = 0;
    let functionsWithComplexity = 0;
    
    for (const func of functionSymbols) {
      if (func.signature && func.signature.trim().length > 0) functionsWithSignatures++;
      if (func.returnType && func.returnType.trim().length > 0) functionsWithReturnTypes++;
      if (func.complexity && func.complexity > 0) functionsWithComplexity++;
    }
    
    const signatureCompleteness = functionSymbols.length > 0 ? (functionsWithSignatures / functionSymbols.length) * 100 : 0;
    const returnTypeCompleteness = functionSymbols.length > 0 ? (functionsWithReturnTypes / functionSymbols.length) * 100 : 0;
    const complexityCompleteness = functionSymbols.length > 0 ? (functionsWithComplexity / functionSymbols.length) * 100 : 0;
    
    console.log(`   Function metadata completeness:`);
    console.log(`   - Signatures: ${signatureCompleteness.toFixed(1)}% (${functionsWithSignatures}/${functionSymbols.length})`);
    console.log(`   - Return types: ${returnTypeCompleteness.toFixed(1)}% (${functionsWithReturnTypes}/${functionSymbols.length})`);
    console.log(`   - Complexity: ${complexityCompleteness.toFixed(1)}% (${functionsWithComplexity}/${functionSymbols.length})`);
    
    // Update gap report
    if (signatureCompleteness < 95) {
      this.gapReport.metadataGaps.push({
        field: 'function_signatures',
        completeness: signatureCompleteness,
        priority: 'high',
        issues: ['Missing complete function signatures with parameters']
      });
    }
    
    if (returnTypeCompleteness < 90) {
      this.gapReport.metadataGaps.push({
        field: 'return_types',
        completeness: returnTypeCompleteness,
        priority: 'medium',
        issues: ['Missing return type information']
      });
    }
    
    // Test metadata thresholds
    results.push({
      name: 'Function Signatures Completeness (>80%)',
      status: signatureCompleteness > 80 ? 'passed' : 'failed',
      time: 0,
      error: signatureCompleteness <= 80 ? new Error('Only ' + signatureCompleteness.toFixed(1) + '% of functions have signatures') : undefined
    });
    
    results.push({
      name: 'Return Types Completeness (>70%)',
      status: returnTypeCompleteness > 70 ? 'passed' : 'failed',
      time: 0,
      error: returnTypeCompleteness <= 70 ? new Error('Only ' + returnTypeCompleteness.toFixed(1) + '% of functions have return types') : undefined
    });
  }

  private async testModernCppFeatures(allSymbols: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 MODERN C++ FEATURES TEST`);
    
    const cppSymbols = allSymbols.filter(s => s.language_id === 1); // Assuming 1 is C++
    
    // Look for template indicators in signatures
    const templatedSymbols = cppSymbols.filter(s => 
      s.signature && (s.signature.includes('template') || s.signature.includes('<') && s.signature.includes('>'))
    );
    
    // Look for virtual method indicators
    const virtualMethods = cppSymbols.filter(s => 
      s.signature && s.signature.includes('virtual')
    );
    
    // Look for constexpr indicators
    const constexprSymbols = cppSymbols.filter(s => 
      s.signature && s.signature.includes('constexpr')
    );
    
    // Look for auto type deduction
    const autoSymbols = cppSymbols.filter(s => 
      s.returnType && s.returnType.includes('auto')
    );
    
    console.log(`   Modern C++ feature detection:`);
    console.log(`   - Templates: ${templatedSymbols.length} symbols`);
    console.log(`   - Virtual methods: ${virtualMethods.length} symbols`);
    console.log(`   - Constexpr: ${constexprSymbols.length} symbols`);
    console.log(`   - Auto type deduction: ${autoSymbols.length} symbols`);
    
    // Update gap report for missing features
    const expectedFeatures = [
      { name: 'templates', found: templatedSymbols.length, expected: 5 },
      { name: 'virtual_methods', found: virtualMethods.length, expected: 3 },
      { name: 'constexpr', found: constexprSymbols.length, expected: 2 }
    ];
    
    for (const feature of expectedFeatures) {
      if (feature.found < feature.expected) {
        this.gapReport.languageFeatureGaps.push({
          feature: feature.name,
          language: 'cpp',
          detected: feature.found > 0,
          priority: 'high',
          description: 'Expected ' + feature.expected + ', found ' + feature.found
        });
      }
    }
    
    // Test that we can detect at least some modern features
    const hasModernFeatures = templatedSymbols.length > 0 || virtualMethods.length > 0 || constexprSymbols.length > 0;
    
    results.push({
      name: 'Modern C++ Features Detection',
      status: hasModernFeatures ? 'passed' : 'failed',
      time: 0,
      error: !hasModernFeatures ? new Error('No modern C++ features detected in codebase') : undefined
    });
  }

  private async testTemplateDetection(allSymbols: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 TEMPLATE DETECTION TEST`);
    
    // Look for template-like symbols
    const templateClasses = allSymbols.filter(s => 
      (s.kind === 'class' || s.kind === 'struct') && 
      s.signature && s.signature.includes('template')
    );
    
    const templateFunctions = allSymbols.filter(s => 
      (s.kind === 'function' || s.kind === 'method') && 
      s.signature && s.signature.includes('template')
    );
    
    // Look for generic/template-like names
    const genericSymbols = allSymbols.filter(s => 
      s.name.includes('<') || s.name.includes('Template') || 
      s.qualifiedName.includes('<') || s.signature?.includes('<typename')
    );
    
    console.log(`   Template detection results:`);
    console.log(`   - Template classes: ${templateClasses.length}`);
    console.log(`   - Template functions: ${templateFunctions.length}`);
    console.log(`   - Generic/templated symbols: ${genericSymbols.length}`);
    
    // This is expected to fail currently - templates are a known gap
    const hasTemplateSupport = templateClasses.length > 0 || templateFunctions.length > 0;
    
    results.push({
      name: 'Template Detection (Known Gap)',
      status: hasTemplateSupport ? 'passed' : 'failed',
      time: 0,
      error: !hasTemplateSupport ? new Error('Template detection not implemented - known gap') : undefined
    });
  }

  private async testInheritanceRelationships(allRelationships: any[], results: TestResult[]): Promise<void> {
    console.log(`\\n📋 INHERITANCE RELATIONSHIPS TEST`);
    
    const inheritanceRels = allRelationships.filter(r => 
      r.type === 'inherits' || r.type === 'extends' || r.type === 'implements'
    );
    
    const overrideRels = allRelationships.filter(r => 
      r.type === 'overrides'
    );
    
    console.log(`   Inheritance relationship detection:`);
    console.log(`   - Inheritance relationships: ${inheritanceRels.length}`);
    console.log(`   - Override relationships: ${overrideRels.length}`);
    
    // This is expected to fail currently - inheritance is a known gap  
    const hasInheritanceSupport = inheritanceRels.length > 0;
    
    results.push({
      name: 'Inheritance Relationships (Known Gap)',
      status: hasInheritanceSupport ? 'passed' : 'failed',
      time: 0,
      error: !hasInheritanceSupport ? new Error('Inheritance relationship detection not implemented - known gap') : undefined
    });
  }

  private initializeGapReport(): GapAnalysisReport {
    return {
      summary: {
        totalSymbolsExpected: 0,
        totalSymbolsFound: 0,
        symbolCoverage: 0,
        totalRelationshipsExpected: 0,
        totalRelationshipsFound: 0,
        relationshipCoverage: 0,
        criticalGaps: 0,
        testsPassed: 0,
        testsFailed: 0
      },
      symbolGaps: [],
      relationshipGaps: [],
      metadataGaps: [],
      languageFeatureGaps: []
    };
  }

  private finalizeGapReport(allSymbols: any[], allRelationships: any[]): void {
    this.gapReport.summary.totalSymbolsFound = allSymbols.length;
    this.gapReport.summary.totalRelationshipsFound = allRelationships.length;
    
    // Calculate expected totals
    this.gapReport.summary.totalSymbolsExpected = this.calculateExpectedSymbols();
    this.gapReport.summary.totalRelationshipsExpected = this.calculateExpectedRelationships();
    
    // Calculate coverage percentages
    this.gapReport.summary.symbolCoverage = 
      (this.gapReport.summary.totalSymbolsFound / this.gapReport.summary.totalSymbolsExpected) * 100;
    this.gapReport.summary.relationshipCoverage = 
      (this.gapReport.summary.totalRelationshipsFound / this.gapReport.summary.totalRelationshipsExpected) * 100;
    
    // Count critical gaps
    this.gapReport.summary.criticalGaps = 
      this.gapReport.symbolGaps.filter(g => g.priority === 'high').length +
      this.gapReport.relationshipGaps.filter(g => g.priority === 'high').length +
      this.gapReport.metadataGaps.filter(g => g.priority === 'high').length +
      this.gapReport.languageFeatureGaps.filter(g => g.priority === 'high').length;
  }

  private async generateGapAnalysisReport(): Promise<void> {
    const reportPath = '/workspace/gap-analysis-report.json';
    const reportContent = JSON.stringify(this.gapReport, null, 2);
    
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\\n📊 Gap analysis report saved to: ${reportPath}`);
  }

  // Helper methods for expected counts and priorities
  private getExpectedCountForKind(kind: string): number {
    const expectations: Record<string, number> = {
      'class': 20, 'struct': 30, 'function': 50, 'method': 80,
      'field': 100, 'namespace': 10, 'constructor': 15, 'destructor': 10
    };
    return expectations[kind] || 1;
  }

  private getKindPriority(kind: string): 'high' | 'medium' | 'low' {
    const highPriority = ['class', 'struct', 'function', 'method', 'field'];
    const mediumPriority = ['constructor', 'destructor', 'namespace', 'variable'];
    
    if (highPriority.includes(kind)) return 'high';
    if (mediumPriority.includes(kind)) return 'medium';
    return 'low';
  }

  private getKindExamples(kind: string): string[] {
    const examples: Record<string, string[]> = {
      'class': ['class MyClass { }', 'template<typename T> class Vector { }'],
      'struct': ['struct Point { int x, y; }', 'struct GenericResourceDesc { }'],
      'function': ['int add(int a, int b)', 'template<typename T> T max(T a, T b)'],
      'method': ['void MyClass::doSomething()', 'virtual void pure() = 0'],
      'field': ['int memberVariable', 'static const int CONSTANT = 42']
    };
    return examples[kind] || ['Example ' + kind];
  }

  private getExpectedCountForRelationshipType(type: string): number {
    const expectations: Record<string, number> = {
      'calls': 30, 'inherits': 5, 'imports': 15, 'reads_field': 20, 'writes_field': 25
    };
    return expectations[type] || 1;
  }

  private getRelationshipTypePriority(type: string): 'high' | 'medium' | 'low' {
    const highPriority = ['calls', 'inherits', 'reads_field', 'writes_field'];
    const mediumPriority = ['imports', 'references', 'uses'];
    
    if (highPriority.includes(type)) return 'high';
    if (mediumPriority.includes(type)) return 'medium';
    return 'low';
  }

  private getRelationshipTypeExamples(type: string): string[] {
    const examples: Record<string, string[]> = {
      'calls': ['function() calls otherFunction()', 'obj.method() calls member'],
      'inherits': ['class Derived : public Base'],
      'reads_field': ['value = obj.field', 'return this->member'],
      'writes_field': ['obj.field = value', 'this->member = newValue']
    };
    return examples[type] || ['Example ' + type + ' relationship'];
  }

  private calculateExpectedSymbols(): number {
    // Based on the 140 files we're indexing, estimate expected symbols
    return 200; // Conservative estimate
  }

  private calculateExpectedRelationships(): number {
    // Based on typical code relationships
    return 100; // Conservative estimate
  }
}