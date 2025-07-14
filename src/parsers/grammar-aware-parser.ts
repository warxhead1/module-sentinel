/**
 * Grammar-Aware C++20/23 Module Parser
 * Uses custom grammar rules to precisely parse module constructs
 */

import Parser from 'tree-sitter';
import { EnhancedTreeSitterParser } from './enhanced-tree-sitter-parser.js';
import { 
  MethodSignature, 
  ClassInfo,
  ParameterInfo,
  EnhancedModuleInfo 
} from '../types/essential-features.js';
import { 
  EnhancedTypeAnalyzer,
  DetailedTypeInfo,
  EnhancedParameterInfo,
  EnhancedMethodSignature,
  EnhancedMemberInfo
} from './enhanced-type-analyzer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class GrammarAwareParser extends EnhancedTreeSitterParser {
  private moduleInfo: ModuleAnalysis | null = null;
  private typeAnalyzer: EnhancedTypeAnalyzer;

  constructor() {
    super();
    this.typeAnalyzer = new EnhancedTypeAnalyzer();
  }

  /**
   * Parse file with grammar-aware C++20/23 module understanding
   */
  async parseFile(filePath: string): Promise<EnhancedModuleInfo> {
    console.log(`🧬 Grammar-aware parsing: ${path.basename(filePath)}`);
    
    const content = await fs.readFile(filePath, 'utf-8');
    
    // First, analyze the module structure
    this.moduleInfo = this.analyzeModuleStructure(content);
    console.log(`   Module analysis:`, this.moduleInfo);
    
    // Use enhanced parsing with module context
    const result = await super.parseFile(filePath);
    
    // Post-process with module information
    this.enhanceResultWithModuleInfo(result, this.moduleInfo);
    
    // Enhance with detailed type analysis
    this.enhanceWithDetailedTypes(result);
    
    return result;
  }

  /**
   * Analyze the C++20/23 module structure of the file
   */
  private analyzeModuleStructure(content: string): ModuleAnalysis {
    const lines = content.split('\n');
    const analysis: ModuleAnalysis = {
      hasModulePreamble: false,
      exportModuleName: null,
      importedModules: [],
      exportNamespaces: [],
      exportUsings: [],
      moduleType: 'traditional'
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Module preamble: "module;"
      if (line === 'module;') {
        analysis.hasModulePreamble = true;
        console.log(`   ✓ Found module preamble at line ${i + 1}`);
      }
      
      // Export module: "export module ModuleName;"
      const exportModuleMatch = line.match(/^export\s+module\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/);
      if (exportModuleMatch) {
        analysis.exportModuleName = exportModuleMatch[1];
        analysis.moduleType = 'primary_interface';
        console.log(`   ✓ Found export module: ${analysis.exportModuleName}`);
      }
      
      // Import declarations: "import ModuleName;"
      const importMatch = line.match(/^import\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*;/);
      if (importMatch) {
        analysis.importedModules.push(importMatch[1]);
        console.log(`   ✓ Found import: ${importMatch[1]}`);
      }
      
      // Export namespace: "export namespace A::B::C"
      const exportNamespaceMatch = line.match(/^export\s+namespace\s+([a-zA-Z_][a-zA-Z0-9_:]*)/);
      if (exportNamespaceMatch) {
        const namespaceName = exportNamespaceMatch[1];
        analysis.exportNamespaces.push({
          name: namespaceName,
          parts: namespaceName.split('::'),
          startLine: i + 1
        });
        console.log(`   ✓ Found export namespace: ${namespaceName} (parts: [${namespaceName.split('::').join(', ')}])`);
      }
      
      // Export using: "export using Type = ::Type;"
      const exportUsingMatch = line.match(/^export\s+using\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+?)\s*;/);
      if (exportUsingMatch) {
        analysis.exportUsings.push({
          alias: exportUsingMatch[1],
          type: exportUsingMatch[2],
          line: i + 1
        });
        console.log(`   ✓ Found export using: ${exportUsingMatch[1]} = ${exportUsingMatch[2]}`);
      }
    }

    return analysis;
  }

  /**
   * Enhance parse result with module information
   */
  private enhanceResultWithModuleInfo(result: EnhancedModuleInfo, moduleInfo: ModuleAnalysis): void {
    // Set module information
    result.moduleInfo = {
      isModule: moduleInfo.exportModuleName !== null,
      moduleName: moduleInfo.exportModuleName,
      importedModules: moduleInfo.importedModules,
      exportNamespaces: moduleInfo.exportNamespaces.map(ns => ns.name)
    };

    // Apply namespace context to classes and methods
    this.applyNamespaceContext(result, moduleInfo);
    
    // Enhance exports with module context
    this.enhanceExportsWithModuleContext(result, moduleInfo);
  }

  /**
   * Apply namespace context based on detected export namespaces
   */
  private applyNamespaceContext(result: EnhancedModuleInfo, moduleInfo: ModuleAnalysis): void {
    // For each export namespace, find the content within it
    for (const exportNs of moduleInfo.exportNamespaces) {
      console.log(`   🔍 Applying namespace context: ${exportNs.name}`);
      
      // Update classes that should be in this namespace
      result.classes.forEach(cls => {
        if (!cls.namespace || cls.namespace === 'undefined') {
          cls.namespace = exportNs.name;
          console.log(`     ✓ Updated ${cls.name} namespace to ${exportNs.name}`);
        }
      });
      
      // Update methods that should be in this namespace
      result.methods.forEach(method => {
        if (!method.namespace) {
          method.namespace = exportNs.name;
          method.qualifiedName = `${exportNs.name}::${method.className ? method.className + '::' : ''}${method.name}`;
          method.isExported = true;
          console.log(`     ✓ Updated ${method.name} namespace to ${exportNs.name}`);
        }
      });
    }
  }

  /**
   * Enhance exports with module context
   */
  private enhanceExportsWithModuleContext(result: EnhancedModuleInfo, moduleInfo: ModuleAnalysis): void {
    // Add export using declarations to exports
    for (const exportUsing of moduleInfo.exportUsings) {
      result.exports.push({
        symbol: exportUsing.alias,
        type: 'using_alias',
        signature: `using ${exportUsing.alias} = ${exportUsing.type}`,
        originalType: exportUsing.type,
        isModuleExport: true,
        location: { line: exportUsing.line, column: 1 }
      });
    }

    // Mark existing exports as module exports if in export namespace
    result.exports.forEach(exp => {
      if (moduleInfo.exportNamespaces.length > 0) {
        exp.isModuleExport = true;
        exp.moduleContext = moduleInfo.exportModuleName || undefined;
      }
    });
  }

  /**
   * Enhance result with detailed type analysis
   */
  private enhanceWithDetailedTypes(result: EnhancedModuleInfo): void {
    console.log(`   🔬 Enhancing with detailed type analysis...`);
    const startTime = Date.now();
    let classTime = 0;
    let methodTime = 0;
    
    // Enhance class members with detailed type information
    const classStart = Date.now();
    result.classes.forEach(cls => {
      if (cls.members) {
        cls.enhancedMembers = cls.members.map(member => 
          this.typeAnalyzer.analyzeMember(
            member.name,
            member.type,
            {
              visibility: member.visibility,
              modifiers: this.extractMemberModifiers(member)
            }
          )
        );
      }
    });
    classTime = Date.now() - classStart;
    
    // Enhance method signatures with detailed type information
    const methodStart = Date.now();
    result.methods.forEach(method => {
      const context = {
        className: method.className,
        namespace: method.namespace,
        visibility: method.visibility,
        modifiers: this.extractMethodModifiers(method),
        location: method.location
      };
      
      method.enhancedSignature = this.typeAnalyzer.analyzeMethodSignature(
        method.name,
        method.returnType,
        method.parameters || [],
        context
      );
      
      // Add detailed type info for return type
      method.returnTypeInfo = this.typeAnalyzer.analyzeType(
        method.returnType,
        { namespace: method.namespace }
      );
      
      // Enhance parameters with detailed type information
      if (method.parameters) {
        method.enhancedParameters = method.parameters.map((param, index) => ({
          name: param.name,
          typeInfo: this.typeAnalyzer.analyzeType(param.type, { namespace: method.namespace }),
          defaultValue: param.defaultValue,
          isVariadic: false,
          parameterIndex: index,
          location: { line: 0, column: 0 },
          // Original parameter info for compatibility
          originalParam: param
        }));
      }
    });
    methodTime = Date.now() - methodStart;
    
    const totalTime = Date.now() - startTime;
    console.log(`     ✓ Enhanced ${result.classes.length} classes and ${result.methods.length} methods with type info`);
    if (totalTime > 100) {
      console.log(`     ⚠️ Type analysis took ${totalTime}ms (classes: ${classTime}ms, methods: ${methodTime}ms)`);
    }
  }
  
  private extractMemberModifiers(member: any): string[] {
    const modifiers: string[] = [];
    if (member.isStatic) modifiers.push('static');
    if (member.isConst) modifiers.push('const');
    if (member.isMutable) modifiers.push('mutable');
    return modifiers;
  }
  
  private extractMethodModifiers(method: any): string[] {
    const modifiers: string[] = [];
    if (method.isVirtual) modifiers.push('virtual');
    if (method.isStatic) modifiers.push('static');
    if (method.isConst) modifiers.push('const');
    return modifiers;
  }

  /**
   * Parse enum with enhanced C++20/23 support
   */
  protected parseEnumEnhanced(content: string, startPos: number): EnumParseResult | null {
    // Look for enum class patterns
    const enumClassRegex = /enum\s+class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{([^}]+)\}/g;
    const enumRegex = /enum\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s*([a-zA-Z_][a-zA-Z0-9_]*))?\s*\{([^}]+)\}/g;
    
    const contentFromPos = content.substring(startPos);
    
    // Try enum class first
    let match = enumClassRegex.exec(contentFromPos);
    if (match) {
      return this.parseEnumMatch(match, true, startPos);
    }
    
    // Try regular enum
    match = enumRegex.exec(contentFromPos);
    if (match) {
      return this.parseEnumMatch(match, false, startPos);
    }
    
    return null;
  }

  private parseEnumMatch(match: RegExpExecArray, isEnumClass: boolean, startPos: number): EnumParseResult {
    const [fullMatch, name, baseType, body] = match;
    
    // Parse enum values
    const values: string[] = [];
    const valueLines = body.split(',');
    
    for (const valueLine of valueLines) {
      const trimmed = valueLine.trim();
      if (trimmed) {
        // Extract just the identifier (before any = or comments)
        const valueMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (valueMatch) {
          values.push(valueMatch[1]);
        }
      }
    }
    
    console.log(`   🔢 Parsed ${isEnumClass ? 'enum class' : 'enum'}: ${name} with values [${values.join(', ')}]`);
    
    return {
      name,
      isEnumClass,
      baseType: baseType || undefined,
      values,
      position: startPos + (match.index || 0)
    };
  }
}

/**
 * Module analysis result
 */
interface ModuleAnalysis {
  hasModulePreamble: boolean;
  exportModuleName: string | null;
  importedModules: string[];
  exportNamespaces: ExportNamespace[];
  exportUsings: ExportUsing[];
  moduleType: 'traditional' | 'primary_interface' | 'partition';
}

interface ExportNamespace {
  name: string;
  parts: string[];
  startLine: number;
}

interface ExportUsing {
  alias: string;
  type: string;
  line: number;
}

interface EnumParseResult {
  name: string;
  isEnumClass: boolean;
  baseType?: string;
  values: string[];
  position: number;
}

// Extend the module info interface
declare module '../types/essential-features.js' {
  interface EnhancedModuleInfo {
    moduleInfo?: {
      isModule: boolean;
      moduleName?: string | null;
      importedModules: string[];
      exportNamespaces: string[];
    };
  }
}