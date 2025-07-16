import Database from 'better-sqlite3';
import * as path from 'path';

/**
 * Relationship Extraction Helper
 * Handles the complex relationship extraction logic that was making PatternAwareIndexer too large
 */
export class RelationshipExtractionHelper {
  private db: Database.Database;
  private debugMode: boolean;

  constructor(db: Database.Database, debugMode: boolean = false) {
    this.db = db;
    this.debugMode = debugMode;
  }

  /**
   * OPTIMIZED: Extract and store relationships for ALL files in a single batch operation
   * Ancient wisdom: Do the expensive work once, not per file
   */
  async extractAndStoreAllFileRelationshipsBatch(allValidResults: any[]): Promise<void> {
    if (allValidResults.length === 0) return;
    
    // 1. Build symbol lookup tables ONCE for all files (memoization)
    const symbolLookup = new Map<string, any[]>(); // file_path -> symbols
    const symbolById = new Map<number, any>();
    const symbolByName = new Map<string, any[]>();
    
    // Single query to get ALL symbols for ALL files
    const allFilePaths = allValidResults.map(r => r.filePath);
    const placeholders = allFilePaths.map(() => '?').join(',');
    const allSymbols = this.db.prepare(`
      SELECT id, name, qualified_name, kind, parent_class, signature, line, file_path
      FROM enhanced_symbols 
      WHERE file_path IN (${placeholders})
    `).all(...allFilePaths) as any[];
    
    // Build lookup tables
    for (const symbol of allSymbols) {
      // By file path
      if (!symbolLookup.has(symbol.file_path)) {
        symbolLookup.set(symbol.file_path, []);
      }
      symbolLookup.get(symbol.file_path)!.push(symbol);
      
      // By ID
      symbolById.set(symbol.id, symbol);
      
      // By name (for cross-file lookups)
      if (!symbolByName.has(symbol.name)) {
        symbolByName.set(symbol.name, []);
      }
      symbolByName.get(symbol.name)!.push(symbol);
    }
    
    // 2. Extract relationships for all files using cached lookups
    const allRelationships: any[] = [];
    
    for (const result of allValidResults) {
      const fileSymbols = symbolLookup.get(result.filePath) || [];
      
      if (fileSymbols.length === 0) {
        console.warn(`⚠️  No symbols found in database for ${path.basename(result.filePath)} - skipping relationships`);
        continue;
      }
      
      // Extract relationships for this file (using cached data)
      const fileRelationships = this.extractFileRelationshipsFast(
        fileSymbols, 
        result.parseResult, 
        result.filePath,
        symbolByName // Pass the global symbol lookup
      );
      
      allRelationships.push(...fileRelationships);
    }
    
    // 3. Store all relationships in a single batch transaction
    if (allRelationships.length > 0) {
      this.storeRelationshipsBatch(allRelationships);
    }
  }

  /**
   * Fast relationship extraction using pre-built lookup tables
   */
  private extractFileRelationshipsFast(
    symbols: any[], 
    parseResult: any, 
    filePath: string,
    globalSymbolLookup: Map<string, any[]>
  ): any[] {
    const relationships: any[] = [];
    
    // 1. Extract direct relationships from parser
    if (parseResult && parseResult.relationships) {
      const parserRelationships = Array.isArray(parseResult.relationships) ? 
        parseResult.relationships : [];
      
      for (const rel of parserRelationships) {
        relationships.push({
          ...rel,
          fromFile: filePath,
          toFile: filePath // same file for now, cross-file comes later
        });
      }
    }
    
    // 2. Extract include/import dependencies
    this.extractIncludeRelationships(relationships, parseResult, filePath);
    
    // 3. Extract inheritance relationships
    this.extractInheritanceRelationships(relationships, symbols, parseResult);
    
    // 4. Extract function call relationships
    this.extractCallRelationships(relationships, symbols, globalSymbolLookup);
    
    // 5. Extract usage relationships
    this.extractUsageRelationships(relationships, symbols, parseResult);
    
    return relationships;
  }

