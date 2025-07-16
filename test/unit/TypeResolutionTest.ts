import { BaseTest } from '../helpers/BaseTest';
import { UnifiedCppParser } from '../../dist/parsers/unified-cpp-parser.js';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

interface ExportedType {
  name: string;
  file: string;
  module: string;
  category: 'struct' | 'class' | 'enum' | 'typedef' | 'concept';
  members?: Array<{ name: string; type: string }>;
  templateParams?: string[];
}

interface TypeRegistry {
  types: Map<string, ExportedType>;
  moduleExports: Map<string, Set<string>>; // module -> exported types
  typeImports: Map<string, Set<string>>;   // file -> imported types
}

export class TypeResolutionTest extends BaseTest {
  private parser: UnifiedCppParser;
  private typeRegistry: TypeRegistry;
  private typeImports: Map<string, Set<string>>;
  private db: Database;
  private dbPath: string;
  
  constructor(dbPath: string, projectPath: string) {
    super('TypeResolution', projectPath);
    this.dbPath = dbPath;
    this.parser = new UnifiedCppParser({ debugMode: false });
    this.typeRegistry = {
      types: new Map(),
      moduleExports: new Map(),
      typeImports: new Map()
    };
    this.typeImports = new Map();
  }
  
  async specificSetup(): Promise<void> {
    // Use the shared test database
    this.db = new Database(this.dbPath);
    
    // The database should already be initialized by TestRunner
    // Just verify the tables exist
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='enhanced_symbols'").get();
    if (!tableExists) {
      // Initialize if needed
      const { CleanUnifiedSchemaManager } = await import('../../dist/database/clean-unified-schema.js');
      const schemaManager = CleanUnifiedSchemaManager.getInstance();
      schemaManager.initializeDatabase(this.db);
    }
  }
  
