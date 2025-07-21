/**
 * C++ specific patterns for pattern-based parsing
 */

import { SymbolPattern, RelationshipPattern } from './pattern-based-parser.js';

export interface ParseContext {
  currentNamespace?: string;
  insideClass?: string;
  templateDepth: number;
  currentLine?: number;
}

export const CPP_SYMBOL_PATTERNS: SymbolPattern[] = [
  // Namespaces
  {
    pattern: /^\s*(?:export\s+)?namespace\s+(\w+(?:::\w+)*)\s*{?/,
    kind: 'namespace',
    nameGroup: 1
  },
  
  // Classes and structs
  {
    pattern: /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)(?:\s*:\s*(.+?))?(?:\s*{|$)/,
    kind: 'class',
    nameGroup: 2
  },
  
  // Functions (including methods)
  {
    pattern: /^\s*(?:export\s+)?(?:template\s*<[^>]+>\s*)?(?:inline\s+)?(?:static\s+)?(?:virtual\s+)?(?:constexpr\s+)?([\w:&<>,\s*]+?)\s+(\w+)\s*\([^)]*\)(?:\s*const)?(?:\s*noexcept)?(?:\s*->[\w\s<>,&*]+)?(?:\s*{|;)/,
    kind: 'function',
    nameGroup: 2,
    returnTypeGroup: 1
  },
  
  // Enums
  {
    pattern: /^\s*(?:export\s+)?enum(?:\s+class)?\s+(\w+)(?:\s*:\s*\w+)?\s*{/,
    kind: 'enum',
    nameGroup: 1
  },
  
  // Type aliases
  {
    pattern: /^\s*(?:export\s+)?using\s+(\w+)\s*=\s*(.+);/,
    kind: 'typedef',
    nameGroup: 1
  }
];

export const CPP_RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // Class inheritance (class Derived : public Base)
  {
    pattern: /(?:export\s+)?(?:template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)\s*:\s*(?:public|private|protected)\s+(\w+(?:::\w+)*)/,
    relationshipType: 'inherits',
    fromGroup: 2,
    toGroup: 3
  },
  
  // Function calls
  {
    pattern: /\b(\w+(?:::\w+)*)\s*\(/,
    relationshipType: 'calls',
    toGroup: 1
  },
  
  // Includes
  {
    pattern: /#include\s*[<"]([^>"]+)[>"]/,
    relationshipType: 'imports',
    toGroup: 1
  },
  
  // Module imports
  {
    pattern: /^\s*(?:export\s+)?import\s+(\w+(?:\.\w+)*);/,
    relationshipType: 'imports',
    toGroup: 1
  }
];

export const CPP_PATTERN_DETECTORS = [
  {
    detect: (symbols: any[]) => {
      const hasFactory = symbols.some(s => 
        s.name.toLowerCase().includes('factory') || 
        s.name.toLowerCase().includes('create')
      );
      
      if (hasFactory) {
        return {
          type: 'factory',
          confidence: 0.8,
          description: 'Factory pattern detected'
        };
      }
      return null;
    }
  },
  
  {
    detect: (symbols: any[]) => {
      const gpuKeywords = ['kernel', 'gpu', 'cuda', 'opencl', 'compute', 'shader'];
      const hasGPU = symbols.some(s => 
        gpuKeywords.some(keyword => s.name.toLowerCase().includes(keyword))
      );
      
      if (hasGPU) {
        return {
          type: 'gpu-execution',
          confidence: 0.9,
          description: 'GPU execution pattern detected'
        };
      }
      return null;
    }
  }
];