  /**
   * Extract include and import relationships
   */
  private extractIncludeRelationships(relationships: any[], parseResult: any, filePath: string): void {
    // Extract includes
    if (parseResult && parseResult.includes) {
      const includes = parseResult.includes instanceof Set ? 
        Array.from(parseResult.includes) : parseResult.includes;
      
      for (const include of includes) {
        relationships.push({
          fromSymbol: path.basename(filePath),
          fromFile: filePath,
          toSymbol: include,
          toFile: null, // Will be resolved later
          relationshipType: 'includes',
          confidence: 0.9
        });
      }
    }
    
    // Extract imports (C++23 modules)
    if (parseResult && parseResult.imports) {
      const imports = parseResult.imports instanceof Set ? 
        Array.from(parseResult.imports) : parseResult.imports;
      
      // Get the module name from moduleInfo if available
      const fromModuleName = (parseResult.moduleInfo && parseResult.moduleInfo.moduleName) 
        ? parseResult.moduleInfo.moduleName 
        : path.basename(filePath, path.extname(filePath));
      
      for (const importItem of imports) {
        // Handle both string imports and object imports { module: 'name', ... }
        const moduleName = typeof importItem === 'string' ? importItem : importItem.module;
        relationships.push({
          fromSymbol: fromModuleName,
          fromFile: filePath,
          toSymbol: moduleName,
          toFile: null,
          relationshipType: 'imports',
          confidence: 0.9
        });
      }
    }
  }

