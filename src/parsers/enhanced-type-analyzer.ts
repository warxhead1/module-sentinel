/**
 * Enhanced Type Analyzer for C++ Types
 * Provides deep analysis of C++ type information including templates, qualifiers, etc.
 */

export interface DetailedTypeInfo {
  baseType: string;
  qualifiedName: string;
  isPointer: boolean;
  isReference: boolean;
  isConst: boolean;
  isVolatile: boolean;
  isTemplate: boolean;
  templateArguments: DetailedTypeInfo[];
  arrayDimensions: number[];
  namespace?: string;
  isBuiltin: boolean;
  isStdType: boolean;
  isVulkanType: boolean;
  isPlanetGenType: boolean;
  modifiers: string[];
}

export interface EnhancedParameterInfo {
  name: string;
  typeInfo: DetailedTypeInfo;
  defaultValue?: string;
  isVariadic: boolean;
  parameterIndex: number;
  location: { line: number; column: number };
}

export interface EnhancedMethodSignature {
  name: string;
  qualifiedName: string;
  className?: string;
  namespace?: string;
  returnTypeInfo: DetailedTypeInfo;
  parameters: EnhancedParameterInfo[];
  visibility: 'public' | 'private' | 'protected';
  isVirtual: boolean;
  isStatic: boolean;
  isConst: boolean;
  isOverride: boolean;
  isFinal: boolean;
  isNoexcept: boolean;
  templateParameters: string[];
  isConstructor: boolean;
  isDestructor: boolean;
  isOperator: boolean;
  operatorType?: string;
  location: { line: number; column: number };
}

export interface EnhancedMemberInfo {
  name: string;
  typeInfo: DetailedTypeInfo;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  isMutable: boolean;
  bitfieldSize?: number;
  defaultValue?: string;
  location: { line: number; column: number };
}

export class EnhancedTypeAnalyzer {
  private builtinTypes = new Set([
    'void', 'bool', 'char', 'wchar_t', 'char16_t', 'char32_t',
    'signed', 'unsigned', 'short', 'int', 'long', 'float', 'double',
    'size_t', 'ptrdiff_t', 'nullptr_t'
  ]);

  /**
   * Analyze a C++ type string to extract detailed type information
   */
  analyzeType(typeString: string, context?: { namespace?: string }): DetailedTypeInfo {
    const cleanType = this.cleanTypeString(typeString);
    
    return {
      baseType: this.extractBaseType(cleanType),
      qualifiedName: this.getQualifiedTypeName(cleanType, context),
      isPointer: this.isPointerType(cleanType),
      isReference: this.isReferenceType(cleanType),
      isConst: this.isConstType(cleanType),
      isVolatile: this.isVolatileType(cleanType),
      isTemplate: this.isTemplateType(cleanType),
      templateArguments: this.extractTemplateArguments(cleanType),
      arrayDimensions: this.extractArrayDimensions(cleanType),
      namespace: this.extractNamespace(cleanType),
      isBuiltin: this.isBuiltinType(cleanType),
      isStdType: this.isStandardLibraryType(cleanType),
      isVulkanType: this.isVulkanType(cleanType),
      isPlanetGenType: this.isPlanetGenType(cleanType),
      modifiers: this.extractModifiers(cleanType)
    };
  }

  /**
   * Analyze method signature with enhanced type information
   */
  analyzeMethodSignature(
    name: string,
    returnType: string,
    parameters: any[],
    context: {
      className?: string;
      namespace?: string;
      visibility?: string;
      modifiers?: string[];
      location?: { line: number; column: number };
    }
  ): EnhancedMethodSignature {
    
    const qualifiedName = this.buildQualifiedName(name, context.className, context.namespace);
    
    return {
      name,
      qualifiedName,
      className: context.className,
      namespace: context.namespace,
      returnTypeInfo: this.analyzeType(returnType, context),
      parameters: parameters.map((param, index) => this.analyzeParameter(param, index, context)),
      visibility: (context.visibility as any) || 'public',
      isVirtual: context.modifiers?.includes('virtual') || false,
      isStatic: context.modifiers?.includes('static') || false,
      isConst: context.modifiers?.includes('const') || false,
      isOverride: context.modifiers?.includes('override') || false,
      isFinal: context.modifiers?.includes('final') || false,
      isNoexcept: context.modifiers?.includes('noexcept') || false,
      templateParameters: this.extractTemplateParameters(context.modifiers || []),
      isConstructor: name === context.className,
      isDestructor: name.startsWith('~'),
      isOperator: name.startsWith('operator'),
      operatorType: name.startsWith('operator') ? name.substring(8).trim() : undefined,
      location: context.location || { line: 0, column: 0 }
    };
  }

  /**
   * Analyze member variable with enhanced type information
   */
  analyzeMember(
    name: string,
    type: string,
    context: {
      visibility?: string;
      modifiers?: string[];
      defaultValue?: string;
      location?: { line: number; column: number };
    }
  ): EnhancedMemberInfo {
    
    return {
      name,
      typeInfo: this.analyzeType(type, { namespace: undefined }),
      visibility: (context.visibility as any) || 'public',
      isStatic: context.modifiers?.includes('static') || false,
      isMutable: context.modifiers?.includes('mutable') || false,
      bitfieldSize: this.extractBitfieldSize(type),
      defaultValue: context.defaultValue,
      location: context.location || { line: 0, column: 0 }
    };
  }

