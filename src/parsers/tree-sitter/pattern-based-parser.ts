/**
 * Pattern-based parser fallback
 * 
 * Used when tree-sitter fails or for large files
 */

export interface SymbolPattern {
  pattern: RegExp;
  kind: string;
  nameGroup: number;
  qualifiedNameGroup?: number;
  signatureGroup?: number;
  returnTypeGroup?: number;
}

export interface RelationshipPattern {
  pattern: RegExp;
  relationshipType: string;
  fromGroup?: number;
  toGroup: number;
}

export class PatternBasedParser {
  private symbolPatterns: SymbolPattern[];
  private relationshipPatterns: RelationshipPattern[];
  private debugMode: boolean;
  
  constructor(
    symbolPatterns: SymbolPattern[],
    relationshipPatterns: RelationshipPattern[],
    debugMode: boolean = false
  ) {
    this.symbolPatterns = symbolPatterns;
    this.relationshipPatterns = relationshipPatterns;
    this.debugMode = debugMode;
  }
  
  /**
   * Extract symbols from content (alias for parse for compatibility)
   */
  extractSymbols(content: string, filePath: string): any[] {
    const result = this.parse(content, filePath);
    return result.symbols;
  }
  
  /**
   * Extract relationships from content
   */
  extractRelationships(content: string, filePath: string, symbols?: any[]): any[] {
    const result = this.parse(content, filePath);
    
    // Map relationships to use proper symbol IDs if symbols provided
    if (symbols && symbols.length > 0) {
      return result.relationships.map(rel => ({
        ...rel,
        fromSymbolId: rel.fromName || filePath,
        toSymbolId: rel.toName,
        type: rel.relationshipType,
        contextLine: rel.lineNumber
      }));
    }
    
    return result.relationships;
  }
  
  parse(content: string, filePath: string): {
    symbols: any[];
    relationships: any[];
    patterns: any[];
    controlFlowData: { blocks: any[]; calls: any[] };
  } {
    const lines = content.split('\n');
    const symbols: any[] = [];
    const relationships: any[] = [];
    const patterns: any[] = [];
    const controlFlowData = { blocks: [], calls: [] };
    
    // Extract symbols line by line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Try each symbol pattern
      for (const pattern of this.symbolPatterns) {
        const match = line.match(pattern.pattern);
        if (match) {
          const symbol = {
            name: match[pattern.nameGroup],
            qualifiedName: match[pattern.qualifiedNameGroup || pattern.nameGroup],
            kind: pattern.kind,
            filePath,
            line: lineNum,
            column: 1,
            signature: match[pattern.signatureGroup || 0],
            returnType: match[pattern.returnTypeGroup || 0],
            semanticTags: [pattern.kind],
            complexity: 1,
            confidence: 0.8,
            isDefinition: true,
            isExported: false,
            isAsync: false
          };
          
          symbols.push(symbol);
          
          if (this.debugMode) {
            console.log(`Found ${pattern.kind}: ${symbol.name} at line ${lineNum}`);
          }
        }
      }
      
      // Try each relationship pattern
      for (const pattern of this.relationshipPatterns) {
        const match = line.match(pattern.pattern);
        if (match) {
          const fromName = pattern.fromGroup ? match[pattern.fromGroup] : null;
          const toName = match[pattern.toGroup];
          
          // Skip if we couldn't extract the required information
          if (!toName) continue;
          
          const relationship = {
            fromName: fromName || null,
            toName: toName,
            relationshipType: pattern.relationshipType,
            confidence: 0.7,
            lineNumber: lineNum,
            columnNumber: match.index || 0,
            crossLanguage: false
          };
          
          if (this.debugMode) {
            console.log(`Found ${pattern.relationshipType}: ${fromName || 'current'} -> ${toName} at line ${lineNum}`);
          }
          
          relationships.push(relationship);
        }
      }
    }
    
    return { symbols, relationships, patterns, controlFlowData };
  }
}