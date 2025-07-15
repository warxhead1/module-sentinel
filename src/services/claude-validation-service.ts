import Database from 'better-sqlite3';
import { GeminiTool } from '../tools/gemini-tool.js';
import { CodeContext } from '../types/essential-features.js';
import { EventEmitter } from 'events';
import { ThoughtSignaturePreserver } from '../engines/thought-signature.js';

export interface ClaudeCodeSuggestion {
  userPrompt: string;
  claudeResponse: string;
  suggestedCode: string;
  timestamp: number;
  sessionId: string;
  filePath?: string;
  context?: CodeContext;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  hallucinations: HallucinationDetection[];
  corrections: string[];
  semanticIssues: SemanticIssue[];
  recommendation: 'approve' | 'modify' | 'reject';
  correctedCode?: string;
  explanation: string;
}

export interface HallucinationDetection {
  type: 'method' | 'class' | 'namespace' | 'include' | 'template';
  item: string;
  reason: string;
  confidence: number;
  suggestedAlternative?: string;
  actualLocation?: string;
}

export interface SemanticIssue {
  type: 'architectural_violation' | 'pattern_mismatch' | 'dependency_error' | 'style_violation';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion: string;
}

export class ClaudeValidationService extends EventEmitter {
  private db: Database.Database;
  private geminiTool: GeminiTool;
  private thoughtPreserver: ThoughtSignaturePreserver;

  constructor(db: Database.Database, geminiApiKey: string) {
    super();
    this.db = db;
    this.geminiTool = new GeminiTool(geminiApiKey);
    this.thoughtPreserver = new ThoughtSignaturePreserver(db);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Store Claude suggestions and validation results
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claude_validations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_prompt TEXT NOT NULL,
        claude_response TEXT NOT NULL,
        suggested_code TEXT NOT NULL,
        validation_result TEXT NOT NULL, -- JSON
        timestamp INTEGER NOT NULL,
        file_path TEXT,
        is_valid BOOLEAN NOT NULL,
        confidence REAL NOT NULL,
        recommendation TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hallucination_detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        validation_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        item TEXT NOT NULL,
        reason TEXT NOT NULL,
        confidence REAL NOT NULL,
        suggested_alternative TEXT,
        actual_location TEXT,
        FOREIGN KEY (validation_id) REFERENCES claude_validations(id)
      );