  /**
   * Extract inheritance relationships
   */
  private extractInheritanceRelationships(relationships: any[], symbols: any[], parseResult: any): void {
    // Look for inheritance patterns in class signatures
    const classSymbols = symbols.filter(s => s.kind === 'class' || s.kind === 'struct');
    
    for (const classSymbol of classSymbols) {
      if (classSymbol.signature) {
        // Match patterns like "class Foo : public Bar"
        const inheritancePattern = /:\\s*(public|private|protected)?\\s*([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)/g;
        let match;
        
        while ((match = inheritancePattern.exec(classSymbol.signature)) !== null) {
          const inheritanceType = match[1] || 'public';
          const baseClass = match[2];
          
          relationships.push({
            fromSymbol: classSymbol.name,
            fromFile: classSymbol.file_path,
            toSymbol: baseClass,
            toFile: null, // Will be resolved later
            relationshipType: 'inherits',
            confidence: 0.9,
            evidence: { inheritanceType }
          });
        }
      }
    }
  }

  /**
   * Extract function call relationships - INTELLIGENT VERSION
   * Only extract actual function calls, not scope resolution noise
   */
  private extractCallRelationships(relationships: any[], symbols: any[], globalSymbolLookup: Map<string, any[]>): void {
    const functionSymbols = symbols.filter(s => s.kind === 'function' || s.kind === 'method');
    
    for (const funcSymbol of functionSymbols) {
      if (funcSymbol.signature) {
        // INTELLIGENT EXTRACTION: Look for actual function calls
        const actualCalls = this.extractActualFunctionCalls(funcSymbol.signature, funcSymbol.name);
        
        for (const calledFunction of actualCalls) {
          // CRITICAL: Skip self-calls 
          if (calledFunction === funcSymbol.name || calledFunction === funcSymbol.parent_class) {
            continue;
          }
          
          // Use global lookup to find the target symbol
          const targetSymbols = globalSymbolLookup.get(calledFunction) || [];
          
          for (const target of targetSymbols) {
            // CRITICAL: Skip self-references completely
            if (target.name === funcSymbol.name && target.file_path === funcSymbol.file_path) {
              continue;
            }
            
            relationships.push({
              fromSymbol: funcSymbol.name,
              fromFile: funcSymbol.file_path,
              toSymbol: target.name,
              toFile: target.file_path,
              relationshipType: 'calls',
              confidence: 0.85 // Higher confidence for filtered results
            });
          }
        }
      }
    }
  }

  /**
   * Extract actual function calls from code, not just scope resolution
   */
  private extractActualFunctionCalls(signature: string, functionName: string): string[] {
    const actualCalls: string[] = [];
    
    // Pattern 1: Direct function calls like "CreateBuffer()" 
    // But NOT scope resolution like "Class::method"
    const functionCallPattern = /(\w+)\s*\(/g;
    let match;
    
    while ((match = functionCallPattern.exec(signature)) !== null) {
      const calledFunction = match[1];
      
      // Filter out noise
      if (this.isActualFunctionCall(calledFunction, functionName)) {
        actualCalls.push(calledFunction);
      }
    }
    
    // Pattern 2: Member function calls like "obj.method()"
    const memberCallPattern = /(\w+)\.(\w+)\s*\(/g;
    while ((match = memberCallPattern.exec(signature)) !== null) {
      const calledFunction = match[2]; // The method name
      if (this.isActualFunctionCall(calledFunction, functionName)) {
        actualCalls.push(calledFunction);
      }
    }
    
    return [...new Set(actualCalls)]; // Remove duplicates
  }

  /**
   * Check if a word represents an actual function call
   */
  private isActualFunctionCall(word: string, containingFunction: string): boolean {
    // Skip if it's the same as the containing function
    if (word === containingFunction) {
      return false;
    }
    
    // Skip C++ keywords and operators
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'return', 'break', 'continue',
      'try', 'catch', 'throw', 'new', 'delete', 'sizeof', 'typeof', 'const', 'static', 'volatile',
      'inline', 'virtual', 'override', 'final', 'public', 'private', 'protected', 'class', 'struct',
      'namespace', 'using', 'template', 'typename', 'auto', 'decltype', 'nullptr', 'true', 'false',
      'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast'
    ]);
    
    if (keywords.has(word)) {
      return false;
    }
    
    // Skip single-character words and very short words (likely variables)
    if (word.length <= 2) {
      return false;
    }
    
    // Skip common Vulkan constants/enums (these aren't function calls)
    if (word.startsWith('VK_') || word.startsWith('vk') && word.length > 2) {
      return false;
    }
    
    return true;
  }

  /**
   * Extract usage relationships - INTELLIGENT VERSION
   * Only extract meaningful type usage, not noise from signatures
   */
  private extractUsageRelationships(relationships: any[], symbols: any[], parseResult: any): void {
    // Look for type usage in function signatures
    const functionSymbols = symbols.filter(s => s.kind === 'function' || s.kind === 'method');
    
    for (const funcSymbol of functionSymbols) {
      if (funcSymbol.signature) {
        // INTELLIGENT EXTRACTION: Only extract meaningful relationships
        const meaningfulTypes = this.extractMeaningfulTypeUsage(funcSymbol.signature, funcSymbol.name);
        
        for (const usedType of meaningfulTypes) {
          // CRITICAL: Skip self-references
          if (usedType === funcSymbol.name || usedType === funcSymbol.parent_class) {
            continue;
          }
          
          relationships.push({
            fromSymbol: funcSymbol.name,
            fromFile: funcSymbol.file_path,
            toSymbol: usedType,
            toFile: null, // Will be resolved later
            relationshipType: 'uses',
            confidence: 0.8 // Higher confidence for filtered results
          });
        }
      }
    }
  }

  /**
   * Extract meaningful type usage from a function signature
   * This avoids the noise from overly broad regex patterns
   */
  private extractMeaningfulTypeUsage(signature: string, functionName: string): string[] {
    const meaningfulTypes: string[] = [];
    
    // Built-in types to ignore
    const builtinTypes = new Set([
      'void', 'int', 'float', 'double', 'bool', 'char', 'short', 'long', 'unsigned', 'signed',
      'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
      'string', 'wstring', 'String', 'Int', 'Float', 'Double', 'Bool', 'Void',
      'auto', 'decltype', 'std::string', 'std::vector', 'std::shared_ptr', 'std::unique_ptr',
      'VkResult', 'VkDevice', 'VkBuffer', 'VkDeviceMemory', 'VkDeviceSize', // Vulkan built-ins
      functionName // Don't relate to self
    ]);
    
    // Pattern 1: Parameter types (but not the parameter names)
    // Example: "void ProcessTerrain(const PlanetaryData& data, TerrainConfig config)"
    const parameterPattern = /(\w+(?:::\w+)*)\s*[\s&*]*\s*\w+\s*[,)]/g;
    let match;
    
    while ((match = parameterPattern.exec(signature)) !== null) {
      const typeName = match[1];
      if (!builtinTypes.has(typeName) && typeName !== functionName) {
        meaningfulTypes.push(typeName);
      }
    }
    
    // Pattern 2: Return types (but only custom types)
    // Example: "TerrainResult GenerateTerrain()" -> TerrainResult
    const returnTypePattern = /^\s*(\w+(?:::\w+)*)\s+\w+\s*\(/;
    const returnMatch = returnTypePattern.exec(signature);
    if (returnMatch) {
      const returnType = returnMatch[1];
      if (!builtinTypes.has(returnType) && returnType !== functionName) {
        meaningfulTypes.push(returnType);
      }
    }
    
    // Pattern 3: Template parameters (custom types only)
    // Example: "std::shared_ptr<BufferResource>" -> BufferResource
    const templatePattern = /<(\w+(?:::\w+)*)>/g;
    while ((match = templatePattern.exec(signature)) !== null) {
      const templateType = match[1];
      if (!builtinTypes.has(templateType) && templateType !== functionName) {
        meaningfulTypes.push(templateType);
      }
    }
    
    return [...new Set(meaningfulTypes)]; // Remove duplicates
  }

  /**
   * Store relationships in batch using a transaction with intelligent deduplication
   */
  private storeRelationshipsBatch(relationships: any[]): void {
    if (relationships.length === 0) return;
    
    // INTELLIGENT DEDUPLICATION: Remove duplicates and self-references before storing
    const dedupedRelationships = this.deduplicateRelationships(relationships);
    
    if (dedupedRelationships.length === 0) {
      if (this.debugMode) {
        console.log(`📊 All ${relationships.length} relationships were filtered out as duplicates or self-references`);
      }
      return;
    }
    
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO symbol_relationships (
        from_symbol_id, to_symbol_id, from_name, to_name, 
        relationship_type, confidence, source_context, detected_by
      ) VALUES (
        (SELECT id FROM enhanced_symbols WHERE name = ? AND file_path = ? LIMIT 1),
        (SELECT id FROM enhanced_symbols WHERE name = ? LIMIT 1),
        ?, ?, ?, ?, ?, ?
      )
    `);
    
    const transaction = this.db.transaction(() => {
      let inserted = 0;
      let skipped = 0;
      
      for (const rel of dedupedRelationships) {
        try {
          // CRITICAL: Ensure all parameters are strings, not objects
          const fromSymbol = typeof rel.fromSymbol === 'string' ? rel.fromSymbol : String(rel.fromSymbol);
          const toSymbol = typeof rel.toSymbol === 'string' ? rel.toSymbol : String(rel.toSymbol);
          const relationshipType = typeof rel.relationshipType === 'string' ? rel.relationshipType : String(rel.relationshipType);
          
          const result = insertStmt.run(
            fromSymbol,            // for first subquery (name)
            rel.fromFile,          // for first subquery (file_path)
            toSymbol,              // for second subquery (name)
            fromSymbol,            // from_name
            toSymbol,              // to_name
            relationshipType,      // relationship_type
            rel.confidence || 0.8, // confidence
            rel.evidence ? JSON.stringify(rel.evidence) : null, // source_context
            'relationship-helper-v2' // detected_by
          );
          
          if (result.changes > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (error) {
          skipped++;
          // Skip invalid relationships
          if (this.debugMode) {
            console.warn(`Failed to store relationship: ${rel.fromSymbol} -> ${rel.toSymbol}`, error);
            console.warn('Relationship object details:', JSON.stringify(rel, null, 2));
          }
        }
      }
      
      if (this.debugMode) {
        console.log(`📊 Relationship storage: ${inserted} inserted, ${skipped} skipped out of ${dedupedRelationships.length} filtered (${relationships.length} original)`);
      }
    });
    
    transaction();
    
    if (this.debugMode) {
      console.log(`📊 Stored ${dedupedRelationships.length} relationships in batch (filtered from ${relationships.length})`);
    }
  }

  /**
   * Intelligent deduplication of relationships
   */
  private deduplicateRelationships(relationships: any[]): any[] {
    const deduped: any[] = [];
    const seenRelationships = new Set<string>();
    
    for (const rel of relationships) {
      // CRITICAL: Skip self-references completely
      if (rel.fromSymbol === rel.toSymbol) {
        continue;
      }
      
      // CRITICAL: Skip empty or invalid relationships
      if (!rel.fromSymbol || !rel.toSymbol || !rel.relationshipType) {
        continue;
      }
      
      // Create a unique key for this relationship
      const key = `${rel.fromSymbol}:${rel.fromFile}:${rel.toSymbol}:${rel.relationshipType}`;
      
      // Skip if we've already seen this exact relationship
      if (seenRelationships.has(key)) {
        continue;
      }
      
      seenRelationships.add(key);
      deduped.push(rel);
    }
    
    return deduped;
  }
}