  // Private helper methods

  private cleanTypeString(type: string): string {
    return type.trim().replace(/\s+/g, ' ');
  }

  private extractBaseType(type: string): string {
    // Remove cv-qualifiers, pointers, references
    let baseType = type
      .replace(/\bconst\s+/g, '')
      .replace(/\bvolatile\s+/g, '')
      .replace(/[&*]+$/, '')
      .trim();
    
    // Remove array brackets
    baseType = baseType.replace(/\[[^\]]*\]/g, '');
    
    // For template types, get the base template name
    const templateMatch = baseType.match(/^([^<]+)/);
    if (templateMatch) {
      baseType = templateMatch[1].trim();
    }
    
    return baseType;
  }

  private getQualifiedTypeName(type: string, context?: { namespace?: string }): string {
    const baseType = this.extractBaseType(type);
    
    // If already qualified, return as-is
    if (baseType.includes('::')) {
      return baseType;
    }
    
    // If in a namespace and not a builtin type, qualify it
    if (context?.namespace && !this.isBuiltinType(baseType)) {
      return `${context.namespace}::${baseType}`;
    }
    
    return baseType;
  }

  private isPointerType(type: string): boolean {
    return type.includes('*');
  }

  private isReferenceType(type: string): boolean {
    return type.includes('&');
  }

  private isConstType(type: string): boolean {
    return type.includes('const');
  }

  private isVolatileType(type: string): boolean {
    return type.includes('volatile');
  }

  private isTemplateType(type: string): boolean {
    return type.includes('<') && type.includes('>');
  }

  private extractTemplateArguments(type: string): DetailedTypeInfo[] {
    if (!this.isTemplateType(type)) {
      return [];
    }
    
    const match = type.match(/<(.+)>$/);
    if (!match) return [];
    
    const argsString = match[1];
    const args = this.splitTemplateArguments(argsString);
    
    return args.map(arg => this.analyzeType(arg.trim()));
  }

  private splitTemplateArguments(argsString: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    
    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];
      
      if (char === '<') {
        depth++;
      } else if (char === '>') {
        depth--;
      } else if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
      
      current += char;
    }
    
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  }

  private extractArrayDimensions(type: string): number[] {
    const dimensions: number[] = [];
    const matches = type.match(/\[([^\]]*)\]/g);
    
    if (matches) {
      for (const match of matches) {
        const size = match.slice(1, -1).trim();
        if (size) {
          const parsed = parseInt(size, 10);
          dimensions.push(isNaN(parsed) ? -1 : parsed); // -1 for dynamic size
        } else {
          dimensions.push(-1); // Empty brackets = dynamic
        }
      }
    }
    
    return dimensions;
  }

  private extractNamespace(type: string): string | undefined {
    const parts = type.split('::');
    if (parts.length > 1) {
      return parts.slice(0, -1).join('::');
    }
    return undefined;
  }

  private isBuiltinType(type: string): boolean {
    const baseType = this.extractBaseType(type);
    return this.builtinTypes.has(baseType) || baseType === 'auto' || baseType === 'decltype';
  }

  private isStandardLibraryType(type: string): boolean {
    return type.startsWith('std::') || type.includes('std::');
  }

  private isVulkanType(type: string): boolean {
    return type.startsWith('Vk') || type.startsWith('VK_');
  }

  private isPlanetGenType(type: string): boolean {
    return type.includes('PlanetGen::') || type.includes('Generation::') || type.includes('Rendering::');
  }

  private extractModifiers(type: string): string[] {
    const modifiers: string[] = [];
    
    if (type.includes('const')) modifiers.push('const');
    if (type.includes('volatile')) modifiers.push('volatile');
    if (type.includes('static')) modifiers.push('static');
    if (type.includes('mutable')) modifiers.push('mutable');
    if (type.includes('*')) modifiers.push('pointer');
    if (type.includes('&')) modifiers.push('reference');
    
    return modifiers;
  }

  private buildQualifiedName(name: string, className?: string, namespace?: string): string {
    const parts: string[] = [];
    
    if (namespace) parts.push(namespace);
    if (className) parts.push(className);
    parts.push(name);
    
    return parts.join('::');
  }

  private analyzeParameter(param: any, index: number, context: any): EnhancedParameterInfo {
    return {
      name: param.name || `param${index}`,
      typeInfo: this.analyzeType(param.type, context),
      defaultValue: param.defaultValue,
      isVariadic: param.name === '...' || param.type === '...',
      parameterIndex: index,
      location: param.location || { line: 0, column: 0 }
    };
  }

  private extractTemplateParameters(modifiers: string[]): string[] {
    // Extract template parameters from method context
    // This would need more sophisticated parsing
    return [];
  }

  private extractBitfieldSize(type: string): number | undefined {
    const match = type.match(/:(\d+)$/);
    return match ? parseInt(match[1], 10) : undefined;
  }
}