      CREATE TABLE IF NOT EXISTS semantic_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        validation_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        FOREIGN KEY (validation_id) REFERENCES claude_validations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_claude_validations_session ON claude_validations(session_id);
      CREATE INDEX IF NOT EXISTS idx_claude_validations_timestamp ON claude_validations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_hallucinations_validation ON hallucination_detections(validation_id);
    `);
  }

  /**
   * Main validation entry point - validates Claude's code suggestion against semantic database
   */
  async validateClaudeCode(suggestion: ClaudeCodeSuggestion): Promise<ValidationResult> {
    console.log(`🔍 Validating Claude suggestion for: ${suggestion.filePath || 'unknown file'}`);
    
    // 1. Extract symbols and references from Claude's suggested code
    const extractedSymbols = this.extractSymbolsFromCode(suggestion.suggestedCode);
    
    // 2. Check for hallucinations against semantic database
    const hallucinations = await this.detectHallucinations(extractedSymbols, suggestion.filePath);
    
    // 3. Check for semantic/architectural issues
    const semanticIssues = await this.detectSemanticIssues(suggestion);
    
    // 4. Use Gemini for intelligent analysis and correction
    const geminiAnalysis = await this.getGeminiValidation(suggestion, hallucinations, semanticIssues);
    
    // 5. Generate final validation result
    const result = this.generateValidationResult(suggestion, hallucinations, semanticIssues, geminiAnalysis);
    
    // 6. Store validation result
    await this.storeValidationResult(suggestion, result);
    
    // 7. Record feedback for learning
    await this.recordValidationFeedback(suggestion, result);
    
    // 8. Emit validation event for hooks
    this.emit('validation_complete', { suggestion, result });
    
    return result;
  }

  /**
   * Extract method calls, class names, includes, etc. from Claude's code
   */
  private extractSymbolsFromCode(code: string): ExtractedSymbols {
    const symbols: ExtractedSymbols = {
      methods: [],
      classes: [],
      namespaces: [],
      includes: [],
      variables: [],
      templates: []
    };

    // Extract method calls - pattern: identifier(
    const methodMatches = code.match(/(\w+)\s*\(/g);
    if (methodMatches) {
      symbols.methods = methodMatches.map(m => m.replace(/\s*\($/, ''));
    }

    // Extract class/struct declarations and usage
    const classMatches = code.match(/(?:class|struct)\s+(\w+)|(\w+)\s*::|new\s+(\w+)|(\w+)\s+\w+\s*[;=]/g);
    if (classMatches) {
      classMatches.forEach(match => {
        const className = match.match(/(?:class|struct)\s+(\w+)|(\w+)(?=::)|new\s+(\w+)|(\w+)(?=\s+\w+\s*[;=])/);
        if (className) {
          const name = className[1] || className[2] || className[3] || className[4];
          if (name && !symbols.classes.includes(name)) {
            symbols.classes.push(name);
          }
        }
      });
    }

    // Extract includes
    const includeMatches = code.match(/#include\s*[<"]([^>"]+)[>"]/g);
    if (includeMatches) {
      symbols.includes = includeMatches.map(m => m.match(/#include\s*[<"]([^>"]+)[>"]/)![1]);
    }

    // Extract namespace usage
    const namespaceMatches = code.match(/(\w+)::/g);
    if (namespaceMatches) {
      symbols.namespaces = [...new Set(namespaceMatches.map(m => m.replace('::', '')))];
    }

    return symbols;
  }

  /**
   * Enhanced semantic analysis - check symbols against database with better context
   */
  private async detectHallucinations(symbols: ExtractedSymbols, filePath?: string): Promise<HallucinationDetection[]> {
    const hallucinations: HallucinationDetection[] = [];

    // Get relevant context from the database for better analysis
    const contextInfo = await this.gatherSemanticContext(symbols, filePath);

    // Check methods with enhanced context
    for (const method of symbols.methods) {
      const methodAnalysis = this.analyzeMethod(method, contextInfo);
      if (methodAnalysis.isHallucination) {
        hallucinations.push(methodAnalysis.hallucination!);
      }
    }

    // Check classes/types with enhanced context
    for (const className of symbols.classes) {
      // Skip common C++ keywords and types
      if (this.isCommonCppKeyword(className)) continue;
      
      const classAnalysis = this.analyzeClass(className, contextInfo);
      if (classAnalysis.isHallucination) {
        hallucinations.push(classAnalysis.hallucination!);
      }
    }

    // Check namespaces with enhanced context
    for (const namespace of symbols.namespaces) {
      const namespaceAnalysis = this.analyzeNamespace(namespace, contextInfo);
      if (namespaceAnalysis.isHallucination) {
        hallucinations.push(namespaceAnalysis.hallucination!);
      }
    }

    return hallucinations;
  }

  /**
   * Gather comprehensive semantic context from the database
   */
  private async gatherSemanticContext(symbols: ExtractedSymbols, filePath?: string) {
    // Get all symbols that might be relevant
    const allSymbols = this.db.prepare(`
      SELECT name, kind, namespace, parent_class, file_path, signature, return_type
      FROM enhanced_symbols 
      WHERE parser_confidence > 0.3
      ORDER BY parser_confidence DESC
    `).all() as Array<{
      name: string, kind: string, namespace: string, parent_class: string, 
      file_path: string, signature: string, return_type: string
    }>;

    // Get all namespaces
    const namespaces = this.db.prepare(`
      SELECT DISTINCT namespace FROM enhanced_symbols 
      WHERE namespace IS NOT NULL AND namespace != ''
    `).all() as Array<{namespace: string}>;

    // Get enums and their values
    const enums = this.db.prepare(`
      SELECT name, namespace, parent_class, file_path FROM enhanced_symbols 
      WHERE kind IN ('enum', 'enum_value')
    `).all() as Array<{name: string, namespace: string, parent_class: string, file_path: string}>;

    // Get file-specific context if available
    let fileContext: any[] = [];
    if (filePath) {
      fileContext = this.db.prepare(`
        SELECT name, kind, namespace, parent_class, signature 
        FROM enhanced_symbols 
        WHERE file_path LIKE ?
        ORDER BY parser_confidence DESC
      `).all(`%${filePath.split('/').pop()}%`) as any[];
    }

    return {
      allSymbols,
      namespaces: namespaces.map(n => n.namespace),
      enums,
      fileContext,
      methods: allSymbols.filter(s => s.kind === 'method' || s.kind === 'function'),
      classes: allSymbols.filter(s => s.kind === 'class' || s.kind === 'struct'),
      types: allSymbols.filter(s => s.kind === 'enum' || s.kind === 'typedef' || s.kind === 'alias')
    };
  }

  /**
   * Analyze method with enhanced context
   */
  private analyzeMethod(method: string, context: any): {isHallucination: boolean, hallucination?: HallucinationDetection} {
    // Direct match
    const directMatch = context.methods.find((m: any) => m.name === method);
    if (directMatch) {
      return {isHallucination: false};
    }

    // Look for similar methods
    const similar = context.methods.filter((m: any) => 
      m.name.toLowerCase().includes(method.toLowerCase()) ||
      method.toLowerCase().includes(m.name.toLowerCase()) ||
      this.calculateSimilarity(method, m.name) > 0.6
    ).sort((a: any, b: any) => this.calculateSimilarity(method, b.name) - this.calculateSimilarity(method, a.name));

    return {
      isHallucination: true,
      hallucination: {
        type: 'method',
        item: method,
        reason: 'Method not found in codebase',
        confidence: 0.8,
        suggestedAlternative: similar.length > 0 ? similar[0].name : undefined,
        actualLocation: similar.length > 0 ? similar[0].file_path : undefined
      }
    };
  }

  /**
   * Analyze class/type with enhanced context
   */
  private analyzeClass(className: string, context: any): {isHallucination: boolean, hallucination?: HallucinationDetection} {
    // Direct match in classes
    const directClassMatch = context.classes.find((c: any) => c.name === className);
    if (directClassMatch) {
      return {isHallucination: false};
    }

    // Check if it's an enum or typedef
    const enumMatch = context.types.find((t: any) => t.name === className);
    if (enumMatch) {
      return {isHallucination: false};
    }

    // Check for namespace::Type pattern
    const namespacedMatch = context.allSymbols.find((s: any) => 
      s.name === className || 
      (s.namespace && `${s.namespace}::${s.name}` === className) ||
      s.name.endsWith(`::${className}`)
    );
    if (namespacedMatch) {
      return {isHallucination: false};
    }

    // Look for similar classes
    const similar = context.classes.filter((c: any) => 
      c.name.toLowerCase().includes(className.toLowerCase()) ||
      className.toLowerCase().includes(c.name.toLowerCase()) ||
      this.calculateSimilarity(className, c.name) > 0.6
    ).sort((a: any, b: any) => this.calculateSimilarity(className, b.name) - this.calculateSimilarity(className, a.name));

    return {
      isHallucination: true,
      hallucination: {
        type: 'class',
        item: className,
        reason: 'Class not found in codebase',
        confidence: 0.8,
        suggestedAlternative: similar.length > 0 ? similar[0].name : undefined,
        actualLocation: similar.length > 0 ? similar[0].file_path : undefined
      }
    };
  }

  /**
   * Analyze namespace with enhanced context
   */
  private analyzeNamespace(namespace: string, context: any): {isHallucination: boolean, hallucination?: HallucinationDetection} {
    // Direct match
    if (context.namespaces.includes(namespace)) {
      return {isHallucination: false};
    }

    // Partial match (namespace might be part of a longer namespace)
    const partialMatch = context.namespaces.find((ns: string) => 
      ns.includes(namespace) || namespace.includes(ns)
    );
    if (partialMatch) {
      return {isHallucination: false};
    }

    // Don't flag common single-word namespaces that might be implicit
    if (namespace.length <= 4 || ['std', 'cv', 'gl'].includes(namespace)) {
      return {isHallucination: false};
    }

    return {
      isHallucination: true,
      hallucination: {
        type: 'namespace',
        item: namespace,
        reason: 'Namespace not found in codebase',
        confidence: 0.7
      }
    };
  }

  /**
   * Check if a name is a common C++ keyword or type
   */
  private isCommonCppKeyword(name: string): boolean {
    const keywords = [
      'auto', 'const', 'static', 'inline', 'virtual', 'override', 'final',
      'public', 'private', 'protected', 'class', 'struct', 'enum', 'union',
      'int', 'float', 'double', 'char', 'bool', 'void', 'size_t', 'uint32_t',
      'string', 'vector', 'map', 'set', 'shared_ptr', 'unique_ptr', 'weak_ptr'
    ];
    return keywords.includes(name.toLowerCase());
  }

  /**
   * Calculate string similarity
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Check for architectural and semantic issues
   */
  private async detectSemanticIssues(suggestion: ClaudeCodeSuggestion): Promise<SemanticIssue[]> {
    const issues: SemanticIssue[] = [];

    // Check architectural boundaries
    if (suggestion.filePath) {
      const stage = this.determinePipelineStage(suggestion.filePath);
      
      // Check for cross-stage violations
      if (suggestion.suggestedCode.includes('vulkan') && stage !== 'final_rendering') {
        issues.push({
          type: 'architectural_violation',
          description: 'Vulkan API usage outside of rendering stage',
          severity: 'high',
          suggestion: 'Move Vulkan-related code to rendering modules or use appropriate abstractions'
        });
      }

      // Check factory pattern violations
      if (suggestion.suggestedCode.includes('new ') && suggestion.suggestedCode.match(/Pipeline|Processor|Manager/)) {
        const factoryExists = this.db.prepare(`
          SELECT name FROM enhanced_symbols 
          WHERE name LIKE '%Factory%' AND kind = 'class'
        `).all() as Array<{name: string}>;

        if (factoryExists.length > 0) {
          issues.push({
            type: 'pattern_mismatch',
            description: 'Direct instantiation instead of using factory pattern',
            severity: 'medium',
            suggestion: `Use ${factoryExists[0].name} instead of direct instantiation`
          });
        }
      }
    }

    // Check for SOLID violations
    const classCount = (suggestion.suggestedCode.match(/class\s+\w+/g) || []).length;
    const methodCount = (suggestion.suggestedCode.match(/\w+\s*\(/g) || []).length;
    
    if (classCount === 1 && methodCount > 15) {
      issues.push({
        type: 'architectural_violation',
        description: 'Potential Single Responsibility Principle violation - class too large',
        severity: 'medium',
        suggestion: 'Consider breaking down the class into smaller, focused components'
      });
    }

    return issues;
  }

  /**
   * Get Gemini's intelligent analysis and correction suggestions
   */
  private async getGeminiValidation(
    suggestion: ClaudeCodeSuggestion,
    hallucinations: HallucinationDetection[],
    semanticIssues: SemanticIssue[]
  ): Promise<string> {
    const prompt = this.buildGeminiValidationPrompt(suggestion, hallucinations, semanticIssues);
    
    const context: CodeContext = {
      filePath: suggestion.filePath,
      content: suggestion.suggestedCode,
      activeTaskDescription: suggestion.userPrompt,
      ...suggestion.context
    };

    return await this.geminiTool.callGemini(prompt, context);
  }

  private buildGeminiValidationPrompt(
    suggestion: ClaudeCodeSuggestion,
    hallucinations: HallucinationDetection[],
    semanticIssues: SemanticIssue[]
  ): string {
    // Get relevant context from our semantic database
    const symbols = this.extractSymbolsFromCode(suggestion.suggestedCode);
    const contextInfo = this.gatherSemanticContextSync(symbols, suggestion.filePath);

    return `
You are a C++ code validation expert for the Planet ProcGen project. Analyze this Claude AI code suggestion using the actual semantic database context.

**User Request:** ${suggestion.userPrompt}

**Claude's Suggested Code:**
\`\`\`cpp
${suggestion.suggestedCode}
\`\`\`

**SEMANTIC DATABASE CONTEXT:**

**Available Namespaces in Codebase:**
${contextInfo.relevantNamespaces.slice(0, 20).join(', ')}

**Available Classes/Types Related to the Code:**
${contextInfo.relevantClasses.slice(0, 15).map(c => `- ${c.name}${c.namespace ? ` (${c.namespace})` : ''} in ${c.file_path}`).join('\n')}

**Available Methods Related to the Code:**
${contextInfo.relevantMethods.slice(0, 15).map(m => `- ${m.name}${m.parent_class ? `::${m.parent_class}` : ''}${m.signature ? ` ${m.signature}` : ''} in ${m.file_path}`).join('\n')}

**Available Enums/Types:**
${contextInfo.relevantTypes.slice(0, 10).map(t => `- ${t.name}${t.namespace ? ` (${t.namespace})` : ''} in ${t.file_path}`).join('\n')}

**File-Specific Context (if available):**
${contextInfo.fileContext.slice(0, 10).map(f => `- ${f.kind}: ${f.name}${f.parent_class ? `::${f.parent_class}` : ''}`).join('\n')}

**Detected Issues:**

**Hallucinations Found (${hallucinations.length}):**
${hallucinations.map(h => `- ${h.type}: ${h.item} - ${h.reason}${h.suggestedAlternative ? ` (suggest: ${h.suggestedAlternative})` : ''}${h.actualLocation ? ` from ${h.actualLocation}` : ''}`).join('\n')}

**Semantic Issues Found (${semanticIssues.length}):**
${semanticIssues.map(s => `- ${s.type} (${s.severity}): ${s.description} - ${s.suggestion}`).join('\n')}

**Your Task:**
1. Use the SEMANTIC DATABASE CONTEXT above to validate Claude's code
2. Replace any hallucinated symbols with actual ones from the database
3. Ensure namespaces, classes, and methods actually exist in the codebase
4. Maintain the Planet ProcGen architectural patterns
5. Provide working, compilable code that solves the user's request

**Guidelines:**
- ONLY use symbols that appear in the semantic database context above
- Match namespace usage patterns from the actual codebase
- Use the correct class/method names as shown in the database
- Follow existing patterns (factory usage, inheritance, etc.)
- Ensure the code actually compiles with the real Planet ProcGen codebase

**Response Format:**
RECOMMENDATION: [APPROVE/MODIFY/REJECT]
CONFIDENCE: [0.0-1.0]

ANALYSIS:
[Your detailed analysis referencing the semantic database context]

CORRECTED_CODE (if needed):
\`\`\`cpp
[Your corrected version using ONLY symbols from the semantic database]
\`\`\`

EXPLANATION:
[Explain what you changed and why, referencing the actual symbols from the database]
`;
  }

  /**
   * Synchronous version of gatherSemanticContext for Gemini prompt
   */
  private gatherSemanticContextSync(symbols: ExtractedSymbols, filePath?: string) {
    // Get relevant symbols based on what's being used in the code
    const allSymbols = this.db.prepare(`
      SELECT name, kind, namespace, parent_class, file_path, signature, return_type
      FROM enhanced_symbols 
      WHERE parser_confidence > 0.3
      ORDER BY parser_confidence DESC
    `).all() as Array<{
      name: string, kind: string, namespace: string, parent_class: string, 
      file_path: string, signature: string, return_type: string
    }>;

    // Get namespaces 
    const namespaces = this.db.prepare(`
      SELECT DISTINCT namespace FROM enhanced_symbols 
      WHERE namespace IS NOT NULL AND namespace != ''
    `).all() as Array<{namespace: string}>;

    // Filter for relevant context based on the symbols in the code
    const codeSymbols = [...symbols.classes, ...symbols.methods, ...symbols.namespaces];
    
    const relevantClasses = allSymbols.filter(s => 
      (s.kind === 'class' || s.kind === 'struct') &&
      (codeSymbols.some(cs => 
        s.name.toLowerCase().includes(cs.toLowerCase()) ||
        cs.toLowerCase().includes(s.name.toLowerCase()) ||
        this.calculateSimilarity(s.name, cs) > 0.4
      ) || 
      // Include classes from the same file
      (filePath && s.file_path.includes(filePath.split('/').pop() || '')))
    );

    const relevantMethods = allSymbols.filter(s => 
      (s.kind === 'method' || s.kind === 'function') &&
      (codeSymbols.some(cs => 
        s.name.toLowerCase().includes(cs.toLowerCase()) ||
        cs.toLowerCase().includes(s.name.toLowerCase()) ||
        this.calculateSimilarity(s.name, cs) > 0.4
      ) ||
      // Include methods from relevant classes
      relevantClasses.some(c => s.parent_class === c.name) ||
      (filePath && s.file_path.includes(filePath.split('/').pop() || '')))
    );

    const relevantTypes = allSymbols.filter(s => 
      (s.kind === 'enum' || s.kind === 'typedef' || s.kind === 'alias') &&
      codeSymbols.some(cs => 
        s.name.toLowerCase().includes(cs.toLowerCase()) ||
        cs.toLowerCase().includes(s.name.toLowerCase()) ||
        this.calculateSimilarity(s.name, cs) > 0.4
      )
    );

    const relevantNamespaces = namespaces
      .map(n => n.namespace)
      .filter(ns => 
        symbols.namespaces.some(sns => 
          ns.includes(sns) || sns.includes(ns) ||
          this.calculateSimilarity(ns, sns) > 0.5
        ) ||
        // Include common project namespaces
        ns.includes('PlanetGen') || ns.includes('Rendering') || ns.includes('Generation')
      );

    // File-specific context
    let fileContext: any[] = [];
    if (filePath) {
      fileContext = this.db.prepare(`
        SELECT name, kind, namespace, parent_class, signature 
        FROM enhanced_symbols 
        WHERE file_path LIKE ?
        ORDER BY parser_confidence DESC
        LIMIT 20
      `).all(`%${filePath.split('/').pop()}%`) as any[];
    }

    return {
      relevantClasses: relevantClasses.slice(0, 15),
      relevantMethods: relevantMethods.slice(0, 15), 
      relevantTypes: relevantTypes.slice(0, 10),
      relevantNamespaces: relevantNamespaces.slice(0, 20),
      fileContext: fileContext.slice(0, 10)
    };
  }

  private generateValidationResult(
    suggestion: ClaudeCodeSuggestion,
    hallucinations: HallucinationDetection[],
    semanticIssues: SemanticIssue[],
    geminiAnalysis: string
  ): ValidationResult {
    // Parse Gemini's response
    const recommendationMatch = geminiAnalysis.match(/RECOMMENDATION:\s*(APPROVE|MODIFY|REJECT)/i);
    const confidenceMatch = geminiAnalysis.match(/CONFIDENCE:\s*([\d.]+)/);
    const correctedCodeMatch = geminiAnalysis.match(/CORRECTED_CODE[^`]*```cpp\n([\s\S]*?)```/);
    const explanationMatch = geminiAnalysis.match(/EXPLANATION:\n([\s\S]*?)$/);

    const recommendation = recommendationMatch ? recommendationMatch[1].toLowerCase() as 'approve' | 'modify' | 'reject' : 'reject';
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
    
    const isValid = recommendation === 'approve' && hallucinations.length === 0 && 
                   semanticIssues.filter(s => s.severity === 'high' || s.severity === 'critical').length === 0;

    const corrections: string[] = [];
    hallucinations.forEach(h => {
      if (h.suggestedAlternative) {
        corrections.push(`Replace '${h.item}' with '${h.suggestedAlternative}'`);
      }
    });

    return {
      isValid,
      confidence,
      hallucinations,
      corrections,
      semanticIssues,
      recommendation,
      correctedCode: correctedCodeMatch ? correctedCodeMatch[1].trim() : undefined,
      explanation: explanationMatch ? explanationMatch[1].trim() : geminiAnalysis
    };
  }

  private async storeValidationResult(suggestion: ClaudeCodeSuggestion, result: ValidationResult): Promise<void> {
    const insertValidation = this.db.prepare(`
      INSERT INTO claude_validations 
      (session_id, user_prompt, claude_response, suggested_code, validation_result, 
       timestamp, file_path, is_valid, confidence, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const validationId = insertValidation.run(
      suggestion.sessionId,
      suggestion.userPrompt,
      suggestion.claudeResponse,
      suggestion.suggestedCode,
      JSON.stringify(result),
      suggestion.timestamp,
      suggestion.filePath || null,
      result.isValid ? 1 : 0,
      result.confidence,
      result.recommendation
    ).lastInsertRowid as number;

    // Store hallucinations
    const insertHallucination = this.db.prepare(`
      INSERT INTO hallucination_detections 
      (validation_id, type, item, reason, confidence, suggested_alternative, actual_location)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const h of result.hallucinations) {
      insertHallucination.run(
        validationId, h.type, h.item, h.reason, h.confidence, 
        h.suggestedAlternative || null, h.actualLocation || null
      );
    }

    // Store semantic issues
    const insertIssue = this.db.prepare(`
      INSERT INTO semantic_issues 
      (validation_id, type, description, severity, suggestion)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const issue of result.semanticIssues) {
      insertIssue.run(validationId, issue.type, issue.description, issue.severity, issue.suggestion);
    }
  }

  private determinePipelineStage(filePath: string): string {
    if (filePath.includes('noise')) return 'noise_generation';
    if (filePath.includes('terrain')) return 'terrain_formation';
    if (filePath.includes('atmosphere')) return 'atmospheric_dynamics';
    if (filePath.includes('geological')) return 'geological_processes';
    if (filePath.includes('ecosystem')) return 'ecosystem_simulation';
    if (filePath.includes('weather')) return 'weather_systems';
    if (filePath.includes('render') || filePath.includes('vulkan')) return 'final_rendering';
    return 'unknown';
  }

  /**
   * Get validation statistics and trends
   */
  async getValidationStats(): Promise<any> {
    const totalValidations = (this.db.prepare('SELECT COUNT(*) as count FROM claude_validations').get() as any).count;
    const approvedCount = (this.db.prepare("SELECT COUNT(*) as count FROM claude_validations WHERE recommendation = 'approve'").get() as any).count;
    const avgConfidence = (this.db.prepare('SELECT AVG(confidence) as avg FROM claude_validations').get() as any).avg;
    
    const topHallucinations = this.db.prepare(`
      SELECT type, item, COUNT(*) as count 
      FROM hallucination_detections 
      GROUP BY type, item 
      ORDER BY count DESC 
      LIMIT 10
    `).all();

    return {
      totalValidations,
      approvalRate: approvedCount / totalValidations,
      averageConfidence: avgConfidence,
      topHallucinations
    };
  }

  /**
   * Record validation feedback for learning and improvement
   */
  private async recordValidationFeedback(suggestion: ClaudeCodeSuggestion, result: ValidationResult): Promise<void> {
    try {
      // Record feedback based on validation result
      const feedbackType = result.isValid ? 'success' : 
                          result.hallucinations.length > 0 ? 'tool_failure' : 'missing_context';
      
      await this.thoughtPreserver.recordAgentFeedback({
        sessionId: suggestion.sessionId,
        agentName: 'ClaudeValidationService',
        feedbackType,
        toolName: 'claude_code_validation',
        toolParams: {
          userPrompt: suggestion.userPrompt,
          filePath: suggestion.filePath
        },
        expectedOutcome: 'Valid code without hallucinations',
        actualOutcome: result.isValid ? 'Valid code' : `Invalid: ${result.explanation}`,
        errorMessage: result.hallucinations.length > 0 ? 
          `Found ${result.hallucinations.length} hallucinations` : undefined,
        confidence: result.confidence
      });

      // Record context gaps for hallucinations
      for (const hallucination of result.hallucinations) {
        await this.thoughtPreserver.recordContextGap({
          sessionId: suggestion.sessionId,
          missingContextType: this.mapHallucinationToContextType(hallucination.type),
          description: `Hallucinated ${hallucination.type}: ${hallucination.item}`,
          requestedByAgent: 'ClaudeValidationService',
          contextQuery: hallucination.item,
          resolutionStatus: hallucination.suggestedAlternative ? 'resolved' : 'pending',
          resolvedContext: hallucination.suggestedAlternative ? {
            alternative: hallucination.suggestedAlternative,
            actualLocation: hallucination.actualLocation
          } : undefined
        });
      }

      // Record architectural decision about this validation
      await this.thoughtPreserver.recordDecision({
        type: 'dependency',
        module: suggestion.filePath || 'unknown',
        decision: `Validation ${result.recommendation} for Claude suggestion`,
        reasoning: result.explanation,
        timestamp: Date.now(),
        impact: [
          `Confidence: ${result.confidence}`,
          `Hallucinations: ${result.hallucinations.length}`,
          `Semantic Issues: ${result.semanticIssues.length}`
        ]
      });

      // If there are patterns to learn from this validation
      if (result.hallucinations.length > 0 && result.corrections.length > 0) {
        await this.thoughtPreserver.recordLearningPattern({
          patternType: 'error_recovery',
          description: 'Claude hallucination correction pattern',
          triggerConditions: {
            hallucinations: result.hallucinations.map(h => ({ type: h.type, item: h.item }))
          },
          successfulApproach: {
            corrections: result.corrections,
            correctedCode: result.correctedCode
          },
          confidenceScore: result.confidence
        });
      }
    } catch (error) {
      console.error('Error recording validation feedback:', error);
      // Don't throw - we don't want feedback recording to break validation
    }
  }

  /**
   * Map hallucination types to context gap types
   */
  private mapHallucinationToContextType(hallucinationType: string): 
    'symbol_info' | 'file_relationship' | 'architectural_pattern' | 'dependency' | 'usage_example' {
    switch (hallucinationType) {
      case 'method':
      case 'class':
      case 'namespace':
        return 'symbol_info';
      case 'include':
        return 'dependency';
      case 'template':
        return 'architectural_pattern';
      default:
        return 'usage_example';
    }
  }
}

interface ExtractedSymbols {
  methods: string[];
  classes: string[];
  namespaces: string[];
  includes: string[];
  variables: string[];
  templates: string[];
}