  async specificTeardown(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  async run(): Promise<void> {
    // Step 1: Parse type definition files to build registry
    await this.buildTypeRegistry();
    
    // Step 2: Analyze method parameter resolution
    await this.analyzeParameterResolution();
    
    // Step 3: Test cross-file type relationships
    await this.analyzeCrossFileTypeRelationships();
    
    // Step 4: Generate type resolution report
    await this.generateTypeResolutionReport();
  }
  
  private async buildTypeRegistry(): Promise<void> {
    const typeFiles = [
      path.join(this.projectPath, 'test/complex-files/ixx/VulkanTypes.ixx'),
      path.join(this.projectPath, 'test/complex-files/ixx/RenderingTypes.ixx')
    ];
    
    for (const file of typeFiles) {
      await this.parseTypeExportFile(file);
    }
    
    // ASSERTIONS: Verify type registry is built correctly
    this.assertGreaterThan(this.typeRegistry.types.size, 20, "Should register >20 exported types");
    this.assertGreaterThan(this.typeRegistry.moduleExports.size, 1, "Should find >1 module with exports");
  }
  
  private async parseTypeExportFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const result = await this.parser.parseFile(filePath);
    const fileName = path.basename(filePath);
    
    // Extract module name from parser result
    const moduleName = result.moduleInfo?.moduleName || 'unknown';
    
    // Check if there's an export namespace
    const namespaceMatch = content.match(/export\s+namespace\s+([a-zA-Z_][a-zA-Z0-9_:]*)\s*\{/);
    const exportNamespace = namespaceMatch ? namespaceMatch[1] : null;
    
    let exportCount = 0;
    
    // Use the parser's class extraction which now includes members
    for (const classInfo of result.classes) {
      // Check if this class is exported (either directly or in export namespace)
      const isExported = exportNamespace || result.exports.includes(classInfo.name);
      
      if (isExported) {
        const exportedType: ExportedType = {
          name: classInfo.name,
          file: filePath,
          module: moduleName,
          category: 'class', // Parser doesn't distinguish struct vs class yet
          members: classInfo.members.map(m => ({
            name: m.name,
            type: m.type
          }))
        };
        
        this.typeRegistry.types.set(classInfo.name, exportedType);
        
        if (!this.typeRegistry.moduleExports.has(moduleName)) {
          this.typeRegistry.moduleExports.set(moduleName, new Set());
        }
        this.typeRegistry.moduleExports.get(moduleName)!.add(classInfo.name);
        
        exportCount++;
      }
    }
    
    // Also handle enums which parser might not extract yet
    if (exportNamespace) {
      const namespaceStart = content.indexOf(`export namespace ${exportNamespace}`);
      if (namespaceStart !== -1) {
        const afterNamespace = content.substring(namespaceStart);
        
        // Find enums within namespace
        const enumPattern = /enum\s+(?:class\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\{|:)/g;
        let match;
        while ((match = enumPattern.exec(afterNamespace)) !== null) {
          const enumName = match[1];
          this.typeRegistry.types.set(enumName, {
            name: enumName,
            file: filePath,
            module: moduleName,
            category: 'enum'
          });
          
          if (!this.typeRegistry.moduleExports.has(moduleName)) {
            this.typeRegistry.moduleExports.set(moduleName, new Set());
          }
          this.typeRegistry.moduleExports.get(moduleName)!.add(enumName);
          exportCount++;
        }
      }
    }
    
    console.log(`    Exported types: ${exportCount}`);
    console.log(`    Module: ${moduleName}`);
    console.log(`    Classes found by parser: ${result.classes.length}`);
    if (exportNamespace) {
      console.log(`    Export namespace: ${exportNamespace}`);
    }
  }
  
  
  private async analyzeParameterResolution(): Promise<void> {
    const testFiles = [
      path.join(this.projectPath, 'test/complex-files/cpp/VulkanPipelineCreator.cpp'),
      path.join(this.projectPath, 'test/complex-files/cpp/VulkanPipelineManager.cpp')
    ];
    
    let totalParams = 0;
    let resolvedParams = 0;
    let exportedTypeParams = 0;
    
    for (const file of testFiles) {
      const result = await this.parser.parseFile(file);
      const fileName = path.basename(file);
      
      console.log(`\n  Analyzing ${fileName}...`);
      
      // Check imports in this file
      const imports = new Set<string>();
      result.imports.forEach(imp => {
        const moduleMatch = imp.module.match(/([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (moduleMatch) {
          imports.add(moduleMatch[1]);
        }
      });
      
      // Analyze each method's parameters
      for (const method of result.methods) {
        for (const param of method.parameters) {
          totalParams++;
          
          if (param.type && param.type.length > 0) {
            resolvedParams++;
            
            // Check if this type is from our registry
            const baseType = this.extractBaseType(param.type);
            if (this.typeRegistry.types.has(baseType)) {
              exportedTypeParams++;
              const typeInfo = this.typeRegistry.types.get(baseType)!;
              
              // Store this relationship
              if (!this.typeImports.has(file)) {
                this.typeImports.set(file, new Set());
              }
              this.typeImports.get(file)!.add(baseType);
            }
          }
        }
      }
    }
    
    // ASSERTIONS: Verify parameter resolution is working
    this.assertGreaterThan(totalParams, 50, "Should find >50 parameters in test files");
    this.assertGreaterThan(resolvedParams, totalParams * 0.8, "Should resolve >80% of parameters");
    this.assertGreaterThan(exportedTypeParams, 5, "Should find >5 parameters using exported types");
  }
  
  private extractBaseType(type: string): string {
    // Remove qualifiers and extract base type
    return type
      .replace(/^(?:const\s+)?/, '')
      .replace(/[*&\s]+$/, '')
      .replace(/^(?:std::|PlanetGen::|Rendering::)*/, '')
      .split('<')[0]; // Remove template args
  }
  
  private async analyzeCrossFileTypeRelationships(): Promise<void> {
    // Query existing symbols from database that were created by the indexer
    const existingSymbols = this.db.prepare(`
      SELECT * FROM enhanced_symbols 
      WHERE kind IN ('class', 'variable', 'module', 'function', 'method')
      ORDER BY name
    `).all() as any[];
    
    // ASSERTIONS: Verify our targets are met
    this.assertGreaterThan(existingSymbols.length, 1000, "Database should contain >1000 symbols from indexer");
    
    // Group symbols by kind
    const symbolsByKind = existingSymbols.reduce((acc, symbol) => {
      acc[symbol.kind] = (acc[symbol.kind] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // ASSERTIONS: Verify symbol types exist
    this.assertExists(symbolsByKind.class, "Classes should exist in database");
    this.assertExists(symbolsByKind.variable, "Variables should exist in database");
    this.assertExists(symbolsByKind.module, "Modules should exist in database");
    this.assertExists(symbolsByKind.function, "Functions should exist in database");
    
    this.assertGreaterThan(symbolsByKind.class || 0, 50, "Should have >50 class symbols");
    this.assertGreaterThan(symbolsByKind.variable || 0, 100, "Should have >100 variable symbols (member vars)");
    this.assertGreaterThan(symbolsByKind.module || 0, 10, "Should have >10 module symbols");
    this.assertGreaterThan(symbolsByKind.function || 0, 400, "Should have >400 function/method symbols");
    
    // Look for member variables and their type relationships
    const memberVariables = existingSymbols.filter(s => s.kind === 'variable' && s.parent_class);
    
    // ASSERTIONS: Verify member variables are created properly
    this.assertGreaterThan(memberVariables.length, 100, "Should have >100 member variables");
    
    if (memberVariables.length > 0) {
      // ASSERTIONS: Verify member variables have proper structure
      const sampleMember = memberVariables[0];
      this.assertExists(sampleMember.parent_class, "Member variables should have parent_class");
      this.assertExists(sampleMember.signature, "Member variables should have signature");
      this.assert(sampleMember.qualified_name.includes('::'), "Member variables should have qualified names with '::'");
    }
    
    // Look for import relationships
    const importSymbols = existingSymbols.filter(s => s.kind === 'module' && s.semantic_tags?.includes('import'));
    
    // ASSERTIONS: Verify import symbols are created
    this.assertGreaterThan(importSymbols.length, 5, "Should have >5 imported module symbols");
    
    if (importSymbols.length > 0) {
      // ASSERTIONS: Verify import symbols have proper structure
      const sampleImport = importSymbols[0];
      this.assertExists(sampleImport.signature, "Import symbols should have signature");
      this.assert(sampleImport.signature.includes('import'), "Import signatures should contain 'import'");
    }
    
    // Check for relationships table
    const relationships = this.db.prepare(`
      SELECT * FROM semantic_connections 
      WHERE connection_type = 'instance_of'
      LIMIT 10
    `).all() as any[];
    
    // ASSERTIONS: Verify relationships are created
    this.assertGreaterThan(relationships.length, 0, "Should have instance_of relationships");
    
    if (relationships.length > 0) {
      const sampleRel = relationships[0];
      this.assertExists(sampleRel.symbol_id, "Relationships should have symbol_id");
      this.assertExists(sampleRel.connected_id, "Relationships should have connected_id");
      this.assertEqual(sampleRel.connection_type, 'instance_of', "Relationship type should be 'instance_of'");
    }
  }
  
  private async generateTypeResolutionReport(): Promise<void> {
    console.log('\n📋 Type Resolution Report:');
    
    // Most used exported types
    const typeUsageCount = new Map<string, number>();
    for (const importedTypes of this.typeImports.values()) {
      for (const type of importedTypes) {
        typeUsageCount.set(type, (typeUsageCount.get(type) || 0) + 1);
      }
    }
    
    const sortedTypes = Array.from(typeUsageCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log('\n  🏆 Most Used Exported Types:');
    for (const [type, count] of sortedTypes) {
      const typeInfo = this.typeRegistry.types.get(type)!;
      console.log(`    ${type} (${typeInfo.category}) - used in ${count} files`);
    }
    
    // Module dependencies
    console.log('\n  📦 Module Export Summary:');
    for (const [module, types] of this.typeRegistry.moduleExports) {
      console.log(`    ${module}: ${types.size} exported types`);
    }
    
    // Detailed type analysis - sample a few types to show member tracking
    console.log('\n  🔍 Sample Type Analysis:');
    let sampleCount = 0;
    for (const [typeName, typeInfo] of this.typeRegistry.types) {
      if (typeInfo.members && typeInfo.members.length > 0 && sampleCount < 3) {
        console.log(`\n    ${typeName} (${typeInfo.category}):`);
        console.log(`      Module: ${typeInfo.module}`);
        console.log(`      Members: ${typeInfo.members.length}`);
        for (const member of typeInfo.members.slice(0, 3)) {
          console.log(`        - ${member.name}: ${member.type}`);
        }
        if (typeInfo.members.length > 3) {
          console.log(`        ... and ${typeInfo.members.length - 3} more members`);
        }
        sampleCount++;
      }
    }
    
    // Cross-reference analysis
    console.log('\n  🔗 Cross-Reference Analysis:');
    
    // Check if any types reference other exported types
    let crossReferences = 0;
    const referencedTypes = new Set<string>();
    
    for (const [typeName, typeInfo] of this.typeRegistry.types) {
      if (typeInfo.members) {
        for (const member of typeInfo.members) {
          // Check if member type references another exported type
          const baseType = this.extractBaseType(member.type);
          if (this.typeRegistry.types.has(baseType)) {
            crossReferences++;
            referencedTypes.add(baseType);
            if (crossReferences <= 5) {
              console.log(`    ${typeName}.${member.name} -> ${baseType}`);
            }
          }
        }
      }
    }
    
    console.log(`\n    Total cross-references found: ${crossReferences}`);
    console.log(`    Unique types referenced: ${referencedTypes.size}`);
    
    // Verify database storage
    console.log('\n  💾 Database Verification:');
    const symbolCount = this.db.prepare("SELECT COUNT(*) as count FROM enhanced_symbols WHERE kind = 'type_export'").get() as { count: number };
    const connectionCount = this.db.prepare("SELECT COUNT(*) as count FROM semantic_connections WHERE connection_type = 'uses_type'").get() as { count: number };
    
    console.log(`    Type exports in database: ${symbolCount.count}`);
    console.log(`    Type usage connections: ${connectionCount.count}`);
    
    // Record test success
    console.log('\n✅ Type Resolution Analysis completed successfully');
  }
}